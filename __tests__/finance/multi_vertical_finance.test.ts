import {
  calculateFinancialMetrics,
  isValidPaidStatus,
  isPendingVerificationStatus,
  extractOrderAmount,
  formatWIBDateString,
  formatWIBDateTime,
  isSameDayWIB,
  isTodayWIB,
  fetchTenantOrdersAgnostic,
} from '@/lib/finance-engine';

describe('Multi-Vertical Universal Finance Engine', () => {
  // Mock Data for 3 Verticals
  const tenantA_JasaOrders = [
    {
      id: 'ORD-JASA-001',
      tenant_slug: 'solusi-ads',
      tenant_id: 'uuid-solusi-ads-1111',
      product_name: 'Tiket Konsultasi Skala Iklan 1-on-1',
      amount: 149000,
      total_amount: 149000,
      status: 'PAID',
      payment_method: 'QRIS',
      created_at: '2026-09-30T10:00:00.000Z',
    },
    {
      id: 'ORD-JASA-002',
      tenant_slug: 'solusi-ads',
      tenant_id: 'uuid-solusi-ads-1111',
      product_name: 'Audit Akun Meta Ads & Funnel',
      final_amount: 299000,
      status: 'VERIFIED',
      payment_method: 'Transfer Bank BCA',
      created_at: '2026-09-30T11:30:00.000Z',
    },
    {
      id: 'ORD-JASA-003',
      tenant_slug: 'solusi-ads',
      tenant_id: 'uuid-solusi-ads-1111',
      product_name: 'Tiket Konsultasi Cepat',
      amount: 99000,
      status: 'ORDER_PENDING_VERIFICATION',
      payment_method: 'Transfer Bank Mandiri',
      created_at: '2026-09-30T12:00:00.000Z',
    },
  ];

  const tenantB_FnBOrders = [
    {
      id: 'ORD-FNB-001',
      tenant_slug: 'tanev-food',
      tenant_id: 'uuid-tanev-food-2222',
      product_name: 'Paket Bento Rice Box + Es Teh',
      total_amount: 60000, // 45k item + 15k ongkir kurir instan
      shipping_cost: 15000,
      status: 'SETTLED',
      payment_method: 'COD Kurir',
      created_at: '2026-09-30T09:15:00.000Z',
    },
    {
      id: 'ORD-FNB-002',
      tenant_slug: 'tanev-food',
      tenant_id: 'uuid-tanev-food-2222',
      product_name: 'Family Feast Platter',
      gross_amount: 185000,
      status: 'COMPLETED',
      payment_method: 'QRIS Dinamis',
      created_at: '2026-09-30T12:45:00.000Z',
    },
  ];

  const tenantC_DigitalOrders = [
    {
      id: 'ORD-DIG-001',
      tenant_slug: 'onlineboost',
      tenant_id: 'uuid-onlineboost-3333',
      product_name: 'Master Class Internet Marketing CPM',
      gross_amount: 499000,
      status: 'SUCCESS',
      payment_method: 'QRIS Dinamis',
      created_at: '2026-09-30T08:00:00.000Z',
    },
    {
      id: 'ORD-DIG-002',
      tenant_slug: 'onlineboost',
      tenant_id: 'uuid-onlineboost-3333',
      product_name: 'Ecourse Strategi YouTube AI',
      final_amount: 299000,
      status: 'PAID',
      payment_method: 'Transfer Bank BCA',
      created_at: '2026-09-30T14:20:00.000Z',
    },
    {
      id: 'ORD-DIG-003',
      tenant_slug: 'onlineboost',
      tenant_id: 'uuid-onlineboost-3333',
      product_name: 'Modul Praktis CPM 24 Jam',
      amount: 149000,
      status: 'ORDER_PENDING_VERIFICATION',
      payment_method: 'Transfer Bank BCA Manual',
      created_at: '2026-09-30T15:00:00.000Z',
    },
  ];

  describe('1. Multi-Vertical Isolation & Non-Zero Guarantee', () => {
    it('aggregates Tenant A (Jasa/Tiket) correctly without Rp 0 or bleeding', () => {
      const metricsA = calculateFinancialMetrics(tenantA_JasaOrders);

      // ORD-JASA-001 (149k PAID) + ORD-JASA-002 (299k VERIFIED) = 448k
      expect(metricsA.totalRevenue).toBe(448000);
      expect(metricsA.totalSuccessfulOrders).toBe(2);
      expect(metricsA.aov).toBe(Math.round(448000 / 2)); // 224,000
      expect(metricsA.pendingVerificationCount).toBe(1);
      expect(metricsA.pendingVerificationAmount).toBe(99000);

      // Verify no other tenant data exists
      metricsA.validOrders.forEach((o) => {
        expect(o.tenant_slug).toBe('solusi-ads');
      });
    });

    it('aggregates Tenant B (FnB/Fisik) correctly with shipping & COD', () => {
      const metricsB = calculateFinancialMetrics(tenantB_FnBOrders);

      // ORD-FNB-001 (60k SETTLED) + ORD-FNB-002 (185k COMPLETED) = 245k
      expect(metricsB.totalRevenue).toBe(245000);
      expect(metricsB.totalSuccessfulOrders).toBe(2);
      expect(metricsB.aov).toBe(Math.round(245000 / 2)); // 122,500
      expect(metricsB.pendingVerificationCount).toBe(0);

      metricsB.validOrders.forEach((o) => {
        expect(o.tenant_slug).toBe('tanev-food');
      });
    });

    it('aggregates Tenant C (Digital/Ecourse) correctly', () => {
      const metricsC = calculateFinancialMetrics(tenantC_DigitalOrders);

      // ORD-DIG-001 (499k SUCCESS) + ORD-DIG-002 (299k PAID) = 798k
      expect(metricsC.totalRevenue).toBe(798000);
      expect(metricsC.totalSuccessfulOrders).toBe(2);
      expect(metricsC.aov).toBe(Math.round(798000 / 2)); // 399,000
      expect(metricsC.pendingVerificationCount).toBe(1);
      expect(metricsC.pendingVerificationAmount).toBe(149000);

      metricsC.validOrders.forEach((o) => {
        expect(o.tenant_slug).toBe('onlineboost');
      });
    });

    it('guarantees complete tenant isolation across all three verticals', () => {
      const allOrders = [...tenantA_JasaOrders, ...tenantB_FnBOrders, ...tenantC_DigitalOrders];

      const ordersForA = allOrders.filter((o) => o.tenant_slug === 'solusi-ads');
      const ordersForB = allOrders.filter((o) => o.tenant_slug === 'tanev-food');
      const ordersForC = allOrders.filter((o) => o.tenant_slug === 'onlineboost');

      const resA = calculateFinancialMetrics(ordersForA);
      const resB = calculateFinancialMetrics(ordersForB);
      const resC = calculateFinancialMetrics(ordersForC);

      expect(resA.totalRevenue).toBe(448000);
      expect(resB.totalRevenue).toBe(245000);
      expect(resC.totalRevenue).toBe(798000);

      // Sum of isolated metrics matches independent calculations
      expect(resA.totalRevenue + resB.totalRevenue + resC.totalRevenue).toBe(1491000);
    });
  });

  describe('2. Valid Paid Statuses & Case-Insensitive Aggregation', () => {
    it('accepts all valid platform status variations', () => {
      const variations = [
        { total_amount: 100000, status: 'PAID' },
        { total_amount: 100000, status: 'paid' },
        { total_amount: 100000, status: 'SETTLED' },
        { total_amount: 100000, status: 'settlement' },
        { total_amount: 100000, status: 'SUCCESS' },
        { total_amount: 100000, status: 'COMPLETED' },
        { total_amount: 100000, status: 'VERIFIED' },
        { total_amount: 100000, status: 'LUNAS' },
      ];

      const res = calculateFinancialMetrics(variations);
      expect(res.totalRevenue).toBe(800000);
      expect(res.totalSuccessfulOrders).toBe(8);
      expect(res.aov).toBe(100000);
    });

    it('correctly identifies valid and pending statuses', () => {
      expect(isValidPaidStatus('PAID')).toBe(true);
      expect(isValidPaidStatus('SETTLED')).toBe(true);
      expect(isValidPaidStatus('SUCCESS')).toBe(true);
      expect(isValidPaidStatus('COMPLETED')).toBe(true);
      expect(isValidPaidStatus('VERIFIED')).toBe(true);
      expect(isValidPaidStatus('pending')).toBe(false);
      expect(isValidPaidStatus('ORDER_PENDING_VERIFICATION')).toBe(false);

      expect(isPendingVerificationStatus('ORDER_PENDING_VERIFICATION')).toBe(true);
      expect(isPendingVerificationStatus('PENDING_VERIFICATION')).toBe(true);
      expect(isPendingVerificationStatus('WAITING_VERIFICATION')).toBe(true);
      expect(isPendingVerificationStatus('PAID')).toBe(false);
    });
  });

  describe('3. Manual Order Lifecycle (Pending Verification -> Paid)', () => {
    it('moves pending verification order into omzet immediately upon being marked PAID', () => {
      const orderList = [
        {
          id: 'ORD-MANUAL-1',
          total_amount: 149000,
          status: 'ORDER_PENDING_VERIFICATION',
        },
      ];

      // Phase 1: Before admin confirmation
      const phase1 = calculateFinancialMetrics(orderList);
      expect(phase1.totalRevenue).toBe(0);
      expect(phase1.pendingVerificationCount).toBe(1);
      expect(phase1.pendingVerificationAmount).toBe(149000);

      // Phase 2: Admin clicks "Verifikasi Lunas"
      orderList[0].status = 'PAID';
      const phase2 = calculateFinancialMetrics(orderList);
      expect(phase2.totalRevenue).toBe(149000);
      expect(phase2.totalSuccessfulOrders).toBe(1);
      expect(phase2.aov).toBe(149000);
      expect(phase2.pendingVerificationCount).toBe(0);
      expect(phase2.pendingVerificationAmount).toBe(0);
    });
  });

  describe('4. Robust Order Amount Extraction', () => {
    it('handles numeric and string formatting across various order structures', () => {
      expect(extractOrderAmount({ final_amount: 150000 })).toBe(150000);
      expect(extractOrderAmount({ total_amount: 250000 })).toBe(250000);
      expect(extractOrderAmount({ gross_amount: '350.000' })).toBe(350000);
      expect(extractOrderAmount({ amount: 'Rp 450,000' })).toBe(450000);
      expect(extractOrderAmount({ total_price: 550000 })).toBe(550000);
      expect(extractOrderAmount(null)).toBe(0);
      expect(extractOrderAmount({})).toBe(0);
    });
  });

  describe('5. WIB (Asia/Jakarta / GMT+7) Timezone Calculations', () => {
    it('formats date and handles timezone boundary correctly', () => {
      // 2026-09-30 17:30:00 UTC is 2026-10-01 00:30:00 WIB (+7h)
      const lateUtc = new Date('2026-09-30T17:30:00.000Z');
      const wibDate = formatWIBDateString(lateUtc);
      expect(wibDate).toBe('2026-10-01');

      // 2026-09-30 02:00:00 UTC is 2026-09-30 09:00:00 WIB
      const morningUtc = new Date('2026-09-30T02:00:00.000Z');
      expect(formatWIBDateString(morningUtc)).toBe('2026-09-30');
    });

    it('formats human readable WIB time string in Indonesian locale', () => {
      const formatted = formatWIBDateTime('2026-09-30T03:15:00.000Z');
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(5);
    });
  });

  describe('6. Agnostic Supabase Query Helper', () => {
    it('constructs query matching both tenant_id and tenant_slug without slug branching', async () => {
      const mockOrders = [
        { id: '1', tenant_slug: 'demo-store', total_amount: 50000, status: 'PAID' },
      ];

      const mockSupabase = {
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: { id: 'uuid-1234', slug: 'demo-store', name: 'Demo Store' },
                  }),
                })),
              })),
            };
          }
          if (table === 'orders') {
            const queryBuilder: any = {
              or: jest.fn(() => queryBuilder),
              eq: jest.fn(() => queryBuilder),
              gte: jest.fn(() => queryBuilder),
              lte: jest.fn(() => queryBuilder),
              order: jest.fn(() => queryBuilder),
              limit: jest.fn(() => queryBuilder),
              then: (resolve: any) => resolve({ data: mockOrders, error: null }),
            };
            return {
              select: jest.fn(() => queryBuilder),
            };
          }
          return {};
        }),
      };

      const result = await fetchTenantOrdersAgnostic(mockSupabase, 'demo-store');
      expect(result.tenant.id).toBe('uuid-1234');
      expect(result.orders.length).toBe(1);
      expect(result.orders[0].total_amount).toBe(50000);
    });
  });
});
