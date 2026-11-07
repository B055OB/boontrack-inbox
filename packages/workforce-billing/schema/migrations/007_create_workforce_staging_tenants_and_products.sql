-- Migration 007: Create workforce_staging.tenants and workforce_staging.products
-- Round 3E: Real Persistence Staging Tables for Tenant & Product Operations

CREATE SCHEMA IF NOT EXISTS workforce_staging;

CREATE TABLE IF NOT EXISTS workforce_staging.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category VARCHAR(32) DEFAULT 'service',
    tier VARCHAR(32) DEFAULT 'PRO_SCALE',
    status VARCHAR(32) DEFAULT 'active',
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    phone VARCHAR(32),
    whatsapp_number VARCHAR(32),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workforce_staging_tenants_slug ON workforce_staging.tenants(slug);

CREATE TABLE IF NOT EXISTS workforce_staging.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    title TEXT NOT NULL,
    slug VARCHAR(128) NOT NULL,
    price BIGINT NOT NULL DEFAULT 0,
    promo_price BIGINT,
    category VARCHAR(64) NOT NULL DEFAULT 'service',
    product_type VARCHAR(32) NOT NULL DEFAULT 'SERVICE',
    description TEXT,
    stock INT NOT NULL DEFAULT 999,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    sku VARCHAR(128),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workforce_staging_products_tenant ON workforce_staging.products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workforce_staging_products_slug ON workforce_staging.products(slug);

-- Enable RLS on workforce_staging.products
ALTER TABLE workforce_staging.products ENABLE ROW LEVEL SECURITY;

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

-- Grant appropriate permissions
GRANT ALL ON workforce_staging.tenants TO postgres, service_role;
GRANT ALL ON workforce_staging.products TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON workforce_staging.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workforce_staging.products TO authenticated;

-- Ensure grants on existing RLS tables for authenticated role testing
GRANT SELECT, INSERT, UPDATE, DELETE ON workforce_staging.branch_credit_pools TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workforce_staging.credit_purchase_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workforce_staging.seat_credit_ledger TO authenticated;
