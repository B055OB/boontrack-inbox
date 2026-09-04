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

export interface SinglePageConfig {
  slug?: string;
  // 1. Hook
  headline: string;
  subheadline: string;
  banner_url: string;
  badge_text?: string;

  // 2. Problem & Solution
  problem_title?: string;
  pain_points?: string[];       // Poin-poin masalah audiens
  problem_image_url?: string;   // Ilustrasi masalah di sela teks
  solution_title?: string;
  solution_points?: string[];   // Poin-poin solusi & keunggulan

  // 3. Tabel Perbandingan (Us vs Them)
  comparison_rows?: ComparisonItem[];

  // 4. Social Proof / Testimoni
  testimonial_images?: string[]; // Hingga 3 screenshot bukti/chat

  // 5. Offer & Bonus
  bonus_items?: BonusItem[];

  // 6. Voucher Diskon
  discount_coupon: string;
  voucher?: VoucherConfig;

  // 7. Payment & Affiliate
  enable_qris: boolean;
  enable_manual_transfer: boolean;
  affiliate_commission_rate: number;
  whatsapp_number?: string;
}

export interface ProductItem {
  id: number;
  name: string;
  slug?: string;
  category: 'terlaris' | 'digital' | 'fisik';
  price: number;
  promo_price?: number;
  variants?: string;
  promo?: string;
  description: string;
  download_url?: string;
  image: string;
  stock: number;
  sku?: string;
  is_unlimited?: boolean;
  single_page_config?: SinglePageConfig;
}

export interface TransactionItem {
  id: string;
  invoice_no: string;
  customer_name: string;
  customer_phone: string;
  product_name: string;
  amount: number;
  payment_method: string;
  status: string;
  created_at: string;
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
    download_url: "https://onlineboost.my.id/p/step-by-step-rahasia-menghasilkan-dollar",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&auto=format&fit=crop&q=60",
    stock: 9999,
    sku: "OB-DIG-001",
    is_unlimited: true,
    single_page_config: {
      slug: "step-by-step-rahasia-menghasilkan-dollar",
      headline: "Formula Hidden Gem Menghasilkan Dollar dari Paid Traffic 2026",
      subheadline: "Panduan praktis mengelola campaign iklan global dan menerima pembayaran langsung dalam USD.",
      banner_url: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&auto=format&fit=crop&q=60",
      badge_text: "Special Blueprint",
      problem_title: "Apakah Anda Sering Menghadapi Masalah Ini?",
      pain_points: [
        "Pasar lokal semakin berdarah-darah dengan perang harga banting-bantingan profit tipis.",
        "Biaya iklan Meta & TikTok terus merangkak naik, ROAS drop drastis hingga minus.",
        "Bingung cara menjangkau pasar internasional dan cara aman menerima pencairan dana dalam USD."
      ],
      problem_image_url: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=500&auto=format&fit=crop&q=60",
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
      testimonial_images: [
        "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=500&auto=format&fit=crop&q=60",
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=60"
      ],
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
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=500&auto=format&fit=crop&q=60",
    stock: 9999,
    sku: "OB-DIG-002",
    is_unlimited: true,
    single_page_config: {
      slug: "masterclass-ads-2026",
      headline: "Kuasai Pola Iklan Anti Boncos & Rahasia Scaling Meta Ads 2026",
      subheadline: "Studi kasus riil mengelola anggaran iklan miliaran rupiah tanpa trik abu-abu. Akses langsung modul video, SOP tim media buyer, dan template dashboard.",
      banner_url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=500&auto=format&fit=crop&q=60",
      badge_text: "Direct Access Class",
      problem_title: "Kenapa Iklan Anda Selalu Boncos?",
      pain_points: [
        "Budget iklan habis ratusan ribu per hari tapi tidak ada leads/penjualan masuk.",
        "Sering terkena Restrict / AME akun iklan tanpa alasan yang jelas.",
        "Kesulitan scale up: begitu budget dinaikkan, performa iklan langsung anjlok."
      ],
      problem_image_url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=500&auto=format&fit=crop&q=60",
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
      testimonial_images: [
        "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=500&auto=format&fit=crop&q=60"
      ],
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
    image: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=60",
    stock: 250,
    sku: "OB-PHY-001",
    is_unlimited: false,
    single_page_config: {
      slug: "buku-fisik-blueprint-bisnis",
      headline: "Buku Fisik Eksklusif: Blueprint Bisnis Online & Funnel Closing 2026",
      subheadline: "Edisi cetak hardcover eksklusif dikirim langsung ke pintu rumah Anda. Dapatkan fasilitas voucher gratis ongkir khusus pemesanan hari ini.",
      banner_url: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=60",
      badge_text: "Buku Fisik Kirim Langsung",
      problem_title: "Lelah Menatap Layar HP & Mau Belajar Terstruktur?",
      pain_points: [
        "Materi video sering terdistraksi notifikasi dan susah untuk di-highlight.",
        "Tim CS tidak punya buku panduan fisik yang bisa langsung ditaruh di meja kerja.",
        "Biaya ongkir buku tebal seringkali mahal."
      ],
      problem_image_url: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=60",
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
      testimonial_images: [
        "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=60"
      ],
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
  }
];

export function resolveSinglePageProduct(
  tenantSlug: string,
  targetSlug: string
): { product: ProductItem; config: SinglePageConfig } {
  const normTarget = targetSlug.toLowerCase();

  // 1. Coba baca dari localStorage konfigurasi custom spesifik
  if (typeof window !== 'undefined') {
    try {
      const savedConfigStr = localStorage.getItem(`bt_single_page_${tenantSlug}_${normTarget}`);
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
          const pSlug = p.slug || slugify(p.name);
          return pSlug === normTarget || normTarget.includes(pSlug) || pSlug.includes(normTarget);
        });
        if (match) {
          return {
            product: match,
            config: match.single_page_config || {
              slug: match.slug || slugify(match.name),
              headline: match.name,
              subheadline: match.description,
              banner_url: match.image,
              enable_qris: true,
              enable_manual_transfer: true,
              discount_coupon: 'HEMAT50',
              voucher: {
                code: 'HEMAT50',
                discount_type: 'nominal',
                discount_value: 20000,
                shipping_discount_type: 'none',
                shipping_discount_value: 0,
                min_spend: 50000,
              },
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
    const pSlug = p.slug || slugify(p.name);
    return pSlug === normTarget || normTarget.includes(pSlug) || pSlug.includes(normTarget);
  });

  if (defaultMatch) {
    return {
      product: defaultMatch,
      config: defaultMatch.single_page_config!,
    };
  }

  // 4. Fallback jika slug belum terdaftar sama sekali
  const fallbackProduct = DEFAULT_PRODUCTS[1]; // Masterclass Ads
  return {
    product: fallbackProduct,
    config: fallbackProduct.single_page_config!,
  };
}
