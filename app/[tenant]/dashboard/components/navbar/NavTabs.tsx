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
  Radio,
} from 'lucide-react';
import { DashboardTab } from '../../hooks/useDashboardData';

interface NavTabsProps {
  activeTab: DashboardTab;
  setActiveTab: (tab: DashboardTab) => void;
  permissions: {
    hasInbox: boolean;
    hasCapi: boolean;
    hasBroadcast: boolean;
    isSolo: boolean;
    isAdsPerformance: boolean;
    isTeamScale: boolean;
  };
  productCount?: number;
  orderCount?: number;
}

export default function NavTabs({
  activeTab,
  setActiveTab,
  permissions,
  productCount = 0,
  orderCount = 0,
}: NavTabsProps) {
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

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
          {/* TAB 1: INBOX */}
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
            ) : permissions.isTeamScale ? (
              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 rounded text-[10px] font-extrabold">PRO</span>
            ) : (
              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 border border-blue-200 rounded text-[10px] font-extrabold">2 SEATS</span>
            )}
          </button>

          {/* TAB 2: KATALOG PRODUK */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'catalog'}
            onClick={() => setActiveTab('catalog')}
            className={`flex-shrink-0 shrink-0 py-2.5 sm:py-3.5 px-2.5 sm:px-3 border-b-2 flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
              activeTab === 'catalog'
                ? 'border-blue-600 text-blue-600 bg-blue-50/60 sm:bg-transparent rounded-t-lg sm:rounded-none'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Package className="w-4 h-4 shrink-0" />
            <span>Katalog Produk ({productCount})</span>
          </button>

          {/* TAB 3: PESANAN / ORDER (Task #2) */}
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

          {/* TAB 4: LAPORAN & KEUANGAN */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'finance'}
            onClick={() => setActiveTab('finance')}
            className={`flex-shrink-0 shrink-0 py-2.5 sm:py-3.5 px-2.5 sm:px-3 border-b-2 flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
              activeTab === 'finance'
                ? 'border-blue-600 text-blue-600 bg-blue-50/60 sm:bg-transparent rounded-t-lg sm:rounded-none'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Laporan & Keuangan</span>
          </button>

          {/* TAB 5: AI KNOWLEDGE */}
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

          {/* TAB 6: ADS TRACKING PRO */}
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
            <span className="flex items-center gap-1">
              Ads Tracking Pro
              {!permissions.hasCapi && <Lock className="w-3 h-3 text-amber-500" />}
            </span>
          </button>

          {/* TAB 7: LOGISTIK LINCAH */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'shipping'}
            onClick={() => setActiveTab('shipping')}
            className={`flex-shrink-0 shrink-0 py-2.5 sm:py-3.5 px-2.5 sm:px-3 border-b-2 flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
              activeTab === 'shipping'
                ? 'border-blue-600 text-blue-600 bg-blue-50/60 sm:bg-transparent rounded-t-lg sm:rounded-none'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Logistik Lincah.id</span>
            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[10px] font-extrabold">
              ONGKIR
            </span>
          </button>

          {/* TAB 8: BROADCAST */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'broadcast'}
            onClick={() => setActiveTab('broadcast')}
            className={`flex-shrink-0 shrink-0 py-2.5 sm:py-3.5 px-2.5 sm:px-3 border-b-2 flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
              activeTab === 'broadcast'
                ? 'border-blue-600 text-blue-600 bg-blue-50/60 sm:bg-transparent rounded-t-lg sm:rounded-none'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Radio className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="flex items-center gap-1">
              Broadcast WA
              {!permissions.hasBroadcast && <Lock className="w-3 h-3 text-amber-500" />}
            </span>
          </button>

          {/* TAB 9: KONEKSI WA */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'whatsapp'}
            onClick={() => setActiveTab('whatsapp')}
            className={`flex-shrink-0 shrink-0 py-2.5 sm:py-3.5 px-2.5 sm:px-3 border-b-2 flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer ${
              activeTab === 'whatsapp'
                ? 'border-blue-600 text-blue-600 bg-blue-50/60 sm:bg-transparent rounded-t-lg sm:rounded-none'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Koneksi WhatsApp</span>
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