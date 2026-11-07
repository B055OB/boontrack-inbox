-- =========================================================================================
-- BWM GATE 1 SECURITY MIGRATION: 006_enforce_bound_transaction_reference.sql
-- Final Persistent Binding Completeness & Database Authority Enforcement (Round 3C)
--
-- Target: workforce_staging.workforce_payment_registry
-- Rules:
-- 1. Add check constraint chk_payment_registry_bound_has_valid_tx:
--    Records in BOUND or SETTLED must possess a valid, non-empty, non-whitespace provider_transaction_id
-- 2. Update trigger function fn_enforce_payment_registry_immutability():
--    - Enforce that transitioning to or remaining in BOUND or SETTLED strictly requires
--      a valid, non-null, non-empty, non-whitespace provider_transaction_id
--    - Reject attempts with: 'INVALID_BINDING_REFERENCE: Status BOUND requires a non-empty, valid provider_transaction_id'
-- =========================================================================================

CREATE SCHEMA IF NOT EXISTS workforce_staging;

-- 1. Check constraint: BOUND and SETTLED require valid, non-empty provider_transaction_id
ALTER TABLE workforce_staging.workforce_payment_registry 
DROP CONSTRAINT IF EXISTS chk_payment_registry_bound_has_valid_tx;

ALTER TABLE workforce_staging.workforce_payment_registry 
ADD CONSTRAINT chk_payment_registry_bound_has_valid_tx 
CHECK (
    status NOT IN ('BOUND', 'SETTLED') OR 
    (provider_transaction_id IS NOT NULL AND LENGTH(TRIM(provider_transaction_id)) > 0)
);

-- 2. Enhanced Trigger Function with Bound Transaction Reference Validation
CREATE OR REPLACE FUNCTION workforce_staging.fn_enforce_payment_registry_immutability()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. Disallow modifications to immutable core business fields
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

    -- 2. Enforce State Machine Transitions FIRST
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

    -- 3. Enforce Post-Bound Immutability for provider_transaction_id & provider_account_id
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

    -- 4. Enforce Mandatory Valid Provider Transaction Reference when entering/remaining in BOUND or SETTLED
    IF NEW.status IN ('BOUND', 'SETTLED') THEN
        IF NEW.provider_transaction_id IS NULL OR TRIM(NEW.provider_transaction_id) = '' THEN
            RAISE EXCEPTION 'INVALID_BINDING_REFERENCE: Status % requires a non-empty, valid provider_transaction_id', NEW.status;
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
