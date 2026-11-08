/**
 * __tests__/workforce/public-tenant-dto-and-ingress.test.ts
 * BWM Gate 1 Round 3T.1: Public Tenant API Hardened DTO & Ingress Boundary Verification
 *
 * Directives (CTO Official Mandate Round 3T.1 — Phase 1):
 * 1. P0 Public API Secret Elimination:
 *    - Injects sensitive canary secrets into tenant metadata & column records:
 *      (capi_token, waba_access_token, admin_secret, private_bank_credential, gateway keys).
 *    - Invokes Next.js GET /api/v1/tenants/[slug] and GET /api/v1/tenants/[id] (UUID).
 *    - Asserts that stringified response contains ZERO canaries or secret fields.
 * 2. Inactive & Private Enterprise Tenant Rejection:
 *    - Public request for private enterprise tenant (public_storefront_enabled = false) returns 404.
 *    - Public request for inactive tenant (status != 'active' or is_active = false) returns 404.
 *    - Missing tenant returns 404 (Fail-closed).
 * 3. Storefront & Checkout Contract Parity:
 *    - Active public tenant returns allowlisted branding, theme, business hours, catalog preferences,
 *      microsite buttons, and public payment presentation (QRIS image, public bank accounts).
 * 4. Constructive Metadata Sanitizer Unit Isolation:
 *    - Verifies sanitizePublicTenantMetadata() strictly drops any unknown or sensitive keys.
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

import { Client } from 'pg';
import { NextRequest } from 'next/server';
import { GET as getTenantBySlug } from '@/app/api/v1/tenants/[slug]/route';
import { sanitizePublicTenantMetadata } from '@/lib/product-catalog';

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
    throw new Error('STAGING_DB_REQUIRED: Staging connection required for public tenant DTO tests');
  }
  return connStr;
}

describe('BWM Gate 1 Round 3T.1 — Public Tenant API Hardened DTO & Ingress Boundary Verification', () => {
  let pgClient: Client;
  const timestamp = Date.now();

  const PUBLIC_TENANT_SLUG = `pub-dto-${timestamp}`;
  const PRIVATE_TENANT_SLUG = `priv-dto-${timestamp}`;
  const INACTIVE_TENANT_SLUG = `inact-dto-${timestamp}`;

  let publicTenantId: string;
  let privateTenantId: string;
  let inactiveTenantId: string;

  // Sensitive canaries to verify zero exposure
  const CANARIES = {
    capiToken: `CANARY_CAPI_TOKEN_${timestamp}_SECRET`,
    wabaAccessToken: `CANARY_WABA_ACCESS_TOKEN_${timestamp}_SECRET`,
    wabaAppSecret: `CANARY_WABA_APP_SECRET_${timestamp}_SECRET`,
    adminSecret: `CANARY_ADMIN_SECRET_${timestamp}_SECRET`,
    privateBankCredential: `CANARY_BANK_CREDENTIAL_${timestamp}_SECRET`,
    dodoApiKey: `CANARY_DODO_KEY_${timestamp}_SECRET`,
    tripayApiKey: `CANARY_TRIPAY_KEY_${timestamp}_SECRET`,
    midtransServerKey: `CANARY_MIDTRANS_KEY_${timestamp}_SECRET`,
    webhookSecret: `CANARY_WEBHOOK_SECRET_${timestamp}_SECRET`,
    wabaPhoneId: `CANARY_WABA_PHONE_ID_${timestamp}_SECRET`,
  };

  beforeAll(async () => {
    pgClient = new Client({ connectionString: getDatabaseConnectionString() });
    await pgClient.connect();
    await pgClient.query('SET search_path TO workforce_staging, public');

    // 1. Seed Active Public Tenant (Opted-in: public_storefront_enabled = TRUE)
    const pubRes = await pgClient.query(`
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, is_active, public_storefront_enabled,
        waba_phone_number_id, metadata
      ) VALUES (
        $1, 'Berkah Digital Store', 'retail', 'PRO_SCALE', 'active', true, true,
        $2, $3::jsonb
      ) RETURNING id
    `, [
      PUBLIC_TENANT_SLUG,
      CANARIES.wabaPhoneId,
      JSON.stringify({
        store_name: 'Berkah Digital Storefront',
        display_name: 'Berkah Digital',
        tagline: 'Belanja Cepat & Aman',
        description: 'Toko resmi produk digital dan jasa profesional.',
        logo_url: 'https://assets.boontrack.com/logos/berkah.png',
        capi_token: CANARIES.capiToken,
        waba_access_token: CANARIES.wabaAccessToken,
        waba_config: { app_secret: CANARIES.wabaAppSecret },
        admin_secret: CANARIES.adminSecret,
        private_bank_credential: CANARIES.privateBankCredential,
        dodo_api_key: CANARIES.dodoApiKey,
        tripay_api_key: CANARIES.tripayApiKey,
        midtrans_server_key: CANARIES.midtransServerKey,
        webhook_secret: CANARIES.webhookSecret,
        theme: {
          template: 'modern',
          primary_color: '#10b981',
          chat_enabled: true,
          nested_secret: 'SHOULD_NOT_LEAK',
        },
        faqs: [
          { id: 'faq-1', question: 'Apakah ini produk resmi?', answer: 'Ya, 100% bergaransi resmi.' },
        ],
        business_hours: {
          timezone: 'Asia/Jakarta',
          is_always_open: true,
        },
        catalog_preferences: {
          show_prices: true,
          items_per_page: 20,
        },
        public_links: [
          { title: 'Instagram', url: 'https://instagram.com/berkahdigital', platform: 'instagram' },
        ],
        pixel_config: {
          meta_pixel_id: '112233445566',
          tiktok_pixel_id: 'TT-77889900',
          capi_token: CANARIES.capiToken,
        },
        qris_image_url: 'https://assets.boontrack.com/qris/berkah.png',
        bank_accounts: [
          { bank_name: 'BCA', account_number: '8877665544', account_holder: 'PT Berkah Digital' },
        ],
        products: [
          {
            id: 'prod-1',
            title: 'Paket Usaha Digital',
            price: 150000,
            is_active: true,
            status: 'ACTIVE',
            download_url: 'https://private-s3.bucket/download/secret.zip',
          },
        ],
      }),
    ]);
    publicTenantId = pubRes.rows[0].id;

    // 2. Seed Private Enterprise Tenant (Default-Deny: public_storefront_enabled = FALSE)
    const privRes = await pgClient.query(`
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, is_active, public_storefront_enabled,
        metadata
      ) VALUES (
        $1, 'Private Enterprise Corp', 'enterprise', 'ENTERPRISE', 'active', true, false,
        $2::jsonb
      ) RETURNING id
    `, [
      PRIVATE_TENANT_SLUG,
      JSON.stringify({
        store_name: 'Private Corp',
        admin_secret: CANARIES.adminSecret,
      }),
    ]);
    privateTenantId = privRes.rows[0].id;

    // 3. Seed Inactive Tenant (status = 'inactive')
    const inactRes = await pgClient.query(`
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, is_active, public_storefront_enabled,
        metadata
      ) VALUES (
        $1, 'Suspended Merchant', 'retail', 'STARTER', 'inactive', false, true,
        $2::jsonb
      ) RETURNING id
    `, [
      INACTIVE_TENANT_SLUG,
      JSON.stringify({
        store_name: 'Suspended Merchant',
      }),
    ]);
    inactiveTenantId = inactRes.rows[0].id;
  });

  afterAll(async () => {
    if (pgClient) {
      await pgClient.query('DELETE FROM workforce_staging.tenants WHERE id = ANY($1)', [
        [publicTenantId, privateTenantId, inactiveTenantId].filter(Boolean),
      ]);
      await pgClient.end();
    }
  });

  // =========================================================================
  // 1. P0 PUBLIC API SECRET ELIMINATION & ZERO CANARY LEAKAGE
  // =========================================================================
  describe('1. P0 Public API Secret Elimination & Zero Canary Leakage', () => {
    it('1.1 GET /api/v1/tenants/[slug] returns 200 with ZERO sensitive canaries anywhere in body', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${PUBLIC_TENANT_SLUG}`);
      const res = await getTenantBySlug(req, { params: Promise.resolve({ slug: PUBLIC_TENANT_SLUG }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.tenant).toBeDefined();

      const serialized = JSON.stringify(json);

      // Assert complete absence of any sensitive canary
      expect(serialized).not.toContain(CANARIES.capiToken);
      expect(serialized).not.toContain(CANARIES.wabaAccessToken);
      expect(serialized).not.toContain(CANARIES.wabaAppSecret);
      expect(serialized).not.toContain(CANARIES.adminSecret);
      expect(serialized).not.toContain(CANARIES.privateBankCredential);
      expect(serialized).not.toContain(CANARIES.dodoApiKey);
      expect(serialized).not.toContain(CANARIES.tripayApiKey);
      expect(serialized).not.toContain(CANARIES.midtransServerKey);
      expect(serialized).not.toContain(CANARIES.webhookSecret);
      expect(serialized).not.toContain(CANARIES.wabaPhoneId);
      expect(serialized).not.toContain('SHOULD_NOT_LEAK');
      expect(serialized).not.toContain('https://private-s3.bucket/download/secret.zip');
    });

    it('1.2 GET /api/v1/tenants/[id] (UUID lookup) returns 200 with ZERO canaries', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${publicTenantId}`);
      const res = await getTenantBySlug(req, { params: Promise.resolve({ slug: publicTenantId }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.tenant.id).toBe(publicTenantId);

      const serialized = JSON.stringify(json);
      expect(serialized).not.toContain(CANARIES.capiToken);
      expect(serialized).not.toContain(CANARIES.wabaAccessToken);
      expect(serialized).not.toContain(CANARIES.adminSecret);
      expect(serialized).not.toContain(CANARIES.wabaPhoneId);
    });

    it('1.3 Confirms expected public fields and payment presentation are preserved', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${PUBLIC_TENANT_SLUG}`);
      const res = await getTenantBySlug(req, { params: Promise.resolve({ slug: PUBLIC_TENANT_SLUG }) });

      const json = await res.json();
      const tenant = json.tenant;

      // Identity & Branding
      expect(tenant.slug).toBe(PUBLIC_TENANT_SLUG);
      expect(tenant.name).toBe('Berkah Digital Store');
      expect(tenant.store_name).toBe('Berkah Digital Storefront');
      expect(tenant.tagline).toBe('Belanja Cepat & Aman');
      expect(tenant.logo_url).toBe('https://assets.boontrack.com/logos/berkah.png');

      // Theme
      expect(tenant.theme.template).toBe('modern');
      expect(tenant.theme.primary_color).toBe('#10b981');
      expect(tenant.theme.chat_enabled).toBe(true);

      // FAQs
      expect(Array.isArray(tenant.faqs)).toBe(true);
      expect(tenant.faqs[0].question).toBe('Apakah ini produk resmi?');

      // Business Hours & Catalog
      expect(tenant.business_hours.is_always_open).toBe(true);
      expect(tenant.catalog_preferences.show_prices).toBe(true);

      // Public Links
      expect(Array.isArray(tenant.public_links)).toBe(true);
      expect(tenant.public_links[0].platform).toBe('instagram');

      // Pixel Config (Public IDs only, no capi_token)
      expect(tenant.metadata.pixel_config.meta_pixel_id).toBe('112233445566');
      expect(tenant.metadata.pixel_config.tiktok_pixel_id).toBe('TT-77889900');
      expect(tenant.metadata.pixel_config.capi_token).toBeUndefined();

      // Payment Presentation
      expect(tenant.payment_methods.qris_image_url).toBe('https://assets.boontrack.com/qris/berkah.png');
      expect(Array.isArray(tenant.payment_methods.bank_accounts)).toBe(true);
      expect(tenant.payment_methods.bank_accounts[0].bank_name).toBe('BCA');
      expect(tenant.payment_methods.bank_accounts[0].account_number).toBe('8877665544');

      // Products (Sanitized allowlist)
      expect(tenant.metadata.products[0].download_url).toBeUndefined();
    });
  });

  // =========================================================================
  // 2. INACTIVE & PRIVATE ENTERPRISE TENANT REJECTION (HTTP 404)
  // =========================================================================
  describe('2. Inactive & Private Enterprise Tenant Rejection (HTTP 404)', () => {
    it('2.1 Rejects private enterprise tenant (public_storefront_enabled = false) with 404', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${PRIVATE_TENANT_SLUG}`);
      const res = await getTenantBySlug(req, { params: Promise.resolve({ slug: PRIVATE_TENANT_SLUG }) });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('TENANT_NOT_FOUND');
    });

    it('2.2 Rejects inactive tenant (status = "inactive") with 404', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${INACTIVE_TENANT_SLUG}`);
      const res = await getTenantBySlug(req, { params: Promise.resolve({ slug: INACTIVE_TENANT_SLUG }) });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('TENANT_NOT_FOUND');
    });

    it('2.3 Rejects non-existent tenant slug with 404', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/tenants/ghost-tenant-does-not-exist');
      const res = await getTenantBySlug(req, { params: Promise.resolve({ slug: 'ghost-tenant-does-not-exist' }) });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('TENANT_NOT_FOUND');
    });
  });

  // =========================================================================
  // 3. CONSTRUCTIVE METADATA SANITIZER UNIT ISOLATION
  // =========================================================================
  describe('3. Constructive Metadata Sanitizer Unit Isolation', () => {
    it('3.1 Drops arbitrary unknown, nested, and hostile keys', () => {
      const hostileInput = {
        store_name: 'Legit Store',
        tagline: 'Best Prices',
        __proto__: { polluted: true },
        unknown_secret: 'EVIL_SECRET',
        waba_config: { access_token: 'SECRET_TOKEN' },
        biteship_token: 'SECRET_BITESHIP',
        payment_gateway_secrets: { secret: 'SECRET_GW' },
        raw_sql_injected: 'DROP TABLE tenants;',
      };

      const sanitized = sanitizePublicTenantMetadata(hostileInput);

      expect(sanitized.store_name).toBe('Legit Store');
      expect(sanitized.tagline).toBe('Best Prices');
      expect((sanitized as any).unknown_secret).toBeUndefined();
      expect((sanitized as any).waba_config).toBeUndefined();
      expect((sanitized as any).biteship_token).toBeUndefined();
      expect((sanitized as any).payment_gateway_secrets).toBeUndefined();
      expect((sanitized as any).raw_sql_injected).toBeUndefined();
      expect(JSON.stringify(sanitized)).not.toContain('EVIL_SECRET');
      expect(JSON.stringify(sanitized)).not.toContain('SECRET_TOKEN');
    });

    it('3.2 Safely handles null, undefined, primitive, or array input without throwing', () => {
      expect(sanitizePublicTenantMetadata(null)).toEqual({});
      expect(sanitizePublicTenantMetadata(undefined)).toEqual({});
      expect(sanitizePublicTenantMetadata('some-string' as any)).toEqual({});
      expect(sanitizePublicTenantMetadata(12345 as any)).toEqual({});
      expect(sanitizePublicTenantMetadata([1, 2, 3] as any)).toEqual({});
    });
  });
});
