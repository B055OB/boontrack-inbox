/**
 * lib/hardening/deduplication.ts
 * Durable Deduplication Service for Hardening P0 (HARDENING_V1).
 *
 * Implements:
 * 1. Multi-tier deduplication check (Memory/Redis + Supabase DB record verification).
 * 2. Guaranteed duplicate event NO-OP.
 * 3. Structured telemetry with `hardening_policy_version: 'HARDENING_V1'`.
 */

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

interface CacheEntry {
  timestamp: number;
}

// In-Memory Ring Buffer / Sliding Window (TTL 10 minutes)
const memoryDedupCache = new Map<string, CacheEntry>();
const DEDUP_TTL_MS = 10 * 60 * 1000; // 10 minutes

function cleanupMemoryCache() {
  const now = Date.now();
  for (const [key, entry] of memoryDedupCache.entries()) {
    if (now - entry.timestamp > DEDUP_TTL_MS) {
      memoryDedupCache.delete(key);
    }
  }
}

export interface WebhookDeduplicationParams {
  externalId: string;
  tenantId?: string | null;
  tenantSlug?: string | null;
  senderPhone?: string | null;
  eventSignature?: string | null;
}

export interface DeduplicationCheckResult {
  isDuplicate: boolean;
  source?: 'MEMORY_CACHE' | 'REDIS' | 'DATABASE_RECORD';
  hardening_policy_version: 'HARDENING_V1';
}

/**
 * Checks whether an incoming webhook event has already been processed.
 * Safe, idempotent, durable.
 */
export async function isDuplicateWebhookEvent(
  params: WebhookDeduplicationParams
): Promise<DeduplicationCheckResult> {
  const { externalId, tenantId, tenantSlug } = params;
  if (!externalId) {
    return { isDuplicate: false, hardening_policy_version: 'HARDENING_V1' };
  }

  const cacheKey = `dedup:wa:${tenantSlug || tenantId || 'global'}:${externalId}`;
  const now = Date.now();

  // Tier 1: Check in-memory fast cache
  if (memoryDedupCache.has(cacheKey)) {
    const entry = memoryDedupCache.get(cacheKey)!;
    if (now - entry.timestamp < DEDUP_TTL_MS) {
      console.info(`[DEDUPLICATION_NOOP] Duplicate webhook event detected in memory cache: ${cacheKey}`, {
        hardening_policy_version: 'HARDENING_V1',
        external_id: externalId,
        tenant_slug: tenantSlug,
      });
      return {
        isDuplicate: true,
        source: 'MEMORY_CACHE',
        hardening_policy_version: 'HARDENING_V1',
      };
    }
  }

  // Tier 2: Check Redis if configured via Upstash / REDIS_URL
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (redisUrl && redisToken) {
    try {
      const upstashEndpoint = `${redisUrl.replace(/\/$/, '')}/get/${encodeURIComponent(cacheKey)}`;
      const redisRes = await fetch(upstashEndpoint, {
        headers: { Authorization: `Bearer ${redisToken}` },
        signal: AbortSignal.timeout(1500),
      });
      if (redisRes.ok) {
        const redisJson = await redisRes.json().catch(() => null);
        if (redisJson?.result !== null && redisJson?.result !== undefined) {
          memoryDedupCache.set(cacheKey, { timestamp: now });
          console.info(`[DEDUPLICATION_NOOP] Duplicate webhook event detected in Redis: ${cacheKey}`, {
            hardening_policy_version: 'HARDENING_V1',
            external_id: externalId,
            tenant_slug: tenantSlug,
          });
          return {
            isDuplicate: true,
            source: 'REDIS',
            hardening_policy_version: 'HARDENING_V1',
          };
        }
      }
    } catch (redisErr) {
      // Non-blocking fallback to DB check
      console.warn('[Deduplication] Redis check warning (falling back to DB):', redisErr);
    }
  }

  // Tier 3: Check Supabase DB messages ledger (Durable source of truth)
  const supabase = getSupabaseAdmin() || getSupabase();
  if (supabase) {
    try {
      let dbQuery: any = supabase
        .from('messages')
        .select('id, created_at')
        .eq('external_id', externalId);

      if (tenantId) {
        dbQuery = dbQuery.or(`tenant_id.eq.${tenantId},tenant_slug.eq.${tenantSlug || tenantId}`);
      }
      dbQuery = dbQuery.limit(1);

      const { data: existingRows } = await dbQuery;
      if (Array.isArray(existingRows) && existingRows.length > 0) {
        // Record found in DB -> this event is a duplicate delivery!
        memoryDedupCache.set(cacheKey, { timestamp: now });
        console.info(`[DEDUPLICATION_NOOP] Duplicate webhook event detected in DB messages record: ${cacheKey}`, {
          hardening_policy_version: 'HARDENING_V1',
          external_id: externalId,
          db_message_id: existingRows[0]?.id,
          tenant_slug: tenantSlug,
        });
        return {
          isDuplicate: true,
          source: 'DATABASE_RECORD',
          hardening_policy_version: 'HARDENING_V1',
        };
      }
    } catch (dbErr) {
      console.warn('[Deduplication] DB duplicate check warning:', dbErr);
    }
  }

  // Record this event ID to memory cache to guard concurrent burst duplicates
  memoryDedupCache.set(cacheKey, { timestamp: now });
  if (memoryDedupCache.size > 2000) {
    cleanupMemoryCache();
  }

  // Also set to Redis if available (TTL 600s = 10m)
  if (redisUrl && redisToken) {
    try {
      const upstashSet = `${redisUrl.replace(/\/$/, '')}/set/${encodeURIComponent(cacheKey)}/1/ex/600`;
      fetch(upstashSet, {
        headers: { Authorization: `Bearer ${redisToken}` },
        signal: AbortSignal.timeout(1000),
      }).catch(() => {});
    } catch {}
  }

  return { isDuplicate: false, hardening_policy_version: 'HARDENING_V1' };
}
