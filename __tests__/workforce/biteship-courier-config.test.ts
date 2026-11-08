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
  let pgClient: Client;
  const timestamp = Date.now();

  const TENANT_A_SLUG = `biteship-a-${timestamp}`;
  const TENANT_B_SLUG = `biteship-b-${timestamp}`;
  let tenantAId: string;
  let tenantBId: string;

  const USER_OWNER_A = crypto.randomUUID();
  const USER_CS_A = crypto.randomUUID();
  const USER_OWNER_B = crypto.randomUUID();

  let tokenOwnerA: string;
  let tokenCsA: string;
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
        ($5, $6, $7, 'OWNER', true)
    `, [tenantAId, TENANT_A_SLUG, USER_OWNER_A, USER_CS_A, tenantBId, TENANT_B_SLUG, USER_OWNER_B]);

    // Sign tokens
    tokenOwnerA = signMerchantSessionToken({ tenantSlug: TENANT_A_SLUG, tenantId: tenantAId, role: 'OWNER', userId: USER_OWNER_A });
    tokenCsA = signMerchantSessionToken({ tenantSlug: TENANT_A_SLUG, tenantId: tenantAId, role: 'CS', userId: USER_CS_A });
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
});

