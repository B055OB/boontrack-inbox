/**
 * lib/checkout/cateringCheckoutRouting.ts
 *
 * Cart Validation & Checkout Routing Engine for F&B Catering Merchants (Shabu Ajhi).
 *
 * Implements:
 * 1. Cart evaluation for package threshold (>= 5 packages requires manual fleet coordination).
 * 2. Automated checkout / Payment Gateway guard (disables online payment for large orders or out-of-range addresses).
 * 3. Warning banner and CTA button routing to Human CS WhatsApp (+62 896-1779-9878).
 * 4. Structured order payload builder with required attributes (selected_soups, distance_km, requires_pickup: true, delivery_fee, rental_schedule).
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

export interface CateringRentalSchedule {
  delivery_date: string;
  time_slot: string;
  pickup_date?: string;
  formatted_delivery_date?: string;
}

export interface CateringCartValidationResult {
  totalPackages: number;
  totalItems: number;
  totalPrice: number;
  requiresManualCoordination: boolean;
  canCheckoutOnline: boolean;
  warningBanner: string | null;
  deliveryResult: DeliveryCalculationResult;
  ctaButtonText: string;
  whatsappHandoffUrl: string;
  whatsappMessage: string;
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
  locationAddress?: string;
  storeName?: string;
  waNumber?: string;
}): CateringCartValidationResult {
  const {
    cartItems,
    distanceKm,
    deliveryDate,
    formattedDeliveryDate,
    selectedTimeSlot,
    locationAddress,
    storeName = 'Shabu Ajhi',
    waNumber = SHABU_AJHI_HANDOVER_PHONE,
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
  // Online checkout is blocked if:
  // 1. Total packages >= 5 (requires manual coordination)
  // 2. Distance > 26 km (out of range)
  // 3. deliveryResult.isDeliverable === false
  const requiresManualCoordination =
    totalPackages >= 5 || deliveryResult.requiresManualCoordination;

  const canCheckoutOnline =
    !requiresManualCoordination &&
    deliveryResult.isDeliverable &&
    !deliveryResult.outOfRange;

  let warningBanner: string | null = null;
  if (deliveryResult.outOfRange) {
    warningBanner = OUT_OF_RANGE_ERROR_MESSAGE;
  } else if (requiresManualCoordination) {
    warningBanner = LARGE_ORDER_WARNING_MESSAGE;
  }

  const { waUrl, message } = buildLargeOrderWhatsAppUrl({
    storeName,
    waNumber,
    distanceKm,
    deliveryDate,
    formattedDeliveryDate,
    selectedTimeSlot,
    locationAddress,
    cartItems,
    totalPackages,
    totalPrice,
  });

  const ctaButtonText = requiresManualCoordination
    ? 'Hubungi Admin CS Shabu Ajhi'
    : 'WhatsApp Kasir / CS';

  return {
    totalPackages,
    totalItems,
    totalPrice,
    requiresManualCoordination,
    canCheckoutOnline,
    warningBanner,
    deliveryResult,
    ctaButtonText,
    whatsappHandoffUrl: waUrl,
    whatsappMessage: message,
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
 */
export function buildCateringOrderPayload(params: {
  merchantSlug?: string;
  cartItems: CateringItem[];
  distanceKm: number;
  deliveryDate: string;
  timeSlot: string;
  pickupDate?: string;
  formattedDeliveryDate?: string;
  notes?: string;
}): CateringOrderPayload {
  const {
    merchantSlug = 'shabu-ajhi',
    cartItems,
    distanceKm,
    deliveryDate,
    timeSlot,
    pickupDate,
    formattedDeliveryDate,
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

  const rental_schedule: CateringRentalSchedule = {
    delivery_date: deliveryDate,
    time_slot: timeSlot,
    pickup_date: pickupDate || deliveryDate,
    formatted_delivery_date: formattedDeliveryDate,
  };

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
    notes,
    is_large_party_order: totalPackages >= 5,
  };
}

