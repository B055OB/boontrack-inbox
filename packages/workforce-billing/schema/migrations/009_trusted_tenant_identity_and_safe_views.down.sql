-- Migration 009 Down: Revert Trusted Tenant Identity & Safe Views
-- BWM Gate 1 Round 3G
-- Target Schema: workforce_staging & public

-- 1. Drop safe storefront views
DROP VIEW IF EXISTS public.storefront_products;
DROP VIEW IF EXISTS public.storefront_tenants;

-- 2. Restore previous public views (with security_invoker = false)
DROP VIEW IF EXISTS public.products;
DROP VIEW IF EXISTS public.tenants;

CREATE OR REPLACE VIEW public.tenants AS 
    SELECT * FROM workforce_staging.tenants;

CREATE OR REPLACE VIEW public.products AS 
    SELECT * FROM workforce_staging.products;

GRANT ALL ON public.tenants TO postgres, service_role;
GRANT ALL ON public.products TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT ON public.tenants TO anon;
GRANT SELECT ON public.products TO anon;

-- 3. Restore Migration 008 RLS Policies
DROP POLICY IF EXISTS rls_tenants_isolation ON workforce_staging.tenants;
CREATE POLICY rls_tenants_isolation ON workforce_staging.tenants
    FOR ALL
    TO public
    USING (
        auth.role() = 'service_role' OR
        slug = current_setting('app.current_tenant_id', true) OR
        slug = current_setting('app.current_agency_id', true) OR
        id::text = current_setting('app.current_tenant_id', true) OR
        id::text = current_setting('app.current_agency_id', true)
    )
    WITH CHECK (
        auth.role() = 'service_role' OR
        slug = current_setting('app.current_tenant_id', true) OR
        slug = current_setting('app.current_agency_id', true) OR
        id::text = current_setting('app.current_tenant_id', true) OR
        id::text = current_setting('app.current_agency_id', true)
    );

DROP POLICY IF EXISTS rls_products_isolation ON workforce_staging.products;
CREATE POLICY rls_products_isolation ON workforce_staging.products
    FOR ALL
    TO public
    USING (
        auth.role() = 'service_role' OR
        tenant_id = current_setting('app.current_agency_id', true) OR
        tenant_id = current_setting('app.current_tenant_id', true)
    )
    WITH CHECK (
        auth.role() = 'service_role' OR
        tenant_id = current_setting('app.current_agency_id', true) OR
        tenant_id = current_setting('app.current_tenant_id', true)
    );

DROP POLICY IF EXISTS rls_branch_credit_pools_isolation ON workforce_staging.branch_credit_pools;
CREATE POLICY rls_branch_credit_pools_isolation ON workforce_staging.branch_credit_pools
    FOR ALL
    TO public
    USING (
        auth.role() = 'service_role' OR
        agency_id = current_setting('app.current_agency_id', true) OR
        agency_id = current_setting('app.current_tenant_id', true)
    )
    WITH CHECK (
        auth.role() = 'service_role' OR
        agency_id = current_setting('app.current_agency_id', true) OR
        agency_id = current_setting('app.current_tenant_id', true)
    );

-- 4. Drop is_trusted_tenant_member function
DROP FUNCTION IF EXISTS workforce_staging.is_trusted_tenant_member(TEXT);

-- 5. Drop tenant_memberships table
DROP TABLE IF EXISTS workforce_staging.tenant_memberships;

NOTIFY pgrst, 'reload schema';

