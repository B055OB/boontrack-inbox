import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Helper: Parse .env manually without external dependency
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const TARGET_TENANT_ID = '46cf50c6-18ff-4c1d-88a4-d86001d754c7';
const TARGET_ORDER_ID = 'ORD-1790733673478-5155';

async function updateSolusiAds() {
  console.log('============================================================');
  console.log('🚀 EKSEKUSI AMAN: UPDATE METADATA & KATALOG TENANT "solusi-ads"');
  console.log('============================================================');

  // 1. Fetch current tenant
  const { data: tenant, error: fetchErr } = await supabase
    .from('tenants')
    .select('id, name, slug, category, tier, status, metadata')
    .eq('id', TARGET_TENANT_ID)
    .single();

  if (fetchErr || !tenant) {
    console.error('FAILED to fetch tenant:', fetchErr?.message);
    process.exit(1);
  }

  console.log(`[TARGET VALIDATED] Tenant: "${tenant.name}" (${tenant.slug}) - ID: ${tenant.id}`);

  // 2. Prepare payload
  const branding = {
    tagline: 'Scale Your Brand with Data-Driven Performance Ads',
    established_year: 2023,
    credentials: ['50+ Managed Brands', 'Meta Business Partner', 'TikTok Shop Partner'],
    instagram: 'https://www.instagram.com/solusiads',
  };

  const leadFilteringForm = {
    fields: [
      { name: 'full_name', label: 'Nama Lengkap', type: 'text', required: true },
      { name: 'city', label: 'Domisili Kota', type: 'text', required: true },
      { name: 'store_name', label: 'Nama Toko / Brand', type: 'text', required: true },
      { name: 'store_link', label: 'Link Toko (TikTok / Shopee)', type: 'url', required: true },
      {
        name: 'monthly_revenue',
        label: 'Omset Toko Saat Ini',
        type: 'select',
        options: ['< 10 Juta', '10 - 50 Juta', '50 - 100 Juta', '> 100 Juta'],
        required: true,
      },
    ],
  };

  const paymentConfig = {
    ...(tenant.metadata?.payment_config || {}),
    mode: 'SELLER_NATIVE_QRIS',
    enable_qris: true,
    dp_percentage: 50,
    voucher_code_potongan: 'KONSUL149K',
    voucher_potongan_value: 149000,
    unique_code_system: 'DOWNWARD',
  };

  const products = [
    {
      id: 'prod-01',
      sku: 'SOL-KONSUL-01',
      name: 'Tiket Konsultasi 1-on-1 (Booking Komitmen)',
      price: 149000,
      category: 'CONSULTATION',
      is_active: true,
      description: 'Sesi audit performa toko & funnel ads intensif 1-on-1. Biaya ini 100% memotong tagihan DP jika lanjut ambil jasa.',
      is_booking_fee: true,
      voucher_credit: 149000,
    },
    {
      id: 'prod-02',
      sku: 'SOL-SHOPEE-02',
      name: 'Jasa Shopee Ads Professional',
      price: 4500000,
      category: 'ADS_MANAGEMENT',
      is_active: true,
      description: 'Optimasi iklan berbayar Shopee (Search, Discovery, Live Ads) untuk peningkatan ROAS dan scaling omset.',
    },
    {
      id: 'prod-03',
      sku: 'SOL-TIKTOK-03',
      name: 'Jasa TikTok Ads Professional',
      price: 4500000,
      category: 'ADS_MANAGEMENT',
      is_active: true,
      description: 'Setup & scaling TikTok Shop Ads (Video Shopping Ads, LIVE Shopping Ads) berbasis audience research.',
    },
    {
      id: 'prod-04',
      sku: 'SOL-AFFCTR-04',
      name: 'Manage Affiliate via Affiliate Center',
      price: 3000000,
      category: 'AFFILIATE_SERVICE',
      is_active: true,
      description: 'Manajemen operasional 100 kreator afiliasi via marketplace native creator center.',
    },
    {
      id: 'prod-05',
      sku: 'SOL-AFFINK-05',
      name: 'Manage Affiliate via Inkubasi & WhatsApp',
      price: 4000000,
      category: 'AFFILIATE_SERVICE',
      is_active: true,
      description: 'Pendampingan private group WA & inkubasi intensif untuk 100 kreator afiliasi aktif.',
    },
    {
      id: 'prod-06',
      sku: 'SOL-BRIEF-06',
      name: 'Brief Konten Sales & Viral Angle',
      price: 2500000,
      category: 'CREATIVE_SERVICE',
      is_active: true,
      description: 'Penyusunan 90 brief konten terstruktur berorientasi penjualan langsung untuk talent/kreator.',
    },
    {
      id: 'prod-07',
      sku: 'SOL-FLASHSALE-07',
      name: 'Manage Campaign & Flash Sale Toko',
      price: 2500000,
      category: 'OPERATIONAL_SERVICE',
      is_active: true,
      description: 'Eksekusi kalender promosi, flash sale, voucher toko, dan event double-date marketplace.',
    },
    {
      id: 'prod-08',
      sku: 'SOL-CPAS-08',
      name: 'CPAS Shopee Meta Ads (Collab Ads)',
      price: 5000000,
      category: 'ADS_MANAGEMENT',
      is_active: true,
      description: 'Integrasi katalog dinamis Shopee ke Meta Ads untuk retargeting audiens hangat.',
    },
    {
      id: 'prod-09',
      sku: 'SOL-BNDTT-09',
      name: 'Bundling Paket TikTok Maintenance',
      price: 7500000,
      category: 'BUNDLING_PACKAGE',
      is_active: true,
      description: 'Paket hemat: Manajemen TikTok Ads + Inkubasi Affiliate + 90 Brief Konten.',
    },
    {
      id: 'prod-10',
      sku: 'SOL-BNDSHP-10',
      name: 'Bundling Shopee Ads Maintenance',
      price: 6500000,
      category: 'BUNDLING_PACKAGE',
      is_active: true,
      description: 'Paket hemat: Manajemen Shopee Ads + Manage Campaign Flash Sale + Optimasi CPAS.',
    },
  ];

  const aiKnowledge = [
    {
      category: 'FACT',
      topic: 'profil_agensi',
      question: 'siapa solusi ads agency / kredibilitas agensi',
      answer: 'Solusi Ads Agency adalah agensi digital marketing performa yang berdiri sejak 2023. Kami telah mengelola lebih dari 50 brand, serta berstatus resmi sebagai Meta Business Partner dan TikTok Shop Partner.',
    },
    {
      category: 'FACT',
      topic: 'tiket_konsultasi',
      question: 'apa itu konsultasi 1on1 / biaya konsultasi',
      answer: 'Layanan awal kami adalah Tiket Konsultasi 1-on-1 seharga Rp 149.000. Biaya ini 100% memotong tagihan DP jika kakak memutuskan mengambil layanan jasa bulanan kami.',
    },
    {
      category: 'RULE',
      topic: 'skema_pembayaran_jasa',
      question: 'bagaimana cara bayar jasa agency / termin pembayaran',
      answer: 'Setelah konsultasi 1-on-1 disepakati, pembayaran jasa menggunakan skema DP 50% di awal dikurangi potongan voucher Rp 149.000, dan sisa pelunasan 50% dibayarkan setelah progres campaign berjalan.',
    },
    {
      category: 'OBJECTION',
      topic: 'ragu_karena_omset_kecil',
      question: 'toko saya masih pemula / omset belum besar',
      answer: 'Justru melalui sesi konsultasi 1-on-1 Rp 149.000, tim expert kami akan membedah kelayakan toko dan memberikan arahan realistis sebelum kakak berinvestasi besar pada iklan berbayar.',
    },
    {
      category: 'CONVERSION',
      topic: 'ajakan_closing_konsul',
      question: 'cara daftar konsultasi / pesan jadwal',
      answer: 'Silakan isi form brief toko kakak di tautan etalase kami, lalu selesaikan pembayaran tiket booking Rp 149.000 via QRIS agar slot jadwal konsultasi langsung terkunci otomatis.',
    },
  ];

  // Deep merge into metadata
  const existingMetadata = tenant.metadata || {};
  const updatedMetadata = {
    ...existingMetadata,
    theme: 'midnight_luxe',
    visual_theme: 'midnight_luxe',
    theme_id: 'midnight_luxe',
    branding,
    lead_filtering_form: leadFilteringForm,
    payment_config: paymentConfig,
    products,
    ai_knowledge: aiKnowledge,
  };

  console.log('Mengupdate tabel tenants...');
  const { data: updatedTenant, error: updateTenantErr } = await supabase
    .from('tenants')
    .update({
      name: 'Solusi Ads Agency',
      category: 'CREATOR_AGENCY',
      business_type: 'CREATOR_AGENCY',
      metadata: {
        ...updatedMetadata,
        config_updated_at: new Date().toISOString(),
      },
    })
    .eq('id', TARGET_TENANT_ID)
    .select('id, name, slug, category, business_type, tier, status, metadata')
    .single();

  if (updateTenantErr) {
    console.error('FAILED to update tenant:', updateTenantErr.message);
    process.exit(1);
  }

  console.log('✅ BERHASIL UPDATE TENANT:');
  console.log(`  - Name: ${updatedTenant.name}`);
  console.log(`  - Category: ${updatedTenant.category}`);
  console.log(`  - Theme: ${updatedTenant.metadata?.theme}`);
  console.log(`  - Products Count: ${updatedTenant.metadata?.products?.length}`);
  console.log(`  - AI Knowledge Count: ${updatedTenant.metadata?.ai_knowledge?.length}`);
  console.log(`  - Lead Filtering Form: ${updatedTenant.metadata?.lead_filtering_form?.fields?.length} fields`);

  // 3. Update order ORD-1790733673478-5155 to PAID
  console.log(`\nMengonfirmasi pelunasan order ${TARGET_ORDER_ID}...`);
  const nowIso = new Date().toISOString();
  const { data: updatedOrder, error: updateOrderErr } = await supabase
    .from('orders')
    .update({
      status: 'PAID',
      payment_status: 'PAID',
      order_status: 'PAID',
      paid_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', TARGET_ORDER_ID)
    .select('id, tenant_slug, customer_name, customer_phone, gross_amount, status, payment_status, paid_at')
    .single();

  if (updateOrderErr) {
    console.error('FAILED to update order:', updateOrderErr.message);
  } else {
    console.log('✅ BERHASIL UPDATE ORDER DFY:');
    console.log(`  - Order ID: ${updatedOrder.id}`);
    console.log(`  - Customer: ${updatedOrder.customer_name} (${updatedOrder.customer_phone})`);
    console.log(`  - Status: ${updatedOrder.status} | Payment Status: ${updatedOrder.payment_status}`);
    console.log(`  - Paid At: ${updatedOrder.paid_at}`);
  }

  console.log('\n============================================================');
  console.log('✨ SEMUA PROSES UPDATE METADATA & ORDER SELESAI DENGAN SUKSES');
  console.log('============================================================');
}

updateSolusiAds().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
