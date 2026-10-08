-- ==============================================================================
-- Migration: Phase A Expand-Only: Creator & Studio Tables
-- File: supabase/migrations/20261008_create_creator_and_studio_tables.sql
-- Status: Official Migration / Architecture Contract ADR § 53
-- Dependencies: public.tenants
-- Invariant Guard: Zero mutation to orders, products, tenants, or core shop tables.
-- ==============================================================================

BEGIN;

-- 1. Identitas & Showcase Publik Kreator (creator.boontrack.com)
CREATE TABLE IF NOT EXISTS public.creator_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    handle TEXT UNIQUE NOT NULL,
    bio TEXT NULL,
    social_links JSONB DEFAULT '{}'::jsonb,
    theme_config JSONB DEFAULT '{"theme": "clean_light"}'::jsonb,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Naskah Video & Storyboard UGC (studio.boontrack.com)
CREATE TABLE IF NOT EXISTS public.studio_scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    product_name TEXT NOT NULL,
    brief JSONB NOT NULL,
    scenes JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Repositori Aset Kreatif (studio.boontrack.com)
CREATE TABLE IF NOT EXISTS public.studio_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    script_id UUID REFERENCES public.studio_scripts(id) ON DELETE SET NULL,
    file_url TEXT NOT NULL,
    asset_type TEXT NOT NULL, -- 'image', 'video_broll', 'audio', 'output_fcd'
    is_aigc BOOLEAN DEFAULT true,
    file_size BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Antrean Job Render Media FFmpeg / FCD Automation (studio.boontrack.com)
CREATE TABLE IF NOT EXISTS public.studio_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'QUEUED', -- 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'
    job_type TEXT NOT NULL DEFAULT 'FFMPEG_LEVEL_1',
    payload JSONB NOT NULL,
    output_url TEXT NULL,
    error_message TEXT NULL,
    attempt INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Indexes untuk Performa Query & Multi-Tenant Lookup
CREATE INDEX IF NOT EXISTS idx_creator_profiles_handle ON public.creator_profiles (handle);
CREATE INDEX IF NOT EXISTS idx_creator_profiles_tenant ON public.creator_profiles (tenant_id);

CREATE INDEX IF NOT EXISTS idx_studio_scripts_tenant ON public.studio_scripts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_studio_scripts_user ON public.studio_scripts (user_id);

CREATE INDEX IF NOT EXISTS idx_studio_assets_tenant ON public.studio_assets (tenant_id);
CREATE INDEX IF NOT EXISTS idx_studio_assets_script ON public.studio_assets (script_id);

CREATE INDEX IF NOT EXISTS idx_studio_jobs_tenant_status ON public.studio_jobs (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_studio_jobs_user ON public.studio_jobs (user_id);

-- 6. Row Level Security (RLS) Configuration
ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_jobs ENABLE ROW LEVEL SECURITY;

-- 7. Service Role Full Access Policies
DROP POLICY IF EXISTS "Service role full access on creator_profiles" ON public.creator_profiles;
CREATE POLICY "Service role full access on creator_profiles" 
    ON public.creator_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on studio_scripts" ON public.studio_scripts;
CREATE POLICY "Service role full access on studio_scripts" 
    ON public.studio_scripts FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on studio_assets" ON public.studio_assets;
CREATE POLICY "Service role full access on studio_assets" 
    ON public.studio_assets FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on studio_jobs" ON public.studio_jobs;
CREATE POLICY "Service role full access on studio_jobs" 
    ON public.studio_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8. Public Read-Only Access Policy for Creator Profiles (Link-in-bio Showcase)
DROP POLICY IF EXISTS "Public read creator_profiles" ON public.creator_profiles;
CREATE POLICY "Public read creator_profiles"
    ON public.creator_profiles FOR SELECT TO anon, authenticated
    USING (true);

COMMIT;
