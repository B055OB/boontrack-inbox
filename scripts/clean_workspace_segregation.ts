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
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTcyMzIsImV4cCI6MjEwMTk5MzIzMn0.Tn7MREcxcOyWzkhgz5t0XOzVOBagQ7PsH-JTch0ZF0M';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface SegregationRule {
  is_saas: boolean;
  workspace_type: 'CUSTOM_APP' | 'B2G' | 'INTERNAL' | 'SAAS_SHOP';
  tenant_kind: 'CUSTOM_APP' | 'INTERNAL' | 'SAAS_SHOP';
  is_internal?: boolean;
}

function determineClassification(slug: string, name: string): SegregationRule | null {
  const s = slug.toLowerCase().trim();
  const n = name.toLowerCase().trim();

  // 1. Custom App & B2B: atmosfitnes, om-budi / ombudi, bale-pananggeuhan
  if (s === 'atmosfitnes' || s.includes('atmosfit') || n.includes('atmos fitness') || n.includes('atmos gym')) {
    return { is_saas: false, workspace_type: 'CUSTOM_APP', tenant_kind: 'CUSTOM_APP', is_internal: false };
  }
  if (s === 'om-budi' || s === 'ombudi' || n.includes('om budi') || n.includes('mood booster')) {
    return { is_saas: false, workspace_type: 'CUSTOM_APP', tenant_kind: 'CUSTOM_APP', is_internal: false };
  }
  if (s === 'bale-pananggeuhan' || s.includes('pananggeuhan') || n.includes('bale pananggeuhan')) {
    return { is_saas: false, workspace_type: 'CUSTOM_APP', tenant_kind: 'CUSTOM_APP', is_internal: false };
  }

  // 2. B2G & Civic Tech: pelayanan_publik / pelayanan-publik
  if (s === 'pelayanan_publik' || s === 'pelayanan-publik' || s.includes('pelayanan') || n.includes('pelayanan publik')) {
    return { is_saas: false, workspace_type: 'B2G', tenant_kind: 'CUSTOM_APP', is_internal: false };
  }

  // 3. Internal & Edge Platform: holding, infoloker, career, digicorn
  if (
    s === 'holding' || s.includes('holding') ||
    s === 'infoloker' || s.includes('infoloker') || s.includes('loker') ||
    s === 'career' || s.includes('career') ||
    s === 'digicorn' || s.includes('digicorn') ||
    s.includes('sandbox') || s.includes('dummy') || s.startsWith('test-') ||
    s.includes('demo') || s.includes('bola') || s.includes('kurir') ||
    n.includes('holding') || n.includes('sandbox') || n.includes('dummy') || n.includes('demo store')
  ) {
    return { is_saas: false, workspace_type: 'INTERNAL', tenant_kind: 'INTERNAL', is_internal: true };
  }

  // 4. SaaS Shops: growth, growthplus, proscale, onlineboost, kurastorenkrw, buatinvideo, toko-berkah, nyka, cornvest, suhu-ads
  const knownShops = [
    'growth', 'growthplus', 'proscale', 'onlineboost', 'kurastorenkrw',
    'buatinvideo', 'toko-berkah', 'nyka', 'cornvest', 'suhu-ads'
  ];
  if (knownShops.includes(s) || knownShops.some(k => s.includes(k))) {
    return { is_saas: true, workspace_type: 'SAAS_SHOP', tenant_kind: 'SAAS_SHOP', is_internal: false };
  }

  return null;
}

async function main() {
  console.log('🔄 Cleaning & Segregating Workspaces vs SaaS Shops in Supabase...\n');

  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, slug, name, metadata, status');

  if (error || !tenants) {
    console.error('❌ Failed to query tenants:', error);
    return;
  }

  let updatedCount = 0;

  for (const t of tenants) {
    const slug = t.slug || '';
    const name = t.name || '';
    const rule = determineClassification(slug, name);

    if (!rule) {
      console.log(`⚠️  [UNMATCHED / UNTOUCHED] ${slug} (${name})`);
      continue;
    }

    const currentMeta = t.metadata || {};
    const needsUpdate =
      currentMeta.is_saas !== rule.is_saas ||
      currentMeta.workspace_type !== rule.workspace_type ||
      currentMeta.tenant_kind !== rule.tenant_kind ||
      currentMeta.is_internal !== rule.is_internal;

    if (needsUpdate) {
      const newMeta = {
        ...currentMeta,
        is_saas: rule.is_saas,
        workspace_type: rule.workspace_type,
        tenant_kind: rule.tenant_kind,
        is_internal: rule.is_internal,
      };

      const { error: updateErr } = await supabase
        .from('tenants')
        .update({ metadata: newMeta })
        .eq('id', t.id);

      if (updateErr) {
        console.error(`❌ Failed to update ${slug}:`, updateErr);
      } else {
        console.log(`✅ [UPDATED] ${slug.padEnd(20)} -> is_saas: ${rule.is_saas}, type: ${rule.workspace_type}, kind: ${rule.tenant_kind}`);
        updatedCount++;
      }
    } else {
      console.log(`⚡ [ALREADY ALIGNED] ${slug.padEnd(20)} -> is_saas: ${rule.is_saas}, type: ${rule.workspace_type}`);
    }
  }

  console.log(`\n🎉 Completed workspace segregation clean up. Updated ${updatedCount} tenants.`);
}

main();
