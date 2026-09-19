import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { handlePaymentWebhook, getRecentWebhookLogs } from '@/lib/payment-webhook-service';

export const dynamic = 'force-dynamic';

/**
 * Webhook Handler untuk BoonTrack Reader (Android Notification Listener)
 * Menerima payload POST notifikasi transaksi perbankan / e-wallet (DANA Bisnis, BCA, GoPay, dll)
 * dan mencocokkan nominal mutasi ke pesanan yang menunggu pembayaran.
 */
export async function POST(req: NextRequest) {
  return handlePaymentWebhook(req, '/api/v1/payments/qris/webhook');
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const showLogs = searchParams.get('logs') === 'true' || searchParams.get('view_logs') === '1';

  return NextResponse.json({
    status: 'ONLINE',
    service: 'BoonTrack Reader QRIS Webhook Endpoint',
    endpoint: '/api/v1/payments/qris/webhook',
    timestamp: new Date().toISOString(),
    logs: showLogs ? getRecentWebhookLogs() : undefined,
    supported_providers: ['DANA Bisnis', 'BCA Mobile', 'myBCA', 'GoPay Usaha', 'Livin Mandiri', 'BRImo'],
  });
}
