import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { getBackendApiUrl } from '@/lib/api-config';
import { slugify } from '@/lib/product-catalog';

export interface ProductItem {
  id: string | number;
  name: string;
  slug?: string;
  category: 'ebook' | 'course' | 'template' | 'physical' | 'membership' | string;
  price: number;
  promo_price?: number;
  variants?: string;
  promo?: string;
  description?: string;
  download_url?: string | null;
  image?: string;
  stock?: number;
  sku?: string;
  is_unlimited?: boolean;
  type?: 'digital' | 'physical';
  product_type?: string;
  weight_grams?: number;
  fulfillment_metadata?: any;
  single_page_config?: any;
  created_at?: string;
  updated_at?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');
    const body = await req.json();

    const {
      id,
      name,
      category = 'course',
      price,
      promo_price,
      variants,
      promo,
      description,
      download_url,
      type = 'digital',
    } = body;

    if (!name || price === undefined || isNaN(Number(price))) {
      return NextResponse.json(
        { success: false, error: 'Nama produk dan harga wajib diisi.' },
        { status: 400 }
      );
    }

    const productId = id || `prod-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const finalSlug = body.slug ? slugify(body.slug) : slugify(name);

    const newProduct: ProductItem = {
      ...body,
      id: productId,
      name,
      slug: finalSlug,
      category: category || 'course',
      price: Number(price),
      promo_price: promo_price ? Number(promo_price) : undefined,
      variants: variants || '',
      promo: promo || '',
      description: description || '',
      download_url: download_url || null,
      type: type || (body.product_type === 'PHYSICAL' ? 'physical' : 'digital'),
      single_page_config: body.single_page_config
        ? {
            ...body.single_page_config,
            slug: finalSlug,
          }
        : undefined,
      updated_at: new Date().toISOString(),
      created_at: body.created_at || new Date().toISOString(),
    };

    let updatedProducts: ProductItem[] = [];

    try {
      const supabase = getSupabase();
      const { data: existing } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      const existingProducts: ProductItem[] = Array.isArray(existing?.metadata?.products)
        ? existing.metadata.products
        : existing?.metadata?.product?.name
        ? [
            {
              id: existing.metadata.product.id || `prod-legacy-${Date.now()}`,
              name: existing.metadata.product.name,
              category: existing.metadata.product.category || 'course',
              price: Number(existing.metadata.product.price || 0),
              promo_price: existing.metadata.product.promo_price
                ? Number(existing.metadata.product.promo_price)
                : undefined,
              variants: existing.metadata.product.variants || '',
              promo: existing.metadata.product.promo || '',
              description: existing.metadata.product.description || '',
              download_url: existing.metadata.product.download_url || null,
              type: existing.metadata.product.type || 'digital',
            },
          ]
        : [];

      const existingIndex = existingProducts.findIndex((p: any) => String(p.id) === String(productId));

      if (existingIndex >= 0) {
        updatedProducts = [...existingProducts];
        updatedProducts[existingIndex] = {
          ...updatedProducts[existingIndex],
          ...newProduct,
        };
      } else {
        updatedProducts = [newProduct, ...existingProducts];
      }

      const updatedMetadata = {
        ...(existing?.metadata || {}),
        products: updatedProducts,
        product: newProduct,
      };

      await supabase.from('tenants').upsert({
        slug,
        name: existing?.name || slug,
        category: existing?.category || (type === 'digital' ? 'digital' : 'retail'),
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      });
    } catch (dbErr) {
      console.warn('Supabase product save error:', dbErr);
      updatedProducts = [newProduct];
    }

    // Forward/Sync to Railway Production Core Backend
    try {
      await fetch(
        getBackendApiUrl(`/api/v1/tenants/${encodeURIComponent(slug)}/products`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': slug,
          },
          body: JSON.stringify(body),
          cache: 'no-store',
        }
      );
    } catch (railwayErr) {
      console.warn('Railway backend product save sync note:', railwayErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Produk berhasil disimpan ke katalog toko.',
      product: newProduct,
      products: updatedProducts,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error saving product';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');
    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Product ID wajib disertakan.' },
        { status: 400 }
      );
    }

    let remainingProducts: ProductItem[] = [];

    try {
      const supabase = getSupabase();
      const { data: existing } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      const existingProducts: ProductItem[] = Array.isArray(existing?.metadata?.products)
        ? existing.metadata.products
        : existing?.metadata?.product
        ? [existing.metadata.product]
        : [];

      remainingProducts = existingProducts.filter((p) => p.id !== id);

      const updatedMetadata = {
        ...(existing?.metadata || {}),
        products: remainingProducts,
        product: remainingProducts[0] || null,
      };

      await supabase.from('tenants').upsert({
        slug,
        name: existing?.name || slug,
        category: existing?.category || 'digital',
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      });
    } catch (dbErr) {
      console.warn('Supabase product delete error:', dbErr);
    }

    // Forward/Sync to Railway Production Core Backend
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
      console.warn('Railway backend product delete sync note:', railwayErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Produk berhasil dihapus dari katalog.',
      products: remainingProducts,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error deleting product';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    // 1. Coba dari Railway Backend Core
    try {
      const railwayRes = await fetch(
        getBackendApiUrl(`/api/v1/tenants/${encodeURIComponent(slug)}/products`),
        {
          headers: { 'X-Tenant-ID': slug },
          cache: 'no-store',
        }
      );
      if (railwayRes.ok) {
        const rData = await railwayRes.json();
        if (Array.isArray(rData.products)) {
          return NextResponse.json({
            success: true,
            products: rData.products,
          });
        }
      }
    } catch (railwayErr) {
      console.warn('Railway backend products fetch note:', railwayErr);
    }

    // 2. Fallback ke Supabase tenants table
    const supabase = getSupabase();
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('metadata')
      .eq('slug', slug)
      .maybeSingle();

    const products = Array.isArray(tenantRow?.metadata?.products)
      ? tenantRow.metadata.products
      : tenantRow?.metadata?.product
      ? [tenantRow.metadata.product]
      : [];

    return NextResponse.json({
      success: true,
      products,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching products';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}


