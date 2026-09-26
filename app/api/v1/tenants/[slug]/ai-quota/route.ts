import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';

export function resolveBaselineQuota(tier: string | undefined | null): number {
  if (!tier) return 150;
  const t = tier.toUpperCase();
  if (t === 'ENTERPRISE' || t === 'TEAM_SCALE') return 600;
  if (t === 'PRO_SCALE' || t === 'ADS_PERFORMANCE') return 300;
  if (t === 'STARTER' || t === 'SOLO') return 150;
  if (t === 'CHECKOUT_LITE' || t === 'LITE') return 50;
  return 150;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    const supabase = getSupabase();
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('id, slug, name, tier, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const metadata = tenant.metadata || {};
    const tier = String(tenant.tier || metadata.plan_tier || 'STARTER').toUpperCase();
    const baseQuota = resolveBaselineQuota(tier);
    const overageQuota = Number(metadata.overage_sessions || 0);
    const totalQuota = baseQuota + overageQuota;
    const usedSessions = Number(metadata.ai_sessions_used || 0);
    const remainingSessions = Math.max(0, totalQuota - usedSessions);
    const percentage = totalQuota > 0 ? Math.min(100, Math.round((remainingSessions / totalQuota) * 100)) : 0;
    const isLow = remainingSessions <= Math.ceil(totalQuota * 0.2);
    const isDepleted = remainingSessions <= 0;

    return NextResponse.json({
      success: true,
      tier,
      base_quota: baseQuota,
      overage_quota: overageQuota,
      total_quota: totalQuota,
      used_sessions: usedSessions,
      remaining_sessions: remainingSessions,
      percentage,
      is_low: isLow,
      is_depleted: isDepleted,
      fallback_mode: isDepleted,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error resolving AI quota';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');
    const body = await req.json();

    const additionalSessions = Number(body.sessions || 100);
    if (isNaN(additionalSessions) || additionalSessions <= 0) {
      return NextResponse.json({ success: false, error: 'Jumlah sesi tidak valid' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data: tenant, error: fetchErr } = await supabase
      .from('tenants')
      .select('id, slug, tier, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (fetchErr || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const metadata = tenant.metadata || {};
    const currentOverage = Number(metadata.overage_sessions || 0);
    const newOverage = currentOverage + additionalSessions;

    const updatedMetadata = {
      ...metadata,
      overage_sessions: newOverage,
      last_quota_topup: {
        sessions_added: additionalSessions,
        package_id: body.package_id || 'topup_100',
        timestamp: new Date().toISOString(),
      },
    };

    const { error: updateErr } = await supabase
      .from('tenants')
      .update({ metadata: updatedMetadata })
      .eq('slug', slug);

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    const tier = String(tenant.tier || metadata.plan_tier || 'STARTER').toUpperCase();
    const baseQuota = resolveBaselineQuota(tier);
    const totalQuota = baseQuota + newOverage;
    const usedSessions = Number(metadata.ai_sessions_used || 0);
    const remainingSessions = Math.max(0, totalQuota - usedSessions);
    const percentage = totalQuota > 0 ? Math.min(100, Math.round((remainingSessions / totalQuota) * 100)) : 0;

    return NextResponse.json({
      success: true,
      message: `Berhasil menambah ${additionalSessions} kuota sesi AI!`,
      tier,
      base_quota: baseQuota,
      overage_quota: newOverage,
      total_quota: totalQuota,
      used_sessions: usedSessions,
      remaining_sessions: remainingSessions,
      percentage,
      is_low: remainingSessions <= Math.ceil(totalQuota * 0.2),
      is_depleted: remainingSessions <= 0,
      fallback_mode: remainingSessions <= 0,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error processing AI quota topup';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
