'use client';

import React, { useCallback } from 'react';
import { CreditCard, Lock, ShieldCheck, CheckCircle2, Clock } from 'lucide-react';
import {
  ProductItem,
  ProductPaymentScheme,
  PaymentSettlementTrigger,
  PaymentOptionsConfig,
} from '@/lib/product-catalog';

export interface PaymentOptionsConfigSectionProps {
  productForm: ProductItem;
  setProductForm: React.Dispatch<React.SetStateAction<ProductItem>>;
  disabled?: boolean;
}

export const STAGE_B1_ALLOWED_SCHEMES: readonly ProductPaymentScheme[] = ['FULL_PREPAID'] as const;
export const STAGE_B1_PREVIEW_TRIGGERS: readonly PaymentSettlementTrigger[] = [
  'FULFILLMENT_HANDOVER',
  'EVENT_RELATIVE_24H',
] as const;

export default function PaymentOptionsConfigSection({
  productForm: _productForm,
  setProductForm: _setProductForm,
  disabled = false,
}: PaymentOptionsConfigSectionProps) {
  const handleSelectScheme = useCallback((targetScheme: string) => {
    // Stage B1 Strict UI Shell: ONLY 'FULL_PREPAID' is active.
    // Pure UI shell: zero unratified persistence into metadata/fulfillment_metadata.
    if (targetScheme !== 'FULL_PREPAID') {
      return;
    }
  }, []);

  return (
    <div
      data-testid="payment-options-config-section"
      className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white text-xs">
            <CreditCard className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Skema Pembayaran Produk (Payment Policy)</span>
            <span
              data-testid="badge-full-prepaid-active"
              className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full"
            >
              FULL_PREPAID Aktif
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            Atur skema penagihan pesanan produk ini. Pada Stage B1, hanya pembayaran penuh di awal (FULL_PREPAID) yang diizinkan.
          </p>
        </div>
      </div>

      {/* Options Cards */}
      <div className="space-y-2.5" role="radiogroup" aria-label="Skema Pembayaran">
        {/* 1. FULL_PREPAID (Active, Selected by default, Only Selectable) */}
        <div
          data-testid="scheme-card-full-prepaid"
          onClick={() => handleSelectScheme('FULL_PREPAID')}
          className="p-3.5 rounded-xl border transition cursor-pointer bg-blue-50/70 dark:bg-blue-950/40 border-blue-500 ring-2 ring-blue-500/20 text-blue-950 dark:text-blue-100 shadow-xs"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <input
                type="radio"
                id="scheme-full-prepaid"
                name="payment_scheme"
                value="FULL_PREPAID"
                checked={true}
                readOnly
                disabled={disabled}
                data-testid="input-scheme-full-prepaid"
                className="mt-0.5 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
              />
              <div>
                <label
                  htmlFor="scheme-full-prepaid"
                  className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Bayar Penuh di Awal (FULL_PREPAID)</span>
                  <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/80 px-2 py-0.2 rounded-full">
                    Aktif (Default)
                  </span>
                </label>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  Pembeli membayar 100% lunas di muka via QRIS / Transfer Bank sebelum pesanan diproses atau dikirimkan.
                </p>
              </div>
            </div>
            <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          </div>
        </div>

        {/* 2. DP_PREPAID (Locked / Gated by CORE-PAY-DP) */}
        <div
          data-testid="scheme-card-dp-prepaid"
          className="p-3.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700/80 bg-slate-100/60 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-80"
          aria-disabled="true"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <input
                type="radio"
                id="scheme-dp-prepaid"
                name="payment_scheme"
                value="DP_PREPAID"
                checked={false}
                disabled={true}
                aria-disabled="true"
                data-testid="input-scheme-dp-prepaid"
                className="mt-0.5 text-slate-400 cursor-not-allowed h-4 w-4"
              />
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <label
                    htmlFor="scheme-dp-prepaid"
                    className="font-bold text-xs text-slate-500 dark:text-slate-400 cursor-not-allowed"
                  >
                    Uang Muka / Bertahap (DP_PREPAID)
                  </label>
                  <span
                    data-testid="gate-badge-dp"
                    className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/80"
                  >
                    <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    <span>CORE-PAY-DP Gated</span>
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Skema uang muka (DP) dengan pelunasan bertahap. Fitur ini terkunci dan memerlukan aktivasi modul CORE-PAY-DP.
                </p>

                {/* Preview Settlement Triggers: FULFILLMENT_HANDOVER and EVENT_RELATIVE_24H ONLY (NO 7-day option) */}
                <div
                  data-testid="preview-triggers-dp"
                  className="pt-1.5 border-t border-slate-200/80 dark:border-slate-800 space-y-1"
                >
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                    Trigger Pelunasan Tersedia (Preview):
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      data-testid="trigger-fulfillment-handover"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-semibold"
                    >
                      <Clock className="w-2.5 h-2.5 text-slate-400" />
                      <span>FULFILLMENT_HANDOVER (Pelunasan saat serah terima)</span>
                    </span>
                    <span
                      data-testid="trigger-event-relative-24h"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-semibold"
                    >
                      <Clock className="w-2.5 h-2.5 text-slate-400" />
                      <span>EVENT_RELATIVE_24H (Pelunasan H-24 Jam sebelum event)</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <Lock className="w-4 h-4 text-slate-400 dark:text-slate-600 shrink-0 mt-0.5" />
          </div>
        </div>

        {/* 3. COD_FULL (Locked / Gated by CORE-COD) */}
        <div
          data-testid="scheme-card-cod-full"
          className="p-3.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700/80 bg-slate-100/60 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-80"
          aria-disabled="true"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <input
                type="radio"
                id="scheme-cod-full"
                name="payment_scheme"
                value="COD_FULL"
                checked={false}
                disabled={true}
                aria-disabled="true"
                data-testid="input-scheme-cod-full"
                className="mt-0.5 text-slate-400 cursor-not-allowed h-4 w-4"
              />
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <label
                    htmlFor="scheme-cod-full"
                    className="font-bold text-xs text-slate-500 dark:text-slate-400 cursor-not-allowed"
                  >
                    Bayar di Tempat (COD_FULL)
                  </label>
                  <span
                    data-testid="gate-badge-cod"
                    className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/80"
                  >
                    <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    <span>CORE-COD Gated</span>
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Skema bayar tunai di tempat saat barang/layanan diterima. Fitur ini terkunci dan memerlukan aktivasi modul CORE-COD.
                </p>

                {/* Preview Settlement Triggers: FULFILLMENT_HANDOVER ONLY (NO 7-day option) */}
                <div
                  data-testid="preview-triggers-cod"
                  className="pt-1.5 border-t border-slate-200/80 dark:border-slate-800 space-y-1"
                >
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                    Trigger Pelunasan Tersedia (Preview):
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      data-testid="trigger-fulfillment-handover-cod"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-semibold"
                    >
                      <Clock className="w-2.5 h-2.5 text-slate-400" />
                      <span>FULFILLMENT_HANDOVER (Pelunasan saat serah terima fisik/kurir)</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <Lock className="w-4 h-4 text-slate-400 dark:text-slate-600 shrink-0 mt-0.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
