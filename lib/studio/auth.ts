import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export interface StudioRegistrationInput {
  name: string;
  email: string;
  whatsapp: string;
  password: string;
}

export function generateStudioActivationToken(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let randomPart = '';
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ACT${randomPart}`; // 7 chars, e.g. ACT89K2
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
 * Initiates a new Studio registration with an activation token and 15m TTL.
 */
export async function initiateStudioRegistration(input: StudioRegistrationInput) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Database connection failed.');
  }

  const normalizedPhone = normalizeStudioPhone(input.whatsapp);
  const normalizedEmail = input.email.trim().toLowerCase();
  const token = generateStudioActivationToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const passwordHash = hashStudioPassword(input.password);

  const baseSlug = input.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
  const uniqueSlug = `studio-${baseSlug || 'user'}-${token.toLowerCase()}`;

  const metadata = {
    full_name: input.name.trim(),
    email: normalizedEmail,
    whatsapp: normalizedPhone,
    password_hash: passwordHash,
    studio_activation_token: token,
    token_expires_at: expiresAt,
    verification_status: 'PENDING',
    phone_verified: false,
    studio_workspace: {
      render_credits: 50,
      max_concurrent_jobs: 2,
      plan_tier: 'STUDIO_STARTER',
      status: 'PENDING',
    },
  };

  const payload = {
    name: `${input.name.trim()} Studio`,
    slug: uniqueSlug,
    tier: 'PRO_SCALE',
    tenant_kind: 'studio',
    business_type: 'studio',
    status: 'pending_verification',
    is_active: false,
    metadata,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: tenant, error } = await supabase
    .from('tenants')
    .insert(payload)
    .select('id, slug, name, metadata')
    .single();

  if (error) {
    console.error('[Studio Auth] Failed to insert tenant:', error);
    throw new Error(error.message || 'Gagal membuat draf akun Studio.');
  }

  const waNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '6285181830080';
  const waClean = normalizeStudioPhone(waNumber);
  const waMessage = `AKTIFKAN STUDIO ${token}`;
  const waLink = `https://wa.me/${waClean}?text=${encodeURIComponent(waMessage)}`;

  return {
    success: true,
    token,
    slug: tenant.slug,
    expires_at: expiresAt,
    wa_number: waClean,
    wa_message: waMessage,
    wa_link: waLink,
  };
}

/**
 * Checks registration status for a given activation token.
 */
export async function getStudioRegistrationStatus(token: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { status: 'EXPIRED', message: 'Database connection failed.' };
  }

  const cleanToken = token.trim().toUpperCase();

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, slug, name, is_active, status, metadata')
    .eq('metadata->>studio_activation_token', cleanToken)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !tenant) {
    return { status: 'EXPIRED', message: 'Token tidak ditemukan atau telah kedaluwarsa.' };
  }

  const meta = (tenant.metadata && typeof tenant.metadata === 'object') ? tenant.metadata : {};
  const expiresAt = meta.token_expires_at ? new Date(meta.token_expires_at).getTime() : 0;
  const isExpired = Date.now() > expiresAt;

  if (meta.verification_status === 'SUCCESS' || tenant.is_active) {
    return {
      status: 'SUCCESS',
      session: {
        tenant_id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        whatsapp: meta.whatsapp,
        email: meta.email,
        render_credits: meta.studio_workspace?.render_credits || 50,
      },
    };
  }

  if (isExpired) {
    return { status: 'EXPIRED', message: 'Token telah kedaluwarsa. Silakan lakukan registrasi ulang.' };
  }

  return {
    status: 'PENDING',
    whatsapp: meta.whatsapp,
    expires_at: meta.token_expires_at,
  };
}

/**
 * Marks studio registration as verified (e.g. from WhatsApp inbound webhook or dev simulation).
 */
export async function activateStudioRegistrationByToken(token: string, senderPhone?: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Database connection failed.');
  }

  const cleanToken = token.trim().toUpperCase();

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, slug, name, metadata')
    .eq('metadata->>studio_activation_token', cleanToken)
    .maybeSingle();

  if (error || !tenant) {
    return null;
  }

  const currentMeta = (tenant.metadata && typeof tenant.metadata === 'object') ? tenant.metadata : {};
  const updatedMeta = {
    ...currentMeta,
    verification_status: 'SUCCESS',
    phone_verified: true,
    verified_at: new Date().toISOString(),
    verified_by_sender: senderPhone || currentMeta.whatsapp,
    studio_workspace: {
      ...(currentMeta.studio_workspace || {}),
      render_credits: currentMeta.studio_workspace?.render_credits ?? 50,
      max_concurrent_jobs: currentMeta.studio_workspace?.max_concurrent_jobs ?? 2,
      plan_tier: 'STUDIO_STARTER',
      status: 'ACTIVE',
    },
  };

  const { data: updatedTenant, error: updateError } = await supabase
    .from('tenants')
    .update({
      is_active: true,
      status: 'active',
      metadata: updatedMeta,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tenant.id)
    .select('id, slug, name, metadata')
    .single();

  if (updateError) {
    console.error('[Studio Auth] Failed to activate tenant:', updateError);
    return null;
  }

  // Attempt to write to public.studio_workspaces if table exists
  try {
    await supabase.from('studio_workspaces').insert({
      tenant_id: tenant.id,
      owner_phone: currentMeta.whatsapp || senderPhone || '',
      owner_email: currentMeta.email || '',
      render_credits: 50,
      max_concurrent_jobs: 2,
      plan_tier: 'STUDIO_STARTER',
      status: 'ACTIVE',
      metadata: { activated_via: 'WABA_INBOUND', token: cleanToken },
    });
  } catch (err) {
    // Graceful fallback for hybrid schema
    console.warn('[Studio Auth] studio_workspaces table insert skipped (schema fallback):', err);
  }

  return updatedTenant;
}
