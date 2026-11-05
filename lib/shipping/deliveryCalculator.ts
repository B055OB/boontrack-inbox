/**
 * lib/shipping/deliveryCalculator.ts
 *
 * Shabu Ajhi Round-Trip (PP) Delivery Fee Engine, Multiplier, and Capacity Boundary.
 *
 * Implements:
 * 1. 13-tier base rate table for round-trip catering deliveries (1 - 26 KM).
 * 2. Boundary enforcement (> 26.0 KM -> outOfRange: true, isDeliverable: false).
 * 3. Fleet multiplier based on package quantity (Oishii, Ichiban, Mabar A, Mabar B, etc.):
 *    - <= 2 packages: 1.0x (1 Motor Armada Reguler)
 *    - 3 packages   : 2.0x (2 Motor Armada Reguler)
 *    - 4 packages   : 2.5x (Armada Mobil / Trip Ganda)
 *    - >= 5 packages: requiresManualCoordination: true (Handover to Human CS)
 * 4. Mandatory requires_pickup: true attribute (dirty cookware retrieval).
 * 5. Direct WhatsApp handoff URL builder for large party orders (>= 5 packages).
 */

import { evaluateFleetRules } from '@/lib/cart/fleetRules';

export interface DeliveryRateTier {
  minKm: number;
  maxKm: number;
  price: number;
}

/**
 * 13 Base Rate Tiers (Round Trip / PP 1 - 26 KM)
 */
export const SHABU_AJHI_RATE_TIERS: ReadonlyArray<DeliveryRateTier> = [
  { minKm: 0.0, maxKm: 2.0, price: 25000 },
  { minKm: 2.1, maxKm: 4.0, price: 30000 },
  { minKm: 4.1, maxKm: 6.0, price: 38000 },
  { minKm: 6.1, maxKm: 8.0, price: 45000 },
  { minKm: 8.1, maxKm: 10.0, price: 53000 },
  { minKm: 10.1, maxKm: 12.0, price: 60000 },
  { minKm: 12.1, maxKm: 14.0, price: 68000 },
  { minKm: 14.1, maxKm: 16.0, price: 75000 },
  { minKm: 16.1, maxKm: 18.0, price: 83000 },
  { minKm: 18.1, maxKm: 20.0, price: 90000 },
  { minKm: 20.1, maxKm: 22.0, price: 98000 },
  { minKm: 22.1, maxKm: 24.0, price: 105000 },
  { minKm: 24.1, maxKm: 26.0, price: 115000 },
];

export const MAX_REGULAR_DISTANCE_KM = 26.0;

export const OUT_OF_RANGE_ERROR_MESSAGE =
  'Alamat di luar area jangkauan armada reguler (Maks. 26 km). Silakan hubungi Admin CS untuk pengecekan tarif kurir khusus.';

export const LARGE_ORDER_WARNING_MESSAGE =
  'Pesanan di atas 4 paket memerlukan armada khusus dan koordinasi jadwal pengantaran.';

export const SHABU_AJHI_HANDOVER_PHONE = '6289617799878';

export interface CateringItem {
  name: string;
  qty: number;
  price?: number;
  isAddon?: boolean;
  is_addon?: boolean;
  soupVariant?: string;
  selectedSoups?: Record<string, number>;
}

export interface FleetMultiplierResult {
  multiplier: number;
  fleetType: 'motor' | 'car' | 'custom' | 'none';
  fleetDescription: string;
  requiresManualCoordination: boolean;
}

export interface DeliveryCalculationParams {
  distanceKm: number;
  items?: CateringItem[];
  totalPackages?: number;
  hasInternalDriver?: boolean;
}

export interface DeliveryCalculationResult {
  isDeliverable: boolean;
  outOfRange: boolean;
  distanceKm: number;
  baseFee: number;
  multiplier: number;
  totalFee: number;
  totalPackages: number;
  requiresManualCoordination: boolean;
  requires_pickup: boolean;
  fleetType: 'motor' | 'car' | 'custom' | 'none';
  fleetDescription: string;
  error?: string;
  notes?: string;
  handoverContact: string;
  provider?: 'INTERNAL_DRIVER' | 'LALAMOVE_MANUAL';
  surchargeFee?: number;
  excessKm?: number;
}

/**
 * Returns the base delivery rate for a given distance in KM (0 to 26 KM).
 * Returns null if distance is invalid or exceeds 26.0 KM.
 */
export function getBaseRate(distanceKm: number): number | null {
  if (typeof distanceKm !== 'number' || isNaN(distanceKm) || distanceKm < 0) {
    return null;
  }
  if (distanceKm > MAX_REGULAR_DISTANCE_KM) {
    return null;
  }

  for (const tier of SHABU_AJHI_RATE_TIERS) {
    if (distanceKm <= tier.maxKm) {
      return tier.price;
    }
  }

  return null;
}

/**
 * Checks if an item is a main catering package (e.g. Oishii, Ichiban, Mabar A, Mabar B).
 * Excludes add-ons (extra beef, extra soup, vegetables, drinks).
 */
export function isCateringPackage(item: CateringItem): boolean {
  if (item.isAddon === true || item.is_addon === true) {
    return false;
  }

  const normalized = (item.name || '').toLowerCase().trim();
  if (!normalized) return false;

  // Exclude explicit addon keywords
  if (
    normalized.startsWith('ekstra') ||
    normalized.startsWith('extra') ||
    normalized.startsWith('addon') ||
    normalized.startsWith('tambahan') ||
    normalized.includes('sayur campur') ||
    normalized.includes('daging slice')
  ) {
    return false;
  }

  // Count recognized catering packages or anything with 'paket'
  if (
    normalized.includes('oishi') ||
    normalized.includes('oishii') ||
    normalized.includes('ichiban') ||
    normalized.includes('mabar') ||
    normalized.includes('paket') ||
    normalized.includes('combo') ||
    normalized.includes('shabu') ||
    normalized.includes('suki') ||
    normalized.includes('bbq') ||
    normalized.includes('grill')
  ) {
    return true;
  }

  return false;
}

/**
 * Counts the total number of catering packages from an items list or number.
 */
export function countCateringPackages(
  itemsOrCount?: CateringItem[] | number
): number {
  if (typeof itemsOrCount === 'number') {
    return Math.max(0, Math.floor(itemsOrCount));
  }
  if (!Array.isArray(itemsOrCount)) {
    return 0;
  }

  return itemsOrCount.reduce((sum, item) => {
    if (isCateringPackage(item)) {
      return sum + (Number(item.qty) || 1);
    }
    return sum;
  }, 0);
}

/**
 * Resolves fleet multiplier based on total catering package quantity:
 * - <= 2 packages: 1.0x (1 Motor Armada Reguler)
 * - 3 packages   : 2.0x (2 Motor Armada Reguler)
 * - 4 packages   : 2.5x (Armada Mobil / Trip Ganda)
 * - >= 5 packages: requiresManualCoordination: true
 */
/**
 * Resolves fleet multiplier based on total catering package quantity and package combinations:
 * - Specific combination: Oishi + Mabar A -> 2.0x (2 motor / 2 boks terpisah)
 * - <= 2 packages: 1.0x (1 Motor Armada Reguler)
 * - 3 packages   : 2.0x (2 Motor Armada Reguler)
 * - 4 packages   : 2.5x (Armada Mobil / Trip Ganda)
 * - >= 5 packages: requiresManualCoordination: true (Handover to Human CS / Live Cooking)
 */
export function getFleetMultiplier(
  totalPackages: number,
  items?: CateringItem[]
): FleetMultiplierResult {
  return evaluateFleetRules(totalPackages, items);
}

/**
 * Main delivery fee calculation entrypoint.
 *
 * Supports both function overloads:
 * - calculateDeliveryFee(distanceKm, itemsOrCount)
 * - calculateDeliveryFee({ distanceKm, items, totalPackages, hasInternalDriver })
 */
export function calculateDeliveryFee(
  paramsOrDistance: DeliveryCalculationParams | number,
  optionalItemsOrCount?: CateringItem[] | number
): DeliveryCalculationResult {
  let distanceKm: number;
  let totalPackages: number;
  let items: CateringItem[] | undefined;
  let hasInternalDriver: boolean | undefined;

  if (typeof paramsOrDistance === 'number') {
    distanceKm = paramsOrDistance;
    if (Array.isArray(optionalItemsOrCount)) {
      items = optionalItemsOrCount;
      totalPackages = countCateringPackages(optionalItemsOrCount);
    } else {
      totalPackages = countCateringPackages(optionalItemsOrCount);
    }
  } else {
    distanceKm = paramsOrDistance.distanceKm;
    items = paramsOrDistance.items;
    hasInternalDriver = paramsOrDistance.hasInternalDriver;
    if (typeof paramsOrDistance.totalPackages === 'number') {
      totalPackages = Math.max(0, Math.floor(paramsOrDistance.totalPackages));
    } else {
      totalPackages = countCateringPackages(paramsOrDistance.items);
    }
  }

  // 1. Boundary & Radius Rejection Check
  if (typeof distanceKm !== 'number' || isNaN(distanceKm) || distanceKm < 0) {
    return {
      isDeliverable: false,
      outOfRange: false,
      distanceKm: 0,
      baseFee: 0,
      multiplier: 0,
      totalFee: 0,
      totalPackages,
      requiresManualCoordination: true,
      requires_pickup: true,
      fleetType: 'none',
      fleetDescription: 'Jarak Tidak Valid',
      error: 'Jarak pengiriman tidak valid.',
      handoverContact: SHABU_AJHI_HANDOVER_PHONE,
    };
  }

  // Extreme distance surcharge (> 26.0 KM) when internal driver is available
  if (distanceKm > MAX_REGULAR_DISTANCE_KM) {
    if (hasInternalDriver === true) {
      const excessKm = Math.ceil(distanceKm - MAX_REGULAR_DISTANCE_KM);
      const surchargeFee = excessKm * 7000;
      const baseFee = 115000;
      const fleet = getFleetMultiplier(totalPackages, items);

      if (fleet.requiresManualCoordination) {
        return {
          isDeliverable: true,
          outOfRange: false,
          distanceKm,
          baseFee,
          multiplier: 0,
          totalFee: 0,
          totalPackages,
          requiresManualCoordination: true,
          requires_pickup: true,
          fleetType: fleet.fleetType,
          fleetDescription: fleet.fleetDescription,
          error: LARGE_ORDER_WARNING_MESSAGE,
          handoverContact: SHABU_AJHI_HANDOVER_PHONE,
          provider: 'INTERNAL_DRIVER',
          surchargeFee,
          excessKm,
        };
      }

      const totalFee = Math.round((baseFee + surchargeFee) * fleet.multiplier);
      return {
        isDeliverable: true,
        outOfRange: false,
        distanceKm,
        baseFee,
        multiplier: fleet.multiplier,
        totalFee,
        totalPackages,
        requiresManualCoordination: false,
        requires_pickup: true,
        fleetType: fleet.fleetType,
        fleetDescription: fleet.fleetDescription,
        handoverContact: SHABU_AJHI_HANDOVER_PHONE,
        provider: 'INTERNAL_DRIVER',
        surchargeFee,
        excessKm,
        notes: `Jarak ${distanceKm.toFixed(1)} km (> 26 km) dikenakan surcharge jarak ekstrem Rp 7.000/km (+${excessKm} km = Rp ${surchargeFee.toLocaleString('id-ID')}).`,
      };
    }

    return {
      isDeliverable: false,
      outOfRange: true,
      distanceKm,
      baseFee: 0,
      multiplier: 0,
      totalFee: 0,
      totalPackages,
      requiresManualCoordination: true,
      requires_pickup: true,
      fleetType: 'none',
      fleetDescription: 'Di Luar Jangkauan Reguler (> 26 km)',
      error: OUT_OF_RANGE_ERROR_MESSAGE,
      handoverContact: SHABU_AJHI_HANDOVER_PHONE,
    };
  }

  // 2. Base Rate Lookup
  const baseRate = getBaseRate(distanceKm);
  const baseFee = baseRate ?? 0;

  // 3. Fleet Multiplier & Capacity Calculation (incorporating package combinations)
  const fleet = getFleetMultiplier(totalPackages, items);

  if (fleet.requiresManualCoordination) {
    return {
      isDeliverable: true,
      outOfRange: false,
      distanceKm,
      baseFee,
      multiplier: 0,
      totalFee: 0,
      totalPackages,
      requiresManualCoordination: true,
      requires_pickup: true,
      fleetType: fleet.fleetType,
      fleetDescription: fleet.fleetDescription,
      error: LARGE_ORDER_WARNING_MESSAGE,
      handoverContact: SHABU_AJHI_HANDOVER_PHONE,
    };
  }

  // Standard Deliverable Order (<= 4 packages, <= 26 km)
  const totalFee = Math.round(baseFee * fleet.multiplier);

  return {
    isDeliverable: true,
    outOfRange: false,
    distanceKm,
    baseFee,
    multiplier: fleet.multiplier,
    totalFee,
    totalPackages,
    requiresManualCoordination: false,
    requires_pickup: true,
    fleetType: fleet.fleetType,
    fleetDescription: fleet.fleetDescription,
    handoverContact: SHABU_AJHI_HANDOVER_PHONE,
  };
}

/**
 * Builds direct WhatsApp URL for large party catering orders (>= 5 packages)
 * or out-of-range orders requiring manual dispatcher coordination.
 */
export function buildLargeOrderWhatsAppUrl(params: {
  storeName?: string;
  waNumber?: string;
  distanceKm?: number;
  deliveryDate?: string;
  formattedDeliveryDate?: string;
  selectedTimeSlot?: string;
  locationAddress?: string;
  cartItems?: CateringItem[];
  totalPackages?: number;
  totalPrice?: number;
  selectedSoupsSummary?: string;
}): { waUrl: string; message: string; targetPhone: string } {
  const targetPhone = (params.waNumber || SHABU_AJHI_HANDOVER_PHONE).replace(/\D/g, '') || SHABU_AJHI_HANDOVER_PHONE;
  const storeName = params.storeName || 'Shabu Ajhi';
  const distance = typeof params.distanceKm === 'number' ? `${params.distanceKm.toFixed(1)} km` : '-';
  const dateStr = params.formattedDeliveryDate || params.deliveryDate || 'Segera';
  const slotStr = params.selectedTimeSlot || 'Fleksibel / Sesuai Jadwal';
  const address = params.locationAddress?.trim() || 'Alamat detail dikonfirmasi di chat';

  let itemsSummary = '';
  if (params.cartItems && params.cartItems.length > 0) {
    itemsSummary = params.cartItems
      .map((item, idx) => {
        let soupNote = '';
        if (item.selectedSoups && Object.keys(item.selectedSoups).length > 0) {
          const soups = Object.entries(item.selectedSoups)
            .filter(([_, qty]) => qty > 0)
            .map(([v, q]) => `${v}: ${q}`)
            .join(', ');
          if (soups) soupNote = ` (Kuah: ${soups})`;
        } else if (item.soupVariant) {
          soupNote = ` (Varian: ${item.soupVariant})`;
        }
        const itemPrice = item.price ? ` — Rp ${(item.price * item.qty).toLocaleString('id-ID')}` : '';
        return `${idx + 1}. ${item.name} x${item.qty}${soupNote}${itemPrice}`;
      })
      .join('\n');
  } else {
    itemsSummary = `Pesanan Partai Besar (${params.totalPackages || 5}+ paket)`;
  }

  const message =
    `Halo ${storeName}, saya ingin melakukan pemesanan catering partai besar (koordinasi armada khusus):\n\n` +
    `📦 *Jumlah Paket:* ${params.totalPackages || '>= 5'} paket\n` +
    `📅 *Jadwal Pengantaran:* ${dateStr}\n` +
    `⏰ *Slot Jam:* ${slotStr}\n` +
    `📍 *Jarak / Lokasi:* ${distance} | ${address}\n` +
    `🚚 *Sewa Alat Masak:* Dipinjamkan 100% Bebas Cuci (requires_pickup: true)\n\n` +
    `🍲 *Rincian Pesanan:*\n` +
    `${itemsSummary}\n\n` +
    (params.totalPrice ? `💰 *Estimasi Total Menu:* Rp ${params.totalPrice.toLocaleString('id-ID')}\n\n` : '') +
    `Mohon dibantu pengecekan armada khusus dan ketersediaan jadwalnya. Terima kasih!`;

  const waUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;

  return { waUrl, message, targetPhone };
}

