/**
 * lib/channels/binding-engine.ts
 * §43 Context-Capability Pattern & Granular Attribution Engine
 *
 * Implements ARCHITECTURE.md §43:
 * - Pure transport adapter pipeline: Inbound Event -> Channel Adapter -> Channel Binding -> Context -> Capability/Policy -> Shared Core.
 * - Granular Attribution Engine: Separation of affiliate ID and community source ID (?ref={affiliate_id}&src={community_source_id}).
 */

import {
  BindingContext,
  ChannelBinding,
  ChannelCapability,
  ChannelType,
  CONTEXT_CAPABILITIES,
  GranularReferralOptions,
  ResolveBindingParams,
  TelegramGroupConfig,
} from './types';
import { getStorefrontBaseUrl } from '@/lib/platform-urls';

/**
 * §43.1 / §43.2: Capability Policy Check Helper.
 * Evaluates whether a channel binding possesses a specific capability.
 * Replaces hardcoded `if (group_type === ...)` checks across dispatchers.
 */
export function hasCapability(
  binding: ChannelBinding | null | undefined,
  capability: ChannelCapability
): boolean {
  if (!binding || !Array.isArray(binding.capabilities)) {
    return false;
  }
  return binding.capabilities.includes(capability);
}

/**
 * Resolves active capabilities for a given binding context, applying
 * granular group privacy policies (§42.2) and any capability overrides.
 */
export function resolveBindingCapabilities(
  context: BindingContext,
  options?: {
    groupConfig?: TelegramGroupConfig;
    overrides?: Partial<Record<ChannelCapability, boolean>> | ChannelCapability[];
  }
): ChannelCapability[] {
  // If explicit array of capabilities is passed in overrides, honor it directly
  if (Array.isArray(options?.overrides)) {
    return [...options.overrides];
  }

  const baseCapabilities = CONTEXT_CAPABILITIES[context] || [];
  const groupConfig = options?.groupConfig;
  const dictOverrides = options?.overrides;

  const result: ChannelCapability[] = [];

  for (const cap of baseCapabilities) {
    let enabled = true;

    // Evaluate context-specific capability policies
    if (context === 'STORE_CONTEXT' && groupConfig) {
      if (cap === 'order_notification' && groupConfig.notify_new_order === false) {
        enabled = false;
      }
      if (cap === 'payment_notification' && groupConfig.notify_paid === false) {
        enabled = false;
      }
    }

    // Apply manual dictionary overrides if specified
    if (dictOverrides && typeof dictOverrides[cap] === 'boolean') {
      enabled = Boolean(dictOverrides[cap]);
    }

    if (enabled) {
      result.push(cap);
    }
  }

  return result;
}

/**
 * Strict Domain Whitelist Guard for Demo URLs.
 * Validates that demo_url belongs to the boontrack.com ecosystem (e.g. shop.boontrack.com, boontrack.com).
 * Rejects external domains (shopee, tokopedia, third-party biolinks).
 */
export function validateDemoUrl(urlStr?: string | null): {
  valid: boolean;
  normalizedUrl?: string;
  error?: string;
} {
  if (!urlStr || !urlStr.trim()) {
    return {
      valid: true,
      normalizedUrl: 'https://shop.boontrack.com/toko-demo',
    };
  }

  const clean = urlStr.trim();

  try {
    const parsed = new URL(
      clean.startsWith('http://') || clean.startsWith('https://')
        ? clean
        : `https://${clean}`
    );

    const hostname = parsed.hostname.toLowerCase();

    // Strict Domain Whitelist: must be exactly boontrack.com or end with .boontrack.com
    const isBoontrack =
      hostname === 'boontrack.com' || hostname.endsWith('.boontrack.com');

    if (!isBoontrack) {
      return {
        valid: false,
        error: 'Tautan demo wajib menggunakan ekosistem boontrack.com',
      };
    }

    // Force https protocol
    parsed.protocol = 'https:';

    return {
      valid: true,
      normalizedUrl: parsed.toString(),
    };
  } catch {
    return {
      valid: false,
      error: 'Tautan demo wajib menggunakan ekosistem boontrack.com',
    };
  }
}

/**
 * Resolves a ChannelBinding instance deterministically from inbound channel parameters.
 */
export function resolveChannelBinding(params: ResolveBindingParams): ChannelBinding {
  const {
    channel_type,
    external_identifier,
    context,
    community_source_id,
    tenant_id,
    tenant_slug,
    affiliate_id,
    channel_name,
    demo_url,
    is_active,
    metadata,
    group_config,
  } = params;

  const bindingId =
    params.binding_id ||
    `${channel_type}:${external_identifier}:${context.toLowerCase()}`;

  const capabilities =
    params.capabilities ||
    resolveBindingCapabilities(context, {
      groupConfig: group_config,
    });

  const demoValidation = validateDemoUrl(demo_url);

  return {
    binding_id: bindingId,
    channel_type,
    external_identifier: String(external_identifier).trim(),
    context,
    community_source_id: community_source_id ? String(community_source_id).trim() : null,
    capabilities,
    tenant_id: tenant_id || null,
    tenant_slug: tenant_slug || null,
    affiliate_id: affiliate_id || null,
    channel_name: channel_name || null,
    demo_url: demoValidation.normalizedUrl || 'https://shop.boontrack.com/toko-demo',
    is_active: is_active !== false,
    metadata: metadata || {},
  };
}

/**
 * §43.3 Granular Attribution Engine:
 * Generates an affiliate referral URL containing both the affiliate ID and the community source ID:
 * Format: `https://shop.boontrack.com/{slug}?ref={affiliate_id}&src={community_source_id}`
 */
export function buildGranularReferralUrl(options: GranularReferralOptions): string {
  const {
    baseUrl,
    slug,
    affiliateId,
    communitySourceId,
    customParams,
  } = options;

  const cleanAffiliate = (affiliateId || '').trim();
  const rootBase = (baseUrl || getStorefrontBaseUrl()).replace(/\/+$/, '');
  const path = slug ? `/${encodeURIComponent(slug.trim())}` : '';
  const url = new URL(`${rootBase}${path}`);

  if (cleanAffiliate) {
    url.searchParams.set('ref', cleanAffiliate);
  }

  const cleanSrc = (communitySourceId || '').trim();
  if (cleanSrc) {
    url.searchParams.set('src', cleanSrc);
  }

  if (customParams) {
    for (const [key, value] of Object.entries(customParams)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

/**
 * Extracts granular attribution components (?ref= and ?src=) from URLSearchParams,
 * URL string, or param dictionary.
 */
export function extractGranularAttribution(
  source: string | URLSearchParams | Record<string, string | null | undefined>
): { referralCode: string | null; communitySourceId: string | null } {
  let searchParams: URLSearchParams;

  if (typeof source === 'string') {
    try {
      const url = new URL(source, 'https://shop.boontrack.com');
      searchParams = url.searchParams;
    } catch {
      searchParams = new URLSearchParams(source);
    }
  } else if (source instanceof URLSearchParams) {
    searchParams = source;
  } else {
    searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(source)) {
      if (v) searchParams.set(k, v);
    }
  }

  const ref =
    searchParams.get('ref') ||
    searchParams.get('aff') ||
    searchParams.get('referral') ||
    null;

  const src =
    searchParams.get('src') ||
    searchParams.get('source') ||
    searchParams.get('community_source_id') ||
    null;

  return {
    referralCode: ref ? ref.trim() : null,
    communitySourceId: src ? src.trim() : null,
  };
}
