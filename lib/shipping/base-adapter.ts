/**
 * @module lib/shipping/base-adapter
 * BoonTrack BaseShippingAdapter — Abstract Interface Contract (§10.2)
 *
 * Every concrete shipping adapter MUST extend this class and implement
 * all three abstract methods. No adapter may return mock/dummy responses
 * when upstream infrastructure fails (§0.12 Zero Fake Fallback).
 *
 * Error Contract:
 *   - Invalid credentials → throw ShippingAdapterError with status 400
 *   - Upstream timeout / unreachable → throw ShippingAdapterError with status 502
 */

import type {
  CredentialValidationResult,
  ShippingAddress,
  ShippingItem,
  ShippingRate,
  ShipmentResult,
} from './types';

// ─── Structured Error ─────────────────────────────────────────────────────────

export class ShippingAdapterError extends Error {
  constructor(
    message: string,
    /** HTTP status that the API route should forward to the client */
    public readonly httpStatus: 400 | 502 | 503,
    public readonly provider: string,
  ) {
    super(message);
    this.name = 'ShippingAdapterError';
  }
}

// ─── Abstract Base ─────────────────────────────────────────────────────────────

export abstract class BaseShippingAdapter {
  /**
   * Validates API credentials against the upstream provider's handshake endpoint.
   *
   * Must throw ShippingAdapterError(status=400) if credentials are structurally
   * invalid or rejected by the upstream provider.
   * Must throw ShippingAdapterError(status=502) if the upstream is unreachable / times out.
   * MUST NOT return { valid: true } when the handshake actually failed (§0.12).
   */
  abstract validateCredentials(
    apiKey: string,
    secret: string,
  ): Promise<CredentialValidationResult>;

  /**
   * Calculates shipping rates for a given origin → destination pair.
   *
   * @param origin - Warehouse / store shipping origin address
   * @param destination - Buyer delivery address
   * @param items - Line items in the order (used for weight / dimension)
   * @returns Array of rate options sorted ascending by price
   *
   * Throws ShippingAdapterError(502) on upstream failure. Returns [] if the
   * provider returns no rates (not a 502 condition — the route may fall through
   * to the next adapter or platform fallback engine).
   */
  abstract calculateRates(
    origin: ShippingAddress,
    destination: ShippingAddress,
    items: ShippingItem[],
  ): Promise<ShippingRate[]>;

  /**
   * Creates a shipment (generates a tracking number / label) with the provider.
   *
   * Throws ShippingAdapterError(502) if the provider is unreachable.
   * Throws ShippingAdapterError(400) if the payload is rejected by the provider.
   */
  abstract createShipment(
    orderId: string,
    payload: Record<string, unknown>,
  ): Promise<ShipmentResult>;
}
