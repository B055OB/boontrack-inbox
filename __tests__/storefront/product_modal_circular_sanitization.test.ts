import {
  isDomOrReactFiber,
  sanitizeProductPayload,
  safeJsonStringify,
} from '@/lib/product-catalog';
import fs from 'fs';
import path from 'path';

describe('Product Modal Circular Structure & Payload Sanitization Test', () => {
  describe('1. isDomOrReactFiber Detection', () => {
    it('detects DOM Element mock objects', () => {
      const mockSpan = {
        nodeType: 1,
        tagName: 'SPAN',
        innerHTML: 'Badge Digital',
      };
      expect(isDomOrReactFiber(mockSpan)).toBe(true);
    });

    it('detects React SyntheticEvent mock objects', () => {
      const mockEvent = {
        _reactName: 'onClick',
        type: 'click',
        nativeEvent: {},
        preventDefault: () => {},
        bubbles: true,
        cancelable: true,
        defaultPrevented: false,
      };
      expect(isDomOrReactFiber(mockEvent)).toBe(true);
    });

    it('detects React Fiber properties', () => {
      const mockFiber = {
        __reactFiber$1234: {},
        __reactProps$1234: {},
      };
      expect(isDomOrReactFiber(mockFiber)).toBe(true);
    });

    it('returns false for pure plain objects, strings, numbers, arrays', () => {
      expect(isDomOrReactFiber('digital')).toBe(false);
      expect(isDomOrReactFiber(12345)).toBe(false);
      expect(isDomOrReactFiber({ id: 1, name: 'Ecourse' })).toBe(false);
      expect(isDomOrReactFiber(['tag1', 'tag2'])).toBe(false);
    });
  });

  describe('2. sanitizeProductPayload & Circular Reference Breaking', () => {
    it('breaks circular structures safely without throwing', () => {
      const circularProduct: any = {
        id: 'prod-1',
        name: 'Produk Circular Test',
        price: 50000,
        category: 'digital',
      };
      circularProduct.self = circularProduct;
      circularProduct.nested = { parent: circularProduct };

      expect(() => {
        const sanitized = sanitizeProductPayload(circularProduct);
        expect(sanitized.name).toBe('Produk Circular Test');
        expect(sanitized.price).toBe(50000);
        expect(sanitized.self).toBeUndefined();
      }).not.toThrow();
    });

    it('strips accidental HTMLSpanElement or SyntheticEvent placed in custom_badge or category', () => {
      const mockEvent: any = {
        _reactName: 'onClick',
        target: { nodeType: 1, tagName: 'SPAN', value: 'Badge' },
        preventDefault: () => {},
      };

      const pollutedProduct: any = {
        name: 'Ebook React',
        price: 99000,
        custom_badge: mockEvent,
        category: { nodeType: 1, tagName: 'BUTTON' },
        metadata: {
          event: mockEvent,
        },
      };

      const sanitized = sanitizeProductPayload(pollutedProduct);
      expect(sanitized.name).toBe('Ebook React');
      expect(sanitized.price).toBe(99000);
      expect(sanitized.custom_badge).toBe('');
      expect(sanitized.category).toBe('');
      expect(sanitized.metadata.event).toBeUndefined();
    });

    it('normalizes string and number primitives properly', () => {
      const rawProduct: any = {
        name: 'Template Notion',
        slug: 'template-notion',
        price: '150000',
        promo_price: '75000',
        category: 'template',
        custom_badge: 'Populer',
      };

      const sanitized = sanitizeProductPayload(rawProduct);
      expect(sanitized.price).toBe(150000);
      expect(sanitized.promo_price).toBe(75000);
      expect(sanitized.slug).toBe('template-notion');
      expect(sanitized.custom_badge).toBe('Populer');
    });
  });

  describe('3. safeJsonStringify Resilience', () => {
    it('stringifies object with circular reference without throwing Converting circular structure to JSON', () => {
      const circularObj: any = { name: 'Produk Berulang' };
      circularObj.circ = circularObj;

      expect(() => {
        const json = safeJsonStringify(circularObj);
        expect(typeof json).toBe('string');
        expect(json).toMatch(/"name"\s*:\s*"Produk Berulang"/);
      }).not.toThrow();
    });

    it('stringifies object containing HTMLSpanElement mock without throwing', () => {
      const pollutedObj: any = {
        name: 'Produk UI Mock',
        element: { nodeType: 1, tagName: 'SPAN', text: 'Badge' },
      };

      expect(() => {
        const json = safeJsonStringify(pollutedObj);
        expect(typeof json).toBe('string');
        expect(json).not.toContain('"tagName"');
      }).not.toThrow();
    });
  });

  describe('4. Source Code Verification for Handlers & Sanitizers', () => {
    const productModalPath = path.join(
      process.cwd(),
      'app/[tenant]/dashboard/components/ProductFormModal.tsx'
    );
    const dashboardHookPath = path.join(
      process.cwd(),
      'app/[tenant]/dashboard/hooks/useTenantDashboard.ts'
    );
    const singlePageModalPath = path.join(
      process.cwd(),
      'app/[tenant]/dashboard/components/SinglePageBuilderModal.tsx'
    );
    const productsApiRoutePath = path.join(
      process.cwd(),
      'app/api/v1/tenants/[slug]/products/route.ts'
    );

    const modalCode = fs.readFileSync(productModalPath, 'utf-8');
    const hookCode = fs.readFileSync(dashboardHookPath, 'utf-8');
    const singlePageCode = fs.readFileSync(singlePageModalPath, 'utf-8');
    const apiRouteCode = fs.readFileSync(productsApiRoutePath, 'utf-8');

    it('ProductFormModal: guards slug sync and set badge handlers against raw event passing', () => {
      expect(modalCode).toContain('handleSyncSlug = (e?: any)');
      expect(modalCode).toContain('handleSetBadge = (badge: any)');
      expect(modalCode).toContain('sanitizeProductPayload(cleanForm)');
      expect(modalCode).toContain('onClick={() => handleSyncSlug()}');
      expect(modalCode).toContain('onClick={() => handleSetBadge(');
    });

    it('SinglePageBuilderModal: sanitizes form and hardens slug sync button', () => {
      expect(singlePageCode).toContain('sanitizeProductPayload(singlePageForm)');
      expect(singlePageCode).toContain('const targetTitle = (typeof singlePageForm.headline === \'string\'');
    });

    it('useTenantDashboard: sanitizes products before localStorage, Supabase, and API sync', () => {
      expect(hookCode).toContain('safeJsonStringify(sanitizeProductPayload(updatedProducts))');
      expect(hookCode).toContain('const safeForm = sanitizeProductPayload(productForm)');
      expect(hookCode).toContain('safeJsonStringify(cleanProdPayload)');
    });

    it('Products API Route: parses and sanitizes incoming body defensively', () => {
      expect(apiRouteCode).toContain('const rawBody = await req.json();');
      expect(apiRouteCode).toContain('const body = sanitizeProductPayload(rawBody);');
      expect(apiRouteCode).toContain('safeJsonStringify(body)');
      expect(apiRouteCode).toContain('sanitizeProductPayload(updatedProducts)');
    });
  });
});
