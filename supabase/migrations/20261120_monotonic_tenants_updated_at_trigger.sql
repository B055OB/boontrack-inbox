-- ==============================================================================
-- Migration: 20261120_monotonic_tenants_updated_at_trigger.sql
-- Description: Strictly monotonic updated_at trigger for public.tenants (Global OCC Guard)
-- Work Package: WP3 + ADR-P0-07 + OCC Hardening Integration
-- Layer: 2 (Database Engine Invariant)
-- Authority: CTO Directive (20 November 2026)
-- NOTE: Local File Only — DO NOT EXECUTE AGAINST LIVE/STAGING DATABASE
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.set_tenants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    -- Monotonically advance updated_at using microsecond granularity
    -- Guarantees that rapid back-to-back updates within the same clock tick always advance the token
    NEW.updated_at = GREATEST(
        clock_timestamp(),
        COALESCE(OLD.updated_at + interval '1 microsecond', clock_timestamp())
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenants_set_updated_at ON public.tenants;

CREATE TRIGGER trg_tenants_set_updated_at
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION public.set_tenants_updated_at();

-- Comment documenting OCC invariant
COMMENT ON FUNCTION public.set_tenants_updated_at() IS
'Enforces strictly monotonic advancement of tenants.updated_at on every row update to guarantee Optimistic Concurrency Control (OCC) CAS invariants.';
