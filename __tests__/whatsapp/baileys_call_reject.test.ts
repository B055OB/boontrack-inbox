import {
  handleBaileysIncomingCalls,
  attachBaileysCallRejectListener,
  rejectEvolutionCall,
  AUTO_REJECT_CALL_MESSAGE,
  BaileysCall,
  BaileysSocketLike,
} from '@/lib/whatsapp/baileys-call-handler';
import { processEvolutionWebhookEvent } from '@/lib/whatsapp/evolution-webhook-handler';

// Mock Supabase
jest.mock('@/lib/supabaseClient', () => {
  const mockClient = {
    from: jest.fn((table: string) => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 'mock-tenant-uuid-1',
          slug: 'boon-test',
          name: 'Boon Official',
          tier: 'PRO_SCALE',
        },
        error: null,
      }),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ error: null }),
      upsert: jest.fn().mockResolvedValue({ error: null }),
    })),
  };
  return {
    getSupabase: jest.fn(() => mockClient),
    getSupabaseAdmin: jest.fn(() => mockClient),
    isValidUuid: jest.fn(() => false),
    safeUuidOrNull: jest.fn(() => null),
  };
});

// Mock connection resolver
jest.mock('@/lib/whatsapp/inbox-persistence', () => {
  const actual = jest.requireActual('@/lib/whatsapp/inbox-persistence');
  return {
    ...actual,
    resolveTenantFromConnection: jest.fn().mockResolvedValue({
      tenantId: 'mock-tenant-uuid-1',
      tenantSlug: 'boon-test',
      tenantName: 'Boon Official',
      apiKey: 'test-api-key',
      isVerified: true,
    }),
    persistInboundMessage: jest.fn().mockResolvedValue(true),
    persistOutboundMessage: jest.fn().mockResolvedValue(true),
  };
});

describe('Baileys WhatsApp Call Auto-Reject & Auto-Reply Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. handleBaileysIncomingCalls (Direct Socket Execution)', () => {
    it('automatically rejects incoming call with status "offer" and replies with official bot message', async () => {
      const mockSock: BaileysSocketLike = {
        rejectCall: jest.fn().mockResolvedValue(true),
        sendMessage: jest.fn().mockResolvedValue({ key: { id: 'msg-1' } }),
      };

      const calls: BaileysCall[] = [
        {
          id: 'call_abc_123',
          from: '628123456789@s.whatsapp.net',
          status: 'offer',
          isVideo: false,
          isGroup: false,
        },
      ];

      const rejectedCount = await handleBaileysIncomingCalls(mockSock, calls);

      expect(rejectedCount).toBe(1);
      expect(mockSock.rejectCall).toHaveBeenCalledTimes(1);
      expect(mockSock.rejectCall).toHaveBeenCalledWith('call_abc_123', '628123456789@s.whatsapp.net');

      expect(mockSock.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockSock.sendMessage).toHaveBeenCalledWith('628123456789@s.whatsapp.net', {
        text: AUTO_REJECT_CALL_MESSAGE,
      });
    });

    it('ignores calls with status other than "offer" (e.g. "ringing", "reject", "timeout")', async () => {
      const mockSock: BaileysSocketLike = {
        rejectCall: jest.fn().mockResolvedValue(true),
        sendMessage: jest.fn().mockResolvedValue({}),
      };

      const nonOfferCalls: BaileysCall[] = [
        { id: 'c1', from: '628111@s.whatsapp.net', status: 'ringing' },
        { id: 'c2', from: '628222@s.whatsapp.net', status: 'reject' },
        { id: 'c3', from: '628333@s.whatsapp.net', status: 'timeout' },
      ];

      const rejectedCount = await handleBaileysIncomingCalls(mockSock, nonOfferCalls);

      expect(rejectedCount).toBe(0);
      expect(mockSock.rejectCall).not.toHaveBeenCalled();
      expect(mockSock.sendMessage).not.toHaveBeenCalled();
    });

    it('allows custom auto-reply text and fires onCallRejected hook', async () => {
      const mockSock: BaileysSocketLike = {
        rejectCall: jest.fn().mockResolvedValue(true),
        sendMessage: jest.fn().mockResolvedValue({}),
      };

      const customText = 'Panggilan ditolak. Chat kami di jam kerja ya!';
      const onCallRejected = jest.fn();

      const calls: BaileysCall[] = [
        { id: 'call_custom', from: '628999@s.whatsapp.net', status: 'offer' },
      ];

      await handleBaileysIncomingCalls(mockSock, calls, {
        replyText: customText,
        onCallRejected,
      });

      expect(mockSock.sendMessage).toHaveBeenCalledWith('628999@s.whatsapp.net', {
        text: customText,
      });
      expect(onCallRejected).toHaveBeenCalledWith(calls[0]);
    });

    it('handles socket error gracefully without throwing uncaught exceptions', async () => {
      const mockSock: BaileysSocketLike = {
        rejectCall: jest.fn().mockRejectedValue(new Error('Connection closed')),
        sendMessage: jest.fn(),
      };

      const onError = jest.fn();
      const calls: BaileysCall[] = [
        { id: 'call_err', from: '628777@s.whatsapp.net', status: 'offer' },
      ];

      await expect(
        handleBaileysIncomingCalls(mockSock, calls, { onError })
      ).resolves.toBe(0);

      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. attachBaileysCallRejectListener (Event Listener Registration)', () => {
    it('registers sock.ev.on("call") listener and handles incoming calls when emitted', async () => {
      let callListenerCallback: ((calls: any) => Promise<void>) | null = null;

      const mockSock: BaileysSocketLike = {
        rejectCall: jest.fn().mockResolvedValue(true),
        sendMessage: jest.fn().mockResolvedValue({}),
        ev: {
          on: jest.fn((event: string, callback: (...args: any[]) => any) => {
            if (event === 'call') {
              callListenerCallback = callback;
            }
          }),
        },
      };

      attachBaileysCallRejectListener(mockSock);

      expect(mockSock.ev?.on).toHaveBeenCalledWith('call', expect.any(Function));
      expect(callListenerCallback).not.toBeNull();

      // Simulate Baileys emitting call event
      const incomingCallPayload = [
        {
          id: 'incoming_call_101',
          from: '6285551234@s.whatsapp.net',
          status: 'offer',
        },
      ];

      await callListenerCallback!(incomingCallPayload);

      expect(mockSock.rejectCall).toHaveBeenCalledWith('incoming_call_101', '6285551234@s.whatsapp.net');
      expect(mockSock.sendMessage).toHaveBeenCalledWith('6285551234@s.whatsapp.net', {
        text: AUTO_REJECT_CALL_MESSAGE,
      });
    });
  });

  describe('3. rejectEvolutionCall (HTTP Remote Gateway)', () => {
    it('posts to Evolution API rejectCall endpoint with valid headers and payload', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      }) as any;

      const success = await rejectEvolutionCall(
        'https://api.example.com',
        'inst-demo',
        'call_99',
        '628123@s.whatsapp.net',
        'secret-api-key'
      );

      expect(success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/call/rejectCall/inst-demo',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            apikey: 'secret-api-key',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            callId: 'call_99',
            id: 'call_99',
            from: '628123@s.whatsapp.net',
          }),
        })
      );

      global.fetch = originalFetch;
    });
  });

  describe('4. processEvolutionWebhookEvent Integration (Webhook Ingress)', () => {
    it('detects CALL event, rejects call, dispatches auto-reply, and records to inbox ledger', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ key: { id: 'sent-msg-id' } }),
      }) as any;

      process.env.EVOLUTION_API_KEY = 'test-api-key';

      const webhookPayload = {
        event: 'CALL',
        instance: 'boontrack-gateway',
        data: [
          {
            id: 'call_ev_456',
            from: '6281977655099@s.whatsapp.net',
            status: 'offer',
            isVideo: false,
          },
        ],
      };

      const result = await processEvolutionWebhookEvent(webhookPayload);

      expect(result.success).toBe(true);
      expect(result.event).toBe('CALL_AUTO_REJECTED');
      expect(result.processed).toBe(1);

      // Verify Evolution sendText was dispatched with the auto-reply message
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/message/sendText/boontrack-gateway'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(AUTO_REJECT_CALL_MESSAGE),
        })
      );

      global.fetch = originalFetch;
    });
  });
});
