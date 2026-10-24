/**
 * @file __tests__/orders/meta_csv_export_modal.test.tsx
 * @description UI Component tests for MetaCsvExportSummaryModal.
 * Validates modal rendering, metric cards, partial skip summary banner,
 * explicit empty-state error handling (0 rows exported), and skipped row detail tables.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MetaCsvExportSummaryModal } from '@/app/[tenant]/dashboard/components/MetaCsvExportSummaryModal';
import { generateOrdersMetaCsv, MetaCsvExportSummary } from '@/lib/utils/orderFulfillment';

describe('MetaCsvExportSummaryModal UI Component Tests', () => {
  describe('Visibility and Guard Conditions', () => {
    it('should not render anything when isOpen is false', () => {
      const summary: MetaCsvExportSummary = {
        totalRows: 5,
        exportedRows: 5,
        skippedRows: 0,
        skippedDetails: [],
      };

      const html = renderToStaticMarkup(
        <MetaCsvExportSummaryModal isOpen={false} onClose={() => {}} summary={summary} />
      );

      expect(html).toBe('');
    });

    it('should not render anything when summary is null', () => {
      const html = renderToStaticMarkup(
        <MetaCsvExportSummaryModal isOpen={true} onClose={() => {}} summary={null} />
      );

      expect(html).toBe('');
    });
  });

  describe('Mixed Valid & Invalid Rows (Partial Export State)', () => {
    const mixedSummary: MetaCsvExportSummary = {
      totalRows: 5,
      exportedRows: 3,
      skippedRows: 2,
      skippedDetails: [
        {
          orderId: 'ORD-INVALID-DATE-001',
          reason: 'invalid_date',
          message: 'Tanggal pesanan tidak valid: "invalid-date-string". Fallback waktu saat ini dilarang keras.',
          rawDate: 'invalid-date-string',
        },
        {
          orderId: 'ORD-INVALID-AMOUNT-002',
          reason: 'invalid_amount',
          message: 'Nominal pesanan tidak valid: "-50000". Nominal harus berupa angka positif.',
          rawValue: '-50000',
        },
      ],
    };

    it('renders the modal with metric cards for total, exported, and skipped', () => {
      const html = renderToStaticMarkup(
        <MetaCsvExportSummaryModal isOpen={true} onClose={() => {}} summary={mixedSummary} />
      );

      // Modal container
      expect(html).toContain('id="meta-csv-export-summary-modal"');
      expect(html).toContain('Rekapitulasi Ekspor Meta CSV');
      expect(html).toContain('Perhatian: Ada Data Dilewati');

      // Metric cards
      expect(html).toContain('id="summary-total-processed"');
      expect(html).toContain('>5<');
      expect(html).toContain('id="summary-total-exported"');
      expect(html).toContain('>3<');
      expect(html).toContain('id="summary-total-skipped"');
      expect(html).toContain('>2<');
    });

    it('displays the partial success alert banner and does NOT display empty state error', () => {
      const html = renderToStaticMarkup(
        <MetaCsvExportSummaryModal isOpen={true} onClose={() => {}} summary={mixedSummary} />
      );

      expect(html).toContain('id="export-summary-partial-state"');
      expect(html).toContain('Unduhan CSV Selesai dengan Catatan');
      expect(html).toContain('3 pesanan valid');
      expect(html).toContain('2 pesanan');

      // Should NOT render empty state error or full success
      expect(html).not.toContain('id="export-summary-empty-state"');
      expect(html).not.toContain('id="export-summary-full-success"');
    });

    it('renders skipped details table with order IDs, problem categories, and reason badges', () => {
      const html = renderToStaticMarkup(
        <MetaCsvExportSummaryModal isOpen={true} onClose={() => {}} summary={mixedSummary} />
      );

      expect(html).toContain('id="export-summary-skipped-table"');
      expect(html).toContain('Rincian Baris yang Dilewati (2)');

      // Check Order IDs
      expect(html).toContain('ORD-INVALID-DATE-001');
      expect(html).toContain('ORD-INVALID-AMOUNT-002');

      // Check badges & messages
      expect(html).toContain('Tanggal Tidak Valid');
      expect(html).toContain('Nominal Tidak Valid');
      expect(html).toContain('Fallback waktu saat ini dilarang keras');
      expect(html).toContain('Nilai mentah: invalid-date-string');
      expect(html).toContain('Nilai mentah: -50000');
    });

    it('renders "Selesai" close button for partial export', () => {
      const html = renderToStaticMarkup(
        <MetaCsvExportSummaryModal isOpen={true} onClose={() => {}} summary={mixedSummary} />
      );

      expect(html).toContain('id="export-summary-close-btn"');
      expect(html).toContain('Selesai');
    });
  });

  describe('Penanganan Empty State (0 Berhasil Diekspor)', () => {
    const zeroExportSummary: MetaCsvExportSummary = {
      totalRows: 3,
      exportedRows: 0,
      skippedRows: 3,
      skippedDetails: [
        {
          orderId: 'ORD-FAIL-1',
          reason: 'invalid_date',
          message: 'Tanggal pesanan tidak valid: "corrupted_timestamp". Fallback waktu saat ini dilarang keras.',
          rawDate: 'corrupted_timestamp',
        },
        {
          orderId: 'ORD-FAIL-2',
          reason: 'missing_date',
          message: 'Tanggal pesanan kosong/undefined. Baris ditolak.',
        },
        {
          orderId: 'ORD-FAIL-3',
          reason: 'invalid_amount',
          message: 'Nominal pesanan tidak valid: "0". Nominal harus berupa angka positif.',
          rawValue: 0,
        },
      ],
    };

    it('displays explicit error banner when 0 rows are exported', () => {
      const html = renderToStaticMarkup(
        <MetaCsvExportSummaryModal isOpen={true} onClose={() => {}} summary={zeroExportSummary} />
      );

      // Status in header
      expect(html).toContain('Ekspor Gagal');

      // Metric cards reflect 0 exported
      expect(html).toContain('id="summary-total-processed"');
      expect(html).toContain('>3<');
      expect(html).toContain('id="summary-total-exported"');
      expect(html).toContain('>0<');
      expect(html).toContain('id="summary-total-skipped"');
      expect(html).toContain('>3<');

      // Explicit empty-state error banner
      expect(html).toContain('id="export-summary-empty-state"');
      expect(html).toContain('Ekspor Gagal: Tidak Ada Data Valid yang Dapat Diekspor');
      expect(html).toContain('Unduhan CSV tidak dijalankan');
      expect(html).toContain('mencegah pengiriman data sampah ke Meta Ads Manager');

      // Should NOT render partial or full success
      expect(html).not.toContain('id="export-summary-partial-state"');
      expect(html).not.toContain('id="export-summary-full-success"');
    });

    it('renders "Tutup &amp; Periksa Data" button in empty state footer', () => {
      const html = renderToStaticMarkup(
        <MetaCsvExportSummaryModal isOpen={true} onClose={() => {}} summary={zeroExportSummary} />
      );

      expect(html).toContain('id="export-summary-close-btn"');
      expect(html).toContain('Tutup &amp; Periksa Data');
    });

    it('renders complete breakdown of skipped rows in empty state so operator can fix the data', () => {
      const html = renderToStaticMarkup(
        <MetaCsvExportSummaryModal isOpen={true} onClose={() => {}} summary={zeroExportSummary} />
      );

      expect(html).toContain('id="export-summary-skipped-table"');
      expect(html).toContain('ORD-FAIL-1');
      expect(html).toContain('ORD-FAIL-2');
      expect(html).toContain('ORD-FAIL-3');
      expect(html).toContain('Tanggal Tidak Valid');
      expect(html).toContain('Tanggal Kosong');
      expect(html).toContain('Nominal Tidak Valid');
    });

    it('handles empty state cleanly when totalRows is 0', () => {
      const emptyDatasetSummary: MetaCsvExportSummary = {
        totalRows: 0,
        exportedRows: 0,
        skippedRows: 0,
        skippedDetails: [],
      };

      const html = renderToStaticMarkup(
        <MetaCsvExportSummaryModal isOpen={true} onClose={() => {}} summary={emptyDatasetSummary} />
      );

      expect(html).toContain('id="export-summary-empty-state"');
      expect(html).toContain('Tidak ada data pesanan yang dipilih atau ditemukan untuk diekspor');
      expect(html).not.toContain('id="export-summary-skipped-table"');
    });
  });

  describe('Full Success State (100% Exported)', () => {
    const fullSuccessSummary: MetaCsvExportSummary = {
      totalRows: 4,
      exportedRows: 4,
      skippedRows: 0,
      skippedDetails: [],
    };

    it('displays 100% Berhasil banner and does not render skipped table', () => {
      const html = renderToStaticMarkup(
        <MetaCsvExportSummaryModal isOpen={true} onClose={() => {}} summary={fullSuccessSummary} />
      );

      expect(html).toContain('100% Berhasil');
      expect(html).toContain('id="export-summary-full-success"');
      expect(html).toContain('Unduhan CSV Berhasil Sempurna');
      expect(html).toContain('Seluruh <strong>4 pesanan</strong> valid');

      // No skipped table
      expect(html).not.toContain('id="export-summary-skipped-table"');
      expect(html).not.toContain('id="export-summary-empty-state"');
      expect(html).not.toContain('id="export-summary-partial-state"');
    });
  });

  describe('End-to-End Service to UI Integration', () => {
    it('correctly maps output from generateOrdersMetaCsv with mixed valid and invalid orders', () => {
      const mixedOrders = [
        {
          id: 'ORD-SUCCESS-1',
          created_at: '2026-10-24T12:00:00+07:00',
          total_amount: 150000,
          customer_name: 'Budi Santoso',
          customer_phone: '081234567890',
        },
        {
          id: 'ORD-INVALID-DATE',
          created_at: 'bad-date-format',
          total_amount: 250000,
        },
        {
          id: 'ORD-INVALID-AMOUNT',
          created_at: '2026-10-24T13:00:00+07:00',
          total_amount: 'invalid_price',
        },
      ];

      const { summary } = generateOrdersMetaCsv(mixedOrders, 'toko-berkah', 'IDR');

      expect(summary.totalRows).toBe(3);
      expect(summary.exportedRows).toBe(1);
      expect(summary.skippedRows).toBe(2);

      // Render Modal with this actual summary
      const html = renderToStaticMarkup(
        <MetaCsvExportSummaryModal isOpen={true} onClose={() => {}} summary={summary} />
      );

      expect(html).toContain('Perhatian: Ada Data Dilewati');
      expect(html).toContain('id="export-summary-partial-state"');
      expect(html).toContain('ORD-INVALID-DATE');
      expect(html).toContain('ORD-INVALID-AMOUNT');
      expect(html).not.toContain('ORD-SUCCESS-1'); // Valid orders are exported, not in skipped table
    });

    it('correctly renders empty-state error when all orders fed to generateOrdersMetaCsv are rejected', () => {
      const invalidOrders = [
        {
          id: 'ORD-ALL-BAD-1',
          created_at: 'invalid-time',
          total_amount: 100000,
        },
        {
          id: 'ORD-ALL-BAD-2',
          created_at: '2026-10-24T10:00:00Z',
          total_amount: 0, // 0 is invalid for Meta purchase event
        },
      ];

      const { summary } = generateOrdersMetaCsv(invalidOrders, 'toko-berkah', 'IDR');

      expect(summary.totalRows).toBe(2);
      expect(summary.exportedRows).toBe(0);
      expect(summary.skippedRows).toBe(2);

      // Render Modal with this 100% rejected summary
      const html = renderToStaticMarkup(
        <MetaCsvExportSummaryModal isOpen={true} onClose={() => {}} summary={summary} />
      );

      expect(html).toContain('id="export-summary-empty-state"');
      expect(html).toContain('Ekspor Gagal: Tidak Ada Data Valid yang Dapat Diekspor');
      expect(html).toContain('Unduhan CSV tidak dijalankan');
      expect(html).toContain('Tutup &amp; Periksa Data');
      expect(html).toContain('ORD-ALL-BAD-1');
      expect(html).toContain('ORD-ALL-BAD-2');
    });
  });
});
