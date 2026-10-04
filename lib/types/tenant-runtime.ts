/**
 * lib/types/tenant-runtime.ts
 * Canonical Tenant Runtime Contract & Boundaries (CTO Mandate)
 * Enforces strict domain separation, template capability boundaries, and zero-hardcoding policy.
 */

export type TenantKind = 'SAAS' | 'CUSTOM_APP' | 'INTERNAL';

export type BusinessType = 'RETAIL' | 'FNB' | 'PUBLIC_SERVICE' | 'CORPORATE' | string;

export type TemplateCode = 'SHOP_V1' | 'PUBLIC_SERVICE_V1' | 'CORPORATE_V1' | 'UNKNOWN_TEMPLATE';

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

  [key: string]: boolean | undefined;
}

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
  tenant: TenantRecord;
  isAllowedHost: boolean;
  error?: 'HOST_MISMATCH' | 'TEMPLATE_NOT_COMPATIBLE' | 'UNKNOWN_TEMPLATE' | 'TENANT_NOT_FOUND';
  errorMessage?: string;
  statusCode?: number;
}
