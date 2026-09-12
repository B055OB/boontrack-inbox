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
    'https://boontrack-core-production.up.railway.app';

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
  const { pathname } = req.nextUrl;

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


  // ── 0. Universal pass-through: static assets, Next.js internals, API, and custom 404 page ──
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico' ||
    pathname === '/apple-touch-icon.png' ||
    pathname === '/404-store-not-found' ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const host = req.headers.get('host') || '';
  const hostClean = host.split(':')[0].toLowerCase().trim();

  // ── 1. CUSTOM DOMAIN LOOKUP & REWRITE ──
  // Jika request BUKAN dari domain sistem / boontrack (misal: ombudi.com atau toko.ombudi.com)
  if (!isSystemOrBoonTrackHost(hostClean) && hostClean.length > 0) {
    const slug = await lookupTenantByDomain(hostClean);

    if (slug) {
      // Slug ditemukan: rewrite internal ke /${slug}... tanpa mengubah URL di browser pengunjung
      const url = req.nextUrl.clone();
      const cleanPath = pathname.startsWith(`/${slug}`)
        ? pathname
        : `/${slug}${pathname === '/' ? '' : pathname}`;
      url.pathname = cleanPath;
      return NextResponse.rewrite(url);
    } else {
      // Domain tidak ditemukan atau belum terdaftar: rewrite ke /404-store-not-found
      const url = req.nextUrl.clone();
      url.pathname = '/404-store-not-found';
      return NextResponse.rewrite(url);
    }
  }

  // ── 2. Universal pass-through: Auth/Checkout, Manager, Pricing & Vertical Apps ──
  if (
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
    pathname === '/acceptable-use' ||
    pathname.startsWith('/acceptable-use/') ||
    pathname === '/refund' ||
    pathname.startsWith('/refund/') ||
    pathname === '/store-original' ||
    pathname.startsWith('/store-original/') ||
    pathname.startsWith('/gym') ||
    pathname.startsWith('/pos') ||
    pathname.startsWith('/hotel') ||
    pathname.startsWith('/clinic')
  ) {
    return NextResponse.next();
  }

  // ── 2b. /admin always resolves to Super Admin Panel ──
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return NextResponse.next();
  }

  // ── 3. Root / system hostnames & App Hub pass-through ──
  if (
    hostClean === 'localhost' ||
    hostClean === 'boontrack.com' ||
    hostClean === 'www.boontrack.com' ||
    hostClean === 'app.boontrack.com' ||
    hostClean.startsWith('app.')
  ) {
    return NextResponse.next();
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

  const subdomain = extractSubdomain(host);

  if (!subdomain || subdomain === 'www' || subdomain === 'app') {
    return NextResponse.next();
  }

  // ===========================================================================
  // SUBDOMAIN: manager.boontrack.com (Affiliate & Agency Manager Control Plane)
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
  // SUBDOMAIN: affiliate.boontrack.com (Affiliate Marketer Hub & Leaderboard)
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
  // SPECIAL DOMAIN: login.boontrack.com & shop.boontrack.com
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

  // ===========================================================================
  // SPECIAL DOMAIN: bossob.boontrack.com
  // ===========================================================================
  if (subdomain === 'bossob') {
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
    // Safeguard: Do not process system reserved subdomains as dynamic B2B tenants
    const RESERVED_SUBDOMAINS = new Set([
      'login', 'register', 'daftar', 'api', 'dashboard', 'auth', 'admin',
      'affiliate', 'manager', 'shop', 'www', 'app', 'static'
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