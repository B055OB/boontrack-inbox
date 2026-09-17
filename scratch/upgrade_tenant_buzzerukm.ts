/**
 * Upgrade Tenant 'buzzerukm' to Team Scale
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
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
  console.log("🔍 CHECKING TENANT RECORD WITH SLUG = 'buzzerukm'");
  console.log('====================================================');

  // Exact match query
  const { data: exactTenant, error: exactErr } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', 'buzzerukm')
    .maybeSingle();

  if (exactErr) {
    console.error('❌ Error fetching tenant by exact slug:', exactErr);
  }

  let targetTenant = exactTenant;

  if (!targetTenant) {
    console.log("⚠️ No exact slug 'buzzerukm' found. Searching with ilike...");
    const { data: matches, error: matchErr } = await supabase
      .from('tenants')
      .select('*')
      .ilike('slug', '%buzzerukm%');

    if (matchErr) {
      console.error('❌ Error searching tenant by ilike:', matchErr);
    } else if (matches && matches.length > 0) {
      console.log(`Found ${matches.length} matching candidate(s):`);
      matches.forEach((m) => console.log(` - ID: ${m.id}, Slug: '${m.slug}', Name: '${m.name}'`));
    }
  }

  if (!targetTenant) {
    console.error("❌ Target tenant with slug 'buzzerukm' does not exist in 'tenants' table.");
    process.exit(1);
  }

  console.log('Current Tenant State:');
  console.log(' - ID           :', targetTenant.id);
  console.log(' - Slug         :', targetTenant.slug);
  console.log(' - Name         :', targetTenant.name);
  console.log(' - Tier         :', targetTenant.tier);
  console.log(' - Status       :', targetTenant.status);
  console.log(' - Is Active    :', targetTenant.is_active);
  console.log(' - Sub Ends At  :', targetTenant.subscription_ends_at);
  console.log(' - Metadata Tier:', targetTenant.metadata?.tier || targetTenant.metadata?.plan_tier);

  // Determine valid tier value
  // In PostgreSQL enum tenant_tier_enum: 'STARTER', 'PRO_SCALE', 'ENTERPRISE'
  // 'ENTERPRISE' represents Team Scale (499k)
  // Let's test what value is accepted.
  console.log('\n----------------------------------------------------');
  console.log("🔄 UPDATING TENANT 'buzzerukm' TO TEAM SCALE...");
  console.log('----------------------------------------------------');

  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  const existingMeta = targetTenant.metadata || {};
  const updatedMetadata = {
    ...existingMeta,
    tier: 'TEAM_SCALE',
    plan_tier: 'TEAM_SCALE',
    plan: 'team_scale',
    features: {
      ...(existingMeta.features || {}),
      tier: 'TEAM_SCALE',
      multi_cs: true,
      ads_tracking: true,
      has_reader: true,
      has_capi: true,
      inbox: true,
    },
    capabilities: {
      ...(existingMeta.capabilities || {}),
      inbox: true,
      ai_bot: true,
      multi_cs: true,
    },
    subscription_ends_at: oneYearFromNow.toISOString(),
  };

  // Try updating with ENTERPRISE first (as documented in AGENTS.md & onboard route)
  // and fallback if enum allows TEAM_SCALE directly
  let tierValueToUse = 'ENTERPRISE';

  // Let's perform update without non-existent columns
  let updatePayload: any = {
    tier: tierValueToUse,
    status: 'active',
    is_active: true,
    trial_ends_at: null,
    subscription_ends_at: oneYearFromNow.toISOString(),
    metadata: updatedMetadata,
  };

  let { data: updated, error: updateErr } = await supabase
    .from('tenants')
    .update(updatePayload)
    .eq('id', targetTenant.id)
    .select('*')
    .single();

  if (updateErr) {
    console.warn(`⚠️ Update with tier='${tierValueToUse}' failed:`, updateErr.message);
    console.log("Retrying with tier='TEAM_SCALE'...");
    tierValueToUse = 'TEAM_SCALE';
    updatePayload.tier = tierValueToUse;

    const retryRes = await supabase
      .from('tenants')
      .update(updatePayload)
      .eq('id', targetTenant.id)
      .select('*')
      .single();

    if (retryRes.error) {
      console.error('❌ Failed updating with TEAM_SCALE as well:', retryRes.error);
      process.exit(1);
    }
    updated = retryRes.data;
  }

  console.log('====================================================');
  console.log('✅ TENANT SUCCESSFULLY UPGRADED TO TEAM SCALE!');
  console.log('====================================================');
  console.log('ID           :', updated.id);
  console.log('Slug         :', updated.slug);
  console.log('Name         :', updated.name);
  console.log('Tier / Plan  :', updated.tier, `(Meta: ${updated.metadata?.tier || updated.metadata?.plan_tier})`);
  console.log('Status       :', updated.status);
  console.log('Is Active    :', updated.is_active);
  console.log('Sub Ends At  :', updated.subscription_ends_at);
  console.log('----------------------------------------------------');
  console.log('Summary Row:');
  console.log(
    JSON.stringify(
      {
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        plan: updated.tier,
        plan_tier_meta: updated.metadata?.plan_tier,
        status: updated.status,
        is_active: updated.is_active,
        subscription_ends_at: updated.subscription_ends_at,
      },
      null,
      2
    )
  );
  console.log('====================================================');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
