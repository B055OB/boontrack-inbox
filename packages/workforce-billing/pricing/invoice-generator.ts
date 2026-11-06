/**
 * packages/workforce-billing/pricing/invoice-generator.ts
 * BWM Mock Invoice Generator & Immutable Snapshot Engine (RFC-BWM-014-V1)
 *
 * Requirements:
 * - subtotalCents (Integer)
 * - taxConfig (Isolated: zero-tax / reverse-charge VAT / standard GST)
 * - totalCents (subtotalCents + taxCents)
 * - pricingSnapshot: { policyVersion: "RFC-BWM-014-V1", timestamp: ISOString, appliedTiers: [...] }
 * - Immutable Snapshot: Invoice locks pricing rates permanently upon issuance.
 */

import {
  calculateMarginalProgressivePrice,
  AppliedTierBreakdown,
} from './marginal-pricing-engine';

export type TaxRegime = 'ZERO_TAX' | 'REVERSE_CHARGE_VAT' | 'STANDARD_GST';

export interface TaxConfiguration {
  regime: TaxRegime;
  rateBasisPoints: number; // e.g. 0 for 0%, 800 for 8.00% (rate / 10000)
  label: string;
  description: string;
  jurisdiction: string;
  reverseChargeNote?: string;
}

export const PRECONFIGURED_TAX_REGIMES: Record<TaxRegime, TaxConfiguration> = {
  ZERO_TAX: {
    regime: 'ZERO_TAX',
    rateBasisPoints: 0,
    label: 'Zero-rated Export (0%)',
    description: 'Cross-border B2B software export exempt from local sales tax',
    jurisdiction: 'GLOBAL',
  },
  REVERSE_CHARGE_VAT: {
    regime: 'REVERSE_CHARGE_VAT',
    rateBasisPoints: 0,
    label: 'Reverse Charge VAT (0%)',
    description: 'B2B cross-border transaction subject to reverse charge accounting',
    jurisdiction: 'EU/UK',
    reverseChargeNote: 'VAT to be accounted for by the recipient under Art. 196 EU VAT Directive',
  },
  STANDARD_GST: {
    regime: 'STANDARD_GST',
    rateBasisPoints: 800, // 8.00%
    label: 'Standard GST (8%)',
    description: 'Standard indirect goods & services tax',
    jurisdiction: 'MY',
  },
};

export interface MockInvoicePricingSnapshot {
  policyVersion: string;
  timestamp: string;
  appliedTiers: AppliedTierBreakdown[];
  baseQuantity: number;
  effectiveUnitPriceCents: number;
}

export interface MockInvoice {
  invoiceId: string;
  tenantId: string;
  agencyId: string;
  customerEmail: string;
  customerName: string;
  currency: 'USD';
  quantity: number;
  subtotalCents: number;
  taxConfig: TaxConfiguration;
  taxCents: number;
  totalCents: number;
  formattedSubtotalUsd: string;
  formattedTaxUsd: string;
  formattedTotalUsd: string;
  status: 'ISSUED' | 'PAID' | 'VOID';
  pricingSnapshot: MockInvoicePricingSnapshot;
  createdAt: string;
}

export interface CreateMockInvoiceParams {
  invoiceId?: string;
  tenantId: string;
  agencyId: string;
  customerEmail: string;
  customerName: string;
  quantity: number;
  taxRegime?: TaxRegime;
  customTaxConfig?: TaxConfiguration;
  policyVersion?: string;
}

/**
 * Deep freezes an object recursively to guarantee immutability.
 */
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as any)[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

/**
 * Generates an immutable Mock Invoice with pricing snapshot and isolated tax calculation.
 */
export function createMockInvoice(params: CreateMockInvoiceParams): MockInvoice {
  const {
    invoiceId = `INV-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
    tenantId,
    agencyId,
    customerEmail,
    customerName,
    quantity,
    taxRegime = 'ZERO_TAX',
    customTaxConfig,
    policyVersion = 'RFC-BWM-014-V1',
  } = params;

  // 1. Calculate Marginal Pricing in Integer Cents
  const pricingResult = calculateMarginalProgressivePrice(quantity, policyVersion);
  const subtotalCents = pricingResult.subtotalCents;

  // 2. Resolve Tax Configuration
  const taxConfig: TaxConfiguration = customTaxConfig || PRECONFIGURED_TAX_REGIMES[taxRegime] || PRECONFIGURED_TAX_REGIMES.ZERO_TAX;

  // 3. Calculate Tax in Integer Cents (No Float Drift)
  const taxCents = Math.round((subtotalCents * taxConfig.rateBasisPoints) / 10000);
  const totalCents = subtotalCents + taxCents;

  const now = new Date().toISOString();

  // 4. Construct Pricing Snapshot
  const pricingSnapshot: MockInvoicePricingSnapshot = {
    policyVersion: pricingResult.policyVersion,
    timestamp: now,
    appliedTiers: pricingResult.appliedTiers,
    baseQuantity: quantity,
    effectiveUnitPriceCents: pricingResult.effectiveUnitPriceCents,
  };

  const invoice: MockInvoice = {
    invoiceId,
    tenantId,
    agencyId,
    customerEmail,
    customerName,
    currency: 'USD',
    quantity,
    subtotalCents,
    taxConfig,
    taxCents,
    totalCents,
    formattedSubtotalUsd: `$${(subtotalCents / 100).toFixed(2)}`,
    formattedTaxUsd: `$${(taxCents / 100).toFixed(2)}`,
    formattedTotalUsd: `$${(totalCents / 100).toFixed(2)}`,
    status: 'ISSUED',
    pricingSnapshot,
    createdAt: now,
  };

  // 5. Enforce Immutability via Deep Freeze
  return deepFreeze(invoice);
}

