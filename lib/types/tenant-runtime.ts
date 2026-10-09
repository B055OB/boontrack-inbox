/**
 * lib/types/tenant-runtime.ts
 * Canonical Tenant Runtime Contract & Boundaries (CTO Mandate)
 * Enforces strict domain separation, template capability boundaries, and zero-hardcoding policy.
 */

export type TenantKind = 'SAAS' | 'CUSTOM_APP' | 'INTERNAL';

export type BusinessType = 'RETAIL' | 'FNB' | 'PUBLIC_SERVICE' | 'CORPORATE' | string;

export type TemplateCode = 'SHOP_V1' | 'DROP_V1' | 'PUBLIC_SERVICE_V1' | 'CORPORATE_V1' | 'UNKNOWN_TEMPLATE';

export enum StudioCapability {
  VIRAL_TRENDS_RADAR = 'VIRAL_TRENDS_RADAR',
  PAID_ADS_INTELLIGENCE = 'PAID_ADS_INTELLIGENCE',
}

export type StudioCapabilityType = `${StudioCapability}` | 'VIRAL_TRENDS_RADAR' | 'PAID_ADS_INTELLIGENCE';

export interface TenantCapabilities {
  // Public Service & Civic Capabilities
  service_catalog: boolean;
  citizen_request: boolean;
  complaint: boolean;
  announcement: boolean;
  public_information: boolean;
  document_request: boolean;
  ai_public_service_assistant: boolean;
  AI_PUBLIC_SERVICE_ASSISTANT: boolean;

  // Commerce & Storefront Capabilities
  catalog: boolean;
  cart: boolean;
  checkout: boolean;
  shopping_bag: boolean;
  promo: boolean;
  price_badge: boolean;
  sales_assistant: boolean;
  ecommerce_order_flow: boolean;
  payment: boolean;
  order: boolean;
  sales_rep: boolean;

  // Studio Intelligence Capabilities
  viral_trends_radar?: boolean;
  paid_ads_intelligence?: boolean;
  VIRAL_TRENDS_RADAR?: boolean;
  PAID_ADS_INTELLIGENCE?: boolean;

  [key: string]: boolean | undefined;
}

export type HardeningPolicy = 'HARDENING_V0' | 'HARDENING_V1';

export interface TenantRecord {
  id?: string;
  slug: string;
  name?: string;
  title?: string;
  category?: string;
  tier?: string;
  status?: string;
  tenant_kind?: TenantKind;
  business_type?: BusinessType;
  template_code?: TemplateCode | string;
  hardening_policy?: HardeningPolicy;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface TenantRuntimeContext {
  host: string;
  tenantSlug: string;
  tenantId?: string;
  tenantKind: TenantKind;
  businessType: BusinessType;
  templateCode: TemplateCode;
  capabilities: TenantCapabilities;
  hardeningPolicy: HardeningPolicy;
  tenant: TenantRecord;
  isAllowedHost: boolean;
  error?: 'HOST_MISMATCH' | 'TEMPLATE_NOT_COMPATIBLE' | 'UNKNOWN_TEMPLATE' | 'TENANT_NOT_FOUND' | 'TEMPLATE_INCOMPATIBLE' | 'CORRUPT_CONFIG';
  errorMessage?: string;
  statusCode?: number;
}

export type TemplateResolutionStatus = 'SUCCESS' | 'ERROR';

export interface ResolvedTemplateResult {
  status: TemplateResolutionStatus;
  templateCode: TemplateCode;
  subVariant: 'storefront' | 'personal' | 'microsite' | 'public_service' | 'corporate' | 'unknown';
  capabilities: TenantCapabilities;
  error?: 'UNKNOWN_TEMPLATE' | 'TEMPLATE_INCOMPATIBLE' | 'CORRUPT_CONFIG';
  errorMessage?: string;
  statusCode?: number;
}

// ── STOREFRONT MODULAR SECTIONS & COPY TYPES (CTO Mandate / Zero-Hardcoding) ──

export interface StorefrontSectionConfig {
  is_active?: boolean;
  [key: string]: any;
}

export interface StorefrontSectionsConfig {
  hero?: StorefrontSectionConfig;
  intake_form?: StorefrontSectionConfig;
  benefits?: StorefrontSectionConfig;
  floating_chat?: StorefrontSectionConfig;
  featured_catalog?: StorefrontSectionConfig;
  operating_hours?: StorefrontSectionConfig;
  testimonials?: StorefrontSectionConfig;
  instagram_feed?: StorefrontSectionConfig;
  media_gallery?: StorefrontSectionConfig;
  client_logos?: StorefrontSectionConfig;
  problem_solution?: StorefrontSectionConfig;
  offer_bonus?: StorefrontSectionConfig;
  faq?: StorefrontSectionConfig;
  payment_voucher?: StorefrontSectionConfig;
  [key: string]: StorefrontSectionConfig | undefined;
}

export interface StorefrontCopyConfig {
  headline?: string;
  subheadline?: string;
  hero_badge?: string;
  cta_primary_label?: string;
  cta_secondary_label?: string;
  cta_label?: string;
  notice_bar_text?: string;
  intake_badge?: string;
  intake_title?: string;
  intake_subtitle?: string;
  intake_submit_label?: string;
  benefits_badge?: string;
  benefits_title?: string;
  benefits?: string[];
  pillars?: Array<{ title: string; description: string; [key: string]: any }>;
  catalog_badge?: string;
  catalog_title?: string;
  operating_hours_badge?: string;
  operating_hours_title?: string;
  booking_title?: string;
  booking_subtitle?: string;
  booking_topics?: string[];
  testimonials_badge?: string;
  testimonials_title?: string;
  visual_feed_title?: string;
  visual_feed_subtitle?: string;
  [key: string]: any;
}

