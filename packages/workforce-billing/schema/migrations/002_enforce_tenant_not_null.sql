-- =========================================================================================
-- BWM GATE 1 SECURITY MIGRATION: 002_enforce_tenant_not_null.sql
-- Enforce Authoritative Tenant Ownership & Zero Unbound Webhooks
--
-- Target: workforce_staging.workforce_webhook_inbox
-- Directives:
-- 1. Quarantine legacy unassigned webhooks (fail-closed status FAILED)
-- 2. Lock tenant_id column to NOT NULL
-- =========================================================================================

-- Step 1: Karantina / update data legacy yang tenant_id-nya NULL
UPDATE workforce_staging.workforce_webhook_inbox
SET tenant_id = 'quarantine_legacy_' || id::text, status = 'FAILED'
WHERE tenant_id IS NULL;

-- Step 2: Kunci kolom menjadi NOT NULL
ALTER TABLE workforce_staging.workforce_webhook_inbox
ALTER COLUMN tenant_id SET NOT NULL;

-- Step 3: Pastikan index tenant_id ada untuk query performance & tenant isolation
CREATE INDEX IF NOT EXISTS idx_workforce_webhook_inbox_tenant 
ON workforce_staging.workforce_webhook_inbox(tenant_id);

