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
});
