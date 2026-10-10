import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables if available
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

export const SEED_PRODUCTS = [
  {
    id: 'a1b00571-c74a-4b01-8901-000000000001',
    sku: 'ACADEMY_CTWA_BATCH1_A',
    name: 'Kelas Inkubasi CTWA Batch 1 - Paket Starter',
    title: 'Kelas Inkubasi CTWA Batch 1 - Paket Starter',
    slug: 'kelas-inkubasi-ctwa-batch-1-starter',
    price: 99000,
    promo_price: 99000,
    is_digital: true,
    description: 'Akses Inkubasi Kelas 4 Hari + Script JSON Sales Rep Bot + 1 Bulan Trial Ads Performance (Hard-cap 100 Sesi AI) + 3 Kredit Studio.',
    image_url: '/images/products/onlineboost-batch1-starter.png',
    image: '/images/products/onlineboost-batch1-starter.png',
    status: 'ACTIVE',
    is_active: true,
    is_available: true,
    stock: 999,
    is_unlimited: true,
    is_unlimited_stock: true,
    type: 'digital',
    category: 'digital',
    product_type: 'DIGITAL',
    requires_shipping: false,
    link_digital: 'https://onlineboost.id',
    asset_reference: 'https://onlineboost.id',
    fulfillment_metadata: {
      delivery_type: 'DOWNLOAD_LINK',
      access_url: 'https://onlineboost.id',
      instructions: 'Akses Inkubasi Kelas 4 Hari + Script JSON Sales Rep Bot + 1 Bulan Trial Ads Performance + 3 Kredit Studio.',
      button_text: 'Akses Kelas Inkubasi'
    }
  },
  {
    id: 'b2c00572-c74a-4b01-8902-000000000002',
    sku: 'ACADEMY_CTWA_BATCH1_B',
    name: 'Kelas Inkubasi CTWA Batch 1 - Scale Bundle (Recommended)',
    title: 'Kelas Inkubasi CTWA Batch 1 - Scale Bundle (Recommended)',
    slug: 'kelas-inkubasi-ctwa-batch-1-scale',
    price: 149000,
    promo_price: 149000,
    is_digital: true,
    description: 'Akses Inkubasi Kelas 4 Hari + Script JSON Sales Rep Bot + SOP Objection Handling + 1 Bulan Trial Ads Performance (Hard-cap 100 Sesi AI) + 15 Kredit Studio HD + Status Member Toko Selamanya.',
    image_url: '/images/products/onlineboost-batch1-scale.png',
    image: '/images/products/onlineboost-batch1-scale.png',
    status: 'ACTIVE',
    is_active: true,
    is_available: true,
    stock: 999,
    is_unlimited: true,
    is_unlimited_stock: true,
    type: 'digital',
    category: 'digital',
    product_type: 'DIGITAL',
    requires_shipping: false,
    link_digital: 'https://onlineboost.id',
    asset_reference: 'https://onlineboost.id',
    fulfillment_metadata: {
      delivery_type: 'DOWNLOAD_LINK',
      access_url: 'https://onlineboost.id',
      instructions: 'Akses Inkubasi Kelas 4 Hari + Script JSON Sales Rep Bot + SOP Objection Handling + 1 Bulan Trial Ads Performance + 15 Kredit Studio HD + Status Member Toko Selamanya.',
      button_text: 'Akses Kelas Inkubasi'
    }
  }
];

export async function seedOnlineboostProducts() {
  console.log('🚀 Starting Seeding for tenant `onlineboost`...');

  // 1. Fetch Tenant Row
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, slug, name, metadata')
    .eq('slug', 'onlineboost')
    .single();

  if (tenantErr || !tenant) {
    throw new Error(`Tenant onlineboost not found: ${tenantErr?.message || 'unknown error'}`);
  }

  console.log(`✅ Tenant verified: ${tenant.name} (${tenant.id})`);

  // 2. Verify Local Assets
  for (const prod of SEED_PRODUCTS) {
    const fullDiskPath = path.resolve('public', prod.image_url.startsWith('/') ? prod.image_url.slice(1) : prod.image_url);
    if (!fs.existsSync(fullDiskPath)) {
      console.warn(`⚠️ Warning: Cover image not found at ${fullDiskPath}`);
    } else {
      console.log(`✅ Cover image verified on disk: ${prod.image_url} (${fs.statSync(fullDiskPath).size} bytes)`);
    }
  }

  // 3. Upsert into Supabase relational `products` table
  console.log('\n📦 Syncing to Supabase `products` table...');
  const upsertedSqlProducts = [];

  for (const prod of SEED_PRODUCTS) {
    const sqlPayload = {
      tenant_id: tenant.id,
      sku: prod.sku,
      name: prod.name,
      title: prod.title,
      slug: prod.slug,
      price: prod.price,
      promo_price: prod.promo_price,
      category: prod.category,
      product_type: 'URL_LINK',
      is_digital: prod.is_digital,
      description: prod.description,
      image: prod.image,
      image_url: prod.image_url,
      stock: prod.stock,
      is_unlimited_stock: prod.is_unlimited_stock,
      is_active: prod.is_active,
      is_available: prod.is_available,
      requires_shipping: prod.requires_shipping,
      link_digital: prod.link_digital,
      asset_reference: prod.asset_reference,
      fulfillment_metadata: prod.fulfillment_metadata
    };

    // Check if existing record by sku or slug exists
    const { data: existingSql } = await supabase
      .from('products')
      .select('id')
      .eq('tenant_id', tenant.id)
      .or(`sku.eq.${prod.sku},slug.eq.${prod.slug},id.eq.${prod.id}`)
      .maybeSingle();

    if (existingSql?.id) {
      console.log(`  🔄 Updating existing product in products table (id: ${existingSql.id}, sku: ${prod.sku})...`);
      const { data: updatedRow, error: updateErr } = await supabase
        .from('products')
        .update(sqlPayload)
        .eq('id', existingSql.id)
        .select()
        .single();

      if (updateErr) {
        throw new Error(`Failed to update product ${prod.sku}: ${updateErr.message}`);
      }
      upsertedSqlProducts.push(updatedRow);
    } else {
      console.log(`  ➕ Inserting new product into products table (sku: ${prod.sku})...`);
      const { data: insertedRow, error: insertErr } = await supabase
        .from('products')
        .insert({
          id: prod.id,
          ...sqlPayload
        })
        .select()
        .single();

      if (insertErr) {
        throw new Error(`Failed to insert product ${prod.sku}: ${insertErr.message}`);
      }
      upsertedSqlProducts.push(insertedRow);
    }
  }

  // 4. Upsert into `tenants.metadata.products` (Single Source of Truth)
  console.log('\n📝 Syncing to `tenants.metadata.products`...');
  const existingMetadata = tenant.metadata || {};
  let currentProducts = Array.isArray(existingMetadata.products) ? [...existingMetadata.products] : [];

  for (const prod of SEED_PRODUCTS) {
    const matchingSql = upsertedSqlProducts.find(p => p.sku === prod.sku);
    const existingIndex = currentProducts.findIndex(p => p.sku === prod.sku || p.slug === prod.slug);

    const metadataProductItem = {
      ...(existingIndex >= 0 ? currentProducts[existingIndex] : {}),
      id: matchingSql?.id || prod.id,
      sku: prod.sku,
      name: prod.name,
      title: prod.title,
      slug: prod.slug,
      price: prod.price,
      promo_price: prod.promo_price,
      category: prod.category,
      product_type: prod.product_type,
      type: prod.type,
      is_digital: prod.is_digital,
      description: prod.description,
      image: prod.image,
      image_url: prod.image_url,
      images: [prod.image_url],
      status: prod.status,
      is_active: prod.is_active,
      is_available: prod.is_available,
      stock: prod.stock,
      is_unlimited: prod.is_unlimited,
      is_unlimited_stock: prod.is_unlimited_stock,
      requires_shipping: prod.requires_shipping,
      delivery_url: prod.link_digital,
      link_digital: prod.link_digital,
      download_url: prod.link_digital,
      fulfillment_metadata: prod.fulfillment_metadata,
      updated_at: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      currentProducts[existingIndex] = metadataProductItem;
      console.log(`  🔄 Updated product in metadata.products array: [${prod.sku}] ${prod.name}`);
    } else {
      currentProducts.push(metadataProductItem);
      console.log(`  ➕ Appended product to metadata.products array: [${prod.sku}] ${prod.name}`);
    }
  }

  const updatedMetadata = {
    ...existingMetadata,
    products: currentProducts,
    updated_at: new Date().toISOString()
  };

  const { error: metaUpdateErr } = await supabase
    .from('tenants')
    .update({ metadata: updatedMetadata })
    .eq('id', tenant.id);

  if (metaUpdateErr) {
    throw new Error(`Failed to update tenants.metadata: ${metaUpdateErr.message}`);
  }
  console.log(`✅ Successfully updated tenants.metadata! Total products in metadata: ${currentProducts.length}`);

  // 5. Verification Check
  console.log('\n🔍 Running Verification Queries...');
  const { data: verifiedProducts, error: vErr } = await supabase
    .from('products')
    .select('id, sku, name, price, is_digital, image_url, is_active')
    .eq('tenant_id', tenant.id)
    .in('sku', SEED_PRODUCTS.map(p => p.sku));

  if (vErr) {
    console.error('❌ Verification query error:', vErr);
  } else {
    console.log(`✅ Relational products count for newly seeded SKUs: ${verifiedProducts.length}`);
    for (const vp of verifiedProducts) {
      console.log(`   - [${vp.sku}] ${vp.name} | Rp ${vp.price.toLocaleString('id-ID')} | Image: ${vp.image_url} | Digital: ${vp.is_digital}`);
    }
  }

  const { data: verifiedTenant } = await supabase
    .from('tenants')
    .select('metadata')
    .eq('id', tenant.id)
    .single();

  const finalMetaProducts = verifiedTenant?.metadata?.products || [];
  const seededMeta = finalMetaProducts.filter((p) =>
    SEED_PRODUCTS.some(sp => sp.sku === p.sku)
  );

  console.log(`✅ Verified products in metadata.products matching seeded SKUs: ${seededMeta.length}`);
  for (const sm of seededMeta) {
    console.log(`   - [${sm.sku}] ${sm.name} | Rp ${sm.price.toLocaleString('id-ID')} | Image: ${sm.image_url} | Status: ${sm.status}`);
  }

  console.log('\n🎉 [SEEDING COMPLETED SUCCESSFULLY!]');
  return {
    success: true,
    seededProducts: verifiedProducts,
    totalProductsInMetadata: finalMetaProducts.length
  };
}

// Auto-run if executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seed-onlineboost-digital-products.mjs')) {
  seedOnlineboostProducts().catch(err => {
    console.error('Fatal error during seeding:', err);
    process.exit(1);
  });
}
