// lib/tracking.ts
// Multi-Tier Resilient Referral Tracker for BoonTrack (iOS Safari ITP & Private Browsing Safe)

const COOKIE_NAME = 'bt_ref';
const STORAGE_KEY = 'bt_ref';
const COOKIE_EXPIRY_DAYS = 30;

// Tier 1: In-memory fallback (survives client-side SPA navigation even if third-party cookies/storage are blocked)
let inMemoryAffiliateCode: string | null = null;

/**
 * Helper untuk membaca query parameter referral dari URL browser
 */
function getRefFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const code =
      urlParams.get('ref') ||
      urlParams.get('via') ||
      urlParams.get('aff') ||
      urlParams.get('referral');
    if (code && code.trim()) {
      return code.trim().toUpperCase();
    }
  } catch {
    // Fallback if URLSearchParams fails
  }
  return null;
}

/**
 * Helper untuk membaca cookie browser secara native
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  } catch {
    return null;
  }
}

/**
 * Helper untuk membaca dari localStorage dengan proteksi Safari Private Browsing
 */
function getLocalStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Helper untuk membaca dari sessionStorage dengan proteksi Safari Private Browsing
 */
function getSessionStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Helper untuk menyimpan cookie browser secara native dengan domain sharing
 */
function setCookie(name: string, value: string, days: number) {
  if (typeof document === 'undefined') return;
  try {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    const expires = `expires=${date.toUTCString()}`;
    
    const host = window.location.hostname;
    const isBoonTrackDomain = host.includes('boontrack.com');
    const domainPart = isBoonTrackDomain ? '; domain=.boontrack.com' : '';

    document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/${domainPart}; SameSite=Lax`;
  } catch {
    // Ignore cookie block errors in strict ITP contexts
  }
}

/**
 * Menyimpan referral code ke seluruh tier (Memory, Cookie, LocalStorage, SessionStorage)
 */
export function setAffiliateCode(code: string) {
  if (!code || !code.trim()) return;
  const cleanCode = code.trim().toUpperCase();
  
  // Tier 1: In-memory
  inMemoryAffiliateCode = cleanCode;

  // Tier 2: Cookie
  setCookie(COOKIE_NAME, cleanCode, COOKIE_EXPIRY_DAYS);

  // Tier 3: LocalStorage
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, cleanCode);
    } catch {
      // Safari private mode storage quota error fallback
    }

    // Tier 4: SessionStorage
    try {
      window.sessionStorage.setItem(STORAGE_KEY, cleanCode);
    } catch {
      // Ignore
    }
  }
}

/**
 * Menangkap query parameter (?ref=... / ?via=...) dari URL dan menyimpan ke seluruh storage tier
 */
export function captureAffiliateReferral(): string | null {
  if (typeof window === 'undefined') return null;

  const urlRef = getRefFromUrl();
  if (urlRef) {
    setAffiliateCode(urlRef);
    return urlRef;
  }

  return getActiveAffiliateCode();
}

/**
 * Mengambil referral code aktif dengan multi-tier fallback:
 * 1. URL Query Param (?ref= / ?via= / ?aff= / ?referral=)
 * 2. In-Memory variable
 * 3. Browser Cookie (bt_ref)
 * 4. LocalStorage
 * 5. SessionStorage
 */
export function getActiveAffiliateCode(): string | null {
  // 1. Direct URL check if on client
  const urlRef = getRefFromUrl();
  if (urlRef) {
    inMemoryAffiliateCode = urlRef;
    return urlRef;
  }

  // 2. In-Memory fallback
  if (inMemoryAffiliateCode) {
    return inMemoryAffiliateCode;
  }

  // 3. Cookie fallback
  const cookieRef = getCookie(COOKIE_NAME);
  if (cookieRef) {
    inMemoryAffiliateCode = cookieRef;
    return cookieRef;
  }

  // 4. LocalStorage fallback
  const localRef = getLocalStorage(STORAGE_KEY);
  if (localRef) {
    inMemoryAffiliateCode = localRef;
    return localRef;
  }

  // 5. SessionStorage fallback
  const sessionRef = getSessionStorage(STORAGE_KEY);
  if (sessionRef) {
    inMemoryAffiliateCode = sessionRef;
    return sessionRef;
  }

  return null;
}