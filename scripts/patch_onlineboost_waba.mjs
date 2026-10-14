import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envLocal = fs.readFileSync('.env.local', 'utf-8');
const envMap = {};
for (const line of envLocal.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m) {
    envMap[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const supabase = createClient(envMap.NEXT_PUBLIC_SUPABASE_URL, envMap.SUPABASE_SERVICE_ROLE_KEY);

const WABA_PAYLOAD = {
  waba_phone_number_id: "1419090974617162",
  whatsapp_phone_number_id: "1419090974617162",
  waba_account_id: "1833199311370551",
  waba_access_token: "EAAT4OxjEH58BSq4ZAxXAHW98AawCioZB0BqzZAMqk2kILr1glBjH2QAzNxZBHjvomb0HilzBZAicM0uQHQvPD8zkj5oe1awfTQSjRz939FZCo6rGwgfZCGhvNGSkkeDXyBsZB2q9Des0YngpVJUmIgUiEIpau1JUlH0lmEHwU2X6bXVU0rx6ZCpdAu4ZCDL8zwZCgZDZD",
  waba_configured: true,
  waba_active: true,
  whatsapp_gateway_type: "waba",
};

async function patchOnlineboost() {
  console.log("Fetching tenant 'onlineboost' from Supabase...");
  const { data: tenant, error: fetchErr } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', 'onlineboost')
    .single();

  if (fetchErr || !tenant) {
    console.error("Error fetching tenant onlineboost:", fetchErr);
    process.exit(1);
  }

  console.log("Found tenant onlineboost with ID:", tenant.id);
  const nowIso = new Date().toISOString();

  // 1. Prepare updated metadata
  const currentMeta = tenant.metadata || {};
  const updatedMeta = {
    ...currentMeta,
    ...WABA_PAYLOAD,
    waba_config: {
      phone_number_id: WABA_PAYLOAD.waba_phone_number_id,
      waba_id: WABA_PAYLOAD.waba_account_id,
      access_token: WABA_PAYLOAD.waba_access_token,
      permanent_access_token: WABA_PAYLOAD.waba_access_token,
      status: "CONNECTED",
      verified_name: "ONLINEBOOST",
      display_phone_number: "ID: 1419090974617162",
      quality_rating: "GREEN (HIGH QUALITY)",
      updated_at: nowIso,
    },
  };

  // 2. Prepare fields to update on tenants table
  const tenantUpdate = {
    metadata: updatedMeta,
    updated_at: nowIso,
  };

  // Check if direct column waba_phone_number_id exists
  if ('waba_phone_number_id' in tenant) {
    tenantUpdate.waba_phone_number_id = WABA_PAYLOAD.waba_phone_number_id;
  }
  if ('waba_account_id' in tenant) {
    tenantUpdate.waba_account_id = WABA_PAYLOAD.waba_account_id;
  }

  console.log("Updating tenants table for onlineboost...");
  const { error: updateTenantErr } = await supabase
    .from('tenants')
    .update(tenantUpdate)
    .eq('id', tenant.id);

  if (updateTenantErr) {
    console.error("Failed to update tenants table:", updateTenantErr);
    process.exit(1);
  }
  console.log("Successfully updated tenants table!");

  // 3. Insert or update whatsapp_connections for provider 'meta'
  console.log("Checking whatsapp_connections for provider meta...");
  const { data: existingMetaConn } = await supabase
    .from('whatsapp_connections')
    .select('id')
    .or(`tenant_slug.eq.onlineboost,tenant_id.eq.${tenant.id}`)
    .eq('provider', 'meta')
    .maybeSingle();

  const metaConnPayload = {
    tenant_id: tenant.id,
    tenant_slug: 'onlineboost',
    phone_number_id: WABA_PAYLOAD.waba_phone_number_id,
    phone_number: '1419090974617162',
    api_key: WABA_PAYLOAD.waba_access_token,
    status: 'active',
    is_connected: true,
    provider: 'meta',
    channel_type: 'waba',
    waba_id: WABA_PAYLOAD.waba_account_id,
    ownership_domain: 'TENANT',
    purpose: 'COMMERCE',
    metadata: {
      waba_id: WABA_PAYLOAD.waba_account_id,
      verified_name: 'ONLINEBOOST',
      quality_rating: 'GREEN',
      token: WABA_PAYLOAD.waba_access_token,
      connected_via: 'migration_patch',
      connected_at: nowIso,
    },
    updated_at: nowIso,
  };

  if (existingMetaConn) {
    const { error: updConnErr } = await supabase
      .from('whatsapp_connections')
      .update(metaConnPayload)
      .eq('id', existingMetaConn.id);
    if (updConnErr) console.warn("Failed to update whatsapp_connections:", updConnErr);
    else console.log("Updated existing whatsapp_connections record for meta!");
  } else {
    const { error: insConnErr } = await supabase
      .from('whatsapp_connections')
      .insert(metaConnPayload);
    if (insConnErr) console.warn("Failed to insert whatsapp_connections:", insConnErr);
    else console.log("Inserted new whatsapp_connections record for meta!");
  }

  // 4. Upsert tenant_settings
  console.log("Upserting tenant_settings table for WABA...");
  const { error: upsertSettingsErr } = await supabase
    .from('tenant_settings')
    .upsert(
      {
        tenant_slug: 'onlineboost',
        waba_config: {
          waba_id: WABA_PAYLOAD.waba_account_id,
          phone_number_id: WABA_PAYLOAD.waba_phone_number_id,
          permanent_access_token: WABA_PAYLOAD.waba_access_token,
          status: 'CONNECTED',
          verified_name: 'ONLINEBOOST',
          display_phone_number: 'ID: 1419090974617162',
          quality_rating: 'GREEN',
          updated_at: nowIso,
        },
        updated_at: nowIso,
      },
      { onConflict: 'tenant_slug' }
    );

  if (upsertSettingsErr) {
    console.warn("Note on tenant_settings upsert:", upsertSettingsErr);
  } else {
    console.log("Successfully upserted tenant_settings for WABA!");
  }

  // 5. Verification read
  console.log("Verifying updated record...");
  const { data: verifiedTenant } = await supabase
    .from('tenants')
    .select('id, slug, tier, waba_phone_number_id, metadata')
    .eq('slug', 'onlineboost')
    .single();

  console.log("Verification summary:", {
    slug: verifiedTenant.slug,
    tier: verifiedTenant.tier,
    direct_waba_phone_number_id: verifiedTenant.waba_phone_number_id,
    waba_configured: verifiedTenant.metadata?.waba_configured,
    waba_active: verifiedTenant.metadata?.waba_active,
    whatsapp_gateway_type: verifiedTenant.metadata?.whatsapp_gateway_type,
    waba_phone_number_id: verifiedTenant.metadata?.waba_phone_number_id,
    whatsapp_phone_number_id: verifiedTenant.metadata?.whatsapp_phone_number_id,
    waba_account_id: verifiedTenant.metadata?.waba_account_id,
    token_preview: verifiedTenant.metadata?.waba_access_token?.slice(0, 15) + '...',
  });

  console.log("PATCH COMPLETED SUCCESSFULLY!");
}

patchOnlineboost().catch(console.error);
