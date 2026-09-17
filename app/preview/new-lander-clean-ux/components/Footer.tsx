'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, MapPin, Mail } from 'lucide-react';

interface FooterProps {
  referralCode?: string;
}

export default function Footer({ referralCode }: FooterProps) {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 text-slate-300 text-xs py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Col with Official Transparent Logo */}
          <div className="space-y-3 md:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2.5 group cursor-pointer">
              <img
                src="/logo.png"
                alt="BoonTrack Shop"
                className="w-9 h-9 rounded-xl object-contain shadow-sm group-hover:scale-105 transition-transform"
              />
              <div>
                <span className="font-black text-lg tracking-tight text-white block leading-tight">
                  BoonTrack <span className="text-blue-400 font-bold text-sm">Shop</span>
                </span>
                <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">
                  Commerce Engine
                </span>
              </div>
            </Link>
            <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
              Sistem operasi WhatsApp Commerce &amp; etalase toko online otomatis dengan checkout QRIS standar Bank Indonesia dan sinkronisasi server-side Meta Conversions API.
            </p>
            <div className="pt-1 flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Infrastruktur Resmi PT BOONTRACK INOVASI DIGITAL</span>
            </div>
            {/* Alamat & Email Resmi */}
            <div className="space-y-1.5 pt-2 text-slate-400 text-[11px]">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>Bandung, West Java, Indonesia</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <a href="mailto:support@boontrack.com" className="hover:text-white transition">support@boontrack.com</a>
                <span className="text-slate-600">•</span>
                <a href="mailto:compliance@boontrack.com" className="hover:text-white transition">compliance@boontrack.com</a>
              </div>
            </div>
          </div>

          {/* Model Bisnis Links */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px] font-mono">
              Model Bisnis Vertikal
            </h4>
            <ul className="space-y-2 text-slate-400 text-xs font-medium">
              <li><a href="#vertikal" className="hover:text-blue-400 transition">Produk Fisik &amp; Retail</a></li>
              <li><a href="#vertikal" className="hover:text-blue-400 transition">Produk Digital &amp; Lisensi</a></li>
              <li><a href="#vertikal" className="hover:text-blue-400 transition">F&amp;B, Resto &amp; Kuliner</a></li>
              <li><a href="#vertikal" className="hover:text-blue-400 transition">Jasa Lapangan &amp; Teknisi</a></li>
              <li><a href="#vertikal" className="hover:text-blue-400 transition">Profesi, Legal &amp; Agensi</a></li>
              <li><a href="#vertikal" className="hover:text-blue-400 transition">Kreator &amp; Affiliate</a></li>
            </ul>
          </div>

          {/* Legal & Compliance */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px] font-mono">
              Kepatuhan &amp; Regulasi
            </h4>
            <ul className="space-y-2 text-slate-400 text-xs font-medium">
              <li><Link href="/terms" className="hover:text-blue-400 transition">Ketentuan Layanan (Terms)</Link></li>
              <li><Link href="/privacy" className="hover:text-blue-400 transition">Kebijakan Privasi (UU PDP)</Link></li>
              <li><Link href="/refund" className="hover:text-blue-400 transition">Kebijakan Pengembalian Dana</Link></li>
              <li><Link href="/contact" className="hover:text-blue-400 transition">Hubungi Kami (Contact Us)</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Sub-footer */}
        <div className="pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <p>&copy; {new Date().getFullYear()} PT BOONTRACK INOVASI DIGITAL. Seluruh hak cipta dilindungi undang-undang.</p>
          <p className="font-mono">Tunduk pada regulasi PMSE Kemendag RI &amp; UU Perlindungan Data Pribadi.</p>
        </div>
      </div>
    </footer>
  );
}
