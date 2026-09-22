import { generateDynamicQRIS } from '../lib/qris-dynamic.ts';

const rawBuzzerUkm = '00020101021126570011ID.DANA.WWW011893600915301037927702090103792770303UMI51440014ID.CO.QRIS.WWW0215ID10264976465090303UMI5204729853033605802ID5910Buzzer UKM6012Kota Bandung61054027563045E24';
const baseAmount = 100000;
const uniqueCode = 825;
const downwardAmount = baseAmount - uniqueCode; // 99175

const dynamicQris = generateDynamicQRIS(rawBuzzerUkm, downwardAmount);
console.log('Generated Dynamic QRIS in TS:');
console.log(dynamicQris);

console.log('\n--- 4 Rules Verification ---');
console.log('Rule 1: Starts with Dynamic Tag 01 (000201010212):', dynamicQris.startsWith('000201010212'));
console.log('Rule 2: Tag 62 NOT injected with invoice:', !dynamicQris.includes('INV-'));
console.log('Rule 3: Tag 54 (540599175) before 5802ID:', dynamicQris.includes('5405991755802ID'));
console.log('Rule 4: Recalculated CRC16-CCITT Tag 63 at end:', dynamicQris.endsWith('6304ED63'));

if (dynamicQris.startsWith('000201010212') && !dynamicQris.includes('INV-') && dynamicQris.includes('5405991755802ID') && dynamicQris.endsWith('6304ED63')) {
  console.log('\nALL 4 RULES VERIFIED 100% IN TYPESCRIPT!');
} else {
  console.error('\nVERIFICATION FAILED!');
  process.exit(1);
}
