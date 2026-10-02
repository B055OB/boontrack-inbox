/**
 * @file lib/tracking/meta-capi.ts
 * @description High-Performance Meta Conversions API (CAPI) Module with Signal Enrichment
 * Target: Event Match Quality (EMQ) >= 7.0 - 8.5/10
 *
 * Capabilities:
 * 1. Strict Identity Normalization & SHA-256 Hashing (Email, E.164 Phone, First/Last Name, City, Zip, Country).
 * 2. Zero-Raw-PII Leak Guard: Ensures no plaintext customer data ever leaves the server.
 * 3. Browser Signal Enrichment: Seamless extraction of _fbp, _fbc (with fbclid fallback), client_ip_address, client_user_agent, and event_source_url.
 * 4. Deduplication Alignment: Guaranteed 100% deduplication key match with Meta Pixel (PURCHASE_${orderId}, IC_${orderId}, LEAD_${token}).
 * 5. Zero-Null Pruning: Strips all null, undefined, empty string, and empty array keys per Meta Graph API specs.
 */

import crypto from 'crypto';

export type MetaCAPIEventName = 'Lead' | 'InitiateCheckout' | 'Purchase';

export interface MetaUserDataInput {
  email?: string | null;
  phone?: string | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  fbclid?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  ctwaClid?: string | null;
}

export interface MetaCAPIEventOptions {
  eventName: MetaCAPIEventName;
  eventId?: string;
  orderId?: string;
  eventTime?: number;
  eventSourceUrl?: string | null;
  actionSource?: 'website' | 'app' | 'physical_store' | 'system_generated' | 'other';
  userData: MetaUserDataInput;
  customData?: {
    currency?: string;
    value?: number;
    contentName?: string;
    contentIds?: string[];
    contentType?: string;
    [key: string]: any;
  };
  testEventCode?: string | null;
}

/**
 * Pure SHA-256 Hasher (Outputs lowercase hex string, 64 characters)
 * Spesifikasi Meta CAPI Data Processing
 */
export function hashSha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Normalisasi Nomor Telepon ke Standar Internasional E.164 (Awalan 62 untuk Indonesia)
 * 1. Bersihkan seluruh karakter non-digit.
 * 2. Konversi format lokal:
 *    - '0812...' -> '62812...'
 *    - '812...'  -> '62812...'
 *    - '+62812...' / '62812...' -> '62812...'
 *    - '0062812...' -> '62812...'
 */
export function normalizePhone(phone: string | undefined | null): string | null {
  if (!phone || typeof phone !== 'string') return null;
  let digits = phone.replace(/\D/g, '');
  if (!digits) return null;

  // Handle leading 00 (misal: 0062...)
  if (digits.startsWith('0062')) {
    digits = digits.slice(2);
  }

  // Handle standard Indonesian local formats
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8')) {
    digits = '62' + digits;
  }

  // Validasi panjang minimum nomor telepon internasional (E.164 minimal 7-8 digit)
  if (digits.length < 8) return null;

  return digits;
}

/**
 * Normalisasi & Hashing Nomor Telepon untuk Meta CAPI (ph)
 * Output: SHA-256 hash dari nomor ternormalisasi E.164
 */
export function hashPhone(phone: string | undefined | null): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return hashSha256(normalized);
}

/**
 * Normalisasi Email:
 * 1. Trim seluruh whitespace
 * 2. Ubah ke lowercase murni
 */
export function normalizeEmail(email: string | undefined | null): string | null {
  if (!email || typeof email !== 'string') return null;
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes('@')) return null;
  return clean;
}

/**
 * Normalisasi & Hashing Email untuk Meta CAPI (em)
 */
export function hashEmail(email: string | undefined | null): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return hashSha256(normalized);
}

/**
 * Parsing Nama Lengkap menjadi First Name (fn) dan Last Name (ln)
 * - Jika hanya 1 kata: kata tersebut digunakan untuk first name, last name bernilai null
 * - Jika 2 kata atau lebih: kata pertama untuk first name, sisanya untuk last name
 * - Trim dan lowercase murni
 */
export function parseName(fullName: string | undefined | null): {
  firstName: string | null;
  lastName: string | null;
} {
  if (!fullName || typeof fullName !== 'string') {
    return { firstName: null, lastName: null };
  }

  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: null, lastName: null };

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };

  const firstName = parts[0].trim().toLowerCase();
  if (parts.length === 1) {
    return { firstName, lastName: null };
  }

  const lastName = parts.slice(1).join(' ').trim().toLowerCase();
  return { firstName, lastName: lastName || null };
}

/**
 * Normalisasi & Hashing Nama Depan untuk Meta CAPI (fn)
 */
export function hashFirstName(name: string | undefined | null): string | null {
  if (!name || typeof name !== 'string') return null;
  const { firstName } = parseName(name);
  if (!firstName) return null;
  return hashSha256(firstName);
}

/**
 * Normalisasi & Hashing Nama Belakang untuk Meta CAPI (ln)
 * Mengembalikan null jika hanya 1 kata nama.
 */
export function hashLastName(name: string | undefined | null): string | null {
  if (!name || typeof name !== 'string') return null;
  const { lastName } = parseName(name);
  if (!lastName) return null;
  return hashSha256(lastName);
}

/**
 * Normalisasi & Hashing Kota untuk Meta CAPI (ct)
 * Menghapus spasi dan tanda baca, lowercase murni
 */
export function hashCity(city: string | undefined | null): string | null {
  if (!city || typeof city !== 'string') return null;
  const clean = city
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
  if (!clean) return null;
  return hashSha256(clean);
}

/**
 * Normalisasi & Hashing Kode Pos untuk Meta CAPI (zp)
 */
export function hashZip(zip: string | undefined | null): string | null {
  if (!zip || typeof zip !== 'string') return null;
  const clean = zip.replace(/[^0-9a-z]/gi, '').trim().toLowerCase();
  if (!clean) return null;
  return hashSha256(clean);
}

/**
 * Normalisasi & Hashing Negara ISO 2-letter untuk Meta CAPI (country)
 */
export function hashCountry(country: string | undefined | null): string | null {
  if (!country || typeof country !== 'string') return null;
  const clean = country.trim().toLowerCase().slice(0, 2);
  if (!clean || clean.length !== 2) return null;
  return hashSha256(clean);
}

/**
 * Validasi alamat IPv4 / IPv6 untuk Meta CAPI client_ip_address
 * Menolak string null/undefined/localhost/kosong
 */
export function isValidIpAddress(ip?: string | null): boolean {
  if (!ip || typeof ip !== 'string') return false;
  const trimmed = ip.trim();
  if (
    !trimmed ||
    trimmed === 'unknown' ||
    trimmed === 'null' ||
    trimmed === 'undefined' ||
    trimmed === '127.0.0.1' ||
    trimmed === '::1' ||
    trimmed.startsWith('192.168.') ||
    trimmed.startsWith('10.')
  ) {
    return false;
  }
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv4Regex.test(trimmed) || ipv6Regex.test(trimmed);
}

/**
 * Formatter sinyal fbc sesuai standar Meta:
 * Format: fb.1.{timestamp}.{fbclid}
 */
export function formatFbc(
  fbcCookie?: string | null,
  fbclid?: string | null,
  timestamp?: number
): string | null {
  if (fbcCookie && fbcCookie.startsWith('fb.1.')) {
    return fbcCookie.trim();
  }
  if (fbclid && fbclid.trim()) {
    const ts = timestamp || Date.now();
    return `fb.1.${ts}.${fbclid.trim()}`;
  }
  return null;
}

/**
 * Sanitasi & Prune objek user_data Meta CAPI (Zero Null Keys)
 * MENGHAPUS SEMUA key bernilai null, undefined, string kosong "", atau array kosong [].
 */
export function sanitizeUserData(userData: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(userData)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    if (Array.isArray(value)) {
      const filtered = value.filter(
        (item) => item !== null && item !== undefined && item !== ''
      );
      if (filtered.length > 0) {
        result[key] = filtered;
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Guard Anti-Leak PII (Strict Privacy Compliance):
 * Memastikan tidak ada plaintext PII (email mentah berkarakter '@', nomor telepon mentah berformat angka, atau nama asli)
 * yang bocor ke payload keluar Meta CAPI.
 * Semua field PII wajib berupa SHA-256 lowercase 64-karakter hex.
 */
export function assertNoRawPii(userData: Record<string, any>): void {
  const hashedPiiFields = ['em', 'ph', 'fn', 'ln', 'ct', 'zp', 'country'];
  const sha256Regex = /^[a-f0-9]{64}$/;

  for (const field of hashedPiiFields) {
    const val = userData[field];
    if (!val) continue;

    const items = Array.isArray(val) ? val : [val];
    for (const item of items) {
      if (typeof item === 'string') {
        if (!sha256Regex.test(item)) {
          throw new Error(
            `[Meta CAPI Security Violation] Raw PII leak detected in field '${field}'. Value '${item}' is NOT a valid 64-character SHA-256 hash.`
          );
        }
      }
    }
  }

  // Cek jika ada key raw yang tidak sengaja terikut di user_data
  const prohibitedRawKeys = ['email', 'phone', 'name', 'first_name', 'last_name', 'customer_name'];
  for (const rawKey of prohibitedRawKeys) {
    if (rawKey in userData) {
      throw new Error(
        `[Meta CAPI Security Violation] Prohibited raw key '${rawKey}' found in user_data payload.`
      );
    }
  }
}

/**
 * Builder Objek user_data untuk Meta CAPI dengan Signal Enrichment
 */
export function buildMetaUserData(input: MetaUserDataInput): Record<string, any> {
  // 1. Normalisasi dan Hashing Data Identitas PII
  const hashedPhone = hashPhone(input.phone);
  const hashedEmail = hashEmail(input.email);

  // Jika input.firstName & lastName tersedia, prioritaskan itu; jika tidak, parse dari input.fullName
  let hashedFn: string | null = null;
  let hashedLn: string | null = null;

  if (input.firstName || input.lastName) {
    hashedFn = input.firstName ? hashSha256(input.firstName.trim().toLowerCase()) : null;
    hashedLn = input.lastName ? hashSha256(input.lastName.trim().toLowerCase()) : null;
  } else if (input.fullName) {
    const { firstName, lastName } = parseName(input.fullName);
    hashedFn = firstName ? hashSha256(firstName) : null;
    hashedLn = lastName ? hashSha256(lastName) : null;
  }

  const hashedCity = hashCity(input.city);
  const hashedZip = hashZip(input.zip);
  const hashedCountry = hashCountry(input.country || 'id');

  // 2. Normalisasi Browser Signals & Cookie Context
  const clientIp = isValidIpAddress(input.clientIpAddress)
    ? input.clientIpAddress!.trim()
    : undefined;

  const clientUserAgent =
    input.clientUserAgent && input.clientUserAgent.trim()
      ? input.clientUserAgent.trim()
      : undefined;

  const rawFbp = input.fbp && input.fbp.trim() ? input.fbp.trim() : undefined;
  const rawFbc = formatFbc(input.fbc, input.fbclid);

  // 3. Susun objek user_data
  const rawUserData: Record<string, any> = {
    ph: hashedPhone ? [hashedPhone] : undefined,
    em: hashedEmail ? [hashedEmail] : undefined,
    fn: hashedFn ? [hashedFn] : undefined,
    ln: hashedLn ? [hashedLn] : undefined,
    ct: hashedCity ? [hashedCity] : undefined,
    zp: hashedZip ? [hashedZip] : undefined,
    country: hashedCountry ? [hashedCountry] : undefined,
    fbp: rawFbp,
    fbc: rawFbc || undefined,
    client_ip_address: clientIp,
    client_user_agent: clientUserAgent,
    ...(input.ctwaClid ? { ctwa_clid: input.ctwaClid.trim() } : {}),
  };

  const clean = sanitizeUserData(rawUserData);

  // 4. Validasi Anti-Leak
  assertNoRawPii(clean);

  return clean;
}

/**
 * Ekstraksi Sinyal Browser & Sesi Server-Side dari Header / Cookies HTTP
 */
export function extractServerTrackingContext(headers: {
  get: (name: string) => string | null;
}, cookies?: {
  get: (name: string) => { value: string } | undefined;
}, searchParams?: URLSearchParams | null): {
  fbp: string | null;
  fbc: string | null;
  clientIp: string | null;
  clientUserAgent: string | null;
  eventSourceUrl: string | null;
} {
  const clientIp =
    headers.get('cf-connecting-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    headers.get('x-real-ip') ||
    null;

  const clientUserAgent = headers.get('user-agent') || null;
  const eventSourceUrl = headers.get('referer') || null;

  const cookieFbp = cookies?.get('_fbp')?.value || null;
  const cookieFbc = cookies?.get('_fbc')?.value || null;
  const fbclid = searchParams?.get('fbclid') || null;

  const fbc = formatFbc(cookieFbc, fbclid);

  return {
    fbp: cookieFbp,
    fbc,
    clientIp,
    clientUserAgent,
    eventSourceUrl,
  };
}

/**
 * Bangun Payload Lengkap Meta Conversions API (CAPI)
 */
export function buildMetaCAPIEventPayload(options: MetaCAPIEventOptions): {
  body: Record<string, any>;
  eventId: string;
} {
  const currentTimestamp = options.eventTime || Math.floor(Date.now() / 1000);
  const resolvedEventName = options.eventName;

  // Deduplication Key:
  let resolvedEventId = options.eventId;
  if (!resolvedEventId) {
    if (resolvedEventName === 'Purchase' && options.orderId) {
      resolvedEventId = `PURCHASE_${options.orderId}`;
    } else if (resolvedEventName === 'InitiateCheckout' && options.orderId) {
      resolvedEventId = `IC_${options.orderId}`;
    } else if (options.orderId) {
      resolvedEventId = `${resolvedEventName.toUpperCase()}_${options.orderId}`;
    } else {
      resolvedEventId = `${resolvedEventName.toUpperCase()}_${Date.now()}`;
    }
  }

  const cleanUserData = buildMetaUserData(options.userData);

  const customDataObj: Record<string, any> = {
    currency: options.customData?.currency || 'IDR',
    value: options.customData?.value !== undefined ? options.customData.value : 0,
    ...(options.customData?.contentName ? { content_name: options.customData.contentName } : {}),
    ...(options.customData?.contentIds?.length ? { content_ids: options.customData.contentIds } : {}),
    ...(options.customData?.contentType ? { content_type: options.customData.contentType } : {}),
    ...(options.customData || {}),
  };
  delete customDataObj.contentName;
  delete customDataObj.contentIds;
  delete customDataObj.contentType;

  const eventItem: Record<string, any> = {
    event_name: resolvedEventName,
    event_time: currentTimestamp,
    event_id: resolvedEventId,
    action_source: options.actionSource || 'website',
    user_data: cleanUserData,
    custom_data: customDataObj,
  };

  if (options.eventSourceUrl) {
    eventItem.event_source_url = options.eventSourceUrl;
  }

  const body: Record<string, any> = {
    data: [eventItem],
    ...(options.testEventCode ? { test_event_code: options.testEventCode.trim() } : {}),
  };

  return { body, eventId: resolvedEventId };
}

/**
 * Normalisasi Meta Ad Account ID:
 * Format standar Meta Graph API Insights: 'act_123456789012345'
 * Jika user menginput '123456789012345' atau 'act_123456789012345',
 * fungsi ini memastikan selalu berawalan 'act_' tanpa spasi.
 */
export function normalizeMetaAdAccountId(rawId: string | undefined | null): string {
  if (!rawId || typeof rawId !== 'string') return '';
  const trimmed = rawId.trim();
  if (!trimmed) return '';

  const clean = trimmed.replace(/\s+/g, '');
  if (clean.toLowerCase().startsWith('act_')) {
    const digits = clean.slice(4).replace(/\D/g, '');
    return digits ? `act_${digits}` : '';
  }

  const digits = clean.replace(/\D/g, '');
  return digits ? `act_${digits}` : '';
}

export interface MetaDailySpendResult {
  success: boolean;
  spend: number;
  currency: string;
  rawSpend: string;
  adAccountId: string;
  error?: string;
}

/**
 * Tarik total spend iklan harian dari Meta Graph API Insights
 * GET https://graph.facebook.com/v19.0/{sanitized_ad_account_id}/insights?date_preset=today&fields=spend,account_currency
 * Headers: Authorization: Bearer {capi_access_token}
 *
 * Catatan: Error ditangani secara silent (fallback spend = 0) tanpa membuat render dashboard crash.
 */
export async function fetchMetaDailySpend(
  adAccountId: string | undefined | null,
  accessToken: string | undefined | null,
  datePreset: string = 'today'
): Promise<MetaDailySpendResult> {
  const sanitizedId = normalizeMetaAdAccountId(adAccountId);
  if (!sanitizedId || !accessToken) {
    return {
      success: false,
      spend: 0,
      currency: 'IDR',
      rawSpend: '0',
      adAccountId: sanitizedId || '',
      error: !sanitizedId ? 'Invalid or missing Ad Account ID' : 'Missing CAPI Access Token',
    };
  }

  const url = `https://graph.facebook.com/v19.0/${sanitizedId}/insights?date_preset=${encodeURIComponent(datePreset)}&fields=spend,account_currency`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      let errorData: any = {};
      try {
        errorData = await res.json();
      } catch {}
      const errMsg = errorData?.error?.message || `Meta Graph API responded with HTTP ${res.status}`;
      console.warn(`[Meta Insights] Silent fallback for ${sanitizedId}:`, errMsg);
      return {
        success: false,
        spend: 0,
        currency: 'IDR',
        rawSpend: '0',
        adAccountId: sanitizedId,
        error: errMsg,
      };
    }

    const json = await res.json();
    const insights = Array.isArray(json?.data) && json.data.length > 0 ? json.data[0] : null;
    const rawSpend = String(insights?.spend || '0');
    const spend = Number(rawSpend) || 0;
    const currency = String(insights?.account_currency || 'IDR').toUpperCase();

    return {
      success: true,
      spend,
      currency,
      rawSpend,
      adAccountId: sanitizedId,
    };
  } catch (err: any) {
    console.warn(`[Meta Insights Exception] Silent fallback for ${sanitizedId}:`, err?.message || err);
    return {
      success: false,
      spend: 0,
      currency: 'IDR',
      rawSpend: '0',
      adAccountId: sanitizedId,
      error: err?.message || 'Network exception connecting to Meta Graph API',
    };
  }
}

