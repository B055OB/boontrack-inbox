import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { executeBotControl, isAuthorizedBotController } from '@/lib/whatsapp/bot-control-service';

export const dynamic = 'force-dynamic';

/**
 * Verifies whether the request is explicitly authorized to view or mutate tenant bot status.
 *
 * Authorization is GRANTED if:
 * 1. Admin/Service API credentials (Bearer SUPABASE_SERVICE_ROLE_KEY, x-internal-secret, or EVOLUTION_API_KEY).
 * 2. Active Merchant Session Cookie (merchant_store, merchant_session, bt_tenant) matching target tenant.
 * 3. Verified Phone Number (from body, headers, or query) that is an Admin, Owner, or in the allowlist
 *    via isAuthorizedBotController().
 *
 * If none of these match, authorization is DENIED (fail-closed).
 */
async function verifyBotControlAuthorization(
  req: NextRequest,
  tenant: {
    id: string;
    slug: string;
    phone?: string | null;
    whatsapp_number?: string | null;
    metadata?: any;
  },
  supabase: any,
  providedPhone?: string | null
): Promise<{ authorized: boolean; error?: string; status?: number }> {
  // 1. Service / Admin Secret Header Check
  const authHeader = req.headers.get('authorization')?.trim();
  const internalSecret = req.headers.get('x-internal-secret')?.trim();
  const adminKey = req.headers.get('x-admin-key')?.trim();
  const apiKeyHeader = req.headers.get('apikey')?.trim();

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const envInternalSecret = process.env.INTERNAL_API_SECRET?.trim();
  const evoKey = process.env.EVOLUTION_API_KEY?.trim();

  if (
    (envInternalSecret && internalSecret === envInternalSecret) ||
    (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`) ||
    (evoKey && (adminKey === evoKey || apiKeyHeader === evoKey))
  ) {
    return { authorized: true };
  }

  // 2. Merchant Dashboard Session Cookie Check
  const cleanCookie = (val?: string) => {
    if (!val) return '';
    try {
      return decodeURIComponent(val).replace(/^["']|["']$/g, '').toLowerCase().trim();
    } catch {
      return val.toLowerCase().trim();
    }
  };

  const cookieStore =
    cleanCookie(req.cookies.get('merchant_store')?.value) ||
    cleanCookie(req.cookies.get('merchant_session')?.value) ||
    cleanCookie(req.cookies.get('bt_tenant')?.value);

  const normalizedTargetSlug = (tenant.slug || '').toLowerCase().trim();
  const normalizedTargetId = (tenant.id || '').toLowerCase().trim();

  if (cookieStore && (cookieStore === normalizedTargetSlug || cookieStore === normalizedTargetId)) {
    return { authorized: true };
  }

  // 3. Sender Phone Authorization Check (Admin/Owner or in Allowlist)
  const candidatePhone =
    providedPhone?.trim() ||
    req.headers.get('x-sender-phone')?.trim() ||
    req.headers.get('x-phone')?.trim() ||
    req.headers.get('x-sender')?.trim() ||
    req.nextUrl.searchParams.get('phone')?.trim() ||
    req.nextUrl.searchParams.get('sender_phone')?.trim();

  if (candidatePhone) {
    const isAuthorized = await isAuthorizedBotController({
      senderPhone: candidatePhone,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      supabase,
    });

    if (isAuthorized) {
      return { authorized: true };
    }

    return {
      authorized: false,
      status: 403,
      error: 'Forbidden: Nomor telepon tidak memiliki otorisasi admin/owner atau tidak terdaftar dalam allowlist.',
    };
  }

  // Fail-closed default:
  return {
    authorized: false,
    status: 401,
    error: 'Unauthorized: Sesi login merchant atau otorisasi admin/owner/allowlist diperlukan.',
  };
}

export async function GET(
  req: NextRequest,
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
      .select('id, slug, phone, whatsapp_number, bot_paused, is_bot_active, metadata')
      .or(`slug.eq.${slug},id.eq.${slug}`)
      .maybeSingle();

    if (error || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Explicit Authorization Check
    const auth = await verifyBotControlAuthorization(req, tenant, supabase);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: auth.status || 401 }
      );
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

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database unreachable' }, { status: 500 });
    }

    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('id, slug, phone, whatsapp_number, bot_paused, is_bot_active, metadata')
      .or(`slug.eq.${slug},id.eq.${slug}`)
      .maybeSingle();

    if (error || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const candidatePhone =
      body.phone ||
      body.sender_phone ||
      body.sender ||
      body.whatsapp_number ||
      null;

    // Explicit Authorization Check (Admin/Owner/Allowlist)
    const auth = await verifyBotControlAuthorization(req, tenant, supabase, candidatePhone);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: auth.status || 401 }
      );
    }

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

    const result = await executeBotControl({
      action,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      senderPhone: candidatePhone || undefined,
      source: body.source || 'dashboard_toggle',
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
