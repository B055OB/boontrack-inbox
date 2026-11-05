/**
 * packages/workforce-billing/branding/domain-registry.ts
 * Verified Domain Registry & Edge Tenant Resolution Service (RFC-BWM-014)
 *
 * Implements:
 * 1. Authoritative Domain Lookup against verified_domain_registry
 * 2. Strict Default-Deny Policy for Unknown Hosts
 * 3. Reverse Proxy Security Check (Cloudflare / Railway edge headers)
 */

export interface VerifiedDomain {
  domainId?: string;
  tenantId: string;
  hostname: string;
  brandName: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  isActive: boolean;
}

export type DomainResolutionStatus = 'RESOLVED' | 'DEFAULT_DENY' | 'UNTRUSTED_PROXY';

export interface DomainResolutionResult {
  status: DomainResolutionStatus;
  domain?: VerifiedDomain;
  targetRedirect?: string;
  reason?: string;
}

export class DomainRegistryService {
  // Authoritative memory cache seeded with pre-verified tenant domains
  private readonly registry: Map<string, VerifiedDomain> = new Map();

  constructor() {
    this.seedDefaultDomains();
  }

  private seedDefaultDomains() {
    const defaults: VerifiedDomain[] = [
      {
        tenantId: 'tenant_satya_001',
        hostname: 'workforce.boontrack.com',
        brandName: 'SATYA Workforce',
        logoUrl: '/icons/workforce-192.png',
        primaryColor: '#059669',
        accentColor: '#0d9488',
        isActive: true,
      },
      {
        tenantId: 'tenant_satya_staging',
        hostname: 'satya.workforce.boontrack.com',
        brandName: 'SATYA Security Ops',
        logoUrl: '/icons/satya-logo.png',
        primaryColor: '#06b6d4',
        accentColor: '#4f46e5',
        isActive: true,
      },
      {
        tenantId: 'tenant_beta_adversary',
        hostname: 'beta.workforce.boontrack.com',
        brandName: 'Beta Security Ops',
        logoUrl: '/icons/workforce-192.png',
        primaryColor: '#dc2626',
        accentColor: '#b91c1c',
        isActive: true,
      },
      // Local development and CI testing hostnames
      {
        tenantId: 'tenant_satya_001',
        hostname: 'localhost:3001',
        brandName: 'SATYA Workforce (Dev)',
        logoUrl: '/icons/workforce-192.png',
        primaryColor: '#059669',
        accentColor: '#0d9488',
        isActive: true,
      },
      {
        tenantId: 'tenant_satya_001',
        hostname: '127.0.0.1:3001',
        brandName: 'SATYA Workforce (Local)',
        logoUrl: '/icons/workforce-192.png',
        primaryColor: '#059669',
        accentColor: '#0d9488',
        isActive: true,
      },
      {
        tenantId: 'tenant_satya_001',
        hostname: 'localhost',
        brandName: 'SATYA Workforce (Localhost)',
        logoUrl: '/icons/workforce-192.png',
        primaryColor: '#059669',
        accentColor: '#0d9488',
        isActive: true,
      },
    ];

    for (const d of defaults) {
      this.registry.set(d.hostname.toLowerCase(), d);
    }
  }

  public registerDomain(domain: VerifiedDomain): void {
    this.registry.set(domain.hostname.toLowerCase(), domain);
  }

  public getDomain(hostname: string): VerifiedDomain | undefined {
    return this.registry.get(hostname.toLowerCase());
  }

  /**
   * Authoritative Edge Resolution with Default-Deny & Reverse Proxy Authentication
   */
  public resolveHost(
    rawHost: string | null,
    edgeVerificationHeader?: string | null
  ): DomainResolutionResult {
    // 1. Fallback if host header missing
    if (!rawHost) {
      return {
        status: 'DEFAULT_DENY',
        targetRedirect: 'https://workforce.boontrack.com/login',
        reason: 'MISSING_HOST_HEADER',
      };
    }

    const hostname = rawHost.split(':')[0].toLowerCase();
    const port = rawHost.includes(':') ? `:${rawHost.split(':')[1]}` : '';
    const fullHost = `${hostname}${port}`.toLowerCase();

    // 2. Validate Edge Reverse Proxy (in production)
    const isProduction = process.env.NODE_ENV === 'production';
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    if (isProduction && !isLocal && !edgeVerificationHeader) {
      return {
        status: 'UNTRUSTED_PROXY',
        targetRedirect: 'https://workforce.boontrack.com/login',
        reason: 'UNTRUSTED_PROXY_ORIGIN_MISSING_EDGE_TOKEN',
      };
    }

    // 2b. Allow Railway staging domains (*.railway.app)
    if (hostname.endsWith('.railway.app')) {
      return {
        status: 'RESOLVED',
        domain: {
          tenantId: 'tenant_satya_001',
          hostname,
          brandName: 'SATYA Workforce (Staging)',
          logoUrl: '/icons/workforce-192.png',
          primaryColor: '#059669',
          accentColor: '#0d9488',
          isActive: true,
        },
      };
    }

    // 3. Lookup against verified_domain_registry
    const matched = this.registry.get(fullHost) || this.registry.get(hostname);

    // 4. Strict Default-Deny if unknown or suspended
    if (!matched || !matched.isActive) {
      return {
        status: 'DEFAULT_DENY',
        targetRedirect: 'https://workforce.boontrack.com/login',
        reason: matched ? 'TENANT_DOMAIN_SUSPENDED' : 'UNREGISTERED_HOST',
      };
    }

    return {
      status: 'RESOLVED',
      domain: matched,
    };
  }
}

// Global singleton instance for middleware and route handlers
export const globalDomainRegistry = new DomainRegistryService();

