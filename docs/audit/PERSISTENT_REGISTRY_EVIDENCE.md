# BWM GATE 1 TECHNICAL AUDIT EVIDENCE: PERSISTENT TRANSACTION REGISTRY & ZERO IN-MEMORY MAP

**Date:** 2026-11-07  
**Branch:** `feat/bwm-workforce-isolated`  
**Target Schema:** `workforce_staging`  
**Target Environment:** LIVE POSTGRESQL STAGING  
**Sign-off Scope:** CTO Technical Mandate — Implementation of Persistent Payment Registry & Complete Purge of In-Memory Map / Bypass Flags  

---

## 1. Executive Summary & Security Baseline

Pursuant to the CTO Security Directive for Gate 1 Technical Sign-off, this audit evidence documents the complete transition from the temporary in-memory verification map (`authoritativePaymentTenantRegistry`) to an immutable, multi-instance safe, PostgreSQL-backed transaction registry: `workforce_staging.workforce_payment_registry`.

### Strict Operational Guardrails Enforced:
1. **Zero In-Memory Map Fallback:** All payment authorization, pre-checkout order registration, transaction binding, and settlement checks query the persistent PostgreSQL database directly with transactional row-level locks (`SELECT ... FOR UPDATE`).
2. **Zero Bypass Flags:** The legacy `rawPayload.authoritative_verified === true` flag has been completely eradicated across the billing engine.
3. **Fail-Closed Security Invariants:** Any anomaly (unknown reference, empty reference, cross-tenant claim, currency mismatch, amount discrepancy, or duplicate replay) immediately aborts with transaction rollback and zero ledger side-effects.
4. **Environment Isolation:** Dodo Payments and live production environments remain strictly frozen.

---

## 2. PostgreSQL DDL Migration Evidence

### 2.1 Forward Migration: `003_create_workforce_payment_registry.sql`
```sql
-- packages/workforce-billing/schema/migrations/003_create_workforce_payment_registry.sql
CREATE SCHEMA IF NOT EXISTS workforce_staging;

CREATE TABLE IF NOT EXISTS workforce_staging.workforce_payment_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    internal_order_id VARCHAR(128) NOT NULL,
    provider VARCHAR(32) NOT NULL, -- 'xendit' | 'dodo'
    provider_account_id VARCHAR(64),
    provider_transaction_id VARCHAR(128), -- Nullable saat registrasi awal pre-checkout
    currency VARCHAR(8) NOT NULL, -- 'IDR' | 'USD'
    expected_amount BIGINT NOT NULL, -- Integer amount (rupiah murni / integer-cents)
    status VARCHAR(32) NOT NULL DEFAULT 'INITIATED', -- INITIATED, BOUND, SETTLED, FAILED, EXPIRED
    authoritative_verified_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payment_registry_tenant_order UNIQUE (tenant_id, internal_order_id),
    CONSTRAINT chk_payment_registry_status CHECK (status IN ('INITIATED', 'BOUND', 'SETTLED', 'FAILED', 'EXPIRED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_registry_provider_tx 
ON workforce_staging.workforce_payment_registry (provider, provider_transaction_id) 
WHERE provider_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_registry_tenant 
ON workforce_staging.workforce_payment_registry(tenant_id);

CREATE INDEX IF NOT EXISTS idx_payment_registry_status 
ON workforce_staging.workforce_payment_registry(status);
```

### 2.2 Rollback Script: `003_create_workforce_payment_registry.down.sql`
```sql
-- packages/workforce-billing/schema/migrations/003_create_workforce_payment_registry.down.sql
DROP INDEX IF EXISTS workforce_staging.idx_payment_registry_status;
DROP INDEX IF EXISTS workforce_staging.idx_payment_registry_tenant;
DROP INDEX IF EXISTS workforce_staging.uq_payment_registry_provider_tx;
DROP TABLE IF EXISTS workforce_staging.workforce_payment_registry CASCADE;
```

### 2.3 Live PostgreSQL Schema Verification
Querying `information_schema.columns` on staging PostgreSQL:
```
Table: workforce_staging.workforce_payment_registry
- id:                         uuid (NOT NULL, DEFAULT gen_random_uuid())
- tenant_id:                  character varying(64) (NOT NULL)
- internal_order_id:          character varying(128) (NOT NULL)
- provider:                   character varying(32) (NOT NULL)
- provider_account_id:        character varying(64) (NULLABLE)
- provider_transaction_id:    character varying(128) (NULLABLE)
- currency:                   character varying(8) (NOT NULL)
- expected_amount:            bigint (NOT NULL)
- status:                     character varying(32) (NOT NULL, DEFAULT 'INITIATED')
- authoritative_verified_at:  timestamp with time zone (NULLABLE)
- metadata:                   jsonb (DEFAULT '{}')
- created_at:                 timestamp with time zone (NOT NULL, DEFAULT NOW())
- updated_at:                 timestamp with time zone (NOT NULL, DEFAULT NOW())
Constraints:
- uq_payment_registry_tenant_order: UNIQUE (tenant_id, internal_order_id)
- uq_payment_registry_provider_tx:  UNIQUE (provider, provider_transaction_id) WHERE provider_transaction_id IS NOT NULL
- chk_payment_registry_status:      CHECK (status IN ('INITIATED', 'BOUND', 'SETTLED', 'FAILED', 'EXPIRED'))
```

---

## 3. Persistent Transaction Engine Architecture

Located at: `packages/workforce-billing/registry/persistent-payment-registry.ts`

### 3.1 `registerOrderPreCheckout`
Inserts order record into `workforce_staging.workforce_payment_registry` with status `'INITIATED'` and strict positive integer amount validation before communicating with payment gateway checkout APIs.

### 3.2 `bindProviderTransaction`
Atomically transitions status from `'INITIATED'` to `'BOUND'` upon receiving gateway transaction reference (`provider_transaction_id`). Governed by partial unique index `uq_payment_registry_provider_tx` preventing duplicate binding.

### 3.3 `verifyAndSettleAuthoritativePayment`
Executes single atomic database transaction (`BEGIN ... COMMIT`) with row-level locks:
1. `SELECT ... FROM workforce_payment_registry WHERE provider_transaction_id = $1 FOR UPDATE`
2. **Fail-Closed Validations:**
   - Empty or missing transaction reference -> `UNKNOWN_PAYMENT_REFERENCE`
   - Unregistered transaction reference -> `UNKNOWN_PAYMENT_REFERENCE`
   - Status already `'SETTLED'` -> `DUPLICATE_WEBHOOK_IDEMPOTENCY`
   - Claimed `tenant_id` does not match order record -> `CROSS_TENANT_COLLISION`
   - Provider or account mismatch -> `PROVIDER_OR_ACCOUNT_MISMATCH`
   - Currency mismatch -> `AMOUNT_OR_CURRENCY_MISMATCH`
   - Paid amount does not match expected integer amount -> `AMOUNT_OR_CURRENCY_MISMATCH`
3. **Atomic Ledger Mutation:**
   - Obtains transactional advisory lock on tenant: `SELECT pg_advisory_xact_lock(hashtext($1))`
   - Fetches and locks latest balance in `workforce_staging.tenant_pass_ledger FOR UPDATE`
   - Inserts immutable ledger entry into `workforce_staging.tenant_pass_ledger`
   - Updates `workforce_staging.workforce_payment_registry` status to `'SETTLED'` with `authoritative_verified_at = NOW()`
4. If any error occurs, database cleanly executes `ROLLBACK`, guaranteeing zero ledger mutations.

---

## 4. Verification Evidence: 12 CTO Mandatory Scenarios

Executed via `node node_modules/jest/bin/jest.js __tests__/workforce/persistent-registry-authority.test.ts --verbose`:

```
PASS __tests__/workforce/persistent-registry-authority.test.ts
  BWM Gate 1: Persistent Transaction Registry & Authority Engine
    √ Scenario 1: Multi-instance verification across independent connection pools (201 ms)
    √ Scenario 2: Application restart persistence (data registry intact after pool disposal) (575 ms)
    √ Scenario 3: Unknown payment reference rejection (fail-closed) (106 ms)
    √ Scenario 4: Empty payment reference rejection (1 ms)
    √ Scenario 5: Cross-tenant collision rejection (adversary claiming legit tenant transaction) (109 ms)
    √ Scenario 6: Currency mismatch rejection (USD order paid in IDR) (120 ms)
    √ Scenario 7: Amount mismatch rejection (underpayment or value tampering) (393 ms)
    √ Scenario 8: Provider and provider account mismatch rejection (203 ms)
    √ Scenario 9: Duplicate webhook idempotency rejects replay on already settled order (478 ms)
    √ Scenario 10: Concurrent duplicate webhook handling (2 requests race, exactly 1 succeeds) (196 ms)
    √ Scenario 11: Zero ledger side-effects on invalid claims (COUNT(*) ledger === 0 on rejected claims) (703 ms)
    √ Scenario 12: Valid settlement creates exactly ONE authoritative ledger entry (465 ms)

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        7.035 s
```

---

## 5. Master Workforce Test Suite Verification (Full Regression)

Executed via `node node_modules/jest/bin/jest.js __tests__/workforce/ --runInBand`:

```
PASS __tests__/workforce/marginal-pricing-and-ledger.test.ts (8.521 s)
  ● Console
    console.log
      Verified 10 Independent PG PIDs: [
        336906, 336913,
        336911, 336914,
        336909, 336908,
        336910, 336915,
        336912, 336916
      ]

PASS __tests__/workforce/persistent-registry-authority.test.ts (5.389 s)
PASS __tests__/workforce/e8-staging-sandbox-integration.test.ts
PASS __tests__/workforce/e6-purchase-concurrency.test.ts (5.252 s)
PASS __tests__/workforce/e6-consumption-concurrency.test.ts
PASS __tests__/workforce/e6-chargeback-dispute.test.ts
PASS __tests__/workforce/e6-staging-db.test.ts
PASS __tests__/workforce/e6-preview-readiness.test.ts
PASS __tests__/workforce/e9-dynamic-branding-pilot.test.ts
PASS __tests__/workforce/e6-workforce-e2e.test.ts
PASS __tests__/workforce/billing-lifecycle.test.ts
PASS __tests__/workforce/e6-auth-regression.test.ts
PASS __tests__/workforce/e9-white-label-pilot.test.ts
PASS __tests__/workforce/storage-isolation.test.ts
PASS __tests__/workforce/e6-pwa-pipeline.test.ts
PASS __tests__/workforce/e3-security.test.ts
PASS __tests__/workforce/e7-payment-infrastructure-financial-integrity.test.ts
PASS __tests__/workforce/e5-contract-simulation.test.ts
PASS __tests__/workforce/workforce-middleware.test.ts
PASS __tests__/workforce/host-validation.test.ts
PASS __tests__/workforce/e6-dual-dispatch-scheduler.test.ts
PASS __tests__/workforce/tenant-hierarchy.test.ts
PASS __tests__/workforce/credit-pool-ledger.test.ts
PASS __tests__/workforce/e5-persistence-hardening.test.ts
PASS __tests__/workforce/e2-scaffolding.test.ts
PASS __tests__/workforce/supabase-fallback-client.test.ts

Test Suites: 26 passed, 26 total
Tests:       269 passed, 269 total
Snapshots:   0 total
Time:        40.617 s
Ran all test suites matching __tests__/workforce/.
```

---

## 6. Next.js Production Compilation Verification

Executed via `cmd /c npm run build:workforce`:

```
▲ Next.js 16.3.2 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 131ms
✓ Compiled successfully in 2.8s
  Running TypeScript ...
  Finished TypeScript in 11.5s ...
  Collecting page data using 3 workers ...
✓ Generating static pages using 3 workers (22/22) in 5.9s
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ƒ /_not-found
├ ƒ /admin
├ ƒ /api/auth/callback
├ ƒ /api/auth/login
├ ƒ /api/auth/logout
├ ƒ /api/auth/me
├ ƒ /api/auth/refresh
├ ƒ /api/cron/nudge-checkout
├ ƒ /api/incidents
├ ƒ /api/manifest
├ ○ /apple-icon.png
├ ƒ /dashboard
├ ƒ /field
├ ○ /icon.png
├ ƒ /login
├ ƒ /ops
├ ƒ /portal
├ ƒ /supervisor
└ ƒ /workforce.webmanifest

Exit Code: 0 (All 22 routes compiled successfully)
```

---

## 7. Sign-off Readiness Checklist

| Requirement | Implementation | Evidence Reference | Status |
| :--- | :--- | :--- | :---: |
| DDL Migration Table | `workforce_staging.workforce_payment_registry` created | Section 2.1 & 2.3 | **VERIFIED** |
| Unique Constraints | `uq_payment_registry_tenant_order` & `uq_payment_registry_provider_tx` | Section 2.1 & 2.3 | **VERIFIED** |
| In-Memory Map Removal | `authoritativePaymentTenantRegistry` Map fully purged | Section 3 | **PURGED** |
| Bypass Flag Removal | `rawPayload.authoritative_verified` fully eradicated | Section 3 | **PURGED** |
| Pre-Checkout Register | `registerOrderPreCheckout()` implemented | Section 3.1 & Scenario 1, 2, 5-8, 10-12 | **VERIFIED** |
| Provider Tx Binding | `bindProviderTransaction()` implemented | Section 3.2 & Scenario 1, 2, 5-8, 10-12 | **VERIFIED** |
| Authoritative Settle | `verifyAndSettleAuthoritativePayment()` implemented | Section 3.3 & Scenario 1-12 | **VERIFIED** |
| Multi-instance Proof | Tested across 2 separate `pg.Pool` instances | Section 4 (Scenario 1) | **VERIFIED** |
| Restart Persistence | Tested after closing pool and reconnecting | Section 4 (Scenario 2) | **VERIFIED** |
| Concurrency Atomicity | 2 concurrent settlements race: exactly 1 succeeds | Section 4 (Scenario 10) | **VERIFIED** |
| Zero Side-Effects | `COUNT(*) === 0` on rejected claims | Section 4 (Scenario 11) | **VERIFIED** |
| Exact One Ledger Row | Valid settlement produces strictly 1 ledger row | Section 4 (Scenario 12) | **VERIFIED** |
| Regression Suites | 26 test suites / 269 tests passing (100%) | Section 5 | **PASSED** |
| Next.js App Build | 22 routes compiled without errors | Section 6 | **PASSED** |
