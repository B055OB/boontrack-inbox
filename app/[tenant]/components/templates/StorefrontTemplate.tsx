'use client';

import React, { useState } from 'react';
import { ShoppingBag, Plus, QrCode } from 'lucide-react';
import type { TenantRuntimeContext } from '@/lib/types/tenant-runtime';
import type { Product } from '@/app/[tenant]/types';
import { resolveStorefrontSections, resolveStorefrontCopy } from '@/lib/resolvers/tenant-runtime-resolver';
import InstagramVisualGrid from './InstagramVisualGrid';
import FloatingWebchat from './FloatingWebchat';

export interface StorefrontTemplateProps {
  context?: TenantRuntimeContext;
  tenantSlug?: string;
  storeName?: string;
  displayName?: string;
  tenant?: any;
  tenantMetadata?: any;
  storeProducts?: Product[];
  children?: React.ReactNode;
  onInitiateCheckout?: (product: any) => void;
  onAddToCart?: (product: any, e?: React.MouseEvent) => void;
  [key: string]: any;
}

export function StorefrontTemplate({
  context,
  tenantSlug,
  storeName,
  displayName,
  tenant,
  tenantMetadata,
  storeProducts,
  children,
  onInitiateCheckout,
  onAddToCart,
  ...props
}: StorefrontTemplateProps) {
  // If children JSX is provided, wrap in runtime context container
  if (children) {
    return (
      <div data-template={context?.templateCode || 'SHOP_V1'} data-tenant-kind={context?.tenantKind || 'SAAS'} className="boontrack-storefront-runtime">
        {children}
      </div>
    );
  }

  // Standalone storefront render
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const effectiveName = storeName || displayName || context?.tenant?.name || context?.tenantSlug || 'Toko';
  const effectiveSlug = tenantSlug || context?.tenantSlug || '';
  const products = storeProducts || context?.tenant?.metadata?.products || [];
  const meta = tenantMetadata || context?.tenant?.metadata || tenant?.metadata;
  const sections = resolveStorefrontSections(meta);
  const copy = resolveStorefrontCopy(meta, effectiveName);

  return (
    <div data-template={context?.templateCode || 'SHOP_V1'} className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col justify-between">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-lg shadow-sm">
              {effectiveName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="font-black text-slate-900 text-base sm:text-lg">{effectiveName}</h1>
              <p className="text-[11px] text-slate-500">Official Store • shop.boontrack.com/{effectiveSlug}</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Katalog Aktif
          </span>
        </div>
      </header>

      {/* Catalog Grid */}
      {sections.catalog?.is_active !== false && (
        <main className="max-w-7xl mx-auto px-4 py-8 flex-1">
          <div className="mb-6">
            <h2 className="text-xl font-black text-slate-900">{copy.catalog_title || 'Katalog Produk & Layanan'}</h2>
            <p className="text-xs text-slate-500 mt-1">Pilih produk untuk memesan langsung via WhatsApp &amp; QRIS.</p>
          </div>

          {products.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-xs">
              <p className="text-sm text-slate-500">Belum ada produk aktif di etalase toko ini.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {products.map((item: any, idx: number) => {
                const handleCheckout = (e?: React.MouseEvent) => {
                  if (e) e.stopPropagation();
                  if (onInitiateCheckout) {
                    onInitiateCheckout({
                      id: String(item.id || idx),
                      title: item.name || item.title,
                      price: Number(item.price || 0),
                      download_url: item.download_url,
                      category: item.category,
                      type: item.type,
                    });
                  } else if (props.onInitiateCheckout) {
                    props.onInitiateCheckout({
                      id: String(item.id || idx),
                      title: item.name || item.title,
                      price: Number(item.price || 0),
                      download_url: item.download_url,
                      category: item.category,
                      type: item.type,
                    });
                  } else {
                    window.location.href = `/${effectiveSlug}/checkout?productId=${encodeURIComponent(item.id || idx)}`;
                  }
                };

                const handleCart = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  if (onAddToCart) {
                    onAddToCart(item, e);
                  } else if (props.onAddToCart) {
                    props.onAddToCart(item, e);
                  } else if (props.addToCart) {
                    props.addToCart(item, e);
                  } else {
                    handleCheckout(e);
                  }
                };

                return (
                  <div
                    key={item.id || idx}
                    onClick={() => handleCheckout()}
                    className="bg-white rounded-3xl border border-slate-200/90 p-4 shadow-sm hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between cursor-pointer group"
                  >
                    <div>
                      <div className="relative rounded-2xl overflow-hidden mb-3.5 bg-slate-50 border border-slate-100 aspect-[4/3] sm:aspect-video w-full flex items-center justify-center p-1.5">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name || item.title}
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
                      <h3 className="font-bold text-base text-slate-900 leading-snug group-hover:text-blue-600 transition-colors">
                        {item.name || item.title}
                      </h3>
                      {item.description ? (
                        <p className="text-xs text-slate-500 mt-2 line-clamp-3 leading-relaxed">
                          {item.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-baseline justify-between">
                        <span className="font-black text-blue-600 text-base">
                          {Number(item.price || 0) === 0 ? 'GRATIS' : `Rp ${Number(item.price || 0).toLocaleString('id-ID')}`}
                        </span>
                        {item.originalPrice && item.originalPrice > item.price ? (
                          <span className="text-xs text-slate-400 line-through">
                            Rp {Number(item.originalPrice).toLocaleString('id-ID')}
                          </span>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={handleCart}
                          className="py-2.5 px-3 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer whitespace-nowrap shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5 text-emerald-600" />
                          <span>+ Keranjang</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleCheckout}
                          className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer whitespace-nowrap shadow-md shadow-blue-500/20"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Pesan Langsung</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* Visual Feeding Grid (Dynamic if tenant provides visual feed in metadata) */}
      <InstagramVisualGrid
        tenantSlug={effectiveSlug}
        storeName={effectiveName}
        tenantMetadata={meta}
        sectionConfig={sections.visual_feed}
        onSelectTopic={(topic) => setSelectedTopic(topic)}
      />

      {/* Floating Webchat Widget */}
      {props.chatEnabled !== false && (
        <FloatingWebchat
          tenantSlug={effectiveSlug}
          storeName={effectiveName}
          displayName={displayName || effectiveName}
          category={tenant?.category || meta?.category}
          dynamicQuickReplies={props.dynamicQuickReplies || []}
          initialTopic={selectedTopic}
          sectionConfig={sections.floating_chat}
          onInitiateCheckout={props.onInitiateCheckout}
        />
      )}
    </div>
  );
}

export default StorefrontTemplate;
