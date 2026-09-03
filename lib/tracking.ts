// lib/tracking.ts
// Multi-Tier Resilient Referral Tracker for BoonTrack (iOS Safari ITP & Private Browsing Safe)
// + Client-Side Tracking Engine (Meta Pixel & TikTok Pixel)

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    ttq?: {
      track: (...args: any[]) => void;
      page: () => void;
      methods?: string[];
      setAndDefer?: (t: any, e: any) => void;
      load?: (e: any, n?: any) => void;
      [key: string]: any;
    };
    TiktokAnalyticsObject?: string;
    _fbq?: any;
  }
}

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

// ============================================================================
// ADS TRACKING PRO: META PIXEL & TIKTOK PIXEL ENGINE (P3-A.4)
// ============================================================================

/**
 * Inisialisasi Script Meta Pixel
 */
export function initMetaPixel(pixelId: string) {
  if (typeof window === 'undefined' || !pixelId || window.fbq) return;
  (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

  window.fbq('init', pixelId);
  window.fbq('track', 'PageView');
}

/**
 * Inisialisasi Script TikTok Pixel
 */
export function initTikTokPixel(pixelId: string) {
  if (typeof window === 'undefined' || !pixelId || window.ttq) return;
  (function (w: any, d: any, t: any) {
    w.TiktokAnalyticsObject = t;
    var ttq = (w[t] = w[t] || []);
    ttq.methods = [
      'page',
      'track',
      'identify',
      'instances',
      'debug',
      'on',
      'off',
      'once',
      'ready',
      'alias',
      'group',
      'enableCookie',
      'disableCookie'
    ];
    ttq.setAndDefer = function (t: any, e: any) {
      t[e] = function () {
        t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
      };
    };
    for (var i = 0; i < ttq.methods.length; i++) {
      ttq.setAndDefer(ttq, ttq.methods[i]);
    }
    ttq.load = function (e: any, n: any) {
      var r = 'https://analytics.tiktok.com/i18n/pixel/events.js';
      ttq._i = ttq._i || {};
      ttq._i[e] = [];
      ttq._i[e]._u = r;
      ttq._t = ttq._t || {};
      ttq._t[e] = +new Date();
      ttq._o = ttq._o || {};
      ttq._o[e] = n || {};
      var a = d.createElement('script');
      a.type = 'text/javascript';
      a.async = !0;
      a.src = r + '?type=desktop&lib=' + t;
      var c = d.getElementsByTagName('script')[0];
      c.parentNode.insertBefore(a, c);
    };
    ttq.load(pixelId);
    ttq.page();
  })(window, document, 'ttq');
}

/**
 * Tembakkan event ViewContent
 */
export function trackViewContent(product: { id: string; name: string; price: number }) {
  if (typeof window === 'undefined') return;

  if (window.fbq) {
    window.fbq('track', 'ViewContent', {
      content_ids: [product.id],
      content_name: product.name,
      content_type: 'product',
      value: product.price,
      currency: 'IDR'
    });
  }

  if (window.ttq) {
    window.ttq.track('ViewContent', {
      content_id: product.id,
      content_name: product.name,
      content_type: 'product',
      value: product.price,
      currency: 'IDR'
    });
  }
}

/**
 * Tembakkan event InitiateCheckout
 */
export function trackInitiateCheckout(product: { id: string; name: string; price: number }) {
  if (typeof window === 'undefined') return;

  if (window.fbq) {
    window.fbq('track', 'InitiateCheckout', {
      content_ids: [product.id],
      content_name: product.name,
      value: product.price,
      currency: 'IDR'
    });
  }

  if (window.ttq) {
    window.ttq.track('InitiateCheckout', {
      content_id: product.id,
      content_name: product.name,
      value: product.price,
      currency: 'IDR'
    });
  }
}