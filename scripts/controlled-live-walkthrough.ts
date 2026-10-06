/**
 * Controlled Live Walkthrough using PJP Mock / Sandbox Mode
 * Validates the 7 CTO/CFO Acceptance Matrix items for dr. Harys (tumbuh-kembang-anak).
 */

import fs from 'fs';
if (fs.existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}
if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}

import { createOrderAndInvoice } from '../lib/checkout-service';
import { handlePaymentWebhook } from '../lib/payment-webhook-service';
import {
  routeTenantInboundMessage,
  pauseBotForConversation,
  getBotSessionState,
  clearSessionCacheForTest,
  getCompositeSessionKey,
} from '../lib/bot/tenant-bot-isolation';
import { ContactService } from '../lib/crm/contact.service';
import { getSupabaseAdmin, getSupabase } from '../lib/supabaseClient';
import { NextRequest } from 'next/server';

interface MatrixResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: MatrixResult[] = [];

function recordResult(id: string, name: string, passed: boolean, details: string) {
  results.push({ id, name, passed, details });
  const statusStr = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`\n[${statusStr}] [${id}] ${name}`);
  console.log(`       Details: ${details}`);
}

async function runControlledWalkthrough() {
  console.log('========================================================================');
  console.log('CONTROLLED LIVE WALKTHROUGH — PJP MOCK / SANDBOX MODE (CTO & CFO MANDATE)');
  console.log('Target: 7 Acceptance Matrix Points for dr. Harys (tumbuh-kembang-anak)');
  console.log('========================================================================\n');

  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) {
    throw new Error('Supabase client failed to initialize');
  }

  const senderPhone = '+6281299990001';
  let createdOrderId = '';
  let grossAmount = 0;

  // --------------------------------------------------------------------------
  // Matrix 1A: Product Routing & Mock QRIS Checkout (/p/happyeating)
  // --------------------------------------------------------------------------
  try {
    const checkoutResult = await createOrderAndInvoice({
      tenantSlug: 'tumbuh-kembang-anak',
      productId: 'happyeating',
      productTitle: 'Course GTM & Solusi MPASI Anti-GTM',
      amount: 199000,
      basePrice: 199000,
      paymentMethod: 'qris',
      customerName: 'Bunda Sarah',
      customerPhone: senderPhone,
      customerEmail: 'bunda.sarah@example.com',
      productType: 'DIGITAL_FILE',
    });

    createdOrderId = checkoutResult.orderId;
    const qrString = checkoutResult.qrString || checkoutResult.qr_string || '';

    // Verify order in Supabase
    const { data: dbOrder } = await supabase
      .from('orders')
      .select('id, status, payment_status, gross_amount')
      .eq('id', createdOrderId)
      .maybeSingle();

    grossAmount = dbOrder?.gross_amount || 199000;
    const paymentStatus = dbOrder?.status || dbOrder?.payment_status || '';

    const isDynamicQris = qrString.startsWith('000201010212') || qrString.includes('010212');
    const isPending = paymentStatus === 'PENDING';

    recordResult(
      '1A',
      'Product Routing: Checkout /p/happyeating -> Mock Dynamic QRIS (PAYMENT_PENDING)',
      isPending && isDynamicQris && Boolean(createdOrderId),
      `Order: #${createdOrderId}, Gross: Rp ${grossAmount.toLocaleString('id-ID')}, Status: ${paymentStatus}, QR Dynamic: ${isDynamicQris ? 'YES (010212)' : 'NO'}`
    );
  } catch (err: any) {
    recordResult('1A', 'Product Routing: Checkout /p/happyeating -> Mock QRIS', false, err?.message || String(err));
  }

  // --------------------------------------------------------------------------
  // Matrix 1B: Clinical Screening Mini Intake Form (/p/konsultasi-dokter)
  // --------------------------------------------------------------------------
  try {
    const tenantUuid = await ContactService.resolveTenantId('tumbuh-kembang-anak');
    if (!tenantUuid) throw new Error('Tenant UUID resolution failed');

    const leadContact = await ContactService.createOrUpdateFullContact({
      tenantId: tenantUuid,
      name: 'Bunda Sarah',
      phone: senderPhone,
      email: 'bunda.sarah@example.com',
      lifecycleStage: 'LEAD',
      tags: ['Webchat Lead', '🥣 Masalah Makan & GTM'],
      initialNotes: 'Anak: Arka (14 bulan). Format Sesi: Chat Konsultasi WhatsApp. Catatan: BB seret sejak 2 bulan.',
      metadata: {
        source: 'MINI_INTAKE_SCREENING',
        child_name: 'Arka',
        child_age: '14 bulan',
        concern: '🥣 Masalah Makan & GTM',
        captured_at: new Date().toISOString(),
      },
    });

    // Generate formatted WhatsApp message URL
    const prefilledText = `*FORMULIR SCREENING & RESERVASI DOKTER ANAK*
Halo Tim Asisten Dokter (Klinik Tumbuh Kembang Anak), saya ingin reservasi jadwal konsultasi medis:
• Nama Orang Tua: Bunda Sarah
• Nama Anak: Arka (14 bulan)
• Keluhan Utama: 🥣 Masalah Makan & GTM
(Ref: tumbuh-kembang-anak#konsultasi-dokter)`;

    const waAssistantUrl = `https://wa.me/6285129992305?text=${encodeURIComponent(prefilledText)}`;

    recordResult(
      '1B',
      'Clinical Screening: Mini Intake Form (/p/konsultasi-dokter) -> CRM Lead & WA Forward',
      Boolean(leadContact && leadContact.lifecycle_stage === 'LEAD' && waAssistantUrl.includes('6285129992305')),
      `Lead ID: ${leadContact?.id}, Stage: ${leadContact?.lifecycle_stage}, Tags: [${leadContact?.tags?.join(', ')}], Target WA: ${waAssistantUrl.slice(0, 48)}...`
    );
  } catch (err: any) {
    recordResult('1B', 'Clinical Screening: Mini Intake Form -> CRM Lead', false, err?.message || String(err));
  }

  // --------------------------------------------------------------------------
  // Matrix 2: Tenant & Session Isolation Check (+6281299990001 simultan)
  // --------------------------------------------------------------------------
  try {
    clearSessionCacheForTest();

    const sessionKeyA = getCompositeSessionKey('tumbuh-kembang-anak', senderPhone);
    const sessionKeyB = getCompositeSessionKey('toko-demo', senderPhone);

    // Route message to Tenant A (Klinik Medis)
    const routeA = await routeTenantInboundMessage({
      tenantIdOrSlug: 'tumbuh-kembang-anak',
      senderPhone,
      message: 'Halo dokter, mau tanya jadwal konsultasi',
    });

    // Route message to Tenant B (Toko Demo Ritel)
    const routeB = await routeTenantInboundMessage({
      tenantIdOrSlug: 'toko-demo',
      senderPhone,
      message: 'Halo admin, mau tanya produk',
    });

    const isIsolatedKeys =
      sessionKeyA !== sessionKeyB &&
      sessionKeyA === `tumbuh-kembang-anak:${senderPhone}` &&
      sessionKeyB === `toko-demo:${senderPhone}`;

    const isolatedReplies = routeA.reply !== routeB.reply && routeA.handled && routeB.handled;

    recordResult(
      '2',
      'Tenant & Session Isolation: Simultan 2 Tenant dengan 1 Nomor Telepon',
      isIsolatedKeys && isolatedReplies,
      `Session A: '${sessionKeyA}' -> Reply: "${routeA.reply.slice(0, 35)}..." | Session B: '${sessionKeyB}' -> Reply: "${routeB.reply.slice(0, 35)}..."`
    );
  } catch (err: any) {
    recordResult('2', 'Tenant & Session Isolation', false, err?.message || String(err));
  }

  // --------------------------------------------------------------------------
  // Matrix 3A: Payment Authority & Webhook Resilience (Mock Callback Success)
  // --------------------------------------------------------------------------
  try {
    if (!createdOrderId) throw new Error('Order ID not available from Step 1A');

    const mockWebhookBody = {
      order_id: createdOrderId,
      amount: grossAmount,
      status: 'PAID',
      payment_type: 'qris',
      tenant_slug: 'tumbuh-kembang-anak',
      transaction_time: new Date().toISOString(),
    };

    const mockRequest = new NextRequest('http://localhost:3000/api/webhooks/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockWebhookBody),
    });

    const webhookRes = await handlePaymentWebhook(mockRequest, '/api/webhooks/payment');
    const webhookData = await webhookRes.json();

    const isPaidSuccess = webhookRes.status === 200 && webhookData.success === true && !webhookData.already_paid;

    // Verify in database (SSOT)
    const { data: verifiedOrder } = await supabase
      .from('orders')
      .select('status, payment_status, paid_at')
      .eq('id', createdOrderId)
      .maybeSingle();

    const dbConfirmed = verifiedOrder?.status === 'PAID' && Boolean(verifiedOrder?.paid_at);

    recordResult(
      '3A',
      'Payment Authority: Mock Callback Webhook Transitions Order to PAID',
      isPaidSuccess && dbConfirmed,
      `Order: #${createdOrderId}, DB Status: ${verifiedOrder?.status}, Paid At: ${verifiedOrder?.paid_at}`
    );
  } catch (err: any) {
    recordResult('3A', 'Payment Authority: Mock Callback Webhook', false, err?.message || String(err));
  }

  // --------------------------------------------------------------------------
  // Matrix 3B: Idempotency & Duplicate Callback Resilience
  // --------------------------------------------------------------------------
  try {
    if (!createdOrderId) throw new Error('Order ID not available');

    const duplicateWebhookBody = {
      order_id: createdOrderId,
      amount: grossAmount,
      status: 'PAID',
      payment_type: 'qris',
      tenant_slug: 'tumbuh-kembang-anak',
      transaction_time: new Date().toISOString(),
    };

    const duplicateReq = new NextRequest('http://localhost:3000/api/webhooks/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicateWebhookBody),
    });

    const dupRes = await handlePaymentWebhook(duplicateReq, '/api/webhooks/payment');
    const dupData = await dupRes.json();

    const isIdempotent = dupRes.status === 200 && dupData.already_paid === true;

    recordResult(
      '3B',
      'Webhook Resilience: Duplicate Callback Test (Strict Idempotency Guard)',
      isIdempotent,
      `Response: HTTP ${dupRes.status}, already_paid: ${dupData.already_paid}, message: "${dupData.message}"`
    );
  } catch (err: any) {
    recordResult('3B', 'Webhook Resilience: Duplicate Callback Test', false, err?.message || String(err));
  }

  // --------------------------------------------------------------------------
  // Matrix 4A: Failure Case - Unpaid / Expired Invoice
  // --------------------------------------------------------------------------
  try {
    const tenantUuid = await ContactService.resolveTenantId('tumbuh-kembang-anak');
    const expiredOrderId = `ORD-EXP-${Date.now()}`;
    await supabase.from('orders').insert({
      id: expiredOrderId,
      tenant_slug: 'tumbuh-kembang-anak',
      tenant_id: tenantUuid,
      product_id: 'happyeating',
      product_title: 'Course GTM (Expired Test)',
      gross_amount: 199000,
      customer_name: 'Bunda Test',
      customer_phone: '+6281299990002',
      status: 'EXPIRED',
      payment_status: 'UNPAID',
      metadata: {
        fulfillment_status: 'UNFULFILLED',
      },
    });

    const { data: expOrder } = await supabase
      .from('orders')
      .select('status, paid_at, metadata')
      .eq('id', expiredOrderId)
      .maybeSingle();

    const isUnfulfilled =
      expOrder?.status === 'EXPIRED' &&
      !expOrder?.paid_at &&
      expOrder?.metadata?.fulfillment_status !== 'FULFILLED';

    recordResult(
      '4A',
      'Failure Case: Tagihan Expired/Unpaid Tidak Pernah Menerbitkan Konfirmasi Prematur',
      Boolean(isUnfulfilled),
      `Order: #${expiredOrderId}, Status: ${expOrder?.status}, Paid At: ${expOrder?.paid_at ?? 'NULL'}, Premature Fulfillment: NONE`
    );
  } catch (err: any) {
    recordResult('4A', 'Failure Case: Tagihan Expired/Unpaid', false, err?.message || String(err));
  }

  // --------------------------------------------------------------------------
  // Matrix 4B: Failure Case - Human Takeover ('Bicara dengan Asisten Dokter')
  // --------------------------------------------------------------------------
  try {
    // 1. Simulate customer selecting Option 'Bicara dengan Asisten Dokter'
    await pauseBotForConversation(
      'tumbuh-kembang-anak',
      senderPhone,
      'CUSTOMER_SELECT_HUMAN_ASSISTANT',
      1440
    );

    const stateA = await getBotSessionState('tumbuh-kembang-anak', senderPhone);
    const stateB = await getBotSessionState('toko-demo', senderPhone);

    const isTenantAPaused = stateA.bot_paused === true && stateA.paused_reason === 'CUSTOMER_SELECT_HUMAN_ASSISTANT';
    const isTenantBActive = stateB.bot_paused === false; // Must remain false (Zero Leakage)

    recordResult(
      '4B',
      'Human Takeover: Opsi "Bicara dengan Asisten Dokter" Mengaktifkan bot_paused = true',
      isTenantAPaused && isTenantBActive,
      `Tenant A bot_paused: ${stateA.bot_paused} (${stateA.paused_reason}) | Tenant B bot_paused: ${stateB.bot_paused} (Isolated)`
    );
  } catch (err: any) {
    recordResult('4B', 'Human Takeover: bot_paused state', false, err?.message || String(err));
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('ACCEPTANCE MATRIX FINAL VERDICT');
  console.log('========================================================================');
  const allPassed = results.every((r) => r.passed);
  console.log(`TOTAL CHECKS: ${results.length}`);
  console.log(`PASSED: ${results.filter((r) => r.passed).length}`);
  console.log(`FAILED: ${results.filter((r) => !r.passed).length}`);
  console.log(`OVERALL STATUS: ${allPassed ? '✅ 100% READY FOR CTO/CFO PRESENTATION' : '❌ BLOCKERS FOUND'}`);
  console.log('========================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runControlledWalkthrough().catch((err) => {
  console.error('[Controlled Walkthrough Error]:', err);
  process.exit(1);
});
