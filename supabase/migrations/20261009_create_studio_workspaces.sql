-- ==============================================================================
-- Migration: Create studio_workspaces table (Hybrid Studio Architecture)
-- File: supabase/migrations/20261009_create_studio_workspaces.sql
-- Status: Official Migration / Architecture Contract ADR § 53
-- Dependencies: public.tenants
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.studio_workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    owner_phone TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    render_credits INT NOT NULL DEFAULT 50,
    max_concurrent_jobs INT NOT NULL DEFAULT 2,
    plan_tier TEXT NOT NULL DEFAULT 'STUDIO_STARTER',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_studio_workspaces_tenant ON public.studio_workspaces (tenant_id);
CREATE INDEX IF NOT EXISTS idx_studio_workspaces_phone ON public.studio_workspaces (owner_phone);

ALTER TABLE public.studio_workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on studio_workspaces" ON public.studio_workspaces;
CREATE POLICY "Service role full access on studio_workspaces" 
    ON public.studio_workspaces FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
