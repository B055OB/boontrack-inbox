-- Migration: Create channel_bindings for Context-Capability pattern (§43) & Affiliate Kolam Komunitas
-- Executed on: Supabase PostgreSQL

CREATE TABLE IF NOT EXISTS public.channel_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    binding_id TEXT NOT NULL UNIQUE,
    affiliate_id TEXT,
    tenant_id TEXT,
    tenant_slug TEXT,
    community_source_id TEXT NOT NULL,
    channel_type TEXT NOT NULL CHECK (channel_type IN ('telegram', 'whatsapp')),
    channel_name TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT 'AFFILIATE_CONTEXT' CHECK (context IN ('STORE_CONTEXT', 'AFFILIATE_CONTEXT')),
    capabilities JSONB NOT NULL DEFAULT '["referral_acquisition", "registration_link", "affiliate_notification"]'::jsonb,
    demo_url TEXT NOT NULL DEFAULT 'https://shop.boontrack.com/toko-demo',
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_channel_binding_source UNIQUE (channel_type, community_source_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_bindings_affiliate ON public.channel_bindings(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_channel_bindings_source ON public.channel_bindings(community_source_id);
CREATE INDEX IF NOT EXISTS idx_channel_bindings_context ON public.channel_bindings(context);

-- Enable Row Level Security (RLS)
ALTER TABLE public.channel_bindings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public & authenticated full access on channel_bindings" ON public.channel_bindings;
CREATE POLICY "Public & authenticated full access on channel_bindings"
    ON public.channel_bindings
    FOR ALL
    TO anon, authenticated, service_role
    USING (true)
    WITH CHECK (true);
