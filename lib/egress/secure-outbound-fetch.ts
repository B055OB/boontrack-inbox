/**
 * Outbound Egress SSRF Protection & Pinned Transport Module (Round 26 Restored Baseline)
 * Workstream: SEC-G2-C02 (BT-SEC-2026-001)
 * Target File: lib/egress/secure-outbound-fetch.ts
 */

import * as dns from 'node:dns/promises';
import * as net from 'node:net';
import { ReadableStream as WebReadableStream } from 'node:stream/web';
import {
  Agent,
  Dispatcher,
  fetch as undiciFetch,
  Headers as UndiciHeaders,
  Pool,
  Response as UndiciResponse,
} from 'undici';

export class EgressSecurityError extends Error {
  public readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(`[${code}] ${message}`);
    this.name = 'EgressSecurityError';
    this.code = code;
    if (options && 'cause' in options) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const CANONICAL_IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)$/;

export const RFC_1123_HOSTNAME_REGEX =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

const LOCAL_OR_INTERNAL_EXACT = new Set([
  'localhost',
  'local',
  'internal',
  'localhost.localdomain',
]);

const DEFAULT_BODY_IDLE_TIMEOUT_MS = 30_000;
const MIN_BODY_IDLE_TIMEOUT_MS = 100;
const MAX_BODY_IDLE_TIMEOUT_MS = 300_000;

const kInnerResponse = Symbol('boontrack.egress.kInnerResponse');

type AgentLifecycleState = 'ACTIVE' | 'CLOSING' | 'CLOSED' | 'DESTROYING' | 'DESTROYED';

interface AbandonedResponseLease {
  settled: boolean;
  liveHandles: number;
  readonly tokens: Set<object>;
}

interface AbandonedRegistryHeldValue {
  readonly lease: AbandonedResponseLease;
  readonly onAllHandlesCollected: () => void;
}

const ABANDONED_RESPONSE_REGISTRY: FinalizationRegistry<AbandonedRegistryHeldValue> | null =
  typeof FinalizationRegistry === 'function'
    ? new FinalizationRegistry<AbandonedRegistryHeldValue>((held) => {
        if (held.lease.settled) {
          return;
        }
        held.lease.liveHandles = Math.max(0, held.lease.liveHandles - 1);
        if (held.lease.liveHandles === 0) {
          held.lease.settled = true;
          held.lease.tokens.clear();
          held.onAllHandlesCollected();
        }
      })
    : null;

/**
 * Official IANA IPv4 /8 Address Space Registry Status Type (RFC 7249).
 * Source: https://www.iana.org/assignments/ipv4-address-space/ (Updated: 2025-10-10)
 * Zero UNALLOCATED blocks exist in the post-2011 IANA IPv4 /8 pool; type retains
 * UNALLOCATED for exhaustive 4-state registry fidelity.
 */
export type IanaIpv4Slash8Status = 'ALLOCATED' | 'LEGACY' | 'RESERVED' | 'UNALLOCATED';

/**
 * LAYER 1: Exhaustive 256-entry IANA IPv4 /8 Address Space Registry table (0..255).
 * Reconciled counts:
 * - RESERVED:    35 blocks (0, 10, 127, 224..239 [16], 240..255 [16])
 * - LEGACY:      92 blocks (40 in 0..63; 0 in 64..127; 47 in 128..191; 5 in 192..223)
 * - ALLOCATED:  129 blocks (22 in 0..63; 63 in 64..127; 17 in 128..191; 27 in 192..223)
 * - UNALLOCATED:  0 blocks
 * Total: 35 + 92 + 129 + 0 = 256.
 */
export const IANA_IPV4_SLASH8_STATUS: ReadonlyArray<IanaIpv4Slash8Status> = Object.freeze((() => {
  const table: IanaIpv4Slash8Status[] = new Array(256);

  for (let i = 0; i < 256; i++) {
    table[i] = 'ALLOCATED';
  }

  // Exact RESERVED /8 blocks (35 total):
  table[0] = 'RESERVED';   // IANA - Local Identification (RFC 1122 / RFC 1700)
  table[10] = 'RESERVED';  // IANA - Private Use (RFC 1918, Note [4])
  table[127] = 'RESERVED'; // IANA - Loopback (RFC 1122)
  for (let i = 224; i <= 255; i++) {
    table[i] = 'RESERVED'; // 224..239 Multicast (16) + 240..255 Future Use / Reserved (16)
  }

  // Exact LEGACY /8 blocks (92 total) per IANA IPv4 Address Space Registry (Updated 2025-10-10):
  const legacyBlocks: number[] = [
    // Band 000..063 (40 blocks):
    3, 4, 6, 7, 8, 9,
    11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22,
    25, 26, 28, 29, 30,
    32, 33, 34, 35, 38, 40, 43, 44, 45, 47, 48,
    51, 52, 53, 54, 55, 56, 57,
    // Band 064..127 (0 blocks)
    // Band 128..191 (47 blocks: 128..172 [45 consecutive], 188, 191):
    128, 129, 130, 131, 132, 133, 134, 135, 136, 137,
    138, 139, 140, 141, 142, 143, 144, 145, 146, 147,
    148, 149, 150, 151, 152, 153, 154, 155, 156, 157,
    158, 159, 160, 161, 162, 163, 164, 165, 166, 167,
    168, 169, 170, 171, 172,
    188, 191,
    // Band 192..223 (5 blocks):
    192, 196, 198, 214, 215,
  ];
  for (let i = 0; i < legacyBlocks.length; i++) {
    table[legacyBlocks[i]] = 'LEGACY';
  }

  return table;
})());

/**
 * LAYER 2: 16 inclusive unsigned 32-bit integer intervals representing IPv4 addresses
 * outside all 18 IANA IPv4 Special-Purpose Address Registry blocks (RFC 6890 / RFC 8190).
 */
export const COARSE_ELIGIBLE_IPV4_INTERVALS: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [0x01000000, 0x09ffffff], // 1.0.0.0 to 9.255.255.255
  [0x0b000000, 0x643fffff], // 11.0.0.0 to 100.63.255.255
  [0x64800000, 0x7effffff], // 100.128.0.0 to 126.255.255.255
  [0x80000000, 0xa9fdffff], // 128.0.0.0 to 169.253.255.255
  [0xa9ff0000, 0xac0fffff], // 169.255.0.0 to 172.15.255.255
  [0xac200000, 0xbfffffff], // 172.32.0.0 to 191.255.255.255
  [0xc0000100, 0xc00001ff], // 192.0.1.0 to 192.0.1.255
  [0xc0000300, 0xc01fc3ff], // 192.0.3.0 to 192.31.195.255
  [0xc01fc500, 0xc034c0ff], // 192.31.197.0 to 192.52.192.255
  [0xc034c200, 0xc05862ff], // 192.52.194.0 to 192.88.98.255
  [0xc0586400, 0xc0a7ffff], // 192.88.100.0 to 192.167.255.255
  [0xc0a90000, 0xc0af2fff], // 192.169.0.0 to 192.175.47.255
  [0xc0af3100, 0xc611ffff], // 192.175.49.0 to 198.17.255.255
  [0xc6140000, 0xc63363ff], // 198.20.0.0 to 198.51.99.255
  [0xc6336500, 0xcb0070ff], // 198.51.101.0 to 203.0.112.255
  [0xcb007200, 0xdfffffff], // 203.0.114.0 to 223.255.255.255
]);

/**
 * LAYER 3: BoonTrack IPv4 outbound egress eligibility check.
 */
export function isEligibleOutboundIp4(ip: string): boolean {
  if (typeof ip !== 'string' || !CANONICAL_IPV4_REGEX.test(ip)) {
    return false;
  }

  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  let ipInt = 0;
  for (let i = 0; i < 4; i++) {
    const octet = Number(parts[i]);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return false;
    }
    ipInt = (ipInt << 8) | octet;
  }
  const u32 = ipInt >>> 0;

  const firstOctet = (u32 >>> 24) & 0xff;
  const slash8Status = IANA_IPV4_SLASH8_STATUS[firstOctet];
  if (slash8Status !== 'ALLOCATED' && slash8Status !== 'LEGACY') {
    return false;
  }

  for (let i = 0; i < COARSE_ELIGIBLE_IPV4_INTERVALS.length; i++) {
    const [start, end] = COARSE_ELIGIBLE_IPV4_INTERVALS[i];
    if (u32 >= start && u32 <= end) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Canonical IPv6 Parser & Reconciled IANA RIR GUA Policy
// ---------------------------------------------------------------------------

export interface Ipv6PrefixDefinition {
  readonly prefix: string;
  readonly words: readonly number[];
  readonly prefixLen: number;
  readonly description: string;
}

export function matchesIpv6Prefix(
  words: readonly number[],
  prefixWords: readonly number[],
  prefixLen: number
): boolean {
  const fullWords = Math.floor(prefixLen / 16);
  const remBits = prefixLen % 16;

  for (let i = 0; i < fullWords; i++) {
    if (words[i] !== prefixWords[i]) return false;
  }

  if (remBits > 0) {
    const mask = (0xffff << (16 - remBits)) & 0xffff;
    if ((words[fullWords] & mask) !== (prefixWords[fullWords] & mask)) return false;
  }

  return true;
}

/**
 * Excluded IANA IPv6 Special-Purpose Prefixes + IANA Reserved 2d00::/8 & 2e00::/7 defense-in-depth.
 * Evaluated strictly BEFORE positive RIR allocation matching.
 */
export const EXCLUDED_IPV6_SPECIAL_PURPOSE_PREFIXES: ReadonlyArray<Ipv6PrefixDefinition> = Object.freeze([
  { prefix: '2620:4f:8000::/48', words: [0x2620, 0x004f, 0x8000, 0, 0, 0, 0, 0], prefixLen: 48, description: 'Direct Delegation AS112 Service (RFC 7534)' },
  { prefix: '2001:db8::/32',     words: [0x2001, 0x0db8, 0, 0, 0, 0, 0, 0],      prefixLen: 32, description: 'Documentation (RFC 3849)' },
  { prefix: '::/128',            words: [0, 0, 0, 0, 0, 0, 0, 0],                 prefixLen: 128, description: 'Unspecified Address (RFC 4291)' },
  { prefix: '::1/128',           words: [0, 0, 0, 0, 0, 0, 0, 1],                 prefixLen: 128, description: 'Loopback Address (RFC 4291)' },
  { prefix: '::ffff:0:0/96',     words: [0, 0, 0, 0, 0, 0xffff, 0, 0],            prefixLen: 96,  description: 'IPv4-mapped Address (RFC 4291)' },
  { prefix: '64:ff9b::/96',      words: [0x0064, 0xff9b, 0, 0, 0, 0, 0, 0],       prefixLen: 96,  description: 'IPv4-IPv6 Translation (RFC 6052)' },
  { prefix: '64:ff9b:1::/48',    words: [0x0064, 0xff9b, 0x0001, 0, 0, 0, 0, 0],  prefixLen: 48,  description: 'IPv4-IPv6 Translation Local (RFC 8215)' },
  { prefix: '100::/64',          words: [0x0100, 0, 0, 0, 0, 0, 0, 0],            prefixLen: 64,  description: 'Discard-Only Address Block (RFC 6666)' },
  { prefix: '2001::/23',         words: [0x2001, 0, 0, 0, 0, 0, 0, 0],            prefixLen: 23,  description: 'IETF Protocol Assignments (RFC 2928)' },
  { prefix: '2001::/32',         words: [0x2001, 0, 0, 0, 0, 0, 0, 0],            prefixLen: 32,  description: 'TEREDO (RFC 4380)' },
  { prefix: '2001:1::1/128',     words: [0x2001, 0x0001, 0, 0, 0, 0, 0, 1],      prefixLen: 128, description: 'Port Control Protocol Anycast (RFC 7723)' },
  { prefix: '2001:1::2/128',     words: [0x2001, 0x0001, 0, 0, 0, 0, 0, 2],      prefixLen: 128, description: 'TURN Anycast (RFC 8155)' },
  { prefix: '2001:1::3/128',     words: [0x2001, 0x0001, 0, 0, 0, 0, 0, 3],      prefixLen: 128, description: 'DNS-SD Service Registration Protocol Anycast (RFC 9665)' },
  { prefix: '2001:2::/48',       words: [0x2001, 0x0002, 0, 0, 0, 0, 0, 0],      prefixLen: 48,  description: 'Benchmarking (RFC 5180)' },
  { prefix: '2001:3::/32',       words: [0x2001, 0x0003, 0, 0, 0, 0, 0, 0],      prefixLen: 32,  description: 'AMT (RFC 7450)' },
  { prefix: '2001:4:112::/48',   words: [0x2001, 0x0004, 0x0112, 0, 0, 0, 0, 0], prefixLen: 48,  description: 'AS112-v6 (RFC 7535)' },
  { prefix: '2001:10::/28',      words: [0x2001, 0x0010, 0, 0, 0, 0, 0, 0],      prefixLen: 28,  description: 'Deprecated ORCHID (RFC 4843)' },
  { prefix: '2001:20::/28',      words: [0x2001, 0x0020, 0, 0, 0, 0, 0, 0],      prefixLen: 28,  description: 'ORCHIDv2 (RFC 7343)' },
  { prefix: '2001:30::/28',      words: [0x2001, 0x0030, 0, 0, 0, 0, 0, 0],      prefixLen: 28,  description: 'Drone Remote ID Protocol (RFC 9374)' },
  { prefix: '2002::/16',         words: [0x2002, 0, 0, 0, 0, 0, 0, 0],            prefixLen: 16,  description: '6to4 (RFC 3056)' },
  { prefix: '2d00::/8',          words: [0x2d00, 0, 0, 0, 0, 0, 0, 0],            prefixLen: 8,   description: 'IANA Reserved (removed from Round 19 GUA mistake)' },
  { prefix: '2e00::/7',          words: [0x2e00, 0, 0, 0, 0, 0, 0, 0],            prefixLen: 7,   description: 'IANA Reserved (removed Round 19 2e10::/12 mistake)' },
  { prefix: '3fff::/20',         words: [0x3fff, 0, 0, 0, 0, 0, 0, 0],            prefixLen: 20,  description: 'Reserved for Documentation (RFC 9637)' },
  { prefix: '5f00::/16',         words: [0x5f00, 0, 0, 0, 0, 0, 0, 0],            prefixLen: 16,  description: 'Segment Routing sHost (RFC 9602)' },
  { prefix: 'fc00::/7',          words: [0xfc00, 0, 0, 0, 0, 0, 0, 0],            prefixLen: 7,   description: 'Unique Local Address (RFC 4193)' },
  { prefix: 'fe80::/10',         words: [0xfe80, 0, 0, 0, 0, 0, 0, 0],            prefixLen: 10,  description: 'Link-Local Unicast (RFC 4291)' },
  { prefix: 'fec0::/10',         words: [0xfec0, 0, 0, 0, 0, 0, 0, 0],            prefixLen: 10,  description: 'Site-Local Unicast (Deprecated, RFC 3879)' },
  { prefix: 'ff00::/8',          words: [0xff00, 0, 0, 0, 0, 0, 0, 0],            prefixLen: 8,   description: 'Multicast (RFC 4291)' },
]);

/**
 * Reconciled RIR Allocations from IANA IPv6 Global Unicast Address Space Registry (34 prefixes).
 * Reference: https://www.iana.org/assignments/ipv6-unicast-address-assignments/ (Updated: 2025-10-10)
 */
export const ALLOCATED_IPV6_GUA_PREFIXES: ReadonlyArray<Ipv6PrefixDefinition> = Object.freeze([
  { prefix: '2001:200::/23',  words: [0x2001, 0x0200, 0, 0, 0, 0, 0, 0], prefixLen: 23, description: 'APNIC' },
  { prefix: '2001:400::/23',  words: [0x2001, 0x0400, 0, 0, 0, 0, 0, 0], prefixLen: 23, description: 'ARIN' },
  { prefix: '2001:600::/23',  words: [0x2001, 0x0600, 0, 0, 0, 0, 0, 0], prefixLen: 23, description: 'RIPE NCC' },
  { prefix: '2001:800::/22',  words: [0x2001, 0x0800, 0, 0, 0, 0, 0, 0], prefixLen: 22, description: 'RIPE NCC' },
  { prefix: '2001:c00::/23',  words: [0x2001, 0x0c00, 0, 0, 0, 0, 0, 0], prefixLen: 23, description: 'APNIC' },
  { prefix: '2001:e00::/23',  words: [0x2001, 0x0e00, 0, 0, 0, 0, 0, 0], prefixLen: 23, description: 'APNIC' },
  { prefix: '2001:1200::/23', words: [0x2001, 0x1200, 0, 0, 0, 0, 0, 0], prefixLen: 23, description: 'LACNIC' },
  { prefix: '2001:1400::/22', words: [0x2001, 0x1400, 0, 0, 0, 0, 0, 0], prefixLen: 22, description: 'RIPE NCC' },
  { prefix: '2001:1800::/23', words: [0x2001, 0x1800, 0, 0, 0, 0, 0, 0], prefixLen: 23, description: 'ARIN' },
  { prefix: '2001:1a00::/23', words: [0x2001, 0x1a00, 0, 0, 0, 0, 0, 0], prefixLen: 23, description: 'RIPE NCC' },
  { prefix: '2001:1c00::/22', words: [0x2001, 0x1c00, 0, 0, 0, 0, 0, 0], prefixLen: 22, description: 'RIPE NCC' },
  { prefix: '2001:2000::/19', words: [0x2001, 0x2000, 0, 0, 0, 0, 0, 0], prefixLen: 19, description: 'RIPE NCC' },
  { prefix: '2001:4000::/23', words: [0x2001, 0x4000, 0, 0, 0, 0, 0, 0], prefixLen: 23, description: 'RIPE NCC' },
  { prefix: '2001:4200::/23', words: [0x2001, 0x4200, 0, 0, 0, 0, 0, 0], prefixLen: 23, description: 'AFRINIC' },
  { prefix: '2001:4400::/23', words: [0x2001, 0x4400, 0, 0, 0, 0, 0, 0], prefixLen: 23, description: 'APNIC' },
  { prefix: '2001:4600::/23', words: [0x2001, 0x4600, 0, 0, 0, 0, 0, 0], prefixLen: 23, description: 'RIPE NCC' },
  { prefix: '2001:4800::/23', words: [0x2001, 0x4800, 0, 0, 0, 0, 0, 0], prefixLen: 23, description: 'ARIN' },
  { prefix: '2001:4a00::/23', words: [0x2001, 0x4a00, 0, 0, 0, 0, 0, 0], prefixLen: 23, description: 'RIPE NCC' },
  { prefix: '2001:4c00::/23', words: [0x2001, 0x4c00, 0, 0, 0, 0, 0, 0], prefixLen: 23, description: 'RIPE NCC' },
  { prefix: '2001:5000::/20', words: [0x2001, 0x5000, 0, 0, 0, 0, 0, 0], prefixLen: 20, description: 'RIPE NCC' },
  { prefix: '2001:8000::/19', words: [0x2001, 0x8000, 0, 0, 0, 0, 0, 0], prefixLen: 19, description: 'APNIC' },
  { prefix: '2001:a000::/20', words: [0x2001, 0xa000, 0, 0, 0, 0, 0, 0], prefixLen: 20, description: 'APNIC' },
  { prefix: '2001:b000::/20', words: [0x2001, 0xb000, 0, 0, 0, 0, 0, 0], prefixLen: 20, description: 'APNIC' },
  { prefix: '2003::/18',      words: [0x2003, 0, 0, 0, 0, 0, 0, 0],      prefixLen: 18, description: 'RIPE NCC' },
  { prefix: '2400::/12',      words: [0x2400, 0, 0, 0, 0, 0, 0, 0],      prefixLen: 12, description: 'APNIC' },
  { prefix: '2410::/12',      words: [0x2410, 0, 0, 0, 0, 0, 0, 0],      prefixLen: 12, description: 'APNIC' },
  { prefix: '2600::/12',      words: [0x2600, 0, 0, 0, 0, 0, 0, 0],      prefixLen: 12, description: 'ARIN' },
  { prefix: '2610::/23',      words: [0x2610, 0, 0, 0, 0, 0, 0, 0],      prefixLen: 23, description: 'ARIN' },
  { prefix: '2620::/23',      words: [0x2620, 0, 0, 0, 0, 0, 0, 0],      prefixLen: 23, description: 'ARIN' },
  { prefix: '2630::/12',      words: [0x2630, 0, 0, 0, 0, 0, 0, 0],      prefixLen: 12, description: 'ARIN' },
  { prefix: '2800::/12',      words: [0x2800, 0, 0, 0, 0, 0, 0, 0],      prefixLen: 12, description: 'LACNIC' },
  { prefix: '2a00::/12',      words: [0x2a00, 0, 0, 0, 0, 0, 0, 0],      prefixLen: 12, description: 'RIPE NCC' },
  { prefix: '2a10::/12',      words: [0x2a10, 0, 0, 0, 0, 0, 0, 0],      prefixLen: 12, description: 'RIPE NCC' },
  { prefix: '2c00::/12',      words: [0x2c00, 0, 0, 0, 0, 0, 0, 0],      prefixLen: 12, description: 'AFRINIC' },
]);

export function parseCanonicalIpv6(ip: string): number[] | null {
  if (typeof ip !== 'string' || !ip) return null;
  const cleanIp = ip.toLowerCase();

  if (cleanIp.startsWith(':') && !cleanIp.startsWith('::')) return null;
  if (cleanIp.endsWith(':') && !cleanIp.endsWith('::')) return null;
  if (cleanIp.includes('%') || cleanIp.includes(' ')) return null;

  const doubleColonCount = cleanIp.split('::').length - 1;
  if (doubleColonCount > 1) return null;

  if (doubleColonCount === 1) {
    const [leftPart, rightPart] = cleanIp.split('::');
    const leftTokens = leftPart ? leftPart.split(':') : [];
    const rightTokens = rightPart ? rightPart.split(':') : [];

    let embeddedIpv4Words: number[] | null = null;
    if (rightTokens.length > 0 && rightTokens[rightTokens.length - 1].includes('.')) {
      const ipv4Str = rightTokens.pop()!;
      if (!CANONICAL_IPV4_REGEX.test(ipv4Str)) return null;
      const ipv4Parts = ipv4Str.split('.').map(Number);
      if (ipv4Parts.some((o) => o < 0 || o > 255)) return null;
      embeddedIpv4Words = [
        ((ipv4Parts[0] << 8) | ipv4Parts[1]) & 0xffff,
        ((ipv4Parts[2] << 8) | ipv4Parts[3]) & 0xffff,
      ];
    }

    const totalExplicitTokens = leftTokens.length + rightTokens.length + (embeddedIpv4Words ? 2 : 0);
    if (totalExplicitTokens > 7) return null;

    const omittedCount = 8 - totalExplicitTokens;
    const words: number[] = [];

    for (const token of leftTokens) {
      if (!/^[0-9a-f]{1,4}$/.test(token)) return null;
      words.push(parseInt(token, 16));
    }
    for (let i = 0; i < omittedCount; i++) {
      words.push(0);
    }
    for (const token of rightTokens) {
      if (!/^[0-9a-f]{1,4}$/.test(token)) return null;
      words.push(parseInt(token, 16));
    }
    if (embeddedIpv4Words) {
      words.push(embeddedIpv4Words[0], embeddedIpv4Words[1]);
    }

    return words.length === 8 ? words : null;
  }

  const tokens = cleanIp.split(':');
  if (tokens.length === 7 && tokens[6].includes('.')) {
    const ipv4Str = tokens[6];
    if (!CANONICAL_IPV4_REGEX.test(ipv4Str)) return null;
    const ipv4Parts = ipv4Str.split('.').map(Number);
    if (ipv4Parts.some((o) => o < 0 || o > 255)) return null;
    const words: number[] = [];
    for (let i = 0; i < 6; i++) {
      if (!/^[0-9a-f]{1,4}$/.test(tokens[i])) return null;
      words.push(parseInt(tokens[i], 16));
    }
    words.push(((ipv4Parts[0] << 8) | ipv4Parts[1]) & 0xffff);
    words.push(((ipv4Parts[2] << 8) | ipv4Parts[3]) & 0xffff);
    return words;
  }

  if (tokens.length !== 8) return null;
  const words: number[] = [];
  for (const token of tokens) {
    if (!/^[0-9a-f]{1,4}$/.test(token)) return null;
    words.push(parseInt(token, 16));
  }
  return words;
}

/**
 * R21-F04: Strict IPv6 Eligibility Policy
 * - All ::ffff:0:0/96 IPv4-mapped IPv6 addresses are unconditionally rejected via
 *   EXCLUDED_IPV6_SPECIAL_PURPOSE_PREFIXES (zero delegation to isEligibleOutboundIp4).
 */
export function isEligibleOutboundIp6(ip: string): boolean {
  const words = parseCanonicalIpv6(ip);
  if (!words) {
    return false;
  }

  for (let i = 0; i < EXCLUDED_IPV6_SPECIAL_PURPOSE_PREFIXES.length; i++) {
    const entry = EXCLUDED_IPV6_SPECIAL_PURPOSE_PREFIXES[i];
    if (matchesIpv6Prefix(words, entry.words, entry.prefixLen)) {
      return false;
    }
  }

  for (let i = 0; i < ALLOCATED_IPV6_GUA_PREFIXES.length; i++) {
    const entry = ALLOCATED_IPV6_GUA_PREFIXES[i];
    if (matchesIpv6Prefix(words, entry.words, entry.prefixLen)) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Runtime-Immutable Header Allowlist (Baseline + TC-R6-C02-01 Contract)
// ---------------------------------------------------------------------------

export const PERMITTED_OUTBOUND_HEADERS: Readonly<Record<string, boolean>> = Object.freeze(
  Object.assign(Object.create(null), {
    'accept': true,
    'accept-encoding': true,
    'content-type': true,
    'user-agent': true,
    'if-none-match': true,
    'traceparent': true,
  })
);

export function isPermittedOutboundHeader(headerName: string): boolean {
  if (typeof headerName !== 'string') return false;
  return Object.prototype.hasOwnProperty.call(PERMITTED_OUTBOUND_HEADERS, headerName.toLowerCase());
}

// ---------------------------------------------------------------------------
// R21-F05 & R22-F06: Pure WHATWG §3.5.3 Non-Canonical & Malformed IPv4/IPv6 Literal Detection
// (Zero new URL() invocation -> zero credential/path/query parsing ambiguity)
// ---------------------------------------------------------------------------

const URL_STRUCTURAL_OR_CONTROL_REGEX = /[\s/?#@\\\x00-\x1f\x7f]/;
const IPV4_PART_HEX_REGEX = /^0[xX][0-9a-fA-F]*$/;
const IPV4_PART_OCTAL_REGEX = /^0[0-7]+$/;
const IPV4_PART_DEC_REGEX = /^(?:0|[1-9]\d*)$/;
const DOTTED_QUAD_NUMERIC_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const IPV4_LIKE_NUMERIC_OR_HEX_PART_REGEX = /^(?:\d+|0[xX][0-9a-fA-F]*)$/;

function parseWhatwgIpv4Part(part: string): bigint | null {
  if (!part) return null;
  if (IPV4_PART_HEX_REGEX.test(part)) {
    if (part.length === 2) return BigInt(0);
    try {
      return BigInt(part);
    } catch {
      return null;
    }
  }
  if (IPV4_PART_OCTAL_REGEX.test(part)) {
    try {
      return BigInt(`0o${part.slice(1)}`);
    } catch {
      return null;
    }
  }
  if (IPV4_PART_DEC_REGEX.test(part)) {
    try {
      return BigInt(part);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Pure lexical recognizer for WHATWG URL Standard §3.5.3 IPv4 literals AND
 * R22-F06 malformed/overflow numeric IPv4 forms (e.g. '256.1', '08.1', '4294967296', '0x100000000').
 */
function isWhatwgIpv4Literal(candidate: string): boolean {
  if (!candidate || URL_STRUCTURAL_OR_CONTROL_REGEX.test(candidate)) {
    return false;
  }

  const normalized = candidate.endsWith('.') ? candidate.slice(0, -1) : candidate;
  if (!normalized || normalized.endsWith('.')) {
    return false;
  }

  const parts = normalized.split('.');
  if (parts.length < 1 || parts.length > 4) {
    return false;
  }

  // R22-F06: Any 1..4 part hostname where EVERY dot-separated label is purely decimal digits
  // or 0x/0X hex digits (including out-of-range octets like 256.1, non-octal 08.1, or >2^32)
  // is a numeric IPv4 literal attempt and never a valid RFC 1123 domain name.
  if (parts.every((part) => part.length > 0 && IPV4_LIKE_NUMERIC_OR_HEX_PART_REGEX.test(part))) {
    return true;
  }

  const numbers: bigint[] = [];
  for (let i = 0; i < parts.length; i++) {
    const parsed = parseWhatwgIpv4Part(parts[i]);
    if (parsed === null) {
      return false;
    }
    numbers.push(parsed);
  }

  const maxOctet = BigInt(255);
  for (let i = 0; i < numbers.length - 1; i++) {
    if (numbers[i] > maxOctet) {
      return false;
    }
  }

  const shiftBits = BigInt(8 * (5 - numbers.length));
  const lastLimit = BigInt(1) << shiftBits;
  return numbers[numbers.length - 1] < lastLimit;
}

/**
 * Safe for BOTH post-URL-parse calls AND direct standalone calls.
 * Never invokes new URL(), never accepts credentials/path/query/fragment strings.
 */
export function isIpLiteralHostname(hostname: string): boolean {
  if (typeof hostname !== 'string' || !hostname) return false;
  if (URL_STRUCTURAL_OR_CONTROL_REGEX.test(hostname)) return false;

  const isBracketed = hostname.startsWith('[') && hostname.endsWith(']');
  if (hostname.startsWith('[') || hostname.endsWith(']')) {
    return isBracketed && hostname.length > 2;
  }

  const lower = hostname.toLowerCase();

  if (net.isIPv4(lower) || net.isIPv6(lower) || parseCanonicalIpv6(lower) !== null) {
    return true;
  }
  const zoneIdx = lower.indexOf('%');
  if (zoneIdx > 0) {
    const withoutZone = lower.slice(0, zoneIdx);
    if (net.isIPv6(withoutZone) || parseCanonicalIpv6(withoutZone) !== null) {
      return true;
    }
  }

  if (lower.startsWith('::ffff:') || lower.startsWith('ffff:')) {
    return true;
  }
  if (lower.indexOf(':') !== -1 && lower.indexOf(':') !== lower.lastIndexOf(':')) {
    return true;
  }

  if (DOTTED_QUAD_NUMERIC_REGEX.test(lower)) {
    return true;
  }

  return isWhatwgIpv4Literal(lower);
}

// ---------------------------------------------------------------------------
// R21-F05 & R21-F08: Outbound Target URL Validation (Strict HTTPS + Port 443)
// ---------------------------------------------------------------------------

export function validateOutboundTargetUrl(inputUrl: string | URL): URL {
  let rawStr: string;
  if (inputUrl instanceof URL) {
    rawStr = inputUrl.toString();
  } else if (typeof inputUrl === 'string') {
    rawStr = inputUrl.trim();
  } else {
    throw new EgressSecurityError(
      'INVALID_URL_SYNTAX',
      'Outbound URL must be a non-empty string or URL instance'
    );
  }

  if (!rawStr || /[\x00-\x1f\x7f]/.test(rawStr)) {
    throw new EgressSecurityError(
      'INVALID_URL_SYNTAX',
      'Outbound URL must be non-empty without control characters'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawStr);
  } catch (err) {
    throw new EgressSecurityError('INVALID_URL_SYNTAX', `Failed to parse URL: ${rawStr}`, {
      cause: err,
    });
  }

  // 1. Strict HTTPS scheme
  if (parsed.protocol !== 'https:') {
    throw new EgressSecurityError(
      'EGRESS_HTTPS_REQUIRED',
      `Only HTTPS egress connections are permitted; received '${parsed.protocol}'`
    );
  }

  // 2. R21-F08: Strict default HTTPS port 443 policy (rejects non-443 ports)
  if (parsed.port !== '' && parsed.port !== '443') {
    throw new EgressSecurityError(
      'EGRESS_PORT_PROHIBITED',
      `Outbound port '${parsed.port}' is prohibited; only default HTTPS port 443 is permitted`
    );
  }

  // 3. Reject embedded URL credentials
  if (parsed.username || parsed.password) {
    throw new EgressSecurityError(
      'URL_CREDENTIALS_PROHIBITED',
      'Embedded username or password in URL is strictly prohibited'
    );
  }

  // 4. Reject empty or IP-literal hostnames
  const rawHostname = parsed.hostname.toLowerCase();
  if (!rawHostname) {
    throw new EgressSecurityError('EMPTY_HOSTNAME', 'Target URL hostname cannot be empty');
  }

  if (isIpLiteralHostname(rawHostname)) {
    throw new EgressSecurityError(
      'IP_LITERAL_URL_PROHIBITED',
      `Direct IP-literal egress targets (${rawHostname}) are strictly prohibited; target must be an RFC 1123 FQDN`
    );
  }

  // 5. Reject local/internal hostnames (strip 1+ trailing dots for classification)
  const hostNoTrailingDots = rawHostname.replace(/\.+$/, '');
  if (
    LOCAL_OR_INTERNAL_EXACT.has(hostNoTrailingDots) ||
    hostNoTrailingDots.endsWith('.localhost') ||
    hostNoTrailingDots.endsWith('.local') ||
    hostNoTrailingDots.endsWith('.internal') ||
    hostNoTrailingDots.endsWith('.localdomain')
  ) {
    throw new EgressSecurityError(
      'INVALID_HOSTNAME',
      `Local or internal hostname '${rawHostname}' is prohibited for outbound egress`
    );
  }

  // 6. Reject trailing dots, oversized hostnames, underscores, single-label hosts, invalid RFC 1123
  if (
    rawHostname.endsWith('.') ||
    rawHostname.length > 253 ||
    !RFC_1123_HOSTNAME_REGEX.test(rawHostname)
  ) {
    throw new EgressSecurityError(
      'INVALID_HOSTNAME',
      `Hostname '${rawHostname}' violates RFC 1123 multi-label FQDN syntax`
    );
  }

  const labels = rawHostname.split('.');
  if (/^\d+$/.test(labels[labels.length - 1])) {
    throw new EgressSecurityError(
      'INVALID_HOSTNAME',
      `Hostname '${rawHostname}' cannot terminate with an all-numeric TLD`
    );
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// R21-F03: Abort Error Normalization Helper
// ---------------------------------------------------------------------------

function createAbortSecurityError(stage: string, rawReason: unknown): EgressSecurityError {
  if (rawReason instanceof EgressSecurityError && rawReason.code === 'REQUEST_ABORTED') {
    return rawReason;
  }
  return new EgressSecurityError('REQUEST_ABORTED', `Outbound request aborted (${stage})`, {
    cause: rawReason,
  });
}

function isAbortLikeError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: unknown; code?: unknown; cause?: unknown };
  if (e.name === 'AbortError' || e.code === 'ABORT_ERR') return true;
  if (e.cause && typeof e.cause === 'object') {
    const c = e.cause as { name?: unknown; code?: unknown };
    if (c.name === 'AbortError' || c.code === 'ABORT_ERR') return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// R21-F02 & R21-F08: Response Metadata, Immutable Headers, & Clone Ownership
// ---------------------------------------------------------------------------

interface ResponseMetadataBinding {
  readonly url: string;
  readonly type: UndiciResponse['type'];
  readonly redirected: boolean;
  readonly headers: UndiciHeaders;
  readonly innerResponse: UndiciResponse;
  readonly lease: AbandonedResponseLease;
  readonly heldEntry: AbandonedRegistryHeldValue;
}

function registerResponseHandle(
  target: UndiciResponse,
  lease: AbandonedResponseLease,
  heldEntry: AbandonedRegistryHeldValue
): void {
  if (!ABANDONED_RESPONSE_REGISTRY || lease.settled) {
    return;
  }
  const token = Object.create(null) as object;
  lease.tokens.add(token);
  ABANDONED_RESPONSE_REGISTRY.register(target, heldEntry, token);
}

function attachResponseMetadata(
  target: UndiciResponse,
  meta: ResponseMetadataBinding
): UndiciResponse {
  const originalClone = target.clone;
  Object.defineProperties(target, {
    [kInnerResponse]: {
      value: meta.innerResponse,
      enumerable: false,
      configurable: false,
      writable: false,
    },
    url: {
      get: () => meta.url,
      enumerable: true,
      configurable: true,
    },
    type: {
      get: () => meta.type,
      enumerable: true,
      configurable: true,
    },
    redirected: {
      get: () => meta.redirected,
      enumerable: true,
      configurable: true,
    },
    headers: {
      get: () => meta.headers,
      enumerable: true,
      configurable: true,
    },
    clone: {
      value: function cloneWithPreservedMetadata(this: UndiciResponse): UndiciResponse {
        const cloned = originalClone.call(this);
        if (!meta.lease.settled) {
          meta.lease.liveHandles += 1;
          registerResponseHandle(cloned, meta.lease, meta.heldEntry);
        }
        return attachResponseMetadata(cloned, meta);
      },
      writable: true,
      enumerable: true,
      configurable: true,
    },
  });
  return target;
}

// ---------------------------------------------------------------------------
// R21-F01..F04, R22-F01..F05, R23-F01: Secure Outbound Fetch
// ---------------------------------------------------------------------------

export interface SecureOutboundFetchOptions {
  readonly method?: 'GET' | 'POST' | 'HEAD';
  readonly headers?: Record<string, string>;
  readonly body?: string | Buffer | Uint8Array;
  readonly signal?: AbortSignal;
  /**
   * Optional bounded idle timeout (ms) for an unconsumed/stalled response body.
   * Defaults to 30000ms (valid range: 100..300000). Timer is .unref()'d.
   */
  readonly bodyIdleTimeoutMs?: number;
}

export async function executeSecureOutboundFetch(
  url: string | URL,
  options: SecureOutboundFetchOptions = {}
): Promise<UndiciResponse> {
  const validatedUrl = validateOutboundTargetUrl(url);
  const expectedHostname = validatedUrl.hostname.trim().toLowerCase();
  const requestMethod = (options.method || 'GET').toUpperCase() as 'GET' | 'POST' | 'HEAD';

  const bodyIdleTimeoutMs = options.bodyIdleTimeoutMs ?? DEFAULT_BODY_IDLE_TIMEOUT_MS;
  if (
    !Number.isInteger(bodyIdleTimeoutMs) ||
    bodyIdleTimeoutMs < MIN_BODY_IDLE_TIMEOUT_MS ||
    bodyIdleTimeoutMs > MAX_BODY_IDLE_TIMEOUT_MS
  ) {
    throw new EgressSecurityError(
      'INVALID_TIMEOUT_OPTION',
      `bodyIdleTimeoutMs must be an integer between ${MIN_BODY_IDLE_TIMEOUT_MS} and ${MAX_BODY_IDLE_TIMEOUT_MS}`
    );
  }

  // Validate and filter headers against runtime-immutable allowlist
  const sanitizedHeaders: Record<string, string> = Object.create(null);
  if (options.headers && typeof options.headers === 'object') {
    for (const [key, value] of Object.entries(options.headers)) {
      if (/[\r\n\0]/.test(key) || /[\r\n\0]/.test(String(value))) {
        throw new EgressSecurityError(
          'INVALID_HEADER_VALUE',
          `Header '${key}' contains forbidden control or CRLF characters`
        );
      }
      const lowerKey = key.toLowerCase();
      if (
        lowerKey === 'host' ||
        lowerKey === ':authority' ||
        lowerKey.startsWith('x-forwarded-') ||
        lowerKey === 'forwarded'
      ) {
        throw new EgressSecurityError(
          'AUTHORITY_OVERRIDE_PROHIBITED',
          `Header '${key}' is prohibited from client override`
        );
      }
      if (isPermittedOutboundHeader(lowerKey)) {
        sanitizedHeaders[lowerKey] = String(value).trim();
      }
    }
  }

  // R21-F03: Pre-dispatch abort check (normalized EgressSecurityError)
  if (options.signal?.aborted) {
    throw createAbortSecurityError('pre-dispatch', options.signal.reason);
  }

  const trackedDispatchers = new Set<Dispatcher>();

  const pinnedLookup: net.LookupFunction = (hostname, lookupOpts, callback) => {
    void (async () => {
      try {
        const requestedHost = (hostname || '').trim().toLowerCase();
        if (requestedHost !== expectedHostname) {
          return callback(
            new EgressSecurityError(
              'EGRESS_HOSTNAME_MISMATCH',
              `Connector target '${requestedHost}' does not match expected target '${expectedHostname}'`
            ) as unknown as NodeJS.ErrnoException,
            '',
            4
          );
        }

        const records = await dns.lookup(expectedHostname, { all: true, verbatim: true });
        if (!records || records.length === 0) {
          return callback(
            new EgressSecurityError(
              'SSRF_EMPTY_DNS_RESPONSE',
              `DNS resolution for '${expectedHostname}' returned zero records`
            ) as unknown as NodeJS.ErrnoException,
            '',
            4
          );
        }

        for (let i = 0; i < records.length; i++) {
          const rec = records[i];
          if (!rec || typeof rec.address !== 'string' || !net.isIP(rec.address)) {
            return callback(
              new EgressSecurityError(
                'SSRF_UNPARSEABLE_IP_ADDRESS',
                `DNS returned unparseable address record for '${expectedHostname}'`
              ) as unknown as NodeJS.ErrnoException,
              '',
              4
            );
          }

          // R21-F04: Strict family-to-address validation; IPv4 only on family 4, IPv6 (no ::ffff:0:0/96) only on family 6
          const isEligible =
            rec.family === 4
              ? net.isIPv4(rec.address) && isEligibleOutboundIp4(rec.address)
              : rec.family === 6
                ? net.isIPv6(rec.address) && isEligibleOutboundIp6(rec.address)
                : false;

          if (!isEligible) {
            return callback(
              new EgressSecurityError(
                'SSRF_NON_GLOBAL_OR_MIXED_DNS_RECORDS',
                `SSRF_NON_GLOBAL_OR_MIXED_DNS_RECORDS: IP ${rec.address} (family=${rec.family}) is prohibited by egress security policy`
              ) as unknown as NodeJS.ErrnoException,
              '',
              4
            );
          }
        }

        const pinned = records[0];
        if (lookupOpts && lookupOpts.all) {
          return callback(null, [{ address: pinned.address, family: pinned.family }]);
        }
        return callback(null, pinned.address, pinned.family);
      } catch (err) {
        return callback(
          (err instanceof Error ? err : new Error(String(err))) as NodeJS.ErrnoException,
          '',
          4
        );
      }
    })();
  };

  const agent = new Agent({
    maxRedirections: 0,
    factory: (origin, opts) => {
      const pool = new Pool(origin, opts as Pool.Options);
      trackedDispatchers.add(pool);
      return pool;
    },
    connect: {
      lookup: pinnedLookup,
      rejectUnauthorized: true,
    },
  });

  // -------------------------------------------------------------------------
  // R22-F01 / R23-F01: Race-Safe Transport-First Teardown & Lifecycle State Machine
  // -------------------------------------------------------------------------
  let lifecycleState: AgentLifecycleState = 'ACTIVE';
  let closePromise: Promise<void> | null = null;
  let destroyPromise: Promise<void> | null = null;
  let destroyRequested = false;
  let abortTriggered = false;
  let rawAbortReason: unknown = undefined;
  let abortError: EgressSecurityError | null = null;
  let listenerDetached = false;
  let cancellationDispatched = false;
  let onAbort: (() => void) | null = null;

  let notifyDestroyRequested: (() => void) | null = null;
  const destroyRequestedPromise = new Promise<void>((resolve) => {
    notifyDestroyRequested = resolve;
  });

  let rawBodyRef: WeakRef<WebReadableStream<Uint8Array>> | null = null;
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let streamControllerRef: WeakRef<ReadableStreamDefaultController<Uint8Array>> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const lease: AbandonedResponseLease = {
    settled: false,
    liveHandles: 1,
    tokens: new Set<object>(),
  };

  const unregisterAllGcTokens = (): void => {
    lease.settled = true;
    if (ABANDONED_RESPONSE_REGISTRY && lease.tokens.size > 0) {
      for (const token of lease.tokens) {
        ABANDONED_RESPONSE_REGISTRY.unregister(token);
      }
    }
    lease.tokens.clear();
  };

  const clearIdleTimer = (): void => {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const detachAbortListener = (): void => {
    if (!listenerDetached && options.signal && onAbort) {
      listenerDetached = true;
      options.signal.removeEventListener('abort', onAbort);
    }
    onAbort = null;
  };

  const releaseReaderSafe = (): void => {
    const reader = activeReader;
    activeReader = null;
    if (reader) {
      try {
        reader.releaseLock();
      } catch {
        // Ignore if reader already released
      }
    }
  };

  /**
   * R23-F01 Path 1b: Non-blocking, best-effort raw Response.body cancellation for pre-wrap paths
   * (post-headers abort, 3xx guard, 204/205/HEAD null-body guard).
   */
  const cancelRawResponseBodyBestEffort = (
    targetBody: WebReadableStream<Uint8Array> | null | undefined,
    reason?: unknown
  ): void => {
    if (!targetBody || targetBody.locked || cancellationDispatched) {
      return;
    }
    cancellationDispatched = true;
    try {
      void Promise.resolve(targetBody.cancel(reason)).catch(() => undefined);
    } catch {
      // Absorb synchronous throw from mocked/broken body.cancel()
    }
  };

  /**
   * R23-F01 Path 1a: Non-blocking, synchronous-clear stream/reader cancellation.
   * - Clears activeReader = null synchronously BEFORE invoking reader.cancel(reason).
   * - Returns void so NO caller can await stream cancellation before Agent teardown.
   */
  const cancelUnderlyingBodySafe = (reason: unknown): void => {
    const reader = activeReader;
    activeReader = null;
    if (reader) {
      cancellationDispatched = true;
      try {
        void Promise.resolve(reader.cancel(reason))
          .catch(() => undefined)
          .finally(() => {
            try {
              reader.releaseLock();
            } catch {
              // Ignore if already released
            }
          });
      } catch {
        try {
          reader.releaseLock();
        } catch {
          // Ignore synchronous throw during cancel/release
        }
      }
      return;
    }

    const rawBody = rawBodyRef?.deref();
    if (rawBody && !rawBody.locked && !cancellationDispatched) {
      cancellationDispatched = true;
      try {
        void Promise.resolve(rawBody.cancel(reason)).catch(() => undefined);
      } catch {
        // Absorb synchronous throw from mocked/broken stream.cancel()
      }
    }
  };

  const destroyDispatcherSafe = (target: { destroy: () => Promise<void> }): Promise<void> => {
    try {
      return Promise.resolve(target.destroy()).catch(() => undefined);
    } catch {
      return Promise.resolve();
    }
  };

  /**
   * Idempotent forced teardown of Agent + all tracked child Pools.
   * - Never awaits stream/reader cancellation (R23-F01).
   * - Initiates agent.destroy() + tracked Pool.destroy() BEFORE calling detachAbortListener().
   */
  const forceDestroyAgent = (): Promise<void> => {
    destroyRequested = true;
    notifyDestroyRequested?.();
    clearIdleTimer();
    unregisterAllGcTokens();

    if (destroyPromise !== null) {
      detachAbortListener();
      return destroyPromise;
    }
    if (lifecycleState === 'CLOSED' || lifecycleState === 'DESTROYED') {
      detachAbortListener();
      return Promise.resolve();
    }

    lifecycleState = 'DESTROYING';
    const children = Array.from(trackedDispatchers);
    trackedDispatchers.clear();

    destroyPromise = Promise.all([
      destroyDispatcherSafe(agent),
      ...children.map((child) => destroyDispatcherSafe(child)),
    ]).then(() => {
      lifecycleState = 'DESTROYED';
    });

    detachAbortListener();
    return destroyPromise;
  };

  /**
   * R22-F01: Race-safe graceful Agent.close() with instant destroy escalation.
   * Keeps AbortSignal listener attached while CLOSING and detaches strictly in `finally`.
   */
  const cleanupAgent = (forceDestroy: boolean): Promise<void> => {
    clearIdleTimer();
    unregisterAllGcTokens();

    if (forceDestroy || destroyRequested || options.signal?.aborted) {
      return forceDestroyAgent();
    }
    if (lifecycleState === 'CLOSED' || lifecycleState === 'DESTROYED') {
      detachAbortListener();
      return Promise.resolve();
    }
    if (closePromise !== null) {
      return closePromise;
    }

    lifecycleState = 'CLOSING';
    closePromise = (async () => {
      let closeFailed = false;
      try {
        await Promise.race([
          agent.close().catch(() => {
            closeFailed = true;
            destroyRequested = true;
          }),
          destroyRequestedPromise,
        ]);

        if (closeFailed || destroyRequested || options.signal?.aborted) {
          await forceDestroyAgent();
        } else {
          lifecycleState = 'CLOSED';
          trackedDispatchers.clear();
        }
      } catch {
        await forceDestroyAgent();
      } finally {
        detachAbortListener();
      }
    })();

    return closePromise;
  };

  if (options.signal) {
    onAbort = () => {
      destroyRequested = true;
      abortTriggered = true;
      rawAbortReason = options.signal?.reason;
      abortError = createAbortSecurityError('mid-stream', rawAbortReason);
      notifyDestroyRequested?.();
      clearIdleTimer();
      unregisterAllGcTokens();
      const ctrl = streamControllerRef?.deref();
      if (ctrl) {
        try {
          ctrl.error(abortError);
        } catch {
          // Stream may already be closed or errored concurrently
        }
      }
      // R23-F01: initiate Agent teardown BEFORE cancelling body & BEFORE detaching listener
      const teardownTask = forceDestroyAgent();
      cancelUnderlyingBodySafe(abortError);
      void teardownTask;
    };
    options.signal.addEventListener('abort', onAbort, { once: true });
  }

  let response: UndiciResponse;
  try {
    response = await undiciFetch(validatedUrl.toString(), {
      dispatcher: agent as Dispatcher,
      method: requestMethod,
      headers: sanitizedHeaders,
      body: options.body,
      signal: options.signal,
      redirect: 'error',
    });
  } catch (err: any) {
    // R22-F04: Snapshot abort state BEFORE awaiting async forceDestroyAgent()
    const abortedBeforeDestroy =
      abortTriggered || Boolean(options.signal?.aborted) || isAbortLikeError(err);

    await forceDestroyAgent();

    // Precedence 1 (R22-F02): Explicit Security Policy Violations
    const isRedirectError =
      err?.code === 'UNDICI_ERR_REDIRECT_NOT_ALLOWED' ||
      err?.cause?.code === 'UNDICI_ERR_REDIRECT_NOT_ALLOWED' ||
      err?.message === 'unexpected redirect' ||
      err?.cause?.message === 'unexpected redirect';

    if (isRedirectError) {
      throw new EgressSecurityError(
        'EGRESS_REDIRECT_FORBIDDEN',
        'HTTP redirect is strictly prohibited by egress security policy',
        { cause: err }
      );
    }

    if (err instanceof EgressSecurityError || err?.cause instanceof EgressSecurityError) {
      throw err;
    }

    // Precedence 2 (R21-F03 / R22-F04): Pre-teardown In-Flight Abort
    if (abortedBeforeDestroy) {
      const reason = rawAbortReason !== undefined ? rawAbortReason : (options.signal?.reason ?? err);
      throw createAbortSecurityError('in-flight', reason);
    }

    // Precedence 3: Unrelated Transport / Network Errors preserved intact
    throw err;
  }

  // R23-F01 Path 2: Post-headers abort check (transport teardown BEFORE non-blocking cancellation)
  if (abortTriggered || options.signal?.aborted) {
    const reason = rawAbortReason !== undefined ? rawAbortReason : options.signal?.reason;
    const err = createAbortSecurityError('post-headers', reason);
    const teardownTask = forceDestroyAgent();
    cancelRawResponseBodyBestEffort(response.body as WebReadableStream<Uint8Array> | null, err);
    await teardownTask;
    throw err;
  }

  // R23-F01 Path 3: Fail-closed 3xx boundary assertion (transport teardown BEFORE non-blocking cancellation)
  // (UD-06 Gate: excludes 304 ONLY if CTO explicitly ratifies UD-06 Option B)
  if (response.status >= 300 && response.status < 400) {
    const teardownTask = forceDestroyAgent();
    cancelRawResponseBodyBestEffort(response.body as WebReadableStream<Uint8Array> | null);
    await teardownTask;
    throw new EgressSecurityError(
      'EGRESS_REDIRECT_FORBIDDEN',
      `HTTP redirect (${response.status}) is strictly prohibited`
    );
  }

  // R23-F01 Path 4: Null-body guard for HTTP 204, 205, HEAD (and !response.body)
  if (
    !response.body ||
    response.status === 204 ||
    response.status === 205 ||
    requestMethod === 'HEAD'
  ) {
    const rawNullCandidate = response.body as WebReadableStream<Uint8Array> | null;
    const closeTask = cleanupAgent(false);
    if (rawNullCandidate) {
      cancelRawResponseBodyBestEffort(rawNullCandidate);
    }
    await closeTask;
    if (abortTriggered || options.signal?.aborted) {
      const reason = rawAbortReason !== undefined ? rawAbortReason : options.signal?.reason;
      throw createAbortSecurityError('post-headers-close', reason);
    }
    if (rawNullCandidate && response.status >= 200 && response.status <= 599) {
      try {
        const cleanNullResponse = new UndiciResponse(null, {
          status: response.status,
          statusText: response.statusText ?? '',
          headers: response.headers,
        });
        return attachResponseMetadata(cleanNullResponse, {
          url: response.url || validatedUrl.toString(),
          type: response.type ?? 'default',
          redirected: Boolean(response.redirected),
          headers: response.headers,
          innerResponse: response,
          lease,
          heldEntry: { lease, onAllHandlesCollected: () => undefined },
        });
      } catch {
        return response;
      }
    }
    return response;
  }

  const rawBody = response.body as WebReadableStream<Uint8Array>;
  rawBodyRef = new WeakRef(rawBody);

  const armIdleTimer = (): void => {
    clearIdleTimer();
    if (destroyRequested || lease.settled) {
      return;
    }
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (destroyRequested || lease.settled) {
        return;
      }
      destroyRequested = true;
      notifyDestroyRequested?.();
      const timeoutErr = new EgressSecurityError(
        'RESPONSE_BODY_ABANDONED_TIMEOUT',
        `Outbound response body remained unconsumed/idle for ${bodyIdleTimeoutMs}ms; transport forcibly destroyed`
      );
      unregisterAllGcTokens();
      const ctrl = streamControllerRef?.deref();
      if (ctrl) {
        try {
          ctrl.error(timeoutErr);
        } catch {
          // Stream already closed or errored
        }
      }
      const teardownTask = forceDestroyAgent();
      cancelUnderlyingBodySafe(timeoutErr);
      void teardownTask;
    }, bodyIdleTimeoutMs);

    if (typeof idleTimer === 'object' && idleTimer !== null && 'unref' in idleTimer) {
      (idleTimer as NodeJS.Timeout).unref();
    }
  };

  try {
    const safeBodyStream = new WebReadableStream<Uint8Array>(
      {
        start(controller) {
          streamControllerRef = new WeakRef(controller);
          if (abortTriggered || options.signal?.aborted) {
            const err =
              abortError ??
              createAbortSecurityError(
                'stream-start',
                rawAbortReason !== undefined ? rawAbortReason : options.signal?.reason
              );
            try {
              controller.error(err);
            } catch {
              // Already settled
            }
            const teardownTask = forceDestroyAgent();
            cancelUnderlyingBodySafe(err);
            void teardownTask;
            return;
          }
          armIdleTimer();
        },
        async pull(controller) {
          // R23-F01 Path 5: pull() pre-read abort check (teardown BEFORE non-blocking cancellation)
          if (abortTriggered || options.signal?.aborted) {
            const err =
              abortError ??
              createAbortSecurityError(
                'mid-stream',
                rawAbortReason !== undefined ? rawAbortReason : options.signal?.reason
              );
            const teardownTask = forceDestroyAgent();
            cancelUnderlyingBodySafe(err);
            await teardownTask;
            try {
              controller.error(err);
            } catch {
              // Already errored
            }
            return;
          }

          if (destroyRequested) {
            const teardownTask = forceDestroyAgent();
            cancelUnderlyingBodySafe(abortError ?? new Error('Transport destroyed'));
            await teardownTask;
            return;
          }

          armIdleTimer();

          if (!activeReader) {
            activeReader = rawBody.getReader();
          }

          try {
            const { done, value } = await activeReader.read();
            // R23-F01 Path 6: pull() post-read abort check (teardown BEFORE non-blocking cancellation)
            if (abortTriggered || options.signal?.aborted) {
              const err =
                abortError ??
                createAbortSecurityError(
                  'mid-stream',
                  rawAbortReason !== undefined ? rawAbortReason : options.signal?.reason
                );
              const teardownTask = forceDestroyAgent();
              cancelUnderlyingBodySafe(err);
              await teardownTask;
              try {
                controller.error(err);
              } catch {
                // Already errored
              }
              return;
            }
            if (destroyRequested) {
              const teardownTask = forceDestroyAgent();
              cancelUnderlyingBodySafe(abortError ?? new Error('Transport destroyed'));
              await teardownTask;
              return;
            }

            if (done) {
              releaseReaderSafe();
              await cleanupAgent(false);
              if (abortTriggered || destroyRequested || options.signal?.aborted) {
                const err =
                  abortError ??
                  createAbortSecurityError(
                    'mid-stream-close',
                    rawAbortReason !== undefined ? rawAbortReason : options.signal?.reason
                  );
                try {
                  controller.error(err);
                } catch {
                  // Already errored/closed
                }
                return;
              }
              controller.close();
            } else {
              armIdleTimer();
              if (value) {
                controller.enqueue(value);
              }
            }
          } catch (err) {
            // R22-F04: Snapshot abort state BEFORE awaiting forceDestroyAgent()
            const abortedBeforeDestroy =
              abortTriggered || Boolean(options.signal?.aborted) || isAbortLikeError(err);

            const teardownTask = forceDestroyAgent();
            releaseReaderSafe();
            await teardownTask;

            const finalErr = abortedBeforeDestroy
              ? abortError ??
                createAbortSecurityError(
                  'mid-stream',
                  rawAbortReason !== undefined ? rawAbortReason : (options.signal?.reason ?? err)
                )
              : err;
            try {
              controller.error(finalErr);
            } catch {
              // Stream already closed or errored
            }
          }
        },
        async cancel(reason) {
          // R23-F01 Path 7: safeBodyStream.cancel() (teardown FIRST; abort listener kept active until initiated)
          destroyRequested = true;
          notifyDestroyRequested?.();
          clearIdleTimer();
          unregisterAllGcTokens();
          const teardownTask = forceDestroyAgent();
          cancelUnderlyingBodySafe(reason);
          await teardownTask;
        },
      },
      { highWaterMark: 0 }
    );

    const wrappedResponse = new UndiciResponse(safeBodyStream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    const gcHeldEntry: AbandonedRegistryHeldValue = {
      lease,
      onAllHandlesCollected: () => {
        clearIdleTimer();
        const teardownTask = forceDestroyAgent();
        cancelUnderlyingBodySafe('Response abandoned and garbage collected');
        void teardownTask;
      },
    };

    registerResponseHandle(wrappedResponse, lease, gcHeldEntry);

    return attachResponseMetadata(wrappedResponse, {
      url: response.url || validatedUrl.toString(),
      type: response.type,
      redirected: response.redirected,
      headers: response.headers,
      innerResponse: response,
      lease,
      heldEntry: gcHeldEntry,
    });
  } catch (err) {
    // R23-F01 Path 8: Synchronous constructor error catch (teardown BEFORE cancellation)
    clearIdleTimer();
    unregisterAllGcTokens();
    const teardownTask = forceDestroyAgent();
    cancelUnderlyingBodySafe(err);
    await teardownTask;
    throw err;
  }
}

/** Baseline compatibility export alias (`lib/egress/secure-outbound-fetch.ts:285`). */
export const secureOutboundFetch = executeSecureOutboundFetch;
