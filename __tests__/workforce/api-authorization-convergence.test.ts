/**
 * __tests__/workforce/api-authorization-convergence.test.ts
 * BWM Gate 1 Round 3I: API Authorization Convergence, Role-Safe Reads, Rollback Closure & Verified Build
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import pg, { Client, Pool } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
const { createClient: createRealSupabaseClient } = jest.requireActual('@supabase/supabase-js');
import { NextRequest } from 'next/server';
import { getStrictDisposableTestDatabaseUrl } from '@/workforce-web/lib/workforce/disposable-pg-test-store';

// 1. Snapshot initial environment and bind Commerce route variables to disposable container
const initialEnv = { ...process.env };

/**
 * Synchronous fail-closed validator for ephemeral PostgREST loopback gateway.
 * Strictly rejects any remote or cloud endpoint, invalid ports, non-http protocol,
 * or credentials before any Supabase client construction can occur.
 */
export function validateAndResolveDisposablePostgrestEndpoint(rawUrl?: string): string {
  const target =
    rawUrl !== undefined && String(rawUrl).trim() !== ''
      ? String(rawUrl).trim()
      : 'http://127.0.0.1:3000';

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch (err: any) {
    throw new Error(`[FAIL-CLOSED POSTGREST GUARD] Invalid URL syntax: '${target}'. Error: ${err?.message || err}`);
  }

  // 1. Protocol is exactly 'http:'
  if (parsed.protocol !== 'http:') {
    throw new Error(
      `[FAIL-CLOSED POSTGREST GUARD] Disallowed protocol '${parsed.protocol}'. Protocol must be strictly 'http:'. Cloud/HTTPS endpoints are forbidden.`
    );
  }

  // 2. Hostname is strictly 'localhost', '127.0.0.1', or IPv6 loopback '[::1]'
  const allowedHosts = ['localhost', '127.0.0.1', '[::1]'];
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error(
      `[FAIL-CLOSED POSTGREST GUARD] Non-loopback hostname rejected: '${parsed.hostname}'. ` +
        `PostgREST integration endpoint must strictly be loopback (localhost, 127.0.0.1, or [::1]). Cloud or remote endpoints are forbidden.`
    );
  }

  // 3. Port is the documented local PostgREST gateway port '3000'
  if (parsed.port !== '3000') {
    throw new Error(
      `[FAIL-CLOSED POSTGREST GUARD] Disallowed port '${parsed.port || 'default'}'. Endpoint must strictly use port 3000.`
    );
  }

  // 4. Username and password are absent
  if (parsed.username || parsed.password) {
    throw new Error(
      `[FAIL-CLOSED POSTGREST GUARD] Credentials detected in loopback URL. Username and password must be absent.`
    );
  }

  return parsed.origin;
}

export function createValidatedPostgrestClient(
  rawUrl: string | undefined,
  serviceKey: string
): SupabaseClient {
  const validatedUrl = validateAndResolveDisposablePostgrestEndpoint(rawUrl);
  return createRealSupabaseClient(validatedUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const ephemeralSupabaseUrl = validateAndResolveDisposablePostgrestEndpoint(process.env.DISPOSABLE_POSTGREST_URL);
const ephemeralServiceKey =
  process.env.DISPOSABLE_POSTGREST_SERVICE_ROLE_KEY ||
  process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.dxvBMIvKaxIke61h0Jc2vPk9EZre-_1A3UQ5NXP9t5Y';
const ephemeralAnonKey =
  process.env.DISPOSABLE_POSTGREST_ANON_KEY ||
  process.env.WORKFORCE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjIwMDAwMDAwMDB9.Rs4bVwQ_AdYuCzKpXE2AxvaLFxrdE6jNzkgdUgD-JC8';

process.env.NODE_ENV = 'test';
process.env.BWM_ALLOW_EPHEMERAL_SUPABASE_HTTP = 'true';
process.env.BWM_POSTGREST_INTEGRATION_TEST = 'true';
process.env.WORKFORCE_SUPABASE_URL = ephemeralSupabaseUrl;
process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY = ephemeralServiceKey;
process.env.WORKFORCE_SUPABASE_ANON_KEY = ephemeralAnonKey;
process.env.NEXT_PUBLIC_SUPABASE_URL = ephemeralSupabaseUrl;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ephemeralAnonKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = ephemeralServiceKey;
process.env.BOONTRACK_HMAC_SECRET = 'test_ci_secure_hmac_secret_for_pipeline_999';
process.env.BOONTRACK_SESSION_SECRET = 'test_ci_secure_hmac_secret_for_pipeline_999';

// Option 2: Provide a real SupabaseClient connected to the local disposable PostgREST gateway (port 3000)
const realPostgrestAdmin: SupabaseClient = createValidatedPostgrestClient(
  process.env.DISPOSABLE_POSTGREST_URL,
  ephemeralServiceKey
);

jest.mock('@/lib/supabaseClient', () => {
  return {
    isValidUuid: (id: string) =>
      typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
    safeUuidOrNull: (id: string | null | undefined) =>
      typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null,
    assertStagingRestUrlTarget: (url: string) => url,
    assertSharedRestUrlTarget: (url: string) => url,
    assertStagingDatabaseTarget: () => {},
    verifyFactoryClient: () => {},
    SUPABASE_URL: ephemeralSupabaseUrl,
    SUPABASE_ANON_KEY: ephemeralAnonKey,
    SUPABASE_SERVICE_ROLE_KEY: ephemeralServiceKey,
    SUPABASE_PUBLISHABLE_KEY: ephemeralAnonKey,
    supabase: realPostgrestAdmin,
    getWorkforceSupabaseAdmin: jest.fn(() => realPostgrestAdmin),
    getSupabaseAdmin: jest.fn(() => realPostgrestAdmin),
    getSupabase: jest.fn(() => realPostgrestAdmin),
  };
});

// Track all direct Client, test Pool, and route-handler Pool instances
const trackedClients = new Set<Client>();
const trackedPools = new Set<Pool>();
const OriginalClient = pg.Client;
const OriginalPool = pg.Pool;

class TrackedClient extends OriginalClient {
  constructor(...args: any[]) {
    super(...args);
    trackedClients.add(this);
  }
}

class TrackedPool extends OriginalPool {
  constructor(...args: any[]) {
    super(...args);
    trackedPools.add(this);
  }
}

(pg as any).Client = TrackedClient;
(pg as any).Pool = TrackedPool;

// Dynamic ESM bindings populated in beforeAll
let signMerchantSessionToken: (payload: any) => string;
let authorizeMerchantSession: (
  req: NextRequest,
  targetSlug?: string | null,
  allowedRoles?: any[],
  canonicalTenant?: any
) => Promise<any>;
let isInternalMachineAuthorized: (req: NextRequest, targetSlug: string, allowedOps: string[]) => boolean;
let getProducts: (req: NextRequest, ctx: { params: Promise<{ slug: string }> }) => Promise<any>;
let createProduct: (req: NextRequest, ctx: { params: Promise<{ slug: string }> }) => Promise<any>;
let getProductById: (req: NextRequest, ctx: { params: Promise<{ slug: string; id: string }> }) => Promise<any>;
let updateProductById: (req: NextRequest, ctx: { params: Promise<{ slug: string; id: string }> }) => Promise<any>;
let deleteProductById: (req: NextRequest, ctx: { params: Promise<{ slug: string; id: string }> }) => Promise<any>;
let getResellerMembers: (req: NextRequest, ctx: { params: Promise<{ slug: string }> }) => Promise<any>;
let createResellerMember: (req: NextRequest, ctx: { params: Promise<{ slug: string }> }) => Promise<any>;
let updateResellerMember: (req: NextRequest, ctx: { params: Promise<{ slug: string }> }) => Promise<any>;
let deleteResellerMember: (req: NextRequest, ctx: { params: Promise<{ slug: string }> }) => Promise<any>;

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
    // 1. Validate disposable test database URL
    const disposableDbUrl = getStrictDisposableTestDatabaseUrl();
    process.env.WORKFORCE_DATABASE_DIRECT_URL = disposableDbUrl;
    process.env.DATABASE_URL = disposableDbUrl;
    process.env.WORKFORCE_DATABASE_URL = disposableDbUrl;

    // 2. Dynamically import merchant-session and route handlers after env configuration
    const msModule = await import('@/lib/auth/merchant-session');
    signMerchantSessionToken = msModule.signMerchantSessionToken;
    authorizeMerchantSession = msModule.authorizeMerchantSession;
    isInternalMachineAuthorized = msModule.isInternalMachineAuthorized;

    const productsRoute = await import('@/app/api/v1/tenants/[slug]/products/route');
    getProducts = productsRoute.GET;
    createProduct = productsRoute.POST;

    const productIdRoute = await import('@/app/api/v1/tenants/[slug]/products/[id]/route');
    getProductById = productIdRoute.GET;
    updateProductById = productIdRoute.PUT;
    deleteProductById = productIdRoute.DELETE;

    const resellerRoute = await import('@/app/api/v1/tenants/[slug]/reseller/members/route');
    getResellerMembers = resellerRoute.GET;
    createResellerMember = resellerRoute.POST;
    updateResellerMember = resellerRoute.PATCH;
    deleteResellerMember = resellerRoute.DELETE;

    // 3. Connect direct superuser test client
    pgClient = new Client({ connectionString: disposableDbUrl });
    await pgClient.connect();
    await pgClient.query('SET search_path TO workforce_staging, public');

    // 4. Align view tuple structures and triggers with 010/015/016
    const migrationsDir = path.resolve('packages/workforce-billing/schema/migrations');
    const down012Sql = fs.readFileSync(
      path.join(migrationsDir, '012_create_workforce_revocation_and_authz_versioning.down.sql'),
      'utf8'
    );
    const up010Sql = fs.readFileSync(
      path.join(migrationsDir, '010_strict_storefront_opt_in_and_role_authorization.sql'),
      'utf8'
    );
    const up015Sql = fs.readFileSync(
      path.join(migrationsDir, '015_attendance_actor_binding_and_role_allowlist.sql'),
      'utf8'
    );
    const up016Sql = fs.readFileSync(
      path.join(migrationsDir, '016_bwm_domain_authorization_isolation.sql'),
      'utf8'
    );

    await pgClient.query('DROP VIEW IF EXISTS public.tenant_memberships, public.products, public.storefront_products');
    await pgClient.query('ALTER TABLE workforce_staging.products DROP COLUMN IF EXISTS metadata');
    await pgClient.query(down012Sql);
    await pgClient.query(up010Sql);
    await pgClient.query(up015Sql);
    await pgClient.query(up016Sql);
    await pgClient.query("NOTIFY pgrst, 'reload schema'");

    // 5. Provision target tenant
    const tRes = await pgClient.query(
      `
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, subscription_status, is_active,
        public_storefront_enabled, metadata, phone, whatsapp_number, waba_phone_number_id
      ) VALUES (
        $1, 'Convergence Defense Systems', 'service', 'PRO_SCALE', 'active', 'active',
        TRUE, TRUE, '{"secret_api_key": "sec_tenant_master_key_999"}', '+628111222333', '+628111222333', 'WABA_CONFIDENTIAL_ID_88'
      ) RETURNING id
    `,
      [slug]
    );
    tenantId = tRes.rows[0].id;

    // 6. Provision memberships for each role in authoritative SSOT table
    await pgClient.query(
      `
      INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
      VALUES 
        ($1, $2, $3, 'OWNER', TRUE),
        ($4, $2, $3, 'MERCHANT', TRUE),
        ($5, $2, $3, 'OPERATOR', TRUE),
        ($6, $2, $3, 'CS', TRUE)
    `,
      [USER_OWNER, tenantId, slug, USER_MERCHANT, USER_OPERATOR, USER_CS]
    );

    // 7. Provision a sensitive digital/service product with fulfillment secrets
    await pgClient.query(
      `
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
    `,
      [targetProductId, tenantId, productTitle, productSlug]
    );

    // 8. Mint cryptographic HMAC session tokens
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

  afterEach(() => {
    // Restore ADMIN_INTERNAL_SECRET if modified by section 6 tests
    if (initialEnv.ADMIN_INTERNAL_SECRET !== undefined) {
      process.env.ADMIN_INTERNAL_SECRET = initialEnv.ADMIN_INTERNAL_SECRET;
    } else {
      delete process.env.ADMIN_INTERNAL_SECRET;
    }
  });

  afterAll(async () => {
    try {
      if (pgClient) {
        try {
          await pgClient.query('RESET ROLE');
          await pgClient.query('DELETE FROM workforce_staging.products WHERE tenant_id = $1', [tenantId]);
          await pgClient.query(
            'DELETE FROM workforce_staging.tenant_memberships WHERE tenant_id = $1 OR tenant_slug = $2',
            [tenantId, slug]
          );
          await pgClient.query('DELETE FROM workforce_staging.tenants WHERE id = $1', [tenantId]);
        } catch {
          // ignore fixture teardown error
        }

        try {
          // Guaranteed migration restoration
          const migrationsDir = path.resolve('packages/workforce-billing/schema/migrations');
          const up012Sql = fs.readFileSync(
            path.join(migrationsDir, '012_create_workforce_revocation_and_authz_versioning.sql'),
            'utf8'
          );
          const up016Sql = fs.readFileSync(
            path.join(migrationsDir, '016_bwm_domain_authorization_isolation.sql'),
            'utf8'
          );
          await pgClient.query("ALTER TABLE workforce_staging.products ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'");
          await pgClient.query(up012Sql);
          await pgClient.query(up016Sql);
          await pgClient.query("NOTIFY pgrst, 'reload schema'");
        } catch {
          // ignore restoration error in teardown
        }
      }
    } finally {
      (pg as any).Client = OriginalClient;
      (pg as any).Pool = OriginalPool;

      if (pgClient) {
        try {
          await pgClient.end();
        } catch {
          // ignore
        }
      }

      for (const client of trackedClients) {
        try {
          await client.end();
        } catch {
          // ignore client close error
        }
      }
      trackedClients.clear();

      for (const pool of trackedPools) {
        try {
          await pool.end();
        } catch {
          // ignore pool close error
        }
      }
      trackedPools.clear();

      for (const key of Object.keys(process.env)) {
        if (!(key in initialEnv)) {
          delete process.env[key];
        }
      }
      Object.assign(process.env, initialEnv);
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
    const req = new NextRequest(
      `https://dashboard.boontrack.com/api/v1/tenants/${slug}/products/${targetProductId}`,
      {
        method: 'GET',
        headers: { cookie: `bt_merchant_token=${tokenCS}` },
      }
    );
    const res = await getProductById(req, { params: Promise.resolve({ slug, id: targetProductId }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // CS can read product name/price but secrets are strictly omitted via allowlist
    expect(json.product.title).toBe(productTitle);
    expect(json.product.fulfillment_metadata).toBeUndefined();
    expect(json.product.single_page_config).toBeUndefined();
    expect(json.product.download_url).toBeUndefined();
    expect(Object.keys(json.product).sort()).toEqual(
      ['created_at', 'id', 'name', 'price', 'sku', 'status', 'title'].sort()
    );
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
    const csReq = new NextRequest(
      `https://dashboard.boontrack.com/api/v1/tenants/${slug}/products/${targetProductId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenCS}`,
        },
        body: JSON.stringify({
          price: 1,
        }),
      }
    );
    const csRes = await updateProductById(csReq, { params: Promise.resolve({ slug, id: targetProductId }) });
    expect(csRes.status).toBe(403);
    const csJson = await csRes.json();
    expect(csJson.error).toContain('CS');

    // CS attempting DELETE
    const csDelReq = new NextRequest(
      `https://dashboard.boontrack.com/api/v1/tenants/${slug}/products/${targetProductId}`,
      {
        method: 'DELETE',
        headers: { cookie: `bt_merchant_token=${tokenCS}` },
      }
    );
    const csDelRes = await deleteProductById(csDelReq, { params: Promise.resolve({ slug, id: targetProductId }) });
    expect(csDelRes.status).toBe(403);
  });

  // ===========================================================================
  // SECTION 3: IMMEDIATE DATABASE REVOCATION FAIL-CLOSED (SSOT)
  // ===========================================================================

  test('3a. Active membership revocation in database immediately revokes API access (403 Forbidden)', async () => {
    // Revoke OWNER active membership directly in the database SSOT
    await pgClient.query(
      'UPDATE workforce_staging.tenant_memberships SET is_active = FALSE WHERE user_id = $1 AND tenant_id = $2',
      [USER_OWNER, tenantId]
    );

    // Present the exact same, cryptographically valid, unexpired token
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenOwner}` },
    });

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
    await pgClient.query('DELETE FROM workforce_staging.tenant_memberships WHERE user_id = $1 AND tenant_id = $2', [
      USER_OWNER,
      tenantId,
    ]);

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
    const originalFrom = realPostgrestAdmin.from.bind(realPostgrestAdmin);
    // Spy on from to simulate database lookup failure
    realPostgrestAdmin.from = jest.fn(() => {
      throw new Error('Database connection timeout (Simulated ETIMEDOUT)');
    });

    try {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
        method: 'GET',
        headers: { cookie: `bt_merchant_token=${tokenOwner}` },
      });

      const authCheck = await authorizeMerchantSession(req, slug);
      expect(authCheck.authorized).toBe(false);
      expect(authCheck.status).toBe(503);
      expect(authCheck.error).toBe('DATABASE_LOOKUP_FAILED');
    } finally {
      // Restore original method
      realPostgrestAdmin.from = originalFrom;
    }
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

  test('6f. Internal machine auth rejects legacy alias headers (x-tenant-slug, x-tenant-id) on M2M ingress', () => {
    const internalSecret = 'bt_admin_internal_secret_staging_key_2026_minimum_32!';
    process.env.ADMIN_INTERNAL_SECRET = internalSecret;

    // Supplying legacy alias x-tenant-slug instead of canonical x-target-tenant
    const reqSlug = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      headers: {
        'x-internal-secret': internalSecret,
        'x-tenant-slug': slug,
        'x-machine-operation': 'CREATE_PRODUCT',
      },
    });
    expect(isInternalMachineAuthorized(reqSlug, slug, ['CREATE_PRODUCT'])).toBe(false);

    // Supplying legacy alias x-tenant-id instead of canonical x-target-tenant
    const reqId = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      headers: {
        'x-internal-secret': internalSecret,
        'x-tenant-id': slug,
        'x-machine-operation': 'CREATE_PRODUCT',
      },
    });
    expect(isInternalMachineAuthorized(reqId, slug, ['CREATE_PRODUCT'])).toBe(false);
  });

  test('6g. Internal machine auth rejects legacy alias operation header (x-internal-operation)', () => {
    const internalSecret = 'bt_admin_internal_secret_staging_key_2026_minimum_32!';
    process.env.ADMIN_INTERNAL_SECRET = internalSecret;

    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      headers: {
        'x-internal-secret': internalSecret,
        'x-target-tenant': slug,
        'x-internal-operation': 'CREATE_PRODUCT',
      },
    });
    expect(isInternalMachineAuthorized(req, slug, ['CREATE_PRODUCT'])).toBe(false);
  });

  test('6h. Internal machine auth rejects secret-only request when targetTenantSlug or allowedOperations is empty', () => {
    const internalSecret = 'bt_admin_internal_secret_staging_key_2026_minimum_32!';
    process.env.ADMIN_INTERNAL_SECRET = internalSecret;

    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/products`, {
      headers: {
        'x-internal-secret': internalSecret,
        'x-target-tenant': slug,
        'x-machine-operation': 'CREATE_PRODUCT',
      },
    });

    // Empty targetTenantSlug
    expect(isInternalMachineAuthorized(req, '', ['CREATE_PRODUCT'])).toBe(false);

    // Empty allowedOperations array
    expect(isInternalMachineAuthorized(req, slug, [])).toBe(false);
  });

  test('6i. Reseller members 4-method authorization validation: all methods reject unauthenticated requests (401/403)', async () => {
    // 1. GET /api/v1/tenants/[slug]/reseller/members
    const getReq = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/reseller/members`);
    const getRes = await getResellerMembers(getReq, { params: Promise.resolve({ slug }) });
    expect([401, 403]).toContain(getRes.status);

    // 2. POST /api/v1/tenants/[slug]/reseller/members
    const postReq = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/reseller/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Unauth Reseller', phone: '08123456789' }),
    });
    const postRes = await createResellerMember(postReq, { params: Promise.resolve({ slug }) });
    expect([401, 403]).toContain(postRes.status);

    // 3. PATCH /api/v1/tenants/[slug]/reseller/members
    const patchReq = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slug}/reseller/members`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'dummy-reseller-id', status: 'ACTIVE' }),
    });
    const patchRes = await updateResellerMember(patchReq, { params: Promise.resolve({ slug }) });
    expect([401, 403]).toContain(patchRes.status);

    // 4. DELETE /api/v1/tenants/[slug]/reseller/members?id=dummy-id
    const delReq = new NextRequest(
      `https://dashboard.boontrack.com/api/v1/tenants/${slug}/reseller/members?id=dummy-id`,
      {
        method: 'DELETE',
      }
    );
    const delRes = await deleteResellerMember(delReq, { params: Promise.resolve({ slug }) });
    expect([401, 403]).toContain(delRes.status);
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

    const csViewRes = await pgClient.query(
      'SELECT slug, metadata, phone, whatsapp_number, waba_phone_number_id FROM public.tenants WHERE id = $1',
      [tenantId]
    );
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

    const csProdRes = await pgClient.query(
      'SELECT title, price, fulfillment_metadata, asset_reference, license_status FROM public.products WHERE id = $1',
      [targetProductId]
    );
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
    const ownerMemRes = await pgClient.query(
      'SELECT user_id, role, is_active FROM public.tenant_memberships WHERE tenant_id = $1',
      [tenantId]
    );
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
    const merchantMemRes = await pgClient.query(
      'SELECT user_id, role, is_active FROM public.tenant_memberships WHERE tenant_id = $1',
      [tenantId]
    );
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
    const opMemRes = await pgClient.query(
      'SELECT user_id, role, is_active FROM public.tenant_memberships WHERE tenant_id = $1',
      [tenantId]
    );
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
    const csMemRes = await pgClient.query(
      'SELECT user_id, role, is_active FROM public.tenant_memberships WHERE tenant_id = $1',
      [tenantId]
    );
    expect(csMemRes.rows.length).toBe(0);

    await pgClient.query('RESET ROLE');
    await pgClient.query('RESET request.jwt.claims');
  });

  describe('BWM Fail-Closed PostgREST Guard (Negative Tests)', () => {
    test('Supabase cloud URLs are rejected', () => {
      const cloudUrls = [
        'https://tjkbgxrckaocgosvmzmj.supabase.co',
        'https://mpluzajlzpregmjwpjqr.supabase.co',
        'https://xkhqirhurnjqglmajghn.supabase.co',
        'https://any-project.supabase.co',
        'http://tjkbgxrckaocgosvmzmj.supabase.co:3000',
      ];
      for (const url of cloudUrls) {
        expect(() => validateAndResolveDisposablePostgrestEndpoint(url)).toThrow(
          /\[FAIL-CLOSED POSTGREST GUARD\]/
        );
      }
    });

    test('A remote hostname is rejected', () => {
      const remoteUrls = [
        'http://remote.host:3000',
        'http://192.168.1.100:3000',
        'http://10.0.0.1:3000',
        'http://boontrack.com:3000',
        'http://internal.corp:3000',
      ];
      for (const url of remoteUrls) {
        expect(() => validateAndResolveDisposablePostgrestEndpoint(url)).toThrow(
          /\[FAIL-CLOSED POSTGREST GUARD\] Non-loopback hostname rejected/
        );
      }
    });

    test('An unexpected local port is rejected', () => {
      const badPortUrls = [
        'http://127.0.0.1:8080',
        'http://localhost:5432',
        'http://127.0.0.1:3001',
        'http://127.0.0.1',
        'http://localhost',
        'http://[::1]:8000',
      ];
      for (const url of badPortUrls) {
        expect(() => validateAndResolveDisposablePostgrestEndpoint(url)).toThrow(
          /\[FAIL-CLOSED POSTGREST GUARD\] Disallowed port/
        );
      }
    });

    test('Missing disposable PostgREST configuration uses only the documented local default', () => {
      const savedWorkforceUrl = process.env.WORKFORCE_SUPABASE_URL;
      try {
        process.env.WORKFORCE_SUPABASE_URL = 'https://tjkbgxrckaocgosvmzmj.supabase.co';
        expect(validateAndResolveDisposablePostgrestEndpoint(undefined)).toBe('http://127.0.0.1:3000');
        expect(validateAndResolveDisposablePostgrestEndpoint('')).toBe('http://127.0.0.1:3000');
        expect(validateAndResolveDisposablePostgrestEndpoint('   ')).toBe('http://127.0.0.1:3000');
        expect(validateAndResolveDisposablePostgrestEndpoint(undefined)).not.toContain('supabase.co');
      } finally {
        process.env.WORKFORCE_SUPABASE_URL = savedWorkforceUrl;
      }
    });

    test('Rejected URLs fail before SupabaseClient construction', () => {
      const badEndpoints = [
        'https://tjkbgxrckaocgosvmzmj.supabase.co',
        'http://remote-server.com:3000',
        'http://127.0.0.1:9999',
        'http://admin:secret@127.0.0.1:3000',
        'not_a_valid_url',
      ];

      for (const badUrl of badEndpoints) {
        let clientCreated = false;
        expect(() => {
          validateAndResolveDisposablePostgrestEndpoint(badUrl);
          clientCreated = true;
          createRealSupabaseClient(badUrl, 'dummy-key');
        }).toThrow(/\[FAIL-CLOSED POSTGREST GUARD\]/);
        expect(clientCreated).toBe(false);

        expect(() => createValidatedPostgrestClient(badUrl, 'dummy-key')).toThrow(
          /\[FAIL-CLOSED POSTGREST GUARD\]/
        );
      }
    });
  });
});
