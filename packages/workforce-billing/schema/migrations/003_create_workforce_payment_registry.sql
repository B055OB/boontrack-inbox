-- =========================================================================================
-- BWM GATE 1 SECURITY MIGRATION: 003_create_workforce_payment_registry.sql
-- Persistent Transaction Registry & Purge In-Memory Map
--
-- Target: workforce_staging.workforce_payment_registry
-- Constraints:
-- 1. CONSTRAINT uq_payment_registry_tenant_order UNIQUE (tenant_id, internal_order_id)
-- 2. CREATE UNIQUE INDEX uq_payment_registry_provider_tx WHERE provider_transaction_id IS NOT NULL
-- 3. CONSTRAINT chk_payment_registry_status CHECK (status IN ('INITIATED', 'BOUND', 'SETTLED', 'FAILED', 'EXPIRED'))
-- =========================================================================================

CREATE SCHEMA IF NOT EXISTS workforce_staging;

CREATE TABLE IF NOT EXISTS workforce_staging.workforce_payment_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    internal_order_id VARCHAR(128) NOT NULL,
    provider VARCHAR(32) NOT NULL, -- 'xendit' | 'dodo'
    provider_account_id VARCHAR(64),
    provider_transaction_id VARCHAR(128), -- Nullable saat registrasi awal pre-checkout
    currency VARCHAR(8) NOT NULL, -- 'IDR' | 'USD'
    expected_amount BIGINT NOT NULL, -- Integer amount (rupiah murni / integer-cents)
    status VARCHAR(32) NOT NULL DEFAULT 'INITIATED', -- INITIATED, BOUND, SETTLED, FAILED, EXPIRED
    authoritative_verified_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payment_registry_tenant_order UNIQUE (tenant_id, internal_order_id),
    CONSTRAINT chk_payment_registry_status CHECK (status IN ('INITIATED', 'BOUND', 'SETTLED', 'FAILED', 'EXPIRED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_registry_provider_tx 
ON workforce_staging.workforce_payment_registry (provider, provider_transaction_id) 
WHERE provider_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_registry_tenant 
ON workforce_staging.workforce_payment_registry(tenant_id);

CREATE INDEX IF NOT EXISTS idx_payment_registry_status 
ON workforce_staging.workforce_payment_registry(status);

