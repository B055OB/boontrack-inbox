import { getSupabase } from "@/lib/supabaseClient";
import { getBackendApiUrl } from "@/lib/api-config";

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
  affiliateCode?: string;
  managerId?: string;
  tracking?: Record<string, any>;
  voucherCode?: string;
  productDiscount?: number;
  netProductPrice?: number;
  shippingCost?: number;
  shippingSubsidy?: number;
  netShippingCost?: number;
  shippingAddress?: string;
  shippingCourier?: string;
}

export async function createOrderAndInvoice(payload: CreateOrderPayload) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase client not initialized");

  const orderId = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const paymentMethod = payload.paymentMethod || 'qris';
  const basePrice = payload.basePrice ?? payload.amount;
  const productDiscount = payload.productDiscount ?? 0;
  const netProductPrice = payload.netProductPrice ?? Math.max(0, basePrice - productDiscount);
  const shippingCost = payload.shippingCost ?? 0;
  const shippingSubsidy = payload.shippingSubsidy ?? 0;
  const netShippingCost = payload.netShippingCost ?? Math.max(0, shippingCost - shippingSubsidy);

  // Biaya admin Rp0 untuk QRIS maupun Transfer Bank Manual (dana langsung masuk ke seller)
  const adminFee = 0;
  const uniqueCode = payload.uniqueCode ?? 0;
  const grossAmount = payload.amount || (netProductPrice + netShippingCost + uniqueCode);

  // Komisi affiliate 30% dihitung murni dari Harga Bersih Produk (net) setelah diskon produk, terpisah dari ongkir & kode unik
  const affiliateCommission = payload.affiliateCommission ?? Math.round(netProductPrice * 0.3);

  const orderData = {
    id: orderId,
    tenant_slug: payload.tenantSlug,
    product_id: payload.productId,
    product_title: payload.productTitle,
    gross_amount: grossAmount,
    base_price: basePrice,
    product_discount: productDiscount,
    net_product_price: netProductPrice,
    shipping_cost: shippingCost,
    shipping_subsidy: shippingSubsidy,
    net_shipping_cost: netShippingCost,
    voucher_code: payload.voucherCode || null,
    shipping_address: payload.shippingAddress || null,
    shipping_courier: payload.shippingCourier || null,
    admin_fee: adminFee,
    unique_code: uniqueCode,
    payment_method: paymentMethod,
    affiliate_commission: affiliateCommission,
    customer_name: payload.customerName,
    customer_phone: payload.customerPhone,
    customer_email: payload.customerEmail || "",
    affiliate_code: payload.affiliateCode || null,
    manager_id: payload.managerId || null,
    utm_source: payload.tracking?.utm_source || null,
    utm_medium: payload.tracking?.utm_medium || null,
    utm_campaign: payload.tracking?.utm_campaign || null,
    utm_content: payload.tracking?.utm_content || null,
    utm_term: payload.tracking?.utm_term || null,
    fbclid: payload.tracking?.fbclid || null,
    ttclid: payload.tracking?.ttclid || null,
    status: "PENDING_PAYMENT",
    created_at: new Date().toISOString()
  };

  // Simpan ke localStorage untuk akses cepat di browser client
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`bt_order_${orderId}`, JSON.stringify(orderData));
    } catch (e) {
      console.warn("[Checkout Service] Failed to save local order backup:", e);
    }
  }

  // 1. Simpan order ke database Supabase
  const { error: orderError } = await supabase
    .from("orders")
    .insert(orderData);

  if (orderError) {
    console.error("[Checkout Service] Supabase Order Insert Error:", orderError);
    try {
      await supabase.from("product_orders").insert({
        tenant_id: payload.tenantSlug,
        order_id: orderId,
        customer_name: payload.customerName,
        customer_phone: payload.customerPhone,
        customer_email: payload.customerEmail || "",
        product_name: payload.productTitle,
        gross_amount: grossAmount,
        base_price: basePrice,
        product_discount: productDiscount,
        net_product_price: netProductPrice,
        shipping_cost: shippingCost,
        shipping_subsidy: shippingSubsidy,
        net_shipping_cost: netShippingCost,
        voucher_code: payload.voucherCode || null,
        shipping_address: payload.shippingAddress || null,
        admin_fee: adminFee,
        unique_code: uniqueCode,
        payment_method: paymentMethod,
        affiliate_commission: affiliateCommission,
        status: "PENDING",
        affiliate_code: payload.affiliateCode || null,
        created_at: new Date().toISOString()
      });
    } catch (fallbackErr) {
      console.warn("[Checkout Service] Fallback table insert error:", fallbackErr);
    }
  }

  // 2. Request pembuatan QRIS / Invoice ke Backend API (jika QRIS)
  let qrString = "";
  let invoiceUrl = `/checkout/${orderId}`;

  if (paymentMethod === 'qris') {
    const paymentEndpoints = [
      getBackendApiUrl("/api/v1/payments/qris/create"),
      "https://api.boontrack.com/api/v1/payments/qris/create",
      "https://boontrack-core-production.up.railway.app/api/v1/payments/qris/create"
    ];

    const requestBody = JSON.stringify({
      external_id: orderId,
      amount: grossAmount,
      tenant_slug: payload.tenantSlug,
      customer_phone: payload.customerPhone,
      customer_name: payload.customerName,
      product_name: payload.productTitle,
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
        tracking: payload.tracking || {}
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
          const remoteInvoice = paymentResult.qr_code_url || paymentResult.invoice_url || paymentResult.payment_url || "";
          if (remoteInvoice) invoiceUrl = remoteInvoice;
          if (qrString || remoteInvoice) break;
        }
      } catch (apiErr) {
        console.warn(`[Checkout Service] Error calling ${endpoint}:`, apiErr);
      }
    }
  }

  return {
    orderId,
    qrString,
    invoiceUrl
  };
}