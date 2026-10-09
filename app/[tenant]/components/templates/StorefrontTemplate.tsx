'use client';

import React, { useState, useMemo } from 'react';
import { ShoppingBag, Plus, Minus, X, QrCode } from 'lucide-react';
import type { TenantRuntimeContext } from '@/lib/types/tenant-runtime';
import type { Product } from '@/app/[tenant]/types';
import { resolveStorefrontSections, resolveStorefrontCopy } from '@/lib/resolvers/tenant-runtime-resolver';
import InstagramVisualGrid from './InstagramVisualGrid';
import FloatingWebchat from './FloatingWebchat';
import FloatingCartBar from '@/components/cart/FloatingCartBar';
import CheckoutModal from '@/app/components/CheckoutModal';

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
  const effectiveName = storeName || displayName || context?.tenant?.name || context?.tenantSlug || 'Toko';
  const effectiveSlug = tenantSlug || context?.tenantSlug || '';

  // Internal Cart & Checkout state (Retail isolation)
  const [internalCart, setInternalCart] = useState<Array<{ product: Product; qty: number }>>([]);
  const [internalShowCartModal, setInternalShowCartModal] = useState(false);
  const [internalIsCheckoutOpen, setInternalIsCheckoutOpen] = useState(false);
  const [internalProductForCheckout, setInternalProductForCheckout] = useState<any>(null);

  const cart = props.cart || internalCart;
  const setCart = props.setCart || setInternalCart;
  const showCartModal = props.showCartModal !== undefined ? props.showCartModal : internalShowCartModal;
  const setShowCartModal = props.setShowCartModal || setInternalShowCartModal;
  const isCheckoutOpen = props.isCheckoutOpen !== undefined ? props.isCheckoutOpen : internalIsCheckoutOpen;
  const setIsCheckoutOpen = props.setIsCheckoutOpen || setInternalIsCheckoutOpen;
  const productForCheckout = props.productForCheckout || internalProductForCheckout;
  const setProductForCheckout = props.setProductForCheckout || setInternalProductForCheckout;

  const totalCartCount = useMemo(() => cart.reduce((acc: number, c: any) => acc + (c.qty || 1), 0), [cart]);
  const totalCartPrice = useMemo(() => cart.reduce((acc: number, c: any) => acc + (Number(c.product?.price || 0) * (c.qty || 1)), 0), [cart]);

  const addToCart = (product: Product, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (onAddToCart) {
      onAddToCart(product, e);
      return;
    }
    setCart((prev: any[]) => {
      const existing = prev.find((item) => String(item.product.id) === String(product.id));
      if (existing) {
        return prev.map((item) =>
          String(item.product.id) === String(product.id)
            ? { ...item, qty: item.qty + 1 }
            : item
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  };

  const updateCartQty = (productId: string | number, delta: number) => {
    setCart((prev: any[]) => {
      return prev
        .map((item) => {
          if (String(item.product.id) === String(productId)) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as Array<{ product: Product; qty: number }>;
    });
  };

  const handleCartCheckout = () => {
    if (cart.length === 0) return;
    const combinedTitles = cart.map((c: any) => `${c.product.name} (x${c.qty})`).join(', ');
    const hasPhysicalOrFood = cart.some(
      (c: any) => c.product.type === 'physical' || c.product.type === 'food' || c.product.requires_shipping
    );
    setProductForCheckout({
      id: `CART-${Date.now()}`,
      title: combinedTitles,
      price: totalCartPrice,
      requires_shipping: hasPhysicalOrFood,
      product_type: hasPhysicalOrFood ? 'PHYSICAL' : 'DIGITAL',
      type: hasPhysicalOrFood ? 'physical' : 'digital',
      items: cart.map((c: any) => ({
        productId: String(c.product.id),
        productTitle: c.product.name,
        unitPrice: c.product.price,
        quantity: c.qty,
      })),
    });
    setShowCartModal(false);
    setIsCheckoutOpen(true);
  };

  // If children JSX is provided, wrap in runtime context container + retail overlays
  if (children) {
    return (
      <div data-template={context?.templateCode || 'SHOP_V1'} data-tenant-kind={context?.tenantKind || 'SAAS'} className="boontrack-storefront-runtime">
        {children}

        {/* MODAL KERANJANG */}
        {showCartModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 min-h-[100dvh] overflow-y-auto safe-pb">
            <div className="bg-white max-w-md w-full rounded-3xl border border-slate-200 p-6 shadow-2xl space-y-4 relative max-h-[calc(100dvh-2rem)] overflow-y-auto my-auto">
              <button
                onClick={() => setShowCartModal(false)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-blue-600" /> Ringkasan Pesanan Produk
              </h2>
              {cart.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">Belum ada produk yang dipilih.</p>
              ) : (
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {cart.map((item: any) => (
                    <div key={item.product.id} className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex-1 pr-2">
                        <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{item.product.name}</h4>
                        <span className="text-xs text-blue-600 font-bold">
                          Rp {((Number(item.product?.price) || 0) * (Number(item.qty) || 1)).toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateCartQty(item.product.id, -1)}
                          className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 cursor-pointer"
                        >
                          <Minus className="w-3 h-3 text-slate-600" />
                        </button>
                        <span className="text-xs font-bold text-slate-800">{item.qty}</span>
                        <button
                          onClick={() => updateCartQty(item.product.id, 1)}
                          className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 cursor-pointer"
                        >
                          <Plus className="w-3 h-3 text-slate-600" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {cart.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center text-xs font-black text-slate-900">
                    <span>Total Biaya</span>
                    <span className="text-sm text-blue-600">Rp {Number(totalCartPrice || 0).toLocaleString('id-ID')}</span>
                  </div>
                  <button
                    onClick={handleCartCheckout}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Konfirmasi Pemesanan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCartModal(false)}
                    className="w-full text-center text-sm font-medium text-slate-500 hover:text-slate-800 py-2.5 mt-1 transition-colors cursor-pointer"
                  >
                    + Pilih Produk Lain
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FLOATING CART BAR */}
        {(cart.length > 0 || (cart as any)?.items?.length > 0 || totalCartCount > 0) && !showCartModal && !isCheckoutOpen && (
          <FloatingCartBar
            totalCount={totalCartCount}
            subtotal={totalCartPrice}
            onOpenCart={() => setShowCartModal(true)}
            onCheckout={() => setShowCartModal(true)}
            className="bottom-4 sm:bottom-6"
          />
        )}

        {/* MODAL CHECKOUT */}
        <CheckoutModal
          isOpen={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          tenantSlug={effectiveSlug}
          product={productForCheckout}
        />
      </div>
    );
  }

  // Standalone storefront render
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
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
          <div className="flex items-center gap-2">
            {totalCartCount > 0 && (
              <button
                type="button"
                onClick={() => setShowCartModal(true)}
                className="py-1.5 px-3 bg-blue-50 text-blue-700 font-bold text-xs rounded-xl border border-blue-200 flex items-center gap-1.5 cursor-pointer"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>{totalCartCount} Item</span>
              </button>
            )}
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Katalog Aktif
            </span>
          </div>
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
                    setProductForCheckout({
                      id: String(item.id || idx),
                      title: item.name || item.title,
                      price: Number(item.price || 0),
                      download_url: item.download_url,
                      category: item.category,
                      type: item.type,
                    });
                    setIsCheckoutOpen(true);
                  }
                };

                const handleCart = (e: React.MouseEvent) => {
                  addToCart(item, e);
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

      {/* Visual Feeding Grid */}
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

      {/* MODAL KERANJANG */}
      {showCartModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 min-h-[100dvh] overflow-y-auto safe-pb">
          <div className="bg-white max-w-md w-full rounded-3xl border border-slate-200 p-6 shadow-2xl space-y-4 relative max-h-[calc(100dvh-2rem)] overflow-y-auto my-auto">
            <button
              onClick={() => setShowCartModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-blue-600" /> Ringkasan Pesanan Produk
            </h2>
            {cart.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">Belum ada produk yang dipilih.</p>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {cart.map((item: any) => (
                  <div key={item.product.id} className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex-1 pr-2">
                      <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{item.product.name}</h4>
                      <span className="text-xs text-blue-600 font-bold">
                        Rp {((Number(item.product?.price) || 0) * (Number(item.qty) || 1)).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateCartQty(item.product.id, -1)}
                        className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 cursor-pointer"
                      >
                        <Minus className="w-3 h-3 text-slate-600" />
                      </button>
                      <span className="text-xs font-bold text-slate-800">{item.qty}</span>
                      <button
                        onClick={() => updateCartQty(item.product.id, 1)}
                        className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 cursor-pointer"
                      >
                        <Plus className="w-3 h-3 text-slate-600" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {cart.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center text-xs font-black text-slate-900">
                  <span>Total Biaya</span>
                  <span className="text-sm text-blue-600">Rp {Number(totalCartPrice || 0).toLocaleString('id-ID')}</span>
                </div>
                <button
                  onClick={handleCartCheckout}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Konfirmasi Pemesanan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCartModal(false)}
                  className="w-full text-center text-sm font-medium text-slate-500 hover:text-slate-800 py-2.5 mt-1 transition-colors cursor-pointer"
                >
                  + Pilih Produk Lain
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FLOATING CART BAR */}
      {(cart.length > 0 || (cart as any)?.items?.length > 0 || totalCartCount > 0) && !showCartModal && !isCheckoutOpen && (
        <FloatingCartBar
          totalCount={totalCartCount}
          subtotal={totalCartPrice}
          onOpenCart={() => setShowCartModal(true)}
          onCheckout={() => setShowCartModal(true)}
          className="bottom-4 sm:bottom-6"
        />
      )}

      {/* MODAL CHECKOUT */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        tenantSlug={effectiveSlug}
        product={productForCheckout}
      />
    </div>
  );
}

export default StorefrontTemplate;
