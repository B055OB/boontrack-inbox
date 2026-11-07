# BWM GATE 1 TECHNICAL AUDIT EVIDENCE: PERSISTENT TRANSACTION REGISTRY & DATABASE IMMUTABILITY (ROUND 2)

**Date:** 2026-11-07  
**Branch:** `feat/bwm-workforce-isolated`  
**Target Schema:** `workforce_staging`  
**Target Environment:** LIVE POSTGRESQL STAGING  
**Sign-off Scope:** CTO Technical Mandate Round 2 — Unification of Settlement Path & Database-Level Immutability Enforcement  

---

## 1. Executive Summary & Security Baseline

Pursuant to the CTO Security Directive for Gate 1 Technical Sign-off (Round 2 Remediation), this audit evidence documents:
1. **Database-Level Immutability & State Machine Enforcement:** Applied migration `004_enforce_payment_registry_immutability.sql` creating a PostgreSQL trigger on `workforce_staging.workforce_payment_registry` that blocks any update to immutable business fields (`tenant_id`, `internal_order_id`, `provider`, `currency`, `expected_amount`) and strictly enforces legal status transitions.
2. **Total Elimination of Dual Settlement Path:** `processWebhookAndMutateLedgerAtomic()` in `postgres-tenant-pass-ledger.ts` has been refactored to remove all direct ledger insertions and route financial pass mutations exclusively through `persistent-payment-registry.ts` (`verifyAndSettleAuthoritativePayment`).
3. **Fail-Closed Missing Payment Reference Across All Entry Points:** Any invocation without an authoritative, pre-registered, and bound payment reference is immediately rejected across `verifyAndSettleAuthoritativePayment`, `processWebhookAndMutateLedgerAtomic`, and `verifyAuthoritativePaymentTenant`.
4. **Tightened BOUND Status, Provider Account, and Pass Quantity Validation:**
   - Orders must be strictly in `BOUND` status to settle.
   - If an order has a registered `provider_account_id`, the webhook must supply an identical account ID or fail-closed.
   - `delta_passes` must be an integer greater than 0.

---

## 2. PostgreSQL DDL Migration 004 Evidence

### 2.1 Forward Migration: `004_enforce_payment_registry_immutability.sql`
```sql
-- packages/workforce-billing/schema/migrations/004_enforce_payment_registry_immutability.sql
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
```

### 2.2 Live PostgreSQL Staging Verification
Applied directly on live PostgreSQL staging database. Querying `information_schema.triggers`:
```
Trigger Name:     trg_payment_registry_immutability
Event:            UPDATE
Action Timing:    BEFORE
Action Statement: EXECUTE FUNCTION workforce_staging.fn_enforce_payment_registry_immutability()
Target Table:     workforce_staging.workforce_payment_registry
Status:           ACTIVE
```

---

## 3. Unified Settlement Architecture & Elimination of Dual Path

### 3.1 Single Authoritative Settlement Path
```
Webhook Event
     │
     ▼
PostgresTenantPassLedger.processWebhookAndMutateLedgerAtomic()
     │
     ├─► Advisory Lock: pg_advisory_xact_lock(hashtext(tenant_id))
     ├─► Check workforce_webhook_inbox (fail-closed on ambiguous / mismatch / legacy unbound)
     │
     ▼
verifyAndSettleAuthoritativePayment(client, payload, targetSchema, { inTransaction: true })
     │
     ├─► Row-Level Lock: workforce_payment_registry FOR UPDATE
     ├─► Status Verification: order.status === 'BOUND' (rejection if INITIATED, FAILED, EXPIRED, SETTLED)
     ├─► Tenant Scoping: order.tenant_id === webhookPayload.tenant_id
     ├─► Financial Match: currency === order.currency && amount === expected_amount
     ├─► Provider Scoping: provider match && provider_account_id match
     ├─► Quantity Validation: Number.isInteger(delta_passes) && delta_passes > 0
     ├─► Row-Level Lock: tenant_pass_ledger FOR UPDATE
     ├─► Pass Allocation: INSERT INTO tenant_pass_ledger
     └─► Status Transition: UPDATE workforce_payment_registry SET status = 'SETTLED'
     │
     ▼
UPDATE workforce_webhook_inbox SET status = 'PROCESSED'
     │
     ▼
COMMIT (Atomic Single Transaction)
```

---

## 4. Verification of 9 CTO Regression Requirements

Executed via Jest: `node node_modules/jest/bin/jest.js __tests__/workforce/persistent-registry-authority.test.ts`:

```
PASS __tests__/workforce/persistent-registry-authority.test.ts (10.419 s)
  BWM Gate 1: Persistent Transaction Registry & Authority Engine (CTO Mandate Round 2)
    Requirement 1: Missing payment reference ditolak pada seluruh titik masuk settlement (fail-closed)
      √ 1a. verifyAndSettleAuthoritativePayment with empty or missing payment reference -> throws UNKNOWN_PAYMENT_REFERENCE (28 ms)
      √ 1b. PostgresTenantPassLedger.processWebhookAndMutateLedgerAtomic with missing payment reference -> throws UNKNOWN_PAYMENT_REFERENCE (4 ms)
      √ 1c. verifyAuthoritativePaymentTenant with missing payment reference -> throws UNKNOWN_PAYMENT_REFERENCE (1 ms)
      √ 1d. Unregistered payment reference lookup in persistent DB fails closed -> throws UNKNOWN_PAYMENT_REFERENCE (532 ms)
    Requirement 2: Status INITIATED, FAILED, dan EXPIRED ditolak masuk settlement
      √ 2a. Order in status INITIATED (unbound) is rejected from settlement (330 ms)
      √ 2b. Order in status FAILED is rejected from settlement with INVALID_PAYMENT_STATUS_NOT_BOUND (126 ms)
      √ 2c. Order in status EXPIRED is rejected from settlement with INVALID_PAYMENT_STATUS_NOT_BOUND (153 ms)
      √ 2d. Already SETTLED order is rejected with IDEMPOTENCY_REPLAY_SETTLED (244 ms)
    Requirement 3: Provider salah dan provider account hilang/salah ditolak (fail-closed)
      √ 3a. Wrong provider is rejected with PROVIDER_OR_ACCOUNT_MISMATCH (109 ms)
      √ 3b. Missing required provider account is rejected with MISSING_REQUIRED_PROVIDER_ACCOUNT (98 ms)
      √ 3c. Mismatched provider account is rejected with PROVIDER_OR_ACCOUNT_MISMATCH (98 ms)
    Requirement 4: Amount dan currency mismatch ditolak
      √ 4a. Currency mismatch (order USD paid IDR) rejected with AMOUNT_OR_CURRENCY_MISMATCH (340 ms)
      √ 4b. Underpayment (amount less than expected) rejected with AMOUNT_OR_CURRENCY_MISMATCH (102 ms)
      √ 4c. Tampered amount (amount more than expected) rejected with AMOUNT_OR_CURRENCY_MISMATCH (100 ms)
      √ 4d. Non-positive or non-integer delta_passes rejected with INVALID_PASS_QUANTITY (1 ms)
    Requirement 5: Bukti DB Trigger: Percobaan UPDATE memicu PostgreSQL Exception
      √ 5a. Attempt direct UPDATE on tenant_id triggers IMMUTABLE_FIELD_MODIFICATION exception (43 ms)
      √ 5b. Attempt direct UPDATE on internal_order_id triggers IMMUTABLE_FIELD_MODIFICATION exception (104 ms)
      √ 5c. Attempt direct UPDATE on provider triggers IMMUTABLE_FIELD_MODIFICATION exception (40 ms)
      √ 5d. Attempt direct UPDATE on currency triggers IMMUTABLE_FIELD_MODIFICATION exception (44 ms)
      √ 5e. Attempt direct UPDATE on expected_amount triggers IMMUTABLE_FIELD_MODIFICATION exception (131 ms)
      √ 5f. Illegal status transition INITIATED -> SETTLED triggers INVALID_STATUS_TRANSITION exception (117 ms)
      √ 5g. Attempt transition on SETTLED order triggers INVALID_STATUS_TRANSITION exception (SETTLED is immutable) (218 ms)
      √ 5h. Attempt transition on FAILED/EXPIRED terminal order triggers INVALID_STATUS_TRANSITION exception (161 ms)
    Requirement 6: Concurrent duplicate settlement across independent connections terbukti atomik
      √ Concurrent duplicate settlement across independent connections: exactly 1 succeeds, exactly 1 fails (204 ms)
    Requirement 7: Zero ledger side-effects pada seluruh skenario penolakan (COUNT(*) ledger === 0)
      √ Zero ledger side-effects across all rejection scenarios (292 ms)
    Requirement 8: Tepat satu ledger entry pada settlement yang valid
      √ 8a. Direct authoritative settlement creates exactly ONE ledger entry (251 ms)
      √ 8b. Unified settlement via processWebhookAndMutateLedgerAtomic creates exactly ONE ledger entry and updates inbox to PROCESSED (550 ms)
    Requirement 9: Operasi sah tenant tetap berjalan tanpa degradasi
      √ 9a. Multi-instance verification across independent connection pools executes seamlessly (179 ms)
      √ 9b. Application restart persistence (data registry intact after complete pool disposal) (1055 ms)
      √ 9c. Multiple consecutive valid purchases accumulate tenant balance deterministically (1093 ms)

Test Suites: 1 passed, 1 total
Tests:       30 passed, 30 total
Snapshots:   0 total
Time:        11.358 s
```

---

## 5. Full Workforce Regression Test Suite Execution

Executed via `node node_modules/jest/bin/jest.js __tests__/workforce/ --runInBand`:

```
PASS __tests__/workforce/marginal-pricing-and-ledger.test.ts (13.362 s)
PASS __tests__/workforce/persistent-registry-authority.test.ts (7.752 s)
PASS __tests__/workforce/e6-staging-db.test.ts
PASS __tests__/workforce/e6-workforce-e2e.test.ts
PASS __tests__/workforce/e6-chargeback-dispute.test.ts
PASS __tests__/workforce/e6-consumption-concurrency.test.ts
PASS __tests__/workforce/e6-purchase-concurrency.test.ts
PASS __tests__/workforce/e8-staging-sandbox-integration.test.ts
PASS __tests__/workforce/e6-preview-readiness.test.ts
PASS __tests__/workforce/e9-dynamic-branding-pilot.test.ts
PASS __tests__/workforce/credit-pool-ledger.test.ts
PASS __tests__/workforce/e9-white-label-pilot.test.ts
PASS __tests__/workforce/workforce-middleware.test.ts
PASS __tests__/workforce/e3-security.test.ts
PASS __tests__/workforce/e6-auth-regression.test.ts
PASS __tests__/workforce/e7-payment-infrastructure-financial-integrity.test.ts
PASS __tests__/workforce/e2-scaffolding.test.ts
PASS __tests__/workforce/e5-persistence-hardening.test.ts
PASS __tests__/workforce/host-validation.test.ts
PASS __tests__/workforce/billing-lifecycle.test.ts
PASS __tests__/workforce/tenant-hierarchy.test.ts
PASS __tests__/workforce/supabase-fallback-client.test.ts
PASS __tests__/workforce/e6-pwa-pipeline.test.ts
PASS __tests__/workforce/e6-dual-dispatch-scheduler.test.ts
PASS __tests__/workforce/e5-contract-simulation.test.ts
PASS __tests__/workforce/storage-isolation.test.ts

Test Suites: 26 passed, 26 total
Tests:       287 passed, 287 total
Snapshots:   0 total
Time:        42.659 s
```

---

## 6. Next.js Production Build Verification

Executed via `cmd /c npm run build:workforce`:

```
▲ Next.js 16.3.2 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 208ms
✓ Compiled successfully in 5.1s
  Running TypeScript ...
  Finished TypeScript in 36.7s ...
  Collecting page data using 3 workers ...
✓ Generating static pages using 3 workers (22/22) in 3.2s
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

Exit Code: 0 (All 22 routes compiled successfully, 0 TypeScript errors)
```

---

## 7. Gate 1 Sign-off Matrix

| Requirement | Implementation | Evidence Reference | Status |
| :--- | :--- | :--- | :---: |
| DDL Trigger Immutability | `trg_payment_registry_immutability` blocks core column updates | Section 2.1 & Section 4 (Req 5) | **VERIFIED** |
| State Machine Enforcement | INITIATED -> BOUND -> SETTLED; Terminal FAILED / EXPIRED | Section 2.1 & Section 4 (Req 2 & 5) | **VERIFIED** |
| Dual Path Elimination | Unified exclusively via `verifyAndSettleAuthoritativePayment` | Section 3.1 & Section 4 (Req 8b) | **VERIFIED** |
| Fail-Closed Missing Payment Ref | Missing reference rejected at all entry points | Section 4 (Req 1a-d) | **VERIFIED** |
| Strict BOUND Status | Status must be BOUND to settle | Section 4 (Req 2a-c) | **VERIFIED** |
| Provider Account ID Verification | Matching account ID required when defined | Section 4 (Req 3b-c) | **VERIFIED** |
| Pass Quantity Validation | Number.isInteger(passes) && passes > 0 | Section 4 (Req 4d) | **VERIFIED** |
| Amount & Currency Protection | Mismatch rejected with zero mutations | Section 4 (Req 4a-c) | **VERIFIED** |
| Concurrency Atomicity | 2 concurrent requests race: exactly 1 succeeds | Section 4 (Req 6) | **VERIFIED** |
| Zero Ledger Side-Effects | `COUNT(*) === 0` on rejected claims | Section 4 (Req 7) | **VERIFIED** |
| Exact One Ledger Row | Valid settlement creates strictly 1 entry | Section 4 (Req 8a-b) | **VERIFIED** |
| Normal Operations Maintained | Multi-pool & restart persistence intact | Section 4 (Req 9a-c) | **VERIFIED** |
| All Regression Suites Passing | 26/26 suites, 287/287 tests passing | Section 5 | **100% PASSED** |
| Production Build Compilation | Next.js 22 routes built with Exit Code 0 | Section 6 | **PASSED** |
