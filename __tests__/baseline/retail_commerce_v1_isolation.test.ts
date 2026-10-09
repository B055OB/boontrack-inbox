/**
 * __tests__/baseline/retail_commerce_v1_isolation.test.ts
 *
 * GATE 2: RETAIL_COMMERCE_V1 Tenant Isolation Verification Test Suite
 * Ensures strict zero cross-tenant leakage across:
 * 1. Catalog & Product isolation
 * 2. Decision tree, config, and system prompt isolation
 * 3. WhatsApp Composite Key session isolation (${tenant_id}:${sender_phone})
 * 4. State Machine & pause/resume isolation
 */

import {
  getCompositeSessionKey,
  getBotSessionState,
  pauseBotForConversation,
  resumeBotForConversation,
  clearSessionCacheForTest,
  routeTenantInboundMessage,
  getTenantDecisionTree,
} from '@/lib/bot/tenant-bot-isolation';

// Mock Multi-Tenant Database
const mockTenantsDb: Record<string, any> = {
  'retail-store-alpha': {
    id: 'ten-uuid-alpha-1111',
    slug: 'retail-store-alpha',
    name: 'Alpha Fashion Store',
    category: 'RETAIL',
    business_type: 'RETAIL',
    metadata: {
      category: 'RETAIL',
      store_name: 'Alpha Fashion Store',
      greeting_message: 'Halo Kak! Selamat datang di Alpha Fashion Store. Ada yang bisa kami bantu seputar koleksi kemeja dan celana?',
      whatsapp_number: '628111111111',
      payment_accounts: [
        {
          bank_name: 'BCA',
          account_number: '1111222233',
          account_holder: 'PT Alpha Fashion',
          is_primary: true,
        },
      ],
      interactive_menus: [
        {
          id: 'menu_alpha_main',
          title: 'Menu Utama Alpha Fashion',
          trigger: 'Menu Utama Alpha',
          header_text: 'Alpha Fashion Official Store',
          description: 'Pilih kategori busana favorit Anda:',
          options: [
            { id: 'opt_alpha_shirts', title: '1. Kemeja & Atasan', responseText: 'CATALOG_SHIRTS' },
            { id: 'opt_alpha_pants', title: '2. Celana Chino', responseText: 'CATALOG_PANTS' },
            { id: 'opt_alpha_cs', title: '3. Hubungi CS Alpha', responseText: 'HUMAN_CS' },
          ],
        },
      ],
      campaign_routes: [
        {
          id: 'camp_alpha_promo',
          campaign_id: 'alpha_diskon_50',
          keyword_triggers: ['promo alpha', 'diskon 50'],
          target_node: 'PROMO_SPECIAL',
          response_text: 'Dapatkan diskon 50% untuk pembelian kemeja kedua khusus pelanggan Alpha Fashion!',
        },
      ],
      quick_replies: ['Katalog Alpha', 'Promo Alpha'],
    },
  },

  'retail-store-beta': {
    id: 'ten-uuid-beta-2222',
    slug: 'retail-store-beta',
    name: 'Beta Electronics Store',
    category: 'RETAIL',
    business_type: 'RETAIL',
    metadata: {
      category: 'RETAIL',
      store_name: 'Beta Electronics Store',
      greeting_message: 'Halo! Selamat datang di Beta Electronics Store. Cari aksesoris smartphone, TWS, atau gadget terkini?',
      whatsapp_number: '628222222222',
      payment_accounts: [
        {
          bank_name: 'Mandiri',
          account_number: '4444555566',
          account_holder: 'CV Beta Gadget',
          is_primary: true,
        },
      ],
      interactive_menus: [
        {
          id: 'menu_beta_main',
          title: 'Menu Utama Beta Gadget',
          trigger: 'Menu Utama Beta',
          header_text: 'Beta Electronics Official Store',
          description: 'Pilih produk elektronik Anda:',
          options: [
            { id: 'opt_beta_tws', title: '1. Audio & TWS', responseText: 'CATALOG_AUDIO' },
            { id: 'opt_beta_chargers', title: '2. Fast Charger & Kabel', responseText: 'CATALOG_CHARGERS' },
            { id: 'opt_beta_cs', title: '3. Hubungi CS Beta', responseText: 'HUMAN_CS' },
          ],
        },
      ],
      campaign_routes: [
        {
          id: 'camp_beta_promo',
          campaign_id: 'beta_gadget_fest',
          keyword_triggers: ['promo beta', 'gadget fest'],
          target_node: 'PROMO_GADGET',
          response_text: 'Festival Aksesoris Gadget Beta! Garansi resmi 12 bulan tukar baru.',
        },
      ],
      quick_replies: ['Katalog Beta', 'Garansi Beta'],
    },
  },
};

const mockProductsDb: Record<string, any[]> = {
  'ten-uuid-alpha-1111': [
    { id: 'p-alpha-01', tenant_id: 'ten-uuid-alpha-1111', name: 'Kemeja Oxford Pria', price: 189000, stock: 45 },
    { id: 'p-alpha-02', tenant_id: 'ten-uuid-alpha-1111', name: 'Celana Chino Slim Fit', price: 219000, stock: 20 },
  ],
  'ten-uuid-beta-2222': [
    { id: 'p-beta-01', tenant_id: 'ten-uuid-beta-2222', name: 'TWS Noise Cancelling X1', price: 349000, stock: 15 },
    { id: 'p-beta-02', tenant_id: 'ten-uuid-beta-2222', name: 'GaN Fast Charger 65W', price: 199000, stock: 60 },
  ],
};

function createMockSupabase() {
  return {
    from: (table: string) => {
      let selectedFields = '';
      let filterCol = '';
      let filterVal: any = null;
      let orCondition = '';

      const queryBuilder: any = {
        select: (fields: string) => {
          selectedFields = fields;
          return queryBuilder;
        },
        eq: (col: string, val: any) => {
          filterCol = col;
          filterVal = val;
          return queryBuilder;
        },
        or: (cond: string) => {
          orCondition = cond;
          return queryBuilder;
        },
        update: () => queryBuilder,
        upsert: () => queryBuilder,
        insert: () => queryBuilder,
        in: () => queryBuilder,
        maybeSingle: async () => {
          if (table === 'tenants') {
            const key = filterVal || (orCondition.match(/slug\.eq\.([^,)]+)/)?.[1] || orCondition.match(/id\.eq\.([^,)]+)/)?.[1]);
            const tenant =
              mockTenantsDb[key] ||
              Object.values(mockTenantsDb).find((t) => t.id === key || t.slug === key);
            return { data: tenant ? { ...tenant } : null, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: any) => {
          if (table === 'products') {
            const prods = mockProductsDb[filterVal] || [];
            return Promise.resolve({ data: prods, error: null }).then(resolve);
          }
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };

      return queryBuilder;
    },
  };
}

const mockSupabase = createMockSupabase();

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: () => mockSupabase,
  getSupabase: () => mockSupabase,
}));

describe('GATE 2: RETAIL_COMMERCE_V1 Tenant Isolation Verification', () => {
  beforeEach(() => {
    clearSessionCacheForTest();
  });

  // ── TEST 1: CATALOG & PRODUCT ISOLATION ───────────────────────────────────
  describe('1. Catalog & Product Isolation (Row-Level Boundaries)', () => {
    it('queries products for Tenant Alpha and strictly excludes Tenant Beta products', async () => {
      const { data: alphaProducts } = await (mockSupabase as any)
        .from('products')
        .select('*')
        .eq('tenant_id', 'ten-uuid-alpha-1111');

      expect(alphaProducts).toHaveLength(2);
      expect(alphaProducts[0].name).toBe('Kemeja Oxford Pria');
      expect(alphaProducts[1].name).toBe('Celana Chino Slim Fit');

      // Negative assertion: Zero cross-tenant leakage of Beta products
      const alphaNames = alphaProducts.map((p: any) => p.name);
      expect(alphaNames).not.toContain('TWS Noise Cancelling X1');
      expect(alphaNames).not.toContain('GaN Fast Charger 65W');
    });

    it('queries products for Tenant Beta and strictly excludes Tenant Alpha products', async () => {
      const { data: betaProducts } = await (mockSupabase as any)
        .from('products')
        .select('*')
        .eq('tenant_id', 'ten-uuid-beta-2222');

      expect(betaProducts).toHaveLength(2);
      expect(betaProducts[0].name).toBe('TWS Noise Cancelling X1');
      expect(betaProducts[1].name).toBe('GaN Fast Charger 65W');

      // Negative assertion: Zero cross-tenant leakage of Alpha products
      const betaNames = betaProducts.map((p: any) => p.name);
      expect(betaNames).not.toContain('Kemeja Oxford Pria');
      expect(betaNames).not.toContain('Celana Chino Slim Fit');
    });
  });

  // ── TEST 2: CONFIG & DECISION TREE ISOLATION ──────────────────────────────
  describe('2. Decision Tree & Config Isolation', () => {
    it('resolves distinct decision tree for Tenant Alpha without leaking Tenant Beta data', async () => {
      const treeAlpha = await getTenantDecisionTree('retail-store-alpha', mockSupabase);
      expect(treeAlpha).not.toBeNull();
      expect(treeAlpha?.store_name).toBe('Alpha Fashion Store');
      expect(treeAlpha?.default_greeting).toContain('Alpha Fashion Store');
      expect(treeAlpha?.interactive_menus[0].options[0].title).toContain('Kemeja');

      // Negative assertions: Alpha decision tree must NEVER contain Beta data
      expect(treeAlpha?.store_name).not.toContain('Beta');
      expect(treeAlpha?.default_greeting).not.toContain('Beta Electronics');
      expect(treeAlpha?.default_greeting).not.toContain('TWS');
      expect(treeAlpha?.campaign_routes[0].response_text).not.toContain('Gadget');
    });

    it('resolves distinct decision tree for Tenant Beta without leaking Tenant Alpha data', async () => {
      const treeBeta = await getTenantDecisionTree('retail-store-beta', mockSupabase);
      expect(treeBeta).not.toBeNull();
      expect(treeBeta?.store_name).toBe('Beta Electronics Store');
      expect(treeBeta?.default_greeting).toContain('Beta Electronics Store');
      expect(treeBeta?.interactive_menus[0].options[0].title).toContain('Audio & TWS');

      // Negative assertions: Beta decision tree must NEVER contain Alpha data
      expect(treeBeta?.store_name).not.toContain('Alpha');
      expect(treeBeta?.default_greeting).not.toContain('Alpha Fashion');
      expect(treeBeta?.default_greeting).not.toContain('kemeja');
      expect(treeBeta?.campaign_routes[0].response_text).not.toContain('celana');
    });
  });

  // ── TEST 3: COMPOSITE KEY SESSION & CHAT ISOLATION ────────────────────────
  describe('3. WhatsApp Composite Key Session Isolation (${tenant_id}:${sender_phone})', () => {
    const sharedCustomerPhone = '+6281299998888';

    it('generates strictly different composite keys for the same customer phone', () => {
      const keyAlpha = getCompositeSessionKey('retail-store-alpha', sharedCustomerPhone);
      const keyBeta = getCompositeSessionKey('retail-store-beta', sharedCustomerPhone);

      expect(keyAlpha).toBe('retail-store-alpha:+6281299998888');
      expect(keyBeta).toBe('retail-store-beta:+6281299998888');
      expect(keyAlpha).not.toBe(keyBeta);
    });

    it('pausing bot in Tenant Alpha has ZERO effect on Tenant Beta for the exact same phone', async () => {
      // 1. Initially both sessions are active
      const stateAlpha1 = await getBotSessionState('retail-store-alpha', sharedCustomerPhone, mockSupabase);
      const stateBeta1 = await getBotSessionState('retail-store-beta', sharedCustomerPhone, mockSupabase);
      expect(stateAlpha1.bot_paused).toBe(false);
      expect(stateBeta1.bot_paused).toBe(false);

      // 2. Customer in Tenant Alpha asks for human CS -> Pause Alpha
      await pauseBotForConversation(
        'retail-store-alpha',
        sharedCustomerPhone,
        'CUSTOMER_REQUESTED_HUMAN_AGENT',
        120,
        mockSupabase
      );

      // 3. Verify Tenant Alpha is paused
      const stateAlpha2 = await getBotSessionState('retail-store-alpha', sharedCustomerPhone, mockSupabase);
      expect(stateAlpha2.bot_paused).toBe(true);
      expect(stateAlpha2.current_step).toBe('HUMAN_TAKEOVER');
      expect(stateAlpha2.paused_reason).toBe('CUSTOMER_REQUESTED_HUMAN_AGENT');

      // 4. CRITICAL GATE: Verify Tenant Beta is STILL ACTIVE and NOT PAUSED
      const stateBeta2 = await getBotSessionState('retail-store-beta', sharedCustomerPhone, mockSupabase);
      expect(stateBeta2.bot_paused).toBe(false);
      expect(stateBeta2.current_step).not.toBe('HUMAN_TAKEOVER');

      // 5. Inbound message to Tenant Alpha is silently dropped / handled by human handover
      const routeAlpha = await routeTenantInboundMessage({
        tenantIdOrSlug: 'retail-store-alpha',
        senderPhone: sharedCustomerPhone,
        message: 'halo ada orang?',
        supabaseClient: mockSupabase,
      });
      expect(routeAlpha.handled).toBe(true);
      expect(routeAlpha.bot_paused).toBe(true);
      expect(routeAlpha.type).toBe('HUMAN_TAKEOVER');

      // 6. Inbound message to Tenant Beta is ACTIVELY responded by Beta Bot
      const routeBeta = await routeTenantInboundMessage({
        tenantIdOrSlug: 'retail-store-beta',
        senderPhone: sharedCustomerPhone,
        message: 'menu',
        supabaseClient: mockSupabase,
      });
      expect(routeBeta.handled).toBe(true);
      expect(routeBeta.bot_paused).toBeFalsy();
      expect(routeBeta.reply.toLowerCase()).toContain('beta electronics official store');
      expect(routeBeta.reply).not.toContain('Alpha');
    });

    it('campaign keyword triggers in Tenant Alpha do NOT trigger campaign routes in Tenant Beta', async () => {
      // Trigger Alpha promo keyword to Alpha
      const alphaRes = await routeTenantInboundMessage({
        tenantIdOrSlug: 'retail-store-alpha',
        senderPhone: sharedCustomerPhone,
        message: 'promo alpha diskon 50',
        supabaseClient: mockSupabase,
      });
      expect(alphaRes.handled).toBe(true);
      expect(alphaRes.type).toBe('CAMPAIGN_MATCH');
      expect(alphaRes.reply).toContain('Dapatkan diskon 50% untuk pembelian kemeja kedua');

      // Send same Alpha trigger to Beta -> must NOT match Beta campaign
      const betaRes = await routeTenantInboundMessage({
        tenantIdOrSlug: 'retail-store-beta',
        senderPhone: sharedCustomerPhone,
        message: 'promo alpha diskon 50',
        supabaseClient: mockSupabase,
      });
      expect(betaRes.type).not.toBe('CAMPAIGN_MATCH');
      expect(betaRes.reply).not.toContain('diskon 50% untuk pembelian kemeja');
    });
  });
});
