/**
 * lib/workforce/credit-pool-service.ts
 * BWM Post-E4 & Gate E5 — Workforce Credit Pool & Atomic Ledger Engine (Hardened)
 *
 * Ratified CTO & Founder Invariants:
 * 1. packages/attendance/ is decoupled (zero coupling to billing/credits).
 * 2. 1 Credit = 1 Personnel License (30-day rolling window from activation).
 * 3. Minimum deposit: 5 credits (Rp 150.000 + PPN 11%).
 * 4. Dormant credits have NO 30-day expiration (remain AVAILABLE indefinitely).
 * 5. Edge-Cases:
 *    - Personnel exit before 30 days: credit non-refundable, license non-transferable.
 *    - Expired personnel: requires 1 new credit from pool to reactivate.
 *    - Chargeback: dormant credits FROZEN, zero silent debt / zero negative balance.
 *    - Concurrency: atomic branch mutex, exactly 1 activation succeeds if pool = 1.
 *    - Early renewal: consumes 1 credit, extends +30 days from previous expiration.
 *
 * =========================================================================================
 * ARCHITECTURAL SPECIFICATION: MULTI-INSTANCE PRODUCTION MITIGATION (POSTGRESQL / SUPABASE)
 * =========================================================================================
 * In-Memory Mutex Limitation:
 * The `withBranchLock` mutex implemented in this class provides strictly local serialized execution
 * per branch within a single Node.js runtime process (isolated test suites and single-instance server).
 *
 * Multi-Instance Distributed Mitigation (Production Supabase Migration Plan):
 * In a multi-tenant, multi-instance environment (e.g. Vercel Serverless / multi-container Kubernetes),
 * concurrent requests may hit separate runtime instances. To maintain zero-double-spend and zero-leakage
 * guarantees, the production persistence adapter MUST enforce atomicity at the PostgreSQL engine level:
 *
 * 1. Pattern A: Conditional Atomic CAS Update (Recommended for High Throughput):
 *    ```sql
 *    UPDATE branch_credit_pools
 *    SET available_credits = available_credits - 1,
 *        active_seats = active_seats + 1,
 *        updated_at = NOW()
 *    WHERE branch_id = $1 AND available_credits > 0
 *    RETURNING id, available_credits;
 *    ```
 *    If 0 rows are updated, the transaction fails-closed immediately with INSUFFICIENT_CREDITS.
 *
 * 2. Pattern B: Row-Level Locking via SELECT ... FOR UPDATE (For Complex Ledger Invariants):
 *    ```sql
 *    BEGIN;
 *    SELECT id, available_credits
 *    FROM branch_credit_pools
 *    WHERE branch_id = $1
 *    FOR UPDATE;
 *
 *    -- Check available_credits >= 1; if not, ROLLBACK and raise INSUFFICIENT_CREDITS
 *    -- Mark single credit row as CONSUMED:
 *    UPDATE seat_credit_ledger
 *    SET status = 'CONSUMED',
 *        consumed_by_personnel_id = $2,
 *        consumed_at = NOW()
 *    WHERE id = (
 *      SELECT id FROM seat_credit_ledger
 *      WHERE branch_id = $1 AND status = 'AVAILABLE'
 *      ORDER BY created_at ASC
 *      LIMIT 1
 *      FOR UPDATE SKIP LOCKED
 *    );
 *    COMMIT;
 *    ```
 *
 * 3. Payment Reference & Idempotency Constraints:
 *    ```sql
 *    CREATE UNIQUE INDEX uq_seat_credit_payment_ref_idx
 *    ON seat_credit_ledger (payment_reference, credit_id);
 *    ```
 * =========================================================================================
 */

import {
  BWM_PRICING,
  CreditStatus,
  BranchSeatState,
  SeatCreditLedgerEntry,
  PersonnelSeatLicense,
  CreditPurchaseTransaction,
  createCreditDepositQuote,
} from './billing-contract';

export class CreditPoolService {
  private purchaseTransactions: Map<string, CreditPurchaseTransaction> = new Map();
  private ledgerEntries: Map<string, SeatCreditLedgerEntry> = new Map();
  private licenses: Map<string, PersonnelSeatLicense> = new Map();
  private processedIdempotencyKeys: Set<string> = new Set();
  private processedPaymentReferences: Set<string> = new Set();
  private processedChargebacks: Set<string> = new Set();
  private branchLocks: Map<string, Promise<void>> = new Map();

  /**
   * Atomic serialized execution queue per branch to prevent race conditions during concurrent activations.
   * Note: Local runtime mutex. In production, row-level locking via SELECT ... FOR UPDATE is applied.
   */
  private async withBranchLock<T>(branchId: string, action: () => Promise<T> | T): Promise<T> {
    const prevLock = this.branchLocks.get(branchId) || Promise.resolve();
    let resolveLock!: () => void;
    const currentLock = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.branchLocks.set(branchId, prevLock.then(() => currentLock));

    try {
      await prevLock;
      return await action();
    } finally {
      resolveLock();
      if (this.branchLocks.get(branchId) === currentLock) {
        this.branchLocks.delete(branchId);
      }
    }
  }

  /**
   * Deposits seat credits into a branch's credit pool.
   * Invariant: Minimum deposit is 5 credits.
   * Dormant credits remain AVAILABLE indefinitely without 30-day expiry.
   *
   * Idempotency Enforcement:
   * Strictly binds paymentReference (e.g. gateway payment id / bank ref) to parent
   * credit_purchase_transactions entity as authoritative source of truth.
   */
  public depositCredits(params: {
    branchId: string;
    agencyId?: string;
    quantity: number;
    purchaseReference: string;
    paymentReference: string;
    purchaseId?: string;
    idempotencyKey?: string;
  }): SeatCreditLedgerEntry[] {
    const { branchId, agencyId, quantity, purchaseReference, paymentReference, purchaseId, idempotencyKey } = params;

    // 1. Minimum deposit enforcement
    if (quantity < BWM_PRICING.MINIMUM_CREDIT_DEPOSIT_QUANTITY) {
      throw new Error(
        `MINIMUM_DEPOSIT_NOT_MET: Minimum pembelian deposit adalah ${BWM_PRICING.MINIMUM_CREDIT_DEPOSIT_QUANTITY} kredit (diajukan: ${quantity}).`
      );
    }

    // 2. Authoritative Payment Reference Idempotency Guard (Banking / Gateway SSOT)
    if (paymentReference && this.processedPaymentReferences.has(paymentReference)) {
      return Array.from(this.ledgerEntries.values()).filter(
        (e) => e.branch_id === branchId && e.payment_reference === paymentReference
      );
    }

    // 3. Client Idempotency Key Guard
    if (idempotencyKey && this.processedIdempotencyKeys.has(idempotencyKey)) {
      return Array.from(this.ledgerEntries.values()).filter(
        (e) => e.branch_id === branchId && e.idempotency_key === idempotencyKey
      );
    }

    const timestamp = new Date().toISOString();
    const effectivePurchaseId = purchaseId || `purch_${branchId}_${Date.now()}`;
    const effectiveAgencyId = agencyId || 'agency_default';

    // 4. Record Parent Purchase Transaction Snapshot
    const unitPrice = BWM_PRICING.MONTHLY_PERSONNEL_SEAT_IDR;
    const subtotal = quantity * unitPrice;
    const tax = Math.round(subtotal * BWM_PRICING.PPN_RATE);
    const total = subtotal + tax;

    const purchaseTx: CreditPurchaseTransaction = {
      purchase_id: effectivePurchaseId,
      branch_id: branchId,
      agency_id: effectiveAgencyId,
      payment_reference: paymentReference,
      purchase_reference: purchaseReference,
      quantity,
      unit_price_idr: unitPrice,
      subtotal_idr: subtotal,
      tax_idr: tax,
      total_idr: total,
      status: 'SETTLED',
      created_at: timestamp,
    };
    this.purchaseTransactions.set(effectivePurchaseId, purchaseTx);

    // 5. Emit unit credit ledger entries
    const createdEntries: SeatCreditLedgerEntry[] = [];
    for (let i = 0; i < quantity; i++) {
      const creditId = `cred_${branchId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${i + 1}`;
      const entry: SeatCreditLedgerEntry = {
        credit_id: creditId,
        purchase_id: effectivePurchaseId,
        branch_id: branchId,
        agency_id: effectiveAgencyId,
        purchase_reference: purchaseReference,
        payment_reference: paymentReference,
        status: 'AVAILABLE',
        created_at: timestamp,
        idempotency_key: idempotencyKey,
      };

      this.ledgerEntries.set(creditId, entry);
      createdEntries.push(entry);
    }

    if (paymentReference) {
      this.processedPaymentReferences.add(paymentReference);
    }
    if (idempotencyKey) {
      this.processedIdempotencyKeys.add(idempotencyKey);
    }

    return createdEntries;
  }

  /**
   * Returns current branch seat capacity and available credits in pool.
   */
  public getBranchSeatState(branchId: string, referenceTimeUtc?: string): BranchSeatState {
    this.reconcileExpiredLicenses(referenceTimeUtc);

    let availableCredits = 0;
    for (const entry of this.ledgerEntries.values()) {
      if (entry.branch_id === branchId && entry.status === 'AVAILABLE') {
        availableCredits++;
      }
    }

    let activeSeats = 0;
    for (const lic of this.licenses.values()) {
      if (lic.branchId === branchId && lic.status === 'ACTIVE') {
        activeSeats++;
      }
    }

    return {
      active_seats: activeSeats,
      available_credits: availableCredits,
    };
  }

  /**
   * Activates a personnel seat by atomically consuming 1 credit from branch pool.
   * 7-Step Atomic Execution with Timeout Retry Guard:
   * (1) Lock branch pool
   * (2) Select 1 AVAILABLE credit (SKIP LOCKED equivalent)
   * (3) Validate tenant/branch
   * (4) Create 30-day rolling license
   * (5) Transition credit to CONSUMED
   * (6) Decrement available credits & increment active seats
   * (7) Return snapshot
   */
  public async activatePersonnelSeat(params: {
    branchId: string;
    personnelId: string;
    agencyId?: string;
    referenceTimeUtc?: string;
    idempotencyKey?: string;
    simulateFailureStep?: number; // For atomic failure / rollback testing
  }): Promise<{ license: PersonnelSeatLicense; consumedCredit: SeatCreditLedgerEntry }> {
    const { branchId, personnelId, agencyId, idempotencyKey, simulateFailureStep } = params;

    return this.withBranchLock(branchId, async () => {
      this.reconcileExpiredLicenses(params.referenceTimeUtc);

      // STEP 1: Idempotency check
      if (idempotencyKey && this.processedIdempotencyKeys.has(idempotencyKey)) {
        const existingLic = this.licenses.get(personnelId);
        const existingCred = Array.from(this.ledgerEntries.values()).find(
          (c) => c.idempotency_key === idempotencyKey
        );
        if (existingLic && existingCred) {
          return { license: existingLic, consumedCredit: existingCred };
        }
      }

      // STEP 2: Active license check (anti-double activation)
      const currentLic = this.licenses.get(personnelId);
      if (currentLic && currentLic.status === 'ACTIVE') {
        throw new Error(
          `PERSONNEL_ALREADY_ACTIVE: Personnel '${personnelId}' already has an active license until ${currentLic.expiresAt}. Gunakan early renewal untuk perpanjangan.`
        );
      }

      // STEP 3: Find 1 AVAILABLE credit in pool
      const availableCredit = Array.from(this.ledgerEntries.values()).find(
        (c) => c.branch_id === branchId && c.status === 'AVAILABLE'
      );

      if (!availableCredit) {
        throw new Error(
          `INSUFFICIENT_CREDITS: Branch '${branchId}' has 0 available credits in credit pool. Sisa kredit tidak mencukupi untuk aktivasi.`
        );
      }

      // STEP 4: Tenant boundary validation (if agencyId supplied)
      if (agencyId && availableCredit.agency_id && availableCredit.agency_id !== agencyId) {
        throw new Error(
          `TENANT_ISOLATION_BREACH: Caller agency '${agencyId}' does not match credit agency '${availableCredit.agency_id}'`
        );
      }

      // Simulation point: Test rollback if failure occurs at mid-transaction
      if (simulateFailureStep === 5) {
        throw new Error('SIMULATED_TRANSACTION_FAILURE_AT_STEP_5');
      }

      // STEP 5: Consume credit row atomically (Immutable transition)
      const nowIso = params.referenceTimeUtc || new Date().toISOString();
      const nowMs = new Date(nowIso).getTime();
      const expiresAtMs = nowMs + BWM_PRICING.BILLING_CYCLE_DAYS * 24 * 60 * 60 * 1000;
      const expiresAtIso = new Date(expiresAtMs).toISOString();

      availableCredit.status = 'CONSUMED';
      availableCredit.consumed_by_personnel_id = personnelId;
      availableCredit.consumed_at = nowIso;
      if (idempotencyKey) {
        availableCredit.idempotency_key = idempotencyKey;
      }

      // STEP 6: Issue personnel license (30 days rolling)
      const licenseId = `lic_${branchId}_${personnelId}_${Date.now()}`;
      const newLicense: PersonnelSeatLicense = {
        licenseId,
        personnelId,
        branchId,
        creditId: availableCredit.credit_id,
        activatedAt: nowIso,
        expiresAt: expiresAtIso,
        status: 'ACTIVE',
      };

      this.licenses.set(personnelId, newLicense);

      if (idempotencyKey) {
        this.processedIdempotencyKeys.add(idempotencyKey);
      }

      // STEP 7: Return final snapshot
      return {
        license: newLicense,
        consumedCredit: { ...availableCredit },
      };
    });
  }

  /**
   * Early renewal for active personnel.
   * Invariant: Consumes 1 credit, extends expiration +30 days from previous expiration (zero lost days).
   */
  public async earlyRenewPersonnelSeat(params: {
    branchId: string;
    personnelId: string;
    referenceTimeUtc?: string;
  }): Promise<{ license: PersonnelSeatLicense; consumedCredit: SeatCreditLedgerEntry }> {
    const { branchId, personnelId } = params;

    return this.withBranchLock(branchId, async () => {
      this.reconcileExpiredLicenses(params.referenceTimeUtc);

      // 1. Check existing active license
      const existingLicense = this.licenses.get(personnelId);
      if (!existingLicense || existingLicense.status !== 'ACTIVE') {
        throw new Error(
          `NO_ACTIVE_LICENSE: Personnel '${personnelId}' does not have an active license to renew. Gunakan aktivasi standar.`
        );
      }

      // 2. Find 1 AVAILABLE credit in pool
      const availableCredit = Array.from(this.ledgerEntries.values()).find(
        (c) => c.branch_id === branchId && c.status === 'AVAILABLE'
      );

      if (!availableCredit) {
        throw new Error(
          `INSUFFICIENT_CREDITS: Branch '${branchId}' has 0 available credits for early renewal.`
        );
      }

      // 3. Consume credit
      const nowIso = params.referenceTimeUtc || new Date().toISOString();
      availableCredit.status = 'CONSUMED';
      availableCredit.consumed_by_personnel_id = personnelId;
      availableCredit.consumed_at = nowIso;

      // 4. Extend expiration by +30 days from PREVIOUS expiresAt
      const prevExpiresAtMs = new Date(existingLicense.expiresAt).getTime();
      const newExpiresAtMs = prevExpiresAtMs + BWM_PRICING.BILLING_CYCLE_DAYS * 24 * 60 * 60 * 1000;
      existingLicense.expiresAt = new Date(newExpiresAtMs).toISOString();
      existingLicense.earlyRenewedAt = nowIso;

      return {
        license: { ...existingLicense },
        consumedCredit: { ...availableCredit },
      };
    });
  }

  /**
   * Terminates a personnel seat before 30-day expiry.
   * Invariant: Credit is strictly NON-REFUNDABLE and license is NON-TRANSFERABLE.
   * Sisa hari hangus, kredit tidak kembali ke pool.
   */
  public terminatePersonnelSeat(params: {
    branchId: string;
    personnelId: string;
    reason?: string;
  }): { success: boolean; license: PersonnelSeatLicense } {
    const { personnelId } = params;
    const license = this.licenses.get(personnelId);

    if (!license || license.status !== 'ACTIVE') {
      throw new Error(`LICENSE_NOT_ACTIVE: Personnel '${personnelId}' tidak memiliki lisensi aktif untuk diterminasi.`);
    }

    // Invariant: Mark license TERMINATED. Do NOT revert credit back to AVAILABLE.
    license.status = 'TERMINATED';

    return {
      success: true,
      license: { ...license },
    };
  }

  /**
   * Processes a payment chargeback/dispute.
   * Invariants:
   * - Dormant (AVAILABLE) credits from that paymentReference/purchaseReference are FROZEN.
   * - Marks parent purchase transaction as DISPUTED.
   * - Already CONSUMED credits are NOT penalized with negative balance (tidak ada piutang diam-diam).
   * - Idempotent across repeated webhooks/calls with the same paymentReference or chargebackReference.
   */
  public processChargeback(params: {
    purchaseReference?: string;
    paymentReference?: string;
    chargebackReference?: string;
    reason?: string;
  }): { frozenCount: number; affectedCredits: SeatCreditLedgerEntry[]; alreadyProcessed?: boolean } {
    const { purchaseReference, paymentReference, chargebackReference, reason } = params;
    const cbKey = chargebackReference || paymentReference || purchaseReference || '';

    // Idempotency guard for replay webhooks
    if (cbKey && this.processedChargebacks.has(cbKey)) {
      const alreadyFrozen = Array.from(this.ledgerEntries.values()).filter((c) => {
        if (paymentReference && c.payment_reference === paymentReference) return c.status === 'FROZEN';
        if (purchaseReference && c.purchase_reference === purchaseReference) return c.status === 'FROZEN';
        return false;
      });
      return {
        frozenCount: alreadyFrozen.length,
        affectedCredits: alreadyFrozen,
        alreadyProcessed: true,
      };
    }

    // Mark parent purchase transaction as DISPUTED
    for (const tx of this.purchaseTransactions.values()) {
      if (
        (paymentReference && tx.payment_reference === paymentReference) ||
        (purchaseReference && tx.purchase_reference === purchaseReference)
      ) {
        tx.status = 'DISPUTED';
      }
    }

    const affectedCredits: SeatCreditLedgerEntry[] = [];

    for (const credit of this.ledgerEntries.values()) {
      const matchPayment = paymentReference && credit.payment_reference === paymentReference;
      const matchPurchase = purchaseReference && credit.purchase_reference === purchaseReference;

      if (matchPayment || matchPurchase) {
        // Only freeze dormant AVAILABLE credits
        if (credit.status === 'AVAILABLE') {
          credit.status = 'FROZEN';
          credit.audit_reason = reason || 'Payment chargeback dispute';
          affectedCredits.push({ ...credit });
        }
      }
    }

    if (cbKey) {
      this.processedChargebacks.add(cbKey);
    }

    return {
      frozenCount: affectedCredits.length,
      affectedCredits,
      alreadyProcessed: false,
    };
  }

  /**
   * Attempts a direct manual update or delete on a ledger entry.
   * Invariant: Fails closed to simulate the database immutability trigger!
   */
  public mutateLedgerEntryDirectly(
    creditId: string,
    operation: 'UPDATE' | 'DELETE',
    newStatus?: CreditStatus
  ): void {
    const entry = this.ledgerEntries.get(creditId);
    if (!entry) {
      throw new Error(`ENTRY_NOT_FOUND: Credit row '${creditId}' does not exist.`);
    }

    if (operation === 'DELETE') {
      throw new Error(
        'LEDGER_IMMUTABILITY_VIOLATION: DELETE on seat_credit_ledger is strictly prohibited. Ledger rows are append-only.'
      );
    }

    if (operation === 'UPDATE') {
      if (entry.status !== 'AVAILABLE') {
        throw new Error(
          `LEDGER_IMMUTABILITY_VIOLATION: Credit row ${creditId} with status ${entry.status} is finalized and cannot be modified directly.`
        );
      }
      if (newStatus && !['CONSUMED', 'FROZEN', 'REVERSED'].includes(newStatus)) {
        throw new Error(`LEDGER_IMMUTABILITY_VIOLATION: Invalid target status '${newStatus}' for credit transition.`);
      }
      entry.status = newStatus || entry.status;
    }
  }

  /**
   * Evaluates all licenses and marks any expired ones past 30 days as EXPIRED.
   */
  public reconcileExpiredLicenses(referenceTimeUtc?: string): number {
    const nowMs = new Date(referenceTimeUtc || new Date().toISOString()).getTime();
    let expiredCount = 0;

    for (const license of this.licenses.values()) {
      if (license.status === 'ACTIVE') {
        const expiresAtMs = new Date(license.expiresAt).getTime();
        if (nowMs > expiresAtMs) {
          license.status = 'EXPIRED';
          expiredCount++;
        }
      }
    }

    return expiredCount;
  }

  /**
   * Returns all parent purchase transactions.
   */
  public getPurchaseTransactions(branchId?: string): CreditPurchaseTransaction[] {
    const all = Array.from(this.purchaseTransactions.values());
    if (branchId) {
      return all.filter((t) => t.branch_id === branchId);
    }
    return all;
  }

  /**
   * Returns single purchase transaction by payment reference.
   */
  public getPurchaseTransactionByPaymentRef(paymentReference: string): CreditPurchaseTransaction | undefined {
    return Array.from(this.purchaseTransactions.values()).find((t) => t.payment_reference === paymentReference);
  }

  /**
   * Returns all ledger entries for audit.
   */
  public getLedgerEntries(branchId?: string): SeatCreditLedgerEntry[] {
    const all = Array.from(this.ledgerEntries.values());
    if (branchId) {
      return all.filter((e) => e.branch_id === branchId);
    }
    return all;
  }

  /**
   * Returns license for a personnel.
   */
  public getPersonnelLicense(personnelId: string): PersonnelSeatLicense | undefined {
    return this.licenses.get(personnelId);
  }

  /**
   * Resets in-memory state (useful for test isolation).
   */
  public resetState(): void {
    this.purchaseTransactions.clear();
    this.ledgerEntries.clear();
    this.licenses.clear();
    this.processedIdempotencyKeys.clear();
    this.processedPaymentReferences.clear();
    this.processedChargebacks.clear();
    this.branchLocks.clear();
  }
}

// Global singleton instance for adapter usage
export const defaultCreditPoolService = new CreditPoolService();
