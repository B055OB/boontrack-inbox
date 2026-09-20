import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import {
  generateVerificationToken,
  getOfficialWhatsAppNumber,
  normalizeWhatsAppNumber,
} from '@/lib/whatsapp';
import { buildDefaultIndustryMenu } from '@/lib/zero-ai-engine';

export const dynamic = 'force-dynamic';

function sanitizeSlug(val: string): string {
  return String(val || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

interface PlanMapping {
  dbTier: 'STARTER' | 'PRO_SCALE' | 'ENTERPRISE';
  planLabel: string;
  planType: 'entry' | 'solo' | 'ads_performance' | 'team_scale';
  isTrial: boolean;
  trialDays: number;
}

export function resolveRegistrationPlan(rawInput: string | undefined): PlanMapping {
  const normalized = String(rawInput || '').trim().toLowerCase();

  // 1. Ads Performance (Promo Pilihan Utama - Trial 7 Hari Rp 0)
  // DB canonical (ADR): 'PRO_SCALE', is_trial: true
  if (
    normalized === 'ads_performance' ||
    normalized === 'pro_ads' ||
    normalized === 'pro_scale' ||
    normalized.includes('ads') ||
    normalized.includes('performance')
  ) {
    return {
      dbTier: 'PRO_SCALE',
      planLabel: 'Ads Performance Trial',
      planType: 'ads_performance',
      isTrial: true,
      trialDays: 7,
    };
  }

  // 2. Paket Checkout / Entry
  // DB canonical (ADR): 'STARTER' (metadata.plan_type: 'entry')
  if (
    normalized === 'checkout_lite' ||
    normalized === 'checkout' ||
    normalized === 'entry' ||
    normalized === 'lite' ||
    normalized.includes('checkout') ||
    normalized.includes('lite') ||
    normalized.includes('entry')
  ) {
    return {
      dbTier: 'STARTER',
      planLabel: 'Paket Checkout',
      planType: 'entry',
      isTrial: false,
      trialDays: 0,
    };
  }

  // 3. Paket Solo / Starter
  // DB canonical (ADR): 'STARTER' (metadata.plan_type: 'solo')
  if (
    normalized === 'solo' ||
    normalized === 'starter' ||
    normalized === 'basic' ||
    normalized.includes('solo') ||
    normalized.includes('starter')
  ) {
    return {
      dbTier: 'STARTER',
      planLabel: 'Paket Solo',
      planType: 'solo',
      isTrial: false,
      trialDays: 0,
    };
  }

  // 4. Paket Team Scale / Enterprise
  // DB canonical (ADR): 'ENTERPRISE'
  if (
    normalized === 'team_scale' ||
    normalized === 'scale' ||
    normalized === 'enterprise' ||
    normalized.includes('team') ||
    normalized.includes('scale') ||
    normalized.includes('enterprise')
  ) {
    return {
      dbTier: 'ENTERPRISE',
      planLabel: 'Team Scale',
      planType: 'team_scale',
      isTrial: false,
      trialDays: 0,
    };
  }

  // Fallback: Ads Performance Trial
  return {
    dbTier: 'PRO_SCALE',
    planLabel: 'Ads Performance Trial',
    planType: 'ads_performance',
    isTrial: true,
    trialDays: 7,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const rawShopName = body.shop_name || body.storeName || body.store_name || body.name || '';
    const rawPhone = body.phone || body.waNumber || body.wa_number || body.merchant_phone || '';
    const rawEmail = body.email || body.customer_email || '';
    const rawPassword = body.password || body.pin || body.access_pin || '123456';
    const rawCategory = body.category || body.business_type || 'PHYSICAL';
    const rawPlanInput = body.selected_plan || body.selectedPlan || body.plan_tier || body.tier || 'ads_performance';
    const planConfig = resolveRegistrationPlan(rawPlanInput);
    const referralCode = body.referral_code || body.referralCode || body.ref || null;
    const utmParams = body.utm_params || {
      utm_source: body.utm_source || 'organik',
      utm_medium: body.utm_medium || '',
      utm_campaign: body.utm_campaign || '',
      utm_content: body.utm_content || '',
      utm_term: body.utm_term || '',
    };

    const shopName = String(rawShopName).trim();
    const phone = normalizeWhatsAppNumber(rawPhone);
    const email = String(rawEmail).trim().toLowerCase();
    const password = String(rawPassword).trim();

    // ── STRICT BACKEND TRIAL GUARD: HANYA ADS PERFORMANCE (Rp 0 TRIAL 7 HARI) ──
    // Hanya pendaftar dengan paket Ads Performance yang diizinkan memproses aktivasi trial WhatsApp Rp 0.
    // Paket Solo, Checkout Lite, dan Team Scale memerlukan pembayaran langganan langsung.
    if (!planConfig.isTrial || planConfig.dbTier !== 'PRO_SCALE') {
      return NextResponse.json(
        {
          success: false,
          error:
            'Trial gratis 7 hari (Rp 0) hanya tersedia untuk paket Ads Performance. Paket Solo dan Team Scale memerlukan pembayaran langganan langsung.',
          requires_payment: true,
          plan: planConfig.planLabel,
          action: 'REDIRECT_TO_PAYMENT',
          instruction: 'Silakan lanjutkan pembayaran paket langganan Anda melalui invoice QRIS.',
        },
        { status: 403 }
      );
    }

    if (!shopName) {
      return NextResponse.json(
        { success: false, error: 'Nama toko wajib diisi.' },
        { status: 400 }
      );
    }

    if (!phone || !phone.startsWith('628') || phone.length < 10) {
      return NextResponse.json(
        { success: false, error: 'Nomor WhatsApp tidak valid. Gunakan format 08xxx atau 628xxx.' },
        { status: 400 }
      );
    }

    // Generate clean slug
    let baseSlug = sanitizeSlug(body.slug || body.tenant_slug || shopName);
    if (!baseSlug) {
      baseSlug = `toko-${Date.now().toString().slice(-6)}`;
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database Supabase tidak terhubung.' },
        { status: 500 }
      );
    }

    // Cek apakah nomor WhatsApp sudah memiliki toko terdaftar
    const { data: existingTenantsWithPhone } = await supabase
      .from('tenants')
      .select('id, slug, status, metadata')
      .or(`metadata->>phone.eq.${phone},metadata->>whatsapp_number.eq.${phone}`)
      .limit(5);

    // Generate Token Verifikasi 6 Digit (contoh: "BT-8921")
    const verificationToken = generateVerificationToken();
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const trialEndsAt = planConfig.isTrial
      ? new Date(Date.now() + planConfig.trialDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const officialWaNumber = getOfficialWhatsAppNumber();
    const activationMessage = `AKTIVASI ${verificationToken}`;
    const waDeepLink = `https://wa.me/${officialWaNumber}?text=${encodeURIComponent(activationMessage)}`;

    // Persiapkan industry menu standar untuk bot
    const defaultMenu = buildDefaultIndustryMenu(shopName, rawCategory);

    // Simpan ke tabel tenants dengan status 'PENDING'
    const tenantPayload = {
      slug: baseSlug,
      name: shopName,
      category: rawCategory,
      business_type: rawCategory,
      tier: planConfig.dbTier, // 'STARTER' | 'PRO_SCALE' | 'ENTERPRISE' (ADR canonical)
      status: 'PENDING',
      is_active: false,
      trial_ends_at: trialEndsAt,
      access_username: baseSlug,
      access_password: password,
      metadata: {
        shop_name: shopName,
        store_name: shopName,
        name: shopName,
        merchant_name: body.merchant_name || shopName,
        phone,
        wa_number: phone,
        whatsapp_number: phone,
        email: email || null,
        password_raw: password,
        wa_verification_token: verificationToken,
        activation_code: activationMessage,
        code: verificationToken,
        token: verificationToken,
        wa_verification_status: 'PENDING',
        status: 'PENDING',
        wa_verification_expires_at: tokenExpiresAt,
        official_waba_number: officialWaNumber,
        selected_plan: planConfig.planLabel,
        plan_tier: planConfig.dbTier,
        plan_type: planConfig.planType,
        tier: planConfig.dbTier,
        is_trial: planConfig.isTrial,
        trial_days: planConfig.trialDays,
        trial_ends_at: trialEndsAt,
        referral_code: referralCode,
        utm_params: utmParams,
        interactive_menus: [defaultMenu],
        bot_mode: 'STATIC',
        bot_status: 'BOT_ACTIVE',
        is_bot_active: true,
        created_via: 'wa_user_initiated_register',
        initiated_at: new Date().toISOString(),
      },
    };

    const { data: upsertedTenant, error: upsertErr } = await supabase
      .from('tenants')
      .upsert(tenantPayload, { onConflict: 'slug' })
      .select('id, slug, name, status')
      .single();

    if (upsertErr) {
      console.error('[RegisterInit] Supabase upsert error:', upsertErr);
      return NextResponse.json(
        {
          success: false,
          error: `Gagal menyiapkan pendaftaran: ${upsertErr.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      token: verificationToken,
      wa_url: waDeepLink,
      tenant_slug: baseSlug,
      official_number: officialWaNumber,
      message: 'Token verifikasi berhasil dibuat. Silakan kirim pesan aktivasi melalui WhatsApp.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Terjadi gangguan internal saat inisiasi pendaftaran.';
    console.error('[RegisterInit] Exception:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
