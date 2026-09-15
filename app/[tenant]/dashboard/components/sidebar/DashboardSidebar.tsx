'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Store,
  ExternalLink,
  Link as LinkIcon,
  Package,
  LayoutTemplate,
  Brain,
  Radio,
  MessageSquare,
  Target,
  CreditCard,
  Lock,
  ShoppingBag,
  ChevronsUpDown,
  User,
  Crown,
  Globe,
  LogOut,
  Sparkles,
  Palette,
  Check,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

interface DashboardSidebarProps {
  tenantSlug: string;
  displayName: string;
  storeDisplayName?: string;
  storeLogoUrl?: string | null;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  isTeamScale?: boolean;
  isAdsPerformance?: boolean;
  isAdsTrackingUnlocked?: boolean;
  isSoloOrTrial?: boolean;
  productCount?: number;
  orderCount?: number;
  onOpenStoreSettings: () => void;
  onOpenUpgradeModal: () => void;
}

export default function DashboardSidebar({
  tenantSlug,
  displayName,
  storeDisplayName,
  storeLogoUrl,
  activeTab,
  setActiveTab,
  isTeamScale = false,
  isAdsPerformance = false,
  isAdsTrackingUnlocked = false,
  isSoloOrTrial = false,
  productCount = 0,
  orderCount = 0,
  onOpenStoreSettings,
  onOpenUpgradeModal,
}: DashboardSidebarProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsPopoverOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('Logout note:', err);
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
  };

  const nameToShow = storeDisplayName || displayName || tenantSlug;

  const isMainTabActive = (tab: string) => {
    if (tab === 'microsite' && (activeTab === 'microsite' || activeTab === 'links')) return true;
    if (tab === 'catalog' && (activeTab === 'catalog' || activeTab === 'products')) return true;
    if (tab === 'themes' && (activeTab === 'themes' || activeTab === 'storefront')) return true;
    if (tab === 'ai_knowledge' && activeTab === 'ai_knowledge') return true;
    return false;
  };

  const isPowerTabActive = (tab: string) => {
    if (tab === 'whatsapp' && (activeTab === 'whatsapp' || activeTab === 'broadcast' || activeTab === 'auto_reply')) return true;
    if (tab === 'inbox' && activeTab === 'inbox') return true;
    if (tab === 'ads_tracking' && activeTab === 'ads_tracking') return true;
    if (tab === 'finance' && (activeTab === 'finance' || activeTab === 'overview')) return true;
    if (tab === 'orders' && activeTab === 'orders') return true;
    return false;
  };

  return (
    <aside className="w-64 xl:w-72 bg-white border-r border-slate-200 h-screen sticky top-0 flex flex-col justify-between shrink-0 select-none z-40">
      {/* TOP SECTION: BRAND & NAVIGATION */}
      <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-6 no-scrollbar">
        {/* Brand Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-700 via-indigo-600 to-blue-500 text-white flex items-center justify-center font-black shadow-md shadow-indigo-600/20 shrink-0">
              B
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black text-slate-900 tracking-tight">BoonTrack</span>
                <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-extrabold text-[9px] border border-indigo-100">
                  HUB
                </span>
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
                Merchant Console
              </p>
            </div>
          </div>

          {/* Quick Action: Lihat Etalase Toko */}
          <Link
            href={`/${tenantSlug}`}
            target="_blank"
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200/80 text-slate-700 hover:text-indigo-600 text-xs font-bold transition group shadow-2xs"
          >
            <span className="flex items-center gap-2 truncate">
              <Store className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-600 shrink-0" />
              <span className="truncate">Lihat Etalase Toko</span>
            </span>
            <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 shrink-0" />
          </Link>
        </div>

        {/* 1. NAVIGASI UTAMA */}
        <div className="space-y-1">
          <span className="px-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">
            Navigasi Utama
          </span>

          {/* Links (Tautan & Microsite) */}
          <button
            type="button"
            onClick={() => setActiveTab('microsite')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              isMainTabActive('microsite')
                ? 'bg-indigo-50 text-indigo-700 font-black shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <LinkIcon
                className={`w-4 h-4 shrink-0 ${
                  isMainTabActive('microsite') ? 'text-indigo-600' : 'text-slate-400'
                }`}
              />
              <span className="truncate">Links (Tautan &amp; Microsite)</span>
            </div>
            {isMainTabActive('microsite') && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />
            )}
          </button>

          {/* Katalog & Produk */}
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              isMainTabActive('catalog')
                ? 'bg-indigo-50 text-indigo-700 font-black shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <Package
                className={`w-4 h-4 shrink-0 ${
                  isMainTabActive('catalog') ? 'text-indigo-600' : 'text-slate-400'
                }`}
              />
              <span className="truncate">Katalog &amp; Produk</span>
            </div>
            {productCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-600 border border-slate-200">
                {productCount}
              </span>
            ) : null}
          </button>

          {/* Tampilan (Design & Themes) */}
          <button
            type="button"
            onClick={() => setActiveTab('themes')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              isMainTabActive('themes')
                ? 'bg-indigo-50 text-indigo-700 font-black shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <Palette
                className={`w-4 h-4 shrink-0 ${
                  isMainTabActive('themes') ? 'text-indigo-600' : 'text-slate-400'
                }`}
              />
              <span className="truncate">Tampilan (Design &amp; Themes)</span>
            </div>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-indigo-100 text-indigo-700 border border-indigo-200">
              5 TEMA
            </span>
          </button>

          {/* AI Knowledge & Bot */}
          <button
            type="button"
            onClick={() => setActiveTab('ai_knowledge')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              isMainTabActive('ai_knowledge')
                ? 'bg-indigo-50 text-indigo-700 font-black shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <Brain
                className={`w-4 h-4 shrink-0 ${
                  isMainTabActive('ai_knowledge') ? 'text-indigo-600' : 'text-slate-400'
                }`}
              />
              <span className="truncate">AI Knowledge &amp; Bot</span>
            </div>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
              AI
            </span>
          </button>
        </div>

        {/* 2. MODUL POWER TOOLS */}
        <div className="space-y-1 pt-4 border-t border-slate-100">
          <span className="px-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">
            Modul Power Tools
          </span>

          {/* WhatsApp & Broadcast */}
          <button
            type="button"
            onClick={() => setActiveTab('whatsapp')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              isPowerTabActive('whatsapp')
                ? 'bg-indigo-50 text-indigo-700 font-black shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <Radio
                className={`w-4 h-4 shrink-0 ${
                  isPowerTabActive('whatsapp') ? 'text-emerald-600' : 'text-slate-400'
                }`}
              />
              <span className="truncate">WhatsApp &amp; Broadcast</span>
            </div>
            {isTeamScale ? (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                WABA
              </span>
            ) : (
              <Lock className="w-3 h-3 text-slate-400 shrink-0" />
            )}
          </button>

          {/* BoonTrack Inbox (Live CS) */}
          <button
            type="button"
            onClick={() => setActiveTab('inbox')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              isPowerTabActive('inbox')
                ? 'bg-indigo-50 text-indigo-700 font-black shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <MessageSquare
                className={`w-4 h-4 shrink-0 ${
                  isPowerTabActive('inbox') ? 'text-blue-600' : 'text-slate-400'
                }`}
              />
              <span className="truncate">BoonTrack Inbox (Live CS)</span>
            </div>
            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold border ${
                isTeamScale
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : isAdsPerformance
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200 flex items-center gap-0.5'
              }`}
            >
              {!isTeamScale && !isAdsPerformance && <Lock className="w-2.5 h-2.5" />}
              {isTeamScale ? 'PRO' : isAdsPerformance ? '2 SEATS' : '199k'}
            </span>
          </button>

          {/* Ads Tracking Pro */}
          <button
            type="button"
            onClick={() => setActiveTab('ads_tracking')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              isPowerTabActive('ads_tracking')
                ? 'bg-indigo-50 text-indigo-700 font-black shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <Target
                className={`w-4 h-4 shrink-0 ${
                  isPowerTabActive('ads_tracking') ? 'text-blue-600' : 'text-slate-400'
                }`}
              />
              <span className="truncate">Ads Tracking Pro</span>
            </div>
            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold border ${
                isAdsTrackingUnlocked
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200 flex items-center gap-0.5'
              }`}
            >
              {!isAdsTrackingUnlocked && <Lock className="w-2.5 h-2.5" />}
              {isAdsTrackingUnlocked ? 'CAPI' : '299k'}
            </span>
          </button>

          {/* Laporan Keuangan */}
          <button
            type="button"
            onClick={() => setActiveTab('finance')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              isPowerTabActive('finance')
                ? 'bg-indigo-50 text-indigo-700 font-black shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <CreditCard
                className={`w-4 h-4 shrink-0 ${
                  isPowerTabActive('finance') ? 'text-emerald-600' : 'text-slate-400'
                }`}
              />
              <span className="truncate">Laporan Keuangan</span>
            </div>
            {isSoloOrTrial ? (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-slate-100 text-slate-500 border border-slate-200 flex items-center gap-0.5">
                <Lock className="w-2.5 h-2.5" /> PRO
              </span>
            ) : null}
          </button>

          {/* Pesanan & Order */}
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              isPowerTabActive('orders')
                ? 'bg-emerald-50 text-emerald-800 font-black shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <ShoppingBag
                className={`w-4 h-4 shrink-0 ${
                  isPowerTabActive('orders') ? 'text-emerald-600' : 'text-slate-400'
                }`}
              />
              <span className="truncate">Pesanan &amp; Order</span>
            </div>
            {orderCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-emerald-600 text-white">
                {orderCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {/* BOTTOM SECTION: PROFIL TOKO & POPOVER PENGATURAN */}
      <div className="p-3 border-t border-slate-200 relative bg-slate-50/50" ref={popoverRef}>
        {/* Popover Menu Floating */}
        {isPopoverOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-white rounded-2xl border border-slate-200 shadow-xl p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-150 z-50">
            {/* Header info in popover */}
            <div className="px-3 py-2 border-b border-slate-100">
              <p className="text-xs font-black text-slate-900 truncate">{nameToShow}</p>
              <p className="text-[10px] font-bold text-slate-400 truncate">
                shop.boontrack.com/{tenantSlug}
              </p>
            </div>

            {/* Menu 1: Akun & Profil */}
            <button
              type="button"
              onClick={() => {
                setIsPopoverOpen(false);
                onOpenStoreSettings();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition text-left cursor-pointer"
            >
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>Akun &amp; Profil Toko</span>
            </button>

            {/* Menu 2: Billing & Langganan Paket */}
            <button
              type="button"
              onClick={() => {
                setIsPopoverOpen(false);
                onOpenUpgradeModal();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-purple-700 hover:bg-purple-50 transition text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Crown className="w-3.5 h-3.5 text-purple-600" />
                <span>Billing &amp; Langganan</span>
              </div>
              <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-purple-100 text-purple-800">
                UPGRADE
              </span>
            </button>

            {/* Menu 3: Pengaturan Domain */}
            <button
              type="button"
              onClick={() => {
                setIsPopoverOpen(false);
                setActiveTab('themes');
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition text-left cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-slate-500" />
              <span>Pengaturan Domain</span>
            </button>

            <div className="h-[1px] bg-slate-100 my-1" />

            {/* Menu 4: Keluar (Logout) */}
            <button
              type="button"
              onClick={() => {
                setIsPopoverOpen(false);
                handleLogout();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition text-left cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-500" />
              <span>Keluar (Logout)</span>
            </button>
          </div>
        )}

        {/* The Card Component at the bottom */}
        <button
          type="button"
          onClick={() => setIsPopoverOpen((prev) => !prev)}
          className={`w-full flex items-center justify-between p-2 rounded-2xl border transition cursor-pointer text-left ${
            isPopoverOpen
              ? 'bg-white border-indigo-400 shadow-sm ring-2 ring-indigo-500/10'
              : 'bg-white hover:bg-slate-100/80 border-slate-200/90 shadow-2xs'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Store Logo / Avatar */}
            {storeLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={storeLogoUrl}
                alt={nameToShow}
                className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white font-black text-xs flex items-center justify-center shrink-0 uppercase shadow-2xs">
                {nameToShow.charAt(0)}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-slate-900 truncate">
                  {nameToShow}
                </span>
              </div>
              <span
                className={`inline-block text-[9px] font-black px-1.5 py-0.2 rounded border leading-tight ${
                  isTeamScale
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : isAdsPerformance
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {isTeamScale ? 'Team Scale' : isAdsPerformance ? 'Ads Performance' : 'Solo'}
              </span>
            </div>
          </div>

          <ChevronsUpDown className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
        </button>
      </div>
    </aside>
  );
}
