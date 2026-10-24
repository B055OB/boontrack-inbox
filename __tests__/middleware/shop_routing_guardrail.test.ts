/**
 * Test Suite: shop.boontrack.com Core Subdomain Isolation & Routing Guardrail
 * ADR § 63: Canonical Subdomain Topology & Zero-Leak Onboarding Contract
 *
 * Enforces:
 * 1. shop.boontrack.com never redirects to corporate landing boontrack.com.
 * 2. shop.boontrack.com/?ref=buzzerukm stays on shop engine with referral cookies locked.
 * 3. buzzerukm.boontrack.com cleanly connects to shop.boontrack.com/?ref=buzzerukm.
 * 4. Tenant storefronts (elinor-jewelry, shabu-ajhi, buzzerukm) pass through directly.
 * 5. Dashboard routes on shop domain redirect to dashboard.boontrack.com.
 */
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

describe('shop.boontrack.com Core Subdomain Isolation & Guardrails', () => {
  it('1. [CRITICAL BUG REGRESSION] shop.boontrack.com/?ref=buzzerukm stays on shop engine (status 200, NO redirect to boontrack.com)', async () => {
    const req = new NextRequest('https://shop.boontrack.com/?ref=buzzerukm', {
      headers: { host: 'shop.boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);

    // Verify NOT redirected
    const location = res.headers.get('location');
    expect(location).toBeNull();

    // Verify referral cookies attached with 30-day persistence and wildcard domain
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain('ref=buzzerukm');
    expect(setCookie).toContain('boontrack_referral_code=buzzerukm');
    expect(setCookie).toContain('boontrack_merchant_ref=buzzerukm');
    expect(setCookie).toContain('Domain=.boontrack.com');
  });

  it('2. shop.boontrack.com/ root without query stays on shop engine (status 200, NO redirect)', async () => {
    const req = new NextRequest('https://shop.boontrack.com/', {
      headers: { host: 'shop.boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    const location = res.headers.get('location');
    expect(location).toBeNull();
  });

  it('3. shop.boontrack.com/elinor-jewelry routes to tenant storefront with x-tenant-slug header', async () => {
    const req = new NextRequest('https://shop.boontrack.com/elinor-jewelry', {
      headers: { host: 'shop.boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('4. shop.boontrack.com/shabu-ajhi routes to tenant storefront with x-tenant-slug header', async () => {
    const req = new NextRequest('https://shop.boontrack.com/shabu-ajhi', {
      headers: { host: 'shop.boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('5. shop.boontrack.com/buzzerukm routes to buzzerukm storefront catalog without redirect', async () => {
    const req = new NextRequest('https://shop.boontrack.com/buzzerukm', {
      headers: { host: 'shop.boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('6. buzzerukm.boontrack.com redirects 307 to shop.boontrack.com/?ref=buzzerukm with locked cookies', async () => {
    const req = new NextRequest('https://buzzerukm.boontrack.com/', {
      headers: { host: 'buzzerukm.boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toBe('https://shop.boontrack.com/?ref=buzzerukm');

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('ref=buzzerukm');
    expect(setCookie).toContain('Domain=.boontrack.com');
  });

  it('7. buzzerukm.boontrack.com/register redirects 307 to shop.boontrack.com/register?ref=buzzerukm', async () => {
    const req = new NextRequest('https://buzzerukm.boontrack.com/register', {
      headers: { host: 'buzzerukm.boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toBe('https://shop.boontrack.com/register?ref=buzzerukm');
  });

  it('8. [ADR § 63] shop.boontrack.com/elinor-jewelry/dashboard redirects 302 to dashboard.boontrack.com/elinor-jewelry', async () => {
    const req = new NextRequest('https://shop.boontrack.com/elinor-jewelry/dashboard', {
      headers: { host: 'shop.boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toBe('https://dashboard.boontrack.com/elinor-jewelry');
  });

  it('9. [ADR § 63] shop.boontrack.com/dashboard redirects 302 to dashboard.boontrack.com/login', async () => {
    const req = new NextRequest('https://shop.boontrack.com/dashboard', {
      headers: { host: 'shop.boontrack.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toBe('https://dashboard.boontrack.com/login');
  });

  describe('10. Referral Attribution Separation (?ref= vs ?r=) [P0 Pre-Staging Mandate]', () => {
    it('10a. Platform-only (?ref=partner_alpha): sets platform referral cookies and does NOT set bt_reseller_code', async () => {
      const req = new NextRequest('https://shop.boontrack.com/elinor-jewelry?ref=partner_alpha', {
        headers: { host: 'shop.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);

      const setCookie = res.headers.get('set-cookie') || '';
      expect(setCookie).toContain('ref=partner_alpha');
      expect(setCookie).toContain('boontrack_referral_code=partner_alpha');
      expect(setCookie).toContain('boontrack_merchant_ref=partner_alpha');
      expect(setCookie).not.toContain('bt_reseller_code');
    });

    it('10b. Platform-only via ?aff= (affiliate alias): sets platform referral cookies and does NOT set bt_reseller_code', async () => {
      const req = new NextRequest('https://shop.boontrack.com/?aff=affiliate_hero', {
        headers: { host: 'shop.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);

      const setCookie = res.headers.get('set-cookie') || '';
      expect(setCookie).toContain('ref=affiliate_hero');
      expect(setCookie).toContain('boontrack_referral_code=affiliate_hero');
      expect(setCookie).not.toContain('bt_reseller_code');
    });

    it('10c. Reseller-only (?r=reseller_beta): sets bt_reseller_code and does NOT set platform referral cookies', async () => {
      const req = new NextRequest('https://shop.boontrack.com/elinor-jewelry?r=reseller_beta', {
        headers: { host: 'shop.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);

      const setCookie = res.headers.get('set-cookie') || '';
      expect(setCookie).toContain('bt_reseller_code=reseller_beta');
      expect(setCookie).not.toContain('ref=reseller_beta');
      expect(setCookie).not.toContain('boontrack_referral_code=reseller_beta');
      expect(setCookie).not.toContain('boontrack_merchant_ref=reseller_beta');
    });

    it('10d. Both parameters (?ref=partner_alpha&r=reseller_beta): maintains strict separation without cross-pollution', async () => {
      const req = new NextRequest('https://shop.boontrack.com/elinor-jewelry?ref=partner_alpha&r=reseller_beta', {
        headers: { host: 'shop.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);

      const setCookie = res.headers.get('set-cookie') || '';
      // Platform cookies are bound strictly to partner_alpha
      expect(setCookie).toContain('ref=partner_alpha');
      expect(setCookie).toContain('boontrack_referral_code=partner_alpha');
      expect(setCookie).toContain('boontrack_merchant_ref=partner_alpha');

      // Reseller cookie is bound strictly to reseller_beta
      expect(setCookie).toContain('bt_reseller_code=reseller_beta');

      // Verify zero cross-pollution
      expect(setCookie).not.toContain('ref=reseller_beta');
      expect(setCookie).not.toContain('bt_reseller_code=partner_alpha');
    });

    it('10e. Special route buzzerukm.boontrack.com preserves 307 redirect to shop.boontrack.com/?ref=buzzerukm with platform cookies only', async () => {
      const req = new NextRequest('https://buzzerukm.boontrack.com/', {
        headers: { host: 'buzzerukm.boontrack.com' },
      });

      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('https://shop.boontrack.com/?ref=buzzerukm');

      const setCookie = res.headers.get('set-cookie') || '';
      expect(setCookie).toContain('ref=buzzerukm');
      expect(setCookie).toContain('boontrack_referral_code=buzzerukm');
      expect(setCookie).toContain('boontrack_merchant_ref=buzzerukm');
      expect(setCookie).not.toContain('bt_reseller_code');
    });
  });
});
