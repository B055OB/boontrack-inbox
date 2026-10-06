/**
 * @file lib/crm/phone-utils.ts
 * @description Canonical E.164 phone normalization utilities.
 */

/**
 * Normalizes any raw phone input to canonical E.164 format (+628xxxxxxxxxx for Indonesia).
 */
export function toE164(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Remove non-digit characters, preserving a leading plus if present
  let digits = trimmed.replace(/[^0-9+]/g, '');

  if (digits.startsWith('+')) {
    digits = '+' + digits.slice(1).replace(/[^0-9]/g, '');
    return digits;
  }

  // Handle local Indonesian prefixes
  if (digits.startsWith('0')) {
    return '+62' + digits.slice(1);
  }
  if (digits.startsWith('62')) {
    return '+' + digits;
  }
  if (digits.startsWith('8')) {
    return '+62' + digits;
  }

  return '+' + digits;
}

/**
 * Formats an E.164 phone number for clean human presentation.
 * Example: +6285129992305 -> +62 851-2999-2305
 */
export function formatDisplayPhone(e164: string | null | undefined): string {
  if (!e164) return '-';
  const clean = toE164(e164);
  if (clean.startsWith('+62')) {
    const local = clean.slice(3);
    if (local.length <= 4) return `+62 ${local}`;
    if (local.length <= 8) return `+62 ${local.slice(0, 3)}-${local.slice(3)}`;
    return `+62 ${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`;
  }
  return clean;
}
