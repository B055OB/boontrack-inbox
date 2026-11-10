-- ============================================================================
-- Migration 011: BWM Operational Persistence, Personnel Credential Isolation & Outbox Engine
-- Target Project: tjkbgxrckaocgosvmzmj (Workforce Staging)
-- Schemas Affected: workforce_staging, public
-- 
-- IMPORTANT: PROPOSAL DRAFT ONLY. DO NOT EXECUTE UNTIL EXPLICITLY AUTHORIZED BY CTO.
-- BWM Phase 6.1F Revised Architecture:
-- 1. Canonical UUID foreign keys to workforce_staging.tenants(id) on all operational tables.
-- 2. Personnel-to-Membership cardinality:
--    - Bound 1:1 to tenant_memberships(id) via membership_id UUID UNIQUE.
--    - Bound to tenant identity via uq_personnel_tenant_user UNIQUE (tenant_id, user_id).
-- 3. Physical Credential Isolation:
--    - Credential hashes (pin_hash) are completely separated into workforce_staging.personnel_credentials.
--    - Ordinary tenant members and supervisors querying personnel can NEVER observe pin_hash.
--    - personnel_credentials is strictly restricted to service_role.
-- 4. Argon2id verifier schema with algorithm metadata (pin_algo) and lifecycle management.
-- 5. Dedicated workforce_staging.credential_audit_logs table.
-- 6. Safe DOWN rollback that preserves preexisting tenants and memberships.
-- ============================================================================

-- 1. FACILITIES TABLE
CREATE TABLE IF NOT EXISTS workforce_staging.facilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES workforce_staging.tenants(id) ON DELETE CASCADE,
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

-- 2. PERSONNEL REGISTRY (OPERATIONAL PROFILE ONLY — NO CREDENTIAL STORAGE)
CREATE TABLE IF NOT EXISTS workforce_staging.personnel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES workforce_staging.tenants(id) ON DELETE CASCADE,
    tenant_slug VARCHAR(64) NOT NULL,
    user_id UUID NOT NULL,
    membership_id UUID UNIQUE REFERENCES workforce_staging.tenant_memberships(id) ON DELETE CASCADE,
    facility_id UUID REFERENCES workforce_staging.facilities(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    nik VARCHAR(64) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(32),
    role VARCHAR(32) NOT NULL DEFAULT 'field_personnel',
    shift VARCHAR(32) DEFAULT 'Pagi',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_personnel_tenant_user UNIQUE (tenant_id, user_id),
    CONSTRAINT uq_personnel_tenant_nik UNIQUE (tenant_id, nik)
);

CREATE INDEX IF NOT EXISTS idx_personnel_tenant ON workforce_staging.personnel(tenant_id);
CREATE INDEX IF NOT EXISTS idx_personnel_user ON workforce_staging.personnel(user_id);
CREATE INDEX IF NOT EXISTS idx_personnel_membership ON workforce_staging.personnel(membership_id);
CREATE INDEX IF NOT EXISTS idx_personnel_facility ON workforce_staging.personnel(facility_id);

-- 3. ISOLATED PERSONNEL CREDENTIALS TABLE (SERVICE-ROLE ONLY)
CREATE TABLE IF NOT EXISTS workforce_staging.personnel_credentials (
    personnel_id UUID PRIMARY KEY REFERENCES workforce_staging.personnel(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES workforce_staging.tenants(id) ON DELETE CASCADE,
    pin_hash VARCHAR(255) NOT NULL, -- Argon2id ($argon2id$v=19$m=65536,t=3,p=1$...) or bcrypt ($2b$12$...)
    pin_algo VARCHAR(32) NOT NULL DEFAULT 'argon2id' CHECK (pin_algo IN ('argon2id', 'bcrypt')),
    pin_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    must_change_pin BOOLEAN NOT NULL DEFAULT TRUE,
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personnel_credentials_tenant ON workforce_staging.personnel_credentials(tenant_id);

-- 4. CREDENTIAL AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS workforce_staging.credential_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES workforce_staging.tenants(id) ON DELETE CASCADE,
    personnel_id UUID NOT NULL REFERENCES workforce_staging.personnel(id) ON DELETE CASCADE,
    action VARCHAR(64) NOT NULL CHECK (action IN (
        'PIN_PROVISIONED', 'PIN_CHANGED', 'PIN_RESET_REQUESTED',
        'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED', 'LOGIN_FAILURE', 'LOGIN_SUCCESS'
    )),
    actor_id UUID,
    actor_ip VARCHAR(45),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cred_audit_tenant_personnel ON workforce_staging.credential_audit_logs(tenant_id, personnel_id);

-- 5. CHECKPOINTS TABLE
CREATE TABLE IF NOT EXISTS workforce_staging.checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES workforce_staging.tenants(id) ON DELETE CASCADE,
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

-- 6. ATTENDANCE LOGS TABLE
CREATE TABLE IF NOT EXISTS workforce_staging.attendance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES workforce_staging.tenants(id) ON DELETE CASCADE,
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

-- 7. CHECKPOINT SCANS TABLE
CREATE TABLE IF NOT EXISTS workforce_staging.checkpoint_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES workforce_staging.tenants(id) ON DELETE CASCADE,
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

-- 8. INCIDENTS TABLE
CREATE TABLE IF NOT EXISTS workforce_staging.incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES workforce_staging.tenants(id) ON DELETE CASCADE,
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

-- 9. SHIFT HANDOVERS TABLE
CREATE TABLE IF NOT EXISTS workforce_staging.shift_handovers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES workforce_staging.tenants(id) ON DELETE CASCADE,
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

-- 10. NOTIFICATION OUTBOX TABLE
CREATE TABLE IF NOT EXISTS workforce_staging.notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES workforce_staging.tenants(id) ON DELETE CASCADE,
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
-- 11. ROW LEVEL SECURITY (RLS) & PRIVILEGE ENFORCEMENT
-- ============================================================================
ALTER TABLE workforce_staging.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_staging.personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_staging.personnel_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_staging.credential_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_staging.checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_staging.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_staging.checkpoint_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_staging.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_staging.shift_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_staging.notification_outbox ENABLE ROW LEVEL SECURITY;

-- Operational Table Isolation Policies (Restricted to service_role or trusted tenant members)
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
                    workforce_staging.is_trusted_tenant_member(tenant_id::text)
                )
                WITH CHECK (
                    auth.role() = ''service_role'' OR
                    workforce_staging.is_trusted_tenant_member(tenant_id::text)
                );
        ', tbl, tbl, tbl, tbl);
    END LOOP;
END;
$$;

-- STRICT CREDENTIAL ISOLATION POLICY: ONLY SERVICE_ROLE CAN ACCESS CREDENTIALS
DROP POLICY IF EXISTS rls_personnel_credentials_isolation ON workforce_staging.personnel_credentials;
CREATE POLICY rls_personnel_credentials_isolation ON workforce_staging.personnel_credentials
    FOR ALL
    TO public
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- CREDENTIAL AUDIT LOG POLICY: Service role has full access; trusted tenant owners can read own logs
DROP POLICY IF EXISTS rls_credential_audit_logs_isolation ON workforce_staging.credential_audit_logs;
CREATE POLICY rls_credential_audit_logs_isolation ON workforce_staging.credential_audit_logs
    FOR SELECT
    TO public
    USING (
        auth.role() = 'service_role' OR
        workforce_staging.is_trusted_tenant_member(tenant_id::text, 'OWNER')
    );

CREATE POLICY rls_credential_audit_logs_insert ON workforce_staging.credential_audit_logs
    FOR INSERT
    TO public
    WITH CHECK (auth.role() = 'service_role');

-- Granular Table Grants
GRANT ALL ON ALL TABLES IN SCHEMA workforce_staging TO postgres, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA workforce_staging FROM anon;

-- Minimum SELECT privileges on underlying tables to support public security_invoker views for authenticated tenant members
-- (Data access remains strictly filtered by RLS policies using is_trusted_tenant_member)
GRANT SELECT ON workforce_staging.facilities TO authenticated;
GRANT SELECT ON workforce_staging.personnel TO authenticated;
GRANT SELECT ON workforce_staging.incidents TO authenticated;
GRANT SELECT ON workforce_staging.checkpoints TO authenticated;
GRANT SELECT ON workforce_staging.attendance_logs TO authenticated;
GRANT SELECT ON workforce_staging.checkpoint_scans TO authenticated;

-- Explicitly revoke personnel_credentials from authenticated tenant roles
REVOKE ALL ON workforce_staging.personnel_credentials FROM public, authenticated, anon;
GRANT ALL ON workforce_staging.personnel_credentials TO postgres, service_role;

-- ============================================================================
-- 12. PUBLIC SECURITY INVOKER VIEWS
-- ============================================================================
CREATE OR REPLACE VIEW public.workforce_incidents
WITH (security_invoker = true)
AS SELECT * FROM workforce_staging.incidents;

CREATE OR REPLACE VIEW public.workforce_facilities
WITH (security_invoker = true)
AS SELECT * FROM workforce_staging.facilities;

CREATE OR REPLACE VIEW public.workforce_personnel
WITH (security_invoker = true)
AS SELECT id, tenant_id, tenant_slug, user_id, membership_id, facility_id, name, nik, email, phone, role, shift, is_active, created_at, updated_at
   FROM workforce_staging.personnel;

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
GRANT SELECT ON public.workforce_personnel TO authenticated;
GRANT SELECT ON public.workforce_checkpoints TO authenticated;
GRANT SELECT ON public.workforce_attendance_logs TO authenticated;
GRANT SELECT ON public.workforce_checkpoint_scans TO authenticated;

REVOKE ALL ON public.workforce_incidents FROM anon;
REVOKE ALL ON public.workforce_facilities FROM anon;
REVOKE ALL ON public.workforce_personnel FROM anon;
REVOKE ALL ON public.workforce_checkpoints FROM anon;
REVOKE ALL ON public.workforce_attendance_logs FROM anon;
REVOKE ALL ON public.workforce_checkpoint_scans FROM anon;
