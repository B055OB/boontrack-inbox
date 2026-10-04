import webpush from 'web-push';

// Cryptographically valid P-256 VAPID Key pair for BoonTrack Web Push
export const DEFAULT_VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  process.env.VAPID_PUBLIC_KEY ||
  'BM10DR8pupHIP1mbBbOG1wpMX2tmO-Is-sSArcxQSl5sl8FW7MBP7Vhu--WQxMZaZfsyZsskrPK_N8oASpXZnh8';

export const DEFAULT_VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  'KXcSE1vX8SEcD0p7xCH5GQW2UR3lrcbaSeLaveBcYKk';

export const DEFAULT_VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || 'mailto:support@boontrack.com';

// Initialize webpush singleton
let isVapidInitialized = false;

export function initWebPush(): void {
  if (isVapidInitialized) return;
  try {
    webpush.setVapidDetails(
      DEFAULT_VAPID_SUBJECT,
      DEFAULT_VAPID_PUBLIC_KEY,
      DEFAULT_VAPID_PRIVATE_KEY
    );
    isVapidInitialized = true;
  } catch (err: any) {
    console.warn('[WebPush] Error setting VAPID details:', err?.message || err);
  }
}

export type PushErrorCategory =
  | 'EXPIRED_GONE'
  | 'VAPID_MISMATCH'
  | 'INVALID_PAYLOAD'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'UNKNOWN';

export interface PushErrorInfo {
  type: PushErrorCategory;
  isStale: boolean;
  statusCode?: number;
  reason: string;
  advice: string;
}

/**
 * Classifies push error to determine if it is stale (410/404),
 * VAPID mismatch (401/403), invalid payload (400), payload too large (413),
 * rate limited (429), or other network issue.
 */
export function classifyPushError(err: any): PushErrorInfo {
  const statusCode = err?.statusCode || (typeof err?.status === 'number' ? err.status : undefined);
  const bodyText = typeof err?.body === 'string' ? err.body : '';
  const message = err?.message || '';

  // 1. Subscription Expired / Gone (410, 404)
  if (
    statusCode === 410 ||
    statusCode === 404 ||
    bodyText.toLowerCase().includes('unsubscribed') ||
    bodyText.toLowerCase().includes('expired')
  ) {
    return {
      type: 'EXPIRED_GONE',
      isStale: true,
      statusCode: statusCode || 410,
      reason: `Push endpoint kadaluarsa atau user telah mencabut izin notifikasi (${statusCode === 410 ? '410 Gone' : '404 Not Found'}).`,
      advice: 'Token subscription harus dihapus dari database Supabase (auto-cleanup aktif).',
    };
  }

  // 2. VAPID Mismatch / Permission Denied (401, 403)
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    bodyText.includes('P-256') ||
    bodyText.includes('VAPID') ||
    bodyText.includes('UnauthorizedRegistration') ||
    bodyText.includes('credentials')
  ) {
    return {
      type: 'VAPID_MISMATCH',
      isStale: false,
      statusCode: statusCode || 401,
      reason: `VAPID Authentication mismatch / permission denied (${statusCode}): ${bodyText || message}`,
      advice: 'Pastikan VAPID_PUBLIC_KEY dan VAPID_PRIVATE_KEY valid dan berada di kurva P-256 yang cocok dengan subscription client.',
    };
  }

  // 3. Invalid Payload / Bad Encryption Keys (400)
  if (statusCode === 400) {
    return {
      type: 'INVALID_PAYLOAD',
      isStale: false,
      statusCode: 400,
      reason: `Payload atau kunci enkripsi p256dh/auth tidak valid (400 Bad Request): ${bodyText || message}`,
      advice: 'Periksa format enkripsi payload WebPush dan keutuhan kunci p256dh / auth.',
    };
  }

  // 4. Payload Too Large (413)
  if (statusCode === 413) {
    return {
      type: 'PAYLOAD_TOO_LARGE',
      isStale: false,
      statusCode: 413,
      reason: 'Ukuran payload Web Push melebihi batas maksimum 4KB (413 Payload Too Large).',
      advice: 'Persingkat teks judul atau pesan notifikasi agar total JSON < 4096 bytes.',
    };
  }

  // 5. Rate Limited (429)
  if (statusCode === 429) {
    return {
      type: 'RATE_LIMITED',
      isStale: false,
      statusCode: 429,
      reason: 'Rate limit FCM / push gateway terlampaui (429 Too Many Requests).',
      advice: 'Beri jeda waktu sebelum mengirim broadcast berikutnya.',
    };
  }

  return {
    type: 'UNKNOWN',
    isStale: false,
    statusCode,
    reason: `Gagal mengirim push: ${message || bodyText || 'Unknown error'}`,
    advice: 'Periksa koneksi jaringan server atau format payload.',
  };
}

/**
 * Prints comprehensive diagnostic log to console when a push notification fails.
 */
export function logPushDiagnostic(
  sub: { tenant_slug?: string; id?: string; endpoint?: string },
  err: any,
  info: PushErrorInfo
): void {
  const endpointSnippet = sub.endpoint
    ? sub.endpoint.length > 55
      ? `${sub.endpoint.slice(0, 52)}...`
      : sub.endpoint
    : '(tidak ada endpoint)';

  console.error(`
======================================================================
[WebPush Error Diagnostic]
Tenant Slug    : ${sub.tenant_slug || 'unknown'}
Sub ID         : ${sub.id || 'N/A'}
Status Code    : ${info.statusCode || 'N/A'}
Error Category : ${info.type}
Endpoint       : ${endpointSnippet}
Diagnosa       : ${info.reason}
Solusi/Tindakan: ${info.advice}
Raw Response   : ${err?.body || err?.message || 'N/A'}
======================================================================
`);
}

/**
 * Immediately deletes a stale/expired subscription (410/404) from Supabase.
 */
export async function deleteStaleSubscription(
  supabase: any,
  sub: { id?: string; endpoint?: string; tenant_slug?: string }
): Promise<boolean> {
  if (!supabase) return false;
  try {
    let query = supabase.from('push_subscriptions').delete();
    if (sub.id) {
      query = query.eq('id', sub.id);
    } else if (sub.endpoint) {
      query = query.eq('endpoint', sub.endpoint);
    } else {
      return false;
    }

    const { error } = await query;
    if (error) {
      console.error(
        `[WebPush Auto-Cleanup Error] Gagal menghapus subscription ${sub.id || sub.endpoint}:`,
        error.message
      );
      return false;
    }

    console.log(
      `[WebPush Auto-Cleanup] Berhasil menghapus token subscription basi (${sub.tenant_slug}): ${
        sub.id || sub.endpoint?.slice(0, 45)
      }...`
    );
    return true;
  } catch (cleanupErr: any) {
    console.error(
      `[WebPush Auto-Cleanup Error] Exception saat menghapus subscription:`,
      cleanupErr?.message || cleanupErr
    );
    return false;
  }
}
