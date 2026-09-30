import {
  isManualOrderMessage,
  getOrderConfirmationReply,
  MANUAL_ORDER_INTERCEPTOR_REGEX,
} from '@/lib/whatsapp/order-interceptor';
import { processEvolutionWebhookEvent } from '@/lib/whatsapp/evolution-webhook-handler';
import { processMultimodalChat } from '@/lib/ai/multimodal-chat';
import { ConversationEngine } from '@/lib/conversationEngine';

// Mock Supabase
const mockConnections: Record<string, any> = {
  'merchant-solusiads': {
    tenant_id: 'solusiads',
    instance_name: 'merchant-solusiads',
    credential_ref: 'api-key-solusiads',
    status: 'CONNECTED',
  },
};

const mockTenants: Record<string, any> = {
  solusiads: {
    id: 'tenant-uuid-solusiads',
    slug: 'solusiads',
    name: 'Solusi Ads',
    category: 'digital',
    metadata: {
      store_name: 'Solusi Ads',
      products: [
        { id: 'cpm-1', name: 'Masterclass CPM 24 Jam', price: 149000 },
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
                maybeSingle: jest.fn(async () => ({ data: null, error: null })),
              })),
            })),
            update: jest.fn(() => ({
              eq: jest.fn(async () => ({ data: null, error: null })),
            })),
          };
        }

        // Default mock for sessions, conversations, messages
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({ data: null, error: null })),
              single: jest.fn(async () => ({ data: null, error: null })),
              limit: jest.fn(async () => ({ data: [], error: null })),
            })),
            or: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: null, error: null })),
              })),
            })),
          })),
          insert: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn(async () => ({ data: { id: 'conv-123' }, error: null })),
            })),
          })),
          update: jest.fn(() => ({
            eq: jest.fn(async () => ({ data: null, error: null })),
          })),
          upsert: jest.fn(async () => ({ data: null, error: null })),
        };
      }),
    })),
    getSupabase: jest.fn(() => ({
      from: jest.fn((tableName: string) => {
        if (tableName === 'tenants') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn((_f: string, val: string) => ({
                maybeSingle: jest.fn(async () => ({
                  data: mockTenants[val] || null,
                  error: null,
                })),
              })),
            })),
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
    })),
  };
});

describe('1. MANUAL ORDER INTERCEPTOR (ORDER GATEKEEPER)', () => {
  it('detects all 4 target manual order patterns accurately', () => {
    // Pattern 1: Total Nominal:
    expect(isManualOrderMessage('Halo kak, Total Nominal: Rp 149.000 sudah saya transfer ya')).toBe(true);
    expect(isManualOrderMessage('Total Nominal : 149000')).toBe(true);

    // Pattern 2: Metode: Transfer Bank
    expect(isManualOrderMessage('Metode: Transfer Bank BCA an John Doe')).toBe(true);
    expect(isManualOrderMessage('Metode : Transfer Bank')).toBe(true);

    // Pattern 3: Mohon dicek dan aktivasi akses
    expect(isManualOrderMessage('Bukti tf terlampir, Mohon dicek dan aktivasi akses ya min')).toBe(true);

    // Pattern 4: Masterclass CPM
    expect(isManualOrderMessage('Saya baru saja transfer untuk Masterclass CPM')).toBe(true);
    expect(isManualOrderMessage('Konfirmasi pembelian Masterclass CPM 24 Jam')).toBe(true);
  });

  it('does NOT trigger on casual customer inquiries', () => {
    expect(isManualOrderMessage('Halo kak mau tanya harga')).toBe(false);
    expect(isManualOrderMessage('Apakah ada promo hari ini?')).toBe(false);
    expect(isManualOrderMessage('Lokasi toko dimana ya?')).toBe(false);
  });

  it('generates customized store confirmation auto-reply', () => {
    const reply = getOrderConfirmationReply('Solusi Ads');
    expect(reply).toContain('Solusi Ads');
    expect(reply).toContain('verifikasi manual');
    expect(reply).toContain('diaktivasi setelah pengecekan selesai');
  });

  it('intercepts manual order in processMultimodalChat and bypasses Gemini', async () => {
    const result = await processMultimodalChat({
      tenant_slug: 'solusiads',
      message: 'Halo min, Total Nominal: Rp 149.000 via Transfer Bank. Mohon dicek dan aktivasi akses Masterclass CPM.',
    });

    expect(result.success).toBe(true);
    expect(result.type).toBe('ORDER_PENDING_VERIFICATION');
    expect(result.reply).toContain('verifikasi manual');
  });

  it('intercepts manual order in ConversationEngine and sets session pending', async () => {
    const result = await ConversationEngine.process({
      tenant_id: 'solusiads',
      channel: 'WHATSAPP',
      session_id: '6281234567890',
      user_identifier: '6281234567890',
      message: 'Total Nominal: Rp 149.000, Metode: Transfer Bank. Mohon dicek dan aktivasi akses.',
    });

    expect(result.next_state).toBe('ORDER_PENDING_VERIFICATION');
    expect(result.bot_paused).toBe(true);
    expect(result.reply).toContain('verifikasi manual');
  });
});

describe('2. TENANT ISOLATION & FAIL CLOSED (GLOBAL ANTI-LEAK)', () => {
  it('fails closed (SILENT DROP) in Evolution Webhook when instance is unknown/unmapped', async () => {
    const payload = {
      event: 'messages.upsert',
      data: {
        key: { remoteJid: '6281999999999@s.whatsapp.net', fromMe: false },
        message: { conversation: 'Halo, info paket' },
      },
    };

    // Unknown instance "unmapped-merchant-xyz"
    const result = await processEvolutionWebhookEvent(payload, 'unmapped-merchant-xyz');

    // Must NOT process, must NOT fallback to 'boon', must silently drop
    expect(result.processed).toBe(0);
    expect(result.error).toContain('Tenant unresolved');
  });

  it('fails closed (SILENT DROP) in ConversationEngine when tenant_id is null or missing', async () => {
    const result = await ConversationEngine.process({
      tenant_id: '',
      channel: 'WHATSAPP',
      session_id: '6281234567890',
      user_identifier: '6281234567890',
      message: 'Halo mau beli',
    });

    expect(result.reply).toBe('');
    expect(result.next_state).toBe('DROPPED');
    expect(result.state_trace).toContain('FAIL_CLOSED_NULL_TENANT');
  });

  it('fails closed (SILENT DROP) in ConversationEngine when tenant does not exist in DB', async () => {
    const result = await ConversationEngine.process({
      tenant_id: 'non-existent-tenant-999',
      channel: 'WHATSAPP',
      session_id: '6281234567890',
      user_identifier: '6281234567890',
      message: 'Halo mau beli',
    });

    expect(result.reply).toBe('');
    expect(result.next_state).toBe('DROPPED');
    expect(result.state_trace).toContain('FAIL_CLOSED_TENANT_NOT_FOUND');
  });

  it('fails closed (SILENT DROP) in MultimodalChat when tenant is empty or general', async () => {
    const result = await processMultimodalChat({
      tenant_slug: '',
      message: 'Halo mau beli paket',
    });

    expect(result.success).toBe(false);
    expect(result.reply).toBe('');
    expect(result.silent).toBe(true);
  });
});
