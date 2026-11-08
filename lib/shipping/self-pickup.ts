/**
 * @file lib/shipping/self-pickup.ts
 * @description Universal Self-Pickup & Logistics Configuration Service
 * Provides single source of truth for store shipping configs across Physical & FnB verticals.
 */

import { getSupabase, getSupabaseAdmin, getWorkforceSupabaseAdmin } from '@/lib/supabaseClient';

function resolveSafeAdminSupabase(customClient?: any) {
  if (customClient) return customClient;
  if (typeof window === 'undefined') {
    try {
      const wf = getWorkforceSupabaseAdmin();
      if (wf) return wf;
    } catch {}
    try {
      const sa = getSupabaseAdmin();
      if (sa) return sa;
    } catch {}
  }
  return getSupabase();
}

export interface StoreShippingConfig {
  id?: string;
  tenant_id?: string;
  tenant_slug: string;
  is_self_pickup_enabled: boolean;
  pickup_address?: string | null;
  pickup_maps_url?: string | null;
  pickup_operational_hours?: string | null;
  pickup_instructions?: string | null;
  origin_address?: string | null;
  origin_city?: string | null;
  origin_district?: string | null;
  origin_postal_code?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PickupLocationDetails {
  isEnabled: boolean;
  storeName?: string;
  address: string;
  mapsUrl?: string;
  operationalHours?: string;
  instructions?: string;
}

/**
 * Membaca konfigurasi logistik & self-pickup merchant:
 * 1. Tabel utama `store_shipping_configs` (PostgreSQL)
 * 2. Fallback: `tenant_settings.biteship_config` & `tenants.metadata.shipping_config`
 */
export async function getStoreShippingConfig(
  tenantSlug: string,
  supabaseClient?: any
): Promise<StoreShippingConfig> {
  const cleanSlug = String(tenantSlug || '').trim().toLowerCase();
  const supabase = resolveSafeAdminSupabase(supabaseClient);

  const defaultConfig: StoreShippingConfig = {
    tenant_slug: cleanSlug,
    is_self_pickup_enabled: false,
    pickup_address: null,
    pickup_maps_url: null,
    pickup_operational_hours: null,
    pickup_instructions: null,
    origin_address: null,
    origin_city: null,
    origin_district: null,
    origin_postal_code: null,
  };

  if (!supabase || !cleanSlug) return defaultConfig;

  try {
    // 1. Authoritative SSOT read from tenants.metadata (Priority 1)
    const { data: tenantRow, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, metadata, updated_at')
      .eq('slug', cleanSlug)
      .maybeSingle();

    if (!tenantErr && tenantRow?.metadata) {
      const meta = tenantRow.metadata;
      const shipMeta = meta.shipping_config;
      const selfPickup = meta.self_pickup_config || shipMeta?.self_pickup;

      // Check if SSOT shipping business configuration is initialized
      const isSsotInitialized = Boolean(
        shipMeta !== undefined ||
        selfPickup !== undefined ||
        meta.store_shipping_config !== undefined
      );

      if (isSsotInitialized) {
        const resolvedShip = shipMeta || meta.store_shipping_config || {};
        const resolvedSelf = shipMeta?.self_pickup || selfPickup || resolvedShip.self_pickup || {};

        const warehouseAddr =
          typeof meta.warehouse_address === 'string'
            ? meta.warehouse_address
            : meta.warehouse_address?.address;

        const resolvedOrigin =
          resolvedShip.origin?.address ||
          warehouseAddr ||
          meta.basic_shipping?.origin_address ||
          resolvedShip.fnb_settings?.kitchen_address ||
          meta.fnb_settings?.kitchen_address ||
          meta.kitchen_address ||
          meta.store_address ||
          meta.address ||
          meta.origin_address ||
          null;

        const rawPickup =
          resolvedShip.pickup_address ||
          resolvedShip.self_pickup?.address ||
          resolvedSelf.pickup_address ||
          resolvedSelf.address ||
          meta.pickup_address;

        const resolvedPickup =
          rawPickup && rawPickup !== 'Dapur Utama / Outlet Resto'
            ? rawPickup
            : (resolvedOrigin || rawPickup || null);

        const isEnabled = Boolean(
          resolvedShip.is_self_pickup_enabled ??
          resolvedShip.self_pickup?.is_enabled ??
          resolvedSelf.is_enabled ??
          meta.is_self_pickup_enabled ??
          false
        );

        return {
          id: tenantRow.id,
          tenant_id: tenantRow.id,
          tenant_slug: cleanSlug,
          is_self_pickup_enabled: isEnabled,
          pickup_address: resolvedPickup,
          pickup_maps_url: resolvedShip.pickup_maps_url || resolvedShip.self_pickup?.maps_url || resolvedSelf.maps_url || resolvedSelf.pickup_maps_url || meta.pickup_maps_url || null,
          pickup_operational_hours: resolvedShip.pickup_operational_hours || resolvedShip.self_pickup?.operational_hours || resolvedSelf.operational_hours || resolvedSelf.pickup_operational_hours || meta.pickup_operational_hours || null,
          pickup_instructions: resolvedShip.pickup_instructions || resolvedShip.self_pickup?.instructions || resolvedSelf.instructions || resolvedSelf.pickup_instructions || meta.pickup_instructions || null,
          origin_address: resolvedOrigin,
          origin_city: resolvedShip.origin?.city || meta.basic_shipping?.origin_city || null,
          origin_district: resolvedShip.origin?.district || null,
          origin_postal_code: resolvedShip.origin?.postal_code || null,
          updated_at: tenantRow.updated_at,
        };
      }
    }

    // 2. Legacy Fallback (Priority 2): Tabel store_shipping_configs (HANYA jika SSOT uninitialized)
    const { data: storeCfg, error: cfgErr } = await supabase
      .from('store_shipping_configs')
      .select('*')
      .eq('tenant_slug', cleanSlug)
      .maybeSingle();

    if (!cfgErr && storeCfg) {
      return {
        id: storeCfg.id,
        tenant_id: storeCfg.tenant_id,
        tenant_slug: cleanSlug,
        is_self_pickup_enabled: Boolean(storeCfg.is_self_pickup_enabled),
        pickup_address: storeCfg.pickup_address || storeCfg.origin_address || null,
        pickup_maps_url: storeCfg.pickup_maps_url || null,
        pickup_operational_hours: storeCfg.pickup_operational_hours || null,
        pickup_instructions: storeCfg.pickup_instructions || null,
        origin_address: storeCfg.origin_address || null,
        origin_city: storeCfg.origin_city || null,
        origin_district: storeCfg.origin_district || null,
        origin_postal_code: storeCfg.origin_postal_code || null,
        created_at: storeCfg.created_at,
        updated_at: storeCfg.updated_at,
      };
    }

    // 3. Legacy Fallback (Priority 3): tenant_settings.biteship_config (HANYA jika SSOT uninitialized)
    const { data: tenantSettings } = await supabase
      .from('tenant_settings')
      .select('biteship_config')
      .eq('tenant_slug', cleanSlug)
      .maybeSingle();

    const biteshipCfg = tenantSettings?.biteship_config;
    if (biteshipCfg) {
      const selfPickup = biteshipCfg.self_pickup || {};
      const origin = biteshipCfg.origin || {};
      const isEnabled = Boolean(
        selfPickup.is_enabled ??
        biteshipCfg.is_self_pickup_enabled ??
        false
      );

      const fnbKitchen = biteshipCfg.fnb_settings?.kitchen_address;
      const resolvedPickup =
        (selfPickup.address && selfPickup.address !== 'Dapur Utama / Outlet Resto' ? selfPickup.address : null) ||
        (biteshipCfg.pickup_address && biteshipCfg.pickup_address !== 'Dapur Utama / Outlet Resto' ? biteshipCfg.pickup_address : null) ||
        fnbKitchen ||
        origin.address ||
        null;

      return {
        tenant_slug: cleanSlug,
        is_self_pickup_enabled: isEnabled,
        pickup_address: resolvedPickup,
        pickup_maps_url: selfPickup.maps_url || biteshipCfg.pickup_maps_url || null,
        pickup_operational_hours: selfPickup.operational_hours || biteshipCfg.pickup_operational_hours || null,
        pickup_instructions: selfPickup.instructions || biteshipCfg.pickup_instructions || null,
        origin_address: origin.address || fnbKitchen || null,
        origin_city: origin.city || null,
        origin_district: origin.district || null,
        origin_postal_code: origin.postal_code || null,
      };
    }
  } catch (err) {
    console.warn('[Self-Pickup Config] Error loading config:', err);
  }

  return defaultConfig;
}

/**
 * Utility to identify whether a PostgREST / PostgreSQL error indicates a genuinely absent table
 * in environments where optional/migrated tables have not been provisioned yet.
 *
 * ALLOWED:
 * - 42P01: PostgreSQL undefined_table ("relation ... does not exist")
 * - PGRST205: PostgREST table not found in schema cache ("Could not find the table ... in the schema cache")
 *
 * STRICTLY REJECTED (FAIL-CLOSED):
 * - PGRST204: Missing column / schema mismatch in schema cache (unexpected error, must fail)
 * - Generic substring matches that do not specify an absent table
 */
export function isMissingTableError(err: any): boolean {
  if (!err) return false;

  // PGRST204 is a missing column / schema mismatch error, NOT a missing table.
  // It is an unexpected schema/payload failure and MUST fail-closed.
  if (err.code === 'PGRST204' || (typeof err.message === 'string' && err.message.includes('column of'))) {
    return false;
  }

  // 42P01: PostgreSQL undefined_table
  if (err.code === '42P01') {
    return true;
  }

  // PGRST205: PostgREST table not found in schema cache
  if (err.code === 'PGRST205') {
    return true;
  }

  // Strict message check only if error code is missing (no broad generic match)
  if (
    typeof err.message === 'string' &&
    err.message.includes("Could not find the table '") &&
    err.message.includes('in the schema cache')
  ) {
    return true;
  }

  return false;
}

export interface SaveStoreShippingOptions extends Partial<StoreShippingConfig> {
  tenant_slug: string;
  tenant_id?: string;
  shipping_config?: any;
  expected_revision?: string;
  combined_tenant_update?: Record<string, any>;
}

export interface SaveStoreShippingResult {
  success: boolean;
  status_code?: number;
  config?: StoreShippingConfig;
  error?: string;
  revision?: string;
  updatedTenant?: any;
  projections?: {
    store_shipping_configs: 'synchronized' | 'skipped' | 'failed' | 'table_absent';
    tenant_settings: 'synchronized' | 'skipped' | 'failed' | 'table_absent';
  };
  projection_warnings?: string[];
}

/**
 * Menyimpan konfigurasi logistik & self-pickup merchant ke Supabase.
 *
 * ROUND 3T.1 OPTION 1 (SINGLE CONDITIONAL SSOT PATCH):
 * Step 1 — Authoritative SSOT write ke tabel `tenants` FIRST via Compare-and-Swap (CAS).
 *          Menggabungkan seluruh update general tenant fields dan shipping metadata
 *          ke dalam SATU operasi update bersyarat (.eq('slug').eq('updated_at')).
 *          Jika SSOT gagal atau terdeteksi konflik revisi (0 rows affected), eksekusi STOP seketika.
 *          Tabel proyeksi sekunder SAMA SEKALI TIDAK DITULIS.
 * Step 2 — Sinkronisasi proyeksi sekunder (store_shipping_configs & tenant_settings.biteship_config)
 *          HANYA dijalankan setelah SSOT sukses dikomit.
 */
export async function saveStoreShippingConfig(
  config: SaveStoreShippingOptions,
  supabaseClient?: any
): Promise<SaveStoreShippingResult> {
  const cleanSlug = String(config.tenant_slug || '').trim().toLowerCase();
  if (!cleanSlug) return { success: false, status_code: 400, error: 'tenant_slug is required' };

  const supabase = resolveSafeAdminSupabase(supabaseClient);
  if (!supabase) return { success: false, status_code: 500, error: 'Database unavailable' };

  const isEnabled = Boolean(config.is_self_pickup_enabled);
  const pickupAddress = config.pickup_address || config.origin_address || null;

  try {
    // ════════════════════════════════════════════════════════════════════════════
    // STEP 1 — AUTHORITATIVE SSOT WRITE FIRST (tenants.metadata) VIA CAS
    // ════════════════════════════════════════════════════════════════════════════
    const { data: tenantRow, error: tenantLookupErr } = await supabase
      .from('tenants')
      .select('id, slug, metadata, updated_at')
      .eq('slug', cleanSlug)
      .maybeSingle();

    if (tenantLookupErr) {
      return { success: false, status_code: 500, error: `tenants lookup failed: ${tenantLookupErr.message}` };
    }

    if (!tenantRow) {
      return { success: false, status_code: 404, error: `Tenant not found for slug: ${cleanSlug}` };
    }

    // Optimistic Concurrency Control: Validate expected revision
    const currentRevision = tenantRow.updated_at || tenantRow.metadata?.shipping_revision;
    if (config.expected_revision && currentRevision) {
      const isMatching =
        config.expected_revision === currentRevision ||
        Date.parse(config.expected_revision) === Date.parse(currentRevision);
      if (!isMatching) {
        return {
          success: false,
          status_code: 409,
          error: `CONFLICT_STALE_REVISION: Expected revision ${config.expected_revision} does not match current tenant revision ${currentRevision}`,
        };
      }
    }

    // Deterministic Revision Advancement: Ensure nextRevision is strictly greater than previous
    const nowMs = Date.now();
    const prevMs = currentRevision ? Date.parse(currentRevision) : 0;
    const effectiveMs = !isNaN(prevMs) && prevMs >= nowMs ? prevMs + 1 : nowMs;
    const nextRevision = new Date(effectiveMs).toISOString();

    const currentMeta = tenantRow.metadata || {};
    const updatedMeta = {
      ...currentMeta,
      shipping_revision: nextRevision,
      pickup_address: pickupAddress,
      pickup_maps_url: config.pickup_maps_url || null,
      pickup_operational_hours: config.pickup_operational_hours || null,
      self_pickup_config: {
        ...(currentMeta.self_pickup_config || {}),
        is_enabled: isEnabled,
        pickup_address: pickupAddress,
        pickup_maps_url: config.pickup_maps_url || null,
        pickup_operational_hours: config.pickup_operational_hours || null,
        pickup_instructions: config.pickup_instructions || null,
      },
      shipping_config: {
        ...(currentMeta.shipping_config || {}),
        ...(config.shipping_config || {}),
        is_self_pickup_enabled: isEnabled,
        pickup_address: pickupAddress,
        pickup_maps_url: config.pickup_maps_url || null,
        pickup_operational_hours: config.pickup_operational_hours || null,
        pickup_instructions: config.pickup_instructions || null,
        self_pickup: {
          is_enabled: isEnabled,
          address: pickupAddress,
          maps_url: config.pickup_maps_url || null,
          operational_hours: config.pickup_operational_hours || null,
          instructions: config.pickup_instructions || null,
        },
      },
    };

    // Construct single authoritative update payload combining general tenant fields and shipping metadata
    const combinedUpdate: Record<string, any> = {
      ...(config.combined_tenant_update || {}),
      metadata: updatedMeta,
      updated_at: nextRevision,
    };

    // Conditional Update (Compare-and-Swap on updated_at)
    let updateQuery = supabase
      .from('tenants')
      .update(combinedUpdate)
      .eq('slug', cleanSlug);

    const filterRevision = config.expected_revision || tenantRow.updated_at;
    if (filterRevision) {
      updateQuery = updateQuery.eq('updated_at', filterRevision);
    }

    const { data: updatedRows, error: updateTenantErr } = await updateQuery.select(
      'id, slug, name, metadata, phone, whatsapp_number, updated_at'
    );

    if (updateTenantErr) {
      // SSOT persistence failure: STOP immediately, do not write secondary projections
      return { success: false, status_code: 500, error: `tenants update failed: ${updateTenantErr.message}` };
    }

    if (!updatedRows || updatedRows.length === 0) {
      // CAS condition failed: zero rows affected means a concurrent mutation committed first
      return {
        success: false,
        status_code: 409,
        error: 'CONFLICT_CONCURRENT_MUTATION: 0 rows affected during conditional update; concurrent update detected.',
      };
    }

    const authoritativeRevision = updatedRows[0]?.updated_at || nextRevision;

    // ════════════════════════════════════════════════════════════════════════════
    // STEP 2 — SECONDARY PROJECTION SYNCHRONIZATION (ONLY AFTER SSOT SUCCEEDS)
    // ════════════════════════════════════════════════════════════════════════════
    const dbPayload: any = {
      tenant_slug: cleanSlug,
      tenant_id: tenantRow.id,
      is_self_pickup_enabled: isEnabled,
      pickup_address: pickupAddress,
      pickup_maps_url: config.pickup_maps_url || null,
      pickup_operational_hours: config.pickup_operational_hours || null,
      pickup_instructions: config.pickup_instructions || null,
      origin_address: config.origin_address || null,
      origin_city: config.origin_city || null,
      origin_district: config.origin_district || null,
      origin_postal_code: config.origin_postal_code || null,
      updated_at: authoritativeRevision,
    };

    let storeShippingStatus: 'synchronized' | 'skipped' | 'failed' | 'table_absent' = 'skipped';
    let tenantSettingsStatus: 'synchronized' | 'skipped' | 'failed' | 'table_absent' = 'skipped';
    const projectionWarnings: string[] = [];

    // 2a. Sinkronkan ke tabel store_shipping_configs
    try {
      const { error: storeShippingErr } = await supabase
        .from('store_shipping_configs')
        .upsert(dbPayload, { onConflict: 'tenant_slug' });

      if (storeShippingErr) {
        if (isMissingTableError(storeShippingErr)) {
          storeShippingStatus = 'table_absent';
          console.warn('[Self-Pickup Config] Optional table store_shipping_configs absent, skipped projection sync');
        } else {
          storeShippingStatus = 'failed';
          projectionWarnings.push(`store_shipping_configs sync failed: ${storeShippingErr.message}`);
          console.warn('[Self-Pickup Config] Non-fatal projection error on store_shipping_configs (SSOT already committed):', storeShippingErr.message);
        }
      } else {
        storeShippingStatus = 'synchronized';
      }
    } catch (ex: any) {
      storeShippingStatus = 'failed';
      projectionWarnings.push(`store_shipping_configs exception: ${ex?.message}`);
    }

    // 2b. Sinkronkan ke tenant_settings.biteship_config
    try {
      const { data: existingSettings, error: selectTsErr } = await supabase
        .from('tenant_settings')
        .select('biteship_config')
        .eq('tenant_slug', cleanSlug)
        .maybeSingle();

      if (selectTsErr) {
        if (isMissingTableError(selectTsErr)) {
          tenantSettingsStatus = 'table_absent';
          console.warn('[Self-Pickup Config] Optional table tenant_settings absent, skipped projection sync');
        } else {
          tenantSettingsStatus = 'failed';
          projectionWarnings.push(`tenant_settings lookup failed: ${selectTsErr.message}`);
        }
      } else {
        const currentBiteship = existingSettings?.biteship_config || {};
        const updatedBiteship = {
          ...currentBiteship,
          is_self_pickup_enabled: isEnabled,
          pickup_address: pickupAddress,
          pickup_maps_url: config.pickup_maps_url || null,
          pickup_operational_hours: config.pickup_operational_hours || null,
          pickup_instructions: config.pickup_instructions || null,
          self_pickup: {
            is_enabled: isEnabled,
            address: pickupAddress,
            maps_url: config.pickup_maps_url || null,
            operational_hours: config.pickup_operational_hours || null,
            instructions: config.pickup_instructions || null,
          },
          ...(config.shipping_config?.couriers ? { couriers: config.shipping_config.couriers } : {}),
          ...(config.shipping_config?.origin ? { origin: config.shipping_config.origin } : {}),
          ...(typeof config.shipping_config?.auto_pickup === 'boolean' ? { auto_pickup: config.shipping_config.auto_pickup } : {}),
          ...(typeof config.shipping_config?.free_shipping_threshold === 'number' ? { free_shipping_threshold: config.shipping_config.free_shipping_threshold } : {}),
          ...(typeof config.shipping_config?.is_enabled === 'boolean' ? { is_enabled: config.shipping_config.is_enabled } : {}),
          ...(config.shipping_config?.routing_rules ? { routing_rules: config.shipping_config.routing_rules } : {}),
          ...(config.shipping_config?.fnb_settings ? { fnb_settings: config.shipping_config.fnb_settings } : {}),
          ...(config.shipping_config?.lincah ? { lincah: config.shipping_config.lincah } : {}),
          ...(config.shipping_config?.biteship ? { biteship: config.shipping_config.biteship } : {}),
          updated_at: authoritativeRevision,
        };

        const { error: upsertTsErr } = await supabase
          .from('tenant_settings')
          .upsert(
            {
              tenant_slug: cleanSlug,
              biteship_config: updatedBiteship,
              updated_at: authoritativeRevision,
            },
            { onConflict: 'tenant_slug' }
          );

        if (upsertTsErr) {
          if (isMissingTableError(upsertTsErr)) {
            tenantSettingsStatus = 'table_absent';
          } else {
            tenantSettingsStatus = 'failed';
            projectionWarnings.push(`tenant_settings upsert failed: ${upsertTsErr.message}`);
          }
        } else {
          tenantSettingsStatus = 'synchronized';
        }
      }
    } catch (ex: any) {
      tenantSettingsStatus = 'failed';
      projectionWarnings.push(`tenant_settings exception: ${ex?.message}`);
    }

    return {
      success: true,
      status_code: 200,
      revision: authoritativeRevision,
      updatedTenant: updatedRows[0],
      config: {
        ...dbPayload,
        id: tenantRow.id,
      },
      projections: {
        store_shipping_configs: storeShippingStatus,
        tenant_settings: tenantSettingsStatus,
      },
      ...(projectionWarnings.length > 0 ? { projection_warnings: projectionWarnings } : {}),
    };
  } catch (err: any) {
    console.error('[Self-Pickup Config Save Exception]:', err);
    return { success: false, status_code: 500, error: err?.message || 'Failed to save shipping config' };
  }
}
