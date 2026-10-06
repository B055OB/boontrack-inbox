import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { getOrSeedQuickReplies } from '@/lib/inbox/quick-replies';

export const dynamic = 'force-dynamic';

async function resolveTenant(tenantParam: string) {
  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) return null;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantParam);
  let query = supabase.from('tenants').select('id, slug, name');
  if (isUuid) {
    query = query.or(`id.eq.${tenantParam},slug.eq.${tenantParam}`);
  } else {
    query = query.or(`slug.eq.${tenantParam},id.eq.${tenantParam}`);
  }
  const { data } = await query.maybeSingle();
  return data || null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantParam = searchParams.get('tenant') || searchParams.get('tenantId') || searchParams.get('slug');

    if (!tenantParam) {
      return NextResponse.json({ success: false, error: 'tenant identifier is required', quick_replies: [] }, { status: 400 });
    }

    const tenant = await resolveTenant(tenantParam);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found', quick_replies: [] }, { status: 404 });
    }

    const quickReplies = await getOrSeedQuickReplies(tenant.id, tenant.slug, tenant.name);
    return NextResponse.json({ success: true, quick_replies: quickReplies });
  } catch (err: any) {
    console.error('[API /inbox/quick-replies GET Error]:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Server error', quick_replies: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const { tenant: tenantParam, shortcut: rawShortcut, title, content } = body;

    if (!tenantParam || !rawShortcut || !title || !content) {
      return NextResponse.json({ success: false, error: 'tenant, shortcut, title, and content are required' }, { status: 400 });
    }

    const tenant = await resolveTenant(tenantParam);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Format shortcut: ensure starts with '/' and clean
    let shortcut = String(rawShortcut).trim().toLowerCase();
    if (!shortcut.startsWith('/')) shortcut = `/${shortcut}`;
    shortcut = shortcut.replace(/[^\/a-z0-9_-]/g, '');

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('quick_replies')
      .upsert(
        {
          tenant_id: tenant.id,
          tenant_slug: tenant.slug,
          shortcut,
          title: String(title).trim(),
          content: String(content).trim(),
          updated_at: nowIso,
        },
        { onConflict: 'tenant_id,shortcut' }
      )
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, quick_reply: data });
  } catch (err: any) {
    console.error('[API /inbox/quick-replies POST Error]:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const { id, shortcut: rawShortcut, title, content } = body;

    if (!id || (!title && !content && !rawShortcut)) {
      return NextResponse.json({ success: false, error: 'id and at least one updated field required' }, { status: 400 });
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (title) updatePayload.title = String(title).trim();
    if (content) updatePayload.content = String(content).trim();
    if (rawShortcut) {
      let shortcut = String(rawShortcut).trim().toLowerCase();
      if (!shortcut.startsWith('/')) shortcut = `/${shortcut}`;
      updatePayload.shortcut = shortcut.replace(/[^\/a-z0-9_-]/g, '');
    }

    const { data, error } = await supabase
      .from('quick_replies')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, quick_reply: data });
  } catch (err: any) {
    console.error('[API /inbox/quick-replies PUT Error]:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const id = searchParams.get('id') || body?.id;

    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }

    const { error } = await supabase.from('quick_replies').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Deleted successfully' });
  } catch (err: any) {
    console.error('[API /inbox/quick-replies DELETE Error]:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}
