/**
 * lib/whatsapp/outbound-registry.ts
 *
 * Outbound Message Registry
 * Tracks outbound messages sent by the bot/system to prevent self-pause loops
 * when Evolution API sends webhook events with key.fromMe = true.
 */

export interface BotOutboundEntry {
  tenantId?: string;
  messageId?: string;
  recipientPhone: string;
  textSnippet: string;
  timestamp: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes TTL
const MAX_REGISTRY_ENTRIES = 1000;

// In-memory registry of bot outbound messages
const outboundRegistry: BotOutboundEntry[] = [];
// In-memory fast-lookup map for compound keys: `${tenantId}:${wa_message_id}` -> timestamp
const outboundKeyMap = new Map<string, number>();

/**
 * Normalizes phone numbers to standard format (digits only, e.g. 62812345678)
 */
export function normalizeRegistryPhone(phone?: string | null): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) {
    return '62' + digits.slice(1);
  }
  if (digits.startsWith('8')) {
    return '62' + digits;
  }
  return digits;
}

/**
 * Normalizes text for lenient snippet comparison
 */
export function normalizeRegistryText(text?: string | null): string {
  if (!text) return '';
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 150); // Compare first 150 chars
}

/**
 * Registers an outbound message sent by the bot or system.
 * Uses compound key `${tenant_id}:${wa_message_id}` to prevent cross-tenant collision.
 */
export function registerBotOutbound(params: {
  tenantId?: string | null;
  messageId?: string | null;
  recipientPhone?: string | null;
  text?: string | null;
}): void {
  const cleanPhone = normalizeRegistryPhone(params.recipientPhone);
  const cleanText = normalizeRegistryText(params.text);
  const msgId = params.messageId ? String(params.messageId).trim() : undefined;
  const cleanTenantId = params.tenantId ? String(params.tenantId).trim() : undefined;

  if (!cleanPhone && !msgId) return;

  const now = Date.now();

  // Prune expired entries
  pruneOutboundRegistry(now);

  // Register compound key: `${tenant_id}:${wa_message_id}`
  if (cleanTenantId && msgId) {
    outboundKeyMap.set(`${cleanTenantId}:${msgId}`, now);
  }
  if (msgId) {
    outboundKeyMap.set(msgId, now);
  }

  outboundRegistry.push({
    tenantId: cleanTenantId,
    messageId: msgId,
    recipientPhone: cleanPhone,
    textSnippet: cleanText,
    timestamp: now,
  });

  // Guard against unbounded memory growth
  if (outboundRegistry.length > MAX_REGISTRY_ENTRIES) {
    outboundRegistry.splice(0, outboundRegistry.length - MAX_REGISTRY_ENTRIES);
  }
}

/**
 * Checks whether an incoming fromMe = true event matches a recorded bot outbound message.
 * Supports scoped checks using tenantId + messageId.
 */
export function isBotOutbound(params: {
  tenantId?: string | null;
  messageId?: string | null;
  recipientPhone?: string | null;
  text?: string | null;
  ttlMs?: number;
}): boolean {
  const cleanPhone = normalizeRegistryPhone(params.recipientPhone);
  const cleanText = normalizeRegistryText(params.text);
  const msgId = params.messageId ? String(params.messageId).trim() : undefined;
  const cleanTenantId = params.tenantId ? String(params.tenantId).trim() : undefined;
  const ttl = params.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();

  // 1. Fast check via compound key `${tenant_id}:${wa_message_id}`
  if (cleanTenantId && msgId) {
    const compoundKey = `${cleanTenantId}:${msgId}`;
    const ts = outboundKeyMap.get(compoundKey);
    if (ts !== undefined && now - ts <= ttl) {
      return true;
    }
  }

  // 2. Linear scan with strict tenant scoping & fallback snippet comparison
  for (let i = outboundRegistry.length - 1; i >= 0; i--) {
    const entry = outboundRegistry[i];
    if (now - entry.timestamp > ttl) {
      continue;
    }

    // Direct message ID match (scoped by tenant if both provide tenantId)
    if (msgId && entry.messageId && entry.messageId === msgId) {
      if (cleanTenantId && entry.tenantId) {
        if (entry.tenantId === cleanTenantId) {
          return true;
        }
      } else {
        return true;
      }
    }

    // Phone and content snippet match
    if (cleanPhone && entry.recipientPhone === cleanPhone) {
      // Prevent cross-tenant snippet collision if tenants are explicitly different
      if (cleanTenantId && entry.tenantId && entry.tenantId !== cleanTenantId) {
        continue;
      }

      if (!cleanText && !entry.textSnippet) {
        return true;
      }
      if (cleanText && entry.textSnippet) {
        if (
          cleanText === entry.textSnippet ||
          cleanText.includes(entry.textSnippet) ||
          entry.textSnippet.includes(cleanText)
        ) {
          return true;
        }
      }
    }
  }

  // 3. Fallback: check raw msgId in key map if tenantId wasn't known during registration
  if (msgId && !cleanTenantId) {
    const ts = outboundKeyMap.get(msgId);
    if (ts !== undefined && now - ts <= ttl) {
      return true;
    }
  }

  return false;
}

/**
 * Prunes expired entries older than DEFAULT_TTL_MS
 */
export function pruneOutboundRegistry(now: number = Date.now()): void {
  let writeIdx = 0;
  for (let i = 0; i < outboundRegistry.length; i++) {
    if (now - outboundRegistry[i].timestamp <= DEFAULT_TTL_MS) {
      outboundRegistry[writeIdx++] = outboundRegistry[i];
    }
  }
  outboundRegistry.length = writeIdx;

  for (const [key, ts] of outboundKeyMap.entries()) {
    if (now - ts > DEFAULT_TTL_MS) {
      outboundKeyMap.delete(key);
    }
  }
}

/**
 * Checks whether an incoming fromMe = true event matches a recorded bot outbound message,
 * checking in-memory registry first, then fallback to outbound_messages & messages tables in Supabase
 * to reliably handle worker restarts without false echo takeovers.
 */
export async function isBotOutboundAsync(params: {
  tenantId?: string | null;
  messageId?: string | null;
  recipientPhone?: string | null;
  text?: string | null;
  supabase?: any;
}): Promise<boolean> {
  if (isBotOutbound(params)) return true;

  const msgId = params.messageId ? String(params.messageId).trim() : undefined;
  const cleanTenantId = params.tenantId ? String(params.tenantId).trim() : undefined;
  const cleanPhone = normalizeRegistryPhone(params.recipientPhone);
  const cleanText = normalizeRegistryText(params.text);

  // Database Fallback: Required when worker restarts or instances clear in-memory cache
  if (params.supabase) {
    // A. Check outbound_messages table by wa_message_id
    if (msgId) {
      try {
        let q = params.supabase
          .from('outbound_messages')
          .select('id, tenant_id')
          .eq('wa_message_id', msgId);

        if (cleanTenantId) {
          if (typeof q.or === 'function') {
            q = q.or(`tenant_id.eq.${cleanTenantId}`);
          } else if (typeof q.eq === 'function') {
            q = q.eq('tenant_id', cleanTenantId);
          }
        }

        const { data, error } = await q.maybeSingle();
        if (!error && data?.id) {
          // Re-populate in-memory registry for subsequent duplicate webhooks
          registerBotOutbound({
            tenantId: cleanTenantId || data.tenant_id,
            messageId: msgId,
            recipientPhone: cleanPhone,
            text: cleanText,
          });
          return true;
        }
      } catch (err) {
        console.warn('[OutboundRegistry] Fallback check outbound_messages error:', err);
      }
    }

    // B. Check messages table by external_id where sender in ['bot', 'system']
    if (msgId) {
      try {
        const { data: msgData, error: msgErr } = await params.supabase
          .from('messages')
          .select('id, sender')
          .eq('external_id', msgId)
          .maybeSingle();

        if (!msgErr && msgData?.id && (msgData.sender === 'bot' || msgData.sender === 'system')) {
          registerBotOutbound({
            tenantId: cleanTenantId,
            messageId: msgId,
            recipientPhone: cleanPhone,
            text: cleanText,
          });
          return true;
        }
      } catch (err) {
        console.warn('[OutboundRegistry] Fallback check messages error:', err);
      }
    }

    // C. Check recent bot message in outbound_messages for this recipient within 5 minutes
    if (cleanPhone) {
      try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        let recentQ = params.supabase
          .from('outbound_messages')
          .select('id, tenant_id')
          .eq('recipient_jid', cleanPhone)
          .eq('source', 'bot')
          .gte('created_at', fiveMinutesAgo)
          .limit(1);

        if (cleanTenantId && typeof recentQ.eq === 'function') {
          recentQ = recentQ.eq('tenant_id', cleanTenantId);
        }

        const { data: recData } = await recentQ.maybeSingle();
        if (recData?.id) {
          if (msgId) {
            registerBotOutbound({
              tenantId: cleanTenantId || recData.tenant_id,
              messageId: msgId,
              recipientPhone: cleanPhone,
              text: cleanText,
            });
          }
          return true;
        }
      } catch (_) {}
    }
  }

  return false;
}

/**
 * Clears the registry (useful for unit tests)
 */
export function clearOutboundRegistry(): void {
  outboundRegistry.length = 0;
  outboundKeyMap.clear();
}

/**
 * Returns current size of registry
 */
export function getOutboundRegistrySize(): number {
  return outboundRegistry.length;
}
