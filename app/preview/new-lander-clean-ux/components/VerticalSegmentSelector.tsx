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
  Sparkles,
  Zap,
  Check
} from 'lucide-react';
import Link from 'next/link';

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
    tagline: 'Multi-Kurir Reguler & Kurir Instan Otomatis',
    description: 'Cocok untuk toko pakaian, sepatu, kosmetik, dan barang fisik. Pembeli memilih varian, sistem menghitung ongkir otomatis, dan resi terbit tanpa input manual admin.',
    features: [
      'Multi-varian warna, ukuran, dan stok berkurang otomatis',
      'Multi-Kurir Reguler & Ekspedisi Instan radius kilometer otomatis',
      'Form alamat pengiriman presisi dengan auto-postal code',
      'Penerbitan label pengiriman dan resi otomatis via WhatsApp'
    ],
    botTitle: 'Bot Retail Toko Fisik',
    initialChat: {
      user: 'Halo, ada promo gamis basic size XL warna navy?',
      bot: 'Halo kak! Gamis Basic size XL Navy ready stok 12 pcs. Promo diskon 20% + Subsidi Ongkir otomatis aktif.',
      quickReplies: ['Cek Ongkir ke Kotaku', 'Pilih Varian Lain', 'Beli Sekarang (QRIS)'],
      actionDetail: 'Alur: Pembeli pilih varian -> Cek tarif multi-kurir otomatis -> Bayar QRIS -> Resi kurir dikirim otomatis.'
    }
  },
  {
    id: 'digital',
    name: 'Produk Digital',
    badge: 'E-Course & Template',
    icon: Download,
    tagline: 'Pengiriman Akses Instan Tanpa Biaya Cloud Hosting',
    description: 'Solusi tepat untuk creator e-book, video tutorial, preset, spreadsheet, dan software. Setelah bayar terverifikasi dalam hitungan detik, link unduh / akses otomatis terkirim.',
    features: [
      'Proteksi link unduh berbatas waktu (Time-limited download)',
      'Auto-generate kredensial akses member area tanpa input manual',
      'Kombinasi bundling produk digital dengan konsultasi 1-on-1',
      'Sinkronisasi instan ke Meta CAPI untuk optimasi ads ROAS'
    ],
    botTitle: 'Bot E-Course & Digital Assets',
    initialChat: {
      user: 'Mau beli E-Course Meta CAPI Mastery kak, bisa langsung akses?',
      bot: 'Bisa banget kak! Akses langsung aktif otomatis dalam hitungan detik setelah pembayaran terverifikasi oleh Reader APK.',
      quickReplies: ['Bayar via QRIS', 'Lihat Kurikulum Modul', 'Tanya Mentor'],
      actionDetail: 'Alur: Verifikasi QRIS dalam hitungan detik -> Kirim kredensial & link drive via WA -> Event Purchase terkirim ke Ads CAPI.'
    }
  },
  {
    id: 'kuliner',
    name: 'Kuliner & F&B',
    badge: 'Resto & Cloud Kitchen',
    icon: Utensils,
    tagline: 'Order Dine-In, Takeaway & Delivery Radius KM',
    description: 'Menu digital interaktif di atas meja atau pesan antar ke rumah. Menghilangkan antrean kasir dan ketergantungan potongan komisi ojek online.',
    features: [
      'Scan QR di meja resto untuk langsung pesan tanpa install aplikasi',
      'Integrasi ongkir delivery berbasis radius kilometer real-time',
      'Printer thermal kasir & dapur otomatis cetak tiket pesanan',
      'Laporan omzet harian per kategori menu makanan & minuman'
    ],
    botTitle: 'Bot Resto & Cloud Kitchen',
    initialChat: {
      user: 'Bisa pesan Ayam Bakar Madu 3 porsi antar ke Jl. Riau no 12?',
      bot: 'Siap kak! Estimasi jarak 2.4 km (Ongkir Rp 8.000). Total pesanan Rp 83.000. Dapur siap masak!',
      quickReplies: ['Konfirmasi Pesanan', 'Tambah Sambal Ekstra', 'Pilih Jam Antar'],
      actionDetail: 'Alur: Hitung radius km -> Terbitkan dynamic QRIS -> Cetak struk dapur -> Notifikasi kurir jalan.'
    }
  },
  {
    id: 'jasa',
    name: 'Jasa Lapangan',
    badge: 'Servis & Teknisi',
    icon: Wrench,
    tagline: 'Booking Jadwal Kunjungan & Dispatching Teknisi',
    description: 'Cocok untuk jasa servis AC, kuras toren, sedot WC, salon panggilan, dan teknisi listrik. Pelanggan memilih tanggal, jam, dan lokasi secara akurat.',
    features: [
      'Kalender booking real-time anti bentrok antar jadwal teknisi',
      'Kirim reminder otomatis ke WhatsApp pelanggan H-1 jam kedatangan',
      'Pembagian order otomatis ke teknisi terdekat berdasarkan zona',
      'Pembayaran DP di awal dan pelunasan di tempat setelah beres'
    ],
    botTitle: 'Bot Dispatching Jasa & Teknisi',
    initialChat: {
      user: 'Bisa booking cuci AC 2 unit untuk besok jam 10 pagi?',
      bot: 'Slot besok pukul 10:00 WIB tersedia kak! Teknisi Mas Doni siap meluncur ke lokasi Anda.',
      quickReplies: ['Kunci Jadwal (Isi Alamat)', 'Ubah Jam Booking', 'Cek Biaya Servis'],
      actionDetail: 'Alur: Kunci slot kalender -> Notifikasi WA ke teknisi -> Pembayaran DP -> Laporan pekerjaan selesai.'
    }
  },
  {
    id: 'profesional',
    name: 'Profesional & Konsultan',
    badge: 'Legal & Travel Umroh',
    icon: Briefcase,
    tagline: 'Invoice Bertingkat, DP Bertahap & Penjadwalan Konsultasi',
    description: 'Untuk kantor notaris, konsultan pajak, agensi marketing, biro perjalanan haji & umroh. Mengelola pembayaran termin (milestone) dengan kontrak resmi.',
    features: [
      'Penerbitan Invoice PDF resmi berlogo perusahaan otomatis via WA',
      'Sistem termin pembayaran (DP 30%, Termin 2 40%, Pelunasan 30%)',
      'Integrasi jadwal Google Meet / Zoom otomatis setelah pembayaran',
      'Pengarsipan dokumen bukti transaksi legal & akuntansi'
    ],
    botTitle: 'Bot Konsultan & Corporate Travel',
    initialChat: {
      user: 'Bisa jadwalkan konsultasi legal pendirian PT PMA minggu ini?',
      bot: 'Tentu. Tersedia sesi private via Zoom hari Kamis pukul 14:00 WIB bersama Senior Legal Counsel kami.',
      quickReplies: ['Pilih Sesi Konsultasi', 'Unduh Proposal Layanan', 'Ajukan Termin DP'],
      actionDetail: 'Alur: Pilih slot agenda -> Terbitkan invoice termin DP -> Kirim tautan video room -> Rekap perpajakan.'
    }
  },
  {
    id: 'creator',
    name: 'Kreator & Affiliate',
    badge: 'Affiliate & Makelar Luar',
    icon: Video,
    tagline: 'Bypass Checkout ke Shopee, TikTok, Mayar & Sejoli',
    description: 'Maksimalkan komisi affiliate konten kreator. Etalase produk affiliate langsung mengarahkan pembeli ke link mitra tanpa keranjang belanja yang memperlambat alur.',
    features: [
      'Bypass checkout langsung ke link eksternal (Shopee/TikTok/Sejoli)',
      'Trigger event Meta Pixel InitiateCheckout otomatis saat tombol diklik',
      'Custom label tombol CTA dinamis (e.g. Akses Sekarang, Beli di Shopee)',
      'Dukungan harga Rp0 untuk lead magnet gratis & katalog rekomendasi'
    ],
    botTitle: 'Bot Kreator & Affiliate Engine',
    initialChat: {
      user: 'Kak, spill link outfit kemeja linen yang dipakai di video TikTok!',
      bot: 'Ini kak kemeja linen premiumnya! Lagi ada diskon 40% di etalase rekomendasi saya.',
      quickReplies: ['Beli di Shopee (Diskon 40%)', 'Lihat Koleksi Celana', 'Join VIP Telegram'],
      actionDetail: 'Alur: Klik CTA -> Trigger InitiateCheckout Pixel -> Direct redirect ke link affiliate eksternal.'
    }
  }
];

interface VerticalSegmentSelectorProps {
  referralCode?: string;
}

export default function VerticalSegmentSelector({ referralCode }: VerticalSegmentSelectorProps) {
  const [activeTab, setActiveTab] = useState<string>('fisik');
  const activeVertical = VERTICALS.find((v) => v.id === activeTab) || VERTICALS[0];

  const registerHref = referralCode ? `/register?ref=${encodeURIComponent(referralCode)}` : '/register';

  return (
    <section id="vertikal" className="py-20 bg-white border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold tracking-wide">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Fleksibilitas Tanpa Batas</span>
          </span>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-950 tracking-tight">
            Satu Sistem. 6 Model Bisnis Vertikal Berjalan Otomatis.
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Tidak ada hardcoding. BoonTrack Shop secara dinamis menyesuaikan alur pemesanan, verifikasi pembayaran, dan perpesanan WhatsApp sesuai jenis industri Anda.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center justify-start sm:justify-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {VERTICALS.map((vertical) => {
            const Icon = vertical.icon;
            const isActive = activeTab === vertical.id;
            return (
              <button
                key={vertical.id}
                type="button"
                onClick={() => setActiveTab(vertical.id)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 scale-105'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{vertical.name}</span>
              </button>
            );
          })}
        </div>

        {/* Active Vertical Showcase (Dual Panel) */}
        <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-lg shadow-slate-200/50 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Kiri: Deskripsi & Fitur Utama */}
          <div className="lg:col-span-7 space-y-5">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black uppercase tracking-wider">
                {activeVertical.badge}
              </span>
              <span className="text-xs font-bold text-slate-400 font-mono">
                {activeVertical.tagline}
              </span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-black text-slate-950 leading-tight">
              Otomasi Penuh untuk Industri {activeVertical.name}
            </h3>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {activeVertical.description}
            </p>

            {/* Checklist Fitur */}
            <div className="space-y-2.5 pt-2">
              {activeVertical.features.map((feature, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-800 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            <div className="pt-4 flex items-center gap-4">
              <Link
                href={registerHref}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2 cursor-pointer"
              >
                <span>Buka Toko {activeVertical.name} Gratis</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Kanan: Simulasi Chat WhatsApp untuk Vertikal Ini */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-4 shadow-md flex flex-col justify-between">
            {/* Phone Header */}
            <div className="bg-[#008069] rounded-2xl p-3 flex items-center justify-between text-white mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-white text-[#008069] flex items-center justify-center font-black text-[11px]">
                  BT
                </div>
                <div>
                  <div className="text-xs font-bold">{activeVertical.botTitle}</div>
                  <div className="text-[9px] text-emerald-100 font-mono">online • auto responder</div>
                </div>
              </div>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono font-semibold">
                Skenario Alur
              </span>
            </div>

            {/* Chat Messages */}
            <div className="bg-[#EFEAE2] rounded-2xl p-3 space-y-3 border border-slate-200">
              {/* Buyer */}
              <div className="flex justify-end">
                <div className="bg-white text-slate-800 rounded-2xl rounded-tr-none px-3.5 py-2 text-xs max-w-[88%] shadow-xs">
                  <p>{activeVertical.initialChat.user}</p>
                  <div className="text-[9px] text-slate-400 text-right mt-1 font-mono">11:05</div>
                </div>
              </div>

              {/* Bot */}
              <div className="flex justify-start">
                <div className="bg-[#D9FDD3] text-slate-800 rounded-2xl rounded-tl-none p-3 text-xs max-w-[92%] shadow-xs space-y-2 border border-emerald-200">
                  <p className="leading-snug">{activeVertical.initialChat.bot}</p>
                  
                  {/* Quick Replies Buttons */}
                  <div className="space-y-1 pt-1">
                    {activeVertical.initialChat.quickReplies.map((reply, rIdx) => (
                      <div
                        key={rIdx}
                        className="bg-white hover:bg-slate-50 text-blue-700 font-bold text-[11px] py-1.5 px-3 rounded-lg border border-slate-200 text-center shadow-xs cursor-pointer"
                      >
                        {reply}
                      </div>
                    ))}
                  </div>

                  <div className="text-[9px] text-slate-400 text-right font-mono">11:05 • Dijawab Otomatis</div>
                </div>
              </div>
            </div>

            {/* Alur Keterangan Box */}
            {activeVertical.initialChat.actionDetail && (
              <div className="mt-3 p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 font-medium">
                <span className="font-bold">Alur Sistem: </span>
                <span>{activeVertical.initialChat.actionDetail}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
