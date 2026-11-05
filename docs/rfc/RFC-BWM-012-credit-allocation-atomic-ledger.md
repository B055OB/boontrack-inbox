# RFC-BWM-012: Credit Allocation & Atomic Ledger Engine

- **Status**: APPROVED
- **Author**: BWM Architecture Working Group
- **Reviewers**: CTO, Head of Financial Systems
- **Target Schema / Workspace**: Isolated Workforce Billing (`packages/workforce-billing/`)
- **Blast Radius**: ISOLATED (Zero touch to core BoonTrack modules)

---

## 1. Executive Summary

BWM Credit Passes are the prepaid license currency enabling personnel deployment across client sites. Under the CTO Mandate:
1. **Prepaid Model**: Passes are purchased in lots (minimum deposit: 5 passes; standard packages: 25, 50, 100 passes).
2. **Delayed Activation**: Purchase does **not** activate passes automatically. Passes remain in a dormant pool until an administrator explicitly assigns them to an active personnel.
3. **Strict Invariants**:
   - 1 Pass = 30 rolling calendar days of active operational access for 1 personnel.
   - Early personnel termination does **not** yield refunds or partial credits.
   - Chargebacks immediately freeze unused/dormant credits without creating negative balances.
   - Non-Negative Balance Hard Constraint: `available_balance >= 0` enforced at database constraint level.
4. **Concurrency & Atomicity**: FIFO lot allocation secured via Database Row-Level Locking (`SELECT ... FOR UPDATE` with `SKIP LOCKED`), eliminating race conditions in multi-admin environments.

---

## 2. Data Model: Lots, Allocations & Ledger

```
+-------------------------------------------------------------------------------+
|                            credit_lots (Prepaid Batches)                      |
|  - lot_id               - branch_id           - total_purchased               |
|  - available_credits    - status: ACTIVE | DEPLETED | FROZEN | CHARGEBACK      |
+-------------------------------------------------------------------------------+
                                    |
                           [FIFO Allocation via]
                           [SELECT FOR UPDATE  ]
                                    v
+-------------------------------------------------------------------------------+
|                          credit_allocations (Active Licenses)                 |
|  - allocation_id        - lot_id              - personnel_id                  |
|  - activated_at         - expires_at (activated_at + 30 days)                |
|  - status: ACTIVE | EXPIRED | TERMINATED                                      |
+-------------------------------------------------------------------------------+
                                    |
                           [Audit Log & Event]
                                    v
+-------------------------------------------------------------------------------+
|                         credit_ledger (Append-Only Log)                       |
|  - entry_id             - delta (+/- credits) - balance_after                 |
|  - reason: PURCHASE | CONSUMPTION | CHARGEBACK_FREEZE | UNFREEZE | REVERSAL   |
+-------------------------------------------------------------------------------+
```

---

## 3. Concurrency Protection: Row-Level Locking Pattern

In high-concurrency environments with multiple branch administrators assigning personnel simultaneously, in-memory mutexes fail across serverless or multi-container instances.
The atomic engine enforces database-level serializability:

```sql
-- Step 1: Lock the branch credit balance to serialize consumption
SELECT id, available_credits
FROM branch_credit_pools
WHERE branch_id = $1
FOR UPDATE;

-- Step 2: Validate invariant: available_credits >= requested_count
-- If available_credits < requested_count: ROLLBACK and RAISE EXCEPTION 'INSUFFICIENT_CREDITS';

-- Step 3: Fetch oldest active lot with available credits (FIFO)
SELECT id, available_credits
FROM credit_lots
WHERE branch_id = $1 AND status = 'ACTIVE' AND available_credits > 0
ORDER BY created_at ASC
LIMIT 1
FOR UPDATE;

-- Step 4: Decrement lot and branch pool, insert allocation and append-only ledger entry
UPDATE credit_lots
SET available_credits = available_credits - 1,
    status = CASE WHEN available_credits - 1 = 0 THEN 'DEPLETED' ELSE 'ACTIVE' END,
    updated_at = NOW()
WHERE id = $target_lot_id;

UPDATE branch_credit_pools
SET available_credits = available_credits - 1,
    active_seats = active_seats + 1,
    updated_at = NOW()
WHERE branch_id = $1;

INSERT INTO credit_allocations (
    id, lot_id, branch_id, personnel_id, activated_at, expires_at, status
) VALUES (
    gen_random_uuid(), $target_lot_id, $1, $personnel_id, NOW(), NOW() + INTERVAL '30 days', 'ACTIVE'
);

INSERT INTO credit_ledger (
    id, branch_id, lot_id, delta, balance_after, reason, reference_id, created_at
) VALUES (
    gen_random_uuid(), $1, $target_lot_id, -1, $new_balance, 'CONSUMPTION', $personnel_id, NOW()
);
```

---

## 4. Business Rule Invariants

1. **30-Day Expiration Clock**:
   The 30-day countdown begins **strictly upon personnel assignment**, never at invoice checkout.
2. **No Partial Refunds**:
   If a security officer leaves a post after 5 days, the consumed pass is non-refundable and non-transferable. A new officer deployment requires consuming another pass.
3. **Chargeback Handling**:
   When a payment dispute occurs:
   - All unused/available passes in the disputed lot are marked `FROZEN`.
   - The branch's `available_credits` is decremented by the count of frozen passes.
   - If passes were already consumed, active personnel retain operational coverage until the 30-day cycle expires (no mid-shift abrupt lockout).
   - Invariant: `available_credits` can drop to `0`, but **never below zero** (no silent negative debt).
4. **Early Renewal (Rollover)**:
   Renewing an active personnel prior to expiration consumes 1 pass and adds exactly 30 days to the **existing** `expires_at` date, preserving prepaid coverage.

