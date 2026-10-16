import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantParam = searchParams.get('tenant') || searchParams.get('tenantId') || searchParams.get('slug');

    if (!tenantParam || !tenantParam.trim()) {
      return NextResponse.json(
        { success: false, error: 'TENANT_IDENTIFIER_REQUIRED', message: 'Parameter tenant wajib diisi.', conversations: [], count: 0 },
        { status: 400 }
      );
    }

    const cleanTenantParam = tenantParam.trim();
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'DATABASE_UNAVAILABLE', message: 'Database client tidak tersedia.', conversations: [], count: 0 },
        { status: 503 }
      );
    }

    // Fail-Closed Tenant Resolution (§0.14 & §47.3)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanTenantParam);
    let query = supabase.from('tenants').select('id, slug');
    if (isUuid) {
      query = query.eq('id', cleanTenantParam);
    } else {
      query = query.eq('slug', cleanTenantParam.toLowerCase());
    }

    const { data: tenantRow, error: tenantErr } = await query.maybeSingle();

    if (tenantErr) {
      console.error('[API /inbox/conversations] Tenant resolution error:', tenantErr);
      return NextResponse.json(
        { success: false, error: 'TENANT_LOOKUP_FAILED', message: tenantErr.message, conversations: [], count: 0 },
        { status: 503 }
      );
    }

    if (!tenantRow) {
      return NextResponse.json(
        { success: false, error: 'TENANT_NOT_FOUND', message: `Tenant tidak ditemukan untuk: ${cleanTenantParam}`, conversations: [], count: 0 },
        { status: 404 }
      );
    }

    const tenantUuid = String(tenantRow.id || '');
    const tenantSlug = String(tenantRow.slug || '');

    // Strictly Scoped Query: only use validated UUID and slug, never raw unvalidated input
    const orTokens: string[] = [];
    if (tenantUuid) orTokens.push(`tenant_id.eq.${tenantUuid}`);
    if (tenantSlug) orTokens.push(`tenant_slug.eq.${tenantSlug}`);

    const orClause = orTokens.join(',');
    const { data: conversations, error: convErr } = await supabase
      .from('conversations')
      .select('*')
      .or(orClause)
      .order('last_message_at', { ascending: false })
      .limit(200);

    if (convErr) {
      console.error('[API /inbox/conversations] Error fetching conversations:', convErr);
      return NextResponse.json(
        { success: false, error: 'CONVERSATIONS_LOOKUP_FAILED', message: convErr.message, conversations: [], count: 0 },
        { status: 503 }
      );
    }

    // Defensive DTO Mapper: ensure status, bot_status, customer_name, customer_phone are never undefined
    const normalizedConversations = (conversations || []).map((c: any) => {
      const isPaused = Boolean(c.bot_paused || c.is_paused);
      const rawBotStatus = c.bot_status || (isPaused ? 'paused' : (c.bot_mode || 'active'));
      const botStatus = String(rawBotStatus ?? 'active').trim().toLowerCase();
      const status = String(c.status ?? 'open').trim().toLowerCase();
      const customerName = String(c.customer_name ?? 'Pelanggan').trim();
      const customerPhone = String(c.customer_phone ?? '').trim();

      return {
        ...c,
        id: String(c.id ?? ''),
        tenant_id: String(c.tenant_id ?? tenantUuid),
        tenant_slug: String(c.tenant_slug ?? tenantSlug),
        customer_name: customerName,
        customer_phone: customerPhone,
        status,
        bot_status: botStatus,
        bot_mode: String(c.bot_mode ?? 'auto').trim(),
        bot_paused: isPaused,
        unread_count: Number(c.unread_count ?? 0) || 0,
      };
    });

    return NextResponse.json({
      success: true,
      conversations: normalizedConversations,
      count: normalizedConversations.length,
    });
  } catch (err: any) {
    console.error('[API /inbox/conversations] Unexpected error:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_SERVER_ERROR', message: err?.message || 'Server error', conversations: [], count: 0 },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { conversationId, customerPhone, customerName, tenantSlug, tenantId } = body;

    if (!customerName || !customerName.trim()) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'Nama pelanggan tidak boleh kosong.' },
        { status: 400 }
      );
    }

    const trimmedName = customerName.trim();
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'DATABASE_UNAVAILABLE', message: 'Database client tidak tersedia.' },
        { status: 503 }
      );
    }

    const now = new Date().toISOString();

    // 1. Update conversations table
    if (conversationId) {
      await supabase
        .from('conversations')
        .update({
          customer_name: trimmedName,
          updated_at: now,
        })
        .eq('id', conversationId);
    } else if (customerPhone) {
      await supabase
        .from('conversations')
        .update({
          customer_name: trimmedName,
          updated_at: now,
        })
        .eq('customer_phone', customerPhone);
    }

    // 2. Update CRM Contacts table (SSOT)
    const targetTenant = tenantId || tenantSlug;
    if (targetTenant && customerPhone) {
      try {
        const { ContactService } = await import('@/lib/crm/contact.service');
        const { toE164 } = await import('@/lib/crm/phone-utils');
        const tenantUuid = await ContactService.resolveTenantId(targetTenant);
        const canonicalPhone = toE164(customerPhone);
        if (tenantUuid && canonicalPhone) {
          await ContactService.getOrCreateContactByPhone(tenantUuid, canonicalPhone, trimmedName);
          await supabase
            .from('contacts')
            .update({
              name: trimmedName,
              updated_at: now,
            })
            .eq('tenant_id', tenantUuid)
            .eq('phone_e164', canonicalPhone);
        }
      } catch (crmErr) {
        console.warn('[PATCH /inbox/conversations] CRM contact update note:', crmErr);
      }
    }

    return NextResponse.json({
      success: true,
      name: trimmedName,
    });
  } catch (err: any) {
    console.error('[PATCH /inbox/conversations] Unexpected error:', err);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_SERVER_ERROR', message: err?.message || 'Server error' },
      { status: 500 }
    );
  }
}


