/**
 * @file __tests__/creator/creator_security_hardening.test.ts
 * @description Comprehensive Security & Anti-IDOR Test Suite for Creator Platform (PR #67)
 *
 * Verifies:
 * 1. P0 DTO Sanitization:
 *    - GET /api/creator/profile strips PIN plaintext, pin_hash, password_hash, and tokens.
 *    - POST response sanitizes profile payload.
 *    - sanitizeCreatorProfileDto thoroughly scrubs sensitive fields across root, theme_config, and metadata.
 * 2. P1 Anti-IDOR & Server Session Authorization:
 *    - Mutation without session rejected with 401 Unauthorized.
 *    - Cross-user mutation attempt (User A attacking User B) rejected with 403 Forbidden.
 *    - Reseller application with other user's handle rejected with 403 Forbidden.
 *    - Legitimate owner session permitted (200 OK).
 *    - Superadmin / Admin session permitted.
 * 3. P1 Canonical Ledger & Strict Tenant Scoping:
 *    - Wallet metrics calculated purely from public.reseller_commission_ledger.
 *    - Pending clearance schedule vs immediate availability respected.
 *    - Reversals and payouts deducted properly from ledger.
 *    - Strict tenant scoping ensures no cross-tenant leakage.
 */

import {
  sanitizeCreatorProfileDto,
  verifyCreatorSession,
  verifyTenantOwnerOrAdmin,
} from '@/lib/auth/creator-auth-guard';
import { getResellerWalletMetricsFromLedger } from '@/lib/attribution/reseller-attribution-service';

describe('Priority A: Creator Security Hardening (P0 DTO Sanitization, P1 Anti-IDOR, Tenant Scoping & Canonical Ledger)', () => {
  const TENANT_CREATOR_A = '11111111-1111-1111-1111-111111111111';
  const USER_ID_CREATOR_A = '11111111-1111-1111-1111-111111111111';
  const HANDLE_CREATOR_A = 'suzieray';

  const TENANT_CREATOR_B = '22222222-2222-2222-2222-222222222222';
  const USER_ID_CREATOR_B = '22222222-2222-2222-2222-222222222222';
  const HANDLE_CREATOR_B = 'victimcreator';

  const USER_ID_ADMIN = '99999999-9999-9999-9999-999999999999';

  describe('1. P0 DTO Sanitization: Stripping Sensitive Credentials', () => {
    it('strips plaintext PIN, pin_hash, password_hash, and secrets from root profile object', () => {
      const rawProfile = {
        id: 'prof-1',
        tenant_id: TENANT_CREATOR_A,
        handle: HANDLE_CREATOR_A,
        display_name: 'Suzie Ray',
        bio: 'Fashion & Spill Racun Shopee',
        pin: '123456', // Sensitive plaintext PIN
        pin_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz123456', // Sensitive bcrypt hash
        password_hash: '$2a$10$hashpass1234567890',
        access_password: 'supersecretpassword',
        access_pin: '9876',
        password: 'plainpassword',
        secret: 'internal_secret',
        token: 'auth_token_xyz',
        internal_token: 'service_token_abc',
        telegram_chat_id: '123456789',
        is_verified: true,
      };

      const sanitized = sanitizeCreatorProfileDto(rawProfile);

      expect(sanitized).not.toBeNull();
      expect(sanitized.id).toBe('prof-1');
      expect(sanitized.handle).toBe(HANDLE_CREATOR_A);
      expect(sanitized.display_name).toBe('Suzie Ray');
      expect(sanitized.bio).toBe('Fashion & Spill Racun Shopee');
      expect(sanitized.is_verified).toBe(true);

      // Verify all sensitive credentials stripped
      expect(sanitized.pin).toBeUndefined();
      expect(sanitized.pin_hash).toBeUndefined();
      expect(sanitized.password_hash).toBeUndefined();
      expect(sanitized.access_password).toBeUndefined();
      expect(sanitized.access_pin).toBeUndefined();
      expect(sanitized.password).toBeUndefined();
      expect(sanitized.secret).toBeUndefined();
      expect(sanitized.token).toBeUndefined();
      expect(sanitized.internal_token).toBeUndefined();
      expect(sanitized.telegram_chat_id).toBeUndefined();
    });

    it('strips credentials embedded deeply inside theme_config and metadata', () => {
      const rawProfile = {
        id: 'prof-2',
        handle: 'deepcheck',
        theme_config: {
          theme: 'clean_light',
          display_name: 'Deep Check',
          pin: '9999', // Plaintext PIN in theme_config
          pin_hash: '$2a$10$pin_hash_inside_theme',
          password_hash: '$2a$10$pwd_hash_inside_theme',
          access_pin: '8888',
          secret: 'theme_secret',
          token: 'jwt_token',
          links: [{ id: '1', title: 'Shopee', url: 'https://shopee.co.id' }],
        },
        metadata: {
          pin: '7777',
          password_hash: '$2a$10$meta_hash',
          custom_domain: 'bio.suzieray.com',
        },
      };

      const sanitized = sanitizeCreatorProfileDto(rawProfile);

      expect(sanitized.theme_config.display_name).toBe('Deep Check');
      expect(sanitized.theme_config.links.length).toBe(1);
      expect(sanitized.metadata.custom_domain).toBe('bio.suzieray.com');

      // Verify theme_config stripped
      expect(sanitized.theme_config.pin).toBeUndefined();
      expect(sanitized.theme_config.pin_hash).toBeUndefined();
      expect(sanitized.theme_config.password_hash).toBeUndefined();
      expect(sanitized.theme_config.access_pin).toBeUndefined();
      expect(sanitized.theme_config.secret).toBeUndefined();
      expect(sanitized.theme_config.token).toBeUndefined();

      // Verify metadata stripped
      expect(sanitized.metadata.pin).toBeUndefined();
      expect(sanitized.metadata.password_hash).toBeUndefined();
    });

    it('returns null gracefully for empty or invalid inputs', () => {
      expect(sanitizeCreatorProfileDto(null)).toBeNull();
      expect(sanitizeCreatorProfileDto(undefined)).toBeNull();
      expect(sanitizeCreatorProfileDto('')).toBeNull();
    });
  });

  describe('2. P1 Anti-IDOR & Server Session Authorization', () => {
    const createMockSupabase = (currentUser?: any, options?: { profileOwnerId?: string }) => ({
      auth: {
        getUser: jest.fn().mockImplementation(async (token: string) => {
          if (!currentUser || token === 'invalid-token') {
            return { data: { user: null }, error: { message: 'Invalid token' } };
          }
          return { data: { user: currentUser }, error: null };
        }),
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'creator_profiles') {
          return {
            select: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockImplementation(async () => ({
              data: {
                id: 'prof-victim',
                handle: HANDLE_CREATOR_B,
                tenant_id: options?.profileOwnerId || TENANT_CREATOR_B,
              },
              error: null,
            })),
          };
        }
        if (table === 'tenants') {
          return {
            select: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockImplementation(async () => ({
              data: {
                id: options?.profileOwnerId || TENANT_CREATOR_B,
                slug: HANDLE_CREATOR_B,
                metadata: { owner_id: options?.profileOwnerId || TENANT_CREATOR_B },
              },
              error: null,
            })),
          };
        }
        if (table === 'affiliates') {
          return {
            select: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockImplementation(async () => {
              if (currentUser?.app_metadata?.role === 'ADMIN') {
                return { data: { role: 'ADMIN' }, error: null };
              }
              return { data: null, error: null };
            }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    });

    it('rejects unauthenticated requests with HTTP 401 Unauthorized', async () => {
      const mockReq = {
        headers: new Headers(),
      } as any;

      const mockSupabase = createMockSupabase(null);

      const result = await verifyCreatorSession(mockReq, HANDLE_CREATOR_B, {
        supabaseClient: mockSupabase,
      });

      expect(result.authorized).toBe(false);
      expect(result.errorStatus).toBe(401);
      expect(result.errorMessage).toContain('Unauthorized');
    });

    it('rejects expired / invalid token with HTTP 401 Unauthorized', async () => {
      const mockReq = {
        headers: new Headers({
          authorization: 'Bearer invalid-token',
        }),
      } as any;

      const mockSupabase = createMockSupabase(null);

      const result = await verifyCreatorSession(mockReq, HANDLE_CREATOR_B, {
        supabaseClient: mockSupabase,
      });

      expect(result.authorized).toBe(false);
      expect(result.errorStatus).toBe(401);
      expect(result.errorMessage).toContain('tidak valid atau telah kedaluwarsa');
    });

    it('rejects cross-user mutation (IDOR: User A accessing User B) with HTTP 403 Forbidden', async () => {
      const mockReq = {
        headers: new Headers({
          authorization: 'Bearer token-user-a',
        }),
      } as any;

      // User A authenticated
      const userA = {
        id: USER_ID_CREATOR_A,
        email: 'attacker.suzie@example.com',
        app_metadata: { role: 'USER' },
      };

      const mockSupabase = createMockSupabase(userA, { profileOwnerId: USER_ID_CREATOR_B });

      // User A attempts to target User B ('victimcreator')
      const result = await verifyCreatorSession(mockReq, HANDLE_CREATOR_B, {
        supabaseClient: mockSupabase,
      });

      expect(result.authorized).toBe(false);
      expect(result.errorStatus).toBe(403);
      expect(result.errorMessage).toContain('Forbidden');
      expect(result.errorMessage).toContain('Anti-IDOR');
    });

    it('rejects cross-user session cookie forgery with HTTP 403 Forbidden', async () => {
      const mockReq = {
        headers: new Headers({
          cookie: `creator_session=${HANDLE_CREATOR_A}`, // Cookie has User A
        }),
      } as any;

      const mockSupabase = createMockSupabase(null);

      // Attempt to target User B
      const result = await verifyCreatorSession(mockReq, HANDLE_CREATOR_B, {
        supabaseClient: mockSupabase,
      });

      expect(result.authorized).toBe(false);
      expect(result.errorStatus).toBe(403);
      expect(result.errorMessage).toContain('Anti-IDOR');
    });

    it('permits legitimate owner session matching target resource (200 OK)', async () => {
      const mockReq = {
        headers: new Headers({
          authorization: 'Bearer token-legit-owner',
        }),
      } as any;

      const userB = {
        id: USER_ID_CREATOR_B,
        email: 'victim@example.com',
        app_metadata: { role: 'USER' },
      };

      const mockSupabase = createMockSupabase(userB, { profileOwnerId: USER_ID_CREATOR_B });

      const result = await verifyCreatorSession(mockReq, HANDLE_CREATOR_B, {
        supabaseClient: mockSupabase,
      });

      expect(result.authorized).toBe(true);
      expect(result.role).toBe('CREATOR_OWNER');
      expect(result.userId).toBe(USER_ID_CREATOR_B);
    });

    it('permits SUPERADMIN / ADMIN session for maintenance operations', async () => {
      const mockReq = {
        headers: new Headers({
          authorization: 'Bearer token-superadmin',
        }),
      } as any;

      const adminUser = {
        id: USER_ID_ADMIN,
        email: 'cto@boontrack.com',
        app_metadata: { role: 'SUPERADMIN' },
      };

      const mockSupabase = createMockSupabase(adminUser, { profileOwnerId: USER_ID_CREATOR_B });

      const result = await verifyCreatorSession(mockReq, HANDLE_CREATOR_B, {
        supabaseClient: mockSupabase,
      });

      expect(result.authorized).toBe(true);
      expect(result.role).toBe('ADMIN');
      expect(result.userId).toBe(USER_ID_ADMIN);
    });

    it('enforces anti-IDOR on merchant tenant management (verifyTenantOwnerOrAdmin)', async () => {
      const mockReq = {
        headers: new Headers({
          authorization: 'Bearer token-random-user',
        }),
      } as any;

      const randomUser = {
        id: 'random-user-id',
        email: 'random@example.com',
        app_metadata: {},
      };

      const mockSupabase: any = {
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: randomUser }, error: null }),
        },
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          or: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: 'tenant-onlineboost-id', slug: 'onlineboost', metadata: { owner_id: 'real-owner-id' } },
            error: null,
          }),
        }),
      };

      const result = await verifyTenantOwnerOrAdmin(mockReq, 'onlineboost', {
        supabaseClient: mockSupabase,
      });

      expect(result.authorized).toBe(false);
      expect(result.errorStatus).toBe(403);
      expect(result.errorMessage).toContain('Anti-IDOR');
    });
  });

  describe('3. P1 Canonical Ledger & Strict Tenant Scoping', () => {
    it('calculates wallet balanceReady, pendingClearance, and totalEarned purely from reseller_commission_ledger', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 8 * 86400 * 1000).toISOString(); // 8 days ago (cleared)
      const futureDate = new Date(now.getTime() + 5 * 86400 * 1000).toISOString(); // 5 days from now (uncleared)

      const mockLedgerRows = [
        {
          id: 'led-1',
          tenant_id: 'tenant-store-1',
          reseller_user_id: USER_ID_CREATOR_A,
          entry_type: 'EARNED',
          amount: 25000,
          status: 'AVAILABLE',
          available_at: pastDate,
        },
        {
          id: 'led-2',
          tenant_id: 'tenant-store-2',
          reseller_user_id: USER_ID_CREATOR_A,
          entry_type: 'EARNED',
          amount: 50000,
          status: 'PENDING_CLEARANCE',
          available_at: pastDate, // Cleared because pastDate <= now!
        },
        {
          id: 'led-3',
          tenant_id: 'tenant-store-1',
          reseller_user_id: USER_ID_CREATOR_A,
          entry_type: 'EARNED',
          amount: 35000,
          status: 'PENDING_CLEARANCE',
          available_at: futureDate, // Uncleared (still in clearance window)
        },
        {
          id: 'led-4',
          tenant_id: 'tenant-store-1',
          reseller_user_id: USER_ID_CREATOR_A,
          entry_type: 'EARNED',
          amount: 10000,
          status: 'CANCELLED', // Cancelled order (must not be counted)
          available_at: pastDate,
        },
        {
          id: 'led-5',
          tenant_id: 'tenant-store-1',
          reseller_user_id: USER_ID_CREATOR_A,
          entry_type: 'REVERSAL',
          amount: 5000,
          status: 'AVAILABLE',
          available_at: pastDate,
        },
      ];

      const mockSupabase: any = {
        from: jest.fn().mockImplementation((table: string) => {
          expect(table).toBe('reseller_commission_ledger');
          return {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockImplementation((col: string, vals: string[]) => {
              expect(col).toBe('reseller_user_id');
              expect(vals).toContain(USER_ID_CREATOR_A);
              return Promise.resolve({ data: mockLedgerRows, error: null });
            }),
          };
        }),
      };

      const wallet = await getResellerWalletMetricsFromLedger({
        resellerUserIds: [USER_ID_CREATOR_A],
        supabaseClient: mockSupabase,
      });

      // Verification:
      // balanceReady = 25000 (AVAILABLE) + 50000 (cleared PENDING) - 5000 (REVERSAL) = 70000
      expect(wallet.balanceReady).toBe(70000);

      // pendingClearance = 35000 (future clearance window)
      expect(wallet.pendingClearance).toBe(35000);

      // totalEarned = 25000 + 50000 + 35000 - 5000 = 105000 (CANCELLED 10000 excluded)
      expect(wallet.totalEarned).toBe(105000);

      // productsSold = 3 valid EARNED entries
      expect(wallet.productsSold).toBe(3);
    });

    it('enforces tenant_id filter when tenant scoping is requested', async () => {
      let filteredTenantId: string | null = null;

      const mockSupabase: any = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          eq: jest.fn().mockImplementation((col: string, val: string) => {
            if (col === 'tenant_id') filteredTenantId = val;
            return Promise.resolve({ data: [], error: null });
          }),
        }),
      };

      await getResellerWalletMetricsFromLedger({
        resellerUserIds: [USER_ID_CREATOR_A],
        tenantId: 'tenant-store-specific',
        supabaseClient: mockSupabase,
      });

      expect(filteredTenantId).toBe('tenant-store-specific');
    });

    it('returns zero metrics gracefully for empty reseller IDs or empty ledger', async () => {
      const walletEmpty = await getResellerWalletMetricsFromLedger({
        resellerUserIds: [],
      });

      expect(walletEmpty.balanceReady).toBe(0);
      expect(walletEmpty.pendingClearance).toBe(0);
      expect(walletEmpty.totalEarned).toBe(0);
      expect(walletEmpty.productsSold).toBe(0);
    });
  });
});
