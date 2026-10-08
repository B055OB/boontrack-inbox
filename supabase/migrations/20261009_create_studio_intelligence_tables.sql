-- ==============================================================================
-- Migration: Phase A Expand-Only: Studio Intelligence & Viral Trends Radar
-- File: supabase/migrations/20261009_create_studio_intelligence_tables.sql
-- Status: Official Migration / Architecture Contract ADR § 54
-- Dependencies: public.tenants
-- Invariant Guard: Zero mutation to orders, products, payments, or core shop tables.
-- Core Principle: Evidence -> Normalization -> Insight -> Gemini Interpretation -> Script
-- ==============================================================================

BEGIN;

-- 1. Master Sumber Intelijen (Allowed Sources Only - Strict Ingestion Boundary)
CREATE TABLE IF NOT EXISTS public.studio_intelligence_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type TEXT NOT NULL CHECK (source_type IN ('TIKTOK_TRENDS', 'YOUTUBE_SHORTS', 'META_AD_LIBRARY', 'PARTNER_DATASET', 'INTERNAL')),
    display_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Antrean Pekerjaan Intelijen Terisolasi per Tenant & Workspace
CREATE TABLE IF NOT EXISTS public.studio_intelligence_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL,
    capability TEXT NOT NULL CHECK (capability IN ('VIRAL_TRENDS_RADAR', 'PAID_ADS_INTELLIGENCE')),
    status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')),
    triggered_by UUID NULL,
    error_message TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Lapisan Bukti Sinyal Video & Konten (Evidence Layer)
CREATE TABLE IF NOT EXISTS public.studio_intelligence_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES public.studio_intelligence_sources(id) ON DELETE SET NULL,
    category TEXT NOT NULL,
    format_type TEXT NOT NULL DEFAULT 'VERTICAL_VIDEO_9_16' CHECK (format_type IN ('VERTICAL_VIDEO_9_16', 'SHORT_FORM')),
    raw_signals JSONB DEFAULT '{}'::jsonb,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    published_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NULL,
    freshness_status TEXT NOT NULL DEFAULT 'FRESH' CHECK (freshness_status IN ('FRESH', 'AGING', 'STALE', 'EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Lapisan Pola Ternormalisasi (Normalized Insight Layer)
CREATE TABLE IF NOT EXISTS public.studio_intelligence_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES public.studio_intelligence_items(id) ON DELETE CASCADE,
    insight_type TEXT NOT NULL CHECK (insight_type IN ('HOOK_PATTERN', 'PROBLEM_FRAMING', 'CURIOSITY_GAP', 'CTA_PATTERN')),
    pattern_template TEXT NOT NULL,
    confidence_score NUMERIC(3,2) NOT NULL DEFAULT 0.90,
    commercial_eligibility BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Indexes untuk Performa & Lookup Cepat Radar
CREATE INDEX IF NOT EXISTS idx_studio_intel_sources_type ON public.studio_intelligence_sources (source_type, is_active);
CREATE INDEX IF NOT EXISTS idx_studio_intel_jobs_tenant_status ON public.studio_intelligence_jobs (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_studio_intel_items_cat_fresh ON public.studio_intelligence_items (category, freshness_status);
CREATE INDEX IF NOT EXISTS idx_studio_intel_items_observed ON public.studio_intelligence_items (observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_intel_insights_item ON public.studio_intelligence_insights (item_id);
CREATE INDEX IF NOT EXISTS idx_studio_intel_insights_type ON public.studio_intelligence_insights (insight_type, commercial_eligibility);

-- 6. Row Level Security (RLS) Configuration
ALTER TABLE public.studio_intelligence_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_intelligence_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_intelligence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_intelligence_insights ENABLE ROW LEVEL SECURITY;

-- 7. Service Role Full Access Policies
DROP POLICY IF EXISTS "Service role full access on studio_intelligence_sources" ON public.studio_intelligence_sources;
CREATE POLICY "Service role full access on studio_intelligence_sources" 
    ON public.studio_intelligence_sources FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on studio_intelligence_jobs" ON public.studio_intelligence_jobs;
CREATE POLICY "Service role full access on studio_intelligence_jobs" 
    ON public.studio_intelligence_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on studio_intelligence_items" ON public.studio_intelligence_items;
CREATE POLICY "Service role full access on studio_intelligence_items" 
    ON public.studio_intelligence_items FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on studio_intelligence_insights" ON public.studio_intelligence_insights;
CREATE POLICY "Service role full access on studio_intelligence_insights" 
    ON public.studio_intelligence_insights FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8. Tenant & Public Scoped Read Policies
-- Jobs: Scoped per tenant
DROP POLICY IF EXISTS "Tenant view scoped on studio_intelligence_jobs" ON public.studio_intelligence_jobs;
CREATE POLICY "Tenant view scoped on studio_intelligence_jobs" 
    ON public.studio_intelligence_jobs FOR SELECT TO authenticated
    USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- Sources, Evidence Items, Insights: Readable for authenticated/anon studio consumers
DROP POLICY IF EXISTS "Authenticated read on studio_intelligence_sources" ON public.studio_intelligence_sources;
CREATE POLICY "Authenticated read on studio_intelligence_sources" 
    ON public.studio_intelligence_sources FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Authenticated read on studio_intelligence_items" ON public.studio_intelligence_items;
CREATE POLICY "Authenticated read on studio_intelligence_items" 
    ON public.studio_intelligence_items FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Authenticated read on studio_intelligence_insights" ON public.studio_intelligence_insights;
CREATE POLICY "Authenticated read on studio_intelligence_insights" 
    ON public.studio_intelligence_insights FOR SELECT TO authenticated, anon USING (true);

-- 9. Seed Default Official Sources
INSERT INTO public.studio_intelligence_sources (id, source_type, display_name, is_active, metadata)
VALUES
    ('11111111-1111-4111-a111-111111111111', 'TIKTOK_TRENDS', 'TikTok Creator Center Indonesia Trends', true, '{"region": "ID", "curated": true}'::jsonb),
    ('22222222-2222-4222-a222-222222222222', 'YOUTUBE_SHORTS', 'YouTube Shorts Viral Audio & Retention Signals', true, '{"region": "ID", "curated": true}'::jsonb),
    ('33333333-3333-4333-a333-333333333333', 'META_AD_LIBRARY', 'Meta Ad Library Commercial Transcripts', false, '{"status": "HOLD", "region": "ID"}'::jsonb),
    ('44444444-4444-4444-a444-444444444444', 'INTERNAL', 'BoonTrack High-Conversion Creative Library', true, '{"curated_by": "Creative Director"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

COMMIT;
