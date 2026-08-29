import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { getBackendApiUrl } from '@/lib/api-config';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      template = 'COMMERCE_TEMPLATE',
      onboardingMode = 'SELF_SERVICE',
      storeName,
      slug: rawSlug,
      waNumber,
      category,
      referralCode,
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
    } = body;

    if (!storeName || !waNumber || !category) {
      return NextResponse.json(
        {
          success: false,
          error: 'Nama toko, nomor WhatsApp, dan kategori industri wajib diisi.',
        },
        { status: 400 }
      );
    }

    // Format WhatsApp number to standard international format (628...)
    let formattedWa = waNumber.replace(/[^0-9]/g, '');
    if (formattedWa.startsWith('0')) {
      formattedWa = '62' + formattedWa.slice(1);
    } else if (formattedWa.startsWith('8')) {
      formattedWa = '62' + formattedWa;
    }

    // Generate unique slug
    const generatedSlug =
      (
        rawSlug ||
        storeName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
      ) || `tenant-${Date.now().toString().slice(-6)}`;

    const isDigital = productType === 'digital' || category === 'digital';

    // Meta WhatsApp Sandbox Bot Number
    const botNumber = process.env.NEXT_PUBLIC_META_BOT_NUMBER || '15556769563';

    // Format activation redirect URL: https://wa.me/15556769563?text=Halo%20Admin%20BoonTrack%2C%20saya%20baru%20saja%20mendaftar%20toko%20{slug}
    const redirectWaUrl = `https://wa.me/${botNumber}?text=Halo%20Admin%20BoonTrack%2C%20saya%20baru%20saja%20mendaftar%20toko%20${encodeURIComponent(generatedSlug)}`;

    // Try to record into Supabase if accessible
    try {
      const supabase = getSupabase();
      await supabase.from('tenants').upsert(
        {
          slug: generatedSlug,
          name: storeName,
          category,
          metadata: {
            template: template || 'COMMERCE_TEMPLATE',
            onboarding_mode: onboardingMode || 'SELF_SERVICE',
            wa_number: formattedWa,
            referral_code: referralCode || null,
            product: {
              type: isDigital ? 'digital' : 'physical',
              name: productName,
              price: productPrice,
              promo: promoBundle,
              variants,
              download_url: downloadUrl || null,
              tone: aiTone,
            },
            bank: {
              name: bankName,
              account: bankAccountNumber,
              holder: bankAccountHolder,
            },
            onboarded_at: new Date().toISOString(),
          },
        },
        { onConflict: 'slug' }
      );
    } catch (dbErr) {
      // Supabase is optional / fallback enabled for pilot
      console.warn('Supabase tenant upsert skipped or offline:', dbErr);
    }

    // Forward/Sync to Railway Production Core Backend
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
      message: 'Onboarding data successfully recorded.',
      tenant: {
        slug: generatedSlug,
        storeName,
        waNumber: formattedWa,
        category,
        referralCode: referralCode || null,
        productName,
        productPrice: Number(productPrice || 0),
        promoBundle,
        variants,
        aiTone,
        botNumber,
      },
      redirectWaUrl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error during onboarding';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
