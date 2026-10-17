import {
  registerBotOutbound,
  isRegisteredOutboundMessage,
  isBotOutbound,
  clearOutboundRegistry,
} from '@/lib/whatsapp/outbound-registry';
import {
  parseBotControlCommand,
  executeBotControl,
  updateBotState,
  resumeBotState,
  evaluateBotStateTimeout,
  checkRuntimeBotDecisionGate,
  clearRuntimeSessionCache,
} from '@/lib/whatsapp/bot-control-service';
import { processEvolutionWebhookEvent } from '@/lib/whatsapp/evolution-webhook-handler';
import { GET, POST } from '@/app/api/v1/tenants/[slug]/bot-control/route';
import { NextRequest } from 'next/server';

// Global mocks
global.fetch = jest.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ key: { id: 'EVO-AUTO-RESP-123' } }),
    text: () => Promise.resolve('ok'),
  })
);

describe('CTO Directive Verification: False Self-Lock & Bot Control State Machine (TASK-101 to TASK-104)', () => {
  const tenantId = 'e2e-tenant-uuid-101';
  const tenantSlug = 'toko-audit-test';
  const customerPhone = '6281234567890';
  const botNumber = '6289999999999';

  let mockConversationsTable: any[] = [];
  let mockSessionsTable: any[] = [];
  let mockTenantsTable: any[] = [];
  let mockConnectionsTable: any[] = [];
  let mockOutboundTable: any[] = [];

  const createMockSupabase = () => {
    return {
      auth: {
        getUser: jest.fn().mockImplementation(async (token: string) => {
          if (token === 'valid-owner-jwt-token' || token === 'valid-token') {
            return {
              data: {
                user: {
                  id: 'owner-uuid-101',
                  email: 'owner@tenant.com',
                },
              },
              error: null,
            };
          }
          return { data: { user: null }, error: { message: 'Invalid token' } };
        }),
      },
      rpc: jest.fn().mockImplementation((fnName: string, args: any) => {
        if (fnName === 'fn_toggle_bot_session_state') {
          const isPaused = args.p_is_paused;
          const targetPhone = args.p_customer_phone;
          const pausedUntil = args.p_paused_until;
          const source = args.p_source || 'rpc_test';

          if (args.p_scope === 'tenant') {
            const t = mockTenantsTable.find((x) => x.id === args.p_tenant_id || x.slug === args.p_tenant_id);
            if (t) {
              t.bot_paused = isPaused;
              t.is_bot_active = !isPaused;
              t.metadata = { ...(t.metadata || {}), bot_status: isPaused ? 'BOT_DISABLED' : 'BOT_ENABLED', paused_until: pausedUntil, paused_by: source };
            }
            if (isPaused) {
              mockConversationsTable.forEach((c) => {
                if (!c.pause_reason || c.pause_reason !== 'HUMAN_HANDOVER') {
                  c.bot_paused = true;
                  c.is_paused = true;
                  c.is_bot_paused = true;
                  c.is_bot_active = false;
                  c.paused_until = pausedUntil;
                  c.pause_reason = 'TENANT_DISABLED';
                  c.last_state_updated_by = source;
                }
              });
              mockSessionsTable.forEach((s) => {
                if (!s.pause_reason || s.pause_reason !== 'HUMAN_HANDOVER') {
                  s.is_paused = true;
                  s.bot_status = 'BOT_DISABLED';
                  s.paused_until = pausedUntil;
                  s.pause_reason = 'TENANT_DISABLED';
                  s.paused_by = source;
                }
              });
            } else {
              // Reconcile ONLY sessions/conversations with pause_reason = 'TENANT_DISABLED'
              mockConversationsTable.forEach((c) => {
                if (c.pause_reason === 'TENANT_DISABLED') {
                  c.bot_paused = false;
                  c.is_paused = false;
                  c.is_bot_paused = false;
                  c.is_bot_active = true;
                  c.paused_until = null;
                  c.pause_reason = null;
                }
              });
              mockSessionsTable.forEach((s) => {
                if (s.pause_reason === 'TENANT_DISABLED') {
                  s.is_paused = false;
                  s.current_state = 'BOT_ACTIVE';
                  s.bot_status = 'BOT_ACTIVE';
                  s.paused_until = null;
                  s.pause_reason = null;
                }
              });
            }
          } else {
            // Conversation update
            const c = mockConversationsTable.find(
              (x) => (targetPhone && x.customer_phone === targetPhone) || x.id === args.p_conversation_id || mockConversationsTable.length === 1
            );
            if (c) {
              c.bot_paused = isPaused;
              c.is_paused = isPaused;
              c.is_bot_paused = isPaused;
              c.is_bot_active = !isPaused;
              c.paused_until = isPaused ? pausedUntil : null;
              c.last_state_updated_by = source;
            }
            const s = mockSessionsTable.find((x) => (targetPhone && x.user_identifier === targetPhone) || mockSessionsTable.length === 1);
            if (s) {
              s.is_paused = isPaused;
              s.bot_status = isPaused ? 'HUMAN_HANDOVER' : 'AI_ACTIVE';
              s.paused_until = isPaused ? pausedUntil : null;
              s.paused_by = source;
            }
          }
          return Promise.resolve({ data: { success: true }, error: null });
        }
        return Promise.resolve({ data: null, error: { message: 'RPC not mocked' } });
      }),
      from: jest.fn().mockImplementation((table: string) => {
        const queryState: any = {
          filters: [] as any[],
          selected: '*',
          limitVal: null as number | null,
        };

        const builder: any = {
          select: jest.fn().mockImplementation((cols: string = '*') => {
            queryState.selected = cols;
            return builder;
          }),
          eq: jest.fn().mockImplementation((field: string, val: any) => {
            queryState.filters.push({ field, op: 'eq', val });
            return builder;
          }),
          or: jest.fn().mockImplementation((cond: string) => {
            queryState.filters.push({ op: 'or', cond });
            return builder;
          }),
          in: jest.fn().mockImplementation((field: string, vals: any[]) => {
            queryState.filters.push({ field, op: 'in', vals });
            return builder;
          }),
          gte: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockImplementation((n: number) => {
            queryState.limitVal = n;
            return builder;
          }),
          maybeSingle: jest.fn().mockImplementation(() => {
            const list = getTableData(table);
            const matched = filterList(list, queryState.filters);
            return Promise.resolve({ data: matched[0] || null, error: null });
          }),
          single: jest.fn().mockImplementation(() => {
            const list = getTableData(table);
            const matched = filterList(list, queryState.filters);
            if (matched.length > 0) return Promise.resolve({ data: matched[0], error: null });
            return Promise.resolve({ data: null, error: { message: 'Row not found' } });
          }),
          update: jest.fn().mockImplementation((payload: any) => {
            const updateBuilder: any = {
              eq: jest.fn().mockImplementation((f: string, v: any) => {
                queryState.filters.push({ field: f, op: 'eq', val: v });
                applyUpdate(table, queryState.filters, payload);
                return Promise.resolve({ data: null, error: null });
              }),
              or: jest.fn().mockImplementation((cond: string) => {
                queryState.filters.push({ op: 'or', cond });
                applyUpdate(table, queryState.filters, payload);
                return Promise.resolve({ data: null, error: null });
              }),
              in: jest.fn().mockImplementation((f: string, vs: any[]) => {
                queryState.filters.push({ field: f, op: 'in', vals: vs });
                applyUpdate(table, queryState.filters, payload);
                return Promise.resolve({ data: null, error: null });
              }),
              then: (resolve: any) => {
                applyUpdate(table, queryState.filters, payload);
                return Promise.resolve(resolve({ data: null, error: null }));
              },
            };
            return updateBuilder;
          }),
          insert: jest.fn().mockImplementation((payload: any) => {
            const item = Array.isArray(payload) ? payload[0] : payload;
            const fullItem = { id: `auto-${Date.now()}`, ...item };
            const list = getTableData(table);
            list.push(fullItem);
            return Promise.resolve({ data: fullItem, error: null });
          }),
          upsert: jest.fn().mockImplementation((payload: any) => {
            const item = Array.isArray(payload) ? payload[0] : payload;
            const list = getTableData(table);
            const existingIdx = list.findIndex(
              (x) => x.tenant_id === item.tenant_id && x.user_identifier === item.user_identifier
            );
            if (existingIdx >= 0) {
              list[existingIdx] = { ...list[existingIdx], ...item };
            } else {
              list.push({ id: `session-${Date.now()}`, ...item });
            }
            return Promise.resolve({ data: item, error: null });
          }),
        };

        // Support direct await on builder
        builder.then = (resolve: any) => {
          const list = getTableData(table);
          const matched = filterList(list, queryState.filters);
          return Promise.resolve(resolve({ data: matched, error: null }));
        };

        return builder;
      }),
    };
  };

  function getTableData(table: string): any[] {
    if (table === 'conversations') return mockConversationsTable;
    if (table === 'conversation_sessions') return mockSessionsTable;
    if (table === 'tenants') return mockTenantsTable;
    if (table === 'whatsapp_connections') return mockConnectionsTable;
    if (table === 'outbound_messages') return mockOutboundTable;
    return [];
  }

  function filterList(list: any[], filters: any[]): any[] {
    return list.filter((item) => {
      for (const f of filters) {
        if (f.op === 'eq' && item[f.field] !== f.val) return false;
        if (f.op === 'in' && !f.vals.includes(item[f.field])) return false;
      }
      return true;
    });
  }

  function applyUpdate(table: string, filters: any[], payload: any) {
    const list = getTableData(table);
    for (const item of list) {
      let match = true;
      for (const f of filters) {
        if (f.op === 'eq' && item[f.field] !== f.val) match = false;
        if (f.op === 'in' && !f.vals.includes(item[f.field])) match = false;
      }
      if (match) {
        Object.assign(item, payload);
      }
    }
  }

  beforeEach(() => {
    clearOutboundRegistry();
    clearRuntimeSessionCache();
    mockConversationsTable = [
      {
        id: 'conv-101',
        tenant_id: tenantId,
        tenant_slug: tenantSlug,
        customer_phone: customerPhone,
        is_bot_active: true,
        bot_paused: false,
        is_paused: false,
        is_bot_paused: false,
        paused_until: null,
        last_state_updated_by: null,
        status: 'active',
        bot_mode: 'AI_ACTIVE',
      },
    ];
    mockSessionsTable = [
      {
        id: 'sess-101',
        tenant_id: tenantId,
        user_identifier: customerPhone,
        current_state: 'ACTIVE',
        bot_status: 'AI_ACTIVE',
        is_paused: false,
        paused_until: null,
        paused_by: null,
      },
    ];
    mockTenantsTable = [
      {
        id: tenantId,
        slug: tenantSlug,
        user_id: 'owner-uuid-101',
        owner_id: 'owner-uuid-101',
        phone: botNumber,
        whatsapp_number: botNumber,
        bot_paused: false,
        is_bot_active: true,
        metadata: {
          bot_status: 'BOT_ENABLED',
          admin_phone: botNumber,
        },
      },
    ];
    mockConnectionsTable = [
      {
        id: 'conn-101',
        tenant_id: tenantId,
        instance_name: 'test-instance',
        phone_number: botNumber,
        credential_ref: 'test-api-key',
        provider: 'EVOLUTION',
        status: 'CONNECTED',
      },
    ];
    mockOutboundTable = [];
  });

  describe('TASK-101 & TASK-102: Ingress Webhook & Outbound Registry Guard', () => {
    it('drops registered outbound message echo (key.fromMe = true) immediately without triggering self-lock', async () => {
      const mockSupabase = createMockSupabase();
      const outboundMessageId = 'BAE5-BOT-OUTBOUND-101';

      // 1. Register bot outbound message in registry (simulates sendEvolutionTextMessage / Outbox dispatch)
      registerBotOutbound({
        tenantId,
        messageId: outboundMessageId,
        recipientPhone: customerPhone,
        text: 'Halo! Ada yang bisa kami bantu?',
        source: 'bot',
      });

      expect(isRegisteredOutboundMessage(outboundMessageId, tenantId)).toBe(true);

      // 2. Incoming webhook echo with key.fromMe = true
      const echoPayload = {
        event: 'messages.upsert',
        instance: 'test-instance',
        data: {
          key: {
            remoteJid: `${customerPhone}@s.whatsapp.net`,
            fromMe: true,
            id: outboundMessageId,
          },
          message: {
            conversation: 'Halo! Ada yang bisa kami bantu?',
          },
        },
      };

      const result = await processEvolutionWebhookEvent(echoPayload, 'test-instance', mockSupabase);

      // 3. Verify echo was dropped as NO-OP (HTTP 200 OK semantics)
      expect(result.success).toBe(true);
      expect(result.processed).toBe(0);

      // 4. VERIFY: Bot state did NOT change to paused (False Self-Lock PREVENTED!)
      const conversation = mockConversationsTable[0];
      expect(conversation.is_bot_active).toBe(true);
      expect(conversation.is_paused).toBe(false);
      expect(conversation.bot_paused).toBe(false);
      expect(conversation.paused_until).toBeNull();
    });

    it('drops echo even when text contains "#pause" if messageId was registered as bot outbound', async () => {
      const mockSupabase = createMockSupabase();
      const botMessageId = 'BAE5-BOT-CONTAINS-CMD-102';

      // Bot sent a reply explaining "#pause" command to user
      registerBotOutbound({
        tenantId,
        messageId: botMessageId,
        recipientPhone: customerPhone,
        text: 'Ketik #pause untuk berbicara dengan customer service.',
        source: 'bot',
      });

      const echoPayload = {
        event: 'messages.upsert',
        instance: 'test-instance',
        data: {
          key: {
            remoteJid: `${customerPhone}@s.whatsapp.net`,
            fromMe: true,
            id: botMessageId,
          },
          message: {
            conversation: 'Ketik #pause untuk berbicara dengan customer service.',
          },
        },
      };

      await processEvolutionWebhookEvent(echoPayload, 'test-instance', mockSupabase);

      // Verify bot did NOT parse its own text as an operator command or pause itself
      const conversation = mockConversationsTable[0];
      expect(conversation.is_bot_active).toBe(true);
      expect(conversation.is_paused).toBe(false);
      expect(conversation.paused_until).toBeNull();
    });
  });

  describe('TASK-103: Unified State Machine (Command vs Toggle UI)', () => {
    it('parses "#pause 30" command and sets paused_until to now() + 30 minutes', () => {
      const cmd = parseBotControlCommand('#pause 30');
      expect(cmd).not.toBeNull();
      expect(cmd?.action).toBe('PAUSE');
      expect(cmd?.scope).toBe('CONTACT');
      expect(cmd?.durationMinutes).toBe(30);

      const cmdMins = parseBotControlCommand('/pause 45 menit');
      expect(cmdMins?.durationMinutes).toBe(45);
    });

    it('mutates DB identically via updateBotState for chat command and UI toggle', async () => {
      const mockSupabase = createMockSupabase();

      // 1. Operator executes chat command: #pause 30
      const commandResult = await updateBotState({
        conversationId: 'conv-101',
        tenantId,
        tenantSlug,
        action: 'PAUSE',
        durationMinutes: 30,
        customerPhone,
        userRole: 'cs',
        source: 'admin_command',
        supabase: mockSupabase,
      });

      expect(commandResult.success).toBe(true);
      expect(commandResult.bot_paused).toBe(true);
      expect(commandResult.is_bot_active).toBe(false);
      expect(commandResult.paused_until).toBeDefined();

      const pauseDate = new Date(commandResult.paused_until!);
      const expectedMinDate = new Date(Date.now() + 29 * 60 * 1000);
      const expectedMaxDate = new Date(Date.now() + 31 * 60 * 1000);
      expect(pauseDate.getTime()).toBeGreaterThanOrEqual(expectedMinDate.getTime());
      expect(pauseDate.getTime()).toBeLessThanOrEqual(expectedMaxDate.getTime());

      // Check DB conversation row
      const convAfterCommand = mockConversationsTable[0];
      expect(convAfterCommand.is_bot_active).toBe(false);
      expect(convAfterCommand.is_paused).toBe(true);
      expect(convAfterCommand.paused_until).toBe(commandResult.paused_until);
      expect(convAfterCommand.last_state_updated_by).toBe('admin_command');

      // 2. CS toggles bot back ON via UI toggle endpoint calling updateBotState
      const uiResumeResult = await updateBotState({
        conversationId: 'conv-101',
        tenantId,
        tenantSlug,
        action: 'RESUME',
        customerPhone,
        userRole: 'cs',
        source: 'cs_dashboard_toggle',
        supabase: mockSupabase,
      });

      expect(uiResumeResult.success).toBe(true);
      expect(uiResumeResult.bot_paused).toBe(false);
      expect(uiResumeResult.is_bot_active).toBe(true);

      const convAfterResume = mockConversationsTable[0];
      expect(convAfterResume.is_bot_active).toBe(true);
      expect(convAfterResume.is_paused).toBe(false);
      expect(convAfterResume.paused_until).toBeNull();
      expect(convAfterResume.last_state_updated_by).toBe('cs_dashboard_toggle');
    });

    it('synchronizes status in GET /api/v1/tenants/[slug]/bot-control with database state', async () => {
      const mockSupabase = createMockSupabase();

      // Pause via updateBotState for 60 minutes
      await updateBotState({
        conversationId: 'conv-101',
        tenantId,
        tenantSlug,
        action: 'PAUSE',
        durationMinutes: 60,
        customerPhone,
        userRole: 'owner',
        source: 'test_sync',
        supabase: mockSupabase,
      });

      // Mock getSupabaseAdmin in route
      jest.spyOn(require('@/lib/supabaseClient'), 'getSupabaseAdmin').mockReturnValue(mockSupabase);

      // Verify GET returns paused_until, pause_reason, and last_state_updated_by for the conversation
      const req = new NextRequest(
        `https://boontrack.com/api/v1/tenants/${tenantSlug}/bot-control?conversation_id=conv-101`,
        {
          headers: {
            authorization: 'Bearer valid-owner-jwt-token',
          },
        }
      );

      const res = await GET(req, { params: Promise.resolve({ slug: tenantSlug }) });
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.is_bot_active).toBe(false);
      expect(json.bot_paused).toBe(true);
      expect(json.paused_until).toBeDefined();
      expect(json.pause_reason).toBe('HUMAN_HANDOVER');
      expect(json.last_state_updated_by).toBe('test_sync');
    });
  });

  describe('TASK-104: Dynamic Resume & Timeout Policy', () => {
    it('automatically resumes bot state when paused_until has expired', async () => {
      const mockSupabase = createMockSupabase();

      // Set conversation with an expired pause time (5 minutes ago)
      const expiredTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      mockConversationsTable[0].paused_until = expiredTime;
      mockConversationsTable[0].is_bot_paused = true;
      mockConversationsTable[0].is_paused = true;
      mockConversationsTable[0].is_bot_active = false;
      const expiredConv = {
        id: 'conv-101',
        is_bot_paused: true,
        bot_paused: true,
        is_paused: true,
        paused_until: expiredTime,
      };

      // Evaluate timeout policy
      const evalResult = await evaluateBotStateTimeout(expiredConv, tenantId, mockSupabase);

      expect(evalResult.handled).toBe(true);
      expect(evalResult.shouldBypass).toBe(false);
      expect(evalResult.reason).toBe('timeout_expired_resumed');

      // Verify DB was updated back to active
      const updatedConv = mockConversationsTable[0];
      expect(updatedConv.is_bot_active).toBe(true);
      expect(updatedConv.is_paused).toBe(false);
      expect(updatedConv.bot_paused).toBe(false);
      expect(updatedConv.paused_until).toBeNull();
    });

    it('bypasses bot processing when paused_until is still in the future', async () => {
      const mockSupabase = createMockSupabase();

      // Set conversation paused until 20 minutes in the future
      const futureTime = new Date(Date.now() + 20 * 60 * 1000).toISOString();
      mockConversationsTable[0].paused_until = futureTime;
      mockConversationsTable[0].is_bot_paused = true;
      mockConversationsTable[0].is_paused = true;
      mockConversationsTable[0].is_bot_active = false;
      const activePauseConv = {
        id: 'conv-101',
        is_bot_paused: true,
        bot_paused: true,
        is_paused: true,
        paused_until: futureTime,
      };

      const evalResult = await evaluateBotStateTimeout(activePauseConv, tenantId, mockSupabase);

      expect(evalResult.handled).toBe(false);
      expect(evalResult.shouldBypass).toBe(true);
      expect(evalResult.reason).toBe('bot_paused_manually');

      // Verify conversation remains paused
      const conv = mockConversationsTable[0];
      expect(conv.paused_until).toBe(futureTime);
    });

    it('unblocks incoming messages in checkRuntimeBotDecisionGate after auto-resuming expired pause', async () => {
      const mockSupabase = createMockSupabase();

      const expiredTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const session = {
        session_id: 'sess-101',
        tenant_id: tenantId,
        user_identifier: customerPhone,
        is_paused: true,
        bot_status: 'HUMAN_HANDOVER',
        paused_until: expiredTime,
      };

      const gateResult = await checkRuntimeBotDecisionGate({
        tenant: mockTenantsTable[0],
        session,
        senderPhone: customerPhone,
        supabase: mockSupabase,
      });

      // shouldBypass must be false, unblocking the message to be processed by AI!
      expect(gateResult.shouldBypass).toBe(false);
      expect(gateResult.reason).toBe('AUTO_RESUMED_EXPIRED');
    });
  });

  describe('TASK-105: Tenant RESUME (#on) Preservation of Conversation Pause State (2D Decoupling)', () => {
    it('does NOT reset conversation-level is_paused or paused_until when tenant RESUME (#on) is invoked via RPC', async () => {
      const mockSupabase = createMockSupabase();

      // Seed conversation paused by CS operator (30 minutes)
      const pauseDurationUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      mockConversationsTable[0].is_paused = true;
      mockConversationsTable[0].bot_paused = true;
      mockConversationsTable[0].is_bot_paused = true;
      mockConversationsTable[0].is_bot_active = false;
      mockConversationsTable[0].paused_until = pauseDurationUntil;
      mockConversationsTable[0].last_state_updated_by = 'cs_operator_handover';

      mockSessionsTable[0].is_paused = true;
      mockSessionsTable[0].bot_status = 'HUMAN_HANDOVER';
      mockSessionsTable[0].paused_until = pauseDurationUntil;
      mockSessionsTable[0].paused_by = 'cs_operator_handover';

      // Seed tenant as currently BOT_DISABLED (#off)
      mockTenantsTable[0].bot_paused = true;
      mockTenantsTable[0].is_bot_active = false;
      mockTenantsTable[0].metadata = { bot_status: 'BOT_DISABLED' };

      // Invoke tenant-level RESUME (#on)
      const resumeResult = await updateBotState({
        scope: 'tenant',
        action: 'RESUME',
        tenantId,
        tenantSlug,
        userRole: 'owner',
        source: 'owner_on_command',
        supabase: mockSupabase,
      });

      expect(resumeResult.success).toBe(true);
      expect(resumeResult.scope).toBe('tenant');
      expect(resumeResult.bot_paused).toBe(false);
      expect(resumeResult.is_bot_active).toBe(true);

      // Verify tenant is resumed in DB
      const tenantRow = mockTenantsTable[0];
      expect(tenantRow.bot_paused).toBe(false);
      expect(tenantRow.is_bot_active).toBe(true);

      // Verify conversation row STILL has is_paused=true and paused_until intact!
      const convRow = mockConversationsTable[0];
      expect(convRow.is_paused).toBe(true);
      expect(convRow.bot_paused).toBe(true);
      expect(convRow.is_bot_paused).toBe(true);
      expect(convRow.is_bot_active).toBe(false);
      expect(convRow.paused_until).toBe(pauseDurationUntil);
      expect(convRow.last_state_updated_by).toBe('cs_operator_handover');

      // Verify conversation session is STILL paused
      const sessionRow = mockSessionsTable[0];
      expect(sessionRow.is_paused).toBe(true);
      expect(sessionRow.bot_status).toBe('HUMAN_HANDOVER');
      expect(sessionRow.paused_until).toBe(pauseDurationUntil);
    });

    it('fails closed and returns success: false without partial fallback writes when RPC fails (CTO Directive 2)', async () => {
      const mockSupabase = createMockSupabase();
      // Force RPC failure
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202', message: 'Function not found' },
      });

      // Seed conversation paused by CS operator (45 minutes)
      const pauseDurationUntil = new Date(Date.now() + 45 * 60 * 1000).toISOString();
      mockConversationsTable[0].is_paused = true;
      mockConversationsTable[0].bot_paused = true;
      mockConversationsTable[0].is_bot_paused = true;
      mockConversationsTable[0].is_bot_active = false;
      mockConversationsTable[0].paused_until = pauseDurationUntil;
      mockConversationsTable[0].last_state_updated_by = 'cs_operator_handover';

      mockSessionsTable[0].is_paused = true;
      mockSessionsTable[0].bot_status = 'HUMAN_HANDOVER';
      mockSessionsTable[0].paused_until = pauseDurationUntil;

      // Seed tenant as currently BOT_DISABLED (#off)
      mockTenantsTable[0].bot_paused = true;
      mockTenantsTable[0].is_bot_active = false;
      mockTenantsTable[0].metadata = { bot_status: 'BOT_DISABLED' };

      // Invoke tenant-level RESUME (#on)
      const resumeResult = await updateBotState({
        scope: 'tenant',
        action: 'RESUME',
        tenantId,
        tenantSlug,
        userRole: 'owner',
        source: 'owner_on_command',
        supabase: mockSupabase,
      });

      // True atomicity: fail-closed, no partial split-state
      expect(resumeResult.success).toBe(false);
      expect(resumeResult.error).toBeDefined();

      // Verify tenant is NOT mutated
      const tenantRow = mockTenantsTable[0];
      expect(tenantRow.bot_paused).toBe(true);

      // Verify conversation row remains intact
      const convRow = mockConversationsTable[0];
      expect(convRow.is_paused).toBe(true);
      expect(convRow.paused_until).toBe(pauseDurationUntil);
    });

    describe('Acceptance Tests: State Reconciliation on #off -> #on (CTO Directive 1)', () => {
      it('Acceptance A: Skenario #off -> #on: bot kembali membalas pesan masuk', async () => {
        const mockSupabase = createMockSupabase();
        clearRuntimeSessionCache();

        // 1. Initial State: Tenant is BOT_DISABLED (#off)
        mockTenantsTable[0].bot_paused = true;
        mockTenantsTable[0].is_bot_active = false;
        mockTenantsTable[0].metadata = { bot_status: 'BOT_DISABLED' };

        // Session created while tenant was disabled has pause_reason = 'TENANT_DISABLED'
        mockSessionsTable[0].is_paused = true;
        mockSessionsTable[0].current_state = 'HUMAN_PAUSED';
        mockSessionsTable[0].pause_reason = 'TENANT_DISABLED';
        mockConversationsTable[0].is_paused = true;
        mockConversationsTable[0].pause_reason = 'TENANT_DISABLED';

        // When tenant is paused, decision gate MUST bypass bot
        const gateWhileOff = await checkRuntimeBotDecisionGate({
          tenant: mockTenantsTable[0],
          session: mockSessionsTable[0],
          senderPhone: customerPhone,
          textBody: 'Halo mau beli produk',
          supabase: mockSupabase,
        });
        expect(gateWhileOff.shouldBypass).toBe(true);
        expect(gateWhileOff.reason).toBe('TENANT_GLOBAL_PAUSED');

        // 2. Owner sends #on -> resumes tenant
        const resumeRes = await updateBotState({
          scope: 'tenant',
          action: 'RESUME',
          tenantId,
          tenantSlug,
          userRole: 'owner',
          source: 'owner_on_command',
          supabase: mockSupabase,
        });
        expect(resumeRes.success).toBe(true);
        expect(resumeRes.bot_paused).toBe(false);

        // 3. Customer sends message after #on -> Decision gate must NOT bypass bot! Bot returns to reply!
        const gateAfterOn = await checkRuntimeBotDecisionGate({
          tenant: mockTenantsTable[0],
          session: mockSessionsTable[0],
          senderPhone: customerPhone,
          textBody: 'Halo bot apa kabar?',
          supabase: mockSupabase,
        });
        expect(gateAfterOn.shouldBypass).toBe(false);
      });

      it('Acceptance B: Skenario #off -> #on dengan percakapan CS: sesi HUMAN_HANDOVER tetap paused', async () => {
        const mockSupabase = createMockSupabase();
        clearRuntimeSessionCache();

        // 1. A customer conversation is in HUMAN_HANDOVER with CS operator
        const csPauseUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour left
        mockSessionsTable[0].is_paused = true;
        mockSessionsTable[0].current_state = 'HUMAN_PAUSED';
        mockSessionsTable[0].bot_status = 'HUMAN_HANDOVER';
        mockSessionsTable[0].pause_reason = 'HUMAN_HANDOVER';
        mockSessionsTable[0].paused_until = csPauseUntil;
        mockSessionsTable[0].paused_by = 'cs_operator';

        mockConversationsTable[0].is_paused = true;
        mockConversationsTable[0].pause_reason = 'HUMAN_HANDOVER';
        mockConversationsTable[0].paused_until = csPauseUntil;

        // Tenant is paused (#off)
        mockTenantsTable[0].bot_paused = true;
        mockTenantsTable[0].is_bot_active = false;
        mockTenantsTable[0].metadata = { bot_status: 'BOT_DISABLED' };

        // 2. Owner sends #on -> resumes tenant
        const resumeRes = await updateBotState({
          scope: 'tenant',
          action: 'RESUME',
          tenantId,
          tenantSlug,
          userRole: 'owner',
          source: 'owner_on_command',
          supabase: mockSupabase,
        });
        expect(resumeRes.success).toBe(true);

        // 3. Verify session was NOT unpaused: HUMAN_HANDOVER MUST REMAIN PAUSED!
        expect(mockSessionsTable[0].is_paused).toBe(true);
        expect(mockSessionsTable[0].pause_reason).toBe('HUMAN_HANDOVER');

        // Decision gate for this conversation must CONTINUE to bypass bot for CS takeover!
        const csGate = await checkRuntimeBotDecisionGate({
          tenant: mockTenantsTable[0],
          session: mockSessionsTable[0],
          senderPhone: customerPhone,
          textBody: 'Halo CS saya mau tanya',
          supabase: mockSupabase,
        });
        expect(csGate.shouldBypass).toBe(true);
        expect(csGate.reason).toBe('SESSION_PAUSED');
      });

      it('Acceptance C: Full Lifecycle: Sesi A (HUMAN_HANDOVER) & Sesi B (BOT_ACTIVE) -> #off -> #on preserves Sesi A HUMAN_HANDOVER while unpausing Sesi B', async () => {
        const mockSupabase = createMockSupabase();
        clearRuntimeSessionCache();

        const phoneA = '628111111111'; // CS Handover customer
        const phoneB = '628222222222'; // Regular active customer

        const csPauseUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();

        // Initialize Sesi A: HUMAN_HANDOVER (paused by CS)
        const sessionA = {
          tenant_id: tenantId,
          session_id: `wa_${tenantId}_${phoneA}`,
          user_identifier: phoneA,
          is_paused: true,
          current_state: 'HUMAN_PAUSED',
          bot_status: 'HUMAN_HANDOVER',
          pause_reason: 'HUMAN_HANDOVER',
          paused_until: csPauseUntil,
          paused_by: 'cs_agent',
        };
        const convA = {
          id: 'conv-a',
          tenant_id: tenantId,
          customer_phone: phoneA,
          is_paused: true,
          bot_paused: true,
          is_bot_paused: true,
          is_bot_active: false,
          pause_reason: 'HUMAN_HANDOVER',
          paused_until: csPauseUntil,
        };

        // Initialize Sesi B: BOT_ACTIVE (active AI conversation)
        const sessionB = {
          tenant_id: tenantId,
          session_id: `wa_${tenantId}_${phoneB}`,
          user_identifier: phoneB,
          is_paused: false,
          current_state: 'BOT_ACTIVE',
          bot_status: 'BOT_ACTIVE',
          pause_reason: null,
          paused_until: null,
          paused_by: null,
        };
        const convB = {
          id: 'conv-b',
          tenant_id: tenantId,
          customer_phone: phoneB,
          is_paused: false,
          bot_paused: false,
          is_bot_paused: false,
          is_bot_active: true,
          pause_reason: null,
          paused_until: null,
        };

        mockSessionsTable.length = 0;
        mockSessionsTable.push(sessionA, sessionB);
        mockConversationsTable.length = 0;
        mockConversationsTable.push(convA, convB);

        // Tenant initially active
        mockTenantsTable[0].bot_paused = false;
        mockTenantsTable[0].is_bot_active = true;
        mockTenantsTable[0].metadata = { bot_status: 'BOT_ENABLED' };

        // =========================================================================
        // STEP 1: Owner executes #off (tenant-level PAUSE)
        // =========================================================================
        const offRes = await updateBotState({
          scope: 'tenant',
          action: 'PAUSE',
          tenantId,
          tenantSlug,
          userRole: 'owner',
          source: 'owner_off_command',
          supabase: mockSupabase,
        });
        expect(offRes.success).toBe(true);
        expect(offRes.bot_paused).toBe(true);
        expect(mockTenantsTable[0].bot_paused).toBe(true);

        // VERIFIKASI SIKLUS STEP 1:
        // Sesi A WAJIB TETAP berstatus HUMAN_HANDOVER (tidak boleh ditimpa menjadi TENANT_DISABLED!)
        expect(sessionA.is_paused).toBe(true);
        expect(sessionA.pause_reason).toBe('HUMAN_HANDOVER');
        expect(convA.pause_reason).toBe('HUMAN_HANDOVER');

        // Sesi B ditandai jeda akibat tenant disabled
        expect(sessionB.is_paused).toBe(true);
        expect(sessionB.pause_reason).toBe('TENANT_DISABLED');
        expect(convB.pause_reason).toBe('TENANT_DISABLED');

        // =========================================================================
        // STEP 2: Owner executes #on (tenant-level RESUME)
        // =========================================================================
        const onRes = await updateBotState({
          scope: 'tenant',
          action: 'RESUME',
          tenantId,
          tenantSlug,
          userRole: 'owner',
          source: 'owner_on_command',
          supabase: mockSupabase,
        });
        expect(onRes.success).toBe(true);
        expect(onRes.bot_paused).toBe(false);
        expect(mockTenantsTable[0].bot_paused).toBe(false);

        // VERIFIKASI SIKLUS STEP 2:
        // 1. Sesi B kembali BOT_ACTIVE (karena pause_reason sebelumnya adalah TENANT_DISABLED)
        expect(sessionB.is_paused).toBe(false);
        expect(sessionB.current_state).toBe('BOT_ACTIVE');
        expect(sessionB.pause_reason).toBeNull();
        expect(convB.is_paused).toBe(false);
        expect(convB.bot_paused).toBe(false);
        expect(convB.pause_reason).toBeNull();

        // 2. Sesi A WAJIB TETAP HUMAN_HANDOVER (tidak ter-unpause / tidak bocor ke bot!)
        expect(sessionA.is_paused).toBe(true);
        expect(sessionA.pause_reason).toBe('HUMAN_HANDOVER');
        expect(convA.is_paused).toBe(true);
        expect(convA.bot_paused).toBe(true);
        expect(convA.pause_reason).toBe('HUMAN_HANDOVER');

        // 3. Runtime Decision Gate verification for both sessions:
        // Sesi B: Bot aktif membalas
        const gateB = await checkRuntimeBotDecisionGate({
          tenant: mockTenantsTable[0],
          session: sessionB,
          senderPhone: phoneB,
          textBody: 'Halo mau tanya harga promo',
          supabase: mockSupabase,
        });
        expect(gateB.shouldBypass).toBe(false);

        // Sesi A: Bot tetap dibypass agar tidak mengganggu CS
        const gateA = await checkRuntimeBotDecisionGate({
          tenant: mockTenantsTable[0],
          session: sessionA,
          senderPhone: phoneA,
          textBody: 'Halo CS apakah pesanan saya sudah dikirim?',
          supabase: mockSupabase,
        });
        expect(gateA.shouldBypass).toBe(true);
        expect(gateA.reason).toBe('SESSION_PAUSED');
      });
    });
  });
});
