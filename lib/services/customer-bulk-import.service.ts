/**
 * @file lib/services/customer-bulk-import.service.ts
 * @description Core service layer for customer list imports (CSV/XLSX),
 * phone auto-sanitization (E.164 Meta Custom Audience compliant),
 * city/kota resolution, and Supabase CRM contact synchronization.
 */

import * as XLSX from 'xlsx';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { ContactService } from '@/lib/crm/contact.service';

export interface RawCustomerRow {
  nama?: string;
  nomor_whatsapp?: string | number;
  email?: string;
  kota?: string;
  [key: string]: any;
}

export interface ValidatedCustomer {
  rowIndex: number;
  name: string;
  phoneRaw: string;
  phoneNormalized: string;
  email?: string;
  city?: string;
  notes?: string;
  tags: string[];
}

export interface CustomerRowValidationError {
  row: number;
  reason: string;
  data?: Record<string, any>;
}

export interface CustomerBulkImportOptions {
  tenantSlug: string;
  defaultLifecycleStage?: string;
  tags?: string[];
}

export interface CustomerBulkImportResult {
  success: boolean;
  summary: {
    total_rows: number;
    total_success: number;
    total_failed: number;
    batch_id: string;
  };
  errors: CustomerRowValidationError[];
  imported_contact_ids: string[];
}

export class CustomerBulkImportService {
  /**
   * Auto-sanitizes raw phone input to standard Indonesian E.164 (without plus, e.g. 628xxxxxxxxxx)
   * Handles:
   * - Stripping non-digit characters (+, -, spaces, parentheses, dots)
   * - Local prefix '08...' -> '628...'
   * - Local prefix '0...' -> '62...'
   * - Excel integer format where leading zero is stripped ('8xxxxxxxx...' -> '628xxxxxxxx...')
   * - International format with 00 ('0062...' -> '62...')
   */
  public static sanitizePhoneNumber(rawPhoneInput: any): {
    normalized: string | null;
    rawDigits: string;
    error?: string;
  } {
    if (rawPhoneInput === null || rawPhoneInput === undefined) {
      return { normalized: null, rawDigits: '', error: 'Nomor WhatsApp kosong' };
    }

    const str = String(rawPhoneInput).trim();
    if (!str) {
      return { normalized: null, rawDigits: '', error: 'Nomor WhatsApp kosong' };
    }

    // Hapus seluruh karakter non-digit (+, -, spasi, tanda kurung, dll.)
    let digits = str.replace(/\D/g, '');
    const rawDigits = digits;

    if (!digits) {
      return { normalized: null, rawDigits, error: `Nomor '${str}' tidak memuat digit angka` };
    }

    // Handle awalan 0062...
    if (digits.startsWith('0062')) {
      digits = digits.slice(2);
    }

    // Auto-sanitizer format Indonesia:
    // 1. Jika diawali '08', otomatis ubah menjadi '628'
    if (digits.startsWith('08')) {
      digits = '628' + digits.slice(2);
    }
    // 2. Jika diawali '0' selain 08 (misal 021, 022) -> '62' + sisa
    else if (digits.startsWith('0')) {
      digits = '62' + digits.slice(1);
    }
    // 3. Jika diawali '8' langsung (akibat format integer Excel menghilangkan angka 0) -> tambahkan prefix '62'
    else if (digits.startsWith('8')) {
      digits = '62' + digits;
    }
    // 4. Jika sudah berawalan 62 -> pertahankan

    // Validasi panjang nomor telepon internasional E.164
    // Nomor HP Indonesia normalnya 628 + 8 s/d 12 digit (total 10 - 15 digit)
    if (digits.length < 9) {
      return {
        normalized: null,
        rawDigits,
        error: `Nomor '${str}' terlalu pendek (minimal 9 digit)`,
      };
    }
    if (digits.length > 16) {
      return {
        normalized: null,
        rawDigits,
        error: `Nomor '${str}' terlalu panjang (maksimal 16 digit)`,
      };
    }

    return { normalized: digits, rawDigits };
  }

  /**
   * Generates a standard Meta Custom Audience compliant Excel template (.xlsx).
   */
  public static generateTemplateExcel(): Buffer {
    const headers = [
      'Nama',
      'Nomor WhatsApp',
      'Email',
      'Kota',
    ];

    const sampleRows = [
      ['Budi Santoso', '6281234567890', 'budi.santoso@gmail.com', 'Jakarta Selatan'],
      ['Siti Nurhaliza', '6285712345678', 'siti.nurhaliza@yahoo.com', 'Bandung'],
      ['Ahmad Fauzi', '6287890123456', 'ahmad.fauzi@outlook.com', 'Surabaya'],
      ['Dewi Lestari', '6282198765432', 'dewi.lestari@gmail.com', 'Medan'],
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    ws['!cols'] = [
      { wch: 25 }, // Nama
      { wch: 22 }, // Nomor WhatsApp
      { wch: 30 }, // Email
      { wch: 22 }, // Kota
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Custom Audience');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /**
   * Generates a standard Meta Custom Audience compliant CSV template.
   */
  public static generateTemplateCsv(): string {
    const headers = ['Nama', 'Nomor WhatsApp', 'Email', 'Kota'].join(',');
    const sampleRows = [
      'Budi Santoso,6281234567890,budi.santoso@gmail.com,Jakarta Selatan',
      'Siti Nurhaliza,6285712345678,siti.nurhaliza@yahoo.com,Bandung',
      'Ahmad Fauzi,6287890123456,ahmad.fauzi@outlook.com,Surabaya',
      'Dewi Lestari,6282198765432,dewi.lestari@gmail.com,Medan',
    ].join('\n');

    return `${headers}\n${sampleRows}\n`;
  }

  /**
   * Parses an Excel or CSV file buffer into raw JSON rows.
   */
  public static parseBufferToRows(buffer: Buffer): RawCustomerRow[] {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) return [];

    const sheet = wb.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

    // Normalize keys to lowercase & snake_case
    return rawRows.map(row => {
      const normalizedRow: RawCustomerRow = {};
      for (const [key, val] of Object.entries(row)) {
        const lower = key.trim().toLowerCase();
        normalizedRow[lower] = val;
        normalizedRow[lower.replace(/[^a-z0-9]/g, '_')] = val;
        normalizedRow[lower.replace(/\s+/g, '')] = val;
        normalizedRow[key] = val;
      }
      return normalizedRow;
    });
  }

  /**
   * Validates a batch of raw customer rows, skipping invalid rows gracefully with clear diagnostics.
   */
  public static validateCustomerRows(rows: RawCustomerRow[]): {
    valid: ValidatedCustomer[];
    errors: CustomerRowValidationError[];
  } {
    const valid: ValidatedCustomer[] = [];
    const errors: CustomerRowValidationError[] = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2; // Baris spreadsheet (header = row 1)

      // 1. Resolve Nama Customer
      const name = String(
        row['Nama'] ??
        row['nama'] ??
        row['Nama Lengkap'] ??
        row['nama_lengkap'] ??
        row['name'] ??
        row['customer_name'] ??
        row['nama_pelanggan'] ??
        row['pembeli'] ??
        row['full_name'] ??
        ''
      ).trim();

      if (!name) {
        errors.push({
          row: rowNum,
          reason: 'Nama pelanggan wajib diisi',
          data: row,
        });
        return;
      }

      // 2. Resolve Nomor WhatsApp & Auto-Sanitizer
      const rawPhoneVal =
        row['Nomor WhatsApp'] ??
        row['nomor_whatsapp'] ??
        row['whatsapp'] ??
        row['phone'] ??
        row['no_hp'] ??
        row['telepon'] ??
        row['no_wa'] ??
        row['customer_phone'] ??
        row['hp'] ??
        row['phone_number'] ??
        '';

      const phoneResult = this.sanitizePhoneNumber(rawPhoneVal);
      if (!phoneResult.normalized) {
        errors.push({
          row: rowNum,
          reason: phoneResult.error || `Nomor telepon '${rawPhoneVal}' tidak valid`,
          data: row,
        });
        return;
      }

      // 3. Resolve Kota / Kabupaten
      const city = String(
        row['Kota'] ??
        row['kota'] ??
        row['City'] ??
        row['city'] ??
        row['Kabupaten'] ??
        row['kabupaten'] ??
        row['kab_kota'] ??
        row['kab/kota'] ??
        row['kabkota'] ??
        row['kota_kabupaten'] ??
        row['city_name'] ??
        ''
      ).trim();

      // 4. Resolve Email (opsional, format-safe)
      let email = String(
        row['Email'] ??
        row['email'] ??
        row['customer_email'] ??
        row['mail'] ??
        row['surel'] ??
        ''
      ).trim().toLowerCase();

      if (email && (!email.includes('@') || !email.includes('.'))) {
        // Abaikan email tidak valid tanpa menggagalkan baris
        email = '';
      }

      // 5. Resolve Catatan / Notes
      const notes = String(
        row['Catatan'] ??
        row['catatan'] ??
        row['notes'] ??
        row['keterangan'] ??
        ''
      ).trim();

      valid.push({
        rowIndex: rowNum,
        name,
        phoneRaw: phoneResult.rawDigits,
        phoneNormalized: phoneResult.normalized,
        email: email || undefined,
        city: city || undefined,
        notes: notes || undefined,
        tags: ['Custom Audience', 'Import CSV'],
      });
    });

    return { valid, errors };
  }

  /**
   * Main Execution: Process and store bulk customer list into contacts CRM.
   */
  public static async processBulkImport(
    rowsOrBuffer: RawCustomerRow[] | Buffer,
    options: CustomerBulkImportOptions
  ): Promise<CustomerBulkImportResult> {
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
    let rawRows: RawCustomerRow[];
    if (Buffer.isBuffer(rowsOrBuffer)) {
      rawRows = this.parseBufferToRows(rowsOrBuffer);
    } else {
      rawRows = rowsOrBuffer;
    }

    const batchId = `BATCH-CA-${Date.now()}`;
    const { valid, errors } = this.validateCustomerRows(rawRows);

    if (valid.length === 0) {
      return {
        success: false,
        summary: {
          total_rows: rawRows.length,
          total_success: 0,
          total_failed: errors.length,
          batch_id: batchId,
        },
        errors,
        imported_contact_ids: [],
      };
    }

    const importedContactIds: string[] = [];
    const now = new Date().toISOString();
    const defaultStage = options.defaultLifecycleStage || 'LEAD';

    // 3. Upsert Contacts sequentially or in small batches
    for (const c of valid) {
      try {
        const canonicalPhone = `+${c.phoneNormalized}`;

        // Cari kontak berdasarkan phone_e164 & tenant_id
        const { data: existing } = await supabase
          .from('contacts')
          .select('id, metadata, name, email')
          .eq('tenant_id', tenant.id)
          .eq('phone_e164', canonicalPhone)
          .maybeSingle();

        const metadataPayload: Record<string, any> = {
          ...(existing?.metadata || {}),
          city: c.city || existing?.metadata?.city || null,
          source: 'CUSTOM_AUDIENCE_IMPORT',
          batch_id: batchId,
          last_imported_at: now,
        };

        if (c.notes) {
          metadataPayload.notes = c.notes;
        }

        if (existing) {
          // Update data kontak yang ada
          const updates: Record<string, any> = {
            metadata: metadataPayload,
            updated_at: now,
          };
          if (!existing.name || existing.name === 'Pelanggan Baru') {
            updates.name = c.name;
          }
          if (c.email && !existing.email) {
            updates.email = c.email;
          }

          const { data: updated } = await supabase
            .from('contacts')
            .update(updates)
            .eq('id', existing.id)
            .select('id')
            .single();

          if (updated?.id) importedContactIds.push(updated.id);
        } else {
          // Insert kontak baru
          const newContactPayload = {
            tenant_id: tenant.id,
            phone_e164: canonicalPhone,
            name: c.name,
            email: c.email || null,
            contact_status: 'ACTIVE',
            lifecycle_stage: defaultStage,
            metadata: metadataPayload,
            last_interaction_at: now,
            created_at: now,
            updated_at: now,
          };

          const { data: inserted, error: insertErr } = await supabase
            .from('contacts')
            .insert(newContactPayload)
            .select('id')
            .single();

          if (insertErr) {
            console.warn('[CustomerBulkImport] Insert error row', c.rowIndex, insertErr);
            errors.push({
              row: c.rowIndex,
              reason: `Gagal menyimpan ke database: ${insertErr.message}`,
            });
          } else if (inserted?.id) {
            importedContactIds.push(inserted.id);
          }
        }
      } catch (rowErr: any) {
        console.warn('[CustomerBulkImport] Exception on row', c.rowIndex, rowErr);
        errors.push({
          row: c.rowIndex,
          reason: rowErr?.message || 'Gagal memproses data baris',
        });
      }
    }

    return {
      success: importedContactIds.length > 0,
      summary: {
        total_rows: rawRows.length,
        total_success: importedContactIds.length,
        total_failed: errors.length,
        batch_id: batchId,
      },
      errors,
      imported_contact_ids: importedContactIds,
    };
  }
}
