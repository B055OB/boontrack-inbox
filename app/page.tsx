"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { 
  Dumbbell, 
  ShoppingBag, 
  Building2, 
  Briefcase, 
  ArrowRight, 
  Sparkles, 
  ShieldCheck, 
  Zap, 
  Layers,
  ChevronRight
} from "lucide-react";

interface VerticalModule {
  id: string;
  title: string;
  tagline: string;
  description: string;
  badge: string;
  path: string;
  icon: React.ReactNode;
  gradient: string;
  features: string[];
}

const VERTICAL_MODULES: VerticalModule[] = [
  {
    id: "commerce",
    title: "WhatsApp Commerce Engine",
    tagline: "Instant Storefront & Auto-Kasir",
    description: "Etalase digital instan dengan integrasi pembayaran QRIS real-time dan notifikasi WhatsApp delivery.",
    badge: "Most Popular",
    path: "/onlineboost",
    icon: <ShoppingBag className="w-6 h-6 text-emerald-400" />,
    gradient: "from-emerald-950/40 to-slate-900 border-emerald-800/30 hover:border-emerald-500/50",
    features: ["Auto-Kasir 24 Jam", "QRIS Multi-Tenant", "Multi-Tier Affiliate Attribution"]
  },
  {
    id: "gym",
    title: "Gym Access & POS Management",
    tagline: "Turnstile IoT & Member Tracking",
    description: "Sistem operasional gym lengkap dengan gate access kontrol QR, point of sales, dan komisi trainer.",
    badge: "Turnkey Hardware",
    path: "/gym",
    icon: <Dumbbell className="w-6 h-6 text-cyan-400" />,
    gradient: "from-cyan-950/40 to-slate-900 border-cyan-800/30 hover:border-cyan-500/50",
    features: ["Gate QR Scanner Relay", "Member Check-in History", "Trainer Session Booking"]
  },
  {
    id: "career",
    title: "AI Career Builder & ATS Engine",
    tagline: "Resume Parser & Document State",
    description: "Platform generasi dan optimasi CV berbasis AI dengan integrasi parsing dokumen DOCX/PDF.",
    badge: "AI Powered",
    path: "/career",
    icon: <Briefcase className="w-6 h-6 text-blue-400" />,
    gradient: "from-blue-950/40 to-slate-900 border-blue-800/30 hover:border-blue-500/50",
    features: ["ATS Score Analyzer", "Real-time DOCX Exporter", "WhatsApp Delivery Flow"]
  },
  {
    id: "enterprise",
    title: "Enterprise Solutions & Booking",
    tagline: "Multi-Unit Property Management",
    description: "Manajemen reservasi, billing multi-cabang, dan kontrol akses kamar hotel/studio terintegrasi.",
    badge: "B2B Engine",
    path: "/enterprise",
    icon: <Building2 className="w-6 h-6 text-indigo-400" />,
    gradient: "from-indigo-950/40 to-slate-900 border-indigo-800/30 hover:border-indigo-500/50",
    features: ["Multi-Property Routing", "Centralized Ledger", "Automated Billing Webhook"]
  }
];

export default function AppHubLandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100 font-sans flex flex-col antialiased">
      {/* Top Navbar */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center font-black text-white shadow-md shadow-blue-500/20">
              B
            </div>
            <div>
              <span className="font-black text-white text-base tracking-tight">BoonTrack App Hub</span>
              <p className="text-[10px] text-slate-400">Multi-Tenant SaaS Infrastructure</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/affiliate")}
              className="text-xs font-bold text-slate-300 hover:text-white px-3 py-2 rounded-xl hover:bg-slate-800 transition-all cursor-pointer"
            >
              Affiliate Portal
            </button>
            <button
              onClick={() => router.push("/manager")}
              className="text-xs font-bold text-indigo-400 hover:text-indigo-300 px-3 py-2 rounded-xl bg-indigo-950/50 border border-indigo-800/40 hover:bg-indigo-900/40 transition-all cursor-pointer"
            >
              Manager Control
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-6xl mx-auto px-4 py-12 flex-1 space-y-12">
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Vertical SaaS Orchestrator</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
            Pilih Ekosistem Bisnis Anda
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Infrastruktur multi-tenant siap pakai dengan automasi pembayaran Xendit, tracking referral native, dan sinkronisasi database real-time.
          </p>
        </div>

        {/* Vertical Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {VERTICAL_MODULES.map((mod) => (
            <div
              key={mod.id}
              onClick={() => router.push(mod.path)}
              className={`bg-gradient-to-br ${mod.gradient} border p-6 rounded-3xl transition-all duration-200 hover:scale-[1.01] hover:shadow-xl cursor-pointer flex flex-col justify-between group`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800">
                    {mod.icon}
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                    {mod.badge}
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-black text-white group-hover:text-blue-400 transition-colors">
                    {mod.title}
                  </h3>
                  <p className="text-xs font-semibold text-slate-400 mt-0.5">{mod.tagline}</p>
                  <p className="text-xs text-slate-400/90 mt-2.5 leading-relaxed">{mod.description}</p>
                </div>

                <div className="space-y-1.5 border-t border-slate-800/60 pt-3">
                  {mod.features.map((feat, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-slate-300">
                      <Zap className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-5 mt-4 border-t border-slate-800/40 flex items-center justify-between text-xs font-bold text-blue-400 group-hover:text-blue-300">
                <span>Buka Demo & Solusi</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-slate-800 text-center text-xs text-slate-500 bg-slate-900/40">
        © 2026 BoonTrack Multi-Tenant Engine • Consolidated Vertical Hub
      </footer>
    </div>
  );
}