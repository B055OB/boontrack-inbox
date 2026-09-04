export interface SinglePageConfig {
  slug?: string;
  headline: string;
  subheadline: string;
  banner_url: string;
  enable_qris: boolean;
  enable_manual_transfer: boolean;
  discount_coupon: string;
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
      discount_coupon: "DOLLAR50",
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
      discount_coupon: "BOONPROMO50",
      affiliate_commission_rate: 30,
      badge_text: "Direct Access Class"
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
              discount_coupon: 'BOONPROMO50',
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
