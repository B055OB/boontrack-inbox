'use client';

import React from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';

export interface StickyBuyButtonProps {
  totalAmount: number;
  ctaText?: string;
  dynamicCtaPrefix?: string;
  isAffiliateProduct?: boolean;
  externalAffiliateUrl?: string;
  affiliateCtaLabel?: string;
  targetFormId?: string;
  onOpenCheckout?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onExternalClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * StickyBuyButton
 * Mobile-first sticky bottom bar for storefront product detail pages.
 *
 * Guaranteed:
 * 1. Uses <button type="button"> instead of empty/hash anchor tags to eliminate scroll jumps to top (0,0).
 * 2. Strict e.preventDefault() & e.stopPropagation() on click events.
 * 3. Smooth-scrolls to `#checkout-form` (or opens modal/drawer directly).
 * 4. Focuses input with { preventScroll: true } to prevent mobile keyboard viewport snapping.
 */
export function StickyBuyButton({
  totalAmount,
  ctaText,
  dynamicCtaPrefix = 'Beli Sekarang',
  isAffiliateProduct = false,
  externalAffiliateUrl,
  affiliateCtaLabel = 'Beli Sekarang (Mitra Resmi)',
  targetFormId = 'checkout-form',
  onOpenCheckout,
  onExternalClick,
  disabled = false,
  className = '',
}: StickyBuyButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled) return;

    if (onOpenCheckout) {
      onOpenCheckout(e);
      return;
    }

    // Default smooth scroll behavior to form without resetting viewport to top
    const formEl =
      document.getElementById(targetFormId) ||
      document.getElementById('checkout-section');

    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        const input = formEl.querySelector('input') as HTMLInputElement | null;
        if (input && document.activeElement !== input) {
          input.focus({ preventScroll: true });
        }
      }, 400);
    }
  };

  const hasValidExternalUrl = Boolean(
    isAffiliateProduct &&
      externalAffiliateUrl &&
      externalAffiliateUrl.trim() !== '' &&
      !externalAffiliateUrl.trim().startsWith('#')
  );

  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
    if (!hasValidExternalUrl) {
      e.preventDefault();
    }
    if (onExternalClick) {
      onExternalClick(e);
    }
  };

  const resolvedCtaLabel =
    ctaText ||
    (totalAmount === 0
      ? 'Klaim Sekarang (Gratis)'
      : `${dynamicCtaPrefix} - Rp ${totalAmount.toLocaleString('id-ID')}`);

  return (
    <div
      className={`fixed bottom-0 inset-x-0 bg-white/95 border-t border-slate-200 px-4 py-3.5 sm:py-4 z-40 backdrop-blur-md shadow-2xl pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))] transition-all ${className}`}
    >
      <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Total Amount Display */}
        <div className="text-left shrink-0">
          <span className="text-[10px] text-slate-400 uppercase font-bold block tracking-wider">
            Total Investasi
          </span>
          <span className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
            {totalAmount === 0 ? 'GRATIS' : `Rp ${totalAmount.toLocaleString('id-ID')}`}
          </span>
        </div>

        {/* Right: CTA Button */}
        {hasValidExternalUrl ? (
          <a
            href={externalAffiliateUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleAnchorClick}
            className="flex-1 max-w-xs py-3.5 px-4 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 transition cursor-pointer text-center"
          >
            <span className="truncate">{affiliateCtaLabel}</span>
            <ExternalLink className="w-4 h-4 shrink-0" />
          </a>
        ) : (
          <button
            type="button"
            id="sticky-buy-button"
            data-testid="sticky-buy-button"
            onClick={handleClick}
            disabled={disabled}
            className="flex-1 max-w-xs py-3.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition cursor-pointer text-center"
          >
            <span className="truncate">{resolvedCtaLabel}</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        )}
      </div>
    </div>
  );
}

export default StickyBuyButton;
