/**
 * One-off script: Update Kang Sakti's affiliate email in Supabase
 * Target: referral_code = 'buzzerukm' -> email = 'buzzerukm@gmail.com'
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Auto-load .env.local and .env
const loadEnv = (filePath: string) => {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    content.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const k = trimmed.slice(0, eqIdx).trim();
          let v = trimmed.slice(eqIdx + 1).trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (!process.env[k]) {
            process.env[k] = v;
          }
        }
      }
    });
  }
};

loadEnv(path.resolve(__dirname, '../.env.local'));
loadEnv(path.resolve(__dirname, '../.env'));
loadEnv(path.resolve(__dirname, '../.env.production'));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTcyMzIsImV4cCI6MjEwMTk5MzIzMn0.Tn7MREcxcOyWzkhgz5t0XOzVOBagQ7PsH-JTch0ZF0M';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

async function main() {
  console.log('====================================================');
  console.log('🔍 FETCHING AFFILIATE RECORD FOR BUZZERUKM / SAKTI');
  console.log('====================================================');

  // Query by referral_code or name or phone
  const { data: records, error: fetchErr } = await supabase
    .from('affiliates')
    .select('*')
    .or('referral_code.eq.buzzerukm,name.ilike.%Sakti Alamsyah%');

  if (fetchErr) {
    console.error('❌ Error querying affiliates table:', fetchErr);
    process.exit(1);
  }

  if (!records || records.length === 0) {
    console.error('❌ No affiliate record found matching referral_code = "buzzerukm"');
    process.exit(1);
  }

  console.log(`Found ${records.length} record(s):`);
  records.forEach((rec, idx) => {
    console.log(`\n[Record ${idx + 1}]`);
    console.log(`ID            : ${rec.id}`);
    console.log(`Name          : ${rec.name}`);
    console.log(`Referral Code : ${rec.referral_code}`);
    console.log(`Current Email : ${rec.email || '(empty / null)'}`);
    console.log(`Phone         : ${rec.phone || rec.phone_number || '-'}`);
    console.log(`Role          : ${rec.role || '-'}`);
    console.log(`Tier          : ${rec.tier || '-'}`);
  });

  const targetAffiliate = records[0];
  const newEmail = 'buzzerukm@gmail.com';

  console.log('\n----------------------------------------------------');
  console.log(`🔄 UPDATING EMAIL TO: ${newEmail}`);
  console.log('----------------------------------------------------');

  // Update email column and metadata.email if metadata exists
  const updatedMetadata = {
    ...(targetAffiliate.metadata || {}),
    email: newEmail,
  };

  const { data: updatedRecord, error: updateErr } = await supabase
    .from('affiliates')
    .update({
      email: newEmail,
      metadata: updatedMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetAffiliate.id)
    .select('*')
    .single();

  if (updateErr) {
    console.error('❌ Error updating affiliate record:', updateErr);
    process.exit(1);
  }

  console.log('====================================================');
  console.log('✅ AFFILIATE EMAIL SUCCESSFULLY UPDATED!');
  console.log('====================================================');
  console.log('ID            :', updatedRecord.id);
  console.log('Name          :', updatedRecord.name);
  console.log('Referral Code :', updatedRecord.referral_code);
  console.log('Updated Email :', updatedRecord.email);
  console.log('Metadata Email:', updatedRecord.metadata?.email);
  console.log('Phone         :', updatedRecord.phone || updatedRecord.phone_number);
  console.log('Updated At    :', updatedRecord.updated_at);
  console.log('Full Row Data :');
  console.log(JSON.stringify(updatedRecord, null, 2));
  console.log('====================================================');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
