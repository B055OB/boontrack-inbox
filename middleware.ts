import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { extractMerchantSessionToken, verifyMerchantSessionToken } from '@/lib/auth/merchant-session-edge';

/**
 * ============================================================
 * BoonTrack Multi-Tenant & Custom Domain Middleware
 * ============================================================
 */

// In-Memory Cache untuk Custom Domain Lookup (TTL 5 menit)
interface DomainCacheEntry {
  slug: string | null;
  tenantId?: string | null;
  timestamp: number;
}

const domainCache = new Map<string, DomainCacheEntry>();
const tenantSlugToIdCache = new Map<string, { id: string | null; timestamp: number }>();
interface TenantStorefrontResolution {
  tenantId: string | null;
  slug: string;
  isEligible: boolean;
  status: 'FOUND' | 'NOT_FOUND' | 'INELIGIBLE' | 'ERROR';
}
const tenantStorefrontCache = new Map<string, { result: TenantStorefrontResolution; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit

// Known Custom Domains Registry (Fast-path mapping with 0ms edge latency)
const KNOWN_CUSTOM_DOMAINS: Record<string, { slug: string; tenantId?: string }> = {
  'konsul.littlebitefeeding.com': {
    slug: 'tumbuh-kembang-anak',
    tenantId: '692080ea-81b7-496b-87ee-bd8b9565b28c',
  },
  'screening.littlebitefeeding.com': {
    slug: 'tumbuh-kembang-anak',
    tenantId: '692080ea-81b7-496b-87ee-bd8b9565b28c',
  },
  'order.shabuajhi.com': {
    slug: 'shabu-ajhi',
    tenantId: '70c1ea8c-3557-44af-b131-faae75a8b17f',
  },
};

// Root / Apex Domain Redirects to Official Operational Subdomains (301 Permanent Redirect)
const ROOT_DOMAIN_REDIRECTS: Record<string, string> = {
  'littlebitefeeding.com': 'https://konsul.littlebitefeeding.com',
  'www.littlebitefeeding.com': 'https://konsul.littlebitefeeding.com',
};

// Known B2B Tenant Slugs (webchat + CS inbox engine)
const B2B_TENANT_SLUGS = new Set([
  'atmosfitnes',
  'nyka', 'nyka-hijab', 'nyka-modest', 'nyka-store',
  'suhu-ads', 'suhu-ads-masterclass', 'suhuads', 'masterclass', 'digital-marketing',
  'bale-pananggeuhan', 'bale',
  'margasari', 'kelurahan-margasari',
  'pelayanan-publik',
  'om-budi', 'om_budi', 'ombudi', 'boontrack-demo', 'boontrack-holding', 'holding',
]);

// Known Career/Jobseeker Profile subdomains
const CAREER_KNOWN_SLUGS = new Set([
  'cv', 'career', 'resume', 'profile',
  'rayi-gemilang', 'rayi',
]);

/**
 * Helper untuk menentukan apakah hostname adalah domain internal sistem atau official BoonTrack
 */
function isSystemOrBoonTrackHost(hostClean: string): boolean {
  if (
    !hostClean ||
    hostClean === 'localhost' ||
    hostClean === '127.0.0.1' ||
    hostClean.endsWith('.localhost') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostClean)
  ) {
    return true;
  }

  // Vercel deployment / preview domains
  if (hostClean.endsWith('.vercel.app')) {
    return true;
  }

  // shop.boontrack.com
  if (hostClean === 'shop.boontrack.com') {
    return true;
  }

  // creator.boontrack.com
  if (hostClean === 'creator.boontrack.com') {
    return true;
  }

  // studio.boontrack.com
  if (hostClean === 'studio.boontrack.com' || hostClean.startsWith('studio.')) {
    return true;
  }

  // BoonTrack official domain & subdomains
  if (
    hostClean === 'boontrack.com' ||
    hostClean === 'www.boontrack.com' ||
    hostClean.endsWith('.boontrack.com')
  ) {
    return true;
  }

  return false;
}

/**
 * Lookup slug tenant berdasarkan custom domain:
 * 1. Cek memory cache (TTL 5 menit)
 * 2. Fetch ke Core Backend GET /api/v1/store/lookup-by-domain?domain={hostname} (revalidate 300s)
 * 3. Fallback ke Supabase REST jika Core Backend 404 / offline
 */
async function lookupTenantByDomain(hostname: string): Promise<{ slug: string | null; tenantId: string | null }> {
  // 0. Fast-path: Known Custom Domains Registry (0ms Edge Execution)
  const known = KNOWN_CUSTOM_DOMAINS[hostname];
  if (known) {
    return { slug: known.slug, tenantId: known.tenantId || null };
  }

  const cached = domainCache.get(hostname);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return { slug: cached.slug, tenantId: cached.tenantId || null };
  }

  let slug: string | null = null;
  let tenantId: string | null = null;
  const coreApiUrl =
    process.env.CORE_API_URL ||
    process.env.NEXT_PUBLIC_CORE_API_URL ||
    process.env.CORE_BACKEND_URL ||
    'https://api.boontrack.com';

  // 1. Fetch lookup ke Core Backend
  try {
    const lookupUrl = `${coreApiUrl.replace(/\/$/, '')}/api/v1/store/lookup-by-domain?domain=${encodeURIComponent(hostname)}`;
    const res = await fetch(lookupUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      next: { revalidate: 300 }, // Revalidate 5 menit
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      slug = data.tenant_slug || data.slug || data.tenant?.slug || null;
      tenantId = data.tenant_id || data.id || data.tenant?.id || null;
    }
  } catch (err) {
    console.warn('[middleware] Core backend lookup error:', err);
  }

  // 2. Fallback Supabase REST (Single Source of Truth)
  if (!slug) {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const supaUrl = `${supabaseUrl}/rest/v1/tenants?select=id,slug,metadata&or=(metadata->>custom_domain.eq.${encodeURIComponent(hostname)},metadata->custom_domains.cs.["${encodeURIComponent(hostname)}"])&limit=1`;
        const supaRes = await fetch(supaUrl, {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
          next: { revalidate: 300 },
        });

        if (supaRes.ok) {
          const rows = await supaRes.json().catch(() => []);
          if (Array.isArray(rows) && rows.length > 0 && rows[0]?.slug) {
            slug = rows[0].slug;
            tenantId = rows[0].id || null;
          }
        }
      }
    } catch (supaErr) {
      console.warn('[middleware] Supabase fallback lookup error:', supaErr);
    }
  }

  // Simpan ke in-memory cache
  domainCache.set(hostname, { slug, tenantId, timestamp: now });
  if (slug && tenantId) {
    tenantSlugToIdCache.set(slug, { id: tenantId, timestamp: now });
  }
  return { slug, tenantId };
}

/**
 * Resolves storefront eligibility and tenant_id using memory cache & Supabase REST.
 * Fail-closed: returns isEligible=false for unknown, inactive, or non-commerce tenants.
 */
async function resolveTenantStorefront(slug: string): Promise<TenantStorefrontResolution> {
  const cleanSlug = slug.toLowerCase().trim();
  if (!cleanSlug) {
    return { tenantId: null, slug: cleanSlug, isEligible: false, status: 'NOT_FOUND' };
  }

  const cached = tenantStorefrontCache.get(cleanSlug);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[middleware] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing in environment');
    const errResult: TenantStorefrontResolution = {
      tenantId: null,
      slug: cleanSlug,
      isEligible: false,
      status: 'ERROR',
    };
    return errResult;
  }

  let result: TenantStorefrontResolution = {
    tenantId: null,
    slug: cleanSlug,
    isEligible: false,
    status: 'NOT_FOUND',
  };

  try {
    const supaUrl = `${supabaseUrl}/rest/v1/tenants?select=id,slug,is_active,status,business_type,template_code,tier&slug=eq.${encodeURIComponent(cleanSlug)}&limit=1`;
    const supaRes = await fetch(supaUrl, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      next: { revalidate: 300 },
    });

    if (supaRes.ok) {
      const rows = await supaRes.json().catch(() => []);
      if (Array.isArray(rows) && rows.length > 0 && rows[0]?.id) {
        const row = rows[0];
        const isActive =
          row.is_active !== false &&
          (row.status === undefined || row.status === null || String(row.status).toLowerCase() === 'active');

        const rawBusinessType = String(row.business_type || '').toUpperCase().trim();
        const rawTemplate = String(row.template_code || row.template || '').toUpperCase().trim();
        const rawTier = String(row.tier || '').toUpperCase().trim();

        // Authoritative Commerce Tiers (ARCHITECTURE.md § 63 & AGENTS.md Rule 2)
        // Primary: SOLO, PRO_SCALE, ADS_PERFORMANCE, ENTERPRISE, TEAM_SCALE
        // Documented platform aliases: STARTER, CHECKOUT_LITE, LITE, BASIC, GROWTH, GROWTH_PLUS, SCALE, PRO, SPECIAL_GRANT
        const VALID_COMMERCE_TIERS = new Set([
          'SOLO',
          'STARTER',
          'PRO_SCALE',
          'ADS_PERFORMANCE',
          'TEAM_SCALE',
          'ENTERPRISE',
          'CHECKOUT_LITE',
          'LITE',
          'BASIC',
          'GROWTH',
          'GROWTH_PLUS',
          'SCALE',
          'PRO',
          'SPECIAL_GRANT',
        ]);

        const NON_COMMERCE_BUSINESS_TYPES = new Set([
          'PUBLIC_SERVICE',
          'B2G',
          'DESA',
          'COMMUNITY',
          'PELAYANAN_PUBLIK',
        ]);

        const NON_COMMERCE_TEMPLATES = new Set([
          'PUBLIC_SERVICE_V1',
        ]);

        const NON_COMMERCE_TIERS = new Set([
          'FREE',
          'CIVIC',
          'PUBLIC_SERVICE',
          'DESA',
        ]);

        const isCommerceTier = Boolean(rawTier && VALID_COMMERCE_TIERS.has(rawTier));
        const isNonCommerce =
          NON_COMMERCE_BUSINESS_TYPES.has(rawBusinessType) ||
          NON_COMMERCE_TEMPLATES.has(rawTemplate) ||
          NON_COMMERCE_TIERS.has(rawTier) ||
          !isCommerceTier;

        if (!isActive || isNonCommerce) {
          result = {
            tenantId: row.id,
            slug: cleanSlug,
            isEligible: false,
            status: 'INELIGIBLE',
          };
        } else {
          result = {
            tenantId: row.id,
            slug: cleanSlug,
            isEligible: true,
            status: 'FOUND',
          };
          tenantSlugToIdCache.set(cleanSlug, { id: row.id, timestamp: now });
        }
      } else {
        result = {
          tenantId: null,
          slug: cleanSlug,
          isEligible: false,
          status: 'NOT_FOUND',
        };
      }
    } else {
      result = {
        tenantId: null,
        slug: cleanSlug,
        isEligible: false,
        status: supaRes.status === 404 ? 'NOT_FOUND' : 'ERROR',
      };
    }
  } catch (err) {
    console.warn('[middleware] Failed to resolve tenant storefront record:', err);
    result = {
      tenantId: null,
      slug: cleanSlug,
      isEligible: false,
      status: 'ERROR',
    };
  }

  tenantStorefrontCache.set(cleanSlug, { result, timestamp: now });
  return result;
}

/**
 * Applies scoped cache key headers for tenant storefront isolation (CDN/Edge & browser).
 */
function applyStorefrontCacheHeaders(
  res: NextResponse,
  slug: string,
  tenantId?: string | null
): NextResponse {
  if (slug) {
    res.headers.set('x-tenant-slug', slug);
    res.headers.set('Cache-Tag', `tenant-${slug}`);
    res.headers.set('x-tenant-id', tenantId || slug);
  }
  return res;
}

/**
 * Applies strict anti-caching headers for sensitive endpoints (APIs, checkout, admin, auth).
 */
function applySensitiveCacheHeaders(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.headers.set('Pragma', 'no-cache');
  return res;
}

// In-Memory Cache untuk Affiliate Code Lookup (TTL 5 menit)
interface AffiliateCacheEntry {
  referralCode: string | null;
  timestamp: number;
}
const affiliateSubdomainCache = new Map<string, AffiliateCacheEntry>();

/**
 * Lookup kode referral affiliate mitra berdasarkan subdomain:
 * 1. Fast-path alias (buzzerukm, mafiasakti, kangsakti)
 * 2. Cek memory cache (TTL 5 menit)
 * 3. Query Supabase REST tabel affiliates
 */
async function resolveAffiliateCode(subdomain: string): Promise<string | null> {
  const cleanSub = subdomain.toLowerCase().trim();
  if (!cleanSub) return null;

  if (cleanSub === 'buzzerukm' || cleanSub === 'mafiasakti' || cleanSub === 'kangsakti') {
    return 'buzzerukm';
  }

  const cached = affiliateSubdomainCache.get(cleanSub);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.referralCode;
  }

  let referralCode: string | null = null;
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTcyMzIsImV4cCI6MjEwMTk5MzIzMn0.Tn7MREcxcOyWzkhgz5t0XOzVOBagQ7PsH-JTch0ZF0M';
    if (supabaseKey) {
      const supaUrl = `${supabaseUrl}/rest/v1/affiliates?select=referral_code&referral_code=ilike.${encodeURIComponent(cleanSub)}&limit=1`;
      const res = await fetch(supaUrl, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        next: { revalidate: 300 },
      });
      if (res.ok) {
        const rows = await res.json().catch(() => []);
        if (Array.isArray(rows) && rows.length > 0 && rows[0]?.referral_code) {
          referralCode = rows[0].referral_code.trim().toLowerCase();
        }
      }
    }
  } catch (err) {
    console.warn('[middleware] Affiliate code lookup error:', err);
  }

  affiliateSubdomainCache.set(cleanSub, { referralCode, timestamp: now });
  return referralCode;
}

/**
 * Pasang cookie referral 30 hari pada response NextResponse
 */
function setReferralCookies(res: NextResponse, refCode: string, hostClean?: string) {
  if (!refCode) return;
  const cookieOptions: any = {
    maxAge: 30 * 24 * 60 * 60, // 30 hari (2592000 detik)
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
  if (hostClean && (hostClean.endsWith('.boontrack.com') || hostClean === 'boontrack.com' || hostClean.includes('boontrack.com'))) {
    cookieOptions.domain = '.boontrack.com';
  }
  res.cookies.set('ref', refCode, cookieOptions);
  res.cookies.set('boontrack_referral_code', refCode, cookieOptions);
  res.cookies.set('boontrack_merchant_ref', refCode, cookieOptions);
}

/**
 * Pasang cookie reseller tenant (?r=) pada response NextResponse
 * Invariant (ADR Attribution Separation):
 * ?r= diisolasi murni ke cookie bt_reseller_code dan TIDAK PERNAH disalin ke platform referral cookies (ref, boontrack_referral_code).
 */
function setResellerCookie(res: NextResponse, resellerCode: string, hostClean?: string) {
  if (!resellerCode) return;
  const cookieOptions: any = {
    maxAge: 30 * 24 * 60 * 60, // 30 hari (2592000 detik)
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
  if (hostClean && (hostClean.endsWith('.boontrack.com') || hostClean === 'boontrack.com' || hostClean.includes('boontrack.com'))) {
    cookieOptions.domain = '.boontrack.com';
  }
  res.cookies.set('bt_reseller_code', resellerCode, cookieOptions);
}

/**
 * Extract subdomain from incoming request hostname for *.boontrack.com.
 */
function extractSubdomain(hostWithPort: string): string | null {
  const hostClean = hostWithPort.split(':')[0].toLowerCase().trim();

  if (
    hostClean === 'localhost' ||
    hostClean === '127.0.0.1' ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostClean)
  ) {
    return null;
  }

  if (hostClean.endsWith('.localhost')) {
    const parts = hostClean.replace('.localhost', '').split('.');
    return parts[parts.length - 1] || null;
  }

  if (hostClean.endsWith('.boontrack.com')) {
    const parts = hostClean.replace('.boontrack.com', '').split('.');
    return parts[parts.length - 1] || null;
  }

  const parts = hostClean.split('.');
  if (parts.length > 2) {
    return parts[0] || null;
  }

  return null;
}

/**
 * Helper untuk memeriksa apakah request memiliki sesi login merchant aktif yang COCOK dengan target slug tenant.
 * Mencegah Tenant A mengakses dashboard Tenant B (Tenant Isolation Guard) dan memblokir akses anonim/incognito.
 */
async function hasValidTenantSession(req: NextRequest, targetSlug?: string): Promise<boolean> {
  const cleanTarget = targetSlug ? targetSlug.toLowerCase().trim() : '';

  // P0 SECURITY INVARIANT:
  // Zero Trust on plaintext cookies (merchant_store, merchant_session, bt_tenant, studio_session).
  // Plain cookies are non-authoritative routing context only and CANNOT grant authorization.
  // Protected dashboard access strictly requires a valid cryptographically signed server token (bt_merchant_token).
  const token = extractMerchantSessionToken(req);
  if (!token) {
    return false;
  }

  const verified = await verifyMerchantSessionToken(token, cleanTarget || undefined);
  return Boolean(verified.valid && verified.payload);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aLen = a.length;
  const bLen = b.length;
  let mismatch = aLen === bLen ? 0 : 1;
  const maxLen = Math.max(aLen, bLen);
  for (let i = 0; i < maxLen; i++) {
    const charA = i < aLen ? a.charCodeAt(i) : 0;
    const charB = i < bLen ? b.charCodeAt(i) : 0;
    mismatch |= charA ^ charB;
  }
  return mismatch === 0;
}

async function handleRouting(req: NextRequest, hostClean: string) {
  const pathname = req.nextUrl.pathname;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';

  // ── CACHE FLUSH TRIGGER (Authorized Internal Memory Cache Purge) ──
  // P0 Security Invariant: Zero URL secret, zero CRON_SECRET fallback, fail closed when missing
  const purgeSecret = (process.env.INTERNAL_PURGE_SECRET || '').trim();
  const providedPurgeSecret = (req.headers.get('x-purge-secret') || '').trim();
  const hasValidPurgeSecret =
    purgeSecret.length >= 16 &&
    providedPurgeSecret.length > 0 &&
    timingSafeEqualStr(providedPurgeSecret, purgeSecret);

  if (
    (req.headers.get('x-purge-cache') === '1' || pathname === '/api/v1/cache/purge') &&
    hasValidPurgeSecret
  ) {
    domainCache.clear();
    tenantSlugToIdCache.clear();
    tenantStorefrontCache.clear();
    affiliateSubdomainCache.clear();
  }

  // ── 0a. SENSITIVE API ENDPOINTS & ZERO-LEAK CACHE GUARD (CTO Mandate) ──
  if ((pathname.startsWith('/api/') || pathname === '/api') && hostClean !== 'app.boontrack.com' && hostClean !== 'app.localhost') {
    const res = NextResponse.next();
    applySensitiveCacheHeaders(res);
    return res;
  }

  // ── 0b. BYPASS STATIC ASSETS LANGSUNG (/_next, /favicon.ico, /images, dll.) ──
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/images') ||
    pathname === '/favicon.ico' ||
    pathname === '/apple-touch-icon.png' ||
    pathname === '/404-store-not-found' ||
    pathname.includes('.')
  ) {
    if (pathname === '/favicon.ico') {
      if (hostClean === 'app.boontrack.com' || hostClean.startsWith('app.')) {
        const url = req.nextUrl.clone();
        url.pathname = '/branding/app/favicon.ico';
        return NextResponse.rewrite(url);
      }
      if (hostClean === 'creator.boontrack.com' || hostClean.startsWith('creator.')) {
        const url = req.nextUrl.clone();
        url.pathname = '/branding/creator/favicon.ico';
        return NextResponse.rewrite(url);
      }
      if (hostClean === 'studio.boontrack.com' || hostClean.startsWith('studio.')) {
        const url = req.nextUrl.clone();
        url.pathname = '/branding/studio/favicon.ico';
        return NextResponse.rewrite(url);
      }
    }
    if (pathname === '/apple-touch-icon.png') {
      if (hostClean === 'app.boontrack.com' || hostClean.startsWith('app.')) {
        const url = req.nextUrl.clone();
        url.pathname = '/branding/app/apple-touch-icon.png';
        return NextResponse.rewrite(url);
      }
      if (hostClean === 'creator.boontrack.com' || hostClean.startsWith('creator.')) {
        const url = req.nextUrl.clone();
        url.pathname = '/branding/creator/icon.png';
        return NextResponse.rewrite(url);
      }
      if (hostClean === 'studio.boontrack.com' || hostClean.startsWith('studio.')) {
        const url = req.nextUrl.clone();
        url.pathname = '/branding/studio/icon.png';
        return NextResponse.rewrite(url);
      }
    }
    if (pathname === '/manifest.json' || pathname === '/site.webmanifest') {
      if (hostClean === 'creator.boontrack.com' || hostClean.startsWith('creator.')) {
        const url = req.nextUrl.clone();
        url.pathname = '/branding/creator/manifest.json';
        return NextResponse.rewrite(url);
      }
      if (hostClean === 'studio.boontrack.com' || hostClean.startsWith('studio.')) {
        const url = req.nextUrl.clone();
        url.pathname = '/branding/studio/manifest.json';
        return NextResponse.rewrite(url);
      }
      if (hostClean === 'app.boontrack.com' || hostClean.startsWith('app.')) {
        const url = req.nextUrl.clone();
        url.pathname = '/branding/app/site.webmanifest';
        return NextResponse.rewrite(url);
      }
    }
    return NextResponse.next();
  }

  // ===========================================================================
  // 1. DASHBOARD SUBDOMAIN ROUTING (dashboard.boontrack.com) - URUTAN PALING ATAS
  // ===========================================================================
  const subdomain = extractSubdomain(host);

  // ===========================================================================
  // SUBDOMAIN: desk.boontrack.com (LEGACY OPERATOR DESK REDIRECT TO DASHBOARD)
  // ARCHITECTURE.md § 67.3 & § 69.1: desk.boontrack.com bukan topologi resmi.
  // Sentralisasi meja kerja CS berada di https://dashboard.boontrack.com/{tenantSlug}.
  // Redirect 301 ke dashboard.boontrack.com dengan preservasi path & query parameters.
  // ===========================================================================
  const isDeskHost =
    hostClean === 'desk.boontrack.com' ||
    hostClean === 'desk.localhost' ||
    (hostClean.endsWith('.boontrack.com') && subdomain === 'desk');

  if (isDeskHost) {
    const isProd = hostClean.endsWith('.boontrack.com') || hostClean === 'boontrack.com';
    const dashboardBase = isProd
      ? 'https://dashboard.boontrack.com'
      : `${req.nextUrl.protocol}//dashboard.${hostClean.replace(/^desk\./, '')}${req.nextUrl.port ? `:${req.nextUrl.port}` : ''}`;

    if (pathname === '/' || pathname === '') {
      return NextResponse.redirect(new URL(`${dashboardBase}/login`, req.url), 301);
    }

    const targetUrl = new URL(`${dashboardBase}${pathname}`, req.url);
    req.nextUrl.searchParams.forEach((val, key) => {
      targetUrl.searchParams.set(key, val);
    });
    return NextResponse.redirect(targetUrl, 301);
  }

  const isDashboardDomain =
    host.startsWith('dashboard.boontrack.com') ||
    hostClean === 'dashboard.boontrack.com' ||
    host.startsWith('dashboard.localhost') ||
    hostClean === 'dashboard.localhost' ||
    host.startsWith('dashboard.') ||
    subdomain === 'dashboard';

  const isStudioHost =
    hostClean === 'studio.boontrack.com' ||
    hostClean.startsWith('studio.') ||
    subdomain === 'studio';

  // ── CANONICAL LOGIN ORIGIN ENFORCEMENT (P0 SECURITY MANDATE) ──
  // Merchant / CS login must be performed at the canonical dashboard origin (dashboard.boontrack.com).
  // Non-dashboard hosts (such as boontrack.com/login, shop.boontrack.com/login) redirect 302 to canonical dashboard.
  if (pathname === '/login' || pathname.startsWith('/login/')) {
    if (!isDashboardDomain && !isStudioHost) {
      const isLocal = hostClean === 'localhost' || hostClean === '127.0.0.1' || hostClean.endsWith('.localhost');
      const targetBase = isLocal
        ? `${req.nextUrl.protocol}//dashboard.localhost${req.nextUrl.port ? `:${req.nextUrl.port}` : ''}`
        : 'https://dashboard.boontrack.com';
      const targetUrl = new URL(`${targetBase}${pathname}`);
      req.nextUrl.searchParams.forEach((val, key) => {
        targetUrl.searchParams.set(key, val);
      });
      return NextResponse.redirect(targetUrl, 302);
    }
  }

  if (isDashboardDomain) {
    // A. Root frontpage (/) atau (/login) -> Internal rewrite langsung ke /login (URL browser tetap dashboard.boontrack.com)
    if (pathname === '/' || pathname === '' || pathname === '/login' || pathname.startsWith('/login/')) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.rewrite(url);
    }

    // B. Reserved public routes on dashboard domain
    const RESERVED_PUBLIC_ROUTES = new Set([
      'login',
      'register',
      'daftar',
      'api',
      '_next',
      'static',
      'images',
      'favicon.ico',
      'apple-touch-icon.png',
      'terms',
      'privacy',
      'refund',
      'contact',
      '404-store-not-found',
    ]);

    // C. Parse tenant slug dan subpaths untuk internal rewrite ke /[tenant]/dashboard/...
    const segments = pathname.split('/').filter(Boolean);
    const tenantSlug = segments[0]?.toLowerCase().trim();

    if (tenantSlug && !RESERVED_PUBLIC_ROUTES.has(tenantSlug)) {
      // Public storefront routes hitting dashboard domain -> Redirect 307 to storefront domain (shop.boontrack.com)
      if (segments[1] === 'invoice' || segments[1] === 'pay' || segments[1] === 'checkout') {
        const storeSubPath = segments.slice(1).join('/');
        const isProd = hostClean.endsWith('.boontrack.com') || hostClean === 'boontrack.com';
        const targetHost = isProd ? 'https://shop.boontrack.com' : `${req.nextUrl.protocol}//shop.${hostClean.replace(/^dashboard\./, '')}${req.nextUrl.port ? `:${req.nextUrl.port}` : ''}`;
        const targetUrl = new URL(`${targetHost}/${tenantSlug}/${storeSubPath}`);
        req.nextUrl.searchParams.forEach((val, key) => {
          targetUrl.searchParams.set(key, val);
        });
        return NextResponse.redirect(targetUrl, 307);
      }

      // ── TENANT AUTH GUARD & ISOLATION CHECK (P0 SECURITY) ──
      // Incognito / unauthenticated / wrong tenant cookie langsung di-redirect ke /login
      if (!(await hasValidTenantSession(req, tenantSlug))) {
        const loginUrl = req.nextUrl.clone();
        loginUrl.pathname = '/login';
        const redirectTarget = pathname + (req.nextUrl.search || '');
        loginUrl.search = `?redirectTo=${encodeURIComponent(redirectTarget)}`;
        return NextResponse.redirect(loginUrl, 302);
      }

      // ── RETIRED MERCHANT DESK ROUTE: Compatibility redirect to canonical Dashboard ──
      if (segments[1] === 'desk') {
        const url = req.nextUrl.clone();
        url.pathname = `/${tenantSlug}/dashboard`;
        return NextResponse.redirect(url, 302);
      }

      const url = req.nextUrl.clone();
      if (segments.length === 1) {
        // e.g. /buzzerukm -> /buzzerukm/dashboard
        url.pathname = `/${tenantSlug}/dashboard`;
      } else if (segments[1] === 'dashboard') {
        // e.g. /buzzerukm/dashboard atau /buzzerukm/dashboard/settings -> pertahankan
        url.pathname = `/${segments.join('/')}`;
      } else {
        // e.g. /buzzerukm/settings -> /buzzerukm/dashboard/settings
        // e.g. /buzzerukm/orders/123 -> /buzzerukm/dashboard/orders/123
        const subPath = segments.slice(1).join('/');
        url.pathname = `/${tenantSlug}/dashboard/${subPath}`;
      }
      return NextResponse.rewrite(url);
    }

    return NextResponse.next();
  }

  const isCreatorHost =
    hostClean === 'creator.boontrack.com' ||
    hostClean.startsWith('creator.') ||
    subdomain === 'creator';

  // ===========================================================================
  // 1. CANONICAL ENFORCEMENT: SEMUA ROUTE /@handle WAJIB KE creator.boontrack.com
  // ===========================================================================
  if (pathname.startsWith('/@')) {
    const handle = pathname.replace(/^\/@+/, '').trim();
    if (handle) {
      const platformRef = req.nextUrl.searchParams.get('ref') || req.nextUrl.searchParams.get('aff') || handle;
      const resellerCode = req.nextUrl.searchParams.get('r');
      // Jika hostname BUKAN creator.boontrack.com (misal shop.boontrack.com atau boontrack.com)
      // -> Lakukan 301 Canonical Redirect ke https://creator.boontrack.com/@${handle}
      if (!isCreatorHost) {
        const targetUrl = new URL(`https://creator.boontrack.com/@${handle}`, req.url);
        targetUrl.search = req.nextUrl.search;
        const res = NextResponse.redirect(targetUrl, 301);
        if (platformRef) {
          setReferralCookies(res, platformRef.trim().toLowerCase(), hostClean);
        }
        if (resellerCode) {
          setResellerCookie(res, resellerCode.trim().toLowerCase(), hostClean);
        }
        return res;
      }

      // Jika hostname SUDAH creator.boontrack.com -> rewrite ke /creator/${handle}
      const url = req.nextUrl.clone();
      url.pathname = `/creator/${handle}`;
      const res = NextResponse.rewrite(url);
      if (platformRef) {
        setReferralCookies(res, platformRef.trim().toLowerCase(), hostClean);
      }
      if (resellerCode) {
        setResellerCookie(res, resellerCode.trim().toLowerCase(), hostClean);
      }
      return res;
    }
  }

  // ===========================================================================
  // SUBDOMAIN CREATOR (creator.boontrack.com) - ARSITEKTUR TERISOLASI
  // ===========================================================================
  if (isCreatorHost) {
    // 1. Host-Aware 301 Legacy Redirect: /ugc-studio dialihkan ke studio.boontrack.com
    if (
      pathname === '/ugc-studio' ||
      pathname.startsWith('/ugc-studio/') ||
      pathname === '/creator/ugc-studio' ||
      pathname.startsWith('/creator/ugc-studio/')
    ) {
      const redirectPath = pathname.startsWith('/creator/ugc-studio')
        ? pathname.replace(/^\/creator/, '')
        : pathname;
      const targetUrl = new URL(`https://studio.boontrack.com${redirectPath}`);
      targetUrl.search = req.nextUrl.search;
      return NextResponse.redirect(targetUrl, 301);
    }

    // 2. Legacy /dashboard redirect 301 ke /admin
    if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
      const adminUrl = req.nextUrl.clone();
      adminUrl.pathname = '/admin';
      return NextResponse.redirect(adminUrl, 301);
    }

    const url = req.nextUrl.clone();

    // 3. Root landing page -> /creator
    if (pathname === '/' || pathname === '') {
      url.pathname = '/creator';
      const res = NextResponse.rewrite(url);
      const platformRef = req.nextUrl.searchParams.get('ref') || req.nextUrl.searchParams.get('aff');
      const resellerCode = req.nextUrl.searchParams.get('r');
      if (platformRef) {
        setReferralCookies(res, platformRef.trim().toLowerCase(), hostClean);
      }
      if (resellerCode) {
        setResellerCookie(res, resellerCode.trim().toLowerCase(), hostClean);
      }
      return res;
    }

    // 4. Creator Admin Workspace -> /creator/admin
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      const adminSubpath = pathname === '/admin' ? '' : pathname.replace(/^\/admin/, '');
      url.pathname = `/creator/admin${adminSubpath}`;
      return NextResponse.rewrite(url);
    }

    // 5. Creator Dedicated Registration -> /creator/register
    if (pathname === '/register' || pathname.startsWith('/register/')) {
      const regSubpath = pathname === '/register' ? '' : pathname.replace(/^\/register/, '');
      url.pathname = `/creator/register${regSubpath}`;
      return NextResponse.rewrite(url);
    }

    // 6. Direct /creator/* pass-through if already rewritten
    if (
      pathname.startsWith('/creator/admin') ||
      pathname.startsWith('/creator/register')
    ) {
      return NextResponse.next();
    }

    // 7. Dynamic handle routing: /@handle atau /[slug] -> /creator/[slug]
    const relativePath = pathname.startsWith('/creator/')
      ? pathname.slice('/creator/'.length)
      : pathname.replace(/^\/+/, '');
    const cleanSlug = relativePath.replace(/^@+/, '').trim();
    const platformRef = req.nextUrl.searchParams.get('ref') || req.nextUrl.searchParams.get('aff');
    const refCode = platformRef || cleanSlug;
    const resellerCode = req.nextUrl.searchParams.get('r');

    if (cleanSlug) {
      url.pathname = `/creator/${cleanSlug}`;
      const res = NextResponse.rewrite(url);
      if (refCode) {
        setReferralCookies(res, refCode.trim().toLowerCase(), hostClean);
      }
      if (resellerCode) {
        setResellerCookie(res, resellerCode.trim().toLowerCase(), hostClean);
      }
      return res;
    }

    url.pathname = `/creator${pathname}`;
    const res = NextResponse.rewrite(url);
    if (platformRef) {
      setReferralCookies(res, platformRef.trim().toLowerCase(), hostClean);
    }
    if (resellerCode) {
      setResellerCookie(res, resellerCode.trim().toLowerCase(), hostClean);
    }
    return res;
  }

  // ===========================================================================
  // SUBDOMAIN STUDIO (studio.boontrack.com) - ARSITEKTUR TERISOLASI (P0)
  // ===========================================================================
  if (isStudioHost) {
    const url = req.nextUrl.clone();

    // Deteksi sesi login aktif Studio / Merchant (Host-only Studio session or signed merchant token)
    const hasStudioAuth = Boolean(
      req.cookies.get('__Host-bt_studio_session')?.value ||
      req.cookies.get('bt_studio_session')?.value ||
      (await hasValidTenantSession(req))
    );

    // 1. Root / ->
    //    - Jika pengguna sudah login: redirect ke /desk (Workspace Dashboard)
    //    - Jika publik / guest: rewrite ke /studio (Landing Page Penawaran resmi)
    if (pathname === '/' || pathname === '') {
      if (hasStudioAuth) {
        url.pathname = '/desk';
        return NextResponse.redirect(url);
      }
      url.pathname = '/studio';
      return NextResponse.rewrite(url);
    }

    // 1b. Akses langsung /studio ->
    //    - Jika pengguna sudah login: redirect ke /desk
    //    - Jika publik / guest: pass-through ke Landing Page Penawaran
    if (pathname === '/studio') {
      if (hasStudioAuth) {
        url.pathname = '/desk';
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    }

    // 2. /desk -> rewrite ke /studio/desk (Wajib Sesi Login Aktif)
    if (pathname === '/desk' || pathname.startsWith('/desk/')) {
      if (!hasStudioAuth) {
        url.pathname = '/login';
        url.search = `?redirectTo=${encodeURIComponent(pathname + (req.nextUrl.search || ''))}`;
        return NextResponse.redirect(url, 302);
      }
      const deskSubpath = pathname === '/desk' ? '' : pathname.replace(/^\/desk/, '');
      url.pathname = `/studio/desk${deskSubpath}`;
      return NextResponse.rewrite(url);
    }

    // 3. /register -> rewrite ke /studio/register
    if (pathname === '/register' || pathname.startsWith('/register/')) {
      const regSubpath = pathname === '/register' ? '' : pathname.replace(/^\/register/, '');
      url.pathname = `/studio/register${regSubpath}`;
      return NextResponse.rewrite(url);
    }

    // 3b. /login -> rewrite ke /login (Merchant / Studio Login Gateway)
    if (pathname === '/login' || pathname.startsWith('/login/')) {
      return NextResponse.rewrite(url);
    }

    // 4. /ugc-studio -> rewrite ke /studio/ugc-studio
    if (pathname === '/ugc-studio' || pathname.startsWith('/ugc-studio/')) {
      url.pathname = `/studio${pathname}`;
      return NextResponse.rewrite(url);
    }

    // 4b. /fcd-automator -> rewrite ke /studio/fcd-automator
    if (pathname === '/fcd-automator' || pathname.startsWith('/fcd-automator/')) {
      url.pathname = `/studio${pathname}`;
      return NextResponse.rewrite(url);
    }

    // 5. Jika sudah berada di path /studio/... -> pass-through
    if (pathname.startsWith('/studio')) {
      return NextResponse.next();
    }

    // 6. Sub-path /[path] -> rewrite ke /studio/[path]
    url.pathname = `/studio${pathname}`;
    return NextResponse.rewrite(url);
  }

  // 2. KHUSUS /admin: JANGAN PERNAH DI-REWRITE KE CAREER/KV
  if (pathname.startsWith('/admin')) {
    const res = NextResponse.next();
    applySensitiveCacheHeaders(res);
    return res;
  }

  // ===========================================================================
  // SUBDOMAIN: affiliate.boontrack.com
  // ===========================================================================
  if (subdomain === 'affiliate') {
    const url = req.nextUrl.clone();
    if (pathname === '/') {
      url.pathname = '/affiliate';
      return NextResponse.rewrite(url);
    }
    if (!pathname.startsWith('/affiliate')) {
      url.pathname = `/affiliate${pathname}`;
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  // ===========================================================================
  // KHUSUS SUBDOMAIN BUZZERUKM (buzzerukm.boontrack.com) - EKSKLUSIF KANG SAKTI
  // Redirect 307 ke shop.boontrack.com dengan atribusi referral 30 hari.
  // Affiliate umum/reguler menggunakan link kanonikal: https://shop.boontrack.com/?ref=[kode]
  // ===========================================================================
  const isBuzzerUkmHost =
    hostClean === 'buzzerukm.boontrack.com' ||
    hostClean.startsWith('buzzerukm.') ||
    subdomain === 'buzzerukm';

  if (isBuzzerUkmHost) {
    const isProductionBoonTrack = hostClean.endsWith('.boontrack.com') || hostClean === 'boontrack.com';
    const shopBaseUrl = isProductionBoonTrack
      ? 'https://shop.boontrack.com'
      : `${req.nextUrl.protocol}//${req.nextUrl.host.replace(/^[^.]+\./, '')}`;

    // 1. Root frontpage (/) -> Redirect ke https://shop.boontrack.com/?ref=buzzerukm (Redirect 307)
    if (pathname === '/' || pathname === '') {
      const targetUrl = new URL(`${shopBaseUrl}/`);
      targetUrl.searchParams.set('ref', 'buzzerukm');
      req.nextUrl.searchParams.forEach((val, key) => {
        if (key !== 'ref') targetUrl.searchParams.set(key, val);
      });
      const res = NextResponse.redirect(targetUrl, 307);
      setReferralCookies(res, 'buzzerukm', hostClean);
      return res;
    }

    // 2. Akses eksplisit form registrasi (/register) -> Redirect ke https://shop.boontrack.com/register?ref=buzzerukm
    if (pathname === '/register' || pathname.startsWith('/register/')) {
      const targetUrl = new URL(`${shopBaseUrl}/register`);
      targetUrl.searchParams.set('ref', 'buzzerukm');
      req.nextUrl.searchParams.forEach((val, key) => {
        if (key !== 'ref') targetUrl.searchParams.set(key, val);
      });
      const res = NextResponse.redirect(targetUrl, 307);
      setReferralCookies(res, 'buzzerukm', hostClean);
      return res;
    }

    // 3. /affiliate/register -> Redirect ke https://shop.boontrack.com/affiliate/register?ref=buzzerukm
    if (pathname === '/affiliate/register' || pathname.startsWith('/affiliate/register/')) {
      const targetUrl = new URL(`${shopBaseUrl}/affiliate/register`);
      targetUrl.searchParams.set('ref', 'buzzerukm');
      req.nextUrl.searchParams.forEach((val, key) => {
        if (key !== 'ref') targetUrl.searchParams.set(key, val);
      });
      const res = NextResponse.redirect(targetUrl, 307);
      setReferralCookies(res, 'buzzerukm', hostClean);
      return res;
    }

    // 4. /affiliate/dashboard -> Redirect ke https://shop.boontrack.com/affiliate/dashboard?code=buzzerukm
    if (
      pathname === '/affiliate' ||
      pathname === '/affiliate/' ||
      pathname === '/affiliate/dashboard' ||
      pathname.startsWith('/affiliate/dashboard/')
    ) {
      const targetUrl = new URL(`${shopBaseUrl}/affiliate/dashboard`);
      targetUrl.searchParams.set('code', 'buzzerukm');
      req.nextUrl.searchParams.forEach((val, key) => {
        if (key !== 'code') targetUrl.searchParams.set(key, val);
      });
      const res = NextResponse.redirect(targetUrl, 307);
      setReferralCookies(res, 'buzzerukm', hostClean);
      return res;
    }

    // 5. /affiliate root -> Redirect ke https://shop.boontrack.com/affiliate?code=buzzerukm
    if (pathname === '/affiliate' || pathname === '/affiliate/') {
      const targetUrl = new URL(`${shopBaseUrl}/affiliate`);
      targetUrl.searchParams.set('code', 'buzzerukm');
      req.nextUrl.searchParams.forEach((val, key) => {
        if (key !== 'code') targetUrl.searchParams.set(key, val);
      });
      const res = NextResponse.redirect(targetUrl, 307);
      setReferralCookies(res, 'buzzerukm', hostClean);
      return res;
    }

    // 6. Path umum lainnya pada subdomain buzzerukm -> Redirect ke https://shop.boontrack.com${pathname}?ref=buzzerukm
    const targetUrl = new URL(`${shopBaseUrl}${pathname}`);
    targetUrl.searchParams.set('ref', 'buzzerukm');
    req.nextUrl.searchParams.forEach((val, key) => {
      if (key !== 'ref') targetUrl.searchParams.set(key, val);
    });
    const res = NextResponse.redirect(targetUrl, 307);
    setReferralCookies(res, 'buzzerukm', hostClean);
    return res;
  }

  // ===========================================================================
  // SUBDOMAIN: shop.boontrack.com (CORE STOREFRONT & MERCHANDISE ENGINE)
  // ARCHITECTURE.md § 63: shop.boontrack.com adalah rumah kanonikal storefront pembeli.
  // Terisolasi penuh: JANGAN PERNAH dialihkan ke root boontrack.com atau custom domain lookup.
  // ===========================================================================
  const isShopHost =
    hostClean === 'shop.boontrack.com' ||
    hostClean.startsWith('shop.') ||
    subdomain === 'shop';

  if (isShopHost) {
    const shopDashboardMatch = pathname.match(/^\/([^/]+)\/dashboard(?:\/(.*))?$/);
    const shopDeskMatch = pathname.match(/^\/([^/]+)\/desk(?:\/(.*))?$/);
    const isShopGenericDashboard = pathname === '/dashboard' || pathname.startsWith('/dashboard/');

    // 1. Redirect operator desk ke dashboard domain
    if (shopDeskMatch) {
      const targetSlug = shopDeskMatch[1];
      const subPath = shopDeskMatch[2] ? `/${shopDeskMatch[2]}` : '';
      const isProd = hostClean.endsWith('.boontrack.com') || hostClean === 'boontrack.com';
      const dashboardBase = isProd
        ? 'https://dashboard.boontrack.com'
        : `${req.nextUrl.protocol}//dashboard.${hostClean.replace(/^shop\./, '')}${req.nextUrl.port ? `:${req.nextUrl.port}` : ''}`;

      const targetUrl = new URL(`${dashboardBase}/${targetSlug}/dashboard${subPath}`);
      req.nextUrl.searchParams.forEach((val, key) => {
        targetUrl.searchParams.set(key, val);
      });
      return NextResponse.redirect(targetUrl, 302);
    }

    // 2. Redirect dashboard merchant ke dashboard domain (ADR § 63)
    if (shopDashboardMatch) {
      const targetSlug = shopDashboardMatch[1];
      const subPath = shopDashboardMatch[2] ? `/${shopDashboardMatch[2]}` : '';
      const isProd = hostClean.endsWith('.boontrack.com') || hostClean === 'boontrack.com';
      const dashboardBase = isProd
        ? 'https://dashboard.boontrack.com'
        : `${req.nextUrl.protocol}//dashboard.${hostClean.replace(/^shop\./, '')}${req.nextUrl.port ? `:${req.nextUrl.port}` : ''}`;

      const targetUrl = new URL(`${dashboardBase}/${targetSlug}${subPath}`);
      req.nextUrl.searchParams.forEach((val, key) => {
        targetUrl.searchParams.set(key, val);
      });
      return NextResponse.redirect(targetUrl, 302);
    }

    // 3. Redirect generic /dashboard ke /login pada dashboard domain
    if (isShopGenericDashboard) {
      const isProd = hostClean.endsWith('.boontrack.com') || hostClean === 'boontrack.com';
      const dashboardBase = isProd
        ? 'https://dashboard.boontrack.com'
        : `${req.nextUrl.protocol}//dashboard.${hostClean.replace(/^shop\./, '')}${req.nextUrl.port ? `:${req.nextUrl.port}` : ''}`;

      const targetUrl = new URL(`${dashboardBase}/login`);
      req.nextUrl.searchParams.forEach((val, key) => {
        targetUrl.searchParams.set(key, val);
      });
      return NextResponse.redirect(targetUrl, 302);
    }

    // 4. Extract query referral separately (ref / aff vs r)
    const platformRef = (req.nextUrl.searchParams.get('ref') || req.nextUrl.searchParams.get('aff') || '').trim().toLowerCase();
    const resellerParam = (req.nextUrl.searchParams.get('r') || '').trim().toLowerCase();

    // 5. Root storefront & SaaS lander (/) -> Pass-through alami ke app/page.tsx dengan referral cookies
    if (pathname === '/' || pathname === '') {
      const res = NextResponse.next();
      if (platformRef) {
        setReferralCookies(res, platformRef, hostClean);
      }
      if (resellerParam) {
        setResellerCookie(res, resellerParam, hostClean);
      }
      return res;
    }

    // 6. Universal pass-through routes pada domain shop (auth, checkout, register, affiliate, legal, dll.)
    const SHOP_SYSTEM_ROUTES = new Set([
      'app', 'register', 'affiliate', 'manager', 'pricing', 'checkout',
      'login', 'auth', 'daftar', 'onboarding', 'pilot-onboarding', 'enterprise',
      'terms', 'privacy', 'privacy-policy', 'data-deletion', 'acceptable-use',
      'refund', 'store-original'
    ]);

    const segments = pathname.split('/').filter(Boolean);
    const firstSegment = segments[0]?.toLowerCase().trim();

    if (firstSegment && SHOP_SYSTEM_ROUTES.has(firstSegment)) {
      const res = NextResponse.next();
      if (platformRef) {
        setReferralCookies(res, platformRef, hostClean);
      }
      if (resellerParam) {
        setResellerCookie(res, resellerParam, hostClean);
      }
      const isSensitive =
        pathname.startsWith('/checkout') ||
        pathname.startsWith('/login') ||
        pathname.startsWith('/auth') ||
        pathname.startsWith('/register') ||
        pathname.startsWith('/daftar');
      if (isSensitive) {
        applySensitiveCacheHeaders(res);
      }
      return res;
    }

    // 7. Tenant Storefront Routes (/[tenantSlug], /[tenantSlug]/p/..., /[tenantSlug]/pay/..., dll.)
    const tenantSlug = firstSegment;
    if (tenantSlug) {
      const resolution = await resolveTenantStorefront(tenantSlug);
      if (!resolution.isEligible || !resolution.tenantId) {
        // Unknown, inactive, non-commerce, or unconfigured tenant: Fail closed with /404-store-not-found rewrite
        const url = req.nextUrl.clone();
        url.pathname = '/404-store-not-found';
        return NextResponse.rewrite(url);
      }

      const requestHeaders = new Headers(req.headers);
      requestHeaders.set('x-tenant-slug', tenantSlug);
      requestHeaders.set('x-tenant-id', resolution.tenantId);

      const res = NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });

      applyStorefrontCacheHeaders(res, tenantSlug, resolution.tenantId);
      if (platformRef) {
        setReferralCookies(res, platformRef, hostClean);
      }
      if (resellerParam) {
        setResellerCookie(res, resellerParam, hostClean);
      }
      return res;
    }

    const res = NextResponse.next();
    if (platformRef) {
      setReferralCookies(res, platformRef, hostClean);
    }
    if (resellerParam) {
      setResellerCookie(res, resellerParam, hostClean);
    }
    return res;
  }

  // === AUTH GUARD: RUTE DASHBOARD TENANT (/:tenant/dashboard) ===
  const dashboardMatch = pathname.match(/^\/([^/]+)\/dashboard(?:\/.*)?$/);
  const isGenericDashboard = pathname === '/dashboard' || pathname.startsWith('/dashboard/');

  if (dashboardMatch || isGenericDashboard) {
    const targetSlug = dashboardMatch ? dashboardMatch[1] : undefined;
    if (!(await hasValidTenantSession(req, targetSlug))) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = '/login';
      const redirectTarget = pathname + (req.nextUrl.search || '');
      loginUrl.search = `?redirectTo=${encodeURIComponent(redirectTarget)}`;
      return NextResponse.redirect(loginUrl, 302);
    }
  }

  // ── 0c. ROOT / APEX DOMAIN REDIRECT TO OPERATIONAL SUBDOMAIN (301 Permanent Redirect) ──
  const rootRedirectTarget = ROOT_DOMAIN_REDIRECTS[hostClean];
  if (rootRedirectTarget) {
    const targetUrl = new URL(`${rootRedirectTarget}${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(targetUrl, 301);
  }

  // ── 1. CUSTOM DOMAIN LOOKUP & REWRITE ──
  if (!isSystemOrBoonTrackHost(hostClean) && hostClean.length > 0) {
    const { slug, tenantId } = await lookupTenantByDomain(hostClean);

    if (slug) {
      const url = req.nextUrl.clone();
      const cleanPath = pathname.startsWith(`/${slug}`)
        ? pathname
        : `/${slug}${pathname === '/' ? '' : pathname}`;
      url.pathname = cleanPath;
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set('x-tenant-slug', slug);
      if (tenantId) requestHeaders.set('x-tenant-id', tenantId);
      const res = NextResponse.rewrite(url, {
        request: {
          headers: requestHeaders,
        },
      });
      applyStorefrontCacheHeaders(res, slug, tenantId);
      return res;
    } else {
      const url = req.nextUrl.clone();
      url.pathname = '/404-store-not-found';
      return NextResponse.rewrite(url);
    }
  }

  // ── 2. Universal pass-through: Auth/Checkout, Manager, Pricing, Legal & Vertical Apps ──
  if (
    pathname === '/app' ||
    pathname.startsWith('/app/') ||
    pathname === '/register' ||
    pathname.startsWith('/register/') ||
    pathname === '/affiliate' ||
    pathname.startsWith('/affiliate/') ||
    pathname === '/manager' ||
    pathname.startsWith('/manager/') ||
    pathname === '/pricing' ||
    pathname.startsWith('/pricing/') ||
    pathname === '/checkout' ||
    pathname.startsWith('/checkout/') ||
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/auth' ||
    pathname.startsWith('/auth/') ||
    pathname === '/daftar' ||
    pathname.startsWith('/daftar/') ||
    pathname === '/onboarding' ||
    pathname.startsWith('/onboarding/') ||
    pathname === '/pilot-onboarding' ||
    pathname.startsWith('/pilot-onboarding/') ||
    pathname === '/enterprise' ||
    pathname.startsWith('/enterprise/') ||
    pathname === '/terms' ||
    pathname.startsWith('/terms/') ||
    pathname === '/privacy' ||
    pathname.startsWith('/privacy/') ||
    pathname === '/privacy-policy' ||
    pathname.startsWith('/privacy-policy') ||
    pathname === '/data-deletion' ||
    pathname.startsWith('/data-deletion') ||
    pathname === '/acceptable-use' ||
    pathname.startsWith('/acceptable-use/') ||
    pathname === '/refund' ||
    pathname.startsWith('/refund/') ||
    pathname === '/store-original' ||
    pathname.startsWith('/store-original/') ||
    pathname.startsWith('/app-portal') ||
    pathname.startsWith('/gym') ||
    pathname.startsWith('/pos') ||
    pathname.startsWith('/hotel') ||
    pathname.startsWith('/clinic')
  ) {
    const platformRef = (req.nextUrl.searchParams.get('ref') || req.nextUrl.searchParams.get('aff') || '').trim().toLowerCase();
    const resellerParam = (req.nextUrl.searchParams.get('r') || '').trim().toLowerCase();
    const res = NextResponse.next();
    if (platformRef) {
      setReferralCookies(res, platformRef, hostClean);
    }
    if (resellerParam) {
      setResellerCookie(res, resellerParam, hostClean);
    }
    const isSensitive =
      pathname.startsWith('/checkout') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/manager') ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/auth') ||
      pathname.startsWith('/register') ||
      pathname.startsWith('/daftar');
    if (isSensitive) {
      applySensitiveCacheHeaders(res);
    }
    return res;
  }

  // ── 2b. /admin always resolves to Super Admin Panel ──
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const res = NextResponse.next();
    applySensitiveCacheHeaders(res);
    return res;
  }

  // ── 3. KHUSUS APP.BOONTRACK.COM (Retired Legacy Hub -> Method-Aware Gateway) ──
  if (hostClean === 'app.boontrack.com' || hostClean === 'app.localhost') {
    const origin = req.headers.get('origin');
    const isAuthorizedOrigin = origin && (
      origin.endsWith('.boontrack.com') ||
      origin === 'https://boontrack.com' ||
      origin === 'https://order.shabuajhi.com' ||
      origin.includes('littlebitefeeding.com') ||
      (process.env.NODE_ENV !== 'production' && origin.includes('localhost:'))
    );

    // 3a. CORS Preflight: Strict origin validation and credential policy
    if (req.method === 'OPTIONS') {
      if (!isAuthorizedOrigin) {
        return new NextResponse(JSON.stringify({ error: 'CORS_ORIGIN_DENIED' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Vary': 'Origin' },
        });
      }
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin!,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Tenant-Slug, X-Partner-Id, Idempotency-Key',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin',
        },
      });
    }

    // 3b. Static Assets: Local chunk delivery and branding rewrite
    if (pathname.startsWith('/_next') || pathname.startsWith('/static')) {
      return NextResponse.next();
    }
    if (pathname === '/favicon.ico' || pathname === '/icon.png' || pathname === '/apple-touch-icon.png') {
      const url = req.nextUrl.clone();
      url.pathname = '/branding/app/favicon.ico';
      return NextResponse.rewrite(url);
    }

    // 3c. Commerce / Checkout: Redirect GET to Shop, reject non-GET mutations
    if (pathname === '/checkout' || pathname.startsWith('/checkout/') || pathname.includes('/checkout')) {
      if (req.method === 'GET' || req.method === 'HEAD') {
        const url = req.nextUrl.clone();
        url.protocol = 'https:';
        url.host = 'shop.boontrack.com';
        url.port = '';
        return NextResponse.redirect(url, 301);
      }
      return NextResponse.json(
        { error: 'COMMERCE_NOT_PERMITTED', message: 'Checkout is disabled on app.boontrack.com. Use shop.boontrack.com.' },
        { status: 410 }
      );
    }

    // 3d. API Routing: Verified GET mappings redirect; all non-GET and unmapped APIs return 410
    if (pathname.startsWith('/api/')) {
      if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/api/v1/tenant/me') {
        const url = req.nextUrl.clone();
        url.protocol = 'https:';
        url.host = 'dashboard.boontrack.com';
        url.port = '';
        return NextResponse.redirect(url, 301);
      }
      return NextResponse.json(
        { error: 'API_RETIRED', message: 'app.boontrack.com APIs are retired. Use api.boontrack.com or dashboard.boontrack.com.' },
        { status: 410 }
      );
    }

    // 3e. Authentication Callbacks: 307 Temporary Redirect (prevents caching OAuth code)
    if (pathname.startsWith('/auth/callback') || pathname.startsWith('/login/oauth')) {
      const url = req.nextUrl.clone();
      url.protocol = 'https:';
      url.host = 'dashboard.boontrack.com';
      url.port = '';
      return NextResponse.redirect(url, 307);
    }

    // 3f-1. Root Portal: Render B2B Enterprise & Vertical Solutions Landing Page
    if (pathname === '/' || pathname === '') {
      const url = req.nextUrl.clone();
      url.pathname = '/app-portal';
      return NextResponse.rewrite(url);
    }

    // 3f. Standard Browser Navigation, Legacy Portal & Unknown Paths -> 301 to Dashboard
    const url = req.nextUrl.clone();
    url.protocol = 'https:';
    url.host = 'dashboard.boontrack.com';
    url.pathname = pathname === '/app-portal' || pathname.startsWith('/app-portal/') ? '/' : pathname;
    url.port = '';
    return NextResponse.redirect(url, 301);
  }







  // ── 6. Root domain boontrack.com & www.boontrack.com pass-through ──
  if (
    hostClean === 'localhost' ||
    hostClean === 'boontrack.com' ||
    hostClean === 'www.boontrack.com'
  ) {
    const platformRef = (req.nextUrl.searchParams.get('ref') || req.nextUrl.searchParams.get('aff') || '').trim().toLowerCase();
    const resellerParam = (req.nextUrl.searchParams.get('r') || '').trim().toLowerCase();
    const res = NextResponse.next();
    if (platformRef) {
      setReferralCookies(res, platformRef, hostClean);
    }
    if (resellerParam) {
      setResellerCookie(res, resellerParam, hostClean);
    }
    return res;
  }

  // admin.boontrack.com → pass straight to /admin
  if (hostClean === 'admin.boontrack.com' || hostClean.startsWith('admin.')) {
    const url = req.nextUrl.clone();
    if (pathname === '/' || pathname === '') {
      url.pathname = '/admin';
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  if (!subdomain || subdomain === 'www') {
    return NextResponse.next();
  }

  // ===========================================================================
  // SUBDOMAIN: manager.boontrack.com
  // ===========================================================================
  if (subdomain === 'manager') {
    const url = req.nextUrl.clone();
    if (pathname === '/') {
      url.pathname = '/manager';
      return NextResponse.rewrite(url);
    }
    if (!pathname.startsWith('/manager')) {
      url.pathname = `/manager${pathname}`;
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  // ===========================================================================
  // SPECIAL DOMAIN: login.boontrack.com, shop.boontrack.com, creator.boontrack.com
  // ===========================================================================
  if (subdomain === 'login') {
    const url = req.nextUrl.clone();
    if (pathname === '/') {
      url.pathname = '/login';
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }



  // ===========================================================================
  // SPECIAL DOMAIN: bossob.boontrack.com
  // ===========================================================================
  if (subdomain === 'bossob') {
    if (pathname.startsWith('/api') || pathname.startsWith('/admin')) {
      return NextResponse.next();
    }
    const url = req.nextUrl.clone();

    if (pathname === '/career/bossob' || pathname === '/career/bossob/') {
      url.pathname = '/';
      return NextResponse.redirect(url, 307);
    }
    if (pathname.startsWith('/career/bossob/')) {
      url.pathname = pathname.replace('/career/bossob', '') || '/';
      return NextResponse.redirect(url, 307);
    }

    if (pathname === '/') {
      url.pathname = '/career/bossob';
      return NextResponse.rewrite(url);
    }

    url.pathname = `/career/bossob${pathname}`;
    return NextResponse.rewrite(url);
  }

  // ===========================================================================
  // SPECIAL DOMAIN: chat.boontrack.com
  // ===========================================================================
  if (subdomain === 'chat') {
    const url = req.nextUrl.clone();

    if (pathname.startsWith('/boontrack-')) {
      return NextResponse.next();
    }

    if (pathname === '/') {
      url.pathname = '/admin';
      return NextResponse.rewrite(url);
    }

    return NextResponse.next();
  }

  // ===========================================================================
  // 4. Explicit B2B Tenant Slugs
  // ===========================================================================
  if (B2B_TENANT_SLUGS.has(subdomain)) {
    const url = req.nextUrl.clone();

    if (pathname === `/${subdomain}` || pathname === `/${subdomain}/`) {
      url.pathname = '/';
      return NextResponse.redirect(url, 307);
    }
    if (pathname === `/${subdomain}/dashboard`) {
      url.pathname = '/dashboard';
      return NextResponse.redirect(url, 307);
    }
    if (pathname.startsWith(`/${subdomain}/`)) {
      url.pathname = pathname.replace(`/${subdomain}`, '') || '/';
      return NextResponse.redirect(url, 307);
    }

    if (pathname === '/') {
      url.pathname = `/${subdomain}`;
      return NextResponse.rewrite(url);
    }

    if (pathname === '/dashboard' || pathname === '/inbox' || pathname === '/chat') {
      url.pathname = `/${subdomain}/dashboard`;
      return NextResponse.rewrite(url);
    }

    url.pathname = `/${subdomain}${pathname}`;
    return NextResponse.rewrite(url);
  }

  // ===========================================================================
  // 5. Career Profile Subdomains
  // ===========================================================================
  if (CAREER_KNOWN_SLUGS.has(subdomain)) {
    const url = req.nextUrl.clone();

    if (pathname === `/career/${subdomain}` || pathname === `/career/${subdomain}/`) {
      url.pathname = '/';
      return NextResponse.redirect(url, 307);
    }
    if (pathname.startsWith(`/career/${subdomain}/`)) {
      url.pathname = pathname.replace(`/career/${subdomain}`, '') || '/';
      return NextResponse.redirect(url, 307);
    }

    if (pathname === '/') {
      url.pathname = `/career/${subdomain}`;
      return NextResponse.rewrite(url);
    }

    url.pathname = `/career/${subdomain}${pathname}`;
    return NextResponse.rewrite(url);
  }

  // ===========================================================================
  // 6. Dynamic B2B Tenant Fallback (Hardened Phase 3B)
  // Authoritative dynamic validation: unknown or ineligible subdomains fail closed.
  // ===========================================================================
  {
    // Safeguard: Jangan rewrite subdomain cadangan sistem
    const RESERVED_SUBDOMAINS = new Set([
      'login', 'register', 'daftar', 'api', 'dashboard', 'desk', 'auth', 'admin',
      'affiliate', 'manager', 'shop', 'creator', 'studio', 'www', 'app', 'career', 'static'
    ]);
    if (RESERVED_SUBDOMAINS.has(subdomain)) {
      return NextResponse.next();
    }

    const resolution = await resolveTenantStorefront(subdomain);
    if (!resolution.isEligible || !resolution.tenantId) {
      // Unknown, inactive, non-commerce, or unconfigured tenant: Fail closed with /404-store-not-found rewrite
      const notFoundUrl = req.nextUrl.clone();
      notFoundUrl.pathname = '/404-store-not-found';
      return NextResponse.rewrite(notFoundUrl);
    }

    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-tenant-slug', subdomain);
    requestHeaders.set('x-tenant-id', resolution.tenantId);

    const url = req.nextUrl.clone();

    if (pathname === `/${subdomain}` || pathname === `/${subdomain}/`) {
      url.pathname = '/';
      return NextResponse.redirect(url, 307);
    }
    if (pathname === `/${subdomain}/dashboard`) {
      url.pathname = '/dashboard';
      return NextResponse.redirect(url, 307);
    }
    if (pathname.startsWith(`/${subdomain}/`)) {
      url.pathname = pathname.replace(`/${subdomain}`, '') || '/';
      return NextResponse.redirect(url, 307);
    }

    if (pathname === '/') {
      url.pathname = `/${subdomain}`;
      const res = NextResponse.rewrite(url, {
        request: {
          headers: requestHeaders,
        },
      });
      applyStorefrontCacheHeaders(res, subdomain, resolution.tenantId);
      return res;
    }

    if (pathname === '/dashboard' || pathname === '/inbox' || pathname === '/chat') {
      url.pathname = `/${subdomain}/dashboard`;
      const res = NextResponse.rewrite(url, {
        request: {
          headers: requestHeaders,
        },
      });
      applyStorefrontCacheHeaders(res, subdomain, resolution.tenantId);
      return res;
    }

    url.pathname = `/${subdomain}${pathname}`;
    const res = NextResponse.rewrite(url, {
      request: {
        headers: requestHeaders,
      },
    });
    applyStorefrontCacheHeaders(res, subdomain, resolution.tenantId);
    return res;
  }
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const hostClean = host.split(',')[0].trim().toLowerCase().split(':')[0];

  const res = await handleRouting(req, hostClean);

  // ── ATTACH CROSS-DOMAIN WILDCARD REFERRAL & RESELLER COOKIES (.boontrack.com) ──
  // Invariant (P0 Attribution Separation):
  // 1. Platform affiliate (?ref= / ?aff=) sets ref, boontrack_referral_code, boontrack_merchant_ref.
  // 2. Tenant reseller (?r=) sets bt_reseller_code ONLY and is NEVER copied to platform referral cookies.
  const platformRef = (
    req.nextUrl.searchParams.get('ref') ||
    req.nextUrl.searchParams.get('aff') ||
    ''
  ).trim().toLowerCase();

  const resellerCode = (
    req.nextUrl.searchParams.get('r') ||
    ''
  ).trim().toLowerCase();

  if (
    res &&
    !req.nextUrl.pathname.startsWith('/api') &&
    !req.nextUrl.pathname.startsWith('/_next')
  ) {
    if (platformRef && platformRef !== '1' && platformRef !== 'null') {
      setReferralCookies(res, platformRef, hostClean);
    }
    if (resellerCode && resellerCode !== '1' && resellerCode !== 'null') {
      setResellerCookie(res, resellerCode, hostClean);
    }
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image).*)',
  ],
};