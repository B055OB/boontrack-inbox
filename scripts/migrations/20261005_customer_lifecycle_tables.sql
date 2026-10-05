-- ==============================================================================
-- MIGRATION: Customer Lifecycle Engine (MVP Modular Primitives)
-- Tables: lifecycle_templates, lifecycle_events
-- Author: BoonTrack Core Architecture
-- Date: 2026-10-05
-- ==============================================================================

-- 1. Tabel lifecycle_templates: Menyimpan definisi pesan & jeda waktu per tenant
CREATE TABLE IF NOT EXISTS public.lifecycle_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    vertical TEXT NOT NULL DEFAULT 'CLINIC',
    event_trigger TEXT NOT NULL,
    template_body TEXT NOT NULL,
    delay_minutes INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_tenant_event_delay UNIQUE (tenant_id, event_trigger, delay_minutes)
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_templates_lookup 
ON public.lifecycle_templates(tenant_id, event_trigger, is_active);

-- 2. Tabel lifecycle_events: Antrean event individual terjadwal per pelanggan
CREATE TABLE IF NOT EXISTS public.lifecycle_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, SCHEDULED, PROCESSED, FAILED, CANCELLED
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_events_due 
ON public.lifecycle_events(status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_lifecycle_events_tenant 
ON public.lifecycle_events(tenant_id, customer_phone, event_type);

-- 3. Trigger auto-update updated_at jika ada
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_lifecycle_templates_updated_at') THEN
        CREATE TRIGGER trg_lifecycle_templates_updated_at
        BEFORE UPDATE ON public.lifecycle_templates
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL; -- Ignore if trigger function doesn't exist
END $$;
