import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';
import { getSupabase } from '@/lib/supabaseClient';
import { clearAllBotSessionCache } from '@/lib/bot/tenant-bot-isolation';

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function POST(req: NextRequest) {
  try {
    // ── P0 INTERNAL PURGE AUTHENTICATION GUARD ──
    // Strictly requires x-purge-secret matching INTERNAL_PURGE_SECRET (min 16 chars).
    // Zero URL parameter vectors, zero CRON_SECRET fallback, fail-closed when secret is missing.

    // 1. Reject URL query parameter vectors explicitly
    const searchParams = req.nextUrl.searchParams;
    if (
      searchParams.has('secret') ||
      searchParams.has('purge_secret') ||
      searchParams.has('x-purge-secret') ||
      searchParams.has('key') ||
      searchParams.has('token')
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: URL query parameter secret is strictly forbidden. Use x-purge-secret header.',
          code: 'UNAUTHORIZED',
        },
        { status: 401 }
      );
    }

    const purgeSecret = (process.env.INTERNAL_PURGE_SECRET || '').trim();
    const providedPurgeSecret = (req.headers.get('x-purge-secret') || '').trim();

    // 2. Fail-closed: missing, empty, short, or invalid secret
    if (
      !purgeSecret ||
      purgeSecret.length < 16 ||
      !providedPurgeSecret ||
      !constantTimeCompare(providedPurgeSecret, purgeSecret)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: Kredensial internal cache purge tidak valid atau belum dikonfigurasi.',
          code: 'UNAUTHORIZED',
        },
        { status: 401 }
      );
    }

    clearAllBotSessionCache();

    const results: Record<string, any> = {
      timestamp: new Date().toISOString(),
      bot_sessions_cleared: true,
      isr_revalidated_paths: [] as string[],
      redis_flushed: false,
      edge_purged: false,
      tenants_count: 0,
    };

    // 1. Next.js ISR Base Routes
    const basePaths = ['/', '/[tenant]'];
    for (const p of basePaths) {
      try {
        revalidatePath(p, 'page');
        revalidatePath(p, 'layout');
        results.isr_revalidated_paths.push(p);
      } catch (err: any) {
        console.warn(`[CachePurge] Failed to revalidate base path ${p}:`, err.message);
      }
    }

    // 2. Fetch all active tenants and revalidate individual tenant storefront paths
    try {
      const supabase = getSupabase();
      if (supabase) {
        const { data: tenants } = await supabase
          .from('tenants')
          .select('slug')
          .limit(1000);

        if (Array.isArray(tenants)) {
          results.tenants_count = tenants.length;
          for (const t of tenants) {
            if (t.slug) {
              const tenantPath = `/${t.slug}`;
              try {
                revalidatePath(tenantPath, 'page');
                revalidatePath(tenantPath, 'layout');
                results.isr_revalidated_paths.push(tenantPath);
              } catch {
                // Ignore individual path errors
              }
            }
          }
        }
      }
    } catch (dbErr: any) {
      console.warn('[CachePurge] Note during tenant list fetching:', dbErr.message);
    }

    // 3. Purge Upstash Redis if configured
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (redisUrl && redisToken) {
      try {
        const flushEndpoint = `${redisUrl.replace(/\/$/, '')}/flushdb`;
        const redisRes = await fetch(flushEndpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${redisToken}`,
          },
        });
        results.redis_flushed = redisRes.ok;
      } catch (redisErr: any) {
        console.warn('[CachePurge] Redis flush error:', redisErr.message);
        results.redis_error = redisErr.message;
      }
    }

    // 4. Purge Cloudflare Zone if credentials exist
    const cfZoneId = process.env.CLOUDFLARE_ZONE_ID;
    const cfApiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (cfZoneId && cfApiToken) {
      try {
        const cfRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${cfZoneId}/purge_cache`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfApiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ purge_everything: true }),
        });
        results.edge_purged = cfRes.ok;
      } catch (cfErr: any) {
        console.warn('[CachePurge] Cloudflare edge purge error:', cfErr.message);
        results.edge_error = cfErr.message;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Total cache purge executed across Edge/CDN, Redis, and Next.js ISR.',
      results,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Internal error during cache purge' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: 'Method Not Allowed: Cache purge must be invoked via POST with x-purge-secret header.',
      code: 'METHOD_NOT_ALLOWED',
    },
    { status: 405 }
  );
}
