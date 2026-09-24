/**
 * @file __tests__/whatsapp/meta_webhook_normalizer.test.ts
 * @description Comprehensive Unit Test Suite for Meta Cloud API Webhook Normalizer & Handshake.
 */

import crypto from 'crypto';
import {
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
  parseMetaWebhookPayload,
  processNormalizedMetaEvent,
} from '@/lib/whatsapp/meta-webhook-normalizer';
import { GET as metaGet, POST as metaPost } from '@/app/api/v1/webhooks/whatsapp/meta/route';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockConnections: Record<string, any> = {
  phone_tenant_active: {
    tenant_id: 'tenant-test',
    ownership_domain: 'TENANT',
    status: 'CONNECTED',
    credential_ref: 'cred_ref_tenant_test',
    phone_number_id: 'phone_tenant_active',
    provider: 'META',
  },
};

const mockConversationEngineProcess = jest.fn().mockImplementation(async (params: any) => ({
  reply: `Halo dari ${params.tenant_id}!`,
}));

jest.mock('@/lib/conversationEngine', () => ({
  ConversationEngine: {
    process: (...args: any[]) => mockConversationEngineProcess(...args),
  },
}));

const mockSupabaseClient = {
  from: jest.fn((tableName: string) => {
    if (tableName === 'whatsapp_connections') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn((field1: string, val1: string) => ({
            eq: jest.fn((field2: string, val2: string) => ({
              eq: jest.fn((field3: string, val3: string) => ({
                single: jest.fn(async () => {
                  let match = null;
                  for (const key of Object.keys(mockConnections)) {
                    const conn = mockConnections[key];
                    if (
                      conn[field1] === val1 &&
                      conn[field2] === val2 &&
                      conn[field3] === val3
                    ) {
                      match = conn;
                      break;
                    }
                  }
                  if (match) return { data: match, error: null };
                  return { data: null, error: { message: 'Row not found' } };
                }),
              })),
            })),
          })),
        })),
      };
    }

    // Default table mock with safe chainable methods
    return {
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => ({ data: null, error: null })),
          single: jest.fn(async () => ({ data: null, error: null })),
        })),
        or: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
      insert: jest.fn(async () => ({ data: null, error: null })),
      update: jest.fn(() => ({
        eq: jest.fn(async () => ({ data: null, error: null })),
        or: jest.fn(async () => ({ data: null, error: null })),
      })),
    };
  }),
};

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => mockSupabaseClient),
  getSupabase: jest.fn(() => mockSupabaseClient),
}));

jest.mock('@/services/waba', () => ({
  metaWabaAdapter: {
    dispatchTenantMessage: jest.fn(async () => ({ success: true, messageId: 'wamid.outbound' })),
  },
}));

describe('Meta Webhook Normalizer & Handshake', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('1. GET Handshake Verification (verifyMetaWebhookChallenge)', () => {
    it('verifies challenge with META_WHATSAPP_VERIFY_TOKEN', () => {
      process.env.META_WHATSAPP_VERIFY_TOKEN = 'my_secure_waba_token_123';
      const params = new URLSearchParams({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'my_secure_waba_token_123',
        'hub.challenge': 'challenge_code_abc_999',
      });

      const result = verifyMetaWebhookChallenge(params);
      expect(result.isValid).toBe(true);
      expect(result.challenge).toBe('challenge_code_abc_999');
      expect(result.status).toBe(200);
    });

    it('verifies challenge with fallback token "boontrack_master_verify_token_2026"', () => {
      delete process.env.META_WHATSAPP_VERIFY_TOKEN;
      const params = new URLSearchParams({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'boontrack_master_verify_token_2026',
        'hub.challenge': 'challenge_master_2026',
      });

      const result = verifyMetaWebhookChallenge(params);
      expect(result.isValid).toBe(true);
      expect(result.challenge).toBe('challenge_master_2026');
    });

    it('verifies challenge with fallback token "boontrack_verify_secret"', () => {
      const params = new URLSearchParams({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'boontrack_verify_secret',
        'hub.challenge': 'challenge_secret_xyz',
      });

      const result = verifyMetaWebhookChallenge(params);
      expect(result.isValid).toBe(true);
      expect(result.challenge).toBe('challenge_secret_xyz');
    });

    it('rejects handshake when verify_token is invalid', () => {
      const params = new URLSearchParams({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'invalid_token_guess',
        'hub.challenge': 'should_not_return',
      });

      const result = verifyMetaWebhookChallenge(params);
      expect(result.isValid).toBe(false);
      expect(result.status).toBe(403);
    });

    it('rejects handshake when hub.mode is not subscribe', () => {
      const params = new URLSearchParams({
        'hub.mode': 'unsubscribe',
        'hub.verify_token': 'boontrack_verify_secret',
        'hub.challenge': 'challenge_123',
      });

      const result = verifyMetaWebhookChallenge(params);
      expect(result.isValid).toBe(false);
      expect(result.status).toBe(403);
    });
  });

  describe('2. Payload Normalizer (parseMetaWebhookPayload)', () => {
    it('normalizes inbound text message and resolves contact name', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA_ID_999',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    phone_number_id: 'phone_tenant_active',
                    display_phone_number: '085181830080',
                  },
                  contacts: [
                    {
                      profile: { name: 'Budi Santoso' },
                      wa_id: '628123456789',
                    },
                  ],
                  messages: [
                    {
                      from: '628123456789@s.whatsapp.net',
                      id: 'wamid.HBgL12345',
                      timestamp: '1710000000',
                      type: 'text',
                      text: { body: 'Halo, saya mau pesan toren 500 liter' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const event = parseMetaWebhookPayload(payload);
      expect(event.phoneNumberId).toBe('phone_tenant_active');
      expect(event.displayPhoneNumber).toBe('085181830080');
      expect(event.wabaId).toBe('WABA_ID_999');
      expect(event.messages.length).toBe(1);

      const msg = event.messages[0];
      expect(msg.id).toBe('wamid.HBgL12345');
      expect(msg.senderPhone).toBe('628123456789');
      expect(msg.senderName).toBe('Budi Santoso');
      expect(msg.type).toBe('text');
      expect(msg.text).toBe('Halo, saya mau pesan toren 500 liter');
      expect(msg.fromMe).toBe(false);
    });

    it('normalizes interactive button_reply message', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'phone_tenant_active' },
                  messages: [
                    {
                      from: '628987654321',
                      id: 'wamid.BUTTON_REPLY_1',
                      timestamp: '1710000010',
                      type: 'interactive',
                      interactive: {
                        type: 'button_reply',
                        button_reply: {
                          id: 'btn_confirm_booking',
                          title: 'Konfirmasi Booking',
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const event = parseMetaWebhookPayload(payload);
      expect(event.messages.length).toBe(1);
      const msg = event.messages[0];
      expect(msg.type).toBe('interactive');
      expect(msg.text).toBe('Konfirmasi Booking');
      expect(msg.interactiveReply).toEqual({
        type: 'button_reply',
        id: 'btn_confirm_booking',
        title: 'Konfirmasi Booking',
      });
    });

    it('normalizes interactive list_reply message', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'phone_tenant_active' },
                  messages: [
                    {
                      from: '628987654321',
                      id: 'wamid.LIST_REPLY_1',
                      timestamp: '1710000020',
                      type: 'interactive',
                      interactive: {
                        type: 'list_reply',
                        list_reply: {
                          id: 'opt_size_1000',
                          title: 'Ukuran 1000 Liter',
                          description: 'Kapasitas rumah tangga besar',
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const event = parseMetaWebhookPayload(payload);
      expect(event.messages.length).toBe(1);
      const msg = event.messages[0];
      expect(msg.type).toBe('interactive');
      expect(msg.text).toBe('Ukuran 1000 Liter');
      expect(msg.interactiveReply).toEqual({
        type: 'list_reply',
        id: 'opt_size_1000',
        title: 'Ukuran 1000 Liter',
        description: 'Kapasitas rumah tangga besar',
      });
    });

    it('normalizes image and document media messages with captions', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'phone_tenant_active' },
                  messages: [
                    {
                      from: '628111222333',
                      id: 'wamid.IMAGE_1',
                      timestamp: '1710000030',
                      type: 'image',
                      image: {
                        id: 'img_media_id_101',
                        mime_type: 'image/jpeg',
                        caption: 'Foto kondisi toren bocor',
                      },
                    },
                    {
                      from: '628111222333',
                      id: 'wamid.DOC_1',
                      timestamp: '1710000035',
                      type: 'document',
                      document: {
                        id: 'doc_media_id_202',
                        mime_type: 'application/pdf',
                        filename: 'bukti_transfer.pdf',
                        caption: 'Bukti transfer DP',
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const event = parseMetaWebhookPayload(payload);
      expect(event.messages.length).toBe(2);
      expect(event.messages[0].type).toBe('image');
      expect(event.messages[0].text).toBe('Foto kondisi toren bocor');
      expect(event.messages[0].media?.id).toBe('img_media_id_101');

      expect(event.messages[1].type).toBe('document');
      expect(event.messages[1].text).toBe('Bukti transfer DP');
      expect(event.messages[1].media?.filename).toBe('bukti_transfer.pdf');
    });

    it('normalizes delivery and read statuses', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'phone_tenant_active' },
                  statuses: [
                    {
                      id: 'wamid.OUTBOUND_MSG_1',
                      status: 'delivered',
                      timestamp: '1710000100',
                      recipient_id: '628123456789',
                      conversation: { id: 'conv_123' },
                      pricing: { billable: true, category: 'utility' },
                    },
                    {
                      id: 'wamid.OUTBOUND_MSG_2',
                      status: 'read',
                      timestamp: '1710000110',
                      recipient_id: '628123456789',
                    },
                    {
                      id: 'wamid.OUTBOUND_MSG_3',
                      status: 'failed',
                      timestamp: '1710000120',
                      recipient_id: '628123456789',
                      errors: [
                        {
                          code: 131026,
                          title: 'Message Undeliverable',
                          message: 'Recipient phone number is invalid or unsupported',
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const event = parseMetaWebhookPayload(payload);
      expect(event.statuses.length).toBe(3);

      expect(event.statuses[0].status).toBe('delivered');
      expect(event.statuses[0].recipientPhone).toBe('628123456789');
      expect(event.statuses[0].pricing?.category).toBe('utility');

      expect(event.statuses[1].status).toBe('read');

      expect(event.statuses[2].status).toBe('failed');
      expect(event.statuses[2].errors?.[0].code).toBe(131026);
    });
  });

  describe('3. Canonical Route Handlers (/api/v1/webhooks/whatsapp/meta)', () => {
    it('GET: handles Meta handshake verification challenge successfully', async () => {
      process.env.META_WHATSAPP_VERIFY_TOKEN = 'production_verify_token_2026';
      const req = new Request(
        'https://inbox.boontrack.com/api/v1/webhooks/whatsapp/meta?hub.mode=subscribe&hub.verify_token=production_verify_token_2026&hub.challenge=test_challenge_meta_777',
        { method: 'GET' }
      );

      const res = await metaGet(req);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe('test_challenge_meta_777');
    });

    it('GET: returns 403 when verify_token mismatch', async () => {
      process.env.META_WHATSAPP_VERIFY_TOKEN = 'secret_token';
      const req = new Request(
        'https://inbox.boontrack.com/api/v1/webhooks/whatsapp/meta?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=test',
        { method: 'GET' }
      );

      const res = await metaGet(req);
      expect(res.status).toBe(403);
    });

    it('POST: processes valid inbound message and calls ConversationEngine', async () => {
      const secret = 'test_webhook_secret_key';
      process.env.META_APP_SECRET = secret;

      const bodyObj = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'phone_tenant_active' },
                  messages: [
                    {
                      from: '628123456789',
                      id: 'wamid.TEST_INBOUND_1',
                      timestamp: '1710000000',
                      type: 'text',
                      text: { body: 'Halo, tanya jadwal kuras toren' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const rawBody = JSON.stringify(bodyObj);
      const signature =
        'sha256=' +
        crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

      const req = new Request(
        'https://inbox.boontrack.com/api/v1/webhooks/whatsapp/meta',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-hub-signature-256': signature,
          },
          body: rawBody,
        }
      );

      const res = await metaPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('processed');
      expect(json.tenant_id).toBe('tenant-test');
      expect(json.processed_messages).toBe(1);

      expect(mockConversationEngineProcess).toHaveBeenCalledTimes(1);
      expect(mockConversationEngineProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-test',
          message: 'Halo, tanya jadwal kuras toren',
          session_id: '628123456789',
          channel_type: 'WABA',
        })
      );
    });

    it('POST: rejects request when HMAC signature is invalid', async () => {
      process.env.META_APP_SECRET = 'correct_secret';
      const rawBody = JSON.stringify({ object: 'whatsapp_business_account' });

      const req = new Request(
        'https://inbox.boontrack.com/api/v1/webhooks/whatsapp/meta',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-hub-signature-256': 'sha256=invalid_tampered_signature',
          },
          body: rawBody,
        }
      );

      const res = await metaPost(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Invalid signature');
    });
  });
});
