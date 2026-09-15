'use client';

import React from 'react';
import {
  Smartphone,
  ExternalLink,
  MessageCircle,
  Video,
  MapPin,
  Phone,
  Link as LinkIcon,
  ShoppingBag,
  Package,
  Utensils,
  Sparkles,
} from 'lucide-react';
import { VisualThemeType } from '../settings/StorefrontThemeCard';
import { ProductItem } from '@/lib/product-catalog';

export interface PreviewButton {
  id: string;
  label: string;
  url: string;
  icon?: 'whatsapp' | 'instagram' | 'tiktok' | 'maps' | 'link' | 'phone' | string;
  is_active?: boolean;
}

interface LivePhonePreviewProps {
  tenantSlug: string;
  displayName: string;
  storeBio?: string;
  storeLogoUrl?: string | null;
  visualTheme?: VisualThemeType;
  buttons?: PreviewButton[];
  showProducts?: boolean;
  products?: ProductItem[];
}

function InstagramIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
    </svg>
  );
}

function getButtonIcon(iconName?: string) {
  switch (iconName) {
    case 'whatsapp':
      return MessageCircle;
    case 'instagram':
      return InstagramIcon;
    case 'tiktok':
      return Video;
    case 'maps':
      return MapPin;
    case 'phone':
      return Phone;
    case 'link':
    default:
      return LinkIcon;
  }
}

export default function LivePhonePreview({
  tenantSlug,
  displayName,
  storeBio,
  storeLogoUrl,
  visualTheme = 'clean_minimal',
  buttons = [],
  showProducts = false,
  products = [],
}: LivePhonePreviewProps) {
  const activeButtons = buttons.filter((b) => b.is_active !== false);
  const previewProducts = (products || []).slice(0, 3);

  // Theme-specific styling classes
  const getThemeStyles = () => {
    switch (visualTheme) {
      case 'aurora_gradient':
        return {
          screenBg: 'bg-gradient-to-br from-cyan-600 via-blue-600 to-indigo-950 text-white',
          avatarRing: 'ring-2 ring-white/70 shadow-lg shadow-indigo-950/40',
          avatarBg: 'bg-gradient-to-tr from-cyan-400 to-blue-600 text-white',
          titleColor: 'text-white font-black drop-shadow-xs',
          slugBadge: 'bg-white/20 text-cyan-100 border border-white/20 backdrop-blur-xs',
          bioColor: 'text-cyan-50/90',
          buttonStyle:
            'bg-white/15 hover:bg-white/25 text-white border border-white/25 backdrop-blur-md shadow-lg shadow-indigo-950/20',
          buttonIconBg: 'bg-white/20 text-white border border-white/20',
          buttonExtIcon: 'text-cyan-200',
          productBox: 'bg-white/15 border border-white/25 backdrop-blur-md text-white',
          productSubtext: 'text-cyan-200 font-extrabold',
          productBadge: 'bg-cyan-400 text-slate-950 font-black',
          footerText: 'text-cyan-200/80',
        };
      case 'midnight_luxe':
        return {
          screenBg: 'bg-slate-950 text-amber-100',
          avatarRing: 'ring-2 ring-amber-400/80 shadow-lg shadow-amber-950/50',
          avatarBg: 'bg-slate-900 text-amber-400 border border-amber-500/40',
          titleColor: 'text-amber-200 font-black tracking-wide',
          slugBadge: 'bg-slate-900 border border-amber-500/30 text-amber-300',
          bioColor: 'text-slate-400',
          buttonStyle:
            'bg-slate-900/90 hover:bg-slate-900 text-amber-200 border border-amber-500/40 shadow-md shadow-amber-950/40',
          buttonIconBg: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
          buttonExtIcon: 'text-amber-400/80',
          productBox: 'bg-slate-900/90 border border-amber-500/30 text-amber-100',
          productSubtext: 'text-amber-300 font-extrabold',
          productBadge: 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-black',
          footerText: 'text-amber-400/60',
        };
      case 'warm_terra':
        return {
          screenBg: 'bg-gradient-to-b from-[#FFF7ED] via-[#FED7AA]/30 to-[#FFEDD5] text-stone-900',
          avatarRing: 'ring-2 ring-orange-500/60 shadow-md shadow-orange-900/10',
          avatarBg: 'bg-[#431407] text-[#FFEDD5]',
          titleColor: 'text-stone-900 font-black',
          slugBadge: 'bg-orange-100 text-orange-800 border border-orange-200',
          bioColor: 'text-stone-600',
          buttonStyle:
            'bg-[#431407] hover:bg-[#7C2D12] text-[#FFEDD5] border border-orange-950/20 shadow-xs',
          buttonIconBg: 'bg-white/10 text-orange-200 border border-white/10',
          buttonExtIcon: 'text-orange-300',
          productBox: 'bg-white/80 border border-orange-200 text-stone-900 shadow-2xs',
          productSubtext: 'text-orange-700 font-extrabold',
          productBadge: 'bg-[#EA580C] text-white font-bold',
          footerText: 'text-stone-500',
        };
      case 'bold_performance':
        return {
          screenBg: 'bg-slate-100 text-slate-950 font-sans',
          avatarRing: 'ring-2 ring-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]',
          avatarBg: 'bg-emerald-400 text-black border-2 border-black font-black',
          titleColor: 'text-black font-black uppercase tracking-tight',
          slugBadge: 'bg-yellow-300 text-black font-black border border-black',
          bioColor: 'text-slate-700 font-semibold',
          buttonStyle:
            'bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]',
          buttonIconBg: 'bg-black text-emerald-400',
          buttonExtIcon: 'text-black',
          productBox: 'bg-white border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-slate-950',
          productSubtext: 'text-emerald-700 font-black',
          productBadge: 'bg-black text-emerald-400 font-black',
          footerText: 'text-slate-700 font-bold',
        };
      case 'clean_minimal':
      default:
        return {
          screenBg: 'bg-slate-50 text-slate-900',
          avatarRing: 'ring-2 ring-white shadow-md',
          avatarBg: 'bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white',
          titleColor: 'text-slate-900 font-black',
          slugBadge: 'bg-slate-200/80 text-slate-600 font-mono',
          bioColor: 'text-slate-500',
          buttonStyle:
            'bg-white hover:bg-slate-100 text-slate-800 border border-slate-200/90 shadow-2xs',
          buttonIconBg: 'bg-slate-50 border border-slate-100 text-slate-700',
          buttonExtIcon: 'text-slate-400',
          productBox: 'bg-white rounded-2xl border border-slate-200 text-left shadow-2xs',
          productSubtext: 'text-emerald-600 font-black',
          productBadge: 'bg-emerald-600 text-white font-bold',
          footerText: 'text-slate-400',
        };
    }
  };

  const themeStyles = getThemeStyles();

  return (
    <div className="w-full max-w-[340px] mx-auto space-y-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <Smartphone className="w-4 h-4 text-slate-500" />
          <span>Live Phone Preview</span>
        </span>
        <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Real-Time</span>
        </span>
      </div>

      {/* Outer Smartphone Shell */}
      <div className="bg-slate-900 p-2.5 rounded-[44px] shadow-2xl border-4 border-slate-800 transition-all duration-300">
        {/* Inner Screen */}
        <div
          className={`w-full rounded-[36px] overflow-hidden min-h-[550px] max-h-[640px] flex flex-col items-center p-4 transition-colors duration-300 relative overflow-y-auto no-scrollbar ${themeStyles.screenBg}`}
        >
          {/* Dynamic Island / Notch */}
          <div className="w-24 h-4 bg-slate-900/90 backdrop-blur-md rounded-full mb-4 shrink-0 shadow-inner" />

          {/* Profile Header */}
          <div className="flex flex-col items-center text-center space-y-1 w-full shrink-0">
            {/* Avatar / Logo */}
            {storeLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={storeLogoUrl}
                alt={displayName}
                className={`w-16 h-16 rounded-full object-cover mb-1.5 ${themeStyles.avatarRing}`}
              />
            ) : (
              <div
                className={`w-16 h-16 rounded-full font-black text-xl flex items-center justify-center mb-1.5 uppercase ${themeStyles.avatarBg} ${themeStyles.avatarRing}`}
              >
                {(displayName || tenantSlug || 'B').charAt(0)}
              </div>
            )}

            <h4 className={`text-sm tracking-tight capitalize ${themeStyles.titleColor}`}>
              {displayName || tenantSlug}
            </h4>

            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${themeStyles.slugBadge}`}>
              @{tenantSlug.toLowerCase()}
            </span>

            <p className={`text-[11px] text-center line-clamp-2 max-w-[240px] mt-1 ${themeStyles.bioColor}`}>
              {storeBio || 'Pemesanan online praktis & layanan resmi terverifikasi.'}
            </p>
          </div>

          {/* Buttons List */}
          <div className="w-full space-y-2 mt-5">
            {activeButtons.length === 0 ? (
              <div className="py-4 text-center text-xs opacity-60 italic">
                Belum ada tombol tautan aktif
              </div>
            ) : (
              activeButtons.map((btn) => {
                const IconComp = getButtonIcon(btn.icon);
                return (
                  <div
                    key={btn.id}
                    className={`w-full p-2.5 rounded-xl flex items-center justify-between gap-2 transition-all cursor-pointer ${themeStyles.buttonStyle}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`p-1 rounded-lg shrink-0 ${themeStyles.buttonIconBg}`}>
                        <IconComp className="w-3.5 h-3.5" />
                      </span>
                      <span className="text-xs font-bold truncate">
                        {btn.label || 'Tautan Toko'}
                      </span>
                    </div>
                    <ExternalLink className={`w-3 h-3 shrink-0 ${themeStyles.buttonExtIcon}`} />
                  </div>
                );
              })
            )}
          </div>

          {/* Product Showcase Section */}
          {showProducts && previewProducts.length > 0 && (
            <div className={`w-full p-3 rounded-2xl space-y-2 mt-4 text-left ${themeStyles.productBox}`}>
              <div className="flex items-center justify-between pb-1.5 border-b border-black/10">
                <div className="flex items-center gap-1.5">
                  <Utensils className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-black">Menu &amp; Pilihan Populer</span>
                </div>
                <span className="text-[9px] font-bold opacity-75">{products.length} Item</span>
              </div>

              <div className="space-y-1.5">
                {previewProducts.map((prod) => {
                  const pImg = prod.image || (prod as any).image_url;
                  return (
                    <div
                      key={prod.id}
                      className="flex items-center gap-2 p-1.5 rounded-xl border border-black/10 bg-black/5"
                    >
                      {pImg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={pImg}
                          alt={prod.name}
                          className="w-8 h-8 rounded-lg object-cover border border-black/10 shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-black/10 flex items-center justify-center shrink-0">
                          <Package className="w-3.5 h-3.5 opacity-60" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h5 className="text-[11px] font-bold truncate">{prod.name}</h5>
                        <p className={`text-[10px] ${themeStyles.productSubtext}`}>
                          Rp {Number(prod.price).toLocaleString('id-ID')}
                        </p>
                      </div>
                      <span className={`text-[9px] px-2 py-0.5 rounded-md shrink-0 ${themeStyles.productBadge}`}>
                        Pesan
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Powered by BoonTrack Badge */}
          <div className="w-full mt-auto pt-4 border-t border-black/10 text-center">
            <span className={`text-[9px] font-bold tracking-tight ${themeStyles.footerText}`}>
              ⚡ Powered by BoonTrack Official Platform
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
