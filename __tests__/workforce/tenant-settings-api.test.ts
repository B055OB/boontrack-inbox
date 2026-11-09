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
import { assertStagingDatabaseTarget } from '@/lib/supabaseClient';
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
  assertStagingDatabaseTarget(connStr);
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
          "theme": {
            "template": "clean",
            "primary_color": "#2563EB",
            "visual_theme": "clean_minimal",
            "internal_secret": "ROUND3R_CANARY_THEME",
            "private_token": "ROUND3R_CANARY_TOKEN"
          },
          "faqs": [
            {
              "id": "faq_canary_1",
              "question": "What is Fortress Alpha?",
              "answer": "Defense systems provider.",
              "internal_secret": "ROUND3R_CANARY_FAQ",
              "private_token": "ROUND3R_CANARY_FAQ_TOKEN"
            }
          ],
          "business_hours": {
            "timezone": "Asia/Jakarta",
            "is_always_open": false,
            "internal_secret": "ROUND3R_CANARY_HOURS",
            "days": {
              "monday": {
                "open": "08:00",
                "close": "17:00",
                "is_open": true,
                "nested_secret": "ROUND3R_CANARY_HOURS_NESTED"
              }
            }
          },
          "catalog_preferences": {
            "default_sort": "newest",
            "show_prices": true,
            "internal_secret": "ROUND3R_CANARY_CATALOG",
            "admin_notes": "ROUND3R_CANARY_CATALOG_ADMIN"
          },
          "public_links": [
            {
              "title": "Official Portal",
              "url": "https://fortress.boontrack.com",
              "internal_secret": "ROUND3R_CANARY_LINKS",
              "api_token": "ROUND3R_CANARY_LINKS_TOKEN"
            }
          ],
          "unknown_canary_key": "ROUND3R_CANARY_ROOT",
          "arbitrary_internal_metadata": "ROUND3R_CANARY_METADATA",
          "bank": {"bank_name": "BCA", "account_number": "1234567890", "account_holder": "PT Fortress Alpha"},
          "bank_accounts": [{"bank_name": "BCA", "account_number": "1234567890", "account_holder": "PT Fortress Alpha"}],
          "payment_config": {"secret_key": "PAY_SEC_KEY_888", "enable_manual_transfer": true},
          "capi_token": "EAAX_TEST_CAPI_TOKEN_999",
          "tracking": {"meta_capi_token": "EAAX_TEST_CAPI_TOKEN_999", "pixel_id": "PIXEL_888"},
          "ads_tracking_config": {"meta_capi_token": "EAAX_TEST_CAPI_TOKEN_999", "pixel_id": "PIXEL_888"},
          "waba_config": {"phone_number_id": "WABA_TEST_ID_123", "waba_id": "WABA_ACC_999", "permanent_access_token": "EAAG_TEST_WABA_TOKEN_777", "access_token": "EAAG_TEST_WABA_TOKEN_777"},
          "waba_access_token": "EAAG_TEST_WABA_TOKEN_777",
          "waba_id": "WABA_ACC_999",
          "whatsapp_phone_number_id": "456",
          "waba_account_id": "789",
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

    // Financial & Integration secrets MUST be strictly redacted/null/undefined (Round 3Q True Allowlist Projection)
    expect(json.settings.bank).toBeNull();
    expect(json.settings.bank_accounts).toBeNull();
    expect(json.settings.payment_config).toBeNull();
    expect(json.settings.capi_token).toBeNull();
    expect(json.settings.waba_config).toBeFalsy();
    expect(json.settings.metadata.bank).toBeUndefined();
    expect(json.settings.metadata.bank_accounts).toBeUndefined();
    expect(json.settings.metadata.capi_token).toBeUndefined();
    expect(json.settings.metadata.waba_config).toBeUndefined();

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

  test('7e. Machine Auth Negative: Valid internal secret + legacy alias x-tenant-slug or x-tenant-id strictly fails closed (403)', async () => {
    // Attempting M2M auth with legacy alias x-tenant-slug
    const reqSlug = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: {
        'x-internal-secret': TEST_MACHINE_SECRET,
        'x-tenant-slug': slugA, // Legacy alias - rejected on M2M ingress
        'x-machine-operation': 'READ_TENANT_SETTINGS',
      },
    });

    const resSlug = await getSettings(reqSlug, { params: Promise.resolve({ slug: slugA }) });
    expect([401, 403]).toContain(resSlug.status);
    const jsonSlug = await resSlug.json();
    expect(jsonSlug.success).toBe(false);

    // Attempting M2M auth with legacy alias x-tenant-id
    const reqId = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: {
        'x-internal-secret': TEST_MACHINE_SECRET,
        'x-tenant-id': slugA, // Legacy alias - rejected on M2M ingress
        'x-machine-operation': 'READ_TENANT_SETTINGS',
      },
    });

    const resId = await getSettings(reqId, { params: Promise.resolve({ slug: slugA }) });
    expect([401, 403]).toContain(resId.status);
    const jsonId = await resId.json();
    expect(jsonId.success).toBe(false);
  });

  test('7f. Machine Auth Negative: Valid internal secret + legacy alias x-internal-operation strictly fails closed (403)', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: {
        'x-internal-secret': TEST_MACHINE_SECRET,
        'x-target-tenant': slugA,
        'x-internal-operation': 'READ_TENANT_SETTINGS', // Legacy alias - rejected on M2M ingress
      },
    });

    const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect([401, 403]).toContain(res.status);
    const json = await res.json();
    expect(json.success).toBe(false);
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
    expect(json.settings.gateway_config).toBeNull();
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

  // ── TEST 10: TRUE ALLOWLIST PROJECTION & DEEP METADATA SANITIZATION (Round 3Q) ─
  test('10a. Deep Metadata Leakage Assertion: MERCHANT receives clean projection with nested metadata redacted', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenMerchantA}` },
    });

    const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Deep metadata leakage assertions: strict allowlist projection ensures undefined
    expect(json.settings.metadata.waba_config).toBeUndefined();
    expect(json.settings.metadata.waba_id).toBeUndefined();
    expect(json.settings.metadata.whatsapp_phone_number_id).toBeUndefined();
    expect(json.settings.metadata.waba_account_id).toBeUndefined();

    // Top-level communications and identifiers strictly null
    expect(json.settings.phone).toBeNull();
    expect(json.settings.whatsapp_number).toBeNull();
    expect(json.settings.waba_phone_number_id).toBeNull();
    expect(json.settings.telegram_chat_id).toBeNull();
  });

  test('10b. Deep Metadata Leakage Assertion: OPERATOR receives clean projection with nested metadata redacted', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenOperatorA}` },
    });

    const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Deep metadata leakage assertions for OPERATOR
    expect(json.settings.metadata.waba_config).toBeUndefined();
    expect(json.settings.metadata.waba_id).toBeUndefined();
    expect(json.settings.metadata.whatsapp_phone_number_id).toBeUndefined();
    expect(json.settings.metadata.waba_account_id).toBeUndefined();

    // Top-level communications and identifiers strictly null
    expect(json.settings.phone).toBeNull();
    expect(json.settings.whatsapp_number).toBeNull();
    expect(json.settings.waba_phone_number_id).toBeNull();
    expect(json.settings.telegram_chat_id).toBeNull();
  });

  test('10c. Deep Metadata Leakage Assertion: CS receives clean projection with nested metadata redacted', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenCSA}` },
    });

    const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Deep metadata leakage assertions for CS
    expect(json.settings.metadata.waba_config).toBeUndefined();
    expect(json.settings.metadata.waba_id).toBeUndefined();
    expect(json.settings.metadata.whatsapp_phone_number_id).toBeUndefined();
    expect(json.settings.metadata.waba_account_id).toBeUndefined();

    // Top-level communications and identifiers strictly null
    expect(json.settings.phone).toBeNull();
    expect(json.settings.whatsapp_number).toBeNull();
    expect(json.settings.waba_phone_number_id).toBeNull();
    expect(json.settings.telegram_chat_id).toBeNull();
  });

  test('10d. OWNER Positive Control: OWNER receives complete metadata intact', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
    });

    const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // OWNER receives complete metadata and unmasked credentials
    expect(json.settings.metadata.waba_config).toBeDefined();
    expect(json.settings.metadata.waba_config.waba_id).toBe('WABA_ACC_999');
    expect(json.settings.metadata.whatsapp_phone_number_id).toBe('456');
    expect(json.settings.metadata.waba_account_id).toBe('789');

    // Unmasked top-level fields for OWNER
    expect(json.settings.phone).toBe('+628111222333');
    expect(json.settings.whatsapp_number).toBe('+628111222333');
    expect(json.settings.waba_phone_number_id).toBe('WABA_TEST_ID_123');
    expect(json.settings.capi_token).toBe('EAAX_TEST_CAPI_TOKEN_999');
    expect(json.settings.bank).toBeDefined();
    expect(json.settings.bank.account_number).toBe('1234567890');
  });

  // ── TEST 11: ROUND 3R NESTED DTO SECURITY PROJECTION & ADVERSARIAL MATRIX ──
  describe('11. Round 3R Nested DTO Security Projection & Adversarial Matrix', () => {
    const seedCanaries = async () => {
      await pgClient.query(`
        UPDATE workforce_staging.tenants
        SET metadata = metadata || jsonb_build_object(
          'theme', jsonb_build_object(
            'template', 'clean',
            'primary_color', '#2563EB',
            'visual_theme', 'clean_minimal',
            'internal_secret', 'ROUND3R_CANARY_THEME',
            'private_token', 'ROUND3R_CANARY_TOKEN'
          ),
          'faqs', jsonb_build_array(
            jsonb_build_object(
              'id', 'faq_canary_1',
              'question', 'What is Fortress Alpha?',
              'answer', 'Defense systems provider.',
              'internal_secret', 'ROUND3R_CANARY_FAQ',
              'private_token', 'ROUND3R_CANARY_FAQ_TOKEN'
            )
          ),
          'business_hours', jsonb_build_object(
            'timezone', 'Asia/Jakarta',
            'is_always_open', false,
            'internal_secret', 'ROUND3R_CANARY_HOURS',
            'days', jsonb_build_object(
              'monday', jsonb_build_object(
                'open', '08:00',
                'close', '17:00',
                'is_open', true,
                'nested_secret', 'ROUND3R_CANARY_HOURS_NESTED'
              )
            )
          ),
          'catalog_preferences', jsonb_build_object(
            'default_sort', 'newest',
            'show_prices', true,
            'internal_secret', 'ROUND3R_CANARY_CATALOG',
            'admin_notes', 'ROUND3R_CANARY_CATALOG_ADMIN'
          ),
          'public_links', jsonb_build_array(
            jsonb_build_object(
              'title', 'Official Portal',
              'url', 'https://fortress.boontrack.com',
              'internal_secret', 'ROUND3R_CANARY_LINKS',
              'api_token', 'ROUND3R_CANARY_LINKS_TOKEN'
            )
          ),
          'unknown_canary_key', 'ROUND3R_CANARY_ROOT',
          'arbitrary_internal_metadata', 'ROUND3R_CANARY_METADATA'
        )
        WHERE slug = $1
      `, [slugA]);
    };

    beforeAll(async () => {
      await seedCanaries();
    });

    test('11a. Round 3R Adversarial Test: MERCHANT receives nested DTO projections and zero canary leakage', async () => {
      await seedCanaries();
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenMerchantA}` },
    });

    const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // 1. Positive assertions on legitimate operational attributes
    expect(json.settings.theme).toBeDefined();
    expect(json.settings.theme.template).toBe('clean');
    expect(json.settings.theme.primary_color).toBe('#2563EB');
    expect(json.settings.theme.visual_theme).toBe('clean_minimal');

    expect(Array.isArray(json.settings.faqs)).toBe(true);
    expect(json.settings.faqs.length).toBeGreaterThan(0);
    expect(json.settings.faqs[0].question).toBe('What is Fortress Alpha?');
    expect(json.settings.faqs[0].answer).toBe('Defense systems provider.');

    expect(json.settings.metadata.business_hours).toBeDefined();
    expect(json.settings.metadata.business_hours.timezone).toBe('Asia/Jakarta');
    expect(json.settings.metadata.business_hours.days.monday.open).toBe('08:00');

    expect(json.settings.metadata.catalog_preferences).toBeDefined();
    expect(json.settings.metadata.catalog_preferences.default_sort).toBe('newest');

    expect(Array.isArray(json.settings.metadata.public_links)).toBe(true);
    expect(json.settings.metadata.public_links[0].url).toBe('https://fortress.boontrack.com');

    // 2. Negative assertions on specific canary and sensitive properties
    expect(json.settings.theme.internal_secret).toBeUndefined();
    expect(json.settings.theme.private_token).toBeUndefined();
    expect(json.settings.faqs[0].internal_secret).toBeUndefined();
    expect(json.settings.faqs[0].private_token).toBeUndefined();
    expect(json.settings.metadata.business_hours.internal_secret).toBeUndefined();
    expect(json.settings.metadata.business_hours.days.monday.nested_secret).toBeUndefined();
    expect(json.settings.metadata.catalog_preferences.internal_secret).toBeUndefined();
    expect(json.settings.metadata.catalog_preferences.admin_notes).toBeUndefined();
    expect(json.settings.metadata.public_links[0].internal_secret).toBeUndefined();
    expect(json.settings.metadata.public_links[0].api_token).toBeUndefined();
    expect(json.settings.unknown_canary_key).toBeUndefined();
    expect(json.settings.metadata.arbitrary_internal_metadata).toBeUndefined();

    // 3. Whole-serialized response assertion guaranteeing zero canary leakage
    const serialized = JSON.stringify(json.settings);
    expect(serialized).not.toContain('ROUND3R_CANARY');
    expect(serialized).not.toContain('ROUND3R_PRIVATE_TOKEN');
  });

  test('11b. Round 3R Adversarial Test: OPERATOR receives nested DTO projections and zero canary leakage', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenOperatorA}` },
    });

    const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    expect(json.settings.theme.template).toBe('clean');
    expect(json.settings.faqs[0].question).toBe('What is Fortress Alpha?');
    expect(json.settings.metadata.business_hours.timezone).toBe('Asia/Jakarta');

    const serialized = JSON.stringify(json.settings);
    expect(serialized).not.toContain('ROUND3R_CANARY');
    expect(serialized).not.toContain('ROUND3R_PRIVATE_TOKEN');
  });

  test('11c. Round 3R Adversarial Test: CS receives nested DTO projections and zero canary leakage', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenCSA}` },
    });

    const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    expect(json.settings.theme.template).toBe('clean');
    expect(json.settings.faqs[0].question).toBe('What is Fortress Alpha?');
    expect(json.settings.metadata.business_hours.timezone).toBe('Asia/Jakarta');

    const serialized = JSON.stringify(json.settings);
    expect(serialized).not.toContain('ROUND3R_CANARY');
    expect(serialized).not.toContain('ROUND3R_PRIVATE_TOKEN');
  });

  test('11d. Round 3R Adversarial Test: OWNER Positive Control preserves full nested metadata and all canaries intact', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'GET',
      headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
    });

    const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // OWNER whole-serialized response contains all canary values intact
    const ownerSerialized = JSON.stringify(json.settings);
    expect(ownerSerialized).toContain('ROUND3R_CANARY_THEME');
    expect(ownerSerialized).toContain('ROUND3R_CANARY_FAQ');
    expect(ownerSerialized).toContain('ROUND3R_CANARY_HOURS');
    expect(ownerSerialized).toContain('ROUND3R_CANARY_CATALOG');
    expect(ownerSerialized).toContain('ROUND3R_CANARY_LINKS');
    expect(ownerSerialized).toContain('ROUND3R_CANARY_ROOT');
    expect(ownerSerialized).toContain('ROUND3R_CANARY_METADATA');

    // OWNER retains complete operational and sensitive properties
    expect(json.settings.phone).toBe('+628111222333');
    expect(json.settings.whatsapp_number).toBe('+628111222333');
    expect(json.settings.bank).toBeDefined();
    expect(json.settings.capi_token).toBe('EAAX_TEST_CAPI_TOKEN_999');
  });

  test('11e. Round 3R Mutation Boundary: MERCHANT attempting nested theme secret injection is rejected (403)', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `bt_merchant_token=${tokenMerchantA}`,
      },
      body: JSON.stringify({
        theme: {
          template: 'clean',
          internal_secret: 'ATTACKER_THEME_CANARY',
        },
      }),
    });

    const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/Only tenant OWNER can mutate financial, identity, or integration configurations/i);
  });

  test('11f. Round 3R Mutation Boundary: MERCHANT attempting nested FAQ secret injection is rejected (403)', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `bt_merchant_token=${tokenMerchantA}`,
      },
      body: JSON.stringify({
        faqs: [
          {
            question: 'Valid question?',
            answer: 'Valid answer.',
            secret_key: 'ATTACKER_FAQ_CANARY',
          },
        ],
      }),
    });

    const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/Only tenant OWNER can mutate financial, identity, or integration configurations/i);
  });

  test('11g. Round 3R Mutation Boundary: MERCHANT attempting nested business hours secret injection is rejected (403)', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `bt_merchant_token=${tokenMerchantA}`,
      },
      body: JSON.stringify({
        business_hours: {
          timezone: 'Asia/Jakarta',
          admin_secret: 'ATTACKER_HOURS_CANARY',
        },
      }),
    });

    const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/Only tenant OWNER can mutate financial, identity, or integration configurations/i);
  });

  test('11h. Round 3R Mutation Boundary: MERCHANT legitimate operational update (theme & business_hours) succeeds (200)', async () => {
    const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `bt_merchant_token=${tokenMerchantA}`,
      },
      body: JSON.stringify({
        theme: {
          template: 'clean',
          primary_color: '#10B981',
          visual_theme: 'clean_minimal',
        },
        business_hours: {
          timezone: 'Asia/Jakarta',
          is_always_open: true,
        },
      }),
    });

    const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toMatch(/berhasil diperbarui/i);
  });
  });

  // ── TEST 12: ROUND 3S TARGETED DTO CLOSURE & FULL NESTED VALIDATION ──
  describe('12. Round 3S Targeted DTO Closure, Feature Sanitization & Full Nested Validation', () => {
    const seedRound3SCanaries = async () => {
      await pgClient.query(`
        UPDATE workforce_staging.tenants
        SET metadata = metadata || jsonb_build_object(
          'features', jsonb_build_object(
            'has_capi', true,
            'ads_tracking', true,
            'crm', true,
            'inbox', true,
            'ai_bot', true,
            'ROUND3S_CANARY_FEATURE', 'canary_feature_secret_val',
            'internal_secret', 'ROUND3S_FEATURE_INTERNAL_SECRET',
            'private_token', 'ROUND3S_FEATURE_PRIVATE_TOKEN',
            'unknown_nested_obj', jsonb_build_object('nested_canary', 'ROUND3S_NESTED_CANARY'),
            'unknown_nested_arr', jsonb_build_array('ROUND3S_ARRAY_CANARY_1', 'ROUND3S_ARRAY_CANARY_2')
          ),
          'theme', jsonb_build_object(
            'template', 'clean',
            'primary_color', '#2563EB',
            'secondary_color', '#3B82F6',
            'visual_theme', 'clean_minimal',
            'layout_style', 'grid'
          ),
          'faqs', jsonb_build_array(
            jsonb_build_object(
              'id', 'faq_round3s_1',
              'question', 'What is Round 3S Security?',
              'answer', 'Targeted DTO closure and alignment.',
              'category', 'Security'
            )
          ),
          'business_hours', jsonb_build_object(
            'timezone', 'Asia/Jakarta',
            'is_always_open', false,
            'days', jsonb_build_object(
              'monday', jsonb_build_object('open', '08:00', 'close', '17:00', 'is_open', true)
            ),
            'schedule', jsonb_build_array(
              jsonb_build_object('day', 'monday', 'open', '08:00', 'close', '17:00', 'is_open', true)
            )
          ),
          'catalog_preferences', jsonb_build_object(
            'default_sort', 'newest',
            'show_prices', true,
            'items_per_page', 20,
            'display_mode', 'grid',
            'featured_category_ids', jsonb_build_array('cat_1', 'cat_2')
          ),
          'public_links', jsonb_build_array(
            jsonb_build_object(
              'title', 'Official Instagram',
              'url', 'https://instagram.com/fortress_alpha',
              'platform', 'instagram'
            )
          )
        )
        WHERE slug = $1
      `, [slugA]);
    };

    beforeAll(async () => {
      await seedRound3SCanaries();
    });

    test('12a. Round 3S Adversarial Test: MERCHANT receives constructive features DTO and zero canary leakage', async () => {
      await seedRound3SCanaries();
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
        method: 'GET',
        headers: { cookie: `bt_merchant_token=${tokenMerchantA}` },
      });

      const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Legitimate features preserved
      expect(json.settings.features).toBeDefined();
      expect(json.settings.features.has_capi).toBe(true);
      expect(json.settings.features.ads_tracking).toBe(true);
      expect(json.settings.features.crm).toBe(true);
      expect(json.settings.features.inbox).toBe(true);
      expect(json.settings.features.ai_bot).toBe(true);

      // Unknown keys, canaries, and nested structures strictly stripped
      expect(json.settings.features.ROUND3S_CANARY_FEATURE).toBeUndefined();
      expect(json.settings.features.internal_secret).toBeUndefined();
      expect(json.settings.features.private_token).toBeUndefined();
      expect(json.settings.features.unknown_nested_obj).toBeUndefined();
      expect(json.settings.features.unknown_nested_arr).toBeUndefined();

      // Serialized assertion: Zero canary leakage in the entire response
      const serialized = JSON.stringify(json.settings);
      expect(serialized).not.toContain('ROUND3S_CANARY_FEATURE');
      expect(serialized).not.toContain('ROUND3S_FEATURE_INTERNAL_SECRET');
      expect(serialized).not.toContain('ROUND3S_FEATURE_PRIVATE_TOKEN');
      expect(serialized).not.toContain('ROUND3S_NESTED_CANARY');
      expect(serialized).not.toContain('ROUND3S_ARRAY_CANARY');
    });

    test('12b. Round 3S Adversarial Test: OPERATOR receives constructive features DTO and zero canary leakage', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
        method: 'GET',
        headers: { cookie: `bt_merchant_token=${tokenOperatorA}` },
      });

      const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(json.settings.features.has_capi).toBe(true);
      expect(json.settings.features.ROUND3S_CANARY_FEATURE).toBeUndefined();

      const serialized = JSON.stringify(json.settings);
      expect(serialized).not.toContain('ROUND3S_CANARY_FEATURE');
      expect(serialized).not.toContain('ROUND3S_FEATURE_INTERNAL_SECRET');
    });

    test('12c. Round 3S Adversarial Test: CS receives constructive features DTO and zero canary leakage', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
        method: 'GET',
        headers: { cookie: `bt_merchant_token=${tokenCSA}` },
      });

      const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(json.settings.features.has_capi).toBe(true);
      expect(json.settings.features.ROUND3S_CANARY_FEATURE).toBeUndefined();

      const serialized = JSON.stringify(json.settings);
      expect(serialized).not.toContain('ROUND3S_CANARY_FEATURE');
      expect(serialized).not.toContain('ROUND3S_FEATURE_INTERNAL_SECRET');
    });

    test('12d. Round 3S OWNER Positive Control: OWNER receives full features metadata and all canaries intact', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
        method: 'GET',
        headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
      });

      const res = await getSettings(req, { params: Promise.resolve({ slug: slugA }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const ownerSerialized = JSON.stringify(json.settings);
      expect(ownerSerialized).toContain('ROUND3S_CANARY_FEATURE');
      expect(ownerSerialized).toContain('ROUND3S_FEATURE_INTERNAL_SECRET');
      expect(ownerSerialized).toContain('ROUND3S_FEATURE_PRIVATE_TOKEN');
      expect(ownerSerialized).toContain('ROUND3S_NESTED_CANARY');
      expect(ownerSerialized).toContain('ROUND3S_ARRAY_CANARY_1');
      expect(ownerSerialized).toContain('ROUND3S_ARRAY_CANARY_2');
    });

    test('12e. Round 3S Mutation Boundary: MERCHANT injecting unknown key into theme is rejected (403)', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          cookie: `bt_merchant_token=${tokenMerchantA}`,
        },
        body: JSON.stringify({
          theme: {
            template: 'clean',
            attacker_injected_theme_key: 'malicious_theme_payload',
          },
        }),
      });

      const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/Only tenant OWNER can mutate financial, identity, or integration configurations/i);
    });

    test('12f. Round 3S Mutation Boundary: MERCHANT injecting unknown key into FAQ item is rejected (403)', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          cookie: `bt_merchant_token=${tokenMerchantA}`,
        },
        body: JSON.stringify({
          faqs: [
            {
              question: 'Legitimate question?',
              answer: 'Legitimate answer.',
              attacker_faq_key: 'malicious_faq_payload',
            },
          ],
        }),
      });

      const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/Only tenant OWNER can mutate financial, identity, or integration configurations/i);
    });

    test('12g. Round 3S Mutation Boundary: MERCHANT injecting unknown key into root day of business_hours is rejected (403)', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          cookie: `bt_merchant_token=${tokenMerchantA}`,
        },
        body: JSON.stringify({
          business_hours: {
            monday: {
              open: '08:00',
              close: '17:00',
              attacker_root_day_secret: 'malicious_root_day_payload',
            },
          },
        }),
      });

      const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/Only tenant OWNER can mutate financial, identity, or integration configurations/i);
    });

    test('12h. Round 3S Mutation Boundary: MERCHANT injecting unknown key into business_hours schedule[] is rejected (403)', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          cookie: `bt_merchant_token=${tokenMerchantA}`,
        },
        body: JSON.stringify({
          business_hours: {
            schedule: [
              {
                day: 'monday',
                open: '08:00',
                close: '17:00',
                attacker_schedule_secret: 'malicious_schedule_payload',
              },
            ],
          },
        }),
      });

      const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/Only tenant OWNER can mutate financial, identity, or integration configurations/i);
    });

    test('12i. Round 3S Mutation Boundary: MERCHANT injecting non-primitive or unknown key into catalog_preferences is rejected (403)', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          cookie: `bt_merchant_token=${tokenMerchantA}`,
        },
        body: JSON.stringify({
          catalog_preferences: {
            default_sort: 'newest',
            featured_category_ids: [{ nested_attack: 'malicious' }],
          },
        }),
      });

      const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/Only tenant OWNER can mutate financial, identity, or integration configurations/i);
    });

    test('12j. Round 3S Mutation Boundary: MERCHANT injecting unknown key into public_links is rejected (403)', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          cookie: `bt_merchant_token=${tokenMerchantA}`,
        },
        body: JSON.stringify({
          public_links: [
            {
              title: 'Instagram',
              url: 'https://instagram.com/fortress_alpha',
              attacker_link_token: 'malicious_link_payload',
            },
          ],
        }),
      });

      const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/Only tenant OWNER can mutate financial, identity, or integration configurations/i);
    });

    test('12k. Round 3S Mutation Boundary: Non-OWNER attempting features mutation is rejected (403)', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          cookie: `bt_merchant_token=${tokenMerchantA}`,
        },
        body: JSON.stringify({
          features: {
            has_capi: true,
          },
        }),
      });

      const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/Only tenant OWNER can mutate financial, identity, or integration configurations/i);
    });

    test('12l. Round 3S Operational Integrity: Legitimate multi-DTO update persists and read-after-write succeeds (200)', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          cookie: `bt_merchant_token=${tokenMerchantA}`,
        },
        body: JSON.stringify({
          bio: 'Updated Operational Fortress Bio',
          display_name: 'Fortress Alpha Prime Operations',
          description: 'Tactical perimeter defense systems and operational security equipment.',
          tagline: 'Defending every frontier.',
          theme: {
            template: 'clean',
            primary_color: '#059669',
            secondary_color: '#10B981',
            visual_theme: 'clean_minimal',
            layout_style: 'grid',
          },
          faqs: [
            { id: 'faq_op_1', question: 'Operational support?', answer: '24/7 tactical response.', category: 'General' },
          ],
          business_hours: {
            timezone: 'Asia/Makassar',
            is_always_open: false,
            days: {
              monday: { open: '09:00', close: '18:00', is_open: true },
              tuesday: { open: '09:00', close: '18:00', is_open: true },
            },
            schedule: [
              { day: 'monday', open: '09:00', close: '18:00', is_open: true },
            ],
          },
          catalog_preferences: {
            default_sort: 'price_asc',
            show_prices: true,
            items_per_page: 24,
            display_mode: 'grid',
          },
          public_links: [
            { title: 'Store IG', url: 'https://instagram.com/fortress_alpha', platform: 'instagram' },
          ],
        }),
      });

      const res = await updateSettings(req, { params: Promise.resolve({ slug: slugA }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toMatch(/berhasil diperbarui/i);

      // Read-After-Write Verification
      const getReq = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${slugA}/settings`, {
        method: 'GET',
        headers: { cookie: `bt_merchant_token=${tokenMerchantA}` },
      });
      const getRes = await getSettings(getReq, { params: Promise.resolve({ slug: slugA }) });
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.success).toBe(true);

      // Assert persisted values for all 6 target fields + profile fields
      expect(getJson.settings.bio).toBe('Updated Operational Fortress Bio');
      expect(getJson.settings.display_name).toBe('Fortress Alpha Prime Operations');
      expect(getJson.settings.metadata.display_name).toBe('Fortress Alpha Prime Operations');
      expect(getJson.settings.description).toBe('Tactical perimeter defense systems and operational security equipment.');
      expect(getJson.settings.metadata.description).toBe('Tactical perimeter defense systems and operational security equipment.');
      expect(getJson.settings.tagline).toBe('Defending every frontier.');
      expect(getJson.settings.metadata.tagline).toBe('Defending every frontier.');

      // 1. business_hours
      expect(getJson.settings.metadata.business_hours.timezone).toBe('Asia/Makassar');
      expect(getJson.settings.metadata.business_hours.days.monday.open).toBe('09:00');
      expect(getJson.settings.metadata.business_hours.days.monday.close).toBe('18:00');
      expect(getJson.settings.metadata.business_hours.days.monday.is_open).toBe(true);
      expect(getJson.settings.metadata.business_hours.schedule[0].open).toBe('09:00');

      // 2. catalog_preferences
      expect(getJson.settings.metadata.catalog_preferences.default_sort).toBe('price_asc');
      expect(getJson.settings.metadata.catalog_preferences.display_mode).toBe('grid');
      expect(getJson.settings.metadata.catalog_preferences.items_per_page).toBe(24);
      expect(getJson.settings.metadata.catalog_preferences.show_prices).toBe(true);

      // 3. public_links (including platform)
      expect(getJson.settings.metadata.public_links[0].title).toBe('Store IG');
      expect(getJson.settings.metadata.public_links[0].platform).toBe('instagram');
      expect(getJson.settings.metadata.public_links[0].url).toBe('https://instagram.com/fortress_alpha');

      // 4. theme
      expect(getJson.settings.theme.primary_color).toBe('#059669');
      expect(getJson.settings.theme.secondary_color).toBe('#10B981');
      expect(getJson.settings.theme.layout_style).toBe('grid');

      // 5. faqs
      expect(getJson.settings.faqs[0].question).toBe('Operational support?');
      expect(getJson.settings.faqs[0].category).toBe('General');

      // 6. Non-authorized fields remain uncorrupted / masked
      expect(getJson.settings.phone).toBeNull();
      expect(getJson.settings.capi_token).toBeNull();
      expect(getJson.settings.bank).toBeNull();
    });
  });
});
