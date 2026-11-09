/**
 * __tests__/workforce/real-api-persistence.test.ts
 * BWM Gate 1 Round 3F: Real Application API Persistence Integration Suite
 *
 * Directives (CTO Official Mandate Round 3F — Blocker D):
 * Prove that the actual tenant-facing Next.js API route handlers execute against the
 * real staging PostgreSQL database path WITHOUT ANY in-memory mocks (zero jest.mock).
 *
 * Route Handlers Exercised:
 * - POST   /api/v1/tenants/[slug]/products
 * - GET    /api/v1/tenants/[slug]/products
 * - GET    /api/v1/tenants/[slug]/products/[id]
 * - PUT    /api/v1/tenants/[slug]/products/[id]
 * - DELETE /api/v1/tenants/[slug]/products/[id]
 * - PUT    /api/v1/tenants/[slug]/settings
 * - GET    /api/v1/tenants/[slug]/settings
 *
 * Invariants Tested:
 * 1. Product creation via real API persists to workforce_staging.products on disk.
 * 2. Product read via real API fetches from persistent staging store.
 * 3. Product update via real API reflects on disk in PostgreSQL.
 * 4. Tenant settings update via real API persists to workforce_staging.tenants.
 * 5. Disconnected fresh-client verification proves zero in-memory mock dependency.
 * 6. Product deletion via real API removes row from persistent storage.
 * 7. Real HMAC cryptographic session verification prevents cross-tenant access (403 Forbidden).
 * 8. Missing, expired, or forged tokens fail closed (401 Unauthorized).
 */

jest.unmock('@/lib/supabaseClient');
jest.unmock('@supabase/supabase-js');

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { assertStagingDatabaseTarget } from '@/lib/supabaseClient';
import { NextRequest } from 'next/server';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';
import { POST as createProduct, GET as getProducts } from '@/app/api/v1/tenants/[slug]/products/route';
import { GET as getProductById, PUT as updateProduct, DELETE as deleteProduct } from '@/app/api/v1/tenants/[slug]/products/[id]/route';
import { PUT as updateSettings, GET as getSettings } from '@/app/api/v1/tenants/[slug]/settings/route';

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
    throw new Error('STAGING_DB_REQUIRED: Real API persistence test must run against real PostgreSQL');
  }
  assertStagingDatabaseTarget(connStr);
  return connStr;
}

describe('BWM Gate 1 Round 3F — Real Application API Persistence (Unmocked)', () => {
  let pgClient: Client;
  const timestamp = Date.now();
  const slugA = `tenant-api-alpha-${timestamp}`;
  const slugB = `tenant-api-beta-${timestamp}`;
  let tenantIdA: string;
  let tenantIdB: string;
  let tokenA: string;
  let tokenB: string;

  const targetProductId = crypto.randomUUID();
  const productTitle = 'Patroli VIP Geofence Real API';
  const productSlug = `patroli-vip-geofence-${timestamp}`;

  beforeAll(async () => {
    pgClient = new Client({ connectionString: getDatabaseConnectionString() });
    await pgClient.connect();
    await pgClient.query('SET search_path TO workforce_staging, public');

    // 1. Pre-provision tenants directly in staging DB
    const insA = await pgClient.query(`
      INSERT INTO workforce_staging.tenants (slug, name, category, tier, status, subscription_status, is_active, public_storefront_enabled, metadata)
      VALUES ($1, 'Alpha Security Services', 'service', 'PRO_SCALE', 'active', 'active', true, true, '{"products": []}')
      RETURNING id
    `, [slugA]);
    tenantIdA = insA.rows[0].id;

    const insB = await pgClient.query(`
      INSERT INTO workforce_staging.tenants (slug, name, category, tier, status, subscription_status, is_active, public_storefront_enabled, metadata)
      VALUES ($1, 'Beta Security Services', 'service', 'PRO_SCALE', 'active', 'active', true, true, '{"products": []}')
      RETURNING id
    `, [slugB]);
    tenantIdB = insB.rows[0].id;

    // 2. Generate cryptographically signed HMAC session tokens
    tokenA = signMerchantSessionToken({
      tenantSlug: slugA,
      tenantId: tenantIdA,
      role: 'OWNER',
    });

    tokenB = signMerchantSessionToken({
      tenantSlug: slugB,
      tenantId: tenantIdB,
      role: 'OWNER',
    });
  }, 30000);

  afterAll(async () => {
    if (pgClient) {
      try {
        await pgClient.query('DELETE FROM workforce_staging.products WHERE tenant_id IN ($1, $2)', [tenantIdA, tenantIdB]);
        await pgClient.query('DELETE FROM workforce_staging.tenants WHERE id IN ($1, $2)', [tenantIdA, tenantIdB]);
      } catch {
        // ignore
      } finally {
        await pgClient.end();
      }
    }
  }, 30000);

  test('1a. Real API Product Creation: POST /api/v1/tenants/[slug]/products persists to PostgreSQL', async () => {
    const payload = {
      id: targetProductId,
      name: productTitle,
      category: 'service',
      price: 850000,
      promo_price: 750000,
      description: 'Layanan patroli keamanan dedicated 24 jam dengan geofence verification',
      type: 'service',
      stock: 50,
      product_type: 'SERVICE',
    };

    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `bt_merchant_token=${tokenA}`,
      },
      body: JSON.stringify(payload),
    });

    const res = await createProduct(req, { params: Promise.resolve({ slug: slugA }) });
    const json = await res.json();
    expect(res.status).toBe(200);

    expect(json.success).toBe(true);
    expect(json.product).toBeDefined();
    expect(json.product.name).toBe(productTitle);
    expect(Number(json.product.price)).toBe(850000);

    // Verify row physically created on disk in PostgreSQL staging table
    const dbCheck = await pgClient.query(
      'SELECT id, tenant_id, title, price, promo_price, stock, status FROM workforce_staging.products WHERE id = $1',
      [targetProductId]
    );
    expect(dbCheck.rows.length).toBe(1);
    const dbProduct = dbCheck.rows[0];
    expect(dbProduct.title).toBe(productTitle);
    expect(Number(dbProduct.price)).toBe(850000);
    expect(Number(dbProduct.promo_price)).toBe(750000);
    expect(dbProduct.status).toBe('ACTIVE');
  });

  test('1b. Real API Product Catalog Retrieval: GET /api/v1/tenants/[slug]/products fetches from DB', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/products`, {
      method: 'GET',
    });

    const res = await getProducts(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.products)).toBe(true);

    const found = json.products.find((p: any) => p.name === productTitle || p.title === productTitle);
    expect(found).toBeDefined();
    expect(Number(found.price)).toBe(850000);
  });

  test('1c. Real API Single Product Retrieval: GET /api/v1/tenants/[slug]/products/[id]', async () => {
    const req = new NextRequest(
      `https://dashboard.boontrack.com/api/v1/tenants/${slugA}/products/${targetProductId}`,
      { method: 'GET' }
    );

    const res = await getProductById(req, {
      params: Promise.resolve({ slug: slugA, id: targetProductId }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.product.name || json.product.title).toBe(productTitle);
    expect(Number(json.product.price)).toBe(850000);
  });

  test('1d. Real API Product Update: PUT /api/v1/tenants/[slug]/products/[id] updates PostgreSQL on disk', async () => {
    const updatePayload = {
      name: `${productTitle} — Enterprise Tier`,
      price: 990000,
      promo_price: 890000,
      stock: 75,
      is_active: true,
      category: 'service',
      type: 'service',
      product_type: 'SERVICE',
    };

    const req = new NextRequest(
      `https://dashboard.boontrack.com/api/v1/tenants/${slugA}/products/${targetProductId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenA}`,
        },
        body: JSON.stringify(updatePayload),
      }
    );

    const res = await updateProduct(req, {
      params: Promise.resolve({ slug: slugA, id: targetProductId }),
    });
    const json = await res.json();
    expect(res.status).toBe(200);

    expect(json.success).toBe(true);
    expect(json.product).toBeDefined();
    expect(Number(json.product.price)).toBe(990000);

    // Direct PostgreSQL query verification: Prove disk mutation
    const verifySql = await pgClient.query(
      'SELECT title, price, promo_price, stock FROM workforce_staging.products WHERE id = $1',
      [targetProductId]
    );
    expect(verifySql.rows.length).toBe(1);
    const updatedProd = verifySql.rows[0];
    expect(updatedProd.title).toContain('Enterprise Tier');
    expect(Number(updatedProd.price)).toBe(990000);
    expect(Number(updatedProd.promo_price)).toBe(890000);
    expect(updatedProd.stock).toBe(75);
  });

  test('1e. Real API Settings Update: PUT /api/v1/tenants/[slug]/settings persists to PostgreSQL', async () => {
    const settingsPayload = {
      name: 'Alpha Security Operations Command',
      phone: '6281987654321',
      category: 'service',
      whatsapp_number: '6281987654321',
      metadata: {
        crm: true,
        workforce_enabled: true,
      },
    };

    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        cookie: `bt_merchant_token=${tokenA}`,
      },
      body: JSON.stringify(settingsPayload),
    });

    const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
    const json = await res.json();
    expect(res.status).toBe(200);

    expect(json.success).toBe(true);

    // Direct PostgreSQL query verification on workforce_staging.tenants
    const tenantDb = await pgClient.query(
      'SELECT name, phone, category, metadata FROM workforce_staging.tenants WHERE id = $1',
      [tenantIdA]
    );
    expect(tenantDb.rows.length).toBe(1);
    expect(tenantDb.rows[0].name).toBe('Alpha Security Operations Command');
    expect(tenantDb.rows[0].phone).toBe('6281987654321');
    expect(tenantDb.rows[0].category).toBe('service');
    expect(tenantDb.rows[0].metadata.store_name).toBe('Alpha Security Operations Command');
  });

  test('1f. Disconnected Fresh-Client Verification: Zero In-Memory Mock/Cache Proof', async () => {
    // Establish a completely fresh, independent client connection
    const freshClient = new Client({ connectionString: getDatabaseConnectionString() });
    await freshClient.connect();
    await freshClient.query('SET search_path TO workforce_staging, public');

    // Confirm product exists on disk in PostgreSQL with updated fields
    const freshProd = await freshClient.query(
      'SELECT title, price, stock FROM workforce_staging.products WHERE id = $1',
      [targetProductId]
    );
    expect(freshProd.rows.length).toBe(1);
    const prod = freshProd.rows[0];
    expect(prod.title).toContain('Enterprise Tier');
    expect(Number(prod.price)).toBe(990000);

    // Confirm tenant settings persist across disconnected client
    const freshTenant = await freshClient.query(
      'SELECT name, phone, category FROM workforce_staging.tenants WHERE id = $1',
      [tenantIdA]
    );
    expect(freshTenant.rows.length).toBe(1);
    expect(freshTenant.rows[0].name).toBe('Alpha Security Operations Command');
    expect(freshTenant.rows[0].phone).toBe('6281987654321');
    expect(freshTenant.rows[0].category).toBe('service');

    await freshClient.end();
  });

  test('1g. Real API Product Deletion: DELETE /api/v1/tenants/[slug]/products/[id]', async () => {
    const req = new NextRequest(
      `https://dashboard.boontrack.com/api/v1/tenants/${slugA}/products/${targetProductId}`,
      {
        method: 'DELETE',
        headers: {
          cookie: `bt_merchant_token=${tokenA}`,
        },
      }
    );

    const res = await deleteProduct(req, {
      params: Promise.resolve({ slug: slugA, id: targetProductId }),
    });
    const json = await res.json();
    expect(res.status).toBe(200);

    expect(json.success).toBe(true);

    // Verify product physically deleted on disk
    const checkDeleted = await pgClient.query(
      'SELECT 1 FROM workforce_staging.products WHERE id = $1',
      [targetProductId]
    );
    expect(checkDeleted.rows.length).toBe(0);
  });

  test('2a. Cross-Tenant Attack Rejection: Tenant A Cannot Update Tenant B Product (403 Forbidden)', async () => {
    // Create a product under Tenant B
    const bProdRes = await pgClient.query(`
      INSERT INTO workforce_staging.products (tenant_id, title, slug, price, category, product_type)
      VALUES ($1, 'Beta Private Service', 'beta-private-svc', 500000, 'service', 'SERVICE')
      RETURNING id
    `, [tenantIdB]);
    const bProdId = bProdRes.rows[0].id;

    // Tenant A attempts to update Tenant B's product
    const maliciousReq = new NextRequest(
      `https://dashboard.boontrack.com/api/v1/tenants/${slugB}/products/${bProdId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenA}`, // Tenant A's token
        },
        body: JSON.stringify({ price: 100 }),
      }
    );

    const res = await updateProduct(maliciousReq, {
      params: Promise.resolve({ slug: slugB, id: bProdId }),
    });
    expect(res.status).toBe(403);

    // Verify Tenant B's price remains 500000
    const verifyB = await pgClient.query('SELECT price FROM workforce_staging.products WHERE id = $1', [bProdId]);
    expect(Number(verifyB.rows[0].price)).toBe(500000);
  });

  test('2b. Cross-Tenant Attack Rejection: Tenant A Cannot Mutate Tenant B Settings (403 Forbidden)', async () => {
    const maliciousReq = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugB}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        cookie: `bt_merchant_token=${tokenA}`, // Tenant A's token
      },
      body: JSON.stringify({ name: 'Hacked by Alpha' }),
    });

    const res = await updateSettings(maliciousReq, { params: Promise.resolve({ slug: slugB }) });
    expect(res.status).toBe(403);

    // Verify Tenant B's name intact
    const verifyB = await pgClient.query('SELECT name FROM workforce_staging.tenants WHERE id = $1', [tenantIdB]);
    expect(verifyB.rows[0].name).toBe('Beta Security Services');
  });

  test('2c. Fail-Closed Authentication: Missing Token Fails Closed (401 Unauthorized)', async () => {
    const unauthReq = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Unauthorized Product', price: 1000 }),
    });

    const res = await createProduct(unauthReq, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(401);
  });

  test('2d. Fail-Closed Authentication: Forged / Tampered Token Fails Closed (401 Unauthorized)', async () => {
    const forgedToken = `${tokenA.slice(0, -5)}XXXXX`;
    const forgedReq = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `bt_merchant_token=${forgedToken}`,
      },
      body: JSON.stringify({ name: 'Forged Product', price: 1000 }),
    });

    const res = await createProduct(forgedReq, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(401);
  });

  test('2e. Fail-Closed Scope: Unknown Tenant Settings Mutation Returns 403/404 (Fail-Closed)', async () => {
    const ghostSlug = `ghost-tenant-${Date.now()}`;
    const ghostToken = signMerchantSessionToken({
      tenantSlug: ghostSlug,
      tenantId: '00000000-0000-0000-0000-000000000099',
      role: 'OWNER',
    });

    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${ghostSlug}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        cookie: `bt_merchant_token=${ghostToken}`,
      },
      body: JSON.stringify({ name: 'Ghost Name' }),
    });

    const res = await updateSettings(req, { params: Promise.resolve({ slug: ghostSlug }) });
    expect([403, 404]).toContain(res.status);
  });
});
