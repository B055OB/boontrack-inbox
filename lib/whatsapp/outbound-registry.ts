/**
 * lib/whatsapp/outbound-registry.ts
 *
 * Outbound Message Registry
 * Tracks outbound messages sent by the bot/system to prevent self-pause loops
 * when Evolution API sends webhook events with key.fromMe = true.
 */

export interface BotOutboundEntry {
  messageId?: string;
  recipientPhone: string;
  textSnippet: string;
  timestamp: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes TTL
const MAX_REGISTRY_ENTRIES = 1000;

// In-memory registry of bot outbound messages
const outboundRegistry: BotOutboundEntry[] = [];

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
 */
export function registerBotOutbound(params: {
  messageId?: string | null;
  recipientPhone?: string | null;
  text?: string | null;
}): void {
  const cleanPhone = normalizeRegistryPhone(params.recipientPhone);
  const cleanText = normalizeRegistryText(params.text);
  const msgId = params.messageId ? String(params.messageId).trim() : undefined;

  if (!cleanPhone && !msgId) return;

  const now = Date.now();

  // Prune expired entries
  pruneOutboundRegistry(now);

  outboundRegistry.push({
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
 */
export function isBotOutbound(params: {
  messageId?: string | null;
  recipientPhone?: string | null;
  text?: string | null;
  ttlMs?: number;
}): boolean {
  const cleanPhone = normalizeRegistryPhone(params.recipientPhone);
  const cleanText = normalizeRegistryText(params.text);
  const msgId = params.messageId ? String(params.messageId).trim() : undefined;
  const ttl = params.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();

  for (let i = outboundRegistry.length - 1; i >= 0; i--) {
    const entry = outboundRegistry[i];
    if (now - entry.timestamp > ttl) {
      continue;
    }

    // Direct message ID match (Highest confidence)
    if (msgId && entry.messageId && entry.messageId === msgId) {
      return true;
    }

    // Phone and content snippet match
    if (cleanPhone && entry.recipientPhone === cleanPhone) {
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
}

/**
 * Checks whether an incoming fromMe = true event matches a recorded bot outbound message,
 * checking in-memory registry first, then fallback to outbound_messages table in Supabase.
 */
export async function isBotOutboundAsync(params: {
  messageId?: string | null;
  recipientPhone?: string | null;
  text?: string | null;
  supabase?: any;
}): Promise<boolean> {
  if (isBotOutbound(params)) return true;

  if (params.messageId && params.supabase) {
    try {
      const { data } = await params.supabase
        .from('outbound_messages')
        .select('id')
        .eq('wa_message_id', String(params.messageId).trim())
        .maybeSingle();

      if (data?.id) return true;
    } catch (_) {}
  }

  return false;
}

/**
 * Clears the registry (useful for unit tests)
 */
export function clearOutboundRegistry(): void {
  outboundRegistry.length = 0;
}

/**
 * Returns current size of registry
 */
export function getOutboundRegistrySize(): number {
  return outboundRegistry.length;
}
