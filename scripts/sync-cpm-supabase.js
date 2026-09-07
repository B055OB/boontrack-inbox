/**
 * Script Sinkronisasi Supabase untuk Produk CPM OnlineBoost:
 * 1. Selaraskan slug 'modul-praktis-cpm-24-jam' & fallback alias 'cpm-24jam'
 * 2. Update nomor WhatsApp resmi tenant & produk menjadi 62815395554489
 * 3. Kunci harga di Rp 1.000 (price & promo_price)
 * 4. Aktifkan metode QRIS secara default
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mpluzajlzpregmjwpjqr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTcyMzIsImV4cCI6MjEwMTk5MzIzMn0.Tn7MREcxcOyWzkhgz5t0XOzVOBagQ7PsH-JTch0ZF0M';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const WA_NUMBER = '62815395554489';
const PRIMARY_SLUG = 'modul-praktis-cpm-24-jam';
const ALIASES = ['cpm-24jam', 'cpm-24-jam', 'modul-praktis-cpm-24-jam'];

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

const SINGLE_PAGE_CONFIG = {
  slug: PRIMARY_SLUG,
  headline: BUILDER_DATA.hook_hero.headline,
  subheadline: BUILDER_DATA.hook_hero.subheadline,
  banner_url: BUILDER_DATA.hook_hero.banner_url,
  badge_text: BUILDER_DATA.hook_hero.badge,
  whatsapp_number: WA_NUMBER,
  discount_coupon: "",
  affiliate_commission_rate: 0,
  enable_qris: true,
  enable_manual_transfer: false,
  problem_title: BUILDER_DATA.problem_solution.title,
  pain_points: BUILDER_DATA.problem_solution.pain_points,
  solution_title: BUILDER_DATA.problem_solution.solution_title,
  solution_points: BUILDER_DATA.problem_solution.solution_points,
  comparison_rows: BUILDER_DATA.us_vs_them,
  testimonials: BUILDER_DATA.testimonials,
  bonus_items: BUILDER_DATA.offer_bonus.bonus_items
};

async function runSync() {
  console.log('🔄 Memulai sinkronisasi Supabase...');

  // 1. Ambil tenant onlineboost
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, slug, metadata')
    .eq('slug', 'onlineboost')
    .single();

  if (tErr || !tenant) {
    console.error('❌ Gagal mengambil data tenant onlineboost:', tErr);
    process.exit(1);
  }

  const metadata = tenant.metadata || {};
  metadata.whatsapp_number = WA_NUMBER;
  let products = metadata.products || [];

  // Update atau insert produk di array products tenant
  let updated = false;
  products = products.map((p) => {
    const isCpm = (p.slug && (p.slug === 'cpm-24jam' || p.slug === PRIMARY_SLUG || p.slug.includes('cpm'))) ||
                  (p.name && p.name.toLowerCase().includes('cpm 24 jam'));
    if (isCpm) {
      updated = true;
      console.log(`✅ Memperbarui metadata produk: ${p.name} -> slug: ${PRIMARY_SLUG}`);
      return {
        ...p,
        slug: PRIMARY_SLUG,
        aliases: ALIASES,
        name: "Modul Praktis CPM 24 Jam",
        title: "Modul Praktis CPM 24 Jam",
        price: 1000,
        promo_price: 1000,
        whatsapp_number: WA_NUMBER,
        builder_metadata: BUILDER_DATA,
        hook_hero: BUILDER_DATA.hook_hero,
        problem_solution: BUILDER_DATA.problem_solution,
        us_vs_them: BUILDER_DATA.us_vs_them,
        testimonials: BUILDER_DATA.testimonials,
        offer_bonus: BUILDER_DATA.offer_bonus,
        payment_methods: BUILDER_DATA.payment_methods,
        single_page_config: SINGLE_PAGE_CONFIG
      };
    }
    return p;
  });

  if (!updated) {
    console.log('Menambahkan produk baru ke tenant metadata...');
    products.push({
      id: Date.now(),
      slug: PRIMARY_SLUG,
      aliases: ALIASES,
      name: "Modul Praktis CPM 24 Jam",
      title: "Modul Praktis CPM 24 Jam",
      price: 1000,
      promo_price: 1000,
      whatsapp_number: WA_NUMBER,
      builder_metadata: BUILDER_DATA,
      hook_hero: BUILDER_DATA.hook_hero,
      problem_solution: BUILDER_DATA.problem_solution,
      us_vs_them: BUILDER_DATA.us_vs_them,
      testimonials: BUILDER_DATA.testimonials,
      offer_bonus: BUILDER_DATA.offer_bonus,
      payment_methods: BUILDER_DATA.payment_methods,
      single_page_config: SINGLE_PAGE_CONFIG
    });
  }

  metadata.products = products;
  metadata.updated_at = new Date().toISOString();

  // Update tenant metadata di Supabase
  const { error: upTenantErr } = await supabase
    .from('tenants')
    .update({ metadata })
    .eq('id', tenant.id);

  if (upTenantErr) {
    console.error('❌ Gagal update tenant metadata:', upTenantErr.message);
  } else {
    console.log('✅ Berhasil update tenant metadata (whatsapp_number & products)');
  }

  // 2. Update tabel products
  const { error: prodErr } = await supabase
    .from('products')
    .update({
      slug: PRIMARY_SLUG,
      price: 1000,
      promo_price: 1000,
      title: 'Modul Praktis CPM 24 Jam'
    })
    .or(`slug.eq.cpm-24jam,slug.eq.${PRIMARY_SLUG}`);

  if (prodErr) {
    console.warn('⚠️ Catatan update tabel products:', prodErr.message);
  } else {
    console.log('✅ Berhasil update tabel products (slug, price, promo_price)');
  }

  console.log('🎉 Selesai sinkronisasi database Supabase!');
}

runSync();
