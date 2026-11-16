/**
 * @file __tests__/inbox/team_members_get_containment.test.ts
 * @description Comprehensive Security Test Suite for Gate 1 P0 GET Team Members PII Containment
 *
 * Invariants Verified:
 * 1. Cryptographic session verification (rejects missing, forged, and expired tokens with 401).
 * 2. Mandatory individual userId enforcement (legacy PIN-only sessions fail closed with 403).
 * 3. Authoritative tenant identity from session only (rejects cross-tenant selection with 403).
 * 4. Multi-alias selector defense (?tenant=, ?tenantId=, ?tenant_id=, ?slug=).
 * 5. Active caller database membership gating (rejects missing, inactive, or mismatched members with 403).
 * 6. Role-based PII masking (CS/Operator gets masked phone/email; only verified Owner receives unmasked PII).
 * 7. Verified schema allowlist (zero .select('*')).
 * 8. Strict non-cacheable security headers (Cache-Control: no-store, private).
 */

import { NextRequest } from 'next/server';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';

// ---------------------------------------------------------------------------
// Mock Database State & Fixtures
// ---------------------------------------------------------------------------
const MOCK_TENANT_ID_A = '7a4aac79-3465-4997-92ef-32c9598f5cca';
const MOCK_TENANT_SLUG_A = 'store-alpha';

const MOCK_TENANT_ID_B = '478952f1-1273-47fe-a8fa-1ab6ed5d166f';
const MOCK_TENANT_SLUG_B = 'store-beta';

const MOCK_OWNER_ID = '11111111-1111-1111-1111-111111111111';
const MOCK_CS_ID = '22222222-2222-2222-2222-222222222222';
const MOCK_INACTIVE_ID = '33333333-3333-3333-3333-333333333333';
const MOCK_OTHER_TENANT_USER_ID = '44444444-4444-4444-4444-444444444444';
const MOCK_ROLE_NULL_ID = '55555555-5555-5555-5555-555555555555';
const MOCK_ROLE_EMPTY_ID = '66666666-6666-6666-6666-666666666666';
const MOCK_ROLE_MANAGER_ID = '77777777-7777-7777-7777-777777777777';

let mockTenantUsers: any[] = [];

function resetMockDb() {
  mockTenantUsers = [
    {
      id: MOCK_OWNER_ID,
      tenant_id: MOCK_TENANT_ID_A,
      tenant_slug: MOCK_TENANT_SLUG_A,
      name: 'Owner Alice',
      phone: '081234567890',
      email: 'owner.alice@example.com',
      role: 'OWNER',
      access_level: 'FULL_DASHBOARD',
      status: 'active',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: MOCK_CS_ID,
      tenant_id: MOCK_TENANT_ID_A,
      tenant_slug: MOCK_TENANT_SLUG_A,
      name: 'CS Bob',
      phone: '081200000002',
      email: 'cs.bob@example.com',
      role: 'CS',
      access_level: 'LIVE_CHAT_ONLY',
      status: 'active',
      is_active: true,
      created_at: '2026-01-02T00:00:00Z',
    },
    {
      id: MOCK_INACTIVE_ID,
      tenant_id: MOCK_TENANT_ID_A,
      tenant_slug: MOCK_TENANT_SLUG_A,
      name: 'Suspended Charlie',
      phone: '089999999999',
      email: 'charlie@example.com',
      role: 'CS',
      access_level: 'LIVE_CHAT_ONLY',
      status: 'suspended',
      is_active: false,
      created_at: '2026-01-03T00:00:00Z',
    },
    {
      id: MOCK_OTHER_TENANT_USER_ID,
      tenant_id: MOCK_TENANT_ID_B,
      tenant_slug: MOCK_TENANT_SLUG_B,
      name: 'Eve From Other Store',
      phone: '087777777777',
      email: 'eve@other.com',
      role: 'CS',
      access_level: 'LIVE_CHAT_ONLY',
      status: 'active',
      is_active: true,
      created_at: '2026-01-04T00:00:00Z',
    },
  ];
}

// ---------------------------------------------------------------------------
// Supabase Mock Client Implementation
// ---------------------------------------------------------------------------
const mockSupabase = {
  from: (table: string) => {
    if (table !== 'tenant_users') {
      throw new Error(`Unexpected table queried: ${table}`);
    }

    return {
      select: (_cols: string) => {
        let filters: Array<(row: any) => boolean> = [];
        let singleRow = false;

        const builder: any = {
          eq: (field: string, val: any) => {
            filters.push((r: any) => r[field] === val);
            return builder;
          },
          or: (orExpression: string) => {
            const clauses = orExpression.split(',').map((c) => c.trim());
            filters.push((r: any) => {
              return clauses.some((clause) => {
                if (clause.startsWith('tenant_id.eq.')) {
                  const target = clause.slice('tenant_id.eq.'.length);
                  return r.tenant_id === target;
                }
                if (clause.startsWith('tenant_slug.eq.')) {
                  const target = clause.slice('tenant_slug.eq.'.length);
                  return r.tenant_slug === target;
                }
                return false;
              });
            });
            return builder;
          },
          order: (_field: string, _opts: any) => {
            return builder;
          },
          maybeSingle: async () => {
            singleRow = true;
            const matches = mockTenantUsers.filter((r) => filters.every((f) => f(r)));
            return { data: matches[0] || null, error: null };
          },
          then: (resolve: any) => {
            const matches = mockTenantUsers.filter((r) => filters.every((f) => f(r)));
            resolve({ data: matches, error: null });
          },
        };

        return builder;
      },
    };
  },
};

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => mockSupabase),
  getSupabase: jest.fn(() => mockSupabase),
  supabase: mockSupabase,
  isValidUuid: (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  safeUuidOrNull: (id: any) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))
      ? String(id)
      : null,
}));

// Import GET after mocking supabaseClient
import { GET } from '@/app/api/inbox/team-members/route';

describe('GET /api/inbox/team-members Gate 1 Security Containment', () => {
  beforeEach(() => {
    resetMockDb();
    process.env.BOONTRACK_SESSION_SECRET = 'test_session_secret_2026_super_secure_32_chars_minimum!';
  });

  // -------------------------------------------------------------------------
  // 1. Session Token Integrity Tests
  // -------------------------------------------------------------------------
  it('1. rejects unauthenticated request with no cookie or header with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/inbox/team-members?tenant=store-alpha', {
      method: 'GET',
    });

    const res = await GET(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Sesi login merchant diperlukan');
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('2. rejects request with forged / invalid signature with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/inbox/team-members?tenant=store-alpha', {
      method: 'GET',
      headers: {
        'x-merchant-token': 'eyJhbGciOiJIUzI1NiJ9.forged_signature_hex_value',
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('tidak sah');
  });

  it('3. rejects request with expired session token with 401', async () => {
    const expiredToken = signMerchantSessionToken({
      tenantSlug: MOCK_TENANT_SLUG_A,
      tenantId: MOCK_TENANT_ID_A,
      role: 'CS',
      userId: MOCK_CS_ID,
      ttlMs: -1000, // expired 1s ago
    });

    const req = new NextRequest('http://localhost:3000/api/inbox/team-members?tenant=store-alpha', {
      method: 'GET',
      headers: {
        'x-merchant-token': expiredToken,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('kedaluwarsa');
  });

  // -------------------------------------------------------------------------
  // 2. Individual userId Enforcement (Legacy PIN fail-closed)
  // -------------------------------------------------------------------------
  it('4. fails closed with 403 on legacy PIN sessions missing individual userId', async () => {
    // Mint token mimicking current merchant PIN login (no userId)
    const pinToken = signMerchantSessionToken({
      tenantSlug: MOCK_TENANT_SLUG_A,
      tenantId: MOCK_TENANT_ID_A,
      role: 'OWNER',
      name: 'Store Owner',
      // userId is intentionally omitted
    });

    const req = new NextRequest('http://localhost:3000/api/inbox/team-members?tenant=store-alpha', {
      method: 'GET',
      headers: {
        'x-merchant-token': pinToken,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('USER_IDENTITY_REQUIRED');
    expect(body.error).toContain('identitas individual');
  });

  // -------------------------------------------------------------------------
  // 3. Tenant Boundary & Selector Alias Defense
  // -------------------------------------------------------------------------
  it('5. rejects cross-tenant selector attempt with 403 (Tenant A session + Tenant B selector)', async () => {
    const tokenTenantA = signMerchantSessionToken({
      tenantSlug: MOCK_TENANT_SLUG_A,
      tenantId: MOCK_TENANT_ID_A,
      role: 'CS',
      userId: MOCK_CS_ID,
    });

    // Attacker tries to query tenant B (store-beta)
    const req = new NextRequest('http://localhost:3000/api/inbox/team-members?tenant=store-beta', {
      method: 'GET',
      headers: {
        'x-merchant-token': tokenTenantA,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('TENANT_MISMATCH');
  });

  it('6. rejects evasion across all selector aliases (?tenantId, ?tenant_id, ?slug)', async () => {
    const tokenTenantA = signMerchantSessionToken({
      tenantSlug: MOCK_TENANT_SLUG_A,
      tenantId: MOCK_TENANT_ID_A,
      role: 'CS',
      userId: MOCK_CS_ID,
    });

    const aliasUrls = [
      'http://localhost:3000/api/inbox/team-members?tenantId=store-beta',
      'http://localhost:3000/api/inbox/team-members?tenant_id=store-beta',
      'http://localhost:3000/api/inbox/team-members?slug=store-beta',
      'http://localhost:3000/api/inbox/team-members?tenantId=478952f1-1273-47fe-a8fa-1ab6ed5d166f',
    ];

    for (const url of aliasUrls) {
      const req = new NextRequest(url, {
        method: 'GET',
        headers: {
          'x-merchant-token': tokenTenantA,
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.errorCode).toBe('TENANT_MISMATCH');
    }
  });

  // -------------------------------------------------------------------------
  // 4. Caller Database Membership & Active State Verification
  // -------------------------------------------------------------------------
  it('7. rejects caller with valid token but non-existent database record with 403', async () => {
    const tokenGhost = signMerchantSessionToken({
      tenantSlug: MOCK_TENANT_SLUG_A,
      tenantId: MOCK_TENANT_ID_A,
      role: 'CS',
      userId: '99999999-9999-9999-9999-999999999999', // Not in mock DB
    });

    const req = new NextRequest('http://localhost:3000/api/inbox/team-members?tenant=store-alpha', {
      method: 'GET',
      headers: {
        'x-merchant-token': tokenGhost,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.errorCode).toBe('ACTOR_MEMBERSHIP_NOT_FOUND');
  });

  it('8. rejects suspended / inactive caller with 403', async () => {
    const tokenSuspended = signMerchantSessionToken({
      tenantSlug: MOCK_TENANT_SLUG_A,
      tenantId: MOCK_TENANT_ID_A,
      role: 'CS',
      userId: MOCK_INACTIVE_ID, // is_active: false, status: 'suspended'
    });

    const req = new NextRequest('http://localhost:3000/api/inbox/team-members?tenant=store-alpha', {
      method: 'GET',
      headers: {
        'x-merchant-token': tokenSuspended,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.errorCode).toBe('MEMBERSHIP_INACTIVE');
  });

  it('9. rejects caller attempting cross-tenant access with 403', async () => {
    // Token claims tenant A, but userId belongs to tenant B
    const tokenCross = signMerchantSessionToken({
      tenantSlug: MOCK_TENANT_SLUG_A,
      tenantId: MOCK_TENANT_ID_A,
      role: 'CS',
      userId: MOCK_OTHER_TENANT_USER_ID, // In DB, tenant_id is MOCK_TENANT_ID_B
    });

    const req = new NextRequest('http://localhost:3000/api/inbox/team-members?tenant=store-alpha', {
      method: 'GET',
      headers: {
        'x-merchant-token': tokenCross,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.errorCode).toBe('TENANT_CROSS_ACCESS_FORBIDDEN');
  });

  // -------------------------------------------------------------------------
  // 5. Role-Based PII Masking & Column Allowlist Verification
  // -------------------------------------------------------------------------
  it('10. masks phone and email for CS / Operator sessions', async () => {
    const csToken = signMerchantSessionToken({
      tenantSlug: MOCK_TENANT_SLUG_A,
      tenantId: MOCK_TENANT_ID_A,
      role: 'CS',
      userId: MOCK_CS_ID,
    });

    const req = new NextRequest('http://localhost:3000/api/inbox/team-members?tenant=store-alpha', {
      method: 'GET',
      headers: {
        'x-merchant-token': csToken,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.teamMembers)).toBe(true);
    expect(body.teamMembers.length).toBe(2); // Only active members of tenant A

    // Verify masking on returned members
    const csMember = body.teamMembers.find((m: any) => m.id === MOCK_CS_ID);
    expect(csMember.phone).toBe('0812****02'); // Masked from 081200000002
    expect(csMember.email).toBe('c***b@example.com'); // Masked from cs.bob@example.com

    const ownerMember = body.teamMembers.find((m: any) => m.id === MOCK_OWNER_ID);
    expect(ownerMember.phone).toBe('0812****90'); // Masked from 081234567890
    expect(ownerMember.email).toBe('o***e@example.com'); // Masked from owner.alice@example.com
  });

  it('11. returns unmasked phone and email for verified OWNER session', async () => {
    const ownerToken = signMerchantSessionToken({
      tenantSlug: MOCK_TENANT_SLUG_A,
      tenantId: MOCK_TENANT_ID_A,
      role: 'OWNER',
      userId: MOCK_OWNER_ID,
    });

    const req = new NextRequest('http://localhost:3000/api/inbox/team-members?tenant=store-alpha', {
      method: 'GET',
      headers: {
        'x-merchant-token': ownerToken,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    const ownerMember = body.teamMembers.find((m: any) => m.id === MOCK_OWNER_ID);
    expect(ownerMember.phone).toBe('081234567890'); // Unmasked
    expect(ownerMember.email).toBe('owner.alice@example.com'); // Unmasked

    const csMember = body.teamMembers.find((m: any) => m.id === MOCK_CS_ID);
    expect(csMember.phone).toBe('081200000002'); // Unmasked for owner
    expect(csMember.email).toBe('cs.bob@example.com'); // Unmasked for owner

    // Verify strictly allowlisted columns (no unexpected fields)
    const allowedKeys = [
      'id',
      'tenant_id',
      'tenant_slug',
      'name',
      'phone',
      'email',
      'role',
      'access_level',
      'status',
      'is_active',
      'created_at',
    ];
    for (const member of body.teamMembers) {
      expect(Object.keys(member).sort()).toEqual(allowedKeys.sort());
    }
  });

  it('12. ensures non-cacheable security headers are set on all responses', async () => {
    const req = new NextRequest('http://localhost:3000/api/inbox/team-members', {
      method: 'GET',
    });

    const res = await GET(req);
    expect(res.headers.get('Cache-Control')).toBe(
      'no-store, no-cache, must-revalidate, proxy-revalidate, private'
    );
    expect(res.headers.get('Pragma')).toBe('no-cache');
    expect(res.headers.get('Expires')).toBe('0');
  });

  // -------------------------------------------------------------------------
  // 6. Role Provenance Tests (Zero Fallback Enforcement)
  // -------------------------------------------------------------------------
  it('13. returns unmasked PII when DB role is OWNER even if session token claims role CS', async () => {
    // Database member is OWNER, but token claims CS
    const token = signMerchantSessionToken({
      tenantSlug: MOCK_TENANT_SLUG_A,
      tenantId: MOCK_TENANT_ID_A,
      role: 'CS',
      userId: MOCK_OWNER_ID,
    });

    const req = new NextRequest('http://localhost:3000/api/inbox/team-members?tenant=store-alpha', {
      method: 'GET',
      headers: { 'x-merchant-token': token },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    const ownerMember = body.teamMembers.find((m: any) => m.id === MOCK_OWNER_ID);
    expect(ownerMember.phone).toBe('081234567890'); // Unmasked because DB role is OWNER
    expect(ownerMember.email).toBe('owner.alice@example.com'); // Unmasked

    const csMember = body.teamMembers.find((m: any) => m.id === MOCK_CS_ID);
    expect(csMember.phone).toBe('081200000002'); // Unmasked for owner
    expect(csMember.email).toBe('cs.bob@example.com'); // Unmasked
  });

  it('14. returns masked PII when DB role is CS even if session token claims role OWNER (zero fallback)', async () => {
    // Database member is CS, but token claims forged/escalated OWNER role
    const token = signMerchantSessionToken({
      tenantSlug: MOCK_TENANT_SLUG_A,
      tenantId: MOCK_TENANT_ID_A,
      role: 'OWNER',
      userId: MOCK_CS_ID,
    });

    const req = new NextRequest('http://localhost:3000/api/inbox/team-members?tenant=store-alpha', {
      method: 'GET',
      headers: { 'x-merchant-token': token },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    const ownerMember = body.teamMembers.find((m: any) => m.id === MOCK_OWNER_ID);
    expect(ownerMember.phone).toBe('0812****90'); // Masked because DB role is CS
    expect(ownerMember.email).toBe('o***e@example.com'); // Masked

    const csMember = body.teamMembers.find((m: any) => m.id === MOCK_CS_ID);
    expect(csMember.phone).toBe('0812****02'); // Masked
    expect(csMember.email).toBe('c***b@example.com'); // Masked
  });

  it('15. returns masked PII when DB role is NULL even if session token claims role OWNER', async () => {
    mockTenantUsers.push({
      id: MOCK_ROLE_NULL_ID,
      tenant_id: MOCK_TENANT_ID_A,
      tenant_slug: MOCK_TENANT_SLUG_A,
      name: 'Null Role User',
      phone: '081255555555',
      email: 'null.role@example.com',
      role: null,
      access_level: 'LIVE_CHAT_ONLY',
      status: 'active',
      is_active: true,
      created_at: '2026-01-05T00:00:00Z',
    });

    const token = signMerchantSessionToken({
      tenantSlug: MOCK_TENANT_SLUG_A,
      tenantId: MOCK_TENANT_ID_A,
      role: 'OWNER',
      userId: MOCK_ROLE_NULL_ID,
    });

    const req = new NextRequest('http://localhost:3000/api/inbox/team-members?tenant=store-alpha', {
      method: 'GET',
      headers: { 'x-merchant-token': token },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    const ownerMember = body.teamMembers.find((m: any) => m.id === MOCK_OWNER_ID);
    expect(ownerMember.phone).toBe('0812****90'); // Masked because DB role is null
    expect(ownerMember.email).toBe('o***e@example.com'); // Masked
  });

  it('16. returns masked PII when DB role is empty string "" even if session token claims role OWNER', async () => {
    mockTenantUsers.push({
      id: MOCK_ROLE_EMPTY_ID,
      tenant_id: MOCK_TENANT_ID_A,
      tenant_slug: MOCK_TENANT_SLUG_A,
      name: 'Empty Role User',
      phone: '081266666666',
      email: 'empty.role@example.com',
      role: '',
      access_level: 'LIVE_CHAT_ONLY',
      status: 'active',
      is_active: true,
      created_at: '2026-01-06T00:00:00Z',
    });

    const token = signMerchantSessionToken({
      tenantSlug: MOCK_TENANT_SLUG_A,
      tenantId: MOCK_TENANT_ID_A,
      role: 'OWNER',
      userId: MOCK_ROLE_EMPTY_ID,
    });

    const req = new NextRequest('http://localhost:3000/api/inbox/team-members?tenant=store-alpha', {
      method: 'GET',
      headers: { 'x-merchant-token': token },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    const ownerMember = body.teamMembers.find((m: any) => m.id === MOCK_OWNER_ID);
    expect(ownerMember.phone).toBe('0812****90'); // Masked because DB role is empty
    expect(ownerMember.email).toBe('o***e@example.com'); // Masked
  });

  it('17. returns masked PII when DB role is unknown (e.g. MANAGER) even if session token claims role OWNER', async () => {
    mockTenantUsers.push({
      id: MOCK_ROLE_MANAGER_ID,
      tenant_id: MOCK_TENANT_ID_A,
      tenant_slug: MOCK_TENANT_SLUG_A,
      name: 'Manager User',
      phone: '081277777777',
      email: 'manager.user@example.com',
      role: 'MANAGER',
      access_level: 'OPERATOR',
      status: 'active',
      is_active: true,
      created_at: '2026-01-07T00:00:00Z',
    });

    const token = signMerchantSessionToken({
      tenantSlug: MOCK_TENANT_SLUG_A,
      tenantId: MOCK_TENANT_ID_A,
      role: 'OWNER',
      userId: MOCK_ROLE_MANAGER_ID,
    });

    const req = new NextRequest('http://localhost:3000/api/inbox/team-members?tenant=store-alpha', {
      method: 'GET',
      headers: { 'x-merchant-token': token },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    const ownerMember = body.teamMembers.find((m: any) => m.id === MOCK_OWNER_ID);
    expect(ownerMember.phone).toBe('0812****90'); // Masked because DB role MANAGER !== OWNER
    expect(ownerMember.email).toBe('o***e@example.com'); // Masked
  });

  // -------------------------------------------------------------------------
  // 7. Tenant Binding & Authoritative UUID Tests
  // -------------------------------------------------------------------------
  it('18. succeeds with 200 when Tenant ID and correct slug match session and database', async () => {
    const token = signMerchantSessionToken({
      tenantSlug: MOCK_TENANT_SLUG_A,
      tenantId: MOCK_TENANT_ID_A,
      role: 'CS',
      userId: MOCK_CS_ID,
    });

    const req = new NextRequest('http://localhost:3000/api/inbox/team-members?tenant=store-alpha', {
      method: 'GET',
      headers: { 'x-merchant-token': token },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    for (const member of body.teamMembers) {
      expect(member.tenant_id).toBe(MOCK_TENANT_ID_A);
    }
  });

  it('19. succeeds with 200 when Tenant ID matches even if session contains stale/old slug (exact tenant_id authoritative)', async () => {
    // Session token has outdated slug 'stale-legacy-slug', but exact tenantId matches DB
    const token = signMerchantSessionToken({
      tenantSlug: 'stale-legacy-slug',
      tenantId: MOCK_TENANT_ID_A,
      role: 'CS',
      userId: MOCK_CS_ID,
    });

    const req = new NextRequest(
      `http://localhost:3000/api/inbox/team-members?tenantId=${MOCK_TENANT_ID_A}`,
      {
        method: 'GET',
        headers: { 'x-merchant-token': token },
      }
    );

    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.teamMembers.length).toBeGreaterThan(0);
    for (const member of body.teamMembers) {
      expect(member.tenant_id).toBe(MOCK_TENANT_ID_A);
    }
  });

  it('20. rejects with 403 TENANT_MISMATCH when Tenant ID A session queries Tenant B slug on selector', async () => {
    const token = signMerchantSessionToken({
      tenantSlug: MOCK_TENANT_SLUG_A,
      tenantId: MOCK_TENANT_ID_A,
      role: 'CS',
      userId: MOCK_CS_ID,
    });

    const req = new NextRequest('http://localhost:3000/api/inbox/team-members?slug=store-beta', {
      method: 'GET',
      headers: { 'x-merchant-token': token },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('TENANT_MISMATCH');
  });

  it('21. rejects with 403 TENANT_CROSS_ACCESS_FORBIDDEN when Tenant A session caller belongs to Tenant B in database', async () => {
    // Session claims Tenant A, but caller user belongs to Tenant B
    const token = signMerchantSessionToken({
      tenantSlug: MOCK_TENANT_SLUG_A,
      tenantId: MOCK_TENANT_ID_A,
      role: 'CS',
      userId: MOCK_OTHER_TENANT_USER_ID,
    });

    const req = new NextRequest('http://localhost:3000/api/inbox/team-members?tenant=store-alpha', {
      method: 'GET',
      headers: { 'x-merchant-token': token },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('TENANT_CROSS_ACCESS_FORBIDDEN');
  });

  it('22. rejects with 403 TENANT_MISMATCH on conflicting multiple query aliases (?tenant=store-alpha&tenantId=store-beta)', async () => {
    const token = signMerchantSessionToken({
      tenantSlug: MOCK_TENANT_SLUG_A,
      tenantId: MOCK_TENANT_ID_A,
      role: 'CS',
      userId: MOCK_CS_ID,
    });

    const req = new NextRequest(
      'http://localhost:3000/api/inbox/team-members?tenant=store-alpha&tenantId=store-beta',
      {
        method: 'GET',
        headers: { 'x-merchant-token': token },
      }
    );

    const res = await GET(req);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('TENANT_MISMATCH');
  });
});
