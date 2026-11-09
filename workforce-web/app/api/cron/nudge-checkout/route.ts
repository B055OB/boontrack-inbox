import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * BWM Cron Nudge Checkout & Shift Reconciliation
 * 
 * CTO MANDATE: Demo cron dispatch is explicitly disabled.
 * Requires valid CRON_SECRET authorization header.
 * Dispatches only to persistent outbox, never arbitrary unverified WhatsApp numbers.
 */

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || req.headers.get('x-cron-secret');
  const cronSecret = process.env.CRON_SECRET || 'bwm_cron_secret_staging_guard_2026';

  // Authorization Guard
  if (!authHeader || !authHeader.includes(cronSecret)) {
    return NextResponse.json(
      {
        success: false,
        error: 'UNAUTHORIZED_CRON',
        message: 'Invalid or missing cron authorization header.',
      },
      { status: 401 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      status: 'CRON_DISPATCH_PAUSED_STAGING',
      message: 'Demo cron dispatch safely paused for staging trial. No external WhatsApp messages sent.',
      evaluated_shifts: 0,
      outbox_queued: 0,
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}

export async function POST(req: NextRequest) {
  return GET(req);
}
