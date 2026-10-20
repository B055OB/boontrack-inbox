import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export interface StudioRegistrationInput {
  whatsapp: string;
  name?: string;
  email?: string;
  password?: string;
  referral_code?: string | null;
  token?: string;
}

export function generateStudioActivationToken(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let randomPart = '';
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ACT${randomPart}`; // 7 chars, e.g. ACT89K2 or ACTXKPH
}

export function normalizeStudioPhone(phone: string): string {
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  return clean;
}

export function hashStudioPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Initiates a new Studio registration or returns existing token via WhatsApp bot activation.
 * Strict Bot Alignment: Does not require conventional email/password.
 */
export async function initiateStudioRegistration(input: StudioRegistrationInput) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Database connection failed.');
  }

  const normalizedPhone = normalizeStudioPhone(input.whatsapp);
  if (!normalizedPhone || normalizedPhone.length < 8) {
    throw new Error('Nomor WhatsApp tidak valid (minimal 8 digit).');
  }

  const normalizedEmail = (input.email || '').trim().toLowerCase() || `${normalizedPhone}@studio.boontrack.com`;
  const token = input.token ? input.token.trim().toUpperCase() : generateStudioActivationToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24-hour TTL
  const plainPassword = input.password || '123456';
  const passwordHash = hashStudioPassword(plainPassword);

  const displayName = (input.name || '').trim() || `Studio ${normalizedPhone.slice(-4)}`;
  const baseSlug = displayName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20).replace(/^-|-$/g, '') || 'studio';
  const uniqueSlug = `studio-${baseSlug}-${token.toLowerCase()}`;

  // Resolve affiliate referral if code exists (Cross-Domain Referral Engine)
  const cleanRef = (input.referral_code || '').trim().toLowerCase();
  let matchedAffiliateId: string | null = null;
  let matchedAffiliateName: string | null = null;

  if (cleanRef && cleanRef !== '1' && cleanRef !== 'null') {
    try {
      const { data: affData } = await supabase
        .from('affiliates')
        .select('id, name, referral_code')
        .ilike('referral_code', cleanRef)
        .maybeSingle();

      if (affData) {
        matchedAffiliateId = affData.id;
        matchedAffiliateName = affData.name;
      }
    } catch (lookupErr) {
      console.warn('[Studio Auth] Affiliate lookup error:', lookupErr);
    }
  }

  const waNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '6285181830080';
  const waClean = normalizeStudioPhone(waNumber);
  const waMessage = `AKTIFKAN STUDIO ${token}`;
  const waLink = `https://wa.me/${waClean}?text=${encodeURIComponent(waMessage)}`;

  // 1. Cek apakah nomor telepon sudah terdaftar di tenants
  const { data: existingTenant } = await supabase
    .from('tenants')
    .select('id, slug, name, metadata, is_active, status')
    .or(`metadata->>whatsapp.eq.${normalizedPhone},metadata->>phone.eq.${normalizedPhone},phone.eq.${normalizedPhone},whatsapp_number.eq.${normalizedPhone}`)
    .eq('tenant_kind', 'studio')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingTenant) {
    if (existingTenant.is_active || existingTenant.status === 'active' || existingTenant.metadata?.verification_status === 'SUCCESS') {
      const existingToken = existingTenant.metadata?.studio_activation_token || token;
      return {
        success: true,
        already_active: true,
        slug: existingTenant.slug,
        name: existingTenant.name,
        token: existingToken,
        expires_at: expiresAt,
        wa_number: waClean,
        wa_message: `AKTIFKAN STUDIO ${existingToken}`,
        wa_link: `https://wa.me/${waClean}?text=${encodeURIComponent(`AKTIFKAN STUDIO ${existingToken}`)}`,
      };
    }

    // Refresh pending tenant with new/current token
    const updatedMeta = {
      ...(existingTenant.metadata || {}),
      studio_activation_token: token,
      token_expires_at: expiresAt,
      verification_status: 'PENDING',
      phone_verified: false,
      whatsapp: normalizedPhone,
      phone: normalizedPhone,
      password_hash: existingTenant.metadata?.password_hash || passwordHash,
      referral_code: cleanRef || existingTenant.metadata?.referral_code || undefined,
      affiliate_code: cleanRef || existingTenant.metadata?.affiliate_code || undefined,
      affiliate_id: matchedAffiliateId || existingTenant.metadata?.affiliate_id || undefined,
      studio_workspace: {
        ...(existingTenant.metadata?.studio_workspace || {}),
        render_credits: 1,
        max_concurrent_jobs: 1,
        plan_tier: 'free_trial',
        tier: 'free_trial',
        status: 'PENDING',
      },
    };

    await supabase
      .from('tenants')
      .update({
        metadata: updatedMeta,
        access_username: 'admin',
        access_password: plainPassword,
        phone: normalizedPhone,
        whatsapp_number: normalizedPhone,
        status: 'pending_verification',
      })
      .eq('id', existingTenant.id);

    return {
      success: true,
      token,
      slug: existingTenant.slug,
      name: existingTenant.name,
      expires_at: expiresAt,
      wa_number: waClean,
      wa_message: waMessage,
      wa_link: waLink,
    };
  }

  // 2. Buat record draf baru di tabel tenants
  const metadata = {
    full_name: displayName,
    email: normalizedEmail,
    whatsapp: normalizedPhone,
    phone: normalizedPhone,
    password_hash: passwordHash,
    studio_activation_token: token,
    token_expires_at: expiresAt,
    verification_status: 'PENDING',
    phone_verified: false,
    referral_code: cleanRef || undefined,
    affiliate_code: cleanRef || undefined,
    affiliate_id: matchedAffiliateId || undefined,
    referrer_id: matchedAffiliateId || undefined,
    referrer_name: matchedAffiliateName || undefined,
    studio_workspace: {
      render_credits: 1,
      max_concurrent_jobs: 1,
      plan_tier: 'free_trial',
      tier: 'free_trial',
      status: 'PENDING',
    },
  };

  const payload: Record<string, any> = {
    name: displayName,
    slug: uniqueSlug,
    tier: 'PRO_SCALE',
    tenant_kind: 'studio',
    business_type: 'studio',
    access_username: 'admin',
    access_password: plainPassword,
    phone: normalizedPhone,
    whatsapp_number: normalizedPhone,
    status: 'pending_verification',
    is_active: false,
    metadata,
    created_at: new Date().toISOString(),
  };

  let { data: tenant, error } = await supabase
    .from('tenants')
    .insert(payload)
    .select('id, slug, name, metadata')
    .single();

  // Safeguard fallback: if tenant_kind or business_type column is missing in schema cache
  if (error && (error.message?.includes('tenant_kind') || error.message?.includes('business_type'))) {
    const { tenant_kind, business_type, ...safePayload } = payload;
    const retry = await supabase
      .from('tenants')
      .insert(safePayload)
      .select('id, slug, name, metadata')
      .single();
    tenant = retry.data;
    error = retry.error;
  }

  if (error || !tenant) {
    console.error('[Studio Auth] Failed to insert tenant:', error);
    throw new Error(error?.message || 'Gagal membuat draf akun Studio.');
  }

  // Record attribution to attributions table if affiliate matched
  if (matchedAffiliateId && tenant?.id) {
    try {
      await supabase.from('attributions').insert({
        tenant_id: tenant.id,
        affiliate_id: matchedAffiliateId,
        referral_code: cleanRef,
        created_at: new Date().toISOString(),
      });
    } catch (attrErr) {
      console.warn('[Studio Auth] Attribution insert note:', attrErr);
    }
  }

  return {
    success: true,
    token,
    slug: tenant.slug,
    name: tenant.name,
    expires_at: expiresAt,
    wa_number: waClean,
    wa_message: waMessage,
    wa_link: waLink,
  };
}

/**
 * Checks registration status for a given activation token or phone.
 */
export async function getStudioRegistrationStatus(token: string, phone?: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { status: 'EXPIRED', message: 'Database connection failed.' };
  }

  const cleanToken = token.trim().toUpperCase();
  const tokenSuffix = cleanToken.replace(/^ACT-?/i, '');
  const canonicalToken = cleanToken.startsWith('ACT') ? cleanToken : `ACT${cleanToken}`;

  let query = supabase
    .from('tenants')
    .select('id, slug, name, is_active, status, metadata')
    .or(
      `metadata->>studio_activation_token.eq.${cleanToken},` +
      `metadata->>studio_activation_token.eq.${canonicalToken},` +
      `metadata->>studio_activation_token.eq.${tokenSuffix},` +
      `metadata->>token.eq.${cleanToken},` +
      `metadata->>code.eq.${cleanToken}`
    );

  const { data: tenant, error } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !tenant) {
    // Fallback: check by phone if provided
    if (phone) {
      const cleanPhone = normalizeStudioPhone(phone);
      const { data: tenantByPhone } = await supabase
        .from('tenants')
        .select('id, slug, name, is_active, status, metadata')
        .or(`metadata->>whatsapp.eq.${cleanPhone},metadata->>phone.eq.${cleanPhone},phone.eq.${cleanPhone}`)
        .eq('tenant_kind', 'studio')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tenantByPhone) {
        const meta = tenantByPhone.metadata || {};
        if (meta.verification_status === 'SUCCESS' || tenantByPhone.is_active) {
          return {
            status: 'SUCCESS',
            session: {
              tenant_id: tenantByPhone.id,
              slug: tenantByPhone.slug,
              name: tenantByPhone.name,
              whatsapp: meta.whatsapp,
              email: meta.email,
              render_credits: meta.studio_workspace?.render_credits ?? 1,
            },
          };
        }
        return {
          status: 'PENDING',
          whatsapp: meta.whatsapp,
          token: meta.studio_activation_token,
          expires_at: meta.token_expires_at,
        };
      }
    }

    return { status: 'EXPIRED', message: 'Token tidak ditemukan atau telah kedaluwarsa.' };
  }

  const meta = (tenant.metadata && typeof tenant.metadata === 'object') ? tenant.metadata : {};
  const expiresAt = meta.token_expires_at ? new Date(meta.token_expires_at).getTime() : 0;
  const isExpired = expiresAt > 0 && Date.now() > expiresAt;

  if (meta.verification_status === 'SUCCESS' || tenant.is_active) {
    return {
      status: 'SUCCESS',
      session: {
        tenant_id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        whatsapp: meta.whatsapp,
        email: meta.email,
        render_credits: meta.studio_workspace?.render_credits ?? 1,
      },
    };
  }

  if (isExpired) {
    return { status: 'EXPIRED', message: 'Token telah kedaluwarsa. Silakan lakukan registrasi ulang.' };
  }

  return {
    status: 'PENDING',
    whatsapp: meta.whatsapp,
    token: meta.studio_activation_token || cleanToken,
    expires_at: meta.token_expires_at,
  };
}

/**
 * Marks studio registration as verified (e.g. from WhatsApp inbound webhook or API verify).
 * Sets:
 * - tenant_kind: 'studio'
 * - business_type: 'studio'
 * - phone_verified: true
 * - access_username: 'admin'
 * - access_password: default '123456'
 * - initial render credit in studio_workspace, tenant_entitlements, and tenant_credit_ledger
 */
export async function activateStudioRegistrationByToken(token: string, senderPhone?: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Database connection failed.');
  }

  const cleanToken = token.trim().toUpperCase();
  const tokenSuffix = cleanToken.replace(/^ACT-?/i, '');
  const canonicalToken = cleanToken.startsWith('ACT') ? cleanToken : `ACT${cleanToken}`;

  // 1. Cari tenant berdasarkan token (multi-key metadata matching)
  let { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, slug, name, metadata, phone, whatsapp_number, access_username, access_password')
    .or(
      `metadata->>studio_activation_token.eq.${cleanToken},` +
      `metadata->>studio_activation_token.eq.${canonicalToken},` +
      `metadata->>studio_activation_token.eq.${tokenSuffix},` +
      `metadata->>token.eq.${cleanToken},` +
      `metadata->>code.eq.${cleanToken}`
    )
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 2. Fallback: jika senderPhone ada, cari berdasarkan nomor telepon pada studio tenant
  if (!tenant && senderPhone) {
    const cleanSender = normalizeStudioPhone(senderPhone);
    const { data: phoneTenant } = await supabase
      .from('tenants')
      .select('id, slug, name, metadata, phone, whatsapp_number, access_username, access_password')
      .or(`metadata->>whatsapp.eq.${cleanSender},metadata->>phone.eq.${cleanSender},phone.eq.${cleanSender},whatsapp_number.eq.${cleanSender}`)
      .eq('tenant_kind', 'studio')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (phoneTenant) {
      tenant = phoneTenant;
    }
  }

  if (error || !tenant) {
    return null;
  }

  const currentMeta = (tenant.metadata && typeof tenant.metadata === 'object') ? tenant.metadata : {};
  const cleanPhone = senderPhone ? normalizeStudioPhone(senderPhone) : (currentMeta.whatsapp || currentMeta.phone || tenant.phone || '');
  const defaultPassword = '123456';
  const defaultPasswordHash = hashStudioPassword(defaultPassword);

  const updatedMeta = {
    ...currentMeta,
    whatsapp: cleanPhone || currentMeta.whatsapp,
    phone: cleanPhone || currentMeta.phone,
    phone_verified: true,
    verification_status: 'SUCCESS',
    verified_at: new Date().toISOString(),
    verified_by_sender: cleanPhone,
    password_hash: currentMeta.password_hash || defaultPasswordHash,
    studio_workspace: {
      ...(currentMeta.studio_workspace || {}),
      render_credits: currentMeta.studio_workspace?.render_credits ?? 1,
      max_concurrent_jobs: currentMeta.studio_workspace?.max_concurrent_jobs ?? 1,
      plan_tier: currentMeta.studio_workspace?.plan_tier ?? 'free_trial',
      tier: 'free_trial',
      status: 'ACTIVE',
    },
  };

  const updatePayload: Record<string, any> = {
    is_active: true,
    status: 'active',
    tenant_kind: 'studio',
    business_type: 'studio',
    access_username: tenant.access_username || 'admin',
    access_password: tenant.access_password || defaultPassword,
    metadata: updatedMeta,
  };

  if (cleanPhone) {
    updatePayload.phone = cleanPhone;
    updatePayload.whatsapp_number = cleanPhone;
  }

  let { data: updatedTenant, error: updateError } = await supabase
    .from('tenants')
    .update(updatePayload)
    .eq('id', tenant.id)
    .select('id, slug, name, is_active, status, metadata')
    .single();

  if (updateError && (updateError.message?.includes('tenant_kind') || updateError.message?.includes('business_type'))) {
    const { tenant_kind, business_type, ...safePayload } = updatePayload;
    const retry = await supabase
      .from('tenants')
      .update(safePayload)
      .eq('id', tenant.id)
      .select('id, slug, name, is_active, status, metadata')
      .single();
    updatedTenant = retry.data;
    updateError = retry.error;
  }

  if (updateError || !updatedTenant) {
    console.error('[Studio Auth] Failed to activate tenant:', updateError);
    return null;
  }

  // 1. Sinkronisasi saldo awal ke tenant_entitlements (SSOT)
  try {
    await supabase.from('tenant_entitlements').upsert({
      tenant_id: tenant.id,
      credits_remaining: 1,
      is_unlimited: false,
      tier: 'free_trial',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' });
  } catch (entErr) {
    console.warn('[Studio Auth] Failed to upsert tenant_entitlements:', entErr);
  }

  // 2. Catat Mutasi Audit Perdana ke tenant_credit_ledger (TRIAL_GRANT)
  try {
    await supabase.from('tenant_credit_ledger').insert({
      tenant_id: tenant.id,
      amount: 1,
      balance_after: 1,
      action: 'TRIAL_GRANT',
      description: 'Aktivasi akun Studio via Bot WhatsApp - 1 Kredit Render Gratis',
    });
  } catch (ledgerErr) {
    console.warn('[Studio Auth] Failed to insert initial tenant_credit_ledger log:', ledgerErr);
  }

  // 3. Picu Notifikasi Email Jaringan Affiliate & AM jika ada kode referral
  const refCode = currentMeta.affiliate_code || currentMeta.referral_code;
  const affId = currentMeta.affiliate_id;

  if (refCode || affId) {
    try {
      const { sendNewStoreReferralNotification } = await import('@/lib/affiliate-notification-service');
      sendNewStoreReferralNotification({
        storeName: tenant.name || tenant.slug,
        slug: tenant.slug,
        merchantName: tenant.name || 'Studio Creator',
        merchantPhone: cleanPhone,
        merchantEmail: currentMeta.email || undefined,
        planTier: 'free_trial',
        selectedPlan: 'Studio Free Trial (1 Kredit)',
        isTrial: true,
        referralCode: refCode || undefined,
        affiliateId: affId || undefined,
        tenantId: tenant.id,
      }).catch((notifErr) => {
        console.warn('[Studio Auth] Non-fatal affiliate network email alert error:', notifErr);
      });
    } catch (importErr) {
      console.warn('[Studio Auth] Failed to dispatch referral notification:', importErr);
    }
  }

  return updatedTenant;
}
