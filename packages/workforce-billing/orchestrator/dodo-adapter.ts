/**
 * packages/workforce-billing/orchestrator/dodo-adapter.ts
 * Dodo Payments Sandbox Adapter (Regional Rail - USD, MYR)
 */

import crypto from 'crypto';
import {
  PaymentProviderAdapter,
  NormalizedIntentRequest,
  NormalizedIntentResponse,
  NormalizedWebhookEvent,
} from './interface';
import { SupportedCurrency, PaymentProvider, PaymentStatus } from '../types';

export class DodoPaymentsAdapter implements PaymentProviderAdapter {
  public readonly providerName: PaymentProvider = 'DODO_PAYMENTS';
  public readonly supportedCurrencies: readonly SupportedCurrency[] = ['USD', 'MYR'];

  private readonly webhookSecret: string;
  private readonly maxClockDriftSeconds: number;

  constructor(config?: { webhookSecret?: string; maxClockDriftSeconds?: number }) {
    this.webhookSecret = config?.webhookSecret || process.env.DODO_WEBHOOK_SECRET_SANDBOX || 'dodo_sandbox_webhook_secret_key_2026';
    this.maxClockDriftSeconds = config?.maxClockDriftSeconds ?? 300; // 5 minutes max
  }

  public async createIntent(request: NormalizedIntentRequest): Promise<NormalizedIntentResponse> {
    if (!this.supportedCurrencies.includes(request.currency)) {
      throw new Error(`DodoPaymentsAdapter only supports USD and MYR. Received: ${request.currency}`);
    }

    const providerPaymentId = `dodo_pay_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    return {
      provider: 'DODO_PAYMENTS',
      providerPaymentId,
      checkoutUrl: `https://test.dodopayments.com/buy/${providerPaymentId}`,
      expiresAt,
      rawResponse: {
        payment_id: providerPaymentId,
        metadata: {
          internal_reference: request.internalPaymentRef,
          branch_id: request.branchId,
        },
        total_amount: request.amountGross,
        currency: request.currency,
        status: 'pending',
      },
    };
  }

  public verifySignature(rawBody: string, headers: Record<string, string>): boolean {
    const normalizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalizedHeaders[key.toLowerCase()] = value;
    }

    const signature = normalizedHeaders['webhook-signature'];
    const timestamp = normalizedHeaders['webhook-timestamp'];

    if (!signature || !timestamp) {
      return false;
    }

    // Replay Attack Protection: verify timestamp within 300 seconds
    const eventTime = parseInt(timestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    if (isNaN(eventTime) || Math.abs(currentTime - eventTime) > this.maxClockDriftSeconds) {
      return false; // Stale or future event beyond tolerance
    }

    // Compute expected signature: HMAC-SHA256(timestamp + "." + rawBody)
    const signedPayload = `${timestamp}.${rawBody}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedPayload)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch {
      return false;
    }
  }

  public parseWebhook(rawBody: string, headers: Record<string, string>): NormalizedWebhookEvent {
    let payload: any;
    try {
      payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch {
      throw new Error('MALFORMED_WEBHOOK_PAYLOAD: Failed to parse JSON body');
    }

    const eventId = payload.event_id || payload.id || `dodo_evt_${Date.now()}`;
    const eventType = payload.type || payload.event_type || 'payment.succeeded';
    const data = payload.data || payload;

    const providerPaymentId = data.payment_id || data.id || 'unknown';
    const internalPaymentRef =
      data.metadata?.internal_reference ||
      data.metadata?.internalPaymentRef ||
      data.external_reference ||
      'unknown';

    const rawCurrency = (data.currency || 'USD').toUpperCase();
    const currency: SupportedCurrency = rawCurrency === 'MYR' ? 'MYR' : 'USD';
    const amountGross = Number(data.total_amount || data.amount || 0);

    let status: PaymentStatus = 'PENDING';
    const eventLower = eventType.toLowerCase();

    if (['payment.succeeded', 'checkout.completed'].includes(eventLower)) {
      status = 'SUCCEEDED';
    } else if (['payment.failed', 'checkout.failed'].includes(eventLower)) {
      status = 'FAILED';
    } else if (['dispute.opened', 'dispute.created', 'chargeback.opened'].includes(eventLower)) {
      status = 'DISPUTED';
    } else if (['payment.expired', 'checkout.expired'].includes(eventLower)) {
      status = 'EXPIRED';
    }

    return {
      provider: 'DODO_PAYMENTS',
      eventId,
      eventType,
      providerPaymentId,
      internalPaymentRef,
      currency,
      amountGross,
      status,
      timestamp: payload.created_at || new Date().toISOString(),
      rawPayload: payload,
    };
  }
}
