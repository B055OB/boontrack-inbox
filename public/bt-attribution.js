/**
 * BoonTrack Reseller Attribution Snippet (Directive RE-01 / Sprint P0)
 * Deployable on creator.boontrack.com, onlineboost.id, and any BoonTrack merchant storefronts.
 */
(function() {
  try {
    if (typeof window === 'undefined') return;

    var urlParams = new URLSearchParams(window.location.search);
    var rawCode = urlParams.get('r') || urlParams.get('reseller');

    if (rawCode) {
      var code = rawCode.trim();
      if (code) {
        // 1. Simpan ke localStorage dengan skema JSON penanda waktu (30 hari)
        var expiresAt = Date.now() + (30 * 86400 * 1000);
        var payload = { code: code, expires_at: expiresAt };
        try {
          localStorage.setItem('bt_reseller_attribution', JSON.stringify(payload));
          localStorage.setItem('boontrack_reseller_code', code);
        } catch (e) {}

        // 2. Pasang first-party cookie fallback
        try {
          document.cookie = 'bt_reseller_code=' + encodeURIComponent(code) + '; path=/; max-age=2592000; SameSite=Lax';
        } catch (e) {}
      }
    }

    // Resolusi active code
    function getActiveCode() {
      try {
        var raw = localStorage.getItem('bt_reseller_attribution');
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.code && parsed.expires_at && Date.now() < parsed.expires_at) {
            return parsed.code;
          }
        }
      } catch (e) {}

      try {
        var match = document.cookie.match(/(?:^|;\s*)bt_reseller_code=([^;]+)/);
        if (match && match[1]) {
          return decodeURIComponent(match[1]);
        }
      } catch (e) {}

      try {
        return localStorage.getItem('boontrack_reseller_code');
      } catch (e) {
        return null;
      }
    }

    var active = getActiveCode();
    if (!active) return;

    // 3. Injeksi atribut data-bt-reseller="KODE" secara otomatis ke seluruh tombol CTA checkout drawer
    function injectAttr() {
      try {
        var selectors = [
          'button[data-checkout]',
          'button[data-cta-checkout]',
          'button[data-checkout-trigger]',
          'button.btn-checkout',
          'a[data-checkout]',
          'form[data-checkout]',
          '[data-role="checkout-btn"]',
          '[data-role="checkout-drawer-trigger"]',
          '.checkout-drawer-btn',
          '#btn-checkout'
        ];
        var els = document.querySelectorAll(selectors.join(','));
        for (var i = 0; i < els.length; i++) {
          els[i].setAttribute('data-bt-reseller', active);
        }
      } catch (e) {}
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectAttr, { once: true });
    } else {
      injectAttr();
    }

    if (typeof MutationObserver !== 'undefined' && document.body) {
      var observer = new MutationObserver(function() { injectAttr(); });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  } catch (err) {
    console.warn('[BoonTrack Attribution] Error:', err);
  }
})();
