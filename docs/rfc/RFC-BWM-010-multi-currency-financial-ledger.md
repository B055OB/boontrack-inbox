# RFC-BWM-010: Multi-Currency Financial Ledger & Tax Segregation

- **Status**: APPROVED
- **Author**: BWM Architecture Working Group
- **Reviewers**: CTO, Head of Financial Systems
- **Target Schema / Workspace**: Isolated Workforce Billing (`packages/workforce-billing/`)
- **Blast Radius**: ISOLATED (Zero touch to core BoonTrack modules)

---

## 1. Executive Summary

BWM multi-tenant operations span multiple sovereign tax and currency domains. Under GAAP/IFRS principles and the CTO Financial Integrity Mandate:
1. **Zero Cross-Currency Pooling**: `IDR`, `USD`, and `MYR` transactions are stored in strictly isolated ledger partitions. Cross-currency netting, offsetting, or mixed balance summation is prohibited at the database and application levels.
2. **Tri-Partite Ledger Architecture**:
   - **Financial Ledger**: Double-entry ledger recording gross payments, processing fees, and net receivables.
   - **Tax Sub-Ledger**: Dedicated ledger for PPN (Indonesia 11%), SST (Malaysia 8%), and withholding taxes, completely segregated from operational revenue.
   - **Entitlement Ledger**: Quantitative inventory tracking BWM Credit Passes (units/passes) independent of nominal fiat values.

---

## 2. Multi-Currency Data Model & Partitioning

```
+-----------------------------------------------------------------------------------+
|                            MULTI-CURRENCY LEDGER ENGINE                           |
+-----------------------------------------------------------------------------------+
       |                                |                                |
       v                                v                                v
+------------------+           +------------------+           +---------------------+
|   IDR Partition  |           |   USD Partition  |           |    MYR Partition    |
| (Bank Mandiri /  |           |  (Stripe / Dodo  |           |    (Dodo / FPX      |
|  Xendit Escrow)  |           |   Settlement)    |           |    Settlement)      |
+------------------+           +------------------+           +---------------------+
  - Cash / Gateway               - Cash / Gateway               - Cash / Gateway
  - Operational Rev              - Operational Rev              - Operational Rev
  - Tax (PPN 11%)                - Tax (VAT 0% / B2B)           - Tax (SST 8%)
```

### 2.1 Double-Entry Account Chart

| Account Code | Account Name | Type | Currency | Description |
|---|---|---|---|---|
| `1010-IDR` | Gateway Clearing (Xendit) | Asset | IDR | Gross funds held by provider pending settlement |
| `1010-USD` | Gateway Clearing (Dodo USD) | Asset | USD | Gross USD receivables pending remittance |
| `1010-MYR` | Gateway Clearing (Dodo MYR) | Asset | MYR | Gross MYR receivables pending remittance |
| `4010-IDR` | BWM License Operating Revenue | Revenue | IDR | Base subscription revenue (Rp 30.000 / pass) |
| `4010-USD` | BWM License Operating Revenue | Revenue | USD | Base subscription revenue ($2.00 / pass) |
| `4010-MYR` | BWM License Operating Revenue | Revenue | MYR | Base subscription revenue (RM 9.00 / pass) |
| `2020-IDR` | PPN Tax Payable (11%) | Liability | IDR | Indonesian VAT collected from customer |
| `2020-MYR` | SST Tax Payable (8%) | Liability | MYR | Malaysian Sales & Service Tax collected |
| `5010-IDR` | Provider Processing Fee Expense | Expense | IDR | Merchant discount rate (MDR) / gateway fees |

---

## 3. Tax Sub-Ledger Segregation

Operational revenue must never be commingled with tax collected on behalf of sovereign tax authorities:
1. When a transaction of **25 Passes** is settled in IDR:
   - Base Price: `25 * Rp 30.000 = Rp 750.000`
   - PPN (11%): `Rp 750.000 * 0.11 = Rp 82.500`
   - Total Charged: `Rp 832.500`
2. **Journal Booking**:
   - `DEBIT  1010-IDR (Gateway Clearing)`: `Rp 832.500`
   - `CREDIT 4010-IDR (Operating Revenue)`: `Rp 750.000`
   - `CREDIT 2020-IDR (PPN Tax Payable)`: `Rp 82.500`
3. The Tax Sub-Ledger maintains immutable references to tax invoices (`faktur_pajak_ref`), tax period, and country code (`ID`, `MY`, `US`).

---

## 4. Invariant Rules

1. **Balance Check**:
   $$\sum \text{Debits}_{\text{partition}} - \sum \text{Credits}_{\text{partition}} = 0$$
   Each posting must balance strictly within its own currency code.
2. **Zero Auto-Conversion**:
   No automatic FX conversion in ledger entries. Conversion between ledgers requires an explicit Treasury FX Remittance transaction with audited exchange rate metadata.
3. **Immutability**:
   All ledger tables are append-only. No `UPDATE` or `DELETE` operations are permitted on posted ledger records. Corrections must be booked as reverse journal adjustments.

