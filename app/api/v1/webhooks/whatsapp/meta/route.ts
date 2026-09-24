/**
 * app/api/v1/webhooks/whatsapp/meta/route.ts
 * Canonical Meta Cloud API Webhook Ingress Route for BoonTrack Inbox.
 *
 * GET: Handshake verification challenge (hub.mode, hub.verify_token, hub.challenge).
 * POST: Inbound message & delivery status processor with HMAC-SHA256 signature security.
 */

import { NextResponse } from 'next/server';
import {
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
  parseMetaWebhookPayload,
  processNormalizedMetaEvent,
} from '@/lib/whatsapp/meta-webhook-normalizer';

export const dynamic = 'force-dynamic';

/**
 * 1. Meta Webhook Handshake Verification (GET)
 * Validates hub.mode === 'subscribe' and hub.verify_token against configured secrets,
 * returning the hub.challenge string with HTTP 200.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const result = verifyMetaWebhookChallenge(searchParams);

    if (result.isValid) {
      console.log('[Meta Webhook v1] Handshake challenge verified successfully.');
      return new Response(result.challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    console.warn('[Meta Webhook v1] Handshake verification rejected: token mismatch.');
    return new Response(result.error || 'Forbidden: Token mismatch', { status: 403 });
  } catch (err: unknown) {
    console.error('[Meta Webhook v1 GET Exception]:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * 2. Inbound Message & Event Ingress (POST)
 * Pipeline:
 * 1. Signature Check (HMAC-SHA256) -> Reject 401 if invalid/mismatch.
 * 2. Parse & Normalize Payload -> Converts Meta format to internal message & status schemas.
 * 3. Ingest & Dispatch -> Resolves tenant ownership, logs messages/statuses, routes to ConversationEngine.
 */
export async function POST(req: Request) {
  try {
    // 1. Read raw body & verify HMAC signature
    const rawBody = await req.text();
    const signatureHeader = req.headers.get('x-hub-signature-256');
    const appSecret = process.env.META_APP_SECRET;

    if (appSecret || signatureHeader) {
      const isValid = verifyMetaWebhookSignature(rawBody, signatureHeader, appSecret);
      if (!isValid) {
        console.warn('[SECURITY_WABA_SIGNATURE_REJECTED] Invalid HMAC signature. Ingress blocked.');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // 2. Parse JSON
    let body: any = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ status: 'ignored', reason: 'invalid_json' }, { status: 200 });
    }

    // 3. Normalize Meta Cloud API payload
    const normalizedEvent = parseMetaWebhookPayload(body);

    if (!normalizedEvent.phoneNumberId) {
      console.warn('[SECURITY_WABA_INGRESS_DROP] Missing phone_number_id in webhook payload. Dropping.');
      return NextResponse.json(
        { status: 'ignored', reason: 'missing_phone_number_id' },
        { status: 200 }
      );
    }

    // 4. Ingest and route to conversation pipeline
    const report = await processNormalizedMetaEvent(normalizedEvent);

    return NextResponse.json(report, { status: 200 });
  } catch (err: unknown) {
    console.error('[Meta Webhook v1 POST Exception]:', err);
    // Return HTTP 200 to prevent Meta webhook retry storms on unhandled errors
    return NextResponse.json(
      { status: 'ignored', error: 'Internal processing note' },
      { status: 200 }
    );
  }
}
