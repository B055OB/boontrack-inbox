/**
 * lib/outbox/adapters/waba-adapter.ts
 * Production WhatsApp Provider Adapter.
 *
 * Wraps MetaWabaProviderAdapter (services/waba.ts) and resolves the access token
 * from environment variables or Supabase credential_ref.
 *
 * Architecture: Section 22 — Pure transport layer. Business logic lives in the worker.
 */

import type { IProviderAdapter, OutboxMessage, SendResult } from '../types';
import { metaWabaAdapter } from '@/services/waba';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

/**
 * Resolve the WhatsApp access token for a given credential_ref or phone_number_id.
 * Priority:
 *   1. WABA_ACCESS_TOKEN env var (single-tenant / dev shortcut)
 *   2. Supabase lookup via whatsapp_connections table
 */
async function resolveAccessToken(
  tenantId: string,
  phoneNumberId: string | null
): Promise<string | null> {
  // Fast-path: single env var token (local dev / single-WABA setup)
  const envToken = process.env.WABA_ACCESS_TOKEN?.trim();
  if (envToken) return envToken;

  if (!tenantId || tenantId === 'undefined' || tenantId === 'null') return null;

  // Dynamic path: look up token from whatsapp_connections
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('whatsapp_connections')
    .select('credential_ref, phone_number, instance_name, status')
    .eq('tenant_id', tenantId)
    .eq('provider', 'WABA')
    .eq('status', 'CONNECTED')
    .maybeSingle();

  if (error || !data) return null;

  // credential_ref may be a direct token or a secret name — for now treat as direct token
  return data.credential_ref ?? null;
}

export class WabaProviderAdapter implements IProviderAdapter {
  async send(message: OutboxMessage): Promise<SendResult> {
    const { tenant_id, phone_number_id, payload } = message;
    const targetRecipient = message.recipient || message.recipient_phone;

    // Resolve access token
    const accessToken = await resolveAccessToken(tenant_id, phone_number_id);
    if (!accessToken) {
      return {
        success: false,
        error: `[WabaProviderAdapter] No access token resolved for tenant '${tenant_id}'`,
      };
    }

    // phone_number_id must be present in the message
    const phoneId = phone_number_id?.trim();
    if (!phoneId) {
      return {
        success: false,
        error: '[WabaProviderAdapter] Missing phone_number_id on outbox message',
      };
    }

    try {
      const result = await metaWabaAdapter.sendMessage(
        phoneId,
        accessToken,
        targetRecipient,
        payload as Record<string, unknown>
      );

      if (result.success) {
        return { success: true, messageId: result.messageId };
      }

      return { success: false, error: result.error ?? 'Unknown Meta Graph API error' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `[WabaProviderAdapter] Exception: ${msg}` };
    }
  }
}

export const wabaProviderAdapter = new WabaProviderAdapter();
