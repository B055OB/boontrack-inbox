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
 * Resolve the WhatsApp credentials (access token and phone_number_id).
 * Priority:
 *   1. WABA_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID env vars
 *   2. Supabase lookup via whatsapp_connections table
 */
async function resolveWabaCredentials(
  tenantId: string,
  phoneNumberId: string | null
): Promise<{ accessToken: string | null; phoneNumberId: string | null }> {
  const envToken = process.env.WABA_ACCESS_TOKEN?.trim() || process.env.META_WA_TOKEN?.trim() || null;
  const envPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || process.env.META_PHONE_NUMBER_ID?.trim() || null;

  if (!tenantId || tenantId === 'undefined' || tenantId === 'null') {
    return { accessToken: envToken, phoneNumberId: phoneNumberId || envPhoneId };
  }

  // Dynamic path: look up credentials from whatsapp_connections
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const { data } = await supabase
        .from('whatsapp_connections')
        .select('credential_ref, api_key, metadata, phone_number, instance_name, status, phone_number_id')
        .or(`tenant_id.eq.${tenantId},tenant_slug.eq.${tenantId}`)
        .in('provider', ['WABA', 'meta', 'META', 'waba'])
        .in('status', ['CONNECTED', 'active', 'ACTIVE'])
        .maybeSingle();

      if (data) {
        const candidateToken =
          data.api_key ||
          data.metadata?.token ||
          data.metadata?.access_token ||
          data.metadata?.waba_access_token ||
          (data.credential_ref && data.credential_ref.length > 50 ? data.credential_ref : null);

        const candidatePhoneId =
          phoneNumberId ||
          data.phone_number_id ||
          data.metadata?.phone_number_id ||
          null;

        if (candidateToken || candidatePhoneId) {
          return {
            accessToken: candidateToken || envToken || null,
            phoneNumberId: candidatePhoneId || envPhoneId || null,
          };
        }
      }
    } catch {}
  }

  // Fallback: look up token directly from tenants table metadata
  try {
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('metadata')
      .or(`id.eq.${tenantId},slug.eq.${tenantId}`)
      .maybeSingle();
    const token = tenantRow?.metadata?.waba_access_token || envToken || null;
    const phoneId = tenantRow?.metadata?.whatsapp_phone_number_id || phoneNumberId || envPhoneId || null;
    return { accessToken: token, phoneNumberId: phoneId };
  } catch {}

  return { accessToken: envToken, phoneNumberId: phoneNumberId || envPhoneId };
}

export class WabaProviderAdapter implements IProviderAdapter {
  async send(message: OutboxMessage): Promise<SendResult> {
    const { tenant_id, phone_number_id, payload } = message;
    const targetRecipient = message.recipient || message.recipient_phone;

    // Resolve credentials (accessToken & phoneNumberId)
    const { accessToken, phoneNumberId: resolvedPhoneId } = await resolveWabaCredentials(
      tenant_id,
      phone_number_id
    );

    if (!accessToken) {
      return {
        success: false,
        error: `[WabaProviderAdapter] No access token resolved for tenant '${tenant_id}'`,
      };
    }

    const phoneId = resolvedPhoneId?.trim();
    if (!phoneId) {
      return {
        success: false,
        error: `[WabaProviderAdapter] Missing phone_number_id for tenant '${tenant_id}'`,
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
