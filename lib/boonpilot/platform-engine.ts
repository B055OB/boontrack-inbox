/**
 * lib/boonpilot/platform-engine.ts
 * BoonPilot Dual-Branch Engine for Official Platform Gateway (081215567168 & Telegram @boontrack_bot)
 *
 * Implements:
 * 1. GUEST Branch: Onboarding Specialist, feature education, zero-leakage, trial registration CTA.
 * 2. MERCHANT Branch: Business Co-Pilot for Store {tenant.name}, dashboard guidance, order checking.
 * 3. Escalation & Upsell:
 *    - DFY (Done-For-You) / Terima Beres: https://shop.boontrack.com/boon or IT Support https://wa.me/6281977655099
 *    - Tim & Kuota Tinggi: Upgrade Pro / Scale
 *    - Keberatan Biaya: Checkout Lite (Rp 59.000/bln)
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
  channel_type?: 'WABA' | 'WAHA' | 'TELEGRAM';
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

    return `Anda adalah "BoonPilot", AI Assistant & Business Co-Pilot resmi untuk toko "${storeName}" (Tier: ${tier}, Pemilik: Kak ${ownerName}) di platform BoonTrack.
Gaya Komunikasi: Rekan bisnis yang cerdas, suportif, solutif, santun, dan profesional dalam Bahasa Indonesia.

PERAN & TUGAS UTAMA (MERCHANT):
1. Bantuan operasional toko, cek status order, dan panduan fitur 8 tab dashboard BoonTrack (Overview, Katalog Produk, Pesanan, WhatsApp Gateway, Pengiriman, Pembayaran/QRIS, Tim CS, Pengaturan Toko).
2. Membantu analisis performa, screenshot analitik iklan / metrik dashboard secara objektif jika dikirimkan oleh merchant.
3. Membantu pemecahan masalah operasional toko (checkout, ongkir, QRIS, notifikasi WhatsApp).

PANDUAN ESKALASI & UPSELL:
- Kesulitan setup / minta terima beres: Tawarkan paket DFY (Done-For-You / Setup Toko Terima Beres) di https://shop.boontrack.com/boon atau arahkan untuk menghubungi IT Support resmi di https://wa.me/6281977655099.
- Butuh fitur tim & kuota tinggi: Jika merchant membutuhkan multi-seat CS, broadcast WABA resmi, atau volume pesanan tinggi, rekomendasikan upgrade ke paket Pro Scale atau Team Scale.
- Keberatan biaya langganan: Jika merchant merasa biaya langganan saat ini berat atau ingin paket paling terjangkau, arahkan ke paket Checkout Lite (Rp 59.000/bln).

ATURAN MUTLAK (STRICT RULES):
- DILARANG KERAS menawarkan pendaftaran akun baru atau memberikan link registrasi akun (seperti /register) karena merchant ini SUDAH terdaftar dan aktif memiliki toko "${storeName}".
- Sapa merchant secara ramah dengan menyebut Kak ${ownerName} dan nama tokonya "${storeName}".
- ISOLASI DATA (ZERO LEAKAGE): Anda hanya berwenang mendiskusikan toko "${storeName}". Dilarang membocorkan data toko privat tenant lain.`;
  }

  // GUEST / PROSPECT BRANCH (NON-MERCHANT)
  return `Anda adalah "BoonPilot", AI Assistant, Onboarding & Platform Specialist resmi dari BoonTrack (https://boontrack.com).
Gaya Komunikasi: Ramah, antusias, solutif, edukatif, dan profesional dalam Bahasa Indonesia.

PERAN & TUGAS UTAMA (NON-MERCHANT):
1. Mengedukasi calon pengguna tentang keunggulan dan otomasi platform BoonTrack:
   - Otomasi order & notifikasi WhatsApp (pesanan, invoice, konfirmasi, resi otomatis).
   - Verifikasi pembayaran otomatis real-time (QRIS dinamis 0% MDR & transfer bank manual).
   - Single-Page Checkout instan tanpa pembeli perlu install aplikasi atau registrasi akun.
   - Agregator Kurir multi-ekspedisi BYOK (Lincah, Biteship, JNE, SiCepat, J&T).
2. Memandu calon pengguna untuk mendaftar uji coba gratis ke https://dashboard.boontrack.com (atau https://dashboard.boontrack.com/register).
3. Menganalisis gambar publik: Jika pengguna mengirimkan screenshot website atau materi onboarding, jelaskan fiturnya dengan ramah.

PANDUAN ESKALASI & UPSELL:
- Kesulitan setup / minta terima beres: Tawarkan paket DFY (Done-For-You) di https://shop.boontrack.com/boon atau hubungi IT Support resmi: https://wa.me/6281977655099.
- Butuh fitur tim & kuota tinggi: Rekomendasikan upgrade paket Pro / Scale untuk kebutuhan CS multi-seat dan server-side Meta CAPI.
- Keberatan biaya langganan: Arahkan ke paket Checkout Lite (Rp 59.000/bln) sebagai solusi super hemat untuk langsung jualan mandiri.

ATURAN MUTLAK KEAMANAN (STRICT SECURITY & ZERO-DATA-LEAKAGE):
- DILARANG KERAS membocorkan data, transaksi, katalog, omset, atau nama pembeli dari toko privat tenant lain.
- Jangan pernah mengarang data transaksi milik toko tertentu.
- Selalu berikan panduan daftar uji coba resmi: https://dashboard.boontrack.com/register (atau https://dashboard.boontrack.com).`;
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

  const guestQuickActions = [
    '💡 Apa itu BoonTrack?',
    '📦 Fitur & Paket',
    '🚀 Cara Daftar Toko',
    '🚚 Info Kurir & Ongkir',
  ];

  const merchantQuickActions = [
    '📊 Cek Ringkasan Toko',
    '🛍️ Kelola Produk',
    '🚚 Setup Pengiriman',
    '💳 Atur Rekening/QRIS',
  ];

  // =========================================================================
  // SHARED ESKALASI & UPSELL INTENT HANDLERS
  // =========================================================================

  // 1. Kesulitan setup / minta terima beres (DFY)
  if (/(dfy|terima beres|bantu setup|setupkan|bikinkan|jasa buat|it support|hubungi it|tim it|cs it)/i.test(cleanMsg)) {
    const reply =
      `Halo! Jika Anda butuh bantuan setup atau ingin terima beres tanpa pusing teknis, BoonTrack menyediakan layanan resmi:\n\n` +
      `🚀 *Paket DFY (Done-For-You / Setup Toko Terima Beres):*\n` +
      `👉 https://shop.boontrack.com/boon\n\n` +
      `Tim IT kami akan bantu konfigurasi katalog produk, form checkout, integrasi QRIS, dan bot WhatsApp toko Anda sampai live & siap pakai.\n\n` +
      `📞 *Kontak WhatsApp IT Support Resmi:*\n` +
      `👉 https://wa.me/6281977655099\n\n` +
      `Silakan hubungi kontak di atas untuk konsultasi langsung ya! 😊`;

    return {
      reply,
      role: resolution.role,
      activeEngine: resolution.role === 'MERCHANT' ? 'BOONPILOT_MERCHANT_COPILOT' : 'BOONPILOT_GUEST_ONBOARDING',
      tenant: resolution.tenant,
      quick_actions: ['🚀 Cek Paket DFY', '📞 Kontak IT Support'],
    };
  }

  // 2. Keberatan biaya langganan / cari yang murah -> Paket Checkout Lite (Rp 59.000/bln)
  if (/(checkout lite|lite|kemahalan|mahal|biaya tinggi|anggaran hemat|budget pas|59|59000|59\.000|paling murah|paket hemat)/i.test(cleanMsg)) {
    const reply =
      `Halo! Jika Anda menginginkan solusi yang sangat hemat biaya namun langsung siap jualan:\n\n` +
      `💡 *Paket Checkout Lite (Hanya Rp 59.000 / bulan)*\n` +
      `• Single-Page Checkout instan siap pakai\n` +
      `• QRIS Dinamis otomatis 0% MDR (bebas potongan pihak ketiga)\n` +
      `• Notifikasi order ringkas via WhatsApp\n` +
      `• Dukungan produk fisik & digital\n\n` +
      `Sangat pas untuk pemula yang ingin langsung mulai transaksi tanpa beban biaya besar!\n\n` +
      `👉 *Daftar Uji Coba Sekarang:* https://dashboard.boontrack.com (atau https://dashboard.boontrack.com/register)`;

    return {
      reply,
      role: resolution.role,
      activeEngine: resolution.role === 'MERCHANT' ? 'BOONPILOT_MERCHANT_COPILOT' : 'BOONPILOT_GUEST_ONBOARDING',
      tenant: resolution.tenant,
      quick_actions: ['💡 Info Checkout Lite', '🚀 Daftar Uji Coba'],
    };
  }

  // 3. Butuh fitur tim & kuota tinggi -> Upgrade Pro / Scale
  if (/(upgrade|pro scale|team scale|multi seat|multi-seat|cs banyak|tim cs|kuota tinggi|skala besar|volume tinggi)/i.test(cleanMsg)) {
    const reply =
      `Halo! Untuk operasional dengan tim CS dan volume transaksi tinggi, kami sarankan paket lanjutan:\n\n` +
      `🚀 *Paket Pro Scale (Ads Performance)*:\n` +
      `• Meta & TikTok Server-Side CAPI (optimasi pixel iklan)\n` +
      `• 2 Seats CS Inbox & Multi-Rotator\n` +
      `• Custom Domain toko sendiri + SSL\n\n` +
      `🏢 *Paket Team Scale (Enterprise)*:\n` +
      `• Multi-Seat CS Inbox tanpa batas\n` +
      `• Koneksi Official WhatsApp Cloud API (WABA) & broadcast promo\n` +
      `• Prioritas server & kuota pesan tak terbatas\n\n` +
      `👉 *Pelajari & Upgrade di Dashboard:* https://dashboard.boontrack.com`;

    return {
      reply,
      role: resolution.role,
      activeEngine: resolution.role === 'MERCHANT' ? 'BOONPILOT_MERCHANT_COPILOT' : 'BOONPILOT_GUEST_ONBOARDING',
      tenant: resolution.tenant,
      quick_actions: ['🚀 Cek Paket Pro Scale', '🏢 Cek Team Scale'],
    };
  }

  // =========================================================================
  // BRANCH A: REGISTERED MERCHANT (BUSINESS CO-PILOT)
  // =========================================================================
  if (resolution.isRegistered && resolution.role === 'MERCHANT' && resolution.tenant) {
    const tenant = resolution.tenant;
    const storeName = tenant.name || 'Toko Anda';
    const ownerName = tenant.owner_name || 'Owner';
    const tier = tenant.tier || 'SOLO';

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
  // BRANCH B: GUEST / PROSPECT (NON-MERCHANT ONBOARDING SPECIALIST)
  // =========================================================================

  // 1. Pendaftaran / Registrasi Toko Baru
  if (/(daftar|register|buka toko|buat toko|gabung|registrasi|cara daftar|buat akun|uji coba)/i.test(cleanMsg)) {
    const reply =
      `Halo! Saya *BoonPilot*, Asisten AI resmi BoonTrack.\n\n` +
      `Untuk memulai uji coba gratis dan mendaftarkan toko baru di *BoonTrack*, silakan buka tautan resmi kami:\n\n` +
      `👉 *Link Registrasi Toko:*\nhttps://dashboard.boontrack.com/register (atau https://dashboard.boontrack.com)\n\n` +
      `*Langkah Pendaftaran:*\n` +
      `1. Masukkan nama lengkap, nomor WhatsApp, dan tentukan nama toko Anda.\n` +
      `2. Selesaikan aktivasi instan melalui kode WhatsApp.\n` +
      `3. Toko Anda langsung aktif dengan akses checkout siap pakai, verifikasi pembayaran otomatis (QRIS dinamis), dan notifikasi pesanan WhatsApp! ✨\n\n` +
      `Ada yang ingin ditanyakan seputar fiturnya sebelum mulai mendaftar uji coba?`;
    return {
      reply,
      role: 'GUEST',
      activeEngine: 'BOONPILOT_GUEST_ONBOARDING',
      quick_actions: guestQuickActions,
    };
  }

  // 2. Paket & Biaya Langganan
  if (/(paket|harga|biaya|tarif|langganan|subscription|solo|pro scale|ads performance|team scale)/i.test(cleanMsg)) {
    const reply =
      `Halo! Saya *BoonPilot*. Berikut adalah pilihan paket resmi di *BoonTrack*:\n\n` +
      `💡 *0. Paket Checkout Lite (Rp 59.000 / bln)*\n` +
      `   Paket paling hemat untuk pemula. Single-page checkout, QRIS dinamis 0% MDR, dan notifikasi order WA.\n\n` +
      `1️⃣ *Paket Solo (Starter - Rp 199.000 / bln)*\n` +
      `   Katalog tanpa batas, cek ongkir multi-ekspedisi, dan bot auto-reply dasar.\n\n` +
      `2️⃣ *Paket Pro Scale (Ads Performance - Rp 299.000 / bln)*\n` +
      `   Paling diminati untuk pengiklan Meta & TikTok CAPI server-side, custom domain, dan 2 Seats CS Inbox.\n\n` +
      `3️⃣ *Paket Team Scale (Enterprise - Rp 499.000 / bln)*\n` +
      `   CS Inbox tanpa batas, integrasi WhatsApp Cloud API (WABA) resmi, dan broadcast promo.\n\n` +
      `👉 *Daftar & Coba Sekarang:* https://dashboard.boontrack.com/register (atau https://dashboard.boontrack.com)`;
    return {
      reply,
      role: 'GUEST',
      activeEngine: 'BOONPILOT_GUEST_ONBOARDING',
      quick_actions: guestQuickActions,
    };
  }

  // 3. Fitur Unggulan / Penjelasan Platform
  if (/(fitur|keunggulan|apa itu|cara kerja|kelebihan|checkout|qris|wa|whatsapp|otomatis|solusi)/i.test(cleanMsg)) {
    const reply =
      `Halo! Saya *BoonPilot*. Berikut *Keunggulan Utama Ekosistem BoonTrack:* 🚀\n\n` +
      `⚡ *Single-Page Checkout*: Form checkout instan yang ringan & cepat, pembeli tidak perlu download aplikasi atau ribet login.\n` +
      `💳 *QRIS Dinamis & Bank Otomatis*: Verifikasi pembayaran real-time 24 jam dengan integrasi QRIS dan transfer bank manual.\n` +
      `📲 *WhatsApp Commerce*: Notifikasi faktur dan update resi otomatis terkirim ke WhatsApp pembeli dan notifikasi penjualan ke seller.\n` +
      `🚚 *Agregator Kurir BYOK*: Cek ongkir otomatis multi-ekspedisi (JNE, SiCepat, J&T, Lion, POS) hingga kurir instan.\n\n` +
      `👉 *Daftar Toko Gratis*: https://dashboard.boontrack.com/register (https://dashboard.boontrack.com)`;
    return {
      reply,
      role: 'GUEST',
      activeEngine: 'BOONPILOT_GUEST_ONBOARDING',
      quick_actions: guestQuickActions,
    };
  }

  // 4. Pengiriman & Cek Ongkir
  if (/(ongkir|kurir|ekspedisi|pengiriman|jne|jnt|sicepat|pos|lion)/i.test(cleanMsg)) {
    const reply =
      `Halo! Saya *BoonPilot*. Berikut *Layanan Pengiriman Terintegrasi BoonTrack:* 🚚\n\n` +
      `BoonTrack mendukung perhitungan ongkir real-time ke seluruh kecamatan di Indonesia melalui ekspedisi reguler (JNE, SiCepat, J&T, Lion Parcel, POS) serta kurir instan/sameday (Grab/Gojek).\n\n` +
      `Anda dapat menggunakan fitur BYOK (Bring Your Own Key) untuk menghubungkan akun ekspedisi Lincah atau Biteship langsung ke dashboard toko Anda.\n\n` +
      `👉 *Daftar Toko Anda Sekarang:* https://dashboard.boontrack.com/register (https://dashboard.boontrack.com)`;
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
    `Ada yang bisa BoonPilot bantu hari ini?\n` +
    `1️⃣ *Apa itu BoonTrack?* (Otomasi order WA, verifikasi pembayaran QRIS otomatis)\n` +
    `2️⃣ *Pilihan Paket Langganan* (Checkout Lite, Solo, Pro Scale, Team Scale)\n` +
    `3️⃣ *Setup Toko Terima Beres (DFY)* (Toko siap pakai tanpa pusing setup teknis)\n` +
    `4️⃣ *Cara Mendaftar Toko Baru (Panduan Uji Coba)*\n\n` +
    `👉 *Daftar Toko Gratis*: https://dashboard.boontrack.com/register (https://dashboard.boontrack.com)`;

  return {
    reply: defaultGuestReply,
    role: 'GUEST',
    activeEngine: 'BOONPILOT_GUEST_ONBOARDING',
    quick_actions: guestQuickActions,
  };
}
