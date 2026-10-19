import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Parse .env.local
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  const lines = fs.readFileSync(envLocalPath, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let val = (match[2] || '').trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runVerification() {
  console.log('[1/2] Testing Anon public client querying tenant_booking_slots via PostgREST...');
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: publicSlots, error: publicErr } = await anonClient
    .from('tenant_booking_slots')
    .select('id, slot_name, max_quota, is_active')
    .eq('tenant_id', '70c1ea8c-3557-44af-b131-faae75a8b17f')
    .eq('is_active', true);

  if (publicErr) {
    console.error('Anon query error:', publicErr);
  } else {
    console.log(`[OK] Anon query returned ${publicSlots.length} active slots:`);
    publicSlots.forEach(s => {
      console.log(`   * ${s.slot_name} (max: ${s.max_quota})`);
    });
  }

  console.log('\n[2/2] Testing Service Role client reading tenant logistics metadata...');
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: tenant, error: adminErr } = await adminClient
    .from('tenants')
    .select('id, slug, name, metadata')
    .eq('id', '70c1ea8c-3557-44af-b131-faae75a8b17f')
    .single();

  if (adminErr) {
    console.error('Admin query error:', adminErr);
  } else {
    console.log(`[OK] Tenant ${tenant.name} (${tenant.slug}) logistics config:`);
    console.log(JSON.stringify(tenant.metadata?.logistics, null, 2));
  }
}

runVerification().catch(console.error);
