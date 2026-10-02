/**
 * @file lib/shipping/self-pickup.ts
 * @description Universal Self-Pickup & Logistics Configuration Service
 * Provides single source of truth for store shipping configs across Physical & FnB verticals.
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

      return {
        tenant_slug: cleanSlug,
        is_self_pickup_enabled: isEnabled,
        pickup_address: selfPickup.address || biteshipCfg.pickup_address || origin.address || null,
        pickup_maps_url: selfPickup.maps_url || biteshipCfg.pickup_maps_url || null,
        pickup_operational_hours: selfPickup.operational_hours || biteshipCfg.pickup_operational_hours || null,
        pickup_instructions: selfPickup.instructions || biteshipCfg.pickup_instructions || null,
        origin_address: origin.address || null,
        origin_city: origin.city || null,
        origin_district: origin.district || null,
        origin_postal_code: origin.postal_code || null,
      };
    }

    // 3. Fallback ke tenants.metadata.shipping_config
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('id, metadata')
      .eq('slug', cleanSlug)
      .maybeSingle();

    if (tenantRow?.metadata) {
      const meta = tenantRow.metadata;
      const shipMeta = meta.shipping_config || meta.store_shipping_config || {};
      const selfPickup = shipMeta.self_pickup || {};

      return {
        tenant_id: tenantRow.id,
        tenant_slug: cleanSlug,
        is_self_pickup_enabled: Boolean(
          selfPickup.is_enabled ??
          shipMeta.is_self_pickup_enabled ??
          meta.is_self_pickup_enabled ??
          false
        ),
        pickup_address: selfPickup.address || shipMeta.pickup_address || shipMeta.origin?.address || meta.pickup_address || null,
        pickup_maps_url: selfPickup.maps_url || shipMeta.pickup_maps_url || meta.pickup_maps_url || null,
        pickup_operational_hours: selfPickup.operational_hours || shipMeta.pickup_operational_hours || meta.pickup_operational_hours || null,
        pickup_instructions: selfPickup.instructions || shipMeta.pickup_instructions || meta.pickup_instructions || null,
        origin_address: shipMeta.origin?.address || meta.origin_address || null,
        origin_city: shipMeta.origin?.city || null,
        origin_district: shipMeta.origin?.district || null,
        origin_postal_code: shipMeta.origin?.postal_code || null,
      };
    }
  } catch (err) {
    console.warn('[Self-Pickup Config] Error loading config:', err);
  }

  return defaultConfig;
}

/**
 * Menyimpan konfigurasi logistik & self-pickup merchant ke Supabase.
 * Melakukan sinkronisasi ke:
 * 1. Tabel `store_shipping_configs` (upsert)
 * 2. Kolom `tenant_settings.biteship_config`
 */
export async function saveStoreShippingConfig(
  config: Partial<StoreShippingConfig> & { tenant_slug: string },
  supabaseClient?: any
): Promise<{ success: boolean; config?: StoreShippingConfig; error?: string }> {
  const cleanSlug = String(config.tenant_slug || '').trim().toLowerCase();
  if (!cleanSlug) return { success: false, error: 'tenant_slug is required' };

  const supabase = supabaseClient || getSupabaseAdmin() || getSupabase();
  if (!supabase) return { success: false, error: 'Database unavailable' };

  const now = new Date().toISOString();
  const isEnabled = Boolean(config.is_self_pickup_enabled);
  const pickupAddress = config.pickup_address || config.origin_address || null;

  const dbPayload: any = {
    tenant_slug: cleanSlug,
    is_self_pickup_enabled: isEnabled,
    pickup_address: pickupAddress,
    pickup_maps_url: config.pickup_maps_url || null,
    pickup_operational_hours: config.pickup_operational_hours || null,
    pickup_instructions: config.pickup_instructions || null,
    origin_address: config.origin_address || null,
    origin_city: config.origin_city || null,
    origin_district: config.origin_district || null,
    origin_postal_code: config.origin_postal_code || null,
    updated_at: now,
  };

  if (config.tenant_id) {
    dbPayload.tenant_id = config.tenant_id;
  }

  try {
    // 1. Simpan ke tabel store_shipping_configs (jika tabel sudah dimigrasi)
    try {
      await supabase
        .from('store_shipping_configs')
        .upsert(dbPayload, { onConflict: 'tenant_slug' });
    } catch (tblErr) {
      console.warn('[Self-Pickup Config] Note writing to store_shipping_configs table:', tblErr);
    }

    // 2. Sinkronkan ke tenant_settings.biteship_config
    const { data: existingSettings } = await supabase
      .from('tenant_settings')
      .select('biteship_config')
      .eq('tenant_slug', cleanSlug)
      .maybeSingle();

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
      updated_at: now,
    };

    await supabase
      .from('tenant_settings')
      .upsert(
        {
          tenant_slug: cleanSlug,
          biteship_config: updatedBiteship,
          updated_at: now,
        },
        { onConflict: 'tenant_slug' }
      );

    return {
      success: true,
      config: {
        ...dbPayload,
      },
    };
  } catch (err: any) {
    console.error('[Self-Pickup Config Save Exception]:', err);
    return { success: false, error: err?.message || 'Failed to save shipping config' };
  }
}
