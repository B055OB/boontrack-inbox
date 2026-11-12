-- ============================================================================
-- Migration 014: Atomic Checkpoint Scan Authorization, Actor Binding & Deadlock-Free Locking RPC
-- Target Schema: workforce_staging
--
-- CANDIDATE MIGRATION ONLY — DO NOT EXECUTE AGAINST STAGING OR PRODUCTION.
--
-- HIGH-01 Remediation (Post-R3.1 Security Follow-Up — Round 2 Hardened):
-- 1. Eliminates the application-layer TOCTOU window between authority/geofence
--    reads and `INSERT INTO workforce_staging.checkpoint_scans` by executing
--    in-transaction row locking, authenticated actor binding verification,
--    authority re-validation, fresh geofence evaluation, idempotency lookup,
--    and scan persistence inside a single ACID stored procedure:
--    `workforce_staging.record_checkpoint_scan_atomic`.
-- 2. Enforces strict deadlock-free global row-lock acquisition order consistent
--    with Migration 013/015 (`workforce_staging.record_attendance_atomic`):
--      Level 1:   `workforce_staging.tenants`            (`FOR SHARE`)
--      Level 2:   `workforce_staging.tenant_memberships` (`FOR SHARE` on `p_expected_user_id`)
--      Level 3:   `workforce_staging.facilities`         (`FOR SHARE`)
--      Level 3.5: `workforce_staging.checkpoints`        (`FOR SHARE`)
--      Level 4:   `workforce_staging.personnel`          (`FOR UPDATE`)
--    No parent lock (`tenants`, `tenant_memberships`, `facilities`, `checkpoints`)
--    is ever acquired after locking `personnel` (`FOR UPDATE`).
-- 3. Binds the transaction strictly to the authenticated server session actor
--    (`p_expected_user_id` derived from `auth.session.userId`, never client payload):
--    - Locks `tenant_memberships` directly for `(p_tenant_id, p_expected_user_id)` at Level 2
--    - Locks `personnel` (`FOR UPDATE`) at Level 4
--    - Rejects with `MEMBERSHIP_REVOKED` if `v_personnel.user_id IS DISTINCT FROM p_expected_user_id`,
--      `v_membership.user_id IS DISTINCT FROM p_expected_user_id`, or
--      `v_personnel.membership_id IS DISTINCT FROM v_membership.id` (closing the User A -> User B
--      concurrent personnel reassignment race).
-- 4. Re-verifies inside the locked transaction boundary:
--    - Active tenant (`tenants.is_active`, `status`, and `metadata` flags)
--    - Active personnel (`personnel.is_active`)
--    - Active membership (`tenant_memberships.is_active`) and exact case-insensitive BWM role whitelist
--    - Active same-tenant checkpoint (`checkpoints.tenant_id`, `checkpoints.is_active`)
--      and exact QR token match (`checkpoints.qr_token`)
--    - Active same-tenant parent facility (`facilities.id = checkpoints.facility_id`,
--      `facilities.tenant_id = p_tenant_id`, `facilities.is_active`)
--    - Role-scoped facility assignment (`field_personnel` strictly bound to
--      `personnel.facility_id`; `supervisor` / `master_reseller` permitted
--      cross-facility strictly within the same tenant)
--    - Non-stale WGS-84 Haversine geofence calculation against the locked
--      `checkpoints.latitude`, `checkpoints.longitude`, and `facilities.geofence_radius_m`
-- 5. Enforces strict privilege separation: `SECURITY INVOKER`, hardened
--    `SET search_path = pg_catalog, workforce_staging`, runtime `42501` caller
--    guard, `REVOKE ALL FROM PUBLIC, anon, authenticated`, and
--    `GRANT EXECUTE TO postgres, service_role`.
-- ============================================================================

-- Defensive cleanup of any 11-argument candidate signature in local disposable environments
DO $$
BEGIN
    IF to_regprocedure(
        'workforce_staging.record_checkpoint_scan_atomic(uuid,uuid,uuid,uuid,text,timestamptz,numeric,numeric,numeric,text,text)'
    ) IS NOT NULL THEN
        REVOKE ALL ON FUNCTION workforce_staging.record_checkpoint_scan_atomic(
            UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT
        ) FROM PUBLIC, anon, authenticated, service_role, postgres;
    END IF;
END $$;

DROP FUNCTION IF EXISTS workforce_staging.record_checkpoint_scan_atomic(
    UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION workforce_staging.record_checkpoint_scan_atomic(
    p_id UUID,
    p_tenant_id UUID,
    p_personnel_id UUID,
    p_expected_user_id UUID,
    p_checkpoint_id UUID,
    p_qr_token TEXT,
    p_scanned_at TIMESTAMPTZ,
    p_latitude NUMERIC(10, 7),
    p_longitude NUMERIC(10, 7),
    p_distance_m NUMERIC(10, 2),
    p_status TEXT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, workforce_staging
AS $$
DECLARE
    -- Non-locking facility lookup hint (resolved before canonical lock order 1 -> 2 -> 3 -> 3.5 -> 4)
    v_hint_checkpoint_facility_id UUID;

    -- Locked entity state
    v_tenant_found BOOLEAN := FALSE;
    v_tenant RECORD;
    v_membership_found BOOLEAN := FALSE;
    v_membership RECORD;
    v_facility_found BOOLEAN := FALSE;
    v_facility RECORD;
    v_checkpoint_found BOOLEAN := FALSE;
    v_checkpoint RECORD;
    v_personnel_found BOOLEAN := FALSE;
    v_personnel RECORD;

    -- In-transaction WGS-84 Haversine geofence calculation state
    v_lat1_rad DOUBLE PRECISION;
    v_lat2_rad DOUBLE PRECISION;
    v_delta_lat DOUBLE PRECISION;
    v_delta_lon DOUBLE PRECISION;
    v_haversine_a DOUBLE PRECISION;
    v_haversine_c DOUBLE PRECISION;
    v_computed_distance_m NUMERIC(10, 2);

    -- Resolved authorization & persistence state
    v_issued_role TEXT;
    v_existing workforce_staging.checkpoint_scans%ROWTYPE;
    v_inserted workforce_staging.checkpoint_scans%ROWTYPE;
BEGIN
    -- Step 0: Defense-in-depth caller authorization check
    IF NOT (
        auth.role() = 'service_role'
        OR current_user IN ('service_role', 'postgres')
    ) THEN
        RAISE EXCEPTION 'UNAUTHORIZED_RPC_CALLER: checkpoint scan mutation RPC requires service_role'
            USING ERRCODE = '42501';
    END IF;

    -- Step 1: Parameter sanity checks
    IF p_expected_user_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_EXPECTED_USER_ID: authenticated session user UUID is required'
            USING ERRCODE = '22023';
    END IF;

    IF p_status IS NULL OR p_status <> 'VERIFIED' THEN
        RAISE EXCEPTION 'INVALID_CHECKPOINT_SCAN_STATUS: must be VERIFIED'
            USING ERRCODE = '22023';
    END IF;

    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 128 THEN
        RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY: non-empty key up to 128 chars required'
            USING ERRCODE = '22023';
    END IF;

    IF p_qr_token IS NULL OR btrim(p_qr_token) = '' OR char_length(p_qr_token) > 255 THEN
        RAISE EXCEPTION 'INVALID_QR_TOKEN: non-empty token up to 255 chars required'
            USING ERRCODE = '22023';
    END IF;

    IF p_latitude IS NULL OR p_latitude < -90 OR p_latitude > 90
       OR p_longitude IS NULL OR p_longitude < -180 OR p_longitude > 180 THEN
        RAISE EXCEPTION 'INVALID_COORDINATES: latitude (-90..90) and longitude (-180..180) required'
            USING ERRCODE = '22023';
    END IF;

    -- Non-locking hint read ONLY for checkpoint parent facility so all row locks are acquired strictly
    -- in topological FK DAG order:
    --   1.   tenants            (FOR SHARE)
    --   2.   tenant_memberships (FOR SHARE on p_expected_user_id)
    --   3.   facilities         (FOR SHARE)
    --   3.5. checkpoints        (FOR SHARE)
    --   4.   personnel          (FOR UPDATE)
    SELECT cp.facility_id
    INTO v_hint_checkpoint_facility_id
    FROM workforce_staging.checkpoints cp
    WHERE cp.id = p_checkpoint_id;

    -- LOCK LEVEL 1: workforce_staging.tenants (FOR SHARE)
    SELECT
        t.is_active,
        lower(coalesce(t.status, 'active')) AS status,
        coalesce(t.metadata, '{}'::jsonb) AS metadata
    INTO v_tenant
    FROM workforce_staging.tenants t
    WHERE t.id = p_tenant_id
    FOR SHARE;
    v_tenant_found := FOUND;

    -- LOCK LEVEL 2: workforce_staging.tenant_memberships (FOR SHARE)
    -- Strictly locks the authenticated session actor's membership row (p_expected_user_id)
    SELECT tm.id, tm.user_id, tm.tenant_id, tm.role, tm.is_active
    INTO v_membership
    FROM workforce_staging.tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id::text
      AND tm.user_id = p_expected_user_id
    LIMIT 1
    FOR SHARE;
    v_membership_found := FOUND;

    -- LOCK LEVEL 3: workforce_staging.facilities (FOR SHARE)
    IF v_hint_checkpoint_facility_id IS NOT NULL THEN
        SELECT f.id, f.tenant_id, f.is_active, f.geofence_radius_m
        INTO v_facility
        FROM workforce_staging.facilities f
        WHERE f.id = v_hint_checkpoint_facility_id
        FOR SHARE;
        v_facility_found := FOUND;
    END IF;

    -- LOCK LEVEL 3.5: workforce_staging.checkpoints (FOR SHARE)
    SELECT cp.id, cp.tenant_id, cp.facility_id, cp.latitude, cp.longitude, cp.qr_token, cp.is_active
    INTO v_checkpoint
    FROM workforce_staging.checkpoints cp
    WHERE cp.id = p_checkpoint_id
    FOR SHARE;
    v_checkpoint_found := FOUND;

    -- LOCK LEVEL 4: workforce_staging.personnel (FOR UPDATE)
    SELECT p.id, p.tenant_id, p.user_id, p.membership_id, p.facility_id, p.is_active
    INTO v_personnel
    FROM workforce_staging.personnel p
    WHERE p.id = p_personnel_id
      AND p.tenant_id = p_tenant_id
    FOR UPDATE;
    v_personnel_found := FOUND;

    -- Re-validate active tenant inside transaction locks
    IF NOT v_tenant_found
       OR v_tenant.is_active IS FALSE
       OR v_tenant.status IN ('suspended', 'inactive', 'revoked', 'disabled')
       OR (v_tenant.metadata ->> 'is_active') = 'false'
       OR (v_tenant.metadata ->> 'suspended') = 'true'
       OR lower(coalesce(v_tenant.metadata ->> 'status', 'active')) IN ('suspended', 'inactive', 'revoked', 'disabled') THEN
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

    -- Re-validate checkpoint existence, tenant scope, active status, and QR token
    IF NOT v_checkpoint_found THEN
        RETURN jsonb_build_object('outcome', 'CHECKPOINT_NOT_FOUND');
    END IF;

    IF v_checkpoint.tenant_id <> p_tenant_id THEN
        RETURN jsonb_build_object('outcome', 'CROSS_TENANT_CHECKPOINT_FORBIDDEN');
    END IF;

    IF v_checkpoint.is_active IS NOT TRUE THEN
        RETURN jsonb_build_object('outcome', 'CHECKPOINT_INACTIVE');
    END IF;

    IF btrim(coalesce(v_checkpoint.qr_token, '')) IS DISTINCT FROM btrim(p_qr_token) THEN
        RETURN jsonb_build_object('outcome', 'QR_TOKEN_MISMATCH');
    END IF;

    -- Verify parent facility locked at Level 3 matches checkpoint.facility_id (never re-lock out of order)
    IF NOT v_facility_found
       OR v_facility.id IS DISTINCT FROM v_checkpoint.facility_id
       OR v_facility.tenant_id <> p_tenant_id THEN
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

    -- In-transaction geofence validation against locked checkpoint coordinates and locked facility radius
    IF v_checkpoint.latitude IS NULL
       OR v_checkpoint.longitude IS NULL
       OR v_facility.geofence_radius_m IS NULL
       OR v_facility.geofence_radius_m <= 0 THEN
        RETURN jsonb_build_object('outcome', 'INVALID_GEOFENCE_CONFIGURATION');
    END IF;

    v_lat1_rad := pg_catalog.radians(p_latitude::double precision);
    v_lat2_rad := pg_catalog.radians(v_checkpoint.latitude::double precision);
    v_delta_lat := pg_catalog.radians((v_checkpoint.latitude - p_latitude)::double precision);
    v_delta_lon := pg_catalog.radians((v_checkpoint.longitude - p_longitude)::double precision);

    v_haversine_a := pg_catalog.power(pg_catalog.sin(v_delta_lat / 2.0), 2.0)
                   + pg_catalog.cos(v_lat1_rad) * pg_catalog.cos(v_lat2_rad)
                     * pg_catalog.power(pg_catalog.sin(v_delta_lon / 2.0), 2.0);
    v_haversine_a := LEAST(1.0, GREATEST(0.0, v_haversine_a));
    v_haversine_c := 2.0 * pg_catalog.atan2(pg_catalog.sqrt(v_haversine_a), pg_catalog.sqrt(1.0 - v_haversine_a));
    v_computed_distance_m := pg_catalog.round((6371000.0 * v_haversine_c)::numeric, 2);

    IF v_computed_distance_m > v_facility.geofence_radius_m::numeric THEN
        RETURN jsonb_build_object(
            'outcome', 'GEOFENCE_VIOLATION',
            'distance_m', v_computed_distance_m,
            'radius_m', v_facility.geofence_radius_m
        );
    END IF;

    -- Tenant-scoped idempotency lookup inside locked transaction boundary
    SELECT s.*
    INTO v_existing
    FROM workforce_staging.checkpoint_scans s
    WHERE s.tenant_id = p_tenant_id
      AND s.idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'outcome', 'IDEMPOTENCY_EXISTING',
            'row', to_jsonb(v_existing),
            'distance_m', v_computed_distance_m,
            'radius_m', v_facility.geofence_radius_m
        );
    END IF;

    BEGIN
        INSERT INTO workforce_staging.checkpoint_scans (
            id,
            tenant_id,
            checkpoint_id,
            personnel_id,
            scanned_at,
            latitude,
            longitude,
            distance_m,
            status,
            idempotency_key,
            created_at
        )
        VALUES (
            p_id,
            p_tenant_id,
            v_checkpoint.id,
            p_personnel_id,
            p_scanned_at,
            p_latitude,
            p_longitude,
            v_computed_distance_m,
            p_status,
            p_idempotency_key,
            pg_catalog.clock_timestamp()
        )
        RETURNING * INTO v_inserted;
    EXCEPTION
        WHEN unique_violation THEN
            SELECT s.*
            INTO v_existing
            FROM workforce_staging.checkpoint_scans s
            WHERE s.tenant_id = p_tenant_id
              AND s.idempotency_key = p_idempotency_key
            LIMIT 1;

            IF FOUND THEN
                RETURN jsonb_build_object(
                    'outcome', 'IDEMPOTENCY_EXISTING',
                    'row', to_jsonb(v_existing),
                    'distance_m', v_computed_distance_m,
                    'radius_m', v_facility.geofence_radius_m
                );
            END IF;
            RAISE;
    END;

    RETURN jsonb_build_object(
        'outcome', 'CREATED',
        'row', to_jsonb(v_inserted),
        'distance_m', v_computed_distance_m,
        'radius_m', v_facility.geofence_radius_m
    );
END;
$$;

REVOKE ALL ON FUNCTION workforce_staging.record_checkpoint_scan_atomic(
    UUID, UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION workforce_staging.record_checkpoint_scan_atomic(
    UUID, UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT
) TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
