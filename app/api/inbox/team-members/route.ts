import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { extractMerchantSessionToken, verifyMerchantSessionToken } from '@/lib/auth/merchant-session';

export const dynamic = 'force-dynamic';

export const CS_SEAT_QUOTA_MAP: Record<string, number> = {
  CHECKOUT_LITE: 0,
  SOLO: 1,
  STARTER: 1,
  ADS_PERFORMANCE: 2,
  PRO_SCALE: 2,
  GROWTH_PLUS: 2,
  TRIAL: 2,
  TEAM_SCALE: 5,
  ENTERPRISE: 5,
};

const SENSITIVE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, private',
  'Pragma': 'no-cache',
  'Expires': '0',
};

function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (trimmed.length <= 4) return '***';
  if (trimmed.length <= 6) return `${trimmed.slice(0, 2)}***${trimmed.slice(-1)}`;
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-2)}`;
}

function maskEmail(email?: string | null): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  const atIdx = trimmed.indexOf('@');
  if (atIdx === -1) return '***';
  const local = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx + 1);
  if (local.length <= 1) return `*@${domain}`;
  return `${local[0]}***${local.slice(-1)}@${domain}`;
}

export async function GET(req: NextRequest) {
  try {
    // 1. Session Extraction & Cryptographic Token Verification
    const token = extractMerchantSessionToken(req);
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Sesi login merchant diperlukan. Kredensial tidak ditemukan.', teamMembers: [], count: 0 },
        { status: 401, headers: SENSITIVE_HEADERS }
      );
    }

    const sessionResult = verifyMerchantSessionToken(token);
    if (!sessionResult.valid || !sessionResult.payload) {
      const errorStatus = (sessionResult.status === 200 ? 401 : sessionResult.status) as 401 | 403;
      return NextResponse.json(
        { success: false, error: sessionResult.error || 'Unauthorized: Token sesi merchant tidak sah atau telah kedaluwarsa.', teamMembers: [], count: 0 },
        { status: errorStatus, headers: SENSITIVE_HEADERS }
      );
    }

    const { payload } = sessionResult;

    // 2. Fail Closed on Missing Individual userId (Legacy PIN-only sessions rejected)
    if (!payload.userId || typeof payload.userId !== 'string' || !payload.userId.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Sesi login membutuhkan identitas individual pengguna terdaftar (userId). Silakan login ulang.',
          errorCode: 'USER_IDENTITY_REQUIRED',
          teamMembers: [],
          count: 0,
        },
        { status: 403, headers: SENSITIVE_HEADERS }
      );
    }

    const actorUserId = payload.userId.trim();

    // 3. Authoritative Tenant Identity from Verified Session Claims Only
    const sessionTenantId = payload.tenantId?.trim() || null;
    const sessionTenantSlug = payload.tenantSlug?.toLowerCase().trim() || null;

    if (!sessionTenantId && !sessionTenantSlug) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Identitas tenant sesi tidak valid.', errorCode: 'TENANT_IDENTITY_MISSING', teamMembers: [], count: 0 },
        { status: 403, headers: SENSITIVE_HEADERS }
      );
    }

    // 4. Reject Mismatches Across All Client-Supplied Selector Aliases
    const { searchParams } = new URL(req.url);
    const qTenant = searchParams.get('tenant')?.trim();
    const qTenantId = searchParams.get('tenantId')?.trim();
    const qTenant_id = searchParams.get('tenant_id')?.trim();
    const qSlug = searchParams.get('slug')?.trim();

    const clientSelectors = [qTenant, qTenantId, qTenant_id, qSlug].filter(Boolean) as string[];

    for (const selector of clientSelectors) {
      const normSelector = selector.toLowerCase();
      const matchesSlug = sessionTenantSlug ? normSelector === sessionTenantSlug : false;
      const matchesId = sessionTenantId ? normSelector === sessionTenantId.toLowerCase() : false;

      if (!matchesSlug && !matchesId) {
        return NextResponse.json(
          {
            success: false,
            error: 'Forbidden: Parameter selector tenant tidak cocok dengan identitas sesi yang diautentikasi.',
            errorCode: 'TENANT_MISMATCH',
            teamMembers: [],
            count: 0,
          },
          { status: 403, headers: SENSITIVE_HEADERS }
        );
      }
    }

    // 5. Database Connection
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database service unavailable.', teamMembers: [], count: 0 },
        { status: 500, headers: SENSITIVE_HEADERS }
      );
    }

    // 6. Verify Caller's Active Membership in the Same Tenant
    const { data: callerUser, error: callerErr } = await supabase
      .from('tenant_users')
      .select('id, tenant_id, tenant_slug, role, status, is_active')
      .eq('id', actorUserId)
      .maybeSingle();

    if (callerErr || !callerUser) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Pengguna tidak terdaftar dalam catatan keanggotaan toko.',
          errorCode: 'ACTOR_MEMBERSHIP_NOT_FOUND',
          teamMembers: [],
          count: 0,
        },
        { status: 403, headers: SENSITIVE_HEADERS }
      );
    }

    const callerIsActive = callerUser.is_active === true && String(callerUser.status).toLowerCase().trim() === 'active';
    if (!callerIsActive) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Status keanggotaan pengguna tidak aktif.',
          errorCode: 'MEMBERSHIP_INACTIVE',
          teamMembers: [],
          count: 0,
        },
        { status: 403, headers: SENSITIVE_HEADERS }
      );
    }

    // Tenant binding validation between callerUser and session
    const callerTenantId = (callerUser.tenant_id || '').toLowerCase().trim();
    const callerTenantSlug = (callerUser.tenant_slug || '').toLowerCase().trim();
    const matchesCallerTenant =
      (sessionTenantId && callerTenantId === sessionTenantId.toLowerCase()) ||
      (sessionTenantSlug && callerTenantSlug === sessionTenantSlug);

    if (!matchesCallerTenant) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Pengguna tidak memiliki wewenang pada tenant ini.',
          errorCode: 'TENANT_CROSS_ACCESS_FORBIDDEN',
          teamMembers: [],
          count: 0,
        },
        { status: 403, headers: SENSITIVE_HEADERS }
      );
    }

    const callerRole = (callerUser.role || payload.role || '').toUpperCase().trim();
    const isOwner = callerRole === 'OWNER';

    // 7. Query Team Members with Explicit Column Allowlist (Zero .select('*'))
    const orTokens = new Set<string>();
    if (sessionTenantId) orTokens.add(`tenant_id.eq.${sessionTenantId}`);
    if (sessionTenantSlug) {
      orTokens.add(`tenant_slug.eq.${sessionTenantSlug}`);
      orTokens.add(`tenant_id.eq.${sessionTenantSlug}`);
    }

    const { data: members, error: queryErr } = await supabase
      .from('tenant_users')
      .select('id, tenant_id, tenant_slug, name, phone, email, role, access_level, status, is_active, created_at')
      .or(Array.from(orTokens).join(','))
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (queryErr) {
      console.warn('[API team-members] Query warning:', queryErr.message);
      return NextResponse.json(
        { success: true, teamMembers: [], count: 0 },
        { status: 200, headers: SENSITIVE_HEADERS }
      );
    }

    // 8. Role-Based PII Masking: Only OWNER receives unmasked phone/email
    const sanitizedMembers = (members || []).map((m: any) => ({
      id: m.id,
      tenant_id: m.tenant_id,
      tenant_slug: m.tenant_slug,
      name: m.name,
      phone: isOwner ? m.phone : maskPhone(m.phone),
      email: isOwner ? m.email : maskEmail(m.email),
      role: m.role,
      access_level: m.access_level,
      status: m.status,
      is_active: m.is_active,
      created_at: m.created_at,
    }));

    return NextResponse.json(
      {
        success: true,
        teamMembers: sanitizedMembers,
        count: sanitizedMembers.length,
      },
      {
        status: 200,
        headers: SENSITIVE_HEADERS,
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'Internal Server Error', teamMembers: [], count: 0 },
      { status: 500, headers: SENSITIVE_HEADERS }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, tenantSlug, name, phone, email, accessLevel, role, planTier } = body;

    if (!name || (!tenantId && !tenantSlug)) {
      return NextResponse.json(
        { success: false, error: 'Nama dan tenant wajib diisi.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database unavailable.' }, { status: 500 });
    }

    // Resolve tenant info and tier
    let targetTenantId = tenantId;
    let targetTenantSlug = tenantSlug;
    let tierKey = (planTier || 'STARTER').toUpperCase();

    try {
      const { data: tRow } = await supabase
        .from('tenants')
        .select('id, slug, tier, metadata')
        .or(`id.eq.${tenantId || tenantSlug},slug.eq.${tenantSlug || tenantId}`)
        .maybeSingle();

      if (tRow) {
        targetTenantId = tRow.id;
        targetTenantSlug = tRow.slug;
        const detectedTier = tRow.tier || tRow.metadata?.tier || planTier || 'STARTER';
        tierKey = String(detectedTier).toUpperCase();
      }
    } catch (_) {}

    // Check quota
    const quota = CS_SEAT_QUOTA_MAP[tierKey] ?? 1;

    if (tierKey === 'CHECKOUT_LITE' || quota === 0) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'TIER_LOCKED',
          message: 'Fitur Live CS Inbox hanya tersedia mulai paket Solo atau Ads Performance.',
        },
        { status: 403 }
      );
    }

    // Count existing active CS
    const { count: currentCount } = await supabase
      .from('tenant_users')
      .select('id', { count: 'exact', head: true })
      .or(`tenant_id.eq.${targetTenantId},tenant_slug.eq.${targetTenantSlug}`)
      .eq('is_active', true);

    const activeCount = currentCount || 0;

    if (activeCount >= quota) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'QUOTA_EXCEEDED',
          message: `Batas kuota ${quota} CS Seat untuk paket Anda telah tercapai. Silakan lakukan upgrade paket untuk menambah kursi admin.`,
          currentCount: activeCount,
          quota,
        },
        { status: 400 }
      );
    }

    // Insert new CS member
    const { data: newMember, error: insertErr } = await supabase
      .from('tenant_users')
      .insert({
        tenant_id: targetTenantId,
        tenant_slug: targetTenantSlug,
        name: name.trim(),
        phone: phone ? phone.trim() : null,
        email: email ? email.trim() : null,
        role: role || 'CS',
        access_level: accessLevel || 'LIVE_CHAT_ONLY',
        status: 'active',
        is_active: true,
      })
      .select('*')
      .single();

    if (insertErr) {
      return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      member: newMember,
      activeCount: activeCount + 1,
      quota,
      message: `✅ Berhasil menambahkan ${newMember.name} sebagai CS Seat aktif!`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
