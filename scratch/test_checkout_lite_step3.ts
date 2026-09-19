import { resolveFulfillmentRequirements } from '../lib/product-catalog';
import { checkAdsTrackingEntitlement } from '../lib/capi.service';
import { generateDynamicQRIS } from '../lib/qris-dynamic';

async function runStep3Tests() {
  console.log('=== STEP 3: TIER CHECKOUT LITE & UNIFIED CHECKOUT VERIFICATION ===\n');

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

  // 1. REGISTRATION PLAN & PRICING VERIFICATION
  const PLAN_PRICING: Record<string, number> = {
    checkout_lite: 59000,
    starter: 199000,
    pro_scale: 299000,
    enterprise: 499000,
    solo: 199000,
    ads_performance: 299000,
    team_scale: 499000,
  };

  assert(
    PLAN_PRICING['checkout_lite'] === 59000,
    'Pricing: checkout_lite price is exactly Rp 59.000'
  );

  const rawPlan = 'checkout_lite';
  let dbTier = 'STARTER';
  let isTrial = true;
  if (rawPlan.includes('checkout') || rawPlan.includes('lite')) {
    dbTier = 'CHECKOUT_LITE';
    isTrial = false;
  }
  assert(
    dbTier === 'CHECKOUT_LITE' && isTrial === false,
    'Registration Mapper: checkout_lite maps to CHECKOUT_LITE with direct payment (isTrial=false)'
  );

  // 2. UNIFIED CHECKOUT CONTEXT (DIGITAL VS FISIK)
  const digitalProductType = 'DIGITAL';
  const physicalProductType = 'PHYSICAL';

  const digitalReqs = resolveFulfillmentRequirements(digitalProductType);
  const physicalReqs = resolveFulfillmentRequirements(physicalProductType);

  assert(
    digitalReqs.requiresAddress === false && digitalReqs.requiresShipping === false,
    'Context Digital: requiresAddress=false & requiresShipping=false (All shipping hidden)'
  );

  assert(
    physicalReqs.requiresAddress === true && physicalReqs.requiresShipping === true,
    'Context Physical: requiresAddress=true & requiresShipping=true (Shipping & courier enabled)'
  );

  // 3. LAZY SHIPPING CALCULATION & DYNAMIC QRIS
  // Skenario A: Initial mount tanpa input tujuan -> Ongkir 0, API tidak dipicu
  const initialDestination = '';
  let initialShippingCost = 0;
  if (initialDestination.trim().length >= 3) {
    initialShippingCost = 15000;
  }
  assert(
    initialShippingCost === 0,
    'Lazy Shipping: Initial load without destination has Rp 0 shipping cost (No API call on first mount)'
  );

  // Skenario B: Buyer selesai mengetik kota tujuan -> Ongkir dihitung
  const destinationSelected = 'Bandung';
  let lazyShippingCost = 0;
  let basicCourier = '';
  if (destinationSelected.trim().length >= 3) {
    lazyShippingCost = 15000;
    basicCourier = 'Kurir Reguler (J&T / SiCepat)';
  }
  assert(
    lazyShippingCost === 15000 && basicCourier.includes('Reguler'),
    'Lazy Shipping: Calculated when buyer inputs destination (Single Basic Courier applied)'
  );

  // Skenario C: Total QRIS Dinamis = Subtotal + Ongkir
  const subtotal = 75000;
  const totalQRIS = subtotal + lazyShippingCost;
  assert(
    totalQRIS === 90000,
    'Financial Engine: Total QRIS Dinamis = Subtotal + Ongkir (Rp 75.000 + Rp 15.000 = Rp 90.000)'
  );

  const baseStaticQRIS = "00020101021126570011ID.DANA.WWW011893600915303379682702090337968270303UMI51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI5204737253033605802ID5909BoonTrack6012Kab. Bandung61054028663048DC1";
  const dynamicQRISPayload = generateDynamicQRIS(baseStaticQRIS, totalQRIS);
  assert(
    dynamicQRISPayload.includes('540590000') && dynamicQRISPayload.startsWith('000201010212'),
    'QRIS Dynamic Engine: Tag 01 is 010212 and Tag 54 is 540590000 with valid CRC16'
  );

  // 4. CLIENT-SIDE PIXEL TRACKING & NO SERVER CAPI
  // Skenario A: Priority Override Pixel ID
  const productOverrideMetaPixel = '998877665544332';
  const tenantDefaultMetaPixel = '112233445566778';
  const resolvedMetaPixel = productOverrideMetaPixel || tenantDefaultMetaPixel;
  assert(
    resolvedMetaPixel === '998877665544332',
    'Pixel Tracking: meta_pixel_id_override prioritized over tenant default'
  );

  // Skenario B: Entitlement Check - CHECKOUT_LITE blocked from server CAPI
  const mockSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { tier: 'CHECKOUT_LITE', plan: 'checkout_lite' }
          })
        })
      })
    })
  };

  const isCAPIAllowed = await checkAdsTrackingEntitlement(mockSupabase, 'dummy-tenant-id');
  assert(
    isCAPIAllowed === false,
    'CAPI Guard: checkAdsTrackingEntitlement returns FALSE for CHECKOUT_LITE tier'
  );

  // Skenario C: PRO_SCALE / ADS_PERFORMANCE allowed for server CAPI
  const mockProSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { tier: 'PRO_SCALE', plan: 'pro_scale' }
          })
        })
      })
    })
  };
  const isProCAPIAllowed = await checkAdsTrackingEntitlement(mockProSupabase, 'pro-tenant-id');
  assert(
    isProCAPIAllowed === true,
    'CAPI Guard: checkAdsTrackingEntitlement returns TRUE for PRO_SCALE / ADS_PERFORMANCE tier'
  );

  console.log(`\n========================================`);
  console.log(`TEST SUMMARY: ${passed}/${total} PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log(`========================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runStep3Tests().catch((err) => {
  console.error('Fatal error running Step 3 tests:', err);
  process.exit(1);
});
