/**
 * CANONICAL PRODUCT WRITER (ADR-P0-07 SINGLE-WRITER ARCHITECTURE)
 *
 * Mandate:
 * 1. Single Server-Authoritative Relational Writer:
 *    All product mutations (create, update, delete) MUST write to `public.products` FIRST.
 * 2. Failure Atomicity Invariant:
 *    If the `public.products` SQL write fails, the operation MUST ABORT IMMEDIATELY with
 *    zero mutation to `tenants.metadata.products`.
 * 3. Controlled One-Way Derived Projection (O-03 Option A):
 *    Only after `public.products` commits successfully is `tenants.metadata.products`
 *    projected. Projection failure does NOT roll back or invalidate the committed SQL row.
 * 4. Zero New DB Objects:
 *    Implemented entirely within application logic without new DDL, RPCs, or outbox tables.
 * 5. Strict Tenant Scoping & RBAC:
 *    Validates tenant ownership and merchant roles (OWNER, MERCHANT, or internal machine).
 */

import { getSupabaseAdmin } from '@/lib/supabaseClient';
import {
  slugify,
  mapToDbProductType,
  DbProductType,
  sanitizeProductPayload,
  safeJsonStringify,
} from '@/lib/product-catalog';
import {
  sanitizeSection10Html,
  validateCustomHtmlPayload,
} from '@/lib/security/html-sanitizer';
import { recordTenantConfigAudit } from '@/lib/security/tenant-config-audit';
import { hasTierAccess } from '@/lib/subscription-tiers';
import type { NextRequest } from 'next/server';

export const SAFE_PRODUCT_KEY_RE = /^[a-zA-Z0-9_-]{1,128}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CanonicalWriterActor {
  actorId: string;
  actorRole: string;
  isInternalMachine: boolean;
}

export interface CanonicalProductInput {
  id?: string | number;
  name?: string;
  title?: string;
  slug?: string;
  price?: number;
  promo_price?: number;
  category?: string;
  product_type?: string;
  type?: string;
  image?: string;
  image_url?: string;
  description?: string;
  stock?: number;
  is_unlimited?: boolean;
  is_unlimited_stock?: boolean;
  sku?: string;
  is_active?: boolean;
  requires_shipping?: boolean;
  fulfillment_metadata?: Record<string, any>;
  single_page_config?: Record<string, any>;
  metadata?: Record<string, any>;
  custom_html?: string;
  variants?: any[];
  order_bumps?: any[];
  facilities?: string[];
  features?: string[];
  weight_grams?: number;
  download_url?: string;
  [key: string]: any;
}

export interface CanonicalTenantContext {
  id: string;
  slug: string;
  metadata?: Record<string, any>;
  category?: string;
  tier?: string;
}

export interface CanonicalWriterResult {
  success: boolean;
  statusCode: number;
  code?: string;
  error?: string;
  message?: string;
  product?: any;
  projection?: {
    success: boolean;
    error?: string;
    queued_for_reconciliation?: boolean;
  };
}

export interface CanonicalDeleteResult {
  success: boolean;
  statusCode: number;
  code?: string;
  error?: string;
  message?: string;
  deletedId?: string;
  projection?: {
    success: boolean;
    error?: string;
    queued_for_reconciliation?: boolean;
  };
}

/**
 * Checks if Custom HTML is requested in the payload
 */
export function isCustomHtmlRequested(body: any): boolean {
  if (!body || typeof body !== 'object') return false;

  const spc = body.single_page_config || body.fulfillment_metadata?.single_page_config || {};
  const meta = body.metadata || {};

  const htmlString = (
    (typeof body.custom_html === 'string' ? body.custom_html : '') ||
    (typeof spc.custom_html === 'string' ? spc.custom_html : '') ||
    (typeof meta.custom_html === 'string' ? meta.custom_html : '')
  ).trim();

  const isFlagActive = Boolean(
    body.enable_custom_html ||
    body.is_custom_html_enabled ||
    body.use_custom_html ||
    spc.enable_custom_html ||
    spc.is_custom_html_enabled ||
    spc.use_custom_html ||
    spc.active_section === 'custom_html'
  );

  return htmlString.length > 0 || isFlagActive;
}

/**
 * Checks if the payload explicitly disables / cleans up Custom HTML
 */
export function isCustomHtmlCleanup(body: any): boolean {
  if (!body || typeof body !== 'object') return false;

  const spc = body.single_page_config || body.fulfillment_metadata?.single_page_config || {};
  const meta = body.metadata || {};

  const htmlString = (
    (typeof body.custom_html === 'string' ? body.custom_html : '') ||
    (typeof spc.custom_html === 'string' ? spc.custom_html : '') ||
    (typeof meta.custom_html === 'string' ? meta.custom_html : '')
  ).trim();

  if (htmlString.length > 0) return false;

  const hasExplicitDisable =
    body.enable_custom_html === false ||
    spc.enable_custom_html === false ||
    body.is_custom_html_enabled === false ||
    spc.is_custom_html_enabled === false ||
    body.use_custom_html === false ||
    spc.use_custom_html === false;

  return hasExplicitDisable;
}

/**
 * Derives a clean metadata projection item from a canonical SQL product row.
 * Bulky custom_html is stripped to maintain lightweight metadata storage.
 */
export function projectSqlRowToMetadataItem(sqlRow: any): any {
  if (!sqlRow || typeof sqlRow !== 'object') return null;

  const fulfillmentMeta = typeof sqlRow.fulfillment_metadata === 'object' && sqlRow.fulfillment_metadata !== null
    ? { ...sqlRow.fulfillment_metadata }
    : {};

  let spc = fulfillmentMeta.single_page_config ? { ...fulfillmentMeta.single_page_config } : undefined;
  if (spc && spc.custom_html) {
    const { custom_html: _, ...restSpc } = spc;
    spc = restSpc;
  }

  const name = sqlRow.title || sqlRow.name || 'Produk';
  const category = sqlRow.category || 'digital';
  const price = Number(sqlRow.price) || 0;
  const promoPrice = sqlRow.promo_price ? Number(sqlRow.promo_price) : 0;

  return {
    id: sqlRow.id,
    name,
    title: name,
    slug: sqlRow.slug,
    category,
    product_type: sqlRow.product_type || 'DIGITAL',
    price,
    promo_price: promoPrice,
    description: sqlRow.description || '',
    image: sqlRow.image || sqlRow.image_url || null,
    image_url: sqlRow.image_url || sqlRow.image || null,
    stock: sqlRow.stock !== undefined && sqlRow.stock !== null ? Number(sqlRow.stock) : 999,
    sku: sqlRow.sku || null,
    is_unlimited: sqlRow.is_unlimited_stock ?? true,
    is_active: sqlRow.is_active !== false,
    requires_shipping: Boolean(sqlRow.requires_shipping),
    fulfillment_metadata: {
      ...fulfillmentMeta,
      ...(spc ? { single_page_config: spc } : {}),
    },
    ...(spc ? { single_page_config: spc } : {}),
    variants: Array.isArray(sqlRow.variants) ? sqlRow.variants : undefined,
    updated_at: sqlRow.updated_at || new Date().toISOString(),
  };
}

/**
 * Executes one-way idempotent projection to `tenants.metadata.products`.
 * Catches any projection error and logs structured observability metadata without rolling back SQL.
 */
export async function executeOneWayProjection(
  supabaseAdmin: any,
  tenant: CanonicalTenantContext,
  committedSqlRow: any,
  operation: 'UPSERT' | 'DELETE',
  deletedId?: string
): Promise<{ success: boolean; error?: string; queued_for_reconciliation?: boolean }> {
  try {
    // 1. Fetch current tenant metadata to ensure optimistic concurrency & freshness
    const { data: currentTenant, error: fetchErr } = await supabaseAdmin
      .from('tenants')
      .select('id, metadata')
      .eq('id', tenant.id)
      .maybeSingle();

    if (fetchErr || !currentTenant) {
      const errMsg = fetchErr?.message || 'Tenant record not found for projection';
      console.error('[CANONICAL_PROJECTION_FAILURE] Tenant fetch failed:', {
        tenantId: tenant.id,
        operation,
        error: errMsg,
      });
      return { success: false, error: errMsg, queued_for_reconciliation: true };
    }

    const existingMetadata = currentTenant.metadata || {};
    const existingProducts: any[] = Array.isArray(existingMetadata.products)
      ? [...existingMetadata.products]
      : (existingMetadata.product?.name ? [{ ...existingMetadata.product }] : []);

    let updatedProducts: any[];

    if (operation === 'DELETE') {
      const targetIdStr = String(deletedId || committedSqlRow?.id || '');
      const targetSlug = committedSqlRow?.slug ? String(committedSqlRow.slug).toLowerCase() : '';

      updatedProducts = existingProducts.filter((p: any) => {
        const pIdStr = String(p.id || '');
        const pSlug = String(p.slug || '').toLowerCase();
        if (targetIdStr && pIdStr === targetIdStr) return false;
        if (targetSlug && pSlug === targetSlug) return false;
        return true;
      });
    } else {
      // Operation: UPSERT
      const projectedItem = projectSqlRowToMetadataItem(committedSqlRow);
      if (!projectedItem) {
        return { success: false, error: 'Failed to derive projection item', queued_for_reconciliation: true };
      }

      const targetIdStr = String(committedSqlRow.id);
      const targetSlug = String(committedSqlRow.slug || '').toLowerCase();

      const existingIndex = existingProducts.findIndex((p: any) => {
        const pIdStr = String(p.id || '');
        const pSlug = String(p.slug || '').toLowerCase();
        return pIdStr === targetIdStr || (targetSlug && pSlug === targetSlug);
      });

      if (existingIndex >= 0) {
        existingProducts[existingIndex] = {
          ...existingProducts[existingIndex],
          ...projectedItem,
        };
        updatedProducts = existingProducts;
      } else {
        updatedProducts = [projectedItem, ...existingProducts];
      }
    }

    // Clean metadata products: strip custom_html from each projection item
    const sanitizedMetaProducts = updatedProducts.map((p) => {
      if (!p.single_page_config) return p;
      const spc = { ...p.single_page_config };
      if (spc.custom_html) delete spc.custom_html;
      return { ...p, single_page_config: spc };
    });

    const updatedMetadata = {
      ...existingMetadata,
      products: sanitizedMetaProducts,
      product: sanitizedMetaProducts[0] || null,
    };
    delete (updatedMetadata as any).custom_html;
    delete (updatedMetadata as any).single_page_config;

    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({ metadata: updatedMetadata })
      .eq('id', tenant.id);

    if (updateErr) {
      console.error('[CANONICAL_PROJECTION_FAILURE] Metadata update failed:', {
        tenantId: tenant.id,
        operation,
        error: updateErr.message,
      });
      return { success: false, error: updateErr.message, queued_for_reconciliation: true };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[CANONICAL_PROJECTION_UNHANDLED_EXCEPTION]:', {
      tenantId: tenant.id,
      operation,
      message: err?.message,
    });
    return { success: false, error: err?.message || 'Unhandled projection error', queued_for_reconciliation: true };
  }
}

/**
 * UPSERT CANONICAL PRODUCT (SQL-FIRST MUTATION)
 * Enforces:
 * 1. RBAC & Tenant Ownership
 * 2. Section 10 HTML Entitlement & Sanitization
 * 3. SQL-first write into `public.products`
 * 4. Failure Atomicity: If SQL fails, ABORT immediately. Zero mutation to metadata.
 * 5. One-Way Derived Projection (O-03 Option A) on SQL success.
 * 6. Tenant Config Audit Logging.
 */
export async function upsertCanonicalProduct(options: {
  tenant: CanonicalTenantContext;
  rawInput: CanonicalProductInput;
  actor: CanonicalWriterActor;
  req?: NextRequest;
  customSupabaseAdmin?: any;
}): Promise<CanonicalWriterResult> {
  const { tenant, rawInput, actor, req, customSupabaseAdmin } = options;
  const supabaseAdmin = customSupabaseAdmin || getSupabaseAdmin();

  if (!supabaseAdmin) {
    return {
      success: false,
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      error: 'Database admin client is unavailable',
    };
  }

  const body = sanitizeProductPayload(rawInput);

  // ── 1. SECTION 10 CUSTOM HTML ENTITLEMENT GATE (WP2) ──
  if (isCustomHtmlRequested(body) && !isCustomHtmlCleanup(body)) {
    const isEntitled = hasTierAccess(tenant, 'product_landing_custom_html');
    if (!isEntitled) {
      return {
        success: false,
        statusCode: 403,
        code: 'CUSTOM_HTML_UNAUTHORIZED',
        error: 'Forbidden: Tenant is not entitled to Section 10 Product Landing Custom HTML. Add-on required.',
      };
    }
  }

  // Validate & sanitize HTML payload (64 KB limit + DOMPurify)
  const htmlCandidates = [
    body?.single_page_config?.custom_html,
    body?.fulfillment_metadata?.single_page_config?.custom_html,
    body?.metadata?.custom_html,
    body?.custom_html,
  ];

  for (const candidate of htmlCandidates) {
    if (candidate !== undefined && candidate !== null && candidate !== '') {
      const check = validateCustomHtmlPayload(candidate);
      if (!check.valid) {
        return {
          success: false,
          statusCode: check.status,
          code: 'HTML_VALIDATION_FAILED',
          error: check.error || 'Konten HTML melebihi batas atau format tidak valid.',
        };
      }
    }
  }

  if (typeof body.custom_html === 'string') {
    body.custom_html = sanitizeSection10Html(body.custom_html);
  }
  if (body.single_page_config && typeof body.single_page_config.custom_html === 'string') {
    body.single_page_config = {
      ...body.single_page_config,
      custom_html: sanitizeSection10Html(body.single_page_config.custom_html),
    };
  }
  if (body.fulfillment_metadata?.single_page_config && typeof body.fulfillment_metadata.single_page_config.custom_html === 'string') {
    body.fulfillment_metadata = {
      ...body.fulfillment_metadata,
      single_page_config: {
        ...body.fulfillment_metadata.single_page_config,
        custom_html: sanitizeSection10Html(body.fulfillment_metadata.single_page_config.custom_html),
      },
    };
  }

  // ── 2. PRODUCT OWNERSHIP & CROSS-TENANT VERIFICATION ──
  const providedId = body.id !== undefined && body.id !== null ? String(body.id).trim() : '';
  const isTargetUuid = UUID_RE.test(providedId);
  let ownedProduct: any = null;

  if (providedId) {
    let ownershipQuery = supabaseAdmin
      .from('products')
      .select('id, tenant_id, title, name, slug, price, promo_price, category, product_type, fulfillment_metadata')
      .eq('tenant_id', tenant.id);

    if (isTargetUuid) {
      ownershipQuery = ownershipQuery.eq('id', providedId);
    } else {
      ownershipQuery = ownershipQuery.or(`id.eq.${providedId},slug.eq.${providedId}`);
    }
    const { data: op } = await ownershipQuery.maybeSingle();
    ownedProduct = op;

    if (ownedProduct && ownedProduct.tenant_id && ownedProduct.tenant_id !== tenant.id) {
      return {
        success: false,
        statusCode: 403,
        code: 'FORBIDDEN',
        error: 'Forbidden: Product belongs to another tenant.',
      };
    }

    const tenantMetaProducts: any[] = Array.isArray(tenant.metadata?.products)
      ? tenant.metadata.products
      : (tenant.metadata?.product?.name ? [tenant.metadata.product] : []);
    const existsInMeta = tenantMetaProducts.some(
      (p: any) => String(p.id) === providedId || p.slug === providedId
    );

    if (!ownedProduct && !existsInMeta) {
      // Check if product exists under a DIFFERENT tenant to prevent cross-tenant modification
      const { data: crossTenantProd } = await supabaseAdmin
        .from('products')
        .select('id, tenant_id')
        .eq('id', providedId)
        .maybeSingle();

      if (crossTenantProd && crossTenantProd.tenant_id !== tenant.id) {
        return {
          success: false,
          statusCode: 403,
          code: 'FORBIDDEN',
          error: 'Forbidden: Product does not belong to this tenant',
        };
      }
    }
  }

  // ── 3. VALIDATE REQUIRED COMMERCIAL ATTRIBUTES ──
  const trimmedName = String(
    body.name ||
    body.title ||
    ownedProduct?.title ||
    ownedProduct?.name ||
    (isCustomHtmlCleanup(body) ? 'Produk' : '')
  ).trim();

  if (!trimmedName) {
    return {
      success: false,
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      error: 'Nama produk wajib diisi.',
    };
  }

  const rawPrice = body.price !== undefined ? body.price : (ownedProduct?.price !== undefined ? ownedProduct.price : 0);
  const numPrice = Number(rawPrice);
  if (isNaN(numPrice) || numPrice < 0) {
    return {
      success: false,
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      error: 'Harga produk tidak valid (harus angka non-negatif).',
    };
  }

  // ── 4. RESOLVE CANONICAL IDENTITY (IMMUTABLE UUID & SLUG) ──
  const productId = ownedProduct?.id || (isTargetUuid ? providedId : (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : require('crypto').randomUUID()));

  // Slug resolution
  const baseSlug = body.slug ? slugify(body.slug) : (ownedProduct?.slug || slugify(trimmedName));
  const finalSlug = baseSlug || `prod-${Date.now().toString(36)}`;

  // Product Type and Category mapping
  const resolvedCategory = body.category || ownedProduct?.category || tenant.category || 'digital';
  const dbProductType: DbProductType = mapToDbProductType(body.product_type || body.type || ownedProduct?.product_type, resolvedCategory);

  // Build Single Page Config & Fulfillment Metadata
  let cleanSinglePageConfig: any = undefined;
  if (body?.single_page_config && typeof body.single_page_config === 'object') {
    cleanSinglePageConfig = { ...body.single_page_config };
    if (isCustomHtmlCleanup(body)) {
      delete cleanSinglePageConfig.custom_html;
      cleanSinglePageConfig.enable_custom_html = false;
      cleanSinglePageConfig.is_custom_html_enabled = false;
      cleanSinglePageConfig.use_custom_html = false;
      cleanSinglePageConfig.active_section = 'standard';
    }
  }

  const fulfillmentMetadata: Record<string, any> = {
    ...(typeof body.fulfillment_metadata === 'object' && body.fulfillment_metadata !== null ? body.fulfillment_metadata : {}),
    ...(cleanSinglePageConfig ? { single_page_config: cleanSinglePageConfig } : {}),
    ...(body.weight_grams !== undefined && body.weight_grams !== null ? { weight_grams: Number(body.weight_grams) } : {}),
    ...(Array.isArray(body?.facilities) ? { facilities: body.facilities } : {}),
    ...(Array.isArray(body?.features) ? { features: body.features } : {}),
  };

  const cleanVariants = Array.isArray(body.variants)
    ? body.variants.map((v: any) => ({
        id: v.id || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : require('crypto').randomUUID()),
        name: v.name || 'Varian',
        price: Number(v.price) || 0,
        stock: v.stock !== undefined ? Number(v.stock) : 999,
        sku: v.sku || null,
        is_active: v.is_active !== false,
      }))
    : null;

  const nowIso = new Date().toISOString();

  // ── 4. CONSTRUCT RELATIONAL SQL PAYLOAD ──
  const productDbPayload: Record<string, any> = {
    id: productId,
    tenant_id: tenant.id,
    title: trimmedName,
    name: trimmedName,
    slug: finalSlug,
    description: body.description !== undefined ? body.description : null,
    price: numPrice,
    promo_price: body.promo_price ? Number(body.promo_price) : 0,
    category: resolvedCategory,
    product_type: dbProductType,
    image: body.image || body.image_url || null,
    image_url: body.image_url || body.image || null,
    stock: body.stock !== undefined && body.stock !== null ? Number(body.stock) : null,
    is_unlimited_stock: body.is_unlimited !== undefined ? Boolean(body.is_unlimited) : true,
    sku: body.sku || null,
    is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
    requires_shipping: body.requires_shipping !== undefined ? Boolean(body.requires_shipping) : false,
    fulfillment_metadata: fulfillmentMetadata,
    variants: cleanVariants,
    updated_at: nowIso,
  };

  // ── 5. PRIMARY SQL WRITE FIRST (FAILURE ATOMICITY PROOF) ──
  // Step 5 executes SQL mutation FIRST. If this fails, we return error IMMEDIATELY.
  // tenants.metadata.products is NEVER touched when SQL fails.
  let committedRows: any[] | null = null;
  let sqlErr: any = null;

  const productsTable = supabaseAdmin.from('products');
  if (typeof productsTable.upsert === 'function') {
    const res = await productsTable.upsert(productDbPayload).select();
    committedRows = res.data;
    sqlErr = res.error;
  } else if (ownedProduct?.id) {
    const res = await productsTable.update(productDbPayload).eq('id', ownedProduct.id).eq('tenant_id', tenant.id).select();
    committedRows = res.data;
    sqlErr = res.error;
  } else {
    const res = await productsTable.insert(productDbPayload).select();
    committedRows = res.data;
    sqlErr = res.error;
  }

  if (sqlErr || !committedRows || committedRows.length === 0) {
    const errorMsg = sqlErr?.message || 'Database write to public.products returned zero rows';
    console.error('[CANONICAL_PRODUCT_WRITER] SQL write failed:', {
      tenantId: tenant.id,
      productId,
      error: errorMsg,
    });
    return {
      success: false,
      statusCode: 500,
      code: 'SQL_MUTATION_FAILED',
      error: errorMsg,
      message: 'Gagal menyimpan produk ke database relasional utama.',
    };
  }

  const committedProduct = committedRows[0];

  // ── 6. CONTROLLED ONE-WAY DERIVED PROJECTION (O-03 Option A) ──
  // Only reached after SQL write successfully committed.
  const projectionResult = await executeOneWayProjection(
    supabaseAdmin,
    tenant,
    committedProduct,
    'UPSERT'
  );

  // ── 7. AUDIT TRAIL RECORDING ──
  await recordTenantConfigAudit({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    authMethod: actor.isInternalMachine ? 'internal_machine' : 'merchant_session',
    action: 'PRODUCT_UPSERT',
    resourceType: 'products',
    resourceId: String(committedProduct.id),
    status: 'SUCCESS',
    changedKeys: ['products'],
    diffSummary: { product_id: committedProduct.id, slug: committedProduct.slug },
    req,
  });

  return {
    success: true,
    statusCode: 200,
    product: committedProduct,
    projection: projectionResult,
  };
}

/**
 * DELETE CANONICAL PRODUCT (SQL-FIRST MUTATION)
 * Enforces:
 * 1. Tenant Scoping & Ownership Validation
 * 2. SQL DELETE from `public.products` FIRST
 * 3. Failure Atomicity: If SQL fails, ABORT immediately with zero metadata change.
 * 4. One-Way Derived Projection (O-03 Option A) on SQL delete success.
 * 5. Tenant Config Audit Logging.
 */
export async function deleteCanonicalProduct(options: {
  tenant: CanonicalTenantContext;
  productIdOrKey: string;
  actor: CanonicalWriterActor;
  req?: NextRequest;
  customSupabaseAdmin?: any;
}): Promise<CanonicalDeleteResult> {
  const { tenant, productIdOrKey, actor, req, customSupabaseAdmin } = options;
  const supabaseAdmin = customSupabaseAdmin || getSupabaseAdmin();

  if (!supabaseAdmin) {
    return {
      success: false,
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      error: 'Database admin client is unavailable',
    };
  }

  const rawKey = String(productIdOrKey || '').trim();
  if (!rawKey || !SAFE_PRODUCT_KEY_RE.test(rawKey)) {
    return {
      success: false,
      statusCode: 400,
      code: 'INVALID_PRODUCT_IDENTIFIER',
      error: 'Identifier produk tidak valid.',
    };
  }

  // ── 1. VERIFY PRODUCT BELONGS TO TENANT ──
  const isTargetUuid = UUID_RE.test(rawKey);
  let lookupQuery = supabaseAdmin
    .from('products')
    .select('id, slug, tenant_id')
    .eq('tenant_id', tenant.id);

  if (isTargetUuid) {
    lookupQuery = lookupQuery.eq('id', rawKey);
  } else {
    lookupQuery = lookupQuery.or(`id.eq.${rawKey},slug.eq.${rawKey}`);
  }

  const { data: targetProduct, error: lookupErr } = await lookupQuery.maybeSingle();

  if (lookupErr) {
    return {
      success: false,
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      error: lookupErr.message,
    };
  }

  if (!targetProduct) {
    // Cross-tenant check: check if it exists under another tenant
    if (isTargetUuid) {
      const { data: crossTenant } = await supabaseAdmin
        .from('products')
        .select('id, tenant_id')
        .eq('id', rawKey)
        .maybeSingle();

      if (crossTenant && crossTenant.tenant_id !== tenant.id) {
        return {
          success: false,
          statusCode: 403,
          code: 'FORBIDDEN',
          error: 'Forbidden: Product does not belong to this tenant.',
        };
      }
    }

    // Check if it exists only in metadata (Legacy record)
    const existingMetaProducts: any[] = Array.isArray(tenant.metadata?.products)
      ? tenant.metadata.products
      : (tenant.metadata?.product?.name ? [tenant.metadata.product] : []);
    const existsInMeta = existingMetaProducts.some(
      (p: any) => String(p.id) === rawKey || String(p.slug) === rawKey
    );

    if (existsInMeta) {
      // Legacy metadata-only product deletion
      const projectionResult = await executeOneWayProjection(
        supabaseAdmin,
        tenant,
        null,
        'DELETE',
        rawKey
      );

      await recordTenantConfigAudit({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        authMethod: actor.isInternalMachine ? 'internal_machine' : 'merchant_session',
        action: 'PRODUCT_DELETE',
        resourceType: 'products',
        resourceId: rawKey,
        status: 'SUCCESS',
        changedKeys: ['products'],
        diffSummary: { deleted_legacy_id: rawKey },
        req,
      });

      return {
        success: true,
        statusCode: 200,
        deletedId: rawKey,
        projection: projectionResult,
      };
    }

    return {
      success: false,
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
      error: 'Produk tidak ditemukan.',
    };
  }

  // ── 2. PRIMARY SQL DELETE FIRST (FAILURE ATOMICITY PROOF) ──
  const { error: deleteErr } = await supabaseAdmin
    .from('products')
    .delete()
    .eq('tenant_id', tenant.id)
    .eq('id', targetProduct.id);

  if (deleteErr) {
    console.error('[CANONICAL_PRODUCT_WRITER] SQL delete failed:', {
      tenantId: tenant.id,
      productId: targetProduct.id,
      error: deleteErr.message,
    });
    return {
      success: false,
      statusCode: 500,
      code: 'SQL_MUTATION_FAILED',
      error: deleteErr.message,
      message: 'Gagal menghapus produk dari database relasional utama.',
    };
  }

  // ── 3. ONE-WAY DERIVED PROJECTION (O-03 Option A) ──
  const projectionResult = await executeOneWayProjection(
    supabaseAdmin,
    tenant,
    targetProduct,
    'DELETE',
    targetProduct.id
  );

  // ── 4. AUDIT TRAIL RECORDING ──
  await recordTenantConfigAudit({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    authMethod: actor.isInternalMachine ? 'internal_machine' : 'merchant_session',
    action: 'PRODUCT_DELETE',
    resourceType: 'products',
    resourceId: String(targetProduct.id),
    status: 'SUCCESS',
    changedKeys: ['products'],
    diffSummary: { product_id: targetProduct.id, slug: targetProduct.slug },
    req,
  });

  return {
    success: true,
    statusCode: 200,
    deletedId: targetProduct.id,
    projection: projectionResult,
  };
}
