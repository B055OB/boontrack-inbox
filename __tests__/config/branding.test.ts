import fs from 'fs';
import path from 'path';
import { BRANDING_ASSETS, getBrandingConfig } from '@/lib/config/branding';

describe('BoonTrack 4-Pillar Ecosystem Branding Standards', () => {
  const publicDir = path.resolve(__dirname, '../../public');

  describe('1. BRANDING_ASSETS Contract Alignment', () => {
    it('matches exact specifications for Shop pillar', () => {
      expect(BRANDING_ASSETS.shop.name).toBe('BoonTrack Shop');
      expect(BRANDING_ASSETS.shop.logo).toBe('/branding/shop/logo.png');
      expect(BRANDING_ASSETS.shop.favicon).toBe('/branding/shop/favicon.ico');
    });

    it('matches exact specifications for Studio pillar', () => {
      expect(BRANDING_ASSETS.studio.name).toBe('BoonTrack Studio');
      expect(BRANDING_ASSETS.studio.logo).toBe('/branding/studio/logo.png');
      expect(BRANDING_ASSETS.studio.favicon).toBe('/branding/studio/favicon.ico');
    });

    it('matches exact specifications for Creator pillar', () => {
      expect(BRANDING_ASSETS.creator.name).toBe('BoonTrack Creator');
      expect(BRANDING_ASSETS.creator.logo).toBe('/branding/creator/logo.png');
      expect(BRANDING_ASSETS.creator.favicon).toBe('/branding/creator/favicon.ico');
    });

    it('matches exact specifications for App Portal pillar', () => {
      expect(BRANDING_ASSETS.app.name).toBe('BoonTrack App Portal');
      expect(BRANDING_ASSETS.app.logo).toBe('/branding/app/logo-512.png');
      expect(BRANDING_ASSETS.app.favicon).toBe('/branding/app/favicon.ico');
    });

    it('resolves branding configs via helper function', () => {
      expect(getBrandingConfig('shop').name).toBe('BoonTrack Shop');
      expect(getBrandingConfig('studio').name).toBe('BoonTrack Studio');
      expect(getBrandingConfig('creator').name).toBe('BoonTrack Creator');
      expect(getBrandingConfig('app').name).toBe('BoonTrack App Portal');
    });
  });

  describe('2. Physical Asset File Existence', () => {
    const pillars = ['shop', 'studio', 'creator', 'app'] as const;

    pillars.forEach((p) => {
      it(`verifies physical branding folder and assets exist for ${p}`, () => {
        const pillarDir = path.join(publicDir, 'branding', p);
        expect(fs.existsSync(pillarDir)).toBe(true);

        const config = BRANDING_ASSETS[p];
        const logoFile = path.join(publicDir, config.logo.replace(/^\//, ''));
        const faviconFile = path.join(publicDir, config.favicon.replace(/^\//, ''));

        expect(fs.existsSync(logoFile)).toBe(true);
        expect(fs.existsSync(faviconFile)).toBe(true);
      });
    });
  });
});
