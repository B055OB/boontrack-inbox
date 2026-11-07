-- Migration 007 Down: Drop workforce_staging.products and workforce_staging.tenants
DROP POLICY IF EXISTS rls_products_isolation ON workforce_staging.products;
DROP TABLE IF EXISTS workforce_staging.products CASCADE;
DROP TABLE IF EXISTS workforce_staging.tenants CASCADE;
