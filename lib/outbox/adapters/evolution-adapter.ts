/**
 * lib/outbox/adapters/evolution-adapter.ts
 * Production Evolution API v2 Provider Adapter.
 *
 * Implements WhatsApp messaging via official Evolution API v2 gateway (Section 9.1 & 22 ARCHITECTURE.md).
 * Pure transport layer: resolves tenant instance from `whatsapp_connections` or shared fallback gateway.
 */

import type { IProviderAdapter, OutboxMessage, SendResult } from '../types';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

const EVOLUTION_API_URL =
  process.env.EVOLUTION_API_URL ||
  'https://evolution-api-production-abb7.up.railway.app';

const EVOLUTION_API_KEY =
  process.env.EVOLUTION_API_KEY ||
  '4398809d97f770b1a2b243ed0ee33bf3312d02dec42be8789ea3512f487f4c5e';

const EVOLUTION_GATEWAY_INSTANCE =
  process.env.EVOLUTION_GATEWAY_INSTANCE || 'boontrack-gateway';

/**
 * Normalizes a phone number to standard international format (e.g. 62812xxxx)
 */
function cleanRecipientNumber(raw: string): string {
  let clean = raw.replace(/\D/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  return clean;
}

/**
 * Extracts human-readable or formatted text from diverse payload shapes.
 */
function extractTextFromPayload(payload: unknown): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;

  const obj = payload as Record<string, unknown>;
  if (obj.type === 'text' && obj.text && typeof obj.text === 'object') {
    const textObj = obj.text as { body?: string };
    if (textObj.body) return textObj.body;
  }
  if (obj.type === 'evolution_text' && typeof obj.text === 'string') {
    return obj.text;
  }
  if (typeof obj.text === 'string') return obj.text;
  if (typeof obj.body === 'string') return obj.body;
  if (typeof obj.message === 'string') return obj.message;

  return JSON.stringify(payload);
}

/**
 * Resolve the Evolution API instance and API key for a tenant.
 */
async function resolveEvolutionInstance(
  tenantId: string
): Promise<{ instanceName: string; apiKey: string }> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('whatsapp_connections')
    .select('instance_name, credential_ref, provider, status')
    .eq('tenant_id', tenantId)
    .eq('provider', 'EVOLUTION')
    .maybeSingle();

  if (!error && data?.instance_name) {
    const apiKey = data.credential_ref?.trim() || EVOLUTION_API_KEY;
    return { instanceName: data.instance_name, apiKey };
  }

  // Fallback to official shared gateway instance
  return {
    instanceName: EVOLUTION_GATEWAY_INSTANCE,
    apiKey: EVOLUTION_API_KEY,
  };
}

export class EvolutionProviderAdapter implements IProviderAdapter {
  async send(message: OutboxMessage): Promise<SendResult> {
    const targetRecipient = message.recipient || message.recipient_phone;
    const cleanNumber = cleanRecipientNumber(targetRecipient);

    if (!cleanNumber) {
      return {
        success: false,
        error: '[EvolutionProviderAdapter] Missing or invalid recipient phone number',
      };
    }

    const textBody = extractTextFromPayload(message.payload);
    if (!textBody) {
      return {
        success: false,
        error: '[EvolutionProviderAdapter] Empty message payload text',
      };
    }

    const { instanceName, apiKey } = await resolveEvolutionInstance(message.tenant_id);

    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
    const url = `${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          number: cleanNumber,
          text: textBody,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg =
          (data as { message?: string; error?: string })?.message ||
          (data as { message?: string; error?: string })?.error ||
          `Evolution API HTTP ${response.status}`;
        return {
          success: false,
          error: `[EvolutionProviderAdapter] ${errorMsg}`,
        };
      }

      // Extract message ID from Evolution v2 response structure
      const resObj = data as { key?: { id?: string }; messageId?: string; id?: string };
      const messageId = resObj.key?.id || resObj.messageId || resObj.id || `evo-${Date.now()}`;

      return {
        success: true,
        messageId,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `[EvolutionProviderAdapter] Network exception: ${msg}`,
      };
    }
  }
}

export const evolutionProviderAdapter = new EvolutionProviderAdapter();
