import { getProductPageUrl, getStorefrontUrl } from './storefront-urls';
import { getSupabaseAdmin, getSupabase } from './supabaseClient';
import { isValidUuid } from './uuid-guard';

export interface VoucherConfig {
  code: string;
  discount_type: 'nominal' | 'percentage';
  discount_value: number; // Diskon flat (Rp) atau persentase (%)
  shipping_discount_type?: 'none' | 'flat' | 'free'; // Khusus produk fisik
  shipping_discount_value?: number; // Subsidi ongkir (Rp) jika tipe 'flat'
  min_spend?: number; // Batas minimal belanja (opsional, Rp)
  is_enabled?: boolean; // Dedicated toggle flag (Universal Decoupling)
}

export interface ProductVoucherConfig {
  is_enabled: boolean;
  code: string;
  discount_type: 'nominal' | 'percentage';
  discount_value: number;
  min_spend?: number;
  shipping_discount_type?: 'none' | 'flat' | 'free';
  shipping_discount_value?: number;
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

export interface OrderBumpItem {
  id: string;
  name: string;
  price: number;
  original_price?: number;
  badge_text?: string;
  description?: string;
  image?: string;
  is_active: boolean;
  product_id?: string;
}

export interface OrderBumpConfig {
  enabled: boolean;
  items: OrderBumpItem[];
}

export function resolveActiveOrderBumps(product: any): OrderBumpItem[] {
  if (!product) return [];
  const raw = product.order_bumps || product.metadata?.order_bumps || product.fulfillment_metadata?.order_bumps;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((item: any) => item && typeof item === 'object' && item.is_active !== false && item.name && typeof item.price === 'number');
  }
  if (typeof raw === 'object' && raw.enabled && Array.isArray(raw.items)) {
    return raw.items.filter((item: any) => item && typeof item === 'object' && item.is_active !== false && item.name && typeof item.price === 'number');
  }
  return [];
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
  store_name?: string;

  // ── Toggle Visibility: 8 Canonical Sections ──
  enable_hero?: boolean;              // default: true
  enable_client_logos?: boolean;      // default: false
  enable_problem_solution?: boolean;  // default: true
  enable_us_vs_them?: boolean;        // default: true
  enable_testimonials?: boolean;      // default: true
  enable_offer?: boolean;             // default: true
  enable_faq?: boolean;               // default: false
  enable_payment?: boolean;           // default: true
  hide_floating_cta?: boolean;        // default: false
  enable_custom_html?: boolean;       // default: false
  is_custom_html_enabled?: boolean;   // default: false
  use_custom_html?: boolean;          // flag for custom html mode
  active_section?: string;            // 'custom_html' or standard canonical sections
  sections_override?: boolean;        // false when custom html replaces standard sections

  // 1. Hook & Hero
  headline: string;
  subheadline: string;
  banner_url: string;
  /** URL Video Utama (YouTube / Shorts / MP4 embed) di Section 1 */
  video_url?: string;
  badge_text?: string;
  /** Scarcity / Urgency notification badge (e.g. { enabled: true, text: "🔥 Sisa 50 Seat Kuota Terbatas" }) */
  scarcity_badge?: {
    enabled?: boolean;
    text?: string;
  } | string;

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
  /** Set false to hide the entire pain-points (problem) section. Default: true */
  show_pain_points?: boolean;

  // 4. Tabel Perbandingan (Us vs Them)
  comparison_rows?: ComparisonItem[];

  // 5. Social Proof / Testimoni
  testimonial_images?: string[]; // Hingga 3 screenshot bukti/chat
  testimonials?: TestimonialItem[]; // Testimoni teks peserta
  whatsapp_testimonials?: any[]; // Testimoni gaya WhatsApp Chat Bubble

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
  /** Teks jaminan / transparansi pembayaran di bawah tombol CTA (e.g. Akses instan. Sekali bayar...) */
  micro_copy?: string;
  /** Action mode for storefront checkout:
   * - 'DIRECT': Form Checkout Langsung (Direct Order)
   * - 'WHATSAPP': Konsultasi / Order via WhatsApp Langsung
   * - 'HYBRID': Keduanya (Form Checkout + Tombol WhatsApp Melayang)
   */
  checkout_action_mode?: 'DIRECT' | 'WHATSAPP' | 'HYBRID';
  /** Teks Pesan WhatsApp Otomatis dengan variabel fallback (misal: "Halo Admin, saya tertarik dengan produk {nama_produk}...") */
  whatsapp_custom_message?: string;
  /** Show a secondary WhatsApp CTA button next to / below the main checkout CTA. Default: false */
  whatsapp_cta_enabled?: boolean;
  /** Label for the secondary WhatsApp CTA button. Falls back to a sensible default. */
  whatsapp_cta_label?: string;
  /** Optional override WhatsApp number for the secondary CTA (uses store number by default). */
  whatsapp_cta_number?: string;
  /** When true, hides Alamat Lengkap & Kecamatan/Kota fields (for digital/consultation products). Default: false */
  hide_address_for_digital?: boolean;
  /** Batasi pembelian maksimal 1 item per checkout (sembunyikan stepper kuantitas [- 1 +]) */
  limit_single_item?: boolean;
  /** Urutan kustom untuk section 1-9 pada landing page */
  section_order?: string[];
  /** Mode tampilan checkout: 'inline' (di body halaman) atau 'drawer' / 'popup' / 'modal' */
  checkout_mode?: 'inline' | 'drawer' | 'popup' | 'modal' | string;
  /** Tampilkan tombol checkout melayang di bagian bawah layar. Default: true */
  enable_sticky_button?: boolean;

  // 9. Interactive Product Media Showcase & Lightbox Gallery
  enable_media_gallery?: boolean;
  /** URL Video Showcase / Review (YouTube / Shorts / MP4) di Section 2 */
  gallery_video_url?: string;
  gallery_images?: Array<{
    url: string;
    title?: string;
    category?: string;
  }>;

  // 10. Mini Intake Form (Positive Friction Filter)
  intake_form_config?: {
    enabled?: boolean;
    title?: string;
    description?: string;
    child_name_label?: string;
    child_age_label?: string;
    concern_label?: string;
    action_type?: 'WHATSAPP' | 'CHECKOUT';
    target_wa_number?: string;
  };

  /** Section #10: Custom HTML / AI Landing Page (v0 / Lovable / Custom) */
  custom_html?: string;

  /** Dynamic Multi-Category Labels & Copywriting Customization */
  labels?: SinglePageLabelsConfig;
}

export interface SinglePageLabelsConfig {
  // Finansial & Sticky Bar
  price_label?: string;
  checkout_total_label?: string;
  bill_status_label?: string;
  cta_label?: string;
  free_cta_label?: string;
  add_to_cart_label?: string;
  affiliate_cta_label?: string;

  // Keamanan & Trust Badges
  header_security_badge?: string;
  direct_store_badge?: string;
  discount_badge_label?: string;

  // Modul Perbandingan (Them vs Us)
  comparison_title?: string;
  comparison_subtitle?: string;
  comparison_them_label?: string;
  comparison_us_label?: string;

  // Modul Bukti Sosial & Ulasan
  testimonials_title?: string;
  testimonials_subtitle?: string;
  social_proof_badge?: string;
  rating_summary_text?: string;
  verified_user_label?: string;
  verified_status_label?: string;

  // Modul Penawaran & Bonus
  bonus_title?: string;
  bonus_subtitle?: string;
  bonus_item_badge?: string;
  bonus_total_banner?: string;

  // Modul FAQ
  faq_title?: string;

  // Form Pemesanan & Fields
  checkout_section_title?: string;
  variant_selector_label?: string;
  selected_variant_label?: string;
  quantity_label?: string;
  email_field_label?: string;
  notes_field_label?: string;
  notes_placeholder?: string;

  // Cart Drawer
  cart_title?: string;
  cart_empty_text?: string;
  cart_subtotal_label?: string;
  cart_checkout_button?: string;
}

export interface ResolvedCategoryLabels {
  priceLabel: string;
  checkoutTotalLabel: string;
  billStatusLabel: string;
  ctaLabel: string;
  freeCtaLabel: string;
  addToCartLabel: string;
  affiliateCtaLabel: string;
  headerSecurityBadge: string;
  directStoreBadge: string;
  discountBadgeLabel: string;
  comparisonTitle: string;
  comparisonSubtitle: string;
  comparisonThemLabel: string;
  comparisonUsLabel: string;
  testimonialsTitle: string;
  testimonialsSubtitle: string;
  socialProofBadge: string;
  ratingSummaryText: string;
  verifiedUserLabel: string;
  verifiedStatusLabel: string;
  bonusTitle: string;
  bonusSubtitle: string;
  bonusItemBadge: string;
  bonusTotalBanner: string;
  faqTitle: string;
  checkoutSectionTitle: string;
  variantSelectorLabel: string;
  selectedVariantLabel: string;
  quantityLabel: string;
  emailFieldLabel: string;
  notesFieldLabel: string;
  notesPlaceholder: string;
  cartTitle: string;
  cartEmptyText: string;
  cartSubtotalLabel: string;
  cartCheckoutButton: string;
}

export function resolveCategoryLabels(
  config?: SinglePageConfig | null,
  productType?: string,
  category?: string
): ResolvedCategoryLabels {
  const norm = `${productType || ''} ${category || ''}`.toUpperCase().trim();
  const isPhysical = norm.includes('PHYSICAL') || norm.includes('FISIK') || norm.includes('RETAIL');
  const isFnb = norm.includes('FOOD') || norm.includes('KULINER') || norm.includes('FNB');
  const isService = norm.includes('SERVICE') || norm.includes('JASA') || norm.includes('AGENCY') || norm.includes('BOOKING');
  const custom = config?.labels || {};

  return {
    priceLabel: custom.price_label || (isPhysical || isFnb ? 'TOTAL HARGA' : isService ? 'TOTAL INVESTASI / BIAYA' : 'TOTAL INVESTASI'),
    checkoutTotalLabel: custom.checkout_total_label || (isPhysical ? 'Total Pembayaran Belanja' : isFnb ? 'Total Pembayaran Menu' : 'Total Pembayaran'),
    billStatusLabel: custom.bill_status_label || (isPhysical || isFnb ? 'Total Tagihan' : isService ? 'Total Biaya Layanan' : 'Total Tagihan'),
    ctaLabel: custom.cta_label || (isPhysical ? 'Beli Sekarang' : isFnb ? 'Pesan Menu Sekarang' : isService ? 'Booking Jadwal Sekarang' : 'Beli Sekarang'),
    freeCtaLabel: custom.free_cta_label || (isPhysical ? 'Klaim Sampel Gratis' : isFnb ? 'Klaim Porsi Gratis' : isService ? 'Konsultasi Gratis Sekarang' : 'Klaim Sekarang (Gratis)'),
    addToCartLabel: custom.add_to_cart_label || '+ Keranjang',
    affiliateCtaLabel: custom.affiliate_cta_label || 'Saya Mau Pesan ↗',
    headerSecurityBadge: custom.header_security_badge || (isPhysical ? 'Garansi 100% Produk Original' : isFnb ? 'Jaminan Mutu & Higienis' : isService ? 'Layanan Profesional Terverifikasi' : 'Garansi Akses Resmi'),
    directStoreBadge: custom.direct_store_badge || (isPhysical ? 'Direct Store (100% Toko Resmi)' : isFnb ? 'Dapur Resmi Terverifikasi' : 'Direct Store (100% Toko Resmi)'),
    discountBadgeLabel: custom.discount_badge_label || (isPhysical ? 'Promo Diskon Hari Ini' : isFnb ? 'Harga Promo Kuliner' : 'Diskon Spesial Hari Ini'),
    comparisonTitle: custom.comparison_title || (isPhysical ? 'Kenapa Memilih Produk Kami Dibanding Merk Lain?' : isFnb ? 'Kenapa Memilih Menu Kami Dibanding Lainnya?' : isService ? 'Kenapa Memilih Layanan Kami Dibanding Cara Lain?' : 'Kenapa Memilih Solusi Kami Dibanding Cara Lain?'),
    comparisonSubtitle: custom.comparison_subtitle || (isPhysical ? 'Perbandingan kualitas bahan, daya tahan, dan garansi:' : isFnb ? 'Perbandingan kualitas rasa, kesegaran bahan, dan porsi:' : isService ? 'Perbedaan nyata efisiensi, akurasi, dan profesionalitas hasil:' : 'Perbedaan nyata efisiensi, akurasi, dan hasil yang akan Anda dapatkan:'),
    comparisonThemLabel: custom.comparison_them_label || (isPhysical ? 'Produk Pasaran / Lainnya' : isFnb ? 'Menu Lain / Pasaran' : isService ? 'Cara Lain / Konvensional' : 'Cara Lain / Lama'),
    comparisonUsLabel: custom.comparison_us_label || (isPhysical ? 'Kelebihan Produk Ini' : isFnb ? 'Keunggulan Menu Kami' : isService ? 'Solusi Layanan Ini' : 'Solusi Produk Ini'),
    testimonialsTitle: custom.testimonials_title || (isPhysical ? 'Apa Kata Pembeli Kami?' : isFnb ? 'Apa Kata Penikmat Kuliner Kami?' : isService ? 'Kepuasan & Ulasan Klien Kami' : 'Bukti Nyata & Kepuasan Pengguna'),
    testimonialsSubtitle: custom.testimonials_subtitle || (isPhysical ? 'Pengalaman langsung dari pembeli yang telah menggunakan produk kami:' : isFnb ? 'Pengalaman pelanggan yang telah mencicipi sajian menu kami:' : isService ? 'Pengalaman nyata dari klien yang telah mempercayakan jasanya:' : 'Pengalaman dan hasil nyata dari mereka yang telah mempraktikkan materi ini:'),
    socialProofBadge: custom.social_proof_badge || (isPhysical ? 'Ulasan Pembeli Terverifikasi' : isFnb ? 'Ulasan Penikmat Kuliner' : isService ? 'Testimoni Klien Terverifikasi' : 'Hasil Nyata Member'),
    ratingSummaryText: custom.rating_summary_text || (isPhysical ? '4.9 / 5.0 Rating Pembeli' : isFnb ? '4.9 / 5.0 Rating Rasa & Layanan' : '5.0 / 5.0 Rating Kepuasan'),
    verifiedUserLabel: custom.verified_user_label || (isPhysical ? 'Pembeli Terverifikasi' : isFnb ? 'Pelanggan Terverifikasi' : isService ? 'Klien Terverifikasi' : 'Verified User'),
    verifiedStatusLabel: custom.verified_status_label || (isPhysical ? 'Pesanan Selesai' : isFnb ? 'Puas & Kenyang' : isService ? 'Pengerjaan Tuntas' : 'Sukses'),
    bonusTitle: custom.bonus_title || (isPhysical ? 'Dapatkan Hadiah & Ekstra Bonus Pembelian' : isFnb ? 'Dapatkan Ekstra Topping / Bonus Menu' : isService ? 'Dapatkan Fasilitas & Ekstra Bonus Layanan' : 'Dapatkan Ekstra Bonus Eksklusif'),
    bonusSubtitle: custom.bonus_subtitle || (isPhysical ? 'Semua hadiah ekstra di bawah ini otomatis dikirim 100% GRATIS bersama paket pesanan Anda:' : isFnb ? 'Semua pelengkap ekstra di bawah ini otomatis disertakan 100% GRATIS bersama pesanan Anda:' : isService ? 'Semua fasilitas tambahan di bawah ini otomatis menjadi hak Anda 100% GRATIS saat memesan sekarang:' : 'Semua bonus berharga di bawah ini otomatis menjadi milik Anda 100% GRATIS saat menyelesaikan pesanan sekarang:'),
    bonusItemBadge: custom.bonus_item_badge || 'GRATIS',
    bonusTotalBanner: custom.bonus_total_banner || (isPhysical ? '🎉 Total Nilai Hadiah Tambahan: ' : '🎉 Total Nilai Semua Bonus: '),
    faqTitle: custom.faq_title || (isPhysical ? 'Pertanyaan Seputar Produk & Pengiriman (FAQ)' : isFnb ? 'Pertanyaan Seputar Menu & Pengantaran (FAQ)' : isService ? 'Pertanyaan Seputar Layanan & Pengerjaan (FAQ)' : 'Pertanyaan yang Sering Diajukan (FAQ)'),
    checkoutSectionTitle: custom.checkout_section_title || (isPhysical ? 'Formulir Pengiriman & Pembayaran' : isFnb ? 'Formulir Pemesanan Menu & Antar' : isService ? 'Formulir Booking & Pembayaran Layanan' : 'Form Pemesanan & Pembayaran'),
    variantSelectorLabel: custom.variant_selector_label || (isPhysical ? 'Pilihan Varian / Ukuran / Warna:' : isFnb ? 'Pilihan Varian / Porsi:' : isService ? 'Pilihan Paket Layanan:' : 'Pilihan Varian / Paket:'),
    selectedVariantLabel: custom.selected_variant_label || (isPhysical ? 'Varian Terpilih:' : isFnb ? 'Menu Terpilih:' : isService ? 'Paket Terpilih:' : 'Paket Terpilih:'),
    quantityLabel: custom.quantity_label || (isPhysical ? 'Jumlah Barang (Qty):' : isFnb ? 'Jumlah Porsi:' : isService ? 'Jumlah Sesi / Unit:' : 'Kuantitas:'),
    emailFieldLabel: custom.email_field_label || (isPhysical ? 'Alamat Email (Opsional - Bukti Pembelian)' : isFnb ? 'Alamat Email (Opsional)' : isService ? 'Alamat Email * (Wajib untuk Konfirmasi Jadwal)' : 'Alamat Email * (Wajib untuk Pengiriman Akses)'),
    notesFieldLabel: custom.notes_field_label || (isPhysical ? 'Catatan Pengiriman (Warna/Patokan Alamat Opsional)' : isFnb ? 'Catatan Dapur / Selera (Pedas/Alergi/Waktu Kirim)' : isService ? 'Catatan Kebutuhan / Briefing Singkat' : 'Catatan Tambahan / Briefing Singkat (Opsional)'),
    notesPlaceholder: custom.notes_placeholder || (isPhysical ? 'Contoh: Tolong packing bubble wrap tebal, jika rumah sepi titipkan ke pos satpam...' : isFnb ? 'Contoh: Sambal dipisah, jangan pakai bawang goreng, antar jam 12 siang...' : isService ? 'Contoh: Detail kendala teknis, lokasi lantai 2, tangga sudah disediakan...' : 'Tulis catatan khusus untuk penjual di sini (contoh: request varian khusus, catatan rasa/pengiriman, atau detail briefing jasa)...'),
    cartTitle: custom.cart_title || 'Keranjang Belanja',
    cartEmptyText: custom.cart_empty_text || 'Keranjang masih kosong',
    cartSubtotalLabel: custom.cart_subtotal_label || 'Subtotal',
    cartCheckoutButton: custom.cart_checkout_button || (isPhysical ? 'Lanjut ke Pengiriman & Bayar' : 'Lanjut ke Checkout'),
  };
}

export type ProductType =
  | 'PHYSICAL'
  | 'DIGITAL'
  | 'DIGITAL_FILE'
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

export type DbProductType = 'DIGITAL_FILE' | 'PHYSICAL' | 'SERVICE' | 'FOOD' | 'URL_LINK' | 'BOOKING';

/**
 * Maps arbitrary product_type / category strings into strictly valid Postgres product_type_enum values:
 * 'DIGITAL_FILE' | 'PHYSICAL' | 'SERVICE' | 'FOOD' | 'URL_LINK' | 'BOOKING'
 */
export function mapToDbProductType(rawProductType?: string, category?: string): DbProductType {
  const normType = String(rawProductType || '').toUpperCase().trim();
  const normCat = String(category || '').toLowerCase().trim();

  if (normType === 'PHYSICAL' || normCat === 'fisik' || normCat === 'physical' || normCat === 'retail') {
    return 'PHYSICAL';
  }
  if (normType === 'FOOD' || normCat === 'food' || normCat === 'fnb' || normCat === 'kuliner') {
    return 'FOOD';
  }
  if (
    normType === 'SERVICE' ||
    normType === 'FIELD_SERVICE' ||
    normType === 'LOCAL_SERVICE' ||
    normType === 'PROFESSIONAL_SERVICE' ||
    normType === 'AGENCY' ||
    normType === 'CREATOR' ||
    normCat === 'jasa' ||
    normCat === 'service' ||
    normCat === 'konsultasi'
  ) {
    return 'SERVICE';
  }
  if (normType === 'BOOKING') {
    return 'BOOKING';
  }
  if (normType === 'URL_LINK') {
    return 'URL_LINK';
  }
  return 'DIGITAL_FILE';
}

export interface ProductItem {
  id: number | string;
  name: string;
  title?: string;
  slug?: string;
  is_active?: boolean;
  category: 'terlaris' | 'digital' | 'fisik' | string;
  type?: 'physical' | 'digital' | 'fnb' | 'service' | string;
  product_type?: ProductType;
  custom_badge?: string;
  price: number;
  promo_price?: number;
  original_price?: number;
  originalPrice?: number;
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
  requires_shipping?: boolean;
  is_digital?: boolean;
  enable_cart?: boolean;
  fulfillment_metadata?: FulfillmentMetadata;
  single_page_config?: SinglePageConfig;
  external_url?: string;
  affiliate_url?: string;
  affiliate_link?: string;
  bypass_checkout?: boolean;
  cta_label?: string;
  micro_copy?: string;
  checkout_type?: 'internal' | 'external';
  features?: string[] | string;
  facilities?: string[] | string;
  link_digital?: string;
  asset_reference?: string;
  button_text?: string;
  meta_pixel_id_override?: string;
  tiktok_pixel_id_override?: string;
  order_bumps?: OrderBumpConfig | OrderBumpItem[];
  modules?: any[];
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

export function slugify(text?: string | null): string {
  if (!text || typeof text !== 'string') return '';
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
    variants: "Batch Intensif",
    metadata: {
      scarcity_badge: {
        enabled: true,
        text: "🔥 Sisa 50 Seat Kuota Terbatas",
      },
    },
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
      scarcity_badge: {
        enabled: true,
        text: "🔥 Sisa 50 Seat Kuota Terbatas",
      },
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
          description: "Akses penuh fitur CAPI server-side, multi-rotator CS, dan Dynamic QRIS."
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
            config: match?.single_page_config || {
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
              checkout_action_mode: 'DIRECT',
              whatsapp_custom_message: '',
              video_url: '',
              gallery_video_url: '',
              limit_single_item: false,
              section_order: [],
            },
          };
        }
      }
    } catch (e) {
      console.warn('[resolveSinglePageProduct] Error reading local configuration:', e);
    }
  }

  // 3. Coba cari di DEFAULT_PRODUCTS (HANYA UNTUK TENANT ONLINEBOOST - ZERO CROSS-TENANT LEAKAGE)
  if (tenantSlug === 'onlineboost') {
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
        config: defaultMatch?.single_page_config ?? {} as any,
      };
    }
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

  // Never treat explicit internal checkout or specific internal products as external
  if (
    item?.checkout_type === 'internal' ||
    item?.slug === 'ctwa-mastery-7day' ||
    item?.id === 'c7ba0001-7de7-4888-9999-000000000001'
  ) {
    return null;
  }

  // Only external / affiliate referral URLs
  const candidate =
    item.external_url ||
    item.affiliate_url ||
    item.affiliate_link ||
    item.link_external ||
    item.metadata?.external_url ||
    item.metadata?.affiliate_url ||
    item.metadata?.affiliate_link ||
    item.metadata?.link_external ||
    item.fulfillment_metadata?.external_url ||
    item.fulfillment_metadata?.affiliate_url ||
    item.fulfillment_metadata?.affiliate_link ||
    item.fulfillment_metadata?.access_url;

  if (candidate && typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
  }

  return null;
}

/**
 * Resolves default smart CTA button text based on product vertical.
 * If food/culinary -> "Pesan Sekarang", if digital/course -> "Daftar Sekarang", if service -> "Pesan Sekarang", if physical -> "Beli Sekarang".
 */
export function resolveProductDefaultCta(item: any): string {
  const normType = String(item?.product_type || item?.type || item?.category || '').toLowerCase();
  const nameLower = String(item?.name || item?.title || '').toLowerCase();

  // Preset A: FOOD / FNB
  if (
    normType === 'food' ||
    normType === 'fnb' ||
    normType.includes('food') ||
    normType.includes('fnb') ||
    normType.includes('kuliner') ||
    normType.includes('makanan') ||
    normType.includes('minuman') ||
    normType.includes('resto') ||
    normType.includes('cafe') ||
    nameLower.includes('frozen') ||
    nameLower.includes('daging') ||
    nameLower.includes('sei sapi')
  ) {
    return 'Pesan Sekarang';
  }

  // Preset C: DIGITAL / COURSE
  if (
    normType.includes('digital') ||
    normType.includes('course') ||
    normType.includes('ecourse') ||
    normType.includes('kelas') ||
    nameLower.includes('kelas') ||
    nameLower.includes('belajar') ||
    nameLower.includes('ecourse')
  ) {
    return 'Daftar Sekarang';
  }

  // Preset C2: SERVICE / AGENCY
  if (
    normType.includes('service') ||
    normType.includes('jasa') ||
    normType.includes('konsultasi') ||
    normType.includes('agency')
  ) {
    return 'Pesan Sekarang';
  }

  // Preset B: PHYSICAL / RETAIL
  return 'Beli Sekarang';
}

/**
 * Resolves CTA button label for a product.
 * Checks metadata.cta_text first (Universal Merchant Config), then cta_label, then contextual smart fallback.
 */
export function resolveProductCtaLabel(item: any, isExternal?: boolean): string {
  const directCta = item?.metadata?.cta_text || item?.cta_text || item?.cta_label || item?.metadata?.cta_label || item?.button_text;
  if (directCta && typeof directCta === 'string' && directCta.trim()) {
    return directCta.trim();
  }

  const normType = String(item?.product_type || item?.type || item?.category || '').toLowerCase();
  const nameLower = String(item?.name || item?.title || '').toLowerCase();
  const isFood =
    normType === 'food' ||
    normType === 'fnb' ||
    normType.includes('food') ||
    normType.includes('fnb') ||
    normType.includes('kuliner') ||
    normType.includes('makanan') ||
    normType.includes('minuman') ||
    normType.includes('resto') ||
    normType.includes('cafe') ||
    nameLower.includes('frozen') ||
    nameLower.includes('daging') ||
    nameLower.includes('sei sapi');

  const price = Number(item?.price ?? item?.promo_price ?? 0);
  if (price === 0) {
    if (isFood) {
      return 'Tambah ke Pesanan';
    }
    return 'Klaim Akses Gratis Sekarang';
  }

  if (isExternal) {
    const defaultLabel = resolveProductDefaultCta(item);
    return defaultLabel === 'Daftar Sekarang' ? 'Ikut Belajar' : defaultLabel;
  }

  return resolveProductDefaultCta(item);
}

/**
 * Universal check whether product voucher is active and enabled.
 * If is_enabled === false, voucher is completely disabled.
 */
export function isProductVoucherActive(product: any, config?: SinglePageConfig | null): boolean {
  if (!product && !config) return false;
  const prodVoucher = product?.metadata?.voucher_config || product?.voucher_config;
  const cfgVoucher = config?.voucher;

  // Strict check: if explicit is_enabled is false on either level, voucher is disabled
  if (prodVoucher && prodVoucher.is_enabled === false) return false;
  if (cfgVoucher && cfgVoucher.is_enabled === false) return false;

  // If explicit is_enabled is true and has code
  if (prodVoucher?.is_enabled === true && Boolean(prodVoucher.code?.trim())) return true;
  if (cfgVoucher?.is_enabled === true && Boolean(cfgVoucher.code?.trim())) return true;

  // Fallback for legacy configs without is_enabled: check if code exists and is_enabled is not false
  if (prodVoucher?.code?.trim() && prodVoucher.is_enabled !== false) return true;
  if (cfgVoucher?.code?.trim() && cfgVoucher.is_enabled !== false) return true;
  if (config?.discount_coupon?.trim() && cfgVoucher?.is_enabled !== false) return true;

  return false;
}

/**
 * Resolves active voucher configuration if enabled.
 * Returns null if voucher is turned off.
 */
export function getProductActiveVoucher(product: any, config?: SinglePageConfig | null): VoucherConfig | null {
  if (!isProductVoucherActive(product, config)) return null;
  const prodVoucher = product?.metadata?.voucher_config || product?.voucher_config;
  const cfgVoucher = config?.voucher;

  if (prodVoucher && prodVoucher.is_enabled !== false && prodVoucher.code?.trim()) {
    return {
      code: prodVoucher.code.trim().toUpperCase(),
      discount_type: prodVoucher.discount_type || 'nominal',
      discount_value: Number(prodVoucher.discount_value) || 0,
      min_spend: Number(prodVoucher.min_spend) || 0,
      shipping_discount_type: prodVoucher.shipping_discount_type || 'none',
      shipping_discount_value: Number(prodVoucher.shipping_discount_value) || 0,
      is_enabled: true,
    };
  }

  if (cfgVoucher && cfgVoucher.is_enabled !== false && cfgVoucher.code?.trim()) {
    return {
      ...cfgVoucher,
      code: cfgVoucher.code.trim().toUpperCase(),
      is_enabled: true,
    };
  }

  if (config?.discount_coupon?.trim() && cfgVoucher?.is_enabled !== false) {
    return {
      code: config.discount_coupon.trim().toUpperCase(),
      discount_type: 'nominal',
      discount_value: 20000,
      shipping_discount_type: 'none',
      shipping_discount_value: 0,
      min_spend: 0,
      is_enabled: true,
    };
  }

  return null;
}

/**
 * Normalizes customer briefing link (Google Docs/Drive/Notion/Airtable).
 * Automatically prepends 'https://' if user omitted the protocol.
 */
export function normalizeBriefingUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Checks if a value is a DOM Element (HTMLSpanElement, HTMLElement),
 * React SyntheticEvent, or internal React Fiber object.
 */
export function isDomOrReactFiber(val: any): boolean {
  if (!val || typeof val !== 'object') return false;

  // 1. Browser/Node Element & Node instances
  if (typeof Element !== 'undefined' && val instanceof Element) return true;
  if (typeof Node !== 'undefined' && val instanceof Node) return true;
  if (typeof val.nodeType === 'number') return true;

  // 2. React SyntheticEvent characteristics
  if (typeof val._reactName === 'string') return true;
  if ('nativeEvent' in val && '_reactName' in val) return true;
  if ('bubbles' in val && 'cancelable' in val && 'defaultPrevented' in val && typeof val.preventDefault === 'function') {
    return true;
  }
  if ('target' in val && val.target && typeof (val.target as any).nodeType === 'number') {
    return true;
  }
  if (val.constructor && typeof val.constructor.name === 'string') {
    const cName = val.constructor.name;
    if (
      cName === 'SyntheticBaseEvent' ||
      cName.endsWith('Event') ||
      cName.startsWith('HTML') ||
      cName === 'FiberNode'
    ) {
      return true;
    }
  }

  // 3. React Fiber & internal DOM properties
  try {
    const keys = Object.keys(val);
    for (const k of keys) {
      if (
        k.startsWith('__reactFiber$') ||
        k.startsWith('__reactProps$') ||
        k.startsWith('__reactContainer$') ||
        k.startsWith('__reactEvents$') ||
        k === '_reactListening'
      ) {
        return true;
      }
    }
  } catch {}

  return false;
}

/**
 * Deeply sanitizes any product form payload or record before state persistence,
 * localStorage caching, or API mutation.
 * Guarantees that:
 * 1. All fields are pure primitives, clean arrays, or plain objects.
 * 2. Any accidental DOM elements (HTMLSpanElement, HTMLElement) or SyntheticEvents are stripped.
 * 3. Circular references are completely broken to guarantee JSON.stringify never throws.
 */
export function sanitizeProductPayload<T = any>(input: T, seen = new WeakSet()): T {
  if (input === null || input === undefined) return input;

  // Primitives pass directly
  const inputType = typeof input;
  if (inputType === 'string' || inputType === 'number' || inputType === 'boolean') {
    return input;
  }

  // Discard functions, symbols, and bigints
  if (inputType === 'function' || inputType === 'symbol' || inputType === 'bigint') {
    return undefined as any;
  }

  // Detect and discard DOM elements, SyntheticEvents, or React Fibers
  if (isDomOrReactFiber(input)) {
    return undefined as any;
  }

  // Break circular structures
  if (typeof input === 'object') {
    if (seen.has(input as object)) {
      return undefined as any;
    }
    seen.add(input as object);
  }

  // Handle Arrays
  if (Array.isArray(input)) {
    const cleanArray: any[] = [];
    for (const item of input) {
      if (isDomOrReactFiber(item)) continue;
      const cleanItem = sanitizeProductPayload(item, seen);
      if (cleanItem !== undefined) {
        cleanArray.push(cleanItem);
      }
    }
    return cleanArray as any;
  }

  // Handle Plain Objects
  const cleanObj: Record<string, any> = {};
  for (const [key, value] of Object.entries(input as Record<string, any>)) {
    if (isDomOrReactFiber(value)) {
      continue;
    }
    const cleanVal = sanitizeProductPayload(value, seen);
    if (cleanVal !== undefined) {
      cleanObj[key] = cleanVal;
    }
  }

  // Specific product field string/number guarantees
  if ('name' in (input as any)) {
    cleanObj.name = typeof cleanObj.name === 'string' ? cleanObj.name : (typeof cleanObj.name === 'object' ? '' : String(cleanObj.name || ''));
  }
  if ('slug' in (input as any)) {
    cleanObj.slug = typeof cleanObj.slug === 'string' ? cleanObj.slug : (typeof cleanObj.slug === 'object' ? '' : String(cleanObj.slug || ''));
  }
  if ('category' in (input as any)) {
    cleanObj.category = typeof cleanObj.category === 'string' ? cleanObj.category : (typeof cleanObj.category === 'object' ? '' : String(cleanObj.category || ''));
  }
  if ('custom_badge' in (input as any)) {
    cleanObj.custom_badge = typeof cleanObj.custom_badge === 'string' ? cleanObj.custom_badge : (typeof cleanObj.custom_badge === 'object' ? '' : (cleanObj.custom_badge ? String(cleanObj.custom_badge) : ''));
  }
  if ('cta_label' in (input as any) && cleanObj.cta_label !== undefined) {
    cleanObj.cta_label = typeof cleanObj.cta_label === 'string' ? cleanObj.cta_label : (typeof cleanObj.cta_label === 'object' ? undefined : String(cleanObj.cta_label || ''));
  }
  if ('price' in cleanObj && typeof cleanObj.price !== 'number') {
    cleanObj.price = Number(cleanObj.price) || 0;
  }
  if ('promo_price' in cleanObj && cleanObj.promo_price !== undefined && typeof cleanObj.promo_price !== 'number') {
    cleanObj.promo_price = cleanObj.promo_price ? Number(cleanObj.promo_price) : undefined;
  }

  return cleanObj as T;
}

/**
 * Defensive JSON.stringify that is 100% resilient against circular structures,
 * DOM elements, and React fibers.
 */
export function safeJsonStringify(val: any, indent?: number): string {
  const sanitized = sanitizeProductPayload(val);
  try {
    return JSON.stringify(sanitized, null, indent);
  } catch (err) {
    const seen = new WeakSet();
    return JSON.stringify(
      val,
      (key, value) => {
        if (isDomOrReactFiber(value)) return undefined;
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return undefined;
          seen.add(value);
        }
        return value;
      },
      indent
    );
  }
}

/**
 * Resolves the dynamic canonical public URL for a product or storefront based on tenant custom domain.
 * ADR §54 & §21.1 / §25.3 Compliant.
 */
export function resolveTenantProductUrl(
  tenant: { slug: string; custom_domain?: string | null; metadata?: any },
  product?: { slug?: string; id?: string | number } | null
): string {
  const customDomain =
    tenant.custom_domain ||
    tenant.metadata?.custom_domain ||
    null;

  const productSlug = product?.slug || (product?.id ? String(product.id) : '');
  if (productSlug) {
    return getProductPageUrl(tenant.slug, productSlug, customDomain);
  }
  return getStorefrontUrl(tenant.slug, customDomain);
}

/**
 * Generates the structured catalog grounding text for AI bot knowledge injection.
 * Ensures all product links dynamically adhere to tenant custom domain hierarchy (§21.1 / §25.3).
 */
export function formatProductCatalogForBotKnowledge(
  tenant: { slug?: string; custom_domain?: string | null; metadata?: any; [key: string]: any },
  products: any[]
): string {
  if (!Array.isArray(products) || products.length === 0) return '';

  const customDomain =
    tenant.custom_domain ||
    tenant.metadata?.custom_domain ||
    null;

  const cleanDomain = customDomain
    ? String(customDomain).trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
    : null;

  const tenantSlug = tenant.slug || tenant.metadata?.slug || '';
  const baseUrl = cleanDomain
    ? `https://${cleanDomain}`
    : `https://shop.boontrack.com/${tenantSlug}`;

  return products
    .map((p: any) => {
      const pSlug = p.slug || p.id || '';
      const fullUrl = pSlug ? `${baseUrl}/p/${pSlug}` : baseUrl;
      const rawPrice = Number(p.price || 0);
      const promoPrice = p.promo_price !== undefined && p.promo_price !== null && p.promo_price !== ''
        ? Number(p.promo_price)
        : undefined;

      let priceStr = 'Gratis';
      if (promoPrice !== undefined && promoPrice > 0 && rawPrice > promoPrice) {
        priceStr = `Rp ${promoPrice.toLocaleString('id-ID')} (Promo dari Rp ${rawPrice.toLocaleString('id-ID')})`;
      } else if (promoPrice !== undefined && promoPrice > 0) {
        priceStr = `Rp ${promoPrice.toLocaleString('id-ID')}`;
      } else if (rawPrice > 0) {
        priceStr = `Rp ${rawPrice.toLocaleString('id-ID')}`;
      }

      const desc = p.description ? ` — ${p.description}` : '';
      return `• ${p.name || p.title || 'Paket'}: ${priceStr}${desc}\n  Link Checkout Resmi: ${fullUrl}`;
    })
    .join('\n\n');
}

/**
 * Fetches the active product catalog directly from PostgreSQL `products` table
 * with zero stale cache. Serves as single source of truth for LLM context grounding,
 * WhatsApp bot answering, and sales rep flows.
 */
export async function fetchActiveCatalog(
  tenantOrSlug: string | { id?: string; slug?: string; metadata?: any; custom_domain?: string | null; [key: string]: any },
  options?: {
    supabaseClient?: any;
    limit?: number;
    includeUnavailable?: boolean;
  }
): Promise<ProductItem[]> {
  try {
    const supabase = options?.supabaseClient || getSupabaseAdmin() || getSupabase();
    if (!supabase) return [];

    let tenantId: string | null = null;
    let tenantSlug: string | null = null;
    let tenantMeta: any = {};

    if (typeof tenantOrSlug === 'string') {
      const cleanInput = tenantOrSlug.trim();
      if (isValidUuid(cleanInput)) {
        tenantId = cleanInput;
      } else {
        tenantSlug = cleanInput.toLowerCase();
      }
    } else if (tenantOrSlug && typeof tenantOrSlug === 'object') {
      tenantId = tenantOrSlug.id && isValidUuid(tenantOrSlug.id) ? tenantOrSlug.id : null;
      tenantSlug = tenantOrSlug.slug ? String(tenantOrSlug.slug).trim().toLowerCase() : null;
      tenantMeta = tenantOrSlug.metadata || {};
    }

    // If we only have slug or only have id, attempt to resolve both to maximize SQL query precision
    if (!tenantId && tenantSlug) {
      try {
        const { data: tRow } = await supabase
          .from('tenants')
          .select('id, slug, metadata')
          .eq('slug', tenantSlug)
          .maybeSingle();
        if (tRow) {
          tenantId = tRow.id;
          tenantSlug = tRow.slug;
          tenantMeta = tRow.metadata || tenantMeta;
        }
      } catch (err) {
        console.warn('[fetchActiveCatalog] Tenant lookup note:', err);
      }
    } else if (tenantId && !tenantSlug) {
      try {
        const { data: tRow } = await supabase
          .from('tenants')
          .select('id, slug, metadata')
          .eq('id', tenantId)
          .maybeSingle();
        if (tRow) {
          tenantId = tRow.id;
          tenantSlug = tRow.slug;
          tenantMeta = tRow.metadata || tenantMeta;
        }
      } catch (err) {
        console.warn('[fetchActiveCatalog] Tenant lookup note:', err);
      }
    }

    const filters: string[] = [];
    if (tenantId) filters.push(`tenant_id.eq.${tenantId}`);
    if (tenantSlug && tenantSlug !== tenantId) filters.push(`tenant_id.eq.${tenantSlug}`);

    let query = supabase.from('products').select('*');

    if (filters.length > 1) {
      query = query.or(filters.join(','));
    } else if (filters.length === 1) {
      query = query.eq('tenant_id', tenantId || tenantSlug);
    } else {
      // Fallback to checking metadata.products if tenant has no database ID
      const metaProds = Array.isArray(tenantMeta.products) ? tenantMeta.products : [];
      return metaProds;
    }

    if (!options?.includeUnavailable) {
      query = query.eq('is_available', true);
    }

    query = query.order('created_at', { ascending: false });

    if (options?.limit && options.limit > 0) {
      query = query.limit(options.limit);
    }

    const { data: sqlProds, error } = await query;
    if (error) {
      console.warn('[fetchActiveCatalog] Error fetching SQL products:', error);
    }

    const mappedProducts: ProductItem[] = [];
    const seenSlugs = new Set<string>();
    const seenIds = new Set<string>();

    if (Array.isArray(sqlProds) && sqlProds.length > 0) {
      for (const p of sqlProds) {
        if (!p) continue;
        const pSlug = (p.slug || '').toLowerCase();
        const pId = String(p.id);
        if (pSlug) seenSlugs.add(pSlug);
        if (pId) seenIds.add(pId);

        const rawPrice = Number(p.price) || 0;
        const promoPrice = p.promo_price !== undefined && p.promo_price !== null && p.promo_price !== ''
          ? Number(p.promo_price)
          : undefined;

        mappedProducts.push({
          id: p.id,
          name: p.title || p.name || 'Produk',
          title: p.title || p.name,
          slug: p.slug,
          is_active: p.is_available !== false,
          category: p.category || 'digital',
          type: p.type || 'digital',
          product_type: p.product_type || (p.type ? String(p.type).toUpperCase() : 'DIGITAL'),
          price: rawPrice,
          promo_price: promoPrice,
          description: p.description || '',
          download_url: p.download_url || null,
          image: p.image_url || p.image || '',
          image_url: p.image_url || p.image || '',
          stock: p.stock !== undefined && p.stock !== null ? Number(p.stock) : 999,
          sku: p.sku || `SKU-${p.id}`,
          requires_shipping: Boolean(p.requires_shipping),
          features: Array.isArray(p.features) ? p.features : [],
          modules: Array.isArray(p.modules) ? p.modules : undefined,
          metadata: p.metadata || {},
        });
      }
    }

    // Dual-store fallback: ONLY if SQL products table is empty, fall back to metadata.products
    if (mappedProducts.length === 0) {
      const rawMetaProds = Array.isArray(tenantMeta.products) ? tenantMeta.products : [];
      for (const mp of rawMetaProds) {
        if (!mp || typeof mp !== 'object') continue;
        mappedProducts.push({
          ...mp,
          id: mp.id || `meta-${Date.now()}`,
          name: mp.name || mp.title || 'Produk',
          title: mp.title || mp.name,
          price: Number(mp.price || 0),
          promo_price: mp.promo_price ? Number(mp.promo_price) : undefined,
          description: mp.description || '',
          category: mp.category || 'digital',
          image: mp.image_url || mp.image || '',
          stock: mp.stock !== undefined && mp.stock !== null ? Number(mp.stock) : 999,
        });
      }
    }

    return mappedProducts;
  } catch (err) {
    console.error('[fetchActiveCatalog] Unexpected failure:', err);
    return [];
  }
}

/**
 * Fetches real-time catalog from PostgreSQL and returns structured grounding text for LLM/bot.
 * Ensures zero-hallucination links with tenant custom domain resolution.
 */
export async function fetchActiveCatalogGrounding(
  tenantOrSlug: string | { id?: string; slug?: string; metadata?: any; custom_domain?: string | null; [key: string]: any },
  options?: {
    supabaseClient?: any;
    limit?: number;
    includeUnavailable?: boolean;
  }
): Promise<string> {
  const tenantObj = typeof tenantOrSlug === 'string'
    ? { slug: tenantOrSlug }
    : tenantOrSlug;
  const products = await fetchActiveCatalog(tenantOrSlug, options);
  return formatProductCatalogForBotKnowledge(tenantObj, products);
}



