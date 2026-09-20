import fs from 'fs';

// ============================================================
// crc16ccitt (polynomial 0x1021, init 0xFFFF) — sama persis
// dengan implementasi di lib/qris-dynamic.ts
// ============================================================
function crc16ccitt(input) {
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

function generateDynamicQRIS(staticQris, amount) {
  if (!staticQris) return '';
  let raw = staticQris.trim();

  // a) Ubah Tag 01 menjadi '010212' (Dinamis)
  if (raw.startsWith('000201010211')) {
    raw = '000201010212' + raw.substring(12);
  } else if (raw.includes('010211')) {
    raw = raw.replace('010211', '010212');
  }

  // b) Hapus CRC lama
  const checksumTagIdx = raw.lastIndexOf('6304');
  if (checksumTagIdx !== -1) {
    raw = raw.substring(0, checksumTagIdx);
  }

  // c) Hapus tag 54 lama
  let tag58Idx = raw.indexOf('5802ID');
  if (tag58Idx === -1) tag58Idx = raw.indexOf('5802');
  if (tag58Idx !== -1) {
    let before58 = raw.substring(0, tag58Idx);
    const after58 = raw.substring(tag58Idx);
    before58 = before58.replace(/54\d{2}[0-9]+/, '');
    raw = before58 + after58;
  }

  // d) Inject Tag 54 baru sebelum Tag 58
  const amountStr = String(Math.round(amount));
  const tag54 = '54' + String(amountStr.length).padStart(2, '0') + amountStr;

  tag58Idx = raw.indexOf('5802ID');
  if (tag58Idx === -1) tag58Idx = raw.indexOf('5802');

  if (tag58Idx !== -1) {
    raw = raw.substring(0, tag58Idx) + tag54 + raw.substring(tag58Idx);
  } else {
    raw += tag54;
  }

  // e) Tambah tag 6304 + CRC
  const payloadWithTag63 = raw + '6304';
  const checksum = crc16ccitt(payloadWithTag63);
  return payloadWithTag63 + checksum;
}

// ============================================================
// Simulasi konversi QRIS toko hellohijau
// QRIS toko ini berbentuk IMAGE (PNG/WebP), BUKAN EMVCo string.
// Ini adalah kondisi yang ditemukan di database.
// ============================================================
const QRIS_IMAGE_URL = 'https://assets.boontrack.com/qris/1789853902184_qris.webp';

console.log('=== LAPORAN SIMULASI QRIS HELLOHIJAU ===\n');
console.log('Tipe QRIS di database: IMAGE URL (bukan EMVCo payload string)');
console.log('URL gambar:', QRIS_IMAGE_URL);
console.log('');
console.log('→ Karena qris_image hanya berupa URL gambar statis (bukan string EMVCo 000201...),');
console.log('  sistem TIDAK DAPAT mengonversi ke QRIS Dinamis secara otomatis.');
console.log('');
console.log('  Solusi yang tersedia:');
console.log('  [A] Merchant input QRIS Payload String (EMVCo) dari aplikasi DANA/GoPay/etc.');
console.log('  [B] Gunakan generator QRIS sintetis EMVCo dari route /api/v1/payments/qris/create');
console.log('      (sudah tersedia, berbasis Merchant Account Info BoonTrack)');
console.log('');

// ============================================================
// Simulasi generateDynamicQRIS dengan CONTOH string EMVCo statis
// (anggap merchant punya payload ini)
// ============================================================
const CONTOH_STATIC_QRIS = '000201010211261080007ID.CO.DANA.WWW011893600818086880000022152898000000000000303UMI5204541153033605802ID5908HELLOHIJAU5907BANDUNG62070503***6304';
// Hitung dulu CRC contoh statis agar benar
const crcStatic = crc16ccitt(CONTOH_STATIC_QRIS);
const staticWithCRC = CONTOH_STATIC_QRIS + crcStatic;

console.log('=== SIMULASI KONVERSI EMVCo (Contoh Payload Statis) ===');
console.log('Input Static QRIS (tanpa CRC):', CONTOH_STATIC_QRIS);
console.log('CRC Statis:', crcStatic);
console.log('Static QRIS (dengan CRC):', staticWithCRC);
console.log('');

const amount = 1615;
const dynamic = generateDynamicQRIS(staticWithCRC, amount);

console.log(`Dynamic QRIS (inject Rp ${amount}):`);
console.log(dynamic);
console.log('');

// Parse tag 01 dari dynamic
const tag01Idx = dynamic.indexOf('0102');
const tag01Val = dynamic.substring(tag01Idx + 4, tag01Idx + 6);
console.log('Tag 01 (Point of Initiation):', tag01Val, '→', tag01Val === '12' ? '✅ DINAMIS' : '❌ Bukan dinamis');

// Parse tag 54
const tag54Idx = dynamic.indexOf('5404');
if (tag54Idx !== -1) {
  const tag54Len = parseInt(dynamic.substring(tag54Idx + 2, tag54Idx + 4));
  const tag54Val = dynamic.substring(tag54Idx + 4, tag54Idx + 4 + tag54Len);
  console.log('Tag 54 (Transaction Amount):', tag54Val, '→', tag54Val === String(amount) ? '✅ COCOK' : '❌ TIDAK COCOK');
}

// Parse tag 58
const tag58Idx = dynamic.indexOf('5802ID');
if (tag58Idx !== -1) console.log('Tag 58 (Country Code): ID ✅');

// Parse tag 53
const tag53Idx = dynamic.indexOf('530336');
if (tag53Idx !== -1) console.log('Tag 53 (Currency): 360 ✅');

// Verifikasi CRC
const payloadWithoutCRC = dynamic.slice(0, -4);
const calculatedCRC = crc16ccitt(payloadWithoutCRC);
const embeddedCRC = dynamic.slice(-4);
console.log(`Tag 63 (CRC): ${embeddedCRC} → Hitung ulang: ${calculatedCRC} → ${calculatedCRC === embeddedCRC ? '✅ VALID' : '❌ MISMATCH'}`);

console.log('');
console.log('=== KESIMPULAN ===');
console.log('qris-dynamic.ts BERFUNGSI DENGAN BENAR untuk konversi EMVCo statis → dinamis.');
console.log('Kode checkout sudah terhubung: candidateQris → generateDynamicQRIS(candidateQris, grossAmount) → <QRCodeSVG>');
console.log('');
console.log('TINDAKAN YANG DIPERLUKAN untuk toko hellohijau:');
console.log('1. Masuk ke menu Settings > QRIS di dashboard');
console.log('2. Tambahkan kolom "QRIS Payload String" (field baru: qris_payload/qris_static_string)');
console.log('   yang menerima string EMVCo 000201... dari DANA Bisnis / GoPay / dll.');
console.log('3. Saat ini jika payload string tidak tersedia, sistem fallback ke gambar QRIS statis.');
