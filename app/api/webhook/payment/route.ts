import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  handlePaymentWebhook,
  getRecentWebhookLogs,
  isAuthorizedWebhookLogViewer,
} from '@/lib/payment-webhook-service';

export const dynamic = 'force-dynamic';

/**
 * Webhook Pembayaran QRIS / Mutasi Bank / Gateway / BoonTrack Reader
 * Menerima callback saat transaksi berhasil lunas (PAID / SETTLED) maupun
 * payload notifikasi mutasi otomatis dari BoonTrack Reader APK Android.
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

  return handlePaymentWebhook(req, '/api/webhook/payment');
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const showLogs = searchParams.get('logs') === 'true' || searchParams.get('view_logs') === '1';

  if (showLogs) {
    // Kunci di balik otorisasi admin internal (mencegah eksposur publik diagnostic logs)
    // HANYA izinkan ADMIN_INTERNAL_SECRET / INTERNAL_API_SECRET atau Supabase Service Role Key.
    // XENDIT_CALLBACK_TOKEN atau EVOLUTION_API_KEY tidak memiliki izin membaca diagnostic logs.
    if (!isAuthorizedWebhookLogViewer(req)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Diagnostic logs require internal admin authorization.' },
        { status: 401 }
      );
    }
  }

  return NextResponse.json({
    status: 'ONLINE',
    service: 'BoonTrack Payment & QRIS Mutation Webhook',
    endpoint: '/api/webhook/payment',
    timestamp: new Date().toISOString(),
    logs: showLogs ? getRecentWebhookLogs() : undefined,
  });
}
