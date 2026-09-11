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

export interface KnowledgeItem {
  id: string;
  keywords: string[];
  title: string;
  text: string;
  quick_actions: string[];
}

export const PLATFORM_KNOWLEDGE_BASE: KnowledgeItem[] = [
  {
    id: 'qr_meja_toko',
    keywords: ['qr meja', 'qr toko', 'download qr', 'qr (png)', 'fungsi qr', 'meja kasir'],
    title: 'Fungsi Download QR Meja Toko (PNG)',
    text: `📌 **Fungsi Download QR Meja Toko (PNG):**\n\nTombol ini digunakan untuk mencetak **QR Code etalase digital toko Anda** yang bisa dipasang di:\n- Meja kasir atau meja gerai fisik\n- Kemasan produk / packaging\n- Brosur atau banner promosi offline\n\n**Cara Kerjanya:**\nBegitu pelanggan/pembeli offline men-scan QR tersebut menggunakan kamera HP, mereka akan **langsung diarahkan ke halaman etalase online toko Anda** tanpa perlu mengetik alamat *link*. Sangat praktis untuk mendatangkan repeat order dari pelanggan offline!`,
    quick_actions: [
      '5 Checklist Wajib Siap Jual',
      '⚡ Cara aktifkan konfirmasi QRIS otomatis?',
      'Kenapa toko online tidak butuh FAQ panjang?',
    ],
  },
  {
    id: 'checklist_siap_jual',
    keywords: ['checklist', 'siap jual', 'roadmap', 'langkah', '5 langkah'],
    title: '5 Checklist Wajib Siap Jual',
    text: `Berikut adalah **5 Checklist Wajib Siap Jual** sebelum Anda mulai beriklan atau membagikan link toko:\n\n1. 📦 **Katalog Produk & Etalase Rapi:** Pastikan foto produk menarik, harga pas, dan cantumkan penawaran bundling.\n2. 🧠 **Isi AI Knowledge Toko (WAJIB):** Latih bot dengan pengetahuan produk, FAQ spesifik, dan kebijakan toko agar bot **tidak halu** saat membalas chat pembeli.\n3. 💬 **Scan WhatsApp Gateway:** Hubungkan nomor via *BoonTrack Direct Connect* agar bot CS otomatis menjawab chat 24/7.\n4. 🚚 **Aktivasi Logistik & Multi-Ekspedisi:** Nikmati diskon ongkir & cashback otomatis tanpa perlu antre di loket kurir.\n5. ⚡ **Otomasi QRIS Dinamis & BoonTrack Reader:** Pasang QRIS dan unduh APK BoonTrack Reader agar pembayaran pembeli terverifikasi instan tanpa cek mutasi manual!`,
    quick_actions: [
      '⚡ Cara aktifkan konfirmasi QRIS otomatis?',
      'Kenapa toko online tidak butuh FAQ panjang?',
      'Cara melatih AI Knowledge Toko',
      '🔥 Bikin promo bundling biar orderan banjir!',
    ],
  },
  {
    id: 'no_faq_philosophy',
    keywords: ['faq', 'impulse', 'panjang', 'kenapa tidak butuh'],
    title: 'Kenapa Toko Online Tidak Butuh FAQ Panjang',
    text: `💡 **Filosofi Toko Modern: Kenapa Tidak Butuh FAQ Panjang di Halaman Produk?**\n\n1. **Pembeli Malas Membaca Teks Panjang:** Menaruh deretan FAQ hanya membuat pembeli terdistraksi dan batal belanja (*drop off*).\n2. **Fokus ke Impulse Buying:** Etalase yang efektif hanya butuh foto memikat, promo bundling menarik, dan benefit produk yang langsung menggerakkan emosi untuk checkout.\n3. **Bot WhatsApp Sebagai CS Penutup:** Pertanyaan spesifik dan keraguan pembeli diselesaikan langsung oleh **AI Knowledge Toko & Bot WhatsApp** secara cepat dan personal!\n\nDengan formula ini, konversi penjualan Anda akan jauh lebih tinggi! 🚀`,
    quick_actions: [
      '5 Checklist Wajib Siap Jual',
      '🔥 Bikin promo bundling biar orderan banjir!',
      'Cara melatih AI Knowledge Toko',
      '⚡ Cara aktifkan konfirmasi QRIS otomatis?',
    ],
  },
  {
    id: 'ai_knowledge_training',
    keywords: ['ai knowledge', 'latih bot', 'knowledge toko', 'cara melatih', 'faq toko', 'agar bot tidak halu'],
    title: 'Cara Melatih AI Knowledge Toko',
    text: `🧠 **Cara Melatih AI Knowledge Toko:**\n\n1. Masuk ke dashboard merchant BoonTrack Shop Anda dan buka tab **AI Knowledge & Bot**.\n2. Tuliskan informasi penting seputar toko Anda seperti deskripsi produk, bahan, ukuran, kebijakan garansi, ketentuan retur, dan FAQ spesifik.\n3. Klik simpan. Sistem AI akan langsung mempelajari data tersebut sehingga Bot WhatsApp CS Anda menjadi sangat pintar, akurat, dan **tidak halu** saat melayani calon pembeli 24/7!`,
    quick_actions: [
      '5 Checklist Wajib Siap Jual',
      'Kenapa toko online tidak butuh FAQ panjang?',
      '⚡ Cara aktifkan konfirmasi QRIS otomatis?',
    ],
  },
  {
    id: 'qris_otomatis',
    keywords: ['qris', 'reader', 'pembayaran', 'statis', 'mutasi'],
    title: 'Otomasi Pembayaran QRIS Dinamis',
    text: `⚡ **Otomasi Pembayaran QRIS Dinamis (BoonTrack Reader):**\n\n1. **Upload QRIS Toko:** Masuk ke tab **Pengaturan** dan unggah gambar QRIS Anda (BCA, DANA Bisnis, GoPay Usaha, dll).\n2. **Unduh BoonTrack Reader APK:** Pasang aplikasi Android BoonTrack Reader di HP yang menerima notifikasi mutasi rekening/e-wallet.\n3. **Otomasi Tanpa Fee (0% MDR):** Begitu pembeli scan kode QRIS unik di checkout, notifikasi mutasi dibaca oleh Reader dan status pesanan langsung berubah jadi **LUNAS** secara otomatis tanpa biaya potongan gateway!`,
    quick_actions: [
      '5 Checklist Wajib Siap Jual',
      'Cara melatih AI Knowledge Toko',
      'Kenapa toko online tidak butuh FAQ panjang?',
    ],
  },
];

export function searchPlatformKnowledge(query: string): KnowledgeItem | null {
  const lowerQ = query.toLowerCase();
  for (const item of PLATFORM_KNOWLEDGE_BASE) {
    if (item.keywords.some((kw) => lowerQ.includes(kw))) {
      return item;
    }
  }
  return null;
}