import { checkRuntimeBotDecisionGate } from '@/lib/whatsapp/bot-control-service';
import { processEvolutionWebhookEvent } from '@/lib/whatsapp/evolution-webhook-handler';

// Shared mocks for Supabase
let mockConnections: Record<string, any> = {};
let mockTenants: Record<string, any> = {};
let mockTenantUsers: any[] = [];
let mockSessions: Record<string, any> = {};

jest.mock('@/lib/supabaseClient', () => {
  return {
    getSupabaseAdmin: jest.fn(() => ({
      from: jest.fn((tableName: string) => {
        if (tableName === 'whatsapp_connections') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn((_f: string, val: string) => ({
                maybeSingle: jest.fn(async () => ({
                  data: Object.values(mockConnections).find((c: any) => c.phone_number === val || c.instance_name === val) || null,
                  error: null,
                })),
              })),
              or: jest.fn((clause: string) => ({
                maybeSingle: jest.fn(async () => ({
                  data: Object.values(mockConnections)[0] || null,
                  error: null,
                })),
              })),
            })),
            update: jest.fn(() => ({
              eq: jest.fn(async () => ({ data: null, error: null })),
            })),
          };
        }

        if (tableName === 'tenants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn((_f: string, val: string) => ({
                maybeSingle: jest.fn(async () => ({
                  data: mockTenants[val] || Object.values(mockTenants)[0] || null,
                  error: null,
                })),
              })),
              or: jest.fn((clause: string) => ({
                maybeSingle: jest.fn(async () => ({
                  data: Object.values(mockTenants)[0] || null,
                  error: null,
                })),
              })),
            })),
            update: jest.fn((updateData: any) => ({
              eq: jest.fn(async (_f: string, val: string) => {
                if (mockTenants[val]) Object.assign(mockTenants[val], updateData);
                else if (Object.values(mockTenants)[0]) Object.assign(Object.values(mockTenants)[0], updateData);
                return { data: updateData, error: null };
              }),
              or: jest.fn(async () => {
                if (Object.values(mockTenants)[0]) Object.assign(Object.values(mockTenants)[0], updateData);
                return { data: updateData, error: null };
              }),
            })),
          };
        }

        if (tableName === 'tenant_users') {
          return {
            select: jest.fn(() => ({
              or: jest.fn(() => ({
                eq: jest.fn(async () => ({ data: mockTenantUsers, error: null })),
              })),
            })),
          };
        }

        if (tableName === 'conversation_sessions') {
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
              const key = `${data.tenant_id}_${data.user_identifier}`;
              mockSessions[key] = { ...(mockSessions[key] || {}), ...data };
              return { data: mockSessions[key], error: null };
            }),
            update: jest.fn((data: any) => ({
              eq: jest.fn(async (_f: string, val: string) => {
                const s = Object.values(mockSessions).find((item: any) => item.session_id === val);
                if (s) Object.assign(s, data);
                return { data, error: null };
              }),
              or: jest.fn(async () => ({ data, error: null })),
            })),
          };
        }

        return {
          select: jest.fn(() => ({
            eq: jest.fn(async () => ({ data: [], error: null })),
            or: jest.fn(() => ({ in: jest.fn(async () => ({ data: [], error: null })) })),
            in: jest.fn(async () => ({ data: [], error: null })),
            limit: jest.fn(async () => ({ data: [], error: null })),
          })),
          update: jest.fn(() => ({
            eq: jest.fn(async () => ({ data: null, error: null })),
            or: jest.fn(() => ({ in: jest.fn(async () => ({ data: null, error: null })) })),
          })),
          upsert: jest.fn(async () => ({ data: null, error: null })),
        };
      }),
    })),
    getSupabase: jest.fn(() => null),
  };
});

describe('Target 2: P1 - RBAC & Pause Gate Tests', () => {
  beforeEach(() => {
    mockConnections = {};
    mockTenants = {};
    mockTenantUsers = [];
    mockSessions = {};
  });

  describe('1. checkRuntimeBotDecisionGate: Handling null/undefined paused_until', () => {
    it('auto-reconciles non-owner pause when paused_until is null or undefined', async () => {
      const mockUpdate = jest.fn(() => ({
        eq: jest.fn(async () => ({ data: null, error: null })),
      }));
      const mockSupabase = {
        from: jest.fn((table: string) => {
          if (table === 'conversation_sessions') {
            return { update: mockUpdate };
          }
          return {};
        }),
      };

      const session = {
        session_id: 'wa_tenant1_628123456789',
        is_paused: true,
        current_state: 'HUMAN_PAUSED',
        bot_status: 'HUMAN_PAUSED',
        paused_by: 'cs_mobile_outbound', // Non-owner pause
        paused_until: null,
      };

      const result = await checkRuntimeBotDecisionGate({
        tenant: { id: 'tenant1', bot_paused: false, is_bot_active: true },
        session,
        textBody: 'Halo ada barang ini?',
        senderPhone: '628123456789',
        supabase: mockSupabase,
      });

      // Must NOT bypass: session auto-reconciled so it does not stay stuck!
      expect(result.shouldBypass).toBe(false);
      expect(result.reason).toBe('AUTO_RESUMED_EXPIRED');
      expect(mockSupabase.from).toHaveBeenCalledWith('conversation_sessions');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          is_paused: false,
          current_state: 'ACTIVE',
          bot_status: 'BOT_ACTIVE',
          paused_until: null,
        })
      );
    });

    it('auto-reconciles session with undefined paused_by and null paused_until', async () => {
      const mockUpdate = jest.fn(() => ({
        eq: jest.fn(async () => ({ data: null, error: null })),
      }));
      const mockSupabase = {
        from: jest.fn(() => ({ update: mockUpdate })),
      };

      const session = {
        session_id: 'wa_tenant1_628123456789',
        is_paused: true,
        current_state: 'PAUSED',
        paused_until: undefined,
      };

      const result = await checkRuntimeBotDecisionGate({
        tenant: { id: 'tenant1' },
        session,
        supabase: mockSupabase,
      });

      expect(result.shouldBypass).toBe(false);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          is_paused: false,
          current_state: 'ACTIVE',
          bot_status: 'BOT_ACTIVE',
        })
      );
    });

    it('applies default 30-minute timeout for explicit owner pause: expires when older than 30m', async () => {
      const mockUpdate = jest.fn(() => ({
        eq: jest.fn(async () => ({ data: null, error: null })),
      }));
      const mockSupabase = {
        from: jest.fn(() => ({ update: mockUpdate })),
      };

      const thirtyOneMinutesAgo = new Date(Date.now() - 31 * 60 * 1000).toISOString();
      const session = {
        session_id: 'wa_tenant1_628123456789',
        is_paused: true,
        current_state: 'HUMAN_PAUSED',
        paused_by: 'owner', // Explicit owner pause
        paused_at: thirtyOneMinutesAgo,
        paused_until: null, // missing paused_until
      };

      const result = await checkRuntimeBotDecisionGate({
        tenant: { id: 'tenant1' },
        session,
        supabase: mockSupabase,
      });

      expect(result.shouldBypass).toBe(false);
      expect(result.reason).toBe('AUTO_RESUMED_EXPIRED');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          is_paused: false,
          current_state: 'ACTIVE',
          bot_status: 'BOT_ACTIVE',
        })
      );
    });

    it('applies default 30-minute timeout for explicit owner pause: stays paused within 30m window', async () => {
      const mockUpdate = jest.fn(() => ({
        eq: jest.fn(async () => ({ data: null, error: null })),
      }));
      const mockSupabase = {
        from: jest.fn(() => ({ update: mockUpdate })),
      };

      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const session = {
        session_id: 'wa_tenant1_628123456789',
        is_paused: true,
        current_state: 'HUMAN_PAUSED',
        paused_by: 'owner', // Explicit owner pause
        paused_at: tenMinutesAgo,
        paused_until: null, // missing paused_until
      };

      const result = await checkRuntimeBotDecisionGate({
        tenant: { id: 'tenant1' },
        session,
        supabase: mockSupabase,
      });

      expect(result.shouldBypass).toBe(true);
      expect(result.reason).toBe('SESSION_PAUSED');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          paused_until: expect.any(String),
        })
      );
    });
  });

  describe('2. fromMe RBAC Gate: isAuthorizedBotController() before executeBotControl()', () => {
    it('blocks unauthorized fromMe command from mutating bot status', async () => {
      // Instance bound to 628222222222
      mockConnections['test-instance'] = {
        tenant_id: 'tenant-rb',
        tenant_slug: 'tenant-rb',
        instance_name: 'test-instance',
        phone_number: '628222222222',
        status: 'CONNECTED',
      };

      // Real owner phone is 628111111111 (not 628222222222)
      mockTenants['tenant-rb'] = {
        id: 'tenant-rb',
        slug: 'tenant-rb',
        phone: '628111111111',
        whatsapp_number: '628111111111',
        bot_paused: false,
        is_bot_active: true,
        metadata: {},
      };

      mockTenantUsers = []; // No authorized users

      const webhookPayload = {
        event: 'messages.upsert',
        instance: 'test-instance',
        owner: '628222222222',
        data: {
          key: {
            remoteJid: '628999999999@s.whatsapp.net',
            fromMe: true,
            id: 'CMD_UNAUTH_1',
          },
          message: {
            conversation: '#off',
          },
        },
      };

      // Since phone is unauthorized in RBAC, executeBotControl should NOT be executed
      await processEvolutionWebhookEvent(webhookPayload, 'test-instance');

      // Tenant bot status MUST NOT be paused!
      expect(mockTenants['tenant-rb'].bot_paused).toBe(false);
    });

    it('allows authorized owner fromMe command to mutate bot status', async () => {
      const personalOwnerPhone = '628777777777';
      // Instance bound to bot phone 628111111111
      mockConnections['test-instance'] = {
        tenant_id: 'tenant-rb',
        tenant_slug: 'tenant-rb',
        instance_name: 'test-instance',
        phone_number: '628111111111',
        status: 'CONNECTED',
      };

      mockTenants['tenant-rb'] = {
        id: 'tenant-rb',
        slug: 'tenant-rb',
        phone: '628111111111',
        whatsapp_number: '628111111111',
        bot_paused: false,
        is_bot_active: true,
        metadata: { owner_phone: personalOwnerPhone },
      };

      const webhookPayload = {
        event: 'messages.upsert',
        instance: 'test-instance',
        owner: '628111111111',
        data: {
          key: {
            remoteJid: '628999999999@s.whatsapp.net',
            fromMe: true,
            participant: `${personalOwnerPhone}@s.whatsapp.net`,
            id: 'CMD_AUTH_1',
          },
          message: {
            conversation: '#off',
          },
        },
      };

      // Since participant is authorized owner personal phone in metadata allowlist, executeBotControl MUST be executed
      await processEvolutionWebhookEvent(webhookPayload, 'test-instance');

      // Tenant bot status MUST be paused!
      expect(mockTenants['tenant-rb'].bot_paused).toBe(true);
    });
  });
});
