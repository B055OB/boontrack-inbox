import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantParam = searchParams.get('tenant') || searchParams.get('tenantId') || searchParams.get('slug');

    if (!tenantParam) {
      return NextResponse.json({ success: false, error: 'tenant is required', teamMembers: [] }, { status: 400 });
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database unavailable', teamMembers: [] }, { status: 500 });
    }

    // Resolve tenant UUID and slug
    let tenantUuid: string | null = null;
    let tenantSlug: string | null = null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantParam);

    try {
      let q = supabase.from('tenants').select('id, slug, tier, metadata');
      if (isUuid) {
        q = q.or(`id.eq.${tenantParam},slug.eq.${tenantParam}`);
      } else {
        q = q.or(`slug.eq.${tenantParam},id.eq.${tenantParam}`);
      }
      const { data: tRow } = await q.maybeSingle();
      if (tRow) {
        tenantUuid = tRow.id;
        tenantSlug = tRow.slug;
      }
    } catch (_) {}

    const orTokens = new Set<string>();
    if (tenantUuid) orTokens.add(`tenant_id.eq.${tenantUuid}`);
    if (tenantSlug) {
      orTokens.add(`tenant_slug.eq.${tenantSlug}`);
      orTokens.add(`tenant_id.eq.${tenantSlug}`);
    }
    orTokens.add(`tenant_id.eq.${tenantParam}`);
    orTokens.add(`tenant_slug.eq.${tenantParam}`);

    const { data: members, error } = await supabase
      .from('tenant_users')
      .select('*')
      .or(Array.from(orTokens).join(','))
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('[API team-members] Query note:', error.message);
      return NextResponse.json({ success: true, teamMembers: [], count: 0 });
    }

    return NextResponse.json({
      success: true,
      teamMembers: members || [],
      count: members?.length || 0,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, teamMembers: [] }, { status: 500 });
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
