/**
 * @file lib/shipping/self-pickup.ts
 * @description Universal Self-Pickup & Logistics Configuration Service
 * Provides single source of truth for store shipping configs across Physical & FnB verticals.
 */

import { getSupabase, getSupabaseAdmin } from '@/lib/supabaseClient';
import { updateTenantWithOccCas } from '@/lib/tenants/atomic-tenant-metadata-writer';
import { StoreShippingConfig } from './self-pickup-reader';

export * from './self-pickup-reader';

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

    // 3. Sinkronkan ke tenants.metadata
    try {
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('metadata')
        .eq('slug', cleanSlug)
        .maybeSingle();

      if (tenantRow) {
        await updateTenantWithOccCas(
          supabase,
          cleanSlug,
          (freshTenant) => {
            const freshMeta: Record<string, any> = { ...(freshTenant.metadata || {}) };
            const prevShippingCfg = freshMeta.shipping_config && typeof freshMeta.shipping_config === 'object'
              ? { ...freshMeta.shipping_config }
              : {};
            if (prevShippingCfg.lincah && typeof prevShippingCfg.lincah === 'object') {
              prevShippingCfg.lincah = {
                provider: prevShippingCfg.lincah.provider || 'lincah',
                status: prevShippingCfg.lincah.status || 'connected',
                is_connected: Boolean(prevShippingCfg.lincah.is_connected || prevShippingCfg.lincah.api_key),
                has_api_key: Boolean(prevShippingCfg.lincah.api_key || prevShippingCfg.lincah.has_api_key),
              };
            }
            delete prevShippingCfg.api_key;
            delete prevShippingCfg.secret;
            delete prevShippingCfg.api_key_read_only;

            freshMeta.pickup_address = pickupAddress;
            freshMeta.pickup_maps_url = config.pickup_maps_url || null;
            freshMeta.pickup_operational_hours = config.pickup_operational_hours || null;
            freshMeta.self_pickup_config = {
              ...(freshMeta.self_pickup_config || {}),
              is_enabled: isEnabled,
              pickup_address: pickupAddress,
              pickup_maps_url: config.pickup_maps_url || null,
              pickup_operational_hours: config.pickup_operational_hours || null,
              pickup_instructions: config.pickup_instructions || null,
            };
            freshMeta.shipping_config = {
              ...prevShippingCfg,
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
            };
            delete freshMeta.lincah_config;
            if (freshMeta.shipping_settings && typeof freshMeta.shipping_settings === 'object') {
              const { api_key: _ak, secret: _sec, api_key_read_only: _ro, ...safeShipSettings } = freshMeta.shipping_settings;
              freshMeta.shipping_settings = safeShipSettings;
            }

            return { metadata: freshMeta };
          }
        );
      }
    } catch (metaErr) {
      console.warn('[Self-Pickup Config] Note updating tenants metadata:', metaErr);
    }

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
