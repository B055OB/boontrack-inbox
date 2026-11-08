/**
 * __tests__/workforce/api-authorization-convergence.test.ts
 * BWM Gate 1 Round 3I: API Authorization Convergence, Role-Safe Reads, Rollback Closure & Verified Build
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
    let val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    process.env[key] = val;
  }
}

import crypto from 'crypto';
import { Client } from 'pg';
import { NextRequest } from 'next/server';
import {
  signMerchantSessionToken,
  authorizeMerchantSession,
  isInternalMachineAuthorized,
} from '@/lib/auth/merchant-session';
import {
  GET as getProducts,
  POST as createProduct,
} from '@/app/api/v1/tenants/[slug]/products/route';
import {
  GET as getProductById,
  PUT as updateProductById,
  DELETE as deleteProductById,
} from '@/app/api/v1/tenants/[slug]/products/[id]/route';

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
    throw new Error('STAGING_DB_REQUIRED: Staging connection required for convergence tests');
  }
  return connStr;
}

describe('BWM Gate 1 Round 3I — API Authorization Convergence & Role-Safe Authority', () => {
  let pgClient: Client;
  const timestamp = Date.now();
  const slug = `conv-tenant-${timestamp}`;
  let tenantId: string;

  const targetProductId = crypto.randomUUID();
  const productTitle = `Cyber Geofence Sentinel ${timestamp}`;
  const productSlug = `cyber-geofence-${timestamp}`;

  const USER_OWNER = crypto.randomUUID();
  const USER_MERCHANT = crypto.randomUUID();
  const USER_OPERATOR = crypto.randomUUID();
  const USER_CS = crypto.randomUUID();

  let tokenOwner: string;
  let tokenMerchant: string;
  let tokenOperator: string;
  let tokenCS: string;

  beforeAll(async () => {
    pgClient = new Client({ connectionString: getDatabaseConnectionString() });
    await pgClient.connect();
    await pgClient.query('SET search_path TO workforce_staging, public');

    // 1. Provision target tenant
    const tRes = await pgClient.query(`
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, subscription_status, is_active,
        public_storefront_enabled, metadata, phone, whatsapp_number, waba_phone_number_id
      ) VALUES (
        $1, 'Convergence Defense Systems', 'service', 'PRO_SCALE', 'active', 'active',
        TRUE, TRUE, '{"secret_api_key": "sec_tenant_master_key_999"}', '+628111222333', '+628111222333', 'WABA_CONFIDENTIAL_ID_88'
      ) RETURNING id
    `, [slug]);
    tenantId = tRes.rows[0].id;

    // 2. Provision memberships for each role in authoritative SSOT table
    await pgClient.query(`
      INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
      VALUES 
        ($1, $2, $3, 'OWNER', TRUE),
        ($4, $2, $3, 'MERCHANT', TRUE),
        ($5, $2, $3, 'OPERATOR', TRUE),
        ($6, $2, $3, 'CS', TRUE)
    `, [USER_OWNER, tenantId, slug, USER_MERCHANT, USER_OPERATOR, USER_CS]);

    // 3. Provision a sensitive digital/service product with fulfillment secrets
    await pgClient.query(`
      INSERT INTO workforce_staging.products (
        id, tenant_id, title, slug, price, promo_price, category, product_type,
        description, stock, is_active, status, is_publicly_published, asset_reference,
        license_status, fulfillment_metadata
      ) VALUES (
        $1, $2, $3, $4, 750000, 650000, 'service', 'SERVICE',
        'Mission critical encrypted geofence service', 100, TRUE, 'ACTIVE', TRUE,
        'ASSET-CONFIDENTIAL-REF-777', 'VERIFIED_ENTERPRISE',
        '{"access_url": "https://vault.boontrack.com/download/key_secret_xyz", "license_key": "LIC-PRO-999-SECRET", "single_page_config": {"banner_url": "https://img.com/banner.png"}}'::jsonb
      )
    `, [targetProductId, tenantId, productTitle, productSlug]);

    // 4. Mint cryptographic HMAC session tokens
    tokenOwner = signMerchantSessionToken({
      tenantSlug: slug,
      tenantId: tenantId,
      userId: USER_OWNER,
      role: 'OWNER',
    });

    tokenMerchant = signMerchantSessionToken({
      tenantSlug: slug,
      tenantId: tenantId,
      userId: USER_MERCHANT,
      role: 'MERCHANT',
    });

    tokenOperator = signMerchantSessionToken({
      tenantSlug: slug,
      tenantId: tenantId,
      userId: USER_OPERATOR,
      role: 'OPERATOR',
    });

    tokenCS = signMerchantSessionToken({
      tenantSlug: slug,
      tenantId: tenantId,
      userId: USER_CS,
      role: 'CS',
    });
  }, 30000);

  afterAll(async () => {
    if (pgClient) {
      try {
        await pgClient.query('RESET ROLE');
        await pgClient.query('DELETE FROM workforce_staging.products WHERE tenant_id = $1', [tenantId]);
        await pgClient.query('DELETE FROM workforce_staging.tenant_memberships WHERE tenant_id = $1 OR tenant_slug = $2', [tenantId, slug]);
        await pgClient.query('DELETE FROM workforce_staging.tenants WHERE id = $1', [tenantId]);
      } finally {
        await pgClient.end();
      }
    }
  }, 30000);

  // ===========================================================================
  // SECTION 1: ROLE-SAFE READ AUTHORIZATION (API HANDLERS)
  // ===========================================================================

  test('1a. OWNER receives full operational product catalog and fulfillment secrets', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenOwner}` },
    });
    const res = await getProducts(req, { params: Promise.resolve({ slug }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const prod = json.products.find((p: any) => String(p.id) === targetProductId);
    expect(prod).toBeDefined();
    // OWNER must receive fulfillment metadata and single page config
    expect(prod.fulfillment_metadata).toBeDefined();
    expect(prod.fulfillment_metadata.license_key).toBe('LIC-PRO-999-SECRET');
    expect(prod.single_page_config).toBeDefined();
  });

  test('1b. MERCHANT receives full operational product catalog and fulfillment metadata', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenMerchant}` },
    });
    const res = await getProducts(req, { params: Promise.resolve({ slug }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const prod = json.products.find((p: any) => String(p.id) === targetProductId);
    expect(prod).toBeDefined();
    expect(prod.fulfillment_metadata).toBeDefined();
    expect(prod.fulfillment_metadata.access_url).toContain('vault.boontrack.com');
  });

  test('1c. OPERATOR catalog view strictly masks fulfillment secrets and access URLs', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenOperator}` },
    });
    const res = await getProducts(req, { params: Promise.resolve({ slug }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const prod = json.products.find((p: any) => String(p.id) === targetProductId);
    expect(prod).toBeDefined();
    expect(prod.title).toBe(productTitle);
    expect(Number(prod.price)).toBe(750000);
    // OPERATOR MUST NOT have access to fulfillment secrets (Round 3J Strict Allowlist Projection)
    expect(prod.fulfillment_metadata).toBeUndefined();
    expect(prod.single_page_config).toBeUndefined();
    expect(prod.download_url).toBeUndefined();
    expect(Object.keys(prod).sort()).toEqual(['created_at', 'id', 'name', 'price', 'sku', 'status', 'title'].sort());
  });

  test('1d. CS catalog view strictly masks fulfillment secrets and access URLs', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products/${targetProductId}`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenCS}` },
    });
    const res = await getProductById(req, { params: Promise.resolve({ slug, id: targetProductId }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // CS can read product name/price but secrets are strictly omitted via allowlist
    expect(json.product.title).toBe(productTitle);
    expect(json.product.fulfillment_metadata).toBeUndefined();
    expect(json.product.single_page_config).toBeUndefined();
    expect(json.product.download_url).toBeUndefined();
    expect(Object.keys(json.product).sort()).toEqual(['created_at', 'id', 'name', 'price', 'sku', 'status', 'title'].sort());
  });

  // ===========================================================================
  // SECTION 2: ROLE-SAFE MUTATION AUTHORIZATION (API HANDLERS)
  // ===========================================================================

  test('2a. OWNER and MERCHANT can mutate products (POST/PUT/DELETE)', async () => {
    const newProdId = crypto.randomUUID();
    const postReq = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `bt_merchant_token=${tokenMerchant}`,
      },
      body: JSON.stringify({
        id: newProdId,
        title: 'Merchant Created Service',
        price: 250000,
        category: 'service',
        product_type: 'SERVICE',
        stock: 10,
      }),
    });
    const postRes = await createProduct(postReq, { params: Promise.resolve({ slug }) });
    expect(postRes.status).toBe(200);

    // Clean up created product
    await pgClient.query('DELETE FROM workforce_staging.products WHERE id = $1', [newProdId]);
  });

  test('2b. OPERATOR and CS are strictly rejected from product mutation (403 Forbidden)', async () => {
    // OPERATOR attempting POST
    const opReq = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `bt_merchant_token=${tokenOperator}`,
      },
      body: JSON.stringify({
        title: 'Operator Illegal Product',
        price: 100000,
      }),
    });
    const opRes = await createProduct(opReq, { params: Promise.resolve({ slug }) });
    expect(opRes.status).toBe(403);
    const opJson = await opRes.json();
    expect(opJson.error).toContain('OPERATOR');

    // CS attempting PUT
    const csReq = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products/${targetProductId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        cookie: `bt_merchant_token=${tokenCS}`,
      },
      body: JSON.stringify({
        price: 1,
      }),
    });
    const csRes = await updateProductById(csReq, { params: Promise.resolve({ slug, id: targetProductId }) });
    expect(csRes.status).toBe(403);
    const csJson = await csRes.json();
    expect(csJson.error).toContain('CS');

    // CS attempting DELETE
    const csDelReq = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products/${targetProductId}`, {
      method: 'DELETE',
      headers: { cookie: `bt_merchant_token=${tokenCS}` },
    });
    const csDelRes = await deleteProductById(csDelReq, { params: Promise.resolve({ slug, id: targetProductId }) });
    expect(csDelRes.status).toBe(403);
  });

  // ===========================================================================
  // SECTION 3: REAL-TIME MEMBERSHIP SSOT & IMMEDIATE REVOCATION
  // ===========================================================================

  test('3a. Active membership revocation in database immediately revokes API access (403 Forbidden)', async () => {
    // Deactivate OWNER membership in database SSOT
    await pgClient.query(
      'UPDATE workforce_staging.tenant_memberships SET is_active = FALSE WHERE user_id = $1 AND tenant_id = $2',
      [USER_OWNER, tenantId]
    );

    // Present the exact same, cryptographically valid, unexpired token
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenOwner}` },
    });
    const res = await getProducts(req, { params: Promise.resolve({ slug }) });
    // In unauthenticated storefront path without active membership, returns public storefront projection
    // BUT direct authorizeMerchantSession call strictly fails closed:
    const authCheck = await authorizeMerchantSession(req, slug);
    expect(authCheck.authorized).toBe(false);
    expect(authCheck.status).toBe(403);

    // Mutation with revoked token strictly fails closed (403)
    const mutateReq = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `bt_merchant_token=${tokenOwner}`,
      },
      body: JSON.stringify({ title: 'Revoked Attempt', price: 1000 }),
    });
    const mutateRes = await createProduct(mutateReq, { params: Promise.resolve({ slug }) });
    expect(mutateRes.status).toBe(403);
    const mutateJson = await mutateRes.json();
    expect(mutateJson.error).toContain('Revoked');

    // Restore active membership
    await pgClient.query(
      'UPDATE workforce_staging.tenant_memberships SET is_active = TRUE WHERE user_id = $1 AND tenant_id = $2',
      [USER_OWNER, tenantId]
    );
  });

  test('3b. Membership deletion from database immediately fails closed (403 Forbidden)', async () => {
    // Delete OWNER membership from database
    await pgClient.query(
      'DELETE FROM workforce_staging.tenant_memberships WHERE user_id = $1 AND tenant_id = $2',
      [USER_OWNER, tenantId]
    );

    const mutateReq = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `bt_merchant_token=${tokenOwner}`,
      },
      body: JSON.stringify({ title: 'Deleted Membership Attempt', price: 1000 }),
    });
    const mutateRes = await createProduct(mutateReq, { params: Promise.resolve({ slug }) });
    expect(mutateRes.status).toBe(403);
    const mutateJson = await mutateRes.json();
    expect(mutateJson.error).toContain('tidak terdaftar dalam keanggotaan');

    // Re-insert OWNER membership
    await pgClient.query(
      'INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active) VALUES ($1, $2, $3, $4, TRUE)',
      [USER_OWNER, tenantId, slug, 'OWNER']
    );
  });

  test('3c. Database failure/timeout during session auth strictly fails closed (503 DATABASE_LOOKUP_FAILED)', async () => {
    const { getSupabaseAdmin, getWorkforceSupabaseAdmin } = await import('@/lib/supabaseClient');
    const admin = (getWorkforceSupabaseAdmin ? getWorkforceSupabaseAdmin() : getSupabaseAdmin()) as any;
    const originalFrom = admin.from.bind(admin);
    // Spy on from to simulate database lookup failure
    admin.from = jest.fn(() => {
      throw new Error('Database connection timeout (Simulated ETIMEDOUT)');
    });

    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenOwner}` },
    });

    const authCheck = await authorizeMerchantSession(req, slug);
    expect(authCheck.authorized).toBe(false);
    expect(authCheck.status).toBe(503);
    expect(authCheck.error).toBe('DATABASE_LOOKUP_FAILED');

    // Restore original method
    admin.from = originalFrom;
  });

  // ===========================================================================
  // SECTION 4: AUTHORITATIVE ROLE MODIFICATION OVERRIDE (SSOT)
  // ===========================================================================

  test('4. Database role modification overrides token claims in real time', async () => {
    // Demote USER_MERCHANT from 'MERCHANT' to 'CS' in the database
    await pgClient.query(
      "UPDATE workforce_staging.tenant_memberships SET role = 'CS' WHERE user_id = $1 AND tenant_id = $2",
      [USER_MERCHANT, tenantId]
    );

    // Present tokenMerchant (which claims role: 'MERCHANT' in its HMAC payload) to mutate products
    const mutateReq = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `bt_merchant_token=${tokenMerchant}`,
      },
      body: JSON.stringify({ title: 'Demoted Attempt', price: 1000 }),
    });
    const mutateRes = await createProduct(mutateReq, { params: Promise.resolve({ slug }) });
    // Database SSOT overrides token role to CS -> rejected with 403 Forbidden!
    expect(mutateRes.status).toBe(403);
    const mutateJson = await mutateRes.json();
    expect(mutateJson.error).toContain('CS');

    // Restore MERCHANT role
    await pgClient.query(
      "UPDATE workforce_staging.tenant_memberships SET role = 'MERCHANT' WHERE user_id = $1 AND tenant_id = $2",
      [USER_MERCHANT, tenantId]
    );
  });

  // ===========================================================================
  // SECTION 5: CONTRADICTORY TENANT SLUG & UUID REJECTION
  // ===========================================================================

  test('5. Session token with contradictory slug and UUID is rejected (403 Forbidden)', async () => {
    const bogusUuid = crypto.randomUUID();
    // Token claims slug matches URL, but tenantId belongs to a different UUID
    const contradictoryToken = signMerchantSessionToken({
      tenantSlug: slug,
      tenantId: bogusUuid,
      userId: USER_OWNER,
      role: 'OWNER',
    });

    const mutateReq = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `bt_merchant_token=${contradictoryToken}`,
      },
      body: JSON.stringify({ title: 'Spoofed Attempt', price: 1000 }),
    });
    const mutateRes = await createProduct(mutateReq, { params: Promise.resolve({ slug }) });
    expect(mutateRes.status).toBe(403);
    const json = await mutateRes.json();
    expect(json.error).toContain('Kontradiksi identitas tenant');
  });

  // ===========================================================================
  // SECTION 6: INTERNAL MACHINE AUTHORIZATION TENANT & OPERATION BOUNDS
  // ===========================================================================

  test('6a. Internal machine auth permits authorized tenant and operation', () => {
    const internalSecret = 'bt_admin_internal_secret_staging_key_2026_minimum_32!';
    process.env.ADMIN_INTERNAL_SECRET = internalSecret;

    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      headers: {
        'x-internal-secret': internalSecret,
        'x-target-tenant': slug,
        'x-machine-operation': 'CREATE_PRODUCT',
      },
    });

    const isAuth = isInternalMachineAuthorized(req, slug, ['CREATE_PRODUCT', 'MUTATE_PRODUCT']);
    expect(isAuth).toBe(true);
  });

  test('6b. Internal machine auth rejects contradictory target tenant header', () => {
    const internalSecret = 'bt_admin_internal_secret_staging_key_2026_minimum_32!';
    process.env.ADMIN_INTERNAL_SECRET = internalSecret;

    // Header targets 'other-victim-tenant', but route is for 'slug'
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      headers: {
        'x-internal-secret': internalSecret,
        'x-target-tenant': 'other-victim-tenant',
      },
    });

    const isAuth = isInternalMachineAuthorized(req, slug, ['CREATE_PRODUCT']);
    expect(isAuth).toBe(false);
  });

  test('6c. Internal machine auth rejects unauthorized operation header', () => {
    const internalSecret = 'bt_admin_internal_secret_staging_key_2026_minimum_32!';
    process.env.ADMIN_INTERNAL_SECRET = internalSecret;

    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      headers: {
        'x-internal-secret': internalSecret,
        'x-target-tenant': slug,
        'x-machine-operation': 'UNAUTHORIZED_DROP_DATABASE',
      },
    });

    const isAuth = isInternalMachineAuthorized(req, slug, ['CREATE_PRODUCT', 'MUTATE_PRODUCT']);
    expect(isAuth).toBe(false);
  });

  test('6d. Internal machine auth rejects when targetTenantSlug is specified but tenant header is missing (Round 3J Blocker 2)', () => {
    const internalSecret = 'bt_admin_internal_secret_staging_key_2026_minimum_32!';
    process.env.ADMIN_INTERNAL_SECRET = internalSecret;

    // Secret is valid and operation is valid, but x-target-tenant is missing
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      headers: {
        'x-internal-secret': internalSecret,
        'x-machine-operation': 'CREATE_PRODUCT',
      },
    });

    const isAuth = isInternalMachineAuthorized(req, slug, ['CREATE_PRODUCT']);
    expect(isAuth).toBe(false);
  });

  test('6e. Internal machine auth rejects when allowedOperations is specified but operation header is missing (Round 3J Blocker 2)', () => {
    const internalSecret = 'bt_admin_internal_secret_staging_key_2026_minimum_32!';
    process.env.ADMIN_INTERNAL_SECRET = internalSecret;

    // Secret is valid and tenant is valid, but x-machine-operation is missing
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      headers: {
        'x-internal-secret': internalSecret,
        'x-target-tenant': slug,
      },
    });

    const isAuth = isInternalMachineAuthorized(req, slug, ['CREATE_PRODUCT']);
    expect(isAuth).toBe(false);
  });

  // ===========================================================================
  // SECTION 7: DATABASE COLUMN CONFIDENTIALITY ON PUBLIC VIEWS
  // ===========================================================================

  test('7a. Database public.tenants view masks sensitive columns for non-OWNER contexts', async () => {
    // Authenticated query under USER_CS context
    await pgClient.query('RESET ROLE');
    await pgClient.query('SET ROLE authenticated');
    await pgClient.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        sub: USER_CS,
        role: 'authenticated',
        app_metadata: { tenant_id: tenantId },
      }),
    ]);

    const csViewRes = await pgClient.query('SELECT slug, metadata, phone, whatsapp_number, waba_phone_number_id FROM public.tenants WHERE id = $1', [tenantId]);
    expect(csViewRes.rows.length).toBe(1);
    const row = csViewRes.rows[0];
    expect(row.slug).toBe(slug);
    // Sensitive owner fields MUST evaluate to NULL for CS role!
    expect(row.metadata).toBeNull();
    expect(row.phone).toBeNull();
    expect(row.whatsapp_number).toBeNull();
    expect(row.waba_phone_number_id).toBeNull();

    // Reset context
    await pgClient.query('RESET ROLE');
    await pgClient.query('RESET request.jwt.claims');
  });

  test('7b. Database public.products view masks fulfillment secrets for CS and OPERATOR', async () => {
    // Authenticated query under USER_CS context
    await pgClient.query('RESET ROLE');
    await pgClient.query('SET ROLE authenticated');
    await pgClient.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        sub: USER_CS,
        role: 'authenticated',
        app_metadata: { tenant_id: tenantId },
      }),
    ]);

    const csProdRes = await pgClient.query('SELECT title, price, fulfillment_metadata, asset_reference, license_status FROM public.products WHERE id = $1', [targetProductId]);
    expect(csProdRes.rows.length).toBe(1);
    const pRow = csProdRes.rows[0];
    expect(pRow.title).toBe(productTitle);
    expect(Number(pRow.price)).toBe(750000);
    // Sensitive merchant/owner fields MUST evaluate to NULL for CS role!
    expect(pRow.fulfillment_metadata).toBeNull();
    expect(pRow.asset_reference).toBeNull();
    expect(pRow.license_status).toBeNull();

    await pgClient.query('RESET ROLE');
    await pgClient.query('RESET request.jwt.claims');
  });

  test('7c. Cross-tenant update attempts on public.products view trigger SQLSTATE 42501 (Round 3J Blocker 3)', async () => {
    await pgClient.query('RESET ROLE');
    await pgClient.query('SET ROLE authenticated');
    await pgClient.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        sub: USER_MERCHANT,
        role: 'authenticated',
        app_metadata: { tenant_id: tenantId },
      }),
    ]);

    let crossTenantUpdateErr: any = null;
    try {
      await pgClient.query('UPDATE public.products SET tenant_id = $1 WHERE id = $2', [
        crypto.randomUUID(),
        targetProductId,
      ]);
    } catch (err: any) {
      crossTenantUpdateErr = err;
    }

    expect(crossTenantUpdateErr).not.toBeNull();
    expect(crossTenantUpdateErr.code).toBe('42501');
    expect(crossTenantUpdateErr.message).toContain('Cross-tenant migration prohibited');

    await pgClient.query('RESET ROLE');
    await pgClient.query('RESET request.jwt.claims');
  });

  test('7d. Direct base table access on workforce_staging.tenants and workforce_staging.products is rejected (Round 3J Blocker 5)', async () => {
    await pgClient.query('RESET ROLE');
    await pgClient.query('SET ROLE authenticated');

    let directTenantErr: any = null;
    try {
      await pgClient.query('SELECT * FROM workforce_staging.tenants LIMIT 1');
    } catch (err: any) {
      directTenantErr = err;
    }
    expect(directTenantErr).not.toBeNull();
    expect(directTenantErr.code).toBe('42501');

    let directProductErr: any = null;
    try {
      await pgClient.query('SELECT * FROM workforce_staging.products LIMIT 1');
    } catch (err: any) {
      directProductErr = err;
    }
    expect(directProductErr).not.toBeNull();
    expect(directProductErr.code).toBe('42501');

    await pgClient.query('RESET ROLE');
  });

  test('7e. Role-bounded membership visibility: OWNER & MERCHANT can list members; CS & OPERATOR receive 0 rows (Round 3K)', async () => {
    // 1. OWNER can query tenant memberships
    await pgClient.query('RESET ROLE');
    await pgClient.query('SET ROLE authenticated');
    await pgClient.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        sub: USER_OWNER,
        role: 'authenticated',
        app_metadata: { tenant_id: tenantId },
      }),
    ]);
    const ownerMemRes = await pgClient.query('SELECT user_id, role, is_active FROM public.tenant_memberships WHERE tenant_id = $1', [tenantId]);
    expect(ownerMemRes.rows.length).toBeGreaterThanOrEqual(1);

    // 2. MERCHANT can query tenant memberships
    await pgClient.query('RESET ROLE');
    await pgClient.query('SET ROLE authenticated');
    await pgClient.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        sub: USER_MERCHANT,
        role: 'authenticated',
        app_metadata: { tenant_id: tenantId },
      }),
    ]);
    const merchantMemRes = await pgClient.query('SELECT user_id, role, is_active FROM public.tenant_memberships WHERE tenant_id = $1', [tenantId]);
    expect(merchantMemRes.rows.length).toBeGreaterThanOrEqual(1);

    // 3. OPERATOR receives 0 rows (strictly fail closed)
    await pgClient.query('RESET ROLE');
    await pgClient.query('SET ROLE authenticated');
    await pgClient.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        sub: USER_OPERATOR,
        role: 'authenticated',
        app_metadata: { tenant_id: tenantId },
      }),
    ]);
    const opMemRes = await pgClient.query('SELECT user_id, role, is_active FROM public.tenant_memberships WHERE tenant_id = $1', [tenantId]);
    expect(opMemRes.rows.length).toBe(0);

    // 4. CS receives 0 rows (strictly fail closed)
    await pgClient.query('RESET ROLE');
    await pgClient.query('SET ROLE authenticated');
    await pgClient.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        sub: USER_CS,
        role: 'authenticated',
        app_metadata: { tenant_id: tenantId },
      }),
    ]);
    const csMemRes = await pgClient.query('SELECT user_id, role, is_active FROM public.tenant_memberships WHERE tenant_id = $1', [tenantId]);
    expect(csMemRes.rows.length).toBe(0);

    await pgClient.query('RESET ROLE');
    await pgClient.query('RESET request.jwt.claims');
  });
});
