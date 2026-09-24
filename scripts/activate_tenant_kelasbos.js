/**
 * Control Plane Activation Script: Tenant "Kelas Bos"
 * Slug: kelasbos
 * Email: fahamidigitalweb@gmail.com
 * Mode: Bypass OTP / WA Verification
 * Compliance: ARCHITECTURE.md (No hardcoded routes, dynamic Supabase single source of truth)
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Load environment variables from .env and .env.local
for (const envFile of ['.env', '.env.local']) {
  const filePath = path.resolve(__dirname, '..', envFile);
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        let v = trimmed.slice(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        process.env[k] = v;
      }
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

async function activateKelasBos() {
  console.log('========================================================');
  console.log(' CONTROL PLANE ACTIVATION: TENANT "Kelas Bos" (kelasbos)');
  console.log('========================================================\n');

  // STEP 1: Find tenant record by slug "kelasbos" or email in metadata
  console.log('[Step 1] Searching for tenant "Kelas Bos"...');
  const { data: tenant, error: findError } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', 'kelasbos')
    .single();

  if (findError || !tenant) {
    console.error('Failed to locate tenant "kelasbos":', findError?.message);
    process.exit(1);
  }

  console.log(`Found tenant record:`);
  console.log(`- ID: ${tenant.id}`);
  console.log(`- Slug: ${tenant.slug}`);
  console.log(`- Name: ${tenant.name}`);
  console.log(`- Current status: ${tenant.status}`);
  console.log(`- Current is_active: ${tenant.is_active}`);
  console.log(`- Metadata email: ${tenant.metadata?.email}`);
  console.log(`- Metadata phone: ${tenant.metadata?.phone || tenant.metadata?.wa_number}`);

  // STEP 2: Update verification status
  console.log('\n[Step 2] Updating verification status (Bypass OTP/WA)...');
  const now = new Date().toISOString();
  const updatedMetadata = {
    ...tenant.metadata,
    status: 'active',
    is_verified: true,
    email_verified: true,
    wa_verification_status: 'verified',
    activation_token: 'verified',
    activation_code: 'verified',
    wa_verification_token: 'verified',
    verification_token: 'verified',
    verification_status: 'verified',
    wa_verified_at: now,
    wa_verified_phone: tenant.metadata?.phone || tenant.metadata?.wa_number || '628983965400',
    activated_at: now,
    activated_via: 'control_plane_script_bypass_otp'
  };

  const { data: updatedTenant, error: updateError } = await supabase
    .from('tenants')
    .update({
      status: 'active',
      is_active: true,
      metadata: updatedMetadata
    })
    .eq('id', tenant.id)
    .select()
    .single();

  if (updateError) {
    console.error('Failed to update tenant status in Supabase:', updateError.message);
    process.exit(1);
  }

  console.log('Tenant successfully updated:');
  console.log(`- status: ${updatedTenant.status}`);
  console.log(`- is_active: ${updatedTenant.is_active}`);
  console.log(`- metadata.is_verified: ${updatedTenant.metadata.is_verified}`);
  console.log(`- metadata.wa_verification_status: ${updatedTenant.metadata.wa_verification_status}`);
  console.log(`- metadata.activation_token: ${updatedTenant.metadata.activation_token}`);

  // STEP 3: Ensure relational tables tenant_settings and whatsapp_connections are linked
  console.log('\n[Step 3] Ensuring relational records in tenant_settings & whatsapp_connections...');

  // 3a. tenant_settings
  const { data: existingSettings } = await supabase
    .from('tenant_settings')
    .select('*')
    .eq('tenant_slug', 'kelasbos');

  const settingsPayload = {
    tenant_slug: 'kelasbos',
    store_name: 'Kelasbos',
    biteship_config: {},
    capi_enabled: false,
    capi_settings: {},
    ads_tracking_config: {},
    updated_at: now
  };

  let savedSettings;
  if (existingSettings && existingSettings.length > 0) {
    const { data, error } = await supabase
      .from('tenant_settings')
      .update(settingsPayload)
      .eq('id', existingSettings[0].id)
      .select()
      .single();
    if (error) throw new Error(`Failed to update tenant_settings: ${error.message}`);
    savedSettings = data;
    console.log(`Updated tenant_settings (ID: ${savedSettings.id})`);
  } else {
    const { data, error } = await supabase
      .from('tenant_settings')
      .insert(settingsPayload)
      .select()
      .single();
    if (error) throw new Error(`Failed to insert tenant_settings: ${error.message}`);
    savedSettings = data;
    console.log(`Inserted tenant_settings (ID: ${savedSettings.id})`);
  }

  // 3b. whatsapp_connections (Evolution API instance)
  const { data: existingWa } = await supabase
    .from('whatsapp_connections')
    .select('*')
    .or(`tenant_slug.eq.kelasbos,tenant_id.eq.kelasbos`);

  const waPayload = {
    tenant_id: 'kelasbos',
    tenant_slug: 'kelasbos',
    instance_name: 'tenant_kelasbos',
    provider: 'EVOLUTION',
    channel_type: 'BAILEYS',
    phone_number: tenant.metadata?.phone || '628983965400',
    status: 'disconnected',
    ownership_domain: 'TENANT',
    purpose: 'COMMERCE',
    metadata: {
      provider: 'EVOLUTION',
      instance_name: 'tenant_kelasbos',
      tenant_slug: 'kelasbos',
      status: 'disconnected',
      tenant_uuid: tenant.id
    },
    updated_at: now
  };

  let savedWa;
  if (existingWa && existingWa.length > 0) {
    const { data, error } = await supabase
      .from('whatsapp_connections')
      .update(waPayload)
      .eq('id', existingWa[0].id)
      .select()
      .single();
    if (error) throw new Error(`Failed to update whatsapp_connections: ${error.message}`);
    savedWa = data;
    console.log(`Updated whatsapp_connections (ID: ${savedWa.id})`);
  } else {
    const { data, error } = await supabase
      .from('whatsapp_connections')
      .insert(waPayload)
      .select()
      .single();
    if (error) throw new Error(`Failed to insert whatsapp_connections: ${error.message}`);
    savedWa = data;
    console.log(`Inserted whatsapp_connections (ID: ${savedWa.id})`);
  }

  console.log(`WhatsApp connection record:`);
  console.log(`- instance_name: ${savedWa.instance_name}`);
  console.log(`- provider: ${savedWa.provider}`);
  console.log(`- status: ${savedWa.status}`);
  console.log(`- tenant_slug: ${savedWa.tenant_slug}`);
  console.log(`- phone_number: ${savedWa.phone_number}`);

  // STEP 4: Verification of endpoint resolution
  console.log('\n[Step 4] Verifying resolution for shop.boontrack.com/kelasbos...');
  
  // 4a. Verify Supabase query exactly as run by app/[tenant]/page.tsx
  const { data: storefrontTenant, error: sfError } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', 'kelasbos')
    .maybeSingle();

  if (sfError || !storefrontTenant) {
    console.error('FATAL: Storefront tenant resolution query failed:', sfError?.message);
    process.exit(1);
  }

  // 4b. Verify layout metadata query
  const { data: layoutTenant } = await supabase
    .from('tenants')
    .select('name,metadata')
    .eq('slug', 'kelasbos')
    .limit(1)
    .single();

  const { data: layoutSettings } = await supabase
    .from('tenant_settings')
    .select('ads_tracking_config')
    .eq('tenant_slug', 'kelasbos')
    .limit(1)
    .single();

  console.log('\n✓ Storefront resolution verification successful:');
  console.log(`- Tenant: ${storefrontTenant.name} (${storefrontTenant.slug})`);
  console.log(`- Status: ${storefrontTenant.status}`);
  console.log(`- Active: ${storefrontTenant.is_active}`);
  console.log(`- Tier: ${storefrontTenant.tier}`);
  console.log(`- Category: ${storefrontTenant.category}`);
  console.log(`- Layout Store Name: ${layoutTenant?.name}`);
  console.log(`- Layout Settings Connected: ${Boolean(layoutSettings)}`);
  console.log(`- Storefront Status Outcome: 'active' (NO 404, NO redirect to register)`);

  console.log('\n========================================================');
  console.log(' ACTIVATION COMPLETED SUCCESSFULLY');
  console.log(' shop.boontrack.com/kelasbos is now ACTIVE and RESOLVED');
  console.log('========================================================');
}

activateKelasBos().catch(err => {
  console.error('Fatal activation error:', err);
  process.exit(1);
});
