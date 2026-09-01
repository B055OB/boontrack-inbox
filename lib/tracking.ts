const COOKIE_NAME = 'bt_ref';
const COOKIE_EXPIRY_DAYS = 30;

/**
 * Helper untuk membaca cookie browser secara native
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Helper untuk menyimpan cookie browser secara native dengan domain sharing
 */
function setCookie(name: string, value: string, days: number) {
  if (typeof document === 'undefined') return;
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = `expires=${date.toUTCString()}`;
  
  const host = window.location.hostname;
  const isBoonTrackDomain = host.includes('boontrack.com');
  const domainPart = isBoonTrackDomain ? '; domain=.boontrack.com' : '';

  document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/${domainPart}; SameSite=Lax`;
}

/**
 * Menangkap query parameter (?ref=... / ?via=...) dari URL dan menyimpan ke cookie
 */
export function captureAffiliateReferral(): string | null {
  if (typeof window === 'undefined') return null;

  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref') || urlParams.get('via');

  if (refCode) {
    const cleanRef = refCode.trim().toUpperCase();
    setCookie(COOKIE_NAME, cleanRef, COOKIE_EXPIRY_DAYS);
    return cleanRef;
  }

  return getCookie(COOKIE_NAME);
}

/**
 * Mengambil referral code yang tersimpan di cookie
 */
export function getActiveAffiliateCode(): string | null {
  return getCookie(COOKIE_NAME);
}