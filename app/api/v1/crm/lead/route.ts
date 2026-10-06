import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { ContactService } from '@/lib/crm/contact.service';
import { toE164 } from '@/lib/crm/phone-utils';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenant_slug, tenant_id, name, phone, email, intent, notes } = body;

    const identifier = tenant_slug || tenant_id;
    if (!identifier) {
      return NextResponse.json(
        { success: false, error: 'Tenant identifier is required' },
        { status: 400 }
      );
    }

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Nama wajib diisi' },
        { status: 400 }
      );
    }

    if (!phone || !phone.trim()) {
      return NextResponse.json(
        { success: false, error: 'Nomor WhatsApp wajib diisi' },
        { status: 400 }
      );
    }

    const canonicalPhone = toE164(phone);
    if (!canonicalPhone) {
      return NextResponse.json(
        { success: false, error: 'Format nomor WhatsApp tidak valid' },
        { status: 400 }
      );
    }

    const tenantUuid = await ContactService.resolveTenantId(identifier);
    if (!tenantUuid) {
      return NextResponse.json(
        { success: false, error: 'Tenant tidak ditemukan' },
        { status: 404 }
      );
    }

    const tags = ['Webchat Lead'];
    if (intent && intent.trim()) {
      tags.push(intent.trim());
    }

    const initialComplaint = notes || (intent ? `Kebutuhan Awal: ${intent}` : 'Lead masuk via Webchat Storefront');

    // 1. Create or update contact in CRM (Contacts SSOT)
    const contact = await ContactService.createOrUpdateFullContact({
      tenantId: tenantUuid,
      name: name.trim(),
      phone: canonicalPhone,
      email: email ? email.trim() : undefined,
      lifecycleStage: 'LEAD',
      tags,
      initialNotes: initialComplaint,
      metadata: {
        source: 'STOREFRONT_WEBCHAT',
        initial_intent: intent || null,
        captured_at: new Date().toISOString(),
      },
    });

    // 2. Ensure conversation entry exists so merchant sees this in Inbox
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data: existingConv } = await supabase
          .from('conversations')
          .select('id')
          .eq('tenant_id', tenantUuid)
          .eq('customer_phone', canonicalPhone)
          .maybeSingle();

        const now = new Date().toISOString();
        if (existingConv) {
          await supabase
            .from('conversations')
            .update({
              customer_name: name.trim(),
              last_message: `[Webchat] ${intent || 'Pengunjung memulai konsultasi'}`,
              last_message_at: now,
              updated_at: now,
            })
            .eq('id', existingConv.id);
        } else {
          await supabase
            .from('conversations')
            .insert({
              tenant_id: tenantUuid,
              customer_phone: canonicalPhone,
              customer_name: name.trim(),
              last_message: `[Webchat] ${intent || 'Pengunjung memulai konsultasi'}`,
              last_message_at: now,
              unread_count: 1,
              status: 'OPEN',
            });
        }
      } catch (convErr) {
        console.warn('[CRM Lead Route] Conversation sync note:', convErr);
      }
    }

    return NextResponse.json({
      success: true,
      contact,
      message: 'Lead berhasil dicatat ke CRM',
    });
  } catch (err: any) {
    console.error('[CRM Lead Route] Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
