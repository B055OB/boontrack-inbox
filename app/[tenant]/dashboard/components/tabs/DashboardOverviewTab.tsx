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
} from 'lucide-react';
import { ProductItem } from '@/lib/product-catalog';
import { getSupabase } from '@/lib/supabaseClient';
import StoreBioLinkWidget from '@/app/[tenant]/dashboard/components/StoreBioLinkWidget';

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
  onNavigateTab,
  onSavedFeedback,
}: DashboardOverviewTabProps) {
  const [hasCopiedUrl, setHasCopiedUrl] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<'default' | 'microsite' | 'personal'>('default');
  const [isUpdatingTemplate, setIsUpdatingTemplate] = useState(false);

  const activeStoreName = storeDisplayName || displayName;
  const storePublicUrl = `https://boontrack.com/${tenantSlug}`;

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
    async function loadTemplate() {
      try {
        const supabase = getSupabase();
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('metadata')
          .eq('slug', tenantSlug)
          .maybeSingle();

        if (tenantRow?.metadata && isMounted) {
          const meta = tenantRow.metadata;
          const t = meta.selected_template || meta.storefront_template || meta.template || meta.theme?.template || 'default';
          if (t === 'microsite' || t === 'personal') {
            setActiveTemplate(t);
          } else {
            setActiveTemplate('default');
          }
        }
      } catch (err) {
        console.warn('Gagal memuat template di dashboard:', err);
      }
    }
    loadTemplate();
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

  // Onboarding checklist calculations (s.id style)
  const isProfileComplete = Boolean(storeLogoUrl || storeBio);
  const isPlatformPhone = Boolean(connectedPhone && (
    connectedPhone.includes('85179555449') ||
    connectedPhone.includes('85139555449') ||
    connectedPhone.includes('1268977686299719')
  ));
  const isWaConnected = (waStatus === 'CONNECTED' || Boolean(connectedPhone)) && !isPlatformPhone;
  const isProductAdded = products.length > 0;
  const isTemplateConfigured = Boolean(activeTemplate);
  const isStoreShared = hasCopiedUrl;

  const normCat = (storeCategory || '').toUpperCase();
  const isProService = ['PRO_SERVICE', 'PROFESSIONAL', 'CONSULT', 'KONSULTASI', 'LEGAL', 'TRAVEL', 'UMROH'].some((k) => normCat.includes(k));
  const isFieldService = !isProService && ['FIELD_SERVICE', 'LOCAL_SERVICE', 'SERVICE', 'JASA', 'REPAIR'].some((k) => normCat.includes(k));
  const isDigital = ['DIGITAL', 'COURSE', 'SOFTWARE', 'EBOOK'].some((k) => normCat.includes(k));
  const isCreator = ['CREATOR', 'AGENCY'].some((k) => normCat.includes(k));
  const isCulinary = ['FOOD', 'FNB', 'KULINER'].some((k) => normCat.includes(k));

  const productStepTitle = isProService
    ? 'Buat Paket Sesi & Layanan Konsultasi'
    : isFieldService
    ? 'Buat Layanan Jasa / Servis Lapangan'
    : isDigital
    ? 'Unggah Aset & Modul Digital'
    : isCreator
    ? 'Buat Paket Jasa & Kampanye Kreator'
    : isCulinary
    ? 'Tambah Menu Kuliner & Makanan'
    : 'Tambah Produk & Stok Fisik Pertama';

  const productStepDesc = isProService
    ? 'Tentukan tarif per sesi/jam, durasi pertemuan, dan form kuesioner klien.'
    : isFieldService
    ? 'Tentukan jenis servis panggilan, estimasi pengerjaan, dan area kunjungan teknisi.'
    : isDigital
    ? 'Masukkan modul e-course, rekaman video, link webinar, atau file ebook.'
    : isCreator
    ? 'Tawarkan jasa video UGC, endorse medsos, atau paket kolaborasi live streaming.'
    : isCulinary
    ? 'Upload foto menu lezat, varian porsi/rasa, dan catatan pesanan dapur.'
    : 'Masukkan foto produk menarik, harga promo, stok gudang, dan berat paket.';

  const productStepAction = isProductAdded
    ? '+ Tambah Lagi'
    : isProService
    ? '+ Buat Sesi'
    : isFieldService
    ? '+ Buat Layanan'
    : isDigital
    ? '+ Upload Aset'
    : isCreator
    ? '+ Buat Paket'
    : isCulinary
    ? '+ Tambah Menu'
    : '+ Tambah Produk';

  const operationalStep = isProService
    ? {
        id: 'operational',
        title: 'Atur Kalender & Jadwal Janji Temu',
        desc: 'Atur jam kerja, hari operasional, dan batas kuota booking sesi klien.',
        isDone: false,
        actionLabel: 'Atur Kalender',
        onAction: () => onNavigateTab('booking'),
      }
    : isFieldService
    ? {
        id: 'operational',
        title: 'Atur Slot & Jadwal Kunjungan Teknisi',
        desc: 'Atur jam operasional tim lapangan dan kuota pemesanan harian.',
        isDone: false,
        actionLabel: 'Atur Jadwal',
        onAction: () => onNavigateTab('booking'),
      }
    : isDigital
    ? {
        id: 'operational',
        title: 'Atur Akses Unduh & Delivery Otomatis',
        desc: 'Pastikan file unduhan dan akses materi langsung terkirim setelah pembayaran lunas.',
        isDone: false,
        actionLabel: 'Atur Akses',
        onAction: () => onNavigateTab('downloads'),
      }
    : isCreator
    ? {
        id: 'operational',
        title: 'Atur Kampanye & Brief Klien',
        desc: 'Kelola formulir brief dan ketentuan kolaborasi bersama brand klien.',
        isDone: false,
        actionLabel: 'Kelola Kampanye',
        onAction: () => onNavigateTab('campaigns'),
      }
    : {
        id: 'operational',
        title: isCulinary ? 'Atur Kurir Instan & Titik Dapur' : 'Aktivasi Logistik & Multi-Ekspedisi',
        desc: isCulinary
          ? 'Aktifkan kurir instan/same-day dengan radius kilometer lokasi dapur Anda.'
          : 'Tentukan titik jemput gudang agar ongkir kurir otomatis (JNE, J&T, SiCepat) aktif akurat.',
        isDone: false,
        actionLabel: isCulinary ? 'Atur Pengiriman' : 'Atur Ekspedisi',
        onAction: () => onNavigateTab('shipping'),
      };

  const checklistItems = [
    {
      id: 'profile',
      title: 'Buat Profil & Logo Toko',
      desc: 'Lengkapi nama, bio bisnis, dan unggah logo resmi brand Anda.',
      isDone: isProfileComplete,
      actionLabel: isProfileComplete ? 'Ubah Profil' : 'Atur Sekarang',
      onAction: onOpenStoreSettings,
    },
    {
      id: 'whatsapp',
      title: 'Hubungkan WhatsApp Bot (Scan QR)',
      desc: 'Tautkan nomor WA toko untuk membalas chat dan closing pesanan otomatis.',
      isDone: isWaConnected,
      actionLabel: isWaConnected ? 'Lihat Koneksi' : 'Scan Barcode',
      onAction: () => onNavigateTab('whatsapp'),
    },
    {
      id: 'products',
      title: productStepTitle,
      desc: productStepDesc,
      isDone: isProductAdded,
      actionLabel: productStepAction,
      onAction: onOpenNewProduct,
    },
    operationalStep,
    {
      id: 'template',
      title: 'Pilih Template & Desain Etalase',
      desc: 'Sesuaikan gaya storefront: Katalog Standar, Microsite Bio-Link, atau Personal.',
      isDone: isTemplateConfigured,
      actionLabel: 'Pilih Template',
      onAction: () => {
        const el = document.getElementById('template-module-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      },
    },
    {
      id: 'share',
      title: 'Bagikan Tautan Toko ke Medsos',
      desc: 'Pasang tautan resmi di Bio Instagram, TikTok, dan status WhatsApp Anda.',
      isDone: isStoreShared,
      actionLabel: isStoreShared ? 'Tersalin!' : 'Salin Tautan',
      onAction: handleCopyStoreLink,
    },
  ];

  const completedCount = checklistItems.filter((i) => i.isDone).length;
  const progressPercent = Math.round((completedCount / checklistItems.length) * 100);

  // Dynamic step headline
  const nextStepIndex = checklistItems.findIndex((i) => !i.isDone);
  const stepHeadline =
    nextStepIndex !== -1
      ? `Langkah ${nextStepIndex + 1} dari ${checklistItems.length}: ${checklistItems[nextStepIndex].title}`
      : 'Semua Langkah Selesai: Toko Anda Siap Menerima Order!';

  const stepSubheadline =
    nextStepIndex !== -1
      ? checklistItems[nextStepIndex].desc
      : 'Etalase, automasi WhatsApp, dan sistem pembayaran QRIS telah aktif 100%.';

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
      const status = (t.payment_status || t.status || '').toUpperCase();
      const isPaid = ['PAID', 'COMPLETED', 'SETTLEMENT', 'SUCCESS', 'LUNAS'].includes(status);
      return isPaid && !isNaN(tTime) && tTime >= sevenDaysAgo;
    });
    const calculated = paidRecent.reduce(
      (sum: number, t: any) => sum + Number(t.gross_amount || t.total_amount || t.total_price || 0),
      0
    );
    if (calculated > 0) return calculated;
    return totalOmzet > 0 ? totalOmzet : 0;
  }, [transactions, totalOmzet]);

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* ── BAGIAN A: SAPAAN, BANNER ONBOARDING & CHECKLIST S.ID STYLE ── */}
      <section className="space-y-4 sm:space-y-6">
        {/* Header Sapaan & Quick Action */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Selamat {timeGreeting}, {activeStoreName} 👋
              </h1>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                  tierLabel && tierLabel.toLowerCase().includes('grant')
                    ? 'bg-amber-50 text-amber-900 border-amber-300 shadow-2xs'
                    : isCheckoutLite || (tierLabel && tierLabel.toLowerCase().includes('checkout'))
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : isTeamScale || (tierLabel && tierLabel.toLowerCase().includes('team'))
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : isAdsPerformance || (tierLabel && (tierLabel.toLowerCase().includes('ads') || tierLabel.toLowerCase().includes('performance')))
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {tierLabel && tierLabel.toLowerCase().includes('grant') && (
                  <Sparkles className="w-3 h-3 text-amber-600 shrink-0" />
                )}
                <span>
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
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Kelola etalase, pantau interaksi WhatsApp, dan periksa ringkasan performa penjualan dari satu pusat kendali.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleCopyStoreLink}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 font-bold text-xs rounded-xl border border-slate-200/80 transition flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs"
            >
              {hasCopiedUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Salin Tautan</span>
                </>
              )}
            </button>

            {/* SHORTCUT PESANAN & ORDER DI HEADER UTAMA */}
            <button
              type="button"
              onClick={() => onNavigateTab('orders')}
              className="px-3.5 sm:px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-md shadow-emerald-600/20 shrink-0"
              title="Akses Langsung Pesanan & Order"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Pesanan &amp; Order</span>
              {transactions.length > 0 && (
                <span className="px-1.5 py-0.5 bg-white text-emerald-700 text-[10px] font-black rounded-full leading-none">
                  {transactions.length}
                </span>
              )}
            </button>

            <Link
              href={`/${tenantSlug}`}
              target="_blank"
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-md shadow-blue-500/20"
            >
              <Store className="w-3.5 h-3.5" />
              <span>Kunjungi Etalase</span>
              <ExternalLink className="w-3 h-3 opacity-80" />
            </Link>
          </div>
        </div>

        {/* WIDGET PENGELOLAAN TAUTAN BIO RESMI TOKO LANGSUNG MENYATU */}
        <StoreBioLinkWidget tenantSlug={tenantSlug} />

        {/* Banner Interaktif Onboarding BoonPilot */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-6 sm:p-7 shadow-lg border border-purple-700/40">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-2 max-w-2xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/30 text-purple-200 border border-purple-400/30 backdrop-blur-xs">
                <Zap className="w-3 h-3 text-amber-300" />
                <span>BOONPILOT COPILOT • ONBOARDING TOKO</span>
              </span>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight leading-snug">
                {stepHeadline}
              </h2>
              <p className="text-xs text-purple-200/90 leading-relaxed">
                {stepSubheadline}
              </p>
            </div>

            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 flex-wrap">
              {/* SHORTCUT PESANAN & ORDER DI BANNER UTAMA */}
              <button
                type="button"
                onClick={() => onNavigateTab('orders')}
                className="px-3.5 sm:px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                title="Akses Instan Pesanan & Order"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-slate-900" />
                <span>Pesanan &amp; Order</span>
                {transactions.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-slate-900 text-emerald-400 text-[10px] font-black rounded-full leading-none">
                    {transactions.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={onOpenNewProduct}
                className="px-4 py-2.5 bg-white hover:bg-purple-50 text-purple-950 font-black text-xs rounded-xl shadow-md transition active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <span>+ Tambah Produk Baru</span>
                <ArrowRight className="w-3.5 h-3.5 text-purple-700" />
              </button>
            </div>
          </div>
        </div>

        {/* Card Checklist Progres Setup (Ala s.id) */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-7 shadow-xs">
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start lg:items-center">
            {/* Sisi Kiri: Circular Progress Meter */}
            <div className="flex flex-row lg:flex-col items-center gap-4 shrink-0 p-4 bg-slate-50/80 rounded-2xl border border-slate-100 w-full lg:w-48 justify-center">
              <div className="relative w-20 h-20 flex items-center justify-center">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-slate-200"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-purple-600 transition-all duration-700 ease-out"
                    strokeDasharray={`${progressPercent}, 100`}
                    strokeLinecap="round"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-base font-black text-slate-900">{progressPercent}%</span>
                  <span className="text-[9px] font-bold text-slate-400">Siap Jual</span>
                </div>
              </div>

              <div className="text-left lg:text-center">
                <span className="text-xs font-black text-slate-800 block">
                  {completedCount} dari {checklistItems.length} Selesai
                </span>
                <span className="text-[11px] text-slate-500 block">
                  {completedCount === checklistItems.length ? 'Toko sudah prima 🎉' : 'Lengkapi langkah tersisa'}
                </span>
              </div>
            </div>

            {/* Sisi Kanan: Checklist Interaktif */}
            <div className="flex-1 w-full space-y-2.5">
              {checklistItems.map((item, idx) => (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    item.isDone
                      ? 'bg-emerald-50/40 border-emerald-200/70 text-slate-800'
                      : 'bg-white border-slate-200/90 hover:border-purple-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                        item.isDone
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-100 border border-slate-300 text-slate-400'
                      }`}
                    >
                      {item.isDone ? (
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      ) : (
                        <span className="text-[10px] font-black">{idx + 1}</span>
                      )}
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-black ${item.isDone ? 'text-slate-900 line-through opacity-75' : 'text-slate-900'}`}>
                          {item.title}
                        </span>
                        {item.isDone && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.2 rounded-full">
                            Selesai
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed truncate sm:whitespace-normal">
                        {item.desc}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={item.onAction}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer self-start sm:self-center active:scale-95 ${
                      item.isDone
                        ? 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        : 'bg-purple-600 hover:bg-purple-700 text-white shadow-xs shadow-purple-600/20'
                    }`}
                  >
                    {item.actionLabel}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

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
