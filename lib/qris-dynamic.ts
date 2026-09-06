/**
 * Dynamic QRIS Generator
 * Converts a static QRIS string (indicator 010211) into a dynamic one (010212)
 * with an embedded transaction amount (Tag 54), then recalculates the CRC16-CCITT checksum.
 *
 * Spec reference: QRIS National Standard (Bank Indonesia), EMV QR Code Specification.
 */

/** INTERNAL_TENANTS whose checkout should use BoonTrack's own QRIS with dynamic amount injection. */
export const INTERNAL_TENANTS = ['onlineboost', 'growth', 'growthplus', 'proscale'];

/**
 * CRC16-CCITT (polynomial 0x1021, initial 0xFFFF).
 * Operates on the UTF-8 byte representation of the input string.
 */
function crc16ccitt(input: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
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
 * @param amount     – The transaction amount in IDR (integer, e.g. 299000).
 * @returns            A new QRIS payload string with:
 *                     - Indicator changed to 010212 (dynamic)
 *                     - Tag 54 (transaction amount) injected before Tag 58 (country code)
 *                     - CRC16-CCITT checksum recalculated (Tag 63)
 */
export function generateDynamicQRIS(staticQris: string, amount: number): string {
  // 1. Switch from static (010211) to dynamic (010212)
  let qr = staticQris.replace('010211', '010212');

  // 2. Strip old 4-hex-digit checksum (the last 4 chars after '6304')
  const checksumTagIdx = qr.lastIndexOf('6304');
  if (checksumTagIdx !== -1) {
    qr = qr.substring(0, checksumTagIdx + 4); // keep '6304', drop the 4-char CRC value
  }

  // 3. Build Tag 54 (Transaction Amount)
  const amountStr = String(amount);
  const tag54 = '54' + String(amountStr.length).padStart(2, '0') + amountStr;

  // 4. Remove any existing Tag 54 (in case it was already present)
  //    Tag 54 format: '54' + 2-digit-length + value
  qr = qr.replace(/54\d{2}[0-9]+(?=58)/, '');

  // 5. Insert Tag 54 right before Tag 58 ('5802ID')
  const tag58Idx = qr.indexOf('5802ID');
  if (tag58Idx !== -1) {
    qr = qr.substring(0, tag58Idx) + tag54 + qr.substring(tag58Idx);
  } else {
    // Fallback: insert before the checksum tag '6304'
    const crcIdx = qr.lastIndexOf('6304');
    if (crcIdx !== -1) {
      qr = qr.substring(0, crcIdx) + tag54 + qr.substring(crcIdx);
    } else {
      qr += tag54 + '6304';
    }
  }

  // 6. Ensure the string ends with '6304' (checksum tag without value)
  if (!qr.endsWith('6304')) {
    // Re-locate and trim
    const finalCrcIdx = qr.lastIndexOf('6304');
    if (finalCrcIdx !== -1) {
      qr = qr.substring(0, finalCrcIdx + 4);
    } else {
      qr += '6304';
    }
  }

  // 7. Compute CRC16-CCITT over the full string (including '6304')
  const checksum = crc16ccitt(qr);

  return qr + checksum;
}
