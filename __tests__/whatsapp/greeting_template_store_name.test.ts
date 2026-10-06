import { processMultimodalChat } from '@/lib/ai/multimodal-chat';
import { ConversationEngine } from '@/lib/conversationEngine';

// Mock Supabase client
const mockTenantsDb: Record<string, any> = {
  '46cf50c6-18ff-4c1d-88a4-d86001d754c7': {
    id: '46cf50c6-18ff-4c1d-88a4-d86001d754c7',
    slug: 'solusi-ads',
    name: 'Solusi Ads Agency',
    category: 'service',
    metadata: {
      business_name: 'Solusi Ads Agency',
      store_name: 'Solusi Ads Agency',
      products: [],
    },
  },
  'solusi-ads': {
    id: '46cf50c6-18ff-4c1d-88a4-d86001d754c7',
    slug: 'solusi-ads',
    name: 'Solusi Ads Agency',
    category: 'service',
    metadata: {
      business_name: 'Solusi Ads Agency',
      store_name: 'Solusi Ads Agency',
      products: [],
    },
  },
  '11111111-2222-3333-4444-555555555555': {
    id: '11111111-2222-3333-4444-555555555555',
    slug: '11111111-2222-3333-4444-555555555555',
    name: '',
    category: 'retail',
    metadata: {},
  },
  'slug-only-store': {
    id: '99999999-8888-7777-6666-555555555555',
    slug: 'tokopedia-reseller',
    name: null,
    category: 'retail',
    metadata: {},
  },
};

jest.mock('@/lib/supabaseClient', () => ({
  getSupabase: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'tenants') {
        const queryBuilder: any = {
          eq: jest.fn((field: string, val: string) => ({
            maybeSingle: jest.fn(async () => {
              const found = mockTenantsDb[val] || null;
              return { data: found, error: null };
            }),
          })),
          or: jest.fn((orExpr: string) => ({
            maybeSingle: jest.fn(async () => {
              const matches = orExpr.match(/[0-9a-fA-F-]{36}/g);
              const val = matches ? matches[0] : '';
              const found = mockTenantsDb[val] || null;
              return { data: found, error: null };
            }),
          })),
        };
        return {
          select: jest.fn(() => queryBuilder),
        };
      }
      if (table === 'bot_profiles') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }
      const chainMock: any = {
        select: jest.fn(() => chainMock),
        eq: jest.fn(() => chainMock),
        or: jest.fn(() => chainMock),
        in: jest.fn(() => chainMock),
        order: jest.fn(() => chainMock),
        limit: jest.fn(() => chainMock),
        maybeSingle: jest.fn(async () => ({ data: null, error: null })),
        single: jest.fn(async () => ({ data: null, error: null })),
        upsert: jest.fn(async () => ({ data: null, error: null })),
        update: jest.fn(() => chainMock),
        insert: jest.fn(async () => ({ data: null, error: null })),
        then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
      };

      if (table === 'tenants') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn((field: string, val: string) => ({
              maybeSingle: jest.fn(async () => {
                const found = mockTenantsDb[val] || null;
                return { data: found, error: null };
              }),
            })),
          })),
        };
      }
      if (table === 'conversation_sessions') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({
                data: {
                  session_id: 'sess-test-123',
                  current_state: 'ACTIVE',
                  is_paused: false,
                },
                error: null,
              })),
            })),
          })),
          upsert: jest.fn(async () => ({ data: null, error: null })),
          update: jest.fn(() => chainMock),
        };
      }
      return chainMock;
    }),
  })),
  getSupabaseAdmin: jest.fn(() => null),
}));

describe('Greeting Template Store Name Resolution (Zero UUID Leak)', () => {
  const UUID_REGEX = /[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}/i;

  it('uses tenant.name (Solusi Ads Agency) instead of raw UUID in multimodal chat fallback greeting', async () => {
    const result = await processMultimodalChat({
      tenant_slug: '46cf50c6-18ff-4c1d-88a4-d86001d754c7',
      tenant_id: '46cf50c6-18ff-4c1d-88a4-d86001d754c7',
      message: 'Halo, saya mau tanya seputar jasa',
      sender_phone: '6281237450222',
    });

    expect(result.success).toBe(true);
    // Greeting template must contain real name
    expect(result.reply).toContain('Solusi Ads Agency');
    // Greeting template must NEVER contain the raw UUID
    expect(result.reply).not.toMatch(UUID_REGEX);
  });

  it('falls back to formatted slug (Tokopedia Reseller) when tenant.name is empty', async () => {
    const result = await processMultimodalChat({
      tenant_slug: 'slug-only-store',
      message: 'Halo min',
      sender_phone: '6281237450222',
    });

    expect(result.success).toBe(true);
    expect(result.reply).toContain('Tokopedia Reseller');
    expect(result.reply).not.toMatch(UUID_REGEX);
  });

  it('falls back to "Toko Kami" when name is empty and slug is UUID, never leaking UUID', async () => {
    const result = await processMultimodalChat({
      tenant_slug: '11111111-2222-3333-4444-555555555555',
      message: 'Halo',
      sender_phone: '6281237450222',
    });

    expect(result.success).toBe(true);
    expect(result.reply).toContain('Toko Kami');
    expect(result.reply).not.toMatch(UUID_REGEX);
  });

  it('conversationEngine resolves storeName to tenant.name and never outputs raw UUID', async () => {
    const result = await ConversationEngine.process({
      session_id: 'sess-test-123',
      tenant_id: '46cf50c6-18ff-4c1d-88a4-d86001d754c7',
      user_identifier: '6281237450222',
      channel: 'WHATSAPP',
      message: 'Halo mau tanya produk',
    });

    expect(result.reply.toLowerCase()).toContain('solusi ads agency');
    expect(result.reply).not.toMatch(UUID_REGEX);
  });
});
