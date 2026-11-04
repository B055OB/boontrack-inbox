import fs from 'fs';
import path from 'path';

describe('BWM PWA Pipeline & Web Push RFC Specification', () => {
  const rootDir = process.cwd();
  const manifestPath = path.join(rootDir, 'workforce-web', 'public', 'workforce.webmanifest');
  const swPath = path.join(rootDir, 'workforce-web', 'public', 'sw-workforce.js');
  const pwaComponentPath = path.join(
    rootDir,
    'workforce-web',
    'app',
    'components',
    'PwaInstallPrompt.tsx'
  );

  // 1. Manifest Specification
  describe('1. Workforce Web App Manifest (workforce.webmanifest)', () => {
    test('1.1 manifest file exists and parses as valid JSON', () => {
      expect(fs.existsSync(manifestPath)).toBe(true);
      const content = fs.readFileSync(manifestPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    test('1.2 adheres strictly to CTO mandate metadata and icons', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest.id).toBe('/');
      expect(manifest.name).toBe('BoonTrack Workforce');
      expect(manifest.short_name).toBe('SATYA');
      expect(manifest.start_url).toBe('/');
      expect(manifest.scope).toBe('/');
      expect(manifest.display).toBe('standalone');
      expect(manifest.background_color).toBe('#ffffff');
      expect(manifest.theme_color).toBe('#991b1b');

      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

      const icon192 = manifest.icons.find((i: any) => i.sizes === '192x192');
      expect(icon192).toBeDefined();
      expect(icon192.src).toBe('/icons/workforce-192.png');

      const icon512 = manifest.icons.find((i: any) => i.sizes === '512x512' && !i.purpose);
      expect(icon512).toBeDefined();
      expect(icon512.src).toBe('/icons/workforce-512.png');

      const iconMaskable = manifest.icons.find(
        (i: any) => i.sizes === '512x512' && i.purpose === 'maskable'
      );
      expect(iconMaskable).toBeDefined();
      expect(iconMaskable.src).toBe('/icons/workforce-maskable-512.png');
    });

    test('1.3 physical icon files exist in workforce-web/public/icons/', () => {
      const icon192Path = path.join(rootDir, 'workforce-web', 'public', 'icons', 'workforce-192.png');
      const icon512Path = path.join(rootDir, 'workforce-web', 'public', 'icons', 'workforce-512.png');
      const iconMaskablePath = path.join(
        rootDir,
        'workforce-web',
        'public',
        'icons',
        'workforce-maskable-512.png'
      );

      expect(fs.existsSync(icon192Path)).toBe(true);
      expect(fs.existsSync(icon512Path)).toBe(true);
      expect(fs.existsSync(iconMaskablePath)).toBe(true);
    });
  });

  // 2. Service Worker Specification
  describe('2. Isolated Service Worker (sw-workforce.js)', () => {
    test('2.1 service worker file exists', () => {
      expect(fs.existsSync(swPath)).toBe(true);
    });

    test('2.2 complies with cache lifecycle skipWaiting() and clients.claim()', () => {
      const content = fs.readFileSync(swPath, 'utf-8');
      expect(content).toContain('satya-workforce-v1');
      expect(content).toContain('skipWaiting()');
      expect(content).toContain('clients.claim()');
    });

    test('2.3 strictly excludes API routes, auth, geolocation, and attendance/presence from cache', () => {
      const content = fs.readFileSync(swPath, 'utf-8');
      expect(content).toContain('/api/');
      expect(content).toContain('/auth/');
      expect(content).toContain('geolocation');
      expect(content).toContain('presence');
      expect(content).toContain('attendance');
      expect(content).toContain('checkpoint');
    });

    test('2.4 implements push and notificationclick event handlers according to Web Push RFC', () => {
      const content = fs.readFileSync(swPath, 'utf-8');
      expect(content).toContain("addEventListener('push'");
      expect(content).toContain('showNotification');
      expect(content).toContain("addEventListener('notificationclick'");
      expect(content).toContain('clients.matchAll');
    });
  });

  // 3. UI Component & iOS A2HS Guidance
  describe('3. PWA Install & iOS A2HS Component (PwaInstallPrompt.tsx)', () => {
    test('3.1 component file exists', () => {
      expect(fs.existsSync(pwaComponentPath)).toBe(true);
    });

    test('3.2 handles Android beforeinstallprompt and iOS 3-step guide', () => {
      const content = fs.readFileSync(pwaComponentPath, 'utf-8');
      expect(content).toContain('beforeinstallprompt');
      expect(content).toContain('prompt()');
      expect(content).toContain('Pasang Aplikasi SATYA');
      expect(content).toContain('Panduan Pasang di iPhone');
      expect(content).toContain('Tambahkan ke Layar Utama');
      expect(content).toContain('Notification.requestPermission()');
    });
  });
});

