import { NextRequest, NextResponse } from 'next/server';
import { globalDomainRegistry } from '@/packages/workforce-billing/branding/domain-registry';

/**
 * Dynamic Web App Manifest Route Handler (RFC-BWM-014)
 * apps/workforce-web/app/workforce.webmanifest/route.ts
 *
 * Implements:
 * 1. Reads tenant headers (x-tenant-id, x-workforce-tenant-id) or resolved hostname
 * 2. Returns dynamic JSON PWA manifest:
 *    - name: brand_name tenant
 *    - short_name: brand_name tenant
 *    - theme_color: primary_color tenant
 *    - icons: logo_url tenant
 */
export async function GET(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  const resolution = globalDomainRegistry.resolveHost(host);

  const domain = resolution.domain || {
    tenantId: 'tenant_satya_001',
    brandName: 'SATYA Workforce',
    primaryColor: '#059669',
    accentColor: '#0d9488',
    logoUrl: '/icons/workforce-192.png',
    isActive: true,
  };

  const manifest = {
    name: domain.brandName,
    short_name: domain.brandName,
    description: `${domain.brandName} - Operational Workforce Portal`,
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
        purpose: 'any maskable',
      },
      {
        src: domain.logoUrl || '/icons/workforce-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
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

