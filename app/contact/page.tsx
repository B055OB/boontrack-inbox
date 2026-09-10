import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { 
  Building2, 
  MapPin, 
  Mail, 
  Phone, 
  Clock, 
  ShieldCheck, 
  ArrowLeft,
  MessageSquare,
  ExternalLink,
  CheckCircle2
} from "lucide-react";
import Footer from "@/app/components/Footer";

export const metadata: Metadata = {
  title: "Hubungi Kami (Contact Us) | PT BOONTRACK INOVASI DIGITAL",
  description: "Informasi kontak resmi, alamat kantor operasional, email support, dan saluran pengaduan konsumen BoonTrack Shop.",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link 
              href="/"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition flex items-center gap-1.5 text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kembali ke Beranda</span>
            </Link>
            <div className="h-5 w-px bg-slate-200" />
            <span className="font-extrabold text-base tracking-tight text-slate-900">
              Boon<span className="text-blue-600">Track</span> <span className="text-xs font-medium text-slate-500">Contact Us</span>
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <a
              href="https://wa.me/6281237450222"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-1.5 rounded-lg transition shadow-sm"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Chat WhatsApp</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto px-4 py-10 sm:py-14 w-full">
        <div className="space-y-3 text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Kanal Komunikasi & Bantuan Resmi</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Hubungi Tim Operasional Kami
          </h1>
          <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
            Kami siap membantu kebutuhan teknis, informasi kemitraan, pertanyaan lisensi software SaaS, maupun konfirmasi pembayaran Anda.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Identitas Perusahaan & Alamat */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <Building2 className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-black text-slate-900">Entitas Resmi Penyelenggara</h2>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                Platform SaaS dan layanan belanja <strong>BoonTrack Shop (shop.boontrack.com)</strong> dimiliki serta dikelola secara legal oleh:
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-xs font-black text-slate-900">PT BOONTRACK INOVASI DIGITAL</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Badan Hukum Perseroan Terbatas Republik Indonesia</p>
              </div>
            </div>

            <div className="space-y-4 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-900 block mb-0.5">Alamat Kantor Operasional:</span>
                  <p className="text-slate-600 leading-relaxed">
                    Jl Saturnus Selatan Komplek Boemi Kirana A16, Buahbatu, Kota Bandung, Jawa Barat 40286, Indonesia.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-900 block mb-0.5">Jam Operasional Layanan:</span>
                  <p className="text-slate-600 leading-relaxed">
                    Senin – Jumat: 09.00 – 18.00 WIB<br />
                    Sabtu – Minggu: Layanan Darurat Tiket & On-Call System
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Saluran Kontak & Dukungan */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-black text-slate-900">Saluran Bantuan Langsung</h2>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                Hubungi saluran resmi di bawah untuk respon cepat dari tim spesialis kami:
              </p>
            </div>

            <div className="space-y-3 text-xs">
              {/* WhatsApp */}
              <a
                href="https://wa.me/6281237450222"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 flex items-center justify-between group transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-bold">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block">WhatsApp Customer Care</span>
                    <span className="text-emerald-700 font-semibold font-mono text-[11px]">+62 812-3745-0222</span>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-emerald-600 group-hover:translate-x-0.5 transition" />
              </a>

              {/* Email Support */}
              <a
                href="mailto:support@boontrack.com"
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 flex items-center justify-between group transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block">Email Support Layanan</span>
                    <span className="text-blue-600 font-medium text-[11px]">support@boontrack.com</span>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition" />
              </a>

              {/* Email Compliance */}
              <a
                href="mailto:compliance@boontrack.com"
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 flex items-center justify-between group transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 text-white flex items-center justify-center font-bold">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block">Legal, Privasi & Kepatuhan</span>
                    <span className="text-slate-600 font-medium text-[11px]">compliance@boontrack.com</span>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition" />
              </a>
            </div>

            {/* Regulatory Notice */}
            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
              <span className="font-bold text-slate-700 block">Layanan Pengaduan Konsumen (Kemendag RI):</span>
              <p className="leading-snug">
                Direktorat Jenderal Perlindungan Konsumen dan Tertib Niaga (Ditjen PKTN) Kementerian Perdagangan RI: WhatsApp <strong>0853-1111-1010</strong>.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Kepatuhan */}
      <Footer />
    </div>
  );
}
