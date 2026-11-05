/**
 * lib/checkout/cateringCheckoutRouting.ts
 *
 * Cart Validation & Checkout Routing Engine for F&B Catering Merchants (Shabu Ajhi).
 *
 * Implements:
 * 1. Cart evaluation for package threshold (>= 5 packages requires manual fleet coordination).
 * 2. Automated checkout / Payment Gateway guard (disables online payment for large orders or out-of-range addresses).
 * 3. Warning banner and CTA button routing to Human CS WhatsApp (+62 896-1779-9878).
 * 4. Structured order payload builder with required attributes:
 *    - selected_soups
 *    - distance_km
 *    - requires_pickup: true
 *    - delivery_fee
 *    - rental_schedule (including pickup_date, pickup_window: 'SAME_DAY' | 'NEXT_DAY_MORNING')
 * 5. Flexible cookware pickup options:
 *    - 'Hari yang Sama (Setelah Acara)' (SAME_DAY)
 *    - 'Besok Pagi (H+1)' (NEXT_DAY_MORNING)
 *    - Auto-defaults to 'Besok Pagi (H+1)' if delivery is >= 16.00 WIB.
 */

import {
  calculateDeliveryFee,
  countCateringPackages,
  buildLargeOrderWhatsAppUrl,
  SHABU_AJHI_HANDOVER_PHONE,
  LARGE_ORDER_WARNING_MESSAGE,
  OUT_OF_RANGE_ERROR_MESSAGE,
  CateringItem,
  DeliveryCalculationResult,
} from '@/lib/shipping/deliveryCalculator';
import {
  EquipmentReturnMetadata,
  buildEquipmentReturnMetadata,
  EQUIPMENT_RETURN_GUARANTEE,
  EQUIPMENT_RETURN_LABELS,
} from '@/components/shabu-ajhi/EquipmentReturnPicker';

export const LIVE_COOKING_INTERCEPT_BANNER =
  'Pesanan 5 paket atau lebih (~50+ porsi) dialihkan ke layanan Live Cooking & Event Catering khusus bersama tim dan peralatan profesional Shabu Ajhi.';

export const LIVE_COOKING_CTA_TEXT = 'Konsultasi Tim Live Cooking via WhatsApp';

export const EQUIPMENT_RETURN_CLEANING_GUARANTEE = EQUIPMENT_RETURN_GUARANTEE;

export type PickupWindow = 'SAME_DAY' | 'NEXT_DAY_MORNING';

export const PICKUP_WINDOW_LABELS: Readonly<Record<PickupWindow, string>> = {
  SAME_DAY: 'Hari yang Sama (Setelah Acara)',
  NEXT_DAY_MORNING: 'Besok Pagi (H+1)',
};

export const PICKUP_MICROCOPY =
  'Peralatan tidak perlu dicuci. Penjemputan fleksibel, bisa dijemput hari yang sama atau besok paginya.';

/**
 * Resolves default cookware pickup window based on delivery time slot:
 * Defaults to 'Besok Pagi (H+1)' (NEXT_DAY_MORNING) if delivery starts at or after 16:00 WIB.
 * Otherwise defaults to 'Hari yang Sama (Setelah Acara)' (SAME_DAY).
 */
export function resolveDefaultPickupWindow(timeSlot?: string): PickupWindow {
  if (!timeSlot) return 'SAME_DAY';

  const match = timeSlot.match(/(\d{1,2})[:.](\d{2})/);
  if (match) {
    const startHour = parseInt(match[1], 10);
    if (startHour >= 16) {
      return 'NEXT_DAY_MORNING';
    }
  }

  return 'SAME_DAY';
}

/**
 * Calculates pickup date from delivery date string (YYYY-MM-DD) and pickup window.
 * Adds 1 calendar day if window is NEXT_DAY_MORNING.
 */
export function calculatePickupDate(
  deliveryDateStr: string,
  pickupWindow: PickupWindow = 'SAME_DAY'
): string {
  if (!deliveryDateStr) return '';
  if (pickupWindow === 'SAME_DAY') return deliveryDateStr;

  try {
    const parts = deliveryDateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      d.setDate(d.getDate() + 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }

    const d = new Date(deliveryDateStr);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  } catch (_) {
    return deliveryDateStr;
  }
}

export interface CateringRentalSchedule {
  delivery_date: string;
  time_slot: string;
  pickup_date: string;
  pickup_window: PickupWindow;
  pickup_preference?: string;
  formatted_delivery_date?: string;
  formatted_pickup_date?: string;
}

export interface CateringCartValidationResult {
  totalPackages: number;
  totalItems: number;
  totalPrice: number;
  requiresManualCoordination: boolean;
  canCheckoutOnline: boolean;
  warningBanner: string | null;
  liveCookingBanner?: string | null;
  liveCookingIntercept?: boolean;
  liveCookingCtaText?: string;
  deliveryResult: DeliveryCalculationResult;
  ctaButtonText: string;
  whatsappHandoffUrl: string;
  whatsappMessage: string;
  equipmentReturn?: EquipmentReturnMetadata;
}

export interface CateringOrderPayload {
  merchant_slug: string;
  total_packages: number;
  items: CateringItem[];
  selected_soups: Record<string, number>;
  distance_km: number;
  requires_pickup: boolean;
  delivery_fee: number;
  total_price: number;
  rental_schedule: CateringRentalSchedule;
  equipment_return?: EquipmentReturnMetadata;
  notes?: string;
  is_large_party_order: boolean;
}

/**
 * Validates cart items, distance, and returns checkout routing directives.
 */
export function validateCateringCart(params: {
  cartItems: CateringItem[];
  distanceKm: number;
  deliveryDate?: string;
  formattedDeliveryDate?: string;
  selectedTimeSlot?: string;
  pickupDate?: string;
  pickupWindow?: PickupWindow;
  formattedPickupDate?: string;
  locationAddress?: string;
  storeName?: string;
  waNumber?: string;
  useLiveCookingCta?: boolean;
}): CateringCartValidationResult {
  const {
    cartItems,
    distanceKm,
    deliveryDate,
    formattedDeliveryDate,
    selectedTimeSlot,
    pickupDate,
    pickupWindow = resolveDefaultPickupWindow(selectedTimeSlot),
    formattedPickupDate,
    locationAddress,
    storeName = 'Shabu Ajhi',
    waNumber = SHABU_AJHI_HANDOVER_PHONE,
    useLiveCookingCta = false,
  } = params;

  const totalPackages = countCateringPackages(cartItems);
  let totalItems = 0;
  let totalPrice = 0;

  for (const item of cartItems) {
    const qty = Number(item.qty) || 1;
    totalItems += qty;
    totalPrice += (Number(item.price) || 0) * qty;
  }

  const deliveryResult = calculateDeliveryFee(distanceKm, cartItems);

  // Determine online checkout eligibility
  const isLargePartyOrder = totalPackages >= 5;
  const requiresManualCoordination =
    isLargePartyOrder || deliveryResult.requiresManualCoordination;

  const canCheckoutOnline =
    !requiresManualCoordination &&
    deliveryResult.isDeliverable &&
    !deliveryResult.outOfRange;

  let warningBanner: string | null = null;
  let liveCookingBanner: string | null = null;

  if (deliveryResult.outOfRange) {
    warningBanner = OUT_OF_RANGE_ERROR_MESSAGE;
  } else if (requiresManualCoordination) {
    warningBanner = LARGE_ORDER_WARNING_MESSAGE;
  }

  if (isLargePartyOrder) {
    liveCookingBanner = LIVE_COOKING_INTERCEPT_BANNER;
  }

  const resolvedPickupDate =
    pickupDate || (deliveryDate ? calculatePickupDate(deliveryDate, pickupWindow) : '');
  const pickupLabel = PICKUP_WINDOW_LABELS[pickupWindow];
  const equipmentReturn = buildEquipmentReturnMetadata(pickupWindow, deliveryDate, selectedTimeSlot);

  const { waUrl, message } = buildLargeOrderWhatsAppUrl({
    storeName,
    waNumber,
    distanceKm,
    deliveryDate,
    formattedDeliveryDate,
    selectedTimeSlot,
    locationAddress: `${locationAddress || ''}${
      resolvedPickupDate ? ` | Penjemputan Alat: ${pickupLabel} (${formattedPickupDate || resolvedPickupDate})` : ''
    }`,
    cartItems,
    totalPackages,
    totalPrice,
  });

  const ctaButtonText = useLiveCookingCta && isLargePartyOrder
    ? LIVE_COOKING_CTA_TEXT
    : requiresManualCoordination
    ? 'Hubungi Admin CS Shabu Ajhi'
    : 'WhatsApp Kasir / CS';

  return {
    totalPackages,
    totalItems,
    totalPrice,
    requiresManualCoordination,
    canCheckoutOnline,
    warningBanner,
    liveCookingBanner,
    liveCookingIntercept: isLargePartyOrder,
    liveCookingCtaText: LIVE_COOKING_CTA_TEXT,
    deliveryResult,
    ctaButtonText,
    whatsappHandoffUrl: waUrl,
    whatsappMessage: message,
    equipmentReturn,
  };
}

/**
 * Aggregates all chosen soup variants across all cart items.
 */
export function aggregateSelectedSoups(
  cartItems: CateringItem[]
): Record<string, number> {
  const soupMap: Record<string, number> = {};

  for (const item of cartItems) {
    if (item.selectedSoups && Object.keys(item.selectedSoups).length > 0) {
      for (const [variant, count] of Object.entries(item.selectedSoups)) {
        if (count > 0) {
          soupMap[variant] = (soupMap[variant] || 0) + count;
        }
      }
    } else if (item.soupVariant) {
      const variant = item.soupVariant;
      soupMap[variant] = (soupMap[variant] || 0) + (Number(item.qty) || 1);
    }
  }

  return soupMap;
}

/**
 * Constructs structured order payload for backend submission or order booking.
 * Ensures rental_schedule contains pickup_date and pickup_window ('SAME_DAY' | 'NEXT_DAY_MORNING').
 */
export function buildCateringOrderPayload(params: {
  merchantSlug?: string;
  cartItems: CateringItem[];
  distanceKm: number;
  deliveryDate: string;
  timeSlot: string;
  pickupDate?: string;
  pickupWindow?: PickupWindow;
  formattedDeliveryDate?: string;
  formattedPickupDate?: string;
  notes?: string;
}): CateringOrderPayload {
  const {
    merchantSlug = 'shabu-ajhi',
    cartItems,
    distanceKm,
    deliveryDate,
    timeSlot,
    pickupDate,
    pickupWindow: explicitWindow,
    formattedDeliveryDate,
    formattedPickupDate,
    notes,
  } = params;

  const totalPackages = countCateringPackages(cartItems);
  const deliveryResult = calculateDeliveryFee(distanceKm, cartItems);
  const selected_soups = aggregateSelectedSoups(cartItems);

  let itemsPrice = 0;
  for (const item of cartItems) {
    itemsPrice += (Number(item.price) || 0) * (Number(item.qty) || 1);
  }

  const deliveryFee = deliveryResult.totalFee;
  const totalPrice = itemsPrice + deliveryFee;

  // Resolve pickup window: explicit > auto-default from timeSlot (>= 16:00 -> NEXT_DAY_MORNING)
  const pickup_window: PickupWindow = explicitWindow || resolveDefaultPickupWindow(timeSlot);
  const pickup_date: string = pickupDate || calculatePickupDate(deliveryDate, pickup_window);
  const pickup_preference = PICKUP_WINDOW_LABELS[pickup_window];

  const rental_schedule: CateringRentalSchedule = {
    delivery_date: deliveryDate,
    time_slot: timeSlot,
    pickup_date,
    pickup_window,
    pickup_preference,
    formatted_delivery_date: formattedDeliveryDate,
    formatted_pickup_date: formattedPickupDate,
  };

  const equipment_return = buildEquipmentReturnMetadata(pickup_window, deliveryDate, timeSlot);

  return {
    merchant_slug: merchantSlug,
    total_packages: totalPackages,
    items: cartItems,
    selected_soups,
    distance_km: distanceKm,
    requires_pickup: true, // Always true for catering with dirty cookware retrieval
    delivery_fee: deliveryFee,
    total_price: totalPrice,
    rental_schedule,
    equipment_return,
    notes,
    is_large_party_order: totalPackages >= 5,
  };
}
