import { Metadata } from 'next';
import Script from 'next/script';
import { cache } from 'react';

// ISR: re-generate layout shell (meta tags + tracking) paling sering tiap 60 detik.
// Vercel Edge Network akan serve cached HTML ke seluruh dunia (<300ms TTFB).
export const revalidate = 60;


// ── Cache fetch per request agar generateMetadata & TenantStoreLayout tidak melakukan duplikasi query ──
// Menggunakan native fetch + next:{revalidate:60} agar Vercel Edge Cache aktif.
// Supabase JS SDK tidak mendukung Next.js fetch cache — gunakan REST API langsung.
const getTenantStoreData = cache(async (cleanTenant: string) => {
  const RESERVED_SLUGS = ['login', 'register', 'admin', 'auth', 'checkout'];
  if (!cleanTenant || RESERVED_SLUGS.includes(cleanTenant)) {
    return { store: null, settings: null };
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';

  const headers: HeadersInit = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  try {
    const [tenantRes, settingsRes] = await Promise.all([
      // next:{revalidate:60} → Vercel Data Cache caches this for 60s at the Edge
      fetch(
        `${supabaseUrl}/rest/v1/tenants?slug=eq.${encodeURIComponent(cleanTenant)}&select=name,metadata,logo_url,qris_image_url&limit=1`,
        { headers, next: { revalidate: 60 } }
      ),
      fetch(
        `${supabaseUrl}/rest/v1/tenant_settings?tenant_slug=eq.${encodeURIComponent(cleanTenant)}&select=ads_tracking_config&limit=1`,
        { headers, next: { revalidate: 60 } }
      ),
    ]);

    const tenantRows = tenantRes.ok ? await tenantRes.json().catch(() => []) : [];
    const settingsRows = settingsRes.ok ? await settingsRes.json().catch(() => []) : [];

    return {
      store: Array.isArray(tenantRows) && tenantRows.length > 0 ? tenantRows[0] : null,
      settings: Array.isArray(settingsRows) && settingsRows.length > 0 ? settingsRows[0] : null,
    };
  } catch (err) {
    console.warn('[TenantStoreLayout] Cached fetch error:', err);
    return { store: null, settings: null };
  }
});


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

    // Tarik data toko melalui cached fetcher (deduplicated per-request)
    const { store } = await getTenantStoreData(cleanTenant);

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

    // Favicon dinamis per-tenant sesuai logo toko atau default shopping cart khas storefront
    const resolvedFavicon = logoUrl || '/shopping-cart.svg';
    const resolvedAppleIcon = logoUrl || '/shopping-cart.png';

    return {
      title: `${storeName} | Toko Resmi`,
      description,
      icons: {
        icon: [
          { url: resolvedFavicon, type: resolvedFavicon.endsWith('.svg') ? 'image/svg+xml' : 'image/png' },
          { url: '/shopping-cart.png', sizes: '512x512', type: 'image/png' },
          { url: '/cart-icon.png', sizes: '192x192', type: 'image/png' },
          { url: '/favicon.ico' },
        ],
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
  let fbPixelId: string | null = null;
  let ttPixelId: string | null = null;

  try {
    const { tenant } = await params;
    const cleanTenant = (tenant || '').toLowerCase().trim();
    const { store, settings } = await getTenantStoreData(cleanTenant);

    const tenantMetaTracking = (store?.metadata as Record<string, any>)?.tracking;
    const adsTrackingCfg = (settings as any)?.ads_tracking_config;

    fbPixelId =
      adsTrackingCfg?.meta_pixel_id ||
      adsTrackingCfg?.facebook_pixel_id ||
      tenantMetaTracking?.meta_pixel_id ||
      tenantMetaTracking?.facebook_pixel_id ||
      null;

    ttPixelId =
      adsTrackingCfg?.tiktok_pixel_id ||
      tenantMetaTracking?.tiktok_pixel_id ||
      null;
  } catch (err) {
    console.warn('[TenantStoreLayout] Tracking resolution error:', err);
  }

  return (
    <>
      <Script
        id="tracking-debug-log"
        strategy="lazyOnload"
        dangerouslySetInnerHTML={{
          __html: `console.log('[Tracking Debug] Loaded Pixel ID:', ${JSON.stringify(fbPixelId)});`,
        }}
      />
      {fbPixelId && (
        <Script
          id="meta-pixel-base"
          strategy="lazyOnload"
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('set', 'autoConfig', false, '${fbPixelId}');
fbq('init', '${fbPixelId}');
fbq('track', 'PageView');`,
          }}
        />
      )}
      {ttPixelId && (
        <Script
          id="tiktok-pixel-base"
          strategy="lazyOnload"
          dangerouslySetInnerHTML={{
            __html: `!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(
var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var c=document.createElement("script");c.type="text/javascript",c.async=!0,c.src=r+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(c,a)};
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
