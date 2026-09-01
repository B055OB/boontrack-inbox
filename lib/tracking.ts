import Cookies from 'js-cookie';

const COOKIE_NAME = 'bt_ref';
const COOKIE_EXPIRY_DAYS = 30;

/**
 * Tangkap query parameter ref dari URL (?ref=ALDI01) dan simpan ke cookie 30 hari.
 */
export function captureAffiliateReferral(): string | null {
  if (typeof window === 'undefined') return null;

  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref') || urlParams.get('via');

  if (refCode) {
    // First-touch: Hanya set jika cookie belum pernah ada, atau timpa jika strategi last-touch
    Cookies.set(COOKIE_NAME, refCode.trim().toUpperCase(), {
      expires: COOKIE_EXPIRY_DAYS,
      domain: window.location.hostname.includes('boontrack.com') ? '.boontrack.com' : undefined,
      sameSite: 'lax',
    });
    return refCode.trim().toUpperCase();
  }

  return Cookies.get(COOKIE_NAME) || null;
}

/**
 * Ambil referral code yang aktif untuk disisipkan ke payload checkout
 */
export function getActiveAffiliateCode(): string | null {
  if (typeof window === 'undefined') return null;
  return Cookies.get(COOKIE_NAME) || null;
}