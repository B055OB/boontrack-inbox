import crypto from 'crypto';

interface PurchaseEventPayload {
  orderId: string;
  tenantId: string;
  grossAmount: number;
  currency?: string;
  customerPhone?: string;
  customerName?: string;
  fbc?: string | null;
  fbp?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}

// SHA-256 Hasher untuk normalisasi data identitas (Meta & TikTok requirement)
function hashData(value: string | undefined | null): string | null {
  if (!value || !value.trim()) return null;
  const clean = value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return crypto.createHash('sha256').update(clean).digest('hex');
}

/**
 * Dispatch server-side purchase event ke Meta Conversions API (CAPI)
 */
export async function dispatchMetaCAPI(
  pixelId: string,
  accessToken: string,
  payload: PurchaseEventPayload
) {
  if (!pixelId || !accessToken) return null;

  const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`;
  const currentTimestamp = Math.floor(Date.now() / 1000);

  // Normalisasi phone (format internasional tanpa tanda plus)
  let rawPhone = payload.customerPhone || '';
  if (rawPhone.startsWith('0')) {
    rawPhone = '62' + rawPhone.slice(1);
  }

  const body = {
    data: [
      {
        event_name: 'Purchase',
        event_time: currentTimestamp,
        event_id: payload.orderId, // DEDUPLICATION KEY
        action_source: 'website',
        user_data: {
          ph: [hashData(rawPhone)].filter(Boolean),
          fn: [hashData(payload.customerName)].filter(Boolean),
          fbc: payload.fbc || undefined,
          fbp: payload.fbp || undefined,
          client_ip_address: payload.ipAddress || undefined,
          client_user_agent: payload.userAgent || undefined
        },
        custom_data: {
          currency: payload.currency || 'IDR',
          value: payload.grossAmount
        }
      }
    ]
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (error) {
    console.error('Meta CAPI Dispatch Error:', error);
    return null;
  }
}

/**
 * Resolver Entitlement: Mengecek apakah tenant berhak atas fitur Ads Tracking Pro (P3-A.6)
 */
export async function checkAdsTrackingEntitlement(supabase: any, tenantId: string): Promise<boolean> {
  try {
    // 1. Cek Plan Tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('plan')
      .eq('id', tenantId)
      .maybeSingle();

    if (tenant?.plan === 'pro_scale' || tenant?.plan === 'growth_pro') {
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