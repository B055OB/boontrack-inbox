import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { metaWabaAdapter } from '@/services/waba';
import { ConversationEngine } from '@/lib/conversationEngine';

export const dynamic = 'force-dynamic';

/**
 * 1. Meta Webhook Challenge Verification (GET)
 * Memverifikasi webhook subscription handshake dari Meta Developer Platform.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    const expectedToken =
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
      process.env.META_WEBHOOK_VERIFY_TOKEN ||
      'boontrack_waba_webhook_verify_token';

    if (mode === 'subscribe' && token === expectedToken) {
      console.log('[WABA Webhook] Handshake challenge verified successfully.');
      return new NextResponse(challenge || '', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    console.warn('[WABA Webhook] Handshake verification rejected: token mismatch.');
    return new NextResponse('Forbidden: Token mismatch', { status: 403 });
  } catch (err: unknown) {
    console.error('[WABA Webhook GET Exception]:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

/**
 * 2. WABA Ingress Webhook Handler (POST)
 * Menegakkan Rule 1 (No Identity, No Tenant) & Rule 2 (No Ownership Chain, No Business Logic):
 * - Identitas tenant HANYA di-resolve dari tabel whatsapp_connections melalui phone_number_id eksak.
 * - Jika resource tidak terdaftar, bukan TENANT domain, atau tidak CONNECTED:
 *   Wajib melakukan SILENT DROP (HTTP 200, 0 AI call, 0 database mutation).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Ekstrak phone_number_id dari metadata payload WABA
    const rawPhoneId = body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    const phoneNumberId = rawPhoneId ? String(rawPhoneId).trim() : null;

    if (!phoneNumberId) {
      console.warn(
        '[SECURITY_WABA_INGRESS_DROP] Missing phone_number_id in webhook payload. Dropping immediately.'
      );
      return NextResponse.json({ status: 'ignored', reason: 'missing_phone_number_id' }, { status: 200 });
    }

    // Resolusikan otoritas koneksi dari Supabase Registry (whatsapp_connections)
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      console.error('[SECURITY_WABA_INGRESS_ERROR] Database client unreachable.');
      return NextResponse.json({ status: 'ignored', reason: 'db_unreachable' }, { status: 200 });
    }

    const { data: connection, error: connError } = await supabase
      .from('whatsapp_connections')
      .select('tenant_id, ownership_domain, status, credential_ref')
      .eq('phone_number_id', phoneNumberId)
      .eq('ownership_domain', 'TENANT')
      .eq('provider', 'META')
      .single();

    // Validasi Invariant Keamanan: Wajib TENANT domain & CONNECTED
    if (
      connError ||
      !connection ||
      connection.status !== 'CONNECTED' ||
      connection.ownership_domain !== 'TENANT' ||
      !connection.tenant_id
    ) {
      console.warn(
        `[SECURITY_WABA_UNMAPPED_RESOURCE] phone_number_id="${phoneNumberId}" is unmapped or inactive (status=${connection?.status || 'NOT_FOUND'}, domain=${connection?.ownership_domain || 'UNKNOWN'}). Dropping silently without AI call or DB mutation.`
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

      const senderName =
        contacts.find((c: any) => c.wa_id === msg.from)?.profile?.name || 'Pelanggan';

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
        // Teruskan payload bersama tenant_id terverifikasi ke alur pemrosesan percakapan/commerce internal
        const engineResult = await ConversationEngine.process({
          tenant_id: tenantId,
          channel: 'WHATSAPP',
          session_id: senderPhone,
          user_identifier: senderPhone,
          message: textContent,
          interactive_reply: interactiveReply,
          channel_type: 'WABA',
        });

        // Jika engine mengembalikan balasan dan kredensial tersedia, kirim via transport adapter
        if (engineResult?.reply && connection.credential_ref) {
          const resolvedToken =
            process.env[`META_TOKEN_${tenantId.toUpperCase()}`] ||
            process.env.META_WA_TOKEN ||
            process.env.WHATSAPP_API_TOKEN ||
            (connection.credential_ref.startsWith('ey') ? connection.credential_ref : '');

          if (resolvedToken) {
            await metaWabaAdapter.sendText(
              phoneNumberId,
              resolvedToken,
              senderPhone,
              engineResult.reply
            );
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
