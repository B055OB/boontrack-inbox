/**
 * Phone Number Normalizer & Sanitizer (Dual Phone Format Standard)
 *
 * Sisi Database & Backend: Selalu simpan format E.164 baku Indonesia: 628xxxxxxxxxx
 * Sisi UI Konsumen: Fleksibel menerima input 08..., 8..., 62..., +62... dengan/tanpa spasi/strip,
 * atau dengan visual prefix (+62) di sisi kiri input field.
 */

/**
 * Normalisasi nomor HP / WhatsApp ke format E.164 baku Indonesia (628xxxxxxxxxx).
 *
 * Aturan:
 * 1. Bersihkan semua karakter selain angka
 * 2. Normalisasi awalan nomor Indonesia:
 *    - 08...  -> 628...
 *    - 8...   -> 628...
 *    - 6208.. -> 628... (jika user typo 6208)
 *    - 0062.. -> 62...  (international exit code)
 *    - 628... -> 628... (sudah baku)
 */
export function normalizePhoneToE164(input?: string | null): string {
  if (!input) return '';

  // 1. Bersihkan semua karakter selain angka
  let digits = String(input).replace(/\D/g, '');

  // 1b. Bersihkan exit code internasional (0062)
  if (digits.startsWith('0062')) {
    digits = digits.slice(2);
  }

  // 2. Normalisasi awalan nomor Indonesia
  if (digits.startsWith('08')) {
    digits = '628' + digits.slice(2);
  } else if (digits.startsWith('8')) {
    digits = '628' + digits.slice(1);
  } else if (digits.startsWith('6208')) {
    // Penanganan jika ada user salah ketik 6208...
    digits = '628' + digits.slice(4);
  }

  return digits;
}

/**
 * Sanitizer ramah konsumen saat input field menggunakan visual prefix (+62).
 * Jika user mengetik '08', angka 0 di depan otomatis dipangkas menjadi '8'.
 * Jika user paste nomor lengkap (+62... / 62...), prefix negara dipangkas sehingga
 * tidak terjadi duplikasi (+62 628...).
 */
export function sanitizePhoneInputForPrefix(input: string): string {
  if (!input) return '';

  let trimmed = input.trim();

  // Pangkas duplikasi prefix negara jika user paste (+62 / 62)
  if (trimmed.startsWith('+62')) {
    trimmed = trimmed.slice(3).trim();
  } else if (trimmed.startsWith('62')) {
    trimmed = trimmed.slice(2).trim();
  }

  // Pangkas angka 0 di depan jika user mengetik '08' atau '0...'
  if (trimmed.startsWith('08')) {
    trimmed = trimmed.slice(1);
  } else if (trimmed.startsWith('0') && trimmed.length > 1) {
    trimmed = trimmed.replace(/^0+/, '');
  }

  return trimmed;
}

/**
 * Validasi apakah nomor HP Indonesia valid setelah dinormalisasi E.164.
 * Nomor seluler Indonesia: 628 diikuti 8 sampai 13 digit (total 11-16 digit).
 */
export function isValidIndonesianPhone(input?: string | null): boolean {
  if (!input) return false;
  const normalized = normalizePhoneToE164(input);
  return /^628\d{8,13}$/.test(normalized);
}

/**
 * Format nomor E.164 ke format tampilan lokal (08xx-xxxx-xxxx) untuk kemudahan baca.
 */
export function formatPhoneForDisplay(input?: string | null): string {
  if (!input) return '';
  const normalized = normalizePhoneToE164(input);
  if (!normalized.startsWith('628')) return input;

  const local = '0' + normalized.slice(2);
  // Format menjadi grup 4-4-xxxx
  if (local.length <= 4) return local;
  if (local.length <= 8) return `${local.slice(0, 4)}-${local.slice(4)}`;
  return `${local.slice(0, 4)}-${local.slice(4, 8)}-${local.slice(8)}`;
}
