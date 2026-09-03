/**
 * ads-tracker.js - Frontend Client-Side Tracking & Pixel Injector
 * Khusus untuk landing page toko dan form checkout multi-tenant boontrack.
 */

(function () {
  // 1. Tangkap dan persistensikan UTM dan click ID saat landing
  function captureAdParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const trackingKeys = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
      'fbclid',
      'ttclid'
    ];

    trackingKeys.forEach(function (key) {
      const val = urlParams.get(key);
      if (val) {
        sessionStorage.setItem('bt_' + key, val);
      }
    });
  }

  // 2. Ambil seluruh data tracking tersimpan untuk disisipkan ke payload order
  window.getTrackingData = function () {
    return {
      utm_source: sessionStorage.getItem('bt_utm_source') || null,
      utm_medium: sessionStorage.getItem('bt_utm_medium') || null,
      utm_campaign: sessionStorage.getItem('bt_utm_campaign') || null,
      utm_content: sessionStorage.getItem('bt_utm_content') || null,
      utm_term: sessionStorage.getItem('bt_utm_term') || null,
      fbclid: sessionStorage.getItem('bt_fbclid') || null,
      ttclid: sessionStorage.getItem('bt_ttclid') || null,
      client_user_agent: navigator.userAgent
    };
  };

  // 3. Mount Pixel Seller Dinamis Berdasarkan Slug Toko
  window.initSellerTracking = async function (tenantSlug) {
    try {
      const response = await fetch(`https://api.boontrack.com/api/v1/seller/ads-pro/config/${tenantSlug}`);
      const data = await response.json();

      if (!data.success || !data.is_enabled || !data.pixel_config) {
        return;
      }

      const cfg = data.pixel_config;

      // Inject Meta Pixel
      if (cfg.meta_pixel_id) {
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');

        fbq('init', cfg.meta_pixel_id);
        fbq('track', 'PageView');
      }

      // Inject TikTok Pixel
      if (cfg.tiktok_pixel_id) {
        !function (w, d, t) {
          w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,s=d.createElement("script"),s.type="text/javascript",s.async=!0,s.src=i+"?sdkid="+e+"&lib="+t;var o=d.getElementsByTagName("script")[0];o.parentNode.insertBefore(s,o)};
          ttq.load(cfg.tiktok_pixel_id);
          ttq.page();
        }(window, document, 'ttq');
      }
    } catch (err) {
      console.error("[Ads Pro] Failed to load seller tracking config:", err);
    }
  };

  // 4. Trigger Event Initiate Checkout
  window.trackInitiateCheckout = function (productName, totalAmount) {
    if (window.fbq) {
      fbq('track', 'InitiateCheckout', {
        content_name: productName,
        value: Number(totalAmount),
        currency: 'IDR'
      });
    }
    if (window.ttq) {
      ttq.track('InitiateCheckout', {
        content_name: productName,
        value: Number(totalAmount),
        currency: 'IDR'
      });
    }
  };

  // 5. Trigger Client-Side Purchase dengan Deduplikasi Key
  window.trackClientPurchase = function (orderId, totalAmount) {
    const deduplicationKey = `PURCHASE_${orderId}`;

    if (window.fbq) {
      fbq('track', 'Purchase', {
        value: Number(totalAmount),
        currency: 'IDR'
      }, { eventID: deduplicationKey });
    }

    if (window.ttq) {
      ttq.track('CompletePayment', {
        value: Number(totalAmount),
        currency: 'IDR'
      }, { event_id: deduplicationKey });
    }
  };

  captureAdParameters();
})();