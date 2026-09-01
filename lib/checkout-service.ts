import { getSupabase } from "@/lib/supabaseClient";

interface CreateOrderPayload {
  tenantSlug: string;
  productId: string;
  productTitle: string;
  amount: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  affiliateCode?: string;
  managerId?: string;
}

export async function createOrderAndInvoice(payload: CreateOrderPayload) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase client not initialized");

  const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // 1. Simpan draft pesanan ke Supabase
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .insert({
      id: orderId,
      tenant_slug: payload.tenantSlug,
      product_id: payload.productId,
      product_title: payload.productTitle,
      gross_amount: payload.amount,
      customer_name: payload.customerName,
      customer_phone: payload.customerPhone,
      customer_email: payload.customerEmail || "",
      affiliate_code: payload.affiliateCode || null,
      manager_id: payload.managerId || null,
      status: "PENDING_PAYMENT",
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (orderError) {
    throw new Error(`Failed to create order: ${orderError.message}`);
  }

  // 2. Buat Invoice/QRIS via endpoint backend
  const res = await fetch("https://boontrack-core-production.up.railway.app/payment/create-qris", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: orderId,
      amount: payload.amount,
      tenant_slug: payload.tenantSlug,
      customer_phone: payload.customerPhone,
      customer_name: payload.customerName
    })
  });

  if (!res.ok) {
    throw new Error("Gagal membuat sesi pembayaran QRIS");
  }

  const paymentResult = await res.json();
  return {
    orderId,
    qrString: paymentResult.qr_string,
    invoiceUrl: paymentResult.invoice_url
  };
}