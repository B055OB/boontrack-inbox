import { checkTenantMutationPermission } from '@/lib/subscription-guard';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSupabase, getSupabaseAdmin, getWorkforceSupabaseAdmin } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { getBackendApiUrl } from '@/lib/api-config';
import {
  authorizeMerchantSession,
  isInternalMachineAuthorized,
} from '@/lib/auth/merchant-session';
import { projectPublicMicrosite } from '@/lib/product-catalog';

export function sanitizePhoneNumber(raw: unknown): string {
  if (!raw) return '';
  let clean = String(raw).replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  return clean;
}

type TierEnum = 'SOLO' | 'ADS_PERFORMANCE' | 'TEAM_SCALE';

function resolvePlanTier(tier: string | undefined | null): TierEnum {
  if (!tier) return 'SOLO';
  const t = tier.toUpperCase();
  if (t === 'TEAM_SCALE' || t === 'ENTERPRISE') return 'TEAM_SCALE';
  if (t === 'ADS_PERFORMANCE' || t === 'PRO_SCALE') return 'ADS_PERFORMANCE';
  return 'SOLO';
}

function checkInternalMachineScope(
  req: NextRequest,
  slug: string,
  allowedOperation: 'READ_TENANT_SETTINGS' | 'UPDATE_TENANT_SETTINGS'
): { isMachineAttempt: boolean; isAuthorized: boolean; response?: NextResponse } {
  const authHeader = req.headers.get('authorization')?.trim() || '';
  const internalSecret = req.headers.get('x-internal-secret')?.trim() || '';
  const envAdminSecret = (process.env.ADMIN_INTERNAL_SECRET || process.env.INTERNAL_API_SECRET)?.trim();

  const hasSecretHeader = Boolean(internalSecret);
  const isBearerCandidate = authHeader.toLowerCase().startsWith('bearer ') && Boolean(envAdminSecret) && authHeader.slice(7).trim() === envAdminSecret;
  const isMachineAttempt = hasSecretHeader || isBearerCandidate;

  if (!isMachineAttempt) {
    return { isMachineAttempt: false, isAuthorized: false };
  }

  const isInternalAuth = isInternalMachineAuthorized(req, slug, [allowedOperation]);
  if (!isInternalAuth) {
    if (internalSecret && (!envAdminSecret || internalSecret !== envAdminSecret)) {
      return {
        isMachineAttempt: true,
        isAuthorized: false,
        response: NextResponse.json(
          { success: false, error: 'Unauthorized: Invalid internal machine secret.' },
          { status: 401 }
        ),
      };
    }

    const reqTargetTenant = (
      req.headers.get('x-target-tenant') ||
      req.headers.get('x-tenant-slug') ||
      req.headers.get('x-tenant-id')
    )?.trim().toLowerCase();

    if (!reqTargetTenant) {
      return {
        isMachineAttempt: true,
        isAuthorized: false,
        response: NextResponse.json(
          { success: false, error: 'Forbidden: x-target-tenant header is required for internal machine authorization.' },
          { status: 403 }
        ),
      };
    }

    if (reqTargetTenant !== slug.trim().toLowerCase()) {
      return {
        isMachineAttempt: true,
        isAuthorized: false,
        response: NextResponse.json(
          { success: false, error: 'Forbidden: Target tenant does not match internal machine scope.' },
          { status: 403 }
        ),
      };
    }

    const reqOperation = (
      req.headers.get('x-machine-operation') ||
      req.headers.get('x-internal-operation')
    )?.trim().toUpperCase();

    if (!reqOperation || reqOperation !== allowedOperation) {
      return {
        isMachineAttempt: true,
        isAuthorized: false,
        response: NextResponse.json(
          { success: false, error: `Forbidden: Operation does not match internal machine scope '${allowedOperation}'.` },
          { status: 403 }
        ),
      };
    }

    return {
      isMachineAttempt: true,
      isAuthorized: false,
      response: NextResponse.json(
        { success: false, error: 'Forbidden: Machine authorization failed scope verification.' },
        { status: 403 }
      ),
    };
  }

  return { isMachineAttempt: true, isAuthorized: true };
}

// ── NESTED DTO ALLOWLIST PROJECTION SCHEMAS (Round 3R & 3S) ──

export const ALLOWED_THEME_KEYS = new Set([
  'template',
  'visual_theme',
  'primary_color',
  'secondary_color',
  'accent_color',
  'font_family',
  'layout',
  'layout_style',
  'chat_enabled',
  'chat_position',
  'show_featured_products',
  'featured_product_ids',
  'header_style',
  'card_style',
  'badge',
  'theme_id',
]);

export function projectThemeDto(raw: any): Record<string, any> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { template: 'default', chat_enabled: true, chat_position: 'bottom-right' };
  }
  const projected: Record<string, any> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (ALLOWED_THEME_KEYS.has(key)) {
      if (key === 'featured_product_ids' && Array.isArray(value)) {
        projected[key] = value.filter((id) => typeof id === 'string' || typeof id === 'number');
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        projected[key] = value;
      }
    }
  }
  if (!projected.template) projected.template = 'default';
  return projected;
}

export function projectFaqsDto(rawFaqs: any): Array<{ id: string; question: string; answer: string; category?: string }> {
  if (!Array.isArray(rawFaqs)) return [];
  const projected: Array<{ id: string; question: string; answer: string; category?: string }> = [];
  for (const item of rawFaqs) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const question = typeof item.question === 'string' ? item.question : (typeof item.title === 'string' ? item.title : '');
    const answer = typeof item.answer === 'string' ? item.answer : (typeof item.content === 'string' ? item.content : '');
    const category = typeof item.category === 'string' ? item.category : undefined;
    const id = typeof item.id === 'string' || typeof item.id === 'number' ? String(item.id) : `faq_${Math.random().toString(36).substring(2, 7)}`;
    if (question || answer) {
      projected.push({
        id,
        question,
        answer,
        ...(category ? { category } : {}),
      });
    }
  }
  return projected;
}

export const ALLOWED_DAY_KEYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

export function projectBusinessHoursDto(raw: any): Record<string, any> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const projected: Record<string, any> = {};

  if (typeof raw.timezone === 'string') projected.timezone = raw.timezone;
  if (typeof raw.is_always_open === 'boolean') projected.is_always_open = raw.is_always_open;
  if (typeof raw.notes === 'string') projected.notes = raw.notes;

  if (raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days)) {
    const projectedDays: Record<string, any> = {};
    for (const [day, dayVal] of Object.entries(raw.days)) {
      if (ALLOWED_DAY_KEYS.has(day.toLowerCase()) && dayVal && typeof dayVal === 'object' && !Array.isArray(dayVal)) {
        projectedDays[day.toLowerCase()] = {
          open: typeof (dayVal as any).open === 'string' ? (dayVal as any).open : '',
          close: typeof (dayVal as any).close === 'string' ? (dayVal as any).close : '',
          is_open: typeof (dayVal as any).is_open === 'boolean' ? (dayVal as any).is_open : true,
        };
      }
    }
    projected.days = projectedDays;
  }

  if (Array.isArray(raw.schedule)) {
    const projectedSchedule: any[] = [];
    for (const item of raw.schedule) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        projectedSchedule.push({
          day: typeof item.day === 'string' ? item.day : '',
          open: typeof item.open === 'string' ? item.open : '',
          close: typeof item.close === 'string' ? item.close : '',
          closed: typeof item.closed === 'boolean' ? item.closed : Boolean(item.is_closed),
        });
      }
    }
    projected.schedule = projectedSchedule;
  }

  for (const day of ALLOWED_DAY_KEYS) {
    if (raw[day] && typeof raw[day] === 'object' && !Array.isArray(raw[day])) {
      projected[day] = {
        open: typeof raw[day].open === 'string' ? raw[day].open : '',
        close: typeof raw[day].close === 'string' ? raw[day].close : '',
        is_open: typeof raw[day].is_open === 'boolean' ? raw[day].is_open : true,
      };
    }
  }

  return projected;
}

export const ALLOWED_CATALOG_KEYS = new Set([
  'default_sort',
  'items_per_page',
  'show_out_of_stock',
  'show_prices',
  'card_layout',
  'display_mode',
  'categories_visible',
  'allow_search',
  'featured_category_ids',
]);

export function projectCatalogPreferencesDto(raw: any): Record<string, any> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const projected: Record<string, any> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (ALLOWED_CATALOG_KEYS.has(key)) {
      if (key === 'featured_category_ids' && Array.isArray(value)) {
        projected[key] = value.filter((id) => typeof id === 'string' || typeof id === 'number');
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        projected[key] = value;
      }
    }
  }
  return projected;
}

export const ALLOWED_LINK_PLATFORMS = new Set([
  'instagram',
  'tiktok',
  'facebook',
  'twitter',
  'x',
  'youtube',
  'website',
  'maps',
  'shopee',
  'tokopedia',
  'whatsapp',
  'telegram',
  'linkedin',
  'marketplace',
  'gofood',
  'grabfood',
  'shopeefood',
  'custom',
]);

export function projectPublicLinksDto(raw: any): any {
  if (!raw) return null;

  if (Array.isArray(raw)) {
    const projectedArray: any[] = [];
    for (const item of raw) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const title = typeof item.title === 'string' ? item.title.slice(0, 100) : (typeof item.label === 'string' ? item.label.slice(0, 100) : '');
        const url = typeof item.url === 'string' ? item.url.slice(0, 500) : (typeof item.href === 'string' ? item.href.slice(0, 500) : '');
        const rawPlatform = typeof item.platform === 'string' ? item.platform.trim().toLowerCase() : '';
        const platform = rawPlatform && rawPlatform.length <= 32 && ALLOWED_LINK_PLATFORMS.has(rawPlatform)
          ? rawPlatform
          : undefined;
        if (url) {
          projectedArray.push({
            title,
            url,
            ...(platform ? { platform } : {}),
            icon: typeof item.icon === 'string' && item.icon.length <= 32 ? item.icon : undefined,
            order: typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : undefined,
            is_active: typeof item.is_active === 'boolean' ? item.is_active : true,
          });
        }
      }
    }
    return projectedArray;
  }

  if (typeof raw === 'object') {
    const projectedObj: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      const normKey = key.toLowerCase().trim();
      if (ALLOWED_LINK_PLATFORMS.has(normKey) && typeof value === 'string' && value.length <= 500) {
        projectedObj[normKey] = value;
      }
    }
    return projectedObj;
  }

  return null;
}

export const ALLOWED_FEATURE_KEYS = new Set([
  'has_capi',
  'capi',
  'has_reader',
  'ads_tracking',
  'multi_cs',
  'inbox',
  'ai_bot',
  'chatbox',
  'boonpilot',
  'smart_chatbox',
  'broadcast',
  'custom_domain',
  'unlimited_products',
  'single_page_checkout',
  'crm',
  'has_crm',
  'memory_crm',
  'customers',
  'export',
  'reseller',
  'store_reseller',
  'reseller_system',
  'reseller_tier',
  'reseller_unlimited',
  'reseller_scale',
  'reseller_starter',
  'tier',
  'paid_ads_intelligence',
  'PAID_ADS_INTELLIGENCE',
  'viral_trends_radar',
  'VIRAL_TRENDS_RADAR',
  'whatsapp_gateway',
  'telegram_bot',
  'webchat_widget',
  'auto_ai_reply',
  'qris_billing',
  'gate_iot_sync',
  'cv_ats_scanner',
  'rate_limiting',
]);

export function projectFeaturesDto(raw: any): Record<string, boolean | string | number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const projected: Record<string, boolean | string | number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (ALLOWED_FEATURE_KEYS.has(key)) {
      if (typeof value === 'boolean') {
        projected[key] = value;
      } else if (typeof value === 'string' && value.length < 100) {
        projected[key] = value;
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        projected[key] = value;
      }
    }
  }
  return projected;
}

/**
 * projectShippingConfigDto — Constructive Positive Allowlist for Shipping Configuration.
 *
 * Guarantees zero leak of root-level or nested credentials (api_key, secret, auth_token, partner_id, etc.).
 * ONLY operational public fields required by UI and checkout are extracted.
 * Rest-spread is STRICTLY FORBIDDEN.
 */
export function projectShippingConfigDto(raw: any): Record<string, any> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;

  const safe: Record<string, any> = {};

  if (typeof raw.is_enabled === 'boolean') safe.is_enabled = raw.is_enabled;
  if (typeof raw.active_aggregator === 'string') safe.active_aggregator = raw.active_aggregator.slice(0, 50);
  if (typeof raw.auto_pickup === 'boolean') safe.auto_pickup = raw.auto_pickup;
  if (typeof raw.free_shipping_threshold === 'number' && !Number.isNaN(raw.free_shipping_threshold)) {
    safe.free_shipping_threshold = raw.free_shipping_threshold;
  }

  // Couriers list: array of string courier IDs
  if (Array.isArray(raw.couriers)) {
    safe.couriers = raw.couriers.filter((c: any) => typeof c === 'string').map((c: string) => c.slice(0, 50));
  } else if (Array.isArray(raw.active_couriers)) {
    safe.active_couriers = raw.active_couriers.filter((c: any) => typeof c === 'string').map((c: string) => c.slice(0, 50));
  }

  // Self pickup operational fields
  if (typeof raw.is_self_pickup_enabled === 'boolean') safe.is_self_pickup_enabled = raw.is_self_pickup_enabled;
  if (typeof raw.pickup_address === 'string') safe.pickup_address = raw.pickup_address.slice(0, 500);
  if (typeof raw.pickup_maps_url === 'string') safe.pickup_maps_url = raw.pickup_maps_url.slice(0, 1000);
  if (typeof raw.pickup_operational_hours === 'string') safe.pickup_operational_hours = raw.pickup_operational_hours.slice(0, 200);
  if (typeof raw.pickup_instructions === 'string') safe.pickup_instructions = raw.pickup_instructions.slice(0, 1000);

  // Flat origin fields
  if (typeof raw.origin_address === 'string') safe.origin_address = raw.origin_address.slice(0, 500);
  if (typeof raw.origin_city === 'string') safe.origin_city = raw.origin_city.slice(0, 100);
  if (typeof raw.origin_district === 'string') safe.origin_district = raw.origin_district.slice(0, 100);
  if (typeof raw.origin_postal_code === 'string') safe.origin_postal_code = raw.origin_postal_code.slice(0, 20);

  // Nested origin object
  if (raw.origin && typeof raw.origin === 'object' && !Array.isArray(raw.origin)) {
    const originSafe: Record<string, any> = {};
    if (typeof raw.origin.sender_name === 'string') originSafe.sender_name = raw.origin.sender_name.slice(0, 100);
    if (typeof raw.origin.sender_phone === 'string') originSafe.sender_phone = raw.origin.sender_phone.slice(0, 50);
    if (typeof raw.origin.address === 'string') originSafe.address = raw.origin.address.slice(0, 500);
    if (typeof raw.origin.city === 'string') originSafe.city = raw.origin.city.slice(0, 100);
    if (typeof raw.origin.district === 'string') originSafe.district = raw.origin.district.slice(0, 100);
    if (typeof raw.origin.postal_code === 'string') originSafe.postal_code = raw.origin.postal_code.slice(0, 20);
    safe.origin = originSafe;
  }

  // Nested routing rules
  if (raw.routing_rules && typeof raw.routing_rules === 'object' && !Array.isArray(raw.routing_rules)) {
    const routingSafe: Record<string, any> = {};
    if (typeof raw.routing_rules.instant === 'string') routingSafe.instant = raw.routing_rules.instant.slice(0, 50);
    if (typeof raw.routing_rules.regular === 'string') routingSafe.regular = raw.routing_rules.regular.slice(0, 50);
    safe.routing_rules = routingSafe;
  }

  // Nested FnB catering settings
  if (raw.fnb_settings && typeof raw.fnb_settings === 'object' && !Array.isArray(raw.fnb_settings)) {
    const fnbSafe: Record<string, any> = {};
    if (typeof raw.fnb_settings.is_enabled === 'boolean') fnbSafe.is_enabled = raw.fnb_settings.is_enabled;
    if (typeof raw.fnb_settings.kitchen_address === 'string') fnbSafe.kitchen_address = raw.fnb_settings.kitchen_address.slice(0, 500);
    if (typeof raw.fnb_settings.max_distance_km === 'number' && !Number.isNaN(raw.fnb_settings.max_distance_km)) {
      fnbSafe.max_distance_km = raw.fnb_settings.max_distance_km;
    }
    safe.fnb_settings = fnbSafe;
  }

  // Lincah provider status (NO secrets)
  if (raw.lincah && typeof raw.lincah === 'object' && !Array.isArray(raw.lincah)) {
    safe.lincah = {
      provider: typeof raw.lincah.provider === 'string' ? raw.lincah.provider.slice(0, 50) : 'lincah',
      status: typeof raw.lincah.status === 'string' ? raw.lincah.status.slice(0, 50) : undefined,
      is_connected: Boolean(raw.lincah.is_connected),
      is_sandbox: Boolean(raw.lincah.is_sandbox),
      last_validated_at: typeof raw.lincah.last_validated_at === 'string' ? raw.lincah.last_validated_at : null,
      // api_key and secret are NEVER projected
    };
  }

  // Biteship provider status (NO secrets)
  if (raw.biteship && typeof raw.biteship === 'object' && !Array.isArray(raw.biteship)) {
    safe.biteship = {
      is_connected: Boolean(raw.biteship.is_connected),
      is_sandbox: Boolean(raw.biteship.is_sandbox),
      last_validated_at: typeof raw.biteship.last_validated_at === 'string' ? raw.biteship.last_validated_at : null,
      // api_key is NEVER projected
    };
  }

  return safe;
}

/**
 * projectSafeRscTenantDto — RSC-safe tenant DTO for ALL roles including OWNER.
 *
 * NEVER serializes raw credential strings into the RSC HTML stream.
 * Secrets (capi_token, waba_access_token, payment gateway keys, bank credentials) are
 * replaced with boolean presence indicators (has_capi_token, has_waba_access_token).
 * Microsite nested content is projected via constructive allowlist.
 * All other operational fields are preserved for dashboard functionality.
 */
export function projectSafeRscTenantDto(settings: any, role: string): Record<string, any> {
  if (!settings) return {};

  const meta = (settings.metadata && typeof settings.metadata === 'object' && !Array.isArray(settings.metadata))
    ? settings.metadata : {};

  // Microsite: constructive projection strips hostile nested secrets
  const projectedMicrosite = meta.microsite && typeof meta.microsite === 'object' && !Array.isArray(meta.microsite)
    ? (projectPublicMicrosite(meta.microsite) ?? undefined)
    : undefined;

  // Self-pickup config: safe field-by-field copy
  const selfPickupConfig = meta.self_pickup_config && typeof meta.self_pickup_config === 'object'
    ? {
        is_enabled: Boolean(meta.self_pickup_config.is_enabled),
        pickup_address: typeof meta.self_pickup_config.pickup_address === 'string' ? meta.self_pickup_config.pickup_address : '',
        pickup_maps_url: typeof meta.self_pickup_config.pickup_maps_url === 'string' ? meta.self_pickup_config.pickup_maps_url : '',
        pickup_operational_hours: typeof meta.self_pickup_config.pickup_operational_hours === 'string' ? meta.self_pickup_config.pickup_operational_hours : '',
        pickup_instructions: typeof meta.self_pickup_config.pickup_instructions === 'string' ? meta.self_pickup_config.pickup_instructions : '',
      }
    : undefined;

  const safeMetadata: Record<string, any> = {};
  if (typeof meta.display_name === 'string') safeMetadata.display_name = meta.display_name;
  if (typeof meta.description === 'string') safeMetadata.description = meta.description;
  if (typeof meta.tagline === 'string') safeMetadata.tagline = meta.tagline;
  if (typeof meta.store_name === 'string') safeMetadata.store_name = meta.store_name;
  if (typeof meta.qris_payload === 'string') safeMetadata.qris_payload = meta.qris_payload;
  if (typeof meta.qris_image_url === 'string') safeMetadata.qris_image_url = meta.qris_image_url;
  if (typeof meta.logo_url === 'string') safeMetadata.logo_url = meta.logo_url;
  if (typeof meta.store_logo_url === 'string') safeMetadata.store_logo_url = meta.store_logo_url;
  if (typeof meta.avatar_url === 'string') safeMetadata.avatar_url = meta.avatar_url;
  if (typeof meta.bio === 'string') safeMetadata.bio = meta.bio;
  if (meta.theme) safeMetadata.theme = projectThemeDto(meta.theme);
  if (meta.business_hours) safeMetadata.business_hours = projectBusinessHoursDto(meta.business_hours);
  if (meta.catalog_preferences) safeMetadata.catalog_preferences = projectCatalogPreferencesDto(meta.catalog_preferences);
  if (meta.public_links) safeMetadata.public_links = projectPublicLinksDto(meta.public_links);
  if (meta.features) safeMetadata.features = projectFeaturesDto(meta.features);
  if (projectedMicrosite) safeMetadata.microsite = projectedMicrosite;
  if (selfPickupConfig) safeMetadata.self_pickup_config = selfPickupConfig;

  // For OWNER: include shipping_config strictly via constructive positive allowlist (Round 3T.1 Temuan A)
  if (role === 'OWNER' && meta.shipping_config && typeof meta.shipping_config === 'object') {
    const safeShipping = projectShippingConfigDto(meta.shipping_config);
    if (safeShipping) {
      safeMetadata.shipping_config = safeShipping;
    }
  }

  // Determine secret presence booleans (replace raw secret strings)
  const rawCapiToken = settings.capi_token || meta.capi_token || settings.integration?.capi_token;
  const rawWabaToken = settings.waba_access_token || meta.waba_config?.access_token || settings.waba_config?.access_token;
  const rawQrisImage = settings.qris_image_url || meta.qris_image_url;
  const isQrisActive = Boolean(settings.is_qris_active ?? meta.is_qris_active ?? false);

  return {
    id: settings.id,
    slug: settings.slug,
    name: settings.name,
    store_name: settings.store_name || (typeof meta.store_name === 'string' ? meta.store_name : settings.name),
    display_name: typeof settings.display_name === 'string' ? settings.display_name : (typeof meta.display_name === 'string' ? meta.display_name : null),
    description: typeof settings.description === 'string' ? settings.description : (typeof meta.description === 'string' ? meta.description : null),
    tagline: typeof settings.tagline === 'string' ? settings.tagline : (typeof meta.tagline === 'string' ? meta.tagline : null),
    category: settings.category || 'retail',
    tier: settings.tier,
    plan_tier: settings.plan_tier,
    status: settings.status,
    subscription_status: settings.subscription_status,
    is_suspended: settings.is_suspended,
    trial_ends_at: settings.trial_ends_at,
    subscription_ends_at: settings.subscription_ends_at,
    logo_url: settings.logo_url,
    avatar_url: settings.avatar_url,
    bio: settings.bio,
    currency: settings.currency || 'IDR',
    created_at: settings.created_at,
    updated_at: settings.updated_at,
    // Channel config: boolean indicators only — raw tokens NEVER serialized to RSC stream
    has_capi_token: Boolean(rawCapiToken),
    has_waba_access_token: Boolean(rawWabaToken),
    has_waba_config: Boolean(settings.waba_config || meta.waba_config),
    waba_phone_number_id: settings.waba_phone_number_id || null,
    // Payment: preserve public-safe fields, strip credentials
    is_qris_active: isQrisActive,
    qris_image_url: typeof rawQrisImage === 'string' ? rawQrisImage : null,
    has_payment_gateway: Boolean(settings.payment_config || settings.gateway_config),
    // Greeting messages: operational, non-secret
    greeting_message: settings.greeting_message || null,
    custom_greeting_message: settings.custom_greeting_message || null,
    // Contact info: operational public merchant contacts for OWNER
    phone: role === 'OWNER' ? (settings.phone || meta.phone || null) : null,
    whatsapp_number: role === 'OWNER' ? (settings.whatsapp_number || meta.whatsapp_number || null) : null,
    telegram_chat_id: role === 'OWNER' ? (settings.telegram_chat_id || meta.telegram_chat_id || null) : null,
    // Secret fields — explicitly null for ALL roles in RSC stream
    bank: null,
    bank_accounts: null,
    payment_config: null,
    capi_token: null,
    waba_access_token: null,
    waba_config: null,
    integration: null,
    gateway_config: null,
    // Projected feature DTOs
    features: projectFeaturesDto(settings.features || meta.features),
    faqs: projectFaqsDto(settings.faqs || meta.faqs),
    theme: projectThemeDto(settings.theme || meta.theme),
    microsite: projectedMicrosite || null,
    metadata: safeMetadata,
  };
}

export function sanitizeSettingsForRole(settings: any, role: string) {
  if (!settings) return settings;
  if (role === 'OWNER') {
    return settings;
  }

  // Construct metadata strictly via nested DTO projection (Round 3R & 3S)
  const sanitizedMetadata: Record<string, any> = {};
  if (settings.metadata && typeof settings.metadata === 'object') {
    if (typeof settings.metadata.display_name === 'string') {
      sanitizedMetadata.display_name = settings.metadata.display_name;
    }
    if (typeof settings.metadata.description === 'string') {
      sanitizedMetadata.description = settings.metadata.description;
    }
    if (typeof settings.metadata.tagline === 'string') {
      sanitizedMetadata.tagline = settings.metadata.tagline;
    }
    if (typeof settings.metadata.qris_payload === 'string') {
      sanitizedMetadata.qris_payload = settings.metadata.qris_payload;
    }
    if (typeof settings.metadata.qris_image_url === 'string') {
      sanitizedMetadata.qris_image_url = settings.metadata.qris_image_url;
    }
    if (typeof settings.metadata.logo_url === 'string') {
      sanitizedMetadata.logo_url = settings.metadata.logo_url;
    }
    if (typeof settings.metadata.store_logo_url === 'string') {
      sanitizedMetadata.store_logo_url = settings.metadata.store_logo_url;
    }
    if (typeof settings.metadata.avatar_url === 'string') {
      sanitizedMetadata.avatar_url = settings.metadata.avatar_url;
    }
    if (typeof settings.metadata.bio === 'string') {
      sanitizedMetadata.bio = settings.metadata.bio;
    }
    if (settings.metadata.theme) {
      sanitizedMetadata.theme = projectThemeDto(settings.metadata.theme);
    }
    if (settings.metadata.business_hours) {
      sanitizedMetadata.business_hours = projectBusinessHoursDto(settings.metadata.business_hours);
    }
    if (settings.metadata.catalog_preferences) {
      sanitizedMetadata.catalog_preferences = projectCatalogPreferencesDto(settings.metadata.catalog_preferences);
    }
    if (settings.metadata.public_links) {
      sanitizedMetadata.public_links = projectPublicLinksDto(settings.metadata.public_links);
    }
    if (settings.metadata.features) {
      sanitizedMetadata.features = projectFeaturesDto(settings.metadata.features);
    }
    if (settings.metadata.microsite && typeof settings.metadata.microsite === 'object' && !Array.isArray(settings.metadata.microsite)) {
      // Use constructive projection to strip hostile nested secrets from buttons etc. (Round 3T.1 P0-C)
      const projectedMicrosite = projectPublicMicrosite(settings.metadata.microsite);
      if (projectedMicrosite) {
        sanitizedMetadata.microsite = projectedMicrosite;
      }
    }
    if (settings.metadata.self_pickup_config && typeof settings.metadata.self_pickup_config === 'object') {
      sanitizedMetadata.self_pickup_config = {
        is_enabled: Boolean(settings.metadata.self_pickup_config.is_enabled),
        pickup_address: typeof settings.metadata.self_pickup_config.pickup_address === 'string' ? settings.metadata.self_pickup_config.pickup_address : '',
        pickup_maps_url: typeof settings.metadata.self_pickup_config.pickup_maps_url === 'string' ? settings.metadata.self_pickup_config.pickup_maps_url : '',
        pickup_operational_hours: typeof settings.metadata.self_pickup_config.pickup_operational_hours === 'string' ? settings.metadata.self_pickup_config.pickup_operational_hours : '',
        pickup_instructions: typeof settings.metadata.self_pickup_config.pickup_instructions === 'string' ? settings.metadata.self_pickup_config.pickup_instructions : '',
      };
    }
  }

  // Construct clean projected object from scratch for non-OWNER roles (MERCHANT, OPERATOR, CS)
  return {
    id: settings.id,
    slug: settings.slug,
    name: settings.name,
    store_name: settings.store_name || (typeof settings.metadata?.store_name === 'string' ? settings.metadata.store_name : settings.name),
    display_name: typeof settings.display_name === 'string'
      ? settings.display_name
      : (typeof settings.metadata?.display_name === 'string' ? settings.metadata.display_name : null),
    description: typeof settings.description === 'string'
      ? settings.description
      : (typeof settings.metadata?.description === 'string' ? settings.metadata.description : null),
    tagline: typeof settings.tagline === 'string'
      ? settings.tagline
      : (typeof settings.metadata?.tagline === 'string' ? settings.metadata.tagline : null),
    category: settings.category || 'retail',
    tier: settings.tier,
    plan_tier: settings.plan_tier,
    status: settings.status,
    subscription_status: settings.subscription_status,
    is_suspended: settings.is_suspended,
    trial_ends_at: settings.trial_ends_at,
    subscription_ends_at: settings.subscription_ends_at,
    logo_url: settings.logo_url,
    avatar_url: settings.avatar_url,
    bio: settings.bio,
    currency: settings.currency || 'IDR',
    created_at: settings.created_at,
    updated_at: settings.updated_at,
    phone: null,
    whatsapp_number: null,
    waba_phone_number_id: null,
    telegram_chat_id: null,
    bank: null,
    bank_accounts: null,
    payment_config: null,
    capi_token: null,
    waba_access_token: null,
    waba_config: null,
    integration: null,
    gateway_config: null,
    qris_image_url: null,
    is_qris_active: false,
    greeting_message: settings.greeting_message || null,
    custom_greeting_message: settings.custom_greeting_message || null,
    features: projectFeaturesDto(settings.features || settings.metadata?.features),
    faqs: projectFaqsDto(settings.faqs || settings.metadata?.faqs),
    theme: projectThemeDto(settings.theme || settings.metadata?.theme),
    metadata: sanitizedMetadata,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    // ── AUTH GUARD (P0 SECURITY MANDATE - SCOPED MACHINE & DB-BACKED SESSION) ──
    const machineAuth = checkInternalMachineScope(_req, slug, 'READ_TENANT_SETTINGS');
    let callerRole: string = 'OWNER';
    if (machineAuth.isMachineAttempt) {
      if (!machineAuth.isAuthorized) {
        return machineAuth.response!;
      }
      callerRole = 'OWNER';
    } else {
      const authResult = await authorizeMerchantSession(_req, slug, ['OWNER', 'MERCHANT', 'CS', 'OPERATOR']);
      if (!authResult.authorized) {
        return authResult.response;
      }
      callerRole = authResult.payload?.role || 'MERCHANT';
    }

    // 1. Query murni ke Supabase Database sebagai Single Source of Truth (SSOT)
    let supabase = getWorkforceSupabaseAdmin();

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    let tenantRow: any = null;
    let dbError: any = null;

    if (isUuid) {
      const res = await supabase.from('tenants').select('*').eq('id', slug).maybeSingle();
      tenantRow = res.data;
      dbError = res.error;
    }
    if (!tenantRow && !dbError) {
      const res = await supabase.from('tenants').select('*').eq('slug', slug).maybeSingle();
      tenantRow = res.data;
      dbError = res.error;
    }

    if (dbError) {
      return NextResponse.json({ success: false, error: dbError.message }, { status: 500 });
    }

    if (!tenantRow) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // 2b. Dynamic Gateway Config from whatsapp_connections
    let gatewayConfig: any = {
      instance_name: tenantRow.slug,
      provider: 'EVOLUTION',
      status: 'open',
      is_connected: true,
      phone_number: tenantRow.metadata?.phone || null,
      mode: 'DEDICATED',
    };
    try {
      const orGw = [`tenant_slug.eq.${tenantRow.slug}`];
      if (tenantRow.id) orGw.push(`tenant_id.eq.${tenantRow.id}`);
      const { data: gwData } = await supabase
        .from('whatsapp_connections')
        .select('*')
        .or(orGw.join(','))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (gwData) {
        gatewayConfig = {
          instance_name: gwData.instance_name || tenantRow.slug,
          provider: gwData.provider || 'EVOLUTION',
          status: gwData.status || 'open',
          is_connected: gwData.is_connected !== undefined ? gwData.is_connected : true,
          phone_number: gwData.phone_number || tenantRow.metadata?.phone || null,
          channel_type: gwData.channel_type || 'BAILEYS',
          mode: gwData.metadata?.mode || 'DEDICATED',
          metadata: gwData.metadata || {},
        };
      }
    } catch {}

    // 3. Resolusi murni dari kolom DB & metadata JSONB
    const metadata = tenantRow.metadata || {};
    const planTier: TierEnum = resolvePlanTier(tenantRow.tier || metadata.plan_tier);

    // Ambil juga tracking & waba dari tenant_settings dan whatsapp_connections jika ada
    let adsTrackingConfig = metadata.ads_tracking_config || metadata.tracking || null;
    let wabaConfig = metadata.waba_config || null;

    try {
      const { data: tsRow } = await supabase
        .from('tenant_settings')
        .select('ads_tracking_config, meta_pixel_id, meta_capi_token, tiktok_pixel_id, tiktok_access_token, google_tag_id')
        .eq('tenant_slug', slug)
        .maybeSingle();

      if (tsRow?.ads_tracking_config) {
        adsTrackingConfig = { ...(adsTrackingConfig || {}), ...tsRow.ads_tracking_config };
      }
      if (tsRow?.meta_pixel_id && !adsTrackingConfig?.meta_pixel_id) {
        adsTrackingConfig = { ...(adsTrackingConfig || {}), meta_pixel_id: tsRow.meta_pixel_id };
      }
      if (tsRow?.meta_capi_token && !adsTrackingConfig?.meta_capi_token) {
        adsTrackingConfig = { ...(adsTrackingConfig || {}), meta_capi_token: tsRow.meta_capi_token };
      }
      if (tsRow?.tiktok_pixel_id && !adsTrackingConfig?.tiktok_pixel_id) {
        adsTrackingConfig = { ...(adsTrackingConfig || {}), tiktok_pixel_id: tsRow.tiktok_pixel_id };
      }
      if (tsRow?.tiktok_access_token && !adsTrackingConfig?.tiktok_access_token) {
        adsTrackingConfig = { ...(adsTrackingConfig || {}), tiktok_access_token: tsRow.tiktok_access_token };
      }
      if (tsRow?.google_tag_id && !adsTrackingConfig?.gtm_id) {
        adsTrackingConfig = { ...(adsTrackingConfig || {}), gtm_id: tsRow.google_tag_id };
      }
    } catch (tsErr) {
      console.warn('[Settings Route] Read tenant_settings note:', tsErr);
    }

    try {
      const orWaba = [`tenant_slug.eq.${tenantRow.slug}`, `tenant_id.eq.${tenantRow.slug}`];
      if (tenantRow.id) orWaba.push(`tenant_id.eq.${tenantRow.id}`);
      const { data: wabaConn } = await supabase
        .from('whatsapp_connections')
        .select('*')
        .or(orWaba.join(','))
        .eq('provider', 'meta')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (wabaConn) {
        wabaConfig = {
          phone_number_id: wabaConn.phone_number_id || wabaConfig?.phone_number_id,
          waba_id: wabaConn.waba_id || wabaConfig?.waba_id,
          access_token: wabaConn.api_key || wabaConfig?.access_token || wabaConfig?.permanent_access_token,
          permanent_access_token: wabaConn.api_key || wabaConfig?.permanent_access_token,
          display_phone_number: wabaConn.phone_number || wabaConfig?.display_phone_number,
          status: (wabaConn.is_connected || wabaConn.status === 'active') ? 'CONNECTED' : (wabaConn.status?.toUpperCase() || wabaConfig?.status || 'CONNECTED'),
          verified_name: wabaConn.metadata?.verified_name || wabaConfig?.verified_name,
          quality_rating: wabaConn.metadata?.quality_rating || wabaConfig?.quality_rating || 'GREEN',
          updated_at: wabaConn.updated_at,
          ...(wabaConfig || {}),
        };
      }
    } catch (wabaErr) {
      console.warn('[Settings Route] Read whatsapp_connections note:', wabaErr);
    }

    // Feature flag murni dari kolom database metadata.features
    const rawFeatures = (metadata.features && typeof metadata.features === 'object') ? metadata.features : {};
    const isHighTier = planTier === 'ADS_PERFORMANCE' || planTier === 'TEAM_SCALE';

    const features = {
      has_capi: Boolean(rawFeatures.has_capi ?? isHighTier),
      has_reader: Boolean(rawFeatures.has_reader ?? isHighTier),
      ads_tracking: Boolean(rawFeatures.ads_tracking ?? isHighTier),
      multi_cs: Boolean(rawFeatures.multi_cs ?? (planTier === 'TEAM_SCALE')),
      ...rawFeatures,
    };

    const perm = await checkTenantMutationPermission(slug);
    const isSuspended = !perm.allowed;
    const resolvedSubStatus = isSuspended
      ? 'expired'
      : String(tenantRow.subscription_status || metadata.subscription_status || tenantRow.status || 'active').toLowerCase();

    const isCsRole = callerRole === 'CS' || callerRole === 'OPERATOR';
    const effectiveCapiToken = isCsRole ? null : (metadata.capi_token || adsTrackingConfig?.meta_capi_token || null);
    const sanitizedWabaConfig = isCsRole && wabaConfig
      ? { ...wabaConfig, access_token: null, permanent_access_token: null }
      : wabaConfig;

    // 4. Return data asli database dengan sanitasi berbasis peran (Round 3O)
    return NextResponse.json({
      success: true,
      settings: sanitizeSettingsForRole({
        slug: tenantRow.slug,
        name: tenantRow.name,
        store_name: metadata.store_name || tenantRow.name,
        category: tenantRow.category || 'retail',
        tier: tenantRow.tier,
        plan_tier: planTier,
        is_suspended: isSuspended,
        subscription_status: resolvedSubStatus,
        suspension_reason: perm.reason || null,
        trial_ends_at: tenantRow.trial_ends_at || metadata.trial_ends_at || null,
        subscription_ends_at: tenantRow.subscription_ends_at || metadata.subscription_ends_at || null,
        visual_theme: metadata.visual_theme || metadata.theme?.visual_theme || metadata.theme?.theme_id || 'clean_minimal',
        features,
        bot_strategy: metadata.bot_strategy || 'trust_builder',
        bot_mode: metadata.bot_mode || 'HYBRID',
        is_bot_active: metadata.is_bot_active !== false,
        bot_paused: Boolean(metadata.bot_paused === true),
        product: metadata.product || null,
        products: Array.isArray(metadata.products) ? metadata.products : (metadata.product ? [metadata.product] : []),
        ai_knowledge: metadata.ai_knowledge || {
          ai_name: `${tenantRow.name} Assistant`,
          system_prompt: `Anda adalah asisten resmi untuk ${tenantRow.name}.`,
        },
        boonpilot_proposal: metadata.boonpilot_proposal || metadata.boonpilot_configuration || null,
        boonpilot_configuration: metadata.boonpilot_configuration || metadata.boonpilot_proposal || null,
        sales_policy: metadata.sales_policy || metadata.playbook || metadata.seller_playbook || null,
        playbook: metadata.playbook || metadata.seller_playbook || metadata.sales_policy || null,
        bank: isCsRole ? null : (metadata.bank || null),
        bank_settings: isCsRole ? null : (metadata.bank_settings || metadata.bank_transfer || null),
        bank_transfer: isCsRole ? null : (metadata.bank_transfer || metadata.bank_settings || null),
        bank_accounts: isCsRole ? [] : (Array.isArray(metadata.bank_accounts) ? metadata.bank_accounts : []),
        is_bank_transfer_active: metadata.is_bank_transfer_active ?? metadata.enable_manual_transfer ?? metadata.payment_config?.enable_manual_transfer ?? metadata.bank_settings?.is_active ?? metadata.bank_transfer?.is_active ?? true,
        integration: metadata.integration || {
          whatsapp_status: 'DISCONNECTED',
          webhook_verified: false,
        },
        qris_image_url: metadata.qris_image_url || metadata.qris_url || metadata.qris_image || metadata.payment_settings?.qris || metadata.payment_config?.qris_image_url || tenantRow.qris_image_url || null,
        is_qris_active: metadata.is_qris_active ?? metadata.qris_enabled ?? Boolean(metadata.qris_image_url || metadata.qris_url || metadata.qris_image || metadata.raw_qris_string),
        qris_enabled: metadata.qris_enabled ?? metadata.is_qris_active ?? Boolean(metadata.qris_image_url || metadata.qris_url || metadata.qris_image || metadata.raw_qris_string),
        logo_url: metadata.logo_url || metadata.store_logo_url || metadata.avatar_url || tenantRow.logo_url || tenantRow.avatar_url || null,
        store_logo_url: metadata.store_logo_url || metadata.logo_url || metadata.avatar_url || null,
        avatar_url: metadata.avatar_url || metadata.logo_url || null,
        bio: metadata.bio || null,
        display_name: metadata.display_name || null,
        description: metadata.description || null,
        tagline: metadata.tagline || null,
        phone: tenantRow.phone || tenantRow.whatsapp_number || metadata.phone || metadata.whatsapp_number || metadata.whatsapp || null,
        whatsapp_number: tenantRow.whatsapp_number || tenantRow.phone || metadata.whatsapp_number || metadata.whatsapp || metadata.whatsapp_cs || null,
        faqs: Array.isArray(metadata.faqs)
          ? metadata.faqs
          : (Array.isArray(metadata.boonpilot_proposal?.knowledge)
              ? metadata.boonpilot_proposal.knowledge
                  .filter((k: any) => k.category === 'FAQ')
                  .map((k: any) => ({
                    id: k.id || `faq_${Math.random().toString(36).substring(2, 7)}`,
                    question: k.title,
                    answer: k.content,
                  }))
              : []),
        interactive_menu: metadata.interactive_menu || null,
        interactive_menus: Array.isArray(metadata.interactive_menu?.items)
          ? metadata.interactive_menu.items
          : (Array.isArray(metadata.interactive_menus) ? metadata.interactive_menus : []),
        greeting_message: metadata.greeting_message || metadata.custom_greeting_message || null,
        custom_greeting_message: metadata.greeting_message || metadata.custom_greeting_message || null,
        metadata: {
          ...metadata,
          tracking: adsTrackingConfig || metadata.tracking,
          ads_tracking_config: adsTrackingConfig || metadata.ads_tracking_config,
          waba_config: sanitizedWabaConfig || metadata.waba_config,
          pixel_id: metadata.pixel_id || adsTrackingConfig?.meta_pixel_id || adsTrackingConfig?.facebook_pixel_id || null,
          capi_token: effectiveCapiToken,
        },
        ads_tracking_config: adsTrackingConfig,
        tracking: adsTrackingConfig,
        pixel_id: metadata.pixel_id || adsTrackingConfig?.meta_pixel_id || adsTrackingConfig?.facebook_pixel_id || null,
        capi_token: effectiveCapiToken,
        waba_config: sanitizedWabaConfig,
        waba_phone_number_id: tenantRow.waba_phone_number_id || metadata.waba_phone_number_id || wabaConfig?.phone_number_id || null,
        theme: metadata.theme || { template: 'default', chat_enabled: true, chat_position: 'bottom-right' },
        microsite: metadata.microsite || { buttons: [] },
        rotator: metadata.rotator || null,
        total_omzet: metadata.total_omzet || null,
        telegram_chat_id: tenantRow.telegram_chat_id || metadata.telegram_chat_id || null,
        telegram_group_config: metadata.telegram_group_config || null,
        followup_rules: metadata.followup_rules || null,
        gateway_config: gatewayConfig,
        whatsapp_connection: gatewayConfig,
        whatsapp_instance: gatewayConfig.instance_name,
      }, callerRole),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching settings';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ── MUTATION VALIDATION GUARDS (Round 3R) ──

function hasForbiddenMerchantNestedKeys(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;

  const FORBIDDEN_KEY_PATTERN = /(?:secret|token|credential|waba|capi|password|api_key|private_)/i;

  for (const [key, value] of Object.entries(obj)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) {
      return true;
    }
    if (value && typeof value === 'object') {
      if (hasForbiddenMerchantNestedKeys(value)) {
        return true;
      }
    }
  }
  return false;
}

function validateMerchantNestedPayload(body: any): boolean {
  if (hasForbiddenMerchantNestedKeys(body)) {
    return false;
  }

  // 1. Validate theme if present
  const themeObj = body.theme !== undefined ? body.theme : body.metadata?.theme;
  if (themeObj !== undefined) {
    if (!themeObj || typeof themeObj !== 'object' || Array.isArray(themeObj)) {
      return false;
    }
    for (const [key, value] of Object.entries(themeObj)) {
      if (!ALLOWED_THEME_KEYS.has(key)) {
        return false;
      }
      if (key === 'featured_product_ids') {
        if (!Array.isArray(value)) return false;
        for (const item of value) {
          if (typeof item !== 'string' && typeof item !== 'number') return false;
        }
      } else if (value !== null && typeof value === 'object') {
        return false;
      }
    }
  }

  // 2. Validate faqs if present
  const faqsArr = body.faqs !== undefined ? body.faqs : body.metadata?.faqs;
  if (faqsArr !== undefined) {
    if (!Array.isArray(faqsArr)) return false;
    const ALLOWED_FAQ_KEYS = new Set(['id', 'question', 'answer', 'title', 'content', 'category']);
    for (const item of faqsArr) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      for (const [k, v] of Object.entries(item)) {
        if (!ALLOWED_FAQ_KEYS.has(k)) {
          return false;
        }
        if (v !== null && typeof v === 'object') return false;
      }
    }
  }

  // 3. Validate catalog_preferences if present
  const catPref = body.catalog_preferences !== undefined ? body.catalog_preferences : body.metadata?.catalog_preferences;
  if (catPref !== undefined) {
    if (!catPref || typeof catPref !== 'object' || Array.isArray(catPref)) return false;
    for (const [key, value] of Object.entries(catPref)) {
      if (!ALLOWED_CATALOG_KEYS.has(key)) {
        return false;
      }
      if (key === 'featured_category_ids') {
        if (!Array.isArray(value)) return false;
        for (const item of value) {
          if (typeof item !== 'string' && typeof item !== 'number') return false;
        }
      } else if (value !== null && typeof value === 'object') {
        return false;
      }
    }
  }

  // 4. Validate business_hours if present
  const bizHours = body.business_hours !== undefined ? body.business_hours : body.metadata?.business_hours;
  if (bizHours !== undefined) {
    if (!bizHours || typeof bizHours !== 'object' || Array.isArray(bizHours)) return false;
    const ALLOWED_BIZ_KEYS = new Set(['timezone', 'is_always_open', 'notes', 'days', 'schedule', ...ALLOWED_DAY_KEYS]);
    const ALLOWED_DAY_FIELDS = new Set(['open', 'close', 'is_open', 'closed']);

    for (const [key, val] of Object.entries(bizHours)) {
      if (!ALLOWED_BIZ_KEYS.has(key)) {
        return false;
      }
      // Check root day entries (e.g. bizHours.monday)
      if (ALLOWED_DAY_KEYS.has(key.toLowerCase())) {
        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
          for (const [dfKey, dfVal] of Object.entries(val)) {
            if (!ALLOWED_DAY_FIELDS.has(dfKey)) return false;
            if (dfVal !== null && typeof dfVal === 'object') return false;
          }
        } else if (val !== null && typeof val === 'object') {
          return false;
        }
      }
    }

    if (bizHours.days !== undefined) {
      if (!bizHours.days || typeof bizHours.days !== 'object' || Array.isArray(bizHours.days)) return false;
      for (const [dayKey, dayVal] of Object.entries(bizHours.days)) {
        if (!ALLOWED_DAY_KEYS.has(dayKey.toLowerCase())) return false;
        if (!dayVal || typeof dayVal !== 'object' || Array.isArray(dayVal)) return false;
        for (const [dfKey, dfVal] of Object.entries(dayVal)) {
          if (!ALLOWED_DAY_FIELDS.has(dfKey)) return false;
          if (dfVal !== null && typeof dfVal === 'object') return false;
        }
      }
    }

    if (bizHours.schedule !== undefined) {
      if (!Array.isArray(bizHours.schedule)) return false;
      const ALLOWED_SCHEDULE_FIELDS = new Set(['day', 'open', 'close', 'is_open', 'closed']);
      for (const item of bizHours.schedule) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        for (const [skKey, skVal] of Object.entries(item)) {
          if (!ALLOWED_SCHEDULE_FIELDS.has(skKey)) return false;
          if (skVal !== null && typeof skVal === 'object') return false;
        }
      }
    }
  }

  // 5. Validate public_links if present
  const pubLinks = body.public_links !== undefined ? body.public_links : body.metadata?.public_links;
  if (pubLinks !== undefined) {
    if (Array.isArray(pubLinks)) {
      const ALLOWED_PUBLIC_LINK_ITEM_KEYS = new Set([
        'title',
        'label',
        'url',
        'href',
        'icon',
        'order',
        'is_active',
        'platform',
      ]);
      for (const item of pubLinks) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        for (const [lkKey, lkVal] of Object.entries(item)) {
          if (!ALLOWED_PUBLIC_LINK_ITEM_KEYS.has(lkKey)) return false;
          if (lkVal !== null && typeof lkVal === 'object') return false;
        }
      }
    } else if (pubLinks && typeof pubLinks === 'object') {
      for (const [key, value] of Object.entries(pubLinks)) {
        if (!ALLOWED_LINK_PLATFORMS.has(key.toLowerCase())) return false;
        if (typeof value !== 'string') return false;
      }
    } else {
      return false;
    }
  }

  // 6. Validate features if present
  const featuresObj = body.features !== undefined ? body.features : body.metadata?.features;
  if (featuresObj !== undefined) {
    if (!featuresObj || typeof featuresObj !== 'object' || Array.isArray(featuresObj)) return false;
    for (const [key, value] of Object.entries(featuresObj)) {
      if (!ALLOWED_FEATURE_KEYS.has(key)) return false;
      if (typeof value !== 'boolean' && typeof value !== 'string' && typeof value !== 'number') {
        return false;
      }
    }
  }

  // 7. Validate microsite if present
  const micrositeObj = body.microsite !== undefined ? body.microsite : body.metadata?.microsite;
  if (micrositeObj !== undefined) {
    if (!micrositeObj || typeof micrositeObj !== 'object' || Array.isArray(micrositeObj)) return false;
    const ALLOWED_MICROSITE_KEYS = new Set(['buttons', 'title', 'bio', 'template', 'theme']);
    for (const [key, val] of Object.entries(micrositeObj)) {
      if (!ALLOWED_MICROSITE_KEYS.has(key)) return false;
      if (key === 'buttons') {
        if (!Array.isArray(val)) return false;
        const ALLOWED_BUTTON_KEYS = new Set(['id', 'label', 'title', 'url', 'href', 'icon', 'is_active', 'order', 'color', 'style']);
        for (const btn of val) {
          if (!btn || typeof btn !== 'object' || Array.isArray(btn)) return false;
          for (const [bk, bv] of Object.entries(btn)) {
            if (!ALLOWED_BUTTON_KEYS.has(bk)) return false;
            if (bv !== null && typeof bv === 'object') return false;
          }
        }
      } else if (val !== null && typeof val === 'object') {
        return false;
      }
    }
  }

  return true;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    // ── AUTH GUARD & RBAC (P0 SECURITY MANDATE - SCOPED MACHINE & DB-BACKED SESSION) ──
    const machineAuth = checkInternalMachineScope(req, slug, 'UPDATE_TENANT_SETTINGS');
    let callerRole: string = 'OWNER';
    if (machineAuth.isMachineAttempt) {
      if (!machineAuth.isAuthorized) {
        return machineAuth.response!;
      }
      callerRole = 'OWNER';
    } else {
      const authResult = await authorizeMerchantSession(req, slug, ['OWNER', 'MERCHANT']);
      if (!authResult.authorized) {
        return authResult.response;
      }
      callerRole = authResult.payload?.role || 'MERCHANT';
    }

    const perm = await checkTenantMutationPermission(slug);
    if (!perm.allowed && perm.response) {
      return perm.response;
    }
    const body = await req.json();

    // ── STRICT OWNER-ONLY MUTATION GUARD (Round 3P & 3S Strict Allowlist) ──
    if (callerRole !== 'OWNER') {
      const PERMITTED_MERCHANT_FIELDS = new Set([
        'name',
        'bio',
        'display_name',
        'logo_url',
        'avatar_url',
        'business_hours',
        'catalog_preferences',
        'description',
        'store_name',
        'tagline',
        'faqs',
        'theme',
        'template',
        'microsite',
        'category',
        'greeting_message',
        'custom_greeting_message',
        'interactive_menus',
        'interactive_menu',
        'public_links',
        'self_pickup_config',
        'shipping_config',
      ]);

      const topLevelKeys = Object.keys(body).filter((k) => k !== 'metadata');
      const hasUnpermittedTopLevel = topLevelKeys.some((k) => !PERMITTED_MERCHANT_FIELDS.has(k));

      let hasUnpermittedMetadata = false;
      if (body.metadata && typeof body.metadata === 'object') {
        const metadataKeys = Object.keys(body.metadata);
        hasUnpermittedMetadata = metadataKeys.some((k) => !PERMITTED_MERCHANT_FIELDS.has(k));
      }

      // Deep nested validation for non-OWNER callers (Round 3R)
      const hasNestedForbidden = hasForbiddenMerchantNestedKeys(body);
      const isNestedValid = validateMerchantNestedPayload(body);

      if (hasUnpermittedTopLevel || hasUnpermittedMetadata || hasNestedForbidden || !isNestedValid) {
        return NextResponse.json(
          {
            success: false,
            error: 'Forbidden: Only tenant OWNER can mutate financial, identity, or integration configurations.',
          },
          { status: 403 }
        );
      }
    }

    const {
      name,
      category,
      product,
      products,
      ai_knowledge,
      bank,
      bank_settings,
      bank_transfer,
      bank_accounts,
      is_bank_transfer_active,
      enable_manual_transfer,
      enable_bank_transfer,
      integration,
      bot_strategy,
      bot_mode,
      plan_tier,
      features,
      qris_image_url,
      logo_url,
      bio,
      whatsapp,
      whatsapp_number,
      faqs,
      interactive_menus,
      theme,
      template,
      microsite,
      is_bot_active,
      bot_paused,
      rotator,
      qris_payload,
      qris_static_string,
      greeting_message,
      custom_greeting_message,
      sales_policy,
      playbook,
      self_pickup_config,
      shipping_config,
      lincah_config,
      shipping_settings,
      telegram_chat_id,
      telegram_group_config,
      followup_rules,
      follow_up_rules,
      ads_tracking_config,
      tracking,
      pixel_id,
      capi_token,
      meta_pixel_id,
      meta_capi_token,
      waba_config,
      waba_phone_number_id,
      waba_account_id,
      waba_access_token,
    } = body;

    const supabaseAdmin = getWorkforceSupabaseAdmin();
    const { data: existing } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // ── ADS TRACKING & CAPI MERGE (Server-Side SSOT) ──
    const incomingTracking = ads_tracking_config || tracking || body.metadata?.tracking || body.metadata?.ads_tracking_config;
    const resolvedPixelId =
      pixel_id ||
      meta_pixel_id ||
      incomingTracking?.meta_pixel_id ||
      incomingTracking?.facebook_pixel_id ||
      incomingTracking?.pixel_id ||
      body.metadata?.pixel_id ||
      undefined;

    const resolvedCapiToken =
      capi_token ||
      meta_capi_token ||
      incomingTracking?.meta_capi_token ||
      incomingTracking?.capi_token ||
      body.metadata?.capi_token ||
      undefined;

    let mergedTracking: Record<string, any> | undefined = undefined;
    if (incomingTracking !== undefined || resolvedPixelId !== undefined || resolvedCapiToken !== undefined) {
      mergedTracking = {
        ...(existing.metadata?.tracking || {}),
        ...(existing.metadata?.ads_tracking_config || {}),
        ...(incomingTracking || {}),
        ...(resolvedPixelId ? { meta_pixel_id: resolvedPixelId, facebook_pixel_id: resolvedPixelId, pixel_id: resolvedPixelId } : {}),
        ...(resolvedCapiToken ? { meta_capi_token: resolvedCapiToken, capi_token: resolvedCapiToken } : {}),
      };
    }

    // ── WABA CONFIG MERGE (Server-Side SSOT) ──
    const incomingWaba = waba_config || body.metadata?.waba_config;
    const resolvedWabaPhoneId =
      waba_phone_number_id ||
      incomingWaba?.phone_number_id ||
      body.metadata?.waba_phone_number_id ||
      undefined;
    const resolvedWabaAccountId =
      waba_account_id ||
      incomingWaba?.waba_id ||
      body.metadata?.waba_account_id ||
      undefined;
    const resolvedWabaToken =
      waba_access_token ||
      incomingWaba?.permanent_access_token ||
      incomingWaba?.access_token ||
      body.metadata?.waba_access_token ||
      undefined;

    let mergedWaba: Record<string, any> | undefined = undefined;
    if (incomingWaba !== undefined || resolvedWabaPhoneId !== undefined || resolvedWabaAccountId !== undefined || resolvedWabaToken !== undefined) {
      mergedWaba = {
        ...(existing.metadata?.waba_config || {}),
        ...(incomingWaba || {}),
        ...(resolvedWabaPhoneId ? { phone_number_id: resolvedWabaPhoneId } : {}),
        ...(resolvedWabaAccountId ? { waba_id: resolvedWabaAccountId } : {}),
        ...(resolvedWabaToken ? { permanent_access_token: resolvedWabaToken, access_token: resolvedWabaToken } : {}),
      };
    }

    const rawIncomingPhone =
      body.whatsapp_number ??
      body.whatsapp ??
      body.phone ??
      body.whatsapp_cs ??
      body.metadata?.whatsapp_number ??
      body.metadata?.phone ??
      body.metadata?.whatsapp_cs ??
      body.cs_phone ??
      undefined;

    const sanitizedPhone = rawIncomingPhone !== undefined ? sanitizePhoneNumber(rawIncomingPhone) : undefined;

    const updatedTier = plan_tier || existing.tier;
    const updatedFeatures = features || existing.metadata?.features || {};

    let updatedProposal = existing.metadata?.boonpilot_proposal || existing.metadata?.boonpilot_configuration || null;
    if (faqs !== undefined && updatedProposal) {
      const faqKnowledgeItems = (Array.isArray(faqs) ? faqs : []).map((f: any, idx: number) => ({
        id: f.id || `faq_${Date.now()}_${idx}`,
        category: 'FAQ',
        title: f.question || '',
        content: f.answer || '',
        priority: 8,
      }));
      const nonFaqItems = (updatedProposal.knowledge || []).filter((k: any) => k.category !== 'FAQ');
      updatedProposal = {
        ...updatedProposal,
        knowledge: [...nonFaqItems, ...faqKnowledgeItems],
        updated_at: new Date().toISOString(),
      };
    }

    const effectiveLogo = logo_url || body.store_logo_url || body.avatar_url;
    const effectiveStoreName = body.store_name || name;

    const updatedMetadata = {
      ...(existing.metadata || {}),
      ...(effectiveStoreName !== undefined ? { store_name: effectiveStoreName } : {}),
      ...(bot_strategy ? { bot_strategy } : {}),
      ...(bot_mode ? { bot_mode } : {}),
      is_bot_active: is_bot_active !== undefined ? Boolean(is_bot_active) : (existing.metadata?.is_bot_active !== false),
      bot_paused: bot_paused !== undefined ? Boolean(bot_paused) : Boolean(existing.metadata?.bot_paused === true),
      ...(plan_tier ? { plan_tier } : {}),
      features: updatedFeatures,
      ...(product ? { product } : {}),
      ...(products !== undefined ? { products } : {}),
      ...(ai_knowledge ? { ai_knowledge } : {}),
      ...(bank ? { bank } : {}),
      ...(bank_settings !== undefined ? { bank_settings } : {}),
      ...(bank_transfer !== undefined ? { bank_transfer } : {}),
      ...(bank_accounts !== undefined ? { bank_accounts } : {}),
      ...(body.accounts !== undefined ? { accounts: body.accounts } : {}),
      ...(body.manual_bank_accounts !== undefined ? { manual_bank_accounts: body.manual_bank_accounts } : {}),
      ...(body.bank_name ? { bank_name: body.bank_name } : {}),
      ...(body.bank_account ? { bank_account: body.bank_account } : {}),
      ...(body.bank_holder ? { bank_holder: body.bank_holder } : {}),
      ...(is_bank_transfer_active !== undefined ? { is_bank_transfer_active: Boolean(is_bank_transfer_active) } : {}),
      ...(enable_manual_transfer !== undefined || is_bank_transfer_active !== undefined || bank_accounts !== undefined || body.accounts !== undefined ? {
        payment_config: {
          ...(existing.metadata?.payment_config || {}),
          ...(body.payment_config || {}),
          ...(bank_accounts !== undefined ? { bank_accounts } : {}),
          ...(body.accounts !== undefined ? { accounts: body.accounts } : {}),
          enable_manual_transfer: is_bank_transfer_active !== undefined ? Boolean(is_bank_transfer_active) : (enable_manual_transfer !== undefined ? Boolean(enable_manual_transfer) : Boolean(existing.metadata?.payment_config?.enable_manual_transfer)),
          enable_bank_transfer: is_bank_transfer_active !== undefined ? Boolean(is_bank_transfer_active) : (enable_bank_transfer !== undefined ? Boolean(enable_bank_transfer) : Boolean(enable_manual_transfer ?? existing.metadata?.payment_config?.enable_bank_transfer)),
        },
        payment_settings: {
          ...(existing.metadata?.payment_settings || {}),
          ...(body.payment_settings || {}),
          ...(bank_accounts !== undefined ? { bank_accounts } : {}),
          ...(body.accounts !== undefined ? { accounts: body.accounts } : {}),
          enable_manual_transfer: is_bank_transfer_active !== undefined ? Boolean(is_bank_transfer_active) : (enable_manual_transfer !== undefined ? Boolean(enable_manual_transfer) : Boolean(existing.metadata?.payment_settings?.enable_manual_transfer)),
          enable_bank_transfer: is_bank_transfer_active !== undefined ? Boolean(is_bank_transfer_active) : (enable_bank_transfer !== undefined ? Boolean(enable_bank_transfer) : Boolean(enable_manual_transfer ?? existing.metadata?.payment_settings?.enable_bank_transfer)),
        },
      } : {}),
      ...(integration ? { integration } : {}),
      ...(faqs !== undefined ? { faqs } : {}),
      ...(interactive_menus !== undefined ? { interactive_menus } : {}),
      ...(template !== undefined ? { template, storefront_template: template, selected_template: template } : {}),
      ...(theme !== undefined
        ? {
            theme: { ...(existing.metadata?.theme || {}), ...theme, ...(template ? { template } : {}) },
            visual_theme: theme.visual_theme || theme.theme_id || existing.metadata?.visual_theme || 'clean_minimal',
            theme_id: theme.theme_id || theme.visual_theme || existing.metadata?.theme_id || 'clean_minimal',
            ...(theme.template ? { template: theme.template, storefront_template: theme.template, selected_template: theme.template } : {}),
          }
        : (template ? { theme: { ...(existing.metadata?.theme || {}), template } } : {})),
      ...(updatedProposal ? { boonpilot_proposal: updatedProposal, boonpilot_configuration: updatedProposal } : {}),
      ...(qris_image_url !== undefined ? {
        qris_image_url,
        qris_url: qris_image_url,
        qris_image: qris_image_url,
        is_qris_active: Boolean(qris_image_url),
        qris_enabled: Boolean(qris_image_url),
        payment_settings: {
          ...(existing.metadata?.payment_settings || {}),
          qris: qris_image_url,
          is_qris_active: Boolean(qris_image_url),
        },
        payment_config: {
          ...(existing.metadata?.payment_config || {}),
          enable_qris: Boolean(qris_image_url),
          qris_image_url,
        },
      } : {}),
      ...(qris_payload !== undefined || qris_static_string !== undefined ? {
        qris_payload: qris_payload || qris_static_string,
        qris_static_string: qris_static_string || qris_payload,
        payment_config: {
          ...(existing.metadata?.payment_config || {}),
          enable_qris: true,
          qris_payload: qris_payload || qris_static_string,
          raw_qris_string: qris_payload || qris_static_string,
          static_qris_payload: qris_payload || qris_static_string,
        },
      } : {}),
      ...(effectiveLogo !== undefined ? { logo_url: effectiveLogo, store_logo_url: effectiveLogo, avatar_url: effectiveLogo } : {}),
      ...(bio !== undefined ? { bio } : {}),
      ...(sanitizedPhone !== undefined ? {
        phone: sanitizedPhone,
        whatsapp_number: sanitizedPhone,
        whatsapp: sanitizedPhone,
        wa_number: sanitizedPhone,
      } : {}),
      ...(greeting_message !== undefined || custom_greeting_message !== undefined ? {
        greeting_message: greeting_message !== undefined ? greeting_message : custom_greeting_message,
        custom_greeting_message: custom_greeting_message !== undefined ? custom_greeting_message : greeting_message,
      } : {}),
      ...(sales_policy !== undefined ? { sales_policy, playbook: sales_policy } : (playbook !== undefined ? { sales_policy: playbook, playbook } : {})),
      ...(microsite !== undefined ? { microsite } : {}),
      ...(body.business_hours !== undefined || body.metadata?.business_hours !== undefined ? {
        business_hours: body.business_hours !== undefined ? body.business_hours : body.metadata?.business_hours,
      } : {}),
      ...(body.catalog_preferences !== undefined || body.metadata?.catalog_preferences !== undefined ? {
        catalog_preferences: body.catalog_preferences !== undefined ? body.catalog_preferences : body.metadata?.catalog_preferences,
      } : {}),
      ...(body.public_links !== undefined || body.metadata?.public_links !== undefined ? {
        public_links: body.public_links !== undefined ? body.public_links : body.metadata?.public_links,
      } : {}),
      ...(body.display_name !== undefined || body.metadata?.display_name !== undefined ? {
        display_name: body.display_name !== undefined ? body.display_name : body.metadata?.display_name,
      } : {}),
      ...(body.description !== undefined || body.metadata?.description !== undefined ? {
        description: body.description !== undefined ? body.description : body.metadata?.description,
      } : {}),
      ...(body.tagline !== undefined || body.metadata?.tagline !== undefined ? {
        tagline: body.tagline !== undefined ? body.tagline : body.metadata?.tagline,
      } : {}),
      ...(rotator !== undefined ? { rotator } : {}),
      ...(self_pickup_config !== undefined || body.self_pickup_config !== undefined || body.metadata?.self_pickup_config !== undefined ? {
        self_pickup_config: self_pickup_config ?? body.self_pickup_config ?? body.metadata?.self_pickup_config,
      } : {}),
      ...(shipping_config !== undefined ? { shipping_config } : {}),
      ...(lincah_config !== undefined ? { lincah_config } : {}),
      ...(shipping_settings !== undefined ? { shipping_settings } : {}),
      ...(telegram_chat_id !== undefined ? { telegram_chat_id: telegram_chat_id || null } : {}),
      ...(telegram_group_config !== undefined || body.telegram_group_config !== undefined
        ? { telegram_group_config: telegram_group_config ?? body.telegram_group_config }
        : {}),
      ...(followup_rules !== undefined || follow_up_rules !== undefined
        ? { followup_rules: followup_rules !== undefined ? followup_rules : follow_up_rules }
        : {}),
      // Sinkronkan metadata tracking & WABA ke SSOT tenants
      ...(mergedTracking ? {
        tracking: mergedTracking,
        ads_tracking_config: mergedTracking,
        pixel_id: resolvedPixelId || existing.metadata?.pixel_id || null,
        capi_token: resolvedCapiToken || existing.metadata?.capi_token || null,
      } : {}),
      ...(mergedWaba ? {
        waba_config: mergedWaba,
        waba_configured: true,
        waba_active: true,
        waba_phone_number_id: resolvedWabaPhoneId || existing.metadata?.waba_phone_number_id || null,
        whatsapp_phone_number_id: resolvedWabaPhoneId || existing.metadata?.whatsapp_phone_number_id || null,
        waba_account_id: resolvedWabaAccountId || existing.metadata?.waba_account_id || null,
        waba_access_token: resolvedWabaToken || existing.metadata?.waba_access_token || null,
        whatsapp_gateway_type: 'waba',
      } : {}),
    };

    const updateFields: Record<string, any> = {
      name: effectiveStoreName || existing.name,
      category: category || existing.category,
      tier: updatedTier,
      bot_paused: updatedMetadata.bot_paused,
      is_bot_active: updatedMetadata.is_bot_active,
      metadata: updatedMetadata,
      updated_at: new Date().toISOString(),
    };
    if (sanitizedPhone !== undefined) {
      updateFields.phone = sanitizedPhone || null;
      updateFields.whatsapp_number = sanitizedPhone || null;
    }
    if (resolvedWabaPhoneId !== undefined) {
      updateFields.waba_phone_number_id = resolvedWabaPhoneId;
    }
    if (telegram_chat_id !== undefined) {
      updateFields.telegram_chat_id = telegram_chat_id || null;
    }

    // ── UPSERT TENANT_SETTINGS DENGAN ADMIN CLIENT (BYPASS RLS) ──
    if (mergedTracking) {
      try {
        await supabaseAdmin
          .from('tenant_settings')
          .upsert(
            {
              tenant_slug: slug,
              ads_tracking_config: mergedTracking,
              meta_pixel_id: mergedTracking.meta_pixel_id || resolvedPixelId || null,
              meta_capi_token: mergedTracking.meta_capi_token || resolvedCapiToken || null,
              tiktok_pixel_id: mergedTracking.tiktok_pixel_id || null,
              tiktok_access_token: mergedTracking.tiktok_access_token || null,
              google_tag_id: mergedTracking.gtm_id || null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'tenant_slug' }
          );
      } catch (tsErr) {
        console.warn('[Settings Route] Upsert tenant_settings.ads_tracking_config warning:', tsErr);
      }
    }

    // ── PERSIST SHIPPING & SELF-PICKUP SERVER-AUTHORITATIVELY (BYPASS RLS) ──
    const effectivePickup = self_pickup_config ?? body.self_pickup_config ?? body.metadata?.self_pickup_config;
    const effectiveShipping = shipping_config ?? body.shipping_config ?? body.metadata?.shipping_config;

    if (effectivePickup !== undefined || effectiveShipping !== undefined) {
      const isPickupEnabled = Boolean(effectivePickup?.is_enabled ?? effectiveShipping?.is_self_pickup_enabled);
      const pickupAddressVal = effectivePickup?.pickup_address || effectiveShipping?.pickup_address || effectiveShipping?.origin?.address || null;
      const pickupMapsUrlVal = effectivePickup?.pickup_maps_url || effectiveShipping?.pickup_maps_url || null;
      const pickupHoursVal = effectivePickup?.pickup_operational_hours || effectiveShipping?.pickup_operational_hours || null;
      const pickupInstVal = effectivePickup?.pickup_instructions || effectiveShipping?.pickup_instructions || null;
      const originAddrVal = effectiveShipping?.origin?.address || effectiveShipping?.origin_address || null;
      const originCityVal = effectiveShipping?.origin?.city || effectiveShipping?.origin_city || null;
      const originDistVal = effectiveShipping?.origin?.district || effectiveShipping?.origin_district || null;
      const originPostVal = effectiveShipping?.origin?.postal_code || effectiveShipping?.origin_postal_code || null;

      // 1. Sync ke store_shipping_configs table via admin client
      try {
        const shippingDbPayload: Record<string, any> = {
          tenant_slug: slug,
          tenant_id: existing.id,
          is_self_pickup_enabled: isPickupEnabled,
          pickup_address: pickupAddressVal,
          pickup_maps_url: pickupMapsUrlVal,
          pickup_operational_hours: pickupHoursVal,
          pickup_instructions: pickupInstVal,
          origin_address: originAddrVal,
          origin_city: originCityVal,
          origin_district: originDistVal,
          origin_postal_code: originPostVal,
          updated_at: new Date().toISOString(),
        };

        const { error: storeShipErr } = await supabaseAdmin
          .from('store_shipping_configs')
          .upsert(shippingDbPayload, { onConflict: 'tenant_slug' });
        if (storeShipErr && storeShipErr.code !== '42P01' && !storeShipErr.message?.includes('does not exist')) {
          console.warn('[Settings Route] Upsert store_shipping_configs note:', storeShipErr.message);
        }
      } catch (storeShipEx) {
        console.warn('[Settings Route] store_shipping_configs sync note:', storeShipEx);
      }

      // 2. Sync ke tenant_settings.biteship_config via admin client
      try {
        const { data: curTs } = await supabaseAdmin
          .from('tenant_settings')
          .select('biteship_config')
          .eq('tenant_slug', slug)
          .maybeSingle();

        const curBiteship = curTs?.biteship_config || {};
        const updatedBiteship = {
          ...curBiteship,
          is_self_pickup_enabled: isPickupEnabled,
          pickup_address: pickupAddressVal,
          pickup_maps_url: pickupMapsUrlVal,
          pickup_operational_hours: pickupHoursVal,
          pickup_instructions: pickupInstVal,
          self_pickup: {
            is_enabled: isPickupEnabled,
            address: pickupAddressVal,
            maps_url: pickupMapsUrlVal,
            operational_hours: pickupHoursVal,
            instructions: pickupInstVal,
          },
          ...(effectiveShipping?.couriers ? { couriers: effectiveShipping.couriers } : {}),
          ...(effectiveShipping?.origin ? { origin: effectiveShipping.origin } : {}),
          ...(typeof effectiveShipping?.auto_pickup === 'boolean' ? { auto_pickup: effectiveShipping.auto_pickup } : {}),
          ...(typeof effectiveShipping?.free_shipping_threshold === 'number' ? { free_shipping_threshold: effectiveShipping.free_shipping_threshold } : {}),
          ...(typeof effectiveShipping?.is_enabled === 'boolean' ? { is_enabled: effectiveShipping.is_enabled } : {}),
          updated_at: new Date().toISOString(),
        };

        const { error: tsBiteshipErr } = await supabaseAdmin
          .from('tenant_settings')
          .upsert(
            {
              tenant_slug: slug,
              biteship_config: updatedBiteship,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'tenant_slug' }
          );
        if (tsBiteshipErr) {
          console.warn('[Settings Route] Upsert tenant_settings.biteship_config note:', tsBiteshipErr.message);
        }
      } catch (tsBiteshipEx) {
        console.warn('[Settings Route] tenant_settings.biteship_config sync note:', tsBiteshipEx);
      }
    }

    // ── PERSIST WHATSAPP_CONNECTIONS DENGAN ADMIN CLIENT (BYPASS RLS) ──
    if (resolvedWabaPhoneId) {
      try {
        const { data: existingWabaConn } = await supabaseAdmin
          .from('whatsapp_connections')
          .select('id')
          .or(`tenant_slug.eq.${slug},tenant_id.eq.${existing.id}`)
          .eq('provider', 'meta')
          .maybeSingle();

        const wabaPayload = {
          tenant_id: existing.id,
          tenant_slug: slug,
          phone_number_id: resolvedWabaPhoneId,
          phone_number: mergedWaba?.display_phone_number || resolvedWabaPhoneId,
          api_key: resolvedWabaToken || existing.metadata?.waba_access_token || '',
          status: 'active',
          is_connected: true,
          provider: 'meta',
          channel_type: 'waba',
          waba_id: resolvedWabaAccountId || mergedWaba?.waba_id || '',
          ownership_domain: 'TENANT',
          purpose: 'COMMERCE',
          metadata: {
            ...(mergedWaba || {}),
            updated_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        };

        if (existingWabaConn?.id) {
          await supabaseAdmin
            .from('whatsapp_connections')
            .update(wabaPayload)
            .eq('id', existingWabaConn.id);
        } else {
          await supabaseAdmin
            .from('whatsapp_connections')
            .insert(wabaPayload);
        }
      } catch (wConnErr) {
        console.warn('[Settings Route] Upsert whatsapp_connections warning:', wConnErr);
      }
    }

    // ── UPDATE TABEL TENANTS (DENGAN VERIFIKASI COUNT ROW TERPENGARUH) ──
    const { data: updatedTenants, error: updateError } = await supabaseAdmin
      .from('tenants')
      .update(updateFields)
      .eq('id', existing.id)
      .select('id, slug, name, metadata, phone, whatsapp_number');

    if (updateError || !updatedTenants || updatedTenants.length === 0) {
      console.error('[Settings Route] Update tenants failed or 0 rows affected:', updateError);
      return NextResponse.json(
        {
          success: false,
          error: 'UPDATE_FAILED_OR_ZERO_ROWS_AFFECTED',
          message: updateError?.message || 'Gagal memperbarui pengaturan toko di database Supabase (0 rows affected).',
        },
        { status: 500 }
      );
    }

    // Sync WhatsApp CS number ke tabel whatsapp_connections agar persistent across dashboard reload
    if (sanitizedPhone) {
      try {
        const { data: existingWaConn } = await supabaseAdmin
          .from('whatsapp_connections')
          .select('id')
          .or(`tenant_slug.eq.${slug},tenant_id.eq.${existing.id}`)
          .maybeSingle();

        if (existingWaConn?.id) {
          await supabaseAdmin
            .from('whatsapp_connections')
            .update({
              phone_number: sanitizedPhone,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingWaConn.id);
        } else {
          await supabaseAdmin
            .from('whatsapp_connections')
            .insert({
              tenant_id: existing.id,
              tenant_slug: slug,
              instance_name: slug,
              provider: 'EVOLUTION',
              channel_type: 'BAILEYS',
              phone_number: sanitizedPhone,
              status: 'open',
              is_connected: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
        }
      } catch (waConnErr) {
        console.warn('[Settings Route] Non-fatal whatsapp_connections sync warning:', waConnErr);
      }
    }

    // Sync dual-level session and conversations if bot_paused or is_bot_active changed
    if (bot_paused !== undefined || is_bot_active !== undefined) {
      try {
        const { executeBotControl } = await import('@/lib/whatsapp/bot-control-service');
        const targetAction = updatedMetadata.bot_paused ? 'PAUSE' : 'RESUME';
        await executeBotControl({
          action: targetAction,
          tenantId: existing.id || slug,
          tenantSlug: slug,
          userRole: 'admin',
          source: 'settings_api',
          supabase: supabaseAdmin,
        });
      } catch (bErr) {
        console.warn('[SettingsRoute] Bot control sync warning:', bErr);
      }
    }

    // Sync ke bot_profiles table jika ada
    try {
      const pName = ai_knowledge?.ai_name || body.assistant_name;
      const tVal = ai_knowledge?.tone;
      const sPrompt = ai_knowledge?.system_prompt;
      const effectivePolicy = sales_policy || playbook;
      const guardrailsList = effectivePolicy?.custom_do_and_donts ? [effectivePolicy.custom_do_and_donts] : [];

      if (pName || tVal || sPrompt || guardrailsList.length > 0) {
        await supabaseAdmin
          .from('bot_profiles')
          .upsert({
            tenant_slug: slug,
            persona_name: pName || `${existing.name} Assistant`,
            tone: tVal || 'casual',
            system_prompt: sPrompt || '',
            strict_guardrails: guardrailsList,
            knowledge_scope: effectivePolicy?.price_objection ? `Price Objection: ${effectivePolicy.price_objection}` : 'Default Scope',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tenant_slug' });
      }
    } catch {
      // Non-fatal if bot_profiles table has different constraints
    }

    // Sync ke Core Backend jika diperlukan
    try {
      await fetch(
        getBackendApiUrl(`/api/v1/tenants/${encodeURIComponent(slug)}/settings`),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': slug },
          body: JSON.stringify(body),
          cache: 'no-store',
        }
      );
    } catch {
      // Non-fatal if backend is offline
    }

    // Revalidasi cache storefront publik seketika
    try {
      revalidatePath(`/${slug}`);
      revalidatePath(`/${slug}`, 'page');
      revalidatePath(`/${slug}`, 'layout');
      revalidatePath('/[tenant]', 'page');
      revalidatePath('/[tenant]', 'layout');
    } catch (revalErr) {
      console.debug('[Settings Route] Cache revalidation note:', revalErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Pengaturan toko berhasil diperbarui.',
      settings: sanitizeSettingsForRole({
        slug,
        name: name || existing.name,
        category: category || existing.category,
        tier: updatedTier,
        plan_tier: resolvePlanTier(updatedTier),
        features: updatedFeatures,
        product,
        products,
        ai_knowledge,
        bot_strategy,
        bot_mode: updatedMetadata.bot_mode || 'HYBRID',
        faqs: updatedMetadata.faqs || [],
        interactive_menus: updatedMetadata.interactive_menus || [],
        theme: updatedMetadata.theme || { template: 'default', chat_enabled: true, chat_position: 'bottom-right' },
        microsite: updatedMetadata.microsite || { buttons: [] },
        bank,
        integration,
        qris_image_url:
          qris_image_url !== undefined
            ? qris_image_url
            : (existing.metadata?.qris_image_url || existing.metadata?.qris_url || null),
        logo_url:
          logo_url !== undefined
            ? logo_url
            : (existing.metadata?.logo_url || null),
        telegram_group_config: updatedMetadata.telegram_group_config || null,
        telegram_chat_id: updateFields.telegram_chat_id ?? (existing.telegram_chat_id || null),
      }, callerRole),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating settings';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const POST = PUT;
