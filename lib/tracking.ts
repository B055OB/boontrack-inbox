// lib/tracking.ts
// Multi-Tier Resilient Referral Tracker + Ads Tracking Pro Engine

export interface TrackingData {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  ttclid: string | null;
  affiliate_ref: string | null;
  client_user_agent: string | null;
}

declare global {
  interface Window {
    fbq?: any;
    ttq?: any;
    TiktokAnalyticsObject?: string;
    _fbq?: any;
    initSellerTracking?: (slug: string) => Promise<void>;
    getTrackingData?: () => TrackingData;
    trackInitiateCheckout?: (productOrName: any, price?: number) => void;
    trackClientPurchase?: (orderId: string, totalAmount: number) => void;
    trackViewContent?: (product: any) => void;
  }
}

const COOKIE_NAME = 'bt_ref';
const STORAGE_KEY = 'bt_ref';
const COOKIE_EXPIRY_DAYS = 30;

let inMemoryAffiliateCode: string | null = null;

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
    // Fallback
  }
  return null;
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  } catch {
    return null;
  }
}

function getLocalStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getSessionStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function setCookie(name: string, value: string, days: number) {
  if (typeof document === 'undefined') return;
  try {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    const expires = `expires=${date.toUTCString()}`;
    const host = window.location.hostname;
    const isBoonTrack = host.includes('boontrack.com');
    const domainPart = isBoonTrack ? '; domain=.boontrack.com' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/${domainPart}; SameSite=Lax`;
  } catch {
    // Ignore
  }
}

export function setAffiliateCode(code: string) {
  if (!code || !code.trim()) return;
  const cleanCode = code.trim().toUpperCase();
  inMemoryAffiliateCode = cleanCode;
  setCookie(COOKIE_NAME, cleanCode, COOKIE_EXPIRY_DAYS);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, cleanCode);
      window.sessionStorage.setItem(STORAGE_KEY, cleanCode);
    } catch {
      // Ignore
    }
  }
}

export function captureAffiliateReferral(): string | null {
  if (typeof window === 'undefined') return null;
  const urlRef = getRefFromUrl();
  if (urlRef) {
    setAffiliateCode(urlRef);
    return urlRef;
  }
  return getActiveAffiliateCode();
}

export function getActiveAffiliateCode(): string | null {
  const urlRef = getRefFromUrl();
  if (urlRef) return urlRef;
  if (inMemoryAffiliateCode) return inMemoryAffiliateCode;

  const cookieRef = getCookie(COOKIE_NAME);
  if (cookieRef) return cookieRef;

  const localRef = getLocalStorage(STORAGE_KEY);
  if (localRef) return localRef;

  const sessionRef = getSessionStorage(STORAGE_KEY);
  if (sessionRef) return sessionRef;

  return null;
}

export function captureAdParameters(): void {
  if (typeof window === 'undefined') return;
  const urlParams = new URLSearchParams(window.location.search);
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'ttclid'];

  keys.forEach((key) => {
    const val = urlParams.get(key);
    if (val) {
      sessionStorage.setItem(`bt_${key}`, val);
    }
  });
}

export function getTrackingData(): TrackingData {
  if (typeof window === 'undefined') {
    return {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      fbclid: null,
      ttclid: null,
      affiliate_ref: null,
      client_user_agent: null,
    };
  }
  return {
    utm_source: sessionStorage.getItem('bt_utm_source'),
    utm_medium: sessionStorage.getItem('bt_utm_medium'),
    utm_campaign: sessionStorage.getItem('bt_utm_campaign'),
    utm_content: sessionStorage.getItem('bt_utm_content'),
    utm_term: sessionStorage.getItem('bt_utm_term'),
    fbclid: sessionStorage.getItem('bt_fbclid'),
    ttclid: sessionStorage.getItem('bt_ttclid'),
    affiliate_ref: getActiveAffiliateCode(),
    client_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  };
}

export async function syncAttributionSession(
  tenantId: string,
  _searchParams?: URLSearchParams
): Promise<Record<string, any>> {
  captureAdParameters();
  return {
    tenant_id: tenantId,
    ...getTrackingData(),
  };
}

export function initMetaPixel(pixelId: string): void {
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

export function initTikTokPixel(pixelId: string): void {
  if (typeof window === 'undefined' || !pixelId || window.ttq) return;
  (function (w: any, d: any, t: any) {
    w.TiktokAnalyticsObject = t;
    const ttq = (w[t] = w[t] || []);
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
      'disableCookie',
    ];
    ttq.setAndDefer = function (target: any, fn: any) {
      target[fn] = function () {
        target.push([fn].concat(Array.prototype.slice.call(arguments, 0)));
      };
    };
    for (let i = 0; i < ttq.methods.length; i++) {
      ttq.setAndDefer(ttq, ttq.methods[i]);
    }
    ttq.load = function (e: any, n: any) {
      const r = 'https://analytics.tiktok.com/i18n/pixel/events.js';
      ttq._i = ttq._i || {};
      ttq._i[e] = [];
      ttq._i[e]._u = r;
      ttq._t = ttq._t || {};
      ttq._t[e] = +new Date();
      ttq._o = ttq._o || {};
      ttq._o[e] = n || {};
      const a = d.createElement('script');
      a.type = 'text/javascript';
      a.async = !0;
      a.src = r + '?type=desktop&lib=' + t;
      const c = d.getElementsByTagName('script')[0];
      c.parentNode.insertBefore(a, c);
    };
    if (typeof ttq.load === 'function') {
      ttq.load(pixelId);
    }
    if (typeof ttq.page === 'function') {
      ttq.page();
    }
  })(window, document, 'ttq');
}

export async function initSellerTracking(tenantSlug: string): Promise<void> {
  if (typeof window === 'undefined' || !tenantSlug) return;
  try {
    const res = await fetch(`https://api.boontrack.com/api/v1/seller/ads-pro/config/${tenantSlug}`);
    const data = await res.json();
    if (data.success && data.is_enabled && data.pixel_config) {
      if (data.pixel_config.meta_pixel_id) {
        initMetaPixel(data.pixel_config.meta_pixel_id);
      }
      if (data.pixel_config.tiktok_pixel_id) {
        initTikTokPixel(data.pixel_config.tiktok_pixel_id);
      }
    }
  } catch (err) {
    console.error('[Ads Pro] Failed to load seller tracking config:', err);
  }
}

export function trackViewContent(product: { id?: string | number; name: string; price: number }): void {
  if (typeof window === 'undefined') return;

  if (typeof window.fbq === 'function') {
    window.fbq('track', 'ViewContent', {
      content_ids: [String(product.id || 'ITEM')],
      content_name: product.name,
      content_type: 'product',
      value: product.price,
      currency: 'IDR',
    });
  }

  if (window.ttq && typeof window.ttq.track === 'function') {
    window.ttq.track('ViewContent', {
      content_id: String(product.id || 'ITEM'),
      content_name: product.name,
      content_type: 'product',
      value: product.price,
      currency: 'IDR',
    });
  }
}

export function trackInitiateCheckout(
  productOrName: { id?: string | number; name: string; price: number } | string,
  priceParam?: number
): void {
  if (typeof window === 'undefined') return;

  const name = typeof productOrName === 'string' ? productOrName : productOrName.name;
  const price = typeof productOrName === 'string' ? (priceParam || 0) : productOrName.price;
  const id = typeof productOrName === 'object' && productOrName.id ? String(productOrName.id) : 'ITEM';

  if (typeof window.fbq === 'function') {
    window.fbq('track', 'InitiateCheckout', {
      content_ids: [id],
      content_name: name,
      value: Number(price),
      currency: 'IDR',
    });
  }

  if (window.ttq && typeof window.ttq.track === 'function') {
    window.ttq.track('InitiateCheckout', {
      content_id: id,
      content_name: name,
      value: Number(price),
      currency: 'IDR',
    });
  }
}

export function trackClientPurchase(orderId: string, totalAmount: number): void {
  if (typeof window === 'undefined') return;
  const deduplicationKey = `PURCHASE_${orderId}`;

  if (typeof window.fbq === 'function') {
    window.fbq(
      'track',
      'Purchase',
      {
        value: Number(totalAmount),
        currency: 'IDR',
      },
      { eventID: deduplicationKey }
    );
  }

  if (window.ttq && typeof window.ttq.track === 'function') {
    window.ttq.track(
      'CompletePayment',
      {
        value: Number(totalAmount),
        currency: 'IDR',
      },
      { event_id: deduplicationKey }
    );
  }
}

if (typeof window !== 'undefined') {
  captureAdParameters();
  window.initSellerTracking = initSellerTracking;
  window.getTrackingData = getTrackingData;
  window.trackInitiateCheckout = trackInitiateCheckout;
  window.trackClientPurchase = trackClientPurchase;
  window.trackViewContent = trackViewContent;
}/**
 * BoonTrack Ads Tracking Pro & Attribution Engine
 * Multi-Tenant Meta CAPI, TikTok Events API & WhatsApp Lead Attribution
 */

export interface TrackingParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  ttclid?: string;
  affiliate_code?: string;
}

// 1. Ekstraksi dan Penyimpanan Parameter URL (UTM & Click IDs)
export function captureAffiliateReferral(): void {
  if (typeof window === "undefined") return;

  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get("ref") || urlParams.get("aff");

  if (refCode) {
    localStorage.setItem("boontrack_affiliate_code", refCode.trim());
  }

  // Simpan UTM dan Click ID
  const trackingKeys = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "fbclid",
    "ttclid"
  ];

  const captured: Record<string, string> = {};
  trackingKeys.forEach((key) => {
    const val = urlParams.get(key);
    if (val) {
      captured[key] = val;
      localStorage.setItem(`boontrack_${key}`, val);
    }
  });

  if (Object.keys(captured).length > 0) {
    sessionStorage.setItem("boontrack_tracking_session", JSON.stringify(captured));
  }
}

export function getActiveAffiliateCode(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("boontrack_affiliate_code") || null;
}

export function getTrackingParams(): TrackingParams {
  if (typeof window === "undefined") return {};

  const urlParams = new URLSearchParams(window.location.search);
  const getParam = (k: string) => urlParams.get(k) || localStorage.getItem(`boontrack_${k}`) || undefined;

  return {
    utm_source: getParam("utm_source"),
    utm_medium: getParam("utm_medium"),
    utm_campaign: getParam("utm_campaign"),
    utm_content: getParam("utm_content"),
    utm_term: getParam("utm_term"),
    fbclid: getParam("fbclid"),
    ttclid: getParam("ttclid"),
    affiliate_code: getActiveAffiliateCode() || undefined
  };
}

// 2. Inisialisasi Dinamis Pixel Meta & TikTok Seller
export async function initSellerTracking(tenantSlug: string): Promise<void> {
  if (typeof window === "undefined" || !tenantSlug) return;

  try {
    const res = await fetch(`https://api.boontrack.com/api/v1/shop/${tenantSlug}/ads-config`);
    if (!res.ok) return;

    const data = await res.json();
    if (!data || !data.is_enabled) return;

    const { meta_pixel_id, tiktok_pixel_id } = data.pixel_config || {};

    // Inject Meta Pixel
    if (meta_pixel_id && !(window as any)._fbq_initialized) {
      /* eslint-disable */
      (function(f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
        if (f.fbq) return;
        n = f.fbq = function() {
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
      /* eslint-enable */

      (window as any).fbq('init', meta_pixel_id);
      (window as any).fbq('track', 'PageView');
      (window as any)._fbq_initialized = true;
    }

    // Inject TikTok Pixel
    if (tiktok_pixel_id && !(window as any)._ttq_initialized) {
      /* eslint-disable */
      (function(w: any, d: any, t: any) {
        w.TiktokAnalyticsObject = t;
        var ttq = (w[t] = w[t] || []);
        ttq.methods = [
          "page", "track", "identify", "instances", "load", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"
        ];
        ttq.setAndDefer = function(t: any, e: any) {
          t[e] = function() {
            t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
          };
        };
        for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
        ttq.load = function(e: any, n: any) {
          var r = "https://analytics.tiktok.com/i18n/pixel/events.js";
          ttq._i = ttq._i || {};
          ttq._i[e] = [];
          ttq._i[e]._u = r;
          ttq._t = ttq._t || {};
          ttq._t[e] = +new Date();
          ttq._o = ttq._o || {};
          ttq._o[e] = n || {};
          var o = document.createElement("script");
          o.type = "text/javascript";
          o.async = true;
          o.src = r + "?sdkid=" + e + "&lib=" + t;
          var a = document.getElementsByTagName("script")[0];
          a.parentNode?.insertBefore(o, a);
        };
      })(window, document, 'ttq');
      /* eslint-enable */

      (window as any).ttq.load(tiktok_pixel_id);
      (window as any).ttq.page();
      (window as any)._ttq_initialized = true;
    }
  } catch (err) {
    console.warn("[Tracking] Skip init seller tracking:", err);
  }
}

// 3. Client-Side Standard Event Dispatchers
export function trackViewContent(product: { name: string; price: number; id?: any }): void {
  if (typeof window === "undefined") return;

  if ((window as any).fbq) {
    (window as any).fbq("track", "ViewContent", {
      content_name: product.name,
      content_ids: [String(product.id || "")],
      content_type: "product",
      value: product.price,
      currency: "IDR"
    });
  }

  if ((window as any).ttq) {
    (window as any).ttq.track("ViewContent", {
      content_name: product.name,
      content_id: String(product.id || ""),
      value: product.price,
      currency: "IDR"
    });
  }
}

export function trackInitiateCheckout(productTitle: string, amount: number): void {
  if (typeof window === "undefined") return;

  if ((window as any).fbq) {
    (window as any).fbq("track", "InitiateCheckout", {
      content_name: productTitle,
      value: amount,
      currency: "IDR"
    });
  }

  if ((window as any).ttq) {
    (window as any).ttq.track("InitiateCheckout", {
      content_name: productTitle,
      value: amount,
      currency: "IDR"
    });
  }
}

export function trackClientPurchase(orderId: string, amount: number, productTitle?: string): void {
  if (typeof window === "undefined") return;
  const eventId = `PURCHASE_${orderId}`;

  // Meta Pixel dengan deduplication eventID
  if ((window as any).fbq) {
    (window as any).fbq("track", "Purchase", {
      content_name: productTitle || "Order Checkout",
      value: amount,
      currency: "IDR"
    }, { eventID: eventId });
  }

  // TikTok Pixel dengan event_id deduplikasi
  if ((window as any).ttq) {
    (window as any).ttq.track("CompletePayment", {
      content_name: productTitle || "Order Checkout",
      value: amount,
      currency: "IDR"
    }, { event_id: eventId });
  }
}

// 4. WhatsApp Inbound Link Builder dengan Embedding Tag & Event Contact
export function buildTrackedWhatsAppUrl(
  phoneNumber: string,
  baseText: string,
  extraPayload?: { productName?: string; price?: number }
): string {
  if (typeof window === "undefined") return `https://wa.me/${phoneNumber}`;

  const tracking = getTrackingParams();
  const cleanPhone = phoneNumber.replace(/\D/g, "");

  // Bentuk payload token referensi terstruktur
  const refParts = [
    tracking.utm_source ? `src:${tracking.utm_source}` : "",
    tracking.fbclid ? `fb:${tracking.fbclid}` : "",
    tracking.ttclid ? `tt:${tracking.ttclid}` : "",
    extraPayload?.productName ? `p:${extraPayload.productName.slice(0, 20)}` : ""
  ].filter(Boolean).join(";");

  const fullText = refParts ? `${baseText}\n\n[REF:${refParts}]` : baseText;

  // Trigger Client Event 'Contact' / 'Lead'
  if ((window as any).fbq) {
    (window as any).fbq("track", "Contact", {
      content_name: extraPayload?.productName || "WhatsApp Inbound",
      value: extraPayload?.price || 0,
      currency: "IDR"
    });
  }

  if ((window as any).ttq) {
    (window as any).ttq.track("Contact", {
      content_name: extraPayload?.productName || "WhatsApp Inbound",
      value: extraPayload?.price || 0,
      currency: "IDR"
    });
  }

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(fullText)}`;
}