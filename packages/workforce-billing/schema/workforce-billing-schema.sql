-- =========================================================================================
-- BWM GATE E8: WORKFORCE BILLING & FINANCIAL INTEGRITY DATABASE SCHEMA
-- Schema: workforce_staging
--
-- Directives:
-- 1. Persistent Webhook Inbox with Idempotency Key constraints
-- 2. Append-Only Multi-Currency Financial Ledger & Segregated Tax Sub-Ledger
-- 3. FIFO Credit Lots & Personnel Allocations (Strict Tenant Commercial Ownership)
-- 4. Atomic Row-Level Locking (SELECT ... FOR UPDATE) with Explicit Tenant Isolation
-- =========================================================================================

CREATE SCHEMA IF NOT EXISTS workforce_staging;
SET search_path = workforce_staging, extensions, public, pg_temp;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------------------
-- 1. TABEL: workforce_webhook_inbox
-- Idempotency store untuk event webhook dari Xendit & Dodo Payments
-- -----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workforce_webhook_inbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(32) NOT NULL,
    event_id VARCHAR(128) NOT NULL,
    idempotency_key VARCHAR(256) UNIQUE NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    raw_payload JSONB NOT NULL,
    headers JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
    retry_count INT NOT NULL DEFAULT 0,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    CONSTRAINT uq_workforce_webhook_provider_event UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_workforce_webhook_inbox_idempotency ON workforce_webhook_inbox(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_workforce_webhook_inbox_status ON workforce_webhook_inbox(status);
CREATE INDEX IF NOT EXISTS idx_workforce_webhook_inbox_tenant ON workforce_webhook_inbox(tenant_id);

-- -----------------------------------------------------------------------------------------
-- 2. TABEL: workforce_financial_ledger
-- Append-only multi-currency financial ledger (Zero cross-currency pooling)
-- -----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workforce_financial_ledger (
    entry_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_ref TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    currency VARCHAR(10) NOT NULL,
    account_code VARCHAR(32) NOT NULL,
    account_name TEXT NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('DEBIT', 'CREDIT')),
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workforce_financial_ledger_txn ON workforce_financial_ledger(transaction_ref);
CREATE INDEX IF NOT EXISTS idx_workforce_financial_ledger_branch ON workforce_financial_ledger(branch_id);
CREATE INDEX IF NOT EXISTS idx_workforce_financial_ledger_currency ON workforce_financial_ledger(currency);

-- -----------------------------------------------------------------------------------------
-- 3. TABEL: workforce_tax_ledger
-- Sub-ledger pajak berdaulat (PPN 11%, SST 8%) terpisah dari pendapatan operasional
-- -----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workforce_tax_ledger (
    tax_entry_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_ref TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    currency VARCHAR(10) NOT NULL,
    tax_type VARCHAR(20) NOT NULL,
    tax_rate NUMERIC(5, 4) NOT NULL,
    base_amount NUMERIC(15, 2) NOT NULL,
    tax_amount NUMERIC(15, 2) NOT NULL,
    tax_invoice_ref TEXT NOT NULL,
    jurisdiction VARCHAR(5) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workforce_tax_ledger_txn ON workforce_tax_ledger(transaction_ref);
CREATE INDEX IF NOT EXISTS idx_workforce_tax_ledger_jurisdiction ON workforce_tax_ledger(jurisdiction);

-- -----------------------------------------------------------------------------------------
-- 4. TABEL: workforce_credit_lots
-- Prepaid credit lots: tenant_id sebagai pemilik komersial, branch_id sebagai target operasional
-- -----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workforce_credit_lots (
    lot_id TEXT PRIMARY KEY,
    purchase_ref TEXT UNIQUE NOT NULL,
    provider_txn_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    agency_id TEXT NOT NULL,
    currency VARCHAR(10) NOT NULL,
    total_purchased INT NOT NULL CHECK (total_purchased > 0),
    available_credits INT NOT NULL CHECK (available_credits >= 0),
    consumed_credits INT NOT NULL DEFAULT 0 CHECK (consumed_credits >= 0),
    frozen_credits INT NOT NULL DEFAULT 0 CHECK (frozen_credits >= 0),
    unit_price NUMERIC(15, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DEPLETED', 'FROZEN', 'DISPUTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_workforce_credit_lot_balance CHECK (available_credits + consumed_credits + frozen_credits = total_purchased)
);

-- Ensure tenant_id column exists if table was previously created without it
ALTER TABLE workforce_credit_lots ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE workforce_credit_lots SET tenant_id = agency_id WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_workforce_credit_lots_tenant ON workforce_credit_lots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workforce_credit_lots_branch ON workforce_credit_lots(branch_id);
CREATE INDEX IF NOT EXISTS idx_workforce_credit_lots_status ON workforce_credit_lots(status);

-- -----------------------------------------------------------------------------------------
-- 5. TABEL: workforce_credit_allocations
-- Penugasan kredit ke personel aktif (30-day window) terikat pada tenant_id & branch_id
-- -----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workforce_credit_allocations (
    allocation_id TEXT PRIMARY KEY,
    lot_id TEXT NOT NULL REFERENCES workforce_credit_lots(lot_id) ON DELETE RESTRICT,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    personnel_id TEXT NOT NULL,
    personnel_name TEXT NOT NULL,
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'TERMINATED'))
);

-- Ensure tenant_id column exists if table was previously created without it
ALTER TABLE workforce_credit_allocations ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE workforce_credit_allocations SET tenant_id = 'tenant_satya_001' WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_workforce_allocations_tenant_branch ON workforce_credit_allocations(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_workforce_allocations_personnel ON workforce_credit_allocations(personnel_id);

-- -----------------------------------------------------------------------------------------
-- 6. STORED PROCEDURE: fn_workforce_allocate_credit_fifo (STRICT TENANT ISOLATION & ROW-LEVEL LOCKING)
-- -----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_workforce_allocate_credit_fifo(
    p_tenant_id TEXT,
    p_branch_id TEXT,
    p_personnel_id TEXT,
    p_personnel_name TEXT
)
RETURNS TABLE (
    out_allocation_id TEXT,
    out_lot_id TEXT,
    out_personnel_id TEXT,
    out_activated_at TIMESTAMPTZ,
    out_expires_at TIMESTAMPTZ,
    out_remaining_lot_credits INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = workforce_staging, extensions, public, pg_temp
AS $$
DECLARE
    v_lot RECORD;
    v_new_available INT;
    v_new_status VARCHAR(20);
    v_allocation_id TEXT;
    v_now TIMESTAMPTZ := NOW();
    v_expires_at TIMESTAMPTZ;
    v_conflicting_tenant TEXT;
BEGIN
    -- Guard 1: Tenant ID must be present
    IF p_tenant_id IS NULL OR TRIM(p_tenant_id) = '' THEN
        RAISE EXCEPTION 'ERR_CROSS_TENANT_VIOLATION: Empty or null tenant_id provided'
            USING ERRCODE = '28000';
    END IF;

    -- Guard 2: Cross-Tenant Breach Check
    -- If branch_id already has active/settled lots owned by a different tenant, reject fail-closed!
    SELECT id_lot.tenant_id INTO v_conflicting_tenant
    FROM workforce_credit_lots id_lot
    WHERE id_lot.branch_id = p_branch_id
      AND id_lot.tenant_id <> p_tenant_id
    LIMIT 1;

    IF v_conflicting_tenant IS NOT NULL THEN
        RAISE EXCEPTION 'ERR_CROSS_TENANT_VIOLATION: Branch % is registered to tenant %, unauthorized access by %',
            p_branch_id, v_conflicting_tenant, p_tenant_id
            USING ERRCODE = '28000';
    END IF;

    -- Step 1: Lock oldest active lot belonging STRICTLY to p_tenant_id and p_branch_id (FIFO)
    SELECT id_lot.lot_id, id_lot.available_credits, id_lot.consumed_credits, id_lot.status
    INTO v_lot
    FROM workforce_credit_lots id_lot
    WHERE id_lot.tenant_id = p_tenant_id
      AND id_lot.branch_id = p_branch_id
      AND id_lot.status = 'ACTIVE'
      AND id_lot.available_credits > 0
    ORDER BY id_lot.created_at ASC
    LIMIT 1
    FOR UPDATE;

    -- Invariant: If no lot has available credits under p_tenant_id, fail-closed immediately
    IF v_lot.lot_id IS NULL THEN
        RAISE EXCEPTION 'ERR_INSUFFICIENT_CREDITS: Branch % available balance is 0 for tenant %',
            p_branch_id, p_tenant_id
            USING ERRCODE = '55000';
    END IF;

    -- Step 2: Atomic decrement
    v_new_available := v_lot.available_credits - 1;
    IF v_new_available = 0 THEN
        v_new_status := 'DEPLETED';
    ELSE
        v_new_status := 'ACTIVE';
    END IF;

    UPDATE workforce_credit_lots
    SET available_credits = v_new_available,
        consumed_credits = v_lot.consumed_credits + 1,
        status = v_new_status,
        updated_at = v_now
    WHERE workforce_credit_lots.lot_id = v_lot.lot_id
      AND workforce_credit_lots.tenant_id = p_tenant_id;

    -- Step 3: Compute 30-day active window
    v_expires_at := v_now + INTERVAL '30 days';
    v_allocation_id := 'ALC-' || TO_CHAR(v_now, 'YYYYMMDDHH24MISSMS') || '-' || SUBSTRING(MD5(RANDOM()::TEXT), 1, 6);

    -- Step 4: Record allocation with tenant_id scoping
    INSERT INTO workforce_credit_allocations (
        allocation_id,
        lot_id,
        tenant_id,
        branch_id,
        personnel_id,
        personnel_name,
        activated_at,
        expires_at,
        status
    ) VALUES (
        v_allocation_id,
        v_lot.lot_id,
        p_tenant_id,
        p_branch_id,
        p_personnel_id,
        p_personnel_name,
        v_now,
        v_expires_at,
        'ACTIVE'
    );

    -- Return output tuple
    out_allocation_id := v_allocation_id;
    out_lot_id := v_lot.lot_id;
    out_personnel_id := p_personnel_id;
    out_activated_at := v_now;
    out_expires_at := v_expires_at;
    out_remaining_lot_credits := v_new_available;
    RETURN NEXT;
END;
$$;

-- -----------------------------------------------------------------------------------------
-- 7. TABEL: workforce_verified_domain_registry (RFC-BWM-014)
-- Authoritative domain registry for multi-tenant dynamic branding & edge resolution
-- -----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workforce_verified_domain_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    hostname TEXT UNIQUE NOT NULL,
    brand_name TEXT NOT NULL,
    logo_url TEXT NOT NULL,
    primary_color TEXT NOT NULL DEFAULT '#06b6d4',
    accent_color TEXT NOT NULL DEFAULT '#4f46e5',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_verified_domain_hostname ON workforce_verified_domain_registry(hostname);

-- Legacy compatibility table alias
CREATE TABLE IF NOT EXISTS verified_domain_registry (
    domain_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL,
    hostname VARCHAR(255) UNIQUE NOT NULL,
    brand_name VARCHAR(128) NOT NULL,
    logo_url TEXT,
    primary_color VARCHAR(32) NOT NULL DEFAULT '#059669',
    accent_color VARCHAR(32) NOT NULL DEFAULT '#0d9488',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verified_domain_registry_hostname ON verified_domain_registry(hostname, is_active);

-- Seed default demo tenants into workforce_verified_domain_registry
INSERT INTO workforce_verified_domain_registry (tenant_id, hostname, brand_name, logo_url, primary_color, accent_color, is_active)
VALUES 
  ('tenant_satya_001', 'workforce.boontrack.com', 'SATYA Workforce', '/icons/workforce-192.png', '#059669', '#0d9488', TRUE),
  ('tenant_satya_staging', 'satya.workforce.boontrack.com', 'SATYA Security Ops', '/icons/satya-logo.png', '#06b6d4', '#4f46e5', TRUE),
  ('tenant_beta_adversary', 'beta.workforce.boontrack.com', 'Beta Security Ops', '/icons/beta-logo.png', '#dc2626', '#b91c1c', TRUE)
ON CONFLICT (hostname) DO UPDATE 
SET tenant_id = EXCLUDED.tenant_id,
    brand_name = EXCLUDED.brand_name,
    logo_url = EXCLUDED.logo_url,
    primary_color = EXCLUDED.primary_color,
    accent_color = EXCLUDED.accent_color,
    is_active = EXCLUDED.is_active;

-- Seed default demo tenants into verified_domain_registry
INSERT INTO verified_domain_registry (tenant_id, hostname, brand_name, logo_url, primary_color, accent_color, is_active)
VALUES 
  ('tenant_satya_001', 'workforce.boontrack.com', 'SATYA Workforce', '/icons/workforce-192.png', '#059669', '#0d9488', TRUE),
  ('tenant_satya_001', 'satya.workforce.boontrack.com', 'SATYA Garda Perkasa', '/icons/workforce-192.png', '#059669', '#0d9488', TRUE),
  ('tenant_beta_adversary', 'beta.workforce.boontrack.com', 'Beta Security Ops', '/icons/workforce-192.png', '#dc2626', '#b91c1c', TRUE)
ON CONFLICT (hostname) DO UPDATE 
SET brand_name = EXCLUDED.brand_name,
    primary_color = EXCLUDED.primary_color,
    accent_color = EXCLUDED.accent_color,
    is_active = EXCLUDED.is_active;

-- -----------------------------------------------------------------------------------------
-- 7. TABEL: workforce_payment_registry (Persistent Transaction Registry)
-- Authoritative Pre-Checkout Order Registration & Provider Transaction Binding
-- -----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workforce_payment_registry (
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
    CONSTRAINT chk_payment_registry_status CHECK (status IN ('INITIATED', 'BOUND', 'SETTLED', 'FAILED', 'EXPIRED')),
    CONSTRAINT chk_payment_registry_positive_amount CHECK (expected_amount > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_registry_provider_tx 
ON workforce_payment_registry (provider, provider_transaction_id) 
WHERE provider_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_registry_tenant 
ON workforce_payment_registry(tenant_id);

CREATE INDEX IF NOT EXISTS idx_payment_registry_status 
ON workforce_payment_registry(status);

-- Trigger: Enforce Database-Level Immutability & Status Machine
CREATE OR REPLACE FUNCTION fn_enforce_payment_registry_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: Column tenant_id cannot be modified once created';
    END IF;
    IF OLD.internal_order_id IS DISTINCT FROM NEW.internal_order_id THEN
        RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: Column internal_order_id cannot be modified once created';
    END IF;
    IF OLD.provider IS DISTINCT FROM NEW.provider THEN
        RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: Column provider cannot be modified once created';
    END IF;
    IF OLD.currency IS DISTINCT FROM NEW.currency THEN
        RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: Column currency cannot be modified once created';
    END IF;
    IF OLD.expected_amount IS DISTINCT FROM NEW.expected_amount THEN
        RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: Column expected_amount cannot be modified once created';
    END IF;

    -- Enforce Post-Bound Immutability for provider_transaction_id & provider_account_id
    IF NEW.provider_transaction_id IS DISTINCT FROM OLD.provider_transaction_id THEN
        IF NOT (OLD.status = 'INITIATED' AND NEW.status = 'BOUND') THEN
            RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: provider_transaction_id cannot be modified once BOUND';
        END IF;
    END IF;

    IF NEW.provider_account_id IS DISTINCT FROM OLD.provider_account_id THEN
        IF NOT (OLD.status = 'INITIATED' AND NEW.status = 'BOUND') THEN
            RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: provider_account_id cannot be modified once BOUND';
        END IF;
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
        IF OLD.status = 'INITIATED' THEN
            IF NEW.status NOT IN ('BOUND', 'FAILED', 'EXPIRED') THEN
                RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Cannot transition status from INITIATED to %', NEW.status;
            END IF;
        ELSIF OLD.status = 'BOUND' THEN
            IF NEW.status NOT IN ('SETTLED', 'FAILED', 'EXPIRED') THEN
                RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Cannot transition status from BOUND to %', NEW.status;
            END IF;
        ELSIF OLD.status = 'SETTLED' THEN
            RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: SETTLED is immutable and cannot be transitioned to %', NEW.status;
        ELSIF OLD.status IN ('FAILED', 'EXPIRED') THEN
            RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Terminal status % cannot be transitioned to %', OLD.status, NEW.status;
        ELSE
            RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Unknown current status %', OLD.status;
        END IF;
    END IF;

    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_registry_immutability ON workforce_payment_registry;
CREATE TRIGGER trg_payment_registry_immutability
BEFORE UPDATE ON workforce_payment_registry
FOR EACH ROW
EXECUTE FUNCTION fn_enforce_payment_registry_immutability();


