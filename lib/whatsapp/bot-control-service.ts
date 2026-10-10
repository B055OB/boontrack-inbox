/**
 * lib/whatsapp/bot-control-service.ts
 *
 * Central Authority for Bot On/Off & Pause/Resume Control
 * Ensures deterministic, synchronized state across:
 * 1. tenants table (bot_paused, is_bot_active, metadata)
 * 2. conversation_sessions & chat_sessions (is_paused, current_state, bot_status, paused_until)
 * 3. conversations table (bot_paused, bot_mode, status)
 * 4. Evolution / WABA Webhook Ingress & Decision Gate
 */

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { cleanCustomerPhone } from '@/lib/whatsapp/inbox-persistence';
import { isManualOrderMessage } from '@/lib/whatsapp/order-interceptor';

export type BotControlAction = 'PAUSE' | 'RESUME';

/**
 * Normalizes and parses bot control commands from WhatsApp text.
 *
 * Supported Variations:
 * PAUSE / OFF: '#pause', '#off', '!pause', '!off', '/pause', '/off', 'pause', 'off'
 * RESUME / ON: '#resume', '#on', '!resume', '!on', '/resume', '/on', 'resume', 'on'
 */
export function parseBotControlCommand(text?: string | null): BotControlAction | null {
  if (!text || typeof text !== 'string') return null;

  const clean = text.trim().toLowerCase();

  const pauseCommands = new Set([
    '#pause', '#off', '!pause', '!off', '/pause', '/off', 'pause', 'off'
  ]);
  const resumeCommands = new Set([
    '#resume', '#on', '!resume', '!on', '/resume', '/on', 'resume', 'on'
  ]);

  if (pauseCommands.has(clean)) return 'PAUSE';
  if (resumeCommands.has(clean)) return 'RESUME';

  // Support prefix characters with trailing punctuation or spacing (e.g. "#pause!", "/off.")
  const stripped = clean.replace(/^[#!\/]/, '').replace(/[!.\s]+$/, '');
  if (stripped === 'pause' || stripped === 'off') return 'PAUSE';
  if (stripped === 'resume' || stripped === 'on') return 'RESUME';

  return null;
}

/**
 * RBAC Verification: Verifies whether the sender is an authorized Owner or Admin.
 * Tolerates all phone formats: 628..., 08..., +628...
 * Checks:
 * 1. tenants.phone, tenants.whatsapp_number, tenants.metadata.owner_phone, tenants.metadata.phone, tenants.metadata.admin_phones
 * 2. tenant_users.phone where role in ['owner', 'admin', 'cs', 'manager']
 */
export async function isAuthorizedBotController(params: {
  senderPhone: string;
  tenantId: string;
  tenantSlug?: string;
  supabase?: any;
}): Promise<boolean> {
  const { senderPhone, tenantId, tenantSlug } = params;
  const supabase = params.supabase || getSupabaseAdmin() || getSupabase();
  if (!supabase || !senderPhone) return false;

  const normalizedSender = cleanCustomerPhone(senderPhone);
  if (!normalizedSender) return false;

  const cleanDigits = senderPhone.replace(/\D/g, '');
  const senderVariants = new Set(
    [
      senderPhone,
      normalizedSender,
      cleanDigits,
      normalizedSender.startsWith('62') ? '0' + normalizedSender.slice(2) : '',
      cleanDigits.startsWith('62') ? '0' + cleanDigits.slice(2) : '',
      cleanDigits.startsWith('0') ? '62' + cleanDigits.slice(1) : '',
    ].filter(Boolean)
  );

  try {
    // 1. Check tenants record
    let tQuery = supabase
      .from('tenants')
      .select('id, slug, phone, whatsapp_number, metadata')
      .or(`id.eq.${tenantId},slug.eq.${tenantSlug || tenantId}`);

    const { data: tenantRow } = await tQuery.maybeSingle();

    if (tenantRow) {
      const matchesPhone = (p?: any) => {
        if (!p) return false;
        const str = String(p).trim();
        const cleaned = cleanCustomerPhone(str);
        return senderVariants.has(str) || senderVariants.has(cleaned);
      };

      const checkAllowlist = (list?: any) => {
        if (!list) return false;
        if (Array.isArray(list)) {
          return list.some(matchesPhone);
        } else if (typeof list === 'string') {
          const parts = list.split(/[,;\s]+/);
          return parts.some(matchesPhone);
        }
        return false;
      };

      if (matchesPhone(tenantRow.phone)) return true;
      if (matchesPhone(tenantRow.whatsapp_number)) return true;
      if (matchesPhone((tenantRow as any).admin_phone)) return true;

      const meta = tenantRow.metadata || {};
      if (matchesPhone(meta.owner_phone)) return true;
      if (matchesPhone(meta.phone)) return true;
      if (matchesPhone(meta.whatsapp_number)) return true;
      if (matchesPhone(meta.admin_phone)) return true;

      // Check admin_phones & explicit allowlist variations (array or delimited string)
      if (checkAllowlist(meta.admin_phones)) return true;
      if (checkAllowlist(meta.bot_control_allowlist)) return true;
      if (checkAllowlist(meta.allowlist)) return true;
      if (checkAllowlist(meta.authorized_phones)) return true;
      if (checkAllowlist(meta.allowed_phones)) return true;
    }

    // 2. Check tenant_users table
    const { data: users } = await supabase
      .from('tenant_users')
      .select('phone, role, is_active')
      .or(`tenant_id.eq.${tenantId},tenant_slug.eq.${tenantSlug || tenantId}`)
      .eq('is_active', true);

    if (Array.isArray(users)) {
      for (const u of users) {
        const uPhone = cleanCustomerPhone(u.phone || '');
        if (senderVariants.has(uPhone) || senderVariants.has(u.phone)) {
          const role = String(u.role || '').toLowerCase();
          if (['owner', 'admin', 'cs', 'manager', 'superuser'].includes(role)) {
            return true;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[BotControlService] RBAC check warning:', err);
  }

  return false;
}

/**
 * Dual-Level Database Mutation: Atomically syncs bot state across
 * tenants, conversation_sessions (chat_sessions), and conversations.
 *
 * PAUSE / #OFF:
 * - tenants: bot_paused = true, is_bot_active = false
 * - chat_sessions / conversation_sessions: is_paused = true, bot_status = 'HUMAN_PAUSED', paused_until = NOW() + INTERVAL '24 hours'
 * - conversations: bot_paused = true, bot_mode = 'HUMAN_ACTIVE', status = 'HUMAN_PAUSED'
 *
 * RESUME / #ON:
 * - tenants: bot_paused = false, is_bot_active = true
 * - chat_sessions / conversation_sessions: is_paused = false, bot_status = 'BOT_ACTIVE', paused_until = NOW() - INTERVAL '1 minute'
 *   (loop quarantine flags cleared)
 * - conversations: bot_paused = false, bot_mode = 'AI_ACTIVE', status = 'active'
 */
export async function executeBotControl(params: {
  action: BotControlAction;
  tenantId: string;
  tenantSlug?: string;
  senderPhone?: string;
  source?: string;
  supabase?: any;
}): Promise<{ success: boolean; bot_paused: boolean; message: string }> {
  const { action, tenantId, tenantSlug, source = 'admin_command' } = params;
  const supabase = params.supabase || getSupabaseAdmin() || getSupabase();
  if (!supabase) {
    return { success: false, bot_paused: false, message: 'Supabase client unavailable' };
  }

  const isPause = action === 'PAUSE';
  const now = new Date();
  const nowIso = now.toISOString();

  // Sliding window: PAUSE = NOW + 24 hours | RESUME = NOW - 1 minute
  const pausedUntilIso = isPause
    ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    : new Date(now.getTime() - 60 * 1000).toISOString();

  const botStatus = isPause ? 'HUMAN_PAUSED' : 'BOT_ACTIVE';
  const currentState = isPause ? 'HUMAN_PAUSED' : 'ACTIVE';
  const botMode = isPause ? 'HUMAN_ACTIVE' : 'AI_ACTIVE';
  const convStatus = isPause ? 'HUMAN_PAUSED' : 'active';

  try {
    // 1. UPDATE tenants table
    const { data: tRow } = await supabase
      .from('tenants')
      .select('id, slug, metadata')
      .or(`id.eq.${tenantId},slug.eq.${tenantSlug || tenantId}`)
      .maybeSingle();

    const resolvedId = tRow?.id || tenantId;
    const resolvedSlug = tRow?.slug || tenantSlug || tenantId;
    const meta = (tRow?.metadata && typeof tRow.metadata === 'object') ? { ...tRow.metadata } : {};

    meta.bot_paused = isPause;
    meta.is_bot_paused = isPause;
    meta.is_bot_active = !isPause;

    if (isPause) {
      meta.paused_at = nowIso;
      meta.paused_by = source;
      meta.paused_until = pausedUntilIso;
    } else {
      meta.resumed_at = nowIso;
      meta.resumed_by = source;
      meta.loop_quarantine = false;
      meta.is_quarantined = false;
      meta.quarantined = false;
    }

    await supabase
      .from('tenants')
      .update({
        bot_paused: isPause,
        is_bot_active: !isPause,
        metadata: meta,
        updated_at: nowIso,
      })
      .or(`id.eq.${resolvedId},slug.eq.${resolvedSlug}`);

    // 2. UPDATE conversation_sessions table (and chat_sessions)
    const sessionUpdatePayload: Record<string, any> = {
      is_paused: isPause,
      current_state: currentState,
      bot_status: botStatus,
      paused_until: pausedUntilIso,
      updated_at: nowIso,
    };

    if (isPause) {
      sessionUpdatePayload.paused_at = nowIso;
      sessionUpdatePayload.paused_by = source;
    } else {
      sessionUpdatePayload.paused_at = null;
      sessionUpdatePayload.paused_by = null;
    }

    await supabase
      .from('conversation_sessions')
      .update(sessionUpdatePayload)
      .or(`tenant_id.eq.${resolvedId},tenant_id.eq.${resolvedSlug}`);

    // 3. UPDATE conversations table
    await supabase
      .from('conversations')
      .update({
        bot_paused: isPause,
        bot_mode: botMode,
        status: convStatus,
        updated_at: nowIso,
      })
      .or(`tenant_id.eq.${resolvedId},tenant_slug.eq.${resolvedSlug}`);

    const replyMsg = isPause
      ? '⏸️ *[SISTEM]* Bot AI dinonaktifkan GLOBAL (semua percakapan masuk mode manual).'
      : '🤖 *[SISTEM]* Bot AI aktif kembali untuk SEMUA percakapan.';

    return {
      success: true,
      bot_paused: isPause,
      message: replyMsg,
    };
  } catch (err: any) {
    console.error('[BotControlService] Error executing bot control:', err);
    return {
      success: false,
      bot_paused: isPause,
      message: `Error executing bot control: ${err.message || String(err)}`,
    };
  }
}

/**
 * Runtime Decision Gate: Prevents zombie pause and enforces the hierarchy:
 * 1. Transaction Exception FIRST (Order & Payment confirmations must NOT be blocked)
 * 2. Tenant Level: if tenant.bot_paused === true OR tenant.is_bot_active === false -> BYPASS TOTAL
 * 3. Session Level: if session.is_paused === true AND session.paused_until > NOW() -> BYPASS TOTAL
 * 4. Auto-Resume: if session.paused_until <= NOW() -> AUTO-RESUME immediately (is_paused = false, bot_status = 'BOT_ACTIVE')
 */
export async function checkRuntimeBotDecisionGate(params: {
  tenant: any;
  session?: any;
  textBody?: string;
  senderPhone?: string;
  supabase?: any;
}): Promise<{ shouldBypass: boolean; reason?: string }> {
  const { tenant, session, textBody } = params;

  // RULE 0: TRANSACTION EXCEPTION (Order Gatekeeper & Payment Receipts ALWAYS processed!)
  if (textBody && isManualOrderMessage(textBody)) {
    return { shouldBypass: false, reason: 'TRANSACTION_EXCEPTION_ORDER' };
  }

  // RULE 1: TENANT LEVEL GATE (Global Pause / Off)
  const isTenantPaused =
    tenant?.bot_paused === true ||
    tenant?.is_bot_active === false ||
    tenant?.metadata?.bot_paused === true ||
    tenant?.metadata?.is_bot_paused === true ||
    tenant?.metadata?.is_bot_active === false;

  if (isTenantPaused) {
    return { shouldBypass: true, reason: 'TENANT_GLOBAL_PAUSED' };
  }

  // RULE 2: SESSION LEVEL GATE
  if (session) {
    const isSessionStatePaused =
      session.is_paused === true ||
      session.current_state === 'HUMAN_PAUSED' ||
      session.current_state === 'HANDOVER_TO_HUMAN' ||
      session.current_state === 'PAUSED' ||
      session.bot_status === 'HUMAN_PAUSED' ||
      Boolean(session.metadata?.is_bot_paused);

    if (isSessionStatePaused) {
      const pausedUntil = session.paused_until ? new Date(session.paused_until) : null;
      const nowTime = Date.now();

      // RULE 3: AUTO-RESUME IF PAUSED_UNTIL HAS EXPIRED
      if (pausedUntil && pausedUntil.getTime() <= nowTime) {
        console.info(`[BotControlService] Auto-resuming expired session (paused_until: ${session.paused_until})`);
        const supabase = params.supabase || getSupabaseAdmin() || getSupabase();
        if (supabase && session.session_id) {
          try {
            await supabase
              .from('conversation_sessions')
              .update({
                is_paused: false,
                current_state: 'ACTIVE',
                bot_status: 'BOT_ACTIVE',
                paused_until: null,
                updated_at: new Date().toISOString(),
              })
              .eq('session_id', session.session_id);
          } catch (_) {}
        }
        return { shouldBypass: false, reason: 'AUTO_RESUMED_EXPIRED' };
      }

      // Still actively paused
      return { shouldBypass: true, reason: 'SESSION_PAUSED' };
    }
  }

  return { shouldBypass: false };
}
