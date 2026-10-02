import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { handlePaymentWebhook, getRecentWebhookLogs } from '@/lib/payment-webhook-service';

export const dynamic = 'force-dynamic';

/**
 * Webhook Pembayaran QRIS / Mutasi Bank / Gateway (Midtrans, Xendit, Duitku, Reader)
 * Route alias: /api/webhooks/payment
 */
export async function POST(req: NextRequest) {
  return handlePaymentWebhook(req, '/api/webhooks/payment');
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const showLogs = searchParams.get('logs') === 'true' || searchParams.get('view_logs') === '1';

  return NextResponse.json({
    status: 'ONLINE',
    service: 'BoonTrack Payment & QRIS Mutation Webhook (Plural Alias)',
    endpoint: '/api/webhooks/payment',
    timestamp: new Date().toISOString(),
    logs: showLogs ? getRecentWebhookLogs() : undefined,
  });
}
