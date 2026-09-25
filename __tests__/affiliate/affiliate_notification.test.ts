/**
 * @file __tests__/affiliate/affiliate_notification.test.ts
 * @description Comprehensive Unit Test Suite for BoonTrack Affiliate & AM Network Email Notifications
 * 
 * Verifies:
 * 1. Sender Identity Contract: "BoonTrack Affiliate" <affiliate@boontrack.com>
 * 2. HTML & Plain-Text template rendering (New Store, Order Commission, New Downline Affiliate)
 * 3. Dynamic database query resolution for referrers and upline AMs (Kang Sakti / buzzerukm)
 * 4. Multi-tier commission distribution (Direct commission + AM 5% override)
 * 5. Non-blocking error handling (no unhandled rejections)
 */

import {
  sendAffiliateEmail,
  buildNewStoreAlertHtml,
  buildNewStoreAlertText,
  buildCommissionAlertHtml,
  buildCommissionAlertText,
  buildNewAffiliateAlertHtml,
  buildNewAffiliateAlertText,
  sendNewStoreReferralNotification,
  sendOrderCommissionAlert,
  sendNewAffiliateRegistrationNotification,
} from '@/lib/affiliate-notification-service';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Supabase Client
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

describe('Affiliate & AM Notification System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ id: 'email_msg_mock_001' }),
    });
  });

  describe('1. Sender Identity Contract', () => {
    it('uses "BoonTrack Affiliate" <affiliate@boontrack.com> as the primary sender', async () => {
      const result = await sendAffiliateEmail({
        to: 'buzzerukm@gmail.com',
        subject: 'Test Subject',
        html: '<p>Test</p>',
        text: 'Test',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('email_msg_mock_001');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.from).toBe('"BoonTrack Affiliate" <affiliate@boontrack.com>');
      expect(requestBody.to).toEqual(['buzzerukm@gmail.com']);
      expect(requestBody.subject).toBe('Test Subject');
    });

    it('falls back to secondary sender if primary is rejected', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          json: async () => ({ error: 'Sender domain not verified' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ id: 'fallback_msg_002' }),
        });

      const result = await sendAffiliateEmail({
        to: 'buzzerukm@gmail.com',
        subject: 'Fallback Test',
        html: '<p>Test</p>',
        text: 'Test',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('fallback_msg_002');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('returns failure gracefully when recipient email is invalid without throwing', async () => {
      const result = await sendAffiliateEmail({
        to: 'invalid-email-address',
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Recipient email is invalid');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('2. Email Template Rendering', () => {
    it('renders New Store alert HTML with store and recruiter details', () => {
      const html = buildNewStoreAlertHtml({
        recipientName: 'Sakti Alamsyah',
        isParentAm: true,
        recruiterName: 'Aldi Rinaldiawan',
        recruiterCode: 'ob',
        storeName: 'Kue Enak Bandung',
        storeSlug: 'kue-enak-bandung',
        planName: 'Ads Performance Trial 7 Hari',
        merchantName: 'Ibu Sarah',
        registeredAt: '25 Sep 2026, 12:00',
      });

      expect(html).toContain('Sakti Alamsyah');
      expect(html).toContain('Kue Enak Bandung');
      expect(html).toContain('shop.boontrack.com/kue-enak-bandung');
      expect(html).toContain('Ads Performance Trial 7 Hari');
      expect(html).toContain('Aldi Rinaldiawan');
      expect(html).toContain('ob');
      expect(html).toContain('BOONTRACK AFFILIATE NETWORK');
    });

    it('renders Order Commission alert HTML with commission calculation', () => {
      const html = buildCommissionAlertHtml({
        recipientName: 'Sakti Alamsyah',
        isAmOverride: false,
        orderId: 'ORD-777-TEST',
        storeName: 'Kue Enak Bandung',
        storeSlug: 'kue-enak-bandung',
        productTitle: '101 Resep Masakan Praktis',
        grossAmount: 100000,
        commissionAmount: 30000,
        commissionRate: 30,
        paidAt: '25 Sep 2026, 12:30',
      });

      expect(html).toContain('Sakti Alamsyah');
      expect(html).toContain('ORD-777-TEST');
      expect(html).toContain('Rp 30.000');
      expect(html).toContain('Rp 100.000');
      expect(html).toContain('30%');
      expect(html).toContain('LUNAS (PAID)');
    });

    it('renders AM 5% Override commission alert HTML correctly', () => {
      const html = buildCommissionAlertHtml({
        recipientName: 'Sakti Alamsyah',
        isAmOverride: true,
        orderId: 'ORD-888-OVERRIDE',
        storeName: 'Toko Downline',
        storeSlug: 'toko-downline',
        productTitle: 'Paket Usaha Digital',
        grossAmount: 200000,
        commissionAmount: 10000,
        commissionRate: 5,
        paidAt: '25 Sep 2026, 12:45',
      });

      expect(html).toContain('KOMISI OVERRIDE AM (5%)');
      expect(html).toContain('Rp 10.000');
      expect(html).toContain('5% AM Override');
    });

    it('renders New Sub-Affiliate Joined alert HTML', () => {
      const html = buildNewAffiliateAlertHtml({
        amName: 'Sakti Alamsyah',
        affiliateName: 'Indra Siregar',
        affiliateCode: 'penggangguranpremium',
        affiliateEmail: 'filebuatinvideo@gmail.com',
        affiliatePhone: '08123456789',
        region: 'ID-NATIONAL',
        registeredAt: '25 Sep 2026, 13:00',
      });

      expect(html).toContain('Sakti Alamsyah');
      expect(html).toContain('Indra Siregar');
      expect(html).toContain('penggangguranpremium');
      expect(html).toContain('filebuatinvideo@gmail.com');
      expect(html).toContain('Hak Override 5%');
    });
  });

  describe('3. Trigger A: New Store Registration under Referral Network', () => {
    it('dispatches email to direct recruiter (Kang Sakti) when referralCode matches', async () => {
      mockSupabaseQuery.maybeSingle.mockResolvedValueOnce({
        data: {
          id: '43e48443-dcfa-47a6-818c-5144e3a34db4',
          name: 'Sakti Alamsyah',
          email: 'buzzerukm@gmail.com',
          referral_code: 'buzzerukm',
          role: 'am',
          parent_am_id: null,
        },
        error: null,
      });

      const res = await sendNewStoreReferralNotification({
        storeName: 'Toko Fashion Bandung',
        slug: 'fashion-bdg',
        merchantName: 'Kang Ridwan',
        merchantPhone: '081234567890',
        planTier: 'PRO_SCALE',
        selectedPlan: 'Ads Performance Trial 7 Hari',
        isTrial: true,
        referralCode: 'buzzerukm',
      });

      expect(res.success).toBe(true);
      expect(res.dispatchedTo).toContain('buzzerukm@gmail.com');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.to).toEqual(['buzzerukm@gmail.com']);
      expect(payload.subject).toContain('Toko Baru Bergabung di Jaringan Anda: Toko Fashion Bandung');
    });

    it('dispatches to both sub-affiliate recruiter AND parent AM (Kang Sakti) on downline registration', async () => {
      // 1. First query: sub-affiliate (Aldi Rinaldiawan / ob)
      mockSupabaseQuery.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 'b92b0929-1dbd-4f80-b875-94e9ab92b189',
          name: 'Aldi Rinaldiawan',
          email: 'ob.officialagency@gmail.com',
          referral_code: 'ob',
          role: 'affiliate',
          parent_am_id: '43e48443-dcfa-47a6-818c-5144e3a34db4', // Kang Sakti
        },
        error: null,
      });

      // 2. Second query: parent AM (Kang Sakti / buzzerukm)
      mockSupabaseQuery.maybeSingle.mockResolvedValueOnce({
        data: {
          id: '43e48443-dcfa-47a6-818c-5144e3a34db4',
          name: 'Sakti Alamsyah',
          email: 'buzzerukm@gmail.com',
          referral_code: 'buzzerukm',
          role: 'am',
        },
        error: null,
      });

      const res = await sendNewStoreReferralNotification({
        storeName: 'Hijab Cantik Sukabumi',
        slug: 'hijab-cantik-sukabumi',
        referralCode: 'ob',
      });

      expect(res.success).toBe(true);
      expect(res.dispatchedTo).toContain('ob.officialagency@gmail.com');
      expect(res.dispatchedTo).toContain('buzzerukm@gmail.com');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const recruiterPayload = JSON.parse(mockFetch.mock.calls[0][1].body);
      const amPayload = JSON.parse(mockFetch.mock.calls[1][1].body);

      expect(recruiterPayload.to).toEqual(['ob.officialagency@gmail.com']);
      expect(amPayload.to).toEqual(['buzzerukm@gmail.com']);
      expect(amPayload.subject).toContain('Mitra Downline (Aldi Rinaldiawan) Merekrut Toko Baru');
    });

    it('silently ignores organic registrations without referral code or affiliate link', async () => {
      const res = await sendNewStoreReferralNotification({
        storeName: 'Toko Organik',
        slug: 'toko-organik',
        referralCode: null,
      });

      expect(res.success).toBe(true);
      expect(res.dispatchedTo.length).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('4. Trigger B: Order Payment Success & Commission Alert', () => {
    it('dispatches direct commission alert to Kang Sakti when order is under buzzerukm', async () => {
      // Recruiter affiliate lookup
      mockSupabaseQuery.maybeSingle.mockResolvedValueOnce({
        data: {
          id: '43e48443-dcfa-47a6-818c-5144e3a34db4',
          name: 'Sakti Alamsyah',
          email: 'buzzerukm@gmail.com',
          referral_code: 'buzzerukm',
          role: 'am',
          commission_rate: 30,
          parent_am_id: null,
        },
        error: null,
      });

      const res = await sendOrderCommissionAlert({
        orderId: 'ORD-BUZZER-001',
        tenantSlug: 'buzzerukm',
        productTitle: 'Akun Whitelist Meta Ads Agency',
        grossAmount: 950000,
        affiliateCode: 'buzzerukm',
      });

      expect(res.success).toBe(true);
      expect(res.dispatchedTo).toContain('buzzerukm@gmail.com');

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.to).toEqual(['buzzerukm@gmail.com']);
      expect(payload.subject).toContain('Komisi Masuk: Pesanan #ORD-BUZZER-001 Telah Lunas (Rp 285.000)');

      // Verify commission recorded in Supabase affiliate_commissions table
      expect(mockSupabaseQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: 'ORD-BUZZER-001',
          affiliate_id: '43e48443-dcfa-47a6-818c-5144e3a34db4',
          amount: 285000,
        })
      );
    });

    it('dispatches 25% direct commission to sub-affiliate AND 5% override to parent AM (Kang Sakti)', async () => {
      // 1. Recruiter affiliate lookup (Aldi / ob)
      mockSupabaseQuery.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 'b92b0929-1dbd-4f80-b875-94e9ab92b189',
          name: 'Aldi Rinaldiawan',
          email: 'ob.officialagency@gmail.com',
          referral_code: 'ob',
          role: 'affiliate',
          commission_rate: 25,
          parent_am_id: '43e48443-dcfa-47a6-818c-5144e3a34db4', // Kang Sakti
        },
        error: null,
      });

      // 2. Parent AM lookup (Kang Sakti)
      mockSupabaseQuery.maybeSingle.mockResolvedValueOnce({
        data: {
          id: '43e48443-dcfa-47a6-818c-5144e3a34db4',
          name: 'Sakti Alamsyah',
          email: 'buzzerukm@gmail.com',
          referral_code: 'buzzerukm',
          role: 'am',
        },
        error: null,
      });

      const res = await sendOrderCommissionAlert({
        orderId: 'ORD-DOWNLINE-123',
        tenantSlug: 'toko-downline-ob',
        productTitle: 'Kelas Online Bisnis Digital',
        grossAmount: 200000,
        affiliateCode: 'ob',
      });

      expect(res.success).toBe(true);
      expect(res.dispatchedTo).toContain('ob.officialagency@gmail.com');
      expect(res.dispatchedTo).toContain('buzzerukm@gmail.com');

      const directPayload = JSON.parse(mockFetch.mock.calls[0][1].body);
      const amOverridePayload = JSON.parse(mockFetch.mock.calls[1][1].body);

      // Direct affiliate gets 25% = Rp 50.000
      expect(directPayload.to).toEqual(['ob.officialagency@gmail.com']);
      expect(directPayload.subject).toContain('Rp 50.000');

      // Parent AM gets 5% override = Rp 10.000
      expect(amOverridePayload.to).toEqual(['buzzerukm@gmail.com']);
      expect(amOverridePayload.subject).toContain('Komisi Override AM Masuk: Pesanan #ORD-DOWNLINE-123 (Rp 10.000)');

      // Verify both commission rows inserted into affiliate_commissions
      expect(mockSupabaseQuery.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe('5. Trigger C: New Sub-Affiliate Joined under AM', () => {
    it('dispatches notification to Kang Sakti when a new affiliate registers under him', async () => {
      mockSupabaseQuery.maybeSingle.mockResolvedValueOnce({
        data: {
          id: '43e48443-dcfa-47a6-818c-5144e3a34db4',
          name: 'Sakti Alamsyah',
          email: 'buzzerukm@gmail.com',
          referral_code: 'buzzerukm',
          role: 'am',
        },
        error: null,
      });

      const res = await sendNewAffiliateRegistrationNotification({
        affiliateName: 'Indra Januar Siregar',
        affiliateEmail: 'filebuatinvideo@gmail.com',
        affiliatePhone: '087812345678',
        affiliateCode: 'penggangguranpremium',
        amCodeOrId: 'buzzerukm',
      });

      expect(res.success).toBe(true);
      expect(res.dispatchedTo).toContain('buzzerukm@gmail.com');

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.to).toEqual(['buzzerukm@gmail.com']);
      expect(payload.subject).toContain('Mitra Baru Bergabung di Bawah Jaringan Anda: Indra Januar Siregar');
    });

    it('falls back gracefully when parent AM has no email configured', async () => {
      mockSupabaseQuery.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 'am-without-email',
          name: 'AM No Email',
          email: null,
          referral_code: 'noemail',
          role: 'am',
        },
        error: null,
      });

      const res = await sendNewAffiliateRegistrationNotification({
        affiliateName: 'Mitra Baru',
        affiliateEmail: 'mitra@example.com',
        affiliateCode: 'mitrabaru',
        amCodeOrId: 'noemail',
      });

      expect(res.success).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
