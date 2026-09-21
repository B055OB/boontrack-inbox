import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { getTrialUsageSummary } from '@/lib/entitlements/trial-guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/trial/quota?slug=[tenant_slug]
 *       OR ?tenant_id=[uuid]
 *
 * Returns trial quota usage for the dashboard progress bar UI.
 * Non-trial tenants return isTrial=false with zeroed counters.
 *
 * Response shape:
 * {
 *   success: true,
 *   is_trial: boolean,
 *   trial_ends_at: string | null,
 *   quota: {
 *     orders:       { current: number, limit: 30,  exceeded: boolean, percent: number },
 *     interactions: { current: number, limit: 50,  exceeded: boolean, percent: number },
 *   }
 * }
 *
 * @architecture BATCH 1 / Ticket 1.2
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const querySlug = searchParams.get('slug') || searchParams.get('tenant');
    const queryTenantId = searchParams.get('tenant_id');

    const slug = normalizeTenantSlug(querySlug || '');

    if (!slug && !queryTenantId) {
      return NextResponse.json(
        { success: false, error: 'Parameter slug atau tenant_id wajib disertakan.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin() ?? getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database tidak tersedia.' },
        { status: 500 }
      );
    }

    // Resolve tenant UUID from slug if needed
    let tenantId = queryTenantId;
    if (!tenantId && slug) {
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      tenantId = tenantRow?.id ?? null;
    }

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: `Tenant '${slug || queryTenantId}' tidak ditemukan.` },
        { status: 404 }
      );
    }

    const summary = await getTrialUsageSummary(tenantId);

    return NextResponse.json({
      success: true,
      is_trial: summary.isTrial,
      trial_ends_at: summary.trialEndsAt,
      quota: {
        orders: {
          current: summary.orders.current,
          limit: summary.orders.limit,
          exceeded: summary.orders.exceeded,
          percent: Math.min(100, Math.round((summary.orders.current / summary.orders.limit) * 100)),
          label: `Pemakaian Pesanan: ${summary.orders.current}/${summary.orders.limit}`,
        },
        interactions: {
          current: summary.interactions.current,
          limit: summary.interactions.limit,
          exceeded: summary.interactions.exceeded,
          percent: Math.min(100, Math.round((summary.interactions.current / summary.interactions.limit) * 100)),
          label: `AI/Notifikasi: ${summary.interactions.current}/${summary.interactions.limit}`,
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    console.error('[Trial Quota API]:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
