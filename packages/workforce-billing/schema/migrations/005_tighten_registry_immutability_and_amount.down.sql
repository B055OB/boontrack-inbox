-- =========================================================================================
-- BWM GATE 1 SECURITY ROLLBACK: 005_tighten_registry_immutability_and_amount.down.sql
-- Rollback for post-bound immutability and positive amount constraint
-- =========================================================================================

-- 1. Drop positive amount check constraint
ALTER TABLE workforce_staging.workforce_payment_registry 
DROP CONSTRAINT IF EXISTS chk_payment_registry_positive_amount;

-- 2. Revert trigger function to migration 004 version
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

    -- 2. Enforce State Machine Transitions
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
