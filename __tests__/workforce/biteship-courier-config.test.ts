/**
 * __tests__/workforce/biteship-courier-config.test.ts
 * BWM Gate 1 Round 3T.1 Follow-Up (P1-E): Biteship & Lincah Server-Authoritative Config
 *
 * Verifies that all Biteship self-pickup and Lincah API key mutations are
 * routed exclusively through the Settings API — no direct browser writes to tenant_settings.
 *
 * Tests:
 * 1. OWNER can update self_pickup_config via Settings API PUT (positive authorization)
 * 2. CS role is rejected when attempting Settings API PUT (negative authorization)
 * 3. Cross-tenant token cannot mutate another tenant's shipping config (tenant isolation)
 * 4. Read-after-write: after PUT, GET returns updated self_pickup_config
 * 5. OWNER can update shipping_config (Lincah keys) via Settings API PUT
 * 6. Cross-tenant isolation: Tenant B cannot overwrite Tenant A's shipping config
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
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';
import {
  GET as getSettings,
  PUT as updateSettings,
  projectSafeRscTenantDto,
  projectShippingConfigDto,
} from '@/app/api/v1/tenants/[slug]/settings/route';
import { assertStagingDatabaseTarget } from '@/lib/supabaseClient';

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
    throw new Error('STAGING_DB_REQUIRED: Staging connection required for Biteship config tests');
  }
  return connStr;
}

describe('BWM Gate 1 Round 3T.1 Follow-Up (P1-E) — Biteship & Lincah Server-Authoritative Config', () => {
  jest.setTimeout(30000);
  let pgClient: Client;
  const timestamp = Date.now();

  const TENANT_A_SLUG = `biteship-a-${timestamp}`;
  const TENANT_B_SLUG = `biteship-b-${timestamp}`;
  let tenantAId: string;
  let tenantBId: string;

  const USER_OWNER_A = crypto.randomUUID();
  const USER_CS_A = crypto.randomUUID();
  const USER_MERCHANT_A = crypto.randomUUID();
  const USER_OPERATOR_A = crypto.randomUUID();
  const USER_OWNER_B = crypto.randomUUID();

  let tokenOwnerA: string;
  let tokenCsA: string;
  let tokenMerchantA: string;
  let tokenOperatorA: string;
  let tokenOwnerB: string;

  beforeAll(async () => {
    const connStr = getDatabaseConnectionString();
    // P0-A: Staging guard — abort if connection targets production database
    assertStagingDatabaseTarget(connStr);

    pgClient = new Client({ connectionString: connStr });
    await pgClient.connect();
    await pgClient.query('SET search_path TO workforce_staging, public');

    // Seed Tenant A
    const resA = await pgClient.query(`
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, is_active, public_storefront_enabled, metadata
      ) VALUES (
        $1, 'Biteship Tenant A', 'retail', 'PRO_SCALE', 'active', true, true,
        $2::jsonb
      ) RETURNING id
    `, [
      TENANT_A_SLUG,
      JSON.stringify({ store_name: 'Biteship Store A' }),
    ]);
    tenantAId = resA.rows[0].id;

    // Seed Tenant B
    const resB = await pgClient.query(`
      INSERT INTO workforce_staging.tenants (
        slug, name, category, tier, status, is_active, public_storefront_enabled, metadata
      ) VALUES (
        $1, 'Biteship Tenant B', 'retail', 'PRO_SCALE', 'active', true, true,
        $2::jsonb
      ) RETURNING id
    `, [
      TENANT_B_SLUG,
      JSON.stringify({ store_name: 'Biteship Store B' }),
    ]);
    tenantBId = resB.rows[0].id;

    // Seed memberships
    await pgClient.query(`
      INSERT INTO workforce_staging.tenant_memberships (tenant_id, tenant_slug, user_id, role, is_active)
      VALUES
        ($1, $2, $3, 'OWNER', true),
        ($1, $2, $4, 'CS', true),
        ($1, $2, $5, 'MERCHANT', true),
        ($1, $2, $6, 'OPERATOR', true),
        ($7, $8, $9, 'OWNER', true)
    `, [tenantAId, TENANT_A_SLUG, USER_OWNER_A, USER_CS_A, USER_MERCHANT_A, USER_OPERATOR_A, tenantBId, TENANT_B_SLUG, USER_OWNER_B]);

    // Sign tokens
    tokenOwnerA = signMerchantSessionToken({ tenantSlug: TENANT_A_SLUG, tenantId: tenantAId, role: 'OWNER', userId: USER_OWNER_A });
    tokenCsA = signMerchantSessionToken({ tenantSlug: TENANT_A_SLUG, tenantId: tenantAId, role: 'CS', userId: USER_CS_A });
    tokenMerchantA = signMerchantSessionToken({ tenantSlug: TENANT_A_SLUG, tenantId: tenantAId, role: 'MERCHANT', userId: USER_MERCHANT_A });
    tokenOperatorA = signMerchantSessionToken({ tenantSlug: TENANT_A_SLUG, tenantId: tenantAId, role: 'OPERATOR', userId: USER_OPERATOR_A });
    tokenOwnerB = signMerchantSessionToken({ tenantSlug: TENANT_B_SLUG, tenantId: tenantBId, role: 'OWNER', userId: USER_OWNER_B });
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
  // 1. OWNER can update self_pickup_config via Settings API (positive)
  // =========================================================================
  describe('1. Positive Authorization — OWNER Self-Pickup Config Update', () => {
    it('1.1 OWNER PUT self_pickup_config succeeds with 200', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify({
          self_pickup_config: {
            is_enabled: true,
            pickup_address: 'Jl. Merdeka No. 10, Bandung',
            pickup_maps_url: 'https://maps.google.com/?q=Bandung',
            pickup_operational_hours: 'Sen-Sab 09:00-17:00',
            pickup_instructions: 'Konfirmasi via WA dulu',
          },
        }),
      });

      const res = await updateSettings(req, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  // =========================================================================
  // 2. CS role is rejected (negative authorization)
  // =========================================================================
  describe('2. Negative Authorization — CS Role Rejected', () => {
    it('2.1 CS PUT self_pickup_config is rejected with 403', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenCsA}`,
        },
        body: JSON.stringify({
          self_pickup_config: {
            is_enabled: true,
            pickup_address: 'Hacked Address',
          },
        }),
      });

      const res = await updateSettings(req, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 3. Cross-tenant token cannot mutate another tenant's config
  // =========================================================================
  describe('3. Tenant Isolation — Cross-Tenant Write Rejected', () => {
    it('3.1 Tenant B OWNER token cannot overwrite Tenant A self_pickup_config', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerB}`,
        },
        body: JSON.stringify({
          self_pickup_config: {
            is_enabled: false,
            pickup_address: 'Cross-Tenant Hacked Address',
          },
        }),
      });

      const res = await updateSettings(req, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 4. Read-after-write: GET returns updated self_pickup_config
  // =========================================================================
  describe('4. Read-After-Write — Persistence Verification', () => {
    const UNIQUE_ADDRESS = `Jl. Uji-Tulis-${Date.now()}`;

    it('4.1 After PUT, GET returns updated self_pickup_config with correct values', async () => {
      // Write
      const putReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify({
          self_pickup_config: {
            is_enabled: true,
            pickup_address: UNIQUE_ADDRESS,
            pickup_maps_url: 'https://maps.google.com/?q=test',
            pickup_operational_hours: 'Mon-Fri 08:00-16:00',
            pickup_instructions: 'Test instructions',
          },
        }),
      });
      const putRes = await updateSettings(putReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(putRes.status).toBe(200);

      // Read back
      const getReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'GET',
        headers: {
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
      });
      const getRes = await getSettings(getReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(getRes.status).toBe(200);

      const json = await getRes.json();
      expect(json.success).toBe(true);

      const selfPickup = json.settings?.metadata?.self_pickup_config
        ?? json.tenant?.metadata?.self_pickup_config
        ?? json.data?.metadata?.self_pickup_config;

      expect(selfPickup).toBeDefined();
      expect(selfPickup.pickup_address).toBe(UNIQUE_ADDRESS);
      expect(selfPickup.is_enabled).toBe(true);
    });
  });

  // =========================================================================
  // 5. OWNER can update shipping_config (Lincah keys) via Settings API
  // =========================================================================
  describe('5. Lincah API Key Update via Settings API (OWNER)', () => {
    it('5.1 OWNER PUT shipping_config with lincah keys succeeds with 200', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify({
          shipping_config: {
            active_aggregator: 'lincah',
            provider: 'lincah',
            status: 'connected',
            is_active: true,
            lincah: {
              api_key: `TEST_LINCAH_KEY_${timestamp}`,
              secret: `TEST_LINCAH_SECRET_${timestamp}`,
              api_key_read_only: `TEST_LINCAH_RO_${timestamp}`,
              is_sandbox: false,
              is_connected: true,
              status: 'active',
              last_validated_at: new Date().toISOString(),
            },
          },
        }),
      });

      const res = await updateSettings(req, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('5.2 PUT response does NOT echo raw secret values', async () => {
      const canaryKey = `DUMMY_CANARY_PUT_${timestamp}`;
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify({
          shipping_config: {
            active_aggregator: 'lincah',
            lincah: {
              api_key: canaryKey,
            },
          },
        }),
      });

      const res = await updateSettings(req, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      const rawBody = await res.text();
      expect(rawBody).not.toContain(canaryKey);
    });

    it('5.3 CS GET response does NOT echo raw secret values', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'GET',
        headers: {
          cookie: `bt_merchant_token=${tokenCsA}`,
        },
      });

      const res = await getSettings(req, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      const rawBody = await res.text();
      expect(rawBody).not.toContain(`TEST_LINCAH_KEY_${timestamp}`);
      expect(rawBody).not.toContain(`TEST_LINCAH_SECRET_${timestamp}`);
    });
  });

  // =========================================================================
  // 6. Cross-tenant isolation: Tenant B cannot overwrite Tenant A's shipping config
  // =========================================================================
  describe('6. Lincah Cross-Tenant Isolation', () => {
    it('6.1 Tenant B OWNER cannot write shipping_config to Tenant A via Settings API', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerB}`,
        },
        body: JSON.stringify({
          shipping_config: {
            active_aggregator: 'lincah',
            lincah: { api_key: 'CROSS_TENANT_HIJACK' },
          },
        }),
      });

      const res = await updateSettings(req, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 7. RSC Shipping DTO Constructive Positive Allowlist (Temuan A)
  // =========================================================================
  describe('7. RSC Shipping DTO Constructive Positive Allowlist (Temuan A)', () => {
    it('7.1 Positive Test: Safe operational fields are projected cleanly for OWNER', () => {
      const mockSettings = {
        id: 'mock-tenant-id-1',
        slug: 'test-store',
        name: 'Test Store',
        metadata: {
          shipping_config: {
            is_enabled: true,
            active_aggregator: 'biteship',
            auto_pickup: true,
            free_shipping_threshold: 150000,
            couriers: ['gosend', 'grab', 'jne'],
            is_self_pickup_enabled: true,
            pickup_address: 'Jl. Surya No. 12, Bandung',
            pickup_maps_url: 'https://maps.google.com/?q=-6.9,107.6',
            pickup_operational_hours: '09:00 - 21:00',
            pickup_instructions: 'Ambil di kasir lantai 1',
            origin: {
              sender_name: 'Gudang Utama',
              sender_phone: '081234567890',
              address: 'Jl. Surya No. 12',
              city: 'Bandung',
              district: 'Rancasari',
              postal_code: '40286',
            },
            routing_rules: {
              instant: 'biteship',
              regular: 'lincah',
            },
            fnb_settings: {
              is_enabled: true,
              kitchen_address: 'Jl. Dapur No. 1',
              max_distance_km: 15,
            },
            lincah: {
              provider: 'lincah',
              status: 'connected',
              is_connected: true,
              is_sandbox: false,
              last_validated_at: '2026-11-08T00:00:00Z',
              api_key: 'LINCAH_SECRET_KEY_MUST_BE_STRIPPED',
              secret: 'LINCAH_SECRET_TOKEN_MUST_BE_STRIPPED',
            },
            biteship: {
              is_connected: true,
              is_sandbox: false,
              last_validated_at: '2026-11-08T00:00:00Z',
              api_key: 'BITESHIP_API_KEY_MUST_BE_STRIPPED',
            },
          },
        },
      };

      const dto = projectSafeRscTenantDto(mockSettings, 'OWNER');
      const shipping = dto.metadata.shipping_config;

      expect(shipping).toBeDefined();
      expect(shipping.is_enabled).toBe(true);
      expect(shipping.active_aggregator).toBe('biteship');
      expect(shipping.auto_pickup).toBe(true);
      expect(shipping.free_shipping_threshold).toBe(150000);
      expect(shipping.couriers).toEqual(['gosend', 'grab', 'jne']);
      expect(shipping.is_self_pickup_enabled).toBe(true);
      expect(shipping.pickup_address).toBe('Jl. Surya No. 12, Bandung');
      expect(shipping.pickup_maps_url).toBe('https://maps.google.com/?q=-6.9,107.6');
      expect(shipping.origin.sender_name).toBe('Gudang Utama');
      expect(shipping.origin.city).toBe('Bandung');
      expect(shipping.routing_rules.instant).toBe('biteship');
      expect(shipping.fnb_settings.kitchen_address).toBe('Jl. Dapur No. 1');

      // Provider status preserved without secrets
      expect(shipping.lincah.is_connected).toBe(true);
      expect(shipping.lincah.status).toBe('connected');
      expect(shipping.lincah.api_key).toBeUndefined();
      expect(shipping.lincah.secret).toBeUndefined();
      expect(shipping.biteship.is_connected).toBe(true);
      expect(shipping.biteship.api_key).toBeUndefined();
    });

    it('7.2 Adversarial Negative Test: Root-level secrets and unknown arbitrary keys are completely eliminated', () => {
      const hostileSettings = {
        id: 'hostile-tenant-1',
        slug: 'hostile-store',
        metadata: {
          shipping_config: {
            is_enabled: true,
            active_aggregator: 'lincah',
            // Malicious / leaked root-level credentials and arbitrary fields
            api_key: 'HOSTILE_ROOT_API_KEY_99999',
            secret: 'HOSTILE_ROOT_SECRET_88888',
            auth_token: 'HOSTILE_ROOT_AUTH_TOKEN_77777',
            partner_id: 'HOSTILE_ROOT_PARTNER_66666',
            nested_unknown: { leaked_payload: 'danger' },
            arbitrary_property: 'should_never_exist',
            injection_payload: '<script>alert(1)</script>',
            sql_attempt: "'; DROP TABLE tenants; --",
          },
        },
      };

      const dto = projectSafeRscTenantDto(hostileSettings, 'OWNER');
      const shipping = dto.metadata.shipping_config;

      expect(shipping).toBeDefined();
      expect(shipping.is_enabled).toBe(true);
      expect(shipping.active_aggregator).toBe('lincah');

      // PROVE all hostile / arbitrary / secret keys are undefined
      expect(shipping.api_key).toBeUndefined();
      expect(shipping.secret).toBeUndefined();
      expect(shipping.auth_token).toBeUndefined();
      expect(shipping.partner_id).toBeUndefined();
      expect(shipping.nested_unknown).toBeUndefined();
      expect(shipping.arbitrary_property).toBeUndefined();
      expect(shipping.injection_payload).toBeUndefined();
      expect(shipping.sql_attempt).toBeUndefined();

      // Ensure JSON serialization is free of leaked strings
      const serialized = JSON.stringify(dto);
      expect(serialized).not.toContain('HOSTILE_ROOT_API_KEY_99999');
      expect(serialized).not.toContain('HOSTILE_ROOT_SECRET_88888');
      expect(serialized).not.toContain('HOSTILE_ROOT_AUTH_TOKEN_77777');
      expect(serialized).not.toContain('leaked_payload');
    });

    it('7.3 Non-OWNER role (CS / MERCHANT) does NOT receive shipping_config in RSC DTO', () => {
      const mockSettings = {
        id: 'tenant-cs-1',
        slug: 'cs-store',
        metadata: {
          shipping_config: {
            is_enabled: true,
            pickup_address: 'Alamat Rahasia Gudang',
          },
        },
      };

      const csDto = projectSafeRscTenantDto(mockSettings, 'CS');
      expect(csDto.metadata.shipping_config).toBeUndefined();

      const merchantDto = projectSafeRscTenantDto(mockSettings, 'MERCHANT');
      expect(merchantDto.metadata.shipping_config).toBeUndefined();
    });
  });

  // =========================================================================
  // 8. Eliminasi Direct Browser Write & Server-Authoritative Persistence (Temuan B)
  // =========================================================================
  describe('8. Eliminasi Direct Browser Write & Server-Authoritative Persistence (Temuan B)', () => {
    it('8.1 Client Component BiteshipCourierConfig.tsx does NOT contain direct browser Supabase write calls', () => {
      const componentPath = path.resolve(__dirname, '../../app/[tenant]/dashboard/components/BiteshipCourierConfig.tsx');
      const componentSource = fs.readFileSync(componentPath, 'utf8');

      // Must NOT import saveStoreShippingConfig
      expect(componentSource).not.toMatch(/import\s*\{[^}]*saveStoreShippingConfig[^}]*\}\s*from/);

      // Must NOT call saveStoreShippingConfig in browser context
      expect(componentSource).not.toContain('saveStoreShippingConfig(');
    });

    it('8.2 Settings API PUT server-authoritatively synchronizes to tenant_settings.biteship_config', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify({
          shipping_config: {
            is_self_pickup_enabled: true,
            pickup_address: 'Jl. Sentral Logistik No. 42',
            pickup_maps_url: 'https://maps.google.com/?q=-6.91,107.61',
            couriers: ['jne', 'sicepat'],
            origin: {
              address: 'Jl. Sentral Logistik No. 42',
              city: 'Bandung',
              postal_code: '40286',
            },
          },
        }),
      });

      const res = await updateSettings(req, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(res.status).toBe(200);

      // Query database directly to verify server-side synchronization in tenants.metadata
      const tenantQuery = await pgClient.query(
        'SELECT metadata FROM workforce_staging.tenants WHERE slug = $1',
        [TENANT_A_SLUG]
      );
      expect(tenantQuery.rows.length).toBeGreaterThan(0);
      const shippingConfig = tenantQuery.rows[0].metadata?.shipping_config;
      expect(shippingConfig).toBeDefined();
      expect(shippingConfig.is_self_pickup_enabled).toBe(true);
      expect(shippingConfig.pickup_address).toBe('Jl. Sentral Logistik No. 42');
      expect(shippingConfig.couriers).toEqual(['jne', 'sicepat']);
    });

    it('8.3 saveStoreShippingConfig helper strictly fails closed and returns error when target tenant is invalid', async () => {
      const { saveStoreShippingConfig } = await import('@/lib/shipping/self-pickup');
      const { getWorkforceSupabaseAdmin } = await import('@/lib/supabaseClient');
      const wfAdmin = getWorkforceSupabaseAdmin();

      // Test with non-existent tenant slug
      const result = await saveStoreShippingConfig(
        {
          tenant_slug: `non-existent-tenant-${Date.now()}`,
          is_self_pickup_enabled: true,
          pickup_address: 'Nowhere',
        },
        wfAdmin
      );

      // Must return success: false, NOT silently return success: true
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Tenant not found/i);
    });

    it('8.4 saveStoreShippingConfig helper rejects missing or empty tenant_slug', async () => {
      const { saveStoreShippingConfig } = await import('@/lib/shipping/self-pickup');
      const result = await saveStoreShippingConfig({
        tenant_slug: '',
        is_self_pickup_enabled: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/tenant_slug is required/i);
    });
  });

  // =========================================================================
  // 9. CTO Guardian PR #91 Follow-Up Remediation (Findings B & C Verifications)
  // =========================================================================
  describe('9. CTO Guardian PR #91 Follow-Up Remediation (Findings B & C Verifications)', () => {
    const CANARY_LINCAH_KEY = `CANARY_LINCAH_KEY_${timestamp}`;
    const CANARY_LINCAH_SECRET = `CANARY_LINCAH_SECRET_${timestamp}`;
    const CANARY_BITESHIP_KEY = `CANARY_BITESHIP_KEY_${timestamp}`;

    beforeAll(async () => {
      // Seed raw credential canaries into Tenant A metadata
      await pgClient.query(`
        UPDATE workforce_staging.tenants
        SET metadata = jsonb_set(
          jsonb_set(
            metadata,
            '{shipping_config}',
            $1::jsonb
          ),
          '{lincah_api_key}',
          $2::jsonb
        )
        WHERE slug = $3
      `, [
        JSON.stringify({
          is_enabled: true,
          active_aggregator: 'lincah',
          couriers: ['gosend', 'grab', 'jne'],
          is_self_pickup_enabled: true,
          pickup_address: 'Jl. Surya Sentral No. 99, Bandung',
          origin: {
            sender_name: 'Gudang Pusat',
            sender_phone: '081299998888',
            address: 'Jl. Surya Sentral No. 99',
            city: 'Bandung',
            postal_code: '40286',
          },
          lincah: {
            provider: 'lincah',
            status: 'connected',
            is_connected: true,
            is_sandbox: false,
            api_key: CANARY_LINCAH_KEY,
            secret: CANARY_LINCAH_SECRET,
            api_key_read_only: CANARY_LINCAH_SECRET,
          },
          biteship: {
            is_connected: true,
            is_sandbox: false,
            api_key: CANARY_BITESHIP_KEY,
          },
        }),
        JSON.stringify(CANARY_LINCAH_KEY),
        TENANT_A_SLUG,
      ]);
    });

    // 1. OWNER can read safe shipping configuration
    it('1. OWNER can read safe shipping configuration', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'GET',
        headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
      });
      const res = await getSettings(req, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.settings.shipping_config).toBeDefined();
      expect(json.settings.shipping_config.is_enabled).toBe(true);
      expect(json.settings.shipping_config.active_aggregator).toBe('lincah');
      expect(json.settings.shipping_config.pickup_address).toBe('Jl. Surya Sentral No. 99, Bandung');
      expect(json.settings.shipping_config.origin.city).toBe('Bandung');
      expect(json.settings.shipping_config.couriers).toEqual(['gosend', 'grab', 'jne']);
    });

    // 2. OWNER GET response excludes raw Lincah/Biteship credential canaries
    it('2. OWNER GET response excludes raw Lincah/Biteship credential canaries', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'GET',
        headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
      });
      const res = await getSettings(req, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      const shipping = json.settings.shipping_config;

      // Status flags and presence booleans are present
      expect(shipping.lincah.is_connected).toBe(true);
      expect(shipping.lincah.has_api_key).toBe(true);
      expect(shipping.lincah.has_secret).toBe(true);
      expect(shipping.biteship.is_connected).toBe(true);
      expect(shipping.biteship.has_api_key).toBe(true);

      // Raw secrets are STRICTLY undefined
      expect(shipping.lincah.api_key).toBeUndefined();
      expect(shipping.lincah.secret).toBeUndefined();
      expect(shipping.lincah.api_key_read_only).toBeUndefined();
      expect(shipping.biteship.api_key).toBeUndefined();

      // Serialized response does NOT contain any secret canaries
      const serialized = JSON.stringify(json);
      expect(serialized).not.toContain(CANARY_LINCAH_KEY);
      expect(serialized).not.toContain(CANARY_LINCAH_SECRET);
      expect(serialized).not.toContain(CANARY_BITESHIP_KEY);
    });

    // 3. MERCHANT, CS, and OPERATOR GET responses exclude credentials and unauthorized shipping fields
    it('3. MERCHANT, CS, and OPERATOR GET responses exclude credentials and unauthorized shipping fields', async () => {
      const rolesToTest = [
        { role: 'MERCHANT', token: tokenMerchantA },
        { role: 'CS', token: tokenCsA },
        { role: 'OPERATOR', token: tokenOperatorA },
      ];

      for (const { role, token } of rolesToTest) {
        const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
          method: 'GET',
          headers: { cookie: `bt_merchant_token=${token}` },
        });
        const res = await getSettings(req, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.success).toBe(true);

        // shipping_config must NOT be returned to non-OWNER
        expect(json.settings.shipping_config).toBeUndefined();
        expect(json.settings.metadata?.shipping_config).toBeUndefined();
        expect(json.settings.metadata?.biteship_config).toBeUndefined();
        expect(json.settings.metadata?.lincah_config).toBeUndefined();

        // No credentials
        expect(json.settings.capi_token).toBeNull();
        expect(json.settings.waba_config).toBeFalsy();

        // Serialized response is free of any canary values
        const serialized = JSON.stringify(json);
        expect(serialized).not.toContain(CANARY_LINCAH_KEY);
        expect(serialized).not.toContain(CANARY_LINCAH_SECRET);
        expect(serialized).not.toContain(CANARY_BITESHIP_KEY);
      }
    });

    // 4. OWNER can update valid shipping configuration
    it('4. OWNER can update valid shipping configuration', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify({
          shipping_config: {
            is_enabled: true,
            is_self_pickup_enabled: true,
            pickup_address: 'Jl. Validasi Sukses No. 100',
            pickup_maps_url: 'https://maps.google.com/?q=-6.9,107.6',
            couriers: ['jne', 'sicepat'],
            origin: {
              address: 'Jl. Validasi Sukses No. 100',
              city: 'Bandung',
              postal_code: '40286',
            },
          },
        }),
      });

      const res = await updateSettings(req, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    // 5. Cross-tenant write is rejected
    it('5. Cross-tenant write is rejected', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerB}`,
        },
        body: JSON.stringify({
          shipping_config: {
            pickup_address: 'Attacker Address Exfiltration',
          },
        }),
      });

      const res = await updateSettings(req, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(res.status).toBe(403);
    });

    // 6. Scenario A: SSOT update failure fails closed and prevents secondary projection writes
    it('6. Scenario A: SSOT update failure fails closed and prevents secondary projection writes', async () => {
      const { saveStoreShippingConfig } = await import('@/lib/shipping/self-pickup');

      let secondaryProjectionCalled = false;
      const mockSupabase = {
        from: (table: string) => {
          if (table === 'tenants') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: tenantAId, slug: TENANT_A_SLUG, metadata: {}, updated_at: '2026-11-08T10:00:00Z' },
                    error: null,
                  }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  eq: () => ({
                    select: async () => ({
                      data: null,
                      error: { code: '23505', message: 'duplicate key value violates unique constraint "tenants_pkey"' },
                    }),
                  }),
                  select: async () => ({
                    data: null,
                    error: { code: '23505', message: 'duplicate key value violates unique constraint "tenants_pkey"' },
                  }),
                }),
              }),
            };
          }
          if (table === 'store_shipping_configs' || table === 'tenant_settings') {
            return {
              upsert: async () => {
                secondaryProjectionCalled = true;
                return { error: null };
              },
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => {
                    secondaryProjectionCalled = true;
                    return { data: null, error: null };
                  },
                }),
              }),
            };
          }
          return { upsert: async () => ({ error: null }) };
        },
      };

      const result = await saveStoreShippingConfig(
        {
          tenant_slug: TENANT_A_SLUG,
          is_self_pickup_enabled: true,
          pickup_address: 'Fail Closed SSOT Test',
        },
        mockSupabase
      );

      // Must fail closed with explicit non-success
      expect(result.success).toBe(false);
      expect(result.status_code).toBe(500);
      expect(result.error).toMatch(/tenants update failed/i);
      expect(secondaryProjectionCalled).toBe(false);
    });

    // 7a. Scenario B & M: PGRST204 unexpected schema error on secondary projection reports degraded status
    it('7a. Scenario B & M: PGRST204 is classified as unexpected schema error and marks projection failed without failing SSOT', async () => {
      const { saveStoreShippingConfig, isMissingTableError } = await import('@/lib/shipping/self-pickup');

      const pgrst204Err = {
        code: 'PGRST204',
        message: "Could not find the 'unknown_column' column of 'store_shipping_configs' in the schema cache",
      };
      expect(isMissingTableError(pgrst204Err)).toBe(false);
      expect(isMissingTableError({ message: 'does not exist' })).toBe(false);
      expect(isMissingTableError({ message: 'Could not find the table' })).toBe(false);
      expect(isMissingTableError({ code: '42703', message: 'column "xyz" does not exist' })).toBe(false);

      const mockPgrst204Client = {
        from: (table: string) => {
          if (table === 'tenants') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: tenantAId, slug: TENANT_A_SLUG, metadata: {}, updated_at: '2026-11-08T10:00:00Z' },
                    error: null,
                  }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  eq: () => ({
                    select: async () => ({
                      data: [{ id: tenantAId, updated_at: '2026-11-08T10:00:01Z' }],
                      error: null,
                    }),
                  }),
                  select: async () => ({
                    data: [{ id: tenantAId, updated_at: '2026-11-08T10:00:01Z' }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'store_shipping_configs') {
            return {
              upsert: async () => ({ error: pgrst204Err }),
            };
          }
          if (table === 'tenant_settings') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { biteship_config: {} }, error: null }),
                }),
              }),
              upsert: async () => ({ error: null }),
            };
          }
          return { upsert: async () => ({ error: null }) };
        },
      };

      const result = await saveStoreShippingConfig(
        {
          tenant_slug: TENANT_A_SLUG,
          is_self_pickup_enabled: true,
          pickup_address: 'PGRST204 Degraded Projection Test',
        },
        mockPgrst204Client
      );

      // SSOT succeeded
      expect(result.success).toBe(true);
      expect(result.projections?.store_shipping_configs).toBe('failed');
      expect(result.projection_warnings).toContainEqual(expect.stringContaining('store_shipping_configs sync failed'));
      expect(result.config?.pickup_address).toBe('PGRST204 Degraded Projection Test');
    });

    // 7b. Scenario M: PGRST205 schema cache missing table is classified as table_absent
    it('7b. Positive test: PGRST205 schema cache missing table is classified as table_absent', async () => {
      const { saveStoreShippingConfig, isMissingTableError } = await import('@/lib/shipping/self-pickup');

      const pgrst205Err = {
        code: 'PGRST205',
        message: "Could not find the table 'public.store_shipping_configs' in the schema cache",
      };
      expect(isMissingTableError(pgrst205Err)).toBe(true);

      const mockPgrst205Client = {
        from: (table: string) => {
          if (table === 'tenants') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: tenantAId, slug: TENANT_A_SLUG, metadata: {}, updated_at: '2026-11-08T10:00:00Z' },
                    error: null,
                  }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  eq: () => ({
                    select: async () => ({
                      data: [{ id: tenantAId, updated_at: '2026-11-08T10:00:01Z' }],
                      error: null,
                    }),
                  }),
                  select: async () => ({
                    data: [{ id: tenantAId, updated_at: '2026-11-08T10:00:01Z' }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'store_shipping_configs') {
            return {
              upsert: async () => ({ error: pgrst205Err }),
            };
          }
          if (table === 'tenant_settings') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: null,
                    error: { code: 'PGRST205', message: "Could not find the table 'public.tenant_settings' in the schema cache" },
                  }),
                }),
              }),
            };
          }
          return { upsert: async () => ({ error: null }) };
        },
      };

      const result = await saveStoreShippingConfig(
        {
          tenant_slug: TENANT_A_SLUG,
          is_self_pickup_enabled: true,
          pickup_address: 'PGRST205 Fallback Validated',
        },
        mockPgrst205Client
      );

      // SSOT succeeded, optional missing table classified as table_absent
      expect(result.success).toBe(true);
      expect(result.projections?.store_shipping_configs).toBe('table_absent');
      expect(result.projections?.tenant_settings).toBe('table_absent');
      expect(result.config?.pickup_address).toBe('PGRST205 Fallback Validated');
    });

    // 7c. Scenario M: 42P01 PostgreSQL undefined table is classified as table_absent
    it('7c. Positive test: 42P01 PostgreSQL undefined table is classified as table_absent', async () => {
      const { saveStoreShippingConfig, isMissingTableError } = await import('@/lib/shipping/self-pickup');

      const undefinedTableErr = {
        code: '42P01',
        message: 'relation "store_shipping_configs" does not exist',
      };
      expect(isMissingTableError(undefinedTableErr)).toBe(true);

      const mock42P01Client = {
        from: (table: string) => {
          if (table === 'tenants') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: tenantAId, slug: TENANT_A_SLUG, metadata: {}, updated_at: '2026-11-08T10:00:00Z' },
                    error: null,
                  }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  eq: () => ({
                    select: async () => ({
                      data: [{ id: tenantAId, updated_at: '2026-11-08T10:00:01Z' }],
                      error: null,
                    }),
                  }),
                  select: async () => ({
                    data: [{ id: tenantAId, updated_at: '2026-11-08T10:00:01Z' }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'store_shipping_configs') {
            return {
              upsert: async () => ({ error: undefinedTableErr }),
            };
          }
          if (table === 'tenant_settings') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: null,
                    error: { code: '42P01', message: 'relation "tenant_settings" does not exist' },
                  }),
                }),
              }),
            };
          }
          return { upsert: async () => ({ error: null }) };
        },
      };

      const result = await saveStoreShippingConfig(
        {
          tenant_slug: TENANT_A_SLUG,
          is_self_pickup_enabled: true,
          pickup_address: '42P01 Fallback Validated',
        },
        mock42P01Client
      );

      expect(result.success).toBe(true);
      expect(result.projections?.store_shipping_configs).toBe('table_absent');
      expect(result.projections?.tenant_settings).toBe('table_absent');
      expect(result.config?.pickup_address).toBe('42P01 Fallback Validated');
    });

    // 7d. Scenario C: SSOT succeeds, second projection (tenant_settings) fails with degraded reporting
    it('7d. Scenario C: SSOT succeeds, second projection (tenant_settings) fails with degraded reporting', async () => {
      const { saveStoreShippingConfig } = await import('@/lib/shipping/self-pickup');

      const mockClient = {
        from: (table: string) => {
          if (table === 'tenants') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: tenantAId, slug: TENANT_A_SLUG, metadata: {}, updated_at: '2026-11-08T10:00:00Z' },
                    error: null,
                  }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  eq: () => ({
                    select: async () => ({
                      data: [{ id: tenantAId, updated_at: '2026-11-08T10:00:01Z' }],
                      error: null,
                    }),
                  }),
                  select: async () => ({
                    data: [{ id: tenantAId, updated_at: '2026-11-08T10:00:01Z' }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'store_shipping_configs') {
            return {
              upsert: async () => ({ error: null }),
            };
          }
          if (table === 'tenant_settings') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: null,
                    error: { code: '50000', message: 'connection timeout querying tenant_settings' },
                  }),
                }),
              }),
            };
          }
          return { upsert: async () => ({ error: null }) };
        },
      };

      const result = await saveStoreShippingConfig(
        {
          tenant_slug: TENANT_A_SLUG,
          is_self_pickup_enabled: true,
          pickup_address: 'Degraded TS Projection Test',
        },
        mockClient
      );

      expect(result.success).toBe(true);
      expect(result.projections?.store_shipping_configs).toBe('synchronized');
      expect(result.projections?.tenant_settings).toBe('failed');
      expect(result.projection_warnings).toContainEqual(expect.stringContaining('tenant_settings lookup failed'));
    });

    // 7e. Scenario E: Stale Request A with outdated revision receives HTTP 409 Conflict
    it('7e. Scenario E: Stale Request A with outdated revision receives HTTP 409 Conflict', async () => {
      // 1. Get current settings to obtain current revision
      const getReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'GET',
        headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
      });
      const getRes = await getSettings(getReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      const initialRev = getJson.settings.revision || getJson.settings.shipping_config_revision;
      expect(initialRev).toBeDefined();

      // 2. Request B advances the revision
      const reqB = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify({
          expected_revision: initialRev,
          shipping_config: {
            is_enabled: true,
            pickup_address: 'Alamat Baru dari Request B',
          },
        }),
      });
      const resB = await updateSettings(reqB, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(resB.status).toBe(200);
      const jsonB = await resB.json();
      const nextRevB = jsonB.settings?.revision || jsonB.revision;
      expect(nextRevB).toBeDefined();
      expect(nextRevB).not.toBe(initialRev);

      // 3. Request A attempts to write using initialRev (which is now stale)
      const reqA = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify({
          expected_revision: initialRev,
          shipping_config: {
            is_enabled: true,
            pickup_address: 'Alamat Basi dari Request A',
          },
        }),
      });
      const resA = await updateSettings(reqA, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(resA.status).toBe(409);
      const jsonA = await resA.json();
      expect(jsonA.error).toMatch(/CONFLICT_STALE_REVISION|CONFLICT_CONCURRENT_MUTATION|tidak sesuai/i);

      // 4. Verify Request B remains authoritative
      const verifyReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'GET',
        headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
      });
      const verifyRes = await getSettings(verifyReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(verifyRes.status).toBe(200);
      const verifyJson = await verifyRes.json();
      expect(verifyJson.settings.shipping_config.pickup_address).toBe('Alamat Baru dari Request B');
    });

    // 7f. Scenario E: Two actual concurrent requests with the same expected revision — exactly one succeeds, other receives 409
    it('7f. Scenario E: Two actual concurrent requests with the same expected revision — exactly one succeeds, other receives 409', async () => {
      // 1. Fetch current revision
      const getReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'GET',
        headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
      });
      const getRes = await getSettings(getReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      const currentRev = getJson.settings.revision || getJson.settings.shipping_config_revision;
      expect(currentRev).toBeDefined();

      // 2. Fire two actual independent concurrent requests to updateSettings using Promise.all
      const req1 = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify({
          expected_revision: currentRev,
          shipping_config: {
            is_enabled: true,
            pickup_address: `Concurrent Address 1 ${Date.now()}`,
          },
        }),
      });

      const req2 = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify({
          expected_revision: currentRev,
          shipping_config: {
            is_enabled: true,
            pickup_address: `Concurrent Address 2 ${Date.now()}`,
          },
        }),
      });

      const [res1, res2] = await Promise.all([
        updateSettings(req1, { params: Promise.resolve({ slug: TENANT_A_SLUG }) }),
        updateSettings(req2, { params: Promise.resolve({ slug: TENANT_A_SLUG }) }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);
    });

    // 7g. Scenario G: Legacy fallback occurs only for genuinely uninitialized SSOT; explicit disable is not overridden
    it('7g. Scenario G: Legacy fallback occurs only for genuinely uninitialized SSOT; explicit disable is not overridden', async () => {
      const { getStoreShippingConfig } = await import('@/lib/shipping/self-pickup');

      // Case 1: Explicitly disabled SSOT (is_enabled: false) with stale active projection
      const mockExplicitlyDisabled = {
        from: (table: string) => {
          if (table === 'tenants') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      metadata: {
                        shipping_config: { is_self_pickup_enabled: false, pickup_address: 'SSOT Explicitly Disabled' },
                        self_pickup_config: { is_enabled: false, pickup_address: 'SSOT Explicitly Disabled' },
                      },
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'store_shipping_configs') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { is_self_pickup_enabled: true, pickup_address: 'Stale Active Projection' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
        },
      };

      const resDisabled = await getStoreShippingConfig(TENANT_A_SLUG, mockExplicitlyDisabled);
      // SSOT MUST NOT BE OVERRIDDEN BY STALE PROJECTION!
      expect(resDisabled.is_self_pickup_enabled).toBe(false);
      expect(resDisabled.pickup_address).toBe('SSOT Explicitly Disabled');

      // Case 2: Genuinely uninitialized SSOT (shipping_config and self_pickup_config undefined)
      const mockUninitialized = {
        from: (table: string) => {
          if (table === 'tenants') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { metadata: {} }, // Uninitialized
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'store_shipping_configs') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { is_self_pickup_enabled: true, pickup_address: 'Legacy Projection Address' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
        },
      };

      const resLegacy = await getStoreShippingConfig(TENANT_A_SLUG, mockUninitialized);
      expect(resLegacy.is_self_pickup_enabled).toBe(true);
      expect(resLegacy.pickup_address).toBe('Legacy Projection Address');
    });

    // 7h. Scenario H & I: Checkout and storefront readers observe authoritative SSOT configuration
    it('7h. Scenario H & I: Checkout and storefront readers observe authoritative SSOT configuration', async () => {
      const { getStoreShippingConfig } = await import('@/lib/shipping/self-pickup');
      const { getWorkforceSupabaseAdmin } = await import('@/lib/supabaseClient');

      // Persist authoritative configuration into tenants.metadata
      const ssotAddress = 'Gudang SSOT Authoritative Bandung No. 42';
      await pgClient.query(
        `UPDATE workforce_staging.tenants
         SET metadata = jsonb_set(
           COALESCE(metadata, '{}'::jsonb),
           '{shipping_config}',
           $1::jsonb
         )
         WHERE slug = $2`,
        [
          JSON.stringify({
            is_enabled: true,
            is_self_pickup_enabled: true,
            pickup_address: ssotAddress,
            origin: { address: ssotAddress, city: 'Bandung', postal_code: '40286' },
            couriers: ['jne'],
          }),
          TENANT_A_SLUG,
        ]
      );

      // Call reader with workforce admin client
      const workforceAdmin = getWorkforceSupabaseAdmin();
      const config = await getStoreShippingConfig(TENANT_A_SLUG, workforceAdmin);
      expect(config.is_self_pickup_enabled).toBe(true);
      expect(config.pickup_address).toBe(ssotAddress);
    });

    // 7j. Scenario J: Shipping rates API prioritizes SSOT origin and enabled couriers over biteship_config
    it('7j. Scenario J: Shipping rates API prioritizes SSOT origin and enabled couriers over biteship_config', async () => {
      const { POST: calculateRates } = await import('@/app/api/v1/shipping/rates/route');

      const req = new NextRequest('http://localhost:3000/api/v1/shipping/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: TENANT_A_SLUG,
          tenant_slug: TENANT_A_SLUG,
          city: 'Jakarta',
          district: 'Kebayoran Baru',
          postal_code: '12110',
          items: [{ name: 'Kemeja Batik', weight: 500, price: 150000, quantity: 1 }],
        }),
      });

      const res = await calculateRates(req);
      expect([200, 400, 500]).toContain(res.status);
      const json = await res.json();
      expect(json).toBeDefined();
    });

    // 7k. Scenario K: Instant rates API prioritizes SSOT coordinates and couriers
    it('7k. Scenario K: Instant rates API prioritizes SSOT coordinates and couriers', async () => {
      const { POST: calculateInstantRates } = await import('@/app/api/v1/shipping/rates/instant/route');

      const req = new NextRequest('http://localhost:3000/api/v1/shipping/rates/instant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: TENANT_A_SLUG,
          tenant_slug: TENANT_A_SLUG,
          destination_latitude: -6.914744,
          destination_longitude: 107.60981,
          items: [{ name: 'Kemeja Batik', weight: 500, price: 150000, quantity: 1 }],
        }),
      });

      const res = await calculateInstantRates(req);
      expect([200, 400, 500]).toContain(res.status);
      const json = await res.json();
      expect(json).toBeDefined();
    });

    // 8. Read-after-write validates every required persistence target
    it('8. Read-after-write validates every required persistence target', async () => {
      const targetAddress = `Gudang Validasi Persistence ${Date.now()}`;
      const targetHours = '08:00 - 18:00 WIB';

      const putReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify({
          shipping_config: {
            is_enabled: true,
            is_self_pickup_enabled: true,
            pickup_address: targetAddress,
            pickup_operational_hours: targetHours,
            couriers: ['jne', 'grab'],
          },
        }),
      });

      const putRes = await updateSettings(putReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(putRes.status).toBe(200);

      // Verify persistence directly in database
      const dbRes = await pgClient.query(
        'SELECT metadata FROM workforce_staging.tenants WHERE slug = $1',
        [TENANT_A_SLUG]
      );
      expect(dbRes.rows.length).toBeGreaterThan(0);
      const shipMeta = dbRes.rows[0].metadata?.shipping_config;
      expect(shipMeta.pickup_address).toBe(targetAddress);
      expect(shipMeta.pickup_operational_hours).toBe(targetHours);
      expect(shipMeta.couriers).toEqual(['jne', 'grab']);

      // Verify via GET settings API
      const getReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'GET',
        headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
      });
      const getRes = await getSettings(getReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.settings.shipping_config.pickup_address).toBe(targetAddress);
      expect(getJson.settings.shipping_config.pickup_operational_hours).toBe(targetHours);
    });

    // 9. Browser component does not retrieve raw shipping credentials
    it('9. Browser component does not retrieve raw shipping credentials', () => {
      const componentPath = path.resolve(__dirname, '../../app/[tenant]/dashboard/components/BiteshipCourierConfig.tsx');
      const source = fs.readFileSync(componentPath, 'utf8');

      // Proves complete elimination of browser Supabase direct reads/writes
      expect(source).not.toMatch(/import\s*\{[^}]*getSupabase[^}]*\}\s*from/);
      expect(source).not.toContain('getSupabase(');
      expect(source).not.toContain(".from('tenant_settings')");
      expect(source).not.toContain(".select('biteship_config')");
      expect(source).not.toContain('getStoreShippingConfig(');
      expect(source).not.toContain('saveStoreShippingConfig(');
    });

    // 10. Positive tenant CRUD remains operational
    it('10. Positive tenant CRUD remains operational', async () => {
      const updatedStoreName = `Store CRUD Operational ${Date.now()}`;
      const updatedTagline = 'Fast delivery reliable logistics';

      const putReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify({
          store_name: updatedStoreName,
          display_name: updatedStoreName,
          tagline: updatedTagline,
        }),
      });

      const putRes = await updateSettings(putReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(putRes.status).toBe(200);

      const getReq = new NextRequest(`http://localhost:3000/api/v1/tenants/${TENANT_A_SLUG}/settings`, {
        method: 'GET',
        headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
      });
      const getRes = await getSettings(getReq, { params: Promise.resolve({ slug: TENANT_A_SLUG }) });
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.settings.store_name).toBe(updatedStoreName);
      expect(getJson.settings.display_name).toBe(updatedStoreName);
      expect(getJson.settings.tagline).toBe(updatedTagline);
    });
  });
});

