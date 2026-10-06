/**
 * __tests__/boonpilot/community_context_resolution.test.ts
 *
 * Unit tests for:
 * 1. Dynamic Community Context Resolution (lib/boonpilot/platform-engine.ts)
 *    - Querying channel_bindings by community_source_id (WhatsApp Group JID / Telegram Chat ID).
 *    - demo_store_url fallback to https://shop.boontrack.com/boon (no more toko-demo).
 *    - Kang Sakti (buzzerukm) custom domain https://buzzerukm.boontrack.com.
 *    - Other affiliates format https://shop.boontrack.com/?ref={referral_code}.
 *    - Direct chat fallback https://boontrack.com.
 * 2. System Context & Fallback Reply Injection
 *    - Uses demo_store_url when audience asks for sample store, catalog demo, or checkout flow.
 *    - Uses registration_url when audience asks how to register or create store.
 */

import {
  resolveCommunityContext,
  buildBoonPilotSystemPrompt,
  processBoonPilotPlatformChat,
} from '@/lib/boonpilot/platform-engine';

describe('BoonPilot Dynamic Community Context Resolution', () => {
  describe('1. resolveCommunityContext', () => {
    it('returns direct chat fallback when community_source_id is undefined or null', async () => {
      const ctx = await resolveCommunityContext(undefined);
      expect(ctx.demo_store_url).toBe('https://shop.boontrack.com/boon');
      expect(ctx.registration_url).toBe('https://boontrack.com');

      const ctxNull = await resolveCommunityContext(null);
      expect(ctxNull.demo_store_url).toBe('https://shop.boontrack.com/boon');
      expect(ctxNull.registration_url).toBe('https://boontrack.com');
    });

    it('returns direct chat fallback when binding is not found in database', async () => {
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };

      const ctx = await resolveCommunityContext('120363999999999999@g.us', mockSupabase);
      expect(ctx.demo_store_url).toBe('https://shop.boontrack.com/boon');
      expect(ctx.registration_url).toBe('https://boontrack.com');
    });

    it('resolves Kang Sakti (buzzerukm) to https://buzzerukm.boontrack.com', async () => {
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              binding_id: 'wa:buzzerukm_group',
              affiliate_id: 'buzzerukm',
              tenant_slug: 'buzzerukm',
              community_source_id: '120363430879517540@g.us',
              demo_url: 'https://shop.boontrack.com/toko-demo',
              is_active: true,
              metadata: {},
            },
            error: null,
          }),
        }),
      };

      const ctx = await resolveCommunityContext('120363430879517540@g.us', mockSupabase);
      // Kang Sakti special registration url
      expect(ctx.registration_url).toBe('https://buzzerukm.boontrack.com');
      // toko-demo is replaced by https://shop.boontrack.com/boon
      expect(ctx.demo_store_url).toBe('https://shop.boontrack.com/boon');
    });

    it('resolves other affiliates to https://shop.boontrack.com/?ref={referral_code}', async () => {
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              binding_id: 'wa:partner_scale',
              affiliate_id: 'sukses_bersama',
              tenant_slug: 'sukses-bersama',
              community_source_id: '120363111111111111@g.us',
              demo_url: 'https://shop.boontrack.com/sukses-bersama',
              is_active: true,
              metadata: {},
            },
            error: null,
          }),
        }),
      };

      const ctx = await resolveCommunityContext('120363111111111111@g.us', mockSupabase);
      expect(ctx.registration_url).toBe('https://shop.boontrack.com/?ref=sukses_bersama');
      expect(ctx.demo_store_url).toBe('https://shop.boontrack.com/sukses-bersama');
    });

    it('honors custom register_url in binding metadata if configured', async () => {
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              binding_id: 'wa:custom_reg',
              affiliate_id: 'aff_custom',
              community_source_id: '120363222222222222@g.us',
              demo_url: null,
              is_active: true,
              metadata: {
                register_url: 'https://join.affiliatesukses.com',
              },
            },
            error: null,
          }),
        }),
      };

      const ctx = await resolveCommunityContext('120363222222222222@g.us', mockSupabase);
      expect(ctx.registration_url).toBe('https://join.affiliatesukses.com');
      // Null demo url falls back to boon
      expect(ctx.demo_store_url).toBe('https://shop.boontrack.com/boon');
    });
  });

  describe('2. System Prompt & Fallback Resolution with Community Context', () => {
    it('injects dynamic demo_store_url and registration_url into buildBoonPilotSystemPrompt', () => {
      const prompt = buildBoonPilotSystemPrompt(
        {
          isRegistered: false,
          role: 'GUEST',
          senderPhone: '089999999999',
          normalizedPhone: '628999999999',
        },
        {
          demo_store_url: 'https://shop.boontrack.com/boon',
          registration_url: 'https://buzzerukm.boontrack.com',
        }
      );

      expect(prompt).toContain('https://shop.boontrack.com/boon');
      expect(prompt).toContain('https://buzzerukm.boontrack.com');
      expect(prompt).toContain('demo_store_url');
      expect(prompt).toContain('registration_url');
    });

    it('provides demo_store_url when audience asks for sample store, catalog demo, or checkout flow', async () => {
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              binding_id: 'wa:buzzerukm',
              affiliate_id: 'buzzerukm',
              community_source_id: '120363430879517540@g.us',
              demo_url: 'https://shop.boontrack.com/boon',
              is_active: true,
            },
            error: null,
          }),
        }),
      };

      const result = await processBoonPilotPlatformChat(
        {
          senderPhone: '6281234567890',
          message: 'bisa lihat contoh toko atau cek demo checkout?',
          community_source_id: '120363430879517540@g.us',
        },
        mockSupabase
      );

      expect(result.reply).toContain('https://shop.boontrack.com/boon');
      expect(result.reply).not.toContain('toko-demo');
      expect(result.isDeterministicMatch).toBe(true);
    });

    it('provides Kang Sakti registration_url when audience asks cara daftar in buzzerukm group', async () => {
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              binding_id: 'wa:buzzerukm',
              affiliate_id: 'buzzerukm',
              community_source_id: '120363430879517540@g.us',
              is_active: true,
            },
            error: null,
          }),
        }),
      };

      const result = await processBoonPilotPlatformChat(
        {
          senderPhone: '6281234567890',
          message: 'bagaimana cara daftar toko boontrack?',
          community_source_id: '120363430879517540@g.us',
        },
        mockSupabase
      );

      expect(result.reply).toContain('https://buzzerukm.boontrack.com');
      expect(result.isDeterministicMatch).toBe(true);
    });

    it('provides standard affiliate referral url when audience asks cara daftar in other group', async () => {
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              binding_id: 'wa:affiliate_sukses',
              affiliate_id: 'mitra_berkah',
              community_source_id: '120363555555555555@g.us',
              is_active: true,
            },
            error: null,
          }),
        }),
      };

      const result = await processBoonPilotPlatformChat(
        {
          senderPhone: '6281234567890',
          message: 'cara buat akun baru gimana ya?',
          community_source_id: '120363555555555555@g.us',
        },
        mockSupabase
      );

      expect(result.reply).toContain('https://shop.boontrack.com/?ref=mitra_berkah');
      expect(result.isDeterministicMatch).toBe(true);
    });

    it('falls back to https://boontrack.com when direct chat asks cara daftar without binding', async () => {
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };

      const result = await processBoonPilotPlatformChat(
        {
          senderPhone: '6289999999999',
          message: 'cara daftar toko',
        },
        mockSupabase
      );

      expect(result.reply).toContain('https://boontrack.com');
      expect(result.isDeterministicMatch).toBe(true);
    });
  });
});
