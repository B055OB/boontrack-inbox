import { Metadata } from 'next';
import Script from 'next/script';
import { cache } from 'react';
import { normalizeTenantSlug, getTenantConfig } from '@/lib/tenant-config';

// ISR: re-generate layout shell (meta tags + tracking) paling sering tiap 60 detik.
// Vercel Edge Network akan serve cached HTML ke seluruh dunia (<300ms TTFB).
export const revalidate = 60;


// ── Cache fetch per request agar generateMetadata & TenantStoreLayout tidak melakukan duplikasi query ──
// Menggunakan native fetch + next:{revalidate:60} agar Vercel Edge Cache aktif.
// Supabase JS SDK tidak mendukung Next.js fetch cache — gunakan REST API langsung.
export const getTenantStoreData = cache(async (rawTenant: string) => {
  const RESERVED_SLUGS = ['login', 'register', 'admin', 'auth', 'checkout'];
  const cleanTenant = normalizeTenantSlug((rawTenant || '').toLowerCase().trim());
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
        `${supabaseUrl}/rest/v1/tenants?slug=eq.${encodeURIComponent(cleanTenant)}&select=name,metadata&limit=1`,
        { headers, next: { revalidate: 60 } }
      ),
      fetch(
        `${supabaseUrl}/rest/v1/tenant_settings?tenant_slug=eq.${encodeURIComponent(cleanTenant)}&select=ads_tracking_config&limit=1`,
        { headers, next: { revalidate: 60 } }
      ),
    ]);

    const tenantRows = tenantRes.ok ? await tenantRes.json().catch(() => []) : [];
    const settingsRows = settingsRes.ok ? await settingsRes.json().catch(() => []) : [];

    let store = Array.isArray(tenantRows) && tenantRows.length > 0 ? tenantRows[0] : null;
    const settings = Array.isArray(settingsRows) && settingsRows.length > 0 ? settingsRows[0] : null;

    if (!store) {
      const localConfig = getTenantConfig(cleanTenant);
      if (localConfig && (localConfig.category === 'public_service' || localConfig.slug === 'margasari')) {
        store = {
          name: localConfig.name,
          metadata: {
            title: localConfig.title,
            subtitle: localConfig.subtitle,
            lurah: localConfig.lurah,
            address: localConfig.address,
            business_type: localConfig.business_type,
            category: localConfig.category,
            description: localConfig.persona?.system_prompt,
            products: localConfig.pricing?.custom_packages,
          },
        };
      }
    }

    return {
      store,
      settings,
    };
  } catch (err) {
    console.warn('[TenantStoreLayout] Cached fetch error:', err);
    const localConfig = getTenantConfig(cleanTenant);
    if (localConfig && (localConfig.category === 'public_service' || localConfig.slug === 'margasari')) {
      return {
        store: {
          name: localConfig.name,
          metadata: {
            title: localConfig.title,
            subtitle: localConfig.subtitle,
            lurah: localConfig.lurah,
            address: localConfig.address,
            business_type: localConfig.business_type,
            category: localConfig.category,
            description: localConfig.persona?.system_prompt,
            products: localConfig.pricing?.custom_packages,
          },
        },
        settings: null,
      };
    }
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
    // 2. tenant.metadata.logo_url / store.logo_url / store_logo_url / image
    // 3. Gambar produk pertama yang aktif
    // 4. Fallback default branding resmi BoonTrack 1200x630 (bukan gambar demo)
    // =========================================================================
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

    const logoUrl =
      metaObj.logo_url ||
      store?.logo_url ||
      metaObj.store_logo_url ||
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

    const BOONTRACK_OFFICIAL_OG = 'https://shop.boontrack.com/og-shop.png';

    const rawOgImage =
      explicitOgImage ||
      bannerUrl ||
      logoUrl ||
      firstProductImage ||
      BOONTRACK_OFFICIAL_OG;

    // Normalisasi URL gambar ke Absolute URL kanonikal yang valid untuk bot crawler WhatsApp / Facebook
    let resolvedOgImage = rawOgImage;
    if (resolvedOgImage.startsWith('/')) {
      resolvedOgImage = `${canonicalBaseUrl}${resolvedOgImage}`;
    }

    // Ekstraksi MIME type yang tepat untuk WhatsApp link preview
    const cleanImageExt = resolvedOgImage.split('?')[0].toLowerCase();
    const imageMimeType = cleanImageExt.endsWith('.jpg') || cleanImageExt.endsWith('.jpeg')
      ? 'image/jpeg'
      : cleanImageExt.endsWith('.webp')
        ? 'image/webp'
        : 'image/png';

    // Favicon dinamis per-tenant sesuai logo toko atau default shopping cart khas storefront
    const resolvedFavicon = logoUrl || '/shopping-cart.svg';
    const resolvedAppleIcon = logoUrl || '/shopping-cart.png';

    const isPublicService =
      metaObj.business_type === 'B2G' ||
      metaObj.category === 'public_service' ||
      cleanTenant === 'margasari' ||
      cleanTenant === 'kelurahan-margasari';

    const pageTitle = `${storeName} | ${isPublicService ? 'Portal Resmi' : 'Layanan Resmi'}`;

    return {
      metadataBase: new URL(canonicalBaseUrl),
      title: pageTitle,
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
        url: canonicalUrl,
        siteName: storeName,
        locale: 'id_ID',
        type: 'website',
        images: [
          {
            url: resolvedOgImage,
            width: 1200,
            height: 630,
            type: imageMimeType,
            alt: `${storeName} - ${metaObj.tagline || 'Konsultasi & Layanan Resmi'}`,
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
