# RFC-BWM-011: Webhook Inbox, Idempotency & Replay Protection

- **Status**: APPROVED
- **Author**: BWM Architecture Working Group
- **Reviewers**: CTO, Head of Financial Systems
- **Target Schema / Workspace**: Isolated Workforce Billing (`packages/workforce-billing/`)
- **Blast Radius**: ISOLATED (Zero touch to core BoonTrack modules)

---

## 1. Executive Summary

Payment webhooks are subject to unreliable network transports, duplicated HTTP deliveries, out-of-order events, and replay attacks. To guarantee zero double-crediting and zero missed events:
1. All inbound provider webhooks must be received by a dedicated **Webhook Inbox**.
2. Processing is strictly idempotent using a composite unique key: `(provider, event_id, idempotency_key)`.
3. Inbound payloads undergo cryptographic signature verification before ingestion.
4. Outdated, corrupt, or unparseable payloads are diverted to a **Dead-Letter Queue (DLQ)** with alert notifications.
5. Strict replay protection prevents re-execution of previously confirmed transactions.

---

## 2. Ingestion Pipeline & Flow

```
Inbound HTTP Webhook
         |
         v
+-------------------------------------------------------+
| 1. Cryptographic Signature Verification               |
|    - Xendit: Token / HMAC-SHA256                      |
|    - Dodo: Timestamped HMAC-SHA256                    |
+-------------------------------------------------------+
         |
    [Valid Signature?]
    /                 \
  [No]               [Yes]
   |                   |
   v                   v
+------------------+ +----------------------------------------------------+
| 401 Unauthorized | | 2. Replay & Timestamp Window Check (< 300s)        |
+------------------+ +----------------------------------------------------+
                               |
                        [Within Window?]
                        /              \
                      [No]            [Yes]
                       |                |
                       v                v
                 +-----------+ +------------------------------------------+
                 | 400 Stale | | 3. Idempotency Check (webhook_inbox)     |
                 +-----------+ +------------------------------------------+
                                        |
                               [Already Processed?]
                               /                  \
                            [Yes]                 [No]
                              |                     |
                              v                     v
                     +------------------+  +------------------------------+
                     | Return Cached 200|  | 4. Record 'RECEIVED'         |
                     | (0 Side Effects) |  | 5. Process Entitlement       |
                     +------------------+  | 6. Transition to 'PROCESSED' |
                                           +------------------------------+
```

---

## 3. Data Schema

### 3.1 `webhook_inbox` Table Definition

```sql
CREATE TABLE webhook_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(32) NOT NULL,            -- 'XENDIT' | 'DODO_PAYMENTS'
    event_id VARCHAR(128) NOT NULL,           -- Provider's unique event identifier
    idempotency_key VARCHAR(256) NOT NULL,    -- Composite hash: sha256(provider + event_id + payload_digest)
    event_type VARCHAR(64) NOT NULL,          -- e.g. 'payment.succeeded', 'invoice.paid'
    raw_payload JSONB NOT NULL,
    headers JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED', -- 'RECEIVED', 'PROCESSED', 'FAILED', 'DEAD_LETTER'
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_webhook_inbox_idempotency UNIQUE (provider, event_id),
    CONSTRAINT uq_webhook_idempotency_key UNIQUE (idempotency_key)
);
```

### 3.2 Dead-Letter Queue (`webhook_dead_letter_queue`)

```sql
CREATE TABLE webhook_dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inbox_id UUID REFERENCES webhook_inbox(id),
    provider VARCHAR(32) NOT NULL,
    payload JSONB NOT NULL,
    failure_reason TEXT NOT NULL,
    stack_trace TEXT,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by VARCHAR(64),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Deduplication & Idempotency Rules

1. **Instant Deduplication**:
   If an incoming webhook matches an existing `(provider, event_id)` that is already marked `PROCESSED`:
   - System returns HTTP 200 OK immediately with body `{"status": "idempotent_duplicate_ignored"}`.
   - Downstream credit allocations, ledger bookings, and notification dispatches are **not executed**.
2. **In-Flight Lock**:
   If an incoming webhook is currently in `RECEIVED` state (being processed by a concurrent thread):
   - The secondary thread awaits the transaction lock or returns a 200 OK retry acknowledge.
3. **Replay Protection**:
   Webhooks bearing a timestamp older than 300 seconds or attempting to re-post an already finalized settlement are rejected and logged in security audit logs.
