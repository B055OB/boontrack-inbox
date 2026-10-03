'use client';

import React from 'react';
import { X, Plus, Minus, Trash2, ShoppingBag, ArrowRight, Package } from 'lucide-react';
import { CartRecord, CartItemRecord } from '@/lib/cart/cart-types';

export interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartRecord | null;
  onUpdateQty: (itemId: string, newQty: number) => void;
  onRemoveItem: (itemId: string) => void;
  onCheckout: () => void;
  loading?: boolean;
}

export default function CartDrawer({
  isOpen,
  onClose,
  cart,
  onUpdateQty,
  onRemoveItem,
  onCheckout,
  loading = false,
}: CartDrawerProps) {
  if (!isOpen) return null;

  const items = cart?.items || [];
  const totalCount = cart?.total_quantity || 0;
  const subtotal = cart?.subtotal || 0;
  const totalWeight = cart?.total_weight_grams || 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300">
      {/* Backdrop tap to close */}
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900">Keranjang Belanja</h2>
              <p className="text-[11px] text-slate-500">{totalCount} item siap di-checkout</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition cursor-pointer"
            aria-label="Tutup keranjang"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Item List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <ShoppingBag className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-700">Keranjang masih kosong</p>
              <p className="text-xs text-slate-400 mt-1">Pilih menu atau produk favorit Anda dan tambahkan ke keranjang.</p>
            </div>
          ) : (
            items.map((item: CartItemRecord) => {
              const unitPrice = (item.current_unit_price || item.unit_price_snapshot || 0) + (item.modifier_extra_total || 0);
              const lineTotal = item.line_total || unitPrice * item.quantity;

              return (
                <div
                  key={item.id}
                  className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs hover:border-emerald-300 transition flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {item.product_title || 'Produk'}
                      </h4>
                      {item.variant_id && (
                        <p className="text-[11px] text-slate-500">Varian: {item.variant_id}</p>
                      )}
                      {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.selected_modifiers.map((mod, i) => (
                            <span
                              key={i}
                              className="text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200/60 px-1.5 py-0.5 rounded-md"
                            >
                              {mod.option_name || mod.name}
                              {mod.extra_price ? ` (+Rp${Number(mod.extra_price).toLocaleString('id-ID')})` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.id)}
                      className="text-slate-400 hover:text-rose-500 p-1 transition cursor-pointer"
                      title="Hapus item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <div className="text-xs font-black text-emerald-700">
                      Rp {lineTotal.toLocaleString('id-ID')}
                      <span className="text-[10px] font-normal text-slate-400 ml-1">
                        (@ Rp {unitPrice.toLocaleString('id-ID')})
                      </span>
                    </div>

                    <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => onUpdateQty(item.id, item.quantity - 1)}
                        disabled={loading}
                        className="px-2 py-1 text-slate-600 hover:bg-slate-200 transition cursor-pointer disabled:opacity-50"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-2.5 text-xs font-bold text-slate-900 min-w-6 text-center">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                        disabled={loading}
                        className="px-2 py-1 text-slate-600 hover:bg-slate-200 transition cursor-pointer disabled:opacity-50"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Summary & Checkout */}
        {items.length > 0 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50/90 space-y-3">
            {totalWeight > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-slate-400" />
                  <span>Akumulasi Berat Paket:</span>
                </span>
                <span className="font-bold text-slate-700">{totalWeight} gr</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">Subtotal ({totalCount} item):</span>
              <span className="text-base font-black text-slate-900">
                Rp {subtotal.toLocaleString('id-ID')}
              </span>
            </div>

            <button
              type="button"
              onClick={onCheckout}
              disabled={loading || items.length === 0}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-600/20 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>Lanjut ke Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
