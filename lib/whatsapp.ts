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
    '6285139555449';

  return normalizeWhatsAppNumber(envNumber) || '6285139555449';
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
    '1268977686299719';

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
    '1268977686299719';

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

export interface OrderFulfillmentParams {
  phone: string;
  customerName: string;
  orderId: string;
  itemsSummary: string;
  totalAmount: number;
  productType?: 'DIGITAL' | 'PHYSICAL' | string;
  accessUrl?: string;
  downloadUrl?: string;
  instructions?: string;
  storeName?: string;
}

/**
 * WhatsApp Auto-Fulfillment Isolation (Digital vs Fisik)
 * 1. Produk Digital: Kirim ringkasan pembelian + link unduh/akses materi instan.
 * 2. Produk Fisik: Kirim konfirmasi pembayaran + status pesanan sedang disiapkan/dikemas.
 * Catatan: Kegagalan pengiriman WhatsApp (timeout / no token) tidak boleh menggugurkan status transaksi lunas (Payment Atomicity).
 */
export async function sendOrderFulfillmentNotification({
  phone,
  customerName,
  orderId,
  itemsSummary,
  totalAmount,
  productType = 'DIGITAL',
  accessUrl,
  downloadUrl,
  instructions,
  storeName = 'BoonTrack Shop',
}: OrderFulfillmentParams): Promise<WhatsAppSendResult> {
  const normalizedTo = normalizeWhatsAppNumber(phone);
  if (!normalizedTo) {
    return { success: false, error: 'Nomor WhatsApp penerima kosong / tidak valid' };
  }

  const formattedAmount = `Rp ${Number(totalAmount || 0).toLocaleString('id-ID')}`;
  const safeName = (customerName || 'Pelanggan').trim().slice(0, 50);
  const safeOrderId = String(orderId || '-').trim();
  const safeItems = String(itemsSummary || 'Produk Pesanan').trim();
  const normType = String(productType || 'DIGITAL').toUpperCase().trim();
  const isPhysical = normType === 'PHYSICAL' || normType === 'FISIK';

  const resolvedLink = accessUrl || downloadUrl || '';

  let messageText = '';
  if (isPhysical) {
    // Pesan Khusus Produk Fisik: Konfirmasi Lunas & Pengemasan
    messageText = 
`Halo ${safeName}! 📦

Kabar baik! Pembayaran untuk pesanan #${safeOrderId} sebesar ${formattedAmount} telah KAMI TERIMA (LUNAS).

🛍️ Rincian Pesanan:
• Produk: ${safeItems}
• Total Bayar: ${formattedAmount}
• Status: Sedang disiapkan & dikemas oleh tim ${storeName}.

Kami akan segera mengabarkan nomor resi pengiriman setelah paket diserahkan ke kurir ekspedisi. Terima kasih telah berbelanja!`;
  } else {
    // Pesan Khusus Produk Digital: Ringkasan & Link Akses Instan
    const linkSection = resolvedLink
      ? `\n📥 Akses / Unduh Materi Digital:\n${resolvedLink}\n`
      : `\n📥 Akses produk digital Anda telah otomatis aktif di akun Anda.\n`;
    const noteSection = instructions ? `\n💡 Catatan: ${instructions}\n` : '';

    messageText =
`Halo ${safeName}! 🎉

Terima kasih! Pembayaran untuk pesanan #${safeOrderId} sebesar ${formattedAmount} telah BERHASIL diverifikasi LUNAS.

📦 Rincian Produk:
• Produk: ${safeItems}
• Total Bayar: ${formattedAmount}
${linkSection}${noteSection}
Semoga materi/produk digital ini bermanfaat! Jika Anda butuh bantuan, balas langsung pesan ini.`;
  }

  // Coba kirim via session message atau fallback ke template resmi jika window kadaluarsa
  try {
    const sessionRes = await sendWhatsAppSessionMessage(normalizedTo, messageText);
    if (!sessionRes.success) {
      return await sendOrderPaidNotification({
        phone: normalizedTo,
        customerName: safeName,
        orderId: safeOrderId,
        itemsSummary: safeItems,
        totalAmount,
      });
    }
    return sessionRes;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error sending fulfillment notification';
    console.warn('[WhatsApp Auto-Fulfillment Warning]:', msg);
    return { success: false, error: msg };
  }
}
