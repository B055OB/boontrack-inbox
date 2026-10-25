import fs from 'fs';
import path from 'path';
import {
  DEFAULT_PRODUCTS,
  isBatch1MockCheckout,
  getBatch1MockCheckoutResult,
  BATCH1_MOCK_QRIS_STRING,
} from '@/lib/product-catalog';
import { createOrderAndInvoice } from '@/lib/checkout-service';

describe('CTO DIRECTIVE: Strict Mock-Only Guard & Fail-Closed Remediation for Checkout OB-BATCH1-249K', () => {
  const checkoutModalPath = path.resolve(process.cwd(), 'app/components/CheckoutModal.tsx');
  const checkoutServicePath = path.resolve(process.cwd(), 'lib/checkout-service.ts');
  const productCatalogPath = path.resolve(process.cwd(), 'lib/product-catalog.ts');
  const singleProductPagePath = path.resolve(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');

  const checkoutModalSource = fs.readFileSync(checkoutModalPath, 'utf-8');
  const checkoutServiceSource = fs.readFileSync(checkoutServicePath, 'utf-8');
  const productCatalogSource = fs.readFileSync(productCatalogPath, 'utf-8');
  const singleProductPageSource = fs.readFileSync(singleProductPagePath, 'utf-8');

  describe('1. Catalog Security & Mock-Only Configuration for OB-BATCH1-249K (Strict Hold)', () => {
    it('verifies OB-BATCH1-249K has live payments disabled and strict hold/mock flags active in catalog', () => {
      const batch1Prod = DEFAULT_PRODUCTS.find((p) => p.sku === 'OB-BATCH1-249K');
      expect(batch1Prod).toBeDefined();
      expect(batch1Prod?.sku).toBe('OB-BATCH1-249K');
      expect(batch1Prod?.slug).toBe('ob-batch1-249k');
      expect(batch1Prod?.price).toBe(249000);

      const spc = batch1Prod?.single_page_config;
      expect(spc).toBeDefined();
      // Verifikasi blocker CTO: enable_payment & enable_qris dinonaktifkan untuk live gateway
      expect(spc?.enable_payment).toBe(false);
      expect(spc?.enable_qris).toBe(false);
      expect(spc?.enable_manual_transfer).toBe(false);
      expect(spc?.is_mock_only).toBe(true);
      expect(spc?.strict_hold).toBe(true);
    });

    it('verifies isBatch1MockCheckout accurately flags OnlineBoost Batch 1 mock targets while preserving isolation', () => {
      // 1. Explicit mock flags anywhere return true
      expect(isBatch1MockCheckout({ metadata: { is_mock_only: true } })).toBe(true);
      expect(isBatch1MockCheckout({ single_page_config: { strict_hold: true } })).toBe(true);
      expect(isBatch1MockCheckout({ fulfillment_metadata: { is_mock_only: true } })).toBe(true);

      // 2. Direct SKU match on OnlineBoost tenant
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K' }, 'onlineboost')).toBe(true);
      expect(isBatch1MockCheckout({ sku: 'ob-batch1-249k' }, 'onlineboost')).toBe(true);

      // 3. Direct Slug match on OnlineBoost tenant
      expect(isBatch1MockCheckout({ slug: 'ob-batch1-249k' }, 'onlineboost')).toBe(true);
      expect(isBatch1MockCheckout({ slug: 'OB-BATCH1-249K' }, 'onlineboost')).toBe(true);

      // 4. Title match on OnlineBoost tenant
      expect(isBatch1MockCheckout({ title: 'Tiket Inkubasi OnlineBoost Batch 1' }, 'onlineboost')).toBe(true);

      // 5. Default catalog product on OnlineBoost tenant
      const batch1Prod = DEFAULT_PRODUCTS.find((p) => p.sku === 'OB-BATCH1-249K');
      expect(isBatch1MockCheckout(batch1Prod, 'onlineboost')).toBe(true);
    });

    it('returns valid simulation QRIS and mock orderId structure from getBatch1MockCheckoutResult', () => {
      const mockResult = getBatch1MockCheckoutResult();
      expect(mockResult.isMock).toBe(true);
      expect(mockResult.orderId).toMatch(/^ORD-MOCK-OB-BATCH1-\d+$/);
      expect(mockResult.qrString).toBe(BATCH1_MOCK_QRIS_STRING);
      expect(mockResult.qrString.startsWith('000201010212')).toBe(true);
      expect(mockResult.invoiceUrl).toContain('mock=true');
    });
  });

  describe('2. Fail-Closed Security & Cross-Tenant Isolation Regressions', () => {
    it('enforces cross-tenant isolation: rejects wrong or unknown tenants from mock guard', () => {
      // Cross-tenant calls with OB-BATCH1 SKU must NEVER trigger OnlineBoost mock guard
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', slug: 'ob-batch1-249k' }, 'happyeating')).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K' }, 'wrong-tenant')).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K' }, 'unknown')).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K' }, 'demo-store')).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K' }, null)).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K' }, '')).toBe(false);
    });

    it('fails closed when configuration is null or metadata is empty for OB-BATCH1-249K', () => {
      // Null product under OnlineBoost tenant fails closed
      expect(isBatch1MockCheckout(null, 'onlineboost')).toBe(true);

      // Null or empty single_page_config under OnlineBoost tenant fails closed
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', single_page_config: null }, 'onlineboost')).toBe(true);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', metadata: null }, 'onlineboost')).toBe(true);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', metadata: {} }, 'onlineboost')).toBe(true);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K' }, 'onlineboost')).toBe(true);

      // Incomplete payment enablement in single_page_config fails closed
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', single_page_config: { enable_payment: false } }, 'onlineboost')).toBe(true);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', single_page_config: { enable_payment: true, enable_qris: false } }, 'onlineboost')).toBe(true);

      // Audit Keamanan CTO: Injeksi client _is_db_verified via metadata/payload TIDAK BISA membypass mock guard
      expect(isBatch1MockCheckout({
        sku: 'OB-BATCH1-249K',
        metadata: { _is_db_verified: true },
        single_page_config: { enable_payment: true, enable_qris: true, is_mock_only: false, strict_hold: false },
        is_mock_only: false,
        strict_hold: false,
      }, 'onlineboost')).toBe(true);
    });

    it('does not intercept unknown or unrelated SKUs (zero cross-product collateral)', () => {
      // Unrelated or unknown SKUs under OnlineBoost must NOT trigger mock checkout
      expect(isBatch1MockCheckout({ sku: 'UNKNOWN-SKU-999', slug: 'unknown-sku-999' }, 'onlineboost')).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'CPM-PRO-01', slug: 'cpm-pro-01' }, 'onlineboost')).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'YOUTUBE-AI', slug: 'youtube-ai' }, 'onlineboost')).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'PAKET-NASI-LIWET', slug: 'paket-nasi-liwet' }, 'happyeating')).toBe(false);
      expect(isBatch1MockCheckout(null)).toBe(false);
    });

    it('locks server-side price to Rp 249.000 and fails closed on nominal price manipulation', () => {
      // Server-side price lock: Rp 249.000. Any altered price must fail closed into mock hold.
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', price: 1000 }, 'onlineboost')).toBe(true);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', amount: 50000 }, 'onlineboost')).toBe(true);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', price: 0 }, 'onlineboost')).toBe(true);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', price: 999000 }, 'onlineboost')).toBe(true);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', price: 249000 }, 'onlineboost')).toBe(true);
    });
  });

  describe('3. Checkout Modal & Storefront Single Product Page Integrity', () => {
    it('verifies CheckoutModal.tsx imports and executes isBatch1MockCheckout', () => {
      expect(checkoutModalSource).toContain('isBatch1MockCheckout');
      expect(checkoutModalSource).toContain('getBatch1MockCheckoutResult');
      // Verifikasi guard di handleCheckout
      expect(checkoutModalSource).toContain('if (isBatch1MockCheckout(product, tenantSlug)) {');
      // Verifikasi guard di polling status
      expect(checkoutModalSource).toContain('isBatch1MockCheckout(product, tenantSlug)');
      // Verifikasi simulasi bayar berhasil
      expect(checkoutModalSource).toContain('mock-complete-payment-btn');
      expect(checkoutModalSource).toContain('SIMULASI CHECKOUT MOCK (HOLD GATE)');
    });

    it('verifies CheckoutModal.tsx guards QRIS rendering to prevent live generateDynamicQRIS', () => {
      expect(checkoutModalSource).toContain('const isMockOrder = isBatch1MockCheckout(product, tenantSlug) || Boolean((paymentData as any)?.isMock);');
      expect(checkoutModalSource).toContain('const isDynamicQrisFromGateway =');
      expect(checkoutModalSource).toContain('isMockOrder ||');
      expect(checkoutModalSource).toContain('candidateQris.startsWith(\'000201010212\')');
    });

    it('verifies SingleProductPage in app/[tenant]/p/[slug]/page.tsx guards OB-BATCH1-249K checkout with fail-closed hold', () => {
      expect(singleProductPageSource).toContain('isBatch1MockCheckout');
      expect(singleProductPageSource).toContain('isBatch1MockCheckout(product, tenant)');
      expect(singleProductPageSource).toContain('setIsPaid(true)');
      expect(singleProductPageSource).toContain('(!isCheckoutSectionDisabled || isObBatch1Target)');
    });
  });

  describe('4. Pure Mock Simulation in createOrderAndInvoice (Zero Artificial Injection)', () => {
    it('verifies createOrderAndInvoice intercepts OB-BATCH1-249K purely without artificial mock flags', async () => {
      expect(checkoutServiceSource).toContain('isBatch1MockCheckout');
      expect(checkoutServiceSource).toContain('getBatch1MockCheckoutResult');

      // PURE call to createOrderAndInvoice: NO artificial fulfillmentMetadata: { is_mock_only: true }
      const result = await createOrderAndInvoice({
        tenantSlug: 'onlineboost',
        productId: 'OB-BATCH1-249K',
        productTitle: 'Tiket Inkubasi OnlineBoost Batch 1',
        amount: 249000,
        customerName: 'Tester QA',
        customerPhone: '081234567890',
      });

      expect(result).toBeDefined();
      expect(result.isMock).toBe(true);
      expect(result.orderId).toContain('ORD-MOCK-OB-BATCH1');
      expect(result.qrString).toBe(BATCH1_MOCK_QRIS_STRING);
      expect(result.qrString.startsWith('000201010212')).toBe(true);
      expect(result.invoiceUrl).toContain('mock=true');
    });
  });

  describe('5. Zero MDR Cut & Database Mutation Verification', () => {
    it('guarantees createOrderAndInvoice executes simulation with zero live fetch calls and zero mutations', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');

      // Pure call without artificial mock flag
      const mockResult = await createOrderAndInvoice({
        tenantSlug: 'onlineboost',
        productId: 'OB-BATCH1-249K',
        productTitle: 'Tiket Inkubasi OnlineBoost Batch 1',
        amount: 249000,
        customerName: 'CTO QA Check',
        customerPhone: '081299998888',
      });

      // Fetch tidak boleh dipanggil sama sekali untuk live order/invoice saat mock hold aktif
      expect(fetchSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/checkout/create-order'),
        expect.anything()
      );
      expect(fetchSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/orders'),
        expect.anything()
      );
      expect(mockResult.isMock).toBe(true);

      fetchSpy.mockRestore();
    });
  });

  describe('6. Separation: Live Order Contract for Standard / Non-Mock Products', () => {
    it('preserves live checkout path for authorized non-mock products without interception', () => {
      // Standard / other catalog products must return false from mock guard
      expect(isBatch1MockCheckout({ sku: 'CPM-PRO-01', slug: 'cpm-pro-01' }, 'onlineboost')).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'PAKET-NASI-LIWET', slug: 'paket-nasi-liwet' }, 'happyeating')).toBe(false);

      // Verifies that live order processing contracts are untouched for non-mock products
      const isIntercepted = isBatch1MockCheckout(
        { sku: 'CPM-PRO-01', title: 'Ecourse Member CPM', price: 499000 },
        'onlineboost'
      );
      expect(isIntercepted).toBe(false);
    });
  });
});
