import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = '46cf50c6-18ff-4c1d-88a4-d86001d754c7';
const TENANT_SLUG = 'solusi-ads';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

const productsData = [
  {
    sku: 'SOL-KONSUL-01',
    name: 'Tiket Konsultasi 1-on-1 (Booking Komitmen)',
    slug: 'tiket-konsultasi',
    price: 149000,
    promo_price: 149000,
    category: 'CONSULTATION',
    product_type: 'SERVICE',
    description: 'Sesi audit performa toko & funnel ads intensif 1-on-1. Biaya ini 100% memotong tagihan DP jika lanjut ambil jasa.',
    is_active: true,
    is_booking_fee: true,
    voucher_credit: 149000,
  },
  {
    sku: 'SOL-SHOPEE-02',
    name: 'Jasa Shopee Ads Professional',
    slug: 'shopee-ads',
    price: 4500000,
    promo_price: 4500000,
    category: 'ADS_MANAGEMENT',
    product_type: 'SERVICE',
    description: 'Optimasi iklan berbayar Shopee (Search, Discovery, Live Ads) untuk peningkatan ROAS dan scaling omset.',
    is_active: true,
  },
  {
    sku: 'SOL-TIKTOK-03',
    name: 'Jasa TikTok Ads Professional',
    slug: 'tiktok-ads',
    price: 4500000,
    promo_price: 4500000,
    category: 'ADS_MANAGEMENT',
    product_type: 'SERVICE',
    description: 'Setup & scaling TikTok Shop Ads (Video Shopping Ads, LIVE Shopping Ads) berbasis audience research.',
    is_active: true,
  },
  {
    sku: 'SOL-AFFCTR-04',
    name: 'Manage Affiliate via Affiliate Center',
    slug: 'affiliate-center',
    price: 3000000,
    promo_price: 3000000,
    category: 'AFFILIATE_SERVICE',
    product_type: 'SERVICE',
    description: 'Manajemen operasional 100 kreator afiliasi via marketplace native creator center.',
    is_active: true,
  },
  {
    sku: 'SOL-AFFINK-05',
    name: 'Manage Affiliate via Inkubasi & WhatsApp',
    slug: 'affiliate-wa',
    price: 4000000,
    promo_price: 4000000,
    category: 'AFFILIATE_SERVICE',
    product_type: 'SERVICE',
    description: 'Pendampingan private group WA & inkubasi intensif untuk 100 kreator afiliasi aktif.',
    is_active: true,
  },
  {
    sku: 'SOL-BRIEF-06',
    name: 'Brief Konten Sales & Viral Angle',
    slug: 'brief-konten',
    price: 2500000,
    promo_price: 2500000,
    category: 'CREATIVE_SERVICE',
    product_type: 'DIGITAL_FILE',
    description: 'Penyusunan 90 brief konten terstruktur berorientasi penjualan langsung untuk talent/kreator.',
    is_active: true,
  },
  {
    sku: 'SOL-FLASHSALE-07',
    name: 'Manage Campaign & Flash Sale Toko',
    slug: 'campaign-flash-sale',
    price: 2500000,
    promo_price: 2500000,
    category: 'OPERATIONAL_SERVICE',
    product_type: 'SERVICE',
    description: 'Eksekusi kalender promosi, flash sale, voucher toko, dan event double-date marketplace.',
    is_active: true,
  },
  {
    sku: 'SOL-CPAS-08',
    name: 'CPAS Shopee Meta Ads (Collab Ads)',
    slug: 'cpas-meta-ads',
    price: 5000000,
    promo_price: 5000000,
    category: 'ADS_MANAGEMENT',
    product_type: 'SERVICE',
    description: 'Integrasi katalog dinamis Shopee ke Meta Ads untuk retargeting audiens hangat.',
    is_active: true,
  },
  {
    sku: 'SOL-BNDTT-09',
    name: 'Bundling Paket TikTok Maintenance',
    slug: 'bundling-tiktok',
    price: 7500000,
    promo_price: 7500000,
    category: 'BUNDLING_PACKAGE',
    product_type: 'SERVICE',
    description: 'Paket hemat: Manajemen TikTok Ads + Inkubasi Affiliate + 90 Brief Konten.',
    is_active: true,
  },
  {
    sku: 'SOL-BNDSHP-10',
    name: 'Bundling Shopee Ads Maintenance',
    slug: 'bundling-shopee',
    price: 6500000,
    promo_price: 6500000,
    category: 'BUNDLING_PACKAGE',
    product_type: 'SERVICE',
    description: 'Paket hemat: Manajemen Shopee Ads + Manage Campaign Flash Sale + Optimasi CPAS.',
    is_active: true,
  }
];

async function main() {
  console.log(`\n======================================================`);
  console.log(`[SYNC PRODUCTS FOR TENANT: ${TENANT_SLUG} (${TENANT_ID})]`);
  console.log(`======================================================\n`);

  // Step 1: Upload assets to Supabase Storage bucket 'store-assets'
  console.log('1. Uploading visual assets to Supabase Storage bucket store-assets...');
  const assetDir = path.resolve('public/images/products/solusi-ads');
  const files = fs.readdirSync(assetDir);

  for (const file of files) {
    const filePath = path.join(assetDir, file);
    const fileBuf = fs.readFileSync(filePath);
    const contentType = file.endsWith('.svg') ? 'image/svg+xml' : 'image/webp';
    const storagePath = `tenant-solusi-ads-products/${file}`;

    const { error: uploadErr } = await supabase.storage
      .from('store-assets')
      .upload(storagePath, fileBuf, {
        contentType,
        upsert: true
      });

    if (uploadErr) {
      console.warn(`  ⚠️ Upload warning for ${file}:`, uploadErr.message);
    } else {
      console.log(`  ✅ Uploaded: ${storagePath}`);
    }
  }

  // Step 2: Query existing products in SQL table for this tenant
  console.log('\n2. Upserting 10 products into SQL table `products`...');
  const { data: existingSqlProds, error: sqlFetchErr } = await supabase
    .from('products')
    .select('id, slug')
    .eq('tenant_id', TENANT_ID);

  if (sqlFetchErr) {
    console.error('  ❌ Error fetching existing SQL products:', sqlFetchErr);
    process.exit(1);
  }

  const existingMap = new Map((existingSqlProds || []).map((p) => [p.slug, p.id]));
  const upsertedSqlProducts = [];

  for (const prod of productsData) {
    const existingId = existingMap.get(prod.slug);
    const localImgPath = `/images/products/solusi-ads/${prod.slug}.webp`;
    const cdnImgPath = `${supabaseUrl}/storage/v1/object/public/store-assets/tenant-solusi-ads-products/${prod.slug}.webp`;

    const sqlPayload = {
      tenant_id: TENANT_ID,
      title: prod.name,
      name: prod.name,
      slug: prod.slug,
      price: prod.price,
      promo_price: prod.promo_price || prod.price,
      category: prod.category,
      description: prod.description,
      is_active: prod.is_active,
      is_available: prod.is_active,
      image: localImgPath,
      image_url: localImgPath,
      sku: prod.sku,
      product_type: prod.product_type,
      license_status: 'UNVERIFIED',
      asset_reference: `service:${prod.slug}`,
      stock: 999,
      is_unlimited_stock: true,
      fulfillment_metadata: {
        ...(prod.is_booking_fee ? { is_booking_fee: true, voucher_credit: prod.voucher_credit } : {}),
        cdn_image_url: cdnImgPath,
        svg_image_url: `/images/products/solusi-ads/${prod.slug}.svg`,
      }
    };

    let savedRow;
    if (existingId) {
      const { data, error } = await supabase
        .from('products')
        .update(sqlPayload)
        .eq('id', existingId)
        .select()
        .single();
      if (error) {
        console.error(`  ❌ Error updating product ${prod.slug}:`, error);
        process.exit(1);
      }
      savedRow = data;
      console.log(`  🔄 Updated SQL Product: ${prod.name} (ID: ${savedRow.id})`);
    } else {
      const { data, error } = await supabase
        .from('products')
        .insert(sqlPayload)
        .select()
        .single();
      if (error) {
        console.error(`  ❌ Error inserting product ${prod.slug}:`, error);
        process.exit(1);
      }
      savedRow = data;
      console.log(`  ✨ Inserted SQL Product: ${prod.name} (ID: ${savedRow.id})`);
    }
    upsertedSqlProducts.push(savedRow);
  }

  // Step 3: Update array metadata.products in table `tenants`
  console.log('\n3. Synchronizing `tenants.metadata.products`...');
  const { data: tenantRow, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, name, metadata')
    .eq('id', TENANT_ID)
    .single();

  if (tenantErr || !tenantRow) {
    console.error('  ❌ Error fetching tenant:', tenantErr);
    process.exit(1);
  }

  const existingMeta = tenantRow.metadata || {};
  const currentMetaProds = Array.isArray(existingMeta.products) ? existingMeta.products : [];

  const updatedMetaProducts = productsData.map((prod, idx) => {
    const matchingSql = upsertedSqlProducts.find((p) => p.slug === prod.slug);
    const existingMetaItem = currentMetaProds.find((p) => p.slug === prod.slug || p.sku === prod.sku);
    const imgUrl = `/images/products/solusi-ads/${prod.slug}.webp`;

    return {
      ...(existingMetaItem || {}),
      id: matchingSql?.id || existingMetaItem?.id || `prod-${String(idx + 1).padStart(2, '0')}`,
      sku: prod.sku,
      name: prod.name,
      title: prod.name,
      slug: prod.slug,
      price: prod.price,
      promo_price: prod.promo_price || prod.price,
      category: prod.category,
      product_type: prod.product_type,
      description: prod.description,
      is_active: true,
      image: imgUrl,
      image_url: imgUrl,
      images: [imgUrl],
      stock: 999,
      is_unlimited: true,
      ...(prod.is_booking_fee ? { is_booking_fee: true, voucher_credit: prod.voucher_credit } : {})
    };
  });

  const newMetadata = {
    ...existingMeta,
    products: updatedMetaProducts,
    product: updatedMetaProducts[0] // Set first product as primary default
  };

  const { error: metaUpdateErr } = await supabase
    .from('tenants')
    .update({ metadata: newMetadata })
    .eq('id', TENANT_ID);

  if (metaUpdateErr) {
    console.error('  ❌ Error updating tenants.metadata:', metaUpdateErr);
    process.exit(1);
  }
  console.log('  ✅ `tenants.metadata.products` successfully updated with 10 synchronized products!');

  // Step 4: Verification
  console.log('\n4. Running Verification Queries...');
  
  // 4a. Count in relational products table
  const { data: verifyProds, error: countErr, count } = await supabase
    .from('products')
    .select('id, name, slug, price, is_active, image_url', { count: 'exact' })
    .eq('tenant_id', TENANT_ID)
    .eq('is_active', true);

  if (countErr) {
    console.error('  ❌ Verification query error:', countErr);
  } else {
    console.log(`  ✅ SQL products table count (tenant_id=${TENANT_ID}, is_active=true): ${count} rows`);
    for (const p of verifyProds) {
      console.log(`     - [${p.slug}] ${p.name} | Rp ${p.price.toLocaleString('id-ID')} | Image: ${p.image_url}`);
    }
  }

  // 4b. Verify tenants.metadata.products
  const { data: recheckTenant } = await supabase
    .from('tenants')
    .select('metadata')
    .eq('id', TENANT_ID)
    .single();

  const recheckProducts = recheckTenant?.metadata?.products || [];
  console.log(`\n  ✅ Verified metadata.products count: ${recheckProducts.length} items`);
  const missingImages = recheckProducts.filter(p => !p.image_url || p.image_url === 'undefined');
  if (missingImages.length === 0) {
    console.log('  ✅ ALL 10 products in metadata have valid non-empty `image_url` and `image` fields!');
  } else {
    console.warn('  ⚠️ Found products with missing images:', missingImages);
  }

  console.log(`\n🎉 [ALL TASKS COMPLETED SUCCESSFULLY!]`);
}

main().catch((err) => {
  console.error('Fatal error in sync script:', err);
  process.exit(1);
});
