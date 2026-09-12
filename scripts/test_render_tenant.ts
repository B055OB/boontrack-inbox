import { getSupabase } from '../lib/supabaseClient';
import { sanitizeImageUrl } from '../lib/image-utils';
import { formatCategoryBadge } from '../app/[tenant]/page';

async function testLoadTenantAndCatalog(tenantSlug: string) {
  console.log(`[TEST] Starting loadTenantAndCatalog for: ${tenantSlug}`);
  try {
    const supabase = getSupabase();
    const { data: tenantRow, error: dbErr } = await supabase
      .from('tenants')
      .select('id, slug, name, category, metadata')
      .eq('slug', tenantSlug)
      .maybeSingle();

    if (dbErr) {
      console.error('[TEST] Supabase dbErr:', dbErr);
    }

    if (!tenantRow) {
      console.log('[TEST] Tenant row not found directly in Supabase');
      return { status: 'not_found' };
    }

    console.log('[TEST] Tenant row retrieved successfully:', {
      id: tenantRow.id,
      slug: tenantRow.slug,
      name: tenantRow.name,
      category: tenantRow.category,
      hasMetadata: !!tenantRow.metadata,
      hasProducts: !!tenantRow.metadata?.products,
      productCount: Array.isArray(tenantRow.metadata?.products) ? tenantRow.metadata.products.length : 0,
    });

    const storeName = tenantRow.name || tenantSlug.replace(/[-_]/g, ' ');
    const tenantMetadata = tenantRow.metadata || null;
    const rawProds = tenantRow.metadata?.products;
    const prodsList = Array.isArray(rawProds)
      ? rawProds.filter((p: any) => p !== null && typeof p === 'object')
      : (tenantRow.metadata?.product && typeof tenantRow.metadata.product === 'object' ? [tenantRow.metadata.product] : []);

    const storeProducts = prodsList.map((p: any, idx: number) => {
      const rawPrice = Number(p.price) || 0;
      const rawPromoPrice = p.promo_price !== undefined && p.promo_price !== null && p.promo_price !== '' ? Number(p.promo_price) : undefined;
      const hasValidPromo = rawPromoPrice !== undefined && !isNaN(rawPromoPrice) && rawPromoPrice > 0 && rawPrice > rawPromoPrice;
      const price = hasValidPromo ? rawPromoPrice : (rawPrice > 0 ? rawPrice : (rawPromoPrice || 0));
      const originalPrice = hasValidPromo ? rawPrice : (p.originalPrice ? Number(p.originalPrice) : undefined);

      const categoryBadge = formatCategoryBadge(
        typeof p.category === 'string' ? p.category : undefined,
        typeof (p.product_type || p.type) === 'string' ? (p.product_type || p.type) : undefined,
        typeof p.custom_badge === 'string' ? p.custom_badge : undefined
      );

      return {
        id: p.id !== undefined && p.id !== null ? p.id : `prod-${idx + 1}`,
        name: p.name || p.title || `Layanan ${idx + 1}`,
        category: p.category || categoryBadge,
        type: p.type || (p.product_type === 'PHYSICAL' ? 'physical' : (p.product_type === 'SERVICE' || p.product_type === 'FIELD_SERVICE' ? 'service' : 'digital')),
        price,
        originalPrice,
        image: sanitizeImageUrl(p.image || (Array.isArray(p.images) && p.images[0]) || '/logo-shop.png'),
        description: typeof p.description === 'string' ? p.description : '',
        badge: categoryBadge,
        promo: typeof p.promo === 'string' ? p.promo : '',
        custom_badge: typeof p.custom_badge === 'string' ? p.custom_badge : undefined,
        features: Array.isArray(p.features) && p.features.length > 0 ? p.features : [
          'Pengerjaan Profesional',
          'Garansi Bersih Tuntas',
          'Peralatan Lengkap & Higienis'
        ],
        modules: Array.isArray(p.modules) ? p.modules : undefined,
        promo_price: rawPromoPrice,
        download_url: p.download_url || p.delivery_url || '',
        stock: p.stock !== undefined && p.stock !== null ? Number(p.stock) : 999,
        sku: p.sku || `SKU-${idx + 1}`
      };
    });

    const currentTheme = tenantMetadata?.theme || {};
    const currentTemplate = tenantMetadata?.template || currentTheme.template || (tenantSlug === 'ombudi' ? 'personal' : 'default');

    console.log('[TEST] Render payload resolved:');
    console.log({
      status: 'active',
      storeName,
      template: currentTemplate,
      productsCount: storeProducts.length,
      sampleProduct: storeProducts[0],
    });

    return {
      status: 'active',
      storeName,
      currentTemplate,
      storeProducts,
    };
  } catch (err) {
    console.error('[TEST] ERROR in testLoadTenantAndCatalog:', err);
    throw err;
  }
}

testLoadTenantAndCatalog('kurastorenkrw')
  .then(() => console.log('[TEST] COMPLETED WITHOUT ERROR'))
  .catch((e) => {
    console.error('[TEST] FAILED:', e);
    process.exit(1);
  });
