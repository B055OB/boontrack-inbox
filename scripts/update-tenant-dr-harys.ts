import fs from 'fs';
if (fs.existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}
if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}

import { getSupabaseAdmin } from '../lib/supabaseClient';

async function updateTenantDrHarys() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Supabase admin client failed to initialize');
  }

  console.log('=== UPDATE METADATA & PRODUK TENANT TUMBUH-KEMBANG-ANAK ===');

  // 1. Fetch current tenant
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, slug, metadata, category')
    .eq('slug', 'tumbuh-kembang-anak')
    .single();

  if (tErr || !tenant) {
    throw new Error(`Failed to fetch tenant: ${tErr?.message}`);
  }

  const tenantId = tenant.id;
  console.log(`Tenant found: '${tenant.slug}' (ID: ${tenantId})`);

  const currentMetadata = tenant.metadata || {};
  let currentProducts = Array.isArray(currentMetadata.products) ? [...currentMetadata.products] : [];

  // 2. Update CAM-KONSULTASI-03
  // Link Asesmen KIDMAP: https://screening.tumbuhkembanganak.com/assessment
  // Jadwal Google Meet: Durasi: 30 menit | Senin–Jumat, 08.00–11.30 WIB (prioritas chat tetap aktif)
  const assessmentUrl = 'https://screening.tumbuhkembanganak.com/assessment';
  const gmeetScheduleText = 'Durasi: 30 menit | Senin–Jumat, 08.00–11.30 WIB (prioritas chat tetap aktif)';

  const consultationProductIndex = currentProducts.findIndex(
    (p: any) => p.sku === 'CAM-KONSULTASI-03' || p.slug === 'konsultasi-dokter'
  );

  const updatedConsultationProduct = {
    ...(consultationProductIndex >= 0 ? currentProducts[consultationProductIndex] : {}),
    id: consultationProductIndex >= 0 ? currentProducts[consultationProductIndex].id : 'd31a1804-c99a-4bab-b3e3-223ce189e352',
    name: 'Konsultasi Klinis & Screening Dokter Anak',
    title: 'Konsultasi Klinis & Screening Dokter Anak',
    slug: 'konsultasi-dokter',
    sku: 'CAM-KONSULTASI-03',
    category: 'Konsultasi Medis',
    product_type: 'SERVICE',
    type: 'service',
    price: 150000,
    promo_price: 0,
    description: 'Sesi konsultasi klinis 1-on-1 bersama dr. Harys Maulana (Nutrisi/GTM) & dr. Azizah Ridwan (Screening/Sensori). Dilengkapi resume klinis & form asesmen KIDMAP.',
    image: '/tenants/tumbuh-kembang-anak/dr-harys-azizah-konsultasi.webp',
    image_url: '/tenants/tumbuh-kembang-anak/dr-harys-azizah-konsultasi.webp',
    download_url: assessmentUrl,
    link_digital: assessmentUrl,
    is_active: true,
    is_unlimited: true,
    stock: 999999,
    weight_grams: 0,
    requires_shipping: false,
    fulfillment_metadata: {
      delivery_type: 'ASSESSMENT_FORM',
      access_url: assessmentUrl,
      assessment_url: assessmentUrl,
      whatsapp_number: '6285129992305',
      gmeet_schedule: 'Senin–Jumat, 08.00–11.30 WIB',
      session_duration: '30 menit',
      duration_minutes: 30,
      instructions: `Silakan isi Formulir Asesmen Klinis KIDMAP di ${assessmentUrl} sebelum sesi dimulai. Sesi Google Meet (30 menit) dilaksanakan Senin–Jumat 08.00–11.30 WIB. Prioritas chat konsultasi tetap aktif.`,
      notes: gmeetScheduleText,
    },
    single_page_config: {
      ...(consultationProductIndex >= 0 ? currentProducts[consultationProductIndex].single_page_config : {}),
      assessment_url: assessmentUrl,
      gmeet_schedule: gmeetScheduleText,
    },
  };

  if (consultationProductIndex >= 0) {
    currentProducts[consultationProductIndex] = updatedConsultationProduct;
  } else {
    currentProducts.push(updatedConsultationProduct);
  }

  // 3. Tambahkan / Update E-Course PLAY N GROW (Khusus Cirebon)
  // Harga normal: Rp 99.000 | Harga promo: Rp 75.000
  // Akses link materi: https://tumbuhkembanganak.com/aksesplaygrowth
  const playGrowthUrl = 'https://tumbuhkembanganak.com/aksesplaygrowth';
  const playGrowSku = 'ECO-PLAYGROW-01';
  const playGrowSlug = 'play-n-grow-cirebon';

  const playGrowIndex = currentProducts.findIndex(
    (p: any) => p.sku === playGrowSku || p.slug === playGrowSlug || p.name?.includes('PLAY N GROW')
  );

  const playGrowProduct = {
    ...(playGrowIndex >= 0 ? currentProducts[playGrowIndex] : {}),
    id: playGrowIndex >= 0 ? currentProducts[playGrowIndex].id : 'play-n-grow-cirebon',
    name: 'E-Course PLAY N GROW (Khusus Cirebon)',
    title: 'E-Course PLAY N GROW (Khusus Cirebon)',
    slug: playGrowSlug,
    sku: playGrowSku,
    category: 'Modul Stimulasi',
    product_type: 'DIGITAL_FILE',
    type: 'digital',
    price: 75000,
    promo_price: 99000,
    description: 'Panduan lengkap & video stimulasi sensori motorik anak usia 0-5 tahun khusus wilayah Cirebon & sekitarnya oleh dr. Azizah Ridwan.',
    image: '/tenants/tumbuh-kembang-anak/panduan-stimulasianakcerdas/01_visual.webp',
    image_url: '/tenants/tumbuh-kembang-anak/panduan-stimulasianakcerdas/01_visual.webp',
    download_url: playGrowthUrl,
    link_digital: playGrowthUrl,
    is_active: true,
    is_unlimited: true,
    stock: 999999,
    weight_grams: 0,
    requires_shipping: false,
    fulfillment_metadata: {
      delivery_type: 'DOWNLOAD_LINK',
      access_url: playGrowthUrl,
      instructions: `Akses materi E-Course Play N Grow melalui link: ${playGrowthUrl}`,
    },
  };

  if (playGrowIndex >= 0) {
    currentProducts[playGrowIndex] = playGrowProduct;
  } else {
    currentProducts.push(playGrowProduct);
  }

  // 4. Update Payout Bank Account dr. Harys:
  // Bank: BCA | Nama: Muhamad Harys Maulana | Rekening: 3741672471
  const bankAccountData = {
    bank_name: 'BCA',
    account_number: '3741672471',
    account_holder: 'Muhamad Harys Maulana',
    is_active: true,
  };

  const updatedMetadata = {
    ...currentMetadata,
    assessment_url: assessmentUrl,
    kidmap_url: assessmentUrl,
    kidmap_assessment_url: assessmentUrl,
    operational_hours: 'Senin – Jumat, 08.00 – 11.30 WIB',
    operating_hours: 'Senin – Jumat, 08.00 – 11.30 WIB',
    consultation_hours: 'Senin – Jumat, 08.00 – 11.30 WIB (Durasi 30 menit per sesi)',
    google_meet_schedule: {
      duration: '30 menit',
      days: 'Senin–Jumat',
      hours: '08.00–11.30 WIB',
      priority_chat: 'Aktif',
      notes: gmeetScheduleText,
    },
    bank_account: bankAccountData,
    bank_accounts: [bankAccountData],
    payout_bank: bankAccountData,
    payment_settings: {
      ...(currentMetadata.payment_settings || {}),
      bank_accounts: [bankAccountData],
    },
    payment_config: {
      ...(currentMetadata.payment_config || {}),
      bank_accounts: [bankAccountData],
    },
    products: currentProducts,
    product: currentProducts[0],
  };

  // 5. Update tenants table
  const { error: metaUpdateErr } = await supabase
    .from('tenants')
    .update({ metadata: updatedMetadata })
    .eq('id', tenantId);

  if (metaUpdateErr) {
    throw new Error(`Failed to update tenant metadata: ${metaUpdateErr.message}`);
  }
  console.log('✅ Successfully updated tenants.metadata in Supabase!');

  // 6. Sync/Upsert to SQL `products` table
  // 6a. Sync CAM-KONSULTASI-03
  const { error: sqlConsErr } = await supabase
    .from('products')
    .update({
      title: updatedConsultationProduct.name,
      description: updatedConsultationProduct.description,
      product_type: 'SERVICE',
      requires_shipping: false,
      image: updatedConsultationProduct.image,
      image_url: updatedConsultationProduct.image,
      price: updatedConsultationProduct.price,
      promo_price: updatedConsultationProduct.promo_price,
      link_digital: assessmentUrl,
      fulfillment_metadata: updatedConsultationProduct.fulfillment_metadata,
    })
    .eq('tenant_id', tenantId)
    .eq('sku', 'CAM-KONSULTASI-03');

  if (sqlConsErr) {
    console.warn('Note on updating CAM-KONSULTASI-03 in products table:', sqlConsErr.message);
  } else {
    console.log('✅ Successfully updated CAM-KONSULTASI-03 in products table!');
  }

  // 6b. Upsert E-Course PLAY N GROW (Khusus Cirebon) in SQL products table
  const { data: existingPlayGrow } = await supabase
    .from('products')
    .select('id')
    .eq('tenant_id', tenantId)
    .or(`sku.eq.${playGrowSku},slug.eq.${playGrowSlug}`)
    .maybeSingle();

  const playGrowSqlPayload = {
    tenant_id: tenantId,
    title: playGrowProduct.name,
    slug: playGrowSlug,
    description: playGrowProduct.description,
    price: playGrowProduct.price,
    promo_price: playGrowProduct.promo_price,
    image: playGrowProduct.image,
    image_url: playGrowProduct.image,
    category: playGrowProduct.category,
    stock: 999999,
    is_unlimited_stock: true,
    asset_reference: `product:${playGrowSlug}`,
    license_status: 'UNVERIFIED',
    product_type: 'DIGITAL_FILE',
    sku: playGrowSku,
    is_active: true,
    requires_shipping: false,
    link_digital: playGrowthUrl,
    fulfillment_metadata: playGrowProduct.fulfillment_metadata,
  };

  if (existingPlayGrow?.id) {
    await supabase.from('products').update(playGrowSqlPayload).eq('id', existingPlayGrow.id);
    console.log('✅ Successfully updated PLAY N GROW in products table!');
  } else {
    await supabase.from('products').insert(playGrowSqlPayload);
    console.log('✅ Successfully inserted PLAY N GROW into products table!');
  }

  // 7. Verify result
  const { data: finalTenant } = await supabase
    .from('tenants')
    .select('metadata')
    .eq('slug', 'tumbuh-kembang-anak')
    .single();

  const { data: finalSqlProds } = await supabase
    .from('products')
    .select('id, sku, slug, title, price, promo_price, product_type, requires_shipping, link_digital')
    .eq('tenant_id', tenantId);

  console.log('\n--- FINAL VERIFICATION RESULT ---');
  console.log('Metadata bank_account:', finalTenant?.metadata?.bank_account);
  console.log('Metadata assessment_url:', finalTenant?.metadata?.assessment_url);
  console.log('Metadata google_meet_schedule:', finalTenant?.metadata?.google_meet_schedule);
  console.log(`Metadata products count: ${finalTenant?.metadata?.products?.length}`);
  console.table(finalSqlProds);
}

updateTenantDrHarys().catch((err) => {
  console.error('Error updating tenant:', err);
  process.exit(1);
});
