-- ============================================================================
-- Migration 015: Attendance Actor Binding RPC (HIGH-03) & Fail-Closed RLS Role Allowlist (HIGH-02)
-- Target Schema: workforce_staging
--
-- CANDIDATE FORWARD MIGRATION ONLY — DO NOT EXECUTE AGAINST STAGING OR PRODUCTION.
-- Preserves historical Migration 010 and Migration 013 files 100% untouched.
--
-- 1. HIGH-03 Remediation (Attendance Actor Binding):
--    - Revokes all privileges and drops the legacy 12-argument overload of
--      `workforce_staging.record_attendance_atomic` so no caller can omit
--      `p_expected_user_id` or trigger PostgREST function overload ambiguity.
--    - Defines the 13-argument `workforce_staging.record_attendance_atomic`
--      with `p_expected_user_id UUID` derived strictly from the verified server
--      session (`auth.session.userId`).
--    - Locks `workforce_staging.tenant_memberships` (`FOR SHARE`) at Lock Level 2
--      using `(p_tenant_id, p_expected_user_id)` directly (no `v_hint_user_id` read),
--      locks `workforce_staging.personnel` (`FOR UPDATE`) at Lock Level 4, and
--      enforces 3-way identity binding (`p_expected_user_id == v_membership.user_id == v_personnel.user_id`
--      and `v_personnel.membership_id == v_membership.id`).
--
-- 2. HIGH-02 Remediation (Fail-Closed RLS Role Allowlist & Reflective Fallback Removal):
--    - Replaces `workforce_staging.is_trusted_tenant_member(TEXT, TEXT)` so that:
--      (a) 1-argument operational/read checks (`required_role IS NULL`) require
--          `v_member_role` to be in the explicit 7-role allowlist:
--          `('OWNER', 'MERCHANT', 'OPERATOR', 'CS', 'master_reseller', 'supervisor', 'field_personnel')`.
--          Unrecognized roles (e.g., `'constructor'`, `'__proto__'`, `'guest'`) return `FALSE`.
--      (b) 2-argument role checks preserve the pure Commerce hierarchy
--          (`OWNER > MERCHANT > OPERATOR > CS`) and eliminate the reflective
--          fallback (`ELSE RETURN FALSE`).
-- ============================================================================

-- ============================================================================
-- PART 1: HIGH-03 — Attendance Actor Binding (13-Argument RPC)
-- ============================================================================

DO $$
BEGIN
    IF to_regprocedure(
        'workforce_staging.record_attendance_atomic(uuid,uuid,uuid,uuid,text,timestamptz,numeric,numeric,boolean,text,text,text)'
    ) IS NOT NULL THEN
        REVOKE ALL ON FUNCTION workforce_staging.record_attendance_atomic(
            UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, TEXT
        ) FROM PUBLIC, anon, authenticated, service_role, postgres;
    END IF;
END $$;

DROP FUNCTION IF EXISTS workforce_staging.record_attendance_atomic(
    UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION workforce_staging.record_attendance_atomic(
    p_id UUID,
    p_tenant_id UUID,
    p_personnel_id UUID,
    p_expected_user_id UUID,
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
    -- Non-locking facility lookup hints (resolved before canonical lock order 1 -> 2 -> 3 -> 4)
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
    IF p_expected_user_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_EXPECTED_USER_ID: authenticated session user UUID is required'
            USING ERRCODE = '22023';
    END IF;

    IF p_type IS NULL OR p_type NOT IN ('CLOCK_IN', 'CLOCK_OUT') THEN
        RAISE EXCEPTION 'INVALID_ATTENDANCE_TYPE: must be CLOCK_IN or CLOCK_OUT'
            USING ERRCODE = '22023';
    END IF;

    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 128 THEN
        RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY: non-empty key up to 128 chars required'
            USING ERRCODE = '22023';
    END IF;

    -- Non-locking hint read ONLY for facility_id so all row locks can be acquired strictly in deadlock-free DAG order:
    --   1. tenants            (FOR SHARE)
    --   2. tenant_memberships (FOR SHARE on p_expected_user_id)
    --   3. facilities         (FOR SHARE)
    --   4. personnel          (FOR UPDATE)
    SELECT p.facility_id
    INTO v_hint_facility_id
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
    -- Bound strictly to the authenticated session user p_expected_user_id
    SELECT tm.id, tm.user_id, tm.tenant_id, tm.role, tm.is_active
    INTO v_membership
    FROM workforce_staging.tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id::text
      AND tm.user_id = p_expected_user_id
    LIMIT 1
    FOR SHARE;
    v_membership_found := FOUND;

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

    -- Re-validate exact 3-way actor binding (p_expected_user_id <-> v_membership <-> v_personnel)
    IF NOT v_membership_found
       OR v_membership.is_active IS NOT TRUE
       OR v_membership.user_id IS DISTINCT FROM p_expected_user_id
       OR v_personnel.user_id IS DISTINCT FROM p_expected_user_id
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
    UUID, UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION workforce_staging.record_attendance_atomic(
    UUID, UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, TEXT
) TO postgres, service_role;

-- ============================================================================
-- PART 2: HIGH-02 — Fail-Closed RLS Role Allowlist & Reflective Fallback Removal
-- ============================================================================

CREATE OR REPLACE FUNCTION workforce_staging.is_trusted_tenant_member(
    target_tenant_id TEXT,
    required_role TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = workforce_staging, public
AS $$
DECLARE
    v_uid UUID;
    v_role TEXT;
    v_active_role TEXT;
    v_member_role TEXT;
    v_is_active BOOLEAN;
    v_jwt_tenant_id TEXT;
BEGIN
    -- 1. Service role or superuser administrative SSOT bypasses RLS
    v_role := auth.role();
    IF v_role = 'service_role' THEN
        RETURN TRUE;
    END IF;

    -- Direct postgres superuser connection without an assumed unprivileged role bypasses RLS
    v_active_role := current_setting('role', true);
    IF (v_active_role IS NULL OR v_active_role = 'none' OR v_active_role = 'postgres')
       AND session_user = 'postgres' THEN
        RETURN TRUE;
    END IF;

    -- 2. Extract verified user UUID
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 3. Check active database membership (AUTHORITATIVE SSOT)
    SELECT tm.role, tm.is_active
    INTO v_member_role, v_is_active
    FROM workforce_staging.tenant_memberships tm
    WHERE tm.user_id = v_uid
      AND (tm.tenant_id = target_tenant_id OR tm.tenant_slug = target_tenant_id)
    LIMIT 1;

    IF v_member_role IS NULL OR v_is_active IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    -- 4. Check if JWT claims specify a tenant selector, and verify it matches target
    BEGIN
        v_jwt_tenant_id := auth.jwt() -> 'app_metadata' ->> 'tenant_id';
        IF v_jwt_tenant_id IS NOT NULL AND v_jwt_tenant_id != target_tenant_id THEN
            RETURN FALSE;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Ignore malformed JSON
    END;

    -- 5. HIGH-02 Remediation: Explicit 7-Role Allowlist & Pure Commerce Hierarchy
    -- 5a. When required_role IS NULL (1-argument operational SELECT & baseline read helper):
    --     Strictly enforce the 7-role allowlist across Commerce and BWM Operational domains.
    --     Unrecognized roles (e.g., 'constructor', '__proto__', 'guest', '') fail closed (FALSE).
    IF required_role IS NULL THEN
        RETURN v_member_role IN (
            'OWNER',
            'MERCHANT',
            'OPERATOR',
            'CS',
            'master_reseller',
            'supervisor',
            'field_personnel'
        );
    END IF;

    -- 5b. Pure Commerce Role Hierarchy for 2-argument checks:
    --     BWM operational roles ('master_reseller', 'supervisor', 'field_personnel') do NOT
    --     inherit Commerce mutation or confidential-column privileges.
    --     Reflective fallback is strictly eliminated (ELSE RETURN FALSE).
    IF required_role = 'OWNER' THEN
        RETURN v_member_role = 'OWNER';
    ELSIF required_role = 'MERCHANT' THEN
        RETURN v_member_role IN ('OWNER', 'MERCHANT');
    ELSIF required_role = 'OPERATOR' THEN
        RETURN v_member_role IN ('OWNER', 'MERCHANT', 'OPERATOR');
    ELSIF required_role = 'CS' THEN
        RETURN v_member_role IN ('OWNER', 'MERCHANT', 'OPERATOR', 'CS');
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION workforce_staging.is_trusted_tenant_member(
    target_tenant_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = workforce_staging, public
AS $$
    SELECT workforce_staging.is_trusted_tenant_member(target_tenant_id, NULL::TEXT);
$$;

NOTIFY pgrst, 'reload schema';

