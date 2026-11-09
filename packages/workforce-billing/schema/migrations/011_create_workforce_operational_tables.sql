-- ============================================================================
-- Migration 011: BWM Operational Persistence & Outbox Engine
-- Target Project: tjkbgxrckaocgosvmzmj (Workforce Staging)
-- Schemas Affected: workforce_staging, public
-- 
-- IMPORTANT: PROPOSAL DRAFT ONLY. DO NOT EXECUTE UNTIL SEPARATELY APPROVED BY CTO.
-- ============================================================================

-- 1. FACILITIES TABLE
CREATE TABLE IF NOT EXISTS workforce_staging.facilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    tenant_slug VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(64) NOT NULL,
    address TEXT,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    geofence_radius_m INTEGER NOT NULL DEFAULT 100,
    sla_minutes INTEGER NOT NULL DEFAULT 60,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_facilities_tenant_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_facilities_tenant ON workforce_staging.facilities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_facilities_slug ON workforce_staging.facilities(tenant_slug);

-- 2. PERSONNEL REGISTRY TABLE
CREATE TABLE IF NOT EXISTS workforce_staging.personnel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    tenant_slug VARCHAR(64) NOT NULL,
    facility_id UUID REFERENCES workforce_staging.facilities(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    nik VARCHAR(64) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(32),
    role VARCHAR(32) NOT NULL DEFAULT 'field_personnel',
    shift VARCHAR(32) DEFAULT 'Pagi',
    pin_hash VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_personnel_tenant_nik UNIQUE (tenant_id, nik)
);

CREATE INDEX IF NOT EXISTS idx_personnel_tenant ON workforce_staging.personnel(tenant_id);
CREATE INDEX IF NOT EXISTS idx_personnel_facility ON workforce_staging.personnel(facility_id);

-- 3. CHECKPOINTS TABLE
CREATE TABLE IF NOT EXISTS workforce_staging.checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    facility_id UUID NOT NULL REFERENCES workforce_staging.facilities(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(64) NOT NULL,
    zone VARCHAR(64) NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    qr_token VARCHAR(255) NOT NULL,
    sla_minutes INTEGER NOT NULL DEFAULT 60,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_checkpoints_tenant_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_tenant ON workforce_staging.checkpoints(tenant_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_facility ON workforce_staging.checkpoints(facility_id);

-- 4. ATTENDANCE LOGS TABLE
CREATE TABLE IF NOT EXISTS workforce_staging.attendance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    personnel_id UUID NOT NULL REFERENCES workforce_staging.personnel(id) ON DELETE CASCADE,
    facility_id UUID REFERENCES workforce_staging.facilities(id),
    type VARCHAR(16) NOT NULL CHECK (type IN ('CLOCK_IN', 'CLOCK_OUT')),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    geofence_verified BOOLEAN NOT NULL DEFAULT FALSE,
    biometric_mode VARCHAR(32) NOT NULL DEFAULT 'CAMERA_PREVIEW_VERIFIED',
    photo_url TEXT,
    idempotency_key VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_attendance_tenant_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_attendance_tenant_personnel ON workforce_staging.attendance_logs(tenant_id, personnel_id);

-- 5. CHECKPOINT SCANS TABLE
CREATE TABLE IF NOT EXISTS workforce_staging.checkpoint_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    checkpoint_id UUID NOT NULL REFERENCES workforce_staging.checkpoints(id) ON DELETE CASCADE,
    personnel_id UUID NOT NULL REFERENCES workforce_staging.personnel(id) ON DELETE CASCADE,
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    distance_m NUMERIC(10, 2),
    status VARCHAR(32) NOT NULL DEFAULT 'VERIFIED',
    idempotency_key VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_checkpoint_scan_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_scans_tenant ON workforce_staging.checkpoint_scans(tenant_id);

-- 6. INCIDENTS TABLE
CREATE TABLE IF NOT EXISTS workforce_staging.incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    reporter_id UUID REFERENCES workforce_staging.personnel(id) ON DELETE SET NULL,
    facility_id UUID REFERENCES workforce_staging.facilities(id) ON DELETE SET NULL,
    site_name VARCHAR(255) NOT NULL,
    location_point VARCHAR(255) NOT NULL,
    reporter_name VARCHAR(255) NOT NULL,
    reporter_nip VARCHAR(64) NOT NULL,
    urgency VARCHAR(32) NOT NULL CHECK (urgency IN ('Perlu Tindak Lanjut', 'Darurat')),
    description TEXT NOT NULL,
    photo_url TEXT,
    gps_lat NUMERIC(10, 7),
    gps_lon NUMERIC(10, 7),
    gps_accuracy_m NUMERIC(10, 2),
    status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    idempotency_key VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_incidents_tenant_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_incidents_tenant ON workforce_staging.incidents(tenant_id);

-- 7. SHIFT HANDOVERS TABLE
CREATE TABLE IF NOT EXISTS workforce_staging.shift_handovers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    facility_id UUID REFERENCES workforce_staging.facilities(id),
    outgoing_personnel_id UUID NOT NULL REFERENCES workforce_staging.personnel(id),
    incoming_personnel_id UUID REFERENCES workforce_staging.personnel(id),
    shift_name VARCHAR(64) NOT NULL,
    gear_status JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED',
    idempotency_key VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_handovers_tenant_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_handovers_tenant ON workforce_staging.shift_handovers(tenant_id);

-- 8. NOTIFICATION OUTBOX TABLE
CREATE TABLE IF NOT EXISTS workforce_staging.notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    channel VARCHAR(32) NOT NULL DEFAULT 'WHATSAPP',
    destination VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'SIMULATED_TEST')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    idempotency_key VARCHAR(128) NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_notification_outbox_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_outbox_tenant_status ON workforce_staging.notification_outbox(tenant_id, status);

-- ============================================================================
-- 9. ROW LEVEL SECURITY (RLS) & GRANTS
-- ============================================================================
ALTER TABLE workforce_staging.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_staging.personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_staging.checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_staging.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_staging.checkpoint_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_staging.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_staging.shift_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_staging.notification_outbox ENABLE ROW LEVEL SECURITY;

-- Isolation Policy for Service Role & Trusted Members
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'facilities', 'personnel', 'checkpoints', 'attendance_logs',
        'checkpoint_scans', 'incidents', 'shift_handovers', 'notification_outbox'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('
            DROP POLICY IF EXISTS rls_%I_isolation ON workforce_staging.%I;
            CREATE POLICY rls_%I_isolation ON workforce_staging.%I
                FOR ALL
                TO public
                USING (
                    auth.role() = ''service_role'' OR
                    workforce_staging.is_trusted_tenant_member(tenant_id)
                )
                WITH CHECK (
                    auth.role() = ''service_role'' OR
                    workforce_staging.is_trusted_tenant_member(tenant_id)
                );
        ', tbl, tbl, tbl, tbl);
    END LOOP;
END;
$$;

-- Grant permissions to postgres and service_role; revoke from anon
GRANT ALL ON ALL TABLES IN SCHEMA workforce_staging TO postgres, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA workforce_staging FROM anon;

-- ============================================================================
-- 10. PUBLIC SECURITY INVOKER VIEWS
-- ============================================================================
CREATE OR REPLACE VIEW public.workforce_incidents
WITH (security_invoker = true)
AS SELECT * FROM workforce_staging.incidents;

CREATE OR REPLACE VIEW public.workforce_facilities
WITH (security_invoker = true)
AS SELECT * FROM workforce_staging.facilities;

CREATE OR REPLACE VIEW public.workforce_checkpoints
WITH (security_invoker = true)
AS SELECT * FROM workforce_staging.checkpoints;

CREATE OR REPLACE VIEW public.workforce_attendance_logs
WITH (security_invoker = true)
AS SELECT * FROM workforce_staging.attendance_logs;

CREATE OR REPLACE VIEW public.workforce_checkpoint_scans
WITH (security_invoker = true)
AS SELECT * FROM workforce_staging.checkpoint_scans;

GRANT SELECT ON public.workforce_incidents TO authenticated;
GRANT SELECT ON public.workforce_facilities TO authenticated;
GRANT SELECT ON public.workforce_checkpoints TO authenticated;
GRANT SELECT ON public.workforce_attendance_logs TO authenticated;
GRANT SELECT ON public.workforce_checkpoint_scans TO authenticated;
REVOKE ALL ON public.workforce_incidents FROM anon;
REVOKE ALL ON public.workforce_facilities FROM anon;
REVOKE ALL ON public.workforce_checkpoints FROM anon;
REVOKE ALL ON public.workforce_attendance_logs FROM anon;
REVOKE ALL ON public.workforce_checkpoint_scans FROM anon;
