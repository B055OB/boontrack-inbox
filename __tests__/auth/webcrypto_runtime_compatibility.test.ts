/**
 * Test Suite: Web Cryptography API Runtime Compatibility & Cross-Verification
 *
 * Verifies that the Web Crypto implementation (`lib/auth/merchant-session-edge.ts`)
 * is 100% interoperable with tokens minted by Node.js crypto (`lib/auth/merchant-session.ts`),
 * and strictly adheres to constant-time verification, secret rotation, and canonical tenant isolation.
 */

import {
  signMerchantSessionToken,
} from '@/lib/auth/merchant-session';
import {
  verifyMerchantSessionToken as verifyMerchantSessionTokenWebCrypto,
  getMerchantSessionSecretsAsync,
  constantTimeEqual,
  decodeBase64Url,
  validateTenantIdentityConsistency,
  extractMerchantSessionToken,
} from '@/lib/auth/merchant-session-edge';
import { NextRequest } from 'next/server';

const TEST_SECRET = 'unit_test_merchant_session_secret_2026_min_32_bytes!';
const TEST_PREVIOUS_SECRET = 'unit_test_merchant_session_previous_secret_32_bytes!';
const TEST_ADMIN_SECRET = 'unit_test_admin_internal_secret_32_bytes!';

describe('Web Cryptography API Runtime Compatibility Gate', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      BOONTRACK_SESSION_SECRET: TEST_SECRET,
      BOONTRACK_SESSION_SECRET_PREVIOUS: TEST_PREVIOUS_SECRET,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('1. Cross-Runtime Token Interoperability (Node Crypto Mint -> Web Crypto Verify)', () => {
    it('successfully verifies a valid Owner token minted by Node crypto using Web Crypto API', async () => {
      const token = signMerchantSessionToken({
        tenantSlug: 'solusi-ads',
        tenantId: 'd3b07384-d113-46fb-a764-44cf49666c1e',
        role: 'OWNER',
        userId: 'usr_owner_01',
      }, TEST_SECRET);

      const verification = await verifyMerchantSessionTokenWebCrypto(token, 'solusi-ads', TEST_SECRET);
      expect(verification.valid).toBe(true);
      expect(verification.status).toBe(200);
      expect(verification.payload?.tenantSlug).toBe('solusi-ads');
      expect(verification.payload?.tenantId).toBe('d3b07384-d113-46fb-a764-44cf49666c1e');
      expect(verification.payload?.role).toBe('OWNER');
    });

    it('successfully verifies a CS agent token with Web Crypto API', async () => {
      const token = signMerchantSessionToken({
        tenantSlug: 'buzzerukm',
        role: 'CS',
        userId: 'cs_agent_42',
      }, TEST_SECRET);

      const verification = await verifyMerchantSessionTokenWebCrypto(token, 'buzzerukm', TEST_SECRET);
      expect(verification.valid).toBe(true);
      expect(verification.status).toBe(200);
      expect(verification.payload?.role).toBe('CS');
    });

    it('rejects a forged or tampered token with 401 Unauthorized', async () => {
      const validToken = signMerchantSessionToken({
        tenantSlug: 'solusi-ads',
        role: 'OWNER',
      }, TEST_SECRET);

      const [payload, sig] = validToken.split('.');
      // Tamper signature by flipping last character
      const forgedSig = sig.slice(0, -1) + (sig.slice(-1) === 'a' ? 'b' : 'a');
      const forgedToken = `${payload}.${forgedSig}`;

      const verification = await verifyMerchantSessionTokenWebCrypto(forgedToken, 'solusi-ads', TEST_SECRET);
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe(401);
      expect(verification.error).toContain('tidak sah (Forged Token)');
    });

    it('rejects an expired token with 401 Unauthorized', async () => {
      const expiredToken = signMerchantSessionToken({
        tenantSlug: 'buzzerukm',
        role: 'OWNER',
        ttlMs: -1000, // expired 1s ago
      }, TEST_SECRET);

      const verification = await verifyMerchantSessionTokenWebCrypto(expiredToken, 'buzzerukm', TEST_SECRET);
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe(401);
      expect(verification.error).toContain('kedaluwarsa');
    });

    it('rejects missing, malformed, or corrupt tokens', async () => {
      expect((await verifyMerchantSessionTokenWebCrypto(null as any)).valid).toBe(false);
      expect((await verifyMerchantSessionTokenWebCrypto(undefined as any)).valid).toBe(false);
      expect((await verifyMerchantSessionTokenWebCrypto('')).valid).toBe(false);
      expect((await verifyMerchantSessionTokenWebCrypto('invalid-no-dot')).valid).toBe(false);
      expect((await verifyMerchantSessionTokenWebCrypto('part1.part2.part3')).valid).toBe(false);
      expect((await verifyMerchantSessionTokenWebCrypto('corruptbase64.signature')).valid).toBe(false);
    });
  });

  describe('2. Secret Precedence & Zero-Downtime Rotation with Web Crypto', () => {
    it('verifies token minted with active primary secret', async () => {
      const token = signMerchantSessionToken({ tenantSlug: 'demo-store', role: 'OWNER' }, TEST_SECRET);
      const verification = await verifyMerchantSessionTokenWebCrypto(token, 'demo-store');
      expect(verification.valid).toBe(true);
    });

    it('verifies token minted with previous secret within 7-day transition grace window', async () => {
      const token = signMerchantSessionToken({ tenantSlug: 'demo-store', role: 'OWNER' }, TEST_PREVIOUS_SECRET);
      const verification = await verifyMerchantSessionTokenWebCrypto(token, 'demo-store');
      expect(verification.valid).toBe(true);
      expect(verification.status).toBe(200);
    });

    it('rejects token from previous secret if issued more than 7 days ago', async () => {
      // Mint token with previous secret, but simulate iat 8 days ago
      const eightDaysAgo = Date.now() - (8 * 24 * 60 * 60 * 1000);
      const payload = {
        tenantSlug: 'demo-store',
        role: 'OWNER' as const,
        iat: eightDaysAgo,
        exp: Date.now() + 100000,
        nonce: 'old_nonce_1234',
      };
      const serialized = Buffer.from(JSON.stringify(payload)).toString('base64url');
      // Compute HMAC using Web Crypto
      const key = await globalThis.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(TEST_PREVIOUS_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sigBuf = await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(serialized));
      const sig = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
      const token = `${serialized}.${sig}`;

      const verification = await verifyMerchantSessionTokenWebCrypto(token, 'demo-store');
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe(401);
      expect(verification.error).toContain('batas masa transisi aman');
    });

    it('verifies token signed with derived admin secret fallback', async () => {
      // Clear session secrets, set ADMIN_INTERNAL_SECRET only
      delete process.env.BOONTRACK_SESSION_SECRET;
      delete process.env.MERCHANT_SESSION_SECRET;
      delete process.env.BOONTRACK_SESSION_SECRET_PREVIOUS;
      delete process.env.MERCHANT_SESSION_SECRET_PREVIOUS;
      process.env.ADMIN_INTERNAL_SECRET = TEST_ADMIN_SECRET;

      const secrets = await getMerchantSessionSecretsAsync();
      expect(secrets.length).toBe(1);

      // Sign with the derived secret
      const derivedSecret = secrets[0];
      const token = signMerchantSessionToken({ tenantSlug: 'demo-store', role: 'OWNER' }, derivedSecret);

      const verification = await verifyMerchantSessionTokenWebCrypto(token, 'demo-store');
      expect(verification.valid).toBe(true);
      expect(verification.status).toBe(200);
    });

    it('fails closed in production when all secrets are absent', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.BOONTRACK_SESSION_SECRET;
      delete process.env.MERCHANT_SESSION_SECRET;
      delete process.env.BOONTRACK_SESSION_SECRET_PREVIOUS;
      delete process.env.MERCHANT_SESSION_SECRET_PREVIOUS;
      delete process.env.ADMIN_INTERNAL_SECRET;
      delete process.env.INTERNAL_API_SECRET;

      const secrets = await getMerchantSessionSecretsAsync();
      expect(secrets).toEqual([]);

      const verification = await verifyMerchantSessionTokenWebCrypto('somepayload.somesig', 'demo-store');
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe(401);
      expect(verification.error).toContain('Fail-Closed');
    });
  });

  describe('3. Strict Tenant Isolation & Canonical Database Consistency', () => {
    const CANONICAL_RECORD = {
      slug: 'solusi-ads',
      id: 'd3b07384-d113-46fb-a764-44cf49666c1e',
    };

    it('accepts dual-identifier token when both slug and UUID match canonical record', async () => {
      const token = signMerchantSessionToken({
        tenantSlug: 'solusi-ads',
        tenantId: 'd3b07384-d113-46fb-a764-44cf49666c1e',
        role: 'OWNER',
      }, TEST_SECRET);

      const verification = await verifyMerchantSessionTokenWebCrypto(token, 'solusi-ads', TEST_SECRET, CANONICAL_RECORD);
      expect(verification.valid).toBe(true);
      expect(verification.status).toBe(200);
    });

    it('rejects with 403 when slug matches URL but UUID contradicts canonical database record', async () => {
      const contradictoryToken = signMerchantSessionToken({
        tenantSlug: 'solusi-ads',
        tenantId: '99999999-9999-9999-9999-999999999999', // Contradictory UUID
        role: 'OWNER',
      }, TEST_SECRET);

      const verification = await verifyMerchantSessionTokenWebCrypto(
        contradictoryToken,
        'solusi-ads',
        TEST_SECRET,
        CANONICAL_RECORD
      );
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe(403);
      expect(verification.error).toContain('Kontradiksi identitas tenant');
    });

    it('rejects with 403 when UUID matches canonical but slug contradicts canonical record', async () => {
      const contradictoryToken = signMerchantSessionToken({
        tenantSlug: 'imposter-slug',
        tenantId: 'd3b07384-d113-46fb-a764-44cf49666c1e',
        role: 'OWNER',
      }, TEST_SECRET);

      const verification = await verifyMerchantSessionTokenWebCrypto(
        contradictoryToken,
        'imposter-slug',
        TEST_SECRET,
        CANONICAL_RECORD
      );
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe(403);
      expect(verification.error).toContain('Kontradiksi identitas tenant');
    });

    it('preserves deliberate legacy single-identifier compatibility when agreeing with canonical record', async () => {
      const legacyToken = signMerchantSessionToken({
        tenantSlug: 'solusi-ads',
        role: 'OWNER',
      }, TEST_SECRET);

      const verification = await verifyMerchantSessionTokenWebCrypto(
        legacyToken,
        'solusi-ads',
        TEST_SECRET,
        CANONICAL_RECORD
      );
      expect(verification.valid).toBe(true);
      expect(verification.status).toBe(200);
    });

    it('blocks cross-tenant token access (Tenant A token visiting Tenant B)', async () => {
      const tokenTenantA = signMerchantSessionToken({
        tenantSlug: 'tenant-alpha',
        role: 'OWNER',
      }, TEST_SECRET);

      const verification = await verifyMerchantSessionTokenWebCrypto(tokenTenantA, 'tenant-beta', TEST_SECRET);
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe(403);
      expect(verification.error).toContain("tidak cocok dengan target toko ('tenant-beta')");
    });
  });

  describe('4. Cryptographic Primitives & Pure Helpers Verification', () => {
    it('constantTimeEqual correctly compares strings and defends against length mismatch', () => {
      expect(constantTimeEqual('hello12345', 'hello12345')).toBe(true);
      expect(constantTimeEqual('hello12345', 'hello12346')).toBe(false);
      expect(constantTimeEqual('short', 'longer_string')).toBe(false);
      expect(constantTimeEqual('', '')).toBe(true);
      expect(constantTimeEqual('a', '')).toBe(false);
    });

    it('decodeBase64Url properly handles UTF-8 multi-byte characters and URL-safe chars', () => {
      const payloadObj = { tenant: 'tokô-spëciál', role: 'OWNER' };
      const rawJson = JSON.stringify(payloadObj);
      const encoded = Buffer.from(rawJson).toString('base64url');

      const decoded = decodeBase64Url(encoded);
      expect(JSON.parse(decoded)).toEqual(payloadObj);
    });

    it('extractMerchantSessionToken extracts from cookies, custom header, and Bearer', () => {
      // 1. From Cookie
      const reqCookie = new NextRequest('https://dashboard.boontrack.com/', {
        headers: { cookie: 'bt_merchant_token=payload123.sig456; other=val' },
      });
      expect(extractMerchantSessionToken(reqCookie)).toBe('payload123.sig456');

      // 2. From x-merchant-token header
      const reqHeader = new NextRequest('https://dashboard.boontrack.com/', {
        headers: { 'x-merchant-token': 'headerpayload.headersig' },
      });
      expect(extractMerchantSessionToken(reqHeader)).toBe('headerpayload.headersig');

      // 3. From Authorization: Bearer
      const reqBearer = new NextRequest('https://dashboard.boontrack.com/', {
        headers: { authorization: 'Bearer bearerpayload.beariersig' },
      });
      expect(extractMerchantSessionToken(reqBearer)).toBe('bearerpayload.beariersig');

      // 4. Ignores 3-part Supabase JWT in Bearer
      const reqJwt = new NextRequest('https://dashboard.boontrack.com/', {
        headers: { authorization: 'Bearer header.payload.jwtSignature' },
      });
      expect(extractMerchantSessionToken(reqJwt)).toBe('');
    });
  });
});
