/**
 * lib/whatsapp/outbound-registry.ts
 *
 * Outbound Message Registry & Identity Normalizer
 * Tracks outbound messages sent by the bot/system to prevent self-pause loops
 * when Evolution API sends webhook events with key.fromMe = true.
 *
 * HOTFIX P0:
 * - Decouples operator command authorization from in-memory echo detection.
 * - Provides canonical phone identity normalizer (+62, 62, 08, JID format).
 */

export type EchoDetectionResult = 'MATCH' | 'NOT_MATCH' | 'UNKNOWN';

export interface BotOutboundEntry {
  tenantId?: string;
  messageId?: string;
  conversationId?: string;
  recipientPhone: string;
  textSnippet: string;
  source?: 'system_generated' | 'bot' | string;
  timestamp: number;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL per CTO Directive TASK-102
const MAX_REGISTRY_ENTRIES = 2000;

// In-memory registry of bot outbound messages
const outboundRegistry: BotOutboundEntry[] = [];
// In-memory fast-lookup map for compound keys: `${tenantId}:${wa_message_id}` and `outbound:msg:${message_id}` -> timestamp
const outboundKeyMap = new Map<string, number>();

/**
 * Normalizes phone numbers (+62, 62, 08, format JID) to a single canonical identity.
 * Handles:
 * - JID format: e.g. '62812345678@s.whatsapp.net', '62812345678:0@s.whatsapp.net', '0812345678@c.us'
 * - Leading plus: '+62812345678'
 * - Indonesian prefix '08...' -> '628...'
 * - Raw '8...' -> '628...'
 * - Returns clean canonical digits (e.g. '62812345678')
 */
export function toCanonicalPhone(phone?: string | null): string {
  if (!phone) return '';
  let str = String(phone).trim();

  // Strip JID domain suffix (@s.whatsapp.net, @c.us, @g.us, etc.)
  if (str.includes('@')) {
    str = str.split('@')[0];
  }
  // Strip WhatsApp multidevice suffix (:0, :1, etc.)
  if (str.includes(':')) {
    str = str.split(':')[0];
  }
  // Strip non-digits
  const digits = str.replace(/\D/g, '');
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
 * Alias for canonical identity normalization in registry lookups
 */
export function normalizeRegistryPhone(phone?: string | null): string {
  return toCanonicalPhone(phone);
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
 * Guard: Detects whether a message is an operator bot control command (#pause, #pause 30, #off, #resume, #on, etc.).
 * Operator commands must NEVER be classified or suppressed as bot outbound echoes.
 *
 * Strictly matches:
 * 1. Exact commands (#pause, #resume, #off, #on with #, !, / or plain, and optional trailing punctuation)
 * 2. Pause with duration (#pause 30, /pause 45 menit, pause 15m)
 *
 * Normal bot messages or sentences containing command keywords
 * (e.g. "on boarding", "off white", "on delivery", "on process", "pause pesanan", "on schedule")
 * must NEVER be classified as operator commands!
 */
export function isOperatorBotControlText(text?: string | null): boolean {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim().toLowerCase();
  if (!clean) return false;

  // 1. Support #pause with duration (e.g. "#pause 30", "!pause 15m", "/pause 45 menit", "pause 60")
  if (/^[#/!]?pause\s+(\d+)(?:\s*(?:m|mnt|menit|min|minutes?))?[!.\s]*$/i.test(clean)) {
    return true;
  }

  // 2. Exact single-word commands (#pause, #resume, #off, #on) with optional prefix and trailing punctuation
  const stripped = clean.replace(/^[#/!]/, '').replace(/[!.\s]+$/, '');
  return ['pause', 'resume', 'off', 'on'].includes(stripped);
}

/**
 * Registers an outbound message sent by the bot or system.
 * Uses compound keys `${tenant_id}:${wa_message_id}`, `outbound:msg:${message_id}`, and raw `messageId`
 * to prevent cross-tenant collision while enabling ultra-fast echo detection.
 */
export function registerBotOutbound(params: {
  tenantId?: string | null;
  messageId?: string | null;
  conversationId?: string | null;
  recipientPhone?: string | null;
  text?: string | null;
  source?: 'system_generated' | 'bot' | string;
}): void {
  const cleanPhone = normalizeRegistryPhone(params.recipientPhone);
  const cleanText = normalizeRegistryText(params.text);
  const msgId = params.messageId ? String(params.messageId).trim() : undefined;
  const convId = params.conversationId ? String(params.conversationId).trim() : undefined;
  const cleanTenantId = params.tenantId ? String(params.tenantId).trim() : undefined;
  const source = params.source || 'system_generated';

  if (!cleanPhone && !msgId) return;

  const now = Date.now();

  // Prune expired entries
  pruneOutboundRegistry(now);

  // Register keys with 15-minute TTL:
  // 1. Redis-style key per directive: `outbound:msg:{message_id}`
  if (msgId) {
    outboundKeyMap.set(`outbound:msg:${msgId}`, now);
    outboundKeyMap.set(msgId, now);
  }
  // 2. Compound key: `${tenant_id}:${wa_message_id}`
  if (cleanTenantId && msgId) {
    outboundKeyMap.set(`${cleanTenantId}:${msgId}`, now);
  }
  // 3. Conversation-level mapping
  if (convId && msgId) {
    outboundKeyMap.set(`conv:${convId}:${msgId}`, now);
  }

  outboundRegistry.push({
    tenantId: cleanTenantId,
    messageId: msgId,
    conversationId: convId,
    recipientPhone: cleanPhone,
    textSnippet: cleanText,
    source,
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
 * Strictly separates operator commands from echo detection.
 */
export function isBotOutbound(params: {
  tenantId?: string | null;
  messageId?: string | null;
  recipientPhone?: string | null;
  text?: string | null;
  ttlMs?: number;
}): boolean {
  // Guard: Operator commands must NEVER be treated as bot echoes!
  if (isOperatorBotControlText(params.text)) {
    return false;
  }

  const cleanPhone = normalizeRegistryPhone(params.recipientPhone);
  const cleanText = normalizeRegistryText(params.text);
  const msgId = params.messageId ? String(params.messageId).trim() : undefined;
  const cleanTenantId = params.tenantId ? String(params.tenantId).trim() : undefined;
  const ttl = params.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();

  // 1. Fast check via compound keys: `${tenant_id}:${wa_message_id}`
  if (cleanTenantId && msgId) {
    const compoundKey = `${cleanTenantId}:${msgId}`;
    const ts = outboundKeyMap.get(compoundKey);
    if (ts !== undefined && now - ts <= ttl) {
      return true;
    }
  } else if (!cleanTenantId && msgId) {
    // Check global keys ONLY when cleanTenantId is not provided
    const redisKey = `outbound:msg:${msgId}`;
    const tsRedis = outboundKeyMap.get(redisKey);
    if (tsRedis !== undefined && now - tsRedis <= ttl) {
      return true;
    }
    const ts = outboundKeyMap.get(msgId);
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

    // Direct message ID match (scoped by tenant if cleanTenantId is provided)
    if (msgId && entry.messageId && entry.messageId === msgId) {
      if (cleanTenantId && entry.tenantId) {
        if (entry.tenantId === cleanTenantId) {
          return true;
        }
      } else if (!cleanTenantId) {
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

  return false;
}

/**
 * Fast lookup to check if a messageId is registered as a bot outbound message with tenant scoping.
 */
export function isRegisteredOutboundMessage(messageId?: string | null, tenantId?: string | null): boolean {
  if (!messageId) return false;
  const msgId = String(messageId).trim();
  const cleanTenant = tenantId ? String(tenantId).trim() : undefined;
  const now = Date.now();
  const ttl = DEFAULT_TTL_MS;

  if (cleanTenant) {
    const tsCompound = outboundKeyMap.get(`${cleanTenant}:${msgId}`);
    if (tsCompound !== undefined && now - tsCompound <= ttl) return true;
  } else {
    const redisKey = `outbound:msg:${msgId}`;
    const tsRedis = outboundKeyMap.get(redisKey);
    if (tsRedis !== undefined && now - tsRedis <= ttl) return true;

    const tsRaw = outboundKeyMap.get(msgId);
    if (tsRaw !== undefined && now - tsRaw <= ttl) return true;
  }

  for (let i = outboundRegistry.length - 1; i >= 0; i--) {
    const entry = outboundRegistry[i];
    if (now - entry.timestamp > ttl) continue;
    if (entry.messageId === msgId) {
      if (cleanTenant && entry.tenantId) {
        if (entry.tenantId === cleanTenant) return true;
      } else if (!cleanTenant) {
        return true;
      }
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

async function withDbTimeout<T = any>(promise: Promise<T> | any, timeoutMs = 2500): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('DB_TIMEOUT')), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
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
}): Promise<EchoDetectionResult> {
  // Operator command is decoupled from echo registry - never treat as echo!
  if (isOperatorBotControlText(params.text)) {
    return 'NOT_MATCH';
  }

  if (isBotOutbound(params)) return 'MATCH';

  const msgId = params.messageId ? String(params.messageId).trim() : undefined;
  const cleanTenantId = params.tenantId ? String(params.tenantId).trim() : undefined;
  const cleanPhone = normalizeRegistryPhone(params.recipientPhone);
  const cleanText = normalizeRegistryText(params.text);

  // If supabase client is missing or invalid, DB fallback cannot run -> return UNKNOWN to prevent false takeover
  if (!params.supabase || typeof params.supabase.from !== 'function') {
    return 'UNKNOWN';
  }

  let dbErrorOccurred = false;

  // Database Fallback: Required when worker restarts or instances clear in-memory cache
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

      const res: any = await withDbTimeout(
        typeof q.maybeSingle === 'function' ? q.maybeSingle() : q
      );
      const data = res?.data;
      const error = res?.error;

      if (error) {
        dbErrorOccurred = true;
        console.warn('[OutboundRegistry] Fallback query error on outbound_messages:', error);
      } else if (data?.id) {
        // Re-populate in-memory registry for subsequent duplicate webhooks
        registerBotOutbound({
          tenantId: cleanTenantId || data.tenant_id,
          messageId: msgId,
          recipientPhone: cleanPhone,
          text: cleanText,
        });
        return 'MATCH';
      }
    } catch (err) {
      dbErrorOccurred = true;
      console.warn('[OutboundRegistry] Fallback exception on outbound_messages:', err);
    }
  }

  // B. Check messages table by external_id where sender in ['bot', 'system']
  if (msgId) {
    try {
      let msgQ: any = params.supabase
        .from('messages')
        .select('id, sender, tenant_id')
        .eq('external_id', msgId);

      // Wajib tambahkan filter eq('tenant_id', cleanTenantId) jika cleanTenantId tersedia untuk mencegah cross-tenant ID collision
      if (cleanTenantId && typeof msgQ.eq === 'function') {
        msgQ = msgQ.eq('tenant_id', cleanTenantId);
      }

      const res: any = await withDbTimeout(
        typeof msgQ.maybeSingle === 'function' ? msgQ.maybeSingle() : msgQ
      );
      const msgData = res?.data;
      const msgErr = res?.error;

      if (msgErr) {
        dbErrorOccurred = true;
        console.warn('[OutboundRegistry] Fallback query error on messages:', msgErr);
      } else if (msgData?.id && (msgData.sender === 'bot' || msgData.sender === 'system')) {
        registerBotOutbound({
          tenantId: cleanTenantId || msgData.tenant_id,
          messageId: msgId,
          recipientPhone: cleanPhone,
          text: cleanText,
        });
        return 'MATCH';
      }
    } catch (err) {
      dbErrorOccurred = true;
      console.warn('[OutboundRegistry] Fallback exception on messages:', err);
    }
  }

  // C. Check recent bot message in outbound_messages for this recipient within 5 minutes
  if (cleanPhone) {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      let recentQ: any = params.supabase
        .from('outbound_messages')
        .select('id, tenant_id');

      if (typeof recentQ.eq === 'function') {
        recentQ = recentQ.eq('recipient_jid', cleanPhone);
        if (typeof recentQ.eq === 'function') {
          recentQ = recentQ.eq('source', 'bot');
        }
      }

      if (typeof recentQ.gte === 'function') {
        recentQ = recentQ.gte('created_at', fiveMinutesAgo);
      }

      if (cleanTenantId && typeof recentQ.eq === 'function') {
        recentQ = recentQ.eq('tenant_id', cleanTenantId);
      }

      if (typeof recentQ.limit === 'function') {
        recentQ = recentQ.limit(1);
      }

      const res: any = await withDbTimeout(
        typeof recentQ.maybeSingle === 'function' ? recentQ.maybeSingle() : recentQ
      );
      const recData = res?.data;
      const recErr = res?.error;

      if (recErr) {
        dbErrorOccurred = true;
        console.warn('[OutboundRegistry] Fallback query error on recent outbound:', recErr);
      } else if (recData?.id) {
        if (msgId) {
          registerBotOutbound({
            tenantId: cleanTenantId || recData.tenant_id,
            messageId: msgId,
            recipientPhone: cleanPhone,
            text: cleanText,
          });
        }
        return 'MATCH';
      }
    } catch (err: any) {
      dbErrorOccurred = true;
      console.warn('[OutboundRegistry] Fallback exception on recent outbound:', err?.message || err);
    }
  }

  // If a DB error or timeout occurred, return UNKNOWN to prevent false human takeover
  if (dbErrorOccurred) {
    return 'UNKNOWN';
  }

  return 'NOT_MATCH';
}
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
