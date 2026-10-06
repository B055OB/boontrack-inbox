import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { processEvolutionWebhookEvent } from '@/lib/whatsapp/evolution-webhook-handler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET: Health check endpoint for Evolution API instance webhook.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ instance: string }> }
) {
  const { instance } = await context.params;
  return NextResponse.json({
    status: 'ok',
    gateway: 'Evolution API v2',
    instance: decodeURIComponent(instance || ''),
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST: Inbound webhook message & event ingress for Evolution API instance.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ instance: string }> }
) {
  try {
    const { instance } = await context.params;
    const instanceName = decodeURIComponent(instance || '');
    const body = await req.json().catch(() => ({}));

    const result = await processEvolutionWebhookEvent(body, instanceName);
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[Evolution Webhook Route Exception]:', err);
    // Return HTTP 200 to prevent Evolution API infinite webhook retry loops
    return NextResponse.json({ status: 'ignored', error: msg }, { status: 200 });
  }
}
