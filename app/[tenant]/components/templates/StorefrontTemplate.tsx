'use client';

import React, { useState } from 'react';
import type { TenantRuntimeContext } from '@/lib/types/tenant-runtime';
import type { Product } from '@/app/[tenant]/page';
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
      <main className="max-w-7xl mx-auto px-4 py-8 flex-1">
        <div className="mb-6">
          <h2 className="text-xl font-black text-slate-900">Katalog Produk &amp; Layanan</h2>
          <p className="text-xs text-slate-500 mt-1">Pilih produk untuk memesan langsung via WhatsApp &amp; QRIS.</p>
        </div>

        {products.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-xs">
            <p className="text-sm text-slate-500">Belum ada produk aktif di etalase toko ini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {products.map((item: any, idx: number) => (
              <div key={item.id || idx} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
                <div>
                  {item.image && (
                    <img src={item.image} alt={item.name || item.title} className="w-full h-36 object-cover rounded-xl mb-3" />
                  )}
                  <h3 className="font-bold text-sm text-slate-900 line-clamp-2">{item.name || item.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.description}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="font-black text-blue-600 text-sm">
                    Rp {Number(item.price || 0).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Visual Feeding Grid (Dynamic if tenant provides visual feed in metadata) */}
      <InstagramVisualGrid
        tenantSlug={effectiveSlug}
        storeName={effectiveName}
        tenantMetadata={meta}
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
          onInitiateCheckout={props.onInitiateCheckout}
        />
      )}
    </div>
  );
}

export default StorefrontTemplate;
