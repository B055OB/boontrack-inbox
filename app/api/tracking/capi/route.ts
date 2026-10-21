import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { POST as v1CapiPost } from '@/app/api/v1/tracking/capi/route';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tracking/capi
 * Canonical bridge endpoint for client-side CAPI beacons (navigator.sendBeacon)
 * Adapts raw beacon payloads to canonical CAPI gateway format.
 */
export async function POST(req: NextRequest) {
  try {
    let rawBody: any = {};
    const text = await req.text();
    if (text) {
      try {
        rawBody = JSON.parse(text);
      } catch {
        // Handle URL encoded string if sent without JSON headers
        try {
          const params = new URLSearchParams(text);
          const obj: Record<string, any> = {};
          params.forEach((v, k) => {
            obj[k] = v;
          });
          rawBody = obj;
        } catch {}
      }
    }

    // 1. Resolve tenantSlug from body, referer, origin, or SKU prefix
    let tenantSlug = rawBody.tenantSlug || rawBody.tenant_slug;
    if (!tenantSlug) {
      const referer = req.headers.get('referer') || '';
      try {
        const url = new URL(referer);
        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts.length > 0 && !['api', 'dashboard', 'creator'].includes(pathParts[0])) {
          tenantSlug = pathParts[0];
        }
      } catch {}
    }

    const contentIds =
      rawBody.contentIds ||
      rawBody.custom_data?.content_ids ||
      rawBody.customData?.content_ids ||
      [];

    if (!tenantSlug && Array.isArray(contentIds)) {
      if (contentIds.some((id: string) => String(id).toUpperCase().startsWith('OB-'))) {
        tenantSlug = 'onlineboost';
      }
    }

    // 2. Normalize payload
    const normalizedBody = {
      tenantSlug: tenantSlug || 'onlineboost',
      eventName: rawBody.eventName || rawBody.event_name || 'InitiateCheckout',
      eventId: rawBody.eventId || rawBody.event_id || `BEACON_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      amount: rawBody.amount || rawBody.custom_data?.value || rawBody.customData?.value || 0,
      currency: rawBody.currency || rawBody.custom_data?.currency || rawBody.customData?.currency || 'IDR',
      contentIds,
      contentName: rawBody.contentName || rawBody.custom_data?.content_name || 'Storefront Beacon',
      customData: rawBody.custom_data || rawBody.customData || {},
      userAgent: req.headers.get('user-agent') || undefined,
    };

    // 3. Delegate to canonical v1 CAPI route
    const syntheticReq = new Request(req.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': req.headers.get('user-agent') || '',
        referer: req.headers.get('referer') || '',
      },
      body: JSON.stringify(normalizedBody),
    });

    return await v1CapiPost(syntheticReq as unknown as NextRequest);
  } catch (err: any) {
    console.warn('[Tracking CAPI Bridge Error]:', err?.message || err);
    return NextResponse.json({ success: false, error: err?.message || 'CAPI dispatch failed' }, { status: 500 });
  }
}
