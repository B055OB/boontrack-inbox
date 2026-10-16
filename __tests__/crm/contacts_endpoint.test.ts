/**
 * @file __tests__/crm/contacts_endpoint.test.ts
 * @description Comprehensive Unit Test Suite for CRM Contacts API Endpoints (GET & POST)
 * Fully mocks @/lib/supabaseClient and @supabase/supabase-js to isolate tests from real network / RealtimeClient.
 */

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mock Database State & Fixtures
// ---------------------------------------------------------------------------
const MOCK_TENANT_ID = '52967979-4760-4cea-b686-cdbdb389c0e1';
const MOCK_TENANT_SLUG = 'onlineboost';
const MOCK_CONTACT_1_ID = '11111111-1111-4111-8111-111111111111';
const MOCK_CONTACT_2_ID = '22222222-2222-4222-8222-222222222222';

let mockTenants: any[] = [];
let mockContacts: any[] = [];
let mockTags: any[] = [];
let mockContactTags: any[] = [];
let mockContactNotes: any[] = [];
let mockChannelIdentities: any[] = [];

function resetMockDb() {
  mockTenants = [
    {
      id: MOCK_TENANT_ID,
      slug: MOCK_TENANT_SLUG,
      name: 'OnlineBoost',
      status: 'active',
      tier: 'PRO_SCALE',
      metadata: {},
    },
  ];

  mockContacts = [
    {
      id: MOCK_CONTACT_1_ID,
      tenant_id: MOCK_TENANT_ID,
      tenant_slug: MOCK_TENANT_SLUG,
      phone_e164: '+6281234567890',
      name: 'Budi Santoso',
      email: 'budi@example.com',
      contact_status: 'ACTIVE',
      lifecycle_stage: 'LEAD',
      metadata: { lead_score: 95, tags: ['alumni-cpm'], product_interest: 'Masterclass CPM' },
      last_interaction_at: '2026-10-10T10:00:00Z',
      created_at: '2026-10-10T10:00:00Z',
      updated_at: '2026-10-10T10:00:00Z',
    },
    {
      id: MOCK_CONTACT_2_ID,
      tenant_id: MOCK_TENANT_ID,
      tenant_slug: MOCK_TENANT_SLUG,
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

  mockTags = [
    {
      id: 'tag-1',
      tenant_id: MOCK_TENANT_ID,
      name: 'alumni-cpm',
      color: '#3B82F6',
      created_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 'tag-2',
      tenant_id: MOCK_TENANT_ID,
      name: 'vip',
      color: '#10B981',
      created_at: '2026-10-01T00:00:00Z',
    },
  ];

  mockContactTags = [
    {
      contact_id: MOCK_CONTACT_1_ID,
      tag_id: 'tag-1',
    },
  ];

  mockContactNotes = [
    {
      id: 'note-1',
      tenant_id: MOCK_TENANT_ID,
      contact_id: MOCK_CONTACT_1_ID,
      author_id: null,
      author_name: 'CS Sarah',
      body: 'Catatan pertama prospek',
      created_at: '2026-10-10T11:00:00Z',
    },
  ];

  mockChannelIdentities = [];
}

// ---------------------------------------------------------------------------
// Supabase Mock Client (Zero Network / Zero RealtimeClient)
// ---------------------------------------------------------------------------
const createMockQueryBuilder = (tableName: string) => {
  let selectCols = '*';
  const filters: Array<{ type: 'eq' | 'in' | 'or' | 'ilike'; col: string; val: any }> = [];
  let isSingle = false;
  let isMaybeSingle = false;
  let limitVal: number | null = null;

  const builder: any = {
    select: (cols: string = '*') => {
      selectCols = cols;
      return builder;
    },
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
    or: (cond: string) => {
      filters.push({ type: 'or', col: cond, val: cond });
      return builder;
    },
    order: () => builder,
    limit: (l: number) => {
      limitVal = l;
      return builder;
    },
    single: () => {
      isSingle = true;
      return builder;
    },
    maybeSingle: () => {
      isMaybeSingle = true;
      return builder;
    },
    upsert: (data: any) => {
      let inserted: any = null;
      if (tableName === 'tags') {
        const existing = mockTags.find(
          t => t.tenant_id === data.tenant_id && t.name.toLowerCase() === String(data.name).toLowerCase()
        );
        if (existing) {
          Object.assign(existing, data);
          inserted = existing;
        } else {
          inserted = {
            id: data.id || `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            created_at: new Date().toISOString(),
            ...data,
          };
          mockTags.push(inserted);
        }
      } else if (tableName === 'contact_tags') {
        const existing = mockContactTags.find(
          ct => ct.contact_id === data.contact_id && ct.tag_id === data.tag_id
        );
        if (!existing) mockContactTags.push(data);
        inserted = data;
      } else if (tableName === 'contact_channel_identities') {
        mockChannelIdentities.push(data);
        inserted = data;
      } else {
        inserted = data;
      }

      return {
        select: () => ({
          single: async () => ({ data: inserted, error: null }),
          maybeSingle: async () => ({ data: inserted, error: null }),
        }),
        then: (resolve: any) => resolve({ data: inserted, error: null }),
      };
    },
    insert: (data: any) => {
      let inserted: any = null;
      if (tableName === 'contacts') {
        inserted = {
          id: data.id || `${Date.now().toString(16).padStart(8, '0')}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          contact_status: 'ACTIVE',
          lifecycle_stage: 'LEAD',
          metadata: {},
          ...data,
        };
        mockContacts.push(inserted);
      } else if (tableName === 'tags') {
        inserted = {
          id: data.id || `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          created_at: new Date().toISOString(),
          ...data,
        };
        mockTags.push(inserted);
      } else if (tableName === 'contact_tags') {
        const rows = Array.isArray(data) ? data : [data];
        rows.forEach(r => mockContactTags.push(r));
        inserted = data;
      } else if (tableName === 'contact_notes') {
        inserted = {
          id: data.id || `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          created_at: new Date().toISOString(),
          ...data,
        };
        mockContactNotes.push(inserted);
      } else {
        inserted = data;
      }

      return {
        select: () => ({
          single: async () => ({ data: inserted, error: null }),
          maybeSingle: async () => ({ data: inserted, error: null }),
        }),
        then: (resolve: any) => resolve({ data: inserted, error: null }),
      };
    },
    update: (patch: any) => {
      return {
        eq: (col: string, val: any) => {
          return {
            select: () => ({
              single: async () => {
                if (tableName === 'contacts') {
                  const item = mockContacts.find(c => c[col] === val);
                  if (item) Object.assign(item, patch, { updated_at: new Date().toISOString() });
                  return { data: item || null, error: null };
                }
                return { data: null, error: null };
              },
            }),
            then: (resolve: any) => {
              if (tableName === 'contacts') {
                const item = mockContacts.find(c => c[col] === val);
                if (item) Object.assign(item, patch, { updated_at: new Date().toISOString() });
                return resolve({ data: item || null, error: null });
              }
              return resolve({ data: null, error: null });
            },
          };
        },
      };
    },
    delete: () => {
      const deleteFilters: Array<{ col: string; val: any }> = [];
      const delBuilder = {
        eq: (col: string, val: any) => {
          deleteFilters.push({ col, val });
          return delBuilder;
        },
        then: (resolve: any) => {
          if (tableName === 'contact_tags') {
            const cid = deleteFilters.find(f => f.col === 'contact_id')?.val;
            const tid = deleteFilters.find(f => f.col === 'tag_id')?.val;
            if (cid && tid) {
              mockContactTags = mockContactTags.filter(
                ct => !(ct.contact_id === cid && ct.tag_id === tid)
              );
            }
          } else if (tableName === 'contact_notes') {
            const nid = deleteFilters.find(f => f.col === 'id')?.val;
            if (nid) {
              mockContactNotes = mockContactNotes.filter(n => n.id !== nid);
            }
          }
          return resolve({ data: null, error: null });
        },
      };
      return delBuilder;
    },
    then: (resolve: any) => {
      let rows: any[] = [];
      if (tableName === 'tenants') {
        rows = [...mockTenants];
      } else if (tableName === 'contacts') {
        rows = [...mockContacts];
      } else if (tableName === 'tags') {
        rows = [...mockTags];
      } else if (tableName === 'contact_tags') {
        rows = mockContactTags.map(ct => {
          const t = mockTags.find(tag => tag.id === ct.tag_id);
          return {
            ...ct,
            tags: t || null,
          };
        });
      } else if (tableName === 'contact_notes') {
        rows = [...mockContactNotes];
      } else if (tableName === 'contact_channel_identities') {
        rows = [...mockChannelIdentities];
      }

      // Apply query filters
      for (const f of filters) {
        if (f.type === 'eq') {
          rows = rows.filter(r => r[f.col] === f.val);
        } else if (f.type === 'in') {
          rows = rows.filter(r => Array.isArray(f.val) && f.val.includes(r[f.col]));
        } else if (f.type === 'ilike') {
          rows = rows.filter(
            r => typeof r[f.col] === 'string' && r[f.col].toLowerCase() === String(f.val).toLowerCase()
          );
        } else if (f.type === 'or') {
          const parts = f.val.split(',');
          rows = rows.filter(r => {
            return parts.some((p: string) => {
              const [col, op, val] = p.split('.');
              if (op === 'eq') return r[col] === val;
              return false;
            });
          });
        }
      }

      if (isSingle || isMaybeSingle) {
        const item = rows[0] || null;
        if (isSingle && !item) {
          return resolve({ data: null, error: { message: 'Row not found' } });
        }
        return resolve({ data: item, error: null });
      }

      if (limitVal !== null) {
        rows = rows.slice(0, limitVal);
      }

      return resolve({ data: rows, error: null });
    },
  };

  return builder;
};

const mockSupabaseClient = {
  from: jest.fn((tableName: string) => createMockQueryBuilder(tableName)),
};

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => mockSupabaseClient),
  getSupabase: jest.fn(() => mockSupabaseClient),
  supabase: mockSupabaseClient,
  isValidUuid: (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  safeUuidOrNull: (id: any) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))
      ? String(id)
      : null,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

// Import route handlers after mocking Supabase client
import { GET, POST } from '@/app/api/v1/crm/contacts/route';

describe('CRM Contacts API Suite (/api/v1/crm/contacts)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockDb();
  });

  // =========================================================================
  // 1. GET /api/v1/crm/contacts (5 tests)
  // =========================================================================
  describe('GET /api/v1/crm/contacts', () => {
    it('1. returns 400 when tenant_id parameter is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/crm/contacts');
      const res = await GET(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('tenant_id');
    });

    it('2. returns 404 when tenant is not found in database', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/crm/contacts?tenant_id=nonexistent-tenant-xyz-999');
      const res = await GET(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('TENANT_NOT_FOUND');
    });

    it('2b. returns 401 when unauthorized or cross-tenant session attempts access', async () => {
      // Missing auth cookie / header
      const unauthReq = new NextRequest('http://localhost:3000/api/v1/crm/contacts?tenant_id=onlineboost');
      const unauthRes = await GET(unauthReq);
      expect(unauthRes.status).toBe(401);
      const unauthJson = await unauthRes.json();
      expect(unauthJson.success).toBe(false);
      expect(unauthJson.error).toBe('UNAUTHORIZED');

      // Cross-tenant attacker cookie
      const crossReq = new NextRequest('http://localhost:3000/api/v1/crm/contacts?tenant_id=onlineboost', {
        headers: { cookie: 'merchant_store=attacker-tenant' },
      });
      const crossRes = await GET(crossReq);
      expect(crossRes.status).toBe(401);
      const crossJson = await crossRes.json();
      expect(crossJson.success).toBe(false);
      expect(crossJson.error).toBe('UNAUTHORIZED');
    });

    it('3. successfully returns dynamic CRM contacts and unique tags for onlineboost (list query)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/crm/contacts?tenant_id=onlineboost', {
        headers: { cookie: 'merchant_store=onlineboost' },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.contacts)).toBe(true);
      expect(Array.isArray(json.tags)).toBe(true);
      expect(json.total).toBe(2);

      // Verify contact mapping & tags
      expect(json.tags).toContain('alumni-cpm');
      const contact1 = json.contacts.find((c: any) => c.id === MOCK_CONTACT_1_ID);
      expect(contact1).toBeDefined();
      expect(contact1.name).toBe('Budi Santoso');
      expect(contact1.phone).toBe('+6281234567890');
      expect(contact1.leadScore).toBe(95);
    });

    it('4. returns single contact with details when queried by phone', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/crm/contacts?tenant_id=onlineboost&phone=081234567890', {
        headers: { cookie: 'merchant_store=onlineboost' },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.contact).toBeDefined();
      expect(json.contact.id).toBe(MOCK_CONTACT_1_ID);
      expect(json.contact.phone_e164).toBe('+6281234567890');
      expect(Array.isArray(json.contact.tags)).toBe(true);
      expect(Array.isArray(json.contact.notes)).toBe(true);
      expect(json.contact.notes[0].body).toBe('Catatan pertama prospek');
    });

    it('5. returns single contact with details when queried by contact_id', async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/crm/contacts?tenant_id=onlineboost&contact_id=${MOCK_CONTACT_1_ID}`, {
        headers: { cookie: 'merchant_store=onlineboost' },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.contact).toBeDefined();
      expect(json.contact.id).toBe(MOCK_CONTACT_1_ID);
      expect(json.contact.name).toBe('Budi Santoso');
    });
  });

  // =========================================================================
  // 2. POST /api/v1/crm/contacts (7 tests)
  // =========================================================================
  describe('POST /api/v1/crm/contacts', () => {
    it('6. returns 400 when tenant_id or tenant_slug is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/crm/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Andi' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('tenant_id');
    });

    it('7. returns 404 when tenant cannot be resolved', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/crm/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: 'unknown-ghost-tenant', phone: '081234567890' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('TENANT_NOT_FOUND');
    });

    it('7b. returns 401 when unauthorized session attempts POST', async () => {
      const unauthReq = new NextRequest('http://localhost:3000/api/v1/crm/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 'onlineboost',
          phone: '08129998877',
          name: 'Attacker Prospek',
        }),
      });
      const unauthRes = await POST(unauthReq);
      expect(unauthRes.status).toBe(401);
      const unauthJson = await unauthRes.json();
      expect(unauthJson.success).toBe(false);
      expect(unauthJson.error).toBe('UNAUTHORIZED');
    });

    it('8. handles action UPDATE_STAGE and updates contact lifecycle stage', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/crm/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'merchant_store=onlineboost',
        },
        body: JSON.stringify({
          tenant_id: 'onlineboost',
          action: 'UPDATE_STAGE',
          contact_id: MOCK_CONTACT_1_ID,
          stage: 'CUSTOMER',
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.contact.lifecycle_stage).toBe('CUSTOMER');

      // Verify in-memory state updated
      const c1 = mockContacts.find(c => c.id === MOCK_CONTACT_1_ID);
      expect(c1.lifecycle_stage).toBe('CUSTOMER');
    });

    it('9. handles action CREATE_AND_ADD_TAG and returns updated contact with new tag', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/crm/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'merchant_store=onlineboost',
        },
        body: JSON.stringify({
          tenant_id: 'onlineboost',
          action: 'CREATE_AND_ADD_TAG',
          contact_id: MOCK_CONTACT_1_ID,
          name: 'VIP Buyer',
          color: '#10B981',
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.tag).toBeDefined();
      expect(json.tag.name).toBe('VIP Buyer');
      expect(json.contact).toBeDefined();
      expect(json.contact.tags.some((t: any) => t.name === 'VIP Buyer')).toBe(true);
    });

    it('10. handles action REMOVE_TAG from contact', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/crm/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'merchant_store=onlineboost',
        },
        body: JSON.stringify({
          tenant_id: 'onlineboost',
          action: 'REMOVE_TAG',
          contact_id: MOCK_CONTACT_1_ID,
          tag_id: 'tag-1',
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify contact tag mapping removed
      expect(mockContactTags.some(ct => ct.contact_id === MOCK_CONTACT_1_ID && ct.tag_id === 'tag-1')).toBe(false);
    });

    it('11. handles actions ADD_NOTE and DELETE_NOTE for contact memory', async () => {
      // 11.a Add Note
      const addReq = new NextRequest('http://localhost:3000/api/v1/crm/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'merchant_store=onlineboost',
        },
        body: JSON.stringify({
          tenant_id: 'onlineboost',
          action: 'ADD_NOTE',
          contact_id: MOCK_CONTACT_1_ID,
          body: 'Janji follow-up ulang besok jam 14:00 via WA',
          author_name: 'CS Sarah',
        }),
      });
      const addRes = await POST(addReq);
      expect(addRes.status).toBe(200);
      const addJson = await addRes.json();
      expect(addJson.success).toBe(true);
      expect(addJson.note).toBeDefined();
      expect(addJson.note.body).toContain('Janji follow-up');

      const createdNoteId = addJson.note.id;

      // 11.b Delete Note
      const delReq = new NextRequest('http://localhost:3000/api/v1/crm/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'merchant_store=onlineboost',
        },
        body: JSON.stringify({
          tenant_id: 'onlineboost',
          action: 'DELETE_NOTE',
          note_id: createdNoteId,
        }),
      });
      const delRes = await POST(delReq);
      expect(delRes.status).toBe(200);
      const delJson = await delRes.json();
      expect(delJson.success).toBe(true);
      expect(mockContactNotes.some(n => n.id === createdNoteId)).toBe(false);
    });

    it('12. creates or updates full contact (default action) with validation', async () => {
      // 12.a Missing phone rejects with 400
      const missingPhoneReq = new NextRequest('http://localhost:3000/api/v1/crm/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'merchant_store=onlineboost',
        },
        body: JSON.stringify({
          tenant_id: 'onlineboost',
          name: 'Kontak Tanpa Nomor',
        }),
      });
      const missingRes = await POST(missingPhoneReq);
      expect(missingRes.status).toBe(400);
      const missingJson = await missingRes.json();
      expect(missingJson.success).toBe(false);
      expect(missingJson.error).toContain('Nomor WhatsApp');

      // 12.b Valid payload creates full contact
      const validReq = new NextRequest('http://localhost:3000/api/v1/crm/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'merchant_store=onlineboost',
        },
        body: JSON.stringify({
          tenant_id: 'onlineboost',
          phone: '08129998877',
          name: 'Ahmad Faisal',
          email: 'faisal@example.com',
          tags: ['Web Lead'],
          initialNotes: 'Datang dari iklan Facebook',
          productInterest: 'Paket Starter',
        }),
      });
      const validRes = await POST(validReq);
      expect(validRes.status).toBe(200);
      const validJson = await validRes.json();
      expect(validJson.success).toBe(true);
      expect(validJson.contact).toBeDefined();
      expect(validJson.contact.phone_e164).toBe('+628129998877');
      expect(validJson.contact.name).toBe('Ahmad Faisal');
    });
  });
});
