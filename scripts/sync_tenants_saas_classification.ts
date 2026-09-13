import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Parse .env.local if present
try {
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
} catch { }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTcyMzIsImV4cCI6MjEwMTk5MzIzMn0.Tn7MREcxcOyWzkhgz5t0XOzVOBagQ7PsH-JTch0ZF0M';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Classify dynamically based on workspace properties
function classifyTenant(t: any): { is_saas: boolean; workspace_type: 'saas_shop' | 'internal' } {
  const slug = (t.slug || '').toLowerCase();
  const name = (t.name || '').toLowerCase();
  const meta = t.metadata || {};

  // Check if explicitly marked
  if (meta.is_saas === true) return { is_saas: true, workspace_type: 'saas_shop' };
  if (meta.is_saas === false || meta.is_internal === true) return { is_saas: false, workspace_type: 'internal' };

  // Exclude internal platform, holding, demo, sandbox, dummy, test
  const isInternal =
    slug.includes('holding') ||
    slug.includes('sandbox') ||
    slug.includes('dummy') ||
    slug.startsWith('test-') ||
    slug.includes('demo') ||
    slug.includes('career') ||
    slug.includes('loker') ||
    slug.includes('digicorn') ||
    slug.includes('bola') ||
    slug.includes('kurir') ||
    slug.includes('pelayanan-publik') ||
    name.includes('holding') ||
    name.includes('sandbox') ||
    name.includes('dummy') ||
    name.includes('demo store') ||
    name.includes('toko uji') ||
    t.status === 'expired';

  if (isInternal) {
    return { is_saas: false, workspace_type: 'internal' };
  }

  return { is_saas: true, workspace_type: 'saas_shop' };
}

async function main() {
  console.log('🔄 Syncing SaaS Shop vs Internal Platform classifications in Supabase...');

  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, slug, name, metadata, status');

  if (error || !tenants) {
    console.error('Failed to query tenants:', error);
    return;
  }

  let updatedCount = 0;

  for (const t of tenants) {
    const classification = classifyTenant(t);
    const existingMeta = t.metadata || {};

    const needsUpdate =
      existingMeta.is_saas !== classification.is_saas ||
      existingMeta.workspace_type !== classification.workspace_type;

    if (needsUpdate) {
      const updatedMeta = {
        ...existingMeta,
        is_saas: classification.is_saas,
        workspace_type: classification.workspace_type,
        is_internal: !classification.is_saas,
      };

      const { error: updateErr } = await supabase
        .from('tenants')
        .update({ metadata: updatedMeta })
        .eq('id', t.id);

      if (updateErr) {
        console.error(`❌ Failed to update ${t.slug}:`, updateErr);
      } else {
        console.log(`✅ [${classification.is_saas ? 'SAAS SHOP' : 'INTERNAL'}] ${t.slug} (${t.name})`);
        updatedCount++;
      }
    } else {
      console.log(`⚡ [ALREADY SYNCED] ${t.slug} (${classification.is_saas ? 'SAAS SHOP' : 'INTERNAL'})`);
    }
  }

  console.log(`\n🎉 Sync complete. Updated ${updatedCount} tenants in Supabase.`);
}

main();
