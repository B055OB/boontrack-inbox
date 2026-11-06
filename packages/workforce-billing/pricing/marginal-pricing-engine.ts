/**
 * packages/workforce-billing/pricing/marginal-pricing-engine.ts
 * BWM Marginal Progressive Pricing Engine (RFC-BWM-014-V1)
 *
 * Rules:
 * - Integer-cents arithmetic only (Math.round / BigInt / Decimal-safe).
 * - Zero floating-point drift for financial computations.
 * - Tiers:
 *   * Tier 1 (Passes 1–49)   : 450 cents ($4.50 USD)
 *   * Tier 2 (Passes 50–199) : 380 cents ($3.80 USD)
 *   * Tier 3 (Passes 200+)   : 320 cents ($3.20 USD)
 */

export interface MarginalTierDefinition {
  tier: number;
  name: string;
  fromQuantity: number;
  toQuantity: number;
  unitPriceCents: number;
}

export const RFC_BWM_014_V1_TIERS: MarginalTierDefinition[] = [
  {
    tier: 1,
    name: 'Standard Fleet Tier',
    fromQuantity: 1,
    toQuantity: 49,
    unitPriceCents: 450, // $4.50 USD
  },
  {
    tier: 2,
    name: 'Mid-Scale Fleet Tier',
    fromQuantity: 50,
    toQuantity: 199,
    unitPriceCents: 380, // $3.80 USD
  },
  {
    tier: 3,
    name: 'Enterprise Fleet Tier',
    fromQuantity: 200,
    toQuantity: Infinity,
    unitPriceCents: 320, // $3.20 USD
  },
];

export interface AppliedTierBreakdown {
  tier: number;
  name: string;
  range: string;
  unitPriceCents: number;
  unitPriceUsd: string;
  quantityInTier: number;
  tierSubtotalCents: number;
  tierSubtotalUsd: string;
}

export interface PricingCalculationResult {
  policyVersion: string;
  quantity: number;
  subtotalCents: number;
  subtotalUsd: string;
  effectiveUnitPriceCents: number;
  effectiveUnitPriceUsd: string;
  appliedTiers: AppliedTierBreakdown[];
  calculatedAt: string;
}

/**
 * Computes marginal progressive tiered pricing using integer-cents arithmetic.
 *
 * @param quantity Number of passes requested (must be a positive integer)
 * @param policyVersion Pricing policy identifier (default: "RFC-BWM-014-V1")
 * @returns PricingCalculationResult with integer cents and human-readable USD strings
 */
export function calculateMarginalProgressivePrice(
  quantity: number,
  policyVersion: string = 'RFC-BWM-014-V1'
): PricingCalculationResult {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`INVALID_QUANTITY: Quantity must be a positive integer, received: ${quantity}`);
  }

  let remaining = quantity;
  let subtotalCents = 0;
  const appliedTiers: AppliedTierBreakdown[] = [];

  for (const tier of RFC_BWM_014_V1_TIERS) {
    if (remaining <= 0) break;

    const tierCapacity =
      tier.toQuantity === Infinity
        ? remaining
        : tier.toQuantity - tier.fromQuantity + 1;

    const qtyInTier = Math.min(remaining, tierCapacity);

    if (qtyInTier > 0) {
      // Strict Integer Arithmetic
      const tierSubtotalCents = Math.round(qtyInTier * tier.unitPriceCents);
      subtotalCents += tierSubtotalCents;
      remaining -= qtyInTier;

      appliedTiers.push({
        tier: tier.tier,
        name: tier.name,
        range: tier.toQuantity === Infinity ? `${tier.fromQuantity}+` : `${tier.fromQuantity}-${tier.toQuantity}`,
        unitPriceCents: tier.unitPriceCents,
        unitPriceUsd: `$${(tier.unitPriceCents / 100).toFixed(2)}`,
        quantityInTier: qtyInTier,
        tierSubtotalCents,
        tierSubtotalUsd: `$${(tierSubtotalCents / 100).toFixed(2)}`,
      });
    }
  }

  const effectiveUnitPriceCents = Math.round(subtotalCents / quantity);

  return {
    policyVersion,
    quantity,
    subtotalCents,
    subtotalUsd: `$${(subtotalCents / 100).toFixed(2)}`,
    effectiveUnitPriceCents,
    effectiveUnitPriceUsd: `$${(effectiveUnitPriceCents / 100).toFixed(2)}`,
    appliedTiers,
    calculatedAt: new Date().toISOString(),
  };
}

