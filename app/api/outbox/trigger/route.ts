/**
 * app/api/outbox/trigger/route.ts
 * POST /api/outbox/trigger
 *
 * Trigger endpoint for the Outbox Worker. Designed to be called by:
 *   - Vercel Cron Jobs (vercel.json: { "path": "/api/outbox/trigger", "schedule": "* * * * *" })
 *   - Manual curl for testing: curl -X POST http://localhost:3000/api/outbox/trigger \
 *       -H "Authorization: Bearer <CRON_SECRET>"
 *
 * Security: requires Authorization: Bearer <CRON_SECRET> header.
 * CRON_SECRET env var must be set in production.
 */

import { NextRequest, NextResponse } from 'next/server';
import { outboxWorker } from '@/lib/outbox/worker';
import { wabaProviderAdapter } from '@/lib/outbox/adapters/waba-adapter';

export const runtime = 'nodejs'; // required for Supabase DB connections

const CRON_SECRET = process.env.CRON_SECRET ?? '';

function authenticate(request: NextRequest): boolean {
  // Skip auth if no CRON_SECRET configured (local dev only)
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[outbox/trigger] CRON_SECRET not set in production — rejecting request');
      return false;
    }
    return true; // dev shortcut
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  return token === CRON_SECRET;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!authenticate(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const startTime = Date.now();

  try {
    const summary = await outboxWorker.runOnce(wabaProviderAdapter);

    return NextResponse.json({
      ok: true,
      summary,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[outbox/trigger] Unhandled error:', msg);

    return NextResponse.json(
      { ok: false, error: msg, duration_ms: Date.now() - startTime },
      { status: 500 }
    );
  }
}

// Health check for Vercel Cron health monitoring
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: 'outbox-trigger-ready' });
}
