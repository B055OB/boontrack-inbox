/**
 * @file __tests__/payment/multi_source_payment_detection.test.ts
 * @description Unit tests for Multi-Source Payment Detection, FSM Engine, and UU PDP Data Minimization.
 */

import { parseMandiriMutation } from '@/lib/paymentParsers/mandiriParser';
import { parseBsiMutation } from '@/lib/paymentParsers/bsiParser';
import { parseBcaMutation } from '@/lib/paymentParsers/bcaParser';
import { parseBankMutation } from '@/lib/paymentParsers';
import {
  computeMinimalEventHash,
  processPaymentMatch,
  recordPaymentObservation,
} from '@/lib/financial-state-machine';

// ---------------------------------------------------------------------------
// Mocks for Supabase Client
// ---------------------------------------------------------------------------

const mockOrdersDb: Record<string, any> = {};
const mockOutboxDb: any[] = [];
const mockObservationsDb: any[] = [];

jest.mock('@/lib/supabaseClient', () => {
  return {
    getSupabaseAdmin: jest.fn(() => ({
      rpc: jest.fn(() => Promise.reject(new Error('RPC_NOT_AVAILABLE_USE_FALLBACK'))),
      from: jest.fn((table: string) => {
        if (table === 'orders') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(function (col1: string, val1: any) {
                return {
                  eq: jest.fn(function (col2: string, val2: any) {
                    return {
                      eq: jest.fn(function (col3: string, val3: any) {
                        return {
                          gte: jest.fn(function (col4: string, val4: any) {
                            return {
                              lte: jest.fn(function () {
                                return {
                                  order: jest.fn(() => ({
                                    limit: jest.fn(() => {
                                      const matched = Object.values(mockOrdersDb).filter((o: any) => {
                                        const matchTenant = o.tenant_id === val1;
                                        const matchStatus = o.status === val2;
                                        const matchAmt = Number(o.total_amount) === Number(val3);
                                        const matchGte = new Date(o.created_at) >= new Date(val4);
                                        return matchTenant && matchStatus && matchAmt && matchGte;
                                      });
                                      return Promise.resolve({ data: matched, error: null });
                                    }),
                                  })),
                                };
                              }),
                              lt: jest.fn(function (col5: string, val5: any) {
                                return {
                                  order: jest.fn(() => ({
                                    limit: jest.fn(() => {
                                      const matched = Object.values(mockOrdersDb).filter((o: any) => {
                                        const matchTenant = o.tenant_id === val1;
                                        const matchStatus = o.status === val2;
                                        const matchAmt = Number(o.total_amount) === Number(val3);
                                        const matchGte = new Date(o.created_at) >= new Date(val4);
                                        const matchLt = new Date(o.created_at) < new Date(val5);
                                        return matchTenant && matchStatus && matchAmt && matchGte && matchLt;
                                      });
                                      return Promise.resolve({ data: matched, error: null });
                                    }),
                                  })),
                                };
                              }),
                            };
                          }),
                        };
                      }),
                      gte: jest.fn(function (col3: string, val3: any) {
                        return {
                          lte: jest.fn(function () {
                            return {
                              order: jest.fn(() => ({
                                limit: jest.fn(() => {
                                  const matched = Object.values(mockOrdersDb).filter((o: any) => {
                                    const matchTenant = o.tenant_id === val1;
                                    const matchStatus = o.status === val2;
                                    const matchGte = new Date(o.created_at) >= new Date(val3);
                                    return matchTenant && matchStatus && matchGte;
                                  });
                                  return Promise.resolve({ data: matched, error: null });
                                }),
                              })),
                            };
                          }),
                        };
                      }),
                    };
                  }),
                };
              }),
            })),
            update: jest.fn((updates: any) => ({
              eq: jest.fn((idCol: string, idVal: string) => {
                const chain: any = {
                  eq: jest.fn((statusCol: string, statusVal: string) => {
                    const existing = mockOrdersDb[idVal];
                    const matched = Boolean(existing && existing.status === statusVal);
                    if (matched) {
                      Object.assign(existing, updates);
                    }
                    const innerChain: any = {
                      select: jest.fn(() =>
                        Promise.resolve({
                          data: matched ? [existing] : [],
                          error: null,
                        })
                      ),
                      then: (resolve: any, reject: any) =>
                        Promise.resolve({
                          data: matched ? [existing] : [],
                          error: null,
                        }).then(resolve, reject),
                    };
                    return innerChain;
                  }),
                  then: (resolve: any, reject: any) => {
                    const existing = mockOrdersDb[idVal];
                    if (existing) {
                      Object.assign(existing, updates);
                    }
                    return Promise.resolve({ data: [existing].filter(Boolean), error: null }).then(resolve, reject);
                  },
                };
                return chain;
              }),
            })),
          };
        }

        if (table === 'payment_outbox') {
          return {
            insert: jest.fn((row: any) => {
              mockOutboxDb.push(row);
              return {
                select: jest.fn(() => ({
                  maybeSingle: jest.fn(() =>
                    Promise.resolve({ data: { id: 'outbox-uuid-123' }, error: null })
                  ),
                })),
              };
            }),
          };
        }

        if (table === 'payment_observations') {
          return {
            insert: jest.fn((row: any) => {
              const duplicate = mockObservationsDb.find(
                (o) => o.idempotency_key === row.idempotency_key
              );
              if (duplicate) {
                return {
                  select: jest.fn(() => ({
                    maybeSingle: jest.fn(() =>
                      Promise.resolve({
                        data: null,
                        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
                      })
                    ),
                  })),
                };
              }
              mockObservationsDb.push(row);
              return {
                select: jest.fn(() => ({
                  maybeSingle: jest.fn(() =>
                    Promise.resolve({ data: { id: 'obs-uuid-999' }, error: null })
                  ),
                })),
              };
            }),
          };
        }

        return {
          select: jest.fn(() => ({ eq: jest.fn() })),
        };
      }),
    })),
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('1. Whitelist Parser Stubs & UU PDP Data Minimization', () => {
  test('Mandiri Parser: extracts amount, ref, date and adheres to UU PDP (no balance/full account)', () => {
    const rawEmail = `
      Livin' by Mandiri - Notifikasi Dana Masuk
      Rekening Tujuan: *******1234
      Total Saldo: Rp 999.888.777,00 (RAHASIA)
      Nominal: IDR 150.000,00
      No. Referensi: MANDIRI-REF-20261004
      Tanggal: 04/10/2026 02:15:30
      Status: Berhasil
    `;

    const parsed = parseMandiriMutation(rawEmail);
    expect(parsed).not.toBeNull();
    expect(parsed?.amount).toBe(150000);
    expect(parsed?.referenceNumber).toBe('MANDIRI-REF-20261004');
    expect(parsed?.bank).toBe('MANDIRI');
    expect(parsed?.occurredAt).toBeInstanceOf(Date);

    // UU PDP Check: Ensure no balance or sensitive account fields exist in returned object
    const keys = Object.keys(parsed || {});
    expect(keys).toEqual(expect.arrayContaining(['amount', 'referenceNumber', 'occurredAt', 'bank']));
    expect((parsed as any).balance).toBeUndefined();
    expect((parsed as any).accountNumber).toBeUndefined();
    expect((parsed as any).rawBody).toBeUndefined();
  });

  test('Mandiri Parser: rejects debit notifications', () => {
    const debitEmail = `
      Livin' by Mandiri - Notifikasi Transaksi
      Tipe: DEBET
      Nominal: Rp 50.000
    `;
    expect(parseMandiriMutation(debitEmail)).toBeNull();
  });

  test('BSI Parser: extracts amount, ref (No. Jurnal), date', () => {
    const bsiText = `
      BSI Mobile - Notifikasi Transaksi Masuk
      Rekening: ********9876
      Jumlah: IDR 75.000,00
      No. Jurnal: BSI-JURNAL-776655
      Tanggal: 04-10-2026 02:10:00
      Saldo Akhir: Rp 5.000.000
    `;

    const parsed = parseBsiMutation(bsiText);
    expect(parsed).not.toBeNull();
    expect(parsed?.amount).toBe(75000);
    expect(parsed?.referenceNumber).toBe('BSI-JURNAL-776655');
    expect(parsed?.bank).toBe('BSI');
    expect(parsed?.occurredAt).toBeInstanceOf(Date);
  });

  test('BCA Parser: extracts amount, ref, date and works with dispatcher', () => {
    const bcaText = `
      BCA Notifikasi - Transaksi Transfer Masuk
      Nominal: Rp 250.000,00
      No. Transaksi: BCA-TRX-9821
      Tanggal: 04/10/2026 Jam: 02:20:15
    `;

    const parsed = parseBankMutation('BCA', bcaText);
    expect(parsed).not.toBeNull();
    expect(parsed?.amount).toBe(250000);
    expect(parsed?.referenceNumber).toBe('BCA-TRX-9821');
    expect(parsed?.bank).toBe('BCA');
  });
});

describe('2. Financial State Machine Engine & Atomic State Transitions', () => {
  const tenantId = 'tenant-uuid-111';

  beforeEach(() => {
    // Clear databases
    for (const key of Object.keys(mockOrdersDb)) {
      delete mockOrdersDb[key];
    }
    mockOutboxDb.length = 0;
    mockObservationsDb.length = 0;
  });

  test('Exact Match within 30 minutes: updates status to PAID and enqueues to payment_outbox', async () => {
    const now = new Date();
    const orderId = 'order-exact-1';

    // Insert pending order created 5 minutes ago
    mockOrdersDb[orderId] = {
      id: orderId,
      tenant_id: tenantId,
      total_amount: 150000,
      status: 'PENDING',
      created_at: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
    };

    const result = await processPaymentMatch({
      tenantId,
      amount: 150000,
      reference: 'MANDIRI-REF-1',
      occurredAt: now,
      source: 'EMAIL',
    });

    expect(result.success).toBe(true);
    expect(result.action).toBe('PAYMENT_CONFIRMED');
    expect(result.orderId).toBe(orderId);
    expect(result.affectedRows).toBe(1);

    // Verify order state mutated to PAID
    expect(mockOrdersDb[orderId].status).toBe('PAID');
    expect(mockOrdersDb[orderId].paid_at).toBeDefined();

    // Verify outbox record created
    expect(mockOutboxDb.length).toBe(1);
    expect(mockOutboxDb[0].aggregate_id).toBe(orderId);
    expect(mockOutboxDb[0].event_type).toBe('PAYMENT_CONFIRMED');
    expect(mockOutboxDb[0].payload.amount).toBe(150000);
  });

  test('Concurrent safe NO-OP: if order is already PAID (affected_rows == 0), safe NO-OP without duplicate outbox', async () => {
    const now = new Date();
    const orderId = 'order-already-paid';

    mockOrdersDb[orderId] = {
      id: orderId,
      tenant_id: tenantId,
      total_amount: 150000,
      status: 'PAID', // Already paid
      created_at: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
    };

    const result = await processPaymentMatch({
      tenantId,
      amount: 150000,
      reference: 'DUPLICATE-EVENT',
      occurredAt: now,
      source: 'READER',
    });

    // When status is already PAID, query for status=PENDING returns 0 matches
    expect(result.success).toBe(false);
    expect(mockOutboxDb.length).toBe(0);
  });

  test('Late Match (> 30 minutes, <= 2 hours): flags order with LATE_MATCH_PENDING_REVIEW, status remains PENDING', async () => {
    const now = new Date();
    const orderId = 'order-late-match';

    // Created 45 minutes ago
    mockOrdersDb[orderId] = {
      id: orderId,
      tenant_id: tenantId,
      total_amount: 150000,
      status: 'PENDING',
      created_at: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
    };

    const result = await processPaymentMatch({
      tenantId,
      amount: 150000,
      reference: 'LATE-TX-1',
      occurredAt: now,
      source: 'EMAIL',
    });

    expect(result.success).toBe(false);
    expect(result.action).toBe('FLAGGED_LATE_MATCH');
    expect(result.notes).toBe('LATE_MATCH_PENDING_REVIEW');
    expect(mockOrdersDb[orderId].status).toBe('PENDING'); // Status TETAP PENDING
    expect(mockOrdersDb[orderId].notes).toBe('LATE_MATCH_PENDING_REVIEW');
    expect(mockOutboxDb.length).toBe(0); // No auto outbox
  });

  test('Nominal Discrepancy within 2 hours: flags order with LATE_MATCH_PENDING_REVIEW, status remains PENDING', async () => {
    const now = new Date();
    const orderId = 'order-discrepancy';

    // Order expects 150000, but payment received is 149000
    mockOrdersDb[orderId] = {
      id: orderId,
      tenant_id: tenantId,
      total_amount: 150000,
      status: 'PENDING',
      created_at: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
    };

    const result = await processPaymentMatch({
      tenantId,
      amount: 149000, // Discrepancy!
      reference: 'DISCREPANCY-TX',
      occurredAt: now,
      source: 'READER',
    });

    expect(result.success).toBe(false);
    expect(result.action).toBe('FLAGGED_AMOUNT_DISCREPANCY');
    expect(result.notes).toBe('LATE_MATCH_PENDING_REVIEW');
    expect(mockOrdersDb[orderId].status).toBe('PENDING');
    expect(mockOrdersDb[orderId].notes).toBe('LATE_MATCH_PENDING_REVIEW');
    expect(mockOutboxDb.length).toBe(0);
  });
});

describe('3. Payment Observations & Idempotency Key Guard', () => {
  test('computeMinimalEventHash generates 64-char sha256 hash without sensitive fields', () => {
    const hash = computeMinimalEventHash({
      tenantId: 'tenant-1',
      provider: 'MANDIRI',
      amount: 100000,
      occurredAtIso: '2026-10-04T02:00:00.000Z',
      reference: 'REF-123',
    });

    expect(hash).toHaveLength(64);
    expect(typeof hash).toBe('string');
  });

  test('recordPaymentObservation inserts successfully and detects duplicate idempotency key', async () => {
    const obsInput = {
      tenantId: 'tenant-uuid-1',
      source: 'EMAIL' as const,
      provider: 'BCA' as const,
      amount: 250000,
      occurredAt: new Date(),
      externalReference: 'BCA-DUP-CHECK',
    };

    // First insert
    const res1 = await recordPaymentObservation(obsInput);
    expect(res1.success).toBe(true);
    expect(res1.duplicate).toBe(false);

    // Second insert with same reference & tenant -> triggers duplicate key handling
    const res2 = await recordPaymentObservation(obsInput);
    expect(res2.success).toBe(true);
    expect(res2.duplicate).toBe(true);
  });
});
