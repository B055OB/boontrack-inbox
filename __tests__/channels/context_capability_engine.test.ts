/**
 * __tests__/channels/context_capability_engine.test.ts
 * Unit Tests for §43 Context-Capability Pattern & Granular Channel Attribution
 */

import {
  resolveChannelBinding,
  hasCapability,
  resolveBindingCapabilities,
  buildGranularReferralUrl,
  extractGranularAttribution,
  CONTEXT_CAPABILITIES,
  ChannelBinding,
} from '@/lib/channels';
import { dispatchOrderTelegramAlert } from '@/lib/telegram/telegram-dispatcher';

describe('§43 Context-Capability Engine & Channel Binding Contract', () => {
  describe('Capability Matrix & Resolution', () => {
    it('should define correct capabilities for STORE_CONTEXT', () => {
      expect(CONTEXT_CAPABILITIES.STORE_CONTEXT).toEqual([
        'order_notification',
        'payment_notification',
        'catalog',
      ]);
    });

    it('should define correct capabilities for AFFILIATE_CONTEXT', () => {
      expect(CONTEXT_CAPABILITIES.AFFILIATE_CONTEXT).toEqual([
        'referral_acquisition',
        'registration_link',
        'affiliate_notification',
      ]);
    });

    it('should resolve default capabilities for STORE_CONTEXT', () => {
      const capabilities = resolveBindingCapabilities('STORE_CONTEXT');
      expect(capabilities).toContain('order_notification');
      expect(capabilities).toContain('payment_notification');
      expect(capabilities).toContain('catalog');
      expect(capabilities).not.toContain('referral_acquisition');
    });

    it('should resolve default capabilities for AFFILIATE_CONTEXT', () => {
      const capabilities = resolveBindingCapabilities('AFFILIATE_CONTEXT');
      expect(capabilities).toContain('referral_acquisition');
      expect(capabilities).toContain('registration_link');
      expect(capabilities).toContain('affiliate_notification');
      expect(capabilities).not.toContain('order_notification');
    });

    it('should filter out order_notification in STORE_CONTEXT when notify_new_order is false', () => {
      const capabilities = resolveBindingCapabilities('STORE_CONTEXT', {
        groupConfig: { notify_new_order: false, notify_paid: true },
      });
      expect(capabilities).not.toContain('order_notification');
      expect(capabilities).toContain('payment_notification');
      expect(capabilities).toContain('catalog');
    });

    it('should filter out payment_notification in STORE_CONTEXT when notify_paid is false', () => {
      const capabilities = resolveBindingCapabilities('STORE_CONTEXT', {
        groupConfig: { notify_new_order: true, notify_paid: false },
      });
      expect(capabilities).toContain('order_notification');
      expect(capabilities).not.toContain('payment_notification');
      expect(capabilities).toContain('catalog');
    });
  });

  describe('resolveChannelBinding & hasCapability Helper', () => {
    it('should construct a valid ChannelBinding for telegram group in STORE_CONTEXT', () => {
      const binding = resolveChannelBinding({
        channel_type: 'telegram',
        external_identifier: '-10012345678',
        context: 'STORE_CONTEXT',
        community_source_id: '-10012345678',
        tenant_id: 'tenant-uuid-1',
        tenant_slug: 'onlineboost',
        group_config: { notify_new_order: false, notify_paid: true },
      });

      expect(binding.binding_id).toBe('telegram:-10012345678:store_context');
      expect(binding.channel_type).toBe('telegram');
      expect(binding.external_identifier).toBe('-10012345678');
      expect(binding.context).toBe('STORE_CONTEXT');
      expect(binding.community_source_id).toBe('-10012345678');
      expect(binding.tenant_slug).toBe('onlineboost');

      expect(hasCapability(binding, 'order_notification')).toBe(false);
      expect(hasCapability(binding, 'payment_notification')).toBe(true);
      expect(hasCapability(binding, 'catalog')).toBe(true);
      expect(hasCapability(binding, 'referral_acquisition')).toBe(false);
    });

    it('should construct a valid ChannelBinding for telegram in AFFILIATE_CONTEXT', () => {
      const binding = resolveChannelBinding({
        channel_type: 'telegram',
        external_identifier: '-10098765432',
        context: 'AFFILIATE_CONTEXT',
        community_source_id: '-10098765432',
        tenant_slug: 'tokoberkah',
      });

      expect(binding.context).toBe('AFFILIATE_CONTEXT');
      expect(hasCapability(binding, 'referral_acquisition')).toBe(true);
      expect(hasCapability(binding, 'registration_link')).toBe(true);
      expect(hasCapability(binding, 'affiliate_notification')).toBe(true);
      expect(hasCapability(binding, 'catalog')).toBe(false);
    });

    it('should safely handle null or invalid binding in hasCapability', () => {
      expect(hasCapability(null, 'order_notification')).toBe(false);
      expect(hasCapability(undefined, 'catalog')).toBe(false);
      expect(hasCapability({} as ChannelBinding, 'referral_acquisition')).toBe(false);
    });
  });

  describe('§43.3 Granular Attribution Engine', () => {
    it('should generate referral URL with ?ref={affiliate_id}&src={community_source_id}', () => {
      const url = buildGranularReferralUrl({
        slug: 'onlineboost',
        affiliateId: 'aff_budi88',
        communitySourceId: '-1002345678',
      });

      expect(url).toContain('/onlineboost?');
      expect(url).toContain('ref=aff_budi88');
      expect(url).toContain('src=-1002345678');
    });

    it('should omit src parameter when communitySourceId is null or empty', () => {
      const url1 = buildGranularReferralUrl({
        slug: 'boon',
        affiliateId: 'partner123',
        communitySourceId: null,
      });
      expect(url1).toContain('ref=partner123');
      expect(url1).not.toContain('src=');

      const url2 = buildGranularReferralUrl({
        slug: 'boon',
        affiliateId: 'partner123',
        communitySourceId: '',
      });
      expect(url2).not.toContain('src=');
    });

    it('should correctly extract granular attribution components from URL query string', () => {
      const rawUrl = 'https://shop.boontrack.com/my-shop?ref=AFF99&src=group_wa_123';
      const extracted = extractGranularAttribution(rawUrl);

      expect(extracted.referralCode).toBe('AFF99');
      expect(extracted.communitySourceId).toBe('group_wa_123');
    });

    it('should handle missing src or ref in extractGranularAttribution gracefully', () => {
      const extracted = extractGranularAttribution('https://shop.boontrack.com/my-shop?ref=SOLO_AFF');
      expect(extracted.referralCode).toBe('SOLO_AFF');
      expect(extracted.communitySourceId).toBeNull();
    });
  });

  describe('Dispatcher Capability Policy Check', () => {
    it('should skip new_order alert when ChannelBinding lacks order_notification capability', async () => {
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: 'tenant-123',
                  slug: 'tokokeren',
                  telegram_chat_id: '-10012345678',
                  metadata: {
                    telegram_group_config: {
                      notify_new_order: false, // Disables order_notification capability
                      notify_paid: true,
                    },
                  },
                },
              }),
            }),
          }),
        }),
      };

      const result = await dispatchOrderTelegramAlert({
        order: {
          id: 'ORD-TEST-1',
          tenant_slug: 'tokokeren',
          gross_amount: 150000,
        },
        event: 'new_order',
        supabaseClient: mockSupabase,
      });

      expect(result.dispatched).toBe(false);
      expect(result.error).toBe('skipped_by_group_config');
    });
  });
});
