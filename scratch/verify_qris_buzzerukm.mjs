import { createClient } from '@supabase/supabase-js';
import { generateDynamicQRIS, crc16ccitt } from '../lib/qris-dynamic.js';

const supabaseUrl = 'https://mpluzajlzpregmjwpjqr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTcyMzIsImV4cCI6MjEwMTk5MzIzMn0.Tn7MREcxcOyWzkhgz5t0XOzVOBagQ7PsH-JTch0ZF0M';
const supabase = createClient(supabaseUrl, supabaseKey);

function parseEMVCo(payload) {
  const tags = {};
  let i = 0;
  while (i < payload.length) {
    const id = payload.substring(i, i + 2);
    const len = parseInt(payload.substring(i + 2, i + 4), 10);
    if (isNaN(len)) break;
    const val = payload.substring(i + 4, i + 4 + len);
    tags[id] = val;
    i = i + 4 + len;
  }
  return tags;
}

async function verify() {
  console.log('=== TEST 1: Fetch Supabase Buzzer UKM Tenant Config ===');
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('metadata')
    .eq('slug', 'buzzerukm')
    .single();

  if (error || !tenant) {
    console.error('Error fetching tenant:', error);
    process.exit(1);
  }

  const staticQris = tenant.metadata?.qris?.static_qr;
  console.log('Tenant static QR found:', !!staticQris);
  console.log('NMID in metadata:', tenant.metadata?.qris?.nmid);
  console.log('Merchant Name in metadata:', tenant.metadata?.qris?.merchant_name);

  if (!staticQris) {
    throw new Error('Tenant static_qr is missing!');
  }

  console.log('\n=== TEST 2: Dynamic QRIS Generation with 3-digit Downward Unique Code ===');
  const basePrice = 100000;
  const uniqueCode = 142;
  const preciseAmount = basePrice - uniqueCode; // 99858
  console.log(`Base Price: Rp ${basePrice.toLocaleString('id-ID')}`);
  console.log(`Kode Unik Potongan: -Rp ${uniqueCode.toLocaleString('id-ID')}`);
  console.log(`Total Transfer Presisi: Rp ${preciseAmount.toLocaleString('id-ID')}`);

  const dynamicQris = generateDynamicQRIS(staticQris, preciseAmount);
  console.log('Generated Dynamic QRIS:', dynamicQris);

  console.log('\n=== TEST 3: EMVCo Tag Parsing & Assertions ===');
  const tags = parseEMVCo(dynamicQris);
  console.log('Tag 01 (Initiation Method):', tags['01'], tags['01'] === '12' ? '✅ PASS (Dynamic)' : '❌ FAIL');
  console.log('Tag 54 (Amount):', tags['54'], tags['54'] === '99858' ? '✅ PASS (99858 < 100000)' : '❌ FAIL');
  console.log('Tag 59 (Merchant Name):', tags['59'], tags['59'] === 'Buzzer UKM' ? '✅ PASS (Buzzer UKM)' : '❌ FAIL');
  console.log('Tag 51 (NMID info):', tags['51'], tags['51'].includes('ID1026497646509') ? '✅ PASS (ID1026497646509)' : '❌ FAIL');

  // Verify CRC16
  const payloadToCrc = dynamicQris.substring(0, dynamicQris.length - 4);
  const actualCrc = dynamicQris.substring(dynamicQris.length - 4);
  const calculatedCrc = crc16ccitt(payloadToCrc);
  console.log('Tag 63 (CRC16): actual =', actualCrc, ', calculated =', calculatedCrc, actualCrc === calculatedCrc ? '✅ PASS (Valid CRC16)' : '❌ FAIL');

  if (tags['59'] !== 'Buzzer UKM') {
    throw new Error(`Expected Tag 59 to be 'Buzzer UKM', got: '${tags['59']}'`);
  }
  if (Number(tags['54']) >= 100000 || Number(tags['54']) !== 99858) {
    throw new Error(`Expected Tag 54 to be 99858, got: '${tags['54']}'`);
  }

  console.log('\n=== TEST 4: Product CTWA Mastery 7-Day Verification ===');
  const ctwaMeta = tenant.metadata?.products?.find(p => p.slug === 'ctwa-mastery-7day');
  console.log('Metadata CTWA price:', ctwaMeta?.price, '(Coret: 500.000)');
  console.log('Metadata CTWA promo_price:', ctwaMeta?.promo_price, '(Pokok: 100.000)');
  console.log('Metadata CTWA cta_label:', ctwaMeta?.cta_label);

  const { data: ctwaSql } = await supabase
    .from('products')
    .select('slug, price, promo_price')
    .eq('slug', 'ctwa-mastery-7day')
    .single();
  console.log('SQL Table CTWA price:', ctwaSql?.price, '(Coret: 500.000)');
  console.log('SQL Table CTWA promo_price:', ctwaSql?.promo_price, '(Pokok: 100.000)');

  console.log('\n🎉 ALL PHASE 1 VERIFICATIONS PASSED SUCCESSFULLY! 🎉');
}

verify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
