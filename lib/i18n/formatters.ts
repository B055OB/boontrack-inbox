/**
 * lib/i18n/formatters.ts
 * Centralized Dynamic Currency, Number, and Date Formatters using standard Intl API.
 * Supports multi-currency (IDR, USD, MYR, SGD, EUR, etc.) without ad-hoc string replacement.
 */

export type SupportedCurrency = 'IDR' | 'USD' | 'MYR' | 'SGD' | 'EUR' | string;
export type SupportedLocale = 'id-ID' | 'en-US' | 'id' | 'en' | string;

/**
 * Normalizes locale tag for Intl APIs (maps 'id' -> 'id-ID', 'en' -> 'en-US')
 */
export function normalizeLocale(locale: string = 'id'): string {
  const clean = (locale || 'id').toLowerCase().trim();
  if (clean === 'id' || clean === 'id-id' || clean === 'indonesia') return 'id-ID';
  if (clean === 'en' || clean === 'en-us' || clean === 'en-gb') return 'en-US';
  return locale;
}

/**
 * Standardized Dynamic Currency Formatter using Intl.NumberFormat.
 * 
 * @param amount - The numeric or string amount to format
 * @param currency - 3-letter ISO currency code (default: 'IDR')
 * @param locale - Locale code (default: 'id-ID')
 * @returns Formatted currency string (e.g. 'Rp 150.000', '$150.00')
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  currency: SupportedCurrency = 'IDR',
  locale: SupportedLocale = 'id-ID'
): string {
  if (amount === null || amount === undefined || amount === '') {
    return currency === 'IDR' ? 'Rp 0' : '0';
  }

  const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.-]+/g, ''));
  if (isNaN(num)) {
    return currency === 'IDR' ? 'Rp 0' : '0';
  }

  const intlLocale = normalizeLocale(locale);
  const currUpper = (currency || 'IDR').toUpperCase();

  try {
    const isZeroDecimal = currUpper === 'IDR' || currUpper === 'JPY' || currUpper === 'KRW';
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency: currUpper,
      minimumFractionDigits: isZeroDecimal ? 0 : 2,
      maximumFractionDigits: isZeroDecimal ? 0 : 2,
    }).format(num);
  } catch (err) {
    // Fallback safe formatting if currency code or locale is unsupported
    const formattedNum = new Intl.NumberFormat(intlLocale).format(num);
    return `${currUpper} ${formattedNum}`;
  }
}

/**
 * Standardized Number Formatter.
 */
export function formatNumber(
  value: number | string | null | undefined,
  locale: SupportedLocale = 'id-ID',
  options?: Intl.NumberFormatOptions
): string {
  if (value === null || value === undefined || value === '') return '0';
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(num)) return '0';

  const intlLocale = normalizeLocale(locale);
  return new Intl.NumberFormat(intlLocale, options).format(num);
}

/**
 * Standardized Date Formatter.
 */
export function formatDate(
  date: string | Date | number | null | undefined,
  locale: SupportedLocale = 'id-ID',
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '—';

  const intlLocale = normalizeLocale(locale);
  const defaultOptions: Intl.DateTimeFormatOptions = options || {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  };

  return new Intl.DateTimeFormat(intlLocale, defaultOptions).format(d);
}
