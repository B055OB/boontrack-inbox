/**
 * @file lib/payment/dana-reader.ts
 * @description DANA notification parser and mutation validator with anti false-positive hardening.
 *
 * Enforces P0 Security Invariants (ACT-01):
 * 1. Reject non-mutation keywords ("cashback", "voucher", "diskon", "promo", "saldo bertambah karena promo", "isi saldo gagal", etc.)
 * 2. Mandatory genuine incoming credit mutation regex pattern.
 * 3. Strict numeric extraction without decimal ambiguity.
 * 4. 100% exact numerical match validation before confirming PAID status.
 */

export interface DanaParseResult {
  isValidCredit: boolean;
  isRejected: boolean;
  rejectionReason: string | null;
  amount: number | null;
  sender: string | null;
  matchedPattern: string | null;
  rawText: string;
}

/**
 * Kata kunci non-mutasi / promo / transaksi keluar yang WAJIB di-reject
 * untuk mencegah false-positive mutasi saldo palsu.
 */
export const DANA_REJECT_KEYWORDS = [
  'cashback',
  'voucher',
  'diskon',
  'promo',
  'saldo bertambah karena promo',
  'isi saldo gagal',
  'gagal',
  'dana kaget',
  'klaim voucher',
  'telah dibeli',
  'berhasil membayar',
  'kamu telah membayar',
  'pembayaran berhasil ke',
  'kirim uang berhasil', // outbound transfer
  'tagihan berhasil dibayar',
  'reward',
  'undian',
  'spin & win',
  'voucher spesial',
];

/**
 * Regex guard penolak notifikasi non-mutasi atau promo DANA.
 */
export const DANA_REJECT_REGEX = new RegExp(
  `(?:${DANA_REJECT_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'i'
);

/**
 * Regex verifikasi mutasi kredit masuk nyata resmi DANA.
 */
export const DANA_CREDIT_MUTATION_REGEX =
  /(?:berhasil\s+menerima|uang\s+masuk|transfer\s+dari|kiriman\s+uang|top\s*up\s+berhasil|menerima\s+pembayaran|pembayaran\s+(?:qris\s+)?diterima|transaksi\s+qris\s+sebesar|saldo\s+masuk|dana\s+masuk)/i;

/**
 * Ekstraksi nominal numerik eksak dari teks notifikasi DANA.
 * Menghapus currency (Rp, IDR), akhiran sen (,00 / .00 / ,- / .-), dan titik/koma ribuan.
 */
export function extractDanaExactAmount(rawText: string): number | null {
  if (!rawText || typeof rawText !== 'string') return null;
  const text = rawText.trim();

  // Pattern 1: Rp / IDR diikuti angka dengan pemisah ribuan titik atau koma
  // e.g. Rp 1.771, Rp1.771,00, Rp 50.000,-, IDR 100000
  const rpRegex = /(?:rp\.?|idr)\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]{4,}|[0-9]{1,3})/i;

  // Pattern 2: Contextual keywords penerimaan uang
  const contextRegex =
    /(?:sebesar|menerima|uang masuk|pembayaran|nominal|transfer dari|kiriman uang)\s*(?:rp\.?|idr)?\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]{4,}|[0-9]{1,3})/i;

  const match = text.match(rpRegex) || text.match(contextRegex);
  if (!match || !match[1]) return null;

  let numStr = match[1].trim();

  // Bersihkan tanda baca trailing di akhir angka seperti . atau ,
  numStr = numStr.replace(/[.,]+$/, '');

  // Bersihkan akhiran sen standar Indonesia ,- atau .-
  if (numStr.endsWith(',-') || numStr.endsWith('.-')) {
    numStr = numStr.slice(0, -2);
  }
  // Bersihkan sen desimal ,00 atau .00
  if (numStr.endsWith(',00') || numStr.endsWith('.00')) {
    numStr = numStr.slice(0, -3);
  }

  // Ambil hanya digit angka
  const digitsOnly = numStr.replace(/[^0-9]/g, '');
  const parsed = parseInt(digitsOnly, 10);

  return isNaN(parsed) || parsed <= 0 ? null : parsed;
}

/**
 * Ekstraksi nama pengirim dana jika tersedia pada string notifikasi.
 */
export function extractDanaSender(rawText: string): string | null {
  if (!rawText) return null;
  const senderMatch = rawText.match(/(?:dari|pengirim)\s+([A-Za-z0-9\s.]+?)(?:(?:\s+sebesar|\s+ke|\.|$))/i);
  return senderMatch && senderMatch[1] ? senderMatch[1].trim() : null;
}

/**
 * Parser utama notifikasi DANA dengan hardening P0:
 * - Reject kata kunci promo/cashback/gagal/outbound
 * - Verifikasi pola mutasi kredit masuk nyata
 * - Ekstraksi nominal numerik eksak
 */
export function parseDanaNotification(rawText: string): DanaParseResult {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return {
      isValidCredit: false,
      isRejected: true,
      rejectionReason: 'Teks notifikasi kosong.',
      amount: null,
      sender: null,
      matchedPattern: null,
      rawText: rawText || '',
    };
  }

  const text = rawText.trim();

  // 1. Guard Reject: Buang/reject semua notifikasi promo/cashback/voucher/gagal/outbound
  const rejectMatch = text.match(DANA_REJECT_REGEX);
  if (rejectMatch) {
    return {
      isValidCredit: false,
      isRejected: true,
      rejectionReason: `Memuat kata kunci non-mutasi: "${rejectMatch[0]}".`,
      amount: null,
      sender: null,
      matchedPattern: null,
      rawText: text,
    };
  }

  // 2. Guard Credit: Wajibkan deteksi pola mutasi uang masuk nyata
  const creditMatch = text.match(DANA_CREDIT_MUTATION_REGEX);
  if (!creditMatch) {
    return {
      isValidCredit: false,
      isRejected: true,
      rejectionReason: 'Tidak memuat pola mutasi kredit masuk resmi DANA.',
      amount: null,
      sender: null,
      matchedPattern: null,
      rawText: text,
    };
  }

  // 3. Guard Ekstraksi Numerik Ketat
  const amount = extractDanaExactAmount(text);
  if (!amount || amount <= 0) {
    return {
      isValidCredit: false,
      isRejected: true,
      rejectionReason: 'Gagal mengekstrak nominal numerik uang yang valid.',
      amount: null,
      sender: null,
      matchedPattern: creditMatch[0],
      rawText: text,
    };
  }

  const sender = extractDanaSender(text);

  return {
    isValidCredit: true,
    isRejected: false,
    rejectionReason: null,
    amount,
    sender,
    matchedPattern: creditMatch[0],
    rawText: text,
  };
}

/**
 * Validasi status pembayaran pesanan:
 * Transaksi HANYA boleh dimutasi ke status 'PAID' jika nominal numerik match 100%
 * dengan total tagihan order. Toleransi selisih nominal (kode unik fuzzy 1-999) ditolak.
 */
export function validateOrderPaymentMatch(orderGrossAmount: number, incomingAmount: number): boolean {
  if (!orderGrossAmount || !incomingAmount) return false;
  const expected = Math.round(Number(orderGrossAmount));
  const actual = Math.round(Number(incomingAmount));
  return expected > 0 && actual > 0 && expected === actual;
}
