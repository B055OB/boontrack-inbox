/**
 * __tests__/channels/community_pool_manager.test.ts
 * Unit Tests for Affiliate Community Pool Automation & Strict Domain Whitelist
 */

import { validateDemoUrl, resolveChannelBinding, buildGranularReferralUrl } from '@/lib/channels';

describe('§43 Community Pool Automation & Domain Guard', () => {
  describe('Strict Domain Whitelist (Domain Guard)', () => {
    it('should accept valid official boontrack.com URLs', () => {
      const validCases = [
        'https://shop.boontrack.com/toko-demo',
        'https://shop.boontrack.com/onlineboost/p/kursus-ads',
        'https://boontrack.com/etalase',
        'https://dashboard.boontrack.com/preview',
        'shop.boontrack.com/my-store',
      ];

      for (const url of validCases) {
        const result = validateDemoUrl(url);
        expect(result.valid).toBe(true);
        expect(result.normalizedUrl).toBeDefined();
        expect(result.normalizedUrl).toMatch(/^https:\/\/(.*\.)?boontrack\.com/);
        expect(result.error).toBeUndefined();
      }
    });

    it('should default to https://shop.boontrack.com/boon when empty or null', () => {
      expect(validateDemoUrl('').normalizedUrl).toBe('https://shop.boontrack.com/boon');
      expect(validateDemoUrl('   ').normalizedUrl).toBe('https://shop.boontrack.com/boon');
      expect(validateDemoUrl(null).normalizedUrl).toBe('https://shop.boontrack.com/boon');
      expect(validateDemoUrl(undefined).normalizedUrl).toBe('https://shop.boontrack.com/boon');
    });

    it('should strictly reject external third-party domains with standard error message', () => {
      const rejectedCases = [
        'https://shopee.co.id/product/12345',
        'https://tokopedia.com/toko-keren',
        'https://linktr.ee/mentorbisnis',
        'https://instagram.com/my_store',
        'https://fakeboontrack.com',
        'https://boontrack.com.scam.net',
        'https://google.com',
      ];

      for (const url of rejectedCases) {
        const result = validateDemoUrl(url);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Tautan demo wajib menggunakan ekosistem boontrack.com');
      }
    });
  });

  describe('Channel Binding Creation for Community Pools', () => {
    it('should construct a valid affiliate community pool binding with custom demo_url', () => {
      const binding = resolveChannelBinding({
        channel_type: 'telegram',
        external_identifier: '-10099887766',
        context: 'AFFILIATE_CONTEXT',
        community_source_id: '-10099887766',
        affiliate_id: 'ob',
        channel_name: 'Komunitas Scaleup Ads BDG',
        demo_url: 'https://shop.boontrack.com/onlineboost/p/starter-pack',
      });

      expect(binding.channel_type).toBe('telegram');
      expect(binding.context).toBe('AFFILIATE_CONTEXT');
      expect(binding.affiliate_id).toBe('ob');
      expect(binding.channel_name).toBe('Komunitas Scaleup Ads BDG');
      expect(binding.community_source_id).toBe('-10099887766');
      expect(binding.demo_url).toBe('https://shop.boontrack.com/onlineboost/p/starter-pack');
      expect(binding.capabilities).toContain('referral_acquisition');
      expect(binding.capabilities).toContain('registration_link');
      expect(binding.capabilities).toContain('affiliate_notification');
    });

    it('should default demo_url if not provided during binding resolution', () => {
      const binding = resolveChannelBinding({
        channel_type: 'whatsapp',
        external_identifier: '1203630248292839@g.us',
        context: 'AFFILIATE_CONTEXT',
        community_source_id: '1203630248292839@g.us',
        affiliate_id: 'ob',
        channel_name: 'WA Group Mentoring',
      });

      expect(binding.demo_url).toBe('https://shop.boontrack.com/boon');
    });
  });

  describe('Bot Response Engine 2-CTA Formatting', () => {
    it('should construct correct Register URL with ref and src parameters', () => {
      const affiliateId = 'ob';
      const communitySourceId = '-10099887766';
      const registerUrl = `https://shop.boontrack.com/register?ref=${encodeURIComponent(affiliateId)}&src=${encodeURIComponent(communitySourceId)}`;

      expect(registerUrl).toBe('https://shop.boontrack.com/register?ref=ob&src=-10099887766');
    });
  });
});
