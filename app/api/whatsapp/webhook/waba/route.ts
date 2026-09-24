import { NextResponse } from 'next/server';
import {
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
  parseMetaWebhookPayload,
  processNormalizedMetaEvent,
} from '@/lib/whatsapp/meta-webhook-normalizer';

export { verifyMetaWebhookSignature };

export const dynamic = 'force-dynamic';

/**
 * 1. Meta Webhook Challenge Verification (GET)
 * Murni memvalidasi `hub.mode === 'subscribe'` dan `hub.verify_token`, lalu return challenge.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const result = verifyMetaWebhookChallenge(searchParams);

    if (result.isValid) {
      console.log('[WABA Webhook] Handshake challenge verified successfully.');
      return new Response(result.challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    console.warn('[WABA Webhook] Handshake verification rejected: token mismatch.');
    return new Response(result.error || 'Forbidden: Token mismatch', { status: 403 });
  } catch (err: unknown) {
    console.error('[WABA Webhook GET Exception]:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * 2. WABA Ingress Webhook Handler (POST)
 * Pipeline:
 * 1. Signature Check (HMAC-SHA256) -> Reject 401 jika invalid / mismatch.
 * 2. Payload Extraction & Normalization.
 * 3. Phone Resolver -> phone_number_id diekstrak dari metadata.
 * 4. Ownership Validation -> domain TENANT, status != REVOKED.
 * 5. Conversation Engine & Ingress Processing.
 */
export async function POST(req: Request) {
  try {
    // 1. Baca raw text body request
    const rawBody = await req.text();
    const signatureHeader = req.headers.get('x-hub-signature-256');
    const appSecret = process.env.META_APP_SECRET;

    // 2. Meta Webhook Signature Verification (HMAC-SHA256)
    if (appSecret || signatureHeader) {
      const isValid = verifyMetaWebhookSignature(rawBody, signatureHeader, appSecret);
      if (!isValid) {
        console.warn('[SECURITY_WABA_SIGNATURE_REJECTED] Invalid or missing HMAC signature. Blocking ingress.');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // 3. Payload Extraction
    let body: any = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ status: 'ignored', reason: 'invalid_json' }, { status: 200 });
    }

    // 4. Inbound Event Normalizer
    const normalizedEvent = parseMetaWebhookPayload(body);

    if (!normalizedEvent.phoneNumberId) {
      console.warn(
        '[SECURITY_WABA_INGRESS_DROP] Missing phone_number_id in webhook payload. Dropping immediately.'
      );
      return NextResponse.json({ status: 'ignored', reason: 'missing_phone_number_id' }, { status: 200 });
    }

    // 5. Ingress Resolver & Dispatcher via Normalized Processor
    const report = await processNormalizedMetaEvent(normalizedEvent);

    return NextResponse.json(report, { status: 200 });
  } catch (err: unknown) {
    console.error('[WABA Webhook POST Exception]:', err);
    // Return 200 agar Meta tidak melakukan re-delivery loop tak terbatas pada error payload
    return NextResponse.json({ status: 'ignored', error: 'Internal processing note' }, { status: 200 });
  }
}
