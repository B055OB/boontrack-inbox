/**
 * @file __tests__/affiliate/studio_affiliate_schema.test.ts
 * @description Comprehensive Test Suite for Studio Affiliate Schema & Commission Recording
 * 
 * Verifies:
 * 1. Database Migration: Column product_type ('SHOP' | 'STUDIO', default 'SHOP') & indexes in migration file.
 * 2. Uniform Commission Percentage: Same rate calculation (25% direct + 5% AM override) for Studio tokens.
 * 3. recordStudioTokenCommission: Inserts product_type = 'STUDIO' only on PAID / SETTLED status.
 * 4. sendOrderCommissionAlert: Honors product_type param (default 'SHOP').
 * 5. Wildcard Domain Referral Cookies: Cookies configured for root domain '.boontrack.com'.
 * 6. UI Dormancy: Confirms affiliate dashboard remains dormant regarding studio promo links.
 */

import fs from 'fs';
import path from 'path';
import {
  recordStudioTokenCommission,
  sendOrderCommissionAlert,
} from '@/lib/affiliate-notification-service';

// Mock Supabase & fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockSupabaseQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  insert: jest.fn().mockResolvedValue({ data: null, error: null }),
  maybeSingle: jest.fn(),
  single: jest.fn(),
};

const mockSupabaseClient = {
  from: jest.fn(() => mockSupabaseQuery),
};

jest.mock('@/lib/supabaseClient', () => ({
  getSupabase: jest.fn(() => mockSupabaseClient),
  getSupabaseAdmin: jest.fn(() => mockSupabaseClient),
}));

jest.mock('@/lib/boonpilot-email', () => ({
  getResendApiKey: jest.fn(() => 'mock_resend_api_key_test_123'),
}));

describe('Studio Affiliate Database Schema & Commission Standardization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email_msg_studio_001' }),
    });
  });

  describe('1. Database Migration File Contract', () => {
    it('verifies 20261010_add_product_type_to_affiliate_commissions.sql exists and contains required schema', () => {
      const migrationPath = path.resolve(
        __dirname,
        '../../supabase/migrations/20261010_add_product_type_to_affiliate_commissions.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sqlContent = fs.readFileSync(migrationPath, 'utf8');
      expect(sqlContent).toContain('product_type');
      expect(sqlContent).toContain("DEFAULT 'SHOP'");
      expect(sqlContent).toContain("CHECK (product_type IN ('SHOP', 'STUDIO'))");
      expect(sqlContent).toContain('idx_aff_comm_product_type');
      expect(sqlContent).toContain('reload schema');
    });
  });

  describe('2. Uniform Commission Percentage for Studio Tokens (25% Direct + 5% AM Override)', () => {
    it('records studio token commission with product_type = "STUDIO" for SETTLED status', async () => {
      // Mock affiliate lookup: recruiter with 25% commission rate & parent AM
      mockSupabaseQuery.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 'aff-studio-recruiter-01',
          name: 'Kang Sakti Studio',
          email: 'kangsakti@boontrack.com',
          referral_code: 'buzzerukm',
          commission_rate: 25,
          parent_am_id: 'am-parent-01',
        },
        error: null,
      });

      // Mock parent AM lookup
      mockSupabaseQuery.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 'am-parent-01',
          name: 'Super AM',
          email: 'am@boontrack.com',
          referral_code: 'superam',
        },
        error: null,
      });

      const tokenAmount = 500000; // Rp 500.000 (100 Render Tokens)
      const res = await recordStudioTokenCommission({
        orderId: 'TOKEN-TX-001',
        tenantSlug: 'alldy-studio',
        grossAmount: tokenAmount,
        tokenCount: 100,
        affiliateCode: 'buzzerukm',
        paymentStatus: 'SETTLED',
      });

      expect(res.success).toBe(true);
      expect(res.commissionAmount).toBe(125000); // 25% of 500.000 = 125.000
      expect(res.amOverrideAmount).toBe(25000); // 5% of 500.000 = 25.000

      // Verify direct commission row inserted with product_type = 'STUDIO'
      expect(mockSupabaseQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: 'TOKEN-TX-001',
          affiliate_id: 'aff-studio-recruiter-01',
          amount: 125000,
          order_amount: 500000,
          product_type: 'STUDIO',
          status: 'PENDING',
        })
      );

      // Verify AM override row inserted with product_type = 'STUDIO'
      expect(mockSupabaseQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: 'TOKEN-TX-001',
          affiliate_id: 'am-parent-01',
          amount: 25000,
          order_amount: 500000,
          product_type: 'STUDIO',
          status: 'PENDING',
        })
      );
    });

    it('records studio token commission for PAID status', async () => {
      mockSupabaseQuery.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 'aff-solo-01',
          name: 'Solo Partner',
          email: 'solo@boontrack.com',
          referral_code: 'solo',
          commission_rate: 20, // custom rate 20%
          parent_am_id: null,
        },
        error: null,
      });

      const res = await recordStudioTokenCommission({
        orderId: 'TOKEN-TX-002',
        tenantSlug: 'creative-studio',
        grossAmount: 200000, // Rp 200.000
        tokenCount: 25,
        affiliateCode: 'solo',
        paymentStatus: 'PAID',
      });

      expect(res.success).toBe(true);
      expect(res.commissionAmount).toBe(40000); // 20% of 200.000 = 40.000

      expect(mockSupabaseQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: 'TOKEN-TX-002',
          affiliate_id: 'aff-solo-01',
          amount: 40000,
          product_type: 'STUDIO',
        })
      );
    });

    it('rejects commission recording when payment status is not PAID or SETTLED', async () => {
      const res = await recordStudioTokenCommission({
        orderId: 'TOKEN-PENDING-001',
        tenantSlug: 'pending-studio',
        grossAmount: 100000,
        paymentStatus: 'PENDING',
      });

      expect(res.success).toBe(false);
      expect(res.commissionAmount).toBe(0);
      expect(mockSupabaseQuery.insert).not.toHaveBeenCalled();
    });

    it('rejects commission recording when grossAmount <= 0', async () => {
      const res = await recordStudioTokenCommission({
        orderId: 'TOKEN-FREE-001',
        tenantSlug: 'free-studio',
        grossAmount: 0,
        paymentStatus: 'PAID',
      });

      expect(res.success).toBe(false);
      expect(res.commissionAmount).toBe(0);
      expect(mockSupabaseQuery.insert).not.toHaveBeenCalled();
    });
  });

  describe('3. sendOrderCommissionAlert product_type handling', () => {
    it('defaults product_type to "SHOP" when not specified', async () => {
      mockSupabaseQuery.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 'aff-shop-01',
          name: 'Shop Affiliate',
          email: 'shop@boontrack.com',
          referral_code: 'shopref',
          commission_rate: 25,
        },
        error: null,
      });

      await sendOrderCommissionAlert({
        orderId: 'ORD-SHOP-001',
        tenantSlug: 'toko-kopi',
        productTitle: 'Langganan Toko Bulanan',
        grossAmount: 300000,
        affiliateCode: 'shopref',
      });

      expect(mockSupabaseQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: 'ORD-SHOP-001',
          product_type: 'SHOP',
        })
      );
    });

    it('persists product_type = "STUDIO" when explicitly provided', async () => {
      mockSupabaseQuery.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 'aff-studio-02',
          name: 'Studio Partner',
          email: 'studio@boontrack.com',
          referral_code: 'studioref',
          commission_rate: 25,
        },
        error: null,
      });

      await sendOrderCommissionAlert({
        orderId: 'ORD-STUDIO-002',
        tenantSlug: 'studio-pro',
        productTitle: 'Kredit Render Video UGC',
        grossAmount: 250000,
        affiliateCode: 'studioref',
        productType: 'STUDIO',
      });

      expect(mockSupabaseQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: 'ORD-STUDIO-002',
          product_type: 'STUDIO',
        })
      );
    });
  });

  describe('4. Cross-Domain Wildcard Referral Cookie Contract (.boontrack.com)', () => {
    it('verifies middleware.ts attaches referral cookie on wildcard root domain .boontrack.com', () => {
      const middlewarePath = path.resolve(__dirname, '../../middleware.ts');
      const middlewareContent = fs.readFileSync(middlewarePath, 'utf8');

      // Verifies cookie domain logic sets .boontrack.com
      expect(middlewareContent).toContain("cookieOptions.domain = '.boontrack.com'");
      expect(middlewareContent).toContain("res.cookies.set('boontrack_referral_code'");
      expect(middlewareContent).toContain("res.cookies.set('ref'");
      // Verifies global wrapper intercepts referral params
      expect(middlewareContent).toContain("req.nextUrl.searchParams.get('ref')");
    });
  });

  describe('5. UI Dormancy Guard for Studio Links on Affiliate Dashboard', () => {
    it('ensures affiliate dashboard UI (app/affiliate/page.tsx) remains dormant and does NOT advertise studio.boontrack.com?ref=', () => {
      const affiliatePagePath = path.resolve(__dirname, '../../app/affiliate/page.tsx');
      const content = fs.readFileSync(affiliatePagePath, 'utf8');

      // Must NOT contain studio promo links in active affiliate tabs
      expect(content).not.toContain('studio.boontrack.com?ref=');
      expect(content).not.toContain('studio.boontrack.com/?ref=');

      // Confirms shop.boontrack.com remains the 100% active primary focus
      expect(content).toContain('shop.boontrack.com');
    });
  });
});
