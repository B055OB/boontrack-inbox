'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

interface FooterProps {
  referralCode?: string;
}

export default function Footer({ referralCode }: FooterProps) {
  const affiliateRegisterHref = referralCode
    ? `/affiliate/register?ref=${encodeURIComponent(referralCode)}`
    : '/affiliate/register';

  return (
    <footer className="border-t border-slate-200 bg-white text-slate-600 text-xs py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Col with Official Logo Image */}
          <div className="space-y-3 md:col-span-2">
            <Link href="/" className="inline-block group">
              <img
                src="/logo-shop.png"
                alt="BoonTrack Shop Logo"
                className="h-10 w-auto object-contain group-hover:scale-105 transition-transform duration-200"
              />
            </Link>
            <p className="text-slate-500 text-xs leading-relaxed max-w-sm">
              Sistem operasi WhatsApp Commerce &amp; etalase toko online otomatis dengan checkout QRIS standar Bank Indonesia dan sinkronisasi server-side Meta Conversions API.
            </p>
            <div className="pt-1 flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Infrastruktur Resmi PT BOONTRACK INOVASI DIGITAL</span>
            </div>
          </div>

          {/* Model Bisnis Links */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] font-mono">
              Model Bisnis Vertikal
            </h4>
            <ul className="space-y-2 text-slate-600 text-xs font-medium">
              <li><a href="#vertikal" className="hover:text-blue-600 transition">Produk Fisik &amp; Retail</a></li>
              <li><a href="#vertikal" className="hover:text-blue-600 transition">Produk Digital &amp; Lisensi</a></li>
              <li><a href="#vertikal" className="hover:text-blue-600 transition">F&amp;B, Resto &amp; Kuliner</a></li>
              <li><a href="#vertikal" className="hover:text-blue-600 transition">Jasa Lapangan &amp; Teknisi</a></li>
              <li><a href="#vertikal" className="hover:text-blue-600 transition">Profesi, Legal &amp; Agensi</a></li>
              <li><a href="#vertikal" className="hover:text-blue-600 transition">Kreator &amp; Affiliate</a></li>
            </ul>
          </div>

          {/* Legal & Compliance */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] font-mono">
              Kepatuhan &amp; Regulasi
            </h4>
            <ul className="space-y-2 text-slate-600 text-xs font-medium">
              <li><Link href="/terms" className="hover:text-blue-600 transition">Ketentuan Layanan (Terms)</Link></li>
              <li><Link href="/privacy" className="hover:text-blue-600 transition">Kebijakan Privasi (UU PDP)</Link></li>
              <li><Link href="/refund" className="hover:text-blue-600 transition">Kebijakan Pengembalian Dana</Link></li>
              <li><Link href="/contact" className="hover:text-blue-600 transition">Hubungi Kami (Contact Us)</Link></li>
              <li><Link href={affiliateRegisterHref} className="text-blue-600 hover:text-indigo-600 font-bold transition">Program Afiliasi Mitra (25%)</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Sub-footer */}
        <div className="pt-8 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
          <p>&copy; {new Date().getFullYear()} PT BOONTRACK INOVASI DIGITAL. Seluruh hak cipta dilindungi undang-undang.</p>
          <p className="font-mono">Tunduk pada regulasi PMSE Kemendag RI &amp; UU Perlindungan Data Pribadi.</p>
        </div>
      </div>
    </footer>
  );
}
