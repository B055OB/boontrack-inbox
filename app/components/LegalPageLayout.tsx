import React from "react";
import Link from "next/link";
import { 
  ShieldCheck, 
  ArrowLeft, 
  FileText, 
  Lock, 
  AlertTriangle, 
  RotateCcw,
  Calendar,
  Building2
} from "lucide-react";
import Footer from "./Footer";

interface TocItem {
  id: string;
  label: string;
}

interface LegalPageLayoutProps {
  title: string;
  subtitle: string;
  currentPath: "/terms" | "/privacy" | "/acceptable-use" | "/refund";
  toc: TocItem[];
  children: React.ReactNode;
}

const LEGAL_NAV = [
  { path: "/terms", label: "Ketentuan Layanan", icon: FileText },
  { path: "/privacy", label: "Kebijakan Privasi", icon: Lock },
  { path: "/acceptable-use", label: "Kebijakan Penggunaan", icon: AlertTriangle },
  { path: "/refund", label: "Pengembalian Dana", icon: RotateCcw },
];

export default function LegalPageLayout({
  title,
  subtitle,
  currentPath,
  toc,
  children,
}: LegalPageLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link 
              href="/"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition flex items-center gap-1.5 text-xs font-semibold"
              title="Kembali ke Beranda Shop"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Ke Toko</span>
            </Link>
            <div className="h-5 w-px bg-slate-200" />
            <Link href="/" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center font-black text-white text-sm">
                B
              </div>
              <span className="font-extrabold text-base tracking-tight text-slate-900">
                BoonTrack <span className="text-blue-600 font-medium text-xs">Compliance</span>
              </span>
            </Link>
          </div>

          {/* Quick Tabs Legal Links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            {LEGAL_NAV.map((nav) => {
              const Icon = nav.icon;
              const isActive = currentPath === nav.path;
              return (
                <Link
                  key={nav.path}
                  href={nav.path}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    isActive
                      ? "bg-white text-blue-700 shadow-sm border border-slate-200/80"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-blue-600" : "text-slate-500"}`} />
                  <span>{nav.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Mobile Horizontal Sub-nav */}
        <div className="md:hidden border-t border-slate-200 overflow-x-auto py-2 px-4 flex gap-2 bg-slate-100/70">
          {LEGAL_NAV.map((nav) => {
            const isActive = currentPath === nav.path;
            return (
              <Link
                key={nav.path}
                href={nav.path}
                className={`whitespace-nowrap px-3 py-1 rounded-lg text-xs font-semibold transition shrink-0 ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200"
                }`}
              >
                {nav.label}
              </Link>
            );
          })}
        </div>
      </header>

      {/* Hero Banner Header */}
      <section className="bg-gradient-to-b from-white to-slate-50 border-b border-slate-200 py-10 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Dokumen Resmi Kepatuhan Regulasi & PMSE</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {title}
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl mx-auto">
            {subtitle}
          </p>

          {/* Metadata Badges */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5 font-medium bg-white px-3 py-1 rounded-md border border-slate-200">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Terakhir diperbarui: September 2026
            </span>
            <span className="flex items-center gap-1.5 font-medium bg-white px-3 py-1 rounded-md border border-slate-200">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              PT BOONTRACK INOVASI DIGITAL
            </span>
          </div>
        </div>
      </section>

      {/* Main Content Area with Side TOC */}
      <main className="flex-1 max-w-6xl mx-auto px-4 py-10 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Sticky Anchor Links Navigation (TOC) */}
          <aside className="lg:col-span-3 lg:sticky lg:top-24 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between pb-2 border-b border-slate-100">
              <span>Daftar Isi Pasal</span>
              <span className="text-[10px] font-normal text-slate-400">Anchor Nav</span>
            </div>
            <nav className="space-y-1">
              {toc.map((item, idx) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="block text-xs text-slate-600 hover:text-blue-600 hover:bg-blue-50/50 px-2 py-1.5 rounded-lg transition font-medium leading-tight"
                >
                  <span className="text-slate-400 mr-1.5 font-mono text-[11px]">{idx + 1}.</span>
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
              <p className="font-semibold text-slate-700">Butuh Bantuan Legal?</p>
              <p>Email: <a href="mailto:compliance@boontrack.com" className="text-blue-600 hover:underline">compliance@boontrack.com</a></p>
            </div>
          </aside>

          {/* Article Container */}
          <article className="lg:col-span-9 bg-white p-6 sm:p-10 rounded-2xl border border-slate-200 shadow-sm space-y-8 text-slate-700 text-sm leading-relaxed">
            {children}
          </article>
        </div>
      </main>

      {/* Global Footer */}
      <Footer />
    </div>
  );
}
