/**
 * lib/resolvers/tenant-runtime-resolver.ts
 * Centralized Template & Host Resolver (CTO Mandate)
 *
 * Enforces:
 * 1. Zero-hardcoding policy: Evaluates metadata, business_type, and template_code dynamically.
 * 2. Domain Boundary Guard:
 *    - shop.boontrack.com only allows Commerce Runtime (SHOP_V1). CUSTOM_APP & PUBLIC_SERVICE_V1 are rejected with 404.
 *    - app.boontrack.com serves CUSTOM_APP, PUBLIC_SERVICE_V1, and Enterprise Portals.
 * 3. Strict No-Silent-Fallback:
 *    - Invalid or unknown template codes trigger UNKNOWN_TEMPLATE / controlled error, never fallback to Storefront.
 */

import {
  TenantCapabilities,
  TenantKind,
  BusinessType,
  TemplateCode,
  TenantRecord,
  TenantRuntimeContext,
  HardeningPolicy,
  ResolvedTemplateResult,
  TemplateResolutionStatus,
} from '@/lib/types/tenant-runtime';
import { getTenantConfig } from '@/lib/tenant-config';

// ── HARDENING POLICY RESOLVER (Progressive Runtime Rollout) ───────────────────

/**
 * Resolves the Hardening Policy version for a tenant:
 * - 'HARDENING_V1': Scoped canary for pilot tenant ('tumbuh-kembang-anak' / 'konsul.littlebitefeeding.com')
 *   or explicit metadata override.
 * - 'HARDENING_V0': Default legacy/stable path for all existing tenants (buzzerukm, syandinaryoshop, digitara, gaziir, boon, etc.)
 */
export function resolveHardeningPolicy(tenant?: TenantRecord | null): HardeningPolicy {
  // 1. Check explicit policy in metadata or tenant record first (Single Source of Truth / dynamic)
  const explicitPolicy =
    tenant?.hardening_policy ||
    tenant?.metadata?.hardening_policy ||
    tenant?.metadata?.hardeningPolicy;

  if (explicitPolicy === 'HARDENING_V1' || explicitPolicy === 'v1' || explicitPolicy === 'V1') {
    return 'HARDENING_V1';
  }

  // 2. Canary scoping for pilot tenant
  const slug = (tenant?.slug || '').toLowerCase().trim();
  const customDomain = (tenant?.metadata?.custom_domain || '').toLowerCase().trim();
  if (slug === 'tumbuh-kembang-anak' || customDomain === 'konsul.littlebitefeeding.com') {
    return 'HARDENING_V1';
  }

  // 3. Default to HARDENING_V0 for all other tenants (zero regression)
  return 'HARDENING_V0';
}


// ── CUSTOM CANONICAL ERROR CLASSES ──────────────────────────────────────────

export class TenantRoutingError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number = 400, code: string = 'ROUTING_ERROR') {
    super(message);
    this.name = 'TenantRoutingError';
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TemplateNotCompatibleError extends TenantRoutingError {
  constructor(message = 'Template is not compatible with this host runtime', statusCode = 404) {
    super(message, statusCode, 'TEMPLATE_NOT_COMPATIBLE');
    this.name = 'TemplateNotCompatibleError';
  }
}

export class UnknownTemplateError extends TenantRoutingError {
  templateCode: string;

  constructor(templateCode: string, message?: string) {
    super(
      message || `Template code '${templateCode}' is invalid or unknown. Controlled provisioning error.`,
      422,
      'UNKNOWN_TEMPLATE'
    );
    this.name = 'UnknownTemplateError';
    this.templateCode = templateCode;
  }
}

// ── CAPABILITY BOUNDARIES ───────────────────────────────────────────────────

/**
 * Returns strictly bounded capabilities per template contract.
 * PUBLIC_SERVICE_V1 disables all commerce flows and enables civic services + AI assistant.
 * SHOP_V1 enables full commerce catalog, cart, checkout, payments.
 */
export function getTemplateCapabilities(templateCode: TemplateCode): TenantCapabilities {
  switch (templateCode) {
    case 'PUBLIC_SERVICE_V1':
      return {
        service_catalog: true,
        citizen_request: true,
        complaint: true,
        announcement: true,
        public_information: true,
        document_request: true,
        ai_public_service_assistant: true,
        AI_PUBLIC_SERVICE_ASSISTANT: true,
        // DISABLE all commerce and checkout flows
        catalog: false,
        cart: false,
        checkout: false,
        shopping_bag: false,
        promo: false,
        price_badge: false,
        sales_assistant: false,
        ecommerce_order_flow: false,
        payment: false,
        order: false,
        sales_rep: false,
      };

    case 'DROP_V1':
    case 'SHOP_V1':
      return {
        catalog: true,
        cart: true,
        checkout: true,
        shopping_bag: true,
        promo: true,
        price_badge: true,
        sales_assistant: true,
        ecommerce_order_flow: true,
        payment: true,
        order: true,
        sales_rep: true,
        // DISABLE civic flows
        service_catalog: false,
        citizen_request: false,
        complaint: false,
        announcement: false,
        public_information: false,
        document_request: false,
        ai_public_service_assistant: false,
        AI_PUBLIC_SERVICE_ASSISTANT: false,
      };

    case 'CORPORATE_V1':
      return {
        catalog: true,
        cart: false,
        checkout: false,
        shopping_bag: false,
        promo: false,
        price_badge: false,
        sales_assistant: false,
        ecommerce_order_flow: false,
        payment: false,
        order: false,
        sales_rep: false,
        service_catalog: false,
        citizen_request: false,
        complaint: false,
        announcement: true,
        public_information: true,
        document_request: false,
        ai_public_service_assistant: false,
        AI_PUBLIC_SERVICE_ASSISTANT: false,
      };

    case 'UNKNOWN_TEMPLATE':
    default:
      return {
        service_catalog: false,
        citizen_request: false,
        complaint: false,
        announcement: false,
        public_information: false,
        document_request: false,
        ai_public_service_assistant: false,
        AI_PUBLIC_SERVICE_ASSISTANT: false,
        catalog: false,
        cart: false,
        checkout: false,
        shopping_bag: false,
        promo: false,
        price_badge: false,
        sales_assistant: false,
        ecommerce_order_flow: false,
        payment: false,
        order: false,
        sales_rep: false,
      };
  }
}

// ── CENTRAL RESOLVER ────────────────────────────────────────────────────────

export interface ResolveTenantRuntimeOptions {
  host?: string;
  tenant?: TenantRecord | null;
  throwOnError?: boolean;
}

export function resolveTenantRuntime(
  optionsOrHost: ResolveTenantRuntimeOptions | string,
  tenantArg?: TenantRecord | null
): TenantRuntimeContext {
  let hostInput = '';
  let tenantInput: TenantRecord | null = null;
  let throwOnError = false;

  if (typeof optionsOrHost === 'string') {
    hostInput = optionsOrHost;
    tenantInput = tenantArg || null;
  } else if (optionsOrHost && typeof optionsOrHost === 'object') {
    hostInput = optionsOrHost.host || '';
    tenantInput = optionsOrHost.tenant || null;
    throwOnError = Boolean(optionsOrHost.throwOnError);
  }

  // Parse host (supports "shop.boontrack.com", "app/margasari", "shop/margasari", etc.)
  let cleanHost = hostInput.toLowerCase().trim().replace(/^https?:\/\//, '');
  let domainPart = cleanHost;
  let pathSlug = '';

  if (cleanHost.includes('/')) {
    const parts = cleanHost.split('/');
    domainPart = parts[0];
    pathSlug = parts[1] || '';
  }

  const hostDomain = domainPart.split(':')[0].trim();
  const slugFromTenant = tenantInput?.slug || '';
  const tenantSlug = slugFromTenant || pathSlug || '';

  // Dynamically enrich tenant record with config if available (without hardcoded names)
  const fallbackConfig = tenantSlug ? getTenantConfig(tenantSlug) : null;
  const tenant: TenantRecord = {
    ...fallbackConfig,
    ...tenantInput,
    slug: tenantSlug,
    metadata: {
      ...(fallbackConfig as any)?.metadata,
      ...tenantInput?.metadata,
    },
  };

  // Extract raw indicators dynamically from tenant and metadata
  const rawTemplate =
    tenant.template_code ??
    tenant.metadata?.template_code ??
    tenant.metadata?.selected_template ??
    tenant.metadata?.template;

  const rawBusinessType = (
    tenant.business_type ||
    tenant.metadata?.business_type ||
    tenant.category ||
    tenant.metadata?.category ||
    ''
  ).toUpperCase().trim();

  const rawKind = (
    tenant.tenant_kind ||
    tenant.metadata?.tenant_kind ||
    ''
  ).toUpperCase().trim();

  // 1. Resolve Template Code with Strict NO SILENT FALLBACK
  let templateCode: TemplateCode = 'SHOP_V1';

  if (rawTemplate !== undefined && rawTemplate !== null && rawTemplate !== '') {
    const norm = String(rawTemplate).toUpperCase().trim();
    if (norm === 'PUBLIC_SERVICE_V1' || norm === 'PUBLIC_SERVICE') {
      templateCode = 'PUBLIC_SERVICE_V1';
    } else if (norm === 'DROP_V1' || norm === 'DROP') {
      templateCode = 'DROP_V1';
    } else if (norm === 'APP_SHOP' || norm === 'APP_SHOP_V1') {
      // Legacy APP_SHOP deprecated -> standardized to DROP_V1
      templateCode = 'DROP_V1';
    } else if (norm === 'SHOP_V1' || norm === 'SHOP' || norm === 'STOREFRONT' || norm === 'DEFAULT') {
      templateCode = 'SHOP_V1';
    } else if (norm === 'CORPORATE_V1' || norm === 'CORPORATE') {
      templateCode = 'CORPORATE_V1';
    } else {
      // Unrecognized template string -> UNKNOWN_TEMPLATE (CTO Mandate: NO SILENT FALLBACK)
      templateCode = 'UNKNOWN_TEMPLATE';
    }
  } else if (rawTemplate === null) {
    // Explicit null -> UNKNOWN_TEMPLATE
    templateCode = 'UNKNOWN_TEMPLATE';
  } else {
    // Deduce canonical template from business_type / category if not explicitly specified
    if (rawBusinessType === 'PUBLIC_SERVICE' || rawBusinessType === 'B2G') {
      templateCode = 'PUBLIC_SERVICE_V1';
    } else if (rawBusinessType === 'CORPORATE') {
      templateCode = 'CORPORATE_V1';
    } else if (
      rawBusinessType === 'RETAIL' ||
      rawBusinessType === 'FNB' ||
      rawBusinessType === 'DIGITAL' ||
      rawBusinessType === 'ECOMMERCE' ||
      rawBusinessType === ''
    ) {
      templateCode = 'SHOP_V1';
    } else if (rawKind === 'CUSTOM_APP') {
      templateCode = 'UNKNOWN_TEMPLATE';
    } else {
      templateCode = 'SHOP_V1';
    }
  }

  // 2. Resolve Business Type & Tenant Kind
  let businessType: BusinessType = 'RETAIL';
  if (rawBusinessType) {
    businessType = rawBusinessType;
  } else if (templateCode === 'PUBLIC_SERVICE_V1') {
    businessType = 'PUBLIC_SERVICE';
  } else if (templateCode === 'CORPORATE_V1') {
    businessType = 'CORPORATE';
  }

  let tenantKind: TenantKind = 'SAAS';
  if (rawKind === 'CUSTOM_APP' || rawKind === 'INTERNAL' || rawKind === 'SAAS') {
    tenantKind = rawKind as TenantKind;
  } else if (templateCode === 'PUBLIC_SERVICE_V1' || businessType === 'PUBLIC_SERVICE') {
    tenantKind = 'CUSTOM_APP';
  }

  const capabilities = getTemplateCapabilities(templateCode);
  const hardeningPolicy = resolveHardeningPolicy(tenant);

  // 3. Domain Boundary Guards
  const isShopDomain =
    hostDomain === 'shop' ||
    hostDomain === 'shop.boontrack.com' ||
    hostDomain.startsWith('shop.');

  // Boundary 1: shop.boontrack.com ONLY allows Commerce Runtime (SHOP_V1).
  // If CUSTOM_APP or PUBLIC_SERVICE_V1 tries to access via shop.boontrack.com, reject with 404!
  if (isShopDomain) {
    if (templateCode === 'PUBLIC_SERVICE_V1' || tenantKind === 'CUSTOM_APP') {
      const errorResult: TenantRuntimeContext = {
        host: hostInput,
        tenantSlug,
        tenantKind,
        businessType,
        templateCode,
        capabilities,
        hardeningPolicy,
        tenant,
        isAllowedHost: false,
        statusCode: 404,
        error: 'TEMPLATE_NOT_COMPATIBLE',
        errorMessage: 'Layanan publik atau aplikasi khusus tidak diizinkan di domain shop.boontrack.com.',
      };
      if (throwOnError) {
        throw new TemplateNotCompatibleError(errorResult.errorMessage, 404);
      }
      return errorResult;
    }
  }

  // Boundary 2: Unknown Template guard (NO SILENT FALLBACK)
  if (templateCode === 'UNKNOWN_TEMPLATE') {
    const errorResult: TenantRuntimeContext = {
      host: hostInput,
      tenantSlug,
      tenantKind,
      businessType,
      templateCode,
      capabilities,
      hardeningPolicy,
      tenant,
      isAllowedHost: false,
      statusCode: 422,
      error: 'UNKNOWN_TEMPLATE',
      errorMessage: `Template '${rawTemplate}' tidak dikenali atau belum terprovisioning.`,
    };
    if (throwOnError) {
      throw new UnknownTemplateError(String(rawTemplate), errorResult.errorMessage);
    }
    return errorResult;
  }

  const tenantId = tenantInput?.id || tenant?.id || undefined;

  return {
    host: hostInput,
    tenantSlug,
    tenantId,
    tenantKind,
    businessType,
    templateCode,
    capabilities,
    hardeningPolicy,
    tenant,
    isAllowedHost: true,
    statusCode: 200,
  };
}

/**
 * Asserts that runtime context is valid and allowed.
 * Throws TemplateNotCompatibleError (404) or UnknownTemplateError (422) if invalid.
 */
export function assertTenantRuntimeAllowed(runtime: TenantRuntimeContext): void {
  if (runtime.error === 'TEMPLATE_NOT_COMPATIBLE' || runtime.statusCode === 404) {
    throw new TemplateNotCompatibleError(runtime.errorMessage, 404);
  }
  if (runtime.error === 'UNKNOWN_TEMPLATE' || runtime.templateCode === 'UNKNOWN_TEMPLATE') {
    throw new UnknownTemplateError(
      String(runtime.tenant?.template_code || 'UNKNOWN'),
      runtime.errorMessage
    );
  }
  if (!runtime.isAllowedHost) {
    throw new TenantRoutingError(
      runtime.errorMessage || 'Host not allowed for this runtime context',
      runtime.statusCode || 403
    );
  }
}

/**
 * Fail-Closed Template Resolver (CTO Mandate)
 * Evaluates templateCode against registered catalog and ensures strict compatibility with businessType.
 * DILARANG KERAS fallback ke template lain jika template_code korup atau tidak sesuai.
 */
export function resolveTemplate(context: TenantRuntimeContext): ResolvedTemplateResult {
  // 1. Check if context already holds an unrecoverable error
  if (!context.isAllowedHost || context.statusCode === 404 || context.error === 'TEMPLATE_NOT_COMPATIBLE') {
    return {
      status: 'ERROR',
      templateCode: context.templateCode,
      subVariant: 'unknown',
      capabilities: context.capabilities,
      error: 'TEMPLATE_INCOMPATIBLE',
      errorMessage: context.errorMessage || 'Template tidak diizinkan pada host ini.',
      statusCode: context.statusCode || 404,
    };
  }

  if (context.templateCode === 'UNKNOWN_TEMPLATE' || context.error === 'UNKNOWN_TEMPLATE') {
    return {
      status: 'ERROR',
      templateCode: 'UNKNOWN_TEMPLATE',
      subVariant: 'unknown',
      capabilities: context.capabilities,
      error: 'UNKNOWN_TEMPLATE',
      errorMessage: context.errorMessage || `Template code '${context.tenant?.template_code}' tidak terdaftar atau konfigurasi korup.`,
      statusCode: 422,
    };
  }

  const rawBusinessType = String(context.businessType || '').toUpperCase().trim();
  const templateCode = context.templateCode;

  // 2. Strict Business Type Compatibility Boundaries
  // Case A: PUBLIC_SERVICE / B2G business type MUST use PUBLIC_SERVICE_V1
  const isPublicServiceBiz = rawBusinessType === 'PUBLIC_SERVICE' || rawBusinessType === 'B2G';
  if (isPublicServiceBiz && templateCode !== 'PUBLIC_SERVICE_V1') {
    return {
      status: 'ERROR',
      templateCode,
      subVariant: 'unknown',
      capabilities: context.capabilities,
      error: 'TEMPLATE_INCOMPATIBLE',
      errorMessage: `Inkompatibilitas arsitektur: Bisnis berjenis '${context.businessType}' tidak dapat menggunakan template '${templateCode}'. Harap gunakan 'PUBLIC_SERVICE_V1'.`,
      statusCode: 404,
    };
  }

  // Case B: Commerce businesses (RETAIL, FNB, DIGITAL, FIELD_SERVICE, PROFESSIONAL_SERVICE) CANNOT use PUBLIC_SERVICE_V1
  const isCommerceBiz =
    rawBusinessType === 'RETAIL' ||
    rawBusinessType === 'FNB' ||
    rawBusinessType === 'DIGITAL' ||
    rawBusinessType === 'FIELD_SERVICE' ||
    rawBusinessType === 'PROFESSIONAL_SERVICE' ||
    rawBusinessType === 'ECOMMERCE';

  if (isCommerceBiz && templateCode === 'PUBLIC_SERVICE_V1') {
    return {
      status: 'ERROR',
      templateCode,
      subVariant: 'unknown',
      capabilities: context.capabilities,
      error: 'TEMPLATE_INCOMPATIBLE',
      errorMessage: `Inkompatibilitas arsitektur: Bisnis komersial '${context.businessType}' tidak diizinkan menggunakan template 'PUBLIC_SERVICE_V1'.`,
      statusCode: 404,
    };
  }

  // Case C: CORPORATE_V1 compatibility
  if (templateCode === 'CORPORATE_V1' && isPublicServiceBiz) {
    return {
      status: 'ERROR',
      templateCode,
      subVariant: 'unknown',
      capabilities: context.capabilities,
      error: 'TEMPLATE_INCOMPATIBLE',
      errorMessage: `Inkompatibilitas arsitektur: Layanan publik tidak diizinkan menggunakan template 'CORPORATE_V1'.`,
      statusCode: 404,
    };
  }

  // 3. Resolve Sub-Variant for SHOP_V1 / DROP_V1
  let subVariant: 'storefront' | 'personal' | 'microsite' | 'public_service' | 'corporate' | 'unknown' = 'storefront';

  if (templateCode === 'PUBLIC_SERVICE_V1') {
    subVariant = 'public_service';
  } else if (templateCode === 'CORPORATE_V1') {
    subVariant = 'corporate';
  } else if (templateCode === 'SHOP_V1' || templateCode === 'DROP_V1') {
    const rawSub = (
      context.tenant?.metadata?.selected_template ||
      context.tenant?.metadata?.storefront_template ||
      context.tenant?.metadata?.theme?.template ||
      'storefront'
    ).toLowerCase().trim();

    if (rawSub === 'personal') {
      subVariant = 'personal';
    } else if (rawSub === 'microsite') {
      subVariant = 'microsite';
    } else if (
      rawSub === 'storefront' ||
      rawSub === 'default' ||
      rawSub === 'commerce_template' ||
      rawSub === 'commerce' ||
      rawSub === 'clean_commerce' ||
      rawSub === ''
    ) {
      subVariant = 'storefront';
    } else {
      // Unrecognized sub-variant -> Fail-Closed!
      return {
        status: 'ERROR',
        templateCode,
        subVariant: 'unknown',
        capabilities: context.capabilities,
        error: 'CORRUPT_CONFIG',
        errorMessage: `Sub-varian template '${rawSub}' tidak terdaftar atau korup pada katalog storefront.`,
        statusCode: 422,
      };
    }
  }

  return {
    status: 'SUCCESS',
    templateCode,
    subVariant,
    capabilities: context.capabilities,
    statusCode: 200,
  };
}

/**
 * Canonical Storefront Runtime Pipeline (CTO Mandate)
 * Executes the strict pipeline:
 * Host / Slug ➔ Tenant Resolver ➔ TenantRuntimeContext ➔ TemplateResolver ➔ Renderer Result
 * Guarantees that tenant_id is verified from the database and prohibited from re-inference.
 */
export interface CanonicalPipelineResult {
  runtime: TenantRuntimeContext;
  templateResult: ResolvedTemplateResult;
  isReady: boolean;
  error?: string;
}

export function executeStorefrontRuntimePipeline(params: {
  host: string;
  tenantSlug: string;
  tenantRecord: TenantRecord | null;
}): CanonicalPipelineResult {
  const { host, tenantSlug, tenantRecord } = params;

  // 1. If tenantRecord is null, pipeline fails closed (not found)
  if (!tenantRecord) {
    const errorRuntime: TenantRuntimeContext = {
      host,
      tenantSlug,
      tenantKind: 'SAAS',
      businessType: 'RETAIL',
      templateCode: 'UNKNOWN_TEMPLATE',
      capabilities: getTemplateCapabilities('UNKNOWN_TEMPLATE'),
      hardeningPolicy: 'HARDENING_V0',
      tenant: { slug: tenantSlug },
      isAllowedHost: false,
      statusCode: 404,
      error: 'TENANT_NOT_FOUND',
      errorMessage: `Tenant '${tenantSlug}' tidak ditemukan di database.`,
    };
    return {
      runtime: errorRuntime,
      templateResult: {
        status: 'ERROR',
        templateCode: 'UNKNOWN_TEMPLATE',
        subVariant: 'unknown',
        capabilities: errorRuntime.capabilities,
        error: 'UNKNOWN_TEMPLATE',
        errorMessage: errorRuntime.errorMessage,
        statusCode: 404,
      },
      isReady: false,
      error: errorRuntime.errorMessage,
    };
  }

  // 2. Tenant Resolver ➔ TenantRuntimeContext
  const runtime = resolveTenantRuntime({
    host,
    tenant: tenantRecord,
  });

  // 3. TenantRuntimeContext ➔ TemplateResolver (Fail-Closed)
  const templateResult = resolveTemplate(runtime);

  const isReady = runtime.isAllowedHost && templateResult.status === 'SUCCESS';

  return {
    runtime,
    templateResult,
    isReady,
    error: isReady ? undefined : (templateResult.errorMessage || runtime.errorMessage),
  };
}
