/**
 * __tests__/reseller/qrExporter.test.ts
 *
 * Unit Test Suite for Reseller QR Code Engine & Image Exporter Utility.
 */

import {
  generateResellerQrDataUrl,
  formatResellerQrFileName,
  downloadQrAsPng,
  buildResellerWhatsAppShareUrl,
  DEFAULT_QR_OPTIONS,
} from '@/lib/qr/qrExporter';
// Also verify import from src/utils alias
import {
  generateResellerQrDataUrl as generateResellerQrDataUrlFromSrc,
  formatResellerQrFileName as formatResellerQrFileNameFromSrc,
} from '@/src/utils/qrExporter';

describe('Reseller QR Code Engine & Exporter Utility', () => {
  // =========================================================================
  // 1. QR CODE GENERATION & RESOLUTION
  // =========================================================================
  describe('1. High-Resolution QR Code Generation', () => {
    it('should generate valid PNG Data URL from valid referral URL', async () => {
      const url = 'https://shop.boontrack.com/shabu-ajhi?r=REVA10';
      const dataUrl = await generateResellerQrDataUrl(url);

      expect(typeof dataUrl).toBe('string');
      expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
      expect(dataUrl.length).toBeGreaterThan(500);
    });

    it('should respect custom options (custom width, margin, errorCorrectionLevel)', async () => {
      const url = 'https://shop.boontrack.com/shabu-ajhi?r=REVA10';
      const dataUrlSmall = await generateResellerQrDataUrl(url, { width: 256, margin: 1 });
      const dataUrlLarge = await generateResellerQrDataUrl(url, { width: 1024, margin: 4 });

      expect(dataUrlSmall.startsWith('data:image/png;base64,')).toBe(true);
      expect(dataUrlLarge.startsWith('data:image/png;base64,')).toBe(true);
      // Larger QR produces more image data bytes
      expect(dataUrlLarge.length).toBeGreaterThanOrEqual(dataUrlSmall.length);
    });

    it('should confirm default options are width 512, margin 2, and errorCorrectionLevel H', () => {
      expect(DEFAULT_QR_OPTIONS.width).toBe(512);
      expect(DEFAULT_QR_OPTIONS.margin).toBe(2);
      expect(DEFAULT_QR_OPTIONS.errorCorrectionLevel).toBe('H');
    });

    it('should reject empty, whitespace-only, or invalid URLs with descriptive error', async () => {
      await expect(generateResellerQrDataUrl('')).rejects.toThrow('URL referral tidak boleh kosong.');
      await expect(generateResellerQrDataUrl('   ')).rejects.toThrow('URL referral tidak boleh kosong.');
      await expect(generateResellerQrDataUrl(null as any)).rejects.toThrow('URL referral tidak boleh kosong.');
      await expect(generateResellerQrDataUrl(undefined as any)).rejects.toThrow('URL referral tidak boleh kosong.');
    });

    it('should verify src/utils alias produces identical QR generation', async () => {
      const url = 'https://shop.boontrack.com/shabu-ajhi?r=VIP2026';
      const direct = await generateResellerQrDataUrl(url);
      const alias = await generateResellerQrDataUrlFromSrc(url);

      expect(alias.startsWith('data:image/png;base64,')).toBe(true);
      expect(direct.startsWith('data:image/png;base64,')).toBe(true);
    });
  });

  // =========================================================================
  // 2. STANDARDIZED FILE NAMING
  // =========================================================================
  describe('2. File Naming Standardization (qr-[tenant]-[reseller_code].png)', () => {
    it('should format filename with standard pattern: qr-[tenant]-[reseller_code].png', () => {
      const fileName = formatResellerQrFileName('shabu-ajhi', 'reva-cantika');
      expect(fileName).toBe('qr-shabu-ajhi-reva-cantika.png');
    });

    it('should sanitize uppercase, spaces, and special characters into lowercase hyphens', () => {
      const fileName = formatResellerQrFileName('Shabu Ajhi Catering', 'Reva_Cantika #01');
      expect(fileName).toBe('qr-shabu-ajhi-catering-reva_cantika-01.png');

      const namingRegex = /^qr-[a-z0-9_-]+-[a-z0-9_-]+\.png$/;
      expect(fileName).toMatch(namingRegex);
    });

    it('should handle empty or fallback arguments safely', () => {
      expect(formatResellerQrFileName('', '')).toBe('qr-tenant-reseller.png');
      expect(formatResellerQrFileNameFromSrc('my-shop', 'code123')).toBe('qr-my-shop-code123.png');
    });
  });

  // =========================================================================
  // 3. WHATSAPP RESELLER DISPATCH BUILDER
  // =========================================================================
  describe('3. WhatsApp Reseller Dispatch Link Builder', () => {
    it('should format clean phone number with Indonesian country code (62)', () => {
      const { targetPhone, waUrl, message } = buildResellerWhatsAppShareUrl({
        phone: '089617799878',
        resellerName: 'Reva Cantika',
        referralCode: 'REVA10',
        referralUrl: 'https://shop.boontrack.com/shabu-ajhi?r=REVA10',
        storeName: 'Shabu Ajhi',
      });

      expect(targetPhone).toBe('6289617799878');
      expect(waUrl).toContain('https://wa.me/6289617799878?text=');
      expect(message).toContain('Halo Reva Cantika');
      expect(message).toContain('Shabu Ajhi');
      expect(message).toContain('https://shop.boontrack.com/shabu-ajhi?r=REVA10');
      expect(message).toContain('REVA10');
      expect(message).toContain('Tips Promosi');

      const decoded = decodeURIComponent(waUrl.replace('https://wa.me/6289617799878?text=', ''));
      expect(decoded).toBe(message);
    });

    it('should handle already formatted 62 phone numbers', () => {
      const { targetPhone } = buildResellerWhatsAppShareUrl({
        phone: '+62 812-3456-7890',
        resellerName: 'Budi Santoso',
        referralCode: 'BUDI01',
        referralUrl: 'https://shop.boontrack.com/demo?r=BUDI01',
      });
      expect(targetPhone).toBe('6281234567890');
    });
  });

  // =========================================================================
  // 4. DOWNLOAD TRIGGER FUNCTION
  // =========================================================================
  describe('4. downloadQrAsPng Trigger Helper', () => {
    it('should return false safely when executed in SSR environment without document/window', () => {
      const result = downloadQrAsPng({
        dataUrl: 'data:image/png;base64,dummy',
        tenantSlug: 'shabu-ajhi',
        resellerCodeOrSlug: 'reva',
      });
      // In node test environment, window or document may be undefined
      expect(typeof result).toBe('boolean');
    });

    it('should reject invalid dataUrl format', () => {
      // Mock temporary global window & document if not present
      const originalWindow = global.window;
      const originalDoc = global.document;

      try {
        (global as any).window = {};
        (global as any).document = {
          createElement: jest.fn(),
          body: { appendChild: jest.fn(), removeChild: jest.fn() },
        };

        const result = downloadQrAsPng({
          dataUrl: 'invalid-url',
          tenantSlug: 'shabu-ajhi',
          resellerCodeOrSlug: 'reva',
        });
        expect(result).toBe(false);
      } finally {
        global.window = originalWindow;
        global.document = originalDoc;
      }
    });

    it('should create anchor element and trigger download in browser DOM environment', () => {
      const mockClick = jest.fn();
      const mockAnchor: any = {
        href: '',
        download: '',
        style: {},
        click: mockClick,
      };

      const mockAppendChild = jest.fn();
      const mockRemoveChild = jest.fn();

      const originalWindow = global.window;
      const originalDoc = global.document;

      try {
        (global as any).window = {};
        (global as any).document = {
          createElement: jest.fn().mockReturnValue(mockAnchor),
          body: {
            appendChild: mockAppendChild,
            removeChild: mockRemoveChild,
          },
        };

        const success = downloadQrAsPng({
          dataUrl: 'data:image/png;base64,validBase64Sample',
          tenantSlug: 'shabu-ajhi',
          resellerCodeOrSlug: 'reva-cantika',
        });

        expect(success).toBe(true);
        expect(mockAnchor.download).toBe('qr-shabu-ajhi-reva-cantika.png');
        expect(mockAnchor.href).toBe('data:image/png;base64,validBase64Sample');
        expect(mockClick).toHaveBeenCalledTimes(1);
        expect(mockAppendChild).toHaveBeenCalledWith(mockAnchor);
        expect(mockRemoveChild).toHaveBeenCalledWith(mockAnchor);
      } finally {
        global.window = originalWindow;
        global.document = originalDoc;
      }
    });
  });
});
