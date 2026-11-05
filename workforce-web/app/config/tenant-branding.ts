'use client';

import { useState, useEffect } from 'react';

export interface TenantBrandingConfig {
  id: string;
  tenantId: string;
  brandName: string;
  portalTitle: string;
  pwaAppName: string;
  pwaShortName: string;
  pwaThemeColor: string;
  pwaBgColor: string;
  logoLightUrl: string;
  logoDarkUrl: string;
  faviconUrl: string;
  installBannerEnabled: boolean;
  installButtonLabel: string;
  brandingVersion: number;
}

// Canonical Host Default (Pure BWM Global Identity)
export const CANONICAL_BWM_BRANDING: TenantBrandingConfig = {
  id: "bwm_global_v1",
  tenantId: "bwm_canonical",
  brandName: "BWM",
  portalTitle: "BWM Operations Portal",
  pwaAppName: "BWM Mobile Field Portal",
  pwaShortName: "BWM Field",
  pwaThemeColor: "#0F172A",
  pwaBgColor: "#020617",
  logoLightUrl: "/logo.png",
  logoDarkUrl: "/logo.png",
  faviconUrl: "/icon.png",
  installBannerEnabled: true,
  installButtonLabel: "Install Mobile App",
  brandingVersion: 1
};

// In-Memory Tenant Branding Registry
export const TENANT_BRANDING_REGISTRY: Record<string, TenantBrandingConfig> = {
  bwm_canonical: CANONICAL_BWM_BRANDING,
  'workforce.boontrack.com': CANONICAL_BWM_BRANDING,
  apex: {
    id: "apex_security_v1",
    tenantId: "apex",
    brandName: "Apex Security",
    portalTitle: "Apex Operations Portal",
    pwaAppName: "Apex Mobile Field Portal",
    pwaShortName: "Apex Field",
    pwaThemeColor: "#1E293B",
    pwaBgColor: "#0F172A",
    logoLightUrl: "/logo.png",
    logoDarkUrl: "/logo.png",
    faviconUrl: "/icon.png",
    installBannerEnabled: true,
    installButtonLabel: "Install Mobile App",
    brandingVersion: 1
  }
};

/**
 * Custom React hook to resolve dynamic branding config for the active tenant context
 */
export function useTenantBranding(tenantIdOrSlug?: string): TenantBrandingConfig {
  const [branding, setBranding] = useState<TenantBrandingConfig>(CANONICAL_BWM_BRANDING);

  useEffect(() => {
    if (tenantIdOrSlug) {
      const normalized = tenantIdOrSlug.toLowerCase();
      if (TENANT_BRANDING_REGISTRY[normalized]) {
        setBranding(TENANT_BRANDING_REGISTRY[normalized]);
        return;
      }
    }

    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      if (TENANT_BRANDING_REGISTRY[host]) {
        setBranding(TENANT_BRANDING_REGISTRY[host]);
      } else {
        setBranding(CANONICAL_BWM_BRANDING);
      }
    }
  }, [tenantIdOrSlug]);

  return branding;
}
