import { ConversationEngine } from '@/lib/conversationEngine';

const mockBuzzerTenant = {
  id: 'edd76758-2792-4602-8c99-be37735e9de1',
  slug: 'buzzerukm',
  name: 'Buzzer UKM',
  category: 'DIGITAL',
  business_type: 'DIGITAL',
  metadata: {
    vertical_category: 'digital',
    vertical_type: 'DIGITAL',
    business_category: 'DIGITAL',
    category: 'DIGITAL',
    active_engine: 'SALES_REP_V1',
    ai_engine: 'SALES_REP_V1',
    engine_mode: 'SALES_REP_V1',
    bot_mode: 'HYBRID',
    is_bot_active: true,
    ai_knowledge: {
      ai_name: 'Raisa',
      persona_name: 'Raisa',
      persona_role: 'Konsultan Edukasi Bisnis Digital',
      tone: 'FRIENDLY_CONSULTATIVE',
      system_prompt: 'Kamu adalah konsultan edukasi & tools bisnis digital dari Buzzer UKM.',
      greeting_message: 'Halo Kak! Selamat datang di Buzzer UKM 🚀 Lagi butuh panduan untuk ningkatin omzet toko, belajar cara cuan dari affiliate produk digital, atau optimasi iklan Click-to-WhatsApp (CTWA)? Kakak lagi fokus di bidang apa nih biar Raisa bantu rekomendasikan kelas yang tepat?',
    },
    sales_policy: {
      closing_hook: 'Materi kelas berbentuk akses digital instan, begitu pembayaran QRIS selesai, link materi dan akses grup langsung aktif otomatis detik itu juga Kak!',
      price_objection: 'Harga kelas kami sangat terjangkau mulai dari 99rb - 159rb dan ini akses ilmu materi langsung pakai. Ilmu optimasi iklan atau affiliate ini bisa balik modal berkali-kali lipat hanya dari beberapa closing pertama Kak.',
      handover_trigger: 'hubungi cs, komplain pesanan, bicara dengan admin manusia',
      custom_do_and_donts: 'Dilarang memberikan file materi atau video secara manual di chat.',
    },
    faqs: [
      {
        id: 'faq_1',
        question: 'Setelah bayar dapatnya apa dan lewat apa?',
        answer: 'Akses materi full digital (video modul & panduan) yang dikirim otomatis langsung ke WhatsApp/email Kakak seketika setelah pembayaran terverifikasi.',
      },
    ],
    products: [
      {
        id: 'c7ba0001-7de7-4888-9999-000000000001',
        name: '7-Day Sprint CTWA Mastery (Closing Otomatis Tanpa Admin Ribet)',
        slug: 'ctwa-mastery-7day',
        price: 500000,
        promo_price: 100000,
        type: 'digital',
        description: 'Pelajari metode baru 7-Day Sprint CTWA Mastery bersama Kang Sakti.',
      },
      {
        id: '1789648640545',
        name: 'Belajar Affiliate Produk Digital',
        slug: 'belajar-affiliate-produk-digital',
        price: 299000,
        promo_price: 199000,
        type: 'digital',
      },
      {
        id: '1789644473555',
        name: 'Kelas Online Dimsum Premium',
        slug: 'kelas-online-dimsum-premium',
        price: 199000,
        promo_price: 99000,
        type: 'digital',
      },
    ],
  },
};

const mockFieldServiceTenant = {
  id: 'toren-tenant-id',
  slug: 'kurastorenkrw',
  name: 'Kuras Toren Karawang',
  category: 'FIELD_SERVICE',
  business_type: 'FIELD_SERVICE',
  metadata: {
    vertical_category: 'field_service',
    active_engine: 'LOCAL_SERVICE_V1',
  },
};

let currentMockTenant: any = mockBuzzerTenant;
let mockCurrentState = 'GREETING';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      const createBuilder = () => {
        let lastSlug = '';
        const b: any = {
          select: jest.fn(() => b),
          eq: jest.fn((col: string, val: string) => {
            if (col === 'slug' || col === 'tenant_id') {
              lastSlug = val;
            }
            return b;
          }),
          or: jest.fn(() => b),
          order: jest.fn(() => b),
          limit: jest.fn(() => b),
          maybeSingle: jest.fn(async () => {
            if (table === 'tenants') {
              if (lastSlug === 'kurastorenkrw' || currentMockTenant.slug === 'kurastorenkrw') {
                return { data: mockFieldServiceTenant, error: null };
              }
              return { data: currentMockTenant, error: null };
            }
            if (table === 'conversation_sessions') {
              return { data: { current_state: mockCurrentState }, error: null };
            }
            if (table === 'conversation_entities') {
              return { data: null, error: null };
            }
            return { data: null, error: null };
          }),
          single: jest.fn(async () => {
            if (table === 'tenants') return { data: currentMockTenant, error: null };
            if (table === 'conversation_sessions') return { data: { current_state: mockCurrentState }, error: null };
            return { data: null, error: null };
          }),
          then: (resolve: any) => {
            if (table === 'tenant_service_configs') {
              if (currentMockTenant.slug === 'kurastorenkrw') {
                return resolve({
                  data: [
                    { capacity: 520, price: 160000 },
                    { capacity: 1000, price: 200000 },
                  ],
                  error: null,
                });
              }
              return resolve({ data: [], error: null });
            }
            if (table === 'products') {
              return resolve({ data: currentMockTenant.metadata?.products || [], error: null });
            }
            return resolve({ data: [], error: null });
          },
          insert: jest.fn(() => b),
          update: jest.fn(() => b),
          upsert: jest.fn(async () => ({ data: null, error: null })),
          delete: jest.fn(() => b),
        };
        return b;
      };
      return createBuilder();
    }),
  })),
}));

describe('SALES_REP_V1 Engine & Global Routing', () => {
  beforeEach(() => {
    currentMockTenant = mockBuzzerTenant;
    mockCurrentState = 'GREETING';
  });

  it('routes buzzerukm to SALES_REP_V1 and returns consultative greeting without toren references', async () => {
    const res = await ConversationEngine.process({
      tenant_id: 'buzzerukm',
      channel: 'WEBCHAT',
      session_id: 'test_session_1',
      user_identifier: '081234567890',
      message: 'halo',
    });

    expect(res.active_engine).toBe('SALES_REP_V1');
    expect(res.state_trace).toContain('SALES_REP_V1');
    expect(res.reply.length).toBeGreaterThan(0);
    expect(res.reply).toContain('Buzzer UKM');
    expect(res.reply.toLowerCase()).not.toContain('toren');
    expect(res.reply.toLowerCase()).not.toContain('kuras');
  });

  it('matches FAQ Ground Truth in SALES_REP_V1', async () => {
    const res = await ConversationEngine.process({
      tenant_id: 'buzzerukm',
      channel: 'WEBCHAT',
      session_id: 'test_session_2',
      user_identifier: '081234567890',
      message: 'Setelah bayar dapatnya apa dan lewat apa?',
    });

    expect(res.active_engine).toBe('SALES_REP_V1');
    expect(res.state_trace).toContain('FAQ_GROUND_TRUTH_MATCH');
    expect(res.reply).toContain('Akses materi full digital');
  });

  it('handles Catalog inquiry in SALES_REP_V1', async () => {
    const res = await ConversationEngine.process({
      tenant_id: 'buzzerukm',
      channel: 'WEBCHAT',
      session_id: 'test_session_3',
      user_identifier: '081234567890',
      message: 'Ada produk atau kelas apa saja?',
    });

    expect(res.active_engine).toBe('SALES_REP_V1');
    expect(res.state_trace).toContain('SALES_REP_V1');
    expect(res.reply).toContain('7-Day Sprint CTWA Mastery');
    expect(res.reply.toLowerCase()).not.toContain('toren');
  });

  it('handles Price Objection according to store sales policy in SALES_REP_V1', async () => {
    mockCurrentState = 'ACTIVE';

    const res = await ConversationEngine.process({
      tenant_id: 'buzzerukm',
      channel: 'WEBCHAT',
      session_id: 'test_session_4',
      user_identifier: '081234567890',
      message: 'Harganya bisa nego gak, kemahalan nih?',
    });

    expect(res.active_engine).toBe('SALES_REP_V1');
    expect(res.state_trace).toContain('PRICE_OBJECTION_HANDLING');
    expect(res.reply).toContain('99rb - 159rb');
    expect(res.reply).toContain('balik modal berkali-kali lipat');
  });

  it('handles Buy Intent with Closing Hook and checkout link generation in SALES_REP_V1', async () => {
    mockCurrentState = 'ACTIVE';

    const res = await ConversationEngine.process({
      tenant_id: 'buzzerukm',
      channel: 'WEBCHAT',
      session_id: 'test_session_5',
      user_identifier: '081234567890',
      message: 'Saya mau daftar 7-Day Sprint CTWA Mastery',
    });

    expect(res.active_engine).toBe('SALES_REP_V1');
    expect(res.state_trace).toContain('BUY_INTENT');
    expect(res.state_trace).toContain('CLOSING_HOOK');
    expect(res.reply).toContain('7-Day Sprint CTWA Mastery');
    expect(res.reply).toContain('QRIS');
  });

  it('isolates field service: only invokes LOCAL_SERVICE_V1 for field_service tenants', async () => {
    currentMockTenant = mockFieldServiceTenant;

    const res = await ConversationEngine.process({
      tenant_id: 'kurastorenkrw',
      channel: 'WEBCHAT',
      session_id: 'test_session_6',
      user_identifier: '081234567890',
      message: 'halo',
    });

    expect(res.active_engine).toBe('LOCAL_SERVICE_V1');
    expect(res.state_trace).toContain('LOCAL_SERVICE_V1');
    expect(res.reply.toLowerCase()).toContain('toren');
  });
});
