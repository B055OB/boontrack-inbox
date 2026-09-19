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
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
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

  // b) Bersihkan tag 54 lama yang mungkin sudah ada sebelum Tag 58
  let tag58Idx = raw.indexOf('5802ID');
  if (tag58Idx === -1) {
    tag58Idx = raw.indexOf('5802');
  }

  if (tag58Idx !== -1) {
    let before58 = raw.substring(0, tag58Idx);
    const after58 = raw.substring(tag58Idx);
    before58 = before58.replace(/54\d{2}[0-9]+/, '');
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
