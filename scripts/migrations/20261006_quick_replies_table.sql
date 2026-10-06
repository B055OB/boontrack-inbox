-- ==============================================================================
-- MIGRATION: Quick Replies / Canned Responses Preset
-- Author: BoonTrack Core Architecture
-- Date: 2026-10-06
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.quick_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    tenant_slug VARCHAR(128),
    shortcut VARCHAR(64) NOT NULL,
    title VARCHAR(128) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_quick_replies_tenant_shortcut UNIQUE (tenant_id, shortcut)
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_tenant ON public.quick_replies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quick_replies_slug ON public.quick_replies(tenant_slug);
CREATE INDEX IF NOT EXISTS idx_quick_replies_shortcut ON public.quick_replies(shortcut);

-- Enable RLS & Policy
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'quick_replies' AND policyname = 'quick_replies_all_access'
    ) THEN
        CREATE POLICY quick_replies_all_access ON public.quick_replies
            FOR ALL USING (true) WITH CHECK (true);
    END IF;
END
$$;
