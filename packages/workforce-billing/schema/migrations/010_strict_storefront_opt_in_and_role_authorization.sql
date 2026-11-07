-- Migration 010: Strict Storefront Opt-In, Role-Based Authorization & Safe Revocation
-- BWM Gate 1 Round 3H: CTO Mandate
-- Target Schema: workforce_staging & public

-- ============================================================================
-- 1. Add Explicit Publication State Columns (Default-Deny Private Visibility)
-- ============================================================================

-- A. Tenants: Public storefront disabled by default (Active does not imply Public)
ALTER TABLE workforce_staging.tenants 
    ADD COLUMN IF NOT EXISTS public_storefront_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_tenants_public_storefront 
    ON workforce_staging.tenants(public_storefront_enabled) 
    WHERE public_storefront_enabled = TRUE;

-- B. Products: Public publication disabled by default (Active does not imply Published)
ALTER TABLE workforce_staging.products 
    ADD COLUMN IF NOT EXISTS is_publicly_published BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_products_is_publicly_published 
    ON workforce_staging.products(is_publicly_published) 
    WHERE is_publicly_published = TRUE;

-- ============================================================================
-- 2. Role-Based Database Authorization & Revocation-Safe Identity Function
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
       AND session_user = 'postgres' AND v_role IS NULL THEN
        RETURN TRUE;
    END IF;

    -- 2. Extract verified user UUID
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        -- Missing, unauthenticated, or anonymous context strictly fails closed
        RETURN FALSE;
    END IF;

    -- 3. Check active database membership (AUTHORITATIVE SSOT - Blocker E)
    -- Even if JWT contains an app_metadata tenant_id claim, database membership MUST exist and be active!
    SELECT tm.role, tm.is_active 
    INTO v_member_role, v_is_active
    FROM workforce_staging.tenant_memberships tm
    WHERE tm.user_id = v_uid
      AND (tm.tenant_id = target_tenant_id OR tm.tenant_slug = target_tenant_id)
    LIMIT 1;

    -- If no membership record exists or is_active is FALSE (revoked), fail closed immediately
    IF v_member_role IS NULL OR v_is_active IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    -- 4. Check if JWT claims specify a tenant selector, and verify it matches target
    BEGIN
        v_jwt_tenant_id := auth.jwt() -> 'app_metadata' ->> 'tenant_id';
        IF v_jwt_tenant_id IS NOT NULL AND v_jwt_tenant_id != target_tenant_id THEN
            -- Stale or mismatched tenant selector in JWT fails closed
            RETURN FALSE;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Ignore malformed JSON
    END;

    -- 5. Role-based authorization hierarchy (Blocker D)
    -- If no specific role is required, any active member (OWNER, MERCHANT, CS, OPERATOR) can access
    IF required_role IS NULL THEN
        RETURN TRUE;
    END IF;

    -- Explicit Role Hierarchy:
    -- 'OWNER': Full administrative control (billing, private credentials, tenant settings, membership)
    -- 'MERCHANT': Operational product management (product CRUD, inventory)
    -- 'OPERATOR': Operational execution (order fulfillment, catalog view)
    -- 'CS': Read-only customer support
    IF required_role = 'OWNER' THEN
        RETURN v_member_role = 'OWNER';
    ELSIF required_role = 'MERCHANT' THEN
        RETURN v_member_role IN ('OWNER', 'MERCHANT');
    ELSIF required_role = 'OPERATOR' THEN
        RETURN v_member_role IN ('OWNER', 'MERCHANT', 'OPERATOR');
    ELSIF required_role = 'CS' THEN
        RETURN v_member_role IN ('OWNER', 'MERCHANT', 'OPERATOR', 'CS');
    END IF;

    RETURN v_member_role = required_role;
END;
$$;

-- Unambiguous 1-parameter wrapper delegating to 2-parameter implementation
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

-- ============================================================================
-- 3. Harden RLS Policies with Role-Based Constraints
-- ============================================================================

-- A. workforce_staging.tenants
-- Active members can read their own tenant; ONLY OWNER can mutate (INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS rls_tenants_isolation ON workforce_staging.tenants;
DROP POLICY IF EXISTS rls_tenants_select ON workforce_staging.tenants;
DROP POLICY IF EXISTS rls_tenants_insert ON workforce_staging.tenants;
DROP POLICY IF EXISTS rls_tenants_update ON workforce_staging.tenants;
DROP POLICY IF EXISTS rls_tenants_delete ON workforce_staging.tenants;

CREATE POLICY rls_tenants_select ON workforce_staging.tenants
    FOR SELECT TO public
    USING (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(slug) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR slug = current_setting('app.current_tenant_id', true)) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR slug = current_setting('app.current_agency_id', true))
        ) OR
        (
            workforce_staging.is_trusted_tenant_member(id::text) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR id::text = current_setting('app.current_tenant_id', true)) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR id::text = current_setting('app.current_agency_id', true))
        )
    );

CREATE POLICY rls_tenants_insert ON workforce_staging.tenants
    FOR INSERT TO public
    WITH CHECK (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(slug, 'OWNER') AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR slug = current_setting('app.current_tenant_id', true)) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR slug = current_setting('app.current_agency_id', true))
        ) OR
        (
            workforce_staging.is_trusted_tenant_member(id::text, 'OWNER') AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR id::text = current_setting('app.current_tenant_id', true)) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR id::text = current_setting('app.current_agency_id', true))
        )
    );

CREATE POLICY rls_tenants_update ON workforce_staging.tenants
    FOR UPDATE TO public
    USING (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(slug, 'OWNER') AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR slug = current_setting('app.current_tenant_id', true)) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR slug = current_setting('app.current_agency_id', true))
        ) OR
        (
            workforce_staging.is_trusted_tenant_member(id::text, 'OWNER') AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR id::text = current_setting('app.current_tenant_id', true)) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR id::text = current_setting('app.current_agency_id', true))
        )
    )
    WITH CHECK (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(slug, 'OWNER') AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR slug = current_setting('app.current_tenant_id', true)) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR slug = current_setting('app.current_agency_id', true))
        ) OR
        (
            workforce_staging.is_trusted_tenant_member(id::text, 'OWNER') AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR id::text = current_setting('app.current_tenant_id', true)) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR id::text = current_setting('app.current_agency_id', true))
        )
    );

CREATE POLICY rls_tenants_delete ON workforce_staging.tenants
    FOR DELETE TO public
    USING (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(slug, 'OWNER') AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR slug = current_setting('app.current_tenant_id', true)) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR slug = current_setting('app.current_agency_id', true))
        ) OR
        (
            workforce_staging.is_trusted_tenant_member(id::text, 'OWNER') AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR id::text = current_setting('app.current_tenant_id', true)) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR id::text = current_setting('app.current_agency_id', true))
        )
    );

-- B. workforce_staging.products
-- Active members can read products; ONLY OWNER and MERCHANT can mutate (INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS rls_products_isolation ON workforce_staging.products;
DROP POLICY IF EXISTS rls_products_select ON workforce_staging.products;
DROP POLICY IF EXISTS rls_products_insert ON workforce_staging.products;
DROP POLICY IF EXISTS rls_products_update ON workforce_staging.products;
DROP POLICY IF EXISTS rls_products_delete ON workforce_staging.products;

CREATE POLICY rls_products_select ON workforce_staging.products
    FOR SELECT TO public
    USING (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(tenant_id) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR tenant_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.current_tenant_id', true))
        )
    );

CREATE POLICY rls_products_insert ON workforce_staging.products
    FOR INSERT TO public
    WITH CHECK (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(tenant_id, 'MERCHANT') AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR tenant_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.current_tenant_id', true))
        )
    );

CREATE POLICY rls_products_update ON workforce_staging.products
    FOR UPDATE TO public
    USING (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(tenant_id, 'MERCHANT') AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR tenant_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.current_tenant_id', true))
        )
    )
    WITH CHECK (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(tenant_id, 'MERCHANT') AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR tenant_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.current_tenant_id', true))
        )
    );

CREATE POLICY rls_products_delete ON workforce_staging.products
    FOR DELETE TO public
    USING (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(tenant_id, 'MERCHANT') AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR tenant_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.current_tenant_id', true))
        )
    );

-- C. workforce_staging.branch_credit_pools
-- Active members can read pools; ONLY OWNER can mutate/administer credit pools
DROP POLICY IF EXISTS rls_branch_credit_pools_isolation ON workforce_staging.branch_credit_pools;
DROP POLICY IF EXISTS rls_branch_credit_pools_select ON workforce_staging.branch_credit_pools;
DROP POLICY IF EXISTS rls_branch_credit_pools_insert ON workforce_staging.branch_credit_pools;
DROP POLICY IF EXISTS rls_branch_credit_pools_update ON workforce_staging.branch_credit_pools;
DROP POLICY IF EXISTS rls_branch_credit_pools_delete ON workforce_staging.branch_credit_pools;

CREATE POLICY rls_branch_credit_pools_select ON workforce_staging.branch_credit_pools
    FOR SELECT TO public
    USING (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(agency_id) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR agency_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR agency_id = current_setting('app.current_tenant_id', true))
        )
    );

CREATE POLICY rls_branch_credit_pools_insert ON workforce_staging.branch_credit_pools
    FOR INSERT TO public
    WITH CHECK (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(agency_id, 'OWNER') AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR agency_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR agency_id = current_setting('app.current_tenant_id', true))
        )
    );

CREATE POLICY rls_branch_credit_pools_update ON workforce_staging.branch_credit_pools
    FOR UPDATE TO public
    USING (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(agency_id, 'OWNER') AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR agency_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR agency_id = current_setting('app.current_tenant_id', true))
        )
    )
    WITH CHECK (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(agency_id, 'OWNER') AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR agency_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR agency_id = current_setting('app.current_tenant_id', true))
        )
    );

CREATE POLICY rls_branch_credit_pools_delete ON workforce_staging.branch_credit_pools
    FOR DELETE TO public
    USING (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(agency_id, 'OWNER') AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR agency_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR agency_id = current_setting('app.current_tenant_id', true))
        )
    );

-- ============================================================================
-- 4. Recreate Safe Storefront Views with Strict Opt-In Publication Filter
-- ============================================================================

-- Storefront Tenants: Strictly requires public_storefront_enabled = TRUE
CREATE OR REPLACE VIEW public.storefront_tenants 
WITH (security_invoker = false) AS
    SELECT 
        id,
        slug,
        name,
        category,
        tier,
        status,
        is_active,
        logo_url,
        avatar_url,
        bio,
        created_at
    FROM workforce_staging.tenants
    WHERE is_active = TRUE 
      AND status = 'active'
      AND public_storefront_enabled = TRUE;

-- Storefront Products: Strictly requires BOTH tenant opt-in AND product publication
CREATE OR REPLACE VIEW public.storefront_products
WITH (security_invoker = false) AS
    SELECT
        p.id,
        p.tenant_id,
        p.title,
        p.name,
        p.slug,
        p.price,
        p.promo_price,
        p.category,
        p.product_type,
        p.description,
        p.stock,
        p.is_unlimited_stock,
        p.image,
        p.image_url,
        p.is_active,
        p.status,
        p.sku,
        p.created_at
    FROM workforce_staging.products p
    JOIN workforce_staging.tenants t ON (t.id::text = p.tenant_id OR t.slug = p.tenant_id)
    WHERE p.is_active = TRUE 
      AND p.status = 'ACTIVE'
      AND p.is_publicly_published = TRUE
      AND t.is_active = TRUE
      AND t.status = 'active'
      AND t.public_storefront_enabled = TRUE;

-- Grant least-privilege permissions on safe storefront projections
GRANT SELECT ON public.storefront_tenants TO anon, authenticated;
GRANT SELECT ON public.storefront_products TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.storefront_tenants FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.storefront_products FROM anon, authenticated;

-- Refresh public base views so PostgREST schema cache includes newly added columns
CREATE OR REPLACE VIEW public.tenants 
WITH (security_invoker = true) AS 
    SELECT * FROM workforce_staging.tenants;

CREATE OR REPLACE VIEW public.products 
WITH (security_invoker = true) AS 
    SELECT * FROM workforce_staging.products;

GRANT ALL ON public.tenants TO postgres, service_role;
GRANT ALL ON public.products TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
REVOKE ALL ON public.tenants FROM anon;
REVOKE ALL ON public.products FROM anon;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
