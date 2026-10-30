/**
 * tests/auth/p0_p1_remediation.test.ts
 * Comprehensive Test Suite for CTO P0/P1 Remediation
 * Baseline: 0fe7f3a
 *
 * Scope:
 * 1. P0: Shared Atomic OAuth State Consumption & Replay Protection
 * 2. P1: RPC Privilege Hardening & Concurrency Exception Mapping
 * 3. P1: Production Repository Fail-Fast & Environment Isolation
 *
 * Invariant Note:
 * These are isolated unit tests running against MockPlatformUserRepository.
 * Because Docker/PostgreSQL is offline on this host, live database integration tests
 * are explicitly distinguished and reported as unexecuted in the audit delivery.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  generateServerOAuthState,
  consumeServerOAuthState,
  handleGoogleAuth,
  resolveOrLinkGoogleUser,
  seedPlatformUser,
  resetPlatformUsersVault,
  type GoogleIdTokenClaims,
} from '@/lib/auth/google-oauth';
import {
  getPlatformUserRepository,
  getMockRepository,
  isLiveDatabaseAvailable,
  SupabasePlatformUserRepository,
} from '@/lib/auth/platform-user-repository';
import { verifyGoTrueGoogleToken, resetGoTrueMockStore } from '@/lib/auth/gotrue-client';

jest.mock('@/lib/auth/gotrue-client', () => {
  const actual = jest.requireActual('@/lib/auth/gotrue-client') as typeof import('@/lib/auth/gotrue-client');
  return {
    ...actual,
    verifyGoTrueGoogleToken: jest.fn(),
  };
});

const mockVerifyGoTrue = verifyGoTrueGoogleToken as jest.MockedFunction<typeof verifyGoTrueGoogleToken>;

const FIXTURE_AUTH_UUID = '55555555-6666-7777-8888-999999999999';

function makeValidJwt(claims: Partial<GoogleIdTokenClaims> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: 'mock_google_client_id.apps.googleusercontent.com',
      sub: 'google_sub_p0_fixture',
      email: 'p0.test@example.com',
      email_verified: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...claims,
    }),
  ).toString('base64');
  return `${header}.${payload}.mock_sig`;
}

beforeEach(() => {
  jest.resetAllMocks();
  resetPlatformUsersVault();
  resetGoTrueMockStore();
  getMockRepository().clear();
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 1: P0 — OAuth State Replay Protection & Atomic Consumption
// ══════════════════════════════════════════════════════════════════════════════

describe('P0 — Shared Atomic OAuth State Consumption & Replay Protection', () => {
  it('1. Valid first consumption succeeds and retrieves expected nonce', async () => {
    const { state, nonce } = generateServerOAuthState('studio');

    const result = await consumeServerOAuthState(state, 'studio');

    expect(result.valid).toBe(true);
    expect(result.nonce).toBe(nonce);
  });

  it('2. Replay rejection: second consumption of the same state fails closed', async () => {
    const { state } = generateServerOAuthState('studio');

    // First consumption succeeds
    const first = await consumeServerOAuthState(state, 'studio');
    expect(first.valid).toBe(true);

    // Second consumption must fail closed
    const second = await consumeServerOAuthState(state, 'studio');
    expect(second.valid).toBe(false);
    expect(second.error).toBe('STATE_ALREADY_CONSUMED');
  });

  it('3. Concurrent consumption: exactly one of two simultaneous requests succeeds', async () => {
    const { state } = generateServerOAuthState('studio');

    // Simulate two concurrent requests arriving at the same millisecond
    const [resA, resB] = await Promise.all([
      consumeServerOAuthState(state, 'studio'),
      consumeServerOAuthState(state, 'studio'),
    ]);

    const successes = [resA, resB].filter((r) => r.valid);
    const failures = [resA, resB].filter((r) => !r.valid);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].error).toBe('STATE_ALREADY_CONSUMED');
  });

  it('4. Cross-worker shared consumption semantics: state is recorded in shared repository', async () => {
    const { state } = generateServerOAuthState('creator');

    // Extract state identifier from HMAC token
    const [payloadB64] = state.split('.');
    const data = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const stateHash = crypto.createHash('sha256').update(data.id).digest('hex');

    // Before consumption: not recorded
    expect(getMockRepository().isStateConsumedSync(stateHash)).toBe(false);

    // Worker 1 consumes
    const res = await consumeServerOAuthState(state, 'creator');
    expect(res.valid).toBe(true);

    // After consumption: recorded in repository
    expect(getMockRepository().isStateConsumedSync(stateHash)).toBe(true);

    // Worker 2 attempts consumption using the same repository
    const worker2Res = await consumeServerOAuthState(state, 'creator');
    expect(worker2Res.valid).toBe(false);
    expect(worker2Res.error).toBe('STATE_ALREADY_CONSUMED');
  });

  it('5. Expired state rejection: state past its 10-minute expiry is rejected before consumption', async () => {
    const secret =
      process.env.SESSION_SECRET ||
      process.env.NEXTAUTH_SECRET ||
      'boontrack_oauth_state_hmac_secret_2026';

    const expiredPayload = {
      id: 'expired_state_id_001',
      nonce: 'nonce_expired',
      product: 'studio',
      exp: Date.now() - 5000, // 5 seconds in the past
    };
    const payloadB64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
    const expiredState = `${payloadB64}.${sig}`;

    const result = await consumeServerOAuthState(expiredState, 'studio');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('STATE_EXPIRED');
  });

  it('6. Wrong product/purpose rejection: state generated for studio rejected when submitted for creator', async () => {
    const { state } = generateServerOAuthState('studio');

    const result = await consumeServerOAuthState(state, 'creator');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('STATE_PRODUCT_MISMATCH');
  });

  it('7. Database unavailable: fails closed with DATABASE_ERROR when state store is down', async () => {
    const { state } = generateServerOAuthState('studio');

    // Simulate database unreachable
    getMockRepository().setDatabaseFailure(true);

    const result = await consumeServerOAuthState(state, 'studio');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('DATABASE_ERROR');
  });

  it('8. No session on failed consumption: handleGoogleAuth aborts before GoTrue exchange', async () => {
    const { state, nonce } = generateServerOAuthState('studio');

    // First: consume it to burn the state
    const firstBurn = await consumeServerOAuthState(state, 'studio');
    expect(firstBurn.valid).toBe(true);

    // Second: submit to handleGoogleAuth with the burned state
    const jwt = makeValidJwt({ nonce });
    const authResult = await handleGoogleAuth({
      idToken: jwt,
      product: 'studio',
      state,
    });

    expect(authResult.success).toBe(false);
    expect(authResult.status).toBe('STATE_ALREADY_CONSUMED');
    expect(authResult.sessionToken).toBeUndefined();
    // Invariant: GoTrue must NEVER be invoked if state consumption fails
    expect(mockVerifyGoTrue).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 2: P1 — RPC Privilege Hardening & Concurrency Exception Mapping
// ══════════════════════════════════════════════════════════════════════════════

describe('P1 — SQL Migration Security & Privilege Hardening Review', () => {
  const MIGRATION_PATH_1 = path.join(
    __dirname,
    '../../supabase/migrations/20261030_atomic_google_identity_linking.sql',
  );
  const MIGRATION_PATH_2 = path.join(
    __dirname,
    '../../supabase/migrations/20261030_shared_oauth_state_replay_protection.sql',
  );

  it('9. Verifies fn_link_google_identity explicitly revokes execution from PUBLIC/anon/authenticated and grants only to service_role', () => {
    expect(fs.existsSync(MIGRATION_PATH_1)).toBe(true);
    const sql = fs.readFileSync(MIGRATION_PATH_1, 'utf8');

    // Must revoke from PUBLIC, anon, authenticated
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.fn_link_google_identity.*FROM PUBLIC, anon, authenticated;/i);
    // Must grant strictly to service_role
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_link_google_identity.*TO service_role;/i);
  });

  it('10. Verifies fn_consume_oauth_state explicitly revokes execution from PUBLIC/anon/authenticated and grants only to service_role', () => {
    expect(fs.existsSync(MIGRATION_PATH_2)).toBe(true);
    const sql = fs.readFileSync(MIGRATION_PATH_2, 'utf8');

    // Must revoke from PUBLIC, anon, authenticated
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.fn_consume_oauth_state.*FROM PUBLIC, anon, authenticated;/i);
    // Must grant strictly to service_role
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_consume_oauth_state.*TO service_role;/i);
  });

  it('11. Verifies SECURITY DEFINER and safe search_path = public, auth, pg_temp are set on all functions', () => {
    const sql1 = fs.readFileSync(MIGRATION_PATH_1, 'utf8');
    const sql2 = fs.readFileSync(MIGRATION_PATH_2, 'utf8');

    expect(sql1).toMatch(/SECURITY DEFINER/);
    expect(sql1).toMatch(/SET search_path = public, auth, pg_temp/);

    expect(sql2).toMatch(/SECURITY DEFINER/);
    expect(sql2).toMatch(/SET search_path = public, auth, pg_temp/);
  });

  it('12. Verifies fn_link_google_identity contains EXCEPTION WHEN unique_violation mapping to GOOGLE_IDENTITY_ALREADY_LINKED', () => {
    const sql = fs.readFileSync(MIGRATION_PATH_1, 'utf8');

    expect(sql).toMatch(/EXCEPTION WHEN unique_violation THEN/);
    expect(sql).toMatch(/uq_platform_users_google_sub/);
    expect(sql).toMatch(/GOOGLE_IDENTITY_ALREADY_LINKED/);
  });

  it('13. SupabasePlatformUserRepository maps PostgreSQL unique violation (code 23505) to GOOGLE_IDENTITY_ALREADY_LINKED', async () => {
    const repo = new SupabasePlatformUserRepository();

    // Mock admin.rpc throwing unique_violation error code 23505
    const mockAdmin = {
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "uq_platform_users_google_sub"',
          details: 'Key (google_sub)=(already_bound_sub_999) already exists.',
        },
      }),
    };

    // Spy on getSupabaseAdmin
    jest.spyOn(require('@/lib/supabaseClient'), 'getSupabaseAdmin').mockReturnValue(mockAdmin as any);

    const result = await repo.linkGoogleIdentity({
      authUserId: FIXTURE_AUTH_UUID,
      email: 'concurrent.collision@example.com',
      googleSub: 'already_bound_sub_999',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('GOOGLE_IDENTITY_ALREADY_LINKED');
  });

  it('14. SupabasePlatformUserRepository preserves unrelated database errors as DATABASE_ERROR without masking', async () => {
    const repo = new SupabasePlatformUserRepository();

    const mockAdmin = {
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: {
          code: '08006',
          message: 'connection_failure',
        },
      }),
    };

    jest.spyOn(require('@/lib/supabaseClient'), 'getSupabaseAdmin').mockReturnValue(mockAdmin as any);

    const result = await repo.linkGoogleIdentity({
      authUserId: FIXTURE_AUTH_UUID,
      email: 'unrelated.err@example.com',
      googleSub: 'some_sub_123',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('DATABASE_ERROR');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUITE 3: P1 — Production Repository Fail-Fast & Environment Isolation
// ══════════════════════════════════════════════════════════════════════════════

describe('P1 — Production Repository Fail-Fast & Environment Isolation', () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
  });

  afterAll(() => {
    process.env = origEnv;
  });

  it('15. Production environment throws fatal error when database credentials are missing (NEVER falls back to mock)', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => getPlatformUserRepository()).toThrow(
      /\[FATAL\] Production misconfiguration.*Silent fallback to in-memory mock repository is strictly prohibited/,
    );
  });

  it('16. Production environment throws fatal error when service key contains mock placeholder', () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://valid.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_service_role_key';

    expect(() => getPlatformUserRepository()).toThrow(
      /\[FATAL\] Production misconfiguration/,
    );
  });

  it('17. Test environment (NODE_ENV === test) explicitly and safely selects isolated mock repository', () => {
    process.env.NODE_ENV = 'test';

    const repo = getPlatformUserRepository();

    expect(repo).toBeDefined();
    // Assert it is the mock instance, preserving deterministic offline test execution
    expect(repo).toBe(getMockRepository());
  });
});
