/**
 * workforce-web/lib/auth/rate-limiter.ts
 *
 * Dedicated Brute-Force Rate Limiter for BWM (Boon Workforce Management) Authentication.
 * Addresses BLOCKER-CRED-01: Protects against credential stuffing and PIN brute-force attacks.
 *
 * Security Invariants:
 * 1. MULTI-TIER SLIDING WINDOW:
 *    - Scoped limit: 5 failed attempts per 15 minutes per (Agency Slug + Client IP).
 *    - Identifier limit: 5 failed attempts per 15 minutes per (Agency Slug + Officer Identifier)
 *      to mitigate distributed attacks targeting a specific credential from rotating IPs.
 *    - Global IP limit: 20 failed attempts per 15 minutes per Client IP across all agencies.
 * 2. ACCOUNT ENUMERATION RESISTANT:
 *    - Responses use neutral, non-differentiating error copy ('TOO_MANY_REQUESTS') that NEVER
 *      discloses whether an agency, username, or account exists.
 * 3. PROXY-AWARE IP RESOLUTION:
 *    - Accurately inspects `cf-connecting-ip`, `x-forwarded-for` (client hop), and `x-real-ip`.
 * 4. NO CREDENTIAL LEAKAGE:
 *    - Passwords, PINs, and sensitive payload tokens are NEVER recorded, hashed, or logged.
 * 5. RFC 6585 & RFC 7231 COMPLIANT:
 *    - Returns accurate `retryAfterSeconds` for HTTP 429 Retry-After header enforcement.
 *
 * ARCHITECTURAL NOTICE (SINGLE-INSTANCE VS DISTRIBUTED):
 * This implementation utilizes an in-memory sliding window cache (Map<string, AttemptRecord>).
 * While highly performant (<0.1ms) and completely resilient against local process brute force,
 * it is LOCAL TO THE PROCESS. In a distributed multi-instance deployment (e.g. multi-replica
 * containers on Railway/Kubernetes), each replica tracks attempts independently.
 * Multi-instance centralized enforcement requires an external shared store (Redis/PostgreSQL).
 */

import type { NextRequest } from 'next/server';

interface AttemptRecord {
  timestamps: number[];
}

// In-Memory sliding window store
const memoryStore = new Map<string, AttemptRecord>();

// Default configuration: 5 failed attempts per 15-minute sliding window
const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MAX_ATTEMPTS = 5;

// Global IP threshold: 20 failed attempts across all agencies within 15 minutes
const GLOBAL_IP_MAX_ATTEMPTS = 20;

/**
 * Extracts the client IP address from request headers with reverse-proxy support.
 */
export function extractClientIp(req: NextRequest): string {
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp && cfConnectingIp.trim()) {
    return cfConnectingIp.trim();
  }

  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor && xForwardedFor.trim()) {
    const first = xForwardedFor.split(',')[0].trim();
    if (first) return first;
  }

  const xRealIp = req.headers.get('x-real-ip');
  if (xRealIp && xRealIp.trim()) {
    return xRealIp.trim();
  }

  return '127.0.0.1';
}

/**
 * Checks if a specific key has exceeded the maximum attempts in the sliding window.
 */
function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): { isLimited: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const record = memoryStore.get(key);

  if (!record) {
    return { isLimited: false, retryAfterSeconds: 0 };
  }

  // Filter timestamps within the current sliding window
  const validTimestamps = record.timestamps.filter((ts) => now - ts < windowMs);
  record.timestamps = validTimestamps;

  if (validTimestamps.length >= maxAttempts) {
    const oldestTimestamp = validTimestamps[0];
    const retryAfterMs = oldestTimestamp + windowMs - now;
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return { isLimited: true, retryAfterSeconds };
  }

  return { isLimited: false, retryAfterSeconds: 0 };
}

/**
 * Records a failed attempt timestamp for a specific key.
 */
function recordFailedAttempt(key: string, windowMs: number): void {
  const now = Date.now();
  const record = memoryStore.get(key) || { timestamps: [] };

  // Evict timestamps outside the sliding window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);
  record.timestamps.push(now);

  memoryStore.set(key, record);
}

/**
 * Resets attempt history for a specific key.
 */
export function resetAttempts(identifier: string): void {
  memoryStore.delete(identifier);
}

export interface RateLimitCheckResult {
  isLimited: boolean;
  retryAfterSeconds: number;
  error?: string;
  code?: string;
}

/**
 * Enforces rate limiting on BWM authentication requests.
 * Evaluates both global IP and agency/identifier-scoped thresholds.
 * Uses neutral error messaging to prevent account enumeration.
 */
export function enforceLoginRateLimit(
  req: NextRequest,
  agencySlug: string,
  officerIdentifier?: string
): RateLimitCheckResult {
  const ip = extractClientIp(req);
  const cleanSlug = agencySlug.toLowerCase().trim().normalize('NFKC');
  const cleanId = (officerIdentifier || '').toLowerCase().trim().normalize('NFKC');

  const ipKey = `bwm_login_ip:${ip}`;
  const agencyIpKey = `bwm_login_agency_ip:${cleanSlug}:${ip}`;
  const identifierKey = cleanId ? `bwm_login_id:${cleanSlug}:${cleanId}` : null;

  // 1. Check Global IP-wide threshold (20 attempts per 15m)
  const ipCheck = checkRateLimit(ipKey, GLOBAL_IP_MAX_ATTEMPTS, DEFAULT_WINDOW_MS);
  if (ipCheck.isLimited) {
    return {
      isLimited: true,
      retryAfterSeconds: ipCheck.retryAfterSeconds,
      code: 'TOO_MANY_REQUESTS',
      error: `Terlalu banyak percobaan login dari jaringan Anda. Akses dibatasi sementara demi keamanan. Silakan coba kembali dalam ${ipCheck.retryAfterSeconds} detik.`,
    };
  }

  // 2. Check Agency + IP threshold (5 attempts per 15m)
  const agencyIpCheck = checkRateLimit(agencyIpKey, DEFAULT_MAX_ATTEMPTS, DEFAULT_WINDOW_MS);
  if (agencyIpCheck.isLimited) {
    return {
      isLimited: true,
      retryAfterSeconds: agencyIpCheck.retryAfterSeconds,
      code: 'TOO_MANY_REQUESTS',
      error: `Terlalu banyak percobaan login yang gagal. Akses dibatasi sementara demi keamanan. Silakan coba kembali dalam ${agencyIpCheck.retryAfterSeconds} detik.`,
    };
  }

  // 3. Check Identifier threshold (5 attempts per 15m per identifier to prevent distributed spray)
  if (identifierKey) {
    const idCheck = checkRateLimit(identifierKey, DEFAULT_MAX_ATTEMPTS, DEFAULT_WINDOW_MS);
    if (idCheck.isLimited) {
      return {
        isLimited: true,
        retryAfterSeconds: idCheck.retryAfterSeconds,
        code: 'TOO_MANY_REQUESTS',
        error: `Terlalu banyak percobaan login yang gagal. Akses dibatasi sementara demi keamanan. Silakan coba kembali dalam ${idCheck.retryAfterSeconds} detik.`,
      };
    }
  }

  return {
    isLimited: false,
    retryAfterSeconds: 0,
  };
}

/**
 * Records a failed login attempt for agency-scoped, identifier, and IP-level keys.
 */
export function recordLoginFailure(
  req: NextRequest,
  agencySlug: string,
  officerIdentifier?: string
): void {
  const ip = extractClientIp(req);
  const cleanSlug = agencySlug.toLowerCase().trim().normalize('NFKC');
  const cleanId = (officerIdentifier || '').toLowerCase().trim().normalize('NFKC');

  const ipKey = `bwm_login_ip:${ip}`;
  const agencyIpKey = `bwm_login_agency_ip:${cleanSlug}:${ip}`;
  const identifierKey = cleanId ? `bwm_login_id:${cleanSlug}:${cleanId}` : null;

  recordFailedAttempt(ipKey, DEFAULT_WINDOW_MS);
  recordFailedAttempt(agencyIpKey, DEFAULT_WINDOW_MS);
  if (identifierKey) {
    recordFailedAttempt(identifierKey, DEFAULT_WINDOW_MS);
  }
}

/**
 * Resets rate limit counters upon successful authentication.
 */
export function recordLoginSuccess(
  req: NextRequest,
  agencySlug: string,
  officerIdentifier?: string
): void {
  const ip = extractClientIp(req);
  const cleanSlug = agencySlug.toLowerCase().trim().normalize('NFKC');
  const cleanId = (officerIdentifier || '').toLowerCase().trim().normalize('NFKC');

  const agencyIpKey = `bwm_login_agency_ip:${cleanSlug}:${ip}`;
  resetAttempts(agencyIpKey);

  if (cleanId) {
    const identifierKey = `bwm_login_id:${cleanSlug}:${cleanId}`;
    resetAttempts(identifierKey);
  }
}

/**
 * Resets all rate limit states (for test suite isolation).
 */
export function clearAllRateLimits(): void {
  memoryStore.clear();
}
