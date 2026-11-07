-- =========================================================================================
-- BWM GATE 1 SECURITY MIGRATION: 004_enforce_payment_registry_immutability.sql
-- Enforce Database-Level Immutability & Status Machine Trigger
--
-- Target: workforce_staging.workforce_payment_registry
-- Rules:
-- 1. Disallow modifications to core immutable fields:
--    tenant_id, internal_order_id, provider, currency, expected_amount
-- 2. Enforce strict State Machine transitions:
--    - INITIATED -> BOUND, FAILED, EXPIRED
--    - BOUND -> SETTLED, FAILED, EXPIRED
--    - SETTLED -> IMMUTABLE (Terminal)
--    - FAILED / EXPIRED -> TERMINAL
-- =========================================================================================

CREATE SCHEMA IF NOT EXISTS workforce_staging;

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

