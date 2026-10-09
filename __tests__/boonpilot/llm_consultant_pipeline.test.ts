/**
 * __tests__/boonpilot/llm_consultant_pipeline.test.ts
 *
 * Unit tests for:
 * 1. BoonPilot Gemini 3.8 Flash LLM invocation & signature consultant persona ("Halo kak, bantu jawab ya!").
 * 2. Enriched System Prompt (Meta Pixel & CAPI Purchase Event, Checkout Lite, Dynamic QRIS 0% MDR, Cek Ongkir).
 * 3. Resilient fallback when API is unavailable.
 */

import {
  processBoonPilotPlatformChat,
  buildBoonPilotSystemPrompt,
} from '@/lib/boonpilot/platform-engine';

describe('BoonPilot LLM Consultant & Enriched Knowledge Pipeline', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('1. Enriched System Prompt Knowledge Base', () => {
    it('injects Meta Pixel & CAPI Purchase Event knowledge into system prompt', () => {
      const prompt = buildBoonPilotSystemPrompt({
        isRegistered: false,
        role: 'GUEST',
        senderPhone: '089999999999',
        normalizedPhone: '6289999999999',
      });

      expect(prompt).toContain('EKOSISTEM PERIKLANAN DIGITAL (META ADS, CTWA, PIXEL & SERVER-SIDE CAPI)');
      expect(prompt).toContain('Purchase');
      expect(prompt).toContain('PAID');
      expect(prompt).toContain('iOS 14.5+');
      expect(prompt).toContain('Checkout Lite');
      expect(prompt).toContain('Pro Scale');
    });

    it('injects Checkout Lite, Dynamic QRIS 0% MDR, and Courier Aggregator knowledge', () => {
      const prompt = buildBoonPilotSystemPrompt({
        isRegistered: false,
        role: 'GUEST',
        senderPhone: '089999999999',
        normalizedPhone: '6289999999999',
      });

      expect(prompt).toContain('PAKET CHECKOUT LITE (RP 59.000 / BULAN)');
      expect(prompt).toContain('0% MDR');
      expect(prompt).toContain('Non-Custodial');
      expect(prompt).toContain('Dynamic QRIS EMVCo');
      expect(prompt).toContain('AGREGATOR LOGISTIK & CEK ONGKIR OTOMATIS');
      expect(prompt).toContain('BYOK');
      expect(prompt).toContain('Lincah');
      expect(prompt).toContain('Biteship');
    });

    it('mandates signature persona greeting "Halo kak, bantu jawab ya!" in prompt', () => {
      const guestPrompt = buildBoonPilotSystemPrompt({
        isRegistered: false,
        role: 'GUEST',
        senderPhone: '089999999999',
        normalizedPhone: '6289999999999',
      });
      expect(guestPrompt).toContain('Halo kak, bantu jawab ya!');

      const merchantPrompt = buildBoonPilotSystemPrompt({
        isRegistered: true,
        role: 'MERCHANT',
        senderPhone: '081234567890',
        normalizedPhone: '6281234567890',
        tenant: {
          id: 'test-uuid',
          slug: 'toko-test',
          name: 'Toko Test',
          tier: 'PRO_SCALE',
          owner_name: 'Budi',
        },
      });
      expect(merchantPrompt).toContain('Halo kak, bantu jawab ya!');
    });

    it('mandates concise, to-the-point response rules to fit 1 WhatsApp bubble', () => {
      const prompt = buildBoonPilotSystemPrompt({
        isRegistered: false,
        role: 'GUEST',
        senderPhone: '089999999999',
        normalizedPhone: '6289999999999',
      });

      expect(prompt).toContain('ATURAN JAWABAN PADAT, TO THE POINT & TUNTAS (1 BALON CHAT');
      expect(prompt).toContain('1 balon chat');
      expect(prompt).toContain('tanpa bertele-tele');
    });
  });

  describe('2. Gemini 3.8 Flash Dynamic LLM Invocation', () => {
    it('calls Gemini REST API with gemini-3.8-flash and returns dynamic consultant response', async () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key-123';
      process.env.AI_MODEL_NAME = 'gemini-3.8-flash';

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'Halo kak, bantu jawab ya!\n\nUntuk mengoptimalkan iklan Meta, BoonTrack secara otomatis menembakkan event Purchase server-side saat order berstatus PAID. Ini mengatasi data drop pada iOS 14.5+.',
                  },
                ],
              },
            },
          ],
        }),
      });
      global.fetch = mockFetch as any;

      const result = await processBoonPilotPlatformChat({
        senderPhone: '089999999999',
        message: 'Bagaimana cara mengatasi drop sinyal iklan Meta di iOS 14.5?',
      });

      const geminiCalls = mockFetch.mock.calls.filter(
        (c: any) => typeof c[0] === 'string' && c[0].includes('generativelanguage.googleapis.com')
      );
      expect(geminiCalls.length).toBe(1);
      const callUrl = geminiCalls[0][0];
      expect(callUrl).toContain('gemini-3.8-flash:generateContent?key=test-gemini-key-123');

      const requestPayload = JSON.parse(geminiCalls[0][1].body);
      expect(requestPayload.generationConfig.maxOutputTokens).toBe(2048);

      expect(result.reply).toContain('Halo kak, bantu jawab ya!');
      expect(result.reply).toContain('Purchase server-side');
      expect(result.reply).toContain('iOS 14.5+');
      expect(result.role).toBe('GUEST');
      expect(result.isDeterministicMatch).toBe(true);
    });

    it('prepends signature opening if LLM response misses it', async () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key-123';

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'Paket Checkout Lite seharga Rp 59.000/bln sudah mencakup QRIS dinamis 0% MDR dan checkout instan.',
                  },
                ],
              },
            },
          ],
        }),
      });
      global.fetch = mockFetch as any;

      const result = await processBoonPilotPlatformChat({
        senderPhone: '089999999999',
        message: 'Ada paket murah?',
      });

      expect(result.reply.startsWith('Halo kak, bantu jawab ya!')).toBe(true);
      expect(result.reply).toContain('Checkout Lite');
    });

    it('falls back to deterministic templates gracefully when Gemini API returns 500 error', async () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key-123';

      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });
      global.fetch = mockFetch as any;

      const result = await processBoonPilotPlatformChat({
        senderPhone: '089999999999',
        message: 'Paket hemat ada?',
      });

      // Must fall back to Checkout Lite template without crashing
      expect(result.reply).toContain('Halo kak, bantu jawab ya!');
      expect(result.reply).toContain('Checkout Lite');
      expect(result.reply).toContain('59.000');
    });
  });
});
