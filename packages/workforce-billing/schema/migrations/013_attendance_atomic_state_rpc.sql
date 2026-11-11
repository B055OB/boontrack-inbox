-- ============================================================================
-- Migration 013: Atomic Attendance State Transition, Monotonic Ordering & Deadlock-Free Locking RPC
-- Target Schema: workforce_staging
--
-- CANDIDATE MIGRATION ONLY — DO NOT EXECUTE AGAINST STAGING OR PRODUCTION.
--
-- R3.1 Hardening over R3:
-- 1. Eliminates `created_at DEFAULT NOW()` state-ordering inversion by introducing a
--    database-enforced monotonic per-personnel sequence (`personnel.attendance_version` +
--    `attendance_logs.state_seq NOT NULL`, UNIQUE `(tenant_id, personnel_id, state_seq)`).
--    Latest state lookup orders strictly by `a.state_seq DESC LIMIT 1` (never `created_at`,
--    never client `timestamp`).
-- 2. Enforces strict deadlock-free global row-lock acquisition order matching the FK DAG:
--      Level 1: `workforce_staging.tenants`            (`FOR SHARE`)
--      Level 2: `workforce_staging.tenant_memberships` (`FOR SHARE`)
--      Level 3: `workforce_staging.facilities`         (`FOR SHARE`)
--      Level 4: `workforce_staging.personnel`          (`FOR UPDATE`)
--    No parent lock (`tenants`, `tenant_memberships`, `facilities`) is ever acquired
--    after locking `personnel` (`FOR UPDATE`), preventing AB-BA deadlocks with admin
--    deactivations/revocations/ON DELETE cascades.
-- 3. Re-verifies inside the locked transaction boundary:
--    - Active tenant (`tenants.is_active` & `status`)
--    - Active membership (`tenant_memberships.is_active`) & exact role whitelist
--    - Active personnel (`personnel.is_active`, `membership_id` binding)
--    - Same-tenant active target facility (`facilities.tenant_id`, `facilities.is_active`)
--    - Role-scoped facility assignment (`field_personnel` bound to `personnel.facility_id`;
--      `supervisor` / `master_reseller` permitted cross-facility strictly within same tenant)
-- 4. Preserves explicit privilege model: `SECURITY INVOKER` + `SET search_path = pg_catalog, workforce_staging`,
--    `42501` runtime caller assertion, `REVOKE ALL FROM PUBLIC, anon, authenticated`,
--    `GRANT EXECUTE TO postgres, service_role`, and Migration 011 SELECT-only `authenticated` ACL.
-- ============================================================================

GRANT USAGE ON SCHEMA workforce_staging TO service_role;

-- 1. Monotonic per-personnel attendance state sequence columns & constraints
ALTER TABLE workforce_staging.personnel
    ADD COLUMN IF NOT EXISTS attendance_version BIGINT NOT NULL DEFAULT 0;

ALTER TABLE workforce_staging.attendance_logs
    ADD COLUMN IF NOT EXISTS state_seq BIGINT;

WITH numbered AS (
    SELECT a.id,
           row_number() OVER (
               PARTITION BY a.tenant_id, a.personnel_id
               ORDER BY a.created_at ASC, a.timestamp ASC, a.id ASC
           ) AS seq
    FROM workforce_staging.attendance_logs a
    WHERE a.state_seq IS NULL
)
UPDATE workforce_staging.attendance_logs a
SET state_seq = n.seq
FROM numbered n
WHERE a.id = n.id;

UPDATE workforce_staging.personnel p
SET attendance_version = GREATEST(p.attendance_version, sub.max_seq)
FROM (
    SELECT tenant_id, personnel_id, COALESCE(MAX(state_seq), 0) AS max_seq
    FROM workforce_staging.attendance_logs
    GROUP BY tenant_id, personnel_id
) sub
WHERE p.id = sub.personnel_id
  AND p.tenant_id = sub.tenant_id;

ALTER TABLE workforce_staging.attendance_logs
    ALTER COLUMN state_seq SET NOT NULL;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_attendance_personnel_state_seq'
    ) THEN
        ALTER TABLE workforce_staging.attendance_logs
            ADD CONSTRAINT uq_attendance_personnel_state_seq UNIQUE (tenant_id, personnel_id, state_seq);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_attendance_state_seq_positive'
    ) THEN
        ALTER TABLE workforce_staging.attendance_logs
            ADD CONSTRAINT chk_attendance_state_seq_positive CHECK (state_seq >= 1);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_tenant_personnel_state_seq
    ON workforce_staging.attendance_logs(tenant_id, personnel_id, state_seq DESC);

-- Fallback trigger ensuring even direct SQL service_role inserts assign a monotonic state_seq
CREATE OR REPLACE FUNCTION workforce_staging.assign_attendance_state_seq()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, workforce_staging
AS $$
DECLARE
    v_next_seq BIGINT;
BEGIN
    IF NEW.state_seq IS NULL THEN
        UPDATE workforce_staging.personnel
        SET attendance_version = attendance_version + 1
        WHERE id = NEW.personnel_id
          AND tenant_id = NEW.tenant_id
        RETURNING attendance_version INTO v_next_seq;

        IF v_next_seq IS NULL THEN
            RAISE EXCEPTION 'PERSONNEL_NOT_PROVISIONED_FOR_ATTENDANCE_SEQ: personnel % not found in tenant %', NEW.personnel_id, NEW.tenant_id
                USING ERRCODE = '23503';
        END IF;

        NEW.state_seq := v_next_seq;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_logs_assign_state_seq ON workforce_staging.attendance_logs;
CREATE TRIGGER trg_attendance_logs_assign_state_seq
    BEFORE INSERT ON workforce_staging.attendance_logs
    FOR EACH ROW
    EXECUTE FUNCTION workforce_staging.assign_attendance_state_seq();

-- 2. Concurrency-Safe Atomic RPC
CREATE OR REPLACE FUNCTION workforce_staging.record_attendance_atomic(
    p_id UUID,
    p_tenant_id UUID,
    p_personnel_id UUID,
    p_facility_id UUID,
    p_type TEXT,
    p_timestamp TIMESTAMPTZ,
    p_latitude NUMERIC(10, 7),
    p_longitude NUMERIC(10, 7),
    p_geofence_verified BOOLEAN,
    p_biometric_mode TEXT,
    p_photo_url TEXT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, workforce_staging
AS $$
DECLARE
    -- Non-locking identity/facility lookup hints (resolved before canonical lock order 1 -> 2 -> 3 -> 4)
    v_hint_user_id UUID;
    v_hint_facility_id UUID;
    v_hint_target_facility_id UUID;

    -- Locked entity state
    v_tenant_found BOOLEAN := FALSE;
    v_tenant RECORD;
    v_membership_found BOOLEAN := FALSE;
    v_membership RECORD;
    v_facility_found BOOLEAN := FALSE;
    v_facility RECORD;
    v_personnel_found BOOLEAN := FALSE;
    v_personnel RECORD;

    -- Resolved authorization & transition state
    v_issued_role TEXT;
    v_effective_facility_id UUID;
    v_existing workforce_staging.attendance_logs%ROWTYPE;
    v_inserted workforce_staging.attendance_logs%ROWTYPE;
    v_latest_type TEXT;
    v_current_state TEXT;
    v_next_seq BIGINT;
BEGIN
    -- Step 0: Defense-in-depth caller authorization check
    IF NOT (
        auth.role() = 'service_role'
        OR current_user IN ('service_role', 'postgres')
    ) THEN
        RAISE EXCEPTION 'UNAUTHORIZED_RPC_CALLER: attendance mutation RPC requires service_role'
            USING ERRCODE = '42501';
    END IF;

    -- Step 1: Parameter sanity checks
    IF p_type IS NULL OR p_type NOT IN ('CLOCK_IN', 'CLOCK_OUT') THEN
        RAISE EXCEPTION 'INVALID_ATTENDANCE_TYPE: must be CLOCK_IN or CLOCK_OUT'
            USING ERRCODE = '22023';
    END IF;

    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 128 THEN
        RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY: non-empty key up to 128 chars required'
            USING ERRCODE = '22023';
    END IF;

    -- Non-locking hint read so all row locks can be acquired strictly in deadlock-free DAG order:
    --   1. tenants (FOR SHARE)
    --   2. tenant_memberships (FOR SHARE)
    --   3. facilities (FOR SHARE)
    --   4. personnel (FOR UPDATE)
    SELECT p.user_id, p.facility_id
    INTO v_hint_user_id, v_hint_facility_id
    FROM workforce_staging.personnel p
    WHERE p.id = p_personnel_id
      AND p.tenant_id = p_tenant_id;

    v_hint_target_facility_id := COALESCE(p_facility_id, v_hint_facility_id);

    -- LOCK LEVEL 1: workforce_staging.tenants (FOR SHARE)
    SELECT t.is_active, lower(coalesce(t.status, 'active')) AS status
    INTO v_tenant
    FROM workforce_staging.tenants t
    WHERE t.id = p_tenant_id
    FOR SHARE;
    v_tenant_found := FOUND;

    -- LOCK LEVEL 2: workforce_staging.tenant_memberships (FOR SHARE)
    IF v_hint_user_id IS NOT NULL THEN
        SELECT tm.id, tm.user_id, tm.tenant_id, tm.role, tm.is_active
        INTO v_membership
        FROM workforce_staging.tenant_memberships tm
        WHERE tm.tenant_id = p_tenant_id::text
          AND tm.user_id = v_hint_user_id
        LIMIT 1
        FOR SHARE;
        v_membership_found := FOUND;
    END IF;

    -- LOCK LEVEL 3: workforce_staging.facilities (FOR SHARE)
    IF v_hint_target_facility_id IS NOT NULL THEN
        SELECT f.id, f.tenant_id, f.is_active
        INTO v_facility
        FROM workforce_staging.facilities f
        WHERE f.id = v_hint_target_facility_id
        FOR SHARE;
        v_facility_found := FOUND;
    END IF;

    -- LOCK LEVEL 4: workforce_staging.personnel (FOR UPDATE)
    SELECT p.id, p.tenant_id, p.user_id, p.membership_id, p.facility_id, p.is_active, p.attendance_version
    INTO v_personnel
    FROM workforce_staging.personnel p
    WHERE p.id = p_personnel_id
      AND p.tenant_id = p_tenant_id
    FOR UPDATE;
    v_personnel_found := FOUND;

    -- Re-validate active tenant inside transaction locks
    IF NOT v_tenant_found
       OR v_tenant.is_active IS FALSE
       OR v_tenant.status IN ('suspended', 'inactive', 'revoked', 'disabled') THEN
        RETURN jsonb_build_object('outcome', 'TENANT_INACTIVE');
    END IF;

    -- Re-validate canonical personnel row inside FOR UPDATE lock
    IF NOT v_personnel_found THEN
        RETURN jsonb_build_object('outcome', 'PERSONNEL_NOT_PROVISIONED');
    END IF;

    IF v_personnel.is_active IS NOT TRUE THEN
        RETURN jsonb_build_object('outcome', 'PERSONNEL_INACTIVE');
    END IF;

    -- Re-validate exact membership row locked at Level 2 against locked personnel
    IF NOT v_membership_found
       OR v_membership.is_active IS NOT TRUE
       OR v_membership.user_id IS DISTINCT FROM v_personnel.user_id
       OR (v_personnel.membership_id IS NOT NULL AND v_personnel.membership_id IS DISTINCT FROM v_membership.id) THEN
        RETURN jsonb_build_object('outcome', 'MEMBERSHIP_REVOKED');
    END IF;

    -- Exact case-insensitive membership role mapping (no substring heuristics, fail closed)
    v_issued_role := CASE lower(btrim(coalesce(v_membership.role, '')))
        WHEN 'field_personnel' THEN 'field_personnel'
        WHEN 'operator' THEN 'field_personnel'
        WHEN 'cs' THEN 'field_personnel'
        WHEN 'supervisor' THEN 'supervisor'
        WHEN 'owner' THEN 'master_reseller'
        WHEN 'merchant' THEN 'master_reseller'
        WHEN 'master_reseller' THEN 'master_reseller'
        ELSE NULL
    END;

    IF v_issued_role IS NULL THEN
        RETURN jsonb_build_object('outcome', 'UNRECOGNIZED_MEMBERSHIP_ROLE');
    END IF;

    -- Resolve target facility inside Lock Level 4 and verify consistency with Lock Level 3
    v_effective_facility_id := COALESCE(p_facility_id, v_personnel.facility_id);
    IF v_effective_facility_id IS NULL THEN
        RETURN jsonb_build_object('outcome', 'FACILITY_REQUIRED');
    END IF;

    -- Never re-lock facilities out-of-order after locking personnel; reject concurrently shifted implicit target
    IF p_facility_id IS NULL AND v_effective_facility_id IS DISTINCT FROM v_hint_target_facility_id THEN
        RETURN jsonb_build_object('outcome', 'FACILITY_ASSIGNMENT_FORBIDDEN');
    END IF;

    IF NOT v_facility_found THEN
        RETURN jsonb_build_object('outcome', 'FACILITY_NOT_FOUND');
    END IF;

    IF v_facility.tenant_id <> p_tenant_id THEN
        RETURN jsonb_build_object('outcome', 'CROSS_TENANT_FACILITY_FORBIDDEN');
    END IF;

    IF v_facility.is_active IS NOT TRUE THEN
        RETURN jsonb_build_object('outcome', 'FACILITY_INACTIVE');
    END IF;

    -- Authoritative database-side facility assignment policy enforcement
    IF v_issued_role NOT IN ('supervisor', 'master_reseller') THEN
        IF v_personnel.facility_id IS NULL OR v_personnel.facility_id IS DISTINCT FROM v_facility.id THEN
            RETURN jsonb_build_object('outcome', 'FACILITY_ASSIGNMENT_FORBIDDEN');
        END IF;
    END IF;

    -- Step 5: Tenant-scoped idempotency lookup BEFORE state transition validation
    SELECT a.*
    INTO v_existing
    FROM workforce_staging.attendance_logs a
    WHERE a.tenant_id = p_tenant_id
      AND a.idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'outcome', 'IDEMPOTENCY_EXISTING',
            'row', to_jsonb(v_existing)
        );
    END IF;

    -- Step 6: Monotonic state sequence ordering (never created_at DEFAULT NOW(), never client timestamp)
    SELECT a.type
    INTO v_latest_type
    FROM workforce_staging.attendance_logs a
    WHERE a.tenant_id = p_tenant_id
      AND a.personnel_id = p_personnel_id
    ORDER BY a.state_seq DESC
    LIMIT 1;

    v_current_state := coalesce(v_latest_type, 'INITIAL');

    IF v_current_state IN ('INITIAL', 'CLOCK_OUT') AND p_type <> 'CLOCK_IN' THEN
        RETURN jsonb_build_object(
            'outcome', 'INVALID_STATE_TRANSITION',
            'current_state', v_current_state,
            'attempted_type', p_type,
            'reason', format(
                'Transisi absensi ditolak: state ''%s'' tidak dapat berpindah ke ''%s''.',
                v_current_state,
                p_type
            )
        );
    END IF;

    IF v_current_state = 'CLOCK_IN' AND p_type <> 'CLOCK_OUT' THEN
        RETURN jsonb_build_object(
            'outcome', 'INVALID_STATE_TRANSITION',
            'current_state', v_current_state,
            'attempted_type', p_type,
            'reason', format(
                'Transisi absensi ditolak: state ''%s'' tidak dapat berpindah ke ''%s'' (duplicate CLOCK_IN ditolak).',
                v_current_state,
                p_type
            )
        );
    END IF;

    -- Step 7: Advance canonical per-personnel sequence after acquiring FOR UPDATE lock & insert atomically
    UPDATE workforce_staging.personnel
    SET attendance_version = attendance_version + 1
    WHERE id = p_personnel_id
      AND tenant_id = p_tenant_id
    RETURNING attendance_version INTO v_next_seq;

    BEGIN
        INSERT INTO workforce_staging.attendance_logs (
            id,
            tenant_id,
            personnel_id,
            facility_id,
            type,
            timestamp,
            latitude,
            longitude,
            geofence_verified,
            biometric_mode,
            photo_url,
            idempotency_key,
            state_seq,
            created_at
        )
        VALUES (
            p_id,
            p_tenant_id,
            p_personnel_id,
            v_facility.id,
            p_type,
            p_timestamp,
            p_latitude,
            p_longitude,
            p_geofence_verified,
            p_biometric_mode,
            p_photo_url,
            p_idempotency_key,
            v_next_seq,
            pg_catalog.clock_timestamp()
        )
        RETURNING * INTO v_inserted;
    EXCEPTION
        WHEN unique_violation THEN
            SELECT a.*
            INTO v_existing
            FROM workforce_staging.attendance_logs a
            WHERE a.tenant_id = p_tenant_id
              AND a.idempotency_key = p_idempotency_key
            LIMIT 1;

            IF FOUND THEN
                RETURN jsonb_build_object(
                    'outcome', 'IDEMPOTENCY_EXISTING',
                    'row', to_jsonb(v_existing)
                );
            END IF;
            RAISE;
    END;

    RETURN jsonb_build_object(
        'outcome', 'CREATED',
        'previous_state', v_current_state,
        'state_seq', v_next_seq,
        'row', to_jsonb(v_inserted)
    );
END;
$$;

REVOKE ALL ON FUNCTION workforce_staging.record_attendance_atomic(
    UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION workforce_staging.record_attendance_atomic(
    UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, TEXT
) TO postgres, service_role;
