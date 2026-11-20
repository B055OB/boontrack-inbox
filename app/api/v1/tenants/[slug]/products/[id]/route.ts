import { checkTenantMutationPermission } from '@/lib/subscription-guard';
import { hasTierAccess } from '@/lib/subscription-tiers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import {
  slugify,
  mapToDbProductType,
  sanitizeProductPayload,
} from '@/lib/product-catalog';
import { sanitizePublicProduct } from '@/lib/security/public-catalog-sanitizer';
import {
  authorizeMerchantRequest,
  isInternalMachineAuthorized,
} from '@/lib/auth/merchant-session';
import {
  sanitizeSection10Html,
  validateCustomHtmlPayload,
} from '@/lib/security/html-sanitizer';
import { recordTenantConfigAudit } from '@/lib/security/tenant-config-audit';

const SAFE_PRODUCT_KEY_RE = /^[a-zA-Z0-9._-]+$/;

function isCustomHtmlRequested(body: any): boolean {
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

function isCustomHtmlCleanup(body: any): boolean {
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

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug: rawSlug, id: productId } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: 'Database admin client is unavailable' },
        { status: 503 }
      );
    }

    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (tenantErr) {
      return NextResponse.json({ success: false, error: 'SERVICE_UNAVAILABLE' }, { status: 503 });
    }

    if (!tenant) {
      return NextResponse.json({ success: false, error: 'TENANT_NOT_FOUND' }, { status: 404 });
    }

    const { data: product, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('tenant_id', tenant.id)
      .maybeSingle();

    if (error || !product) {
      // Check in metadata.products as fallback
      const metaProds = Array.isArray(tenant.metadata?.products) ? tenant.metadata.products : [];
      const match = metaProds.find((p: any) => String(p.id) === String(productId) || p.slug === String(productId));
      if (match) {
        return NextResponse.json({ success: true, product: sanitizePublicProduct(match) });
      }
      return NextResponse.json({ success: false, error: 'PRODUCT_NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({ success: true, product: sanitizePublicProduct(product) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching product';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  return handleProductMutation(req, params);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  return handleProductMutation(req, params);
}

async function handleProductMutation(
  req: NextRequest,
  paramsPromise: Promise<{ slug: string; id: string }>
) {
  try {
    const { slug: rawSlug, id: productId } = await paramsPromise;
    const slug = normalizeTenantSlug(rawSlug || '');

    // ── AUTH GUARD & RBAC (P0 SECURITY MANDATE) ──
    const isInternalAuth = isInternalMachineAuthorized(req);
    let actorId = 'INTERNAL_MACHINE';
    let actorRole = 'INTERNAL_SERVICE';
    if (!isInternalAuth) {
      const authResult = authorizeMerchantRequest(req, slug, ['OWNER', 'MERCHANT']);
      if (!authResult.authorized) {
        return authResult.response;
      }
      actorId = authResult.payload.userId || authResult.payload.name || 'merchant';
      actorRole = authResult.payload.role || 'MERCHANT';
    }

    if (!SAFE_PRODUCT_KEY_RE.test(productId)) {
      return NextResponse.json({ success: false, error: 'INVALID_PRODUCT_IDENTIFIER' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: 'Database admin client is unavailable' },
        { status: 503 }
      );
    }

    // 1. Resolve Tenant with Service Role Key
    const { data: tenant, error: tErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, metadata, category, tier')
      .eq('slug', slug)
      .maybeSingle();

    if (tErr) {
      return NextResponse.json({ success: false, error: 'SERVICE_UNAVAILABLE', message: tErr.message }, { status: 503 });
    }

    if (!tenant) {
      return NextResponse.json({ success: false, error: 'TENANT_NOT_FOUND' }, { status: 404 });
    }

    if (!isInternalAuth) {
      const canonicalCheck = authorizeMerchantRequest(
        req,
        slug,
        ['OWNER', 'MERCHANT'],
        { id: tenant.id, slug: tenant.slug }
      );
      if (!canonicalCheck.authorized) {
        return canonicalCheck.response;
      }
    }

    // Product Ownership & Cross-Tenant Access Verification
    const isTargetUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId);
    let ownershipQuery = supabaseAdmin
      .from('products')
      .select('id, tenant_id, fulfillment_metadata')
      .eq('tenant_id', tenant.id);

    if (isTargetUuid) {
      ownershipQuery = ownershipQuery.eq('id', productId);
    } else {
      ownershipQuery = ownershipQuery.or(`id.eq.${productId},slug.eq.${productId}`);
    }
    const { data: ownedProduct } = await ownershipQuery.maybeSingle();

    const tenantMetaProducts: any[] = Array.isArray(tenant.metadata?.products)
      ? tenant.metadata.products
      : (tenant.metadata?.product?.name ? [tenant.metadata.product] : []);
    const existsInMeta = tenantMetaProducts.some(
      (p: any) => String(p.id) === String(productId) || p.slug === String(productId)
    );

    if (!ownedProduct && !existsInMeta) {
      // Check if product exists under a DIFFERENT tenant to prevent cross-tenant modification
      const { data: crossTenantProd } = await supabaseAdmin
        .from('products')
        .select('id, tenant_id')
        .eq('id', productId)
        .maybeSingle();

      if (crossTenantProd && crossTenantProd.tenant_id !== tenant.id) {
        return NextResponse.json(
          {
            success: false,
            code: 'FORBIDDEN',
            error: 'Forbidden: Product does not belong to this tenant',
          },
          { status: 403 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          code: 'PRODUCT_NOT_FOUND',
          error: 'Produk tidak ditemukan.',
        },
        { status: 404 }
      );
    }

    const perm = await checkTenantMutationPermission(slug);
    if (!perm.allowed && perm.response) {
      return perm.response;
    }

    const rawBody = await req.json();
    const body = sanitizeProductPayload(rawBody);

    // ── SECTION 10 CUSTOM HTML ENTITLEMENT GATE (WP2) ──
    if (isCustomHtmlRequested(body) && !isCustomHtmlCleanup(body)) {
      const isEntitled = hasTierAccess(tenant, 'product_landing_custom_html');
      if (!isEntitled) {
        return NextResponse.json(
          {
            success: false,
            code: 'CUSTOM_HTML_UNAUTHORIZED',
            error: 'Forbidden: Tenant is not entitled to Section 10 Product Landing Custom HTML. Add-on required.',
          },
          { status: 403 }
        );
      }
    }

    // Validate & sanitize any custom HTML payload (64 KB max + DOMPurify)
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
          return NextResponse.json(
            {
              success: false,
              error: check.error || 'HTML_VALIDATION_FAILED',
              message: `Konten HTML produk melebihi batas ukuran atau format tidak valid (${check.byteLength ?? 0} bytes).`,
            },
            { status: check.status }
          );
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
    if (body.metadata && typeof body.metadata.custom_html === 'string') {
      body.metadata = {
        ...body.metadata,
        custom_html: sanitizeSection10Html(body.metadata.custom_html),
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

    // 2. Prepare relational SQL product payload
    const finalSlug = body.slug ? slugify(body.slug) : (body.name || body.title ? slugify(body.name || body.title) : undefined);
    const resolvedCategory = body.category || tenant.category || 'digital';
    const dbProductType = mapToDbProductType(body.product_type || body.type, resolvedCategory);

    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name || body.title) {
      payload.title = String(body.name || body.title).trim();
      payload.name = payload.title;
    }
    if (finalSlug) payload.slug = finalSlug;
    if (body.description !== undefined) payload.description = body.description;
    if (body.price !== undefined) payload.price = Number(body.price) || 0;
    if (body.promo_price !== undefined) {
      payload.promo_price = body.promo_price ? Number(body.promo_price) : 0;
    }
    if (body.image || body.image_url) {
      payload.image = body.image || body.image_url;
      payload.image_url = payload.image;
    }
    if (body.category) payload.category = body.category;
    if (body.stock !== undefined) payload.stock = Number(body.stock);
    if (body.is_unlimited !== undefined) payload.is_unlimited_stock = Boolean(body.is_unlimited);
    if (body.sku) payload.sku = body.sku;
    if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);
    if (body.product_type) payload.product_type = dbProductType;
    if (body.requires_shipping !== undefined) payload.requires_shipping = Boolean(body.requires_shipping);
    if (body.fulfillment_metadata || body.single_page_config) {
      payload.fulfillment_metadata = {
        ...(typeof body.fulfillment_metadata === 'object' && body.fulfillment_metadata !== null ? body.fulfillment_metadata : {}),
        ...(body.single_page_config ? { single_page_config: body.single_page_config } : {}),
      };
    }

    // 3. Update products table with Strict Affected Rows Validation
    // Support lookup by UUID id, or fallback to matching slug
    let updateQuery = supabaseAdmin
      .from('products')
      .update(payload)
      .eq('tenant_id', tenant.id);

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId);
    if (isUuid) {
      updateQuery = updateQuery.eq('id', productId);
    } else {
      updateQuery = updateQuery.or(`id.eq.${productId},slug.eq.${productId}`);
    }

    const { data, error, count } = await updateQuery.select();

    if (error || !data || data.length === 0) {
      console.error('[Product ID Route] Update failed or 0 rows affected:', error, { productId, tenantId: tenant.id });
      return NextResponse.json(
        { success: false, error: 'UPDATE_FAILED_OR_ZERO_ROWS_AFFECTED' },
        { status: 400 }
      );
    }

    const updatedRow = data[0];

    // 4. Synchronize change to tenants.metadata.products (Single Source of Truth)
    const existingMetaProducts: any[] = Array.isArray(tenant.metadata?.products)
      ? tenant.metadata.products
      : (tenant.metadata?.product?.name ? [tenant.metadata.product] : []);

    let foundInMeta = false;
    const syncedMetaProducts = existingMetaProducts.map((p: any) => {
      const match = String(p.id) === String(productId) ||
        (isUuid && String(p.id) === String(updatedRow.id)) ||
        (p.slug && (p.slug === productId || p.slug === updatedRow.slug));
      if (match) {
        foundInMeta = true;
        return {
          ...p,
          ...body,
          id: updatedRow.id,
          name: updatedRow.title || updatedRow.name || p.name,
          title: updatedRow.title || updatedRow.name || p.title,
          slug: updatedRow.slug || p.slug,
          price: updatedRow.price,
          promo_price: updatedRow.promo_price,
          description: updatedRow.description !== undefined ? updatedRow.description : p.description,
          image: updatedRow.image || p.image,
          image_url: updatedRow.image_url || p.image_url,
          is_active: updatedRow.is_active !== undefined ? updatedRow.is_active : p.is_active,
        };
      }
      return p;
    });

    if (!foundInMeta) {
      syncedMetaProducts.unshift({
        id: updatedRow.id,
        name: updatedRow.title || updatedRow.name,
        slug: updatedRow.slug,
        price: updatedRow.price,
        promo_price: updatedRow.promo_price,
        description: updatedRow.description,
        image: updatedRow.image,
        category: updatedRow.category,
        is_active: updatedRow.is_active,
      });
    }

    // ADR-P0-07: Strip bulky custom_html from tenant metadata projection
    // Relational public.products.fulfillment_metadata.single_page_config is the single source of truth
    const cleanSyncedMetaProducts = syncedMetaProducts.map((p: any) => {
      if (!p.single_page_config) return p;
      const spc = { ...p.single_page_config };
      if (spc.custom_html) {
        delete spc.custom_html;
      }
      return {
        ...p,
        single_page_config: spc,
      };
    });

    const updatedMetadata = {
      ...(tenant.metadata || {}),
      products: cleanSyncedMetaProducts,
      product: cleanSyncedMetaProducts[0] || null,
    };
    delete (updatedMetadata as any).custom_html;
    delete (updatedMetadata as any).single_page_config;

    const { error: metaUpdateErr } = await supabaseAdmin
      .from('tenants')
      .update({ metadata: updatedMetadata })
      .eq('id', tenant.id);

    if (metaUpdateErr) {
      console.warn('[Product ID Route] Non-fatal metadata sync warning:', metaUpdateErr);
    }

    await recordTenantConfigAudit({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      actorId,
      actorRole,
      authMethod: isInternalAuth ? 'internal_machine' : 'merchant_session',
      action: 'PRODUCT_UPDATE',
      resourceType: 'products',
      resourceId: String(updatedRow.id),
      status: 'SUCCESS',
      changedKeys: Object.keys(body),
      diffSummary: { product_id: updatedRow.id, slug: updatedRow.slug },
      req,
    });

    try {
      revalidatePath(`/${slug}`);
      revalidatePath(`/${slug}/p/[slug]`);
      if (updatedRow.slug) {
        revalidatePath(`/${slug}/p/${updatedRow.slug}`);
      }
      revalidatePath(`/${slug}/p/${productId}`);
      revalidatePath(`/[tenant]`);
      revalidatePath(`/shop/${slug}`);
    } catch (revalErr) {
      console.warn('[Product ID Route] Non-fatal ISR revalidatePath warning:', revalErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Produk berhasil diperbarui.',
      product: updatedRow,
      count: count ?? data.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating product';
    console.error('[Product ID Route] Fatal exception:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug: rawSlug, id: productId } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    // ── AUTH GUARD & RBAC (P0 SECURITY MANDATE) ──
    const isInternalAuth = isInternalMachineAuthorized(req);
    let actorId = 'INTERNAL_MACHINE';
    let actorRole = 'INTERNAL_SERVICE';
    if (!isInternalAuth) {
      const authResult = authorizeMerchantRequest(req, slug, ['OWNER', 'MERCHANT']);
      if (!authResult.authorized) {
        return authResult.response;
      }
      actorId = authResult.payload.userId || authResult.payload.name || 'merchant';
      actorRole = authResult.payload.role || 'MERCHANT';
    }

    if (!SAFE_PRODUCT_KEY_RE.test(productId)) {
      return NextResponse.json({ success: false, error: 'INVALID_PRODUCT_IDENTIFIER' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: 'Database admin client is unavailable' },
        { status: 503 }
      );
    }

    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (tenantErr) {
      return NextResponse.json({ success: false, error: 'SERVICE_UNAVAILABLE' }, { status: 503 });
    }

    if (!tenant) {
      return NextResponse.json({ success: false, error: 'TENANT_NOT_FOUND' }, { status: 404 });
    }

    if (!isInternalAuth) {
      const canonicalCheck = authorizeMerchantRequest(
        req,
        slug,
        ['OWNER', 'MERCHANT'],
        { id: tenant.id, slug: tenant.slug }
      );
      if (!canonicalCheck.authorized) {
        return canonicalCheck.response;
      }
    }

    const perm = await checkTenantMutationPermission(slug);
    if (!perm.allowed && perm.response) {
      return perm.response;
    }

    // Delete from SQL products table
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId);
    let delQuery = supabaseAdmin
      .from('products')
      .delete()
      .eq('tenant_id', tenant.id);

    if (isUuid) {
      delQuery = delQuery.eq('id', productId);
    } else {
      delQuery = delQuery.or(`id.eq.${productId},slug.eq.${productId}`);
    }

    await delQuery;

    // Delete from metadata.products
    const existingMetaProducts = Array.isArray(tenant.metadata?.products) ? tenant.metadata.products : [];
    const remaining = existingMetaProducts.filter((p: any) => String(p.id) !== String(productId) && p.slug !== String(productId));

    await supabaseAdmin
      .from('tenants')
      .update({
        metadata: {
          ...(tenant.metadata || {}),
          products: remaining,
          product: remaining[0] || null,
        },
      })
      .eq('id', tenant.id);

    await recordTenantConfigAudit({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      actorId,
      actorRole,
      authMethod: isInternalAuth ? 'internal_machine' : 'merchant_session',
      action: 'PRODUCT_DELETE',
      resourceType: 'products',
      resourceId: productId,
      status: 'SUCCESS',
      changedKeys: ['products'],
      diffSummary: { product_id: productId },
      req,
    });

    try {
      revalidatePath(`/${slug}`);
      revalidatePath(`/${slug}/p/[slug]`);
      revalidatePath(`/${slug}/p/${productId}`);
      revalidatePath(`/[tenant]`);
      revalidatePath(`/shop/${slug}`);
    } catch (revalErr) {
      console.warn('[Product ID Route] Non-fatal ISR revalidatePath warning in DELETE:', revalErr);
    }

    return NextResponse.json({ success: true, message: 'Produk berhasil dihapus.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error deleting product';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
