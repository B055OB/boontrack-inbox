/**
 * lib/cart/fleetRules.ts
 *
 * Fleet Multiplier & Package Combination Matrix for Shabu Ajhi Catering.
 *
 * Implements:
 * 1. Specific 2-Package Combination Evaluation:
 *    - Oishi + Mabar A -> Multiplier 2.0x (Requires 2 separate boxes/motorbikes due to dual pot + extra grill volume).
 *    - Oishi + Kimochi -> Multiplier 1.0x (Normal)
 *    - Oishi + Ichiban -> Multiplier 1.0x (Normal)
 *    - Oishi + Sakura  -> Multiplier 1.0x (Normal)
 *    - Oishi + Mabar B -> Multiplier 1.0x (Normal)
 *    - Oishi + Mabar C -> Multiplier 1.0x (Normal)
 * 2. General Quantity-Based Multiplier (Fallback):
 *    - <= 2 packages: 1.0x (1 Motor Armada Reguler)
 *    - 3 packages   : 2.0x (2 Motor Armada Reguler)
 *    - 4 packages   : 2.5x (Armada Mobil / Trip Ganda)
 *    - >= 5 packages: requiresManualCoordination: true (Handover to Human CS / Live Cooking)
 */

import { CateringItem, FleetMultiplierResult } from '@/lib/shipping/deliveryCalculator';

export function normalizePackageName(name?: string): string {
  return (name || '').toLowerCase().trim();
}

export interface PackageCombinationAnalysis {
  hasOishi: boolean;
  hasMabarA: boolean;
  hasKimochi: boolean;
  hasIchiban: boolean;
  hasSakura: boolean;
  hasMabarB: boolean;
  hasMabarC: boolean;
  isOishiAndMabarA: boolean;
}

/**
 * Analyzes items to detect package varieties present in the cart.
 */
export function analyzePackageCombinations(items?: CateringItem[]): PackageCombinationAnalysis {
  let hasOishi = false;
  let hasMabarA = false;
  let hasKimochi = false;
  let hasIchiban = false;
  let hasSakura = false;
  let hasMabarB = false;
  let hasMabarC = false;

  if (Array.isArray(items)) {
    for (const item of items) {
      if (item.isAddon || item.is_addon) continue;
      const normalized = normalizePackageName(item.name);

      if (normalized.includes('oishi')) hasOishi = true;
      if (normalized.includes('mabar a') || normalized.includes('mabar-a')) hasMabarA = true;
      if (normalized.includes('kimochi')) hasKimochi = true;
      if (normalized.includes('ichiban')) hasIchiban = true;
      if (normalized.includes('sakura')) hasSakura = true;
      if (normalized.includes('mabar b') || normalized.includes('mabar-b')) hasMabarB = true;
      if (normalized.includes('mabar c') || normalized.includes('mabar-c')) hasMabarC = true;
    }
  }

  return {
    hasOishi,
    hasMabarA,
    hasKimochi,
    hasIchiban,
    hasSakura,
    hasMabarB,
    hasMabarC,
    isOishiAndMabarA: hasOishi && hasMabarA,
  };
}

/**
 * Evaluates fleet multiplier considering both total package count and specific item combinations.
 */
export function evaluateFleetRules(
  totalPackages: number,
  items?: CateringItem[]
): FleetMultiplierResult {
  const count = Math.max(0, Math.floor(totalPackages));

  if (count === 0) {
    return {
      multiplier: 1.0,
      fleetType: 'motor',
      fleetDescription: '1 Motor Armada Reguler',
      requiresManualCoordination: false,
    };
  }

  // 1. Check specific package combination matrix for small orders (<= 2 packages)
  if (count <= 2 && items && items.length > 0) {
    const analysis = analyzePackageCombinations(items);
    if (analysis.isOishiAndMabarA) {
      return {
        multiplier: 2.0,
        fleetType: 'motor',
        fleetDescription: '2 Motor / 2 Boks Terpisah (Kombinasi Oishi + Mabar A)',
        requiresManualCoordination: false,
      };
    }
  }

  // 2. Standard Count-Based Multiplier
  if (count <= 2) {
    return {
      multiplier: 1.0,
      fleetType: 'motor',
      fleetDescription: '1 Motor Armada Reguler',
      requiresManualCoordination: false,
    };
  }

  if (count === 3) {
    return {
      multiplier: 2.0,
      fleetType: 'motor',
      fleetDescription: '2 Motor Armada Reguler',
      requiresManualCoordination: false,
    };
  }

  if (count === 4) {
    return {
      multiplier: 2.5,
      fleetType: 'car',
      fleetDescription: 'Armada Mobil / Trip Ganda',
      requiresManualCoordination: false,
    };
  }

  // >= 5 packages: Live Cooking & Event Catering handoff
  return {
    multiplier: 0,
    fleetType: 'custom',
    fleetDescription: 'Armada Khusus (Koordinasi Jadwal & Unit CS)',
    requiresManualCoordination: true,
  };
}
