/**
 * @file lib/shipping/self-pickup-reader.ts
 * @description Read-Only Store Shipping & Self-Pickup Configuration Service (Safe for Browser/Client Import)
 */

import { getSupabase, getSupabaseAdmin } from '@/lib/supabaseClient';

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
  const supabase = supabaseClient || getSupabaseAdmin() || getSupabase();

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
    // 1. Coba baca dari tabel store_shipping_configs
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

    // 2. Fallback ke tenant_settings.biteship_config
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

    // 3. Fallback ke tenants.metadata.shipping_config & warehouse_address
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('id, metadata')
      .eq('slug', cleanSlug)
      .maybeSingle();

    if (tenantRow?.metadata) {
      const meta = tenantRow.metadata;
      const shipMeta = meta.shipping_config || meta.store_shipping_config || {};
      const selfPickup = shipMeta.self_pickup || meta.self_pickup_config || {};

      const warehouseAddr =
        typeof meta.warehouse_address === 'string'
          ? meta.warehouse_address
          : meta.warehouse_address?.address;

      const resolvedOrigin =
        shipMeta.origin?.address ||
        warehouseAddr ||
        meta.basic_shipping?.origin_address ||
        meta.shipping_config?.fnb_settings?.kitchen_address ||
        meta.fnb_settings?.kitchen_address ||
        meta.kitchen_address ||
        meta.store_address ||
        meta.address ||
        meta.origin_address ||
        null;

      const rawPickup =
        selfPickup.address ||
        shipMeta.pickup_address ||
        meta.self_pickup_config?.pickup_address ||
        meta.pickup_address;

      const resolvedPickup =
        rawPickup && rawPickup !== 'Dapur Utama / Outlet Resto'
          ? rawPickup
          : (resolvedOrigin || rawPickup || null);

      return {
        tenant_id: tenantRow.id,
        tenant_slug: cleanSlug,
        is_self_pickup_enabled: Boolean(
          selfPickup.is_enabled ??
          shipMeta.is_self_pickup_enabled ??
          meta.self_pickup_config?.is_enabled ??
          meta.is_self_pickup_enabled ??
          false
        ),
        pickup_address: resolvedPickup,
        pickup_maps_url: selfPickup.maps_url || shipMeta.pickup_maps_url || meta.self_pickup_config?.pickup_maps_url || meta.pickup_maps_url || null,
        pickup_operational_hours: selfPickup.operational_hours || shipMeta.pickup_operational_hours || meta.self_pickup_config?.pickup_operational_hours || meta.pickup_operational_hours || null,
        pickup_instructions: selfPickup.instructions || shipMeta.pickup_instructions || meta.self_pickup_config?.pickup_instructions || meta.pickup_instructions || null,
        origin_address: resolvedOrigin,
        origin_city: shipMeta.origin?.city || meta.basic_shipping?.origin_city || null,
        origin_district: shipMeta.origin?.district || null,
        origin_postal_code: shipMeta.origin?.postal_code || null,
      };
    }
  } catch (err) {
    console.warn('[Self-Pickup Config] Error loading config:', err);
  }

  return defaultConfig;
}
