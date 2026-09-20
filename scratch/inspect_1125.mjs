import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('C:/boontrack-inbox/.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)?.[1]?.trim() || env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1].trim();
const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

async function check() {
  console.log('=== 1. CEK ORDER Rp 1.125 ===');
  const { data: o, error: err } = await supabase
    .from('orders')
    .select('id, tenant_slug, gross_amount, status, payment_status, order_status, updated_at, created_at')
    .eq('gross_amount', 1125);
  console.log('Order 1125:', o);
  if (err) console.error('Order query error:', err);

  console.log('\n=== 2. CEK 5 ORDER TERAKHIR SEMUA TENANT ===');
  const { data: recentOrders } = await supabase
    .from('orders')
    .select('id, tenant_slug, gross_amount, status, payment_status, order_status, updated_at, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('Recent orders:', recentOrders);

  console.log('\n=== 3. CEK LOG MUTASI TERAKHIR DI DB (jika ada) ===');
  try {
    const { data: notifs, error: errNotif } = await supabase
      .from('reader_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2);
    console.log('Recent reader_notifications:', notifs, errNotif || '');
  } catch (e) {
    console.log('reader_notifications table not present or error:', e.message);
  }
}
check();
