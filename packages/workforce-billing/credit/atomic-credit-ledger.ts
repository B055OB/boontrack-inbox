/**
 * packages/workforce-billing/credit/atomic-credit-ledger.ts
 * Atomic Credit Allocation & FIFO Lot Management Engine
 *
 * Invariants:
 * - 1 Pass = 30 days active access per personnel
 * - Delayed Activation (Prepaid dormant lots)
 * - Strict FIFO Lot Consumption
 * - Row-Level Locking Simulation / Concurrency Guard (No Double Allocation)
 * - Balance >= 0 Hard Constraint (Zero Negative Balance)
 * - Chargeback Freeze on Unused Credits
 * - Early Renewal Preserves & Extends Coverage (+30 days)
 */

import {
  SupportedCurrency,
  CreditLot,
  CreditAllocation,
  CreditLedgerEntry,
  NormalizedPaymentRecord,
} from '../types';

export interface AllocationResult {
  success: boolean;
  allocationId: string;
  lotId: string;
  personnelId: string;
  activatedAt: string;
  expiresAt: string;
  remainingBranchCredits: number;
}

export class AtomicCreditLedger {
  private readonly lots: Map<string, CreditLot> = new Map();
  private readonly allocations: Map<string, CreditAllocation> = new Map();
  private readonly ledger: CreditLedgerEntry[] = [];

  // Branch balances: branchId -> number
  private readonly branchBalances: Map<string, number> = new Map();

  // Active personnel allocations index: branchId:personnelId -> allocationId
  private readonly personnelActiveAllocations: Map<string, string> = new Map();

  // Concurrency Lock: branchId -> Promise queue (simulating Postgres SELECT ... FOR UPDATE)
  private readonly branchLocks: Map<string, Promise<void>> = new Map();

  /**
   * Acquire atomic lock per branch to simulate database row-level locking
   */
  private async acquireBranchLock<T>(branchId: string, operation: () => Promise<T> | T): Promise<T> {
    while (this.branchLocks.has(branchId)) {
      await this.branchLocks.get(branchId);
    }

    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.branchLocks.set(branchId, lockPromise);

    try {
      return await operation();
    } finally {
      this.branchLocks.delete(branchId);
      releaseLock!();
    }
  }

  /**
   * Create a new prepaid credit lot from a settled payment.
   * Passes are dormant (unactivated) until explicitly assigned.
   */
  public async createLotFromPayment(payment: NormalizedPaymentRecord): Promise<CreditLot> {
    return this.acquireBranchLock(payment.branchId, () => {
      const lotId = `LOT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const now = new Date().toISOString();
      const tenantId = payment.tenantId || payment.agencyId;

      const lot: CreditLot = {
        lotId,
        purchaseRef: payment.internalPaymentRef,
        providerTxnId: payment.providerTxnId,
        tenantId,
        branchId: payment.branchId,
        agencyId: payment.agencyId,
        currency: payment.currency,
        totalPurchased: payment.quantity,
        availableCredits: payment.quantity,
        consumedCredits: 0,
        frozenCredits: 0,
        unitPrice: Number((payment.amountNet / payment.quantity).toFixed(2)),
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      };

      this.lots.set(lotId, lot);

      // Increment branch available balance
      const currentBalance = this.branchBalances.get(payment.branchId) || 0;
      const newBalance = currentBalance + payment.quantity;
      this.branchBalances.set(payment.branchId, newBalance);

      // Append-only credit ledger entry
      this.ledger.push({
        id: `cld_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        branchId: payment.branchId,
        lotId,
        currency: payment.currency,
        delta: payment.quantity,
        balanceAfter: newBalance,
        reason: 'PURCHASE',
        referenceId: payment.internalPaymentRef,
        createdAt: now,
      });

      return lot;
    });
  }

  /**
   * Atomic FIFO credit consumption to activate a personnel license.
   * - Enforces tenant isolation (ERR_CROSS_TENANT_VIOLATION if tenant does not match branch)
   * - Enforces available_credits >= 1
   * - Pulls from oldest active lot
   * - Sets 30-day expiration window
   * - Supports early renewal (+30 days to existing expiration)
   */
  public async allocateCredit(params: {
    tenantId?: string;
    branchId: string;
    personnelId: string;
    personnelName: string;
  }): Promise<AllocationResult> {
    return this.acquireBranchLock(params.branchId, () => {
      // Cross-Tenant Guard: verify branch ownership
      if (params.tenantId) {
        const branchLotsAll = Array.from(this.lots.values()).filter((l) => l.branchId === params.branchId);
        const conflictingLot = branchLotsAll.find((l) => l.tenantId !== params.tenantId);
        if (conflictingLot) {
          throw new Error(
            `ERR_CROSS_TENANT_VIOLATION: Branch ${params.branchId} is registered to tenant ${conflictingLot.tenantId}, unauthorized access by ${params.tenantId}`
          );
        }
      }

      const currentBalance = this.branchBalances.get(params.branchId) || 0;

      // Invariant Check 1: Non-negative balance
      if (currentBalance < 1) {
        throw new Error(
          `INSUFFICIENT_CREDITS: Branch ${params.branchId} available balance is ${currentBalance}. Cannot allocate.`
        );
      }

      // Invariant Check 2: Find oldest active lot with available credits (FIFO)
      const branchLots = Array.from(this.lots.values())
        .filter(
          (lot) =>
            lot.branchId === params.branchId &&
            lot.status === 'ACTIVE' &&
            lot.availableCredits > 0 &&
            (params.tenantId ? lot.tenantId === params.tenantId : true)
        )
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      if (branchLots.length === 0) {
        throw new Error(
          `INSUFFICIENT_CREDITS: No active credit lot available for branch ${params.branchId}`
        );
      }

      const oldestLot = branchLots[0];

      // Decrement lot
      oldestLot.availableCredits -= 1;
      oldestLot.consumedCredits += 1;
      if (oldestLot.availableCredits === 0) {
        oldestLot.status = 'DEPLETED';
      }
      oldestLot.updatedAt = new Date().toISOString();

      // Decrement branch balance
      const newBalance = currentBalance - 1;
      this.branchBalances.set(params.branchId, newBalance);

      // Calculate 30-day window
      const now = new Date();
      let activatedAt = now.toISOString();
      let expiresAtDate = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

      // Check if personnel already has an active allocation (Early Renewal / Rollover)
      const activeKey = `${params.branchId}:${params.personnelId}`;
      const existingAllocationId = this.personnelActiveAllocations.get(activeKey);
      if (existingAllocationId) {
        const existingAllocation = this.allocations.get(existingAllocationId);
        if (existingAllocation && existingAllocation.status === 'ACTIVE') {
          const currentExpiry = new Date(existingAllocation.expiresAt);
          if (currentExpiry.getTime() > now.getTime()) {
            // Early renewal: extend +30 days from previous expiration!
            expiresAtDate = new Date(currentExpiry.getTime() + 30 * 24 * 3600 * 1000);
            existingAllocation.status = 'EXPIRED'; // Mark superseded allocation
          }
        }
      }

      const allocationId = `ALC-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const allocation: CreditAllocation = {
        allocationId,
        lotId: oldestLot.lotId,
        tenantId: oldestLot.tenantId,
        branchId: params.branchId,
        personnelId: params.personnelId,
        personnelName: params.personnelName,
        activatedAt,
        expiresAt: expiresAtDate.toISOString(),
        status: 'ACTIVE',
      };

      this.allocations.set(allocationId, allocation);
      this.personnelActiveAllocations.set(activeKey, allocationId);

      // Append-only credit ledger entry
      this.ledger.push({
        id: `cld_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        branchId: params.branchId,
        lotId: oldestLot.lotId,
        currency: oldestLot.currency,
        delta: -1,
        balanceAfter: newBalance,
        reason: 'CONSUMPTION',
        referenceId: params.personnelId,
        createdAt: activatedAt,
      });

      return {
        success: true,
        allocationId,
        lotId: oldestLot.lotId,
        personnelId: params.personnelId,
        activatedAt,
        expiresAt: allocation.expiresAt,
        remainingBranchCredits: newBalance,
      };
    });
  }

  /**
   * Handle Chargeback / Payment Dispute:
   * Freezes unused/available credits from the disputed lot.
   * Decrements branch available balance.
   * Invariant: Balance cannot drop below zero.
   */
  public async handleChargeback(disputedPurchaseRef: string): Promise<{
    frozenCredits: number;
    lotId: string;
    branchId: string;
    newBalance: number;
  }> {
    // Find lot associated with purchase
    const lot = Array.from(this.lots.values()).find((l) => l.purchaseRef === disputedPurchaseRef);
    if (!lot) {
      throw new Error(`LOT_NOT_FOUND_FOR_PURCHASE: ${disputedPurchaseRef}`);
    }

    return this.acquireBranchLock(lot.branchId, () => {
      const frozenCredits = lot.availableCredits;
      lot.frozenCredits += frozenCredits;
      lot.availableCredits = 0;
      lot.status = 'FROZEN';
      lot.updatedAt = new Date().toISOString();

      const currentBalance = this.branchBalances.get(lot.branchId) || 0;
      // Decrement balance but strictly never negative
      const newBalance = Math.max(0, currentBalance - frozenCredits);
      this.branchBalances.set(lot.branchId, newBalance);

      this.ledger.push({
        id: `cld_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        branchId: lot.branchId,
        lotId: lot.lotId,
        currency: lot.currency,
        delta: -frozenCredits,
        balanceAfter: newBalance,
        reason: 'CHARGEBACK_FREEZE',
        referenceId: disputedPurchaseRef,
        createdAt: new Date().toISOString(),
      });

      return {
        frozenCredits,
        lotId: lot.lotId,
        branchId: lot.branchId,
        newBalance,
      };
    });
  }

  public getBranchBalance(branchId: string): number {
    return this.branchBalances.get(branchId) || 0;
  }

  public getLot(lotId: string): CreditLot | undefined {
    return this.lots.get(lotId);
  }

  public getAllLots(): CreditLot[] {
    return Array.from(this.lots.values());
  }

  public getAllocationsForBranch(branchId: string): CreditAllocation[] {
    return Array.from(this.allocations.values()).filter((a) => a.branchId === branchId);
  }

  public getLedgerEntries(): CreditLedgerEntry[] {
    return [...this.ledger];
  }
}

