/**
 * @file lib/order-sanitizer.ts
 * @description Single source of truth whitelist for PostgreSQL 'orders' table columns.
 * Prevents PostgREST PGRST204 errors (unknown column in schema cache) from failing order creations.
 */

export const VALID_ORDER_COLUMNS = new Set<string>([
  'id',
  'tenant_slug',
  'tenant_id',
  'product_id',
  'product_title',
  'gross_amount',
  'customer_name',
  'customer_phone',
  'customer_email',
  'affiliate_code',
  'manager_id',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'ttclid',
  'status',
  'payment_status',
  'order_status',
  'qr_code_url',
  'paid_at',
  'correlation_id',
  'mutation_id',
  'trace_id',
  'email_sent',
  'email_sent_at',
  'briefing_url',
  'customer_briefing',
  'payment_proof_url',
  'created_at',
  'updated_at',
]);

/**
 * Filters out any properties that do not exist as physical columns in Supabase 'orders' table.
 */
export function sanitizeOrderPayload<T extends Record<string, any>>(rawPayload: T): Partial<T> {
  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(rawPayload)) {
    if (VALID_ORDER_COLUMNS.has(key) && val !== undefined) {
      clean[key] = val;
    }
  }
  return clean as Partial<T>;
}
