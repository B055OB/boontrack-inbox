import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenant_id, conversation_id, text, agent_id, phone_number, idempotency_key } = body;

    const idempHeader = req.headers.get('Idempotency-Key') || req.headers.get('X-Idempotency-Key') || idempotency_key;

    if (!tenant_id || !conversation_id || !text) {
      return NextResponse.json(
        { success: false, detail: 'tenant_id, conversation_id, and text are required.' },
        { status: 400 }
      );
    }

    // Auto-Pause Zero-Friction: 30 menit jeda bot saat CS manual mengirim pesan via console
    try {
      const supabase = getSupabaseAdmin() || getSupabase();
      if (supabase) {
        const nowIso = new Date().toISOString();
        const pausedUntilIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();

        await supabase
          .from('conversations')
          .update({
            last_message: text,
            last_message_at: nowIso,
            bot_paused: true,
            is_paused: true,
            is_bot_paused: true,
            is_bot_active: false,
            paused_until: pausedUntilIso,
            pause_reason: 'cs_console_manual_reply',
            last_state_updated_by: 'cs_console_manual_reply',
            bot_mode: 'HUMAN_ACTIVE',
            updated_at: nowIso,
          })
          .eq('id', conversation_id);

        const cleanPhone = phone_number ? String(phone_number).replace(/\D/g, '') : '';
        if (cleanPhone) {
          await supabase.from('conversation_sessions').upsert(
            {
              tenant_id: tenant_id,
              session_id: `wa_${tenant_id}_${cleanPhone}`,
              channel: 'WHATSAPP',
              user_identifier: cleanPhone,
              current_state: 'HANDOVER_TO_HUMAN',
              is_paused: true,
              pause_reason: 'cs_console_manual_reply',
              paused_at: nowIso,
              paused_by: 'cs_console_manual_reply',
              paused_until: pausedUntilIso,
              metadata: {
                auto_pause: true,
                triggered_by: 'cs_console_manual_reply',
                paused_at: nowIso,
              },
              updated_at: nowIso,
            },
            { onConflict: 'tenant_id,user_identifier' }
          );
        }
      }
    } catch (pauseErr) {
      console.warn('[API /api/inbox/messages/send] Auto-pause sync note:', pauseErr);
    }

    const coreUrl =
      process.env.CORE_API_URL ||
      process.env.NEXT_PUBLIC_CORE_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://127.0.0.1:8000';

    const targetEndpoint = `${coreUrl.replace(/\/$/, '')}/api/v1/inbox/messages/send`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (idempHeader) {
      headers['Idempotency-Key'] = idempHeader;
    }

    const coreRes = await fetch(targetEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tenant_id,
        conversation_id,
        text,
        agent_id,
        phone_number,
        idempotency_key: idempHeader,
      }),
    });

    const data = await coreRes.json();
    return NextResponse.json(data, { status: coreRes.status });
  } catch (err: any) {
    console.error('[API /api/inbox/messages/send] Proxy error:', err);
    return NextResponse.json(
      { success: false, detail: err?.message || 'Gagal menghubungi service pengiriman pesan core.' },
      { status: 500 }
    );
  }
}
