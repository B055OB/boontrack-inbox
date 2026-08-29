import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { DEFAULT_TENANT_CONFIGS, normalizeTenantSlug } from '@/lib/tenant-config';
import { getBackendApiUrl } from '@/lib/api-config';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug || '');

    // Try Railway Production Core Backend
    try {
      const railwayRes = await fetch(
        getBackendApiUrl(`/api/v1/tenants/${encodeURIComponent(slug)}/settings`),
        {
          headers: { 'X-Tenant-ID': slug },
          cache: 'no-store',
        }
      );
      if (railwayRes.ok) {
        const rData = await railwayRes.json();
        if (rData && rData.settings) {
          return NextResponse.json(rData);
        }
      }
    } catch {
      // fallback to Supabase / defaults
    }

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

    const defaultProducts = isSuhu
      ? [
          {
            id: 'suhu-prod-1',
            name: 'Suhu Ads Masterclass 2026 - Full Lifetime Access',
            category: 'course',
            price: 99000,
            promo_price: 149000,
            variants: 'Format Digital • Video HD + Template Canva',
            promo: 'Diskon 35% Bulan Ini',
            description:
              'Pusat pelatihan Meta Ads praktis untuk media buyer & pebisnis online. Dapatkan strategi scale-up campaign, riset audience, dan optimasi konversi terbukti.',
            download_url: 'https://drive.google.com/drive/folders/suhu-ads-masterclass-2026',
            type: 'digital',
          },
          {
            id: 'suhu-prod-2',
            name: '50+ High-Converting Copywriting Swipe File Toolkit',
            category: 'template',
            price: 49000,
            promo_price: 75000,
            variants: 'Notion Database + PDF Cheat Sheet',
            promo: 'Best Seller Add-On',
            description:
              'Kumpulan 50+ formula headline, angle penawaran, dan skrip copywriting iklan teruji tembus ROAS 4x.',
            download_url: 'https://drive.google.com/drive/folders/suhu-ads-toolkit-2026',
            type: 'digital',
          },
          {
            id: 'suhu-prod-3',
            name: 'E-Book Blueprint Riset Winning Audience 2026',
            category: 'ebook',
            price: 35000,
            promo_price: 50000,
            variants: 'E-Book PDF 85 Halaman',
            promo: 'Flash Sale',
            description:
              'Panduan langkah demi langkah membedah interest, broad targeting, dan custom audience Meta tanpa boncos.',
            download_url: 'https://drive.google.com/drive/folders/suhu-ads-ebook-blueprint',
            type: 'digital',
          },
          {
            id: 'suhu-prod-4',
            name: 'Private 1-on-1 Meta Ads Mentoring & Audit Campaign',
            category: 'membership',
            price: 299000,
            promo_price: 450000,
            variants: '1 Jam Sesi Zoom + Recording + Audit Ads Manager',
            promo: 'Slot Terbatas 5 Peserta/Bulan',
            description:
              'Bedah langsung dashboard Ads Manager Anda bersama praktisi senior untuk menemukan kebocoran budget iklan.',
            download_url: 'https://cal.com/suhu-ads/mentoring-session',
            type: 'digital',
          },
        ]
      : [
          {
            id: `${slug}-prod-1`,
            name: product.name,
            category: category === 'digital' ? 'course' : 'physical',
            price: product.price,
            promo_price: product.promo_price,
            variants: product.variants,
            promo: product.promo,
            description: product.description,
            download_url: product.download_url,
            type: product.type,
          },
        ];

    const products =
      Array.isArray(dbMetadata.products) && dbMetadata.products.length > 0
        ? dbMetadata.products
        : defaultProducts;

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
        product: products[0] || product,
        products,
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
      products,
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
        products: products !== undefined ? products : existing?.metadata?.products,
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

    // Forward/Sync to Railway Production Core Backend
    try {
      await fetch(
        getBackendApiUrl(`/api/v1/tenants/${encodeURIComponent(slug)}/settings`),
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': slug,
          },
          body: JSON.stringify(body),
          cache: 'no-store',
        }
      );
    } catch (railwayErr) {
      console.warn('Railway backend update settings sync note:', railwayErr);
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
