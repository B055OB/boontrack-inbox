-- =============================================================================
-- STAGING MIGRATION: tenant_branding.sql
-- CTO Approved RFC-018: Dynamic Tenant Branding Engine for BWM Multi-Tenant
-- 
-- Architecture Note:
-- Authoritative domain ownership remains exclusively in workforce_verified_domain_registry.
-- This table defines tenant visual identities joined via tenant_id.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS tenant_branding (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL,
    brand_name VARCHAR(128) NOT NULL DEFAULT 'BWM',
    portal_title VARCHAR(255) NOT NULL DEFAULT 'BWM Operations Portal',
    pwa_app_name VARCHAR(255) NOT NULL DEFAULT 'BWM Mobile Field Portal',
    pwa_short_name VARCHAR(64) NOT NULL DEFAULT 'BWM Field',
    pwa_theme_color VARCHAR(32) NOT NULL DEFAULT '#0F172A',
    pwa_bg_color VARCHAR(32) NOT NULL DEFAULT '#020617',
    logo_light_url TEXT NOT NULL DEFAULT '/logo.png',
    logo_dark_url TEXT NOT NULL DEFAULT '/logo.png',
    favicon_url TEXT NOT NULL DEFAULT '/icon.png',
    install_banner_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    install_button_label VARCHAR(64) NOT NULL DEFAULT 'Install Mobile App',
    branding_version INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial Unique Index / Constraint: Strictly one active branding config per tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_branding_active_tenant 
ON tenant_branding(tenant_id) 
WHERE is_active = TRUE;

-- Fast index for runtime tenant query resolution
CREATE INDEX IF NOT EXISTS idx_tenant_branding_tenant_id 
ON tenant_branding(tenant_id, is_active);

-- Optional Foreign Key Check (Only when tenants table exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'tenants'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_tenant_branding_tenants'
        ) THEN
            ALTER TABLE tenant_branding
            ADD CONSTRAINT fk_tenant_branding_tenants
            FOREIGN KEY (tenant_id) REFERENCES tenants(id)
            ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- Seed Canonical BWM Global Configuration & Partner Configurations
INSERT INTO tenant_branding (
    tenant_id,
    brand_name,
    portal_title,
    pwa_app_name,
    pwa_short_name,
    pwa_theme_color,
    pwa_bg_color,
    logo_light_url,
    logo_dark_url,
    favicon_url,
    install_banner_enabled,
    install_button_label,
    branding_version,
    is_active
) VALUES (
    'bwm_canonical',
    'BWM',
    'BWM Operations Portal',
    'BWM Mobile Field Portal',
    'BWM Field',
    '#0F172A',
    '#020617',
    '/logo.png',
    '/logo.png',
    '/icon.png',
    TRUE,
    'Install Mobile App',
    1,
    TRUE
), (
    'apex_security_partner',
    'Apex Security',
    'Apex Security Operations Portal',
    'Apex Mobile Field Portal',
    'Apex Field',
    '#1E293B',
    '#0F172A',
    '/logo.png',
    '/logo.png',
    '/icon.png',
    TRUE,
    'Install Mobile App',
    1,
    TRUE
)
ON CONFLICT (tenant_id) WHERE is_active = TRUE
DO UPDATE SET
    brand_name = EXCLUDED.brand_name,
    portal_title = EXCLUDED.portal_title,
    pwa_app_name = EXCLUDED.pwa_app_name,
    pwa_short_name = EXCLUDED.pwa_short_name,
    pwa_theme_color = EXCLUDED.pwa_theme_color,
    pwa_bg_color = EXCLUDED.pwa_bg_color,
    logo_light_url = EXCLUDED.logo_light_url,
    logo_dark_url = EXCLUDED.logo_dark_url,
    favicon_url = EXCLUDED.favicon_url,
    install_banner_enabled = EXCLUDED.install_banner_enabled,
    install_button_label = EXCLUDED.install_button_label,
    branding_version = EXCLUDED.branding_version,
    updated_at = NOW();
