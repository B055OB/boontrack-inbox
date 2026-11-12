import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, isValidUuid } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { getStoreShippingConfig, saveStoreShippingConfig } from '@/lib/shipping/self-pickup';
import {
  authorizeMerchantRequest,
  isInternalMachineAuthorized,
} from '@/lib/auth/merchant-session';
import { checkTenantMutationPermission } from '@/lib/subscription-guard';
import { recordTenantConfigAudit, redactSensitiveValues } from '@/lib/security/tenant-config-audit';

export const dynamic = 'force-dynamic';

function maskLincahStatus(rawLincah: any, fallbackLincah?: any) {
  const src = rawLincah && typeof rawLincah === 'object' ? rawLincah : {};
  const fb = fallbackLincah && typeof fallbackLincah === 'object' ? fallbackLincah : {};
  const apiKey = typeof src.api_key === 'string' && src.api_key.trim()
    ? src.api_key.trim()
    : (typeof fb.api_key === 'string' && fb.api_key.trim() ? fb.api_key.trim() : '');
  const roKey = typeof src.api_key_read_only === 'string' && src.api_key_read_only.trim()
    ? src.api_key_read_only.trim()
    : (typeof src.secret === 'string' && src.secret.trim()
        ? src.secret.trim()
        : (typeof fb.api_key_read_only === 'string' ? fb.api_key_read_only.trim() : ''));

  const isConnected = Boolean(apiKey || roKey || src.is_connected || src.has_api_key);
  const last4 = apiKey ? apiKey.slice(-4) : (typeof src.api_key_last4 === 'string' ? src.api_key_last4 : null);

  return {
    provider: 'lincah',
    is_connected: isConnected,
    has_api_key: Boolean(apiKey || src.has_api_key),
    has_read_only_key: Boolean(roKey || src.has_read_only_key),
    api_key_last4: last4,
    api_key_masked: last4 ? `••••${last4}` : null,
  };
}

function stripLincahSecretsFromMetadata(meta: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = { ...meta };
  delete cleaned.lincah_config;

  if (cleaned.shipping_config && typeof cleaned.shipping_config === 'object') {
    const sc = { ...cleaned.shipping_config };
    if (sc.lincah && typeof sc.lincah === 'object') {
      sc.lincah = {
        provider: sc.lincah.provider || 'lincah',
        status: sc.lincah.status || 'connected',
        is_connected: Boolean(sc.lincah.is_connected || sc.lincah.api_key || sc.lincah.has_api_key),
        has_api_key: Boolean(sc.lincah.api_key || sc.lincah.has_api_key),
      };
    }
    delete sc.api_key;
    delete sc.secret;
    delete sc.api_key_read_only;
    cleaned.shipping_config = sc;
  }

  if (cleaned.shipping_settings && typeof cleaned.shipping_settings === 'object') {
    const ss = { ...cleaned.shipping_settings };
    delete ss.api_key;
    delete ss.secret;
    delete ss.api_key_read_only;
    cleaned.shipping_settings = ss;
  }

  return cleaned;
}

/**
 * GET /api/v1/shipping/config?tenant=[slug]
 * Reads store logistics & masked Lincah status under server-side RBAC.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawSlug =
      searchParams.get('tenant') ||
      searchParams.get('tenant_slug') ||
      searchParams.get('slug') ||
      '';
    const tenantSlug = normalizeTenantSlug(rawSlug);

    if (!tenantSlug) {
      return NextResponse.json(
        { success: false, error: 'Parameter tenant wajib diisi' },
        { status: 400 }
      );
    }

    const isInternalAuth = isInternalMachineAuthorized(req);
    if (!isInternalAuth) {
      const authResult = authorizeMerchantRequest(req, tenantSlug, ['OWNER', 'MERCHANT', 'CS', 'OPERATOR']);
      if (!authResult.authorized) {
        return authResult.response;
      }
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: 'Database admin client is unavailable' },
        { status: 503 }
      );
    }

    const isTenantUuid = isValidUuid(tenantSlug);
    const { data: tenantRow, error: tenantErr } = isTenantUuid
      ? await supabaseAdmin.from('tenants').select('id, slug, metadata').eq('id', tenantSlug).maybeSingle()
      : await supabaseAdmin.from('tenants').select('id, slug, metadata').eq('slug', tenantSlug).maybeSingle();

    if (tenantErr) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: tenantErr.message },
        { status: 503 }
      );
    }

    if (!tenantRow || !tenantRow.id) {
      return NextResponse.json(
        { success: false, error: 'TENANT_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (!isInternalAuth) {
      const canonicalCheck = authorizeMerchantRequest(
        req,
        tenantSlug,
        ['OWNER', 'MERCHANT', 'CS', 'OPERATOR'],
        { id: tenantRow.id, slug: tenantRow.slug }
      );
      if (!canonicalCheck.authorized) {
        return canonicalCheck.response;
      }
    }

    const canonicalSlug = normalizeTenantSlug(tenantRow.slug || tenantSlug);
    const [config, settingsRes] = await Promise.all([
      getStoreShippingConfig(canonicalSlug, supabaseAdmin),
      supabaseAdmin
        .from('tenant_settings')
        .select('biteship_config')
        .eq('tenant_slug', canonicalSlug)
        .maybeSingle(),
    ]);

    const cfg = settingsRes.data?.biteship_config || {};
    const meta = tenantRow.metadata || {};
    const legacyLincah = meta.shipping_config?.lincah || meta.lincah_config || meta.shipping_settings;

    return NextResponse.json({
      success: true,
      config,
      courier_config: {
        is_enabled: cfg.is_enabled ?? true,
        origin: cfg.origin || null,
        couriers: Array.isArray(cfg.couriers) ? cfg.couriers : null,
        auto_pickup: cfg.auto_pickup ?? true,
        free_shipping_threshold: cfg.free_shipping_threshold || 0,
        fnb_settings: cfg.fnb_settings || null,
        routing_rules: cfg.routing_rules || null,
        lincah: maskLincahStatus(cfg.lincah, legacyLincah),
      },
      store_context: {
        fnb_catering: Boolean(meta.fnb_catering === true || meta.vertical === 'fnb-culinary'),
        warehouse_address: meta.warehouse_address || null,
        basic_shipping: meta.basic_shipping || null,
        kitchen_address: cfg?.fnb_settings?.kitchen_address || meta.shipping_config?.fnb_settings?.kitchen_address || meta.fnb_settings?.kitchen_address || meta.kitchen_address || null,
        store_address: meta.store_address || meta.address || null,
        phone: meta.whatsapp_number || meta.phone || null,
      },
    });
  } catch (err: any) {
    console.error('[API Shipping Config GET Error]:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/shipping/config
 * Saves self-pickup, origin, courier list, and server-side Lincah credentials securely.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawSlug = body.tenantSlug || body.tenant_slug || body.slug || '';
    const tenantSlug = normalizeTenantSlug(rawSlug);

    if (!tenantSlug) {
      return NextResponse.json(
        { success: false, error: 'tenant_slug wajib diisi' },
        { status: 400 }
      );
    }

    const isInternalAuth = isInternalMachineAuthorized(req);
    let actorId = 'INTERNAL_MACHINE';
    let actorRole = 'INTERNAL_SERVICE';
    if (!isInternalAuth) {
      const authResult = authorizeMerchantRequest(req, tenantSlug, ['OWNER', 'MERCHANT']);
      if (!authResult.authorized) {
        return authResult.response;
      }
      actorId = authResult.payload.userId || authResult.payload.name || 'merchant';
      actorRole = authResult.payload.role || 'MERCHANT';
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: 'Database admin client is unavailable' },
        { status: 503 }
      );
    }

    const isTenantUuid = isValidUuid(tenantSlug);
    const { data: tenantRow, error: tenantErr } = isTenantUuid
      ? await supabaseAdmin.from('tenants').select('id, slug, metadata').eq('id', tenantSlug).maybeSingle()
      : await supabaseAdmin.from('tenants').select('id, slug, metadata').eq('slug', tenantSlug).maybeSingle();

    if (tenantErr) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: tenantErr.message },
        { status: 503 }
      );
    }

    if (!tenantRow || !tenantRow.id) {
      return NextResponse.json(
        { success: false, error: 'TENANT_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (!isInternalAuth) {
      const canonicalCheck = authorizeMerchantRequest(
        req,
        tenantSlug,
        ['OWNER', 'MERCHANT'],
        { id: tenantRow.id, slug: tenantRow.slug }
      );
      if (!canonicalCheck.authorized) {
        return canonicalCheck.response;
      }
    }

    const canonicalSlug = normalizeTenantSlug(tenantRow.slug || tenantSlug);
    const perm = await checkTenantMutationPermission(canonicalSlug);
    if (!perm.allowed && perm.response) {
      return perm.response;
    }

    const now = new Date().toISOString();
    const { data: currentSettings } = await supabaseAdmin
      .from('tenant_settings')
      .select('biteship_config')
      .eq('tenant_slug', canonicalSlug)
      .maybeSingle();

    const currentBiteship = currentSettings?.biteship_config || {};
    const existingLincah = currentBiteship.lincah || {};

    let nextLincah = existingLincah;
    if (body.lincah && typeof body.lincah === 'object') {
      const rawKey = typeof body.lincah.api_key === 'string' ? body.lincah.api_key.trim() : '';
      const rawRo = typeof (body.lincah.api_key_read_only ?? body.lincah.secret) === 'string'
        ? String(body.lincah.api_key_read_only ?? body.lincah.secret).trim()
        : '';

      const effectiveKey = rawKey && !rawKey.startsWith('••••') ? rawKey : existingLincah.api_key || '';
      const effectiveRo = rawRo && !rawRo.startsWith('••••') ? rawRo : (existingLincah.api_key_read_only || existingLincah.secret || '');

      if (effectiveKey || effectiveRo) {
        nextLincah = {
          provider: 'lincah',
          status: 'connected',
          is_connected: true,
          api_key: effectiveKey,
          secret: effectiveRo,
          api_key_read_only: effectiveRo,
          updated_at: now,
        };
      }
    }

    const hasSelfPickupFields =
      body.is_self_pickup_enabled !== undefined ||
      body.isSelfPickupEnabled !== undefined ||
      body.pickup_address !== undefined ||
      body.pickupAddress !== undefined ||
      body.origin_address !== undefined ||
      body.originAddress !== undefined ||
      body.origin_city !== undefined ||
      body.originCity !== undefined;

    let savedSelfPickupConfig = undefined;
    if (hasSelfPickupFields) {
      const result = await saveStoreShippingConfig(
        {
          tenant_id: tenantRow.id,
          tenant_slug: canonicalSlug,
          is_self_pickup_enabled: body.is_self_pickup_enabled ?? body.isSelfPickupEnabled,
          pickup_address: body.pickup_address ?? body.pickupAddress,
          pickup_maps_url: body.pickup_maps_url ?? body.pickupMapsUrl,
          pickup_operational_hours: body.pickup_operational_hours ?? body.pickupOperationalHours,
          pickup_instructions: body.pickup_instructions ?? body.pickupInstructions,
          origin_address: body.origin_address ?? body.originAddress ?? body.origin?.address,
          origin_city: body.origin_city ?? body.originCity ?? body.origin?.city,
          origin_district: body.origin_district ?? body.originDistrict ?? body.origin?.district,
          origin_postal_code: body.origin_postal_code ?? body.originPostalCode ?? body.origin?.postal_code,
        },
        supabaseAdmin
      );

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error || 'Gagal menyimpan konfigurasi' },
          { status: 500 }
        );
      }
      savedSelfPickupConfig = result.config;
    }

    const updatedBiteship: Record<string, any> = {
      ...currentBiteship,
      ...(body.is_enabled !== undefined ? { is_enabled: Boolean(body.is_enabled) } : {}),
      ...(body.origin && typeof body.origin === 'object'
        ? { origin: { ...(currentBiteship.origin || {}), ...body.origin } }
        : {}),
      ...(Array.isArray(body.couriers) ? { couriers: body.couriers } : {}),
      ...(body.auto_pickup !== undefined ? { auto_pickup: Boolean(body.auto_pickup) } : {}),
      ...(body.free_shipping_threshold !== undefined
        ? { free_shipping_threshold: Number(body.free_shipping_threshold) || 0 }
        : {}),
      ...(body.fnb_settings && typeof body.fnb_settings === 'object'
        ? { fnb_settings: { ...(currentBiteship.fnb_settings || {}), ...body.fnb_settings } }
        : {}),
      ...(body.routing_rules && typeof body.routing_rules === 'object'
        ? { routing_rules: { ...(currentBiteship.routing_rules || {}), ...body.routing_rules } }
        : {
            routing_rules: {
              ...(currentBiteship.routing_rules || {}),
              instant: currentBiteship.routing_rules?.instant || 'biteship',
              regular: currentBiteship.routing_rules?.regular || 'lincah',
            },
          }),
      ...(hasSelfPickupFields
        ? {
            is_self_pickup_enabled: Boolean(body.is_self_pickup_enabled ?? body.isSelfPickupEnabled),
            pickup_address: body.pickup_address ?? body.pickupAddress ?? currentBiteship.pickup_address,
            pickup_maps_url: body.pickup_maps_url ?? body.pickupMapsUrl ?? currentBiteship.pickup_maps_url,
            pickup_operational_hours: body.pickup_operational_hours ?? body.pickupOperationalHours ?? currentBiteship.pickup_operational_hours,
            pickup_instructions: body.pickup_instructions ?? body.pickupInstructions ?? currentBiteship.pickup_instructions,
          }
        : {}),
      ...(nextLincah && Object.keys(nextLincah).length > 0 ? { lincah: nextLincah } : {}),
      updated_at: now,
    };

    const { error: upsertErr } = await supabaseAdmin
      .from('tenant_settings')
      .upsert(
        {
          tenant_slug: canonicalSlug,
          biteship_config: updatedBiteship,
          updated_at: now,
        },
        { onConflict: 'tenant_slug' }
      );

    if (upsertErr) {
      return NextResponse.json(
        { success: false, error: upsertErr.message },
        { status: 500 }
      );
    }

    // Ensure tenants.metadata never retains plaintext Lincah API keys
    const sanitizedMeta = stripLincahSecretsFromMetadata(tenantRow.metadata || {});
    await supabaseAdmin
      .from('tenants')
      .update({ metadata: sanitizedMeta, updated_at: now })
      .eq('id', tenantRow.id);

    await recordTenantConfigAudit({
      tenantId: tenantRow.id,
      tenantSlug: canonicalSlug,
      actorId,
      actorRole,
      authMethod: isInternalAuth ? 'internal_machine' : 'merchant_session',
      action: 'SHIPPING_CONFIG_UPDATE',
      resourceType: 'tenant_settings.biteship_config',
      resourceId: tenantRow.id,
      status: 'SUCCESS',
      changedKeys: Object.keys(body),
      diffSummary: { summary: redactSensitiveValues(body) },
      req,
    });

    const latestConfig = savedSelfPickupConfig || (await getStoreShippingConfig(canonicalSlug, supabaseAdmin));
    return NextResponse.json({
      success: true,
      config: latestConfig,
      courier_config: {
        is_enabled: updatedBiteship.is_enabled ?? true,
        origin: updatedBiteship.origin || null,
        couriers: updatedBiteship.couriers || null,
        auto_pickup: updatedBiteship.auto_pickup ?? true,
        free_shipping_threshold: updatedBiteship.free_shipping_threshold || 0,
        fnb_settings: updatedBiteship.fnb_settings || null,
        routing_rules: updatedBiteship.routing_rules || null,
        lincah: maskLincahStatus(updatedBiteship.lincah),
      },
    });
  } catch (err: any) {
    console.error('[API Shipping Config POST Error]:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
