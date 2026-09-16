import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase, getSupabaseAdmin } from '@/lib/supabaseClient';
import { getBackendApiUrl } from '@/lib/api-config';

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
    const rawPlan = String(body.selectedPlan || body.plan_tier || body.tier || body.plan || 'starter').toLowerCase();

    // Standarisasi 3 Tier Resmi & Pemetaan ke Enum PostgreSQL (tenant_tier_enum):
    // 1. "Solo / Starter" -> enum database: 'STARTER'
    // 2. "Ads Performance" -> enum database: 'PRO_SCALE'
    // 3. "Team Scale" -> enum database: 'ENTERPRISE'
    let dbTier: 'STARTER' | 'PRO_SCALE' | 'ENTERPRISE' = 'STARTER';
    let canonicalPlanTier: 'STARTER' | 'PRO_SCALE' | 'ENTERPRISE' = 'STARTER';
    let isTrial = false;

    if (rawPlan.includes('team') || rawPlan.includes('enterprise') || rawPlan.includes('scale')) {
      dbTier = 'ENTERPRISE';
      canonicalPlanTier = 'ENTERPRISE';
      isTrial = false;
    } else if (rawPlan.includes('ads') || rawPlan.includes('performance') || rawPlan.includes('pro')) {
      dbTier = 'PRO_SCALE';
      canonicalPlanTier = 'PRO_SCALE';
      isTrial = false;
    } else {
      // Solo / Starter (Default)
      dbTier = 'STARTER';
      canonicalPlanTier = 'STARTER';
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

    // Lookup affiliate partner from referral code
    const cleanRef = referralCode ? String(referralCode).trim().toLowerCase() : null;
    let matchedAffiliateId: string | null = body.affiliate_id || body.referrer_id || null;
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
          status: storeStatus,
          is_active: true,
          trial_ends_at: isTrial ? trialEndsAt : null,
          subscription_ends_at: subscriptionEndsAt,
          access_username: generatedSlug,
          access_password: pin,
          metadata: {
            template,
            onboarding_mode: onboardingMode,
            merchant_name: merchantName,
            whatsapp_number: formattedWa,
            wa_number: formattedWa,
            phone: formattedWa,
            email: customerEmail,
            access_pin: pin,
            pin_hash: pin,
            plan_tier: canonicalPlanTier,
            tier: dbTier,
            created_via: isTrial ? 'register_solo_trial' : 'register_paid',
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
            product: {
              type: isDigital ? 'digital' : isServiceStore ? 'service' : 'physical',
              name: productName || storeName,
              price: Number(productPrice || 0),
              promo: promoBundle || null,
              variants: variants || null,
              download_url: downloadUrl || null,
              tone: aiTone || 'RAMAH',
            },
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

    // 3. Forward/Sync ke Core Backend jika online
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

    return NextResponse.json({
      success: true,
      message: 'Toko berhasil didaftarkan dan disimpan ke database.',
      tenant: {
        id: effectiveTenantId,
        slug: generatedSlug,
        storeName,
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
