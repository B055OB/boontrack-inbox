# RFC-BWM-012: Credit Allocation & Atomic Ledger Engine

- **Status**: APPROVED
- **Author**: BWM Architecture Working Group
- **Reviewers**: CTO, Head of Financial Systems
- **Target Schema / Workspace**: Isolated Workforce Billing (`packages/workforce-billing/`)
- **Blast Radius**: ISOLATED (Zero touch to core BoonTrack modules)

---

## 1. Executive Summary

BWM Credit Passes are the prepaid license currency enabling personnel deployment across client sites. Under the CTO Mandate:
1. **Prepaid Model & Commercial Tenant Ownership (E8-R2)**:
   - Passes are purchased in lots (minimum deposit: 5 passes; standard packages: 25, 50, 100 passes).
   - **Credit Lots are tied directly to `tenant_id`** as the sole commercial owner of the balance pool.
   - **`branch_id` acts as the operational deployment target** for local site management.
   - Any credits not yet allocated at the branch level remain recorded as rollover credits belonging to the tenant.
2. **Delayed Activation**: Purchase does **not** activate passes automatically. Passes remain in a dormant pool until an administrator explicitly assigns them to an active personnel.
3. **Strict Invariants**:
   - 1 Pass = 30 rolling calendar days of active operational access for 1 personnel.
   - Early personnel termination does **not** yield refunds or partial credits.
   - Chargebacks immediately freeze unused/dormant credits without creating negative balances.
   - Non-Negative Balance Hard Constraint: `available_balance >= 0` enforced at database constraint level.
4. **Tenant Isolation & Row-Level Locking (E8-R1)**:
   - FIFO allocation is secured via Database Row-Level Locking (`SELECT ... FOR UPDATE`).
   - Every lock query strictly filters by `tenant_id = :tenant_id` to prevent cross-tenant access.
   - Any cross-tenant access attempt raises `ERR_CROSS_TENANT_VIOLATION` fail-closed.

---

## 2. Data Model: Tenant Credit Pool Hierarchy

```
+-------------------------------------------------------------------------------+
|                      Tenant Commercial Credit Pool (tenant_id)                 |
|  - Sole commercial owner of purchased passes                                  |
|  - Tracks unallocated rollover balance across all operational branches        |
+-------------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------------+
|                    workforce_credit_lots (Prepaid Lots)                       |
|  - lot_id               - tenant_id (Owner)   - branch_id (Target)            |
|  - available_credits    - total_purchased     - status: ACTIVE | DEPLETED     |
+-------------------------------------------------------------------------------+
                                    |
                           [FIFO Allocation via]
                           [SELECT FOR UPDATE  ]
                           [WHERE tenant_id=... ]
                                    v
+-------------------------------------------------------------------------------+
|                workforce_credit_allocations (Active Licenses)                 |
|  - allocation_id        - lot_id              - tenant_id                     |
|  - branch_id            - personnel_id        - expires_at (activated + 30d) |
|  - status: ACTIVE | EXPIRED | TERMINATED                                      |
+-------------------------------------------------------------------------------+
```

---

## 3. Concurrency Protection & Tenant Isolation

In high-concurrency multi-tenant environments, the atomic engine enforces database-level serializability and cross-tenant boundaries:

```sql
-- Step 1: Guard against Cross-Tenant Violations
SELECT tenant_id INTO v_existing_owner
FROM workforce_credit_lots
WHERE branch_id = $branch_id
LIMIT 1;

IF v_existing_owner IS NOT NULL AND v_existing_owner <> $tenant_id THEN
    RAISE EXCEPTION 'ERR_CROSS_TENANT_VIOLATION: Branch belongs to different tenant'
        USING ERRCODE = '28000';
END IF;

-- Step 2: Lock the oldest active lot owned strictly by $tenant_id (FIFO)
SELECT lot_id, available_credits, consumed_credits
FROM workforce_credit_lots
WHERE tenant_id = $tenant_id
  AND branch_id = $branch_id
  AND status = 'ACTIVE'
  AND available_credits > 0
ORDER BY created_at ASC
LIMIT 1
FOR UPDATE;

-- Step 3: Decrement lot under strict tenant scoping
UPDATE workforce_credit_lots
SET available_credits = available_credits - 1,
    consumed_credits = consumed_credits + 1,
    status = CASE WHEN available_credits - 1 = 0 THEN 'DEPLETED' ELSE 'ACTIVE' END,
    updated_at = NOW()
WHERE lot_id = $target_lot_id
  AND tenant_id = $tenant_id;
```

---

## 4. Business Rule Invariants

1. **Commercial Rollover**: Unallocated passes do not expire and rollover across billing cycles under the tenant's commercial balance.
2. **30-Day Expiration Clock**: The 30-day countdown begins **strictly upon personnel assignment**, never at invoice checkout.
3. **No Partial Refunds**: Personnel termination does not yield partial refunds.
4. **Chargeback Handling**: When a payment dispute occurs, unused credits in the lot are frozen without creating negative balances.
