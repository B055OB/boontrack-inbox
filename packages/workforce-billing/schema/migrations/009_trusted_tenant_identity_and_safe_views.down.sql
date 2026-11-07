-- Migration 009 Down: Security-Preserving Rollback
-- BWM Gate 1 Round 3H Remediation
-- Target Schema: workforce_staging & public

-- 1. Drop safe storefront views safely
DROP VIEW IF EXISTS public.storefront_products;
DROP VIEW IF EXISTS public.storefront_tenants;

-- 2. Restore base public views WITH security_invoker = true and STRICT REVOKE from anon
-- In accordance with CTO Mandate Round 3H: Rollback MUST NEVER restore anonymous access to full tables.
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

-- Strictly REVOKE from anon to preserve default-deny security boundary
REVOKE ALL ON public.tenants FROM anon;
REVOKE ALL ON public.products FROM anon;

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

-- 4. Drop function safely only after dependent policies are reverted
DROP FUNCTION IF EXISTS workforce_staging.is_trusted_tenant_member(TEXT);

-- 5. Drop tenant_memberships table
DROP TABLE IF EXISTS workforce_staging.tenant_memberships;

NOTIFY pgrst, 'reload schema';
