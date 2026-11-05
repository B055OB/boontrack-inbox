/**
 * packages/workforce-billing/orchestrator/interface.ts
 * Dual-Rail Payment Orchestration Interfaces
 */

import {
  SupportedCurrency,
  PaymentProvider,
  PaymentStatus,
  PaymentIntentRequest,
  PaymentIntentResult,
  NormalizedPaymentRecord,
} from '../types';

export interface NormalizedIntentRequest {
  internalPaymentRef: string;
  branchId: string;
  agencyId: string;
  quantity: number;
  currency: SupportedCurrency;
  amountGross: number;
  amountNet: number;
  taxAmount: number;
  customerEmail: string;
  customerName: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export interface NormalizedIntentResponse {
  provider: PaymentProvider;
  providerPaymentId: string;
  checkoutUrl: string;
  expiresAt: string;
  rawResponse?: any;
}

export interface NormalizedWebhookEvent {
  provider: PaymentProvider;
  eventId: string;
  eventType: string;
  providerPaymentId: string;
  internalPaymentRef: string;
  currency: SupportedCurrency;
  amountGross: number;
  status: PaymentStatus;
  timestamp: string;
  rawPayload: any;
}

export interface PaymentProviderAdapter {
  readonly providerName: PaymentProvider;
  readonly supportedCurrencies: readonly SupportedCurrency[];

  createIntent(request: NormalizedIntentRequest): Promise<NormalizedIntentResponse>;
  verifySignature(rawBody: string, headers: Record<string, string>): boolean;
  parseWebhook(rawBody: string, headers: Record<string, string>): NormalizedWebhookEvent;
}
