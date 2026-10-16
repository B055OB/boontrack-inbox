import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  console.log('[Inject SpasialHub] Initiating tenant activation and partner registration...');

  const slug = 'spasialhub';
  const name = 'SpasialHub';
  const email = 'budiawancorp@gmail.com';
  const phone = '6285183088404';
  const defaultPassword = 'BoonTrack123!';
  const passwordHash = crypto.createHash('sha256').update(defaultPassword).digest('hex');
  const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Check existing tenant
  const { data: existingTenant, error: fetchErr } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (fetchErr) {
    console.error('[Inject SpasialHub] Error querying tenant:', fetchErr);
    process.exit(1);
  }

  const existingMeta = existingTenant?.metadata || {};
  delete existingMeta.password_raw;

  const updatedMetadata = {
    ...existingMeta,
    name,
    shop_name: name,
    store_name: name,
    merchant_name: existingMeta.merchant_name || 'Budi Awan',
    email,
    phone,
    wa_number: phone,
    whatsapp_number: phone,
    email_verified: true,
    wa_verification_status: 'VERIFIED',
    status: 'ACTIVE',
    is_active: true,
    access_pin: passwordHash,
    pin: passwordHash,
    pin_hash: passwordHash,
    tier: 'PRO_SCALE',
    plan_tier: 'PRO_SCALE',
    selected_plan: 'Pro Scale (Trial 7 Hari)',
    is_trial: true,
    trial_days: 7,
    trial_ends_at: existingTenant?.trial_ends_at || trialEndsAt,
    activated_at: new Date().toISOString(),
  };

  const tenantPayload = {
    slug,
    name,
    tier: 'PRO_SCALE',
    status: 'ACTIVE',
    is_active: true,
    subscription_status: 'trial',
    subscription_tier: 'PRO_SCALE',
    trial_ends_at: existingTenant?.trial_ends_at || trialEndsAt,
    subscription_ends_at: existingTenant?.subscription_ends_at || trialEndsAt,
    access_username: slug,
    access_password: passwordHash,
    metadata: updatedMetadata,
    updated_at: new Date().toISOString(),
  };

  let tenantId = existingTenant?.id;

  if (existingTenant) {
    console.log(`[Inject SpasialHub] Updating existing tenant ${existingTenant.id}...`);
    const { data: updatedTenant, error: updateErr } = await supabase
      .from('tenants')
      .update(tenantPayload)
      .eq('id', existingTenant.id)
      .select()
      .single();

    if (updateErr) {
      console.error('[Inject SpasialHub] Failed to update tenant:', updateErr);
      process.exit(1);
    }
    console.log('[Inject SpasialHub] Tenant updated successfully:', {
      id: updatedTenant.id,
      slug: updatedTenant.slug,
      name: updatedTenant.name,
      tier: updatedTenant.tier,
      status: updatedTenant.status,
      is_active: updatedTenant.is_active,
      access_password: updatedTenant.access_password,
    });
  } else {
    console.log('[Inject SpasialHub] Inserting new tenant...');
    const { data: insertedTenant, error: insertErr } = await supabase
      .from('tenants')
      .insert({
        ...tenantPayload,
        category: 'DIGITAL',
        business_type: 'DIGITAL',
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[Inject SpasialHub] Failed to insert tenant:', insertErr);
      process.exit(1);
    }
    tenantId = insertedTenant.id;
    console.log('[Inject SpasialHub] Tenant created successfully:', insertedTenant.id);
  }

  // 2. Ensure Affiliate record exists and is ACTIVE
  const { data: existingAffiliate, error: affFetchErr } = await supabase
    .from('affiliates')
    .select('*')
    .or(`email.eq.${email},referral_code.eq.${slug},referral_code.eq.${slug.toUpperCase()}`)
    .maybeSingle();

  if (affFetchErr) {
    console.warn('[Inject SpasialHub] Warning querying affiliate:', affFetchErr);
  }

  const affiliatePayload = {
    tenant_id: slug,
    name: 'Budi Awan (SpasialHub)',
    phone: phone,
    phone_number: phone,
    email: email,
    referral_code: 'SPASIALHUB',
    role: 'affiliate',
    status: 'ACTIVE',
    parent_am_id: '43e48443-dcfa-47a6-818c-5144e3a34db4', // Sakti Alamsyah (buzzerukm)
    region: 'ID-NATIONAL',
    commission_rate: 25,
    bank_name: 'BCA',
    bank_account_holder: 'Budi Awan',
    bank_account_number: '-',
    payout_bank_details: {
      bank_name: 'BCA',
      account_holder: 'Budi Awan',
      account_number: '-',
    },
    is_bank_verified: true,
    agreed_to_rules: true,
    screening_status: 'APPROVED',
    metadata: {
      slug,
      store_name: name,
      am_pembina: 'buzzerukm',
      parent_am_name: 'Sakti Alamsyah',
      access_pin: defaultPassword,
      auto_injected: true,
      injected_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  };

  if (existingAffiliate) {
    console.log(`[Inject SpasialHub] Updating existing affiliate record ${existingAffiliate.id}...`);
    const { data: affUpdated, error: affUpdErr } = await supabase
      .from('affiliates')
      .update(affiliatePayload)
      .eq('id', existingAffiliate.id)
      .select()
      .single();

    if (affUpdErr) {
      console.error('[Inject SpasialHub] Failed to update affiliate:', affUpdErr);
    } else {
      console.log('[Inject SpasialHub] Affiliate record updated:', affUpdated.id);
    }
  } else {
    console.log('[Inject SpasialHub] Inserting new affiliate record...');
    const { data: affInserted, error: affInsErr } = await supabase
      .from('affiliates')
      .insert({
        ...affiliatePayload,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (affInsErr) {
      console.error('[Inject SpasialHub] Failed to insert affiliate:', affInsErr);
    } else {
      console.log('[Inject SpasialHub] Affiliate record created:', affInserted.id);
    }
  }

  console.log('[Inject SpasialHub] SUCCESS! Akun toko Kang Budi (spasialhub) aktif dan siap login.');
}

main().catch((err) => {
  console.error('[Inject SpasialHub] Unhandled error:', err);
  process.exit(1);
});
