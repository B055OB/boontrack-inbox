import { handleTelegramUpdate } from '@/lib/telegram/boonpilot-telegram';

// Mock global fetch for Telegram API
global.fetch = jest.fn((url: any) => {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ ok: true, result: { message_id: 12345 } }),
  } as any);
}) as any;

describe('BoonPilot Telegram Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Group Chat Wake Word Evaluation', () => {
    it('silently ignores group chatter without wake words', async () => {
      const update = {
        update_id: 1001,
        message: {
          message_id: 50,
          chat: { id: -100123456789, type: 'supergroup', title: 'Komunitas Seller' },
          from: { id: 98765, first_name: 'Budi' },
          text: 'Halo teman-teman semua, apa kabar hari ini?',
        },
      };

      const result = await handleTelegramUpdate(update);
      expect(result.handled).toBe(false);
      expect(result.reason).toBe('silent_ignore_group_chatter');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('processes group message when triggered by "@boontrack_bot"', async () => {
      const update = {
        update_id: 1002,
        message: {
          message_id: 51,
          chat: { id: -100123456789, type: 'supergroup', title: 'Komunitas Seller' },
          from: { id: 98765, first_name: 'Budi' },
          text: '@boontrack_bot bagaimana cara daftar toko baru?',
        },
      };

      const result = await handleTelegramUpdate(update);
      expect(result.handled).toBe(true);
      expect(result.chatId).toBe(-100123456789);
      expect(result.reply).toBeDefined();
      expect(global.fetch).toHaveBeenCalled();
    });

    it('processes group message when triggered by "boon" wake word', async () => {
      const update = {
        update_id: 1003,
        message: {
          message_id: 52,
          chat: { id: -100123456789, type: 'group', title: 'Group Diskusi' },
          from: { id: 98765, first_name: 'Budi' },
          text: 'boon tolong jelaskan fitur checkout tanpa login',
        },
      };

      const result = await handleTelegramUpdate(update);
      expect(result.handled).toBe(true);
      expect(result.reply).toBeDefined();
    });
  });

  describe('Private DM Evaluation', () => {
    it('processes all private DM messages normally without wake words', async () => {
      const update = {
        update_id: 1004,
        message: {
          message_id: 53,
          chat: { id: 123456789, type: 'private' },
          from: { id: 123456789, first_name: 'Alldy' },
          text: 'Halo saya ingin tanya paket langganan',
        },
      };

      const result = await handleTelegramUpdate(update);
      expect(result.handled).toBe(true);
      expect(result.chatId).toBe(123456789);
      expect(result.reply).toContain('Paket');
    });
  });

  describe('Callback Query (Inline Keyboard)', () => {
    it('handles callback query button presses', async () => {
      const update = {
        update_id: 1005,
        callback_query: {
          id: 'cb_123',
          from: { id: 123456789, first_name: 'Alldy' },
          message: {
            message_id: 54,
            chat: { id: 123456789, type: 'private' },
          },
          data: '💡 Apa itu BoonTrack?',
        },
      };

      const result = await handleTelegramUpdate(update);
      expect(result.handled).toBe(true);
      expect(result.chatId).toBe(123456789);
      expect(result.reply).toBeDefined();
    });
  });

  describe('Commands & Deep Linking Handlers', () => {
    it('replies directly to /id command with chat ID in both private and groups', async () => {
      const update = {
        update_id: 1006,
        message: {
          message_id: 55,
          chat: { id: -100987654321, type: 'group' },
          from: { id: 123456789, first_name: 'Seller' },
          text: '/id',
        },
      };

      const result = await handleTelegramUpdate(update);
      expect(result.handled).toBe(true);
      expect(result.chatId).toBe(-100987654321);
      expect(result.reply).toBe('Chat ID ini: `-100987654321`.');
    });

    it('replies with dashboard instructions when receiving plain /start', async () => {
      const update = {
        update_id: 1007,
        message: {
          message_id: 56,
          chat: { id: 987654321, type: 'private' },
          from: { id: 987654321, first_name: 'Seller' },
          text: '/start',
        },
      };

      const result = await handleTelegramUpdate(update);
      expect(result.handled).toBe(true);
      expect(result.chatId).toBe(987654321);
      expect(result.reply).toContain('Halo! ID Telegram kamu adalah: `987654321`');
    });
  });
});
