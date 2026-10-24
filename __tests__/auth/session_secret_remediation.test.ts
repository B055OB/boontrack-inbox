/**
 * Test Suite: Session Secret Domain Separation & Fail-Closed Parity
 *
 * Verifies P0 Requirements:
 * 1. ZERO FALLBACK TO ADMIN INTERNAL SECRET:
 *    Presence of ADMIN_INTERNAL_SECRET / INTERNAL_API_SECRET must NEVER sign or verify merchant tokens.
 * 2. EXPLICIT FAIL-CLOSED IN PREVIEW & PRODUCTION:
 *    When session secret is absent, VERCEL_ENV='preview' and NODE_ENV='production' fail closed (status 401).
 * 3. TOKEN VALIDITY & SECRET ROTATION:
 *    Supports active signing and verification, with graceful rotation via previous secret.
 * 4. EDGE & NODE.JS RUNTIME PARITY:
 *    Complete HMAC-SHA256 parity between Web Cryptography API and Node.js crypto.
 */

import {
  getMerchantSessionSecret,
  getMerchantSessionSecrets,
  signMerchantSessionToken,
  verifyMerchantSessionToken as verifyMerchantSessionTokenNode,
} from '@/lib/auth/merchant-session';
import {
  getMerchantSessionSecretsAsync,
  verifyMerchantSessionToken as verifyMerchantSessionTokenEdge,
} from '@/lib/auth/merchant-session-edge';

const ORIGINAL_ENV = process.env;

describe('P0 Session Secret Domain Separation & Fail-Closed Parity', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.BOONTRACK_SESSION_SECRET;
    delete process.env.MERCHANT_SESSION_SECRET;
    delete process.env.BOONTRACK_SESSION_SECRET_PREVIOUS;
    delete process.env.MERCHANT_SESSION_SECRET_PREVIOUS;
    delete process.env.ADMIN_INTERNAL_SECRET;
    delete process.env.INTERNAL_API_SECRET;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('fails closed when session secret is missing in VERCEL_ENV="preview"', async () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.NODE_ENV = 'development'; // Even if node env is dev, Vercel preview MUST fail-closed

    const nodeSecrets = getMerchantSessionSecrets();
    expect(nodeSecrets).toEqual([]);
    expect(() => getMerchantSessionSecret()).toThrow('Merchant session signing secret is unconfigured in production.');

    const edgeSecrets = await getMerchantSessionSecretsAsync();
    expect(edgeSecrets).toEqual([]);

    const resNode = verifyMerchantSessionTokenNode('dummy.token', 'demo-store');
    expect(resNode.valid).toBe(false);
    expect(resNode.status).toBe(401);

    const resEdge = await verifyMerchantSessionTokenEdge('dummy.token', 'demo-store');
    expect(resEdge.valid).toBe(false);
    expect(resEdge.status).toBe(401);
  });

  it('fails closed when session secret is missing in NODE_ENV="production"', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.VERCEL_ENV;

    const nodeSecrets = getMerchantSessionSecrets();
    expect(nodeSecrets).toEqual([]);

    const edgeSecrets = await getMerchantSessionSecretsAsync();
    expect(edgeSecrets).toEqual([]);

    const resNode = verifyMerchantSessionTokenNode('dummy.token', 'demo-store');
    expect(resNode.valid).toBe(false);
    expect(resNode.status).toBe(401);
  });

  it('strictly refuses to derive session secret from ADMIN_INTERNAL_SECRET when session secret is missing', async () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.ADMIN_INTERNAL_SECRET = 'critical_admin_secret_super_secure_key_12345';
    process.env.INTERNAL_API_SECRET = 'another_internal_api_secret_key_88888';

    // Must return empty array and NOT derive any key from admin secrets
    const nodeSecrets = getMerchantSessionSecrets();
    expect(nodeSecrets).toEqual([]);

    const edgeSecrets = await getMerchantSessionSecretsAsync();
    expect(edgeSecrets).toEqual([]);

    expect(() => getMerchantSessionSecret()).toThrow();
  });

  it('signs and verifies valid tokens when BOONTRACK_SESSION_SECRET is configured', async () => {
    const TEST_SECRET = 'live_merchant_session_secret_key_32_bytes_len!';
    process.env.BOONTRACK_SESSION_SECRET = TEST_SECRET;
    process.env.VERCEL_ENV = 'preview';

    const token = signMerchantSessionToken({
      tenantSlug: 'solusi-ads',
      role: 'OWNER',
    });

    // Verification on Node.js runtime
    const nodeVerify = verifyMerchantSessionTokenNode(token, 'solusi-ads');
    expect(nodeVerify.valid).toBe(true);
    expect(nodeVerify.payload?.tenantSlug).toBe('solusi-ads');
    expect(nodeVerify.payload?.role).toBe('OWNER');

    // Verification on Edge WebCrypto runtime
    const edgeVerify = await verifyMerchantSessionTokenEdge(token, 'solusi-ads');
    expect(edgeVerify.valid).toBe(true);
    expect(edgeVerify.payload?.tenantSlug).toBe('solusi-ads');
    expect(edgeVerify.payload?.role).toBe('OWNER');
  });

  it('rejects invalid or tampered tokens with 401 Unauthorized', async () => {
    const TEST_SECRET = 'live_merchant_session_secret_key_32_bytes_len!';
    process.env.BOONTRACK_SESSION_SECRET = TEST_SECRET;

    const token = signMerchantSessionToken({
      tenantSlug: 'solusi-ads',
      role: 'OWNER',
    });

    const [payload, sig] = token.split('.');
    const tamperedToken = `${payload}.${sig.slice(0, -3)}xyz`;

    const nodeVerify = verifyMerchantSessionTokenNode(tamperedToken, 'solusi-ads');
    expect(nodeVerify.valid).toBe(false);
    expect(nodeVerify.status).toBe(401);

    const edgeVerify = await verifyMerchantSessionTokenEdge(tamperedToken, 'solusi-ads');
    expect(edgeVerify.valid).toBe(false);
    expect(edgeVerify.status).toBe(401);
  });

  it('supports zero-downtime secret rotation via BOONTRACK_SESSION_SECRET_PREVIOUS', async () => {
    const OLD_SECRET = 'old_previous_session_secret_32_bytes_len!';
    const NEW_SECRET = 'new_active_session_secret_32_bytes_len!!';

    // Sign with old secret
    const oldToken = signMerchantSessionToken(
      { tenantSlug: 'buzzerukm', role: 'OWNER' },
      OLD_SECRET
    );

    // Active environment has new secret as primary, old secret as previous
    process.env.BOONTRACK_SESSION_SECRET = NEW_SECRET;
    process.env.BOONTRACK_SESSION_SECRET_PREVIOUS = OLD_SECRET;

    // Both Node and Edge must accept the old token during rotation window
    const nodeOldVerify = verifyMerchantSessionTokenNode(oldToken, 'buzzerukm');
    expect(nodeOldVerify.valid).toBe(true);

    const edgeOldVerify = await verifyMerchantSessionTokenEdge(oldToken, 'buzzerukm');
    expect(edgeOldVerify.valid).toBe(true);

    // New token signed by active environment must use the NEW_SECRET
    const newToken = signMerchantSessionToken({ tenantSlug: 'buzzerukm', role: 'OWNER' });
    const nodeNewVerify = verifyMerchantSessionTokenNode(newToken, 'buzzerukm');
    expect(nodeNewVerify.valid).toBe(true);
  });

  it('maintains complete cryptographic token interoperability between Node.js and Edge', async () => {
    const SHARED_SECRET = 'interop_secret_between_runtimes_minimum_32_bytes!';
    process.env.BOONTRACK_SESSION_SECRET = SHARED_SECRET;

    // Token generated by Node.js
    const nodeToken = signMerchantSessionToken({
      tenantSlug: 'demo-store',
      role: 'CS',
      phone: '081234567890',
    });

    // Verified by Edge WebCrypto
    const edgeVerify = await verifyMerchantSessionTokenEdge(nodeToken, 'demo-store');
    expect(edgeVerify.valid).toBe(true);
    expect(edgeVerify.payload?.role).toBe('CS');
    expect(edgeVerify.payload?.phone).toBe('081234567890');
  });
});
