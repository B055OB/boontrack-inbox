import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { executeBotControl, updateBotState } from '@/lib/whatsapp/bot-control-service';

export const dynamic = 'force-dynamic';

/**
 * Verifikasi hak akses tenant menggunakan session token autentikasi resmi (Supabase Auth server-side: supabase.auth.getUser()).
 *
 * Otorisasi DIBERIKAN jika:
 * 1. Admin/Service API credentials (Bearer SUPABASE_SERVICE_ROLE_KEY atau x-internal-secret).
 * 2. Supabase Auth session token resmi (Bearer <access_token> atau cookie access_token / sb-access-token / sb-*-auth-token)
 *    yang divalidasi server-side via `supabase.auth.getUser(token)`, di mana user terautentikasi adalah:
 *    - Owner dari tenant (user.id === tenant.user_id / owner_id, user.email === tenant.owner_email, dll).
 *    - Atau role 'owner', 'admin', 'manager', 'superuser' di tabel tenant_users.
 *    - Atau user memiliki app_metadata.role === 'SUPERADMIN'.
 *
 * FAIL-CLOSED SECURITY GUARDRAIL (CTO Directive B1):
 * - DILARANG KERAS menerima cookie slug polos (merchant_session / merchant_store / bt_tenant) tanpa validasi
 *   kriptografis token Supabase Auth server-side (supabase.auth.getUser()), guna mencegah pembajakan kontrol bot
 *   hanya bermodalkan nama slug toko.
 * - Membaca identitas dari req.body.phone, header x-phone, atau query params phone dilarang keras (anti-spoofing).
 *
 * Jika tidak ada token sesi yang sah -> HTTP 401 Unauthorized (fail-closed).
 */
export function extractSupabaseToken(req: NextRequest): string {
  const authHeader = req.headers.get('authorization')?.trim() || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  } else if (authHeader && !authHeader.toLowerCase().startsWith('basic ')) {
    return authHeader;
  }

  // Check direct Supabase token cookies
  const directTokenCookie =
    req.cookies.get('sb-access-token')?.value ||
    req.cookies.get('access_token')?.value ||
    req.cookies.get('supabase-auth-token')?.value;

  if (directTokenCookie) {
    return directTokenCookie.trim();
  }

  // Check project-specific Supabase auth cookies (e.g. sb-<project-ref>-auth-token)
  for (const cookie of req.cookies.getAll()) {
    if (cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')) {
      try {
        const raw = decodeURIComponent(cookie.value);
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && typeof parsed[0] === 'string' && parsed[0]) {
          return parsed[0].trim();
        }
        if (parsed?.access_token && typeof parsed.access_token === 'string' && parsed.access_token) {
          return parsed.access_token.trim();
        }
      } catch {
        if (cookie.value) return cookie.value.trim();
      }
    }
  }

  return '';
}

export async function verifyUserSession(
  req: NextRequest,
  tenant: {
    id: string;
    slug: string;
    user_id?: string | null;
    owner_id?: string | null;
    email?: string | null;
    owner_email?: string | null;
    metadata?: any;
    pause_reason?: string | null;
  },
  supabase: any
): Promise<{ authorized: boolean; error?: string; status?: number; user?: any; role?: string }> {
  const authHeader = req.headers.get('authorization')?.trim();
  const internalSecret = req.headers.get('x-internal-secret')?.trim();

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const envAdminSecret = (process.env.ADMIN_INTERNAL_SECRET || process.env.INTERNAL_API_SECRET)?.trim();

  // 1. Service / Internal Admin Secret Check (Machine-to-Machine)
  if (
    (envAdminSecret && (internalSecret === envAdminSecret || authHeader === `Bearer ${envAdminSecret}`)) ||
    (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`)
  ) {
    return { authorized: true, role: 'internal_admin' };
  }

  // 2. Extract Cryptographic Supabase Auth Token (Bearer header or secure auth cookies)
  const token = extractSupabaseToken(req);

  // FAIL-CLOSED (CTO Directive B1): Plain slug cookies without Supabase Auth token are strictly rejected!
  if (!token) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized: Sesi token autentikasi resmi (Supabase Auth server-side) diperlukan. Akses berbasis cookie slug polos ditolak.',
    };
  }

  // 3. Cryptographic Token Validation via Official Supabase Auth Session (supabase.auth.getUser)
  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) {
      return {
        authorized: false,
        status: 401,
        error: 'Unauthorized: Sesi token autentikasi tidak valid atau kedaluwarsa.',
      };
    }

    const user = authData.user;
    const userId = user.id;
    const userEmail = user.email?.toLowerCase().trim();

    // Check superadmin via app_metadata
    const appRole = String(user.app_metadata?.role || user.app_metadata?.user_role || '').trim().toUpperCase();
    if (appRole === 'SUPERADMIN') {
      return { authorized: true, user, role: 'superuser' };
    }

    // Direct ownership check on tenant record
    const isOwnerDirect =
      (tenant.user_id && tenant.user_id === userId) ||
      (tenant.owner_id && tenant.owner_id === userId) ||
      (tenant.metadata?.user_id && tenant.metadata.user_id === userId) ||
      (tenant.metadata?.owner_id && tenant.metadata.owner_id === userId) ||
      (userEmail && (
        (tenant.email && tenant.email.toLowerCase().trim() === userEmail) ||
        (tenant.owner_email && tenant.owner_email.toLowerCase().trim() === userEmail) ||
        (tenant.metadata?.owner_email && tenant.metadata.owner_email.toLowerCase().trim() === userEmail)
      ));

    if (isOwnerDirect) {
      return { authorized: true, user, role: 'owner' };
    }

    // Role check in tenant_users table
    try {
      const { data: userRecords } = await supabase
        .from('tenant_users')
        .select('user_id, email, role, is_active')
        .or(`tenant_id.eq.${tenant.id},tenant_slug.eq.${tenant.slug}`)
        .eq('is_active', true);

      if (Array.isArray(userRecords)) {
        const matchedUser = userRecords.find(
          (u: any) =>
            (u.user_id && u.user_id === userId) ||
            (userEmail && u.email && u.email.toLowerCase().trim() === userEmail)
        );

        if (matchedUser) {
          const role = String(matchedUser.role || '').toLowerCase();
          if (['owner', 'admin', 'manager', 'superuser'].includes(role)) {
            return { authorized: true, user, role };
          }
        }
      }
    } catch (dbErr) {
      console.warn('[BotControl] Error checking tenant_users for user:', dbErr);
    }

    // User is authenticated but NOT owner/admin of this tenant -> 403 Forbidden
    return {
      authorized: false,
      status: 403,
      error: 'Forbidden: User bukan owner atau admin dari toko ini.',
    };
  } catch (err: any) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized: Gagal memverifikasi sesi token autentikasi.',
    };
  }
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
      .select('id, slug, phone, whatsapp_number, bot_paused, is_bot_active, metadata, user_id, owner_id, email, owner_email')
      .or(`slug.eq.${slug},id.eq.${slug}`)
      .maybeSingle();

    if (error || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Explicit Authorization Check via official session verification (Supabase auth / internal secret)
    const auth = await verifyUserSession(req, tenant, supabase);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: auth.status || 401 }
      );
    }

    // Support query params for specific conversation status check
    const searchParams = req.nextUrl.searchParams;
    const conversationId = searchParams.get('conversation_id') || searchParams.get('conversationId');
    const customerPhone = searchParams.get('customer_phone') || searchParams.get('customerPhone');

    if (conversationId || customerPhone) {
      let convQuery = supabase
        .from('conversations')
        .select('id, is_bot_active, is_paused, bot_paused, is_bot_paused, paused_until, pause_reason, last_state_updated_by')
        .or(`tenant_id.eq.${tenant.id},tenant_slug.eq.${tenant.slug}`);
      if (conversationId) {
        convQuery = convQuery.eq('id', conversationId);
      } else if (customerPhone) {
        convQuery = convQuery.eq('customer_phone', customerPhone);
      }
      const { data: convData } = await (convQuery?.maybeSingle ? convQuery.maybeSingle() : Promise.resolve({ data: null }));
      if (convData) {
        const isConvPaused =
          convData.bot_paused === true ||
          convData.is_paused === true ||
          convData.is_bot_paused === true ||
          convData.is_bot_active === false;

        const convPauseReason =
          convData.pause_reason ||
          (isConvPaused ? 'HUMAN_HANDOVER' : null);

        return NextResponse.json({
          success: true,
          slug: tenant.slug,
          tenant_id: tenant.id,
          conversation_id: convData.id,
          bot_paused: isConvPaused,
          is_paused: isConvPaused,
          is_bot_active: !isConvPaused,
          paused_until: convData.paused_until || null,
          pause_reason: convPauseReason,
          last_state_updated_by: convData.last_state_updated_by || null,
        });
      }
    }

    const isPaused =
      tenant.bot_paused === true ||
      tenant.is_bot_active === false ||
      tenant.metadata?.bot_paused === true ||
      tenant.metadata?.is_bot_paused === true ||
      tenant.metadata?.is_bot_active === false;

    const tenantPauseReason =
      (tenant as any).pause_reason ||
      tenant.metadata?.pause_reason ||
      (isPaused ? 'TENANT_DISABLED' : null);

    return NextResponse.json({
      success: true,
      slug: tenant.slug,
      tenant_id: tenant.id,
      bot_paused: isPaused,
      is_paused: isPaused,
      is_bot_active: !isPaused,
      paused_until: tenant.metadata?.paused_until || null,
      pause_reason: tenantPauseReason,
      last_state_updated_by: tenant.metadata?.paused_by || null,
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
      .select('id, slug, phone, whatsapp_number, bot_paused, is_bot_active, metadata, user_id, owner_id, email, owner_email')
      .or(`slug.eq.${slug},id.eq.${slug}`)
      .maybeSingle();

    if (error || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Explicit Authorization Check via official session verification (Supabase auth / internal secret)
    const auth = await verifyUserSession(req, tenant, supabase);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: auth.status || 401 }
      );
    }

    const scope: 'tenant' | 'conversation' =
      body.scope === 'conversation' || body.conversation_id || body.customer_phone || body.conversationId || body.customerPhone
        ? 'conversation'
        : 'tenant';

    let action: 'PAUSE' | 'RESUME';
    if (body.action) {
      action = String(body.action).toUpperCase() === 'PAUSE' ? 'PAUSE' : 'RESUME';
    } else if (body.bot_paused !== undefined) {
      action = Boolean(body.bot_paused) ? 'PAUSE' : 'RESUME';
    } else if (body.is_bot_active !== undefined) {
      action = !Boolean(body.is_bot_active) ? 'PAUSE' : 'RESUME';
    } else if (body.status) {
      const s = String(body.status).toUpperCase();
      action = (s === 'BOT_DISABLED' || s === 'HUMAN_HANDOVER' || s === 'HUMAN_PAUSED') ? 'PAUSE' : 'RESUME';
    } else {
      action = 'PAUSE';
    }

    const durationMinutes =
      body.durationMinutes !== undefined
        ? Number(body.durationMinutes)
        : body.duration_minutes !== undefined
        ? Number(body.duration_minutes)
        : body.duration !== undefined
        ? Number(body.duration)
        : undefined;

    const resolvedSource = body.source || (scope === 'conversation' ? 'cs_chat_toggle' : 'dashboard_toggle');
    const authHeader = req.headers.get('authorization')?.trim();
    const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
    const headerSecret = req.headers.get('x-internal-secret')?.trim() || bearerSecret;

    // Centralized Service Function (Single Source of Truth per CTO Directive TASK-103)
    const result = await updateBotState({
      conversationId: body.conversation_id || body.conversationId,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      action,
      durationMinutes,
      status: body.status,
      scope,
      customerPhone: body.customer_phone || body.customerPhone,
      senderPhone: auth.user?.phone || undefined,
      userRole: auth.role,
      internalSecret: headerSecret,
      systemSecret: headerSecret,
      source: resolvedSource,
      supabase,
    });

    if (!result.success) {
      return NextResponse.json(result, {
        status: result.error?.includes('FORBIDDEN') ? 403 : 500,
      });
    }

    return NextResponse.json({
      ...result,
      is_paused: result.bot_paused,
      is_bot_active: result.is_bot_active ?? !result.bot_paused,
      paused_until: result.paused_until ?? null,
      pause_reason: result.pause_reason ?? null,
      scope: result.scope || scope,
      status: result.status,
      last_state_updated_by: result.last_state_updated_by ?? null,
      source: resolvedSource,
    });
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
