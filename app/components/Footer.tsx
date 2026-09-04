import React from "react";
import Link from "next/link";
import { ShieldCheck, Mail, MessageSquare, ExternalLink, MapPin, Phone } from "lucide-react";

export default function Footer({ className = "" }: { className?: string }) {
  return (
    <footer className={`bg-slate-950 text-slate-400 border-t border-slate-800 ${className}`}>
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-slate-800/80 text-xs">
          {/* Kolom 1: Profil Entitas */}
          <div className="space-y-3 md:col-span-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-base shadow-sm">
                B
              </div>
              <div>
                <span className="font-extrabold text-base tracking-tight text-white block leading-tight">
                  BoonTrack <span className="text-blue-400 font-medium text-xs">Shop</span>
                </span>
                <span className="text-[10px] text-slate-400 block font-medium">
                  SaaS / Digital Platform
                </span>
              </div>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Penyedia solusi infrastruktur digital, otomatisasi chat commerce, dan orkestrasi checkout terintegrasi di bawah <strong>PT BOONTRACK INOVASI DIGITAL</strong>.
            </p>
            <div className="flex items-start gap-2 text-slate-400 pt-1">
              <MapPin className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <span className="leading-snug">
                Jl. Kirana Margahayu Raya, Bandung, Jawa Barat 40286, Indonesia.
              </span>
            </div>
          </div>

          {/* Kolom 2: Navigasi Menu & Layanan */}
          <div className="space-y-3">
            <div className="text-white font-bold text-xs uppercase tracking-wider">
              Menu Layanan
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="#produk" className="text-slate-300 hover:text-white transition">
                  Katalog Paket Layanan
                </a>
              </li>
              <li>
                <a href="#fitur" className="text-slate-300 hover:text-white transition">
                  Fitur & Keunggulan
                </a>
              </li>
              <li>
                <a href="#metode-bayar" className="text-slate-300 hover:text-white transition">
                  Cara & Metode Bayar
                </a>
              </li>
              <li>
                <a href="#kontak" className="text-slate-300 hover:text-white transition">
                  Hubungi Tim Legal & Sales
                </a>
              </li>
              <li>
                <Link href="/login" className="text-slate-300 hover:text-white transition">
                  Masuk Portal Merchant
                </Link>
              </li>
            </ul>
          </div>

          {/* Kolom 3: Kepatuhan Hukum & Regulasi */}
          <div className="space-y-3">
            <div className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Kepatuhan & Kebijakan</span>
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/terms" className="text-slate-300 hover:text-white transition">
                  Ketentuan Layanan (Terms of Service)
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-slate-300 hover:text-white transition">
                  Kebijakan Privasi (UU PDP No. 27/2022)
                </Link>
              </li>
              <li>
                <Link href="/acceptable-use" className="text-slate-300 hover:text-white transition">
                  Kebijakan Penggunaan Layanan (AUP)
                </Link>
              </li>
              <li>
                <Link href="/refund" className="text-slate-300 hover:text-white transition">
                  Kebijakan Pengembalian Dana (Refund)
                </Link>
              </li>
            </ul>
          </div>

          {/* Kolom 4: Kontak Resmi & Layanan Konsumen */}
          <div className="space-y-3">
            <div className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              <span>Kontak Resmi & PMSE</span>
            </div>
            <div className="space-y-2 text-xs text-slate-300 bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>
                  WhatsApp CS:{" "}
                  <a 
                    href="https://wa.me/6285715414744" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-emerald-400 font-semibold hover:underline"
                  >
                    +62 857-1541-4744
                  </a>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>
                  Support:{" "}
                  <a href="mailto:support@boontrack.com" className="text-blue-400 hover:underline">
                    support@boontrack.com
                  </a>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>
                  Kepatuhan:{" "}
                  <a href="mailto:compliance@boontrack.com" className="text-blue-400 hover:underline">
                    compliance@boontrack.com
                  </a>
                </span>
              </div>
              <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-0.5">
                <div className="flex items-start gap-1.5">
                  <ExternalLink className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Aduan Ditjen PKTN Kemendag:{" "}
                    <span className="text-amber-300 font-medium">WA 0853-1111-1010</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Baris Bawah: Copyright */}
        <div className="pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <p>© 2026 PT BOONTRACK INOVASI DIGITAL. All rights reserved.</p>
          <div className="flex items-center gap-4 text-slate-400">
            <Link href="/terms" className="hover:text-white transition">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
            <Link href="/acceptable-use" className="hover:text-white transition">AUP</Link>
            <Link href="/refund" className="hover:text-white transition">Refund</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
