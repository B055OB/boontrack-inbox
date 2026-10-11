import {
  callAtomicBotControlRpc,
  executeBotControl,
  checkRuntimeBotDecisionGate,
  getRuntimeSessionCache,
  setRuntimeSessionCache,
  clearRuntimeSessionCache,
  buildSessionCacheKey,
} from '@/lib/whatsapp/bot-control-service';

describe('Target 3: Atomic RPC & Concurrency Race Condition Wiring Tests', () => {
  beforeEach(() => {
    clearRuntimeSessionCache();
    jest.clearAllMocks();
  });

  describe('1. Atomic RPC Invocation (fn_toggle_bot_session_state) & Fallback', () => {
    it('successfully calls atomic Supabase RPC and returns rpcExecuted: true', async () => {
      const mockRpc = jest.fn().mockResolvedValue({
        data: {
          success: true,
          scope: 'tenant',
          status: 'BOT_DISABLED',
          bot_paused: true,
        },
        error: null,
      });

      const mockSupabase = {
        rpc: mockRpc,
      };

      const result = await callAtomicBotControlRpc({
        action: 'PAUSE',
        scope: 'tenant',
        tenantId: 'tenant-uuid-123',
        tenantSlug: 'tenant-alpha',
        source: 'owner_manual',
        pausedUntilIso: new Date(Date.now() + 86400000).toISOString(),
        supabase: mockSupabase,
      });

      expect(result.rpcExecuted).toBe(true);
      expect(result.data.success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('fn_toggle_bot_session_state', {
        p_tenant_id: 'tenant-alpha',
        p_scope: 'tenant',
        p_action: 'PAUSE',
        p_is_paused: true,
        p_customer_phone: null,
        p_source: 'owner_manual',
        p_paused_until: expect.any(String),
      });
    });

    it('gracefully falls back when Supabase RPC function does not exist (PGRST202)', async () => {
      const mockRpc = jest.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'PGRST202',
          message: 'Could not find the function public.fn_toggle_bot_session_state in the schema cache',
        },
      });

      const mockSupabase = {
        rpc: mockRpc,
      };

      const result = await callAtomicBotControlRpc({
        action: 'RESUME',
        scope: 'tenant',
        tenantId: 'tenant-uuid-123',
        tenantSlug: 'tenant-alpha',
        source: 'owner_manual',
        supabase: mockSupabase,
      });

      expect(result.rpcExecuted).toBe(false);
      expect(mockRpc).toHaveBeenCalled();
    });

    it('handles conversation scope in RPC with canonical customer phone', async () => {
      const mockRpc = jest.fn().mockResolvedValue({
        data: {
          success: true,
          scope: 'conversation',
          status: 'HUMAN_HANDOVER',
          bot_paused: true,
          customer_phone: '6281234567890',
        },
        error: null,
      });

      const mockSupabase = {
        rpc: mockRpc,
      };

      const result = await callAtomicBotControlRpc({
        action: 'PAUSE',
        scope: 'conversation',
        tenantId: 'tenant-uuid-456',
        tenantSlug: 'tenant-beta',
        customerPhone: '+62 812-3456-7890',
        source: 'cs_handover',
        pausedUntilIso: new Date(Date.now() + 86400000).toISOString(),
        supabase: mockSupabase,
      });

      expect(result.rpcExecuted).toBe(true);
      expect(result.data.customer_phone).toBe('6281234567890');
      expect(mockRpc).toHaveBeenCalledWith('fn_toggle_bot_session_state', {
        p_tenant_id: 'tenant-beta',
        p_scope: 'conversation',
        p_action: 'PAUSE',
        p_is_paused: true,
        p_customer_phone: '6281234567890',
        p_source: 'cs_handover',
        p_paused_until: expect.any(String),
      });
    });
  });

  describe('2. Dual-Column State Synchronization (bot_paused & is_paused)', () => {
    it('synchronizes bot_paused and is_paused across conversations table on tenant toggle', async () => {
      let conversationsUpdatedData: any = null;
      let sessionsUpdatedData: any = null;
      let tenantsUpdatedData: any = null;

      const mockSupabase: any = {
        rpc: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST202', message: 'Function not found' },
        }),
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn(() => ({
                or: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: { id: 'uuid-1', slug: 'demo-store', metadata: {}, bot_paused: false, is_bot_active: true },
                    error: null,
                  })),
                })),
              })),
              update: jest.fn((data: any) => {
                tenantsUpdatedData = data;
                return {
                  or: jest.fn(async () => ({ data, error: null })),
                  eq: jest.fn(async () => ({ data, error: null })),
                };
              }),
            };
          }
          if (table === 'conversation_sessions') {
            return {
              update: jest.fn((data: any) => {
                sessionsUpdatedData = data;
                return {
                  or: jest.fn(async () => ({ data, error: null })),
                  eq: jest.fn(async () => ({ data, error: null })),
                };
              }),
            };
          }
          if (table === 'conversations') {
            return {
              update: jest.fn((data: any) => {
                conversationsUpdatedData = data;
                return {
                  or: jest.fn(async () => ({ data, error: null })),
                  eq: jest.fn(async () => ({ data, error: null })),
                };
              }),
            };
          }
          return {
            select: jest.fn(() => ({ or: jest.fn(() => ({ eq: jest.fn(async () => ({ data: [], error: null })) })) })),
          };
        }),
      };

      // Execute PAUSE
      const pauseRes = await executeBotControl({
        action: 'PAUSE',
        scope: 'tenant',
        tenantId: 'uuid-1',
        tenantSlug: 'demo-store',
        userRole: 'owner',
        supabase: mockSupabase,
      });

      expect(pauseRes.success).toBe(true);
      expect(pauseRes.bot_paused).toBe(true);

      // Verify dual-column update on conversations table
      expect(conversationsUpdatedData).toBeDefined();
      expect(conversationsUpdatedData.bot_paused).toBe(true);
      expect(conversationsUpdatedData.is_paused).toBe(true);
      expect(conversationsUpdatedData.is_bot_paused).toBe(true);
      expect(conversationsUpdatedData.is_bot_active).toBe(false);
      expect(conversationsUpdatedData.status).toBe('HUMAN_PAUSED');

      // Verify conversation_sessions
      expect(sessionsUpdatedData.is_paused).toBe(true);
      expect(sessionsUpdatedData.bot_status).toBe('BOT_DISABLED');

      // Verify tenants
      expect(tenantsUpdatedData.bot_paused).toBe(true);
      expect(tenantsUpdatedData.is_bot_active).toBe(false);

      // Execute RESUME
      const resumeRes = await executeBotControl({
        action: 'RESUME',
        scope: 'tenant',
        tenantId: 'uuid-1',
        tenantSlug: 'demo-store',
        userRole: 'owner',
        supabase: mockSupabase,
      });

      expect(resumeRes.success).toBe(true);
      expect(resumeRes.bot_paused).toBe(false);

      // Verify dual-column reset on conversations table
      expect(conversationsUpdatedData.bot_paused).toBe(false);
      expect(conversationsUpdatedData.is_paused).toBe(false);
      expect(conversationsUpdatedData.is_bot_paused).toBe(false);
      expect(conversationsUpdatedData.is_bot_active).toBe(true);
      expect(conversationsUpdatedData.status).toBe('active');
    });

    it('synchronizes bot_paused and is_paused on conversation-level CS takeover', async () => {
      let convUpdated: any = null;
      let sessionUpserted: any = null;

      const mockSupabase: any = {
        rpc: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST202', message: 'Function not found' },
        }),
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn(() => ({
                or: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: { id: 'uuid-2', slug: 'cs-store', metadata: {} },
                    error: null,
                  })),
                })),
              })),
            };
          }
          if (table === 'conversation_sessions') {
            return {
              upsert: jest.fn(async (data: any) => {
                sessionUpserted = data;
                return { data, error: null };
              }),
            };
          }
          if (table === 'conversations') {
            return {
              update: jest.fn((data: any) => {
                convUpdated = data;
                return {
                  eq: jest.fn(async () => ({ data, error: null })),
                  or: jest.fn(() => ({ eq: jest.fn(async () => ({ data, error: null })) })),
                };
              }),
            };
          }
          return {};
        }),
      };

      const res = await executeBotControl({
        action: 'PAUSE',
        scope: 'conversation',
        tenantId: 'uuid-2',
        tenantSlug: 'cs-store',
        customerPhone: '628555123456',
        userRole: 'cs',
        supabase: mockSupabase,
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('HUMAN_HANDOVER');
      expect(convUpdated.bot_paused).toBe(true);
      expect(convUpdated.is_paused).toBe(true);
      expect(convUpdated.is_bot_paused).toBe(true);
      expect(convUpdated.is_bot_active).toBe(false);
      expect(sessionUpserted.is_paused).toBe(true);
      expect(sessionUpserted.bot_status).toBe('HUMAN_HANDOVER');
    });
  });

  describe('3. Concurrency & Race Condition: Incoming Message vs Manual Control', () => {
    it('owner #resume immediately unblocks incoming message via runtimeSessionCache without waiting for slow DB query', async () => {
      const tenantId = 'tenant-concurrency-1';
      const customerPhone = '628777123456';

      // 1. Simulate owner issuing #resume
      setRuntimeSessionCache({
        tenantId,
        userIdentifier: customerPhone,
        isPaused: false,
        botStatus: 'BOT_ACTIVE',
        updatedAt: Date.now(),
      });

      // 2. An incoming message arrives concurrently while the DB row is still showing stale is_paused = true
      const staleDbSession = {
        tenant_id: tenantId,
        user_identifier: customerPhone,
        is_paused: true,
        current_state: 'HUMAN_PAUSED',
        bot_status: 'HUMAN_PAUSED',
        paused_until: new Date(Date.now() + 3600000).toISOString(), // 1 hour remaining in stale DB
        paused_by: 'owner',
      };

      const decision = await checkRuntimeBotDecisionGate({
        tenant: { id: tenantId, bot_paused: false, is_bot_active: true },
        session: staleDbSession,
        textBody: 'Halo kak mau tanya stok barang',
        senderPhone: customerPhone,
      });

      // The recent owner #resume in cache MUST override the stale DB pause state!
      expect(decision.shouldBypass).toBe(false);
      expect(decision.reason).toBe('AUTO_RESUMED_EXPIRED');
    });

    it('owner #pause immediately blocks concurrent in-flight message via runtimeSessionCache', async () => {
      const tenantId = 'tenant-concurrency-2';
      const customerPhone = '628888123456';

      // 1. Owner issues #pause
      setRuntimeSessionCache({
        tenantId,
        userIdentifier: customerPhone,
        isPaused: true,
        botStatus: 'HUMAN_HANDOVER',
        updatedAt: Date.now(),
      });

      // 2. Incoming message arrives concurrently while DB row still shows is_paused = false
      const staleDbSession = {
        tenant_id: tenantId,
        user_identifier: customerPhone,
        is_paused: false,
        current_state: 'ACTIVE',
        bot_status: 'AI_ACTIVE',
      };

      const decision = await checkRuntimeBotDecisionGate({
        tenant: { id: tenantId, bot_paused: false, is_bot_active: true },
        session: staleDbSession,
        textBody: 'Permisi mau tanya',
        senderPhone: customerPhone,
      });

      // The recent owner #pause in cache MUST bypass AI processing to prevent race condition response
      expect(decision.shouldBypass).toBe(true);
      expect(decision.reason).toBe('SESSION_PAUSED');
    });

    it('global tenant pause in cache blocks messages across all customers', async () => {
      const tenantId = 'tenant-concurrency-3';

      setRuntimeSessionCache({
        tenantId,
        isPaused: true,
        botStatus: 'BOT_DISABLED',
        updatedAt: Date.now(),
      });

      const decision = await checkRuntimeBotDecisionGate({
        tenant: { id: tenantId, bot_paused: false, is_bot_active: true }, // Stale tenant DB
        session: { is_paused: false },
        textBody: 'Halo admin ada promo?',
        senderPhone: '628199999999',
      });

      expect(decision.shouldBypass).toBe(true);
      expect(decision.reason).toBe('TENANT_GLOBAL_PAUSED_CACHE');
    });

    it('autoResumeSession updates conversations table with dual columns (bot_paused: false, is_paused: false) and cache', async () => {
      let conversationsUpdated: any = null;
      let sessionUpdated: any = null;

      const mockSupabase: any = {
        from: jest.fn((table: string) => {
          if (table === 'conversation_sessions') {
            return {
              update: jest.fn((data: any) => {
                sessionUpdated = data;
                return { eq: jest.fn(async () => ({ data, error: null })) };
              }),
            };
          }
          if (table === 'conversations') {
            return {
              update: jest.fn((data: any) => {
                conversationsUpdated = data;
                return { eq: jest.fn(async () => ({ data, error: null })) };
              }),
            };
          }
          return {};
        }),
      };

      const expiredSession = {
        session_id: 'wa_tenant-auto_628123000',
        tenant_id: 'tenant-auto',
        user_identifier: '628123000',
        is_paused: true,
        current_state: 'HUMAN_PAUSED',
        bot_status: 'HUMAN_PAUSED',
        paused_until: new Date(Date.now() - 10000).toISOString(), // expired 10s ago
        paused_by: 'cs_agent',
      };

      const decision = await checkRuntimeBotDecisionGate({
        tenant: { id: 'tenant-auto', bot_paused: false, is_bot_active: true },
        session: expiredSession,
        textBody: 'Halo kak',
        senderPhone: '628123000',
        supabase: mockSupabase,
      });

      expect(decision.shouldBypass).toBe(false);
      expect(decision.reason).toBe('AUTO_RESUMED_EXPIRED');

      // Verify DB updates
      expect(sessionUpdated.is_paused).toBe(false);
      expect(sessionUpdated.bot_status).toBe('BOT_ACTIVE');

      expect(conversationsUpdated.bot_paused).toBe(false);
      expect(conversationsUpdated.is_paused).toBe(false);
      expect(conversationsUpdated.is_bot_paused).toBe(false);
      expect(conversationsUpdated.is_bot_active).toBe(true);

      // Verify cache updated
      const cached = getRuntimeSessionCache('tenant-auto', '628123000');
      expect(cached).not.toBeNull();
      expect(cached?.isPaused).toBe(false);
      expect(cached?.botStatus).toBe('BOT_ACTIVE');
    });

    it('transaction exception (order/payment intent) overrides pause even when session is paused', async () => {
      const tenantId = 'tenant-order-ex';
      const customerPhone = '628198765432';

      setRuntimeSessionCache({
        tenantId,
        userIdentifier: customerPhone,
        isPaused: true,
        botStatus: 'HUMAN_PAUSED',
        updatedAt: Date.now(),
      });

      const orderDecision = await checkRuntimeBotDecisionGate({
        tenant: { id: tenantId, bot_paused: true, is_bot_active: false },
        session: { is_paused: true, current_state: 'HUMAN_PAUSED' },
        textBody: 'Total Nominal: Rp 149.000\nMetode: Transfer Bank\nMohon dicek dan aktivasi akses',
        senderPhone: customerPhone,
      });

      expect(orderDecision.shouldBypass).toBe(false);
      expect(orderDecision.reason).toBe('TRANSACTION_EXCEPTION_ORDER');
    });
  });
});
