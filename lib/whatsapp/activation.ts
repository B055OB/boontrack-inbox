/**
 * lib/whatsapp/activation.ts
 * ============================================================================
 * Canonical Store Activation Service via WhatsApp Webhook (Kode BT-XXXX)
 *
 * Mengelola normalisasi input, ekstraksi kode aktivasi, pencocokan database
 * via getSupabaseAdmin() (Service Role), mitigasi silent RLS Supabase, dan
 * pembaruan status toko ke status aktif (Trial 7 Hari Ads Performance).
 * ============================================================================
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export interface ActivationCodeExtraction {
  isValid: boolean;
  canonicalToken: string; // e.g. "BT-7170"
  tokenSuffix: string;    // e.g. "7170"
  cleanToken: string;     // e.g. "BT-7170"
  rawToken: string;       // e.g. "7170" or "BT-7170"
}

export interface ActivationResult {
  success: boolean;
  notFound?: boolean;
  token?: string;
  tenant?: any;
  replyMessage: string;
  error?: string;
}

/**
 * Normalisasi nomor WhatsApp ke standar format internasional (misal: 62812xxxx)
 * - Menghapus whitespace (.trim())
 * - Menangani suffix JID seperti '@s.whatsapp.net', '@c.us', '@g.us'
 * - Menangani multidevice suffix ':0', ':1'
 * - Menghapus semua karakter non-digit
 * - Mengonversi awalan lokal '08...' atau '8...' ke standar '628...'
 */
export function normalizeWhatsAppNumber(rawNumber?: string | null): string {
  if (!rawNumber) return '';
  let str = String(rawNumber).trim();
  if (!str) return '';

  // 1. Strip WhatsApp JID domain suffix (@s.whatsapp.net, @c.us, @g.us, dll)
  if (str.includes('@')) {
    str = str.split('@')[0];
  }

  // 2. Strip WhatsApp multidevice suffix (:0, :1, dll)
  if (str.includes(':')) {
    str = str.split(':')[0];
  }

  // 3. Hapus semua karakter non-digit
  let clean = str.replace(/\D/g, '');
  if (!clean) return '';

  // 4. Konversi format lokal Indonesia ke standar internasional '628...'
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }

  return clean;
}

/**
 * Normalisasi dan ekstraksi kode verifikasi aktivasi (BT-XXXX) dari teks pesan.
 * Bersifat case-insensitive (.toUpperCase()) dan bebas dari whitespace tak sengaja (.trim()).
 * Mendukung berbagai variasi input dari pengguna:
 * - "AKTIVASI BT-7170"
 * - "aktivasi bt-7170"
 * - "  AKTIVASI   BT-7170  "
 * - "Aktivasi: BT-7170."
 * - "AKTIVASI - BT-7170"
 * - "AKTIVASI BT7170"
 * - "AKTIVASI 7170"
 * - "BT-7170"
 * - "bt-7170"
 */
export function extractActivationCode(rawText?: string | null): ActivationCodeExtraction | null {
  if (!rawText) return null;
  const text = String(rawText).trim();
  if (!text) return null;

  // Regex fleksibel:
  // 1. Pesan dengan awalan AKTIVASI (dengan pemisah spasi, titik dua, atau strip)
  // 2. Pesan yang langsung berupa kode token BT-XXXX
  const activationRegex = /(?:^|\b)AKTIVASI[\s:\-]+(?:BT-?)?([A-Za-z0-9]{3,10})[\.\s]*$/i;
  const directTokenRegex = /(?:^|\b)(?:BT-)([A-Za-z0-9]{3,10})[\.\s]*$/i;

  const match = text.match(activationRegex) || text.match(directTokenRegex);
  if (!match) return null;

  const rawExtracted = match[1].trim().toUpperCase();
  const tokenSuffix = rawExtracted.replace(/^BT-?/i, '');
  if (!tokenSuffix) return null;

  const canonicalToken = `BT-${tokenSuffix}`;

  return {
    isValid: true,
    canonicalToken,
    tokenSuffix,
    cleanToken: canonicalToken,
    rawToken: rawExtracted,
  };
}

/**
 * Mendapatkan Supabase client dengan prioritas getSupabaseAdmin() (Service Role).
 * Mencegah pemblokiran oleh silent RLS Supabase pada tabel tenants & activation_codes.
 */
export function getAdminClient(customClient?: SupabaseClient | any): SupabaseClient | any {
  if (customClient) return customClient;
  try {
    return getSupabaseAdmin();
  } catch (err) {
    console.warn('[ActivationService] getSupabaseAdmin unavailable, falling back to getSupabase():', err);
    return getSupabase();
  }
}

/**
 * Mencari data toko (tenant) di Supabase berdasarkan kode aktivasi.
 * Menggunakan Service Role untuk melewati RLS dan memeriksa beberapa tabel/kolom:
 * 1. Tabel tenants -> metadata->>wa_verification_token (BT-XXXX, XXXX, huruf kecil)
 * 2. Tabel tenants -> metadata->>code, metadata->>token, metadata->>activation_code
 * 3. Tabel activation_codes -> code_hash (jika tabel ada di database)
 * 4. Fallback: pencocokan nomor telepon pengirim pada tenant pending
 */
export async function findTenantByActivationCode(
  codeOrText: string,
  senderPhone?: string,
  customSupabase?: SupabaseClient | any
): Promise<any | null> {
  const supabase = getAdminClient(customSupabase);
  if (!supabase) return null;

  const extracted = extractActivationCode(codeOrText);
  const cleanInput = String(codeOrText || '').toUpperCase().trim();
  const tokenSuffix = extracted
    ? extracted.tokenSuffix
    : cleanInput.replace(/^AKTIVASI\s+/i, '').replace(/^BT-?/i, '').replace(/[\.,;:!\s]+$/, '');
  const canonicalToken = extracted ? extracted.canonicalToken : `BT-${tokenSuffix}`;
  const cleanToken = canonicalToken;
  const rawActivationMsg = `AKTIVASI ${canonicalToken}`;

  if (!tokenSuffix) {
    console.warn(`[ActivationService] Token suffix kosong dari input: "${codeOrText}"`);
    return null;
  }

  const cleanPhone = normalizeWhatsAppNumber(senderPhone);

  try {
    // 1. Query tabel tenants berdasarkan metadata tokens (multi-field matching)
    const { data: tenant, error: searchErr } = await supabase
      .from('tenants')
      .select('id, slug, name, status, is_active, tier, trial_ends_at, metadata')
      .or(
        `metadata->>wa_verification_token.eq.${canonicalToken},` +
        `metadata->>wa_verification_token.eq.${cleanToken},` +
        `metadata->>wa_verification_token.eq.${tokenSuffix},` +
        `metadata->>wa_verification_token.eq.${canonicalToken.toLowerCase()},` +
        `metadata->>code.eq.${canonicalToken},` +
        `metadata->>code.eq.${tokenSuffix},` +
        `metadata->>token.eq.${canonicalToken},` +
        `metadata->>token.eq.${tokenSuffix},` +
        `metadata->>activation_code.eq.${rawActivationMsg},` +
        `metadata->>activation_code.eq.${canonicalToken}`
      )
      .maybeSingle();

    if (tenant && !searchErr) {
      return tenant;
    }

    if (searchErr) {
      console.warn('[ActivationService] Search tenants metadata error:', searchErr);
    }

    // 2. Cek ke tabel activation_codes jika ada di schema
    try {
      const { data: actRow } = await supabase
        .from('activation_codes')
        .select('tenant_id, code_hash, status')
        .or(`code_hash.eq.${canonicalToken},code_hash.eq.${cleanToken},code_hash.eq.${tokenSuffix}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (actRow?.tenant_id) {
        const { data: tByAct } = await supabase
          .from('tenants')
          .select('id, slug, name, status, is_active, tier, trial_ends_at, metadata')
          .eq('id', actRow.tenant_id)
          .maybeSingle();

        if (tByAct) {
          return tByAct;
        }
      }
    } catch {
      // Non-fatal jika tabel activation_codes tidak digunakan atau query gagal
    }

    // 3. Fallback jika senderPhone valid: cek tenant pending yang nomornya cocok
    if (cleanPhone) {
      const { data: phoneTenants } = await supabase
        .from('tenants')
        .select('id, slug, name, status, is_active, tier, trial_ends_at, metadata')
        .or(`metadata->>phone.eq.${cleanPhone},metadata->>whatsapp_number.eq.${cleanPhone}`)
        .limit(5);

      if (phoneTenants && phoneTenants.length > 0) {
        const matched = phoneTenants.find((t: any) => {
          const meta = t.metadata || {};
          const tToken = String(
            meta.wa_verification_token || meta.code || meta.token || meta.activation_code || ''
          ).toUpperCase().trim();
          const tSuffix = tToken.replace(/^AKTIVASI\s+/i, '').replace(/^BT-?/i, '');
          return tSuffix === tokenSuffix || tToken === canonicalToken;
        });

        if (matched) {
          return matched;
        }
      }
    }
  } catch (err) {
    console.error('[ActivationService] Exception finding tenant by activation code:', err);
  }

  return null;
}

/**
 * Menjalankan proses aktivasi toko:
 * - Menemukan tenant dengan Service Role
 * - Memperbarui status ke 'active' & is_active = true
 * - Memberikan Reverse Trial 7 Hari (Ads Performance)
 * - Menyimpan metadata verifikasi WhatsApp
 * - Sinkronisasi ke shop_subscriptions & activation_codes
 * - Mengembalikan template balasan resmi
 */
export async function processStoreActivation(params: {
  codeOrText: string;
  senderPhone: string;
  ctwaClid?: string;
  customSupabase?: SupabaseClient | any;
}): Promise<ActivationResult> {
  const { codeOrText, senderPhone, ctwaClid, customSupabase } = params;
  const cleanPhone = normalizeWhatsAppNumber(senderPhone);
  const extracted = extractActivationCode(codeOrText);
  const canonicalToken = extracted
    ? extracted.canonicalToken
    : `BT-${String(codeOrText || '').toUpperCase().trim().replace(/^AKTIVASI\s+/i, '').replace(/^BT-?/i, '')}`;

  const supabase = getAdminClient(customSupabase);
  if (!supabase) {
    return {
      success: false,
      replyMessage: 'Terjadi kendala sistem database. Silakan coba beberapa saat lagi.',
      error: 'Database unreachable',
    };
  }

  const tenant = await findTenantByActivationCode(codeOrText, cleanPhone, supabase);

  if (!tenant) {
    console.warn(`[ActivationService] Token "${canonicalToken}" dari pengirim ${cleanPhone} tidak ditemukan.`);
    return {
      success: false,
      notFound: true,
      token: canonicalToken,
      replyMessage: `Halo! Kode verifikasi ${canonicalToken} tidak ditemukan atau sudah kedaluwarsa. Silakan periksa kembali kode aktivasi di browser Anda.`,
    };
  }

  const currentMeta = tenant.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
  const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const verifiedAt = new Date().toISOString();

  // Dynamic Tier Mapping (Deterministic 4-Tier Canonical):
  const rawTier = tenant.tier || currentMeta.tier || 'PRO_SCALE';
  const resolvedTier = rawTier === 'ADS_PERFORMANCE' ? 'PRO_SCALE' : rawTier;
  const resolvedPlanTier = currentMeta.plan_tier || resolvedTier;
  const resolvedPlanLabel =
    currentMeta.selected_plan ||
    (resolvedTier === 'PRO_SCALE' || resolvedTier === 'ADS_PERFORMANCE'
      ? 'Ads Performance Trial'
      : resolvedTier === 'ENTERPRISE' || resolvedTier === 'TEAM_SCALE'
      ? 'Team Scale'
      : resolvedTier === 'CHECKOUT_LITE'
      ? 'Paket Checkout'
      : 'Paket Solo');

  const isTrial = Boolean(
    currentMeta.is_trial ||
    tenant.trial_ends_at ||
    resolvedTier === 'PRO_SCALE' ||
    resolvedTier === 'ADS_PERFORMANCE' ||
    resolvedPlanLabel.includes('Trial')
  );

  const updatedMetadata = {
    ...currentMeta,
    ...(ctwaClid ? { last_ctwa_clid: ctwaClid } : {}),
    wa_verification_status: 'verified',
    wa_verified_at: verifiedAt,
    wa_verified_phone: cleanPhone,
    phone: cleanPhone || currentMeta.phone,
    whatsapp_number: cleanPhone || currentMeta.whatsapp_number,
    tier: resolvedTier,
    plan_tier: resolvedPlanTier,
    selected_plan: resolvedPlanLabel,
    subscription_status: isTrial ? 'trial' : 'active',
    is_trial: isTrial,
    trial_days: isTrial ? 7 : 0,
    trial_ends_at: isTrial ? trialEndsAt : null,
  };

  const { error: updateErr } = await supabase
    .from('tenants')
    .update({
      status: 'active',
      is_active: true,
      tier: resolvedTier,
      subscription_status: isTrial ? 'trial' : 'active',
      subscription_tier: resolvedTier,
      trial_ends_at: isTrial ? trialEndsAt : null,
      subscription_ends_at: isTrial ? trialEndsAt : undefined,
      metadata: updatedMetadata,
      updated_at: verifiedAt,
    })
    .eq('id', tenant.id);

  if (updateErr) {
    console.error('[ActivationService] Failed to update tenant activation:', updateErr);
    return {
      success: false,
      error: updateErr.message || 'Failed to update tenant status',
      replyMessage: 'Terjadi kendala saat memperbarui status toko. Silakan hubungi tim bantuan.',
    };
  }

  // Sinkronisasi status di tabel activation_codes jika ada
  try {
    await supabase
      .from('activation_codes')
      .update({ status: 'ACTIVE', activated_at: verifiedAt })
      .eq('tenant_id', tenant.id);
  } catch {}

  // Sinkronisasi status langganan ke tabel shop_subscriptions jika trial
  if (tenant.id && isTrial) {
    try {
      await supabase.from('shop_subscriptions').upsert(
        {
          tenant_id: tenant.id,
          tier: resolvedTier,
          status: 'TRIAL',
          current_period_starts_at: verifiedAt,
          current_period_ends_at: trialEndsAt,
          expires_at: trialEndsAt,
          amount_paid: 0,
          metadata: {
            plan: resolvedPlanLabel,
            activated_via: 'whatsapp_webhook',
          },
        },
        { onConflict: 'tenant_id,status' }
      );
    } catch (subErr) {
      console.warn('[ActivationService] Non-fatal sub sync note:', subErr);
    }
  }

  console.log(`[ActivationService] Sukses! Toko "${tenant.slug}" berhasil diaktifkan dengan nomor ${cleanPhone}!`);

  const replyMessage =
    'Selamat! Nomor WhatsApp Anda berhasil diverifikasi. Akun toko Anda sudah aktif. Silakan kembali ke browser untuk mulai menggunakan BoonTrack.';

  return {
    success: true,
    tenant: {
      ...tenant,
      status: 'active',
      is_active: true,
      metadata: updatedMetadata,
    },
    replyMessage,
  };
}
