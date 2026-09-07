/**
 * Script Pembaruan Metadata Builder Supabase untuk Produk 'cpm-24jam' (OnlineBoost ID)
 * Menuliskan data Hook & Hero, Problem & Solution, Us vs Them, Testimonials,
 * Offer & Bonus, serta Payment Methods ke tabel products dan tenants.metadata.
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTcyMzIsImV4cCI6MjEwMTk5MzIzMn0.Tn7MREcxcOyWzkhgz5t0XOzVOBagQ7PsH-JTch0ZF0M';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const BUILDER_DATA = {
  hook_hero: {
    headline: "Panduan Praktis Setup Traffic CPM: Tembus Impresi Pertama dalam 24 Jam",
    subheadline: "Rahasia membangun aliran traffic stabil, setup server-side CAPI anti-bocor, dan optimasi konversi kilat tanpa boncos atau akun restrict.",
    badge: "Penawaran Spesial Live Demo • Diskon 99%",
    banner_url: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=1200&auto=format&fit=crop"
  },
  problem_solution: {
    title: "Kenapa Traffic Iklan Sering Boncos Tanpa Hasil?",
    pain_points: [
      "Pixel & CAPI Kerap Buta Data (Browser privacy block bikin event konversi hilang dan optimasi AI Meta terganggu).",
      "Struktur Budgeting CBO/ABO Berantakan (Biaya CPM membengkak tanpa hasil lead atau sales).",
      "Akun Iklan Rentan Kena Restrict (Format landing page dan funnel keliru memicu penolakan sistem)."
    ],
    solution_title: "Blueprint 3 Modul CPM 24 Jam",
    solution_points: [
      "Setup CAPI Server-Side Presisi: Koneksi API anti-drop menjamin data konversi 100% terekam Meta.",
      "Split Budgeting Hemat CBO vs ABO: Alokasi budget terukur tembus impresi perdana dalam 24 jam.",
      "Funnel WhatsApp Instan: Lead capture otomatis dan konversi instan tanpa friksi teknis."
    ]
  },
  us_vs_them: [
    {
      id: "1",
      feature: "Alokasi Budget Testing",
      others: "Bakar budget jutaan rupiah untuk testing awal tanpa arah yang jelas.",
      us: "Formula hemat tembus impresi pertama dalam 24 jam dengan budget minimal."
    },
    {
      id: "2",
      feature: "Akurasi Tracking Event",
      others: "Tracking sering error/desync, pixel buta terkena blokir browser.",
      us: "Tracking CAPI presisi 100% server-side dengan event deduplication resmi."
    },
    {
      id: "3",
      feature: "Integrasi Funnel & Closing",
      others: "Setup funnel rumit berhari-hari, lead lama merespons dan rawan drop.",
      us: "Integrasi funnel WhatsApp Bot & Dynamic QRIS instan siap pakai."
    }
  ],
  testimonials: [
    {
      id: "t1",
      name: "Fajar R.",
      role: "Media Buyer",
      quote: "Setup CAPI to the point banget. Dalam 14 jam impresi tembus 12.000+ dengan CPM sangat stabil. Bot konversinya juga jalan otomatis.",
      badge: "12K+ Impresi dlm 14 Jam",
      rating: 5
    },
    {
      id: "t2",
      name: "Dian P.",
      role: "Store Owner",
      quote: "Sangat ngebantu pemula. Gak pusing coding, funnel langsung connect ke WA dan orderan perdana langsung pecah hari itu juga!",
      badge: "Zero Restrict • Lead Perdana",
      rating: 5
    }
  ],
  offer_bonus: {
    price: 1000,
    promo_price: 1000,
    facilities: [
      "Akses Penuh Modul Praktis CPM 24 Jam",
      "Template Flow Funnel WhatsApp Bot",
      "Checklist Integrasi CAPI"
    ],
    bonus_items: [
      {
        id: "b1",
        title: "Template Flow Funnel WhatsApp Bot",
        value: 199000,
        description: "Template pesan otomatis dan alur follow-up auto-closing di WhatsApp."
      },
      {
        id: "b2",
        title: "Checklist Integrasi CAPI & Anti-Restrict SOP",
        value: 149000,
        description: "Langkah demi langkah verifikasi domain dan setup event server token."
      },
      {
        id: "b3",
        title: "SOP Riset Audience CPM Rendah",
        value: 150000,
        description: "Strategi menemukan target audiens dengan CPM murah dan daya beli tinggi."
      },
      {
        id: "b4",
        title: "Script Chat WhatsApp Anti-Ghosting",
        value: 99000,
        description: "Formula balasan chat terbukti mengurangi cancel rate calon pembeli."
      }
    ],
    guarantee: "Akses materi instan dikirim via WhatsApp setelah pembayaran terkonfirmasi."
  },
  payment_methods: {
    enable_qris: true,
    enable_manual_transfer: false,
    default_method: "qris"
  }
};

// Konfigurasi kompatibilitas Single Page Checkout
const SINGLE_PAGE_CONFIG = {
  slug: "cpm-24jam",
  headline: BUILDER_DATA.hook_hero.headline,
  subheadline: BUILDER_DATA.hook_hero.subheadline,
  banner_url: BUILDER_DATA.hook_hero.banner_url,
  badge_text: BUILDER_DATA.hook_hero.badge,
  whatsapp_number: "6281224456454",
  discount_coupon: "LIVEDEMO1000",
  affiliate_commission_rate: 0,
  enable_qris: true,
  enable_manual_transfer: false,
  problem_title: BUILDER_DATA.problem_solution.title,
  pain_points: BUILDER_DATA.problem_solution.pain_points,
  solution_title: BUILDER_DATA.problem_solution.solution_title,
  solution_points: BUILDER_DATA.problem_solution.solution_points,
  comparison_rows: BUILDER_DATA.us_vs_them,
  testimonials: BUILDER_DATA.testimonials,
  bonus_items: BUILDER_DATA.offer_bonus.bonus_items,
  facilities: BUILDER_DATA.offer_bonus.facilities,
  guarantee: BUILDER_DATA.offer_bonus.guarantee,
};

async function updateSupabase() {
  console.log('🚀 Memulai update data dinamis builder ke Supabase...\n');

  // 1. UPDATE TABEL PRODUCTS
  console.log('1️⃣ Mengupdate tabel `products` untuk slug cpm-24jam...');
  const { data: updatedProd, error: prodErr } = await supabase
    .from('products')
    .update({
      title: "Modul Praktis CPM 24 Jam",
      description: BUILDER_DATA.hook_hero.subheadline,
      price: 1000,
      promo_price: 1000,
      image: BUILDER_DATA.hook_hero.banner_url,
      is_available: true,
      stock: 999,
      is_unlimited_stock: true,
      link_digital: "https://onlineboost.myr.id/course/cpm-24jam/",
      sku: "OB-CPM-24H"
    })
    .eq('slug', 'cpm-24jam')
    .select();

  if (prodErr) {
    console.error('❌ Gagal update tabel products:', prodErr);
  } else {
    console.log('✅ Berhasil update tabel products:', updatedProd?.[0]?.title);
  }

  // 2. FETCH & UPDATE TABEL TENANTS (ONLINEBOOST METADATA)
  console.log('\n2️⃣ Mengambil metadata tenant `onlineboost`...');
  const { data: tenantData, error: tenantFetchErr } = await supabase
    .from('tenants')
    .select('id, slug, metadata')
    .eq('slug', 'onlineboost')
    .single();

  if (tenantFetchErr) {
    console.error('❌ Gagal fetch tenant onlineboost:', tenantFetchErr);
    return;
  }

  const metadata = tenantData.metadata || {};

  const cpmFullProduct = {
    id: "4d22b740-35cf-48fc-af87-21b8c156df9f",
    sku: "OB-CPM-24H",
    name: "Modul Praktis CPM 24 Jam",
    title: "Modul Praktis CPM 24 Jam",
    slug: "cpm-24jam",
    type: "digital",
    category: "digital",
    price: 1000,
    promo_price: 1000,
    stock: 999,
    variants: "Format Digital • Akses Instan QRIS & WhatsApp",
    description: BUILDER_DATA.hook_hero.subheadline,
    image: BUILDER_DATA.hook_hero.banner_url,
    delivery_url: "https://onlineboost.myr.id/course/cpm-24jam/",
    link_digital: "https://onlineboost.myr.id/course/cpm-24jam/",
    download_url: "https://onlineboost.myr.id/course/cpm-24jam/",
    is_unlimited: true,
    is_unlimited_stock: true,
    // Field Builder Lengkap
    builder_metadata: BUILDER_DATA,
    hook_hero: BUILDER_DATA.hook_hero,
    problem_solution: BUILDER_DATA.problem_solution,
    us_vs_them: BUILDER_DATA.us_vs_them,
    testimonials: BUILDER_DATA.testimonials,
    offer_bonus: BUILDER_DATA.offer_bonus,
    payment_methods: BUILDER_DATA.payment_methods,
    single_page_config: SINGLE_PAGE_CONFIG,
  };

  // Update object metadata.product
  metadata.product = cpmFullProduct;

  // Update array metadata.products
  if (Array.isArray(metadata.products)) {
    let found = false;
    metadata.products = metadata.products.map((p) => {
      if (p.slug === 'cpm-24jam' || p.id === '4d22b740-35cf-48fc-af87-21b8c156df9f') {
        found = true;
        return cpmFullProduct;
      }
      return p;
    });
    if (!found) {
      metadata.products.push(cpmFullProduct);
    }
  } else {
    metadata.products = [cpmFullProduct];
  }

  metadata.updated_at = new Date().toISOString();

  console.log('3️⃣ Menyimpan metadata builder ke tabel `tenants`...');
  const { data: updatedTenant, error: tenantUpdateErr } = await supabase
    .from('tenants')
    .update({ metadata })
    .eq('slug', 'onlineboost')
    .select('id, slug, metadata');

  if (tenantUpdateErr) {
    console.error('❌ Gagal update metadata tenant:', tenantUpdateErr);
  } else {
    console.log('✅ Berhasil update metadata tenant onlineboost!');
    console.log('📦 Total produk di tenant:', updatedTenant?.[0]?.metadata?.products?.length);
    console.log('✨ Data builder tersimpan resmi di Supabase.');
  }
}

updateSupabase();
