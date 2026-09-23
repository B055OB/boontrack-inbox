/**
 * lib/outbox/adapters/multi-provider-adapter.ts
 * Multi-Provider WhatsApp Router Adapter.
 *
 * Dynamically determines whether to route an outbound WhatsApp message
 * via Meta WABA Graph API or Evolution API v2 based on:
 *   1. Explicit payload indicator or phone_number_id
 *   2. Tenant configuration in `whatsapp_connections` (provider = 'WABA' | 'EVOLUTION')
 *   3. Default fallback to Evolution API official gateway
 */

import type { IProviderAdapter, OutboxMessage, SendResult, WhatsAppProvider } from '../types';
import { wabaProviderAdapter, WabaProviderAdapter } from './waba-adapter';
import { evolutionProviderAdapter, EvolutionProviderAdapter } from './evolution-adapter';
import { getSupabaseAdmin } from '@/lib/supabaseClient';

export class MultiProviderAdapter implements IProviderAdapter {
  private readonly wabaAdapter: IProviderAdapter;
  private readonly evolutionAdapter: IProviderAdapter;

  constructor(options?: {
    wabaAdapter?: IProviderAdapter;
    evolutionAdapter?: IProviderAdapter;
  }) {
    this.wabaAdapter = options?.wabaAdapter ?? wabaProviderAdapter;
    this.evolutionAdapter = options?.evolutionAdapter ?? evolutionProviderAdapter;
  }

  /**
   * Resolve which provider a tenant is configured to use.
   */
  async resolveProvider(tenantId: string, phoneNumberId?: string | null): Promise<WhatsAppProvider> {
    // If a Meta phone_number_id is explicitly set on the message, route to WABA
    if (phoneNumberId && phoneNumberId.trim().length > 0) {
      return 'WABA';
    }

    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('whatsapp_connections')
        .select('provider, status')
        .eq('tenant_id', tenantId)
        .eq('status', 'CONNECTED')
        .maybeSingle();

      if (!error && data?.provider) {
        return data.provider as WhatsAppProvider;
      }
    } catch {
      // Ignore DB query errors in disconnected/mock environments
    }

    // Default provider per ARCHITECTURE.md Section 9.1
    return 'EVOLUTION';
  }

  async send(message: OutboxMessage): Promise<SendResult> {
    const provider = await this.resolveProvider(message.tenant_id, message.phone_number_id);

    if (provider === 'WABA') {
      return this.wabaAdapter.send(message);
    }

    return this.evolutionAdapter.send(message);
  }
}

export const multiProviderAdapter = new MultiProviderAdapter();
