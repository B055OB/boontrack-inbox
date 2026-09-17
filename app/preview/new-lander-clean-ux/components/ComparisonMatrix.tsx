'use client';

import React from 'react';
import Link from 'next/link';
import { 
  XCircle, 
  CheckCircle2, 
  DollarSign, 
  Database, 
  Clock, 
  Activity,
  ShieldCheck,
  ArrowRight,
  Sparkles
} from 'lucide-react';

interface ComparisonMatrixProps {
  referralCode?: string;
}

export default function ComparisonMatrix({ referralCode }: ComparisonMatrixProps) {
  const registerHref = referralCode ? `/register?ref=${encodeURIComponent(referralCode)}` : '/register';

  const oldWayPoints = [
    {
      title: 'Potongan Komisi 15% - 25%',
      desc: 'Setiap barang laku di marketplace, komisi admin dan biaya layanan memangkas profit margin bisnis Anda.',
      icon: DollarSign
    },
    {
      title: 'Admin Begadang Balas Chat Manual',
      desc: 'Pelanggan chat tengah malam sering batal beli karena slow response atau admin kelelahan mengetik manual.',
      icon: Clock
    },
    {
      title: 'Database Pembeli Disensor & Dikunci',
      desc: 'Nomor WhatsApp dan data pembeli disensor (0812-xxxx). Anda tidak bisa melakukan retargeting atau broadcast berkala.',
      icon: Database
    },
    {
      title: 'Pixel Iklan Drop & Error (iOS 17+)',
      desc: 'Pelacakan konversi iklan berbasis browser hilang hingga 40% karena adblocker, membuat biaya iklan makin mahal.',
      icon: Activity
    },
    {
      title: 'Verifikasi Struk Transfer Palsu',
      desc: 'CS harus cek mutasi m-Banking satu per satu secara manual dan rawan terkena modus bukti transfer palsu/editan Photoshop.',
      icon: XCircle
    }
  ];

  const boonTrackPoints = [
    {
      title: 'Bebas Potongan Komisi (QRIS Standar 0% MDR)',
      desc: '100% dana penjualan masuk utuh ke rekening bank Anda tanpa potongan komisi platform per transaksi.',
      badge: 'Hemat Jutaan / Bulan',
      icon: DollarSign
    },
    {
      title: 'Asisten Bot 24 Jam Urus Order & Invoice',
      desc: 'Balas pesan pembeli dalam hitungan detik, hitung ongkir otomatis, dan terbitkan invoice QRIS pembayaran seketika.',
      badge: 'Auto-Close 24/7',
      icon: Clock
    },
    {
      title: '100% Database Milik Merchant Utuh',
      desc: 'Nomor WhatsApp pembeli tersimpan rapi untuk kampanye broadcast promosi ulang dan peningkatan repeat order.',
      badge: 'Aset Bisnis Permanen',
      icon: Database
    },
    {
      title: 'Server-Side Meta & TikTok CAPI Real-Time',
      desc: 'Data konversi dikirim langsung dari server cloud ke Meta & TikTok. Match Quality tinggi tembus proteksi iOS.',
      badge: 'Score EMQ 9.6/10',
      icon: Activity
    },
    {
      title: 'Reader APK: Deteksi Mutasi dalam Hitungan Detik',
      desc: 'Aplikasi reader otomatis membaca mutasi QRIS dan bank. Order otomatis ditandai lunas tanpa upload struk manual.',
      badge: 'Anti-Struk Palsu',
      icon: ShieldCheck
    }
  ];

  return (
    <section id="komparasi" className="py-20 bg-slate-50 border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Heading */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold tracking-wide">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Studi Komparasi Finansial &amp; Operasional</span>
          </span>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-950 tracking-tight">
            Marketplace Tradisional vs BoonTrack Commerce Engine
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Perbandingan objektif antara bergantung pada platform pihak ketiga versus membangun infrastruktur toko online independen milik Anda sendiri.
          </p>
        </div>

        {/* Side by Side Comparison Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 items-stretch">
          {/* Card Kiri: Cara Lama / Marketplace Tradisional */}
          <div className="bg-white border-2 border-rose-200/80 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col justify-between space-y-6">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-rose-100">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 font-mono">
                    Ketergantungan Eksternal
                  </span>
                  <h3 className="text-xl font-black text-slate-900 mt-0.5">
                    Marketplace &amp; Chat Manual
                  </h3>
                </div>
                <span className="p-2 rounded-full bg-rose-50 text-rose-600">
                  <XCircle className="w-6 h-6" />
                </span>
              </div>

              <div className="space-y-4">
                {oldWayPoints.map((pt, idx) => {
                  const Icon = pt.icon;
                  return (
                    <div key={idx} className="flex items-start gap-3 p-3.5 rounded-2xl bg-rose-50/40 border border-rose-100/80">
                      <div className="p-2 rounded-xl bg-white text-rose-600 shadow-2xs shrink-0 mt-0.5">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-bold text-slate-900">{pt.title}</h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed">{pt.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200/80 text-center">
              <span className="text-xs font-bold text-rose-700 block">
                Hasil: Margin tergerus komisi, omzet bocor di chat, &amp; data pelanggan hilang.
              </span>
            </div>
          </div>

          {/* Card Kanan: BoonTrack Engine */}
          <div className="bg-white border-2 border-indigo-600 rounded-3xl p-6 sm:p-8 shadow-xl shadow-indigo-600/10 ring-2 ring-indigo-500/20 flex flex-col justify-between space-y-6 relative">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-indigo-100">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 font-mono">
                    Infrastruktur Mandiri Berlisensi
                  </span>
                  <h3 className="text-xl font-black text-slate-950 mt-0.5">
                    BoonTrack Commerce Engine
                  </h3>
                </div>
                <span className="p-2 rounded-full bg-indigo-50 text-indigo-600">
                  <CheckCircle2 className="w-6 h-6" />
                </span>
              </div>

              <div className="space-y-4">
                {boonTrackPoints.map((pt, idx) => {
                  const Icon = pt.icon;
                  return (
                    <div key={idx} className="flex items-start gap-3 p-3.5 rounded-2xl bg-indigo-50/30 border border-indigo-100">
                      <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs shrink-0 mt-0.5">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="space-y-0.5 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-black text-slate-950">{pt.title}</h4>
                          <span className="text-[9px] font-black font-mono px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 shrink-0">
                            {pt.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed font-medium">{pt.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <Link
                href={registerHref}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:opacity-95 active:scale-98 text-white font-black text-xs rounded-xl shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Klaim Toko &amp; Coba Gratis 7 Hari Sekarang</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="text-[10px] text-center text-slate-400 font-mono">
                Bebas risiko • Aktif instan dalam 30 detik
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
