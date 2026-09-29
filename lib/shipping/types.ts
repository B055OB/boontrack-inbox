/**
 * @module lib/shipping/types
 * BoonTrack Universal Shipping Adapter — Type Contracts (§10.2)
 *
 * Architectural Principle (§0.6): Provider integrations must be replaceable through adapters.
 * All adapters implement BaseShippingAdapter, ensuring zero hardcoded tenant logic (§0.1 / §0.12).
 */

// ─── Core Value Objects ───────────────────────────────────────────────────────

export interface ShippingAddress {
  city: string;
  district: string;
  postal_code: string;
  subdistrict_id?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

export interface ShippingItem {
  name: string;
  weight_grams: number;
  quantity: number;
  value_idr?: number;
  category?: string;
}

// ─── Rate & Shipment DTOs ─────────────────────────────────────────────────────

export interface ShippingRate {
  id: string;
  courier_name: string;
  service: string;
  service_type: 'instant' | 'regular' | 'cargo';
  price: number;
  etd: string;
  max_days: number;
  is_fnb_safe: boolean;
  provider: 'biteship' | 'lincah' | 'platform';
  badge?: string;
  discount_pct?: number;
}

export interface ShipmentResult {
  tracking_number: string;
  provider: string;
  courier: string;
  service: string;
  label_url?: string;
  created_at: string;
  estimated_delivery?: string;
}

// ─── Credential Validation ────────────────────────────────────────────────────

export interface CredentialValidationResult {
  valid: boolean;
  /** Populated only when valid === false (400 path) */
  reason?: string;
}

// ─── Supabase tenants.metadata.shipping_config schema contract ────────────────
/**
 * Zero-hardcoding guarantee: this schema is read from Supabase per-tenant at
 * runtime. The adapter factory reads `active_aggregator` and routes accordingly.
 *
 * Schema reference — §10.2 / ARCHITECTURE.md Storage Standard:
 * {
 *   "active_aggregator": "lincah",
 *   "lincah": {
 *     "api_key": "<ENCRYPTED_OR_MASKED_KEY>",
 *     "secret": "<ENCRYPTED_OR_MASKED_SECRET>",
 *     "is_sandbox": false,
 *     "is_connected": true,
 *     "last_validated_at": "ISO-8601"
 *   }
 * }
 */
export interface ShippingConfig {
  active_aggregator: 'lincah' | 'biteship' | 'platform';
  lincah?: LincahAdapterConfig;
  biteship?: BiteshipAdapterConfig;
}

export interface LincahAdapterConfig {
  api_key: string;
  secret: string;
  partner_id?: string;
  is_sandbox: boolean;
  is_connected: boolean;
  last_validated_at: string | null;
}

export interface BiteshipAdapterConfig {
  api_key: string;
  is_sandbox: boolean;
  is_connected: boolean;
  last_validated_at: string | null;
}
