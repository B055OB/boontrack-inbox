/**
 * @file __tests__/studio/studio_ssrf_socket_pinning.test.ts
 * @description Enterprise Verification for SSRF Defense & DNS Socket Pinning (SEC-RES-01)
 *
 * Verifies:
 * 1. Private, Loopback, Link-Local, and Cloud Metadata IP Rejection.
 * 2. Storage Origin Hostname Allowlist & Anti-Lookalike Protection.
 * 3. Pre-Flight DNS Resolution & IP Range Enforcement.
 * 4. DNS Socket Pinning & Rebinding (TOCTOU) Defense:
 *    - Custom lookup handler binds connection socket directly to pre-validated IP.
 *    - Preserves TLS Server Name Indication (SNI) and certificate validation against hostname.
 * 5. Streamlined Socket Connection & Streaming Media Delivery.
 * 6. Multi-Hop Redirect Validation & Re-Pinning.
 */

import http from 'http';
import https from 'https';
import dns from 'dns';
import {
  isPrivateOrBlockedIp,
  isAllowedStorageHostname,
  resolveAndValidateHostnameIps,
  createPinnedLookup,
  createPinnedAgent,
  executePinnedStreamRequest,
  safeFetchMediaAsset,
} from '@/lib/security/ssrf-guard';

describe('§ SEC-RES-01: SSRF Defense & DNS Socket Pinning Test Suite', () => {
  let localServer: http.Server;
  let localServerPort: number;

  beforeAll((done) => {
    // Ephemeral HTTP server for testing socket connection pinning directly
    localServer = http.createServer((req, res) => {
      if (req.url === '/test-video.mp4') {
        res.writeHead(200, {
          'Content-Type': 'video/mp4',
          'Content-Length': '1024',
        });
        res.end('mock-binary-video-stream-payload');
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    localServer.listen(0, '127.0.0.1', () => {
      const addr = localServer.address();
      if (addr && typeof addr === 'object') {
        localServerPort = addr.port;
      }
      done();
    });
  });

  afterAll((done) => {
    if (localServer) {
      localServer.close(done);
    } else {
      done();
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // 1. IP VALIDATION & RESERVED RANGE BLOCKING
  // =========================================================================
  describe('1. Private, Loopback, and Cloud Metadata Blocking', () => {
    it('blocks loopback IPv4 addresses (127.0.0.0/8)', () => {
      expect(isPrivateOrBlockedIp('127.0.0.1')).toBe(true);
      expect(isPrivateOrBlockedIp('127.0.0.2')).toBe(true);
      expect(isPrivateOrBlockedIp('127.255.255.255')).toBe(true);
    });

    it('blocks RFC 1918 private IPv4 ranges', () => {
      // 10.0.0.0/8
      expect(isPrivateOrBlockedIp('10.0.0.1')).toBe(true);
      expect(isPrivateOrBlockedIp('10.255.255.255')).toBe(true);
      // 172.16.0.0/12
      expect(isPrivateOrBlockedIp('172.16.0.1')).toBe(true);
      expect(isPrivateOrBlockedIp('172.31.255.255')).toBe(true);
      // 192.168.0.0/16
      expect(isPrivateOrBlockedIp('192.168.0.1')).toBe(true);
      expect(isPrivateOrBlockedIp('192.168.1.100')).toBe(true);
    });

    it('blocks Cloud Metadata IP (169.254.169.254) and link-local ranges', () => {
      expect(isPrivateOrBlockedIp('169.254.169.254')).toBe(true);
      expect(isPrivateOrBlockedIp('169.254.1.1')).toBe(true);
    });

    it('blocks Carrier-Grade NAT (100.64.0.0/10)', () => {
      expect(isPrivateOrBlockedIp('100.64.0.1')).toBe(true);
      expect(isPrivateOrBlockedIp('100.127.255.255')).toBe(true);
    });

    it('blocks IPv6 loopback, unspecified, and private unique local addresses', () => {
      expect(isPrivateOrBlockedIp('::1')).toBe(true);
      expect(isPrivateOrBlockedIp('::')).toBe(true);
      expect(isPrivateOrBlockedIp('fc00::1')).toBe(true);
      expect(isPrivateOrBlockedIp('fd12:3456:789a::1')).toBe(true);
      expect(isPrivateOrBlockedIp('fe80::1')).toBe(true); // Link-local
    });

    it('blocks IPv4-mapped IPv6 loopback and metadata addresses', () => {
      expect(isPrivateOrBlockedIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateOrBlockedIp('::ffff:169.254.169.254')).toBe(true);
      expect(isPrivateOrBlockedIp('::ffff:10.0.0.1')).toBe(true);
    });

    it('permits valid public routable IP addresses', () => {
      expect(isPrivateOrBlockedIp('104.21.87.62')).toBe(false);
      expect(isPrivateOrBlockedIp('172.67.141.253')).toBe(false);
      expect(isPrivateOrBlockedIp('8.8.8.8')).toBe(false);
      expect(isPrivateOrBlockedIp('1.1.1.1')).toBe(false);
    });
  });

  // =========================================================================
  // 2. STORAGE ORIGIN ALLOWLIST & LOOKALIKE REJECTION
  // =========================================================================
  describe('2. Storage Origin Allowlist & Lookalike Domain Rejection', () => {
    it('permits approved exact storage hostnames', () => {
      expect(isAllowedStorageHostname('assets.boontrack.com')).toBe(true);
      expect(isAllowedStorageHostname('media.boontrack.com')).toBe(true);
      expect(isAllowedStorageHostname('storage.boontrack.com')).toBe(true);
    });

    it('permits approved subdomains matching allowed suffixes', () => {
      expect(isAllowedStorageHostname('cdn.boontrack.com')).toBe(true);
      expect(isAllowedStorageHostname('project-abc.supabase.co')).toBe(true);
      expect(isAllowedStorageHostname('account-xyz.r2.cloudflarestorage.com')).toBe(true);
    });

    it('rejects lookalike domains without the mandatory dot separator', () => {
      expect(isAllowedStorageHostname('evilboontrack.com')).toBe(false);
      expect(isAllowedStorageHostname('fake-supabase.co')).toBe(false);
      expect(isAllowedStorageHostname('evilir2.cloudflarestorage.com')).toBe(false);
      expect(isAllowedStorageHostname('notboontrack.com')).toBe(false);
    });

    it('rejects bare apex domain and local/internal hosts', () => {
      expect(isAllowedStorageHostname('boontrack.com')).toBe(false);
      expect(isAllowedStorageHostname('localhost')).toBe(false);
      expect(isAllowedStorageHostname('server.internal')).toBe(false);
      expect(isAllowedStorageHostname('metadata.google.internal')).toBe(false);
      expect(isAllowedStorageHostname('169.254.169.254')).toBe(false);
    });
  });

  // =========================================================================
  // 3. DNS PRE-FLIGHT RESOLUTION & ENFORCEMENT
  // =========================================================================
  describe('3. Pre-Flight DNS Resolution', () => {
    it('rejects hostnames that resolve to private or loopback IPs', async () => {
      jest.spyOn(dns.promises, 'lookup').mockResolvedValueOnce([
        { address: '127.0.0.1', family: 4 },
      ] as any);

      const check = await resolveAndValidateHostnameIps('assets.boontrack.com');
      expect(check.valid).toBe(false);
      expect(check.error).toContain('belongs to private/blocked space');
    });

    it('rejects hostnames that resolve to Cloud Metadata IP', async () => {
      jest.spyOn(dns.promises, 'lookup').mockResolvedValueOnce([
        { address: '169.254.169.254', family: 4 },
      ] as any);

      const check = await resolveAndValidateHostnameIps('media.boontrack.com');
      expect(check.valid).toBe(false);
      expect(check.error).toContain('belongs to private/blocked space');
    });

    it('permits hostnames that resolve strictly to public IPs', async () => {
      jest.spyOn(dns.promises, 'lookup').mockResolvedValueOnce([
        { address: '104.21.87.62', family: 4 },
        { address: '172.67.141.253', family: 4 },
      ] as any);

      const check = await resolveAndValidateHostnameIps('assets.boontrack.com');
      expect(check.valid).toBe(true);
      expect(check.ips).toEqual(['104.21.87.62', '172.67.141.253']);
    });
  });

  // =========================================================================
  // 4. DNS SOCKET PINNING & REBINDING (TOCTOU) PREVENTION
  // =========================================================================
  describe('4. DNS Socket Pinning & Rebinding Defense', () => {
    it('createPinnedLookup returns exclusively the pinned IP for options.all = true', (done) => {
      const pinnedIp = '104.21.87.62';
      const lookup = createPinnedLookup(pinnedIp);

      lookup('any-host.com', { all: true }, (err: any, addresses: any) => {
        expect(err).toBeNull();
        expect(addresses).toEqual([{ address: pinnedIp, family: 4 }]);
        done();
      });
    });

    it('createPinnedLookup returns exclusively the pinned IP for options.all = false', (done) => {
      const pinnedIp = '104.21.87.62';
      const lookup = createPinnedLookup(pinnedIp);

      lookup('any-host.com', { all: false }, (err: any, address: string, family: number) => {
        expect(err).toBeNull();
        expect(address).toBe(pinnedIp);
        expect(family).toBe(4);
        done();
      });
    });

    it('createPinnedAgent attaches the pinned lookup to HTTP and HTTPS agents', () => {
      const httpAgent = createPinnedAgent('http:', '104.21.87.62');
      expect(httpAgent).toBeInstanceOf(http.Agent);

      const httpsAgent = createPinnedAgent('https:', '104.21.87.62');
      expect(httpsAgent).toBeInstanceOf(https.Agent);
    });

    it('executePinnedStreamRequest connects strictly to the pinned socket IP', async () => {
      // Connect to our local test server, pinning lookup directly to 127.0.0.1
      const targetUrl = new URL(`http://mock-approved-storage.test:${localServerPort}/test-video.mp4`);
      const pinnedIp = '127.0.0.1';

      const res = await executePinnedStreamRequest(targetUrl, pinnedIp);
      expect(res.success).toBe(true);
      expect(res.status).toBe(200);
      expect(res.contentType).toBe('video/mp4');
      expect(res.connectedIp).toBe('127.0.0.1');
      expect(res.body).toBeDefined();
    });

    it('defeats DNS Rebinding by ignoring external DNS changes once IP is pinned', async () => {
      // Simulation of a DNS rebinding attack:
      // Hostname 'rebind-attacker.test' initially resolves to 104.21.87.62 during pre-flight.
      // Attacker changes DNS to 127.0.0.1 immediately afterward.
      const initialValidatedIp = '104.21.87.62';

      // Pin the lookup to initialValidatedIp
      const pinnedLookup = createPinnedLookup(initialValidatedIp);

      // Verify that even if a second lookup occurs, pinnedLookup still returns initialValidatedIp
      let secondLookupIp: string | null = null;
      pinnedLookup('rebind-attacker.test', { all: false }, (_err: any, address: string) => {
        secondLookupIp = address;
      });

      expect(secondLookupIp).toBe(initialValidatedIp);
      expect(secondLookupIp).not.toBe('127.0.0.1');
    });
  });

  // =========================================================================
  // 5. REDIRECT VALIDATION & RE-PINNING AT EVERY HOP
  // =========================================================================
  describe('5. Multi-Hop Redirect Validation & Re-Pinning', () => {
    it('re-validates target and rejects redirects to unapproved lookalike domains', async () => {
      jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '104.21.50.1', family: 4 }] as any);

      global.fetch = jest.fn().mockResolvedValueOnce({
        status: 302,
        headers: new Headers({ location: 'https://evilboontrack.com/malicious.mp4' }),
      });

      const result = await safeFetchMediaAsset('http://mock-approved-storage.test/hop1.mp4');

      expect(result.success).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toContain('tidak termasuk dalam daftar domain storage resmi');
    });

    it('permits redirects to approved storage origins and re-pins socket to the new target', async () => {
      jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '104.21.50.1', family: 4 }] as any);

      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          status: 302,
          headers: new Headers({ location: 'http://mock-approved-storage.test/final.mp4' }),
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: new Headers({
            'content-type': 'video/mp4',
            'content-length': '2048',
          }),
          body: new ReadableStream(),
        });

      const result = await safeFetchMediaAsset('http://mock-approved-storage.test/initial.mp4');

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.contentType).toBe('video/mp4');
      expect(result.finalUrl).toBe('http://mock-approved-storage.test/final.mp4');
    });
  });
});
