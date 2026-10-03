import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

const MASTER_PIN = '998877';

// Cost constants
const IDR_PER_USD = 16200;
// Gemini 2.5 Flash blended: input $0.075/1M, output $0.30/1M → blended ~$0.175/1M
const GEMINI_COST_PER_MILLION_USD = 0.175;
const META_FEE_PER_MSG_IDR = 350;

export async function GET(req: NextRequest) {
  // PIN-gated — checked via header X-Admin-Pin or query param
  const pin =
    req.headers.get('x-admin-pin') ||
    req.nextUrl.searchParams.get('pin');

  if (pin !== MASTER_PIN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const period = req.nextUrl.searchParams.get('period') || 'MTD'; // MTD | LAST30 | ALL
  const supabase = getSupabaseAdmin();

  // ── Date range calculation ────────────────────────────────────────────────
  const now = new Date();
  let fromDate: string;
  if (period === 'MTD') {
    fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  } else if (period === 'LAST30') {
    fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  } else {
    fromDate = '2024-01-01T00:00:00Z'; // ALL time
  }

  try {
    // ── 1. Revenue from credit_transactions ───────────────────────────────
    const { data: revenueRows } = await supabase
      .from('credit_transactions')
      .select('type, amount_idr, tier, status, created_at')
      .gte('created_at', fromDate)
      .eq('status', 'COMPLETED');

    const totalRevenue = (revenueRows || []).reduce(
      (sum, r) => sum + Number(r.amount_idr || 0),
      0,
    );
    const subscriptionRevenue = (revenueRows || [])
      .filter((r) => r.type === 'SUBSCRIPTION_PAYMENT')
      .reduce((sum, r) => sum + Number(r.amount_idr || 0), 0);
    const topupRevenue = (revenueRows || [])
      .filter((r) => r.type === 'TOPUP_CREDIT')
      .reduce((sum, r) => sum + Number(r.amount_idr || 0), 0);

    // ── 2. AI costs from credit_consumption_events ────────────────────────
    const { data: consumptionRows } = await supabase
      .from('credit_consumption_events')
      .select('feature, total_tokens, cost_idr, latency_ms, tenant_slug, created_at')
      .gte('created_at', fromDate);

    const totalCostIdr = (consumptionRows || []).reduce(
      (sum, r) => sum + Number(r.cost_idr || 0),
      0,
    );
    const totalTokens = (consumptionRows || []).reduce(
      (sum, r) => sum + Number(r.total_tokens || 0),
      0,
    );

    // Feature breakdown
    const featureMap: Record<string, { tokens: number; cost: number; count: number }> = {};
    for (const row of consumptionRows || []) {
      const f = row.feature || 'OTHER';
      if (!featureMap[f]) featureMap[f] = { tokens: 0, cost: 0, count: 0 };
      featureMap[f].tokens += Number(row.total_tokens || 0);
      featureMap[f].cost += Number(row.cost_idr || 0);
      featureMap[f].count += 1;
    }
    const featureBreakdown = Object.entries(featureMap).map(([feature, v]) => ({
      feature,
      tokens: v.tokens,
      cost_idr: Math.round(v.cost),
      event_count: v.count,
    }));

    // ── 3. Gross margin ───────────────────────────────────────────────────
    const grossMarginPct =
      totalRevenue > 0
        ? (((totalRevenue - totalCostIdr) / totalRevenue) * 100).toFixed(1)
        : '0';

    // ── 4. Per-tenant audit table (top 20 by cost) ────────────────────────
    const tenantMap: Record<string, {
      tokens: number; cost: number; count: number;
      latencies: number[];
    }> = {};
    for (const row of consumptionRows || []) {
      const slug = row.tenant_slug || 'unknown';
      if (!tenantMap[slug]) tenantMap[slug] = { tokens: 0, cost: 0, count: 0, latencies: [] };
      tenantMap[slug].tokens += Number(row.total_tokens || 0);
      tenantMap[slug].cost += Number(row.cost_idr || 0);
      tenantMap[slug].count += 1;
      if (row.latency_ms != null) tenantMap[slug].latencies.push(Number(row.latency_ms));
    }

    const tenantAudit = Object.entries(tenantMap)
      .map(([slug, v]) => {
        const sorted = [...v.latencies].sort((a, b) => a - b);
        const p95idx = Math.floor(sorted.length * 0.95);
        const p95Latency = sorted[p95idx] ?? null;
        return {
          tenant_slug: slug,
          total_tokens: v.tokens,
          total_cost_idr: Math.round(v.cost),
          event_count: v.count,
          p95_latency_ms: p95Latency,
        };
      })
      .sort((a, b) => b.total_cost_idr - a.total_cost_idr)
      .slice(0, 20);

    // ── 5. Fallback: if tables are empty, enrich from tenants.metadata ────
    // (Graceful degradation while credit_consumption_events is being populated)
    let enrichedTenantAudit = tenantAudit;
    if (tenantAudit.length === 0) {
      const { data: tenantRows } = await supabase
        .from('tenants')
        .select('slug, name, tier, metadata')
        .limit(20);

      enrichedTenantAudit = (tenantRows || []).map((t) => {
        const meta = (t.metadata as Record<string, unknown>) || {};
        const tokens = Number(meta.total_tokens_mtd || meta.gemini_tokens || 0);
        const costIdr = Math.round((tokens / 1_000_000) * GEMINI_COST_PER_MILLION_USD * IDR_PER_USD);
        return {
          tenant_slug: t.slug as string,
          tenant_name: t.name as string | undefined,
          tier: t.tier as string | undefined,
          total_tokens: tokens,
          total_cost_idr: costIdr,
          event_count: 0,
          p95_latency_ms: null as number | null,
          source: 'metadata_fallback',
        };
      });
    }

    // ── 6. Tenant count (for subscription revenue baseline) ───────────────
    const { count: tenantCount } = await supabase
      .from('tenants')
      .select('id', { count: 'exact', head: true });

    return NextResponse.json({
      ok: true,
      period,
      from_date: fromDate,
      generated_at: now.toISOString(),
      summary: {
        total_revenue_idr: Math.round(totalRevenue),
        subscription_revenue_idr: Math.round(subscriptionRevenue),
        topup_revenue_idr: Math.round(topupRevenue),
        total_ai_cost_idr: Math.round(totalCostIdr),
        total_tokens: totalTokens,
        gross_margin_pct: Number(grossMarginPct),
        tenant_count: tenantCount || 0,
        revenue_source: totalRevenue > 0 ? 'credit_transactions' : 'estimated',
        cost_source: totalCostIdr > 0 ? 'credit_consumption_events' : 'estimated',
      },
      feature_breakdown: featureBreakdown,
      tenant_audit: enrichedTenantAudit,
    });
  } catch (err) {
    console.error('[Admin AI Economics API] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error', detail: String(err) },
      { status: 500 },
    );
  }
}
