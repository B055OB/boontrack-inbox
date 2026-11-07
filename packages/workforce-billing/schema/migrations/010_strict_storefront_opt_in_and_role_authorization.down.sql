-- Migration 010 Down: Security-Preserving Rollback for Round 3H
-- Target Schema: workforce_staging & public

-- 1. Restore Migration 009 Storefront Views (Without publication filter, but strictly safe fields)
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

-- CTO Mandate Round 3K: In rolled-back state, public storefront projections MUST remain strictly fail-closed.
-- Blanket access for authenticated users is eliminated; only service_role retains access.
REVOKE ALL ON public.storefront_tenants FROM authenticated, anon;
REVOKE ALL ON public.storefront_products FROM authenticated, anon;
GRANT ALL ON public.storefront_tenants TO postgres, service_role;
GRANT ALL ON public.storefront_products TO postgres, service_role;
DROP VIEW IF EXISTS public.tenant_memberships CASCADE;

-- 2. Restore Migration 009 Policies on tenants, products, branch_credit_pools
DROP POLICY IF EXISTS rls_tenants_isolation ON workforce_staging.tenants;
DROP POLICY IF EXISTS rls_tenants_select ON workforce_staging.tenants;
DROP POLICY IF EXISTS rls_tenants_insert ON workforce_staging.tenants;
DROP POLICY IF EXISTS rls_tenants_update ON workforce_staging.tenants;
DROP POLICY IF EXISTS rls_tenants_delete ON workforce_staging.tenants;

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

DROP POLICY IF EXISTS rls_products_isolation ON workforce_staging.products;
DROP POLICY IF EXISTS rls_products_select ON workforce_staging.products;
DROP POLICY IF EXISTS rls_products_insert ON workforce_staging.products;
DROP POLICY IF EXISTS rls_products_update ON workforce_staging.products;
DROP POLICY IF EXISTS rls_products_delete ON workforce_staging.products;

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

DROP POLICY IF EXISTS rls_branch_credit_pools_isolation ON workforce_staging.branch_credit_pools;
DROP POLICY IF EXISTS rls_branch_credit_pools_select ON workforce_staging.branch_credit_pools;
DROP POLICY IF EXISTS rls_branch_credit_pools_insert ON workforce_staging.branch_credit_pools;
DROP POLICY IF EXISTS rls_branch_credit_pools_update ON workforce_staging.branch_credit_pools;
DROP POLICY IF EXISTS rls_branch_credit_pools_delete ON workforce_staging.branch_credit_pools;

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

-- 3. Restore 1-argument is_trusted_tenant_member function safely
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
    v_role := auth.role();
    IF v_role = 'service_role' THEN
        RETURN TRUE;
    END IF;

    v_active_role := current_setting('role', true);
    IF (v_active_role IS NULL OR v_active_role = 'none' OR v_active_role = 'postgres') AND session_user = 'postgres' AND v_role IS NULL THEN
        RETURN TRUE;
    END IF;

    BEGIN
        v_jwt_tenant_id := auth.jwt() -> 'app_metadata' ->> 'tenant_id';
        IF v_jwt_tenant_id IS NOT NULL AND (v_jwt_tenant_id = target_tenant_id) THEN
            RETURN TRUE;
        END IF;
    EXCEPTION WHEN OTHERS THEN
    END;

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

-- 4. Drop publication indexes and columns safely
DROP INDEX IF EXISTS workforce_staging.idx_tenants_public_storefront;
DROP INDEX IF EXISTS workforce_staging.idx_products_is_publicly_published;

-- Drop base public views first so column drop has no dependent views
DROP VIEW IF EXISTS public.tenants CASCADE;
DROP VIEW IF EXISTS public.products CASCADE;
DROP FUNCTION IF EXISTS public.trg_fn_tenants_view_dml CASCADE;
DROP FUNCTION IF EXISTS public.trg_fn_products_view_dml CASCADE;

ALTER TABLE workforce_staging.tenants DROP COLUMN IF EXISTS public_storefront_enabled;
ALTER TABLE workforce_staging.products DROP COLUMN IF EXISTS is_publicly_published;

-- Recreate base public views strictly with column confidentiality, role-safe projection, and anon revoked
CREATE OR REPLACE VIEW public.tenants 
WITH (security_invoker = true) AS 
    SELECT 
        id, slug, name, category, tier, status, is_active,
        CASE 
            WHEN auth.role() = 'service_role' OR workforce_staging.is_trusted_tenant_member(id::text) OR workforce_staging.is_trusted_tenant_member(slug)
            THEN metadata 
            ELSE NULL 
        END AS metadata,
        CASE 
            WHEN auth.role() = 'service_role' OR workforce_staging.is_trusted_tenant_member(id::text) OR workforce_staging.is_trusted_tenant_member(slug)
            THEN phone 
            ELSE NULL 
        END AS phone,
        CASE 
            WHEN auth.role() = 'service_role' OR workforce_staging.is_trusted_tenant_member(id::text) OR workforce_staging.is_trusted_tenant_member(slug)
            THEN whatsapp_number 
            ELSE NULL 
        END AS whatsapp_number,
        created_at, updated_at, subscription_status, trial_ends_at, subscription_ends_at,
        bot_paused, is_bot_active,
        CASE 
            WHEN auth.role() = 'service_role' OR workforce_staging.is_trusted_tenant_member(id::text) OR workforce_staging.is_trusted_tenant_member(slug)
            THEN waba_phone_number_id 
            ELSE NULL 
        END AS waba_phone_number_id,
        CASE 
            WHEN auth.role() = 'service_role' OR workforce_staging.is_trusted_tenant_member(id::text) OR workforce_staging.is_trusted_tenant_member(slug)
            THEN telegram_chat_id 
            ELSE NULL 
        END AS telegram_chat_id,
        logo_url, avatar_url, qris_image_url, bio
    FROM workforce_staging.tenants;

CREATE OR REPLACE VIEW public.products 
WITH (security_invoker = true) AS 
    SELECT 
        id, tenant_id, title, slug, price, promo_price, category, product_type,
        description, stock, is_active, status, sku, created_at, updated_at,
        name, image, image_url,
        CASE 
            WHEN auth.role() = 'service_role' OR workforce_staging.is_trusted_tenant_member(tenant_id)
            THEN asset_reference 
            ELSE NULL 
        END AS asset_reference,
        CASE 
            WHEN auth.role() = 'service_role' OR workforce_staging.is_trusted_tenant_member(tenant_id)
            THEN license_status 
            ELSE NULL 
        END AS license_status,
        is_digital, requires_shipping, is_unlimited_stock,
        CASE 
            WHEN auth.role() = 'service_role' OR workforce_staging.is_trusted_tenant_member(tenant_id)
            THEN fulfillment_metadata 
            ELSE NULL 
        END AS fulfillment_metadata
    FROM workforce_staging.products;

GRANT ALL ON public.tenants TO postgres, service_role;
GRANT ALL ON public.products TO postgres, service_role;

-- Round 3J: Authenticated users only receive role-checked SELECT; unrestricted DML revoked
GRANT SELECT ON public.tenants TO authenticated;
GRANT SELECT ON public.products TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.tenants FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.products FROM authenticated;

REVOKE ALL ON public.tenants FROM anon;
REVOKE ALL ON public.products FROM anon;

NOTIFY pgrst, 'reload schema';
