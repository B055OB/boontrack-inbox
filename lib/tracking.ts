/**
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

export const getTrackingData = getTrackingParams;

export function initMetaPixel(pixelId: string): void {
  if (typeof window === "undefined" || !pixelId) return;
  const win = window as unknown as Record<string, any>;
  if (!win._fbq_initialized) {
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

    win.fbq('init', pixelId);
    win.fbq('track', 'PageView');
    win._fbq_initialized = true;
  }
}

export function initTikTokPixel(pixelId: string): void {
  if (typeof window === "undefined" || !pixelId) return;
  const win = window as unknown as Record<string, any>;
  if (!win._ttq_initialized) {
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

    win.ttq.load(pixelId);
    win.ttq.page();
    win._ttq_initialized = true;
  }
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
    const win = window as unknown as Record<string, any>;

    // Inject Meta Pixel
    if (meta_pixel_id && !win._fbq_initialized) {
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

      win.fbq('init', meta_pixel_id);
      win.fbq('track', 'PageView');
      win._fbq_initialized = true;
    }

    // Inject TikTok Pixel
    if (tiktok_pixel_id && !win._ttq_initialized) {
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

      win.ttq.load(tiktok_pixel_id);
      win.ttq.page();
      win._ttq_initialized = true;
    }
  } catch (err) {
    console.warn("[Tracking] Skip init seller tracking:", err);
  }
}

// 3. Client-Side Standard Event Dispatchers
export function trackViewContent(product: { name: string; price: number; id?: number | string }): void {
  if (typeof window === "undefined") return;
  const win = window as unknown as Record<string, any>;

  if (win.fbq) {
    win.fbq("track", "ViewContent", {
      content_name: product.name,
      content_ids: [String(product.id || "")],
      content_type: "product",
      value: product.price,
      currency: "IDR"
    });
  }

  if (win.ttq) {
    win.ttq.track("ViewContent", {
      content_name: product.name,
      content_id: String(product.id || ""),
      value: product.price,
      currency: "IDR"
    });
  }
}

export function trackInitiateCheckout(
  productOrTitle: string | { name?: string; title?: string; price: number; id?: number | string },
  amount?: number
): void {
  if (typeof window === "undefined") return;
  const win = window as unknown as Record<string, any>;

  const title = typeof productOrTitle === "string"
    ? productOrTitle
    : (productOrTitle.title || productOrTitle.name || "Product Checkout");
  const value = typeof productOrTitle === "object" ? productOrTitle.price : (amount || 0);

  if (win.fbq) {
    win.fbq("track", "InitiateCheckout", {
      content_name: title,
      value: value,
      currency: "IDR"
    });
  }

  if (win.ttq) {
    win.ttq.track("InitiateCheckout", {
      content_name: title,
      value: value,
      currency: "IDR"
    });
  }
}

export function trackClientPurchase(orderId: string, amount: number, productTitle?: string): void {
  if (typeof window === "undefined") return;
  const win = window as unknown as Record<string, any>;
  const eventId = `PURCHASE_${orderId}`;

  if (win.fbq) {
    win.fbq("track", "Purchase", {
      content_name: productTitle || "Order Checkout",
      value: amount,
      currency: "IDR"
    }, { eventID: eventId });
  }

  if (win.ttq) {
    win.ttq.track("CompletePayment", {
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
  const win = window as unknown as Record<string, any>;

  const refParts = [
    tracking.utm_source ? `src:${tracking.utm_source}` : "",
    tracking.fbclid ? `fb:${tracking.fbclid}` : "",
    tracking.ttclid ? `tt:${tracking.ttclid}` : "",
    extraPayload?.productName ? `p:${extraPayload.productName.slice(0, 20)}` : ""
  ].filter(Boolean).join(";");

  const fullText = refParts ? `${baseText}\n\n[REF:${refParts}]` : baseText;

  if (win.fbq) {
    win.fbq("track", "Contact", {
      content_name: extraPayload?.productName || "WhatsApp Inbound",
      value: extraPayload?.price || 0,
      currency: "IDR"
    });
  }

  if (win.ttq) {
    win.ttq.track("Contact", {
      content_name: extraPayload?.productName || "WhatsApp Inbound",
      value: extraPayload?.price || 0,
      currency: "IDR"
    });
  }

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(fullText)}`;
}