'use client';

import React, { useState } from 'react';
import { 
  Package, 
  Download, 
  Utensils, 
  Wrench, 
  Briefcase, 
  Video,
  CheckCircle2, 
  ArrowRight, 
  MessageSquare, 
  Truck, 
  Calendar, 
  Clock, 
  FileText,
  Sparkles,
  Zap
} from 'lucide-react';

interface VerticalConfig {
  id: string;
  name: string;
  badge: string;
  icon: React.ElementType;
  tagline: string;
  description: string;
  features: string[];
  botTitle: string;
  initialChat: {
    user: string;
    bot: string;
    quickReplies: string[];
    actionDetail?: string;
  };
}

const VERTICALS: VerticalConfig[] = [
  {
    id: 'fisik',
    name: 'Produk Fisik',
    badge: 'Retail & Brand',
    icon: Package,
    tagline: 'Otomasi Resi Kurir & Cek Ongkir Biteship Instan',
    description: 'Cocok untuk toko pakaian, sepatu, kosmetik, dan barang fisik. Pembeli memilih varian, sistem menghitung ongkir otomatis, dan resi terbit tanpa input manual admin.',
    features: [
      'Multi-varian warna, ukuran, dan stok berkurang otomatis',
      'Integrasi tarif ongkir kurir reguler (J&T, SiCepat) & instan Biteship',
      'Form alamat pengiriman presisi dengan auto-postal code',
      'Penerbitan label pengiriman dan resi otomatis via WhatsApp'
    ],
    botTitle: 'Bot Retail Toko Fisik',
    initialChat: {
      user: 'Halo, ada promo gamis basic size XL warna navy?',
      bot: 'Halo kak! Gamis Basic size XL Navy ready stok 12 pcs. Promo diskon 20% + Subsidi Ongkir otomatis aktif.',
      quickReplies: ['Cek Ongkir ke Kotaku', 'Pilih Varian Lain', 'Beli Sekarang (QRIS)'],
      actionDetail: 'Alur: Pembeli pilih varian -> Cek tarif kurir Biteship -> Bayar QRIS 0% MDR -> Resi kurir dikirim otomatis.'
    }
  },
  {
    id: 'digital',
    name: 'Produk Digital',
    badge: 'E-Course & Template',
    icon: Download,
    tagline: '0 Ongkir, Link Download & Lisensi Aktif Seketika',
    description: 'Khusus penjual e-book, software license, template, dan video pembelajaran. Pembeli menerima akses unduhan instan detik itu juga setelah QRIS lunas.',
    features: [
      'Otomatisasi 0 ongkir tanpa kolom alamat yang membingungkan',
      'Proteksi link download dinamis dengan token unduhan privat',
      'Kirim kredensial lisensi & instruksi otomatis ke WhatsApp dan Email',
      'Dukungan voucher promo hemat nominal atau persentase diskon'
    ],
    botTitle: 'Bot Pengiriman Konten Digital',
    initialChat: {
      user: 'Kak, mau beli Template Notion Project Management!',
      bot: 'Siap kak! Template Notion Workspace Pro v2.4 (Rp 99.000). Lisensi personal & video tutorial akan langsung dikirim detik ini.',
      quickReplies: ['Lihat Silabus & Fitur', 'Gunakan Kupon Promo', 'Buka Akses Instan (QRIS)'],
      actionDetail: 'Alur: Klik bayar -> Pembayaran lunas dalam 3 detik -> Bot kirim link akses Google Drive / Notion langsung di chat.'
    }
  },
  {
    id: 'fnb',
    name: 'F&B & Kuliner',
    badge: 'Resto & Bakery',
    icon: Utensils,
    tagline: 'Pemisahan Jalur Pesanan Delivery vs Dine-In / Meja',
    description: 'Sempurna untuk restoran, coffee shop, catering, dan bakery. Pelanggan dapat memesan dari meja (QR Dine-In) atau minta diantar kurir makanan tanpa komisi ojol 20-30%.',
    features: [
      'Pilihan alur: Dine-In (nomor meja) vs Delivery antar ke rumah',
      'Input catatan porsi/level kepedasan & add-ons menu fleksibel',
      'Cetak tiket pesanan instan ke printer dapur / kitchen display',
      'Tanpa potongan komisi aplikasi pengantaran pihak ketiga'
    ],
    botTitle: 'Asisten Kasir Resto & Kuliner',
    initialChat: {
      user: 'Halo min, mau pesan 2 porsi Nasi Goreng Spesial dan 2 Es Kopi.',
      bot: 'Halo! Pesanan: 2x Nasi Goreng Spesial + 2x Es Kopi (Total Rp 96.000). Mau diantar ke alamat atau Dine-In di tempat?',
      quickReplies: ['Antar ke Alamat (Delivery)', 'Makan di Tempat (Dine-In)', 'Ambil Sendiri (Takeaway)'],
      actionDetail: 'Alur: Pelanggan pilih Delivery / Dine-In -> Masukkan nomor meja/alamat -> Bayar QRIS -> Dapur proses.'
    }
  },
  {
    id: 'lapangan',
    name: 'Jasa Lapangan',
    badge: 'Teknisi & Servis',
    icon: Wrench,
    tagline: 'Booking Jadwal Servis AC, Toren & Teknisi ke Rumah',
    description: 'Untuk bisnis cuci toren, servis AC, instalasi listrik, dan pengerjaan lapangan. Pelanggan mengisi form keluhan dan memilih tanggal teknisi berkunjung.',
    features: [
      'Alur penjadwalan slot teknisi (pilih tanggal & jam kunjungan)',
      'Form input alamat lokasi pengerjaan fisik terverifikasi',
      'Notifikasi WhatsApp penugasan teknisi & pengingat jadwal H-1',
      'Tanpa keranjang belanja retail (murni penjadwalan layanan)'
    ],
    botTitle: 'Dispatcher Servis & Teknisi',
    initialChat: {
      user: 'Halo, toren air di rumah bocor dan butuh teknisi besok.',
      bot: 'Halo Bapak/Ibu! Kami menyediakan layanan Cek & Kuras Toren Area Bandung. Teknisi kami dapat hadir besok jam 09:00 atau 14:00.',
      quickReplies: ['Pilih Slot Besok 09:00', 'Pilih Slot Besok 14:00', 'Konsultasi Tarif Estimasi'],
      actionDetail: 'Alur: Masukkan keluhan -> Pilih slot waktu teknisi -> Alamat dikirim ke teknisi -> Konfirmasi via WhatsApp.'
    }
  },
  {
    id: 'profesi',
    name: 'Profesi & Agensi',
    badge: 'Konsultan & Agency',
    icon: Briefcase,
    tagline: 'Intake Form Kebutuhan Brief & Jadwal Konsultasi Zoom',
    description: 'Dirancang untuk konsultan pajak, firma hukum, agensi pemasaran digital, dan desainer. Menghilangkan checkout keranjang dan menggantinya dengan brief intake & invoice DP.',
    features: [
      'Bebas dari keranjang belanja fisik (langsung form intake brief)',
      'Pemesanan jadwal sesi konsultasi privat 1-on-1 via Google Meet/Zoom',
      'Penerbitan invoice uang muka (DP) atau kontrak retainer bulanan',
      'Pemberian link kalender otomatis setelah sesi terkonfirmasi'
    ],
    botTitle: 'Asisten Intake Konsultan',
    initialChat: {
      user: 'Saya ingin konsultasi audit kampanye Meta Ads untuk brand fashion kami.',
      bot: 'Selamat datang di Layanan Konsultasi Pro! Kami siap mengaudit kampanye Meta Ads Anda. Silakan tentukan waktu sesi audit privat.',
      quickReplies: ['Jadwalkan Sesi Audit Zoom', 'Kirim Form Brief Kebutuhan', 'Lihat Portofolio & Rate'],
      actionDetail: 'Alur: Klien isi form brief -> Jadwalkan Zoom 45 menit -> Bayar invoice DP via QRIS -> Link kalender aktif.'
    }
  },
  {
    id: 'kreator',
    name: 'Kreator & Talent',
    badge: 'Influencer & KOL',
    icon: Video,
    tagline: 'Rate Card Endorsement & Checkout Sesi Mentoring',
    description: 'Untuk konten kreator, talent media sosial, dan coach. Tampilkan rate card sponsorship resmi, brief endorsement instan, dan penjualan materi masterclass.',
    features: [
      'Rate card interaktif terpadu (Reels, TikTok, Story, Dedicated)',
      'Intake form brief sponsor & deliverables tenggat waktu',
      'Checkout materi masterclass / komunitas eksklusif VIP',
      'Penerimaan fee sponsor via QRIS instan bebas potongan agensi'
    ],
    botTitle: 'Management Asisten Kreator',
    initialChat: {
      user: 'Halo, kami dari brand ingin ajak kolaborasi video TikTok 60 detik.',
      bot: 'Halo Brand Partner! Terima kasih telah menghubungi kami. Rate card kolaborasi video TikTok resmi kami adalah Rp 3.500.000 / video.',
      quickReplies: ['Unduh Media Kit & Rate Card', 'Isi Form Brief Sponsor', 'Booking Tanggal Tayang'],
      actionDetail: 'Alur: Sponsor lihat rate card -> Kirim brief produk -> Sepakati tanggal tayang -> Terbitkan invoice resmi.'
    }
  }
];

export default function VerticalSegmentSelector() {
  const [activeTab, setActiveTab] = useState<string>('fisik');
  const [chatFeedback, setChatFeedback] = useState<string | null>(null);

  const activeVertical = VERTICALS.find((v) => v.id === activeTab) || VERTICALS[0];
  const IconComponent = activeVertical.icon;

  const handleQuickReplyClick = (replyText: string) => {
    setChatFeedback(`Respon terpilih: "${replyText}". Bot langsung memproses alur khusus ${activeVertical.name}!`);
    setTimeout(() => {
      setChatFeedback(null);
    }, 4000);
  };

  return (
    <section id="vertikal" className="py-20 bg-slate-950/60 border-y border-slate-800/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Heading */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold">
            <Zap className="w-3.5 h-3.5" />
            <span>Multi-Tenant Architecture Sesuai Regulasi</span>
          </span>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            Satu Engine, Dioptimalkan untuk 6 Model Bisnis Spesifik
          </h2>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
            Tidak ada solusi "satu ukuran untuk semua". BoonTrack secara cerdas menyesuaikan alur bot WhatsApp dan formulir transaksi sesuai kategori industri Anda.
          </p>
        </div>

        {/* Tab Switcher Horizontal (Scrollable on mobile, pills on desktop) */}
        <div className="flex items-center justify-start lg:justify-center gap-2 overflow-x-auto pb-4 no-scrollbar scroll-smooth">
          {VERTICALS.map((item) => {
            const ItemIcon = item.icon;
            const isActive = item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setChatFeedback(null);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-600/25 border border-indigo-400/40 scale-[1.02]'
                    : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800/80'
                }`}
              >
                <ItemIcon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.name}</span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {item.badge}
                </span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Panel Content (2 Columns: Feature Deck + Live Chat Simulator) */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* Left Column: Feature Highlights (7 Cols) */}
          <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-xl backdrop-blur-xl">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                  <IconComponent className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs font-mono text-indigo-400 uppercase font-bold tracking-wider">
                    {activeVertical.badge}
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-white">
                    {activeVertical.tagline}
                  </h3>
                </div>
              </div>

              <p className="text-slate-300 text-sm leading-relaxed">
                {activeVertical.description}
              </p>

              <div className="space-y-3 pt-2">
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold block">
                  Fitur Otomatisasi Bawaan:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activeVertical.features.map((feature, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-start gap-2.5 text-xs text-slate-200"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 pt-5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-slate-400 font-mono">
                Model: <strong>{activeVertical.name.toUpperCase()}</strong> • 100% Zero-Config
              </span>
              <a
                href="#komparasi"
                className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 transition"
              >
                <span>Pelajari keunggulan vs marketplace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Right Column: Interactive WhatsApp Bot Flow Simulator (5 Cols) */}
          <div className="lg:col-span-5 bg-[#0C1317] border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col justify-between">
            {/* Simulator Header */}
            <div>
              <div className="bg-[#1F2C34] rounded-2xl p-3 flex items-center justify-between border border-slate-700/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-xs">
                    WA
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1">
                      <span>{activeVertical.botTitle}</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 text-slate-900" />
                    </div>
                    <div className="text-[10px] text-emerald-400 font-mono">Auto-Response AI Ready</div>
                  </div>
                </div>
                <span className="text-[9px] font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-400">
                  Seksi 8.5 Rule
                </span>
              </div>

              {/* Chat Simulation Area */}
              <div className="mt-4 space-y-3">
                {/* User Bubble */}
                <div className="flex justify-end">
                  <div className="bg-[#005C4B] text-slate-100 rounded-2xl rounded-tr-none px-3.5 py-2 text-xs max-w-[85%] shadow">
                    <p>{activeVertical.initialChat.user}</p>
                    <div className="text-[9px] text-emerald-200/70 text-right mt-1 font-mono">11:05</div>
                  </div>
                </div>

                {/* Bot Response Bubble */}
                <div className="flex justify-start">
                  <div className="bg-[#202C33] text-slate-100 rounded-2xl rounded-tl-none p-3.5 text-xs max-w-[92%] shadow space-y-2.5 border border-slate-700/50">
                    <p className="leading-relaxed">{activeVertical.initialChat.bot}</p>

                    {/* Quick Reply Buttons (Clickable Interactive) */}
                    <div className="pt-1 space-y-1.5">
                      <span className="text-[10px] text-slate-400 font-mono block">
                        Pilihan Interaktif Konsumen:
                      </span>
                      {activeVertical.initialChat.quickReplies.map((reply, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleQuickReplyClick(reply)}
                          className="w-full py-2 px-3 bg-[#2A3942] hover:bg-[#324450] active:scale-[0.98] border border-slate-600/50 rounded-xl text-left text-xs text-emerald-300 font-medium transition flex items-center justify-between cursor-pointer"
                        >
                          <span>{reply}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                        </button>
                      ))}
                    </div>

                    <div className="text-[9px] text-slate-400 text-right font-mono">11:05 • Bot Router Dinamis</div>
                  </div>
                </div>

                {/* Interactive Click Feedback Banner */}
                {chatFeedback && (
                  <div className="p-2.5 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-[11px] text-emerald-300 animate-in fade-in duration-200 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{chatFeedback}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Logic Guardrail Summary */}
            <div className="mt-4 p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-[10px] text-slate-400 font-mono leading-relaxed">
              <span className="text-amber-300 font-bold block mb-0.5">Aturan Alur Logika:</span>
              {activeVertical.initialChat.actionDetail}
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
