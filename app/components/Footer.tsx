import React from "react";
import Link from "next/link";
import { ShieldCheck, Mail, MessageSquare, ExternalLink, MapPin } from "lucide-react";

export default function Footer({ className = "" }: { className?: string }) {
  return (
    <footer className={`bg-slate-900 text-slate-400 border-t border-slate-800 ${className}`}>
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-10 border-b border-slate-800 text-xs">
          {/* Kolom 1: Profil Entitas */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center font-black text-white text-sm shadow-sm">
                B
              </div>
              <span className="font-extrabold text-base tracking-tight text-white">
                BoonTrack <span className="text-blue-400 font-medium text-xs">Commerce Engine</span>
              </span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Platform Software-as-a-Service (SaaS) perantara teknologi otomatisasi checkout, WhatsApp Commerce, dan orkestrasi toko digital terpadu.
            </p>
            <div className="flex items-start gap-2 text-slate-400 pt-1">
              <MapPin className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <span>Alamat Operasional: PT BOONTRACK INOVASI DIGITAL, Bandung, Jawa Barat.</span>
            </div>
          </div>

          {/* Kolom 2: Navigasi Hukum & Kepatuhan */}
          <div className="space-y-3">
            <div className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Kepatuhan Hukum & Kebijakan</span>
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/terms" className="text-slate-300 hover:text-white transition flex items-center gap-1.5">
                  <span>Ketentuan Layanan (Terms of Service)</span>
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-slate-300 hover:text-white transition flex items-center gap-1.5">
                  <span>Kebijakan Privasi (UU PDP No. 27/2022)</span>
                </Link>
              </li>
              <li>
                <Link href="/acceptable-use" className="text-slate-300 hover:text-white transition flex items-center gap-1.5">
                  <span>Kebijakan Penggunaan Layanan (AUP & Meta WABA)</span>
                </Link>
              </li>
              <li>
                <Link href="/refund" className="text-slate-300 hover:text-white transition flex items-center gap-1.5">
                  <span>Kebijakan Pengembalian Dana & Pembatalan (Refund)</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Kolom 3: Layanan Pengaduan Konsumen & Regulasi PMSE */}
          <div className="space-y-3">
            <div className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              <span>Layanan Pengaduan Konsumen (PMSE)</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Bila terdapat sengketa pesanan atau kendala kepatuhan dengan merchant toko pada platform kami:
            </p>
            <div className="space-y-1.5 text-xs text-slate-300 bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
              <div className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>
                  Layanan Aduan & Kepatuhan:{" "}
                  <a href="mailto:compliance@boontrack.com" className="text-blue-400 hover:underline">
                    compliance@boontrack.com
                  </a>{" "}
                  |{" "}
                  <a href="mailto:dispute@boontrack.com" className="text-blue-400 hover:underline">
                    dispute@boontrack.com
                  </a>
                </span>
              </div>
              <div className="flex items-start gap-1.5 pt-1 border-t border-slate-700/50 mt-1">
                <ExternalLink className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Layanan Pengaduan Konsumen Ditjen PKTN Kemendag RI:{" "}
                  <span className="text-amber-300 font-medium">WhatsApp 0853-1111-1010</span>
                </span>
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
