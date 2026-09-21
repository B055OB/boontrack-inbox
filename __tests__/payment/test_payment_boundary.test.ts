/**
 * @file __tests__/payment/test_payment_boundary.test.ts
 * @description Unit tests for BATCH 1 / Ticket 1.1 — Payment Domain Abstraction.
 *
 * Test suite verifies:
 *   1. ReaderAdapter implements PaymentConfirmationProvider interface correctly.
 *   2. XenditAdapter implements PaymentInitiationProvider + PaymentConfirmationProvider.
 *   3. PaymentEventService.recordEvent() does NOT call the `orders` table.
 *   4. PaymentEventRecord schema contains all required vendor-neutral columns.
 *   5. parseAmountFromText() parses Indonesian mutation notification formats.
 *   6. composeNotificationText() handles title/body precedence correctly.
 */

// ---------------------------------------------------------------------------
// Mocks — must be defined before imports
// ---------------------------------------------------------------------------

// Mock Supabase client so DB calls don't fail in unit test environment
jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => mockSupabaseClient),
  getSupabase: jest.fn(() => mockSupabaseClient),
}));

// Track all table names called on .from()
const calledTables: string[] = [];

const mockInsertChain = {
  then: jest.fn((cb: (result: { error: null }) => void) => {
    cb({ error: null });
    return { catch: jest.fn() };
  }),
  catch: jest.fn(),
};

const mockSupabaseClient = {
  from: jest.fn((tableName: string) => {
    calledTables.push(tableName);
    return {
      insert: jest.fn(() => mockInsertChain),
      select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: jest.fn() })) })),
      update: jest.fn(() => ({ eq: jest.fn() })),
    };
  }),
};

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  ReaderAdapter,
  parseAmountFromText,
  composeNotificationText,
} from '@/lib/payment/adapters/reader-adapter';
import { XenditAdapter } from '@/lib/payment/adapters/xendit-adapter';
import { paymentEventService } from '@/lib/payment/payment-event-service';
import type {
  PaymentConfirmationProvider,
  PaymentInitiationProvider,
  PaymentEventRecord,
} from '@/lib/payment/payment-contracts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if the object implements PaymentConfirmationProvider contract. */
function implementsConfirmationProvider(obj: unknown): obj is PaymentConfirmationProvider {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'providerName' in obj &&
    typeof (obj as PaymentConfirmationProvider).parseWebhookPayload === 'function'
  );
}

/** Returns true if the object implements PaymentInitiationProvider contract. */
function implementsInitiationProvider(obj: unknown): obj is PaymentInitiationProvider {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'providerName' in obj &&
    typeof (obj as PaymentInitiationProvider).createPaymentIntent === 'function'
  );
}

// ---------------------------------------------------------------------------
// Test Suite 1: Interface Contract Compliance
// ---------------------------------------------------------------------------

describe('Payment Contract Compliance', () => {
  it('ReaderAdapter implements PaymentConfirmationProvider', () => {
    const adapter = new ReaderAdapter();
    expect(implementsConfirmationProvider(adapter)).toBe(true);
    expect(adapter.providerName).toBe('reader');
    expect(typeof adapter.parseWebhookPayload).toBe('function');
  });

  it('XenditAdapter implements PaymentInitiationProvider', () => {
    const adapter = new XenditAdapter();
    expect(implementsInitiationProvider(adapter)).toBe(true);
    expect(adapter.providerName).toBe('xendit');
    expect(typeof adapter.createPaymentIntent).toBe('function');
  });

  it('XenditAdapter also implements PaymentConfirmationProvider', () => {
    const adapter = new XenditAdapter();
    expect(implementsConfirmationProvider(adapter)).toBe(true);
    expect(typeof adapter.parseWebhookPayload).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 2: ReaderAdapter.parseWebhookPayload — correct normalization
// ---------------------------------------------------------------------------

describe('ReaderAdapter.parseWebhookPayload()', () => {
  const adapter = new ReaderAdapter();

  it('parses a DANA mutation notification correctly', async () => {
    const result = await adapter.parseWebhookPayload({
      body: 'DANA Bisnis: Pembayaran diterima sebesar Rp 1.771',
      _provider: 'reader',
    });
    expect(result.amount).toBe(1771);
    expect(result.detectedApp).toBe('DANA');
    expect(result.eventType).toBe('payment.success');
    expect(result.isConfirmed).toBe(true);
  });

  it('parses a BCA mobile transfer notification', async () => {
    const result = await adapter.parseWebhookPayload({
      title: 'BCA Mobile',
      body: 'm-Transfer: 19/09 50000 ke Rek 1234',
      _provider: 'reader',
    });
    expect(result.amount).toBe(50000);
    expect(result.detectedApp).toBe('BCA');
    expect(result.isConfirmed).toBe(true);
  });

  it('handles explicit direct order ID from gateway payload', async () => {
    const result = await adapter.parseWebhookPayload({
      order_id: 'ORDER-ABC-123',
      status: 'PAID',
      gross_amount: 199000,
      _provider: 'reader',
    });
    expect(result.directOrderId).toBe('ORDER-ABC-123');
    expect(result.isConfirmed).toBe(true);
    expect(result.amount).toBe(199000);
  });

  it('resolves tenant slug from multiple sources', async () => {
    const result = await adapter.parseWebhookPayload(
      { body: 'Rp 50000', _provider: 'reader', tenant_slug: 'my-store' },
      {}
    );
    expect(result.tenantSlug).toBe('my-store');
  });

  it('returns payment.pending for ambiguous status', async () => {
    const result = await adapter.parseWebhookPayload({
      status: 'PENDING',
      amount: 75000,
      _provider: 'reader',
    });
    expect(result.eventType).toBe('payment.pending');
    expect(result.isConfirmed).toBe(false);
  });

  it('returns payment.failed for FAILED status', async () => {
    const result = await adapter.parseWebhookPayload({
      status: 'FAILED',
      amount: 10000,
      _provider: 'reader',
    });
    expect(result.eventType).toBe('payment.failed');
    expect(result.isConfirmed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 3: XenditAdapter.parseWebhookPayload
// ---------------------------------------------------------------------------

describe('XenditAdapter.parseWebhookPayload()', () => {
  const adapter = new XenditAdapter();

  it('parses invoice.paid event correctly', async () => {
    const result = await adapter.parseWebhookPayload({
      id: 'xendit_inv_abc',
      external_id: 'BOONTRACK-ORDER-001',
      status: 'PAID',
      paid_amount: 299000,
    });
    expect(result.isConfirmed).toBe(true);
    expect(result.eventType).toBe('payment.success');
    expect(result.amount).toBe(299000);
    expect(result.directOrderId).toBe('BOONTRACK-ORDER-001');
    expect(result.detectedApp).toBe('XENDIT');
  });

  it('parses EXPIRED invoice correctly', async () => {
    const result = await adapter.parseWebhookPayload({
      id: 'xendit_inv_expired',
      status: 'EXPIRED',
      amount: 59000,
    });
    expect(result.isConfirmed).toBe(false);
    expect(result.eventType).toBe('payment.expired');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 4: PaymentEventService — must NOT touch `orders` table
// ---------------------------------------------------------------------------

describe('PaymentEventService.recordEvent() — orders table isolation', () => {
  beforeEach(() => {
    calledTables.length = 0; // reset tracker
  });

  it('does NOT call the orders table when recording an event', async () => {
    const mockResult = {
      isConfirmed: true,
      eventType: 'payment.success' as const,
      providerEventId: 'test-evt-001',
      amount: 75000,
      tenantSlug: 'test-store',
      directOrderId: null,
      detectedApp: 'DANA',
      rawPayload: { _provider: 'reader', body: 'Rp 75000' },
    };

    await paymentEventService.recordEvent(mockResult, 'tenant-uuid-123', 'order-uuid-456');

    // Allow fire-and-forget to flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The ONLY table that should have been called is payment_events
    const orderTableCalls = calledTables.filter((t) => t === 'orders');
    expect(orderTableCalls).toHaveLength(0);
  });

  it('calls payment_events table for persistence', async () => {
    calledTables.length = 0;

    const mockResult = {
      isConfirmed: true,
      eventType: 'payment.success' as const,
      providerEventId: 'test-evt-002',
      amount: 199000,
      tenantSlug: 'another-store',
      directOrderId: null,
      detectedApp: null,
      rawPayload: { _provider: 'reader', amount: 199000 },
    };

    await paymentEventService.recordEvent(mockResult, 'tenant-uuid-456', 'order-uuid-789');
    await new Promise((resolve) => setTimeout(resolve, 50));

    const paymentEventCalls = calledTables.filter((t) => t === 'payment_events');
    expect(paymentEventCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('emits PAYMENT_CONFIRMED callback when isConfirmed = true', async () => {
    const confirmedEvents: string[] = [];
    paymentEventService.onPaymentConfirmed(async (evt) => {
      confirmedEvents.push(evt.eventId);
    });

    const mockResult = {
      isConfirmed: true,
      eventType: 'payment.success' as const,
      providerEventId: 'test-evt-callback',
      amount: 59000,
      tenantSlug: 'store-x',
      directOrderId: null,
      detectedApp: 'GOPAY',
      rawPayload: { _provider: 'reader' },
    };

    await paymentEventService.recordEvent(mockResult, 'tenant-cb', 'order-cb');
    expect(confirmedEvents).toHaveLength(1);
  });

  it('does NOT emit PAYMENT_CONFIRMED callback when isConfirmed = false', async () => {
    let callbackCount = 0;
    paymentEventService.onPaymentConfirmed(async () => {
      callbackCount++;
    });

    const mockResult = {
      isConfirmed: false,
      eventType: 'payment.pending' as const,
      providerEventId: 'test-evt-pending',
      amount: 75000,
      tenantSlug: 'store-y',
      directOrderId: null,
      detectedApp: null,
      rawPayload: { _provider: 'reader' },
    };

    // Snapshot before
    const beforeCount = callbackCount;
    await paymentEventService.recordEvent(mockResult, 'tenant-pending', null);
    expect(callbackCount).toBe(beforeCount); // no new callback fired
  });
});

// ---------------------------------------------------------------------------
// Test Suite 5: PaymentEventRecord schema — vendor-neutral column coverage
// ---------------------------------------------------------------------------

describe('PaymentEventRecord schema completeness', () => {
  it('contains all required vendor-neutral columns', () => {
    // Build a sample record and verify all required keys are present
    const sampleRecord: PaymentEventRecord = {
      id: 'uuid-001',
      tenant_id: 'tenant-uuid',
      order_id: 'order-uuid',
      provider: 'reader',
      provider_event_id: 'evt-001',
      event_type: 'payment.success',
      amount: 75000,
      raw_payload: { body: 'Rp 75000' },
      created_at: new Date().toISOString(),
    };

    const requiredKeys: (keyof PaymentEventRecord)[] = [
      'id',
      'tenant_id',
      'order_id',
      'provider',
      'provider_event_id',
      'event_type',
      'amount',
      'raw_payload',
      'created_at',
    ];

    for (const key of requiredKeys) {
      expect(sampleRecord).toHaveProperty(key);
    }
  });

  it('allows order_id to be null (unmatched events)', () => {
    const record: PaymentEventRecord = {
      id: 'uuid-002',
      tenant_id: 'tenant-uuid',
      order_id: null,       // <-- explicitly null for unmatched events
      provider: 'xendit',
      provider_event_id: 'xendit-evt-001',
      event_type: 'payment.pending',
      amount: 0,
      raw_payload: {},
      created_at: new Date().toISOString(),
    };
    expect(record.order_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test Suite 6: parseAmountFromText — Indonesian notification format coverage
// ---------------------------------------------------------------------------

describe('parseAmountFromText()', () => {
  const cases: [string, number | null][] = [
    ['DANA Bisnis: Pembayaran diterima sebesar Rp 1.771', 1771],
    ['DANA Bisnis: Pembayaran diterima sebesar Rp1.771', 1771],
    ['QRIS: Berhasil menerima Rp 1.771', 1771],
    ['DANA Bisnis: Transaksi QRIS sebesar Rp1.771,00 sukses', 1771],
    ['m-Transfer: 19/09 50000 ke Rek 1234', 50000],
    ['GoPay Usaha: Pembayaran sebesar Rp 199.000 berhasil diterima', 199000],
    ['Berhasil menerima Rp 59.000 dari PEMBELI', 59000],
    ['IDR 299000 diterima', 299000],
    ['Tidak ada nominal', null],
    ['', null],
  ];

  it.each(cases)('parses "%s" → %s', (input, expected) => {
    expect(parseAmountFromText(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 7: composeNotificationText — title/body precedence
// ---------------------------------------------------------------------------

describe('composeNotificationText()', () => {
  it('combines title + body when both present', () => {
    expect(composeNotificationText('DANA Bisnis', 'Pembayaran Rp 1.771')).toBe(
      'DANA Bisnis Pembayaran Rp 1.771'
    );
  });

  it('returns body only when title is empty', () => {
    expect(composeNotificationText('', 'Pembayaran Rp 1.771')).toBe('Pembayaran Rp 1.771');
  });

  it('returns title only when body is empty', () => {
    expect(composeNotificationText('DANA Bisnis', '')).toBe('DANA Bisnis');
  });

  it('returns null when both are empty', () => {
    expect(composeNotificationText('', '')).toBeNull();
  });
});
