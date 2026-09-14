import { Metadata } from 'next';
import Script from 'next/script';
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

export default async function TenantStoreLayout({
  params,
  children,
}: {
  params: Promise<{ tenant: string }>;
  children: React.ReactNode;
}) {
  let tracking: { facebook_pixel_id?: string; tiktok_pixel_id?: string } | undefined;

  try {
    const { tenant } = await params;
    const cleanTenant = (tenant || '').toLowerCase().trim();
    const RESERVED_SLUGS = ['login', 'register', 'admin', 'auth', 'checkout'];

    if (!RESERVED_SLUGS.includes(cleanTenant)) {
      const supabase = getSupabase();
      const { data: store } = await supabase
        .from('tenants')
        .select('metadata')
        .eq('slug', cleanTenant)
        .maybeSingle();

      tracking = (store?.metadata as Record<string, any>)?.tracking;
    }
  } catch (err) {
    console.warn('[TenantStoreLayout] Tracking extraction error:', err);
  }

  const fbPixelId = tracking?.facebook_pixel_id;
  const ttPixelId = tracking?.tiktok_pixel_id;

  return (
    <>
      {fbPixelId && (
        <Script
          id="meta-pixel-base"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${fbPixelId}');
fbq('track', 'PageView');`,
          }}
        />
      )}
      {ttPixelId && (
        <Script
          id="tiktok-pixel-base"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var c=document.createElement("script");c.type="text/javascript",c.async=!0,c.src=r+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(c,a)};
  ttq.load('${ttPixelId}');
  ttq.page();
}(window, document, 'ttq');`,
          }}
        />
      )}
      {children}
    </>
  );
}
