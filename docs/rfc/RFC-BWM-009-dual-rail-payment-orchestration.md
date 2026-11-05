# RFC-BWM-009: Dual-Rail Payment Orchestration (Xendit & Dodo Payments)

- **Status**: APPROVED
- **Author**: BWM Architecture Working Group
- **Reviewers**: CTO, Head of Financial Systems
- **Target Schema / Workspace**: Isolated Workforce Billing (`packages/workforce-billing/`)
- **Blast Radius**: ISOLATED (Zero touch to core BoonTrack modules)

---

## 1. Executive Summary

Boontrack Workforce Management (BWM) requires dual-rail payment orchestration to support domestic and regional enterprise clients:
1. **Domestic Rail (IDR)**: Handled via **Xendit** (Virtual Accounts, QRIS, e-Wallets, Retail Outlets).
2. **Regional & International Rail (USD, MYR)**: Handled via **Dodo Payments** (Credit/Debit Cards, FPX Malaysia, Cross-border Cards).

Under strict CTO financial integrity directives, payment processing is decoupled into three explicit, non-overlapping lifecycles:
1. **Initiation**: Creating a checkout session / invoice / payment intent with the provider.
2. **Confirmation**: Cryptographic signature validation and idempotency recording upon receiving provider callbacks.
3. **Entitlement**: Downstream release of BWM Credit Passes into the branch/tenant credit pool only after confirmation is finalized in the financial ledger.

---

## 2. Architecture & Orchestrator Interface

```
+-------------------------------------------------------------------------+
|                          BillingOrchestrator                            |
+-------------------------------------------------------------------------+
          |                                               |
   [Currency: IDR]                                [Currency: USD, MYR]
          v                                               v
+-------------------+                           +-------------------------+
|   XenditAdapter   |                           |   DodoPaymentsAdapter   |
|     (Sandbox)     |                           |        (Sandbox)        |
+-------------------+                           +-------------------------+
          |                                               |
          +-----------------------+-----------------------+
                                  |
                                  v
+-------------------------------------------------------------------------+
|           PaymentResult (Normalized Status & Audit Context)            |
|       - provider_payment_id   - internal_payment_ref                    |
|       - amount                - currency (IDR, USD, MYR)                |
|       - status: PENDING | SUCCEEDED | FAILED | DISPUTED | EXPIRED       |
+-------------------------------------------------------------------------+
```

### 2.1 Interface Definition (`BillingOrchestrator`)

```typescript
export interface BillingOrchestrator {
  createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult>;
  verifyWebhookSignature(rawBody: string, headers: Record<string, string>, currency: SupportedCurrency): Promise<SignatureVerificationResult>;
  processWebhookEvent(event: WebhookEventPayload): Promise<PaymentProcessingResult>;
  getPaymentStatus(paymentRef: string): Promise<NormalizedPaymentState>;
}
```

### 2.2 Provider Adapter Interface (`PaymentProviderAdapter`)

```typescript
export interface PaymentProviderAdapter {
  readonly providerName: 'XENDIT' | 'DODO_PAYMENTS';
  readonly supportedCurrencies: readonly SupportedCurrency[];
  
  createIntent(request: NormalizedIntentRequest): Promise<NormalizedIntentResponse>;
  verifySignature(rawBody: string, headers: Record<string, string>): boolean;
  parseWebhook(rawBody: string, headers: Record<string, string>): NormalizedWebhookEvent;
}
```

---

## 3. Provider Rail Specifications

### 3.1 Rail A: Xendit (IDR)
- **Currency**: `IDR` strictly.
- **Verification Strategy**:
  - Webhook callback contains `x-callback-token` header.
  - Token verified against configured `XENDIT_CALLBACK_TOKEN_SANDBOX`.
  - Additional signature check via SHA-256 HMAC for enterprise webhooks.
- **Lifecycle Mapping**:
  - `INVOICE_PAID` / `PAYMENT_SUCCEEDED` -> `SUCCEEDED`
  - `INVOICE_EXPIRED` -> `EXPIRED`
  - `PAYMENT_FAILED` -> `FAILED`
  - `CHARGEBACK_CREATED` -> `DISPUTED`

### 3.2 Rail B: Dodo Payments (USD, MYR)
- **Currencies**: `USD`, `MYR` strictly.
- **Verification Strategy**:
  - Webhook contains `webhook-id`, `webhook-timestamp`, and `webhook-signature`.
  - Signature computed via HMAC-SHA256 (`timestamp + "." + rawBody`, secret key `DODO_WEBHOOK_SECRET_SANDBOX`).
  - Strict replay window check: rejected if timestamp older than 300 seconds.
- **Lifecycle Mapping**:
  - `payment.succeeded` -> `SUCCEEDED`
  - `payment.failed` -> `FAILED`
  - `dispute.opened` -> `DISPUTED`

---

## 4. Separation of Lifecycles

1. **Initiation Phase**:
   - Creates a pending record in `payment_intent_records`.
   - Never issues credit passes or modifies the financial ledger.
2. **Confirmation Phase**:
   - Webhook received by `WebhookInbox`.
   - Validates cryptographic signature.
   - Idempotency key checked: if already processed, return cached 200 OK.
   - Status updated to `SUCCEEDED` in the payment registry.
3. **Entitlement Phase**:
   - Triggered only upon transition to `SUCCEEDED`.
   - Post double-entry booking to the multi-currency financial ledger and tax sub-ledger.
   - Atomic release of BWM Credit Passes into the tenant's credit pool.

---

## 5. Security & Sandbox Boundary
- **STRICT PROHIBITION**: Production API keys and endpoints for Xendit and Dodo Payments are forbidden in this environment.
- Only sandbox endpoints (`https://api.xendit.co/v2/...` sandbox mode, `https://test.dodopayments.com/...`) and mock harness adapters are permitted.
