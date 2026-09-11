import React from 'react';
import Link from 'next/link';
import { Store, Globe, HelpCircle, ArrowLeft, ShieldAlert } from 'lucide-react';

export const metadata = {
  title: 'Toko Tidak Ditemukan - BoonTrack',
  description: 'Alamat toko atau custom domain ini belum terhubung dengan toko manapun di platform BoonTrack.',
};

export default function StoreNotFoundPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 selection:bg-purple-100 selection:text-purple-900 font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200/80 shadow-xl p-6 sm:p-8 text-center space-y-6 animate-fadeIn">
        {/* Visual Icon */}
        <div className="mx-auto w-20 h-20 rounded-3xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shadow-xs relative">
          <Store className="w-10 h-10" />
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm">
            <ShieldAlert className="w-4 h-4" />
          </div>
        </div>

        {/* Text Content */}
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
            <Globe className="w-3.5 h-3.5 text-slate-500" />
            Domain Belum Terhubung
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Toko Tidak Ditemukan
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
            Domain atau alamat toko ini belum terdaftar di platform BoonTrack, atau konfigurasi DNS CNAME masih dalam proses propagasi global.
          </p>
        </div>

        {/* Tips Box */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/70 text-left space-y-2 text-xs text-slate-600">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            <HelpCircle className="w-4 h-4 text-purple-600" />
            <span>Apakah Anda pemilik toko ini?</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-500 pl-1">
            <li>Pastikan Anda telah menambahkan CNAME dengan target <strong className="font-mono text-purple-700">shop.boontrack.com</strong> di DNS provider Anda.</li>
            <li>Pastikan domain sudah disimpan di Dashboard Pengaturan Toko BoonTrack.</li>
            <li>Propagasi DNS biasanya memerlukan waktu 5–30 menit.</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
          <Link
            href="https://boontrack.com"
            className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-xs flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Ke Halaman Utama</span>
          </Link>
          <a
            href="https://wa.me/6281234567890?text=Halo%20BoonTrack,%20saya%20butuh%20bantuan%20setup%20Custom%20Domain"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center"
          >
            <span>Bantuan CS</span>
          </a>
        </div>
      </div>

      <div className="mt-8 text-center text-[11px] text-slate-400">
        &copy; {new Date().getFullYear()} BoonTrack &bull; Multi-Tenant Commerce Infrastructure
      </div>
    </div>
  );
}
