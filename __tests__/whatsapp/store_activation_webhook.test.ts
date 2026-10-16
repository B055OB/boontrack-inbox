/**
 * @file __tests__/whatsapp/store_activation_webhook.test.ts
 * @description Comprehensive Unit & Integration Tests for WhatsApp Webhook Store Activation Flow (BT-XXXX).
 *
 * Verifies:
 * 1. Normalization of input phone numbers (JID suffix '@s.whatsapp.net', '@c.us', multidevice, '08...' prefix).
 * 2. Normalization and extraction of activation token (case-insensitive, whitespace trim, BT-XXXX variations).
 * 3. Database lookup and atomic activation using Service Role client (mitigating silent RLS).
 * 4. End-to-end simulation of POST /api/webhook/whatsapp and POST /api/webhooks/whatsapp.
 */

import crypto from 'crypto';
import { NextRequest } from 'next/server';
import {
  normalizeWhatsAppNumber,
  extractActivationCode,
  findTenantByActivationCode,
  processStoreActivation,
} from '@/lib/whatsapp/activation';
import { POST as webhookPost } from '@/app/api/webhook/whatsapp/route';
import { POST as webhooksAliasPost } from '@/app/api/webhooks/whatsapp/route';

// ---------------------------------------------------------------------------
// Mocking Setup
// ---------------------------------------------------------------------------

const mockSendWhatsAppSessionMessage = jest.fn().mockResolvedValue({
  success: true,
  messageId: 'wamid.HBgLMmock_msg_id',
});

jest.mock('@/lib/whatsapp', () => {
  const actual = jest.requireActual('@/lib/whatsapp');
  return {
    ...actual,
    sendWhatsAppSessionMessage: (...args: any[]) => mockSendWhatsAppSessionMessage(...args),
  };
});

describe('Store Activation via WhatsApp Webhook (Kode BT-XXXX)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.META_APP_SECRET = 'test_meta_app_secret_12345';
  });

  // =========================================================================
  // 1. Phone Number Normalization Tests
  // =========================================================================
  describe('1. Phone Number Normalization (normalizeWhatsAppNumber)', () => {
    it('normalizes local Indonesian "08..." prefix to international "628..."', () => {
      expect(normalizeWhatsAppNumber('081234567890')).toBe('6281234567890');
      expect(normalizeWhatsAppNumber('085181830080')).toBe('6285181830080');
    });

    it('strips WhatsApp JID domain suffix (@s.whatsapp.net, @c.us, @g.us)', () => {
      expect(normalizeWhatsAppNumber('081234567890@s.whatsapp.net')).toBe('6281234567890');
      expect(normalizeWhatsAppNumber('081234567890@c.us')).toBe('6281234567890');
      expect(normalizeWhatsAppNumber('6285181830080@s.whatsapp.net')).toBe('6285181830080');
    });

    it('strips multidevice device suffix (:0, :1, :12) without corrupting digits', () => {
      expect(normalizeWhatsAppNumber('6281234567890:0@s.whatsapp.net')).toBe('6281234567890');
      expect(normalizeWhatsAppNumber('081234567890:12@c.us')).toBe('6281234567890');
    });

    it('handles formatted numbers with plus, dashes, and spaces', () => {
      expect(normalizeWhatsAppNumber('+62 812-3456-7890')).toBe('6281234567890');
      expect(normalizeWhatsAppNumber('  +6281234567890  ')).toBe('6281234567890');
      expect(normalizeWhatsAppNumber('81234567890')).toBe('6281234567890');
    });

    it('safely handles empty, null, or invalid inputs', () => {
      expect(normalizeWhatsAppNumber(null)).toBe('');
      expect(normalizeWhatsAppNumber(undefined)).toBe('');
      expect(normalizeWhatsAppNumber('')).toBe('');
      expect(normalizeWhatsAppNumber('   ')).toBe('');
      expect(normalizeWhatsAppNumber('invalid_alpha_text')).toBe('');
    });
  });

  // =========================================================================
  // 2. Activation Code Extraction & Normalization Tests
  // =========================================================================
  describe('2. Activation Code Extraction (extractActivationCode)', () => {
    it('extracts canonical token from standard "AKTIVASI BT-XXXX" format', () => {
      const res = extractActivationCode('AKTIVASI BT-7170');
      expect(res).not.toBeNull();
      expect(res?.isValid).toBe(true);
      expect(res?.canonicalToken).toBe('BT-7170');
      expect(res?.tokenSuffix).toBe('7170');
    });

    it('extracts case-insensitively (.toUpperCase())', () => {
      const res = extractActivationCode('aktivasi bt-7170');
      expect(res).not.toBeNull();
      expect(res?.canonicalToken).toBe('BT-7170');
      expect(res?.tokenSuffix).toBe('7170');
    });

    it('tolerates extra whitespace and accidental punctuation (.trim())', () => {
      const res1 = extractActivationCode('   AKTIVASI   BT-7170   ');
      expect(res1?.canonicalToken).toBe('BT-7170');

      const res2 = extractActivationCode('Aktivasi: BT-7170.');
      expect(res2?.canonicalToken).toBe('BT-7170');

      const res3 = extractActivationCode('Aktivasi - BT-7170');
      expect(res3?.canonicalToken).toBe('BT-7170');
    });

    it('extracts token when user omits hyphen or "BT-" prefix', () => {
      const res1 = extractActivationCode('AKTIVASI BT7170');
      expect(res1?.canonicalToken).toBe('BT-7170');

      const res2 = extractActivationCode('AKTIVASI 7170');
      expect(res2?.canonicalToken).toBe('BT-7170');
    });

    it('extracts standalone token when user only sends "BT-XXXX"', () => {
      const res = extractActivationCode('BT-7170');
      expect(res?.canonicalToken).toBe('BT-7170');

      const resLower = extractActivationCode('bt-7170');
      expect(resLower?.canonicalToken).toBe('BT-7170');
    });

    it('rejects general chat messages and Studio commands from store activation', () => {
      expect(extractActivationCode('Halo admin, saya mau tanya produk')).toBeNull();
      expect(extractActivationCode('Kirim ke Bandung berapa ongkirnya?')).toBeNull();
      expect(extractActivationCode('AKTIFKAN STUDIO XYZ123')).toBeNull();
      expect(extractActivationCode('')).toBeNull();
      expect(extractActivationCode(null)).toBeNull();
    });
  });

  // =========================================================================
  // 3. Database Lookup & Store Activation Flow Tests
  // =========================================================================
  describe('3. Database Lookup & Activation (processStoreActivation)', () => {
    let mockTenantsDb: Record<string, any>;
    let mockSubscriptionsDb: any[];
    let mockActivationCodesDb: any[];

    const createMockSupabase = () => {
      return {
        from: (tableName: string) => {
          if (tableName === 'tenants') {
            const builder: any = {
              _filters: [] as any[],
              _selected: '',
              select: jest.fn((fields: string) => {
                builder._selected = fields;
                return builder;
              }),
              eq: jest.fn((field: string, val: any) => {
                builder._filters.push({ field, op: 'eq', val });
                return builder;
              }),
              or: jest.fn((orQuery: string) => {
                builder._filters.push({ field: '_or', val: orQuery });
                return builder;
              }),
              limit: jest.fn(() => builder),
              maybeSingle: jest.fn(async () => {
                const tenants = Object.values(mockTenantsDb);
                for (const f of builder._filters) {
                  if (f.field === 'id') {
                    const match = tenants.find((t: any) => t.id === f.val);
                    return { data: match || null, error: null };
                  }
                  if (f.field === '_or') {
                    // Simple parser for or conditions
                    const clauses = f.val.split(',').map((c: string) => c.trim());
                    for (const clause of clauses) {
                      const [colPart, expectedVal] = clause.split('.eq.');
                      if (!colPart || !expectedVal) continue;

                      for (const t of tenants) {
                        const meta = t.metadata || {};
                        if (colPart === 'metadata->>wa_verification_token') {
                          if (
                            meta.wa_verification_token === expectedVal ||
                            meta.wa_verification_token?.toUpperCase() === expectedVal.toUpperCase()
                          ) {
                            return { data: t, error: null };
                          }
                        }
                        if (colPart === 'metadata->>code' && meta.code === expectedVal) {
                          return { data: t, error: null };
                        }
                        if (colPart === 'metadata->>token' && meta.token === expectedVal) {
                          return { data: t, error: null };
                        }
                        if (colPart === 'metadata->>activation_code' && meta.activation_code === expectedVal) {
                          return { data: t, error: null };
                        }
                        if (colPart === 'metadata->>phone' && meta.phone === expectedVal) {
                          return { data: t, error: null };
                        }
                        if (colPart === 'metadata->>whatsapp_number' && meta.whatsapp_number === expectedVal) {
                          return { data: t, error: null };
                        }
                      }
                    }
                  }
                }
                return { data: null, error: null };
              }),
              update: jest.fn((updateData: any) => {
                return {
                  eq: jest.fn(async (field: string, val: string) => {
                    if (field === 'id' && mockTenantsDb[val]) {
                      mockTenantsDb[val] = {
                        ...mockTenantsDb[val],
                        ...updateData,
                      };
                      return { data: mockTenantsDb[val], error: null };
                    }
                    return { data: null, error: null };
                  }),
                };
              }),
            };
            return builder;
          }

          if (tableName === 'activation_codes') {
            const builder: any = {
              select: jest.fn(() => builder),
              or: jest.fn(() => builder),
              order: jest.fn(() => builder),
              limit: jest.fn(() => builder),
              maybeSingle: jest.fn(async () => ({ data: null, error: null })),
              update: jest.fn(() => ({ eq: jest.fn(async () => ({ data: null, error: null })) })),
            };
            return builder;
          }

          if (tableName === 'shop_subscriptions') {
            const builder: any = {
              upsert: jest.fn(async (payload: any) => {
                mockSubscriptionsDb.push(payload);
                return { data: payload, error: null };
              }),
            };
            return builder;
          }

          return { select: jest.fn(), insert: jest.fn(), update: jest.fn() };
        },
      };
    };

    beforeEach(() => {
      mockTenantsDb = {
        'tenant-uuid-1': {
          id: 'tenant-uuid-1',
          slug: 'toko-kue-enak',
          name: 'Toko Kue Enak',
          status: 'PENDING',
          is_active: false,
          tier: 'PRO_SCALE',
          trial_ends_at: null,
          metadata: {
            wa_verification_token: 'BT-7170',
            wa_verification_status: 'PENDING',
            phone: '6281234567890',
            whatsapp_number: '6281234567890',
            selected_plan: 'Ads Performance Trial',
          },
        },
      };
      mockSubscriptionsDb = [];
      mockActivationCodesDb = [];
    });

    it('successfully finds and activates pending tenant with valid token', async () => {
      const mockSupabase = createMockSupabase();

      const result = await processStoreActivation({
        codeOrText: 'AKTIVASI BT-7170',
        senderPhone: '081234567890@s.whatsapp.net',
        customSupabase: mockSupabase,
      });

      expect(result.success).toBe(true);
      expect(result.tenant.status).toBe('active');
      expect(result.tenant.is_active).toBe(true);
      expect(result.replyMessage).toContain('Selamat! Nomor WhatsApp Anda berhasil diverifikasi');

      // Verify tenant state in DB
      const updatedTenant = mockTenantsDb['tenant-uuid-1'];
      expect(updatedTenant.status).toBe('active');
      expect(updatedTenant.is_active).toBe(true);
      expect(updatedTenant.metadata.wa_verification_status).toBe('verified');
      expect(updatedTenant.metadata.wa_verified_phone).toBe('6281234567890');
      expect(updatedTenant.trial_ends_at).toBeDefined();

      // Verify subscription sync
      expect(mockSubscriptionsDb.length).toBe(1);
      expect(mockSubscriptionsDb[0].tenant_id).toBe('tenant-uuid-1');
      expect(mockSubscriptionsDb[0].status).toBe('TRIAL');
    });

    it('activates tenant even if message is sent in lowercase "aktivasi bt-7170"', async () => {
      const mockSupabase = createMockSupabase();

      const result = await processStoreActivation({
        codeOrText: 'aktivasi bt-7170',
        senderPhone: '6281234567890',
        customSupabase: mockSupabase,
      });

      expect(result.success).toBe(true);
      expect(mockTenantsDb['tenant-uuid-1'].status).toBe('active');
    });

    it('returns notFound when token is non-existent or invalid', async () => {
      const mockSupabase = createMockSupabase();

      const result = await processStoreActivation({
        codeOrText: 'AKTIVASI BT-9999',
        senderPhone: '6281234567890',
        customSupabase: mockSupabase,
      });

      expect(result.success).toBe(false);
      expect(result.notFound).toBe(true);
      expect(result.replyMessage).toContain('Kode verifikasi BT-9999 tidak ditemukan');
      expect(mockTenantsDb['tenant-uuid-1'].status).toBe('PENDING');
    });
  });

  // =========================================================================
  // 4. Webhook Route Handler Simulation (POST)
  // =========================================================================
  describe('4. Webhook Inbound Handler End-to-End Simulation', () => {
    function generateMetaSignature(body: string, secret: string): string {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(body, 'utf8');
      return `sha256=${hmac.digest('hex')}`;
    }

    it('successfully processes valid activation message and sends confirmation reply', async () => {
      // Mock getSupabaseAdmin
      const mockTenant = {
        id: 'mock-tenant-id-44',
        slug: 'toko-batik-jaya',
        name: 'Toko Batik Jaya',
        status: 'PENDING',
        is_active: false,
        tier: 'PRO_SCALE',
        metadata: {
          wa_verification_token: 'BT-8899',
          wa_verification_status: 'PENDING',
        },
      };

      const mockSupabase = {
        from: jest.fn((table: string) => {
          if (table === 'tenants') {
            const builder: any = {
              select: jest.fn(() => builder),
              or: jest.fn(() => builder),
              eq: jest.fn(() => builder),
              limit: jest.fn(() => builder),
              maybeSingle: jest.fn(async () => ({ data: mockTenant, error: null })),
              update: jest.fn(() => ({
                eq: jest.fn(async () => ({ data: { ...mockTenant, status: 'active' }, error: null })),
              })),
            };
            return builder;
          }
          if (table === 'shop_subscriptions' || table === 'activation_codes') {
            return {
              upsert: jest.fn(async () => ({ data: null, error: null })),
              update: jest.fn(() => ({ eq: jest.fn(async () => ({ data: null, error: null })) })),
              select: jest.fn(() => ({
                or: jest.fn(() => ({
                  order: jest.fn(() => ({
                    limit: jest.fn(() => ({
                      maybeSingle: jest.fn(async () => ({ data: null, error: null })),
                    })),
                  })),
                })),
              })),
            };
          }
          return { select: jest.fn(), update: jest.fn() };
        }),
      };

      jest.spyOn(require('@/lib/supabaseClient'), 'getSupabaseAdmin').mockReturnValue(mockSupabase as any);

      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '6285181830080',
                    phone_number_id: '1099238472891',
                  },
                  messages: [
                    {
                      from: '081299887766@s.whatsapp.net',
                      id: 'wamid.HBgLMTEwOTE3MTM5OTg4',
                      timestamp: '1729051200',
                      type: 'text',
                      text: {
                        body: 'AKTIVASI BT-8899',
                      },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const rawBody = JSON.stringify(payload);
      const signature = generateMetaSignature(rawBody, process.env.META_APP_SECRET!);

      const req = new NextRequest('http://localhost:3000/api/webhook/whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': signature,
        },
        body: rawBody,
      });

      const res = await webhookPost(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.processed).toBe(true);

      // Verify that sendWhatsAppSessionMessage was called with normalized number '6281299887766'
      expect(mockSendWhatsAppSessionMessage).toHaveBeenCalledWith(
        '6281299887766',
        expect.stringContaining('Nomor WhatsApp Anda berhasil diverifikasi')
      );
    });

    it('works identically via /api/webhooks/whatsapp plural alias route', async () => {
      const mockTenant = {
        id: 'mock-tenant-id-55',
        slug: 'kedai-kopi-seduh',
        name: 'Kedai Kopi Seduh',
        status: 'PENDING',
        is_active: false,
        metadata: {
          wa_verification_token: 'BT-3322',
        },
      };

      const mockSupabase = {
        from: jest.fn((table: string) => ({
          select: jest.fn().mockReturnThis(),
          or: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn(async () => ({ data: mockTenant, error: null })),
          update: jest.fn(() => ({ eq: jest.fn(async () => ({ data: mockTenant, error: null })) })),
          upsert: jest.fn(async () => ({ data: null, error: null })),
        })),
      };

      jest.spyOn(require('@/lib/supabaseClient'), 'getSupabaseAdmin').mockReturnValue(mockSupabase as any);

      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA_ID',
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: '6285181830001:0@s.whatsapp.net',
                      id: 'wamid.HBgLmock2',
                      type: 'text',
                      text: { body: 'aktivasi bt-3322' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const rawBody = JSON.stringify(payload);
      const signature = generateMetaSignature(rawBody, process.env.META_APP_SECRET!);

      const req = new NextRequest('http://localhost:3000/api/webhooks/whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': signature,
        },
        body: rawBody,
      });

      const res = await webhooksAliasPost(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockSendWhatsAppSessionMessage).toHaveBeenCalledWith(
        '6285181830001',
        expect.stringContaining('Nomor WhatsApp Anda berhasil diverifikasi')
      );
    });
  });
});
