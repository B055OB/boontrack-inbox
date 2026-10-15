/**
 * __tests__/whatsapp/emergency_outbound_circuit_breaker.test.ts
 *
 * Acceptance Test Suite: Emergency Outbound Circuit Breaker & Bot Control Dispatch Gate (P0 HOTFIX)
 *
 * Acceptance Criteria:
 * 1. Scope Test: #off stops AI for Contact A, while Contact B receives normal responses.
 * 2. Tenant Test: #pause cancels all AI responses, including jobs already queued in worker.
 * 3. Fail-Closed Test: DB/Redis down during processing -> messages automatically SUPPRESSED, 0 AI messages leak.
 * 4. Race Condition Test: Pause issued right before worker dispatch -> newly dispatched messages aborted once pause confirmed.
 * 5. Identity Normalization & Echo Filter: Normalizes +62, 62, 08, JID to canonical identity; separates operator auth from echo filter.
 */

import {
  parseBotControlCommand,
  executeBotControl,
  setRuntimeSessionCache,
  clearRuntimeSessionCache,
  getRuntimeSessionCache,
} from '@/lib/whatsapp/bot-control-service';
import {
  toCanonicalPhone,
  normalizeRegistryPhone,
  isOperatorBotControlText,
  isBotOutbound,
  clearOutboundRegistry,
} from '@/lib/whatsapp/outbound-registry';
import {
  OutboxWorker,
  verifyBotDispatchGate,
  markSuppressed,
  isAiOutboxMessage,
  type OutboxDbClient,
} from '@/lib/outbox/worker';
import type { IProviderAdapter, OutboxMessage, SendResult } from '@/lib/outbox/types';

describe('[P0 HOTFIX] Emergency Outbound Circuit Breaker & Bot Control Dispatch Gate', () => {
  let mockTenant: any;
  let mockSessions: Record<string, any>;
  let mockConversations: Record<string, any>;
  let mockOutboxRows: Map<string, OutboxMessage>;
  let mockAdapter: IProviderAdapter;
  let sentMessages: OutboxMessage[];
  let dbOutage: boolean;

  // Mock DB Client conforming to OutboxDbClient
  let mockDb: OutboxDbClient;

  beforeEach(() => {
    clearRuntimeSessionCache();
    clearOutboundRegistry();

    sentMessages = [];
    dbOutage = false;

    mockTenant = {
      id: 'tenant-alpha-uuid',
      slug: 'tenant-alpha',
      bot_paused: false,
      is_bot_active: true,
      metadata: { bot_status: 'BOT_ACTIVE' },
    };

    mockSessions = {};
    mockConversations = {};
    mockOutboxRows = new Map();

    mockAdapter = {
      send: jest.fn(async (message: OutboxMessage): Promise<SendResult> => {
        sentMessages.push(message);
        return { success: true, messageId: `wa-msg-${Date.now()}-${Math.random()}` };
      }),
    };

    mockDb = {
      rpc: jest.fn(async (fnName: string, args: Record<string, unknown> = {}) => {
        if (dbOutage) {
          return { data: null, error: { message: 'Database connection failed (ECONNREFUSED)' } };
        }

        if (fnName === 'claim_outbox_batch') {
          const batchSize = (args.batch_size as number) || 10;
          const claimed: OutboxMessage[] = [];
          for (const [, row] of mockOutboxRows) {
            if (claimed.length >= batchSize) break;
            if (row.status === 'PENDING') {
              row.status = 'PROCESSING';
              claimed.push({ ...row });
            }
          }
          return { data: claimed, error: null };
        }

        if (fnName === 'mark_outbox_sent') {
          const row = mockOutboxRows.get(args.p_id as string);
          if (row) {
            row.status = 'SENT';
            row.sent_at = new Date().toISOString();
          }
          return { data: null, error: null };
        }

        if (fnName === 'mark_outbox_retry') {
          const row = mockOutboxRows.get(args.p_id as string);
          if (row) {
            row.status = 'DEAD_LETTER';
            row.last_error = args.p_error as string;
            row.error_log = args.p_error as string;
            row.failed_at = new Date().toISOString();
          }
          return { data: null, error: null };
        }

        if (fnName === 'mark_outbox_suppressed') {
          const row = mockOutboxRows.get(args.p_id as string);
          if (row) {
            row.status = 'SUPPRESSED';
            row.last_error = `[SUPPRESSED] ${args.p_reason}`;
            row.error_log = `[SUPPRESSED] ${args.p_reason}`;
            row.failed_at = new Date().toISOString();
          }
          return { data: null, error: null };
        }

        return { data: null, error: { message: `Unknown RPC: ${fnName}` } };
      }),

      from: jest.fn((table: string) => {
        if (dbOutage) {
          throw new Error('Database connection failed (ECONNREFUSED)');
        }

        if (table === 'tenants') {
          return {
            select: jest.fn(() => ({
              or: jest.fn(() => ({
                maybeSingle: jest.fn(async () => {
                  if (dbOutage) throw new Error('Database connection failed (ECONNREFUSED)');
                  return { data: mockTenant, error: null };
                }),
              })),
            })),
            update: jest.fn((updateData: any) => ({
              or: jest.fn(async () => {
                if (dbOutage) throw new Error('Database connection failed (ECONNREFUSED)');
                Object.assign(mockTenant, updateData);
                return { data: mockTenant, error: null };
              }),
            })),
          };
        }

        if (table === 'conversation_sessions') {
          return {
            select: jest.fn(() => ({
              or: jest.fn(() => ({
                in: jest.fn((_col: string, phones: string[]) => ({
                  limit: jest.fn(async () => {
                    if (dbOutage) throw new Error('Database connection failed (ECONNREFUSED)');
                    const found = phones
                      .map((p) => mockSessions[p])
                      .filter(Boolean);
                    return { data: found, error: null };
                  }),
                })),
              })),
            })),
            upsert: jest.fn(async (sessionData: any) => {
              if (dbOutage) throw new Error('Database connection failed (ECONNREFUSED)');
              const phone = sessionData.user_identifier;
              mockSessions[phone] = { ...(mockSessions[phone] || {}), ...sessionData };
              return { data: mockSessions[phone], error: null };
            }),
            update: jest.fn((updateData: any) => ({
              eq: jest.fn(async (_col: string, val: string) => {
                if (dbOutage) throw new Error('Database connection failed (ECONNREFUSED)');
                for (const phone in mockSessions) {
                  if (mockSessions[phone].session_id === val) {
                    Object.assign(mockSessions[phone], updateData);
                  }
                }
                return { data: updateData, error: null };
              }),
            })),
          };
        }

        if (table === 'conversations') {
          return {
            select: jest.fn(() => ({
              or: jest.fn(() => ({
                in: jest.fn((_col: string, phones: string[]) => ({
                  limit: jest.fn(async () => {
                    if (dbOutage) throw new Error('Database connection failed (ECONNREFUSED)');
                    const found = phones
                      .map((p) => mockConversations[p])
                      .filter(Boolean);
                    return { data: found, error: null };
                  }),
                })),
              })),
            })),
            update: jest.fn((updateData: any) => ({
              or: jest.fn(() => ({
                in: jest.fn(async (_col: string, phones: string[]) => {
                  if (dbOutage) throw new Error('Database connection failed (ECONNREFUSED)');
                  for (const p of phones) {
                    if (mockConversations[p]) {
                      Object.assign(mockConversations[p], updateData);
                    }
                  }
                  return { data: updateData, error: null };
                }),
              })),
            })),
          };
        }

        if (table === 'message_outbox') {
          return {
            update: jest.fn((updateData: any) => ({
              eq: jest.fn(async (_col: string, id: string) => {
                const row = mockOutboxRows.get(id);
                if (row) {
                  Object.assign(row, updateData);
                }
                return { data: row, error: null };
              }),
            })),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };
  });

  // Helper to insert outbox message
  function enqueueMockOutbox(params: {
    id: string;
    recipientPhone: string;
    isAi?: boolean;
    controlVersion?: number;
    body?: string;
  }): OutboxMessage {
    const msg: OutboxMessage = {
      id: params.id,
      tenant_id: 'tenant-alpha-uuid',
      channel: 'WHATSAPP',
      phone_number_id: 'phone-123',
      recipient_phone: params.recipientPhone,
      recipient: params.recipientPhone,
      payload: {
        type: 'text',
        text: { body: params.body || 'AI reply message' },
        is_ai: params.isAi !== false,
        control_version: params.controlVersion,
      },
      status: 'PENDING',
      idempotency_key: `key-${params.id}`,
      retry_count: 0,
      max_retries: 3,
      last_error: null,
      scheduled_at: new Date().toISOString(),
      sent_at: null,
      failed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockOutboxRows.set(params.id, msg);
    return msg;
  }

  // -------------------------------------------------------------------------
  // Test 1: Parser Scope Differentiation (#off vs #pause)
  // -------------------------------------------------------------------------
  describe('1. Command Parser Scope Test (#off vs #pause)', () => {
    it('parses #off, !off, /off, off as CONTACT scope PAUSE', () => {
      const variations = ['#off', '!off', '/off', 'off', '#OFF', ' /off '];
      for (const cmd of variations) {
        const parsed = parseBotControlCommand(cmd);
        expect(parsed).toEqual({ action: 'PAUSE', scope: 'CONTACT' });
      }
    });

    it('parses #on, !on, /on, on as CONTACT scope RESUME', () => {
      const variations = ['#on', '!on', '/on', 'on', '#ON', ' !on '];
      for (const cmd of variations) {
        const parsed = parseBotControlCommand(cmd);
        expect(parsed).toEqual({ action: 'RESUME', scope: 'CONTACT' });
      }
    });

    it('parses #pause, !pause, /pause, pause as TENANT scope PAUSE', () => {
      const variations = ['#pause', '!pause', '/pause', 'pause', '#PAUSE', ' /pause '];
      for (const cmd of variations) {
        const parsed = parseBotControlCommand(cmd);
        expect(parsed).toEqual({ action: 'PAUSE', scope: 'TENANT' });
      }
    });

    it('parses #resume, !resume, /resume, resume as TENANT scope RESUME', () => {
      const variations = ['#resume', '!resume', '/resume', 'resume', '#RESUME', ' !resume '];
      for (const cmd of variations) {
        const parsed = parseBotControlCommand(cmd);
        expect(parsed).toEqual({ action: 'RESUME', scope: 'TENANT' });
      }
    });

    it('returns null for general customer text and does not misidentify', () => {
      expect(parseBotControlCommand('Halo saya mau pesan off white shoes')).toBeNull();
      expect(parseBotControlCommand('Bisa pause pesanan saya?')).toBeNull();
      expect(parseBotControlCommand('Mohon info harga')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Test 2: Acceptance Criteria - Scope Test (Contact A paused vs Contact B active)
  // -------------------------------------------------------------------------
  describe('2. Scope Test: #off stops AI for Contact A while Contact B gets normal response', () => {
    it('#off locks AI only for target Contact A, allowing Contact B to be dispatched', async () => {
      const contactA = '628111111111';
      const contactB = '628222222222';

      // Execute #off for Contact A
      const parsedCmd = parseBotControlCommand('#off');
      expect(parsedCmd).toEqual({ action: 'PAUSE', scope: 'CONTACT' });

      // Contact A is paused
      mockSessions[contactA] = {
        session_id: `wa_session_${contactA}`,
        is_paused: true,
        current_state: 'HUMAN_PAUSED',
        bot_status: 'HUMAN_PAUSED',
        paused_until: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      };
      mockConversations[contactA] = {
        id: 'conv-a-id',
        bot_paused: true,
        is_paused: true,
        is_bot_active: false,
        bot_mode: 'HUMAN_ACTIVE',
        status: 'HUMAN_PAUSED',
      };
      setRuntimeSessionCache({
        tenantId: 'tenant-alpha-uuid',
        userIdentifier: contactA,
        isPaused: true,
        botStatus: 'HUMAN_PAUSED',
      });

      // Contact B is ACTIVE (not paused)
      mockSessions[contactB] = {
        session_id: `wa_session_${contactB}`,
        is_paused: false,
        current_state: 'ACTIVE',
        bot_status: 'BOT_ACTIVE',
      };
      mockConversations[contactB] = {
        id: 'conv-b-id',
        bot_paused: false,
        is_paused: false,
        is_bot_active: true,
        bot_mode: 'AI_ACTIVE',
        status: 'active',
      };

      // Enqueue AI messages for both contacts
      enqueueMockOutbox({ id: 'msg-contact-a', recipientPhone: contactA, isAi: true });
      enqueueMockOutbox({ id: 'msg-contact-b', recipientPhone: contactB, isAi: true });

      // Run Outbox Worker
      const worker = new OutboxWorker({ batchSize: 10 });
      const summary = await worker.runOnce(mockAdapter, mockDb);

      // Verify outcomes: Contact A SUPPRESSED, Contact B SENT
      expect(summary.claimed).toBe(2);
      expect(summary.sent).toBe(1);
      expect(summary.suppressed).toBe(1);

      // Verify Contact A row is SUPPRESSED
      const rowA = mockOutboxRows.get('msg-contact-a');
      expect(rowA?.status).toBe('SUPPRESSED');
      expect(rowA?.last_error).toMatch(/SESSION_PAUSED|CONTACT_/);

      // Verify Contact B row is SENT
      const rowB = mockOutboxRows.get('msg-contact-b');
      expect(rowB?.status).toBe('SENT');

      // Verify provider adapter sent message ONLY for Contact B
      expect(sentMessages.length).toBe(1);
      expect(sentMessages[0].recipient_phone).toBe(contactB);
    });
  });

  // -------------------------------------------------------------------------
  // Test 3: Acceptance Criteria - Tenant Test (#pause cancels queued AI jobs)
  // -------------------------------------------------------------------------
  describe('3. Tenant Test: #pause cancels all AI responses including queued jobs', () => {
    it('#pause cancels all pending AI messages in worker queue without sending any', async () => {
      // 3 AI jobs already queued in worker
      enqueueMockOutbox({ id: 'job-1', recipientPhone: '628100000001', isAi: true });
      enqueueMockOutbox({ id: 'job-2', recipientPhone: '628100000002', isAi: true });
      enqueueMockOutbox({ id: 'job-3', recipientPhone: '628100000003', isAi: true });

      // Operator activates tenant-wide #pause
      const parsedCmd = parseBotControlCommand('#pause');
      expect(parsedCmd).toEqual({ action: 'PAUSE', scope: 'TENANT' });

      mockTenant.bot_paused = true;
      mockTenant.is_bot_active = false;
      mockTenant.metadata.bot_status = 'BOT_DISABLED';

      setRuntimeSessionCache({
        tenantId: 'tenant-alpha-uuid',
        isPaused: true,
        botStatus: 'BOT_DISABLED',
      });

      // Run worker
      const worker = new OutboxWorker({ batchSize: 10 });
      const summary = await worker.runOnce(mockAdapter, mockDb);

      // Verify: ALL 3 jobs suppressed, 0 sent
      expect(summary.claimed).toBe(3);
      expect(summary.sent).toBe(0);
      expect(summary.suppressed).toBe(3);

      expect(mockOutboxRows.get('job-1')?.status).toBe('SUPPRESSED');
      expect(mockOutboxRows.get('job-2')?.status).toBe('SUPPRESSED');
      expect(mockOutboxRows.get('job-3')?.status).toBe('SUPPRESSED');

      // 0 messages reached provider adapter
      expect(sentMessages.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Test 4: Acceptance Criteria - Fail-Closed Test (DB / Redis outage)
  // -------------------------------------------------------------------------
  describe('4. Fail-Closed Test: DB/Redis down -> message automatically SUPPRESSED', () => {
    it('suppresses AI outbound message when database connection fails before dispatch', async () => {
      enqueueMockOutbox({ id: 'job-fail-closed', recipientPhone: '628199999999', isAi: true });

      // Simulate Database outage
      dbOutage = true;

      // Run worker
      const worker = new OutboxWorker({ batchSize: 10 });
      const summary = await worker.runOnce(mockAdapter, mockDb);

      // Worker couldn't claim or dispatch, 0 messages sent
      expect(summary.sent).toBe(0);
      expect(sentMessages.length).toBe(0);
    });

    it('verifyBotDispatchGate directly returns FAIL-CLOSED when DB query errors', async () => {
      const msg = enqueueMockOutbox({ id: 'job-direct', recipientPhone: '628199999999', isAi: true });

      // DB error simulation on table query
      const brokenDb = {
        from: jest.fn(() => {
          throw new Error('Redis connection refused / DB pool timeout');
        }),
        rpc: jest.fn(async () => ({ data: null, error: { message: 'DB down' } })),
      } as unknown as OutboxDbClient;

      const result = await verifyBotDispatchGate(brokenDb, msg);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('FAIL_CLOSED');
      expect(sentMessages.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Test 5: Acceptance Criteria - Race Condition Test
  // -------------------------------------------------------------------------
  describe('5. Race Condition Test: Pause issued right before worker dispatch', () => {
    it('aborts dispatch when control version has incremented since job creation', async () => {
      // Job was enqueued under control version 1
      const msg = enqueueMockOutbox({
        id: 'job-race',
        recipientPhone: '628188888888',
        isAi: true,
        controlVersion: 1,
      });

      // Operator issued #pause right before dispatch -> version bumped to 2
      setRuntimeSessionCache({
        tenantId: 'tenant-alpha-uuid',
        isPaused: true,
        botStatus: 'BOT_DISABLED',
      });
      // The cache version is now 1 or higher; update version monotonically
      const state = getRuntimeSessionCache('tenant-alpha-uuid');
      if (state) state.version = 2;

      // Gate check
      const result = await verifyBotDispatchGate(mockDb, msg);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('TENANT_GLOBAL_PAUSED_CACHE');
    });

    it('aborts dispatch if control version changed even if tenant appears active in DB read lag', async () => {
      // Job created at version 1
      const msg = enqueueMockOutbox({
        id: 'job-race-version',
        recipientPhone: '628188888888',
        isAi: true,
        controlVersion: 1,
      });

      // Cache records monotonic bump to version 3
      setRuntimeSessionCache({
        tenantId: 'tenant-alpha-uuid',
        isPaused: false, // temporarily resumed or in-flight mutation
      });
      const state = getRuntimeSessionCache('tenant-alpha-uuid');
      if (state) state.version = 3;

      const result = await verifyBotDispatchGate(mockDb, msg);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('CONTROL_VERSION_CHANGED');
    });
  });

  // -------------------------------------------------------------------------
  // Test 6: Identity Normalization & Echo Filter Decoupling
  // -------------------------------------------------------------------------
  describe('6. Identity Normalization & Echo Filter', () => {
    it('normalizes +62, 62, 08, and JID formats to canonical identity', () => {
      const expected = '628123456789';

      expect(toCanonicalPhone('+628123456789')).toBe(expected);
      expect(toCanonicalPhone('628123456789')).toBe(expected);
      expect(toCanonicalPhone('08123456789')).toBe(expected);
      expect(toCanonicalPhone('8123456789')).toBe(expected);
      expect(toCanonicalPhone('+62 812-3456-789')).toBe(expected);
      expect(toCanonicalPhone('628123456789@s.whatsapp.net')).toBe(expected);
      expect(toCanonicalPhone('628123456789:0@s.whatsapp.net')).toBe(expected);
      expect(toCanonicalPhone('08123456789@c.us')).toBe(expected);
    });

    it('strictly separates operator commands from echo detection', () => {
      expect(isOperatorBotControlText('#pause')).toBe(true);
      expect(isOperatorBotControlText('#off')).toBe(true);
      expect(isOperatorBotControlText('!resume')).toBe(true);
      expect(isOperatorBotControlText('/on')).toBe(true);
      expect(isOperatorBotControlText('pause')).toBe(true);
      expect(isOperatorBotControlText('off')).toBe(true);
      expect(isOperatorBotControlText('halo bot')).toBe(false);

      // Operator command is NEVER matched as an outbound echo
      const echoCheck = isBotOutbound({
        tenantId: 'tenant-alpha',
        messageId: 'some-msg-id',
        recipientPhone: '628111111111',
        text: '#pause',
      });
      expect(echoCheck).toBe(false);
    });
  });
});
