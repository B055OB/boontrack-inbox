import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      subscription,
      tenant_slug,
      tenantSlug,
      origin: clientOrigin,
    } = body;

    const targetSlug = (tenant_slug || tenantSlug || '').trim().toLowerCase();
    if (!targetSlug) {
      return NextResponse.json(
        { success: false, error: 'tenant_slug is required' },
        { status: 400 }
      );
    }

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json(
        { success: false, error: 'Valid push subscription with endpoint is required' },
        { status: 400 }
      );
    }

    const host = req.headers.get('host') || '';
    const userAgent = req.headers.get('user-agent') || '';
    const origin =
      clientOrigin ||
      (host.includes('dashboard.boontrack.com')
        ? 'https://dashboard.boontrack.com'
        : `https://${host}`);

    const p256dh = subscription.keys?.p256dh || '';
    const auth = subscription.keys?.auth || '';

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database client unavailable' },
        { status: 500 }
      );
    }

    // Upsert subscription into push_subscriptions table
    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          tenant_slug: targetSlug,
          endpoint: subscription.endpoint,
          p256dh,
          auth,
          keys: subscription.keys || {},
          origin,
          user_agent: userAgent,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      )
      .select('id, tenant_slug, origin, created_at')
      .single();

    if (error) {
      console.warn('[PushSubscribe] Upsert error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Push subscription successfully bound to dashboard.boontrack.com',
      data,
    });
  } catch (err: any) {
    console.error('[PushSubscribe] Unexpected error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const vapidPublicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    process.env.VAPID_PUBLIC_KEY ||
    'BC6JgUcxn2q3k7aKvdH1EkmK9yZ2XJ9x8oGqj_M5z1W3D9eKq4fL7n8mO1P2Q3R4S5T6U7V8W9X0Y1Z2A3B4C5D';

  return NextResponse.json({
    success: true,
    public_key: vapidPublicKey,
    origin: 'https://dashboard.boontrack.com',
  });
}
