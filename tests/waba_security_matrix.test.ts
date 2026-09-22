/**
 * @file tests/waba_security_matrix.test.ts
 * @description Acceptance Test Suite for WABA Security Matrix (CTO Review Compliance).
 *
 * Acceptance Matrix:
 * 1. POST dengan invalid signature -> BLOCKED/REJECTED (HTTP 401).
 * 2. POST tanpa phone_number_id -> DROPPED (HTTP 200 ignored).
 * 3. POST dengan unmapped / foreign phone_number_id -> DROPPED (HTTP 200 ignored).
 * 4. POST event valid Tenant A saat operational status = DISCONNECTED (ownership active) -> ACCEPTED ke Tenant A context.
 * 5. Outbound test: Tenant A mencoba dispatch menggunakan credential_ref Tenant B -> ASSERTION/BLOCK failure, 0 send.
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// 1. Mocks setup
// ---------------------------------------------------------------------------

const mockConnections: Record<string, any> = {
  // Tenant A: Active ownership, but operational status is DISCONNECTED
  phone_tenant_a: {
    tenant_id: 'tenant-a',
    ownership_domain: 'TENANT',
    status: 'DISCONNECTED',
    credential_ref: 'cred_ref_tenant_a',
    phone_number_id: 'phone_tenant_a',
    provider: 'META',
  },
  // Tenant B: Active & Connected
  phone_tenant_b: {
    tenant_id: 'tenant-b',
    ownership_domain: 'TENANT',
    status: 'CONNECTED',
    credential_ref: 'cred_ref_tenant_b',
    phone_number_id: 'phone_tenant_b',
    provider: 'META',
  },
  // Revoked Connection
  phone_revoked: {
    tenant_id: 'tenant-revoked',
    ownership_domain: 'TENANT',
    status: 'REVOKED',
    credential_ref: 'cred_ref_revoked',
    phone_number_id: 'phone_revoked',
    provider: 'META',
  },
  // Platform Connection (not TENANT)
  phone_platform: {
    tenant_id: 'system',
    ownership_domain: 'PLATFORM',
    status: 'CONNECTED',
    credential_ref: 'cred_ref_platform',
    phone_number_id: 'phone_platform',
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
    if (tableName !== 'whatsapp_connections') {
      return {
        select: jest.fn(() => ({ eq: jest.fn(() => ({ single: jest.fn() })) })),
      };
    }
    return {
      select: jest.fn(() => ({
        eq: jest.fn((field1: string, val1: string) => ({
          eq: jest.fn((field2: string, val2: string) => ({
            eq: jest.fn((field3: string, val3: string) => ({
              single: jest.fn(async () => {
                // Find matching mock connection
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
                if (match) {
                  return { data: match, error: null };
                }
                return { data: null, error: { message: 'Row not found' } };
              }),
            })),
          })),
        })),
      })),
    };
  }),
};

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => mockSupabaseClient),
  getSupabase: jest.fn(() => mockSupabaseClient),
}));

// ---------------------------------------------------------------------------
// 2. Imports (after mocks)
// ---------------------------------------------------------------------------
import { GET, POST, verifyMetaWebhookSignature } from '@/app/api/whatsapp/webhook/waba/route';
import { metaWabaAdapter } from '@/services/waba';

describe('WABA Security Boundary Acceptance Matrix', () => {
  const TEST_APP_SECRET = 'meta_test_secret_key_12345';
  const TEST_VERIFY_TOKEN = 'test_verify_token_abc';

  beforeAll(() => {
    process.env.META_APP_SECRET = TEST_APP_SECRET;
    process.env.META_VERIFY_TOKEN = TEST_VERIFY_TOKEN;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createSignature(payload: string, secret: string = TEST_APP_SECRET): string {
    return 'sha256=' + crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  }

  // -------------------------------------------------------------------------
  // Matrix Point 1: POST dengan invalid signature -> BLOCKED/REJECTED (401)
  // -------------------------------------------------------------------------
  describe('1. Meta Webhook Signature Verification (HMAC-SHA256)', () => {
    it('rejects POST with missing signature when secret is configured', async () => {
      const payload = JSON.stringify({ entry: [] });
      const req = new Request('https://inbox.boontrack.com/api/whatsapp/webhook/waba', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: payload,
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({ error: 'Invalid signature' });
      expect(mockConversationEngineProcess).not.toHaveBeenCalled();
    });

    it('rejects POST with malformed or tampered signature (invalid hash)', async () => {
      const payload = JSON.stringify({ entry: [] });
      const req = new Request('https://inbox.boontrack.com/api/whatsapp/webhook/waba', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': 'sha256=invalid_tampered_hash_0123456789abcdef',
        },
        body: payload,
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({ error: 'Invalid signature' });
      expect(mockConversationEngineProcess).not.toHaveBeenCalled();
    });

    it('rejects POST signed with wrong secret key', async () => {
      const payload = JSON.stringify({ entry: [] });
      const wrongSignature = createSignature(payload, 'wrong_secret');
      const req = new Request('https://inbox.boontrack.com/api/whatsapp/webhook/waba', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': wrongSignature,
        },
        body: payload,
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      expect(mockConversationEngineProcess).not.toHaveBeenCalled();
    });

    it('passes signature verification when correctly signed', () => {
      const payload = JSON.stringify({ test: 'data' });
      const validSignature = createSignature(payload, TEST_APP_SECRET);
      const isValid = verifyMetaWebhookSignature(payload, validSignature, TEST_APP_SECRET);
      expect(isValid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Matrix Point 2: POST tanpa phone_number_id -> DROPPED (HTTP 200 ignored)
  // -------------------------------------------------------------------------
  describe('2. Payload without phone_number_id (Drop Boundary)', () => {
    it('returns HTTP 200 { status: "ignored" } with 0 AI / DB mutations', async () => {
      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA_123',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '62811111111',
                    // phone_number_id omitted deliberately
                  },
                  messages: [
                    {
                      from: '628123456789',
                      id: 'wamid.123',
                      type: 'text',
                      text: { body: 'Halo min' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      const signature = createSignature(payload);
      const req = new Request('https://inbox.boontrack.com/api/whatsapp/webhook/waba', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': signature,
        },
        body: payload,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ status: 'ignored', reason: 'missing_phone_number_id' });
      expect(mockConversationEngineProcess).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Matrix Point 3: POST unmapped / foreign phone_number_id -> DROPPED (HTTP 200)
  // -------------------------------------------------------------------------
  describe('3. Unmapped / Foreign / Revoked phone_number_id (Silent Drop)', () => {
    it('silently drops foreign phone_number_id not in registry', async () => {
      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA_123',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    phone_number_id: 'unknown_alien_phone_id',
                  },
                  messages: [
                    {
                      from: '628123456789',
                      id: 'wamid.456',
                      type: 'text',
                      text: { body: 'Spam from unknown source' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      const signature = createSignature(payload);
      const req = new Request('https://inbox.boontrack.com/api/whatsapp/webhook/waba', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': signature,
        },
        body: payload,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ status: 'ignored' });
      expect(mockConversationEngineProcess).not.toHaveBeenCalled();
    });

    it('silently drops connection with REVOKED status', async () => {
      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA_123',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    phone_number_id: 'phone_revoked',
                  },
                  messages: [
                    {
                      from: '628123456789',
                      id: 'wamid.789',
                      type: 'text',
                      text: { body: 'Hello on revoked line' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      const signature = createSignature(payload);
      const req = new Request('https://inbox.boontrack.com/api/whatsapp/webhook/waba', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': signature,
        },
        body: payload,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ status: 'ignored' });
      expect(mockConversationEngineProcess).not.toHaveBeenCalled();
    });

    it('silently drops PLATFORM domain connection (WABA is strictly TENANT domain)', async () => {
      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA_123',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    phone_number_id: 'phone_platform',
                  },
                  messages: [
                    {
                      from: '628123456789',
                      id: 'wamid.000',
                      type: 'text',
                      text: { body: 'Message to platform' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      const signature = createSignature(payload);
      const req = new Request('https://inbox.boontrack.com/api/whatsapp/webhook/waba', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': signature,
        },
        body: payload,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ status: 'ignored' });
      expect(mockConversationEngineProcess).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Matrix Point 4: Valid Tenant A saat DISCONNECTED -> ACCEPTED ke context Tenant A
  // -------------------------------------------------------------------------
  describe('4. Ownership State vs Operational State Separation', () => {
    it('accepts event for Tenant A even when operational status is DISCONNECTED', async () => {
      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA_123',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    phone_number_id: 'phone_tenant_a',
                  },
                  contacts: [{ profile: { name: 'Budi Pembeli' }, wa_id: '628123456789' }],
                  messages: [
                    {
                      from: '628123456789',
                      id: 'wamid.999',
                      type: 'text',
                      text: { body: 'Apakah produk ready?' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      const signature = createSignature(payload);
      const req = new Request('https://inbox.boontrack.com/api/whatsapp/webhook/waba', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': signature,
        },
        body: payload,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      // Verified: Ingress ACCEPTED ke context Tenant A!
      expect(data.status).toBe('processed');
      expect(data.tenant_id).toBe('tenant-a');
      expect(data.processed_messages).toBe(1);

      // Verified: ConversationEngine dipanggil dengan tenant_id "tenant-a"
      expect(mockConversationEngineProcess).toHaveBeenCalledTimes(1);
      expect(mockConversationEngineProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-a',
          message: 'Apakah produk ready?',
          session_id: '628123456789',
          channel_type: 'WABA',
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Matrix Point 5: Outbound Authority & Cross-Tenant Spoofing Defense
  // -------------------------------------------------------------------------
  describe('5. Outbound Authority Guard (Section 22.3 Assertion)', () => {
    it('blocks dispatch when Tenant A attempts to use Tenant B connection', () => {
      const connTenantB = mockConnections.phone_tenant_b;

      // Tenant A tries to dispatch using connection owned by Tenant B
      expect(() => {
        metaWabaAdapter.assertOutboundAuthority(
          'tenant-a', // Target caller
          connTenantB, // Belonging to tenant-b
          'cred_ref_tenant_b'
        );
      }).toThrow(/Cross-tenant boundary breach/);
    });

    it('blocks dispatch when Tenant A attempts to spoof with Tenant B credential_ref', () => {
      const connTenantA = {
        tenant_id: 'tenant-a',
        ownership_domain: 'TENANT',
        status: 'CONNECTED',
        credential_ref: 'cred_ref_tenant_a',
        phone_number_id: 'phone_tenant_a',
      };

      // Tenant A connection, but dispatched with Tenant B's credential_ref
      expect(() => {
        metaWabaAdapter.assertOutboundAuthority(
          'tenant-a',
          connTenantA,
          'cred_ref_tenant_b' // Foreign credential spoofing
        );
      }).toThrow(/Credential spoofing detected/);
    });

    it('blocks dispatch when connection operational state is not CONNECTED', () => {
      const connDisconnected = {
        tenant_id: 'tenant-a',
        ownership_domain: 'TENANT',
        status: 'DISCONNECTED',
        credential_ref: 'cred_ref_tenant_a',
        phone_number_id: 'phone_tenant_a',
      };

      expect(() => {
        metaWabaAdapter.assertOutboundAuthority(
          'tenant-a',
          connDisconnected,
          'cred_ref_tenant_a'
        );
      }).toThrow(/Operational state breach.*DISCONNECTED/);
    });

    it('blocks dispatch when ownership domain is not TENANT', () => {
      const connPlatform = mockConnections.phone_platform;

      expect(() => {
        metaWabaAdapter.assertOutboundAuthority(
          'system',
          connPlatform,
          'cred_ref_platform'
        );
      }).toThrow(/Domain breach: expected TENANT, got 'PLATFORM'/);
    });

    it('allows outbound dispatch when tenant, ownership domain, status, and credential match 100%', () => {
      const connTenantB = mockConnections.phone_tenant_b;

      expect(() => {
        metaWabaAdapter.assertOutboundAuthority(
          'tenant-b',
          connTenantB,
          'cred_ref_tenant_b'
        );
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Bonus: GET Handshake Challenge Verification
  // -------------------------------------------------------------------------
  describe('GET Challenge Handshake Verification', () => {
    it('returns challenge text with HTTP 200 when verify_token matches', async () => {
      const req = new Request(
        `https://inbox.boontrack.com/api/whatsapp/webhook/waba?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=challenge_123456`,
        { method: 'GET' }
      );

      const res = await GET(req);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe('challenge_123456');
    });

    it('returns HTTP 403 when verify_token does not match', async () => {
      const req = new Request(
        `https://inbox.boontrack.com/api/whatsapp/webhook/waba?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=challenge_123456`,
        { method: 'GET' }
      );

      const res = await GET(req);
      expect(res.status).toBe(403);
    });
  });
});
