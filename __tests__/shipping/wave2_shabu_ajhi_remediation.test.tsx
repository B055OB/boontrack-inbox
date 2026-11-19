/**
 * __tests__/shipping/wave2_shabu_ajhi_remediation.test.tsx
 *
 * Isolated Wave 2 (Shabu Ajhi) Regression & Security Verification Suite.
 * Covers all CTO-mandated Phase 2 verification criteria:
 *  1. Save/reload round-trip via GET/POST /api/v1/shipping/config & InstantCourier.tsx helpers
 *  2. Strict tenant isolation, RLS gateway enforcement, Lincah secret stripping, & metadata preservation
 *  3. Authoritative radius policy (30 km generic vs 40 km F&B, unsynced biteship_config protection,
 *     1–60 km synchronized overrides, <=3 km free, >26 km +Rp 7k/km surcharge, <=40.0 eligible vs >40.0 rejected,
 *     zero unbounded surcharge) across BOTH /api/v1/shipping/rates and /api/v1/shipping/rates/instant
 *  4. Fail-closed unknown tenant / missing origin / missing destination & zero Bandung fallback
 *  5. WhatsApp auto-reply (lib/shipping/instant-shipping-service.ts) unified coordinate/radius alignment
 *  6. Storefront delivery fee calculation, sticky summary & WhatsApp total (sub/ongkir/distance/grand total)
 *     for both <5 packages and >=5 Live Cooking packages, plus zero hardcoded WA phone / logo assets
 */

import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import * as supabaseClient from '@/lib/supabaseClient';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';
import { GET as getShippingConfig, POST as saveShippingConfig } from '@/app/api/v1/shipping/config/route';
import { POST as calculateShippingRates } from '@/app/api/v1/shipping/rates/route';
import {
  POST as calculateInstantRates,
  calculateDistanceKm,
  calculateRoadDistanceKm,
  resolveEffectiveInstantRadius,
} from '@/app/api/v1/shipping/rates/instant/route';
import {
  extractOutletCoordinates,
  computeInstantCourierRates,
  sendInstantShippingRecommendation,
} from '@/lib/shipping/instant-shipping-service';
import {
  fetchFnbShippingConfig,
  saveFnbShippingConfig,
} from '@/app/[tenant]/dashboard/components/modules/fnb-culinary/InstantCourier';
import FnbCateringStorefrontView, {
  buildCateringWhatsAppUrl,
  buildLiveCookingWhatsAppUrl,
  requestCateringDeliveryQuote,
  resolveCateringStickySummary,
} from '@/app/[tenant]/components/templates/FnbCateringStorefrontView';

type TenantRow = {
  id: string;
  slug: string;
  name?: string;
  metadata: Record<string, any>;
  updated_at?: string;
};

type TenantSettingsRow = {
  tenant_slug: string;
  biteship_config: Record<string, any>;
  updated_at?: string;
};

function createStatefulSupabaseMock(initial?: {
  tenants?: TenantRow[];
  settings?: TenantSettingsRow[];
  whatsappConnections?: Array<Record<string, any>>;
  activeOrders?: Array<Record<string, any>>;
}) {
  const tenants = new Map<string, TenantRow>();
  for (const t of initial?.tenants || []) {
    tenants.set(t.slug, JSON.parse(JSON.stringify(t)));
  }

  const settings = new Map<string, TenantSettingsRow>();
  for (const s of initial?.settings || []) {
    settings.set(s.tenant_slug, JSON.parse(JSON.stringify(s)));
  }

  const outboundMessages: Array<{ url: string; payload: any }> = [];
  const whatsappConnections = initial?.whatsappConnections || [];
  const activeOrders = initial?.activeOrders || [];

  const from = (tableName: string) => {
    const filters: Array<{ col: string; val: any; op: 'eq' | 'ilike' | 'or' }> = [];
    let pendingUpdate: any = null;
    let pendingUpsert: any = null;

    const resolveRows = () => {
      let rows: any[] = [];
      if (tableName === 'tenants') rows = Array.from(tenants.values());
      else if (tableName === 'tenant_settings') rows = Array.from(settings.values());
      else if (tableName === 'whatsapp_connections') rows = [...whatsappConnections];
      else if (tableName === 'orders') rows = [...activeOrders];
      else rows = [];

      for (const f of filters) {
        if (f.op === 'eq') {
          rows = rows.filter((r) => r[f.col] === f.val);
        } else if (f.op === 'ilike') {
          rows = rows.filter(
            (r) => String(r[f.col] || '').toLowerCase() === String(f.val || '').toLowerCase()
          );
        } else if (f.op === 'or') {
          const clauses = String(f.val).split(',').map((c) => c.trim());
          rows = rows.filter((r) =>
            clauses.some((clause) => {
              const eqIdx = clause.indexOf('.eq.');
              if (eqIdx === -1) return false;
              const col = clause.slice(0, eqIdx);
              const val = clause.slice(eqIdx + 4);
              return String(r[col] ?? '') === val;
            })
          );
        }
      }
      return rows;
    };

    const execute = async (mode: 'single' | 'many') => {
      if (pendingUpsert && tableName === 'tenant_settings') {
        const rows = Array.isArray(pendingUpsert) ? pendingUpsert : [pendingUpsert];
        for (const r of rows) {
          const key = String(r.tenant_slug || '');
          const prev = settings.get(key) || { tenant_slug: key, biteship_config: {} };
          settings.set(key, { ...prev, ...JSON.parse(JSON.stringify(r)) });
        }
        return { data: rows[0], error: null };
      }

      if (pendingUpdate && tableName === 'tenants') {
        const matched = resolveRows();
        for (const m of matched) {
          const updated = { ...m, ...JSON.parse(JSON.stringify(pendingUpdate)) };
          tenants.set(updated.slug, updated);
        }
        return { data: matched, error: null };
      }

      const matched = resolveRows();
      if (mode === 'single') {
        return { data: matched[0] ? JSON.parse(JSON.stringify(matched[0])) : null, error: null };
      }
      return { data: JSON.parse(JSON.stringify(matched)), error: null };
    };

    const builder: any = {
      select: () => builder,
      eq: (col: string, val: any) => {
        filters.push({ col, val, op: 'eq' });
        return builder;
      },
      ilike: (col: string, val: any) => {
        filters.push({ col, val, op: 'ilike' });
        return builder;
      },
      or: (expr: string) => {
        filters.push({ col: '', val: expr, op: 'or' });
        return builder;
      },
      in: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: () => builder,
      update: (payload: any) => {
        pendingUpdate = payload;
        return builder;
      },
      upsert: (payload: any) => {
        pendingUpsert = payload;
        return builder;
      },
      insert: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => execute('single'),
      single: () => execute('single'),
      then: (resolve: any, reject: any) => execute('many').then(resolve, reject),
    };
    return builder;
  };

  return {
    tenants,
    settings,
    outboundMessages,
    client: { from },
  };
}

function makeMerchantReq(
  url: string,
  method: 'GET' | 'POST',
  body?: Record<string, any>,
  session?: { tenantSlug: string; tenantId?: string; role?: 'OWNER' | 'MERCHANT' | 'CS' | 'OPERATOR' }
) {
  const headers: Record<string, string> = {};
  if (body) headers['content-type'] = 'application/json';
  if (session) {
    const token = signMerchantSessionToken({
      tenantSlug: session.tenantSlug,
      tenantId: session.tenantId,
      role: session.role || 'OWNER',
    });
    headers.cookie = `bt_merchant_token=${token}`;
  }
  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Wave 2 (Shabu Ajhi) Remediation Verification Suite', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // =========================================================================
  // 1. ZERO BROWSER ANON DB WRITES, ROUND-TRIP SAVE/RELOAD & TENANT ISOLATION
  // =========================================================================
  describe('1. Shipping Config Gateway, Round-Trip Persistence & Tenant Isolation', () => {
    it('InstantCourier.tsx contains no browser anon Supabase calls and no hardcoded tenant slug checks', () => {
      const src = fs.readFileSync(
        path.join(
          process.cwd(),
          'app/[tenant]/dashboard/components/modules/fnb-culinary/InstantCourier.tsx'
        ),
        'utf-8'
      );

      expect(src).not.toContain('getSupabase(');
      expect(src).not.toContain("from('tenant_settings')");
      expect(src).not.toContain("from('tenants')");
      expect(src).not.toContain("tenantSlug === 'shabu-ajhi'");
      expect(src).toContain('/api/v1/shipping/config');
      expect(src).toContain("credentials: 'include'");
      expect(src).not.toContain('step="0.0001"');
      expect(src.match(/step="any"/g)?.length).toBeGreaterThanOrEqual(2);
    });

    it('enforces 401 unauthorized, 403 cross-tenant, and 404 unknown-tenant on GET & POST /api/v1/shipping/config', async () => {
      const store = createStatefulSupabaseMock({
        tenants: [
          {
            id: '70c1ea8c-3557-44af-b131-faae75a8b17f',
            slug: 'shabu-ajhi',
            metadata: { fnb_catering: { is_enabled: true } },
          },
          {
            id: '11111111-2222-4333-8444-555555555555',
            slug: 'other-store',
            metadata: {},
          },
        ],
      });
      jest.spyOn(supabaseClient, 'getSupabaseAdmin').mockReturnValue(store.client as any);

      // 401 unauthenticated GET & POST
      const anonGet = await getShippingConfig(
        makeMerchantReq('http://localhost/api/v1/shipping/config?tenant=shabu-ajhi', 'GET')
      );
      expect(anonGet.status).toBe(401);

      const anonPost = await saveShippingConfig(
        makeMerchantReq('http://localhost/api/v1/shipping/config', 'POST', {
          tenant_slug: 'shabu-ajhi',
          fnb_settings: { max_radius_km: 40 },
        })
      );
      expect(anonPost.status).toBe(401);

      // 403 cross-tenant attacker holding token for 'other-store'
      const crossGet = await getShippingConfig(
        makeMerchantReq('http://localhost/api/v1/shipping/config?tenant=shabu-ajhi', 'GET', undefined, {
          tenantSlug: 'other-store',
          tenantId: '11111111-2222-4333-8444-555555555555',
        })
      );
      expect(crossGet.status).toBe(403);

      const crossPost = await saveShippingConfig(
        makeMerchantReq(
          'http://localhost/api/v1/shipping/config',
          'POST',
          { tenant_slug: 'shabu-ajhi', fnb_settings: { max_radius_km: 10 } },
          { tenantSlug: 'other-store', tenantId: '11111111-2222-4333-8444-555555555555' }
        )
      );
      expect(crossPost.status).toBe(403);

      // 404 unknown tenant even with matching slug token
      const unknownGet = await getShippingConfig(
        makeMerchantReq('http://localhost/api/v1/shipping/config?tenant=ghost-tenant', 'GET', undefined, {
          tenantSlug: 'ghost-tenant',
        })
      );
      expect(unknownGet.status).toBe(404);
    });

    it('persists save/reload round-trip via InstantCourier helpers and preserves unrelated metadata & self-pickup state', async () => {
      const tenantId = '70c1ea8c-3557-44af-b131-faae75a8b17f';
      const store = createStatefulSupabaseMock({
        tenants: [
          {
            id: tenantId,
            slug: 'catering-sample',
            metadata: {
              fnb_catering: {
                is_enabled: true,
                soup_variants: ['Tomyum', 'Kaldu Ayam'],
                handover_whatsapp: '628111222333',
              },
              custom_brand_tagline: 'Do Not Clobber Me',
              logistics: { primary: 'internal_fleet', max_internal_trip_per_slot: 4 },
              shipping_config: {
                tier_mode: 'CATERING_13_TIER',
                internal_courier: { label: 'Armada Toko PP', max_radius_km: 40 },
              },
            },
          },
        ],
        settings: [
          {
            tenant_slug: 'catering-sample',
            biteship_config: {
              is_enabled: true,
              is_self_pickup_enabled: true,
              pickup_address: 'Jl. Dapur Utama No. 1',
              origin: { postal_code: '40288' },
              fnb_settings: { max_radius_km: 30 }, // Unsynced legacy UI value (no updated_at / radius_synced_at)
              lincah: { provider: 'lincah', api_key: 'secret-lincah-123', is_connected: true },
            },
          },
        ],
      });
      jest.spyOn(supabaseClient, 'getSupabaseAdmin').mockReturnValue(store.client as any);

      const session = { tenantSlug: 'catering-sample', tenantId, role: 'OWNER' as const };
      const mockedFetch: typeof fetch = (async (input: any, init?: any) => {
        const rawUrl = typeof input === 'string' ? input : input?.url;
        const fullUrl = rawUrl.startsWith('http') ? rawUrl : `http://localhost${rawUrl}`;
        const headers: Record<string, string> = {
          cookie: `bt_merchant_token=${signMerchantSessionToken(session)}`,
        };
        if (init?.headers) {
          Object.assign(headers, init.headers);
        }
        const req = new NextRequest(fullUrl, {
          method: init?.method || 'GET',
          headers,
          body: init?.body,
        });
        return (init?.method || 'GET').toUpperCase() === 'POST'
          ? saveShippingConfig(req)
          : getShippingConfig(req);
      }) as any;

      // Initial GET before save must resolve 40 km (not unsynced 30 km)
      const initialLoaded = await fetchFnbShippingConfig('catering-sample', mockedFetch);
      expect(initialLoaded.maxRadiusKm).toBe(40);
      expect(initialLoaded.isCatering).toBe(true);

      // Save new coordinates + override radius 35 km
      const saved = await saveFnbShippingConfig(
        {
          tenantSlug: 'catering-sample',
          isFnbCatering: true,
          kitchenAddress: 'Jl. Setiabudi No. 88, Bandung',
          latitude: -6.8712,
          longitude: 107.5934,
          maxRadiusKm: 35,
          kitchenHours: '07:00 - 21:00 WIB',
          instantProvider: 'INTERNAL_LALAMOVE',
        },
        mockedFetch
      );
      expect(saved.maxRadiusKm).toBe(35);

      // Verify reload round-trip matches exactly
      const reloaded = await fetchFnbShippingConfig('catering-sample', mockedFetch);
      expect(reloaded.kitchenAddress).toBe('Jl. Setiabudi No. 88, Bandung');
      expect(reloaded.latitude).toBe('-6.8712');
      expect(reloaded.longitude).toBe('107.5934');
      expect(reloaded.maxRadiusKm).toBe(35);
      expect(reloaded.kitchenHours).toBe('07:00 - 21:00 WIB');

      // Verify DB sync & unrelated metadata preservation
      const dbTenant = store.tenants.get('catering-sample')!;
      expect(dbTenant.metadata.custom_brand_tagline).toBe('Do Not Clobber Me');
      expect(dbTenant.metadata.fnb_catering).toEqual({
        is_enabled: true,
        soup_variants: ['Tomyum', 'Kaldu Ayam'],
        handover_whatsapp: '628111222333',
      });
      expect(dbTenant.metadata.outlet_coordinates).toEqual({
        latitude: -6.8712,
        longitude: 107.5934,
        address: 'Jl. Setiabudi No. 88, Bandung',
      });
      expect(dbTenant.metadata.shipping_config.max_radius_km).toBe(35);
      expect(dbTenant.metadata.shipping_config.internal_courier.max_radius_km).toBe(35);
      expect(dbTenant.metadata.shipping_config.lincah).toBeUndefined();

      const dbSettings = store.settings.get('catering-sample')!;
      expect(dbSettings.biteship_config.is_self_pickup_enabled).toBe(true);
      expect(dbSettings.biteship_config.origin.latitude).toBe(-6.8712);
      expect(dbSettings.biteship_config.origin.longitude).toBe(107.5934);
      expect(dbSettings.biteship_config.origin.postal_code).toBe('40288');
      expect(dbSettings.biteship_config.fnb_settings.radius_synced_at).toBeTruthy();

      // Explicit error propagation on HTTP failure
      const failFetch: typeof fetch = (async () =>
        new NextRequest('http://localhost/x') &&
        new Response(JSON.stringify({ success: false, error: 'FORBIDDEN' }), { status: 403 })) as any;
      await expect(fetchFnbShippingConfig('catering-sample', failFetch)).rejects.toThrow();
    });

    it('rejects invalid radius (0, 61, NaN) and invalid coordinates (-91, 200)', async () => {
      const tenantId = '70c1ea8c-3557-44af-b131-faae75a8b17f';
      const store = createStatefulSupabaseMock({
        tenants: [{ id: tenantId, slug: 'catering-sample', metadata: {} }],
      });
      jest.spyOn(supabaseClient, 'getSupabaseAdmin').mockReturnValue(store.client as any);

      for (const badRadius of [0, -5, 61, 'abc']) {
        const res = await saveShippingConfig(
          makeMerchantReq(
            'http://localhost/api/v1/shipping/config',
            'POST',
            { tenant_slug: 'catering-sample', fnb_settings: { max_radius_km: badRadius } },
            { tenantSlug: 'catering-sample', tenantId }
          )
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('INVALID_MAX_RADIUS');
      }

      const badCoordRes = await saveShippingConfig(
        makeMerchantReq(
          'http://localhost/api/v1/shipping/config',
          'POST',
          { tenant_slug: 'catering-sample', fnb_settings: { latitude: -95, longitude: 107 } },
          { tenantSlug: 'catering-sample', tenantId }
        )
      );
      expect(badCoordRes.status).toBe(400);
      const coordBody = await badCoordRes.json();
      expect(coordBody.error).toBe('INVALID_COORDINATES');
    });

    it('partial POST /api/v1/shipping/config without max_radius_km does NOT downgrade 40 km -> 30 km or stamp radius_synced_at', async () => {
      const tenantId = '70c1ea8c-3557-44af-b131-faae75a8b17f';
      const ORIGIN_LAT = -6.9813378;
      const ORIGIN_LNG = 107.6357281;
      const DEST_32KM = -6.759;

      const store = createStatefulSupabaseMock({
        tenants: [
          {
            id: tenantId,
            slug: 'catering-partial-save',
            metadata: {
              fnb_catering: { is_enabled: true },
              shipping_config: {
                tier_mode: 'CATERING_13_TIER',
                max_radius_km: 40,
                internal_courier: { label: 'Armada Toko PP', max_radius_km: 40 },
                fnb_settings: {
                  latitude: ORIGIN_LAT,
                  longitude: ORIGIN_LNG,
                  max_radius_km: 40,
                  kitchen_address: 'Jl. Lama',
                },
              },
              fnb_settings: { max_radius_km: 40 },
            },
          },
        ],
        settings: [
          {
            tenant_slug: 'catering-partial-save',
            biteship_config: {
              is_enabled: true,
              fnb_settings: {
                latitude: -6.9813378274882,
                longitude: 107.63572810608962,
                max_radius_km: 30, // Unsynced legacy value (no updated_at / radius_synced_at)
              },
            },
          },
        ],
      });
      jest.spyOn(supabaseClient, 'getSupabaseAdmin').mockReturnValue(store.client as any);

      // Simulate BiteshipCourierConfig saving only kitchen_address + spoofed radius_synced_at attempt
      const partialRes = await saveShippingConfig(
        makeMerchantReq(
          'http://localhost/api/v1/shipping/config',
          'POST',
          {
            tenant_slug: 'catering-partial-save',
            origin_address: 'Jl. Dapur Baru No. 9',
            fnb_settings: {
              kitchen_address: 'Jl. Dapur Baru No. 9',
              radius_synced_at: '2099-01-01T00:00:00Z',
            },
          },
          { tenantSlug: 'catering-partial-save', tenantId, role: 'OWNER' }
        )
      );
      expect(partialRes.status).toBe(200);
      const partialBody = await partialRes.json();
      expect(partialBody.store_context.effective_max_radius_km).toBe(40);

      // Authoritative 40 km in tenants.metadata is preserved; unsynced 30 is NOT copied or stamped
      const dbTenant = store.tenants.get('catering-partial-save')!;
      expect(dbTenant.metadata.shipping_config.max_radius_km).toBe(40);
      expect(dbTenant.metadata.shipping_config.fnb_settings.max_radius_km).toBe(40);
      expect(dbTenant.metadata.shipping_config.internal_courier.max_radius_km).toBe(40);
      expect(dbTenant.metadata.fnb_settings.max_radius_km).toBe(40);
      expect(dbTenant.metadata.shipping_config.fnb_settings.kitchen_address).toBe('Jl. Dapur Baru No. 9');

      const dbSettings = store.settings.get('catering-partial-save')!;
      expect(dbSettings.biteship_config.fnb_settings.radius_synced_at).toBeUndefined();
      expect(dbSettings.biteship_config.fnb_settings.max_radius_km).toBeUndefined();

      // GET /api/v1/shipping/config & BOTH rate endpoints at 32.1 km still honor 40 km
      const reloaded = await getShippingConfig(
        makeMerchantReq(
          'http://localhost/api/v1/shipping/config?tenant=catering-partial-save',
          'GET',
          undefined,
          { tenantSlug: 'catering-partial-save', tenantId, role: 'OWNER' }
        )
      );
      const reloadedJson = await reloaded.json();
      expect(reloadedJson.store_context.effective_max_radius_km).toBe(40);

      const ratePayload = {
        slug: 'catering-partial-save',
        destination_latitude: DEST_32KM,
        destination_longitude: ORIGIN_LNG,
        items: [{ name: 'Paket Oishi', quantity: 1, price: 250000 }],
      };
      const [ratesRes, instRes] = await Promise.all([
        calculateShippingRates(
          new NextRequest('http://localhost/api/v1/shipping/rates', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(ratePayload),
          })
        ),
        calculateInstantRates(
          new NextRequest('http://localhost/api/v1/shipping/rates/instant', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(ratePayload),
          })
        ),
      ]);
      const ratesData = await ratesRes.json();
      const instData = await instRes.json();
      expect(ratesData.max_radius_km).toBe(40);
      expect(ratesData.instant_eligible).toBe(true);
      expect(instData.max_radius_km).toBe(40);
      expect(instData.is_instant_eligible).toBe(true);

      // Previously synced 35 km override is preserved (and timestamp not overwritten) on partial save
      await saveShippingConfig(
        makeMerchantReq(
          'http://localhost/api/v1/shipping/config',
          'POST',
          {
            tenant_slug: 'catering-partial-save',
            fnb_settings: { max_radius_km: 35, latitude: ORIGIN_LAT, longitude: ORIGIN_LNG },
          },
          { tenantSlug: 'catering-partial-save', tenantId, role: 'OWNER' }
        )
      );
      const syncedTimestampBefore =
        store.settings.get('catering-partial-save')!.biteship_config.fnb_settings.radius_synced_at;
      expect(syncedTimestampBefore).toBeTruthy();

      const afterSyncedPartial = await saveShippingConfig(
        makeMerchantReq(
          'http://localhost/api/v1/shipping/config',
          'POST',
          {
            tenant_slug: 'catering-partial-save',
            fnb_settings: { kitchen_address: 'Jl. Dapur Re-Saved' },
          },
          { tenantSlug: 'catering-partial-save', tenantId, role: 'OWNER' }
        )
      );
      const afterSyncedJson = await afterSyncedPartial.json();
      expect(afterSyncedJson.store_context.effective_max_radius_km).toBe(35);
      expect(
        store.settings.get('catering-partial-save')!.biteship_config.fnb_settings.radius_synced_at
      ).toBe(syncedTimestampBefore);
    });
  });

  // =========================================================================
  // 2. AUTHORITATIVE RADIUS POLICY & FAIL-CLOSED CONSISTENCY ACROSS BOTH RATE ROUTES
  // =========================================================================
  describe('2. Authoritative Radius Policy & Consistent Rate Enforcement', () => {
    const ORIGIN_LAT = -6.9813378;
    const ORIGIN_LNG = 107.6357281;
    // Exact straight * 1.30 road distances from ORIGIN_LAT/ORIGIN_LNG along same longitude:
    const DEST_WITHIN_3KM = -6.9633378; // ~2.6 km road
    const DEST_EXTREME_27KM = -6.79248; // ~27.3 km road (>26 km surcharge)
    const DEST_AT_40KM = -6.70435; // ~40.0 km road (eligible boundary)
    const DEST_OVER_40KM = -6.70345; // ~40.2 km road (out of 40 km range)
    const DEST_45KM = -6.669; // ~45.1 km road (within 50 km override, rejected at 40 km)
    const DEST_32KM = -6.759; // ~32.1 km road (rejected for 30 km generic, accepted for 40 km F&B)

    it('enforces 30 km generic vs 40 km F&B and shields against unsynced tenant_settings=30 split-brain', async () => {
      const store = createStatefulSupabaseMock({
        tenants: [
          {
            id: 'fnb-tenant-uuid',
            slug: 'catering-split-brain',
            metadata: {
              fnb_catering: { is_enabled: true },
              shipping_config: {
                tier_mode: 'CATERING_13_TIER',
                max_radius_km: 40,
                internal_courier: { label: 'Armada Toko PP', max_radius_km: 40 },
                fnb_settings: { latitude: ORIGIN_LAT, longitude: ORIGIN_LNG, max_radius_km: 40 },
              },
            },
          },
          {
            id: 'retail-tenant-uuid',
            slug: 'generic-fashion-store',
            metadata: {
              business_category: 'FASHION',
              shipping_config: {
                origin: { latitude: ORIGIN_LAT, longitude: ORIGIN_LNG, city: 'Kota Bandung' },
              },
            },
          },
        ],
        settings: [
          {
            tenant_slug: 'catering-split-brain',
            biteship_config: {
              is_enabled: true,
              fnb_settings: {
                latitude: ORIGIN_LAT,
                longitude: ORIGIN_LNG,
                max_radius_km: 30, // Unsynced legacy value (NO radius_synced_at / updated_at)
              },
            },
          },
          {
            tenant_slug: 'generic-fashion-store',
            biteship_config: {
              is_enabled: true,
              origin: { latitude: ORIGIN_LAT, longitude: ORIGIN_LNG, postal_code: '40287' },
            },
          },
        ],
      });
      jest.spyOn(supabaseClient, 'getSupabaseAdmin').mockReturnValue(store.client as any);
      // Prove /rates/instant uses getSupabaseAdmin (not browser getSupabase)
      const getSupabaseSpy = jest
        .spyOn(supabaseClient, 'getSupabase')
        .mockReturnValue(null as any);

      // Direct unit check on resolveEffectiveInstantRadius
      expect(resolveEffectiveInstantRadius(undefined, undefined, undefined, false)).toBe(30);
      expect(
        resolveEffectiveInstantRadius(
          { fnb_settings: { max_radius_km: 30 } },
          { max_radius_km: 40 },
          { fnb_catering: true }
        )
      ).toBe(40);
      expect(
        resolveEffectiveInstantRadius(
          { fnb_settings: { max_radius_km: 25, radius_synced_at: '2026-11-19T00:00:00Z' } },
          { max_radius_km: 40 },
          { fnb_catering: true }
        )
      ).toBe(25);

      // Generic 32 km -> rejected (max_radius_km = 30) in both routes
      const genericPayload = {
        slug: 'generic-fashion-store',
        destination_latitude: DEST_32KM,
        destination_longitude: ORIGIN_LNG,
        destination_city: 'Kota Bandung',
        destination_postal_code: '40115',
      };
      const [gRatesRes, gInstRes] = await Promise.all([
        calculateShippingRates(
          new NextRequest('http://localhost/api/v1/shipping/rates', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(genericPayload),
          })
        ),
        calculateInstantRates(
          new NextRequest('http://localhost/api/v1/shipping/rates/instant', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(genericPayload),
          })
        ),
      ]);
      const gRates = await gRatesRes.json();
      const gInst = await gInstRes.json();
      expect(gRates.max_radius_km).toBe(30);
      expect(gRates.instant_eligible).toBe(false);
      expect(gInst.max_radius_km).toBe(30);
      expect(gInst.is_instant_eligible).toBe(false);
      expect(getSupabaseSpy).not.toHaveBeenCalled();

      // Unsynced F&B split-brain at 32 km -> MUST resolve 40 km & succeed in BOTH routes
      const cateringItems = [{ name: 'Paket Oishi', quantity: 1, price: 250000 }];
      const fnb32Payload = {
        slug: 'catering-split-brain',
        destination_latitude: DEST_32KM,
        destination_longitude: ORIGIN_LNG,
        items: cateringItems,
      };
      const [fRatesRes, fInstRes] = await Promise.all([
        calculateShippingRates(
          new NextRequest('http://localhost/api/v1/shipping/rates', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(fnb32Payload),
          })
        ),
        calculateInstantRates(
          new NextRequest('http://localhost/api/v1/shipping/rates/instant', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(fnb32Payload),
          })
        ),
      ]);
      const fRates = await fRatesRes.json();
      const fInst = await fInstRes.json();
      expect(fRates.max_radius_km).toBe(40);
      expect(fRates.instant_eligible).toBe(true);
      expect(fRates.rates.length).toBeGreaterThan(0);
      expect(fInst.max_radius_km).toBe(40);
      expect(fInst.is_instant_eligible).toBe(true);
      expect(fInst.rates.length).toBeGreaterThan(0);
      expect(fRates.rates[0].price).toBe(fInst.rates[0].price);
    });

    it('verifies 0-3 km free, >26 km extreme surcharge, 40.0 km eligible, and >40.0 km fail-closed (no unbounded surcharge)', async () => {
      const store = createStatefulSupabaseMock({
        tenants: [
          {
            id: 'fnb-tenant-uuid',
            slug: 'catering-store',
            metadata: {
              fnb_catering: { is_enabled: true },
              shipping_config: {
                tier_mode: 'CATERING_13_TIER',
                max_radius_km: 40,
                fnb_settings: { latitude: ORIGIN_LAT, longitude: ORIGIN_LNG, max_radius_km: 40 },
              },
            },
          },
        ],
        settings: [
          {
            tenant_slug: 'catering-store',
            biteship_config: {
              is_enabled: true,
              fnb_settings: {
                latitude: ORIGIN_LAT,
                longitude: ORIGIN_LNG,
                max_radius_km: 40,
                radius_synced_at: '2026-11-19T00:00:00Z',
              },
            },
          },
        ],
      });
      jest.spyOn(supabaseClient, 'getSupabaseAdmin').mockReturnValue(store.client as any);

      const cateringItems = [{ name: 'Paket Oishi', quantity: 1, price: 250000 }];

      const callBoth = async (lat: number) => {
        const body = {
          slug: 'catering-store',
          destination_latitude: lat,
          destination_longitude: ORIGIN_LNG,
          items: cateringItems,
        };
        const [r1, r2] = await Promise.all([
          calculateShippingRates(
            new NextRequest('http://localhost/api/v1/shipping/rates', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            })
          ),
          calculateInstantRates(
            new NextRequest('http://localhost/api/v1/shipping/rates/instant', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            })
          ),
        ]);
        return [await r1.json(), await r2.json()];
      };

      // A. <= 3 km catering package -> Rp 0
      const [freeR, freeI] = await callBoth(DEST_WITHIN_3KM);
      expect(freeR.distance_km).toBeLessThanOrEqual(3);
      expect(freeR.rates[0].price).toBe(0);
      expect(freeI.rates[0].price).toBe(0);

      // B. > 26 km (27.3 km) -> +Rp 7,000/km surcharge on top of 26 km base (100,000)
      const [surR, surI] = await callBoth(DEST_EXTREME_27KM);
      expect(surR.distance_km).toBeGreaterThan(26);
      expect(surR.distance_km).toBeLessThanOrEqual(40);
      expect(surR.instant_eligible).toBe(true);
      expect(surR.rates[0].price).toBeGreaterThan(100000);
      expect(surR.rates[0].price).toBe(surI.rates[0].price);

      // C. 40.0 km boundary -> still eligible with surcharge
      const road40 = calculateRoadDistanceKm(ORIGIN_LAT, ORIGIN_LNG, DEST_AT_40KM, ORIGIN_LNG);
      expect(road40).toBeLessThanOrEqual(40);
      const [at40R, at40I] = await callBoth(DEST_AT_40KM);
      expect(at40R.instant_eligible).toBe(true);
      expect(at40R.rates.length).toBe(1);
      expect(at40I.is_instant_eligible).toBe(true);
      expect(at40I.rates.length).toBe(1);
      expect(at40R.rates[0].price).toBe(at40I.rates[0].price);

      // D. 40.2 km (> 40 km) -> STRICT FAIL-CLOSED, zero unbounded surcharge
      const roadOver40 = calculateRoadDistanceKm(ORIGIN_LAT, ORIGIN_LNG, DEST_OVER_40KM, ORIGIN_LNG);
      expect(roadOver40).toBeGreaterThan(40);
      const [overR, overI] = await callBoth(DEST_OVER_40KM);
      expect(overR.coverage).toBe(false);
      expect(overR.instant_eligible).toBe(false);
      expect(overR.out_of_range).toBe(true);
      expect(overR.rates).toEqual([]);
      expect(overI.coverage).toBe(false);
      expect(overI.is_instant_eligible).toBe(false);
      expect(overI.out_of_range).toBe(true);
      expect(overI.rates).toEqual([]);

      // E. Far distance (65+ km) -> NEVER computes unbounded +7,000/km surcharge
      const [farR, farI] = await callBoth(-6.35);
      expect(farR.coverage).toBe(false);
      expect(farR.rates).toEqual([]);
      expect(farI.coverage).toBe(false);
      expect(farI.rates).toEqual([]);
    });

    it('honors synchronized 25 km & 50 km overrides in both rates endpoints', async () => {
      const store = createStatefulSupabaseMock({
        tenants: [
          {
            id: 'fnb-override-uuid',
            slug: 'catering-override',
            metadata: {
              fnb_catering: { is_enabled: true },
              shipping_config: {
                tier_mode: 'CATERING_13_TIER',
                max_radius_km: 50,
                fnb_settings: { latitude: ORIGIN_LAT, longitude: ORIGIN_LNG, max_radius_km: 50 },
              },
            },
          },
        ],
        settings: [
          {
            tenant_slug: 'catering-override',
            biteship_config: {
              is_enabled: true,
              fnb_settings: {
                latitude: ORIGIN_LAT,
                longitude: ORIGIN_LNG,
                max_radius_km: 50,
                radius_synced_at: '2026-11-19T01:00:00Z',
              },
            },
          },
        ],
      });
      jest.spyOn(supabaseClient, 'getSupabaseAdmin').mockReturnValue(store.client as any);

      // 45 km is allowed under synchronized 50 km override
      const body45 = {
        slug: 'catering-override',
        destination_latitude: DEST_45KM,
        destination_longitude: ORIGIN_LNG,
        items: [{ name: 'Paket Oishi', quantity: 1, price: 250000 }],
      };
      const [r45, i45] = await Promise.all([
        calculateShippingRates(
          new NextRequest('http://localhost/api/v1/shipping/rates', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body45),
          })
        ),
        calculateInstantRates(
          new NextRequest('http://localhost/api/v1/shipping/rates/instant', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body45),
          })
        ),
      ]);
      const dataR45 = await r45.json();
      const dataI45 = await i45.json();
      expect(dataR45.max_radius_km).toBe(50);
      expect(dataR45.instant_eligible).toBe(true);
      expect(dataI45.max_radius_km).toBe(50);
      expect(dataI45.is_instant_eligible).toBe(true);
      expect(dataR45.rates[0].price).toBe(dataI45.rates[0].price);

      // Now synchronize down to 25 km -> 27.3 km rejected
      const t = store.tenants.get('catering-override')!;
      t.metadata.shipping_config.max_radius_km = 25;
      t.metadata.shipping_config.fnb_settings.max_radius_km = 25;
      const s = store.settings.get('catering-override')!;
      s.biteship_config.fnb_settings.max_radius_km = 25;

      const body27 = {
        slug: 'catering-override',
        destination_latitude: DEST_EXTREME_27KM,
        destination_longitude: ORIGIN_LNG,
        items: [{ name: 'Paket Oishi', quantity: 1, price: 250000 }],
      };
      const [r27, i27] = await Promise.all([
        calculateShippingRates(
          new NextRequest('http://localhost/api/v1/shipping/rates', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body27),
          })
        ),
        calculateInstantRates(
          new NextRequest('http://localhost/api/v1/shipping/rates/instant', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body27),
          })
        ),
      ]);
      const dataR27 = await r27.json();
      const dataI27 = await i27.json();
      expect(dataR27.max_radius_km).toBe(25);
      expect(dataR27.instant_eligible).toBe(false);
      expect(dataR27.rates).toEqual([]);
      expect(dataI27.max_radius_km).toBe(25);
      expect(dataI27.is_instant_eligible).toBe(false);
      expect(dataI27.rates).toEqual([]);
    });

    it('fails closed on unknown tenant, unconfigured origin, or unresolved destination (zero Bandung fallback)', async () => {
      const store = createStatefulSupabaseMock({
        tenants: [
          {
            id: 'unconfigured-store-uuid',
            slug: 'unconfigured-store',
            metadata: { fnb_catering: { is_enabled: true } }, // No coordinates at all!
          },
          {
            id: 'configured-store-uuid',
            slug: 'configured-store',
            metadata: {
              shipping_config: { origin: { latitude: -6.2088, longitude: 106.8456 } },
            },
          },
        ],
      });
      jest.spyOn(supabaseClient, 'getSupabaseAdmin').mockReturnValue(store.client as any);

      // 1. Unknown tenant -> 404
      for (const handler of [calculateShippingRates, calculateInstantRates]) {
        const res = await handler(
          new NextRequest('http://localhost/api/v1/shipping/rates', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              slug: 'nonexistent-store-xyz',
              destination_latitude: -6.9,
              destination_longitude: 107.6,
            }),
          })
        );
        expect(res.status).toBe(404);
      }

      // 2. Existing tenant WITHOUT origin coordinates -> 422 ORIGIN_NOT_CONFIGURED (never Bandung!)
      for (const handler of [calculateShippingRates, calculateInstantRates]) {
        const res = await handler(
          new NextRequest('http://localhost/api/v1/shipping/rates', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              slug: 'unconfigured-store',
              destination_latitude: -6.9175,
              destination_longitude: 107.6191,
            }),
          })
        );
        expect(res.status).toBe(422);
        const body = await res.json();
        expect(body.error).toBe('ORIGIN_NOT_CONFIGURED');
      }

      // 3. Configured tenant with missing destination -> 400 (never Bandung!)
      for (const handler of [calculateShippingRates, calculateInstantRates]) {
        const res = await handler(
          new NextRequest('http://localhost/api/v1/shipping/rates', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              slug: 'configured-store',
            }),
          })
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error_code).toBe('DESTINATION_COORDINATES_REQUIRED');
      }
    });
  });

  // =========================================================================
  // 3. WHATSAPP AUTO-REPLY ALIGNMENT (lib/shipping/instant-shipping-service.ts)
  // =========================================================================
  describe('3. WhatsApp Auto-Reply Coordinate & Radius Alignment', () => {
    it('extractOutletCoordinates prioritizes biteship_config and does not fall back to Bandung', () => {
      const coords = extractOutletCoordinates(
        { shipping_config: { origin_city: 'Unrecognized City' } },
        'Unknown Kitchen',
        { fnb_settings: { latitude: -6.2146, longitude: 106.8451, kitchen_address: 'Jakarta Kitchen' } }
      );
      expect(coords).toEqual({
        latitude: -6.2146,
        longitude: 106.8451,
        name: 'Unknown Kitchen',
        address: 'Jakarta Kitchen',
        city: '',
      });

      // No Bandung silent fallback when city/postal unknown and coords absent
      const unresolved = extractOutletCoordinates({ shipping_config: { origin_city: 'Atlantis' } }, 'Store');
      expect(unresolved).toBeNull();
    });

    it('computeInstantCourierRates keeps standard instant rates (NOT 13-tier) and honors aligned radius', () => {
      // No config -> 30 km generic
      const generic = computeInstantCourierRates(32);
      expect(generic.maxRadiusKm).toBe(30);
      expect(generic.isEligible).toBe(false);

      // Unsynced biteshipConfig max_radius_km:30 does not downgrade F&B 40 km
      const splitBrain = computeInstantCourierRates(
        35,
        { max_radius_km: 40, internal_courier: { is_enabled: true } },
        { fnb_settings: { max_radius_km: 30 } },
        { fnb_catering: true }
      );
      expect(splitBrain.maxRadiusKm).toBe(40);
      expect(splitBrain.isEligible).toBe(true);
      expect(splitBrain.rates.some((r) => r.id === 'armada_motor' || r.id === 'armada_car')).toBe(true);
    });

    it('sendInstantShippingRecommendation reads biteship_config + enforces tenant isolation', async () => {
      const store = createStatefulSupabaseMock({
        tenants: [
          {
            id: 'wa-tenant-uuid',
            slug: 'shabu-wa-test',
            name: 'Dapur Test WA',
            metadata: {
              business_category: 'FOOD',
              fnb_catering: { is_enabled: true },
              shipping_config: {
                max_radius_km: 40,
                internal_courier: { is_enabled: true },
              },
            },
          },
        ],
        settings: [
          {
            tenant_slug: 'shabu-wa-test',
            biteship_config: {
              fnb_settings: {
                latitude: -6.9813378,
                longitude: 107.6357281,
                kitchen_address: 'Jl. Dapur Terpusat',
                max_radius_km: 30, // unsynced legacy value should NOT block 35 km F&B!
              },
            },
          },
        ],
        activeOrders: [
          {
            id: 'ord-1',
            tenant_id: 'wa-tenant-uuid',
            customer_phone: '6281234567890',
            status: 'pending',
          },
        ],
        whatsappConnections: [
          {
            tenant_id: 'wa-tenant-uuid',
            tenant_slug: 'shabu-wa-test',
            instance_name: 'inst_wa_test',
            status: 'open',
          },
        ],
      });
      jest.spyOn(supabaseClient, 'getSupabaseAdmin').mockReturnValue(store.client as any);

      // Mock Evolution API send call
      global.fetch = jest.fn(async () =>
        new Response(JSON.stringify({ key: { id: 'wamid-1' } }), { status: 200 })
      ) as any;

      // Distance ~34.6 km (> 30 km unsynced, <= 40 km authoritative F&B!) -> MUST be eligible!
      const resOk = await sendInstantShippingRecommendation({
        tenantId: 'wa-tenant-uuid',
        tenantSlug: 'shabu-wa-test',
        customerPhone: '6281234567890',
        locationData: { latitude: -6.67, longitude: 107.6357281, name: 'Lokasi Uji 34.6km' },
      });
      expect(resOk.success).toBe(true);
      expect(resOk.distanceKm).toBeGreaterThan(30);
      expect(resOk.distanceKm).toBeLessThanOrEqual(40);
      expect(resOk.rates?.length).toBe(2);

      // Distance ~43.5 km (> 40 km) -> MUST fail coverage cleanly
      const resOver = await sendInstantShippingRecommendation({
        tenantId: 'wa-tenant-uuid',
        tenantSlug: 'shabu-wa-test',
        customerPhone: '6281234567890',
        locationData: { latitude: -6.59, longitude: 107.6357281, name: 'Lokasi Uji 43.5km' },
      });
      expect(resOver.success).toBe(true);
      expect(resOver.distanceKm).toBeGreaterThan(40);
      expect(resOver.rates).toEqual([]);
      expect(resOver.sentMessage).toContain('40 km');

      // Fail closed on missing/unknown tenant
      const resMissing = await sendInstantShippingRecommendation({
        tenantId: 'nonexistent-wa-tenant',
        tenantSlug: 'nonexistent-wa-tenant',
        customerPhone: '6281234567890',
        locationData: { latitude: -6.98, longitude: 107.63 },
      });
      expect(resMissing.success).toBe(false);
    });
  });

  // =========================================================================
  // 4. STOREFRONT UI, DELIVERY FEE QUOTE & WHATSAPP GRAND TOTAL
  // =========================================================================
  describe('4. FnbCateringStorefrontView Delivery Fee, Dynamic WA & Zero Hardcoding', () => {
    it('contains zero hardcoded tenant WA phones (6285861091103 / 6289617799878) or hardcoded tenant logo fallback', () => {
      const src = fs.readFileSync(
        path.join(
          process.cwd(),
          'app/[tenant]/components/templates/FnbCateringStorefrontView.tsx'
        ),
        'utf-8'
      );

      expect(src).not.toContain('6285861091103');
      expect(src).not.toContain('6289617799878');
      expect(src).not.toContain('896-1779-9878');
      expect(src).not.toContain('/tenants/shabu-ajhi/logo.png');
    });

    it('requestCateringDeliveryQuote fetches /api/v1/shipping/rates and extracts fee, distance, and out-of-range', async () => {
      const okFetch: typeof fetch = (async () =>
        new Response(
          JSON.stringify({
            success: true,
            distance_km: 15.6,
            max_radius_km: 40,
            instant_eligible: true,
            rates: [
              {
                id: 'catering_armada_internal',
                courier_name: 'Kurir Dapur Instan',
                price: 65000,
                type: 'instant',
              },
            ],
          }),
          { status: 200 }
        )) as any;

      const quote = await requestCateringDeliveryQuote(
        {
          slug: 'tenant-a',
          destinationLatitude: -6.9,
          destinationLongitude: 107.6,
          items: [{ id: 'p1', name: 'Paket Oishi', price: 250000, qty: 1 }],
        },
        okFetch
      );
      expect(quote.fee).toBe(65000);
      expect(quote.distanceKm).toBe(15.6);
      expect(quote.isOutOfRange).toBe(false);

      const outFetch: typeof fetch = (async () =>
        new Response(
          JSON.stringify({
            success: true,
            coverage: false,
            out_of_range: true,
            instant_eligible: false,
            distance_km: 44.5,
            max_radius_km: 40,
            rates: [],
            fnb_warning: 'Di luar radius maksimal 40 km.',
          }),
          { status: 200 }
        )) as any;

      const outQuote = await requestCateringDeliveryQuote(
        {
          slug: 'tenant-a',
          destinationLatitude: -6.5,
          destinationLongitude: 107.6,
          items: [{ id: 'p1', name: 'Paket Oishi', price: 250000, qty: 1 }],
        },
        outFetch
      );
      expect(outQuote.fee).toBeNull();
      expect(outQuote.isOutOfRange).toBe(true);
      expect(outQuote.distanceKm).toBe(44.5);
    });

    it('buildCateringWhatsAppUrl and buildLiveCookingWhatsAppUrl include Subtotal, Ongkir, Distance & Grand Total without hardcoded phones', () => {
      const reg = buildCateringWhatsAppUrl({
        storeName: 'Dapur Nusantara',
        waNumber: '6281299988877',
        deliveryDate: '2026-11-20',
        formattedDeliveryDate: 'Jumat, 20 November 2026',
        selectedTimeSlot: '11:00 - 12:00 WIB',
        locationType: 'Rumah Tinggal',
        locationDetails: 'Jl. Merdeka No. 10',
        cartItems: [{ name: 'Paket Oishi', qty: 1, price: 250000 }],
        totalPrice: 250000,
        deliveryFee: 65000,
        distanceKm: 15.6,
        courierLabel: 'Armada Toko PP',
      });

      expect(reg.cleanWa).toBe('6281299988877');
      expect(reg.message).toContain('Subtotal Menu: Rp 250.000');
      expect(reg.message).toContain('15.6 km');
      expect(reg.message).toContain('Armada Toko PP');
      expect(reg.message).toContain('Rp 65.000');
      expect(reg.message).toContain('Grand Total (Estimasi): Rp 315.000');

      const freeReg = buildCateringWhatsAppUrl({
        storeName: 'Dapur Nusantara',
        waNumber: '',
        deliveryDate: '2026-11-20',
        formattedDeliveryDate: 'Jumat, 20 November 2026',
        selectedTimeSlot: '11:00',
        locationType: 'Villa',
        locationDetails: 'Dekat Outlet',
        cartItems: [{ name: 'Paket Oishi', qty: 1, price: 250000 }],
        totalPrice: 250000,
        deliveryFee: 0,
        distanceKm: 2.1,
      });
      expect(freeReg.cleanWa).toBe(''); // NO fallback to 6285861091103!
      expect(freeReg.message).toContain('GRATIS (Rp 0)');
      expect(freeReg.message).toContain('Grand Total (Estimasi): Rp 250.000');

      const largeParty = buildLiveCookingWhatsAppUrl({
        storeName: 'Dapur Nusantara',
        waNumber: '628777666555',
        deliveryDate: '2026-11-21',
        formattedDeliveryDate: 'Sabtu, 21 November 2026',
        selectedTimeSlot: '17:00',
        locationAddress: 'Villa Dago',
        cartItems: [{ name: 'Paket Mabar A', qty: 5, price: 450000 }],
        totalPackages: 5,
        totalPrice: 2250000,
        deliveryFee: 114000,
        distanceKm: 27.3,
        courierLabel: 'Armada Toko PP',
      });
      expect(largeParty.targetPhone).toBe('628777666555');
      expect(largeParty.message).toContain('Subtotal Menu: Rp 2.250.000');
      expect(largeParty.message).toContain('Rp 114.000');
      expect(largeParty.message).toContain('Grand Total (Estimasi): Rp 2.364.000');

      const emptyLarge = buildLiveCookingWhatsAppUrl({ totalPackages: 5 });
      expect(emptyLarge.targetPhone).toBe(''); // NO fallback to 6289617799878!
    });

    it('renders FnbCateringStorefrontView SSR with tenant-specific WA link and no leaked tenant branding/numbers', () => {
      const html = renderToStaticMarkup(
        <FnbCateringStorefrontView
          effectiveName="Kedai Shabu Dinamis"
          effectiveSlug="kedai-dinamis"
          meta={{ whatsapp_number: '6281355500011' }}
          tenant={{ id: 't-1', name: 'Kedai Shabu Dinamis', slug: 'kedai-dinamis', metadata: {} }}
          fnbCatering={{ is_enabled: true, soup_variants: ['Kaldu', 'Tomyum'] }}
          products={[]}
          onInitiateCheckout={jest.fn()}
        />
      );

      expect(html).toContain('Kedai Shabu Dinamis');
      expect(html).toContain('6281355500011');
      expect(html).not.toContain('6285861091103');
      expect(html).not.toContain('6289617799878');
      expect(html).not.toContain('/tenants/shabu-ajhi/logo.png');
    });

    it('never quotes Gratis Ongkir or Rp 0 for >= 5 package large-party orders across rates API, sticky bar, and WhatsApp URLs', async () => {
      const ORIGIN_LAT = -6.9813378;
      const ORIGIN_LNG = 107.6357281;
      const DEST_15KM = -6.874; // ~15.4 km
      const DEST_2KM = -6.968; // ~1.9 km (even <= 3 km must require manual fleet coordination for >= 5 packages)

      const store = createStatefulSupabaseMock({
        tenants: [
          {
            id: 'large-party-uuid',
            slug: 'catering-large-party',
            metadata: {
              fnb_catering: { is_enabled: true },
              shipping_config: {
                tier_mode: 'CATERING_13_TIER',
                max_radius_km: 40,
                fnb_settings: { latitude: ORIGIN_LAT, longitude: ORIGIN_LNG, max_radius_km: 40 },
              },
            },
          },
        ],
        settings: [
          {
            tenant_slug: 'catering-large-party',
            biteship_config: {
              is_enabled: true,
              fnb_settings: {
                latitude: ORIGIN_LAT,
                longitude: ORIGIN_LNG,
                max_radius_km: 40,
                radius_synced_at: '2026-11-19T00:00:00Z',
              },
            },
          },
        ],
      });
      jest.spyOn(supabaseClient, 'getSupabaseAdmin').mockReturnValue(store.client as any);

      for (const destLat of [DEST_15KM, DEST_2KM]) {
        const payload = {
          slug: 'catering-large-party',
          is_fnb: true,
          destination_latitude: destLat,
          destination_longitude: ORIGIN_LNG,
          items: [{ name: 'Paket Mabar A', quantity: 5, unitPrice: 450000 }],
        };
        const [ratesRes, instRes] = await Promise.all([
          calculateShippingRates(
            new NextRequest('http://localhost/api/v1/shipping/rates', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            })
          ),
          calculateInstantRates(
            new NextRequest('http://localhost/api/v1/shipping/rates/instant', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            })
          ),
        ]);
        const ratesJson = await ratesRes.json();
        const instJson = await instRes.json();

        for (const resData of [ratesJson, instJson]) {
          expect(resData.success).toBe(true);
          expect(resData.requires_manual_coordination).toBe(true);
          expect(resData.rates[0].requires_manual_coordination).toBe(true);
          expect(resData.rates[0].badge).toBe('Konfirmasi CS / Manual');
          expect(resData.rates[0].badge).not.toBe('Gratis Ongkir');
          expect(resData.rates[0].price).toBeNull();
          expect(resData.rates[0].price_label).toBe('Konfirmasi CS / Manual');
          expect(JSON.stringify(resData)).not.toContain('Gratis Ongkir');
        }
      }

      // Quote fetcher wired to real /api/v1/shipping/rates handler must NOT return fee: 0
      const liveHandlerFetch: typeof fetch = (async (_url: any, init?: any) =>
        calculateShippingRates(
          new NextRequest('http://localhost/api/v1/shipping/rates', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: init?.body,
          })
        )) as any;

      const liveQuote = await requestCateringDeliveryQuote(
        {
          slug: 'catering-large-party',
          destinationLatitude: DEST_15KM,
          destinationLongitude: ORIGIN_LNG,
          items: [{ id: 'mabar-a', name: 'Paket Mabar A', price: 450000, qty: 5 }],
        },
        liveHandlerFetch
      );
      expect(liveQuote.fee).toBeNull();
      expect(liveQuote.requiresManualCoordination).toBe(true);
      expect(liveQuote.note).toContain('Konfirmasi CS');

      // Defensive guard: even if an API response carries price: 0 + requires_manual_coordination, never return fee: 0
      const zeroSpoofFetch: typeof fetch = (async () =>
        new Response(
          JSON.stringify({
            success: true,
            distance_km: 15.4,
            requires_manual_coordination: true,
            rates: [{ id: 'x', type: 'instant', price: 0, requires_manual_coordination: true }],
          }),
          { status: 200 }
        )) as any;
      const spoofedQuote = await requestCateringDeliveryQuote(
        {
          slug: 'catering-large-party',
          destinationLatitude: DEST_15KM,
          destinationLongitude: ORIGIN_LNG,
          items: [{ id: 'mabar-a', name: 'Paket Mabar A', price: 450000, qty: 5 }],
        },
        zeroSpoofFetch
      );
      expect(spoofedQuote.fee).toBeNull();
      expect(spoofedQuote.requiresManualCoordination).toBe(true);

      // Sticky bar summary helper must NEVER display GRATIS (Rp 0) for >= 5 packages
      const sticky = resolveCateringStickySummary({
        totalPrice: 2250000,
        isLargePartyOrder: true,
        isLoadingDeliveryQuote: false,
        deliveryQuote: liveQuote,
      });
      expect(sticky.ongkirTone).toBe('manual');
      expect(sticky.ongkirLabel).toContain('Konfirmasi CS (Pesanan Besar >= 5 Paket)');
      expect(sticky.ongkirLabel).not.toContain('GRATIS');
      expect(sticky.ongkirLabel).not.toContain('Rp 0');
      expect(sticky.totalLabel).toBe(
        'Estimasi Total: Rp 2.250.000 (Belum termasuk ongkir — konfirmasi CS)'
      );

      // Both WA builders must NEVER emit GRATIS (Rp 0) when requiresManualCoordination is true or fee is 0 on large party
      const liveWa = buildLiveCookingWhatsAppUrl({
        storeName: 'Dapur Nusantara',
        waNumber: '081299988877',
        deliveryDate: '2026-11-21',
        formattedDeliveryDate: 'Sabtu, 21 November 2026',
        selectedTimeSlot: '17:00',
        locationAddress: 'Villa Dago',
        cartItems: [{ name: 'Paket Mabar A', qty: 5, price: 450000 }],
        totalPackages: 5,
        totalPrice: 2250000,
        deliveryFee: 0,
        distanceKm: 15.4,
        requiresManualCoordination: true,
      });
      expect(liveWa.targetPhone).toBe('6281299988877');
      expect(liveWa.message).toContain('Konfirmasi CS (Pesanan Besar >= 5 Paket)');
      expect(liveWa.message).toContain(
        'Estimasi Total: Rp 2.250.000 (Belum termasuk ongkir — konfirmasi CS)'
      );
      expect(liveWa.message).not.toContain('GRATIS (Rp 0)');

      const catWa = buildCateringWhatsAppUrl({
        storeName: 'Dapur Nusantara',
        waNumber: '6281299988877',
        deliveryDate: '2026-11-21',
        formattedDeliveryDate: 'Sabtu, 21 November 2026',
        selectedTimeSlot: '17:00',
        locationType: 'Villa',
        locationDetails: 'Villa Dago',
        cartItems: [{ name: 'Paket Mabar A', qty: 5, price: 450000 }],
        totalPrice: 2250000,
        deliveryFee: 0,
        distanceKm: 15.4,
        requiresManualCoordination: true,
      });
      expect(catWa.message).toContain('Konfirmasi CS (Pesanan Besar >= 5 Paket)');
      expect(catWa.message).toContain(
        'Estimasi Total: Rp 2.250.000 (Belum termasuk ongkir — konfirmasi CS)'
      );
      expect(catWa.message).not.toContain('GRATIS (Rp 0)');
    });
  });
});
