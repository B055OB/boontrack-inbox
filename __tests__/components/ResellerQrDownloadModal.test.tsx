/**
 * __tests__/components/ResellerQrDownloadModal.test.tsx
 *
 * Component Unit Test Suite for ResellerQrDownloadModal.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResellerQrDownloadModal } from '@/components/reseller/ResellerQrDownloadModal';

describe('ResellerQrDownloadModal Component Suite', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    resellerName: 'Reva Cantika',
    referralCode: 'REVA10',
    referralUrl: 'https://shop.boontrack.com/shabu-ajhi?r=REVA10',
    tenantSlug: 'shabu-ajhi',
    resellerPhone: '089617799878',
    storeName: 'Shabu Ajhi Catering',
  };

  describe('1. Modal Visibility & Guard Conditions', () => {
    it('should not render anything when isOpen is false', () => {
      const html = renderToStaticMarkup(
        <ResellerQrDownloadModal {...defaultProps} isOpen={false} />
      );
      expect(html).toBe('');
    });

    it('should render modal container with proper role when isOpen is true', () => {
      const html = renderToStaticMarkup(
        <ResellerQrDownloadModal {...defaultProps} isOpen={true} />
      );
      expect(html).toContain('data-testid="reseller-qr-modal"');
      expect(html).toContain('Barcode / QR Promosi Reseller');
      expect(html).toContain('Reva Cantika');
      expect(html).toContain('REVA10');
    });
  });

  describe('2. Header, Labels & Action Buttons', () => {
    it('should render header with reseller name and referral code', () => {
      const html = renderToStaticMarkup(
        <ResellerQrDownloadModal {...defaultProps} />
      );

      expect(html).toContain('Mitra:');
      expect(html).toContain('Reva Cantika');
      expect(html).toContain('(REVA10)');
      expect(html).toContain('data-testid="btn-close-modal"');
    });

    it('should render all three primary and secondary action buttons', () => {
      const html = renderToStaticMarkup(
        <ResellerQrDownloadModal {...defaultProps} />
      );

      // Primary: Download PNG
      expect(html).toContain('data-testid="btn-download-qr"');
      expect(html).toContain('Download Gambar QR (PNG 512px)');

      // Secondary 1: Salin Link
      expect(html).toContain('data-testid="btn-copy-link"');
      expect(html).toContain('Salin Link');

      // Secondary 2: Kirim WA
      expect(html).toContain('data-testid="btn-send-whatsapp"');
      expect(html).toContain('Kirim WA');
    });

    it('should display loading placeholder indicator during initial SSR render', () => {
      const html = renderToStaticMarkup(
        <ResellerQrDownloadModal {...defaultProps} />
      );

      // In initial SSR render before useEffect completes, loading indicator is rendered
      expect(html).toContain('data-testid="qr-loading-indicator"');
      expect(html).toContain('Membuat barcode resolusi tinggi...');
    });
  });
});
