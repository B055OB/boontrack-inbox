import fs from 'fs';
if (fs.existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}
if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}

import { getSupabaseAdmin } from '../lib/supabaseClient';
import { POST } from '../app/api/v1/tenants/[slug]/products/route';
import { NextRequest } from 'next/server';

async function verifyCatalogFix() {
  console.log('=== VERIFIKASI PERBAIKAN KATALOG & DUAL-WRITE FIX ===\n');

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Supabase admin client not initialized');
  }

  // 1. Verifikasi data saat ini di Supabase
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, slug, metadata')
    .eq('slug', 'tumbuh-kembang-anak')
    .single();

  if (tErr || !tenant) {
    throw new Error(`Tenant query failed: ${tErr?.message}`);
  }

  const metaProducts = tenant.metadata?.products || [];
  console.log(`[1] Verifikasi awal metadata.products: ditemukan ${metaProducts.length} produk.`);
  console.log('    SKU yang ada:', metaProducts.map((p: any) => p.sku).join(', '));

  // Pastikan produk redundan tidak ada
  const forbiddenSkus = ['SRV-EATGROW-CHAT', 'SRV-EATGROW-MEET', 'SRV-EATGROW-GMEET', 'ECO-PLAYGROW-01', 'DIG-PLAYGROW-01', 'SRV-SCREENING-KLINIK'];
  const hasForbidden = metaProducts.some((p: any) => forbiddenSkus.includes(p.sku));
  if (hasForbidden) {
    throw new Error('FAIL: Produk terlarang masih ada di metadata!');
  }
  console.log('    ✅ Tidak ada produk redundan di metadata.products.');

  // 2. Simulasi Edit & Save Produk CAM-KONSULTASI-03 via POST API Route
  console.log('\n[2] Menjalankan simulasi Save Produk CAM-KONSULTASI-03...');
  const consultationProduct = metaProducts.find((p: any) => p.sku === 'CAM-KONSULTASI-03');
  if (!consultationProduct) {
    throw new Error('CAM-KONSULTASI-03 tidak ditemukan di metadata!');
  }

  const updatePayload = {
    ...consultationProduct,
    description: 'Sesi konsultasi klinis 1-on-1 bersama dr. Harys Maulana (Nutrisi/GTM) & dr. Azizah Ridwan (Screening/Sensori). Dilengkapi resume medis resmi.',
    requires_shipping: false,
    weight_grams: 0,
    product_type: 'SERVICE',
  };

  const req = new NextRequest('http://localhost:3000/api/v1/tenants/tumbuh-kembang-anak/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatePayload),
  });

  const res = await POST(req, { params: Promise.resolve({ slug: 'tumbuh-kembang-anak' }) });
  const resData = await res.json();
  console.log('    Response Save API status:', res.status, 'success:', resData.success);

  if (!resData.success) {
    throw new Error(`API Save gagal: ${resData.error}`);
  }

  // 3. Verifikasi Database Pasca Save:
  console.log('\n[3] Memeriksa database Supabase pasca Save...');
  const { data: updatedTenant } = await supabase
    .from('tenants')
    .select('metadata')
    .eq('slug', 'tumbuh-kembang-anak')
    .single();

  const postSaveProducts = updatedTenant?.metadata?.products || [];
  console.log(`    Jumlah produk di metadata.products: ${postSaveProducts.length} (harus tepat 3)`);
  console.log('    SKU yang ada:', postSaveProducts.map((p: any) => p.sku).join(', '));

  if (postSaveProducts.length !== 3) {
    throw new Error(`FAIL: Jumlah produk adalah ${postSaveProducts.length}, bukan 3! Terjadi resurrection bug.`);
  }

  const postSaveHasForbidden = postSaveProducts.some((p: any) => forbiddenSkus.includes(p.sku));
  if (postSaveHasForbidden) {
    throw new Error('FAIL: Produk redundan lama bangkit kembali setelah Save!');
  }
  console.log('    ✅ Produk lama TIDAK muncul kembali setelah Save (Dual-Write Desync FIXED)!');

  // 4. Verifikasi Produk Konsultasi:
  const verifiedConsultation = postSaveProducts.find((p: any) => p.sku === 'CAM-KONSULTASI-03');
  console.log('\n[4] Detail Produk Konsultasi (CAM-KONSULTASI-03):');
  console.log('    - product_type:', verifiedConsultation?.product_type);
  console.log('    - requires_shipping:', verifiedConsultation?.requires_shipping);
  console.log('    - weight_grams:', verifiedConsultation?.weight_grams);
  console.log('    - image:', verifiedConsultation?.image);

  if (verifiedConsultation?.product_type !== 'SERVICE') {
    throw new Error(`FAIL: product_type bukan 'SERVICE', melainkan '${verifiedConsultation?.product_type}'`);
  }
  if (verifiedConsultation?.requires_shipping !== false) {
    throw new Error('FAIL: requires_shipping bukan false!');
  }
  if (!verifiedConsultation?.image?.includes('dr-harys-azizah-konsultasi.webp')) {
    throw new Error('FAIL: Thumbnail dokter gabungan tidak terpasang!');
  }

  // 5. Cek tabel SQL products
  const { data: sqlProds } = await supabase
    .from('products')
    .select('id, sku, title, product_type, requires_shipping, image_url')
    .eq('tenant_id', tenant.id);

  console.log('\n[5] Tabel SQL products untuk tenant:', sqlProds?.length, 'baris:');
  console.table(sqlProds);

  if (sqlProds?.length !== 3) {
    throw new Error(`FAIL: Tabel SQL products memiliki ${sqlProds?.length} baris, bukan 3!`);
  }

  console.log('\n🎉 SELURUH VERIFIKASI SELESAI & LULUS DENGAN SUKSES! 🎉');
}

verifyCatalogFix().catch((err) => {
  console.error('\n❌ Verification Error:', err);
  process.exit(1);
});
