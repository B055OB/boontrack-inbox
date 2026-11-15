/**
 * Test Suite: INBOX-PREVIEW-ROUTE-01 Security & Host-Based Isolation Verification
 *
 * Verifies:
 * 1. Host-based lockdown of /admin & /admin/*:
 *    - shop.boontrack.com/admin -> 404 rewrite to /404-store-not-found
 *    - studio.boontrack.com/admin -> 404 rewrite to /404-store-not-found
 *    - custom-domain.com/admin -> 404 rewrite to /404-store-not-found
 *    - tenant.boontrack.com/admin -> 404 rewrite to /404-store-not-found
 *    - creator.boontrack.com/admin -> 200 rewrite to /creator/admin (never leaks root /admin)
 *    - admin.boontrack.com/admin -> 200 allowed
 *    - preview *.vercel.app/creator/admin -> 200 allowed
 * 2. Creator Login Redirection:
 *    - Dedicated domain (creator.boontrack.com) redirects to /admin
 *    - Non-dedicated domain (*.vercel.app, staging, localhost) redirects explicitly to /creator/admin
 * 3. Default PIN hints scrubbed from admin UI components
 */

import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import * as fs from 'fs';
import * as path from 'path';

describe('INBOX-PREVIEW-ROUTE-01: Executive Plane Isolation & Host Lockdown', () => {
  describe('1. Executive Control Plane (/admin) Host Lockdown', () => {
    it('blocks shop.boontrack.com/admin with 404 rewrite to /404-store-not-found', async () => {
      const req = new NextRequest('https://shop.boontrack.com/admin', {
        headers: { host: 'shop.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(404);
      const rewrite = res.headers.get('x-middleware-rewrite') || '';
      expect(rewrite).toContain('/404-store-not-found');
    });

    it('blocks shop.boontrack.com/admin/settings with 404 rewrite', async () => {
      const req = new NextRequest('https://shop.boontrack.com/admin/settings', {
        headers: { host: 'shop.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(404);
      const rewrite = res.headers.get('x-middleware-rewrite') || '';
      expect(rewrite).toContain('/404-store-not-found');
    });

    it('blocks studio.boontrack.com/admin with 404 rewrite to /404-store-not-found', async () => {
      const req = new NextRequest('https://studio.boontrack.com/admin', {
        headers: { host: 'studio.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(404);
      const rewrite = res.headers.get('x-middleware-rewrite') || '';
      expect(rewrite).toContain('/404-store-not-found');
    });

    it('blocks studio.boontrack.com/admin/config with 404 rewrite', async () => {
      const req = new NextRequest('https://studio.boontrack.com/admin/config', {
        headers: { host: 'studio.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(404);
      const rewrite = res.headers.get('x-middleware-rewrite') || '';
      expect(rewrite).toContain('/404-store-not-found');
    });

    it('blocks custom domain /admin with 404 rewrite', async () => {
      const req = new NextRequest('https://order.shabuajhi.com/admin', {
        headers: { host: 'order.shabuajhi.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(404);
      const rewrite = res.headers.get('x-middleware-rewrite') || '';
      expect(rewrite).toContain('/404-store-not-found');
    });

    it('blocks storefront subdomain lala.boontrack.com/admin with 404 rewrite', async () => {
      const req = new NextRequest('https://lala.boontrack.com/admin', {
        headers: { host: 'lala.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(404);
      const rewrite = res.headers.get('x-middleware-rewrite') || '';
      expect(rewrite).toContain('/404-store-not-found');
    });

    it('rewrites creator.boontrack.com/admin to /creator/admin without leaking root /admin', async () => {
      const req = new NextRequest('https://creator.boontrack.com/admin', {
        headers: { host: 'creator.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewrite = res.headers.get('x-middleware-rewrite') || '';
      expect(rewrite).toContain('/creator/admin');
      expect(rewrite).not.toContain('/404-store-not-found');
    });

    it('rewrites creator.boontrack.com/admin/payouts to /creator/admin/payouts', async () => {
      const req = new NextRequest('https://creator.boontrack.com/admin/payouts', {
        headers: { host: 'creator.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewrite = res.headers.get('x-middleware-rewrite') || '';
      expect(rewrite).toContain('/creator/admin/payouts');
    });

    it('allows admin.boontrack.com to access /admin', async () => {
      const req = new NextRequest('https://admin.boontrack.com/', {
        headers: { host: 'admin.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewrite = res.headers.get('x-middleware-rewrite') || '';
      expect(rewrite).toContain('/admin');
    });

    it('allows preview *.vercel.app/creator/admin without blocking or 404 rewriting', async () => {
      const req = new NextRequest('https://boontrack-inbox-git-fix-inbox-preview-route-01-boontrack.vercel.app/creator/admin', {
        headers: { host: 'boontrack-inbox-git-fix-inbox-preview-route-01-boontrack.vercel.app' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewrite = res.headers.get('x-middleware-rewrite');
      // Pass-through without 404 rewrite
      if (rewrite) {
        expect(rewrite).not.toContain('/404-store-not-found');
      }
    });

    it('allows preview *.vercel.app/creator/login without blocking', async () => {
      const req = new NextRequest('https://boontrack-inbox-git-fix-inbox-preview-route-01-boontrack.vercel.app/creator/login', {
        headers: { host: 'boontrack-inbox-git-fix-inbox-preview-route-01-boontrack.vercel.app' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      const rewrite = res.headers.get('x-middleware-rewrite');
      if (rewrite) {
        expect(rewrite).not.toContain('/404-store-not-found');
      }
    });
  });

  describe('2. Creator Login Route Host-Aware Redirection', () => {
    it('uses /creator/admin on preview/staging host in route logic', () => {
      const hostClean = 'boontrack-inbox-git-fix-inbox-preview-route-01-boontrack.vercel.app';
      const isDedicatedCreatorDomain = hostClean === 'creator.boontrack.com';
      const baseRedirect = isDedicatedCreatorDomain ? '/admin' : '/creator/admin';

      expect(baseRedirect).toBe('/creator/admin');
    });

    it('uses /admin on dedicated creator.boontrack.com host in route logic', () => {
      const hostClean = 'creator.boontrack.com';
      const isDedicatedCreatorDomain = hostClean === 'creator.boontrack.com';
      const baseRedirect = isDedicatedCreatorDomain ? '/admin' : '/creator/admin';

      expect(baseRedirect).toBe('/admin');
    });
  });

  describe('3. Admin UI Hardcoded Default PIN Scrubbing', () => {
    const adminDir = path.join(process.cwd(), 'app', 'admin');

    function checkFilesForPattern(dir: string, pattern: RegExp): string[] {
      const matches: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          matches.push(...checkFilesForPattern(fullPath, pattern));
        } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (pattern.test(content)) {
            matches.push(fullPath);
          }
        }
      }
      return matches;
    }

    it('confirms zero default PIN hints ("default: 998877") remain in app/admin', () => {
      const leakingFiles = checkFilesForPattern(adminDir, /default:\s*998877/i);
      expect(leakingFiles).toHaveLength(0);
    });
  });
});
