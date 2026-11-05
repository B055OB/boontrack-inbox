/**
 * packages/workforce-billing/orchestrator/billing-orchestrator.ts
 * Dual-Rail Billing Orchestration Engine
 */

import {
  SupportedCurrency,
  PaymentProvider,
  PaymentStatus,
  PaymentIntentRequest,
  PaymentIntentResult,
  NormalizedPaymentRecord,
  CURRENCY_CONFIGS,
  AuditLogEntry,
} from '../types';
import { PaymentProviderAdapter, NormalizedIntentRequest, NormalizedWebhookEvent } from './interface';
import { XenditAdapter } from './xendit-adapter';
import { DodoPaymentsAdapter } from './dodo-adapter';

export class BillingOrchestrator {
  private readonly xenditAdapter: XenditAdapter;
  private readonly dodoAdapter: DodoPaymentsAdapter;

  // In-memory registry for payment intents and records (mock/isolated state)
  private readonly intentRecords: Map<string, PaymentIntentResult> = new Map();
  private readonly paymentRecords: Map<string, NormalizedPaymentRecord> = new Map();
  private readonly auditLogs: AuditLogEntry[] = [];

  constructor(options?: {
    xenditAdapter?: XenditAdapter;
    dodoAdapter?: DodoPaymentsAdapter;
  }) {
    this.xenditAdapter = options?.xenditAdapter || new XenditAdapter();
    this.dodoAdapter = options?.dodoAdapter || new DodoPaymentsAdapter();
  }

  public getAdapterForCurrency(currency: SupportedCurrency): PaymentProviderAdapter {
    if (currency === 'IDR') {
      return this.xenditAdapter;
    }
    if (currency === 'USD' || currency === 'MYR') {
      return this.dodoAdapter;
    }
    throw new Error(`UNSUPPORTED_CURRENCY: ${currency}`);
  }

  public getAdapterForProvider(provider: PaymentProvider): PaymentProviderAdapter {
    if (provider === 'XENDIT') {
      return this.xenditAdapter;
    }
    if (provider === 'DODO_PAYMENTS') {
      return this.dodoAdapter;
    }
    throw new Error(`UNSUPPORTED_PROVIDER: ${provider}`);
  }

  /**
   * Phase 1: Initiation
   * Creates payment intent without issuing credits or booking revenue.
   */
  public async createPaymentIntent(request: PaymentIntentRequest): Promise<PaymentIntentResult> {
    const config = CURRENCY_CONFIGS[request.currency];
    if (!config) {
      throw new Error(`UNSUPPORTED_CURRENCY: ${request.currency}`);
    }

    if (request.quantity <= 0) {
      throw new Error('INVALID_QUANTITY: Pass quantity must be at least 1');
    }

    const amountNet = Number((request.quantity * config.unitPrice).toFixed(2));
    const taxAmount = Number((amountNet * config.taxRate).toFixed(2));
    const amountGross = Number((amountNet + taxAmount).toFixed(2));

    const internalPaymentRef = `PAY-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const adapter = this.getAdapterForCurrency(request.currency);

    const intentReq: NormalizedIntentRequest = {
      internalPaymentRef,
      branchId: request.branchId,
      agencyId: request.agencyId,
      quantity: request.quantity,
      currency: request.currency,
      amountGross,
      amountNet,
      taxAmount,
      customerEmail: request.customerEmail,
      customerName: request.customerName,
      idempotencyKey: request.idempotencyKey,
      metadata: request.metadata,
    };

    const intentRes = await adapter.createIntent(intentReq);

    const intentResult: PaymentIntentResult = {
      paymentReference: internalPaymentRef,
      provider: intentRes.provider,
      providerPaymentId: intentRes.providerPaymentId,
      checkoutUrl: intentRes.checkoutUrl,
      amountGross,
      amountNet,
      taxAmount,
      currency: request.currency,
      quantity: request.quantity,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt: intentRes.expiresAt,
    };

    this.intentRecords.set(internalPaymentRef, intentResult);

    // Initial normalized payment record
    const paymentRecord: NormalizedPaymentRecord = {
      internalPaymentRef,
      provider: intentRes.provider,
      providerTxnId: intentRes.providerPaymentId,
      branchId: request.branchId,
      agencyId: request.agencyId,
      currency: request.currency,
      quantity: request.quantity,
      amountGross,
      amountNet,
      taxAmount,
      status: 'PENDING',
      createdAt: intentResult.createdAt,
    };

    this.paymentRecords.set(internalPaymentRef, paymentRecord);

    this.recordAudit({
      entityType: 'PAYMENT',
      entityId: internalPaymentRef,
      previousState: 'NONE',
      newState: 'PENDING',
      actor: 'CHECKOUT_INITIATOR',
      metadata: {
        amountGross,
        currency: request.currency,
        quantity: request.quantity,
        provider: intentRes.provider,
      },
    });

    return intentResult;
  }

  /**
   * Phase 2: Confirmation
   * Verifies signature and parses incoming webhook.
   */
  public verifyWebhookSignature(
    provider: PaymentProvider,
    rawBody: string,
    headers: Record<string, string>
  ): boolean {
    const adapter = this.getAdapterForProvider(provider);
    return adapter.verifySignature(rawBody, headers);
  }

  public parseWebhookEvent(
    provider: PaymentProvider,
    rawBody: string,
    headers: Record<string, string>
  ): NormalizedWebhookEvent {
    const adapter = this.getAdapterForProvider(provider);
    return adapter.parseWebhook(rawBody, headers);
  }

  public updatePaymentStatus(
    paymentRef: string,
    newStatus: PaymentStatus,
    providerTxnId?: string
  ): NormalizedPaymentRecord {
    const record = this.paymentRecords.get(paymentRef);
    if (!record) {
      throw new Error(`PAYMENT_NOT_FOUND: ${paymentRef}`);
    }

    const previousState = record.status;
    record.status = newStatus;
    if (providerTxnId) {
      record.providerTxnId = providerTxnId;
    }

    if (newStatus === 'SUCCEEDED') {
      record.confirmedAt = new Date().toISOString();
    } else if (newStatus === 'DISPUTED') {
      record.disputedAt = new Date().toISOString();
    }

    this.paymentRecords.set(paymentRef, record);

    this.recordAudit({
      entityType: 'PAYMENT',
      entityId: paymentRef,
      previousState,
      newState: newStatus,
      actor: 'WEBHOOK_PROCESSOR',
      metadata: {
        providerTxnId: record.providerTxnId,
        currency: record.currency,
        amountGross: record.amountGross,
      },
    });

    return record;
  }

  public getPaymentRecord(paymentRef: string): NormalizedPaymentRecord | undefined {
    return this.paymentRecords.get(paymentRef);
  }

  public getAllPaymentRecords(): NormalizedPaymentRecord[] {
    return Array.from(this.paymentRecords.values());
  }

  public getAuditLogs(): AuditLogEntry[] {
    return [...this.auditLogs];
  }

  private recordAudit(entry: Omit<AuditLogEntry, 'logId' | 'timestamp'>) {
    this.auditLogs.push({
      logId: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    });
  }
}
