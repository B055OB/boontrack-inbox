import {
  getCompositeSessionKey,
  getBotSessionState,
  pauseBotForConversation,
  resumeBotForConversation,
  clearSessionCacheForTest,
  routeTenantInboundMessage,
} from '@/lib/bot/tenant-bot-isolation';
import { processZeroAiMessage } from '@/lib/zero-ai-engine';

// Mock Supabase to simulate real-world Multi-Tenant Database
const mockTenantsDb: Record<string, any> = {
  'tumbuh-kembang-anak': {
    id: '692080ea-81b7-496b-87ee-bd8b9565b28c',
    slug: 'tumbuh-kembang-anak',
    name: 'Tumbuh Kembang Anak',
    category: 'KLINIK_KONSULTASI',
    business_type: 'CLINIC',
    metadata: {
      category: 'KLINIK_KONSULTASI',
      store_name: 'Tumbuh Kembang Anak',
      headline: 'Klinik Tumbuh Kembang Anak (dr. Harys Maulana & dr. Azizah Ridwan)',
      whatsapp_number: '6285129992305',
      interactive_menus: [
        {
          id: 'menu_tumbuh_kembang',
          title: 'Layanan Tumbuh Kembang Anak',
          trigger: 'Layanan Konsultasi Tumbuh Kembang Anak',
          header_text: 'Klinik Tumbuh Kembang Anak (dr. Harys Maulana & dr. Azizah Ridwan)',
          description: 'Halo Ayah & Bunda! Selamat datang di layanan konsultasi resmi Tumbuh Kembang Anak.',
          options: [
            {
              id: 'opt_catalog',
              title: '1. Paket Konsultasi & Biaya',
              description: 'Chat WhatsApp, Google Meet, & Kunjungan Klinik',
              responseText: 'CATALOG',
            },
            {
              id: 'opt_book_consultation',
              title: '2. Jadwal Konsultasi Dokter',
              description: 'Senin–Jumat 08.00–11.30 WIB',
              responseText: 'HOW_TO_ORDER',
            },
            {
              id: 'opt_gtm_nutrition',
              title: '3. Konsultasi Nutrisi & Masalah Makan',
              description: 'Solusi GTM, BB seret, & panduan nutrisi bersama dr. Harys',
              responseText: 'NUTRITION_CONSULT',
            },
            {
              id: 'opt_screening',
              title: '4. Screening Stimulasi Anak',
              description: 'Evaluasi tumbuh kembang & sensori bersama dr. Azizah',
              responseText: 'SCREENING_CONSULT',
            },
            {
              id: 'opt_human_cs',
              title: '5. Chat Admin / Pendaftaran',
              description: 'Hubungi tim pendaftaran klinik via WhatsApp',
              responseText: 'HUMAN_CS',
            },
          ],
        },
      ],
      quick_replies: [
        '🩺 Konsultasi Tumbuh Kembang',
        '📅 Jadwal Terapi & Screening',
        '💰 Tanya Paket & Biaya',
        '🥣 Nutrisi & Masalah Makan (GTM)',
      ],
    },
  },
  'toko-demo': {
    id: 'e28b8290-0000-4000-8000-000000000001',
    slug: 'toko-demo',
    name: 'Toko Retail Demo',
    category: 'RETAIL',
    business_type: 'RETAIL',
    metadata: {
      category: 'RETAIL',
      store_name: 'Toko Retail Demo',
      whatsapp_number: '628111222333',
      quick_replies: [
        '📦 Cek Katalog & Promo',
        '🚚 Cek Ongkir & Resi',
        '💬 Hubungi Live CS',
      ],
      products: [
        { id: 'prod-1', name: 'Kaos Polos Premium', price: 99000, slug: 'kaos-polos' },
        { id: 'prod-2', name: 'Kemeja Formal Oxford', price: 189000, slug: 'kemeja-oxford' },
      ],
    },
  },
};

function createMockSupabase() {
  return {
    from: (table: string) => {
      let selectedFields = '*';
      let whereConditions: Record<string, any> = {};

      const queryBuilder: any = {
        select: (fields: string = '*') => {
          selectedFields = fields;
          return queryBuilder;
        },
        eq: (col: string, val: any) => {
          whereConditions[col] = val;
          return queryBuilder;
        },
        or: (clause: string) => {
          const parts = clause.split(',');
          for (const p of parts) {
            const [c, op, v] = p.split('.');
            if (op === 'eq' && (mockTenantsDb[v] || Object.values(mockTenantsDb).some((t) => t.id === v))) {
              whereConditions['slug_or_id'] = v;
            }
          }
          return queryBuilder;
        },
        in: (col: string, vals: any[]) => {
          whereConditions[col] = vals;
          return queryBuilder;
        },
        order: () => queryBuilder,
        limit: () => queryBuilder,
        maybeSingle: async () => {
          if (table === 'tenants') {
            const key = whereConditions['slug'] || whereConditions['id'] || whereConditions['slug_or_id'];
            const tenant =
              mockTenantsDb[key] ||
              Object.values(mockTenantsDb).find((t) => t.id === key || t.slug === key);
            return { data: tenant ? { ...tenant } : null, error: null };
          }
          if (table === 'conversations') {
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
        update: () => queryBuilder,
        upsert: () => queryBuilder,
        insert: () => queryBuilder,
        then: (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve),
      };

      return queryBuilder;
    },
  };
}

const mockSupabase = createMockSupabase();

jest.mock('@/lib/supabaseClient', () => {
  return {
    getSupabaseAdmin: () => mockSupabase,
    getSupabase: () => mockSupabase,
  };
});

describe('MULTI-TENANT BOT ISOLATION & ZERO CROSS-TENANT LEAKAGE SPECIFICATION', () => {
  beforeEach(() => {
    clearSessionCacheForTest();
  });

  describe('1. Strict Query Scoping & Menu Isolation', () => {
    it('returns Clinic menu and doctor options for Tenant A (tumbuh-kembang-anak)', async () => {
      const resA = await routeTenantInboundMessage({
        tenantIdOrSlug: 'tumbuh-kembang-anak',
        senderPhone: '08123456789',
        message: 'halo',
        supabaseClient: mockSupabase,
      });

      expect(resA.handled).toBe(true);
      expect(resA.reply.toLowerCase()).toContain('klinik tumbuh kembang anak');
      expect(resA.reply).toContain('dr. Harys');
      expect(resA.reply).toContain('dr. Azizah');
      expect(resA.reply).toContain('Konsultasi Nutrisi & Masalah Makan');

      // Negative assertion: Must NEVER contain retail terms
      expect(resA.reply).not.toContain('Kaos Polos');
      expect(resA.reply).not.toContain('Cek Ongkir & Resi');
    });

    it('returns Retail menu for Tenant B (toko-demo) and NEVER leaks dr. Harys clinic data', async () => {
      const resB = await processZeroAiMessage({
        tenant_slug: 'toko-demo',
        sender_phone: '08123456789',
        message: 'halo',
      });

      // Tenant B either handles greeting via zero-ai retail or default retail
      if (resB.handled) {
        expect(resB.reply).not.toContain('dr. Harys');
        expect(resB.reply).not.toContain('dr. Azizah');
        expect(resB.reply).not.toContain('GTM');
        expect(resB.reply).not.toContain('MPASI');
        expect(resB.reply).not.toContain('Speech Delay');
      }

      // Verify menu trigger to Tenant B
      const menuB = await processZeroAiMessage({
        tenant_slug: 'toko-demo',
        sender_phone: '08123456789',
        message: 'menu',
      });

      expect(menuB.handled).toBe(true);
      expect(menuB.reply.toLowerCase()).toContain('toko retail demo');
      expect(menuB.reply).not.toContain('dr. Harys');
      expect(menuB.reply).not.toContain('dr. Azizah');
      expect(menuB.reply).not.toContain('Klinik Tumbuh Kembang Anak');
    });
  });

  describe('2. Isolated Bot State & Session Context (${tenantId}:${senderPhone})', () => {
    it('pausing bot in Tenant A has ZERO effect on Tenant B for the exact same phone number', async () => {
      const sharedPhone = '+6281299990001';

      // 1. Initially both tenants have active bots for this phone
      const stateA1 = await getBotSessionState('tumbuh-kembang-anak', sharedPhone, mockSupabase);
      const stateB1 = await getBotSessionState('toko-demo', sharedPhone, mockSupabase);

      expect(stateA1.bot_paused).toBe(false);
      expect(stateB1.bot_paused).toBe(false);
      expect(stateA1.composite_key).toBe('tumbuh-kembang-anak:+6281299990001');
      expect(stateB1.composite_key).toBe('toko-demo:+6281299990001');

      // 2. Pause bot in Tenant A (e.g. parent asks for human admin)
      await pauseBotForConversation('tumbuh-kembang-anak', sharedPhone, 'PARENT_REQUESTED_ADMIN_CS', 120, mockSupabase);

      // 3. Verify Tenant A is paused
      const stateA2 = await getBotSessionState('tumbuh-kembang-anak', sharedPhone, mockSupabase);
      expect(stateA2.bot_paused).toBe(true);
      expect(stateA2.current_step).toBe('HUMAN_TAKEOVER');

      // 4. CRITICAL: Verify Tenant B is STILL ACTIVE and NOT PAUSED for this phone
      const stateB2 = await getBotSessionState('toko-demo', sharedPhone, mockSupabase);
      expect(stateB2.bot_paused).toBe(false);

      // 5. Simulate inbound message to Tenant A -> Bot must be silent/drop
      const chatA = await routeTenantInboundMessage({
        tenantIdOrSlug: 'tumbuh-kembang-anak',
        senderPhone: sharedPhone,
        message: 'Halo, saya mau nanya lagi dong',
        supabaseClient: mockSupabase,
      });

      expect(chatA.handled).toBe(true);
      expect(chatA.bot_paused).toBe(true);
      expect(chatA.reply).toBe('');

      // 6. Simulate inbound message to Tenant B from the SAME phone -> Bot responds actively!
      const menuB = await processZeroAiMessage({
        tenant_slug: 'toko-demo',
        sender_phone: sharedPhone,
        message: 'menu',
      });

      expect(menuB.handled).toBe(true);
      expect(menuB.reply.toLowerCase()).toContain('toko retail demo');
      expect(menuB.silent).toBeFalsy();
    });

    it('resuming bot in Tenant A does not alter Tenant B state', async () => {
      const sharedPhone = '+6281299990002';

      // Pause both independently
      await pauseBotForConversation('tumbuh-kembang-anak', sharedPhone, 'ADMIN_A', 60, mockSupabase);
      await pauseBotForConversation('toko-demo', sharedPhone, 'ADMIN_B', 60, mockSupabase);

      // Resume only in Tenant A
      await resumeBotForConversation('tumbuh-kembang-anak', sharedPhone, mockSupabase);

      const stateA = await getBotSessionState('tumbuh-kembang-anak', sharedPhone, mockSupabase);
      const stateB = await getBotSessionState('toko-demo', sharedPhone, mockSupabase);

      expect(stateA.bot_paused).toBe(false);
      expect(stateB.bot_paused).toBe(true); // Tenant B remains paused!
    });
  });

  describe('3. Decision Tree Bot & Campaign Routing for Tumbuh Kembang Anak', () => {
    it('routes campaign "mpasi_anti_gtm" directly to nutrition consult node', async () => {
      const res = await routeTenantInboundMessage({
        tenantIdOrSlug: 'tumbuh-kembang-anak',
        senderPhone: '+6281234567890',
        message: 'Halo dokter, anak saya GTM parah dan berat badan seret',
        campaignHint: 'mpasi_anti_gtm',
        supabaseClient: mockSupabase,
      });

      expect(res.handled).toBe(true);
      expect(res.intent_key).toBe('NUTRITION_CONSULT');
      expect(res.reply).toContain('KONSULTASI NUTRISI, MASALAH MAKAN & GTM');
      expect(res.reply).toContain('Tim Dokter Klinik Tumbuh Kembang Anak');
      expect(res.reply).toContain('WHO Child Growth Standards');
      expect(res.quick_actions).toContain('📅 Jadwal Konsultasi Dokter');
    });

    it('routes campaign "speech_delay" directly to dr. Azizah screening node', async () => {
      const res = await routeTenantInboundMessage({
        tenantIdOrSlug: 'tumbuh-kembang-anak',
        senderPhone: '+6281234567890',
        message: 'Mau tanya penanganan speech delay dan sensori anak',
        campaignHint: 'speech_delay',
        supabaseClient: mockSupabase,
      });

      expect(res.handled).toBe(true);
      expect(res.intent_key).toBe('SCREENING_CONSULT');
      expect(res.reply).toContain('SCREENING STIMULASI & EVALUASI TUMBUH KEMBANG');
      expect(res.reply).toContain('1.000 Hari Pertama Kehidupan');
      expect(res.quick_actions).toContain('📅 Jadwal Screening Dokter');
    });

    it('routes doctor schedule inquiry to consultation schedule node', async () => {
      const res = await routeTenantInboundMessage({
        tenantIdOrSlug: 'tumbuh-kembang-anak',
        senderPhone: '+6281234567890',
        message: 'Jadwal praktik dokter hari apa saja?',
        supabaseClient: mockSupabase,
      });

      expect(res.handled).toBe(true);
      expect(res.intent_key).toBe('HOW_TO_ORDER');
      expect(res.reply).toContain('JADWAL KONSULTASI DOKTER KLINIK TUMBUH KEMBANG ANAK');
      expect(res.reply).toContain('Senin – Jumat: 08.00 – 11.30 WIB');
    });

    it('option 5 (Admin / Pendaftaran) pauses bot and transfers to human CS', async () => {
      const phone = '+6281234567899';
      const res = await routeTenantInboundMessage({
        tenantIdOrSlug: 'tumbuh-kembang-anak',
        senderPhone: phone,
        message: '5',
        supabaseClient: mockSupabase,
      });

      expect(res.handled).toBe(true);
      expect(res.type).toBe('HUMAN_TAKEOVER');
      expect(res.intent_key).toBe('HUMAN_CS');
      expect(res.bot_paused).toBe(true);
      expect(res.reply).toContain('MENGHUBUNGKAN DENGAN TIM PENDAFTARAN KLINIK');

      // Verify session is now paused for this specific sender
      const state = await getBotSessionState('tumbuh-kembang-anak', phone, mockSupabase);
      expect(state.bot_paused).toBe(true);
      expect(state.current_step).toBe('HUMAN_TAKEOVER');
    });
  });
});
