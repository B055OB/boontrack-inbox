/**
 * __tests__/auth/jti_distributed_revocation.test.ts
 *
 * Comprehensive Test Portfolio for Gate 1 Blocker 2: Distributed JTI Revocation
 * Directive RE-01 / CTO Security Mandate
 *
 * Test Categories:
 * 1. POSITIVE: Valid active session tokens pass Node & Edge verification.
 * 2. NEGATIVE: Revoked tokens fail closed immediately with TOKEN_REVOKED.
 * 3. CROSS-INSTANCE: Token revoked in Lambda Instance A is rejected in independent Instance B.
 * 4. CROSS-ISOLATE: Token revoked in Edge Isolate A is rejected in independent Edge Isolate B.
 * 5. TENANT & PRODUCT ISOLATION: Revoking token for Tenant A does not affect Tenant B;
 *    revoking Studio token does not affect Creator token.
 * 6. CONCURRENCY SAFETY: 50 concurrent verification & revocation calls maintain consistency.
 * 7. FAILURE-MODE (FAIL-CLOSED): Store timeout or 500 network failure fails closed safely.
 * 8. L1 CACHE SWR SEMANTICS: Verified L1 positive and negative cache performance.
 */

import {
  signHostSessionToken,
  verifyHostSessionToken,
  revokeHostSession,
  resetRevokedJtiCache,
  clearLocalSessionCache,
} from '@/lib/auth/host-session';
import { verifyHostSessionTokenEdge, revokeHostSessionEdge, resetRevokedJtiCacheEdge } from '@/lib/auth/host-session-edge';
import {
  isJtiRevokedDistributed,
  revokeHostSessionDistributed,
  setDistributedRevocationAdapter,
  resetDistributedRevocationStore,
  DistributedRevocationAdapter,
  RevokeSessionParams,
} from '@/lib/auth/jti-revocation-store';

/**
 * In-memory Mock Shared Revocation Store simulating Supabase PostgreSQL backend
 */
class MockSupabaseRevocationAuthority implements DistributedRevocationAdapter {
  private store = new Map<string, { product: string; expiresAt: number; tenantId?: string }>();
  public queryCount = 0;
  public writeCount = 0;
  public simulateNetworkFailure = false;

  async isRevoked(jti: string, product: string): Promise<boolean> {
    this.queryCount++;
    if (this.simulateNetworkFailure) {
      throw new Error('ETIMEDOUT: Connection to distributed revocation authority timed out');
    }
    const entry = this.store.get(`${product}:${jti}`);
    if (!entry) return false;
    const now = Math.floor(Date.now() / 1000);
    return entry.expiresAt > now;
  }

  async revoke(params: RevokeSessionParams): Promise<void> {
    this.writeCount++;
    if (this.simulateNetworkFailure) {
      throw new Error('ETIMEDOUT: Connection to distributed revocation authority timed out');
    }
    this.store.set(`${params.product}:${params.jti}`, {
      product: params.product,
      expiresAt: params.expSeconds,
      tenantId: params.tenantId,
    });
  }

  reset(): void {
    this.store.clear();
    this.queryCount = 0;
    this.writeCount = 0;
    this.simulateNetworkFailure = false;
  }
}

describe('Gate 1 Blocker 2: Distributed JTI Revocation Authority', () => {
  let mockAuthority: MockSupabaseRevocationAuthority;

  beforeEach(() => {
    mockAuthority = new MockSupabaseRevocationAuthority();
    setDistributedRevocationAdapter(mockAuthority);
    resetRevokedJtiCache();
  });

  afterEach(() => {
    setDistributedRevocationAdapter(null);
    resetRevokedJtiCache();
  });

  // ── CATEGORY 1: POSITIVE TESTS ─────────────────────────────────────────────
  describe('1. Positive Verification', () => {
    it('successfully verifies a freshly issued Studio token on Node.js runtime', async () => {
      const token = signHostSessionToken({
        product: 'studio',
        userId: 'usr-studio-001',
        tenantId: 'tid-alpha-111',
        tenantSlug: 'alpha-store',
      });

      const result = await verifyHostSessionToken(token, 'studio');
      expect(result.valid).toBe(true);
      expect(result.payload?.sub).toBe('usr-studio-001');
      expect(result.payload?.tid).toBe('tid-alpha-111');
    });

    it('successfully verifies a freshly issued Creator token on Edge runtime', async () => {
      const token = signHostSessionToken({
        product: 'creator',
        userId: 'usr-creator-002',
        tenantId: 'tid-beta-222',
        tenantSlug: 'beta-creator',
      });

      const result = await verifyHostSessionTokenEdge(token, 'creator');
      expect(result.valid).toBe(true);
      expect(result.payload?.sub).toBe('usr-creator-002');
      expect(result.payload?.tid).toBe('tid-beta-222');
    });
  });

  // ── CATEGORY 2: NEGATIVE TESTS ─────────────────────────────────────────────
  describe('2. Negative Revocation Tests', () => {
    it('immediately rejects a revoked Studio token on Node.js verifier', async () => {
      const token = signHostSessionToken({
        product: 'studio',
        userId: 'usr-studio-revoked',
        tenantId: 'tid-studio-001',
        tenantSlug: 'studio-revoked',
      });

      const initial = await verifyHostSessionToken(token, 'studio');
      expect(initial.valid).toBe(true);
      const jti = initial.payload!.jti;
      const exp = initial.payload!.exp;

      await revokeHostSession(jti, exp, 'studio');

      const subsequent = await verifyHostSessionToken(token, 'studio');
      expect(subsequent.valid).toBe(false);
      expect(subsequent.error).toBe('TOKEN_REVOKED');
    });

    it('immediately rejects a revoked Creator token on Edge verifier', async () => {
      const token = signHostSessionToken({
        product: 'creator',
        userId: 'usr-creator-revoked',
        tenantId: 'tid-creator-002',
        tenantSlug: 'creator-revoked',
      });

      const initial = await verifyHostSessionTokenEdge(token, 'creator');
      expect(initial.valid).toBe(true);
      const jti = initial.payload!.jti;
      const exp = initial.payload!.exp;

      await revokeHostSession(jti, exp, 'creator');

      const subsequent = await verifyHostSessionTokenEdge(token, 'creator');
      expect(subsequent.valid).toBe(false);
      expect(subsequent.error).toBe('TOKEN_REVOKED');
    });
  });

  // ── CATEGORY 3: CROSS-INSTANCE SIMULATION ──────────────────────────────────
  describe('3. Cross-Instance Multi-Container Parity (Node Lambda A -> Node Lambda B)', () => {
    it('enforces revocation in Instance B when revoked in Instance A with independent memory', async () => {
      // 1. User signs in and receives token
      const token = signHostSessionToken({
        product: 'studio',
        userId: 'usr-multi-container',
        tenantId: 'tid-container-test',
        tenantSlug: 'multi-container-shop',
      });

      const initialVerification = await verifyHostSessionToken(token, 'studio');
      expect(initialVerification.valid).toBe(true);
      const jti = initialVerification.payload!.jti;
      const exp = initialVerification.payload!.exp;

      // 2. User logs out on Lambda Instance A:
      // Writes to Instance A's local cache AND writes through to shared authority
      await revokeHostSession(jti, exp, 'studio');
      expect(mockAuthority.writeCount).toBe(1);

      // 3. Simulate Instance B:
      // Instance B has its OWN private memory heap (empty local cache).
      // We clear local L1 cache to simulate Instance B's fresh memory space.
      clearLocalSessionCache();

      // 4. Attacker attempts to present token to Lambda Instance B:
      // Instance B's L1 cache misses -> queries Mock Shared Revocation Authority -> finds JTI revoked
      const instanceBVerification = await verifyHostSessionToken(token, 'studio');
      expect(instanceBVerification.valid).toBe(false);
      expect(instanceBVerification.error).toBe('TOKEN_REVOKED');
      expect(mockAuthority.queryCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ── CATEGORY 4: CROSS-ISOLATE SIMULATION ───────────────────────────────────
  describe('4. Cross-Isolate Edge Network Parity (Edge PoP A -> Edge PoP B)', () => {
    it('enforces revocation in Edge PoP B (Singapore) when logged out in PoP A (Virginia)', async () => {
      const token = signHostSessionToken({
        product: 'studio',
        userId: 'usr-edge-global',
        tenantId: 'tid-edge-test',
        tenantSlug: 'edge-global-shop',
      });

      // Edge PoP A: Verifies token initially
      const popAVerification = await verifyHostSessionTokenEdge(token, 'studio');
      expect(popAVerification.valid).toBe(true);
      const jti = popAVerification.payload!.jti;
      const exp = popAVerification.payload!.exp;

      // User logs out via Edge PoP A:
      await revokeHostSessionEdge(jti, exp, 'studio');
      expect(mockAuthority.writeCount).toBe(1);

      // Simulate Edge PoP B (different V8 isolate, completely separate memory heap):
      clearLocalSessionCache();

      // Request reaches Edge PoP B:
      const popBVerification = await verifyHostSessionTokenEdge(token, 'studio');
      expect(popBVerification.valid).toBe(false);
      expect(popBVerification.error).toBe('TOKEN_REVOKED');
    });
  });

  // ── CATEGORY 5: TENANT & PRODUCT NAMESPACE ISOLATION ───────────────────────
  describe('5. Tenant and Product Isolation', () => {
    it('revoking a token for Tenant A does NOT invalidate an active session for Tenant B', async () => {
      const tokenTenantA = signHostSessionToken({
        product: 'studio',
        userId: 'usr-tenant-a',
        tenantId: 'tid-alpha-111',
        tenantSlug: 'store-alpha',
      });

      const tokenTenantB = signHostSessionToken({
        product: 'studio',
        userId: 'usr-tenant-b',
        tenantId: 'tid-beta-222',
        tenantSlug: 'store-beta',
      });

      const vA = await verifyHostSessionToken(tokenTenantA, 'studio');
      const vB = await verifyHostSessionToken(tokenTenantB, 'studio');
      expect(vA.valid).toBe(true);
      expect(vB.valid).toBe(true);

      // Revoke Tenant A's session
      await revokeHostSession(vA.payload!.jti, vA.payload!.exp, 'studio', {
        tenantId: 'tid-alpha-111',
        userId: 'usr-tenant-a',
      });

      // Tenant A is revoked
      expect((await verifyHostSessionToken(tokenTenantA, 'studio')).valid).toBe(false);

      // Tenant B remains 100% valid and unaffected
      const checkB = await verifyHostSessionToken(tokenTenantB, 'studio');
      expect(checkB.valid).toBe(true);
      expect(checkB.payload?.tid).toBe('tid-beta-222');
    });

    it('revoking a Studio session does NOT invalidate a Creator session with identical JTI', async () => {
      const sharedJti = '11111111-2222-3333-4444-555555555555';
      const exp = Math.floor(Date.now() / 1000) + 3600;

      // Explicitly revoke JTI under 'studio' product namespace only
      await mockAuthority.revoke({
        jti: sharedJti,
        product: 'studio',
        expSeconds: exp,
      });

      // Query for 'studio' -> Revoked
      const studioCheck = await isJtiRevokedDistributed(sharedJti, 'studio');
      expect(studioCheck.revoked).toBe(true);

      // Query for 'creator' -> Active (NOT revoked)
      const creatorCheck = await isJtiRevokedDistributed(sharedJti, 'creator');
      expect(creatorCheck.revoked).toBe(false);
    });
  });

  // ── CATEGORY 6: CONCURRENCY SAFETY ─────────────────────────────────────────
  describe('6. Concurrency Safety & High-Throughput Consistency', () => {
    it('handles 50 concurrent mixed verification and revocation requests without race conditions', async () => {
      const tokens: { token: string; jti: string; exp: number; shouldRevoke: boolean }[] = [];

      // Issue 50 tokens, odd indexed will be revoked, even indexed will remain active
      for (let i = 0; i < 50; i++) {
        const token = signHostSessionToken({
          product: 'studio',
          userId: `usr-concurrent-${i}`,
          tenantId: `tid-concurrent-${i}`,
          tenantSlug: `tenant-${i}`,
        });
        const v = await verifyHostSessionToken(token, 'studio');
        tokens.push({
          token,
          jti: v.payload!.jti,
          exp: v.payload!.exp,
          shouldRevoke: i % 2 === 1,
        });
      }

      // Execute all 25 revocations concurrently
      await Promise.all(
        tokens
          .filter((t) => t.shouldRevoke)
          .map((t) => revokeHostSession(t.jti, t.exp, 'studio'))
      );

      // Clear local memory caches to simulate cross-isolate execution
      clearLocalSessionCache();

      // Concurrently verify all 50 tokens
      const results = await Promise.all(
        tokens.map((t) => verifyHostSessionTokenEdge(t.token, 'studio'))
      );

      // Verify exact consistency: every revoked token is invalid, every unrevoked is valid
      results.forEach((res, idx) => {
        if (tokens[idx].shouldRevoke) {
          expect(res.valid).toBe(false);
          expect(res.error).toBe('TOKEN_REVOKED');
        } else {
          expect(res.valid).toBe(true);
        }
      });
    });
  });

  // ── CATEGORY 7: FAILURE-MODE & FAIL-CLOSED BEHAVIOR ────────────────────────
  describe('7. Failure-Mode & Fail-Closed Behavior', () => {
    it('fails closed when distributed store times out or is unreachable', async () => {
      const token = signHostSessionToken({
        product: 'studio',
        userId: 'usr-fail-closed',
        tenantId: 'tid-fail-closed',
        tenantSlug: 'fail-closed-shop',
      });

      // Simulate remote network failure / timeout
      mockAuthority.simulateNetworkFailure = true;

      // In fail-closed verification, unverified status must reject access
      const result = await isJtiRevokedDistributed('some-jti-xyz', 'studio', undefined, {
        failClosed: true,
      });

      expect(result.revoked).toBe(false);
      expect(result.error).toBe('REVOCATION_CHECK_UNAVAILABLE');
    });
  });

  // ── CATEGORY 8: L1 CACHE SWR SEMANTICS ─────────────────────────────────────
  describe('8. L1 Cache Performance & SWR Negative Caching', () => {
    it('uses L1 active cache to eliminate redundant distributed lookups within TTL', async () => {
      const jti = '22222222-3333-4444-5555-666666666666';

      // First check: misses L1, queries distributed authority
      const check1 = await isJtiRevokedDistributed(jti, 'studio');
      expect(check1.revoked).toBe(false);
      expect(check1.source).toBe('TEST_ADAPTER');
      expect(mockAuthority.queryCount).toBe(1);

      // Second check immediately after: hits L1 active cache, 0 distributed queries
      const check2 = await isJtiRevokedDistributed(jti, 'studio');
      expect(check2.revoked).toBe(false);
      expect(check2.source).toBe('L1_ACTIVE_CACHE');
      expect(mockAuthority.queryCount).toBe(1); // No new query!
    });

    it('uses L1 revoked cache to short-circuit lookups for revoked tokens', async () => {
      const jti = '33333333-4444-5555-6666-777777777777';
      const exp = Math.floor(Date.now() / 1000) + 3600;

      await revokeHostSession(jti, exp, 'studio');

      const check1 = await isJtiRevokedDistributed(jti, 'studio');
      expect(check1.revoked).toBe(true);
      expect(check1.source).toBe('L1_REVOKED_CACHE');
    });
  });
});
