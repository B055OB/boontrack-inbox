import fs from 'fs';
import path from 'path';

describe('Landing Page Navbar Logo Contrast Integrity', () => {
  it('ensures official dark-contrast logo asset exists in public folder', () => {
    const darkLogoPath = path.join(process.cwd(), 'public', 'logo-horizontal-dark.png');
    expect(fs.existsSync(darkLogoPath)).toBe(true);

    const stat = fs.statSync(darkLogoPath);
    expect(stat.size).toBeGreaterThan(10000); // Valid PNG file
  });

  it('ensures landing page navbar component references /logo-horizontal-dark.png instead of white logo', () => {
    const navbarFile = path.join(
      process.cwd(),
      'app',
      'preview',
      'new-lander-clean-ux',
      'components',
      'Navbar.tsx'
    );
    const content = fs.readFileSync(navbarFile, 'utf8');

    expect(content).toContain('src="/logo-horizontal-dark.png"');
    expect(content).not.toContain('src="/logo-horizontal.png"');
    expect(content).toContain('alt="BoonTrack"');
  });

  it('ensures public/og-shop.png exists and meets 1200x630 Open Graph specification', async () => {
    const ogPath = path.join(process.cwd(), 'public', 'og-shop.png');
    expect(fs.existsSync(ogPath)).toBe(true);

    const sharp = (await import('sharp')).default;
    const meta = await sharp(ogPath).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
    expect(meta.format).toBe('png');
  });

  it('ensures public/og-square.png exists and meets 500x500 square Open Graph specification', async () => {
    const ogSquarePath = path.join(process.cwd(), 'public', 'og-square.png');
    expect(fs.existsSync(ogSquarePath)).toBe(true);

    const sharp = (await import('sharp')).default;
    const meta = await sharp(ogSquarePath).metadata();
    expect(meta.width).toBe(500);
    expect(meta.height).toBe(500);
    expect(meta.format).toBe('png');
  });

  it('ensures tenant layout preserves isolated tenant-specific generateMetadata without being overwritten', () => {
    const tenantLayoutFile = path.join(process.cwd(), 'app', '[tenant]', 'layout.tsx');
    const content = fs.readFileSync(tenantLayoutFile, 'utf8');

    // Tenant layout must have its own generateMetadata
    expect(content).toContain('export async function generateMetadata');
    // Must derive from tenant store data
    expect(content).toContain('getTenantStoreData(cleanTenant)');
    // Must respect tenant branding hierarchy
    expect(content).toContain('metaObj.banner_url');
    expect(content).toContain('metaObj.logo_url');
  });
});
