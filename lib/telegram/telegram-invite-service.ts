/**
 * lib/telegram/telegram-invite-service.ts
 * Dynamic Telegram Invite Link Generator for OnlineBoost Batch 1
 *
 * Implements:
 * 1. Generating single-use, time-limited invite link via Telegram Bot API (createChatInviteLink).
 *    - member_limit: 1
 *    - expire_date: +86400 seconds (24 hours)
 * 2. Resolving target supergroup chat ID dynamically from channel_bindings or env.
 * 3. Fallback to default admin approval link (https://t.me/+WZ6alwTIjjExODc1) on rate-limit or API errors.
 */

export interface GenerateTelegramInviteLinkParams {
  tenantSlug?: string | null;
  tenantId?: string | null;
  orderId: string | number;
  productTitle?: string | null;
  defaultFallbackUrl?: string;
  supabaseClient?: any;
}

export const ONLINEBOOST_DEFAULT_TELEGRAM_LINK = 'https://t.me/+WZ6alwTIjjExODc1';
export const ONLINEBOOST_DEFAULT_SUPERGROUP_ID = '-1004371114362';

export async function generateTelegramInviteLink(
  params: GenerateTelegramInviteLinkParams
): Promise<string> {
  const fallbackUrl = params.defaultFallbackUrl || ONLINEBOOST_DEFAULT_TELEGRAM_LINK;
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!botToken) {
    console.warn('[Telegram Invite Service] TELEGRAM_BOT_TOKEN not configured. Using fallback URL:', fallbackUrl);
    return fallbackUrl;
  }

  // Resolve target group / supergroup chat ID
  let targetChatId = process.env.ONLINEBOOST_TELEGRAM_GROUP_ID?.trim();
  if (!targetChatId && params.supabaseClient) {
    try {
      const { data: binding } = await params.supabaseClient
        .from('channel_bindings')
        .select('community_source_id')
        .eq('channel_type', 'telegram')
        .or('tenant_slug.eq.onlineboost,tenant_id.eq.e12acd29-6c18-487b-ade7-5422878c1c36')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (binding?.community_source_id) {
        targetChatId = String(binding.community_source_id).trim();
      }
    } catch (err) {
      console.warn('[Telegram Invite Service] Error resolving supergroup from channel_bindings:', err);
    }
  }

  if (!targetChatId) {
    targetChatId = ONLINEBOOST_DEFAULT_SUPERGROUP_ID;
  }

  try {
    const expireDate = Math.floor(Date.now() / 1000) + 86400; // +86400 detik (24 jam)
    const linkName = `Batch 1 - ${String(params.orderId).slice(-12)}`;

    const response = await fetch(`https://api.telegram.org/bot${botToken}/createChatInviteLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        name: linkName,
        expire_date: expireDate,
        member_limit: 1,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok && data?.ok && data?.result?.invite_link) {
      const generatedLink = String(data.result.invite_link);
      console.log(
        `[Telegram Invite Service] Generated 1-time invite link for order #${params.orderId} (chat_id: ${targetChatId}): ${generatedLink}`
      );
      return generatedLink;
    }

    console.warn(
      `[Telegram Invite Service] Telegram API createChatInviteLink rejected (status ${response.status}, error: ${data?.description || 'unknown'}). Falling back to: ${fallbackUrl}`
    );
    return fallbackUrl;
  } catch (err) {
    console.warn(
      `[Telegram Invite Service] Network exception calling createChatInviteLink (falling back to default):`,
      err
    );
    return fallbackUrl;
  }
}
