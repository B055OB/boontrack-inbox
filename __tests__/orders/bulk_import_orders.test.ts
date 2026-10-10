/**
 * @file __tests__/orders/bulk_import_orders.test.ts
 * @description Unit tests for Bulk Import Pesanan (CSV/XLSX) dengan Auto Sync Meta CAPI & Laporan Keuangan
 */

import { OrderBulkImportService } from '@/lib/services/order-bulk-import.service';
import { POST as bulkImportRoute } from '@/app/api/orders/bulk-import/route';
import { GET as templateRoute } from '@/app/api/orders/bulk-import/template/route';
import { ContactService } from '@/lib/crm/contact.service';
import type { NextRequest } from 'next/server';

interface MockTenant {
  id: string;
  slug: string;
  name: string;
  tier: string;
  metadata: Record<string, any>;
}

interface MockOrder {
  id: string;
  order_number?: string;
  tenant_slug: string;
  tenant_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  product_title: string;
  gross_amount: number;
  status: string;
  payment_status: string;
  order_status: string;
  paid_at?: string;
  created_at: string;
  metadata?: any;
}

interface MockContact {
  id: string;
  tenant_id: string;
  phone_e164: string;
  name?: string | null;
  lifecycle_stage: string;
  updated_at: string;
}

let dbTenants: MockTenant[] = [];
let dbOrders: MockOrder[] = [];
let dbOrderItems: any[] = [];
let dbContacts: MockContact[] = [];
let capiFetchCalls: any[] = [];

// Mock global fetch for Meta CAPI
const originalFetch = global.fetch;

// Mock Supabase Client
jest.mock('@/lib/supabaseClient', () => ({
  getSupabase: jest.fn(() => createMockSupabase()),
  getSupabaseAdmin: jest.fn(() => createMockSupabase()),
}));

// Mock ContactService
jest.mock('@/lib/crm/contact.service', () => ({
  ContactService: {
    getOrCreateContactByPhone: jest.fn(async (tenantId: string, phone: string, name?: string) => {
      const existing = dbContacts.find(c => c.tenant_id === tenantId && c.phone_e164 === phone);
      if (existing) {
        if (name && !existing.name) existing.name = name;
        return existing;
      }
      const newContact: MockContact = {
        id: `cnt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tenant_id: tenantId,
        phone_e164: phone,
        name: name || null,
        lifecycle_stage: 'LEAD',
        updated_at: new Date().toISOString(),
      };
      dbContacts.push(newContact);
      return newContact;
    }),
  },
}));

function createMockSupabase() {
  return {
    from: (table: string) => {
      let filters: { field: string; op: string; val: any }[] = [];

      const builder: any = {
        select: () => builder,
        eq: (field: string, val: any) => {
          filters.push({ field, op: 'eq', val });
          return builder;
        },
        maybeSingle: async () => {
          if (table === 'tenants') {
            const slugFilter = filters.find(f => f.field === 'slug');
            const idFilter = filters.find(f => f.field === 'id');
            const found = dbTenants.find(t =>
              (slugFilter && t.slug.toLowerCase() === String(slugFilter.val).toLowerCase()) ||
              (idFilter && t.id === idFilter.val)
            );
            return { data: found || null, error: null };
          }
          return { data: null, error: null };
        },
        insert: async (payload: any) => {
          const rows = Array.isArray(payload) ? payload : [payload];
          if (table === 'orders') {
            dbOrders.push(...rows);
          } else if (table === 'order_items') {
            dbOrderItems.push(...rows);
          }
          return { data: rows, error: null };
        },
        update: (payload: any) => {
          return {
            eq: async (field: string, val: any) => {
              if (table === 'contacts') {
                const c = dbContacts.find(item => (item as any)[field] === val);
                if (c) Object.assign(c, payload);
              }
              return { data: null, error: null };
            },
          };
        },
        upsert: async (payload: any) => {
          return { data: payload, error: null };
        },
      };
      return builder;
    },
  };
}

describe('Bulk Import Pesanan (CSV/XLSX) dengan Auto Sync Meta CAPI & Laporan Keuangan', () => {
  beforeEach(() => {
    dbTenants = [
      {
        id: '11111111-2222-3333-4444-555555555555',
        slug: 'toko-berkah',
        name: 'Toko Berkah Sejahtera',
        tier: 'PRO_SCALE',
        metadata: {
          tracking: {
            meta_pixel_id: '123456789012345',
            meta_access_token: 'EAAB_test_mock_token_secret',
            test_event_code: 'TEST12345',
          },
        },
      },
    ];

    dbOrders = [];
    dbOrderItems = [];
    dbContacts = [];
    capiFetchCalls = [];

    // Mock global fetch to intercept Meta CAPI calls
    global.fetch = jest.fn(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr.includes('graph.facebook.com')) {
        capiFetchCalls.push({
          url: urlStr,
          body: init?.body ? JSON.parse(init.body) : null,
        });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            events_received: 1,
            fbtrace_id: 'trace_test_123',
          }),
        } as any;
      }
      return originalFetch(url, init);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. Parsing & Validasi Baris Data (Row Validator)', () => {
    it('menormalkan nomor telepon ke format internasional (E.164 628xxx)', () => {
      const rows = [
        {
          nama_pembeli: 'Budi Santoso',
          nomor_whatsapp: '0812-3456-7890',
          nama_produk: 'Serum Glowing',
          nominal: '150.000',
        },
        {
          nama_pembeli: 'Dewi Lestari',
          nomor_whatsapp: '6285712345678',
          nama_produk: 'Cream Malam',
          nominal: 200000,
        },
      ];

      const { valid, errors } = OrderBulkImportService.validateRows(rows);
      expect(errors).toHaveLength(0);
      expect(valid).toHaveLength(2);
      expect(valid[0].customerPhoneNormalized).toBe('6281234567890');
      expect(valid[1].customerPhoneNormalized).toBe('6285712345678');
    });

    it('memvalidasi nominal angka dengan format Rp dan pemisah ribuan', () => {
      const rows = [
        {
          nama_pembeli: 'Ahmad Dahlan',
          nomor_whatsapp: '081987654321',
          nama_produk: 'Madu Asli 500g',
          nominal: 'Rp 175.000',
        },
        {
          nama_pembeli: 'Rina Nose',
          nomor_whatsapp: '081311223344',
          nama_produk: 'Gamis Katun',
          nominal: '350.000,00',
        },
      ];

      const { valid, totalRevenue } = OrderBulkImportService.validateRows(rows);
      expect(valid).toHaveLength(2);
      expect(valid[0].grossAmount).toBe(175000);
      expect(valid[1].grossAmount).toBe(350000);
      expect(totalRevenue).toBe(525000);
    });

    it('menangkap baris bermasalah jika nama, nomor hp, produk, atau nominal kosong/salah', () => {
      const rows = [
        {
          nama_pembeli: '', // Salah: nama kosong
          nomor_whatsapp: '081234567890',
          nama_produk: 'Serum',
          nominal: 100000,
        },
        {
          nama_pembeli: 'Siti Aminah',
          nomor_whatsapp: '123', // Salah: nomor terlalu pendek
          nama_produk: 'Serum',
          nominal: 100000,
        },
        {
          nama_pembeli: 'Joko Anwar',
          nomor_whatsapp: '081234567890',
          nama_produk: '', // Salah: produk kosong
          nominal: 100000,
        },
        {
          nama_pembeli: 'Hendro',
          nomor_whatsapp: '081234567890',
          nama_produk: 'Serum',
          nominal: 0, // Salah: nominal 0
        },
      ];

      const { valid, errors } = OrderBulkImportService.validateRows(rows);
      expect(valid).toHaveLength(0);
      expect(errors).toHaveLength(4);
      expect(errors[0].reason).toMatch(/Nama pembeli wajib diisi/);
      expect(errors[1].reason).toMatch(/Nomor telepon .* tidak valid/);
      expect(errors[2].reason).toMatch(/Nama produk wajib diisi/);
      expect(errors[3].reason).toMatch(/Nominal transaksi .* tidak valid/);
    });
  });

  describe('2. Batch Insert Database Pesanan & CRM Sync', () => {
    it('menyimpan pesanan dengan status PAID & COMPLETED agar langsung tercermin di laporan keuangan', async () => {
      const rows = [
        {
          tanggal_transaksi: '2026-10-10',
          nomor_invoice: 'INV-IMPORT-001',
          nama_pembeli: 'Budi Santoso',
          nomor_whatsapp: '081234567890',
          email: 'budi@gmail.com',
          nama_produk: 'Paket Glowing',
          jumlah: 2,
          nominal: 300000,
          metode_pembayaran: 'QRIS',
        },
        {
          tanggal_transaksi: '2026-10-10',
          nomor_invoice: 'INV-IMPORT-002',
          nama_pembeli: 'Dewi Sartika',
          nomor_whatsapp: '085712345678',
          nama_produk: 'Serum Vitamin C',
          jumlah: 1,
          nominal: 150000,
          metode_pembayaran: 'Transfer Bank',
        },
      ];

      const result = await OrderBulkImportService.processBulkImport(rows, {
        tenantSlug: 'toko-berkah',
        syncMetaCapi: false, // Uji tanpa CAPI dulu
      });

      expect(result.success).toBe(true);
      expect(result.summary.total_success).toBe(2);
      expect(result.summary.total_failed).toBe(0);
      expect(result.summary.total_revenue_idr).toBe(450000);
      expect(result.summary.formatted_revenue).toBe('Rp 450.000');

      // Verifikasi baris tersimpan di database orders
      expect(dbOrders).toHaveLength(2);
      expect(dbOrders[0].status).toBe('PAID');
      expect(dbOrders[0].payment_status).toBe('PAID');
      expect(dbOrders[0].order_status).toBe('COMPLETED');
      expect(dbOrders[0].gross_amount).toBe(300000);
      expect(dbOrders[0].tenant_slug).toBe('toko-berkah');

      // Verifikasi baris order_items
      expect(dbOrderItems).toHaveLength(2);
      expect(dbOrderItems[0].product_title).toBe('Paket Glowing');
      expect(dbOrderItems[0].price).toBe(300000);

      // Verifikasi Contact CRM disinkronisasi ke stage 'CUSTOMER'
      expect(ContactService.getOrCreateContactByPhone).toHaveBeenCalledTimes(2);
      expect(dbContacts).toHaveLength(2);
      expect(dbContacts[0].lifecycle_stage).toBe('CUSTOMER');
    });
  });

  describe('3. Trigger Meta Conversions API (CAPI) Batch Dispatch', () => {
    it('mengirim batch event Purchase ke Meta CAPI dengan action_source: physical_store dan SHA-256 hashing', async () => {
      const rows = [
        {
          tanggal_transaksi: '2026-10-10 10:00:00',
          nomor_invoice: 'INV-CAPI-001',
          nama_pembeli: 'Budi Santoso',
          nomor_whatsapp: '081234567890',
          email: 'budi@gmail.com',
          nama_produk: 'Gamis Silk M',
          nominal: 250000,
        },
      ];

      const result = await OrderBulkImportService.processBulkImport(rows, {
        tenantSlug: 'toko-berkah',
        syncMetaCapi: true,
      });

      expect(result.success).toBe(true);
      expect(result.summary.meta_capi_synced).toBe(1);
      expect(result.summary.meta_capi_status).toBe('DISPATCHED');

      // Verifikasi payload Meta CAPI dikirim
      expect(capiFetchCalls).toHaveLength(1);
      const call = capiFetchCalls[0];
      expect(call.url).toContain('123456789012345'); // Pixel ID
      expect(call.url).toContain('access_token=EAAB_test_mock_token_secret');

      const body = call.body;
      expect(body.data).toHaveLength(1);
      const event = body.data[0];
      expect(event.event_name).toBe('Purchase');
      expect(event.action_source).toBe('physical_store');
      expect(event.custom_data.currency).toBe('IDR');
      expect(event.custom_data.value).toBe(250000);
      expect(event.custom_data.content_name).toBe('Gamis Silk M');

      // Verifikasi user_data ter-hash SHA-256 (64 hex characters)
      expect(event.user_data.ph[0]).toHaveLength(64);
      expect(event.user_data.fn[0]).toHaveLength(64);
      expect(event.user_data.em[0]).toHaveLength(64);
    });

    it('menandai status SKIPPED_NO_PIXEL jika tenant belum memasang Pixel ID di metadata', async () => {
      // Hapus pixel config pada tenant
      dbTenants[0].metadata = {};

      const rows = [
        {
          nama_pembeli: 'Andi Mallarangeng',
          nomor_whatsapp: '081234567890',
          nama_produk: 'Sepatu Kulit 42',
          nominal: 450000,
        },
      ];

      const result = await OrderBulkImportService.processBulkImport(rows, {
        tenantSlug: 'toko-berkah',
        syncMetaCapi: true,
      });

      expect(result.success).toBe(true);
      expect(result.summary.meta_capi_status).toBe('SKIPPED_NO_PIXEL');
      expect(result.summary.meta_capi_synced).toBe(0);
      expect(capiFetchCalls).toHaveLength(0); // Tidak ada HTTP call ke Facebook
    });
  });

  describe('4. Download Template Standar (Excel & CSV)', () => {
    it('menghasilkan buffer Excel (.xlsx) dengan kolom standar pesanan', () => {
      const buffer = OrderBulkImportService.generateTemplateExcel();
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(100);

      // Verifikasi buffer dapat di-parse ulang oleh XLSX
      const parsedRows = OrderBulkImportService.parseBufferToRows(buffer);
      expect(parsedRows.length).toBeGreaterThanOrEqual(2);
      expect(parsedRows[0].nama_pembeli || parsedRows[0].nama).toBeTruthy();
    });

    it('menghasilkan teks CSV dengan header kolom pesanan yang sesuai', () => {
      const csv = OrderBulkImportService.generateTemplateCsv();
      expect(csv).toContain('Tanggal Transaksi');
      expect(csv).toContain('Nama Pembeli');
      expect(csv).toContain('Nomor WhatsApp');
      expect(csv).toContain('Nama Produk');
      expect(csv).toContain('Nominal (Rp)');
    });
  });

  describe('5. API Routes: POST /api/orders/bulk-import & GET /api/orders/bulk-import/template', () => {
    it('POST /api/orders/bulk-import menolak request tanpa tenantSlug (400)', async () => {
      const req = {
        headers: { get: () => 'application/json' },
        json: async () => ({ orders: [] }),
        cookies: { get: () => undefined },
      } as unknown as NextRequest;

      const res = await bulkImportRoute(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/tenantSlug wajib disertakan/);
    });

    it('POST /api/orders/bulk-import berhasil memproses JSON payload pesanan', async () => {
      const req = {
        headers: { get: () => 'application/json' },
        json: async () => ({
          tenantSlug: 'toko-berkah',
          orders: [
            {
              nama_pembeli: 'Budi Santoso',
              nomor_whatsapp: '081234567890',
              nama_produk: 'Paket Glow',
              nominal: 150000,
            },
          ],
          syncMetaCapi: false,
        }),
        cookies: { get: () => undefined },
      } as unknown as NextRequest;

      const res = await bulkImportRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.summary.total_success).toBe(1);
      expect(json.summary.total_revenue_idr).toBe(150000);
    });

    it('GET /api/orders/bulk-import/template mengembalikan file attachment spreadsheet', async () => {
      const req = {
        url: 'http://localhost/api/orders/bulk-import/template?format=xlsx',
      } as unknown as NextRequest;

      const res = await templateRoute(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('spreadsheetml.sheet');
      expect(res.headers.get('Content-Disposition')).toContain('template-import-pesanan-boontrack.xlsx');
    });
  });
});
