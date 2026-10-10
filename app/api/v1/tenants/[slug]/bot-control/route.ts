import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { executeBotControl } from '@/lib/whatsapp/bot-control-service';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');
    const supabase = getSupabaseAdmin() || getSupabase();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database unreachable' }, { status: 500 });
    }

    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('id, slug, bot_paused, is_bot_active, metadata')
      .or(`slug.eq.${slug},id.eq.${slug}`)
      .maybeSingle();

    if (error || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const isPaused =
      tenant.bot_paused === true ||
      tenant.is_bot_active === false ||
      tenant.metadata?.bot_paused === true ||
      tenant.metadata?.is_bot_paused === true ||
      tenant.metadata?.is_bot_active === false;

    return NextResponse.json({
      success: true,
      slug: tenant.slug,
      tenant_id: tenant.id,
      bot_paused: isPaused,
      is_bot_active: !isPaused,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');
    const body = await req.json().catch(() => ({}));

    let action: 'PAUSE' | 'RESUME';
    if (body.action) {
      action = String(body.action).toUpperCase() === 'PAUSE' ? 'PAUSE' : 'RESUME';
    } else if (body.bot_paused !== undefined) {
      action = Boolean(body.bot_paused) ? 'PAUSE' : 'RESUME';
    } else if (body.is_bot_active !== undefined) {
      action = !Boolean(body.is_bot_active) ? 'PAUSE' : 'RESUME';
    } else {
      action = 'PAUSE';
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    const result = await executeBotControl({
      action,
      tenantId: slug,
      tenantSlug: slug,
      source: 'dashboard_toggle',
      supabase,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  return POST(req, context);
}
