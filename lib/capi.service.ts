import crypto from 'crypto';

export type MetaCAPIEventName = 'Lead' | 'InitiateCheckout' | 'Purchase';

export interface CAPIEventPayload {
  eventName?: MetaCAPIEventName;
  /** Deduplication Key (Order ID, Lead Token, atau unique event ID) */
  eventId?: string;
  orderId?: string;
  tenantId: string;
  grossAmount?: number;
  currency?: string;
  customerPhone?: string;
  customerName?: string;
  customerEmail?: string;
  fbc?: string | null;
  fbp?: string | null;
  /** Parameter Atribusi Click-to-WhatsApp Meta */
  ctwaClid?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  contentName?: string;
  contentIds?: string[];
  contentType?: string;
  /** Optional: Meta CAPI Test Event Code (dari Events Manager → Test Events tab) */
  testEventCode?: string;
  customData?: Record<string, any>;
}

export type PurchaseEventPayload = CAPIEventPayload;

// SHA-256 Hasher untuk normalisasi data identitas (Meta & TikTok requirement)
function hashData(value: string | undefined | null): string | null {
  if (!value || !value.trim()) return null;
  const clean = value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return crypto.createHash('sha256').update(clean).digest('hex');
}

function hashEmail(value: string | undefined | null): string | null {
  if (!value || !value.trim()) return null;
  const clean = value.trim().toLowerCase();
  return crypto.createHash('sha256').update(clean).digest('hex');
}

/**
 * Dispatch server-side event ke Meta Conversions API (CAPI)
 * Mendukung tahapan konversi terpisah: 'Lead', 'InitiateCheckout', dan 'Purchase'
 */
export async function dispatchMetaCAPIEvent(
  pixelId: string,
  accessToken: string,
  payload: CAPIEventPayload
) {
  if (!pixelId || !accessToken) return null;

  const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const resolvedEventName: MetaCAPIEventName = payload.eventName || 'Purchase';
  const resolvedEventId = payload.eventId || payload.orderId || `${resolvedEventName.toUpperCase()}_${Date.now()}`;

  // Normalisasi phone (format internasional tanpa tanda plus)
  let rawPhone = payload.customerPhone || '';
  cleanPhone: if (rawPhone) {
    let clean = rawPhone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
      rawPhone = '62' + clean.slice(1);
    } else if (clean.startsWith('8')) {
      rawPhone = '62' + clean;
    } else {
      rawPhone = clean;
    }
  }

  const customDataObj: Record<string, any> = {
    currency: payload.currency || 'IDR',
    value: payload.grossAmount !== undefined ? payload.grossAmount : 0,
    ...(payload.contentName ? { content_name: payload.contentName } : {}),
    ...(payload.contentIds && payload.contentIds.length > 0 ? { content_ids: payload.contentIds } : {}),
    ...(payload.contentType ? { content_type: payload.contentType } : {}),
    // Kirim ctwa_clid ke Meta CAPI untuk atribusi Click-to-WhatsApp
    ...(payload.ctwaClid ? { ctwa_clid: payload.ctwaClid } : {}),
    ...(payload.customData || {})
  };

  const body = {
    data: [
      {
        event_name: resolvedEventName,
        event_time: currentTimestamp,
        event_id: resolvedEventId, // DEDUPLICATION KEY
        action_source: 'website',
        user_data: {
          ph: [hashData(rawPhone)].filter(Boolean),
          em: [hashEmail(payload.customerEmail)].filter(Boolean),
          fn: [hashData(payload.customerName)].filter(Boolean),
          fbc: payload.fbc || undefined,
          fbp: payload.fbp || undefined,
          client_ip_address: payload.ipAddress || undefined,
          client_user_agent: payload.userAgent || undefined
        },
        custom_data: customDataObj
      }
    ],
    // test_event_code harus di root body (bukan di dalam data[]) — per Meta CAPI spec.
    ...(payload.testEventCode ? { test_event_code: payload.testEventCode } : {})
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (error) {
    console.error(`Meta CAPI Dispatch Error (${resolvedEventName}):`, error);
    return null;
  }
}

/** Trigger CAPI Event: Lead (saat user pertama kali memicu tombol paket / submit kontak) */
export async function dispatchMetaCAPILead(
  pixelId: string,
  accessToken: string,
  payload: Omit<CAPIEventPayload, 'eventName'>
) {
  return dispatchMetaCAPIEvent(pixelId, accessToken, {
    ...payload,
    eventName: 'Lead'
  });
}

/** Trigger CAPI Event: InitiateCheckout (saat QRIS PT atau payment link diterbitkan) */
export async function dispatchMetaCAPIInitiateCheckout(
  pixelId: string,
  accessToken: string,
  payload: Omit<CAPIEventPayload, 'eventName'>
) {
  return dispatchMetaCAPIEvent(pixelId, accessToken, {
    ...payload,
    eventName: 'InitiateCheckout'
  });
}

/** Trigger CAPI Event: Purchase (saat order terkonfirmasi PAID) */
export async function dispatchMetaCAPIPurchase(
  pixelId: string,
  accessToken: string,
  payload: Omit<CAPIEventPayload, 'eventName'>
) {
  return dispatchMetaCAPIEvent(pixelId, accessToken, {
    ...payload,
    eventName: 'Purchase'
  });
}

/** Backward-compatible alias for existing Purchase dispatches */
export const dispatchMetaCAPI = dispatchMetaCAPIPurchase;

/**
 * Resolver Entitlement: Mengecek apakah tenant berhak atas fitur Ads Tracking Pro (P3-A.6)
 */
export async function checkAdsTrackingEntitlement(supabase: any, tenantId: string): Promise<boolean> {
  try {
    // 1. Cek Tier / Plan Tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('plan, tier')
      .eq('id', tenantId)
      .maybeSingle();

    const tier = (tenant?.tier || tenant?.plan || '').toUpperCase();
    if (tier === 'CHECKOUT_LITE' || tier === 'SOLO' || tier === 'STARTER') {
      return false;
    }
    if (tier === 'PRO_SCALE' || tier === 'ADS_PERFORMANCE' || tier === 'ENTERPRISE' || tier === 'TEAM_SCALE' || tier === 'GROWTH_PRO' || tier === 'GROWTH_TRACKING' || tier === 'GROWTHPLUS' || tenantId === 'growthplus') {
      return true;
    }

    // 2. Cek Add-on Entitlement di tabel tenant_entitlements
    const { data: entitlement } = await supabase
      .from('tenant_entitlements')
      .select('is_active')
      .eq('tenant_id', tenantId)
      .eq('feature_key', 'ads_tracking_pro')
      .eq('is_active', true)
      .maybeSingle();

    return !!entitlement;
  } catch (e) {
    console.error('Entitlement check error:', e);
    return false;
  }
}