/**
 * lib/telegram/boonpilot-telegram.ts
 * BoonPilot Telegram Bot Service & Universal Dispatcher
 *
 * Implements:
 * 1. Wake word / mention detection for groups vs private DM.
 * 2. /start & /id command handlers — returns {chat_id} for dashboard binding.
 * 3. Forwarding queries to the unified BoonPilot ConversationEngine pipeline (identical to WhatsApp).
 * 4. Outbound message formatting, chunking (4096 char limit), inline keyboard, and markdown fallback.
 * 5. sendTelegramNotification() — utility for server-side push notifications.
 * 6. Polling worker & Webhook update processor.
 */

import { isBoonPilotWakeWordTriggered } from '@/lib/boonpilot/wake-word';
import { ConversationEngine } from '@/lib/conversationEngine';
import { getPlatformBaseUrl } from '@/lib/platform-urls';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export function getTelegramBotToken(): string {
  return (
    process.env.TELEGRAM_BOT_TOKEN ||
    '8012369915:AAGSvpGSqq4R2lATfYxhHYIx_CxVgdb29VI'
  );
}

export function getTelegramBotUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME || 'boonshop_bot';
}

export interface TelegramButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface SendTelegramMessageOptions {
  replyToMessageId?: number;
  parseMode?: 'Markdown' | 'HTML';
  buttons?: TelegramButton[][];
}

/**
 * Sends a message to a Telegram chat via Telegram Bot API.
 * Includes automatic chunking for messages exceeding Telegram's 4096 character limit
 * and fallback to plain text if Markdown parsing fails.
 */
export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options: SendTelegramMessageOptions = {}
): Promise<{ ok: boolean; result?: any; error?: string }> {
  const token = getTelegramBotToken();
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const cleanText = (text || '').trim();

  if (!cleanText) {
    return { ok: false, error: 'Empty text' };
  }

  const MAX_CHUNK = 3800;
  let chunks: string[] = [];

  if (cleanText.length <= MAX_CHUNK) {
    chunks = [cleanText];
  } else {
    const lines = cleanText.split('\n');
    let currentChunk = '';
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > MAX_CHUNK) {
        chunks.push(currentChunk.trim());
        currentChunk = line + '\n';
      } else {
        currentChunk += line + '\n';
      }
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
  }

  let lastResult: any = null;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const isLast = i === chunks.length - 1;

    const payload: Record<string, any> = {
      chat_id: chatId,
      text: chunk,
    };

    if (options.parseMode) {
      payload.parse_mode = options.parseMode;
    }

    if (isLast && options.buttons && options.buttons.length > 0) {
      payload.reply_markup = {
        inline_keyboard: options.buttons,
      };
    }

    if (options.replyToMessageId && i === 0) {
      payload.reply_to_message_id = options.replyToMessageId;
    }

    try {
      let res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let data = await res.json();

      // If Markdown parse failed (400 Bad Request), retry without parse_mode
      if (!data.ok && options.parseMode) {
        delete payload.parse_mode;
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        data = await res.json();
      }

      lastResult = data;
    } catch (err: any) {
      console.error(`[TELEGRAM OUTBOUND ERROR] Chat ${chatId}:`, err);
      return { ok: false, error: err.message };
    }
  }

  return { ok: Boolean(lastResult?.ok), result: lastResult };
}

/**
 * sendTelegramNotification — Utility untuk server-side push notification ke Telegram.
 *
 * Digunakan oleh:
 * - Notifikasi transaksi order (pembayaran masuk, order baru)
 * - Notifikasi komisi afiliasi
 * - Alert trial expiring (H-1)
 * - Notifikasi sistem platform lainnya
 *
 * @param chatId  Telegram chat_id pengguna (tersimpan di metadata.telegram_chat_id)
 * @param message Pesan teks notifikasi (Markdown diperbolehkan)
 * @returns       { ok: boolean; error?: string }
 */
export async function sendTelegramNotification(
  chatId: string | number,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  if (!chatId || !message) {
    return { ok: false, error: 'chatId and message are required' };
  }
  const result = await sendTelegramMessage(chatId, message, { parseMode: 'Markdown' });
  return { ok: result.ok, error: result.error };
}

/**
 * setTelegramWebhook — Mendaftarkan URL webhook ke Telegram Bot API.
 * Digunakan saat deploy production untuk menggantikan polling.
 *
 * @param webhookUrl URL lengkap endpoint webhook (contoh: https://shop.boontrack.com/api/webhooks/telegram)
 */
export async function setTelegramWebhook(
  webhookUrl: string
): Promise<{ ok: boolean; result?: any; error?: string }> {
  const token = getTelegramBotToken();
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
      }
    );
    const data = await res.json();
    return { ok: Boolean(data.ok), result: data };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/**
 * Sends chat action (e.g. typing) to Telegram.
 */
export async function sendTelegramChatAction(
  chatId: number | string,
  action: 'typing' = 'typing'
): Promise<void> {
  const token = getTelegramBotToken();
  const url = `https://api.telegram.org/bot${token}/sendChatAction`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  } catch (e) {
    // Ignore typing errors
  }
}

export interface TelegramProcessResult {
  handled: boolean;
  reason?: string;
  chatId?: number | string;
  senderPhone?: string;
  reply?: string;
  role?: string;
  activeEngine?: string;
}

/**
 * Core Inbound Telegram Update Processor
 *
 * Evaluates wake words for group vs private chats,
 * forwards queries to ConversationEngine (same engine as WhatsApp),
 * and dispatches responses back to Telegram.
 */
export async function handleTelegramUpdate(
  update: any
): Promise<TelegramProcessResult> {
  if (!update) {
    return { handled: false, reason: 'empty_update' };
  }

  const callbackQuery = update.callback_query;
  const message = update.message || update.edited_message || callbackQuery?.message;

  if (!message) {
    return { handled: false, reason: 'no_message_in_update' };
  }

  const chatId = message.chat?.id;
  const chatType = message.chat?.type || 'private';
  const isGroup = chatType === 'group' || chatType === 'supergroup';

  const fromUser = callbackQuery ? callbackQuery.from : message.from;
  const fromId = fromUser?.id || chatId;
  const rawText = (callbackQuery ? callbackQuery.data : (message.text || message.caption || '')).trim();

  if (!chatId || !rawText) {
    return { handled: false, reason: 'missing_chat_or_text' };
  }

  // ── DEEP LINKING & COMMAND HANDLERS ──────────────────────────────────────
  // 1. Deep linking handler: /start link_{tenant_id}
  const deepLinkMatch = rawText.match(/^\/start\s+link_([a-zA-Z0-9_\-]+)/i);
  if (deepLinkMatch) {
    const tenantRef = deepLinkMatch[1].trim();
    try {
      const supabase = getSupabaseAdmin() || getSupabase();
      if (supabase) {
        const { data: tenant } = await supabase
          .from('tenants')
          .select('id, name, slug, telegram_chat_id, metadata')
          .or(`id.eq.${tenantRef},slug.eq.${tenantRef}`)
          .maybeSingle();

        if (tenant) {
          const updatedMeta = {
            ...(tenant.metadata || {}),
            telegram_chat_id: String(chatId),
          };

          await supabase
            .from('tenants')
            .update({
              telegram_chat_id: String(chatId),
              metadata: updatedMeta,
            })
            .eq('id', tenant.id);

          const tenantName = tenant.name || tenant.slug || 'Toko Anda';
          const replyText =
            `🎉 *Berhasil terhubung!*\n\n` +
            `Notifikasi penjualan dan mutasi untuk toko *${tenantName}* akan dikirimkan ke chat ini secara real-time.`;

          await sendTelegramMessage(chatId, replyText, { parseMode: 'Markdown' });

          return {
            handled: true,
            chatId,
            senderPhone: String(fromId),
            reply: replyText,
            role: 'COMMAND_HANDLER',
            activeEngine: 'DEEP_LINK_TENANT_BIND',
          };
        }
      }
    } catch (dbErr) {
      console.error('[TELEGRAM DEEP LINK BIND ERROR]:', dbErr);
    }

    const errorReply = `⚠️ Toko dengan ID/Slug \`${tenantRef}\` tidak ditemukan di platform BoonTrack. Pastikan tautan sambungan valid.`;
    await sendTelegramMessage(chatId, errorReply, { parseMode: 'Markdown' });

    return {
      handled: true,
      chatId,
      senderPhone: String(fromId),
      reply: errorReply,
      role: 'COMMAND_HANDLER',
      activeEngine: 'DEEP_LINK_ERROR',
    };
  }

  // 2. Command: /id atau /myid (berlaku di chat pribadi maupun grup)
  if (/^\/(?:id|myid)(?:\s|$)/i.test(rawText)) {
    const replyText = `Chat ID ini: \`${chatId}\`.`;
    await sendTelegramMessage(chatId, replyText, { parseMode: 'Markdown' });

    return {
      handled: true,
      chatId,
      senderPhone: String(fromId),
      reply: replyText,
      role: 'COMMAND_HANDLER',
      activeEngine: 'BUILTIN_COMMAND_ID',
    };
  }

  // 3. Command: /start standar (tanpa deep linking)
  if (/^\/start(?:\s|$)/i.test(rawText)) {
    const replyText =
      `Halo! ID Telegram kamu adalah: \`${chatId}\`\n\n` +
      `Salin nomor ID di atas dan masukkan ke menu *Pengaturan Profil Toko* / *Dashboard Affiliate* untuk mengaktifkan notifikasi order dan komisi instan.`;

    await sendTelegramMessage(chatId, replyText, { parseMode: 'Markdown' });

    return {
      handled: true,
      chatId,
      senderPhone: String(fromId),
      reply: replyText,
      role: 'COMMAND_HANDLER',
      activeEngine: 'BUILTIN_COMMAND_START',
    };
  }
  // ── END COMMAND HANDLERS ──────────────────────────────────────────────────

  // 1. EVALUASI WAKE WORD / MENTION RULES:
  // - Grup: HANYA merespons jika pesan diawali/mengandung "boon", "@boon", atau "@boontrack_bot"
  // - DM Pribadi: Merespons semua pesan masuk secara normal
  const wakeWordCheck = isBoonPilotWakeWordTriggered(rawText, isGroup, 'TELEGRAM');

  if (!wakeWordCheck.triggered) {
    // Silent ignore: pesan grup tanpa kata pemicu diabaikan
    return {
      handled: false,
      reason: 'silent_ignore_group_chatter',
      chatId,
    };
  }

  const cleanMessage = wakeWordCheck.cleanText;

  // 2. Beri indikator typing ke Telegram chat
  sendTelegramChatAction(chatId, 'typing').catch(() => {});

  // 3. Teruskan ke ConversationEngine resmi BoonTrack (pipeline yang sama persis dengan WhatsApp)
  const engineResult = await ConversationEngine.process({
    tenant_id: 'boon', // Official BoonPilot platform tenant
    channel: 'TELEGRAM',
    session_id: String(chatId),
    user_identifier: String(fromId),
    message: cleanMessage,
    channel_type: 'TELEGRAM',
  });

  const replyText = engineResult.reply || 'Halo! Saya BoonPilot, ada yang bisa saya bantu?';

  // 4. Susun quick actions / tombol inline jika ada
  let buttons: TelegramButton[][] | undefined;
  if (engineResult.quick_actions && engineResult.quick_actions.length > 0) {
    buttons = engineResult.quick_actions.map((qa) => [
      {
        text: qa,
        callback_data: qa,
      },
    ]);
  }

  // 5. Kirim balasan ke chat Telegram
  await sendTelegramMessage(chatId, replyText, {
    replyToMessageId: isGroup ? message.message_id : undefined,
    parseMode: 'Markdown',
    buttons,
  });

  return {
    handled: true,
    chatId,
    senderPhone: String(fromId),
    reply: replyText,
    role: engineResult.entities?.role,
    activeEngine: engineResult.active_engine,
  };
}

/**
 * Initializes and runs long polling for Telegram Bot.
 * Used by standalone script or dev runner.
 */
export async function startTelegramPolling(signal?: AbortSignal): Promise<void> {
  const token = getTelegramBotToken();
  console.log(`[BOONPILOT TELEGRAM] Starting polling worker with token prefix: ${token.slice(0, 10)}...`);

  // 1. Verify bot credentials
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meData = await meRes.json();
    if (!meData.ok) {
      throw new Error(`getMe failed: ${JSON.stringify(meData)}`);
    }
    console.log(`[BOONPILOT TELEGRAM] Verified bot: @${meData.result.username} (ID: ${meData.result.id})`);
  } catch (err: any) {
    console.error('[BOONPILOT TELEGRAM] Bot credential check failed:', err.message);
    throw err;
  }

  // 2. Clear webhook if any so getUpdates succeeds
  try {
    await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`);
    console.log('[BOONPILOT TELEGRAM] Cleared active webhook to enable polling mode.');
  } catch (err: any) {
    console.warn('[BOONPILOT TELEGRAM] Note deleting webhook:', err.message);
  }

  let offset = 0;

  while (!signal?.aborted) {
    try {
      const pollUrl = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=25`;
      const res = await fetch(pollUrl);
      const data = await res.json();

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          try {
            await handleTelegramUpdate(update);
          } catch (updateErr) {
            console.error('[BOONPILOT TELEGRAM] Error processing update:', updateErr);
          }
        }
      } else if (!data.ok) {
        console.warn('[BOONPILOT TELEGRAM] getUpdates response not ok:', data);
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (pollErr: any) {
      if (signal?.aborted) break;
      console.error('[BOONPILOT TELEGRAM] Polling connection error:', pollErr.message);
      await new Promise((r) => setTimeout(r, 4000));
    }
  }

  console.log('[BOONPILOT TELEGRAM] Polling worker stopped.');
}
