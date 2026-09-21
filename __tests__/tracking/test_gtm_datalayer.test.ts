/**
 * @file __tests__/tracking/test_gtm_datalayer.test.ts
 * @description Unit tests for BATCH 2 / Ticket 2.1 — GTM DataLayer & Tracking Engine.
 *
 * Test suites:
 *   1. Entitlement Access Control (isTierGtmEligible)
 *      - Allowed: 'ads', 'scale', 'ads_performance', 'team_scale', 'pro_scale', 'enterprise'
 *      - Blocked: 'lite', 'solo', 'checkout_lite', 'starter', 'solo_trial'
 *      - Edge cases: null, undefined, empty, casing, whitespace
 *   2. Privacy Utilities (maskPhone, maskEmail, isPiiKey)
 *   3. Deep Payload Sanitization (sanitizeDataLayerPayload, sanitizeItem)
 *   4. Standard E-Commerce Events (view_item, begin_checkout, purchase)
 *      - GA4 schema compliance
 *      - PII leakage prevention (customer name, phone, email stripped)
 *      - Entitlement guard in emitters
 *      - Single item vs multi-item payloads
 *   5. GTM Script Injection (injectGtmScript)
 *      - Tier entitlement guard (blocks 'lite' and 'solo')
 *      - Container ID format validation
 *      - Head and body injection
 *      - Idempotency (prevent duplicate script tags)
 *   6. Server-Side Safety & DataLayer helpers (pushToDataLayer, getDataLayer, resetDataLayerForTesting)
 */

import {
  isTierGtmEligible,
  GTM_ALLOWED_TIERS,
  GTM_BLOCKED_TIERS,
  isPiiKey,
  maskPhone,
  maskEmail,
  sanitizeItem,
  sanitizeDataLayerPayload,
  pushToDataLayer,
  getDataLayer,
  resetDataLayerForTesting,
  pushViewItem,
  pushBeginCheckout,
  pushPurchase,
  pushCustomEvent,
  injectGtmScript,
} from '@/lib/tracking/gtm-datalayer';

describe('BATCH 2: GTM DataLayer & Tracking Engine', () => {
  // -------------------------------------------------------------------------
  // 1. Entitlement Access Control (isTierGtmEligible)
  // -------------------------------------------------------------------------
  describe('Entitlement Access Control — isTierGtmEligible()', () => {
    test('Allows tier "ads" and alias variations', () => {
      expect(isTierGtmEligible('ads')).toBe(true);
      expect(isTierGtmEligible('ADS')).toBe(true);
      expect(isTierGtmEligible('ads_performance')).toBe(true);
      expect(isTierGtmEligible('ADS_PERFORMANCE')).toBe(true);
      expect(isTierGtmEligible('Ads Performance')).toBe(true);
      expect(isTierGtmEligible('PRO_SCALE')).toBe(true);
      expect(isTierGtmEligible('pro_scale')).toBe(true);
      expect(isTierGtmEligible('pro')).toBe(true);
      expect(isTierGtmEligible('growth_pro')).toBe(true);
    });

    test('Allows tier "scale" and alias variations', () => {
      expect(isTierGtmEligible('scale')).toBe(true);
      expect(isTierGtmEligible('SCALE')).toBe(true);
      expect(isTierGtmEligible('team_scale')).toBe(true);
      expect(isTierGtmEligible('TEAM_SCALE')).toBe(true);
      expect(isTierGtmEligible('Team Scale')).toBe(true);
      expect(isTierGtmEligible('ENTERPRISE')).toBe(true);
      expect(isTierGtmEligible('enterprise')).toBe(true);
      expect(isTierGtmEligible('team')).toBe(true);
    });

    test('Strictly blocks tier "lite" and "solo" (no GTM access)', () => {
      expect(isTierGtmEligible('lite')).toBe(false);
      expect(isTierGtmEligible('LITE')).toBe(false);
      expect(isTierGtmEligible('checkout_lite')).toBe(false);
      expect(isTierGtmEligible('CHECKOUT_LITE')).toBe(false);
      expect(isTierGtmEligible('Checkout Lite')).toBe(false);

      expect(isTierGtmEligible('solo')).toBe(false);
      expect(isTierGtmEligible('SOLO')).toBe(false);
      expect(isTierGtmEligible('Solo')).toBe(false);
      expect(isTierGtmEligible('starter')).toBe(false);
      expect(isTierGtmEligible('STARTER')).toBe(false);
      expect(isTierGtmEligible('solo_trial')).toBe(false);
      expect(isTierGtmEligible('FREE')).toBe(false);
    });

    test('Handles invalid, empty, or nil tier inputs safely', () => {
      expect(isTierGtmEligible(null)).toBe(false);
      expect(isTierGtmEligible(undefined)).toBe(false);
      expect(isTierGtmEligible('')).toBe(false);
      expect(isTierGtmEligible('   ')).toBe(false);
      expect(isTierGtmEligible('unknown_tier')).toBe(false);
    });

    test('Canonical GTM_ALLOWED_TIERS and GTM_BLOCKED_TIERS constants are defined', () => {
      expect(GTM_ALLOWED_TIERS).toContain('ADS_PERFORMANCE');
      expect(GTM_ALLOWED_TIERS).toContain('TEAM_SCALE');
      expect(GTM_ALLOWED_TIERS).toContain('PRO_SCALE');
      expect(GTM_ALLOWED_TIERS).toContain('ENTERPRISE');

      expect(GTM_BLOCKED_TIERS).toContain('CHECKOUT_LITE');
      expect(GTM_BLOCKED_TIERS).toContain('SOLO');
      expect(GTM_BLOCKED_TIERS).toContain('LITE');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Privacy Utilities (maskPhone, maskEmail, isPiiKey)
  // -------------------------------------------------------------------------
  describe('Privacy Utilities', () => {
    describe('maskPhone()', () => {
      test('Masks standard Indonesian mobile numbers keeping only 4 digits', () => {
        expect(maskPhone('081234567890')).toBe('0812***');
        expect(maskPhone('08571234567')).toBe('0857***');
      });

      test('Masks international formatted numbers', () => {
        expect(maskPhone('+6281234567890')).toBe('6281***');
      });

      test('Handles short or empty numbers safely', () => {
        expect(maskPhone('123')).toBe('***');
        expect(maskPhone('')).toBe('');
        expect(maskPhone(null as any)).toBe('');
      });
    });

    describe('maskEmail()', () => {
      test('Masks local part of email preserving first letter and domain', () => {
        expect(maskEmail('buyer@gmail.com')).toBe('b***@gmail.com');
        expect(maskEmail('alldy.pratama@boontrack.com')).toBe('a***@boontrack.com');
      });

      test('Handles invalid or empty email safely', () => {
        expect(maskEmail('invalid-email')).toBe('***');
        expect(maskEmail('')).toBe('');
        expect(maskEmail(null as any)).toBe('');
      });
    });

    describe('isPiiKey()', () => {
      test('Identifies sensitive customer and credential keys', () => {
        expect(isPiiKey('name')).toBe(true);
        expect(isPiiKey('customer_name')).toBe(true);
        expect(isPiiKey('buyerName')).toBe(true);
        expect(isPiiKey('phone')).toBe(true);
        expect(isPiiKey('customer_phone')).toBe(true);
        expect(isPiiKey('buyerPhone')).toBe(true);
        expect(isPiiKey('whatsapp')).toBe(true);
        expect(isPiiKey('email')).toBe(true);
        expect(isPiiKey('customer_email')).toBe(true);
        expect(isPiiKey('address')).toBe(true);
        expect(isPiiKey('shipping_address')).toBe(true);
        expect(isPiiKey('password')).toBe(true);
        expect(isPiiKey('rekening')).toBe(true);
        expect(isPiiKey('account_number')).toBe(true);
        expect(isPiiKey('token')).toBe(true);
        expect(isPiiKey('secret')).toBe(true);
        expect(isPiiKey('ip_address')).toBe(true);
      });

      test('Preserves GA4 e-commerce standard keys', () => {
        expect(isPiiKey('item_name')).toBe(false);
        expect(isPiiKey('item_brand')).toBe(false);
        expect(isPiiKey('item_category')).toBe(false);
        expect(isPiiKey('item_variant')).toBe(false);
        expect(isPiiKey('store_name')).toBe(false);
        expect(isPiiKey('price')).toBe(false);
        expect(isPiiKey('quantity')).toBe(false);
        expect(isPiiKey('currency')).toBe(false);
        expect(isPiiKey('transaction_id')).toBe(false);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 3. Deep Payload Sanitization (sanitizeDataLayerPayload)
  // -------------------------------------------------------------------------
  describe('Deep Payload Sanitization — sanitizeDataLayerPayload()', () => {
    test('Removes all PII keys recursively from complex payloads', () => {
      const dirtyPayload = {
        event: 'purchase',
        customer_name: 'Budi Santoso',
        buyer_phone: '081234567890',
        customer_email: 'budi@example.com',
        shipping_address: 'Jl. Sudirman No. 10 Jakarta',
        ecommerce: {
          transaction_id: 'TXN-998877',
          currency: 'IDR',
          value: 150000,
          customer_secret: 'super_secret_token',
          items: [
            {
              item_id: 'PROD-1',
              item_name: 'Buku Bisnis Digital',
              price: 150000,
              quantity: 1,
            },
          ],
        },
      };

      const clean = sanitizeDataLayerPayload(dirtyPayload);

      // Verify PII is stripped
      expect(clean).not.toHaveProperty('customer_name');
      expect(clean).not.toHaveProperty('buyer_phone');
      expect(clean).not.toHaveProperty('customer_email');
      expect(clean).not.toHaveProperty('shipping_address');
      expect(clean.ecommerce).not.toHaveProperty('customer_secret');

      // Verify legitimate e-commerce attributes are retained
      expect(clean.event).toBe('purchase');
      expect(clean.ecommerce.transaction_id).toBe('TXN-998877');
      expect(clean.ecommerce.currency).toBe('IDR');
      expect(clean.ecommerce.value).toBe(150000);
      expect(clean.ecommerce.items).toHaveLength(1);
      expect(clean.ecommerce.items[0].item_name).toBe('Buku Bisnis Digital');
    });

    test('Sanitizes items with sanitizeItem() ensuring valid types and bounds', () => {
      const item = sanitizeItem({
        item_id: 'P-123',
        item_name: '  Kemeja Batik  ',
        price: -5000, // invalid negative price
        quantity: 0, // invalid quantity
      });

      expect(item.item_id).toBe('P-123');
      expect(item.item_name).toBe('Kemeja Batik');
      expect(item.price).toBe(0); // clamped to 0
      expect(item.quantity).toBe(1); // clamped to min 1
    });

    test('Handles primitives, null, and empty payloads without error', () => {
      expect(sanitizeDataLayerPayload(null)).toBeNull();
      expect(sanitizeDataLayerPayload(undefined)).toBeUndefined();
      expect(sanitizeDataLayerPayload('plain_string')).toBe('plain_string');
      expect(sanitizeDataLayerPayload(12345)).toBe(12345);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Standard E-Commerce Events (pushViewItem, pushBeginCheckout, pushPurchase)
  // -------------------------------------------------------------------------
  describe('Standard E-Commerce Event Emitters', () => {
    // Setup simulated browser environment for dataLayer tests
    beforeEach(() => {
      (global as any).window = {
        dataLayer: [],
      };
    });

    afterEach(() => {
      delete (global as any).window;
    });

    describe('pushViewItem()', () => {
      test('Pushes GA4 view_item event for eligible tier "ads"', () => {
        const pushed = pushViewItem('ads', {
          productId: 'SKU-001',
          productName: 'Sepatu Kulit Pria',
          price: 450000,
          productType: 'physical',
          storeName: 'BoonStore',
        });

        expect(pushed).toBe(true);
        const dataLayer = getDataLayer();
        expect(dataLayer).toHaveLength(1);

        const event = dataLayer[0];
        expect(event.event).toBe('view_item');
        expect(event.ecommerce).toEqual({
          currency: 'IDR',
          value: 450000,
          items: [
            {
              item_id: 'SKU-001',
              item_name: 'Sepatu Kulit Pria',
              price: 450000,
              quantity: 1,
              item_category: 'PHYSICAL',
              item_brand: 'BoonStore',
            },
          ],
        });
      });

      test('Pushes view_item with custom multi-item array for tier "scale"', () => {
        const pushed = pushViewItem('team_scale', {
          items: [
            { item_id: 'A1', item_name: 'Item 1', price: 100000, quantity: 2 },
            { item_id: 'B2', item_name: 'Item 2', price: 50000, quantity: 1 },
          ],
        });

        expect(pushed).toBe(true);
        const event = getDataLayer()[0];
        expect(event.event).toBe('view_item');
        expect((event.ecommerce as any).value).toBe(250000); // 100k*2 + 50k*1
        expect((event.ecommerce as any).items).toHaveLength(2);
      });

      test('Blocks pushViewItem for ineligible tier "lite" or "solo"', () => {
        expect(pushViewItem('lite', { productId: 'P1', productName: 'Item', price: 10000 })).toBe(false);
        expect(pushViewItem('solo', { productId: 'P1', productName: 'Item', price: 10000 })).toBe(false);
        expect(getDataLayer()).toHaveLength(0);
      });
    });

    describe('pushBeginCheckout()', () => {
      test('Pushes GA4 begin_checkout event for eligible tier "ADS_PERFORMANCE"', () => {
        const pushed = pushBeginCheckout('ADS_PERFORMANCE', {
          productId: 'COURSE-AI',
          productName: 'Mastering AI Agent',
          price: 299000,
          quantity: 2,
          coupon: 'PROMO2026',
        });

        expect(pushed).toBe(true);
        const event = getDataLayer()[0];
        expect(event.event).toBe('begin_checkout');
        expect(event.ecommerce).toEqual({
          currency: 'IDR',
          value: 598000, // 299k * 2
          coupon: 'PROMO2026',
          items: [
            {
              item_id: 'COURSE-AI',
              item_name: 'Mastering AI Agent',
              price: 299000,
              quantity: 2,
            },
          ],
        });
      });

      test('Blocks pushBeginCheckout for tier "CHECKOUT_LITE"', () => {
        const pushed = pushBeginCheckout('CHECKOUT_LITE', {
          productId: 'PROD-1',
          productName: 'Item',
          price: 10000,
        });

        expect(pushed).toBe(false);
        expect(getDataLayer()).toHaveLength(0);
      });
    });

    describe('pushPurchase()', () => {
      test('Pushes GA4 purchase event with revenue value and transaction ID', () => {
        const pushed = pushPurchase('ads', {
          transactionId: 'INV-20260921-001',
          value: 350000,
          productId: 'HOODIE-BLK',
          productName: 'Oversized Black Hoodie',
          quantity: 1,
          affiliateCode: 'DISCOUNT50',
        });

        expect(pushed).toBe(true);
        const event = getDataLayer()[0];
        expect(event.event).toBe('purchase');
        expect(event.ecommerce).toEqual({
          transaction_id: 'INV-20260921-001',
          currency: 'IDR',
          value: 350000,
          coupon: 'DISCOUNT50',
          items: [
            {
              item_id: 'HOODIE-BLK',
              item_name: 'Oversized Black Hoodie',
              price: 350000,
              quantity: 1,
            },
          ],
        });
      });

      test('Guarantees customer PII is NEVER emitted to dataLayer during purchase', () => {
        pushPurchase('scale', {
          transactionId: 'ORD-SECURE-999',
          value: 500000,
          productId: 'PROD-99',
          productName: 'Secret Product',
          customerName: 'Ahmad Fauzi', // PII
          customerPhone: '081299998888', // PII
          customerEmail: 'ahmad.fauzi@example.com', // PII
        });

        const event = getDataLayer()[0];
        expect(event.event).toBe('purchase');

        // Check top-level and ecommerce payload for any PII
        const payloadStr = JSON.stringify(event);
        expect(payloadStr).not.toContain('Ahmad Fauzi');
        expect(payloadStr).not.toContain('081299998888');
        expect(payloadStr).not.toContain('ahmad.fauzi@example.com');
        expect((event.ecommerce as any).transaction_id).toBe('ORD-SECURE-999');
      });

      test('Blocks pushPurchase for tier "solo"', () => {
        const pushed = pushPurchase('solo', {
          transactionId: 'TX-1',
          value: 100000,
          productId: 'P1',
          productName: 'Product',
        });

        expect(pushed).toBe(false);
        expect(getDataLayer()).toHaveLength(0);
      });
    });

    describe('pushCustomEvent()', () => {
      test('Emits custom event with sanitization for eligible tier', () => {
        const pushed = pushCustomEvent('ads', 'whatsapp_click', {
          product_id: 'PROD-WA',
          customer_phone: '08123456789', // Should be stripped
          button_location: 'sticky_bottom',
        });

        expect(pushed).toBe(true);
        const event = getDataLayer()[0];
        expect(event.event).toBe('whatsapp_click');
        expect(event).toHaveProperty('product_id', 'PROD-WA');
        expect(event).toHaveProperty('button_location', 'sticky_bottom');
        expect(event).not.toHaveProperty('customer_phone');
      });
    });

    describe('resetDataLayerForTesting()', () => {
      test('Empties the dataLayer array', () => {
        pushViewItem('ads', { productId: 'P1', productName: 'Item', price: 1000 });
        expect(getDataLayer()).toHaveLength(1);

        resetDataLayerForTesting();
        expect(getDataLayer()).toHaveLength(0);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 5. GTM Script Injection (injectGtmScript)
  // -------------------------------------------------------------------------
  describe('GTM Script Injection — injectGtmScript()', () => {
    let mockHead: HTMLElement;
    let mockBody: HTMLElement;

    beforeEach(() => {
      // Mock basic DOM environment in node test runner
      const elements: Record<string, any> = {};

      mockHead = {
        appendChild: jest.fn((child: any) => {
          if (child.id) elements[child.id] = child;
        }),
      } as any;

      mockBody = {
        prepend: jest.fn((child: any) => {
          if (child.id) elements[child.id] = child;
        }),
      } as any;

      (global as any).document = {
        head: mockHead,
        body: mockBody,
        getElementById: jest.fn((id: string) => elements[id] || null),
        createElement: jest.fn((tag: string) => ({
          tagName: tag.toUpperCase(),
          style: {},
          appendChild: jest.fn(),
        })),
      };

      (global as any).window = {
        dataLayer: [],
      };
    });

    afterEach(() => {
      delete (global as any).document;
      delete (global as any).window;
    });

    test('Injects GTM script and noscript for eligible tier "ads"', () => {
      const success = injectGtmScript('GTM-ABC1234', 'ads');

      expect(success).toBe(true);
      expect(mockHead.appendChild).toHaveBeenCalledTimes(1);
      expect(mockBody.prepend).toHaveBeenCalledTimes(1);

      const injectedScript = (mockHead.appendChild as jest.Mock).mock.calls[0][0];
      expect(injectedScript.id).toBe('gtm-injected-GTM-ABC1234');
      expect(injectedScript.src).toBe('https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234');
      expect(injectedScript.async).toBe(true);
    });

    test('Injects GTM script for eligible tier "scale"', () => {
      const success = injectGtmScript('GTM-XYZ9999', 'team_scale');
      expect(success).toBe(true);
      expect(mockHead.appendChild).toHaveBeenCalledTimes(1);
    });

    test('Strictly blocks GTM script injection for tier "lite"', () => {
      const success = injectGtmScript('GTM-ABC1234', 'lite');
      expect(success).toBe(false);
      expect(mockHead.appendChild).not.toHaveBeenCalled();
      expect(mockBody.prepend).not.toHaveBeenCalled();
    });

    test('Strictly blocks GTM script injection for tier "solo"', () => {
      const success = injectGtmScript('GTM-ABC1234', 'solo');
      expect(success).toBe(false);
      expect(mockHead.appendChild).not.toHaveBeenCalled();
      expect(mockBody.prepend).not.toHaveBeenCalled();
    });

    test('Blocks GTM script injection when tier is null or missing', () => {
      expect(injectGtmScript('GTM-ABC1234', null)).toBe(false);
      expect(injectGtmScript('GTM-ABC1234', undefined)).toBe(false);
      expect(mockHead.appendChild).not.toHaveBeenCalled();
    });

    test('Rejects invalid GTM container ID format', () => {
      expect(injectGtmScript('INVALID-ID', 'ads')).toBe(false);
      expect(injectGtmScript('UA-1234567-1', 'ads')).toBe(false);
      expect(injectGtmScript('', 'ads')).toBe(false);
      expect(injectGtmScript(null, 'ads')).toBe(false);
      expect(mockHead.appendChild).not.toHaveBeenCalled();
    });

    test('Enforces idempotency: does not re-inject if container already present', () => {
      // First injection
      const first = injectGtmScript('GTM-SAME123', 'ads');
      expect(first).toBe(true);

      // Second injection with same ID
      const second = injectGtmScript('GTM-SAME123', 'ads');
      expect(second).toBe(false);
      expect(mockHead.appendChild).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Server-Side Rendering (SSR) Safety
  // -------------------------------------------------------------------------
  describe('Server-Side Rendering (SSR) Safety', () => {
    test('pushToDataLayer safely returns false when window is undefined', () => {
      // Ensure window is undefined
      delete (global as any).window;

      const result = pushToDataLayer({
        event: 'view_item',
        ecommerce: { currency: 'IDR', value: 1000, items: [] },
      });

      expect(result).toBe(false);
    });

    test('injectGtmScript safely returns false when document is undefined', () => {
      delete (global as any).document;

      const result = injectGtmScript('GTM-ABC1234', 'ads');
      expect(result).toBe(false);
    });
  });
});
