/**
 * __tests__/workforce/public-route-exposure.test.ts
 * BWM Gate 1 Round 3H: Public Next.js Route Exposure & Hostile Sentinel Allowlist Verification
 *
 * Directives (CTO Official Mandate Round 3H — Blockers A, B, C):
 * 1. Strict Storefront Opt-In Boundary:
 *    - Unauthenticated request for private enterprise tenant (public_storefront_enabled = false)
 *      returns empty products array / 404 without leaking private metadata.
 *    - Unpublished products (is_publicly_published = false) are never returned in public routes.
 * 2. Hostile Sentinel Testing on Actual Next.js Route:
 *    - Injects intentionally sensitive sentinels at: top-level, metadata, fulfillment_metadata,
 *      single_page_config, asset_reference, and nested objects.
 *    - Invokes real Next.js GET /api/v1/tenants/[slug]/products route.
 *    - Asserts that stringified response contains ZERO sentinels (100% allowlist projection).
 * 3. Authorized Merchant Distinction:
 *    - Verified merchant session can legitimately retrieve operational products.
 */

jest.unmock('@/lib/supabaseClient');
jest.unmock('@supabase/supabase-js');

import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { assertStagingDatabaseTarget } from '@/lib/supabaseClient';
import { NextRequest } from 'next/server';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';
import { GET as getProducts } from '@/app/api/v1/tenants/[slug]/products/route';
import { GET as getProductById } from '@/app/api/v1/tenants/[slug]/products/[id]/route';

function getDatabaseConnectionString(): string {
  let directUrl = process.env.WORKFORCE_DATABASE_DIRECT_URL;
  let poolerUrl = process.env.WORKFORCE_DATABASE_URL;

  if (!directUrl || !poolerUrl) {
    try {
      const envPath = path.resolve('.env.local');
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
    throw new Error('STAGING_DB_REQUIRED: Staging connection required for route exposure tests');
  }
  assertStagingDatabaseTarget(connStr);
  return connStr;
}

describe('BWM Gate 1 Round 3H — Public Next.js Route Exposure & Hostile Sentinel Verification', () => {
  let pgClient: Client;
  const timestamp = Date.now();

  const PUBLIC_TENANT_SLUG = `pub-tenant-${timestamp}`;
  const PRIVATE_TENANT_SLUG = `priv-tenant-${timestamp}`;

  const PUBLISHED_PROD_SLUG = `pub-prod-${timestamp}`;
  const UNPUBLISHED_PROD_SLUG = `unpub-prod-${timestamp}`;

  let publicTenantId: string;
  let privateTenantId: string;
  let publishedProdId: string;
  let unpublishedProdId: string;

  // Sentinels to test allowlist filtering
  const SENTINELS = {
    topLevelSecret: 'SENTINEL_LEAK_TOP_LEVEL_SECRET_987',
    dbUrl: 'SENTINEL_LEAK_PG_CONN_STRING_654',
    wabaToken: 'SENTINEL_LEAK_WABA_TOKEN_ABC',
    bankAccount: 'SENTINEL_LEAK_BANK_ACCOUNT_XYZ',
    accessUrl: 'SENTINEL_LEAK_ACCESS_URL_HTTP_PRIVATE',
    licenseKey: 'SENTINEL_LEAK_LICENSE_KEY_9999',
    adminNotes: 'SENTINEL_LEAK_ADMIN_NOTES_CONFIDENTIAL',
    webhookSecret: 'SENTINEL_LEAK_WEBHOOK_SECRET_KEY',
    assetReference: 'SENTINEL_LEAK_INTERNAL_S3_PATH',
    debugBypass: 'SENTINEL_LEAK_DEBUG_BYPASS_FLAG',
  };

  beforeAll(async () => {
    pgClient = new Client({ connectionString: getDatabaseConnectionString() });
    await pgClient.connect();
    await pgClient.query('SET search_path TO workforce_staging, public');

    // 1. Seed Public Opt-In Tenant (public_storefront_enabled = TRUE)
    const pubTenantRes = await pgClient.query(`
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, is_active, public_storefront_enabled,
        phone, whatsapp_number, waba_phone_number_id, metadata
      ) VALUES (
        $1, 'Public Retail Storefront', 'service', 'PRO_SCALE', 'active', true, true,
        '+6281234567', '+6281234567', 'waba_secret_token_123',
        $2::jsonb
      ) RETURNING id
    `, [
      PUBLIC_TENANT_SLUG,
      JSON.stringify({
        waba_secret: SENTINELS.wabaToken,
        bank_account: SENTINELS.bankAccount,
        internal_payment_config: { provider: 'secret_gateway', key: 'priv_key_123' },
      }),
    ]);
    publicTenantId = pubTenantRes.rows[0].id;

    // 2. Seed Private Enterprise Tenant (public_storefront_enabled = FALSE)
    const privTenantRes = await pgClient.query(`
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, is_active, public_storefront_enabled,
        phone, whatsapp_number, waba_phone_number_id, metadata
      ) VALUES (
        $1, 'Private Enterprise Corp', 'service', 'ENTERPRISE', 'active', true, false,
        '+6289999999', '+6289999999', 'waba_secret_token_priv',
        '{"enterprise_api_token": "ent_secret_xyz"}'::jsonb
      ) RETURNING id
    `, [PRIVATE_TENANT_SLUG]);
    privateTenantId = privTenantRes.rows[0].id;

    // 3. Seed Published Product on Public Tenant with Hostile Sentinels
    const pubProdRes = await pgClient.query(`
      INSERT INTO workforce_staging.products (
        tenant_id, title, name, slug, price, promo_price, category, product_type,
        stock, is_unlimited_stock, is_active, status, is_publicly_published,
        fulfillment_metadata, asset_reference, license_status
      ) VALUES (
        $1, 'Published Product With Sentinels', 'Published Product With Sentinels', $2,
        350000, 300000, 'service', 'SERVICE', 50, true, true, 'ACTIVE', true,
        $3::jsonb, $4, $5
      ) RETURNING id
    `, [
      publicTenantId,
      PUBLISHED_PROD_SLUG,
      JSON.stringify({
        access_url: SENTINELS.accessUrl,
        license_key: SENTINELS.licenseKey,
        single_page_config: {
          admin_notes: SENTINELS.adminNotes,
          webhook_secret: SENTINELS.webhookSecret,
        },
        custom_flags: { debug: SENTINELS.debugBypass },
        db_conn: SENTINELS.dbUrl,
      }),
      SENTINELS.assetReference,
      SENTINELS.topLevelSecret,
    ]);
    publishedProdId = pubProdRes.rows[0].id;

    // 4. Seed Unpublished Product on Public Tenant
    const unpubProdRes = await pgClient.query(`
      INSERT INTO workforce_staging.products (
        tenant_id, title, name, slug, price, stock, is_active, status, is_publicly_published
      ) VALUES (
        $1, 'Unpublished Internal Product', 'Unpublished Internal Product', $2,
        990000, 10, true, 'ACTIVE', false
      ) RETURNING id
    `, [publicTenantId, UNPUBLISHED_PROD_SLUG]);
    unpublishedProdId = unpubProdRes.rows[0].id;
  }, 30000);

  afterAll(async () => {
    let pCount = 0;
    let tCount = 0;
    if (pgClient) {
      try {
        const pDel = await pgClient.query(
          'DELETE FROM workforce_staging.products WHERE tenant_id = $1 OR tenant_id = $2',
          [publicTenantId, privateTenantId]
        );
        pCount = pDel.rowCount ?? 0;

        const tDel = await pgClient.query(
          'DELETE FROM workforce_staging.tenants WHERE id = $1 OR id = $2',
          [publicTenantId, privateTenantId]
        );
        tCount = tDel.rowCount ?? 0;

        // Verify zero remaining fixtures
        const pCheck = await pgClient.query(
          'SELECT COUNT(*)::int AS count FROM workforce_staging.products WHERE tenant_id = $1 OR tenant_id = $2',
          [publicTenantId, privateTenantId]
        );
        expect(pCheck.rows[0].count).toBe(0);

        const tCheck = await pgClient.query(
          'SELECT COUNT(*)::int AS count FROM workforce_staging.tenants WHERE id = $1 OR id = $2',
          [publicTenantId, privateTenantId]
        );
        expect(tCheck.rows[0].count).toBe(0);
      } finally {
        await pgClient.end();
      }
    }

    console.log('[Route Exposure Cleanup Verified] Fixtures Removed:', {
      productsRemoved: pCount,
      tenantsRemoved: tCount,
    });
  }, 30000);

  test('1. Private Enterprise Tenant Fails Closed: Public route returns empty catalog', async () => {
    // Unauthenticated GET /api/v1/tenants/[private_slug]/products
    const req = new NextRequest(`https://shop.boontrack.com/api/v1/tenants/${PRIVATE_TENANT_SLUG}/products`, {
      method: 'GET',
    });

    const res = await getProducts(req, {
      params: Promise.resolve({ slug: PRIVATE_TENANT_SLUG }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    // Private enterprise tenant products MUST NOT be exposed
    expect(json.products).toEqual([]);
  });

  test('2. Public Route Returns Strictly Published Products on Opted-In Tenant', async () => {
    const req = new NextRequest(`https://shop.boontrack.com/api/v1/tenants/${PUBLIC_TENANT_SLUG}/products`, {
      method: 'GET',
    });

    const res = await getProducts(req, {
      params: Promise.resolve({ slug: PUBLIC_TENANT_SLUG }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.products)).toBe(true);
    expect(json.products.length).toBe(1);

    // Published product is present
    expect(json.products[0].slug).toBe(PUBLISHED_PROD_SLUG);
    expect(json.products[0].price).toBe(350000);

    // Unpublished product is NOT present
    const unpub = json.products.find((p: any) => p.slug === UNPUBLISHED_PROD_SLUG);
    expect(unpub).toBeUndefined();
  });

  test('3. Hostile Sentinel Verification: Public JSON response contains ZERO sensitive sentinels', async () => {
    const req = new NextRequest(`https://shop.boontrack.com/api/v1/tenants/${PUBLIC_TENANT_SLUG}/products`, {
      method: 'GET',
    });

    const res = await getProducts(req, {
      params: Promise.resolve({ slug: PUBLIC_TENANT_SLUG }),
    });

    const rawJsonString = await res.text();

    // STRICT ALLOWLIST ENFORCEMENT: Assert zero sentinels appear anywhere in response text
    for (const [name, sentinel] of Object.entries(SENTINELS)) {
      expect(rawJsonString).not.toContain(sentinel);
    }

    const json = JSON.parse(rawJsonString);
    const product = json.products[0];

    // Assert that returned product properties are strictly allowlisted
    const allowedKeys = new Set([
      'id', 'name', 'title', 'slug', 'category', 'product_type',
      'price', 'promo_price', 'description', 'image', 'image_url',
      'is_unlimited', 'is_active', 'status',
    ]);

    for (const key of Object.keys(product)) {
      expect(allowedKeys.has(key)).toBe(true);
    }

    // Verify forbidden properties are undefined
    expect(product.metadata).toBeUndefined();
    expect(product.fulfillment_metadata).toBeUndefined();
    expect(product.single_page_config).toBeUndefined();
    expect(product.asset_reference).toBeUndefined();
    expect(product.download_url).toBeUndefined();
    expect(product.link_digital).toBeUndefined();
  });

  test('4. Public Route Single Product [id] Fails Closed on Private Tenant and Unpublished Items', async () => {
    // Attempt to access product on private tenant via public route -> 404
    const privReq = new NextRequest(`https://shop.boontrack.com/api/v1/tenants/${PRIVATE_TENANT_SLUG}/products/${publishedProdId}`, {
      method: 'GET',
    });
    const privRes = await getProductById(privReq, {
      params: Promise.resolve({ slug: PRIVATE_TENANT_SLUG, id: publishedProdId }),
    });
    expect(privRes.status).toBe(404);

    // Attempt to access unpublished product on public tenant via public route -> 404
    const unpubReq = new NextRequest(`https://shop.boontrack.com/api/v1/tenants/${PUBLIC_TENANT_SLUG}/products/${unpublishedProdId}`, {
      method: 'GET',
    });
    const unpubRes = await getProductById(unpubReq, {
      params: Promise.resolve({ slug: PUBLIC_TENANT_SLUG, id: unpublishedProdId }),
    });
    expect(unpubRes.status).toBe(404);

    // Access published product on public tenant -> 200 with allowlisted fields
    const pubReq = new NextRequest(`https://shop.boontrack.com/api/v1/tenants/${PUBLIC_TENANT_SLUG}/products/${publishedProdId}`, {
      method: 'GET',
    });
    const pubRes = await getProductById(pubReq, {
      params: Promise.resolve({ slug: PUBLIC_TENANT_SLUG, id: publishedProdId }),
    });
    expect(pubRes.status).toBe(200);
    const pubJson = await pubRes.json();
    expect(pubJson.success).toBe(true);
    expect(pubJson.product.slug).toBe(PUBLISHED_PROD_SLUG);
    expect(pubJson.product.fulfillment_metadata).toBeUndefined();
    expect(pubJson.product.metadata).toBeUndefined();
  });

  test('5. Private Authorized Merchant Request Retains Legitimate Operational Access', async () => {
    const token = signMerchantSessionToken({
      tenantId: publicTenantId,
      tenantSlug: PUBLIC_TENANT_SLUG,
      role: 'MERCHANT',
    });

    const authReq = new NextRequest(`https://shop.boontrack.com/api/v1/tenants/${PUBLIC_TENANT_SLUG}/products`, {
      method: 'GET',
      headers: {
        'x-merchant-token': token,
        'authorization': `Bearer ${token}`,
      },
    });

    const res = await getProducts(authReq, {
      params: Promise.resolve({ slug: PUBLIC_TENANT_SLUG }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    // Authorized merchant sees both published AND unpublished products
    expect(json.products.length).toBe(2);

    const foundUnpub = json.products.find((p: any) => p.slug === UNPUBLISHED_PROD_SLUG);
    expect(foundUnpub).toBeDefined();

    const foundPub = json.products.find((p: any) => p.slug === PUBLISHED_PROD_SLUG);
    expect(foundPub).toBeDefined();
    // Authorized merchant retains operational fulfillment metadata
    expect(foundPub.fulfillment_metadata).toBeDefined();
  });
});
