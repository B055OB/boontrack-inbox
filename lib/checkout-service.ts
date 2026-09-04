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
}

export async function createOrderAndInvoice(payload: CreateOrderPayload) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase client not initialized");

  const orderId = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const paymentMethod = payload.paymentMethod || 'qris';
  const basePrice = payload.basePrice ?? payload.amount;
  // Biaya admin Rp0 untuk QRIS maupun Transfer Bank Manual (dana langsung masuk ke seller)
  const adminFee = payload.adminFee ?? 0;
  const uniqueCode = payload.uniqueCode ?? 0;
  const grossAmount = payload.amount || (basePrice + adminFee + uniqueCode);
  // Komisi affiliate 30% dihitung murni dari harga dasar (net), terpisah dari admin fee & kode unik
  const affiliateCommission = payload.affiliateCommission ?? Math.round(basePrice * 0.3);

  // 1. Simpan order ke database Supabase
  const { error: orderError } = await supabase
    .from("orders")
    .insert({
      id: orderId,
      tenant_slug: payload.tenantSlug,
      product_id: payload.productId,
      product_title: payload.productTitle,
      gross_amount: grossAmount,
      base_price: basePrice,
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
    });

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