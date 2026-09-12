'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  Award,
  BookOpen,
  Users,
  User,
  Calendar,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Star,
  Quote,
  Clock,
  HeartHandshake,
  QrCode,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import type { Product } from '@/app/[tenant]/page';
import FloatingWebchat from './FloatingWebchat';
import { sanitizeImageUrl } from '@/lib/image-utils';

interface PersonalAuthorityTemplateProps {
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
  onOpenConsultation?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onOutboundClick: (url: string, label: string) => void;
}

export default function PersonalAuthorityTemplate({
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
  onOpenConsultation,
  onOutboundClick,
}: PersonalAuthorityTemplateProps) {
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
  const [productImgError, setProductImgError] = useState(false);

  const initials =
    (activeName || 'Store')
      .split(' ')
      .map((w: string) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'BT';

  const headline =
    tenantMetadata?.headline ||
    tenantMetadata?.tagline ||
    tenantMetadata?.bio ||
    `${activeName} Official Store`;

  const subheadline =
    tenantMetadata?.subheadline ||
    tenantMetadata?.description ||
    '';

  const storeDescription =
    tenantMetadata?.bio ||
    tenantMetadata?.description ||
    tenantMetadata?.category ||
    '';

  const mainProduct = storeProducts && storeProducts.length > 0 ? storeProducts[0] : null;

  const handleCtaPrimary = () => {
    if (mainProduct) {
      onInitiateCheckout({
        id: String(mainProduct.id),
        title: mainProduct.name,
        price: Number(mainProduct.price),
      });
    } else if (whatsappConsultationUrl) {
      onOutboundClick(whatsappConsultationUrl, 'whatsapp_hero_consult');
    }
  };

  const whatsappNumber = tenantMetadata?.whatsapp_number || tenantMetadata?.whatsapp || '';
  const whatsappConsultationUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=Halo%20${encodeURIComponent(activeName)},%20saya%20ingin%20tanya%20informasi%20layanan`
    : '';

  const dynamicPillars: Array<{ icon?: any; title: string; description: string }> =
    Array.isArray(tenantMetadata?.pillars) && tenantMetadata.pillars.length > 0
      ? tenantMetadata.pillars
      : (Array.isArray(tenantMetadata?.highlights) && tenantMetadata.highlights.length > 0 ? tenantMetadata.highlights : []);

  const dynamicTestimonials: Array<{ name: string; role?: string; rating?: number; text: string }> =
    Array.isArray(tenantMetadata?.testimonials) && tenantMetadata.testimonials.length > 0
      ? tenantMetadata.testimonials
      : (Array.isArray(tenantMetadata?.single_page_config?.testimonials) && tenantMetadata.single_page_config.testimonials.length > 0
        ? tenantMetadata.single_page_config.testimonials
        : []);

  const stats: Array<{ value: string; label: string }> | null =
    Array.isArray(tenantMetadata?.stats) && tenantMetadata.stats.length > 0
      ? tenantMetadata.stats
      : null;

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-slate-900 font-sans selection:bg-purple-100 selection:text-purple-900 flex flex-col antialiased">
      {/* Top Notice Bar */}
      <div className="bg-slate-900 text-white text-[11px] font-medium py-2 px-4 text-center border-b border-slate-800 flex items-center justify-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
        <span>Kanal Resmi {activeName} &bull; Layanan &amp; Pemesanan Terverifikasi</span>
      </div>

      {/* Modern Clean Navbar */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/70 sticky top-0 z-30 transition">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl overflow-hidden border border-purple-200/80 shadow-xs bg-purple-50 shrink-0 flex items-center justify-center">
              {displayAvatar && !avatarError ? (
                <img
                  src={displayAvatar}
                  alt={activeName}
                  onError={() => setAvatarError(true)}
                  className="w-full h-full object-cover rounded-2xl"
                />
              ) : (
                <div className="w-full h-full rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white text-xs font-black shadow-inner">
                  {initials}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-slate-900 text-base tracking-tight">{activeName}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </div>
              {storeDescription ? (
                <p className="text-[10px] text-slate-400 font-medium truncate max-w-[200px] sm:max-w-xs">
                  {storeDescription}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {tenantMetadata?.consultation_label && whatsappConsultationUrl ? (
              <button
                type="button"
                onClick={() => onOutboundClick(whatsappConsultationUrl, 'whatsapp_nav_cta')}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-xs shadow-purple-600/20 active:scale-95 flex items-center gap-1.5"
              >
                <span>{tenantMetadata.consultation_label}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {/* HERO SECTION: Clean UX with generous whitespace & bold typography */}
      <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24 px-4 sm:px-6 bg-gradient-to-b from-white via-purple-50/20 to-transparent">
        <div className="max-w-5xl mx-auto text-center space-y-6">
          {/* Authority Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-100 text-purple-800 text-xs font-black border border-purple-200 shadow-2xs">
            <Award className="w-4 h-4 text-purple-600" />
            <span>Kanal Resmi &bull; {tenantMetadata?.category || 'Verified Store'}</span>
          </div>

          {/* Headline */}
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-slate-900 tracking-tight leading-[1.15] max-w-4xl mx-auto">
            {headline}
          </h1>

          {/* Subheadline */}
          {subheadline ? (
            <p className="text-sm sm:text-base md:text-lg text-slate-600 font-normal leading-relaxed max-w-2xl mx-auto">
              {subheadline}
            </p>
          ) : null}

          {/* Profile Avatar Showcase */}
          <div className="py-2 flex flex-col items-center justify-center">
            <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-3xl overflow-hidden p-1 bg-gradient-to-tr from-purple-600 via-indigo-500 to-amber-400 shadow-xl shadow-purple-600/20 flex items-center justify-center">
              {displayAvatar && !avatarError ? (
                <img
                  src={displayAvatar}
                  alt={activeName}
                  onError={() => setAvatarError(true)}
                  className="w-full h-full object-cover rounded-2xl bg-white"
                />
              ) : (
                <div className="w-full h-full rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white shadow-inner">
                  <span className="text-3xl sm:text-4xl font-black tracking-tight">{initials}</span>
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">{activeName}</span>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-600" /> Verified Store
              </span>
            </div>
          </div>

          {/* Main CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            {mainProduct && (
              <button
                type="button"
                onClick={handleCtaPrimary}
                className="w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-sm rounded-2xl shadow-lg shadow-purple-600/25 transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Pesan {mainProduct.name}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {whatsappConsultationUrl && (
              <button
                type="button"
                onClick={() => onOutboundClick(whatsappConsultationUrl, 'whatsapp_hero_consult')}
                className="w-full sm:w-auto px-6 py-3.5 bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm rounded-2xl border border-slate-200 shadow-xs transition cursor-pointer flex items-center justify-center gap-2 active:scale-95"
              >
                <HeartHandshake className="w-4 h-4 text-purple-600" />
                <span>Tanya via WhatsApp</span>
              </button>
            )}
          </div>

          {/* Social Proof Stats */}
          {stats && stats.length > 0 && (
            <div className={`pt-6 grid grid-cols-${Math.min(stats.length, 3)} gap-2 sm:gap-6 max-w-lg mx-auto text-center border-t border-slate-200/80`}>
              {stats.map((item, idx) => (
                <div key={idx}>
                  <p className="text-xl sm:text-2xl font-black text-slate-900">{item.value}</p>
                  <p className="text-[11px] text-slate-500 font-medium">{item.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* VALUE & CREDIBILITY CARDS: 3 PILAR SOLUSI */}
      {dynamicPillars.length > 0 && (
        <section className="py-16 px-4 sm:px-6 bg-white border-y border-slate-100">
          <div className="max-w-5xl mx-auto space-y-10">
            <div className="text-center space-y-2">
              <span className="text-xs font-black text-purple-600 tracking-wider uppercase">
                Keunggulan &bull; Terpercaya &bull; Profesional
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Pilar Layanan {activeName}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {dynamicPillars.map((pillar, idx) => {
                const Icon = pillar.icon || Sparkles;
                return (
                  <div
                    key={idx}
                    className="bg-slate-50/70 hover:bg-purple-50/30 rounded-3xl p-6 sm:p-7 border border-slate-200/80 hover:border-purple-200 transition-all duration-300 shadow-2xs hover:shadow-md flex flex-col justify-between"
                  >
                    <div className="space-y-4">
                      <div className="w-12 h-12 rounded-2xl bg-white text-purple-600 border border-purple-100 flex items-center justify-center shadow-xs">
                        <Icon className="w-6 h-6" />
                      </div>
                      <h3 className="text-base font-black text-slate-900 tracking-tight">
                        {pillar.title}
                      </h3>
                      <p className="text-xs text-slate-500 leading-relaxed font-normal">
                        {pillar.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* SHOWCASE LAYANAN & PRODUK UNGGULAN */}
      {mainProduct && (
        <section className="py-16 px-4 sm:px-6 bg-slate-50/50">
          <div className="max-w-5xl mx-auto space-y-10">
            <div className="text-center space-y-2">
              <span className="text-xs font-black text-purple-600 tracking-wider uppercase">
                Produk / Layanan Unggulan
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Pilihan Terbaik dari {activeName}
              </h2>
            </div>

            {/* Featured Product Card */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-md p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-5 space-y-4">
                <div className="relative aspect-video sm:aspect-square rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
                  {!productImgError && mainProduct.image ? (
                    <img
                      src={sanitizeImageUrl(mainProduct.image)}
                      alt={mainProduct.name}
                      onError={() => setProductImgError(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-purple-50 to-indigo-50 flex flex-col items-center justify-center text-purple-400 p-4">
                      <Sparkles className="w-10 h-10 text-purple-500 mb-2" />
                      <span className="text-xs font-black text-purple-700 uppercase tracking-wider text-center line-clamp-2">
                        {mainProduct.name}
                      </span>
                    </div>
                  )}
                  <span className="absolute top-3 left-3 bg-purple-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-xs uppercase tracking-wider">
                    {mainProduct.badge || 'Pilihan Utama'}
                  </span>
                </div>
              </div>

              <div className="lg:col-span-7 space-y-5">
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wide">
                    {mainProduct.category || 'Penawaran Resmi'}
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 leading-snug">
                    {mainProduct.name}
                  </h3>
                </div>

                {mainProduct.description ? (
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                    {mainProduct.description}
                  </p>
                ) : null}

                {/* Feature Points */}
                {Array.isArray(mainProduct.features) && mainProduct.features.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                    {mainProduct.features.map((feat, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs font-semibold text-slate-700">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Price & Action */}
                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    {mainProduct.originalPrice ? (
                      <span className="text-[10px] text-slate-400 block line-through font-medium">
                        Rp {Number(mainProduct.originalPrice).toLocaleString('id-ID')}
                      </span>
                    ) : null}
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-black text-purple-700">
                        Rp {Number(mainProduct.price).toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onInitiateCheckout({
                          id: String(mainProduct.id),
                          title: mainProduct.name,
                          price: Number(mainProduct.price),
                        })
                      }
                      className="flex-1 sm:flex-none px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Pesan Sekarang (QRIS)</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Grid Katalog Produk & Layanan dari Database */}
            {storeProducts.length > 1 && (
              <div className="pt-8 space-y-5 border-t border-slate-200/80">
                <div className="space-y-1">
                  <span className="text-xs font-black text-purple-600 uppercase tracking-wider">
                    Katalog Lengkap
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    Pilihan Produk &amp; Layanan Lainnya
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {storeProducts.slice(1).map((item) => (
                    <div
                      key={item.id}
                      className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
                    >
                      <div className="space-y-3">
                        <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-100 flex items-center justify-center">
                          {item.image ? (
                            <img
                              src={sanitizeImageUrl(item.image)}
                              alt={item.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400">
                              <Sparkles className="w-8 h-8 text-purple-400" />
                            </div>
                          )}
                          {item.badge && (
                            <span className="absolute top-2.5 left-2.5 bg-white/95 text-purple-700 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-xs">
                              {item.badge}
                            </span>
                          )}
                        </div>

                        <div>
                          <h4 className="font-black text-slate-900 text-sm leading-snug group-hover:text-purple-600 transition-colors line-clamp-2">
                            {item.name}
                          </h4>
                          {item.description ? (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                              {item.description}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <div>
                          {item.originalPrice ? (
                            <span className="text-[10px] text-slate-400 line-through block font-medium">
                              Rp {Number(item.originalPrice).toLocaleString('id-ID')}
                            </span>
                          ) : null}
                          <span className="text-sm font-black text-purple-700">
                            Rp {Number(item.price).toLocaleString('id-ID')}
                          </span>
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
                          className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Pesan</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* SECTION TESTIMONIAL */}
      {dynamicTestimonials.length > 0 && (
        <section className="py-16 px-4 sm:px-6 bg-white border-t border-slate-100">
          <div className="max-w-5xl mx-auto space-y-10">
            <div className="text-center space-y-2">
              <span className="text-xs font-black text-purple-600 tracking-wider uppercase">
                Ulasan &amp; Pengalaman
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Testimonial Pelanggan
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {dynamicTestimonials.map((testi, i) => (
                <div
                  key={i}
                  className="bg-slate-50/60 rounded-3xl p-6 border border-slate-200/80 shadow-2xs flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center gap-1 text-amber-400">
                      {[...Array(testi.rating || 5)].map((_, s) => (
                        <Star key={s} className="w-4 h-4 fill-amber-400" />
                      ))}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed italic font-normal">
                      &ldquo;{testi.text}&rdquo;
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-200/60">
                    <h4 className="text-xs font-black text-slate-900">{testi.name}</h4>
                    {testi.role ? <p className="text-[10px] text-slate-400 font-medium">{testi.role}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer className="mt-auto bg-slate-900 text-slate-400 py-10 px-4 sm:px-6 border-t border-slate-800 text-xs">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl overflow-hidden bg-purple-600 shrink-0 flex items-center justify-center">
              {displayAvatar && !avatarError ? (
                <img
                  src={displayAvatar}
                  alt={activeName}
                  onError={() => setAvatarError(true)}
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <div className="w-full h-full rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white text-[10px] font-black">
                  {initials}
                </div>
              )}
            </div>
            <span className="font-bold text-white text-sm">{activeName} Official</span>
          </div>
          <p className="text-[11px] text-slate-500 text-center sm:text-right">
            &copy; {new Date().getFullYear()} {activeName} &bull; Powered by BoonTrack Commerce Engine
          </p>
        </div>
      </footer>

      {/* FLOATING CHAT BUBBLE WIDGET (Hanya jika chat_enabled = true) */}
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
