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

  describe('1. Catalog Security & Live Activation Configuration for OB-BATCH1-249K', () => {
    it('verifies OB-BATCH1-249K has live payments and qris enabled with strict hold/mock flags released', () => {
      const batch1Prod = DEFAULT_PRODUCTS.find((p) => p.sku === 'OB-BATCH1-249K');
      expect(batch1Prod).toBeDefined();
      expect(batch1Prod?.sku).toBe('OB-BATCH1-249K');
      expect(batch1Prod?.slug).toBe('ob-batch1-249k');
      expect(batch1Prod?.price).toBe(249000);

      const spc = batch1Prod?.single_page_config;
      expect(spc).toBeDefined();
      // Controlled Release Mandat CTO: enable_payment & enable_qris diaktifkan untuk live gateway
      expect(spc?.enable_payment).toBe(true);
      expect(spc?.enable_qris).toBe(true);
      expect(spc?.enable_manual_transfer).toBe(false);
      expect(spc?.is_mock_only).toBe(false);
      expect(spc?.strict_hold).toBe(false);
    });

    it('verifies isBatch1MockCheckout accurately flags mock objects while allowing live checkout when released', () => {
      // 1. Explicit mock flags return true
      expect(isBatch1MockCheckout({ metadata: { is_mock_only: true } })).toBe(true);
      expect(isBatch1MockCheckout({ single_page_config: { strict_hold: true } })).toBe(true);
      expect(isBatch1MockCheckout({ fulfillment_metadata: { is_mock_only: true } })).toBe(true);

      // 2. Released catalog product returns false (allowing live checkout)
      const batch1Prod = DEFAULT_PRODUCTS.find((p) => p.sku === 'OB-BATCH1-249K');
      expect(isBatch1MockCheckout(batch1Prod, 'onlineboost')).toBe(false);

      // 3. Unrelated products MUST return false (Zero cross-product / cross-tenant collateral)
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

    it('verifies createOrderAndInvoice in lib/checkout-service.ts respects mock guard when explicitly flagged', async () => {
      expect(checkoutServiceSource).toContain('isBatch1MockCheckout');
      expect(checkoutServiceSource).toContain('getBatch1MockCheckoutResult');

      // Call createOrderAndInvoice directly with explicit mock flag
      const result = await createOrderAndInvoice({
        tenantSlug: 'onlineboost',
        productId: 'OB-BATCH1-249K',
        productTitle: 'Tiket Inkubasi OnlineBoost Batch 1',
        amount: 249000,
        customerName: 'Tester QA',
        customerPhone: '081234567890',
        fulfillmentMetadata: { is_mock_only: true },
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
      expect(singleProductPageSource).toContain('if (isBatch1MockCheckout(product, tenant)) {');
      expect(singleProductPageSource).toContain('setIsPaid(true)');
      expect(singleProductPageSource).toContain('(!isCheckoutSectionDisabled || isObBatch1Target)');
    });
  });

  describe('3. Zero MDR Cut & Database Mutation Verification', () => {
    it('guarantees createOrderAndInvoice executes simulation when mock flag is present', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');

      const mockResult = await createOrderAndInvoice({
        tenantSlug: 'onlineboost',
        productId: 'OB-BATCH1-249K',
        productTitle: 'Tiket Inkubasi OnlineBoost Batch 1',
        amount: 249000,
        customerName: 'CTO QA Check',
        customerPhone: '081299998888',
        fulfillmentMetadata: { is_mock_only: true },
      });

      // Fetch tidak boleh dipanggil sama sekali untuk live order/invoice saat mock flag aktif
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
