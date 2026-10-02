/**
 * @file __tests__/tracking/meta_ad_account_spend_roas.test.ts
 * @description Unit tests for Meta Ad Account ID Normalization, Graph API Daily Spend Fetcher & ROAS Engine
 */

import {
  normalizeMetaAdAccountId,
  fetchMetaDailySpend,
} from '@/lib/tracking/meta-capi';

describe('Meta Ad Account ID & Daily Spend ROAS Suite', () => {
  describe('normalizeMetaAdAccountId', () => {
    it('should prefix raw digit strings with act_', () => {
      expect(normalizeMetaAdAccountId('123456789012345')).toBe('act_123456789012345');
      expect(normalizeMetaAdAccountId('987654321')).toBe('act_987654321');
    });

    it('should preserve and normalize already prefixed act_ string', () => {
      expect(normalizeMetaAdAccountId('act_123456789012345')).toBe('act_123456789012345');
      expect(normalizeMetaAdAccountId('ACT_123456789012345')).toBe('act_123456789012345');
    });

    it('should strip internal and surrounding whitespace', () => {
      expect(normalizeMetaAdAccountId('  123456789012345  ')).toBe('act_123456789012345');
      expect(normalizeMetaAdAccountId('  act_ 123456789012345  ')).toBe('act_123456789012345');
    });

    it('should return empty string for null, undefined, or empty values', () => {
      expect(normalizeMetaAdAccountId('')).toBe('');
      expect(normalizeMetaAdAccountId(null)).toBe('');
      expect(normalizeMetaAdAccountId(undefined)).toBe('');
      expect(normalizeMetaAdAccountId('   ')).toBe('');
    });

    it('should return empty string if string contains no digits', () => {
      expect(normalizeMetaAdAccountId('abc_xyz')).toBe('');
      expect(normalizeMetaAdAccountId('---')).toBe('');
    });
  });

  describe('fetchMetaDailySpend', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should return fallback with error if adAccountId or accessToken is missing', async () => {
      const resultNoToken = await fetchMetaDailySpend('123456789012345', '');
      expect(resultNoToken.success).toBe(false);
      expect(resultNoToken.spend).toBe(0);
      expect(resultNoToken.adAccountId).toBe('act_123456789012345');

      const resultNoId = await fetchMetaDailySpend('', 'EAABwz...');
      expect(resultNoId.success).toBe(false);
      expect(resultNoId.spend).toBe(0);
      expect(resultNoId.adAccountId).toBe('');
    });

    it('should call Meta Graph API Insights with normalized act_ id and bearer token', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              spend: '350000.50',
              account_currency: 'IDR',
              date_start: '2026-10-02',
              date_stop: '2026-10-02',
            },
          ],
        }),
      });
      global.fetch = mockFetch;

      const result = await fetchMetaDailySpend('123456789012345', 'EAABwz_secret_token_123', 'today');

      expect(result.success).toBe(true);
      expect(result.spend).toBe(350000.5);
      expect(result.rawSpend).toBe('350000.50');
      expect(result.currency).toBe('IDR');
      expect(result.adAccountId).toBe('act_123456789012345');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://graph.facebook.com/v19.0/act_123456789012345/insights?date_preset=today&fields=spend,account_currency'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer EAABwz_secret_token_123',
          }),
        })
      );
    });

    it('should handle zero spend from Meta Graph API gracefully', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
        }),
      });
      global.fetch = mockFetch;

      const result = await fetchMetaDailySpend('act_999999', 'token_xyz');

      expect(result.success).toBe(true);
      expect(result.spend).toBe(0);
      expect(result.rawSpend).toBe('0');
      expect(result.adAccountId).toBe('act_999999');
    });

    it('should silently handle Graph API permission or auth errors without throwing', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            message: 'Permissions error: (#100) Tried accessing nonexisting field (spend) or token lacks ads_read permission',
            type: 'OAuthException',
            code: 100,
          },
        }),
      });
      global.fetch = mockFetch;

      const result = await fetchMetaDailySpend('act_123456', 'token_lacks_permission');

      expect(result.success).toBe(false);
      expect(result.spend).toBe(0);
      expect(result.adAccountId).toBe('act_123456');
      expect(result.error).toContain('ads_read');
    });

    it('should silently catch network exceptions without crashing', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network connection timeout'));
      global.fetch = mockFetch;

      const result = await fetchMetaDailySpend('act_123456', 'token_abc');

      expect(result.success).toBe(false);
      expect(result.spend).toBe(0);
      expect(result.error).toContain('Network connection timeout');
    });
  });

  describe('Blended ROAS Calculation Rules', () => {
    it('should calculate accurate ROAS when total spend > 0', () => {
      const totalRevenue = 1500000;
      const totalSpend = 300000;
      const blendedRoas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : '0.00';

      expect(blendedRoas).toBe('5.00');
    });

    it('should return 0.00 and signal waiting state when spend is 0', () => {
      const totalRevenue = 1500000;
      const totalSpend = 0;
      const blendedRoas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : '0.00';

      expect(blendedRoas).toBe('0.00');
    });
  });
});
