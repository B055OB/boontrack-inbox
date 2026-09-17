'use client';

import React from 'react';
import Link from 'next/link';
import { Zap, ShieldCheck, ExternalLink } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-slate-800/80 bg-slate-950 text-slate-400 text-xs py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Col */}
          <div className="space-y-3 md:col-span-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 p-[1.5px]">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <Zap className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                </div>
              </div>
              <span className="font-black text-lg text-white tracking-tight">
                BoonTrack <span className="text-emerald-400 font-bold text-sm">Shop</span>
              </span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
              Sistem operasi WhatsApp Commerce & etalase toko online otomatis dengan checkout QRIS 0% MDR dan sinkronisasi server-side Meta Conversions API.
            </p>
            <div className="pt-1 flex items-center gap-2 text-[11px] text-slate-500 font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Infrastruktur Resmi PT BOONTRACK INOVASI DIGITAL</span>
            </div>
          </div>

          {/* Model Bisnis Links */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px] font-mono">
              Model Bisnis Vertikal
            </h4>
            <ul className="space-y-2 text-slate-400 text-xs">
              <li><a href="#vertikal" className="hover:text-white transition">Produk Fisik & Retail</a></li>
              <li><a href="#vertikal" className="hover:text-white transition">Produk Digital & Lisensi</a></li>
              <li><a href="#vertikal" className="hover:text-white transition">F&B, Resto & Kuliner</a></li>
              <li><a href="#vertikal" className="hover:text-white transition">Jasa Lapangan & Teknisi</a></li>
              <li><a href="#vertikal" className="hover:text-white transition">Profesi, Legal & Agensi</a></li>
              <li><a href="#vertikal" className="hover:text-white transition">Kreator & Endorsement</a></li>
            </ul>
          </div>

          {/* Legal & Compliance */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px] font-mono">
              Kepatuhan & Regulasi
            </h4>
            <ul className="space-y-2 text-slate-400 text-xs">
              <li><Link href="/terms" className="hover:text-white transition">Ketentuan Layanan (Terms)</Link></li>
              <li><Link href="/privacy" className="hover:text-white transition">Kebijakan Privasi (UU PDP)</Link></li>
              <li><Link href="/refund" className="hover:text-white transition">Kebijakan Pengembalian Dana</Link></li>
              <li><Link href="/contact" className="hover:text-white transition">Hubungi Kami (Contact Us)</Link></li>
              <li><Link href="/affiliate/register" className="text-indigo-400 hover:text-indigo-300 font-bold transition">Program Afiliasi Mitra (25%)</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Sub-footer */}
        <div className="pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <p>© 2026 PT BOONTRACK INOVASI DIGITAL. Seluruh hak cipta dilindungi undang-undang.</p>
          <p className="font-mono">Tunduk pada regulasi PMSE Kemendag RI & UU Perlindungan Data Pribadi.</p>
        </div>

      </div>
    </footer>
  );
}
