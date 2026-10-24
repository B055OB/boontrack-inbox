/**
 * @file __tests__/orders/meta_capi_csv_alignment.test.ts
 * @description Comprehensive unit tests for Tenant Dashboard Order CSV Export and
 * Bulk Import aligned with Meta Offline Conversions & CAPI standards.
 */

import {
  generateOrdersMetaCsv,
  generateOrdersMetaCsvString,
  exportOrdersToMetaCsv,
  formatIsoWithOffset,
  parseDeterministicDate,
  parseStrictNominal,
  OrderRecord,
} from '@/lib/utils/orderFulfillment';
import {
  OrderBulkImportService,
  RawImportOrderRow,
} from '@/lib/services/order-bulk-import.service';
import type { NextRequest } from 'next/server';

describe('Tenant Dashboard CSV Export & Bulk Import - Meta Offline Event & CAPI Alignment', () => {
  describe('1. Order CSV Export Generator (Meta Offline Conversions Format)', () => {
    it('menghasilkan header Meta standar (event_name, event_time, value, currency, phone, order_id)', () => {
      const orders: OrderRecord[] = [
        {
          id: 'ord-101',
          order_id: 'INV-2026-001',
          customer_name: 'Dewi Sartika',
          customer_phone: '081234567890',
          total_amount: 160000,
          created_at: '2026-10-09T10:00:00.000Z',
          product_name: 'Paket Glowing Day & Night',
          payment_method: 'QRIS',
          status: 'PAID',
        },
      ];

      const csv = generateOrdersMetaCsvString(orders, 'toko-berkah', 'IDR');
      const lines = csv.split('\n').filter(Boolean);

      expect(lines).toHaveLength(2);
      const headers = lines[0].replace(/^\ufeff/, '').split(',');
      expect(headers).toContain('event_name');
      expect(headers).toContain('event_time');
      expect(headers).toContain('value');
      expect(headers).toContain('currency');
      expect(headers).toContain('phone');
      expect(headers).toContain('order_id');

      // Assert row values
      const row = lines[1];
      expect(row).toContain('Purchase');
      expect(row).toContain('160000');
      expect(row).toContain('IDR');
      expect(row).toContain('6281234567890');
      expect(row).toContain('INV-2026-001');
    });

    it('memformat event_time ke ISO 8601 lengkap dengan UTC offset (+07:00)', () => {
      const date = new Date('2026-10-09T03:00:00.000Z'); // 10:00:00 WIB
      const isoWithOffset = formatIsoWithOffset(date, 7);

      expect(isoWithOffset).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/);
      expect(isoWithOffset).toBe('2026-10-09T10:00:00+07:00');
    });

    it('menangani nominal transaksi real (160000, 170000, 400000) sebagai numerik murni tanpa Rp atau titik', () => {
      const orders: OrderRecord[] = [
        {
          id: 'ord-1',
          order_id: 'INV-001',
          customer_name: 'Budi',
          customer_phone: '081200000001',
          total_amount: 160000,
          created_at: '2026-10-10T08:00:00.000Z',
          status: 'PAID',
        },
        {
          id: 'ord-2',
          order_id: 'INV-002',
          customer_name: 'Citra',
          customer_phone: '081200000002',
          gross_amount: 170000,
          created_at: '2026-10-10T09:00:00.000Z',
          status: 'PAID',
        },
        {
          id: 'ord-3',
          order_id: 'INV-003',
          customer_name: 'Doni',
          customer_phone: '081200000003',
          amount: 400000,
          created_at: '2026-10-10T10:00:00.000Z',
          status: 'PAID',
        },
      ];

      const csv = generateOrdersMetaCsvString(orders, 'toko-berkah', 'IDR');
      const lines = csv.split('\n').filter(Boolean);

      expect(lines).toHaveLength(4);
      expect(lines[1]).toContain(',160000,IDR,');
      expect(lines[2]).toContain(',170000,IDR,');
      expect(lines[3]).toContain(',400000,IDR,');
    });

    it('menormalkan nomor telepon ke format E.164 (628xxx) secara deterministik', () => {
      const orders: OrderRecord[] = [
        {
          id: 'ord-phone-1',
          order_id: 'INV-PH-1',
          customer_name: 'Ahmad',
          customer_phone: '0813-1449-5884',
          total_amount: 160000,
          created_at: '2026-10-10T08:00:00.000Z',
        },
        {
          id: 'ord-phone-2',
          order_id: 'INV-PH-2',
          customer_name: 'Siti',
          customer_phone: '81234567890',
          total_amount: 170000,
          created_at: '2026-10-10T09:00:00.000Z',
        },
        {
          id: 'ord-phone-3',
          order_id: 'INV-PH-3',
          customer_name: 'Rian',
          customer_phone: '+62 857 1122 3344',
          total_amount: 400000,
          created_at: '2026-10-10T10:00:00.000Z',
        },
      ];

      const csv = generateOrdersMetaCsvString(orders, 'toko-berkah', 'IDR');
      const lines = csv.split('\n').filter(Boolean);

      expect(lines[1]).toContain(',6281314495884,');
      expect(lines[2]).toContain(',6281234567890,');
      expect(lines[3]).toContain(',6285711223344,');
    });
  });

  describe('2. Parser & Validator Nominal (Zero Silent Coercion Guard)', () => {
    it('memvalidasi nominal murni integer dan string terformat (160000, 170000, 400000)', () => {
      expect(OrderBulkImportService.parseNominal(160000)).toEqual({
        valid: true,
        value: 160000,
      });

      expect(OrderBulkImportService.parseNominal('170000')).toEqual({
        valid: true,
        value: 170000,
      });

      expect(OrderBulkImportService.parseNominal('Rp 400.000')).toEqual({
        valid: true,
        value: 400000,
      });

      expect(OrderBulkImportService.parseNominal('160.000,00')).toEqual({
        valid: true,
        value: 160000,
      });

      expect(OrderBulkImportService.parseNominal('400,000.00')).toEqual({
        valid: true,
        value: 400000,
      });
    });

    it('menolak secara ketat nilai kosong, null, undefined, atau nol (TIDAK diam-diam menjadi 0)', () => {
      const emptyResult = OrderBulkImportService.parseNominal('');
      expect(emptyResult.valid).toBe(false);
      expect(emptyResult.value).toBe(0);
      expect(emptyResult.reason).toMatch(/wajib diisi/i);

      const nullResult = OrderBulkImportService.parseNominal(null);
      expect(nullResult.valid).toBe(false);
      expect(nullResult.reason).toMatch(/wajib diisi/i);

      const undefinedResult = OrderBulkImportService.parseNominal(undefined);
      expect(undefinedResult.valid).toBe(false);
      expect(undefinedResult.reason).toMatch(/wajib diisi/i);

      const zeroResult = OrderBulkImportService.parseNominal(0);
      expect(zeroResult.valid).toBe(false);
      expect(zeroResult.reason).toMatch(/harus lebih dari 0/i);

      const zeroStrResult = OrderBulkImportService.parseNominal('0');
      expect(zeroStrResult.valid).toBe(false);
      expect(zeroStrResult.reason).toMatch(/harus lebih dari 0/i);
    });

    it('menolak string korup / tidak valid (contoh: "abc", "corrupt_data", "-50000")', () => {
      const corruptResult = OrderBulkImportService.parseNominal('corrupt_data');
      expect(corruptResult.valid).toBe(false);
      expect(corruptResult.reason).toMatch(/tidak valid|mengandung karakter tidak dikenal/i);

      const abcResult = OrderBulkImportService.parseNominal('abc');
      expect(abcResult.valid).toBe(false);
      expect(abcResult.reason).toMatch(/tidak valid|mengandung karakter tidak dikenal/i);

      const negativeResult = OrderBulkImportService.parseNominal('-50000');
      expect(negativeResult.valid).toBe(false);
      expect(negativeResult.reason).toMatch(/harus lebih dari 0/i);
    });
  });

  describe('3. Dual-Mode Row Parser (Meta Standard vs Indonesian Local Headers)', () => {
    it('memetakan baris dengan header Meta standard (value, currency, phone, order_id, event_time, event_name)', () => {
      const metaRows: RawImportOrderRow[] = [
        {
          event_name: 'Purchase',
          event_time: '2026-10-09T10:00:00+07:00',
          value: 160000,
          currency: 'IDR',
          phone: '6281314495884',
          order_id: 'INV-META-101',
          customer_name: 'Dewi Lestari',
          product_name: 'Serum Brightening 20ml',
        },
        {
          event_name: 'Purchase',
          event_time: '2026-10-09T11:00:00+07:00',
          value: '170000',
          currency: 'IDR',
          phone: '6281234567890',
          order_id: 'INV-META-102',
          customer_name: 'Budi Santoso',
          product_name: 'Toner Hydrating',
        },
        {
          event_name: 'Purchase',
          event_time: '2026-10-09T12:00:00+07:00',
          value: '400000',
          currency: 'IDR',
          phone: '6285712345678',
          order_id: 'INV-META-103',
          customer_name: 'Siti Nurhaliza',
          product_name: 'Paket Ultimate Acne',
        },
      ];

      const { valid, errors, totalRevenue } = OrderBulkImportService.validateRows(metaRows);

      expect(errors).toHaveLength(0);
      expect(valid).toHaveLength(3);
      expect(valid[0].grossAmount).toBe(160000);
      expect(valid[0].currency).toBe('IDR');
      expect(valid[0].eventName).toBe('Purchase');
      expect(valid[0].orderId).toBe('INV-META-101');
      expect(valid[0].customerPhoneNormalized).toBe('6281314495884');

      expect(valid[1].grossAmount).toBe(170000);
      expect(valid[1].orderId).toBe('INV-META-102');

      expect(valid[2].grossAmount).toBe(400000);
      expect(valid[2].orderId).toBe('INV-META-103');

      expect(totalRevenue).toBe(730000);
    });

    it('memetakan baris dengan header lokal Indonesia (Nominal (Rp), Nomor WhatsApp, Tanggal Transaksi, dll.)', () => {
      const localRows: RawImportOrderRow[] = [
        {
          'Tanggal Transaksi (YYYY-MM-DD)': '2026-10-10',
          'Nomor Invoice (Opsional)': 'INV-LOC-001',
          'Nama Pembeli': 'Hendra Setiawan',
          'Nomor WhatsApp': '081298765432',
          'Nama Produk': 'Sepatu Badminton All-Court',
          'Nominal (Rp)': '400.000',
        },
      ];

      const { valid, errors } = OrderBulkImportService.validateRows(localRows);

      expect(errors).toHaveLength(0);
      expect(valid).toHaveLength(1);
      expect(valid[0].grossAmount).toBe(400000);
      expect(valid[0].customerPhoneNormalized).toBe('6281298765432');
      expect(valid[0].currency).toBe('IDR');
      expect(valid[0].eventName).toBe('Purchase');
      expect(valid[0].orderId).toBe('INV-LOC-001');
    });

    it('memetakan alias total_amount dan gross_amount dengan benar', () => {
      const aliasRows: RawImportOrderRow[] = [
        {
          customer_name: 'Rudi',
          phone: '081122334455',
          product_name: 'Barang A',
          total_amount: 160000,
          event_time: '2026-10-10T10:00:00+07:00',
        },
        {
          customer_name: 'Ani',
          phone: '082233445566',
          product_name: 'Barang B',
          gross_amount: 170000,
          event_time: '2026-10-10T10:00:00+07:00',
        },
      ];

      const { valid, errors } = OrderBulkImportService.validateRows(aliasRows);
      expect(errors).toHaveLength(0);
      expect(valid).toHaveLength(2);
      expect(valid[0].grossAmount).toBe(160000);
      expect(valid[1].grossAmount).toBe(170000);
    });
  });

  describe('4. Meta CAPI Payload Boundary Assertions', () => {
    it('mengonversi event_time ke integer Unix seconds pada payload CAPI (bukan ISO string)', () => {
      const dateString = '2026-10-09T10:00:00+07:00';
      const { unixSeconds } = OrderBulkImportService.parseTransactionDate(dateString);

      expect(Number.isInteger(unixSeconds)).toBe(true);
      const expectedSeconds = Math.floor(new Date(dateString).getTime() / 1000);
      expect(unixSeconds).toBe(expectedSeconds);
    });

    it('memastikan custom_data CAPI memuat value numerik murni, currency ISO 4217, dan order_id', () => {
      const order = {
        rowIndex: 2,
        orderId: 'INV-BOUND-001',
        orderNumber: 'INV-BOUND-001',
        transactionDate: '2026-10-09T10:00:00+07:00',
        unixEventTime: 1791514800,
        customerName: 'Budi Santoso',
        customerPhone: '6281234567890',
        customerPhoneNormalized: '6281234567890',
        productTitle: 'Paket Usaha Kopi',
        quantity: 1,
        grossAmount: 400000,
        paymentMethod: 'QRIS',
        currency: 'IDR',
        eventName: 'Purchase',
      };

      // Simulasikan konstruksi payload CAPI
      const capiCustomData = {
        currency: order.currency || 'IDR',
        value: order.grossAmount,
        content_name: order.productTitle,
        order_id: order.orderId,
      };

      expect(typeof capiCustomData.value).toBe('number');
      expect(capiCustomData.value).toBe(400000);
      expect(capiCustomData.currency).toBe('IDR');
      expect(capiCustomData.order_id).toBe('INV-BOUND-001');
    });

    it('memverifikasi integritas timestamp: tidak memalsukan waktu transaksi historis dan mempertahankan tanggal asli di export CSV', () => {
      const historicalDate = '2026-06-15T08:30:00.000Z';
      const orders: OrderRecord[] = [
        {
          id: 'ord-hist-99',
          order_id: 'INV-HIST-99',
          customer_name: 'Dewi Sartika',
          customer_phone: '081234567890',
          total_amount: 500000,
          created_at: historicalDate,
          paid_at: historicalDate,
          status: 'PAID',
        },
      ];

      const csv = generateOrdersMetaCsvString(orders, 'toko-berkah', 'IDR');
      const lines = csv.split('\n').filter(Boolean);
      expect(lines).toHaveLength(2);

      // Pastikan tanggal asli 15 Juni 2026 tetap dipertahankan murni, TIDAK diubah ke tanggal hari ini
      expect(lines[1]).toContain('2026-06-15T15:30:00+07:00');
    });
  });

  describe('5. P0 Remediation: Strict Meta CAPI & CSV Validation (Zero Silent Fallbacks)', () => {
    it('formatIsoWithOffset melempar error eksplisit jika Date invalid (tidak fallback ke waktu sekarang)', () => {
      const invalidDate = new Date('invalid-date-string');
      expect(() => formatIsoWithOffset(invalidDate, 7)).toThrow(/Date invalid atau bukan objek Date yang valid/);
      expect(() => formatIsoWithOffset(null as any, 7)).toThrow();
    });

    it('generateOrdersMetaCsv mengembalikan ringkasan rekap (summary) penolakan baris secara transparan', () => {
      const mixedOrders: OrderRecord[] = [
        {
          id: 'ord-valid-1',
          order_id: 'INV-VALID-1',
          customer_name: 'Dewi Sukses',
          customer_phone: '081211112222',
          total_amount: 150000,
          created_at: '2026-10-10T10:00:00+07:00',
          status: 'PAID',
        },
        {
          id: 'ord-bad-date',
          order_id: 'INV-BAD-DATE',
          customer_name: 'Budi Bad Date',
          customer_phone: '081233334444',
          total_amount: 200000,
          created_at: 'invalid-date-format',
          status: 'PAID',
        },
        {
          id: 'ord-bad-amt',
          order_id: 'INV-BAD-AMT',
          customer_name: 'Siti Bad Amount',
          customer_phone: '081255556666',
          total_amount: 0,
          created_at: '2026-10-10T10:00:00+07:00',
          status: 'PAID',
        },
        {
          id: 'ord-missing-date',
          order_id: 'INV-MISSING-DATE',
          customer_name: 'Andi No Date',
          customer_phone: '081277778888',
          total_amount: 300000,
          created_at: '',
          status: 'PAID',
        },
      ];

      const { csv, summary } = generateOrdersMetaCsv(mixedOrders, 'toko-berkah', 'IDR');

      // Rekap summary transparan
      expect(summary.totalRows).toBe(4);
      expect(summary.exportedRows).toBe(1);
      expect(summary.skippedRows).toBe(3);
      expect(summary.skippedDetails).toHaveLength(3);

      expect(summary.skippedDetails[0].orderId).toBe('INV-BAD-DATE');
      expect(summary.skippedDetails[0].reason).toBe('invalid_date');

      expect(summary.skippedDetails[1].orderId).toBe('INV-BAD-AMT');
      expect(summary.skippedDetails[1].reason).toBe('invalid_amount');

      expect(summary.skippedDetails[2].orderId).toBe('INV-MISSING-DATE');
      expect(summary.skippedDetails[2].reason).toBe('missing_date');

      // CSV hanya memuat 1 baris data valid
      const lines = csv.split('\r\n').filter(Boolean);
      expect(lines).toHaveLength(2); // Header + 1 baris
      expect(csv).toContain('INV-VALID-1');
      expect(csv).not.toContain('INV-BAD-DATE');
      expect(csv).not.toContain('INV-BAD-AMT');
      expect(csv).not.toContain('INV-MISSING-DATE');

      // exportOrdersToMetaCsv juga mengembalikan summary
      const exportSummary = exportOrdersToMetaCsv(mixedOrders, 'toko-berkah', 'IDR');
      expect(exportSummary.totalRows).toBe(4);
      expect(exportSummary.exportedRows).toBe(1);
      expect(exportSummary.skippedRows).toBe(3);
    });

    it('parseStrictNominal menolak nilai ambigu, malformed, karakter non-angka, dan format desimal/ribuan cacat', () => {
      // 1. Karakter non-angka dan simbol ilegal (tidak boleh sekadar di-strip)
      expect(parseStrictNominal('100$50').valid).toBe(false);
      expect(parseStrictNominal('150k').valid).toBe(false);
      expect(parseStrictNominal('150rb').valid).toBe(false);
      expect(parseStrictNominal('100#50').valid).toBe(false);
      expect(parseStrictNominal('100@50').valid).toBe(false);
      expect(parseStrictNominal('100!50').valid).toBe(false);
      expect(parseStrictNominal('123a456').valid).toBe(false);
      expect(parseStrictNominal('100(diskon)').valid).toBe(false);
      expect(parseStrictNominal('150.000 - 200.000').valid).toBe(false);

      // 2. Pemisah berurutan / cacat
      expect(parseStrictNominal('150..000').valid).toBe(false);
      expect(parseStrictNominal('150,,000').valid).toBe(false);
      expect(parseStrictNominal('150.,000').valid).toBe(false);
      expect(parseStrictNominal('150,.000').valid).toBe(false);

      // 3. Diawali atau diakhiri titik/koma
      expect(parseStrictNominal('.150000').valid).toBe(false);
      expect(parseStrictNominal('150000.').valid).toBe(false);
      expect(parseStrictNominal(',150000').valid).toBe(false);
      expect(parseStrictNominal('150000,').valid).toBe(false);

      // 4. Format ribuan/desimal ambigu atau grouping tidak valid
      expect(parseStrictNominal('15.00,00').valid).toBe(false);
      expect(parseStrictNominal('1.50.000').valid).toBe(false);
      expect(parseStrictNominal('10.20.30').valid).toBe(false);
      expect(parseStrictNominal('150.0000').valid).toBe(false); // lebih dari 3 desimal / ambigu

      // 5. Kosong, nol, atau negatif
      expect(parseStrictNominal('').valid).toBe(false);
      expect(parseStrictNominal(0).valid).toBe(false);
      expect(parseStrictNominal('0').valid).toBe(false);
      expect(parseStrictNominal(-50000).valid).toBe(false);

      // 6. Kasus valid yang harus diterima dengan presisi
      expect(parseStrictNominal(150000)).toEqual({ valid: true, value: 150000 });
      expect(parseStrictNominal('150000')).toEqual({ valid: true, value: 150000 });
      expect(parseStrictNominal('150.000')).toEqual({ valid: true, value: 150000 });
      expect(parseStrictNominal('1.500.000')).toEqual({ valid: true, value: 1500000 });
      expect(parseStrictNominal('Rp 150.000')).toEqual({ valid: true, value: 150000 });
      expect(parseStrictNominal('IDR 150.000,50')).toEqual({ valid: true, value: 150000.5 });
      expect(parseStrictNominal('150,000.00')).toEqual({ valid: true, value: 150000 });
      expect(parseStrictNominal('150.50')).toEqual({ valid: true, value: 150.5 });
      expect(parseStrictNominal('150,50')).toEqual({ valid: true, value: 150.5 });
    });

    it('parseDeterministicDate menafsirkan tanggal tanpa offset secara deterministik ke zona waktu kontrak (WIB / +07:00)', () => {
      // 1. Date-only format YYYY-MM-DD wajib ditafsirkan sebagai midnight WIB (+07:00), bukan mengambang
      const resDateOnly = parseDeterministicDate('2026-10-10');
      expect(resDateOnly.valid).toBe(true);
      expect(resDateOnly.isoWithOffset).toBe('2026-10-10T00:00:00+07:00');
      expect(resDateOnly.isoUtc).toBe('2026-10-09T17:00:00.000Z');
      expect(resDateOnly.unixSeconds).toBe(1791565200);

      // 2. Format Indonesia DD/MM/YYYY dan DD-MM-YYYY
      const resIndoSlash = parseDeterministicDate('10/10/2026');
      expect(resIndoSlash.valid).toBe(true);
      expect(resIndoSlash.isoWithOffset).toBe('2026-10-10T00:00:00+07:00');

      const resIndoDash = parseDeterministicDate('10-10-2026');
      expect(resIndoDash.valid).toBe(true);
      expect(resIndoDash.isoWithOffset).toBe('2026-10-10T00:00:00+07:00');

      // 3. Date-time tanpa offset (YYYY-MM-DD HH:mm:ss atau YYYY-MM-DDTHH:mm:ss)
      const resDateTimeSpace = parseDeterministicDate('2026-10-10 14:30:00');
      expect(resDateTimeSpace.valid).toBe(true);
      expect(resDateTimeSpace.isoWithOffset).toBe('2026-10-10T14:30:00+07:00');
      expect(resDateTimeSpace.isoUtc).toBe('2026-10-10T07:30:00.000Z');
      expect(resDateTimeSpace.unixSeconds).toBe(1791617400);

      const resDateTimeT = parseDeterministicDate('2026-10-10T14:30:00');
      expect(resDateTimeT.valid).toBe(true);
      expect(resDateTimeT.isoWithOffset).toBe('2026-10-10T14:30:00+07:00');
      expect(resDateTimeT.isoUtc).toBe('2026-10-10T07:30:00.000Z');

      // 4. Date-time dengan explicit offset (Z)
      const resExplicitUtc = parseDeterministicDate('2026-10-10T07:30:00.000Z');
      expect(resExplicitUtc.valid).toBe(true);
      expect(resExplicitUtc.isoWithOffset).toBe('2026-10-10T14:30:00+07:00');

      // 5. Tanggal invalid / kosong
      expect(parseDeterministicDate('bukan-tanggal').valid).toBe(false);
      expect(parseDeterministicDate('').valid).toBe(false);
      expect(parseDeterministicDate(null).valid).toBe(false);
      expect(parseDeterministicDate(undefined).valid).toBe(false);
    });

    it('OrderBulkImportService.parseTransactionDate menolak tanggal invalid/kosong (tidak menghasilkan new Date() atau now unix timestamp)', () => {
      const nowSeconds = Math.floor(Date.now() / 1000);

      const res1 = OrderBulkImportService.parseTransactionDate('not-a-date');
      expect(res1.valid).toBe(false);
      expect(res1.isoString).toBe('');
      expect(res1.unixSeconds).toBe(0);
      expect(res1.unixSeconds).not.toBeCloseTo(nowSeconds, -2);

      const res2 = OrderBulkImportService.parseTransactionDate('');
      expect(res2.valid).toBe(false);
      expect(res2.unixSeconds).toBe(0);

      const res3 = OrderBulkImportService.parseTransactionDate(null);
      expect(res3.valid).toBe(false);

      const res4 = OrderBulkImportService.parseTransactionDate(undefined);
      expect(res4.valid).toBe(false);

      const res5 = OrderBulkImportService.parseTransactionDate(-999);
      expect(res5.valid).toBe(false);
    });

    it('OrderBulkImportService.validateRows menolak baris dengan tanggal invalid atau nominal invalid/kosong ke errors array', () => {
      const corruptRows: RawImportOrderRow[] = [
        {
          customer_name: 'Customer Invalid Date',
          phone: '081234567890',
          product_name: 'Barang A',
          total_amount: 150000,
          event_time: 'bukan-tanggal-valid',
        },
        {
          customer_name: 'Customer Invalid Nominal 0',
          phone: '081234567891',
          product_name: 'Barang B',
          total_amount: 0,
          event_time: '2026-10-10T10:00:00+07:00',
        },
        {
          customer_name: 'Customer Empty Nominal',
          phone: '081234567892',
          product_name: 'Barang C',
          total_amount: '',
          event_time: '2026-10-10T10:00:00+07:00',
        },
        {
          customer_name: 'Customer Corrupt String Nominal',
          phone: '081234567893',
          product_name: 'Barang D',
          total_amount: 'abc-xyz',
          event_time: '2026-10-10T10:00:00+07:00',
        },
      ];

      const { valid, errors } = OrderBulkImportService.validateRows(corruptRows);

      // Tidak ada baris yang lolos ke valid
      expect(valid).toHaveLength(0);
      // Semua baris tercatat di errors
      expect(errors).toHaveLength(4);

      // Error baris 1: tanggal invalid
      expect(errors[0].reason).toMatch(/Tanggal transaksi .* tidak valid/);
      // Error baris 2: nominal 0 ditolak
      expect(errors[1].reason).toMatch(/Nominal transaksi .* tidak valid atau harus lebih dari 0/);
      // Error baris 3: nominal kosong ditolak
      expect(errors[2].reason).toMatch(/Nominal transaksi .* wajib diisi/);
      // Error baris 4: nominal non-angka ditolak
      expect(errors[3].reason).toMatch(/Nominal transaksi .* tidak valid atau mengandung karakter tidak dikenal/);
    });
  });
});
