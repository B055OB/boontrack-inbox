/**
 * __tests__/workforce/real-data-api-exposure.test.ts
 * BWM Gate 1 Round 3G: Real Supabase PostgREST Data API Exposure & Boundary Verification
 *
 * Directives (CTO Official Mandate Round 3G — Blocker D):
 * 1. Anonymous Access Boundary:
 *    - GET /rest/v1/tenants with anon key fails closed (401/permission denied).
 *    - GET /rest/v1/products with anon key fails closed (401/permission denied).
 *    - GET /rest/v1/storefront_tenants?slug=eq.<slug> returns strictly safe public fields;
 *      explicitly proves ZERO WABA tokens, CAPI tokens, private phone numbers, or metadata exposed.
 *    - GET /rest/v1/storefront_products?tenant_id=eq.<id> returns active products only;
 *      explicitly proves ZERO fulfillment_metadata or asset_reference exposed, and draft products suppressed.
 *    - Anon mutation on storefront views is strictly rejected (401/403).
 * 2. Authenticated Cross-Tenant PostgREST Boundary:
 *    - Authenticated User Alpha (real Supabase Auth JWT) cannot read Tenant Beta private data (0 rows).
 *    - Authenticated User Alpha cannot mutate or delete Tenant Beta data (fails / 0 rows affected).
 *    - Authenticated User Alpha can legitimately read its own tenant and product data.
 */

jest.unmock('@supabase/supabase-js');

import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

function loadStagingConfig() {
  let supabaseUrl = process.env.WORKFORCE_SUPABASE_URL;
  let anonKey = process.env.WORKFORCE_SUPABASE_ANON_KEY;
  let serviceRoleKey = process.env.WORKFORCE_SUPABASE_SERVICE_ROLE_KEY;
  let directDbUrl = process.env.WORKFORCE_DATABASE_DIRECT_URL;

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !directDbUrl) {
    try {
      const envPath = path.resolve('.env.local');
      if (fs.existsSync(envPath)) {
        const envFile = fs.readFileSync(envPath, 'utf8');
        const matchUrl = envFile.match(/^WORKFORCE_SUPABASE_URL=(.*)$/m);
        const matchAnon = envFile.match(/^WORKFORCE_SUPABASE_ANON_KEY=(.*)$/m);
        const matchService = envFile.match(/^WORKFORCE_SUPABASE_SERVICE_ROLE_KEY=(.*)$/m);
        const matchDirect = envFile.match(/^WORKFORCE_DATABASE_DIRECT_URL=(.*)$/m);
        if (matchUrl) supabaseUrl = matchUrl[1].trim().replace(/^["']|["']$/g, '');
        if (matchAnon) anonKey = matchAnon[1].trim().replace(/^["']|["']$/g, '');
        if (matchService) serviceRoleKey = matchService[1].trim().replace(/^["']|["']$/g, '');
        if (matchDirect) directDbUrl = matchDirect[1].trim().replace(/^["']|["']$/g, '');
      }
    } catch {
      // ignore
    }
  }

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !directDbUrl) {
    throw new Error('STAGING_SUPABASE_REQUIRED: Real Data API tests require staging Supabase URL and keys');
  }

  return { supabaseUrl, anonKey, serviceRoleKey, directDbUrl };
}

describe('BWM Gate 1 Round 3G — Real Supabase PostgREST Data API Exposure & Boundary Verification', () => {
  const config = loadStagingConfig();
  const timestamp = Date.now();

  const TENANT_ALPHA_SLUG = `exp-alpha-${timestamp}`;
  const TENANT_BETA_SLUG = `exp-beta-${timestamp}`;
  const PROD_ACTIVE_SLUG = `exp-active-prod-${timestamp}`;
  const PROD_DRAFT_SLUG = `exp-draft-prod-${timestamp}`;
  const PROD_BETA_SLUG = `exp-beta-prod-${timestamp}`;

  const USER_ALPHA_EMAIL = `test_alpha_${timestamp}@boontrack-staging.local`;
  const USER_PASSWORD = 'Password123!Secure';

  let pgClient: Client;
  let adminClient: SupabaseClient;
  let anonClient: SupabaseClient;
  let alphaUserClient: SupabaseClient;

  let tenantAlphaId: string;
  let tenantBetaId: string;
  let alphaAuthUserId: string;
  let alphaJwt: string;

  beforeAll(async () => {
    // 1. Direct PostgreSQL connection for test fixture preparation
    pgClient = new Client({ connectionString: config.directDbUrl });
    await pgClient.connect();
    await pgClient.query('SET search_path TO workforce_staging, public');

    // 2. Supabase Admin & Anon clients
    adminClient = createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { persistSession: false }
    });
    anonClient = createClient(config.supabaseUrl, config.anonKey, {
      auth: { persistSession: false }
    });

    // 3. Seed tenants in staging database
    // Alpha: Explicitly opted-in to public storefront (public_storefront_enabled = true)
    // Beta: Private enterprise tenant (public_storefront_enabled = false)
    const alphaTenantRes = await pgClient.query(`
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, is_active, public_storefront_enabled,
        phone, whatsapp_number, waba_phone_number_id, telegram_chat_id,
        logo_url, avatar_url, bio, metadata
      ) VALUES (
        $1, 'Exposure Alpha Systems', 'service', 'PRO_SCALE', 'active', true, true,
        '+6281111111', '+6281111111', 'waba_secret_token_alpha_123', 'tg_chat_alpha_456',
        'https://cdn.example.com/logo-alpha.png', 'https://cdn.example.com/avatar-alpha.png',
        'Top Tier Alpha Defense Systems',
        $2::jsonb
      ) RETURNING id
    `, [
      TENANT_ALPHA_SLUG,
      JSON.stringify({
        capi_token: 'secret_capi_alpha_token_789',
        bank_account: 'BCA 1234567890 (PT Alpha)',
        internal_api_key: 'key_live_alpha_xyz'
      })
    ]);
    tenantAlphaId = alphaTenantRes.rows[0].id;

    const betaTenantRes = await pgClient.query(`
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, is_active, public_storefront_enabled,
        phone, whatsapp_number, waba_phone_number_id, telegram_chat_id,
        logo_url, avatar_url, bio, metadata
      ) VALUES (
        $1, 'Exposure Beta Systems', 'service', 'PRO_SCALE', 'active', true, false,
        '+6282222222', '+6282222222', 'waba_secret_token_beta_999', 'tg_chat_beta_888',
        'https://cdn.example.com/logo-beta.png', 'https://cdn.example.com/avatar-beta.png',
        'Top Tier Beta Cyber Systems',
        $2::jsonb
      ) RETURNING id
    `, [
      TENANT_BETA_SLUG,
      JSON.stringify({
        capi_token: 'secret_capi_beta_token_000',
        bank_account: 'Mandiri 0987654321 (PT Beta)',
        internal_api_key: 'key_live_beta_xyz'
      })
    ]);
    tenantBetaId = betaTenantRes.rows[0].id;

    // 4. Seed products: Alpha Active (published), Alpha Draft (unpublished), Beta Active (published on private tenant)
    await pgClient.query(`
      INSERT INTO workforce_staging.products (
        tenant_id, title, name, slug, price, promo_price, category, product_type,
        stock, is_unlimited_stock, is_active, status, is_publicly_published, fulfillment_metadata, asset_reference
      ) VALUES
        ($1, 'Alpha Active Product', 'Alpha Active Product', $2, 150000, 125000, 'service', 'SERVICE', 99, true, true, 'ACTIVE', true, '{"access_url": "https://cdn.internal/secret-file-alpha.zip", "key": "ALPHA-KEY-999"}'::jsonb, 'internal://assets/alpha-secret.pdf'),
        ($1, 'Alpha Draft Product', 'Alpha Draft Product', $3, 250000, null, 'service', 'SERVICE', 10, false, false, 'DRAFT', false, '{"access_url": "https://cdn.internal/secret-file-draft.zip"}'::jsonb, 'internal://assets/draft-secret.pdf'),
        ($4, 'Beta Operations Suite', 'Beta Operations Suite', $5, 500000, 450000, 'service', 'SERVICE', 50, true, true, 'ACTIVE', true, '{"access_url": "https://cdn.internal/secret-file-beta.zip", "key": "BETA-KEY-111"}'::jsonb, 'internal://assets/beta-secret.pdf')
    `, [tenantAlphaId, PROD_ACTIVE_SLUG, PROD_DRAFT_SLUG, tenantBetaId, PROD_BETA_SLUG]);

    // 5. Create real Supabase Auth user for Alpha
    const { data: authUser, error: authCreateErr } = await adminClient.auth.admin.createUser({
      email: USER_ALPHA_EMAIL,
      password: USER_PASSWORD,
      email_confirm: true
    });
    if (authCreateErr) throw authCreateErr;
    alphaAuthUserId = authUser.user.id;

    // 6. Link User Alpha in workforce_staging.tenant_memberships
    await pgClient.query(`
      INSERT INTO workforce_staging.tenant_memberships (
        user_id, tenant_id, tenant_slug, role, is_active
      ) VALUES ($1, $2, $3, 'OWNER', true)
    `, [alphaAuthUserId, tenantAlphaId, TENANT_ALPHA_SLUG]);

    // 7. Obtain real Supabase JWT for User Alpha using an isolated auth client
    const authSignInClient = createClient(config.supabaseUrl, config.anonKey, {
      auth: { persistSession: false }
    });
    const { data: signInData, error: signInErr } = await authSignInClient.auth.signInWithPassword({
      email: USER_ALPHA_EMAIL,
      password: USER_PASSWORD
    });
    if (signInErr) throw signInErr;
    alphaJwt = signInData.session.access_token;

    // 8. Create user-authenticated Supabase client
    alphaUserClient = createClient(config.supabaseUrl, config.anonKey, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${alphaJwt}`
        }
      }
    });
  }, 45000);

  afterAll(async () => {
    // Blocker G: Independent parameterized queries with strict verification and count reporting
    let pDelCount = 0;
    let mDelCount = 0;
    let tDelCount = 0;
    let authUserDeleted = false;

    if (pgClient) {
      try {
        const pRes = await pgClient.query(
          'DELETE FROM workforce_staging.products WHERE tenant_id = $1 OR tenant_id = $2',
          [tenantAlphaId, tenantBetaId]
        );
        pDelCount = pRes.rowCount ?? 0;

        const mRes = await pgClient.query(
          'DELETE FROM workforce_staging.tenant_memberships WHERE user_id = $1',
          [alphaAuthUserId]
        );
        mDelCount = mRes.rowCount ?? 0;

        const tRes = await pgClient.query(
          'DELETE FROM workforce_staging.tenants WHERE id = $1 OR id = $2',
          [tenantAlphaId, tenantBetaId]
        );
        tDelCount = tRes.rowCount ?? 0;

        // Verify zero remaining test fixtures in staging
        const pCheck = await pgClient.query(
          'SELECT COUNT(*)::int AS count FROM workforce_staging.products WHERE tenant_id = $1 OR tenant_id = $2',
          [tenantAlphaId, tenantBetaId]
        );
        expect(pCheck.rows[0].count).toBe(0);

        const mCheck = await pgClient.query(
          'SELECT COUNT(*)::int AS count FROM workforce_staging.tenant_memberships WHERE user_id = $1',
          [alphaAuthUserId]
        );
        expect(mCheck.rows[0].count).toBe(0);

        const tCheck = await pgClient.query(
          'SELECT COUNT(*)::int AS count FROM workforce_staging.tenants WHERE id = $1 OR id = $2',
          [tenantAlphaId, tenantBetaId]
        );
        expect(tCheck.rows[0].count).toBe(0);
      } finally {
        await pgClient.end();
      }
    }

    if (alphaAuthUserId && adminClient) {
      const { error: delErr } = await adminClient.auth.admin.deleteUser(alphaAuthUserId);
      if (!delErr) {
        authUserDeleted = true;
      }
    }

    // Report verified cleanup statistics in evidence logs
    console.log('[Audit Cleanup Verified] Independent Rows Removed:', {
      productsRemoved: pDelCount,
      membershipsRemoved: mDelCount,
      tenantsRemoved: tDelCount,
      authUserDeleted,
    });
  }, 30000);

  test('1. Anonymous Enumeration Rejection: GET /rest/v1/tenants with anon key fails closed', async () => {
    const { data, error } = await anonClient
      .from('tenants')
      .select('*');

    // With security_invoker = true and REVOKE ALL ON public.tenants FROM anon,
    // PostgREST returns 401 Unauthorized / permission denied (data is null or error present)
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  test('2. Anonymous Enumeration Rejection: GET /rest/v1/products with anon key fails closed', async () => {
    const { data, error } = await anonClient
      .from('products')
      .select('*');

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  test('3. Safe Storefront Tenants Projection: Exposes ONLY public fields and zero sensitive credentials', async () => {
    const { data, error } = await anonClient
      .from('storefront_tenants')
      .select('*')
      .eq('slug', TENANT_ALPHA_SLUG)
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.slug).toBe(TENANT_ALPHA_SLUG);
    expect(data.name).toBe('Exposure Alpha Systems');
    expect(data.tier).toBe('PRO_SCALE');
    expect(data.status).toBe('active');
    expect(data.is_active).toBe(true);

    // CRITICAL SECURITY ASSERTION: Verify all sensitive credentials and metadata are strictly omitted
    expect(data.metadata).toBeUndefined();
    expect(data.waba_phone_number_id).toBeUndefined();
    expect(data.telegram_chat_id).toBeUndefined();
    expect(data.phone).toBeUndefined();
    expect(data.whatsapp_number).toBeUndefined();

    // Verify key names present on data object
    const keys = Object.keys(data);
    expect(keys).not.toContain('metadata');
    expect(keys).not.toContain('waba_phone_number_id');
    expect(keys).not.toContain('capi_token');
    expect(keys).not.toContain('bank_account');
  });

  test('4. Safe Storefront Products Projection: Exposes active products only and excludes internal assets', async () => {
    const { data, error } = await anonClient
      .from('storefront_products')
      .select('*')
      .eq('tenant_id', tenantAlphaId);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    // Only active product should be returned
    const activeProd = data?.find((p: any) => p.slug === PROD_ACTIVE_SLUG);
    expect(activeProd).toBeDefined();
    expect(activeProd.price).toBe(150000);
    expect(activeProd.status).toBe('ACTIVE');
    expect(activeProd.is_active).toBe(true);

    // Draft / inactive product MUST NOT be returned (fail-closed suppression)
    const draftProd = data?.find((p: any) => p.slug === PROD_DRAFT_SLUG);
    expect(draftProd).toBeUndefined();

    // CRITICAL SECURITY ASSERTION: Verify fulfillment_metadata & asset_reference are strictly absent
    expect(activeProd.fulfillment_metadata).toBeUndefined();
    expect(activeProd.asset_reference).toBeUndefined();

    const keys = Object.keys(activeProd);
    expect(keys).not.toContain('fulfillment_metadata');
    expect(keys).not.toContain('asset_reference');
  });

  test('4b. Strict Storefront Opt-In: Private enterprise tenant and unpublished products invisible to public views', async () => {
    // 1. Private Enterprise Tenant (public_storefront_enabled = false) MUST NOT appear in storefront_tenants
    const { data: betaTenantData, error: betaTenantErr } = await anonClient
      .from('storefront_tenants')
      .select('*')
      .eq('slug', TENANT_BETA_SLUG);

    expect(betaTenantErr).toBeNull();
    expect(betaTenantData).toBeDefined();
    expect(betaTenantData?.length).toBe(0); // 100% invisible to anonymous storefront callers

    // 2. Products of Private Enterprise Tenant MUST NOT appear in storefront_products
    const { data: betaProdData, error: betaProdErr } = await anonClient
      .from('storefront_products')
      .select('*')
      .eq('tenant_id', tenantBetaId);

    expect(betaProdErr).toBeNull();
    expect(betaProdData).toBeDefined();
    expect(betaProdData?.length).toBe(0);

    // 3. Unpublished Product (is_publicly_published = false) MUST NOT appear in storefront_products
    const { data: draftData, error: draftErr } = await anonClient
      .from('storefront_products')
      .select('*')
      .eq('slug', PROD_DRAFT_SLUG);

    expect(draftErr).toBeNull();
    expect(draftData).toBeDefined();
    expect(draftData?.length).toBe(0);
  });

  test('5. Anonymous Mutation Rejection: Anonymous user cannot mutate storefront views', async () => {
    // Attempt insert on storefront_products
    const { data: insertData, error: insertErr } = await anonClient
      .from('storefront_products')
      .insert({
        tenant_id: tenantAlphaId,
        title: 'Hacked Storefront Product',
        slug: 'hacked-storefront-prod',
        price: 100
      });
    expect(insertErr).not.toBeNull();
    expect(insertData).toBeNull();

    // Attempt update on storefront_tenants
    const { error: updateErr } = await anonClient
      .from('storefront_tenants')
      .update({ name: 'Hacked Storefront Name' })
      .eq('slug', TENANT_ALPHA_SLUG);
    expect(updateErr).not.toBeNull();
  });

  test('6. Authenticated Cross-Tenant Read Suppression via Data API: Alpha cannot read Beta private data', async () => {
    // User Alpha connects with its real Supabase Auth JWT
    const { data, error } = await alphaUserClient
      .from('tenants')
      .select('id, slug, name, metadata')
      .eq('slug', TENANT_BETA_SLUG);

    // Under security_invoker = true and is_trusted_tenant_member,
    // PostgREST executes RLS: User Alpha has no membership in Beta -> returns 0 rows!
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data?.length).toBe(0);

    // Attempt to read Beta's products directly via public.products
    const { data: prodData, error: prodErr } = await alphaUserClient
      .from('products')
      .select('*')
      .eq('tenant_id', tenantBetaId);

    expect(prodErr).toBeNull();
    expect(prodData).toBeDefined();
    expect(prodData?.length).toBe(0);
  });

  test('7. Authenticated Cross-Tenant Mutation Rejection via Data API: Alpha cannot mutate Beta', async () => {
    // User Alpha attempts to update Tenant Beta's tenant profile
    const { data: updateData, error: updateErr } = await alphaUserClient
      .from('tenants')
      .update({ name: 'Hacked Beta by Alpha via Data API' })
      .eq('slug', TENANT_BETA_SLUG)
      .select();

    // RLS policy prevents update -> 0 rows modified
    expect(updateData?.length ?? 0).toBe(0);

    // User Alpha attempts to update Tenant Beta's product
    const { data: prodUpdateData, error: prodUpdateErr } = await alphaUserClient
      .from('products')
      .update({ price: 1 })
      .eq('tenant_id', tenantBetaId)
      .select();

    expect(prodUpdateData?.length ?? 0).toBe(0);

    // User Alpha attempts to insert a product for Tenant Beta
    const { data: insertData, error: insertErr } = await alphaUserClient
      .from('products')
      .insert({
        tenant_id: tenantBetaId,
        title: 'Alpha Illegal Injection on Beta',
        slug: `alpha-illegal-on-beta-${timestamp}`,
        price: 100
      })
      .select();

    // RLS WITH CHECK policy rejects insertion for unauthorized tenant
    expect(insertErr).not.toBeNull();
    expect(insertData).toBeNull();
  });

  test('8. Authenticated Positive Operations: User Alpha can read its own records via Data API', async () => {
    // User Alpha reads its own tenant record
    const { data: tenantData, error: tenantErr } = await alphaUserClient
      .from('tenants')
      .select('id, slug, name, metadata')
      .eq('slug', TENANT_ALPHA_SLUG)
      .single();

    expect(tenantErr).toBeNull();
    expect(tenantData).toBeDefined();
    expect(tenantData.slug).toBe(TENANT_ALPHA_SLUG);
    expect(tenantData.name).toBe('Exposure Alpha Systems');
    // Authenticated owner CAN access its own metadata
    expect(tenantData.metadata).toBeDefined();
    expect(tenantData.metadata.capi_token).toBe('secret_capi_alpha_token_789');

    // User Alpha reads its own products
    const { data: prodsData, error: prodsErr } = await alphaUserClient
      .from('products')
      .select('id, tenant_id, title, slug, price, status')
      .eq('tenant_id', tenantAlphaId);

    expect(prodsErr).toBeNull();
    expect(prodsData).toBeDefined();
    expect(prodsData?.length).toBeGreaterThanOrEqual(1);
    const myProd = prodsData?.find((p: any) => p.slug === PROD_ACTIVE_SLUG);
    expect(myProd).toBeDefined();
    expect(myProd.price).toBe(150000);
  });
});
