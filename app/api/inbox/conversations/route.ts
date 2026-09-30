import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantParam = searchParams.get('tenant') || searchParams.get('tenantId') || searchParams.get('slug');

    if (!tenantParam) {
      return NextResponse.json({ success: false, error: 'tenant identifier is required', conversations: [] }, { status: 400 });
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database client unavailable', conversations: [] }, { status: 500 });
    }

    // Resolve tenant UUID and slug
    let tenantUuid: string | null = null;
    let tenantSlug: string | null = null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantParam);

    try {
      let query = supabase.from('tenants').select('id, slug');
      if (isUuid) {
        query = query.or(`id.eq.${tenantParam},slug.eq.${tenantParam}`);
      } else {
        query = query.or(`slug.eq.${tenantParam},id.eq.${tenantParam}`);
      }
      const { data } = await query.maybeSingle();
      if (data) {
        tenantUuid = data.id;
        tenantSlug = data.slug;
      }
    } catch (e) {
      console.debug('[API /inbox/conversations] Resolve note:', e);
    }

    const orTokens = new Set<string>();
    if (tenantUuid) orTokens.add(`tenant_id.eq.${tenantUuid}`);
    if (tenantSlug) {
      orTokens.add(`tenant_slug.eq.${tenantSlug}`);
      orTokens.add(`tenant_id.eq.${tenantSlug}`);
    }
    orTokens.add(`tenant_id.eq.${tenantParam}`);
    orTokens.add(`tenant_slug.eq.${tenantParam}`);

    const orClause = Array.from(orTokens).join(',');
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*')
      .or(orClause)
      .order('last_message_at', { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ success: false, error: error.message, conversations: [] }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      conversations: conversations || [],
      count: conversations?.length || 0,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Server error', conversations: [] }, { status: 500 });
  }
}
