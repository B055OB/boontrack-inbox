import { checkTenantMutationPermission } from '@/lib/subscription-guard';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { getBackendApiUrl } from '@/lib/api-config';
import {
  safeJsonStringify,
} from '@/lib/product-catalog';
import { sanitizePublicProduct } from '@/lib/security/public-catalog-sanitizer';
import {
  authorizeMerchantRequest,
  isInternalMachineAuthorized,
} from '@/lib/auth/merchant-session';
import {
  upsertCanonicalProduct,
  deleteCanonicalProduct,
  SAFE_PRODUCT_KEY_RE,
  UUID_RE,
  CanonicalTenantContext,
  CanonicalWriterActor,
} from '@/lib/products/canonical-product-writer';

/**
 * GET /api/v1/tenants/[slug]/products/[id]
 * SQL-First Reader for Single Product (ADR-P0-07)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug: rawSlug, id: productId } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    if (!SAFE_PRODUCT_KEY_RE.test(productId)) {
      return NextResponse.json({ success: false, error: 'INVALID_PRODUCT_IDENTIFIER' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, error: 'SERVICE_UNAVAILABLE' }, { status: 503 });
    }

    const { data: tenant, error: tErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, metadata, category')
      .eq('slug', slug)
      .maybeSingle();

    if (tErr || !tenant) {
      return NextResponse.json({ success: false, error: 'TENANT_NOT_FOUND' }, { status: 404 });
    }

    // ── 1. SQL LOOKUP FIRST (CANONICAL WINNER) ──
    const isTargetUuid = UUID_RE.test(productId);
    let sqlQuery = supabaseAdmin
      .from('products')
      .select('*')
      .eq('tenant_id', tenant.id);

    if (isTargetUuid) {
      sqlQuery = sqlQuery.eq('id', productId);
    } else {
      sqlQuery = sqlQuery.or(`id.eq.${productId},slug.eq.${productId}`);
    }

    const { data: sqlProd } = await sqlQuery.maybeSingle();

    if (sqlProd) {
      return NextResponse.json({
        success: true,
        product: sanitizePublicProduct({
          ...sqlProd,
          name: sqlProd.title || sqlProd.name,
          title: sqlProd.title || sqlProd.name,
          single_page_config: sqlProd.fulfillment_metadata?.single_page_config,
        }),
      });
    }

    // ── 2. METADATA FALLBACK INSPECTION (O-01 Option B) ──
    const metaProducts: any[] = Array.isArray(tenant.metadata?.products)
      ? tenant.metadata.products
      : (tenant.metadata?.product?.name ? [tenant.metadata.product] : []);

    const metaMatch = metaProducts.find(
      (p: any) => String(p.id) === productId || String(p.slug) === productId
    );

    if (metaMatch) {
      // Legacy metadata-only product: mark review required and unpurchasable
      return NextResponse.json({
        success: true,
        product: sanitizePublicProduct({
          ...metaMatch,
          status: 'LEGACY_REVIEW_REQUIRED',
          is_legacy: true,
          is_purchasable: false,
        }),
      });
    }

    return NextResponse.json({
      success: false,
      code: 'PRODUCT_NOT_FOUND',
      error: 'Produk tidak ditemukan.',
    }, { status: 404 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching product';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * Core Product Mutation Handler (PUT / PATCH)
 * Routes directly through Canonical Product Writer
 */
async function handleProductMutation(
  req: NextRequest,
  paramsPromise: Promise<{ slug: string; id: string }>,
  mode: 'PUT' | 'PATCH' = 'PUT'
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

    const perm = await checkTenantMutationPermission(slug);
    if (!perm.allowed && perm.response) {
      return perm.response;
    }

    const rawBody = await req.json();

    const actor: CanonicalWriterActor = {
      actorId,
      actorRole,
      isInternalMachine: isInternalAuth,
    };

    // ── EXECUTE VIA SINGLE AUTHORITATIVE CANONICAL WRITER (ADR-P0-07) ──
    const result = await upsertCanonicalProduct({
      tenant: tenant as CanonicalTenantContext,
      rawInput: {
        ...rawBody,
        id: productId,
      },
      actor,
      req,
      customSupabaseAdmin: supabaseAdmin,
      mode,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          code: result.code === 'CROSS_TENANT_PRODUCT_FORBIDDEN' ? 'FORBIDDEN' : result.code,
          error: result.error,
          message: result.message || result.error,
        },
        { status: result.statusCode }
      );
    }

    const committedProduct = result.product;

    // Forward/Sync to Railway Production Core Backend
    try {
      await fetch(
        getBackendApiUrl(`/api/v1/tenants/${encodeURIComponent(slug)}/products/${encodeURIComponent(productId)}`),
        {
          method: mode,
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': slug,
          },
          body: safeJsonStringify(rawBody),
          cache: 'no-store',
        }
      );
    } catch (railwayErr) {
      console.warn('[Product ID Route] Core backend sync skipped:', railwayErr);
    }

    // Instant Next.js ISR Cache Revalidation
    try {
      revalidatePath(`/${slug}`);
      revalidatePath(`/${slug}/p/[slug]`, 'page');
      revalidatePath('/[tenant]', 'page');
    } catch (revalErr) {
      console.debug('[Product ID Route] Cache revalidation note:', revalErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Produk berhasil diperbarui.',
      product: sanitizePublicProduct(committedProduct),
      projection: result.projection,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating product';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  return handleProductMutation(req, params, 'PUT');
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  return handleProductMutation(req, params, 'PATCH');
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug: rawSlug, id: productId } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

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
      return NextResponse.json({ success: false, error: 'SERVICE_UNAVAILABLE' }, { status: 503 });
    }

    const { data: tenant, error: tErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (tErr || !tenant) {
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

    const actor: CanonicalWriterActor = {
      actorId,
      actorRole,
      isInternalMachine: isInternalAuth,
    };

    const result = await deleteCanonicalProduct({
      tenant: tenant as CanonicalTenantContext,
      productIdOrKey: productId,
      actor,
      req,
      customSupabaseAdmin: supabaseAdmin,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          code: result.code === 'CROSS_TENANT_PRODUCT_FORBIDDEN' ? 'FORBIDDEN' : result.code,
          error: result.error,
          message: result.message || result.error,
        },
        { status: result.statusCode }
      );
    }

    // Forward/Sync DELETE to Railway Production Core Backend
    try {
      await fetch(
        getBackendApiUrl(
          `/api/v1/tenants/${encodeURIComponent(slug)}/products/${encodeURIComponent(productId)}`
        ),
        {
          method: 'DELETE',
          headers: {
            'X-Tenant-ID': slug,
          },
          cache: 'no-store',
        }
      );
    } catch (railwayErr) {
      console.warn('[Product ID Route] Core backend sync skipped:', railwayErr);
    }

    // Instant Next.js ISR Cache Revalidation
    try {
      revalidatePath(`/${slug}`);
      revalidatePath(`/${slug}/p/[slug]`, 'page');
      revalidatePath('/[tenant]', 'page');
    } catch (revalErr) {
      console.debug('[Product ID Route] Cache revalidation note:', revalErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Produk berhasil dihapus dari katalog toko.',
      deletedId: result.deletedId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error deleting product';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
