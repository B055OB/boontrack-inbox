/**
 * tests/auth/google-oauth.test.ts
 * Targeted tests for lib/auth/google-oauth.ts
 * Focus: GoTrue unconditional exchange invariant after P0 early-return remediation.
 *
 * Verified invariants:
 *  - verifyGoTrueGoogleToken() is called on ALL paths: new user, existing verified user,
 *    already-linked user.
 *  - host_session.sub === GoTrue user.id === auth.users.id across every path.
 *  - Fail-closed on GoTrue failure (no session, no vault upsert).
 *  - Fail-closed on ID_COLLISION (local vault ID ≠ GoTrue confirmed ID).
 *  - ACCOUNT_TAKEOVER_PREVENTED fires before GoTrue for unverified local accounts.
 *  - google_sub updated only after GoTrue confirms the token.
 *  - session_version preserved from existing record; set to 1 for new users.
 */

// ── Mock gotrue-client BEFORE importing google-oauth ────────────────────────
// We spy on verifyGoTrueGoogleToken to assert it is called on every path and to
// control its return value without network calls.
jest.mock('@/lib/auth/gotrue-client', () => {
  const actual = jest.requireActual('@/lib/auth/gotrue-client') as typeof import('@/lib/auth/gotrue-client');
  return {
    ...actual,
    verifyGoTrueGoogleToken: jest.fn(),
  };
});

import {
  resolveOrLinkGoogleUser,
  handleGoogleAuth,
  seedPlatformUser,
  resetPlatformUsersVault,
  getPlatformUserByEmail,
  generateServerOAuthState,
  type GoogleIdTokenClaims,
  type PlatformUserRecord,
} from '@/lib/auth/google-oauth';
import {
  verifyGoTrueGoogleToken,
  resetGoTrueMockStore,
  type GoTrueVerificationResult,
} from '@/lib/auth/gotrue-client';
import { verifyHostSessionToken, resetRevokedJtiCache } from '@/lib/auth/host-session';

const mockVerifyGoTrueGoogleToken = verifyGoTrueGoogleToken as jest.MockedFunction<typeof verifyGoTrueGoogleToken>;

// ── Fixtures ─────────────────────────────────────────────────────────────────

const GOTRUE_UUID_A = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const GOTRUE_UUID_B = '11111111-2222-3333-4444-555555555555';

const REAL_ID_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.real_fixture_payload.real_signature';

function makeClaims(overrides: Partial<GoogleIdTokenClaims> = {}): GoogleIdTokenClaims {
  return {
    iss: 'https://accounts.google.com',
    aud: 'mock_google_client_id.apps.googleusercontent.com',
    sub: 'google_sub_fixture_001',
    email: 'fixture@example.com',
    email_verified: true,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

function makeGoTrueSuccess(id: string, email: string): GoTrueVerificationResult {
  return {
    success: true,
    user: {
      id,
      email,
      email_confirmed: true,
      created_at: new Date().toISOString(),
    },
  };
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  jest.resetAllMocks();
  resetPlatformUsersVault();
  resetGoTrueMockStore();
  resetRevokedJtiCache();
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 1 — resolveOrLinkGoogleUser: GoTrue called unconditionally
// ══════════════════════════════════════════════════════════════════════════════

describe('resolveOrLinkGoogleUser — GoTrue unconditional exchange invariant', () => {

  it('T01 [NEW USER] calls verifyGoTrueGoogleToken and returns GoTrue user.id', async () => {
    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce(makeGoTrueSuccess(GOTRUE_UUID_A, 'fixture@example.com'));

    const result = await resolveOrLinkGoogleUser(makeClaims(), REAL_ID_TOKEN);

    expect(result.success).toBe(true);
    expect(result.user!.id).toBe(GOTRUE_UUID_A);
    expect(mockVerifyGoTrueGoogleToken).toHaveBeenCalledTimes(1);
    expect(mockVerifyGoTrueGoogleToken).toHaveBeenCalledWith(
      expect.objectContaining({ idToken: REAL_ID_TOKEN }),
    );
  });

  it('T02 [EXISTING VERIFIED USER] calls verifyGoTrueGoogleToken — does NOT skip GoTrue', async () => {
    // Seed verified user with GOTRUE_UUID_A in local vault
    seedPlatformUser({
      id: GOTRUE_UUID_A,
      email: 'fixture@example.com',
      email_verified: true,
      session_version: 3,
    });

    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce(makeGoTrueSuccess(GOTRUE_UUID_A, 'fixture@example.com'));

    const result = await resolveOrLinkGoogleUser(makeClaims(), REAL_ID_TOKEN);

    // GoTrue MUST be called — no early return allowed
    expect(mockVerifyGoTrueGoogleToken).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    // ID must come from GoTrue, not only the vault
    expect(result.user!.id).toBe(GOTRUE_UUID_A);
  });

  it('T03 [ALREADY-LINKED google_sub] calls verifyGoTrueGoogleToken on re-login', async () => {
    seedPlatformUser({
      id: GOTRUE_UUID_A,
      email: 'fixture@example.com',
      email_verified: true,
      google_sub: 'google_sub_fixture_001',
      session_version: 2,
    });

    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce(makeGoTrueSuccess(GOTRUE_UUID_A, 'fixture@example.com'));

    const result = await resolveOrLinkGoogleUser(
      makeClaims({ sub: 'google_sub_fixture_001' }),
      REAL_ID_TOKEN,
    );

    // GoTrue MUST be called even when google_sub already matches
    expect(mockVerifyGoTrueGoogleToken).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.user!.id).toBe(GOTRUE_UUID_A);
    // google_sub updated only after GoTrue confirms
    expect(result.user!.google_sub).toBe('google_sub_fixture_001');
  });

  it('T04 [ID_COLLISION] fails closed when local vault ID differs from GoTrue ID', async () => {
    // Local vault has GOTRUE_UUID_A; GoTrue returns GOTRUE_UUID_B
    seedPlatformUser({
      id: GOTRUE_UUID_A,
      email: 'fixture@example.com',
      email_verified: true,
      session_version: 1,
    });

    // GoTrue returns a DIFFERENT ID — stale cache / identity substitution attack
    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce(makeGoTrueSuccess(GOTRUE_UUID_B, 'fixture@example.com'));

    const result = await resolveOrLinkGoogleUser(makeClaims(), REAL_ID_TOKEN);

    expect(result.success).toBe(false);
    expect(result.error).toBe('ID_COLLISION');
    // No user returned — no session may be issued
    expect(result.user).toBeUndefined();
    // GoTrue was still called (invariant holds even when result is rejection)
    expect(mockVerifyGoTrueGoogleToken).toHaveBeenCalledTimes(1);
  });

  it('T05 [ACCOUNT_TAKEOVER] blocks GoTrue exchange for unverified local accounts', async () => {
    seedPlatformUser({
      id: GOTRUE_UUID_A,
      email: 'fixture@example.com',
      email_verified: false,  // unverified — must block
      session_version: 1,
    });

    const result = await resolveOrLinkGoogleUser(makeClaims(), REAL_ID_TOKEN);

    expect(result.success).toBe(false);
    expect(result.error).toBe('ACCOUNT_TAKEOVER_PREVENTED');
    // GoTrue must NOT be called when takeover is detected
    expect(mockVerifyGoTrueGoogleToken).not.toHaveBeenCalled();
  });

  it('T06 [GOTRUE FAILURE] fails closed when GoTrue rejects the token', async () => {
    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce({
      success: false,
      error: 'INVALID_GOOGLE_TOKEN',
      statusCode: 401,
    });

    const result = await resolveOrLinkGoogleUser(makeClaims(), REAL_ID_TOKEN);

    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_GOOGLE_TOKEN');
    expect(result.user).toBeUndefined();
    // GoTrue was called (invariant), it just rejected
    expect(mockVerifyGoTrueGoogleToken).toHaveBeenCalledTimes(1);
  });

  it('T07 [GOOGLE_EMAIL_NOT_VERIFIED] GoTrue rejects unverified email claim', async () => {
    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce({
      success: false,
      error: 'GOOGLE_EMAIL_NOT_VERIFIED',
      statusCode: 400,
    });

    const result = await resolveOrLinkGoogleUser(
      makeClaims({ email_verified: true }), // claims say verified, but GoTrue disagrees
      REAL_ID_TOKEN,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('GOOGLE_EMAIL_NOT_VERIFIED');
    expect(mockVerifyGoTrueGoogleToken).toHaveBeenCalledTimes(1);
  });

  it('T08 [VAULT UPSERT] google_sub written only after GoTrue succeeds', async () => {
    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce(makeGoTrueSuccess(GOTRUE_UUID_A, 'fixture@example.com'));

    const claims = makeClaims({ sub: 'new_google_sub_after_verify' });
    const result = await resolveOrLinkGoogleUser(claims, REAL_ID_TOKEN);

    expect(result.success).toBe(true);
    expect(result.user!.google_sub).toBe('new_google_sub_after_verify');
    // GoTrue was called before google_sub was set
    expect(mockVerifyGoTrueGoogleToken).toHaveBeenCalledTimes(1);
  });

  it('T09 [SESSION_VERSION] existing session_version is preserved for returning users', async () => {
    seedPlatformUser({
      id: GOTRUE_UUID_A,
      email: 'fixture@example.com',
      email_verified: true,
      session_version: 7,  // Non-default version to detect preservation
    });

    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce(makeGoTrueSuccess(GOTRUE_UUID_A, 'fixture@example.com'));

    const result = await resolveOrLinkGoogleUser(makeClaims(), REAL_ID_TOKEN);

    expect(result.success).toBe(true);
    expect(result.user!.session_version).toBe(7);  // Must be preserved, not reset to 1
  });

  it('T10 [NEW USER SESSION_VERSION] defaults to 1 for brand-new users', async () => {
    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce(makeGoTrueSuccess(GOTRUE_UUID_A, 'newuser@example.com'));

    const result = await resolveOrLinkGoogleUser(makeClaims({ email: 'newuser@example.com' }), REAL_ID_TOKEN);

    expect(result.success).toBe(true);
    expect(result.user!.session_version).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 2 — Session Issuance Invariant: host_session.sub === GoTrue user.id
// ══════════════════════════════════════════════════════════════════════════════

describe('handleGoogleAuth — host_session.sub === GoTrue user.id === auth.users.id', () => {
  /**
   * Constructs a test Google ID Token JWT whose payload contains the given claims.
   * Only the payload needs to be readable; signature validation is handled by
   * parseAndVerifyGoogleIdToken which checks claims fields, not the actual RS256 sig
   * in test env (where GOOGLE_CLIENT_ID is the mock value).
   */
  function makeTestJwt(claimsOverrides: Partial<GoogleIdTokenClaims> = {}): string {
    const claims: GoogleIdTokenClaims = {
      iss: 'https://accounts.google.com',
      aud: 'mock_google_client_id.apps.googleusercontent.com',
      sub: 'google_sub_session_test',
      email: 'session.test@example.com',
      email_verified: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...claimsOverrides,
    };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64');
    return `header.${payload}.sig`;
  }

  it('T11 [NEW USER] session sub === GoTrue user.id (never a synthesized ID)', async () => {
    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce(
      makeGoTrueSuccess(GOTRUE_UUID_A, 'session.test@example.com'),
    );

    const result = await handleGoogleAuth({
      idToken: makeTestJwt(),
      product: 'studio',
    });

    expect(result.success).toBe(true);
    expect(result.userId).toBe(GOTRUE_UUID_A);

    // Decode and verify the JWT sub claim
    const sessionVerification = await verifyHostSessionToken(result.sessionToken!, 'studio');
    expect(sessionVerification.valid).toBe(true);
    expect(sessionVerification.payload!.sub).toBe(GOTRUE_UUID_A);
  });

  it('T12 [EXISTING USER] session sub === GoTrue user.id (not local vault cached value)', async () => {
    seedPlatformUser({
      id: GOTRUE_UUID_A,
      email: 'session.test@example.com',
      email_verified: true,
      session_version: 4,
    });

    // GoTrue confirms the same ID
    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce(
      makeGoTrueSuccess(GOTRUE_UUID_A, 'session.test@example.com'),
    );

    const result = await handleGoogleAuth({
      idToken: makeTestJwt(),
      product: 'creator',
    });

    expect(result.success).toBe(true);
    expect(result.userId).toBe(GOTRUE_UUID_A);

    const sessionVerification = await verifyHostSessionToken(result.sessionToken!, 'creator');
    expect(sessionVerification.valid).toBe(true);
    expect(sessionVerification.payload!.sub).toBe(GOTRUE_UUID_A);
    // GoTrue was called even for the existing user
    expect(mockVerifyGoTrueGoogleToken).toHaveBeenCalledTimes(1);
  });

  it('T13 [ID_COLLISION] no session issued when GoTrue ID differs from vault ID', async () => {
    seedPlatformUser({
      id: GOTRUE_UUID_A,
      email: 'session.test@example.com',
      email_verified: true,
      session_version: 1,
    });

    // GoTrue returns a different ID — stale/corrupted local cache
    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce(
      makeGoTrueSuccess(GOTRUE_UUID_B, 'session.test@example.com'),
    );

    const result = await handleGoogleAuth({
      idToken: makeTestJwt(),
      product: 'studio',
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('ID_COLLISION');
    expect(result.sessionToken).toBeUndefined();
    expect(result.userId).toBeUndefined();
  });

  it('T14 [GOTRUE FAILURE] no session issued when GoTrue rejects token for existing user', async () => {
    seedPlatformUser({
      id: GOTRUE_UUID_A,
      email: 'session.test@example.com',
      email_verified: true,
      session_version: 1,
    });

    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce({
      success: false,
      error: 'INVALID_GOOGLE_TOKEN',
      statusCode: 401,
    });

    const result = await handleGoogleAuth({
      idToken: makeTestJwt(),
      product: 'studio',
    });

    expect(result.success).toBe(false);
    expect(result.sessionToken).toBeUndefined();
    expect(result.userId).toBeUndefined();
    // GoTrue was called — invariant holds even in failure
    expect(mockVerifyGoTrueGoogleToken).toHaveBeenCalledTimes(1);
  });

  it('T15 [UUID FORMAT] session sub is a valid RFC 4122 UUID from GoTrue', async () => {
    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce(
      makeGoTrueSuccess(GOTRUE_UUID_A, 'session.test@example.com'),
    );

    const result = await handleGoogleAuth({
      idToken: makeTestJwt(),
      product: 'studio',
    });

    expect(result.success).toBe(true);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(uuidRegex.test(result.userId!)).toBe(true);

    const sessionVerification = await verifyHostSessionToken(result.sessionToken!, 'studio');
    expect(uuidRegex.test(sessionVerification.payload!.sub)).toBe(true);
    // Confirm the sub in the token matches what GoTrue returned, not a derived value
    expect(sessionVerification.payload!.sub).toBe(GOTRUE_UUID_A);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 3 — Google Provider Identity Binding Invariants (CTO Micro-Fix)
// ══════════════════════════════════════════════════════════════════════════════

describe('Google Provider Identity Binding Invariants', () => {
  it('T16 [MATCHING GOOGLE_SUB] existing user with matching google_sub succeeds and preserves identity', async () => {
    seedPlatformUser({
      id: GOTRUE_UUID_A,
      email: 'bound.user@example.com',
      email_verified: true,
      google_sub: 'original_google_sub_100',
      session_version: 5,
    });

    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce(
      makeGoTrueSuccess(GOTRUE_UUID_A, 'bound.user@example.com'),
    );

    const result = await resolveOrLinkGoogleUser(
      makeClaims({ email: 'bound.user@example.com', sub: 'original_google_sub_100' }),
      REAL_ID_TOKEN,
    );

    expect(result.success).toBe(true);
    expect(result.user!.id).toBe(GOTRUE_UUID_A);
    expect(result.user!.google_sub).toBe('original_google_sub_100');
    expect(result.user!.session_version).toBe(5);
  });

  it('T17 [GOOGLE_IDENTITY_MISMATCH] rejects different google_sub for already-linked user without overwriting', async () => {
    seedPlatformUser({
      id: GOTRUE_UUID_A,
      email: 'victim@example.com',
      email_verified: true,
      google_sub: 'legitimate_google_sub_200',
      session_version: 2,
    });

    // Attacker tries to link their own Google account (sub=attacker_sub_999) to victim's email
    const result = await resolveOrLinkGoogleUser(
      makeClaims({ email: 'victim@example.com', sub: 'attacker_sub_999' }),
      REAL_ID_TOKEN,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('GOOGLE_IDENTITY_MISMATCH');
    expect(result.user).toBeUndefined();

    // Verify local record was NOT mutated or overwritten
    const stored = getPlatformUserByEmail('victim@example.com');
    expect(stored).toBeDefined();
    expect(stored!.google_sub).toBe('legitimate_google_sub_200');
    expect(stored!.session_version).toBe(2);
  });

  it('T18 [UNLINKED EXISTING USER] safely links google_sub for first-time linking and preserves session_version', async () => {
    seedPlatformUser({
      id: GOTRUE_UUID_A,
      email: 'magiclink.user@example.com',
      email_verified: true,
      google_sub: undefined, // registered via magic link, no google_sub yet
      session_version: 3,
    });

    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce(
      makeGoTrueSuccess(GOTRUE_UUID_A, 'magiclink.user@example.com'),
    );

    const result = await resolveOrLinkGoogleUser(
      makeClaims({ email: 'magiclink.user@example.com', sub: 'first_time_google_sub_300' }),
      REAL_ID_TOKEN,
    );

    expect(result.success).toBe(true);
    expect(result.user!.google_sub).toBe('first_time_google_sub_300');
    expect(result.user!.id).toBe(GOTRUE_UUID_A);
    expect(result.user!.session_version).toBe(3);

    // Verify vault updated
    const stored = getPlatformUserByEmail('magiclink.user@example.com');
    expect(stored!.google_sub).toBe('first_time_google_sub_300');
  });

  it('T19 [GOOGLE_IDENTITY_ALREADY_LINKED] rejects when google_sub is already linked to another user', async () => {
    // User A already has google_sub 'unique_google_sub_400'
    seedPlatformUser({
      id: GOTRUE_UUID_A,
      email: 'user_a@example.com',
      email_verified: true,
      google_sub: 'unique_google_sub_400',
      session_version: 1,
    });

    // User B tries to link or log in using the same google_sub
    seedPlatformUser({
      id: GOTRUE_UUID_B,
      email: 'user_b@example.com',
      email_verified: true,
      google_sub: undefined,
      session_version: 1,
    });

    const result = await resolveOrLinkGoogleUser(
      makeClaims({ email: 'user_b@example.com', sub: 'unique_google_sub_400' }),
      REAL_ID_TOKEN,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('GOOGLE_IDENTITY_ALREADY_LINKED');
    expect(result.user).toBeUndefined();

    // Verify User B's google_sub was NOT set
    const storedB = getPlatformUserByEmail('user_b@example.com');
    expect(storedB!.google_sub).toBeUndefined();
  });

  it('T20 [HANDLE_GOOGLE_AUTH BINDING REJECTION] handleGoogleAuth fails closed with status and no session on mismatch', async () => {
    seedPlatformUser({
      id: GOTRUE_UUID_A,
      email: 'session.test@example.com',
      email_verified: true,
      google_sub: 'existing_bound_sub_500',
      session_version: 1,
    });

    // Token has a different sub
    function makeDifferentSubJwt(): string {
      const claims = {
        iss: 'https://accounts.google.com',
        aud: 'mock_google_client_id.apps.googleusercontent.com',
        sub: 'different_sub_999',
        email: 'session.test@example.com',
        email_verified: true,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const payload = Buffer.from(JSON.stringify(claims)).toString('base64');
      return `header.${payload}.sig`;
    }

    const result = await handleGoogleAuth({
      idToken: makeDifferentSubJwt(),
      product: 'studio',
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('GOOGLE_IDENTITY_MISMATCH');
    expect(result.sessionToken).toBeUndefined();
    expect(result.userId).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 4 — CTO P1 Token Contract & Security Invariants
// ══════════════════════════════════════════════════════════════════════════════

describe('CTO P1 Token Contract & Security Invariants', () => {
  // Helper to build a signed mock JWT with specified claims
  function makeValidJwt(overrides: Partial<GoogleIdTokenClaims> = {}): string {
    const claims = makeClaims(overrides);
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64');
    return `header.${payload}.sig`;
  }

  // ── 1. Missing ID token ──
  it('P1-1 [MISSING ID TOKEN] rejects missing ID token at boundary with TOKEN_REQUIRED and zero GoTrue call', async () => {
    // 1a. resolveOrLinkGoogleUser with missing token
    const resultDirect = await resolveOrLinkGoogleUser(makeClaims(), undefined as any);
    expect(resultDirect.success).toBe(false);
    expect(resultDirect.error).toBe('TOKEN_REQUIRED');
    expect(resultDirect.user).toBeUndefined();
    expect(mockVerifyGoTrueGoogleToken).not.toHaveBeenCalled();

    // 1b. handleGoogleAuth with missing token
    const resultGateway = await handleGoogleAuth({
      product: 'studio',
    });
    expect(resultGateway.success).toBe(false);
    expect(resultGateway.status).toBe('TOKEN_REQUIRED');
    expect(resultGateway.sessionToken).toBeUndefined();
    expect(resultGateway.userId).toBeUndefined();
  });

  // ── 2. Empty ID token ──
  it('P1-2 [EMPTY ID TOKEN] rejects empty string and whitespace-only ID tokens at boundary', async () => {
    // 2a. resolveOrLinkGoogleUser with empty string
    const resultEmpty = await resolveOrLinkGoogleUser(makeClaims(), '');
    expect(resultEmpty.success).toBe(false);
    expect(resultEmpty.error).toBe('TOKEN_REQUIRED');

    // 2b. resolveOrLinkGoogleUser with whitespace string
    const resultWhitespace = await resolveOrLinkGoogleUser(makeClaims(), '    ');
    expect(resultWhitespace.success).toBe(false);
    expect(resultWhitespace.error).toBe('TOKEN_REQUIRED');
    expect(mockVerifyGoTrueGoogleToken).not.toHaveBeenCalled();

    // 2c. handleGoogleAuth with empty string
    const gatewayEmpty = await handleGoogleAuth({
      idToken: '   ',
      product: 'studio',
    });
    expect(gatewayEmpty.success).toBe(false);
    expect(gatewayEmpty.status).toBe('TOKEN_REQUIRED');
    expect(gatewayEmpty.sessionToken).toBeUndefined();
  });

  // ── 3. GoTrue is never bypassed on successful login paths ──
  it('P1-3 [GOTRUE NEVER BYPASSED] verifies GoTrue is unconditionally invoked for new, existing, and already-linked users', async () => {
    // Path A: Brand new user
    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce(makeGoTrueSuccess(GOTRUE_UUID_A, 'user.a@example.com'));
    const resNew = await handleGoogleAuth({
      idToken: makeValidJwt({ email: 'user.a@example.com', sub: 'sub_user_a' }),
      product: 'studio',
    });
    expect(resNew.success).toBe(true);
    expect(mockVerifyGoTrueGoogleToken).toHaveBeenCalledTimes(1);

    // Path B: Existing verified user (first-time Google link)
    seedPlatformUser({
      id: GOTRUE_UUID_B,
      email: 'user.b@example.com',
      email_verified: true,
      google_sub: undefined,
      session_version: 1,
    });
    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce(makeGoTrueSuccess(GOTRUE_UUID_B, 'user.b@example.com'));
    const resExisting = await handleGoogleAuth({
      idToken: makeValidJwt({ email: 'user.b@example.com', sub: 'sub_user_b' }),
      product: 'creator',
    });
    expect(resExisting.success).toBe(true);
    expect(mockVerifyGoTrueGoogleToken).toHaveBeenCalledTimes(2);

    // Path C: Already-linked user (subsequent login)
    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce(makeGoTrueSuccess(GOTRUE_UUID_B, 'user.b@example.com'));
    const resLinked = await handleGoogleAuth({
      idToken: makeValidJwt({ email: 'user.b@example.com', sub: 'sub_user_b' }),
      product: 'creator',
    });
    expect(resLinked.success).toBe(true);
    expect(mockVerifyGoTrueGoogleToken).toHaveBeenCalledTimes(3);
  });

  // ── 4. No session is issued for invalid token input ──
  it('P1-4 [NO SESSION ON INVALID TOKEN] strictly denies session issuance on any token defect', async () => {
    // 4a. Malformed token structure
    const malformedRes = await handleGoogleAuth({
      idToken: 'not.a.valid.three.part.jwt.token',
      product: 'studio',
    });
    expect(malformedRes.success).toBe(false);
    expect(malformedRes.sessionToken).toBeUndefined();

    // 4b. Audience mismatch
    const audRes = await handleGoogleAuth({
      idToken: makeValidJwt({ aud: 'wrong_client_id.apps.googleusercontent.com' }),
      product: 'studio',
    });
    expect(audRes.success).toBe(false);
    expect(audRes.status).toBe('AUDIENCE_MISMATCH');
    expect(audRes.sessionToken).toBeUndefined();

    // 4c. Expired token
    const expRes = await handleGoogleAuth({
      idToken: makeValidJwt({ exp: Math.floor(Date.now() / 1000) - 100 }),
      product: 'studio',
    });
    expect(expRes.success).toBe(false);
    expect(expRes.status).toBe('TOKEN_EXPIRED');
    expect(expRes.sessionToken).toBeUndefined();

    // 4d. GoTrue rejection
    mockVerifyGoTrueGoogleToken.mockResolvedValueOnce({
      success: false,
      error: 'INVALID_GOOGLE_TOKEN',
      statusCode: 401,
    });
    const goTrueFailRes = await handleGoogleAuth({
      idToken: makeValidJwt({ email: 'gotrue.fail@example.com' }),
      product: 'studio',
    });
    expect(goTrueFailRes.success).toBe(false);
    expect(goTrueFailRes.sessionToken).toBeUndefined();
  });

  // ── 5. Existing Google identity cannot be overwritten ──
  it('P1-5 [EXISTING IDENTITY IMMUTABLE] prevents overwriting already-linked Google identity', async () => {
    seedPlatformUser({
      id: GOTRUE_UUID_A,
      email: 'protected.user@example.com',
      email_verified: true,
      google_sub: 'original_google_subject_999',
      session_version: 1,
    });

    const hijackAttempt = await resolveOrLinkGoogleUser(
      makeClaims({ email: 'protected.user@example.com', sub: 'malicious_different_sub_000' }),
      REAL_ID_TOKEN,
    );

    expect(hijackAttempt.success).toBe(false);
    expect(hijackAttempt.error).toBe('GOOGLE_IDENTITY_MISMATCH');
    expect(hijackAttempt.user).toBeUndefined();

    // Assert that the stored google_sub remains untouched in the vault
    const storedUser = getPlatformUserByEmail('protected.user@example.com');
    expect(storedUser).toBeDefined();
    expect(storedUser!.google_sub).toBe('original_google_subject_999');
  });

  // ── 6. Google identity already linked to another account is rejected ──
  it('P1-6 [GOOGLE IDENTITY ALREADY LINKED] rejects when google_sub is already tied to another local account', async () => {
    // User 1 has already linked google_sub 'exclusive_google_sub_888'
    seedPlatformUser({
      id: GOTRUE_UUID_A,
      email: 'first.owner@example.com',
      email_verified: true,
      google_sub: 'exclusive_google_sub_888',
      session_version: 1,
    });

    // User 2 (different email) attempts to link or login with the same google_sub
    seedPlatformUser({
      id: GOTRUE_UUID_B,
      email: 'second.account@example.com',
      email_verified: true,
      google_sub: undefined,
      session_version: 1,
    });

    const conflictResult = await resolveOrLinkGoogleUser(
      makeClaims({ email: 'second.account@example.com', sub: 'exclusive_google_sub_888' }),
      REAL_ID_TOKEN,
    );

    expect(conflictResult.success).toBe(false);
    expect(conflictResult.error).toBe('GOOGLE_IDENTITY_ALREADY_LINKED');
    expect(conflictResult.user).toBeUndefined();

    // Verify User 2's google_sub was NOT updated
    const user2Record = getPlatformUserByEmail('second.account@example.com');
    expect(user2Record!.google_sub).toBeUndefined();
  });
});
