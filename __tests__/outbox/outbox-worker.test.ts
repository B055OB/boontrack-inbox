/**
 * __tests__/outbox/outbox-worker.test.ts
 * Acceptance & Unit Test Suite — Transactional Outbox Worker (Sprint P1)
 *
 * Test 1 — Row-Locking / Concurrency:
 *   Simulate 2 workers running in parallel. Verify no message is processed twice.
 *
 * Test 2 — Idempotency:
 *   Inserting two outbox messages with the same idempotency_key must result in
 *   exactly one record — the second insert must be silently skipped.
 *
 * Test 3 — Retry & DLQ Escalation:
 *   Simulate 3 consecutive adapter failures. Verify the message transitions from
 *   PENDING → PROCESSING → PENDING (retry 1) → PENDING (retry 2) → DEAD_LETTER,
 *   with last_error and failed_at set on final escalation.
 */

// ---------------------------------------------------------------------------
// Supabase client mock — MUST be before any imports that use it
// ---------------------------------------------------------------------------

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => mockDb),
  getSupabase: jest.fn(() => mockDb),
}));

// ---------------------------------------------------------------------------
// In-Memory Mock Database
// ---------------------------------------------------------------------------

import type { OutboxMessage, OutboxStatus } from '@/lib/outbox/types';

type DbRow = OutboxMessage;

class InMemoryOutboxDb {
  private rows: Map<string, DbRow> = new Map();
  private keyIndex: Map<string, string> = new Map(); // idempotency_key → id

  insertRow(row: Omit<DbRow, 'id' | 'created_at' | 'updated_at'>): {
    data: DbRow | null;
    error: { message: string; code?: string } | null;
  } {
    if (this.keyIndex.has(row.idempotency_key)) {
      return {
        data: null,
        error: { message: 'duplicate key value violates unique constraint', code: '23505' },
      };
    }

    const id = `uuid-${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date().toISOString();
    const newRow: DbRow = {
      // spread row first, then apply defaults for fields that may be missing
      ...row,
      id,
      created_at: now,
      updated_at: now,
      sent_at: row.sent_at ?? null,
      failed_at: row.failed_at ?? null,
      last_error: row.last_error ?? null,
      retry_count: row.retry_count ?? 0,
      max_retries: row.max_retries ?? 3,
      status: (row.status as DbRow['status']) ?? 'PENDING',
      channel: row.channel ?? 'WHATSAPP',
      phone_number_id: row.phone_number_id ?? null,
    };

    this.rows.set(id, newRow);
    this.keyIndex.set(row.idempotency_key, id);
    return { data: newRow, error: null };
  }

  claimBatch(batchSize: number, lockedIds: Set<string>): DbRow[] {
    const now = new Date();
    const claimed: DbRow[] = [];

    for (const [, row] of this.rows) {
      if (claimed.length >= batchSize) break;
      if (row.status !== 'PENDING') continue;
      if (lockedIds.has(row.id)) continue; // Simulate SKIP LOCKED
      if (new Date(row.scheduled_at) > now) continue;

      lockedIds.add(row.id);
      row.status = 'PROCESSING';
      row.updated_at = new Date().toISOString();
      claimed.push({ ...row });
    }

    return claimed;
  }

  markSent(id: string): void {
    const row = this.rows.get(id);
    if (!row) return;
    row.status = 'SENT';
    row.sent_at = new Date().toISOString();
    row.last_error = null;
    row.updated_at = new Date().toISOString();
  }

  markRetry(id: string, errorMsg: string, delayMs: number): void {
    const row = this.rows.get(id);
    if (!row) return;

    const newRetryCount = row.retry_count + 1;

    if (newRetryCount >= row.max_retries) {
      row.status = 'DEAD_LETTER';
      row.retry_count = newRetryCount;
      row.last_error = errorMsg;
      row.failed_at = new Date().toISOString();
    } else {
      row.status = 'PENDING';
      row.retry_count = newRetryCount;
      row.last_error = errorMsg;
      row.scheduled_at = new Date(Date.now() + delayMs).toISOString();
    }

    row.updated_at = new Date().toISOString();
  }

  getRow(id: string): DbRow | undefined {
    return this.rows.get(id);
  }

  getAllRows(): DbRow[] {
    return Array.from(this.rows.values());
  }

  countByStatus(status: OutboxStatus): number {
    return this.getAllRows().filter((r) => r.status === status).length;
  }

  clear(): void {
    this.rows.clear();
    this.keyIndex.clear();
  }
}

// ---------------------------------------------------------------------------
// Build mock Supabase client
// ---------------------------------------------------------------------------

const inMemoryDb = new InMemoryOutboxDb();
const globalLockSet = new Set<string>();

const mockDb = {
  rpc: jest.fn((fnName: string, args: Record<string, unknown>) => {
    if (fnName === 'claim_outbox_batch') {
      const batchSize = (args.batch_size as number) ?? 10;
      const batch = inMemoryDb.claimBatch(batchSize, globalLockSet);
      return Promise.resolve({ data: batch, error: null });
    }
    if (fnName === 'mark_outbox_sent') {
      inMemoryDb.markSent(args.p_id as string);
      return Promise.resolve({ data: null, error: null });
    }
    if (fnName === 'mark_outbox_retry') {
      inMemoryDb.markRetry(args.p_id as string, args.p_error as string, args.p_delay_ms as number);
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: null, error: { message: `Unknown RPC: ${fnName}` } });
  }),

  from: jest.fn((tableName: string) => {
    if (tableName !== 'message_outbox') throw new Error(`Unexpected table: ${tableName}`);
    return {
      insert: jest.fn((row: Omit<DbRow, 'id' | 'created_at' | 'updated_at'>) => ({
        select: jest.fn(() => ({
          maybeSingle: jest.fn(() => {
            const result = inMemoryDb.insertRow(row);
            return Promise.resolve(result);
          }),
        })),
      })),
    };
  }),
};

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { OutboxWorker, jitteredBackoff, type OutboxDbClient } from '@/lib/outbox/worker';
import { MockProviderAdapter } from '@/lib/outbox/adapters/mock-adapter';
import { enqueueOutboxMessage } from '@/lib/outbox/enqueue';

// Type-cast the mock to our minimal interface
const typedMockDb = mockDb as unknown as OutboxDbClient;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeOutboxParams(overrides: Partial<Parameters<typeof enqueueOutboxMessage>[0]> = {}) {
  return {
    tenant_id: 'test-tenant',
    recipient_phone: '6281234567890',
    payload: { type: 'text' as const, text: { body: 'Hello Test' } },
    phone_number_id: 'phone-id-123',
    idempotency_key: `test-key-${Date.now()}-${Math.random()}`,
    max_retries: 3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  inMemoryDb.clear();
  globalLockSet.clear();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Unit Tests: jitteredBackoff
// ---------------------------------------------------------------------------

describe('jitteredBackoff()', () => {
  it('returns 0 for retry 0 with base 0', () => {
    expect(jitteredBackoff(0, 0, 0)).toBe(0);
  });

  it('returns value within [0, maxDelayMs] range', () => {
    for (let i = 0; i < 50; i++) {
      const delay = jitteredBackoff(3, 2000, 30000);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(30000);
    }
  });

  it('caps delay at maxDelayMs even with high retry count', () => {
    for (let i = 0; i < 20; i++) {
      const delay = jitteredBackoff(100, 2000, 5000);
      expect(delay).toBeLessThanOrEqual(5000);
    }
  });

  it('does not exceed 2x baseMs for retry_count=0', () => {
    const delays = Array.from({ length: 100 }, () => jitteredBackoff(0, 2000, 30000));
    const maxFound = Math.max(...delays);
    expect(maxFound).toBeLessThanOrEqual(2000);
  });
});

// ---------------------------------------------------------------------------
// Test 1: Row-Locking / Concurrency
// ---------------------------------------------------------------------------

describe('Test 1 — Row-Locking / Concurrency (FOR UPDATE SKIP LOCKED)', () => {
  it('two parallel workers do not process the same message twice', async () => {
    // Arrange: seed 5 PENDING messages
    const messageIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const row = await enqueueOutboxMessage(
        makeOutboxParams({ idempotency_key: `concurrency-key-${i}` })
      );
      if (row) messageIds.push(row.id);
    }
    expect(messageIds).toHaveLength(5);

    const adapter1 = new MockProviderAdapter({ shouldFail: false });
    const adapter2 = new MockProviderAdapter({ shouldFail: false });
    const worker1 = new OutboxWorker({ batchSize: 5 });
    const worker2 = new OutboxWorker({ batchSize: 5 });

    // Act: run both workers simultaneously
    const [summary1, summary2] = await Promise.all([
      worker1.runOnce(adapter1, typedMockDb),
      worker2.runOnce(adapter2, typedMockDb),
    ]);

    const totalClaimed = summary1.claimed + summary2.claimed;
    const totalSent = summary1.sent + summary2.sent;

    expect(totalClaimed).toBe(5);
    expect(totalSent).toBe(5);
    expect(inMemoryDb.countByStatus('SENT')).toBe(5);
    expect(inMemoryDb.countByStatus('PROCESSING')).toBe(0);
    expect(inMemoryDb.countByStatus('PENDING')).toBe(0);
  });

  it('each message ID is processed by at most one worker', async () => {
    for (let i = 0; i < 10; i++) {
      await enqueueOutboxMessage(makeOutboxParams({ idempotency_key: `lock-test-key-${i}` }));
    }

    const processedIds1: string[] = [];
    const processedIds2: string[] = [];

    const trackingAdapter1 = {
      send: jest.fn(async (msg: OutboxMessage) => {
        processedIds1.push(msg.id);
        return { success: true, messageId: 'ok' };
      }),
    };

    const trackingAdapter2 = {
      send: jest.fn(async (msg: OutboxMessage) => {
        processedIds2.push(msg.id);
        return { success: true, messageId: 'ok' };
      }),
    };

    await Promise.all([
      new OutboxWorker({ batchSize: 10 }).runOnce(trackingAdapter1, typedMockDb),
      new OutboxWorker({ batchSize: 10 }).runOnce(trackingAdapter2, typedMockDb),
    ]);

    const allProcessed = [...processedIds1, ...processedIds2];
    const uniqueProcessed = new Set(allProcessed);

    expect(uniqueProcessed.size).toBe(allProcessed.length);
    expect(allProcessed).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Idempotency
// ---------------------------------------------------------------------------

describe('Test 2 — Idempotency (duplicate idempotency_key)', () => {
  it('inserting the same idempotency_key twice creates exactly one record', async () => {
    const key = 'idempotency-fixed-key-abc123';

    const result1 = await enqueueOutboxMessage(makeOutboxParams({ idempotency_key: key }));
    const result2 = await enqueueOutboxMessage(makeOutboxParams({ idempotency_key: key }));

    expect(result1).not.toBeNull();
    expect(result2).toBeNull();

    const matchingRows = inMemoryDb.getAllRows().filter((r) => r.idempotency_key === key);
    expect(matchingRows).toHaveLength(1);
  });

  it('calling enqueue 3x with same key still results in a single record', async () => {
    const key = 'order-123:checkout:confirm';

    await enqueueOutboxMessage(makeOutboxParams({ idempotency_key: key }));
    await enqueueOutboxMessage(makeOutboxParams({ idempotency_key: key }));
    await enqueueOutboxMessage(makeOutboxParams({ idempotency_key: key }));

    expect(inMemoryDb.getAllRows()).toHaveLength(1);
  });

  it('different idempotency keys create separate records', async () => {
    await enqueueOutboxMessage(makeOutboxParams({ idempotency_key: 'key-A' }));
    await enqueueOutboxMessage(makeOutboxParams({ idempotency_key: 'key-B' }));
    await enqueueOutboxMessage(makeOutboxParams({ idempotency_key: 'key-C' }));

    expect(inMemoryDb.getAllRows()).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Test 3: Retry & DLQ Escalation
// ---------------------------------------------------------------------------

describe('Test 3 — Retry & DLQ Escalation (max_retries=3)', () => {
  it('message escalates to DEAD_LETTER after exhausting all retries', async () => {
    const enqueued = await enqueueOutboxMessage(
      makeOutboxParams({ idempotency_key: 'retry-dlq-test-1', max_retries: 3 })
    );
    expect(enqueued).not.toBeNull();

    const failAdapter = new MockProviderAdapter({
      shouldFail: true,
      errorMessage: 'Simulated provider timeout',
    });
    const worker = new OutboxWorker({ batchSize: 10 });

    // Cycle 1: retry_count 0 → 1
    await worker.runOnce(failAdapter, typedMockDb);
    let row = inMemoryDb.getRow(enqueued!.id)!;
    expect(row.retry_count).toBe(1);
    expect(row.last_error).toBe('Simulated provider timeout');
    expect(row.status).toBe('PENDING');

    // Fast-forward
    row.scheduled_at = new Date(Date.now() - 1000).toISOString();
    globalLockSet.clear();

    // Cycle 2: retry_count 1 → 2
    await worker.runOnce(failAdapter, typedMockDb);
    row = inMemoryDb.getRow(enqueued!.id)!;
    expect(row.retry_count).toBe(2);
    expect(row.status).toBe('PENDING');

    // Fast-forward
    row.scheduled_at = new Date(Date.now() - 1000).toISOString();
    globalLockSet.clear();

    // Cycle 3: retry_count 2 → 3 (>= max_retries=3) → DEAD_LETTER
    await worker.runOnce(failAdapter, typedMockDb);
    row = inMemoryDb.getRow(enqueued!.id)!;

    expect(row.retry_count).toBe(3);
    expect(row.status).toBe('DEAD_LETTER');
    expect(row.last_error).toBe('Simulated provider timeout');
    expect(row.failed_at).not.toBeNull();
    expect(row.sent_at).toBeNull();
  });

  it('message that succeeds on first retry does NOT escalate to DLQ', async () => {
    const enqueued = await enqueueOutboxMessage(
      makeOutboxParams({ idempotency_key: 'retry-success-key', max_retries: 3 })
    );
    expect(enqueued).not.toBeNull();

    const adapter = new MockProviderAdapter({ failUntilAttempt: 1 });
    const worker = new OutboxWorker({ batchSize: 10 });

    // Cycle 1: fails → retry
    await worker.runOnce(adapter, typedMockDb);
    let row = inMemoryDb.getRow(enqueued!.id)!;
    expect(row.status).toBe('PENDING');
    expect(row.retry_count).toBe(1);

    // Fast-forward
    row.scheduled_at = new Date(Date.now() - 1000).toISOString();
    globalLockSet.clear();

    // Cycle 2: succeeds
    await worker.runOnce(adapter, typedMockDb);
    row = inMemoryDb.getRow(enqueued!.id)!;
    expect(row.status).toBe('SENT');
    expect(row.sent_at).not.toBeNull();
    expect(row.failed_at).toBeNull();
  });

  it('DEAD_LETTER message contains full audit trail', async () => {
    const enqueued = await enqueueOutboxMessage(
      makeOutboxParams({ idempotency_key: 'dlq-audit-trail-key', max_retries: 2 })
    );
    const worker = new OutboxWorker({ batchSize: 10 });
    const adapter = new MockProviderAdapter({
      shouldFail: true,
      errorMessage: 'Provider unavailable: HTTP 503',
    });

    // Cycle 1
    await worker.runOnce(adapter, typedMockDb);
    let row = inMemoryDb.getRow(enqueued!.id)!;
    row.scheduled_at = new Date(Date.now() - 1000).toISOString();
    globalLockSet.clear();

    // Cycle 2: escalates (retry_count 1 → 2 >= max_retries=2)
    await worker.runOnce(adapter, typedMockDb);
    row = inMemoryDb.getRow(enqueued!.id)!;

    expect(row.status).toBe('DEAD_LETTER');
    expect(row.retry_count).toBe(2);
    expect(row.last_error).toBe('Provider unavailable: HTTP 503');
    expect(row.failed_at).toBeTruthy();
    expect(new Date(row.failed_at!).getTime()).toBeLessThanOrEqual(Date.now());
    expect(row.sent_at).toBeNull();
  });

  it('multiple messages in batch are processed independently (one DLQ does not block others)', async () => {
    const failMsg = await enqueueOutboxMessage(
      makeOutboxParams({ idempotency_key: 'batch-fail', max_retries: 2 })
    );
    const successMsg = await enqueueOutboxMessage(
      makeOutboxParams({ idempotency_key: 'batch-success', max_retries: 3 })
    );

    expect(failMsg).not.toBeNull();
    expect(successMsg).not.toBeNull();

    let callIdx = 0;
    const mixedAdapter = {
      send: jest.fn(async (msg: OutboxMessage) => {
        callIdx++;
        if (msg.id === failMsg!.id) {
          return { success: false, error: 'Intentional failure' };
        }
        return { success: true, messageId: 'ok-123' };
      }),
    };

    const worker = new OutboxWorker({ batchSize: 10 });
    await worker.runOnce(mixedAdapter, typedMockDb);

    const failRow = inMemoryDb.getRow(failMsg!.id)!;
    const successRow = inMemoryDb.getRow(successMsg!.id)!;

    expect(successRow.status).toBe('SENT');
    expect(failRow.status).toBe('PENDING');
    expect(failRow.retry_count).toBe(1);
    expect(callIdx).toBe(2);
  });
});
