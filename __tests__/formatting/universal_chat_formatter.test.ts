import {
  formatToWhatsAppMarkdown,
  formatToTelegramHtml,
  formatToTelegramMarkdown,
} from '@/lib/formatting/universal-chat-formatter';
import { handleTelegramUpdate, sendTelegramMessage } from '@/lib/telegram/boonpilot-telegram';
import { sendEvolutionTextMessage } from '@/lib/whatsapp/evolution-webhook-handler';
import { sendWhatsAppSessionMessage } from '@/lib/whatsapp';

describe('Universal Chat Formatter & Telegram Group Integration', () => {
  describe('Universal Chat Formatter Unit Tests', () => {
    it('converts AI Markdown bold to WhatsApp native asterisks', () => {
      const input = 'Halo **Budi**, pesanan **#ORD-999** sudah diproses!';
      const result = formatToWhatsAppMarkdown(input);
      expect(result).toBe('Halo *Budi*, pesanan *#ORD-999* sudah diproses!');
    });

    it('converts triple asterisks to WhatsApp bold-italic', () => {
      const input = 'Pemberitahuan: ***PENTING SEKALI*** untuk dibaca.';
      const result = formatToWhatsAppMarkdown(input);
      expect(result).toBe('Pemberitahuan: *_PENTING SEKALI_* untuk dibaca.');
    });

    it('converts AI Markdown to Telegram HTML properly', () => {
      const input = 'Halo **BoonTrack**! Silakan cek *katalog* dan _panduan_ di [Web](https://boontrack.com). Simbol: a < b & c > d.';
      const result = formatToTelegramHtml(input);
      expect(result).toContain('<b>BoonTrack</b>');
      expect(result).toContain('<i>katalog</i>');
      expect(result).toContain('<i>panduan</i>');
      expect(result).toContain('<a href="https://boontrack.com">Web</a>');
      expect(result).toContain('&amp;');
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
    });

    it('preserves code blocks and inline code in Telegram HTML without breaking entities', () => {
      const input = 'Gunakan perintah `npm run dev <flag>` atau:\n```bash\ngit commit -m "update & fix"\n```';
      const result = formatToTelegramHtml(input);
      expect(result).toContain('<code>npm run dev &lt;flag&gt;</code>');
      expect(result).toContain('<pre><code>git commit -m "update &amp; fix"</code></pre>');
    });

    it('handles empty or non-string gracefully', () => {
      expect(formatToWhatsAppMarkdown('')).toBe('');
      expect(formatToTelegramHtml('')).toBe('');
      expect(formatToTelegramMarkdown('')).toBe('');
    });
  });

  describe('Telegram Group Silence Default Welcome', () => {
    let sentPayloads: any[] = [];

    beforeEach(() => {
      sentPayloads = [];
      global.fetch = jest.fn((url: any, opts: any) => {
        if (opts && opts.body) {
          try {
            sentPayloads.push(JSON.parse(opts.body));
          } catch {}
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, result: { message_id: 777 } }),
        } as any);
      }) as any;
    });

    it('silently ignores general group chatter and does NOT reply or send welcome greeting', async () => {
      const update = {
        update_id: 9001,
        message: {
          message_id: 1,
          chat: { id: -100998877, type: 'group', title: 'Komunitas Usaha' },
          from: { id: 111, first_name: 'Anto' },
          text: 'Pagi kawan-kawan, ada rekomendasi vendor kemasan?',
        },
      };

      const result = await handleTelegramUpdate(update);
      expect(result.handled).toBe(false);
      expect(result.reason).toBe('silent_ignore_group_chatter');
      expect(sentPayloads.length).toBe(0);
    });

    it('silently ignores mention of other non-bot users in group chatter', async () => {
      const update = {
        update_id: 9002,
        message: {
          message_id: 2,
          chat: { id: -100998877, type: 'supergroup', title: 'Komunitas UKM' },
          from: { id: 222, first_name: 'Beni' },
          text: '@chandra tolong cek dokumen di email ya',
        },
      };

      const result = await handleTelegramUpdate(update);
      expect(result.handled).toBe(false);
      expect(result.reason).toBe('silent_ignore_group_chatter');
      expect(sentPayloads.length).toBe(0);
    });

    it('replies to group command /id and includes parse_mode in request payload', async () => {
      const update = {
        update_id: 9003,
        message: {
          message_id: 3,
          chat: { id: -100998877, type: 'group' },
          from: { id: 333, first_name: 'Citra' },
          text: '/id',
        },
      };

      const result = await handleTelegramUpdate(update);
      expect(result.handled).toBe(true);
      expect(result.reply).toBe('Chat ID ini: `-100998877`.');
      expect(sentPayloads.length).toBeGreaterThan(0);
      expect(sentPayloads[0].parse_mode).toBeDefined();
    });

    it('does NOT send retail store welcome template on explicit bot greeting in group', async () => {
      const update = {
        update_id: 9004,
        message: {
          message_id: 4,
          chat: { id: -100998877, type: 'supergroup' },
          from: { id: 444, first_name: 'Dedi' },
          text: '@boonshop_bot halo selamat pagi',
        },
      };

      const result = await handleTelegramUpdate(update);
      expect(result.handled).toBe(true);
      expect(result.reply).not.toContain('Selamat datang di Toko');
      const msgPayload = sentPayloads.find((p) => p.text);
      expect(msgPayload).toBeDefined();
      expect(msgPayload.parse_mode).toBe('HTML');
    });

    it('sendTelegramMessage always includes parse_mode and converts markdown to HTML by default', async () => {
      await sendTelegramMessage(-100998877, 'Halo **Semua**, ini pesan *penting*!');
      expect(sentPayloads.length).toBe(1);
      const payload = sentPayloads[0];
      expect(payload.parse_mode).toBe('HTML');
      expect(payload.text).toContain('<b>Semua</b>');
      expect(payload.text).toContain('<i>penting</i>');
    });
  });

  describe('WhatsApp Outbound Markdown Formatting', () => {
    let sentWaPayloads: any[] = [];

    beforeEach(() => {
      sentWaPayloads = [];
      global.fetch = jest.fn((url: any, opts: any) => {
        if (opts && opts.body) {
          try {
            sentWaPayloads.push(JSON.parse(opts.body));
          } catch {}
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, key: { id: 'EVO_MSG_123' }, messages: [{ id: 'WABA_123' }] }),
        } as any);
      }) as any;
    });

    it('formats AI double asterisks to single asterisks in sendEvolutionTextMessage', async () => {
      await sendEvolutionTextMessage('test-inst', '08123456789', 'Status: **LUNAS** untuk order **#123**');
      expect(sentWaPayloads.length).toBe(1);
      expect(sentWaPayloads[0].text).toBe('Status: *LUNAS* untuk order *#123*');
    });

    it('formats AI double asterisks to single asterisks in sendWhatsAppSessionMessage', async () => {
      process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
      process.env.WHATSAPP_API_TOKEN = 'test_token';

      await sendWhatsAppSessionMessage('628123456789', 'Halo **Pelanggan**, total belanja **Rp 50.000**');
      expect(sentWaPayloads.length).toBe(1);
      expect(sentWaPayloads[0].text?.body).toBe('Halo *Pelanggan*, total belanja *Rp 50.000*');
    });
  });
});
