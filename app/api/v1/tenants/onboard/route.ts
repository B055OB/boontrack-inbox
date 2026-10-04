import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase, getSupabaseAdmin } from '@/lib/supabaseClient';
import { getBackendApiUrl } from '@/lib/api-config';
import { sendBoonPilotVerificationEmail } from '@/lib/boonpilot-email';
import { sendNewStoreReferralNotification } from '@/lib/affiliate-notification-service';
import { buildDefaultIndustryMenu } from '@/lib/zero-ai-engine';
import { saveStoreShippingConfig } from '@/lib/shipping/self-pickup';
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

    // Standarisasi Tier Resmi sesuai ARCHITECTURE.md ADR:
    // - Ads Performance  → 'PRO_SCALE'     (is_trial: true, Trial 7 Hari)
    // - Checkout Lite    → 'CHECKOUT_LITE' (plan_type: 'entry', PENDING_PAYMENT, wajib bayar)
    // - Solo / Starter   → 'STARTER'       (plan_type: 'solo', PENDING_PAYMENT, wajib bayar)
    // - Team Scale       → 'ENTERPRISE'    (plan_type: 'team_scale', PENDING_PAYMENT, wajib bayar)
    let dbTier: 'STARTER' | 'PRO_SCALE' | 'ENTERPRISE' | 'CHECKOUT_LITE' = 'PRO_SCALE';
    let canonicalPlanTier: 'PRO_SCALE' | 'CHECKOUT_LITE' | 'STARTER' | 'ENTERPRISE' = 'PRO_SCALE';
    let planType: 'ads_performance' | 'entry' | 'solo' | 'team_scale' = 'ads_performance';
    let planPrice = 299000;
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
      planPrice = 299000;
      isTrial = true;
    } else if (
      rawPlan === 'checkout_lite' ||
      rawPlan === 'checkout' ||
      rawPlan === 'entry' ||
      rawPlan === 'lite' ||
      rawPlan.includes('checkout') ||
      rawPlan.includes('lite')
    ) {
      dbTier = 'CHECKOUT_LITE';
      canonicalPlanTier = 'CHECKOUT_LITE';
      planType = 'entry';
      planPrice = 59000;
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
      planPrice = 199000;
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
      planPrice = 499000;
      isTrial = false;
    } else {
      // Default: Ads Performance Trial
      dbTier = 'PRO_SCALE';
      canonicalPlanTier = 'PRO_SCALE';
      planType = 'ads_performance';
      planPrice = 299000;
      isTrial = true;
    }

    // STRICT TRIAL GATEKEEPER INVARIANT:
    // HANYA tier 'PRO_SCALE' yang berhak atas status 'TRIAL' 7 hari.
    // Tier 'CHECKOUT_LITE', 'STARTER', dan 'ENTERPRISE' WAJIB berstatus 'PENDING_PAYMENT' / is_active = false.
    if (canonicalPlanTier !== 'PRO_SCALE') {
      isTrial = false;
    }

    if (body.amount && typeof body.amount === 'number' && body.amount > 0) {
      planPrice = body.amount;
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
          .select('id, name, referral_code, email')
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

    const trialEndsAt = isTrial ? new Date(Date.now() + 7 * 86400000).toISOString() : null;
    const subscriptionEndsAt = isTrial ? trialEndsAt : null;

    const storeStatus = isTrial ? 'trial' : 'pending_payment';

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
    if (!isTrial) {
      // Non-PRO_SCALE (CHECKOUT_LITE, STARTER, ENTERPRISE) WAJIB berstatus PENDING_PAYMENT
      tenantStatus = 'PENDING_PAYMENT';
    } else if (incomingWaToken || isTrial || body.status === 'PENDING') {
      tenantStatus = 'PENDING';
    } else if (existingTenant?.status && ['pending', 'pending_wa_verification', 'pending_activation', 'trial'].includes(String(existingTenant.status).toLowerCase())) {
      tenantStatus = existingTenant.status;
    }

    // Inisialisasi Invoice Xendit jika toko berstatus PENDING_PAYMENT (non-PRO_SCALE)
    let invoiceUrl: string | null = null;
    let invoiceId: string | null = null;
    const invoiceExternalId = `SUB-${generatedSlug}-${canonicalPlanTier}-${Date.now()}`;

    if (!isTrial) {
      const coreBackendUrl = (
        process.env.CORE_BACKEND_URL ||
        process.env.CORE_API_URL ||
        process.env.NEXT_PUBLIC_CORE_API_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        'https://api.boontrack.com'
      ).replace(/\/$/, '');

      // 1. Coba forward ke Core Backend API untuk membuat invoice Xendit resmi
      try {
        const coreRes = await fetch(`${coreBackendUrl}/api/v1/shop/subscriptions/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_slug: generatedSlug,
            plan_tier: canonicalPlanTier,
            amount: planPrice,
            merchant_name: merchantName || storeName,
            merchant_phone: formattedWa,
            customer_email: customerEmail || 'merchant@boontrack.com',
            referral_code: cleanRef,
          }),
        });

        if (coreRes.ok) {
          const coreData = await coreRes.json();
          invoiceUrl = coreData.invoice_url || coreData.payment_url || null;
          invoiceId = coreData.invoice_id || coreData.id || null;
        }
      } catch (coreErr) {
        console.warn('[Onboard] Core Backend subscription create note:', coreErr);
      }

      // 2. Direct Official Xendit Invoice API jika Core Backend offline/tidak menyediakan invoice URL
      if (!invoiceUrl) {
        const xenditKey = (
          process.env.XENDIT_API_KEY ||
          process.env.XENDIT_SECRET_KEY ||
          'xnd_development_2itAoTg8FOAdr8Vk7jKpU0MksgDSAjaWzlLHzEMkPuHcRyf5IUxfvO7MG1KPe'
        ).trim();
        const xenditApiUrl = (process.env.XENDIT_API_URL || 'https://api.xendit.co').replace(/\/$/, '');
        const authHeader = `Basic ${Buffer.from(`${xenditKey}:`).toString('base64')}`;
        const appDomain = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SHOP_URL || 'https://shop.boontrack.com';

        try {
          const xenditPayload: Record<string, any> = {
            external_id: invoiceExternalId,
            amount: planPrice,
            description: `Aktivasi Langganan ${storeName} (${canonicalPlanTier})`,
            invoice_duration: 86400,
            currency: 'IDR',
            success_redirect_url: `${appDomain}/${generatedSlug}/dashboard?payment=success`,
            failure_redirect_url: `${appDomain}/register?status=failed`,
          };
          if (formattedWa) {
            xenditPayload.customer = { mobile_number: formattedWa.startsWith('+') ? formattedWa : `+${formattedWa}` };
          }
          if (customerEmail) {
            xenditPayload.payer_email = customerEmail;
          }

          const xenditRes = await fetch(`${xenditApiUrl}/v2/invoices`, {
            method: 'POST',
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(xenditPayload),
          });

          if (xenditRes.ok) {
            const xenditData = await xenditRes.json();
            invoiceUrl = xenditData.invoice_url || xenditData.web_pay_url || null;
            invoiceId = xenditData.id || null;
          } else {
            console.warn('[Onboard] Direct Xendit API returned non-OK status:', xenditRes.status);
          }
        } catch (xenditErr) {
          console.warn('[Onboard] Direct Xendit invoice creation note:', xenditErr);
        }
      }

      // 3. Fallback URL jika Xendit API unreachable
      if (!invoiceUrl) {
        invoiceUrl = `https://checkout.xendit.co/web/${invoiceExternalId}`;
      }
      if (!invoiceId) {
        invoiceId = invoiceExternalId;
      }
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
          subscription_status: storeStatus,
          subscription_tier: dbTier,
          is_active: false,
          trial_ends_at: isTrial ? trialEndsAt : null,
          subscription_ends_at: subscriptionEndsAt,
          access_username: generatedSlug,
          access_password: pin,
          metadata: {
            ...existingMeta,
            template: isFood ? 'FOOD' : (body.template || existingMeta.template || template),
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
              status: isTrial ? 'PENDING' : 'PENDING_PAYMENT',
            } : {}),
            access_pin: pin,
            pin_hash: pin,
            plan_tier: canonicalPlanTier,
            plan_type: planType,
            tier: dbTier,
            selected_plan:
              canonicalPlanTier === 'CHECKOUT_LITE' || planType === 'entry' || body.selected_plan === 'Paket Checkout'
                ? 'Paket Checkout'
                : canonicalPlanTier === 'STARTER' || planType === 'solo' || body.selected_plan === 'Paket Solo'
                ? 'Paket Solo'
                : canonicalPlanTier === 'ENTERPRISE' || dbTier === 'ENTERPRISE' || body.selected_plan === 'Team Scale'
                ? 'Team Scale'
                : (isTrial ? 'Ads Performance Trial' : 'Ads Performance'),
            subscription_status: storeStatus,
            is_trial: isTrial,
            trial_days: isTrial ? 7 : 0,
            is_pending_payment: !isTrial,
            ...(invoiceUrl ? {
              invoice_url: invoiceUrl,
              invoice_id: invoiceId,
              xendit_invoice_id: invoiceId,
              xendit_external_id: invoiceExternalId,
            } : {}),
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
              fnb: isFood,
              booking: isServiceStore,
              digital_fulfillment: isDigital,
            },
            fnb_settings: isFood ? {
              is_enabled: true,
              instant_delivery_enabled: true,
              self_pickup_enabled: true,
              kitchen_notes_enabled: true,
              instant_provider: 'GOSEND_GRAB',
              max_radius_km: 30,
              kitchen_hours: '08:00 - 21:00 WIB',
              kitchen_address: 'Dapur Utama / Outlet Resto',
              ...(existingMeta.fnb_settings || {}),
            } : existingMeta.fnb_settings || undefined,
            fulfillment_settings: isFood ? {
              instant_delivery: true,
              self_pickup: true,
              kitchen_notes: true,
              ...(existingMeta.fulfillment_settings || {}),
            } : existingMeta.fulfillment_settings || undefined,
            self_pickup_config: isFood ? {
              is_enabled: true,
              pickup_address: 'Dapur Utama / Outlet Resto',
              pickup_operational_hours: '08:00 - 21:00 WIB',
              pickup_instructions: 'Silakan sebutkan nama pemesan atau nomor nota saat mengambil pesanan.',
              ...(existingMeta.self_pickup_config || {}),
            } : existingMeta.self_pickup_config || undefined,
            shipping_config: {
              ...(existingMeta.shipping_config || {}),
              ...(isFood ? {
                is_self_pickup_enabled: true,
                pickup_address: 'Dapur Utama / Outlet Resto',
                pickup_operational_hours: '08:00 - 21:00 WIB',
                pickup_instructions: 'Silakan sebutkan nama pemesan atau nomor nota saat mengambil pesanan.',
                fnb_settings: {
                  is_enabled: true,
                  instant_delivery_enabled: true,
                  self_pickup_enabled: true,
                  kitchen_notes_enabled: true,
                  instant_provider: 'GOSEND_GRAB',
                  max_radius_km: 30,
                  kitchen_hours: '08:00 - 21:00 WIB',
                  ...(existingMeta.shipping_config?.fnb_settings || {}),
                },
              } : {}),
            },
            single_page_config: {
              ...(existingMeta.single_page_config || {}),
              ...(isFood ? {
                template: 'FOOD',
                product_preset: 'FOOD',
                is_digital: false,
                hide_address_for_digital: false,
                requires_kitchen_notes: true,
                allow_instant_delivery: true,
                allow_pickup: true,
              } : {}),
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

    const effectiveTenantId = upsertedTenant?.id;

    // Sinkronisasi status langganan ke tabel shop_subscriptions
    if (effectiveTenantId) {
      if (isTrial) {
        try {
          await supabase.from('shop_subscriptions').upsert({
            tenant_id: effectiveTenantId,
            tier: dbTier,
            status: 'TRIAL',
            current_period_starts_at: new Date().toISOString(),
            current_period_ends_at: trialEndsAt,
            expires_at: trialEndsAt,
            amount_paid: 0,
            metadata: {
              plan: 'Ads Performance Trial',
              created_via: 'onboard_route',
            },
          }, { onConflict: 'tenant_id,status' });
        } catch (subErr) {
          console.warn('[Onboard] Non-fatal shop_subscriptions sync note:', subErr);
        }
      } else {
        // NON-PRO_SCALE: Rekam status PENDING_PAYMENT di shop_subscriptions dengan invoice_id
        try {
          await supabase.from('shop_subscriptions').insert({
            tenant_id: effectiveTenantId,
            tier: dbTier,
            duration_months: 1,
            current_period_ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
            expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
            status: 'PENDING_PAYMENT',
            invoice_id: invoiceId || invoiceExternalId,
            amount_paid: 0,
            metadata: {
              plan: canonicalPlanTier,
              created_via: 'onboard_pending_payment',
              invoice_url: invoiceUrl,
              external_id: invoiceExternalId,
              amount: planPrice,
            },
          });
        } catch (subErr) {
          console.warn('[Onboard] Non-fatal shop_subscriptions PENDING_PAYMENT note:', subErr);
        }
      }
    }

    if (isFood) {
      try {
        await saveStoreShippingConfig({
          tenant_slug: generatedSlug,
          tenant_id: effectiveTenantId,
          is_self_pickup_enabled: true,
          pickup_address: 'Dapur Utama / Outlet Resto',
          pickup_operational_hours: '08:00 - 21:00 WIB',
          pickup_instructions: 'Silakan sebutkan nama pemesan atau nomor meja/nota saat mengambil pesanan.',
        }, supabase);
      } catch (shipErr) {
        console.warn('[Onboard] Non-fatal saveStoreShippingConfig for F&B note:', shipErr);
      }
    }

    // 2. Simpan record atribusi referral ke tabel attributions
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

    // 2b. Pemicu Notifikasi Email Jaringan Affiliate & AM (Non-blocking)
    if (matchedAffiliateId || cleanRef) {
      sendNewStoreReferralNotification({
        storeName,
        slug: generatedSlug,
        merchantName,
        merchantPhone: formattedWa,
        merchantEmail: customerEmail || undefined,
        planTier: canonicalPlanTier,
        selectedPlan: isTrial ? 'Ads Performance Trial 7 Hari' : canonicalPlanTier,
        isTrial,
        referralCode: cleanRef,
        affiliateId: matchedAffiliateId,
        tenantId: effectiveTenantId,
      }).catch((notifErr) => {
        console.warn('[Onboard] Non-fatal affiliate network email alert error:', notifErr);
      });
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

    // Non-PRO_SCALE: Wajib status PENDING_PAYMENT & Redirect merchant ke invoice Xendit
    if (!isTrial) {
      const acceptHeader = req.headers.get('accept') || '';
      const wantsHtmlRedirect = acceptHeader.includes('text/html') && !acceptHeader.includes('application/json');

      if (wantsHtmlRedirect && invoiceUrl) {
        return NextResponse.redirect(invoiceUrl, { status: 303 });
      }

      return NextResponse.json({
        success: true,
        message: 'Toko berhasil didaftarkan. Silakan selesaikan pembayaran invoice Xendit untuk mengaktifkan toko.',
        status: 'PENDING_PAYMENT',
        is_active: false,
        redirect_url: invoiceUrl,
        invoice_url: invoiceUrl,
        invoice_id: invoiceId,
        external_id: invoiceExternalId,
        amount: planPrice,
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
          status: 'PENDING_PAYMENT',
          isTrial: false,
          isActive: false,
        },
      });
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
