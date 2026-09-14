import { NextRequest, NextResponse } from 'next/server';
import { ConversationEngine, ProcessMessagePayload } from '@/lib/conversationEngine';
import { processFunnelBookingMessage } from '@/lib/booking-extraction-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body: ProcessMessagePayload = await req.json();

    if (!body.tenant_id || !body.channel || !body.session_id || !body.message) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters (tenant_id, channel, session_id, message)' },
        { status: 400 }
      );
    }

    // Intercept with auto-extraction funnel if tenant has interactive funnel configured
    const funnelRes = await processFunnelBookingMessage({
      tenantSlug: body.tenant_id,
      senderPhone: body.user_identifier || body.session_id,
      message: body.message,
      interactiveReply: body.interactive_reply,
    });

    if (funnelRes.isHandled && funnelRes.replyText) {
      if (funnelRes.isBookingCreated) {
        fetch(`${req.nextUrl.origin}/api/tracking/capi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_slug: body.tenant_id,
            event_name: 'InitiateCheckout',
            user_data: { phone: body.user_identifier || body.session_id },
            custom_data: {
              currency: 'IDR',
              value: funnelRes.bookingData?.total_price || 0,
              content_name: funnelRes.bookingData?.service_item || 'Jasa Kuras Toren',
            },
          }),
        }).catch((err) => console.warn('[CAPI Trigger Warning]:', err));
      }

      return NextResponse.json({
        success: true,
        data: {
          reply: funnelRes.replyText,
          next_state: funnelRes.isBookingCreated ? 'COMPLETED' : 'FUNNEL_STEP',
          state_trace: ['FUNNEL_CLOSING_STEP'],
          entities: funnelRes.bookingData || {},
          is_booking_ready: !!funnelRes.isBookingCreated,
        },
      });
    }

    const result = await ConversationEngine.process(body);

    // Kirim CAPI INITIATE_CHECKOUT jika state berpindah ke BOOKING_READY
    if (result.is_booking_ready) {
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
            content_name: result.entities.service_name || result.entities.product_name || result.entities.item_name || (result.entities.capacity ? `Layanan ${result.entities.capacity}L` : 'Layanan / Produk')
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