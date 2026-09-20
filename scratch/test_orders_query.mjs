import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envLocal = fs.readFileSync('C:/boontrack-inbox/.env.local', 'utf8');
const supabaseUrl = envLocal.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1].trim();
const serviceRoleKey = envLocal.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)[1].trim();

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function run() {
  console.log('Testing Supabase Service Role queries:');
  for (const tenant of ['hellohijau', 'buzzerukm']) {
    const { data, error, count } = await supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .eq('tenant_slug', tenant)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error(`Error for ${tenant}:`, error);
    } else {
      console.log(`\nTenant: ${tenant} (Total Orders: ${count})`);
      data.forEach(o => {
        console.log(`- Order: ${o.id} | Amount: Rp ${o.gross_amount} | Status: ${o.status} | Customer: ${o.customer_name} | Updated: ${o.updated_at || o.created_at}`);
      });
    }
  }
}

run();
