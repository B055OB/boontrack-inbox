'use client';

import React from 'react';
import {
  Smartphone,
  ExternalLink,
  ShoppingBag,
  Package,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import { VisualThemeType } from '../settings/StorefrontThemeCard';
import { ProductItem } from '@/lib/product-catalog';

export interface PreviewButton {
  id: string;
  label: string;
  url: string;
  icon?: 'whatsapp' | 'instagram' | 'tiktok' | 'maps' | 'link' | 'phone' | 'shopee' | 'tokopedia' | string;
  badge?: string;
  is_active?: boolean;
}

interface LivePhonePreviewProps {
  tenantSlug: string;
  displayName: string;
  storeBio?: string;
  storeLogoUrl?: string | null;
  storeWhatsapp?: string;
  visualTheme?: VisualThemeType;
  buttons?: PreviewButton[];
  showProducts?: boolean;
  products?: ProductItem[];
  featuredProductIds?: string[];
}

// ─── Brand SVG Icons 1:1 Identical to Public Storefront ──────────────────────
function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" className="shrink-0">
      <path
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"
        fill="#25D366"
      />
      <path
        d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.659 1.438 5.168L2 22l4.985-1.424A9.954 9.954 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"
        stroke="#25D366"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" className="shrink-0">
      <defs>
        <linearGradient id="ig-grad-phone" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f09433" />
          <stop offset="25%" stopColor="#e6683c" />
          <stop offset="50%" stopColor="#dc2743" />
          <stop offset="75%" stopColor="#cc2366" />
          <stop offset="100%" stopColor="#bc1888" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#ig-grad-phone)" />
      <circle cx="12" cy="12" r="4" stroke="white" strokeWidth="1.8" fill="none" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="white" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="white" className="shrink-0">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.22 6.22 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.95a8.16 8.16 0 004.77 1.52V7.04a4.85 4.85 0 01-1-.35z" />
    </svg>
  );
}

function MapsIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="#EA4335" className="shrink-0">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
    </svg>
  );
}

function ShopeeIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} className="shrink-0">
      <circle cx="12" cy="12" r="10" fill="#EE4D2D" />
      <text x="5" y="16.5" fontSize="9.5" fontWeight="bold" fill="white" fontFamily="Arial, sans-serif">Spe</text>
    </svg>
  );
}

function TokopediaIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} className="shrink-0">
      <circle cx="12" cy="12" r="10" fill="#03AC0E" />
      <text x="5.5" y="16.5" fontSize="10" fontWeight="bold" fill="white" fontFamily="Arial, sans-serif">Tk</text>
    </svg>
  );
}

function LinkDefaultIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

function PhoneCallIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-blue-500">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function renderButtonIcon(iconName?: string) {
  switch (iconName?.toLowerCase()) {
    case 'whatsapp':
      return <WhatsAppIcon />;
    case 'instagram':
      return <InstagramIcon />;
    case 'tiktok':
      return <TikTokIcon />;
    case 'maps':
      return <MapsIcon />;
    case 'phone':
    case 'call':
      return <PhoneCallIcon />;
    case 'shopee':
    case 'shopeefood':
      return <ShopeeIcon />;
    case 'tokopedia':
      return <TokopediaIcon />;
    default:
      return <LinkDefaultIcon />;
  }
}

export default function LivePhonePreview({
  tenantSlug,
  displayName,
  storeBio,
  storeLogoUrl,
  storeWhatsapp,
  visualTheme = 'aurora_gradient',
  buttons = [],
  showProducts = true,
  products = [],
  featuredProductIds = [],
}: LivePhonePreviewProps) {
  // Resolve buttons: Jika buttons kosong dari props, gunakan starter buttons dinamis toko
  const resolvedButtons: PreviewButton[] = React.useMemo(() => {
    const activeFromProps = (buttons || []).filter((b) => b.is_active !== false);
    if (activeFromProps.length > 0) {
      return activeFromProps;
    }
    // Fallback dinamis otomatis sesuai data toko live
    return [
      {
        id: 'btn-wa-live',
        label: 'Chat WhatsApp CS',
        url: `https://wa.me/${storeWhatsapp || '6281234567890'}`,
        icon: 'whatsapp',
        badge: 'Respon Cepat',
        is_active: true,
      },
      {
        id: 'btn-catalog-live',
        label: 'Katalog Produk & Promo',
        url: `/${tenantSlug}`,
        icon: 'link',
        badge: 'Diskon 50%',
        is_active: true,
      },
      {
        id: 'btn-ig-live',
        label: 'Instagram Resmi Toko',
        url: 'https://instagram.com',
        icon: 'instagram',
        is_active: true,
      },
    ];
  }, [buttons, storeWhatsapp, tenantSlug]);

  // Tampilkan produk unggulan sesuai ID yang dipilih (maksimal 5 produk)
  const previewProducts = React.useMemo(() => {
    const all = products || [];
    if (Array.isArray(featuredProductIds) && featuredProductIds.length > 0) {
      const filtered = all.filter((p) => featuredProductIds.includes(String(p.id)));
      if (filtered.length > 0) {
        return filtered.slice(0, 5);
      }
    }
    return all.slice(0, 5);
  }, [products, featuredProductIds]);

  // Theme-specific styling classes matching public storefront 1:1
  const getThemeStyles = () => {
    switch (visualTheme) {
      case 'aurora_gradient':
        return {
          screenBg: 'bg-gradient-to-br from-[#00d2ff] via-[#4338ca] to-[#7c3aed] text-white',
          radialOverlay: true,
          avatarRing: 'ring-4 ring-white/30 shadow-xl bg-white/10',
          avatarBg: 'bg-white/20 text-white font-black',
          titleColor: 'text-white font-black drop-shadow-sm',
          slugBadge: 'text-white/70 font-mono text-[10px]',
          bioColor: 'text-white/85 text-xs font-normal',
          buttonStyle:
            'rounded-full py-2.5 px-3.5 bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 text-white shadow-md flex items-center justify-between transition-all active:scale-[0.98]',
          buttonBadge: 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 text-[9px] font-bold px-1.5 py-0.5 rounded-full',
          buttonArrow: 'text-white/60',
          productBox: 'rounded-2xl p-3 bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-md space-y-2',
          productSubtext: 'text-cyan-200 font-extrabold',
          productBadge: 'rounded-full px-2 py-0.5 text-[9px] font-bold bg-white/20 text-white border border-white/30',
          productTitle: 'text-white font-bold',
          footerText: 'text-white/60',
        };
      case 'midnight_luxe':
        return {
          screenBg: 'bg-gradient-to-b from-slate-950 via-zinc-950 to-neutral-900 text-amber-100',
          radialOverlay: false,
          avatarRing: 'ring-3 ring-amber-400/60 shadow-lg shadow-amber-950/60',
          avatarBg: 'bg-zinc-900 text-amber-400 border border-amber-500/40 font-black',
          titleColor: 'text-amber-200 font-black tracking-wide',
          slugBadge: 'text-amber-400/70 font-mono text-[10px]',
          bioColor: 'text-slate-300 text-xs font-normal',
          buttonStyle:
            'rounded-full py-2.5 px-3.5 bg-zinc-900/90 hover:bg-zinc-900 text-amber-200 border border-amber-500/40 shadow-md shadow-amber-950/40 flex items-center justify-between transition-all active:scale-[0.98]',
          buttonBadge: 'bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[9px] font-bold px-1.5 py-0.5 rounded-full',
          buttonArrow: 'text-amber-400/70',
          productBox: 'rounded-2xl p-3 bg-zinc-900/90 border border-amber-500/30 text-amber-100 shadow-md space-y-2',
          productSubtext: 'text-amber-300 font-extrabold',
          productBadge: 'rounded-full px-2 py-0.5 text-[9px] font-bold bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950',
          productTitle: 'text-amber-100 font-bold',
          footerText: 'text-amber-400/50',
        };
      case 'warm_terra':
        return {
          screenBg: 'bg-gradient-to-b from-[#FFF7ED] via-[#FED7AA]/35 to-[#FFEDD5] text-stone-900',
          radialOverlay: false,
          avatarRing: 'ring-3 ring-orange-500/40 shadow-md shadow-orange-900/10',
          avatarBg: 'bg-[#431407] text-[#FFEDD5] font-black',
          titleColor: 'text-stone-900 font-black',
          slugBadge: 'text-orange-800/80 font-mono text-[10px]',
          bioColor: 'text-stone-600 text-xs font-normal',
          buttonStyle:
            'rounded-full py-2.5 px-3.5 bg-[#431407] hover:bg-[#7C2D12] text-[#FFEDD5] border border-orange-950/20 shadow-xs flex items-center justify-between transition-all active:scale-[0.98]',
          buttonBadge: 'bg-orange-400/20 text-orange-200 border border-orange-400/30 text-[9px] font-bold px-1.5 py-0.5 rounded-full',
          buttonArrow: 'text-orange-300',
          productBox: 'rounded-2xl p-3 bg-white/85 border border-orange-200 text-stone-900 shadow-2xs space-y-2',
          productSubtext: 'text-orange-700 font-extrabold',
          productBadge: 'rounded-full px-2 py-0.5 text-[9px] font-bold bg-[#EA580C] text-white',
          productTitle: 'text-stone-900 font-bold',
          footerText: 'text-stone-500',
        };
      case 'bold_performance':
        return {
          screenBg: 'bg-slate-100 text-slate-950 font-sans',
          radialOverlay: false,
          avatarRing: 'ring-2 ring-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]',
          avatarBg: 'bg-emerald-400 text-black border-2 border-black font-black',
          titleColor: 'text-black font-black uppercase tracking-tight',
          slugBadge: 'text-black font-bold text-[10px] bg-yellow-300 px-1.5 py-0.2 border border-black rounded',
          bioColor: 'text-slate-800 text-xs font-medium',
          buttonStyle:
            'rounded-xl py-2.5 px-3.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between transition-all active:translate-x-[1px] active:translate-y-[1px]',
          buttonBadge: 'bg-black text-emerald-300 text-[9px] font-bold px-1.5 py-0.5 rounded',
          buttonArrow: 'text-black',
          productBox: 'rounded-xl p-3 bg-white border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-slate-950 space-y-2',
          productSubtext: 'text-emerald-700 font-black',
          productBadge: 'rounded px-2 py-0.5 text-[9px] font-black bg-black text-emerald-400',
          productTitle: 'text-black font-black',
          footerText: 'text-slate-700 font-bold',
        };
      case 'slate_monochrome':
        return {
          screenBg: 'bg-gradient-to-b from-slate-100 via-slate-50 to-slate-200 text-slate-900',
          radialOverlay: false,
          avatarRing: 'ring-3 ring-slate-400 shadow-md shadow-slate-900/10',
          avatarBg: 'bg-slate-900 text-slate-100 font-black',
          titleColor: 'text-slate-950 font-black tracking-tight',
          slugBadge: 'text-slate-600 font-mono text-[10px] bg-slate-200/80 px-1.5 py-0.5 rounded',
          bioColor: 'text-slate-600 text-xs font-normal',
          buttonStyle:
            'rounded-full py-2.5 px-3.5 bg-slate-900 hover:bg-slate-800 text-white border border-slate-950 shadow-sm flex items-center justify-between transition-all active:scale-[0.98]',
          buttonBadge: 'bg-slate-700 text-slate-200 text-[9px] font-bold px-1.5 py-0.5 rounded-full',
          buttonArrow: 'text-slate-300',
          productBox: 'rounded-2xl p-3 bg-white border border-slate-300 text-slate-900 shadow-sm space-y-2',
          productSubtext: 'text-slate-900 font-black',
          productBadge: 'rounded-full px-2 py-0.5 text-[9px] font-bold bg-slate-900 text-white',
          productTitle: 'text-slate-950 font-bold',
          footerText: 'text-slate-500',
        };
      case 'clean_minimal':
      default:
        return {
          screenBg: 'bg-slate-50 text-slate-900',
          radialOverlay: false,
          avatarRing: 'ring-3 ring-slate-200 shadow-sm',
          avatarBg: 'bg-gradient-to-br from-indigo-600 to-blue-600 text-white font-black',
          titleColor: 'text-slate-900 font-black',
          slugBadge: 'text-slate-500 font-mono text-[10px]',
          bioColor: 'text-slate-600 text-xs font-normal',
          buttonStyle:
            'rounded-full py-2.5 px-3.5 bg-white hover:bg-slate-100/90 text-slate-800 border border-slate-200/90 shadow-2xs flex items-center justify-between transition-all active:scale-[0.98]',
          buttonBadge: 'bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] font-bold px-1.5 py-0.5 rounded-full',
          buttonArrow: 'text-slate-400',
          productBox: 'rounded-2xl p-3 bg-white border border-slate-200/90 text-slate-900 shadow-2xs space-y-2',
          productSubtext: 'text-emerald-600 font-black',
          productBadge: 'rounded-full px-2 py-0.5 text-[9px] font-bold bg-emerald-600 text-white',
          productTitle: 'text-slate-900 font-bold',
          footerText: 'text-slate-400',
        };
    }
  };

  const themeStyles = getThemeStyles();
  const nameToShow = displayName || tenantSlug;

  return (
    <div className="w-full max-w-[340px] xl:max-w-[360px] mx-auto space-y-3 select-none">
      {/* Phone Header Indicator */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <Smartphone className="w-4 h-4 text-slate-500" />
          <span>Live Phone Preview</span>
        </span>
        <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Real-Time WYSIWYG</span>
        </span>
      </div>

      {/* Smartphone Hardware Frame */}
      <div className="bg-slate-950 p-2.5 rounded-[44px] shadow-2xl border-4 border-slate-800 transition-all duration-300">
        {/* Phone Glass Screen */}
        <div
          className={`w-full rounded-[36px] overflow-hidden min-h-[550px] max-h-[640px] flex flex-col items-center p-4 transition-colors duration-300 relative overflow-y-auto no-scrollbar ${themeStyles.screenBg}`}
        >
          {/* Radial depth overlay for Aurora Gradient */}
          {themeStyles.radialOverlay && (
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  'radial-gradient(ellipse at 15% 10%, rgba(255,255,255,0.12) 0%, transparent 55%), radial-gradient(ellipse at 85% 85%, rgba(124,58,237,0.3) 0%, transparent 55%)',
              }}
            />
          )}

          {/* Dynamic Island / Notch */}
          <div className="w-24 h-4 bg-slate-950/80 backdrop-blur-md rounded-full mb-4 shrink-0 shadow-inner z-10" />

          {/* Profile Header 1:1 with Microsite */}
          <div className="relative z-10 flex flex-col items-center text-center space-y-1.5 w-full shrink-0">
            {/* Avatar & Verified Badge */}
            <div className="relative">
              {storeLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={storeLogoUrl}
                  alt={nameToShow}
                  className={`w-20 h-20 rounded-full object-cover ${themeStyles.avatarRing}`}
                />
              ) : (
                <div
                  className={`w-20 h-20 rounded-full text-2xl flex items-center justify-center uppercase ${themeStyles.avatarBg} ${themeStyles.avatarRing}`}
                >
                  {nameToShow.charAt(0)}
                </div>
              )}

              {/* Verified Badge */}
              <div className="absolute bottom-0 right-0 bg-white rounded-full p-1 shadow-md">
                <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 text-[#4338ca]" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>

            {/* Store Name & Subdomain */}
            <div className="space-y-0.5 pt-1">
              <h4 className={`text-base leading-tight font-black ${themeStyles.titleColor}`}>
                {nameToShow}
              </h4>
              <p className={themeStyles.slugBadge}>
                @{tenantSlug.toLowerCase()}
              </p>
            </div>

            {/* Bio text */}
            <p className={`text-center line-clamp-2 max-w-[250px] leading-relaxed ${themeStyles.bioColor}`}>
              {storeBio || 'Pemesanan online praktis & katalog resmi terverifikasi.'}
            </p>
          </div>

          {/* Action Link Buttons (1:1 Pill Design) */}
          <div className="relative z-10 w-full space-y-2.5 mt-5">
            {resolvedButtons.map((btn) => (
              <div
                key={btn.id}
                className={`w-full cursor-pointer group ${themeStyles.buttonStyle}`}
              >
                {/* Left: Brand Icon */}
                <span className="w-6 h-6 shrink-0 flex items-center justify-center">
                  {renderButtonIcon(btn.icon)}
                </span>

                {/* Center: Label & Optional Micro-Badge */}
                <div className="flex-1 min-w-0 text-center px-2 flex items-center justify-center gap-1.5">
                  <span className="text-xs font-semibold truncate">
                    {btn.label}
                  </span>
                  {btn.badge && (
                    <span className={themeStyles.buttonBadge}>
                      {btn.badge}
                    </span>
                  )}
                </div>

                {/* Right: Arrow Up Right */}
                <ArrowUpRight className={`w-3.5 h-3.5 shrink-0 ${themeStyles.buttonArrow}`} />
              </div>
            ))}
          </div>

          {/* Product Catalog Section (1:1 Glass Cards) */}
          {showProducts && previewProducts.length > 0 && (
            <div className={`relative z-10 w-full mt-5 ${themeStyles.productBox}`}>
              <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                <div className="flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-black">Katalog Unggulan</span>
                </div>
                <span className="text-[9px] font-bold opacity-75">{previewProducts.length} Produk</span>
              </div>

              <div className="space-y-1.5">
                {previewProducts.map((prod) => {
                  const pImg = prod.image || (prod as any).image_url;
                  return (
                    <div
                      key={prod.id}
                      className="flex items-center gap-2 p-1.5 rounded-xl border border-white/10 bg-white/5"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={pImg || "/placeholder-product.png"}
                        alt={prod.name}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "/placeholder-product.png";
                        }}
                        className="w-9 h-9 rounded-lg object-cover border border-white/15 shrink-0 bg-white/10"
                      />
                      <div className="min-w-0 flex-1">
                        <h5 className={`text-[11px] truncate ${themeStyles.productTitle}`}>{prod.name}</h5>
                        <p className={`text-[10px] ${themeStyles.productSubtext}`}>
                          Rp {Number(prod.price).toLocaleString('id-ID')}
                        </p>
                      </div>
                      <span className={`shrink-0 ${themeStyles.productBadge}`}>
                        Pesan
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer Watermark */}
          <div className="relative z-10 w-full mt-auto pt-4 text-center">
            <span className={`text-[9px] font-semibold tracking-tight ${themeStyles.footerText}`}>
              ⚡ Powered by BoonTrack Official Platform
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
