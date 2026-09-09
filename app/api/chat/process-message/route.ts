import { NextRequest, NextResponse } from 'next/server';
import { ConversationEngine, ProcessMessagePayload } from '@/lib/conversationEngine';

export async function POST(req: NextRequest) {
  try {
    const body: ProcessMessagePayload = await req.json();

    if (!body.tenant_id || !body.channel || !body.session_id || !body.message) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters (tenant_id, channel, session_id, message)' },
        { status: 400 }
      );
    }

    const result = await ConversationEngine.process(body);

    // Kirim CAPI INITIATE_CHECKOUT jika state berpindah ke BOOKING_READY
    if (result.is_booking_ready) {
      // Background trigger: Server CAPI Dispatcher (Non-blocking)
      fetch(`${req.nextUrl.origin}/api/tracking/capi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: body.tenant_id,
          event_name: 'InitiateCheckout',
          user_data: { phone: body.user_identifier },
          custom_data: {
            currency: 'IDR',
            value: result.entities.price || 0,
            content_name: `Kuras Toren ${result.entities.capacity}L`
          }
        })
      }).catch((err) => console.warn('[CAPI Trigger Warning]:', err));
    }

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('[Process Message Error]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}