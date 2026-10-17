import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { executeBotControl, updateBotState } from '@/lib/whatsapp/bot-control-service';

export const dynamic = 'force-dynamic';

/**
 * Verifikasi hak akses tenant menggunakan session token autentikasi resmi (Supabase auth / verifyUserSession).
 *
 * Otorisasi DIBERIKAN jika:
 * 1. Admin/Service API credentials (Bearer SUPABASE_SERVICE_ROLE_KEY atau x-internal-secret).
 * 2. Supabase Auth session token resmi (Bearer <access_token>) di mana user terautentikasi adalah
 *    owner dari tenant (user.id === tenant.user_id / owner_id, user.email === tenant.owner_email,
 *    atau role 'owner' / 'admin' di tabel tenant_users).
 *    - Jika token tidak valid / kedaluwarsa -> HTTP 401 Unauthorized.
 *    - Jika user bukan owner / admin tenant tersebut -> HTTP 403 Forbidden.
 * 3. Sesi login merchant resmi dari cookie (merchant_session, merchant_store, bt_tenant)
 *    yang cocok 100% dengan target tenant slug atau ID.
 *    - Jika cookie tidak cocok (cross-tenant) -> HTTP 403 Forbidden.
 *
 * DILARANG KERAS:
 * - Membaca identitas dari req.body.phone, header x-phone, atau query params phone (spoofing prevention).
 *
 * Jika tidak ada kredensial sesi yang sah -> HTTP 401 Unauthorized (fail-closed).
 */
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
  },
  supabase: any
): Promise<{ authorized: boolean; error?: string; status?: number; user?: any; role?: string }> {
  const authHeader = req.headers.get('authorization')?.trim();
  const internalSecret = req.headers.get('x-internal-secret')?.trim();

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const envAdminSecret = (process.env.ADMIN_INTERNAL_SECRET || process.env.INTERNAL_API_SECRET)?.trim();

  // 1. Service / Internal Admin Secret Check
  if (
    (envAdminSecret && (internalSecret === envAdminSecret || authHeader === `Bearer ${envAdminSecret}`)) ||
    (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`)
  ) {
    return { authorized: true, role: 'internal_admin' };
  }

  // 2. Supabase Auth Official Session Token Check (Bearer <JWT>)
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
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

        // Cek kepemilikan langsung di record tenant
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

        // Cek peran di tabel tenant_users
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

        // User terautentikasi tetapi BUKAN owner / admin dari slug tenant ini -> 403 Forbidden
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
  }

  // 3. Merchant Dashboard Session Cookie Check
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

  if (cookieStore) {
    if (cookieStore === normalizedTargetSlug || cookieStore === normalizedTargetId) {
      return { authorized: true, role: 'merchant_cookie' };
    }

    // Cookie ada tetapi milik toko lain (cross-tenant access attempt) -> 403 Forbidden
    return {
      authorized: false,
      status: 403,
      error: 'Forbidden: Sesi merchant tidak memiliki izin akses untuk toko ini.',
    };
  }

  // 4. Fail-closed: Tanpa autentikasi resmi
  return {
    authorized: false,
    status: 401,
    error: 'Unauthorized: Sesi autentikasi resmi (Supabase auth / merchant session) diperlukan.',
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
      .select('id, slug, phone, whatsapp_number, bot_paused, is_bot_active, metadata, user_id, owner_id, email, owner_email')
      .or(`slug.eq.${slug},id.eq.${slug}`)
      .maybeSingle();

    if (error || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Explicit Authorization Check via official session verification (Supabase auth / merchant session)
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
        .select('id, is_bot_active, is_paused, bot_paused, is_bot_paused, paused_until, last_state_updated_by')
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

        return NextResponse.json({
          success: true,
          slug: tenant.slug,
          tenant_id: tenant.id,
          conversation_id: convData.id,
          bot_paused: isConvPaused,
          is_paused: isConvPaused,
          is_bot_active: !isConvPaused,
          paused_until: convData.paused_until || null,
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

    return NextResponse.json({
      success: true,
      slug: tenant.slug,
      tenant_id: tenant.id,
      bot_paused: isPaused,
      is_paused: isPaused,
      is_bot_active: !isPaused,
      paused_until: tenant.metadata?.paused_until || null,
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

    // Explicit Authorization Check via official session verification (Supabase auth / merchant session / internal secret)
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
