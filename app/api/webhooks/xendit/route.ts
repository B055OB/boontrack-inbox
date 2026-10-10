import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { handlePaymentWebhook, getRecentWebhookLogs } from '@/lib/payment-webhook-service';

export const dynamic = 'force-dynamic';

/**
 * Webhook Xendit Gateway (QRIS, Virtual Account, Invoice, Credit Card)
 * Route: /api/webhooks/xendit
 */
export async function POST(req: NextRequest) {
  return handlePaymentWebhook(req, '/api/webhooks/xendit');
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const showLogs = searchParams.get('logs') === 'true' || searchParams.get('view_logs') === '1';

  return NextResponse.json({
    status: 'ONLINE',
    service: 'BoonTrack Official Xendit Webhook Gateway',
    endpoint: '/api/webhooks/xendit',
    timestamp: new Date().toISOString(),
    logs: showLogs ? getRecentWebhookLogs() : undefined,
  });
}
