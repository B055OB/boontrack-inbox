/**
 * lib/uuid-guard.ts
 * Centralized UUID and parameter validation helpers to prevent
 * Postgres 22P02 "invalid input syntax for type uuid" errors across Supabase queries.
 */

export const LOOSE_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates whether a value is a valid UUID string.
 * Rejects undefined, null, empty strings, and non-UUID formats.
 */
export function isValidUuid(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null' || trimmed === '[object Object]') {
    return false;
  }
  return LOOSE_UUID_REGEX.test(trimmed);
}

/**
 * Returns trimmed UUID string if valid, otherwise null.
 */
export function safeUuidOrNull(val: unknown): string | null {
  return isValidUuid(val) ? val.trim() : null;
}
