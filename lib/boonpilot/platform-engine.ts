/**
 * lib/boonpilot/platform-engine.ts
 * BoonPilot Dual-Branch Engine for Official Platform Gateway (081215567168)
 *
 * Implements:
 * 1. GUEST Branch: Onboarding Specialist, feature education, zero-leakage, registration CTA.
 * 2. MERCHANT Branch: Business Co-Pilot for Store {tenant.name}, dashboard guidance, NO registration prompt.
 *
 * References:
 * - ADR-0026: Platform WABA Omni-Assistant, Inbound Showroom, and Multi-Provider Boundary
 * - Zero Hardcoding & Supabase Single Source of Truth
 */

import {
  BoonPilotSenderResolution,
  BoonPilotSenderTenant,
  resolveBoonPilotSender,
} from './sender-resolver';

export interface BoonPilotPlatformChatInput {
  senderPhone: string;
  message: string;
  sessionId?: string;
  image_base64?: string;
  mime_type?: string;
  interactive_reply?: {
    id?: string;
    title?: string;
    type?: string;
  };
  channel_type?: 'WABA' | 'WAHA';
}

export interface BoonPilotPlatformChatResult {
  reply: string;
  role: 'GUEST' | 'MERCHANT';
  activeEngine: 'BOONPILOT_GUEST_ONBOARDING' | 'BOONPILOT_MERCHANT_COPILOT';
  tenant?: BoonPilotSenderTenant;
  quick_actions?: string[];
  interactive_payload?: any;
}

/**
 * Builds the customized LLM System Prompt for Gemini based on sender registration resolution.
 */
export function buildBoonPilotSystemPrompt(resolution: BoonPilotSenderResolution): string {
  if (resolution.role === 'MERCHANT' && resolution.tenant) {
    const t = resolution.tenant;
    const ownerName = t.owner_name || 'Owner';
    const storeName = t.name || 'Toko Anda';
    const tier = t.tier || 'SOLO';

    return `Anda adalah "BoonPilot", Business Co-Pilot resmi untuk toko "${storeName}" (Tier: ${tier}, Pemilik: Kak ${ownerName}).
Gaya Komunikasi: Rekan bisnis yang cerdas, suportif, solutif, santun, dan profesional dalam Bahasa Indonesia.

TUGAS UTAMA:
1. Bertindak sebagai Co-Pilot bisnis terpercaya untuk pemilik toko "${storeName}".
2. Memandu navigasi 8 tab dashboard BoonTrack (Overview, Katalog Produk, Pesanan, WhatsApp Gateway, Pengiriman, Pembayaran/QRIS, Tim CS, Pengaturan Toko).
3. Membantu analisis performa, screenshot analitik iklan / metrik dashboard secara objektif jika dikirimkan oleh merchant.
4. Membantu pemecahan masalah operasional toko (checkout, ongkir, QRIS, notifikasi WhatsApp).

ATURAN MUTLAK (STRICT RULES):
- DILARANG KERAS menawarkan pendaftaran akun baru atau memberikan link registrasi akun (seperti /register) karena merchant ini SUDAH terdaftar dan aktif memiliki toko "${storeName}".
- Sapa merchant secara ramah dengan menyebut Kak ${ownerName} dan nama tokonya "${storeName}".
- ISOLASI DATA (ZERO LEAKAGE): Anda hanya berwenang mendiskusikan toko "${storeName}". Dilarang membocorkan data toko privat tenant lain.`;
  }

  // GUEST / PROSPECT BRANCH
  return `Anda adalah "BoonPilot", Asisten AI Onboarding & Platform Specialist resmi dari BoonTrack (https://boontrack.com).
Gaya Komunikasi: Ramah, antusias, solutif, edukatif, dan profesional dalam Bahasa Indonesia.

TUGAS UTAMA:
1. Mengedukasi calon pengguna/merchant tentang keunggulan platform BoonTrack:
   - Single-Page Checkout instan tanpa pembeli perlu install aplikasi atau registrasi.
   - Pembayaran otomatis QRIS dinamis & transfer bank verifikasi seketika.
   - WhatsApp Commerce & CRM otomatis (notifikasi pesanan ke WhatsApp pembeli & seller).
   - Agregator Kurir multi-ekspedisi BYOK (Lincah, Biteship, JNE, SiCepat, J&T).
2. Membantu calon merchant memahami paket yang sesuai dengan skala bisnis mereka (Paket Solo, Pro Scale / Ads Performance, Team Scale).
3. Mengarahkan calon pengguna untuk mendaftarkan toko melalui tautan resmi: https://dashboard.boontrack.com/register.
4. Menganalisis gambar publik: Jika pengguna mengirimkan screenshot website atau materi onboarding, jelaskan fiturnya dengan ramah.

ATURAN MUTLAK KEAMANAN (STRICT SECURITY & ZERO-DATA-LEAKAGE):
- DILARANG KERAS membocorkan data, transaksi, katalog, omset, atau nama pembeli dari toko privat tenant lain.
- Jangan pernah mengarang data transaksi milik toko tertentu.
- Selalu berikan link registrasi resmi: https://dashboard.boontrack.com/register untuk pendaftaran toko baru.`;
}

/**
 * Deterministic message processing for BoonPilot Platform Gateway
 */
export async function processBoonPilotPlatformChat(
  input: BoonPilotPlatformChatInput,
  clientOverride?: any
): Promise<BoonPilotPlatformChatResult> {
  const { senderPhone, message } = input;
  const resolution = await resolveBoonPilotSender(senderPhone, clientOverride);
  const cleanMsg = (message || '').trim().toLowerCase();

  // =========================================================================
  // BRANCH A: REGISTERED MERCHANT (BUSINESS CO-PILOT)
  // =========================================================================
  if (resolution.isRegistered && resolution.role === 'MERCHANT' && resolution.tenant) {
    const tenant = resolution.tenant;
    const storeName = tenant.name || 'Toko Anda';
    const ownerName = tenant.owner_name || 'Owner';
    const tier = tenant.tier || 'SOLO';

    const merchantQuickActions = [
      '📊 Cek Ringkasan Toko',
      '🛍️ Kelola Produk',
      '🚚 Setup Pengiriman',
      '💳 Atur Rekening/QRIS',
    ];

    // 1. Pesanan / Order Inquiry
    if (/(order|pesanan|resi|status bayar|cek order|transaksi|lacak)/i.test(cleanMsg)) {
      const reply = `Halo Kak ${ownerName}! Untuk mengecek dan memproses pesanan masuk di *${storeName}*:\n\n` +
        `1. Buka tab *Pesanan (Orders)* di dashboard merchant Anda.\n` +
        `2. Di sana Kakak bisa melihat transaksi lunas (*PAID*), mengonfirmasi pembayaran manual, dan menginput nomor resi pengiriman.\n` +
        `3. Notifikasi resi akan otomatis terkirim ke WhatsApp pembeli setelah resi disimpan! 📦\n\n` +
        `Ada transaksi atau resi spesifik yang ingin dibantu cek Kak?`;
      return {
        reply,
        role: 'MERCHANT',
        activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
        tenant,
        quick_actions: merchantQuickActions,
      };
    }

    // 2. Katalog & Produk Inquiry
    if (/(produk|katalog|upload|tambah produk|stok|harga produk|checkout form)/i.test(cleanMsg)) {
      const reply = `Halo Kak ${ownerName}! Untuk mengelola katalog & link checkout produk *${storeName}*:\n\n` +
        `1. Buka tab *Katalog Produk* di dashboard merchant.\n` +
        `2. Kakak bisa menambah produk baru (fisik / digital), mengatur harga promo, dan mengaktifkan form single-page checkout.\n` +
        `3. Link checkout resmi produk siap dibagikan ke bio Instagram, TikTok, atau chat WhatsApp pembeli. ✨\n\n` +
        `Butuh bantuan cara optimasi copywriting atau deskripsi produk Kak?`;
      return {
        reply,
        role: 'MERCHANT',
        activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
        tenant,
        quick_actions: merchantQuickActions,
      };
    }

    // 3. Pengiriman / Ongkir Inquiry
    if (/(ongkir|pengiriman|kurir|asal kirim|biteship|lincah|byok|ekspedisi)/i.test(cleanMsg)) {
      const reply = `Halo Kak ${ownerName}! Untuk konfigurasi pengiriman & kurir di toko *${storeName}*:\n\n` +
        `1. Masuk ke tab *Pengiriman (Shipping)* di dashboard.\n` +
        `2. Pastikan *Lokasi Asal Pengiriman (Kecamatan/Kota)* sudah terisi agar kalkulasi ongkir pembeli akurat.\n` +
        `3. Anda dapat mengaktifkan integrasi kurir BYOK (Lincah / Biteship) untuk otomatisasi resi dan pickup paket oleh kurir. 🚚`;
      return {
        reply,
        role: 'MERCHANT',
        activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
        tenant,
        quick_actions: merchantQuickActions,
      };
    }

    // 4. Pembayaran / QRIS / Rekening Bank Inquiry
    if (/(qris|rekening|bank|transfer|metode bayar|settlement)/i.test(cleanMsg)) {
      const reply = `Halo Kak ${ownerName}! Untuk pengaturan metode pembayaran toko *${storeName}*:\n\n` +
        `1. Buka tab *Pembayaran / QRIS* di dashboard.\n` +
        `2. Kakak dapat mengunggah barcode *QRIS Toko* atau mengisi nomor *Rekening Bank Manual* (BCA, Mandiri, BRI, BSI, dll).\n` +
        `3. Begitu disimpan, pembeli bisa langsung memilih QRIS atau Transfer Bank saat melakukan checkout di toko Kakak. 💳`;
      return {
        reply,
        role: 'MERCHANT',
        activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
        tenant,
        quick_actions: merchantQuickActions,
      };
    }

    // 5. Dashboard / Navigasi Umum
    if (/(dashboard|tab|halaman|fitur|bantuan)/i.test(cleanMsg)) {
      const reply = `Halo Kak ${ownerName}! Berikut panduan navigasi cepat 8 Tab Dashboard untuk toko *${storeName}* (Paket: *${tier}*):\n\n` +
        `📊 *1. Overview*: Grafik omset & performa toko.\n` +
        `🛍️ *2. Katalog Produk*: Upload produk & kelola checkout form.\n` +
        `📦 *3. Pesanan*: Pantau transaksi masuk & input resi.\n` +
        `📲 *4. WhatsApp*: Status koneksi WA Gateway & pesan sapaan.\n` +
        `🚚 *5. Pengiriman*: Setting asal kirim & tarif ekspedisi.\n` +
        `💳 *6. Pembayaran*: Setup QRIS & rekening bank manual.\n` +
        `👥 *7. Tim & CS*: Manajemen rotator CS & akses staf.\n` +
        `⚙️ *8. Pengaturan*: Profil toko, custom domain & pixel.\n\n` +
        `Ada bagian tab yang ingin Kakak tanyakan lebih detail? 😊`;
      return {
        reply,
        role: 'MERCHANT',
        activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
        tenant,
        quick_actions: merchantQuickActions,
      };
    }

    // 6. Default Merchant Greeting & Co-Pilot Sapaan
    const defaultMerchantReply =
      `Halo Kak ${ownerName}! Senang bertemu kembali ✨\n\n` +
      `Ada yang bisa BoonPilot bantu untuk operasional toko *${storeName}* (Paket: *${tier}*) hari ini? 🚀\n\n` +
      `BoonPilot siap membantu asistensi:\n` +
      `• Ringkasan pesanan & transaksi\n` +
      `• Panduan katalog & link checkout\n` +
      `• Setup ekspedisi & ongkir otomatis\n` +
      `• Konfigurasi QRIS & rekening bank\n\n` +
      `Silakan ketik pertanyaan atau kendala operasional toko Kakak ya!`;

    return {
      reply: defaultMerchantReply,
      role: 'MERCHANT',
      activeEngine: 'BOONPILOT_MERCHANT_COPILOT',
      tenant,
      quick_actions: merchantQuickActions,
    };
  }

  // =========================================================================
  // BRANCH B: GUEST / PROSPECT (ONBOARDING SPECIALIST)
  // =========================================================================
  const guestQuickActions = [
    '💡 Apa itu BoonTrack?',
    '📦 Fitur & Paket',
    '🚀 Cara Daftar Toko',
    '🚚 Info Kurir & Ongkir',
  ];

  // 1. Pendaftaran / Registrasi Toko Baru
  if (/(daftar|register|buka toko|buat toko|gabung|registrasi|cara daftar|buat akun)/i.test(cleanMsg)) {
    const reply = `Halo! Saya *BoonPilot*. Untuk mendaftarkan toko baru di *BoonTrack*, silakan buka tautan resmi kami:\n\n` +
      `👉 *Link Registrasi Toko:*\nhttps://dashboard.boontrack.com/register\n\n` +
      `*Langkah Pendaftaran:*\n` +
      `1. Masukkan nama lengkap, nomor WhatsApp, dan tentukan nama/slug toko Anda.\n` +
      `2. Selesaikan aktivasi instan melalui kode WhatsApp.\n` +
      `3. Toko Anda langsung aktif dengan akses uji coba fitur lengkap & WhatsApp auto-reply siap pakai! ✨\n\n` +
      `Ada yang ingin ditanyakan seputar fiturnya sebelum mendaftar?`;
    return {
      reply,
      role: 'GUEST',
      activeEngine: 'BOONPILOT_GUEST_ONBOARDING',
      quick_actions: guestQuickActions,
    };
  }

  // 2. Paket & Biaya Langganan
  if (/(paket|harga|biaya|tarif|langganan|subscription|solo|pro scale|ads performance|team scale)/i.test(cleanMsg)) {
    const reply = `Halo! Saya *BoonPilot*. Berikut adalah pilihan paket resmi di *BoonTrack*:\n\n` +
      `1️⃣ *Paket Solo*\n` +
      `   Cocok untuk pebisnis mandiri & pemula. Dilengkapi single-page checkout, QRIS otomatis, dan auto-inbox WhatsApp.\n\n` +
      `2️⃣ *Paket Pro Scale (Ads Performance)*\n` +
      `   Paling diminati untuk pengiklan Meta / TikTok Ads. Dilengkapi Conversion API (CAPI), custom domain toko, BYOK ongkir, dan Multi-CS rotator.\n\n` +
      `3️⃣ *Paket Team Scale / Enterprise*\n` +
      `   Untuk bisnis dengan volume transaksi tinggi & tim CS besar dengan prioritas koneksi WABA resmi.\n\n` +
      `👉 *Daftar & Coba Sekarang:*\nhttps://dashboard.boontrack.com/register`;
    return {
      reply,
      role: 'GUEST',
      activeEngine: 'BOONPILOT_GUEST_ONBOARDING',
      quick_actions: guestQuickActions,
    };
  }

  // 3. Fitur Unggulan / Penjelasan Platform
  if (/(fitur|keunggulan|apa itu|cara kerja|kelebihan|checkout|qris|wa|whatsapp|otomatis|solusi)/i.test(cleanMsg)) {
    const reply = `Halo! Saya *BoonPilot*. Berikut *Keunggulan Utama Ekosistem BoonTrack:* 🚀\n\n` +
      `⚡ *Single-Page Checkout*: Form checkout instan yang ringan & cepat, pembeli tidak perlu download aplikasi atau ribet login.\n` +
      `💳 *QRIS Dinamis & Bank Otomatis*: Verifikasi pembayaran real-time 24 jam dengan integrasi QRIS dan transfer bank manual.\n` +
      `📲 *WhatsApp Commerce*: Notifikasi faktur dan update resi otomatis terkirim ke WhatsApp pembeli dan notifikasi penjualan ke seller.\n` +
      `🚚 *Agregator Kurir BYOK*: Cek ongkir otomatis multi-ekspedisi (JNE, SiCepat, J&T, Lion, POS) hingga kurir instan.\n\n` +
      `👉 *Daftar Toko Gratis*: https://dashboard.boontrack.com/register`;
    return {
      reply,
      role: 'GUEST',
      activeEngine: 'BOONPILOT_GUEST_ONBOARDING',
      quick_actions: guestQuickActions,
    };
  }

  // 4. Pengiriman & Cek Ongkir
  if (/(ongkir|kurir|ekspedisi|pengiriman|jne|jnt|sicepat|pos|lion)/i.test(cleanMsg)) {
    const reply = `Halo! Saya *BoonPilot*. Berikut *Layanan Pengiriman Terintegrasi BoonTrack:* 🚚\n\n` +
      `BoonTrack mendukung perhitungan ongkir real-time ke seluruh kecamatan di Indonesia melalui ekspedisi reguler (JNE, SiCepat, J&T, Lion Parcel, POS) serta kurir instan/sameday (Grab/Gojek).\n\n` +
      `Anda dapat menggunakan fitur BYOK (Bring Your Own Key) untuk menghubungkan akun ekspedisi Lincah atau Biteship langsung ke dashboard toko Anda.\n\n` +
      `👉 *Daftar Toko Anda Sekarang:* https://dashboard.boontrack.com/register`;
    return {
      reply,
      role: 'GUEST',
      activeEngine: 'BOONPILOT_GUEST_ONBOARDING',
      quick_actions: guestQuickActions,
    };
  }

  // 5. Default Guest Greeting & Onboarding Sapaan
  const defaultGuestReply =
    `Halo! Saya *BoonPilot*, Asisten AI & Onboarding Specialist resmi dari *BoonTrack* 🚀\n\n` +
    `BoonTrack adalah platform penjualan & checkout otomatis via WhatsApp untuk toko online, produk digital, dan jasa di Indonesia.\n\n` +
    `Ada yang bisa kami bantu hari ini?\n` +
    `1️⃣ *Apa itu BoonTrack?* (Checkout tanpa login, QRIS otomatis, auto WhatsApp)\n` +
    `2️⃣ *Pilihan Paket Langganan* (Paket Solo, Pro Scale, Team Scale)\n` +
    `3️⃣ *Simulasi Ongkir & Ekspedisi* (JNE, SiCepat, J&T, BYOK Lincah/Biteship)\n` +
    `4️⃣ *Cara Mendaftar Toko Baru*\n\n` +
    `👉 *Daftar Toko Gratis*: https://dashboard.boontrack.com/register`;

  return {
    reply: defaultGuestReply,
    role: 'GUEST',
    activeEngine: 'BOONPILOT_GUEST_ONBOARDING',
    quick_actions: guestQuickActions,
  };
}
