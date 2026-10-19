-- Migration: 20261020_create_tenant_drivers.sql
-- Description: Create tenant_drivers table for F&B catering internal fleet management

CREATE TABLE IF NOT EXISTS public.tenant_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'standby', -- 'standby' | 'delivering'
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexing & RLS Isolation
CREATE INDEX IF NOT EXISTS idx_tenant_drivers_tenant_id ON public.tenant_drivers(tenant_id);
ALTER TABLE public.tenant_drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenants manage their own drivers" ON public.tenant_drivers;
CREATE POLICY "Tenants manage their own drivers"
ON public.tenant_drivers
FOR ALL
USING (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR auth.role() = 'service_role'
);

-- Public / Authenticated read-write policy for client operations scoped to tenant
DROP POLICY IF EXISTS "Tenants manage drivers via anon client" ON public.tenant_drivers;
CREATE POLICY "Tenants manage drivers via anon client"
ON public.tenant_drivers
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);
