-- =========================================================================================
-- BWM GATE E5 — DATABASE PERSISTENCE SCHEMA DRAFT (POSTGRESQL / SUPABASE)
-- Module: Workforce Seat Credit Pool & Immutable Ledger (Hardened)
--
-- Architectural Directives:
-- 1. Strict Tenant Scoping: All tables scoped to branch_id / agency_id.
-- 2. Zero Float Currency: All monetary amounts stored as BIGINT IDR (integer rupiah, zero decimal).
-- 3. Strict Non-Negative Invariants: CHECK constraints enforce available_credits >= 0.
-- 4. Authoritative Banking Idempotency: credit_purchase_transactions acts as single source of truth.
-- 5. Ledger Immutability: Direct UPDATE/DELETE on seat_credit_ledger revoked & guarded via fail-closed trigger.
-- 6. Multi-Tenant RLS & Security: Explicit SECURITY DEFINER with search_path = public, pg_temp.
-- =========================================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------------------
-- 0. SCHEMA ISOLATION INITIALIZATION
-- Workforce management runs in isolated workforce_staging schema
-- -----------------------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS workforce_staging;

-- Grant permissions to standard Supabase roles
GRANT USAGE, CREATE ON SCHEMA workforce_staging TO service_role;
GRANT USAGE ON SCHEMA workforce_staging TO authenticated;

-- Set search_path to isolated schema
SET search_path = workforce_staging, extensions, public, pg_temp;

-- -----------------------------------------------------------------------------------------
-- 1. TABEL: branch_credit_pools
-- Menyimpan saldo snapshot kredit aktif dan lisensi kursi per cabang
-- -----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branch_credit_pools (
    branch_id TEXT PRIMARY KEY,
    agency_id TEXT NOT NULL,
    available_credits INT NOT NULL DEFAULT 0,
    active_seats INT NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'IDR',
    last_reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Invariants: Available credits and active seats can NEVER be negative
    CONSTRAINT chk_pool_available_credits_non_negative CHECK (available_credits >= 0),
    CONSTRAINT chk_pool_active_seats_non_negative CHECK (active_seats >= 0),
    CONSTRAINT chk_pool_currency_idr CHECK (currency = 'IDR')
);

CREATE INDEX IF NOT EXISTS idx_branch_credit_pools_agency ON branch_credit_pools(agency_id);

-- -----------------------------------------------------------------------------------------
-- 2. TABEL: credit_purchase_transactions
-- Entitas Pembelian Induk: Snapshot transaksi pembayaran unik per gateway/bank
-- -----------------------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE purchase_transaction_status AS ENUM ('SETTLED', 'DISPUTED', 'REFUNDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS credit_purchase_transactions (
    purchase_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id TEXT NOT NULL REFERENCES branch_credit_pools(branch_id) ON DELETE RESTRICT,
    agency_id TEXT NOT NULL,
    payment_reference TEXT UNIQUE NOT NULL, -- Satu transaksi pembayaran unik (Gateway SSOT)
    purchase_reference TEXT NOT NULL,
    quantity INT NOT NULL,
    unit_price_idr BIGINT NOT NULL DEFAULT 30000,
    subtotal_idr BIGINT NOT NULL,
    tax_idr BIGINT NOT NULL,
    total_idr BIGINT NOT NULL,
    status purchase_transaction_status NOT NULL DEFAULT 'SETTLED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints: Minimum 5 credits, exact integer calculations
    CONSTRAINT chk_purchase_quantity_min CHECK (quantity >= 5),
    CONSTRAINT chk_purchase_subtotal_positive CHECK (subtotal_idr > 0),
    CONSTRAINT chk_purchase_tax_non_negative CHECK (tax_idr >= 0),
    CONSTRAINT chk_purchase_total_positive CHECK (total_idr > 0),
    CONSTRAINT chk_purchase_math_integrity CHECK (total_idr = subtotal_idr + tax_idr)
);

CREATE INDEX IF NOT EXISTS idx_credit_purchase_transactions_branch ON credit_purchase_transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_credit_purchase_transactions_payment_ref ON credit_purchase_transactions(payment_reference);

-- -----------------------------------------------------------------------------------------
-- 3. TABEL: seat_credit_ledger
-- Catatan mutasi kredit dan lisensi immutable per-kredit
-- -----------------------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE seat_credit_action_type AS ENUM ('PURCHASE', 'CONSUME', 'FREEZE', 'REVERSE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE seat_credit_status AS ENUM ('AVAILABLE', 'CONSUMED', 'FROZEN', 'REVERSED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS seat_credit_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credit_id TEXT NOT NULL,
    purchase_id UUID NOT NULL REFERENCES credit_purchase_transactions(purchase_id) ON DELETE RESTRICT,
    branch_id TEXT NOT NULL REFERENCES branch_credit_pools(branch_id) ON DELETE RESTRICT,
    agency_id TEXT NOT NULL,
    purchase_reference TEXT NOT NULL,
    payment_reference TEXT NOT NULL,
    amount_idr BIGINT NOT NULL DEFAULT 30000,
    action_type seat_credit_action_type NOT NULL,
    status seat_credit_status NOT NULL DEFAULT 'AVAILABLE',
    consumed_by_personnel_id TEXT,
    consumed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    original_credit_id UUID REFERENCES seat_credit_ledger(id) ON DELETE RESTRICT,
    audit_reason TEXT,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Financial Invariant: amount_idr must be positive integer (zero float)
    CONSTRAINT chk_ledger_amount_idr_positive CHECK (amount_idr > 0),
    
    -- Consumption Invariant: If status is CONSUMED, personnel and timestamp MUST exist
    CONSTRAINT chk_ledger_consumed_integrity CHECK (
        (status = 'CONSUMED' AND consumed_by_personnel_id IS NOT NULL AND consumed_at IS NOT NULL) OR
        (status != 'CONSUMED')
    )
);

-- Indices for high-throughput queries
CREATE INDEX IF NOT EXISTS idx_seat_credit_ledger_purchase_id ON seat_credit_ledger(purchase_id);
CREATE INDEX IF NOT EXISTS idx_seat_credit_ledger_branch ON seat_credit_ledger(branch_id);
CREATE INDEX IF NOT EXISTS idx_seat_credit_ledger_status ON seat_credit_ledger(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_seat_credit_ledger_personnel ON seat_credit_ledger(consumed_by_personnel_id);
CREATE INDEX IF NOT EXISTS idx_seat_credit_ledger_payment_ref ON seat_credit_ledger(payment_reference);

-- Banking & Webhook Idempotency: Unique constraint preventing double credit emission per gateway ref
CREATE UNIQUE INDEX IF NOT EXISTS uq_seat_credit_payment_ref_credit_id
ON seat_credit_ledger (payment_reference, credit_id);

-- Optional client idempotency key constraint per branch
CREATE UNIQUE INDEX IF NOT EXISTS uq_seat_credit_idempotency_key
ON seat_credit_ledger (branch_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- -----------------------------------------------------------------------------------------
-- 4. LEDGER IMMUTABILITY ENFORCEMENT (TRIGGERS, RULES & PERMISSIONS)
-- Direct manual UPDATE or DELETE is strictly rejected fail-closed
-- -----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_prevent_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = workforce_staging, extensions, public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'LEDGER_IMMUTABILITY_VIOLATION: DELETE on seat_credit_ledger is strictly prohibited. Ledger rows are append-only.';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Allow state change ONLY if transitioning from AVAILABLE to CONSUMED/FROZEN via authorized engine
        IF OLD.status != 'AVAILABLE' THEN
            RAISE EXCEPTION 'LEDGER_IMMUTABILITY_VIOLATION: Credit row % with status % is finalized and cannot be modified. Audit reversals must be appended as new journal entries.', OLD.id, OLD.status;
        END IF;

        IF NEW.status NOT IN ('CONSUMED', 'FROZEN', 'REVERSED') THEN
            RAISE EXCEPTION 'LEDGER_IMMUTABILITY_VIOLATION: Invalid target status % for credit transition.', NEW.status;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seat_credit_ledger_immutability ON seat_credit_ledger;
CREATE TRIGGER trg_seat_credit_ledger_immutability
BEFORE UPDATE OR DELETE ON seat_credit_ledger
FOR EACH ROW
EXECUTE FUNCTION fn_prevent_ledger_mutation();

-- PostgreSQL Rules for Ledger Immutability Guardrail
CREATE OR REPLACE RULE no_delete_seat_credit_ledger AS
    ON DELETE TO seat_credit_ledger
    DO INSTEAD NOTHING;

CREATE OR REPLACE RULE no_update_seat_credit_ledger AS
    ON UPDATE TO seat_credit_ledger
    WHERE OLD.status != 'AVAILABLE' OR NEW.status NOT IN ('CONSUMED', 'FROZEN', 'REVERSED')
    DO INSTEAD NOTHING;

-- Revoke dangerous mutation privileges from standard application roles
REVOKE UPDATE, DELETE, TRUNCATE ON seat_credit_ledger FROM PUBLIC;

-- -----------------------------------------------------------------------------------------
-- 5. ROW-LEVEL SECURITY (RLS) POLICIES
-- Strict multi-tenant isolation per branch / agency
-- -----------------------------------------------------------------------------------------
ALTER TABLE branch_credit_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_purchase_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_credit_ledger ENABLE ROW LEVEL SECURITY;

-- Deny all public access by default (Fail-closed)
DROP POLICY IF EXISTS rls_branch_credit_pools_isolation ON branch_credit_pools;
CREATE POLICY rls_branch_credit_pools_isolation ON branch_credit_pools
    FOR ALL
    USING (
        auth.role() = 'service_role' OR
        agency_id = (current_setting('app.current_agency_id', true))
    );

DROP POLICY IF EXISTS rls_credit_purchase_transactions_isolation ON credit_purchase_transactions;
CREATE POLICY rls_credit_purchase_transactions_isolation ON credit_purchase_transactions
    FOR ALL
    USING (
        auth.role() = 'service_role' OR
        agency_id = (current_setting('app.current_agency_id', true))
    );

DROP POLICY IF EXISTS rls_seat_credit_ledger_isolation ON seat_credit_ledger;
CREATE POLICY rls_seat_credit_ledger_isolation ON seat_credit_ledger
    FOR ALL
    USING (
        auth.role() = 'service_role' OR
        agency_id = (current_setting('app.current_agency_id', true))
    );

-- -----------------------------------------------------------------------------------------
-- 6. STORED PROCEDURES / ATOMIC FUNCTIONS (SECURITY DEFINER WITH SEARCH PATH)
-- Multi-instance concurrency-safe database functions using row-level locks
-- -----------------------------------------------------------------------------------------

/**
 * fn_workforce_deposit_credits
 * Injeksi kredit baru ke pool cabang secara atomik & idempoten
 * Mengikat payment_reference ke credit_purchase_transactions sebagai SSOT
 */
CREATE OR REPLACE FUNCTION fn_workforce_deposit_credits(
    p_branch_id TEXT,
    p_agency_id TEXT,
    p_quantity INT,
    p_purchase_reference TEXT,
    p_payment_reference TEXT,
    p_unit_price_idr BIGINT DEFAULT 30000,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = workforce_staging, extensions, public, pg_temp
AS $$
DECLARE
    v_caller_agency TEXT;
    v_existing_tx RECORD;
    v_purchase_id UUID;
    v_subtotal BIGINT;
    v_tax BIGINT;
    v_total BIGINT;
    v_i INT;
    v_credit_id TEXT;
    v_pool RECORD;
BEGIN
    -- 1. Tenant boundary guardrail check
    v_caller_agency := NULLIF(current_setting('app.current_agency_id', true), '');
    IF v_caller_agency IS NOT NULL AND v_caller_agency != p_agency_id THEN
        RAISE EXCEPTION 'TENANT_ISOLATION_BREACH: Caller agency % does not match target agency %', v_caller_agency, p_agency_id;
    END IF;

    -- 2. Validate minimum deposit (5 credits)
    IF p_quantity < 5 THEN
        RAISE EXCEPTION 'MINIMUM_DEPOSIT_NOT_MET: Minimum deposit is 5 credits (requested: %)', p_quantity;
    END IF;

    -- 3. Check payment_reference idempotency in credit_purchase_transactions (SSOT)
    SELECT * INTO v_existing_tx
    FROM credit_purchase_transactions
    WHERE payment_reference = p_payment_reference;

    IF FOUND THEN
        SELECT * INTO v_pool FROM branch_credit_pools WHERE branch_id = p_branch_id;
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'purchase_id', v_existing_tx.purchase_id,
            'branch_id', p_branch_id,
            'quantity_added', v_existing_tx.quantity,
            'subtotal_idr', v_existing_tx.subtotal_idr,
            'tax_idr', v_existing_tx.tax_idr,
            'total_idr', v_existing_tx.total_idr,
            'available_credits', v_pool.available_credits,
            'active_seats', v_pool.active_seats,
            'message', 'Payment reference was already processed'
        );
    END IF;

    -- 4. Calculate integer currency amounts (11% PPN)
    v_subtotal := p_quantity * p_unit_price_idr;
    v_tax := ROUND(v_subtotal * 0.11)::BIGINT;
    v_total := v_subtotal + v_tax;

    -- 5. Lock or create branch_credit_pools row
    INSERT INTO branch_credit_pools (branch_id, agency_id, available_credits, active_seats)
    VALUES (p_branch_id, p_agency_id, 0, 0)
    ON CONFLICT (branch_id) DO NOTHING;

    SELECT * INTO v_pool
    FROM branch_credit_pools
    WHERE branch_id = p_branch_id
    FOR UPDATE;

    -- 5b. Re-check idempotency under lock to handle concurrent race conditions cleanly
    SELECT * INTO v_existing_tx
    FROM credit_purchase_transactions
    WHERE payment_reference = p_payment_reference;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'purchase_id', v_existing_tx.purchase_id,
            'branch_id', p_branch_id,
            'quantity_added', v_existing_tx.quantity,
            'subtotal_idr', v_existing_tx.subtotal_idr,
            'tax_idr', v_existing_tx.tax_idr,
            'total_idr', v_existing_tx.total_idr,
            'available_credits', v_pool.available_credits,
            'active_seats', v_pool.active_seats,
            'message', 'Payment reference was already processed'
        );
    END IF;

    -- 6. Insert parent purchase transaction snapshot (guarded against concurrent unique violations)
    BEGIN
        INSERT INTO credit_purchase_transactions (
            branch_id,
            agency_id,
            payment_reference,
            purchase_reference,
            quantity,
            unit_price_idr,
            subtotal_idr,
            tax_idr,
            total_idr,
            status
        ) VALUES (
            p_branch_id,
            p_agency_id,
            p_payment_reference,
            p_purchase_reference,
            p_quantity,
            p_unit_price_idr,
            v_subtotal,
            v_tax,
            v_total,
            'SETTLED'
        ) RETURNING purchase_id INTO v_purchase_id;
    EXCEPTION WHEN unique_violation THEN
        SELECT * INTO v_existing_tx
        FROM credit_purchase_transactions
        WHERE payment_reference = p_payment_reference;

        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'purchase_id', v_existing_tx.purchase_id,
            'branch_id', p_branch_id,
            'quantity_added', v_existing_tx.quantity,
            'subtotal_idr', v_existing_tx.subtotal_idr,
            'tax_idr', v_existing_tx.tax_idr,
            'total_idr', v_existing_tx.total_idr,
            'available_credits', v_pool.available_credits,
            'active_seats', v_pool.active_seats,
            'message', 'Payment reference was already processed'
        );
    END;

    -- 7. Insert credit rows into immutable ledger
    FOR v_i IN 1..p_quantity LOOP
        v_credit_id := 'cred_' || p_branch_id || '_' || extract(epoch from now())::bigint || '_' || v_i;

        INSERT INTO seat_credit_ledger (
            credit_id,
            purchase_id,
            branch_id,
            agency_id,
            purchase_reference,
            payment_reference,
            amount_idr,
            action_type,
            status,
            idempotency_key
        ) VALUES (
            v_credit_id,
            v_purchase_id,
            p_branch_id,
            p_agency_id,
            p_purchase_reference,
            p_payment_reference,
            p_unit_price_idr,
            'PURCHASE',
            'AVAILABLE',
            CASE WHEN p_idempotency_key IS NOT NULL THEN p_idempotency_key || '_' || v_i ELSE NULL END
        );
    END LOOP;

    -- 8. Atomically update pool balance
    UPDATE branch_credit_pools
    SET available_credits = available_credits + p_quantity,
        updated_at = NOW()
    WHERE branch_id = p_branch_id
    RETURNING * INTO v_pool;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'purchase_id', v_purchase_id,
        'branch_id', p_branch_id,
        'quantity_added', p_quantity,
        'subtotal_idr', v_subtotal,
        'tax_idr', v_tax,
        'total_idr', v_total,
        'available_credits', v_pool.available_credits,
        'active_seats', v_pool.active_seats
    );
END;
$$;

/**
 * fn_workforce_activate_personnel_seat
 * 7-Step Atomic Execution dengan Timeout Retry Loop:
 * (1) Lock branch pool
 * (2) Ambil 1 kredit AVAILABLE via SELECT ... FOR UPDATE SKIP LOCKED
 * (3) Validasi tenant/branch
 * (4) Buat lisensi 30 hari
 * (5) Update status kredit ke CONSUMED
 * (6) Kurangi available_credits & tambah active_seats
 * (7) Return snapshot commit
 */
CREATE OR REPLACE FUNCTION fn_workforce_activate_personnel_seat(
    p_branch_id TEXT,
    p_personnel_id TEXT,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = workforce_staging, extensions, public, pg_temp
AS $$
DECLARE
    v_caller_agency TEXT;
    v_target_credit_id UUID;
    v_pool RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_expires_at TIMESTAMPTZ := v_now + INTERVAL '30 days';
    v_retry_count INT := 0;
    v_max_retries INT := 3;
BEGIN
    -- STEP 1: Lock branch pool
    SELECT * INTO v_pool
    FROM branch_credit_pools
    WHERE branch_id = p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'BRANCH_NOT_FOUND: Branch % does not exist in credit pools', p_branch_id;
    END IF;

    -- STEP 2: Tenant boundary validation
    v_caller_agency := NULLIF(current_setting('app.current_agency_id', true), '');
    IF v_caller_agency IS NOT NULL AND v_caller_agency != v_pool.agency_id THEN
        RAISE EXCEPTION 'TENANT_ISOLATION_BREACH: Caller agency % does not match branch agency %', v_caller_agency, v_pool.agency_id;
    END IF;

    IF v_pool.available_credits < 1 THEN
        RAISE EXCEPTION 'INSUFFICIENT_CREDITS: Branch % has 0 available credits', p_branch_id;
    END IF;

    -- STEP 3: Timeout retry loop for selecting 1 AVAILABLE credit
    LOOP
        SELECT id INTO v_target_credit_id
        FROM seat_credit_ledger
        WHERE branch_id = p_branch_id AND status = 'AVAILABLE'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF v_target_credit_id IS NOT NULL THEN
            EXIT; -- Found and locked
        END IF;

        v_retry_count := v_retry_count + 1;
        IF v_retry_count >= v_max_retries THEN
            RAISE EXCEPTION 'LOCK_TIMEOUT: All available credits for branch % are temporarily locked by concurrent workers. Retry aborted.', p_branch_id;
        END IF;

        PERFORM pg_sleep(0.05 * v_retry_count); -- Jittered backoff (50ms, 100ms, 150ms)
    END LOOP;

    -- STEP 4 & 5: Consume credit row and record 30-day expiration
    UPDATE seat_credit_ledger
    SET status = 'CONSUMED',
        action_type = 'CONSUME',
        consumed_by_personnel_id = p_personnel_id,
        consumed_at = v_now,
        expires_at = v_expires_at,
        idempotency_key = p_idempotency_key
    WHERE id = v_target_credit_id;

    -- STEP 6: Atomically decrement available credits and increment active seats
    UPDATE branch_credit_pools
    SET available_credits = available_credits - 1,
        active_seats = active_seats + 1,
        updated_at = v_now
    WHERE branch_id = p_branch_id
    RETURNING * INTO v_pool;

    -- STEP 7: Return final atomic snapshot
    RETURN jsonb_build_object(
        'success', true,
        'personnel_id', p_personnel_id,
        'credit_row_id', v_target_credit_id,
        'activated_at', v_now,
        'expires_at', v_expires_at,
        'available_credits', v_pool.available_credits,
        'active_seats', v_pool.active_seats
    );
END;
$$;

/**
 * fn_workforce_process_chargeback
 * Membekukan seluruh kredit mengendap (dormant AVAILABLE) saat dispute perbankan
 * Mengupdate status transaksi pembelian ke DISPUTED.
 * Invariant: Kredit yang sudah terpakai (CONSUMED) tidak menimbulkan saldo minus.
 */
CREATE OR REPLACE FUNCTION fn_workforce_process_chargeback(
    p_payment_reference TEXT,
    p_reason TEXT DEFAULT 'Chargeback dispute'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = workforce_staging, extensions, public, pg_temp
AS $$
DECLARE
    v_frozen_count INT := 0;
    v_branch_id TEXT;
BEGIN
    -- 1. Mark parent purchase transaction as DISPUTED if exists and resolve branch_id
    UPDATE credit_purchase_transactions
    SET status = 'DISPUTED'
    WHERE payment_reference = p_payment_reference
    RETURNING branch_id INTO v_branch_id;

    IF v_branch_id IS NULL THEN
        SELECT branch_id INTO v_branch_id
        FROM credit_purchase_transactions
        WHERE payment_reference = p_payment_reference;
    END IF;

    IF v_branch_id IS NULL THEN
        SELECT branch_id INTO v_branch_id
        FROM seat_credit_ledger
        WHERE payment_reference = p_payment_reference
        LIMIT 1;
    END IF;

    -- 2. Lock and freeze available credits
    IF v_branch_id IS NOT NULL THEN
        PERFORM id
        FROM seat_credit_ledger
        WHERE payment_reference = p_payment_reference AND status = 'AVAILABLE'
        FOR UPDATE;

        -- Update status to FROZEN
        UPDATE seat_credit_ledger
        SET status = 'FROZEN',
            action_type = 'FREEZE',
            audit_reason = p_reason
        WHERE payment_reference = p_payment_reference AND status = 'AVAILABLE';

        GET DIAGNOSTICS v_frozen_count = ROW_COUNT;

        -- 3. Deduct frozen credits from branch_credit_pools (zero negative debt)
        IF v_frozen_count > 0 THEN
            UPDATE branch_credit_pools
            SET available_credits = GREATEST(0, available_credits - v_frozen_count),
                updated_at = NOW()
            WHERE branch_id = v_branch_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'payment_reference', p_payment_reference,
        'frozen_credits_count', v_frozen_count,
        'branch_id', v_branch_id,
        'reason', p_reason
    );
END;
$$;
