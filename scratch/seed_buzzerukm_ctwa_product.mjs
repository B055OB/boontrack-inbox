import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mpluzajlzpregmjwpjqr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTcyMzIsImV4cCI6MjEwMTk5MzIzMn0.Tn7MREcxcOyWzkhgz5t0XOzVOBagQ7PsH-JTch0ZF0M';

const supabase = createClient(supabaseUrl, supabaseKey);

const newProduct = {
  id: 1789799200000,
  sku: 'CTWA-7DAY-001',
  name: '7-Day Sprint CTWA Mastery (Closing Otomatis Tanpa Admin Ribet)',
  title: '7-Day Sprint CTWA Mastery (Closing Otomatis Tanpa Admin Ribet)',
  slug: 'ctwa-mastery-7day',
  type: 'digital',
  product_type: 'DIGITAL',
  category: 'Digital',
  price: 500000,
  promo_price: 99000,
  stock: 50,
  is_unlimited: false,
  is_unlimited_stock: false,
  variants: 'Batch Intensif • 50 Seat Kuota Terbatas',
  promo: 'BATCH INTENSIF: HANYA 50 SEAT',
  custom_badge: 'BATCH INTENSIF: HANYA 50 SEAT',
  description: 'Pelajari metode baru 7-Day Sprint CTWA Mastery bersama Kang Sakti: Bongkar rahasia alur iklan Click-to-WhatsApp langsung closing otomatis via Dynamic QRIS & auto-ongkir tanpa admin repot.',
  download_url: 'https://chat.whatsapp.com/invite/ctwa-mastery-7day',
  link_digital: 'https://chat.whatsapp.com/invite/ctwa-mastery-7day',
  image: '/ctwa-mastery-banner.jpg',
  image_url: '/ctwa-mastery-banner.jpg',
  cta_label: 'Daftar Kelas Sekarang - Rp 99.000',
  checkout_type: 'internal',
  weight_grams: 0,
  fulfillment_metadata: {
    delivery_type: 'WHATSAPP_GROUP',
    access_url: 'https://chat.whatsapp.com/invite/ctwa-mastery-7day',
    instructions: 'Terima kasih sudah mendaftar 7-Day Sprint CTWA Mastery! Silakan klik tombol di bawah untuk bergabung ke Grup WhatsApp Kelas Eksklusif bersama Kang Sakti.'
  },
  facilities: [
    'Hari 1: Fondasi Toko & Infrastruktur Otomasi (Setup BoonTrack & Dynamic QRIS)',
    'Hari 2: Kurasi Produk & Upload Katalog Cepat (Margin sehat & auto-ongkir real-time)',
    'Hari 3: Meta Ads Setup (Performance Goal: "Maximise number of purchases through messaging")',
    'Hari 4: Hook, Angle & Format Kreatif Iklan (Greeting message auto-redirect)',
    'Hari 5: Integrasi Tracking & Server CAPI Anti-Bocor',
    'Hari 6: Launching & Pembacaan Data Metrik Awal (Evaluasi checkout rate)',
    'Hari 7: Scale-Up & Optimasi Margin Bersih (Database repeat order gratis)'
  ],
  features: [
    'Hari 1: Fondasi Toko & Infrastruktur Otomasi (Setup BoonTrack & Dynamic QRIS)',
    'Hari 2: Kurasi Produk & Upload Katalog Cepat (Margin sehat & auto-ongkir real-time)',
    'Hari 3: Meta Ads Setup (Performance Goal: "Maximise number of purchases through messaging")',
    'Hari 4: Hook, Angle & Format Kreatif Iklan (Greeting message auto-redirect)',
    'Hari 5: Integrasi Tracking & Server CAPI Anti-Bocor',
    'Hari 6: Launching & Pembacaan Data Metrik Awal (Evaluasi checkout rate)',
    'Hari 7: Scale-Up & Optimasi Margin Bersih (Database repeat order gratis)'
  ],
  single_page_config: {
    slug: 'ctwa-mastery-7day',
    badge_text: 'BATCH INTENSIF: HANYA 50 SEAT',
    headline: 'Capek Pasang Iklan CTWA Tapi Ujung-ujungnya Boncos & Admin Kewalahan?',
    subheadline: 'Pelajari metode baru 7-Day Sprint CTWA Mastery bersama Kang Sakti: Bongkar rahasia alur iklan Click-to-WhatsApp langsung closing otomatis via Dynamic QRIS & auto-ongkir tanpa admin repot.',
    banner_url: '/ctwa-mastery-banner.jpg',
    cta_label: 'Daftar Kelas Sekarang - Rp 99.000',
    problem_title: 'Kenapa Iklan WA Sering Boncos?',
    pain_points: [
      '❌ Chat menumpuk hanya tanya "ongkir ke kota X berapa?".',
      '❌ Calon pembeli kabur saat diminta transfer manual via rekening bank.',
      '❌ Algoritma iklan cuma mendatangkan penanya iseng tanpa niat beli.'
    ],
    solution_title: 'Solusi & 7-Day Sprint Syllabus',
    solution_points: [
      'Hari 1: Fondasi Toko & Infrastruktur Otomasi (Setup BoonTrack & Dynamic QRIS)',
      'Hari 2: Kurasi Produk & Upload Katalog Cepat (Margin sehat & auto-ongkir real-time)',
      'Hari 3: Meta Ads Setup (Performance Goal: "Maximise number of purchases through messaging")',
      'Hari 4: Hook, Angle & Format Kreatif Iklan (Greeting message auto-redirect)',
      'Hari 5: Integrasi Tracking & Server CAPI Anti-Bocor',
      'Hari 6: Launching & Pembacaan Data Metrik Awal (Evaluasi checkout rate)',
      'Hari 7: Scale-Up & Optimasi Margin Bersih (Database repeat order gratis)'
    ],
    comparison_rows: [
      {
        id: 'c1',
        feature: 'Alur Closing Pembeli',
        others: 'Admin harus balas chat manual satu per satu, cek mutasi bank & hitung ongkir manual.',
        us: 'Otomasi penuh via Dynamic QRIS & auto-ongkir real-time, closing lunas dalam hitungan detik.'
      },
      {
        id: 'c2',
        feature: 'Kualitas Lead Iklan',
        others: 'Banyak penanya iseng "P" atau ghosting saat diminta transfer ke rekening.',
        us: 'Algoritma Meta Ads teroptimasi untuk calon pembeli serius berdaya beli tinggi.'
      },
      {
        id: 'c3',
        feature: 'Akurasi Tracking CAPI',
        others: 'Pixel buta & data konversi hilang akibat update privasi browser / iOS.',
        us: '100% Server-side CAPI terintegrasi anti-bocor dengan deduplikasi resmi.'
      }
    ],
    bonus_items: [
      {
        id: 'b1',
        title: '🎁 GRATIS Akses Akun SaaS BoonTrack Paket Ads Performance',
        value: 299000,
        description: 'Akses penuh fitur CAPI server-side, multi-rotator CS, dan Dynamic QRIS 0% MDR.'
      },
      {
        id: 'b2',
        title: '🎁 Akses Grup Diskusi & Pendampingan Praktik bersama Kang Sakti',
        value: 350000,
        description: 'Tanya jawab langsung, bedah campaign iklan, dan sesi troubleshooting teknis intensif.'
      },
      {
        id: 'b3',
        title: '🎁 Rekaman Sesi Praktik & Template Copywriting Siap Pakai',
        value: 150000,
        description: 'Template angle copywriting, hook iklan gambar/video, dan SOP skrip balasan WhatsApp.'
      }
    ],
    enable_qris: true,
    enable_manual_transfer: false,
    discount_coupon: '',
    affiliate_commission_rate: 0
  },
  metadata: {
    cta_label: 'Daftar Kelas Sekarang - Rp 99.000',
    checkout_type: 'internal',
    requires_shipping: false
  }
};

async function seed() {
  console.log("Seeding product 'ctwa-mastery-7day' to tenant 'buzzerukm' in Supabase...");

  const { data: tenant, error: fetchErr } = await supabase
    .from('tenants')
    .select('id, slug, name, metadata')
    .eq('slug', 'buzzerukm')
    .maybeSingle();

  if (fetchErr || !tenant) {
    console.error('Error fetching buzzerukm tenant:', fetchErr);
    return;
  }

  const currentProducts = Array.isArray(tenant.metadata?.products) ? tenant.metadata.products : [];
  // Hapus jika sudah ada slug yang sama, lalu tambahkan produk terbaru
  const filtered = currentProducts.filter((p) => p.slug !== 'ctwa-mastery-7day');
  const updatedProducts = [newProduct, ...filtered];

  const updatedMetadata = {
    ...tenant.metadata,
    products: updatedProducts,
  };

  const { error: updateErr } = await supabase
    .from('tenants')
    .update({ metadata: updatedMetadata })
    .eq('id', tenant.id);

  if (updateErr) {
    console.error('Error updating tenants table:', updateErr);
  } else {
    console.log('✅ Successfully updated tenants.metadata.products for buzzerukm!');
  }

  // Also insert or upsert into products table
  const { data: existingSqlProd } = await supabase
    .from('products')
    .select('id')
    .eq('slug', 'ctwa-mastery-7day')
    .maybeSingle();

  const sqlPayload = {
    tenant_id: tenant.id,
    title: newProduct.name,
    slug: newProduct.slug,
    description: newProduct.description,
    price: newProduct.price,
    promo_price: newProduct.promo_price,
    product_type: 'DIGITAL',
    category: 'Digital',
    image: newProduct.image,
    stock: 50,
    is_unlimited_stock: false,
    link_digital: newProduct.download_url,
    sku: newProduct.sku,
    is_available: true,
    fulfillment_metadata: {
      ...newProduct.fulfillment_metadata,
      single_page_config: newProduct.single_page_config,
    }
  };

  if (existingSqlProd) {
    const { error: sqlUpdateErr } = await supabase
      .from('products')
      .update(sqlPayload)
      .eq('id', existingSqlProd.id);
    console.log('Products table update result:', sqlUpdateErr || '✅ Updated in products table');
  } else {
    const { error: sqlInsertErr } = await supabase
      .from('products')
      .insert({
        id: 'c7ba0001-7day-ctwa-8888-000000000001',
        ...sqlPayload,
      });
    console.log('Products table insert result:', sqlInsertErr || '✅ Inserted into products table');
  }
}

seed();
