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
        { id: 'prod-starter-1', name: 'Starter Kit OnlineBoost', price: 249000, product_type: 'digital' },
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
  buatinvideo: {
    id: '00000000-0000-0000-0000-000000000006',
    slug: 'buatinvideo',
    name: 'Buatin Video',
    status: 'active',
    tier: 'PRO_SCALE',
    business_type: 'digital',
    metadata: {
      features: ['crm', 'broadcast', 'ai_pitch'],
    },
  },
  'shabu-ajhi': {
    id: '70c1ea8c-3557-44af-b131-faae75a8b17f',
    slug: 'shabu-ajhi',
    name: 'Shabu Ajhi',
    status: 'active',
    tier: 'PRO_SCALE',
    business_type: 'food',
    metadata: {
      logistics: {
        primary: 'internal_fleet',
        fallback_provider: 'biteship',
        allowed_couriers: ['lalamove'],
        max_internal_trip_per_slot: 4,
      },
    },
  },
  satya: {
    id: 'tenant_satya_001',
    slug: 'satya',
    name: 'PT Satya Mandiri Perkasa',
    status: 'active',
    tier: 'ENTERPRISE',
    business_type: 'security_workforce',
    metadata: {
      features: ['workforce_management', 'attendance', 'checkpoints'],
    },
  },
};

const globalMockBookingSlots = [
  {
    id: 'd5d8febe-c00d-4412-aa6d-c6906fad4e3b',
    tenant_id: '70c1ea8c-3557-44af-b131-faae75a8b17f',
    slot_name: '10:00 - 12:00 (Makan Siang Awal)',
    max_quota: 4,
    is_active: true,
    created_at: '2026-10-19T18:20:18.668Z',
  },
  {
    id: 'bfa9d175-c472-418c-ac38-006e13cc0f5f',
    tenant_id: '70c1ea8c-3557-44af-b131-faae75a8b17f',
    slot_name: '12:00 - 14:00 (Makan Siang)',
    max_quota: 4,
    is_active: true,
    created_at: '2026-10-19T18:20:18.668Z',
  },
  {
    id: 'fac70185-ed7c-439d-b660-7c4415594343',
    tenant_id: '70c1ea8c-3557-44af-b131-faae75a8b17f',
    slot_name: '16:00 - 18:00 (Sore / Santai Santap)',
    max_quota: 4,
    is_active: true,
    created_at: '2026-10-19T18:20:18.668Z',
  },
  {
    id: '39fa6533-aee8-4ac0-9d58-607827accf49',
    tenant_id: '70c1ea8c-3557-44af-b131-faae75a8b17f',
    slot_name: '18:00 - 20:00 (Makan Malam)',
    max_quota: 4,
    is_active: true,
    created_at: '2026-10-19T18:20:18.668Z',
  },
];

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
    schema: () => builder,
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
      } else if (tableName === 'products') {
        rows = Object.values(globalMockTenants).flatMap((t: any) =>
          (t.metadata?.products || []).map((p: any) => ({
            id: p.id || 'prod-default',
            tenant_id: t.id,
            name: p.name || 'Produk Default',
            title: p.name || 'Produk Default',
            slug: p.id || 'prod-default',
            price: p.price || 100000,
            category: p.product_type || 'digital',
            product_type: p.product_type || 'DIGITAL_FILE',
            is_active: true,
            is_publicly_published: true,
            status: 'ACTIVE',
          }))
        );
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
      } else if (tableName === 'tenant_booking_slots') {
        rows = [...globalMockBookingSlots];
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
  schema: jest.fn(() => globalMockSupabaseClient),
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
          publicUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-project.supabase.co'}/storage/v1/object/public/${bucket}/${path}`,
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
  const actual = jest.requireActual('@/lib/supabaseClient');
  return {
    getWorkforceSupabaseAdmin: jest.fn(() => globalMockSupabaseClient),
    getSupabaseAdmin: jest.fn(() => globalMockSupabaseClient),
    getSupabase: jest.fn(() => globalMockSupabaseClient),
    assertSharedRestUrlTarget: jest.fn((url: string) => url),
    assertStagingRestUrlTarget: jest.fn((url: string) => url),
    assertStagingDatabaseTarget: jest.fn((conn: string) => {
      actual.assertStagingDatabaseTarget(conn);
      return conn;
    }),
    verifyFactoryClient: jest.fn((client: any, _expectedContext: string) => {
      if (client === globalMockSupabaseClient) return;
    }),
    supabase: globalMockSupabaseClient,
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-project.supabase.co',
    SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy-anon-key-test',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role-test',
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

// 5. Global Mock for external fetch calls (Gate A: Fail-closed, host/path/method allowlist, zero live egress)
const defaultGeminiResponse = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: 'Halo kak, bantu jawab ya!\n\nUntuk paket setup toko DFY (Done-For-You / Terima Beres) bisa langsung cek di https://shop.boontrack.com/boon atau hubungi IT Support resmi di https://wa.me/6281977655099. Untuk kebutuhan tim tersedia Pro Scale dan Team Scale dengan Multi-Seat Smart Chatbox. Untuk paket hemat tersedia Checkout Lite Rp 59.000/bln dengan QRIS 0% MDR. Fitur reseller toko mencakup Store Reseller, Free Tier, Starter Add-on, status FROZEN, dan Magic Link. Silakan daftar di https://shop.boontrack.com dengan QRIS dan WhatsApp.',
          },
        ],
      },
    },
  ],
};

(globalThis as any).fetch = jest.fn().mockImplementation(async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  const method = (init?.method || 'GET').toUpperCase();

  // 1. Gemini AI Mock (generativelanguage.googleapis.com)
  if (url.includes('generativelanguage.googleapis.com')) {
    if (!url.includes('/models/') && !url.includes(':generateContent')) {
      throw new Error(`[SECURITY FAIL-CLOSED] Unapproved path on generativelanguage.googleapis.com: ${url}`);
    }
    if (method !== 'POST') {
      throw new Error(`[SECURITY FAIL-CLOSED] Method ${method} not permitted for Gemini API (expected POST)`);
    }
    return {
      ok: true,
      status: 200,
      json: async () => defaultGeminiResponse,
      text: async () => JSON.stringify(defaultGeminiResponse),
    };
  }

  // 2. Telegram Bot Mock (api.telegram.org)
  if (url.includes('api.telegram.org')) {
    if (!url.includes('/sendMessage') && !url.includes('/sendPhoto') && !url.includes('/sendDocument')) {
      throw new Error(`[SECURITY FAIL-CLOSED] Unapproved path on api.telegram.org: ${url}`);
    }
    if (method !== 'POST') {
      throw new Error(`[SECURITY FAIL-CLOSED] Method ${method} not permitted for Telegram API (expected POST)`);
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: {} }),
      text: async () => JSON.stringify({ ok: true, result: {} }),
    };
  }

  // 3. Xendit Payment Mock (api.xendit.co) — Gate A: Auth, approved endpoints, and financial assertions
  if (url.includes('api.xendit.co')) {
    const authHeader = init?.headers?.Authorization || init?.headers?.authorization;
    if (!authHeader) {
      return {
        ok: false,
        status: 401,
        json: async () => ({ error_code: 'UNAUTHORIZED', message: 'Missing Authorization header' }),
        text: async () => JSON.stringify({ error_code: 'UNAUTHORIZED', message: 'Missing Authorization header' }),
      };
    }

    // Gate A.5: Validate payment endpoint approval
    if (!url.includes('/qr_codes') && !url.includes('/v2/invoices') && !url.includes('/callback_virtual_accounts')) {
      return {
        ok: false,
        status: 403,
        json: async () => ({ error_code: 'UNAPPROVED_ENDPOINT', message: 'Unapproved Xendit payment endpoint' }),
        text: async () => JSON.stringify({ error_code: 'UNAPPROVED_ENDPOINT', message: 'Unapproved Xendit payment endpoint' }),
      };
    }

    if (method !== 'POST') {
      return {
        ok: false,
        status: 405,
        json: async () => ({ error_code: 'METHOD_NOT_ALLOWED', message: `Method ${method} not allowed on Xendit endpoint` }),
        text: async () => JSON.stringify({ error_code: 'METHOD_NOT_ALLOWED', message: `Method ${method} not allowed on Xendit endpoint` }),
      };
    }

    // Gate A.4: Payment payload & financial assertions remain effective
    let bodyObj: any = null;
    try {
      if (typeof init?.body === 'string') {
        bodyObj = JSON.parse(init.body);
      }
    } catch {
      // ignore
    }

    if (bodyObj && bodyObj.amount !== undefined && Number(bodyObj.amount) <= 0) {
      return {
        ok: false,
        status: 400,
        json: async () => ({ error_code: 'INVALID_AMOUNT', message: 'Amount must be greater than 0' }),
        text: async () => JSON.stringify({ error_code: 'INVALID_AMOUNT', message: 'Amount must be greater than 0' }),
      };
    }

    const amount = bodyObj?.amount || 249000;
    const refId = bodyObj?.reference_id || bodyObj?.external_id || 'mock-order-ref';
    const mockXenditQr = {
      id: 'xnd_qr_mock_12345',
      reference_id: refId,
      type: 'DYNAMIC',
      currency: 'IDR',
      amount,
      status: 'ACTIVE',
      qr_string: '00020101021226670016ID.CO.QRIS.WWW011893600918000000000002150000000000000005204581253033605802ID5910BOONTRACK6007JAKARTA61051234062070703A016304',
      invoice_url: 'https://checkout.xendit.co/v2/mock_invoice_123',
    };
    return {
      ok: true,
      status: 200,
      json: async () => mockXenditQr,
      text: async () => JSON.stringify(mockXenditQr),
    };
  }

  // 4. Internal QRIS create endpoint (/api/v1/payments/qris/create)
  if (url.includes('/api/v1/payments/qris/create') || url.includes('/payments/qris/create')) {
    if (method !== 'POST') {
      throw new Error(`[SECURITY FAIL-CLOSED] Method ${method} not permitted on QRIS create (expected POST)`);
    }
    const mockPaymentRes = {
      success: true,
      order_id: 'ORD-MOCK-PAYMENT-123',
      qr_string: '00020101021226670016ID.CO.QRIS.WWW011893600918000000000002150000000000000005204581253033605802ID5910BOONTRACK6007JAKARTA61051234062070703A016304',
      qr_code_url: 'https://quickchart.io/qr?text=mock-qris-data',
      invoice_url: '/checkout/ORD-MOCK-PAYMENT-123',
    };
    return {
      ok: true,
      status: 200,
      json: async () => mockPaymentRes,
      text: async () => JSON.stringify(mockPaymentRes),
    };
  }

  // 5. QuickChart QR generation (quickchart.io)
  if (url.includes('quickchart.io')) {
    if (!url.includes('/qr')) {
      throw new Error(`[SECURITY FAIL-CLOSED] Unapproved path on quickchart.io: ${url}`);
    }
    if (method !== 'GET') {
      throw new Error(`[SECURITY FAIL-CLOSED] Method ${method} not permitted for QuickChart (expected GET)`);
    }
    return {
      ok: true,
      status: 200,
      blob: async () => new Blob(['mock-qr-png'], { type: 'image/png' }),
      text: async () => 'mock-qr-png',
    };
  }

  // 6. Authorized Internal hosts
  if (
    url.includes('localhost:3000') ||
    url.includes('127.0.0.1:3000') ||
    url.includes('api.boontrack.com') ||
    url.includes('shop.boontrack.com')
  ) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: 'Mock internal response' }),
      text: async () => JSON.stringify({ success: true, message: 'Mock internal response' }),
    };
  }

  // Gate A.2 & A.3: Fail-closed on all unapproved external hosts or endpoints (NO live egress)
  throw new Error(`[SECURITY FAIL-CLOSED] Blocked unapproved network request: ${method} ${url}`);
});

