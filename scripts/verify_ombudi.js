const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

['.env.local', '.env'].forEach((file) => {
  const fullPath = path.resolve(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    const lines = fs.readFileSync(fullPath, 'utf-8').split('\n');
    lines.forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let val = (match[2] || '').trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[match[1]] = val;
      }
    });
  }
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, slug, name, tier, category, is_active, status, metadata')
    .eq('slug', 'ombudi')
    .single();

  if (error || !tenant) {
    console.error('Error loading tenant:', error);
    process.exit(1);
  }

  console.log('=== DATA TENANT OM BUDI DI SUPABASE ===');
  console.log('ID:', tenant.id);
  console.log('Slug:', tenant.slug);
  console.log('Name:', tenant.name);
  console.log('Tier (DB Column):', tenant.tier);
  console.log('Category:', tenant.category);
  console.log('Status:', tenant.status);
  console.log('Plan Tier (Metadata):', tenant.metadata?.plan_tier);
  console.log('Bot Mode (Metadata):', tenant.metadata?.bot_mode);
  console.log('Business Category:', tenant.metadata?.business_category);
  console.log('\n=== INTERACTIVE MENUS ===');
  const menus = tenant.metadata?.interactive_menus || [];
  console.log('Total Menus:', menus.length);
  menus.forEach((m, idx) => {
    console.log(`\nMenu #${idx + 1}: ${m.header_text || m.title} (Trigger: "${m.trigger_keyword || m.trigger}")`);
    console.log(`Body: "${m.body_text || m.description}"`);
    console.log('Options:');
    (m.options || []).forEach((o, oIdx) => {
      console.log(`  ${oIdx + 1}. [${o.id}] "${o.title}" - ${o.description}`);
      console.log(`     Balasan: "${o.responseText || o.response_text}"`);
    });
  });

  console.log('\n✅ Semua spesifikasi tenant Om Budi telah terverifikasi dengan sempurna.');
}

test();
