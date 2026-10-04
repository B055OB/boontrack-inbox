/**
 * __tests__/auth/login_context_resolver.test.ts
 * Tests for P0 Boundary Repair: Context-Aware Login Resolver & Direct Desk Operator Route
 */

import { resolveTenantRuntime } from '@/lib/resolvers/tenant-runtime-resolver';

function extractSlugFromUrl(urlStr: string): string {
  if (!urlStr) return '';
  let clean = urlStr;
  try {
    clean = decodeURIComponent(clean);
  } catch {}
  clean = clean.trim();
  clean = clean.replace(/^https?:\/\/[^/]+/i, '');
  const match = clean.match(/^\/([^/?#]+)/);
  if (match) {
    const candidate = match[1].toLowerCase().trim();
    const RESERVED_SLUGS = new Set([
      'app', 'dashboard', 'admin', 'login', 'register', 'api', '_next',
      'checkout', 'pricing', 'affiliate', 'manager', 'terms', 'privacy',
      'refund', 'acceptable-use', 'data-deletion', 'app-portal'
    ]);
    if (!RESERVED_SLUGS.has(candidate)) {
      return candidate;
    }
  }
  return '';
}

describe('Context-Aware Login Resolver & Tenant Runtime Boundary', () => {
  describe('extractSlugFromUrl', () => {
    it('extracts tenant slug from /margasari/dashboard', () => {
      expect(extractSlugFromUrl('/margasari/dashboard')).toBe('margasari');
    });

    it('extracts tenant slug from /margasari/desk', () => {
      expect(extractSlugFromUrl('/margasari/desk')).toBe('margasari');
    });

    it('extracts tenant slug from URL-encoded redirectTo string', () => {
      expect(extractSlugFromUrl('%2Fmargasari%2Fdashboard')).toBe('margasari');
      expect(extractSlugFromUrl('%2Fmargasari%2Fdesk')).toBe('margasari');
    });

    it('extracts tenant slug from full URL', () => {
      expect(extractSlugFromUrl('https://app.boontrack.com/margasari/dashboard')).toBe('margasari');
      expect(extractSlugFromUrl('https://app.boontrack.com/margasari/desk')).toBe('margasari');
    });

    it('ignores reserved system routes like /login, /dashboard, /app', () => {
      expect(extractSlugFromUrl('/login')).toBe('');
      expect(extractSlugFromUrl('/dashboard')).toBe('');
      expect(extractSlugFromUrl('/app')).toBe('');
      expect(extractSlugFromUrl('/register')).toBe('');
    });
  });

  describe('Context-Aware UI Mode Resolution (PUBLIC_SERVICE_V1 vs SHOP_V1)', () => {
    it('resolves PUBLIC_SERVICE_V1 for Margasari Civic Tenant data', () => {
      const runtime = resolveTenantRuntime({
        host: 'app.boontrack.com',
        tenant: {
          slug: 'margasari',
          name: 'Portal Pelayanan Digital Warga Kelurahan Margasari',
          title: 'Kelurahan Margasari',
          template_code: 'PUBLIC_SERVICE_V1',
          business_type: 'PUBLIC_SERVICE',
          tenant_kind: 'CUSTOM_APP',
          metadata: {
            title: 'Kelurahan Margasari',
            template_code: 'PUBLIC_SERVICE_V1',
          },
        },
      });

      expect(runtime.templateCode).toBe('PUBLIC_SERVICE_V1');
      expect(runtime.tenantKind).toBe('CUSTOM_APP');
      expect(runtime.businessType).toBe('PUBLIC_SERVICE');
      expect(runtime.capabilities.service_catalog).toBe(true);
      expect(runtime.capabilities.citizen_request).toBe(true);
      expect(runtime.capabilities.complaint).toBe(true);
      expect(runtime.capabilities.cart).toBe(false);
      expect(runtime.capabilities.checkout).toBe(false);
    });

    it('resolves standard SHOP_V1 for commerce merchant buzzerukm', () => {
      const runtime = resolveTenantRuntime({
        host: 'shop.boontrack.com',
        tenant: {
          slug: 'buzzerukm',
          name: 'Buzzer UKM Store',
          template_code: 'SHOP_V1',
          business_type: 'RETAIL',
          tenant_kind: 'SAAS',
        },
      });

      expect(runtime.templateCode).toBe('SHOP_V1');
      expect(runtime.tenantKind).toBe('SAAS');
      expect(runtime.businessType).toBe('RETAIL');
      expect(runtime.capabilities.cart).toBe(true);
      expect(runtime.capabilities.checkout).toBe(true);
      expect(runtime.capabilities.citizen_request).toBe(false);
    });
  });
});
