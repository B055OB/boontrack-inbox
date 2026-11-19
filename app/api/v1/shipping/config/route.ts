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
import {
  MIN_MERCHANT_RADIUS_KM,
  MAX_MERCHANT_RADIUS_KM,
  parseValidRadiusKm,
  resolveEffectiveInstantRadius,
} from '@/app/api/v1/shipping/rates/instant/route';

export const dynamic = 'force-dynamic';

function parseOptionalCoord(raw: unknown, min: number, max: number): { provided: boolean; valid: boolean; value: number | null } {
  if (raw === undefined) return { provided: false, valid: true, value: null };
  if (raw === null || raw === '') return { provided: true, valid: true, value: null };
  if (typeof raw === 'boolean') return { provided: true, valid: false, value: null };
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num) || num < min || num > max) {
    return { provided: true, valid: false, value: null };
  }
  return { provided: true, valid: true, value: num };
}

function resolveConfigEffectiveMaxRadius(cfg: any, meta: any): number {
  const metaShipping =
    meta?.shipping_config && typeof meta.shipping_config === 'object' ? meta.shipping_config : undefined;
  return resolveEffectiveInstantRadius(cfg, metaShipping, meta);
}

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

    if (settingsRes?.error) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: settingsRes.error.message },
        { status: 503 }
      );
    }

    const cfg = settingsRes.data?.biteship_config || {};
    const meta = tenantRow.metadata || {};
    const legacyLincah = meta.shipping_config?.lincah || meta.lincah_config || meta.shipping_settings;
    const effectiveMaxRadiusKm = resolveConfigEffectiveMaxRadius(cfg, meta);

    return NextResponse.json({
      success: true,
      config,
      courier_config: {
        is_enabled: cfg.is_enabled ?? true,
        origin: cfg.origin || meta.shipping_config?.origin || null,
        couriers: Array.isArray(cfg.couriers) ? cfg.couriers : null,
        auto_pickup: cfg.auto_pickup ?? true,
        free_shipping_threshold: cfg.free_shipping_threshold || 0,
        fnb_settings: cfg.fnb_settings || meta.shipping_config?.fnb_settings || null,
        routing_rules: cfg.routing_rules || meta.shipping_config?.routing_rules || null,
        lincah: maskLincahStatus(cfg.lincah, legacyLincah),
      },
      store_context: {
        fnb_catering: Boolean(
          meta.fnb_catering === true ||
          meta.fnb_catering?.is_enabled ||
          meta.fnb_catering?.is_fnb_home_service ||
          meta.vertical === 'fnb-culinary' ||
          meta.logistics?.primary === 'internal_fleet'
        ),
        business_category: meta.business_category || meta.category || null,
        logistics: meta.logistics || null,
        fnb_settings: meta.shipping_config?.fnb_settings || meta.fnb_settings || null,
        effective_max_radius_km: effectiveMaxRadiusKm,
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
    const { data: currentSettings, error: settingsReadErr } = await supabaseAdmin
      .from('tenant_settings')
      .select('biteship_config')
      .eq('tenant_slug', canonicalSlug)
      .maybeSingle();

    if (settingsReadErr) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: settingsReadErr.message },
        { status: 503 }
      );
    }

    const currentBiteship = currentSettings?.biteship_config || {};
    const existingLincah = currentBiteship.lincah || {};

    // Validate incoming fnb_settings & coordinates if present
    const incomingFnb = body.fnb_settings && typeof body.fnb_settings === 'object' ? body.fnb_settings : null;
    const incomingOrigin = body.origin && typeof body.origin === 'object' ? body.origin : null;

    let validatedRadius: number | null = null;
    let hasExplicitRadius = false;
    if (incomingFnb && incomingFnb.max_radius_km !== undefined && incomingFnb.max_radius_km !== null && incomingFnb.max_radius_km !== '') {
      validatedRadius = parseValidRadiusKm(incomingFnb.max_radius_km);
      if (validatedRadius === null) {
        return NextResponse.json(
          {
            success: false,
            error: 'INVALID_MAX_RADIUS',
            message: `Batas radius maksimal harus berupa angka antara ${MIN_MERCHANT_RADIUS_KM} hingga ${MAX_MERCHANT_RADIUS_KM} km.`,
          },
          { status: 400 }
        );
      }
      hasExplicitRadius = true;
    }

    const fnbLat = parseOptionalCoord(incomingFnb?.latitude, -90, 90);
    const fnbLng = parseOptionalCoord(incomingFnb?.longitude, -180, 180);
    const originLatCheck = parseOptionalCoord(incomingOrigin?.latitude, -90, 90);
    const originLngCheck = parseOptionalCoord(incomingOrigin?.longitude, -180, 180);

    if (!fnbLat.valid || !fnbLng.valid || !originLatCheck.valid || !originLngCheck.valid) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_COORDINATES',
          message: 'Koordinat latitude (-90..90) atau longitude (-180..180) tidak valid.',
        },
        { status: 400 }
      );
    }

    const resolvedLat = fnbLat.provided ? fnbLat.value : (originLatCheck.provided ? originLatCheck.value : undefined);
    const resolvedLng = fnbLng.provided ? fnbLng.value : (originLngCheck.provided ? originLngCheck.value : undefined);
    const hasNumericCoords = typeof resolvedLat === 'number' && typeof resolvedLng === 'number';
    const resolvedAddress =
      typeof incomingFnb?.kitchen_address === 'string' && incomingFnb.kitchen_address.trim()
        ? incomingFnb.kitchen_address.trim()
        : (typeof incomingOrigin?.address === 'string' && incomingOrigin.address.trim()
          ? incomingOrigin.address.trim()
          : undefined);

    let mergedFnbSettings: Record<string, any> | undefined = undefined;
    let fnbNonRadiusPatch: Record<string, any> | undefined = undefined;
    if (incomingFnb) {
      const cleanIncomingFnb: Record<string, any> = { ...incomingFnb };
      delete cleanIncomingFnb.radius_synced_at;
      delete cleanIncomingFnb.updated_at;
      if (resolvedLat !== undefined) cleanIncomingFnb.latitude = resolvedLat;
      if (resolvedLng !== undefined) cleanIncomingFnb.longitude = resolvedLng;
      if (resolvedAddress !== undefined) cleanIncomingFnb.kitchen_address = resolvedAddress;

      const existingFnbSettings =
        currentBiteship.fnb_settings && typeof currentBiteship.fnb_settings === 'object'
          ? { ...currentBiteship.fnb_settings }
          : {};

      if (hasExplicitRadius && validatedRadius !== null) {
        const normalizedRadius = Math.round(validatedRadius * 10) / 10;
        validatedRadius = normalizedRadius;
        cleanIncomingFnb.max_radius_km = normalizedRadius;
        cleanIncomingFnb.radius_synced_at = now;
        mergedFnbSettings = {
          ...existingFnbSettings,
          ...cleanIncomingFnb,
          updated_at: now,
        };
      } else {
        delete cleanIncomingFnb.max_radius_km;
        // Guard against partial fnb_settings saves (e.g. BiteshipCourierConfig saving kitchen_address)
        // promoting an unsynced legacy max_radius_km (such as 30 without radius_synced_at) or stamping radius_synced_at.
        if (!existingFnbSettings.radius_synced_at) {
          delete existingFnbSettings.max_radius_km;
        }
        mergedFnbSettings = {
          ...existingFnbSettings,
          ...cleanIncomingFnb,
          updated_at: now,
        };
      }

      fnbNonRadiusPatch = { ...cleanIncomingFnb };
    }

    let mergedOrigin: Record<string, any> | undefined = undefined;
    if (incomingOrigin || (incomingFnb && (resolvedLat !== undefined || resolvedLng !== undefined || resolvedAddress !== undefined))) {
      mergedOrigin = {
        ...(currentBiteship.origin || {}),
        ...(incomingOrigin || {}),
        ...(resolvedLat !== undefined ? { latitude: resolvedLat } : {}),
        ...(resolvedLng !== undefined ? { longitude: resolvedLng } : {}),
        ...(resolvedAddress !== undefined ? { address: resolvedAddress } : {}),
      };
    }

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

    const hasExplicitSelfPickupToggle =
      body.is_self_pickup_enabled !== undefined || body.isSelfPickupEnabled !== undefined;

    let savedSelfPickupConfig = undefined;
    if (hasSelfPickupFields) {
      const result = await saveStoreShippingConfig(
        {
          tenant_id: tenantRow.id,
          tenant_slug: canonicalSlug,
          is_self_pickup_enabled: hasExplicitSelfPickupToggle
            ? Boolean(body.is_self_pickup_enabled ?? body.isSelfPickupEnabled)
            : Boolean(currentBiteship.is_self_pickup_enabled ?? currentBiteship.self_pickup?.is_enabled ?? false),
          pickup_address: body.pickup_address ?? body.pickupAddress ?? currentBiteship.pickup_address,
          pickup_maps_url: body.pickup_maps_url ?? body.pickupMapsUrl ?? currentBiteship.pickup_maps_url,
          pickup_operational_hours: body.pickup_operational_hours ?? body.pickupOperationalHours ?? currentBiteship.pickup_operational_hours,
          pickup_instructions: body.pickup_instructions ?? body.pickupInstructions ?? currentBiteship.pickup_instructions,
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
      ...(mergedOrigin ? { origin: mergedOrigin } : {}),
      ...(Array.isArray(body.couriers) ? { couriers: body.couriers } : {}),
      ...(body.auto_pickup !== undefined ? { auto_pickup: Boolean(body.auto_pickup) } : {}),
      ...(body.free_shipping_threshold !== undefined
        ? { free_shipping_threshold: Number(body.free_shipping_threshold) || 0 }
        : {}),
      ...(mergedFnbSettings ? { fnb_settings: mergedFnbSettings } : {}),
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
          is_self_pickup_enabled: hasExplicitSelfPickupToggle
            ? Boolean(body.is_self_pickup_enabled ?? body.isSelfPickupEnabled)
            : Boolean(currentBiteship.is_self_pickup_enabled ?? currentBiteship.self_pickup?.is_enabled ?? false),
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

    // Ensure tenants.metadata never retains plaintext Lincah API keys and stays synchronized for F&B/shipping readers
    const sanitizedMeta = stripLincahSecretsFromMetadata(tenantRow.metadata || {});
    if (mergedFnbSettings || mergedOrigin || (body.routing_rules && typeof body.routing_rules === 'object')) {
      const existingMetaShipping =
        sanitizedMeta.shipping_config && typeof sanitizedMeta.shipping_config === 'object'
          ? { ...sanitizedMeta.shipping_config }
          : {};

      if (mergedFnbSettings && fnbNonRadiusPatch) {
        const metaFnbSync =
          hasExplicitRadius && validatedRadius !== null
            ? mergedFnbSettings
            : fnbNonRadiusPatch;
        existingMetaShipping.fnb_settings = {
          ...(existingMetaShipping.fnb_settings || {}),
          ...metaFnbSync,
        };
        if (sanitizedMeta.fnb_settings && typeof sanitizedMeta.fnb_settings === 'object') {
          sanitizedMeta.fnb_settings = {
            ...sanitizedMeta.fnb_settings,
            ...metaFnbSync,
          };
        }
      }

      if (mergedOrigin) {
        existingMetaShipping.origin = {
          ...(existingMetaShipping.origin || {}),
          ...mergedOrigin,
        };
        if (typeof mergedOrigin.latitude === 'number') {
          existingMetaShipping.origin_latitude = mergedOrigin.latitude;
        }
        if (typeof mergedOrigin.longitude === 'number') {
          existingMetaShipping.origin_longitude = mergedOrigin.longitude;
        }
        if (typeof mergedOrigin.address === 'string' && mergedOrigin.address.trim()) {
          existingMetaShipping.origin_address = mergedOrigin.address.trim();
        }
      }

      if (hasExplicitRadius && validatedRadius !== null) {
        existingMetaShipping.max_radius_km = validatedRadius;
        if (existingMetaShipping.internal_courier && typeof existingMetaShipping.internal_courier === 'object') {
          existingMetaShipping.internal_courier = {
            ...existingMetaShipping.internal_courier,
            max_radius_km: validatedRadius,
          };
        }
        if (existingMetaShipping.lalamove_internal && typeof existingMetaShipping.lalamove_internal === 'object') {
          existingMetaShipping.lalamove_internal = {
            ...existingMetaShipping.lalamove_internal,
            max_radius_km: validatedRadius,
          };
        }
      }

      if (body.routing_rules && typeof body.routing_rules === 'object') {
        existingMetaShipping.routing_rules = {
          ...(existingMetaShipping.routing_rules || {}),
          ...body.routing_rules,
        };
      }

      if (hasNumericCoords || resolvedAddress) {
        sanitizedMeta.outlet_coordinates = {
          ...(sanitizedMeta.outlet_coordinates && typeof sanitizedMeta.outlet_coordinates === 'object'
            ? sanitizedMeta.outlet_coordinates
            : {}),
          ...(hasNumericCoords ? { latitude: resolvedLat, longitude: resolvedLng } : {}),
          ...(resolvedAddress ? { address: resolvedAddress } : {}),
        };
      }

      if (incomingFnb?.fnb_catering === true && !sanitizedMeta.fnb_catering) {
        sanitizedMeta.fnb_catering = true;
      }

      sanitizedMeta.shipping_config = existingMetaShipping;
    }

    const { error: tenantUpdateErr } = await supabaseAdmin
      .from('tenants')
      .update({ metadata: sanitizedMeta, updated_at: now })
      .eq('id', tenantRow.id);

    if (tenantUpdateErr) {
      return NextResponse.json(
        { success: false, error: tenantUpdateErr.message },
        { status: 500 }
      );
    }

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
    const effectiveMaxRadiusKm = resolveConfigEffectiveMaxRadius(updatedBiteship, sanitizedMeta);

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
      store_context: {
        effective_max_radius_km: effectiveMaxRadiusKm,
        fnb_settings: sanitizedMeta.shipping_config?.fnb_settings || null,
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
