'use client';

import React, { useRef, useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Package,
  ShoppingBag,
  Brain,
  CreditCard,
  MessageSquare,
  Lock,
  Target,
  Truck,
  Calendar,
  Download,
  Radio,
  LayoutTemplate,
} from 'lucide-react';

export type DashboardTab =
  | 'inbox'
  | 'catalog'
  | 'products'
  | 'orders'
  | 'microsite'
  | 'storefront'
  | 'finance'
  | 'ai_knowledge'
  | 'ads_tracking'
  | 'shipping'
  | 'booking'
  | 'downloads'
  | 'broadcast'
  | 'whatsapp'
  | 'settings';

export interface NavTabsPermissions {
  hasInbox?: boolean;
  hasCapi?: boolean;
  hasBroadcast?: boolean;
  isSolo?: boolean;
  isAdsPerformance?: boolean;
  isTeamScale?: boolean;
}

interface NavTabsProps {
  activeTab: any;
  setActiveTab: (tab: any) => void;
  isTeamScale?: boolean;
  isAdsPerformance?: boolean;
  isAdsTrackingUnlocked?: boolean;
  isSoloOrTrial?: boolean;
  permissions?: NavTabsPermissions;
  productCount?: number;
  orderCount?: number;
  storeCategory?: string;
  businessType?: string;
}

export default function NavTabs({
  activeTab,
  setActiveTab,
  isTeamScale = false,
  isAdsPerformance = false,
  isAdsTrackingUnlocked,
  isSoloOrTrial = false,
  permissions = {
    hasInbox: true,
    hasCapi: true,
    hasBroadcast: true,
    isSolo: false,
    isAdsPerformance: false,
    isTeamScale: false,
  },
  productCount = 0,
  orderCount = 0,
  storeCategory = 'PHYSICAL',
  businessType,
}: NavTabsProps) {
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const teamScaleActive = isTeamScale || permissions.isTeamScale;

  // Resolusi kategori toko fisik vs digital vs jasa yang ketat
  const rawCat = (businessType || storeCategory || 'PHYSICAL').toUpperCase();
  const isPhysical =
    ['PHYSICAL', 'RETAIL', 'FNB', 'RETAIL_PHYSICAL'].includes(rawCat) ||
    rawCat.includes('PHYSICAL') ||
    rawCat.includes('RETAIL');

  const isService =
    !isPhysical && (
      ['LOCAL_SERVICE', 'FIELD_SERVICE', 'SERVICE', 'PROFESSIONAL_CONSULT'].includes(rawCat) ||
      rawCat.includes('SERVICE') ||
      rawCat.includes('LOCAL')
    );

  const isDigital = !isPhysical && !isService;

  // Entitlement Ads Tracking Pro: terkunci untuk Solo/Trial
  const capiUnlocked = typeof isAdsTrackingUnlocked === 'boolean'
    ? isAdsTrackingUnlocked
    : Boolean(permissions?.hasCapi && !permissions?.isSolo && !isSoloOrTrial && (isAdsPerformance || teamScaleActive));

  // Entitlement Laporan & Keuangan: terkunci untuk Solo/Trial
  const financeUnlocked = !isSoloOrTrial;

  const checkTabsScroll = () => {
    if (tabsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabsRef.current;
      setCanScrollLeft(scrollLeft > 4);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
    }
  };

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    checkTabsScroll();

    el.addEventListener('scroll', checkTabsScroll, { passive: true });
    window.addEventListener('resize', checkTabsScroll);

    return () => {
      el.removeEventListener('scroll', checkTabsScroll);
      window.removeEventListener('resize', checkTabsScroll);
    };
  }, []);

  const scrollTabs = (offset: number) => {
    tabsRef.current?.scrollBy({ left: offset, behavior: 'smooth' });
  };

  return (
    <div className="px-2 sm:px-6 flex items-center justify-between gap-2 touch-manipulation bg-white relative z-50 isolate w-full max-w-full">
      <div className="relative flex-1 min-w-0 flex items-center">
        {canScrollLeft && (
          <>
            <div className="absolute left-0 top-0 bottom-0 w-8 sm:w-12 bg-gradient-to-r from-white via-white/80 to-transparent pointer-events-none z-40" />
            <button
              type="button"
              onClick={() => scrollTabs(-200)}
              aria-label="Scroll left"
              className="hidden sm:flex absolute left-0 z-50 w-6 h-6 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-md border border-slate-200 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        <div
          ref={tabsRef}
          className="flex items-center gap-1 sm:gap-2 overflow-x-auto whitespace-nowrap scrollbar-none no-scrollbar text-xs font-bold w-full max-w-full min-w-0 py-1 relative z-30"
        >
          {/* TAB 1: KATALOG PRODUK & LAYANAN */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'catalog' || activeTab === 'products'}
            onClick={() => setActiveTab('catalog')}
            className={`flex-shrink-0 shrink-0 py-2.5 sm:py-3.5 px-2.5 sm:px-3 border-b-2 flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
              activeTab === 'catalog' || activeTab === 'products'
                ? 'border-blue-600 text-blue-600 bg-blue-50/60 sm:bg-transparent rounded-t-lg sm:rounded-none'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Package className="w-4 h-4 shrink-0" />
            <span>Katalog Produk ({productCount})</span>
          </button>

          {/* TAB: TAMPILAN & MICROSITE */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'microsite' || activeTab === 'storefront'}
            onClick={() => setActiveTab('microsite')}
            className={`flex-shrink-0 shrink-0 py-2.5 sm:py-3.5 px-2.5 sm:px-3 border-b-2 flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
              activeTab === 'microsite' || activeTab === 'storefront'
                ? 'border-blue-600 text-blue-600 bg-blue-50/60 sm:bg-transparent rounded-t-lg sm:rounded-none'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <LayoutTemplate className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Tampilan &amp; Microsite</span>
          </button>

          {/* TAB 2: AI KNOWLEDGE & BOT */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ai_knowledge'}
            onClick={() => setActiveTab('ai_knowledge')}
            className={`flex-shrink-0 shrink-0 py-2.5 sm:py-3.5 px-2.5 sm:px-3 border-b-2 flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
              activeTab === 'ai_knowledge'
                ? 'border-blue-600 text-blue-600 bg-blue-50/60 sm:bg-transparent rounded-t-lg sm:rounded-none'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Brain className="w-4 h-4 shrink-0" />
            <span>AI Knowledge & Bot</span>
          </button>

          {/* TAB 3: WHATSAPP & BROADCAST */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'whatsapp' || activeTab === 'broadcast'}
            onClick={() => setActiveTab('whatsapp')}
            className={`flex-shrink-0 shrink-0 py-2.5 sm:py-3.5 px-2.5 sm:px-3 border-b-2 flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
              activeTab === 'whatsapp' || activeTab === 'broadcast'
                ? 'border-blue-600 text-blue-600 bg-blue-50/60 sm:bg-transparent rounded-t-lg sm:rounded-none'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Radio className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="flex items-center gap-1">
              WhatsApp & Broadcast
              {!permissions.hasBroadcast && !teamScaleActive && (
                <Lock className="w-3 h-3 text-amber-500" />
              )}
            </span>
            {teamScaleActive && (
              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[10px] font-extrabold">
                WABA
              </span>
            )}
          </button>

          {/* TAB 4: CONDITIONAL — LOGISTIK (Fisik) / BOOKING (Jasa) / AKSES UNDUH (Digital) */}
          {isPhysical && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'shipping' || activeTab === 'biteship'}
              onClick={() => setActiveTab('shipping')}
              className={`flex-shrink-0 shrink-0 py-2.5 sm:py-3.5 px-2.5 sm:px-3 border-b-2 flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
                activeTab === 'shipping' || activeTab === 'biteship'
                  ? 'border-blue-600 text-blue-600 bg-blue-50/60 sm:bg-transparent rounded-t-lg sm:rounded-none'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Logistik & Ekspedisi</span>
              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[10px] font-extrabold">
                MULTI-KURIR
              </span>
            </button>
          )}

          {isService && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'booking'}
              onClick={() => setActiveTab('booking')}
              className={`flex-shrink-0 shrink-0 py-2.5 sm:py-3.5 px-2.5 sm:px-3 border-b-2 flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
                activeTab === 'booking'
                  ? 'border-blue-600 text-blue-600 bg-blue-50/60 sm:bg-transparent rounded-t-lg sm:rounded-none'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Booking & Jadwal</span>
              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 border border-blue-200 rounded text-[10px] font-extrabold">
                JASA
              </span>
            </button>
          )}

          {isDigital && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'downloads'}
              onClick={() => setActiveTab('downloads')}
              className={`flex-shrink-0 shrink-0 py-2.5 sm:py-3.5 px-2.5 sm:px-3 border-b-2 flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
                activeTab === 'downloads'
                  ? 'border-blue-600 text-blue-600 bg-blue-50/60 sm:bg-transparent rounded-t-lg sm:rounded-none'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Download className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Akses Unduh</span>
              <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-800 border border-indigo-200 rounded text-[10px] font-extrabold">
                DIGITAL
              </span>
            </button>
          )}

          {/* TAB 5: PESANAN / ORDER */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'orders'}
            onClick={() => setActiveTab('orders')}
            className={`flex-shrink-0 shrink-0 py-2.5 sm:py-3.5 px-2.5 sm:px-3 border-b-2 flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
              activeTab === 'orders'
                ? 'border-blue-600 text-blue-600 bg-blue-50/60 sm:bg-transparent rounded-t-lg sm:rounded-none'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <ShoppingBag className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Pesanan / Order</span>
            {orderCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                {orderCount}
              </span>
            )}
          </button>

          {/* TAB 6: LAPORAN & KEUANGAN (🔒 untuk Solo/Trial) */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'finance' || activeTab === 'integration' || activeTab === 'overview'}
            onClick={() => setActiveTab('finance')}
            className={`flex-shrink-0 shrink-0 py-2.5 sm:py-3.5 px-2.5 sm:px-3 border-b-2 flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
              activeTab === 'finance' || activeTab === 'integration' || activeTab === 'overview'
                ? 'border-blue-600 text-blue-600 bg-blue-50/60 sm:bg-transparent rounded-t-lg sm:rounded-none'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="flex items-center gap-1.5">
              <span>Laporan & Keuangan</span>
              {!financeUnlocked && (
                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-extrabold flex items-center gap-0.5">
                  <Lock className="w-2.5 h-2.5 text-amber-600" />
                  <span>PRO</span>
                </span>
              )}
            </span>
          </button>

          {/* TAB 7: ADS TRACKING PRO (🔒 untuk Solo/Trial) */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ads_tracking'}
            onClick={() => setActiveTab('ads_tracking')}
            className={`flex-shrink-0 shrink-0 py-2.5 sm:py-3.5 px-2.5 sm:px-3 border-b-2 flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
              activeTab === 'ads_tracking'
                ? 'border-blue-600 text-blue-600 bg-blue-50/60 sm:bg-transparent rounded-t-lg sm:rounded-none'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Target className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="flex items-center gap-1.5">
              <span>Ads Tracking Pro</span>
              {!capiUnlocked && (
                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-extrabold flex items-center gap-0.5">
                  <Lock className="w-2.5 h-2.5 text-amber-600" />
                  <span>299k</span>
                </span>
              )}
            </span>
          </button>

          {/* TAB 8: BOONTRACK INBOX (Live CS) — Paling Kanan */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'inbox'}
            onClick={() => setActiveTab('inbox')}
            className={`flex-shrink-0 shrink-0 py-2.5 sm:py-3.5 px-2.5 sm:px-3 border-b-2 flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
              activeTab === 'inbox'
                ? 'border-blue-600 text-blue-600 bg-blue-50/60 sm:bg-transparent rounded-t-lg sm:rounded-none'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-blue-600 shrink-0" />
            <span>BoonTrack Inbox (Live CS)</span>
            {!permissions.hasInbox ? (
              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded text-[10px] font-extrabold flex items-center gap-1">
                <Lock className="w-2.5 h-2.5 text-amber-500" /> 199k
              </span>
            ) : teamScaleActive ? (
              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 rounded text-[10px] font-extrabold">PRO</span>
            ) : (
              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 border border-blue-200 rounded text-[10px] font-extrabold">2 SEATS</span>
            )}
          </button>
        </div>

        {canScrollRight && (
          <>
            <div className="absolute right-0 top-0 bottom-0 w-8 sm:w-12 bg-gradient-to-l from-white via-white/80 to-transparent pointer-events-none z-40" />
            <button
              type="button"
              onClick={() => scrollTabs(200)}
              aria-label="Scroll right"
              className="hidden sm:flex absolute right-0 z-50 w-6 h-6 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-md border border-slate-200 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}