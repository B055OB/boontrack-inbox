/**
 * lib/config/branding.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Konfigurasi Terpusat Branding 4 Pilar Ekosistem BoonTrack:
 * 1. Shop    : shop.boontrack.com    -> /branding/shop/
 * 2. Studio  : studio.boontrack.com  -> /branding/studio/
 * 3. Creator : creator.boontrack.com -> /branding/creator/
 * 4. App     : app.boontrack.com     -> /branding/app/
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type BrandingPillar = 'shop' | 'studio' | 'creator' | 'app';

export interface PillarBrandingConfig {
  name: string;
  shortName?: string;
  logo: string;
  favicon: string;
  icon?: string;
  appleTouchIcon?: string;
  manifest?: string;
  domain?: string;
}

export const BRANDING_ASSETS: Record<BrandingPillar, PillarBrandingConfig> = {
  shop: {
    name: 'BoonTrack Shop',
    shortName: 'Shop',
    logo: '/branding/shop/logo.png',
    favicon: '/branding/shop/favicon.ico',
    icon: '/branding/shop/icon.png',
    appleTouchIcon: '/branding/shop/apple-touch-icon.png',
    manifest: '/branding/shop/manifest.json',
    domain: 'https://shop.boontrack.com',
  },
  studio: {
    name: 'BoonTrack Studio',
    shortName: 'Studio',
    logo: '/branding/studio/logo.png',
    favicon: '/branding/studio/favicon.ico',
    icon: '/branding/studio/icon.png',
    appleTouchIcon: '/branding/studio/apple-touch-icon.png',
    manifest: '/branding/studio/manifest.json',
    domain: 'https://studio.boontrack.com',
  },
  creator: {
    name: 'BoonTrack Creator',
    shortName: 'Creator',
    logo: '/branding/creator/logo.png',
    favicon: '/branding/creator/favicon.ico',
    icon: '/branding/creator/icon.png',
    appleTouchIcon: '/branding/creator/apple-touch-icon.png',
    manifest: '/branding/creator/manifest.json',
    domain: 'https://creator.boontrack.com',
  },
  app: {
    name: 'BoonTrack App Portal',
    shortName: 'App Portal',
    logo: '/branding/app/logo-512.png',
    favicon: '/branding/app/favicon.ico',
    icon: '/branding/app/icon.png',
    appleTouchIcon: '/branding/app/apple-touch-icon.png',
    manifest: '/branding/app/manifest.json',
    domain: 'https://app.boontrack.com',
  },
};

/**
 * Helper to retrieve branding asset config by pillar key.
 */
export function getBrandingConfig(pillar: BrandingPillar): PillarBrandingConfig {
  return BRANDING_ASSETS[pillar] || BRANDING_ASSETS.shop;
}
