/**
 * Dynamic QRIS Generator
 * Converts a static QRIS string (indicator 010211) into a dynamic one (010212)
 * with an embedded transaction amount (Tag 54), then recalculates the CRC16-CCITT checksum.
 *
 * Spec reference: QRIS National Standard (Bank Indonesia), EMV QR Code Specification.
 */

// Dynamic QRIS Generator for any standard Indonesian QRIS (EMVCo specification)

/**
 * CRC16-CCITT (polynomial 0x1021, initial 0xFFFF).
 * Operates on the UTF-8 byte representation of the input string.
 */
export function crc16ccitt(input: string): string {
  let crc = 0xFFFF;
  const bytes = typeof Buffer !== 'undefined'
    ? Buffer.from(input, 'utf8')
    : new TextEncoder().encode(input);
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * generateDynamicQRIS
 *
 * @param staticQris – The raw static QRIS payload string (indicator 010211).
 * @param amount     – The transaction amount in IDR (integer, e.g. 75000).
 * @returns            A new QRIS payload string with:
 *                     - Indicator changed to 010212 (dynamic)
 *                     - Tag 54 (transaction amount) injected before Tag 58 (country code)
 *                     - CRC16-CCITT checksum recalculated (Tag 63)
 */
export function generateDynamicQRIS(staticQris: string, amount: number): string {
  if (!staticQris) return '';
  let raw = staticQris.trim();

  // a) Ubah Tag 01 menjadi '010212' (Dinamis)
  if (raw.startsWith('000201010211')) {
    raw = '000201010212' + raw.substring(12);
  } else if (raw.includes('010211')) {
    raw = raw.replace('010211', '010212');
  }

  // d) Hapus CRC lama di belakang '6304'
  const checksumTagIdx = raw.lastIndexOf('6304');
  if (checksumTagIdx !== -1) {
    raw = raw.substring(0, checksumTagIdx);
  }

  // b) Bersihkan tag 54 lama yang mungkin sudah ada sebelum Tag 58 (antara Tag 53 dan Tag 58)
  let tag58Idx = raw.indexOf('5802ID');
  if (tag58Idx === -1) {
    tag58Idx = raw.indexOf('5802');
  }

  if (tag58Idx !== -1) {
    let before58 = raw.substring(0, tag58Idx);
    const after58 = raw.substring(tag58Idx);
    // HANYA bersihkan Tag 54 yang berada di antara Tag 53 dan Tag 58 (atau tepat sebelum Tag 58)
    // JANGAN menghapus substring '54' di dalam Tag 26 / Tag 51 (seperti ID NMID merchant)
    const tag53Idx = before58.lastIndexOf('5303');
    if (tag53Idx !== -1) {
      const before53End = before58.substring(0, tag53Idx + 7);
      let between53And58 = before58.substring(tag53Idx + 7);
      between53And58 = between53And58.replace(/54\d{2}[0-9]+/, '');
      before58 = before53End + between53And58;
    } else {
      before58 = before58.replace(/54\d{2}[0-9]+$/, '');
    }
    raw = before58 + after58;
  }

  // c) Sisipkan tag 54 baru tepat sebelum '5802ID' (atau '5802')
  const amountStr = String(Math.round(amount));
  const tag54 = '54' + String(amountStr.length).padStart(2, '0') + amountStr;

  tag58Idx = raw.indexOf('5802ID');
  if (tag58Idx === -1) {
    tag58Idx = raw.indexOf('5802');
  }

  if (tag58Idx !== -1) {
    raw = raw.substring(0, tag58Idx) + tag54 + raw.substring(tag58Idx);
  } else {
    raw += tag54;
  }

  // Siapkan payload dengan tag '6304'
  const payloadWithTag63 = raw + '6304';

  // e) Hitung ulang CRC16-CCITT (poly 0x1021, init 0xFFFF) dari string sampai '6304'
  const checksum = crc16ccitt(payloadWithTag63);

  return payloadWithTag63 + checksum;
}

export interface QrValidationResult {
  isValid: boolean;
  type?: 'emvco_raw' | 'quickchart_emvco' | 'image_url';
  rawEmvco?: string;
  imageUrl?: string;
  error?: string;
}

const ALLOWED_QR_IMAGE_DOMAINS = [
  'boontrack.com',
  'supabase.co',
  'r2.dev',
  'cloudinary.com',
  'images.unsplash.com',
];

/**
 * Strict hostname check for approved QR image storage/CDN domains.
 * Strictly verifies that the hostname is an exact match or a valid subdomain
 * with a period boundary (e.g. assets.boontrack.com, xxx.supabase.co).
 * Explicitly rejects lookalike domains (e.g. evil-boontrack.com, boontrack.com.attacker.com).
 */
export function isAllowedQrHostname(hostname?: string | null): boolean {
  if (!hostname || typeof hostname !== 'string') return false;
  const cleanHost = hostname.toLowerCase().trim().replace(/\.$/, '');

  return ALLOWED_QR_IMAGE_DOMAINS.some((domain) => {
    return cleanHost === domain || cleanHost.endsWith('.' + domain);
  });
}

/**
 * Strict hostname check for approved external QR service providers (strictly quickchart.io).
 * Rejects subdomains (e.g. sub.quickchart.io), unapproved hosts, and lookalike domains.
 */
export function isAllowedQrServiceHost(hostname?: string | null): boolean {
  if (!hostname || typeof hostname !== 'string') return false;
  const cleanHost = hostname.toLowerCase().trim().replace(/\.$/, '');
  return cleanHost === 'quickchart.io';
}

/**
 * Validates whether a URL points to a supported image file or trusted image host.
 * Strictly enforces HTTPS, allowed hostname, and supported image extension/storage path.
 */
export function isSupportedQrImageUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith('https://')) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;

    // Reject lookalike or unapproved domains
    if (!isAllowedQrHostname(parsed.hostname)) {
      return false;
    }

    const pathname = parsed.pathname.toLowerCase();
    const hasImageExt = /\.(png|jpe?g|webp|svg|gif)$/i.test(pathname);
    const isStandardStoragePath = /^\/storage\/v1\/object\/public\//i.test(pathname);
    return hasImageExt || isStandardStoragePath;
  } catch {
    return false;
  }
}

/**
 * Validates nested TLV structure inside Merchant Account Information (Tags 26 to 51).
 * Confirms:
 * 1. Sub-tags are 2 numeric digits
 * 2. Sub-lengths are 2 numeric digits
 * 3. Sub-values do not overflow parent tag length
 * 4. Sub-tag 00 (globally unique identifier) is present
 */
export function validateNestedTlv(parentTag: string, val: string): { valid: boolean; error?: string } {
  if (!val || typeof val !== 'string') {
    return { valid: false, error: `Value untuk Tag ${parentTag} kosong.` };
  }
  let subIdx = 0;
  let hasSubTag00 = false;

  while (subIdx < val.length) {
    if (subIdx + 4 > val.length) {
      return { valid: false, error: `Nested TLV di dalam Tag ${parentTag} terpotong sebelum sub-tag selesai.` };
    }
    const subTag = val.slice(subIdx, subIdx + 2);
    const subLenStr = val.slice(subIdx + 2, subIdx + 4);
    if (!/^\d{2}$/.test(subTag) || !/^\d{2}$/.test(subLenStr)) {
      return { valid: false, error: `Sub-tag (${subTag}) atau sub-length (${subLenStr}) di dalam Tag ${parentTag} bukan 2 digit numerik.` };
    }
    const subLen = parseInt(subLenStr, 10);
    subIdx += 4;
    if (subIdx + subLen > val.length) {
      return { valid: false, error: `Value untuk sub-tag ${subTag} di dalam Tag ${parentTag} melebihi panjang parent tag.` };
    }
    if (subTag === '00') hasSubTag00 = true;
    subIdx += subLen;
  }

  if (!hasSubTag00) {
    return { valid: false, error: `Merchant Account Info Tag ${parentTag} wajib memuat Sub-tag 00 (GUID).` };
  }

  return { valid: true };
}

/**
 * Validates EMVCo TLV (Tag-Length-Value) data structure defensively.
 * Asserts:
 * 1. String length >= 25 characters
 * 2. Starts with Tag 00 Length 02 Value 01 ("000201")
 * 3. Contains Tag 01 with initiation method "11" (static) or "12" (dynamic)
 * 4. Each tag and length are 2 numeric digits
 * 5. Tag value character count strictly matches declared length without truncation or overflow
 * 6. Nested TLV for Merchant Account Information (Tags 26-51) is valid
 * 7. Tag 63 (CRC) is MANDATORY, has length 04, is strictly the final tag, and matches CRC16-CCITT checksum.
 */
export function validateEmvcoTlv(raw: string): { valid: boolean; error?: string } {
  if (!raw || typeof raw !== 'string') return { valid: false, error: 'Payload QRIS kosong.' };
  const trimmed = raw.trim();
  if (trimmed.length < 25) {
    return { valid: false, error: 'Panjang payload EMVCo kurang dari 25 karakter.' };
  }
  if (!trimmed.startsWith('000201')) {
    return { valid: false, error: 'Payload QRIS wajib diawali Tag Format Indicator 000201.' };
  }

  let idx = 0;
  let hasTag00 = false;
  let hasTag01 = false;
  let hasTag63 = false;

  while (idx < trimmed.length) {
    if (idx + 4 > trimmed.length) {
      return { valid: false, error: 'Struktur TLV QRIS terpotong sebelum tag dan panjang selesai.' };
    }
    const tag = trimmed.slice(idx, idx + 2);
    const lenStr = trimmed.slice(idx + 2, idx + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenStr)) {
      return { valid: false, error: `Tag (${tag}) atau Length (${lenStr}) pada payload QRIS bukan format 2-digit numerik.` };
    }
    const len = parseInt(lenStr, 10);
    idx += 4;
    if (idx + len > trimmed.length) {
      return { valid: false, error: `Value untuk Tag ${tag} melebihi sisa panjang string payload EMVCo.` };
    }
    const val = trimmed.slice(idx, idx + len);
    if (tag === '00' && val === '01') hasTag00 = true;
    if (tag === '01' && (val === '11' || val === '12')) hasTag01 = true;

    // Nested TLV check for Merchant Account Information (Tag 26 through 51)
    const tagNum = parseInt(tag, 10);
    if (tagNum >= 26 && tagNum <= 51) {
      const nestedRes = validateNestedTlv(tag, val);
      if (!nestedRes.valid) {
        return nestedRes;
      }
    }

    // CRC validation for Tag 63 (Checksum) - MANDATORY
    if (tag === '63') {
      hasTag63 = true;
      if (len !== 4) {
        return { valid: false, error: 'Tag 63 (CRC) wajib memiliki panjang tepat 4 karakter.' };
      }
      idx += len;
      if (idx !== trimmed.length) {
        return { valid: false, error: 'Tag 63 (CRC) wajib menjadi tag terakhir pada payload EMVCo.' };
      }
      const strBeforeCrc = trimmed.slice(0, idx - 4);
      const expectedCrc = crc16ccitt(strBeforeCrc);
      if (val.toUpperCase() !== expectedCrc.toUpperCase()) {
        return { valid: false, error: `Checksum CRC16 tidak valid: diharapkan ${expectedCrc}, diterima ${val.toUpperCase()}.` };
      }
      break;
    }

    idx += len;
  }

  if (!hasTag00 || !hasTag01) {
    return { valid: false, error: 'Payload EMVCo tidak memuat Tag 00 atau Tag 01 yang valid.' };
  }

  if (!hasTag63) {
    return { valid: false, error: 'Payload EMVCo wajib memuat Tag 63 (CRC16 Checksum).' };
  }

  return { valid: true };
}

/**
 * Extract raw EMVCo QRIS string from string or QuickChart/QR service URL.
 * Validates through validateEmvcoTlv() before returning.
 * Strictly verifies HTTPS, approved service host, single parameter decoding, and full EMVCo TLV integrity.
 */
export function extractRawQrString(strOrUrl?: string): string {
  if (!strOrUrl || typeof strOrUrl !== 'string') return '';
  const trimmed = strOrUrl.trim();

  // 1. Direct raw string
  if (trimmed.startsWith('000201')) {
    const check = validateEmvcoTlv(trimmed);
    return check.valid ? trimmed : '';
  }

  // 2. URL extraction
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return '';
    if (!isAllowedQrServiceHost(parsed.hostname)) return '';

    const textParam = parsed.searchParams.get('text');
    if (!textParam) return '';
    const cleanText = textParam.trim();
    if (cleanText.startsWith('000201')) {
      const check = validateEmvcoTlv(cleanText);
      return check.valid ? cleanText : '';
    }
  } catch {
    // Not a valid URL
  }

  return '';
}

/**
 * Strict QR Validity Detection:
 * - Parses URLs using `new URL()`.
 * - Requires HTTPS and strictly matches approved hostnames (does not use `.includes('quickchart.io/qr')`).
 * - Applies strict hostname checks to any embedded text= paths; rejects unapproved hosts.
 * - Confirms QuickChart URLs have non-empty, validly encoded EMVCo payloads (000201...).
 * - Avoids double-decoding: URLSearchParams.get('text') already decodes the value.
 * - Confirms direct EMVCo payloads satisfy national standards, valid TLV structure, and mandatory Tag 63 CRC.
 * - Confirms image URLs have supported format or trusted origin over HTTPS.
 */
export function validateAndExtractQr(orderOrPayload: any): QrValidationResult {
  if (!orderOrPayload) {
    return { isValid: false, error: 'Data QRIS kosong.' };
  }

  const qrString = typeof orderOrPayload === 'string'
    ? orderOrPayload
    : (orderOrPayload.qr_string || (orderOrPayload.metadata && typeof orderOrPayload.metadata === 'object' ? orderOrPayload.metadata.qr_string : ''));
  const qrCodeUrl = typeof orderOrPayload === 'object'
    ? (orderOrPayload.qr_code_url || (orderOrPayload.metadata && typeof orderOrPayload.metadata === 'object' ? orderOrPayload.metadata.qr_code_url : ''))
    : '';

  // 1. Direct EMVCo string validation
  if (qrString && typeof qrString === 'string') {
    const trimmed = qrString.trim();
    if (trimmed.startsWith('000201')) {
      const tlvCheck = validateEmvcoTlv(trimmed);
      if (tlvCheck.valid) {
        return { isValid: true, type: 'emvco_raw', rawEmvco: trimmed };
      }
      return {
        isValid: false,
        error: tlvCheck.error || 'Struktur data TLV EMVCo tidak valid.',
      };
    }
    if (trimmed && !qrCodeUrl) {
      return {
        isValid: false,
        error: 'Payload string QRIS tidak memenuhi standar EMVCo (harus diawali 000201 dan minimal 25 karakter).',
      };
    }
  }

  // 2. URL validation
  if (qrCodeUrl && typeof qrCodeUrl === 'string') {
    const trimmedUrl = qrCodeUrl.trim();
    let parsed: URL;
    try {
      parsed = new URL(trimmedUrl);
    } catch {
      return {
        isValid: false,
        error: 'URL barcode tidak valid atau rusak.',
      };
    }

    // Origin validation: Require HTTPS
    if (parsed.protocol !== 'https:') {
      return {
        isValid: false,
        error: 'URL barcode wajib menggunakan protokol HTTPS.',
      };
    }

    const textParam = parsed.searchParams.get('text');

    // QR service URL validation (e.g. QuickChart) or any embedded text= path
    if (textParam !== null || parsed.pathname === '/qr') {
      // Strictly match approved QR service hostnames (exact quickchart.io); reject unapproved hosts
      if (!isAllowedQrServiceHost(parsed.hostname)) {
        return {
          isValid: false,
          error: 'Host QR service tidak diizinkan atau tidak terdaftar.',
        };
      }

      if (!textParam) {
        return { isValid: false, error: 'URL QuickChart tidak memuat parameter payload text QRIS.' };
      }

      // Avoid double-decoding: searchParams.get('text') already decodes the parameter
      const cleanText = textParam.trim();
      if (!cleanText.startsWith('000201')) {
        return {
          isValid: false,
          error: 'Payload QRIS pada URL QuickChart tidak valid (harus diawali 000201 dan minimal 25 karakter).',
        };
      }

      const tlvCheck = validateEmvcoTlv(cleanText);
      if (tlvCheck.valid) {
        return { isValid: true, type: 'quickchart_emvco', rawEmvco: cleanText, imageUrl: trimmedUrl };
      }
      return {
        isValid: false,
        error: tlvCheck.error || 'Struktur data TLV EMVCo pada URL QuickChart tidak valid.',
      };
    }

    // Supported Image URL validation
    if (isSupportedQrImageUrl(trimmedUrl)) {
      return { isValid: true, type: 'image_url', imageUrl: trimmedUrl };
    }

    return {
      isValid: false,
      error: 'URL barcode bukan merupakan file gambar yang didukung (.png, .jpg, .webp, .svg) atau host terpercaya.',
    };
  }

  return { isValid: false, error: 'Data QRIS belum tersedia pada pesanan.' };
}
