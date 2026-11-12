import { sanitizeSection10Html } from './html-sanitizer';

/**
 * Sanitizes a product payload for public, unauthenticated egress.
 * HARD-GATE INVARIANT: Digital product download URLs, Telegram invite links, meeting URLs,
 * and protected fulfillment credentials must NEVER be exposed in public catalog payloads
 * before verified payment.
 */
export function sanitizePublicProduct<T = any>(product: T): T {
  if (!product || typeof product !== 'object') return product;

  if (Array.isArray(product)) {
    return product.map((p) => sanitizePublicProduct(p)) as any;
  }

  const clean: Record<string, any> = { ...(product as Record<string, any>) };

  // Strip top-level digital & fulfillment asset links
  clean.download_url = null;
  clean.link_digital = null;
  clean.delivery_url = null;
  clean.asset_reference = null;
  if ('access_url' in clean) {
    clean.access_url = null;
  }

  if (typeof clean.custom_html === 'string') {
    clean.custom_html = sanitizeSection10Html(clean.custom_html);
  }

  // Sanitize fulfillment_metadata if present
  if (clean.fulfillment_metadata && typeof clean.fulfillment_metadata === 'object') {
    const cleanSpc =
      clean.fulfillment_metadata.single_page_config &&
      typeof clean.fulfillment_metadata.single_page_config === 'object'
        ? {
            ...clean.fulfillment_metadata.single_page_config,
            ...(typeof clean.fulfillment_metadata.single_page_config.custom_html === 'string'
              ? {
                  custom_html: sanitizeSection10Html(
                    clean.fulfillment_metadata.single_page_config.custom_html
                  ),
                }
              : {}),
          }
        : clean.fulfillment_metadata.single_page_config;

    clean.fulfillment_metadata = {
      ...clean.fulfillment_metadata,
      ...(cleanSpc !== undefined ? { single_page_config: cleanSpc } : {}),
      access_url: null,
      meeting_url: null,
      google_meet_url: null,
      credentials: null,
      license_key: null,
      instructions: clean.fulfillment_metadata.instructions
        ? (clean.fulfillment_metadata.instructions.includes('http') || clean.fulfillment_metadata.instructions.includes('t.me')
            ? ''
            : clean.fulfillment_metadata.instructions)
        : '',
    };
  }

  // Sanitize embedded metadata if present
  if (clean.metadata && typeof clean.metadata === 'object') {
    const cleanMeta = { ...clean.metadata };
    delete cleanMeta.download_url;
    delete cleanMeta.link_digital;
    delete cleanMeta.delivery_url;
    delete cleanMeta.access_url;
    if (typeof cleanMeta.custom_html === 'string') {
      cleanMeta.custom_html = sanitizeSection10Html(cleanMeta.custom_html);
    }
    if (cleanMeta.fulfillment_metadata && typeof cleanMeta.fulfillment_metadata === 'object') {
      cleanMeta.fulfillment_metadata = {
        ...cleanMeta.fulfillment_metadata,
        access_url: null,
        meeting_url: null,
        google_meet_url: null,
        credentials: null,
        license_key: null,
      };
    }
    clean.metadata = cleanMeta;
  }

  return clean as T;
}

const PUBLIC_TENANT_METADATA_ALLOWLIST = [
  'theme',
  'theme_config',
  'visual_theme',
  'storefront_config',
  'storefront_style',
  'storefront_sections',
  'sections',
  'product_layout',
  'logo_url',
  'store_logo_url',
  'avatar_url',
  'slug',
  'tenant_slug',
  'business_type',
  'category',
  'custom_domain',
  'chat_enabled',
  'is_flagship',
  'doctors',
  'facilities',
  'whatsapp',
  'whatsapp_number',
  'whatsapp_cta_enabled',
  'whatsapp_cta_label',
  'whatsapp_cta_number',
  'whatsapp_custom_message',
  'phone',
  'testimonials',
  'whatsapp_testimonials',
  'checkout_type',
  'checkout_action_mode',
  'cta_label',
  'cta_text',
  'external_url',
  'direct_url',
  'affiliate_link',
  'affiliate_url',
  'link_external',
  'form_schema',
  'intake_form',
  'enable_cart',
  'hide_address_for_digital',
  'hide_floating_cta',
  'scarcity_badge',
  'micro_copy',
  'show_pain_points',
  'solution_points',
  'order_bumps',
  'tier',
  'plan_tier',
  'is_trial',
  'trial_ends_at',
  'is_digital_service',
  'bypass_checkout',
  'product_preset',
  'template',
  'builder',
  'enable_custom_html',
  'meta_pixel_id_override',
  'tiktok_pixel_id_override',
] as const;

/**
 * Sanitizes tenant metadata before public, unauthenticated exposure.
 * Strictly builds from an explicit public allowlist (Tier-1 storefront data only)
 * so private integration tokens, gateway keys, courier keys, WABA tokens, CAPI secrets,
 * and subscription records NEVER leak to anonymous callers.
 */
export function sanitizePublicTenantMetadata(metadata: any): any {
  if (!metadata || typeof metadata !== 'object') return metadata;

  const clean: Record<string, any> = {};

  for (const key of PUBLIC_TENANT_METADATA_ALLOWLIST) {
    if (metadata[key] !== undefined) {
      clean[key] = metadata[key];
    }
  }

  // Only public tracking pixel IDs are safe to expose (never CAPI/TikTok secret tokens)
  if (metadata.tracking && typeof metadata.tracking === 'object') {
    clean.tracking = {
      ...(metadata.tracking.meta_pixel_id ? { meta_pixel_id: metadata.tracking.meta_pixel_id } : {}),
      ...(metadata.tracking.facebook_pixel_id ? { facebook_pixel_id: metadata.tracking.facebook_pixel_id } : {}),
      ...(metadata.tracking.tiktok_pixel_id ? { tiktok_pixel_id: metadata.tracking.tiktok_pixel_id } : {}),
      ...(metadata.tracking.pixel_id ? { pixel_id: metadata.tracking.pixel_id } : {}),
      ...(metadata.tracking.ga_measurement_id ? { ga_measurement_id: metadata.tracking.ga_measurement_id } : {}),
    };
  }

  // Sanitize Section 10 custom HTML if present
  if (metadata.section_10 && typeof metadata.section_10 === 'object') {
    clean.section_10 = {
      enabled: Boolean(metadata.section_10.enabled),
      ...(typeof metadata.section_10.title === 'string' ? { title: metadata.section_10.title } : {}),
      custom_html:
        typeof metadata.section_10.custom_html === 'string'
          ? sanitizeSection10Html(metadata.section_10.custom_html)
          : '',
    };
  }

  if (metadata.single_page_config && typeof metadata.single_page_config === 'object') {
    clean.single_page_config = {
      ...metadata.single_page_config,
      ...(typeof metadata.single_page_config.custom_html === 'string'
        ? { custom_html: sanitizeSection10Html(metadata.single_page_config.custom_html) }
        : {}),
    };
  }

  if (Array.isArray(metadata.products)) {
    clean.products = metadata.products.map((p: any) => sanitizePublicProduct(p));
  }

  if (metadata.product && typeof metadata.product === 'object') {
    clean.product = sanitizePublicProduct(metadata.product);
  }

  return clean;
}

