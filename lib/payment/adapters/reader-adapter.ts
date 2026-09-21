/**
 * @file lib/payment/adapters/reader-adapter.ts
 * @description BoonTrack Reader APK adapter implementing PaymentConfirmationProvider.
 *
 * This adapter handles incoming payment mutation notifications from the
 * BoonTrack Reader Android APK. It is responsible ONLY for parsing raw
 * notification payloads into normalized PaymentConfirmationResult objects.
 *
 * FORBIDDEN: This adapter MUST NOT directly read or mutate the `orders` table,
 * the `payment_events` table, or any other domain table. All side effects
 * (order state transitions, event logging) happen upstream in the webhook
 * handler and event service, triggered by the returned `PaymentConfirmationResult`.
 *
 * @architecture BATCH 1 / Ticket 1.1
 */

import type {
  PaymentConfirmationProvider,
  PaymentConfirmationResult,
  PaymentEventType,
} from '../payment-contracts';

// ---------------------------------------------------------------------------
// Internal parsing helpers (ported from payment-webhook-service.ts)
// These are pure functions with no side effects.
// ---------------------------------------------------------------------------

/**
 * Detect the source app from a notification text string.
 */
function detectApp(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes('dana')) return 'DANA';
  if (lower.includes('bca') || lower.includes('klikbca') || lower.includes('mybca')) return 'BCA';
  if (lower.includes('gopay') || lower.includes('gojek')) return 'GOPAY';
  if (lower.includes('mandiri') || lower.includes('livin')) return 'MANDIRI';
  if (lower.includes('bri') || lower.includes('brimo')) return 'BRI';
  if (lower.includes('shopee') || lower.includes('spay')) return 'SHOPEEPAY';
  return null;
}

/**
 * Parse an IDR amount from a free-form notification text.
 * Supports formats like: "Rp 1.771", "Rp1.771,00", "IDR 1771", "sebesar 1.771".
 */
export function parseAmountFromText(rawText: string): number | null {
  if (!rawText || typeof rawText !== 'string') return null;

  const text = rawText.trim();

  // Pattern 1: Rp / IDR followed by a number.
  // IMPORTANT: the bare-integer alternative ([0-9]{4,}) must come BEFORE {1,3} to
  // prevent "299000" being captured as "299" (regex alternation is left-to-right greedy).
  const rpRegex = /(?:rp\.?|idr)\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]{4,}|[0-9]{1,3})/i;
  // Pattern 2: keyword context followed by a number
  const keywordRegex =
    /(?:sebesar|menerima|pembayaran|nominal|berhasil menerima|masuk sebesar|uang masuk|terima)\s*(?:rp\.?|idr)?\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]{4,}|[0-9]{1,3})/i;
  // Fallback: standalone thousands-delimited number (e.g. 1.771) or bare integer ≥4 digits
  const genericRegex = /\b([1-9][0-9]{0,2}(?:\.[0-9]{3})+|[1-9][0-9]{3,8})\b/;

  let match = text.match(rpRegex) ?? text.match(keywordRegex) ?? text.match(genericRegex);
  if (!match) return null;

  let numStr = match[1].trim();

  // Strip trailing decorators like ,- .-, ,00 .00
  if (numStr.endsWith(',-') || numStr.endsWith('.-')) numStr = numStr.slice(0, -2);
  if (numStr.endsWith(',00') || numStr.endsWith('.00')) numStr = numStr.slice(0, -3);

  const amount = parseInt(numStr.replace(/[^0-9]/g, ''), 10);
  return isNaN(amount) || amount <= 0 ? null : amount;
}

/**
 * Compose a notification text string from title + body fields.
 * FIX(2026-09-19): Ternary operator precedence bug — evaluates entire chain
 * as condition. Now using explicit null-coalescing logic.
 */
export function composeNotificationText(
  titlePart: string,
  bodyPart: string
): string | null {
  if (titlePart && bodyPart) return `${titlePart} ${bodyPart}`;
  return bodyPart || titlePart || null;
}

// ---------------------------------------------------------------------------
// ReaderAdapter
// ---------------------------------------------------------------------------

/**
 * BoonTrack Reader APK `PaymentConfirmationProvider` adapter.
 *
 * Handles mutation notifications forwarded from the Android APK via webhook.
 * Pure parsing — zero database access.
 */
export class ReaderAdapter implements PaymentConfirmationProvider {
  readonly providerName = 'reader' as const;

  /**
   * Parse a raw Reader APK webhook payload into a normalized
   * `PaymentConfirmationResult`.
   *
   * @param rawPayload - The JSON body of the incoming webhook request.
   * @param metadata   - Optional auxiliary context: `{ headers, queryParams }`.
   */
  async parseWebhookPayload(
    rawPayload: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<PaymentConfirmationResult> {
    const headers = (metadata?.headers as Record<string, string>) ?? {};
    const queryParams = (metadata?.queryParams as Record<string, string>) ?? {};

    // 1. Resolve tenant slug from payload / query params / headers
    const tenantSlug =
      (queryParams['tenant'] as string | undefined) ??
      (queryParams['tenant_slug'] as string | undefined) ??
      (queryParams['slug'] as string | undefined) ??
      (rawPayload['tenant_slug'] as string | undefined) ??
      (rawPayload['tenant'] as string | undefined) ??
      (rawPayload['slug'] as string | undefined) ??
      (rawPayload['merchant_slug'] as string | undefined) ??
      (rawPayload['store_slug'] as string | undefined) ??
      headers['x-tenant-slug'] ??
      headers['x-tenant-id'] ??
      headers['tenant-slug'] ??
      headers['tenant'] ??
      null;

    // 2. Resolve direct order ID (from formal payment gateways)
    const directOrderId =
      (rawPayload['order_id'] as string | undefined) ??
      (rawPayload['external_id'] as string | undefined) ??
      (rawPayload['invoice_id'] as string | undefined) ??
      (rawPayload['reference_id'] as string | undefined) ??
      (rawPayload['bill_no'] as string | undefined) ??
      (queryParams['order_id'] as string | undefined) ??
      null;

    // 3. Resolve raw status
    const rawStatus = String(
      rawPayload['status'] ??
      rawPayload['payment_status'] ??
      rawPayload['transaction_status'] ??
      rawPayload['event'] ??
      ''
    ).toUpperCase();

    const isConfirmed =
      rawStatus === 'PAID' ||
      rawStatus === 'SETTLED' ||
      rawStatus === 'SUCCESS' ||
      rawStatus === 'COMPLETED' ||
      rawStatus === 'MUTATION_MATCHED';

    // 4. Extract notification text from Android APK notification fields
    const titlePart = String(
      rawPayload['title'] ?? rawPayload['notification_title'] ?? ''
    ).trim();
    const bodyPart = String(
      rawPayload['body'] ??
      rawPayload['text'] ??
      rawPayload['message'] ??
      rawPayload['content'] ??
      rawPayload['notification'] ??
      rawPayload['snippet'] ??
      rawPayload['raw_text'] ??
      ''
    ).trim();
    const notificationText = composeNotificationText(titlePart, bodyPart);

    // 5. Resolve amount
    const explicitAmount = Number(
      rawPayload['amount'] ??
      rawPayload['nominal'] ??
      rawPayload['gross_amount'] ??
      rawPayload['total'] ??
      0
    );

    let amount: number | null = explicitAmount > 0 ? explicitAmount : null;
    let detectedApp: string | null = null;

    if (notificationText) {
      const parsedFromText = parseAmountFromText(notificationText);
      if (!amount && parsedFromText) amount = parsedFromText;
      detectedApp = detectApp(notificationText);
    }

    // 6. Determine event type
    let eventType: PaymentEventType = 'payment.pending';
    if (isConfirmed || (amount !== null && amount > 0 && !rawStatus)) {
      // Reader APK notifications without explicit status are treated as success
      // signals (they only fire on successful mutation events).
      eventType = 'payment.success';
    } else if (rawStatus === 'FAILED' || rawStatus === 'DENY') {
      eventType = 'payment.failed';
    } else if (rawStatus === 'EXPIRE' || rawStatus === 'EXPIRED') {
      eventType = 'payment.expired';
    }

    // 7. Generate a provider event ID for idempotency
    // Reader APK does not provide a transaction ID, so we derive one from
    // amount + timestamp to allow deduplication within a short window.
    const providerEventId =
      (rawPayload['transaction_id'] as string | undefined) ??
      (rawPayload['trx_id'] as string | undefined) ??
      (rawPayload['id'] as string | undefined) ??
      `reader-${amount ?? 0}-${Date.now()}`;

    return {
      isConfirmed: eventType === 'payment.success',
      eventType,
      providerEventId,
      amount,
      tenantSlug,
      directOrderId,
      detectedApp,
      rawPayload,
    };
  }
}

/** Singleton instance for use in webhook handlers. */
export const readerAdapter = new ReaderAdapter();
