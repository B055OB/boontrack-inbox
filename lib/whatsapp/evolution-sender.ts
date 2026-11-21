/**
 * lib/whatsapp/evolution-sender.ts
 * Outbound message dispatch utilities for Evolution API.
 * Isolated from webhook ingress and server-side state mutation handlers
 * so client components can safely import message dispatchers without
 * dragging database writers or server secrets into browser bundles.
 */

import { formatToWhatsAppMarkdown } from '@/lib/formatting/universal-chat-formatter';
import { registerBotOutbound } from '@/lib/whatsapp/outbound-registry';

export const EVOLUTION_API_URL =
  process.env.EVOLUTION_API_URL ||
  'https://evolution-api-production-abb7.up.railway.app';

/**
 * Resolves EVOLUTION_API_KEY with strict fail-closed enforcement.
 * ZERO hardcoded fallbacks allowed.
 * Throws an Error immediately if process.env.EVOLUTION_API_KEY is not set or empty.
 */
export function getRequiredEvolutionApiKey(customApiKey?: string): string {
  const custom = customApiKey?.trim();
  if (custom) return custom;

  const envKey = process.env.EVOLUTION_API_KEY?.trim();
  if (!envKey) {
    throw new Error(
      '[SECURITY FATAL] EVOLUTION_API_KEY is not configured or empty in process.env. Fail-closed enforced.'
    );
  }
  return envKey;
}

export const getEvolutionApiKey = getRequiredEvolutionApiKey;

/**
 * Sends a text message back to WhatsApp via Evolution API.
 */
export async function sendEvolutionTextMessage(
  instanceName: string,
  recipientPhone: string,
  text: string,
  customApiKey?: string,
  tenantId?: string
): Promise<boolean> {
  const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
  const apiKey = getRequiredEvolutionApiKey(customApiKey);
  const endpoint = `${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`;

  let cleanNumber = (recipientPhone || '').trim();
  if (!cleanNumber.includes('@g.us')) {
    cleanNumber = cleanNumber.replace(/\D/g, '');
    if (cleanNumber.startsWith('0')) {
      cleanNumber = '62' + cleanNumber.slice(1);
    } else if (cleanNumber.startsWith('8')) {
      cleanNumber = '62' + cleanNumber;
    }
  }

  const formattedText = formatToWhatsAppMarkdown(text).trim();

  // Pre-register in Outbound Registry to eliminate race condition with immediate webhook echo
  registerBotOutbound({
    tenantId,
    recipientPhone: cleanNumber,
    text: formattedText,
  });

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: cleanNumber,
        text: formattedText,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      try {
        const data = await res.json();
        const returnedId = data?.key?.id || data?.id || data?.messageId;
        if (returnedId) {
          registerBotOutbound({
            tenantId,
            messageId: returnedId,
            recipientPhone: cleanNumber,
            text: formattedText,
          });
        }
      } catch (_) {}
    }

    return res.ok;
  } catch (err) {
    console.warn('[Evolution Send] Exception sending text message:', err);
    return false;
  }
}

/**
 * Sends presence status (composing / typing simulation) to Evolution API.
 * Calls `POST /chat/sendPresence/{instance}`.
 */
export async function sendEvolutionPresence(
  instanceName: string,
  recipientPhone: string,
  presence: 'composing' | 'recording' | 'paused' = 'composing',
  customApiKey?: string
): Promise<boolean> {
  const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
  const apiKey = getRequiredEvolutionApiKey(customApiKey);
  const endpoint = `${baseUrl}/chat/sendPresence/${encodeURIComponent(instanceName)}`;

  let cleanNumber = (recipientPhone || '').trim();
  if (!cleanNumber.includes('@g.us')) {
    cleanNumber = cleanNumber.replace(/\D/g, '');
    if (cleanNumber.startsWith('0')) {
      cleanNumber = '62' + cleanNumber.slice(1);
    } else if (cleanNumber.startsWith('8')) {
      cleanNumber = '62' + cleanNumber;
    }
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: cleanNumber,
        presence,
        delay: 1200,
      }),
      signal: AbortSignal.timeout(4000),
    });

    return res.ok;
  } catch (err) {
    console.warn('[Evolution Presence] Exception sending presence:', err);
    return false;
  }
}
