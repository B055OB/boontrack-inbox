export interface TenantDomainRecord {
  slug: string;
  custom_domain?: string | null;
}

export interface ProductLinkParams {
  id?: string | number;
  slug?: string;
}

export interface TenantActionRecord extends TenantDomainRecord {
  category?: string | null;
  business_type?: string | null;
}

/**
 * Dynamic Platform Domain & Canonical URL Resolver (ARCHITECTURE.md Section 11.1)
 *
 * Rules:
 * 1. If tenant has an active custom_domain, use https://{custom_domain}
 * 2. Otherwise, use canonical platform domain https://boontrack.com/{tenant_slug}
 * 3. Never use regex slicing or substring tricks that truncate the tenant slug.
 */
export function getTenantBaseUrl(tenant: TenantDomainRecord): string {
  const rawDomain = (tenant.custom_domain || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');

  if (rawDomain) {
    return `https://${rawDomain}`;
  }

  const cleanSlug = (tenant.slug || '').trim().toLowerCase();
  return cleanSlug ? `https://boontrack.com/${cleanSlug}` : 'https://boontrack.com';
}

export function getTenantCanonicalUrl(tenant: TenantDomainRecord): string {
  return getTenantBaseUrl(tenant);
}

/**
 * Retail / Digital Instant Checkout Link (for Physical & Digital e-commerce)
 */
export function getTenantCheckoutUrl(
  tenant: TenantDomainRecord,
  product?: ProductLinkParams
): string {
  const baseUrl = getTenantBaseUrl(tenant);

  if (product?.slug) {
    return `${baseUrl}/p/${product.slug}`;
  }

  if (product?.id !== undefined && product?.id !== null && String(product.id).trim().length > 0) {
    return `${baseUrl}/checkout?product=${product.id}`;
  }

  return `${baseUrl}/checkout`;
}

/**
 * Universal Action Link Generator for 6 Canonical Verticals (ARCHITECTURE.md Sections 8.5 & 11.2)
 *
 * Strict Compliance:
 * - PROFESSIONAL_SERVICE: FORBIDDEN to checkout cart (/checkout). Points to consultation/service booking: https://boontrack.com/{slug} or /p/{slug}.
 * - FIELD_SERVICE: FORBIDDEN retail add-to-cart. Points to technician booking/schedule slot: https://boontrack.com/{slug} or /p/{slug}.
 * - CREATOR_AGENCY: Points to rate card & brief submission: https://boontrack.com/{slug} or /p/{slug}.
 * - FOOD: Points to restaurant menu / instant order: https://boontrack.com/{slug} or /p/{slug}.
 * - DIGITAL: Direct checkout/download: https://boontrack.com/{slug}/checkout or /p/{slug}.
 * - PHYSICAL: Retail product catalog / checkout with expedition shipping.
 */
export function getTenantActionUrl(
  tenant: TenantActionRecord,
  product?: ProductLinkParams
): string {
  const baseUrl = getTenantBaseUrl(tenant);
  const rawCat = String(tenant.category || tenant.business_type || '').toUpperCase().trim();

  // 1. PROFESSIONAL_SERVICE (Seksi 8.5 & 11.2):
  // DILARANG KERAS checkout keranjang belanja instan (/checkout).
  // Alurnya adalah booking jadwal konsultasi / intake brief.
  if (
    rawCat.includes('PROFESSIONAL') ||
    rawCat.includes('LEGAL') ||
    rawCat.includes('KONSULTAN') ||
    rawCat.includes('PRO_SERVICE')
  ) {
    if (product?.slug) {
      return `${baseUrl}/p/${product.slug}`;
    }
    return baseUrl;
  }

  // 2. FIELD_SERVICE (Seksi 8.5 & 11.2):
  // DILARANG add-to-cart barang retail fisik.
  // Alurnya adalah booking slot waktu teknisi & konfirmasi lokasi servis.
  if (
    rawCat.includes('FIELD_SERVICE') ||
    rawCat.includes('BENGKEL') ||
    rawCat.includes('TEKNISI') ||
    rawCat.includes('CLEANING') ||
    rawCat.includes('TOREN')
  ) {
    if (product?.slug) {
      return `${baseUrl}/p/${product.slug}`;
    }
    return baseUrl;
  }

  // 3. CREATOR_AGENCY:
  // Alur pengajuan brief kreatif & rate card paket endorse/talent.
  if (
    rawCat.includes('CREATOR') ||
    rawCat.includes('INFLUENCER') ||
    rawCat.includes('TALENT') ||
    rawCat.includes('ENDORSE')
  ) {
    if (product?.slug) {
      return `${baseUrl}/p/${product.slug}`;
    }
    return baseUrl;
  }

  // 4. FOOD:
  // Menu dapur & takeaway/delivery
  if (
    rawCat.includes('FOOD') ||
    rawCat.includes('CULINARY') ||
    rawCat.includes('KULINER') ||
    rawCat.includes('RESTO') ||
    rawCat.includes('CAFE') ||
    rawCat.includes('BAKERY')
  ) {
    if (product?.slug) {
      return `${baseUrl}/p/${product.slug}`;
    }
    return baseUrl;
  }

  // 5. DIGITAL & PHYSICAL (Retail): Link ke checkout atau halaman produk
  if (product?.slug) {
    return `${baseUrl}/p/${product.slug}`;
  }

  if (product?.id !== undefined && product?.id !== null && String(product.id).trim().length > 0) {
    return `${baseUrl}/checkout?product=${product.id}`;
  }

  return `${baseUrl}/checkout`;
}

