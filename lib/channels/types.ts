/**
 * lib/channels/types.ts
 * §43 Channel Binding Contract & Capabilities Type Definitions
 *
 * Implements ARCHITECTURE.md §43:
 * Inbound Event -> Channel Adapter -> Channel Binding -> Context -> Capability/Policy -> Shared Core
 */

export type ChannelType = 'telegram' | 'whatsapp';

export type BindingContext = 'STORE_CONTEXT' | 'AFFILIATE_CONTEXT';

export type ChannelCapability =
  // STORE_CONTEXT capabilities
  | 'order_notification'
  | 'payment_notification'
  | 'catalog'
  // AFFILIATE_CONTEXT capabilities
  | 'referral_acquisition'
  | 'registration_link'
  | 'affiliate_notification';

/**
 * §43.2 Capability Matrix by Context
 */
export const CONTEXT_CAPABILITIES: Record<BindingContext, readonly ChannelCapability[]> = {
  STORE_CONTEXT: ['order_notification', 'payment_notification', 'catalog'],
  AFFILIATE_CONTEXT: ['referral_acquisition', 'registration_link', 'affiliate_notification'],
} as const;

/**
 * §43.2 ChannelBinding Entity
 */
export interface ChannelBinding {
  binding_id: string;
  channel_type: ChannelType;
  external_identifier: string; // chat_id / group_jid
  context: BindingContext;
  community_source_id?: string | null;
  capabilities: ChannelCapability[];
  tenant_id?: string | null;
  tenant_slug?: string | null;
  affiliate_id?: string | null;
  channel_name?: string | null;
  demo_url?: string | null;
  is_active?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Telegram Group Privacy Configuration (§42.2)
 */
export interface TelegramGroupConfig {
  notify_new_order?: boolean;
  notify_paid?: boolean;
  show_product_name?: boolean;
  show_price?: boolean;
  mask_buyer_name?: boolean;
  hide_buyer_contact?: boolean;
}

/**
 * Parameters for resolving a ChannelBinding
 */
export interface ResolveBindingParams {
  channel_type: ChannelType;
  external_identifier: string;
  context: BindingContext;
  community_source_id?: string | null;
  binding_id?: string;
  tenant_id?: string | null;
  tenant_slug?: string | null;
  affiliate_id?: string | null;
  channel_name?: string | null;
  demo_url?: string | null;
  is_active?: boolean;
  metadata?: Record<string, any>;
  capabilities?: ChannelCapability[];
  group_config?: TelegramGroupConfig;
}

/**
 * Granular Referral Link Construction Options (§43.3)
 */
export interface GranularReferralOptions {
  baseUrl?: string;
  slug?: string;
  affiliateId: string;
  communitySourceId?: string | null;
  customParams?: Record<string, string>;
}
