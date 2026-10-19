'use client';

import React from 'react';
import Link from 'next/link';
import { Zap, ShieldCheck } from 'lucide-react';

interface FooterProps {
  referralCode?: string;
}

export default function Footer({ referralCode }: FooterProps) {
  return (
    <footer className="border-t border-zinc-200 bg-white text-zinc-600 text-xs py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Col */}
          <div className="space-y-3 md:col-span-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 p-[1.5px] shadow-xs">
                <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center">
                  <Zap className="w-4 h-4 text-emerald-600 fill-emerald-600" />
                </div>
              </div>
              <span className="font-black text-lg text-zinc-900 tracking-tight">
                BoonTrack <span className="text-emerald-600 font-bold text-sm">Shop</span>
              </span>
            </div>
            <p className="text-zinc-500 text-xs leading-relaxed max-w-sm">
              Sistem operasi WhatsApp Commerce & etalase toko online otomatis dengan checkout QRIS langsung toko dan sinkronisasi server-side Meta Conversions API.
            </p>
            <div className="pt-1 flex items-center gap-2 text-[11px] text-zinc-400 font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Infrastruktur Resmi PT BOONTRACK INOVASI DIGITAL</span>
            </div>
          </div>

          {/* Model Bisnis Links */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-zinc-900 uppercase tracking-wider text-[11px] font-mono">
              Model Bisnis
            </h4>
            <ul className="space-y-2 text-zinc-600 text-xs">
              <li><a href="#vertikal" className="hover:text-zinc-900 transition">Produk Fisik &amp; Retail</a></li>
              <li><a href="#vertikal" className="hover:text-zinc-900 transition">Produk Digital &amp; Lisensi</a></li>
              <li><a href="#vertikal" className="hover:text-zinc-900 transition">F&amp;B, Resto &amp; Kuliner</a></li>
              <li><a href="#vertikal" className="hover:text-zinc-900 transition">Jasa &amp; Teknisi Lapangan</a></li>
              <li><a href="#vertikal" className="hover:text-zinc-900 transition">Profesi, Legal &amp; Agensi</a></li>
            </ul>
          </div>

          {/* Dokumentasi & Developer */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-zinc-900 uppercase tracking-wider text-[11px] font-mono">
              Dokumentasi &amp; API
            </h4>
            <ul className="space-y-2 text-zinc-600 text-xs">
              <li><Link href="/docs" className="hover:text-emerald-600 text-emerald-600 font-semibold transition">Dokumentasi API &amp; Integrasi</Link></li>
              <li><Link href="/docs/meta-waba" className="hover:text-zinc-900 transition">Panduan Meta WABA &amp; CAPI</Link></li>
              <li>
                <Link href="/status" className="hover:text-emerald-600 transition inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Status Layanan</span>
                </Link>
              </li>
              <li><Link href="/login" className="hover:text-zinc-900 transition">Portal Merchant</Link></li>
            </ul>
          </div>

          {/* Legal & Compliance */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-zinc-900 uppercase tracking-wider text-[11px] font-mono">
              Kepatuhan &amp; Regulasi
            </h4>
            <ul className="space-y-2 text-zinc-600 text-xs">
              <li><Link href="/terms" className="hover:text-zinc-900 transition">Ketentuan Layanan (Terms)</Link></li>
              <li><Link href="/privacy" className="hover:text-zinc-900 transition">Kebijakan Privasi (UU PDP)</Link></li>
              <li><Link href="/refund" className="hover:text-zinc-900 transition">Kebijakan Refund</Link></li>
              <li><Link href="/contact" className="hover:text-zinc-900 transition">Hubungi Kami</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Sub-footer */}
        <div className="pt-8 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-zinc-400">
          <p>© 2026 PT BOONTRACK INOVASI DIGITAL. Seluruh hak cipta dilindungi undang-undang.</p>
          <p className="font-mono">Tunduk pada regulasi PMSE Kemendag RI & UU Perlindungan Data Pribadi.</p>
        </div>

      </div>
    </footer>
  );
}
