import React from 'react';
import Link from 'next/link';
import { Sparkles, Users, Video, ExternalLink, ArrowRight, ShieldCheck, Star } from 'lucide-react';

export default function CreatorPortalRootPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 selection:bg-rose-500 selection:text-white">
      <div className="max-w-5xl mx-auto space-y-12">

        {/* Top Header */}
        <header className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-orange-500 p-[1px] shadow-lg shadow-rose-950/30">
              <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
                <Users className="w-5 h-5 text-rose-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg text-white tracking-tight">BoonTrack Creator</h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  CREATOR_V1
                </span>
              </div>
              <p className="text-xs text-slate-400">Portal Profil Kreator, Rate Card Digital, & Kolaborasi UGC</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://studio.boontrack.com/ugc-studio"
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors flex items-center gap-1.5 shadow-md shadow-rose-950/40"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Studio Script</span>
            </a>
          </div>
        </header>

        {/* Hero Section */}
        <section className="text-center max-w-3xl mx-auto space-y-6 pt-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-rose-300">
            <Sparkles className="w-3.5 h-3.5 text-rose-400" />
            <span>Ekosistem Kreator Terverifikasi BoonTrack</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight text-white leading-tight">
            Etalase Rate Card & Portofolio Kreator Profesional.
          </h2>
          <p className="text-sm md:text-base text-slate-400 leading-relaxed max-w-2xl mx-auto">
            Akses profil resmi kreator, pantau rate card video endorsement, dan lakukan pemesanan konten digital langsung terhubung dengan garansi sistem BoonTrack.
          </p>
        </section>

        {/* Feature Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <Star className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white">Rate Card Interaktif</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Kreator dapat menampilkan paket layanan video TikTok, Shopee Video, Instagram Reels, beserta harga dan estimasi penayangan konten secara transparan.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white">Pemesanan Terverifikasi</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Brand dan merchant dapat memesan endorsement secara aman menggunakan QRIS otomatis serta integrasi langsung ke WhatsApp konfirmasi tim BoonTrack.
            </p>
          </div>
        </section>

        {/* Call to Studio Banner */}
        <section className="p-6 md:p-8 rounded-2xl bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900 border border-rose-900/40 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-1 text-center md:text-left">
            <h4 className="text-base font-bold text-white flex items-center justify-center md:justify-start gap-2">
              Ingin Meracik Naskah Iklan Berkonversi Tinggi?
            </h4>
            <p className="text-xs text-slate-400">
              Gunakan BoonTrack Studio untuk membuat script 9 scene otomatis dengan hook pemenang.
            </p>
          </div>
          <a
            href="https://studio.boontrack.com"
            className="px-5 py-2.5 rounded-xl bg-white text-slate-950 hover:bg-slate-200 text-xs font-bold transition-colors inline-flex items-center gap-2 whitespace-nowrap shadow-lg"
          >
            <span>Kunjungi studio.boontrack.com</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </section>

      </div>
    </main>
  );
}
