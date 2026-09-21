import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase, getSupabaseAdmin } from '@/lib/supabaseClient';
import { getBackendApiUrl } from '@/lib/api-config';
import { sendBoonPilotVerificationEmail } from '@/lib/boonpilot-email';
import { buildDefaultIndustryMenu } from '@/lib/zero-ai-engine';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const storeName = body.storeName || body.store_name || body.name;
    const rawSlug = body.slug || body.rawSlug || body.tenant_slug;
    const waNumber = body.waNumber || body.wa_number || body.phone || body.merchant_phone;
    const merchantName = body.merchantName || body.merchant_name || storeName;
    const customerEmail = body.email || body.customer_email || null;
    const pin = String(body.pin || body.password || body.access_pin || '123456').trim();
    const rawPlan = String(
      body.selected_plan ||
      body.selectedPlan ||
      body.plan_tier ||
      body.tier ||
      body.plan ||
      'ads_performance'
    ).trim().toLowerCase();

    // Standarisasi 3 Tier Resmi sesuai ARCHITECTURE.md ADR:
    // - Ads Performance  → 'PRO_SCALE' (is_trial: true, Trial 7 Hari)
    // - Checkout / Entry → 'STARTER'   (plan_type: 'entry')
    // - Solo / Starter   → 'STARTER'   (plan_type: 'solo')
    // - Team Scale       → 'ENTERPRISE'
    // CHECKPOINT: CHECKOUT_LITE tidak lagi menjadi nilai enum DB yang valid.
    let dbTier: 'STARTER' | 'PRO_SCALE' | 'ENTERPRISE' = 'PRO_SCALE';
    let canonicalPlanTier: string = 'PRO_SCALE';
    let planType: 'ads_performance' | 'entry' | 'solo' | 'team_scale' = 'ads_performance';
    let isTrial = false;

    // 1. Ads Performance (Hero Promo Trial 7 Hari) - DB: 'PRO_SCALE'
    if (
      rawPlan === 'ads_performance' ||
      rawPlan === 'pro_ads' ||
      rawPlan === 'pro_scale' ||
      rawPlan.includes('ads') ||
      rawPlan.includes('performance')
    ) {
      dbTier = 'PRO_SCALE';
      canonicalPlanTier = 'PRO_SCALE';
      planType = 'ads_performance';
      isTrial = body.is_trial !== undefined ? Boolean(body.is_trial) : true;
    } else if (
      rawPlan === 'checkout_lite' ||
      rawPlan === 'checkout' ||
      rawPlan === 'entry' ||
      rawPlan === 'lite' ||
      rawPlan.includes('checkout') ||
      rawPlan.includes('lite') ||
      rawPlan.includes('entry')
    ) {
      dbTier = 'STARTER';
      canonicalPlanTier = 'STARTER';
      planType = 'entry';
      isTrial = false;
    } else if (
      rawPlan === 'solo' ||
      rawPlan === 'starter' ||
      rawPlan === 'basic' ||
      rawPlan.includes('solo') ||
      rawPlan.includes('starter')
    ) {
      dbTier = 'STARTER';
      canonicalPlanTier = 'STARTER';
      planType = 'solo';
      isTrial = false;
    } else if (
      rawPlan === 'team_scale' ||
      rawPlan === 'scale' ||
      rawPlan === 'enterprise' ||
      rawPlan.includes('team') ||
      rawPlan.includes('scale') ||
      rawPlan.includes('enterprise')
    ) {
      dbTier = 'ENTERPRISE';
      canonicalPlanTier = 'ENTERPRISE';
      planType = 'team_scale';
      isTrial = false;
    } else {
      // Default: Ads Performance Trial
      dbTier = 'PRO_SCALE';
      canonicalPlanTier = 'PRO_SCALE';
      planType = 'ads_performance';
      isTrial = true;
    }

    const category = body.category || body.business_type || 'PHYSICAL';
    const referralCode = body.referralCode || body.referral_code || body.ref || body.affiliate_code || null;

    const {
      template = 'COMMERCE_TEMPLATE',
      onboardingMode = 'SELF_SERVICE',
      productType,
      productName,
      productPrice,
      promoBundle,
      variants,
      downloadUrl,
      aiTone,
      bankName,
      bankAccountNumber,
      bankAccountHolder,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      utms,
    } = body;

    const incomingCategory = (
      category ||
      body.business_category ||
      body.business_type ||
      body.vertical_type ||
      body.category_id ||
      body.industry ||
      ''
    ).toString().trim();

    if (!storeName || !waNumber || !incomingCategory) {
      return NextResponse.json(
        {
          success: false,
          error: 'Nama toko, nomor WhatsApp, dan kategori industri wajib diisi.',
        },
        { status: 400 }
      );
    }

    // Format WhatsApp number to standard international format (628...)
    let formattedWa = String(waNumber).replace(/[^0-9]/g, '');
    if (formattedWa.startsWith('0')) {
      formattedWa = '62' + formattedWa.slice(1);
    } else if (formattedWa.startsWith('8')) {
      formattedWa = '62' + formattedWa;
    }

    // Generate clean slug
    const generatedSlug = (
      rawSlug ||
      storeName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
    ) || `tenant-${Date.now().toString().slice(-6)}`;

    // Resolve canonical business category without hardcoding retail / e-commerce
    const catUpper = incomingCategory.toUpperCase();
    const isDigital = productType === 'digital' || catUpper === 'DIGITAL' || catUpper.includes('COURSE') || catUpper.includes('ECOURSE') || catUpper.includes('EBOOK');
    const isProService = ['PROFESSIONAL', 'CONSULT', 'LEGAL', 'TRAVEL', 'UMROH', 'PRO_SERVICE'].some(k => catUpper.includes(k));
    const isFieldService = !isProService && ['FIELD_SERVICE', 'LOCAL_SERVICE', 'SERVICE', 'REPAIR', 'JASA', 'TEKNISI', 'BOOKING'].some(k => catUpper.includes(k));
    const isFood = catUpper === 'FOOD' || catUpper === 'FNB' || catUpper === 'KULINER' || catUpper.includes('MAKANAN') || catUpper.includes('MINUMAN');
    const isCreator = catUpper === 'CREATOR_AGENCY' || catUpper === 'CREATOR' || catUpper === 'AGENCY';
    const isRetail = catUpper === 'RETAIL' || catUpper === 'RETAIL_PHYSICAL' || catUpper.includes('RETAIL');

    let resolvedBusinessType: string;
    if (isProService) {
      resolvedBusinessType = 'PROFESSIONAL_SERVICE';
    } else if (isFieldService) {
      resolvedBusinessType = 'FIELD_SERVICE';
    } else if (isFood) {
      resolvedBusinessType = 'FOOD';
    } else if (isCreator) {
      resolvedBusinessType = 'CREATOR_AGENCY';
    } else if (isDigital) {
      resolvedBusinessType = 'DIGITAL';
    } else if (isRetail) {
      resolvedBusinessType = 'RETAIL';
    } else if (incomingCategory) {
      // Nilai kategori dari payload disimpan langsung apa adanya
      resolvedBusinessType = incomingCategory;
    } else {
      resolvedBusinessType = 'PHYSICAL';
    }

    const isServiceStore = isProService || isFieldService;
    const isPhysicalStore = isFood || isRetail || (!isServiceStore && !isDigital && !isCreator);

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database Supabase tidak terhubung.' },
        { status: 500 }
      );
    }

    // Lookup affiliate partner from referral code (Organic registrations have cleanRef = null)
    const rawRefClean = referralCode ? String(referralCode).trim().toLowerCase() : null;
    const cleanRef = (rawRefClean && rawRefClean !== '1' && rawRefClean !== 'null' && rawRefClean !== 'undefined') ? rawRefClean : null;
    let matchedAffiliateId: string | null = cleanRef ? (body.affiliate_id || body.referrer_id || null) : null;
    let matchedAffiliateName: string | null = null;

    if (cleanRef && !matchedAffiliateId) {
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
        console.warn('Lookup affiliate error in onboard route:', lookupErr);
      }
    }

    const utmObj = {
      source: utm_source || utms?.source || utms?.utm_source || 'organik',
      medium: utm_medium || utms?.medium || utms?.utm_medium || null,
      campaign: utm_campaign || utms?.campaign || utms?.utm_campaign || null,
      content: utm_content || utms?.content || utms?.utm_content || null,
      term: utm_term || utms?.term || utms?.utm_term || null,
    };

    const trialEndsAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const subscriptionEndsAt = isTrial ? trialEndsAt : new Date(Date.now() + 30 * 86400000).toISOString();

    const storeStatus = isTrial ? 'trial' : 'active';

    // Generate verification token (24 hours expiry)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    // Generate default dynamic Zero-AI navigation menu based on 6 official industry categories
    const defaultIndustryMenu = buildDefaultIndustryMenu(resolvedBusinessType, {
      name: storeName,
      slug: generatedSlug,
    });

    // Cek tenant eksisting untuk menjaga wa_verification_token dari registrasi
    const { data: existingTenant } = await supabase
      .from('tenants')
      .select('id, slug, status, metadata')
      .eq('slug', generatedSlug)
      .maybeSingle();

    const existingMeta = (existingTenant?.metadata && typeof existingTenant.metadata === 'object')
      ? (existingTenant.metadata as Record<string, any>)
      : {};

    const incomingWaToken =
      body.wa_verification_token ||
      body.code ||
      body.token ||
      existingMeta.wa_verification_token ||
      existingMeta.code ||
      existingMeta.token ||
      null;

    let tenantStatus = 'unverified';
    if (incomingWaToken || isTrial || body.status === 'PENDING') {
      tenantStatus = 'PENDING';
    } else if (existingTenant?.status && ['pending', 'pending_wa_verification', 'pending_activation', 'trial'].includes(String(existingTenant.status).toLowerCase())) {
      tenantStatus = existingTenant.status;
    }

    // 1. INSERT / UPSERT ke tabel tenants di Supabase
    const { data: upsertedTenant, error: upsertError } = await supabase
      .from('tenants')
      .upsert(
        {
          slug: generatedSlug,
          name: storeName,
          category: resolvedBusinessType,
          business_type: resolvedBusinessType,
          tier: dbTier,
          status: tenantStatus,
          is_active: false,
          trial_ends_at: isTrial ? trialEndsAt : null,
          subscription_ends_at: subscriptionEndsAt,
          access_username: generatedSlug,
          access_password: pin,
          metadata: {
            ...existingMeta,
            template,
            onboarding_mode: onboardingMode,
            merchant_name: merchantName,
            whatsapp_number: formattedWa,
            wa_number: formattedWa,
            phone: formattedWa,
            email: customerEmail,
            email_verified: Boolean(existingMeta.email_verified),
            verification_token: verificationToken,
            verification_expires_at: verificationExpiresAt,
            ...(incomingWaToken ? {
              wa_verification_token: incomingWaToken,
              activation_code: 'AKTIVASI ' + incomingWaToken,
              code: incomingWaToken,
              token: incomingWaToken,
              wa_verification_status: 'PENDING',
              status: 'PENDING',
            } : {}),
            access_pin: pin,
            pin_hash: pin,
            plan_tier: canonicalPlanTier,
            plan_type: planType,
            tier: dbTier,
            selected_plan:
              planType === 'entry' || body.selected_plan === 'Paket Checkout'
                ? 'Paket Checkout'
                : planType === 'solo' || body.selected_plan === 'Paket Solo'
                ? 'Paket Solo'
                : dbTier === 'ENTERPRISE' || body.selected_plan === 'Team Scale'
                ? 'Team Scale'
                : (isTrial ? 'Ads Performance Trial' : 'Ads Performance'),
            subscription_status: isTrial ? 'trial' : 'active',
            is_trial: isTrial,
            trial_days: isTrial ? 7 : 0,
            created_via: isTrial ? 'register_ads_trial' : 'register_paid',
            trial_ends_at: isTrial ? trialEndsAt : null,
            subscription_ends_at: subscriptionEndsAt,
            referral_code: cleanRef,
            affiliate_code: cleanRef,
            ref: cleanRef,
            affiliate_id: matchedAffiliateId,
            referrer_id: matchedAffiliateId,
            referrer_name: matchedAffiliateName,
            business_category: resolvedBusinessType,
            business_type: resolvedBusinessType,
            vertical_type: resolvedBusinessType,
            category: resolvedBusinessType,
            interactive_menus: [defaultIndustryMenu],
            bot_mode: 'STATIC',
            bot_status: 'BOT_ACTIVE',
            is_bot_active: true,
            bot_paused: false,
            payment_settings: {
              ...(existingMeta.payment_settings || {}),
              qris_raw: existingMeta.payment_settings?.qris_raw || null,
              qris: existingMeta.payment_settings?.qris || null,
              is_qris_active: true,
              provider: 'SELLER_NATIVE_QRIS',
            },
            payment_config: {
              ...(existingMeta.payment_config || {}),
              mode: 'SELLER_NATIVE_QRIS',
              provider: 'SELLER_NATIVE_QRIS',
              enable_qris: true,
              unique_code_system: 'DOWNWARD',
            },
            bot_persona: {
              ...(existingMeta.bot_persona || {}),
              tone: 'ramah, profesional, solutif',
              rule: 'ZERO_URL_HALLUCINATION',
              lead_collection: 'NATIVE_STATE_MACHINE',
            },
            utm_params: utmObj,
            utm_source: utmObj.source,
            utm_medium: utmObj.medium,
            utm_campaign: utmObj.campaign,
            utm_content: utmObj.content,
            utm_term: utmObj.term,
            capabilities: {
              inbox: dbTier === 'ENTERPRISE',
              ai_bot: true,
              shipping: isPhysicalStore,
              booking: isServiceStore,
              digital_fulfillment: isDigital,
            },
            // Clean state: Katalog toko baru harus 100% kosong (tanpa produk tiruan / mock)
            products: [],
            product: (productName && productName.trim() !== storeName.trim() && Number(productPrice) > 0) ? {
              type: isDigital ? 'digital' : isServiceStore ? 'service' : 'physical',
              name: productName,
              price: Number(productPrice || 0),
              promo: promoBundle || null,
              variants: variants || null,
              download_url: downloadUrl || null,
              tone: aiTone || 'RAMAH',
            } : null,
            bank: {
              name: bankName || 'BCA',
              account: bankAccountNumber || '-',
              holder: bankAccountHolder || merchantName,
            },
            onboarded_at: new Date().toISOString(),
          },
        },
        { onConflict: 'slug' }
      )
      .select('id, slug, name, tier, category, created_at')
      .maybeSingle();

    if (upsertError) {
      console.error('Supabase tenant upsert error:', upsertError);
      return NextResponse.json(
        {
          success: false,
          error: `Gagal menyimpan toko ke database: ${upsertError.message || JSON.stringify(upsertError)}`,
        },
        { status: 500 }
      );
    }

    // 2. Simpan record atribusi referral ke tabel attributions
    const effectiveTenantId = upsertedTenant?.id;
    if (effectiveTenantId && (matchedAffiliateId || cleanRef)) {
      try {
        await supabase.from('attributions').insert({
          tenant_id: effectiveTenantId,
          session_id: `reg_${generatedSlug}_${Date.now()}`,
          affiliate_id: matchedAffiliateId || null,
          utm_source: utmObj.source || 'organik',
          utm_medium: utmObj.medium || null,
          utm_campaign: utmObj.campaign || null,
          utm_content: utmObj.content || null,
          utm_term: utmObj.term || null,
          ip_hash: 'merchant_reg',
          created_at: new Date().toISOString(),
        });
      } catch (attrErr) {
        console.warn('Attribution insert note:', attrErr);
      }
    }

    // Meta WhatsApp Sandbox Bot Number
    const botNumber = process.env.NEXT_PUBLIC_META_BOT_NUMBER || '15556769563';
    const redirectWaUrl = `https://wa.me/${botNumber}?text=Halo%20Admin%20BoonTrack%2C%20saya%20baru%20saja%20mendaftar%20toko%20${encodeURIComponent(generatedSlug)}`;

    // 3. Kirim Email Aktivasi Resmi dari Boon Pilot via Resend
    let verificationSent = false;
    let verificationError: string | null = null;

    if (customerEmail) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_SHOP_URL || 'https://shop.boontrack.com';
        const verificationUrl = `${baseUrl}/auth/confirm?token=${verificationToken}&type=merchant&slug=${generatedSlug}&id=${effectiveTenantId || ''}`;

        const emailResult = await sendBoonPilotVerificationEmail({
          to: customerEmail,
          name: merchantName || storeName,
          role: 'merchant',
          verificationUrl,
          storeName,
          slug: generatedSlug,
          expiresInHours: 24,
        });

        verificationSent = Boolean(emailResult.success);
        if (!verificationSent) {
          verificationError = emailResult.error || 'Resend API menolak pengiriman email aktivasi.';
          console.error('[Onboard] Boon Pilot verification email failed:', verificationError);
        }
      } catch (mailErr) {
        verificationError = mailErr instanceof Error ? mailErr.message : 'Gagal memanggil service email Resend.';
        console.error('[Onboard] Exception sending Boon Pilot verification email:', mailErr);
      }
    }

    // 4. Forward/Sync ke Core Backend jika online
    try {
      await fetch(getBackendApiUrl('/api/v1/tenants/onboard'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      });
    } catch (railwayErr) {
      console.warn('Railway backend onboard sync note:', railwayErr);
    }

    // STRICT CHECK: Jika merchant menyertakan email namun email verifikasi gagal terkirim,
    // jangan kembalikan status 200 palsu agar UI tidak menampilkan false-success modal.
    if (customerEmail && !verificationSent) {
      return NextResponse.json(
        {
          success: false,
          error: `Gagal mengirim email aktivasi ke ${customerEmail}: ${verificationError || 'Layanan email tidak dapat dihubungi'}. Akun toko berhasil disiapkan, namun belum aktif. Silakan coba kembali atau periksa alamat email Anda.`,
          needs_verification: true,
          verification_sent: false,
          verification_error: verificationError,
          tenant: {
            id: effectiveTenantId,
            slug: generatedSlug,
            storeName,
            email: customerEmail,
          },
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Toko berhasil didaftarkan. Silakan konfirmasi email Anda untuk aktivasi.',
      needs_verification: true,
      verification_sent: true,
      email: customerEmail,
      tenant: {
        id: effectiveTenantId,
        slug: generatedSlug,
        storeName,
        email: customerEmail,
        category: resolvedBusinessType,
        referralCode: cleanRef,
        affiliateId: matchedAffiliateId,
        tier: dbTier,
        planTier: canonicalPlanTier,
        isTrial,
      },
      redirectWaUrl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan sistem saat registrasi toko.';
    console.error('Registration onboarding error:', err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
