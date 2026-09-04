'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Zap, 
  ShieldCheck, 
  Sparkles,
  Bot,
  ArrowRight,
  CheckCircle2,
  Users2,
  Headphones,
  Check,
  QrCode,
  CreditCard,
  Building2,
  MapPin,
  Mail,
  Phone,
  Clock,
  Lock,
  MessageSquare,
  FileCheck,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import Footer from '@/app/components/Footer';

export default function ShopLandingPage() {
  const waContactUrl = "https://wa.me/628123745022?text=" + encodeURIComponent("Halo Tim BoonTrack, saya ingin konsultasi layanan platform SaaS BoonTrack dan aktivasi merchant.");
  const waStarterOrderUrl = "https://wa.me/628123745022?text=" + encodeURIComponent("Halo Tim BoonTrack, saya ingin memesan Starter Commerce Plan Rp149.000/bulan untuk bisnis saya. Mohon info aktivasi dan faktur pembayaran.");
  const waProOrderUrl = "https://wa.me/628123745022?text=" + encodeURIComponent("Halo Tim BoonTrack, saya ingin memesan Pro Business Suite Rp299.000/bulan untuk bisnis saya. Mohon panduan onboarding VIP dan faktur pembayaran.");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-600 selection:text-white flex flex-col">
      
      {/* 1. TOP ANNOUNCEMENT BAR */}
      <div className="bg-slate-900 text-slate-300 px-4 py-2 text-center text-xs font-medium border-b border-slate-800 flex items-center justify-center gap-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">
          RESMI
        </span>
        <span>
          Infrastruktur SaaS & WhatsApp Commerce Terverifikasi oleh <strong>PT BOONTRACK INOVASI DIGITAL</strong>
        </span>
      </div>

      {/* 2. NAVBAR KOMPONEN */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between">
          {/* Brand / Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-lg shadow-sm shadow-blue-600/30 group-hover:bg-blue-700 transition">
              B
            </div>
            <div>
              <div className="font-extrabold text-lg tracking-tight text-slate-900 leading-tight">
                BoonTrack <span className="text-blue-600 font-semibold text-sm">Shop</span>
              </div>
              <div className="text-[10px] text-slate-500 font-medium leading-none">
                SaaS / Digital Platform
              </div>
            </div>
          </Link>

          {/* Menu Navigasi Desktop */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600">
            <a href="#produk" className="hover:text-blue-600 transition">
              Layanan
            </a>
            <a href="#fitur" className="hover:text-blue-600 transition">
              Keunggulan
            </a>
            <a href="#metode-bayar" className="hover:text-blue-600 transition">
              Cara Bayar
            </a>
            <a href="#kontak" className="hover:text-blue-600 transition">
              Hubungi Kami
            </a>
          </nav>

          {/* Tombol CTA Kanan */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs font-bold px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 transition border border-slate-200"
            >
              Masuk / Dashboard
            </Link>
            <a
              href="#produk"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm shadow-blue-600/20"
            >
              <span>Pilih Paket</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Mobile Quick Subnav Bar */}
        <div className="md:hidden flex items-center justify-around border-t border-slate-100 py-2 px-3 text-[11px] font-semibold text-slate-600 bg-slate-50/80">
          <a href="#produk" className="hover:text-blue-600">Layanan</a>
          <a href="#fitur" className="hover:text-blue-600">Keunggulan</a>
          <a href="#metode-bayar" className="hover:text-blue-600">Cara Bayar</a>
          <a href="#kontak" className="hover:text-blue-600">Hubungi Kami</a>
        </div>
      </header>

      {/* 3. HERO SECTION */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white via-slate-50 to-slate-100/60 pt-12 pb-16 px-4 border-b border-slate-200">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Sistem Pembayaran & Otomasi Berlisensi Bank Indonesia Partner</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.2]">
            Platform Otomasi Penjualan & <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
              WhatsApp Commerce Cerdas
            </span>
          </h1>

          <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Solusi terintegrasi untuk kelola katalog digital, checkout otomatis, notifikasi WhatsApp instan, dan penerimaan pembayaran QRIS resmi bagi bisnis Anda.
          </p>

          {/* Action Buttons */}
          <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
            <a
              href="#produk"
              className="w-full sm:w-auto px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2"
            >
              <span>Pilih Paket Layanan</span>
              <ArrowRight className="w-4 h-4" />
            </a>

            <a
              href={waContactUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-6 py-3.5 bg-white hover:bg-slate-100 text-slate-800 rounded-xl text-xs sm:text-sm font-semibold border border-slate-300 transition flex items-center justify-center gap-2 shadow-sm"
            >
              <Phone className="w-4 h-4 text-emerald-600" />
              <span>Konsultasi Tim Legal & Sales</span>
            </a>
          </div>

          {/* Trust Badges */}
          <div className="pt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto text-left">
            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-xs font-bold text-slate-900">QRIS Real-Time</div>
              <div className="text-[11px] text-slate-500">Otomasi verifikasi detik</div>
            </div>
            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-xs font-bold text-slate-900">WhatsApp Resmi</div>
              <div className="text-[11px] text-slate-500">Notifikasi order otomatis</div>
            </div>
            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-xs font-bold text-slate-900">PMSE Kemendag</div>
              <div className="text-[11px] text-slate-500">Patuh regulasi niaga RI</div>
            </div>
            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-xs font-bold text-slate-900">UU PDP No. 27/2022</div>
              <div className="text-[11px] text-slate-500">Enkripsi data pribadi</div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. SECTION PRODUK & HARGA (KATALOG LAYANAN DIGITAL NYATA) */}
      <section id="produk" className="py-16 px-4 max-w-5xl mx-auto w-full scroll-mt-20">
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Katalog Layanan Digital Resmi</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Pilihan Paket Langganan Software SaaS
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto">
            Pilih paket langganan lisensi sistem otomasi sesuai skala usaha Anda. Transparan, tanpa biaya tersembunyi, dan langsung aktif setelah verifikasi.
          </p>
        </div>

        {/* Grid 2 Kartu Paket */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch max-w-4xl mx-auto">
          
          {/* PAKET 1: Starter Commerce Plan */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 flex flex-col justify-between shadow-sm hover:shadow-md transition">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold px-3 py-1 bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                  Starter Plan
                </span>
                <span className="text-xs text-slate-500 font-medium">Usaha Berkembang</span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900">Starter Commerce Plan</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Solusi ideal untuk UMKM dan brand yang membutuhkan etalase online cepat dan checkout WhatsApp mandiri.
                </p>
              </div>

              <div className="pt-2 pb-1 border-y border-slate-100">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-slate-900 tracking-tight">Rp149.000</span>
                  <span className="text-xs text-slate-500 font-medium">/ bulan</span>
                </div>
                <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                  ✓ Langganan SaaS Bulanan • Lisensi Resmi
                </div>
              </div>

              {/* Rincian Fitur */}
              <div className="space-y-3 pt-2 text-xs text-slate-700">
                <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                  Rincian Fitur Paket:
                </div>
                <ul className="space-y-2.5">
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Otomasi Chat WhatsApp:</strong> Pengingat otomatis & notifikasi receipt pembelian</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Integrasi Katalog Produk Digital:</strong> Etalase produk fisik & digital responsif</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Dynamic QRIS Checkout:</strong> QRIS dinamis unik dengan verifikasi otomatis detik</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Dashboard Transaksi Mandiri:</strong> Manajemen pesanan, rekap invoice & status</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Standar SLA Support:</strong> Bantuan teknis operasional via tiket WhatsApp & email</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* CTA Box */}
            <div className="pt-6 mt-6 border-t border-slate-100 space-y-2">
              <a
                href={waStarterOrderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold text-center flex items-center justify-center gap-1.5 transition shadow-sm"
              >
                <span>Pesan Sekarang (Rp149.000)</span>
                <ArrowUpRight className="w-4 h-4" />
              </a>
              <Link
                href="/register?plan=starter"
                className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold text-center block transition border border-slate-200"
              >
                Daftar Online Mandiri
              </Link>
            </div>
          </div>

          {/* PAKET 2: Pro Business Suite */}
          <div className="bg-white rounded-2xl border-2 border-blue-600 p-6 sm:p-8 flex flex-col justify-between shadow-md relative">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-3 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide shadow-sm">
              Paling Direkomendasikan
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold px-3 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                  Pro Scale
                </span>
                <span className="text-xs text-blue-600 font-bold">Volume Tinggi</span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900">Pro Business Suite</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Infrastruktur lengkap untuk brand skala menengah ke atas dengan tim CS kolaboratif dan volume penjualan tinggi.
                </p>
              </div>

              <div className="pt-2 pb-1 border-y border-slate-100">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-slate-900 tracking-tight">Rp299.000</span>
                  <span className="text-xs text-slate-500 font-medium">/ bulan</span>
                </div>
                <div className="text-[11px] text-blue-600 font-semibold mt-0.5">
                  ✓ Semua Fitur Starter + Multi-Admin & Integrasi API
                </div>
              </div>

              {/* Rincian Fitur */}
              <div className="space-y-3 pt-2 text-xs text-slate-700">
                <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                  Rincian Fitur Paket:
                </div>
                <ul className="space-y-2.5">
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span><strong>Semua Fitur Starter Plan:</strong> Termasuk katalog, dynamic QRIS, dan otomasi order</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span><strong>Multi-Admin Live CS Console:</strong> Kelola pelanggan bersama tim tanpa rebutan chat</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span><strong>Integrasi Webhook / API Eksternal:</strong> Terhubung ke sistem ERP, CRM, dan logistik eksternal</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span><strong>Laporan Finansial Real-time:</strong> Rekap omset harian, rincian P&L, dan performa konversi</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span><strong>Prioritas Customer Support 24/7:</strong> Jalur pendampingan teknis prioritas via tim dedicated</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* CTA Box */}
            <div className="pt-6 mt-6 border-t border-slate-100 space-y-2">
              <a
                href={waProOrderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold text-center flex items-center justify-center gap-1.5 transition shadow-sm"
              >
                <span>Pesan Sekarang (Rp299.000)</span>
                <ArrowUpRight className="w-4 h-4" />
              </a>
              <Link
                href="/register?plan=pro_business"
                className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-xl text-xs font-semibold text-center block transition border border-blue-200"
              >
                Daftar Online Mandiri
              </Link>
            </div>
          </div>

        </div>
      </section>

      {/* 5. SECTION KEUNGGULAN & FITUR UTAMA */}
      <section id="fitur" className="py-16 bg-white border-y border-slate-200 px-4 scroll-mt-20">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200">
              <Zap className="w-3.5 h-3.5 text-blue-600" />
              <span>Keunggulan Infrastruktur SaaS</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Teknologi Canggih untuk Akselerasi Toko Digital Anda
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto">
              Dibangun dengan standar reliabilitas tinggi, arsitektur server-side mutakhir, dan sertifikasi keamanan perbankan.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                <Bot className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Otomasi WhatsApp 24/7</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Kirim invoice, notifikasi QRIS, dan resi ekspedisi langsung ke nomor WhatsApp pembeli secara instan.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                <QrCode className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Dynamic QRIS Real-Time</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Nominal pembayaran terkunci otomatis dengan kode unik sehingga tidak memerlukan konfirmasi transfer manual.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Katalog & Manajemen Stok</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Kelola produk digital, fisik, varian ukuran, dan sinkronisasi stok secara akurat di satu dashboard intuitif.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold">
                <FileCheck className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Kepatuhan Regulasi PMSE</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Dilengkapi dokumen legalitas, safe harbor, saluran pengaduan konsumen, dan perlindungan UU PDP No. 27/2022.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. SECTION ALUR TRANSAKSI & METODE PEMBAYARAN */}
      <section id="metode-bayar" className="py-16 px-4 max-w-5xl mx-auto w-full scroll-mt-20">
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
            <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
            <span>Kanal Pembayaran Resmi & Aman</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Metode Pembayaran & Alur Transaksi
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto">
            Transaksi diproses secara otomatis dan aman menggunakan sistem verifikasi pembayaran real-time berlisensi Bank Indonesia.
          </p>
        </div>

        {/* Badge Metode Pembayaran */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Kanal 1: QRIS Nasional */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-red-600" />
                <span>QRIS Nasional (ASPI)</span>
              </div>
              <p className="text-xs text-slate-600">
                Menerima seluruh dompet digital dan mobile banking:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1 text-[11px] font-semibold text-slate-700">
                <span className="px-2 py-0.5 bg-white rounded border border-slate-200">GoPay</span>
                <span className="px-2 py-0.5 bg-white rounded border border-slate-200">OVO</span>
                <span className="px-2 py-0.5 bg-white rounded border border-slate-200">DANA</span>
                <span className="px-2 py-0.5 bg-white rounded border border-slate-200">ShopeePay</span>
                <span className="px-2 py-0.5 bg-white rounded border border-slate-200">LinkAja</span>
              </div>
            </div>

            {/* Kanal 2: Virtual Account */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>Virtual Account Bank</span>
              </div>
              <p className="text-xs text-slate-600">
                Konfirmasi instan otomatis tanpa bukti transfer:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1 text-[11px] font-semibold text-slate-700">
                <span className="px-2 py-0.5 bg-white rounded border border-slate-200">BCA VA</span>
                <span className="px-2 py-0.5 bg-white rounded border border-slate-200">Mandiri VA</span>
                <span className="px-2 py-0.5 bg-white rounded border border-slate-200">BNI VA</span>
                <span className="px-2 py-0.5 bg-white rounded border border-slate-200">BRI VA</span>
                <span className="px-2 py-0.5 bg-white rounded border border-slate-200">Permata</span>
              </div>
            </div>

            {/* Kanal 3: Keamanan Enkripsi */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-emerald-600" />
                <span>Standar Keamanan</span>
              </div>
              <p className="text-xs text-slate-600">
                Sistem terenkripsi TLS 1.3 & proteksi transaksi 24 jam berlisensi Bank Indonesia melalui payment gateway resmi terakreditasi.
              </p>
              <div className="pt-1 text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>PCI-DSS & ISO 27001 Compliant</span>
              </div>
            </div>
          </div>

          {/* 3 Langkah Alur Transaksi */}
          <div className="pt-4 border-t border-slate-100">
            <div className="text-xs font-bold text-slate-900 mb-4 uppercase tracking-wider text-center">
              Alur Transaksi & Aktivasi Layanan (3 Langkah Mudah)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </div>
                <div>
                  <div className="font-bold text-slate-900">Pilih Paket Layanan</div>
                  <div className="text-slate-600 mt-0.5">Tentukan paket Starter atau Pro sesuai kebutuhan kapasitas bisnis Anda.</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </div>
                <div>
                  <div className="font-bold text-slate-900">Pembayaran Otomatis</div>
                  <div className="text-slate-600 mt-0.5">Scan kode QRIS dinamis atau transfer Virtual Account resmi secara aman.</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                  3
                </div>
                <div>
                  <div className="font-bold text-slate-900">Aktivasi Instan</div>
                  <div className="text-slate-600 mt-0.5">Sistem memverifikasi pelunasan dalam hitungan detik & modul toko langsung aktif.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. SECTION HUBUNGI KAMI & PROFIL MERCHANT ENTITAS RESMI */}
      <section id="kontak" className="py-16 bg-slate-100/70 border-t border-slate-200 px-4 scroll-mt-20">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Profil Entitas & Kantor Operasional</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              PT BOONTRACK INOVASI DIGITAL
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto">
              Penyedia solusi infrastruktur digital, otomatisasi chat commerce, dan orkestrasi checkout terintegrasi.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            {/* Kartu 1: Alamat Kantor & Jam Operasional */}
            <div className="p-6 sm:p-8 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span>Alamat Fisik Operasional</span>
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>PT BOONTRACK INOVASI DIGITAL</strong><br />
                Jl Saturnus Selatan A16 Margahayu Raya, Bandung, Jawa Barat 40286, Indonesia.
              </p>

              <div className="pt-2 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                  <span><strong>Jam Kerja:</strong> Senin – Minggu, 08:00 – 22:00 WIB</span>
                </div>
                <div className="flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-slate-400 shrink-0" />
                  <span><strong>Dedicated Support:</strong> 24 Jam untuk Klien Pro Business Suite</span>
                </div>
              </div>
            </div>

            {/* Kartu 2: Kontak Pelanggan & WhatsApp Resmi */}
            <div className="p-6 sm:p-8 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-600" />
                  <span>Kontak Pelanggan & Kemitraan</span>
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Support Teknis: <a href="mailto:support@boontrack.com" className="text-blue-600 font-semibold hover:underline">support@boontrack.com</a></span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Tim Kepatuhan: <a href="mailto:compliance@boontrack.com" className="text-blue-600 font-semibold hover:underline">compliance@boontrack.com</a></span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>WhatsApp CS: <span className="font-semibold text-slate-900">+62 812-3745-022 (08123745022)</span></span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <a
                  href={waContactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold text-center flex items-center justify-center gap-2 transition shadow-sm"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Chat WhatsApp Tim Sales & Legal (+62 812-3745-022)</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. FOOTER LENGKAP */}
      <Footer className="mt-auto" />

    </div>
  );
}