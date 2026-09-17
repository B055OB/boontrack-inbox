-- ==============================================================================
-- Migration: Connection Abstraction & Registry Layer (whatsapp_connections)
-- Date: 2026-09-18
-- ==============================================================================

-- 1. Create table whatsapp_connections
CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'EVOLUTION' CHECK (provider IN ('EVOLUTION', 'WABA')),
    instance_name TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'SHARED' CHECK (mode IN ('SHARED', 'DEDICATED')),
    status TEXT NOT NULL DEFAULT 'DISCONNECTED' CHECK (status IN ('CONNECTED', 'CONNECTING', 'DISCONNECTED')),
    phone_number TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_whatsapp_connections_tenant_provider UNIQUE (tenant_id, provider)
);

-- 2. Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_tenant_id 
    ON public.whatsapp_connections (tenant_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_instance_name 
    ON public.whatsapp_connections (instance_name);

-- 3. Automatic updated_at timestamp trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_connections_updated_at ON public.whatsapp_connections;
CREATE TRIGGER trg_whatsapp_connections_updated_at
    BEFORE UPDATE ON public.whatsapp_connections
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 4. Enable Row Level Security (RLS) & Policies
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access
DROP POLICY IF EXISTS "Service role full access on whatsapp_connections" ON public.whatsapp_connections;
CREATE POLICY "Service role full access on whatsapp_connections"
    ON public.whatsapp_connections
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow authenticated and anon to read connection status
DROP POLICY IF EXISTS "Public read access on whatsapp_connections" ON public.whatsapp_connections;
CREATE POLICY "Public read access on whatsapp_connections"
    ON public.whatsapp_connections
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- 5. Seed initial data for tenant "onlineboost"
INSERT INTO public.whatsapp_connections (
    tenant_id,
    provider,
    instance_name,
    mode,
    status,
    phone_number
) VALUES (
    'onlineboost',
    'EVOLUTION',
    'boontrack-gateway',
    'SHARED',
    'CONNECTED',
    '6281237450222'
)
ON CONFLICT (tenant_id, provider) DO UPDATE SET
    instance_name = EXCLUDED.instance_name,
    mode = EXCLUDED.mode,
    status = EXCLUDED.status,
    phone_number = EXCLUDED.phone_number,
    updated_at = now();
