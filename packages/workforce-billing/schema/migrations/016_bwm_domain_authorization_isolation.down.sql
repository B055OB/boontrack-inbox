-- ============================================================================
-- Migration 016 DOWN: Revert BWM Domain Authorization Isolation (Restore 010/011 Policies)
-- Target Schema: workforce_staging / public
-- NON-DESTRUCTIVE ROLLBACK SCRIPT FOR DISPOSABLE CI ROLLBACK VERIFICATION.
-- ============================================================================

-- 1. Restore base table SELECT grant & public.workforce_checkpoints view from Migration 011
GRANT SELECT ON workforce_staging.checkpoints TO authenticated;

CREATE OR REPLACE VIEW public.workforce_checkpoints
WITH (security_invoker = true)
AS SELECT * FROM workforce_staging.checkpoints;

GRANT SELECT ON public.workforce_checkpoints TO authenticated;
REVOKE ALL ON public.workforce_checkpoints FROM anon;

-- 2. Restore BWM operational isolation policies from Migration 011
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'facilities', 'personnel', 'checkpoints', 'attendance_logs',
        'checkpoint_scans', 'incidents', 'shift_handovers', 'notification_outbox'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS rls_%I_select ON workforce_staging.%I;', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS rls_%I_mutation ON workforce_staging.%I;', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS rls_%I_isolation ON workforce_staging.%I;', tbl, tbl);
        EXECUTE format('
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
        ', tbl, tbl);
    END LOOP;
END;
$$;

GRANT ALL ON workforce_staging.notification_outbox TO postgres, service_role;

-- 3. Restore credential_audit_logs SELECT policy from Migration 011
DROP POLICY IF EXISTS rls_credential_audit_logs_isolation ON workforce_staging.credential_audit_logs;
CREATE POLICY rls_credential_audit_logs_isolation ON workforce_staging.credential_audit_logs
    FOR SELECT
    TO public
    USING (
        auth.role() = 'service_role' OR
        workforce_staging.is_trusted_tenant_member(tenant_id::text, 'OWNER')
    );

-- 4. Restore Commerce policies & views from Migration 010
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

GRANT ALL ON public.products TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
REVOKE ALL ON public.products FROM anon;

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

DROP POLICY IF EXISTS rls_tenant_memberships_select ON workforce_staging.tenant_memberships;
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

GRANT ALL ON public.tenant_memberships TO postgres, service_role;
GRANT SELECT ON public.tenant_memberships TO authenticated;
REVOKE ALL ON public.tenant_memberships FROM anon;

-- 5. Drop Migration 016 helper functions
DROP FUNCTION IF EXISTS workforce_staging.is_trusted_field_personnel_facility(TEXT, UUID);
DROP FUNCTION IF EXISTS workforce_staging.is_trusted_field_personnel_self(TEXT, UUID);
DROP FUNCTION IF EXISTS workforce_staging.is_trusted_bwm_admin(TEXT);
DROP FUNCTION IF EXISTS workforce_staging.is_trusted_bwm_operational_reader(TEXT);
DROP FUNCTION IF EXISTS workforce_staging.is_trusted_commerce_member(TEXT, TEXT);
DROP FUNCTION IF EXISTS workforce_staging.get_trusted_tenant_member_role(TEXT);

NOTIFY pgrst, 'reload schema';

