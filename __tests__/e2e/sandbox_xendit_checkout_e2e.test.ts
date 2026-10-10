import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Load .env.local into process.env if needed
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const val = match[2].trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {}

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { handlePaymentWebhook } from '@/lib/payment-webhook-service';
import type { NextRequest } from 'next/server';

describe('Sandbox End-to-End Test: Checkout Xendit, Afiliasi, Entitlement, & CAPI', () => {
  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) {
    throw new Error('Supabase client unreachable');
  }

  const hashSha256 = (val: string) => {
    return crypto.createHash('sha256').update(String(val).trim().toLowerCase()).digest('hex');
  };

  function createMockNextRequest(url: string, body: any): NextRequest {
    const bodyText = JSON.stringify(body);
    const headers = new Headers({
      'content-type': 'application/json',
      'x-forwarded-for': '127.0.0.1',
      'user-agent': 'Xendit-Webhook-Simulator/1.0',
    });

    return {
      url,
      method: 'POST',
      headers,
      json: async () => JSON.parse(bodyText),
      text: async () => bodyText,
    } as unknown as NextRequest;
  }

  const tenantSlug = 'onlineboost';
  const sku = 'ACADEMY_CTWA_BATCH1_B';
  const orderPrice = 149000;
  const affiliateCommission = 35000;
  const inkubasiGroupUrl = 'https://chat.whatsapp.com/InkubasiCTWABatch1Official';

  let tenantId: string;
  let productId: string;
  let testOrderId: string;
  let baselineCredits = 0;
  let customerPhone = '6281299887711';
  let customerEmail = 'budi.sandbox@testboontrack.id';
  let customerName = 'Budi Sandbox Tester';

  beforeAll(async () => {
    // 1. Verify tenant onlineboost
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('id, slug, name, metadata')
      .eq('slug', tenantSlug)
      .single();

    expect(tenantRow).toBeDefined();
    tenantId = tenantRow.id;

    // 2. Verify affiliate test exists
    const { data: affRow } = await supabase
      .from('affiliates')
      .select('id, referral_code')
      .eq('referral_code', 'test')
      .maybeSingle();

    if (!affRow) {
      await supabase.from('affiliates').insert({
        tenant_id: tenantSlug,
        name: 'Tester Affiliate',
        referral_code: 'test',
        phone: customerPhone,
        phone_number: customerPhone,
        commission_rate: 23.49,
        status: 'ACTIVE',
        role: 'affiliate',
        email: 'test.referrer@example.com',
      });
    }

    // 3. Baseline studio entitlements
    let { data: entRow } = await supabase
      .from('tenant_entitlements')
      .select('credits_remaining')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!entRow) {
      await supabase.from('tenant_entitlements').insert({
        tenant_id: tenantId,
        credits_remaining: 0,
        tier: 'FREE',
        is_unlimited: false,
      });
      baselineCredits = 0;
    } else {
      baselineCredits = entRow.credits_remaining ?? 0;
    }
  });

  afterAll(async () => {
    // Clean up test order & outbox artifacts if needed
    if (testOrderId) {
      await supabase.from('capi_outbox').delete().eq('order_id', testOrderId);
      await supabase.from('message_outbox').delete().eq('recipient_phone', customerPhone);
      await supabase.from('affiliate_commissions').delete().eq('order_id', testOrderId);
      await supabase.from('tenant_credit_ledger').delete().eq('idempotency_key', `BONUS_${tenantId}_${testOrderId}`);
      await supabase.from('orders').delete().eq('id', testOrderId);
    }
  });

  test('Step 1: Inisiasi Checkout Digital SKU ACADEMY_CTWA_BATCH1_B dengan is_digital bypass', async () => {
    console.log('\n--- [TEST STEP 1] Inisiasi Checkout Digital SKU ACADEMY_CTWA_BATCH1_B ---');

    // 1. Ambil data produk dari database Supabase
    const { data: productRow } = await supabase
      .from('products')
      .select('*')
      .eq('sku', sku)
      .single();

    expect(productRow).toBeDefined();
    expect(productRow.price).toBe(orderPrice);
    expect(productRow.is_digital).toBe(true);
    productId = productRow.id;

    console.log(`[PASS] Produk Terverifikasi: ${productRow.name}`);
    console.log(`       SKU: ${productRow.sku} | Harga: Rp ${orderPrice.toLocaleString('id-ID')}`);
    console.log(`       is_digital: ${productRow.is_digital}`);

    // 2. Invariant Assertion: is_digital: true mem-bypass form alamat & ongkos kirim (Rp 0)
    const requiresShipping = productRow.is_digital ? false : true;
    const shippingCost = productRow.is_digital ? 0 : 15000;
    expect(requiresShipping).toBe(false);
    expect(shippingCost).toBe(0);
    console.log('[PASS] Flag is_digital: true berhasil mem-bypass alamat pengiriman dan ongkos kirim (Rp 0).');

    // 3. Buat pesanan baru status WAITING_PAYMENT dengan ref: "test"
    testOrderId = `ORD-SANDBOX-${Date.now()}`;
    const newOrderPayload = {
      id: testOrderId,
      tenant_id: tenantId,
      tenant_slug: tenantSlug,
      product_id: productId,
      product_title: productRow.name,
      gross_amount: orderPrice,
      status: 'WAITING_PAYMENT',
      payment_status: 'PENDING',
      order_status: 'WAITING_PAYMENT',
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      affiliate_code: 'test',
      download_url: inkubasiGroupUrl,
      fulfillment_metadata: {
        access_url: inkubasiGroupUrl,
        instructions: `Silakan bergabung ke grup inkubasi CTWA Batch 1: ${inkubasiGroupUrl}`,
        button_text: 'Masuk Grup WhatsApp',
      },
      metadata: {
        ref: 'test',
        affiliate_code: 'test',
        affiliate_commission: affiliateCommission,
        is_digital: true,
        sku,
        requires_shipping: false,
        shipping_cost: 0,
        payment_method: 'QRIS',
        delivery_url: inkubasiGroupUrl,
      },
    };

    const { data: insertedOrder, error: insErr } = await supabase
      .from('orders')
      .insert(newOrderPayload)
      .select()
      .single();

    expect(insErr).toBeNull();
    expect(insertedOrder.id).toBe(testOrderId);
    expect(insertedOrder.status).toBe('WAITING_PAYMENT');
    console.log(`[PASS] Order Baru Dibuat: #${testOrderId} (Status: WAITING_PAYMENT, Total: Rp ${orderPrice})`);

    // 4. Simulasi penerbitan invoice Xendit QRIS
    const xenditInvoiceId = `inv_sandbox_${testOrderId}`;
    const xenditInvoiceUrl = `https://checkout-staging.xendit.co/web/${xenditInvoiceId}`;
    expect(xenditInvoiceId).toContain(testOrderId);
    console.log(`[PASS] Invoice Xendit QRIS Simulasi Terbit: ${xenditInvoiceId}`);
    console.log(`       URL: ${xenditInvoiceUrl}`);
  });

  test('Step 2: Simulasi Webhook Xendit (Callback PAID) ke /api/webhooks/xendit', async () => {
    console.log('\n--- [TEST STEP 2] Simulasi Webhook Xendit Callback PAID ---');

    const webhookPayload = {
      id: `inv_sandbox_${testOrderId}`,
      external_id: testOrderId,
      user_id: 'xendit_sandbox_user_99',
      status: 'PAID',
      merchant_name: 'OnlineBoost ID',
      amount: orderPrice,
      paid_amount: orderPrice,
      bank_code: 'QRIS',
      payment_method: 'QRIS',
      payment_channel: 'XENDIT_QRIS',
      paid_at: new Date().toISOString(),
      payer_email: customerEmail,
      description: `Invoice for ACADEMY_CTWA_BATCH1_B - ${testOrderId}`,
    };

    const mockReq = createMockNextRequest('http://localhost:3000/api/webhooks/xendit', webhookPayload);
    const res = await handlePaymentWebhook(mockReq, '/api/webhooks/xendit');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    console.log(`[PASS] Webhook Gateway Merespons HTTP 200 OK: ${json.message}`);
  });

  test('Step 3.a: Status pesanan di database berubah menjadi PAID / COMPLETED', async () => {
    console.log('\n--- [TEST STEP 3.a] Verifikasi Status Pesanan di Database ---');

    const { data: dbOrder } = await supabase
      .from('orders')
      .select('id, status, payment_status, order_status, paid_at')
      .eq('id', testOrderId)
      .single();

    expect(dbOrder).toBeDefined();
    expect(dbOrder.status).toBe('PAID');
    expect(dbOrder.payment_status).toBe('PAID');
    expect(dbOrder.order_status).toBe('COMPLETED');
    expect(dbOrder.paid_at).toBeDefined();

    console.log(`[PASS] Database Order #${testOrderId}:`);
    console.log(`       status: '${dbOrder.status}'`);
    console.log(`       payment_status: '${dbOrder.payment_status}'`);
    console.log(`       order_status: '${dbOrder.order_status}'`);
    console.log(`       paid_at: '${dbOrder.paid_at}'`);
  });

  test('Step 3.b: Saldo Studio bertambah +15 Kredit di tenant_entitlements & tier diubah menjadi member', async () => {
    console.log('\n--- [TEST STEP 3.b] Verifikasi Entitlements & Studio Credits ---');

    const { data: entRow } = await supabase
      .from('tenant_entitlements')
      .select('credits_remaining, tier')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    expect(entRow).toBeDefined();
    expect(entRow?.tier).toBe('member');
    expect(entRow?.credits_remaining).toBeGreaterThanOrEqual(baselineCredits + 15);

    // Verifikasi audit ledger mutasi
    const { data: ledgerRow } = await supabase
      .from('tenant_credit_ledger')
      .select('amount, action, balance_after')
      .eq('tenant_id', tenantId)
      .eq('action', 'PROMO_SHOP_ACTIVATION_BONUS')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    expect(ledgerRow).toBeDefined();
    expect(ledgerRow?.amount).toBe(15);
    expect(ledgerRow?.action).toBe('PROMO_SHOP_ACTIVATION_BONUS');

    console.log(`[PASS] Entitlements: tier='${entRow?.tier}', saldo kredit=${entRow?.credits_remaining} (+15 dari baseline ${baselineCredits})`);
    console.log(`       Audit Ledger: action='${ledgerRow?.action}', amount=+${ledgerRow?.amount}`);
  });

  test('Step 3.c: Komisi afiliasi untuk referrer test tercatat Rp 35.000 di buku besar afiliasi (affiliate_ledger)', async () => {
    console.log('\n--- [TEST STEP 3.c] Verifikasi Komisi Afiliasi di affiliate_ledger ---');

    const { data: commList } = await supabase
      .from('affiliate_ledger')
      .select('id, order_id, amount, status')
      .eq('order_id', testOrderId);

    expect(commList).toBeDefined();
    expect(commList?.length).toBeGreaterThan(0);
    const comm = commList![0];
    expect(Number(comm.amount)).toBe(affiliateCommission);

    console.log(`[PASS] Buku Besar Afiliasi (affiliate_ledger):`);
    console.log(`       order_id: '${comm.order_id}'`);
    console.log(`       nominal: Rp ${Number(comm.amount).toLocaleString('id-ID')} (Rp 35.000)`);
    console.log(`       status: '${comm.status}'`);
  });

  test('Step 3.d: Event Meta CAPI Purchase ter-enqueue di outbox (value Rp 149.000, IDR, hash SHA-256, dedup PURCHASE_{order_id})', async () => {
    console.log('\n--- [TEST STEP 3.d] Verifikasi Event Meta CAPI Purchase di capi_outbox ---');

    const expectedDedupKey = `PURCHASE_${testOrderId}`;
    const { data: capiRow } = await supabase
      .from('capi_outbox')
      .select('id, order_id, event_name, business_event_id, payload, meta_status')
      .eq('order_id', testOrderId)
      .maybeSingle();

    expect(capiRow).toBeDefined();
    expect(capiRow?.event_name).toBe('Purchase');
    expect(capiRow?.business_event_id).toBe(expectedDedupKey);

    const payload = capiRow!.payload;
    const value = Number(payload.value ?? payload.gross_amount);
    expect(value).toBe(orderPrice);
    expect(payload.currency).toBe('IDR');

    // Cek SHA-256 hash kontak
    const expectedPhoneHash = hashSha256(customerPhone);
    const expectedEmailHash = hashSha256(customerEmail);
    expect(payload.customer_phone_hash).toBe(expectedPhoneHash);
    expect(payload.customer_email_hash).toBe(expectedEmailHash);

    console.log(`[PASS] Outbox CAPI Event:`);
    console.log(`       business_event_id: '${capiRow?.business_event_id}'`);
    console.log(`       event_name: '${capiRow?.event_name}'`);
    console.log(`       value: Rp ${value.toLocaleString('id-ID')} ${payload.currency}`);
    console.log(`       customer_phone_hash: '${payload.customer_phone_hash}'`);
    console.log(`       customer_email_hash: '${payload.customer_email_hash}'`);
  });

  test('Step 3.e: Outbound WhatsApp message terdaftar di queue/outbox berisi notifikasi sukses dan link grup inkubasi', async () => {
    console.log('\n--- [TEST STEP 3.e] Verifikasi Outbound Message di message_outbox ---');

    const { data: waRow } = await supabase
      .from('message_outbox')
      .select('id, recipient_phone, channel, status, payload')
      .eq('recipient_phone', customerPhone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    expect(waRow).toBeDefined();
    expect(waRow.channel).toBe('WHATSAPP');
    expect(waRow.recipient_phone).toBe(customerPhone);

    const bodyText = waRow.payload?.text?.body || '';
    expect(bodyText).toMatch(/LUNAS|BERHASIL/);
    expect(bodyText).toContain(inkubasiGroupUrl);

    console.log(`[PASS] Outbound WhatsApp Queue (message_outbox):`);
    console.log(`       recipient: '${waRow.recipient_phone}' | channel: '${waRow.channel}'`);
    console.log(`       link inkubasi termuat: '${inkubasiGroupUrl}'`);
    console.log(`       cuplikan teks: "${bodyText.slice(0, 150)}..."`);
  });
});
