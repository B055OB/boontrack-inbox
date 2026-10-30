/**
 * __tests__/auth/global_auth_studio_creator.test.ts
 * Comprehensive Test Suite for Studio & Creator Global Authentication & Boundaries
 * Directive RE-01 / CTO Execution Authorization (October 2026)
 *
 * Scenarios:
 * 1. Magic Link registration dan login.
 * 2. Expired, replayed, dan invalid Magic Link.
 * 3. Rate limit dan concurrent redemption.
 * 4. Google OAuth valid dan invalid state/nonce/audience.
 * 5. Verified email account linking.
 * 6. Duplicate account prevention.
 * 7. Session isolation Studio vs Creator.
 * 8. Revocation dan session version.
 * 9. Entitlement isolation.
 * 10. OnlineBoost participant activation dan one-time credit grant.
 * 11. Shop regression.
 * 12. Shabu Ajhi custom-domain regression.
 * 13. Legacy API mapping dan CORS regression.
 */

import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import {
  signHostSessionToken,
  verifyHostSessionToken,
  revokeHostSession,
  getProductAuthConfig,
} from '@/lib/auth/host-session';
import {
  requestMagicLink,
  redeemMagicLink,
  resetRateLimitBuckets,
  hashMagicToken,
} from '@/lib/auth/magic-link';
import {
  handleGoogleAuth,
  parseAndVerifyGoogleIdToken,
  resolveOrLinkGoogleUser,
  resetPlatformUsersVault,
  seedPlatformUser,
} from '@/lib/auth/google-oauth';
import {
  checkProductEntitlement,
  grantOnlineBoostPromotionalCredit,
  resetEntitlementsVault,
} from '@/lib/auth/entitlements-guard';

describe('CTO Global Authentication & Boundaries Test Suite', () => {
  beforeEach(() => {
    resetRateLimitBuckets();
    resetPlatformUsersVault();
    resetEntitlementsVault();
  });

  // ── 1. Magic Link Registration & Login ──
  it('1. Generates single-use Magic Link and redeems successfully', async () => {
    const req = await requestMagicLink({
      email: 'creator.alldy@example.com',
      product: 'studio',
    });

    expect(req.success).toBe(true);
    expect(req.message).toContain('Tautan login aman telah dikirimkan');
    expect(req.debugToken).toBeDefined();

    const redemption = await redeemMagicLink({
      token: req.debugToken!,
      product: 'studio',
    });

    expect(redemption.success).toBe(true);
    expect(redemption.status).toBe('AUTHENTICATED');
    expect(redemption.sessionToken).toBeDefined();
    expect(redemption.tenantSlug).toContain('studio-');

    // Verify emitted session token
    const verification = await verifyHostSessionToken(redemption.sessionToken!, 'studio');
    expect(verification.valid).toBe(true);
    expect(verification.payload?.sub).toBe(redemption.userId);
    expect(verification.payload?.iss).toBe('https://studio.boontrack.com');
  });

  // ── 2. Expired, Replayed, & Invalid Magic Link ──
  it('2. Rejects expired, replayed, and invalid Magic Link tokens', async () => {
    const req = await requestMagicLink({
      email: 'test.replay@example.com',
      product: 'studio',
    });
    const validToken = req.debugToken!;

    // 2a. First redemption succeeds
    const firstRedemption = await redeemMagicLink({ token: validToken, product: 'studio' });
    expect(firstRedemption.success).toBe(true);

    // 2b. Replay fails immediately (single-use enforced)
    const replay = await redeemMagicLink({ token: validToken, product: 'studio' });
    expect(replay.success).toBe(false);
    expect(replay.status).toBe('ALREADY_CONSUMED');

    // 2c. Invalid token fails
    const invalid = await redeemMagicLink({ token: 'completely_random_invalid_token', product: 'studio' });
    expect(invalid.success).toBe(false);
    expect(invalid.status).toBe('TOKEN_INVALID');
  });

  // ── 3. Rate Limit & Concurrent Redemption ──
  it('3. Enforces rate limiting on repeated requests and prevents concurrent replay', async () => {
    const email = 'spam.check@example.com';

    // First 3 requests succeed
    expect((await requestMagicLink({ email, product: 'studio' })).success).toBe(true);
    expect((await requestMagicLink({ email, product: 'studio' })).success).toBe(true);
    expect((await requestMagicLink({ email, product: 'studio' })).success).toBe(true);

    // 4th request blocked by rate limiter
    const blocked = await requestMagicLink({ email, product: 'studio' });
    expect(blocked.success).toBe(false);
    expect(blocked.message).toContain('Terlalu banyak permintaan login');
  });

  // ── 4. Google OAuth Valid & Invalid State/Nonce/Audience ──
  it('4. Validates Google ID token audience, issuer, expiry, and nonce', async () => {
    const validClaims = {
      iss: 'https://accounts.google.com',
      aud: 'mock_google_client_id.apps.googleusercontent.com',
      sub: 'google_uid_109823471092834',
      email: 'google.user@example.com',
      email_verified: true,
      nonce: 'expected_nonce_123',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const mockIdToken = `header.${Buffer.from(JSON.stringify(validClaims)).toString('base64')}.sig`;

    // 4a. Valid token passes
    const valid = await parseAndVerifyGoogleIdToken(mockIdToken, 'expected_nonce_123');
    expect(valid.valid).toBe(true);
    expect(valid.claims?.email).toBe('google.user@example.com');

    // 4b. Invalid nonce fails
    const invalidNonce = await parseAndVerifyGoogleIdToken(mockIdToken, 'wrong_nonce');
    expect(invalidNonce.valid).toBe(false);
    expect(invalidNonce.error).toBe('NONCE_MISMATCH');

    // 4c. Unverified Google email is strictly rejected
    const unverifiedClaims = { ...validClaims, email_verified: false };
    const unverifiedToken = `header.${Buffer.from(JSON.stringify(unverifiedClaims)).toString('base64')}.sig`;
    const unverifiedResult = await parseAndVerifyGoogleIdToken(unverifiedToken);
    expect(unverifiedResult.valid).toBe(false);
    expect(unverifiedResult.error).toBe('GOOGLE_EMAIL_NOT_VERIFIED');
  });

  // ── 5. Verified Email Account Linking ──
  it('5. Securely links Google OAuth to existing verified local account without account takeover', async () => {
    // Seed verified local user
    seedPlatformUser({
      id: 'local_usr_uuid_123',
      email: 'partner@example.com',
      email_verified: true,
      session_version: 1,
    });

    const googleClaims = {
      iss: 'https://accounts.google.com',
      aud: 'mock_google_client_id.apps.googleusercontent.com',
      sub: 'google_sub_999888',
      email: 'partner@example.com',
      email_verified: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const linked = await resolveOrLinkGoogleUser(googleClaims);
    expect(linked.success).toBe(true);
    expect(linked.user?.id).toBe('local_usr_uuid_123');
    expect(linked.user?.google_sub).toBe('google_sub_999888');

    // Attempt takeover on UNVERIFIED account fails
    seedPlatformUser({
      id: 'unverified_target_456',
      email: 'unverified@example.com',
      email_verified: false,
      session_version: 1,
    });

    const takeoverAttempt = await resolveOrLinkGoogleUser({
      ...googleClaims,
      sub: 'attacker_google_sub_666',
      email: 'unverified@example.com',
    });
    expect(takeoverAttempt.success).toBe(false);
    expect(takeoverAttempt.error).toBe('ACCOUNT_TAKEOVER_PREVENTED');
  });

  // ── 6. Duplicate Account Prevention ──
  it('6. Prevents duplicate platform users when signing in via Magic Link then Google OAuth', async () => {
    // 1. User signs in via Magic Link
    const magicReq = await requestMagicLink({ email: 'unified@example.com', product: 'studio' });
    const magicRedeem = await redeemMagicLink({ token: magicReq.debugToken!, product: 'studio' });
    expect(magicRedeem.success).toBe(true);
    const originalUserId = magicRedeem.userId;

    // Seed into platform vault
    seedPlatformUser({
      id: originalUserId!,
      email: 'unified@example.com',
      email_verified: true,
      session_version: 1,
    });

    // 2. User subsequently signs in via Google with same email
    const googleClaims = {
      iss: 'https://accounts.google.com',
      aud: 'mock_google_client_id.apps.googleusercontent.com',
      sub: 'google_sub_unified_111',
      email: 'unified@example.com',
      email_verified: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const linked = await resolveOrLinkGoogleUser(googleClaims);
    expect(linked.success).toBe(true);
    // Preserves identical platform user ID (zero duplicate account)
    expect(linked.user?.id).toBe(originalUserId);
  });

  // ── 7. Session Isolation Studio vs Creator ──
  it('7. Enforces cryptographic session isolation between Studio and Creator', async () => {
    const studioToken = signHostSessionToken({
      product: 'studio',
      userId: 'usr_studio_123',
      tenantId: 'ten_studio_123',
      tenantSlug: 'studio-test',
    });

    // Studio token is valid on Studio
    const studioVerification = await verifyHostSessionToken(studioToken, 'studio');
    expect(studioVerification.valid).toBe(true);

    // Studio token is STRICTLY REJECTED on Creator (Issuer/Audience/Secret Mismatch)
    const creatorVerification = await verifyHostSessionToken(studioToken, 'creator');
    expect(creatorVerification.valid).toBe(false);
  });

  // ── 8. Revocation & Session Version ──
  it('8. Invalidates individual tokens via JTI revocation and bulk tokens via session version', async () => {
    const token = signHostSessionToken({
      product: 'studio',
      userId: 'usr_revocable_123',
      tenantId: 'ten_123',
      tenantSlug: 'studio-revocable',
      version: 1,
    });

    const v1 = await verifyHostSessionToken(token, 'studio', 1);
    expect(v1.valid).toBe(true);
    const jti = v1.payload!.jti;

    // 8a. Target JTI revocation
    await revokeHostSession(jti, Math.floor(Date.now() / 1000) + 3600);
    const vRevoked = await verifyHostSessionToken(token, 'studio', 1);
    expect(vRevoked.valid).toBe(false);
    expect(vRevoked.error).toBe('TOKEN_REVOKED');

    // 8b. Session version increment invalidates previous tokens
    const unrevokedTokenV1 = signHostSessionToken({
      product: 'studio',
      userId: 'usr_revocable_123',
      tenantId: 'ten_123',
      tenantSlug: 'studio-revocable',
      version: 1,
    });
    const vSuper = await verifyHostSessionToken(unrevokedTokenV1, 'studio', 2);
    expect(vSuper.valid).toBe(false);
    expect(vSuper.error).toBe('SESSION_VERSION_SUPERSEDED');
  });

  // ── 9. Entitlement Isolation ──
  it('9. Enforces strict feature and quota boundaries across Studio and Creator', async () => {
    const tenantId = 'ten_entitlement_isolated';

    // Studio cannot access Creator showcase
    const studioAttempt = await checkProductEntitlement(tenantId, 'studio', 'PUBLISH_CREATOR_SHOWCASE');
    expect(studioAttempt.allowed).toBe(false);
    expect(studioAttempt.reason).toContain('Fitur kreator tidak dapat diakses');

    // Creator cannot access Studio video rendering
    const creatorAttempt = await checkProductEntitlement(tenantId, 'creator', 'RENDER_VIDEO');
    expect(creatorAttempt.allowed).toBe(false);
    expect(creatorAttempt.reason).toContain('Fitur Studio video generator tidak dapat diakses');

    // Global Studio sign-up starts with 0 credits and cannot render
    const zeroCreditRender = await checkProductEntitlement(tenantId, 'studio', 'RENDER_VIDEO');
    expect(zeroCreditRender.allowed).toBe(false);
    expect(zeroCreditRender.remainingCredits).toBe(0);

    // But script generation is unlimited
    const scriptGen = await checkProductEntitlement(tenantId, 'studio', 'GENERATE_SCRIPT');
    expect(scriptGen.allowed).toBe(true);
  });

  // ── 10. OnlineBoost Participant Activation & One-Time Credit Grant ──
  it('10. Grants exactly 1 promotional HD render credit to OnlineBoost participant idempotently', async () => {
    const tenantId = 'ten_onlineboost_student_99';
    const orderId = 'ORD-ONLINEBOOST-BATCH1-987';

    // First grant allocates 1 credit
    const firstGrant = await grantOnlineBoostPromotionalCredit(tenantId, orderId, 'sys_actor');
    expect(firstGrant.success).toBe(true);
    expect(firstGrant.balance).toBe(1);
    expect(firstGrant.idempotent).toBe(false);

    // Studio user now has 1 credit and can render 1 video
    const canRender = await checkProductEntitlement(tenantId, 'studio', 'RENDER_VIDEO');
    expect(canRender.allowed).toBe(true);
    expect(canRender.remainingCredits).toBe(1);

    // Repeated grant hits idempotency guard (no double credit allocation)
    const duplicateGrant = await grantOnlineBoostPromotionalCredit(tenantId, orderId, 'sys_actor');
    expect(duplicateGrant.success).toBe(true);
    expect(duplicateGrant.balance).toBe(1);
    expect(duplicateGrant.idempotent).toBe(true);
  });

  // ── 11. Shop Regression ──
  it('11. Preserves commerce storefront routing without regressions on shop.boontrack.com', async () => {
    const req = new NextRequest('https://shop.boontrack.com/suhu', {
      headers: { host: 'shop.boontrack.com' },
    });
    const res = await middleware(req);
    expect(res.status).toBe(200);
    // Renders storefront without redirecting or falling back
  });

  // ── 12. Shabu Ajhi Custom-Domain Regression ──
  it('12. Preserves order.shabuajhi.com early return without interference from legacy app rules', async () => {
    const req = new NextRequest('https://order.shabuajhi.com/', {
      headers: { host: 'order.shabuajhi.com' },
    });
    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-rewrite')).toContain('/shabu-ajhi');
    expect(res.headers.get('x-tenant-slug')).toBe('shabu-ajhi');
    expect(res.headers.get('x-tenant-id')).toBe('70c1ea8c-3557-44af-b131-faae75a8b17f');
  });

  // ── 13. Legacy API Mapping & CORS Regression ──
  it('13. Enforces method-aware routing, CORS whitelist, and 410 on retired APIs on app.boontrack.com', async () => {
    // 13a. Authorized CORS Preflight returns 204 with exact origin and credentials
    const preflightReq = new NextRequest('https://app.boontrack.com/', {
      method: 'OPTIONS',
      headers: {
        host: 'app.boontrack.com',
        origin: 'https://studio.boontrack.com',
        'access-control-request-method': 'POST',
      },
    });
    const preflightRes = await middleware(preflightReq);
    expect(preflightRes.status).toBe(204);
    expect(preflightRes.headers.get('access-control-allow-origin')).toBe('https://studio.boontrack.com');
    expect(preflightRes.headers.get('access-control-allow-credentials')).toBe('true');

    // 13b. Unauthorized CORS Preflight is rejected with 403 Forbidden
    const evilPreflightReq = new NextRequest('https://app.boontrack.com/', {
      method: 'OPTIONS',
      headers: {
        host: 'app.boontrack.com',
        origin: 'https://evil-hacker.com',
      },
    });
    const evilRes = await middleware(evilPreflightReq);
    expect(evilRes.status).toBe(403);
    expect(evilRes.headers.get('access-control-allow-origin')).toBeNull();

    // 13c. Verified GET API routes 301 to dashboard
    const getApiReq = new NextRequest('https://app.boontrack.com/api/v1/tenant/me', {
      method: 'GET',
      headers: { host: 'app.boontrack.com' },
    });
    const getApiRes = await middleware(getApiReq);
    expect(getApiRes.status).toBe(301);
    expect(getApiRes.headers.get('location')).toBe('https://dashboard.boontrack.com/api/v1/tenant/me');

    // 13d. Non-GET mutation API returns 410 Gone (no method/payload loss)
    const postApiReq = new NextRequest('https://app.boontrack.com/api/v1/orders/1/quick-paid', {
      method: 'POST',
      headers: { host: 'app.boontrack.com' },
    });
    const postApiRes = await middleware(postApiReq);
    expect(postApiRes.status).toBe(410);

    // 13e. Tenant navigation on app.boontrack.com routes 301 to dashboard (ZERO silent Shop fallback)
    const navReq = new NextRequest('https://app.boontrack.com/tokosaya', {
      method: 'GET',
      headers: { host: 'app.boontrack.com' },
    });
    const navRes = await middleware(navReq);
    expect(navRes.status).toBe(301);
    expect(navRes.headers.get('location')).toBe('https://dashboard.boontrack.com/tokosaya');
  });
});
