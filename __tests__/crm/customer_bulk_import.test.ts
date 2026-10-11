/**
 * @file __tests__/crm/customer_bulk_import.test.ts
 * @description Unit tests for Customer & Meta Custom Audience Bulk Importer
 * Tests:
 * 1. Phone number auto-sanitizer (08xxx -> 628xxx, 8xxx -> 628xxx, strips non-digits)
 * 2. City column parsing and aliases (kota, city, kabupaten, kab_kota)
 * 3. Graceful error handling (skips invalid rows without failing valid ones)
 * 4. Meta CA sample template generation (Excel & CSV)
 * 5. Supabase contacts database persistence (metadata.city)
 */

import { CustomerBulkImportService } from '@/lib/services/customer-bulk-import.service';
import { OrderBulkImportService } from '@/lib/services/order-bulk-import.service';
import { POST as customerBulkImportRoute } from '@/app/api/customers/bulk-import/route';
import { GET as customerTemplateRoute } from '@/app/api/customers/bulk-import/template/route';
import * as XLSX from 'xlsx';
import type { NextRequest } from 'next/server';

interface MockTenant {
  id: string;
  slug: string;
  tier: string;
  metadata: Record<string, any>;
}

interface MockContact {
  id: string;
  tenant_id: string;
  phone_e164: string;
  name?: string | null;
  email?: string | null;
  contact_status: string;
  lifecycle_stage: string;
  metadata?: Record<string, any>;
  last_interaction_at?: string;
  created_at?: string;
  updated_at?: string;
}

let dbTenants: MockTenant[] = [];
let dbContacts: MockContact[] = [];

function createMockSupabase() {
  return {
    from: (table: string) => {
      if (table === 'tenants') {
        return {
          select: () => ({
            eq: (_col: string, val: any) => ({
              maybeSingle: async () => {
                const found = dbTenants.find(t => t.slug === val || t.id === val);
                return { data: found || null, error: null };
              },
            }),
          }),
        };
      }

      if (table === 'contacts') {
        let filters: Record<string, any> = {};
        return {
          select: (_cols?: string) => ({
            eq: (col: string, val: any) => {
              filters[col] = val;
              return {
                eq: (col2: string, val2: any) => {
                  filters[col2] = val2;
                  return {
                    maybeSingle: async () => {
                      const found = dbContacts.find(c => {
                        return Object.entries(filters).every(([k, v]) => (c as any)[k] === v);
                      });
                      return { data: found || null, error: null };
                    },
                  };
                },
                maybeSingle: async () => {
                  const found = dbContacts.find(c => (c as any)[col] === val);
                  return { data: found || null, error: null };
                },
              };
            },
          }),
          insert: (payload: any) => ({
            select: () => ({
              single: async () => {
                const newId = `contact_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                const record: MockContact = {
                  id: newId,
                  ...payload,
                };
                dbContacts.push(record);
                return { data: { id: newId }, error: null };
              },
            }),
          }),
          update: (updates: any) => ({
            eq: (_col: string, idVal: string) => ({
              select: () => ({
                single: async () => {
                  const idx = dbContacts.findIndex(c => c.id === idVal);
                  if (idx >= 0) {
                    dbContacts[idx] = { ...dbContacts[idx], ...updates };
                    return { data: { id: idVal }, error: null };
                  }
                  return { data: null, error: new Error('Not found') };
                },
              }),
            }),
          }),
        };
      }

      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
        upsert: async () => ({ error: null }),
      };
    },
  };
}

jest.mock('@/lib/supabaseClient', () => ({
  getSupabase: jest.fn(() => createMockSupabase()),
  getSupabaseAdmin: jest.fn(() => createMockSupabase()),
}));

describe('Customer & Meta Custom Audience Bulk Import Module', () => {
  beforeEach(() => {
    dbTenants = [
      {
        id: 'tenant-uuid-demo',
        slug: 'demo-tenant',
        tier: 'PRO_SCALE',
        metadata: {
          store_name: 'Demo Meta Store',
        },
      },
    ];
    dbContacts = [];
  });

  describe('1. Phone Number Auto-Sanitizer', () => {
    it('normalizes local phone starting with 08 to 628', () => {
      const res = CustomerBulkImportService.sanitizePhoneNumber('081234567890');
      expect(res.normalized).toBe('6281234567890');
      expect(res.error).toBeUndefined();
    });

    it('auto-prefixes 628 when leading zero is stripped by Excel integer format (8xxx)', () => {
      const res = CustomerBulkImportService.sanitizePhoneNumber(81234567890);
      expect(res.normalized).toBe('6281234567890');
      expect(res.error).toBeUndefined();
    });

    it('strips all non-digit characters (+, -, space, parentheses, dots)', () => {
      const res1 = CustomerBulkImportService.sanitizePhoneNumber('+62 812-3456-7890');
      expect(res1.normalized).toBe('6281234567890');

      const res2 = CustomerBulkImportService.sanitizePhoneNumber('(0812) 3456 7890');
      expect(res2.normalized).toBe('6281234567890');

      const res3 = CustomerBulkImportService.sanitizePhoneNumber('0812.3456.7890');
      expect(res3.normalized).toBe('6281234567890');
    });

    it('preserves already normalized 628 numbers', () => {
      const res = CustomerBulkImportService.sanitizePhoneNumber('628999888777');
      expect(res.normalized).toBe('628999888777');
    });

    it('handles international double zero prefix 0062', () => {
      const res = CustomerBulkImportService.sanitizePhoneNumber('006281234567890');
      expect(res.normalized).toBe('6281234567890');
    });

    it('flags too short phone numbers gracefully without crashing', () => {
      const res = CustomerBulkImportService.sanitizePhoneNumber('12345');
      expect(res.normalized).toBeNull();
      expect(res.error).toContain('terlalu pendek');
    });

    it('flags empty or non-digit input gracefully', () => {
      const res1 = CustomerBulkImportService.sanitizePhoneNumber('');
      expect(res1.normalized).toBeNull();

      const res2 = CustomerBulkImportService.sanitizePhoneNumber('---');
      expect(res2.normalized).toBeNull();
      expect(res2.error).toContain('tidak memuat digit');
    });
  });

  describe('2. City / Kota Alias Mapping', () => {
    it('resolves city with various alias headers (kota, city, kabupaten, kab_kota)', () => {
      const rows = [
        { nama: 'User A', nomor_whatsapp: '081234567891', kota: 'Jakarta Selatan' },
        { nama: 'User B', nomor_whatsapp: '081234567892', city: 'Surabaya' },
        { nama: 'User C', nomor_whatsapp: '081234567893', kabupaten: 'Bandung Barat' },
        { nama: 'User D', nomor_whatsapp: '081234567894', kab_kota: 'Medan' },
        { nama: 'User E', nomor_whatsapp: '081234567895', 'Kota': 'Semarang' },
      ];

      const { valid, errors } = CustomerBulkImportService.validateCustomerRows(rows);
      expect(errors).toHaveLength(0);
      expect(valid).toHaveLength(5);
      expect(valid[0].city).toBe('Jakarta Selatan');
      expect(valid[1].city).toBe('Surabaya');
      expect(valid[2].city).toBe('Bandung Barat');
      expect(valid[3].city).toBe('Medan');
      expect(valid[4].city).toBe('Semarang');
    });
  });

  describe('3. Partial Error Resilience', () => {
    it('does NOT fail the entire import file when only one or some rows have invalid data', () => {
      const rows = [
        { nama: 'Budi Santoso', nomor_whatsapp: '081234567890', kota: 'Jakarta' }, // Valid
        { nama: 'Bad Row 1', nomor_whatsapp: 'invalid_number', kota: 'Bogor' },      // Invalid phone
        { nama: '', nomor_whatsapp: '085712345678', kota: 'Depok' },                 // Missing name
        { nama: 'Siti Rahma', nomor_whatsapp: '85799998888', kota: 'Tangerang' },    // Valid (8xxx auto-fixed)
      ];

      const { valid, errors } = CustomerBulkImportService.validateCustomerRows(rows);
      expect(valid).toHaveLength(2);
      expect(errors).toHaveLength(2);

      expect(valid[0].name).toBe('Budi Santoso');
      expect(valid[0].phoneNormalized).toBe('6281234567890');

      expect(valid[1].name).toBe('Siti Rahma');
      expect(valid[1].phoneNormalized).toBe('6285799998888');

      expect(errors[0].row).toBe(3); // 1-based row index accounting for header
      expect(errors[1].row).toBe(4);
    });
  });

  describe('4. Meta Custom Audience Template Generation', () => {
    it('generates a valid CSV template containing standard Meta CA columns', () => {
      const csv = CustomerBulkImportService.generateTemplateCsv();
      expect(csv).toContain('Nama,Nomor WhatsApp,Email,Kota');
      expect(csv).toContain('6281234567890');
      expect(csv).toContain('Budi Santoso');
      expect(csv).toContain('Jakarta Selatan');
    });

    it('generates a valid Excel template buffer with proper sheets and columns', () => {
      const buffer = CustomerBulkImportService.generateTemplateExcel();
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(100);

      const wb = XLSX.read(buffer, { type: 'buffer' });
      expect(wb.SheetNames).toContain('Custom Audience');
      const sheet = wb.Sheets['Custom Audience'];
      const data = XLSX.utils.sheet_to_json(sheet);
      expect(data.length).toBeGreaterThanOrEqual(2);
      expect((data[0] as any)['Nomor WhatsApp']).toBe('6281234567890');
      expect((data[0] as any)['Kota']).toBe('Jakarta Selatan');
    });
  });

  describe('5. Database CRM Synchronization (processBulkImport)', () => {
    it('successfully persists valid customer records into Supabase contacts table with metadata.city', async () => {
      const rows = [
        {
          nama: 'Dewi Lestari',
          nomor_whatsapp: '082198765432',
          email: 'dewi@example.com',
          kota: 'Yogyakarta',
        },
        {
          nama: 'Ahmad Fauzi',
          nomor_whatsapp: '87890123456', // Excel stripped 0
          kota: 'Surabaya',
        },
      ];

      const result = await CustomerBulkImportService.processBulkImport(rows, {
        tenantSlug: 'demo-tenant',
      });

      expect(result.success).toBe(true);
      expect(result.summary.total_success).toBe(2);
      expect(result.summary.total_failed).toBe(0);
      expect(dbContacts).toHaveLength(2);

      const contact1 = dbContacts.find(c => c.name === 'Dewi Lestari');
      expect(contact1).toBeDefined();
      expect(contact1?.phone_e164).toBe('+6282198765432');
      expect(contact1?.email).toBe('dewi@example.com');
      expect(contact1?.metadata?.city).toBe('Yogyakarta');
      expect(contact1?.metadata?.source).toBe('CUSTOM_AUDIENCE_IMPORT');

      const contact2 = dbContacts.find(c => c.name === 'Ahmad Fauzi');
      expect(contact2).toBeDefined();
      expect(contact2?.phone_e164).toBe('+6287890123456');
      expect(contact2?.metadata?.city).toBe('Surabaya');
    });
  });

  describe('6. Order Bulk Import Service Compatibility', () => {
    it('also extracts city and auto-sanitizes 08 / 8 phone numbers in OrderBulkImportService', () => {
      const orderRows = [
        {
          'Nama Pembeli': 'Budi Toko',
          'Nomor WhatsApp': '081299990000',
          'Kota (Opsional)': 'Bandung',
          'Nama Produk': 'Produk A',
          'Nominal (Rp)': 100000,
        },
        {
          'Nama Pembeli': 'Siti Toko',
          'Nomor WhatsApp': 85711112222, // integer format
          'kota': 'Semarang',
          'Nama Produk': 'Produk B',
          'Nominal (Rp)': 250000,
        },
      ];

      const { valid, errors } = OrderBulkImportService.validateRows(orderRows as any);
      expect(errors).toHaveLength(0);
      expect(valid).toHaveLength(2);
      expect(valid[0].customerPhoneNormalized).toBe('6281299990000');
      expect(valid[0].city).toBe('Bandung');
      expect(valid[1].customerPhoneNormalized).toBe('6285711112222');
      expect(valid[1].city).toBe('Semarang');
    });
  });

  describe('7. API Route Endpoints', () => {
    it('returns downloadable CSV template from GET /api/customers/bulk-import/template?format=csv', async () => {
      const req = {
        url: 'http://localhost:3000/api/customers/bulk-import/template?format=csv',
      } as NextRequest;

      const res = await customerTemplateRoute(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/csv');
      const text = await res.text();
      expect(text).toContain('Nama,Nomor WhatsApp,Email,Kota');
    });

    it('processes JSON payload via POST /api/customers/bulk-import', async () => {
      const req = {
        headers: new Headers({ 'content-type': 'application/json' }),
        cookies: { get: () => undefined },
        json: async () => ({
          tenantSlug: 'demo-tenant',
          customers: [
            {
              nama: 'Pelanggan API',
              nomor_whatsapp: '081234567899',
              kota: 'Malang',
            },
          ],
        }),
      } as unknown as NextRequest;

      const res = await customerBulkImportRoute(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.summary.total_success).toBe(1);
    });
  });
});
