import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { getBackendApiUrl } from '@/lib/api-config';

export interface ProductItem {
  id: string;
  name: string;
  category: 'ebook' | 'course' | 'template' | 'physical' | 'membership' | string;
  price: number;
  promo_price?: number;
  variants?: string;
  promo?: string;
  description?: string;
  download_url?: string | null;
  type: 'digital' | 'physical';
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

    const newProduct: ProductItem = {
      id: productId,
      name,
      category: category || 'course',
      price: Number(price),
      promo_price: promo_price ? Number(promo_price) : undefined,
      variants: variants || '',
      promo: promo || '',
      description: description || '',
      download_url: download_url || null,
      type: type || 'digital',
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

      const existingIndex = existingProducts.findIndex((p) => p.id === productId);

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

