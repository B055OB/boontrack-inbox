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

interface MicrositeBioTemplateProps {
  tenantSlug: string;
  storeName: string;
  displayName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tenantMetadata: any;
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
  tenantMetadata,
  storeProducts,
  dynamicQuickReplies,
  chatEnabled,
  onInitiateCheckout,
  onOutboundClick,
}: MicrositeBioTemplateProps) {
  const activeName = storeName || displayName.toUpperCase();
  const avatarUrl = tenantMetadata?.logo_url || tenantMetadata?.avatar_url || '';
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
    'Official Online Hub & Direct Order. Nikmati kemudahan pemesanan langsung, promo ongkir, dan layanan pelanggan resmi.';

  const whatsappNumber = tenantMetadata?.whatsapp_number || tenantMetadata?.whatsapp || '6281234567890';
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=Halo%20${encodeURIComponent(activeName)},%20saya%20ingin%20pesan%20menu`;

  // Food delivery CTA links (can be customized from metadata or fallback defaults)
  const deliveryLinks = [
    {
      id: 'gofood',
      title: 'Pesan via GoFood',
      subtitle: 'Diskon kilat & pengiriman express',
      badge: 'Promo Diskon',
      badgeColor: 'bg-red-50 text-red-700 border-red-200',
      bgColor: 'hover:bg-red-50/50 hover:border-red-300',
      iconEmoji: '🛵',
      url: tenantMetadata?.links?.gofood || `https://gofood.link/u/${tenantSlug}`,
    },
    {
      id: 'grabfood',
      title: 'Order via GrabFood',
      subtitle: 'Jaminan cepat sampai & promo GrabUnlimited',
      badge: 'Paling Cepat',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      bgColor: 'hover:bg-emerald-50/50 hover:border-emerald-300',
      iconEmoji: '🟢',
      url: tenantMetadata?.links?.grabfood || `https://food.grab.com/id/r/${tenantSlug}`,
    },
    {
      id: 'shopeefood',
      title: 'Order via ShopeeFood',
      subtitle: 'Voucher gratis ongkir & cashback koin',
      badge: 'Gratis Ongkir',
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
      bgColor: 'hover:bg-amber-50/50 hover:border-amber-300',
      iconEmoji: '🛍️',
      url: tenantMetadata?.links?.shopeefood || `https://shopee.co.id/now-food/${tenantSlug}`,
    },
    {
      id: 'whatsapp',
      title: 'Chat WhatsApp CS Langsung',
      subtitle: 'Tanya pesanan katering, reservasi & kendala',
      badge: 'Respon Cepat',
      badgeColor: 'bg-green-50 text-green-700 border-green-200',
      bgColor: 'hover:bg-green-50/50 hover:border-green-300',
      iconEmoji: '💬',
      url: whatsappUrl,
    },
  ];

  const bannerImg =
    tenantMetadata?.banner_url ||
    storeProducts[0]?.image ||
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&auto=format&fit=crop&q=80';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 py-8 px-4 flex flex-col items-center justify-start text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-900 antialiased">
      {/* Container Mobile-First Centered */}
      <div className="w-full max-w-md mx-auto space-y-6 animate-fadeIn">
        {/* Header Profil Brand */}
        <div className="flex flex-col items-center text-center space-y-3 pt-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-3xl overflow-hidden border-2 border-white shadow-lg shadow-slate-300/40 bg-white flex items-center justify-center">
              {avatarUrl && !avatarError ? (
                <img
                  src={avatarUrl}
                  alt={activeName}
                  onError={() => setAvatarError(true)}
                  className="w-full h-full object-cover rounded-2xl"
                />
              ) : (
                <div className="w-full h-full rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white text-2xl font-black shadow-inner">
                  {initials}
                </div>
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-1 border-2 border-white shadow-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1.5">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">{activeName}</h1>
            </div>
            <span className="inline-block text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              Official Bio-Funnel
            </span>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed max-w-xs">{bioText}</p>
        </div>

        {/* Promo Banner Card */}
        {bannerImg && (
          <div className="relative rounded-3xl overflow-hidden border border-slate-200 shadow-md aspect-video bg-slate-900 group">
            <img
              src={bannerImg}
              alt="Promo Banner"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex flex-col justify-end p-4 text-white">
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-500 text-white w-fit mb-1">
                Menu Andalan &amp; Promo
              </span>
              <p className="text-xs font-bold leading-tight line-clamp-1">
                Pesan Langsung Lebih Hemat Tanpa Antre
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons: Food & WhatsApp CTA Links */}
        <div className="space-y-2.5">
          {deliveryLinks.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => onOutboundClick(link.url, `microsite_${link.id}`)}
              className={`w-full bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs transition-all duration-200 flex items-center justify-between text-left cursor-pointer active:scale-98 group ${link.bgColor}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl shrink-0">{link.iconEmoji}</span>
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-black text-slate-900 group-hover:text-emerald-700 transition-colors truncate">
                      {link.title}
                    </h4>
                    {link.badge && (
                      <span
                        className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded border ${link.badgeColor}`}
                      >
                        {link.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">{link.subtitle}</p>
                </div>
              </div>

              <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 shrink-0 ml-2" />
            </button>
          ))}
        </div>

        {/* Micro-Catalog: Menu / Produk Terlaris */}
        {storeProducts.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <Utensils className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-black text-slate-900">Menu &amp; Pilihan Populer</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-semibold">
                {storeProducts.length} Pilihan
              </span>
            </div>

            <div className="space-y-2.5">
              {storeProducts.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-2 rounded-2xl hover:bg-slate-50 transition border border-slate-100"
                >
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-14 h-14 rounded-xl object-cover shrink-0 border border-slate-200"
                  />
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
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-xl transition active:scale-95 shrink-0 flex items-center gap-1"
                  >
                    <QrCode className="w-3 h-3" />
                    <span>Pesan</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-2 pb-6 space-y-1">
          <p className="text-[11px] text-slate-400">
            &copy; {new Date().getFullYear()} {activeName} &bull; Powered by BoonTrack Funnel
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
