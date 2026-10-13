#!/usr/bin/env node
/**
 * @file scripts/capi-purchase-runner.ts
 * @description Standalone Runner for Injecting Historical Order Data into Meta Conversions API (CAPI).
 *
 * Capabilities & Requirements:
 * 1. Dynamic Configuration:
 *    - CLI Arguments: --file (-f), --pixel-id (-p), --token (-t), --test-code, --batch-size, --default-value, --currency, --action-source, --dry-run
 *    - Fallbacks: .env.local / .env (META_PIXEL_ID, META_ACCESS_TOKEN, META_TEST_EVENT_CODE)
 * 2. Strict Normalization & SHA-256 Hashing:
 *    - Phone: E.164 normalized ('62' prefix, digits only) -> SHA-256 hex (ph)
 *    - First Name: Lowercase trimmed first word -> SHA-256 hex (fn)
 *    - Additional EMQ signals: Last Name (ln), Email (em), City (ct), Country ('id' -> SHA-256 hex)
 * 3. Rolling Timestamp Modulation:
 *    - Each row receives a distinct randomized event_time between 12 and 96 hours ago.
 * 4. Event Payload:
 *    - Event Name: 'Purchase'
 *    - Currency: 'IDR', Value default: 249000 (or parsed from CSV columns)
 *    - Deduplication Key: PURCHASE_{order_id} or PURCHASE_{timestamp}_{idx}_{random}
 * 5. Batching & Terminal Reporting:
 *    - Chunks of 50 events sent to https://graph.facebook.com/v19.0/{PIXEL_ID}/events
 *    - Formatted terminal logging: batch-by-batch status, fbtrace_id, events_received, failure diagnostics.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as XLSX from 'xlsx';

// ============================================================================
// ANSI COLOR CODES FOR FORMATTED TERMINAL OUTPUT
// ============================================================================
const COLOR = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
};

// ============================================================================
// ENVIRONMENT LOADER (.env.local, .env)
// ============================================================================
function loadLocalEnvFiles(): void {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    try {
      const fullPath = path.resolve(process.cwd(), file);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    } catch {
      // Ignore reading error silently
    }
  }
}

// ============================================================================
// CLI INTERFACE & CONFIGURATION PARSER
// ============================================================================
export interface CapiRunnerConfig {
  filePath: string;
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
  batchSize: number;
  defaultValue: number;
  currency: string;
  actionSource: 'website' | 'physical_store' | 'system_generated';
  dryRun: boolean;
  verbose: boolean;
}

function printUsage(): void {
  console.log(`
${COLOR.bold}${COLOR.cyan}Meta Conversions API (CAPI) Historical Purchase Runner${COLOR.reset}
${COLOR.dim}Injects historical CSV/Excel orders into Meta CAPI with rolling timestamps & SHA-256 identity hashing.${COLOR.reset}

${COLOR.bold}USAGE:${COLOR.reset}
  npx tsx scripts/capi-purchase-runner.ts [OPTIONS]

${COLOR.bold}OPTIONS:${COLOR.reset}
  ${COLOR.green}--file, -f <path>${COLOR.reset}         Path to CSV or Excel file containing order data (REQUIRED)
  ${COLOR.green}--pixel-id, -p <id>${COLOR.reset}      Meta Pixel ID (fallback: META_PIXEL_ID or NEXT_PUBLIC_META_PIXEL_ID)
  ${COLOR.green}--token, -t <token>${COLOR.reset}      Meta System User / CAPI Access Token (fallback: META_ACCESS_TOKEN)
  ${COLOR.green}--test-code <code>${COLOR.reset}       Meta Test Event Code (e.g. TEST12345, optional for Events Manager test)
  ${COLOR.green}--batch-size <n>${COLOR.reset}        Number of events per Meta API request (default: 50, max: 1000)
  ${COLOR.green}--default-value <n>${COLOR.reset}     Default purchase value if missing in CSV (default: 249000)
  ${COLOR.green}--currency <code>${COLOR.reset}        Currency code (default: IDR)
  ${COLOR.green}--action-source <s>${COLOR.reset}     Action source ('website' | 'physical_store', default: 'website')
  ${COLOR.green}--dry-run${COLOR.reset}               Parse, hash, and simulate batching without sending HTTP requests
  ${COLOR.green}--verbose, -v${COLOR.reset}           Print detailed payload info for each row
  ${COLOR.green}--help, -h${COLOR.reset}              Show this help message

${COLOR.bold}SUPPORTED CSV/EXCEL COLUMNS:${COLOR.reset}
  • Phone:    'Nomor WhatsApp', 'phone', 'telepon', 'no_hp', 'wa', 'customer_phone'
  • Name:     'Nama Pembeli', 'nama', 'customer_name', 'name', 'nama_pelanggan'
  • Nominal:  'Nominal (Rp)', 'nominal', 'amount', 'total', 'harga', 'price' (default: 249000)
  • Invoice:  'Nomor Invoice', 'order_id', 'invoice', 'id', 'no_invoice' (optional)
  • Email:    'Email', 'surel', 'customer_email' (optional)
  • City:     'Kota', 'city', 'kabupaten' (optional)
  • Product:  'Nama Produk', 'produk', 'product', 'item' (optional)

${COLOR.bold}EXAMPLE:${COLOR.reset}
  npx tsx scripts/capi-purchase-runner.ts \\
    --file ./data/historical_orders.csv \\
    --pixel-id 123456789012345 \\
    --token EAAB... \\
    --test-code TEST78901
`);
}

function parseCliArgs(): CapiRunnerConfig {
  loadLocalEnvFiles();

  const args = process.argv.slice(2);
  let filePath = '';
  let pixelId = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || '';
  let accessToken = process.env.META_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN || '';
  let testEventCode = process.env.META_TEST_EVENT_CODE || process.env.TEST_EVENT_CODE || undefined;
  let batchSize = 50;
  let defaultValue = 249000;
  let currency = 'IDR';
  let actionSource: 'website' | 'physical_store' | 'system_generated' = 'website';
  let dryRun = false;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--file' || arg === '-f') {
      filePath = args[++i] || '';
    } else if (arg.startsWith('--file=')) {
      filePath = arg.split('=')[1];
    } else if (arg === '--pixel-id' || arg === '-p') {
      pixelId = args[++i] || '';
    } else if (arg.startsWith('--pixel-id=')) {
      pixelId = arg.split('=')[1];
    } else if (arg === '--token' || arg === '-t') {
      accessToken = args[++i] || '';
    } else if (arg.startsWith('--token=')) {
      accessToken = arg.split('=')[1];
    } else if (arg === '--test-code') {
      testEventCode = args[++i] || '';
    } else if (arg.startsWith('--test-code=')) {
      testEventCode = arg.split('=')[1];
    } else if (arg === '--batch-size') {
      const parsed = parseInt(args[++i], 10);
      if (!isNaN(parsed) && parsed > 0) batchSize = Math.min(parsed, 1000);
    } else if (arg === '--default-value') {
      const parsed = parseFloat(args[++i]);
      if (!isNaN(parsed) && parsed >= 0) defaultValue = parsed;
    } else if (arg === '--currency') {
      currency = (args[++i] || 'IDR').toUpperCase();
    } else if (arg === '--action-source') {
      const source = (args[++i] || 'website').toLowerCase();
      if (source === 'physical_store' || source === 'website' || source === 'system_generated') {
        actionSource = source as any;
      }
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (!arg.startsWith('-') && !filePath) {
      // Positional argument for file path
      filePath = arg;
    }
  }

  // Validate required inputs
  const errors: string[] = [];
  if (!filePath) {
    errors.push("Missing required CSV/Excel file path. Specify via '--file <path>' or as first argument.");
  } else {
    const resolvedPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolvedPath)) {
      errors.push(`File not found at: '${resolvedPath}'`);
    } else {
      filePath = resolvedPath;
    }
  }

  if (!dryRun) {
    if (!pixelId) {
      errors.push("Missing Meta Pixel ID. Provide via '--pixel-id <id>' or set META_PIXEL_ID in .env.");
    }
    if (!accessToken) {
      errors.push("Missing Meta Access Token. Provide via '--token <token>' or set META_ACCESS_TOKEN in .env.");
    }
  }

  if (errors.length > 0) {
    console.error(`\n${COLOR.bold}${COLOR.red}[CONFIG ERROR]${COLOR.reset}`);
    for (const err of errors) {
      console.error(`  ${COLOR.red}✖${COLOR.reset} ${err}`);
    }
    console.error(`\nRun with ${COLOR.yellow}--help${COLOR.reset} for command-line syntax.\n`);
    process.exit(1);
  }

  return {
    filePath,
    pixelId: pixelId.trim(),
    accessToken: accessToken.trim(),
    testEventCode: testEventCode?.trim() || undefined,
    batchSize,
    defaultValue,
    currency,
    actionSource,
    dryRun,
    verbose,
  };
}

// ============================================================================
// NORMALIZATION & HASHING ENGINE (SHA-256)
// ============================================================================

/**
 * Pure SHA-256 Hasher (Outputs lowercase 64-char hex string)
 */
export function hashSha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Normalizes Indonesian/International Phone to E.164 (without '+' prefix, digits only, '62...' for ID)
 */
export function normalizePhone(rawPhone: unknown): string | null {
  if (rawPhone === undefined || rawPhone === null) return null;
  const str = String(rawPhone);
  let digits = str.replace(/\D/g, '');
  if (!digits) return null;

  // Handle leading 0062 -> 62
  if (digits.startsWith('0062')) {
    digits = digits.slice(2);
  }

  // Handle local Indonesian format (0812... or 812...)
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8')) {
    digits = '62' + digits;
  }

  // Validate E.164 length (min 8 digits, max 16 digits)
  if (digits.length < 8 || digits.length > 16) {
    return null;
  }

  return digits;
}

/**
 * Hashes normalized E.164 phone number
 */
export function hashPhone(phone: unknown): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return hashSha256(normalized);
}

/**
 * Splits full name into first and last name components
 */
export function extractFirstAndLastName(rawName: unknown): {
  firstName: string | null;
  lastName: string | null;
} {
  if (!rawName) return { firstName: null, lastName: null };
  const cleaned = String(rawName).trim();
  if (!cleaned) return { firstName: null, lastName: null };

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };

  // First name: lowercase, strip special characters
  const fn = parts[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  if (parts.length === 1) {
    return { firstName: fn || null, lastName: null };
  }

  const ln = parts.slice(1).join(' ').toLowerCase().replace(/[^a-z0-9]/g, '');
  return {
    firstName: fn || null,
    lastName: ln || null,
  };
}

/**
 * Normalizes and hashes email
 */
export function hashEmail(rawEmail: unknown): string | null {
  if (!rawEmail) return null;
  const str = String(rawEmail).trim().toLowerCase();
  if (!str || !str.includes('@')) return null;
  return hashSha256(str);
}

/**
 * Normalizes and hashes city
 */
export function hashCity(rawCity: unknown): string | null {
  if (!rawCity) return null;
  const str = String(rawCity).toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  if (!str) return null;
  return hashSha256(str);
}

// Pre-hashed country code 'id' (Indonesia)
export const HASHED_COUNTRY_ID = hashSha256('id');

// ============================================================================
// RANDOM ROLLING TIMESTAMP MODULATOR (12 to 96 hours ago)
// ============================================================================
/**
 * Modulates timestamp: returns a random Unix timestamp in seconds
 * between 12 hours ago and 96 hours ago from execution time.
 */
export function generateRollingTimestamp(nowSec: number = Math.floor(Date.now() / 1000)): {
  timestamp: number;
  hoursAgo: number;
} {
  const MIN_HOURS = 12;
  const MAX_HOURS = 96;
  const hoursAgo = MIN_HOURS + Math.random() * (MAX_HOURS - MIN_HOURS);
  const offsetSeconds = Math.floor(hoursAgo * 3600);
  const timestamp = nowSec - offsetSeconds;
  return {
    timestamp,
    hoursAgo: parseFloat(hoursAgo.toFixed(2)),
  };
}

// ============================================================================
// CSV / EXCEL PARSER & ROW EXTRACTOR
// ============================================================================
export interface ParsedOrderRow {
  rawIndex: number;
  customerName: string;
  phone: string;
  email?: string;
  city?: string;
  nominal: number;
  invoiceNumber?: string;
  productName?: string;
}

/**
 * Parses numeric nominal from raw string or number (e.g. "Rp 249.000", "249,000.00", 249000)
 */
export function parseNominal(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && !isNaN(raw) && raw > 0) {
    return raw;
  }
  if (!raw) return fallback;

  const str = String(raw).trim();
  // Strip currency symbols and letters
  let cleaned = str.replace(/[^\d.,]/g, '');
  if (!cleaned) return fallback;

  // Check for Indonesian currency format with dot thousands: e.g. "249.000" or "249.000,00"
  if (cleaned.includes('.') && !cleaned.includes(',')) {
    // If multiple dots (e.g. 1.250.000), or 3 digits after single dot (e.g. 249.000)
    const dotParts = cleaned.split('.');
    if (dotParts.length > 2 || (dotParts.length === 2 && dotParts[1].length === 3)) {
      cleaned = cleaned.replace(/\./g, '');
    }
  } else if (cleaned.includes(',') && !cleaned.includes('.')) {
    // e.g. 249,000 or 249,00 (cents)
    const commaParts = cleaned.split(',');
    if (commaParts.length > 2 || (commaParts.length === 2 && commaParts[1].length === 3)) {
      cleaned = cleaned.replace(/,/g, '');
    } else {
      // standard decimal comma
      cleaned = cleaned.replace(',', '.');
    }
  } else if (cleaned.includes('.') && cleaned.includes(',')) {
    // mixed: e.g. "1.250.000,00" (ID format) or "1,250,000.00" (US format)
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }

  const parsed = parseFloat(cleaned);
  return !isNaN(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Loads CSV or XLSX file and extracts normalized order rows
 */
export function loadAndExtractRows(filePath: string, defaultValue: number): {
  validRows: ParsedOrderRow[];
  skippedRows: { index: number; reason: string; raw: any }[];
} {
  const workbook = XLSX.readFile(filePath, { raw: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Workbook contains no sheets.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawData: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const validRows: ParsedOrderRow[] = [];
  const skippedRows: { index: number; reason: string; raw: any }[] = [];

  rawData.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-based, accounting for header row

    // Build case-insensitive lookup
    const lookup: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      lookup[k.toLowerCase().trim().replace(/[\s_-]+/g, '')] = v;
      lookup[k.toLowerCase().trim()] = v;
    }

    // 1. Phone extraction
    const rawPhone =
      lookup['nomorwhatsapp'] ??
      lookup['whatsapp'] ??
      lookup['phone'] ??
      lookup['telepon'] ??
      lookup['nohp'] ??
      lookup['customerphone'] ??
      lookup['nowa'] ??
      lookup['hp'] ??
      lookup['nomortelepon'] ??
      lookup['kontak'] ??
      lookup['mobile'] ??
      '';

    const normalizedPhone = normalizePhone(rawPhone);
    if (!normalizedPhone) {
      skippedRows.push({
        index: rowNum,
        reason: `Nomor telepon tidak valid atau kosong ('${rawPhone || ''}')`,
        raw: row,
      });
      return;
    }

    // 2. Customer Name extraction
    const rawName =
      lookup['namapembeli'] ??
      lookup['nama'] ??
      lookup['customername'] ??
      lookup['namapelanggan'] ??
      lookup['pembeli'] ??
      lookup['name'] ??
      lookup['fullname'] ??
      lookup['customer'] ??
      lookup['firstname'] ??
      '';

    const cleanedName = String(rawName).trim();
    if (!cleanedName) {
      skippedRows.push({
        index: rowNum,
        reason: "Nama pembeli kosong / missing",
        raw: row,
      });
      return;
    }

    // 3. Nominal extraction
    const rawNominal =
      lookup['nominalrp'] ??
      lookup['nominal(rp)'] ??
      lookup['nominal'] ??
      lookup['amount'] ??
      lookup['total'] ??
      lookup['harga'] ??
      lookup['price'] ??
      lookup['grossamount'] ??
      lookup['totalharga'] ??
      lookup['totalamount'] ??
      lookup['value'] ??
      '';

    const nominal = parseNominal(rawNominal, defaultValue);

    // 4. Invoice / Order ID
    const rawInvoice =
      lookup['nomorinvoice'] ??
      lookup['invoice'] ??
      lookup['orderid'] ??
      lookup['id'] ??
      lookup['noinvoice'] ??
      lookup['inv'] ??
      lookup['ordernumber'] ??
      '';

    // 5. Optional Email
    const rawEmail =
      lookup['email'] ??
      lookup['surel'] ??
      lookup['customeremail'] ??
      lookup['mail'] ??
      '';

    // 6. Optional City
    const rawCity =
      lookup['kota'] ??
      lookup['city'] ??
      lookup['kabupaten'] ??
      lookup['kabkota'] ??
      lookup['kotakabupaten'] ??
      '';

    // 7. Optional Product Title
    const rawProduct =
      lookup['namaproduk'] ??
      lookup['produk'] ??
      lookup['product'] ??
      lookup['item'] ??
      lookup['namabarang'] ??
      lookup['productname'] ??
      '';

    validRows.push({
      rawIndex: rowNum,
      customerName: cleanedName,
      phone: normalizedPhone,
      email: String(rawEmail).trim() || undefined,
      city: String(rawCity).trim() || undefined,
      nominal,
      invoiceNumber: String(rawInvoice).trim() || undefined,
      productName: String(rawProduct).trim() || undefined,
    });
  });

  return { validRows, skippedRows };
}

// ============================================================================
// META CAPI EVENT PAYLOAD BUILDER
// ============================================================================
export interface MetaCapiEventPayload {
  event_name: 'Purchase';
  event_time: number;
  event_id: string;
  action_source: string;
  user_data: {
    ph: string[];
    fn: string[];
    ln?: string[];
    em?: string[];
    ct?: string[];
    country: string[];
  };
  custom_data: {
    currency: string;
    value: number;
    content_name?: string;
    content_type?: string;
  };
}

export function buildCapiPurchaseEvent(
  order: ParsedOrderRow,
  config: CapiRunnerConfig,
  nowSec: number
): { event: MetaCapiEventPayload; hoursAgo: number } {
  // 1. Modulate timestamp between 12 and 96 hours ago
  const { timestamp, hoursAgo } = generateRollingTimestamp(nowSec);

  // 2. Hashing phone (E.164 already guaranteed)
  const phoneHash = hashSha256(order.phone);

  // 3. Name hashing
  const { firstName, lastName } = extractFirstAndLastName(order.customerName);
  const fnHash = firstName ? hashSha256(firstName) : hashSha256('customer');
  const lnHash = lastName ? hashSha256(lastName) : undefined;

  // 4. Optional email & city hashing
  const emailHash = order.email ? hashEmail(order.email) : undefined;
  const cityHash = order.city ? hashCity(order.city) : undefined;

  // 5. Unique deduplication key: PURCHASE_{order_id} or random
  let eventId: string;
  if (order.invoiceNumber) {
    const cleanInv = order.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '');
    eventId = `PURCHASE_${cleanInv}`;
  } else {
    const randSuffix = crypto.randomBytes(4).toString('hex');
    eventId = `PURCHASE_${timestamp}_${order.rawIndex}_${randSuffix}`;
  }

  // 6. User Data Object (Zero null keys)
  const userData: MetaCapiEventPayload['user_data'] = {
    ph: [phoneHash],
    fn: [fnHash],
    country: [HASHED_COUNTRY_ID],
  };

  if (lnHash) userData.ln = [lnHash];
  if (emailHash) userData.em = [emailHash];
  if (cityHash) userData.ct = [cityHash];

  // 7. Custom Data Object
  const customData: MetaCapiEventPayload['custom_data'] = {
    currency: config.currency,
    value: order.nominal,
    content_type: 'product',
  };
  if (order.productName) {
    customData.content_name = order.productName;
  }

  return {
    event: {
      event_name: 'Purchase',
      event_time: timestamp,
      event_id: eventId,
      action_source: config.actionSource,
      user_data: userData,
      custom_data: customData,
    },
    hoursAgo,
  };
}

// ============================================================================
// META GRAPH API BATCH DISPATCHER
// ============================================================================
export interface MetaApiResponse {
  events_received?: number;
  messages?: string[];
  fbtrace_id?: string;
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export async function sendMetaCapiBatch(
  pixelId: string,
  accessToken: string,
  events: MetaCapiEventPayload[],
  testEventCode?: string
): Promise<{ success: boolean; status: number; data: MetaApiResponse; error?: string }> {
  const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`;

  const payload: Record<string, any> = {
    data: events,
  };
  if (testEventCode) {
    payload.test_event_code = testEventCode;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const status = response.status;
    let data: MetaApiResponse = {};
    try {
      data = (await response.json()) as MetaApiResponse;
    } catch {
      data = {};
    }

    if (response.ok) {
      return { success: true, status, data };
    } else {
      const errMsg = data?.error?.message || `HTTP ${status}: Failed to dispatch batch`;
      return { success: false, status, data, error: errMsg };
    }
  } catch (err: any) {
    return {
      success: false,
      status: 0,
      data: {},
      error: err?.message || 'Network exception connecting to Meta Graph API',
    };
  }
}

// ============================================================================
// SLEEP UTILITY FOR RATE LIMITING
// ============================================================================
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper to mask sensitive token
function maskToken(token: string): string {
  if (token.length <= 10) return '***';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

// ============================================================================
// MAIN EXECUTION RUNNER
// ============================================================================
async function run(): Promise<void> {
  console.log(`
${COLOR.bold}${COLOR.cyan}======================================================================${COLOR.reset}
${COLOR.bold}${COLOR.cyan}         BOONTRACK META CAPI HISTORICAL PURCHASE INJECTOR             ${COLOR.reset}
${COLOR.bold}${COLOR.cyan}======================================================================${COLOR.reset}`);

  const config = parseCliArgs();

  // Print Configuration Summary
  console.log(`\n${COLOR.bold}📋 Execution Configuration:${COLOR.reset}`);
  console.log(`  • CSV File Path:       ${COLOR.white}${config.filePath}${COLOR.reset}`);
  console.log(`  • Meta Pixel ID:       ${COLOR.green}${config.pixelId || '(Dry-Run Mode)'}${COLOR.reset}`);
  console.log(`  • Access Token:        ${COLOR.yellow}${config.accessToken ? maskToken(config.accessToken) : '(None)'}${COLOR.reset}`);
  console.log(`  • Test Event Code:     ${config.testEventCode ? `${COLOR.magenta}${config.testEventCode}${COLOR.reset}` : `${COLOR.dim}None (Production Events)${COLOR.reset}`}`);
  console.log(`  • Batch Size:          ${COLOR.white}${config.batchSize}${COLOR.reset} events per request`);
  console.log(`  • Default Value:       ${COLOR.green}Rp ${config.defaultValue.toLocaleString('id-ID')}${COLOR.reset}`);
  console.log(`  • Timestamp Window:    ${COLOR.cyan}12 to 96 hours ago (Rolling Random)${COLOR.reset}`);
  console.log(`  • Action Source:       ${COLOR.white}${config.actionSource}${COLOR.reset}`);
  console.log(`  • Mode:                ${config.dryRun ? `${COLOR.bgBlue}${COLOR.bold} DRY-RUN (SIMULATION ONLY) ${COLOR.reset}` : `${COLOR.bgGreen}${COLOR.bold} LIVE META INJECTION ${COLOR.reset}`}`);

  // 1. Read & Parse File
  console.log(`\n${COLOR.bold}📂 Reading & Validating File...${COLOR.reset}`);
  const { validRows, skippedRows } = loadAndExtractRows(config.filePath, config.defaultValue);

  console.log(`  • Total Valid Rows:    ${COLOR.bold}${COLOR.green}${validRows.length}${COLOR.reset}`);
  console.log(`  • Skipped / Invalid:   ${skippedRows.length > 0 ? `${COLOR.yellow}${skippedRows.length}${COLOR.reset}` : `${COLOR.dim}0${COLOR.reset}`}`);

  if (skippedRows.length > 0 && config.verbose) {
    console.log(`\n${COLOR.dim}Skipped Rows Breakdown:${COLOR.reset}`);
    skippedRows.slice(0, 10).forEach((s) => {
      console.log(`  ${COLOR.yellow}⚠ Row ${s.index}:${COLOR.reset} ${s.reason}`);
    });
    if (skippedRows.length > 10) {
      console.log(`  ${COLOR.dim}... and ${skippedRows.length - 10} more skipped rows.${COLOR.reset}`);
    }
  }

  if (validRows.length === 0) {
    console.error(`\n${COLOR.bold}${COLOR.red}✖ No valid rows to process. Check phone number and name columns in the CSV.${COLOR.reset}\n`);
    process.exit(1);
  }

  // 2. Build Events & Modulate Timestamps
  console.log(`\n${COLOR.bold}⚙ Normalizing, Hashing (SHA-256) & Modulating Timestamps...${COLOR.reset}`);
  const nowSec = Math.floor(Date.now() / 1000);
  const preparedEvents: MetaCapiEventPayload[] = [];
  const hoursAgoDist: number[] = [];
  let totalRevenue = 0;

  for (const row of validRows) {
    const { event, hoursAgo } = buildCapiPurchaseEvent(row, config, nowSec);
    preparedEvents.push(event);
    hoursAgoDist.push(hoursAgo);
    totalRevenue += event.custom_data.value;
  }

  const minHours = Math.min(...hoursAgoDist);
  const maxHours = Math.max(...hoursAgoDist);
  const avgHours = (hoursAgoDist.reduce((a, b) => a + b, 0) / hoursAgoDist.length).toFixed(1);

  console.log(`  • Normalized Events:   ${COLOR.green}${preparedEvents.length}${COLOR.reset}`);
  console.log(`  • Timestamp Spread:    ${COLOR.cyan}${minHours.toFixed(1)}h${COLOR.reset} to ${COLOR.cyan}${maxHours.toFixed(1)}h${COLOR.reset} ago (Avg: ${avgHours}h)`);
  console.log(`  • Total Injected GMV:  ${COLOR.green}Rp ${totalRevenue.toLocaleString('id-ID')}${COLOR.reset}`);

  // Sample event preview
  if (config.verbose || config.dryRun) {
    console.log(`\n${COLOR.bold}🔍 Sample CAPI Event Payload (Row 1):${COLOR.reset}`);
    console.log(JSON.stringify(preparedEvents[0], null, 2));
  }

  // 3. Batching & Queue Execution
  const totalBatches = Math.ceil(preparedEvents.length / config.batchSize);
  console.log(`\n${COLOR.bold}🚀 Dispatching Events (${totalBatches} Batches of up to ${config.batchSize}):${COLOR.reset}`);

  let successfulBatches = 0;
  let failedBatches = 0;
  let totalEventsReceived = 0;
  let totalEventsFailed = 0;

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const startIdx = batchIdx * config.batchSize;
    const endIdx = Math.min(startIdx + config.batchSize, preparedEvents.length);
    const chunk = preparedEvents.slice(startIdx, endIdx);
    const batchNum = batchIdx + 1;

    process.stdout.write(
      `  [Batch ${batchNum}/${totalBatches}] Rows ${startIdx + 1}-${endIdx} (${chunk.length} events)... `
    );

    if (config.dryRun) {
      // Simulate success
      successfulBatches++;
      totalEventsReceived += chunk.length;
      console.log(`${COLOR.cyan}[SIMULATED OK]${COLOR.reset} (Dry-Run: No network call)`);
      continue;
    }

    // Live dispatch
    const startTime = Date.now();
    const result = await sendMetaCapiBatch(
      config.pixelId,
      config.accessToken,
      chunk,
      config.testEventCode
    );
    const elapsedMs = Date.now() - startTime;

    if (result.success) {
      successfulBatches++;
      const received = result.data.events_received ?? chunk.length;
      totalEventsReceived += received;
      const trace = result.data.fbtrace_id ? ` (trace: ${result.data.fbtrace_id})` : '';
      const warnings = result.data.messages?.length ? ` [${result.data.messages.join('; ')}]` : '';

      console.log(
        `${COLOR.green}[${result.status} OK]${COLOR.reset} in ${elapsedMs}ms - ` +
        `${COLOR.bold}${COLOR.green}${received} events accepted${COLOR.reset}${COLOR.dim}${trace}${COLOR.reset}${COLOR.yellow}${warnings}${COLOR.reset}`
      );
    } else {
      failedBatches++;
      totalEventsFailed += chunk.length;
      const trace = result.data.error?.fbtrace_id ? ` [trace: ${result.data.error.fbtrace_id}]` : '';
      console.log(
        `${COLOR.red}[FAILED ${result.status}]${COLOR.reset} in ${elapsedMs}ms - ` +
        `${COLOR.bold}${COLOR.red}${result.error}${COLOR.reset}${COLOR.dim}${trace}${COLOR.reset}`
      );
    }

    // Rate-limiting throttle: 250ms delay between live batches
    if (batchIdx < totalBatches - 1) {
      await sleep(250);
    }
  }

  // 4. Final Executive Summary
  console.log(`
${COLOR.bold}${COLOR.cyan}======================================================================${COLOR.reset}
${COLOR.bold}${COLOR.cyan}                          EXECUTION SUMMARY                           ${COLOR.reset}
${COLOR.bold}${COLOR.cyan}======================================================================${COLOR.reset}
  • File Processed:            ${COLOR.white}${path.basename(config.filePath)}${COLOR.reset}
  • Valid Orders Parsed:       ${COLOR.white}${validRows.length}${COLOR.reset}
  • Skipped / Invalid Rows:    ${skippedRows.length > 0 ? `${COLOR.yellow}${skippedRows.length}${COLOR.reset}` : '0'}
  • Total Batches Dispatched:  ${COLOR.white}${totalBatches}${COLOR.reset}
  • Batches Succeeded:         ${COLOR.green}${successfulBatches}${COLOR.reset}
  • Batches Failed:            ${failedBatches > 0 ? `${COLOR.red}${failedBatches}${COLOR.reset}` : `${COLOR.dim}0${COLOR.reset}`}
  • Meta Accepted Events:      ${COLOR.bold}${COLOR.green}${totalEventsReceived}${COLOR.reset}
  • Events Rejected / Failed:  ${totalEventsFailed > 0 ? `${COLOR.bold}${COLOR.red}${totalEventsFailed}${COLOR.reset}` : '0'}
  • Total Injected Value:      ${COLOR.bold}${COLOR.green}Rp ${totalRevenue.toLocaleString('id-ID')}${COLOR.reset}
  • Mode:                      ${config.dryRun ? `${COLOR.cyan}DRY-RUN (Simulated)${COLOR.reset}` : `${COLOR.green}LIVE DISPATCH${COLOR.reset}`}
${COLOR.bold}${COLOR.cyan}======================================================================${COLOR.reset}
`);

  if (failedBatches > 0) {
    console.warn(`${COLOR.yellow}⚠️  Some batches encountered errors. Review terminal log and verify your Meta Access Token / Pixel ID.${COLOR.reset}\n`);
    process.exit(1);
  } else {
    console.log(`${COLOR.green}✨ Meta CAPI historical injection completed successfully!${COLOR.reset}\n`);
    process.exit(0);
  }
}

// Run immediately if executed directly via CLI
if (require.main === module || process.argv[1]?.includes('capi-purchase-runner')) {
  run().catch((err) => {
    console.error(`\n${COLOR.bold}${COLOR.red}[FATAL RUNNER ERROR]:${COLOR.reset}`, err);
    process.exit(1);
  });
}
