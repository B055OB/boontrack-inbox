/**
 * services/waba.ts
 * Meta WABA Provider Adapter — Pure Transport Layer to Meta Graph API v21.0.
 *
 * Sesuai Section 22 ARCHITECTURE.md:
 * Murni transport layer, terisolasi dari business logic toko/tenant.
 * Parameter wajib: phoneNumberId, accessToken (resolve dari credential_ref), to, payload.
 */

export interface WabaSendOptions {
  phoneNumberId: string;
  accessToken: string;
  to: string;
}

export interface WabaTextMessagePayload {
  type?: 'text';
  text: {
    preview_url?: boolean;
    body: string;
  };
  [key: string]: any;
}

export interface WabaInteractiveMessagePayload {
  type?: 'interactive';
  interactive: Record<string, any>;
  [key: string]: any;
}

export interface WabaTemplateMessagePayload {
  type?: 'template';
  template: {
    name: string;
    language: { code: string };
    components?: any[];
  };
  [key: string]: any;
}

export type WabaMessagePayload =
  | WabaTextMessagePayload
  | WabaInteractiveMessagePayload
  | WabaTemplateMessagePayload
  | Record<string, any>;

export interface MetaWabaSendResult {
  success: boolean;
  messageId?: string;
  statusCode?: number;
  data?: any;
  error?: string;
}

export class MetaWabaProviderAdapter {
  private static readonly GRAPH_API_VERSION = 'v21.0';
  private static readonly BASE_URL = 'https://graph.facebook.com';

  /**
   * Mengirim pesan arbitrary payload via Graph API v21.0.
   * Endpoint: https://graph.facebook.com/v21.0/{phoneNumberId}/messages
   *
   * @param phoneNumberId - Meta WABA phone number id
   * @param accessToken - Access token hasil resolve dari credential_ref
   * @param to - Nomor WhatsApp tujuan (format internasional: 62812xxxx)
   * @param payload - Payload spesifik Meta WABA (text, interactive, template, media, dll.)
   */
  async sendMessage(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    payload: WabaMessagePayload
  ): Promise<MetaWabaSendResult> {
    const cleanPhoneId = String(phoneNumberId || '').trim();
    if (!cleanPhoneId) {
      return { success: false, error: 'Missing or invalid phoneNumberId' };
    }

    const cleanToken = String(accessToken || '').trim();
    if (!cleanToken) {
      return { success: false, error: 'Missing or invalid accessToken' };
    }

    const cleanTo = String(to || '').replace(/\D/g, '');
    if (!cleanTo) {
      return { success: false, error: 'Missing or invalid recipient phone number (to)' };
    }

    const url = `${MetaWabaProviderAdapter.BASE_URL}/${MetaWabaProviderAdapter.GRAPH_API_VERSION}/${encodeURIComponent(
      cleanPhoneId
    )}/messages`;

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      ...payload,
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg = data?.error?.message || `Meta Graph API error (HTTP ${res.status})`;
        return {
          success: false,
          statusCode: res.status,
          error: errorMsg,
          data,
        };
      }

      const messageId = data?.messages?.[0]?.id;
      return {
        success: true,
        statusCode: res.status,
        messageId,
        data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network exception connecting to Meta Graph API',
      };
    }
  }

  /**
   * Helper pengiriman pesan teks standar.
   */
  async sendText(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    text: string,
    previewUrl: boolean = false
  ): Promise<MetaWabaSendResult> {
    return this.sendMessage(phoneNumberId, accessToken, to, {
      type: 'text',
      text: {
        preview_url: previewUrl,
        body: text,
      },
    });
  }

  /**
   * Helper untuk menandai pesan masuk sebagai telah dibaca (read status).
   */
  async markAsRead(
    phoneNumberId: string,
    accessToken: string,
    messageId: string
  ): Promise<boolean> {
    const cleanPhoneId = String(phoneNumberId || '').trim();
    const cleanToken = String(accessToken || '').trim();
    if (!cleanPhoneId || !cleanToken || !messageId) return false;

    const url = `${MetaWabaProviderAdapter.BASE_URL}/${MetaWabaProviderAdapter.GRAPH_API_VERSION}/${encodeURIComponent(
      cleanPhoneId
    )}/messages`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const metaWabaAdapter = new MetaWabaProviderAdapter();
