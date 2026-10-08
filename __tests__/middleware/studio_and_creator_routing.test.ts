/**
 * Test Suite: studio.boontrack.com & creator.boontrack.com Routing & 301 Migration
 *
 * Verifies:
 * 1. studio.boontrack.com host detection:
 *    - '/' -> rewrite to '/studio'
 *    - '/ugc-studio' -> rewrite to '/studio/ugc-studio'
 *    - '/[path]' -> rewrite to '/studio/[path]'
 * 2. Host-Aware 301 Legacy Redirect:
 *    - creator.boontrack.com/ugc-studio -> 301 Redirect to https://studio.boontrack.com/ugc-studio
 *    - Preserves query parameters across 301 redirect
 * 3. creator.boontrack.com routing:
 *    - '/@handle' -> rewrite to '/creator/handle' (cleanSlug)
 *    - '/[slug]' -> rewrite to '/creator/[slug]'
 *    - '/' -> rewrite to '/creator'
 */

import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

describe('studio.boontrack.com & creator.boontrack.com Routing Middleware', () => {
  describe('A. studio.boontrack.com Host Detection & Rewriting', () => {
    it('1. Rewrites root / to /studio (Dashboard Workspace)', async () => {
      const req = new NextRequest('https://studio.boontrack.com/', {
        headers: { host: 'studio.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toBeDefined();
      expect(rewriteHeader).toContain('/studio');
      expect(rewriteHeader).not.toContain('/studio/');
    });

    it('2. Rewrites /ugc-studio to /studio/ugc-studio', async () => {
      const req = new NextRequest('https://studio.boontrack.com/ugc-studio', {
        headers: { host: 'studio.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toBeDefined();
      expect(rewriteHeader).toContain('/studio/ugc-studio');
    });

    it('3. Preserves query parameters when rewriting /ugc-studio', async () => {
      const req = new NextRequest('https://studio.boontrack.com/ugc-studio?product=serum&mode=fast', {
        headers: { host: 'studio.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toBeDefined();
      expect(rewriteHeader).toContain('/studio/ugc-studio?product=serum&mode=fast');
    });

    it('4. Rewrites general sub-paths /[path] to /studio/[path]', async () => {
      const req = new NextRequest('https://studio.boontrack.com/campaigns', {
        headers: { host: 'studio.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toBeDefined();
      expect(rewriteHeader).toContain('/studio/campaigns');
    });

    it('5. Rewrites /favicon.ico to /branding/studio/favicon.ico on studio.boontrack.com', async () => {
      const req = new NextRequest('https://studio.boontrack.com/favicon.ico', {
        headers: { host: 'studio.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toBeDefined();
      expect(rewriteHeader).toContain('/branding/studio/favicon.ico');
    });

    it('6. Rewrites /apple-touch-icon.png to /branding/studio/icon.png on studio.boontrack.com', async () => {
      const req = new NextRequest('https://studio.boontrack.com/apple-touch-icon.png', {
        headers: { host: 'studio.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toBeDefined();
      expect(rewriteHeader).toContain('/branding/studio/icon.png');
    });

    it('7. Rewrites /manifest.json to /branding/studio/manifest.json on studio.boontrack.com', async () => {
      const req = new NextRequest('https://studio.boontrack.com/manifest.json', {
        headers: { host: 'studio.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toBeDefined();
      expect(rewriteHeader).toContain('/branding/studio/manifest.json');
    });
  });

  describe('B. Host-Aware 301 Legacy Redirect for UGC Studio on Creator Host', () => {
    it('1. Redirects creator.boontrack.com/ugc-studio permanently (301) to studio.boontrack.com/ugc-studio', async () => {
      const req = new NextRequest('https://creator.boontrack.com/ugc-studio', {
        headers: { host: 'creator.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(301);
      const location = res.headers.get('location');
      expect(location).toBe('https://studio.boontrack.com/ugc-studio');
    });

    it('2. Preserves query parameters when 301 redirecting to studio.boontrack.com/ugc-studio', async () => {
      const req = new NextRequest('https://creator.boontrack.com/ugc-studio?ref=affiliate&code=SAVE20', {
        headers: { host: 'creator.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(301);
      const location = res.headers.get('location');
      expect(location).toBe('https://studio.boontrack.com/ugc-studio?ref=affiliate&code=SAVE20');
    });

    it('3. Redirects nested UGC subpath (e.g. /ugc-studio/new) to studio.boontrack.com/ugc-studio/new', async () => {
      const req = new NextRequest('https://creator.boontrack.com/ugc-studio/new', {
        headers: { host: 'creator.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(301);
      const location = res.headers.get('location');
      expect(location).toBe('https://studio.boontrack.com/ugc-studio/new');
    });
  });

  describe('C. creator.boontrack.com Profile & Slug Routing', () => {
    it('1. Rewrites /@handle to /creator/handle (normalizes leading @)', async () => {
      const req = new NextRequest('https://creator.boontrack.com/@alldy', {
        headers: { host: 'creator.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toBeDefined();
      expect(rewriteHeader).toContain('/creator/alldy');
    });

    it('2. Rewrites /[slug] to /creator/[slug]', async () => {
      const req = new NextRequest('https://creator.boontrack.com/john_doe', {
        headers: { host: 'creator.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toBeDefined();
      expect(rewriteHeader).toContain('/creator/john_doe');
    });

    it('3. Rewrites root / on creator.boontrack.com to /creator', async () => {
      const req = new NextRequest('https://creator.boontrack.com/', {
        headers: { host: 'creator.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewriteHeader = res.headers.get('x-middleware-rewrite');
      expect(rewriteHeader).toBeDefined();
      expect(rewriteHeader).toContain('/creator');
    });
  });
});
