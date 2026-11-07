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
       AND session_user = 'postgres' THEN
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

-- D. workforce_staging.tenant_memberships (Round 3K: Role-Bounded Membership Visibility)
-- Visible ONLY to OWNER and MERCHANT (and service_role). CS and OPERATOR cannot inspect memberships.
DROP POLICY IF EXISTS rls_tenant_memberships_isolation ON workforce_staging.tenant_memberships;
DROP POLICY IF EXISTS rls_tenant_memberships_select ON workforce_staging.tenant_memberships;
DROP POLICY IF EXISTS rls_tenant_memberships_mutation ON workforce_staging.tenant_memberships;

CREATE POLICY rls_tenant_memberships_select ON workforce_staging.tenant_memberships
    FOR SELECT TO public
    USING (
        auth.role() = 'service_role' OR
        (
            (workforce_staging.is_trusted_tenant_member(tenant_id, 'MERCHANT') OR workforce_staging.is_trusted_tenant_member(tenant_slug, 'MERCHANT')) AND
            (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR tenant_id = current_setting('app.current_agency_id', true) OR tenant_slug = current_setting('app.current_agency_id', true)) AND
            (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.current_tenant_id', true) OR tenant_slug = current_setting('app.current_tenant_id', true))
        )
    );

CREATE POLICY rls_tenant_memberships_mutation ON workforce_staging.tenant_memberships
    FOR ALL TO public
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

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

-- Refresh public base views with Column Confidentiality & Masking (Round 3I)
DROP VIEW IF EXISTS public.tenants CASCADE;
DROP VIEW IF EXISTS public.products CASCADE;
DROP VIEW IF EXISTS public.tenant_memberships CASCADE;

CREATE OR REPLACE VIEW public.tenants 
WITH (security_invoker = false) AS 
    SELECT 
        id,
        slug,
        name,
        category,
        tier,
        status,
        is_active,
        CASE 
            WHEN auth.role() = 'service_role' 
                 OR workforce_staging.is_trusted_tenant_member(id::text, 'OWNER') 
                 OR workforce_staging.is_trusted_tenant_member(slug, 'OWNER')
            THEN metadata 
            ELSE NULL 
        END AS metadata,
        CASE 
            WHEN auth.role() = 'service_role' 
                 OR workforce_staging.is_trusted_tenant_member(id::text, 'OWNER') 
                 OR workforce_staging.is_trusted_tenant_member(slug, 'OWNER')
            THEN phone 
            ELSE NULL 
        END AS phone,
        CASE 
            WHEN auth.role() = 'service_role' 
                 OR workforce_staging.is_trusted_tenant_member(id::text, 'OWNER') 
                 OR workforce_staging.is_trusted_tenant_member(slug, 'OWNER')
            THEN whatsapp_number 
            ELSE NULL 
        END AS whatsapp_number,
        created_at,
        updated_at,
        subscription_status,
        trial_ends_at,
        subscription_ends_at,
        bot_paused,
        is_bot_active,
        CASE 
            WHEN auth.role() = 'service_role' 
                 OR workforce_staging.is_trusted_tenant_member(id::text, 'OWNER') 
                 OR workforce_staging.is_trusted_tenant_member(slug, 'OWNER')
            THEN waba_phone_number_id 
            ELSE NULL 
        END AS waba_phone_number_id,
        CASE 
            WHEN auth.role() = 'service_role' 
                 OR workforce_staging.is_trusted_tenant_member(id::text, 'OWNER') 
                 OR workforce_staging.is_trusted_tenant_member(slug, 'OWNER')
            THEN telegram_chat_id 
            ELSE NULL 
        END AS telegram_chat_id,
        logo_url,
        avatar_url,
        qris_image_url,
        bio,
        public_storefront_enabled
    FROM workforce_staging.tenants
    WHERE auth.role() = 'service_role' 
       OR (
           (workforce_staging.is_trusted_tenant_member(id::text) OR workforce_staging.is_trusted_tenant_member(slug))
           AND (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR slug = current_setting('app.current_tenant_id', true) OR id::text = current_setting('app.current_tenant_id', true))
           AND (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR slug = current_setting('app.current_agency_id', true) OR id::text = current_setting('app.current_agency_id', true))
       )
       OR (
           (current_setting('role', true) IS NULL OR current_setting('role', true) = 'none' OR current_setting('role', true) = 'postgres')
           AND session_user = 'postgres'
       );

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
                 OR workforce_staging.is_trusted_tenant_member(tenant_id, 'MERCHANT')
            THEN asset_reference 
            ELSE NULL 
        END AS asset_reference,
        CASE 
            WHEN auth.role() = 'service_role' 
                 OR workforce_staging.is_trusted_tenant_member(tenant_id, 'MERCHANT')
            THEN license_status 
            ELSE NULL 
        END AS license_status,
        is_digital,
        requires_shipping,
        is_unlimited_stock,
        CASE 
            WHEN auth.role() = 'service_role' 
                 OR workforce_staging.is_trusted_tenant_member(tenant_id, 'MERCHANT')
            THEN fulfillment_metadata 
            ELSE NULL 
        END AS fulfillment_metadata,
        is_publicly_published
    FROM workforce_staging.products
    WHERE auth.role() = 'service_role' 
       OR (
           workforce_staging.is_trusted_tenant_member(tenant_id)
           AND (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR tenant_id = current_setting('app.current_agency_id', true))
           AND (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.current_tenant_id', true))
       )
       OR (
           (current_setting('role', true) IS NULL OR current_setting('role', true) = 'none' OR current_setting('role', true) = 'postgres')
           AND session_user = 'postgres'
       );

CREATE OR REPLACE VIEW public.tenant_memberships 
WITH (security_invoker = false) AS 
    SELECT * FROM workforce_staging.tenant_memberships
    WHERE auth.role() = 'service_role' 
       OR (
           (workforce_staging.is_trusted_tenant_member(tenant_id, 'MERCHANT') OR workforce_staging.is_trusted_tenant_member(tenant_slug, 'MERCHANT'))
           AND (nullif(current_setting('app.current_agency_id', true), '') IS NULL OR tenant_id = current_setting('app.current_agency_id', true) OR tenant_slug = current_setting('app.current_agency_id', true))
           AND (nullif(current_setting('app.current_tenant_id', true), '') IS NULL OR tenant_id = current_setting('app.current_tenant_id', true) OR tenant_slug = current_setting('app.current_tenant_id', true))
       )
       OR (
           (current_setting('role', true) IS NULL OR current_setting('role', true) = 'none' OR current_setting('role', true) = 'postgres')
           AND session_user = 'postgres'
       );

GRANT ALL ON public.tenants TO postgres, service_role;
GRANT ALL ON public.products TO postgres, service_role;
GRANT ALL ON public.tenant_memberships TO postgres, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT ON public.tenant_memberships TO authenticated;

REVOKE ALL ON public.tenants FROM anon;
REVOKE ALL ON public.products FROM anon;
REVOKE ALL ON public.tenant_memberships FROM anon;

-- Direct base table permission hardening (Round 3J Remediation)
REVOKE ALL ON workforce_staging.tenants FROM authenticated;
REVOKE ALL ON workforce_staging.products FROM authenticated;
GRANT ALL ON workforce_staging.tenants TO postgres, service_role;
GRANT ALL ON workforce_staging.products TO postgres, service_role;

-- ============================================================================
-- 5. Updatable View Triggers (INSTEAD OF DML on Masked Views)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_fn_tenants_view_dml()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = workforce_staging, public
AS $$
BEGIN
    IF auth.role() <> 'service_role' THEN
        IF TG_OP = 'INSERT' THEN
            IF NOT (workforce_staging.is_trusted_tenant_member(NEW.id::text, 'OWNER') OR workforce_staging.is_trusted_tenant_member(NEW.slug, 'OWNER')) THEN
                RAISE EXCEPTION 'permission denied for table tenants' USING ERRCODE = '42501';
            END IF;
        ELSIF TG_OP = 'UPDATE' THEN
            IF NOT (workforce_staging.is_trusted_tenant_member(OLD.id::text, 'OWNER') OR workforce_staging.is_trusted_tenant_member(OLD.slug, 'OWNER')) THEN
                RETURN NULL;
            END IF;
        ELSIF TG_OP = 'DELETE' THEN
            IF NOT (workforce_staging.is_trusted_tenant_member(OLD.id::text, 'OWNER') OR workforce_staging.is_trusted_tenant_member(OLD.slug, 'OWNER')) THEN
                RETURN NULL;
            END IF;
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO workforce_staging.tenants (
            id, slug, name, category, tier, status, is_active, metadata, phone, whatsapp_number,
            subscription_status, trial_ends_at, subscription_ends_at, bot_paused, is_bot_active,
            waba_phone_number_id, telegram_chat_id, logo_url, avatar_url, qris_image_url, bio, public_storefront_enabled
        ) VALUES (
            COALESCE(NEW.id, gen_random_uuid()), NEW.slug, NEW.name, NEW.category, NEW.tier, NEW.status,
            NEW.is_active, NEW.metadata, NEW.phone, NEW.whatsapp_number, NEW.subscription_status,
            NEW.trial_ends_at, NEW.subscription_ends_at, NEW.bot_paused, NEW.is_bot_active,
            NEW.waba_phone_number_id, NEW.telegram_chat_id, NEW.logo_url, NEW.avatar_url,
            NEW.qris_image_url, NEW.bio, COALESCE(NEW.public_storefront_enabled, FALSE)
        )
        RETURNING * INTO NEW;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'Tenant ID is immutable' USING ERRCODE = '42501';
        END IF;

        UPDATE workforce_staging.tenants SET
            slug = COALESCE(NEW.slug, slug),
            name = COALESCE(NEW.name, name),
            category = COALESCE(NEW.category, category),
            tier = COALESCE(NEW.tier, tier),
            status = COALESCE(NEW.status, status),
            is_active = COALESCE(NEW.is_active, is_active),
            metadata = COALESCE(NEW.metadata, metadata),
            phone = COALESCE(NEW.phone, phone),
            whatsapp_number = COALESCE(NEW.whatsapp_number, whatsapp_number),
            subscription_status = COALESCE(NEW.subscription_status, subscription_status),
            trial_ends_at = COALESCE(NEW.trial_ends_at, trial_ends_at),
            subscription_ends_at = COALESCE(NEW.subscription_ends_at, subscription_ends_at),
            bot_paused = COALESCE(NEW.bot_paused, bot_paused),
            is_bot_active = COALESCE(NEW.is_bot_active, is_bot_active),
            waba_phone_number_id = COALESCE(NEW.waba_phone_number_id, waba_phone_number_id),
            telegram_chat_id = COALESCE(NEW.telegram_chat_id, telegram_chat_id),
            logo_url = COALESCE(NEW.logo_url, logo_url),
            avatar_url = COALESCE(NEW.avatar_url, avatar_url),
            qris_image_url = COALESCE(NEW.qris_image_url, qris_image_url),
            bio = COALESCE(NEW.bio, bio),
            public_storefront_enabled = COALESCE(NEW.public_storefront_enabled, public_storefront_enabled),
            updated_at = NOW()
        WHERE id = OLD.id
        RETURNING * INTO NEW;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM workforce_staging.tenants WHERE id = OLD.id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_view_dml ON public.tenants;
CREATE TRIGGER trg_tenants_view_dml
INSTEAD OF INSERT OR UPDATE OR DELETE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_tenants_view_dml();

CREATE OR REPLACE FUNCTION public.trg_fn_products_view_dml()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = workforce_staging, public
AS $$
BEGIN
    IF auth.role() <> 'service_role' THEN
        IF TG_OP = 'INSERT' THEN
            IF NOT workforce_staging.is_trusted_tenant_member(NEW.tenant_id, 'MERCHANT') THEN
                RAISE EXCEPTION 'permission denied for table products' USING ERRCODE = '42501';
            END IF;
        ELSIF TG_OP = 'UPDATE' THEN
            IF NOT workforce_staging.is_trusted_tenant_member(OLD.tenant_id, 'MERCHANT') THEN
                RETURN NULL;
            END IF;
        ELSIF TG_OP = 'DELETE' THEN
            IF NOT workforce_staging.is_trusted_tenant_member(OLD.tenant_id, 'MERCHANT') THEN
                RETURN NULL;
            END IF;
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO workforce_staging.products (
            id, tenant_id, title, slug, price, promo_price, category, product_type,
            description, stock, is_active, status, sku, name, image, image_url,
            asset_reference, license_status, is_digital, requires_shipping,
            is_unlimited_stock, fulfillment_metadata, is_publicly_published
        ) VALUES (
            COALESCE(NEW.id, gen_random_uuid()), NEW.tenant_id, NEW.title, NEW.slug,
            COALESCE(NEW.price, 0), NEW.promo_price, COALESCE(NEW.category, 'service'),
            COALESCE(NEW.product_type, 'SERVICE'), NEW.description, COALESCE(NEW.stock, 999),
            COALESCE(NEW.is_active, TRUE), COALESCE(NEW.status, 'ACTIVE'), NEW.sku,
            NEW.name, NEW.image, NEW.image_url, NEW.asset_reference, NEW.license_status,
            COALESCE(NEW.is_digital, FALSE), COALESCE(NEW.requires_shipping, FALSE),
            COALESCE(NEW.is_unlimited_stock, TRUE), COALESCE(NEW.fulfillment_metadata, '{}'::jsonb),
            COALESCE(NEW.is_publicly_published, FALSE)
        )
        RETURNING * INTO NEW;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
            RAISE EXCEPTION 'Cross-tenant migration prohibited' USING ERRCODE = '42501';
        END IF;

        UPDATE workforce_staging.products SET
            tenant_id = OLD.tenant_id,
            title = COALESCE(NEW.title, title),
            slug = COALESCE(NEW.slug, slug),
            price = COALESCE(NEW.price, price),
            promo_price = COALESCE(NEW.promo_price, promo_price),
            category = COALESCE(NEW.category, category),
            product_type = COALESCE(NEW.product_type, product_type),
            description = COALESCE(NEW.description, description),
            stock = COALESCE(NEW.stock, stock),
            is_active = COALESCE(NEW.is_active, is_active),
            status = COALESCE(NEW.status, status),
            sku = COALESCE(NEW.sku, sku),
            name = COALESCE(NEW.name, name),
            image = COALESCE(NEW.image, image),
            image_url = COALESCE(NEW.image_url, image_url),
            asset_reference = COALESCE(NEW.asset_reference, asset_reference),
            license_status = COALESCE(NEW.license_status, license_status),
            is_digital = COALESCE(NEW.is_digital, is_digital),
            requires_shipping = COALESCE(NEW.requires_shipping, requires_shipping),
            is_unlimited_stock = COALESCE(NEW.is_unlimited_stock, is_unlimited_stock),
            fulfillment_metadata = COALESCE(NEW.fulfillment_metadata, fulfillment_metadata),
            is_publicly_published = COALESCE(NEW.is_publicly_published, is_publicly_published),
            updated_at = NOW()
        WHERE id = OLD.id
        RETURNING * INTO NEW;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM workforce_staging.products WHERE id = OLD.id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_view_dml ON public.products;
CREATE TRIGGER trg_products_view_dml
INSTEAD OF INSERT OR UPDATE OR DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_products_view_dml();

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
