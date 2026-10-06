/**
 * lib/boonpilot/sender-resolver.ts
 * BoonPilot Sender Identity & Registration Resolver
 *
 * Resolves incoming WhatsApp sender identity against Supabase `tenants`
 * to distinguish between GUEST (unregistered prospect) and MERCHANT (registered store owner).
 *
 * References:
 * - ADR-0026: Platform WABA Omni-Assistant, Inbound Showroom, and Multi-Provider Boundary
 * - Zero Hardcoding Policy & Supabase Single Source of Truth
 */

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeWhatsAppNumber } from '@/lib/whatsapp';

export interface BoonPilotSenderTenant {
  id: string;
  slug: string;
  name: string;
  tier: string;
  owner_name: string;
  phone?: string;
  category?: string;
  metadata?: Record<string, any>;
  isSetupComplete?: boolean;
  // Subscription Status Lifecycle
  isSubscriptionExpired?: boolean;
  subscription_status?: string;
  plan_expires_at?: string | null;
  // Multi-Role Affiliate Leader
  isAffiliateLeader?: boolean;
  affiliateId?: string;
  communityName?: string;
}

export interface BoonPilotSenderResolution {
  isRegistered: boolean;
  role: 'GUEST' | 'MERCHANT';
  senderPhone: string;
  normalizedPhone: string;
  tenant?: BoonPilotSenderTenant;
  isMultiRole?: boolean;
  affiliateProfile?: {
    affiliate_id: string;
    community_name: string;
    channel_binding_id?: string;
  };
}

export const OFFICIAL_BOONPILOT_NUMBERS = [
  '081215567168',
  '6281215567168',
  '+6281215567168',
];

export const OFFICIAL_PLATFORM_TENANT_IDS = [
  'boon',
  'system',
  '52967979-4760-4cea-b686-cdbdb389c0e1',
];

/**
 * Checks if a given tenant identifier or phone matches the official BoonPilot platform gateway.
 */
export function isOfficialPlatformIdentifier(
  tenantIdOrSlug?: string | null,
  phoneNumber?: string | null
): boolean {
  if (tenantIdOrSlug) {
    const cleanId = tenantIdOrSlug.toLowerCase().trim();
    if (OFFICIAL_PLATFORM_TENANT_IDS.includes(cleanId)) {
      return true;
    }
  }
  if (phoneNumber) {
    const clean = phoneNumber.replace(/\D/g, '');
    if (clean === '6281215567168' || clean === '081215567168') {
      return true;
    }
  }
  return false;
}

/**
 * Resolves a WhatsApp sender's phone number against Supabase `tenants`.
 * Checks metadata fields: `metadata->>phone`, `metadata->>whatsapp_number`, `metadata->>wa_verified_phone`.
 *
 * Returns:
 * - role: 'MERCHANT' and store information if registered.
 * - role: 'GUEST' if unregistered.
 */
export async function resolveBoonPilotSender(
  senderPhone: string,
  clientOverride?: any
): Promise<BoonPilotSenderResolution> {
  const cleanDigits = (senderPhone || '').replace(/\D/g, '');
  if (!cleanDigits) {
    return {
      isRegistered: false,
      role: 'GUEST',
      senderPhone: '',
      normalizedPhone: '',
    };
  }

  const normalizedPhone = normalizeWhatsAppNumber(cleanDigits);
  const localPhone = normalizedPhone.startsWith('62') ? '0' + normalizedPhone.slice(2) : normalizedPhone;

  const supabase = clientOverride || getSupabaseAdmin() || getSupabase();
  if (!supabase) {
    console.warn('[BoonPilot SenderResolver] Supabase client unreachable.');
    return {
      isRegistered: false,
      role: 'GUEST',
      senderPhone,
      normalizedPhone,
    };
  }

  try {
    const orFilter = [
      `metadata->>phone.eq.${normalizedPhone}`,
      `metadata->>phone.eq.${localPhone}`,
      `metadata->>whatsapp_number.eq.${normalizedPhone}`,
      `metadata->>whatsapp_number.eq.${localPhone}`,
      `metadata->>wa_verified_phone.eq.${normalizedPhone}`,
      `metadata->>wa_verified_phone.eq.${localPhone}`,
      `metadata->>wa_number.eq.${normalizedPhone}`,
      `metadata->>wa_number.eq.${localPhone}`,
      `telegram_chat_id.eq.${cleanDigits}`,
      `metadata->>telegram_chat_id.eq.${cleanDigits}`,
    ].join(',');

    const query = supabase
      .from('tenants')
      .select('id, slug, name, tier, category, business_type, status, plan_expires_at, telegram_chat_id, metadata');

    let tenantRow: any = null;

    if (typeof query.or === 'function') {
      const { data, error } = await query.or(orFilter).maybeSingle();
      if (!error && data) {
        tenantRow = data;
      }
    }

    // Fallback if .or is not supported or yielded nothing in mock environments
    if (!tenantRow && typeof query.eq === 'function') {
      const candidates = [
        ['metadata->>phone', normalizedPhone],
        ['metadata->>phone', localPhone],
        ['metadata->>whatsapp_number', normalizedPhone],
        ['metadata->>whatsapp_number', localPhone],
        ['metadata->>wa_verified_phone', normalizedPhone],
        ['metadata->>wa_verified_phone', localPhone],
        ['telegram_chat_id', cleanDigits],
        ['metadata->>telegram_chat_id', cleanDigits],
      ];
      for (const [col, val] of candidates) {
        try {
          const { data } = await supabase
            .from('tenants')
            .select('id, slug, name, tier, category, business_type, status, plan_expires_at, telegram_chat_id, metadata')
            .eq(col, val)
            .maybeSingle();
          if (data && data.id) {
            tenantRow = data;
            break;
          }
        } catch {
          // ignore loop error
        }
      }
    }

    if (tenantRow && tenantRow.id) {
      const meta = tenantRow.metadata && typeof tenantRow.metadata === 'object' ? tenantRow.metadata : {};
      const ownerName =
        meta.owner_name ||
        meta.pic_name ||
        meta.contact_name ||
        meta.name ||
        'Owner';

      // Canonically resolve tier: tenants.tier is single source of truth
      const rawTier = tenantRow.tier || meta.tier || 'SOLO';

      // 1. Subscription Status Lifecycle
      const rawStatus = (tenantRow.status || meta.subscription_status || meta.status || '').toLowerCase();
      const rawExpiresAt = tenantRow.plan_expires_at || meta.plan_expires_at || meta.subscription_ends_at || meta.expires_at || null;
      let isSubscriptionExpired = false;

      if (rawStatus === 'expired') {
        isSubscriptionExpired = true;
      } else if (rawExpiresAt) {
        const expiresMs = new Date(rawExpiresAt).getTime();
        if (!isNaN(expiresMs) && expiresMs < Date.now()) {
          isSubscriptionExpired = true;
        }
      }

      // 2. Multi-Role Recognition (Affiliate Leader + Merchant)
      let isAffiliateLeader = false;
      let affiliateId: string | undefined = undefined;
      let communityName: string | undefined = undefined;

      const candAffId = (meta.affiliate_id || (tenantRow.slug === 'buzzerukm' ? 'buzzerukm' : '')).trim();

      if (candAffId || meta.is_affiliate_leader || tenantRow.slug === 'buzzerukm') {
        isAffiliateLeader = true;
        affiliateId = candAffId || tenantRow.slug;
        communityName = meta.community_name || (affiliateId === 'buzzerukm' ? 'Buzzer UKM' : affiliateId);
      } else {
        try {
          const { data: binding } = await supabase
            .from('channel_bindings')
            .select('affiliate_id, channel_name, tenant_slug, metadata')
            .or(`affiliate_id.eq.${tenantRow.slug},tenant_slug.eq.${tenantRow.slug}`)
            .limit(1)
            .maybeSingle();

          if (binding) {
            isAffiliateLeader = true;
            affiliateId = binding.affiliate_id || tenantRow.slug;
            communityName = binding.channel_name || (binding.metadata as any)?.community_name || affiliateId;
          }
        } catch {
          // ignore lookup error
        }
      }

      return {
        isRegistered: true,
        role: 'MERCHANT',
        isMultiRole: isAffiliateLeader,
        affiliateProfile: isAffiliateLeader
          ? {
              affiliate_id: affiliateId!,
              community_name: communityName || affiliateId!,
            }
          : undefined,
        senderPhone,
        normalizedPhone,
        tenant: {
          id: tenantRow.id,
          slug: tenantRow.slug || tenantRow.id,
          name: tenantRow.name || 'Toko Saya',
          tier: rawTier,
          owner_name: ownerName,
          category: tenantRow.category || tenantRow.business_type || 'retail',
          phone: normalizedPhone,
          metadata: meta,
          isSubscriptionExpired,
          subscription_status: rawStatus,
          plan_expires_at: rawExpiresAt,
          isAffiliateLeader,
          affiliateId,
          communityName,
        },
      };
    }
  } catch (err) {
    console.error('[BoonPilot SenderResolver Exception]:', err);
  }

  return {
    isRegistered: false,
    role: 'GUEST',
    senderPhone,
    normalizedPhone,
  };
}
