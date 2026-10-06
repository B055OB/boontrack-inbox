import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { processEvolutionWebhookEvent } from '@/lib/whatsapp/evolution-webhook-handler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const instance = searchParams.get('instance') || 'boontrack-gateway';
  return NextResponse.json({
    status: 'ok',
    gateway: 'Evolution API v2',
    instance,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const queryInstance = searchParams.get('instance') || undefined;
    const body = await req.json().catch(() => ({}));

    const result = await processEvolutionWebhookEvent(body, queryInstance);
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[Evolution Webhook Generic Route Exception]:', err);
    return NextResponse.json({ status: 'ignored', error: msg }, { status: 200 });
  }
}
