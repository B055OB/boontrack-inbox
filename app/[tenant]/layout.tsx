import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      'placeholder-anon-key'
  );
}

type Props = {
  params: Promise<{ tenant: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>;
}): Promise<Metadata> {
  try {
    const { tenant } = await params;
    const cleanTenant = (tenant || '').toLowerCase().trim();

    // Slug bawaan sistem agar tidak tertimpa
    const RESERVED_SLUGS = ['login', 'register', 'admin', 'auth', 'checkout'];
    if (RESERVED_SLUGS.includes(cleanTenant)) {
      return {
        title: 'BoonTrack Shop | Platform Otomasi Penjualan',
        description: 'Solusi SaaS terintegrasi untuk kelola katalog digital dan checkout otomatis.',
      };
    }

    const supabase = getSupabase();

    // Tarik data toko langsung dari database Supabase
    const { data: store } = await supabase
      .from('tenants')
      .select('name, metadata, logo_url, qris_image_url')
      .eq('slug', cleanTenant)
      .maybeSingle();

    const storeName = store?.name || cleanTenant.replace(/[-_]/g, ' ').toUpperCase();
    const metaObj = (store?.metadata as Record<string, any>) || {};

    const description =
      metaObj.description ||
      metaObj.tagline ||
      `Selamat datang di toko resmi ${storeName}. Pemesanan online praktis, konfirmasi instan via WhatsApp, dan pembayaran aman terverifikasi.`;

    // =========================================================================
    // HIERARKI GAMBAR OPENGRAPH (og:image):
    // 1. tenant.metadata.banner_url / cover_url
    // 2. tenant.metadata.logo_url / store.logo_url
    // 3. Gambar produk pertama yang aktif
    // 4. Fallback default branding resmi BoonTrack (bukan gambar demo)
    // =========================================================================
    const bannerUrl =
      metaObj.banner_url ||
      metaObj.cover_url ||
      metaObj.hero_image ||
      null;

    const logoUrl =
      metaObj.logo_url ||
      store?.logo_url ||
      metaObj.image ||
      null;

    let firstProductImage: string | null = null;
    const products = Array.isArray(metaObj.products) ? metaObj.products : [];
    for (const prod of products) {
      if (prod && typeof prod === 'object') {
        const pImg = prod?.image || (Array.isArray(prod?.images) && prod.images[0]) || prod?.image_url;
        if (pImg && typeof pImg === 'string' && !pImg.includes('unsplash.com')) {
          firstProductImage = pImg;
          break;
        }
      }
    }

    const BOONTRACK_OFFICIAL_LOGO = 'https://shop.boontrack.com/logo-shop.png';

    const resolvedOgImage =
      bannerUrl ||
      logoUrl ||
      firstProductImage ||
      BOONTRACK_OFFICIAL_LOGO;

    // Favicon dinamis per-tenant sesuai logo toko
    const resolvedFavicon = logoUrl || '/favicon.ico';
    const resolvedAppleIcon = logoUrl || '/apple-touch-icon.png';

    return {
      title: `${storeName} | Toko Resmi`,
      description,
      icons: {
        icon: resolvedFavicon,
        shortcut: resolvedFavicon,
        apple: resolvedAppleIcon,
      },
      openGraph: {
        title: storeName,
        description,
        url: `https://shop.boontrack.com/${cleanTenant}`,
        siteName: storeName,
        locale: 'id_ID',
        type: 'website',
        images: [
          {
            url: resolvedOgImage,
            width: 800,
            height: 600,
            alt: storeName,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: storeName,
        description,
        images: [resolvedOgImage],
      },
    };
  } catch (err) {
    console.warn('[TenantStoreLayout] generateMetadata fallback triggered:', err);
    return {
      title: 'BoonTrack Shop | Toko Resmi',
      description: 'Pemesanan online praktis dan aman terverifikasi di BoonTrack Shop.',
    };
  }
}

export default function TenantStoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
