import React from 'react';
import { Metadata } from 'next';
import { getTenantStoreData } from '@/lib/tenant-store-data';
import { normalizeTenantSlug } from '@/lib/tenant-config';
import { resolveSinglePageProduct, slugify } from '@/lib/product-catalog';
import { sanitizeImageUrl } from '@/lib/image-utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string; slug: string }>;
}): Promise<Metadata> {
  try {
    const { tenant, slug } = await params;
    const cleanTenant = normalizeTenantSlug((tenant || '').toLowerCase().trim());
    const cleanSlug = (slug || '').toLowerCase().trim();

    const { store } = await getTenantStoreData(cleanTenant);
    const storeName = store?.name || cleanTenant.replace(/[-_]/g, ' ').toUpperCase();
    const metaObj = (store?.metadata as Record<string, any>) || {};

    const customDomain =
      metaObj.custom_domain ||
      (Array.isArray(metaObj.custom_domains) ? metaObj.custom_domains[0] : null) ||
      (cleanTenant === 'tumbuh-kembang-anak' ? 'konsul.littlebitefeeding.com' : null);

    const canonicalBaseUrl = customDomain
      ? `https://${customDomain}`
      : 'https://shop.boontrack.com';

    const canonicalUrl = `${canonicalBaseUrl}/p/${cleanSlug}`;

    // Cari produk di dalam metadata.products
    const products: any[] = Array.isArray(metaObj.products) ? metaObj.products : [];
    let product = products.find(
      (p) =>
        p &&
        (p.slug === cleanSlug ||
          String(p.id) === cleanSlug ||
          (p.name && slugify(p.name) === cleanSlug))
    );

    // Fallback ke resolver lokal jika belum ditemukan di Supabase
    if (!product) {
      const fallbackResolved = resolveSinglePageProduct(cleanTenant, cleanSlug);
      if (fallbackResolved?.product && fallbackResolved.product.name) {
        product = fallbackResolved.product;
      }
    }

    const storeLogo =
      metaObj.store_logo_url ||
      store?.logo_url ||
      metaObj.logo_url ||
      metaObj.image ||
      (store as any)?.store_logo_url ||
      null;

    let resolvedLogo = storeLogo;
    if (resolvedLogo && resolvedLogo.startsWith('/')) {
      resolvedLogo = `${canonicalBaseUrl}${resolvedLogo}`;
    }

    if (product) {
      const productName = product.name || product.title || cleanSlug;
      const productDesc =
        product.single_page_config?.subheadline ||
        product.description ||
        product.single_page_config?.headline ||
        metaObj.description ||
        `Pesan ${productName} resmi di ${storeName}. Pemesanan online praktis via WhatsApp dan pembayaran aman terverifikasi.`;

      const rawProductImage =
        product.single_page_config?.banner_url ||
        product.image ||
        product.image_url ||
        (Array.isArray(product.images) && product.images[0]) ||
        product.single_page_config?.hero_image ||
        metaObj.og_image ||
        (cleanTenant === 'tumbuh-kembang-anak' ? '/tenants/tumbuh-kembang-anak/og-image.png' : null) ||
        storeLogo ||
        '/default-og.png';

      let resolvedProductImage = sanitizeImageUrl(rawProductImage) || rawProductImage;
      if (resolvedProductImage.startsWith('/')) {
        resolvedProductImage = `${canonicalBaseUrl}${resolvedProductImage}`;
      }

      const cleanImageExt = resolvedProductImage.split('?')[0].toLowerCase();
      const imageMimeType = cleanImageExt.endsWith('.jpg') || cleanImageExt.endsWith('.jpeg')
        ? 'image/jpeg'
        : cleanImageExt.endsWith('.webp')
          ? 'image/webp'
          : 'image/png';

      const pageTitle = `${productName} | ${storeName}`;

      return {
        metadataBase: new URL(canonicalBaseUrl),
        title: pageTitle,
        description: productDesc,
        icons: {
          icon: resolvedLogo || '/favicon.ico',
          shortcut: resolvedLogo || '/favicon.ico',
          apple: resolvedLogo || '/favicon.ico',
        },
        openGraph: {
          title: pageTitle,
          description: productDesc,
          url: canonicalUrl,
          siteName: storeName,
          locale: 'id_ID',
          type: 'website',
          images: [
            {
              url: resolvedProductImage,
              width: 1200,
              height: 630,
              type: imageMimeType,
              alt: productName,
            },
          ],
        },
        twitter: {
          card: 'summary_large_image',
          title: pageTitle,
          description: productDesc,
          images: [resolvedProductImage],
        },
      };
    }

    // Fallback jika spesifik slug tidak terdeteksi
    return {
      metadataBase: new URL(canonicalBaseUrl),
      title: `${cleanSlug} | ${storeName}`,
      description: metaObj.description || `Layanan resmi ${storeName}.`,
      icons: {
        icon: resolvedLogo || '/favicon.ico',
        shortcut: resolvedLogo || '/favicon.ico',
        apple: resolvedLogo || '/favicon.ico',
      },
    };
  } catch (err) {
    console.warn('[ProductLayout] generateMetadata error:', err);
    return {
      title: 'Detail Produk | Layanan Resmi',
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

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
