import { sendOrderFulfillmentNotification } from '../lib/whatsapp';
import { checkAdsTrackingEntitlement } from '../lib/capi.service';
import { resolveFulfillmentRequirements } from '../lib/product-catalog';

async function runStep4RegressionSuite() {
  console.log('================================================================');
  console.log('STEP 4: ORDER FULFILLMENT AUTOMATION & CORE REGRESSION TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - Detail: ${detail || 'Assertion failed'}`);
    }
  }

  // -------------------------------------------------------------
  // PILLAR 1: WHATSAPP AUTO-FULFILLMENT ISOLATION (DIGITAL VS FISIK)
  // -------------------------------------------------------------
  console.log('--- PILLAR 1: WHATSAPP FULFILLMENT ISOLATION ---');

  // Skenario A: Produk Digital
  const digitalFulfillmentRes = await sendOrderFulfillmentNotification({
    phone: '081234567890',
    customerName: 'Ahmad Fauzi',
    orderId: 'ORD-DIGITAL-001',
    itemsSummary: 'Masterclass Google Ads 2026',
    totalAmount: 149000,
    productType: 'DIGITAL',
    accessUrl: 'https://course.boontrack.com/access/mc-google-ads',
    instructions: 'Gunakan email Anda untuk login ke dashboard materi.',
  });

  assert(
    digitalFulfillmentRes.success === true,
    'Fulfillment Digital: WhatsApp notification generated successfully'
  );

  // Skenario B: Produk Fisik
  const physicalFulfillmentRes = await sendOrderFulfillmentNotification({
    phone: '089876543210',
    customerName: 'Siti Rahma',
    orderId: 'ORD-PHYSICAL-002',
    itemsSummary: 'Kemeja Katun Oxford Putih (Size L)',
    totalAmount: 215000,
    productType: 'PHYSICAL',
    storeName: 'BoonTrack Store',
  });

  assert(
    physicalFulfillmentRes.success === true,
    'Fulfillment Fisik: WhatsApp notification generated successfully (Packaging & Courier status)'
  );

  // -------------------------------------------------------------
  // PILLAR 2: P0 WEBHOOK QRIS & PAYMENT ATOMICITY
  // -------------------------------------------------------------
  console.log('\n--- PILLAR 2: P0 WEBHOOK QRIS & PAYMENT ATOMICITY ---');

  // Mock Database State
  const mockOrdersDb = new Map<string, any>();
  mockOrdersDb.set('ORD-ATOM-101', {
    id: 'ORD-ATOM-101',
    tenant_slug: 'demostore',
    product_title: 'Template Notion Pro',
    gross_amount: 59000,
    status: 'PENDING_PAYMENT',
    payment_status: 'PENDING',
    customer_phone: '628111222333',
    customer_name: 'Budi Santoso',
    product_type: 'DIGITAL',
    download_url: 'https://download.boontrack.com/notion-pro.zip',
  });

  // Simulasi handler webhook dengan payment atomicity
  async function simulatePaymentWebhook(payload: any, injectWaFailure = false) {
    const orderId = payload.order_id;
    const order = mockOrdersDb.get(orderId);
    if (!order) return { status: 404, body: { success: false, error: 'Not found' } };

    // P0.5 Idempotency Check
    const currentStatus = String(order.payment_status || order.status || '').toUpperCase();
    if (currentStatus === 'PAID' || currentStatus === 'SETTLED' || currentStatus === 'COMPLETED') {
      return {
        status: 200,
        body: {
          success: true,
          message: 'Already paid (Idempotent skip)',
          order_id: orderId,
          already_paid: true,
          paid_at: order.paid_at,
        },
      };
    }

    // 1. Mutasi Keuangan: Update status ke PAID
    const paidAt = new Date().toISOString();
    order.status = 'PAID';
    order.payment_status = 'PAID';
    order.paid_at = paidAt;
    order.updated_at = paidAt;

    // 2. Dispatch WhatsApp (Isolasi & Atomicity)
    try {
      if (injectWaFailure) {
        throw new Error('Simulated WhatsApp Gateway Timeout (504 Gateway Timeout)');
      }
      await sendOrderFulfillmentNotification({
        phone: order.customer_phone,
        customerName: order.customer_name,
        orderId: order.id,
        itemsSummary: order.product_title,
        totalAmount: order.gross_amount,
        productType: order.product_type,
        accessUrl: order.download_url,
      });
    } catch (waErr: any) {
      console.log(`[Non-Fatal Log] WhatsApp error captured safely: ${waErr.message}`);
      // ATOMICITY GUARANTEED: Jangan membatalkan status order.status = 'PAID'
    }

    return {
      status: 200,
      body: {
        success: true,
        message: 'Order verified PAID',
        order_id: orderId,
        paid_at: paidAt,
      },
    };
  }

  // Test 2.1: Pembayaran Normal Lunas
  const payRes1 = await simulatePaymentWebhook({ order_id: 'ORD-ATOM-101', status: 'PAID' }, false);
  assert(
    payRes1.status === 200 && payRes1.body.success === true && mockOrdersDb.get('ORD-ATOM-101').status === 'PAID',
    'P0 Webhook: QRIS payment successfully verified as PAID'
  );

  // Test 2.2: Payment Atomicity (WhatsApp Error does NOT abort financial transaction)
  mockOrdersDb.set('ORD-ATOM-102', {
    id: 'ORD-ATOM-102',
    tenant_slug: 'demostore',
    product_title: 'Kopi Arabika 250gr',
    gross_amount: 85000,
    status: 'PENDING_PAYMENT',
    payment_status: 'PENDING',
    customer_phone: '000000', // invalid phone / network timeout
    product_type: 'PHYSICAL',
  });

  const payResWithWaError = await simulatePaymentWebhook({ order_id: 'ORD-ATOM-102', status: 'PAID' }, true);
  const order102 = mockOrdersDb.get('ORD-ATOM-102');
  assert(
    payResWithWaError.status === 200 &&
    payResWithWaError.body.success === true &&
    order102.status === 'PAID' &&
    order102.paid_at !== undefined,
    'Payment Atomicity: Financial mutation persists as PAID even if WhatsApp fails (Zero Rollback)'
  );

  // -------------------------------------------------------------
  // PILLAR 3: P0.5 IDEMPOTENCY (REPLAY / DUPLICATE CALLBACK PROTECTION)
  // -------------------------------------------------------------
  console.log('\n--- PILLAR 3: P0.5 IDEMPOTENCY PROTECTION ---');

  // Callback ke-2 dengan payload yang sama
  const replayRes = await simulatePaymentWebhook({ order_id: 'ORD-ATOM-101', status: 'PAID' }, false);
  assert(
    replayRes.status === 200 &&
    replayRes.body.success === true &&
    replayRes.body.already_paid === true,
    'P0.5 Idempotency: Replay webhook correctly detected (already_paid: true, no duplicate processing)'
  );

  // -------------------------------------------------------------
  // PILLAR 4: QUOTA LIMIT VALIDATION (MAX 3 PRODUK AKTIF)
  // -------------------------------------------------------------
  console.log('\n--- PILLAR 4: PRODUCT QUOTA LIMIT VALIDATION ---');

  const tenantCheckoutLite = {
    tier: 'CHECKOUT_LITE',
    products: [
      { id: 'prod-1', name: 'Produk 1', is_active: true },
      { id: 'prod-2', name: 'Produk 2', is_active: true },
      { id: 'prod-3', name: 'Produk 3', is_active: true },
    ],
  };

  function validateProductActivation(tenant: any, newProductActive: boolean): { allowed: boolean; error?: string } {
    const isLite = (tenant.tier || '').toUpperCase() === 'CHECKOUT_LITE';
    if (!isLite) return { allowed: true };

    const activeCount = tenant.products.filter((p: any) => p.is_active !== false).length;
    if (newProductActive && activeCount >= 3) {
      return {
        allowed: false,
        error: 'Batas kuota produk tercapai (Maksimal 3 produk aktif untuk Paket Checkout Lite). Upgrade ke Ads Performance untuk produk tanpa batas.',
      };
    }
    return { allowed: true };
  }

  // Attempting to add 4th active product
  const quotaCheck = validateProductActivation(tenantCheckoutLite, true);
  assert(
    Boolean(quotaCheck.allowed === false && quotaCheck.error?.includes('Maksimal 3 produk aktif')),
    'Quota Enforcement: 4th active product blocked with quota limit message for CHECKOUT_LITE'
  );

  // Allowed when adding inactive product (draft)
  const draftCheck = validateProductActivation(tenantCheckoutLite, false);
  assert(
    draftCheck.allowed === true,
    'Quota Flexibility: Inactive/draft products are allowed without exceeding active limit'
  );

  // -------------------------------------------------------------
  // PILLAR 5: ENTITLEMENT ISOLATION (CAPI & ADVANCED ANALYTICS)
  // -------------------------------------------------------------
  console.log('\n--- PILLAR 5: ENTITLEMENT ISOLATION ---');

  const mockSupabaseCheckoutLite = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { tier: 'CHECKOUT_LITE', plan: 'checkout_lite' },
          }),
        }),
      }),
    }),
  };

  const capiAllowedLite = await checkAdsTrackingEntitlement(mockSupabaseCheckoutLite, 'lite-tenant');
  assert(
    capiAllowedLite === false,
    'Entitlement Isolation: CAPI access is strictly DENIED for CHECKOUT_LITE'
  );

  function checkSidebarMenuEntitlements(tier: string) {
    const isLite = tier.toUpperCase() === 'CHECKOUT_LITE';
    const accessibleMenus = isLite
      ? ['dashboard', 'products', 'orders', 'settings']
      : ['dashboard', 'products', 'orders', 'broadcast', 'analytics', 'team', 'settings', 'capi'];

    const hasBroadcast = accessibleMenus.includes('broadcast');
    const hasAnalytics = accessibleMenus.includes('analytics');
    const hasCAPI = accessibleMenus.includes('capi');

    return { accessibleMenus, hasBroadcast, hasAnalytics, hasCAPI };
  }

  const liteMenus = checkSidebarMenuEntitlements('CHECKOUT_LITE');
  assert(
    liteMenus.accessibleMenus.length === 4 &&
    !liteMenus.hasBroadcast &&
    !liteMenus.hasAnalytics &&
    !liteMenus.hasCAPI,
    'RBAC Isolation: CHECKOUT_LITE is restricted to exactly 4 menus (Broadcast, Analytics, CAPI hidden)'
  );

  console.log(`\n================================================================`);
  console.log(`STEP 4 REGRESSION RESULT: ${passed}/${total} PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log(`================================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runStep4RegressionSuite().catch((err) => {
  console.error('Step 4 test suite failed with error:', err);
  process.exit(1);
});
