-- ==============================================================================
-- Migration: Create credit ledger tables for Super Admin AI Telemetry
-- File: supabase/migrations/20261004_create_credit_ledger_tables.sql
-- Purpose: Track AI credit consumption per tenant/feature + revenue transactions
-- ==============================================================================

-- ── 1. credit_consumption_events ─────────────────────────────────────────────
-- One row per AI invocation (Gemini call, Vision scan, Landing Page gen, etc.)
CREATE TABLE IF NOT EXISTS public.credit_consumption_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    tenant_slug     TEXT NOT NULL,
    -- Feature category (drives breakdown chart)
    feature         TEXT NOT NULL CHECK (feature IN (
                        'WHATSAPP_BOT',
                        'BOONPILOT_CHAT',
                        'VISION_SCAN',
                        'LANDING_PAGE_GEN',
                        'BROADCAST_AI',
                        'ADS_ANALYSIS',
                        'OTHER'
                    )),
    -- Token metrics (Gemini units)
    input_tokens    INT NOT NULL DEFAULT 0,
    output_tokens   INT NOT NULL DEFAULT 0,
    total_tokens    INT GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
    -- Derived cost in IDR (computed at write time for fast aggregation)
    cost_idr        NUMERIC(14, 2) NOT NULL DEFAULT 0,
    -- Model used
    model           TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    -- Latency for P95 computation
    latency_ms      INT,
    -- Reference to the originating session or request
    session_id      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')
);

-- Indexes for common aggregation queries
CREATE INDEX IF NOT EXISTS idx_cce_tenant_id      ON public.credit_consumption_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cce_tenant_slug    ON public.credit_consumption_events(tenant_slug);
CREATE INDEX IF NOT EXISTS idx_cce_feature        ON public.credit_consumption_events(feature);
CREATE INDEX IF NOT EXISTS idx_cce_created_at     ON public.credit_consumption_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cce_tenant_month   ON public.credit_consumption_events(tenant_slug, date_trunc('month', created_at));

-- ── 2. credit_transactions ────────────────────────────────────────────────────
-- One row per revenue event (top-up purchase, subscription payment, refund)
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    tenant_slug         TEXT NOT NULL,
    type                TEXT NOT NULL CHECK (type IN (
                            'SUBSCRIPTION_PAYMENT',
                            'TOPUP_CREDIT',
                            'REFUND',
                            'BONUS_CREDIT',
                            'ADJUSTMENT'
                        )),
    amount_idr          NUMERIC(14, 2) NOT NULL,
    tier                TEXT,
    duration_months     INT,
    invoice_id          TEXT,
    payment_channel     TEXT DEFAULT 'XENDIT',
    status              TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED')),
    notes               TEXT,
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Jakarta'),
    updated_at          TIMESTAMPTZ DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')
);

CREATE INDEX IF NOT EXISTS idx_ct_tenant_id    ON public.credit_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ct_tenant_slug  ON public.credit_transactions(tenant_slug);
CREATE INDEX IF NOT EXISTS idx_ct_type         ON public.credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_ct_status       ON public.credit_transactions(status);
CREATE INDEX IF NOT EXISTS idx_ct_created_at   ON public.credit_transactions(created_at DESC);

-- ── 3. Row-Level Security ─────────────────────────────────────────────────────
ALTER TABLE public.credit_consumption_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'credit_consumption_events'
        AND policyname = 'service_role_all_cce'
    ) THEN
        CREATE POLICY service_role_all_cce ON public.credit_consumption_events
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'credit_transactions'
        AND policyname = 'service_role_all_ct'
    ) THEN
        CREATE POLICY service_role_all_ct ON public.credit_transactions
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ── 4. Aggregation Views ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_tenant_ai_cost_summary AS
SELECT
    t.id            AS tenant_id,
    t.slug          AS tenant_slug,
    t.name          AS tenant_name,
    t.tier          AS tier,
    date_trunc('month', cce.created_at AT TIME ZONE 'Asia/Jakarta') AS month_start,
    cce.feature,
    COUNT(*)::INT                   AS event_count,
    SUM(cce.total_tokens)::BIGINT   AS total_tokens,
    SUM(cce.cost_idr)               AS total_cost_idr,
    PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY cce.latency_ms) AS p95_latency_ms
FROM public.credit_consumption_events cce
JOIN public.tenants t ON t.id = cce.tenant_id
GROUP BY t.id, t.slug, t.name, t.tier,
         date_trunc('month', cce.created_at AT TIME ZONE 'Asia/Jakarta'), cce.feature;

CREATE OR REPLACE VIEW public.v_platform_revenue_summary AS
SELECT
    date_trunc('month', ct.created_at AT TIME ZONE 'Asia/Jakarta') AS month_start,
    ct.type,
    ct.tier,
    COUNT(*)::INT          AS transaction_count,
    SUM(ct.amount_idr)     AS total_amount_idr
FROM public.credit_transactions ct
WHERE ct.status = 'COMPLETED'
GROUP BY date_trunc('month', ct.created_at AT TIME ZONE 'Asia/Jakarta'), ct.type, ct.tier;
