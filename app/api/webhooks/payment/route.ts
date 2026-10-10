import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { handlePaymentWebhook, getRecentWebhookLogs } from '@/lib/payment-webhook-service';

export const dynamic = 'force-dynamic';

/**
 * Webhook Pembayaran QRIS / Mutasi Bank / Gateway (Midtrans, Xendit, Duitku, Reader)
 * Route alias: /api/webhooks/payment
 */
export async function POST(req: NextRequest) {
  // 1. Strict Callback Token Validation (Fail-Closed)
  const callbackToken = req.headers.get('x-callback-token')?.trim();
  const expectedToken = process.env.XENDIT_CALLBACK_TOKEN?.trim();

  if (!expectedToken || !callbackToken || callbackToken !== expectedToken) {
    console.warn(
      `[Payment Webhook Security] Unauthorized webhook attempt: invalid or missing x-callback-token`
    );
    return NextResponse.json(
      { success: false, error: 'Forbidden: Invalid or missing x-callback-token' },
      { status: 403 }
    );
  }

  return handlePaymentWebhook(req, '/api/webhooks/payment');
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const showLogs = searchParams.get('logs') === 'true' || searchParams.get('view_logs') === '1';

  if (showLogs) {
    // Kunci di balik otorisasi admin internal (mencegah eksposur publik diagnostic logs)
    const authHeader = req.headers.get('authorization')?.trim();
    const internalSecret = req.headers.get('x-internal-secret')?.trim();
    const adminKey = req.headers.get('x-admin-key')?.trim();
    const callbackHeader = req.headers.get('x-callback-token')?.trim();

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const envInternalSecret = process.env.INTERNAL_API_SECRET?.trim();
    const evoKey = process.env.EVOLUTION_API_KEY?.trim();
    const expectedToken = process.env.XENDIT_CALLBACK_TOKEN?.trim();

    const isAuthorizedAdmin =
      (envInternalSecret && internalSecret === envInternalSecret) ||
      (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`) ||
      (evoKey && adminKey === evoKey) ||
      (expectedToken && callbackHeader === expectedToken);

    if (!isAuthorizedAdmin) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Diagnostic logs require internal admin authorization.' },
        { status: 401 }
      );
    }
  }

  return NextResponse.json({
    status: 'ONLINE',
    service: 'BoonTrack Payment & QRIS Mutation Webhook (Plural Alias)',
    endpoint: '/api/webhooks/payment',
    timestamp: new Date().toISOString(),
    logs: showLogs ? getRecentWebhookLogs() : undefined,
  });
}
