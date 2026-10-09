/**
 * app/[tenant]/types.ts
 * Standalone Types & Helpers for Tenant Runtime & Storefront
 *
 * Decoupled from app/[tenant]/page.tsx to eliminate Circular Dependency & Temporal Dead Zone (TDZ).
 * ADR §50 & §54 Compliant.
 */

export interface Product {
  id: number | string;
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  image: string;
  image_url?: string;
  description: string;
  badge?: string;
  promo?: string;
  custom_badge?: string;
  modules?: string[];
  features?: string[];
  promo_price?: number;
  download_url?: string;
  stock?: number;
  sku?: string;
  type?: string;
  product_type?: string;
  requires_shipping?: boolean;
  external_url?: string;
  affiliate_url?: string;
  cta_label?: string;
  checkout_type?: string;
  slug?: string;
  single_page_config?: any;
  single_page_enabled?: boolean;
  metadata?: Record<string, any>;
  is_active?: boolean;
}

export interface StoreChatMessage {
  id: string | number;
  sender: 'user' | 'bot';
  time: string;
  text: string;
  action?: string;
  type?: string;
  product?: {
    id: number | string;
    name: string;
    category?: string;
    price: number;
    originalPrice?: number;
    image?: string;
    image_url?: string;
    description?: string;
    badge?: string;
    modules?: string[];
    features?: string[];
    download_url?: string;
    type?: string;
    external_url?: string;
    cta_label?: string;
    checkout_type?: string;
    metadata?: Record<string, any>;
  };
  quick_actions?: string[];
}

/**
 * Helper to detect if a tenant is a public service, desa, or civic community entity.
 */
export function isPublicServiceTenant(
  tenant?: any,
  metadata?: any,
  slug?: string
): boolean {
  const normSlug = (slug || '').toLowerCase().trim();
  if (
    normSlug === 'margasari' ||
    normSlug === 'kelurahan-margasari' ||
    normSlug === 'pelayanan-publik' ||
    normSlug.includes('kelurahan') ||
    normSlug.includes('desa-')
  ) {
    return true;
  }

  const bt = String(
    tenant?.business_type || metadata?.business_type || ''
  ).toUpperCase().trim();
  const cat = String(
    tenant?.category || metadata?.category || ''
  ).toLowerCase().trim();
  const vertical = String(
    metadata?.vertical || ''
  ).toLowerCase().trim();
  const tpl = String(
    tenant?.template_code ||
    metadata?.template_code ||
    metadata?.selected_template ||
    metadata?.template ||
    ''
  ).toUpperCase().trim();

  if (bt === 'PUBLIC_SERVICE' || bt === 'B2G' || bt === 'DESA' || bt === 'COMMUNITY' || bt === 'PELAYANAN_PUBLIK') {
    return true;
  }
  if (cat === 'public_service' || cat === 'desa' || cat === 'community' || cat === 'pelayanan_publik' || cat === 'b2g') {
    return true;
  }
  if (vertical === 'public_service' || vertical === 'desa' || vertical === 'community') {
    return true;
  }
  if (tpl === 'PUBLIC_SERVICE_V1' || tpl === 'PUBLIC_SERVICE') {
    return true;
  }

  return false;
}

/**
 * Helper to format category label for badges & display
 */
export function formatCategoryBadge(
  category?: string,
  productType?: string,
  customBadge?: string
): string {
  if (customBadge && typeof customBadge === 'string' && customBadge.trim()) {
    return customBadge.trim();
  }
  if (category && typeof category === 'string' && category.trim()) {
    const trimmed = category.trim();
    const lower = trimmed.toLowerCase();
    if (
      lower === 'field_service' ||
      lower === 'service' ||
      lower === 'jasa' ||
      lower === 'local_service' ||
      lower === 'jasa lapangan'
    ) {
      return 'Jasa Lapangan';
    }
    if (
      lower === 'pro_service' ||
      lower === 'konsultasi' ||
      lower === 'professional_service' ||
      lower === 'professional'
    ) {
      return 'Konsultasi';
    }
    if (
      lower === 'creator_agency' ||
      lower === 'agency & kreator' ||
      lower === 'agency'
    ) {
      return 'Agency & Kreator';
    }
    if (
      lower === 'fnb' ||
      lower === 'kuliner & f&b' ||
      lower === 'kuliner' ||
      lower === 'food'
    ) {
      return 'Kuliner & F&B';
    }
    if (lower === 'digital' || lower === 'digital_product') {
      return 'Digital';
    }
    if (
      lower === 'retail_physical' ||
      lower === 'fisik' ||
      lower === 'physical'
    ) {
      return 'Fisik';
    }
    if (lower === 'public_service' || lower === 'layanan publik' || lower === 'desa') {
      return 'Layanan Publik';
    }
    // Preserve custom merchant category (e.g. "E-Course", "Fashion", "Buku")
    return trimmed;
  }
  const pt = typeof productType === 'string' ? productType.toUpperCase() : '';
  if (pt === 'FIELD_SERVICE' || pt === 'SERVICE') return 'Jasa Lapangan';
  if (pt === 'PROFESSIONAL_SERVICE') return 'Konsultasi';
  if (pt === 'AGENCY') return 'Agency & Kreator';
  if (pt === 'FOOD') return 'Kuliner & F&B';
  if (pt === 'DIGITAL') return 'Digital';
  if (pt === 'PHYSICAL') return 'Fisik';
  if (pt === 'PUBLIC_SERVICE') return 'Layanan Publik';
  return 'Fisik';
}

/**
 * Helper to generate dynamic, category-aware bot greeting for storefront chat widget
 */
export function getStoreChatGreeting(category: string, activeName: string): string {
  const cat = (category || '').toUpperCase().trim();
  if (
    cat === 'PUBLIC_SERVICE' ||
    cat === 'B2G' ||
    cat === 'PELAYANAN_PUBLIK' ||
    cat === 'DESA' ||
    cat === 'COMMUNITY' ||
    cat.includes('PUBLIC_SERVICE') ||
    cat.includes('PELAYANAN') ||
    cat.includes('KELURAHAN') ||
    cat.includes('DESA') ||
    cat.includes('WARGA')
  ) {
    return `Sampurasun! Selamat datang di ${activeName} 👋 Ada yang bisa kami bantu seputar aktivasi IKD, surat pengantar KTP/KK, surat domisili, atau layanan administrasi warga lainnya hari ini?`;
  }
  if (
    cat === 'PROFESSIONAL_SERVICE' ||
    cat === 'PRO_SERVICE' ||
    cat === 'PROFESSIONAL' ||
    cat.includes('PROFESSIONAL') ||
    cat.includes('CONSULT') ||
    cat.includes('AGENCY_PRO') ||
    cat.includes('LEGAL') ||
    cat.includes('KLINIK') ||
    cat.includes('PRO')
  ) {
    return `Halo! Selamat datang di ${activeName} 👋 Kami siap mendampingi kebutuhan konsultasi & audit profesional Anda. Ada yang bisa kami bantu seputar booking konsultasi, paket layanan, atau jadwal audit hari ini?`;
  }
  if (
    cat === 'FIELD_SERVICE' ||
    cat === 'SERVICE' ||
    cat.includes('FIELD') ||
    cat.includes('TEKNISI') ||
    cat.includes('TOREN') ||
    cat.includes('REPARASI') ||
    cat.includes('SERVIS') ||
    cat.includes('BENGKEL')
  ) {
    return `Halo! Selamat datang di layanan ${activeName} 👋 Ada yang bisa kami bantu seputar booking teknisi, estimasi pengerjaan, atau area layanan hari ini?`;
  }
  if (
    cat === 'FOOD' ||
    cat.includes('FOOD') ||
    cat.includes('FNB') ||
    cat.includes('CULINARY') ||
    cat.includes('RESTO') ||
    cat.includes('KULINER')
  ) {
    return `Halo! Selamat datang di ${activeName} 👋 Mau pesan antar (delivery), ambil di resto (takeaway), atau cek menu favorit hari ini?`;
  }
  if (
    cat === 'DIGITAL' ||
    cat.includes('DIGITAL') ||
    cat.includes('COURSE') ||
    cat.includes('SOFTWARE') ||
    cat.includes('EBOOK') ||
    cat.includes('KELAS')
  ) {
    return `Halo! Selamat datang di ${activeName} 👋 Ada yang bisa kami bantu seputar akses unduh materi, lisensi software, atau informasi produk digital kami?`;
  }
  if (
    cat === 'CREATOR_AGENCY' ||
    cat.includes('CREATOR') ||
    cat.includes('TALENT') ||
    cat.includes('ENDORSE') ||
    cat.includes('INFLUENCER')
  ) {
    return `Halo! Selamat datang di ${activeName} 👋 Ada yang bisa kami bantu seputar rate card endorse, jadwal live talent, atau pengiriman brief kerjasama?`;
  }
  return `Halo! Selamat datang di ${activeName} 👋 Ada yang bisa kami bantu seputar katalog produk, promo, atau informasi belanja hari ini?`;
}

/**
 * Helper to detect physical or food products requiring shipping / local delivery
 */
export function isPhysicalOrFoodProduct(
  p?: Partial<Product> | any,
  tenantCategory?: string
): boolean {
  if (!p) return false;
  if (p.requires_shipping === true || p.requiresShipping === true) return true;
  const pType = String(p.product_type || p.type || '').toUpperCase();
  const pCat = String(p.category || '').toUpperCase();
  const tCat = String(tenantCategory || '').toUpperCase();
  if (
    pType === 'FOOD' ||
    pType === 'PHYSICAL' ||
    pType.includes('FOOD') ||
    pType.includes('PHYSICAL') ||
    pType.includes('FISIK')
  ) {
    return true;
  }
  if (
    pCat === 'FOOD' ||
    pCat.includes('FOOD') ||
    pCat.includes('KULINER') ||
    pCat.includes('FISIK') ||
    pCat.includes('PHYSICAL')
  ) {
    return true;
  }
  if (tCat === 'FOOD' || tCat.includes('FOOD') || tCat.includes('KULINER')) {
    return true;
  }
  return false;
}
