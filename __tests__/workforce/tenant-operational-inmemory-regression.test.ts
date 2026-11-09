/**
 * __tests__/workforce/tenant-operational-inmemory-regression.test.ts
 * BWM Post-Gate 1 Hardening: Tenant Operational Regression Suite (In-Memory / Non-Persistent)
 *
 * Directives:
 * 1. Execute actual tenant-facing Next.js route handlers without writing to persistent PostgreSQL.
 * 2. Positive Tests:
 *    - Tenant can upload/create product (POST /api/v1/tenants/[slug]/products) with OWNER/MERCHANT.
 *    - Tenant can read own products (GET /api/v1/tenants/[slug]/products & /products/[id]).
 *    - Tenant can edit own product (PUT /api/v1/tenants/[slug]/products/[id]).
 *    - Tenant can edit own profile/settings (PUT /api/v1/tenants/[slug]/settings).
 *    - Tenant can delete own product (DELETE /api/v1/tenants/[slug]/products/[id]).
 * 3. Negative Tests:
 *    - Cross-tenant product mutation isolation (Tenant A cannot update/delete Tenant B's products -> 403 Forbidden).
 *    - Cross-tenant settings read/mutation isolation (Tenant A cannot read/update Tenant B's settings -> 403 Forbidden).
 *    - Missing or unverified credentials fail closed (401 Unauthorized).
 *    - Plain unverified slug cookies fail closed (anti-spoofing).
 *    - Restricted roles (CS, OPERATOR) cannot perform destructive product deletions (403 Forbidden).
 */

import { NextRequest } from 'next/server';
import { signMerchantSessionToken } from '@/lib/auth/merchant-session';

// ---------------------------------------------------------------------------
// Stateful Mock Database for In-Memory Tenant & Product Operations
// ---------------------------------------------------------------------------
interface MockTenant {
  id: string;
  slug: string;
  name: string;
  category: string;
  tier: string;
  status: string;
  is_active: boolean;
  public_storefront_enabled?: boolean;
  metadata: Record<string, any>;
}

interface MockProduct {
  id: string;
  tenant_id: string;
  title: string;
  name?: string;
  slug: string;
  price: number;
  promo_price?: number;
  description?: string;
  category: string;
  product_type: string;
  stock: number;
  is_active: boolean;
  status: string;
  is_publicly_published?: boolean;
}

const mockTenantsDb: MockTenant[] = [];
const mockProductsDb: MockProduct[] = [];

const mockSupabaseAdmin: any = {
  from: (table: string) => {
    let selectedColumns = '*';
    const eqFilters: Array<{ field: string; val: any }> = [];
    const orClauses: string[] = [];

    const builder: any = {
      select: jest.fn((cols?: string) => {
        selectedColumns = cols || '*';
        return builder;
      }),
      eq: jest.fn((field: string, val: any) => {
        eqFilters.push({ field, val });
        return builder;
      }),
      or: jest.fn((clause: string) => {
        orClauses.push(clause);
        return builder;
      }),
      order: jest.fn(() => builder),
      limit: jest.fn(() => builder),
      maybeSingle: jest.fn(async () => {
        if (table === 'tenants') {
          const found = mockTenantsDb.find((t) => {
            for (const f of eqFilters) {
              if (f.field === 'slug' && t.slug !== f.val) return false;
              if (f.field === 'id' && t.id !== f.val) return false;
            }
            return true;
          });
          return { data: found ? JSON.parse(JSON.stringify(found)) : null, error: null };
        }

        if (table === 'products') {
          const found = mockProductsDb.find((p) => {
            for (const f of eqFilters) {
              if (f.field === 'tenant_id' && p.tenant_id !== f.val) return false;
              if (f.field === 'id' && p.id !== f.val && p.slug !== f.val) return false;
              if (f.field === 'slug' && p.slug !== f.val) return false;
              if (f.field === 'is_active' && p.is_active !== f.val) return false;
              if (f.field === 'status' && p.status !== f.val) return false;
            }
            for (const clause of orClauses) {
              const parts = clause.split(',');
              let match = false;
              for (const part of parts) {
                const firstDot = part.indexOf('.');
                const secondDot = part.indexOf('.', firstDot + 1);
                if (firstDot > 0 && secondDot > firstDot) {
                  const field = part.substring(0, firstDot);
                  const op = part.substring(firstDot + 1, secondDot);
                  const val = part.substring(secondDot + 1);
                  if (op === 'eq' && (String((p as any)[field]) === val || (field === 'id' && (p.id === val || p.slug === val)))) {
                    match = true;
                    break;
                  }
                }
              }
              if (!match) return false;
            }
            return true;
          });
          return { data: found ? JSON.parse(JSON.stringify(found)) : null, error: null };
        }

        return { data: null, error: null };
      }),
      single: jest.fn(async () => {
        return builder.maybeSingle();
      }),
      insert: jest.fn((payload: any) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        const inserted: any[] = [];
        for (const r of rows) {
          if (table === 'products') {
            let prodId = r.id;
            if (!prodId) {
              const matchedTenant = mockTenantsDb.find((t) => t.id === r.tenant_id);
              const metaProd = matchedTenant?.metadata?.products?.find((mp: any) => mp.slug === r.slug);
              prodId = metaProd?.id || r.slug || `prod_${Date.now()}`;
            }

            const newProd: MockProduct = {
              id: prodId,
              tenant_id: r.tenant_id,
              title: r.title || r.name,
              name: r.title || r.name,
              slug: r.slug || `prod-${Date.now()}`,
              price: Number(r.price || 0),
              promo_price: r.promo_price ? Number(r.promo_price) : undefined,
              description: r.description || '',
              category: r.category || 'service',
              product_type: r.product_type || 'SERVICE',
              stock: r.stock !== undefined ? r.stock : 999,
              is_active: r.is_active !== false,
              status: r.status || 'ACTIVE',
              is_publicly_published: r.is_publicly_published !== false,
            };
            mockProductsDb.push(newProd);
            inserted.push(newProd);
          } else {
            inserted.push(r);
          }
        }
        const res = { data: inserted, error: null };
        return {
          ...res,
          select: jest.fn(() => ({
            single: jest.fn(async () => ({ data: inserted[0] || null, error: null })),
            maybeSingle: jest.fn(async () => ({ data: inserted[0] || null, error: null })),
            then: (resolve: any) => Promise.resolve(res).then(resolve),
          })),
          then: (resolve: any) => Promise.resolve(res).then(resolve),
        };
      }),
      update: jest.fn((updateData: any) => {
        const updateEqFilters: Array<{ field: string; val: any }> = [];
        const updateOrClauses: string[] = [];

        const execUpdate = async () => {
          if (table === 'tenants') {
            const targets = mockTenantsDb.filter((t) => {
              for (const f of updateEqFilters) {
                if (f.field === 'id' && t.id !== f.val) return false;
                if (f.field === 'slug' && t.slug !== f.val) return false;
              }
              return true;
            });
            for (const t of targets) {
              Object.assign(t, updateData);
              if (updateData.metadata) {
                t.metadata = { ...(t.metadata || {}), ...updateData.metadata };
              }
            }
            return { data: targets, error: null, count: targets.length };
          }

          if (table === 'products') {
            const targets = mockProductsDb.filter((p) => {
              for (const f of updateEqFilters) {
                if (f.field === 'tenant_id' && p.tenant_id !== f.val) return false;
                if (f.field === 'id' && p.id !== f.val && p.slug !== f.val) return false;
              }
              for (const clause of updateOrClauses) {
                const parts = clause.split(',');
                let clauseMatch = false;
                for (const part of parts) {
                  const firstDot = part.indexOf('.');
                  const secondDot = part.indexOf('.', firstDot + 1);
                  if (firstDot > 0 && secondDot > firstDot) {
                    const f = part.substring(0, firstDot);
                    const op = part.substring(firstDot + 1, secondDot);
                    const v = part.substring(secondDot + 1);
                    if (op === 'eq' && (String((p as any)[f]) === v || (f === 'id' && (String(p.id) === v || String(p.slug) === v)))) {
                      clauseMatch = true;
                      break;
                    }
                  }
                }
                if (!clauseMatch) return false;
              }
              return true;
            });
            for (const t of targets) {
              Object.assign(t, updateData);
              if (updateData.name && !t.title) {
                t.title = updateData.name;
              }
            }
            return { data: targets, error: null, count: targets.length };
          }

          return { data: [], error: null, count: 0 };
        };

        const updateBuilder: any = {
          eq: (field: string, val: any) => {
            updateEqFilters.push({ field, val });
            return updateBuilder;
          },
          or: (clause: string) => {
            updateOrClauses.push(clause);
            return updateBuilder;
          },
          select: jest.fn(execUpdate),
          then: (resolve: any) => execUpdate().then(resolve),
        };
        return updateBuilder;
      }),
      upsert: jest.fn((payload: any) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        const result: any[] = [];
        for (const item of rows) {
          if (table === 'tenants') {
            const existingIdx = mockTenantsDb.findIndex((t) => t.slug === item.slug);
            if (existingIdx >= 0) {
              Object.assign(mockTenantsDb[existingIdx], item);
              result.push(mockTenantsDb[existingIdx]);
            } else {
              const newT: MockTenant = {
                id: item.id || `tenant_uuid_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                slug: item.slug,
                name: item.name || item.slug,
                category: item.category || 'service',
                tier: item.tier || 'PRO_SCALE',
                status: item.status || 'active',
                is_active: item.is_active !== false,
                public_storefront_enabled: item.public_storefront_enabled !== false,
                metadata: item.metadata || {},
              };
              mockTenantsDb.push(newT);
              result.push(newT);
            }
          } else {
            result.push(item);
          }
        }
        const res = { data: result, error: null };
        return {
          ...res,
          select: jest.fn(async () => res),
          then: (resolve: any) => Promise.resolve(res).then(resolve),
        };
      }),
      delete: jest.fn(() => {
        const delEqFilters: Array<{ field: string; val: any }> = [];
        const delOrClauses: string[] = [];
        const execDelete = async () => {
          if (table === 'products') {
            const prevLen = mockProductsDb.length;
            const filtered = mockProductsDb.filter((p) => {
              for (const f of delEqFilters) {
                if (f.field === 'tenant_id' && p.tenant_id !== f.val) return true;
                if (f.field === 'id' && (p.id === f.val || p.slug === f.val)) return false;
                if (f.field === 'slug' && p.slug === f.val) return false;
              }
              for (const clause of delOrClauses) {
                const parts = clause.split(',');
                for (const part of parts) {
                  const firstDot = part.indexOf('.');
                  const secondDot = part.indexOf('.', firstDot + 1);
                  if (firstDot > 0 && secondDot > firstDot) {
                    const f = part.substring(0, firstDot);
                    const op = part.substring(firstDot + 1, secondDot);
                    const v = part.substring(secondDot + 1);
                    if (op === 'eq' && (String((p as any)[f]) === v || (f === 'id' && (String(p.id) === v || String(p.slug) === v)))) {
                      return false;
                    }
                  }
                }
              }
              return true;
            });
            mockProductsDb.length = 0;
            mockProductsDb.push(...filtered);
            return { data: [], count: prevLen - filtered.length, error: null };
          }
          return { data: [], error: null };
        };

        const delBuilder: any = {
          eq: (f: string, v: any) => {
            delEqFilters.push({ field: f, val: v });
            return delBuilder;
          },
          or: (clause: string) => {
            delOrClauses.push(clause);
            return delBuilder;
          },
          select: jest.fn(execDelete),
          then: (resolve: any) => execDelete().then(resolve),
        };
        return delBuilder;
      }),
      then: async (resolve: any) => {
        if (table === 'products') {
          const filtered = mockProductsDb.filter((p) => {
            for (const f of eqFilters) {
              if (f.field === 'tenant_id' && p.tenant_id !== f.val) return false;
              if (f.field === 'is_active' && p.is_active !== f.val) return false;
              if (f.field === 'status' && p.status !== f.val) return false;
              if (f.field === 'id' && p.id !== f.val) return false;
            }
            return true;
          });
          return resolve({ data: filtered, error: null });
        }
        return resolve({ data: [], error: null });
      },
    };

    return builder;
  },
};

jest.mock('@/lib/supabaseClient', () => {
  const actual = jest.requireActual('@/lib/supabaseClient');
  return {
    ...actual,
    getWorkforceSupabaseAdmin: () => mockSupabaseAdmin,
    getWorkforceSupabase: () => mockSupabaseAdmin,
    getSupabaseAdmin: () => mockSupabaseAdmin,
    getSupabase: () => mockSupabaseAdmin,
  };
});

// Import route handlers
import { POST as createProduct, GET as getProducts } from '@/app/api/v1/tenants/[slug]/products/route';
import {
  GET as getProductById,
  PUT as updateProductById,
  DELETE as deleteProductById,
} from '@/app/api/v1/tenants/[slug]/products/[id]/route';
import {
  GET as getTenantSettings,
  PUT as updateTenantSettings,
} from '@/app/api/v1/tenants/[slug]/settings/route';

describe('BWM Post-Gate 1 Hardening: Tenant Operational In-Memory Regression', () => {
  const ts = Date.now();
  const tenantSlugA = `tenant-inmem-a-${ts}`;
  const tenantSlugB = `tenant-inmem-b-${ts}`;
  const tenantIdA = `uuid-inmem-a-${ts}`;
  const tenantIdB = `uuid-inmem-b-${ts}`;

  let tokenOwnerA: string;
  let tokenMerchantA: string;
  let tokenCsA: string;
  let tokenOperatorA: string;
  let tokenOwnerB: string;

  let createdProductIdA: string;
  let originalFetch: typeof global.fetch;

  beforeAll(() => {
    // 0. Intercept outbound network calls to external Core Backend to enforce DB SSOT in tests
    originalFetch = global.fetch;
    global.fetch = jest.fn(async (url: any, ...args: any[]) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/tenants/')) {
        return {
          ok: false,
          status: 502,
          json: async () => ({ error: 'CORE_BACKEND_OFFLINE_SSOT_FALLTHROUGH' }),
        } as any;
      }
      return originalFetch(url, ...args);
    });

    // Mint authentic HMAC session tokens
    tokenOwnerA = signMerchantSessionToken({ tenantSlug: tenantSlugA, tenantId: tenantIdA, role: 'OWNER', name: 'Owner Alpha' });
    tokenMerchantA = signMerchantSessionToken({ tenantSlug: tenantSlugA, tenantId: tenantIdA, role: 'MERCHANT', name: 'Merchant Alpha' });
    tokenCsA = signMerchantSessionToken({ tenantSlug: tenantSlugA, tenantId: tenantIdA, role: 'CS', name: 'CS Alpha' });
    tokenOperatorA = signMerchantSessionToken({ tenantSlug: tenantSlugA, tenantId: tenantIdA, role: 'OPERATOR', name: 'Operator Alpha' });
    tokenOwnerB = signMerchantSessionToken({ tenantSlug: tenantSlugB, tenantId: tenantIdB, role: 'OWNER', name: 'Owner Beta' });

    // Seed mock tenants
    mockTenantsDb.push(
      {
        id: tenantIdA,
        slug: tenantSlugA,
        name: `PT Alpha In-Memory Guard ${ts}`,
        category: 'service',
        tier: 'PRO_SCALE',
        status: 'active',
        is_active: true,
        public_storefront_enabled: true,
        metadata: {
          store_name: `Alpha Guard Store ${ts}`,
          products: [],
          features: { multi_cs: true },
        },
      },
      {
        id: tenantIdB,
        slug: tenantSlugB,
        name: `PT Beta In-Memory Shield ${ts}`,
        category: 'retail',
        tier: 'SOLO',
        status: 'active',
        is_active: true,
        public_storefront_enabled: true,
        metadata: {
          store_name: `Beta Shield Store ${ts}`,
          products: [],
          features: { multi_cs: false },
        },
      }
    );

    // Seed authoritative baseline product for Tenant B (Remediation B requirement)
    mockProductsDb.push({
      id: 'prod-b-target',
      tenant_id: tenantIdB,
      title: 'Beta Security Unit',
      name: 'Beta Security Unit',
      slug: 'prod-b-target',
      price: 1500000,
      promo_price: 1250000,
      description: 'Authoritative product owned exclusively by Tenant B',
      category: 'retail',
      product_type: 'PHYSICAL',
      stock: 25,
      is_active: true,
      status: 'active',
      is_publicly_published: true,
    });
  });

  afterAll(() => {
    mockTenantsDb.length = 0;
    mockProductsDb.length = 0;
    global.fetch = originalFetch;
  });

  // =========================================================================
  // 1. POSITIVE TESTS: Legitimate Tenant Product CRUD & Profile Edit
  // =========================================================================
  describe('1. Positive Tests (Legitimate Tenant Operations)', () => {
    it('1.1 Tenant OWNER can create/upload product (POST /products)', async () => {
      const payload = {
        name: 'Enterprise Geofence Unit',
        price: 2500000,
        promo_price: 2000000,
        category: 'service',
        product_type: 'SERVICE',
        description: 'Hardened geofencing service with zero-trust validation',
        type: 'service',
        stock: 50,
      };

      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugA}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify(payload),
      });

      const res = await createProduct(req, { params: Promise.resolve({ slug: tenantSlugA }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.product).toBeDefined();
      expect(json.product.name).toBe('Enterprise Geofence Unit');
      createdProductIdA = json.product.id || json.product.slug;
      expect(createdProductIdA).toBeDefined();
    });

    it('1.2 Tenant can read own products list (GET /products)', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugA}/products`, {
        method: 'GET',
        headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
      });

      const res = await getProducts(req, { params: Promise.resolve({ slug: tenantSlugA }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.products)).toBe(true);
      expect(json.products.length).toBeGreaterThanOrEqual(1);
      const match = json.products.find((p: any) => p.name === 'Enterprise Geofence Unit');
      expect(match).toBeDefined();
    });

    it('1.3 Tenant can read own product by ID (GET /products/[id])', async () => {
      const req = new NextRequest(
        `https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugA}/products/${createdProductIdA}`,
        { method: 'GET' }
      );

      const res = await getProductById(req, {
        params: Promise.resolve({ slug: tenantSlugA, id: createdProductIdA }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.product).toBeDefined();
      expect(json.product.name || json.product.title).toBe('Enterprise Geofence Unit');
    });

    it('1.4 Tenant MERCHANT can update own product (PUT /products/[id])', async () => {
      const updatePayload = {
        name: 'Enterprise Geofence Unit (Updated Edition)',
        price: 2750000,
        stock: 75,
      };

      const req = new NextRequest(
        `https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugA}/products/${createdProductIdA}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            cookie: `bt_merchant_token=${tokenMerchantA}`,
          },
          body: JSON.stringify(updatePayload),
        }
      );

      const res = await updateProductById(req, {
        params: Promise.resolve({ slug: tenantSlugA, id: createdProductIdA }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Remediation B.5: Prove that product update actually changed database values
      const updatedInDb = mockProductsDb.find(
        (p) => p.id === createdProductIdA || p.slug === createdProductIdA
      );
      expect(updatedInDb).toBeDefined();
      expect(Number(updatedInDb?.price)).toBe(2750000);
      expect(updatedInDb?.stock).toBe(75);
      expect(updatedInDb?.name || updatedInDb?.title).toBe(
        'Enterprise Geofence Unit (Updated Edition)'
      );

      // Read-after-write verification via GET with authenticated merchant session
      const verifyReq = new NextRequest(
        `https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugA}/products/${createdProductIdA}`,
        {
          method: 'GET',
          headers: { cookie: `bt_merchant_token=${tokenMerchantA}` },
        }
      );
      const verifyRes = await getProductById(verifyReq, {
        params: Promise.resolve({ slug: tenantSlugA, id: createdProductIdA }),
      });
      expect(verifyRes.status).toBe(200);
      const verifyJson = await verifyRes.json();
      expect(Number(verifyJson.product.price)).toBe(2750000);
      expect(verifyJson.product.stock).toBe(75);
    });

    it('1.5 Tenant OWNER can edit own profile / settings (PUT /settings)', async () => {
      const settingsPayload = {
        name: `PT Alpha In-Memory Guard ${ts}`,
        bio: 'Penyedia solusi pertahanan cyber dan geofencing terintegrasi',
        whatsapp_number: '6281112223334',
        metadata: {
          store_name: 'Alpha Cyber Store Final',
          features: { multi_cs: true, advanced_analytics: true },
        },
      };

      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugA}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`,
        },
        body: JSON.stringify(settingsPayload),
      });

      const res = await updateTenantSettings(req, { params: Promise.resolve({ slug: tenantSlugA }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('1.6 Tenant can read own settings (GET /settings)', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugA}/settings`, {
        method: 'GET',
        headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
      });

      const res = await getTenantSettings(req, { params: Promise.resolve({ slug: tenantSlugA }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.settings.name).toBe(`PT Alpha In-Memory Guard ${ts}`);
      expect(json.settings.bio).toBe('Penyedia solusi pertahanan cyber dan geofencing terintegrasi');
    });

    it('1.7 Tenant OWNER can delete own product (DELETE /products/[id])', async () => {
      const delReq = new NextRequest(
        `https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugA}/products/${createdProductIdA}`,
        {
          method: 'DELETE',
          headers: { cookie: `bt_merchant_token=${tokenOwnerA}` },
        }
      );

      const delRes = await deleteProductById(delReq, {
        params: Promise.resolve({ slug: tenantSlugA, id: String(createdProductIdA) }),
      });
      expect(delRes.status).toBe(200);
      const delJson = await delRes.json();
      expect(delJson.success).toBe(true);

      // Remediation B.6: Verify product is genuinely removed after delete
      const deletedInDb = mockProductsDb.find(
        (p) => p.id === createdProductIdA || p.slug === createdProductIdA
      );
      expect(deletedInDb).toBeUndefined();

      // Read-after-delete confirmation via GET returns 404
      const verifyDelReq = new NextRequest(
        `https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugA}/products/${createdProductIdA}`,
        { method: 'GET' }
      );
      const verifyDelRes = await getProductById(verifyDelReq, {
        params: Promise.resolve({ slug: tenantSlugA, id: String(createdProductIdA) }),
      });
      expect(verifyDelRes.status).toBe(404);
    });
  });

  // =========================================================================
  // 2. NEGATIVE TESTS: Cross-Tenant Isolation & Zero Leakage
  // =========================================================================
  describe('2. Negative Tests (Cross-Tenant Isolation)', () => {
    it("2.0 Baseline Owner B Verification: Tenant B OWNER can legitimately read own product", async () => {
      const req = new NextRequest(
        `https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugB}/products/prod-b-target`,
        {
          method: 'GET',
          headers: { cookie: `bt_merchant_token=${tokenOwnerB}` },
        }
      );
      const res = await getProductById(req, {
        params: Promise.resolve({ slug: tenantSlugB, id: 'prod-b-target' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.product.name || json.product.title).toBe('Beta Security Unit');
      expect(Number(json.product.price)).toBe(1500000);
    });

    it("2.1 Cross-Tenant Settings Read Rejection: Tenant A cannot read Tenant B's settings (403 Forbidden)", async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugB}/settings`, {
        headers: { cookie: `bt_merchant_token=${tokenOwnerA}` }, // Attacker has tokenOwnerA
      });

      const res = await getTenantSettings(req, { params: Promise.resolve({ slug: tenantSlugB }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it("2.2 Cross-Tenant Product Update Rejection: Tenant A cannot update Tenant B's product (403 Forbidden)", async () => {
      const req = new NextRequest(
        `https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugB}/products/prod-b-target`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            cookie: `bt_merchant_token=${tokenOwnerA}`, // Attacker has tokenOwnerA
          },
          body: JSON.stringify({ name: 'Hacked by Tenant A', price: 1000 }),
        }
      );

      const res = await updateProductById(req, {
        params: Promise.resolve({ slug: tenantSlugB, id: 'prod-b-target' }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');

      // Remediation B.4: Verify Tenant B's product remains untouched in database state
      const targetB = mockProductsDb.find((p) => p.id === 'prod-b-target');
      expect(targetB).toBeDefined();
      expect(Number(targetB?.price)).toBe(1500000);
      expect(targetB?.name || targetB?.title).toBe('Beta Security Unit');
    });

    it("2.3 Cross-Tenant Settings Update Rejection: Tenant A cannot edit Tenant B's profile (403 Forbidden)", async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugB}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          cookie: `bt_merchant_token=${tokenOwnerA}`, // Attacker has tokenOwnerA
        },
        body: JSON.stringify({ name: 'Defaced Store Name' }),
      });

      const res = await updateTenantSettings(req, { params: Promise.resolve({ slug: tenantSlugB }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it("2.4 Cross-Tenant Delete Rejection: Tenant A cannot delete Tenant B's product (403 Forbidden)", async () => {
      const req = new NextRequest(
        `https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugB}/products/prod-b-target`,
        {
          method: 'DELETE',
          headers: { cookie: `bt_merchant_token=${tokenOwnerA}` }, // Attacker has tokenOwnerA
        }
      );

      const res = await deleteProductById(req, {
        params: Promise.resolve({ slug: tenantSlugB, id: 'prod-b-target' }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');

      // Remediation B.4: Verify Tenant B's product is NOT deleted and remains fully intact
      const targetBAfterDel = mockProductsDb.find((p) => p.id === 'prod-b-target');
      expect(targetBAfterDel).toBeDefined();
      expect(Number(targetBAfterDel?.price)).toBe(1500000);
      expect(targetBAfterDel?.is_active).toBe(true);

      // Remediation B.7: Legitimate owner (Tenant B) can still access product after attacks
      const verifyOwnerBReq = new NextRequest(
        `https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugB}/products/prod-b-target`,
        {
          method: 'GET',
          headers: { cookie: `bt_merchant_token=${tokenOwnerB}` },
        }
      );
      const verifyOwnerBRes = await getProductById(verifyOwnerBReq, {
        params: Promise.resolve({ slug: tenantSlugB, id: 'prod-b-target' }),
      });
      expect(verifyOwnerBRes.status).toBe(200);
      const verifyOwnerBJson = await verifyOwnerBRes.json();
      expect(verifyOwnerBJson.success).toBe(true);
      expect(
        verifyOwnerBJson.product.name || verifyOwnerBJson.product.title
      ).toBe('Beta Security Unit');
    });
  });

  // =========================================================================
  // 3. NEGATIVE TESTS: Unauthorized, Forgery & Role Restrictions
  // =========================================================================
  describe('3. Negative Tests (Unauthorized, Forgery & Role Boundaries)', () => {
    it('3.1 Missing authentication token returns 401 Unauthorized', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugA}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Unauthorized Item' }),
      });

      const res = await createProduct(req, { params: Promise.resolve({ slug: tenantSlugA }) });
      expect(res.status).toBe(401);
    });

    it('3.2 Unverified plain cookie slug fails closed with 401 (Anti-Cookie-Forgery)', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugA}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `merchant_store=${tenantSlugA}`,
        },
        body: JSON.stringify({ name: 'Forged Cookie Item' }),
      });

      const res = await createProduct(req, { params: Promise.resolve({ slug: tenantSlugA }) });
      expect(res.status).toBe(401);
    });

    it('3.3 CS role cannot delete product (403 Forbidden)', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugA}/products/some-product`, {
        method: 'DELETE',
        headers: { cookie: `bt_merchant_token=${tokenCsA}` },
      });

      const res = await deleteProductById(req, {
        params: Promise.resolve({ slug: tenantSlugA, id: 'some-product' }),
      });
      expect(res.status).toBe(403);
    });

    it('3.4 OPERATOR role cannot delete product (403 Forbidden)', async () => {
      const req = new NextRequest(`https://dashboard.boontrack.com/api/v1/tenants/${tenantSlugA}/products/some-product`, {
        method: 'DELETE',
        headers: { cookie: `bt_merchant_token=${tokenOperatorA}` },
      });

      const res = await deleteProductById(req, {
        params: Promise.resolve({ slug: tenantSlugA, id: 'some-product' }),
      });
      expect(res.status).toBe(403);
    });
  });
});
