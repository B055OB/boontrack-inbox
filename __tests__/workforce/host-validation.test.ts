/**
 * __tests__/workforce/host-validation.test.ts
 * BWM Gate E1 — Test Suite: Host & Subdomain Validation Contracts
 */

import {
  resolveWorkforceHost,
  normalizeHost,
  PartnerDomainConfig,
} from '@/lib/workforce/host-contract';

describe('BWM Gate E1: Host Validation Contract', () => {
  const mockPartners: Record<string, PartnerDomainConfig> = {
    'satyasystem.id': {
      domain: 'satyasystem.id',
      agencyId: 'agency_satya_001',
      agencySlug: 'satya-system',
      status: 'ACTIVE',
      tlsVerified: true,
    },
    'suspended.partner.com': {
      domain: 'suspended.partner.com',
      agencyId: 'agency_suspended_002',
      agencySlug: 'suspended-agency',
      status: 'SUSPENDED',
      tlsVerified: true,
    },
    'unverified-tls.partner.com': {
      domain: 'unverified-tls.partner.com',
      agencyId: 'agency_unverified_003',
      agencySlug: 'unverified-agency',
      status: 'ACTIVE',
      tlsVerified: false,
    },
  };

  describe('1. Canonical Workforce Domain Resolution', () => {
    it('allows official canonical domain workforce.boontrack.com', () => {
      const res = resolveWorkforceHost('workforce.boontrack.com', mockPartners);
      expect(res.allowed).toBe(true);
      expect(res.status).toBe('CANONICAL_WORKFORCE');
      expect(res.isCustomDomain).toBe(false);
      expect(res.cleanHost).toBe('workforce.boontrack.com');
    });

    it('allows development localhost domain workforce.localhost with port', () => {
      const res = resolveWorkforceHost('workforce.localhost:3000', mockPartners);
      expect(res.allowed).toBe(true);
      expect(res.status).toBe('CANONICAL_WORKFORCE');
      expect(res.cleanHost).toBe('workforce.localhost');
    });

    it('normalizes uppercase and protocol prefixes correctly', () => {
      const res = resolveWorkforceHost('https://WORKFORCE.BOONTRACK.COM:443/', mockPartners);
      expect(res.allowed).toBe(true);
      expect(res.status).toBe('CANONICAL_WORKFORCE');
      expect(res.cleanHost).toBe('workforce.boontrack.com');
    });
  });

  describe('2. Custom Partner CNAME Domain Resolution', () => {
    it('allows verified active partner domain satyasystem.id with agency context', () => {
      const res = resolveWorkforceHost('satyasystem.id', mockPartners);
      expect(res.allowed).toBe(true);
      expect(res.status).toBe('AUTHORIZED_PARTNER_CNAME');
      expect(res.isCustomDomain).toBe(true);
      expect(res.agencyId).toBe('agency_satya_001');
      expect(res.agencySlug).toBe('satya-system');
    });

    it('rejects partner domain when partner status is SUSPENDED', () => {
      const res = resolveWorkforceHost('suspended.partner.com', mockPartners);
      expect(res.allowed).toBe(false);
      expect(res.status).toBe('REJECTED_UNAUTHORIZED_DOMAIN');
      expect(res.error).toContain('SUSPENDED');
    });

    it('rejects partner domain when TLS certificate is not verified', () => {
      const res = resolveWorkforceHost('unverified-tls.partner.com', mockPartners);
      expect(res.allowed).toBe(false);
      expect(res.status).toBe('REJECTED_UNAUTHORIZED_DOMAIN');
      expect(res.error).toContain('TLS');
    });
  });

  describe('3. Retired Gateway & Cross-Domain Isolation Enforcements', () => {
    it('strictly rejects retired gateway app.boontrack.com with explicit directive message', () => {
      const res = resolveWorkforceHost('app.boontrack.com', mockPartners);
      expect(res.allowed).toBe(false);
      expect(res.status).toBe('REJECTED_RETIRED_GATEWAY');
      expect(res.error).toContain('dipensiunkan');
    });

    it('strictly rejects cross-domain product hosts (shop, creator, studio, dashboard)', () => {
      const crossDomains = [
        'shop.boontrack.com',
        'creator.boontrack.com',
        'studio.boontrack.com',
        'dashboard.boontrack.com',
      ];

      for (const domain of crossDomains) {
        const res = resolveWorkforceHost(domain, mockPartners);
        expect(res.allowed).toBe(false);
        expect(res.status).toBe('REJECTED_CROSS_DOMAIN_HOST');
        expect(res.error).toContain('non-workforce');
      }
    });

    it('rejects unknown unmapped domains with fail-closed posture', () => {
      const res = resolveWorkforceHost('unknown-workforce-portal.com', mockPartners);
      expect(res.allowed).toBe(false);
      expect(res.status).toBe('REJECTED_UNAUTHORIZED_DOMAIN');
      expect(res.error).toContain('Fail-Closed');
    });

    it('rejects null, empty, or whitespace-only host header', () => {
      expect(resolveWorkforceHost('').allowed).toBe(false);
      expect(resolveWorkforceHost('   ').allowed).toBe(false);
      expect(normalizeHost('')).toBe('');
    });
  });
});

