import { checkTenantMutationPermission } from '@/lib/subscription-guard';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase, getSupabaseAdmin } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { getBackendApiUrl } from '@/lib/api-config';
import {
  slugify,
  mapToDbProductType,
  DbProductType,
  sanitizeProductPayload,
  safeJsonStringify,
} from '@/lib/product-catalog';

const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

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
  fulfillment_metadata?: any;
  single_page_config?: any;
  order_bumps?: any;
  metadata?: any;
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

    const perm = await checkTenantMutationPermission(slug);
    if (!perm.allowed && perm.response) {
      return perm.response;
    }
    const rawBody = await req.json();
    const body = sanitizeProductPayload(rawBody);

    const {
      id,
      name,
      category,
      price,
      promo_price,
      variants,
      promo,
      description,
      download_url,
      type,
    } = body;

    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      return NextResponse.json(
        { success: false, error: 'Nama produk wajib diisi.' },
        { status: 400 }
      );
    }

    const rawPrice = price !== undefined ? price : body.price;
    let sanitizedPrice: number = 0;
    if (typeof rawPrice === 'number') {
      sanitizedPrice = isNaN(rawPrice) ? 0 : rawPrice;
    } else if (typeof rawPrice === 'string') {
      const num = parseFloat(rawPrice.replace(/[^0-9.-]+/g, ''));
      sanitizedPrice = isNaN(num) ? 0 : num;
    }

    let sanitizedPromoPrice: number | undefined = undefined;
    if (promo_price !== undefined && promo_price !== null && String(promo_price) !== '') {
      const pNum = typeof promo_price === 'number' ? promo_price : parseFloat(String(promo_price).replace(/[^0-9.-]+/g, ''));
      if (!isNaN(pNum) && pNum > 0) sanitizedPromoPrice = pNum;
    }

    const productId = id || `prod-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const finalSlug = body.slug ? slugify(body.slug) : slugify(trimmedName);
    const resolvedCategory = body.category || category || (body.product_type === 'PHYSICAL' ? 'Fisik' : (body.product_type === 'SERVICE' ? 'Jasa' : 'Digital'));

    // Graceful sanitization of order_bumps so empty/malformed bump entries never crash save
    const rawBumps = body.order_bumps || body.metadata?.order_bumps || body.fulfillment_metadata?.order_bumps;
    let cleanOrderBumps: any = undefined;
    if (rawBumps) {
      if (Array.isArray(rawBumps)) {
        const validItems = rawBumps.filter((b: any) => b && typeof b === 'object' && b.name && String(b.name).trim().length > 0);
        cleanOrderBumps = {
          enabled: validItems.length > 0,
          items: validItems.map((b: any) => ({
            ...b,
            name: String(b.name).trim(),
            price: Number(b.price) || 0,
            original_price: b.original_price ? Number(b.original_price) : undefined,
            badge_text: b.badge_text?.trim() || 'Penawaran Spesial',
            description: b.description?.trim() || '',
            is_active: b.is_active !== false,
          })),
        };
      } else if (typeof rawBumps === 'object') {
        const rawItems = Array.isArray(rawBumps.items) ? rawBumps.items : [];
        const validItems = rawItems.filter((b: any) => b && typeof b === 'object' && b.name && String(b.name).trim().length > 0);
        cleanOrderBumps = {
          enabled: Boolean(rawBumps.enabled) && validItems.length > 0,
          items: validItems.map((b: any) => ({
            ...b,
            name: String(b.name).trim(),
            price: Number(b.price) || 0,
            original_price: b.original_price ? Number(b.original_price) : undefined,
            badge_text: b.badge_text?.trim() || 'Penawaran Spesial',
            description: b.description?.trim() || '',
            is_active: b.is_active !== false,
          })),
        };
      }
    }

    const newProduct: ProductItem = {
      ...body,
      id: productId,
      name: trimmedName,
      slug: finalSlug,
      category: resolvedCategory,
      price: sanitizedPrice,
      promo_price: sanitizedPromoPrice,
      variants: variants || '',
      promo: promo || '',
      description: description || '',
      download_url: download_url || null,
      type: type || (body.product_type === 'PHYSICAL' ? 'physical' : (body.product_type === 'SERVICE' || category === 'jasa' ? 'service' : 'digital')),
      product_type: body.product_type || (category === 'fisik' ? 'PHYSICAL' : (category === 'jasa' ? 'SERVICE' : 'DIGITAL')),
      sku: body.sku || `SKU-${finalSlug}`,
      is_active: body.is_active !== false,
      order_bumps: cleanOrderBumps,
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
      const supabase = getSupabaseAdmin() || getSupabase();
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

      // ── DATA INTEGRITY GATE: Query SQL products table ONLY if existing metadata is empty to avoid resurrecting deleted products ──
      let mergedExisting = [...existingProducts];
      if (existing?.id && mergedExisting.length === 0) {
        try {
          const { data: sqlProds } = await supabase
            .from('products')
            .select('*')
            .eq('tenant_id', existing.id);
          if (Array.isArray(sqlProds) && sqlProds.length > 0) {
            const existingSlugs = new Set(mergedExisting.map((p) => (p.slug || '').toLowerCase()));
            const existingIds = new Set(mergedExisting.map((p) => String(p.id)));
            for (const sp of sqlProds) {
              const spSlug = (sp.slug || '').toLowerCase();
              const spId = String(sp.id);
              if (!existingSlugs.has(spSlug) && !existingIds.has(spId)) {
                mergedExisting.push({
                  id: sp.id,
                  name: sp.title || `Produk`,
                  title: sp.title,
                  slug: sp.slug,
                  category: sp.category || 'digital',
                  product_type: sp.product_type || 'DIGITAL',
                  type: sp.product_type === 'PHYSICAL' ? 'physical' : (sp.product_type === 'SERVICE' ? 'service' : 'digital'),
                  price: Number(sp.price) || 0,
                  promo_price: sp.promo_price ? Number(sp.promo_price) : 0,
                  sku: sp.sku || `SKU-${sp.id}`,
                  is_active: sp.is_active !== false,
                  image: sp.image || sp.image_url || '',
                  image_url: sp.image || sp.image_url || '',
                  description: sp.description || '',
                  download_url: sp.link_digital || sp.fulfillment_metadata?.access_url || '',
                  stock: sp.stock ?? 999999,
                  is_unlimited: sp.is_unlimited_stock ?? true,
                  requires_shipping: Boolean(sp.requires_shipping),
                  fulfillment_metadata: sp.fulfillment_metadata,
                  single_page_config: sp.fulfillment_metadata?.single_page_config,
                });
              }
            }
          }
        } catch (sqlReadErr) {
          console.debug('[Products Route] SQL existing products query note:', sqlReadErr);
        }
      }

      const targetSku = (body.sku || newProduct.sku || '').trim().toLowerCase();
      const existingIndex = mergedExisting.findIndex(
        (p: any) =>
          (targetSku && (p.sku || '').trim().toLowerCase() === targetSku) ||
          String(p.id) === String(productId) ||
          (p.slug && p.slug.toLowerCase() === finalSlug.toLowerCase())
      );

      // VALIDASI KUOTA CHECKOUT_LITE: MAKSIMAL 3 PRODUK AKTIF
      const tenantTier = String(existing?.tier || existing?.metadata?.tier || '').toUpperCase();
      if (tenantTier === 'CHECKOUT_LITE') {
        const isTargetActive = body.is_active !== false;
        if (isTargetActive) {
          const otherActiveCount = mergedExisting.filter(
            (p: any) => String(p.id) !== String(productId) && p.is_active !== false
          ).length;

          if (otherActiveCount >= 3) {
            return NextResponse.json(
              {
                success: false,
                code: 'LIMIT_EXCEEDED',
                error: 'Batas kuota tercapai: Tier Checkout Lite hanya mendukung maksimal 3 produk aktif. Upgrade untuk menambah produk.',
              },
              { status: 403 }
            );
          }
        }
      }

      const productSku = body.sku || newProduct.sku || `SKU-${finalSlug}`;
      const productWithActive: ProductItem = {
        ...newProduct,
        sku: productSku,
        is_active: body.is_active !== false,
      };

      if (existingIndex >= 0) {
        updatedProducts = [...mergedExisting];
        updatedProducts[existingIndex] = {
          ...updatedProducts[existingIndex],
          ...productWithActive,
          sku: productSku,
        };
      } else {
        // APPEND LOGIC: Tambahkan produk baru ke array eksisting, DILARANG replace total
        updatedProducts = [productWithActive, ...mergedExisting];
      }

      const updatedMetadata = {
        ...(existing?.metadata || {}),
        products: updatedProducts,
        product: productWithActive,
      };

      if (existing?.id) {
        const { error: tUpdateErr } = await supabase
          .from('tenants')
          .update({
            name: existing?.name || slug,
            category: existing?.category || (type === 'digital' ? 'digital' : 'retail'),
            metadata: updatedMetadata,
          })
          .eq('id', existing.id);

        if (tUpdateErr) {
          console.error('[Products Route] Failed to update tenant metadata:', tUpdateErr);
        }

        // Coba sync juga ke tabel SQL `products` jika memungkinkan
        try {
          const isUuidVal = isUuid(String(productId));
          const dbProductType = mapToDbProductType(body.product_type || type, resolvedCategory);

          const sqlProductPayload = {
            ...(isUuidVal ? { id: String(productId) } : {}),
            tenant_id: existing.id,
            title: trimmedName,
            name: trimmedName,
            slug: finalSlug,
            description: description || '',
            price: sanitizedPrice,
            promo_price: sanitizedPromoPrice ? Number(sanitizedPromoPrice) : 0,
            image: body.image || body.image_url || '',
            image_url: body.image || body.image_url || '',
            category: resolvedCategory,
            stock: body.stock !== undefined ? Number(body.stock) : 999999,
            is_unlimited_stock: body.is_unlimited ?? true,
            asset_reference: body.asset_reference || `product:${finalSlug}`,
            license_status: 'UNVERIFIED',
            product_type: dbProductType,
            sku: productSku,
            is_active: body.is_active !== false,
            requires_shipping: Boolean(body.requires_shipping ?? (dbProductType === 'PHYSICAL')),
            is_digital: dbProductType === 'DIGITAL_FILE' || Boolean(body.is_digital),
            fulfillment_metadata: {
              ...(typeof body.fulfillment_metadata === 'object' && body.fulfillment_metadata !== null ? body.fulfillment_metadata : {}),
              ...(cleanOrderBumps ? { order_bumps: cleanOrderBumps } : {}),
              ...(body.single_page_config ? { single_page_config: body.single_page_config } : {}),
              ...(Array.isArray(body.facilities) ? { facilities: body.facilities } : {}),
              ...(Array.isArray(body.features) ? { features: body.features } : {}),
            },
          };

          const hasValidUuid = isUuid(String(productId || ''));
          const orFilters: string[] = [];
          if (finalSlug) orFilters.push(`slug.eq.${finalSlug}`);
          if (productSku) orFilters.push(`sku.eq.${productSku}`);
          if (hasValidUuid) orFilters.push(`id.eq.${productId}`);

          const { data: existingSql } = orFilters.length > 0
            ? await supabase
                .from('products')
                .select('id')
                .eq('tenant_id', existing.id)
                .or(orFilters.join(','))
                .maybeSingle()
            : { data: null };

          if (existingSql?.id) {
            await supabase.from('products').update(sqlProductPayload).eq('id', existingSql.id);
          } else {
            await supabase.from('products').insert(sqlProductPayload);
          }
        } catch (sqlErr) {
          console.debug('[Products Route] SQL products table sync note:', sqlErr);
        }
      } else {
        await supabase.from('tenants').upsert({
          slug,
          name: existing?.name || slug,
          category: existing?.category || (type === 'digital' ? 'digital' : 'retail'),
          metadata: updatedMetadata,
        }, { onConflict: 'slug' });
      }
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
          body: safeJsonStringify(body),
          cache: 'no-store',
        }
      );
    } catch (railwayErr) {
      console.warn('Railway backend product save sync note:', railwayErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Produk berhasil disimpan ke katalog toko.',
      product: sanitizeProductPayload(newProduct),
      products: sanitizeProductPayload(updatedProducts),
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

    let remainingProducts: ProductItem[] = [];

    try {
      const supabase = getSupabaseAdmin() || getSupabase();
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

      const targetProduct = existingProducts.find((p) => String(p.id) === String(id) || p.slug === String(id));
      const targetSlug = targetProduct?.slug;

      remainingProducts = existingProducts.filter((p) => String(p.id) !== String(id) && p.slug !== String(id));

      const updatedMetadata = {
        ...(existing?.metadata || {}),
        products: remainingProducts,
        product: remainingProducts[0] || null,
      };

      if (existing?.id) {
        await supabase
          .from('tenants')
          .update({
            metadata: updatedMetadata,
          })
          .eq('id', existing.id);

        // Hapus juga dari tabel SQL products Supabase
        try {
          const deleteConditions: string[] = [];
          if (isUuid(String(id || ''))) deleteConditions.push(`id.eq.${id}`);
          if (targetSlug) deleteConditions.push(`slug.eq.${targetSlug}`);
          if (targetProduct?.sku) deleteConditions.push(`sku.eq.${targetProduct.sku}`);

          if (deleteConditions.length > 0) {
            await supabase
              .from('products')
              .delete()
              .eq('tenant_id', existing.id)
              .or(deleteConditions.join(','));
          }
        } catch (delSqlErr) {
          console.debug('[Products Route] SQL products delete note:', delSqlErr);
        }
      } else {
        await supabase.from('tenants').upsert({
          slug,
          metadata: updatedMetadata,
        }, { onConflict: 'slug' });
      }
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

    // 1. Single Source of Truth: Supabase (tenants.metadata.products & products table)
    try {
      const supabase = getSupabase();
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('id, metadata')
        .eq('slug', slug)
        .maybeSingle();

      let products: any[] = Array.isArray(tenantRow?.metadata?.products)
        ? tenantRow.metadata.products
        : (tenantRow?.metadata?.product && tenantRow.metadata.product.name && tenantRow.metadata.product.name !== slug)
        ? [tenantRow.metadata.product]
        : [];

      // Query juga dari tabel SQL `products` jika ada
      if (tenantRow?.id) {
        const { data: sqlProds } = await supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenantRow.id);

        if (Array.isArray(sqlProds) && sqlProds.length > 0) {
          const sqlMapped = sqlProds.map((sp: any, idx: number) => ({
            id: sp.id,
            name: sp.title || `Produk ${idx + 1}`,
            title: sp.title || `Produk ${idx + 1}`,
            slug: sp.slug,
            category: sp.category || (sp.product_type === 'PHYSICAL' ? 'physical' : (sp.product_type === 'SERVICE' ? 'jasa' : 'digital')),
            product_type: sp.product_type || (sp.category === 'fisik' ? 'PHYSICAL' : (sp.category === 'jasa' || sp.category === 'service' ? 'SERVICE' : 'DIGITAL')),
            price: Number(sp.price) || 0,
            promo_price: sp.promo_price ? Number(sp.promo_price) : 0,
            description: sp.description || '',
            download_url: sp.link_digital || sp.fulfillment_metadata?.access_url || '',
            image: sp.image || sp.fulfillment_metadata?.single_page_config?.banner_url || '',
            stock: sp.stock !== undefined ? Number(sp.stock) : 999,
            sku: sp.sku || '',
            is_unlimited: sp.is_unlimited_stock ?? true,
            fulfillment_metadata: sp.fulfillment_metadata,
            single_page_config: sp.fulfillment_metadata?.single_page_config,
          }));

          const existingSlugs = new Set(products.map((p) => (p.slug || '').toLowerCase()));
          const existingIds = new Set(products.map((p) => String(p.id)));
          for (const sp of sqlMapped) {
            if (!existingSlugs.has((sp.slug || '').toLowerCase()) && !existingIds.has(String(sp.id))) {
              products.push(sp);
            }
          }
        }
      }

      if (products.length > 0) {
        return NextResponse.json({
          success: true,
          products,
        });
      }
    } catch (supabaseErr) {
      console.warn('Supabase products fetch note:', supabaseErr);
    }

    // 2. Fallback jika Supabase kosong: Coba Railway Backend Core
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
        if (Array.isArray(rData.products) && rData.products.length > 0) {
          return NextResponse.json({
            success: true,
            products: rData.products,
          });
        }
      }
    } catch (railwayErr) {
      console.warn('Railway backend products fetch note:', railwayErr);
    }

    return NextResponse.json({
      success: true,
      products: [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching products';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}


