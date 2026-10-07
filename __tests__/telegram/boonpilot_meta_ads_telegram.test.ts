import { handleTelegramUpdate } from '@/lib/telegram/boonpilot-telegram';
import { GET as webhookGET, POST as webhookPOST } from '@/app/api/telegram/webhook/route';
import { NextRequest } from 'next/server';

// Mock fetch for Telegram API and Supabase
let lastTelegramPayload: any = null;

global.fetch = jest.fn((url: any, opts: any) => {
  const urlStr = String(url);
  if (urlStr.includes('api.telegram.org/bot')) {
    if (opts && opts.body) {
      try {
        lastTelegramPayload = JSON.parse(opts.body);
      } catch {}
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: { message_id: 8888 } }),
    } as any);
  }

  // Supabase mock
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(null),
  } as any);
}) as any;

describe('BoonPilot Telegram Bot (@boonshop_bot) Meta Ads & Anti-Spam Verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastTelegramPayload = null;
  });

  it('answers "@boonshop_bot kamu paham meta ads gak?" intelligently with BoonPilot persona, Meta Ads & CTWA knowledge, and zero spam banner/buttons', async () => {
    const update = {
      update_id: 3001,
      message: {
        message_id: 101,
        chat: { id: -100888999111, type: 'supergroup', title: 'Komunitas Digital Marketer' },
        from: { id: 777123, first_name: 'Doni' },
        text: '@boonshop_bot kamu paham meta ads gak?',
      },
    };

    const result = await handleTelegramUpdate(update);

    expect(result.handled).toBe(true);
    expect(result.chatId).toBe(-100888999111);
    expect(result.reply).toBeDefined();

    // 1. Signature Persona
    expect(result.reply).toContain('Halo kak, bantu jawab ya!');

    // 2. Intelligence: Meta Ads, CTWA, and Server-Side CAPI
    expect(result.reply).toMatch(/Meta Ads/i);
    expect(result.reply).toMatch(/CTWA|Click to WhatsApp/i);
    expect(result.reply).toMatch(/CAPI|Conversions API|Purchase/i);
    expect(result.reply).toMatch(/closing/i);

    // 3. No auto-spam banner & no promo demo url buttons for general queries
    expect(lastTelegramPayload).toBeDefined();
    expect(lastTelegramPayload.chat_id).toBe(-100888999111);
    // disable_web_page_preview must be true to eliminate poster banner
    expect(lastTelegramPayload.disable_web_page_preview).toBe(true);
    // Buttons must NOT contain auto-spam demo/register url links
    const hasPromoUrlButton = lastTelegramPayload.reply_markup?.inline_keyboard?.some((row: any[]) =>
      row.some((btn: any) => Boolean(btn.url) || btn.text?.includes('Demo') || btn.text?.includes('Daftar'))
    );
    expect(hasPromoUrlButton).toBeFalsy();
  });

  it('does NOT attach demo promo buttons unless explicitly asked', async () => {
    const updateWithoutDemoRequest = {
      update_id: 3002,
      message: {
        message_id: 102,
        chat: { id: -100888999111, type: 'group', title: 'Grup UKM' },
        from: { id: 777124, first_name: 'Rian' },
        text: 'boon kamu bisa bantu optimasi closing whatsapp?',
      },
    };

    const result = await handleTelegramUpdate(updateWithoutDemoRequest);
    expect(result.handled).toBe(true);
    expect(result.reply).toBeDefined();
    expect(lastTelegramPayload.disable_web_page_preview).toBe(true);
    expect(lastTelegramPayload.reply_markup?.inline_keyboard?.some((row: any[]) =>
      row.some((btn: any) => btn.text?.includes('Lihat Demo') || btn.text?.includes('Daftar Akun'))
    )).toBeFalsy();
  });

  it('responds correctly via /api/telegram/webhook route handler', async () => {
    // GET verification
    const getRes = await webhookGET();
    const getData = await getRes.json();
    expect(getRes.status).toBe(200);
    expect(getData.status).toBe('active');
    expect(getData.channel).toBe('TELEGRAM');
    expect(getData.bot_username).toBe('boonshop_bot');

    // POST webhook processing
    const updatePayload = {
      update_id: 3003,
      message: {
        message_id: 103,
        chat: { id: 12345678, type: 'private' },
        from: { id: 12345678, first_name: 'Andi' },
        text: 'apakah ada integrasi meta ads dan pixel?',
      },
    };

    const req = new NextRequest('http://localhost:3000/api/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
    });

    const postRes = await webhookPOST(req);
    const postData = await postRes.json();
    expect(postRes.status).toBe(200);
    expect(postData.status).toBe('processed');
    expect(postData.result.handled).toBe(true);
    expect(postData.result.reply).toContain('Halo kak, bantu jawab ya!');
    expect(postData.result.reply).toMatch(/Meta Ads|CAPI/i);
  });
});
