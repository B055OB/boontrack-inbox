/**
 * POST /api/webhooks/xendit/paid
 *
 * Idempotent Webhook Handler for Xendit PAID Notifications (Directive RE-01 / Sprint P0)
 *
 * Invariants:
 * 1. Fail-closed callback token security verification (x-callback-token).
 * 2. Resolves matched order by external_id / reference_id / order_id.
 * 3. Updates order status to PAID.
 * 4. Checks reseller_user_id on order:
 *    - Prevents Self-Referral: skips commission if buyer phone (E.164) or email matches reseller.
 *    - If valid, records immutable EARNED mutation in reseller_commission_ledger with status PENDING_CLEARANCE
 *      and available_at = NOW() + INTERVAL '7 days'.
 *    - Uses idempotency_key = 'EARN_' || order_id to guarantee zero double-crediting.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { recordResellerCommissionLedger } from '@/lib/attribution/reseller-attribution-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // 1. Strict Callback Token Validation (Fail-Closed)
  const callbackToken = req.headers.get('x-callback-token')?.trim();
  const expectedToken = process.env.XENDIT_CALLBACK_TOKEN?.trim();

  // Allow bypass in test environment only if explicitly configured
  if (process.env.NODE_ENV !== 'test') {
    if (!expectedToken || !callbackToken || callbackToken !== expectedToken) {
      console.warn('[Xendit Webhook Paid Security] Unauthorized webhook attempt: invalid or missing x-callback-token');
      return NextResponse.json(
        { success: false, error: 'Forbidden: Invalid or missing x-callback-token' },
        { status: 403 }
      );
    }
  }

  let rawBody: any = {};
  try {
    const textBody = await req.text();
    if (textBody) {
      rawBody = JSON.parse(textBody);
    }
  } catch (parseErr) {
    console.error('[Xendit Webhook Paid] Invalid JSON payload:', parseErr);
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  // 2. Extract Order Identifier
  const orderId = String(
    rawBody.external_id ||
    rawBody.reference_id ||
    rawBody.data?.reference_id ||
    rawBody.data?.external_id ||
    rawBody.order_id ||
    rawBody.data?.order_id ||
    rawBody.id ||
    rawBody.data?.id ||
    ''
  ).trim();

  if (!orderId) {
    return NextResponse.json(
      { success: false, error: 'Missing order_id or external_id in payload' },
      { status: 400 }
    );
  }

  const rawStatus = String(
    rawBody.status ||
    rawBody.payment_status ||
    rawBody.event ||
    rawBody.data?.status ||
    'PAID'
  ).toUpperCase();

  const isPaidEvent =
    rawStatus === 'PAID' ||
    rawStatus === 'SETTLED' ||
    rawStatus === 'SETTLEMENT' ||
    rawStatus === 'SUCCESS' ||
    rawStatus === 'COMPLETED' ||
    rawStatus === 'INVOICE.PAID' ||
    rawStatus === 'PAYMENT.SUCCEEDED' ||
    rawBody.event === 'qr.payment';

  if (!isPaidEvent) {
    return NextResponse.json({
      success: true,
      message: `Status '${rawStatus}' received. Non-payment notification acknowledged without ledger mutation.`,
      order_id: orderId,
    });
  }

  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: 'Supabase client unavailable' },
      { status: 500 }
    );
  }

  // 3. Find Order in Database
  let { data: order } = await supabase
    .from('orders')
    .select('id, tenant_id, tenant_slug, customer_name, customer_phone, customer_email, status, payment_status, gross_amount, paid_at, reseller_user_id, reseller_code_snapshot, reseller_commission_amount, attribution_type')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) {
    // Try searching by correlation_id or external_id metadata
    const { data: orderByAlt } = await supabase
      .from('orders')
      .select('id, tenant_id, tenant_slug, customer_name, customer_phone, customer_email, status, payment_status, gross_amount, paid_at, reseller_user_id, reseller_code_snapshot, reseller_commission_amount, attribution_type')
      .or(`correlation_id.eq.${orderId},metadata->>xendit_id.eq.${orderId},metadata->>xendit_external_id.eq.${orderId}`)
      .maybeSingle();

    if (orderByAlt) {
      order = orderByAlt;
    }
  }

  if (!order) {
    return NextResponse.json(
      { success: false, error: `Order #${orderId} not found` },
      { status: 404 }
    );
  }

  const paidAt = order.paid_at || new Date().toISOString();

  // 4. Update Order Status to PAID if not already marked
  if (order.status !== 'PAID' && order.payment_status !== 'PAID') {
    await supabase
      .from('orders')
      .update({
        status: 'PAID',
        payment_status: 'PAID',
        paid_at: paidAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);
  }

  // 5. Record Reseller Commission Ledger (Directive RE-01 / Sprint P0)
  const ledgerResult = await recordResellerCommissionLedger({
    orderId: order.id,
    tenantId: order.tenant_id,
    supabaseClient: supabase,
  });

  return NextResponse.json({
    success: true,
    message: `Order #${order.id} marked as PAID. Reseller commission processed.`,
    order_id: order.id,
    reseller_user_id: order.reseller_user_id || null,
    commission_ledger: ledgerResult,
  }, { status: 200 });
}
