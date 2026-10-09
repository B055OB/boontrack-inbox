import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabaseClient';
import { clearAllBotSessionCache } from '@/lib/bot/tenant-bot-isolation';

export async function POST(req: NextRequest) {
  try {
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

export async function GET(req: NextRequest) {
  return POST(req);
}
