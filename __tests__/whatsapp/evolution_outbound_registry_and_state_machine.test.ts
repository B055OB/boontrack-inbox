import {
  registerBotOutbound,
  isBotOutbound,
  isBotOutboundAsync,
  clearOutboundRegistry,
  getOutboundRegistrySize,
} from '@/lib/whatsapp/outbound-registry';
import {
  processEvolutionWebhookEvent,
  sendEvolutionTextMessage,
} from '@/lib/whatsapp/evolution-webhook-handler';
import { executeBotControl } from '@/lib/whatsapp/bot-control-service';

// In-memory mock storage for tracking DB state changes
const mockSessions: Record<string, any> = {};
const mockConversations: Record<string, any> = {};
const mockMessages: any[] = [];
const mockOrders: any[] = [];
const mockOutboundMessages: any[] = [];

const mockConnections: Record<string, any> = {
  'merchant-evo-test': {
    tenant_id: 'solusiads',
    tenant_slug: 'solusiads',
    instance_name: 'merchant-evo-test',
    credential_ref: 'test-api-key',
    status: 'CONNECTED',
  },
};

const mockTenants: Record<string, any> = {
  solusiads: {
    id: 'solusiads',
    slug: 'solusiads',
    name: 'Solusi Ads Store',
    category: 'digital',
    metadata: {
      store_name: 'Solusi Ads Store',
      products: [
        { id: 'prod-1', name: 'Masterclass CPM', price: 149000 },
      ],
    },
  },
};

jest.mock('@/lib/supabaseClient', () => {
  return {
    getSupabaseAdmin: jest.fn(() => ({
      from: jest.fn((tableName: string) => {
        if (tableName === 'whatsapp_connections') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn((_f: string, val: string) => ({
                maybeSingle: jest.fn(async () => ({
                  data: mockConnections[val] || null,
                  error: null,
                })),
              })),
              or: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({
                  data: mockConnections['merchant-evo-test'] || null,
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
                  data: mockTenants[val] || null,
                  error: null,
                })),
              })),
              or: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({
                  data: mockTenants['solusiads'] || null,
                  error: null,
                })),
              })),
            })),
            update: jest.fn(() => ({
              eq: jest.fn(async () => ({ data: null, error: null })),
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
              eq: jest.fn((_f: string, val: string) => ({
                limit: jest.fn(async () => ({
                  data: mockSessions[val] ? [mockSessions[val]] : [],
                  error: null,
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
            })),
          };
        }

        if (tableName === 'conversations') {
          return {
            select: jest.fn(() => ({
              or: jest.fn(() => ({
                in: jest.fn(() => ({
                  limit: jest.fn(async () => ({
                    data: Object.values(mockConversations),
                    error: null,
                  })),
                })),
                eq: jest.fn(async () => ({
                  data: Object.values(mockConversations),
                  error: null,
                })),
              })),
              in: jest.fn(() => ({
                limit: jest.fn(async () => ({
                  data: Object.values(mockConversations),
                  error: null,
                })),
              })),
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({
                  data: Object.values(mockConversations)[0] || null,
                  error: null,
                })),
              })),
            })),
            insert: jest.fn((data: any) => {
              const id = `conv-${Date.now()}`;
              mockConversations[id] = { id, ...data };
              return {
                select: jest.fn(() => ({
                  single: jest.fn(async () => ({ data: mockConversations[id], error: null })),
                })),
              };
            }),
            update: jest.fn((data: any) => {
              const chain: any = {
                or: jest.fn(() => chain),
                in: jest.fn(async (_f: string, vals: string[]) => {
                  for (const c of Object.values(mockConversations)) {
                    if (vals.includes((c as any).customer_phone)) {
                      Object.assign(c, data);
                    }
                  }
                  return { data, error: null };
                }),
                eq: jest.fn(async (_f: string, val: string) => {
                  for (const c of Object.values(mockConversations)) {
                    if ((c as any).id === val || (c as any).customer_phone === val) {
                      Object.assign(c, data);
                    }
                  }
                  return { data, error: null };
                }),
              };
              return chain;
            }),
          };
        }

        if (tableName === 'orders') {
          const createOrderQuery = () => {
            const query: any = {
              or: jest.fn(() => query),
              in: jest.fn(() => query),
              eq: jest.fn(() => query),
              order: jest.fn(() => query),
              limit: jest.fn(async () => ({ data: mockOrders, error: null })),
              then: (resolve: any) => Promise.resolve({ data: mockOrders, error: null }).then(resolve),
            };
            return query;
          };
          return {
            select: jest.fn(() => createOrderQuery()),
            update: jest.fn((data: any) => ({
              eq: jest.fn(async (_f: string, val: string) => {
                const ord = mockOrders.find((o) => o.id === val);
                if (ord) Object.assign(ord, data);
                return { data: ord, error: null };
              }),
            })),
          };
        }

        if (tableName === 'messages') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: null, error: null })),
              })),
            })),
            insert: jest.fn(async (data: any) => {
              mockMessages.push(data);
              return { data, error: null };
            }),
          };
        }

        if (tableName === 'order_audit_logs') {
          return {
            insert: jest.fn(async () => ({ data: null, error: null })),
          };
        }

        if (tableName === 'outbound_messages') {
          return {
            select: jest.fn(() => {
              const chain: any = {
                eq: jest.fn((field: string, val: string) => {
                  const subChain: any = {
                    eq: jest.fn(() => subChain),
                    or: jest.fn(() => subChain),
                    maybeSingle: jest.fn(async () => {
                      const item = mockOutboundMessages.find((m) => m[field] === val);
                      return { data: item || null, error: null };
                    }),
                  };
                  return subChain;
                }),
                or: jest.fn(() => chain),
                maybeSingle: jest.fn(async () => ({ data: mockOutboundMessages[0] || null, error: null })),
              };
              return chain;
            }),
            insert: jest.fn(async (data: any) => {
              mockOutboundMessages.push(data);
              return { data, error: null };
            }),
          };
        }

        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }),
      rpc: jest.fn().mockImplementation((fnName: string, args: any) => {
        if (fnName === 'fn_toggle_bot_session_state') {
          const isPaused = args.p_is_paused;
          const targetPhone = args.p_customer_phone;
          const tenantKey = args.p_tenant_id;
          const source = args.p_source;
          const pausedUntil = args.p_paused_until;

          if (args.p_scope === 'tenant') {
            if (mockTenants[tenantKey]) {
              mockTenants[tenantKey].bot_paused = isPaused;
              mockTenants[tenantKey].is_bot_active = !isPaused;
            }
          } else {
            const sessionKey = `${tenantKey}_${targetPhone}`;
            mockSessions[sessionKey] = {
              ...(mockSessions[sessionKey] || {}),
              tenant_id: tenantKey,
              user_identifier: targetPhone,
              is_paused: isPaused,
              current_state: isPaused ? 'HUMAN_PAUSED' : 'ACTIVE',
              bot_status: isPaused ? 'HUMAN_HANDOVER' : 'AI_ACTIVE',
              paused_until: pausedUntil,
              paused_by: source,
            };
            for (const c of Object.values(mockConversations) as any[]) {
              if (c.customer_phone === targetPhone || !targetPhone) {
                c.bot_paused = isPaused;
                c.is_paused = isPaused;
                c.is_bot_paused = isPaused;
                c.is_bot_active = !isPaused;
                c.status = isPaused ? 'HUMAN_PAUSED' : 'active';
                c.paused_until = pausedUntil;
              }
            }
          }
          return Promise.resolve({ data: { success: true }, error: null });
        }
        return Promise.resolve({ data: null, error: { message: 'not mocked' } });
      }),
    })),
    getSupabase: jest.fn(() => ({
      from: jest.fn((tableName: string) => {
        if (tableName === 'tenants') {
          return {
            select: jest.fn(() => ({
              or: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({
                  data: mockTenants['solusiads'] || null,
                  error: null,
                })),
              })),
            })),
          };
        }
        return {
          select: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: null, error: null })),
          })),
        };
      }),
      rpc: jest.fn().mockImplementation((fnName: string, _args: any) => {
        if (fnName === 'fn_toggle_bot_session_state') {
          return Promise.resolve({ data: { success: true }, error: null });
        }
        return Promise.resolve({ data: null, error: { message: 'not mocked' } });
      }),
    })),
  };
});

// Mock fetch for sendEvolutionTextMessage
global.fetch = jest.fn(async (url: any, init?: any) => {
  if (typeof url === 'string' && url.includes('/message/sendText')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        key: {
          id: `EVO-MSG-${Date.now()}`,
          remoteJid: '628123456789@s.whatsapp.net',
          fromMe: true,
        },
      }),
      text: async () => '{"status":"ok"}',
    } as any;
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true }),
    text: async () => '{"success":true}',
  } as any;
});

describe('Audit Patch: Evolution Outbound Registry & State Machine', () => {
  beforeEach(() => {
    clearOutboundRegistry();
    for (const k in mockSessions) delete mockSessions[k];
    for (const k in mockConversations) delete mockConversations[k];
    mockMessages.length = 0;
    mockOrders.length = 0;
    mockOutboundMessages.length = 0;
    jest.clearAllMocks();
  });

  describe('1. Outbound Registry Unit Checks', () => {
    it('registers and detects bot outbound messages by message ID', () => {
      registerBotOutbound({
        messageId: 'BAE5MOCK12345',
        recipientPhone: '628123456789',
        text: 'Halo kak, berikut tagihan QRIS Anda.',
      });

      expect(getOutboundRegistrySize()).toBe(1);

      // Same message ID returns true
      expect(
        isBotOutbound({
          messageId: 'BAE5MOCK12345',
          recipientPhone: '628123456789',
        })
      ).toBe(true);

      // Unknown message ID with different text returns false
      expect(
        isBotOutbound({
          messageId: 'UNKNOWN-HUMAN-ID',
          recipientPhone: '628123456789',
          text: 'Pesan dari CS handphone',
        })
      ).toBe(false);
    });

    it('registers with tenant_id compound key and prevents cross-tenant collision', () => {
      registerBotOutbound({
        tenantId: 'tenant-alpha',
        messageId: 'MSG-SHARED-ID-1',
        recipientPhone: '628123456789',
        text: 'Pesan dari tenant Alpha',
      });

      // Matches for same tenant
      expect(
        isBotOutbound({
          tenantId: 'tenant-alpha',
          messageId: 'MSG-SHARED-ID-1',
        })
      ).toBe(true);

      // Does NOT match for different tenant with same message ID
      expect(
        isBotOutbound({
          tenantId: 'tenant-beta',
          messageId: 'MSG-SHARED-ID-1',
        })
      ).toBe(false);
    });

    it('falls back to database (outbound_messages) in isBotOutboundAsync when in-memory key is missing', async () => {
      clearOutboundRegistry();
      expect(getOutboundRegistrySize()).toBe(0);

      // Seed outbound_messages table (simulating past bot outbound before worker restart)
      mockOutboundMessages.push({
        id: 'outbox-uuid-1',
        tenant_id: 'solusiads',
        wa_message_id: 'MSG-RESTART-999',
        recipient_jid: '628123456789',
        source: 'bot',
      });

      const mockSupabase = {
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn((field: string, val: string) => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => {
                  const m = mockOutboundMessages.find((item) => item[field] === val);
                  return { data: m || null, error: null };
                }),
              })),
              or: jest.fn(() => ({
                maybeSingle: jest.fn(async () => {
                  const m = mockOutboundMessages.find((item) => item[field] === val);
                  return { data: m || null, error: null };
                }),
              })),
              maybeSingle: jest.fn(async () => {
                const m = mockOutboundMessages.find((item) => item[field] === val);
                return { data: m || null, error: null };
              }),
            })),
          })),
        })),
      };

      const result = await isBotOutboundAsync({
        tenantId: 'solusiads',
        messageId: 'MSG-RESTART-999',
        recipientPhone: '628123456789',
        supabase: mockSupabase,
      });

      expect(result).toBe('MATCH');
      // Verify it re-populated the in-memory cache
      expect(getOutboundRegistrySize()).toBe(1);
    });

    it('matches bot outbound messages by recipient phone and text snippet', () => {
      registerBotOutbound({
        recipientPhone: '08123456789',
        text: 'Rincian pesanan Kakak sudah kami terima untuk verifikasi manual.',
      });

      // Query with normalized 62 format and matching text
      expect(
        isBotOutbound({
          recipientPhone: '628123456789',
          text: 'Rincian pesanan Kakak sudah kami terima untuk verifikasi manual.',
        })
      ).toBe(true);
    });
  });

  describe('2. Prevention of Bot Self-Pause (Outbound Registry Integration)', () => {
    it('does NOT trigger self-pause when Evolution sends fromMe = true for bot outbound message', async () => {
      const targetPhone = '628123456789';
      const botMessageText = 'Halo kak! Selamat datang di Solusi Ads. Ada yang bisa kami bantu?';
      const botMsgId = 'BAE5BOT999';

      // 1. Bot dispatches outbound text (pre-registered in registry)
      registerBotOutbound({
        messageId: botMsgId,
        recipientPhone: targetPhone,
        text: botMessageText,
      });

      // 2. Evolution API sends webhook event with fromMe = true
      const webhookPayload = {
        event: 'messages.upsert',
        instance: 'merchant-evo-test',
        data: {
          key: {
            remoteJid: `${targetPhone}@s.whatsapp.net`,
            fromMe: true,
            id: botMsgId,
          },
          message: {
            conversation: botMessageText,
          },
        },
      };

      await processEvolutionWebhookEvent(webhookPayload, 'merchant-evo-test');

      // 3. Verify: Session MUST NOT be paused, current_state MUST NOT be HUMAN_PAUSED
      const sessionKey = `solusiads_${targetPhone}`;
      expect(mockSessions[sessionKey]?.is_paused).toBeFalsy();
      expect(mockSessions[sessionKey]?.current_state).not.toBe('HUMAN_PAUSED');
    });

    it('does NOT execute admin command or trigger self-pause when bot outbound message contains #pause command', async () => {
      const targetPhone = '628123456789';
      const botMessageText = 'Halo kak! Ketik #pause jika Anda ingin berbicara dengan CS manual.';
      const botMsgId = 'BAE5BOT-CMD-TEST';

      registerBotOutbound({
        tenantId: 'solusiads',
        messageId: botMsgId,
        recipientPhone: targetPhone,
        text: botMessageText,
      });

      const webhookPayload = {
        event: 'messages.upsert',
        instance: 'merchant-evo-test',
        data: {
          key: {
            remoteJid: `${targetPhone}@s.whatsapp.net`,
            fromMe: true,
            id: botMsgId,
          },
          message: {
            conversation: botMessageText,
          },
        },
      };

      await processEvolutionWebhookEvent(webhookPayload, 'merchant-evo-test');

      // Tenant bot status MUST remain NOT paused!
      expect(mockTenants['solusiads']?.bot_paused).toBeFalsy();
      const sessionKey = `solusiads_${targetPhone}`;
      expect(mockSessions[sessionKey]?.is_paused).toBeFalsy();
      expect(mockSessions[sessionKey]?.current_state).not.toBe('HUMAN_PAUSED');
    });
  });

  describe('3. Mobile CS Outbound Takeover (HUMAN_PAUSED + 30m Sliding Window)', () => {
    it('sets status to HUMAN_PAUSED and extends paused_until by 30 minutes on human CS mobile message', async () => {
      const targetPhone = '628123456789';
      const humanCsText = 'Halo kak, barangnya ready ya. Bisa langsung ditransfer ke BCA kami.';
      const humanMsgId = '3EB0HUMAN123';

      const webhookPayload = {
        event: 'messages.upsert',
        instance: 'merchant-evo-test',
        data: {
          key: {
            remoteJid: `${targetPhone}@s.whatsapp.net`,
            fromMe: true,
            id: humanMsgId,
          },
          message: {
            conversation: humanCsText,
          },
        },
      };

      mockConversations['conv-test-1'] = {
        id: 'conv-test-1',
        customer_phone: targetPhone,
        tenant_id: 'solusiads',
        status: 'active',
        bot_paused: false,
      };

      const beforeTime = Date.now();
      await processEvolutionWebhookEvent(webhookPayload, 'merchant-evo-test');
      const afterTime = Date.now();

      const sessionKey = `solusiads_${targetPhone}`;
      const session = mockSessions[sessionKey];

      // 1. Session must be paused in state HUMAN_PAUSED
      expect(session).toBeDefined();
      expect(session.is_paused).toBe(true);
      expect(session.current_state).toBe('HUMAN_PAUSED');
      expect(session.paused_by).toBe('cs_mobile_outbound');

      // 2. Sliding window paused_until must be approximately now + 30 minutes (1,800,000 ms)
      const pausedUntilMs = new Date(session.paused_until).getTime();
      const expectedMin = beforeTime + 30 * 60 * 1000 - 1000;
      const expectedMax = afterTime + 30 * 60 * 1000 + 1000;
      expect(pausedUntilMs).toBeGreaterThanOrEqual(expectedMin);
      expect(pausedUntilMs).toBeLessThanOrEqual(expectedMax);

      // 3. Conversations status must be HUMAN_PAUSED
      const conv = Object.values(mockConversations)[0] as any;
      if (conv) {
        expect(conv.bot_paused).toBe(true);
        expect(conv.status).toBe('HUMAN_PAUSED');
      }
    });
  });

  describe('4. Order and Payment Parsing when Bot is Paused', () => {
    it('executes manual order interceptor even when session is HUMAN_PAUSED', async () => {
      const customerPhone = '628123456789';
      const sessionKey = `solusiads_${customerPhone}`;

      // Simulate bot already in HUMAN_PAUSED state
      mockSessions[sessionKey] = {
        tenant_id: 'solusiads',
        session_id: `wa_solusiads_${customerPhone}`,
        user_identifier: customerPhone,
        current_state: 'HUMAN_PAUSED',
        is_paused: true,
        paused_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      // Customer sends a manual order confirmation message
      const webhookPayload = {
        event: 'messages.upsert',
        instance: 'merchant-evo-test',
        data: {
          key: {
            remoteJid: `${customerPhone}@s.whatsapp.net`,
            fromMe: false,
            id: 'CUST-MSG-1',
          },
          message: {
            conversation: 'Halo kak, Total Nominal: Rp 149.000 sudah saya transfer ke BCA an Budi. Mohon dicek dan aktivasi akses.',
          },
        },
      };

      const result = await processEvolutionWebhookEvent(webhookPayload, 'merchant-evo-test');

      // Order must be intercepted and confirmation reply dispatched
      expect(result.processed).toBe(1);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/message/sendText'),
        expect.objectContaining({
          body: expect.stringContaining('verifikasi manual'),
        })
      );
    });

    it('executes payment mutation parsing even when session is HUMAN_PAUSED', async () => {
      const customerPhone = '628123456789';
      const sessionKey = `solusiads_${customerPhone}`;

      // Seed pending order in mock database
      mockOrders.push({
        id: 'ord-test-uuid-999',
        order_number: 'ORD-POS-261004-ABCDEF',
        gross_amount: 149000,
        customer_phone: customerPhone,
        customer_name: 'John Doe',
        product_title: 'Masterclass CPM 24 Jam',
        status: 'PENDING',
        payment_status: 'PENDING',
      });

      // Session in HUMAN_PAUSED
      mockSessions[sessionKey] = {
        tenant_id: 'solusiads',
        session_id: `wa_solusiads_${customerPhone}`,
        user_identifier: customerPhone,
        current_state: 'HUMAN_PAUSED',
        is_paused: true,
        paused_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      // Inbound payment notification arrives
      const webhookPayload = {
        event: 'messages.upsert',
        instance: 'merchant-evo-test',
        data: {
          key: {
            remoteJid: `${customerPhone}@s.whatsapp.net`,
            fromMe: false,
            id: 'PAY-MSG-1',
          },
          message: {
            conversation: 'DANA Bisnis: Pembayaran diterima sebesar Rp 149.000 dari Pelanggan',
          },
        },
      };

      const result = await processEvolutionWebhookEvent(webhookPayload, 'merchant-evo-test');

      // 1. Order status must be updated to PAID
      const targetOrder = mockOrders.find((o) => o.id === 'ord-test-uuid-999');
      expect(targetOrder?.status).toBe('PAID');
      expect(targetOrder?.payment_status).toBe('PAID');

      // 2. Payment confirmation auto-reply must be sent
      expect(result.processed).toBe(1);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/message/sendText'),
        expect.objectContaining({
          body: expect.stringContaining('PEMBAYARAN DITERIMA & DIVERIFIKASI'),
        })
      );
    });

    it('mutes casual AI conversations when session is HUMAN_PAUSED', async () => {
      const customerPhone = '628123456789';
      const sessionKey = `solusiads_${customerPhone}`;

      // Session in HUMAN_PAUSED
      mockSessions[sessionKey] = {
        tenant_id: 'solusiads',
        session_id: `wa_solusiads_${customerPhone}`,
        user_identifier: customerPhone,
        current_state: 'HUMAN_PAUSED',
        is_paused: true,
        paused_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      // Casual inquiry (NOT order pattern, NOT payment notification)
      const webhookPayload = {
        event: 'messages.upsert',
        instance: 'merchant-evo-test',
        data: {
          key: {
            remoteJid: `${customerPhone}@s.whatsapp.net`,
            fromMe: false,
            id: 'CASUAL-MSG-1',
          },
          message: {
            conversation: 'Halo kak, apakah ada diskon?',
          },
        },
      };

      await processEvolutionWebhookEvent(webhookPayload, 'merchant-evo-test');

      // Must be muted: NO sendText call for AI response
      const sendTextCalls = (global.fetch as jest.Mock).mock.calls.filter((c: any[]) =>
        typeof c[0] === 'string' && c[0].includes('/message/sendText')
      );
      expect(sendTextCalls.length).toBe(0);
    });
  });

  describe('5. Atomic State Mutation & RBAC (bot-control-service)', () => {
    it('enforces tenant-level RBAC: blocks CS role from changing global tenant bot status', async () => {
      const result = await executeBotControl({
        action: 'PAUSE',
        scope: 'tenant',
        tenantId: 'solusiads',
        userRole: 'cs',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('FORBIDDEN_TENANT_ROLE');
    });

    it('permits tenant-level toggle for owner role and updates BOT_ENABLED / BOT_DISABLED', async () => {
      const pauseRes = await executeBotControl({
        action: 'PAUSE',
        scope: 'tenant',
        tenantId: 'solusiads',
        userRole: 'owner',
      });

      expect(pauseRes.success).toBe(true);
      expect(pauseRes.status).toBe('BOT_DISABLED');
      expect(pauseRes.bot_paused).toBe(true);

      const resumeRes = await executeBotControl({
        action: 'RESUME',
        scope: 'tenant',
        tenantId: 'solusiads',
        userRole: 'admin',
      });

      expect(resumeRes.success).toBe(true);
      expect(resumeRes.status).toBe('BOT_ENABLED');
      expect(resumeRes.bot_paused).toBe(false);
    });

    it('permits conversation-level toggle for CS role with AI_ACTIVE / HUMAN_HANDOVER without mutating tenants', async () => {
      const targetPhone = '628999888777';

      const handoverRes = await executeBotControl({
        action: 'PAUSE',
        scope: 'conversation',
        tenantId: 'solusiads',
        customerPhone: targetPhone,
        userRole: 'cs',
      });

      expect(handoverRes.success).toBe(true);
      expect(handoverRes.status).toBe('HUMAN_HANDOVER');
      expect(handoverRes.bot_paused).toBe(true);

      // Verify conversation session is updated
      const sessionKey = `solusiads_${targetPhone}`;
      expect(mockSessions[sessionKey]?.current_state).toBe('HUMAN_PAUSED');
      expect(mockSessions[sessionKey]?.bot_status).toBe('HUMAN_HANDOVER');

      // Verify conversation can be resumed back to AI_ACTIVE by CS
      const aiActiveRes = await executeBotControl({
        action: 'RESUME',
        scope: 'conversation',
        tenantId: 'solusiads',
        customerPhone: targetPhone,
        userRole: 'cs',
      });

      expect(aiActiveRes.success).toBe(true);
      expect(aiActiveRes.status).toBe('AI_ACTIVE');
      expect(aiActiveRes.bot_paused).toBe(false);
      expect(mockSessions[sessionKey]?.current_state).toBe('ACTIVE');
      expect(mockSessions[sessionKey]?.bot_status).toBe('AI_ACTIVE');
    });

    it('fails atomic execution if Supabase update returns an error', async () => {
      const failingSupabase = {
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            or: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({ data: { id: 'uuid-1', slug: 'test' }, error: null })),
            })),
          })),
          update: jest.fn(() => ({
            or: jest.fn(async () => ({ data: null, error: new Error('Database connection lost') })),
            eq: jest.fn(async () => ({ data: null, error: new Error('Database connection lost') })),
          })),
        })),
      };

      const result = await executeBotControl({
        action: 'PAUSE',
        scope: 'tenant',
        tenantId: 'solusiads',
        userRole: 'owner',
        supabase: failingSupabase,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
