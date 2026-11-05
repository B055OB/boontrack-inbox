/**
 * packages/workforce-billing/credit/postgres-atomic-credit-ledger.ts
 * PostgreSQL Persistence Adapter for Atomic Credit Ledger (Staging/Production Engine)
 *
 * Enforces PostgreSQL Row-Level Locking (SELECT ... FOR UPDATE) via stored function
 * `fn_workforce_allocate_credit_fifo` with explicit Tenant Isolation.
 */

import { Client } from 'pg';
import { SupportedCurrency } from '../types';

export interface PostgresAllocationResult {
  success: boolean;
  allocationId: string;
  lotId: string;
  personnelId: string;
  activatedAt: string;
  expiresAt: string;
  remainingLotCredits: number;
}

export class PostgresAtomicCreditLedger {
  private readonly client: Client;
  private readonly targetSchema: string;

  constructor(client: Client, targetSchema: string = 'workforce_staging') {
    this.client = client;
    this.targetSchema = targetSchema;
  }

  /**
   * Insert a new credit lot into workforce_credit_lots
   */
  public async createLot(lot: {
    lotId: string;
    purchaseRef: string;
    providerTxnId: string;
    tenantId?: string;
    branchId: string;
    agencyId: string;
    currency: SupportedCurrency;
    totalPurchased: number;
    unitPrice: number;
  }): Promise<void> {
    const tenantId = lot.tenantId || lot.agencyId;

    const query = `
      INSERT INTO ${this.targetSchema}.workforce_credit_lots (
        lot_id, purchase_ref, provider_txn_id, tenant_id, branch_id, agency_id,
        currency, total_purchased, available_credits, consumed_credits,
        frozen_credits, unit_price, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $8, 0, 0, $9, 'ACTIVE', NOW(), NOW()
      );
    `;

    await this.client.query(query, [
      lot.lotId,
      lot.purchaseRef,
      lot.providerTxnId,
      tenantId,
      lot.branchId,
      lot.agencyId,
      lot.currency,
      lot.totalPurchased,
      lot.unitPrice,
    ]);
  }

  /**
   * Execute atomic FIFO credit allocation with Row-Level Locking & Tenant Isolation
   */
  public async allocateCredit(params: {
    tenantId?: string;
    branchId: string;
    personnelId: string;
    personnelName: string;
  }): Promise<PostgresAllocationResult> {
    const tenantId = params.tenantId || 'tenant_satya_001';

    const query = `
      SELECT * FROM ${this.targetSchema}.fn_workforce_allocate_credit_fifo($1, $2, $3, $4);
    `;

    const res = await this.client.query(query, [
      tenantId,
      params.branchId,
      params.personnelId,
      params.personnelName,
    ]);

    if (!res.rows || res.rows.length === 0) {
      throw new Error(`ERR_INSUFFICIENT_CREDITS: Branch ${params.branchId} available balance is 0`);
    }

    const row = res.rows[0];
    return {
      success: true,
      allocationId: row.out_allocation_id,
      lotId: row.out_lot_id,
      personnelId: row.out_personnel_id,
      activatedAt: new Date(row.out_activated_at).toISOString(),
      expiresAt: new Date(row.out_expires_at).toISOString(),
      remainingLotCredits: row.out_remaining_lot_credits,
    };
  }

  /**
   * Handle chargeback: freeze unused credits in lot
   */
  public async handleChargeback(purchaseRef: string): Promise<{
    lotId: string;
    frozenCredits: number;
  }> {
    const query = `
      UPDATE ${this.targetSchema}.workforce_credit_lots
      SET frozen_credits = available_credits,
          available_credits = 0,
          status = 'FROZEN',
          updated_at = NOW()
      WHERE purchase_ref = $1
      RETURNING lot_id, frozen_credits;
    `;

    const res = await this.client.query(query, [purchaseRef]);
    if (!res.rows || res.rows.length === 0) {
      throw new Error(`LOT_NOT_FOUND: ${purchaseRef}`);
    }

    return {
      lotId: res.rows[0].lot_id,
      frozenCredits: res.rows[0].frozen_credits,
    };
  }

  /**
   * Get total available credits for branch (and optionally tenant)
   */
  public async getBranchAvailableBalance(branchId: string, tenantId?: string): Promise<number> {
    let query = `
      SELECT COALESCE(SUM(available_credits), 0) AS balance
      FROM ${this.targetSchema}.workforce_credit_lots
      WHERE branch_id = $1 AND status = 'ACTIVE'
    `;
    const queryParams: any[] = [branchId];

    if (tenantId) {
      query += ` AND tenant_id = $2;`;
      queryParams.push(tenantId);
    } else {
      query += `;`;
    }

    const res = await this.client.query(query, queryParams);
    return parseInt(res.rows[0]?.balance || '0', 10);
  }
}
