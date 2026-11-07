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
  hasEquipmentItems,
  isCateringPackage,
  calculateShabuAjhiOneWayRate,
  parseCoordinatesFromInput,
  SHABU_AJHI_HANDOVER_PHONE,
} from '@/lib/shipping/deliveryCalculator';
import { evaluateFleetRules } from '@/lib/cart/fleetRules';

export { parseCoordinatesFromInput };

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

  // 1a. Menu Kategori Stall (Live Cooking Stall) Check -> Ongkir Rp 0 (All-in)
  const isStallOrder = Boolean(
    items &&
      items.length > 0 &&
      items.some((it) => {
        const cat = (it.category || it.category_name || '').toLowerCase();
        const nm = (it.name || '').toLowerCase();
        return (
          cat.includes('stall') ||
          cat.includes('live cooking') ||
          nm.includes('stall') ||
          nm.includes('live cooking')
        );
      })
  );
  if (isStallOrder) {
    return {
      distanceKm,
      baseFee: 0,
      surchargeFee: 0,
      excessKm: 0,
      multiplier: 1.0,
      totalFee: 0,
      provider: 'INTERNAL_DRIVER',
      requiresPickup: true,
      requires_pickup: true,
      isDeliverable: true,
      outOfRange: false,
      fleetType: 'custom',
      fleetDescription: 'Layanan Live Cooking Stall (All-in Termasuk Chef & Alat)',
      notes: 'Ongkir Gratis / All-in pada Paket Live Cooking Stall.',
      handoverContact: SHABU_AJHI_HANDOVER_PHONE,
    };
  }

  // 1b. ALACARTE / NON-EQUIPMENT 1-WAY MOTORCYCLE DELIVERY CHECK
  const hasEquipment = hasEquipmentItems(items);
  if (items && items.length > 0 && !hasEquipment) {
    const oneWayFee = calculateShabuAjhiOneWayRate(distanceKm);
    return {
      distanceKm,
      baseFee: oneWayFee,
      surchargeFee: 0,
      excessKm: 0,
      multiplier: 1.0,
      totalFee: oneWayFee,
      provider: 'INTERNAL_DRIVER',
      requiresPickup: false,
      requires_pickup: false,
      isDeliverable: true,
      outOfRange: false,
      fleetType: 'motor',
      fleetDescription: 'Kurir Instan 1 Arah (Pengantaran Menu Tanpa Alat)',
      notes: 'Pengantaran 1 arah menu alacarte/makanan tanpa peminjaman alat masak.',
      handoverContact: SHABU_AJHI_HANDOVER_PHONE,
    };
  }

  // Evaluate fleet multiplier & combination rules
  const fleet = evaluateFleetRules(totalPackages, items);

  // 1c. Radius <= 3.0 KM dengan Minimal 1 Paket Katering -> Free Ongkir (Rp 0)
  const hasCateringPackage = Boolean(items && items.length > 0 && items.some((it) => isCateringPackage(it)));
  if (distanceKm <= 3.0 && hasCateringPackage) {
    return {
      distanceKm,
      baseFee: 0,
      surchargeFee: 0,
      excessKm: 0,
      multiplier: fleet.multiplier,
      totalFee: 0,
      provider: 'INTERNAL_DRIVER',
      requiresPickup: true,
      requires_pickup: true,
      isDeliverable: true,
      outOfRange: false,
      fleetType: fleet.fleetType,
      fleetDescription: 'Kurir Dapur Instan (Gratis Ongkir Khusus Paket <= 3 km)',
      notes: 'Gratis ongkir antar-jemput alat untuk paket katering dalam radius 3.0 km.',
      handoverContact: SHABU_AJHI_HANDOVER_PHONE,
    };
  }

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

