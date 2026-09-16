import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/tenant/me?slug=[tenant_slug]
 * 
 * Mengembalikan profil tenant lengkap beserta status langganan & sisa hari trial:
 * - slug, name, category, tier
 * - trial_ends_at: ISO timestamp
 * - days_left: integer (0 jika expired)
 * - is_expired: boolean
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const querySlug = searchParams.get('slug');
    const cookieStore = req.cookies.get('merchant_store')?.value || req.cookies.get('merchant_session')?.value || req.cookies.get('bt_tenant')?.value;
    const rawSlug = querySlug || cookieStore || '';
    const slug = normalizeTenantSlug(rawSlug);

    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'Parameter slug tenant wajib disertakan.' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Koneksi database Supabase tidak tersedia.' },
        { status: 500 }
      );
    }

    const { data: tenant, error: dbErr } = await supabase
      .from('tenants')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (dbErr) {
      return NextResponse.json(
        { success: false, error: `Gagal membaca tenant: ${dbErr.message}` },
        { status: 500 }
      );
    }

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Tenant tidak ditemukan.' },
        { status: 404 }
      );
    }

    const rawTier = String(tenant.tier || tenant.metadata?.tier || tenant.metadata?.plan_tier || 'SOLO_TRIAL');
    const isTrial = Boolean(rawTier.toLowerCase().includes('trial') || rawTier.toUpperCase() === 'SOLO_TRIAL');

    // Kolom resmi di database Supabase adalah subscription_ends_at (dan trial_ends_at)
    const effectiveEndDateRaw =
      tenant.trial_ends_at ||
      tenant.subscription_ends_at ||
      tenant.metadata?.trial_ends_at ||
      tenant.metadata?.subscription_ends_at;

    let trialEndsAt: string | null = null;
    let subscriptionEndsAt: string | null = null;
    let daysLeft: number | null = null;
    let isExpired = false;

    if (effectiveEndDateRaw) {
      trialEndsAt = new Date(effectiveEndDateRaw).toISOString();
    } else if (tenant.created_at) {
      trialEndsAt = new Date(new Date(tenant.created_at).getTime() + 7 * 86400000).toISOString();
    } else {
      trialEndsAt = new Date(Date.now() + 7 * 86400000).toISOString();
    }

    subscriptionEndsAt = tenant.subscription_ends_at
      ? new Date(tenant.subscription_ends_at).toISOString()
      : trialEndsAt;

    const diffMs = new Date(trialEndsAt).getTime() - Date.now();
    daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    isExpired = daysLeft <= 0;

    return NextResponse.json({
      success: true,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        category: tenant.category,
        tier: rawTier,
        is_trial: isTrial,
        trial_ends_at: trialEndsAt,
        subscription_ends_at: subscriptionEndsAt,
        days_left: daysLeft,
        is_expired: isExpired,
        metadata: tenant.metadata || {},
        created_at: tenant.created_at,
        is_active: tenant.is_active !== false,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem.';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
