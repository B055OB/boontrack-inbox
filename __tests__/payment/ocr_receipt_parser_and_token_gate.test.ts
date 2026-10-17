/**
 * @file __tests__/payment/ocr_receipt_parser_and_token_gate.test.ts
 * @description Unit tests for OCR Receipt Parser (BCA IDR xx,xxx.00 decimal fix)
 * and Token Balance Gate (Silent No-Op when balance <= 0).
 */

import { parseTransferProofAmount, parseReceiptAmount } from '@/lib/payment-evidence-service';
import { parseIdrAmount, parseBcaMutation } from '@/lib/paymentParsers/bcaParser';
import {
  processEvolutionWebhookEvent,
  resolveTenantTokenBalance,
} from '@/lib/whatsapp/evolution-webhook-handler';
import { processMultimodalChat } from '@/lib/ai/multimodal-chat';
import { clearRuntimeSessionCache } from '@/lib/whatsapp/bot-control-service';

// Mock processMultimodalChat to spy on invocations
jest.mock('@/lib/ai/multimodal-chat', () => ({
  processMultimodalChat: jest.fn(async () => ({
    success: true,
    reply: 'Halo! Ada yang bisa kami bantu?',
    tenant_id: 'test-tenant-uuid',
    tenant_slug: 'test-store',
  })),
}));

jest.mock('@/lib/whatsapp/activation', () => ({
  normalizeWhatsAppNumber: jest.fn((num: string) => {
    if (!num) return '';
    const clean = num.replace(/\D/g, '');
    if (clean.startsWith('0')) return '62' + clean.slice(1);
    return clean;
  }),
  extractActivationCode: jest.fn(() => null),
  processStoreActivation: jest.fn(async () => ({ success: false })),
}));

// Mock inbox persistence to isolate webhook processing
jest.mock('@/lib/whatsapp/inbox-persistence', () => ({
  cleanCustomerPhone: jest.fn((p: string) => (p || '').replace(/\D/g, '')),
  resolveTenantFromConnection: jest.fn(async () => ({
    tenantId: '52967979-4760-4cea-b686-cdbdb389c0e1',
    tenantSlug: 'test-store',
    tenantName: 'Test Store',
    apiKey: 'test-api-key',
  })),
  persistInboundMessage: jest.fn(async () => ({
    conversationId: 'conv-123',
    messageId: 'msg-123',
  })),
  persistOutboundMessage: jest.fn(async () => ({
    conversationId: 'conv-123',
    messageId: 'out-123',
  })),
}));

// Mock fetch for WhatsApp sending & presence
global.fetch = jest.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({ status: 'SUCCESS' }),
})) as any;

// Mock Supabase
const mockUpsert = jest.fn(async () => ({ data: null, error: null }));
const mockUpdate = jest.fn(() => ({
  eq: jest.fn(async () => ({ data: null, error: null })),
  in: jest.fn(async () => ({ data: null, error: null })),
}));
const mockInsert = jest.fn(async () => ({ data: null, error: null }));

let mockTenantDbRow: any = {
  id: '52967979-4760-4cea-b686-cdbdb389c0e1',
  slug: 'test-store',
  name: 'Test Store',
  bot_paused: false,
  is_bot_active: true,
  metadata: {
    token_balance: 100,
  },
};

const mockSupabase = {
  from: jest.fn((table: string) => {
    if (table === 'whatsapp_connections') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: {
                tenant_id: '52967979-4760-4cea-b686-cdbdb389c0e1',
                instance_name: 'test-instance',
                credential_ref: 'test-api-key',
                status: 'CONNECTED',
              },
              error: null,
            })),
          })),
        })),
      };
    }

    if (table === 'tenants') {
      return {
        select: jest.fn(() => ({
          or: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: mockTenantDbRow,
              error: null,
            })),
          })),
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: mockTenantDbRow,
              error: null,
            })),
          })),
        })),
        update: mockUpdate,
      };
    }

    if (table === 'conversation_sessions') {
      return {
        upsert: mockUpsert,
        select: jest.fn(() => ({
          in: jest.fn(() => ({
            in: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({ data: null, error: null })),
            })),
          })),
        })),
      };
    }

    if (table === 'conversations') {
      return {
        select: jest.fn(() => ({
          or: jest.fn(() => ({
            order: jest.fn(() => ({
              limit: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: { id: 'conv-123' }, error: null })),
              })),
            })),
          })),
        })),
        update: mockUpdate,
      };
    }

    if (table === 'messages') {
      return {
        select: jest.fn(() => ({
          order: jest.fn(() => ({
            limit: jest.fn(() => ({
              eq: jest.fn(async () => ({ data: [], error: null })),
              or: jest.fn(() => ({
                in: jest.fn(async () => ({ data: [], error: null })),
              })),
            })),
          })),
        })),
        insert: mockInsert,
      };
    }

    return {
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => ({ data: null, error: null })),
        })),
        or: jest.fn(() => ({
          maybeSingle: jest.fn(async () => ({ data: null, error: null })),
        })),
      })),
      upsert: mockUpsert,
      update: mockUpdate,
      insert: mockInsert,
    };
  }),
};

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => mockSupabase),
  getSupabase: jest.fn(() => mockSupabase),
}));

describe('1. OCR Receipt Nominal Parser (BCA IDR xx,xxx.00 Bug Fix)', () => {
  describe('Mandatory Spec Samples', () => {
    it('parses "IDR 99,911.00" to integer 99911 without trailing decimal inflation to 9991100', () => {
      const result = parseTransferProofAmount('IDR 99,911.00');
      expect(result).toBe(99911);
      expect(result).not.toBe(9991100);
    });

    it('parses "Rp 99.911,00" to integer 99911', () => {
      const result = parseTransferProofAmount('Rp 99.911,00');
      expect(result).toBe(99911);
      expect(result).not.toBe(9991100);
    });

    it('parses "99911" to integer 99911', () => {
      const result = parseTransferProofAmount('99911');
      expect(result).toBe(99911);
    });

    it('parses "Rp 99.911" to integer 99911', () => {
      const result = parseTransferProofAmount('Rp 99.911');
      expect(result).toBe(99911);
    });
  });

  describe('bcaParser parseIdrAmount & parseBcaMutation Integration', () => {
    it('parseIdrAmount strips (.00|,00)$ before stripping non-digits', () => {
      expect(parseIdrAmount('IDR 99,911.00')).toBe(99911);
      expect(parseIdrAmount('Rp 99.911,00')).toBe(99911);
      expect(parseIdrAmount('99911')).toBe(99911);
      expect(parseIdrAmount('Rp 99.911')).toBe(99911);
    });

    it('parses full BCA notification text containing IDR 99,911.00', () => {
      const bcaSlip = `
        BCA MOBILE
        TRANSFER BERHASIL
        TANGGAL: 17/10/2026 10:30:00
        NOMINAL: IDR 99,911.00
        NO. REFERENSI: 20261017009812
      `;
      const parsed = parseBcaMutation(bcaSlip);
      expect(parsed).not.toBeNull();
      expect(parsed?.amount).toBe(99911);
      expect(parsed?.referenceNumber).toBe('20261017009812');
      expect(parsed?.bank).toBe('BCA');
    });

    it('handles numeric input and null/undefined gracefully', () => {
      expect(parseTransferProofAmount(99911)).toBe(99911);
      expect(parseTransferProofAmount(null)).toBeNull();
      expect(parseTransferProofAmount(undefined)).toBeNull();
      expect(parseTransferProofAmount('')).toBeNull();
    });
  });
});

describe('2. Token Balance Gate (Silent No-Op)', () => {
  beforeEach(() => {
    clearRuntimeSessionCache();
    jest.clearAllMocks();
    process.env.EVOLUTION_API_KEY = 'test-evo-key';
  });

  it('resolveTenantTokenBalance correctly extracts token balance from column and metadata variations', () => {
    expect(resolveTenantTokenBalance({ token_balance: 50 })).toBe(50);
    expect(resolveTenantTokenBalance({ metadata: { token_balance: 0 } })).toBe(0);
    expect(resolveTenantTokenBalance({ metadata: { tokens_balance: -5 } })).toBe(-5);
    expect(resolveTenantTokenBalance({ metadata: { ai_tokens: 120 } })).toBe(120);
    expect(resolveTenantTokenBalance({ metadata: { balance: 0 } })).toBe(0);
    expect(resolveTenantTokenBalance({ metadata: {} })).toBeNull();
  });

  it('silently drops webhook, does not call AI, does not send message, and marks session as needing CS when token balance <= 0', async () => {
    // Set tenant token balance to 0 (exhausted)
    mockTenantDbRow = {
      id: '52967979-4760-4cea-b686-cdbdb389c0e1',
      slug: 'test-store',
      name: 'Test Store',
      bot_paused: false,
      is_bot_active: true,
      metadata: {
        token_balance: 0, // EXHAUSTED!
      },
    };

    const webhookPayload = {
      event: 'messages.upsert',
      instance: 'test-instance',
      data: {
        key: {
          remoteJid: '628123456789@s.whatsapp.net',
          fromMe: false,
          id: 'TEST_MSG_TOKEN_EXHAUSTED',
        },
        message: {
          conversation: 'Halo kak, produk ini masih ready?',
        },
      },
    };

    const result = await processEvolutionWebhookEvent(webhookPayload, 'test-instance');

    // 1. Returns success: true with processed count (returns 200 to webhook caller)
    expect(result.success).toBe(true);
    expect(result.processed).toBe(1);

    // 2. MUST NOT call AI API
    expect(processMultimodalChat).not.toHaveBeenCalled();

    // 3. Marks session in conversation_sessions as requiring human CS (HANDOVER_TO_HUMAN & token_balance_exhausted)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        current_state: 'HANDOVER_TO_HUMAN',
        is_paused: true,
        paused_by: 'token_balance_exhausted',
      }),
      expect.anything()
    );

    // 4. Updates conversations status to needs_cs / HUMAN_ACTIVE
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        bot_paused: true,
        bot_mode: 'HUMAN_ACTIVE',
        status: 'needs_cs',
      })
    );
  });

  it('proceeds to call AI when token balance > 0', async () => {
    // Set tenant token balance to 50 (healthy)
    mockTenantDbRow = {
      id: '52967979-4760-4cea-b686-cdbdb389c0e1',
      slug: 'test-store',
      name: 'Test Store',
      bot_paused: false,
      is_bot_active: true,
      metadata: {
        token_balance: 50, // POSITIVE BALANCE
      },
    };

    const webhookPayload = {
      event: 'messages.upsert',
      instance: 'test-instance',
      data: {
        key: {
          remoteJid: '628987654321@s.whatsapp.net',
          fromMe: false,
          id: 'TEST_MSG_TOKEN_HEALTHY',
        },
        message: {
          conversation: 'Berapa harga paket toko?',
        },
      },
    };

    const result = await processEvolutionWebhookEvent(webhookPayload, 'test-instance');

    expect(result.success).toBe(true);
    // AI API SHOULD be invoked when balance > 0
    expect(processMultimodalChat).toHaveBeenCalledTimes(1);
  });
});
