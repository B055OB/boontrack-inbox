'use client';

import React from 'react';
import Link from 'next/link';
import { 
  XCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Sparkles, 
  ArrowRight, 
  ShieldCheck, 
  DollarSign, 
  Database, 
  Clock, 
  Activity 
} from 'lucide-react';

interface ComparisonMatrixProps {
  referralCode?: string;
}

export default function ComparisonMatrix({ referralCode }: ComparisonMatrixProps) {
  const registerHref = referralCode ? `/register?ref=${encodeURIComponent(referralCode)}` : '/register';

  const oldWayPoints = [
    {
      title: 'Potongan Komisi 15% - 25%',
      desc: 'Setiap barang laku, marketplace memotong biaya admin dan layanan yang memakan profit margin bisnis Anda.',
      icon: DollarSign
    },
    {
      title: 'Admin Begadang Balas Chat Manual',
      desc: 'Pelanggan chat malam hari sering batal beli karena slow response atau admin kelelahan mengetik manual.',
      icon: Clock
    },
    {
      title: 'Database Pelanggan Dikunci Platform',
      desc: 'Nomor WhatsApp dan kontak pembeli disensor (0812-xxxx). Anda tidak bisa melakukan retargeting atau broadcast ulang.',
      icon: Database
    },
    {
      title: 'Pixel Iklan Sering Drop & Error (iOS 14+)',
      desc: 'Data konversi iklan Meta/TikTok via browser hilang hingga 40%, membuat biaya iklan makin mahal.',
      icon: Activity
    }
  ];

  const boonTrackPoints = [
    {
      title: 'Bebas Potongan Komisi (QRIS 0% MDR)',
      desc: '100% dana penjualan masuk utuh ke rekening bank Anda tanpa potongan komisi platform per transaksi.',
      badge: 'Hemat Jutaan / Bulan',
      icon: DollarSign
    },
    {
      title: 'Asisten Bot 24 Jam Urus Order & Invoice',
      desc: 'Balas pesan pembeli kurang dari 3 detik, hitung ongkir otomatis, dan terbitkan invoice pembayaran seketika.',
      badge: 'Auto-Close',
      icon: Clock
    },
    {
      title: '100% Kepemilikan Database Nomor WhatsApp',
      desc: 'Seluruh nama, nomor WhatsApp aktif, dan riwayat pesanan adalah aset pribadi toko Anda yang dapat diunduh kapan saja.',
      badge: 'Full Ownership',
      icon: Database
    },
    {
      title: 'Auto-CAPI Server-Side Zero-Config',
      desc: 'Sinkronisasi event Purchase & Lead langsung dari server ke Meta API. Event Match Quality (EMQ) tinggi di atas 9.0.',
      badge: 'Akurat 99%',
      icon: Activity
    }
  ];

  return (
    <section id="komparasi" className="py-20 bg-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Heading */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-14">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-mono font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Kalkulasi Keuntungan Riil Bisnis</span>
          </span>
          <h2 className="text-2xl sm:text-4xl font-black text-zinc-900 tracking-tight">
            Tinggalkan Cara Lama yang Membakar Profit Anda
          </h2>
          <p className="text-zinc-600 text-sm sm:text-base leading-relaxed">
            Lihat bagaimana BoonTrack mengembalikan kendali penuh margin keuntungan, data pelanggan, dan waktu istirahat Anda.
          </p>
        </div>

        {/* Side-by-Side Comparison Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 items-stretch">
          
          {/* Kolom Kiri: Cara Lama / Marketplace (Soft Rose Tint: bg-rose-50/60 border-rose-200) */}
          <div className="bg-rose-50/60 border border-rose-200 rounded-3xl p-6 sm:p-8 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-rose-200/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                    <XCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900 text-base">Cara Lama / Marketplace</h3>
                    <span className="text-xs text-rose-600 font-mono">Beban Biaya Tinggi</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-800">
                  Potongan 15-25%
                </span>
              </div>

              <div className="space-y-3.5">
                {oldWayPoints.map((pt, idx) => (
                  <div key={idx} className="flex items-start gap-3.5 p-3.5 bg-white/90 rounded-2xl border border-rose-200/60 shadow-xs">
                    <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                      <XCircle className="w-4 h-4" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs sm:text-sm font-bold text-zinc-900">{pt.title}</h4>
                      <p className="text-xs text-zinc-600 leading-relaxed">{pt.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Omzet Rp 100 Juta dipotong Rp 15 - 25 Juta tanpa sisa database pembeli.</span>
            </div>
          </div>

          {/* Kolom Kanan: BoonTrack Engine (White Card with Emerald Border: bg-white border-2 border-emerald-500 shadow-sm) */}
          <div className="bg-white border-2 border-emerald-500 rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-sm relative overflow-hidden">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900 text-base">BoonTrack Commerce Engine</h3>
                    <span className="text-xs text-emerald-700 font-mono font-semibold">100% Milik Toko Anda</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800">
                  0% Komisi Penjualan
                </span>
              </div>

              <div className="space-y-3.5">
                {boonTrackPoints.map((pt, idx) => (
                  <div key={idx} className="flex items-start gap-3.5 p-3.5 bg-zinc-50/80 rounded-2xl border border-zinc-200/80 shadow-xs">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs sm:text-sm font-bold text-zinc-900">{pt.title}</h4>
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold shrink-0">
                          {pt.badge}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600 leading-relaxed">{pt.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-emerald-800 font-medium flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Simpan profit 100% & kuasai channel penjualan langsung.</span>
              </div>
              <Link
                href={registerHref}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs"
              >
                <span>Mulai Sekarang</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
