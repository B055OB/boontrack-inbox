export interface VoucherConfig {
  code: string;
  discount_type: 'nominal' | 'percentage';
  discount_value: number; // Diskon flat (Rp) atau persentase (%)
  shipping_discount_type?: 'none' | 'flat' | 'free'; // Khusus produk fisik
  shipping_discount_value?: number; // Subsidi ongkir (Rp) jika tipe 'flat'
  min_spend?: number; // Batas minimal belanja (opsional, Rp)
}

export interface ComparisonItem {
  id: string;
  feature: string;       // Kriteria / Aspek (e.g. "Sistem Riset & Tracking")
  others: string;        // Cara Lain / Lama (Them)
  us: string;            // Solusi Produk Ini (Us)
}

export interface BonusItem {
  id: string;
  title: string;         // e.g. "Template SOP Media Buyer & Copywriting AI"
  value: number;         // Nilai taksiran dalam Rp (e.g. 299000)
  description?: string;
}

export interface TestimonialItem {
  id: string;
  name: string;
  role: string;
  quote: string;
  badge?: string;
  rating?: number;
}

export interface ClientLogoItem {
  name: string;
  logo_url: string;
  link_url?: string;
  category?: string;
}

export interface FaqItem {
  question: string;
  answer: string;
  id?: string;
  q?: string;
  a?: string;
}

export interface SinglePageConfig {
  slug?: string;

  // ── Toggle Visibility: 8 Canonical Sections ──
  enable_hero?: boolean;              // default: true
  enable_client_logos?: boolean;      // default: false
  enable_problem_solution?: boolean;  // default: true
  enable_us_vs_them?: boolean;        // default: true
  enable_testimonials?: boolean;      // default: true
  enable_offer?: boolean;             // default: true
  enable_faq?: boolean;               // default: false
  enable_payment?: boolean;           // default: true

  // 1. Hook & Hero
  headline: string;
  subheadline: string;
  banner_url: string;
  badge_text?: string;

  // 2. Client Logos / Social Proof Grid
  client_logos?: ClientLogoItem[];

  // 3. Problem, Agitation & Solution
  problem_title?: string;
  pain_points?: string[];       // Poin-poin masalah audiens
  problem_image_url?: string;   // Ilustrasi masalah di sela teks
  agitation_title?: string;
  agitation_points?: string[];  // Poin-poin eskalasi/dampak masalah
  solution_title?: string;
  solution_points?: string[];   // Poin-poin solusi & keunggulan

  // 4. Tabel Perbandingan (Us vs Them)
  comparison_rows?: ComparisonItem[];

  // 5. Social Proof / Testimoni
  testimonial_images?: string[]; // Hingga 3 screenshot bukti/chat
  testimonials?: TestimonialItem[]; // Testimoni teks peserta

  // 6. Offer & Bonus
  bonus_items?: BonusItem[];

  // 7. FAQ (Pertanyaan yang Sering Diajukan)
  faqs?: Array<{ question: string; answer: string; id?: string; q?: string; a?: string }>;

  // 8. Mode Single-Page / Cartless Funnel / Bayar & Voucher
  direct_checkout_only?: boolean;
  discount_coupon: string;
  voucher?: VoucherConfig;
  enable_qris: boolean;
  enable_manual_transfer: boolean;
  affiliate_commission_rate: number;
  whatsapp_number?: string;
  cta_label?: string;
}

export type ProductType =
  | 'PHYSICAL'
  | 'DIGITAL'
  | 'FOOD'
  | 'LOCAL_SERVICE'
  | 'FIELD_SERVICE'
  | 'PROFESSIONAL_SERVICE'
  | 'SERVICE'
  | 'AGENCY'
  | 'CREATOR';

export type FulfillmentStrategy = 'PHYSICAL' | 'DIGITAL' | 'SERVICE';

export interface FulfillmentMetadata {
  delivery_type?: 'DOWNLOAD_LINK' | 'LICENSE_KEY' | 'BRIEF_FORM' | 'WHATSAPP_GROUP' | 'CALENDAR_LINK' | string;
  access_url?: string;
  instructions?: string;
  license_key?: string;
  [key: string]: any;
}

export interface FulfillmentRequirements {
  strategy: FulfillmentStrategy;
  requiresAddress: boolean;
  requiresShipping: boolean;
  requiresWeight: boolean;
  requiresDeliveryPayload: boolean;
  requiresServiceSchedule: boolean;
  requiresBooking: boolean;
}

export function resolveFulfillmentRequirements(productType?: ProductType | string): FulfillmentRequirements {
  const normType = (productType || '').toUpperCase().trim();
  switch (normType) {
    case 'PHYSICAL':
    case 'FOOD':
    case 'FISIK':
      return {
        strategy: 'PHYSICAL',
        requiresAddress: true,
        requiresShipping: true,
        requiresWeight: true,
        requiresDeliveryPayload: false,
        requiresServiceSchedule: false,
        requiresBooking: false,
      };
    case 'FIELD_SERVICE':
    case 'LOCAL_SERVICE':
    case 'SERVICE':
    case 'PROFESSIONAL_SERVICE':
    case 'AGENCY':
    case 'JASA':
      return {
        strategy: 'SERVICE',
        requiresAddress: true,
        requiresShipping: false,
        requiresWeight: false,
        requiresDeliveryPayload: false,
        requiresServiceSchedule: true,
        requiresBooking: true,
      };
    case 'DIGITAL':
    case 'CREATOR':
    case 'ECOURSE':
    case 'COURSE':
    default:
      return {
        strategy: 'DIGITAL',
        requiresAddress: false,
        requiresShipping: false,
        requiresWeight: false,
        requiresDeliveryPayload: true,
        requiresServiceSchedule: false,
        requiresBooking: false,
      };
  }
}

export interface ProductItem {
  id: number | string;
  name: string;
  slug?: string;
  is_active?: boolean;
  category: 'terlaris' | 'digital' | 'fisik' | string;
  type?: 'physical' | 'digital' | 'fnb' | 'service' | string;
  product_type?: ProductType;
  custom_badge?: string;
  price: number;
  promo_price?: number;
  variants?: string;
  promo?: string;
  description: string;
  download_url?: string;
  image: string;
  image_url?: string;
  stock: number;
  sku?: string;
  is_unlimited?: boolean;
  weight_grams?: number;
  fulfillment_metadata?: FulfillmentMetadata;
  single_page_config?: SinglePageConfig;
  external_url?: string;
  cta_label?: string;
  checkout_type?: 'internal' | 'external';
  features?: string[] | string;
  facilities?: string[] | string;
  link_digital?: string;
  asset_reference?: string;
  button_text?: string;
  meta_pixel_id_override?: string;
  tiktok_pixel_id_override?: string;
  metadata?: Record<string, any>;
}

export interface TransactionItem {
  id: string;
  invoice_no?: string;
  customer_name?: string;
  customerName?: string;
  customer_phone?: string;
  customerPhone?: string;
  customer_email?: string;
  product_name?: string;
  productTitle?: string;
  product_title?: string;
  items_summary?: string;
  amount?: number;
  gross_amount?: number;
  total_amount?: number;
  payment_method?: string;
  paymentMethod?: string;
  status?: string;
  payment_status?: string;
  created_at?: string;
  date?: string;
  [key: string]: any;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export const DEFAULT_PRODUCTS: ProductItem[] = [
  {
    id: 1,
    name: "Step by Step Rahasia Menghasilkan Dollar dari Paid Traffic",
    slug: "step-by-step-rahasia-menghasilkan-dollar",
    category: "terlaris",
    price: 499000,
    promo_price: 249000,
    variants: "Format Digital • Video HD + Support",
    promo: "Diskon 50%",
    description: "Sebuah formula hidden gem yang belum banyak orang Indonesia mengetahuinya untuk menghasilkan dollar dari paid traffic.",
    download_url: "https://onlineboost.myr.id/course/step-by-step-rahasia-menghasilkan-dollar-dari-paid-traffic/",
    image: "https://media.mayar.id/images/3bdb77f1-e02e-4b04-bb13-2f62d645753e.jpeg",
    stock: 999,
    sku: "OB-DIG-001",
    is_unlimited: true,
    single_page_config: {
      slug: "step-by-step-rahasia-menghasilkan-dollar",
      headline: "Formula Hidden Gem Menghasilkan Dollar dari Paid Traffic 2026",
      subheadline: "Panduan praktis mengelola campaign iklan global dan menerima pembayaran langsung dalam USD.",
      banner_url: "",
      badge_text: "Special Blueprint",
      problem_title: "Apakah Anda Sering Menghadapi Masalah Ini?",
      pain_points: [
        "Pasar lokal semakin berdarah-darah dengan perang harga banting-bantingan profit tipis.",
        "Biaya iklan Meta & TikTok terus merangkak naik, ROAS drop drastis hingga minus.",
        "Bingung cara menjangkau pasar internasional dan cara aman menerima pencairan dana dalam USD."
      ],
      problem_image_url: "",
      solution_title: "Kini Hadir Solusi Teruji: Blueprint Paid Traffic Global",
      solution_points: [
        "Targeting audiens negara Tier-1 dengan daya beli 5x - 10x lipat lebih tinggi.",
        "Framework penulisan ad copy bilingual berkonversi tinggi tanpa perlu fasih bahasa Inggris.",
        "Integrasi payment gateway internasional resmi dengan auto-withdraw ke rekening BCA / Mandiri Anda."
      ],
      comparison_rows: [
        { id: '1', feature: 'Jangkauan Pasar', others: 'Lokal perang harga & margin tipis', us: 'Global Tier-1 dengan profit USD' },
        { id: '2', feature: 'Strategi Campaign', others: 'Tebak-tebakan dan bakar anggaran tanpa arah', us: 'SOP battle-tested siap copy-paste' },
        { id: '3', feature: 'Pencairan Dana', others: 'Rentan kena blokir & transfer ribet', us: 'Pencairan legal & otomatis masuk rekening' }
      ],
      testimonial_images: [],
      bonus_items: [
        { id: 'b1', title: 'Private Community & Live Diskusi Mingguan', value: 499000, description: 'Bedah studi kasus iklan dan troubleshooting live tiap pekan' },
        { id: 'b2', title: '50+ High-Converting Ad Creative Templates', value: 299000, description: 'Template visual & hook video siap edit di Canva' }
      ],
      enable_qris: true,
      enable_manual_transfer: true,
      discount_coupon: "HEMAT50",
      voucher: {
        code: "HEMAT50",
        discount_type: "nominal",
        discount_value: 50000,
        shipping_discount_type: "none",
        shipping_discount_value: 0,
        min_spend: 100000
      },
      affiliate_commission_rate: 30
    }
  },
  {
    id: 2,
    name: "Masterclass Ads 2026 - Scale Up Campaign",
    slug: "masterclass-ads-2026",
    category: "digital",
    price: 99000,
    promo_price: 149000,
    variants: "Format Digital • Video HD",
    promo: "Diskon 35%",
    description: "Panduan praktis scale-up iklan Meta & TikTok ads dengan optimasi ROAS tinggi.",
    download_url: "https://drive.google.com/drive/folders/masterclass-ads",
    image: "",
    stock: 9999,
    sku: "OB-DIG-002",
    is_unlimited: true,
    single_page_config: {
      slug: "masterclass-ads-2026",
      headline: "Kuasai Pola Iklan Anti Boncos & Rahasia Scaling Meta Ads 2026",
      subheadline: "Studi kasus riil mengelola anggaran iklan miliaran rupiah tanpa trik abu-abu. Akses langsung modul video, SOP tim media buyer, dan template dashboard.",
      banner_url: "",
      badge_text: "Direct Access Class",
      problem_title: "Kenapa Iklan Anda Selalu Boncos?",
      pain_points: [
        "Budget iklan habis ratusan ribu per hari tapi tidak ada leads/penjualan masuk.",
        "Sering terkena Restrict / AME akun iklan tanpa alasan yang jelas.",
        "Kesulitan scale up: begitu budget dinaikkan, performa iklan langsung anjlok."
      ],
      problem_image_url: "",
      solution_title: "Metode Scaling Meta Ads 2026 Terbukti Stabil",
      solution_points: [
        "Struktur campaign CBO & ABO modern yang adaptif dengan algoritma AI Meta terbaru.",
        "SOP pemanasan akun iklan dan teknik banding agar akun tahan banting.",
        "Framework testing kreatif berbiaya rendah dengan tingkat akurasi tinggi."
      ],
      comparison_rows: [
        { id: '1', feature: 'Algoritma Iklan', others: 'Metode usang 2022-2023 yang sudah usang', us: 'Update strategi algoritma AI Advantage+ 2026' },
        { id: '2', feature: 'Pengelolaan Risiko', others: 'Sering panik saat iklan boncos atau AME', us: 'SOP mitigasi risiko & checklist audit harian' },
        { id: '3', feature: 'Support & Konsultasi', others: 'Materi rekaman lama tanpa pembaruan', us: 'Update materi berkala & forum diskusi aktif' }
      ],
      testimonial_images: [],
      bonus_items: [
        { id: 'b1', title: 'Dashboard Sheet KPI & Media Buying Tracker', value: 199000, description: 'Template Google Sheets otomatis hitung ROAS, CPR, dan Margin' }
      ],
      enable_qris: true,
      enable_manual_transfer: true,
      discount_coupon: "DISKON20K",
      voucher: {
        code: "DISKON20K",
        discount_type: "percentage",
        discount_value: 20,
        shipping_discount_type: "none",
        shipping_discount_value: 0,
        min_spend: 50000
      },
      affiliate_commission_rate: 30
    }
  },
  {
    id: 3,
    name: "Buku Fisik Blueprint Bisnis Online 2026",
    slug: "buku-fisik-blueprint-bisnis",
    category: "fisik",
    price: 199000,
    promo_price: 299000,
    variants: "Hardcover 320 Hlm + Template SOP",
    promo: "Free Ongkir",
    description: "Buku cetak fisik panduan lengkap membangun funnel penjualan online, automasi closing WhatsApp, dan scaling produk.",
    download_url: "",
    image: "",
    stock: 250,
    sku: "OB-PHY-001",
    is_unlimited: false,
    single_page_config: {
      slug: "buku-fisik-blueprint-bisnis",
      headline: "Buku Fisik Eksklusif: Blueprint Bisnis Online & Funnel Closing 2026",
      subheadline: "Edisi cetak hardcover eksklusif dikirim langsung ke pintu rumah Anda. Dapatkan fasilitas voucher gratis ongkir khusus pemesanan hari ini.",
      banner_url: "",
      badge_text: "Buku Fisik Kirim Langsung",
      problem_title: "Lelah Menatap Layar HP & Mau Belajar Terstruktur?",
      pain_points: [
        "Materi video sering terdistraksi notifikasi dan susah untuk di-highlight.",
        "Tim CS tidak punya buku panduan fisik yang bisa langsung ditaruh di meja kerja.",
        "Biaya ongkir buku tebal seringkali mahal."
      ],
      problem_image_url: "",
      solution_title: "Buku Cetak Hardcover 320 Halaman Siap Praktek",
      solution_points: [
        "Kertas bookpaper premium anti silau, dijahit rapi, dan tahan lama.",
        "Dilengkapi flowchart visual alur closing dan skrip WhatsApp siap contek.",
        "Fasilitas Gratis Ongkir langsung ke seluruh kota di Indonesia."
      ],
      comparison_rows: [
        { id: '1', feature: 'Kenyamanan Belajar', others: 'Layar gadget bikin lelah & mata perih', us: 'Buku fisik nyaman dibaca & dicoret' },
        { id: '2', feature: 'Kesesuaian Tim', others: 'Harus bagi-bagi password akun kursus', us: 'SOP fisik siap pakai di meja kerja CS' },
        { id: '3', feature: 'Ongkos Kirim', others: 'Bayar ongkir penuh mahal', us: 'Subsidi voucher Bebas Ongkir 100%' }
      ],
      testimonial_images: [],
      bonus_items: [
        { id: 'b1', title: 'Akses Audio Book MP3 & Versi E-Book PDF', value: 149000, description: 'Bisa didengarkan di perjalanan lewat smartphone' },
        { id: 'b2', title: 'Pembatas Buku Eksklusif + Sticker Pack', value: 49000, description: 'Merchandise resmi BoonTrack Store' }
      ],
      enable_qris: true,
      enable_manual_transfer: true,
      discount_coupon: "FREESHIP",
      voucher: {
        code: "FREESHIP",
        discount_type: "nominal",
        discount_value: 20000,
        shipping_discount_type: "free",
        shipping_discount_value: 0,
        min_spend: 100000
      },
      affiliate_commission_rate: 30
    }
  },
  {
    id: 4,
    name: "Ecourse Strategi YouTube AI: Metode Praktis Raih Pendapatan AdSense",
    slug: "ecourse-strategi-youtube-ai-metode-praktis-raih-pendapatan-adsense",
    category: "terlaris",
    price: 2999000,
    promo_price: 1499000,
    variants: "Format Digital • Akses Ecourse Instan",
    promo: "🔥 Terlaris",
    description: "Metode Rahasia Simple dan Praktis dalam meraih Dollar dari Adsense hanya menggunakan AI",
    download_url: "https://onlineboost.myr.id/course/ecourse-strategi-youtube-ai-metode-praktis-raih-pendapatan-adsense/",
    image: "https://media.mayar.id/images/7d3af97d-b370-47e6-82da-f416576a2b6a.jpeg",
    stock: 999,
    sku: "OB-DIG-003",
    is_unlimited: true,
  },
  {
    id: 5,
    name: "Master Class Internet Marketing CPM",
    slug: "master-class-internet-marketing-cpm",
    category: "digital",
    price: 9999999,
    promo_price: 4999000,
    variants: "Format Digital • Akses Ecourse Instan",
    promo: "Program Unggulan",
    description: "Potensi Income Yang Didapat Setelah Mengikuti Kelas Ini: 1. Mendapatkan Income Dari CPM Dengan Organik Traffic Luar Negeri, 2. Mendapatkan Penghasilan dari Paid Traffic CPM.",
    download_url: "https://onlineboost.myr.id/course/master-class-internet-marketing-cpm/",
    image: "https://media.mayar.id/images/e7470199-3223-49c4-89a7-33f71af73617.jpeg",
    stock: 999,
    sku: "OB-DIG-004",
    is_unlimited: true,
  },
  {
    id: 6,
    name: "Ecourse Member Internet Marketing CPM",
    slug: "ecourse-member-internet-marketing-cpm",
    category: "digital",
    price: 1490000,
    promo_price: 749000,
    variants: "Format Digital • Akses Ecourse Instan",
    promo: "Akses Member",
    description: "Lanjutan Basic Meraih Income di atas 500rb / Hari dengan formula strategi internet marketing CPM.",
    download_url: "https://onlineboost.myr.id/course/ecourse-member-internet-marketing-cpm/",
    image: "https://media.mayar.id/images/90c6cb1b-ecf1-4bc2-b2a6-f09fb7330bee.jpeg",
    stock: 999,
    sku: "OB-DIG-005",
    is_unlimited: true,
  },
  {
    id: 7,
    name: "Modul Praktis CPM 24 Jam",
    slug: "modul-praktis-cpm-24-jam",
    category: "digital",
    price: 149000,
    promo_price: 1000,
    variants: "Format Digital • Akses Instan WhatsApp",
    promo: "Spesial Live Demo Rp1.000",
    description: "Panduan Praktis Setup Traffic CPM: Tembus Impresi Pertama dalam 24 Jam. 3 langkah taktis optimasi traffic instan tanpa teori rumit.",
    download_url: "",
    image: "",
    stock: 999,
    sku: "OB-CPM-24H",
    is_unlimited: true,
    single_page_config: {
      slug: "modul-praktis-cpm-24-jam",
      headline: "Panduan Praktis Setup Traffic CPM: Tembus Impresi Pertama dalam 24 Jam",
      subheadline: "Rahasia membangun aliran traffic stabil, setup server-side CAPI anti-bocor, dan optimasi konversi kilat tanpa boncos atau akun restrict.",
      banner_url: "",
      badge_text: "Penawaran Spesial Live Demo • Diskon 99%",
      whatsapp_number: "",
      discount_coupon: "",
      affiliate_commission_rate: 0,
      enable_qris: true,
      enable_manual_transfer: false,
      problem_title: "Kenapa Traffic Iklan Sering Boncos Tanpa Hasil?",
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
      ],
      comparison_rows: [
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
      ]
    }
  },
  {
    id: 8,
    name: "7-Day Sprint CTWA Mastery (Closing Otomatis Tanpa Admin Ribet)",
    slug: "ctwa-mastery-7day",
    category: "digital",
    type: "digital",
    product_type: "DIGITAL",
    price: 500000,
    promo_price: 100000,
    stock: 50,
    is_unlimited: false,
    variants: "Batch Intensif • 50 Seat Kuota Terbatas",
    promo: "BATCH INTENSIF: HANYA 50 SEAT",
    description: "Pelajari metode baru 7-Day Sprint CTWA Mastery bersama Kang Sakti: Bongkar rahasia alur iklan Click-to-WhatsApp langsung closing otomatis via Dynamic QRIS & auto-ongkir tanpa admin repot.",
    download_url: "https://t.me/+zhWxgGbzZxhmMjU1",
    link_digital: "https://t.me/+zhWxgGbzZxhmMjU1",
    asset_reference: "https://t.me/+zhWxgGbzZxhmMjU1",
    button_text: "Gabung Grup Telegram Kelas",
    image: "https://assets.boontrack.com/products/ctwa_mastery_banner.jpg",
    image_url: "https://assets.boontrack.com/products/ctwa_mastery_banner.jpg",
    sku: "CTWA-7DAY-001",
    cta_label: "Daftar Kelas Sekarang - Rp 100.000",
    checkout_type: "internal",
    fulfillment_metadata: {
      delivery_type: "TELEGRAM_GROUP",
      access_url: "https://t.me/+zhWxgGbzZxhmMjU1",
      button_text: "Gabung Grup Telegram Kelas",
      instructions: "Selamat pembayaran pesanan Anda berhasil terverifikasi! Silakan klik tombol di bawah untuk langsung bergabung ke Grup Telegram Kelas Eksklusif bersama Kang Sakti."
    },
    facilities: [
      "Hari 1: Fondasi Toko & Infrastruktur Otomasi (Setup BoonTrack & Dynamic QRIS)",
      "Hari 2: Kurasi Produk & Upload Katalog Cepat (Margin sehat & auto-ongkir real-time)",
      "Hari 3: Meta Ads Setup (Performance Goal: \"Maximise number of purchases through messaging\")",
      "Hari 4: Hook, Angle & Format Kreatif Iklan (Greeting message auto-redirect)",
      "Hari 5: Integrasi Tracking & Server CAPI Anti-Bocor",
      "Hari 6: Launching & Pembacaan Data Metrik Awal (Evaluasi checkout rate)",
      "Hari 7: Scale-Up & Optimasi Margin Bersih (Database repeat order gratis)"
    ],
    features: [
      "Hari 1: Fondasi Toko & Infrastruktur Otomasi (Setup BoonTrack & Dynamic QRIS)",
      "Hari 2: Kurasi Produk & Upload Katalog Cepat (Margin sehat & auto-ongkir real-time)",
      "Hari 3: Meta Ads Setup (Performance Goal: \"Maximise number of purchases through messaging\")",
      "Hari 4: Hook, Angle & Format Kreatif Iklan (Greeting message auto-redirect)",
      "Hari 5: Integrasi Tracking & Server CAPI Anti-Bocor",
      "Hari 6: Launching & Pembacaan Data Metrik Awal (Evaluasi checkout rate)",
      "Hari 7: Scale-Up & Optimasi Margin Bersih (Database repeat order gratis)"
    ],
    single_page_config: {
      slug: "ctwa-mastery-7day",
      badge_text: "BATCH INTENSIF: HANYA 50 SEAT",
      headline: "Capek Pasang Iklan CTWA Tapi Ujung-ujungnya Boncos & Admin Kewalahan?",
      subheadline: "Pelajari metode baru 7-Day Sprint CTWA Mastery bersama Kang Sakti: Bongkar rahasia alur iklan Click-to-WhatsApp langsung closing otomatis via Dynamic QRIS & auto-ongkir tanpa admin repot.",
      banner_url: "https://assets.boontrack.com/products/ctwa_mastery_banner.jpg",
      cta_label: "Daftar Kelas Sekarang - Rp 100.000",
      problem_title: "Kenapa Iklan WA Sering Boncos?",
      pain_points: [
        "❌ Chat menumpuk hanya tanya \"ongkir ke kota X berapa?\".",
        "❌ Calon pembeli kabur saat diminta transfer manual via rekening bank.",
        "❌ Algoritma iklan cuma mendatangkan penanya iseng tanpa niat beli."
      ],
      solution_title: "Solusi & 7-Day Sprint Syllabus",
      solution_points: [
        "Hari 1: Fondasi Toko & Infrastruktur Otomasi (Setup BoonTrack & Dynamic QRIS)",
        "Hari 2: Kurasi Produk & Upload Katalog Cepat (Margin sehat & auto-ongkir real-time)",
        "Hari 3: Meta Ads Setup (Performance Goal: \"Maximise number of purchases through messaging\")",
        "Hari 4: Hook, Angle & Format Kreatif Iklan (Greeting message auto-redirect)",
        "Hari 5: Integrasi Tracking & Server CAPI Anti-Bocor",
        "Hari 6: Launching & Pembacaan Data Metrik Awal (Evaluasi checkout rate)",
        "Hari 7: Scale-Up & Optimasi Margin Bersih (Database repeat order gratis)"
      ],
      comparison_rows: [
        {
          id: "c1",
          feature: "Alur Closing Pembeli",
          others: "Admin harus balas chat manual satu per satu, cek mutasi bank & hitung ongkir manual.",
          us: "Otomasi penuh via Dynamic QRIS & auto-ongkir real-time, closing lunas dalam hitungan detik."
        },
        {
          id: "c2",
          feature: "Kualitas Lead Iklan",
          others: "Banyak penanya iseng 'P' atau ghosting saat diminta transfer ke rekening.",
          us: "Algoritma Meta Ads teroptimasi untuk calon pembeli serius berdaya beli tinggi."
        },
        {
          id: "c3",
          feature: "Akurasi Tracking CAPI",
          others: "Pixel buta & data konversi hilang akibat update privasi browser / iOS.",
          us: "100% Server-side CAPI terintegrasi anti-bocor dengan deduplikasi resmi."
        }
      ],
      bonus_items: [
        {
          id: "b1",
          title: "🎁 GRATIS Akses Akun SaaS BoonTrack Paket Ads Performance",
          value: 299000,
          description: "Akses penuh fitur CAPI server-side, multi-rotator CS, dan Dynamic QRIS 0% MDR."
        },
        {
          id: "b2",
          title: "🎁 Akses Grup Diskusi & Pendampingan Praktik bersama Kang Sakti",
          value: 350000,
          description: "Tanya jawab langsung, bedah campaign iklan, dan sesi troubleshooting teknis intensif."
        },
        {
          id: "b3",
          title: "🎁 Rekaman Sesi Praktik & Template Copywriting Siap Pakai",
          value: 150000,
          description: "Template angle copywriting, hook iklan gambar/video, dan SOP skrip balasan WhatsApp."
        }
      ],
      enable_qris: true,
      enable_manual_transfer: false,
      discount_coupon: "",
      affiliate_commission_rate: 0
    }
  }
];

export const DEFAULT_ONLINEBOOST_PRODUCTS: ProductItem[] = [
  DEFAULT_PRODUCTS[3], // YouTube AI
  DEFAULT_PRODUCTS[4], // Master Class CPM
  DEFAULT_PRODUCTS[5], // Ecourse Member CPM
  DEFAULT_PRODUCTS[0], // Paid Traffic
  DEFAULT_PRODUCTS[6], // Modul Praktis CPM 24 Jam
];

export function resolveSinglePageProduct(
  tenantSlug: string,
  targetSlug: string
): { product: ProductItem; config: SinglePageConfig } {
  const normTarget = targetSlug.toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Coba baca dari localStorage konfigurasi custom spesifik
  if (typeof window !== 'undefined') {
    try {
      const savedConfigStr = localStorage.getItem(`bt_single_page_${tenantSlug}_${targetSlug.toLowerCase()}`);
      if (savedConfigStr) {
        const parsed = JSON.parse(savedConfigStr);
        if (parsed?.headline) {
          const prod: ProductItem = parsed.product || {
            id: Date.now(),
            name: parsed.headline,
            price: 99000,
            category: 'digital',
            description: parsed.subheadline || '',
            image: parsed.banner_url || '',
            stock: 9999,
          };
          return {
            product: prod,
            config: parsed,
          };
        }
      }

      // 2. Coba cari di daftar produk tenant yang tersimpan
      const tenantProductsStr = localStorage.getItem(`bt_products_${tenantSlug}`);
      if (tenantProductsStr) {
        const productsList: ProductItem[] = JSON.parse(tenantProductsStr);
        const match = productsList.find((p) => {
          const pSlug = (p.slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const pNameSlug = slugify(p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (pSlug === normTarget || pNameSlug === normTarget) return true;
          if (pSlug && (normTarget.includes(pSlug) || pSlug.includes(normTarget))) return true;
          if (pNameSlug && (normTarget.includes(pNameSlug) || pNameSlug.includes(normTarget))) return true;
          if (normTarget.includes('cpm') && (pSlug.includes('cpm') || pNameSlug.includes('cpm'))) return true;
          return false;
        });
        if (match) {
          return {
            product: match,
            config: match.single_page_config || {
              slug: match.slug || slugify(match.name),
              headline: match.name,
              subheadline: match.description,
              banner_url: match.image,
              enable_hero: true,
              enable_client_logos: false,
              enable_problem_solution: true,
              enable_us_vs_them: true,
              enable_testimonials: true,
              enable_offer: true,
              enable_faq: false,
              enable_payment: true,
              client_logos: [],
              faqs: [],
              enable_qris: true,
              enable_manual_transfer: true,
              discount_coupon: '',
              voucher: undefined,
              affiliate_commission_rate: 30,
              badge_text: 'Direct Access Offer',
            },
          };
        }
      }
    } catch (e) {
      console.warn('[resolveSinglePageProduct] Error reading local configuration:', e);
    }
  }

  // 3. Coba cari di DEFAULT_PRODUCTS
  const defaultMatch = DEFAULT_PRODUCTS.find((p) => {
    const pSlug = (p.slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const pNameSlug = slugify(p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (pSlug === normTarget || pNameSlug === normTarget) return true;
    if (pSlug && (normTarget.includes(pSlug) || pSlug.includes(normTarget))) return true;
    if (pNameSlug && (normTarget.includes(pNameSlug) || pNameSlug.includes(normTarget))) return true;
    if (normTarget.includes('cpm') && (pSlug.includes('cpm') || pNameSlug.includes('cpm'))) return true;
    return false;
  });

  if (defaultMatch) {
    return {
      product: defaultMatch,
      config: defaultMatch.single_page_config!,
    };
  }

  // 4. Fallback jika slug belum terdaftar sama sekali
  const fallbackProduct: ProductItem = {
    id: Date.now(),
    name: targetSlug.replace(/[-_]/g, ' '),
    slug: targetSlug,
    category: 'digital',
    price: 0,
    description: '',
    image: '',
    stock: 0,
  };
  return {
    product: fallbackProduct,
    config: {
      slug: targetSlug,
      headline: targetSlug.replace(/[-_]/g, ' '),
      subheadline: '',
      banner_url: '',
      enable_hero: true,
      enable_client_logos: false,
      enable_problem_solution: true,
      enable_us_vs_them: true,
      enable_testimonials: true,
      enable_offer: true,
      enable_faq: false,
      enable_payment: true,
      client_logos: [],
      faqs: [],
      enable_qris: true,
      enable_manual_transfer: false,
      badge_text: '',
      discount_coupon: '',
      affiliate_commission_rate: 0,
    },
  };
}

/**
 * Resolves external / affiliate URL from a product object.
 * Checks external_url, affiliate_url, metadata.external_url, metadata.affiliate_url,
 * fulfillment_metadata.access_url, and download_url (if http/https).
 */
export function resolveProductExternalUrl(item: any): string | null {
  if (!item || typeof item !== 'object') return null;

  // Never treat internal checkout, landing page products, or CTWA mastery as external
  if (
    item.checkout_type === 'internal' ||
    item.single_page_config ||
    item.slug === 'ctwa-mastery-7day' ||
    item.id === 'c7ba0001-7de7-4888-9999-000000000001'
  ) {
    return null;
  }

  // Only external / affiliate referral URLs
  const candidate =
    item.external_url ||
    item.affiliate_url ||
    item.metadata?.external_url ||
    item.metadata?.affiliate_url;

  if (candidate && typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
  }

  return null;
}

/**
 * Resolves CTA button label for a product.
 * If external, checks cta_label or provides contextual labels:
 * "Ikut Kelas" for courses, "Akses Sekarang" for free items, "Beli Sekarang" for paid items.
 */
export function resolveProductCtaLabel(item: any, isExternal: boolean): string {
  if (item?.cta_label && typeof item.cta_label === 'string' && item.cta_label.trim()) {
    return item.cta_label.trim();
  }
  if (item?.metadata?.cta_label && typeof item.metadata.cta_label === 'string' && item.metadata.cta_label.trim()) {
    return item.metadata.cta_label.trim();
  }
  if (isExternal) {
    const nameLower = String(item?.name || item?.title || '').toLowerCase();
    const catLower = String(item?.category || '').toLowerCase();
    if (
      catLower.includes('kelas') ||
      catLower.includes('course') ||
      catLower.includes('ecourse') ||
      nameLower.includes('kelas') ||
      nameLower.includes('belajar')
    ) {
      return 'Ikut Belajar';
    }
    return Number(item?.price) === 0 ? 'Akses Sekarang' : 'Beli Sekarang';
  }
  return 'Tambah Keranjang';
}
