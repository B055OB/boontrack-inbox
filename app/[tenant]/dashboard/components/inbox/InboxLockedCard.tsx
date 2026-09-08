'use client';

import React from 'react';
import { Lock, Zap, ArrowRight, MessageSquare } from 'lucide-react';
import { getPlatformWhatsApp } from '@/lib/tenant-config';

export default function InboxLockedCard({ tenantSlug }: { tenantSlug: string }) {
  const handleUpgradeClick = () => {
    const text = encodeURIComponent(
      `Halo Tim BoonTrack, saya ingin buka akses Live Chat CS Inbox untuk toko "${tenantSlug}". Mohon panduan upgrade ke paket Ads Performance.`
    );
    window.open(`https://wa.me/${getPlatformWhatsApp()}?text=${text}`, '_blank');
  };

  return (
    <div className="min-h-[460px] flex flex-col items-center justify-center p-6 bg-white rounded-3xl border border-slate-200 shadow-xs text-center">
      <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mb-4 shadow-inner">
        <Lock className="w-7 h-7" />
      </div>

      <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-black uppercase tracking-wider mb-2">
        Khusus Tier Ads Performance & Team Scale
      </span>

      <h2 className="text-xl font-black text-slate-900 tracking-tight max-w-md">
        Fitur Multi-Seat CS Inbox Masih Terkunci
      </h2>

      <p className="text-xs text-slate-500 mt-2 max-w-md leading-relaxed">
        Paket <strong>Solo (199k)</strong> difokuskan untuk etalase katalog & otomatisasi pesanan mandiri. Untuk mengelola live chat WhatsApp multi-agent bersama tim CS, silakan beralih ke <strong>Ads Performance (299k)</strong>.
      </p>

      <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={handleUpgradeClick}
          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-md shadow-blue-600/20 transition cursor-pointer"
        >
          <Zap className="w-4 h-4 fill-white" />
          <span>Upgrade ke Ads Performance (299k)</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}