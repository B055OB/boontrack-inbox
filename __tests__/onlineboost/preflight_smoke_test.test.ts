import {
  isOnlineBoostRegistrationKeyword,
  getOnlineBoostBatch1RegistrationReply,
} from '@/lib/whatsapp/order-interceptor';
import {
  generateTelegramInviteLink,
  ONLINEBOOST_DEFAULT_TELEGRAM_LINK,
} from '@/lib/telegram/telegram-invite-service';
import { formatOrderFulfillmentMessage } from '@/lib/whatsapp';

describe('PRE-FLIGHT SMOKE TEST: OnlineBoost Batch 1 Funnel Orchestration', () => {
  describe('1. Inbound Keyword Detection: "MAU METODE RAHASIA"', () => {
    it('detects exact uppercase keyword', () => {
      expect(isOnlineBoostRegistrationKeyword('MAU METODE RAHASIA')).toBe(true);
    });

    it('detects case-insensitive variations and leading/trailing whitespace', () => {
      expect(isOnlineBoostRegistrationKeyword('  mau metode rahasia  ')).toBe(true);
      expect(isOnlineBoostRegistrationKeyword('Mau Metode Rahasia')).toBe(true);
      expect(isOnlineBoostRegistrationKeyword('MAU   METODE   RAHASIA')).toBe(true); // forgiving multi-space support
    });

    it('rejects unrelated text', () => {
      expect(isOnlineBoostRegistrationKeyword('Halo admin mau tanya')).toBe(false);
      expect(isOnlineBoostRegistrationKeyword('METODE RAHASIA')).toBe(false);
      expect(isOnlineBoostRegistrationKeyword('')).toBe(false);
      expect(isOnlineBoostRegistrationKeyword(null)).toBe(false);
    });

    it('generates high-converting registration reply with Batch 1 link & Rp249.000 promo', () => {
      const reply = getOnlineBoostBatch1RegistrationReply();
      expect(reply).toContain('OnlineBoost Batch 1');
      expect(reply).toContain('249.000');
      expect(reply).toContain('50 peserta');
      expect(reply).toContain('https://shop.boontrack.com/onlineboost/p/kelas-inkubasi-ctwa-batch-1-scale');
      expect(reply).toContain('grup Telegram kelas');
    });
  });

  describe('2. Telegram Invite Link Generation & Fallback', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('calls Telegram createChatInviteLink with member_limit 1 and expire_date +86400s', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      global.fetch = jest.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: {
              invite_link: 'https://t.me/+DYNAMIC_SINGLE_USE_123',
              member_limit: 1,
            },
          }),
        };
      }) as any;

      const link = await generateTelegramInviteLink({
        tenantSlug: 'onlineboost',
        orderId: 'ORD-SMOKE-249000-TEST',
        defaultFallbackUrl: ONLINEBOOST_DEFAULT_TELEGRAM_LINK,
      });

      expect(link).toBe('https://t.me/+DYNAMIC_SINGLE_USE_123');
      expect(capturedUrl).toContain('/createChatInviteLink');
      expect(capturedBody.member_limit).toBe(1);
      expect(capturedBody.name).toContain('ORD-SMOKE-249000-TEST'.slice(-12));
      const nowSec = Math.floor(Date.now() / 1000);
      expect(capturedBody.expire_date).toBeGreaterThanOrEqual(nowSec + 86300);
      expect(capturedBody.expire_date).toBeLessThanOrEqual(nowSec + 86500);
    });

    it('gracefully falls back to admin approval link on Telegram rate-limit or error', async () => {
      global.fetch = jest.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 429,
          json: async () => ({
            ok: false,
            error_code: 429,
            description: 'Too Many Requests: retry after 3600',
          }),
        };
      }) as any;

      const link = await generateTelegramInviteLink({
        tenantSlug: 'onlineboost',
        orderId: 'ORD-SMOKE-249000-RATE-LIMITED',
        defaultFallbackUrl: ONLINEBOOST_DEFAULT_TELEGRAM_LINK,
      });

      expect(link).toBe(ONLINEBOOST_DEFAULT_TELEGRAM_LINK);
      expect(link).toBe('https://t.me/+WZ6alwTIjjExODc1');
    });
  });

  describe('3. WhatsApp Fulfillment Notification Formatting', () => {
    it('formats digital delivery message with dynamic Telegram invite link', () => {
      const { messageText, safeName, formattedAmount } = formatOrderFulfillmentMessage({
        phone: '6289999990001',
        customerName: 'Budi Santoso',
        orderId: 'ORD-SMOKE-249K',
        itemsSummary: 'Kelas Inkubasi CTWA Batch 1 - Scale Bundle',
        totalAmount: 249000,
        productType: 'DIGITAL',
        accessUrl: 'https://t.me/+WZ6alwTIjjExODc1',
        storeName: 'OnlineBoost',
      });

      expect(safeName).toBe('Budi Santoso');
      expect(formattedAmount).toBe('Rp 249.000');
      expect(messageText).toContain('ORD-SMOKE-249K');
      expect(messageText).toContain('Kelas Inkubasi CTWA Batch 1');
      expect(messageText).toContain('🚀 Akses Komunitas & Grup Telegram Kelas:');
      expect(messageText).toContain('https://t.me/+WZ6alwTIjjExODc1');
      expect(messageText).toContain('grup mentoring & praktikum');
    });
  });
});
