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
   - **Otomasi EMVCo Dinamis:** Sistem BoonTrack secara otomatis mengekstrak payload string QRIS dan mentransformasikannya menjadi **Dynamic QRIS EMVCo** berstandar nasional dengan sistem kode unik diskon (**DOWNWARD**) untuk verifikasi instan langsung ke rekening merchant.

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
    text: `⚡ **Otomasi Pembayaran QRIS Dinamis (BoonTrack Reader):**\n\n1. **Upload QRIS Toko:** Masuk ke tab **Pengaturan** dan unggah gambar QRIS Anda (BCA, DANA Bisnis, GoPay Usaha, dll).\n2. **Unduh BoonTrack Reader APK:** Pasang aplikasi Android BoonTrack Reader di HP yang menerima notifikasi mutasi rekening/e-wallet.\n3. **Otomasi Pembayaran Langsung:** Begitu pembeli scan kode QRIS unik di checkout, notifikasi mutasi dibaca oleh Reader dan status pesanan langsung berubah jadi **LUNAS** secara otomatis tanpa biaya potongan gateway!`,
    quick_actions: [
      'SOP 3 Langkah Aktivasi Toko',
      '5 Checklist Wajib Siap Jual',
      'Cara melatih AI Knowledge Toko',
    ],
  },
  {
    id: 'telegram_notif_realtime',
    category: 'ONBOARDING_GUIDE',
    keywords: [
      'notifikasi telegram',
      'notif telegram',
      'telegram bot toko',
      'notifikasi pesanan telegram',
      'boonshop_bot',
      'aktivasi notifikasi telegram',
    ],
    title: '📲 Aktivasi Notifikasi Real-time Telegram Toko (@boonshop_bot)',
    text: `📲 **Panduan Aktivasi Notifikasi Real-time Telegram Toko (@boonshop_bot):**\n\nNotifikasi via Telegram memiliki keunggulan **jauh lebih cepat (instant push)** dan **bebas delay** dibandingkan email. Setiap ada order masuk atau transfer QRIS berhasil, HP Anda akan langsung berdering seketika!\n\n**Langkah Aktivasi 1 Menit:**\n1. Buka aplikasi Telegram di HP Anda dan cari bot: **@boonshop_bot** (atau link: \`https://t.me/boonshop_bot\`).\n2. Klik tombol **/start** atau kirim perintah **/id**.\n3. Salin **Telegram Chat ID** Anda yang dikirimkan oleh bot.\n4. Masuk ke dashboard toko Anda > tab **Pengaturan** > sub-menu **Notifikasi**, lalu tempelkan Chat ID Anda.\n5. Selesai! Notifikasi pesanan baru, bukti transfer QRIS lunas, dan rekap harian akan langsung masuk ke Telegram pribadi atau grup tim Anda. 🚀`,
    quick_actions: [
      '🧭 Mulai Tur Menu',
      'SOP 3 Langkah Aktivasi Toko',
      '5 Checklist Wajib Siap Jual',
    ],
  },
  {
    id: 'landing_page_consultation',
    category: 'COMMERCE',
    keywords: [
      'landing page',
      'single page checkout',
      'rekomendasi landing page',
      'section landing page',
      'struktur landing page',
      'web penawaran',
      'draft landing page',
    ],
    title: '🚀 Rekomendasi Section Landing Page (Single Page Checkout)',
    text: `🚀 **Konsultasi & Panduan Struktur Landing Page (Single Page Checkout):**\n\nFitur **Single Page Checkout** di BoonTrack memungkinkan pembeli membaca penawaran, memilih varian, dan langsung membayar via QRIS di satu halaman tanpa terdistraksi (*drop-off rate sangat rendah*).\n\nBerikut adalah **Formula 6 Section Wajib** untuk menghasilkan konversi penjualan tinggi:\n\n### 1. 🌟 Hero Section (Visual & Headline Pemikat)\n- **Headline**: Janji manfaat utama yang langsung memecahkan masalah pembeli.\n- **Sub-headline**: 1-2 kalimat penjelas yang mempertegas keunikan produk.\n- **Media**: Foto produk tajam atau video demo singkat.\n- **Call to Action (CTA)**: Tombol *"Pesan Sekarang - Diskon Terbatas"* yang melompat langsung ke formulir checkout.\n\n### 2. ⚡ Problem & Agitation (Titik Masalah Calon Pembeli)\n- Angkat 3 rasa frustrasi atau kendala yang dialami target pasar sebelum menemukan produk Anda.\n- Contoh: *"Pernahkah Anda merasa lelah dengan...?"* atau *"Sering kecewa karena...?"*\n\n### 3. 🎯 Solution & Product Showcase (Keunggulan & USP)\n- Tampilkan produk Anda sebagai jawaban tuntas atas masalah di Section 2.\n- Paparkan 3-5 fitur unggulan beserta benefit nyata (bukan sekadar spesifikasi teknis).\n\n### 4. 💬 Social Proof (Bukti Nyata & Testimoni)\n- Tampilkan screenshot chat kepuasan pelanggan, foto unboxing, rating bintang 5, atau review jujur.\n- Cantumkan garansi kepuasan (*Garansi 100% Uang Kembali jika barang cacat*).\n\n### 5. 🎁 Pricing & Irresistible Offer (Harga Coret & Urgensi)\n- Berikan harga promo hemat dengan **Harga Coret** yang mencolok.\n- Tawarkan paket bundling (Beli 2 Lebih Hemat / Bonus Eksklusif).\n- Pasang urgensi (*Promo Berakhir Hari Ini / Kuota Terbatas*).\n\n### 6. 📝 Direct Checkout Form (Pemesanan 1 Halaman)\n- Formulir ringkas: Nama, No WhatsApp, Alamat/Domisili, dan Pilihan Kurir.\n- Penerbitan Dynamic QRIS otomatis dengan kode unik diskon instan (**DOWNWARD**).\n\n---\n💡 **Ingin dibuatkan draf teks spesifik untuk produk Anda?** Cukup ketik nama produk dan target pasar Anda, saya akan buatkan copy per section-nya!`,
    quick_actions: [
      '1. Hero Section',
      '2. Problem & Agitation',
      '3. Solution & Showcase',
      '5. Pricing & Offer',
      '6. Direct Checkout Form',
    ],
  },
  {
    id: 'menu_tour_main',
    category: 'ONBOARDING_GUIDE',
    keywords: [
      'tur menu',
      'mulai tur menu',
      'tur singkat',
      'keliling menu',
      'fungsi menu',
      'tur interaktif',
      'pengenalan menu',
      'ekosistem boontrack',
      'menu boontrack',
    ],
    title: '🧭 Tur Interaktif 10 Menu Utama BoonTrack',
    text: `🎉 **Selamat! Setup Toko Anda Sudah 100% Siap Beroperasi!**\n\nUntuk membantu Anda memaksimalkan penjualan dan menguasai seluruh fitur, berikut adalah peta **10 Menu & Ekosistem Utama BoonTrack**:\n\n1. 📊 **Dashboard (Overview)**: Monitoring performa trafik etalase, sesi chat, dan transaksi harian secara realtime.\n2. 📦 **Produk & Jasa**: Manajemen katalog fisik, modul digital, layanan jasa, varian, dan stok otomatis.\n3. 🚚 **Pengiriman & Kurir**: Integrasi agregator kurir lincah dan setup titik gudang/dapur penjemputan (ongkir akurat otomatis).\n4. 🎨 **Tampilan & Tema**: 3 opsi gaya etalase depan (Katalog Standar, Microsite Bio-link ala Linktree modern, dan Personal Brand).\n5. 🧠 **AI Knowledge & Bot**: Pusat latihan otak bot toko (FAQ, SOP retur, knowledge produk, gaya bicara CS).\n6. 💬 **WhatsApp & Broadcast**: Dual-gateway WhatsApp (Direct Gateway vs Official Meta Centang Biru) serta Telegram Sales Bot di grup jualan.\n7. 📥 **BoonTrack Inbox**: Fitur balas pesan keroyokan oleh tim CS dan otomasi penembakan sinyal purchase event ke media iklan.\n8. 🎯 **Ads Tracking Pro**: Pelacak presisi multi-channel (Facebook CAPI, TikTok Pixel, Google Ads) lengkap dengan opsi dipandu step-by-step.\n9. 💰 **Laporan Keuangan**: Rekap pembukuan otomatis yang eksklusif mencatat transaksi berstatus PAID (lunas).\n10. 📝 **Daftar Pesanan Toko**: Mekanisme mutasi instan QRIS (otomatis berstatus PAID dalam 5-15 detik) vs penanganan status UNPAID beserta pesan follow-up otomatis.\n\n---\n💡 **Tahukah Anda?**\nDi luar sana, jika Anda berlangganan terpisah untuk tools website katalog, WhatsApp broadcast, AI CS bot, kurir otomatis, dan multi-channel ads tracking, biayanya bisa mencapai **Rp 1,5 jt – Rp 3 jt per bulan**! Di BoonTrack, seluruh senjata penjualan ini sudah **menyatu sempurna dalam 1 ekosistem** terpadu. 🚀\n\n👇 **Silakan pilih menu yang ingin Anda pelajari detailnya:**`,
    quick_actions: [
      '1. Dashboard Overview',
      '2. Produk & Jasa',
      '3. Pengiriman & Kurir',
      '4. Tampilan & Tema',
      '5. AI Knowledge & Bot',
      '6. WhatsApp & Broadcast',
      '7. BoonTrack Inbox',
      '8. Ads Tracking Pro',
      '9. Laporan Keuangan',
      '10. Daftar Pesanan Toko',
    ],
  },
  {
    id: 'tour_menu_1',
    category: 'ONBOARDING_GUIDE',
    keywords: ['1. dashboard overview', 'dashboard overview', 'fungsi dashboard', 'menu dashboard'],
    title: '📊 1. Dashboard (Overview)',
    text: `📊 **Menu 1: Dashboard (Overview)**\n\n- **Fungsi Utama:** Pusat komando untuk memantau performa penjualan secara realtime.\n- **Fitur Kunci:**\n  1. **Trafik Kunjungan Etalase:** Pantau jumlah calon pembeli yang membuka link toko Anda dalam 7 hari terakhir.\n  2. **Interaksi Chat AI:** Jumlah percakapan otomatis yang ditangani oleh bot WhatsApp.\n  3. **Pesanan & Omzet Masuk:** Total transaksi yang berhasil tercatat dan omzet bersih.\n  4. **Shortcut Cepat:** Tautan langsung ke pengaturan toko, tambah produk, dan bio-link medsos.`,
    quick_actions: ['2. Produk & Jasa', '🧭 Mulai Tur Menu', '🚀 Rekomendasi Landing Page'],
  },
  {
    id: 'tour_menu_2',
    category: 'ONBOARDING_GUIDE',
    keywords: ['2. produk & jasa', 'produk & jasa', 'manajemen produk', 'katalog produk', 'tambah produk'],
    title: '📦 2. Produk & Jasa',
    text: `📦 **Menu 2: Produk & Jasa**\n\n- **Fungsi Utama:** Mengelola katalog jualan untuk berbagai tipe bisnis: barang fisik, produk digital, kursus/ebook, jasa panggilan, hingga menu kuliner.\n- **Fitur Kunci:**\n  1. **Single Page Checkout:** Atur landing page checkout langsung untuk produk jagoan Anda.\n  2. **Varian & Diskon Dinamis:** Atur ukuran, warna, harga promo coret, dan batas stok.\n  3. **Import Spreadsheet Massal:** Unggah ratusan produk sekaligus dari file Excel/CSV dalam hitungan detik.`,
    quick_actions: ['3. Pengiriman & Kurir', '🚀 Rekomendasi Landing Page', '🧭 Mulai Tur Menu'],
  },
  {
    id: 'tour_menu_3',
    category: 'ONBOARDING_GUIDE',
    keywords: ['3. pengiriman & kurir', 'pengiriman & kurir', 'ongkir otomatis', 'titik gudang', 'biteship'],
    title: '🚚 3. Pengiriman & Kurir',
    text: `🚚 **Menu 3: Pengiriman & Kurir**\n\n- **Fungsi Utama:** Menghubungkan toko Anda dengan jaringan ekspedisi nasional dan kurir instan.\n- **Fitur Kunci:**\n  1. **Ongkir Akurat Otomatis:** Perhitungan ongkir real-time (JNE, J&T, SiCepat, Anteraja, GoSend, GrabExpress).\n  2. **Titik Gudang / Dapur:** Tentukan alamat asal penjemputan paket tanpa perlu repot antar barang ke gerai kurir.\n  3. **Diskon Ongkir & Cashback:** Nikmati tarif hemat pengiriman langsung dari sistem agregator.`,
    quick_actions: ['4. Tampilan & Tema', '🧭 Mulai Tur Menu', '5. AI Knowledge & Bot'],
  },
  {
    id: 'tour_menu_4',
    category: 'ONBOARDING_GUIDE',
    keywords: ['4. tampilan & tema', 'tampilan & tema', 'microsite', 'bio-link', 'tema toko', 'desain etalase'],
    title: '🎨 4. Tampilan & Tema',
    text: `🎨 **Menu 4: Tampilan & Tema Storefront**\n\n- **Fungsi Utama:** Mengubah estetika visual etalase publik toko Anda sesuai target market.\n- **3 Pilihan Tema Siap Pakai:**\n  1. **Katalog Toko (Default):** Tampilan grid toko online klasik dengan filter kategori.\n  2. **Microsite Bio-Link:** Desain minimalis vertikal super cepat ala Linktree khusus konversi bio TikTok/Instagram.\n  3. **Personal Brand & Authority:** Gaya landing page personal mentor, profesional, & agensi.`,
    quick_actions: ['5. AI Knowledge & Bot', '🧭 Mulai Tur Menu', '🚀 Rekomendasi Landing Page'],
  },
  {
    id: 'tour_menu_5',
    category: 'AI_TRAINING',
    keywords: ['5. ai knowledge & bot', 'ai knowledge & bot', 'latih otak bot', 'otak bot', 'faq bot'],
    title: '🧠 5. AI Knowledge & Bot',
    text: `🧠 **Menu 5: AI Knowledge & Bot**\n\n- **Fungsi Utama:** Pusat pelatihan otak kecerdasan buatan (AI) yang menjadi asisten CS toko Anda.\n- **Fitur Kunci:**\n  1. **Knowledge Toko:** Tuliskan spesifikasi produk, bahan, ukuran, dan kebijakan retur agar bot **tidak halu**.\n  2. **Persona CS:** Tentukan nada bicara bot (ramah, formal, akrab, emoji-friendly).\n  3. **Aturan Handoff Manusia:** Bot otomatis menjeda diri saat CS admin mengambil alih obrolan secara manual.`,
    quick_actions: ['6. WhatsApp & Broadcast', '🧭 Mulai Tur Menu', '7. BoonTrack Inbox'],
  },
  {
    id: 'tour_menu_6',
    category: 'ONBOARDING_GUIDE',
    keywords: ['6. whatsapp & broadcast', 'whatsapp & broadcast', 'dual-gateway', 'telegram sales bot', 'waba'],
    title: '💬 6. WhatsApp & Broadcast',
    text: `💬 **Menu 6: WhatsApp & Broadcast Engine**\n\n- **Fungsi Utama:** Otomasi saluran komunikasi penjualan dan broadcast promosi.\n- **Fitur Kunci:**\n  1. **Dual-Gateway:** Pilihan koneksi via *BoonTrack Direct Connect* (scan QR instan) atau *Official Meta Cloud API (Centang Biru)*.\n  2. **Telegram Sales Bot:** Pasang bot perwakilan resmi di grup komunitas jualan Anda yang bisa dimention untuk melayani pertanyaan dan closing otomatis.\n  3. **Pesan Sapaan Otomatis:** Greeting hangat yang otomatis dikirim ke setiap chat baru.`,
    quick_actions: ['7. BoonTrack Inbox', '🧭 Mulai Tur Menu', '8. Ads Tracking Pro'],
  },
  {
    id: 'tour_menu_7',
    category: 'ONBOARDING_GUIDE',
    keywords: ['7. boontrack inbox', 'boontrack inbox', 'inbox console', 'balas keroyokan', 'team chat'],
    title: '📥 7. BoonTrack Inbox Console',
    text: `📥 **Menu 7: BoonTrack Inbox Console**\n\n- **Fungsi Utama:** Meja kerja operasional tim CS untuk melayani chat pelanggan dari satu dashboard terpadu.\n- **Fitur Kunci:**\n  1. **Balas Chat Keroyokan:** Banyak CS/staf dapat membuka dan membalas nomor WhatsApp toko secara bersamaan tanpa logout.\n  2. **Sinyal Purchase Event Iklan:** Sistem otomatis menembakkan event konversi ke server iklan saat pesanan diselesaikan.\n  3. **Manajemen Label & Status:** Filter prospek hangat, order tertunda, dan pelanggan setia.`,
    quick_actions: ['8. Ads Tracking Pro', '🧭 Mulai Tur Menu', '9. Laporan Keuangan'],
  },
  {
    id: 'tour_menu_8',
    category: 'ONBOARDING_GUIDE',
    keywords: ['8. ads tracking pro', 'ads tracking pro', 'pelacak iklan', 'meta capi', 'tiktok pixel', 'google ads'],
    title: '🎯 8. Ads Tracking Pro',
    text: `🎯 **Menu 8: Ads Tracking Pro**\n\n- **Fungsi Utama:** Melacak efektivitas iklan berbayar secara presisi lintas platform digital.\n- **Fitur Kunci:**\n  1. **Server-Side Conversion API (CAPI):** Melacak pembelian akurat anti-blokir iOS/Adblocker untuk Meta (Facebook/Instagram), TikTok, dan Google Ads.\n  2. **Panduan Step-by-Step:** Merchant pemula dapat dipandu langkah demi langkah oleh BoonPilot untuk pasang pixel tanpa coding.\n  3. **Event Optimization:** Optimasi event *ViewContent*, *AddToCart*, *InitiateCheckout*, hingga *Purchase*.`,
    quick_actions: ['9. Laporan Keuangan', '🧭 Mulai Tur Menu', '10. Daftar Pesanan Toko'],
  },
  {
    id: 'tour_menu_9',
    category: 'COMMERCE',
    keywords: ['9. laporan keuangan', 'laporan keuangan', 'pembukuan otomatis', 'rekap omzet', 'laba rugi'],
    title: '💰 9. Laporan Keuangan',
    text: `💰 **Menu 9: Laporan Keuangan**\n\n- **Fungsi Utama:** Rekapitulasi pembukuan finansial toko yang transparan dan otomatis.\n- **Fitur Kunci:**\n  1. **Eksklusif Transaksi LUNAS (PAID):** Laporan omzet hanya menghitung dana yang benar-benar masuk ke rekening/QRIS toko Anda (zero false positive).\n  2. **Grafik Tren Omzet:** Visualisasi pendapatan harian, mingguan, dan bulanan.\n  3. **Export Laporan:** Unduh data rekap keuangan ke file CSV/Excel untuk keperluan laporan pajak atau pembukuan internal.`,
    quick_actions: ['10. Daftar Pesanan Toko', '🧭 Mulai Tur Menu', '1. Dashboard Overview'],
  },
  {
    id: 'tour_menu_10',
    category: 'COMMERCE',
    keywords: ['10. daftar pesanan toko', 'daftar pesanan toko', 'mutasi qris instan', 'status unpaid', 'pesanan masuk'],
    title: '📝 10. Daftar Pesanan Toko',
    text: `📝 **Menu 10: Daftar Pesanan Toko**\n\n- **Fungsi Utama:** Memantau dan mengelola setiap pesanan pelanggan dari status baru hingga terkirim.\n- **Fitur Kunci:**\n  1. **Mutasi Instan QRIS (5-15 Detik):** Pesanan otomatis berubah menjadi **PAID (Lunas)** begitu mutasi terdeteksi oleh BoonTrack Reader.\n  2. **Penanganan Status UNPAID:** Pantau calon pembeli yang belum menyelesaikan pembayaran dan kirimkan pesan follow-up otomatis via WhatsApp untuk closing ulang.\n  3. **Resi Pengiriman Otomatis:** Cetak label pengiriman dan kirim nomor resi ke chat WhatsApp pembeli dengan 1 klik.`,
    quick_actions: ['🧭 Mulai Tur Menu', '🚀 Rekomendasi Landing Page', '1. Dashboard Overview'],
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