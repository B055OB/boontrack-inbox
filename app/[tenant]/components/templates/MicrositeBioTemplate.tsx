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
        <Utensils className="w-5 h-5 text-slate-400" />
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
  onInitiateCheckout: (product: { id: string; title: string; price: number }) => void;
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
  const showProducts = Boolean(
    tenantMetadata?.microsite_show_products ??
    tenantMetadata?.microsite?.show_products ??
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

              if (iconType === 'whatsapp') {
                iconElement = '💬';
                iconBg = 'bg-emerald-50 text-emerald-600';
              } else if (iconType === 'instagram') {
                iconElement = '📸';
                iconBg = 'bg-pink-50 text-pink-600';
              } else if (iconType === 'tiktok') {
                iconElement = '🎵';
                iconBg = 'bg-slate-100 text-slate-900';
              } else if (iconType === 'maps') {
                iconElement = '📍';
                iconBg = 'bg-rose-50 text-rose-600';
              } else if (iconType === 'phone') {
                iconElement = '📞';
                iconBg = 'bg-blue-50 text-blue-600';
              }

              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => onOutboundClick(btn.url, `microsite_${btn.id}`)}
                  className="w-full bg-white hover:bg-slate-50/90 border border-slate-200/90 hover:border-indigo-300 rounded-2xl p-3.5 shadow-xs hover:shadow-md transition-all duration-200 flex items-center justify-between text-left cursor-pointer active:scale-[0.98] group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${iconBg} shadow-2xs`}>
                      {iconElement}
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
        {showProducts && visibleProducts.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-xs space-y-3 animate-in fade-in duration-200 mt-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <Utensils className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-black text-slate-900">Menu &amp; Pilihan Populer</h3>
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
                    <p className="text-emerald-700 font-black text-xs">
                      Rp {Number(item.price).toLocaleString('id-ID')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onInitiateCheckout({
                        id: String(item.id),
                        title: item.name,
                        price: Number(item.price),
                      })
                    }
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-xl transition active:scale-95 shrink-0 flex items-center gap-1 cursor-pointer"
                  >
                    <QrCode className="w-3 h-3" />
                    <span>Pesan</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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
