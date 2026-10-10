import { Metadata } from 'next';
import Script from 'next/script';
import { cache } from 'react';
import { normalizeTenantSlug, getTenantConfig } from '@/lib/tenant-config';

// ISR: re-generate layout shell (meta tags + tracking) paling sering tiap 60 detik.
// Vercel Edge Network akan serve cached HTML ke seluruh dunia (<300ms TTFB).
export const revalidate = 60;


import { getTenantStoreData } from '@/lib/tenant-store-data';
export { getTenantStoreData };



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
    const resolvedParams = await params;
    const { tenant } = resolvedParams;
    const cleanTenant = normalizeTenantSlug((tenant || '').toLowerCase().trim());

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

    console.log("DEBUG TENANT METADATA:", JSON.stringify({
      slug: resolvedParams.tenant,
      store,
      metaObj,
    }, null, 2));

    const description =
      metaObj.description ||
      metaObj.tagline ||
      `Selamat datang di toko resmi ${storeName}. Pemesanan online praktis, konfirmasi instan via WhatsApp, dan pembayaran aman terverifikasi.`;

    // ── Resolusi Domain Kanonikal (Custom Domain vs Subpath shop.boontrack.com) ──
    const customDomain =
      metaObj.custom_domain ||
      (Array.isArray(metaObj.custom_domains) ? metaObj.custom_domains[0] : null) ||
      (cleanTenant === 'tumbuh-kembang-anak' ? 'konsul.littlebitefeeding.com' : null);

    const canonicalBaseUrl = customDomain
      ? `https://${customDomain}`
      : 'https://shop.boontrack.com';

    const canonicalUrl = customDomain
      ? `https://${customDomain}`
      : `https://shop.boontrack.com/${cleanTenant}`;

    // =========================================================================
    // HIERARKI GAMBAR OPENGRAPH (og:image):
    // 0. Dedicated OG image banner (metaObj.og_image / og_image_url) atau pilot banner
    // 1. tenant.metadata.banner_url / cover_url / hero_image
    // 2. tenant.metadata.logo_url / store.logo_url / store_logo_url / avatar_url / branding / customization
    // 3. Gambar produk pertama yang aktif
    // 4. Fallback default branding resmi BoonTrack 1200x630 (bukan gambar demo)
    // =========================================================================
    const storeLogo =
      metaObj.store_logo_url ||
      metaObj.logo_url ||
      metaObj.avatar_url ||
      metaObj.logo ||
      metaObj.branding?.logo_url ||
      metaObj.branding?.logo ||
      metaObj.customization?.logo ||
      metaObj.customization?.logo_url ||
      metaObj.settings?.logo_url ||
      metaObj.settings?.logo ||
      metaObj.profile?.logo_url ||
      metaObj.profile?.avatar_url ||
      (store as any)?.branding?.logo_url ||
      (store as any)?.branding?.logo ||
      (store as any)?.customization?.logo ||
      (store as any)?.customization?.logo_url ||
      store?.logo_url ||
      (store as any)?.store_logo_url ||
      (store as any)?.avatar_url ||
      metaObj.image ||
      null;

    const storeTitle = store?.name || metaObj.store_name || storeName;
    const storeDesc =
      metaObj.description ||
      metaObj.bio ||
      metaObj.tagline ||
      `Selamat datang di toko resmi ${storeTitle}. Pemesanan online praktis, konfirmasi instan via WhatsApp, dan pembayaran aman terverifikasi.`;

    // ── HIERARKI GAMBAR OPENGRAPH (og:image) ──
    // Prioritaskan foto profil/logo resmi tenant, lalu banner kustom, lalu gambar produk, lalu /default-og.png
    const explicitOgImage =
      metaObj.og_image ||
      metaObj.og_image_url ||
      metaObj.meta_image ||
      (cleanTenant === 'tumbuh-kembang-anak' ? '/tenants/tumbuh-kembang-anak/og-image.png' : null);

    const bannerUrl =
      metaObj.banner_url ||
      metaObj.cover_url ||
      metaObj.hero_image ||
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

    const rawOgImage = storeLogo || explicitOgImage || bannerUrl || firstProductImage || '/default-og.png';

    // Normalisasi URL gambar ke Absolute URL kanonikal yang valid untuk bot crawler WhatsApp / Facebook
    let resolvedOgImage = rawOgImage;
    if (resolvedOgImage.startsWith('/')) {
      resolvedOgImage = `${canonicalBaseUrl}${resolvedOgImage}`;
    }

    let resolvedLogo = storeLogo;
    if (resolvedLogo && resolvedLogo.startsWith('/')) {
      resolvedLogo = `${canonicalBaseUrl}${resolvedLogo}`;
    }

    // Ekstraksi MIME type yang tepat untuk WhatsApp link preview
    const cleanImageExt = resolvedOgImage.split('?')[0].toLowerCase();
    const imageMimeType = cleanImageExt.endsWith('.jpg') || cleanImageExt.endsWith('.jpeg')
      ? 'image/jpeg'
      : cleanImageExt.endsWith('.webp')
        ? 'image/webp'
        : 'image/png';

    const isPublicService =
      metaObj.business_type === 'B2G' ||
      metaObj.business_type === 'public_service' ||
      metaObj.category === 'public_service' ||
      metaObj.category === 'civic';

    const pageTitle = `${storeTitle} | ${isPublicService ? 'Portal Resmi' : 'Layanan Resmi'}`;

    return {
      metadataBase: new URL(canonicalBaseUrl),
      title: pageTitle,
      description: storeDesc,
      icons: {
        icon: resolvedLogo || '/favicon.ico',
        shortcut: resolvedLogo || '/favicon.ico',
        apple: resolvedLogo || '/favicon.ico',
      },
      openGraph: {
        title: storeTitle,
        description: storeDesc,
        url: canonicalUrl,
        siteName: storeTitle,
        locale: 'id_ID',
        type: 'website',
        images: [
          {
            url: resolvedOgImage,
            width: 1200,
            height: 630,
            type: imageMimeType,
            alt: storeTitle,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: storeTitle,
        description: storeDesc,
        images: [resolvedOgImage],
      },
    };
  } catch (err) {
    console.warn('[TenantStoreLayout] generateMetadata fallback triggered:', err);
    return {
      title: 'Toko Resmi | Layanan Terverifikasi',
      description: 'Layanan resmi toko terverifikasi.',
      icons: {
        icon: '/favicon.ico',
        shortcut: '/favicon.ico',
        apple: '/favicon.ico',
      },
      openGraph: {
        images: ['/default-og.png'],
      },
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
          __html: `if (!window.location.pathname.includes('/dashboard') && !window.location.pathname.includes('/desk') && !window.location.hostname.startsWith('dashboard.')) { console.log('[Tracking Debug] Loaded Pixel ID:', ${JSON.stringify(fbPixelId)}); }`,
        }}
      />
      {fbPixelId && (
        <Script
          id="meta-pixel-base"
          strategy="lazyOnload"
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s)
{if(window.location.pathname.includes('/dashboard')||window.location.pathname.includes('/desk')||window.location.hostname.startsWith('dashboard.'))return;
if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
if(!window.location.pathname.includes('/dashboard')&&!window.location.pathname.includes('/desk')&&!window.location.hostname.startsWith('dashboard.')){
fbq('set', 'autoConfig', false, '${fbPixelId}');
fbq('init', '${fbPixelId}');
fbq('track', 'PageView');
}`,
          }}
        />
      )}
      {ttPixelId && (
        <Script
          id="tiktok-pixel-base"
          strategy="lazyOnload"
          dangerouslySetInnerHTML={{
            __html: `!function (w, d, t) {
if(w.location.pathname.includes('/dashboard')||w.location.pathname.includes('/desk')||w.location.hostname.startsWith('dashboard.'))return;
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
