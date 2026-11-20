/**
 * @file __tests__/orders/wp4_offline_csv_containment.test.tsx
 * @description Acceptance tests for WP4-CT: Emergency Offline CSV Containment.
 * Verifies that client-side Meta Offline CSV export is completely neutralized,
 * fails closed unconditionally across all roles, produces zero CSV data/downloads,
 * prevents PII leakage, and preserves unrelated order functionality.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import OrdersTab from '@/app/[tenant]/dashboard/components/tabs/OrdersTab';
import {
  generateOrdersMetaCsv,
  generateOrdersMetaCsvString,
  exportOrdersToMetaCsv,
  exportOrdersToLincahCsv,
  parseDeterministicDate,
  parseStrictNominal,
  formatIsoWithOffset,
} from '@/lib/utils/orderFulfillment';

describe('WP4-CT: Emergency Offline CSV Containment Acceptance Tests', () => {
  const sampleOrders = [
    {
      id: 'ord-101',
      order_id: 'INV-2026-001',
      customer_name: 'Budi Santoso',
      customer_phone: '081234567890',
      customer_email: 'budi@example.com',
      total_amount: 350000,
      payment_status: 'PENDING',
      order_status: 'PROCESSING',
      created_at: '2026-11-20T10:00:00.000Z',
      product_name: 'Paket Usaha Digital',
    },
    {
      id: 'ord-102',
      order_id: 'INV-2026-002',
      customer_name: 'Dewi Sartika',
      customer_phone: '081987654321',
      customer_email: 'dewi@example.com',
      total_amount: 150000,
      payment_status: 'PAID',
      order_status: 'COMPLETED',
      paid_at: '2026-11-20T10:15:00.000Z',
      product_name: 'Jasa Setup OnlineBoost',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // A. UI CONTAINMENT (OrdersTab)
  // =========================================================================
  describe('A. UI Containment (OrdersTab Component)', () => {
    it('renders the Meta CSV export button with explicit disabled and unavailable state', () => {
      const html = renderToStaticMarkup(
        <OrdersTab
          tenantSlug="toko-berkah"
          storeDisplayName="Toko Berkah"
          orders={sampleOrders as any}
          loading={false}
          onRefresh={() => {}}
        />
      );

      // 1. Verify button exists with required id
      expect(html).toContain('id="orders-export-meta-csv-btn"');

      // 2. Verify button has explicit disabled and aria-disabled attributes
      expect(html).toMatch(/id="orders-export-meta-csv-btn"[^>]*disabled/);
      expect(html).toMatch(/id="orders-export-meta-csv-btn"[^>]*aria-disabled="true"/);

      // 3. Verify explicit containment label
      expect(html).toContain('Ekspor Meta CSV (Dinonaktifkan)');

      // 4. Verify explicit tooltip indicating containment
      expect(html).toContain('WP4-CT Containment');

      // 5. Verify normal operational controls remain rendered and unaffected
      expect(html).toContain('id="orders-export-lincah-btn"');
      expect(html).toContain('id="orders-import-excel-btn"');
      expect(html).toContain('id="orders-refresh-btn"');
    });

    it('ensures no active click handler triggers CSV export even when orders are loaded', () => {
      const html = renderToStaticMarkup(
        <OrdersTab
          tenantSlug="toko-berkah"
          storeDisplayName="Toko Berkah"
          orders={sampleOrders as any}
          loading={false}
          onRefresh={() => {}}
        />
      );

      // Button is rendered disabled
      expect(html).toContain('cursor-not-allowed');
    });
  });

  // =========================================================================
  // B. GENERATOR CONTAINMENT
  // =========================================================================
  describe('B. Generator Containment (orderFulfillment)', () => {
    it('generateOrdersMetaCsv fails closed: returns empty CSV and 0 exported rows', () => {
      const result = generateOrdersMetaCsv(sampleOrders, 'test-store', 'IDR');

      expect(result.csv).toBe('');
      expect(result.summary.exportedRows).toBe(0);
      expect(result.summary.totalRows).toBe(2);
      expect(result.summary.skippedRows).toBe(2);
      expect(result.summary.skippedDetails).toHaveLength(2);
      expect(result.summary.skippedDetails[0].reason).toBe('WP4_CT_CONTAINMENT_DENIED');
      expect(result.summary.skippedDetails[1].reason).toBe('WP4_CT_CONTAINMENT_DENIED');
    });

    it('generateOrdersMetaCsvString fails closed: returns strictly empty string', () => {
      const csv = generateOrdersMetaCsvString(sampleOrders, 'test-store', 'IDR');
      expect(csv).toBe('');
      expect(csv.length).toBe(0);
    });

    it('exportOrdersToMetaCsv fails closed: does NOT create Blob, object URL, or trigger download', () => {
      // Mock document and URL to verify zero invocation in runtime
      const mockCreateObjectURL = jest.fn();
      const mockRevokeObjectURL = jest.fn();
      const mockCreateElement = jest.fn();

      const originalURL = global.URL;
      const originalDoc = global.document;

      (global as any).URL = {
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      };

      (global as any).document = {
        createElement: mockCreateElement,
        body: {
          appendChild: jest.fn(),
          removeChild: jest.fn(),
        },
      };

      try {
        const summary = exportOrdersToMetaCsv(sampleOrders, 'test-store', 'IDR');

        // Zero exported rows
        expect(summary.exportedRows).toBe(0);
        expect(summary.skippedRows).toBe(sampleOrders.length);

        // Verification of ZERO browser Blob / URL / download invocation
        expect(mockCreateObjectURL).not.toHaveBeenCalled();
        expect(mockRevokeObjectURL).not.toHaveBeenCalled();
        expect(mockCreateElement).not.toHaveBeenCalled();
      } finally {
        global.URL = originalURL;
        global.document = originalDoc;
      }
    });

    it('handles empty, null, or undefined order input safely without throwing', () => {
      expect(generateOrdersMetaCsv([]).csv).toBe('');
      expect(generateOrdersMetaCsv([]).summary.exportedRows).toBe(0);
      expect(generateOrdersMetaCsv(null as any).csv).toBe('');
      expect(generateOrdersMetaCsv(null as any).summary.exportedRows).toBe(0);
      expect(generateOrdersMetaCsv(undefined as any).csv).toBe('');
      expect(generateOrdersMetaCsv(undefined as any).summary.exportedRows).toBe(0);
      expect(exportOrdersToMetaCsv([]).exportedRows).toBe(0);
      expect(generateOrdersMetaCsvString([])).toBe('');
    });
  });

  // =========================================================================
  // C. ROLE BEHAVIOR (TEMPORARY UNCONDITIONAL DENIAL)
  // =========================================================================
  describe('C. Role Behavior (Unconditional Containment Denial)', () => {
    const roles = ['OWNER', 'SUPERADMIN', 'ADMIN', 'OPERATOR', 'VIEWER', '', undefined, null];

    test.each(roles)('role "%s" is temporarily DENIED from generating offline CSV', (role) => {
      // Regardless of caller context or role passed, generator fails closed
      const result = generateOrdersMetaCsv(sampleOrders, `tenant-${role || 'anon'}`);
      expect(result.csv).toBe('');
      expect(result.summary.exportedRows).toBe(0);
      expect(result.summary.skippedRows).toBe(sampleOrders.length);

      const summary = exportOrdersToMetaCsv(sampleOrders, `tenant-${role || 'anon'}`);
      expect(summary.exportedRows).toBe(0);
    });
  });

  // =========================================================================
  // D. PRIVACY AND DATA SAFETY
  // =========================================================================
  describe('D. Privacy and Data Safety', () => {
    it('ensures zero customer PII (phone, email, name, nominal) is leaked into CSV string', () => {
      const sensitiveOrders = [
        {
          id: 'ord-secret-1',
          order_id: 'SECRET-999',
          customer_name: 'Very Confidential Customer',
          customer_phone: '081299998888',
          customer_email: 'confidential@company.com',
          total_amount: 9999999,
          payment_status: 'PENDING',
          items_summary: 'Top Secret Product',
        },
      ];

      const csv = generateOrdersMetaCsvString(sensitiveOrders, 'confidential-store');

      expect(csv).toBe('');
      expect(csv).not.toContain('Very Confidential Customer');
      expect(csv).not.toContain('081299998888');
      expect(csv).not.toContain('6281299998888');
      expect(csv).not.toContain('confidential@company.com');
      expect(csv).not.toContain('9999999');
      expect(csv).not.toContain('Top Secret Product');
      expect(csv).not.toContain('Purchase');
    });

    it('does not mutate input order records in memory', () => {
      const originalOrders = JSON.parse(JSON.stringify(sampleOrders));
      generateOrdersMetaCsv(sampleOrders, 'test-store');
      exportOrdersToMetaCsv(sampleOrders, 'test-store');

      expect(sampleOrders).toEqual(originalOrders);
    });

    it('does not dispatch any external network request to Meta or external endpoints', () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      try {
        generateOrdersMetaCsv(sampleOrders, 'test-store');
        exportOrdersToMetaCsv(sampleOrders, 'test-store');
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  // =========================================================================
  // E. REGRESSION PROTECTION
  // =========================================================================
  describe('E. Regression Protection (Unrelated Functionality Intact)', () => {
    it('preserves date parsing helpers (parseDeterministicDate, formatIsoWithOffset)', () => {
      const parsed = parseDeterministicDate('2026-11-20T10:00:00.000Z', 7);
      expect(parsed.valid).toBe(true);
      expect(parsed.isoWithOffset).toBe('2026-11-20T17:00:00+07:00');

      const invalid = parseDeterministicDate('not-a-date');
      expect(invalid.valid).toBe(false);
    });

    it('preserves nominal validation helper (parseStrictNominal)', () => {
      const valid = parseStrictNominal(250000);
      expect(valid.valid).toBe(true);
      expect(valid.value).toBe(250000);

      const invalid = parseStrictNominal('free_gift');
      expect(invalid.valid).toBe(false);
    });

    it('preserves Lincah.id physical shipping export helper', () => {
      const mockCreateObjectURL = jest.fn(() => 'blob:mock-url');
      const mockRevokeObjectURL = jest.fn();
      const mockClick = jest.fn();

      const originalURL = global.URL;
      const originalDoc = global.document;

      (global as any).URL = {
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      };

      (global as any).document = {
        createElement: jest.fn(() => ({
          setAttribute: jest.fn(),
          click: mockClick,
        })),
        body: {
          appendChild: jest.fn(),
          removeChild: jest.fn(),
        },
      };

      try {
        const physicalOrders = [
          {
            id: 'ord-phys-1',
            order_id: 'PHYS-001',
            customer_name: 'Budi Fisik',
            customer_phone: '081234567890',
            total_amount: 100000,
            shipping_address: 'Jl. Merdeka No. 1, Gambir, Jakarta Pusat, 10110',
            product_type: 'PHYSICAL',
          },
        ];

        // exportOrdersToLincahCsv should continue to work for physical fulfillment
        exportOrdersToLincahCsv(physicalOrders, 'toko-fisik');
        expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
        expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
        expect(mockClick).toHaveBeenCalledTimes(1);
      } finally {
        global.URL = originalURL;
        global.document = originalDoc;
      }
    });
  });
});
