import { checkTenantMutationPermission } from '@/lib/subscription-guard';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSupabase, getSupabaseAdmin } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { getBackendApiUrl } from '@/lib/api-config';
import {
  slugify,
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
  CanonicalTenantContext,
  CanonicalWriterActor,
} from '@/lib/products/canonical-product-writer';

export interface ProductItem {
  id: string | number;
  name: string;
  title?: string;
  slug?: string;
  is_active?: boolean;
  category: 'ebook' | 'course' | 'template' | 'physical' | 'membership' | string;
  price: number;
  promo_price?: number;
  variants?: string;
  promo?: string;
  description?: string;
  download_url?: string | null;
  image?: string;
  image_url?: string;
  stock?: number;
  sku?: string;
  is_unlimited?: boolean;
  type?: 'digital' | 'physical' | 'service' | 'fnb' | string;
  product_type?: string;
  custom_badge?: string;
  weight_grams?: number;
  requires_shipping?: boolean;
  status?: string;
  is_legacy?: boolean;
  is_purchasable?: boolean;
  fulfillment_metadata?: any;
  single_page_config?: any;
  order_bumps?: any;
  metadata?: any;
  created_at?: string;
  updated_at?: string;
}

/**
 * POST /api/v1/tenants/[slug]/products
 * Canonical Single-Writer Entrypoint (ADR-P0-07)
 * Writes to public.products SQL FIRST with fail-closed zero mutation to metadata on error.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
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

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: 'Database admin client is unavailable' },
        { status: 503 }
      );
    }

    const { data: canonicalTenant, error: canonicalErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, metadata, category, tier')
      .eq('slug', slug)
      .maybeSingle();

    if (canonicalErr) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: canonicalErr.message },
        { status: 503 }
      );
    }

    if (!canonicalTenant) {
      return NextResponse.json(
        { success: false, error: 'TENANT_NOT_FOUND', message: 'Tenant tidak ditemukan.' },
        { status: 404 }
      );
    }

    if (!isInternalAuth) {
      const canonicalCheck =  authorizeMerchantRequest(
        req,
        slug,
        ['OWNER', 'MERCHANT'],
        { id: canonicalTenant.id, slug: canonicalTenant.slug }
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
      tenant: canonicalTenant as CanonicalTenantContext,
      rawInput: rawBody,
      actor,
      req,
      customSupabaseAdmin: supabaseAdmin,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          code: result.code,
          error: result.error,
          message: result.message || result.error,
        },
        { status: result.statusCode }
      );
    }

    const committedProduct = result.product;

    // Forward/Sync to Railway Production Core Backend (Non-blocking)
    try {
      await fetch(
        getBackendApiUrl(`/api/v1/tenants/${encodeURIComponent(slug)}/products`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': slug,
          },
          body: safeJsonStringify(rawBody),
          cache: 'no-store',
        }
      );
    } catch (railwayErr) {
      console.warn('[Products Route] Core backend sync skipped:', railwayErr);
    }

    // Instant Next.js ISR Cache Revalidation for Storefront & Product Pages
    try {
      revalidatePath(`/${slug}`);
      revalidatePath(`/${slug}`, 'page');
      revalidatePath(`/${slug}`, 'layout');
      revalidatePath(`/${slug}/p/[slug]`, 'page');
      revalidatePath('/[tenant]', 'page');
      revalidatePath('/[tenant]', 'layout');
    } catch (revalErr) {
      console.debug('[Products Route] Cache revalidation note:', revalErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Produk berhasil disimpan ke katalog toko.',
      product: sanitizePublicProduct(committedProduct),
      projection: result.projection,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error saving product';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/tenants/[slug]/products
 * Canonical Single-Writer Delete (ADR-P0-07)
 * Executes SQL DELETE from public.products FIRST.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
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

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'SERVICE_UNAVAILABLE', message: 'Database admin client is unavailable' },
        { status: 503 }
      );
    }

    const { data: canonicalTenant, error: canonicalErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (canonicalErr) {
      return NextResponse.json({ success: false, error: 'SERVICE_UNAVAILABLE' }, { status: 503 });
    }

    if (!canonicalTenant) {
      return NextResponse.json({ success: false, error: 'TENANT_NOT_FOUND' }, { status: 404 });
    }

    if (!isInternalAuth) {
      const canonicalCheck = authorizeMerchantRequest(
        req,
        slug,
        ['OWNER', 'MERCHANT'],
        { id: canonicalTenant.id, slug: canonicalTenant.slug }
      );
      if (!canonicalCheck.authorized) {
        return canonicalCheck.response;
      }
    }

    const perm = await checkTenantMutationPermission(slug);
    if (!perm.allowed && perm.response) {
      return perm.response;
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Product ID wajib disertakan.' },
        { status: 400 }
      );
    }

    const actor: CanonicalWriterActor = {
      actorId,
      actorRole,
      isInternalMachine: isInternalAuth,
    };

    // ── EXECUTE VIA SINGLE AUTHORITATIVE CANONICAL WRITER (ADR-P0-07) ──
    const result = await deleteCanonicalProduct({
      tenant: canonicalTenant as CanonicalTenantContext,
      productIdOrKey: id,
      actor,
      req,
      customSupabaseAdmin: supabaseAdmin,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          code: result.code,
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
          `/api/v1/tenants/${encodeURIComponent(slug)}/products?id=${encodeURIComponent(id)}`
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
      console.warn('[Products Route] Core backend sync skipped:', railwayErr);
    }

    // Instant Next.js ISR Cache Revalidation for Storefront & Product Pages
    try {
      revalidatePath(`/${slug}`);
      revalidatePath(`/${slug}`, 'page');
      revalidatePath(`/${slug}`, 'layout');
      revalidatePath(`/${slug}/p/[slug]`, 'page');
      revalidatePath('/[tenant]', 'page');
      revalidatePath('/[tenant]', 'layout');
    } catch (revalErr) {
      console.debug('[Products Route] Cache revalidation note:', revalErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Produk berhasil dihapus dari katalog.',
      deletedId: result.deletedId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error deleting product';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * GET /api/v1/tenants/[slug]/products
 * SQL-First Reader (ADR-P0-07 & Decisions O-01 / O-02)
 * Treats relational `public.products` as canonical authority.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    const isInternalAuth = isInternalMachineAuthorized(req);
    let isMerchantAuthorized = isInternalAuth;
    if (!isInternalAuth) {
      const auth = authorizeMerchantRequest(req, slug, ['OWNER', 'MERCHANT']);
      if (auth.authorized) {
        isMerchantAuthorized = true;
      }
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'SERVICE_UNAVAILABLE' }, { status: 503 });
    }

    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('id, slug, metadata, category')
      .eq('slug', slug)
      .maybeSingle();

    if (!tenantRow) {
      return NextResponse.json({ success: false, error: 'TENANT_NOT_FOUND' }, { status: 404 });
    }

    // ── 1. AUTHORITATIVE QUERY FROM RELATIONAL `public.products` ──
    const { data: sqlProds, error: sqlErr } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantRow.id);

    const activeSqlProds = (sqlProds || []).filter((sp: any) => {
      if (!sp) return false;
      if (sp.is_active === false || sp.is_active === 'false' || sp.is_active === 0) return false;
      const st = typeof sp.status === 'string' ? sp.status.toLowerCase().trim() : '';
      if (['draft', 'hidden', 'archived', 'inactive', 'sembunyi'].includes(st)) return false;
      return true;
    });

    // Map SQL products into canonical response items
    const canonicalProducts: ProductItem[] = activeSqlProds.map((sp: any, idx: number) => ({
      id: sp.id,
      name: sp.title || sp.name || `Produk ${idx + 1}`,
      title: sp.title || sp.name || `Produk ${idx + 1}`,
      slug: sp.slug,
      category: sp.category || 'digital',
      product_type: sp.product_type || 'DIGITAL',
      price: Number(sp.price) || 0,
      promo_price: sp.promo_price ? Number(sp.promo_price) : 0,
      description: sp.description || '',
      download_url: sp.link_digital || sp.fulfillment_metadata?.access_url || '',
      image: sp.image || sp.image_url || '',
      image_url: sp.image_url || sp.image || '',
      stock: sp.stock !== undefined && sp.stock !== null ? Number(sp.stock) : 999,
      sku: sp.sku || '',
      is_unlimited: sp.is_unlimited_stock ?? true,
      is_active: sp.is_active !== false,
      status: sp.status || 'ACTIVE',
      fulfillment_metadata: sp.fulfillment_metadata,
      single_page_config: sp.fulfillment_metadata?.single_page_config,
      variants: sp.variants,
    }));

    // ── 2. CROSS-REFERENCE WITH METADATA (O-01 & O-02 COMPLIANCE) ──
    const sqlIds = new Set(canonicalProducts.map(p => String(p.id)));
    const sqlSlugs = new Set(canonicalProducts.map(p => String(p.slug).toLowerCase()));

    const metaProducts: any[] = Array.isArray(tenantRow.metadata?.products)
      ? tenantRow.metadata.products
      : (tenantRow.metadata?.product?.name ? [tenantRow.metadata.product] : []);

    for (const mp of metaProducts) {
      if (!mp) continue;
      const mId = String(mp.id || '');
      const mSlug = String(mp.slug || '').toLowerCase();

      // If ID or Slug exists in SQL, SQL row ALWAYS wins. Metadata is superseded.
      if (sqlIds.has(mId) || (mSlug && sqlSlugs.has(mSlug))) {
        continue;
      }

      // Metadata-only legacy product (O-01 Option B)
      // If request is merchant-authorized, surface as LEGACY_REVIEW_REQUIRED for review.
      // If public storefront request, omit from purchasable catalog.
      if (isMerchantAuthorized) {
        canonicalProducts.push({
          id: mp.id,
          name: mp.name || mp.title || 'Legacy Product',
          title: mp.title || mp.name || 'Legacy Product',
          slug: mp.slug,
          category: mp.category || 'digital',
          product_type: mp.product_type || 'DIGITAL',
          price: Number(mp.price) || 0,
          promo_price: mp.promo_price ? Number(mp.promo_price) : 0,
          description: mp.description || '',
          image: mp.image || mp.image_url || '',
          image_url: mp.image_url || mp.image || '',
          stock: mp.stock !== undefined ? Number(mp.stock) : 0,
          sku: mp.sku || '',
          is_unlimited: Boolean(mp.is_unlimited),
          is_active: false,
          status: 'LEGACY_REVIEW_REQUIRED',
          is_legacy: true,
          is_purchasable: false,
          fulfillment_metadata: mp.fulfillment_metadata,
          single_page_config: mp.single_page_config,
        });
      }
    }

    return NextResponse.json({
      success: true,
      products: canonicalProducts.map(p => sanitizePublicProduct(p)),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching products';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export { POST as PUT, POST as PATCH };
