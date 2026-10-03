/**
 * lib/telegram/telegram-dispatcher.ts
 * Multi-Tenant Telegram Order Alert Dispatcher
 *
 * Implements:
 * 1. Resolving tenant telegram_chat_id from database (tenants.telegram_chat_id & metadata.telegram_chat_id).
 * 2. Dispatching flexing format notification for PENDING (new_order) and PAID (payment_confirmed) orders.
 * 3. Fallback to platform superadmin (BOONPILOT_TG_SELLER_CHAT_ID) if tenant hasn't linked Telegram yet.
 */

import { sendTelegramNotification } from '@/lib/telegram/boonpilot-telegram';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export interface DispatchOrderTelegramParams {
  order: {
    id?: string | number;
    order_id?: string | number;
    invoice_no?: string | number;
    tenant_id?: string | null;
    tenant_slug?: string | null;
    tenant_name?: string | null;
    product_name?: string | null;
    product_title?: string | null;
    gross_amount?: number | string | null;
    total_amount?: number | string | null;
    amount?: number | string | null;
    payment_method?: string | null;
    customer_name?: string | null;
    buyer_name?: string | null;
    customer_phone?: string | null;
    buyer_phone?: string | null;
    ref_code?: string | null;
  };
  event: 'new_order' | 'payment_confirmed' | 'order_pending' | 'order_paid';
  supabaseClient?: any;
}

function formatRupiah(amount: number): string {
  return 'Rp' + amount.toLocaleString('id-ID');
}

function nowWib(): string {
  const d = new Date();
  // Adjust to UTC+7 (WIB)
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const wibDate = new Date(utc + 3600000 * 7);
  const day = String(wibDate.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const month = months[wibDate.getMonth()];
  const year = wibDate.getFullYear();
  const hours = String(wibDate.getHours()).padStart(2, '0');
  const minutes = String(wibDate.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${minutes} WIB`;
}

/**
 * Dispatches an order alert to the tenant's Telegram chat/group,
 * with graceful fallback to BOONPILOT_TG_SELLER_CHAT_ID.
 */
export async function dispatchOrderTelegramAlert(
  params: DispatchOrderTelegramParams
): Promise<{ dispatched: boolean; targetChatId?: string; error?: string }> {
  try {
    const { order, event, supabaseClient } = params;
    const supabase = supabaseClient || getSupabaseAdmin() || getSupabase();

    const tenantRef = (order.tenant_id || order.tenant_slug || '').trim();
    let targetChatId: string | null = null;
    let resolvedTenantName: string = order.tenant_name || '';

    // 1. Query telegram_chat_id milik tenant terkait
    if (tenantRef && supabase) {
      try {
        const { data: tenant } = await supabase
          .from('tenants')
          .select('id, name, slug, telegram_chat_id, metadata')
          .or(`id.eq.${tenantRef},slug.eq.${tenantRef}`)
          .maybeSingle();

        if (tenant) {
          if (!resolvedTenantName) {
            resolvedTenantName = tenant.name || tenant.slug || '';
          }
          targetChatId =
            tenant.telegram_chat_id ||
            tenant.metadata?.telegram_chat_id ||
            null;
        }
      } catch (err) {
        console.warn('[TELEGRAM DISPATCHER] Tenant lookup warning:', err);
      }
    }

    // 2. Fallback: Jika tenant belum menghubungkan Telegram, fallback ke superadmin
    if (!targetChatId) {
      targetChatId = process.env.BOONPILOT_TG_SELLER_CHAT_ID || null;
    }

    if (!targetChatId) {
      console.log('[TELEGRAM DISPATCHER] No target Telegram Chat ID available. Alert skipped.');
      return { dispatched: false, error: 'no_target_chat_id' };
    }

    const orderId = String(order.id || order.order_id || order.invoice_no || 'N/A');
    const storeName = resolvedTenantName || order.tenant_slug || order.tenant_id || 'BoonTrack Store';
    const productName = order.product_title || order.product_name || 'Pesanan Produk';
    const rawAmount = Number(order.gross_amount || order.total_amount || order.amount || 0);
    const formattedAmount = formatRupiah(rawAmount);
    const paymentMethod = order.payment_method || 'QRIS Dinamis (Otomatis)';
    const buyerName = order.customer_name || order.buyer_name || 'Pelanggan';
    const buyerPhone = order.customer_phone || order.buyer_phone || '';
    const buyerLine = buyerPhone ? `${buyerName} | ${buyerPhone}` : buyerName;

    let messageText = '';

    if (event === 'new_order' || event === 'order_pending') {
      messageText =
        `⚡ *PESANAN BARU MASUK!*\n` +
        `━━━━━━━━━━━━━━━\n` +
        `🏪 Toko: *${storeName}*\n` +
        `🧾 Invoice: #${orderId}\n` +
        `📦 Produk: ${productName}\n` +
        `💰 Tagihan: *${formattedAmount}*\n` +
        `💳 Metode: ${paymentMethod}\n` +
        `👤 Pembeli: ${buyerLine}\n` +
        `🕒 Waktu: ${nowWib()}\n` +
        `━━━━━━━━━━━━━━━\n` +
        `👉 *Segera siapkan pesanan!* Customer sedang menunggu konfirmasi. 🚀`;
    } else {
      // Event: payment_confirmed / order_paid
      const refLine = order.ref_code ? `🔖 Ref: ${order.ref_code}\n` : '';
      messageText =
        `🎉 *PEMBAYARAN LUNAS!*\n` +
        `━━━━━━━━━━━━━━━\n` +
        `🏪 Toko: *${storeName}*\n` +
        `🧾 Invoice: #${orderId}\n` +
        `📦 Produk: ${productName}\n` +
        `💰 Nominal Diterima: *${formattedAmount}*\n` +
        `💳 Via: ${paymentMethod}\n` +
        `👤 Pembeli: ${buyerLine}\n` +
        `${refLine}` +
        `🕒 Waktu: ${nowWib()}\n` +
        `━━━━━━━━━━━━━━━\n` +
        `✅ *Pembayaran OTOMATIS terverifikasi!*\n` +
        `🚀 Sistem sedang memproses & mengirim produk ke customer.`;
    }

    const sendRes = await sendTelegramNotification(targetChatId, messageText);
    return {
      dispatched: sendRes.ok,
      targetChatId,
      error: sendRes.error,
    };
  } catch (err: any) {
    console.error('[TELEGRAM DISPATCHER ERROR]:', err);
    return { dispatched: false, error: err.message };
  }
}
