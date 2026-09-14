'use client';

import React, { useState, useEffect } from 'react';
import { ArrowUpRight, ShoppingBag, Sparkles, Download, QrCode } from 'lucide-react';
import type { Product } from '@/app/[tenant]/page';
import FloatingWebchat from './FloatingWebchat';
import { sanitizeImageUrl } from '@/lib/image-utils';
import {
  initPixelsFromMetadata,
  trackContactEvent,
  trackInitiateCheckout,
} from '@/lib/tracking';

// ─── Product image with graceful fallback ────────────────────────────────────
function MicrositeItemImage({ src, alt }: { src?: string; alt: string }) {
  const [error, setError] = useState(false);
  const safeSrc = sanitizeImageUrl(src);

  if (!safeSrc || error) {
    return (
      <div className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 shrink-0 flex flex-col items-center justify-center text-white/40">
        <ShoppingBag className="w-5 h-5" />
      </div>
    );
  }

  return (
    <img
      src={safeSrc}
      alt={alt}
      onError={() => setError(true)}
      className="w-14 h-14 rounded-xl object-cover shrink-0 border border-white/20"
    />
  );
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
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MicrositeBioTemplate({
  tenantSlug,
  storeName,
  displayName,
  tenant,
  tenantMetadata,
  storeLogoUrl,
  storeProducts,
  dynamicQuickReplies,
  chatEnabled,
  onInitiateCheckout,
  onOutboundClick,
}: MicrositeBioTemplateProps) {
  const activeName = storeName || displayName.toUpperCase();

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
  const whatsappNumber = tenantMetadata?.whatsapp_number || tenantMetadata?.whatsapp || '';
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=Halo%20${encodeURIComponent(activeName)},%20saya%20tertarik%20dengan%20produk%2Flayanan%20Anda`
    : '';

  // ── Auto-inject Meta & TikTok pixels from tenant.metadata.tracking ─────────
  useEffect(() => {
    const tracking = tenant?.metadata?.tracking || tenantMetadata?.tracking;
    if (tracking && (tracking.facebook_pixel_id || tracking.tiktok_pixel_id)) {
      initPixelsFromMetadata(tracking);
    }
  }, [tenant, tenantMetadata]);

  // ── Product catalog visibility ────────────────────────────────────────────
  // Checks (in order): microsite_settings.show_products → microsite.show_products → microsite_show_products (legacy)
  const showProducts = Boolean(
    tenantMetadata?.microsite_settings?.show_products ??
    tenantMetadata?.microsite?.show_products ??
    tenantMetadata?.microsite_show_products ??
    false
  );

  const featuredIds: string[] = React.useMemo(() => {
    const raw = tenantMetadata?.microsite_featured_product_ids || tenantMetadata?.microsite?.featured_product_ids;
    return Array.isArray(raw) ? raw.map(String) : [];
  }, [tenantMetadata]);

  const productMode =
    tenantMetadata?.microsite_product_mode ||
    tenantMetadata?.microsite?.product_mode ||
    (featuredIds.length > 0 ? 'manual' : 'all');

  const visibleProducts = React.useMemo(() => {
    if (!showProducts || !Array.isArray(storeProducts) || storeProducts.length === 0) return [];
    if (productMode === 'manual' && featuredIds.length > 0) {
      return storeProducts.filter((p) => featuredIds.includes(String(p.id)));
    }
    // Default mode 'all': maks 6 produk
    return storeProducts.slice(0, 6);
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-gradient-to-br from-[#00d2ff] via-[#4338ca] to-[#7c3aed] min-h-screen text-white antialiased">
      {/* Radial overlay for depth */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 15% 10%, rgba(255,255,255,0.07) 0%, transparent 55%), radial-gradient(ellipse at 85% 85%, rgba(124,58,237,0.28) 0%, transparent 55%)',
        }}
      />

      <div className="relative max-w-md mx-auto px-4 py-8 flex flex-col items-center">

        {/* ── Profile Header ── */}
        <div className="flex flex-col items-center text-center space-y-3 pt-2 w-full">
          {/* Avatar */}
          <div className="relative">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden ring-4 ring-white/30 shadow-xl bg-white/10 flex items-center justify-center">
              {displayAvatar && !avatarError ? (
                <img
                  src={displayAvatar}
                  alt={activeName}
                  onError={() => setAvatarError(true)}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <div className="w-full h-full rounded-full bg-white/20 flex items-center justify-center text-white text-3xl font-black">
                  {initials}
                </div>
              )}
            </div>
            {/* Verified badge */}
            <div className="absolute bottom-1 right-1 bg-white rounded-full p-1 shadow-lg">
              <svg viewBox="0 0 20 20" className="w-4 h-4 text-[#4338ca]" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
            </div>
          </div>

          {/* Name & handle */}
          <div className="space-y-0.5">
            <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-sm">{activeName}</h1>
            <p className="text-white/60 text-xs font-mono">@{tenantSlug.toLowerCase()}</p>
          </div>

          {/* Bio */}
          {bioText ? (
            <p className="text-white/80 text-xs sm:text-sm text-center mt-2 leading-relaxed max-w-xs">
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
                    if (isWhatsApp) {
                      trackContactEvent('WhatsApp Bio');
                    }
                    onOutboundClick(btn.url, `microsite_${btn.id}`);
                  }}
                  className="rounded-full py-3.5 px-5 bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 transition-all duration-200 active:scale-[0.98] shadow-lg flex items-center justify-between text-white w-full cursor-pointer"
                >
                  {/* Left: brand icon */}
                  <span className="w-6 h-6 shrink-0 flex items-center justify-center">
                    {getButtonIcon(btn.icon || 'link')}
                  </span>

                  {/* Center: label */}
                  <span className="flex-1 font-medium text-sm sm:text-base text-center px-3">
                    {btn.label || btn.title}
                    {btn.badge && (
                      <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                        {btn.badge}
                      </span>
                    )}
                  </span>

                  {/* Right: arrow */}
                  <ArrowUpRight className="w-4 h-4 text-white/50 shrink-0" />
                </button>
              );
            })
          ) : (
            <div className="rounded-2xl bg-white/10 border border-dashed border-white/20 p-6 text-center text-xs text-white/50">
              Belum ada tautan yang dikonfigurasi.
            </div>
          )}
        </div>

        {/* ── Product Catalog (glass cards, conditional) ── */}
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

            {/* Product cards */}
            {visibleProducts.map((item) => (
              <div
                key={item.id}
                className="bg-white/15 backdrop-blur-md border border-white/20 rounded-2xl p-4 text-white flex items-center gap-3"
              >
                <MicrositeItemImage src={item.image} alt={item.name} />

                <div className="flex-1 min-w-0 space-y-1">
                  <h4 className="text-xs sm:text-sm font-semibold text-white truncate">{item.name}</h4>
                  <div className="flex items-baseline gap-1 flex-wrap">
                    {item.originalPrice && item.originalPrice > item.price ? (
                      <span className="line-through text-white/50 text-xs mr-1">
                        Rp {Number(item.originalPrice).toLocaleString('id-ID')}
                      </span>
                    ) : null}
                    <span className="text-white font-bold text-sm">
                      Rp {Number(item.price).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
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
                  className="rounded-full px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 text-white text-[11px] font-bold transition active:scale-95 shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  {isDigitalCatalog ? <Download className="w-3 h-3" /> : <QrCode className="w-3 h-3" />}
                  <span>{isDigitalCatalog ? 'Akses' : 'Pesan'}</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="mt-10 pb-8 text-center">
          <p className="text-[11px] text-white/40">
            &copy; {new Date().getFullYear()} {activeName} &bull; Powered by{' '}
            <span className="font-bold text-white/60">BoonTrack</span>
          </p>
        </div>
      </div>

      {/* Floating Webchat jika diaktifkan */}
      {chatEnabled && (
        <FloatingWebchat
          tenantSlug={tenantSlug}
          storeName={storeName}
          displayName={displayName}
          dynamicQuickReplies={dynamicQuickReplies}
          onInitiateCheckout={onInitiateCheckout}
        />
      )}
    </div>
  );
}
