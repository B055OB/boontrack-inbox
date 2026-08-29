import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * ============================================================
 * BoonTrack Subdomain Route Dispatcher
 * ============================================================
 *
 * Domain Routing Matrix:
 * ┌───────────────────────────────────┬────────────────────────────────────────────────────────────────┐
 * │ Domain / Path                     │ Renders                                                        │
 * ├───────────────────────────────────┼────────────────────────────────────────────────────────────────┤
 * │ localhost / boontrack.com /       │ root page.tsx → redirect /admin (Super Admin Panel)            │
 * │ localhost/admin                   │ /admin (Super Admin Panel) — always pass-through               │
 * │ bossob.boontrack.com/             │ /career/bossob (Career Profile & ATS Resume Showcase)          │
 * │ bossob.boontrack.com/admin        │ /admin (Super Admin Panel) — pass-through                      │
 * │ chat.boontrack.com/               │ /admin (Live Multi-Tenant Monitoring — Super Admin Panel)      │
 * │ chat.boontrack.com/boontrack-*    │ pass-through (legacy bookmark compat)                          │
 * │ shop.boontrack.com/               │ redirect to /suhu-ads-masterclass (default demo tenant)        │
 * │ shop.boontrack.com/[tenant]       │ /[tenant] (Public Storefront & Webchat)                        │
 * │ shop.boontrack.com/[tenant]/dash  │ /[tenant]/dashboard (Live Inbox & Katalog Merchant)            │
 * │ gym.* / atmosfitnes.*             │ /atmosfitnes (Gym Webchat / Hub)                               │
 * │ [b2b-slug].boontrack.com/         │ /[slug] (B2B Multi-Tenant Webchat Demo Publik)                 │
 * │ [b2b-slug].boontrack.com/dash     │ /[slug]/dashboard (CS Inbox & CMS)                            │
 * │ [career-slug].boontrack.com/      │ /career/[slug] (Jobseeker Career Profile)                      │
 * │ [unknown].boontrack.com/          │ /[slug] (Dynamic B2B Tenant Fallback)                          │
 * └───────────────────────────────────┴────────────────────────────────────────────────────────────────┘
 *
 * NOTE: middleware runs on Edge runtime — cannot import from app/* or lib/*
 */

// ---------------------------------------------------------------------------
// Known B2B Tenant Slugs (webchat + CS inbox engine)
// Keep in sync with KNOWN_TENANTS in app/[tenant]/page.tsx
// ---------------------------------------------------------------------------
const B2B_TENANT_SLUGS = new Set([
  // Gym / Fitness
  'atmosfitnes', 'gym',
  // Retail / Modest Wear
  'nyka', 'nyka-hijab', 'nyka-modest', 'nyka-store',
  // Digital Education
  'suhu-ads', 'suhu-ads-masterclass', 'suhuads', 'masterclass', 'digital-marketing',
  // Food & Beverage
  'bale-pananggeuhan', 'bale',
  // Public Service
  'pelayanan-publik', 'pelayanan-publik-dummy', 'indra-public', 'indra', 'kelurahan-indra',
  // Internal / Demo
  'om-budi', 'om_budi', 'boontrack-demo', 'boontrack-holding', 'holding',
]);

// ---------------------------------------------------------------------------
// Known Career/Jobseeker Profile subdomains (explicit whitelist)
// ---------------------------------------------------------------------------
const CAREER_KNOWN_SLUGS = new Set([
  'cv', 'career', 'resume', 'profile',
  'rayi-gemilang', 'rayi',
  // NOTE: 'bossob' is NOT here — it has special handling (career + admin)
]);

// Default B2B tenant shown when accessing shop.boontrack.com/
const SHOP_DEFAULT_TENANT = 'suhu-ads-masterclass';

/**
 * Extract subdomain from incoming request hostname.
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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── 0. Universal pass-through: static assets, Next.js internals, API ───────
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    pathname === '/pilot-onboarding' ||
    pathname.startsWith('/pilot-onboarding/') ||
    pathname === '/enterprise' ||
    pathname.startsWith('/enterprise/') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // ── 0b. /admin always resolves to Super Admin Panel, no subdomain override ──
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return NextResponse.next();
  }

  const host = req.headers.get('host') || '';
  const hostClean = host.split(':')[0].toLowerCase().trim();

  // ── 1. Root / system hostnames: standard Next.js routing ────────────────────
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
  // SPECIAL DOMAIN: bossob.boontrack.com
  // / → Career AI Showcase (resume ATS bossob)
  // /admin → Super Admin Panel (pass-through)
  // ===========================================================================
  if (subdomain === 'bossob') {
    // /admin already handled globally above (step 0b), but be explicit here too
    const url = req.nextUrl.clone();

    // Strip internal /career/bossob prefix (clean URL)
    if (pathname === '/career/bossob' || pathname === '/career/bossob/') {
      url.pathname = '/';
      return NextResponse.redirect(url, 307);
    }
    if (pathname.startsWith('/career/bossob/')) {
      url.pathname = pathname.replace('/career/bossob', '') || '/';
      return NextResponse.redirect(url, 307);
    }

    // Root → Career Profile
    if (pathname === '/') {
      url.pathname = '/career/bossob';
      return NextResponse.rewrite(url);
    }

    // Subpaths (e.g. /portfolio, /resume) → /career/bossob/[subpath]
    url.pathname = `/career/bossob${pathname}`;
    return NextResponse.rewrite(url);
  }

  // ===========================================================================
  // SPECIAL DOMAIN: chat.boontrack.com
  // / → Super Admin Live Monitoring Dashboard (/admin)
  // /boontrack-* → legacy bookmark compat — pass-through
  // ===========================================================================
  if (subdomain === 'chat') {
    const url = req.nextUrl.clone();

    // Legacy bookmark compat: /boontrack-career, /boontrack-demo, etc.
    if (pathname.startsWith('/boontrack-')) {
      return NextResponse.next();
    }

    // Root → Redirect to Super Admin live monitoring view
    if (pathname === '/') {
      url.pathname = '/admin';
      return NextResponse.rewrite(url);
    }

    // /[tenant] → public webchat for that tenant
    // /[tenant]/dashboard → CS inbox for that tenant
    // These are accessed as chat.boontrack.com/suhu-ads-masterclass/dashboard
    // We let them fall through to Next.js dynamic routing naturally
    return NextResponse.next();
  }

  // ===========================================================================
  // SPECIAL DOMAIN: shop.boontrack.com
  // / → redirect to default B2B demo tenant storefront
  // /[tenant] → public storefront & webchat for that tenant
  // /[tenant]/dashboard → CS inbox & katalog for that merchant
  // ===========================================================================
  if (subdomain === 'shop') {
    const url = req.nextUrl.clone();

    // Root → redirect to default demo tenant
    if (pathname === '/' || pathname === '') {
      url.pathname = `/${SHOP_DEFAULT_TENANT}`;
      return NextResponse.rewrite(url);
    }

    // Strip /shop prefix if accidentally included
    if (pathname === '/shop' || pathname === '/shop/') {
      url.pathname = `/${SHOP_DEFAULT_TENANT}`;
      return NextResponse.rewrite(url);
    }

    // Paths like /suhu-ads-masterclass and /suhu-ads-masterclass/dashboard
    // are handled naturally by Next.js dynamic routing — just pass through
    return NextResponse.next();
  }

  // ===========================================================================
  // 2. Gym Subdomain (gym.* or atmosfitnes.*)
  // ===========================================================================
  if (subdomain === 'gym' || subdomain === 'atmosfitnes') {
    const url = req.nextUrl.clone();

    // Clean URL: strip internal /atmosfitnes prefix
    if (pathname === '/atmosfitnes' || pathname === '/atmosfitnes/') {
      url.pathname = '/';
      return NextResponse.redirect(url, 307);
    }
    if (pathname === '/atmosfitnes/dashboard') {
      url.pathname = '/dashboard';
      return NextResponse.redirect(url, 307);
    }
    if (pathname.startsWith('/atmosfitnes/')) {
      url.pathname = pathname.replace('/atmosfitnes', '') || '/';
      return NextResponse.redirect(url, 307);
    }

    // Root → Public Webchat Demo for Atmosfitnes
    if (pathname === '/') {
      url.pathname = '/atmosfitnes';
      return NextResponse.rewrite(url);
    }

    // CS / Admin Inbox Dashboard
    if (pathname === '/dashboard' || pathname === '/inbox' || pathname === '/chat') {
      url.pathname = '/atmosfitnes/dashboard';
      return NextResponse.rewrite(url);
    }

    // Gym Operational Hub subroutes
    const gymSubroutes = ['/members', '/access-logs', '/controllers', '/invoices', '/pos', '/classes', '/reports', '/settings'];
    if (gymSubroutes.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
      url.pathname = `/gym${pathname}`;
      return NextResponse.rewrite(url);
    }

    if (pathname.startsWith('/gym') || pathname.startsWith('/admin')) {
      return NextResponse.next();
    }

    url.pathname = `/atmosfitnes${pathname}`;
    return NextResponse.rewrite(url);
  }

  // ===========================================================================
  // 3. Explicit B2B Tenant Slugs (Retail / Digital / UMKM)
  // ===========================================================================
  if (B2B_TENANT_SLUGS.has(subdomain)) {
    const url = req.nextUrl.clone();

    // Clean URL: strip internal /${subdomain} prefix
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

    // Root → Webchat Publik
    if (pathname === '/') {
      url.pathname = `/${subdomain}`;
      return NextResponse.rewrite(url);
    }

    // CS / Admin Inbox Dashboard
    if (pathname === '/dashboard' || pathname === '/inbox' || pathname === '/chat') {
      url.pathname = `/${subdomain}/dashboard`;
      return NextResponse.rewrite(url);
    }

    url.pathname = `/${subdomain}${pathname}`;
    return NextResponse.rewrite(url);
  }

  // ===========================================================================
  // 4. Career Profile Subdomains (explicit whitelist)
  // ===========================================================================
  if (CAREER_KNOWN_SLUGS.has(subdomain)) {
    const url = req.nextUrl.clone();

    // Clean URL: strip internal /career/${subdomain} prefix
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
  // 5. Dynamic B2B Tenant Fallback
  //    Unknown subdomains (wizard-onboarded tenants) → treated as B2B tenants
  // ===========================================================================
  {
    const url = req.nextUrl.clone();

    // Clean URL
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
