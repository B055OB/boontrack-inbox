import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { metaWabaAdapter } from '@/services/waba';
import { ConversationEngine } from '@/lib/conversationEngine';

export const dynamic = 'force-dynamic';

/**
 * Helper: Meta Webhook HMAC-SHA256 Signature Verification.
 * Returns true if valid or if secret is not configured in non-production.
 * Returns false if header is missing, malformed, or mismatch.
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret?: string
): boolean {
  const secret = appSecret || process.env.META_APP_SECRET;
  if (!secret) {
    // Jika tidak ada secret dan tidak ada signature header, bypass hanya di non-prod
    return !signatureHeader;
  }

  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expectedSignature =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const actualBuf = Buffer.from(signatureHeader, 'utf8');

  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * 1. Meta Webhook Challenge Verification (GET)
 * Murni memvalidasi `hub.mode === 'subscribe'` dan `hub.verify_token`, lalu return challenge.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    const expectedToken =
      process.env.META_VERIFY_TOKEN ||
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
      process.env.META_WEBHOOK_VERIFY_TOKEN ||
      'boontrack_waba_webhook_verify_token';

    if (mode === 'subscribe' && token === expectedToken) {
      console.log('[WABA Webhook] Handshake challenge verified successfully.');
      return new Response(challenge || '', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    console.warn('[WABA Webhook] Handshake verification rejected: token mismatch.');
    return new Response('Forbidden: Token mismatch', { status: 403 });
  } catch (err: unknown) {
    console.error('[WABA Webhook GET Exception]:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * 2. WABA Ingress Webhook Handler (POST)
 * Pipeline:
 * 1. Signature Check (HMAC-SHA256) -> Reject 401 jika invalid / mismatch.
 * 2. Payload Extraction -> Raw body text diparse ke JSON.
 * 3. Phone Resolver -> phone_number_id diekstrak dari metadata.
 * 4. Ownership Validation -> domain TENANT, status != REVOKED (Operational state hanya divalidasi pada OUTBOUND).
 * 5. Conversation Engine -> Teruskan ke internal commerce/conversation engine.
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

    // Ekstrak phone_number_id dari metadata payload WABA
    const rawPhoneId = body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    const phoneNumberId = rawPhoneId ? String(rawPhoneId).trim() : null;

    if (!phoneNumberId) {
      console.warn(
        '[SECURITY_WABA_INGRESS_DROP] Missing phone_number_id in webhook payload. Dropping immediately.'
      );
      return NextResponse.json({ status: 'ignored', reason: 'missing_phone_number_id' }, { status: 200 });
    }

    // 4. Ingress Resolver: Query Supabase whatsapp_connections
    // Pisahkan Ownership State (TENANT, bukan REVOKED) vs Operational State (CONNECTED).
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      console.error('[SECURITY_WABA_INGRESS_ERROR] Database client unreachable.');
      return NextResponse.json({ status: 'ignored', reason: 'db_unreachable' }, { status: 200 });
    }

    const { data: connection, error: connError } = await supabase
      .from('whatsapp_connections')
      .select('tenant_id, ownership_domain, status, credential_ref, phone_number_id')
      .eq('phone_number_id', phoneNumberId)
      .eq('ownership_domain', 'TENANT')
      .eq('provider', 'META')
      .single();

    // Validasi Syarat Kepemilikan (Ownership State):
    // Record wajib ada, domain TENANT, tenant_id ada, dan status BUKAN REVOKED.
    if (
      connError ||
      !connection ||
      connection.ownership_domain !== 'TENANT' ||
      !connection.tenant_id ||
      connection.status === 'REVOKED'
    ) {
      console.warn(
        `[SECURITY_WABA_UNMAPPED_RESOURCE] phone_number_id="${phoneNumberId}" is unmapped or revoked (status=${connection?.status || 'NOT_FOUND'}, domain=${connection?.ownership_domain || 'UNKNOWN'}). Dropping silently without AI call or DB mutation.`
      );
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    const tenantId = String(connection.tenant_id).trim().toLowerCase();

    // Ekstraksi pesan dari payload
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const messages = Array.isArray(value?.messages) ? value.messages : [];
    const contacts = Array.isArray(value?.contacts) ? value.contacts : [];

    // Jika ini adalah event non-pesan (misal delivery receipt, read status):
    if (messages.length === 0) {
      return NextResponse.json(
        { status: 'processed', tenant_id: tenantId, messages_count: 0 },
        { status: 200 }
      );
    }

    let processedCount = 0;

    for (const msg of messages) {
      const senderPhone = String(msg.from || '').replace(/\D/g, '');
      if (!senderPhone) continue;

      let textContent = '';
      let interactiveReply: any = undefined;

      if (msg.type === 'text' && msg.text?.body) {
        textContent = String(msg.text.body).trim();
      } else if (msg.type === 'interactive') {
        if (msg.interactive?.type === 'button_reply') {
          textContent =
            msg.interactive.button_reply?.title || msg.interactive.button_reply?.id || '';
          interactiveReply = msg.interactive.button_reply;
        } else if (msg.interactive?.type === 'list_reply') {
          textContent =
            msg.interactive.list_reply?.title || msg.interactive.list_reply?.id || '';
          interactiveReply = msg.interactive.list_reply;
        }
      } else if (msg.type === 'image') {
        textContent = msg.image?.caption || '[Gambar dikirim pembeli]';
      } else {
        textContent = `[Pesan ${msg.type || 'media'}]`;
      }

      if (!textContent) continue;

      try {
        // Teruskan payload bersama tenant_id terverifikasi ke internal ConversationEngine
        const engineResult = await ConversationEngine.process({
          tenant_id: tenantId,
          channel: 'WHATSAPP',
          session_id: senderPhone,
          user_identifier: senderPhone,
          message: textContent,
          interactive_reply: interactiveReply,
          channel_type: 'WABA',
        });

        // 5. Outbound Dispatch: Penegakan State Operasional (CONNECTED)
        // State operasional HANYA divalidasi pada saat OUTBOUND (pengiriman pesan), bukan saat INBOUND ingress.
        if (engineResult?.reply && connection.credential_ref) {
          if (connection.status !== 'CONNECTED') {
            console.warn(
              `[SECURITY_WABA_OUTBOUND_SUPPRESSED] Operational state is '${connection.status}' (not CONNECTED). Inbound accepted for tenant=${tenantId}, but outbound reply suppressed.`
            );
          } else {
            const resolvedToken =
              process.env[`META_TOKEN_${tenantId.toUpperCase()}`] ||
              process.env.META_WA_TOKEN ||
              process.env.WHATSAPP_API_TOKEN ||
              (connection.credential_ref.startsWith('ey') ? connection.credential_ref : '');

            if (resolvedToken) {
              await metaWabaAdapter.dispatchTenantMessage(
                tenantId,
                connection,
                senderPhone,
                {
                  type: 'text',
                  text: { preview_url: false, body: engineResult.reply },
                },
                resolvedToken,
                connection.credential_ref
              );
            }
          }
        }

        processedCount++;
      } catch (procErr) {
        console.error(
          `[WABA Ingress Error] Failed processing message for tenant=${tenantId}:`,
          procErr
        );
      }
    }

    return NextResponse.json(
      {
        status: 'processed',
        tenant_id: tenantId,
        processed_messages: processedCount,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error('[WABA Webhook POST Exception]:', err);
    // Return 200 agar Meta tidak melakukan re-delivery loop tak terbatas pada error payload
    return NextResponse.json({ status: 'ignored', error: 'Internal processing note' }, { status: 200 });
  }
}
