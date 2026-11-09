import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DodoPaymentsAdapter } from '@/packages/workforce-billing/orchestrator/dodo-adapter';
import { getSupabaseAdmin } from '@/workforce-web/lib/supabase';

const dodoAdapter = new DodoPaymentsAdapter({
  webhookSecret: process.env.DODO_WEBHOOK_SECRET_SANDBOX || process.env.DODO_WEBHOOK_SECRET || 'dodo_sandbox_webhook_secret_key_2026',
  maxClockDriftSeconds: 300,
});

export async function POST(req: NextRequest) {
  try {
    // 1. Read Raw Request Body (Mandatory for HMAC signature verification)
    const rawBody = await req.text();

    // 2. Extract Headers
    const headersRecord: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headersRecord[key.toLowerCase()] = value;
    });

    // 3. Cryptographic Signature Verification & Replay Protection
    const isSignatureValid = dodoAdapter.verifySignature(rawBody, headersRecord);
    if (!isSignatureValid) {
      console.warn('[DODO WEBHOOK] Invalid HMAC signature or clock drift exceeded.');
      return NextResponse.json(
        { success: false, error: 'INVALID_SIGNATURE', message: 'HMAC signature verification failed.' },
        { status: 401 }
      );
    }

    // 4. Parse Normalized Webhook Event
    const event = dodoAdapter.parseWebhook(rawBody, headersRecord);
    const supabaseAdmin = getSupabaseAdmin();

    // 5. Enforce Webhook Idempotency via Webhook Inbox
    const { data: existingEvent } = await supabaseAdmin
      .schema('workforce_staging')
      .from('workforce_webhook_inbox')
      .select('id, status')
      .eq('provider', 'DODO_PAYMENTS')
      .eq('event_id', event.eventId)
      .maybeSingle();

    if (existingEvent && existingEvent.status === 'PROCESSED') {
      return NextResponse.json(
        {
          success: true,
          message: 'EVENT_ALREADY_PROCESSED',
          eventId: event.eventId,
        },
        { status: 200 }
      );
    }

    // Record incoming webhook in inbox
    try {
      await supabaseAdmin
        .schema('workforce_staging')
        .from('workforce_webhook_inbox')
        .upsert({
          provider: 'DODO_PAYMENTS',
          event_id: event.eventId,
          event_type: event.eventType,
          payload: event.rawPayload,
          status: 'PROCESSING',
          received_at: new Date().toISOString(),
        });
    } catch {
      // Inbox persistence catch
    }

    // 6. Handle Payment Settlement
    if (event.status === 'SUCCEEDED') {
      const internalRef = event.internalPaymentRef;

      // Update payment registry status to SETTLED
      try {
        await supabaseAdmin
          .schema('workforce_staging')
          .from('workforce_payment_registry')
          .update({
            status: 'SETTLED',
            authoritative_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('internal_order_id', internalRef);
      } catch {
        // Registry update catch
      }

      // Mark webhook inbox as PROCESSED
      try {
        await supabaseAdmin
          .schema('workforce_staging')
          .from('workforce_webhook_inbox')
          .update({
            status: 'PROCESSED',
            processed_at: new Date().toISOString(),
          })
          .eq('event_id', event.eventId);
      } catch {
        // Inbox update catch
      }
    }

    return NextResponse.json(
      {
        received: true,
        eventId: event.eventId,
        status: event.status,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[DODO WEBHOOK ERROR]', err);
    return NextResponse.json(
      { success: false, error: 'WEBHOOK_PROCESSING_FAILED', message: err.message },
      { status: 400 }
    );
  }
}
