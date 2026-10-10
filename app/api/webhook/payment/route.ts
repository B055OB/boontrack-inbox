import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { handlePaymentWebhook, getRecentWebhookLogs } from '@/lib/payment-webhook-service';

export const dynamic = 'force-dynamic';

/**
 * Webhook Pembayaran QRIS / Mutasi Bank / Gateway / BoonTrack Reader
 * Menerima callback saat transaksi berhasil lunas (PAID / SETTLED) maupun
 * payload notifikasi mutasi otomatis dari BoonTrack Reader APK Android.
 */
export async function POST(req: NextRequest) {
  return handlePaymentWebhook(req, '/api/webhook/payment');
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
    service: 'BoonTrack Payment & QRIS Mutation Webhook',
    endpoint: '/api/webhook/payment',
    timestamp: new Date().toISOString(),
    logs: showLogs ? getRecentWebhookLogs() : undefined,
  });
}
