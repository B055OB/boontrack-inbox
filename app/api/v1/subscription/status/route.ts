import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/subscription/status?slug=[tenant_slug]
 * 
 * Mengembalikan status langganan tenant secara real-time:
 * - tier: SOLO_TRIAL | ADS_PERFORMANCE | TEAM_SCALE
 * - is_trial: boolean
 * - trial_ends_at: timestamp ISO
 * - days_left: sisa hari nyata (0 jika expired)
 * - is_expired: boolean (true jika trial telah habis)
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
      .select('id, slug, name, tier, created_at, trial_ends_at, metadata, is_active')
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

    let trialEndsAt: string | null = null;
    let daysLeft: number | null = null;
    let isExpired = false;

    if (isTrial) {
      if (tenant.trial_ends_at) {
        trialEndsAt = new Date(tenant.trial_ends_at).toISOString();
      } else if (tenant.metadata?.trial_ends_at) {
        trialEndsAt = new Date(tenant.metadata.trial_ends_at).toISOString();
      } else if (tenant.created_at) {
        trialEndsAt = new Date(new Date(tenant.created_at).getTime() + 7 * 86400000).toISOString();
      } else {
        trialEndsAt = new Date(Date.now() + 7 * 86400000).toISOString();
      }

      const diffMs = new Date(trialEndsAt).getTime() - Date.now();
      daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      isExpired = daysLeft <= 0;
    }

    return NextResponse.json({
      success: true,
      slug: tenant.slug,
      store_name: tenant.name || tenant.slug,
      tier: rawTier,
      is_trial: isTrial,
      trial_ends_at: trialEndsAt,
      days_left: daysLeft,
      is_expired: isExpired,
      status: isExpired ? 'EXPIRED' : (isTrial ? 'TRIAL' : 'ACTIVE'),
      is_active: tenant.is_active !== false,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem.';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
