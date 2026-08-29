import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { DEFAULT_TENANT_CONFIGS, normalizeTenantSlug } from '@/lib/tenant-config';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dbMetadata: Record<string, any> = {};
    let storeName = '';
    let category = 'digital';

    try {
      const supabase = getSupabase();
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (tenantRow) {
        storeName = tenantRow.name || '';
        category = tenantRow.category || 'digital';
        dbMetadata = tenantRow.metadata || {};
      }
    } catch (e) {
      console.warn('Supabase fetch settings failed, using defaults:', e);
    }

    const defCfg = DEFAULT_TENANT_CONFIGS[slug];
    const isSuhu = slug.includes('suhu') || slug === 'digital-marketing';

    const defaultName = isSuhu
      ? 'Suhu Ads Masterclass'
      : storeName || defCfg?.name || slug.replace(/[-_]/g, ' ').toUpperCase();

    const defaultDesc = isSuhu
      ? 'Pusat pelatihan Meta Ads praktis untuk media buyer & pebisnis online. Dapatkan strategi scale-up campaign, riset audience, dan optimasi konversi terbukti.'
      : defCfg?.persona?.system_prompt || 'Toko & Layanan Resmi Terverifikasi';

    const product = {
      name:
        dbMetadata.product?.name ||
        (isSuhu
          ? 'Suhu Ads Masterclass 2026 - Full Lifetime Access'
          : defCfg?.pricing.custom_packages[0]?.name || `${defaultName} Paket Utama`),
      price: Number(
        dbMetadata.product?.price ||
          (isSuhu ? 99000 : defCfg?.pricing.custom_packages[0]?.price || 50000)
      ),
      promo_price: Number(
        dbMetadata.product?.promo_price ||
          (isSuhu ? 149000 : defCfg?.pricing.custom_packages[1]?.price || 75000)
      ),
      variants:
        dbMetadata.product?.variants ||
        (isSuhu ? 'Format Digital • Video HD + Template Canva' : 'Standar Akses'),
      promo:
        dbMetadata.product?.promo ||
        (isSuhu ? 'Diskon 35% Bulan Ini' : 'Promo Terbatas'),
      description: dbMetadata.product?.description || defaultDesc,
      download_url:
        dbMetadata.product?.download_url ||
        'https://drive.google.com/drive/folders/suhu-ads-masterclass-2026',
      type: dbMetadata.product?.type || (category === 'digital' ? 'digital' : 'physical'),
    };

    const aiKnowledge = {
      ai_name:
        dbMetadata.ai_knowledge?.ai_name ||
        defCfg?.persona?.ai_name ||
        (isSuhu ? 'Suhu Ads AI Consultant' : `${defaultName} Assistant`),
      tone: dbMetadata.ai_knowledge?.tone || defCfg?.persona?.tone || 'casual',
      system_prompt:
        dbMetadata.ai_knowledge?.system_prompt ||
        defCfg?.persona?.system_prompt ||
        `Anda adalah asisten konsultan resmi ${defaultName}.`,
      syllabus: dbMetadata.ai_knowledge?.syllabus || [
        'Modul 1: Mindset & Riset Winning Product Meta Ads',
        'Modul 2: Struktur Campaign CBO/ABO & Budgeting Strategy',
        'Modul 3: Creative Angle & Copywriting High-Converting',
        'Modul 4: Scale-Up Campaign & Optimasi Biaya Iklan (ROAS > 4x)',
      ],
      faq: dbMetadata.ai_knowledge?.faq || [
        {
          q: 'Apakah materi ini bisa diakses selamanya?',
          a: 'Ya, Anda mendapatkan akses seumur hidup (lifetime access) dan gratis update materi 2026.',
        },
        {
          q: 'Bagaimana cara mengakses file setelah bayar?',
          a: 'Setelah pembayaran QRIS berhasil diverifikasi, sistem otomatis memberikan tautan Google Drive resmi dan link grup diskusi.',
        },
        {
          q: 'Apakah pemula bisa mengikuti materi ini?',
          a: 'Sangat bisa! Materi disusun dari nol, langkah demi langkah dengan panduan praktis.',
        },
      ],
      promo_bundling:
        dbMetadata.ai_knowledge?.promo_bundling ||
        'Beli 2 Kelas Digital Gratis 1 Toolkit Copywriting Siap Pakai.',
    };

    const bank = {
      name: dbMetadata.bank?.name || 'BCA (Bank Central Asia)',
      account: dbMetadata.bank?.account || '8820199201',
      holder: dbMetadata.bank?.holder || 'PT BOONTRACK MEDIA DIGITAL',
    };

    const integration = {
      whatsapp_status: 'CONNECTED',
      bot_number: process.env.NEXT_PUBLIC_META_BOT_NUMBER || '15556769563',
      webhook_verified: true,
    };

    return NextResponse.json({
      success: true,
      settings: {
        slug,
        name: defaultName,
        category: category || (isSuhu ? 'digital' : 'retail'),
        product,
        ai_knowledge: aiKnowledge,
        bank,
        integration,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching settings';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');
    const body = await req.json();

    const {
      name,
      category,
      product,
      ai_knowledge,
      bank,
      integration,
    } = body;

    try {
      const supabase = getSupabase();
      // Fetch existing metadata to merge cleanly
      const { data: existing } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      const updatedMetadata = {
        ...(existing?.metadata || {}),
        product: {
          ...(existing?.metadata?.product || {}),
          ...(product || {}),
        },
        ai_knowledge: {
          ...(existing?.metadata?.ai_knowledge || {}),
          ...(ai_knowledge || {}),
        },
        bank: {
          ...(existing?.metadata?.bank || {}),
          ...(bank || {}),
        },
        integration: {
          ...(existing?.metadata?.integration || {}),
          ...(integration || {}),
        },
      };

      await supabase.from('tenants').upsert({
        slug,
        name: name || existing?.name || slug,
        category: category || existing?.category || 'digital',
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      });
    } catch (dbErr) {
      console.warn('Supabase update tenant settings error:', dbErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Pengaturan toko berhasil diperbarui.',
      settings: {
        slug,
        name,
        category,
        product,
        ai_knowledge,
        bank,
        integration,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating settings';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
