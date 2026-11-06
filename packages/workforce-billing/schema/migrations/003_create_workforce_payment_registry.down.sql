-- =========================================================================================
-- BWM GATE 1 SECURITY ROLLBACK: 003_create_workforce_payment_registry.down.sql
-- Rollback for persistent transaction registry table
-- =========================================================================================

DROP INDEX IF EXISTS workforce_staging.idx_payment_registry_status;
DROP INDEX IF EXISTS workforce_staging.idx_payment_registry_tenant;
DROP INDEX IF EXISTS workforce_staging.uq_payment_registry_provider_tx;
DROP TABLE IF EXISTS workforce_staging.workforce_payment_registry CASCADE;
