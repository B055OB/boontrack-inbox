import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { getTenantCheckoutUrl, getTenantActionUrl, getTenantBaseUrl } from '@/lib/checkout-link';
import {
  InteractiveMenu,
  InteractiveMenuOption,
  formatInteractiveMenu,
  formatWabaInteractive,
  formatWahaInteractive,
  WabaInteractivePayload,
} from '@/lib/whatsappFormatter';

export type CanonicalIndustryCategory =
  | 'PHYSICAL'
  | 'RETAIL'
  | 'DIGITAL'
  | 'FOOD'
  | 'FIELD_SERVICE'
  | 'PROFESSIONAL_SERVICE'
  | 'CREATOR'
  | 'CREATOR_AGENCY';

export interface ZeroAiTenantData {
  id: string;
  slug: string;
  name: string;
  category?: string;
  business_type?: string;
  custom_domain?: string | null;
  metadata?: Record<string, any>;
}

export interface ZeroAiMessagePayload {
  tenant_slug: string;
  message: string;
  sender_phone?: string;
  interactive_reply?: {
    id?: string;
    title?: string;
  };
  channel_type?: 'WABA' | 'WAHA';
}

export interface ZeroAiResult {
  handled: boolean;
  reply: string;
  type: 'TEXT' | 'INTERACTIVE' | 'HUMAN_TAKEOVER' | 'ORDER_STATUS' | 'CATALOG';
  intent_key?: string;
  silent?: boolean;
  interactive_payload?: WabaInteractivePayload;
  metadata_updated?: Record<string, any>;
  data?: any;
  quick_actions?: string[];
}

/**
 * Resolves synchronized quick reply chips for Webchat and Bot WhatsApp.
 * Sources from:
 * 1. tenants.metadata.quick_replies
 * 2. tenants.metadata.interactive_menus (extracting title)
 * 3. Default industry quick replies (with strict category sanitization)
 */
export function getIndustryQuickReplies(
  rawCategory?: string,
  meta?: Record<string, any>
): string[] {
  const category = normalizeIndustryCategory(rawCategory || meta?.category || meta?.business_category);

  // 1. Cek apakah ada quick_replies eksplisit di metadata
  const storedQuickReplies = meta?.quick_replies;
  if (Array.isArray(storedQuickReplies) && storedQuickReplies.length > 0) {
    const list = storedQuickReplies
      .map((r: any) => (typeof r === 'string' ? r : r.title || r.name))
      .filter((t: any): t is string => typeof t === 'string' && Boolean(t.trim()));

    // Sanitize: Jika kategori PROFESSIONAL_SERVICE, cegah teks FIELD_SERVICE bocor
    if (category === 'PROFESSIONAL_SERVICE') {
      const sanitized = list.filter((t) => !/servis|teknisi|toren|bengkel/i.test(t));
      if (sanitized.length > 0) return sanitized;
    } else {
      if (list.length > 0) return list;
    }
  }

  // 2. Cek apakah ada interactive_menus di metadata
  const storedMenus = meta?.interactive_menus;
  if (Array.isArray(storedMenus) && storedMenus.length > 0) {
    const list = storedMenus
      .map((m: any) => (typeof m === 'string' ? m : m.title || m.name))
      .filter((t: any): t is string => typeof t === 'string' && Boolean(t.trim()));

    if (category === 'PROFESSIONAL_SERVICE') {
      const sanitized = list.filter((t) => !/servis|teknisi|toren|bengkel/i.test(t));
      if (sanitized.length > 0) return sanitized;
    } else {
      if (list.length > 0) return list;
    }
  }

  // 3. Fallback default 100% konsisten berdasarkan 6 Kategori Industri Resmi
  switch (category) {
    case 'PROFESSIONAL_SERVICE':
      return ["Jadwalkan Konsultasi", "Paket & Tarif Layanan", "Portofolio / Brief", "Hubungi Konsultan"];
    case 'FIELD_SERVICE':
      return ["📅 Jadwalkan Servis/Teknisi", "💰 Tarif & Area Layanan", "🛠️ Konsultasi CS"];
    case 'FOOD':
      return ["🛵 Pesan Antar (Delivery)", "🥡 Ambil di Resto (Takeaway)", "📍 Lokasi & Jam Dapur"];
    case 'DIGITAL':
      return ["⚡ Akses Download & Materi", "🔑 Kendala Akun & Lisensi", "📚 Kurikulum Produk"];
    case 'CREATOR_AGENCY':
      return ["📊 Rate Card & Paket Endorse", "📦 Kirim Brief/Sampel", "📅 Jadwal Live Talent"];
    case 'PHYSICAL':
    default:
      return ["📦 Cek Katalog & Promo", "🚚 Cek Ongkir & Resi", "💬 Hubungi Live CS"];
  }
}

/**
 * 1. Menstandarkan input string kategori industri ke 6 Kategori Resmi
 */
export function normalizeIndustryCategory(rawCategory?: string): CanonicalIndustryCategory {
  const cat = (rawCategory || '').toUpperCase().trim();
  if (cat === 'FOOD' || cat === 'FNB' || cat === 'KULINER' || cat.includes('MAKANAN') || cat.includes('MINUMAN') || cat.includes('RESTO') || cat.includes('CAFE')) {
    return 'FOOD';
  }
  if (cat === 'DIGITAL' || cat.includes('COURSE') || cat.includes('ECOURSE') || cat.includes('EBOOK') || cat.includes('SOFTWARE') || cat.includes('LISENSI')) {
    return 'DIGITAL';
  }
  // Check PROFESSIONAL_SERVICE before FIELD_SERVICE to prevent collision on 'SERVICE' substring
  if (
    cat === 'PROFESSIONAL_SERVICE' ||
    cat === 'PRO_SERVICE' ||
    cat === 'PROFESSIONAL' ||
    cat === 'CONSULT' ||
    cat.includes('PROFESSIONAL') ||
    cat.includes('CONSULT') ||
    cat.includes('AGENCY_PRO') ||
    cat.includes('LEGAL') ||
    cat.includes('TRAVEL') ||
    cat.includes('UMROH') ||
    cat.includes('KLINIK') ||
    cat.includes('PRO')
  ) {
    return 'PROFESSIONAL_SERVICE';
  }
  if (
    cat === 'FIELD_SERVICE' ||
    cat === 'SERVICE' ||
    cat.includes('FIELD') ||
    cat.includes('SERVIS') ||
    cat.includes('BENGKEL') ||
    cat.includes('CLEANING') ||
    cat.includes('TEKNISI') ||
    cat.includes('REPAIR') ||
    cat.includes('TOREN')
  ) {
    return 'FIELD_SERVICE';
  }
  if (
    cat === 'CREATOR' ||
    cat === 'CREATOR_AGENCY' ||
    cat === 'KREATOR' ||
    cat.includes('CREATOR') ||
    cat.includes('KREATOR') ||
    cat.includes('TALENT') ||
    cat.includes('ENDORSE') ||
    cat.includes('INFLUENCER')
  ) {
    return 'CREATOR_AGENCY';
  }
  return 'PHYSICAL'; // Default Retail / Produk Fisik
}

/**
 * 2. Setup Dynamic Default Menu Berdasarkan 6 Kategori Industri
 * Menghasilkan 7 menu navigasi terstruktur sesuai instruksi arsitektur resmi.
 */
export function buildDefaultIndustryMenu(
  rawCategory: string | undefined,
  tenant: { name?: string; slug?: string; metadata?: Record<string, any> }
): InteractiveMenu {
  const category = normalizeIndustryCategory(rawCategory || tenant.metadata?.category || tenant.metadata?.business_category);
  const storeName = tenant.name || tenant.slug || 'Toko Kami';

  switch (category) {
    // -------------------------------------------------------------
    // 1. RETAIL / PRODUK FISIK
    // [1] Lihat Produk, [2] Cara Belanja, [3] Cek Status Pesanan/Resi,
    // [4] Pembayaran, [5] Info Pengiriman, [6] Garansi & Retur, [7] Hubungi CS
    // -------------------------------------------------------------
    case 'PHYSICAL':
    case 'RETAIL':
      return {
        id: 'menu_retail_physical',
        trigger: `Menu Layanan ${storeName}`,
        title: `Pilihan Layanan ${storeName}`,
        header_text: `Katalog & Bantuan ${storeName}`,
        description: `Halo! Selamat datang di ${storeName}. Silakan pilih menu layanan di bawah ini:`,
        options: [
          {
            id: 'opt_catalog',
            title: '1. Lihat Produk',
            description: 'Katalog etalase produk resmi & promo',
            responseText: 'CATALOG',
          },
          {
            id: 'opt_how_to_order',
            title: '2. Cara Belanja',
            description: 'Panduan pemesanan online kilat',
            responseText: 'HOW_TO_ORDER',
          },
          {
            id: 'opt_order_status',
            title: '3. Cek Status Pesanan/Resi',
            description: 'Lacak resi pengiriman & proses packing',
            responseText: 'ORDER_STATUS',
          },
          {
            id: 'opt_payment_info',
            title: '4. Pembayaran',
            description: 'Metode bayar QRIS & Rekening Resmi',
            responseText: 'PAYMENT_INFO',
          },
          {
            id: 'opt_shipping_info',
            title: '5. Info Pengiriman',
            description: 'Jasa kurir, estimasi & cek ongkir',
            responseText: 'SHIPPING_INFO',
          },
          {
            id: 'opt_return_policy',
            title: '6. Garansi & Retur',
            description: 'Kebijakan klaim garansi & ganti baru',
            responseText: 'RETURN_POLICY',
          },
          {
            id: 'opt_human_cs',
            title: '7. Hubungi CS',
            description: 'Bicara langsung dengan tim customer care',
            responseText: 'HUMAN_CS',
          },
        ],
      };

    // -------------------------------------------------------------
    // 2. PRODUK DIGITAL
    // [1] Katalog Digital, [2] Cara Beli & Aktivasi, [3] Cek Lisensi/Akses,
    // [4] Pembayaran Instan, [5] Panduan Akses, [6] Kebijakan Lisensi, [7] Hubungi CS
    // -------------------------------------------------------------
    case 'DIGITAL':
      return {
        id: 'menu_digital',
        trigger: `Katalog Digital ${storeName}`,
        title: `Akses Produk Digital ${storeName}`,
        header_text: `Pusat Layanan Digital ${storeName}`,
        description: `Halo! Selamat datang di ${storeName}. Temukan lisensi & produk digital unggulan di bawah ini:`,
        options: [
          {
            id: 'opt_catalog',
            title: '1. Katalog Digital',
            description: 'Daftar produk, kursus & software',
            responseText: 'CATALOG',
          },
          {
            id: 'opt_how_to_order',
            title: '2. Cara Beli & Aktivasi',
            description: 'Panduan beli & aktivasi otomatis',
            responseText: 'HOW_TO_ORDER',
          },
          {
            id: 'opt_order_status',
            title: '3. Cek Lisensi/Akses',
            description: 'Periksa status lisensi & link download',
            responseText: 'ORDER_STATUS',
          },
          {
            id: 'opt_payment_info',
            title: '4. Pembayaran Instan',
            description: 'Aktivasi otomatis detik via QRIS',
            responseText: 'PAYMENT_INFO',
          },
          {
            id: 'opt_access_guide',
            title: '5. Panduan Akses',
            description: 'Cara login & unduh materi pembelajaran',
            responseText: 'ACCESS_GUIDE',
          },
          {
            id: 'opt_license_policy',
            title: '6. Kebijakan Lisensi',
            description: 'Ketentuan penggunaan akun & pembaruan',
            responseText: 'LICENSE_POLICY',
          },
          {
            id: 'opt_human_cs',
            title: '7. Hubungi CS',
            description: 'Bantuan teknis kendala aktivasi lisensi',
            responseText: 'HUMAN_CS',
          },
        ],
      };

    // -------------------------------------------------------------
    // 3. F&B (KULINER / RESTO / CAFE)
    // [1] Lihat Menu, [2] Pesan Antar / Takeaway, [3] Cek Status Pesanan,
    // [4] Pembayaran & QRIS, [5] Jangkauan Antar & Lokasi, [6] Jam Buka & Info Halal, [7] Chat Kasir/Dapur
    // -------------------------------------------------------------
    case 'FOOD':
      return {
        id: 'menu_food_beverage',
        trigger: `Menu Kuliner ${storeName}`,
        title: `Daftar Menu ${storeName}`,
        header_text: `Layanan Antar & Meja ${storeName}`,
        description: `Selamat datang di ${storeName}! Siap memanjakan lidah Anda. Silakan pilih menu di bawah ini:`,
        options: [
          {
            id: 'opt_catalog',
            title: '1. Lihat Menu',
            description: 'Daftar makanan, minuman & paket hemat',
            responseText: 'CATALOG',
          },
          {
            id: 'opt_how_to_order',
            title: '2. Pesan Antar / Takeaway',
            description: 'Pesan langsung ke rumah atau pick-up',
            responseText: 'HOW_TO_ORDER',
          },
          {
            id: 'opt_order_status',
            title: '3. Cek Status Pesanan',
            description: 'Status proses dapur & pengantaran',
            responseText: 'ORDER_STATUS',
          },
          {
            id: 'opt_payment_info',
            title: '4. Pembayaran & QRIS',
            description: 'Scan QRIS instan & opsi transfer',
            responseText: 'PAYMENT_INFO',
          },
          {
            id: 'opt_delivery_coverage',
            title: '5. Jangkauan Antar & Lokasi',
            description: 'Radius pengantaran & alamat resto/outlet',
            responseText: 'DELIVERY_COVERAGE',
          },
          {
            id: 'opt_operating_hours_halal',
            title: '6. Jam Buka & Info Halal',
            description: 'Jadwal operasional dapur & sertifikasi',
            responseText: 'OPERATING_HOURS_HALAL',
          },
          {
            id: 'opt_human_cs',
            title: '7. Chat Kasir/Dapur',
            description: 'Request pesanan khusus / konfirmasi meja',
            responseText: 'HUMAN_CS',
          },
        ],
      };

    // -------------------------------------------------------------
    // 4. JASA LAPANGAN (SERVIS, BENGKEL, CLEANING)
    // [1] Daftar Layanan & Biaya, [2] Booking Teknisi, [3] Cek Status Servis,
    // [4] Info Tagihan, [5] Jangkauan Wilayah, [6] Garansi Pengerjaan, [7] Chat Teknisi
    // -------------------------------------------------------------
    case 'FIELD_SERVICE':
      return {
        id: 'menu_field_service',
        trigger: `Layanan Servis ${storeName}`,
        title: `Pusat Servis ${storeName}`,
        header_text: `Booking Teknisi ${storeName}`,
        description: `Halo! Butuh bantuan servis profesional dari ${storeName}? Pilih opsi layanan di bawah ini:`,
        options: [
          {
            id: 'opt_catalog',
            title: '1. Daftar Layanan & Biaya',
            description: 'Tarif transparan paket pengerjaan',
            responseText: 'CATALOG',
          },
          {
            id: 'opt_book_service',
            title: '2. Booking Teknisi',
            description: 'Jadwalkan kunjungan teknisi ke lokasi Anda',
            responseText: 'HOW_TO_ORDER',
          },
          {
            id: 'opt_order_status',
            title: '3. Cek Status Servis',
            description: 'Cek jadwal kedatangan & progres kerja',
            responseText: 'ORDER_STATUS',
          },
          {
            id: 'opt_payment_info',
            title: '4. Info Tagihan',
            description: 'Rincian invoice jasa & QRIS pengerjaan',
            responseText: 'PAYMENT_INFO',
          },
          {
            id: 'opt_service_area',
            title: '5. Jangkauan Wilayah',
            description: 'Area cakupan layanan home service',
            responseText: 'SERVICE_AREA',
          },
          {
            id: 'opt_warranty_policy',
            title: '6. Garansi Pengerjaan',
            description: 'Masa garansi pengerjaan & suku cadang',
            responseText: 'WARRANTY_POLICY',
          },
          {
            id: 'opt_human_cs',
            title: '7. Chat Teknisi',
            description: 'Konsultasi kendala teknis dengan spesialis',
            responseText: 'HUMAN_CS',
          },
        ],
      };

    // -------------------------------------------------------------
    // 5. PROFESI & AGENSI (KONSULTAN, LEGAL, TRAVEL)
    // [1] Solusi & Layanan, [2] Alur Kerjasama/Proposal, [3] Progres Project,
    // [4] Info Invoice & Termin, [5] Portofolio, [6] Terms & SLA, [7] Diskusi Konsultan
    // -------------------------------------------------------------
    case 'PROFESSIONAL_SERVICE':
      return {
        id: 'menu_professional_service',
        trigger: `Layanan Konsultasi ${storeName}`,
        title: `Solusi Bisnis ${storeName}`,
        header_text: `Layanan Profesional ${storeName}`,
        description: `Selamat datang di ${storeName}. Kami siap mendampingi kebutuhan konsultasi & audit profesional Anda:`,
        options: [
          {
            id: 'opt_catalog',
            title: '1. Paket & Tarif Layanan',
            description: 'Rincian paket penanganan profesional & tarif resmi',
            responseText: 'CATALOG',
          },
          {
            id: 'opt_proposal_flow',
            title: '2. Jadwalkan Konsultasi',
            description: 'Jadwalkan sesi konsultasi atau audit profesional',
            responseText: 'HOW_TO_ORDER',
          },
          {
            id: 'opt_order_status',
            title: '3. Progres Project',
            description: 'Cek tahapan milestone kontrak kerja',
            responseText: 'ORDER_STATUS',
          },
          {
            id: 'opt_payment_info',
            title: '4. Info Invoice & Termin',
            description: 'Sistem pembayaran termin & rekening resmi',
            responseText: 'PAYMENT_INFO',
          },
          {
            id: 'opt_portfolio',
            title: '5. Portofolio / Brief',
            description: 'Studi kasus hasil kerja klien & kirim brief proyek',
            responseText: 'PORTFOLIO',
          },
          {
            id: 'opt_sla_policy',
            title: '6. Terms & SLA',
            description: 'Standar perjanjian layanan & kerahasiaan',
            responseText: 'SLA_POLICY',
          },
          {
            id: 'opt_human_cs',
            title: '7. Hubungi Konsultan',
            description: 'Jadwalkan sesi meeting / diskusi dengan konsultan',
            responseText: 'HUMAN_CS',
          },
        ],
      };

    // -------------------------------------------------------------
    // 6. CREATOR & TALENT (AGENSI, ENDORSEMENT, LIVE HOST)
    // [1] Rate Card Endorse, [2] Booking Slot / Live, [3] Cek Jadwal Tayang,
    // [4] Konfirmasi DP / Bayar, [5] Media Kit & Portofolio, [6] Syarat & Ketentuan Kerjasama, [7] Chat Manager
    // -------------------------------------------------------------
    case 'CREATOR':
    case 'CREATOR_AGENCY':
      return {
        id: 'menu_creator_agency',
        trigger: `Kerjasama Talent ${storeName}`,
        title: `Management ${storeName}`,
        header_text: `Booking & Rate Card ${storeName}`,
        description: `Halo Brand & Partner! Terhubung langsung dengan tim official ${storeName}:`,
        options: [
          {
            id: 'opt_catalog',
            title: '1. Rate Card Endorse',
            description: 'Paket konten Reels, TikTok, YouTube & Live',
            responseText: 'CATALOG',
          },
          {
            id: 'opt_book_slot',
            title: '2. Booking Slot / Live',
            description: 'Kunci tanggal kampanye / live streaming',
            responseText: 'HOW_TO_ORDER',
          },
          {
            id: 'opt_order_status',
            title: '3. Cek Jadwal Tayang',
            description: 'Status review brief & jadwal posting',
            responseText: 'ORDER_STATUS',
          },
          {
            id: 'opt_payment_info',
            title: '4. Konfirmasi DP / Bayar',
            description: 'Info termin DP 50% & pelunasan invoice',
            responseText: 'PAYMENT_INFO',
          },
          {
            id: 'opt_media_kit',
            title: '5. Media Kit & Portofolio',
            description: 'Demografi audiens, insight & engagement rate',
            responseText: 'MEDIA_KIT',
          },
          {
            id: 'opt_collab_terms',
            title: '6. Syarat & Ketentuan Kerjasama',
            description: 'Ketentuan revisi, pengiriman sampel & hak cipta',
            responseText: 'COLLAB_TERMS',
          },
          {
            id: 'opt_human_cs',
            title: '7. Chat Manager',
            description: 'Diskusi khusus kampanye brand & kontrak eksklusif',
            responseText: 'HUMAN_CS',
          },
        ],
      };
  }
}

/**
 * 3. Deterministic Engine Logic (Zero LLM Token)
 * Memproses pesan masuk deterministik murni:
 * - Query produk aktif di database / metadata
 * - Query status pesanan / resi pelanggan
 * - Human takeover state management (paused_at & paused_until)
 * - Ekstraksi kebijakan toko dari metadata tenant tanpa teks statis mockup
 */
export async function processZeroAiMessage(
  payload: ZeroAiMessagePayload
): Promise<ZeroAiResult> {
  const supabase = getSupabaseAdmin() || getSupabase();
  const slug = payload.tenant_slug.trim();
  const rawMsg = (payload.message || '').trim();
  const cleanMsg = rawMsg.toLowerCase();
  const channelType = payload.channel_type || 'WAHA';
  const senderPhone = (payload.sender_phone || '').replace(/[^0-9]/g, '');

  if (!supabase) {
    return {
      handled: false,
      reply: 'Layanan database sedang tidak tersedia.',
      type: 'TEXT',
    };
  }

  // 1. Fetch Tenant Record
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, slug, name, category, business_type, tier, metadata')
    .eq('slug', slug)
    .maybeSingle();

  if (tErr || !tenant) {
    return {
      handled: false,
      reply: 'Data toko tidak ditemukan.',
      type: 'TEXT',
    };
  }

  const meta = tenant.metadata || {};
  const storeName = tenant.name || tenant.slug;

  // 2. CHECK HUMAN TAKEOVER GUARD
  // Jika bot_status === 'HUMAN_TAKEOVER' dan masih dalam rentang paused_until, bot DIAM (silent)
  const botStatus = meta.bot_status || 'BOT_ACTIVE';
  const pausedUntil = meta.paused_until ? new Date(meta.paused_until).getTime() : 0;
  const isCurrentlyPaused = botStatus === 'HUMAN_TAKEOVER' && Date.now() < pausedUntil;

  // Pelanggan bisa mengaktifkan bot kembali jika mengetik 'bot', 'menu', atau 'aktifkan bot'
  const isResetCommand = /^(bot|menu|aktifkan bot|reset bot|pilihan)\b/i.test(cleanMsg);

  if (isCurrentlyPaused && !isResetCommand) {
    return {
      handled: true,
      silent: true,
      reply: '',
      type: 'HUMAN_TAKEOVER',
      data: {
        bot_status: 'HUMAN_TAKEOVER',
        paused_until: meta.paused_until,
      },
    };
  }

  // Jika waktu jeda sudah habis atau pelanggan mengetik menu/bot, pulihkan bot status
  if (isCurrentlyPaused && isResetCommand) {
    const updatedMeta = {
      ...meta,
      bot_status: 'BOT_ACTIVE',
      paused_at: null,
      paused_until: null,
    };
    await supabase.from('tenants').update({ metadata: updatedMeta }).eq('id', tenant.id);
    tenant.metadata = updatedMeta;
  }

  // 3. Resolve Navigation Menu
  // Gunakan interactive_menus jika sudah dikustomisasi oleh tenant dengan opsi lengkap, atau default 7-item menu resmi
  let activeMenu: InteractiveMenu;
  if (
    Array.isArray(meta.interactive_menus) &&
    meta.interactive_menus.length > 0 &&
    Array.isArray(meta.interactive_menus[0]?.options) &&
    meta.interactive_menus[0].options.length >= 2
  ) {
    activeMenu = meta.interactive_menus[0];
  } else {
    activeMenu = buildDefaultIndustryMenu(tenant.category || tenant.business_type, tenant);
  }

  // Quick Action Buttons tersinkronisasi untuk Webchat & Bot WhatsApp
  const quickActions = getIndustryQuickReplies(tenant.category || tenant.business_type, meta);

  const sendResult = (res: Omit<ZeroAiResult, 'quick_actions'>): ZeroAiResult => ({
    ...res,
    quick_actions: quickActions,
  });

  // 4. Deteksi Pemilihan Opsi (1-7 atau kata kunci)
  const interactiveInput = payload.interactive_reply?.id || payload.interactive_reply?.title;
  let selectedOptionIndex: number = -1; // 1-indexed

  if (interactiveInput) {
    const foundIdx = activeMenu.options.findIndex(
      (o, i) => o.id === interactiveInput || o.title.toLowerCase().includes(interactiveInput.toLowerCase()) || (i + 1).toString() === interactiveInput
    );
    if (foundIdx !== -1) selectedOptionIndex = foundIdx + 1;
  }

  if (selectedOptionIndex === -1) {
    // Cek angka 1-7 di awal pesan atau pesan persis
    const numMatch = cleanMsg.match(/^\[?([1-7])\]?(\.|\s|$)/) || cleanMsg.match(/^([1-7])$/);
    if (numMatch) {
      selectedOptionIndex = parseInt(numMatch[1], 10);
    } else {
      // Cek pencocokan judul opsi (tahan terhadap emoji dan awalan angka)
      const sanitizeForMatch = (str: string) =>
        str
          .toLowerCase()
          .replace(/^[0-9]+[.)]\s*/, '')
          .replace(/[^\p{L}\p{N}\s]/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const normalizedInput = sanitizeForMatch(cleanMsg);
      const foundIdx = activeMenu.options.findIndex((opt) => {
        const normOpt = sanitizeForMatch(opt.title);
        return (
          (normOpt.length >= 3 && normalizedInput.includes(normOpt)) ||
          (normalizedInput.length >= 3 && normOpt.includes(normalizedInput))
        );
      });
      if (foundIdx !== -1) selectedOptionIndex = foundIdx + 1;
    }
  }

  const category = normalizeIndustryCategory(tenant.category || tenant.business_type);

  // Cari produk utama untuk direct deep-link jika ada
  let primaryProduct: { id?: string | number; slug?: string } | undefined;
  if (Array.isArray(meta.products) && meta.products.length > 0) {
    primaryProduct = { id: meta.products[0].id, slug: meta.products[0].slug };
  } else if (meta.product?.name) {
    primaryProduct = { id: meta.product.id, slug: meta.product.slug };
  }

  const tenantDomainInfo = {
    slug: tenant.slug,
    custom_domain: tenant.metadata?.custom_domain || null,
    category,
    business_type: tenant.business_type,
  };

  let actionUrl = getTenantActionUrl(tenantDomainInfo, primaryProduct);

  // 5. INTENT DISPATCHER (ZERO-TOKEN DETERMINISTIC LOGIC)

  // ── [INTENT 1]: LIHAT PRODUK / KATALOG / MENU / RATE CARD / TARIF ──
  if (
    selectedOptionIndex === 1 ||
    cleanMsg.includes('katalog') ||
    cleanMsg.includes('produk') ||
    cleanMsg.includes('menu') ||
    cleanMsg.includes('tarif') ||
    cleanMsg.includes('paket') ||
    cleanMsg.includes('layanan') ||
    cleanMsg.includes('solusi')
  ) {
    let productLines: string[] = [];

    // Query tabel products resmi
    const { data: dbProducts } = await supabase
      .from('products')
      .select('*')
      .or(`tenant_id.eq.${tenant.id},tenant_id.eq.${tenant.slug}`)
      .eq('is_available', true)
      .order('price', { ascending: true })
      .limit(10);

    if (dbProducts && dbProducts.length > 0) {
      primaryProduct = { id: dbProducts[0].id, slug: dbProducts[0].slug };
      actionUrl = getTenantActionUrl(tenantDomainInfo, primaryProduct);

      productLines = dbProducts.map((p: any, idx: number) => {
        const priceNum = Number(p.promo_price || p.price || 0);
        const priceStr = `Rp ${priceNum.toLocaleString('id-ID')}`;
        const desc = p.description ? ` - ${p.description.slice(0, 80)}` : '';
        return `*${idx + 1}.* *${p.title || p.name}*\n   💵 Harga: *${priceStr}*${desc}`;
      });
    } else if (Array.isArray(meta.products) && meta.products.length > 0) {
      productLines = meta.products.map((p: any, idx: number) => {
        const priceNum = Number(p.promo_price || p.price || 0);
        return `*${idx + 1}.* *${p.name || p.title}*\n   💵 Harga: *Rp ${priceNum.toLocaleString('id-ID')}*`;
      });
    } else if (meta.product?.name) {
      const p = meta.product;
      const priceNum = Number(p.price || 0);
      productLines.push(`*1.* *${p.name}*\n   💵 Harga: *Rp ${priceNum.toLocaleString('id-ID')}*`);
    }

    let replyText = '';
    if (productLines.length > 0) {
      if (category === 'PROFESSIONAL_SERVICE') {
        replyText =
          `📋 *DAFTAR PAKET & TARIF LAYANAN ${storeName.toUpperCase()}*\n\n` +
          productLines.join('\n\n') +
          `\n\n👉 *Jadwalkan Konsultasi / Brief Layanan di:*\n${actionUrl}\n` +
          `_Silakan pilih sesi jadwal konsultasi atau kirimkan ringkasan kebutuhan proyek Anda._\n\n` +
          `_Ketik *menu* untuk kembali ke pilihan utama._`;
      } else if (category === 'FIELD_SERVICE') {
        replyText =
          `🛠️ *DAFTAR LAYANAN & ESTIMASI BIAYA ${storeName.toUpperCase()}*\n\n` +
          productLines.join('\n\n') +
          `\n\n👉 *Booking Kunjungan Teknisi di:*\n${actionUrl}\n` +
          `_Pilih slot waktu pengerjaan dan konfirmasi alamat lokasi servis Anda._\n\n` +
          `_Ketik *menu* untuk kembali ke pilihan utama._`;
      } else if (category === 'CREATOR_AGENCY') {
        replyText =
          `📊 *RATE CARD & PAKET KERJASAMA ${storeName.toUpperCase()}*\n\n` +
          productLines.join('\n\n') +
          `\n\n👉 *Lihat Paket & Ajukan Brief di:*\n${actionUrl}\n` +
          `_Tersedia paket endorse, live streaming, dan kampanye konten._\n\n` +
          `_Ketik *menu* untuk kembali ke pilihan utama._`;
      } else if (category === 'FOOD') {
        replyText =
          `🍽️ *DAFTAR MENU KULINER ${storeName.toUpperCase()}*\n\n` +
          productLines.join('\n\n') +
          `\n\n👉 *Pesan Menu Antar / Takeaway di:*\n${actionUrl}\n` +
          `_Pesanan diproses langsung oleh dapur kami._\n\n` +
          `_Ketik *menu* untuk kembali ke pilihan utama._`;
      } else if (category === 'DIGITAL') {
        replyText =
          `⚡ *KATALOG PRODUK DIGITAL & KURSUS ${storeName.toUpperCase()}*\n\n` +
          productLines.join('\n\n') +
          `\n\n👉 *Beli & Dapatkan Akses Instan di:*\n${actionUrl}\n` +
          `_Akses download materi & lisensi terkirim otomatis tanpa ongkir._\n\n` +
          `_Ketik *menu* untuk kembali ke pilihan utama._`;
      } else {
        replyText =
          `🛍️ *DAFTAR KATALOG RESMI ${storeName.toUpperCase()}*\n\n` +
          productLines.join('\n\n') +
          `\n\n👉 *Pemesanan & Checkout Otomatis Langsung di:*\n${actionUrl}\n\n` +
          `_Ketik *menu* untuk kembali ke pilihan utama._`;
      }
    } else {
      if (category === 'PROFESSIONAL_SERVICE') {
        replyText =
          `📋 *LAYANAN & KONSULTASI ${storeName.toUpperCase()}*\n\n` +
          `Katalog paket konsultasi dan solusi resmi kami dapat langsung diakses melalui tautan etalase:\n\n` +
          `👉 ${actionUrl}\n\n` +
          `_Silakan tentukan jadwal sesi atau sampaikan brief kebutuhan Anda._\n\n` +
          `_Ketik *menu* untuk kembali ke pilihan utama._`;
      } else if (category === 'FIELD_SERVICE') {
        replyText =
          `🛠️ *PUSAT LAYANAN SERVIS ${storeName.toUpperCase()}*\n\n` +
          `Katalog paket pengerjaan dan booking teknisi dapat langsung diakses melalui:\n\n` +
          `👉 ${actionUrl}\n\n` +
          `_Tentukan slot waktu kunjungan dan alamat servis Anda._\n\n` +
          `_Ketik *menu* untuk kembali ke pilihan utama._`;
      } else if (category === 'CREATOR_AGENCY') {
        replyText =
          `📊 *RATE CARD & MEDIA KIT ${storeName.toUpperCase()}*\n\n` +
          `Paket rate card dan portofolio talent dapat langsung diakses melalui tautan etalase:\n\n` +
          `👉 ${actionUrl}\n\n` +
          `_Ketik *menu* untuk kembali ke pilihan utama._`;
      } else if (category === 'FOOD') {
        replyText =
          `🍽️ *MENU RESMI ${storeName.toUpperCase()}*\n\n` +
          `Daftar menu sajian dan opsi pemesanan dapat langsung diakses melalui tautan etalase:\n\n` +
          `👉 ${actionUrl}\n\n` +
          `_Ketik *menu* untuk kembali ke pilihan utama._`;
      } else if (category === 'DIGITAL') {
        replyText =
          `⚡ *KATALOG DIGITAL ${storeName.toUpperCase()}*\n\n` +
          `Katalog lisensi dan produk digital kami dapat langsung diakses melalui tautan etalase:\n\n` +
          `👉 ${actionUrl}\n\n` +
          `_Ketik *menu* untuk kembali ke pilihan utama._`;
      } else {
        replyText =
          `🛍️ *KATALOG ${storeName.toUpperCase()}*\n\n` +
          `Katalog produk dan paket resmi kami dapat langsung diakses melalui tautan etalase:\n\n` +
          `👉 ${actionUrl}\n\n` +
          `_Ketik *menu* untuk kembali ke pilihan utama._`;
      }
    }

    return sendResult({
      handled: true,
      reply: replyText,
      type: 'CATALOG',
      intent_key: 'CATALOG',
    });
  }

  // ── [INTENT 2]: CARA BELANJA / CARA BELI / BOOKING / PROPOSAL FLOW / JADWAL ──
  if (
    selectedOptionIndex === 2 ||
    cleanMsg.includes('cara belanja') ||
    cleanMsg.includes('cara beli') ||
    cleanMsg.includes('cara pesan') ||
    cleanMsg.includes('jadwalkan') ||
    cleanMsg.includes('booking') ||
    cleanMsg.includes('jadwal') ||
    cleanMsg.includes('konsultasi') ||
    cleanMsg.includes('janji temu') ||
    cleanMsg.includes('audit')
  ) {
    const customHowTo = meta.policies?.how_to_order || meta.how_to_order;

    let guideText = customHowTo;
    if (!guideText) {
      if (category === 'PROFESSIONAL_SERVICE') {
        guideText =
          `1. Pilih paket konsultasi atau audit profesional di etalase resmi: ${actionUrl}\n` +
          `2. Tentukan jadwal sesi konsultasi atau kirimkan ringkasan kebutuhan / brief proyek Anda.\n` +
          `3. Konsultan kami akan mengonfirmasi jadwal pertemuan (1-on-1 meeting) & proposal kerja sama.\n` +
          `4. Invoice komitmen / retainer diterbitkan resmi sesuai kesepakatan (tanpa add-to-cart retail).`;
      } else if (category === 'FIELD_SERVICE') {
        guideText =
          `1. Tentukan jenis layanan servis yang Anda butuhkan di etalase: ${actionUrl}\n` +
          `2. Tentukan jadwal slot waktu kunjungan dan kirimkan alamat lengkap lokasi servis.\n` +
          `3. Teknisi kami akan datang tepat waktu sesuai konfirmasi jadwal.\n` +
          `4. Pembayaran dilakukan setelah pengerjaan tuntas & teruji di tempat.`;
      } else if (category === 'CREATOR_AGENCY') {
        guideText =
          `1. Pilih paket kerjasama atau rate card di etalase: ${actionUrl}\n` +
          `2. Kirimkan brief kreatif, durasi kampanye, atau sampel produk Anda.\n` +
          `3. Manajer talent kami akan mereview kesesuaian dan mengonfirmasi jadwal penayangan/live.\n` +
          `4. Pelunasan DP/termin dilakukan resmi sebelum produksi konten dimulai.`;
      } else if (category === 'FOOD') {
        guideText =
          `1. Pilih hidangan favorit pada menu kami di etalase: ${actionUrl}\n` +
          `2. Konfirmasi pesanan antar (delivery kurir instan) atau ambil di tempat (takeaway).\n` +
          `3. Bayar praktis menggunakan QRIS atau Transfer Bank.\n` +
          `4. Makanan diproses langsung oleh dapur kami dan siap diantar/diambil.`;
      } else if (category === 'DIGITAL') {
        guideText =
          `1. Buka link produk: ${actionUrl}\n` +
          `2. Masukkan nama & email aktif Anda.\n` +
          `3. Selesaikan pembayaran instan melalui QRIS.\n` +
          `4. Kredensial & link download langsung terkirim otomatis ke email & WhatsApp Anda (tanpa form ongkir).`;
      } else {
        guideText =
          `1. Pilih produk unggulan di etalase resmi kami: ${actionUrl}\n` +
          `2. Klik *Beli Sekarang* dan isi data alamat pengiriman.\n` +
          `3. Bayar secara instan via QRIS (BCA, DANA, GoPay, OVO, ShopeePay).\n` +
          `4. Pesanan segera dikemas & nomor resi akan dikirim otomatis ke WhatsApp ini.`;
      }
    }

    const titleHeader =
      category === 'PROFESSIONAL_SERVICE'
        ? 'PANDUAN KONSULTASI & JADWAL'
        : category === 'FIELD_SERVICE'
        ? 'PANDUAN BOOKING TEKNISI'
        : category === 'CREATOR_AGENCY'
        ? 'ALUR KERJASAMA & BRIEF'
        : category === 'FOOD'
        ? 'PANDUAN PEMESANAN KULINER'
        : category === 'DIGITAL'
        ? 'PANDUAN PEMBELIAN DIGITAL'
        : 'PANDUAN PEMESANAN';

    const ctaHeader =
      category === 'PROFESSIONAL_SERVICE'
        ? 'Jadwalkan Sesi Konsultasi Anda'
        : category === 'FIELD_SERVICE'
        ? 'Booking Jadwal Servis Anda'
        : category === 'CREATOR_AGENCY'
        ? 'Ajukan Kerjasama / Brief'
        : category === 'FOOD'
        ? 'Pesan Menu Favorit'
        : category === 'DIGITAL'
        ? 'Dapatkan Akses Instan'
        : 'Mulai Pesanan Anda';

    const replyText =
      `📋 *${titleHeader} ${storeName.toUpperCase()}*\n\n` +
      `${guideText}\n\n` +
      `👉 *${ctaHeader}:* ${actionUrl}\n\n` +
      `_Ketik *menu* untuk kembali ke pilihan utama._`;

    return sendResult({
      handled: true,
      reply: replyText,
      type: 'TEXT',
      intent_key: 'HOW_TO_ORDER',
    });
  }

  // ── [INTENT 3]: CEK STATUS PESANAN / RESI / PROGRES / JADWAL ──
  if (selectedOptionIndex === 3 || cleanMsg.includes('cek resi') || cleanMsg.includes('status pesanan') || cleanMsg.includes('resi')) {
    // 1. Ekstrak Order ID jika ada di pesan
    const orderIdMatch = cleanMsg.match(/(ord-[a-z0-9-]+|[0-9a-f]{8}-[0-9a-f]{4})/i);
    const searchOrderId = orderIdMatch ? orderIdMatch[0] : null;

    let orderQuery = supabase
      .from('orders')
      .select('*')
      .eq('tenant_slug', tenant.slug)
      .order('created_at', { ascending: false })
      .limit(3);

    if (searchOrderId) {
      orderQuery = orderQuery.ilike('id', `%${searchOrderId}%`);
    } else if (senderPhone) {
      const cleanPhone = senderPhone.startsWith('0') ? '62' + senderPhone.slice(1) : senderPhone;
      orderQuery = orderQuery.or(`customer_phone.ilike.%${cleanPhone}%,customer_phone.ilike.%${senderPhone}%`);
    }

    const { data: matchedOrders } = await orderQuery;

    if (matchedOrders && matchedOrders.length > 0) {
      const orderDetails = matchedOrders.map((ord: any) => {
        const statusMap: Record<string, string> = {
          PAID: '✅ Lunas / Diproses',
          PENDING: '⏳ Menunggu Pembayaran',
          COMPLETED: '🎉 Pesanan Selesai',
          SHIPPED: '🚚 Sedang Dikirim',
          CANCELLED: '❌ Dibatalkan',
        };
        const st = statusMap[(ord.status || '').toUpperCase()] || ord.status || 'Aktif';
        const dateStr = new Date(ord.created_at).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
        const amountStr = `Rp ${Number(ord.gross_amount || 0).toLocaleString('id-ID')}`;
        return (
          `📦 *No. Pesanan:* \`${ord.id}\`\n` +
          `• Produk: ${ord.product_title || 'Paket Pesanan'}\n` +
          `• Status: *${st}*\n` +
          `• Nilai: *${amountStr}* (${dateStr})`
        );
      }).join('\n\n');

      const replyText =
        `🔍 *STATUS PESANAN TERBARU ${storeName.toUpperCase()}*\n\n` +
        `${orderDetails}\n\n` +
        `Jika membutuhkan bantuan detail pengiriman, silakan pilih *[7] Hubungi CS*.\n\n` +
        `_Ketik *menu* untuk kembali ke pilihan utama._`;

      return sendResult({
        handled: true,
        reply: replyText,
        type: 'ORDER_STATUS',
        intent_key: 'ORDER_STATUS',
        data: matchedOrders,
      });
    } else {
      const replyText =
        `🔍 *LACAK STATUS PESANAN / RESI*\n\n` +
        `Belum ditemukan pesanan aktif dengan nomor WhatsApp ini (${senderPhone || 'terdeteksi'}).\n\n` +
        `Jika Anda telah bertransaksi, silakan ketik format:\n` +
        `*RESI [ID-PESANAN]* (contoh: *RESI ORD-12345*)\n\n` +
        `Atau hubungi admin kami dengan mengetik *7* untuk pengecekan manual.`;

      return sendResult({
        handled: true,
        reply: replyText,
        type: 'ORDER_STATUS',
        intent_key: 'ORDER_STATUS',
      });
    }
  }

  // ── [INTENT 4]: PEMBAYARAN / REKENING / QRIS / INVOICE ──
  if (selectedOptionIndex === 4 || cleanMsg.includes('pembayaran') || cleanMsg.includes('rekening') || cleanMsg.includes('qris')) {
    const bankConfig = meta.bank || meta.payment_info || {};
    const bankName = bankConfig.name || bankConfig.bank_name || 'BCA';
    const accountNum = bankConfig.account || bankConfig.account_number || '-';
    const accountHolder = bankConfig.holder || bankConfig.account_holder || storeName;

    let paymentMethodDescription = '';
    let actionPaymentCta = '';

    if (category === 'PROFESSIONAL_SERVICE') {
      paymentMethodDescription =
        `Kami mendukung sistem pembayaran termin / retainer kontrak kerja resmi:\n\n` +
        `1️⃣ *Transfer Bank Resmi:*\n` +
        `   • Bank: *${bankName}*\n` +
        `   • No. Rekening: \`${accountNum}\`\n` +
        `   • Atas Nama: *${accountHolder}*\n\n` +
        `2️⃣ *QRIS Dinamis Per Milestone / Sesi:*\n` +
        `   Diterbitkan langsung sesuai nilai invoice kesepakatan bersama.`;
      actionPaymentCta =
        `👉 *Konsultasikan Jadwal & Penawaran:*\n${actionUrl}\n` +
        `_Invoice resmi diterbitkan setelah jadwal atau brief proyek disepakati bersama._`;
    } else if (category === 'FIELD_SERVICE') {
      paymentMethodDescription =
        `Pembayaran jasa teknisi dilakukan setelah pengerjaan selesai di lokasi:\n\n` +
        `1️⃣ *Bayar di Tempat (Tunai / QRIS Teknisi)*\n` +
        `   Bayar setelah hasil pengerjaan dicek dan teruji tuntas.\n\n` +
        `2️⃣ *Transfer Bank Rekening Resmi:*\n` +
        `   • Bank: *${bankName}*\n` +
        `   • No. Rekening: \`${accountNum}\`\n` +
        `   • Atas Nama: *${accountHolder}*`;
      actionPaymentCta =
        `👉 *Booking Servis & Jadwal Teknisi:*\n${actionUrl}\n` +
        `_Pilih jadwal kedatangan tanpa kewajiban bayar di muka._`;
    } else if (category === 'CREATOR_AGENCY') {
      paymentMethodDescription =
        `Pembayaran paket endorsement dan kampanye konten:\n\n` +
        `1️⃣ *Termin / DP Resmi:*\n` +
        `   • Bank: *${bankName}*\n` +
        `   • No. Rekening: \`${accountNum}\`\n` +
        `   • Atas Nama: *${accountHolder}*\n\n` +
        `2️⃣ *QRIS Dinamis Instan (Support BCA, DANA, GoPay, OVO, ShopeePay)*`;
      actionPaymentCta =
        `👉 *Pilih Paket & Kirimkan Brief:*\n${actionUrl}\n` +
        `_Invoice DP diterbitkan resmi setelah brief materi disetujui._`;
    } else {
      paymentMethodDescription =
        `Kami mendukung metode pembayaran otomatis & terverifikasi:\n\n` +
        `1️⃣ *QRIS Dinamis 3 Detik (Rekomendasi)*\n` +
        `   Mendukung: BCA, Mandiri, BRI, BNI, DANA, GoPay, OVO, ShopeePay.\n\n` +
        `2️⃣ *Transfer Bank Manual:*\n` +
        `   • Bank: *${bankName}*\n` +
        `   • No. Rekening: \`${accountNum}\`\n` +
        `   • Atas Nama: *${accountHolder}*`;
      actionPaymentCta = `👉 *Checkout & Terbitkan QRIS Otomatis:* ${actionUrl}`;
    }

    const replyText =
      `💳 *INFORMASI PEMBAYARAN RESMI ${storeName.toUpperCase()}*\n\n` +
      `${paymentMethodDescription}\n\n` +
      `${actionPaymentCta}\n\n` +
      `_Ketik *menu* untuk kembali ke pilihan utama._`;

    return sendResult({
      handled: true,
      reply: replyText,
      type: 'TEXT',
      intent_key: 'PAYMENT_INFO',
    });
  }

  // ── [INTENT 5]: INFO PENGIRIMAN / JANGKAUAN WILAYAH / PORTOFOLIO / MEDIA KIT ──
  if (selectedOptionIndex === 5 || cleanMsg.includes('pengiriman') || cleanMsg.includes('jangkauan') || cleanMsg.includes('ongkir') || cleanMsg.includes('portofolio') || cleanMsg.includes('media kit')) {
    const shippingPolicy = meta.policies?.shipping || meta.shipping_info || meta.policies?.delivery_coverage || meta.coverage_area;
    const category = normalizeIndustryCategory(tenant.category || tenant.business_type);

    let infoText = shippingPolicy;
    if (!infoText) {
      if (category === 'DIGITAL') {
        infoText = `Pengiriman seluruh produk digital bersifat *INSTAN & OTOMATIS* ke email & WhatsApp Anda tepat setelah pembayaran QRIS diverifikasi.`;
      } else if (category === 'FOOD') {
        infoText = `Pesanan diantar langsung oleh kurir internal/ekspres dalam radius pengantaran kota. Makanan dikemas higienis dengan thermal packaging khusus.`;
      } else if (category === 'FIELD_SERVICE') {
        infoText = `Cakupan wilayah pengerjaan teknisi mencakup seluruh area kota dan sekitarnya tanpa biaya survei tersembunyi.`;
      } else if (category === 'PROFESSIONAL_SERVICE') {
        infoText = `Portofolio dan riwayat milestone hasil kerja klien kami dapat diakses langsung pada halaman resmi atau didiskusikan saat sesi konsultasi.`;
      } else if (category === 'CREATOR_AGENCY') {
        infoText = `Media kit resmi memuat insight audiens aktif, rasio gender, engagement rate, dan riwayat kolaborasi brand dapat dikirimkan oleh manager kami.`;
      } else {
        infoText = `Kami bekerjasama dengan ekspedisi resmi (JNE, J&T, SiCepat, Anteraja). Seluruh paket dikemas aman menggunakan bubble wrap tebal dan asuransi pengiriman.`;
      }
    }

    const replyText =
      `🚚 *INFORMASI PENGIRIMAN & LAYANAN ${storeName.toUpperCase()}*\n\n` +
      `${infoText}\n\n` +
      `_Ketik *menu* untuk kembali ke pilihan utama._`;

    return sendResult({
      handled: true,
      reply: replyText,
      type: 'TEXT',
      intent_key: 'SHIPPING_INFO',
    });
  }

  // ── [INTENT 6]: GARANSI & RETUR / KEBIJAKAN LISENSI / JAM BUKA / SLA / SYARAT KERJASAMA ──
  if (selectedOptionIndex === 6 || cleanMsg.includes('garansi') || cleanMsg.includes('retur') || cleanMsg.includes('jam buka') || cleanMsg.includes('syarat')) {
    const returnPolicy = meta.policies?.return_policy || meta.policies?.warranty || meta.return_policy || meta.warranty_policy;
    const category = normalizeIndustryCategory(tenant.category || tenant.business_type);

    let policyText = returnPolicy;
    if (!policyText) {
      if (category === 'DIGITAL') {
        policyText = `Lisensi digital berlaku sesuai paket yang dipilih. Dukungan update & konsultasi akses disediakan penuh selama masa aktif akun Anda.`;
      } else if (category === 'FOOD') {
        policyText = `Dapur kami beroperasi setiap hari dengan standar kebersihan & sertifikasi Halal. Garansi ganti baru jika makanan diterima dalam kondisi tidak higienis.`;
      } else if (category === 'FIELD_SERVICE') {
        policyText = `Setiap pengerjaan teknisi dilindungi *Garansi Pengerjaan Resmi*. Jika kendala berulang dalam masa garansi, teknisi datang kembali tanpa biaya tambahan.`;
      } else if (category === 'PROFESSIONAL_SERVICE') {
        policyText = `Kerjasama diikat dengan Service Level Agreement (SLA) transparan dan Non-Disclosure Agreement (NDA) untuk melindungi kerahasiaan data klien.`;
      } else if (category === 'CREATOR_AGENCY') {
        policyText = `Kerjasama endorsement mencakup jaminan penayangan tepat waktu, revisi brief minor, dan laporan performa konten (insight 24 jam setelah tayang).`;
      } else {
        policyText = `Garansi retur/tukar baru 100% jika barang yang Anda terima rusak atau tidak sesuai deskripsi. Cukup sertakan video unboxing saat membuka paket.`;
      }
    }

    const replyText =
      `🛡️ *KEBIJAKAN & GARANSI ${storeName.toUpperCase()}*\n\n` +
      `${policyText}\n\n` +
      `_Ketik *menu* untuk kembali ke pilihan utama._`;

    return sendResult({
      handled: true,
      reply: replyText,
      type: 'TEXT',
      intent_key: 'RETURN_POLICY',
    });
  }

  // ── [INTENT 7]: HUBUNGI CS / HUMAN TAKEOVER / CHAT KASIR / CHAT TEKNISI / CHAT MANAGER / KONSULTAN ──
  if (
    selectedOptionIndex === 7 ||
    cleanMsg.includes('hubungi cs') ||
    cleanMsg.includes('admin') ||
    cleanMsg.includes('chat kasir') ||
    cleanMsg.includes('chat teknisi') ||
    cleanMsg.includes('chat manager') ||
    cleanMsg.includes('konsultan') ||
    cleanMsg.includes('diskusi') ||
    cleanMsg.includes('bantuan')
  ) {
    // 1. Set bot_status = 'HUMAN_TAKEOVER'
    const nowIso = new Date().toISOString();
    const pausedUntilIso = new Date(Date.now() + 2 * 3600 * 1000).toISOString(); // 2 jam

    const updatedMetadata = {
      ...meta,
      bot_status: 'HUMAN_TAKEOVER',
      paused_at: nowIso,
      paused_until: pausedUntilIso,
      last_human_takeover_reason: 'CUSTOMER_MENU_REQUEST',
    };

    // Update database tenant
    await supabase
      .from('tenants')
      .update({ metadata: updatedMetadata })
      .eq('id', tenant.id);

    // 2. Kirim sinyal notifikasi ke panel inbox (tabel messages)
    try {
      await supabase.from('messages').insert({
        tenant_slug: tenant.slug,
        conversation_id: `wa_${senderPhone || 'visitor'}`,
        sender: 'SYSTEM NOTIFICATION',
        channel: 'whatsapp',
        user_phone: senderPhone || null,
        text: `🚨 [HUMAN TAKEOVER] Pelanggan meminta bantuan Customer Service langsung. Bot dijeda selama 2 jam.`,
        payload: {
          event: 'HUMAN_TAKEOVER_TRIGGERED',
          sender_phone: senderPhone,
          timestamp: nowIso,
        },
      });
    } catch (msgErr) {
      console.warn('[ZeroAi] Error inserting takeover notification into messages:', msgErr);
    }

    const category = normalizeIndustryCategory(tenant.category || tenant.business_type);
    const roleLabel =
      category === 'PROFESSIONAL_SERVICE'
        ? 'KONSULTAN'
        : category === 'FIELD_SERVICE'
        ? 'TIM TEKNISI'
        : category === 'CREATOR_AGENCY'
        ? 'MANAJER TALENT'
        : category === 'FOOD'
        ? 'KASIR'
        : 'TIM CUSTOMER CARE';

    const rolePerson =
      category === 'PROFESSIONAL_SERVICE'
        ? 'konsultan'
        : category === 'FIELD_SERVICE'
        ? 'tim teknisi'
        : category === 'CREATOR_AGENCY'
        ? 'manajer talent'
        : 'petugas';

    const replyText =
      `👋 *MENGHUBUNGKAN KE ${roleLabel} ${storeName.toUpperCase()}*\n\n` +
      `Pesan Anda telah diteruskan ke ${rolePerson} kami. Asisten otomatis telah dijeda agar Anda dapat berkomunikasi langsung secara personal.\n\n` +
      `Silakan sampaikan pertanyaan atau kendala Anda di sini, tim kami akan membalas segera.\n\n` +
      `_(Ketik *menu* kapan saja untuk mengaktifkan kembali bot asisten)_`;

    return sendResult({
      handled: true,
      reply: replyText,
      type: 'HUMAN_TAKEOVER',
      intent_key: 'HUMAN_CS',
      metadata_updated: updatedMetadata,
    });
  }

  // ── [FALLBACK / MENU TRIGGER]: Tampilkan Dual-Mode Navigation Menu (WABA List & WAHA Numbers) ──
  const botMode = String(meta.bot_mode || 'HYBRID').toUpperCase();
  const isMenuTrigger = /^(menu|pilihan|bantuan|opsi|help|daftar menu|buka menu|mulai)\b/i.test(cleanMsg);

  // Jika botMode adalah STATIC atau pesan memang eksplisit meminta menu navigasi
  if (botMode === 'STATIC' || isMenuTrigger) {
    const wabaPayload = formatWabaInteractive(activeMenu);
    const wahaText = formatWahaInteractive(activeMenu);

    return sendResult({
      handled: true,
      reply: wahaText,
      type: channelType === 'WABA' ? 'INTERACTIVE' : 'TEXT',
      interactive_payload: channelType === 'WABA' ? wabaPayload : undefined,
    });
  }

  // Jika botMode adalah HYBRID atau AI dan pesan berupa pertanyaan bebas/natural:
  // Serahkan ke Conversational LLM / State Machine / Knowledge Base pipeline (handled: false)
  return sendResult({
    handled: false,
    reply: '',
    type: 'TEXT',
  });
}
