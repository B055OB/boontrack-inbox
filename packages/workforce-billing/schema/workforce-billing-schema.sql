-- =========================================================================================
-- BWM GATE E8: WORKFORCE BILLING & FINANCIAL INTEGRITY DATABASE SCHEMA
-- Schema: workforce_staging
--
-- Directives:
-- 1. Persistent Webhook Inbox with Idempotency Key constraints
-- 2. Append-Only Multi-Currency Financial Ledger & Segregated Tax Sub-Ledger
-- 3. FIFO Credit Lots & Personnel Allocations
-- 4. Atomic Row-Level Locking (SELECT ... FOR UPDATE) for Multi-Admin Concurrency
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
-- Prepaid credit lots dengan status dan kuota terpisah
-- -----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workforce_credit_lots (
    lot_id TEXT PRIMARY KEY,
    purchase_ref TEXT UNIQUE NOT NULL,
    provider_txn_id TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_workforce_credit_lots_branch ON workforce_credit_lots(branch_id);
CREATE INDEX IF NOT EXISTS idx_workforce_credit_lots_status ON workforce_credit_lots(status);

-- -----------------------------------------------------------------------------------------
-- 5. TABEL: workforce_credit_allocations
-- Penugasan kredit ke personel aktif (30-day window)
-- -----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workforce_credit_allocations (
    allocation_id TEXT PRIMARY KEY,
    lot_id TEXT NOT NULL REFERENCES workforce_credit_lots(lot_id) ON DELETE RESTRICT,
    branch_id TEXT NOT NULL,
    personnel_id TEXT NOT NULL,
    personnel_name TEXT NOT NULL,
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'TERMINATED'))
);

CREATE INDEX IF NOT EXISTS idx_workforce_allocations_branch_personnel ON workforce_credit_allocations(branch_id, personnel_id);

-- -----------------------------------------------------------------------------------------
-- 6. STORED PROCEDURE: fn_workforce_allocate_credit_fifo (ROW-LEVEL LOCKING)
-- Menjamin alokasi FIFO secara atomik dengan row-level lock pada PostgreSQL
-- -----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_workforce_allocate_credit_fifo(
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
BEGIN
    -- Step 1: Lock the oldest active lot for the branch with available credits (FIFO)
    SELECT id_lot.lot_id, id_lot.available_credits, id_lot.consumed_credits, id_lot.status
    INTO v_lot
    FROM workforce_credit_lots id_lot
    WHERE id_lot.branch_id = p_branch_id
      AND id_lot.status = 'ACTIVE'
      AND id_lot.available_credits > 0
    ORDER BY id_lot.created_at ASC
    LIMIT 1
    FOR UPDATE;

    -- Invariant: If no lot has available credits, fail-closed immediately
    IF v_lot.lot_id IS NULL THEN
        RAISE EXCEPTION 'ERR_INSUFFICIENT_CREDITS: Branch % available balance is 0', p_branch_id;
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
    WHERE workforce_credit_lots.lot_id = v_lot.lot_id;

    -- Step 3: Compute 30-day active window
    v_expires_at := v_now + INTERVAL '30 days';
    v_allocation_id := 'ALC-' || TO_CHAR(v_now, 'YYYYMMDDHH24MISSMS') || '-' || SUBSTRING(MD5(RANDOM()::TEXT), 1, 6);

    -- Step 4: Record allocation
    INSERT INTO workforce_credit_allocations (
        allocation_id,
        lot_id,
        branch_id,
        personnel_id,
        personnel_name,
        activated_at,
        expires_at,
        status
    ) VALUES (
        v_allocation_id,
        v_lot.lot_id,
        p_branch_id,
        p_personnel_id,
        p_personnel_name,
        v_now,
        v_expires_at,
        'ACTIVE'
    );

    -- Return values
    out_allocation_id := v_allocation_id;
    out_lot_id := v_lot.lot_id;
    out_personnel_id := p_personnel_id;
    out_activated_at := v_now;
    out_expires_at := v_expires_at;
    out_remaining_lot_credits := v_new_available;
    RETURN NEXT;
END;
$$;
