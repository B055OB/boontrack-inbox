/**
 * ======================================================================================
 * ARCHITECTURAL BOUNDARY: PLATFORM KNOWLEDGE PROVIDER (IMMUTABLE / READ-ONLY)
 * ======================================================================================
 * PERINGATAN ARSITEKTUR:
 * File ini dikunci mutlak sebagai PlatformKnowledgeProvider. File ini HANYA berisi
 * panduan onboarding, SOP, dan edukasi penggunaan ekosistem platform BoonTrack
 * (misal: cara download QR meja, 5 checklist siap jual, filosofi No-FAQ, dsb).
 * 
 * ATURAN ISOLASI TENANT (ZERO HARDCODING):
 * 1. DILARANG KERAS menyimpan konfigurasi, persona, FAQ, atau data bisnis milik tenant/toko individual.
 * 2. Konfigurasi tenant sepenuhnya dinamis dan bersumber langsung dari Supabase (`tenants` table)
 *    serta dipropose melalui schema `BusinessConfigurationProposal` (lihat types/boonpilot.ts).
 * 3. Tidak boleh ada hardcoded state, slug toko, katalog produk, atau aturan harga toko di file ini.
 * ======================================================================================
 */

export type KnowledgeCategory = 'SOP_ONBOARDING' | 'ONBOARDING_GUIDE' | 'GENERAL' | 'COMMERCE' | 'AI_TRAINING';

export interface KnowledgeItem {
  id: string;
  category?: KnowledgeCategory;
  keywords: string[];
  title: string;
  text: string;
  quick_actions: string[];
}

export const PLATFORM_KNOWLEDGE_BASE: KnowledgeItem[] = [
  {
    id: 'ganti_greeting_wa',
    category: 'ONBOARDING_GUIDE',
    keywords: [
      'ganti teks greeting',
      'ubah sapaan',
      'greeting',
      'pesan pembuka',
      'custom greeting',
      'sapaan wa',
      'teks sapaan',
      'ubah greeting',
      'ganti greeting',
      'cara ganti teks greeting',
      'cara ubah sapaan',
      'edit greeting',
      'atur sapaan',
    ],
    title: '💬 Cara Mengubah Pesan Sapaan Otomatis WhatsApp',
    text: `💬 **Panduan Mengubah Pesan Sapaan Otomatis WhatsApp:**\n\n1. **Buka Tab WhatsApp:** Klik menu/tab **WhatsApp** pada navigasi dashboard merchant Anda.\n2. **Pesan Sapaan Otomatis:** Gulir ke bagian **Pesan Sapaan Otomatis (Greeting Message)**.\n3. **Tuliskan Sapaan Toko:** Ketik teks sambutan yang ramah untuk calon pembeli. Anda dapat menyisipkan \`[nama_toko]\` agar nama toko muncul dinamis.\n4. **Simpan:** Klik tombol **Simpan Pesan Sapaan**. Bot WhatsApp toko Anda akan langsung menggunakan sapaan baru ini saat calon pembeli pertama kali mengirim chat! 🚀\n\n*(Catatan: Anda juga bisa mengaturnya melalui tab **Pengaturan** > sub-menu **WhatsApp**).*`,
    quick_actions: [
      'Buka Tab WhatsApp',
      'SOP 3 Langkah Aktivasi Toko',
      '5 Checklist Wajib Siap Jual',
    ],
  },
  {
    id: 'sop_onboarding',
    category: 'SOP_ONBOARDING',
    keywords: [
      'sop aktivasi',
      'cara aktivasi',
      'onboarding',
      'langkah aktivasi',
      'whatsapp commerce',
      'sop',
      'panduan toko',
      '3 langkah',
      'mulai jualan',
      'aktivasi wa',
      'aktivasi qris',
      'siap jualan',
    ],
    title: '🎯 SOP 3 Langkah Aktivasi Toko & WhatsApp Commerce',
    text: `🚀 **Panduan 3 Langkah Cepat Aktivasi Toko & WhatsApp Commerce (Standar ARCHITECTURE.md):**

1. 💬 **Langkah 1: Hubungkan WhatsApp Toko (Tab 'WhatsApp')**
   - Buka tab **WhatsApp** di dashboard.
   - Scan QR Code atau tautkan nomor bisnis toko Anda via BoonTrack Direct Connect.
   - **Wajib status hijau (CONNECTED)** untuk mengaktifkan mode 2-way AI Commerce agar bot dapat melayani tanya-jawab, rekomendasi produk, dan closing otomatis 24/7.

2. ⚡ **Langkah 2: Upload Barcode QRIS Statis (Pengaturan Pembayaran)**
   - Buka tab **Pengaturan** > **Pengaturan Pembayaran** (\`tenants.metadata.payment_settings\`).
   - Unggah gambar barcode QRIS toko Anda (BCA, DANA Bisnis, GoPay Usaha, ShopeePay, dll).
   - **Otomasi EMVCo Dinamis:** Sistem BoonTrack secara otomatis mengekstrak payload string QRIS dan mentransformasikannya menjadi **Dynamic QRIS EMVCo** berstandar nasional dengan sistem kode unik diskon (**DOWNWARD**) untuk verifikasi instan tanpa fee gateway (0% MDR).

3. 📦 **Langkah 3: Tambahkan Produk Aktif (Tab 'Katalog')**
   - Buka tab **Katalog** dan masukkan produk toko Anda (Nama, Foto, Deskripsi, dan Harga).
   - Database produk adalah **Single Source of Truth** harga resmi yang digunakan oleh AI Bot saat merespons calon pembeli di WhatsApp.

---
🤝 **Aturan Handoff CS Manual (Anti-Tabrakan):**
Saat Anda atau admin CS membalas chat pembeli secara manual melalui perangkat WhatsApp toko atau Inbox Console, AI Bot secara otomatis **dijeda (\`bot_paused = true\`)** agar tidak bertabrakan dengan percakapan manusia.

🧪 **Instruksi Pengujian (Testing):**
Lakukan simulasi order mandiri dengan mengirim pesan WhatsApp dari nomor HP lain ke nomor toko Anda:
> *"Halo kak, mau pesan"*
Bot AI akan langsung menyapa, menampilkan katalog, dan memandu checkout hingga QRIS dinamis terbit!`,
    quick_actions: [
      'Hubungkan WhatsApp Toko',
      'Upload QRIS Toko',
      'Tambah Produk Baru',
      'Aturan Handoff CS Manual',
      '5 Checklist Wajib Siap Jual',
    ],
  },
  {
    id: 'sop_dynamic_qris',
    category: 'SOP_ONBOARDING',
    keywords: [
      'qris dinamis',
      'upload qris',
      'emvco',
      'kode unik',
      'downward',
      'payment settings',
      'cara kerja qris',
      'qris',
    ],
    title: '⚡ Cara Kerja Dynamic QRIS EMVCo & Kode Diskon Unik (DOWNWARD)',
    text: `⚡ **Standar Arsitektur QRIS Dinamis BoonTrack (Section 14 & 21):**

1. **Konversi Otomatis EMVCo:**
   Anda cukup mengunggah 1 gambar QRIS statis di dashboard toko. Mesin BoonTrack membaca tag EMVCo (ID 00 sampai 63) dan secara dinamis menyuntikkan nominal tagihan presisi (Tag 54) dan Point of Initiation Method dinamis (Tag 01 = 12).

2. **Sistem Kode Diskon Unik (DOWNWARD):**
   Untuk memverifikasi transfer tanpa membebani pembeli dengan biaya admin, sistem menggunakan pengurangan acak nominal unik (misal Rp100.000 menjadi Rp99.988). Pembeli membayar lebih murah, dan sistem mencocokkan pembayaran secara 100% presisi.

3. **Verifikasi Atomic Tanpa Fee:**
   Mutasi QRIS diverifikasi instan via BoonTrack Reader APK (Android) tanpa perantara payment gateway pihak ketiga, sehingga merchant menikmati margin penuh tanpa potongan MDR.`,
    quick_actions: [
      'SOP 3 Langkah Aktivasi Toko',
      'Upload QRIS Toko',
      '5 Checklist Wajib Siap Jual',
    ],
  },
  {
    id: 'sop_handoff_cs',
    category: 'SOP_ONBOARDING',
    keywords: [
      'handoff',
      'bot paused',
      'cs manual',
      'jeda bot',
      'balas manual',
      'ambil alih chat',
      'bot_paused',
    ],
    title: '🤝 Aturan Handoff CS Manual & Jeda Bot Otomatis (bot_paused)',
    text: `🤝 **Mekanisme Handoff CS Manual & Isolasi Chat:**

1. **Jeda Otomatis (\`bot_paused = true\`):**
   Ketika admin atau pemilik toko membalas chat pembeli secara langsung via aplikasi WhatsApp di ponsel atau melalui Inbox Console, backend BoonTrack mendeteksi intervensi manusia dan langsung mengaktifkan status jeda bot (\`bot_paused = true\`).

2. **Tanpa Gangguan Bot:**
   Selama status jeda aktif, AI Bot tidak akan mengirimkan balasan otomatis ke pelanggan tersebut. Pesan masuk tetap tercatat rapi di database Supabase dan Inbox Console.

3. **Melanjutkan Mode Bot:**
   Merchant dapat mengaktifkan kembali bot kapan saja melalui tombol toggle di header Inbox Console atau tab Pengaturan Toko.`,
    quick_actions: [
      'SOP 3 Langkah Aktivasi Toko',
      'Hubungkan WhatsApp Toko',
      '5 Checklist Wajib Siap Jual',
    ],
  },
  {
    id: 'qr_meja_toko',
    category: 'GENERAL',
    keywords: ['qr meja', 'qr toko', 'download qr', 'qr (png)', 'fungsi qr', 'meja kasir'],
    title: 'Fungsi Download QR Meja Toko (PNG)',
    text: `📌 **Fungsi Download QR Meja Toko (PNG):**\n\nTombol ini digunakan untuk mencetak **QR Code etalase digital toko Anda** yang bisa dipasang di:\n- Meja kasir atau meja gerai fisik\n- Kemasan produk / packaging\n- Brosur atau banner promosi offline\n\n**Cara Kerjanya:**\nBegitu pelanggan/pembeli offline men-scan QR tersebut menggunakan kamera HP, mereka akan **langsung diarahkan ke halaman etalase online toko Anda** tanpa perlu mengetik alamat *link*. Sangat praktis untuk mendatangkan repeat order dari pelanggan offline!`,
    quick_actions: [
      'SOP 3 Langkah Aktivasi Toko',
      '5 Checklist Wajib Siap Jual',
      '⚡ Cara aktifkan konfirmasi QRIS otomatis?',
    ],
  },
  {
    id: 'checklist_siap_jual',
    category: 'ONBOARDING_GUIDE',
    keywords: ['checklist', 'siap jual', 'roadmap', 'langkah', '5 langkah'],
    title: '5 Checklist Wajib Siap Jual',
    text: `Berikut adalah **5 Checklist Wajib Siap Jual** sebelum Anda mulai beriklan atau membagikan link toko:\n\n1. 📦 **Katalog Produk & Etalase Rapi:** Pastikan foto produk menarik, harga pas, dan cantumkan penawaran bundling.\n2. 🧠 **Isi AI Knowledge Toko (WAJIB):** Latih bot dengan pengetahuan produk, FAQ spesifik, dan kebijakan toko agar bot **tidak halu** saat membalas chat pembeli.\n3. 💬 **Scan WhatsApp Gateway:** Hubungkan nomor via *BoonTrack Direct Connect* agar bot CS otomatis menjawab chat 24/7.\n4. 🚚 **Aktivasi Logistik & Multi-Ekspedisi:** Nikmati diskon ongkir & cashback otomatis tanpa perlu antre di loket kurir.\n5. ⚡ **Otomasi QRIS Dinamis & BoonTrack Reader:** Pasang QRIS dan unduh APK BoonTrack Reader agar pembayaran pembeli terverifikasi instan tanpa cek mutasi manual!`,
    quick_actions: [
      'SOP 3 Langkah Aktivasi Toko',
      '⚡ Cara aktifkan konfirmasi QRIS otomatis?',
      'Kenapa toko online tidak butuh FAQ panjang?',
      'Cara melatih AI Knowledge Toko',
    ],
  },
  {
    id: 'no_faq_philosophy',
    category: 'COMMERCE',
    keywords: ['faq', 'impulse', 'panjang', 'kenapa tidak butuh'],
    title: 'Kenapa Toko Online Tidak Butuh FAQ Panjang',
    text: `💡 **Filosofi Toko Modern: Kenapa Tidak Butuh FAQ Panjang di Halaman Produk?**\n\n1. **Pembeli Malas Membaca Teks Panjang:** Menaruh deretan FAQ hanya membuat pembeli terdistraksi dan batal belanja (*drop off*).\n2. **Fokus ke Impulse Buying:** Etalase yang efektif hanya butuh foto memikat, promo bundling menarik, dan benefit produk yang langsung menggerakkan emosi untuk checkout.\n3. **Bot WhatsApp Sebagai CS Penutup:** Pertanyaan spesifik dan keraguan pembeli diselesaikan langsung oleh **AI Knowledge Toko & Bot WhatsApp** secara cepat dan personal!\n\nDengan formula ini, konversi penjualan Anda akan jauh lebih tinggi! 🚀`,
    quick_actions: [
      'SOP 3 Langkah Aktivasi Toko',
      '5 Checklist Wajib Siap Jual',
      'Cara melatih AI Knowledge Toko',
    ],
  },
  {
    id: 'ai_knowledge_training',
    category: 'AI_TRAINING',
    keywords: ['ai knowledge', 'latih bot', 'knowledge toko', 'cara melatih', 'faq toko', 'agar bot tidak halu'],
    title: 'Cara Melatih AI Knowledge Toko',
    text: `🧠 **Cara Melatih AI Knowledge Toko:**\n\n1. Masuk ke dashboard merchant BoonTrack Shop Anda dan buka tab **AI Knowledge & Bot**.\n2. Tuliskan informasi penting seputar toko Anda seperti deskripsi produk, bahan, ukuran, kebijakan garansi, ketentuan retur, dan FAQ spesifik.\n3. Klik simpan. Sistem AI akan langsung mempelajari data tersebut sehingga Bot WhatsApp CS Anda menjadi sangat pintar, akurat, dan **tidak halu** saat melayani calon pembeli 24/7!`,
    quick_actions: [
      'SOP 3 Langkah Aktivasi Toko',
      '5 Checklist Wajib Siap Jual',
      'Kenapa toko online tidak butuh FAQ panjang?',
    ],
  },
  {
    id: 'qris_otomatis',
    category: 'COMMERCE',
    keywords: ['qris', 'reader', 'pembayaran', 'statis', 'mutasi'],
    title: 'Otomasi Pembayaran QRIS Dinamis (BoonTrack Reader)',
    text: `⚡ **Otomasi Pembayaran QRIS Dinamis (BoonTrack Reader):**\n\n1. **Upload QRIS Toko:** Masuk ke tab **Pengaturan** dan unggah gambar QRIS Anda (BCA, DANA Bisnis, GoPay Usaha, dll).\n2. **Unduh BoonTrack Reader APK:** Pasang aplikasi Android BoonTrack Reader di HP yang menerima notifikasi mutasi rekening/e-wallet.\n3. **Otomasi Tanpa Fee (0% MDR):** Begitu pembeli scan kode QRIS unik di checkout, notifikasi mutasi dibaca oleh Reader dan status pesanan langsung berubah jadi **LUNAS** secara otomatis tanpa biaya potongan gateway!`,
    quick_actions: [
      'SOP 3 Langkah Aktivasi Toko',
      '5 Checklist Wajib Siap Jual',
      'Cara melatih AI Knowledge Toko',
    ],
  },
];

export function searchPlatformKnowledge(query: string): KnowledgeItem | null {
  const lowerQ = query.toLowerCase().trim();
  if (!lowerQ) return null;

  // Exact or keyword match
  for (const item of PLATFORM_KNOWLEDGE_BASE) {
    if (item.keywords.some((kw) => lowerQ.includes(kw) || kw.includes(lowerQ))) {
      return item;
    }
  }

  // Title match
  for (const item of PLATFORM_KNOWLEDGE_BASE) {
    if (item.title.toLowerCase().includes(lowerQ)) {
      return item;
    }
  }

  return null;
}

export function getPlatformKnowledgeByCategory(category: KnowledgeCategory): KnowledgeItem[] {
  return PLATFORM_KNOWLEDGE_BASE.filter((item) => item.category === category);
}