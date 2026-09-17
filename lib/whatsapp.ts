/**
 * WhatsApp Cloud API (WABA) Client & Utility Notification Helper
 * Mendukung pengiriman session messages (free tier 1.000 sesi/bulan)
 * dan Utility Template resmi Meta: order_notification_v1.
 */

export interface OrderNotificationParams {
  phone: string;
  customerName: string;
  orderId: string;
  itemsSummary: string;
  totalAmount: number;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Normalisasi nomor WhatsApp ke standar format internasional (misal: 62812xxxx)
 */
export function normalizeWhatsAppNumber(rawNumber?: string | null): string {
  if (!rawNumber) return '';
  let clean = String(rawNumber).replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  return clean;
}

/**
 * Mendapatkan nomor WhatsApp resmi BoonTrack WABA dari konfigurasi lingkungan
 */
export function getOfficialWhatsAppNumber(): string {
  const envNumber =
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
    process.env.WHATSAPP_OFFICIAL_NUMBER ||
    process.env.WHATSAPP_PHONE_NUMBER ||
    process.env.NEXT_PUBLIC_META_BOT_NUMBER ||
    '15556769563';

  return normalizeWhatsAppNumber(envNumber) || '15556769563';
}

/**
 * Menghasilkan token verifikasi 6-karakter acak (contoh: "BT-8921")
 */
export function generateVerificationToken(): string {
  const randomDigits = Math.floor(1000 + Math.random() * 9000).toString();
  return `BT-${randomDigits}`;
}

/**
 * Kirim pesan teks sesi WhatsApp (User-Initiated 24-hour service window reply)
 * Gratis tanpa biaya template Meta dalam kuota 1.000 sesi/bulan.
 */
export async function sendWhatsAppSessionMessage(
  toPhone: string,
  textMessage: string
): Promise<WhatsAppSendResult> {
  const normalizedTo = normalizeWhatsAppNumber(toPhone);
  if (!normalizedTo) {
    return { success: false, error: 'Nomor WhatsApp penerima tidak valid' };
  }

  const phoneNumberId =
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    process.env.META_PHONE_NUMBER_ID ||
    process.env.NEXT_PUBLIC_META_BOT_NUMBER ||
    '';

  const accessToken =
    process.env.WHATSAPP_API_TOKEN ||
    process.env.META_WA_TOKEN ||
    process.env.WHATSAPP_ACCESS_TOKEN ||
    '';

  if (!phoneNumberId || !accessToken) {
    console.warn(
      `[WhatsApp Cloud API] Kredensial WABA belum lengkap (PHONE_NUMBER_ID / API_TOKEN). Simulasi pesan ke ${normalizedTo}: ${textMessage}`
    );
    return {
      success: true,
      messageId: `sim_${Date.now()}`,
    };
  }

  try {
    const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedTo,
      type: 'text',
      text: {
        preview_url: false,
        body: textMessage,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = data?.error?.message || `Meta API status ${res.status}`;
      console.error('[WhatsApp Cloud API] Session message failed:', errMsg);
      return { success: false, error: errMsg };
    }

    const messageId = data?.messages?.[0]?.id;
    return { success: true, messageId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error';
    console.error('[WhatsApp Cloud API] Exception sending session message:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Kirim Notifikasi Pesanan Lunas via Meta Utility Template resmi: order_notification_v1
 * Template language: id (Bahasa Indonesia)
 * Parameters body:
 * 1. Nama pembeli
 * 2. Order ID
 * 3. Ringkasan produk
 * 4. Total bayar (Rp ...)
 */
export async function sendOrderPaidNotification({
  phone,
  customerName,
  orderId,
  itemsSummary,
  totalAmount,
}: OrderNotificationParams): Promise<WhatsAppSendResult> {
  const normalizedTo = normalizeWhatsAppNumber(phone);
  if (!normalizedTo) {
    return { success: false, error: 'Nomor WhatsApp penerima kosong / tidak valid' };
  }

  const phoneNumberId =
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    process.env.META_PHONE_NUMBER_ID ||
    '';

  const accessToken =
    process.env.WHATSAPP_API_TOKEN ||
    process.env.META_WA_TOKEN ||
    process.env.WHATSAPP_ACCESS_TOKEN ||
    '';

  const formattedAmount = `Rp ${Number(totalAmount || 0).toLocaleString('id-ID')}`;
  const safeName = (customerName || 'Pelanggan').trim().slice(0, 50);
  const safeOrderId = String(orderId || '-').trim().slice(0, 30);
  const safeItems = String(itemsSummary || 'Produk Pesanan').trim().slice(0, 100);

  if (!phoneNumberId || !accessToken) {
    console.warn(
      `[WhatsApp Cloud API] WABA credentials belum dikonfigurasi. Simulasi utility template order_notification_v1 ke ${normalizedTo}: Order #${safeOrderId} (${formattedAmount})`
    );
    return {
      success: true,
      messageId: `sim_order_${safeOrderId}_${Date.now()}`,
    };
  }

  try {
    const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedTo,
      type: 'template',
      template: {
        name: 'order_notification_v1',
        language: {
          code: 'id',
        },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: safeName },
              { type: 'text', text: safeOrderId },
              { type: 'text', text: safeItems },
              { type: 'text', text: formattedAmount },
            ],
          },
        ],
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = data?.error?.message || `Meta API status ${res.status}`;
      console.error('[WhatsApp Cloud API] Order notification template failed:', errMsg);
      return { success: false, error: errMsg };
    }

    const messageId = data?.messages?.[0]?.id;
    return { success: true, messageId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error';
    console.error('[WhatsApp Cloud API] Exception sending order notification:', msg);
    return { success: false, error: msg };
  }
}
