import { checkTenantMutationPermission } from '@/lib/subscription-guard';
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

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug: rawSlug, id: productId } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');
    const supabaseAdmin = getSupabaseAdmin();

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, metadata')
      .eq('slug', slug)
      .maybeSingle();

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
        return NextResponse.json({ success: true, product: match });
      }
      return NextResponse.json({ success: false, error: 'PRODUCT_NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({ success: true, product });
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

    const perm = await checkTenantMutationPermission(slug);
    if (!perm.allowed && perm.response) {
      return perm.response;
    }

    const rawBody = await req.json();
    const body = sanitizeProductPayload(rawBody);
    const supabaseAdmin = getSupabaseAdmin();

    // 1. Resolve Tenant with Service Role Key
    const { data: tenant, error: tErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, metadata, category, tier')
      .eq('slug', slug)
      .maybeSingle();

    if (tErr || !tenant) {
      return NextResponse.json({ success: false, error: 'TENANT_NOT_FOUND' }, { status: 404 });
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

    const updatedMetadata = {
      ...(tenant.metadata || {}),
      products: syncedMetaProducts,
      product: syncedMetaProducts[0] || null,
    };

    const { error: metaUpdateErr } = await supabaseAdmin
      .from('tenants')
      .update({ metadata: updatedMetadata })
      .eq('id', tenant.id);

    if (metaUpdateErr) {
      console.warn('[Product ID Route] Non-fatal metadata sync warning:', metaUpdateErr);
    }

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

    const perm = await checkTenantMutationPermission(slug);
    if (!perm.allowed && perm.response) {
      return perm.response;
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (!tenant) {
      return NextResponse.json({ success: false, error: 'TENANT_NOT_FOUND' }, { status: 404 });
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
