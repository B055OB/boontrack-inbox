/**
 * @file __tests__/jest.setup.ts
 * @description Global Jest Setup: Isolates tests from live Supabase connections & RealtimeClient errors.
 * Registered in setupFilesAfterEnv in jest.config.ts.
 */

// 1. Mock RealtimeClient so it never throws on missing websocket / URL in CI or Node.js test environment
jest.mock('@supabase/realtime-js', () => {
  return {
    RealtimeClient: jest.fn().mockImplementation(() => ({
      connect: jest.fn(),
      disconnect: jest.fn(),
      channel: jest.fn(() => ({
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn().mockReturnThis(),
        unsubscribe: jest.fn().mockReturnThis(),
      })),
      removeChannel: jest.fn(),
      removeAllChannels: jest.fn(),
      setAuth: jest.fn(),
      getChannels: jest.fn(() => []),
    })),
  };
});

// 2. Global Mock Data for Tenants & CRM
const DEFAULT_TENANT_ID = '52967979-4760-4cea-b686-cdbdb389c0e1';
const DEFAULT_TENANT_SLUG = 'onlineboost';

const globalMockTenants: Record<string, any> = {
  onlineboost: {
    id: DEFAULT_TENANT_ID,
    slug: DEFAULT_TENANT_SLUG,
    name: 'OnlineBoost',
    status: 'active',
    tier: 'PRO_SCALE',
    business_type: 'digital',
    metadata: {
      features: ['crm', 'broadcast'],
      products: [
        { id: 'prod-starter-1', name: 'Starter Kit OnlineBoost', price: 99000, product_type: 'digital' },
      ],
    },
  },
  boon: {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'boon',
    name: 'BoonTrack Official',
    status: 'active',
    tier: 'ENTERPRISE',
    business_type: 'digital',
    telegram_chat_id: '6075596043',
    metadata: {
      telegram_chat_id: '6075596043',
      features: ['crm', 'broadcast', 'telegram'],
    },
  },
  buzzerukm: {
    id: '00000000-0000-0000-0000-000000000003',
    slug: 'buzzerukm',
    name: 'Buzzer UKM',
    status: 'active',
    tier: 'PRO_SCALE',
    business_type: 'digital',
    metadata: {
      active_engine: 'SALES_REP_V1',
      products: [
        {
          id: 'ctwa-mastery-7day',
          name: '7-Day Sprint CTWA Mastery',
          price: 99000,
          description: 'Akses materi full digital',
        },
      ],
      faqs: [
        { question: 'materi', answer: 'Akses materi full digital' },
      ],
      sales_policy: {
        price_range: '99rb - 159rb',
        value_proposition: 'balik modal berkali-kali lipat',
      },
    },
  },
  kurastorenkrw: {
    id: '00000000-0000-0000-0000-000000000004',
    slug: 'kurastorenkrw',
    name: 'Kuras Toren Karawang',
    status: 'active',
    tier: 'PRO_SCALE',
    business_type: 'field_service',
    metadata: {
      active_engine: 'LOCAL_SERVICE_V1',
      service_type: 'field_service',
    },
  },
  mafiasakti: {
    id: '00000000-0000-0000-0000-000000000002',
    slug: 'mafiasakti',
    name: 'Mafia Sakti',
    status: 'active',
    tier: 'PRO_SCALE',
    business_type: 'digital',
    telegram_chat_id: '-1001910259389',
    metadata: {
      telegram_chat_id: '-1001910259389',
    },
  },
  'tumbuh-kembang-anak': {
    id: '00000000-0000-0000-0000-000000000005',
    slug: 'tumbuh-kembang-anak',
    name: 'Tumbuh Kembang Anak',
    status: 'active',
    tier: 'PRO_SCALE',
    business_type: 'service',
    metadata: {
      features: ['qris_dynamic'],
      qris_static_string: '00020101021226670016ID.CO.QRIS.WWW011893600918000000000002150000000000000005204581253033605802ID5919TUMBUH KEMBANG ANAK6007JAKARTA61051234062070703A016304',
      payment_settings: {
        mode: 'MANUAL',
        provider: 'manual',
        qris_static_string: '00020101021226670016ID.CO.QRIS.WWW011893600918000000000002150000000000000005204581253033605802ID5919TUMBUH KEMBANG ANAK6007JAKARTA61051234062070703A016304',
        qris_active: true,
      },
    },
  },
};

const globalMockContacts = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    tenant_id: DEFAULT_TENANT_ID,
    tenant_slug: DEFAULT_TENANT_SLUG,
    phone_e164: '+6281234567890',
    name: 'Budi Santoso',
    email: 'budi@example.com',
    contact_status: 'ACTIVE',
    lifecycle_stage: 'LEAD',
    metadata: { lead_score: 95, tags: ['alumni-cpm'] },
    last_interaction_at: '2026-10-10T10:00:00Z',
    created_at: '2026-10-10T10:00:00Z',
    updated_at: '2026-10-10T10:00:00Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    tenant_id: DEFAULT_TENANT_ID,
    tenant_slug: DEFAULT_TENANT_SLUG,
    phone_e164: '+6289876543210',
    name: 'Siti Aminah',
    email: 'siti@example.com',
    contact_status: 'ACTIVE',
    lifecycle_stage: 'CUSTOMER',
    metadata: { lead_score: 100, tags: [], total_orders: 2, total_spend: 350000 },
    last_interaction_at: '2026-10-11T10:00:00Z',
    created_at: '2026-10-11T10:00:00Z',
    updated_at: '2026-10-11T10:00:00Z',
  },
];

const globalMockTags = [
  {
    id: 'tag-1',
    tenant_id: DEFAULT_TENANT_ID,
    name: 'alumni-cpm',
    color: '#3B82F6',
    created_at: '2026-10-01T00:00:00Z',
  },
];

const globalMockContactTags = [
  {
    contact_id: '11111111-1111-4111-8111-111111111111',
    tag_id: 'tag-1',
  },
];

const globalMockOrders: any[] = [
  {
    id: 'ORD-1790483266787-7715',
    tenant_slug: 'buzzerukm',
    tenant_id: '00000000-0000-0000-0000-000000000003',
    customer_name: 'Maulidiyatul Izzah',
    customer_email: 'maulidiyatul.izzah@gmail.com',
    customer_phone: '08123456789',
    product_title: '7-Day Sprint CTWA Mastery (Closing Otomatis Tanpa Admin Ribet)',
    gross_amount: 99497,
    status: 'PAID',
    email_sent: false,
    email_sent_at: null,
  },
];

// Helper to create a chainable query builder
function createGlobalMockBuilder(tableName: string) {
  const filters: Array<{ type: 'eq' | 'in' | 'or' | 'ilike'; col: string; val: any }> = [];
  let isSingle = false;
  let isMaybeSingle = false;

  const builder: any = {
    select: () => builder,
    eq: (col: string, val: any) => {
      filters.push({ type: 'eq', col, val });
      return builder;
    },
    in: (col: string, val: any[]) => {
      filters.push({ type: 'in', col, val });
      return builder;
    },
    ilike: (col: string, val: any) => {
      filters.push({ type: 'ilike', col, val });
      return builder;
    },
    gte: () => builder,
    gt: () => builder,
    lte: () => builder,
    lt: () => builder,
    neq: () => builder,
    not: () => builder,
    is: () => builder,
    match: () => builder,
    filter: () => builder,
    contains: () => builder,
    containedBy: () => builder,
    range: () => builder,
    or: (cond: string) => {
      filters.push({ type: 'or', col: cond, val: cond });
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    single: () => {
      isSingle = true;
      return builder;
    },
    maybeSingle: () => {
      isMaybeSingle = true;
      return builder;
    },
    upsert: (data: any) => ({
      select: () => ({
        single: async () => ({ data, error: null }),
        maybeSingle: async () => ({ data, error: null }),
      }),
      then: (resolve: any) => resolve({ data, error: null }),
    }),
    insert: (data: any) => ({
      select: () => ({
        single: async () => ({ data, error: null }),
        maybeSingle: async () => ({ data, error: null }),
      }),
      then: (resolve: any) => resolve({ data, error: null }),
    }),
    update: (updateData: any) => ({
      eq: (col: string, val: any) => {
        if (tableName === 'orders') {
          const o = globalMockOrders.find(r => r[col] === val);
          if (o) Object.assign(o, updateData);
        }
        return {
          select: () => ({
            single: async () => ({ data: globalMockOrders.find(r => r[col] === val) || null, error: null }),
            maybeSingle: async () => ({ data: globalMockOrders.find(r => r[col] === val) || null, error: null }),
          }),
          then: (resolve: any) => resolve({ data: null, error: null }),
        };
      },
    }),
    delete: () => ({
      eq: () => ({
        eq: () => ({
          then: (resolve: any) => resolve({ data: null, error: null }),
        }),
        then: (resolve: any) => resolve({ data: null, error: null }),
      }),
    }),
    then: (resolve: any) => {
      let rows: any[] = [];
      if (tableName === 'tenants') {
        rows = Object.values(globalMockTenants);
      } else if (tableName === 'contacts') {
        rows = [...globalMockContacts];
      } else if (tableName === 'tags') {
        rows = [...globalMockTags];
      } else if (tableName === 'orders') {
        rows = [...globalMockOrders];
      } else if (tableName === 'contact_tags') {
        rows = globalMockContactTags.map(ct => ({
          ...ct,
          tags: globalMockTags.find(t => t.id === ct.tag_id) || null,
        }));
      }

      // Check if filtering for nonexistent tenant
      for (const f of filters) {
        if (
          f.type === 'eq' &&
          (f.col === 'slug' || f.col === 'id') &&
          typeof f.val === 'string' &&
          (f.val.includes('nonexistent') || f.val.includes('ghost') || f.val.includes('unknown'))
        ) {
          rows = [];
          break;
        }
      }

      for (const f of filters) {
        if (f.type === 'eq') {
          rows = rows.filter(r => r[f.col] === f.val);
        } else if (f.type === 'ilike') {
          rows = rows.filter(r => String(r[f.col] || '').toLowerCase() === String(f.val || '').toLowerCase());
        } else if (f.type === 'in') {
          rows = rows.filter(r => Array.isArray(f.val) && f.val.includes(r[f.col]));
        } else if (f.type === 'or') {
          const parts = f.val.split(',');
          rows = rows.filter(r =>
            parts.some((p: string) => {
              const [c, op, v] = p.split('.');
              return op === 'eq' && r[c] === v;
            })
          );
        }
      }

      // Dynamic fallback for tenants: if not explicitly empty due to nonexistent filter, generate valid record
      if (tableName === 'tenants' && rows.length === 0) {
        const hasNegativeFilter = filters.some(
          f =>
            f.type === 'eq' &&
            typeof f.val === 'string' &&
            (f.val.includes('nonexistent') || f.val.includes('ghost') || f.val.includes('unknown'))
        );
        if (!hasNegativeFilter && filters.length > 0) {
          const slugFilter = filters.find(f => f.col === 'slug')?.val || 'generic-tenant';
          const idFilter = filters.find(f => f.col === 'id')?.val || '00000000-0000-0000-0000-000000000099';
          rows = [
            {
              id: idFilter,
              slug: slugFilter,
              name: slugFilter,
              status: 'active',
              tier: 'PRO_SCALE',
              business_type: 'digital',
              metadata: {},
            },
          ];
        }
      }

      if (isSingle || isMaybeSingle) {
        const item = rows[0] || null;
        if (isSingle && !item) {
          return resolve({ data: null, error: { message: 'Row not found' } });
        }
        return resolve({ data: item, error: null });
      }

      return resolve({ data: rows, error: null });
    },
  };

  return builder;
}

export const globalMockSupabaseClient = {
  from: jest.fn((tableName: string) => createGlobalMockBuilder(tableName)),
  rpc: jest.fn(async () => ({ data: null, error: null })),
  channel: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
    unsubscribe: jest.fn().mockReturnThis(),
  })),
  getChannels: jest.fn(() => []),
  removeChannel: jest.fn(),
  removeAllChannels: jest.fn(),
  storage: {
    from: jest.fn((bucket: string) => ({
      upload: jest.fn(async (path: string, _file: any) => ({
        data: { path, Key: `${bucket}/${path}` },
        error: null,
      })),
      getPublicUrl: jest.fn((path: string) => ({
        data: {
          publicUrl: `https://mpluzajlzpregmjwpjqr.supabase.co/storage/v1/object/public/${bucket}/${path}`,
        },
      })),
      remove: jest.fn(async () => ({ data: [], error: null })),
      download: jest.fn(async () => ({ data: new Blob(['mock']), error: null })),
    })),
  },
  auth: {
    getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    signOut: jest.fn(async () => ({ error: null })),
  },
};

// 3. Global Mock for @/lib/supabaseClient
jest.mock('@/lib/supabaseClient', () => {
  return {
    getSupabaseAdmin: jest.fn(() => globalMockSupabaseClient),
    getSupabase: jest.fn(() => globalMockSupabaseClient),
    supabase: globalMockSupabaseClient,
    SUPABASE_URL: 'https://mpluzajlzpregmjwpjqr.supabase.co',
    SUPABASE_ANON_KEY: 'test_ci_anon_key_mock_12345',
    SUPABASE_SERVICE_ROLE_KEY: 'test_ci_service_role_key_mock_12345',
    isValidUuid: (id: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
    safeUuidOrNull: (id: any) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))
        ? String(id)
        : null,
  };
});

// 4. Global Mock for @supabase/supabase-js
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => globalMockSupabaseClient),
  SupabaseClient: jest.fn(() => globalMockSupabaseClient),
}));
