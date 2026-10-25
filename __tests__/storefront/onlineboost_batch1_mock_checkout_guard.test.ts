import fs from 'fs';
import path from 'path';
import {
  DEFAULT_PRODUCTS,
  isBatch1MockCheckout,
  getBatch1MockCheckoutResult,
  BATCH1_MOCK_QRIS_STRING,
} from '@/lib/product-catalog';
import { createOrderAndInvoice } from '@/lib/checkout-service';

describe('HOTFIX PR #78: Strict Mock-Only Guard for Checkout OB-BATCH1-249K', () => {
  const checkoutModalPath = path.resolve(process.cwd(), 'app/components/CheckoutModal.tsx');
  const checkoutServicePath = path.resolve(process.cwd(), 'lib/checkout-service.ts');
  const productCatalogPath = path.resolve(process.cwd(), 'lib/product-catalog.ts');
  const singleProductPagePath = path.resolve(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx');

  const checkoutModalSource = fs.readFileSync(checkoutModalPath, 'utf-8');
  const checkoutServiceSource = fs.readFileSync(checkoutServicePath, 'utf-8');
  const productCatalogSource = fs.readFileSync(productCatalogPath, 'utf-8');
  const singleProductPageSource = fs.readFileSync(singleProductPagePath, 'utf-8');

  describe('1. Catalog Security & Mock-Only Configuration for OB-BATCH1-249K', () => {
    it('verifies OB-BATCH1-249K has live payments disabled and strict hold/mock flags active', () => {
      const batch1Prod = DEFAULT_PRODUCTS.find((p) => p.sku === 'OB-BATCH1-249K');
      expect(batch1Prod).toBeDefined();
      expect(batch1Prod?.sku).toBe('OB-BATCH1-249K');
      expect(batch1Prod?.slug).toBe('ob-batch1-249k');

      const spc = batch1Prod?.single_page_config;
      expect(spc).toBeDefined();
      // Verifikasi blocker CTO: enable_payment & enable_qris dinonaktifkan untuk live gateway
      expect(spc?.enable_payment).toBe(false);
      expect(spc?.enable_qris).toBe(false);
      expect(spc?.enable_manual_transfer).toBe(false);
      expect(spc?.is_mock_only).toBe(true);
      expect(spc?.strict_hold).toBe(true);
    });

    it('verifies isBatch1MockCheckout accurately flags target SKU, slug, and flags while preserving other products', () => {
      // 1. Direct SKU match
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K' }, 'onlineboost')).toBe(true);
      expect(isBatch1MockCheckout({ sku: 'ob-batch1-249k' }, 'onlineboost')).toBe(true);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K' }, null)).toBe(true);

      // 2. Direct Slug match
      expect(isBatch1MockCheckout({ slug: 'ob-batch1-249k' }, 'onlineboost')).toBe(true);
      expect(isBatch1MockCheckout({ slug: 'OB-BATCH1-249K' }, 'onlineboost')).toBe(true);

      // 3. Flags on metadata / single_page_config
      expect(isBatch1MockCheckout({ metadata: { is_mock_only: true } })).toBe(true);
      expect(isBatch1MockCheckout({ single_page_config: { strict_hold: true } })).toBe(true);
      expect(isBatch1MockCheckout({ fulfillment_metadata: { is_mock_only: true } })).toBe(true);

      // 4. Title match on OnlineBoost tenant
      expect(isBatch1MockCheckout({ title: 'Tiket Inkubasi OnlineBoost Batch 1' }, 'onlineboost')).toBe(true);

      // 5. Unrelated products MUST return false (Zero cross-product / cross-tenant collateral)
      expect(isBatch1MockCheckout({ sku: 'CPM-PRO-01', slug: 'cpm-pro-01' }, 'onlineboost')).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'YOUTUBE-AI', slug: 'youtube-ai' }, 'onlineboost')).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'PAKET-NASI-LIWET', slug: 'paket-nasi-liwet' }, 'happyeating')).toBe(false);
      expect(isBatch1MockCheckout(null)).toBe(false);
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

  describe('2. Checkout Modal & Service Mock Guard Integrity', () => {
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
      // Dynamic QRIS live hanya dijalankan jika BUKAN mock order dan BUKAN gateway dynamic QRIS
      expect(checkoutModalSource).toContain('const isMockOrder = isBatch1MockCheckout(product, tenantSlug) || Boolean((paymentData as any)?.isMock);');
      expect(checkoutModalSource).toContain('const isDynamicQrisFromGateway =');
      expect(checkoutModalSource).toContain('isMockOrder ||');
      expect(checkoutModalSource).toContain('candidateQris.startsWith(\'000201010212\')');
    });

    it('verifies createOrderAndInvoice in lib/checkout-service.ts intercepts OB-BATCH1-249K mock-only', async () => {
      expect(checkoutServiceSource).toContain('isBatch1MockCheckout');
      expect(checkoutServiceSource).toContain('getBatch1MockCheckoutResult');

      // Call createOrderAndInvoice directly with target SKU
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

    it('verifies SingleProductPage in app/[tenant]/p/[slug]/page.tsx guards OB-BATCH1-249K checkout', () => {
      expect(singleProductPageSource).toContain('isBatch1MockCheckout');
      expect(singleProductPageSource).toContain('isObBatch1Target || isBatch1MockCheckout(product, tenant)');
      expect(singleProductPageSource).toContain('setIsPaid(true)');
      expect(singleProductPageSource).toContain('(!isCheckoutSectionDisabled || isObBatch1Target)');
    });
  });

  describe('3. Zero MDR Cut & Database Mutation Verification', () => {
    it('guarantees createOrderAndInvoice never contacts live /api/checkout/create-order for OB-BATCH1-249K', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');

      const mockResult = await createOrderAndInvoice({
        tenantSlug: 'onlineboost',
        productId: 'OB-BATCH1-249K',
        productTitle: 'Tiket Inkubasi OnlineBoost Batch 1',
        amount: 249000,
        customerName: 'CTO QA Check',
        customerPhone: '081299998888',
      });

      // Fetch tidak boleh dipanggil sama sekali untuk live order/invoice
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
});
