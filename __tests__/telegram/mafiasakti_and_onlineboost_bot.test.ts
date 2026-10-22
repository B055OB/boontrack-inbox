/**
 * __tests__/telegram/mafiasakti_and_onlineboost_bot.test.ts
 *
 * Dedicated Test Suite for:
 * 1. MafiaSakti Group (-1001910259389) Dynamic Binding Synchronization:
 *    - channel_bindings resolution (Register URL: https://buzzerukm.boontrack.com/register, Demo URL: https://shop.boontrack.com/buzzerukm/p/ctwa-mastery-7day)
 *    - Static fallback replacement (shop.boontrack.com/boon & boontrack.com/register)
 * 2. OnlineBoost Supergroup (-1004371114362) Onboarding & Gated Progression:
 *    - new_chat_members event welcome greeting routed to topic #Basic-Fase1 (thread ID: 5)
 *    - Checklist Guide Fase 1 (/fase1, checklist, langkah awal, fase 1, tugas fase 1) to thread ID: 5
 *    - Gatekeeper Anti-Bocor Fase 2 & 3 (fase 2, fase 3, kapan iklan, bocoran, dll.) to thread ID: 5
 *    - Topic thread binding verification (message_thread_id: 5)
 */

jest.unmock('@/lib/supabaseClient');
jest.unmock('@supabase/supabase-js');

import {
  handleTelegramUpdate,
  generateAffiliateSalesAiReply,
  sendTelegramMessage,
} from '@/lib/telegram/boonpilot-telegram';

// Track payloads sent to Telegram Bot API
let capturedTelegramPayloads: any[] = [];

function createPostgrestMockResponse(data: any) {
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {
      get: (h: string) => {
        const lower = h.toLowerCase();
        if (lower === 'content-type') return 'application/json';
        if (lower === 'content-range') return `0-${Array.isArray(data) ? data.length - 1 : 0}/${Array.isArray(data) ? data.length : 1}`;
        return null;
      },
    },
    text: () => Promise.resolve(JSON.stringify(data)),
    json: () => Promise.resolve(data),
  } as any);
}

global.fetch = jest.fn((url: any, opts: any) => {
  const urlStr = String(url);
  if (urlStr.includes('api.telegram.org/bot')) {
    if (opts && opts.body) {
      try {
        const parsed = JSON.parse(opts.body);
        capturedTelegramPayloads.push(parsed);
      } catch {}
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      text: () => Promise.resolve(JSON.stringify({ ok: true, result: { message_id: 9999 } })),
      json: () => Promise.resolve({ ok: true, result: { message_id: 9999 } }),
    } as any);
  }

  // Mock Supabase channel_bindings queries
  if (urlStr.includes('channel_bindings')) {
    if (urlStr.includes('1910259389')) {
      return createPostgrestMockResponse([
        {
          id: '7e7ad5a8-0a49-460c-b069-f710d5e3cd30',
          binding_id: 'telegram:-1001910259389:affiliate_context',
          affiliate_id: 'buzzerukm',
          tenant_id: null,
          tenant_slug: null,
          community_source_id: '-1001910259389',
          channel_type: 'telegram',
          channel_name: 'WAITINGLIST PRODUK DIGITAL - MAFIASAKTI',
          context: 'AFFILIATE_CONTEXT',
          capabilities: [
            'referral_acquisition',
            'registration_link',
            'affiliate_notification',
          ],
          demo_url: 'https://shop.boontrack.com/buzzerukm/p/ctwa-mastery-7day',
          is_active: true,
          metadata: {
            register_url: 'https://buzzerukm.boontrack.com/register',
            fallback_register: 'https://buzzerukm.boontrack.com/register',
          },
        },
      ]);
    }

    if (urlStr.includes('4371114362')) {
      return createPostgrestMockResponse([
        {
          id: 'fba43e59-9341-4a12-a638-ab6be549286f',
          binding_id: 'telegram:-1004371114362:store_context',
          affiliate_id: null,
          tenant_id: 'e12acd29-6c18-487b-ade7-5422878c1c36',
          tenant_slug: 'onlineboost',
          community_source_id: '-1004371114362',
          channel_type: 'telegram',
          channel_name: 'OnlineBoost | CTWA Scale Engine Batch 1',
          context: 'STORE_CONTEXT',
          capabilities: [
            'onboarding_guide',
            'gated_progression',
            'fase1_checklist',
          ],
          demo_url: 'https://shop.boontrack.com/onlineboost',
          is_active: true,
          metadata: {
            batch: 1,
            fase1_topic: '#Basic-Fase1',
            register_url: 'https://shop.boontrack.com/register',
            fase1_thread_id: 5,
          },
        },
      ]);
    }
  }

  // Mock Supabase tenant_telegram_bots queries
  if (urlStr.includes('tenant_telegram_bots')) {
    if (urlStr.includes('boonshop')) {
      return createPostgrestMockResponse([
        {
          id: 'bot-boonshop-uuid',
          tenant_id: 'tenant-boonshop-uuid',
          bot_username: 'boonshop_bot',
          bot_token: 'mock_token_boonshop_123',
          is_active: true,
        },
      ]);
    }
    return createPostgrestMockResponse([
      {
        id: 'bot-onlineboost-uuid',
        tenant_id: 'e12acd29-6c18-487b-ade7-5422878c1c36',
        bot_username: 'onlineboostbot',
        bot_token: 'mock_token_onlineboost_123',
        is_active: true,
      },
    ]);
  }

  return createPostgrestMockResponse([]);
}) as any;

describe('MafiaSakti & OnlineBoost Telegram Bot Integration (@boonshop_bot)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedTelegramPayloads = [];
  });

  // =========================================================================
  // 1. MAFIASAKTI GROUP (-1001910259389) SYNCHRONIZATION
  // =========================================================================
  describe('1. MafiaSakti Group (-1001910259389) Synchronization', () => {
    const MAFIASAKTI_CHAT_ID = -1001910259389;

    it('resolves dynamic binding URLs and sends official greeting for brief hello/trigger', async () => {
      const update = {
        update_id: 7001,
        message: {
          message_id: 301,
          chat: {
            id: MAFIASAKTI_CHAT_ID,
            type: 'supergroup',
            title: 'WAITINGLIST PRODUK DIGITAL - MAFIASAKTI',
          },
          from: { id: 111222, first_name: 'Kang Member' },
          text: '@boonshop_bot halo',
        },
      };

      const result = await handleTelegramUpdate(update);

      expect(result.handled).toBe(true);
      expect(result.chatId).toBe(MAFIASAKTI_CHAT_ID);
      expect(result.role).toBe('AFFILIATE_COMMUNITY_LEADER');
      expect(result.activeEngine).toBe('AFFILIATE_COMMUNITY_POOL');

      // Verifies MafiaSakti specific URLs
      expect(result.reply).toContain('https://buzzerukm.boontrack.com/register');
      expect(result.reply).toContain('https://shop.boontrack.com/buzzerukm/p/ctwa-mastery-7day');
      // Must not contain default platform fallbacks
      expect(result.reply).not.toContain('https://shop.boontrack.com/boon');

      // Check outbound payload and buttons
      expect(capturedTelegramPayloads.length).toBeGreaterThan(0);
      const lastPayload = capturedTelegramPayloads[capturedTelegramPayloads.length - 1];
      expect(lastPayload.chat_id).toBe(MAFIASAKTI_CHAT_ID);
      expect(lastPayload.disable_web_page_preview).toBe(true);

      const buttons = lastPayload.reply_markup?.inline_keyboard?.flat() || [];
      const demoBtn = buttons.find((b: any) => b.text?.includes('Demo'));
      const regBtn = buttons.find((b: any) => b.text?.includes('Daftar'));

      expect(demoBtn?.url).toBe('https://shop.boontrack.com/buzzerukm/p/ctwa-mastery-7day');
      expect(regBtn?.url).toBe('https://buzzerukm.boontrack.com/register');
    });

    it('replaces static fallback links (shop.boontrack.com/boon & boontrack.com/register) in conversational replies', async () => {
      // 1. Query for Demo Store
      const updateDemo = {
        update_id: 7002,
        message: {
          message_id: 302,
          chat: {
            id: MAFIASAKTI_CHAT_ID,
            type: 'supergroup',
            title: 'WAITINGLIST PRODUK DIGITAL - MAFIASAKTI',
          },
          from: { id: 111223, first_name: 'Budi' },
          text: '@boonshop_bot bisa lihat contoh demo toko?',
        },
      };

      const resultDemo = await handleTelegramUpdate(updateDemo);
      expect(resultDemo.handled).toBe(true);
      expect(resultDemo.chatId).toBe(MAFIASAKTI_CHAT_ID);
      expect(resultDemo.reply).toContain('https://shop.boontrack.com/buzzerukm/p/ctwa-mastery-7day');
      expect(resultDemo.reply).not.toContain('https://shop.boontrack.com/boon');

      // 2. Query for Registration Link
      const updateReg = {
        update_id: 7003,
        message: {
          message_id: 303,
          chat: {
            id: MAFIASAKTI_CHAT_ID,
            type: 'supergroup',
            title: 'WAITINGLIST PRODUK DIGITAL - MAFIASAKTI',
          },
          from: { id: 111224, first_name: 'Candra' },
          text: '@boonshop_bot bagaimana cara daftar akun toko baru?',
        },
      };

      const resultReg = await handleTelegramUpdate(updateReg);
      expect(resultReg.handled).toBe(true);
      expect(resultReg.chatId).toBe(MAFIASAKTI_CHAT_ID);
      expect(resultReg.reply).toContain('https://buzzerukm.boontrack.com/register');
      expect(resultReg.reply).not.toMatch(/https?:\/\/(?:shop\.)?boontrack\.com\/register\b/);

      // Verify buttons
      const lastPayload = capturedTelegramPayloads[capturedTelegramPayloads.length - 1];
      const buttons = lastPayload.reply_markup?.inline_keyboard?.flat() || [];
      const regBtn = buttons.find((b: any) => b.text?.includes('Daftar'));
      expect(regBtn?.url).toBe('https://buzzerukm.boontrack.com/register');
    });

    it('generateAffiliateSalesAiReply substitutes static fallback links with provided options', async () => {
      const reply = await generateAffiliateSalesAiReply({
        userQuestion: 'Bisa minta link daftar dan demo toko?',
        senderName: 'SaktiMember',
        affiliateId: 'buzzerukm',
        partnerName: 'Kang Sakti',
        demoUrl: 'https://shop.boontrack.com/buzzerukm/p/ctwa-mastery-7day',
        registerUrl: 'https://buzzerukm.boontrack.com/register',
        channelName: 'WAITINGLIST PRODUK DIGITAL - MAFIASAKTI',
      });

      expect(reply).toBeDefined();
      expect(reply).not.toContain('shop.boontrack.com/boon');
    });
  });

  // =========================================================================
  // 2. ONLINEBOOST SUPERGROUP (-1004371114362) ONBOARDING & GATED PROGRESSION
  // =========================================================================
  describe('2. OnlineBoost Supergroup (-1004371114362) Batch 1 Onboarding & Gated Progression', () => {
    const ONLINEBOOST_CHAT_ID = -1004371114362;
    const FASE1_THREAD_ID = 5;

    // ── 2.1 EVENT MEMBER BARU (new_chat_members) ──
    describe('2.1 new_chat_members Welcome Event', () => {
      it('greets new joining member with personalized name and 4 foundation tasks into topic #Basic-Fase1 (thread ID: 5)', async () => {
        const update = {
          update_id: 8001,
          message: {
            message_id: 401,
            chat: {
              id: ONLINEBOOST_CHAT_ID,
              type: 'supergroup',
              title: 'OnlineBoost | CTWA Scale Engine Batch 1',
            },
            new_chat_members: [
              {
                id: 555666777,
                is_bot: false,
                first_name: 'Reyhan',
                username: 'reyhan_ctwa',
              },
            ],
          },
        };

        const result = await handleTelegramUpdate(update);

        expect(result.handled).toBe(true);
        expect(result.chatId).toBe(ONLINEBOOST_CHAT_ID);
        expect(result.role).toBe('ONBOARDING_GUIDE');
        expect(result.activeEngine).toBe('ONLINEBOOST_NEW_MEMBER_WELCOME');

        // Check personalized text
        expect(result.reply).toContain('Halo Kak Reyhan! Selamat datang di OnlineBoost | CTWA Scale Engine Batch 1 🚀');
        expect(result.reply).toContain('Untuk unlock materi Fase 2 (Video Kreatif 9-Scene) dan Fase 3 (Ads Analysis & Scaling), selesaikan fondasi di Fase 1 terlebih dahulu:');
        expect(result.reply).toContain('📋 TASK PRAKTIKUM FASE 1:');
        expect(result.reply).toContain('Setup Toko Digital BoonTrack (Pilih Ads Performance 7 Days Trial).');
        expect(result.reply).toContain('Aktivasi Kasir QRIS Mandiri (0% MDR fee).');
        expect(result.reply).toContain('Sambungkan Bot WhatsApp ke engine.');
        expect(result.reply).toContain('Siapkan Akun Whitelist (WL).');
        expect(result.reply).toContain('🎁 KLAIM BONUS GRANT 1 BULAN (Rp299.000):');
        expect(result.reply).toContain('Tuntaskan poin 1–3, lalu kirimkan link toko Kakak di topik #Basic-Fase1 (thread ID: 5) untuk aktivasi bonus akses 1 bulan penuh!');
        expect(result.reply).toContain('Ketik /fase1 kapan saja untuk melihat checklist lengkapnya. Selamat berpraktik!');

        // Verify outbound Telegram API payload
        expect(capturedTelegramPayloads.length).toBeGreaterThan(0);
        const outbound = capturedTelegramPayloads[capturedTelegramPayloads.length - 1];
        expect(outbound.chat_id).toBe(ONLINEBOOST_CHAT_ID);
        expect(outbound.message_thread_id).toBe(FASE1_THREAD_ID);
        expect(outbound.disable_web_page_preview).toBe(true);
      });

      it('ignores bot additions in new_chat_members', async () => {
        const update = {
          update_id: 8002,
          message: {
            message_id: 402,
            chat: {
              id: ONLINEBOOST_CHAT_ID,
              type: 'supergroup',
              title: 'OnlineBoost | CTWA Scale Engine Batch 1',
            },
            new_chat_members: [
              {
                id: 999888777,
                is_bot: true,
                first_name: 'Helper Bot',
                username: 'some_helper_bot',
              },
            ],
          },
        };

        const result = await handleTelegramUpdate(update);
        expect(result.handled).toBe(true);
        expect(result.reason).toBe('new_bot_member_ignored');
        expect(capturedTelegramPayloads.length).toBe(0);
      });
    });

    // ── 2.2 CHECKLIST GUIDE FASE 1 (/fase1 & KEYWORDS) ──
    describe('2.2 Checklist Guide Fase 1', () => {
      it('responds to command "/fase1" with foundation tasks and topic #Basic-Fase1 thread binding', async () => {
        const update = {
          update_id: 8003,
          message: {
            message_id: 403,
            chat: {
              id: ONLINEBOOST_CHAT_ID,
              type: 'supergroup',
              title: 'OnlineBoost | CTWA Scale Engine Batch 1',
            },
            from: { id: 555111, first_name: 'Dinda' },
            text: '/fase1',
          },
        };

        const result = await handleTelegramUpdate(update);

        expect(result.handled).toBe(true);
        expect(result.role).toBe('ONBOARDING_GUIDE');
        expect(result.activeEngine).toBe('ONLINEBOOST_FASE1_CHECKLIST');

        expect(result.reply).toContain('TASK PRAKTIKUM FASE 1:');
        expect(result.reply).toContain('Setup Toko Digital BoonTrack (Pilih Ads Performance 7 Days Trial).');
        expect(result.reply).toContain('Aktivasi Kasir QRIS Mandiri (0% MDR fee).');
        expect(result.reply).toContain('Sambungkan Bot WhatsApp ke engine.');
        expect(result.reply).toContain('Siapkan Akun Whitelist (WL).');
        expect(result.reply).toContain('KLAIM BONUS GRANT 1 BULAN (Rp299.000):');
        expect(result.reply).toContain('topik #Basic-Fase1 (thread ID: 5)');

        const outbound = capturedTelegramPayloads[capturedTelegramPayloads.length - 1];
        expect(outbound.chat_id).toBe(ONLINEBOOST_CHAT_ID);
        expect(outbound.message_thread_id).toBe(FASE1_THREAD_ID);
        expect(outbound.reply_to_message_id).toBe(403);
      });

      it('responds to keyword "checklist" with Fase 1 checklist in OnlineBoost supergroup', async () => {
        const update = {
          update_id: 8004,
          message: {
            message_id: 404,
            chat: {
              id: ONLINEBOOST_CHAT_ID,
              type: 'supergroup',
              title: 'OnlineBoost | CTWA Scale Engine Batch 1',
            },
            from: { id: 555112, first_name: 'Fandi' },
            text: 'Halo min minta info checklist praktikumnya dong',
          },
        };

        const result = await handleTelegramUpdate(update);

        expect(result.handled).toBe(true);
        expect(result.activeEngine).toBe('ONLINEBOOST_FASE1_CHECKLIST');
        expect(result.reply).toContain('TASK PRAKTIKUM FASE 1:');

        const outbound = capturedTelegramPayloads[capturedTelegramPayloads.length - 1];
        expect(outbound.message_thread_id).toBe(FASE1_THREAD_ID);
      });

      it('responds to keywords "langkah awal" and "tugas fase 1"', async () => {
        const update1 = {
          update_id: 8005,
          message: {
            message_id: 405,
            chat: { id: ONLINEBOOST_CHAT_ID, type: 'supergroup' },
            from: { id: 555113, first_name: 'Gilang' },
            text: 'langkah awal apa yang harus dikerjakan?',
          },
        };

        const result1 = await handleTelegramUpdate(update1);
        expect(result1.handled).toBe(true);
        expect(result1.activeEngine).toBe('ONLINEBOOST_FASE1_CHECKLIST');

        const update2 = {
          update_id: 8006,
          message: {
            message_id: 406,
            chat: { id: ONLINEBOOST_CHAT_ID, type: 'supergroup' },
            from: { id: 555114, first_name: 'Hana' },
            text: 'apa tugas fase 1 batch 1 ini?',
          },
        };

        const result2 = await handleTelegramUpdate(update2);
        expect(result2.handled).toBe(true);
        expect(result2.activeEngine).toBe('ONLINEBOOST_FASE1_CHECKLIST');
      });
    });

    // ── 2.3 GATEKEEPER ANTI-BOCOR FASE 2 & 3 ──
    describe('2.3 Gatekeeper Anti-Bocor Fase 2 & 3', () => {
      const gatekeeperTriggers = [
        'min kapan materi fase 2 dibuka?',
        'apakah materi fase 3 sudah bisa diakses?',
        'kapan mulai iklan ya mas?',
        'bisa minta bocoran materi video?',
        'kapan materi selanjutnya diupload?',
        'info akses studio video dong',
        'kapan diajarin ads analysis?',
        'ada tips scaling hacks gak min?',
      ];

      for (const promptText of gatekeeperTriggers) {
        it(`intercepts inquiry "${promptText}" with Gated Progression message`, async () => {
          const update = {
            update_id: 8010,
            message: {
              message_id: 410,
              chat: {
                id: ONLINEBOOST_CHAT_ID,
                type: 'supergroup',
                title: 'OnlineBoost | CTWA Scale Engine Batch 1',
              },
              from: { id: 555120, first_name: 'Irvan' },
              text: promptText,
            },
          };

          const result = await handleTelegramUpdate(update);

          expect(result.handled).toBe(true);
          expect(result.role).toBe('GATEKEEPER');
          expect(result.activeEngine).toBe('ONLINEBOOST_GATED_PROGRESSION');

          // Check educational and commitment enforcement message
          expect(result.reply).toContain('MATERI FASE 2 & FASE 3 TERKUNCI!');
          expect(result.reply).toContain('Fase 2 (Video Kreatif 9-Scene)');
          expect(result.reply).toContain('Fase 3 (Ads Analysis & Scaling)');
          expect(result.reply).toContain('Aturan Gated Progression Batch 1:');
          expect(result.reply).toContain('Kami tidak membuka materi scaling sebelum fondasi funnel & teknis toko Kakak siap 100%');
          expect(result.reply).toContain('topik #Basic-Fase1 (thread ID: 5)');

          // Verify thread binding to #Basic-Fase1
          const outbound = capturedTelegramPayloads[capturedTelegramPayloads.length - 1];
          expect(outbound.chat_id).toBe(ONLINEBOOST_CHAT_ID);
          expect(outbound.message_thread_id).toBe(FASE1_THREAD_ID);
          expect(outbound.reply_to_message_id).toBe(410);
        });
      }
    });

    // ── 2.4 TOPIC THREAD BINDING IN SENDTELEGRAMMESSAGE ──
    describe('2.4 sendTelegramMessage Topic Thread Binding Options', () => {
      it('honors messageThreadId option in outbound sendMessage payload', async () => {
        const response = await sendTelegramMessage(ONLINEBOOST_CHAT_ID, 'Test Thread Message', {
          messageThreadId: 5,
        });

        expect(response.ok).toBe(true);
        const lastPayload = capturedTelegramPayloads[capturedTelegramPayloads.length - 1];
        expect(lastPayload.chat_id).toBe(ONLINEBOOST_CHAT_ID);
        expect(lastPayload.message_thread_id).toBe(5);
      });
    });
  });
});
