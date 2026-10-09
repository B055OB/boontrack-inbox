'use client';

import React, { useState } from 'react';
import {
  Heart,
  MessageCircle,
  ExternalLink,
  Sparkles,
  X,
  Share2,
  Bookmark,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

import type { StorefrontSectionConfig } from '@/lib/types/tenant-runtime';

function InstagramIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export interface VisualFeedItem {
  id: string;
  image_url: string;
  title: string;
  caption: string;
  tag?: string;
  likes?: string | number;
  comments?: string | number;
  link_url?: string;
}

interface InstagramVisualGridProps {
  tenantSlug: string;
  storeName: string;
  tenantMetadata?: any;
  sectionConfig?: StorefrontSectionConfig;
  onSelectTopic?: (topic: string) => void;
}

export default function InstagramVisualGrid({
  tenantSlug,
  storeName,
  tenantMetadata,
  sectionConfig,
  onSelectTopic,
}: InstagramVisualGridProps) {
  if (sectionConfig && !sectionConfig.is_active) {
    return null;
  }

  const [activeItem, setActiveItem] = useState<VisualFeedItem | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const rawFeed: VisualFeedItem[] =
    Array.isArray(tenantMetadata?.visual_feed) && tenantMetadata.visual_feed.length > 0
      ? tenantMetadata.visual_feed
      : (Array.isArray(tenantMetadata?.feed_posts) && tenantMetadata.feed_posts.length > 0
          ? tenantMetadata.feed_posts
          : []);

  // Gracefully hide if no visual feed exists (Strict Zero-Mockup / Dynamic Guardrail)
  if (!rawFeed || rawFeed.length === 0) {
    return null;
  }

  const sectionTitle =
    tenantMetadata?.visual_feed_title ||
    tenantMetadata?.storefront_copy?.visual_feed_title ||
    `Galeri & Feed ${storeName}`;

  const sectionSubtitle =
    tenantMetadata?.visual_feed_subtitle ||
    tenantMetadata?.storefront_copy?.visual_feed_subtitle ||
    `Dokumentasi aktivitas, portofolio karya, dan informasi resmi dari ${storeName}`;

  const igHandle =
    tenantMetadata?.visual_feed_handle ||
    tenantMetadata?.links?.instagram ||
    (tenantMetadata?.instagram ? `@${tenantMetadata.instagram.replace(/^@/, '')}` : `@${tenantSlug}`);

  const igCleanHandle = igHandle.replace(/^@/, '');
  const igUrl = `https://instagram.com/${igCleanHandle}`;

  const fallbackSrc =
    tenantMetadata?.logo_url ||
    tenantMetadata?.avatar_url ||
    '/placeholder-product.png';

  const handleImageError = (id: string) => {
    setImageErrors((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <section className="py-16 md:py-24 px-4 sm:px-6 bg-gradient-to-b from-white via-slate-50/70 to-white border-t border-slate-200/80">
      <div className="max-w-6xl mx-auto space-y-10">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-rose-50 to-pink-50 border border-pink-200 text-pink-700 text-xs font-black shadow-2xs">
              <InstagramIcon className="w-3.5 h-3.5 text-pink-600" />
              <span>Instagram Feed &bull; {igHandle}</span>
            </div>

            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-tight">
              {sectionTitle}
            </h2>

            <p className="text-xs sm:text-sm text-slate-600 font-normal leading-relaxed">
              {sectionSubtitle}
            </p>
          </div>

          <a
            href={igUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold border border-slate-200 shadow-xs hover:border-pink-300 hover:text-pink-600 transition-all shrink-0 cursor-pointer self-start sm:self-auto active:scale-95"
          >
            <InstagramIcon className="w-4 h-4 text-pink-500" />
            <span>Kunjungi {igHandle}</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>
        </div>

        {/* Visual Grid (3 columns on desktop, 2 on tablet, 1 on mobile) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {rawFeed.map((item, idx) => {
            const hasError = imageErrors[item.id];
            const displaySrc = hasError ? fallbackSrc : item.image_url;

            return (
              <div
                key={item.id || `feed-${idx}`}
                onClick={() => setActiveItem(item)}
                className="group relative bg-white rounded-3xl border border-slate-200/90 hover:border-pink-300 shadow-xs hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col cursor-pointer"
              >
                {/* Media Container */}
                <div className="relative aspect-4/3 sm:aspect-square w-full overflow-hidden bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displaySrc}
                    alt={item.title || `Visual Feed ${idx + 1}`}
                    loading="lazy"
                    onError={() => handleImageError(item.id)}
                    className="w-full h-full object-cover object-center group-hover:scale-108 transition-transform duration-500"
                  />

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                    <div className="flex items-center gap-4 text-white text-xs font-bold">
                      <span className="flex items-center gap-1.5">
                        <Heart className="w-4 h-4 fill-white text-white" />
                        {item.likes || '1.2k'}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MessageCircle className="w-4 h-4 fill-white text-white" />
                        {item.comments || '48'}
                      </span>
                    </div>
                  </div>

                  {/* Tag Pill */}
                  {item.tag && (
                    <span className="absolute top-3 left-3 bg-white/95 backdrop-blur-xs text-slate-800 text-[10px] font-black px-2.5 py-1 rounded-full border border-slate-200/80 shadow-xs">
                      {item.tag}
                    </span>
                  )}
                </div>

                {/* Content Card Info */}
                <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm group-hover:text-pink-600 transition-colors line-clamp-1 leading-snug">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                      {item.caption}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                    <span className="flex items-center gap-1">
                      <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
                      <span>{item.likes || '1.2k'} suka</span>
                    </span>
                    <span className="text-pink-600 font-bold group-hover:underline flex items-center gap-1">
                      <span>Lihat Tips</span>
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Banner */}
        <div className="p-6 rounded-3xl bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
          <div className="space-y-1 text-center sm:text-left">
            <h4 className="text-sm sm:text-base font-black flex items-center justify-center sm:justify-start gap-2">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>
                {String(tenantMetadata?.category || '').toUpperCase().includes('KLINIK')
                  ? 'Ingin Konsultasi Langsung Bersama Tim Praktisi?'
                  : `Ada Pertanyaan Seputar Layanan ${storeName}?`}
              </span>
            </h4>
            <p className="text-xs text-purple-200 max-w-xl">
              {String(tenantMetadata?.category || '').toUpperCase().includes('KLINIK')
                ? `Gunakan widget webchat di pojok kanan bawah atau jadwalkan sesi tatap muka langsung di ${storeName}.`
                : `Gunakan widget webchat di pojok kanan bawah atau hubungi tim customer service resmi ${storeName}.`}
            </p>
          </div>

          <a
            href={igUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-xl bg-white hover:bg-purple-50 text-purple-950 font-bold text-xs shadow-md transition-all shrink-0 cursor-pointer active:scale-95"
          >
            Follow {igHandle}
          </a>
        </div>
      </div>

      {/* DETAIL MODAL POPUP */}
      {activeItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white max-w-2xl w-full rounded-3xl border border-slate-200 shadow-2xl overflow-hidden my-auto flex flex-col md:flex-row max-h-[90vh]">
            {/* Modal Image Section */}
            <div className="relative md:w-1/2 bg-slate-950 flex items-center justify-center overflow-hidden min-h-[260px] md:min-h-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageErrors[activeItem.id] ? fallbackSrc : activeItem.image_url}
                alt={activeItem.title}
                className="w-full h-full object-cover max-h-[420px]"
              />
              {activeItem.tag && (
                <span className="absolute top-3 left-3 bg-white/95 text-slate-800 text-[10px] font-black px-2.5 py-1 rounded-full shadow-xs">
                  {activeItem.tag}
                </span>
              )}
            </div>

            {/* Modal Content Section */}
            <div className="md:w-1/2 p-6 flex flex-col justify-between overflow-y-auto space-y-4">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-400 to-rose-500 p-0.5">
                      <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                        <InstagramIcon className="w-4 h-4 text-rose-500" />
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900 leading-tight">{storeName}</h4>
                      <p className="text-[10px] text-slate-400">{igHandle}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveItem(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="pt-3 space-y-2">
                  <h3 className="text-base font-black text-slate-900 leading-snug">
                    {activeItem.title}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {activeItem.caption}
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 font-bold text-rose-600">
                      <Heart className="w-4 h-4 fill-rose-600" />
                      {activeItem.likes || '1.2k'}
                    </span>
                    <span className="flex items-center gap-1 font-bold text-slate-700">
                      <MessageCircle className="w-4 h-4" />
                      {activeItem.comments || '48'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">Dipublikasikan di Instagram</span>
                </div>

                {onSelectTopic && (
                  <button
                    type="button"
                    onClick={() => {
                      const topic = activeItem.title;
                      setActiveItem(null);
                      onSelectTopic(topic);
                    }}
                    className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Konsultasikan Topik Ini di Webchat</span>
                  </button>
                )}

                <a
                  href={igUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <InstagramIcon className="w-3.5 h-3.5 text-pink-500" />
                  <span>Buka di Instagram</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
