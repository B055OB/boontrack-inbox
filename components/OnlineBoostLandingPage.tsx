'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Zap,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Sparkles,
  ArrowRight,
  MessageCircle,
  Layers,
  Lock,
  Star,
  CheckCircle2,
  XCircle,
  Copy,
  QrCode,
  Flame,
  Check,
  ChevronDown,
  ChevronUp,
  Sliders,
  Radio,
  ExternalLink
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { captureAffiliateReferral } from '@/lib/tracking';
import { getTenantConfig, getTenantWhatsApp } from '@/lib/tenant-config';
import {
  resolveSinglePageProduct,
  ProductItem,
  SinglePageConfig,
  TestimonialItem,
  BonusItem
} from '@/lib/product-catalog';

export interface WhatsAppDeepLinkOptions {
  botNumber: string;
  productTitle: string;
  price: number;
  customTemplate?: string;
  trackingParams?: {
    utm_source?: string;
    utm_campaign?: string;
    fbclid?: string;
    [key: string]: string | undefined;
  };
}

/**
 * Dynamic WhatsApp Deep-link Generator Helper
 * Combines active bot number, formatted message template, and URL tracking passthrough query params.
 */
export function buildWhatsAppDeepLink({
  botNumber,
  productTitle,
  price,
  customTemplate,
  trackingParams,
}: WhatsAppDeepLinkOptions): {
  url: string;
  fullMessage: string;
  cleanBotNumber: string;
  queryString: string;
} {
  const cleanBotNumber = botNumber.replace(/\D/g, '') || getTenantWhatsApp('onlineboost');
  const formattedPrice = `Rp${price.toLocaleString('id-ID')}`;

  // Default standard message template
  const baseMessage =
    customTemplate ||
    `Halo min, saya tertarik materi ${productTitle} seharga ${formattedPrice}`;

  // Assemble tracking query parameters (utm_source, utm_campaign, fbclid)
  const params = new URLSearchParams();
  if (trackingParams) {
    if (trackingParams.utm_source) params.set('utm_source', trackingParams.utm_source);
    if (trackingParams.utm_campaign) params.set('utm_campaign', trackingParams.utm_campaign);
    if (trackingParams.fbclid) params.set('fbclid', trackingParams.fbclid);

    // Include any additional custom tracking keys
    Object.entries(trackingParams).forEach(([k, v]) => {
      if (v && !['utm_source', 'utm_campaign', 'fbclid'].includes(k)) {
        params.set(k, v);
      }
    });
  }

  const queryString = params.toString();

  // Attach query string directly into message text for bot webhook / CRM extraction
  const fullMessage = queryString ? `${baseMessage}?${queryString}` : baseMessage;
  const encodedText = encodeURIComponent(fullMessage);

  // Append query string to the wa.me URL query parameters for browser analytics passthrough
  const urlSuffix = queryString ? `&${queryString}` : '';
  const url = `https://wa.me/${cleanBotNumber}?text=${encodedText}${urlSuffix}`;

  return {
    url,
    fullMessage,
    cleanBotNumber,
    queryString,
  };
}

export interface OnlineBoostLandingPageProps {
  initialProduct?: ProductItem;
  initialConfig?: SinglePageConfig;
  customBotNumber?: string;
  promoPrice?: number;
  normalPrice?: number;
  tenantSlug?: string;
  productSlug?: string;
  className?: string;
}

function OnlineBoostLandingPageContent({
  initialProduct,
  initialConfig,
  customBotNumber,
  promoPrice,
  normalPrice,
  tenantSlug = 'onlineboost',
  productSlug = 'cpm-24jam',
  className = '',
}: OnlineBoostLandingPageProps) {
  const searchParams = useSearchParams();

  // 1. Dynamic Catalog Resolution from product-catalog.ts
  const { product: catalogProduct, config: catalogConfig } = useMemo(() => {
    return resolveSinglePageProduct(tenantSlug, productSlug);
  }, [tenantSlug, productSlug]);

  const activeProduct = initialProduct || catalogProduct;
  const activeConfig = initialConfig || catalogConfig;

  // 2. Dynamic Config Resolution from tenant-config.ts & Environment Variables
  const tenantConfig = useMemo(() => {
    try {
      return getTenantConfig(tenantSlug);
    } catch {
      return null;
    }
  }, [tenantSlug]);

  const queryWa = searchParams.get('wa') || searchParams.get('bot');

  const defaultBotNumber = useMemo(() => {
    // Priority order:
    // 1. URL Query Param (?wa=... or ?bot=...)
    if (queryWa) return queryWa.replace(/\D/g, '');
    // 2. Props customBotNumber
    if (customBotNumber) return customBotNumber.replace(/\D/g, '');
    // 3. Environment Variable NEXT_PUBLIC_ONLINEBOOST_BOT_NUMBER
    if (process.env.NEXT_PUBLIC_ONLINEBOOST_BOT_NUMBER) {
      return process.env.NEXT_PUBLIC_ONLINEBOOST_BOT_NUMBER.replace(/\D/g, '');
    }
    // 4. Product Catalog Config whatsapp_number
    if (activeConfig?.whatsapp_number) {
      return activeConfig.whatsapp_number.replace(/\D/g, '');
    }
    // 5. Tenant Config Persona human_handoff_number
    if (tenantConfig?.persona?.human_handoff_number) {
      return tenantConfig.persona.human_handoff_number.replace(/\D/g, '');
    }
    // 6. Tenant Config Emergency Contact
    if (tenantConfig?.operational_hours?.emergency_contact) {
      return tenantConfig.operational_hours.emergency_contact.replace(/\D/g, '');
    }
    // 7. General Meta Bot Number ENV
    if (process.env.NEXT_PUBLIC_META_BOT_NUMBER) {
      return process.env.NEXT_PUBLIC_META_BOT_NUMBER.replace(/\D/g, '');
    }
    // 8. Dynamic Tenant WhatsApp Fallback
    return getTenantWhatsApp(tenantSlug);
  }, [queryWa, customBotNumber, activeConfig, tenantConfig, tenantSlug]);

  const [currentWaNumber, setCurrentWaNumber] = useState<string>(defaultBotNumber);

  useEffect(() => {
    setCurrentWaNumber(defaultBotNumber);
  }, [defaultBotNumber]);

  // 3. Dynamic Tracking Passthrough: utm_source, utm_campaign, fbclid
  const [trackingParams, setTrackingParams] = useState({
    utm_source: '',
    utm_campaign: '',
    fbclid: '',
  });

  useEffect(() => {
    // Record into localStorage & session for reliability
    captureAffiliateReferral();

    const source =
      searchParams.get('utm_source') ||
      (typeof window !== 'undefined' ? localStorage.getItem('boontrack_utm_source') || '' : '');
    const campaign =
      searchParams.get('utm_campaign') ||
      (typeof window !== 'undefined' ? localStorage.getItem('boontrack_utm_campaign') || '' : '');
    const fbclid =
      searchParams.get('fbclid') ||
      (typeof window !== 'undefined' ? localStorage.getItem('boontrack_fbclid') || '' : '');

    setTrackingParams({
      utm_source: source,
      utm_campaign: campaign,
      fbclid: fbclid,
    });
  }, [searchParams]);

  // 4. Dynamic Pricing Calculation from Catalog / Props
  const effectivePromoPrice = promoPrice ?? activeProduct.promo_price ?? activeProduct.price;
  const effectiveNormalPrice = normalPrice ?? activeProduct.price;
  const discountPercentage = Math.round(
    ((effectiveNormalPrice - effectivePromoPrice) / effectiveNormalPrice) * 100
  );

  // 5. Build Dynamic WhatsApp Deep-link using helper
  const { url: waTargetUrl, queryString: trackingQueryString } = useMemo(() => {
    return buildWhatsAppDeepLink({
      botNumber: currentWaNumber,
      productTitle: activeProduct.name || 'Modul Praktis CPM 24 Jam',
      price: effectivePromoPrice,
      trackingParams,
    });
  }, [currentWaNumber, activeProduct.name, effectivePromoPrice, trackingParams]);

  // Interactive States
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showPresenterToolbar, setShowPresenterToolbar] = useState(false);
  const [customWaInput, setCustomWaInput] = useState(currentWaNumber);
  const [expandedModule, setExpandedModule] = useState<number | null>(1);

  // Live countdown timer for urgency
  const [timeLeft, setTimeLeft] = useState({ minutes: 23, seconds: 45 });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 };
        } else if (prev.minutes > 0) {
          return { minutes: prev.minutes - 1, seconds: 59 };
        }
        return { minutes: 30, seconds: 0 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleCopyLink = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(waTargetUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleApplyWa = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customWaInput.replace(/\D/g, '');
    if (clean) {
      setCurrentWaNumber(clean);
      setShowPresenterToolbar(false);
    }
  };

  const hasTracking = Boolean(
    trackingParams.utm_source || trackingParams.utm_campaign || trackingParams.fbclid
  );

  // Dynamic Content with graceful defaults
  const headline =
    activeConfig?.headline ||
    activeProduct.name ||
    'Panduan Praktis Setup Traffic CPM: Tembus Impresi Pertama dalam 24 Jam';

  const subheadline =
    activeConfig?.subheadline ||
    activeProduct.description ||
    'Stop bakar budget sia-sia. Kuasai formula taktis integrasi Meta Ads & Conversions API (CAPI) untuk mengalirkan traffic CPM terukur ke funnel Anda tanpa risiko restrict.';

  const badgeText =
    activeConfig?.badge_text || 'Materi Uji Coba: Modul Praktis CPM 24 Jam';

  // Pain Points (Agitasi Masalah)
  const painPoints = useMemo(() => {
    if (activeConfig?.pain_points && activeConfig.pain_points.length >= 3) {
      return [
        {
          title: '1. Boncos Karena Struktur Campaign Salah',
          desc: activeConfig.pain_points[0],
          icon: <Flame className="w-6 h-6" />,
          color: 'red',
        },
        {
          title: '2. Pixel Error & CAPI Buta Data',
          desc: activeConfig.pain_points[1],
          icon: <XCircle className="w-6 h-6" />,
          color: 'amber',
        },
        {
          title: '3. Akun Restrict & Suspended Mendadak',
          desc: activeConfig.pain_points[2],
          icon: <Lock className="w-6 h-6" />,
          color: 'rose',
        },
      ];
    }
    return [
      {
        title: '1. Boncos Karena Salah Struktur Campaign',
        desc: 'Menumpuk terlalu banyak target audiens dalam 1 ad set atau keliru memilih objektif kampanye. Budget terkuras kilat tanpa menghasilkan impresi berkualitas dan traffic nyata.',
        icon: <Flame className="w-6 h-6" />,
        color: 'red',
      },
      {
        title: '2. Pixel Error & CAPI Buta Data',
        desc: 'Event tracking drop akibat browser ad blocker atau server token CAPI tidak sinkron. Algoritma Meta menjadi buta dan gagal mengirim audiens yang relevan ke funnel Anda.',
        icon: <XCircle className="w-6 h-6" />,
        color: 'amber',
      },
      {
        title: '3. Akun Restrict & Suspended Mendadak',
        desc: 'Melanggar compliance Meta tanpa disadari, domain belum terverifikasi, atau lonjakan spending yang tidak wajar sehingga akun iklan di-restrict permanen di tengah jalan.',
        icon: <Lock className="w-6 h-6" />,
        color: 'rose',
      },
    ];
  }, [activeConfig?.pain_points]);

  // Solution Points (3 Modul Taktis)
  const solutionModules = useMemo(() => {
    return [
      {
        num: '01',
        name: 'Modul 1',
        tag: 'Fondasi Tracking CAPI',
        title: 'Setup Campaign & Event Tracking CAPI Anti-Loss',
        desc:
          activeConfig?.solution_points?.[0] ||
          'Hubungkan Meta Pixel bersama Conversions API (CAPI) dengan event deduplication akurat. Data tracking 100% terekam tanpa blind spot, siap menuntun machine learning Meta.',
        items: [
          'Koneksi Meta Pixel + Conversions API (CAPI) dengan Server Access Token aktif.',
          'Validasi Event Deduplication di Meta Events Manager (zero drop data).',
          'Verifikasi domain bisnis & konfigurasi Aggregated Event Measurement.',
        ],
        accent: 'emerald',
      },
      {
        num: '02',
        name: 'Modul 2',
        tag: 'Budgeting Presisi',
        title: 'Struktur Budgeting CBO vs ABO Anti-Boncos',
        desc:
          activeConfig?.solution_points?.[1] ||
          'Kuasai formula alokasi budget Advantage Campaign Budget (CBO) vs Ad Set Budget (ABO). Hemat modal testing mulai Rp25.000/hari dengan hasil jangkauan CPM maksimal.',
        items: [
          'Kapan wajib pakai Advantage Campaign Budget (CBO) dan kapan harus ABO.',
          'Formula budget testing hemat Rp25.000 - Rp50.000/hari dengan jangkauan CPM optimal.',
          'Struktur segmentasi audiens cold & warm exclusion agar tidak saling tumpang tindih.',
        ],
        accent: 'teal',
      },
      {
        num: '03',
        name: 'Modul 3',
        tag: 'Funnel & Delivery',
        title: 'Funnel & Optimasi Konversi Cepat ke WhatsApp',
        desc:
          activeConfig?.solution_points?.[2] ||
          'Konversi ribuan impresi CPM menjadi chat WhatsApp closing rate tinggi via landing page super gesit dan tracking deep-link otomatis.',
        items: [
          'Blueprint Single Landing Page ultra-cepat (load time < 1.5 detik).',
          'Integrasi One-Click WhatsApp CTA dengan pre-filled order message & UTM passthrough.',
          'SOP evaluasi 24 jam: Kapan harus scale-up dan kapan harus matikan ad set.',
        ],
        accent: 'cyan',
      },
    ];
  }, [activeConfig?.solution_points]);

  // Testimonials (Social Proof)
  const testimonials = useMemo(() => {
    if (activeConfig?.testimonials && activeConfig.testimonials.length >= 2) {
      return activeConfig.testimonials.slice(0, 2);
    }
    return [
      {
        id: 't1',
        name: 'Fajar R.',
        role: 'Media Buyer & Solo Marketer',
        quote:
          'Awalnya pixel CAPI saya selalu merah & ad set boncos. Setelah ikuti checklist modul ini, dalam 14 jam impresi tembus 12.000+ CPM stabil di angka murah! Panduannya bener-bener to the point tanpa basa-basi.',
        badge: '12K+ Impresi dlm 14 Jam',
        rating: 5,
      },
      {
        id: 't2',
        name: 'Dian P.',
        role: 'Digital Marketer & Store Owner',
        quote:
          'Struktur CBO vs ABO-nya gampang dipahami. Nggak pake teori bertele-tele, akun tetap aman bebas restrict dan langsung dapat lead perdana di hari pertama setup! Recommended banget buat yang mau cepet jalan.',
        badge: 'Zero Restrict • Lead Perdana',
        rating: 5,
      },
    ];
  }, [activeConfig?.testimonials]);

  return (
    <div
      className={`min-h-screen bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-white font-sans antialiased overflow-x-hidden ${className}`}
    >
      {/* Background Ambience Glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-b from-emerald-500/15 via-teal-500/10 to-transparent blur-3xl rounded-full" />
        <div className="absolute top-[35%] -left-40 w-[500px] h-[500px] bg-blue-600/10 blur-3xl rounded-full" />
        <div className="absolute top-[65%] -right-40 w-[500px] h-[500px] bg-emerald-600/10 blur-3xl rounded-full" />
      </div>

      {/* Top Banner: Sesi Live Demo */}
      <div className="relative z-20 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white text-xs sm:text-sm font-medium py-2.5 px-4 shadow-md">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
            <span className="font-bold tracking-wide uppercase">
              SESI PENGUJIAN LIVE DEMO ONLINEBOOST
            </span>
            <span className="hidden sm:inline text-emerald-100">•</span>
            <span className="hidden sm:inline text-emerald-100">
              Akses Khusus Pengujian Rp{effectivePromoPrice.toLocaleString('id-ID')}
            </span>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <div className="flex items-center gap-1.5 bg-black/20 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs">
              <Clock className="w-3.5 h-3.5 text-emerald-200" />
              <span>
                Sisa Waktu Demo:{' '}
                <strong className="font-mono text-white">
                  {String(timeLeft.minutes).padStart(2, '0')}:
                  {String(timeLeft.seconds).padStart(2, '0')}
                </strong>
              </span>
            </div>

            {/* Presenter Mode Trigger */}
            <button
              onClick={() => setShowPresenterToolbar(!showPresenterToolbar)}
              title="Pengaturan Nomor WhatsApp Demo"
              className="text-xs bg-white/15 hover:bg-white/25 px-2 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Sliders className="w-3 h-3" />
              <span className="hidden md:inline">Opsi Demo</span>
            </button>
          </div>
        </div>
      </div>

      {/* Presenter Live Controls (Collapsible for Speaker/Testing) */}
      {showPresenterToolbar && (
        <div className="relative z-30 bg-slate-900/95 border-b border-slate-800 p-4 shadow-xl backdrop-blur-md">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span>
                <strong>Presenter Control:</strong> Ganti nomor bot WA tujuan secara langsung selama sesi live testing.
              </span>
            </div>
            <form onSubmit={handleApplyWa} className="flex items-center gap-2 w-full md:w-auto">
              <input
                type="text"
                value={customWaInput}
                onChange={(e) => setCustomWaInput(e.target.value)}
                placeholder="Nomor Bot WhatsApp"
                className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-white focus:outline-none focus:border-emerald-500 font-mono w-44"
              />
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3 py-1.5 rounded transition cursor-pointer"
              >
                Terapkan
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentWaNumber(defaultBotNumber);
                  setCustomWaInput(defaultBotNumber);
                }}
                className="text-slate-400 hover:text-white px-2 py-1.5 cursor-pointer"
              >
                Reset Default
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Active Tracking Status Banner (Persiapan Tahap 2 Indicator) */}
      {hasTracking && (
        <div className="relative z-20 bg-slate-900/90 border-b border-emerald-500/20 py-1.5 px-4 text-[11px] text-emerald-300">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span className="font-semibold">Tracking Passthrough Aktif:</span>
              <span className="font-mono text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {trackingParams.utm_source && `utm_source=${trackingParams.utm_source} `}
                {trackingParams.utm_campaign && `utm_campaign=${trackingParams.utm_campaign} `}
                {trackingParams.fbclid && `fbclid=${trackingParams.fbclid.slice(0, 10)}...`}
              </span>
            </div>
            <span className="text-slate-400 hidden md:inline">
              Parameter otomatis disematkan ke query WhatsApp
            </span>
          </div>
        </div>
      )}

      {/* Navigation / Header */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md sticky top-0">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-emerald-500/20">
              OB
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-white text-base">
                  {tenantConfig?.name || 'OnlineBoost ID'}
                </span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                  Official Live Testing
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Digital Traffic &amp; Monetization Hub
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowQrModal(true)}
              className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg transition cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5 text-emerald-400" />
              <span>Scan QR Demo</span>
            </button>

            <a
              href={waTargetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-lg shadow-md shadow-emerald-600/30 transition-all duration-200"
            >
              <MessageCircle className="w-4 h-4 fill-white" />
              <span>Ambil Rp{effectivePromoPrice.toLocaleString('id-ID')}</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10">
        {/* Hero Section: Hook & Headline */}
        <section className="pt-10 pb-16 px-4 max-w-4xl mx-auto text-center">
          {/* Dynamic Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs sm:text-sm font-medium mb-6 backdrop-blur-md shadow-sm">
            <Flame className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>{badgeText}</span>
          </div>

          {/* Dynamic Headline */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-[1.15] mb-6">
            {headline}
          </h1>

          {/* Dynamic Subheadline */}
          <p className="text-slate-300 text-base sm:text-lg md:text-xl max-w-2xl mx-auto mb-8 leading-relaxed">
            {subheadline}
          </p>

          {/* Fast Highlights Badges */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-4 mb-10 text-xs sm:text-sm text-slate-300">
            <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-full">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Impresi Perdana &lt; 24 Jam</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-full">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Tracking CAPI 100% Valid</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-full">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <span>Formula Anti-Restrict</span>
            </div>
          </div>

          {/* Prominent Hero CTA Box */}
          <div className="bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-emerald-500/40 rounded-2xl p-6 sm:p-8 max-w-xl mx-auto shadow-2xl shadow-emerald-950/50 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
              <div className="text-left">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 block">
                  Biaya Uji Coba Sesi Live Testing
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-3xl sm:text-4xl font-black text-white">
                    Rp {effectivePromoPrice.toLocaleString('id-ID')}
                  </span>
                  <span className="text-xs sm:text-sm text-slate-500 line-through">
                    Rp {effectiveNormalPrice.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold px-3 py-1 rounded-full">
                Diskon {discountPercentage}% Khusus Testing
              </span>
            </div>

            {/* Prominent CTA Button */}
            <a
              href={waTargetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full group flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-base sm:text-lg py-4 px-6 rounded-xl shadow-lg shadow-emerald-500/25 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <MessageCircle className="w-6 h-6 fill-slate-950" />
              <span>Ambil Akses Rp{effectivePromoPrice.toLocaleString('id-ID')} via WhatsApp</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>

            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Garansi akses materi instan via WhatsApp bot resmi
              </span>
              <button
                onClick={handleCopyLink}
                className="text-slate-400 hover:text-emerald-300 flex items-center gap-1 transition cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Link WA Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin Link Demo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Agitasi Masalah Section */}
        <section className="py-16 px-4 border-t border-slate-900 bg-slate-950/80">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/60 border border-red-500/30 text-red-400 text-xs font-semibold mb-3">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Kendala Utama Advertiser</span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
                {activeConfig?.problem_title || 'Kenapa 90% Advertiser Boncos Saat Mencari Traffic CPM?'}
              </h2>
              <p className="text-slate-400 text-sm sm:text-base mt-2 max-w-xl mx-auto">
                Bakar budget ratusan ribu bukan jaminan impresi mengalir jika 3 lubang bocor ini tidak segera Anda atasi:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {painPoints.map((p, idx) => (
                <div
                  key={idx}
                  className="bg-slate-900/60 border border-slate-800 hover:border-red-500/40 rounded-2xl p-6 transition-all duration-200"
                >
                  <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-4">
                    {p.icon}
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{p.title}</h3>
                  <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Solusi Section: 3 Modul Taktis */}
        <section className="py-16 px-4 bg-gradient-to-b from-slate-950 via-slate-900/50 to-slate-950 border-t border-slate-900">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-semibold mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Solusi Teruji &amp; Siap Pakai</span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
                {activeConfig?.solution_title || 'Solusi: 3 Modul Taktis Optimasi Traffic Cepat'}
              </h2>
              <p className="text-slate-400 text-sm sm:text-base mt-2 max-w-xl mx-auto">
                Bypass seluruh teori bertele-tele. Ikuti framework 3 modul taktis ini untuk menembus impresi pertama Anda dalam 24 jam ke depan:
              </p>
            </div>

            <div className="space-y-4">
              {solutionModules.map((m, idx) => (
                <div
                  key={idx}
                  className="bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5 transition-all"
                >
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-xl shrink-0">
                    {m.num}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                        {m.name}
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-xs text-slate-400">{m.tag}</span>
                    </div>
                    <h4 className="text-base sm:text-lg font-bold text-white">{m.title}</h4>
                    <p className="text-slate-300 text-xs sm:text-sm mt-1">{m.desc}</p>
                  </div>
                  <div className="shrink-0 text-emerald-400 hidden sm:block">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Breakdown Modul Section (Accordion) */}
        <section className="py-16 px-4 border-t border-slate-900 bg-slate-950">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-semibold mb-3">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Detail Kurikulum Modul</span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
                Breakdown 3 Modul Praktis CPM 24 Jam
              </h2>
              <p className="text-slate-400 text-sm sm:text-base mt-2 max-w-xl mx-auto">
                Setiap modul dirancang to-the-point dan langsung bisa Anda terapkan:
              </p>
            </div>

            <div className="space-y-4">
              {solutionModules.map((m, idx) => {
                const modId = idx + 1;
                const isExpanded = expandedModule === modId;
                return (
                  <div
                    key={modId}
                    className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden transition-all"
                  >
                    <button
                      onClick={() => setExpandedModule(isExpanded ? null : modId)}
                      className="w-full text-left p-5 sm:p-6 flex items-center justify-between gap-4 hover:bg-slate-800/40 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-sm">
                          M-{modId}
                        </div>
                        <div>
                          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
                            {m.name}
                          </span>
                          <h3 className="text-base sm:text-lg font-bold text-white">{m.title}</h3>
                        </div>
                      </div>
                      <div className="text-slate-400">
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-6 pb-6 pt-2 border-t border-slate-800/80 bg-slate-950/40 text-xs sm:text-sm text-slate-300 space-y-3">
                        <p className="text-slate-400">{m.desc}</p>
                        <ul className="space-y-2">
                          {m.items.map((item, itemIdx) => (
                            <li key={itemIdx} className="flex items-start gap-2">
                              <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Testimoni (Social Proof) */}
        <section className="py-16 px-4 bg-slate-900/40 border-t border-slate-900">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-semibold mb-3">
                <Star className="w-3.5 h-3.5 fill-emerald-400" />
                <span>Verified Social Proof</span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
                Bukti Nyata Peserta yang Berhasil Setup Traffic Perdana
              </h2>
              <p className="text-slate-400 text-sm sm:text-base mt-2 max-w-xl mx-auto">
                Hasil langsung setelah menerapkan checklist praktis tanpa trial-error:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {testimonials.map((t, idx) => (
                <div
                  key={t.id || idx}
                  className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 relative flex flex-col justify-between shadow-xl"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex text-amber-400 gap-1">
                        {[...Array(t.rating || 5)].map((_, i) => (
                          <Star key={i} className="w-4 h-4 fill-amber-400" />
                        ))}
                      </div>
                      {t.badge && (
                        <span className="text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-medium">
                          {t.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-200 text-sm sm:text-base leading-relaxed italic mb-6">
                      &ldquo;{t.quote}&rdquo;
                    </p>
                  </div>
                  <div className="flex items-center gap-3 pt-4 border-t border-slate-800/80">
                    <div className="w-10 h-10 rounded-full bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center font-bold text-emerald-300 text-sm">
                      {t.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h5 className="text-sm font-bold text-white">{t.name}</h5>
                      <p className="text-xs text-slate-400">{t.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Offer & Guarantee Section */}
        <section id="offer" className="py-20 px-4 border-t border-slate-900 bg-slate-950 relative">
          <div className="max-w-3xl mx-auto">
            <div className="relative rounded-3xl p-8 sm:p-10 bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border-2 border-emerald-500/50 shadow-2xl shadow-emerald-500/10 backdrop-blur-2xl">
              {/* Floating Top Badge */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs uppercase px-4 py-1 rounded-full shadow-lg tracking-wider">
                PENAWARAN KHUSUS SESI LIVE TESTING
              </div>

              <div className="text-center mb-8 pt-2">
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">
                  Dapatkan Akses Penuh {activeProduct.name || 'Modul Praktis CPM 24 Jam'}
                </h3>
                <p className="text-slate-300 text-xs sm:text-sm">
                  Akses instan materi seharga Rp{effectivePromoPrice.toLocaleString('id-ID')} khusus untuk peserta sesi live testing {tenantConfig?.name || 'OnlineBoost ID'} hari ini.
                </p>

                <div className="mt-6 inline-flex items-baseline gap-3">
                  <span className="text-4xl sm:text-5xl font-black text-white">
                    Rp {effectivePromoPrice.toLocaleString('id-ID')}
                  </span>
                  <span className="text-base sm:text-lg text-slate-500 line-through">
                    Rp {effectiveNormalPrice.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="text-xs text-emerald-400 font-semibold mt-1">
                  Hemat Rp{(effectiveNormalPrice - effectivePromoPrice).toLocaleString('id-ID')} (Akses Instan dikirim via WhatsApp)
                </div>
              </div>

              {/* What You Get Checklist */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 mb-8 text-xs sm:text-sm space-y-3">
                <div className="font-bold text-slate-400 text-xs uppercase tracking-wider mb-2">
                  Yang Anda Dapatkan di Paket Ini:
                </div>
                <div className="flex items-start gap-2.5 text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Modul 1:</strong> Setup Campaign &amp; Event Tracking CAPI Anti-Loss
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Modul 2:</strong> Struktur Budgeting CBO vs ABO Anti-Boncos
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Modul 3:</strong> Funnel &amp; Optimasi Konversi Cepat ke WhatsApp
                  </span>
                </div>

                {activeConfig?.bonus_items && activeConfig.bonus_items.length > 0 ? (
                  activeConfig.bonus_items.slice(0, 2).map((b, bIdx) => (
                    <div key={b.id || bIdx} className="flex items-start gap-2.5 text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>
                        <strong>Bonus Live Testing:</strong> {b.title} (Senilai Rp{b.value.toLocaleString('id-ID')})
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-start gap-2.5 text-slate-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Bonus Live Testing:</strong> SOP Anti-Restrict &amp; Event Deduplication Checklist
                    </span>
                  </div>
                )}

                <div className="flex items-start gap-2.5 text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Pengiriman Cepat:</strong> File materi &amp; link akses dikirim otomatis oleh bot resmi
                  </span>
                </div>
              </div>

              {/* Prominent Offer CTA Button */}
              <a
                href={waTargetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full group flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-lg sm:text-xl py-4 px-6 rounded-2xl shadow-xl shadow-emerald-500/25 transition-all duration-200 transform hover:-translate-y-1 active:translate-y-0"
              >
                <MessageCircle className="w-6 h-6 fill-slate-950" />
                <span>Ambil Akses Rp{effectivePromoPrice.toLocaleString('id-ID')} via WhatsApp</span>
                <ArrowRight className="w-6 h-6 group-hover:translate-x-1.5 transition-transform" />
              </a>

              {/* Guarantee Reassurance */}
              <div className="mt-6 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-center gap-4 text-center sm:text-left">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h5 className="text-sm font-bold text-white">
                    Garansi Akses Materi Instan via WhatsApp
                  </h5>
                  <p className="text-xs text-slate-400">
                    Begitu Anda mengirim pesan ke WhatsApp bot {tenantConfig?.name || 'OnlineBoost ID'}, tautan modul materi langsung aktif dan bisa dipelajari saat itu juga.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 px-4 border-t border-slate-900 bg-slate-950">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Pertanyaan yang Sering Diajukan (FAQ)
              </h2>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
                <h4 className="font-bold text-white mb-1">
                  Berapa lama akses modul materi ini berlaku?
                </h4>
                <p className="text-slate-400">
                  Akses modul ini berlaku seumur hidup (lifetime). Anda bebas mempelajari dan mengakses materi kapan saja melalui tautan yang dikirimkan ke WhatsApp Anda.
                </p>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
                <h4 className="font-bold text-white mb-1">
                  Apakah materi ini cocok untuk pemula yang belum pernah beriklan?
                </h4>
                <p className="text-slate-400">
                  Ya! Materi ini disusun step-by-step tanpa jargon rumit. Anda akan dipandu mulai dari setup pixel dasar, struktur campaign awal, hingga testing budget minimal.
                </p>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
                <h4 className="font-bold text-white mb-1">
                  Bagaimana cara konfirmasi pembayaran Rp{effectivePromoPrice.toLocaleString('id-ID')} selama live demo?
                </h4>
                <p className="text-slate-400">
                  Cukup klik tombol &quot;Ambil Akses Rp{effectivePromoPrice.toLocaleString('id-ID')} via WhatsApp&quot;. Sistem bot {tenantConfig?.name || 'OnlineBoost ID'} akan langsung merespons dengan panduan singkat dan menyerahkan link akses secara otomatis.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/90 py-8 px-4 text-center text-xs text-slate-500 relative z-10 pb-28 sm:pb-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">{tenantConfig?.name || 'OnlineBoost ID'}</span>
            <span>•</span>
            <span>{activeProduct.name || 'Modul Praktis CPM 24 Jam'}</span>
          </div>
          <div>
            Powered by BoonTrack Omnichannel Inbox &amp; Traffic Engine
          </div>
        </div>
      </footer>

      {/* Floating Sticky CTA Bar (Sticky Bottom Bar for Mobile & Desktop) */}
      <aside aria-label="Akses Cepat WhatsApp" className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 border-t border-emerald-500/40 p-3 sm:py-3.5 sm:px-6 backdrop-blur-xl shadow-2xl safe-pb">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="text-left flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 hidden sm:flex items-center justify-center text-emerald-400">
              <Flame className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
                  Sesi Live Testing
                </span>
                <span className="text-[10px] bg-red-500/20 text-red-300 px-1.5 py-0.2 rounded font-mono">
                  HEMAT {discountPercentage}%
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg sm:text-xl font-black text-white">
                  Rp {effectivePromoPrice.toLocaleString('id-ID')}
                </span>
                <span className="text-xs text-slate-500 line-through hidden sm:inline">
                  Rp {effectiveNormalPrice.toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-1 sm:flex-initial justify-end">
            <a
              href={waTargetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs sm:text-sm py-3 px-5 sm:px-8 rounded-xl shadow-lg shadow-emerald-500/25 active:scale-95 transition-all"
            >
              <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 fill-slate-950" />
              <span>Ambil Akses Rp{effectivePromoPrice.toLocaleString('id-ID')} via WhatsApp</span>
            </a>
          </div>
        </div>
      </aside>

      {/* QR Code Presentation Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center relative shadow-2xl">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800 cursor-pointer"
            >
              ✕
            </button>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold mb-3">
              Scan Kamera HP Anda
            </div>

            <h3 className="text-lg font-bold text-white mb-1">
              Live Testing: WhatsApp Bot {tenantConfig?.name || 'OnlineBoost'}
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              Arahkan kamera smartphone ke kode QR ini untuk langsung membuka chat WhatsApp penawaran Rp{effectivePromoPrice.toLocaleString('id-ID')}.
            </p>

            <div className="bg-white p-4 rounded-2xl inline-block shadow-inner mb-4">
              <QRCodeSVG
                value={waTargetUrl}
                size={220}
                level="M"
                includeMargin={false}
              />
            </div>

            <div className="text-[11px] text-slate-400 font-mono bg-slate-950 p-2.5 rounded-xl border border-slate-800 break-all mb-4">
              Nomor Bot: +{currentWaNumber}
            </div>

            <button
              onClick={handleCopyLink}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium py-2.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copiedLink ? 'Link Tersalin!' : 'Salin URL WhatsApp'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OnlineBoostLandingPage(props: OnlineBoostLandingPageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-emerald-400 font-medium text-sm">
          Memuat penawaran OnlineBoost...
        </div>
      }
    >
      <OnlineBoostLandingPageContent {...props} />
    </Suspense>
  );
}
