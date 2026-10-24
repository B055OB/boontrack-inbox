/**
 * ============================================================================
 * BoonTrack OnlineBoost — Reseller Attribution Simulation (Local-First)
 * ============================================================================
 * 
 * IMPORTANT ARCHITECTURE & SECURITY NOTICE:
 * 1. This script is strictly a client-side simulation helper for local UX/prototype testing.
 * 2. Client-side URL parameters and localStorage CANNOT and MUST NOT serve as the
 *    source of truth for financial commissions, accounting, or reseller payouts.
 * 3. In the live production environment, the backend server must independently validate:
 *    - The existence, active status, and tier of the reseller in the database.
 *    - The mapping between tenant ('onlineboost'), SKU ('LP-CTWA-BOT-01'), and reseller ID.
 *    - Fraud prevention (self-referral detection, suspicious transaction velocity, signature validation).
 * 4. Namespace policy: Parameter 'r' (?r=KODE_RESELLER) is reserved exclusively for
 *    the reseller attribution layer. Platform affiliate/traffic parameters (?ref=) must
 *    not be commingled with this namespace.
 * ============================================================================
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'bt_onlineboost_reseller_sim_v1';
  var PARAM_NAME = 'r';
  var CODE_REGEX = /^[A-Za-z0-9_-]{3,20}$/;
  var TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 Days in milliseconds

  /**
   * Safely parse query string parameter
   */
  function getQueryParam(name) {
    try {
      var urlParams = new URLSearchParams(window.location.search);
      return urlParams.get(name);
    } catch (e) {
      console.warn('[OnlineBoost Reseller Sim] URLSearchParams unavailable or malformed URL', e);
      return null;
    }
  }

  /**
   * Validate and sanitize reseller code
   * Rejects any code containing HTML, script tags, special chars, or incorrect length
   */
  function sanitizeCode(code) {
    if (!code || typeof code !== 'string') return null;
    var trimmed = code.trim().toUpperCase();
    if (CODE_REGEX.test(trimmed)) {
      return trimmed;
    }
    return null;
  }

  /**
   * Read stored reseller simulation from localStorage with TTL expiry check
   */
  function getStoredReseller() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }

      // Check TTL expiration
      var now = Date.now();
      if (!parsed.expiry || now > parsed.expiry) {
        console.info('[OnlineBoost Reseller Sim] Stored reseller attribution expired. Clearing storage.');
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }

      // Re-validate code format against regex
      var validCode = sanitizeCode(parsed.code);
      if (!validCode) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }

      return {
        code: validCode,
        timestamp: parsed.timestamp || now,
        expiry: parsed.expiry
      };
    } catch (err) {
      console.warn('[OnlineBoost Reseller Sim] Failed to read/parse localStorage item, purging.', err);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (ignore) {}
      return null;
    }
  }

  /**
   * Save valid reseller attribution into localStorage with 30-day TTL
   */
  function saveReseller(code) {
    var valid = sanitizeCode(code);
    if (!valid) return null;

    var now = Date.now();
    var payload = {
      code: valid,
      timestamp: now,
      expiry: now + TTL_MS
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      console.info('[OnlineBoost Reseller Sim] Saved attribution for reseller:', valid);
      return payload;
    } catch (err) {
      console.warn('[OnlineBoost Reseller Sim] Storage write failed (e.g. QuotaExceeded or Private Browsing)', err);
      return payload; // still return memory representation
    }
  }

  /**
   * Apply reseller attribution attribute to all matching CTA buttons in DOM
   */
  function applyAttributionToDOM(code) {
    var buttons = document.querySelectorAll('[data-bt-checkout]');
    buttons.forEach(function (btn) {
      if (code) {
        btn.setAttribute('data-bt-reseller', code);
      } else {
        btn.removeAttribute('data-bt-reseller');
      }
    });

    // Notify any listening components (e.g. Mock Checkout Drawer)
    try {
      window.dispatchEvent(new CustomEvent('bt:reseller:updated', {
        detail: {
          code: code || null,
          hasAttribution: Boolean(code)
        }
      }));
    } catch (e) {
      // Fallback for older browsers
    }
  }

  /**
   * Main attribution lifecycle orchestration
   */
  function initAttribution() {
    var paramValue = getQueryParam(PARAM_NAME);
    var activeCode = null;

    if (paramValue !== null) {
      var sanitized = sanitizeCode(paramValue);
      if (sanitized) {
        var saved = saveReseller(sanitized);
        activeCode = saved ? saved.code : null;
      } else {
        console.warn('[OnlineBoost Reseller Sim] URL parameter ?r=' + paramValue + ' rejected due to invalid format (allowed: 3-20 alphanumeric chars, dashes, underscores).');
      }
    }

    // If no fresh valid parameter in URL, inspect existing valid stored attribution
    if (!activeCode) {
      var stored = getStoredReseller();
      if (stored) {
        activeCode = stored.code;
        console.info('[OnlineBoost Reseller Sim] Restored attribution from active 30-day session:', activeCode);
      }
    }

    applyAttributionToDOM(activeCode);

    // Expose read-only helper on window.BoonTrackResellerSim
    window.OnlineBoostResellerSim = window.BoonTrackResellerSim = {
      getActiveCode: function () {
        return activeCode;
      },
      clearSimulation: function () {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch (e) {}
        activeCode = null;
        applyAttributionToDOM(null);
        console.info('[OnlineBoost Reseller Sim] Attribution simulation reset.');
      },
      simulateCode: function (manualCode) {
        var clean = sanitizeCode(manualCode);
        if (clean) {
          saveReseller(clean);
          activeCode = clean;
          applyAttributionToDOM(clean);
          return true;
        }
        return false;
      }
    };
  }

  // Execute after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAttribution);
  } else {
    initAttribution();
  }
})();
