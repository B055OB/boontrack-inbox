/**
 * __tests__/boonpilot/group_mention_and_affiliate_resolution.test.ts
 *
 * Contract Verification for ARCHITECTURE.md §39.1 & §43.4:
 * 1. Group Mention Regex Guard (§39.1):
 *    - Platform number 6281215567168 responds to group (@g.us) messages if containing /@(boon|boontrack|081215567168)\b/i.
 *    - Never drop group messages triggering mention regex.
 *    - Ordinary chatter without mention is safely dropped.
 *    - Merchant tenant numbers are dropped from group chats.
 * 2. Dynamic Affiliate URL Resolution (§43.4):
 *    - Reads group config from channel_bindings for community_source_id 120363430879517540@g.us (OPTIMASI IKLAN CT).
 *    - Directly resolves register_url from binding.metadata.register_url:
 *      const registerUrl = (binding.metadata as Record<string, string>)?.register_url ||
 *        `https://shop.boontrack.com/register?ref=${encodeURIComponent(affiliateId)}`;
 *    - Kang Sakti (buzzerukm) outputs https://buzzerukm.boontrack.com/register.
 *    - Demo URL outputs https://shop.boontrack.com/buzzerukm/p/ctwa-mastery-7day.
 */

import { isBoonPilotWakeWordTriggered } from '@/lib/boonpilot/wake-word';
import { resolveCommunityContext } from '@/lib/boonpilot/platform-engine';

describe('ARCHITECTURE.md §39.1 & §43.4 Verification Suite', () => {
  describe('1. Group Mention Regex Guard (§39.1)', () => {
    const groupMentionRegex = /@(boon|boontrack|081215567168)\b/i;

    it('matches required trigger regex /@(boon|boontrack|081215567168)\\b/i', () => {
      expect(groupMentionRegex.test('@boon')).toBe(true);
      expect(groupMentionRegex.test('@boontrack')).toBe(true);
      expect(groupMentionRegex.test('@081215567168')).toBe(true);
      expect(groupMentionRegex.test('Halo @boon tolong jelaskan')).toBe(true);
      expect(groupMentionRegex.test('Tanya dong @boontrack')).toBe(true);
      expect(groupMentionRegex.test('@081215567168 info pendaftaran')).toBe(true);

      // Negative assertions: random chatter without trigger
      expect(groupMentionRegex.test('Halo selamat pagi semuanya')).toBe(false);
      expect(groupMentionRegex.test('Apakah ada yang punya nomor admin?')).toBe(false);
    });

    it('isBoonPilotWakeWordTriggered triggers on group messages with mention keywords', () => {
      // @boon
      const resBoon = isBoonPilotWakeWordTriggered('@boon halo', true, 'WHATSAPP');
      expect(resBoon.triggered).toBe(true);
      expect(resBoon.cleanText).toBe('halo');

      // @boontrack
      const resBt = isBoonPilotWakeWordTriggered('@boontrack cara buka toko', true, 'WHATSAPP');
      expect(resBt.triggered).toBe(true);
      expect(resBt.cleanText).toBe('cara buka toko');

      // @081215567168
      const resNum = isBoonPilotWakeWordTriggered('@081215567168 apa itu boontrack', true, 'WHATSAPP');
      expect(resNum.triggered).toBe(true);
      expect(resNum.cleanText).toBe('apa itu boontrack');

      // Ordinary chatter without mention is ignored
      const resChatter = isBoonPilotWakeWordTriggered('halo guys ada info?', true, 'WHATSAPP');
      expect(resChatter.triggered).toBe(false);
    });
  });

  describe('2. Dynamic Affiliate URL Resolution (§43.4)', () => {
    it('resolves Kang Sakti (buzzerukm) community binding dynamically with metadata.register_url and demo_url', async () => {
      const mockCommunitySourceId = '120363430879517540@g.us';
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              id: '70b4872c-3b19-4425-a6d6-4ee126548b19',
              binding_id: 'whatsapp:120363430879517540@g.us:affiliate_context',
              affiliate_id: 'buzzerukm',
              tenant_id: null,
              tenant_slug: null,
              community_source_id: mockCommunitySourceId,
              channel_type: 'whatsapp',
              channel_name: 'OPTIMASI IKLAN CT',
              context: 'AFFILIATE_CONTEXT',
              capabilities: ['referral_acquisition', 'registration_link', 'affiliate_notification'],
              demo_url: 'https://shop.boontrack.com/buzzerukm/p/ctwa-mastery-7day',
              is_active: true,
              metadata: {
                register_url: 'https://buzzerukm.boontrack.com/register',
                fallback_register: 'https://buzzerukm.boontrack.com/register',
              },
            },
            error: null,
          }),
        }),
      };

      const ctx = await resolveCommunityContext(mockCommunitySourceId, mockSupabase);

      // Must strictly resolve to https://buzzerukm.boontrack.com/register
      expect(ctx.registration_url).toBe('https://buzzerukm.boontrack.com/register');

      // Must strictly resolve to demo URL https://shop.boontrack.com/buzzerukm/p/ctwa-mastery-7day
      expect(ctx.demo_store_url).toBe('https://shop.boontrack.com/buzzerukm/p/ctwa-mastery-7day');

      expect(ctx.affiliate_id).toBe('buzzerukm');
      expect(ctx.channel_name).toBe('OPTIMASI IKLAN CT');
    });

    it('implements canon fallback contract: binding.metadata?.register_url || https://shop.boontrack.com/register?ref=${affiliateId}', async () => {
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              binding_id: 'wa:general_affiliate',
              affiliate_id: 'mentor_digital',
              community_source_id: '120363999999999999@g.us',
              demo_url: 'https://shop.boontrack.com/mentor_digital/p/kelas-fb-ads',
              is_active: true,
              metadata: {}, // no custom register_url
            },
            error: null,
          }),
        }),
      };

      const ctx = await resolveCommunityContext('120363999999999999@g.us', mockSupabase);
      expect(ctx.registration_url).toBe('https://shop.boontrack.com/register?ref=mentor_digital');
      expect(ctx.demo_store_url).toBe('https://shop.boontrack.com/mentor_digital/p/kelas-fb-ads');
    });
  });
});
