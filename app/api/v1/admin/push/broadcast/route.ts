import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import webpush from 'web-push';
import { getSupabase } from '@/lib/supabaseClient';

// VAPID Configuration: environment variables with fallback default for testing/staging
const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  process.env.VAPID_PUBLIC_KEY ||
  'BC6JgUcxn2q3k7aKvdH1EkmK9yZ2XJ9x8oGqj_M5z1W3D9eKq4fL7n8mO1P2Q3R4S5T6U7V8W9X0Y1Z2A3B4C5D';
const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  'e6tJ1p9xK7_mO2qL4vD5sF8aG9jH1kZ3x8c7v6b5n4m';
const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || 'mailto:support@boontrack.com';

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (vapidErr) {
  console.warn('[WebPush] VAPID configuration note:', vapidErr);
}

export async function GET() {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 500 });
    }

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, tenant_slug, created_at, user_agent');

    const total = Array.isArray(subs) ? subs.length : 0;

    return NextResponse.json({
      success: true,
      total_subscriptions: total,
      public_key: VAPID_PUBLIC_KEY,
      subscriptions: subs || [],
      error: error?.message || null,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: true,
      total_subscriptions: 0,
      public_key: VAPID_PUBLIC_KEY,
      subscriptions: [],
      error: err.message,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title,
      message,
      body: altMessage,
      url = '/dashboard',
      target_type = 'all', // 'all' | 'tier' | 'tenant'
      target_value,
    } = body;

    const notifTitle = title?.trim() || 'Notifikasi BoonTrack';
    const notifBody = (message || altMessage || '').trim();

    if (!notifBody) {
      return NextResponse.json(
        { success: false, error: 'Pesan notifikasi tidak boleh kosong' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    let subscriptions: any[] = [];

    if (supabase) {
      try {
        let query = supabase.from('push_subscriptions').select('*');

        const isSpecificTenant =
          target_type === 'tenant' &&
          target_value &&
          target_value !== 'ALL_SHOPS' &&
          target_value !== 'all';

        if (isSpecificTenant) {
          query = query.eq('tenant_slug', target_value);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          subscriptions = data;
        }

        // Strictly isolate all general / ALL_SHOPS broadcasts to active SaaS storefront merchants
        if (!isSpecificTenant) {
          const { data: saasTenants } = await supabase
            .from('tenants')
            .select('slug, tier, status, is_active, metadata');

          if (Array.isArray(saasTenants)) {
            const validSaasSlugs = new Set(
              saasTenants
                .filter((t: any) => {
                  if (t.is_active === false || t.status === 'expired' || t.status === 'inactive') return false;
                  const meta = t.metadata || {};
                  if (meta.is_saas === true) return true;
                  if (meta.is_saas === false || meta.is_internal === true || meta.workspace_type === 'internal') return false;

                  const slug = (t.slug || '').toLowerCase();
                  const name = (t.name || '').toLowerCase();
                  if (
                    slug.includes('holding') ||
                    slug.includes('sandbox') ||
                    slug.includes('dummy') ||
                    slug.startsWith('test-') ||
                    slug.includes('demo') ||
                    slug.includes('career') ||
                    slug.includes('loker') ||
                    slug.includes('digicorn') ||
                    slug.includes('bola') ||
                    slug.includes('kurir') ||
                    slug.includes('pelayanan-publik') ||
                    name.includes('holding') ||
                    name.includes('sandbox') ||
                    name.includes('dummy') ||
                    name.includes('demo store') ||
                    name.includes('toko uji')
                  ) {
                    return false;
                  }

                  return true;
                })
                .map((t: any) => t.slug)
            );

            subscriptions = subscriptions.filter((s: any) => validSaasSlugs.has(s.tenant_slug));
          }
        }
      } catch (dbErr) {
        console.warn('[WebPush] Query push_subscriptions note:', dbErr);
      }
    }

    // Filter tier jika target_type === 'tier'
    if (target_type === 'tier' && target_value && subscriptions.length > 0 && supabase) {
      try {
        const { data: tenants } = await supabase
          .from('tenants')
          .select('slug, tier')
          .ilike('tier', `%${target_value}%`);

        const validSlugs = new Set((tenants || []).map((t: any) => t.slug));
        subscriptions = subscriptions.filter((s: any) => validSlugs.has(s.tenant_slug));
      } catch (tierErr) {
        console.warn('[WebPush] Tier filter note:', tierErr);
      }
    }

    // Payload notifikasi terstandarisasi untuk sw.js
    const payload = JSON.stringify({
      title: notifTitle,
      body: notifBody,
      icon: '/logo.png',
      badge: '/logo.png',
      url: url.startsWith('/') ? url : `/${url}`,
      timestamp: Date.now(),
      tag: `broadcast-${Date.now()}`,
    });

    let successCount = 0;
    let failureCount = 0;
    const staleSubscriptionIds: string[] = [];

    // Jika ada subscription tersimpan, dispatch via web-push
    if (subscriptions.length > 0) {
      await Promise.allSettled(
        subscriptions.map(async (sub) => {
          try {
            const pushConfig = {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh || sub.keys?.p256dh,
                auth: sub.auth || sub.keys?.auth,
              },
            };

            await webpush.sendNotification(pushConfig, payload);
            successCount++;
          } catch (err: any) {
            failureCount++;
            if (err.statusCode === 410 || err.statusCode === 404) {
              if (sub.id) staleSubscriptionIds.push(sub.id);
            }
          }
        })
      );

      // Bersihkan subscription kadaluarsa
      if (staleSubscriptionIds.length > 0 && supabase) {
        try {
          await supabase.from('push_subscriptions').delete().in('id', staleSubscriptionIds);
        } catch {
          // ignore cleanup err
        }
      }
    }

    return NextResponse.json({
      success: true,
      broadcast_id: `bcast_${Date.now()}`,
      title: notifTitle,
      message: notifBody,
      target_type,
      target_value: target_value || 'ALL',
      total_targets: subscriptions.length,
      success_count: successCount,
      failure_count: failureCount,
      timestamp: new Date().toISOString(),
      note: subscriptions.length === 0
        ? 'Siap digunakan. Belum ada subscriber aktif yang terdaftar di database push_subscriptions.'
        : `Berhasil dikirim ke ${successCount} perangkat.`,
    });
  } catch (err: any) {
    console.error('[WebPush Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal error dispatching push' },
      { status: 500 }
    );
  }
}
