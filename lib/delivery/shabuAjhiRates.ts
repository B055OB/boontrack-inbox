/**
 * lib/delivery/shabuAjhiRates.ts
 *
 * Dedicated Shabu Ajhi Delivery Rates & Extreme Distance Surcharge Resolver.
 *
 * Implements:
 * 1. 13-Tier Base Rate Lookup (0.0 - 26.0 KM) for round-trip (PP) catering delivery.
 * 2. Extreme Distance Surcharge (> 26 KM):
 *    - Removes hard cutoff/blocking when internal driver is available (hasInternalDriver === true).
 *    - excessKm = Math.ceil(distanceKm - 26)
 *    - totalFee = baseTier13Fee (Rp 115.000) + (excessKm * Rp 7.000)
 *    - Returns provider: 'INTERNAL_DRIVER', requiresPickup: true, and surcharge breakdown.
 *    - Fallback to Lalamove manual occurs ONLY when internal driver is explicitly unavailable (hasInternalDriver === false).
 * 3. Package combination fleet multiplier integration (Oishi + Mabar A -> 2.0x).
 */

import {
  SHABU_AJHI_RATE_TIERS,
  MAX_REGULAR_DISTANCE_KM,
  getBaseRate,
  CateringItem,
  countCateringPackages,
  SHABU_AJHI_HANDOVER_PHONE,
} from '@/lib/shipping/deliveryCalculator';
import { evaluateFleetRules } from '@/lib/cart/fleetRules';

export const EXTREME_DISTANCE_SURCHARGE_PER_KM = 7000;
export const BASE_TIER_13_FEE = 115000; // Tarif dasar tier 13 (24.1 - 26.0 KM)

export interface ShabuAjhiRateOptions {
  hasInternalDriver?: boolean;
  items?: CateringItem[];
  totalPackages?: number;
}

export interface SurchargeBreakdown {
  baseTier13Fee: number;
  excessKm: number;
  ratePerKm: number;
  surchargeFee: number;
}

export interface ShabuAjhiRateResult {
  distanceKm: number;
  baseFee: number;
  surchargeFee: number;
  excessKm: number;
  multiplier: number;
  totalFee: number;
  provider: 'INTERNAL_DRIVER' | 'LALAMOVE_MANUAL';
  requiresPickup: boolean;
  requires_pickup: boolean;
  isDeliverable: boolean;
  outOfRange: boolean;
  fleetType: 'motor' | 'car' | 'custom' | 'none';
  fleetDescription: string;
  notes?: string;
  surchargeBreakdown?: SurchargeBreakdown;
  handoverContact: string;
}

/**
 * Resolves delivery fee for Shabu Ajhi catering orders with extreme distance (> 26 km) surcharge support.
 */
export function calculateShabuAjhiRate(
  distanceKm: number,
  options?: ShabuAjhiRateOptions
): ShabuAjhiRateResult {
  const hasInternalDriver = options?.hasInternalDriver ?? true;
  const items = options?.items;
  const totalPackages =
    typeof options?.totalPackages === 'number'
      ? options.totalPackages
      : countCateringPackages(items);

  // Validate negative or NaN distance
  if (typeof distanceKm !== 'number' || isNaN(distanceKm) || distanceKm < 0) {
    return {
      distanceKm: 0,
      baseFee: 0,
      surchargeFee: 0,
      excessKm: 0,
      multiplier: 0,
      totalFee: 0,
      provider: 'INTERNAL_DRIVER',
      requiresPickup: true,
      requires_pickup: true,
      isDeliverable: false,
      outOfRange: false,
      fleetType: 'none',
      fleetDescription: 'Jarak Tidak Valid',
      notes: 'Jarak pengiriman tidak valid.',
      handoverContact: SHABU_AJHI_HANDOVER_PHONE,
    };
  }

  // Evaluate fleet multiplier & combination rules
  const fleet = evaluateFleetRules(totalPackages, items);

  // CASE 1: Standard Range (<= 26.0 KM)
  if (distanceKm <= MAX_REGULAR_DISTANCE_KM) {
    const baseRate = getBaseRate(distanceKm) ?? 0;
    const totalFee = fleet.requiresManualCoordination
      ? 0
      : Math.round(baseRate * fleet.multiplier);

    return {
      distanceKm,
      baseFee: baseRate,
      surchargeFee: 0,
      excessKm: 0,
      multiplier: fleet.multiplier,
      totalFee,
      provider: 'INTERNAL_DRIVER',
      requiresPickup: true,
      requires_pickup: true,
      isDeliverable: true,
      outOfRange: false,
      fleetType: fleet.fleetType,
      fleetDescription: fleet.fleetDescription,
      handoverContact: SHABU_AJHI_HANDOVER_PHONE,
    };
  }

  // CASE 2: Extreme Range (> 26.0 KM)
  // If internal driver is available -> apply surcharge Rp 7.000/km
  if (hasInternalDriver) {
    const excessKm = Math.ceil(distanceKm - MAX_REGULAR_DISTANCE_KM);
    const surchargeFee = excessKm * EXTREME_DISTANCE_SURCHARGE_PER_KM;
    const baseFeeWithSurcharge = BASE_TIER_13_FEE + surchargeFee;
    const totalFee = fleet.requiresManualCoordination
      ? 0
      : Math.round(baseFeeWithSurcharge * fleet.multiplier);

    const notes = `Jarak ${distanceKm.toFixed(1)} km (> 26 km) dikenakan surcharge jarak ekstrem Rp ${EXTREME_DISTANCE_SURCHARGE_PER_KM.toLocaleString('id-ID')}/km (+${excessKm} km = Rp ${surchargeFee.toLocaleString('id-ID')}). Total ongkir PP: Rp ${totalFee.toLocaleString('id-ID')}.`;

    return {
      distanceKm,
      baseFee: BASE_TIER_13_FEE,
      surchargeFee,
      excessKm,
      multiplier: fleet.multiplier,
      totalFee,
      provider: 'INTERNAL_DRIVER',
      requiresPickup: true,
      requires_pickup: true,
      isDeliverable: true,
      outOfRange: false,
      fleetType: fleet.fleetType,
      fleetDescription: fleet.fleetDescription,
      notes,
      surchargeBreakdown: {
        baseTier13Fee: BASE_TIER_13_FEE,
        excessKm,
        ratePerKm: EXTREME_DISTANCE_SURCHARGE_PER_KM,
        surchargeFee,
      },
      handoverContact: SHABU_AJHI_HANDOVER_PHONE,
    };
  }

  // CASE 3: Extreme Range (> 26.0 KM) & Internal driver explicitly unavailable -> Lalamove manual
  return {
    distanceKm,
    baseFee: 0,
    surchargeFee: 0,
    excessKm: Math.ceil(distanceKm - MAX_REGULAR_DISTANCE_KM),
    multiplier: 0,
    totalFee: 0,
    provider: 'LALAMOVE_MANUAL',
    requiresPickup: true,
    requires_pickup: true,
    isDeliverable: false,
    outOfRange: true,
    fleetType: 'custom',
    fleetDescription: 'Pengalihan Lalamove Manual (Armada Internal Tidak Tersedia)',
    notes: 'Armada internal tidak tersedia untuk jarak > 26 km. Pengalihan ke Lalamove manual.',
    handoverContact: SHABU_AJHI_HANDOVER_PHONE,
  };
}

