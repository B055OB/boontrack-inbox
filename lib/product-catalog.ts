export interface VoucherConfig {
  code: string;
  discount_type: 'nominal' | 'percentage';
  discount_value: number; // Diskon flat (Rp) atau persentase (%)
  shipping_discount_type?: 'none' | 'flat' | 'free'; // Khusus produk fisik
  shipping_discount_value?: number; // Subsidi ongkir (Rp) jika tipe 'flat'
  min_spend?: number; // Batas minimal belanja (opsional, Rp)
}

export interface SinglePageConfig {
  slug?: string;
  headline: string;
  subheadline: string;
  banner_url: string;
  enable_qris: boolean;
  enable_manual_transfer: boolean;
  discount_coupon: string;
  voucher?: VoucherConfig;
  affiliate_commission_rate: number;
  badge_text?: string;
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
      affiliate_commission_rate: 30,
      badge_text: "Special Blueprint"
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
      affiliate_commission_rate: 30,
      badge_text: "Direct Access Class"
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
      affiliate_commission_rate: 30,
      badge_text: "Buku Fisik Kirim Langsung"
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
