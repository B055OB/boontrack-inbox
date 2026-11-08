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
} from '@/app/api/v1/tenants/[slug]/settings/route';

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
    pgClient = new Client({ connectionString: getDatabaseConnectionString() });
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
});
