/**
 * @file lib/services/order-bulk-import.service.ts
 * @description Core service layer for bulk order imports (CSV/XLSX),
 * automatic Meta CAPI batch dispatch (action_source: physical_store),
 * and financial/CRM synchronization.
 */

import * as XLSX from 'xlsx';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { sanitizeOrderPayload } from '@/lib/order-sanitizer';
import { ContactService } from '@/lib/crm/contact.service';
import {
  normalizePhone,
  hashPhone,
  hashSha256,
  hashFirstName,
  hashLastName,
  hashEmail,
  parseName,
} from '@/lib/tracking/meta-capi';

export interface RawImportOrderRow {
  tanggal_transaksi?: string | number | Date;
  nomor_invoice?: string;
  nama_pembeli?: string;
  nomor_whatsapp?: string;
  email?: string;
  nama_produk?: string;
  jumlah?: string | number;
  nominal?: string | number;
  metode_pembayaran?: string;
  catatan?: string;
  [key: string]: any;
}

export interface ValidatedImportOrder {
  rowIndex: number;
  orderId: string;
  orderNumber: string;
  transactionDate: string;
  customerName: string;
  customerPhone: string;
  customerPhoneNormalized: string;
  customerEmail?: string;
  productTitle: string;
  quantity: number;
  grossAmount: number;
  paymentMethod: string;
  notes?: string;
}

export interface RowValidationError {
  row: number;
  reason: string;
  data?: Record<string, any>;
}

export interface BulkImportOptions {
  tenantSlug: string;
  syncMetaCapi?: boolean;
}

export interface BulkImportResult {
  success: boolean;
  summary: {
    total_rows: number;
    total_success: number;
    total_failed: number;
    total_revenue_idr: number;
    formatted_revenue: string;
    meta_capi_synced: number;
    meta_capi_status: 'DISPATCHED' | 'SKIPPED_NO_PIXEL' | 'DISABLED' | 'PARTIAL_ERROR' | 'FAILED';
    batch_id: string;
  };
  errors: RowValidationError[];
  imported_order_ids: string[];
}

export class OrderBulkImportService {
  /**
   * Generates a standard Excel template (.xlsx) buffer with instructions and sample rows.
   */
  public static generateTemplateExcel(): Buffer {
    const headers = [
      'Tanggal Transaksi (YYYY-MM-DD)',
      'Nomor Invoice (Opsional)',
      'Nama Pembeli',
      'Nomor WhatsApp',
      'Email (Opsional)',
      'Nama Produk',
      'Jumlah',
      'Nominal (Rp)',
      'Metode Pembayaran',
      'Catatan / Alamat',
    ];

    const sampleRows = [
      [
        '2026-10-10',
        'INV-OFFLINE-001',
        'Budi Santoso',
        '081234567890',
        'budi@gmail.com',
        'Paket Glow Skincare 30ml',
        1,
        150000,
        'Transfer Bank',
        'Pelanggan offline toko',
      ],
      [
        '2026-10-10',
        'INV-OFFLINE-002',
        'Siti Nurhaliza',
        '085712345678',
        'siti@gmail.com',
        'Gamis Silk Premium M',
        2,
        350000,
        'QRIS Dinamis',
        'Pesanan langsung via WhatsApp',
      ],
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    ws['!cols'] = [
      { wch: 25 },
      { wch: 22 },
      { wch: 22 },
      { wch: 18 },
      { wch: 22 },
      { wch: 28 },
      { wch: 10 },
      { wch: 16 },
      { wch: 20 },
      { wch: 25 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Pesanan');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /**
   * Generates a standard CSV string template.
   */
  public static generateTemplateCsv(): string {
    const headers = [
      'Tanggal Transaksi (YYYY-MM-DD)',
      'Nomor Invoice (Opsional)',
      'Nama Pembeli',
      'Nomor WhatsApp',
      'Email (Opsional)',
      'Nama Produk',
      'Jumlah',
      'Nominal (Rp)',
      'Metode Pembayaran',
      'Catatan / Alamat',
    ].join(',');

    const sample1 = '2026-10-10,INV-OFFLINE-001,Budi Santoso,081234567890,budi@gmail.com,Paket Glow Skincare 30ml,1,150000,Transfer Bank,Pelanggan offline toko';
    const sample2 = '2026-10-10,INV-OFFLINE-002,Siti Nurhaliza,085712345678,siti@gmail.com,Gamis Silk Premium M,2,350000,QRIS Dinamis,Pesanan langsung via WhatsApp';

    return `${headers}\n${sample1}\n${sample2}\n`;
  }

  /**
   * Parses an Excel or CSV file buffer into raw JSON rows.
   */
  public static parseBufferToRows(buffer: Buffer): RawImportOrderRow[] {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) return [];

    const sheet = wb.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

    // Normalize keys to lowercase snake_case
    return rawRows.map(row => {
      const normalizedRow: RawImportOrderRow = {};
      for (const [key, val] of Object.entries(row)) {
        const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        normalizedRow[cleanKey] = val;
        // Keep original key as fallback
        normalizedRow[key] = val;
      }
      return normalizedRow;
    });
  }

  /**
   * Helper: Parse amount string/number to clean integer/float.
   */
  public static parseNominal(val: any): number {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const str = String(val).trim();
    // Remove "Rp", dots (thousand separators), spaces, and replace comma decimal with dot
    let cleaned = str.replace(/rp\.?/gi, '').replace(/\s+/g, '');
    if (cleaned.includes('.') && cleaned.includes(',')) {
      // Format Indonesia: 150.000,00 -> 150000.00
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes('.')) {
      // Bisa jadi 150.000 (ribuan) atau 150.50 (desimal)
      const parts = cleaned.split('.');
      if (parts[parts.length - 1].length === 3) {
        // Ribuan: 150.000 -> 150000
        cleaned = cleaned.replace(/\./g, '');
      }
    } else if (cleaned.includes(',')) {
      const parts = cleaned.split(',');
      if (parts[parts.length - 1].length === 3) {
        cleaned = cleaned.replace(/,/g, '');
      } else {
        cleaned = cleaned.replace(',', '.');
      }
    }
    const num = parseFloat(cleaned.replace(/[^0-9.-]/g, ''));
    return isNaN(num) ? 0 : num;
  }

  /**
   * Helper: Parse transaction date string or Excel date to ISO string.
   */
  public static parseTransactionDate(val: any): string {
    if (val instanceof Date && !isNaN(val.getTime())) {
      return val.toISOString();
    }
    if (typeof val === 'number' && val > 0) {
      // Excel serial date number
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) return date.toISOString();
    }
    if (typeof val === 'string' && val.trim()) {
      const parsed = new Date(val.trim());
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return new Date().toISOString();
  }

  /**
   * Validates a batch of raw rows.
   */
  public static validateRows(rows: RawImportOrderRow[]): {
    valid: ValidatedImportOrder[];
    errors: RowValidationError[];
    totalRevenue: number;
  } {
    const valid: ValidatedImportOrder[] = [];
    const errors: RowValidationError[] = [];
    let totalRevenue = 0;

    rows.forEach((row, idx) => {
      const rowNum = idx + 2; // Row number in spreadsheet (accounting for 1-based index & header)

      // 1. Resolve Nama Pembeli
      const customerName = String(
        row.nama_pembeli ||
        row.nama ||
        row.customer_name ||
        row.nama_pelanggan ||
        row.pembeli ||
        row.name ||
        ''
      ).trim();

      if (!customerName) {
        errors.push({
          row: rowNum,
          reason: 'Nama pembeli wajib diisi.',
          data: row,
        });
        return;
      }

      // 2. Resolve Nomor Telepon & Normalisasi E.164
      const rawPhone = String(
        row.nomor_whatsapp ||
        row.no_hp ||
        row.telepon ||
        row.phone ||
        row.whatsapp ||
        row.no_wa ||
        row.customer_phone ||
        row.hp ||
        ''
      ).trim();

      const normalizedPhone = normalizePhone(rawPhone);
      if (!normalizedPhone) {
        errors.push({
          row: rowNum,
          reason: `Nomor telepon '${rawPhone || 'kosong'}' tidak valid. Gunakan format misal 0812xxx atau 628xxx.`,
          data: row,
        });
        return;
      }

      // 3. Resolve Nama Produk
      const productTitle = String(
        row.nama_produk ||
        row.produk ||
        row.product_name ||
        row.product_title ||
        row.item ||
        row.nama_barang ||
        ''
      ).trim();

      if (!productTitle) {
        errors.push({
          row: rowNum,
          reason: 'Nama produk wajib diisi.',
          data: row,
        });
        return;
      }

      // 4. Resolve Nominal Transaksi
      const rawNominal =
        row.nominal ??
        row.total_harga ??
        row.harga ??
        row.total ??
        row.gross_amount ??
        row.amount ??
        row.total_amount ??
        0;

      const grossAmount = this.parseNominal(rawNominal);
      if (grossAmount <= 0) {
        errors.push({
          row: rowNum,
          reason: `Nominal transaksi '${rawNominal}' tidak valid atau harus lebih dari 0.`,
          data: row,
        });
        return;
      }

      // 5. Resolve Quantity & Date & Invoice
      const rawQty = row.jumlah ?? row.qty ?? row.quantity ?? 1;
      const quantity = Math.max(1, parseInt(String(rawQty), 10) || 1);

      const rawDate = row.tanggal_transaksi || row.tanggal || row.date || row.created_at;
      const transactionDate = this.parseTransactionDate(rawDate);

      const rawInvoice = String(
        row.nomor_invoice ||
        row.invoice ||
        row.invoice_no ||
        row.no_invoice ||
        row.order_id ||
        ''
      ).trim();

      const uniqueSuffix = `${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${idx}`;
      const orderId = rawInvoice ? rawInvoice : `IMP-${uniqueSuffix}`;
      const orderNumber = rawInvoice ? rawInvoice : `IMP-${uniqueSuffix}`;

      const customerEmail = String(row.email || row.customer_email || row.mail || '').trim() || undefined;
      const paymentMethod = String(row.metode_pembayaran || row.metode || row.payment_method || 'Manual / Offline').trim();
      const notes = String(row.catatan || row.notes || row.alamat || row.keterangan || '').trim() || undefined;

      valid.push({
        rowIndex: rowNum,
        orderId,
        orderNumber,
        transactionDate,
        customerName,
        customerPhone: rawPhone,
        customerPhoneNormalized: normalizedPhone,
        customerEmail,
        productTitle,
        quantity,
        grossAmount,
        paymentMethod,
        notes,
      });

      totalRevenue += grossAmount;
    });

    return { valid, errors, totalRevenue };
  }

  /**
   * Main Execution: Process and store bulk orders, sync CRM, and trigger Meta CAPI.
   */
  public static async processBulkImport(
    rowsOrBuffer: RawImportOrderRow[] | Buffer,
    options: BulkImportOptions
  ): Promise<BulkImportResult> {
    const tenantSlug = (options.tenantSlug || '').trim().toLowerCase();
    if (!tenantSlug) {
      throw new Error('Tenant slug wajib disertakan.');
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      throw new Error('Database client tidak tersedia.');
    }

    // 1. Resolve Tenant from Supabase
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, slug, tier, metadata')
      .eq('slug', tenantSlug)
      .maybeSingle();

    if (tenantErr || !tenant) {
      throw new Error(`Tenant dengan slug '${tenantSlug}' tidak ditemukan.`);
    }

    // 2. Parse Rows if Buffer
    let rawRows: RawImportOrderRow[];
    if (Buffer.isBuffer(rowsOrBuffer)) {
      rawRows = this.parseBufferToRows(rowsOrBuffer);
    } else {
      rawRows = rowsOrBuffer;
    }

    const batchId = `BATCH-IMP-${Date.now()}`;
    const { valid, errors, totalRevenue } = this.validateRows(rawRows);

    if (valid.length === 0) {
      return {
        success: false,
        summary: {
          total_rows: rawRows.length,
          total_success: 0,
          total_failed: errors.length,
          total_revenue_idr: 0,
          formatted_revenue: 'Rp 0',
          meta_capi_synced: 0,
          meta_capi_status: 'FAILED',
          batch_id: batchId,
        },
        errors,
        imported_order_ids: [],
      };
    }

    // 3. Batch Insert into 'orders' and 'order_items'
    const ordersPayload = valid.map(o => {
      return sanitizeOrderPayload({
        id: o.orderId,
        order_number: o.orderNumber,
        tenant_slug: tenant.slug,
        tenant_id: tenant.id,
        product_id: 'prod_bulk_import',
        product_title: o.productTitle,
        customer_name: o.customerName,
        customer_phone: o.customerPhoneNormalized,
        customer_email: o.customerEmail || null,
        gross_amount: o.grossAmount,
        quantity: o.quantity,
        status: 'PAID',
        payment_status: 'PAID',
        order_status: 'COMPLETED',
        paid_at: o.transactionDate,
        created_at: o.transactionDate,
        updated_at: new Date().toISOString(),
        metadata: {
          source: 'bulk_import',
          batch_id: batchId,
          payment_method: o.paymentMethod,
          notes: o.notes,
          synced_meta_capi: Boolean(options.syncMetaCapi),
        },
      });
    });

    const { error: insertOrdersErr } = await supabase
      .from('orders')
      .insert(ordersPayload);

    if (insertOrdersErr) {
      console.error('[BulkImport] Orders insert error:', insertOrdersErr);
      throw new Error(`Gagal menyimpan data pesanan massal: ${insertOrdersErr.message}`);
    }

    // Insert order_items
    const orderItemsPayload = valid.map(o => ({
      order_id: o.orderId,
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      product_id: 'prod_bulk_import',
      product_title: o.productTitle,
      item_type: 'main',
      price: o.grossAmount,
      quantity: o.quantity,
      created_at: o.transactionDate,
      metadata: {
        batch_id: batchId,
        notes: o.notes,
      },
    }));

    try {
      await supabase.from('order_items').insert(orderItemsPayload);
    } catch (itemsErr) {
      console.warn('[BulkImport] Order items insert warning:', itemsErr);
    }

    // 4. Contact & CRM Sync (contacts / customers)
    for (const o of valid) {
      try {
        const contact = await ContactService.getOrCreateContactByPhone(
          tenant.id,
          o.customerPhoneNormalized,
          o.customerName
        );
        if (contact && contact.id) {
          await supabase
            .from('contacts')
            .update({
              lifecycle_stage: 'CUSTOMER',
              name: o.customerName,
              updated_at: new Date().toISOString(),
            })
            .eq('id', contact.id);
        }
      } catch (crmErr) {
        console.warn('[BulkImport] CRM contact sync warning for:', o.customerPhoneNormalized, crmErr);
      }

      try {
        await supabase
          .from('customers')
          .upsert({
            tenant_id: tenant.id,
            name: o.customerName,
            phone: o.customerPhoneNormalized,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tenant_id,phone' });
      } catch {}
    }

    // 5. Meta Conversions API (CAPI) Batch Dispatch
    let metaCapiSynced = 0;
    let metaCapiStatus: BulkImportResult['summary']['meta_capi_status'] = 'DISABLED';

    const shouldSyncCapi = options.syncMetaCapi !== false;
    if (shouldSyncCapi) {
      const meta = tenant.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
      const trackingMeta = meta.tracking || {};
      const pixelConfig = meta.pixel_config || {};

      const pixelId =
        trackingMeta.meta_pixel_id ||
        pixelConfig.meta_pixel_id ||
        meta.meta_pixel_id ||
        meta.pixel_id ||
        meta.facebook_pixel_id;

      const accessToken =
        trackingMeta.meta_access_token ||
        pixelConfig.meta_access_token ||
        meta.meta_access_token ||
        meta.facebook_access_token;

      const testEventCode =
        trackingMeta.test_event_code ||
        pixelConfig.test_event_code ||
        meta.test_event_code;

      if (!pixelId || !accessToken) {
        metaCapiStatus = 'SKIPPED_NO_PIXEL';
      } else {
        try {
          const capiEvents = valid.map(o => {
            const hashedPhone = hashPhone(o.customerPhoneNormalized);
            const parsedName = parseName(o.customerName);
            const hashedFn = parsedName.firstName
              ? (hashFirstName(parsedName.firstName) || hashSha256(parsedName.firstName.toLowerCase().trim()))
              : undefined;
            const hashedLn = parsedName.lastName
              ? (hashLastName(parsedName.lastName) || hashSha256(parsedName.lastName.toLowerCase().trim()))
              : undefined;
            const hashedEm = o.customerEmail ? hashEmail(o.customerEmail) : undefined;

            const userData: Record<string, any> = {
              ph: hashedPhone ? [hashedPhone] : undefined,
              fn: hashedFn ? [hashedFn] : undefined,
              ln: hashedLn ? [hashedLn] : undefined,
              em: hashedEm ? [hashedEm] : undefined,
              country: [hashSha256('id')],
            };

            return {
              event_name: 'Purchase',
              event_time: Math.floor(new Date(o.transactionDate).getTime() / 1000),
              event_id: `PURCHASE_${o.orderId}`,
              action_source: 'physical_store',
              user_data: userData,
              custom_data: {
                currency: 'IDR',
                value: o.grossAmount,
                content_name: o.productTitle,
              },
            };
          });

          // Meta Graph API Endpoint for Batch Events
          const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              data: capiEvents,
              ...(testEventCode ? { test_event_code: testEventCode } : {}),
            }),
          });

          const capiResult = await res.json().catch(() => ({}));
          if (res.ok) {
            metaCapiSynced = valid.length;
            metaCapiStatus = 'DISPATCHED';
          } else {
            console.warn('[BulkImport] Meta CAPI batch returned error:', capiResult);
            metaCapiStatus = 'PARTIAL_ERROR';
          }
        } catch (capiErr) {
          console.warn('[BulkImport] Meta CAPI dispatch exception:', capiErr);
          metaCapiStatus = 'FAILED';
        }
      }
    }

    return {
      success: true,
      summary: {
        total_rows: rawRows.length,
        total_success: valid.length,
        total_failed: errors.length,
        total_revenue_idr: totalRevenue,
        formatted_revenue: `Rp ${totalRevenue.toLocaleString('id-ID')}`,
        meta_capi_synced: metaCapiSynced,
        meta_capi_status: metaCapiStatus,
        batch_id: batchId,
      },
      errors,
      imported_order_ids: valid.map(v => v.orderId),
    };
  }
}
