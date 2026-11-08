/**
 * __tests__/workforce/rsc-and-dashboard-remediation.test.ts
 * BWM Gate 1 Round 3T.1 (Phase 2): RSC Server Rendering & Dashboard Server API Remediation
 *
 * Directives (CTO Official Mandate Round 3T.1 — Phase 2):
 * 1. Finance & Inbox Server Authorization Chain (RSC Stream Protection):
 *    - Unauthenticated request is rejected.
 *    - Cross-tenant token is rejected (strict tenant binding).
 *    - Revoked membership (is_active = false) fails closed (403/Forbidden).
 *    - Finance rejects non-management roles (CS/OPERATOR).
 *    - Inbox allows operational roles (OWNER, MERCHANT, OPERATOR, CS).
 *    - Constructive DTO projection guarantees zero secrets in RSC HTML stream props.
 * 2. Operational Server API CRUD Workflows:
 *    - Microsite buttons/CTA, theme, FAQ, QRIS, logo, WABA, Ads tracking, courier/pickup settings.
 *    - Read-after-write persistence verified via server API.
 *    - Unauthorized mutations strictly rejected.
 */

jest.unmock('@/lib/supabaseClient');
jest.unmock('@supabase/supabase-js');

import fs from 'fs';
import path from 'path';

// Pre-load .env.local into process.env before Supabase client initialization
const envPath = path.resolve('.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of envContent.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    process.env[key] = val;
  }
}

import crypto from 'crypto';
import { Client } from 'pg';
import { NextRequest } from 'next/server';
import {
  signMerchantSessionToken,
  authorizeServerComponentTenant,
} from '@/lib/auth/merchant-session';
import {
  GET as getSettings,
  PUT as updateSettings,
  sanitizeSettingsForRole,
  projectSafeRscTenantDto,
} from '@/app/api/v1/tenants/[slug]/settings/route';
import { assertStagingDatabaseTarget, assertStagingRestUrlTarget, getWorkforceSupabaseAdmin, getSupabaseAdmin } from '@/lib/supabaseClient';

function getDatabaseConnectionString(): string {
  let directUrl = process.env.WORKFORCE_DATABASE_DIRECT_URL;
  let poolerUrl = process.env.WORKFORCE_DATABASE_URL;

  if (!directUrl || !poolerUrl) {
    try {
      if (fs.existsSync(envPath)) {
        const envFile = fs.readFileSync(envPath, 'utf8');
        const matchDirect = envFile.match(/^WORKFORCE_DATABASE_DIRECT_URL=(.*)$/m);
        const matchPooler = envFile.match(/^WORKFORCE_DATABASE_URL=(.*)$/m);
        if (matchDirect) directUrl = matchDirect[1].trim().replace(/^["']|["']$/g, '');
        if (matchPooler) poolerUrl = matchPooler[1].trim().replace(/^["']|["']$/g, '');
      }
    } catch {
      // ignore
    }
  }

  const connStr = directUrl || poolerUrl;
  if (!connStr) {
    throw new Error('STAGING_DB_REQUIRED: Staging connection required for RSC remediation tests');
  }
  return connStr;
}

describe('BWM Gate 1 Round 3T.1 (Phase 2) — RSC Server Rendering & Dashboard Server API Remediation', () => {
  let pgClient: Client;
  const timestamp = Date.now();

  const TENANT_A_SLUG = `rsc-sec-a-${timestamp}`;
  const TENANT_B_SLUG = `rsc-sec-b-${timestamp}`;
  let tenantAId: string;
  let tenantBId: string;

  const USER_OWNER_A = crypto.randomUUID();
  const USER_MERCHANT_A = crypto.randomUUID();
  const USER_CS_A = crypto.randomUUID();
  const USER_REVOKED_A = crypto.randomUUID();
  const USER_OWNER_B = crypto.randomUUID();

  let tokenOwnerA: string;
  let tokenMerchantA: string;
  let tokenCsA: string;
  let tokenRevokedA: string;
  let tokenOwnerB: string;

  // Sensitive canaries
  const CANARIES = {
    capiToken: `CANARY_CAPI_TOKEN_${timestamp}_RSC`,
    wabaAccessToken: `CANARY_WABA_TOKEN_${timestamp}_RSC`,
    adminSecret: `CANARY_ADMIN_SECRET_${timestamp}_RSC`,
    privateBankKey: `CANARY_BANK_SECRET_${timestamp}_RSC`,
  };

  beforeAll(async () => {
    const connStr = getDatabaseConnectionString();
    // P0-A: Staging guard — abort if connection targets production database
    assertStagingDatabaseTarget(connStr);

    pgClient = new Client({ connectionString: connStr });
    await pgClient.connect();
    await pgClient.query('SET search_path TO workforce_staging, public');

    // 1. Seed Tenant A with sensitive canaries
    const resA = await pgClient.query(`
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, is_active, public_storefront_enabled,
        metadata
      ) VALUES (
        $1, 'Tenant Alpha RSC', 'retail', 'PRO_SCALE', 'active', true, true,
        $2::jsonb
      ) RETURNING id
    `, [
      TENANT_A_SLUG,
      JSON.stringify({
        store_name: 'Alpha Store',
        display_name: 'Alpha Official',
        tagline: 'Best Digital Products',
        capi_token: CANARIES.capiToken,
        waba_access_token: CANARIES.wabaAccessToken,
        admin_secret: CANARIES.adminSecret,
        private_bank_credential: CANARIES.privateBankKey,
        theme: {
          template: 'modern',
          primary_color: '#00cc88',
        },
        faqs: [
          { id: 'faq-1', question: 'Jam operasional?', answer: '24/7' },
        ],
        business_hours: {
          is_always_open: true,
        },
        microsite: {
          buttons: [
            { id: 'btn-1', label: 'Beli Sekarang', url: 'https://boontrack.com' },
          ],
        },
      }),
    ]);
    tenantAId = resA.rows[0].id;

    // 2. Seed Tenant B (for cross-tenant tests)
    const resB = await pgClient.query(`
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, is_active, public_storefront_enabled,
        metadata
      ) VALUES (
        $1, 'Tenant Beta RSC', 'retail', 'STARTER', 'active', true, true,
        '{}'::jsonb
      ) RETURNING id
    `, [TENANT_B_SLUG]);
    tenantBId = resB.rows[0].id;

    // 3. Seed Memberships for Tenant A
    await pgClient.query(`
      INSERT INTO workforce_staging.tenant_memberships (
        user_id, tenant_id, tenant_slug, role, is_active
      ) VALUES
        ($1, $2, $3, 'OWNER', true),
        ($4, $2, $3, 'MERCHANT', true),
        ($5, $2, $3, 'CS', true),
        ($6, $2, $3, 'OWNER', false)
    `, [USER_OWNER_A, tenantAId, TENANT_A_SLUG, USER_MERCHANT_A, USER_CS_A, USER_REVOKED_A]);

    // 4. Seed Membership for Tenant B
    await pgClient.query(`
      INSERT INTO workforce_staging.tenant_memberships (
        user_id, tenant_id, tenant_slug, role, is_active
      ) VALUES
        ($1, $2, $3, 'OWNER', true)
    `, [USER_OWNER_B, tenantBId, TENANT_B_SLUG]);

    // 5. Mint signed session tokens
    tokenOwnerA = signMerchantSessionToken({
      tenantSlug: TENANT_A_SLUG,
      tenantId: tenantAId,
      userId: USER_OWNER_A,
      role: 'OWNER',
    });

    tokenMerchantA = signMerchantSessionToken({
      tenantSlug: TENANT_A_SLUG,
      tenantId: tenantAId,
      userId: USER_MERCHANT_A,
      role: 'MERCHANT',
    });

    tokenCsA = signMerchantSessionToken({
      tenantSlug: TENANT_A_SLUG,
      tenantId: tenantAId,
      userId: USER_CS_A,
      role: 'CS',
    });

    tokenRevokedA = signMerchantSessionToken({
      tenantSlug: TENANT_A_SLUG,
      tenantId: tenantAId,
      userId: USER_REVOKED_A,
      role: 'OWNER',
    });

    tokenOwnerB = signMerchantSessionToken({
      tenantSlug: TENANT_B_SLUG,
      tenantId: tenantBId,
      userId: USER_OWNER_B,
      role: 'OWNER',
    });
  });

  afterAll(async () => {
    if (pgClient) {
      await pgClient.query('DELETE FROM workforce_staging.tenant_memberships WHERE tenant_id = ANY($1)', [
        [tenantAId, tenantBId].filter(Boolean),
      ]);
      await pgClient.query('DELETE FROM workforce_staging.tenants WHERE id = ANY($1)', [
        [tenantAId, tenantBId].filter(Boolean),
      ]);
      await pgClient.end();
    }
  });

  // =========================================================================
  // 1. SERVER COMPONENT AUTHORIZATION CHAIN & RSC STREAM PROTECTION
  // =========================================================================
  describe('1. Server Component Authorization Chain & RSC Stream Protection', () => {
    it('1.1 Rejects unauthenticated request with reason UNAUTHENTICATED', async () => {
      const res = await authorizeServerComponentTenant(TENANT_A_SLUG, ['OWNER', 'MERCHANT'], null);
      expect(res.authorized).toBe(false);
      expect(res.reason).toBe('UNAUTHENTICATED');
    });

    it('1.2 Rejects cross-tenant token with reason FORBIDDEN (Tenant B token accessing Tenant A)', async () => {
      const res = await authorizeServerComponentTenant(TENANT_A_SLUG, ['OWNER', 'MERCHANT'], tokenOwnerB);
      expect(res.authorized).toBe(false);
      expect(res.reason).toBe('FORBIDDEN');
    });

    it('1.3 Rejects revoked membership with reason FORBIDDEN (Fail-closed on is_active = false)', async () => {
      const res = await authorizeServerComponentTenant(TENANT_A_SLUG, ['OWNER', 'MERCHANT'], tokenRevokedA);
      expect(res.authorized).toBe(false);
      expect(res.reason).toBe('FORBIDDEN');
    });

    it('1.4 Finance Page Authorization: Rejects CS role but authorizes OWNER and MERCHANT', async () => {
      // CS attempting Finance -> Rejected
      const resCs = await authorizeServerComponentTenant(TENANT_A_SLUG, ['OWNER', 'MERCHANT'], tokenCsA);
      expect(resCs.authorized).toBe(false);
      expect(resCs.reason).toBe('FORBIDDEN');

      // Merchant attempting Finance -> Authorized
      const resMerchant = await authorizeServerComponentTenant(TENANT_A_SLUG, ['OWNER', 'MERCHANT'], tokenMerchantA);
      expect(resMerchant.authorized).toBe(true);
      expect(resMerchant.role).toBe('MERCHANT');
      expect(resMerchant.tenantRow).toBeDefined();

      // Owner attempting Finance -> Authorized
      const resOwner = await authorizeServerComponentTenant(TENANT_A_SLUG, ['OWNER', 'MERCHANT'], tokenOwnerA);
      expect(resOwner.authorized).toBe(true);
      expect(resOwner.role).toBe('OWNER');
    });

    it('1.5 Inbox Page Authorization: Authorizes CS, MERCHANT, and OWNER roles', async () => {
      const allowed = ['OWNER', 'MERCHANT', 'OPERATOR', 'CS'] as Array<'OWNER' | 'MERCHANT' | 'OPERATOR' | 'CS'>;

      const resCs = await authorizeServerComponentTenant(TENANT_A_SLUG, allowed, tokenCsA);
      expect(resCs.authorized).toBe(true);
      expect(resCs.role).toBe('CS');

      const resMerchant = await authorizeServerComponentTenant(TENANT_A_SLUG, allowed, tokenMerchantA);
      expect(resMerchant.authorized).toBe(true);
      expect(resMerchant.role).toBe('MERCHANT');

      const resOwner = await authorizeServerComponentTenant(TENANT_A_SLUG, allowed, tokenOwnerA);
      expect(resOwner.authorized).toBe(true);
      expect(resOwner.role).toBe('OWNER');
    });

    it('1.6 Constructive DTO Projection: initialTenant prop contains ZERO secrets for non-OWNER', async () => {
      const auth = await authorizeServerComponentTenant(TENANT_A_SLUG, ['OWNER', 'MERCHANT'], tokenMerchantA);
      expect(auth.authorized).toBe(true);

      const safeDto = sanitizeSettingsForRole(auth.tenantRow, auth.role || 'MERCHANT');
      const serialized = JSON.stringify(safeDto);

      // Assert complete absence of any secret canaries
      expect(serialized).not.toContain(CANARIES.capiToken);
      expect(serialized).not.toContain(CANARIES.wabaAccessToken);
      expect(serialized).not.toContain(CANARIES.adminSecret);
      expect(serialized).not.toContain(CANARIES.privateBankKey);

      // Assert explicit nullification of secret fields
      expect(safeDto.capi_token).toBeNull();
      expect(safeDto.waba_access_token).toBeNull();

      // Assert preservation of legitimate operational fields
      expect(safeDto.slug).toBe(TENANT_A_SLUG);
      expect(safeDto.store_name).toBe('Alpha Store');
      expect(safeDto.theme.template).toBe('modern');
      expect(safeDto.faqs[0].question).toBe('Jam operasional?');
    });
  });

  // =========================================================================
  // 2. OPERATIONAL SERVER API CRUD & PERSISTENCE
  // =========================================================================
  describe('2. Operational Server API CRUD & Persistence via /api/v1/tenants/[slug]/settings', () => {
    it('2.1 Updates and persists Microsite buttons & public links', async () => {
      const putReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify({
          microsite: {
            buttons: [
              { id: 'btn-test-1', label: 'Hubungi WhatsApp', url: 'https://wa.me/628111', icon: 'whatsapp' },
            ],
            show_products: true,
          },
          public_links: [
            { title: 'Instagram Alpha', url: 'https://instagram.com/alpha', platform: 'instagram' },
          ],
        }),
      });

      const putRes = await updateSettings(putReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(putRes.status).toBe(200);

      // Verify read-after-write persistence
      const getReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
      });
      const getRes = await getSettings(getReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(getRes.status).toBe(200);
      const json = await getRes.json();

      expect(json.settings.metadata.microsite.buttons[0].label).toBe('Hubungi WhatsApp');
      expect(json.settings.metadata.public_links[0].title).toBe('Instagram Alpha');
    });

    it('2.2 Updates and persists Theme & FAQs', async () => {
      const putReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify({
          theme: {
            template: 'aurora',
            primary_color: '#3b82f6',
            chat_enabled: true,
          },
          faqs: [
            { id: 'faq-new-1', question: 'Bisa return?', answer: 'Bisa maksimal 7 hari.' },
          ],
        }),
      });

      const putRes = await updateSettings(putReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(putRes.status).toBe(200);

      const getReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
      });
      const getRes = await getSettings(getReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      const json = await getRes.json();

      expect(json.settings.theme.template).toBe('aurora');
      expect(json.settings.theme.primary_color).toBe('#3b82f6');
      expect(json.settings.faqs[0].question).toBe('Bisa return?');
    });

    it('2.3 Updates and persists QRIS image & payload', async () => {
      const qrisUrl = 'https://assets.boontrack.com/qris/alpha-new.png';
      const qrisPayload = '00020101021126570011ID.CO.QRIS.WWW01189360000000000000005204581253033605802ID5913ALPHA STORE6007BANDUNG61054011562070703A016304ABCD';

      const putReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify({
          qris_image_url: qrisUrl,
          qris_payload: qrisPayload,
          is_qris_active: true,
        }),
      });

      const putRes = await updateSettings(putReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(putRes.status).toBe(200);

      // As OWNER, verify persisted settings
      const getReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
      });
      const getRes = await getSettings(getReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      const json = await getRes.json();

      expect(json.settings.qris_image_url).toBe(qrisUrl);
      expect(json.settings.metadata.qris_payload).toBe(qrisPayload);
    });

    it('2.4 Updates and persists Logo & Store Branding', async () => {
      const newLogoUrl = 'https://assets.boontrack.com/logos/alpha-logo-2026.png';

      const putReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify({
          logo_url: newLogoUrl,
          store_name: 'Alpha Official Storefront',
        }),
      });

      const putRes = await updateSettings(putReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(putRes.status).toBe(200);

      const getReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
      });
      const getRes = await getSettings(getReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      const json = await getRes.json();

      expect(json.settings.logo_url).toBe(newLogoUrl);
      expect(json.settings.store_name).toBe('Alpha Official Storefront');
    });

    it('2.5 Updates and persists Self Pickup & Logistics Configuration', async () => {
      const putReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify({
          self_pickup_config: {
            is_enabled: true,
            pickup_address: 'Gudang Utama Alpha, Jl. Asia Afrika No. 10',
            pickup_maps_url: 'https://maps.google.com/?q=-6.921,107.61',
            pickup_instructions: 'Buka Senin-Sabtu 09.00 - 18.00 WIB',
          },
          shipping_config: {
            is_self_pickup_enabled: true,
            pickup_address: 'Gudang Utama Alpha, Jl. Asia Afrika No. 10',
            pickup_maps_url: 'https://maps.google.com/?q=-6.921,107.61',
            pickup_instructions: 'Buka Senin-Sabtu 09.00 - 18.00 WIB',
          },
        }),
      });

      const putRes = await updateSettings(putReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(putRes.status).toBe(200);

      const getReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
      });
      const getRes = await getSettings(getReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      const json = await getRes.json();

      expect(json.settings.metadata.self_pickup_config.is_enabled).toBe(true);
      expect(json.settings.metadata.self_pickup_config.pickup_address).toBe('Gudang Utama Alpha, Jl. Asia Afrika No. 10');
    });

    it('2.6 Rejects unauthorized mutation attempts (Cross-Tenant & Revoked)', async () => {
      // Cross-tenant attempt (Tenant B attempting to mutate Tenant A)
      const crossReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerB}`,
        },
        body: JSON.stringify({ store_name: 'Hacked Store' }),
      });
      const crossRes = await updateSettings(crossReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(crossRes.status).toBe(403);

      // Revoked member attempt
      const revokedReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenRevokedA}`,
        },
        body: JSON.stringify({ store_name: 'Hacked By Revoked' }),
      });
      const revokedRes = await updateSettings(revokedReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(revokedRes.status).toBe(403);

      // Unauthenticated attempt
      const unauthReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_name: 'Hacked Unauth' }),
      });
      const unauthRes = await updateSettings(unauthReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(unauthRes.status).toBe(401);
    });
  });

  // =========================================================================
  // P0-B: userId-missing token negative tests (Round 3T.1 Follow-Up)
  // =========================================================================
  describe('P0-B: userId-Missing Token Negative Tests', () => {
    it('P0-B.1 Valid HMAC token missing userId is rejected with FORBIDDEN even when tenant has active memberships', async () => {
      // Sign a token with valid tenantSlug/tenantId but NO userId field
      const tokenNoUserId = signMerchantSessionToken({
        tenantSlug: TENANT_A_SLUG,
        tenantId: tenantAId,
        role: 'OWNER',
        // userId deliberately omitted
      } as any);

      const result = await authorizeServerComponentTenant(TENANT_A_SLUG, ['OWNER', 'MERCHANT'], tokenNoUserId);
      // Must be rejected — userId is mandatory
      expect(result.authorized).toBe(false);
      expect(result.reason).toBe('FORBIDDEN');
    });

    it('P0-B.2 Token with userId = null is rejected with FORBIDDEN', async () => {
      const tokenNullUserId = signMerchantSessionToken({
        tenantSlug: TENANT_A_SLUG,
        tenantId: tenantAId,
        role: 'OWNER',
        userId: null,
      } as any);

      const result = await authorizeServerComponentTenant(TENANT_A_SLUG, ['OWNER', 'MERCHANT'], tokenNullUserId);
      expect(result.authorized).toBe(false);
      expect(result.reason).toBe('FORBIDDEN');
    });

    it('P0-B.3 Token with userId = empty string is rejected with FORBIDDEN', async () => {
      const tokenEmptyUserId = signMerchantSessionToken({
        tenantSlug: TENANT_A_SLUG,
        tenantId: tenantAId,
        role: 'MERCHANT',
        userId: '',
      });

      const result = await authorizeServerComponentTenant(TENANT_A_SLUG, ['OWNER', 'MERCHANT'], tokenEmptyUserId);
      expect(result.authorized).toBe(false);
      expect(result.reason).toBe('FORBIDDEN');
    });
  });
});

// =========================================================================
// P0-A: Database Project Isolation Unit Tests (pure unit, no DB connection)
// =========================================================================
describe('P0-A: Database Project Isolation Unit Tests', () => {
  it('P0-A.1 Rejects empty or missing connection string', () => {
    expect(() => assertStagingDatabaseTarget('')).toThrow('[STAGING GUARD FATAL] Database connection string is empty');
    expect(() => assertStagingDatabaseTarget('   ')).toThrow('[STAGING GUARD FATAL] Database connection string is empty');
    expect(() => assertStagingDatabaseTarget(null as any)).toThrow('[STAGING GUARD FATAL] Database connection string is empty');
    expect(() => assertStagingDatabaseTarget(undefined as any)).toThrow('[STAGING GUARD FATAL] Database connection string is empty');
  });

  it('P0-A.2 Rejects production database URL (mpluzajlzpregmjwpjqr)', () => {
    const prodDirect = 'postgresql://postgres:secretpassword@db.mpluzajlzpregmjwpjqr.supabase.co:5432/postgres';
    expect(() => assertStagingDatabaseTarget(prodDirect)).toThrow(
      '[STAGING GUARD FATAL] Connection string targets production database (mpluzajlzpregmjwpjqr)'
    );

    // Verify error does not leak credentials
    try {
      assertStagingDatabaseTarget(prodDirect);
    } catch (err: any) {
      expect(err.message).not.toContain('secretpassword');
    }
  });

  it('P0-A.3 Rejects Studio staging URL (xkhqirhurnjqglmajghn) — both direct and pooler formats', () => {
    const studioDirect = 'postgresql://postgres:secretpassword@db.xkhqirhurnjqglmajghn.supabase.co:5432/postgres';
    expect(() => assertStagingDatabaseTarget(studioDirect)).toThrow(
      '[STAGING GUARD FATAL] Connection string targets Studio staging (xkhqirhurnjqglmajghn)'
    );

    const studioPooler = 'postgresql://postgres.xkhqirhurnjqglmajghn:secretpassword@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true';
    expect(() => assertStagingDatabaseTarget(studioPooler)).toThrow(
      '[STAGING GUARD FATAL] Connection string targets Studio staging (xkhqirhurnjqglmajghn)'
    );

    // Verify error does not leak credentials
    try {
      assertStagingDatabaseTarget(studioDirect);
    } catch (err: any) {
      expect(err.message).not.toContain('secretpassword');
    }
    try {
      assertStagingDatabaseTarget(studioPooler);
    } catch (err: any) {
      expect(err.message).not.toContain('secretpassword');
    }
  });

  it('P0-A.4 Rejects unknown third-party project reference', () => {
    const rogueUrl = 'postgresql://postgres:secretpassword@db.rogueattackerproject.supabase.co:5432/postgres';
    expect(() => assertStagingDatabaseTarget(rogueUrl)).toThrow(
      '[STAGING GUARD FATAL] Connection string hostname'
    );
  });

  it('P0-A.5 Accepts designated Workforce staging direct connection string (tjkbgxrckaocgosvmzmj)', () => {
    const validDirectWorkforce = 'postgresql://postgres:testpass@db.tjkbgxrckaocgosvmzmj.supabase.co:5432/postgres';
    expect(() => assertStagingDatabaseTarget(validDirectWorkforce)).not.toThrow();

    const validDirectPostgresProto = 'postgres://postgres:testpass@db.tjkbgxrckaocgosvmzmj.supabase.co:5432/postgres';
    expect(() => assertStagingDatabaseTarget(validDirectPostgresProto)).not.toThrow();
  });

  it('P0-A.6 Accepts designated Workforce staging pooler connection string (validates project ref in pooler username)', () => {
    const validPoolerWorkforce = 'postgresql://postgres.tjkbgxrckaocgosvmzmj:testpass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true';
    expect(() => assertStagingDatabaseTarget(validPoolerWorkforce)).not.toThrow();
  });

  it('P0-A.7 Rejects spoofed URL attempting to smuggle project ref in database path, query parameter, or password', () => {
    // Project ref in database name instead of postgres
    const spoofedPath = 'postgresql://postgres:testpass@db.attackerhost.com:5432/tjkbgxrckaocgosvmzmj';
    expect(() => assertStagingDatabaseTarget(spoofedPath)).toThrow(
      '[STAGING GUARD FATAL] Invalid database name (tjkbgxrckaocgosvmzmj). Expected postgres.'
    );

    // Project ref smuggled in query parameter while database is postgres
    const spoofedQuery = 'postgresql://postgres:testpass@db.attackerhost.com:5432/postgres?ref=tjkbgxrckaocgosvmzmj';
    expect(() => assertStagingDatabaseTarget(spoofedQuery)).toThrow(
      '[STAGING GUARD FATAL] Hostname lookalike or project ref smuggling detected'
    );

    // Project ref smuggled in password while database is postgres
    const spoofedPassword = 'postgresql://postgres:tjkbgxrckaocgosvmzmj@db.attackerhost.com:5432/postgres';
    expect(() => assertStagingDatabaseTarget(spoofedPassword)).toThrow(
      '[STAGING GUARD FATAL] Hostname lookalike or project ref smuggling detected'
    );
  });

  it('P0-A.8 Rejects hostname lookalikes (suffix and prefix attacks)', () => {
    const suffixLookalike = 'postgresql://postgres:testpass@db.tjkbgxrckaocgosvmzmj.supabase.co.attacker.example:5432/postgres';
    expect(() => assertStagingDatabaseTarget(suffixLookalike)).toThrow(
      '[STAGING GUARD FATAL] Hostname lookalike or project ref smuggling detected'
    );

    const prefixLookalike = 'postgresql://postgres:testpass@attacker-db.tjkbgxrckaocgosvmzmj.supabase.co:5432/postgres';
    expect(() => assertStagingDatabaseTarget(prefixLookalike)).toThrow(
      '[STAGING GUARD FATAL] Hostname lookalike or project ref smuggling detected'
    );
  });

  it('P0-A.9 Rejects malformed database connection URL', () => {
    expect(() => assertStagingDatabaseTarget('not-a-valid-url')).toThrow(
      '[STAGING GUARD FATAL] Malformed database connection URL'
    );
  });

  it('P0-A.10 Rejects invalid protocol (non-postgres)', () => {
    const httpUrl = 'http://db.tjkbgxrckaocgosvmzmj.supabase.co:5432/postgres';
    expect(() => assertStagingDatabaseTarget(httpUrl)).toThrow(
      '[STAGING GUARD FATAL] Invalid protocol (http:)'
    );

    const mysqlUrl = 'mysql://postgres:testpass@db.tjkbgxrckaocgosvmzmj.supabase.co:5432/postgres';
    expect(() => assertStagingDatabaseTarget(mysqlUrl)).toThrow(
      '[STAGING GUARD FATAL] Invalid protocol (mysql:)'
    );
  });

  it('P0-A.11 Rejects incorrect port for direct and pooler connections', () => {
    const badPortDirect = 'postgresql://postgres:testpass@db.tjkbgxrckaocgosvmzmj.supabase.co:5433/postgres';
    expect(() => assertStagingDatabaseTarget(badPortDirect)).toThrow(
      '[STAGING GUARD FATAL] Invalid port (5433) for direct staging connection'
    );

    const badPortPooler = 'postgresql://postgres.tjkbgxrckaocgosvmzmj:testpass@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';
    expect(() => assertStagingDatabaseTarget(badPortPooler)).toThrow(
      '[STAGING GUARD FATAL] Invalid port (5432) for pooler connection'
    );
  });

  it('P0-A.12 Rejects incorrect database name', () => {
    const badDbName = 'postgresql://postgres:testpass@db.tjkbgxrckaocgosvmzmj.supabase.co:5432/otherdb';
    expect(() => assertStagingDatabaseTarget(badDbName)).toThrow(
      '[STAGING GUARD FATAL] Invalid database name (otherdb). Expected postgres.'
    );
  });

  it('P0-A.13 Rejects invalid pooler username', () => {
    const badPoolerUser = 'postgresql://postgres.attacker:testpass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
    expect(() => assertStagingDatabaseTarget(badPoolerUser)).toThrow(
      '[STAGING GUARD FATAL] Invalid pooler username (postgres.attacker)'
    );
  });

  it('P0-A.14 Rejects invalid pooler hostname', () => {
    const badPoolerHost = 'postgresql://postgres.tjkbgxrckaocgosvmzmj:testpass@aws-0-attacker.pooler.supabase.com:6543/postgres';
    expect(() => assertStagingDatabaseTarget(badPoolerHost)).toThrow(
      '[STAGING GUARD FATAL] Hostname lookalike or project ref smuggling detected'
    );
  });

  it('P0-A.15 Validates WORKFORCE_TARGET_SCHEMA environment variable', () => {
    const originalSchema = process.env.WORKFORCE_TARGET_SCHEMA;
    const validDirect = 'postgresql://postgres:testpass@db.tjkbgxrckaocgosvmzmj.supabase.co:5432/postgres';

    try {
      process.env.WORKFORCE_TARGET_SCHEMA = 'production_schema';
      expect(() => assertStagingDatabaseTarget(validDirect)).toThrow(
        '[STAGING GUARD FATAL] WORKFORCE_TARGET_SCHEMA must be workforce_staging'
      );

      process.env.WORKFORCE_TARGET_SCHEMA = 'workforce_staging';
      expect(() => assertStagingDatabaseTarget(validDirect)).not.toThrow();
    } finally {
      process.env.WORKFORCE_TARGET_SCHEMA = originalSchema;
    }
  });
});

// =========================================================================
// P0-A.REST: Strict Supabase REST URL Validation Unit Tests (pure unit)
// =========================================================================
describe('P0-A.REST: Strict Supabase REST URL Validation Unit Tests', () => {
  it('REST-1 Accepts exact canonical Workforce Supabase REST URL', () => {
    expect(assertStagingRestUrlTarget('https://tjkbgxrckaocgosvmzmj.supabase.co')).toBe(
      'https://tjkbgxrckaocgosvmzmj.supabase.co'
    );
    expect(assertStagingRestUrlTarget('https://tjkbgxrckaocgosvmzmj.supabase.co/')).toBe(
      'https://tjkbgxrckaocgosvmzmj.supabase.co'
    );
    expect(assertStagingRestUrlTarget('https://tjkbgxrckaocgosvmzmj.supabase.co:443')).toBe(
      'https://tjkbgxrckaocgosvmzmj.supabase.co'
    );
  });

  it('REST-2 Rejects missing, empty, or whitespace-only REST URL', () => {
    expect(() => assertStagingRestUrlTarget('')).toThrow(
      '[STAGING GUARD FATAL] WORKFORCE_SUPABASE_URL is missing or empty'
    );
    expect(() => assertStagingRestUrlTarget('   ')).toThrow(
      '[STAGING GUARD FATAL] WORKFORCE_SUPABASE_URL is missing or empty'
    );
    expect(() => assertStagingRestUrlTarget(null as any)).toThrow(
      '[STAGING GUARD FATAL] WORKFORCE_SUPABASE_URL is missing or empty'
    );
    expect(() => assertStagingRestUrlTarget(undefined as any)).toThrow(
      '[STAGING GUARD FATAL] WORKFORCE_SUPABASE_URL is missing or empty'
    );
  });

  it('REST-3 Rejects production Supabase URL (mpluzajlzpregmjwpjqr)', () => {
    expect(() =>
      assertStagingRestUrlTarget('https://mpluzajlzpregmjwpjqr.supabase.co')
    ).toThrow('[STAGING GUARD FATAL] REST URL targets production database (mpluzajlzpregmjwpjqr)');
  });

  it('REST-4 Rejects Studio staging URL (xkhqirhurnjqglmajghn)', () => {
    expect(() =>
      assertStagingRestUrlTarget('https://xkhqirhurnjqglmajghn.supabase.co')
    ).toThrow('[STAGING GUARD FATAL] REST URL targets Studio staging (xkhqirhurnjqglmajghn)');
  });

  it('REST-5 Rejects unknown/other Supabase project ref', () => {
    expect(() =>
      assertStagingRestUrlTarget('https://abcdefghijklmnop1234.supabase.co')
    ).toThrow('[STAGING GUARD FATAL] Invalid Supabase REST hostname');
  });

  it('REST-6 Rejects project ref smuggling in attacker hostname path', () => {
    expect(() =>
      assertStagingRestUrlTarget('https://attacker.com/tjkbgxrckaocgosvmzmj')
    ).toThrow('[STAGING GUARD FATAL] Hostname lookalike or project ref smuggling detected');
  });

  it('REST-7 Rejects project ref smuggling in attacker hostname query string', () => {
    expect(() =>
      assertStagingRestUrlTarget('https://attacker.com/?ref=tjkbgxrckaocgosvmzmj')
    ).toThrow('[STAGING GUARD FATAL] Hostname lookalike or project ref smuggling detected');
  });

  it('REST-8 Rejects hostname prefix and suffix lookalikes', () => {
    expect(() =>
      assertStagingRestUrlTarget('https://evil-tjkbgxrckaocgosvmzmj.supabase.co')
    ).toThrow('[STAGING GUARD FATAL] Hostname lookalike or project ref smuggling detected');
    expect(() =>
      assertStagingRestUrlTarget('https://tjkbgxrckaocgosvmzmj-evil.supabase.co')
    ).toThrow('[STAGING GUARD FATAL] Hostname lookalike or project ref smuggling detected');
    expect(() =>
      assertStagingRestUrlTarget('https://tjkbgxrckaocgosvmzmj.supabase.co.attacker.com')
    ).toThrow('[STAGING GUARD FATAL] Hostname lookalike or project ref smuggling detected');
  });

  it('REST-9 Rejects insecure HTTP protocol', () => {
    expect(() =>
      assertStagingRestUrlTarget('http://tjkbgxrckaocgosvmzmj.supabase.co')
    ).toThrow('[STAGING GUARD FATAL] Insecure protocol (http:). Expected https:.');
  });

  it('REST-10 Rejects unexpected ports on Supabase REST URL', () => {
    expect(() =>
      assertStagingRestUrlTarget('https://tjkbgxrckaocgosvmzmj.supabase.co:8443')
    ).toThrow('[STAGING GUARD FATAL] Unexpected port (8443)');
    expect(() =>
      assertStagingRestUrlTarget('https://tjkbgxrckaocgosvmzmj.supabase.co:5432')
    ).toThrow('[STAGING GUARD FATAL] Unexpected port (5432)');
  });

  it('REST-11 Rejects embedded credentials in REST URL', () => {
    expect(() =>
      assertStagingRestUrlTarget('https://user:password@tjkbgxrckaocgosvmzmj.supabase.co')
    ).toThrow('[STAGING GUARD FATAL] Embedded credentials in Supabase REST URL are strictly forbidden');
  });

  it('REST-12 Rejects URL with unexpected pathname beyond root', () => {
    expect(() =>
      assertStagingRestUrlTarget('https://tjkbgxrckaocgosvmzmj.supabase.co/rest/v1')
    ).toThrow('[STAGING GUARD FATAL] Unexpected pathname (/rest/v1) in Supabase REST URL base');
  });

  it('REST-13 Rejects URL with query string or fragment', () => {
    expect(() =>
      assertStagingRestUrlTarget('https://tjkbgxrckaocgosvmzmj.supabase.co?apiKey=123')
    ).toThrow('[STAGING GUARD FATAL] Query parameters in Supabase REST URL base are forbidden');
    expect(() =>
      assertStagingRestUrlTarget('https://tjkbgxrckaocgosvmzmj.supabase.co#fragment')
    ).toThrow('[STAGING GUARD FATAL] Fragment identifier in Supabase REST URL base is forbidden');
  });

  it('REST-14 Rejects canonical hostname with query string ?ref=test', () => {
    expect(() =>
      assertStagingRestUrlTarget('https://tjkbgxrckaocgosvmzmj.supabase.co?ref=test')
    ).toThrow('[STAGING GUARD FATAL] Query parameters in Supabase REST URL base are forbidden');
  });

  it('REST-15 Rejects completely malformed URLs (e.g. not a URL, syntax errors)', () => {
    expect(() => assertStagingRestUrlTarget('not-a-valid-url')).toThrow(
      '[STAGING GUARD FATAL] Malformed Supabase REST URL'
    );
    expect(() => assertStagingRestUrlTarget('ht tp://bad url')).toThrow(
      '[STAGING GUARD FATAL] Malformed Supabase REST URL'
    );
    expect(() => assertStagingRestUrlTarget('://missing-protocol')).toThrow(
      '[STAGING GUARD FATAL] Malformed Supabase REST URL'
    );
  });

  // ─── ADMIN-1 through ADMIN-5: getWorkforceSupabaseAdmin Runtime Isolation ──
  it('ADMIN-1 getWorkforceSupabaseAdmin returns active client against canonical staging project', () => {
    const admin = getWorkforceSupabaseAdmin();
    expect(admin).toBeDefined();
    expect(typeof admin.from).toBe('function');
  });

  it('ADMIN-2 getWorkforceSupabaseAdmin strictly fails when WORKFORCE_SUPABASE_URL is missing (zero fallback)', () => {
    const origUrl = process.env.WORKFORCE_SUPABASE_URL;
    const origShared = process.env.NEXT_PUBLIC_SUPABASE_URL;
    try {
      delete process.env.WORKFORCE_SUPABASE_URL;
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock-project.supabase.co';
      expect(() => getWorkforceSupabaseAdmin()).toThrow(/WORKFORCE ADMIN FATAL.*WORKFORCE_SUPABASE_URL is missing/);
    } finally {
      process.env.WORKFORCE_SUPABASE_URL = origUrl;
      process.env.NEXT_PUBLIC_SUPABASE_URL = origShared;
    }
  });

  it('ADMIN-3 getWorkforceSupabaseAdmin strictly fails when WORKFORCE_SUPABASE_SERVICE_ROLE_KEY is missing (zero fallback)', () => {
    const origKey = process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY;
    const origSharedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      delete process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'shared-key-that-must-not-be-used';
      expect(() => getWorkforceSupabaseAdmin()).toThrow(/WORKFORCE ADMIN FATAL.*WORKFORCE_SUPABASE_SERVICE_ROLE_KEY is missing/);
    } finally {
      process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = origKey;
      process.env.SUPABASE_SERVICE_ROLE_KEY = origSharedKey;
    }
  });

  it('ADMIN-4 getWorkforceSupabaseAdmin fails-closed when WORKFORCE_SUPABASE_URL targets production or Studio staging', () => {
    const origUrl = process.env.WORKFORCE_SUPABASE_URL;
    try {
      process.env.WORKFORCE_SUPABASE_URL = 'https://mpluzajlzpregmjwpjqr.supabase.co';
      expect(() => getWorkforceSupabaseAdmin()).toThrow(/targets production database/);

      process.env.WORKFORCE_SUPABASE_URL = 'https://xkhqirhurnjqglmajghn.supabase.co';
      expect(() => getWorkforceSupabaseAdmin()).toThrow(/targets Studio staging/);
    } finally {
      process.env.WORKFORCE_SUPABASE_URL = origUrl;
    }
  });

  it('ADMIN-5 getWorkforceSupabaseAdmin strictly fails if called in client browser window context', () => {
    (global as any).window = {};
    try {
      expect(() => getWorkforceSupabaseAdmin()).toThrow(/Security Guard/);
    } finally {
      delete (global as any).window;
    }
  });

  it('ADMIN-6 getWorkforceSupabaseAdmin and getSupabaseAdmin maintain independent singletons (not identical)', () => {
    const wfAdmin = getWorkforceSupabaseAdmin();
    const sharedAdmin = getSupabaseAdmin();
    expect(wfAdmin).toBeDefined();
    expect(sharedAdmin).toBeDefined();
    expect(wfAdmin).not.toBe(sharedAdmin);
  });

  it('ADMIN-7 Key rotation in Workforce factory rotates only Workforce instance and preserves Shared instance', () => {
    const origWfKey = process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY;
    try {
      const initialWf = getWorkforceSupabaseAdmin();
      const initialShared = getSupabaseAdmin();

      process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = 'rotated-workforce-key-test';
      const rotatedWf = getWorkforceSupabaseAdmin();
      const currentShared = getSupabaseAdmin();

      expect(rotatedWf).not.toBe(initialWf);
      expect(currentShared).toBe(initialShared);
    } finally {
      process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = origWfKey;
    }
  });
});

// =========================================================================
// P0-C: RSC Secret-Canary Tests — projectSafeRscTenantDto (pure unit, no DB required)
// =========================================================================
describe('P0-C: RSC Secret-Canary Tests — projectSafeRscTenantDto (Unit)', () => {
  const mockTenantRow = {
    id: 'rsc-canary-id',
    slug: 'rsc-canary-tenant',
    name: 'Canary Tenant',
    store_name: 'Canary Store',
    tier: 'PRO_SCALE',
    status: 'active',
    capi_token: 'RAW_CAPI_TOKEN_SECRET',
    waba_access_token: 'RAW_WABA_TOKEN_SECRET',
    waba_config: { access_token: 'RAW_WABA_CONFIG_SECRET', app_secret: 'RAW_APP_SECRET' },
    payment_config: { secret_key: 'RAW_PAYMENT_SECRET', api_key: 'RAW_PAYMENT_KEY' },
    gateway_config: { midtrans_server_key: 'RAW_MIDTRANS_KEY' },
    bank_accounts: [{ account_number: '1234567890', secret: 'RAW_BANK_SECRET' }],
    integration: { capi_token: 'RAW_INTEGRATION_CAPI' },
    metadata: {
      store_name: 'Canary Store Meta',
      capi_token: 'RAW_META_CAPI',
      waba_config: { access_token: 'RAW_META_WABA_TOKEN' },
      microsite: {
        title: 'Canary Microsite',
        subtitle: 'Public subtitle',
        buttons: [
          { label: 'WhatsApp', url: 'https://wa.me/6281234', action: 'whatsapp', secret_key: 'RAW_BUTTON_SECRET' },
        ],
        internal_secret: 'RAW_MICROSITE_SECRET',
      },
      shipping_config: {
        lincah: {
          api_key: 'RAW_LINCAH_API_KEY',
          secret: 'RAW_LINCAH_SECRET',
          is_connected: true,
          status: 'active',
        },
      },
    },
  };

  it('P0-C.1 projectSafeRscTenantDto for OWNER must NOT contain any raw secret values', () => {
    const dto = projectSafeRscTenantDto(mockTenantRow, 'OWNER');
    const serialized = JSON.stringify(dto);

    // Raw secret strings must NOT appear anywhere in the serialized DTO
    expect(serialized).not.toContain('RAW_CAPI_TOKEN_SECRET');
    expect(serialized).not.toContain('RAW_WABA_TOKEN_SECRET');
    expect(serialized).not.toContain('RAW_WABA_CONFIG_SECRET');
    expect(serialized).not.toContain('RAW_APP_SECRET');
    expect(serialized).not.toContain('RAW_PAYMENT_SECRET');
    expect(serialized).not.toContain('RAW_PAYMENT_KEY');
    expect(serialized).not.toContain('RAW_MIDTRANS_KEY');
    expect(serialized).not.toContain('RAW_BANK_SECRET');
    expect(serialized).not.toContain('RAW_INTEGRATION_CAPI');
    expect(serialized).not.toContain('RAW_META_CAPI');
    expect(serialized).not.toContain('RAW_META_WABA_TOKEN');
    expect(serialized).not.toContain('RAW_BUTTON_SECRET');
    expect(serialized).not.toContain('RAW_MICROSITE_SECRET');
    expect(serialized).not.toContain('RAW_LINCAH_API_KEY');
    expect(serialized).not.toContain('RAW_LINCAH_SECRET');

    // Explicit null for secret fields
    expect(dto.capi_token).toBeNull();
    expect(dto.waba_access_token).toBeNull();
    expect(dto.payment_config).toBeNull();
    expect(dto.gateway_config).toBeNull();
    expect(dto.bank_accounts).toBeNull();
    expect(dto.integration).toBeNull();

    // Boolean indicators must be present and correct
    expect(dto.has_capi_token).toBe(true);
    expect(dto.has_waba_access_token).toBe(true);
    expect(dto.has_payment_gateway).toBe(true);
  });

  it('P0-C.2 sanitizeSettingsForRole for MERCHANT/CS must NOT return raw secrets or hostile nested keys', () => {
    const dto = sanitizeSettingsForRole(mockTenantRow, 'MERCHANT');
    const serialized = JSON.stringify(dto);

    expect(serialized).not.toContain('RAW_CAPI_TOKEN_SECRET');
    expect(serialized).not.toContain('RAW_WABA_TOKEN_SECRET');
    expect(serialized).not.toContain('RAW_PAYMENT_SECRET');
    expect(serialized).not.toContain('RAW_BUTTON_SECRET');
    expect(serialized).not.toContain('RAW_MICROSITE_SECRET');
    expect((dto as any).capi_token).toBeNull();
    expect((dto as any).waba_access_token).toBeNull();
  });

  it('P0-C.3 projectSafeRscTenantDto for CS role must NOT contain any raw secret values', () => {
    const dto = projectSafeRscTenantDto(mockTenantRow, 'CS');
    const serialized = JSON.stringify(dto);

    expect(serialized).not.toContain('RAW_CAPI_TOKEN_SECRET');
    expect(serialized).not.toContain('RAW_WABA_TOKEN_SECRET');
    expect(serialized).not.toContain('RAW_BUTTON_SECRET');
    expect(dto.capi_token).toBeNull();
    expect(dto.has_capi_token).toBe(true);
  });

  it('P0-C.4 Nested canary test: microsite internal secret and button secrets stripped', () => {
    const dto = projectSafeRscTenantDto(mockTenantRow, 'OWNER');
    expect(dto.microsite.title).toBe('Canary Microsite');
    expect(dto.microsite.subtitle).toBe('Public subtitle');
    expect(dto.microsite.buttons[0].label).toBe('WhatsApp');
    expect(dto.microsite.buttons[0].url).toBe('https://wa.me/6281234');
    expect(dto.microsite.buttons[0].secret_key).toBeUndefined();
    expect((dto.microsite as any).internal_secret).toBeUndefined();
  });

  it('P0-C.5 Actual Server Component render test: TenantFinancePage and TenantInboxPage props contain ZERO secrets', async () => {
    const authModule = require('@/lib/auth/merchant-session');
    const authSpy = jest.spyOn(authModule, 'authorizeServerComponentTenant')
      .mockResolvedValue({
        authorized: true,
        role: 'OWNER',
        tenantRow: mockTenantRow,
      });

    try {
      const TenantFinancePage = (await import('@/app/[tenant]/dashboard/finance/page')).default;
      const TenantInboxPage = (await import('@/app/[tenant]/dashboard/inbox/page')).default;

      const financeElement = await TenantFinancePage({ params: Promise.resolve({ tenant: 'rsc-canary-tenant' }) });
      const serializedFinance = JSON.stringify(financeElement.props);

      expect(serializedFinance).not.toContain('RAW_CAPI_TOKEN_SECRET');
      expect(serializedFinance).not.toContain('RAW_WABA_TOKEN_SECRET');
      expect(serializedFinance).not.toContain('RAW_PAYMENT_SECRET');
      expect(serializedFinance).not.toContain('RAW_BUTTON_SECRET');
      expect(serializedFinance).not.toContain('RAW_LINCAH_API_KEY');
      expect(financeElement.props.initialTenant.has_capi_token).toBe(true);

      const inboxElement = await TenantInboxPage({ params: Promise.resolve({ tenant: 'rsc-canary-tenant' }) });
      const serializedInbox = JSON.stringify(inboxElement.props);

      expect(serializedInbox).not.toContain('RAW_CAPI_TOKEN_SECRET');
      expect(serializedInbox).not.toContain('RAW_WABA_TOKEN_SECRET');
      expect(serializedInbox).not.toContain('RAW_PAYMENT_SECRET');
      expect(serializedInbox).not.toContain('RAW_BUTTON_SECRET');
      expect(serializedInbox).not.toContain('RAW_LINCAH_API_KEY');
      expect(inboxElement.props.initialTenant.has_capi_token).toBe(true);
    } finally {
      authSpy.mockRestore();
    }
  });
});
