/**
 * lib/timezone-canonical.ts
 * Canonical Temporal Architecture & Timezone Standards for BoonTrack
 *
 * Architecture Doctrine:
 * 1. Database & Event Time = UTC (timestamptz / Unix epoch seconds).
 * 2. Every tenant store owns an authoritative IANA timezone (e.g. 'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Hong_Kong', 'Asia/Manila').
 * 3. Local presentation & reporting are strictly derived from tenant.shop_timezone.
 * 4. Zero tri-zone offset guessing (tri-zone hack is deprecated and abolished).
 */

export const DEFAULT_SHOP_TIMEZONE = 'Asia/Jakarta';

/**
 * Validates whether a given timezone string is a valid, recognized IANA timezone identifier.
 */
export function isValidIANATimezone(timeZone?: string | null): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the canonical shop timezone from tenant record or metadata.
 * Returns valid IANA timezone string or fallback to 'Asia/Jakarta'.
 */
export function resolveShopTimezone(tenantOrMetadata?: any): string {
  if (!tenantOrMetadata) return DEFAULT_SHOP_TIMEZONE;

  const candidate =
    tenantOrMetadata.shop_timezone ||
    tenantOrMetadata.timezone ||
    tenantOrMetadata.metadata?.shop_timezone ||
    tenantOrMetadata.metadata?.timezone ||
    tenantOrMetadata.metadata?.store_timezone;

  if (isValidIANATimezone(candidate)) {
    return candidate;
  }

  return DEFAULT_SHOP_TIMEZONE;
}

/**
 * Formats a Date object or ISO string into localized shop date/time string.
 */
export function formatInShopTimezone(
  dateOrIso: Date | string | number,
  timeZone: string = DEFAULT_SHOP_TIMEZONE,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = typeof dateOrIso === 'string' || typeof dateOrIso === 'number'
    ? new Date(dateOrIso)
    : dateOrIso;

  if (isNaN(date.getTime())) return '-';

  const validTz = isValidIANATimezone(timeZone) ? timeZone : DEFAULT_SHOP_TIMEZONE;

  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: validTz,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...options,
  };

  return new Intl.DateTimeFormat('id-ID', defaultOptions).format(date);
}

/**
 * Formats date into readable date only in shop timezone (e.g. "03 Okt 2026").
 */
export function formatShopDateOnly(
  dateOrIso: Date | string | number,
  timeZone: string = DEFAULT_SHOP_TIMEZONE
): string {
  return formatInShopTimezone(dateOrIso, timeZone, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Formats time only in shop timezone (e.g. "14:30 WIB").
 */
export function formatShopTimeOnly(
  dateOrIso: Date | string | number,
  timeZone: string = DEFAULT_SHOP_TIMEZONE
): string {
  const formatted = formatInShopTimezone(dateOrIso, timeZone, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const zoneAbbrev =
    timeZone === 'Asia/Jakarta'
      ? 'WIB'
      : timeZone === 'Asia/Makassar'
      ? 'WITA'
      : timeZone === 'Asia/Jayapura'
      ? 'WIT'
      : timeZone;

  return `${formatted} ${zoneAbbrev}`;
}

/**
 * Converts a Date or ISO string into an unambiguous UTC ISO-8601 string.
 */
export function toCanonicalUTCString(dateOrIso: Date | string | number = new Date()): string {
  const d = typeof dateOrIso === 'string' || typeof dateOrIso === 'number'
    ? new Date(dateOrIso)
    : dateOrIso;
  return d.toISOString();
}

/**
 * Gets current Unix epoch timestamp in seconds (standard for Adtech CAPI and event tokens).
 */
export function getCanonicalEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
