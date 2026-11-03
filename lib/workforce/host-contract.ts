/**
 * lib/workforce/host-contract.ts
 * BWM Gate E1 — Host & Domain Validation Contract
 *
 * Strict Architecture Invariants:
 * 1. Dedicated Workforce Subdomain: workforce.boontrack.com is canonical.
 * 2. Custom CNAME Support: Authorized partner domains (e.g., satyasystem.id).
 * 3. Retired Host Rejection: app.boontrack.com is rejected with explicit fail-closed reason.
 * 4. Cross-Domain Shield: Prevents cross-contamination with shop, creator, studio, or dashboard.
 */

export interface PartnerDomainConfig {
  domain: string;
  agencyId: string;
  agencySlug: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  tlsVerified: boolean;
}

export type HostResolutionStatus =
  | 'CANONICAL_WORKFORCE'
  | 'AUTHORIZED_PARTNER_CNAME'
  | 'REJECTED_RETIRED_GATEWAY'
  | 'REJECTED_CROSS_DOMAIN_HOST'
  | 'REJECTED_UNAUTHORIZED_DOMAIN'
  | 'REJECTED_INVALID_HOST';

export interface HostResolutionResult {
  allowed: boolean;
  status: HostResolutionStatus;
  cleanHost: string;
  isCustomDomain: boolean;
  agencyId?: string;
  agencySlug?: string;
  error?: string;
}

const RESERVED_PRODUCT_HOSTS = new Set([
  'shop.boontrack.com',
  'creator.boontrack.com',
  'studio.boontrack.com',
  'dashboard.boontrack.com',
  'admin.boontrack.com',
  'manager.boontrack.com',
  'api.boontrack.com',
]);

/**
 * Normalizes host input by stripping ports, trailing dots, protocols, and converting to lowercase.
 */
export function normalizeHost(rawHost: string): string {
  if (!rawHost || typeof rawHost !== 'string') return '';
  let cleaned = rawHost.trim().toLowerCase();
  cleaned = cleaned.replace(/^https?:\/\//i, '');
  cleaned = cleaned.split('/')[0];
  cleaned = cleaned.split(':')[0];
  return cleaned.replace(/\.+$/, '');
}

/**
 * Resolves whether an incoming host is an authorized Workforce domain.
 */
export function resolveWorkforceHost(
  rawHost: string,
  authorizedPartners: Record<string, PartnerDomainConfig> = {}
): HostResolutionResult {
  const cleanHost = normalizeHost(rawHost);

  if (!cleanHost) {
    return {
      allowed: false,
      status: 'REJECTED_INVALID_HOST',
      cleanHost: '',
      isCustomDomain: false,
      error: 'Host header kosong atau tidak valid.',
    };
  }

  // 1. Guard against retired gateway app.boontrack.com
  if (cleanHost === 'app.boontrack.com' || cleanHost === 'app.localhost') {
    return {
      allowed: false,
      status: 'REJECTED_RETIRED_GATEWAY',
      cleanHost,
      isCustomDomain: false,
      error: 'Host app.boontrack.com telah dipensiunkan (HTTP 410/301). BWM wajib menggunakan workforce.boontrack.com.',
    };
  }

  // 2. Canonical Workforce Subdomain
  if (
    cleanHost === 'workforce.boontrack.com' ||
    cleanHost === 'workforce.localhost' ||
    cleanHost.endsWith('.workforce.boontrack.com')
  ) {
    return {
      allowed: true,
      status: 'CANONICAL_WORKFORCE',
      cleanHost,
      isCustomDomain: false,
    };
  }

  // 3. Reject other official product subdomains
  if (RESERVED_PRODUCT_HOSTS.has(cleanHost)) {
    return {
      allowed: false,
      status: 'REJECTED_CROSS_DOMAIN_HOST',
      cleanHost,
      isCustomDomain: false,
      error: `Host '${cleanHost}' adalah domain produk non-workforce. Isolasi domain ditegakkan.`,
    };
  }

  // 4. Partner Custom Domain (e.g., satyasystem.id)
  const partnerConfig = authorizedPartners[cleanHost];
  if (partnerConfig) {
    if (partnerConfig.status !== 'ACTIVE') {
      return {
        allowed: false,
        status: 'REJECTED_UNAUTHORIZED_DOMAIN',
        cleanHost,
        isCustomDomain: true,
        agencyId: partnerConfig.agencyId,
        agencySlug: partnerConfig.agencySlug,
        error: `Partner domain '${cleanHost}' berstatus ${partnerConfig.status}. Akses ditolak.`,
      };
    }

    if (!partnerConfig.tlsVerified) {
      return {
        allowed: false,
        status: 'REJECTED_UNAUTHORIZED_DOMAIN',
        cleanHost,
        isCustomDomain: true,
        agencyId: partnerConfig.agencyId,
        agencySlug: partnerConfig.agencySlug,
        error: `Sertifikat TLS untuk custom domain '${cleanHost}' belum terverifikasi.`,
      };
    }

    return {
      allowed: true,
      status: 'AUTHORIZED_PARTNER_CNAME',
      cleanHost,
      isCustomDomain: true,
      agencyId: partnerConfig.agencyId,
      agencySlug: partnerConfig.agencySlug,
    };
  }

  // 5. Default fail-closed for any unmapped domain
  return {
    allowed: false,
    status: 'REJECTED_UNAUTHORIZED_DOMAIN',
    cleanHost,
    isCustomDomain: true,
    error: `Domain '${cleanHost}' tidak terdaftar sebagai endpoint BWM valid (Fail-Closed).`,
  };
}

