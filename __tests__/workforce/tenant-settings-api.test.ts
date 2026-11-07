/**
 * __tests__/workforce/tenant-settings-api.test.ts
 * BWM Gate 1 Round 3O: Database-Backed Session Authorization & Strict Secret Boundaries on Settings API
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
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';
import {
  GET as getSettings,
  PUT as updateSettings,
} from '@/app/api/v1/tenants/[slug]/settings/route';

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
    throw new Error('STAGING_DB_REQUIRED: Staging connection required for settings api tests');
  }
  return connStr;
}

describe('BWM Gate 1 Round 3O — Database-Backed Session Authorization & Strict Secret Boundaries on Settings API', () => {
  let pgClient: Client;
  const timestamp = Date.now();
  const slugA = `settings-sec-a-${timestamp}`;
  const slugB = `settings-sec-b-${timestamp}`;
  let tenantAId: string;
  let tenantBId: string;

  const USER_OWNER_A = crypto.randomUUID();
  const USER_REVOKED_A = crypto.randomUUID();
  const USER_DOWNGRADED_A = crypto.randomUUID();
  const USER_MERCHANT_A = crypto.randomUUID();
  const USER_OPERATOR_A = crypto.randomUUID();
  const USER_CS_A = crypto.randomUUID();
  const USER_OWNER_B = crypto.randomUUID();

  let tokenOwnerA: string;
  let tokenRevokedA: string;
  let tokenDowngradedA: string;
  let tokenMerchantA: string;
  let tokenOperatorA: string;
  let tokenCSA: string;
  let tokenOwnerB: string;

  const TEST_MACHINE_SECRET = 'bt_admin_internal_secret_staging_key_2026_minimum_32!';
  let originalAdminSecret: string | undefined;

  beforeAll(async () => {
    originalAdminSecret = process.env.ADMIN_INTERNAL_SECRET;
    process.env.ADMIN_INTERNAL_SECRET = TEST_MACHINE_SECRET;

    pgClient = new Client({ connectionString: getDatabaseConnectionString() });
    await pgClient.connect();
    await pgClient.query('SET search_path TO workforce_staging, public');

    // 1. Provision target Tenant A with rich financial & integration secrets
    const tARes = await pgClient.query(`
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, subscription_status, is_active,
        public_storefront_enabled, metadata, phone, whatsapp_number, waba_phone_number_id,
        qris_image_url, bio
      ) VALUES (
        $1, 'Fortress Alpha Defense', 'security', 'PRO_SCALE', 'active', 'active',
        TRUE, TRUE,
        '{
          "store_name": "Fortress Alpha Store",
          "bank": {"bank_name": "BCA", "account_number": "1234567890", "account_holder": "PT Fortress Alpha"},
          "bank_accounts": [{"bank_name": "BCA", "account_number": "1234567890", "account_holder": "PT Fortress Alpha"}],
          "payment_config": {"secret_key": "PAY_SEC_KEY_888", "enable_manual_transfer": true},
          "capi_token": "EAAX_TEST_CAPI_TOKEN_999",
          "tracking": {"meta_capi_token": "EAAX_TEST_CAPI_TOKEN_999", "pixel_id": "PIXEL_888"},
          "ads_tracking_config": {"meta_capi_token": "EAAX_TEST_CAPI_TOKEN_999", "pixel_id": "PIXEL_888"},
          "waba_config": {"phone_number_id": "WABA_TEST_ID_123", "waba_id": "WABA_ACC_999", "permanent_access_token": "EAAG_TEST_WABA_TOKEN_777", "access_token": "EAAG_TEST_WABA_TOKEN_777"},
          "waba_access_token": "EAAG_TEST_WABA_TOKEN_777",
          "is_bank_transfer_active": true,
          "is_qris_active": true,
          "raw_qris_string": "00020101021126580016ID.CO.QRIS.WWW0118936000020110000000021500000000000000005204581253033605802ID5914FORTRESS ALPHA6007JAKARTA6304ABCD"
        }'::jsonb,
        '+628111222333', '+628111222333', 'WABA_TEST_ID_123',
        'https://img.boontrack.com/qris/fortress-alpha.png',
        'Official Fortress Alpha Security Equipment'
      ) RETURNING id
    `, [slugA]);
    tenantAId = tARes.rows[0].id;

    // 2. Provision target Tenant B for cross-tenant isolation testing
    const tBRes = await pgClient.query(`
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, subscription_status, is_active,
        public_storefront_enabled, metadata, phone, whatsapp_number
      ) VALUES (
        $1, 'Fortress Beta Shield', 'security', 'SOLO', 'active', 'active',
        TRUE, TRUE,
        '{"store_name": "Fortress Beta Store"}'::jsonb,
        '+628999888777', '+628999888777'
      ) RETURNING id
    `, [slugB]);
    tenantBId = tBRes.rows[0].id;

    // 3. Provision database memberships in SSOT table
    await pgClient.query(`
      INSERT INTO workforce_staging.tenant_memberships (user_id, tenant_id, tenant_slug, role, is_active)
      VALUES 
        ($1, $2, $3, 'OWNER', TRUE),
        ($4, $5, $6, 'OWNER', FALSE),
        ($7, $8, $9, 'MERCHANT', TRUE),
        ($10, $11, $12, 'MERCHANT', TRUE),
        ($13, $14, $15, 'OPERATOR', TRUE),
        ($16, $17, $18, 'CS', TRUE),
        ($19, $20, $21, 'OWNER', TRUE)
    `, [
      USER_OWNER_A, tenantAId, slugA,
      USER_REVOKED_A, tenantAId, slugA,
      USER_DOWNGRADED_A, tenantAId, slugA, // DB role is MERCHANT
      USER_MERCHANT_A, tenantAId, slugA,
      USER_OPERATOR_A, tenantAId, slugA,
      USER_CS_A, tenantAId, slugA,
      USER_OWNER_B, tenantBId, slugB,
    ]);

    // 4. Mint cryptographic session tokens
    tokenOwnerA = signMerchantSessionToken({
      tenantSlug: slugA,
      tenantId: tenantAId,
      userId: USER_OWNER_A,
      role: 'OWNER',
    });

    tokenRevokedA = signMerchantSessionToken({
      tenantSlug: slugA,
      tenantId: tenantAId,
      userId: USER_REVOKED_A,
      role: 'OWNER',
    });

    // Token claims 'OWNER', but DB membership is 'MERCHANT' (Role Downgrade scenario)
    tokenDowngradedA = signMerchantSessionToken({
      tenantSlug: slugA,
      tenantId: tenantAId,
      userId: USER_DOWNGRADED_A,
      role: 'OWNER',
    });

    tokenMerchantA = signMerchantSessionToken({
      tenantSlug: slugA,
      tenantId: tenantAId,
      userId: USER_MERCHANT_A,
      role: 'MERCHANT',
    });

    tokenOperatorA = signMerchantSessionToken({
      tenantSlug: slugA,
      tenantId: tenantAId,
      userId: USER_OPERATOR_A,
      role: 'OPERATOR',
    });

    tokenCSA = signMerchantSessionToken({
      tenantSlug: slugA,
      tenantId: tenantAId,
      userId: USER_CS_A,
      role: 'CS',
    });

    tokenOwnerB = signMerchantSessionToken({
      tenantSlug: slugB,
      tenantId: tenantBId,
      userId: USER_OWNER_B,
      role: 'OWNER',
    });
  }, 30000);

  afterAll(async () => {
    try {
      if (originalAdminSecret !== undefined) {
        process.env.ADMIN_INTERNAL_SECRET = originalAdminSecret;
      } else {
        delete process.env.ADMIN_INTERNAL_SECRET;
      }
      if (pgClient) {
        await pgClient.query('DELETE FROM workforce_staging.tenant_memberships WHERE tenant_slug IN ($1, $2)', [slugA, slugB]);
        await pgClient.query('DELETE FROM workforce_staging.tenants WHERE slug IN ($1, $2)', [slugA, slugB]);
        await pgClient.end();
      }
    } catch (cleanErr) {
      console.warn('[CLEANUP_WARN] Cleanup failed:', cleanErr);
    }
  });

  // ── TEST 1: REVOKED ACTIVE TOKEN TEST (FAIL-CLOSED) ──────────────────────
  test('1a. Revoked active membership token is rejected with 403 on GET settings', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenRevokedA}` },
    });

    const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/Forbidden|Revoked|dicabut|dinonaktifkan/i);
  });

  test('1b. Revoked active membership token is rejected with 403 on PUT settings', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `bt_merchant_token=${tokenRevokedA}`,
      },
      body: JSON.stringify({ bio: 'Attacker attempting mutation via revoked session' }),
    });

    const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  // ── TEST 2: DOWNGRADED ROLE TEST (DB SSOT AUTHORITY OVER TOKEN CLAIMS) ────
  test('2a. Downgraded user (Token OWNER, DB MERCHANT) gets masked secrets on GET settings', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenDowngradedA}` },
    });

    const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Operational fields must be visible
    expect(json.settings.slug).toBe(slugA);
    expect(json.settings.name).toBe('Fortress Alpha Defense');

    // Financial & Integration secrets MUST be strictly redacted/null
    expect(json.settings.bank).toBeNull();
    expect(json.settings.bank_accounts).toBeNull();
    expect(json.settings.payment_config).toBeNull();
    expect(json.settings.capi_token).toBeNull();
    expect(json.settings.waba_config.access_token).toBeNull();
    expect(json.settings.waba_config.permanent_access_token).toBeNull();
    expect(json.settings.metadata.bank).toBeNull();
    expect(json.settings.metadata.bank_accounts).toBeNull();
    expect(json.settings.metadata.capi_token).toBeNull();

    // Migration 010 Parity: Phone and communication IDs redacted for MERCHANT
    expect(json.settings.phone).toBeNull();
    expect(json.settings.whatsapp_number).toBeNull();
    expect(json.settings.waba_phone_number_id).toBeNull();
    expect(json.settings.telegram_chat_id).toBeNull();
    expect(json.settings.integration).toBeNull();
  });

  test('2b. Downgraded user (Token OWNER, DB MERCHANT) is rejected with 403 when attempting to update bank or secrets', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `bt_merchant_token=${tokenDowngradedA}`,
      },
      body: JSON.stringify({
        bank_accounts: [{ bank_name: 'Mandiri', account_number: '999888777', account_holder: 'Hacker Exfiltration' }],
      }),
    });

    const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/Only tenant OWNER can mutate financial.*(credentials|configurations)/i);
  });

  test('2c. Downgraded user (Token OWNER, DB MERCHANT) is rejected with 403 when updating CAPI or tracking secrets', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `bt_merchant_token=${tokenDowngradedA}`,
      },
      body: JSON.stringify({
        capi_token: 'EAAX_ILLEGAL_OVERWRITE',
      }),
    });

    const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/Only tenant OWNER can mutate financial.*(credentials|configurations)/i);
  });

  // ── TEST 3: LEGITIMATE OWNER OPERATIONS ──────────────────────────────────
  test('3a. Legitimate OWNER reads unmasked credentials on GET settings', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
    });

    const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Unmasked access to credentials for legitimate OWNER
    expect(json.settings.bank).toBeDefined();
    expect(json.settings.bank.account_number).toBe('1234567890');
    expect(json.settings.capi_token).toBe('EAAX_TEST_CAPI_TOKEN_999');
    expect(json.settings.waba_config.permanent_access_token).toBe('EAAG_TEST_WABA_TOKEN_777');
    expect(json.settings.is_qris_active).toBe(true);
    expect(json.settings.phone).toBe('+628111222333');
    expect(json.settings.whatsapp_number).toBe('+628111222333');
    expect(json.settings.waba_phone_number_id).toBe('WABA_TEST_ID_123');
  });

  test('3b. Legitimate OWNER can update bank accounts and store settings', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `bt_merchant_token=${tokenOwnerA}`,
      },
      body: JSON.stringify({
        bank_accounts: [
          { bank_name: 'BCA', account_number: '8888777766', account_holder: 'PT Fortress Alpha Primary' },
        ],
        store_name: 'Fortress Alpha Prime HQ',
      }),
    });

    const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toMatch(/berhasil diperbarui/i);
  });

  // ── TEST 4: LEGITIMATE MERCHANT PROFILE UPDATE ───────────────────────────
  test('4a. Legitimate MERCHANT can update non-sensitive operational profile fields (bio & faqs)', async () => {
    const updatedBio = 'Fortress Alpha — Leading perimeter defense and tactical surveillance.';
    const updatedFaqs = [
      { question: 'What is the deployment warranty?', answer: 'Lifetime tactical support.' },
    ];

    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `bt_merchant_token=${tokenMerchantA}`,
      },
      body: JSON.stringify({
        bio: updatedBio,
        faqs: updatedFaqs,
      }),
    });

    const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Verify sanitized response for MERCHANT caller role (no leaked secrets in response)
    expect(json.settings.bank).toBeNull();
    expect(json.settings.capi_token).toBeFalsy();

    // Verify persistence in subsequent OWNER GET
    const verifyReq = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
    });
    const verifyRes = await getSettings(verifyReq, { params: Promise.resolve({ slug: slugA }) });
    expect(verifyRes.status).toBe(200);
    const verifyJson = await verifyRes.json();
    expect(verifyJson.settings.description || verifyJson.settings.metadata?.bio || verifyJson.settings.faqs).toBeDefined();
  });

  // ── TEST 5: CROSS-TENANT ISOLATION ────────────────────────────────────────
  test('5a. Cross-tenant token is rejected with 403/404 on GET settings', async () => {
    // Tenant A token attempting to access Tenant B settings
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugB}/settings`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
    });

    const res = await getSettings(req, { params: Promise.resolve({ slug: slugB }) });
    expect([403, 404]).toContain(res.status);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  test('5b. Cross-tenant token is rejected with 403/404 on PUT settings', async () => {
    // Tenant A token attempting to mutate Tenant B settings
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugB}/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `bt_merchant_token=${tokenOwnerA}`,
      },
      body: JSON.stringify({ bio: 'Cross-tenant illegal tampering' }),
    });

    const res = await updateSettings(req, { params: Promise.resolve({ slug: slugB }) });
    expect([403, 404]).toContain(res.status);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  // ── TEST 6: OPERATIONAL STAFF ROLE BOUNDARIES (OPERATOR & CS) ────────────
  test('6a. OPERATOR receives read-only operational whitelist with all secrets and QRIS redacted', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenOperatorA}` },
    });

    const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    expect(json.settings.bank).toBeNull();
    expect(json.settings.bank_accounts).toBeNull();
    expect(json.settings.payment_config).toBeNull();
    expect(json.settings.capi_token).toBeNull();
    expect(json.settings.qris_image_url).toBeNull();
    expect(json.settings.is_qris_active).toBe(false);
  });

  test('6b. OPERATOR is rejected with 403 when attempting PUT settings', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `bt_merchant_token=${tokenOperatorA}`,
      },
      body: JSON.stringify({ bio: 'Operator attempted mutation' }),
    });

    const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  // ── TEST 7: INTERNAL MACHINE AUTHENTICATION SCOPE BOUNDS (Round 3P) ──────
  test('7a. Machine Auth Negative: Valid internal secret + MISSING x-target-tenant fails closed (401/403)', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: {
        'x-internal-secret': TEST_MACHINE_SECRET,
        'x-machine-operation': 'READ_TENANT_SETTINGS',
        // MISSING x-target-tenant
      },
    });

    const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect([401, 403]).toContain(res.status);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  test('7b. Machine Auth Negative: Valid internal secret + WRONG target tenant slug fails closed (403)', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: {
        'x-internal-secret': TEST_MACHINE_SECRET,
        'x-target-tenant': 'unauthorized-adversary-tenant',
        'x-machine-operation': 'READ_TENANT_SETTINGS',
      },
    });

    const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/target tenant/i);
  });

  test('7c. Machine Auth Negative: Valid internal secret + WRONG operation header on PUT fails closed (403)', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': TEST_MACHINE_SECRET,
        'x-target-tenant': slugA,
        'x-machine-operation': 'READ_TENANT_SETTINGS', // Unauthorized operation for mutation
      },
      body: JSON.stringify({ name: 'Machine Wrong Op Name' }),
    });

    const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/operation does not match/i);
  });

  test('7d. Machine Auth Positive: Valid internal secret + MATCHING slug & operation succeeds (200)', async () => {
    // 1. Scoped Machine GET
    const getReq = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: {
        'x-internal-secret': TEST_MACHINE_SECRET,
        'x-target-tenant': slugA,
        'x-machine-operation': 'READ_TENANT_SETTINGS',
      },
    });

    const getRes = await getSettings(getReq, { params: Promise.resolve({ slug: slugA }) });
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.success).toBe(true);
    expect(getJson.settings.slug).toBe(slugA);
    expect(getJson.settings.name).toBeDefined();
    expect(getJson.settings.phone).toBe('+628111222333');

    // 2. Scoped Machine PUT
    const putReq = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': TEST_MACHINE_SECRET,
        'x-target-tenant': slugA,
        'x-machine-operation': 'UPDATE_TENANT_SETTINGS',
      },
      body: JSON.stringify({
        bio: 'Updated via Scoped Machine Auth 2026',
      }),
    });

    const putRes = await updateSettings(putReq, { params: Promise.resolve({ slug: slugA }) });
    expect(putRes.status).toBe(200);
    const putJson = await putRes.json();
    expect(putJson.success).toBe(true);
  });

  // ── TEST 8: GET PARITY ASSERTION FOR MERCHANT (Migration 010 Parity) ──────
  test('8a. GET Parity: Query GET settings as MERCHANT returns strictly masked communication and identity fields', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenMerchantA}` },
    });

    const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Migration 010 Parity assertions: strictly null or undefined
    expect(json.settings.phone).toBeNull();
    expect(json.settings.whatsapp_number).toBeNull();
    expect(json.settings.waba_phone_number_id).toBeNull();
    expect(json.settings.telegram_chat_id).toBeNull();
    expect(json.settings.bank_accounts).toBeNull();
    expect(json.settings.payment_config).toBeNull();
    expect(json.settings.capi_token).toBeNull();
    expect(json.settings.integration).toBeNull();
    expect(json.settings.gateway_config?.metadata).toBeNull();
  });

  test('8b. GET Parity: Query GET settings as OWNER returns unmasked communication and identity fields', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
    });

    const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    expect(json.settings.phone).toBe('+628111222333');
    expect(json.settings.whatsapp_number).toBe('+628111222333');
    expect(json.settings.waba_phone_number_id).toBe('WABA_TEST_ID_123');
  });

  // ── TEST 9: PUT SENSITIVE INTEGRATION ATTEMPT BY MERCHANT (STRICT ALLOWLIST)
  test('9a. PUT Sensitive Integration Attempt by MERCHANT with top-level integration is rejected (403)', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `bt_merchant_token=${tokenMerchantA}`,
      },
      body: JSON.stringify({
        integration: { webhook_url: 'https://evil.com' },
      }),
    });

    const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/Only tenant OWNER can mutate financial, identity, or integration configurations/i);
  });

  test('9b. PUT Sensitive Integration Attempt by MERCHANT with metadata.integration is rejected (403)', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `bt_merchant_token=${tokenMerchantA}`,
      },
      body: JSON.stringify({
        metadata: { integration: { token: 'abc-secret' } },
      }),
    });

    const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/Only tenant OWNER can mutate financial, identity, or integration configurations/i);
  });

  test('9c. PUT Allowed Profile Fields by MERCHANT ({ bio: "Updated Bio" }) succeeds (200)', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `bt_merchant_token=${tokenMerchantA}`,
      },
      body: JSON.stringify({
        bio: 'Updated Bio for Fortress Alpha Defense',
      }),
    });

    const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toMatch(/berhasil diperbarui/i);
  });
});
