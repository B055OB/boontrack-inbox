import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * ============================================================
 * BoonTrack Multi-Tenant & Custom Domain Middleware
 * ============================================================
 */

// In-Memory Cache untuk Custom Domain Lookup (TTL 5 menit)
interface DomainCacheEntry {
  slug: string | null;
  timestamp: number;
}

const domainCache = new Map<string, DomainCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit

// Known B2B Tenant Slugs (webchat + CS inbox engine)
const B2B_TENANT_SLUGS = new Set([
  'atmosfitnes',
  'nyka', 'nyka-hijab', 'nyka-modest', 'nyka-store',
  'suhu-ads', 'suhu-ads-masterclass', 'suhuads', 'masterclass', 'digital-marketing',
  'bale-pananggeuhan', 'bale',
  'pelayanan-publik', 'pelayanan-publik-dummy', 'indra-public', 'indra', 'kelurahan-indra',
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
async function lookupTenantByDomain(hostname: string): Promise<string | null> {
  const cached = domainCache.get(hostname);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.slug;
  }

  let slug: string | null = null;
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
    }
  } catch (err) {
    console.warn('[middleware] Core backend lookup error:', err);
  }

  // 2. Fallback Supabase REST (Single Source of Truth)
  if (!slug) {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseKey) {
        const supaUrl = `${supabaseUrl}/rest/v1/tenants?select=slug,metadata&metadata->>custom_domain=eq.${encodeURIComponent(hostname)}&limit=1`;
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
          }
        }
      }
    } catch (supaErr) {
      console.warn('[middleware] Supabase fallback lookup error:', supaErr);
    }
  }

  // Simpan ke in-memory cache
  domainCache.set(hostname, { slug, timestamp: now });
  return slug;
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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
 * Helper untuk memeriksa apakah request memiliki sesi login Supabase Auth / Merchant Store aktif
 */
function hasAuthSession(req: NextRequest): boolean {
  const allCookies = req.cookies.getAll();
  return allCookies.some((cookie) => {
    const n = cookie.name.toLowerCase();
    return (
      n.startsWith('sb-') ||
      n.includes('auth-token') ||
      n.includes('access-token') ||
      n === 'merchant_session' ||
      n === 'merchant_store' ||
      n === 'bt_tenant'
    );
  });
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const host = req.headers.get('host') || '';
  const hostClean = host.split(':')[0].toLowerCase().trim();

  // ── ROUTING KHUSUS FAVICON.ICO PER-DOMAIN ──
  // app.boontrack.com diarahkan ke favicon korporat di /app-brand/favicon.ico
  // Domain lainnya (termasuk shop.boontrack.com) memuat default /favicon.ico milik shop
  if (pathname === '/favicon.ico') {
    if (hostClean === 'app.boontrack.com' || hostClean.startsWith('app.')) {
      const url = req.nextUrl.clone();
      url.pathname = '/app-brand/favicon.ico';
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  // 1. BYPASS API & STATIC LANGSUNG TANPA SENTUH SUBDOMAIN/KV REWRITE
  if (
    pathname.startsWith('/api/') ||
    pathname === '/api' ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static') ||
    pathname === '/apple-touch-icon.png' ||
    pathname === '/404-store-not-found' ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 2. KHUSUS /admin: JANGAN PERNAH DI-REWRITE KE CAREER/KV
  if (pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  const subdomain = extractSubdomain(host);

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

  // === AUTH GUARD: RUTE DASHBOARD TENANT (/:tenant/dashboard) ===
  const isDashboardPath =
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    /^\/[^/]+\/dashboard(\/.*)?$/.test(pathname);

  if (isDashboardPath) {
    if (!hasAuthSession(req)) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = '/login';
      const redirectTarget = pathname + (req.nextUrl.search || '');
      loginUrl.search = `?redirectTo=${encodeURIComponent(redirectTarget)}`;
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── 1. CUSTOM DOMAIN LOOKUP & REWRITE ──
  if (!isSystemOrBoonTrackHost(hostClean) && hostClean.length > 0) {
    const slug = await lookupTenantByDomain(hostClean);

    if (slug) {
      const url = req.nextUrl.clone();
      const cleanPath = pathname.startsWith(`/${slug}`)
        ? pathname
        : `/${slug}${pathname === '/' ? '' : pathname}`;
      url.pathname = cleanPath;
      return NextResponse.rewrite(url);
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
    const refParam = req.nextUrl.searchParams.get('ref') || req.nextUrl.searchParams.get('r');
    const res = NextResponse.next();
    if (refParam) {
      setReferralCookies(res, refParam.trim().toLowerCase(), hostClean);
    }
    return res;
  }

  // ── 2b. /admin always resolves to Super Admin Panel ──
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return NextResponse.next();
  }

  // ── 3. KHUSUS APP.BOONTRACK.COM (Isolasi ke /app-portal) ──
  if (hostClean === 'app.boontrack.com' || hostClean.startsWith('app.')) {
    const url = req.nextUrl.clone();
    if (pathname === '/' || pathname === '') {
      url.pathname = '/app-portal';
      return NextResponse.rewrite(url);
    }
    if (!pathname.startsWith('/app-portal')) {
      url.pathname = `/app-portal${pathname}`;
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  // ── 4. KHUSUS CREATOR.BOONTRACK.COM (CREATOR_V1 Profile Rewrite) ──
  if (hostClean === 'creator.boontrack.com' || hostClean.startsWith('creator.')) {
    const url = req.nextUrl.clone();

    // Landing/portal root creator
    if (pathname === '/' || pathname === '') {
      url.pathname = '/creator';
      return NextResponse.rewrite(url);
    }

    // Bypass /ugc-studio agar tidak masuk ke dynamic slug /creator/[slug]
    if (pathname.startsWith('/ugc-studio')) {
      url.pathname = `/creator/ugc-studio`;
      return NextResponse.rewrite(url);
    }

    // Rewrite creator.boontrack.com/[slug] ke /creator/[slug]
    if (!pathname.startsWith('/creator/')) {
      url.pathname = `/creator${pathname}`;
      return NextResponse.rewrite(url);
    }

    return NextResponse.next();
  }

  // ── 5. KHUSUS SHOP.BOONTRACK.COM (100% Pass-Through Alami) ──
  if (hostClean === 'shop.boontrack.com' || hostClean.startsWith('shop.')) {
    const refParam = req.nextUrl.searchParams.get('ref') || req.nextUrl.searchParams.get('r');
    const res = NextResponse.next();
    if (refParam) {
      setReferralCookies(res, refParam.trim().toLowerCase(), hostClean);
    }
    return res;
  }

  // ── 6. Root domain boontrack.com & www.boontrack.com pass-through ──
  if (
    hostClean === 'localhost' ||
    hostClean === 'boontrack.com' ||
    hostClean === 'www.boontrack.com'
  ) {
    const refParam = req.nextUrl.searchParams.get('ref') || req.nextUrl.searchParams.get('r');
    const res = NextResponse.next();
    if (refParam) {
      setReferralCookies(res, refParam.trim().toLowerCase(), hostClean);
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

  if (subdomain === 'shop') {
    return NextResponse.next();
  }

  if (subdomain === 'creator') {
    const url = req.nextUrl.clone();
    // Bypass /ugc-studio agar tidak dianggap sebagai dynamic profile slug
    if (pathname.startsWith('/ugc-studio')) {
      url.pathname = `/creator/ugc-studio`;
      return NextResponse.rewrite(url);
    }
    url.pathname = `/creator${pathname}`;
    return NextResponse.rewrite(url);
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
  // 6. Dynamic B2B Tenant Fallback
  // ===========================================================================
  {
    // Safeguard: Jangan rewrite subdomain cadangan sistem
    const RESERVED_SUBDOMAINS = new Set([
      'login', 'register', 'daftar', 'api', 'dashboard', 'auth', 'admin',
      'affiliate', 'manager', 'shop', 'creator', 'www', 'app', 'career', 'static'
    ]);
    if (RESERVED_SUBDOMAINS.has(subdomain)) {
      return NextResponse.next();
    }

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
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};