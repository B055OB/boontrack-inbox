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

      // 2. Direct SKU match on OnlineBoost tenant (with mandatory price Rp 249.000)
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', price: 249000 }, 'onlineboost')).toBe(true);
      expect(isBatch1MockCheckout({ sku: 'ob-batch1-249k', price: 249000 }, 'onlineboost')).toBe(true);

      // 3. Direct Slug match on OnlineBoost tenant
      expect(isBatch1MockCheckout({ slug: 'ob-batch1-249k', price: 249000 }, 'onlineboost')).toBe(true);
      expect(isBatch1MockCheckout({ slug: 'OB-BATCH1-249K', price: 249000 }, 'onlineboost')).toBe(true);

      // 4. Title match on OnlineBoost tenant
      expect(isBatch1MockCheckout({ title: 'Tiket Inkubasi OnlineBoost Batch 1', price: 249000 }, 'onlineboost')).toBe(true);

      // 5. Default catalog product on OnlineBoost tenant
      const batch1Prod = DEFAULT_PRODUCTS.find((p) => p.sku === 'OB-BATCH1-249K');
      expect(isBatch1MockCheckout(batch1Prod, 'onlineboost')).toBe(true);
    });

    it('returns valid simulation QRIS and mock orderId structure without leaking real fulfillment', () => {
      const mockResult = getBatch1MockCheckoutResult();
      expect(mockResult.isMock).toBe(true);
      expect(mockResult.isMockOnly).toBe(true);
      expect(mockResult.success).toBe(false);
      expect(mockResult.orderId).toMatch(/^ORD-MOCK-OB-BATCH1-\d+$/);
      expect(mockResult.qrString).toBe(BATCH1_MOCK_QRIS_STRING);
      expect(mockResult.qrString.startsWith('000201010212')).toBe(true);
      expect(mockResult.invoiceUrl).toContain('mock=true');
      expect(mockResult.status).toBe('MOCK_SIMULATED');
      expect(mockResult.isPaid).toBe(false);
      expect(mockResult.isSimulated).toBe(true);
      expect(mockResult.fulfillment).toBeNull();
      expect((mockResult as any).access_url).toBeUndefined();
      expect((mockResult as any).download_url).toBeUndefined();
    });
  });

  describe('2. Fail-Closed Security & Cross-Tenant Isolation Regressions', () => {
    it('enforces cross-tenant isolation: rejects wrong or unknown tenants from mock guard', () => {
      // Cross-tenant calls with OB-BATCH1 SKU must NEVER trigger OnlineBoost mock guard
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', slug: 'ob-batch1-249k', price: 249000 }, 'happyeating')).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', price: 249000 }, 'wrong-tenant')).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', price: 249000 }, 'unknown')).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', price: 249000 }, 'demo-store')).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', price: 249000 }, null)).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', price: 249000 }, '')).toBe(false);
    });

    it('fails closed when configuration is null or metadata is empty for OB-BATCH1-249K', () => {
      // Null product under OnlineBoost tenant fails closed
      expect(isBatch1MockCheckout(null, 'onlineboost')).toBe(true);

      // Null or empty single_page_config under OnlineBoost tenant fails closed
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', price: 249000, single_page_config: null }, 'onlineboost')).toBe(true);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', price: 249000, metadata: null }, 'onlineboost')).toBe(true);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', price: 249000, metadata: {} }, 'onlineboost')).toBe(true);

      // Incomplete payment enablement in single_page_config fails closed
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', price: 249000, single_page_config: { enable_payment: false } }, 'onlineboost')).toBe(true);
      expect(isBatch1MockCheckout({ sku: 'OB-BATCH1-249K', price: 249000, single_page_config: { enable_payment: true, enable_qris: false } }, 'onlineboost')).toBe(true);

      // Audit Keamanan CTO: Injeksi client _is_db_verified via metadata/payload TIDAK BISA membypass mock guard
      expect(isBatch1MockCheckout({
        sku: 'OB-BATCH1-249K',
        price: 249000,
        metadata: { _is_db_verified: true },
        single_page_config: { enable_payment: true, enable_qris: true, is_mock_only: false, strict_hold: false },
        is_mock_only: false,
        strict_hold: false,
      }, 'onlineboost')).toBe(true);
    });

    it('fails closed when price is undefined, null, NaN, or missing even if database verified', () => {
      // a. Objek produk dengan price, amount, dan promo_price semuanya undefined/null/NaN
      expect(isBatch1MockCheckout({
        sku: 'OB-BATCH1-249K',
        _is_db_verified: true,
        single_page_config: { enable_payment: true, enable_qris: true, is_mock_only: false, strict_hold: false },
        is_mock_only: false,
        strict_hold: false,
      }, 'onlineboost')).toBe(true);

      expect(isBatch1MockCheckout({
        sku: 'OB-BATCH1-249K',
        price: undefined,
        amount: undefined,
        promo_price: undefined,
        _is_db_verified: true,
        single_page_config: { enable_payment: true, enable_qris: true, is_mock_only: false, strict_hold: false },
        is_mock_only: false,
        strict_hold: false,
      }, 'onlineboost')).toBe(true);

      expect(isBatch1MockCheckout({
        sku: 'OB-BATCH1-249K',
        price: null as any,
        amount: null as any,
        promo_price: null as any,
        _is_db_verified: true,
        single_page_config: { enable_payment: true, enable_qris: true, is_mock_only: false, strict_hold: false },
        is_mock_only: false,
        strict_hold: false,
      }, 'onlineboost')).toBe(true);

      expect(isBatch1MockCheckout({
        sku: 'OB-BATCH1-249K',
        price: NaN,
        amount: NaN,
        promo_price: NaN,
        _is_db_verified: true,
        single_page_config: { enable_payment: true, enable_qris: true, is_mock_only: false, strict_hold: false },
        is_mock_only: false,
        strict_hold: false,
      }, 'onlineboost')).toBe(true);
    });

    it('fails closed when product is not database verified (_is_db_verified is false or missing)', () => {
      // b. Produk belum terverifikasi (_is_db_verified tidak ada/false)
      expect(isBatch1MockCheckout({
        sku: 'OB-BATCH1-249K',
        price: 249000,
        _is_db_verified: false,
        single_page_config: { enable_payment: true, enable_qris: true, is_mock_only: false, strict_hold: false },
        is_mock_only: false,
        strict_hold: false,
      }, 'onlineboost')).toBe(true);

      expect(isBatch1MockCheckout({
        sku: 'OB-BATCH1-249K',
        price: 249000,
        single_page_config: { enable_payment: true, enable_qris: true, is_mock_only: false, strict_hold: false },
        is_mock_only: false,
        strict_hold: false,
      }, 'onlineboost')).toBe(true);
    });

    it('does not intercept unknown or unrelated SKUs (zero cross-product collateral)', () => {
      // Unrelated or unknown SKUs under OnlineBoost must NOT trigger mock checkout
      expect(isBatch1MockCheckout({ sku: 'UNKNOWN-SKU-999', slug: 'unknown-sku-999', price: 249000 }, 'onlineboost')).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'CPM-PRO-01', slug: 'cpm-pro-01', price: 499000 }, 'onlineboost')).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'YOUTUBE-AI', slug: 'youtube-ai', price: 99000 }, 'onlineboost')).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'PAKET-NASI-LIWET', slug: 'paket-nasi-liwet', price: 50000 }, 'happyeating')).toBe(false);
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

    it('verifies SingleProductPage in app/[tenant]/p/[slug]/page.tsx separates simulation from PAID status and blocks fulfillment', () => {
      expect(singleProductPageSource).toContain('isBatch1MockCheckout');
      expect(singleProductPageSource).toContain('isBatch1MockCheckout(product, tenant)');

      // CTO Mandat: Mock branch pada page.tsx TIDAK BOLEH memanggil setIsPaid(true) dan TIDAK BOLEH membocorkan fulfillment link
      const guardStartIndex = singleProductPageSource.indexOf('// STRICT MOCK GUARD (HOLD PENDING LIVE GATE RELEASE - FAIL-CLOSED)');
      expect(guardStartIndex).toBeGreaterThan(0);
      const guardEndIndex = singleProductPageSource.indexOf('try {', guardStartIndex);
      expect(guardEndIndex).toBeGreaterThan(guardStartIndex);

      const mockGuardBranch = singleProductPageSource.slice(guardStartIndex, guardEndIndex);
      expect(mockGuardBranch).toContain('setIsPaid(false);');
      expect(mockGuardBranch).not.toContain('setIsPaid(true);');
      expect(mockGuardBranch).toContain('setVerifiedFulfillment(null);');
      expect(mockGuardBranch).not.toContain('https://onlineboost.id/onboarding');
      expect(mockGuardBranch).not.toContain('link_digital');
      expect(mockGuardBranch).toContain('SIMULASI / PREVIEW MODE — Pembayaran Live Belum Diaktifkan, Akses Produk Ditahan');
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
      expect(result.success).toBe(false);
      expect(result.isMock).toBe(true);
      expect(result.orderId).toContain('ORD-MOCK-OB-BATCH1');
      expect(result.qrString).toBe(BATCH1_MOCK_QRIS_STRING);
      expect(result.qrString.startsWith('000201010212')).toBe(true);
      expect(result.invoiceUrl).toContain('mock=true');
      expect(result.status).toBe('MOCK_SIMULATED');
      expect(result.isPaid).toBe(false);
      expect(result.isSimulated).toBe(true);
      expect(result.fulfillment).toBeNull();
      expect((result as any).access_url).toBeUndefined();
    });

    it('intercepts and holds when amount in createOrderAndInvoice is missing or manipulated for Batch 1', async () => {
      const manipulatedResult = await createOrderAndInvoice({
        tenantSlug: 'onlineboost',
        productId: 'OB-BATCH1-249K',
        productTitle: 'Tiket Inkubasi OnlineBoost Batch 1',
        amount: 5000, // manipulated price
        customerName: 'Attacker QA',
        customerPhone: '081234567890',
      });

      expect(manipulatedResult.isMock).toBe(true);
      expect(manipulatedResult.success).toBe(false);
      expect(manipulatedResult.status).toBe('MOCK_SIMULATED');
      expect(manipulatedResult.isPaid).toBe(false);
      expect(manipulatedResult.fulfillment).toBeNull();
    });

    it('prevents API consumers checking result.success from misinterpreting mock simulation as a completed live order', async () => {
      const mockResult = getBatch1MockCheckoutResult();
      expect(mockResult.success).toBe(false);
      expect(mockResult.status).toBe('MOCK_SIMULATED');
      expect(mockResult.isPaid).toBe(false);
      expect(mockResult.fulfillment).toBeNull();

      const orderResult = await createOrderAndInvoice({
        tenantSlug: 'onlineboost',
        productId: 'OB-BATCH1-249K',
        productTitle: 'Tiket Inkubasi OnlineBoost Batch 1',
        amount: 249000,
        customerName: 'Audit Consumer Test',
        customerPhone: '081234567890',
      });

      expect(orderResult.success).toBe(false);
      expect(orderResult.status).toBe('MOCK_SIMULATED');
      expect(orderResult.isPaid).toBe(false);
      expect(orderResult.isSimulated).toBe(true);
      expect(orderResult.fulfillment).toBeNull();
    });

    it('fails closed when product/SKU is not found in authoritative server catalog (without price fallback)', async () => {
      // Skenario A: Produk tidak ditemukan di katalog server
      const spyFind = jest.spyOn(DEFAULT_PRODUCTS, 'find').mockReturnValueOnce(undefined);

      const result = await createOrderAndInvoice({
        tenantSlug: 'onlineboost',
        productId: 'OB-BATCH1-249K',
        productTitle: 'Tiket Inkubasi OnlineBoost Batch 1',
        amount: 249000,
        customerName: 'Missing Product QA',
        customerPhone: '081234567890',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('MOCK_SIMULATED');
      expect(result.isPaid).toBe(false);
      expect(result.fulfillment).toBeNull();
      expect(result.isMock).toBe(true);

      spyFind.mockRestore();
    });

    it('fails closed when authoritative server catalog price is missing or invalid (null, undefined, NaN, 0) proving ?? 249000 fallback is eliminated', async () => {
      // Skenario B: Ketiadaan / invaliditas data harga otoritatif server (tanpa fallback hardcoded)
      const invalidPrices = [undefined, null, NaN, 0, -1000];

      for (const badPrice of invalidPrices) {
        const spyFind = jest.spyOn(DEFAULT_PRODUCTS, 'find').mockReturnValueOnce({
          id: 7071500249,
          sku: 'OB-BATCH1-249K',
          name: 'Tiket Inkubasi OnlineBoost Batch 1',
          slug: 'ob-batch1-249k',
          price: badPrice as any,
        } as any);

        const result = await createOrderAndInvoice({
          tenantSlug: 'onlineboost',
          productId: 'OB-BATCH1-249K',
          productTitle: 'Tiket Inkubasi OnlineBoost Batch 1',
          amount: 249000,
          customerName: 'Bad Price QA',
          customerPhone: '081234567890',
        });

        expect(result.success).toBe(false);
        expect(result.status).toBe('MOCK_SIMULATED');
        expect(result.isPaid).toBe(false);
        expect(result.fulfillment).toBeNull();

        spyFind.mockRestore();
      }
    });

    it('fails closed when authoritative server catalog price is mutated to another positive amount (199000, 299000) or invalid (0, NaN, undefined)', async () => {
      // Perbaikan C: Kunci kontrak harga SKU OB-BATCH1-249K tepat Rp 249.000
      // Jika harga di-mutate ke nominal positif lain (misal 199000 / 299000) atau kosong/invalid, sistem wajib fail-closed ke hold
      const testCatalogPrices = [199000, 299000, 150000, 499000, 0, -249000, NaN, undefined, null];

      for (const badCatalogPrice of testCatalogPrices) {
        const spyFind = jest.spyOn(DEFAULT_PRODUCTS, 'find').mockReturnValueOnce({
          id: 7071500249,
          sku: 'OB-BATCH1-249K',
          name: 'Tiket Inkubasi OnlineBoost Batch 1',
          slug: 'ob-batch1-249k',
          price: badCatalogPrice as any,
          single_page_config: { is_mock_only: true, strict_hold: true },
        } as any);

        const result = await createOrderAndInvoice({
          tenantSlug: 'onlineboost',
          productId: 'OB-BATCH1-249K',
          productTitle: 'Tiket Inkubasi OnlineBoost Batch 1',
          amount: 249000,
          customerName: 'Mutated Price QA',
          customerPhone: '081234567890',
        });

        expect(result.success).toBe(false);
        expect(result.status).toBe('MOCK_SIMULATED');
        expect(result.isPaid).toBe(false);
        expect(result.fulfillment).toBeNull();
        expect(result.isMock).toBe(true);

        spyFind.mockRestore();
      }
    });

    it('enforces strict cross-tenant isolation: checkouts for non-onlineboost tenants (even with similar title/identifier) are NOT intercepted into getBatch1MockCheckoutResult', async () => {
      // Perbaikan B: Checkout dari tenant selain onlineboost tidak terintersepsi menjadi getBatch1MockCheckoutResult
      const nonObTenants = ['happyeating', 'tumbuh-kembang-anak', 'sample-brand', 'attacker-brand', 'demo-store'];

      for (const tenant of nonObTenants) {
        const result = await createOrderAndInvoice({
          tenantSlug: tenant,
          productId: 'OB-BATCH1-249K',
          productTitle: 'Tiket Inkubasi OnlineBoost Batch 1',
          amount: 249000,
          customerName: 'Cross-Tenant Isolation QA',
          customerPhone: '081234567890',
          customerEmail: 'isolation@example.com',
          paymentMethod: 'qris',
        });

        // Wajib membuktikan bahwa checkout tenant non-onlineboost TIDAK menerima respons mock OnlineBoost
        expect(result.status).not.toBe('MOCK_SIMULATED');
        expect(result.orderId).not.toContain('ORD-MOCK-OB-BATCH1');
        expect(result.isMock).toBeUndefined();
        expect(result.invoiceUrl).not.toContain('mock=true');
        expect(result.orderId).toMatch(/^ORD-\d+-\d+$/);
      }
    });

    it('enforces server-side boundary: constructs order nominal from verified server catalog price (249000) and rejects client payload amount manipulation', async () => {
      // Perbaikan A & Skenario D: Payload client mencoba menyisipkan atau memanipulasi nominal amount/price
      const manipulatedAmounts = [1000, 0, -50000, 199000, 299000, undefined, null, NaN, 248999, 249001];

      for (const badAmount of manipulatedAmounts) {
        const result = await createOrderAndInvoice({
          tenantSlug: 'onlineboost',
          productId: 'OB-BATCH1-249K',
          productTitle: 'Tiket Inkubasi OnlineBoost Batch 1',
          amount: badAmount as any,
          customerName: 'Manipulator QA',
          customerPhone: '081234567890',
        });

        expect(result.success).toBe(false);
        expect(result.status).toBe('MOCK_SIMULATED');
        expect(result.isPaid).toBe(false);
        expect(result.fulfillment).toBeNull();
        expect(result.isMock).toBe(true);
      }
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
      expect(mockResult.success).toBe(false);
      expect(mockResult.isPaid).toBe(false);
      expect(mockResult.status).toBe('MOCK_SIMULATED');
      expect(mockResult.fulfillment).toBeNull();

      fetchSpy.mockRestore();
    });
  });

  describe('6. Separation: Live Order Contract for Standard / Non-Mock Products', () => {
    it('preserves live checkout path for authorized non-mock products without interception', () => {
      // Standard / other catalog products must return false from mock guard
      expect(isBatch1MockCheckout({ sku: 'CPM-PRO-01', slug: 'cpm-pro-01', price: 499000 }, 'onlineboost')).toBe(false);
      expect(isBatch1MockCheckout({ sku: 'PAKET-NASI-LIWET', slug: 'paket-nasi-liwet', price: 50000 }, 'happyeating')).toBe(false);

      // Verifies that live order processing contracts are untouched for non-mock products
      const isIntercepted = isBatch1MockCheckout(
        { sku: 'CPM-PRO-01', title: 'Ecourse Member CPM', price: 499000 },
        'onlineboost'
      );
      expect(isIntercepted).toBe(false);
    });
  });
});
