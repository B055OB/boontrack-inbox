/**
 * ============================================================================
 * BoonTrack OnlineBoost — Mock Checkout Drawer Engine (Local Prototype Only)
 * ============================================================================
 * 
 * STRICT PROTOTYPE DIRECTIVES:
 * 1. This drawer is purely a visual simulation and DOM contract validator.
 * 2. It DOES NOT dispatch live network requests to any payment gateways.
 * 3. It DOES NOT create invoices, initiate QRIS sessions, or fire Facebook/TikTok Purchase events.
 * 4. It strictly preserves the required BoonTrack native attributes:
 *    - data-bt-checkout
 *    - data-bt-tenant="onlineboost"
 *    - data-bt-sku="LP-CTWA-BOT-01"
 *    - data-bt-reseller="[KODE_RESELLER]" (populated by reseller-attribution.js)
 * 5. In production, this trigger will hand over control to the native BoonTrack
 *    checkout modal / WhatsApp CTWA orchestrator.
 * ============================================================================
 */

(function () {
  'use strict';

  var drawerEl = null;
  var backdropEl = null;
  var closeBtnEl = null;
  var formEl = null;
  var resultBoxEl = null;
  var resellerBadgeEl = null;

  var currentContext = {
    tenant: 'onlineboost',
    sku: 'LP-CTWA-BOT-01',
    reseller: null,
    priceFormatted: 'Rp 249.000'
  };

  /**
   * Safely set text content without innerHTML
   */
  function safeSetText(id, text) {
    var el = document.getElementById(id);
    if (el) {
      el.textContent = text;
    }
  }

  /**
   * Open the mock drawer and populate context from clicked button
   */
  function openDrawer(triggerBtn) {
    if (!drawerEl || !backdropEl) return;

    if (triggerBtn) {
      currentContext.tenant = triggerBtn.getAttribute('data-bt-tenant') || 'onlineboost';
      currentContext.sku = triggerBtn.getAttribute('data-bt-sku') || 'LP-CTWA-BOT-01';
      currentContext.reseller = triggerBtn.getAttribute('data-bt-reseller') || 
        (window.BoonTrackResellerSim && window.BoonTrackResellerSim.getActiveCode()) || null;
    }

    // Populate drawer UI safely
    safeSetText('bt-mock-tenant-display', currentContext.tenant);
    safeSetText('bt-mock-sku-display', currentContext.sku);
    safeSetText('bt-mock-price-display', currentContext.priceFormatted);

    updateResellerDisplay(currentContext.reseller);

    // Reset form states
    if (formEl) {
      formEl.style.display = 'block';
    }
    if (resultBoxEl) {
      resultBoxEl.style.display = 'none';
      resultBoxEl.innerHTML = ''; // safe since we populate programmatically
    }

    // Show elements
    backdropEl.classList.add('is-active');
    drawerEl.classList.add('is-active');
    document.body.classList.add('bt-drawer-open');

    // Focus first input for accessibility
    setTimeout(function () {
      var firstInput = document.getElementById('bt-mock-name');
      if (firstInput) {
        firstInput.focus();
      }
    }, 150);
  }

  /**
   * Close the mock drawer
   */
  function closeDrawer() {
    if (!drawerEl || !backdropEl) return;

    drawerEl.classList.remove('is-active');
    backdropEl.classList.remove('is-active');
    document.body.classList.remove('bt-drawer-open');
  }

  /**
   * Update the reseller badge in the drawer
   */
  function updateResellerDisplay(code) {
    var badge = document.getElementById('bt-mock-reseller-badge');
    var codeText = document.getElementById('bt-mock-reseller-code');
    var testInput = document.getElementById('bt-test-reseller-input');

    if (testInput && code) {
      testInput.value = code;
    }

    if (code) {
      if (badge) badge.classList.add('has-reseller');
      if (codeText) codeText.textContent = code + ' (Tersimulasi)';
    } else {
      if (badge) badge.classList.remove('has-reseller');
      if (codeText) codeText.textContent = 'Direct / Organik (Tanpa Kode Reseller)';
    }
  }

  /**
   * Handle simulated form submission
   */
  function handleSimulatedSubmit(e) {
    e.preventDefault();

    var nameInput = document.getElementById('bt-mock-name');
    var phoneInput = document.getElementById('bt-mock-phone');
    var emailInput = document.getElementById('bt-mock-email');

    var name = nameInput ? nameInput.value.trim() : '';
    var phone = phoneInput ? phoneInput.value.trim() : '';
    var email = emailInput ? emailInput.value.trim() : '';

    if (!name || !phone) {
      alert('Mohon lengkapi Nama dan No WhatsApp untuk simulasi.');
      return;
    }

    var activeReseller = currentContext.reseller || 
      (window.BoonTrackResellerSim && window.BoonTrackResellerSim.getActiveCode()) || 'DIRECT';

    // Hide input form, show simulated receipt
    if (formEl) formEl.style.display = 'none';
    if (resultBoxEl) {
      resultBoxEl.style.display = 'block';

      // Build simulated receipt safely with DOM methods
      resultBoxEl.textContent = ''; // clear

      var card = document.createElement('div');
      card.className = 'bt-sim-success-card';

      var icon = document.createElement('div');
      icon.className = 'bt-sim-icon-check';
      icon.textContent = '✓';
      card.appendChild(icon);

      var title = document.createElement('h4');
      title.className = 'bt-sim-title';
      title.textContent = 'Simulasi Checkout Berhasil!';
      card.appendChild(title);

      var desc = document.createElement('p');
      desc.className = 'bt-sim-desc';
      desc.textContent = 'Payload berikut berhasil divalidasi secara lokal sesuai spesifikasi kontrak data DOM:';
      card.appendChild(desc);

      var pre = document.createElement('pre');
      pre.className = 'bt-sim-payload';
      var payloadData = {
        status: 'SIMULATED_LOCAL_ONLY',
        note: 'TIDAK ADA REQUEST NETWORK LIVE YANG DIKIRIM',
        timestamp: new Date().toISOString(),
        orderContext: {
          tenant: currentContext.tenant,
          sku: currentContext.sku,
          price: 249000,
          currency: 'IDR',
          resellerAttribution: activeReseller
        },
        participant: {
          name: name,
          phone: phone,
          email: email || '(kosong)'
        }
      };
      pre.textContent = JSON.stringify(payloadData, null, 2);
      card.appendChild(pre);

      var notice = document.createElement('div');
      notice.className = 'bt-sim-alert-box';
      notice.textContent = '⚠️ Pengingat Founder: Di lingkungan production sesungguhnya, data di atas akan dikirimkan ke endpoint terisolasi untuk pembuatan invoice QRIS dan verifikasi signature reseller di sisi backend.';
      card.appendChild(notice);

      var resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'btn-reset-sim';
      resetBtn.textContent = 'Kembali ke Form Simulasi';
      resetBtn.addEventListener('click', function () {
        resultBoxEl.style.display = 'none';
        if (formEl) formEl.style.display = 'block';
      });
      card.appendChild(resetBtn);

      resultBoxEl.appendChild(card);
    }
  }

  /**
   * Bind event listeners to DOM
   */
  function initCheckoutDrawer() {
    drawerEl = document.getElementById('bt-mock-drawer');
    backdropEl = document.getElementById('bt-mock-backdrop');
    closeBtnEl = document.getElementById('bt-mock-close-btn');
    formEl = document.getElementById('bt-mock-checkout-form');
    resultBoxEl = document.getElementById('bt-mock-result-box');

    // Attach click listeners to all buttons matching [data-bt-checkout]
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-bt-checkout]');
      if (trigger) {
        e.preventDefault();
        openDrawer(trigger);
      }
    });

    if (closeBtnEl) {
      closeBtnEl.addEventListener('click', closeDrawer);
    }

    if (backdropEl) {
      backdropEl.addEventListener('click', closeDrawer);
    }

    if (formEl) {
      formEl.addEventListener('submit', handleSimulatedSubmit);
    }

    // Keyboard ESC to close
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawerEl && drawerEl.classList.contains('is-active')) {
        closeDrawer();
      }
    });

    // Listen for custom reseller updates from reseller-attribution.js
    window.addEventListener('bt:reseller:updated', function (e) {
      if (e.detail) {
        currentContext.reseller = e.detail.code;
        updateResellerDisplay(e.detail.code);
      }
    });

    // Wire up inline referral code test simulator
    var testBtn = document.getElementById('bt-btn-apply-test-reseller');
    var testInput = document.getElementById('bt-test-reseller-input');
    var clearBtn = document.getElementById('bt-btn-clear-test-reseller');

    if (testBtn && testInput) {
      testBtn.addEventListener('click', function () {
        var val = testInput.value.trim();
        if (window.BoonTrackResellerSim) {
          if (val) {
            var success = window.BoonTrackResellerSim.simulateCode(val);
            if (!success) {
              alert('Kode tidak valid! Format: 3-20 karakter alfanumerik (huruf, angka, tanda hubung).');
            }
          } else {
            window.BoonTrackResellerSim.clearSimulation();
          }
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (window.BoonTrackResellerSim) {
          window.BoonTrackResellerSim.clearSimulation();
          if (testInput) testInput.value = '';
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCheckoutDrawer);
  } else {
    initCheckoutDrawer();
  }
})();
