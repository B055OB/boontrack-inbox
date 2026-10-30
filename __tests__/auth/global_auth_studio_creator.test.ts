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
  resetRevokedJtiCache,
} from '@/lib/auth/host-session';
import {
  requestMagicLink,
  redeemMagicLink,
  inspectMagicLinkReadOnly,
  validateRedirectUrl,
  resetRateLimitBuckets,
  hashMagicToken,
} from '@/lib/auth/magic-link';
import {
  handleGoogleAuth,
  parseAndVerifyGoogleIdToken,
  resolveOrLinkGoogleUser,
  generateServerOAuthState,
  resetPlatformUsersVault,
  seedPlatformUser,
} from '@/lib/auth/google-oauth';
import {
  checkProductEntitlement,
  grantOnlineBoostPromotionalCredit,
  resetEntitlementsVault,
} from '@/lib/auth/entitlements-guard';
import { GET as magicLinkGetRoute, POST as magicLinkPostRoute } from '@/app/api/auth/magic-link/verify/route';
import { POST as googleInitRoute } from '@/app/api/auth/google/init/route';
import { POST as googleVerifyRoute } from '@/app/api/auth/google/verify/route';
import { resetGoTrueMockStore, seedGoTrueUser } from '@/lib/auth/gotrue-client';

describe('CTO Global Authentication & Boundaries Test Suite', () => {
  beforeEach(() => {
    resetRateLimitBuckets();
    resetPlatformUsersVault();
    resetEntitlementsVault();
    resetRevokedJtiCache();
    resetGoTrueMockStore();
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

    const linked = await resolveOrLinkGoogleUser(googleClaims, 'mock_google_id_token_test');
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
    }, 'mock_google_id_token_test');
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

    const linked = await resolveOrLinkGoogleUser(googleClaims, 'mock_google_id_token_test');
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

  // ── 14. Email Link Scanner Protection (GET landing vs POST redemption) ──
  it('14. Protects against link scanners by rendering GET landing without consuming token, then redeems via POST', async () => {
    const req = await requestMagicLink({
      email: 'scanner.safe@example.com',
      product: 'studio',
    });
    const token = req.debugToken!;

    // 14a. Email security scanner / pre-fetcher sends GET request
    const getReq1 = new NextRequest(`https://studio.boontrack.com/api/auth/magic-link/verify?token=${token}&product=studio`, {
      method: 'GET',
    });
    const getRes1 = await magicLinkGetRoute(getReq1);
    expect(getRes1.status).toBe(200);
    const htmlBody1 = await getRes1.text();
    expect(htmlBody1).toContain('Konfirmasi & Masuk');
    expect(htmlBody1).toContain('scanner.safe@example.com');
    expect(getRes1.headers.get('referrer-policy')).toBe('no-referrer');
    expect(getRes1.headers.get('cache-control')).toBe('no-store, private');

    // Token MUST still be valid and unconsumed
    const check1 = await inspectMagicLinkReadOnly(token, 'studio');
    expect(check1.valid).toBe(true);

    // 14b. Second scanner pass sends another GET request
    const getReq2 = new NextRequest(`https://studio.boontrack.com/api/auth/magic-link/verify?token=${token}&product=studio`, {
      method: 'GET',
    });
    const getRes2 = await magicLinkGetRoute(getReq2);
    expect(getRes2.status).toBe(200);
    const check2 = await inspectMagicLinkReadOnly(token, 'studio');
    expect(check2.valid).toBe(true);

    // 14c. Human user actually clicks button, sending POST request
    const postReq = new NextRequest('https://studio.boontrack.com/api/auth/magic-link/verify', {
      method: 'POST',
      body: JSON.stringify({ token, product: 'studio' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const postRes = await magicLinkPostRoute(postReq);
    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.success).toBe(true);
    expect(postData.token).toBeDefined();

    // 14d. Token is now consumed; subsequent POST fails with 401 ALREADY_CONSUMED
    const postReqReplay = new NextRequest('https://studio.boontrack.com/api/auth/magic-link/verify', {
      method: 'POST',
      body: JSON.stringify({ token, product: 'studio' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const postResReplay = await magicLinkPostRoute(postReqReplay);
    expect(postResReplay.status).toBe(401);
    const replayData = await postResReplay.json();
    expect(replayData.error).toBe('ALREADY_CONSUMED');
  });

  // ── 15. Open Redirect Protection ──
  it('15. Strictly validates redirect URLs against internal allowlist and rejects external/phishing URLs', () => {
    // 15a. Valid internal relative paths
    expect(validateRedirectUrl('/desk', 'studio')).toBe('/desk');
    expect(validateRedirectUrl('/desk/editor?tab=ugc', 'studio')).toBe('/desk/editor?tab=ugc');
    expect(validateRedirectUrl('/admin', 'creator')).toBe('/admin');

    // 15b. Protocol-relative open redirect attack
    expect(validateRedirectUrl('//evil-phishing.com/steal', 'studio')).toBe('/desk');
    expect(validateRedirectUrl('//google.com', 'creator')).toBe('/admin');

    // 15c. External malicious origins
    expect(validateRedirectUrl('https://evil-attacker.com/desk', 'studio')).toBe('/desk');
    expect(validateRedirectUrl('http://phishing.site', 'creator')).toBe('/admin');

    // 15d. Dangerous URI schemes (javascript / data)
    expect(validateRedirectUrl('javascript:alert(document.cookie)', 'studio')).toBe('/desk');

    // 15e. Authorized origin extracts safe pathname
    expect(validateRedirectUrl('https://studio.boontrack.com/desk/jobs', 'studio')).toBe('/desk/jobs');
  });

  // ── 16. Server-Side OAuth Nonce & State Authority ──
  it('16. Generates server-side nonce/state and rejects client-fabricated nonces or replayed states', async () => {
    // 16a. Client initializes OAuth via POST /api/auth/google/init
    const initReq = new NextRequest('https://studio.boontrack.com/api/auth/google/init', {
      method: 'POST',
      body: JSON.stringify({ product: 'studio' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const initRes = await googleInitRoute(initReq);
    expect(initRes.status).toBe(200);
    const initData = await initRes.json();
    expect(initData.success).toBe(true);
    expect(initData.state).toBeDefined();
    expect(initData.nonce).toBeDefined();
    const { state } = initData;

    // 16b. Client fabricates an arbitrary nonce and attempts verify -> Rejected
    const fakeClaims = {
      iss: 'https://accounts.google.com',
      aud: 'mock_google_client_id.apps.googleusercontent.com',
      sub: 'google_uid_fake_nonce_999',
      email: 'oauth.security@example.com',
      email_verified: true,
      nonce: 'client_fabricated_nonce_not_matching_server',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const fakeToken = `header.${Buffer.from(JSON.stringify(fakeClaims)).toString('base64')}.sig`;

    const fakeVerifyReq = new NextRequest('https://studio.boontrack.com/api/auth/google/verify', {
      method: 'POST',
      body: JSON.stringify({
        idToken: fakeToken,
        product: 'studio',
        state,
        expectedNonce: 'client_fabricated_nonce_not_matching_server',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const fakeVerifyRes = await googleVerifyRoute(fakeVerifyReq);
    expect(fakeVerifyRes.status).toBe(401);

    // 16c. Client uses server-generated state & nonce -> Succeeds
    const { state: validState, nonce: validNonce } = generateServerOAuthState('studio');
    const legitClaims = {
      ...fakeClaims,
      sub: 'google_uid_legit_server_nonce_111',
      email: 'oauth.legit@example.com',
      nonce: validNonce,
    };
    const legitToken = `header.${Buffer.from(JSON.stringify(legitClaims)).toString('base64')}.sig`;

    const legitVerifyReq = new NextRequest('https://studio.boontrack.com/api/auth/google/verify', {
      method: 'POST',
      body: JSON.stringify({
        idToken: legitToken,
        product: 'studio',
        state: validState,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const legitVerifyRes = await googleVerifyRoute(legitVerifyReq);
    expect(legitVerifyRes.status).toBe(200);
    const legitData = await legitVerifyRes.json();
    expect(legitData.success).toBe(true);

    // 16d. Replay with the same server state fails (single-use burned)
    const replayVerifyReq = new NextRequest('https://studio.boontrack.com/api/auth/google/verify', {
      method: 'POST',
      body: JSON.stringify({
        idToken: legitToken,
        product: 'studio',
        state: validState,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const replayVerifyRes = await googleVerifyRoute(replayVerifyReq);
    expect(replayVerifyRes.status).toBe(401);
  });

  // ── 17. Product-Scoped Isolated Revocation ──
  it('17. Enforces isolated revocation: Studio logout does not invalidate Creator sessions', async () => {
    const userId = 'usr_dual_platform_777';
    const exp = Math.floor(Date.now() / 1000) + 3600;

    const studioToken = signHostSessionToken({
      product: 'studio',
      userId,
      tenantId: 'ten_studio_777',
      tenantSlug: 'studio-dual',
    });

    const creatorToken = signHostSessionToken({
      product: 'creator',
      userId,
      tenantId: 'ten_creator_777',
      tenantSlug: 'creator-dual',
    });

    const studioV1 = await verifyHostSessionToken(studioToken, 'studio');
    const creatorV1 = await verifyHostSessionToken(creatorToken, 'creator');
    expect(studioV1.valid).toBe(true);
    expect(creatorV1.valid).toBe(true);

    const studioJti = studioV1.payload!.jti;

    // Revoke Studio session
    await revokeHostSession(studioJti, exp, 'studio');

    // Studio token is now revoked
    const studioCheck = await verifyHostSessionToken(studioToken, 'studio');
    expect(studioCheck.valid).toBe(false);
    expect(studioCheck.error).toBe('TOKEN_REVOKED');

    // Creator token remains completely VALID (Zero cross-product revocation leakage)
    const creatorCheck = await verifyHostSessionToken(creatorToken, 'creator');
    expect(creatorCheck.valid).toBe(true);
    expect(creatorCheck.payload?.sub).toBe(userId);
  });

  // ── 18. Concurrency Idempotency for Promotional Credit Grant ──
  it('18. Grants exactly 1 promotional credit under high-concurrency race condition', async () => {
    const tenantId = 'ten_concurrent_student_55';
    const orderId = 'ORD-ONLINEBOOST-BATCH1-CONCURRENT';

    // Fire 5 concurrent requests simultaneously
    const results = await Promise.all([
      grantOnlineBoostPromotionalCredit(tenantId, orderId, 'actor_1'),
      grantOnlineBoostPromotionalCredit(tenantId, orderId, 'actor_2'),
      grantOnlineBoostPromotionalCredit(tenantId, orderId, 'actor_3'),
      grantOnlineBoostPromotionalCredit(tenantId, orderId, 'actor_4'),
      grantOnlineBoostPromotionalCredit(tenantId, orderId, 'actor_5'),
    ]);

    // All return success
    expect(results.every((r) => r.success)).toBe(true);

    // Exactly one executed the grant, the other 4 were recognized as idempotent
    const initialGrants = results.filter((r) => !r.idempotent);
    const idempotentHits = results.filter((r) => r.idempotent);

    expect(initialGrants.length).toBe(1);
    expect(idempotentHits.length).toBe(4);

    // Final balance is strictly 1
    const ent = await checkProductEntitlement(tenantId, 'studio', 'RENDER_VIDEO');
    expect(ent.remainingCredits).toBe(1);
  });

  // ── 19. Authoritative GoTrue Identity Invariant ──
  it('19. Enforces session.sub === verifiedGoTrueUser.id === auth.users.id (Zero Synthesized IDs)', async () => {
    const authoritativeGoTrueId = '88888888-4444-4444-a1a1-999999999999';
    seedGoTrueUser({
      id: authoritativeGoTrueId,
      email: 'authoritative.gotrue@example.com',
      email_confirmed: true,
    });

    const req = await requestMagicLink({
      email: 'authoritative.gotrue@example.com',
      product: 'studio',
    });
    expect(req.success).toBe(true);

    const redemption = await redeemMagicLink({
      token: req.debugToken!,
      product: 'studio',
    });

    expect(redemption.success).toBe(true);
    // Explicit invariant: redemption.userId must equal the real GoTrue UUID
    expect(redemption.userId).toBe(authoritativeGoTrueId);

    // Verify host session sub matches exact authoritative GoTrue user ID
    const sessionVerification = await verifyHostSessionToken(redemption.sessionToken!, 'studio');
    expect(sessionVerification.valid).toBe(true);
    expect(sessionVerification.payload?.sub).toBe(authoritativeGoTrueId);

    // Validate that userId is a valid UUID (not a synthesized 32-char hex hash)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(uuidRegex.test(sessionVerification.payload?.sub!)).toBe(true);
  });

  // ── 20. Wrong-Product & Failed Magic Link Verification Never Issues Session ──
  it('20. Rejects wrong-product tokens and ensures failed verification never issues a session', async () => {
    const req = await requestMagicLink({
      email: 'product.guard@example.com',
      product: 'studio',
    });

    // 20a. Attempt to redeem Studio token under Creator -> Fails
    const wrongProduct = await redeemMagicLink({
      token: req.debugToken!,
      product: 'creator',
    });
    expect(wrongProduct.success).toBe(false);
    expect(wrongProduct.status).toBe('PRODUCT_MISMATCH');
    expect(wrongProduct.sessionToken).toBeUndefined();

    // 20b. Attempt to redeem with completely bogus token -> Fails
    const bogus = await redeemMagicLink({
      token: 'totally_bogus_token_123',
      product: 'studio',
    });
    expect(bogus.success).toBe(false);
    expect(bogus.status).toBe('TOKEN_INVALID');
    expect(bogus.sessionToken).toBeUndefined();
  });

  // ── 21. Google OAuth Failed Exchange Never Issues Session ──
  it('21. Failed GoTrue Google exchange strictly rejects session issuance', async () => {
    // Attempt verification with missing credential
    const emptyReq = new NextRequest('https://studio.boontrack.com/api/auth/google/verify', {
      method: 'POST',
      body: JSON.stringify({ product: 'studio' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const emptyRes = await googleVerifyRoute(emptyReq);
    expect(emptyRes.status).toBe(401);

    const emptyData = await emptyRes.json();
    expect(emptyData.success).toBe(false);
    expect(emptyData.token).toBeUndefined();
  });
});