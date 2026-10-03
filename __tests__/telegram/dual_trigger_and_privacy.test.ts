import {
  dispatchOrderTelegramAlert,
  maskBuyerName,
} from '@/lib/telegram/telegram-dispatcher';
import {
  handleTelegramUpdate,
  isGroupRateLimited,
  recordGroupTrigger,
  _resetGroupRateLimits,
} from '@/lib/telegram/boonpilot-telegram';

// Mock sendTelegramNotification / sendTelegramMessage
global.fetch = jest.fn((url: any) => {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ ok: true, result: { message_id: 9999 } }),
  } as any);
}) as any;

describe('§42.2 & §42.3 Telegram Group Privacy & Masking Protocol', () => {
  describe('maskBuyerName', () => {
    it('masks full names with first name and second name initial plus asterisks', () => {
      expect(maskBuyerName('Siti Rahayu')).toBe('Siti R****');
      expect(maskBuyerName('Budi Santoso')).toBe('Budi S****');
      expect(maskBuyerName('Muhammad Alldy Pratama')).toBe('Muhammad A****');
    });

    it('masks single-word names safely', () => {
      expect(maskBuyerName('Budi')).toBe('Bu****');
      expect(maskBuyerName('Al')).toBe('Al****');
    });

    it('handles empty or null name gracefully', () => {
      expect(maskBuyerName('')).toBe('Pelanggan');
      expect(maskBuyerName('   ')).toBe('Pelanggan');
    });
  });

  describe('dispatchOrderTelegramAlert with Group Privacy Filtering', () => {
    const mockSupabaseWithConfig = (groupConfig: any) => {
      const maybeSingleFn = jest.fn().mockResolvedValue({
        data: {
          id: 'tenant-123',
          name: 'Toko Hebat',
          slug: 'tokohebat',
          telegram_chat_id: '-100999888',
          metadata: {
            telegram_group_config: groupConfig,
          },
        },
      });
      const queryObj: any = {
        maybeSingle: maybeSingleFn,
        or: jest.fn(() => queryObj),
        ilike: jest.fn(() => queryObj),
        eq: jest.fn(() => queryObj),
      };
      return {
        from: jest.fn(() => ({
          select: jest.fn(() => queryObj),
        })),
      };
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('skips new_order alert to group when notify_new_order is false (default)', async () => {
      const supabase = mockSupabaseWithConfig({
        notify_new_order: false,
        notify_paid: true,
      });

      const result = await dispatchOrderTelegramAlert({
        order: {
          tenant_slug: 'tokohebat',
          id: 'INV-1001',
          product_name: 'Kursi Ergonomis',
          gross_amount: 1500000,
          customer_name: 'Siti Rahayu',
          customer_phone: '08123456789',
        },
        event: 'new_order',
        supabaseClient: supabase,
      });

      expect(result.dispatched).toBe(false);
      expect(result.error).toBe('skipped_by_group_config');
    });

    it('dispatches paid order to group and strictly applies masking & contact hiding', async () => {
      const supabase = mockSupabaseWithConfig({
        notify_new_order: false,
        notify_paid: true,
        show_product_name: true,
        show_price: false, // Hide price
        mask_buyer_name: true, // Mask name
        hide_buyer_contact: true, // Hide phone
      });

      const result = await dispatchOrderTelegramAlert({
        order: {
          tenant_slug: 'tokohebat',
          id: 'INV-2002',
          product_name: 'Meja Lipat Premium',
          gross_amount: 750000,
          customer_name: 'Siti Rahayu',
          customer_phone: '08123456789',
        },
        event: 'payment_confirmed',
        supabaseClient: supabase,
      });

      expect(result.dispatched).toBe(true);
      expect(global.fetch).toHaveBeenCalled();

      // Check the payload sent to Telegram
      const fetchCalls = (global.fetch as jest.Mock).mock.calls;
      const tgPayloadCall = fetchCalls.find(([url]: [string]) =>
        url.includes('api.telegram.org/bot')
      );
      expect(tgPayloadCall).toBeDefined();

      const sentBody = JSON.parse(tgPayloadCall[1].body);
      expect(sentBody.chat_id).toBe('-100999888');
      // Must contain masked name
      expect(sentBody.text).toContain('Siti R****');
      // Must NOT leak phone number
      expect(sentBody.text).not.toContain('08123456789');
      // Must NOT contain price since show_price is false
      expect(sentBody.text).not.toContain('750.000');
      // Must contain product name since show_product_name is true
      expect(sentBody.text).toContain('Meja Lipat Premium');
    });
  });
});

describe('§42.4 & §42.5 Dual-Trigger Protocol & Group Isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetGroupRateLimits();
  });

  it('drops messages from unregistered groups in production mode (§42.5)', async () => {
    const prevEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'production';

    // Mock fetch for Supabase returning null tenant for unregistered group
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('rest/v1/tenants')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(null),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, result: {} }),
      });
    });

    const update = {
      update_id: 2001,
      message: {
        message_id: 101,
        chat: { id: -100777666, type: 'supergroup' },
        from: { id: 554433, first_name: 'Hacker' },
        text: '@boon promo',
      },
    };

    const result = await handleTelegramUpdate(update);
    expect(result.handled).toBe(false);
    expect(result.reason).toBe('unregistered_group_chat_dropped');

    (process.env as any).NODE_ENV = prevEnv;
  });
});

describe('GET /api/v1/notifications/telegram-link Route Handler', () => {
  it('correctly queries non-UUID slug without Postgres 22P02 uuid error', async () => {
    const { GET: getTelegramLink } = await import('@/app/api/v1/notifications/telegram-link/route');
    const { NextRequest } = await import('next/server');

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('rest/v1/tenants')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: '52967979-4760-4cea-b686-cdbdb389c0e1',
                name: 'BoonTrack Official Shop',
                slug: 'boon',
                telegram_chat_id: '6075596043',
                metadata: { telegram_chat_id: '6075596043' },
              },
            ]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    const req = new NextRequest('http://localhost:3000/api/v1/notifications/telegram-link?slug=boon');
    const res = await getTelegramLink(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.telegram_chat_id).toBe('6075596043');
    expect(data.is_linked).toBe(true);
    expect(data.slug).toBe('boon');
  });
});

