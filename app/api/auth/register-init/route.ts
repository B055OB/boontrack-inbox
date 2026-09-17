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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const rawShopName = body.shop_name || body.storeName || body.store_name || body.name || '';
    const rawPhone = body.phone || body.waNumber || body.wa_number || body.merchant_phone || '';
    const rawEmail = body.email || body.customer_email || '';
    const rawPassword = body.password || body.pin || body.access_pin || '123456';
    const rawCategory = body.category || body.business_type || 'PHYSICAL';
    const rawPlan = body.plan_tier || body.selectedPlan || 'ads_performance';
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
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const officialWaNumber = getOfficialWhatsAppNumber();
    const activationMessage = `AKTIVASI ${verificationToken}`;
    const waDeepLink = `https://wa.me/${officialWaNumber}?text=${encodeURIComponent(activationMessage)}`;

    // Persiapkan industry menu standar untuk bot
    const defaultMenu = buildDefaultIndustryMenu(shopName, rawCategory);

    // Simpan ke tabel tenants dengan status 'pending_wa_verification'
    const tenantPayload = {
      slug: baseSlug,
      name: shopName,
      category: rawCategory,
      business_type: rawCategory,
      tier: 'PRO_SCALE', // Trial 7 Hari Ads Performance
      status: 'pending_wa_verification',
      is_active: false,
      trial_ends_at: trialEndsAt,
      access_username: baseSlug,
      access_password: password,
      metadata: {
        shop_name: shopName,
        merchant_name: body.merchant_name || shopName,
        phone,
        whatsapp_number: phone,
        email: email || null,
        password_raw: password,
        wa_verification_token: verificationToken,
        wa_verification_status: 'pending',
        wa_verification_expires_at: tokenExpiresAt,
        official_waba_number: officialWaNumber,
        selected_plan: rawPlan,
        plan_tier: 'PRO_SCALE',
        trial_days: 7,
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
