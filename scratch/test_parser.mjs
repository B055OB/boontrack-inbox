import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envLocal = fs.readFileSync('.env.local', 'utf8');
const supabaseUrl = envLocal.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1].trim();
const serviceRoleKey = envLocal.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)[1].trim();

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function run() {
  const { data: orderBefore } = await supabase
    .from('orders')
    .select('id, status, gross_amount, customer_name, tenant_slug')
    .eq('id', 'ORD-1789861642409-7947')
    .single();

  console.log('Target Order:', orderBefore);

  const sampleNotifications = [
    'Pembayaran Masuk - Rp1.281 diterima DANA Bisnis.',
    'DANA Bisnis: Kamu menerima pembayaran sebesar Rp1.281 dari Pelanggan',
    'DANA Bisnis: Pembayaran QRIS diterima Rp 1.281',
    'Kamu telah menerima pembayaran Rp 1.281 via QRIS',
    'Pembayaran sebesar Rp 1.281,00 sukses',
  ];

  const rpRegex = /(?:rp\.?|idr)\s*([\d.,]+)/i;

  for (const text of sampleNotifications) {
    const match = text.match(rpRegex);
    let numStr = match ? match[1].trim() : '';
    numStr = numStr.replace(/[.,]+$/, '').replace(/[,.]-$/, '').replace(/[,.]00$/, '');
    const cleanDigits = numStr.replace(/\D/g, '');
    const parsed = parseInt(cleanDigits, 10);
    console.log(`Text: "${text}" => Parsed: ${parsed} (Matches order: ${parsed === Number(orderBefore.gross_amount)})`);
  }
}

run();
