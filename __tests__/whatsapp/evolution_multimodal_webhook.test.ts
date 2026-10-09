import {
  processEvolutionWebhookEvent,
  getEvolutionMediaBase64,
  sendEvolutionTextMessage,
} from '@/lib/whatsapp/evolution-webhook-handler';
import { processMultimodalChat } from '@/lib/ai/multimodal-chat';

// Mock Supabase to prevent actual network calls during testing
const mockConnections: Record<string, any> = {
  'boontrack-gateway': {
    tenant_id: 'boon',
    instance_name: 'boontrack-gateway',
    credential_ref: 'test-evo-key',
    status: 'CONNECTED',
  },
  'test-instance': {
    tenant_id: 'boon',
    instance_name: 'test-instance',
    credential_ref: 'test-api-key',
    status: 'CONNECTED',
  },
};

const mockSupabaseClient = {
  from: jest.fn((tableName: string) => {
    if (tableName === 'whatsapp_connections') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn((field: string, val: string) => ({
            maybeSingle: jest.fn(async () => {
              const conn = mockConnections[val] || null;
              return { data: conn, error: null };
            }),
          })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn(async () => ({ data: null, error: null })),
        })),
      };
    }

    if (tableName === 'tenants') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: {
                id: '52967979-4760-4cea-b686-cdbdb389c0e1',
                slug: 'boon',
                name: 'Boon Official Store',
                category: 'digital',
                metadata: {
                  store_name: 'Boon Official Store',
                  products: [
                    {
                      id: 'setup-ai',
                      slug: 'setup-ai-sales-rep',
                      title: 'Setup AI Sales Rep Siap Jualan',
                      price: 49000,
                      promo_price: 49000,
                      description: 'Setup bot AI Sales Rep',
                    },
                  ],
                },
              },
              error: null,
            })),
          })),
          or: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: null, error: null })),
          })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn(async () => ({ data: null, error: null })),
        })),
      };
    }

    // Default mock for conversations, messages, bot_profiles, etc.
    return {
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => ({ data: null, error: null })),
          single: jest.fn(async () => ({ data: null, error: null })),
          limit: jest.fn(async () => ({ data: [], error: null })),
        })),
        or: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(async () => ({ data: { id: 'conv-mock-123' }, error: null })),
        })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(async () => ({ data: null, error: null })),
      })),
    };
  }),
};

jest.mock('@/lib/supabaseClient', () => ({
  getSupabaseAdmin: jest.fn(() => mockSupabaseClient),
  getSupabase: jest.fn(() => mockSupabaseClient),
}));

// Mock global fetch
const originalFetch = global.fetch;

describe('WhatsApp Evolution API Multimodal Webhook Ingress', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn();
    global.fetch = mockFetch as any;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('1. Deteksi Pesan Gambar & Unduh Base64 dari Evolution API', () => {
    it('downloads base64 media via POST /chat/getBase64FromMediaMessage/{instance} when imageMessage is present', async () => {
      const mockBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          base64: mockBase64,
          mimetype: 'image/jpeg',
        }),
      });

      const messageObj = {
        key: {
          remoteJid: '628123456789@s.whatsapp.net',
          fromMe: false,
          id: 'TEST_MSG_ID_001',
        },
        message: {
          imageMessage: {
            mimetype: 'image/jpeg',
            caption: 'Ini bukti transfer Rp 99.175',
            fileSha256: 'sha256-mock-hash',
          },
        },
      };

      const result = await getEvolutionMediaBase64('test-instance', messageObj, 'test-api-key');

      expect(result.base64).toBe(mockBase64);
      expect(result.mimeType).toBe('image/jpeg');

      // Verifikasi pemanggilan endpoint Evolution API
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
      expect(calledUrl).toContain('/chat/getBase64FromMediaMessage/test-instance');
      expect(calledOptions.method).toBe('POST');
      expect(calledOptions.headers.apikey).toBe('test-api-key');

      const parsedBody = JSON.parse(calledOptions.body);
      expect(parsedBody.message.key.id).toBe('TEST_MSG_ID_001');
      expect(parsedBody.convertToMp4).toBe(false);
    });

    it('extracts base64 directly from payload if already provided in webhook event', async () => {
      const inlineBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...';
      const messageObj = {
        base64: inlineBase64,
        message: {
          imageMessage: {
            mimetype: 'image/png',
            caption: 'Foto produk',
          },
        },
      };

      const result = await getEvolutionMediaBase64('test-instance', messageObj);
      expect(result.base64).toBe(inlineBase64);
      expect(result.mimeType).toBe('image/png');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('2. Pipeline Multimodal Gemini 3.8 Flash (Vision & Text)', () => {
    it('passes text, image_base64, and mime_type to Gemini API and receives visual analysis', async () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key';
      process.env.AI_MODEL_NAME = 'gemini-3.8-flash';

      // Mock Gemini API Response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'Bukti transfer sebesar Rp 99.175 untuk pembayaran telah kami terima dengan jelas. Pesanan sedang kami verifikasi.',
                  },
                ],
              },
            },
          ],
        }),
      });

      const chatResult = await processMultimodalChat({
        tenant_slug: 'boon',
        text: 'Ini bukti transfer saya ya kak',
        image_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
        mime_type: 'image/jpeg',
      });

      expect(chatResult.success).toBe(true);
      expect(chatResult.reply).toContain('Bukti transfer sebesar Rp 99.175');

      // Verifikasi request ke Gemini API
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [geminiUrl, geminiOptions] = mockFetch.mock.calls[0];
      expect(geminiUrl).toContain('gemini-3.8-flash:generateContent');
      expect(geminiUrl).toContain('key=test-gemini-key');

      const geminiBody = JSON.parse(geminiOptions.body);
      const userMessage = geminiBody.contents.find((c: any) => c.role === 'user' && c.parts.length >= 2);
      expect(userMessage).toBeDefined();

      // Cek bagian multimodal: inlineData gambar & teks caption
      const inlineDataPart = userMessage.parts.find((p: any) => p.inlineData);
      expect(inlineDataPart).toBeDefined();
      expect(inlineDataPart.inlineData.mimeType).toBe('image/jpeg');
      expect(inlineDataPart.inlineData.data).toBe('/9j/4AAQSkZJRg...');

      const textPart = userMessage.parts.find((p: any) => p.text);
      expect(textPart.text).toBe('Ini bukti transfer saya ya kak');
    });

    it('uses fallback prompt "Tolong analisa gambar ini sesuai konteks toko." when user sends image without caption', async () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'Foto produk yang Anda kirimkan cocok dengan paket Setup AI Sales Rep.',
                  },
                ],
              },
            },
          ],
        }),
      });

      const chatResult = await processMultimodalChat({
        tenant_slug: 'boon',
        text: '',
        image_base64: 'rawBase64ImageDataString',
        mime_type: 'image/jpeg',
      });

      expect(chatResult.success).toBe(true);

      const [, geminiOptions] = mockFetch.mock.calls[0];
      const geminiBody = JSON.parse(geminiOptions.body);
      const userMessage = geminiBody.contents.find((c: any) => c.role === 'user' && c.parts.length >= 2);
      const textPart = userMessage.parts.find((p: any) => p.text);
      expect(textPart.text).toBe('Tolong analisa gambar ini sesuai konteks toko.');
    });
  });

  describe('3. Ingress Webhook End-to-End Processing (MESSAGES_UPSERT)', () => {
    it('handles imageMessage event, downloads base64, queries AI, and sends response back via Evolution API', async () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key';
      process.env.EVOLUTION_API_KEY = 'test-evo-key';

      // 1. Fetch getBase64FromMediaMessage mock
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          base64: 'data:image/jpeg;base64,IMAGE_DATA_123',
          mimetype: 'image/jpeg',
        }),
      });

      // 2. Fetch Gemini generateContent mock
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'Terima kasih, bukti transfer berhasil diverifikasi!',
                  },
                ],
              },
            },
          ],
        }),
      });

      // 3. Fetch sendPresence typing simulation mock
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'success' }),
      });

      // 4. Fetch sendText back to user mock
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          key: { id: 'OUTBOUND_REPLY_001' },
        }),
      });

      const webhookPayload = {
        event: 'MESSAGES_UPSERT',
        instance: 'boontrack-gateway',
        data: {
          key: {
            remoteJid: '6281298765432@s.whatsapp.net',
            fromMe: false,
            id: 'INBOUND_IMG_001',
          },
          pushName: 'Pelanggan Toko',
          message: {
            imageMessage: {
              mimetype: 'image/jpeg',
              caption: 'Mohon dicek ya min transferannya',
            },
          },
        },
      };

      const result = await processEvolutionWebhookEvent(webhookPayload, 'boontrack-gateway');

      expect(result.success).toBe(true);
      expect(result.processed).toBe(1);

      // Verifikasi 4 panggilan API berurutan:
      // 1: getBase64FromMediaMessage
      // 2: Gemini API
      // 3: sendPresence
      // 4: sendText
      expect(mockFetch).toHaveBeenCalledTimes(4);

      const [mediaCallUrl] = mockFetch.mock.calls[0];
      expect(mediaCallUrl).toContain('/chat/getBase64FromMediaMessage/boontrack-gateway');

      const [geminiCallUrl] = mockFetch.mock.calls[1];
      expect(geminiCallUrl).toContain('generativelanguage.googleapis.com');

      const [presenceCallUrl] = mockFetch.mock.calls[2];
      expect(presenceCallUrl).toContain('/chat/sendPresence/boontrack-gateway');

      const [sendTextUrl, sendTextOpts] = mockFetch.mock.calls[3];
      expect(sendTextUrl).toContain('/message/sendText/boontrack-gateway');
      const sendTextBody = JSON.parse(sendTextOpts.body);
      expect(sendTextBody.number).toBe('6281298765432');
      expect(sendTextBody.text).toBe('Terima kasih, bukti transfer berhasil diverifikasi!');
    });

    it('ignores outbound message sent by bot (fromMe=true)', async () => {
      const outboundPayload = {
        event: 'MESSAGES_UPSERT',
        instance: 'boontrack-gateway',
        data: {
          key: {
            remoteJid: '6281298765432@s.whatsapp.net',
            fromMe: true,
            id: 'OUTBOUND_BOT_MSG',
          },
          message: {
            conversation: 'Halo kak ada yang bisa dibantu?',
          },
        },
      };

      const result = await processEvolutionWebhookEvent(outboundPayload, 'boontrack-gateway');
      expect(result.success).toBe(true);
      expect(result.processed).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
