# RFC-BWM-013: Settlement Reconciliation & Audit Traceability Interface

- **Status**: APPROVED
- **Author**: BWM Architecture Working Group
- **Reviewers**: CTO, Head of Financial Systems
- **Target Schema / Workspace**: Isolated Workforce Billing (`packages/workforce-billing/`)
- **Blast Radius**: ISOLATED (Zero touch to core BoonTrack modules)

---

## 1. Executive Summary

Enterprise BUJP partners and auditors require end-to-end financial traceability for every BWM Credit Pass deployed across field operations.
RFC-BWM-013 formalizes the unified **Settlement Reconciliation Interface**, establishing an unbroken, bi-directional verification chain linking:
$$\text{Provider Txn} \longleftrightarrow \text{Internal Payment} \longleftrightarrow \text{Financial Ledger} \longleftrightarrow \text{Tax Sub-Ledger} \longleftrightarrow \text{Credit Allocation} \longleftrightarrow \text{Settlement Remittance}$$

---

## 2. Reconciliation Traceability Graph

```
[Provider Gateway Txn]  (e.g., Xendit invoice_id: inv_12345 / Dodo txn_abcde)
         |
         v
[Internal Payment Record]  (payment_reference: PAY-202611-0001, status: SETTLED)
         |
         +---------------------------------------+
         |                                       |
         v                                       v
[Financial Ledger Entry]                [Tax Sub-Ledger Entry]
- Debit: 1010-IDR (Gross: Rp 832.500)   - Tax Code: PPN-11%
- Credit: 4010-IDR (Net: Rp 750.000)    - Tax Amount: Rp 82.500
- Credit: 2020-IDR (Tax: Rp 82.500)     - Faktur Ref: FP-202611-0099
         |                                       |
         +-------------------+-------------------+
                             |
                             v
                  [Credit Lot Created]
                  - lot_id: LOT-202611-001
                  - quantity: 25 Passes
                  - available: 25 Passes
                             |
                             v
                  [Credit Allocations] (FIFO)
                  - ALC-01 -> Cindy Aurini (30 days)
                  - ALC-02 -> Bambang Prakoso (30 days)
                  - ...
                             |
                             v
                  [Bank Settlement Remittance]
                  - Disbursement ID: DISB-BCA-98765
                  - Settled Net Cash in Bank: Rp 815.850 (Gross - Gateway MDR)
```

---

## 3. Interface Definition (`ReconciliationEngine`)

```typescript
export interface ReconciliationQuery {
  startDate?: string;
  endDate?: string;
  branchId?: string;
  currency?: SupportedCurrency;
  status?: ReconciliationStatus;
}

export interface DiscrepancyReport {
  hasDiscrepancies: boolean;
  unreconciledCount: number;
  totalVarianceAmount: number;
  discrepancies: Array<{
    internalPaymentRef: string;
    providerTxnId?: string;
    reason: 'MISSING_PROVIDER_TXN' | 'AMOUNT_MISMATCH' | 'TAX_VARIANCE' | 'ORPHAN_ALLOCATION' | 'UNSETTLED_FUNDS';
    expectedAmount: number;
    actualAmount: number;
    currency: SupportedCurrency;
  }>;
}

export interface ReconciliationEngine {
  reconcilePayment(paymentRef: string): Promise<ReconciliationTrace>;
  generateSettlementReport(query: ReconciliationQuery): Promise<SettlementReport>;
  auditDiscrepancies(query: ReconciliationQuery): Promise<DiscrepancyReport>;
  resolveDiscrepancy(discrepancyId: string, resolutionAction: ResolutionAction): Promise<ResolutionResult>;
}
```

---

## 4. Audit Trail & Immutability

1. **State Machine Logging**:
   Every state change (`INITIATED` $\to$ `CONFIRMED` $\to$ `ENTITLED` $\to$ `FROZEN`) creates an append-only row in `billing_audit_log` with:
   - `entity_type`: `'PAYMENT' | 'LOT' | 'ALLOCATION' | 'LEDGER'`
   - `entity_id`: UUID
   - `previous_state`: string
   - `new_state`: string
   - `actor`: string (`'SYSTEM_WEBHOOK'`, `'ADMIN'`, `'SETTLEMENT_CRON'`)
   - `metadata`: JSON payload of contextual headers and cryptographic proofs
2. **Discrepancy Resolution Protocol**:
   - Automated nightly cron reconciles provider payout disbursements against internal ledger totals.
   - Variances $> 0$ trigger immediate freeze on auto-renewals for disputed accounts until reviewed.
