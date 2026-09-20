import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { generateDynamicQRIS, crc16ccitt } from '../lib/qris-dynamic.ts';

const env = fs.readFileSync('c:/boontrack-inbox/.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)[1].trim();
const supabase = createClient(url, key);

async function main() {
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, slug, name, metadata')
    .eq('slug', 'hellohijau')
    .single();

  if (error || !tenant) {
    console.error('Error fetching tenant:', error);
    process.exit(1);
  }

  const staticPayload = tenant.metadata?.qris_payload;
  console.log('1. Tenant:', tenant.name, `[${tenant.slug}]`);
  console.log('2. Static QRIS Payload in Supabase:', staticPayload);

  const testNominal = 1615;
  const dynamicPayload = generateDynamicQRIS(staticPayload, testNominal);

  console.log('\n3. Generated Dynamic QRIS:');
  console.log(dynamicPayload);

  const isDynamic = dynamicPayload.includes('010212');
  const hasAmount = dynamicPayload.includes('54041615');
  const hasID = dynamicPayload.includes('5802ID');
  const hasCurrency = dynamicPayload.includes('5303360');
  const crcEmbedded = dynamicPayload.slice(-4);
  const crcCalculated = crc16ccitt(dynamicPayload.slice(0, -4));
  const isCrcValid = crcEmbedded === crcCalculated;

  console.log('\n=== VERIFICATION RESULTS ===');
  console.log('Tag 01 = 12 (Dynamic)      :', isDynamic ? 'PASS ✅' : 'FAIL ❌');
  console.log('Tag 54 = 1615 (Amount)     :', hasAmount ? 'PASS ✅' : 'FAIL ❌');
  console.log('Tag 58 = ID (Country)      :', hasID ? 'PASS ✅' : 'FAIL ❌');
  console.log('Tag 53 = 360 (IDR Currency):', hasCurrency ? 'PASS ✅' : 'FAIL ❌');
  console.log(`Tag 63 = ${crcEmbedded} (CRC16)     :`, isCrcValid ? 'PASS ✅' : 'FAIL ❌');

  if (isDynamic && hasAmount && hasID && hasCurrency && isCrcValid) {
    console.log('\n>>> SEMUA KRITERIA QRIS DINAMIS EMVCO BERHASIL TERPENUHI DENGAN SEMPURNA! <<<');
  } else {
    process.exit(1);
  }
}

main();
