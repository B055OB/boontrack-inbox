/**
 * __tests__/whatsapp/state_machine_2d_and_rbac.test.ts
 *
 * Comprehensive Test Suite for:
 * 1. RBAC Scope Separation:
 *    - Scope TENANT (#on, #off): Only 'owner' / 'admin'
 *    - Scope CONTACT (#pause, #resume): 'cs' / 'agent' / 'admin' / 'owner'
 *    - fromMe Sender Validation: remoteJid (customer) never leaks permissions to tenant
 * 2. 2-Dimensional State Machine:
 *    - Tenant: BOT_ENABLED | BOT_DISABLED
 *    - Contact: AI_ACTIVE | HUMAN_HANDOVER (with paused_until timer)
 *    - Key Invariant: Expired contact paused_until NEVER activates bot when tenant is BOT_DISABLED
 * 3. Cache Consistency & Single Source of Truth (Zero Split-Brain)
 * 4. Echo Detection Resilience on server restart & transient DB timeouts
 */

import {
  parseBotControlCommand,
  resolveBotControllerRole,
  isAuthorizedBotController,
  executeBotControl,
  checkRuntimeBotDecisionGate,
  setRuntimeSessionCache,
  getRuntimeSessionCache,
  clearRuntimeSessionCache,
} from '@/lib/whatsapp/bot-control-service';
import {
  registerBotOutbound,
  isBotOutbound,
  isBotOutboundAsync,
  clearOutboundRegistry,
  isOperatorBotControlText,
} from '@/lib/whatsapp/outbound-registry';
import { processEvolutionWebhookEvent } from '@/lib/whatsapp/evolution-webhook-handler';

// Mock Supabase storage
let mockTenants: Record<string, any> = {};
let mockTenantUsers: any[] = [];
let mockSessions: Record<string, any> = {};
let mockConversations: Record<string, any> = {};
let mockConnections: Record<string, any> = {};
let mockOutboundMessages: any[] = [];
let mockMessages: any[] = [];
let mockDbError: Error | null = null;

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'tenants') {
        return {
          select: jest.fn(() => ({
            or: jest.fn((clause: string) => ({
              maybeSingle: jest.fn(async () => {
                const tenant = Object.values(mockTenants)[0] || null;
                return { data: tenant, error: null };
              }),
            })),
            eq: jest.fn((_f: string, val: string) => ({
              maybeSingle: jest.fn(async () => ({
                data: mockTenants[val] || Object.values(mockTenants)[0] || null,
                error: null,
              })),
            })),
          })),
          update: jest.fn((updateData: any) => ({
            or: jest.fn(async () => {
              if (mockDbError) return { data: null, error: mockDbError };
              const t = Object.values(mockTenants)[0];
              if (t) Object.assign(t, updateData);
              return { data: updateData, error: null };
            }),
            eq: jest.fn(async (_f: string, val: string) => {
              if (mockDbError) return { data: null, error: mockDbError };
              if (mockTenants[val]) Object.assign(mockTenants[val], updateData);
              return { data: updateData, error: null };
            }),
          })),
        };
      }

      if (table === 'tenant_users') {
        return {
          select: jest.fn(() => ({
            or: jest.fn(() => ({
              eq: jest.fn(async () => ({
                data: mockTenantUsers,
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === 'conversation_sessions') {
        return {
          select: jest.fn(() => ({
            in: jest.fn(() => ({
              in: jest.fn(() => ({
                limit: jest.fn(async () => ({
                  data: Object.values(mockSessions),
                  error: null,
                })),
              })),
            })),
          })),
          upsert: jest.fn(async (data: any) => {
            if (mockDbError) return { data: null, error: mockDbError };
            const key = `${data.tenant_id}_${data.user_identifier}`;
            mockSessions[key] = { ...(mockSessions[key] || {}), ...data };
            return { data: mockSessions[key], error: null };
          }),
          update: jest.fn((data: any) => ({
            eq: jest.fn(async (_f: string, val: string) => {
              if (mockDbError) return { data: null, error: mockDbError };
              const s = Object.values(mockSessions).find((item: any) => item.session_id === val);
              if (s) Object.assign(s, data);
              return { data, error: null };
            }),
            or: jest.fn(async () => {
              if (mockDbError) return { data: null, error: mockDbError };
              Object.values(mockSessions).forEach((s: any) => Object.assign(s, data));
              return { data, error: null };
            }),
          })),
        };
      }

      if (table === 'conversations') {
        return {
          update: jest.fn((data: any) => ({
            or: jest.fn(() => ({
              eq: jest.fn(async () => {
                if (mockDbError) return { data: null, error: mockDbError };
                return { data, error: null };
              }),
              in: jest.fn(async () => {
                if (mockDbError) return { data: null, error: mockDbError };
                return { data, error: null };
              }),
            })),
            eq: jest.fn(async () => {
              if (mockDbError) return { data: null, error: mockDbError };
              return { data, error: null };
            }),
          })),
        };
      }

      if (table === 'whatsapp_connections') {
        return {
          select: jest.fn(() => ({
            or: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({
                data: Object.values(mockConnections)[0] || null,
                error: null,
              })),
            })),
            eq: jest.fn((_f: string, val: string) => ({
              maybeSingle: jest.fn(async () => ({
                data: Object.values(mockConnections).find((c: any) => c.phone_number === val || c.instance_name === val) || null,
                error: null,
              })),
            })),
          })),
          update: jest.fn(() => ({
            eq: jest.fn(async () => ({ data: null, error: null })),
          })),
        };
      }

      if (table === 'outbound_messages') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn((_f: string, val: string) => ({
              or: jest.fn(() => ({
                maybeSingle: jest.fn(async () => {
                  const found = mockOutboundMessages.find((m) => m.wa_message_id === val);
                  return { data: found || null, error: null };
                }),
              })),
              maybeSingle: jest.fn(async () => {
                const found = mockOutboundMessages.find((m) => m.wa_message_id === val);
                return { data: found || null, error: null };
              }),
            })),
          })),
        };
      }

      if (table === 'messages') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn((_f: string, val: string) => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => {
                  const found = mockMessages.find((m) => m.external_id === val);
                  return { data: found || null, error: null };
                }),
              })),
              maybeSingle: jest.fn(async () => {
                const found = mockMessages.find((m) => m.external_id === val);
                return { data: found || null, error: null };
              }),
            })),
          })),
        };
      }

      return {
        select: jest.fn(() => ({
          eq: jest.fn(async () => ({ data: [], error: null })),
          or: jest.fn(() => ({ in: jest.fn(async () => ({ data: [], error: null })) })),
          maybeSingle: jest.fn(async () => ({ data: null, error: null })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn(async () => ({ data: null, error: null })),
          or: jest.fn(async () => ({ data: null, error: null })),
        })),
        upsert: jest.fn(async () => ({ data: null, error: null })),
      };
    }),
  })),
  getSupabase: jest.fn(() => null),
}));

// Mock fetch for sendEvolutionTextMessage
global.fetch = jest.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({ status: 'SUCCESS' }),
})) as any;

describe('P1 Architecture: 2-Dimensional State Machine & RBAC Bot Control', () => {
  beforeEach(() => {
    clearRuntimeSessionCache();
    clearOutboundRegistry();
    mockTenants = {};
    mockTenantUsers = [];
    mockSessions = {};
    mockConversations = {};
    mockConnections = {};
    mockOutboundMessages = [];
    mockMessages = [];
    mockDbError = null;
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. Command Parser Scope Separation
  // =========================================================================
  describe('1. Command Parser Scope Separation', () => {
    it('parses #on and #off (with prefixes #, !, / or plain) as TENANT scope', () => {
      const offCommands = ['#off', '!off', '/off', 'off', '#OFF', ' /off '];
      for (const cmd of offCommands) {
        const parsed = parseBotControlCommand(cmd);
        expect(parsed).toEqual({ action: 'PAUSE', scope: 'TENANT' });
      }

      const onCommands = ['#on', '!on', '/on', 'on', '#ON', ' !on '];
      for (const cmd of onCommands) {
        const parsed = parseBotControlCommand(cmd);
        expect(parsed).toEqual({ action: 'RESUME', scope: 'TENANT' });
      }
    });

    it('parses #pause and #resume (with prefixes #, !, / or plain) as CONTACT scope', () => {
      const pauseCommands = ['#pause', '!pause', '/pause', 'pause', '#PAUSE', ' /pause '];
      for (const cmd of pauseCommands) {
        const parsed = parseBotControlCommand(cmd);
        expect(parsed).toEqual({ action: 'PAUSE', scope: 'CONTACT' });
      }

      const resumeCommands = ['#resume', '!resume', '/resume', 'resume', '#RESUME', ' !resume '];
      for (const cmd of resumeCommands) {
        const parsed = parseBotControlCommand(cmd);
        expect(parsed).toEqual({ action: 'RESUME', scope: 'CONTACT' });
      }
    });

    it('returns null for natural language customer messages containing control words', () => {
      expect(parseBotControlCommand('Saya mau diskon 50% dong')).toBeNull();
      expect(parseBotControlCommand('Tolong kirimkan katalog sepatu on point')).toBeNull();
      expect(parseBotControlCommand('Bisa pause pesanan saya sebentar?')).toBeNull();
      expect(parseBotControlCommand('Apakah toko masih buka atau off?')).toBeNull();
    });
  });

  // =========================================================================
  // 2. RBAC Scope & Controller Resolution (Blocker A & C)
  // =========================================================================
  describe('2. RBAC Scope & Controller Resolution (Blocker A & C)', () => {
    const tenantId = 'tenant-rbac-test';
    const ownerPhone = '628111111111';
    const adminPhone = '628222222222';
    const csPhone = '628333333333';
    const customerPhone = '628999999999';

    beforeEach(() => {
      mockTenants[tenantId] = {
        id: tenantId,
        slug: tenantId,
        phone: ownerPhone,
        whatsapp_number: ownerPhone,
        bot_paused: false,
        is_bot_active: true,
        metadata: { owner_phone: ownerPhone },
      };

      mockTenantUsers = [
        { phone: adminPhone, role: 'admin', is_active: true },
        { phone: csPhone, role: 'cs', is_active: true },
      ];
    });

    it('resolves owner and admin as authorized for BOTH Tenant and Contact scopes', async () => {
      const ownerAuth = await resolveBotControllerRole({
        senderPhone: ownerPhone,
        tenantId,
      });
      expect(ownerAuth.authorized).toBe(true);
      expect(ownerAuth.canControlTenant).toBe(true);
      expect(ownerAuth.canControlContact).toBe(true);

      const adminAuth = await resolveBotControllerRole({
        senderPhone: adminPhone,
        tenantId,
      });
      expect(adminAuth.authorized).toBe(true);
      expect(adminAuth.canControlTenant).toBe(true);
      expect(adminAuth.canControlContact).toBe(true);
    });

    it('resolves CS role as authorized for CONTACT scope but FORBIDDEN for TENANT scope', async () => {
      const csAuth = await resolveBotControllerRole({
        senderPhone: csPhone,
        tenantId,
      });
      expect(csAuth.authorized).toBe(true);
      expect(csAuth.role).toBe('cs');
      expect(csAuth.canControlTenant).toBe(false); // FORBIDDEN from #on, #off
      expect(csAuth.canControlContact).toBe(true);  // ALLOWED for #pause, #resume
    });

    it('resolves customer phone as unauthorized for both scopes', async () => {
      const customerAuth = await resolveBotControllerRole({
        senderPhone: customerPhone,
        tenantId,
      });
      expect(customerAuth.authorized).toBe(false);
      expect(customerAuth.canControlTenant).toBe(false);
      expect(customerAuth.canControlContact).toBe(false);
    });

    it('blocks CS role from executing TENANT scope command (#off, #on)', async () => {
      const result = await executeBotControl({
        action: 'PAUSE',
        scope: 'tenant',
        tenantId,
        userRole: 'cs',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('FORBIDDEN_TENANT_ROLE');
      expect(mockTenants[tenantId].bot_paused).toBe(false);
    });

    it('permits owner role to execute TENANT scope command (#off, #on) updating BOT_ENABLED / BOT_DISABLED', async () => {
      const offRes = await executeBotControl({
        action: 'PAUSE',
        scope: 'tenant',
        tenantId,
        userRole: 'owner',
      });
      expect(offRes.success).toBe(true);
      expect(offRes.status).toBe('BOT_DISABLED');
      expect(offRes.bot_paused).toBe(true);

      const onRes = await executeBotControl({
        action: 'RESUME',
        scope: 'tenant',
        tenantId,
        userRole: 'owner',
      });
      expect(onRes.success).toBe(true);
      expect(onRes.status).toBe('BOT_ENABLED');
      expect(onRes.bot_paused).toBe(false);
    });

    it('permits CS role to execute CONTACT scope command (#pause, #resume) updating AI_ACTIVE / HUMAN_HANDOVER', async () => {
      const pauseRes = await executeBotControl({
        action: 'PAUSE',
        scope: 'conversation',
        tenantId,
        customerPhone,
        userRole: 'cs',
      });
      expect(pauseRes.success).toBe(true);
      expect(pauseRes.status).toBe('HUMAN_HANDOVER');
      expect(pauseRes.bot_paused).toBe(true);

      const resumeRes = await executeBotControl({
        action: 'RESUME',
        scope: 'conversation',
        tenantId,
        customerPhone,
        userRole: 'cs',
      });
      expect(resumeRes.success).toBe(true);
      expect(resumeRes.status).toBe('AI_ACTIVE');
      expect(resumeRes.bot_paused).toBe(false);
    });

    it('STRICT FAIL-CLOSED: rejects execution immediately when role is undefined, null, or empty string', async () => {
      // 1. undefined role
      const undefRes = await executeBotControl({
        action: 'PAUSE',
        scope: 'tenant',
        tenantId,
        userRole: undefined,
      });
      expect(undefRes.success).toBe(false);
      expect(undefRes.error).toBe('UNAUTHORIZED');

      // 2. empty string role
      const emptyRes = await executeBotControl({
        action: 'PAUSE',
        scope: 'conversation',
        tenantId,
        customerPhone,
        userRole: '',
      });
      expect(emptyRes.success).toBe(false);
      expect(emptyRes.error).toBe('UNAUTHORIZED');

      // 3. Unresolvable senderPhone without role
      const unresolvableRes = await executeBotControl({
        action: 'RESUME',
        scope: 'tenant',
        tenantId,
        senderPhone: '628999999999', // Unknown phone not in tenant record or tenant_users
      });
      expect(unresolvableRes.success).toBe(false);
      expect(unresolvableRes.error).toBe('UNAUTHORIZED');
    });

    it('STRICT FAIL-CLOSED: rejects arbitrary label merchant_cookie if not from dashboard_toggle session', async () => {
      const arbitraryRes = await executeBotControl({
        action: 'PAUSE',
        scope: 'tenant',
        tenantId,
        userRole: 'merchant_cookie',
        source: 'untrusted_direct_call',
      });
      expect(arbitraryRes.success).toBe(false);
      expect(arbitraryRes.error).toBe('FORBIDDEN_INVALID_SESSION');
    });
  });

  // =========================================================================
  // 3. fromMe Sender Validation (Role Leak Prevention)
  // =========================================================================
  describe('3. fromMe Sender Validation (Role Leak Prevention)', () => {
    const tenantId = 'tenant-leak-test';
    const botDevicePhone = '628111111111';
    const customerPhone = '628999999999';

    beforeEach(() => {
      mockConnections['instance-leak'] = {
        tenant_id: tenantId,
        tenant_slug: tenantId,
        instance_name: 'instance-leak',
        phone_number: botDevicePhone,
        status: 'CONNECTED',
      };

      mockTenants[tenantId] = {
        id: tenantId,
        slug: tenantId,
        phone: botDevicePhone,
        whatsapp_number: botDevicePhone,
        bot_paused: false,
        is_bot_active: true,
        metadata: {},
      };

      // Even if customer phone exists in tenant_users with an admin role on ANOTHER tenant:
      mockTenantUsers = [
        { phone: customerPhone, role: 'admin', is_active: true }, // potential impersonator
      ];
    });

    it('fromMe event strictly validates bot device phone and prevents customer remoteJid from acting as controller', async () => {
      // Baileys fromMe event: remoteJid is the customer phone
      const webhookPayload = {
        event: 'messages.upsert',
        instance: 'instance-leak',
        owner: botDevicePhone,
        data: {
          key: {
            remoteJid: `${customerPhone}@s.whatsapp.net`,
            fromMe: true,
            id: 'MSG_FROM_ME_1',
          },
          message: {
            conversation: '#off',
          },
        },
      };

      // The message was sent fromMe by bot device (which is owner).
      // If candidateControllers had included customerPhone, it could have evaluated permissions of the recipient!
      // With our fix, candidateControllers = [botDevicePhone, participantPhone] ONLY.
      await processEvolutionWebhookEvent(webhookPayload, 'instance-leak');

      // Bot status should reflect action taken by authorized botDevicePhone
      expect(mockTenants[tenantId].bot_paused).toBe(true);
    });
  });

  // =========================================================================
  // 4. 2-Dimensional State Machine Matrix (Blocker B)
  // =========================================================================
  describe('4. 2-Dimensional State Machine Matrix (Blocker B)', () => {
    const tenantId = 'tenant-2d-matrix';
    const customerPhone = '628777888999';

    // KEY INVARIANT TEST: Expired contact paused_until MUST NEVER activate bot when tenant is BOT_DISABLED
    it('KEY INVARIANT: Expired contact paused_until timer NEVER activates bot when tenant is BOT_DISABLED', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

      const tenantDisabled = {
        id: tenantId,
        bot_paused: true,
        is_bot_active: false,
        metadata: { bot_status: 'BOT_DISABLED' },
      };

      const sessionWithExpiredTimer = {
        tenant_id: tenantId,
        user_identifier: customerPhone,
        session_id: `wa_${tenantId}_${customerPhone}`,
        is_paused: true,
        current_state: 'HUMAN_PAUSED',
        bot_status: 'HUMAN_HANDOVER',
        paused_until: twoHoursAgo, // Expired timer!
      };

      const decision = await checkRuntimeBotDecisionGate({
        tenant: tenantDisabled,
        session: sessionWithExpiredTimer,
        textBody: 'Halo apakah ada promo hari ini?',
        senderPhone: customerPhone,
      });

      // MUST BYPASS! Bot is NOT activated because Tenant dimension is BOT_DISABLED
      expect(decision.shouldBypass).toBe(true);
      expect(decision.reason).toBe('TENANT_GLOBAL_PAUSED');
    });

    it('Tenant BOT_DISABLED + Contact AI_ACTIVE: Bot is bypassed', async () => {
      const tenantDisabled = {
        id: tenantId,
        bot_paused: true,
        is_bot_active: false,
        metadata: { bot_status: 'BOT_DISABLED' },
      };

      const sessionActive = {
        tenant_id: tenantId,
        user_identifier: customerPhone,
        session_id: `wa_${tenantId}_${customerPhone}`,
        is_paused: false,
        current_state: 'ACTIVE',
        bot_status: 'AI_ACTIVE',
        paused_until: null,
      };

      const decision = await checkRuntimeBotDecisionGate({
        tenant: tenantDisabled,
        session: sessionActive,
        textBody: 'Halo mau tanya produk',
        senderPhone: customerPhone,
      });

      expect(decision.shouldBypass).toBe(true);
      expect(decision.reason).toBe('TENANT_GLOBAL_PAUSED');
    });

    it('Tenant BOT_ENABLED + Contact HUMAN_HANDOVER (active timer): Bot is bypassed (SESSION_PAUSED)', async () => {
      const inOneHour = new Date(Date.now() + 3600 * 1000).toISOString();

      const tenantEnabled = {
        id: tenantId,
        bot_paused: false,
        is_bot_active: true,
        metadata: { bot_status: 'BOT_ENABLED' },
      };

      const sessionHandover = {
        tenant_id: tenantId,
        user_identifier: customerPhone,
        session_id: `wa_${tenantId}_${customerPhone}`,
        is_paused: true,
        current_state: 'HUMAN_PAUSED',
        bot_status: 'HUMAN_HANDOVER',
        paused_until: inOneHour, // Active sliding window
      };

      const decision = await checkRuntimeBotDecisionGate({
        tenant: tenantEnabled,
        session: sessionHandover,
        textBody: 'Halo kak ada update?',
        senderPhone: customerPhone,
      });

      expect(decision.shouldBypass).toBe(true);
      expect(decision.reason).toBe('SESSION_PAUSED');
    });

    it('Tenant BOT_ENABLED + Contact HUMAN_HANDOVER (expired timer): Auto-resumes to AI_ACTIVE and bot responds', async () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

      const tenantEnabled = {
        id: tenantId,
        bot_paused: false,
        is_bot_active: true,
        metadata: { bot_status: 'BOT_ENABLED' },
      };

      const sessionExpired = {
        tenant_id: tenantId,
        user_identifier: customerPhone,
        session_id: `wa_${tenantId}_${customerPhone}`,
        is_paused: true,
        current_state: 'HUMAN_PAUSED',
        bot_status: 'HUMAN_HANDOVER',
        paused_until: thirtyMinutesAgo, // Expired timer!
      };

      const decision = await checkRuntimeBotDecisionGate({
        tenant: tenantEnabled,
        session: sessionExpired,
        textBody: 'Permisi mau pesan barang',
        senderPhone: customerPhone,
      });

      // Bot responds: shouldBypass = false
      expect(decision.shouldBypass).toBe(false);
      expect(decision.reason).toBe('AUTO_RESUMED_EXPIRED');
    });

    it('Tenant BOT_ENABLED + Contact AI_ACTIVE: Bot responds normally', async () => {
      const tenantEnabled = {
        id: tenantId,
        bot_paused: false,
        is_bot_active: true,
        metadata: { bot_status: 'BOT_ENABLED' },
      };

      const sessionActive = {
        tenant_id: tenantId,
        user_identifier: customerPhone,
        session_id: `wa_${tenantId}_${customerPhone}`,
        is_paused: false,
        current_state: 'ACTIVE',
        bot_status: 'AI_ACTIVE',
        paused_until: null,
      };

      const decision = await checkRuntimeBotDecisionGate({
        tenant: tenantEnabled,
        session: sessionActive,
        textBody: 'Berapa harga produk A?',
        senderPhone: customerPhone,
      });

      expect(decision.shouldBypass).toBe(false);
    });
  });

  // =========================================================================
  // 5. Cache Consistency: Single Source of Truth (Prevent Split-Brain)
  // =========================================================================
  describe('5. Cache Consistency & Single Source of Truth (Prevent Split-Brain)', () => {
    it('does NOT update runtime cache if database mutation fails', async () => {
      const failingSupabase = {
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            or: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({ data: { id: 'uuid-fail', slug: 'fail-store' }, error: null })),
            })),
          })),
          update: jest.fn(() => ({
            or: jest.fn(async () => ({ data: null, error: new Error('Postgres connection timeout') })),
            eq: jest.fn(async () => ({ data: null, error: new Error('Postgres connection timeout') })),
          })),
        })),
      };

      const result = await executeBotControl({
        action: 'PAUSE',
        scope: 'tenant',
        tenantId: 'uuid-fail',
        userRole: 'owner',
        supabase: failingSupabase,
      });

      expect(result.success).toBe(false);
      // Cache must NOT show paused state after DB failure
      const cached = getRuntimeSessionCache('uuid-fail');
      expect(cached).toBeNull();
    });

    it('updates runtime cache only after successful database confirmation', async () => {
      mockTenants['tenant-cache-ok'] = {
        id: 'tenant-cache-ok',
        slug: 'tenant-cache-ok',
        phone: '628111111111',
        bot_paused: false,
        is_bot_active: true,
      };

      const result = await executeBotControl({
        action: 'PAUSE',
        scope: 'tenant',
        tenantId: 'tenant-cache-ok',
        userRole: 'owner',
      });

      expect(result.success).toBe(true);
      const cached = getRuntimeSessionCache('tenant-cache-ok');
      expect(cached).not.toBeNull();
      expect(cached?.isPaused).toBe(true);
      expect(cached?.botStatus).toBe('BOT_DISABLED');
    });

    it('Mobile CS takeover does NOT update runtime cache if database returns { error: new Error("DB write failed") }', async () => {
      const takeTenant = 'tenant-takeover-fail';
      const targetPhone = '628777888999';
      mockConnections['instance-takeover-fail'] = {
        tenant_id: takeTenant,
        tenant_slug: takeTenant,
        instance_name: 'instance-takeover-fail',
        phone_number: '628111111111',
        status: 'CONNECTED',
      };
      mockTenants[takeTenant] = {
        id: takeTenant,
        slug: takeTenant,
        phone: '628111111111',
        bot_paused: false,
        is_bot_active: true,
      };

      // Clear cache first
      clearRuntimeSessionCache(takeTenant, targetPhone);
      mockDbError = new Error('DB write failed');

      const webhookPayload = {
        event: 'messages.upsert',
        instance: 'instance-takeover-fail',
        owner: '628111111111',
        data: {
          key: {
            remoteJid: `${targetPhone}@s.whatsapp.net`,
            fromMe: true,
            id: 'MSG_CS_FAIL_1',
          },
          message: {
            conversation: 'Halo kak ini CS mau info stok ada',
          },
        },
      };

      await processEvolutionWebhookEvent(webhookPayload, 'instance-takeover-fail');

      // Crucial: Cache MUST NOT be updated to HUMAN_HANDOVER when DB write failed!
      const cached = getRuntimeSessionCache(takeTenant, targetPhone);
      expect(cached).toBeNull();
    });

    it('executeBotControl does NOT update runtime cache if conversation_sessions mutation fails with error', async () => {
      clearRuntimeSessionCache('tenant-cache-fail', '628123456789');
      mockDbError = new Error('DB write failed');

      const result = await executeBotControl({
        action: 'PAUSE',
        scope: 'conversation',
        tenantId: 'tenant-cache-fail',
        customerPhone: '628123456789',
        userRole: 'cs',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB write failed');

      const cached = getRuntimeSessionCache('tenant-cache-fail', '628123456789');
      expect(cached).toBeNull();
    });
  });

  // =========================================================================
  // 6. Echo Detection & Outbound Registry Resilience
  // =========================================================================
  describe('6. Echo Detection & Outbound Registry Resilience', () => {
    const tenantId = 'tenant-echo-test';
    const messageId = 'WA_OUTBOUND_MSG_999';
    const recipientPhone = '628123456789';

    it('detects in-memory echo for recently sent bot message', () => {
      registerBotOutbound({
        tenantId,
        messageId,
        recipientPhone,
        text: 'Halo kak, pesanan Anda sedang kami proses.',
      });

      expect(isBotOutbound({ tenantId, messageId })).toBe(true);
      expect(isBotOutbound({ tenantId, recipientPhone, text: 'Halo kak, pesanan Anda sedang kami proses.' })).toBe(true);
      expect(isBotOutbound({ tenantId, recipientPhone, text: 'Pesan lain yang tidak cocok' })).toBe(false);
    });

    it('recovers from server restart via DB fallback and re-populates in-memory cache', async () => {
      // Simulate server restart: in-memory cache is wiped clean
      clearOutboundRegistry();
      expect(isBotOutbound({ tenantId, messageId })).toBe(false);

      // But database has recorded the message
      mockOutboundMessages.push({
        id: 'outbound-row-1',
        wa_message_id: messageId,
        tenant_id: tenantId,
        recipient_jid: recipientPhone,
      });

      const mockSupabase = {
        from: jest.fn((table: string) => {
          if (table === 'outbound_messages') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  or: jest.fn(() => ({
                    maybeSingle: jest.fn(async () => ({
                      data: { id: 'outbound-row-1', tenant_id: tenantId },
                      error: null,
                    })),
                  })),
                  maybeSingle: jest.fn(async () => ({
                    data: { id: 'outbound-row-1', tenant_id: tenantId },
                    error: null,
                  })),
                })),
              })),
            };
          }
          return {};
        }),
      };

      const result = await isBotOutboundAsync({
        tenantId,
        messageId,
        recipientPhone,
        supabase: mockSupabase,
      });

      expect(result).toBe('MATCH');
      // In-memory cache should now be populated for subsequent fast checks
      expect(isBotOutbound({ tenantId, messageId })).toBe(true);
    });

    it('returns UNKNOWN on transient DB timeout to prevent false human takeover', async () => {
      clearOutboundRegistry();

      const hangingSupabase = {
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              or: jest.fn(() => ({
                maybeSingle: jest.fn(
                  () => new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 50))
                ),
              })),
              maybeSingle: jest.fn(
                () => new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 50))
              ),
            })),
          })),
        })),
      };

      const result = await isBotOutboundAsync({
        tenantId,
        messageId: 'UNKNOWN_MSG_ID',
        recipientPhone,
        supabase: hangingSupabase,
      });

      // UNKNOWN ensures webhook quarantines event instead of triggering false human takeover!
      expect(result).toBe('UNKNOWN');
    });

    it('operator control commands are NEVER classified as bot echoes', () => {
      expect(isOperatorBotControlText('#pause')).toBe(true);
      expect(isOperatorBotControlText('#resume')).toBe(true);
      expect(isOperatorBotControlText('#off')).toBe(true);
      expect(isOperatorBotControlText('#on')).toBe(true);
      expect(isOperatorBotControlText('/off')).toBe(true);
      expect(isOperatorBotControlText('!on')).toBe(true);
    });
  });
});
