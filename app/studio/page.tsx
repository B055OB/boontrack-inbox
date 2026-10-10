'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  ArrowRight,
  Film,
  Zap,
  CheckCircle2,
  Sliders,
  Smartphone,
  ChevronRight,
  ShieldCheck,
  Check,
  Flame,
  Layers,
  Cpu,
  LogIn,
  Play,
  RotateCcw,
  Eye,
  EyeOff,
  Video,
  Volume2,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  Music,
  HelpCircle,
  ChevronDown,
  UserCheck,
  Compass,
  Download,
  Copy,
  Wrench,
  ShoppingBag,
  Clock,
  Send,
  SplitSquareVertical
} from 'lucide-react';
import {
  STUDIO_TOKEN_PACKAGES,
  StudioPackageId
} from '@/lib/config/studio-pricing';

// Contoh Variasi Pembuka (Hook) & Konten Manusiawi
const CONTOH_KONTEN = {
  video_otomatis: [
    {
      id: 'auto-1',
      kategori: 'Promosi Produk Kilat',
      judul: 'Pembuka 1: Pola Interupsi Penasaran',
      kalimatHook: 'Stop scrolling! Jangan beli serum ini sebelum tahu 3 alasannya!',
      stikerLayar: 'STOP SCROLLING! JANGAN BELI INI DULU! 🛑',
      suasana: 'Video produk estetik dengan teks stiker tajam di area aman pandangan.',
      cocokUntuk: 'Flash sale, diskon hari ini, peluncuran varian baru',
    },
    {
      id: 'auto-2',
      kategori: 'Masalah & Solusi',
      judul: 'Pembuka 2: Keluhan Sehari-Hari',
      kalimatHook: 'Capek tiap ngaca flek makin tebal padahal udah beli skincare mahal?',
      stikerLayar: 'FLEK MAKIN TEBAL PADAHAL UDAH RUTINAN? 😩',
      suasana: 'Tampilan visual masalah konsumen diikuti pembuktian hasil sebelum-sesudah.',
      cocokUntuk: 'Produk solusi, herbal, perawatan wajah, suplemen',
    },
    {
      id: 'auto-3',
      kategori: 'Tawaran Langsung',
      judul: 'Pembuka 3: Bukti Kepuasan Pembeli',
      kalimatHook: 'Pantesan laku ribuan botol seminggu, rahasianya ada di formula ini!',
      stikerLayar: 'PANTESAN LAKU RATUSAN PAKET TIAP HARI! 🔥',
      suasana: 'Tumpukan resi pengiriman dan unboxing cepat meyakinkan calon pembeli.',
      cocokUntuk: 'Toko online, reseller, hampers, fashion',
    },
  ],
  naskah_asli: [
    {
      id: 'naskah-1',
      kategori: 'Jasa Nyata & Aksi Lapangan',
      judul: 'Jasa Kuras Toren & Servis Rumah Tangga',
      kalimatHook: 'Jangan kaget ya kalau air di rumah Anda ternyata asalnya dari toren sekotor ini!',
      stikerLayar: 'YAKIN AIR MANDI KAMU SUDAH BERSIH? 😱',
      suasana: 'Talent tukang kuras toren merekam langsung endapan lumpur di dasar toren lalu menunjukkan hasil kinclong.',
      adegan1: 'Kamera menyorot wajah teknisi dengan senyum sopan di depan rumah pelanggan.',
      adegan2: 'Kamera diarahkan ke dalam toren: perlihatkan air keruh dan kerak tebal.',
      adegan3: 'Proses cuci bertekanan tinggi sampai dasar toren mengkilap kembali.',
      adegan4: 'Ajakan ramah: "Cek toren Anda sekarang, booking jadwal kuras lewat nomor di bio!"',
      alasanSukses: 'Manusiawi, bukti nyata di depan mata, tanpa rekayasa komputer kaku.',
    },
    {
      id: 'naskah-2',
      kategori: 'Testimoni Jujur Pelanggan',
      judul: 'Testimoni Nyata Pemakaian Produk Kuliner/Herbal',
      kalimatHook: 'Awalnya suami saya nggak percaya, sampai coba sendiri sendok pertama...',
      stikerLayar: 'JUJUR, AWALNYA NGGAK PERCAYA SAMPAI COBA SENDIRI 🍲',
      suasana: 'Ibu rumah tangga bicara santai di dapur sambil menyiapkan santapan hangat.',
      adegan1: 'Talent duduk santai di meja makan memegang toples bumbu masakan.',
      adegan2: 'Wajah anak dan suami makan lahap tanpa sisa di piring.',
      adegan3: 'Close-up tekstur bumbu asli tanpa pengawet.',
      adegan4: 'Rekomendasi jujur: "Ibu-ibu wajib punya stok ini di kulkas, hemat waktu masak 20 menit."',
      alasanSukses: 'Rasa percaya terbangun karena orang membeli dari rekomendasi sesama manusia.',
    },
    {
      id: 'naskah-3',
      kategori: 'Edukasi Praktis & Tutorial',
      judul: 'Unboxing & Review Solusi Masalah Toko',
      kalimatHook: 'Sering nombok ongkir karena packingan rusak di jalan? Ini triknya.',
      stikerLayar: 'RAHASIA PACKING AMAN TANPA NOMBOK ONGKIR 📦',
      suasana: 'Owner toko online memperagakan cara kemas barang rentan pecah dengan cepat.',
      adegan1: 'Tunjukkan dus packing dan bubble wrap tebal dengan stiker fragile.',
      adegan2: 'Demonstrasi lakban rapi dan timbangan pas.',
      adegan3: 'Hasil paket kokoh siap dijemput kurir ekspedisi.',
      adegan4: 'Tutup dengan ajakan bertindak jelas untuk order kebutuhan toko.',
      alasanSukses: 'Memberi nilai edukasi dulu, baru menawarkan solusi produk.',
    },
  ],
};

const FAQS = [
  {
    q: 'Apa yang dimaksud dengan Coba Gratis 1 Video?',
    a: 'Setiap akun Studio baru yang mendaftar langsung mendapatkan 1 Kredit Video gratis. Anda dapat langsung menggunakannya untuk menghasilkan 1 video iklan beresolusi 1080p Full HD tanpa watermark, atau membuat panduan naskah syuting asli yang terstruktur.',
  },
  {
    q: 'Mengapa BoonTrack membedakan Mode Video Otomatis dan Mode Panduan Naskah Asli?',
    a: 'Karena tidak semua jenis bisnis cocok dengan video komputer kaku. Untuk produk fisik yang butuh variasi promo cepat, Mode Video Otomatis sangat efisien. Namun untuk jasa nyata (seperti kuras toren, servis AC, sedot WC) atau testimoni jujur, calon pembeli jauh lebih percaya melihat wajah manusia asli. BoonTrack menyediakan keduanya agar konversi Anda maksimal.',
  },
  {
    q: 'Apakah saya perlu jago mengedit video layaknya Canva atau CapCut?',
    a: 'Sama sekali tidak. BoonTrack dirancang dengan konsep No-Timeline Editor (tanpa garis waktu rumit). Anda cukup memilih rentang tren, tipe eksekusi, dan sistem langsung menyusun hasil video atau urutan adegan yang siap dipakai.',
  },
  {
    q: 'Apakah video yang dihasilkan memiliki watermark (tanda air)?',
    a: 'Tidak ada watermark sama sekali. Semua video yang diunduh beresolusi bersih 1080p Full HD dan langsung aman diunggah ke TikTok Ads, Instagram Reels, Shopee Video, maupun YouTube Shorts.',
  },
  {
    q: 'Bagaimana cara pembayaran jika token saya habis?',
    a: 'Pembayaran dilakukan instan menggunakan QRIS Instan (bisa scan dari aplikasi m-banking atau e-wallet apa saja: GoPay, OVO, ShopeePay, DANA, BCA, Mandiri, BRI). Tidak ada sistem langganan paksa yang memotong saldo otomatis.',
  },
];

export default function StudioLandingPage() {
  const router = useRouter();

  // Auth Redirect: Jika pengguna sudah login, alihkan langsung ke desk workspace
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cookieMatch = document.cookie.match(/(?:merchant_store|merchant_session|bt_tenant|studio_session)=([^;]+)/);
      const cookieVal = cookieMatch ? decodeURIComponent(cookieMatch[1]).replace(/^["']|["']$/g, '').trim() : '';
      const localVal = (
        localStorage.getItem('merchant_store') ||
        localStorage.getItem('merchant_session') ||
        localStorage.getItem('bt_tenant') ||
        ''
      ).replace(/^["']|["']$/g, '').trim();
      const localSession = localStorage.getItem('studio_session');

      const resolved = (localVal || cookieVal || '').toLowerCase();
      const hasAuth = Boolean(
        (resolved && resolved !== 'null' && resolved !== 'undefined') ||
        localSession
      );

      if (hasAuth) {
        const isStudioSubdomain = window.location.hostname.startsWith('studio.') || window.location.hostname === 'studio.boontrack.com';
        if (isStudioSubdomain) {
          window.location.href = '/desk';
        } else {
          router.replace('/studio/desk');
        }
      }
    }
  }, [router]);

  // State Demonstrasi Interaktif
  const [activeMode, setActiveMode] = useState<'video_otomatis' | 'naskah_asli'>('video_otomatis');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSafeZone, setShowSafeZone] = useState(true);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [copiedCaption, setCopiedCaption] = useState(false);

  const currentAuto = CONTOH_KONTEN.video_otomatis[selectedIndex % CONTOH_KONTEN.video_otomatis.length];
  const currentNaskah = CONTOH_KONTEN.naskah_asli[selectedIndex % CONTOH_KONTEN.naskah_asli.length];

  return (
    <div className="min-h-screen bg-[#0B0F17] text-white selection:bg-fuchsia-500 selection:text-white font-sans relative overflow-x-hidden flex flex-col">
      {/* Dynamic Background Studio Glow Mesh */}
      <div className="absolute top-0 right-1/4 w-[850px] h-[550px] bg-gradient-to-b from-fuchsia-600/20 via-purple-600/12 to-transparent blur-[160px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 left-0 w-[500px] h-[500px] bg-indigo-600/15 rounded-full blur-[150px] pointer-events-none -z-10" />
      <div className="absolute bottom-1/4 right-0 w-[600px] h-[600px] bg-purple-700/10 rounded-full blur-[160px] pointer-events-none -z-10" />

      {/* ── 1. NAVBAR HEADER ─────────────────────────────────────── */}
      <header className="border-b border-white/10 bg-[#0B0F17]/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          {/* Logo & Identitas Studio */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative w-9 h-9 rounded-xl overflow-hidden p-[1px] bg-gradient-to-tr from-fuchsia-500 via-pink-500 to-purple-600 shadow-lg shadow-fuchsia-500/25 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-[#0B0F17] rounded-[11px] flex items-center justify-center overflow-hidden">
                <Film className="w-4 h-4 text-fuchsia-400" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-extrabold text-lg tracking-tight text-white">boontrack</span>
              <span className="text-xs font-black tracking-widest bg-gradient-to-r from-fuchsia-400 via-pink-400 to-purple-400 bg-clip-text text-transparent uppercase">
                STUDIO
              </span>
            </div>
          </Link>

          {/* Navigasi Desktop */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-zinc-300">
            <a href="#contoh-video" className="hover:text-white transition-colors">
              Contoh Video Asli
            </a>
            <a href="#alur-kerja" className="hover:text-white transition-colors">
              Alur 5 Langkah
            </a>
            <a href="#pricing" className="hover:text-white transition-colors">
              Paket Harga
            </a>
            <a href="#faq" className="hover:text-white transition-colors">
              FAQ
            </a>
          </nav>

          {/* Tombol Aksi Navbar */}
          <div className="flex items-center gap-3">
            {/* Tombol Masuk / Login */}
            <Link
              href="/login?redirectTo=/desk"
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5 text-zinc-400" />
              <span>Masuk / Login</span>
            </Link>

            {/* Primary CTA */}
            <Link
              href="/studio/register"
              className="px-4 py-2 rounded-xl text-xs font-black tracking-wide bg-gradient-to-r from-fuchsia-600 via-pink-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white shadow-lg shadow-fuchsia-600/30 transition-all flex items-center gap-1.5 active:scale-95 hover:shadow-fuchsia-500/50"
            >
              <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
              <span>Coba Gratis 1 Video →</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── 2. HERO SECTION (SESUAI INSTRUKSI COPYWRITING RESMI) ─── */}
      <section className="pt-14 pb-16 sm:pt-20 sm:pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center space-y-8 relative">
        {/* 1. Badge Atas */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-fuchsia-500/15 via-purple-500/15 to-indigo-500/15 border border-fuchsia-500/30 text-xs font-bold text-fuchsia-300 shadow-sm animate-pulse">
          <span>✨ Video Iklan & Konten Alami yang Terbukti Laku</span>
        </div>

        {/* 2. Headline Utama (H1) & 3. Sub-headline */}
        <div className="space-y-4 max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15]">
            Bikin Video Iklan yang Kelihatan Alami,{' '}
            <span className="bg-gradient-to-r from-fuchsia-400 via-pink-400 to-amber-300 bg-clip-text text-transparent">
              Bukan Kaku Seperti Robot.
            </span>
          </h1>
          <p className="text-sm sm:text-lg text-zinc-300 max-w-3xl mx-auto leading-relaxed">
            Tak semua video bisa dibuat full komputer. Dari testimoni pemakaian produk sampai aksi nyata seperti jasa servis & kuras toren—orang lebih percaya video manusia asli. BoonTrack bantu Anda meracik naskah alami dan menghasilkan variasi pembuka video dalam hitungan menit.
          </p>
        </div>

        {/* 4. Tombol CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 max-w-md mx-auto pt-2">
          <Link
            href="/studio/register"
            className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-gradient-to-r from-fuchsia-600 via-pink-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-black text-sm shadow-xl shadow-fuchsia-600/40 hover:shadow-fuchsia-600/60 transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            <span>Coba Gratis 1 Video →</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <a
            href="#contoh-video"
            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold text-sm border border-white/10 transition flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4 text-fuchsia-400 fill-fuchsia-400" />
            <span>▷ Lihat Contoh Video Asli</span>
          </a>
        </div>

        {/* Subtext Garansi */}
        <p className="text-[11px] sm:text-xs text-zinc-400 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Langsung aktif via WhatsApp • Tanpa kartu kredit • 100% Bebas Watermark</span>
        </p>

        {/* 5. Poin Nilai (4 Grid di Bawah Hero) */}
        <div className="pt-8 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto text-left">
          {/* Grid 1 */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1 hover:border-fuchsia-500/30 transition">
            <span className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-fuchsia-400 shrink-0" />
              <span>📱 Pas di Layar HP</span>
            </span>
            <p className="text-[11px] text-zinc-400 leading-snug">
              Aman dari tombol TikTok & Reels
            </p>
          </div>

          {/* Grid 2 */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1 hover:border-purple-500/30 transition">
            <span className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
              <SplitSquareVertical className="w-4 h-4 text-purple-400 shrink-0" />
              <span>⚡ 1 Ide Jadi 6 Variasi</span>
            </span>
            <p className="text-[11px] text-zinc-400 leading-snug">
              Mudah uji coba materi iklan
            </p>
          </div>

          {/* Grid 3 */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1 hover:border-indigo-500/30 transition">
            <span className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
              <Film className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>🎬 Video Bersih 1080p</span>
            </span>
            <p className="text-[11px] text-zinc-400 leading-snug">
              Kualitas tajam tanpa watermark
            </p>
          </div>

          {/* Grid 4 */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1 hover:border-emerald-500/30 transition">
            <span className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>💳 Bayar Praktis QRIS</span>
            </span>
            <p className="text-[11px] text-zinc-400 leading-snug">
              Mulai 49rb tanpa langganan paksa
            </p>
          </div>
        </div>
      </section>

      {/* ── 3. SECTION CONTOH VIDEO ASLI & PRATINJAU INTERAKTIF ─── */}
      <section id="contoh-video" className="py-16 sm:py-20 bg-[#0F1422] border-y border-white/10 scroll-mt-20 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Section Header */}
          <div className="text-center space-y-3 max-w-3xl mx-auto">
            <span className="text-xs font-bold uppercase tracking-widest text-fuchsia-400">
              Dua Pendekatan Konten yang Efektif
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Pilih Gaya Konten yang Tepat untuk Bisnis Anda
            </h2>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              Bandingkan <strong>Mode Video Otomatis</strong> untuk promosi kilat dengan <strong>Mode Panduan Naskah Asli</strong> untuk aksi nyata lapangan & testimoni yang meyakinkan.
            </p>

            {/* Mode Switcher Tabs */}
            <div className="inline-flex p-1.5 rounded-2xl bg-black/40 border border-white/10 gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setActiveMode('video_otomatis');
                  setSelectedIndex(0);
                }}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  activeMode === 'video_otomatis'
                    ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span>Mode Video Otomatis</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveMode('naskah_asli');
                  setSelectedIndex(0);
                }}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  activeMode === 'naskah_asli'
                    ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Mode Panduan Naskah Asli (Manusiawi)</span>
              </button>
            </div>
          </div>

          {/* Interactive Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Card Selector List (7 Cols) */}
            <div className="lg:col-span-7 space-y-4">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                {activeMode === 'video_otomatis'
                  ? 'Pilihan Pembuka Video Otomatis (3 Detik Awal):'
                  : 'Contoh Skenario Konten Nyata di Lapangan:'}
              </span>

              <div className="space-y-3">
                {activeMode === 'video_otomatis' ? (
                  CONTOH_KONTEN.video_otomatis.map((item, idx) => {
                    const isSelected = selectedIndex === idx;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedIndex(idx)}
                        className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer relative ${
                          isSelected
                            ? 'bg-gradient-to-r from-fuchsia-950/50 via-purple-950/30 to-transparent border-fuchsia-500/60 shadow-lg shadow-fuchsia-500/10'
                            : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                              {item.kategori}
                            </span>
                            <h3 className="text-sm sm:text-base font-bold text-white pt-1">
                              {item.judul}
                            </h3>
                            <p className="text-xs text-zinc-300 font-mono italic">
                              "{item.kalimatHook}"
                            </p>
                          </div>
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center border shrink-0 transition ${
                              isSelected
                                ? 'bg-fuchsia-500 text-white border-fuchsia-400'
                                : 'border-white/20 text-transparent'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        </div>

                        {isSelected && (
                          <div className="mt-3 pt-3 border-t border-fuchsia-500/20 text-[11px] text-zinc-400 flex items-center justify-between">
                            <span><strong>Target:</strong> {item.cocokUntuk}</span>
                            <span className="text-emerald-400 font-mono">1080p MP4 Siap Unduh</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  CONTOH_KONTEN.naskah_asli.map((item, idx) => {
                    const isSelected = selectedIndex === idx;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedIndex(idx)}
                        className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer relative ${
                          isSelected
                            ? 'bg-gradient-to-r from-purple-950/50 via-indigo-950/30 to-transparent border-purple-500/60 shadow-lg shadow-purple-500/10'
                            : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                {item.kategori}
                              </span>
                              <span className="text-[10px] text-emerald-400 font-mono font-bold">
                                ✓ Tanpa Script Robot
                              </span>
                            </div>
                            <h3 className="text-sm sm:text-base font-bold text-white">
                              {item.judul}
                            </h3>
                            <p className="text-xs text-zinc-300 italic">
                              "{item.kalimatHook}"
                            </p>
                          </div>

                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center border shrink-0 transition ${
                              isSelected
                                ? 'bg-purple-500 text-white border-purple-400'
                                : 'border-white/20 text-transparent'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        </div>

                        {isSelected && (
                          <div className="mt-3 pt-3 border-t border-purple-500/20 text-[11px] text-zinc-300 space-y-1.5">
                            <div className="space-y-1 text-slate-300">
                              <p><strong>1. Adegan Awal:</strong> {item.adegan1}</p>
                              <p><strong>2. Sorot Bukti:</strong> {item.adegan2}</p>
                              <p><strong>3. Proses Nyata:</strong> {item.adegan3}</p>
                              <p><strong>4. Ajakan Lembut:</strong> {item.adegan4}</p>
                            </div>
                            <p className="text-[10px] text-purple-300 pt-1 font-mono">
                              💡 <strong>Kenapa laku:</strong> {item.alasanSukses}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Safe-Zone Toggle Controls */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-fuchsia-400" />
                    <span>Panduan Safe-Zone TikTok & Reels (9:16)</span>
                  </span>
                  <p className="text-[11px] text-zinc-400">
                    Memastikan teks judul tidak tertabrak tombol Love, Komen, atau Caption akun Anda.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSafeZone(!showSafeZone)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    showSafeZone
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                      : 'bg-white/10 text-zinc-400 border border-white/10 hover:text-white'
                  }`}
                >
                  {showSafeZone ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>Safe-Zone: {showSafeZone ? 'AKTIF' : 'NONAKTIF'}</span>
                </button>
              </div>
            </div>

            {/* Right: Phone Simulator Canvas 9:16 (5 Cols) */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="relative w-[280px] sm:w-[320px] aspect-[9/16] rounded-[36px] bg-black border-4 border-zinc-700 shadow-2xl shadow-fuchsia-950/40 overflow-hidden flex flex-col justify-between select-none">
                {/* Notch */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-4 bg-zinc-900 rounded-full z-40 border border-zinc-800" />

                {/* Video Scene Content */}
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-fuchsia-500/30 to-purple-600/30 border border-fuchsia-500/40 flex items-center justify-center text-fuchsia-400 mb-4 animate-bounce">
                    {activeMode === 'video_otomatis' ? <Video className="w-8 h-8" /> : <UserCheck className="w-8 h-8" />}
                  </div>

                  <p className="text-[11px] text-zinc-300 max-w-[200px] leading-relaxed">
                    {activeMode === 'video_otomatis'
                      ? currentAuto.suasana
                      : currentNaskah.suasana}
                  </p>

                  {/* Equalizer animation */}
                  <div className="flex items-center gap-1 mt-4">
                    <span className="w-1 h-3 bg-fuchsia-400 rounded-full animate-pulse" />
                    <span className="w-1 h-6 bg-pink-400 rounded-full animate-pulse delay-75" />
                    <span className="w-1 h-4 bg-purple-400 rounded-full animate-pulse delay-150" />
                    <span className="w-1 h-8 bg-indigo-400 rounded-full animate-pulse delay-100" />
                    <span className="w-1 h-5 bg-fuchsia-400 rounded-full animate-pulse delay-200" />
                  </div>
                </div>

                {/* Stiker Hook / Teks Layar */}
                <div className="relative z-30 pt-16 px-6 text-center">
                  <div className="inline-block p-2.5 rounded-xl bg-amber-400 text-slate-950 font-black text-xs sm:text-sm tracking-tight shadow-xl shadow-amber-500/20 rotate-[-1deg] animate-in zoom-in-95 duration-200">
                    {activeMode === 'video_otomatis' ? currentAuto.stikerLayar : currentNaskah.stikerLayar}
                  </div>
                </div>

                {/* Tombol Interaksi Samping Kanan */}
                <div className="absolute right-3 bottom-24 z-30 flex flex-col items-center gap-3.5">
                  <div className="flex flex-col items-center">
                    <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10">
                      <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                    </div>
                    <span className="text-[9px] font-mono text-white mt-0.5">38.2k</span>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10">
                      <MessageCircle className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-[9px] font-mono text-white mt-0.5">2.4k</span>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10">
                      <Bookmark className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-[9px] font-mono text-white mt-0.5">14.1k</span>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10">
                      <Share2 className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-[9px] font-mono text-white mt-0.5">Share</span>
                  </div>

                  {/* Piringan Musik */}
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-fuchsia-500 to-purple-600 p-0.5 animate-spin">
                    <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                      <Music className="w-3.5 h-3.5 text-white" />
                    </div>
                  </div>
                </div>

                {/* Caption Bawah */}
                <div className="relative z-30 p-4 space-y-1.5 bg-gradient-to-t from-black via-black/80 to-transparent">
                  <span className="text-[11px] font-bold text-white block">@bisnis_asli_anda</span>
                  <p className="text-[10px] text-zinc-300 line-clamp-2">
                    {activeMode === 'video_otomatis' ? currentAuto.kalimatHook : currentNaskah.kalimatHook} Hubungi kontak kami sekarang untuk konsultasi gratis!
                  </p>
                  <div className="pt-1 flex items-center gap-1.5 text-[9px] text-zinc-400">
                    <Music className="w-3 h-3 text-fuchsia-400" />
                    <span className="truncate">Suara Asli - Konten Manusiawi Terpercaya</span>
                  </div>
                </div>

                {/* Safe-Zone Guide Overlay */}
                {showSafeZone && (
                  <div className="absolute inset-0 pointer-events-none z-30 border-2 border-emerald-400/60 rounded-[32px] m-2 flex flex-col justify-between p-2">
                    <div className="flex justify-between items-center text-[9px] font-mono text-emerald-400 bg-black/60 px-2 py-0.5 rounded-full self-start">
                      <span>✓ 9:16 Safe-Zone Bounds</span>
                    </div>
                    <div className="text-[9px] font-mono text-emerald-300 bg-black/70 px-2 py-0.5 rounded-md self-center text-center">
                      Area Bebas Tabrakan Tombol Medsos
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. ALUR KERJA 5 LANGKAH TERARAH (NO-TIMELINE EDITOR) ─── */}
      <section id="alur-kerja" className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-12 scroll-mt-20">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-widest text-fuchsia-400">
            Sistem Bebas Ribet Tanpa Garis Waktu
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            Alur 5 Langkah Pembuatan Konten Terarah
          </h2>
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
            Tinggalkan pusingnya mengedit garis waktu rumit di Canva atau CapCut. Ikuti 5 langkah terarah untuk menghasilkan video siap tayang dan materi iklan split-test.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Langkah 1 */}
          <div className="p-5 rounded-2xl bg-[#111624] border border-white/10 space-y-3 flex flex-col justify-between hover:border-fuchsia-500/40 transition">
            <div className="space-y-3">
              <div className="w-8 h-8 rounded-xl bg-fuchsia-500/20 text-fuchsia-400 font-black text-xs flex items-center justify-center border border-fuchsia-500/30">
                1
              </div>
              <h3 className="text-sm font-bold text-white">Riset Tren Produk</h3>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Pilih rentang waktu (24 jam/7 hari) & kategori bisnis Anda, atau langsung ambil barang dari katalog toko.
              </p>
            </div>
            <span className="text-[10px] text-fuchsia-400 font-mono">🔍 Temukan Sudut Hook</span>
          </div>

          {/* Langkah 2 */}
          <div className="p-5 rounded-2xl bg-[#111624] border border-white/10 space-y-3 flex flex-col justify-between hover:border-purple-500/40 transition">
            <div className="space-y-3">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 font-black text-xs flex items-center justify-center border border-purple-500/30">
                2
              </div>
              <h3 className="text-sm font-bold text-white">Pilih Tipe Eksekusi</h3>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Tentukan format: "Bikin Video Otomatis" untuk produk instan atau "Bikin Panduan Rekam Asli" untuk aksi lapangan.
              </p>
            </div>
            <span className="text-[10px] text-purple-400 font-mono">⚡ 2 Tombol Praktis</span>
          </div>

          {/* Langkah 3 */}
          <div className="p-5 rounded-2xl bg-[#111624] border border-white/10 space-y-3 flex flex-col justify-between hover:border-indigo-500/40 transition">
            <div className="space-y-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 font-black text-xs flex items-center justify-center border border-indigo-500/30">
                3
              </div>
              <h3 className="text-sm font-bold text-white">Layar Hasil Jadi</h3>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Tanpa repot timeline. Video otomatis langsung siap unduh MP4 vertikal atau naskah panduan adegan siap baca.
              </p>
            </div>
            <span className="text-[10px] text-indigo-400 font-mono">🎬 Langsung Siap Pakai</span>
          </div>

          {/* Langkah 4 */}
          <div className="p-5 rounded-2xl bg-[#111624] border border-white/10 space-y-3 flex flex-col justify-between hover:border-emerald-500/40 transition">
            <div className="space-y-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 font-black text-xs flex items-center justify-center border border-emerald-500/30">
                4
              </div>
              <h3 className="text-sm font-bold text-white">Distribusi Medsos</h3>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Salin teks caption dan rekomendasi hashtag sekali klik, siap posting ke TikTok, IG Reels, Shopee Video, & Shorts.
              </p>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono">📲 1 Klik Salin Caption</span>
          </div>

          {/* Langkah 5 */}
          <div className="p-5 rounded-2xl bg-[#111624] border border-white/10 space-y-3 flex flex-col justify-between hover:border-amber-500/40 transition">
            <div className="space-y-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 font-black text-xs flex items-center justify-center border border-amber-500/30">
                5
              </div>
              <h3 className="text-sm font-bold text-white">Paket Bahan Iklan</h3>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Ekspor paket variasi hook pembuka untuk bahan split-test materi iklan di TikTok Ads & Meta Ads tanpa boncos.
              </p>
            </div>
            <span className="text-[10px] text-amber-400 font-mono">🎯 Uji Materi Iklan</span>
          </div>
        </div>
      </section>

      {/* ── 5. SECTION PAKET HARGA (PEMBAYARAN QRIS INSTAN) ──────── */}
      <section id="pricing" className="py-16 sm:py-24 bg-[#0F1422] border-y border-white/10 scroll-mt-20 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Section Header */}
          <div className="text-center space-y-3 max-w-3xl mx-auto">
            <span className="text-xs font-bold uppercase tracking-widest text-fuchsia-400">
              Biaya Transparan & Fleksibel
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Pilihan Paket Token Studio — Pembayaran QRIS Instan
            </h2>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              Mulai 49rb tanpa langganan paksa. Beli token sesuai kebutuhan produksi video atau ambil paket bulanan hemat.
            </p>
          </div>

          {/* Free Trial Spotlight Banner */}
          <div className="max-w-3xl mx-auto p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-fuchsia-950/60 via-purple-950/40 to-indigo-950/40 border border-fuchsia-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-center sm:text-left">
            <div className="space-y-1">
              <span className="text-xs font-black text-yellow-300 flex items-center justify-center sm:justify-start gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                <span>Pengguna Baru? Dapatkan 1 Koin Trial Gratis!</span>
              </span>
              <p className="text-xs text-zinc-300">
                Daftar akun sekarang dan nikmati 1 video resolusi penuh 1080p tanpa watermark atau panduan naskah asli gratis.
              </p>
            </div>

            <Link
              href="/studio/register"
              className="px-5 py-2.5 rounded-xl bg-white text-slate-950 hover:bg-zinc-100 font-black text-xs shrink-0 shadow-md transition"
            >
              Coba Gratis 1 Video →
            </Link>
          </div>

          {/* 3 Pricing Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto items-stretch">
            {/* Package 1: Starter */}
            {(() => {
              const pkg = STUDIO_TOKEN_PACKAGES.starter;
              return (
                <div className="p-7 rounded-3xl bg-[#111624] border border-white/10 flex flex-col justify-between space-y-6 hover:border-white/20 transition relative">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold text-white">{pkg.name}</h3>
                      <p className="text-xs text-zinc-400">Bayar Sekali via QRIS • Tanpa Langganan Paksa</p>
                    </div>

                    <div className="pt-2 border-t border-white/5">
                      <div className="text-3xl font-black text-white tracking-tight">
                        {pkg.formattedPrice}
                      </div>
                      <span className="text-xs text-zinc-400 font-mono mt-1 block">
                        ⚡ {pkg.credits} Kredit Video Siap Pakai
                      </span>
                    </div>

                    <ul className="space-y-2.5 pt-4 border-t border-white/5 text-xs text-zinc-300">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>25 Kredit Video Siap Pakai</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Resolusi 1080p Full HD Bersih</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Akses Mode Video & Naskah Asli</span>
                      </li>
                    </ul>
                  </div>

                  <Link
                    href={`/studio/register?plan=${pkg.id}`}
                    className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs text-center border border-white/10 transition block"
                  >
                    Beli Paket Starter
                  </Link>
                </div>
              );
            })()}

            {/* Package 2: Creator (Recommended) */}
            {(() => {
              const pkg = STUDIO_TOKEN_PACKAGES.creator;
              return (
                <div className="p-7 rounded-3xl bg-gradient-to-b from-[#171D30] to-[#111624] border-2 border-fuchsia-500 shadow-2xl shadow-fuchsia-500/20 flex flex-col justify-between space-y-6 relative group">
                  {/* Floating Best Value Badge */}
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white font-black text-[10px] uppercase tracking-wider shadow-md">
                    Paling Hemat
                  </div>

                  <div className="space-y-4 pt-1">
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span>{pkg.name}</span>
                        <Zap className="w-4 h-4 text-fuchsia-400" />
                      </h3>
                      <p className="text-xs text-zinc-400">Bayar Sekali via QRIS • Paling Banyak Dipilih</p>
                    </div>

                    <div className="pt-2 border-t border-white/10">
                      <div className="text-3xl font-black text-white tracking-tight flex items-baseline gap-1">
                        <span>{pkg.formattedPrice}</span>
                      </div>
                      <span className="text-xs text-fuchsia-300 font-mono mt-1 block font-bold">
                        ⚡ {pkg.credits} Kredit Video Siap Pakai
                      </span>
                    </div>

                    <ul className="space-y-2.5 pt-4 border-t border-white/10 text-xs text-zinc-200">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>50 Kredit Video Siap Pakai</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Antrean Pemrosesan Prioritas</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Resolusi 1080p Full HD • Bebas Watermark</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Akses Mode Video & Naskah Asli</span>
                      </li>
                    </ul>
                  </div>

                  <Link
                    href={`/studio/register?plan=${pkg.id}`}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-fuchsia-600 via-pink-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-black text-xs text-center shadow-lg shadow-fuchsia-600/30 transition block active:scale-98"
                  >
                    Pilih Paket Creator (Rekomendasi)
                  </Link>
                </div>
              );
            })()}

            {/* Package 3: Pro Monthly */}
            {(() => {
              const pkg = STUDIO_TOKEN_PACKAGES.pro_monthly;
              return (
                <div className="p-7 rounded-3xl bg-[#111624] border border-white/10 flex flex-col justify-between space-y-6 hover:border-white/20 transition relative">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-white">{pkg.name}</h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          PRO
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">Solusi Rutin untuk Brand & Agensi Aktif</p>
                    </div>

                    <div className="pt-2 border-t border-white/5">
                      <div className="text-3xl font-black text-white tracking-tight flex items-baseline gap-1">
                        <span>{pkg.formattedPrice}</span>
                        <span className="text-xs font-normal text-zinc-400">/ bulan</span>
                      </div>
                      <span className="text-xs text-zinc-400 font-mono mt-1 block">
                        ⚡ {pkg.credits} Video 1080p Full HD per bulan
                      </span>
                    </div>

                    <ul className="space-y-2.5 pt-4 border-t border-white/5 text-xs text-zinc-300">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>100 Video Full HD per bulan</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Antrean Prioritas Cepat</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Penyimpanan Cloud Prioritas</span>
                      </li>
                    </ul>
                  </div>

                  <Link
                    href={`/studio/register?plan=${pkg.id}`}
                    className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs text-center border border-white/10 transition block"
                  >
                    Langganan Studio Pro
                  </Link>
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* ── 6. FAQ ACCORDION SECTION ────────────────────────────── */}
      <section id="faq" className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-8 scroll-mt-20">
        <div className="text-center space-y-2">
          <span className="text-xs font-bold uppercase tracking-widest text-fuchsia-400 flex items-center justify-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Pertanyaan Umum</span>
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden transition"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-sm text-white hover:text-fuchsia-300 transition cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0 ${
                      isOpen ? 'rotate-180 text-fuchsia-400' : ''
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-xs text-zinc-300 leading-relaxed border-t border-white/5 animate-in fade-in duration-150">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 7. FINAL CALL TO ACTION ─────────────────────────────── */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <div className="p-8 sm:p-14 rounded-3xl bg-gradient-to-r from-purple-950/60 via-[#111624] to-fuchsia-950/60 border border-fuchsia-500/30 space-y-6 shadow-2xl relative overflow-hidden">
          <div className="space-y-3 max-w-2xl mx-auto relative z-10">
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              Mulai Buat Video Iklan Alami yang Dipercaya Konsumen
            </h2>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              Daftar akun gratis, klaim 1 Video Trial Anda hari ini, dan buktikan betapa mudahnya membuat video alami tanpa repot garis waktu.
            </p>
          </div>

          <div className="pt-2 relative z-10">
            <Link
              href="/studio/register"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-fuchsia-600 via-pink-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-black text-sm shadow-xl shadow-fuchsia-600/40 transition active:scale-95"
            >
              <span>Coba Gratis 1 Video Sekarang →</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── 8. FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-10 text-center text-xs text-zinc-500 bg-[#0B0F17] mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm text-white">boontrack</span>
              <span className="text-[10px] font-bold text-fuchsia-400 uppercase tracking-widest">STUDIO</span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-400">Studio Konten Iklan & Naskah Manusiawi</span>
            </div>

            <div className="flex items-center gap-5 text-zinc-400">
              <a href="https://shop.boontrack.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                Shop Platform
              </a>
              <span>•</span>
              <a href="https://creator.boontrack.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                Creator Showcase
              </a>
              <span>•</span>
              <a href="https://affiliate.boontrack.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                Affiliate Partner
              </a>
            </div>
          </div>

          <div className="pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-zinc-500">
            <p>© 2026 PT BOONTRACK INOVASI DIGITAL. Seluruh hak cipta dilindungi undang-undang.</p>
            <div className="flex items-center gap-4">
              <Link href="/terms" className="hover:text-zinc-400 transition-colors">Syarat & Ketentuan</Link>
              <Link href="/privacy" className="hover:text-zinc-400 transition-colors">Kebijakan Privasi</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
