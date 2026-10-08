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
  tenantKind: TenantKind;
  businessType: BusinessType;
  templateCode: TemplateCode;
  capabilities: TenantCapabilities;
  hardeningPolicy: HardeningPolicy;
  tenant: TenantRecord;
  isAllowedHost: boolean;
  error?: 'HOST_MISMATCH' | 'TEMPLATE_NOT_COMPATIBLE' | 'UNKNOWN_TEMPLATE' | 'TENANT_NOT_FOUND';
  errorMessage?: string;
  statusCode?: number;
}

