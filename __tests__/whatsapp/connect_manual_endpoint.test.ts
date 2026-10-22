import { POST } from '@/app/api/whatsapp/connect-manual/route';
import { NextRequest } from 'next/server';

const mockQueryBuilder: any = {
  select: jest.fn().mockImplementation(() => mockQueryBuilder),
  eq: jest.fn().mockImplementation(() => mockQueryBuilder),
  or: jest.fn().mockImplementation(() => mockQueryBuilder),
  maybeSingle: jest.fn().mockResolvedValue({
    data: {
      id: 'e12acd29-6c18-487b-ade7-5422878c1c36',
      slug: 'onlineboost',
      metadata: {},
    },
    error: null,
  }),
  insert: jest.fn().mockResolvedValue({ data: null, error: null }),
  update: jest.fn().mockImplementation(() => mockQueryBuilder),
  then: (resolve: any) =>
    resolve({
      data: [{ id: 'e12acd29-6c18-487b-ade7-5422878c1c36', slug: 'onlineboost' }],
      error: null,
    }),
};

const mockSupabase = {
  from: jest.fn(() => mockQueryBuilder),
};

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => mockSupabase),
  getSupabase: jest.fn(() => mockSupabase),
}));

describe('POST /api/whatsapp/connect-manual', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('rejects request with missing tenant parameter', async () => {
    const req = new NextRequest('http://localhost:3000/api/whatsapp/connect-manual', {
      method: 'POST',
      body: JSON.stringify({
        phone_number_id: '123456',
        waba_id: '654321',
        access_token: 'EAAT_TEST',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('tenant');
  });

  it('rejects request with missing required credentials', async () => {
    const req = new NextRequest('http://localhost:3000/api/whatsapp/connect-manual', {
      method: 'POST',
      body: JSON.stringify({
        tenant_slug: 'onlineboost',
        phone_number_id: '',
        waba_id: '654321',
        access_token: 'EAAT_TEST',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Phone Number ID');
  });

  it('successfully handles core backend 200 response', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/whatsapp/connect-manual')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            status: 'connected',
            message: "WABA berhasil terhubung untuk tenant 'onlineboost'.",
            tenant_id: 'onlineboost',
            tenant_slug: 'onlineboost',
            phone_number_id: '1419090974617162',
            waba_id: '183319931137',
            verified_name: 'OnlineBoost Official',
            display_phone_number: '+62 882-2609-8088',
            quality_rating: 'GREEN',
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });

    const req = new NextRequest('http://localhost:3000/api/whatsapp/connect-manual', {
      method: 'POST',
      body: JSON.stringify({
        tenant_slug: 'onlineboost',
        phone_number_id: '1419090974617162',
        waba_id: '183319931137',
        access_token: 'EAAT_VALID_TOKEN',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.verified_name).toBe('OnlineBoost Official');
    expect(json.display_phone_number).toBe('+62 882-2609-8088');
    expect(json.quality_rating).toBe('GREEN');
  });

  it('returns core error details when Meta handshake fails', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/whatsapp/connect-manual')) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({
            detail: {
              message: 'Verifikasi Meta Graph API gagal. Pastikan phone_number_id dan access_token valid.',
              meta_status_code: 400,
            },
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });

    const req = new NextRequest('http://localhost:3000/api/whatsapp/connect-manual', {
      method: 'POST',
      body: JSON.stringify({
        tenant_slug: 'onlineboost',
        phone_number_id: 'bad_id',
        waba_id: '183319931137',
        access_token: 'bad_token',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Verifikasi Meta Graph API gagal');
  });
});
