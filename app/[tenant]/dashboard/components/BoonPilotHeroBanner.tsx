'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  Wand2,
  MessageSquare,
  ChevronRight,
  Lock,
  Zap,
} from 'lucide-react';
import BoonPilotPitchModal from '@/app/[tenant]/dashboard/components/BoonPilotPitchModal';
import type { ProductItem } from '@/lib/product-catalog';

interface BoonPilotHeroBannerProps {
  tenantSlug: string;
  /** Trigger the parent to open new-product modal with the applied patch */
  onOpenNewProduct: () => void;
  /** Callback to also patch the productForm state from the parent */
  onApplyPitch?: (patch: Partial<ProductItem>) => void;
  /** Navigate to BoonPilot chat tab */
  onNavigateToChat: () => void;
  /** Current store vertical — pre-selects pitch modal vertical */
  storeCategory?: string;
  isCheckoutLite?: boolean;
}

type CanonicalVertical =
  | 'PHYSICAL'
  | 'DIGITAL'
  | 'FIELD_SERVICE'
  | 'PROFESSIONAL_SERVICE'
  | 'FOOD'
  | 'CREATOR_AGENCY';

function resolveVertical(storeCategory?: string): CanonicalVertical {
  const cat = (storeCategory || '').toUpperCase();
  if (['FOOD', 'FNB', 'KULINER'].some((k) => cat.includes(k))) return 'FOOD';
  if (['DIGITAL', 'COURSE', 'SOFTWARE'].some((k) => cat.includes(k))) return 'DIGITAL';
  if (['PROFESSIONAL', 'CONSULT', 'LEGAL', 'TRAVEL', 'UMROH'].some((k) => cat.includes(k))) return 'PROFESSIONAL_SERVICE';
  if (['AGENCY', 'CREATOR'].some((k) => cat.includes(k))) return 'CREATOR_AGENCY';
  if (['FIELD_SERVICE', 'SERVICE', 'JASA', 'REPAIR'].some((k) => cat.includes(k))) return 'FIELD_SERVICE';
  return 'PHYSICAL';
}

export default function BoonPilotHeroBanner({
  tenantSlug,
  onOpenNewProduct,
  onApplyPitch,
  onNavigateToChat,
  storeCategory,
  isCheckoutLite = false,
}: BoonPilotHeroBannerProps) {
  const [isPitchModalOpen, setIsPitchModalOpen] = useState(false);

  const handleApplyPitch = (patch: Partial<ProductItem>) => {
    if (onApplyPitch) {
      onApplyPitch(patch);
    }
    // Open new product modal so merchant sees the pre-filled form
    onOpenNewProduct();
  };

  return (
    <>
      {/* ── BoonPilot Hero Banner ─────────────────────────────────────────── */}
      <div className="relative w-full rounded-3xl overflow-hidden border border-indigo-200/60 shadow-sm">
        {/* Background gradient layer */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#1e1b4b]" />
        {/* Decorative blobs */}
        <div className="absolute -top-8 -right-8 w-52 h-52 rounded-full bg-violet-600/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />

        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5 p-5 sm:p-6">
          {/* Left: Icon + Text */}
          <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-900/40">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              {/* Online ping */}
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-[#1e1b4b]" />
              </span>
            </div>

            {/* Copy */}
            <div className="min-w-0">
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-violet-500/20 border border-violet-400/30 text-[10px] font-black uppercase tracking-wider text-violet-200 mb-2">
                <Zap className="w-3 h-3 text-violet-300" />
                <span>✨ ASISTEN OPERASIONAL BISNIS</span>
                <span className="ml-1.5 flex items-center gap-1 text-emerald-300">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                  <span>🟢 Online &amp; Siap Bantu</span>
                </span>
              </div>

              <h2 className="text-sm sm:text-base font-black text-white tracking-tight leading-tight">
                BoonPilot: Partner Operasional & Copywriter Toko Anda
              </h2>
              <p className="text-xs text-indigo-200/80 leading-relaxed mt-1.5 line-clamp-2 sm:line-clamp-none">
                BoonPilot bukan sekadar pusat bantuan teknis. Gunakan BoonPilot untuk merancang copywriting halaman
                penawaran produk baru, mengevaluasi efektivitas closing chat WhatsApp, atau merancang strategi diskon berkala.
              </p>
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex sm:flex-col gap-2.5 shrink-0 sm:min-w-[200px]">
            {/* Primary CTA */}
            {isCheckoutLite ? (
              <button
                type="button"
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-200 text-xs font-black cursor-not-allowed opacity-80"
                disabled
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Bikin Penawaran Produk Baru</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsPitchModalOpen(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 text-white text-xs font-black transition active:scale-95 cursor-pointer shadow-md shadow-indigo-900/40 group"
              >
                <Wand2 className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
                <span>✨ Bikin Penawaran Produk Baru</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-70" />
              </button>
            )}

            {/* Secondary CTA */}
            <button
              type="button"
              onClick={onNavigateToChat}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs font-bold transition active:scale-95 cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>💬 Diskusi Strategi Toko</span>
            </button>
          </div>
        </div>
      </div>

      {/* Pitch Modal */}
      <BoonPilotPitchModal
        isOpen={isPitchModalOpen}
        onClose={() => setIsPitchModalOpen(false)}
        tenantSlug={tenantSlug}
        defaultVertical={resolveVertical(storeCategory)}
        isCheckoutLite={isCheckoutLite}
        onApply={handleApplyPitch}
      />
    </>
  );
}
