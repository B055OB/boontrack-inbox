-- =========================================================================================
-- BWM GATE 1 SECURITY MIGRATION: 005_tighten_registry_immutability_and_amount.sql
-- Enforce Post-Bound Immutability, Strict Currency, Positive Amount & State Transition
--
-- Target: workforce_staging.workforce_payment_registry
-- Rules:
-- 1. Add check constraint: expected_amount > 0 (chk_payment_registry_positive_amount)
-- 2. Lock provider_transaction_id and provider_account_id after status transitions to BOUND, SETTLED, FAILED, or EXPIRED.
-- 3. Restrict setting provider_transaction_id and provider_account_id strictly to:
--    OLD.status = 'INITIATED' AND NEW.status = 'BOUND'
-- =========================================================================================

CREATE SCHEMA IF NOT EXISTS workforce_staging;

-- 1. Check constraint for positive expected_amount
ALTER TABLE workforce_staging.workforce_payment_registry 
DROP CONSTRAINT IF EXISTS chk_payment_registry_positive_amount;

ALTER TABLE workforce_staging.workforce_payment_registry 
ADD CONSTRAINT chk_payment_registry_positive_amount CHECK (expected_amount > 0);

-- 2. Enhanced Trigger Function with Post-Bound Immutability
CREATE OR REPLACE FUNCTION workforce_staging.fn_enforce_payment_registry_immutability()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. Disallow modifications to immutable core business fields
    IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: Column tenant_id cannot be modified once created (Old: %, New: %)', OLD.tenant_id, NEW.tenant_id;
    END IF;

    IF OLD.internal_order_id IS DISTINCT FROM NEW.internal_order_id THEN
        RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: Column internal_order_id cannot be modified once created (Old: %, New: %)', OLD.internal_order_id, NEW.internal_order_id;
    END IF;

    IF OLD.provider IS DISTINCT FROM NEW.provider THEN
        RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: Column provider cannot be modified once created (Old: %, New: %)', OLD.provider, NEW.provider;
    END IF;

    IF OLD.currency IS DISTINCT FROM NEW.currency THEN
        RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: Column currency cannot be modified once created (Old: %, New: %)', OLD.currency, NEW.currency;
    END IF;

    IF OLD.expected_amount IS DISTINCT FROM NEW.expected_amount THEN
        RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFICATION: Column expected_amount cannot be modified once created (Old: %, New: %)', OLD.expected_amount, NEW.expected_amount;
    END IF;

    -- 2. Enforce Post-Bound Immutability for provider_transaction_id & provider_account_id
    -- Only allow mutation during INITIATED -> BOUND transition
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

    -- 3. Enforce State Machine Transitions
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

    -- Auto-bump updated_at timestamp
    NEW.updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_registry_immutability ON workforce_staging.workforce_payment_registry;
CREATE TRIGGER trg_payment_registry_immutability
BEFORE UPDATE ON workforce_staging.workforce_payment_registry
FOR EACH ROW
EXECUTE FUNCTION workforce_staging.fn_enforce_payment_registry_immutability();
