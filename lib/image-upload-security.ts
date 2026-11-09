/**
 * Enterprise Image Upload Security Guard (Gate G6 Compliance)
 * Validates image uploads against:
 * - MIME spoofing (verifies actual binary magic bytes)
 * - Spoofed extensions (e.g. payload.exe disguised as image.png)
 * - Malformed / zero-byte / corrupt files
 * - Explicit SVG rejection (prevents SVG-based XSS, XXE, and script injection)
 * - Strict size boundaries (10 MB per-file, 25 MB aggregate limit)
 * - Browser decodability verification
 */

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAX_AGGREGATE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB aggregate limit
export const MAX_FILES_COUNT = 3;

export type SupportedImageFormat = 'png' | 'jpeg' | 'webp' | 'gif';

export interface ImageValidationResult {
  isValid: boolean;
  detectedFormat?: SupportedImageFormat;
  error?: string;
}

/**
 * Checks if byte sequence matches expected magic prefix
 */
function matchesBytes(bytes: Uint8Array, pattern: number[], offset = 0): boolean {
  if (bytes.length < offset + pattern.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (bytes[offset + i] !== pattern[i]) return false;
  }
  return true;
}

/**
 * Validates a file's binary magic bytes, MIME declaration, and size boundaries.
 */
export function validateImageFile(
  fileBytes: Uint8Array,
  fileName: string,
  declaredMimeType: string,
  fileSize: number
): ImageValidationResult {
  // 1. Zero-byte check
  if (!fileBytes || fileBytes.length === 0 || fileSize === 0) {
    return {
      isValid: false,
      error: 'File kosong (0 bytes) tidak dapat diunggah.',
    };
  }

  // 2. Per-file size boundary
  if (fileSize > MAX_FILE_SIZE_BYTES || fileBytes.length > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `Ukuran file melebihi batas maksimum 10 MB (${(fileSize / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }

  const lowerName = (fileName || '').toLowerCase();
  const lowerMime = (declaredMimeType || '').toLowerCase();

  // 3. Explicit SVG rejection (XSS vector prevention)
  if (
    lowerName.endsWith('.svg') ||
    lowerMime.includes('svg') ||
    lowerMime.includes('xml')
  ) {
    return {
      isValid: false,
      error: 'Format SVG tidak diizinkan demi alasan keamanan konten visual.',
    };
  }

  // Check SVG content signatures in the initial bytes (plain text search)
  const headerPreview = new TextDecoder('utf-8', { fatal: false })
    .decode(fileBytes.slice(0, Math.min(256, fileBytes.length)))
    .toLowerCase();

  if (
    headerPreview.includes('<svg') ||
    headerPreview.includes('<?xml') ||
    headerPreview.includes('<!doctype svg')
  ) {
    return {
      isValid: false,
      error: 'File mengandung konten SVG yang tidak diizinkan.',
    };
  }

  // 4. Magic Bytes Inspection
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (matchesBytes(fileBytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { isValid: true, detectedFormat: 'png' };
  }

  // JPEG signature: FF D8 FF
  if (matchesBytes(fileBytes, [0xff, 0xd8, 0xff])) {
    return { isValid: true, detectedFormat: 'jpeg' };
  }

  // WebP signature: RIFF (bytes 0-3) + WEBP (bytes 8-11)
  if (
    matchesBytes(fileBytes, [0x52, 0x49, 0x46, 0x46], 0) &&
    matchesBytes(fileBytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { isValid: true, detectedFormat: 'webp' };
  }

  // GIF signature: GIF87a or GIF89a
  if (
    matchesBytes(fileBytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    matchesBytes(fileBytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return { isValid: true, detectedFormat: 'gif' };
  }

  // 5. Binary signature mismatch (e.g. PE Executable MZ, PDF, ELF, Shell scripts, etc.)
  return {
    isValid: false,
    error: 'Format biner file tidak valid atau terdeteksi manipulasi tipe file (MIME spoofing). Hanya PNG, JPEG, WebP, dan GIF yang didukung.',
  };
}

/**
 * Validates aggregate size of multiple files.
 */
export function validateAggregateUploadSize(
  existingSizes: number[],
  newSizes: number[]
): { isValid: boolean; totalBytes: number; error?: string } {
  const total = [...existingSizes, ...newSizes].reduce((acc, sz) => acc + sz, 0);
  if (total > MAX_AGGREGATE_SIZE_BYTES) {
    return {
      isValid: false,
      totalBytes: total,
      error: `Total ukuran unggahan melebihi batas agregat 25 MB (${(total / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }
  return { isValid: true, totalBytes: total };
}

/**
 * Browser-side decodability check using HTMLImageElement.
 * Ensures the file is not just a valid header followed by truncated/corrupt image data.
 */
export async function verifyImageDecodable(blobUrl: string): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve(true);
      } else {
        resolve(false);
      }
    };
    img.onerror = () => {
      resolve(false);
    };
    img.src = blobUrl;
  });
}
