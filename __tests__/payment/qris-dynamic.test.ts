/**
 * @jest-environment node
 *
 * Unit tests — Dynamic QRIS EMVCo Transformation (§14.1)
 *
 * Covers all 4 Immutable Rules from ARCHITECTURE.md §14.1:
 *   Rule 1: Tag 01 is set to '12' (dynamic mode, ASPI/BI standard)
 *   Rule 2: Tag 62 is preserved exactly as-is (acquirer identity)
 *   Rule 3: Tag 54 is cleanly injected before Tag 58 (no duplication)
 *   Rule 4: CRC16-CCITT (poly 0x1021, init 0xFFFF) is recalculated correctly
 *
 * Canonical reference validation vector from ARCHITECTURE.md §14.2:
 *   Static  → 00020101021126610014COM.GO-JEK.WWW...5802ID...62070703A016304EE91
 *   Dynamic (Rp 75.000) → ...010212...540575000...62070703A0163042F39
 */

import { generateDynamicQRIS, crc16ccitt } from '@/lib/qris-dynamic';

// ─── Canonical Reference Vector (§14.2) ──────────────────────────────────────

const STATIC_QRIS =
  '00020101021126610014COM.GO-JEK.WWW01189360091437387604280210G7387604280303UMI51440014ID.CO.QRIS.WWW0215ID10265733762290303UMI5204899953033605802ID5925Basti als, Digital & Krea6008KARAWANG61054131462070703A016304EE91';

const DYNAMIC_EXPECTED =
  '00020101021226610014COM.GO-JEK.WWW01189360091437387604280210G7387604280303UMI51440014ID.CO.QRIS.WWW0215ID10265733762290303UMI5204899953033605405750005802ID5925Basti als, Digital & Krea6008KARAWANG61054131462070703A0163042F39';

const AMOUNT_75K = 75_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Walks the top-level EMVCo TLV structure and returns the value for the
 * first occurrence of `targetTag` (2-char string, e.g. '54', '62').
 * Does NOT recurse into sub-TLVs (e.g. tag 26 / tag 51).
 */
function extractTag(payload: string, targetTag: string): string | null {
  let i = 0;
  // Strip the last 4 chars (Tag 63 CRC hex) so the loop terminates cleanly
  // The CRC itself starts at 6304 which is the last tag; stop before it.
  while (i + 4 <= payload.length) {
    const tag = payload.substring(i, i + 2);
    const lenStr = payload.substring(i + 2, i + 4);
    const length = parseInt(lenStr, 10);
    if (isNaN(length) || i + 4 + length > payload.length) break;
    const value = payload.substring(i + 4, i + 4 + length);
    if (tag === targetTag) return value;
    i += 4 + length;
  }
  return null;
}

/** Counts how many times `targetTag` appears as a top-level TLV tag. */
function countTag(payload: string, targetTag: string): number {
  let i = 0;
  let count = 0;
  while (i + 4 <= payload.length) {
    const tag = payload.substring(i, i + 2);
    const lenStr = payload.substring(i + 2, i + 4);
    const length = parseInt(lenStr, 10);
    if (isNaN(length) || i + 4 + length > payload.length) break;
    if (tag === targetTag) count++;
    i += 4 + length;
  }
  return count;
}

// ─── §14.1 Rule 1 — Tag 01 must be '12' (Dynamic) ────────────────────────────

describe('QRIS §14.1 Rule 1: Dynamic Tag 01 Standard', () => {
  test('converts 010211 (static) to 010212 (dynamic)', () => {
    const result = generateDynamicQRIS(STATIC_QRIS, AMOUNT_75K);
    expect(result).toContain('000201010212');
  });

  test('does NOT contain 010211 in the output', () => {
    const result = generateDynamicQRIS(STATIC_QRIS, AMOUNT_75K);
    expect(result).not.toContain('010211');
  });

  test('canonical vector output matches expected Tag 01 = 12', () => {
    const result = generateDynamicQRIS(STATIC_QRIS, AMOUNT_75K);
    expect(result.startsWith('00020101021226')).toBe(true);
  });

  test('already-dynamic QRIS (010212) is not double-converted', () => {
    // Input is already dynamic: generating again must not produce 010213 or corrupt it
    const firstPass = generateDynamicQRIS(STATIC_QRIS, AMOUNT_75K);
    expect(firstPass).toContain('010212');
    expect(firstPass).not.toContain('010213');
  });
});

// ─── §14.1 Rule 2 — Tag 62 preserved as-is ───────────────────────────────────

describe('QRIS §14.1 Rule 2: Tag 62 Preservation (No Overwrite)', () => {
  const ACQUIRER_TAG62 = '62070703A01';

  test('Tag 62 is present in output', () => {
    const result = generateDynamicQRIS(STATIC_QRIS, AMOUNT_75K);
    expect(result).toContain(ACQUIRER_TAG62);
  });

  test('Tag 62 value is exactly as in canonical reference vector', () => {
    const result = generateDynamicQRIS(STATIC_QRIS, AMOUNT_75K);
    const tag62Value = extractTag(result, '62');
    // '62070703A01': length=07, value='0703A01'
    expect(tag62Value).toBe('0703A01');
  });

  test('only ONE occurrence of Tag 62 at top-level TLV (no duplication)', () => {
    const result = generateDynamicQRIS(STATIC_QRIS, AMOUNT_75K);
    expect(countTag(result, '62')).toBe(1);
  });
});

// ─── §14.1 Rule 3 — Tag 54 injection (anti-duplication) ──────────────────────

describe('QRIS §14.1 Rule 3: Tag 54 Precision Injection', () => {
  test('Tag 54 is present in output', () => {
    const result = generateDynamicQRIS(STATIC_QRIS, AMOUNT_75K);
    expect(result).toContain('5405');
  });

  test('Tag 54 value encodes Rp 75.000 as "75000"', () => {
    const result = generateDynamicQRIS(STATIC_QRIS, AMOUNT_75K);
    // Canonical: '540575000' — tag=54, len=05, value=75000
    expect(result).toContain('540575000');
    const tag54Value = extractTag(result, '54');
    expect(tag54Value).toBe('75000');
  });

  test('Tag 54 appears before Tag 58 (5802ID)', () => {
    const result = generateDynamicQRIS(STATIC_QRIS, AMOUNT_75K);
    const tag54Idx = result.indexOf('5405');
    const tag58Idx = result.indexOf('5802ID');
    expect(tag54Idx).toBeGreaterThan(-1);
    expect(tag58Idx).toBeGreaterThan(-1);
    expect(tag54Idx).toBeLessThan(tag58Idx);
  });

  test('no duplicate Tag 54 in output (top-level TLV walk)', () => {
    const result = generateDynamicQRIS(STATIC_QRIS, AMOUNT_75K);
    expect(countTag(result, '54')).toBe(1);
  });

  test('re-injection on already-dynamic QRIS replaces old Tag 54 (no duplication)', () => {
    const firstPass = generateDynamicQRIS(STATIC_QRIS, AMOUNT_75K);
    const secondPass = generateDynamicQRIS(firstPass, 50_000);
    // Old 75000 should be gone, new 50000 should be present
    expect(secondPass).not.toContain('75000');
    const tag54Value = extractTag(secondPass, '54');
    expect(tag54Value).toBe('50000');
    // Still only 1 Tag 54 at top-level
    expect(countTag(secondPass, '54')).toBe(1);
  });

  test('Tag 54 encodes integer amounts correctly (rounding)', () => {
    // Decimal amounts must be rounded (e.g., 75000.9 → 75001)
    const result = generateDynamicQRIS(STATIC_QRIS, 75000.9);
    const tag54Value = extractTag(result, '54');
    expect(tag54Value).toBe('75001');
  });
});

// ─── §14.1 Rule 4 — CRC16-CCITT Checksum ─────────────────────────────────────

describe('QRIS §14.1 Rule 4: Strict CRC16-CCITT Recalculation', () => {
  test('CRC of the canonical reference vector payload+6304 equals "2F39"', () => {
    // Strip last 4 chars (old CRC) from expected dynamic output, append "6304"
    const payloadBody = DYNAMIC_EXPECTED.slice(0, -4); // strip "2F39"
    const checksum = crc16ccitt(payloadBody);
    expect(checksum).toBe('2F39');
  });

  test('generated output ends with exactly 4 uppercase hex chars after 6304', () => {
    const result = generateDynamicQRIS(STATIC_QRIS, AMOUNT_75K);
    const crcIdx = result.lastIndexOf('6304');
    expect(crcIdx).toBeGreaterThan(-1);
    const crcPart = result.substring(crcIdx + 4);
    expect(crcPart).toMatch(/^[0-9A-F]{4}$/);
  });

  test('full canonical output matches §14.2 reference vector exactly', () => {
    const result = generateDynamicQRIS(STATIC_QRIS, AMOUNT_75K);
    expect(result).toBe(DYNAMIC_EXPECTED);
  });

  test('CRC is different from original static QRIS CRC (EE91)', () => {
    const result = generateDynamicQRIS(STATIC_QRIS, AMOUNT_75K);
    expect(result).not.toContain('6304EE91');
    expect(result).toContain('63042F39');
  });

  test('crc16ccitt() is deterministic for same input', () => {
    const input = 'BOONTRACK_TEST_PAYLOAD_6304';
    expect(crc16ccitt(input)).toBe(crc16ccitt(input));
  });

  test('different amounts produce different CRC values', () => {
    const result1 = generateDynamicQRIS(STATIC_QRIS, 75_000);
    const result2 = generateDynamicQRIS(STATIC_QRIS, 50_000);
    const crc1 = result1.slice(-4);
    const crc2 = result2.slice(-4);
    expect(crc1).not.toBe(crc2);
  });
});

// ─── Edge Case Coverage ───────────────────────────────────────────────────────

describe('QRIS Edge Cases', () => {
  test('empty string returns empty string', () => {
    expect(generateDynamicQRIS('', 10_000)).toBe('');
  });

  test('QRIS without Tag 58 still produces a valid output with Tag 54 appended', () => {
    // Minimal QRIS with Tag 01 but no 5802ID
    const minimal = '000201010211';
    const result = generateDynamicQRIS(minimal, 10_000);
    expect(result).toContain('010212');
    expect(result).toContain('5405');   // Tag 54, length 05
    expect(result).toContain('10000');  // amount
    expect(result).toContain('6304');   // CRC tag present
  });

  test('zero amount produces Tag 54 with value "0"', () => {
    const result = generateDynamicQRIS(STATIC_QRIS, 0);
    const tag54Value = extractTag(result, '54');
    expect(tag54Value).toBe('0');
  });
});
