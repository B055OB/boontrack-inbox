/**
 * @file lib/payment/adapters/xendit-adapter.ts
 * @description Xendit adapter implementing PaymentInitiationProvider + PaymentConfirmationProvider.
 *
 * STATUS: Skeleton stub — wire integration details when Xendit API is enabled.
 *
 * Purpose: Proves that payment-contracts.ts interfaces are truly provider-neutral
 * and that a second adapter (besides ReaderAdapter) can implement both
 * PaymentInitiationProvider and PaymentConfirmationProvider simultaneously.
 *
 * FORBIDDEN: Must NOT directly read or mutate the `orders` table.
 *
 * @architecture BATCH 1 / Ticket 1.1
 */

import type {
  PaymentInitiationProvider,
  PaymentConfirmationProvider,
  PaymentIntent,
  PaymentConfirmationResult,
  PaymentEventType,
} from '../payment-contracts';

// ---------------------------------------------------------------------------
// XenditAdapter
// ---------------------------------------------------------------------------

/**
 * Xendit payment adapter.
 * Implements both `PaymentInitiationProvider` (create QRIS invoices) and
 * `PaymentConfirmationProvider` (parse Xendit webhook callbacks).
 */
export class XenditAdapter implements PaymentInitiationProvider, PaymentConfirmationProvider {
  readonly providerName = 'xendit' as const;

  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.xendit.co';

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.XENDIT_SECRET_KEY ?? '';
  }

  // -------------------------------------------------------------------------
  // PaymentInitiationProvider implementation
  // -------------------------------------------------------------------------

  /**
   * Create a Xendit QR code / Invoice for the given order.
   * @stub Replace with actual Xendit API call when integrating.
   */
  async createPaymentIntent(params: {
    orderId: string;
    tenantId: string;
    amount: number;
    customerPhone?: string;
    customerEmail?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaymentIntent> {
    // TODO: Replace stub with actual Xendit API call
    // POST https://api.xendit.co/v2/invoices
    // Authorization: Basic <base64(apiKey:)>
    if (!this.apiKey) {
      throw new Error('[XenditAdapter] XENDIT_SECRET_KEY is not configured.');
    }

    const referenceId = `BOONTRACK-${params.orderId}-${Date.now()}`;

    // Stub response shape — mirrors real Xendit Invoice response
    return {
      intentId: `stub_xendit_intent_${params.orderId}`,
      referenceId,
      amount: params.amount,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      paymentUrl: `https://checkout.xendit.co/web/${referenceId}`,
      rawProviderResponse: {
        __stub: true,
        note: 'Replace this stub with actual Xendit API integration',
        orderId: params.orderId,
        tenantId: params.tenantId,
      },
    };
  }

  /**
   * Generate a dynamic QRIS payload for Xendit QRIS static code.
   * Delegates to the shared QRIS utility.
   * @stub Wire to generateDynamicQRIS when Xendit QRIS is activated.
   */
  generateQrPayload(staticQris: string, amount: number): string {
    // TODO: Import and delegate to lib/qris-dynamic.ts
    // import { generateDynamicQRIS } from '../../qris-dynamic';
    // return generateDynamicQRIS(staticQris, amount);
    void staticQris;
    void amount;
    throw new Error('[XenditAdapter] generateQrPayload stub — not yet implemented.');
  }

  // -------------------------------------------------------------------------
  // PaymentConfirmationProvider implementation
  // -------------------------------------------------------------------------

  /**
   * Parse a Xendit webhook callback payload.
   * Xendit sends callbacks for: invoice.paid, payment.succeeded, etc.
   * @stub Extend with full Xendit event type handling.
   */
  async parseWebhookPayload(
    rawPayload: Record<string, unknown>,
    _metadata?: Record<string, unknown>
  ): Promise<PaymentConfirmationResult> {
    const xenditStatus = String(rawPayload['status'] ?? '').toUpperCase();
    const xenditEvent = String(rawPayload['event'] ?? '').toLowerCase();

    const isConfirmed =
      xenditStatus === 'PAID' ||
      xenditStatus === 'SETTLED' ||
      xenditEvent === 'invoice.paid' ||
      xenditEvent === 'payment.succeeded';

    let eventType: PaymentEventType = 'payment.pending';
    if (isConfirmed) eventType = 'payment.success';
    else if (xenditStatus === 'EXPIRED') eventType = 'payment.expired';
    else if (xenditStatus === 'FAILED') eventType = 'payment.failed';

    const amount = Number(rawPayload['paid_amount'] ?? rawPayload['amount'] ?? 0);

    return {
      isConfirmed,
      eventType,
      providerEventId:
        (rawPayload['id'] as string | undefined) ??
        (rawPayload['external_id'] as string | undefined) ??
        `xendit-unknown-${Date.now()}`,
      amount: amount > 0 ? amount : null,
      tenantSlug: (rawPayload['metadata'] as Record<string, unknown> | undefined)?.[
        'tenant_slug'
      ] as string | undefined,
      directOrderId:
        (rawPayload['external_id'] as string | undefined) ??
        (rawPayload['reference_id'] as string | undefined) ??
        null,
      detectedApp: 'XENDIT',
      rawPayload,
    };
  }

  /**
   * Actively verify a Xendit invoice / payment status by ID.
   * @stub Wire to Xendit GET /v2/invoices/:id when integrating.
   */
  async verifyPayment(providerEventId: string): Promise<PaymentConfirmationResult> {
    // TODO: GET https://api.xendit.co/v2/invoices/:providerEventId
    void providerEventId;
    throw new Error('[XenditAdapter] verifyPayment stub — not yet implemented.');
  }
}

/** Singleton instance (lazily created; API key from env). */
export const xenditAdapter = new XenditAdapter();
