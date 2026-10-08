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
import {
  resolveCommunityContext,
  processBoonPilotPlatformChat,
  BoonPilotCommunityContext,
} from '@/lib/boonpilot/platform-engine';
import { ConversationEngine } from '@/lib/conversationEngine';
import { getPlatformBaseUrl } from '@/lib/platform-urls';
import { getSupabaseAdmin, getSupabase, isValidUuid } from '@/lib/supabaseClient';
import { resolveChannelBinding, hasCapability, buildGranularReferralUrl } from '@/lib/channels';
import {
  formatToTelegramHtml,
  formatToTelegramMarkdown,
} from '@/lib/formatting/universal-chat-formatter';

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
  disableWebPagePreview?: boolean;
}

/**
 * Sends a message to a Telegram chat via Telegram Bot API.
 * Includes automatic chunking for messages exceeding Telegram's 4096 character limit,
 * universal markdown conversion, explicit parse_mode, and graceful fallback to plain text.
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

  // Universal Outbound Formatter: Always include parse_mode ('HTML' or 'Markdown')
  const resolvedParseMode: 'HTML' | 'Markdown' = options.parseMode || 'HTML';
  const formattedText = resolvedParseMode === 'HTML'
    ? formatToTelegramHtml(cleanText)
    : formatToTelegramMarkdown(cleanText);

  const MAX_CHUNK = 3800;
  let chunks: string[] = [];

  if (formattedText.length <= MAX_CHUNK) {
    chunks = [formattedText];
  } else {
    const lines = formattedText.split('\n');
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
      parse_mode: resolvedParseMode,
      disable_web_page_preview:
        options.disableWebPagePreview !== undefined ? options.disableWebPagePreview : true,
    };

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

      // If HTML / Markdown parse failed (400 Bad Request), retry without parse_mode and clean HTML tags
      if (!data.ok && payload.parse_mode) {
        delete payload.parse_mode;
        payload.text = chunk.replace(/<[^>]+>/g, '');
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

// ── §42.5 GROUP RATE LIMIT STORAGE (In-Memory Sliding Window) ─────────────
const groupRateLimitMap = new Map<string, number>();

/**
 * Checks if a member in a group is rate-limited (max 1 trigger per 30s per member per group).
 */
export function isGroupRateLimited(chatId: string | number, fromId: string | number): boolean {
  if (process.env.NODE_ENV === 'test') return false;
  const key = `${chatId}:${fromId}`;
  const now = Date.now();
  const lastTime = groupRateLimitMap.get(key) || 0;
  return now - lastTime < 30000;
}

/**
 * Records a successful trigger timestamp for rate limiting.
 */
export function recordGroupTrigger(chatId: string | number, fromId: string | number): void {
  const key = `${chatId}:${fromId}`;
  groupRateLimitMap.set(key, Date.now());
  if (groupRateLimitMap.size > 2000) {
    const cutoff = Date.now() - 60000;
    for (const [k, timestamp] of groupRateLimitMap.entries()) {
      if (timestamp < cutoff) groupRateLimitMap.delete(k);
    }
  }
}

/**
 * Resets group rate limits (useful for testing).
 */
export function _resetGroupRateLimits(): void {
  groupRateLimitMap.clear();
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

export interface GenerateAffiliateSalesAiOptions {
  userQuestion: string;
  senderName?: string;
  affiliateId: string;
  partnerName: string;
  demoUrl: string;
  registerUrl: string;
  channelName?: string;
  repliedToText?: string;
}

/**
 * Generate conversational AI sales representative response for affiliate community groups
 * Powered by unified BoonPilot Platform Engine (identical to WhatsApp).
 */
export async function generateAffiliateSalesAiReply(
  opts: GenerateAffiliateSalesAiOptions
): Promise<string> {
  const commCtx: BoonPilotCommunityContext = {
    demo_store_url: opts.demoUrl,
    registration_url: opts.registerUrl,
    affiliate_id: opts.affiliateId,
    channel_name: opts.channelName,
  };

  const result = await processBoonPilotPlatformChat({
    senderPhone: opts.senderName || 'KomunitasMember',
    message: opts.userQuestion,
    sessionId: opts.affiliateId || 'comm_pool',
    channel_type: 'TELEGRAM',
    communityContext: commCtx,
  });

  return result.reply;
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
        let tenantQuery = supabase
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

  // 2. Command: /id atau /myid (berlaku di chat pribadi maupun grup, dengan atau tanpa @botname)
  if (/^\/(?:id|myid)(?:@[a-zA-Z0-9_\-]+)?(?:\s|$)/i.test(rawText)) {
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

  // 3. Command: /help (berlaku di chat pribadi maupun grup, dengan atau tanpa @botname)
  if (/^\/help(?:@[a-zA-Z0-9_\-]+)?(?:\s|$)/i.test(rawText)) {
    const replyText =
      `🤖 *BoonTrack Assistant*\n\n` +
      `• Mention bot atau reply pesan bot untuk bertanya seputar BoonTrack & integrasi checkout WhatsApp.\n` +
      `• Gunakan \`/id\` untuk melihat ID chat ini.`;
    await sendTelegramMessage(chatId, replyText, { parseMode: 'Markdown' });

    return {
      handled: true,
      chatId,
      senderPhone: String(fromId),
      reply: replyText,
      role: 'COMMAND_HANDLER',
      activeEngine: 'BUILTIN_COMMAND_HELP',
    };
  }

  // 4. Command: /start standar (tanpa deep linking)
  if (/^\/start(?:@[a-zA-Z0-9_\-]+)?(?:\s|$)/i.test(rawText)) {
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

  // 1. EVALUASI AWAL OBROLAN GRUP (Fast-path Silent Ignore):
  // Di grup atau supergroup, bot HANYA membalas jika pesan diawali command (misal /id, /help)
  // atau bot di-mention/di-reply secara eksplisit. Jangan kirim template sapaan default pada pesan obrolan umum.
  const botUsername = getTelegramBotUsername().toLowerCase();
  const isReplyToBot = Boolean(
    message.reply_to_message &&
    (message.reply_to_message.from?.is_bot ||
      message.reply_to_message.from?.username?.toLowerCase() === botUsername ||
      message.reply_to_message.from?.username?.toLowerCase() === 'boonshop_bot' ||
      message.reply_to_message.from?.username?.toLowerCase() === 'boontrack_bot')
  );

  const isDirectBotMention =
    new RegExp(`@(?:${botUsername}|boonshop_bot|boontrack_bot)\\b`, 'i').test(rawText) ||
    isReplyToBot;

  const isBoonTrigger =
    isDirectBotMention ||
    /(?:^|\s)@boon\b/i.test(rawText) ||
    /^\s*boon\b/i.test(rawText) ||
    isBoonPilotWakeWordTriggered(rawText, true, 'TELEGRAM').triggered;

  const SYSTEM_MENTIONS = new Set([
    'boon',
    'boontrack',
    'boontrack_bot',
    'boonshop_bot',
    'admin',
    'channel',
    'everyone',
    'here',
  ]);
  const mentionMatches = [...rawText.matchAll(/(?:^|\s)@([a-zA-Z0-9_\-]+)/g)];
  const candidateSlugs = mentionMatches
    .map((m) => m[1].toLowerCase())
    .filter((s) => !SYSTEM_MENTIONS.has(s));

  if (isGroup) {
    if (!isBoonTrigger && !isReplyToBot && candidateSlugs.length === 0) {
      return {
        handled: false,
        reason: 'silent_ignore_group_chatter',
        chatId,
      };
    }
  }

  // ── §42.5 BOT ID VALIDATION & GROUP ISOLATION ────────────────────────────
  const supabase = getSupabaseAdmin() || getSupabase();
  let matchedTenant: any = null;
  let affiliateCommunityBinding: any = null;

  if (supabase) {
    try {
      const { data: t } = await supabase
        .from('tenants')
        .select('id, name, slug, phone, telegram_chat_id, metadata')
        .eq('telegram_chat_id', String(chatId))
        .maybeSingle();
      matchedTenant = t;
    } catch (err) {
      console.warn('[TELEGRAM] Tenant lookup warning:', err);
    }
  }

  if (isGroup && supabase) {
    try {
      const { data: acb } = await supabase
        .from('channel_bindings')
        .select('*')
        .eq('channel_type', 'telegram')
        .eq('community_source_id', String(chatId))
        .eq('is_active', true)
        .maybeSingle();

      if (
        acb &&
        (acb.context === 'AFFILIATE_CONTEXT' ||
          (Array.isArray(acb.capabilities) && acb.capabilities.includes('referral_acquisition')))
      ) {
        affiliateCommunityBinding = acb;
      }
    } catch (dbErr) {
      console.warn('[TELEGRAM] Affiliate community binding lookup warning:', dbErr);
    }

    // §42.5 — Bot ID Validation:
    // Drop jika chat_id tidak terdaftar di tenants maupun kolam affiliate di channel_bindings,
    // KECUALI jika bot secara eksplisit di-mention (@boonshop_bot / @boontrack_bot) atau reply ke bot untuk melayani tanya jawab platform.
    const isDirectBotMention =
      /@(?:boonshop_bot|boontrack_bot)\b/i.test(rawText) ||
      isReplyToBot;

    if (!matchedTenant && !affiliateCommunityBinding && !isDirectBotMention && process.env.NODE_ENV !== 'test') {
      return {
        handled: false,
        reason: 'unregistered_group_chat_dropped',
        chatId,
      };
    }
  }

  if (isGroup && isGroupRateLimited(chatId, fromId)) {
    return { handled: false, reason: 'group_rate_limited', chatId };
  }

  // FITUR CEK ID INSTAN TELEGRAM (@boon id)
  const tTextTrim = rawText.trim().toLowerCase();
  if (tTextTrim === '@boon id' || tTextTrim.startsWith('@boon id')) {
    const idReply = `🆔 *ID Grup Telegram Ini:*\n\`${chatId}\`\n\nSalin ID di atas untuk dimasukkan ke dashboard affiliate.`;
    await sendTelegramMessage(chatId, idReply, { parseMode: 'Markdown', disableWebPagePreview: true });
    return {
      handled: true,
      chatId,
      senderPhone: String(fromId),
      reply: idReply,
      role: 'COMMAND_HANDLER',
      activeEngine: 'BUILTIN_COMMAND_ID',
    };
  }

  // ── AFFILIATE COMMUNITY POOL ROUTE (BoonPilot Intelligent Conversation Engine) ──
  // Jika pesan berasal dari grup komunitas kolam affiliate (AFFILIATE_CONTEXT):
  // Alirkan ke BoonPilot Platform Engine resmi (sama persis dengan WhatsApp)
  // BUKAN template sales kaku!
  if (isGroup && affiliateCommunityBinding) {
    sendTelegramChatAction(chatId, 'typing').catch(() => {});

    const commCtx = await resolveCommunityContext(String(chatId), supabase);
    let demoUrl = affiliateCommunityBinding.demo_url || commCtx.demo_store_url;
    if (!demoUrl || demoUrl.includes('toko-demo')) {
      demoUrl = commCtx.demo_store_url;
    }
    const registerUrl = commCtx.registration_url;

    // Bersihkan token mention dari pertanyaan pengguna
    const wakeCheck = isBoonPilotWakeWordTriggered(rawText, true, 'TELEGRAM');
    let cleanPrompt = wakeCheck.cleanText || rawText;
    cleanPrompt = cleanPrompt
      .replace(/@boonshop_bot\b/gi, '')
      .replace(/@boontrack_bot\b/gi, '')
      .replace(/@boon\b/gi, '')
      .trim();

    // Teruskan ke BoonPilot Platform Engine yang terpadu (sama persis dengan WhatsApp)
    const platformResult = await processBoonPilotPlatformChat(
      {
        senderPhone: String(fromId),
        message: cleanPrompt,
        sessionId: String(chatId),
        channel_type: 'TELEGRAM',
        community_source_id: String(chatId),
        communityContext: commCtx,
      },
      supabase
    );

    const aiReply = platformResult.reply;

    // HANYA sematkan tombol demo/link jika pengguna secara eksplisit memintanya
    const isExplicitLinkRequested = /(link demo|lihat demo|contoh toko|minta link|kirim link|daftar akun|link daftar|cara daftar|coba demo)/i.test(cleanPrompt);
    let promoButtons: TelegramButton[][] | undefined;
    if (isExplicitLinkRequested) {
      promoButtons = [
        [{ text: '🛍️ Lihat Demo Toko', url: demoUrl }],
        [{ text: '🚀 Daftar Akun Resmi', url: registerUrl }],
      ];
    }

    await sendTelegramMessage(chatId, aiReply, {
      replyToMessageId: message.message_id,
      parseMode: 'HTML',
      buttons: promoButtons,
      disableWebPagePreview: true,
    });

    recordGroupTrigger(chatId, fromId);
    return {
      handled: true,
      chatId,
      senderPhone: String(fromId),
      reply: aiReply,
      role: platformResult.role || 'GUEST',
      activeEngine: platformResult.activeEngine,
    };
  }

  // ── §42.4 DUAL-TRIGGER PROTOCOL (STORE TENANT GROUPS) ─────────────────────
  if (isGroup) {
    // ── TRIGGER 1: @boon (Referral / Affiliate Engine) ──
    const isBotUsernameMention = /@(?:boonshop_bot|boontrack_bot)\b/i.test(rawText);
    const boonMatch = !isBotUsernameMention && rawText.match(/(?:^|\s)@boon\b(?:\s+([a-zA-Z0-9_\-]+))?/i);
    if (boonMatch) {

      const targetSlug = (boonMatch[1] || matchedTenant?.slug || '').trim().toLowerCase();
      if (!targetSlug) {
        const hintText = 'ℹ️ Tentukan nama toko yang ingin dipromosikan, contoh: `@boon nama_toko`';
        await sendTelegramMessage(chatId, hintText, {
          replyToMessageId: message.message_id,
          parseMode: 'Markdown',
        });
        recordGroupTrigger(chatId, fromId);
        return { handled: true, chatId, reply: hintText, activeEngine: 'DUAL_TRIGGER_AFFILIATE' };
      }

      // Query database secara dinamis (Zero Hardcoding Policy)
      let targetTenant: any = null;
      if (supabase) {
        try {
          const { data } = await supabase
            .from('tenants')
            .select('id, name, slug, metadata')
            .ilike('slug', targetSlug)
            .maybeSingle();
          targetTenant = data;
        } catch (dbErr) {
          console.warn('[TELEGRAM] Target tenant lookup error:', dbErr);
        }
      }

      if (!targetTenant) {
        const notFoundText = `⚠️ Toko dengan slug \`${targetSlug}\` tidak ditemukan di platform BoonTrack.`;
        await sendTelegramMessage(chatId, notFoundText, {
          replyToMessageId: message.message_id,
          parseMode: 'Markdown',
        });
        recordGroupTrigger(chatId, fromId);
        return { handled: true, chatId, reply: notFoundText, activeEngine: 'DUAL_TRIGGER_AFFILIATE' };
      }

      // Ambil kode referral personal pengirim jika ada di tabel affiliates
      let referralCode = fromUser?.username || `tg_${fromId}`;
      if (supabase) {
        try {
          const { data: aff } = await supabase
            .from('affiliates')
            .select('referral_code')
            .or(`referral_code.eq.${fromUser?.username || 'NONE'},metadata->>telegram_user_id.eq.${fromId}`)
            .maybeSingle();
          if (aff?.referral_code) referralCode = aff.referral_code;
        } catch {}
      }

      // §43.1 & §43.2 Context-Capability Check: AFFILIATE_CONTEXT
      const affiliateBinding = resolveChannelBinding({
        channel_type: 'telegram',
        external_identifier: String(chatId),
        context: 'AFFILIATE_CONTEXT',
        community_source_id: isGroup ? String(chatId) : null,
        tenant_id: targetTenant.id,
        tenant_slug: targetTenant.slug,
        metadata: targetTenant.metadata,
      });

      if (!hasCapability(affiliateBinding, 'referral_acquisition')) {
        return { handled: false, reason: 'lacks_referral_acquisition_capability', chatId };
      }

      const storeName = targetTenant.name || targetTenant.slug;
      // §43.3 Granular Attribution Engine: ?ref={affiliate_id}&src={community_source_id}
      const affiliateUrl = buildGranularReferralUrl({
        slug: targetTenant.slug,
        affiliateId: referralCode,
        communitySourceId: affiliateBinding.community_source_id,
      });
      const commissionText = targetTenant.metadata?.affiliate_commission
        ? `💰 *Komisi:* ${targetTenant.metadata.affiliate_commission}\n`
        : '';

      const replyText =
        `🔗 *TAUTAN AFILIASI PERSONAL*\n` +
        `━━━━━━━━━━━━━━━\n` +
        `🏪 Toko: *${storeName}*\n` +
        `${commissionText}` +
        `👉 Salin dan bagikan link personal Anda untuk memperoleh komisi:\n` +
        `\`${affiliateUrl}\`\n` +
        `━━━━━━━━━━━━━━━\n` +
        `_Setiap pembelian terkonfirmasi otomatis tercatat ke komisi afiliasi Anda._`;

      const buttons: TelegramButton[][] = [
        [{ text: `🛒 Buka Toko (${storeName})`, url: affiliateUrl }],
      ];

      await sendTelegramMessage(chatId, replyText, {
        replyToMessageId: message.message_id,
        parseMode: 'Markdown',
        buttons,
      });

      recordGroupTrigger(chatId, fromId);
      return {
        handled: true,
        chatId,
        senderPhone: String(fromId),
        reply: replyText,
        role: 'AFFILIATE_ENGINE',
        activeEngine: 'DUAL_TRIGGER_AFFILIATE',
      };
    }

    // ── TRIGGER 2: @{slug} (Etalase Interaktif Toko) ──
    const mentionMatches = [...rawText.matchAll(/(?:^|\s)@([a-zA-Z0-9_\-]+)/g)];
    const SYSTEM_MENTIONS = new Set([
      'boon',
      'boontrack',
      'boontrack_bot',
      'boonshop_bot',
      'admin',
      'channel',
      'everyone',
      'here',
    ]);
    const candidateSlugs = mentionMatches
      .map((m) => m[1].toLowerCase())
      .filter((s) => !SYSTEM_MENTIONS.has(s));

    if (candidateSlugs.length > 0 && supabase) {
      for (const candSlug of candidateSlugs) {
        let showcaseTenant: any = null;
        try {
          const { data } = await supabase
            .from('tenants')
            .select('id, name, slug, metadata')
            .eq('slug', candSlug)
            .maybeSingle();
          showcaseTenant = data;
        } catch {}

        if (showcaseTenant) {
          if (isGroupRateLimited(chatId, fromId)) {
            return { handled: false, reason: 'group_rate_limited', chatId };
          }

          // §43.1 & §43.2 Context-Capability Check: STORE_CONTEXT
          const storeBinding = resolveChannelBinding({
            channel_type: 'telegram',
            external_identifier: String(chatId),
            context: 'STORE_CONTEXT',
            community_source_id: isGroup ? String(chatId) : null,
            tenant_id: showcaseTenant.id,
            tenant_slug: showcaseTenant.slug,
            metadata: showcaseTenant.metadata,
          });

          if (!hasCapability(storeBinding, 'catalog')) {
            continue;
          }

          const rawProducts = Array.isArray(showcaseTenant.metadata?.products)
            ? showcaseTenant.metadata.products
            : [];
          const activeProducts = rawProducts
            .filter((p: any) => p && p.is_active !== false)
            .slice(0, 3);

          let productListText = '';
          if (activeProducts.length > 0) {
            productListText = activeProducts
              .map((p: any, idx: number) => {
                const title = p.name || p.title || 'Produk';
                const price = Number(p.price || 0);
                const priceStr = price > 0 ? ` — Rp${price.toLocaleString('id-ID')}` : '';
                return `${idx + 1}. *${title}*${priceStr}`;
              })
              .join('\n');
          } else {
            productListText = '_Belum ada produk aktif di etalase ini._';
          }

          const showcaseName = showcaseTenant.name || showcaseTenant.slug;
          const storefrontUrl = `https://shop.boontrack.com/${showcaseTenant.slug}`;

          const replyText =
            `🏪 *ETALASE RESMI: ${showcaseName}*\n` +
            `━━━━━━━━━━━━━━━\n` +
            `📦 *Produk Pilihan:*\n${productListText}\n` +
            `━━━━━━━━━━━━━━━\n` +
            `👉 Buka toko online untuk katalog lengkap & pemesanan instan.`;

          const buttons: TelegramButton[][] = [
            [
              { text: '🛒 Buka Toko', url: storefrontUrl },
              { text: '📦 Lihat Produk', url: `${storefrontUrl}#products` },
            ],
          ];

          await sendTelegramMessage(chatId, replyText, {
            replyToMessageId: message.message_id,
            parseMode: 'Markdown',
            buttons,
          });

          recordGroupTrigger(chatId, fromId);
          return {
            handled: true,
            chatId,
            senderPhone: String(fromId),
            reply: replyText,
            role: 'SHOWCASE_ENGINE',
            activeEngine: 'DUAL_TRIGGER_SHOWCASE',
          };
        }
      }
    }

    // Jika pesan menyebut @user lain di grup dan bukan mention bot atau reply ke bot: silent ignore
    if (!isBoonTrigger && !isReplyToBot) {
      return {
        handled: false,
        reason: 'silent_ignore_group_chatter',
        chatId,
      };
    }
  }

  // 1. EVALUASI WAKE WORD / MENTION RULES:
  // - Grup: HANYA merespons jika bot di-mention/di-reply secara eksplisit atau ada wake word pemicu
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

  if (isGroup && isGroupRateLimited(chatId, fromId)) {
    return {
      handled: false,
      reason: 'group_rate_limited',
      chatId,
    };
  }

  const cleanMessage = wakeWordCheck.cleanText;

  // 2. Beri indikator typing ke Telegram chat
  sendTelegramChatAction(chatId, 'typing').catch(() => {});

  const senderIdentifier =
    matchedTenant?.phone ||
    (matchedTenant?.metadata as any)?.phone ||
    (matchedTenant?.metadata as any)?.whatsapp_number ||
    String(fromId);

  // 3. Teruskan ke ConversationEngine resmi BoonTrack (pipeline yang sama persis dengan WhatsApp)
  const isGeneralGreeting = /^(?:halo|hai|hi|hello|p|ping|selamat\s+(?:pagi|siang|sore|malam)|assalamu\w*|tes|test)[,.\s!]*$/i.test(cleanMessage);

  const engineResult = await ConversationEngine.process({
    tenant_id: isGroup ? 'boon' : (matchedTenant?.id || 'boon'), // Di grup, gunakan BoonPilot platform engine agar tidak kirim greeting toko ritel
    channel: 'TELEGRAM',
    session_id: String(chatId),
    user_identifier: senderIdentifier,
    message: cleanMessage,
    channel_type: 'TELEGRAM',
  });

  let replyText = engineResult.reply || 'Halo! Saya BoonPilot, ada yang bisa saya bantu?';

  // Di grup: Jangan kirim template sapaan default toko pada pesan obrolan umum
  if (isGroup) {
    if (isGeneralGreeting || replyText.includes('Selamat datang di') || engineResult.active_engine === 'SALES_REP_V1') {
      replyText = `Halo kak, bantu jawab ya! Ada yang bisa BoonPilot bantu seputar toko, order, atau integrasi platform? 😊`;
    }
  }

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
    parseMode: 'HTML',
    buttons,
    disableWebPagePreview: true,
  });

  if (isGroup) {
    recordGroupTrigger(chatId, fromId);
  }

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
