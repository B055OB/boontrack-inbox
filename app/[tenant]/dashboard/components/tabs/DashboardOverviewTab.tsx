'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  Package,
  Radio,
  Store,
  LayoutTemplate,
  QrCode,
  ArrowRight,
  TrendingUp,
  Eye,
  MessageSquare,
  Receipt,
  Wallet,
  Zap,
  CheckCircle2,
  ChevronRight,
  Download,
  Share2,
  Newspaper,
  Layers,
  ShoppingBag,
  MessageCircle,
} from 'lucide-react';
import { ProductItem } from '@/lib/product-catalog';
import { getStorefrontUrl } from '@/lib/utils/storefrontUrl';
import { getSupabase } from '@/lib/supabaseClient';
import StoreBioLinkWidget from '@/app/[tenant]/dashboard/components/StoreBioLinkWidget';
import AiSessionQuotaMeter from '@/app/[tenant]/dashboard/components/AiSessionQuotaMeter';
import { isValidPaidStatus, extractOrderAmount } from '@/lib/finance-engine';


interface DashboardOverviewTabProps {
  tenantSlug: string;
  displayName: string;
  storeDisplayName?: string;
  storeBio?: string;
  storeLogoUrl?: string;
  storeQrisUrl?: string;
  waStatus: string;
  connectedPhone?: string | null;
  products: ProductItem[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transactions: any[];
  totalOmzet: number;
  isTeamScale?: boolean;
  isAdsPerformance?: boolean;
  isSoloOrTrial?: boolean;
  isCheckoutLite?: boolean;
  isTrialActive?: boolean;
  tierLabel?: string;
  trialDaysLeft?: number | null;
  storeCategory?: string;
  chatConversationsCount?: number;
  onOpenStoreSettings: () => void;
  onOpenNewProduct: () => void;
  onApplyPitch?: (patch: Partial<ProductItem>) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNavigateTab: (tab: any) => void;
  onSavedFeedback?: (msg: string) => void;

}

export default function DashboardOverviewTab({
  tenantSlug,
  displayName,
  storeDisplayName,
  storeBio,
  storeLogoUrl,
  storeQrisUrl,
  waStatus,
  connectedPhone,
  products = [],
  transactions = [],
  totalOmzet = 0,
  isTeamScale = false,
  isAdsPerformance = false,
  isSoloOrTrial = false,
  isCheckoutLite = false,
  isTrialActive = false,
  tierLabel,
  trialDaysLeft,
  storeCategory,
  chatConversationsCount,
  onOpenStoreSettings,
  onOpenNewProduct,
  onApplyPitch,
  onNavigateTab,
  onSavedFeedback,
}: DashboardOverviewTabProps) {
  const [hasCopiedUrl, setHasCopiedUrl] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<'default' | 'microsite' | 'personal'>('default');
  const [isUpdatingTemplate, setIsUpdatingTemplate] = useState(false);

  const activeStoreName = storeDisplayName || displayName;
  const storePublicUrl = getStorefrontUrl(tenantSlug);

  // Time of day greeting
  const timeGreeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 11) return 'Pagi';
    if (hour < 15) return 'Siang';
    if (hour < 18) return 'Sore';
    return 'Malam';
  }, []);

  // Fetch active storefront template from Supabase
  useEffect(() => {
    let isMounted = true;
    async function loadTenantData() {
      try {
        const supabase = getSupabase();
        if (!supabase) return;

        const tenantRes = await supabase
          .from('tenants')
          .select('metadata')
          .eq('slug', tenantSlug)
          .maybeSingle();

        if (isMounted) {
          const meta = tenantRes.data?.metadata || {};
          const t =
            meta.selected_template ||
            meta.storefront_template ||
            meta.template ||
            meta.theme?.template ||
            'default';
          if (t === 'microsite' || t === 'personal') {
            setActiveTemplate(t);
          } else {
            setActiveTemplate('default');
          }
        }
      } catch (err) {
        console.warn('Gagal memuat konfigurasi tenant di dashboard:', err);
      }
    }
    loadTenantData();
    return () => {
      isMounted = false;
    };
  }, [tenantSlug]);

  // Handle template selection
  const handleSelectTemplate = async (templateKey: 'default' | 'microsite' | 'personal') => {
    if (isUpdatingTemplate || activeTemplate === templateKey) return;
    setIsUpdatingTemplate(true);
    setActiveTemplate(templateKey);

    try {
      // 1. Direct update to Supabase tenants.metadata
      const supabase = getSupabase();
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('id, metadata')
        .eq('slug', tenantSlug)
        .maybeSingle();

      if (tenantRow?.id) {
        const updatedMeta = {
          ...(tenantRow.metadata || {}),
          selected_template: templateKey,
          storefront_template: templateKey,
          template: templateKey,
          theme: {
            ...(tenantRow.metadata?.theme || {}),
            template: templateKey,
          },
        };
        await supabase
          .from('tenants')
          .update({ metadata: updatedMeta })
          .eq('id', tenantRow.id);
      }

      // 2. Sync via settings API route
      await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: templateKey,
          theme: { template: templateKey },
        }),
      });

      if (onSavedFeedback) {
        const nameMap: Record<string, string> = {
          default: 'Katalog Toko (Default)',
          microsite: 'Microsite Bio-Link',
          personal: 'Personal Brand & Authority',
        };
        onSavedFeedback(`✅ Template etalase berhasil diubah ke ${nameMap[templateKey]}!`);
      }
    } catch (err) {
      console.warn('Gagal menyimpan template etalase:', err);
    } finally {
      setIsUpdatingTemplate(false);
    }
  };

  const handleCopyStoreLink = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(storePublicUrl);
      } else if (typeof document !== 'undefined') {
        const textArea = document.createElement('textarea');
        textArea.value = storePublicUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setHasCopiedUrl(true);
      if (onSavedFeedback) onSavedFeedback('Tautan toko berhasil disalin!');
      setTimeout(() => setHasCopiedUrl(false), 2500);
    } catch (err) {
      console.warn('Gagal menyalin tautan toko:', err);
    }
  };

  // Status indikator toko & onboarding
  const isPlatformPhone = Boolean(connectedPhone && (
    connectedPhone.includes('85181830080') ||
    connectedPhone.includes('85179555449') ||
    connectedPhone.includes('85139555449')
  ));
  const isWaConnected = (waStatus === 'CONNECTED' || Boolean(connectedPhone)) && !isPlatformPhone;
  const isProductAdded = products.length > 0;

  // Real 7-day Analytics (100% dynamic, zero dummy numbers)
  const [realVisits, setRealVisits] = useState<number | null>(null);
  const [realChatSessions, setRealChatSessions] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadAnalyticsSummary() {
      if (!tenantSlug) return;
      try {
        const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/analytics/summary`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && isMounted) {
            setRealVisits(typeof json.visits === 'number' ? json.visits : 0);
            setRealChatSessions(typeof json.chat_sessions === 'number' ? json.chat_sessions : 0);
          }
        }
      } catch (err) {
        console.warn('Gagal memuat ringkasan analitik:', err);
      }
    }
    loadAnalyticsSummary();
    return () => {
      isMounted = false;
    };
  }, [tenantSlug]);

  const totalVisits = realVisits !== null ? realVisits : 0;

  const recentOrdersCount = useMemo(() => {
    if (!transactions || transactions.length === 0) return 0;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = transactions.filter((t: any) => {
      const tTime = new Date(t.created_at || t.date || 0).getTime();
      return !isNaN(tTime) && tTime >= sevenDaysAgo;
    });
    return recent.length;
  }, [transactions]);

  const totalChatInteractions = useMemo(() => {
    if (realChatSessions !== null) return realChatSessions;
    if (chatConversationsCount !== undefined && chatConversationsCount !== null) {
      return chatConversationsCount;
    }
    return 0;
  }, [realChatSessions, chatConversationsCount]);

  const recentOmzet = useMemo(() => {
    if (!transactions || transactions.length === 0) return totalOmzet > 0 ? totalOmzet : 0;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const paidRecent = transactions.filter((t: any) => {
      const tTime = new Date(t.created_at || t.date || 0).getTime();
      const status = t.payment_status || t.status;
      const isPaid = isValidPaidStatus(status);
      return isPaid && !isNaN(tTime) && tTime >= sevenDaysAgo;
    });
    const calculated = paidRecent.reduce(
      (sum: number, t: any) => sum + extractOrderAmount(t),
      0
    );
    if (calculated > 0) return calculated;
    return totalOmzet > 0 ? totalOmzet : 0;
  }, [transactions, totalOmzet]);

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* ── BANNER PANDUAN PEMULA (BIRU/UNGU) PALING ATAS ── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 text-white p-5 sm:p-7 md:p-8 border border-indigo-700/40 shadow-xl space-y-6">
        {/* Ambient background glow decoration */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-purple-500/15 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-blue-500/15 blur-3xl pointer-events-none" />

        {/* Header: Sapaan Interaktif & Quick Action Bar */}
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5 border-b border-indigo-800/50 pb-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/25 text-indigo-300 border border-indigo-400/30 backdrop-blur-xs">
                <Sparkles className="w-3 h-3 text-amber-300 animate-pulse" />
                <span>Panduan Pemula &bull; Setup Toko Otomatis</span>
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                  tierLabel && tierLabel.toLowerCase().includes('grant')
                    ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                    : isCheckoutLite || (tierLabel && tierLabel.toLowerCase().includes('checkout'))
                    ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                    : isTeamScale || (tierLabel && tierLabel.toLowerCase().includes('team'))
                    ? 'bg-purple-500/20 text-purple-300 border-purple-400/40'
                    : isAdsPerformance || (tierLabel && (tierLabel.toLowerCase().includes('ads') || tierLabel.toLowerCase().includes('performance')))
                    ? 'bg-blue-500/20 text-blue-300 border-blue-400/40'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                }`}
              >
                {tierLabel ||
                  (isCheckoutLite
                    ? 'Paket Checkout'
                    : isTeamScale
                    ? 'Team Scale'
                    : isAdsPerformance
                    ? isTrialActive || trialDaysLeft !== null
                      ? 'Ads Performance Trial'
                      : 'Ads Performance'
                    : 'Paket Solo')}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight leading-tight">
              Selamat {timeGreeting}, <span className="bg-gradient-to-r from-white via-indigo-100 to-purple-200 bg-clip-text text-transparent">{activeStoreName}</span> 👋
            </h1>
            <p className="text-xs sm:text-sm text-indigo-200/90 max-w-2xl leading-relaxed">
              Selamat datang di pusat kendali toko online Anda! Ikuti panduan praktis di bawah untuk menyiapkan produk, mengaktifkan AI Sales WhatsApp, atau dapatkan bantuan langsung dari tim kami sampai toko live.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handleCopyStoreLink}
              className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl border border-white/15 backdrop-blur-xs transition flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              {hasCopiedUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-indigo-300" />
                  <span>Salin Tautan</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab('orders')}
              className="px-3.5 sm:px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-md shadow-emerald-500/20 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Akses Langsung Pesanan & Order"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Pesanan &amp; Order</span>
              {transactions.length > 0 && (
                <span className="px-1.5 py-0.5 bg-slate-950 text-emerald-300 text-[10px] font-black rounded-full leading-none">
                  {transactions.length}
                </span>
              )}
            </button>

            <a
              href={storePublicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-md shadow-indigo-600/30"
            >
              <Store className="w-3.5 h-3.5" />
              <span>Kunjungi Etalase</span>
              <ExternalLink className="w-3 h-3 opacity-80" />
            </a>
          </div>
        </div>

        {/* 3 Interactive Action Cards for Beginners */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Kartu 1: Setup Toko & Produk */}
          <div className="bg-white/5 hover:bg-white/[0.08] backdrop-blur-md rounded-2xl p-5 border border-white/10 transition-all flex flex-col justify-between gap-4 group">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
                  <Package className="w-5 h-5" />
                </div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                  isProductAdded
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-400/30'
                }`}>
                  {isProductAdded ? `${products.length} Produk Aktif` : 'Perlu Diisi'}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-black text-white group-hover:text-indigo-200 transition-colors">
                  1. Setup Toko &amp; Produk
                </h3>
                <p className="text-xs text-indigo-200/80 mt-1 leading-relaxed">
                  Lengkapi identitas toko, atur QRIS pembayaran, dan tambahkan produk atau katalog jualan pertama Anda.
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={onOpenNewProduct}
                className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-xs"
              >
                <Package className="w-3.5 h-3.5" />
                <span>+ Tambah Produk Baru</span>
              </button>
              <button
                type="button"
                onClick={onOpenStoreSettings}
                className="w-full py-1.5 px-3 bg-white/5 hover:bg-white/10 text-indigo-200 hover:text-white font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>Atur Profil &amp; Identitas Toko</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Kartu 2: Terhubung ke BoonPilot AI */}
          <div className="bg-white/5 hover:bg-white/[0.08] backdrop-blur-md rounded-2xl p-5 border border-white/10 transition-all flex flex-col justify-between gap-4 group">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-300">
                  <Radio className="w-5 h-5" />
                </div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                  isWaConnected
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-400/30'
                }`}>
                  {isWaConnected ? 'WhatsApp Terhubung' : 'Belum Terhubung'}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-black text-white group-hover:text-purple-200 transition-colors">
                  2. Terhubung ke BoonPilot
                </h3>
                <p className="text-xs text-indigo-200/80 mt-1 leading-relaxed">
                  Tautkan nomor WhatsApp toko Anda agar AI BoonPilot otomatis membalas chat pembeli dan closing order 24/7.
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => onNavigateTab('whatsapp')}
                className="w-full py-2 px-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-xs"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>{isWaConnected ? 'Kelola WhatsApp Bot' : 'Scan Barcode WhatsApp'}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('boonpilot')}
                className="w-full py-1.5 px-3 bg-white/5 hover:bg-white/10 text-purple-200 hover:text-white font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>Konfigurasi Persona &amp; AI Prompt</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Kartu 3: Bantuan Tahu Beres via WhatsApp */}
          <div className="bg-gradient-to-br from-emerald-950/40 to-slate-900/60 hover:from-emerald-950/60 hover:to-slate-900/80 backdrop-blur-md rounded-2xl p-5 border border-emerald-500/30 transition-all flex flex-col justify-between gap-4 group">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full border bg-emerald-500/20 text-emerald-300 border-emerald-400/30">
                  Support 1-on-1
                </span>
              </div>
              <div>
                <h3 className="text-sm font-black text-white group-hover:text-emerald-200 transition-colors">
                  3. Bantuan Tahu Beres
                </h3>
                <p className="text-xs text-indigo-200/80 mt-1 leading-relaxed">
                  Tidak sempat setting sendiri? Tim teknis kami siap mendampingi atau membantu setup katalog dan koneksi AI sampai toko Anda siap jalan.
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-emerald-500/20">
              <a
                href={`https://wa.me/6281977655099?text=${encodeURIComponent(`Halo Admin BoonTrack, saya butuh bantuan tahu beres setup toko saya: ${activeStoreName} (${tenantSlug})`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-md shadow-emerald-600/30"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Bantuan WA (081977655099)</span>
                <ExternalLink className="w-3 h-3 opacity-80" />
              </a>
              <div className="text-center">
                <span className="text-[10px] text-emerald-300/80 font-medium">
                  Konsultasi &amp; panduan langsung via WhatsApp (081977655099)
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── VISUAL AI SESSION QUOTA METER (P0 SAAS MONETISASI) ── */}
      <AiSessionQuotaMeter tenantSlug={tenantSlug} tierName={tierLabel} />

      {/* WIDGET PENGELOLAAN TAUTAN BIO RESMI TOKO */}
      <StoreBioLinkWidget tenantSlug={tenantSlug} />

      {/* ── BAGIAN B: RINGKASAN ANALITIK 7 HARI TERAKHIR (LAST 7 DAYS) ── */}
      <section className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <span>Ringkasan Performa (7 Hari Terakhir)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Pantau arus kunjungan etalase, pesan WhatsApp otomatis, dan sesi pembayaran pelanggan.
            </p>
          </div>
          <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-xl hidden sm:inline-block">
            Auto-Sync 24 Jam
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Pengunjung Etalase */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs space-y-3 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Pengunjung Etalase</span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Eye className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {totalVisits.toLocaleString('id-ID')}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold">
                {totalVisits > 0 ? (
                  <span className="text-emerald-600 font-semibold">Trafik kunjungan 7 hari terakhir</span>
                ) : (
                  <span className="text-slate-400 font-medium">0 Kunjungan 7 hari terakhir</span>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Chat Masuk WA Bot */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs space-y-3 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Chat Masuk WA Bot</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {totalChatInteractions.toLocaleString('id-ID')}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold">
                {totalChatInteractions > 0 ? (
                  <span className="text-emerald-600">
                    ● Online &amp; Aktif • {totalChatInteractions.toLocaleString('id-ID')} Sesi Terlayani
                  </span>
                ) : (
                  <span className="text-slate-400 font-medium">0 Sesi Terlayani</span>
                )}
              </div>
            </div>
          </div>

          {/* Card 3: Pesanan / Invoice QRIS */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs space-y-3 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Pesanan / Invoice QRIS</span>
              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {recentOrdersCount.toLocaleString('id-ID')}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                <span>
                  {recentOrdersCount > 0
                    ? `${recentOrdersCount.toLocaleString('id-ID')} Pesanan (7 Hari Terakhir)`
                    : 'Menunggu pesanan pertama'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: Estimasi Transaksi */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs space-y-3 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Estimasi Nilai Masuk</span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Rp {recentOmzet.toLocaleString('id-ID')}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
                <span>100% Masuk Rekening</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BAGIAN C: MODUL TAMPILAN & MICROSITE TERINTEGRASI ── */}
      <section id="template-module-section" className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-7 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded-full">
              Pusat Desain Etalase
            </span>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              Tampilan Toko &amp; Microsite Terintegrasi
            </h3>
            <p className="text-xs text-slate-500">
              Pilih template etalase yang paling sesuai dengan model bisnis Anda. Perubahan langsung aktif seketika.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onOpenStoreSettings}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200/80 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Atur Profil &amp; Logo
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('themes')}
              className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Atur Tema Visual
            </button>
          </div>
        </div>

        {/* 3 Template Selection Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Option 1: Default Catalog */}
          <div
            onClick={() => handleSelectTemplate('default')}
            className={`p-5 rounded-3xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-4 group ${
              activeTemplate === 'default'
                ? 'border-blue-600 bg-blue-50/20 shadow-md ring-4 ring-blue-500/10'
                : 'border-slate-200 hover:border-slate-300 bg-white shadow-xs'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                {activeTemplate === 'default' && (
                  <span className="px-2.5 py-0.5 bg-blue-600 text-white font-bold text-[10px] rounded-full flex items-center gap-1 shadow-xs">
                    <Check className="w-3 h-3" />
                    <span>Aktif</span>
                  </span>
                )}
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-sm">Katalog Toko (Default)</h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Tata letak e-commerce grid modern lengkap dengan tombol tambah keranjang, estimasi ongkir, dan checkout QRIS terintegrasi.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-600">
              <span>{activeTemplate === 'default' ? 'Sedang Digunakan' : 'Gunakan Template Ini'}</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Option 2: Microsite Bio-Link */}
          <div
            onClick={() => handleSelectTemplate('microsite')}
            className={`p-5 rounded-3xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-4 group ${
              activeTemplate === 'microsite'
                ? 'border-purple-600 bg-purple-50/20 shadow-md ring-4 ring-purple-500/10'
                : 'border-slate-200 hover:border-slate-300 bg-white shadow-xs'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <LayoutTemplate className="w-5 h-5" />
                </div>
                {activeTemplate === 'microsite' && (
                  <span className="px-2.5 py-0.5 bg-purple-600 text-white font-bold text-[10px] rounded-full flex items-center gap-1 shadow-xs">
                    <Check className="w-3 h-3" />
                    <span>Aktif</span>
                  </span>
                )}
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-sm">Microsite Bio-Link</h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Tampilan bio ringkas ala Linktree khusus konversi media sosial. Fokus pada avatar, bio singkat, dan deretan tombol CTA rounded vertikal.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-purple-600">
              <span>{activeTemplate === 'microsite' ? 'Sedang Digunakan' : 'Gunakan Template Ini'}</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Option 3: Personal Authority */}
          <div
            onClick={() => handleSelectTemplate('personal')}
            className={`p-5 rounded-3xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-4 group ${
              activeTemplate === 'personal'
                ? 'border-indigo-600 bg-indigo-50/20 shadow-md ring-4 ring-indigo-500/10'
                : 'border-slate-200 hover:border-slate-300 bg-white shadow-xs'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  <Sparkles className="w-5 h-5" />
                </div>
                {activeTemplate === 'personal' && (
                  <span className="px-2.5 py-0.5 bg-indigo-600 text-white font-bold text-[10px] rounded-full flex items-center gap-1 shadow-xs">
                    <Check className="w-3 h-3" />
                    <span>Aktif</span>
                  </span>
                )}
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-sm">Personal Brand &amp; Authority</h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Desain landing page personal mentor &amp; profesional untuk membangun kredibilitas tinggi, sesi konsultasi, dan portofolio keahlian.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-600">
              <span>{activeTemplate === 'personal' ? 'Sedang Digunakan' : 'Gunakan Template Ini'}</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </div>
      </section>

      {/* ── BAGIAN D: KABAR & UPDATE TERBARU BOONTRACK (NEWS & UPDATES FEED) ── */}
      <section className="space-y-3 sm:space-y-4">
        <div className="space-y-0.5">
          <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-indigo-600" />
            <span>Kabar &amp; Update Terbaru BoonTrack</span>
          </h3>
          <p className="text-xs text-slate-500">
            Fitur terbaru dan tips praktis untuk meningkatkan konversi etalase toko Anda.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* News 1 */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs space-y-2.5 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="space-y-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                Pembayaran
              </span>
              <h4 className="font-black text-slate-900 text-sm leading-snug">
                Dynamic QRIS V2: Otomatisasi Masuk Rekening Bebas MDR
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Setiap pembayaran checkout kini diverifikasi otomatis oleh bot dan dana langsung diteruskan ke rekening utama tanpa potongan transaksi.
              </p>
            </div>
            <div className="pt-2 text-[11px] font-bold text-slate-400">
              Telah aktif di toko Anda
            </div>
          </div>

          {/* News 2 */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs space-y-2.5 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="space-y-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                Desain
              </span>
              <h4 className="font-black text-slate-900 text-sm leading-snug">
                Template Bio-Link Baru: Super Cepat &amp; Mobile-First
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tampilan microsite kini dioptimalkan khusus untuk pengunjung dari TikTok dan Instagram dengan waktu muat di bawah 1 detik.
              </p>
            </div>
            <div className="pt-2 text-[11px] font-bold text-purple-600">
              Coba di tab Tampilan Toko
            </div>
          </div>

          {/* News 3 */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs space-y-2.5 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="space-y-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                Tips Penjualan
              </span>
              <h4 className="font-black text-slate-900 text-sm leading-snug">
                Optimasi Tombol WhatsApp untuk Meningkatkan Closing
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Gunakan format sapaan otomatis di tombol etalase agar calon pembeli merasa dilayani secara personal sejak ketukan pertama.
              </p>
            </div>
            <div className="pt-2 text-[11px] font-bold text-blue-600">
              Pelajari Panduan Bot
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
