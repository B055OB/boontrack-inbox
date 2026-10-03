import { NextRequest, NextResponse } from 'next/server';
import {
  handleTelegramUpdate,
  getTelegramBotUsername,
} from '@/lib/telegram/boonpilot-telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/webhooks/telegram
 * Health check & webhook verification endpoint
 */
export async function GET() {
  const botUsername = getTelegramBotUsername();
  return NextResponse.json({
    status: 'active',
    channel: 'TELEGRAM',
    gateway: 'BoonPilot Official Telegram Gateway',
    bot_username: botUsername,
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/webhooks/telegram
 * Inbound Telegram Webhook Receiver
 */
export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    if (!update) {
      return NextResponse.json({ error: 'Empty update payload' }, { status: 400 });
    }

    const result = await handleTelegramUpdate(update);

    return NextResponse.json({
      status: result.handled ? 'processed' : 'ignored',
      result,
    });
  } catch (error: any) {
    console.error('[TELEGRAM WEBHOOK ERROR]:', error);
    // Always return 200 OK to acknowledge Telegram webhook and prevent endless retries
    return NextResponse.json(
      { status: 'error_caught', message: error.message },
      { status: 200 }
    );
  }
}
