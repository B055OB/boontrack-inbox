import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  handlePaymentWebhook,
  getRecentWebhookLogs,
  isAuthorizedWebhookLogViewer,
} from '@/lib/payment-webhook-service';

export const dynamic = 'force-dynamic';

/**
 * ⚠️ ARCHITECTURAL WARNING: PRODUCTION XENDIT WEBHOOK 100% ROUTED TO RAILWAY BACKEND
 * ====================================================================================
 * Single Source of Truth / Konstitusi: ARCHITECTURE.md § 70 (Payment Webhook Routing)
 *
 * JALUR RESMI WEBHOOK PRODUKSI:
 * 👉 https://api.boontrack.com/api/v1/payments/xendit/callback
 *
 * PERINGATAN KONFIGURASI GANDA (DUAL-INGESTION HAZARD):
 * - Frontend Next.js (dashboard.boontrack.com) bertindak sebagai CONSUMER MURNI (read & mutate via API/SWR).
 * - Pemrosesan webhook resmi (verifikasi token, mutasi status DB ke PAID, pencatatan ledger finansial,
 *   dan dispatch notifikasi WhatsApp via worker) 100% didelegasikan ke Railway backend (boontrack-core).
 * - DILARANG KERAS mengonfigurasi webhook Xendit Dashboard ke rute lokal Next.js ini di lingkungan produksi!
 *
 * Endpoint lokal ini dipertahankan hanya untuk backwards compatibility, dev staging, dan mock testing lokal.
 * ====================================================================================
 */
export async function POST(req: NextRequest) {
  // 1. Strict Callback Token Validation (Fail-Closed)
  const callbackToken = req.headers.get('x-callback-token')?.trim();
  const expectedToken = process.env.XENDIT_CALLBACK_TOKEN?.trim();

  if (!expectedToken || !callbackToken || callbackToken !== expectedToken) {
    console.warn(
      `[Xendit Webhook Security] Unauthorized webhook attempt: invalid or missing x-callback-token`
    );
    return NextResponse.json(
      { success: false, error: 'Forbidden: Invalid or missing x-callback-token' },
      { status: 403 }
    );
  }

  return handlePaymentWebhook(req, '/api/webhooks/xendit');
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
    service: 'BoonTrack Local Xendit Webhook Gateway (Deprecated for Production)',
    official_production_ingress: 'https://api.boontrack.com/api/v1/payments/xendit/callback',
    architecture_note: 'Production webhook 100% routed to Railway backend (api.boontrack.com). Frontend acts purely as a consumer (read & mutate via API/SWR). Do NOT configure this URL in Xendit production dashboard.',
    endpoint: '/api/webhooks/xendit',
    timestamp: new Date().toISOString(),
    logs: showLogs ? getRecentWebhookLogs() : undefined,
  });
}
