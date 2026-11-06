/**
 * packages/workforce-billing/ledger/tenant-pass-ledger.ts
 * BWM Tenant Pass Ledger & FIFO Atomic Allocation Engine
 *
 * Requirements (CTO RFC-018 Addendum & Financial Accuracy Order):
 * 1. Constraint CHECK (balance >= 0) — anti-negative balance enforcement.
 * 2. Enforce idempotency key uniqueness for every mutation event.
 * 3. FIFO Pass Allocation from oldest batch first.
 * 4. Transactional Rollback: failure mid-operation cleanly aborts and restores pre-state.
 * 5. Webhook Replay 10x: identical payment webhook repeated 10x mutates ledger exactly ONCE.
 * 6. Concurrent Renewal: worker concurrency safety with zero race conditions or double deductions.
 */

export interface TenantPassBatch {
  batchId: string;
  tenantId: string;
  agencyId: string;
  totalPasses: number;
  availablePasses: number;
  consumedPasses: number;
  unitPriceCents: number;
  createdAt: string;
  status: 'ACTIVE' | 'DEPLETED';
}

export interface TenantPassLedgerEntry {
  entryId: string;
  tenantId: string;
  batchId: string;
  deltaPasses: number;
  balanceAfter: number;
  reason: 'PURCHASE' | 'ALLOCATION' | 'REVERSAL' | 'RENEWAL';
  idempotencyKey: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface PersonnelPassAllocation {
  allocationId: string;
  tenantId: string;
  batchId: string;
  personnelId: string;
  personnelName: string;
  allocatedAt: string;
  expiresAt: string;
}

export interface WebhookProcessingResult {
  accepted: boolean;
  isDuplicate: boolean;
  replayCount: number;
  tenantId: string;
  balance: number;
  batchId?: string;
  message: string;
}

export class TenantPassLedger {
  private readonly batches: Map<string, TenantPassBatch> = new Map();
  private readonly ledger: TenantPassLedgerEntry[] = [];
  private readonly tenantBalances: Map<string, number> = new Map();
  private readonly processedIdempotencyKeys: Map<string, { entryId: string; replayCount: number }> = new Map();
  private readonly processedEventIds: Map<string, { entryId: string; replayCount: number }> = new Map();
  private readonly allocations: Map<string, PersonnelPassAllocation> = new Map();

  // Async Mutex per tenant to guarantee serializable concurrency
  private readonly tenantLocks: Map<string, Promise<void>> = new Map();

  /**
   * Acquire atomic lock per tenant to serialize concurrent operations
   */
  private async acquireTenantLock<T>(tenantId: string, operation: () => Promise<T> | T): Promise<T> {
    while (this.tenantLocks.has(tenantId)) {
      await this.tenantLocks.get(tenantId);
    }

    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.tenantLocks.set(tenantId, lockPromise);

    try {
      return await operation();
    } finally {
      this.tenantLocks.delete(tenantId);
      releaseLock!();
    }
  }

  /**
   * Get current balance for a tenant (Strict >= 0)
   */
  public getBalance(tenantId: string): number {
    return this.tenantBalances.get(tenantId) || 0;
  }

  /**
   * Get all ledger entries for a tenant
   */
  public getLedgerEntries(tenantId: string): TenantPassLedgerEntry[] {
    return this.ledger.filter((entry) => entry.tenantId === tenantId);
  }

  /**
   * Get active batches for a tenant
   */
  public getBatches(tenantId: string): TenantPassBatch[] {
    return Array.from(this.batches.values()).filter((batch) => batch.tenantId === tenantId);
  }

  /**
   * Get active allocations for a tenant
   */
  public getAllocations(tenantId: string): PersonnelPassAllocation[] {
    return Array.from(this.allocations.values()).filter((alloc) => alloc.tenantId === tenantId);
  }

  /**
   * Processes an incoming payment webhook with strict 10x replay idempotency.
   */
  public async processPaymentWebhook(params: {
    eventId: string;
    idempotencyKey: string;
    tenantId: string;
    agencyId?: string;
    passes: number;
    unitPriceCents?: number;
    metadata?: Record<string, any>;
  }): Promise<WebhookProcessingResult> {
    const { eventId, idempotencyKey, tenantId, passes, agencyId = 'agency_apex_01', unitPriceCents = 450 } = params;

    return this.acquireTenantLock(tenantId, () => {
      // 1. Idempotency Check by key
      if (this.processedIdempotencyKeys.has(idempotencyKey)) {
        const record = this.processedIdempotencyKeys.get(idempotencyKey)!;
        record.replayCount += 1;
        return {
          accepted: true,
          isDuplicate: true,
          replayCount: record.replayCount,
          tenantId,
          balance: this.getBalance(tenantId),
          message: 'IDEMPOTENT_REPLAY_DETECTED_ZERO_MUTATION',
        };
      }

      // 2. Idempotency Check by provider eventId
      if (this.processedEventIds.has(eventId)) {
        const record = this.processedEventIds.get(eventId)!;
        record.replayCount += 1;
        return {
          accepted: true,
          isDuplicate: true,
          replayCount: record.replayCount,
          tenantId,
          balance: this.getBalance(tenantId),
          message: 'EVENT_ID_DUPLICATE_DETECTED_ZERO_MUTATION',
        };
      }

      if (passes <= 0) {
        throw new Error(`INVALID_PASS_QUANTITY: Passes must be positive, got ${passes}`);
      }

      // 3. Create Pass Batch
      const batchId = `BATCH-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const now = new Date().toISOString();

      const batch: TenantPassBatch = {
        batchId,
        tenantId,
        agencyId,
        totalPasses: passes,
        availablePasses: passes,
        consumedPasses: 0,
        unitPriceCents,
        createdAt: now,
        status: 'ACTIVE',
      };

      this.batches.set(batchId, batch);

      // 4. Mutate Balance with Non-Negative Constraint Check
      const currentBalance = this.getBalance(tenantId);
      const newBalance = currentBalance + passes;
      if (newBalance < 0) {
        throw new Error(`NEGATIVE_BALANCE_VIOLATION: Resulting balance ${newBalance} < 0`);
      }
      this.tenantBalances.set(tenantId, newBalance);

      // 5. Append Ledger Entry
      const entryId = `ple_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const entry: TenantPassLedgerEntry = {
        entryId,
        tenantId,
        batchId,
        deltaPasses: passes,
        balanceAfter: newBalance,
        reason: 'PURCHASE',
        idempotencyKey,
        metadata: { eventId, ...params.metadata },
        createdAt: now,
      };

      this.ledger.push(entry);

      // 6. Record Idempotency Tokens
      this.processedIdempotencyKeys.set(idempotencyKey, { entryId, replayCount: 1 });
      this.processedEventIds.set(eventId, { entryId, replayCount: 1 });

      return {
        accepted: true,
        isDuplicate: false,
        replayCount: 1,
        tenantId,
        balance: newBalance,
        batchId,
        message: 'PAYMENT_SETTLED_CREDIT_MUTATED',
      };
    });
  }

  /**
   * Atomic FIFO allocation of credit passes to personnel with Transactional Rollback.
   * If any requested allocation cannot be fulfilled or an error occurs, the entire
   * transaction rolls back cleanly to pre-allocation balance and batch state.
   */
  public async allocatePassesAtomic(params: {
    tenantId: string;
    personnelRequests: Array<{ personnelId: string; personnelName: string }>;
    idempotencyKey: string;
  }): Promise<{
    success: boolean;
    allocatedCount: number;
    remainingBalance: number;
    allocations: PersonnelPassAllocation[];
  }> {
    const { tenantId, personnelRequests, idempotencyKey } = params;

    return this.acquireTenantLock(tenantId, () => {
      // Idempotency check for allocation operation
      if (this.processedIdempotencyKeys.has(idempotencyKey)) {
        throw new Error(`IDEMPOTENCY_KEY_COLLISION: Key ${idempotencyKey} already utilized`);
      }

      const totalRequired = personnelRequests.length;
      const preBalance = this.getBalance(tenantId);

      // Invariant Check 1: Anti-Negative Balance Constraint
      if (preBalance < totalRequired) {
        throw new Error(
          `INSUFFICIENT_CREDITS: Required ${totalRequired} passes, but available balance is ${preBalance}. Transaction rejected.`
        );
      }

      // Invariant Check 2: Pre-snapshot for Transactional Rollback
      const batchSnapshots = new Map<string, string>();
      for (const [id, batch] of this.batches.entries()) {
        if (batch.tenantId === tenantId) {
          batchSnapshots.set(id, JSON.stringify(batch));
        }
      }

      const newAllocations: PersonnelPassAllocation[] = [];
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString();

      try {
        // Collect active batches sorted FIFO (oldest createdAt first)
        const tenantBatches = Array.from(this.batches.values())
          .filter((b) => b.tenantId === tenantId && b.status === 'ACTIVE' && b.availablePasses > 0)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        let batchIdx = 0;

        for (const req of personnelRequests) {
          while (batchIdx < tenantBatches.length && tenantBatches[batchIdx].availablePasses <= 0) {
            batchIdx++;
          }

          if (batchIdx >= tenantBatches.length) {
            throw new Error(`LEDGER_EXHAUSTION: Unexpected batch depletion mid-transaction`);
          }

          const targetBatch = tenantBatches[batchIdx];

          // Deduct from batch
          targetBatch.availablePasses -= 1;
          targetBatch.consumedPasses += 1;
          if (targetBatch.availablePasses === 0) {
            targetBatch.status = 'DEPLETED';
          }

          const allocationId = `alloc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const alloc: PersonnelPassAllocation = {
            allocationId,
            tenantId,
            batchId: targetBatch.batchId,
            personnelId: req.personnelId,
            personnelName: req.personnelName,
            allocatedAt: now.toISOString(),
            expiresAt,
          };

          this.allocations.set(allocationId, alloc);
          newAllocations.push(alloc);
        }

        // Deduct from tenant balance
        const postBalance = preBalance - totalRequired;
        if (postBalance < 0) {
          throw new Error(`NEGATIVE_BALANCE_VIOLATION: postBalance ${postBalance} < 0`);
        }
        this.tenantBalances.set(tenantId, postBalance);

        // Record ledger mutation
        const entryId = `ple_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        this.ledger.push({
          entryId,
          tenantId,
          batchId: newAllocations[0]?.batchId || 'MULTIPLE',
          deltaPasses: -totalRequired,
          balanceAfter: postBalance,
          reason: 'ALLOCATION',
          idempotencyKey,
          metadata: { allocatedCount: totalRequired },
          createdAt: now.toISOString(),
        });

        this.processedIdempotencyKeys.set(idempotencyKey, { entryId, replayCount: 1 });

        return {
          success: true,
          allocatedCount: totalRequired,
          remainingBalance: postBalance,
          allocations: newAllocations,
        };
      } catch (err) {
        // TRANSACTIONAL ROLLBACK: Revert batches, balance, and allocations
        for (const [id, json] of batchSnapshots.entries()) {
          this.batches.set(id, JSON.parse(json));
        }
        this.tenantBalances.set(tenantId, preBalance);
        for (const alloc of newAllocations) {
          this.allocations.delete(alloc.allocationId);
        }
        throw err;
      }
    });
  }

  /**
   * Concurrently processes renewal requests for active personnel.
   */
  public async renewPersonnelCoverage(params: {
    tenantId: string;
    personnelId: string;
    personnelName: string;
    idempotencyKey: string;
  }): Promise<{ success: boolean; remainingBalance: number; allocation: PersonnelPassAllocation }> {
    const { tenantId, personnelId, personnelName, idempotencyKey } = params;

    const res = await this.allocatePassesAtomic({
      tenantId,
      personnelRequests: [{ personnelId, personnelName }],
      idempotencyKey,
    });

    return {
      success: true,
      remainingBalance: res.remainingBalance,
      allocation: res.allocations[0],
    };
  }
}
