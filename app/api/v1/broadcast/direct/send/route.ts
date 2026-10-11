import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { sendEvolutionTextMessage } from '@/lib/whatsapp/evolution-webhook-handler';

export const dynamic = 'force-dynamic';

interface BroadcastRecipient {
  name: string;
  phone: string;
  message: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenant_slug, campaign_title, recipients, anti_ban_delay } = body;

    const cleanSlug = String(tenant_slug || '').trim().toLowerCase();
    if (!cleanSlug) {
      return NextResponse.json(
        { success: false, error: 'Parameter tenant_slug wajib diisi' },
        { status: 400 }
      );
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Daftar penerima broadcast tidak boleh kosong' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database service client tidak tersedia' },
        { status: 500 }
      );
    }

    // 1. Validasi status koneksi WhatsApp riil tenant di database
    const { data: conn } = await supabase
      .from('whatsapp_connections')
      .select('instance_name, status, is_connected, credential_ref')
      .or(	enant_slug.eq.,tenant_id.eq.)
      .in('status', ['open', 'connected', 'ACTIVE', 'CONNECTED'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conn?.instance_name) {
      return NextResponse.json(
        {
          success: false,
          error: 'WhatsApp Gateway Belum Terhubung. Silakan hubungkan WhatsApp terlebih dahulu di tab WhatsApp.',
        },
        { status: 400 }
      );
    }

    const instanceName = conn.instance_name;
    const credentialRef = conn.credential_ref;
    const delaySeconds = Math.max(1, Math.min(10, Number(anti_ban_delay) || 3));

    // 2. Catat event broadcast ke lifecycle_events
    const broadcastId = cast_;
    await supabase.from('lifecycle_events').insert({
      tenant_id: cleanSlug,
      customer_phone: 'BROADCAST_ALL',
      event_type: 'WHATSAPP_BROADCAST_DISPATCH',
      payload: {
        broadcast_id: broadcastId,
        campaign_title: campaign_title || 'WhatsApp Broadcast',
        total_recipients: recipients.length,
        instance_name: instanceName,
      },
      status: 'PROCESSING',
      scheduled_at: new Date().toISOString(),
      metadata: {
        broadcast_id: broadcastId,
        delay_seconds: delaySeconds,
      },
    });

    let sentSuccess = 0;
    let sentFailed = 0;
    const logs: string[] = [];

    // 3. Eksekusi pengiriman pesan riil ke tiap kontak
    for (let i = 0; i < recipients.length; i++) {
      const item: BroadcastRecipient = recipients[i];
      if (!item.phone || !item.message) {
        sentFailed++;
        continue;
      }

      try {
        const ok = await sendEvolutionTextMessage(
          instanceName,
          item.phone,
          item.message,
          credentialRef,
          cleanSlug
        );

        const ts = new Date().toLocaleTimeString('id-ID');
        if (ok) {
          sentSuccess++;
          logs.push([] Terkirim ke  (+));
        } else {
          sentFailed++;
          logs.push([] Gagal kirim ke  (+));
        }
      } catch (err: any) {
        sentFailed++;
        const ts = new Date().toLocaleTimeString('id-ID');
        logs.push([] Error kirim ke : );
      }

      // Terapkan jeda anti-ban delay antar pengiriman
      if (i < recipients.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
      }
    }

    // 4. Update lifecycle_events status
    await supabase.from('lifecycle_events').insert({
      tenant_id: cleanSlug,
      customer_phone: 'BROADCAST_ALL',
      event_type: 'WHATSAPP_BROADCAST_COMPLETED',
      payload: {
        broadcast_id: broadcastId,
        campaign_title: campaign_title || 'WhatsApp Broadcast',
        sent_success: sentSuccess,
        sent_failed: sentFailed,
        total_recipients: recipients.length,
      },
      status: 'PROCESSED',
      processed_at: new Date().toISOString(),
      metadata: {
        broadcast_id: broadcastId,
      },
    });

    return NextResponse.json({
      success: true,
      broadcast_id: broadcastId,
      total_target: recipients.length,
      sent_success: sentSuccess,
      sent_failed: sentFailed,
      logs: logs.slice(-20),
    });
  } catch (err: any) {
    console.error('[Direct Broadcast API] Error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error saat broadcast' },
      { status: 500 }
    );
  }
}