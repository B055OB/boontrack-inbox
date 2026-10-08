/**
 * __tests__/routing/root_layout_metadata.test.ts
 *
 * P0 Isolation Test Suite:
 * Dynamic Host-Based Metadata & Asset Isolation (Section 48 ARCHITECTURE.md)
 *
 * Enforces:
 * 1. generateMetadata() reads x-forwarded-host / host headers dynamically.
 * 2. creator.boontrack.com resolves Creator icons & manifest-creator.json.
 * 3. shop.boontrack.com resolves Shop icons & manifest.json.
 * 4. Zero static favicon/manifest leak across domains.
 */

// Mock next/font/google
jest.mock('next/font/google', () => ({
  Geist: () => ({ variable: '--font-geist-sans' }),
  Geist_Mono: () => ({ variable: '--font-geist-mono' }),
}));

// Mock next/headers
const mockGet = jest.fn();
jest.mock('next/headers', () => ({
  headers: async () => ({
    get: mockGet,
  }),
}));

import { generateMetadata } from '@/app/layout';
import { middleware } from '@/middleware';
import { NextRequest } from 'next/server';

describe('Root Layout Metadata & Icon/Manifest Isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves Creator metadata, icons, and manifest for creator.boontrack.com host', async () => {
    mockGet.mockImplementation((headerName: string) => {
      if (headerName === 'x-forwarded-host') return 'creator.boontrack.com';
      if (headerName === 'host') return 'creator.boontrack.com';
      return null;
    });

    const meta = await generateMetadata();

    expect(meta.metadataBase?.toString()).toBe('https://creator.boontrack.com/');
    expect(meta.manifest).toBe('/manifest-creator.json');
    expect(meta.title).toContain('Creator');

    // Icons must be scoped to Creator (/app-brand/*)
    const iconsObj = meta.icons && typeof meta.icons === 'object' && !Array.isArray(meta.icons) ? (meta.icons as any) : null;
    const iconList = iconsObj?.icon ? (iconsObj.icon as any[]) : [];
    expect(iconList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: '/app-brand/favicon-32x32.png' }),
        expect.objectContaining({ url: '/app-brand/favicon.ico' }),
      ])
    );
    expect(iconsObj?.apple).toBe('/app-brand/apple-touch-icon.png');
  });

  it('resolves Studio metadata, icons, and manifest for studio.boontrack.com host', async () => {
    mockGet.mockImplementation((headerName: string) => {
      if (headerName === 'x-forwarded-host') return 'studio.boontrack.com';
      if (headerName === 'host') return 'studio.boontrack.com';
      return null;
    });

    const meta = await generateMetadata();

    expect(meta.metadataBase?.toString()).toBe('https://studio.boontrack.com/');
    expect(meta.manifest).toBe('/branding/studio/manifest.json');
    expect(meta.title).toBe('BoonTrack Studio — Creative Workspace & Production Engine');

    // Icons must be strictly scoped to Studio (/branding/studio/*)
    expect(meta.icons).toEqual({
      icon: '/branding/studio/favicon.ico',
      apple: '/branding/studio/icon.png',
    });
  });

  it('resolves Shop metadata, icons, and manifest for shop.boontrack.com host', async () => {
    mockGet.mockImplementation((headerName: string) => {
      if (headerName === 'x-forwarded-host') return 'shop.boontrack.com';
      if (headerName === 'host') return 'shop.boontrack.com';
      return null;
    });

    const meta = await generateMetadata();

    expect(meta.metadataBase?.toString()).toBe('https://shop.boontrack.com/');
    expect(meta.manifest).toBe('/manifest.json');
    expect(meta.title).toContain('Shop');

    // Open Graph & Twitter Card specification (only 1 image og-square.png?v=5 in openGraph.images)
    expect(meta.openGraph?.images).toEqual([
      expect.objectContaining({
        url: 'https://shop.boontrack.com/og-square.png?v=5',
        width: 500,
        height: 500,
        alt: 'BoonTrack Shop',
      }),
    ]);
    expect((meta.twitter as any)?.card).toBe('summary_large_image');
    expect((meta.twitter as any)?.images).toEqual(['https://shop.boontrack.com/og-shop.png']);

    // Icons must be scoped to Shop commerce defaults
    const iconsObj = meta.icons && typeof meta.icons === 'object' && !Array.isArray(meta.icons) ? (meta.icons as any) : null;
    const iconList = iconsObj?.icon ? (iconsObj.icon as any[]) : [];
    expect(iconList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: '/favicon-32x32.png' }),
        expect.objectContaining({ url: '/favicon.ico' }),
      ])
    );
    expect(iconsObj?.apple).toBe('/apple-touch-icon.png');
  });

  it('falls back safely to Shop commerce metadata if host header is absent', async () => {
    mockGet.mockReturnValue(null);

    const meta = await generateMetadata();

    expect(meta.metadataBase?.toString()).toBe('https://shop.boontrack.com/');
    expect(meta.manifest).toBe('/manifest.json');
    expect(meta.title).toContain('Shop');
    expect(meta.openGraph?.images).toEqual([
      expect.objectContaining({
        url: 'https://shop.boontrack.com/og-square.png?v=5',
        width: 500,
        height: 500,
        alt: 'BoonTrack Shop',
      }),
    ]);
    expect((meta.twitter as any)?.card).toBe('summary_large_image');
    expect((meta.twitter as any)?.images).toEqual(['https://shop.boontrack.com/og-shop.png']);
  });

  it('ensures root layout head contains image_src fallback tag for instant messengers', () => {
    const fs = require('fs');
    const path = require('path');
    const layoutContent = fs.readFileSync(path.join(process.cwd(), 'app', 'layout.tsx'), 'utf8');
    expect(layoutContent).toContain('<link rel="image_src" href="https://shop.boontrack.com/og-square.png?v=5" />');
  });

  describe('Middleware Asset Rewrites Isolation', () => {
    it('rewrites /favicon.ico to /app-brand/favicon.ico on creator.boontrack.com', async () => {
      const req = new NextRequest('https://creator.boontrack.com/favicon.ico', {
        headers: {
          host: 'creator.boontrack.com',
          'x-forwarded-host': 'creator.boontrack.com',
        },
      });

      const res = await middleware(req);
      const rewriteHeader = res.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toContain('/app-brand/favicon.ico');
    });

    it('rewrites /manifest.json to /manifest-creator.json on creator.boontrack.com', async () => {
      const req = new NextRequest('https://creator.boontrack.com/manifest.json', {
        headers: {
          host: 'creator.boontrack.com',
          'x-forwarded-host': 'creator.boontrack.com',
        },
      });

      const res = await middleware(req);
      const rewriteHeader = res.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toContain('/manifest-creator.json');
    });

    it('passes through /favicon.ico and /manifest.json naturally on shop.boontrack.com', async () => {
      const reqFavicon = new NextRequest('https://shop.boontrack.com/favicon.ico', {
        headers: {
          host: 'shop.boontrack.com',
          'x-forwarded-host': 'shop.boontrack.com',
        },
      });
      const resFavicon = await middleware(reqFavicon);
      const rewriteFavicon = resFavicon.headers.get('x-middleware-rewrite');
      expect(rewriteFavicon).toBeNull();

      const reqManifest = new NextRequest('https://shop.boontrack.com/manifest.json', {
        headers: {
          host: 'shop.boontrack.com',
          'x-forwarded-host': 'shop.boontrack.com',
        },
      });
      const resManifest = await middleware(reqManifest);
      const rewriteManifest = resManifest.headers.get('x-middleware-rewrite');
      expect(rewriteManifest).toBeNull();
    });
  });
});
