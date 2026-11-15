/**
 * Test Suite: Cross-Runtime Host Session Verification
 * Verifies that Node.js signed host session tokens (lib/auth/host-session.ts)
 * are authoritatively validated by Edge Runtime Web Crypto verifier (lib/auth/host-session-edge.ts).
 */

import { NextRequest } from 'next/server';
import { signHostSessionToken, revokeHostSession, resetRevokedJtiCache } from '@/lib/auth/host-session';
import {
  verifyHostSessionTokenEdge,
  extractHostSessionToken,
  getProductAuthConfigEdge,
  constantTimeEqual,
} from '@/lib/auth/host-session-edge';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';

describe('Cross-Runtime Host Session Verifier (Node.js -> Edge WebCrypto)', () => {
  beforeEach(() => {
    resetRevokedJtiCache();
  });

  describe('1. Studio Token Verification', () => {
    it('successfully verifies a valid Studio host token signed by Node.js issuer', async () => {
      const token = signHostSessionToken({
        product: 'studio',
        userId: 'user-studio-123',
        tenantId: 'tenant-studio-456',
        tenantSlug: 'studio-brand',
        role: 'STUDIO_PARTICIPANT',
      });

      const result = await verifyHostSessionTokenEdge(token, 'studio');
      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.payload?.sub).toBe('user-studio-123');
      expect(result.payload?.tid).toBe('tenant-studio-456');
      expect(result.payload?.tsl).toBe('studio-brand');
      expect(result.payload?.iss).toBe('https://studio.boontrack.com');
      expect(result.payload?.aud).toBe('https://studio.boontrack.com');
    });

    it('rejects an expired Studio token', async () => {
      const expiredToken = signHostSessionToken({
        product: 'studio',
        userId: 'user-expired',
        tenantId: 'tenant-123',
        tenantSlug: 'expired-brand',
        ttlSeconds: -10, // Expired 10s ago
      });

      const result = await verifyHostSessionTokenEdge(expiredToken, 'studio');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('TOKEN_EXPIRED');
    });

    it('rejects a forged / tampered Studio token', async () => {
      const validToken = signHostSessionToken({
        product: 'studio',
        userId: 'user-legit',
        tenantId: 'tenant-123',
        tenantSlug: 'legit-brand',
      });

      const parts = validToken.split('.');
      // Tamper with payload
      const tamperedToken = `${parts[0]}.eyRhZG1pbiI6dHJ1ZX0.${parts[2]}`;

      const result = await verifyHostSessionTokenEdge(tamperedToken, 'studio');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('SIGNATURE_INVALID');
    });

    it('rejects empty or malformed strings', async () => {
      expect((await verifyHostSessionTokenEdge('', 'studio')).valid).toBe(false);
      expect((await verifyHostSessionTokenEdge('invalid-token', 'studio')).valid).toBe(false);
      expect((await verifyHostSessionTokenEdge('a.b', 'studio')).valid).toBe(false);
    });
  });

  describe('2. Creator Token Verification', () => {
    it('successfully verifies a valid Creator host token signed by Node.js issuer', async () => {
      const token = signHostSessionToken({
        product: 'creator',
        userId: 'user-creator-789',
        tenantId: 'tenant-creator-012',
        tenantSlug: 'creator-influencer',
        role: 'CREATOR_OWNER',
      });

      const result = await verifyHostSessionTokenEdge(token, 'creator');
      expect(result.valid).toBe(true);
      expect(result.payload?.sub).toBe('user-creator-789');
      expect(result.payload?.iss).toBe('https://creator.boontrack.com');
      expect(result.payload?.aud).toBe('https://creator.boontrack.com');
    });
  });

  describe('3. P0 Product & Session Boundary Isolation', () => {
    it('STRICT ISOLATION: Studio token CANNOT authorize Creator', async () => {
      const studioToken = signHostSessionToken({
        product: 'studio',
        userId: 'user-studio',
        tenantId: 'tenant-studio',
        tenantSlug: 'studio-tenant',
      });

      const result = await verifyHostSessionTokenEdge(studioToken, 'creator');
      expect(result.valid).toBe(false);
      // Because creator uses a different secret, signature fails first
      expect(result.error).toBe('SIGNATURE_INVALID');
    });

    it('STRICT ISOLATION: Creator token CANNOT authorize Studio', async () => {
      const creatorToken = signHostSessionToken({
        product: 'creator',
        userId: 'user-creator',
        tenantId: 'tenant-creator',
        tenantSlug: 'creator-tenant',
      });

      const result = await verifyHostSessionTokenEdge(creatorToken, 'studio');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('SIGNATURE_INVALID');
    });

    it('STRICT ISOLATION: Shop merchant token CANNOT authorize Studio or Creator', async () => {
      const shopToken = signMerchantSessionToken({
        tenantSlug: 'warung-kreatif',
        role: 'OWNER',
      });

      // Shop token has 2 segments (payload.sig), not 3 segments (header.payload.sig)
      const studioResult = await verifyHostSessionTokenEdge(shopToken, 'studio');
      expect(studioResult.valid).toBe(false);
      expect(studioResult.error).toBe('TOKEN_MALFORMED');

      const creatorResult = await verifyHostSessionTokenEdge(shopToken, 'creator');
      expect(creatorResult.valid).toBe(false);
      expect(creatorResult.error).toBe('TOKEN_MALFORMED');
    });
  });

  describe('4. Token Extraction from Request', () => {
    it('extracts production host-only cookie __Host-bt_studio_session', () => {
      const token = 'header.payload.signature';
      const req = new NextRequest('https://studio.boontrack.com/desk', {
        headers: {
          cookie: `__Host-bt_studio_session=${token}`,
        },
      });

      expect(extractHostSessionToken(req, 'studio')).toBe(token);
    });

    it('extracts dev fallback cookie bt_studio_session', () => {
      const token = 'header.payload.signature';
      const req = new NextRequest('http://localhost:3000/desk', {
        headers: {
          cookie: `bt_studio_session=${token}`,
        },
      });

      expect(extractHostSessionToken(req, 'studio')).toBe(token);
    });

    it('ignores non-JWT cookies like plaintext flags', () => {
      const req = new NextRequest('https://studio.boontrack.com/desk', {
        headers: {
          cookie: `bt_studio_session=plaintext-flag-only; __Host-bt_studio_session=another-invalid`,
        },
      });

      expect(extractHostSessionToken(req, 'studio')).toBeNull();
    });
  });
});
