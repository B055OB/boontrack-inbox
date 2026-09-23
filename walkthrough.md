# Walkthrough — Emergency Hotfix: Supabase Egress Quota Exceeded & Infinite Request Loop

## 1. Problem Root Causes
1. **Schema Mismatches on `orders` Queries**:
   - Queries requesting non-existent columns (`buyer_name`, `buyer_phone`, `total_amount`, `metadata`, `download_url`, `fulfillment_metadata`, `order_id`, `shipping_status`, `tracking_number`, `resi`, `waybill`), triggering PostgREST HTTP 400 Bad Request (`column orders.xxx does not exist`).
2. **Invalid UUID Syntax (Postgres 22P02)**:
   - Polling hooks and routes passed unvalidated slugs, non-UUID strings (`'ord-123'`, `'webchat-demo-visitor'`, `'wa_...'`), or `'undefined'` into Postgres UUID columns (`messages.conversation_id`, `orders.tenant_id`, `tenants.id`).
3. **Infinite Retry Loop on HTTP 4xx**:
   - Frontend `setInterval` polling in `useTenantDashboard`, `CheckoutModal`, `checkout/[order_id]`, `UpgradePaymentModal`, `register/page.tsx`, and `ReaderIntegrationCard` lacked circuit breakers for HTTP 4xx (client) errors, leading to infinite polling loops and flooding Supabase `/rest/v1/*` endpoints.

---

## 2. Key Changes Made

### A. Client-Side UUID Guard & Fetch Interceptor
- **[lib/uuid-guard.ts](file:///c:/boontrack-inbox/lib/uuid-guard.ts)**:
  - Created standard UUID validator (`isValidUuid`) with regex `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`.
- **[lib/supabaseClient.ts](file:///c:/boontrack-inbox/lib/supabaseClient.ts)**:
  - Implemented `createGuardedFetch`: Intercepts client-side Supabase requests attempting to query `.eq` with `'undefined'`, `'null'`, or `'[object Object]'` and rejects them with HTTP 400 immediately before hitting the network, saving egress quota.
  - Warns on 4xx errors to trace rogue callers.

### B. Fixed Schema Queries on `orders` & `messages`
- **[app/[tenant]/dashboard/components/AdsTrackingPro.tsx](file:///c:/boontrack-inbox/app/[tenant]/dashboard/components/AdsTrackingPro.tsx)**:
  - Replaced non-existent columns (`buyer_name`, `buyer_phone`, `total_amount`, `metadata`) with actual `orders` schema (`id, customer_name, customer_phone, gross_amount, status, created_at, utm_campaign, utm_source`).
- **[app/components/CheckoutModal.tsx](file:///c:/boontrack-inbox/app/components/CheckoutModal.tsx)**:
  - Fixed `.select('id, status, payment_status')` removing non-existent `download_url, fulfillment_metadata`.
- **[app/api/orders/[orderId]/status/route.ts](file:///c:/boontrack-inbox/app/api/orders/[orderId]/status/route.ts)**:
  - Changed `.or('order_id.eq...,invoice_no.eq...')` to `.eq('correlation_id', orderId)`.
- **[lib/tools/action/request-order-cancellation.ts](file:///c:/boontrack-inbox/lib/tools/action/request-order-cancellation.ts)**:
  - Replaced `select('id, order_id, ...')` with `select('*')` and `.or('id.eq...,correlation_id.eq...')`.
- **[lib/tools/read/get-order-status.ts](file:///c:/boontrack-inbox/lib/tools/read/get-order-status.ts)** & **[lib/tools/read/track-shipment.ts](file:///c:/boontrack-inbox/lib/tools/read/track-shipment.ts)**:
  - Guarded tenant UUID vs slug queries with `.or('tenant_slug.eq...')` to prevent 22P02 UUID errors.
- **[lib/zero-ai-engine.ts](file:///c:/boontrack-inbox/lib/zero-ai-engine.ts)**, **[app/api/v1/chat/route.ts](file:///c:/boontrack-inbox/app/api/v1/chat/route.ts)**, **[app/api/v1/tenants/[slug]/orders/[id]/quick-paid/route.ts](file:///c:/boontrack-inbox/app/api/v1/tenants/[slug]/orders/[id]/quick-paid/route.ts)**:
  - Removed or guarded non-UUID strings (`wa_...`, `webchat-demo-visitor`, `orderId`) from `messages.conversation_id`.

### C. Polling Throttling & 4xx Circuit Breakers
- **[app/[tenant]/dashboard/hooks/useTenantDashboard.ts](file:///c:/boontrack-inbox/app/[tenant]/dashboard/hooks/useTenantDashboard.ts)**:
  - Guarded `activeConversationId` with `isValidUuid(activeConversationId)`.
  - WhatsApp status polling interval throttled from 5s to 15s.
  - Removed unstable state (`qrCodeUrl`) from `useEffect` dependencies.
  - Added 3-consecutive-error circuit breaker.
- **[app/checkout/[order_id]/page.tsx](file:///c:/boontrack-inbox/app/checkout/[order_id]/page.tsx)**:
  - Throttled polling from 2s to 4s.
  - Immediately stops polling on HTTP 4xx (404 Not Found, 400 Bad Request) and after 5 consecutive errors.
- **[app/components/CheckoutModal.tsx](file:///c:/boontrack-inbox/app/components/CheckoutModal.tsx)**:
  - Throttled interval to 4000ms with a 45-cycle ceiling (~3 minutes) and 4xx circuit breaker.
- **[app/[tenant]/dashboard/components/modals/UpgradePaymentModal.tsx](file:///c:/boontrack-inbox/app/[tenant]/dashboard/components/modals/UpgradePaymentModal.tsx)** & **[app/register/page.tsx](file:///c:/boontrack-inbox/app/register/page.tsx)**:
  - Added immediate `stopAll()` on HTTP 4xx responses.
- **[app/[tenant]/dashboard/components/settings/ReaderIntegrationCard.tsx](file:///c:/boontrack-inbox/app/[tenant]/dashboard/components/settings/ReaderIntegrationCard.tsx)**:
  - Added parameter guards and stopped interval on HTTP 4xx.
- **[scripts/run-outbox-worker.ts](file:///c:/boontrack-inbox/scripts/run-outbox-worker.ts)**:
  - Enforced minimum 10,000ms polling interval with exponential backoff on error up to 60s.

---

## 3. Verification & Results

### Automated Tests
- **Jest**: All 6 test suites passed (142 tests passing):
  - `waba_security_matrix.test.ts` (PASS)
  - `outbox-worker.test.ts` (PASS)
  - `test_trial_guard.test.ts` (PASS)
  - `test_gtm_datalayer.test.ts` (PASS)
  - `tool-gateway.test.ts` (PASS — all 20 tests including 5 Negative Matrix tests)
  - `test_payment_boundary.test.ts` (PASS)
- **TypeScript**: `npx.cmd tsc --noEmit` exited cleanly with code 0 (0 type errors).

### Git
- Committed: `fix(db): prevent infinite retry loop on 4xx errors, validate uuid, and fix orders schema queries`
- Pushed to: `origin/main` (`1f44ffe`).
