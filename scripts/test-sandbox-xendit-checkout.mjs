import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { handlePaymentWebhook } from '../lib/payment-webhook-service.ts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// Helper for SHA-256 Hashing
function hashSha256(val) {
  if (!val) return '';
  return crypto.createHash('sha256').update(String(val).trim().toLowerCase()).digest('hex');
}

// Mock NextRequest for internal route invocation
function createMockNextRequest(url, body, headers = {}) {
  const bodyText = JSON.stringify(body);
  const reqHeaders = new Headers({
    'content-type': 'application/json',
    'x-forwarded-for': '127.0.0.1',
    'user-agent': 'Xendit-Webhook-Simulator/1.0',
    ...headers,
  });

  return {
    url,
    method: 'POST',
    headers: reqHeaders,
    json: async () => JSON.parse(bodyText),
    text: async () => bodyText,
  };
}

async function runSandboxE2ETest() {
  console.log('================================================================================');
  console.log('🧪 BOONTRACK SANDBOX E2E INTEGRATION TEST: CHECKOUT XENDIT, AFILIASI, ENTITLEMENT, & CAPI');
  console.log('================================================================================\n');

  // STEP 0: Inisialisasi Tenant & Baseline Data
  console.log('--- [STEP 0] Inisialisasi Konteks Tenant onlineboost & Referrer test ---');
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, slug, name, tier, metadata')
    .eq('slug', 'onlineboost')
    .single();

  if (tErr || !tenant) {
    throw new Error(`Tenant onlineboost tidak ditemukan di Supabase: ${tErr?.message}`);
  }
  console.log(`✅ Tenant Verified: ${tenant.name} (id: ${tenant.id}, slug: ${tenant.slug})`);

  // Pastikan Affiliate 'test' tersedia
  const { data: existingAff } = await supabase
    .from('affiliates')
    .select('id, referral_code, name, commission_rate')
    .eq('referral_code', 'test')
    .maybeSingle();

  let affiliateId = existingAff?.id;
  if (!affiliateId) {
    console.log('ℹ️ Mendaftarkan affiliate mock `test` untuk pengujian...');
    const { data: newAff, error: affInsErr } = await supabase
      .from('affiliates')
      .insert({
        tenant_id: tenant.slug,
        name: 'Tester Affiliate',
        referral_code: 'test',
        phone: '6281234567890',
        phone_number: '6281234567890',
        commission_rate: 23.49,
        status: 'ACTIVE',
        role: 'affiliate',
        email: 'test.referrer@example.com',
      })
      .select('id')
      .single();

    if (affInsErr) throw new Error(`Gagal mendaftarkan affiliate test: ${affInsErr.message}`);
    affiliateId = newAff.id;
  }
  console.log(`✅ Referrer Affiliate Verified: referral_code='test' (id: ${affiliateId})`);

  // Baca Baseline Saldo Studio di tenant_entitlements
  const { data: baselineEnt } = await supabase
    .from('tenant_entitlements')
    .select('credits_remaining, tier')
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  const baselineCredits = baselineEnt?.credits_remaining ?? 0;
  console.log(`📊 Baseline Studio Credits di tenant_entitlements: ${baselineCredits} kredit (Tier: ${baselineEnt?.tier || 'none'})`);

  // STEP 1: Inisiasi Checkout Digital (Produk ACADEMY_CTWA_BATCH1_B)
  console.log('\n--- [STEP 1] Inisiasi Checkout Digital: SKU ACADEMY_CTWA_BATCH1_B (Rp 149.000) ---');
  const productsList = Array.isArray(tenant.metadata?.products) ? tenant.metadata.products : [];
  const targetProduct = productsList.find((p) => p.sku === 'ACADEMY_CTWA_BATCH1_B');

  if (!targetProduct) {
    throw new Error('Produk ACADEMY_CTWA_BATCH1_B belum ada di metadata tenant. Jalankan seed terlebih dahulu.');
  }

  console.log(`✅ Data Produk Ditemukan: "${targetProduct.name}"`);
  console.log(`   - SKU: ${targetProduct.sku}`);
  console.log(`   - Harga: Rp ${Number(targetProduct.price).toLocaleString('id-ID')}`);
  console.log(`   - Flag is_digital: ${targetProduct.is_digital}`);

  // Invariant Assertion: is_digital: true mem-bypass pengiriman
  if (targetProduct.is_digital !== true) {
    throw new Error('ASSERTION FAILED: is_digital wajib bernilai true!');
  }
  console.log('✅ Assertion Passed: is_digital: true berhasil mem-bypass form alamat & ekspedisi kurir (Ongkir Rp 0).');

  const orderId = `ORD-SANDBOX-${Date.now()}`;
  const inkubasiGroupUrl = 'https://chat.whatsapp.com/InkubasiCTWABatch1Official';
  const customerName = 'Budi Sandbox Buyer';
  const customerPhone = '6281288991122';
  const customerEmail = 'budi.sandbox@testboontrack.id';
  const orderGrossAmount = 149000;
  const affiliateCommission = 35000;

  // Insert pesanan baru berstatus WAITING_PAYMENT
  const newOrderPayload = {
    id: orderId,
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    product_id: targetProduct.id,
    product_title: targetProduct.name,
    gross_amount: orderGrossAmount,
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
      instructions: `Selamat bergabung di Kelas Inkubasi CTWA Batch 1. Silakan masuk ke grup koordinasi: ${inkubasiGroupUrl}`,
      button_text: 'Masuk Grup Inkubasi WhatsApp',
    },
    metadata: {
      ref: 'test',
      affiliate_code: 'test',
      affiliate_commission: affiliateCommission,
      is_digital: true,
      sku: targetProduct.sku,
      requires_shipping: false,
      shipping_cost: 0,
      payment_method: 'QRIS',
      delivery_url: inkubasiGroupUrl,
      tracking_context: {
        fbp: 'fb.1.1791611000.123456789',
        fbc: 'fb.1.1791611000.fbclid_sandbox_test',
        client_user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0',
        client_ip_address: '103.20.188.1',
        source_url: `https://shop.boontrack.com/${tenant.slug}/p/${targetProduct.slug}?ref=test`,
      },
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: insertedOrder, error: orderInsErr } = await supabase
    .from('orders')
    .insert(newOrderPayload)
    .select()
    .single();

  if (orderInsErr) {
    throw new Error(`Gagal membuat order baru: ${orderInsErr.message}`);
  }
  console.log(`✅ Pesanan Baru Berhasil Dibuat: #${insertedOrder.id} (Status: ${insertedOrder.status}, Nominal: Rp ${Number(insertedOrder.gross_amount).toLocaleString('id-ID')})`);

  // Simulasi Pembuatan Invoice Xendit QRIS Sandbox
  const xenditInvoiceId = `inv_sandbox_${orderId}`;
  const xenditInvoiceUrl = `https://checkout-staging.xendit.co/web/${xenditInvoiceId}`;
  console.log(`💳 Invoice Xendit QRIS Sandbox Terbit: ${xenditInvoiceId}`);
  console.log(`   - Payment URL: ${xenditInvoiceUrl}`);
  console.log(`   - QRIS Payload Amount: Rp ${orderGrossAmount.toLocaleString('id-ID')}`);

  // STEP 2: Simulasi Webhook Xendit (Callback PAID)
  console.log('\n--- [STEP 2] Simulasi Webhook Xendit: Mengirim Callback PAID ke /api/webhooks/xendit ---');
  const mockWebhookPayload = {
    id: xenditInvoiceId,
    external_id: orderId,
    user_id: 'xendit_sandbox_user_99',
    status: 'PAID',
    merchant_name: tenant.name,
    amount: orderGrossAmount,
    paid_amount: orderGrossAmount,
    bank_code: 'QRIS',
    payment_method: 'QRIS',
    payment_channel: 'XENDIT_QRIS',
    paid_at: new Date().toISOString(),
    payer_email: customerEmail,
    description: `Pembayaran Invoice #${xenditInvoiceId} untuk ${targetProduct.name}`,
  };

  const mockReq = createMockNextRequest('http://localhost:3000/api/webhooks/xendit', mockWebhookPayload, {
    'x-callback-token': 'sandbox_xendit_token_valid',
  });

  const webhookResponse = await handlePaymentWebhook(mockReq, '/api/webhooks/xendit');
  const webhookResultJson = await webhookResponse.json();

  console.log(`📡 Response Webhook Gateway: HTTP ${webhookResponse.status}`, webhookResultJson);

  if (webhookResponse.status !== 200 || !webhookResultJson.success) {
    throw new Error(`Webhook handler mengembalikan error: ${JSON.stringify(webhookResultJson)}`);
  }
  console.log('✅ Webhook Callback Xendit PAID berhasil diproses oleh engine!');

  // STEP 3: Verifikasi Assertion Pasca-Bayar
  console.log('\n--- [STEP 3] Verifikasi Assertions Pasca-Bayar di Database Supabase ---');

  // a. Status pesanan di database berubah menjadi PAID / COMPLETED
  const { data: updatedDbOrder } = await supabase
    .from('orders')
    .select('id, status, payment_status, order_status, paid_at')
    .eq('id', orderId)
    .single();

  console.log('\n[ASSERTION a] Status Pesanan:');
  console.log(`   - DB status: '${updatedDbOrder?.status}'`);
  console.log(`   - DB payment_status: '${updatedDbOrder?.payment_status}'`);
  console.log(`   - DB order_status: '${updatedDbOrder?.order_status}'`);
  console.log(`   - DB paid_at: '${updatedDbOrder?.paid_at}'`);

  if (updatedDbOrder?.status !== 'PAID' || updatedDbOrder?.order_status !== 'COMPLETED') {
    throw new Error(`ASSERTION FAILED (a): Status order belum PAID / COMPLETED (actual: status=${updatedDbOrder?.status}, order_status=${updatedDbOrder?.order_status})`);
  }
  console.log('   ✅ Assertion a PASSED: Pesanan resmi berstatus PAID & COMPLETED.');

  // b. Saldo Studio bertambah +15 Kredit di ledger tenant_entitlements dan tier akun diubah menjadi member
  const { data: updatedEnt } = await supabase
    .from('tenant_entitlements')
    .select('credits_remaining, tier')
    .eq('tenant_id', tenant.id)
    .single();

  const { data: creditLedgerBonus } = await supabase
    .from('tenant_credit_ledger')
    .select('amount, action, balance_after')
    .eq('tenant_id', tenant.id)
    .eq('action', 'PROMO_SHOP_ACTIVATION_BONUS')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log('\n[ASSERTION b] Saldo Studio & Tier Entitlement:');
  console.log(`   - Entitlement tier: '${updatedEnt?.tier}'`);
  console.log(`   - Saldo kredit sekarang: ${updatedEnt?.credits_remaining} (sebelumnya: ${baselineCredits}, delta: +${(updatedEnt?.credits_remaining ?? 0) - baselineCredits})`);
  console.log(`   - Audit Ledger record: action='${creditLedgerBonus?.action}', amount=+${creditLedgerBonus?.amount}`);

  if (updatedEnt?.tier !== 'member') {
    throw new Error(`ASSERTION FAILED (b): Tier entitlement wajib 'member' (actual: '${updatedEnt?.tier}')`);
  }
  if ((updatedEnt?.credits_remaining ?? 0) < baselineCredits + 15) {
    throw new Error(`ASSERTION FAILED (b): Saldo kredit belum bertambah minimal +15 (actual: ${updatedEnt?.credits_remaining})`);
  }
  if (!creditLedgerBonus || creditLedgerBonus.amount !== 15) {
    throw new Error(`ASSERTION FAILED (b): Mutasi audit ledger PROMO_SHOP_ACTIVATION_BONUS (+15) tidak ditemukan`);
  }
  console.log('   ✅ Assertion b PASSED: Saldo Studio bertambah +15 Kredit dan tier ter-upgrade menjadi member.');

  // c. Komisi afiliasi untuk referrer 'test' tercatat Rp 35.000 di buku besar afiliasi (affiliate_ledger)
  const { data: affiliateComms } = await supabase
    .from('affiliate_ledger')
    .select('id, order_id, affiliate_id, amount, status, product_type')
    .eq('order_id', orderId);

  console.log('\n[ASSERTION c] Komisi Afiliasi di affiliate_ledger:');
  console.log(`   - Record count: ${affiliateComms?.length || 0}`);
  if (affiliateComms && affiliateComms.length > 0) {
    console.log(`   - Amount: Rp ${Number(affiliateComms[0].amount).toLocaleString('id-ID')}`);
    console.log(`   - Affiliate ID: '${affiliateComms[0].affiliate_id}'`);
    console.log(`   - Status: '${affiliateComms[0].status}'`);
  }

  if (!affiliateComms || affiliateComms.length === 0) {
    throw new Error('ASSERTION FAILED (c): Komisi afiliasi tidak ditemukan di affiliate_ledger untuk order ini.');
  }
  if (Number(affiliateComms[0].amount) !== affiliateCommission) {
    throw new Error(`ASSERTION FAILED (c): Nominal komisi tidak sesuai Rp 35.000 (actual: Rp ${affiliateComms[0].amount})`);
  }
  console.log('   ✅ Assertion c PASSED: Komisi afiliasi untuk referrer test tercatat tepat Rp 35.000.');

  // d. Event Meta CAPI Purchase ter-enqueue di outbox dengan payload: value Rp 149.000, IDR, kontak ter-hash SHA-256, deduplication key PURCHASE_{order_id}
  const expectedDedupKey = `PURCHASE_${orderId}`;
  const { data: capiOutboxRow } = await supabase
    .from('capi_outbox')
    .select('id, order_id, event_name, business_event_id, payload, meta_status')
    .eq('order_id', orderId)
    .maybeSingle();

  console.log('\n[ASSERTION d] Event Meta CAPI Purchase di capi_outbox:');
  console.log(`   - Event Name: '${capiOutboxRow?.event_name}'`);
  console.log(`   - Business Event ID (Dedup Key): '${capiOutboxRow?.business_event_id}' (Expected: '${expectedDedupKey}')`);
  console.log(`   - Outbox Status: '${capiOutboxRow?.meta_status}'`);
  console.log(`   - Payload Value: Rp ${Number(capiOutboxRow?.payload?.value ?? capiOutboxRow?.payload?.gross_amount).toLocaleString('id-ID')}`);
  console.log(`   - Payload Currency: '${capiOutboxRow?.payload?.currency}'`);
  console.log(`   - Hashed Phone (SHA-256): '${capiOutboxRow?.payload?.customer_phone_hash}'`);
  console.log(`   - Hashed Email (SHA-256): '${capiOutboxRow?.payload?.customer_email_hash}'`);

  if (!capiOutboxRow) {
    throw new Error('ASSERTION FAILED (d): Record event Meta CAPI Purchase tidak ditemukan di tabel capi_outbox.');
  }
  if (capiOutboxRow.business_event_id !== expectedDedupKey) {
    throw new Error(`ASSERTION FAILED (d): Deduplication key mismatch: expected '${expectedDedupKey}', actual '${capiOutboxRow.business_event_id}'`);
  }
  const payloadValue = Number(capiOutboxRow.payload?.value ?? capiOutboxRow.payload?.gross_amount);
  if (payloadValue !== 149000 || capiOutboxRow.payload?.currency !== 'IDR') {
    throw new Error(`ASSERTION FAILED (d): Payload value/currency mismatch: value=${payloadValue}, currency=${capiOutboxRow.payload?.currency}`);
  }
  if (!capiOutboxRow.payload?.customer_phone_hash || !capiOutboxRow.payload?.customer_email_hash) {
    throw new Error('ASSERTION FAILED (d): Payload data kontak belum ter-hash SHA-256.');
  }
  const expectedPhoneHash = hashSha256(customerPhone);
  if (capiOutboxRow.payload.customer_phone_hash !== expectedPhoneHash) {
    throw new Error('ASSERTION FAILED (d): Nilai hash SHA-256 nomor WhatsApp pembeli tidak valid.');
  }
  console.log('   ✅ Assertion d PASSED: Event Meta CAPI Purchase ter-enqueue dengan value Rp 149.000, IDR, kontak ter-hash SHA-256, dan deduplication key PURCHASE_{order_id}.');

  // e. Outbound message ke WhatsApp pembeli terdaftar di queue/outbox berisi notifikasi sukses dan link grup inkubasi
  const { data: waOutboxRow } = await supabase
    .from('message_outbox')
    .select('id, recipient_phone, channel, status, payload')
    .eq('recipient_phone', customerPhone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log('\n[ASSERTION e] Outbound WhatsApp Message di message_outbox:');
  console.log(`   - Recipient Phone: '${waOutboxRow?.recipient_phone}'`);
  console.log(`   - Channel: '${waOutboxRow?.channel}'`);
  console.log(`   - Status Queue: '${waOutboxRow?.status}'`);
  const waBodyText = waOutboxRow?.payload?.text?.body || '';
  console.log(`   - Message Preview: "${waBodyText.slice(0, 160)}..."`);

  if (!waOutboxRow) {
    throw new Error('ASSERTION FAILED (e): Pesan WhatsApp tidak ditemukan di message_outbox.');
  }
  if (!waBodyText.includes('LUNAS') && !waBodyText.includes('BERHASIL')) {
    throw new Error('ASSERTION FAILED (e): Pesan WhatsApp tidak memuat kata konfirmasi LUNAS/BERHASIL.');
  }
  if (!waBodyText.includes(inkubasiGroupUrl)) {
    throw new Error(`ASSERTION FAILED (e): Pesan WhatsApp tidak memuat link grup inkubasi (${inkubasiGroupUrl})`);
  }
  console.log('   ✅ Assertion e PASSED: Pesan WhatsApp terdaftar di message_outbox memuat notifikasi sukses & link grup inkubasi.');

  console.log('\n================================================================================');
  console.log('🎉 SELURUH STEP INTEGRATION TEST SANDBOX & ASSERTIONS BERHASIL 100% (ALL PASSED)');
  console.log('================================================================================');
}

runSandboxE2ETest().catch((err) => {
  console.error('\n❌ TEST RUN FAILED DENGAN ERROR:', err);
  process.exit(1);
});
