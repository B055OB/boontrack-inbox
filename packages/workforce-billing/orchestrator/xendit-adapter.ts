/**
 * packages/workforce-billing/orchestrator/xendit-adapter.ts
 * Xendit Sandbox Adapter (Domestic Rail - IDR)
 */

import crypto from 'crypto';
import {
  PaymentProviderAdapter,
  NormalizedIntentRequest,
  NormalizedIntentResponse,
  NormalizedWebhookEvent,
} from './interface';
import { SupportedCurrency, PaymentProvider, PaymentStatus } from '../types';

export class XenditAdapter implements PaymentProviderAdapter {
  public readonly providerName: PaymentProvider = 'XENDIT';
  public readonly supportedCurrencies: readonly SupportedCurrency[] = ['IDR'];

  private readonly callbackToken: string;
  private readonly webhookSecret: string;

  constructor(config?: { callbackToken?: string; webhookSecret?: string }) {
    this.callbackToken = config?.callbackToken || process.env.XENDIT_CALLBACK_TOKEN_SANDBOX || 'xnd_sandbox_callback_token_satya_2026';
    this.webhookSecret = config?.webhookSecret || process.env.XENDIT_WEBHOOK_SECRET_SANDBOX || 'xnd_sandbox_hmac_secret_key_2026';
  }

  public async createIntent(request: NormalizedIntentRequest): Promise<NormalizedIntentResponse> {
    if (request.currency !== 'IDR') {
      throw new Error(`XenditAdapter only supports IDR. Received: ${request.currency}`);
    }

    // Mock / Sandbox invocation without touching live network or live secrets
    const providerPaymentId = `xnd_inv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    return {
      provider: 'XENDIT',
      providerPaymentId,
      checkoutUrl: `https://checkout-staging.xendit.co/web/${providerPaymentId}`,
      expiresAt,
      rawResponse: {
        id: providerPaymentId,
        external_id: request.internalPaymentRef,
        amount: request.amountGross,
        status: 'PENDING',
        currency: 'IDR',
      },
    };
  }

  public verifySignature(rawBody: string, headers: Record<string, string>): boolean {
    const normalizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalizedHeaders[key.toLowerCase()] = value;
    }

    // Check 1: Callback token verification
    const tokenHeader = normalizedHeaders['x-callback-token'];
    if (tokenHeader && tokenHeader === this.callbackToken) {
      return true;
    }

    // Check 2: HMAC-SHA256 signature verification if x-signature is provided
    const signatureHeader = normalizedHeaders['x-signature'];
    if (signatureHeader) {
      const computed = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBody)
        .digest('hex');
      return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(computed));
    }

    return false;
  }

  public parseWebhook(rawBody: string, headers: Record<string, string>): NormalizedWebhookEvent {
    let payload: any;
    try {
      payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch {
      throw new Error('MALFORMED_WEBHOOK_PAYLOAD: Failed to parse JSON body');
    }

    const eventId = payload.id || payload.event_id || `xnd_evt_${Date.now()}`;
    const eventType = payload.event || payload.status || 'unknown';
    const providerPaymentId = payload.id || payload.payment_id || payload.invoice_id || 'unknown';
    const internalPaymentRef = payload.external_id || payload.reference_id || 'unknown';
    const amountGross = Number(payload.amount || payload.paid_amount || 0);

    let status: PaymentStatus = 'PENDING';
    const statusStr = (payload.status || payload.event || '').toUpperCase();

    if (['PAID', 'SETTLED', 'COMPLETED', 'SUCCEEDED', 'INVOICE.PAID', 'PAYMENT.SUCCEEDED'].includes(statusStr)) {
      status = 'SUCCEEDED';
    } else if (['EXPIRED', 'INVOICE.EXPIRED'].includes(statusStr)) {
      status = 'EXPIRED';
    } else if (['FAILED', 'PAYMENT.FAILED'].includes(statusStr)) {
      status = 'FAILED';
    } else if (['DISPUTED', 'DISPUTE_CREATED', 'CHARGEBACK_CREATED'].includes(statusStr)) {
      status = 'DISPUTED';
    }

    return {
      provider: 'XENDIT',
      eventId,
      eventType,
      providerPaymentId,
      internalPaymentRef,
      currency: 'IDR',
      amountGross,
      status,
      timestamp: payload.paid_at || payload.created_at || new Date().toISOString(),
      rawPayload: payload,
    };
  }
}

