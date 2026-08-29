import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';

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
    const generatedSlug = (
      rawSlug ||
      storeName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
    ) || `tenant-${Date.now().toString().slice(-6)}`;

    // Default BoonTrack Gateway AI Bot number
    const botNumber = process.env.NEXT_PUBLIC_BOT_WA_NUMBER || '6281298877665';

    // Prepare welcome/activation message for WhatsApp
    const isDigital = productType === 'digital' || category === 'digital';
    const waText =
      `Halo Admin BoonTrack AI, saya baru saja menyelesaikan Onboarding Toko:\n\n` +
      `🏪 *Toko:* ${storeName}\n` +
      `🔗 *Slug:* ${generatedSlug}\n` +
      `📱 *WhatsApp:* +${formattedWa}\n` +
      `🏷 *Kategori:* ${category}\n` +
      (referralCode ? `🎁 *Referral:* ${referralCode}\n` : '') +
      (productName
        ? `📦 *Produk Sampel:* ${productName} (Rp ${Number(productPrice || 0).toLocaleString('id-ID')}) [${isDigital ? 'DIGITAL' : 'FISIK'}]\n`
        : '') +
      (promoBundle ? `🎉 *Promo:* ${promoBundle}\n` : '') +
      (variants ? `🎨 *Format/Varian:* ${variants}\n` : '') +
      (downloadUrl ? `🔗 *Akses/Download Link:* ${downloadUrl}\n` : '') +
      (aiTone ? `🤖 *Tone AI:* ${aiTone}\n` : '') +
      (bankName ? `💳 *Rekening:* ${bankName} - ${bankAccountNumber} a.n ${bankAccountHolder}\n` : '') +
      `\nMohon segera aktivasi WhatsApp Gateway & AI Assistant untuk toko saya. Terima kasih!`;

    const redirectWaUrl = `https://wa.me/${botNumber}?text=${encodeURIComponent(waText)}`;

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
