-- ============================================================================
-- packages/workforce-billing/schema/tenant_pass_ledger.sql
-- BWM Tenant Pass Ledger Schema & Atomic Constraints
--
-- Strict Multi-Tenant Isolation & Anti-Negative Balance Enforcement
-- ============================================================================

CREATE TABLE IF NOT EXISTS workforce_staging.tenant_pass_ledger (
    entry_id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    batch_id VARCHAR(64) NOT NULL,
    delta_passes INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reason VARCHAR(32) NOT NULL,
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_tenant_ledger_balance_non_negative CHECK (balance_after >= 0)
);

CREATE INDEX IF NOT EXISTS idx_tenant_pass_ledger_tenant ON workforce_staging.tenant_pass_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_pass_ledger_idempotency ON workforce_staging.tenant_pass_ledger(idempotency_key);

