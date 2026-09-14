'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  ShoppingBag,
  ExternalLink,
  MessageCircle,
  Utensils,
  Share2,
  CheckCircle2,
  ShieldCheck,
  QrCode,
  ArrowRight,
  Download,
} from 'lucide-react';
import type { Product } from '@/app/[tenant]/page';
import FloatingWebchat from './FloatingWebchat';
import { sanitizeImageUrl } from '@/lib/image-utils';

function MicrositeItemImage({ src, alt }: { src?: string; alt: string }) {
  const [error, setError] = useState(false);
  const safeSrc = sanitizeImageUrl(src);

  if (!safeSrc || error) {
    return (
      <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 shrink-0 flex flex-col items-center justify-center text-slate-400">
        <ShoppingBag className="w-5 h-5 text-slate-400" />
      </div>
    );
  }

  return (
    <img
      src={safeSrc}
      alt={alt}
      onError={() => setError(true)}
      className="w-14 h-14 rounded-xl object-cover shrink-0 border border-slate-200"
    />
  );
}

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
    fulfillment_metadata?: any;
  }) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onOutboundClick: (url: string, label: string) => void;
}

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

  const bioText =
    tenantMetadata?.bio ||
    tenantMetadata?.description ||
    '';

  const whatsappNumber = tenantMetadata?.whatsapp_number || tenantMetadata?.whatsapp || '';
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=Halo%20${encodeURIComponent(activeName)},%20saya%20tertarik%20dengan%20produk%2Flayanan%20Anda`
    : '';

  // Product Catalog visibility & featured product filtering
  // Checks (in order): microsite_settings.show_products → microsite.show_products → microsite_show_products (legacy flat key)
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
    if (!showProducts || !Array.isArray(storeProducts) || storeProducts.length === 0) {
      return [];
    }

    if (productMode === 'manual' && featuredIds.length > 0) {
      return storeProducts.filter((p) => featuredIds.includes(String(p.id)));
    }

    // Default mode 'all': maksimal 6 produk
    return storeProducts.slice(0, 6);
  }, [showProducts, storeProducts, productMode, featuredIds]);

  // Dynamic buttons resolved strictly from metadata without hardcoded fallback links
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
      btns.push({
        id: 'whatsapp',
        label: 'Chat WhatsApp CS',
        url: whatsappUrl,
        icon: 'whatsapp',
        subtitle: 'Hubungi admin langsung untuk konsultasi & pemesanan',
        badge: 'Respon Cepat',
      });
    }

    if (tenantMetadata?.links?.gofood) {
      btns.push({
        id: 'gofood',
        label: 'Pesan via GoFood',
        url: tenantMetadata.links.gofood,
        icon: 'link',
        subtitle: 'Order langsung melalui GoFood',
      });
    }

    if (tenantMetadata?.links?.grabfood) {
      btns.push({
        id: 'grabfood',
        label: 'Order via GrabFood',
        url: tenantMetadata.links.grabfood,
        icon: 'link',
        subtitle: 'Order langsung melalui GrabFood',
      });
    }

    if (tenantMetadata?.links?.shopeefood) {
      btns.push({
        id: 'shopeefood',
        label: 'Order via ShopeeFood',
        url: tenantMetadata.links.shopeefood,
        icon: 'link',
        subtitle: 'Order langsung melalui ShopeeFood',
      });
    }

    if (tenantMetadata?.links?.instagram) {
      btns.push({
        id: 'instagram',
        label: 'Instagram Resmi',
        url: tenantMetadata.links.instagram,
        icon: 'instagram',
        subtitle: 'Ikuti update & promo terbaru',
      });
    }

    if (tenantMetadata?.links?.tiktok) {
      btns.push({
        id: 'tiktok',
        label: 'TikTok Resmi',
        url: tenantMetadata.links.tiktok,
        icon: 'tiktok',
        subtitle: 'Video konten & ulasan produk',
      });
    }

    return btns;
  }, [tenantMetadata, whatsappUrl]);

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 flex flex-col items-center justify-start text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 antialiased">
      {/* Container Mobile-First Centered (Ala Linktree) */}
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* Header Profil Brand */}
        <div className="flex flex-col items-center text-center space-y-3 pt-2">
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white shadow-md bg-white flex items-center justify-center ring-4 ring-slate-200/80">
              {displayAvatar && !avatarError ? (
                <img
                  src={displayAvatar}
                  alt={activeName}
                  onError={() => setAvatarError(true)}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <div className="w-full h-full rounded-full bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white text-2xl font-black shadow-inner">
                  {initials}
                </div>
              )}
            </div>
            <div className="absolute bottom-0 right-0 bg-blue-600 text-white rounded-full p-1 border-2 border-white shadow-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="space-y-0.5">
            <h1 className="text-lg font-black text-slate-900 tracking-tight">{activeName}</h1>
            <p className="text-xs font-bold text-slate-500 font-mono tracking-tight">
              @{tenantSlug.toLowerCase()}
            </p>
          </div>

          {bioText ? (
            <p className="text-xs text-slate-600 leading-relaxed max-w-sm px-2">
              {bioText}
            </p>
          ) : null}
        </div>

        {/* Action Buttons: Dynamic Microsite Buttons & CTA Links */}
        <div className="space-y-3 pt-2">
          {dynamicButtons.length > 0 ? (
            dynamicButtons.map((btn: any) => {
              const iconType = btn.icon || 'link';
              let iconElement = '🔗';
              let iconBg = 'bg-slate-100 text-slate-700';

              let iconNode: React.ReactNode = (
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
              );

              if (iconType === 'whatsapp') {
                iconBg = 'bg-[#e7fbed]';
                iconNode = (
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366"/>
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.659 1.438 5.168L2 22l4.985-1.424A9.954 9.954 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" stroke="#25D366" strokeWidth="1.5" fill="none"/>
                  </svg>
                );
                iconBg = 'bg-[#e7fbed]';
              } else if (iconType === 'instagram') {
                iconBg = 'bg-pink-50';
                iconNode = (
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                    <defs>
                      <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#f09433"/>
                        <stop offset="25%" stopColor="#e6683c"/>
                        <stop offset="50%" stopColor="#dc2743"/>
                        <stop offset="75%" stopColor="#cc2366"/>
                        <stop offset="100%" stopColor="#bc1888"/>
                      </linearGradient>
                    </defs>
                    <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#ig-grad)"/>
                    <circle cx="12" cy="12" r="4" stroke="white" strokeWidth="1.8" fill="none"/>
                    <circle cx="17.5" cy="6.5" r="1.2" fill="white"/>
                  </svg>
                );
              } else if (iconType === 'tiktok') {
                iconBg = 'bg-slate-100';
                iconNode = (
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.22 6.22 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.95a8.16 8.16 0 004.77 1.52V7.04a4.85 4.85 0 01-1-.35z" fill="#010101"/>
                  </svg>
                );
              } else if (iconType === 'maps') {
                iconBg = 'bg-rose-50';
                iconNode = (
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#EA4335"/>
                  </svg>
                );
              } else if (iconType === 'phone') {
                iconBg = 'bg-blue-50';
                iconNode = (
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="#2563eb"/>
                  </svg>
                );
              } else {
                iconBg = 'bg-slate-100';
              }
              // keep iconElement for legacy compat (no-op after refactor)
              void iconElement;

              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => onOutboundClick(btn.url, `microsite_${btn.id}`)}
                  className="w-full bg-white hover:bg-slate-50/90 border border-slate-200/90 hover:border-indigo-300 rounded-2xl p-3.5 shadow-xs hover:shadow-md transition-all duration-200 flex items-center justify-between text-left cursor-pointer active:scale-[0.98] group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg} shadow-2xs`}>
                      {iconNode}
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                          {btn.label || btn.title}
                        </h4>
                        {btn.badge && (
                          <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                            {btn.badge}
                          </span>
                        )}
                      </div>
                      {btn.subtitle && (
                        <p className="text-[10px] text-slate-400 truncate">{btn.subtitle}</p>
                      )}
                    </div>
                  </div>

                  <div className="w-8 h-8 rounded-full bg-slate-50 group-hover:bg-indigo-50 flex items-center justify-center shrink-0 ml-2 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>
              );
            })
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
              Belum ada tautan yang dikonfigurasi.
            </div>
          )}
        </div>

        {/* Micro-Catalog: Menu / Produk Terlaris (hanya tampil jika showProducts aktif dan ada produk) */}
        {showProducts && visibleProducts.length > 0 && (() => {
          const isDigitalCatalog = ['DIGITAL', 'COURSE', 'SOFTWARE', 'CREATOR', 'AGENCY'].some(k =>
            (tenantMetadata?.category || tenantMetadata?.vertical_type || '').toUpperCase().includes(k)
          );

          return (
            <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-xs space-y-3 animate-in fade-in duration-200 mt-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-1.5">
                  {isDigitalCatalog ? (
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <ShoppingBag className="w-4 h-4 text-emerald-600" />
                  )}
                  <h3 className="text-xs font-black text-slate-900">
                    {isDigitalCatalog ? 'Katalog Modul & Produk Pilihan' : 'Menu & Pilihan Populer'}
                  </h3>
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">
                  {visibleProducts.length} Pilihan
                </span>
              </div>

              <div className="space-y-2.5">
                {visibleProducts.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-2 rounded-2xl hover:bg-slate-50 transition border border-slate-100"
                  >
                    <MicrositeItemImage src={item.image} alt={item.name} />
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <h4 className="text-xs font-bold text-slate-900 truncate">{item.name}</h4>
                      <div className="flex items-baseline gap-1 flex-wrap">
                        {item.originalPrice && item.originalPrice > item.price ? (
                          <span className="line-through text-xs text-slate-400 mr-1.5">
                            Rp {Number(item.originalPrice).toLocaleString('id-ID')}
                          </span>
                        ) : null}
                        <p className="text-emerald-700 font-black text-xs">
                          Rp {Number(item.price).toLocaleString('id-ID')}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onInitiateCheckout({
                          id: String(item.id),
                          title: item.name,
                          price: Number(item.price),
                          download_url: item.download_url,
                          link_digital: (item as any).link_digital,
                          type: item.type,
                          category: item.category,
                          fulfillment_metadata: (item as any).fulfillment_metadata,
                        })
                      }
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-xl transition active:scale-95 shrink-0 flex items-center gap-1 cursor-pointer"
                    >
                      {isDigitalCatalog ? <Download className="w-3 h-3" /> : <QrCode className="w-3 h-3" />}
                      <span>{isDigitalCatalog ? 'Akses' : 'Pesan'}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Footer Minimalis */}
        <div className="text-center pt-4 pb-8 space-y-1">
          <p className="text-[11px] text-slate-400">
            &copy; {new Date().getFullYear()} {activeName} &bull; Powered by BoonTrack
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
