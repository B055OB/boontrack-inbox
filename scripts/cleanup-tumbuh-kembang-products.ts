import fs from 'fs';
if (fs.existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}
if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}

import { getSupabaseAdmin } from '../lib/supabaseClient';

async function cleanupProducts() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Supabase admin client failed to initialize');
  }

  console.log('--- CLEANUP TUMBUH KEMBANG ANAK CATALOG ---');

  // 1. Resolve tenant
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, slug, metadata')
    .eq('slug', 'tumbuh-kembang-anak')
    .single();

  if (tErr || !tenant) {
    throw new Error(`Tenant fetch error: ${tErr?.message}`);
  }

  const tenantId = tenant.id;
  console.log(`Found tenant '${tenant.slug}' (ID: ${tenantId})`);

  // 2. Delete redundant products from `products` table
  const redundantSkus = [
    'SRV-EATGROW-CHAT',
    'SRV-EATGROW-MEET',
    'SRV-EATGROW-GMEET',
    'ECO-PLAYGROW-01',
    'DIG-PLAYGROW-01',
    'SRV-SCREENING-KLINIK',
  ];

  const redundantSlugs = [
    'play-n-grow-ecourse',
    'eat-grow-chat-consultation',
    'eat-grow-google-meet',
    'screening-tumbuh-kembang',
  ];

  const { data: deletedRows, error: delErr } = await supabase
    .from('products')
    .delete()
    .eq('tenant_id', tenantId)
    .or(`sku.in.(${redundantSkus.join(',')}),slug.in.(${redundantSlugs.join(',')})`)
    .select('id, sku, title, slug');

  console.log('Deleted rows from products table:', deletedRows || [], delErr ? `Error: ${delErr.message}` : 'Success');

  // 3. Update CAM-KONSULTASI-03 in products table to SERVICE, requires_shipping = false, and combined doctor thumbnail
  const combinedDoctorThumb = '/tenants/tumbuh-kembang-anak/dr-harys-azizah-konsultasi.webp';

  const { data: updatedConsultation, error: updErr } = await supabase
    .from('products')
    .update({
      product_type: 'SERVICE',
      requires_shipping: false,
      is_digital: true,
      image: combinedDoctorThumb,
      image_url: combinedDoctorThumb,
      category: 'Konsultasi Medis',
    })
    .eq('tenant_id', tenantId)
    .eq('sku', 'CAM-KONSULTASI-03')
    .select('id, sku, title, product_type, requires_shipping, image_url');

  console.log('Updated CAM-KONSULTASI-03 row:', updatedConsultation, updErr ? `Error: ${updErr.message}` : 'Success');

  // 4. Fetch the 3 official products from DB
  const { data: officialProducts } = await supabase
    .from('products')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  console.log('Current official products in DB table:');
  console.table((officialProducts || []).map(p => ({
    id: p.id,
    sku: p.sku,
    slug: p.slug,
    title: p.title || p.name,
    product_type: p.product_type,
    requires_shipping: p.requires_shipping,
  })));

  // 5. Clean metadata.products to contain ONLY the 3 official products
  const cleanMetadataProducts = [
    {
      id: 'happyeating',
      name: 'Course GTM & Solusi MPASI Anti-GTM',
      title: 'Course GTM & Solusi MPASI Anti-GTM',
      slug: 'happyeating',
      sku: 'CAM-HAPPYEATING-01',
      category: 'E-Course Nutrisi',
      product_type: 'DIGITAL_FILE',
      type: 'digital',
      price: 199000,
      promo_price: 299000,
      description: 'Panduan lengkap atasi anak GTM, feeding rules terstruktur, dan resep gizi seimbang dari dr. Harys Maulana.',
      image: '/tenants/tumbuh-kembang-anak/happyeating/01_resep_menu.webp',
      image_url: '/tenants/tumbuh-kembang-anak/happyeating/01_resep_menu.webp',
      is_active: true,
      is_unlimited: true,
      stock: 999999,
      weight_grams: 0,
      requires_shipping: false,
      fulfillment_metadata: {
        delivery_type: 'DOWNLOAD_LINK',
        access_url: 'https://littlebitefeeding.com/happyeating',
      },
    },
    {
      id: 'panduan-stimulasianakcerdas',
      name: 'Panduan Stimulasi Anak Cerdas (0–5 Tahun)',
      title: 'Panduan Stimulasi Anak Cerdas (0–5 Tahun)',
      slug: 'panduan-stimulasianakcerdas',
      sku: 'CAM-STIMULASI-02',
      category: 'Modul Stimulasi',
      product_type: 'DIGITAL_FILE',
      type: 'digital',
      price: 149000,
      promo_price: 249000,
      description: 'Panduan stimulasi sensori, motorik, dan pencegahan speech delay anak 0-5 tahun oleh dr. Azizah Ridwan.',
      image: '/tenants/tumbuh-kembang-anak/panduan-stimulasianakcerdas/01_visual.webp',
      image_url: '/tenants/tumbuh-kembang-anak/panduan-stimulasianakcerdas/01_visual.webp',
      is_active: true,
      is_unlimited: true,
      stock: 999999,
      weight_grams: 0,
      requires_shipping: false,
      fulfillment_metadata: {
        delivery_type: 'DOWNLOAD_LINK',
        access_url: 'https://tumbuhkembanganak.com/panduan-stimulasianakcerdas',
      },
    },
    {
      id: 'konsultasi-dokter',
      name: 'Konsultasi Klinis & Screening Dokter Anak',
      title: 'Konsultasi Klinis & Screening Dokter Anak',
      slug: 'konsultasi-dokter',
      sku: 'CAM-KONSULTASI-03',
      category: 'Konsultasi Medis',
      product_type: 'SERVICE',
      type: 'service',
      price: 150000,
      promo_price: 0,
      description: 'Sesi konsultasi klinis 1-on-1 bersama dr. Harys Maulana (Nutrisi/GTM) & dr. Azizah Ridwan (Screening/Sensori).',
      image: combinedDoctorThumb,
      image_url: combinedDoctorThumb,
      is_active: true,
      is_unlimited: true,
      stock: 999999,
      weight_grams: 0,
      requires_shipping: false,
      fulfillment_metadata: {
        delivery_type: 'WHATSAPP_GROUP',
        whatsapp_number: '6285129992305',
        instructions: 'Tim asisten dokter akan mengonfirmasi jadwal konsultasi via WhatsApp.',
      },
    },
  ];

  const updatedMetadata = {
    ...(tenant.metadata || {}),
    products: cleanMetadataProducts,
    product: cleanMetadataProducts[0],
  };

  const { error: metaUpdErr } = await supabase
    .from('tenants')
    .update({ metadata: updatedMetadata })
    .eq('id', tenantId);

  if (metaUpdErr) {
    throw new Error(`Failed to update tenant metadata: ${metaUpdErr.message}`);
  }

  console.log('✅ Successfully updated tenants.metadata.products to strictly 3 official products.');
}

cleanupProducts().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
