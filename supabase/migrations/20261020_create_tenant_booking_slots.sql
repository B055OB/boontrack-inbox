-- Migration: 20261020_create_tenant_booking_slots.sql
-- Description: Create tenant_booking_slots table with RLS and initial slots for Shabu Ajhi

-- 1. Create table tenant_booking_slots
CREATE TABLE IF NOT EXISTS public.tenant_booking_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    slot_name TEXT NOT NULL,
    max_quota INTEGER NOT NULL DEFAULT 4,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_tenant_booking_slots UNIQUE (tenant_id, slot_name)
);

-- 2. Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_tenant_booking_slots_tenant_id ON public.tenant_booking_slots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_booking_slots_active ON public.tenant_booking_slots(tenant_id, is_active);

-- 3. Row Level Security (RLS)
ALTER TABLE public.tenant_booking_slots ENABLE ROW LEVEL SECURITY;

-- Policy for public / anon / authenticated: SELECT only if is_active = true
DROP POLICY IF EXISTS "Public read access on active tenant booking slots" ON public.tenant_booking_slots;
CREATE POLICY "Public read access on active tenant booking slots"
ON public.tenant_booking_slots
FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- Policy for service_role: ALL operations permitted
DROP POLICY IF EXISTS "Service role full access on tenant booking slots" ON public.tenant_booking_slots;
CREATE POLICY "Service role full access on tenant booking slots"
ON public.tenant_booking_slots
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. Seed 4 initial slots for Shabu Ajhi (tenant_id: 70c1ea8c-3557-44af-b131-faae75a8b17f)
INSERT INTO public.tenant_booking_slots (tenant_id, slot_name, max_quota, is_active)
VALUES 
    ('70c1ea8c-3557-44af-b131-faae75a8b17f', '10:00 - 12:00 (Makan Siang Awal)', 4, true),
    ('70c1ea8c-3557-44af-b131-faae75a8b17f', '12:00 - 14:00 (Makan Siang)', 4, true),
    ('70c1ea8c-3557-44af-b131-faae75a8b17f', '16:00 - 18:00 (Sore / Santai Santap)', 4, true),
    ('70c1ea8c-3557-44af-b131-faae75a8b17f', '18:00 - 20:00 (Makan Malam)', 4, true)
ON CONFLICT (tenant_id, slot_name) DO UPDATE 
SET max_quota = EXCLUDED.max_quota,
    is_active = EXCLUDED.is_active;

-- 5. Update logistics configuration in tenant metadata for Shabu Ajhi
UPDATE public.tenants
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{
  "logistics": {
    "primary": "internal_fleet",
    "fallback_provider": "biteship",
    "allowed_couriers": ["lalamove"],
    "max_internal_trip_per_slot": 4
  }
}'::jsonb
WHERE id = '70c1ea8c-3557-44af-b131-faae75a8b17f';

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
