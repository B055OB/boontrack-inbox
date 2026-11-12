-- ============================================================================
-- Migration 016: BWM Domain-Specific Authorization Isolation & Helper Separation
-- Target Schema: workforce_staging / public
--
-- Remediates M-2 (Cross-Domain Authorization Over-Reach):
-- 1. Separates Commerce vs. BWM Operational vs. Field-Personnel Self/Facility
--    authorization helpers instead of applying a flat 7-role allowlist globally:
--      - is_trusted_commerce_member(target_tenant_id, required_role)
--          Strictly {OWNER, MERCHANT, OPERATOR, CS}; rejects BWM roles
--          (master_reseller, supervisor, field_personnel), unknown, and revoked.
--      - is_trusted_bwm_operational_reader(target_tenant_id)
--          Option C CTO Policy: {OWNER, MERCHANT, master_reseller, supervisor}
--          within the same active tenant (cross-facility within tenant).
--          Excludes field_personnel, OPERATOR, CS, unknown, and revoked.
--      - is_trusted_bwm_admin(target_tenant_id)
--          {OWNER, MERCHANT} within the same active tenant
--          (notification_outbox administrative access; master_reseller revoked).
--      - is_trusted_field_personnel_self(target_tenant_id, target_personnel_id)
--          Strict self-binding: active field_personnel membership + auth.uid()
--          + active personnel row (p.is_active IS TRUE) in same active tenant.
--      - is_trusted_field_personnel_facility(target_tenant_id, target_facility_id)
--          Strict facility-assignment binding: active field_personnel membership
--          + auth.uid() + active personnel row bound to target_facility_id.
-- 2. Rebinds products, public.products, branch_credit_pools, and
--    tenant_memberships strictly to is_trusted_commerce_member (preserving full
--    OWNER/MERCHANT/OPERATOR/CS Commerce parity while denying field_personnel,
--    supervisor, and master_reseller).
-- 3. Replaces broad rls_*_isolation policies on Migration 011 BWM operational
--    tables with read/write separation (WITH CHECK (auth.role() = 'service_role'))
--    and Option C supervisor + self/facility-bound field_personnel SELECT rules.
-- 4. Restricts workforce_staging.notification_outbox to service_role/BWM admins
--    and masks qr_token on public.workforce_checkpoints for non-admins.
-- 5. Emits NOTIFY pgrst, 'reload schema' for PostgREST schema cache sync.
-- ============================================================================

-- ============================================================================
-- 1. DOMAIN-SPECIFIC AUTHORIZATION HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION workforce_staging.get_trusted_tenant_member_role(
    target_tenant_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, workforce_staging, public
AS $$
DECLARE
    v_uid UUID;
    v_role TEXT;
    v_active_role TEXT;
    v_member_role TEXT;
    v_is_active BOOLEAN;
    v_jwt_tenant_id TEXT;
BEGIN
    v_role := auth.role();
    IF v_role = 'service_role' THEN
        RETURN '__SERVICE_ROLE__';
    END IF;

    v_active_role := current_setting('role', true);
    IF (v_active_role IS NULL OR v_active_role = 'none' OR v_active_role = 'postgres')
       AND session_user = 'postgres' THEN
        RETURN '__POSTGRES_SUPERUSER__';
    END IF;

    v_uid := auth.uid();
    IF v_uid IS NULL OR target_tenant_id IS NULL OR btrim(target_tenant_id) = '' THEN
        RETURN NULL;
    END IF;

    SELECT btrim(tm.role), tm.is_active
    INTO v_member_role, v_is_active
    FROM workforce_staging.tenant_memberships tm
    WHERE tm.user_id = v_uid
      AND (tm.tenant_id = target_tenant_id OR tm.tenant_slug = target_tenant_id)
    LIMIT 1;

    IF v_member_role IS NULL OR v_is_active IS NOT TRUE THEN
        RETURN NULL;
    END IF;

    BEGIN
        v_jwt_tenant_id := auth.jwt() -> 'app_metadata' ->> 'tenant_id';
        IF v_jwt_tenant_id IS NOT NULL AND v_jwt_tenant_id != target_tenant_id THEN
            RETURN NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;

    RETURN v_member_role;
END;
$$;

REVOKE ALL ON FUNCTION workforce_staging.get_trusted_tenant_member_role(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION workforce_staging.get_trusted_tenant_member_role(TEXT) TO postgres, service_role;

CREATE OR REPLACE FUNCTION workforce_staging.is_trusted_commerce_member(
    target_tenant_id TEXT,
    required_role TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, workforce_staging, public
AS $$
DECLARE
    v_member_role TEXT;
BEGIN
    v_member_role := workforce_staging.get_trusted_tenant_member_role(target_tenant_id);
    IF v_member_role IS NULL THEN
        RETURN FALSE;
    END IF;

    IF v_member_role IN ('__SERVICE_ROLE__', '__POSTGRES_SUPERUSER__') THEN
        RETURN TRUE;
    END IF;

    -- Strictly isolate Commerce domain to OWNER / MERCHANT / OPERATOR / CS
    IF v_member_role NOT IN ('OWNER', 'MERCHANT', 'OPERATOR', 'CS') THEN
        RETURN FALSE;
    END IF;

    IF required_role IS NULL THEN
        RETURN TRUE;
    END IF;

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

REVOKE ALL ON FUNCTION workforce_staging.is_trusted_commerce_member(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION workforce_staging.is_trusted_commerce_member(TEXT, TEXT) TO authenticated, service_role, postgres;

CREATE OR REPLACE FUNCTION workforce_staging.is_trusted_bwm_operational_reader(
    target_tenant_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, workforce_staging, public
AS $$
DECLARE
    v_member_role TEXT;
    v_tenant_active BOOLEAN := FALSE;
BEGIN
    v_member_role := workforce_staging.get_trusted_tenant_member_role(target_tenant_id);
    IF v_member_role IS NULL THEN
        RETURN FALSE;
    END IF;

    IF v_member_role IN ('__SERVICE_ROLE__', '__POSTGRES_SUPERUSER__') THEN
        RETURN TRUE;
    END IF;

    -- Option C CTO Binding: Supervisor preserves tenant-level operational read across
    -- same-tenant facilities alongside OWNER, MERCHANT, and master_reseller.
    -- Field personnel, OPERATOR, CS, and unknown roles do NOT receive tenant-wide read.
    IF v_member_role NOT IN ('OWNER', 'MERCHANT', 'master_reseller', 'supervisor') THEN
        RETURN FALSE;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM workforce_staging.tenants t
        WHERE (t.id::text = target_tenant_id OR t.slug = target_tenant_id)
          AND t.is_active IS TRUE
          AND lower(coalesce(t.status, 'active')) NOT IN ('suspended', 'inactive', 'revoked', 'disabled')
    ) INTO v_tenant_active;

    RETURN v_tenant_active;
END;
$$;

REVOKE ALL ON FUNCTION workforce_staging.is_trusted_bwm_operational_reader(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION workforce_staging.is_trusted_bwm_operational_reader(TEXT) TO authenticated, service_role, postgres;

CREATE OR REPLACE FUNCTION workforce_staging.is_trusted_bwm_admin(
    target_tenant_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, workforce_staging, public
AS $$
DECLARE
    v_member_role TEXT;
    v_tenant_active BOOLEAN := FALSE;
BEGIN
    v_member_role := workforce_staging.get_trusted_tenant_member_role(target_tenant_id);
    IF v_member_role IS NULL THEN
        RETURN FALSE;
    END IF;

    IF v_member_role IN ('__SERVICE_ROLE__', '__POSTGRES_SUPERUSER__') THEN
        RETURN TRUE;
    END IF;

    -- Strictly isolate BWM administrative outbox access to OWNER & MERCHANT
    -- master_reseller has no administrative mandate and is strictly excluded
    IF v_member_role NOT IN ('OWNER', 'MERCHANT') THEN
        RETURN FALSE;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM workforce_staging.tenants t
        WHERE (t.id::text = target_tenant_id OR t.slug = target_tenant_id)
          AND t.is_active IS TRUE
          AND lower(coalesce(t.status, 'active')) NOT IN ('suspended', 'inactive', 'revoked', 'disabled')
    ) INTO v_tenant_active;

    RETURN v_tenant_active;
END;
$$;

REVOKE ALL ON FUNCTION workforce_staging.is_trusted_bwm_admin(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION workforce_staging.is_trusted_bwm_admin(TEXT) TO authenticated, service_role, postgres;

CREATE OR REPLACE FUNCTION workforce_staging.is_trusted_field_personnel_self(
    target_tenant_id TEXT,
    target_personnel_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, workforce_staging, public
AS $$
DECLARE
    v_member_role TEXT;
    v_uid UUID;
    v_ok BOOLEAN := FALSE;
BEGIN
    v_member_role := workforce_staging.get_trusted_tenant_member_role(target_tenant_id);
    IF v_member_role IS NULL THEN
        RETURN FALSE;
    END IF;

    IF v_member_role IN ('__SERVICE_ROLE__', '__POSTGRES_SUPERUSER__') THEN
        RETURN TRUE;
    END IF;

    IF v_member_role != 'field_personnel' OR target_personnel_id IS NULL THEN
        RETURN FALSE;
    END IF;

    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM workforce_staging.personnel p
        JOIN workforce_staging.tenants t ON t.id = p.tenant_id
        WHERE p.id = target_personnel_id
          AND (p.tenant_id::text = target_tenant_id OR p.tenant_slug = target_tenant_id)
          AND p.user_id = v_uid
          AND p.is_active IS TRUE
          AND t.is_active IS TRUE
          AND lower(coalesce(t.status, 'active')) NOT IN ('suspended', 'inactive', 'revoked', 'disabled')
    ) INTO v_ok;

    RETURN v_ok;
END;
$$;

REVOKE ALL ON FUNCTION workforce_staging.is_trusted_field_personnel_self(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION workforce_staging.is_trusted_field_personnel_self(TEXT, UUID) TO authenticated, service_role, postgres;

CREATE OR REPLACE FUNCTION workforce_staging.is_trusted_field_personnel_facility(
    target_tenant_id TEXT,
    target_facility_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, workforce_staging, public
AS $$
DECLARE
    v_member_role TEXT;
    v_uid UUID;
    v_ok BOOLEAN := FALSE;
BEGIN
    v_member_role := workforce_staging.get_trusted_tenant_member_role(target_tenant_id);
    IF v_member_role IS NULL THEN
        RETURN FALSE;
    END IF;

    IF v_member_role IN ('__SERVICE_ROLE__', '__POSTGRES_SUPERUSER__') THEN
        RETURN TRUE;
    END IF;

    IF v_member_role != 'field_personnel' OR target_facility_id IS NULL THEN
        RETURN FALSE;
    END IF;

    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM workforce_staging.personnel p
        JOIN workforce_staging.tenants t ON t.id = p.tenant_id
        WHERE (p.tenant_id::text = target_tenant_id OR p.tenant_slug = target_tenant_id)
          AND p.user_id = v_uid
          AND p.is_active IS TRUE
          AND p.facility_id IS NOT NULL
          AND p.facility_id = target_facility_id
          AND t.is_active IS TRUE
          AND lower(coalesce(t.status, 'active')) NOT IN ('suspended', 'inactive', 'revoked', 'disabled')
    ) INTO v_ok;

    RETURN v_ok;
END;
$$;

REVOKE ALL ON FUNCTION workforce_staging.is_trusted_field_personnel_facility(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION workforce_staging.is_trusted_field_personnel_facility(TEXT, UUID) TO authenticated, service_role, postgres;

-- ============================================================================
-- 2. COMMERCE DOMAIN POLICIES & VIEWS (products, branch_credit_pools, memberships)
-- ============================================================================

-- A. workforce_staging.products
DROP POLICY IF EXISTS rls_products_select ON workforce_staging.products;
DROP POLICY IF EXISTS rls_products_insert ON workforce_staging.products;
DROP POLICY IF EXISTS rls_products_update ON workforce_staging.products;
DROP POLICY IF EXISTS rls_products_delete ON workforce_staging.products;

CREATE POLICY rls_products_select ON workforce_staging.products
    FOR SELECT TO public
    USING (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_commerce_member(tenant_id) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR tenant_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.current_tenant_id', true))
        )
    );

CREATE POLICY rls_products_insert ON workforce_staging.products
    FOR INSERT TO public
    WITH CHECK (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_commerce_member(tenant_id, 'MERCHANT') AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR tenant_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.current_tenant_id', true))
        )
    );

CREATE POLICY rls_products_update ON workforce_staging.products
    FOR UPDATE TO public
    USING (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_commerce_member(tenant_id, 'MERCHANT') AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR tenant_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.current_tenant_id', true))
        )
    )
    WITH CHECK (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_commerce_member(tenant_id, 'MERCHANT') AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR tenant_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.current_tenant_id', true))
        )
    );

CREATE POLICY rls_products_delete ON workforce_staging.products
    FOR DELETE TO public
    USING (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_commerce_member(tenant_id, 'MERCHANT') AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR tenant_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.current_tenant_id', true))
        )
    );

-- B. public.products view (exclude BWM roles & unknown roles from Commerce product reads)
CREATE OR REPLACE VIEW public.products
WITH (security_invoker = false) AS
    SELECT
        id,
        tenant_id,
        title,
        slug,
        price,
        promo_price,
        category,
        product_type,
        description,
        stock,
        is_active,
        status,
        sku,
        created_at,
        updated_at,
        name,
        image,
        image_url,
        CASE
            WHEN auth.role() = 'service_role'
                 OR workforce_staging.is_trusted_commerce_member(tenant_id, 'MERCHANT')
            THEN asset_reference
            ELSE NULL
        END AS asset_reference,
        CASE
            WHEN auth.role() = 'service_role'
                 OR workforce_staging.is_trusted_commerce_member(tenant_id, 'MERCHANT')
            THEN license_status
            ELSE NULL
        END AS license_status,
        is_digital,
        requires_shipping,
        is_unlimited_stock,
        CASE
            WHEN auth.role() = 'service_role'
                 OR workforce_staging.is_trusted_commerce_member(tenant_id, 'MERCHANT')
            THEN fulfillment_metadata
            ELSE NULL
        END AS fulfillment_metadata,
        is_publicly_published
    FROM workforce_staging.products
    WHERE auth.role() = 'service_role'
       OR (
           workforce_staging.is_trusted_commerce_member(tenant_id)
           AND (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR tenant_id = current_setting('app.current_agency_id', true))
           AND (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.current_tenant_id', true))
       )
       OR (
           (current_setting('role', true) IS NULL OR current_setting('role', true) = 'none' OR current_setting('role', true) = 'postgres')
           AND session_user = 'postgres'
       );

GRANT ALL ON public.products TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
REVOKE ALL ON public.products FROM anon;

-- C. workforce_staging.branch_credit_pools
DROP POLICY IF EXISTS rls_branch_credit_pools_select ON workforce_staging.branch_credit_pools;
DROP POLICY IF EXISTS rls_branch_credit_pools_insert ON workforce_staging.branch_credit_pools;
DROP POLICY IF EXISTS rls_branch_credit_pools_update ON workforce_staging.branch_credit_pools;
DROP POLICY IF EXISTS rls_branch_credit_pools_delete ON workforce_staging.branch_credit_pools;

CREATE POLICY rls_branch_credit_pools_select ON workforce_staging.branch_credit_pools
    FOR SELECT TO public
    USING (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_commerce_member(agency_id) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR agency_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR agency_id = current_setting('app.current_tenant_id', true))
        )
    );

CREATE POLICY rls_branch_credit_pools_insert ON workforce_staging.branch_credit_pools
    FOR INSERT TO public
    WITH CHECK (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_commerce_member(agency_id, 'OWNER') AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR agency_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR agency_id = current_setting('app.current_tenant_id', true))
        )
    );

CREATE POLICY rls_branch_credit_pools_update ON workforce_staging.branch_credit_pools
    FOR UPDATE TO public
    USING (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_commerce_member(agency_id, 'OWNER') AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR agency_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR agency_id = current_setting('app.current_tenant_id', true))
        )
    )
    WITH CHECK (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_commerce_member(agency_id, 'OWNER') AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR agency_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR agency_id = current_setting('app.current_tenant_id', true))
        )
    );

CREATE POLICY rls_branch_credit_pools_delete ON workforce_staging.branch_credit_pools
    FOR DELETE TO public
    USING (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_commerce_member(agency_id, 'OWNER') AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR agency_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR agency_id = current_setting('app.current_tenant_id', true))
        )
    );

-- D. workforce_staging.tenant_memberships & public.tenant_memberships
DROP POLICY IF EXISTS rls_tenant_memberships_select ON workforce_staging.tenant_memberships;
CREATE POLICY rls_tenant_memberships_select ON workforce_staging.tenant_memberships
    FOR SELECT TO public
    USING (
        auth.role() = 'service_role' OR
        (
            (workforce_staging.is_trusted_commerce_member(tenant_id, 'MERCHANT') OR workforce_staging.is_trusted_commerce_member(tenant_slug, 'MERCHANT')) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR tenant_id = current_setting('app.current_agency_id', true) OR tenant_slug = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.current_tenant_id', true) OR tenant_slug = current_setting('app.current_tenant_id', true))
        )
    );

CREATE OR REPLACE VIEW public.tenant_memberships
WITH (security_invoker = false) AS
    SELECT * FROM workforce_staging.tenant_memberships
    WHERE auth.role() = 'service_role'
       OR (
           (workforce_staging.is_trusted_commerce_member(tenant_id, 'MERCHANT') OR workforce_staging.is_trusted_commerce_member(tenant_slug, 'MERCHANT'))
           AND (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR tenant_id = current_setting('app.current_agency_id', true) OR tenant_slug = current_setting('app.current_agency_id', true))
           AND (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.current_tenant_id', true) OR tenant_slug = current_setting('app.current_tenant_id', true))
       )
       OR (
           (current_setting('role', true) IS NULL OR current_setting('role', true) = 'none' OR current_setting('role', true) = 'postgres')
           AND session_user = 'postgres'
       );

GRANT ALL ON public.tenant_memberships TO postgres, service_role;
GRANT SELECT ON public.tenant_memberships TO authenticated;
REVOKE ALL ON public.tenant_memberships FROM anon;

-- ============================================================================
-- 3. BWM OPERATIONAL DOMAIN POLICIES (SELF/FACILITY FIELD PERSONNEL & OPTION C SUPERVISOR)
-- ============================================================================

-- 3.1 facilities
DROP POLICY IF EXISTS rls_facilities_isolation ON workforce_staging.facilities;
DROP POLICY IF EXISTS rls_facilities_select ON workforce_staging.facilities;
DROP POLICY IF EXISTS rls_facilities_mutation ON workforce_staging.facilities;

CREATE POLICY rls_facilities_select ON workforce_staging.facilities
    FOR SELECT TO public
    USING (
        auth.role() = 'service_role'
        OR workforce_staging.is_trusted_bwm_operational_reader(tenant_id::text)
        OR workforce_staging.is_trusted_field_personnel_facility(tenant_id::text, id)
    );

CREATE POLICY rls_facilities_mutation ON workforce_staging.facilities
    FOR ALL TO public
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- 3.2 personnel
DROP POLICY IF EXISTS rls_personnel_isolation ON workforce_staging.personnel;
DROP POLICY IF EXISTS rls_personnel_select ON workforce_staging.personnel;
DROP POLICY IF EXISTS rls_personnel_mutation ON workforce_staging.personnel;

CREATE POLICY rls_personnel_select ON workforce_staging.personnel
    FOR SELECT TO public
    USING (
        auth.role() = 'service_role'
        OR workforce_staging.is_trusted_bwm_operational_reader(tenant_id::text)
        OR workforce_staging.is_trusted_field_personnel_self(tenant_id::text, id)
    );

CREATE POLICY rls_personnel_mutation ON workforce_staging.personnel
    FOR ALL TO public
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- 3.3 checkpoints
DROP POLICY IF EXISTS rls_checkpoints_isolation ON workforce_staging.checkpoints;
DROP POLICY IF EXISTS rls_checkpoints_select ON workforce_staging.checkpoints;
DROP POLICY IF EXISTS rls_checkpoints_mutation ON workforce_staging.checkpoints;

CREATE POLICY rls_checkpoints_select ON workforce_staging.checkpoints
    FOR SELECT TO public
    USING (
        auth.role() = 'service_role'
        OR workforce_staging.is_trusted_bwm_operational_reader(tenant_id::text)
        OR workforce_staging.is_trusted_field_personnel_facility(tenant_id::text, facility_id)
    );

CREATE POLICY rls_checkpoints_mutation ON workforce_staging.checkpoints
    FOR ALL TO public
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- 3.4 attendance_logs
DROP POLICY IF EXISTS rls_attendance_logs_isolation ON workforce_staging.attendance_logs;
DROP POLICY IF EXISTS rls_attendance_logs_select ON workforce_staging.attendance_logs;
DROP POLICY IF EXISTS rls_attendance_logs_mutation ON workforce_staging.attendance_logs;

CREATE POLICY rls_attendance_logs_select ON workforce_staging.attendance_logs
    FOR SELECT TO public
    USING (
        auth.role() = 'service_role'
        OR workforce_staging.is_trusted_bwm_operational_reader(tenant_id::text)
        OR workforce_staging.is_trusted_field_personnel_self(tenant_id::text, personnel_id)
    );

CREATE POLICY rls_attendance_logs_mutation ON workforce_staging.attendance_logs
    FOR ALL TO public
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- 3.5 checkpoint_scans
DROP POLICY IF EXISTS rls_checkpoint_scans_isolation ON workforce_staging.checkpoint_scans;
DROP POLICY IF EXISTS rls_checkpoint_scans_select ON workforce_staging.checkpoint_scans;
DROP POLICY IF EXISTS rls_checkpoint_scans_mutation ON workforce_staging.checkpoint_scans;

CREATE POLICY rls_checkpoint_scans_select ON workforce_staging.checkpoint_scans
    FOR SELECT TO public
    USING (
        auth.role() = 'service_role'
        OR workforce_staging.is_trusted_bwm_operational_reader(tenant_id::text)
        OR workforce_staging.is_trusted_field_personnel_self(tenant_id::text, personnel_id)
    );

CREATE POLICY rls_checkpoint_scans_mutation ON workforce_staging.checkpoint_scans
    FOR ALL TO public
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- 3.6 incidents
DROP POLICY IF EXISTS rls_incidents_isolation ON workforce_staging.incidents;
DROP POLICY IF EXISTS rls_incidents_select ON workforce_staging.incidents;
DROP POLICY IF EXISTS rls_incidents_mutation ON workforce_staging.incidents;

CREATE POLICY rls_incidents_select ON workforce_staging.incidents
    FOR SELECT TO public
    USING (
        auth.role() = 'service_role'
        OR workforce_staging.is_trusted_bwm_operational_reader(tenant_id::text)
        OR workforce_staging.is_trusted_field_personnel_self(tenant_id::text, reporter_id)
    );

CREATE POLICY rls_incidents_mutation ON workforce_staging.incidents
    FOR ALL TO public
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- 3.7 shift_handovers
DROP POLICY IF EXISTS rls_shift_handovers_isolation ON workforce_staging.shift_handovers;
DROP POLICY IF EXISTS rls_shift_handovers_select ON workforce_staging.shift_handovers;
DROP POLICY IF EXISTS rls_shift_handovers_mutation ON workforce_staging.shift_handovers;

CREATE POLICY rls_shift_handovers_select ON workforce_staging.shift_handovers
    FOR SELECT TO public
    USING (
        auth.role() = 'service_role'
        OR workforce_staging.is_trusted_bwm_operational_reader(tenant_id::text)
        OR workforce_staging.is_trusted_field_personnel_self(tenant_id::text, outgoing_personnel_id)
        OR workforce_staging.is_trusted_field_personnel_self(tenant_id::text, incoming_personnel_id)
    );

CREATE POLICY rls_shift_handovers_mutation ON workforce_staging.shift_handovers
    FOR ALL TO public
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- 3.8 notification_outbox (strictly restricted to service_role and BWM admins; denied to field_personnel, supervisor, OPERATOR, CS)
DROP POLICY IF EXISTS rls_notification_outbox_isolation ON workforce_staging.notification_outbox;
DROP POLICY IF EXISTS rls_notification_outbox_select ON workforce_staging.notification_outbox;
DROP POLICY IF EXISTS rls_notification_outbox_mutation ON workforce_staging.notification_outbox;

CREATE POLICY rls_notification_outbox_select ON workforce_staging.notification_outbox
    FOR SELECT TO public
    USING (
        auth.role() = 'service_role'
        OR workforce_staging.is_trusted_bwm_admin(tenant_id::text)
    );

CREATE POLICY rls_notification_outbox_mutation ON workforce_staging.notification_outbox
    FOR ALL TO public
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON workforce_staging.notification_outbox FROM public, anon, authenticated;
GRANT ALL ON workforce_staging.notification_outbox TO postgres, service_role;

-- 3.9 credential_audit_logs (explicit domain separation: Commerce OWNER + service_role only)
DROP POLICY IF EXISTS rls_credential_audit_logs_isolation ON workforce_staging.credential_audit_logs;
CREATE POLICY rls_credential_audit_logs_isolation ON workforce_staging.credential_audit_logs
    FOR SELECT TO public
    USING (
        auth.role() = 'service_role'
        OR workforce_staging.is_trusted_commerce_member(tenant_id::text, 'OWNER')
    );

-- 3.10 Column & View ACL isolation for workforce_staging.checkpoints & public.workforce_checkpoints
-- Revoke direct SELECT on base table qr_token from authenticated (preventing PostgREST/SQL bypass)
REVOKE ALL ON workforce_staging.checkpoints FROM public, anon, authenticated;
GRANT ALL ON workforce_staging.checkpoints TO postgres, service_role;
GRANT SELECT (
    id,
    tenant_id,
    facility_id,
    name,
    code,
    zone,
    latitude,
    longitude,
    sla_minutes,
    is_active,
    created_at
) ON workforce_staging.checkpoints TO authenticated;

CREATE OR REPLACE VIEW public.workforce_checkpoints
WITH (security_invoker = false) AS
    SELECT
        id,
        tenant_id,
        facility_id,
        name,
        code,
        zone,
        latitude,
        longitude,
        CASE
            WHEN auth.role() = 'service_role'
                 OR (
                     (current_setting('role', true) IS NULL OR current_setting('role', true) = 'none' OR current_setting('role', true) = 'postgres')
                     AND session_user = 'postgres'
                 )
            THEN qr_token
            ELSE NULL::varchar(255)
        END AS qr_token,
        sla_minutes,
        is_active,
        created_at
    FROM workforce_staging.checkpoints
    WHERE auth.role() = 'service_role'
       OR workforce_staging.is_trusted_bwm_operational_reader(tenant_id::text)
       OR workforce_staging.is_trusted_field_personnel_facility(tenant_id::text, facility_id)
       OR (
           (current_setting('role', true) IS NULL OR current_setting('role', true) = 'none' OR current_setting('role', true) = 'postgres')
           AND session_user = 'postgres'
       );

GRANT SELECT ON public.workforce_checkpoints TO authenticated, service_role, postgres;
REVOKE ALL ON public.workforce_checkpoints FROM anon;

NOTIFY pgrst, 'reload schema';

