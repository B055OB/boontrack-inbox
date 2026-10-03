'use client';

import React from 'react';
import { ShoppingBag, ArrowRight } from 'lucide-react';

export interface FloatingCartBarProps {
  totalCount: number;
  subtotal: number;
  onOpenCart: () => void;
  onCheckout?: () => void;
  className?: string;
}

export default function FloatingCartBar({
  totalCount,
  subtotal,
  onOpenCart,
  onCheckout,
  className = '',
}: FloatingCartBarProps) {
  if (totalCount <= 0) return null;

  const handleCheckoutClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onCheckout) {
      onCheckout();
    } else {
      onOpenCart();
    }
  };

  const handleBarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onOpenCart();
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      className={`fixed bottom-4 inset-x-0 z-50 px-4 max-w-lg mx-auto pointer-events-none ${className}`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={handleBarClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenCart();
          }
        }}
        className="pointer-events-auto w-full bg-slate-900/95 hover:bg-slate-950 text-white rounded-2xl p-3 shadow-2xl backdrop-blur-md border border-slate-700/60 flex items-center justify-between transition-all transform active:scale-98 cursor-pointer group animate-in slide-in-from-bottom duration-300 select-none"
      >
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold text-xs shadow-xs">
            <ShoppingBag className="w-4 h-4" />
            <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-slate-900">
              {totalCount}
            </span>
          </div>
          <div className="text-left">
            <div className="text-[11px] text-slate-300 font-medium">Keranjang Belanja</div>
            <div className="text-xs font-black text-emerald-400">
              Rp {subtotal.toLocaleString('id-ID')}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCheckoutClick}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-100 bg-slate-800/90 hover:bg-emerald-600 px-3 py-1.5 rounded-xl transition cursor-pointer"
        >
          <span>Checkout</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export { FloatingCartBar };
