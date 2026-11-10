'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Minus, CheckCircle2, AlertCircle, Flame } from 'lucide-react';

export const DEFAULT_SOUP_VARIANTS: readonly string[] = [
  'Tomyum',
  'Sukiyaki',
  'Kaldu Ayam',
  'Gurih Gurih',
] as const;

/**
 * Resolves soup slot quota based on package name:
 * - Oishii / Ichiban : 2 slots
 * - Mabar A / Mabar B: 3 slots
 * - Fallback: defaultQuota (default 2)
 */
export function getSoupQuotaForPackage(packageName?: string, defaultQuota = 2): number {
  if (!packageName) return defaultQuota;
  const normalized = packageName.toLowerCase();

  if (
    normalized.includes('mabar a') ||
    normalized.includes('mabar b') ||
    normalized.includes('mabar')
  ) {
    return 3;
  }

  if (
    normalized.includes('oishii') ||
    normalized.includes('oishi') ||
    normalized.includes('ichiban')
  ) {
    return 2;
  }

  return defaultQuota;
}

/**
 * Validates whether the allocated soup slots match the quota limit.
 */
export function validateSoupSelection(
  selectedSoups: Record<string, number> = {},
  quotaLimit = 2
): {
  isValid: boolean;
  allocatedSlots: number;
  remainingSlots: number;
  isComplete: boolean;
} {
  const allocatedSlots = Object.values(selectedSoups).reduce(
    (sum, val) => sum + Math.max(0, Number(val) || 0),
    0
  );
  const remainingSlots = Math.max(0, quotaLimit - allocatedSlots);
  const isComplete = allocatedSlots === quotaLimit;
  const isValid = isComplete;

  return {
    isValid,
    allocatedSlots,
    remainingSlots,
    isComplete,
  };
}

/**
 * Formats soup allocation into human-readable string (e.g. "Tomyum: 2, Sukiyaki: 1").
 */
export function formatSoupSelection(selectedSoups: Record<string, number> = {}): string {
  return Object.entries(selectedSoups)
    .filter(([_, qty]) => Number(qty) > 0)
    .map(([variant, qty]) => `${variant}: ${qty}`)
    .join(', ');
}

export interface SoupSlotSelectorProps {
  packageName?: string;
  quotaLimit?: number;
  soupSlots?: number;
  availableSoups?: string[];
  value?: Record<string, number>;
  initialSelection?: Record<string, number>;
  onChange?: (
    selection: Record<string, number>,
    isComplete: boolean,
    totalAllocated: number
  ) => void;
  onAddToCart?: (selection: Record<string, number>) => void;
  onSubmit?: (selection: Record<string, number>) => void;
  submitButtonText?: string;
  showSubmitButton?: boolean;
  disabled?: boolean;
  className?: string;
}

export function SoupSlotSelector({
  packageName,
  quotaLimit: explicitQuota,
  soupSlots,
  availableSoups = DEFAULT_SOUP_VARIANTS as string[],
  value,
  initialSelection,
  onChange,
  onAddToCart,
  onSubmit,
  submitButtonText = 'Tambah ke Keranjang',
  showSubmitButton = true,
  disabled = false,
  className = '',
}: SoupSlotSelectorProps) {
  // Determine quota limit: explicit prop > soupSlots prop > packageName heuristic > 2
  const quotaLimit = useMemo(() => {
    if (typeof explicitQuota === 'number' && explicitQuota > 0) {
      return explicitQuota;
    }
    if (typeof soupSlots === 'number' && soupSlots > 0) {
      return soupSlots;
    }
    return getSoupQuotaForPackage(packageName, 2);
  }, [explicitQuota, soupSlots, packageName]);

  // Internal state for uncontrolled or controlled fallback
  const [internalSelection, setInternalSelection] = useState<Record<string, number>>(() => {
    return initialSelection || value || {};
  });

  const activeSelection = value !== undefined ? value : internalSelection;

  const { allocatedSlots, remainingSlots, isComplete } = useMemo(() => {
    return validateSoupSelection(activeSelection, quotaLimit);
  }, [activeSelection, quotaLimit]);

  const isQuotaReached = allocatedSlots >= quotaLimit;

  // Handle increment for a specific soup variant
  const handleIncrement = (variant: string) => {
    if (disabled || isQuotaReached) return;

    const currentCount = activeSelection[variant] || 0;
    const nextSelection = {
      ...activeSelection,
      [variant]: currentCount + 1,
    };

    if (value === undefined) {
      setInternalSelection(nextSelection);
    }

    const nextValidation = validateSoupSelection(nextSelection, quotaLimit);
    onChange?.(nextSelection, nextValidation.isComplete, nextValidation.allocatedSlots);
  };

  // Handle decrement for a specific soup variant
  const handleDecrement = (variant: string) => {
    if (disabled) return;
    const currentCount = activeSelection[variant] || 0;
    if (currentCount <= 0) return;

    const nextSelection = {
      ...activeSelection,
      [variant]: currentCount - 1,
    };

    if (nextSelection[variant] === 0) {
      delete nextSelection[variant];
    }

    if (value === undefined) {
      setInternalSelection(nextSelection);
    }

    const nextValidation = validateSoupSelection(nextSelection, quotaLimit);
    onChange?.(nextSelection, nextValidation.isComplete, nextValidation.allocatedSlots);
  };

  const handleSubmit = () => {
    if (!isComplete || disabled) return;
    onSubmit?.(activeSelection);
    onAddToCart?.(activeSelection);
  };

  return (
    <div
      data-testid="soup-slot-selector"
      className={`rounded-2xl bg-amber-50/50 border border-amber-200/80 p-4 space-y-3.5 ${className}`}
    >
      {/* Header & Quota Status */}
      <div className="flex items-center justify-between border-b border-amber-200/60 pb-2.5">
        <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
          <Flame className="w-4 h-4 text-rose-600 shrink-0" />
          <span>Pilih Kuota Kuah</span>
          {packageName && (
            <span className="text-[11px] text-slate-500 font-normal">
              ({packageName})
            </span>
          )}
        </div>

        {/* Counter Badge */}
        <div
          data-testid="soup-quota-badge"
          className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border transition ${
            isComplete
              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
              : 'bg-amber-100 text-amber-900 border-amber-300'
          }`}
        >
          {allocatedSlots} / {quotaLimit} Slot
        </div>
      </div>

      {/* Info Status Banner */}
      <div className="text-[11px] flex items-center gap-1.5">
        {isComplete ? (
          <div className="flex items-center gap-1 text-emerald-700 font-bold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Kuota kuah terpenuhi! Siap dimasukkan ke keranjang.</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-amber-800 font-medium">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>
              Pilih <strong>{remainingSlots}</strong> slot kuah lagi untuk melanjutkan.
            </span>
          </div>
        )}
      </div>

      {/* Grid Soup Variants with Counter Buttons */}
      <div className="space-y-2">
        {availableSoups.map((variant) => {
          const count = activeSelection[variant] || 0;
          const isPlusDisabled = disabled || isQuotaReached;
          const isMinusDisabled = disabled || count <= 0;

          return (
            <div
              key={variant}
              data-testid={`soup-variant-row-${variant}`}
              className={`flex items-center justify-between p-2 rounded-xl border transition ${
                count > 0
                  ? 'bg-white border-amber-400/80 shadow-xs'
                  : 'bg-white/60 border-amber-100 hover:bg-white'
              }`}
            >
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-slate-900">{variant}</span>
                {count > 0 && (
                  <span className="block text-[10px] text-rose-600 font-mono font-bold">
                    {count} slot dipilih
                  </span>
                )}
              </div>

              {/* Counter Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid={`btn-minus-${variant}`}
                  aria-label={`Kurangi ${variant}`}
                  disabled={isMinusDisabled}
                  onClick={() => handleDecrement(variant)}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition border ${
                    isMinusDisabled
                      ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed opacity-50'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 cursor-pointer active:scale-95'
                  }`}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>

                <span
                  data-testid={`soup-count-${variant}`}
                  className="font-mono font-bold text-xs text-slate-900 w-5 text-center"
                >
                  {count}
                </span>

                <button
                  type="button"
                  data-testid={`btn-plus-${variant}`}
                  aria-label={`Tambah ${variant}`}
                  disabled={isPlusDisabled}
                  onClick={() => handleIncrement(variant)}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition border ${
                    isPlusDisabled
                      ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed opacity-50'
                      : 'bg-rose-600 text-white border-rose-600 hover:bg-rose-700 cursor-pointer active:scale-95 shadow-xs'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* CTA / Add to Cart Button (Locked until allocatedSlots === quotaLimit) */}
      {showSubmitButton && (
        <div className="pt-1.5">
          <button
            type="button"
            data-testid="soup-selector-submit-btn"
            disabled={!isComplete || disabled}
            onClick={handleSubmit}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs active:scale-98 ${
              isComplete && !disabled
                ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-rose-900/10'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-200'
            }`}
          >
            <span>{submitButtonText}</span>
            {isComplete && <CheckCircle2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}

export default SoupSlotSelector;

