-- Migration 009: Trusted Tenant Identity, Safe Storefront Views, and Exposure Remediation
-- BWM Gate 1 Round 3G: CTO Mandate
-- Target Schema: workforce_staging & public

-- ============================================================================
-- 1. Create workforce_staging.tenant_memberships
-- ============================================================================
CREATE TABLE IF NOT EXISTS workforce_staging.tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    tenant_slug VARCHAR(64) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'OWNER',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_membership_user_tenant UNIQUE (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user_tenant ON workforce_staging.tenant_memberships(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_slug ON workforce_staging.tenant_memberships(tenant_slug);

-- Enable RLS on tenant_memberships
ALTER TABLE workforce_staging.tenant_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenant_memberships_isolation ON workforce_staging.tenant_memberships;
CREATE POLICY rls_tenant_memberships_isolation ON workforce_staging.tenant_memberships
    FOR ALL
    TO public
    USING (
        auth.role() = 'service_role' OR
        user_id = auth.uid()
    )
    WITH CHECK (
        auth.role() = 'service_role'
    );

GRANT ALL ON workforce_staging.tenant_memberships TO postgres, service_role;
GRANT SELECT ON workforce_staging.tenant_memberships TO authenticated;
REVOKE ALL ON workforce_staging.tenant_memberships FROM anon;

-- ============================================================================
-- 2. Create Security Definer Function: is_trusted_tenant_member
-- ============================================================================
CREATE OR REPLACE FUNCTION workforce_staging.is_trusted_tenant_member(target_tenant_id TEXT)
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
    v_jwt_tenant_id TEXT;
BEGIN
    -- 1. Service role bypasses RLS
    v_role := auth.role();
    IF v_role = 'service_role' THEN
        RETURN TRUE;
    END IF;

    -- Direct postgres connection without an assumed unprivileged role bypasses RLS
    v_active_role := current_setting('role', true);
    IF (v_active_role IS NULL OR v_active_role = 'none' OR v_active_role = 'postgres') AND session_user = 'postgres' AND v_role IS NULL THEN
        RETURN TRUE;
    END IF;

    -- 2. Check auth.jwt() claims for trusted tenant claims if present
    BEGIN
        v_jwt_tenant_id := auth.jwt() -> 'app_metadata' ->> 'tenant_id';
        IF v_jwt_tenant_id IS NOT NULL AND (v_jwt_tenant_id = target_tenant_id) THEN
            RETURN TRUE;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- ignore malformed JSON in claims
    END;

    -- 3. Check auth.uid() against active memberships in workforce_staging.tenant_memberships
    v_uid := auth.uid();
    IF v_uid IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 
            FROM workforce_staging.tenant_memberships tm
            WHERE tm.user_id = v_uid
              AND tm.is_active = TRUE
              AND (tm.tenant_id = target_tenant_id OR tm.tenant_slug = target_tenant_id)
        ) THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$;

-- ============================================================================
-- 3. Harden RLS Policies on Tenants, Products, and Credit Pools
-- ============================================================================

-- A. workforce_staging.tenants
DROP POLICY IF EXISTS rls_tenants_isolation ON workforce_staging.tenants;
CREATE POLICY rls_tenants_isolation ON workforce_staging.tenants
    FOR ALL
    TO public
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
    )
    WITH CHECK (
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

-- B. workforce_staging.products
DROP POLICY IF EXISTS rls_products_isolation ON workforce_staging.products;
CREATE POLICY rls_products_isolation ON workforce_staging.products
    FOR ALL
    TO public
    USING (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(tenant_id) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR tenant_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.current_tenant_id', true))
        )
    )
    WITH CHECK (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(tenant_id) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR tenant_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.current_tenant_id', true))
        )
    );

-- C. workforce_staging.branch_credit_pools
DROP POLICY IF EXISTS rls_branch_credit_pools_isolation ON workforce_staging.branch_credit_pools;
CREATE POLICY rls_branch_credit_pools_isolation ON workforce_staging.branch_credit_pools
    FOR ALL
    TO public
    USING (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(agency_id) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR agency_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR agency_id = current_setting('app.current_tenant_id', true))
        )
    )
    WITH CHECK (
        auth.role() = 'service_role' OR
        (
            workforce_staging.is_trusted_tenant_member(agency_id) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR agency_id = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR agency_id = current_setting('app.current_tenant_id', true))
        )
    );

-- ============================================================================
-- 4. Remediate Public Views (Blocker A)
-- ============================================================================

-- A. Enforce security_invoker on existing public views so callers cannot bypass underlying RLS
ALTER VIEW public.tenants SET (security_invoker = true);
ALTER VIEW public.products SET (security_invoker = true);

-- B. Revoke all privileges on full-table public views from anon
REVOKE ALL ON public.tenants FROM anon;
REVOKE ALL ON public.products FROM anon;
GRANT ALL ON public.tenants TO postgres, service_role;
GRANT ALL ON public.products TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;

-- C. Create safe storefront views exposing strictly non-sensitive fields
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
    WHERE is_active = TRUE AND status = 'active';

CREATE OR REPLACE VIEW public.storefront_products
WITH (security_invoker = false) AS
    SELECT
        id,
        tenant_id,
        title,
        name,
        slug,
        price,
        promo_price,
        category,
        product_type,
        description,
        stock,
        is_unlimited_stock,
        image,
        image_url,
        is_active,
        status,
        sku,
        created_at
    FROM workforce_staging.products
    WHERE is_active = TRUE AND status = 'ACTIVE';

-- Grant read privileges on safe storefront views
GRANT SELECT ON public.storefront_tenants TO anon, authenticated;
GRANT SELECT ON public.storefront_products TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.storefront_tenants FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.storefront_products FROM anon, authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
