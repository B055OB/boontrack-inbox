-- Migration: Create telegram_group_mappings for multi-tenant Telegram Kolam / Group Bot
-- Executed on: Supabase PostgreSQL

CREATE TABLE IF NOT EXISTS public.telegram_group_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_slug TEXT NOT NULL,
    tenant_id TEXT,
    group_id TEXT NOT NULL,
    group_name TEXT NOT NULL,
    trigger_keyword TEXT NOT NULL DEFAULT '@boon',
    persona_role TEXT NOT NULL DEFAULT 'sales_rep' CHECK (persona_role IN ('sales_rep', 'cs_support', 'custom')),
    custom_prompt TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_telegram_group_tenant UNIQUE (tenant_slug, group_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_group_mappings_tenant ON public.telegram_group_mappings(tenant_slug);
CREATE INDEX IF NOT EXISTS idx_telegram_group_mappings_group ON public.telegram_group_mappings(group_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.telegram_group_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public & authenticated full access on telegram_group_mappings" ON public.telegram_group_mappings;
CREATE POLICY "Public & authenticated full access on telegram_group_mappings"
    ON public.telegram_group_mappings
    FOR ALL
    TO anon, authenticated, service_role
    USING (true)
    WITH CHECK (true);
