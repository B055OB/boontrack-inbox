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
import { getSupabaseAdmin, getSupabase, isValidUuid } from '@/lib/supabaseClient';
import { resolveChannelBinding, hasCapability } from '@/lib/channels';

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
 * Mask buyer name according to §42.3:
 * Format: "{NamaDepan} {HurufAwalBelakang}****". Contoh: "Siti Rahayu" -> "Siti R****"
 */
export function maskBuyerName(name: string): string {
  const clean = (name || '').trim();
  if (!clean) return 'Pelanggan';
  const parts = clean.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].length <= 2 ? `${parts[0]}****` : `${parts[0].slice(0, 2)}****`;
  }
  const firstName = parts[0];
  const secondInitial = parts[1][0] || '';
  return `${firstName} ${secondInitial}****`;
}

/**
 * Dispatches an order alert to the tenant's Telegram chat/group,
 * with graceful fallback to BOONPILOT_TG_SELLER_CHAT_ID.
 * Strictly enforces §42.2 and §42.3 privacy filtering and masking for group chats.
 */
export async function dispatchOrderTelegramAlert(
  params: DispatchOrderTelegramParams
): Promise<{ dispatched: boolean; targetChatId?: string; error?: string }> {
  try {
    const { order, event, supabaseClient } = params;
    const supabase = supabaseClient || getSupabaseAdmin() || getSupabase();

    const tenantRef = (order.tenant_id || order.tenant_slug || '').trim();
    let tenantData: any = null;
    let targetChatId: string | null = null;
    let resolvedTenantName: string = order.tenant_name || '';

    // 1. Query telegram_chat_id milik tenant terkait
    if (tenantRef && supabase) {
      try {
        let tenantQuery: any = supabase
          .from('tenants')
          .select('id, name, slug, telegram_chat_id, metadata');

        if (isValidUuid(tenantRef)) {
          tenantQuery = tenantQuery.or(`id.eq.${tenantRef},slug.eq.${tenantRef}`);
        } else if (typeof tenantQuery.ilike === 'function') {
          tenantQuery = tenantQuery.ilike('slug', tenantRef);
        } else {
          tenantQuery = tenantQuery.eq('slug', tenantRef.toLowerCase());
        }

        const { data: tenant } = await tenantQuery.maybeSingle();

        if (tenant) {
          tenantData = tenant;
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

    const isGroup = String(targetChatId).startsWith('-');

    // 3. §42.2 & §42.3 — Fail-Safe Privacy Defaults & Configuration
    const DEFAULT_GROUP_CONFIG = {
      notify_new_order: false,
      notify_paid: true,
      show_product_name: true,
      show_price: false,
      mask_buyer_name: true,
      hide_buyer_contact: true,
    };

    const groupConfig = {
      ...DEFAULT_GROUP_CONFIG,
      ...(tenantData?.metadata?.telegram_group_config || {}),
    };

    // 4. §43.1 & §43.2 — Context-Capability Binding Resolution
    const channelBinding = resolveChannelBinding({
      channel_type: 'telegram',
      external_identifier: String(targetChatId),
      context: 'STORE_CONTEXT',
      community_source_id: isGroup ? String(targetChatId) : null,
      tenant_id: tenantData?.id,
      tenant_slug: tenantData?.slug || order.tenant_slug,
      metadata: tenantData?.metadata,
      group_config: isGroup ? groupConfig : undefined,
    });

    // Evaluate Capability Policy (No hardcoded group-type branching)
    if (event === 'new_order' || event === 'order_pending') {
      if (!hasCapability(channelBinding, 'order_notification')) {
        console.log('[TELEGRAM DISPATCHER] Channel binding lacks order_notification capability (§43.1). Skipped.');
        return { dispatched: false, targetChatId, error: 'skipped_by_group_config' };
      }
    } else if (event === 'payment_confirmed' || event === 'order_paid') {
      if (!hasCapability(channelBinding, 'payment_notification')) {
        console.log('[TELEGRAM DISPATCHER] Channel binding lacks payment_notification capability (§43.1). Skipped.');
        return { dispatched: false, targetChatId, error: 'skipped_by_group_config' };
      }
    }

    const orderId = String(order.id || order.order_id || order.invoice_no || 'N/A');
    const storeName = resolvedTenantName || order.tenant_slug || order.tenant_id || 'BoonTrack Store';
    const productName = order.product_title || order.product_name || 'Pesanan Produk';
    const rawAmount = Number(order.gross_amount || order.total_amount || order.amount || 0);
    const formattedAmount = formatRupiah(rawAmount);
    const paymentMethod = order.payment_method || 'QRIS Dinamis (Otomatis)';
    const buyerName = order.customer_name || order.buyer_name || 'Pelanggan';
    const buyerPhone = order.customer_phone || order.buyer_phone || '';

    // Masking & privacy controls
    let buyerDisplay = buyerName;
    if (isGroup) {
      if (groupConfig.mask_buyer_name) {
        buyerDisplay = maskBuyerName(buyerName);
      }
      if (!groupConfig.hide_buyer_contact && buyerPhone) {
        buyerDisplay = `${buyerDisplay} | ${buyerPhone}`;
      }
    } else {
      buyerDisplay = buyerPhone ? `${buyerName} | ${buyerPhone}` : buyerName;
    }

    const showProduct = !isGroup || groupConfig.show_product_name;
    const showPrice = !isGroup || groupConfig.show_price;

    let messageText = '';

    if (event === 'new_order' || event === 'order_pending') {
      messageText =
        `⚡ *PESANAN BARU MASUK!*\n` +
        `━━━━━━━━━━━━━━━\n` +
        `🏪 Toko: *${storeName}*\n` +
        `🧾 Invoice: #${orderId}\n` +
        (showProduct ? `📦 Produk: ${productName}\n` : '') +
        (showPrice ? `💰 Tagihan: *${formattedAmount}*\n` : '') +
        `💳 Metode: ${paymentMethod}\n` +
        `👤 Pembeli: ${buyerDisplay}\n` +
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
        (showProduct ? `📦 Produk: ${productName}\n` : '') +
        (showPrice ? `💰 Nominal Diterima: *${formattedAmount}*\n` : '') +
        `💳 Via: ${paymentMethod}\n` +
        `👤 Pembeli: ${buyerDisplay}\n` +
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
