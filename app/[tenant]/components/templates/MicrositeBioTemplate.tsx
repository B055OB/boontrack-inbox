'use client';

import React, { useState, useEffect } from 'react';
import { ArrowUpRight, ArrowRight, ShoppingBag, Sparkles, Download, QrCode, ExternalLink, Plus } from 'lucide-react';
import type { Product } from '@/app/[tenant]/page';
import FloatingWebchat from './FloatingWebchat';
import { sanitizeImageUrl } from '@/lib/image-utils';
import {
  initPixelsFromMetadata,
  trackContactEvent,
  trackInitiateCheckout,
  formatIndonesianWhatsAppNumber,
} from '@/lib/tracking';
import { getSupabase } from '@/lib/supabaseClient';
import { resolveProductExternalUrl, resolveProductCtaLabel } from '@/lib/product-catalog';

// ─── Product image with graceful fallback ────────────────────────────────────
function MicrositeItemImage({
  src,
  alt,
  placeholderClass = 'bg-white/10 border-white/20 text-white/40',
}: {
  src?: string;
  alt: string;
  placeholderClass?: string;
}) {
  const [error, setError] = useState(false);
  const safeSrc = sanitizeImageUrl(src);

  if (!safeSrc || error) {
    return (
      <div className={`w-14 h-14 rounded-xl shrink-0 flex flex-col items-center justify-center border ${placeholderClass}`}>
        <ShoppingBag className="w-5 h-5" />
      </div>
    );
  }

  return (
    <img
      src={safeSrc}
      alt={alt}
      onError={() => setError(true)}
      className="w-14 h-14 rounded-xl object-cover shrink-0 border border-black/10"
    />
  );
}

export type VisualThemeType =
  | 'clean_minimal'
  | 'aurora_gradient'
  | 'midnight_luxe'
  | 'warm_terra'
  | 'bold_performance'
  | 'slate_monochrome';

export function getMicrositeThemeStyles(visualTheme: VisualThemeType | string) {
  switch (visualTheme) {
    case 'aurora_gradient':
      return {
        screenBg: 'bg-gradient-to-br from-[#00d2ff] via-[#4338ca] to-[#7c3aed] text-white',
        radialOverlay: true,
        avatarRing: 'ring-4 ring-white/30 shadow-xl bg-white/10',
        avatarBg: 'bg-white/20 text-white font-black',
        titleColor: 'text-white font-black drop-shadow-sm',
        slugBadge: 'text-white/70 font-mono text-xs',
        bioColor: 'text-white/85 text-xs sm:text-sm',
        buttonStyle:
          'rounded-full py-3.5 px-5 bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 text-white shadow-lg flex items-center justify-between transition-all active:scale-[0.98]',
        buttonBadge:
          'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
        buttonArrow: 'text-white/60',
        productBox:
          'rounded-2xl p-4 bg-white/15 backdrop-blur-md border border-white/20 text-white shadow-md space-y-2',
        productCard:
          'bg-white/15 backdrop-blur-md border border-white/20 rounded-2xl p-4 text-white flex items-center gap-3 transition-all hover:bg-white/25',
        productTitle: 'text-white font-bold',
        productPrice: 'text-cyan-200 font-bold',
        productBadge:
          'rounded-full px-4 py-2 bg-white/20 text-white text-xs font-bold border border-white/30',
        productImagePlaceholder: 'bg-white/10 border-white/20 text-white/40',
        footerText: 'text-white/60',
        verifiedBadgeBg: 'bg-white text-[#4338ca]',
      };
    case 'midnight_luxe':
      return {
        screenBg: 'bg-gradient-to-b from-slate-950 via-zinc-950 to-neutral-900 text-amber-100',
        radialOverlay: false,
        avatarRing: 'ring-3 ring-amber-400/60 shadow-lg shadow-amber-950/60',
        avatarBg: 'bg-zinc-900 text-amber-400 border border-amber-500/40 font-black',
        titleColor: 'text-amber-200 font-black tracking-wide',
        slugBadge: 'text-amber-400/70 font-mono text-xs',
        bioColor: 'text-slate-300 text-xs sm:text-sm',
        buttonStyle:
          'rounded-full py-3.5 px-5 bg-zinc-900/90 hover:bg-zinc-900 text-amber-200 border border-amber-500/40 shadow-md shadow-amber-950/40 flex items-center justify-between transition-all active:scale-[0.98]',
        buttonBadge:
          'bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
        buttonArrow: 'text-amber-400/70',
        productBox:
          'rounded-2xl p-4 bg-zinc-900/90 border border-amber-500/30 text-amber-100 shadow-md space-y-2',
        productCard:
          'bg-zinc-900/90 border border-amber-500/30 rounded-2xl p-4 text-amber-100 flex items-center gap-3 transition-all hover:bg-zinc-800',
        productTitle: 'text-amber-100 font-bold',
        productPrice: 'text-amber-300 font-bold',
        productBadge:
          'rounded-full px-4 py-2 bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 text-xs font-bold',
        productImagePlaceholder: 'bg-zinc-800 border-amber-500/30 text-amber-400/40',
        footerText: 'text-amber-400/50',
        verifiedBadgeBg: 'bg-amber-400 text-slate-950',
      };
    case 'warm_terra':
      return {
        screenBg: 'bg-gradient-to-b from-[#FFF7ED] via-[#FED7AA]/35 to-[#FFEDD5] text-stone-900',
        radialOverlay: false,
        avatarRing: 'ring-3 ring-orange-500/40 shadow-md shadow-orange-900/10',
        avatarBg: 'bg-[#431407] text-[#FFEDD5] font-black',
        titleColor: 'text-stone-900 font-black',
        slugBadge: 'text-orange-800/80 font-mono text-xs',
        bioColor: 'text-stone-600 text-xs sm:text-sm',
        buttonStyle:
          'rounded-full py-3.5 px-5 bg-[#431407] hover:bg-[#7C2D12] text-[#FFEDD5] border border-orange-950/20 shadow-xs flex items-center justify-between transition-all active:scale-[0.98]',
        buttonBadge:
          'bg-orange-400/20 text-orange-200 border border-orange-400/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
        buttonArrow: 'text-orange-300',
        productBox:
          'rounded-2xl p-4 bg-white/85 border border-orange-200 text-stone-900 shadow-xs space-y-2',
        productCard:
          'bg-white/85 border border-orange-200 rounded-2xl p-4 text-stone-900 flex items-center gap-3 transition-all hover:bg-white',
        productTitle: 'text-stone-900 font-bold',
        productPrice: 'text-orange-700 font-bold',
        productBadge:
          'rounded-full px-4 py-2 bg-[#EA580C] text-white text-xs font-bold',
        productImagePlaceholder: 'bg-orange-100/50 border-orange-200 text-orange-400',
        footerText: 'text-stone-500',
        verifiedBadgeBg: 'bg-[#EA580C] text-white',
      };
    case 'bold_performance':
      return {
        screenBg: 'bg-slate-100 text-slate-950 font-sans',
        radialOverlay: false,
        avatarRing: 'ring-2 ring-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]',
        avatarBg: 'bg-emerald-400 text-black border-2 border-black font-black',
        titleColor: 'text-black font-black uppercase tracking-tight',
        slugBadge: 'text-black font-bold text-xs bg-yellow-300 px-2 py-0.5 border border-black rounded',
        bioColor: 'text-slate-800 text-xs sm:text-sm font-medium',
        buttonStyle:
          'rounded-xl py-3.5 px-5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between transition-all active:translate-x-[1px] active:translate-y-[1px]',
        buttonBadge: 'bg-black text-emerald-300 text-[10px] font-bold px-1.5 py-0.5 rounded',
        buttonArrow: 'text-black',
        productBox:
          'rounded-xl p-4 bg-white border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-slate-950 space-y-2',
        productCard:
          'bg-white border-2 border-black rounded-xl p-4 text-slate-950 flex items-center gap-3 transition-all hover:bg-slate-50 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]',
        productTitle: 'text-black font-black',
        productPrice: 'text-emerald-700 font-black',
        productBadge: 'rounded px-4 py-2 text-xs font-black bg-black text-emerald-400',
        productImagePlaceholder: 'bg-slate-200 border-2 border-black text-black',
        footerText: 'text-slate-700 font-bold',
        verifiedBadgeBg: 'bg-yellow-400 text-black border border-black',
      };
    case 'slate_monochrome':
      return {
        screenBg: 'bg-gradient-to-b from-slate-100 via-slate-50 to-slate-200 text-slate-900',
        radialOverlay: false,
        avatarRing: 'ring-3 ring-slate-400 shadow-md shadow-slate-900/10',
        avatarBg: 'bg-slate-900 text-slate-100 font-black',
        titleColor: 'text-slate-950 font-black tracking-tight',
        slugBadge: 'text-slate-600 font-mono text-xs bg-slate-200/80 px-2 py-0.5 rounded',
        bioColor: 'text-slate-600 text-xs sm:text-sm',
        buttonStyle:
          'rounded-full py-3.5 px-5 bg-slate-900 hover:bg-slate-800 text-white border border-slate-950 shadow-sm flex items-center justify-between transition-all active:scale-[0.98]',
        buttonBadge: 'bg-slate-700 text-slate-200 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
        buttonArrow: 'text-slate-300',
        productBox:
          'rounded-2xl p-4 bg-white border border-slate-300 text-slate-900 shadow-sm space-y-2',
        productCard:
          'bg-white border border-slate-300 rounded-2xl p-4 text-slate-900 flex items-center gap-3 transition-all hover:bg-slate-50',
        productTitle: 'text-slate-950 font-bold',
        productPrice: 'text-slate-900 font-bold',
        productBadge: 'rounded-full px-4 py-2 bg-slate-900 text-white text-xs font-bold',
        productImagePlaceholder: 'bg-slate-100 border-slate-300 text-slate-400',
        footerText: 'text-slate-500',
        verifiedBadgeBg: 'bg-slate-900 text-white',
      };
    case 'clean_minimal':
    default:
      return {
        screenBg: 'bg-slate-50 text-slate-900',
        radialOverlay: false,
        avatarRing: 'ring-3 ring-slate-200 shadow-sm',
        avatarBg: 'bg-gradient-to-br from-indigo-600 to-blue-600 text-white font-black',
        titleColor: 'text-slate-900 font-black',
        slugBadge: 'text-slate-500 font-mono text-xs',
        bioColor: 'text-slate-600 text-xs sm:text-sm',
        buttonStyle:
          'rounded-full py-3.5 px-5 bg-white hover:bg-slate-100/90 text-slate-800 border border-slate-200/90 shadow-xs flex items-center justify-between transition-all active:scale-[0.98]',
        buttonBadge:
          'bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
        buttonArrow: 'text-slate-400',
        productBox:
          'rounded-2xl p-4 bg-white border border-slate-200/90 text-slate-900 shadow-xs space-y-2',
        productCard:
          'bg-white border border-slate-200/90 rounded-2xl p-4 text-slate-900 flex items-center gap-3 transition-all hover:bg-slate-50/80',
        productTitle: 'text-slate-900 font-bold',
        productPrice: 'text-emerald-600 font-bold',
        productBadge: 'rounded-full px-4 py-2 bg-emerald-600 text-white text-xs font-bold',
        productImagePlaceholder: 'bg-slate-100 border-slate-200 text-slate-400',
        footerText: 'text-slate-400',
        verifiedBadgeBg: 'bg-blue-600 text-white',
      };
  }
}

// ─── Brand SVG icons ─────────────────────────────────────────────────────────
function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366" />
      <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.659 1.438 5.168L2 22l4.985-1.424A9.954 9.954 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" stroke="#25D366" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none">
      <defs>
        <linearGradient id="ig-grad-ms" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f09433" />
          <stop offset="25%" stopColor="#e6683c" />
          <stop offset="50%" stopColor="#dc2743" />
          <stop offset="75%" stopColor="#cc2366" />
          <stop offset="100%" stopColor="#bc1888" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#ig-grad-ms)" />
      <circle cx="12" cy="12" r="4" stroke="white" strokeWidth="1.8" fill="none" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="white" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="white">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.22 6.22 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.95a8.16 8.16 0 004.77 1.52V7.04a4.85 4.85 0 01-1-.35z" />
    </svg>
  );
}

function TokopediaIcon() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24}>
      <circle cx="12" cy="12" r="10" fill="#03AC0E" />
      <text x="5.5" y="16.5" fontSize="10" fontWeight="bold" fill="white" fontFamily="Arial, sans-serif">Tk</text>
    </svg>
  );
}

function ShopeeIcon() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24}>
      <circle cx="12" cy="12" r="10" fill="#EE4D2D" />
      <text x="5" y="16.5" fontSize="9.5" fontWeight="bold" fill="white" fontFamily="Arial, sans-serif">Spe</text>
    </svg>
  );
}

function MapsIcon() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="#EA4335">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="#60a5fa">
      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
    </svg>
  );
}

function WebIcon() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

function LinkDefaultIcon() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

function getButtonIcon(iconType: string): React.ReactNode {
  switch (iconType) {
    case 'whatsapp': return <WhatsAppIcon />;
    case 'instagram': return <InstagramIcon />;
    case 'tiktok': return <TikTokIcon />;
    case 'tokopedia': return <TokopediaIcon />;
    case 'shopee': case 'shopeefood': return <ShopeeIcon />;
    case 'maps': return <MapsIcon />;
    case 'phone': return <PhoneIcon />;
    case 'web': case 'website': return <WebIcon />;
    default: return <LinkDefaultIcon />;
  }
}

// ─── Component Props ──────────────────────────────────────────────────────────
interface MicrositeBioTemplateProps {
  tenantSlug: string;
  storeName: string;
  displayName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tenant?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tenantMetadata: any;
  visualTheme?: VisualThemeType | string;
  storeLogoUrl?: string;
  storeProducts: Product[];
  dynamicQuickReplies: string[];
  chatEnabled: boolean;
  onInitiateCheckout: (product: {
    id: string;
    title: string;
    price: number;
    download_url?: string;
    link_digital?: string;
    delivery_url?: string;
    category?: string;
    type?: string;
    product_type?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fulfillment_metadata?: any;
  }) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onOutboundClick: (url: string, label: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAddToCart?: (product: any, e: React.MouseEvent) => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MicrositeBioTemplate({
  tenantSlug,
  storeName,
  displayName,
  tenant,
  tenantMetadata,
  visualTheme: propVisualTheme,
  storeLogoUrl,
  storeProducts,
  dynamicQuickReplies,
  chatEnabled,
  onInitiateCheckout,
  onOutboundClick,
  onAddToCart,
}: MicrositeBioTemplateProps) {
  const activeName = storeName || displayName.toUpperCase();

  // ── Deterministic Visual Theme Resolution ──
  const activeVisualTheme: VisualThemeType = (
    propVisualTheme ||
    tenantMetadata?.theme?.theme_id ||
    tenantMetadata?.theme?.visual_theme ||
    tenantMetadata?.visual_theme ||
    tenant?.metadata?.theme?.theme_id ||
    tenant?.metadata?.theme?.visual_theme ||
    tenant?.metadata?.visual_theme ||
    'clean_minimal'
  ) as VisualThemeType;

  const themeStyles = getMicrositeThemeStyles(activeVisualTheme);

  // ── Avatar resolution ─────────────────────────────────────────────────────
  const rawLogo =
    storeLogoUrl ||
    tenant?.metadata?.logo_url ||
    tenant?.metadata?.store_logo_url ||
    tenant?.metadata?.avatar_url ||
    tenantMetadata?.logo_url ||
    tenantMetadata?.store_logo_url ||
    tenantMetadata?.avatar_url ||
    tenant?.logo_url ||
    tenant?.avatar_url ||
    '/logo.png';
  const displayAvatar = sanitizeImageUrl(rawLogo) || rawLogo;
  const [avatarError, setAvatarError] = useState(false);

  const initials =
    (activeName || 'Store')
      .split(' ')
      .map((w: string) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'ST';

  const bioText = tenantMetadata?.bio || tenantMetadata?.description || '';
  const rawWhatsapp =
    tenantMetadata?.whatsapp_number ||
    tenantMetadata?.whatsapp ||
    tenant?.metadata?.whatsapp_number ||
    tenant?.metadata?.whatsapp ||
    '';
  const cleanWhatsapp = formatIndonesianWhatsAppNumber(rawWhatsapp);
  const whatsappUrl = cleanWhatsapp
    ? `https://wa.me/${cleanWhatsapp}?text=Halo%20${encodeURIComponent(activeName)},%20saya%20tertarik%20dengan%20produk%2Flayanan%20Anda`
    : '';

  // ── Auto-inject Meta & TikTok pixels from tenant.metadata.tracking / tenant_settings ───
  useEffect(() => {
    let isMounted = true;

    async function resolveAndInitTracking() {
      const tracking = (tenant?.metadata?.tracking || tenantMetadata?.tracking || {}) as Record<string, any>;
      let fbPixelId = tracking.meta_pixel_id || tracking.facebook_pixel_id || '';
      let ttPixelId = tracking.tiktok_pixel_id || '';

      // Jika belum ditemukan di metadata tenant, query langsung dari tenant_settings (sumber Ads Tracking Pro)
      if (!fbPixelId && tenantSlug) {
        try {
          const supabase = getSupabase();
          if (supabase) {
            const { data } = await supabase
              .from('tenant_settings')
              .select('ads_tracking_config')
              .eq('tenant_slug', tenantSlug)
              .maybeSingle();

            if (data?.ads_tracking_config) {
              const cfg = data.ads_tracking_config;
              fbPixelId = cfg.meta_pixel_id || cfg.facebook_pixel_id || '';
              ttPixelId = cfg.tiktok_pixel_id || '';
            }
          }
        } catch (err) {
          console.warn('[MicrositeBioTemplate] Tracking query error:', err);
        }
      }

      if (isMounted) {
        console.log('[Tracking Debug] Loaded Pixel ID:', fbPixelId || null);
        if (fbPixelId || ttPixelId) {
          initPixelsFromMetadata({
            facebook_pixel_id: fbPixelId,
            meta_pixel_id: fbPixelId,
            tiktok_pixel_id: ttPixelId,
          });
        }
      }
    }

    resolveAndInitTracking();
    return () => {
      isMounted = false;
    };
  }, [tenant, tenantMetadata, tenantSlug]);

  // ── Product catalog visibility ────────────────────────────────────────────
  // Checks (in order): microsite_settings.show_products → microsite.show_products → microsite_show_products (legacy)
  // Default to true jika storeProducts ada isinya agar katalog merchant tidak hilang secara diam-diam
  const showProducts =
    tenantMetadata?.microsite_settings?.show_products ??
    tenantMetadata?.microsite?.show_products ??
    tenantMetadata?.microsite_show_products ??
    true;

  const featuredIds: string[] = React.useMemo(() => {
    const raw =
      tenantMetadata?.featured_product_ids ||
      tenantMetadata?.microsite_featured_product_ids ||
      tenantMetadata?.microsite?.featured_product_ids;
    return Array.isArray(raw) ? raw.map(String).slice(0, 5) : [];
  }, [tenantMetadata]);

  const productMode =
    tenantMetadata?.microsite_product_mode ||
    tenantMetadata?.microsite?.product_mode ||
    (featuredIds.length > 0 ? 'manual' : 'all');

  const visibleProducts = React.useMemo(() => {
    if (!showProducts || !Array.isArray(storeProducts) || storeProducts.length === 0) return [];
    if (productMode === 'manual' && featuredIds.length > 0) {
      const filtered = storeProducts.filter((p) => featuredIds.includes(String(p.id)));
      if (filtered.length > 0) return filtered;
    }
    // Default mode 'all': tampilkan seluruh produk katalog aktif
    return storeProducts;
  }, [showProducts, storeProducts, productMode, featuredIds]);

  const isDigitalCatalog = ['DIGITAL', 'COURSE', 'SOFTWARE', 'CREATOR', 'AGENCY'].some((k) =>
    (tenantMetadata?.category || tenantMetadata?.vertical_type || '').toUpperCase().includes(k)
  );

  // ── Dynamic buttons resolved strictly from metadata without hardcoded fallback links ──
  const dynamicButtons = React.useMemo(() => {
    if (
      Array.isArray(tenantMetadata?.microsite?.buttons) &&
      tenantMetadata.microsite.buttons.filter((b: any) => b && b.is_active !== false).length > 0
    ) {
      return tenantMetadata.microsite.buttons.filter((b: any) => b && b.is_active !== false);
    }

    const btns: Array<{
      id: string;
      label: string;
      url: string;
      icon?: string;
      subtitle?: string;
      badge?: string;
    }> = [];

    if (whatsappUrl) {
      btns.push({ id: 'whatsapp', label: 'Chat WhatsApp CS', url: whatsappUrl, icon: 'whatsapp', badge: 'Respon Cepat' });
    }
    if (tenantMetadata?.links?.gofood) {
      btns.push({ id: 'gofood', label: 'Pesan via GoFood', url: tenantMetadata.links.gofood, icon: 'link' });
    }
    if (tenantMetadata?.links?.grabfood) {
      btns.push({ id: 'grabfood', label: 'Order via GrabFood', url: tenantMetadata.links.grabfood, icon: 'link' });
    }
    if (tenantMetadata?.links?.shopeefood) {
      btns.push({ id: 'shopeefood', label: 'Order via ShopeeFood', url: tenantMetadata.links.shopeefood, icon: 'shopeefood' });
    }
    if (tenantMetadata?.links?.instagram) {
      btns.push({ id: 'instagram', label: 'Instagram Resmi', url: tenantMetadata.links.instagram, icon: 'instagram' });
    }
    if (tenantMetadata?.links?.tiktok) {
      btns.push({ id: 'tiktok', label: 'TikTok Resmi', url: tenantMetadata.links.tiktok, icon: 'tiktok' });
    }
    if (tenantMetadata?.links?.tokopedia) {
      btns.push({ id: 'tokopedia', label: 'Tokopedia Resmi', url: tenantMetadata.links.tokopedia, icon: 'tokopedia' });
    }
    if (tenantMetadata?.links?.website) {
      btns.push({ id: 'website', label: 'Website Resmi', url: tenantMetadata.links.website, icon: 'web' });
    }

    return btns;
  }, [tenantMetadata, whatsappUrl]);

  // ── Flagship / Card Grid Mode Resolution ─────────────────────────────────
  const isCardGridLayout = Boolean(
    tenantMetadata?.is_flagship ||
    tenantMetadata?.storefront_style === 'flagship' ||
    tenantMetadata?.product_layout === 'card_grid' ||
    tenantMetadata?.product_layout === 'grid' ||
    tenantMetadata?.microsite_product_layout === 'grid' ||
    tenantMetadata?.microsite_product_layout === 'card_grid' ||
    tenantMetadata?.flagship_mode ||
    tenant?.metadata?.is_flagship ||
    tenant?.metadata?.storefront_style === 'flagship' ||
    tenant?.metadata?.product_layout === 'card_grid'
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`${themeStyles.screenBg} min-h-screen antialiased`}>
      {/* Radial overlay for depth if enabled by theme */}
      {themeStyles.radialOverlay && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at 15% 10%, rgba(255,255,255,0.07) 0%, transparent 55%), radial-gradient(ellipse at 85% 85%, rgba(124,58,237,0.28) 0%, transparent 55%)',
          }}
        />
      )}

      <div className={`relative ${isCardGridLayout ? 'max-w-3xl' : 'max-w-md'} mx-auto px-4 py-8 flex flex-col items-center transition-all duration-300`}>

        {/* ── Profile Header ── */}
        <div className="flex flex-col items-center text-center space-y-3 pt-2 w-full">
          {/* Avatar */}
          <div className="relative">
            <div className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden ${themeStyles.avatarRing} flex items-center justify-center`}>
              {displayAvatar && !avatarError ? (
                <img
                  src={displayAvatar}
                  alt={activeName}
                  onError={() => setAvatarError(true)}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <div className={`w-full h-full rounded-full ${themeStyles.avatarBg} flex items-center justify-center text-3xl`}>
                  {initials}
                </div>
              )}
            </div>
            {/* Verified badge */}
            <div className={`absolute bottom-1 right-1 rounded-full p-1 shadow-lg ${themeStyles.verifiedBadgeBg}`}>
              <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
            </div>
          </div>

          {/* Name & handle */}
          <div className="space-y-0.5">
            <h1 className={`text-xl font-bold tracking-tight ${themeStyles.titleColor}`}>{activeName}</h1>
            <p className={themeStyles.slugBadge}>@{tenantSlug.toLowerCase()}</p>
          </div>

          {/* Bio */}
          {bioText ? (
            <p className={`${themeStyles.bioColor} text-center mt-2 leading-relaxed max-w-xs`}>
              {bioText}
            </p>
          ) : null}
        </div>

        {/* ── Pill Link Buttons ── */}
        <div className="mt-8 space-y-3 w-full">
          {dynamicButtons.length > 0 ? (
            dynamicButtons.map((btn: any) => {
              const isWhatsApp = btn.icon === 'whatsapp' || btn.id === 'whatsapp';

              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => {
                    let targetUrl = btn.url;
                    if (isWhatsApp) {
                      trackContactEvent('WhatsApp Bio');
                      // Pastikan link wa.me diawali kode negara 62 (jangan terpotong atau menjadi +81)
                      targetUrl = targetUrl.replace(/wa\.me\/08/g, 'wa.me/628').replace(/wa\.me\/0/g, 'wa.me/62');
                      window.open(targetUrl, '_blank', 'noopener,noreferrer');
                      return;
                    }
                    onOutboundClick(targetUrl, `microsite_${btn.id}`);
                  }}
                  className={`${themeStyles.buttonStyle} w-full cursor-pointer`}
                >
                  {/* Left: brand icon */}
                  <span className="w-6 h-6 shrink-0 flex items-center justify-center">
                    {getButtonIcon(btn.icon || 'link')}
                  </span>

                  {/* Center: label */}
                  <span className="flex-1 font-medium text-sm sm:text-base text-center px-3">
                    {btn.label || btn.title}
                    {btn.badge && (
                      <span className={`ml-2 ${themeStyles.buttonBadge}`}>
                        {btn.badge}
                      </span>
                    )}
                  </span>

                  {/* Right: arrow */}
                  <ArrowUpRight className={`w-4 h-4 shrink-0 ${themeStyles.buttonArrow}`} />
                </button>
              );
            })
          ) : (
            <div className="rounded-2xl bg-white/10 border border-dashed border-white/20 p-6 text-center text-xs text-white/50">
              Belum ada tautan yang dikonfigurasi.
            </div>
          )}
        </div>

        {/* ── Product Catalog (Modern Cards or Compact List) ── */}
        {showProducts && visibleProducts.length > 0 && (
          <div className="mt-8 w-full space-y-3">
            {/* Section header */}
            <div className="flex items-center gap-2 px-1">
              {isDigitalCatalog ? (
                <Sparkles className="w-4 h-4 text-yellow-300" />
              ) : (
                <ShoppingBag className="w-4 h-4 text-white/70" />
              )}
              <h2 className="text-sm font-bold text-white drop-shadow-sm">
                {isDigitalCatalog ? 'Katalog Digital' : 'Pilihan Produk'}
              </h2>
              <span className="ml-auto text-[10px] text-white/50 font-semibold">
                {visibleProducts.length} Pilihan
              </span>
            </div>

            {isCardGridLayout ? (
              /* Modern Product Cards: Grid 1 Kolom Mobile / 2 Kolom Desktop */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4.5 w-full mt-3">
                {visibleProducts.map((item) => {
                  const hasDedicatedPage =
                    Boolean(item.slug) &&
                    (Boolean(item.single_page_config) ||
                     Boolean((item as any).single_page_enabled) ||
                     Boolean((item as any).single_page));
                  const dedicatedPageUrl = hasDedicatedPage && item.slug
                    ? `/${tenantSlug}/p/${item.slug}`
                    : null;

                  const rawExternal = !hasDedicatedPage
                    ? (item.external_url ||
                       (item as any).affiliate_url ||
                       (item.metadata && (item.metadata.external_url || item.metadata.affiliate_url)) ||
                       resolveProductExternalUrl(item))
                    : null;
                  const externalUrl = rawExternal ? String(rawExternal).trim() : null;
                  const isExternal = Boolean(externalUrl);
                  const ctaLabel = item.cta_label || resolveProductCtaLabel(item, isExternal);

                  const handleExternalClick = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    if (!externalUrl) return;

                    if (typeof window !== "undefined" && typeof (window as any).fbq === "function") {
                      try {
                        (window as any).fbq("track", "InitiateCheckout", {
                          content_name: (item as any).title || item.name,
                          content_ids: [String(item.id || (item as any).slug)],
                          content_type: "product",
                          value: Number(item.price) || 0,
                          currency: "IDR"
                        });
                      } catch (_) {}
                    }

                    try {
                      trackInitiateCheckout((item as any).title || item.name, Number(item.price) || 0);
                    } catch (_) {}

                    try {
                      trackContactEvent(`Affiliate Outbound: ${item.name}`);
                    } catch (_) {}

                    try {
                      onOutboundClick?.(externalUrl, ctaLabel);
                    } catch (_) {}

                    window.open(externalUrl, "_blank", "noopener,noreferrer");
                  };

                  const handleCardClick = (e: React.MouseEvent) => {
                    if (dedicatedPageUrl) {
                      e.stopPropagation();
                      window.location.href = dedicatedPageUrl;
                    } else if (isExternal && externalUrl) {
                      handleExternalClick(e);
                    }
                  };

                  const safeImage = sanitizeImageUrl(item.image) || item.image;

                  return (
                    <div
                      key={item.id}
                      onClick={dedicatedPageUrl || isExternal ? handleCardClick : undefined}
                      className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-2xl sm:rounded-3xl border border-slate-200/90 dark:border-white/10 p-4 shadow-sm hover:shadow-lg transition-all flex flex-col justify-between group text-slate-900 dark:text-white"
                    >
                      <div>
                        {/* Thumbnail Gambar Besar & Proporsional di Atas Kartu */}
                        <div className="relative rounded-xl sm:rounded-2xl overflow-hidden mb-3.5 bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-white/10 aspect-[4/3] sm:aspect-video w-full flex items-center justify-center p-1.5">
                          {safeImage ? (
                            <img
                              src={safeImage}
                              alt={item.name}
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <ShoppingBag className="w-8 h-8" />
                            </div>
                          )}
                          {item.badge && (
                            <span className="absolute top-2.5 left-2.5 bg-white/95 backdrop-blur-xs text-blue-700 border border-slate-200 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-xs">
                              {item.badge}
                            </span>
                          )}
                        </div>

                        {/* Info Produk: Judul penuh tanpa truncate, deskripsi 2-3 baris, harga kontras */}
                        <h3 className="font-bold text-sm sm:text-base leading-snug group-hover:text-blue-600 dark:group-hover:text-cyan-400 transition-colors">
                          {item.name}
                        </h3>

                        {item.description ? (
                          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed mt-1.5">
                            {item.description}
                          </p>
                        ) : null}
                      </div>

                      <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-white/10 space-y-3">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-black text-sm sm:text-base text-blue-600 dark:text-amber-300">
                            {Number(item.price) === 0 ? 'GRATIS' : `Rp ${Number(item.price).toLocaleString('id-ID')}`}
                          </span>
                          {item.originalPrice && item.originalPrice > item.price ? (
                            <span className="text-[11px] text-slate-400 line-through">
                              Rp {Number(item.originalPrice).toLocaleString('id-ID')}
                            </span>
                          ) : null}
                        </div>

                        {/* CTA Buttons: + Keranjang dan Pesan Langsung */}
                        {dedicatedPageUrl ? (
                          <a
                            href={dedicatedPageUrl}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full py-2.5 px-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md"
                          >
                            <span>{ctaLabel}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </a>
                        ) : isExternal ? (
                          <a
                            href={externalUrl!}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={handleExternalClick}
                            className="w-full py-2.5 px-3 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>{ctaLabel}</span>
                          </a>
                        ) : (
                          <div className="grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => {
                                if (onAddToCart) {
                                  onAddToCart(item, e);
                                }
                              }}
                              className="py-2.5 px-2 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer whitespace-nowrap shadow-xs"
                            >
                              <Plus className="w-3.5 h-3.5 text-emerald-600" />
                              <span>+ Keranjang</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                trackInitiateCheckout({ name: item.name, price: Number(item.price), id: item.id });
                                onInitiateCheckout({
                                  id: String(item.id),
                                  title: item.name,
                                  price: Number(item.price),
                                  download_url: item.download_url,
                                  link_digital: (item as any).link_digital,
                                  type: item.type,
                                  category: item.category,
                                  fulfillment_metadata: (item as any).fulfillment_metadata,
                                });
                              }}
                              className="py-2.5 px-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition shadow-sm active:scale-95 cursor-pointer whitespace-nowrap"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span>Pesan Langsung</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Compact horizontal cards layout for standard microsite theme */
              visibleProducts.map((item) => {
                const hasDedicatedPage =
                  Boolean(item.slug) &&
                  (Boolean(item.single_page_config) ||
                   Boolean((item as any).single_page_enabled) ||
                   Boolean((item as any).single_page));
                const dedicatedPageUrl = hasDedicatedPage && item.slug
                  ? `/${tenantSlug}/p/${item.slug}`
                  : null;

                const rawExternal = !hasDedicatedPage
                  ? (item.external_url ||
                     (item as any).affiliate_url ||
                     (item.metadata && (item.metadata.external_url || item.metadata.affiliate_url)) ||
                     resolveProductExternalUrl(item))
                  : null;
                const externalUrl = rawExternal ? String(rawExternal).trim() : null;
                const isExternal = Boolean(externalUrl);
                const ctaLabel = item.cta_label || resolveProductCtaLabel(item, isExternal);

                const handleExternalClick = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  if (!externalUrl) return;

                  if (typeof window !== "undefined" && typeof (window as any).fbq === "function") {
                    try {
                      (window as any).fbq("track", "InitiateCheckout", {
                        content_name: (item as any).title || item.name,
                        content_ids: [String(item.id || (item as any).slug)],
                        content_type: "product",
                        value: Number(item.price) || 0,
                        currency: "IDR"
                      });
                    } catch (_) {}
                  }

                  try {
                    trackInitiateCheckout((item as any).title || item.name, Number(item.price) || 0);
                  } catch (_) {}

                  try {
                    trackContactEvent(`Affiliate Outbound: ${item.name}`);
                  } catch (_) {}

                  try {
                    onOutboundClick?.(externalUrl, ctaLabel);
                  } catch (_) {}

                  window.open(externalUrl, "_blank", "noopener,noreferrer");
                };

                const handleCardClick = (e: React.MouseEvent) => {
                  if (dedicatedPageUrl) {
                    e.stopPropagation();
                    window.location.href = dedicatedPageUrl;
                  } else if (isExternal && externalUrl) {
                    handleExternalClick(e);
                  }
                };

                return (
                  <div
                    key={item.id}
                    onClick={dedicatedPageUrl || isExternal ? handleCardClick : undefined}
                    className={`${themeStyles.productCard} ${
                      dedicatedPageUrl || isExternal ? 'cursor-pointer active:scale-[0.99]' : ''
                    }`}
                  >
                    <MicrositeItemImage src={item.image} alt={item.name} placeholderClass={themeStyles.productImagePlaceholder} />

                    <div className="flex-1 min-w-0 space-y-1">
                      <h4 className={`text-xs sm:text-sm font-semibold truncate ${themeStyles.productTitle}`}>{item.name}</h4>
                      <div className="flex items-baseline gap-1 flex-wrap">
                        {item.originalPrice && item.originalPrice > item.price ? (
                          <span className="line-through opacity-50 text-xs mr-1">
                            Rp {Number(item.originalPrice).toLocaleString('id-ID')}
                          </span>
                        ) : null}
                        <span className={`font-bold text-sm ${themeStyles.productPrice}`}>
                          {Number(item.price) === 0 ? 'GRATIS' : `Rp ${Number(item.price).toLocaleString('id-ID')}`}
                        </span>
                      </div>
                    </div>

                    {dedicatedPageUrl ? (
                      <a
                        href={dedicatedPageUrl}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="rounded-full px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-[11px] font-black transition active:scale-95 shrink-0 flex items-center gap-1.5 cursor-pointer shadow-md"
                      >
                        <span>{ctaLabel}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    ) : isExternal ? (
                      <a
                        href={externalUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleExternalClick}
                        className="rounded-full px-4 py-2 bg-purple-500/80 hover:bg-purple-600 backdrop-blur-md border border-purple-300 text-white text-[11px] font-bold transition active:scale-95 shrink-0 flex items-center gap-1.5 cursor-pointer shadow-md"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>{ctaLabel}</span>
                      </a>
                    ) : !isDigitalCatalog && onAddToCart ? (
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => {
                            onAddToCart(item, e);
                          }}
                          title="Tambah ke Keranjang"
                          className="bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 text-[inherit] text-[10px] font-bold px-2 py-1.5 rounded-lg flex items-center gap-1 transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                        >
                          <Plus className="w-3 h-3" />
                          <span>+ Keranjang</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            trackInitiateCheckout({ name: item.name, price: Number(item.price), id: item.id });
                            onInitiateCheckout({
                              id: String(item.id),
                              title: item.name,
                              price: Number(item.price),
                              download_url: item.download_url,
                              link_digital: (item as any).link_digital,
                              type: item.type,
                              category: item.category,
                              fulfillment_metadata: (item as any).fulfillment_metadata,
                            });
                          }}
                          className={`shrink-0 flex items-center gap-1.5 cursor-pointer transition active:scale-95 ${themeStyles.productBadge}`}
                        >
                          <QrCode className="w-3 h-3" />
                          <span>{Number(item.price) === 0 ? 'Klaim' : 'Pesan'}</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          trackInitiateCheckout({ name: item.name, price: Number(item.price), id: item.id });
                          onInitiateCheckout({
                            id: String(item.id),
                            title: item.name,
                            price: Number(item.price),
                            download_url: item.download_url,
                            link_digital: (item as any).link_digital,
                            type: item.type,
                            category: item.category,
                            fulfillment_metadata: (item as any).fulfillment_metadata,
                          });
                        }}
                        className={`shrink-0 flex items-center gap-1.5 cursor-pointer transition active:scale-95 ${themeStyles.productBadge}`}
                      >
                        {isDigitalCatalog ? <Download className="w-3 h-3" /> : <QrCode className="w-3 h-3" />}
                        <span>{Number(item.price) === 0 ? 'Klaim' : isDigitalCatalog ? 'Akses' : 'Pesan'}</span>
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="mt-10 pb-8 text-center">
          <p className={`text-[11px] ${themeStyles.footerText}`}>
            &copy; {new Date().getFullYear()} {activeName} &bull; Powered by{' '}
            <span className="font-bold">BoonTrack Official Platform</span>
          </p>
        </div>
      </div>

      {/* Floating Webchat jika diaktifkan */}
      {chatEnabled && (
        <FloatingWebchat
          tenantSlug={tenantSlug}
          storeName={storeName}
          displayName={displayName}
          category={tenant?.category || tenantMetadata?.category || tenantMetadata?.business_category || tenantMetadata?.vertical}
          dynamicQuickReplies={dynamicQuickReplies}
          onInitiateCheckout={onInitiateCheckout}
        />
      )}
    </div>
  );
}
