import { createXenditDynamicQRIS } from "@/lib/payment/xendit-service";
import { getSupabase } from "@/lib/supabaseClient";
import { getBackendApiUrl } from "@/lib/api-config";
import { generateDynamicQRIS } from "@/lib/qris-dynamic";
import { checkTrialQuota } from "@/lib/entitlements/trial-guard";
import { resolveActiveOrderBumps, OrderBumpItem, getProductActiveVoucher, normalizeBriefingUrl } from "@/lib/product-catalog";
import { sanitizeOrderPayload } from "@/lib/order-sanitizer";
import { generateUniqueCodeForTenant } from "@/lib/unique-code-generator";
import { normalizePhoneToE164, isValidIndonesianPhone } from "@/lib/phone";

export { normalizePhoneToE164, isValidIndonesianPhone };

const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

export interface CreateOrderPayload {
  tenantSlug: string;
  productId: string;
  productTitle: string;
  amount: number;
  basePrice?: number;
  adminFee?: number;
  uniqueCode?: number;
  paymentMethod?: 'qris' | 'manual_transfer';
  affiliateCommission?: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  reference_token?: string;
  affiliateCode?: string;
  ref?: string;
  managerId?: string;
  ctwa_clid?: string;
  tracking?: Record<string, any>;
  tracking_context?: {
    fbp?: string;
    fbc?: string;
    client_user_agent?: string;
    client_ip_address?: string;
    source_url?: string;
    [key: string]: unknown;
  };
  city?: string;
  customerCity?: string;
  shippingCity?: string;
  voucherCode?: string;
  productDiscount?: number;
  netProductPrice?: number;
  shippingCost?: number;
  shippingSubsidy?: number;
  netShippingCost?: number;
  shippingAddress?: string;
  shippingCourier?: string;
  productType?: string;
  fulfillmentMetadata?: any;
  fulfillmentType?: 'PICKUP' | 'DELIVERY';
  pickupInfo?: {
    storeName?: string;
    address?: string;
    mapsUrl?: string;
    instructions?: string;
  };
  briefing_url?: string;
  customer_briefing?: any;
  selectedOrderBumps?: Array<{
    id: string;
    name?: string;
    price?: number;
  }>;
  quantity?: number;
  unitPrice?: number;
  cartId?: string | null;
  order_notes?: string;
  notes?: string;
  kitchen_notes?: string;
  reseller_code?: string;
  reseller_attribution_id?: string;
  reseller_id?: string;
  items?: Array<{
    productId: string;
    productTitle: string;
    unitPrice: number;
    quantity: number;
    weightGrams?: number;
    variantId?: string | null;
    variantName?: string | null;
    selectedModifiers?: any[];
  }>;
  tenantStaticQris?: string;
}

export async function createOrderAndInvoice(payload: CreateOrderPayload) {
  // Normalisasi nomor HP customer ke format baku E.164 (628xxxxxxxxxx)
  if (payload.customerPhone) {
    payload.customerPhone = normalizePhoneToE164(payload.customerPhone);
  }

  // JALUR BROWSER (CLIENT-SIDE):
  // Wajib menggunakan API route internal. Dilarang keras fallback ke direct Supabase client.
  if (typeof window !== 'undefined') {
    const endpoints = ['/api/checkout/create-order', '/api/orders'];
    let lastError: any = null;

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const resJson = await response.json().catch(() => null);

        if (response.ok && (resJson?.success !== false)) {
          return {
            orderId: resJson.orderId || resJson.order_id || resJson.id,
            qrString: resJson.qrString || resJson.qr_string || '',
            qr_string: resJson.qrString || resJson.qr_string || '',
            qrCodeUrl: resJson.qrCodeUrl || resJson.qr_code_url || '',
            invoiceUrl: resJson.invoiceUrl || resJson.invoice_url || `/checkout/${resJson.orderId || resJson.id}`,
            referenceToken: resJson.referenceToken || resJson.reference_token || payload.reference_token || null,
          };
        }

        if (resJson?.error) {
          const customErr: any = new Error(resJson.error);
          if (resJson.code) customErr.code = resJson.code;
          if (resJson.isTrial) customErr.isTrial = resJson.isTrial;
          throw customErr;
        }
      } catch (browserErr: any) {
        if (browserErr?.code === 'TRIAL_LIMIT_EXCEEDED' || browserErr?.isTrial) {
          throw browserErr;
        }
        lastError = browserErr;
      }
    }

    throw lastError || new Error("Gagal memproses pesanan melalui gateway server. Silakan muat ulang halaman.");
  }

  // JALUR SERVER-SIDE ONLY:
  // getSupabaseAdmin dimuat secara dinamis saat runtime server agar aman dari bundle browser
  const { getSupabaseAdmin } = await import("@/lib/supabaseClient");
  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) throw new Error("Supabase client not initialized on server");

  const orderId = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Resolusi data tenant awal untuk validasi harga backend & snapshot
  let resolvedTenantId: string | null = null;
  let tenantRowData: any = null;
  try {
    const tIdentifier = (payload.tenantSlug || "").trim();
    let tQuery = supabase.from('tenants').select('*');
    if (isUuid(tIdentifier)) {
      tQuery = tQuery.or(`slug.eq.${tIdentifier},id.eq.${tIdentifier}`);
    } else {
      tQuery = tQuery.eq('slug', tIdentifier);
    }
    const { data: tenantRow } = await tQuery.maybeSingle();
    tenantRowData = tenantRow;
    resolvedTenantId = tenantRow?.id || null;
  } catch (tenantResolveErr) {
    console.warn('[Checkout Service] Gagal resolve tenant_id dari slug:', tenantResolveErr);
  }

  // Backend Verification for Order Bumps & Vouchers (Zero Client Financial Authority)
  let verifiedOrderBumps: OrderBumpItem[] = [];
  let orderBumpsTotal = 0;
  let matchedProd: any = null;

  try {
    const products = Array.isArray(tenantRowData?.metadata?.products) ? tenantRowData.metadata.products : [];
    const prodIdStr = String(payload.productId || '').trim();
    const prodTitleStr = String(payload.productTitle || '').trim().toLowerCase();

    matchedProd = products.find((p: any) => {
      if (!p) return false;
      if (prodIdStr && (String(p.id) === prodIdStr || String(p.slug) === prodIdStr || String(p.sku) === prodIdStr)) return true;
      if (prodTitleStr && p.name && p.name.trim().toLowerCase() === prodTitleStr) return true;
      return false;
    });

    if (!matchedProd && resolvedTenantId) {
      const isTargetUuid = isUuid(payload.productId);
      let prodQuery = supabase.from('products').select('*').eq('tenant_id', resolvedTenantId);
      if (isTargetUuid) {
        prodQuery = prodQuery.or(`slug.eq.${payload.productId},id.eq.${payload.productId}`);
      } else {
        prodQuery = prodQuery.eq('slug', payload.productId);
      }
      const { data: sqlProd } = await prodQuery.maybeSingle();
      if (sqlProd) {
        matchedProd = {
          ...sqlProd,
          name: sqlProd.title,
          order_bumps: sqlProd.fulfillment_metadata?.order_bumps,
        };
      }
    }

    if (matchedProd && payload.selectedOrderBumps && payload.selectedOrderBumps.length > 0) {
      const availableBumps = resolveActiveOrderBumps(matchedProd);
      const requestedIds = payload.selectedOrderBumps.map((b) => String(b.id || ''));

      // Backend Price Snapshot: Hanya gunakan harga snapshot dari backend (abaikan payload harga klien)
      verifiedOrderBumps = availableBumps.filter((b) => requestedIds.includes(String(b.id)));
      orderBumpsTotal = verifiedOrderBumps.reduce((sum, b) => sum + (Number(b.price) || 0), 0);
    }
  } catch (lookupErr) {
    console.warn('[Checkout Service] Product verification lookup note:', lookupErr);
  }

  const paymentMethod = payload.paymentMethod || 'qris';
  const orderQuantity = payload.quantity && payload.quantity > 0 ? payload.quantity : 1;
  const unitPrice = payload.unitPrice ?? payload.basePrice ?? payload.amount;
  const basePrice = payload.basePrice ?? (unitPrice * orderQuantity);

  // Validasi Voucher Snapshot (Server-Side)
  let verifiedProductDiscount = payload.productDiscount ?? 0;
  let verifiedVoucherCode = payload.voucherCode || null;

  if (matchedProd && (payload.voucherCode || verifiedProductDiscount > 0)) {
    const activeVoucher = getProductActiveVoucher(matchedProd, matchedProd.single_page_config);
    if (!activeVoucher) {
      verifiedProductDiscount = 0;
      verifiedVoucherCode = null;
    } else if (payload.voucherCode && payload.voucherCode.trim().toUpperCase() === activeVoucher.code.toUpperCase()) {
      if (activeVoucher.min_spend && basePrice < activeVoucher.min_spend) {
        verifiedProductDiscount = 0;
        verifiedVoucherCode = null;
      } else if (activeVoucher.discount_type === 'percentage') {
        verifiedProductDiscount = Math.round(basePrice * ((activeVoucher.discount_value || 0) / 100));
      } else {
        verifiedProductDiscount = activeVoucher.discount_value || 0;
      }
    } else if (!payload.voucherCode) {
      verifiedProductDiscount = 0;
    }
  }

  const productDiscount = verifiedProductDiscount;
  const netProductPrice = Math.max(0, basePrice - productDiscount) + orderBumpsTotal;

  // Kunci pengamanan: vertikal non-shipping (jasa, digital, dsb.) dipaksa 0 ongkir & tanpa kurir
  const normType = (payload.productType || '').toUpperCase().trim();
  const isNonShipping = [
    'FIELD_SERVICE',
    'LOCAL_SERVICE',
    'SERVICE',
    'PROFESSIONAL_SERVICE',
    'AGENCY',
    'JASA',
    'DIGITAL',
    'CREATOR',
    'ECOURSE',
    'COURSE'
  ].includes(normType);

  const shippingCost = isNonShipping ? 0 : (payload.shippingCost ?? 0);
  const shippingSubsidy = isNonShipping ? 0 : (payload.shippingSubsidy ?? 0);
  const netShippingCost = isNonShipping ? 0 : (payload.netShippingCost ?? Math.max(0, shippingCost - shippingSubsidy));
  const shippingCourier = isNonShipping ? null : (payload.shippingCourier || null);

  // Biaya admin Rp0 untuk QRIS maupun Transfer Bank Manual
  const adminFee = 0;

  // GUARDRAIL P0: Bypass Unique Code untuk OnlineBoost / Xendit Gateway
  const cleanTenantSlug = String(payload.tenantSlug || '').trim().toLowerCase();
  const isXenditGatewayTenant =
    cleanTenantSlug === 'onlineboost' ||
    String(paymentMethod).toLowerCase().includes('xendit') ||
    tenantRowData?.payment_settings?.provider === 'xendit' ||
    tenantRowData?.payment_settings?.mode === 'PAYMENT_GATEWAY' ||
    tenantRowData?.metadata?.payment_settings?.provider === 'xendit' ||
    tenantRowData?.metadata?.payment_settings?.mode === 'PAYMENT_GATEWAY';

  const uniqueCode = isXenditGatewayTenant
    ? 0
    : (payload.uniqueCode !== undefined && payload.uniqueCode !== null
      ? payload.uniqueCode
      : await generateUniqueCodeForTenant({
        tenantSlug: payload.tenantSlug,
        tenantId: resolvedTenantId || undefined,
        baseAmount: netProductPrice + netShippingCost,
        paymentMethod: paymentMethod,
      }));

  let grossAmount = payload.amount;
  if (isXenditGatewayTenant) {
    grossAmount = netProductPrice + netShippingCost;
  } else if (!grossAmount || verifiedOrderBumps.length > 0) {
    if (paymentMethod === 'qris') {
      grossAmount = Math.max(1000, (netProductPrice + netShippingCost) - uniqueCode);
    } else {
      grossAmount = netProductPrice + netShippingCost + uniqueCode;
    }
  } else if (paymentMethod === 'qris' && payload.amount === (netProductPrice + netShippingCost) && uniqueCode > 0) {
    grossAmount = Math.max(1000, payload.amount - uniqueCode);
  }

  const affiliateCommission = payload.affiliateCommission ?? 0;

  const orderFulfillmentMeta = {
    ...(payload.fulfillmentMetadata || {}),
    ...(verifiedOrderBumps.length > 0 ? { order_bumps: verifiedOrderBumps } : {}),
    order_notes: payload.order_notes || payload.notes || payload.kitchen_notes || payload.fulfillmentMetadata?.order_notes || undefined,
  };

  const orderData = {
    id: orderId,
    tenant_slug: payload.tenantSlug,
    product_id: payload.productId,
    product_title: payload.productTitle,
    quantity: orderQuantity,
    unit_price: unitPrice,
    gross_amount: grossAmount,
    base_price: basePrice,
    product_discount: productDiscount,
    net_product_price: netProductPrice,
    shipping_cost: shippingCost,
    shipping_subsidy: shippingSubsidy,
    net_shipping_cost: netShippingCost,
    voucher_code: verifiedVoucherCode,
    shipping_address: payload.shippingAddress || null,
    shipping_courier: shippingCourier,
    fulfillment_type: payload.fulfillmentType || 'DELIVERY',
    pickup_info: payload.pickupInfo || null,
    product_type: payload.productType || null,
    fulfillment_metadata: orderFulfillmentMeta,
    order_bumps: verifiedOrderBumps.length > 0 ? verifiedOrderBumps : undefined,
    admin_fee: adminFee,
    unique_code: uniqueCode,
    payment_method: paymentMethod,
    affiliate_commission: affiliateCommission,
    customer_name: payload.customerName,
    customer_phone: payload.customerPhone,
    customer_email: payload.customerEmail || "",
    affiliate_code: payload.affiliateCode || payload.ref || null,
    manager_id: payload.managerId || null,
    reseller_code: payload.reseller_code || payload.reseller_id || null,
    reseller_attribution_id: payload.reseller_attribution_id || null,
    reseller_id: payload.reseller_id || payload.reseller_code || null,
    utm_source: payload.tracking?.utm_source || null,
    utm_medium: payload.tracking?.utm_medium || null,
    utm_campaign: payload.tracking?.utm_campaign || null,
    utm_content: payload.tracking?.utm_content || null,
    utm_term: payload.tracking?.utm_term || null,
    fbclid: payload.tracking?.fbclid || null,
    ttclid: payload.tracking?.ttclid || null,
    ctwa_clid: payload.ctwa_clid || payload.tracking?.ctwa_clid || null,
    status: "WAITING_PAYMENT",
    created_at: new Date().toISOString()
  };

  const resolvedProductId = String(payload.productId || '').trim() || `prod_${Date.now()}`;

  // Resolusi tenant_id (UUID)
  if (!resolvedTenantId) {
    try {
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', payload.tenantSlug)
        .maybeSingle();
      resolvedTenantId = tenantRow?.id || null;
    } catch (tenantResolveErr) {
      console.warn('[Checkout Service] Gagal resolve tenant_id dari slug:', tenantResolveErr);
    }
  }

  // TRIAL QUOTA GUARD
  if (resolvedTenantId) {
    const quotaCheck = await checkTrialQuota(resolvedTenantId, 'order');
    if (!quotaCheck.allowed) {
      throw Object.assign(new Error(quotaCheck.message ?? 'Batas kuota trial tercapai.'), {
        code: quotaCheck.errorCode ?? 'TRIAL_LIMIT_EXCEEDED',
        currentUsage: quotaCheck.currentUsage,
        limit: quotaCheck.limit,
        isTrial: true,
      });
    }
  }

  const resolvedTrackingContext = payload.tracking_context || {
    ...(payload.tracking?.fbp ? { fbp: payload.tracking.fbp } : {}),
    ...(payload.tracking?.fbc ? { fbc: payload.tracking.fbc } : {}),
    ...(payload.tracking?.client_user_agent ? { client_user_agent: payload.tracking.client_user_agent } : {}),
    ...(payload.tracking?.client_ip_address ? { client_ip_address: payload.tracking.client_ip_address } : {}),
    ...(payload.tracking?.source_url ? { source_url: payload.tracking.source_url } : {}),
  };

  const resolvedCity = payload.city || payload.customerCity || payload.shippingCity || null;
  const resolvedSourceUrl = resolvedTrackingContext.source_url || (process.env.NEXT_PUBLIC_APP_URL || null);

  const rawOrderData: any = {
    id: orderId,
    tenant_slug: payload.tenantSlug,
    tenant_id: resolvedTenantId,
    product_id: resolvedProductId,
    product_title: payload.productTitle,
    quantity: orderQuantity,
    unit_price: unitPrice,
    gross_amount: grossAmount,
    customer_name: payload.customerName,
    customer_phone: payload.customerPhone,
    customer_email: payload.customerEmail || null,
    affiliate_code: payload.affiliateCode || null,
    manager_id: payload.managerId || null,
    reseller_code: payload.reseller_code || null,
    reseller_attribution_id: payload.reseller_attribution_id || null,
    reseller_id: payload.reseller_id || null,
    utm_source: payload.tracking?.utm_source || null,
    utm_medium: payload.tracking?.utm_medium || null,
    utm_campaign: payload.tracking?.utm_campaign || null,
    utm_content: payload.tracking?.utm_content || null,
    utm_term: payload.tracking?.utm_term || null,
    fbclid: payload.tracking?.fbclid || null,
    ttclid: payload.tracking?.ttclid || null,
    briefing_url: normalizeBriefingUrl(payload.briefing_url || payload.customer_briefing?.briefing_url) || null,
    customer_briefing: payload.customer_briefing || (payload.briefing_url ? { briefing_url: normalizeBriefingUrl(payload.briefing_url), submitted_at: new Date().toISOString() } : null),
    status: "PENDING",
    payment_status: "PENDING",
    order_status: "PENDING",
    fulfillment_type: payload.fulfillmentType || 'DELIVERY',
    fulfillment_metadata: orderFulfillmentMeta,
    metadata: {
      tracking_context: resolvedTrackingContext,
      city: resolvedCity,
      shipping_address: payload.shippingAddress || null,
      source_url: resolvedSourceUrl,
      reference_token: payload.reference_token || null,
      fulfillment_type: payload.fulfillmentType || 'DELIVERY',
      pickup_info: payload.pickupInfo || null,
      quantity: orderQuantity,
      unit_price: unitPrice,
      product_subtotal: unitPrice * orderQuantity,
      order_notes: payload.order_notes || payload.notes || payload.kitchen_notes || null,
      kitchen_notes: payload.kitchen_notes || payload.order_notes || null,
      reseller_code: payload.reseller_code || undefined,
      reseller_attribution_id: payload.reseller_attribution_id || undefined,
      reseller_id: payload.reseller_id || undefined,
    },
    created_at: orderData.created_at,
    updated_at: orderData.created_at,
  };

  const dbOrderData = sanitizeOrderPayload(rawOrderData);
  delete (dbOrderData as any).fulfillment_type;
  delete (dbOrderData as any).unit_price;
  delete (dbOrderData as any).is_archived;
  delete (dbOrderData as any).subscription_id;

  let { error: orderError } = await supabase
    .from("orders")
    .insert(dbOrderData);

  if (orderError) {
    console.warn("[Checkout Service] Primary orders insert error, retrying with core fields:", orderError);
    const coreOrderData = {
      id: orderId,
      tenant_slug: payload.tenantSlug,
      tenant_id: resolvedTenantId,
      product_id: resolvedProductId,
      product_title: payload.productTitle,
      gross_amount: grossAmount,
      customer_name: payload.customerName,
      customer_phone: payload.customerPhone,
      customer_email: payload.customerEmail || null,
      quantity: orderQuantity,
      payment_status: "PENDING",
      order_status: "PENDING",
      briefing_url: normalizeBriefingUrl(payload.briefing_url || payload.customer_briefing?.briefing_url) || null,
      customer_briefing: payload.customer_briefing || (payload.briefing_url ? { briefing_url: normalizeBriefingUrl(payload.briefing_url), submitted_at: new Date().toISOString() } : null),
      status: "PENDING",
      metadata: {
        tracking_context: resolvedTrackingContext,
        city: resolvedCity,
        shipping_address: payload.shippingAddress || null,
        source_url: resolvedSourceUrl,
        reference_token: payload.reference_token || null,
        fulfillment_type: payload.fulfillmentType || 'DELIVERY',
        pickup_info: payload.pickupInfo || null,
        quantity: orderQuantity,
        unit_price: unitPrice,
        product_subtotal: unitPrice * orderQuantity,
        payment_method: paymentMethod,
      },
      created_at: orderData.created_at,
      updated_at: orderData.created_at,
    };
    const retryRes = await supabase.from("orders").insert(coreOrderData);
    orderError = retryRes.error;
  }

  if (orderError) {
    console.error("[Checkout Service] Supabase Order Insert Error:", orderError);
    throw new Error(`Gagal membuat order di database: ${orderError.message || 'Database error'}`);
  }

  // 1b. Line items
  try {
    const lineItems = [
      ...(payload.items && payload.items.length > 0
        ? payload.items.map((it) => ({
          order_id: orderId,
          tenant_id: resolvedTenantId,
          tenant_slug: payload.tenantSlug,
          product_id: it.productId,
          product_title: it.productTitle,
          item_type: 'main',
          price: it.unitPrice,
          original_price: it.unitPrice,
          quantity: it.quantity,
          metadata: {
            quantity: it.quantity,
            unit_price: it.unitPrice,
            product_subtotal: it.unitPrice * it.quantity,
            variant_id: it.variantId || null,
            variant_name: it.variantName || null,
            selected_modifiers: it.selectedModifiers || [],
            weight_grams: it.weightGrams,
            tracking_context: resolvedTrackingContext,
          },
        }))
        : [
          {
            order_id: orderId,
            tenant_id: resolvedTenantId,
            tenant_slug: payload.tenantSlug,
            product_id: resolvedProductId,
            product_title: payload.productTitle,
            item_type: 'main',
            price: Math.max(0, netProductPrice - orderBumpsTotal),
            original_price: basePrice,
            quantity: orderQuantity,
            metadata: {
              quantity: orderQuantity,
              unit_price: unitPrice,
              product_subtotal: unitPrice * orderQuantity,
              product_discount: productDiscount,
              voucher_code: payload.voucherCode || null,
              tracking_context: resolvedTrackingContext,
              briefing_url: normalizeBriefingUrl(payload.briefing_url || payload.customer_briefing?.briefing_url) || null,
              customer_briefing: payload.customer_briefing || (payload.briefing_url ? { briefing_url: normalizeBriefingUrl(payload.briefing_url), submitted_at: new Date().toISOString() } : null),
            },
          },
        ]),
      ...verifiedOrderBumps.map((b) => ({
        order_id: orderId,
        tenant_id: resolvedTenantId,
        tenant_slug: payload.tenantSlug,
        product_id: b.product_id || b.id,
        product_title: b.name,
        item_type: 'order_bump',
        price: b.price,
        original_price: b.original_price || null,
        quantity: 1,
        metadata: {
          bump_id: b.id,
          badge_text: b.badge_text || null,
          description: b.description || null,
        },
      })),
    ];

    await supabase.from('order_items').insert(lineItems);
  } catch (orderItemsCatch) {
    console.warn('[Checkout Service] Order items exception:', orderItemsCatch);
  }

  // 2. Request QRIS
  let qrString = "";
  let qrCodeUrl = "";
  let invoiceUrl = `/checkout/${orderId}`;

  if (paymentMethod === 'qris') {
    const pcfg = tenantRowData?.metadata?.payment_config;
    let tenantStaticQris =
      payload.tenantStaticQris ||
      (tenantRowData as any)?.qris_payload ||
      tenantRowData?.metadata?.qris_payload ||
      (tenantRowData as any)?.qris_static_string ||
      tenantRowData?.metadata?.qris_static_string ||
      (tenantRowData as any)?.qris_content ||
      tenantRowData?.metadata?.qris_content ||
      tenantRowData?.metadata?.payment_settings?.qris_raw ||
      tenantRowData?.metadata?.payment_settings?.raw_qris_string ||
      tenantRowData?.metadata?.qris_raw ||
      tenantRowData?.metadata?.raw_qris_string ||
      tenantRowData?.metadata?.qris?.static_qr ||
      pcfg?.qris_content ||
      pcfg?.raw_qris_string ||
      pcfg?.static_qris_payload ||
      pcfg?.qris_payload ||
      tenantRowData?.metadata?.static_qris_payload ||
      "";

    let tenantQrisImageUrl =
      (tenantRowData as any)?.qris_image_url ||
      (tenantRowData as any)?.qris_url ||
      (tenantRowData as any)?.qris_image ||
      tenantRowData?.metadata?.qris_image_url ||
      tenantRowData?.metadata?.qris_url ||
      tenantRowData?.metadata?.qris_image ||
      tenantRowData?.metadata?.payment_settings?.qris ||
      pcfg?.qris_image_url ||
      pcfg?.manual_config?.qris_image_url ||
      "";

    const isPlatformDana =
      tenantStaticQris.includes('BoonTrack') ||
      tenantStaticQris.includes('BOONTRACK') ||
      tenantStaticQris.includes('Kab. Bandung') ||
      tenantStaticQris.includes('0940770000');

    const isXenditGatewayTenant =
      payload.tenantSlug === 'onlineboost' ||
      tenantRowData?.payment_settings?.provider === 'xendit' ||
      tenantRowData?.payment_settings?.mode === 'PAYMENT_GATEWAY' ||
      tenantRowData?.metadata?.payment_settings?.provider === 'xendit' ||
      tenantRowData?.metadata?.payment_settings?.mode === 'PAYMENT_GATEWAY' ||
      !tenantStaticQris ||
      isPlatformDana;

    if (isXenditGatewayTenant) {
      try {
        const xenditRes = await createXenditDynamicQRIS({
          orderId,
          amount: grossAmount,
          tenantSlug: payload.tenantSlug,
          customerName: payload.customerName,
          customerPhone: payload.customerPhone,
          customerEmail: payload.customerEmail,
          productTitle: payload.productTitle,
        });

        if (xenditRes.success && xenditRes.qr_string) {
          qrString = xenditRes.qr_string;
          qrCodeUrl = xenditRes.qr_code_url || `https://quickchart.io/qr?text=${encodeURIComponent(qrString)}&size=300&ecLevel=H`;
          if (xenditRes.invoice_url) invoiceUrl = xenditRes.invoice_url;
        }
      } catch (xErr) {
        console.warn("[Checkout Service] Xendit Dynamic QRIS generation error:", xErr);
      }
    } else if (tenantStaticQris && tenantStaticQris.startsWith("000201") && !isPlatformDana) {
      qrString = generateDynamicQRIS(tenantStaticQris, grossAmount);
      qrCodeUrl = `https://quickchart.io/qr?text=${encodeURIComponent(qrString)}&size=300&ecLevel=H`;
    } else if (tenantQrisImageUrl) {
      qrString = tenantQrisImageUrl;
      qrCodeUrl = tenantQrisImageUrl;
    }

    if (!qrString && !qrCodeUrl) {
      const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const paymentEndpoints = [
        getBackendApiUrl("/api/v1/payments/qris/create"),
        `${appBaseUrl}/api/v1/payments/qris/create`,
        "https://api.boontrack.com/api/v1/payments/qris/create"
      ].filter(Boolean);

      const requestBody = JSON.stringify({
        external_id: orderId,
        order_id: orderId,
        amount: grossAmount,
        total_amount: grossAmount,
        unique_code: uniqueCode,
        tenant_slug: payload.tenantSlug,
        tenant_id: resolvedTenantId,
        customer_phone: payload.customerPhone,
        customer_name: payload.customerName,
        customer_email: payload.customerEmail || "",
        product_id: resolvedProductId,
        product_name: payload.productTitle,
        payment_method: 'QRIS',
        payment_status: 'PENDING',
        order_status: 'PENDING',
        metadata: {
          customer_email: payload.customerEmail || null,
          affiliate_code: payload.affiliateCode || null,
          payment_method: paymentMethod,
          base_price: basePrice,
          product_discount: productDiscount,
          net_product_price: netProductPrice,
          shipping_cost: shippingCost,
          shipping_subsidy: shippingSubsidy,
          net_shipping_cost: netShippingCost,
          voucher_code: payload.voucherCode || null,
          admin_fee: adminFee,
          unique_code: uniqueCode,
          affiliate_commission: affiliateCommission,
          order_bumps: verifiedOrderBumps.length > 0 ? verifiedOrderBumps : undefined,
          tracking: payload.tracking || {},
          tracking_context: resolvedTrackingContext
        }
      });

      for (const endpoint of paymentEndpoints) {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody
          });

          if (res.ok) {
            const paymentResult = await res.json();
            qrString = paymentResult.qr_string || paymentResult.qr_content || "";
            qrCodeUrl = paymentResult.qr_code_url || (qrString ? `https://quickchart.io/qr?text=${encodeURIComponent(qrString)}&size=300&ecLevel=H` : "");
            const remoteInvoice = paymentResult.invoice_url || paymentResult.payment_url || "";
            if (remoteInvoice) invoiceUrl = remoteInvoice;
            if (qrString || qrCodeUrl) break;
          }
        } catch (apiErr) {
          console.warn(`[Checkout Service] Error calling ${endpoint}:`, apiErr);
        }
      }
    }

    if (!qrString && !qrCodeUrl) {
      try {
        const xenditRes = await createXenditDynamicQRIS({
          orderId,
          amount: grossAmount,
          tenantSlug: payload.tenantSlug,
          customerName: payload.customerName,
          customerPhone: payload.customerPhone,
          customerEmail: payload.customerEmail,
          productTitle: payload.productTitle,
        });
        if (xenditRes.success && xenditRes.qr_string) {
          qrString = xenditRes.qr_string;
          qrCodeUrl = xenditRes.qr_code_url || `https://quickchart.io/qr?text=${encodeURIComponent(qrString)}&size=300&ecLevel=H`;
          if (xenditRes.invoice_url) invoiceUrl = xenditRes.invoice_url;
        }
      } catch (xErr) {
        console.warn("[Checkout Service] Final Xendit fallback note:", xErr);
      }
    }

    if (qrString) {
      const isPlatformDanaQr =
        qrString.includes('BoonTrack') ||
        qrString.includes('BOONTRACK') ||
        qrString.includes('Kab. Bandung') ||
        qrString.includes('0940770000');

      if (qrString.startsWith("000201010211") && !isPlatformDanaQr) {
        qrString = generateDynamicQRIS(qrString, grossAmount);
        qrCodeUrl = `https://quickchart.io/qr?text=${encodeURIComponent(qrString)}&size=300&ecLevel=H`;
      } else if (!qrCodeUrl) {
        qrCodeUrl = qrString.startsWith("000201")
          ? `https://quickchart.io/qr?text=${encodeURIComponent(qrString)}&size=300&ecLevel=H`
          : qrString;
      }
    }

    try {
      await supabase.from("orders").update({
        qr_code_url: qrCodeUrl || null
      }).eq("id", orderId);
    } catch { }
  }

  // Trigger CAPI InitiateCheckout (Non-blocking)
  try {
    const trackingCtwa = payload.ctwa_clid || payload.tracking?.ctwa_clid || null;
    const capiUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/v1/tracking/capi`;
    fetch(capiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantSlug: payload.tenantSlug,
        eventName: 'InitiateCheckout',
        eventId: `IC_${orderId}`,
        orderId,
        amount: grossAmount,
        currency: 'IDR',
        productTitle: payload.productTitle,
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        customerEmail: payload.customerEmail,
        customerCity: resolvedCity || undefined,
        city: resolvedCity || undefined,
        ctwa_clid: trackingCtwa,
        fbp: resolvedTrackingContext.fbp,
        fbc: resolvedTrackingContext.fbc || (payload.tracking?.fbclid ? `fb.1.${Date.now()}.${payload.tracking.fbclid}` : undefined),
        client_user_agent: resolvedTrackingContext.client_user_agent || undefined,
        event_source_url: resolvedSourceUrl || undefined,
      }),
    }).catch((err) => console.warn('[Checkout Service] CAPI InitiateCheckout warning:', err));
  } catch (_) { }

  return {
    orderId,
    qrString,
    qr_string: qrString,
    qrCodeUrl,
    invoiceUrl,
    referenceToken: payload.reference_token || null,
  };
}