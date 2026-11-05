import { NextRequest, NextResponse } from 'next/server';
import { globalDomainRegistry } from '@/packages/workforce-billing/branding/domain-registry';

/**
 * Dynamic PWA Web App Manifest Route Handler (RFC-BWM-014 / RFC-018)
 * Generates tenant-specific manifest based on host resolution.
 */
export async function GET(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  const resolution = globalDomainRegistry.resolveHost(host);

  const domain = resolution.domain || {
    tenantId: 'bwm_canonical',
    brandName: 'BWM Workforce',
    primaryColor: '#059669',
    accentColor: '#0d9488',
    logoUrl: '/icons/workforce-192.png',
  };

  const manifest = {
    name: `${domain.brandName} — Field Ops`,
    short_name: domain.brandName,
    description: `Operational Field App for Security Personnel & Facility Services — ${domain.brandName}`,
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f172a',
    theme_color: domain.primaryColor,
    icons: [
      {
        src: domain.logoUrl || '/icons/workforce-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/workforce-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
