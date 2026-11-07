-- =========================================================================================
-- BWM GATE 1 SECURITY ROLLBACK: 004_enforce_payment_registry_immutability.down.sql
-- Rollback for database-level immutability trigger
-- =========================================================================================

DROP TRIGGER IF EXISTS trg_payment_registry_immutability ON workforce_staging.workforce_payment_registry;
DROP FUNCTION IF EXISTS workforce_staging.fn_enforce_payment_registry_immutability();

