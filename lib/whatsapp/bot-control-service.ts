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
export type BotControlScope = 'tenant' | 'conversation';
export type TenantBotStatus = 'BOT_ACTIVE' | 'BOT_DISABLED';
export type ConversationBotStatus = 'AI_ACTIVE' | 'HUMAN_HANDOVER';

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
 * Atomic State Mutation with Dual Scopes & Tight RBAC:
 *
 * 1. TENANT-LEVEL (Scope: 'tenant'):
 *    - Status model: BOT_ACTIVE / BOT_DISABLED
 *    - RBAC: Restricted exclusively to owner, admin, superuser.
 *    - Mutates:
 *      * tenants: bot_paused, is_bot_active, metadata.bot_status
 *      * conversation_sessions (tenant-wide sync)
 *      * conversations (tenant-wide sync)
 *
 * 2. CONVERSATION-LEVEL (Scope: 'conversation'):
 *    - Status model: AI_ACTIVE / HUMAN_HANDOVER
 *    - RBAC: Accessible by CS, manager, admin, owner for specific conversation.
 *    - Mutates:
 *      * conversation_sessions (for target customer phone using tenant UUID)
 *      * conversations (for target conversation record)
 *
 * Verifies every return error from Supabase to prevent false success.
 */
export async function executeBotControl(params: {
  action?: BotControlAction;
  scope?: BotControlScope;
  status?: TenantBotStatus | ConversationBotStatus | string;
  tenantId: string;
  tenantSlug?: string;
  conversationId?: string;
  customerPhone?: string;
  senderPhone?: string;
  userRole?: string;
  source?: string;
  supabase?: any;
}): Promise<{
  success: boolean;
  bot_paused: boolean;
  message: string;
  scope?: BotControlScope;
  status?: string;
  error?: string;
}> {
  const { tenantId, tenantSlug, source = 'admin_command' } = params;
  const supabase = params.supabase || getSupabaseAdmin() || getSupabase();
  if (!supabase) {
    return { success: false, bot_paused: false, message: 'Supabase client unavailable', error: 'NO_SUPABASE_CLIENT' };
  }

  // 1. Determine Scope
  const scope: BotControlScope =
    params.scope ||
    (params.conversationId || params.customerPhone ? 'conversation' : 'tenant');

  // 2. RBAC Enforcement
  const role = (params.userRole || '').toLowerCase().trim();
  if (role) {
    if (scope === 'tenant') {
      const allowedTenantRoles = ['owner', 'admin', 'superuser', 'internal_admin', 'merchant_cookie'];
      if (!allowedTenantRoles.includes(role)) {
        return {
          success: false,
          bot_paused: false,
          scope: 'tenant',
          message: 'Akses ditolak: Hanya role Owner atau Admin yang diizinkan mengubah status bot tingkat tenant (Tenant-level).',
          error: 'FORBIDDEN_TENANT_ROLE',
        };
      }
    } else {
      const allowedConvRoles = ['owner', 'admin', 'cs', 'manager', 'superuser', 'internal_admin', 'merchant_cookie', 'agent'];
      if (!allowedConvRoles.includes(role)) {
        return {
          success: false,
          bot_paused: false,
          scope: 'conversation',
          message: 'Akses ditolak: Role Anda tidak memiliki izin untuk mengontrol sesi percakapan.',
          error: 'FORBIDDEN_CONVERSATION_ROLE',
        };
      }
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // 3. Resolve Tenant UUID (Single Source of Truth)
  let resolvedTenantUuid = tenantId;
  let resolvedTenantSlug = tenantSlug || tenantId;
  let tenantRow: any = null;

  try {
    const { data: tData } = await supabase
      .from('tenants')
      .select('id, slug, metadata, bot_paused, is_bot_active')
      .or(`id.eq.${tenantId},slug.eq.${tenantSlug || tenantId}`)
      .maybeSingle();

    if (tData) {
      tenantRow = tData;
      resolvedTenantUuid = tData.id;
      resolvedTenantSlug = tData.slug || resolvedTenantSlug;
    }
  } catch (err) {
    console.warn('[BotControlService] Error resolving tenant UUID:', err);
  }

  // =========================================================================
  // SCOPE A: TENANT-LEVEL MUTATION (BOT_ACTIVE / BOT_DISABLED)
  // =========================================================================
  if (scope === 'tenant') {
    const isPause =
      params.action === 'PAUSE' ||
      params.status === 'BOT_DISABLED' ||
      params.status === 'HUMAN_PAUSED';

    const tenantStatus: TenantBotStatus = isPause ? 'BOT_DISABLED' : 'BOT_ACTIVE';
    const pausedUntilIso = isPause
      ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
      : new Date(now.getTime() - 60 * 1000).toISOString();

    const meta = (tenantRow?.metadata && typeof tenantRow.metadata === 'object') ? { ...tenantRow.metadata } : {};
    meta.bot_status = tenantStatus;
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

    try {
      // 1. Update tenants table
      let tUpdateChain: any = supabase.from('tenants').update({
        bot_paused: isPause,
        is_bot_active: !isPause,
        metadata: meta,
        updated_at: nowIso,
      });

      if (typeof tUpdateChain.or === 'function') {
        tUpdateChain = tUpdateChain.or(`id.eq.${resolvedTenantUuid},slug.eq.${resolvedTenantSlug}`);
      } else if (typeof tUpdateChain.eq === 'function') {
        tUpdateChain = tUpdateChain.eq('id', resolvedTenantUuid);
      }

      const { error: tErr } = await tUpdateChain;

      if (tErr) {
        console.error('[BotControlService] Failed to update tenants table:', tErr);
        return {
          success: false,
          bot_paused: isPause,
          scope: 'tenant',
          status: tenantStatus,
          message: `Gagal memperbarui status bot toko: ${tErr.message}`,
          error: tErr.message,
        };
      }

      // 2. Synchronize conversation_sessions using valid tenant UUID
      const sessionUpdatePayload: Record<string, any> = {
        is_paused: isPause,
        current_state: isPause ? 'HUMAN_PAUSED' : 'ACTIVE',
        bot_status: isPause ? 'BOT_DISABLED' : 'BOT_ACTIVE',
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

      let sUpdateChain: any = supabase.from('conversation_sessions').update(sessionUpdatePayload);
      if (typeof sUpdateChain.or === 'function') {
        sUpdateChain = sUpdateChain.or(`tenant_id.eq.${resolvedTenantUuid},tenant_id.eq.${resolvedTenantSlug}`);
      } else if (typeof sUpdateChain.eq === 'function') {
        sUpdateChain = sUpdateChain.eq('tenant_id', resolvedTenantUuid);
      }

      const { error: sErr } = await sUpdateChain;

      if (sErr) {
        console.error('[BotControlService] Failed to update conversation_sessions for tenant:', sErr);
        return {
          success: false,
          bot_paused: isPause,
          scope: 'tenant',
          status: tenantStatus,
          message: `Gagal memperbarui sesi percakapan toko: ${sErr.message}`,
          error: sErr.message,
        };
      }

      // 3. Synchronize conversations table
      let cUpdateChain: any = supabase.from('conversations').update({
        bot_paused: isPause,
        is_bot_paused: isPause,
        is_bot_active: !isPause,
        bot_mode: isPause ? 'HUMAN_ACTIVE' : 'AI_ACTIVE',
        status: isPause ? 'HUMAN_PAUSED' : 'active',
        updated_at: nowIso,
      });

      if (typeof cUpdateChain.or === 'function') {
        cUpdateChain = cUpdateChain.or(`tenant_id.eq.${resolvedTenantUuid},tenant_slug.eq.${resolvedTenantSlug}`);
      } else if (typeof cUpdateChain.eq === 'function') {
        cUpdateChain = cUpdateChain.eq('tenant_id', resolvedTenantUuid);
      }

      const { error: cErr } = await cUpdateChain;

      if (cErr) {
        console.error('[BotControlService] Failed to update conversations table:', cErr);
        return {
          success: false,
          bot_paused: isPause,
          scope: 'tenant',
          status: tenantStatus,
          message: `Gagal memperbarui percakapan toko: ${cErr.message}`,
          error: cErr.message,
        };
      }

      const replyMsg = isPause
        ? '⏸️ *[SISTEM]* Bot AI dinonaktifkan GLOBAL (BOT_DISABLED). Semua percakapan dialihkan ke mode manual CS.'
        : '🤖 *[SISTEM]* Bot AI aktif kembali untuk SEMUA percakapan (BOT_ACTIVE).';

      return {
        success: true,
        scope: 'tenant',
        status: tenantStatus,
        bot_paused: isPause,
        message: replyMsg,
      };
    } catch (err: any) {
      console.error('[BotControlService] Error executing tenant bot control:', err);
      return {
        success: false,
        bot_paused: isPause,
        scope: 'tenant',
        status: tenantStatus,
        message: `Error executing tenant bot control: ${err.message || String(err)}`,
        error: err.message || String(err),
      };
    }
  }

  // =========================================================================
  // SCOPE B: CONVERSATION-LEVEL MUTATION (AI_ACTIVE / HUMAN_HANDOVER)
  // =========================================================================
  const isHandover =
    params.action === 'PAUSE' ||
    params.status === 'HUMAN_HANDOVER' ||
    params.status === 'HUMAN_PAUSED';

  const convStatus: ConversationBotStatus = isHandover ? 'HUMAN_HANDOVER' : 'AI_ACTIVE';
  const pausedUntilIso = isHandover
    ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    : null;

  const targetPhone = cleanCustomerPhone(params.customerPhone || params.senderPhone || '');

  try {
    // 1. Update conversation_sessions using canonical phone and resolved tenant UUID
    if (targetPhone) {
      const sessionPayload: Record<string, any> = {
        tenant_id: resolvedTenantUuid,
        session_id: `wa_${resolvedTenantUuid}_${targetPhone}`,
        channel: 'WHATSAPP',
        user_identifier: targetPhone,
        current_state: isHandover ? 'HUMAN_PAUSED' : 'ACTIVE',
        bot_status: convStatus,
        is_paused: isHandover,
        paused_at: isHandover ? nowIso : null,
        paused_by: source,
        paused_until: pausedUntilIso,
        metadata: {
          status: convStatus,
          paused_reason: isHandover ? 'CS_HANDOVER' : null,
          updated_by: source,
          updated_at: nowIso,
        },
        updated_at: nowIso,
      };

      const csTable = supabase.from('conversation_sessions');
      if (typeof csTable?.upsert === 'function') {
        const { error: sErr } = await csTable.upsert(sessionPayload, {
          onConflict: 'tenant_id,user_identifier',
        });

        if (sErr) {
          console.error('[BotControlService] Failed to upsert conversation_sessions:', sErr);
          return {
            success: false,
            scope: 'conversation',
            status: convStatus,
            bot_paused: isHandover,
            message: `Gagal memperbarui sesi percakapan: ${sErr.message}`,
            error: sErr.message,
          };
        }
      }
    }

    // 2. Update conversations table for the specific conversation
    const convTable = supabase.from('conversations');
    if (typeof convTable?.update === 'function') {
      let updateChain = convTable.update({
        bot_paused: isHandover,
        is_bot_paused: isHandover,
        is_bot_active: !isHandover,
        bot_mode: isHandover ? 'HUMAN_ACTIVE' : 'AI_ACTIVE',
        status: isHandover ? 'HUMAN_PAUSED' : 'active',
        updated_at: nowIso,
      });

      if (params.conversationId) {
        updateChain = updateChain.eq('id', params.conversationId);
      } else if (targetPhone) {
        if (typeof updateChain?.or === 'function') {
          updateChain = updateChain.or(`tenant_id.eq.${resolvedTenantUuid},tenant_slug.eq.${resolvedTenantSlug}`);
        }
        if (typeof updateChain?.eq === 'function') {
          updateChain = updateChain.eq('customer_phone', targetPhone);
        }
      } else {
        if (typeof updateChain?.or === 'function') {
          updateChain = updateChain.or(`tenant_id.eq.${resolvedTenantUuid},tenant_slug.eq.${resolvedTenantSlug}`);
        }
      }

      const { error: cErr } = await updateChain;
      if (cErr) {
        console.error('[BotControlService] Failed to update conversation:', cErr);
        return {
          success: false,
          scope: 'conversation',
          status: convStatus,
          bot_paused: isHandover,
          message: `Gagal memperbarui percakapan: ${cErr.message}`,
          error: cErr.message,
        };
      }
    }

    return {
      success: true,
      scope: 'conversation',
      status: convStatus,
      bot_paused: isHandover,
      message: isHandover
        ? '⏸️ Percakapan dialihkan ke CS (HUMAN_HANDOVER). Bot AI dijeda selama 24 jam.'
        : '🤖 Percakapan diaktifkan kembali untuk Bot AI (AI_ACTIVE).',
    };
  } catch (err: any) {
    console.error('[BotControlService] Error executing conversation bot control:', err);
    return {
      success: false,
      scope: 'conversation',
      status: convStatus,
      bot_paused: isHandover,
      message: `Error executing conversation bot control: ${err.message || String(err)}`,
      error: err.message || String(err),
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
      const nowTime = Date.now();
      const supabase = params.supabase || getSupabaseAdmin() || getSupabase();

      // Helper: Auto-resume session di database conversation_sessions
      const autoResumeSession = async (resumeReason: string) => {
        console.info(`[BotControlService] Auto-resuming session ${session.session_id || 'unknown'} (${resumeReason})`);
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
          } catch (updateErr) {
            console.warn('[BotControlService] Failed to auto-resume session record:', updateErr);
          }
        }
      };

      // KONDISI 1: paused_until bernilai null atau undefined
      if (!session.paused_until) {
        const pausedBy = String(session.paused_by || session.metadata?.paused_by || '').toLowerCase().trim();
        const isExplicitOwnerPause =
          pausedBy === 'owner' ||
          pausedBy === 'admin' ||
          pausedBy === 'owner_inbound_chat' ||
          pausedBy === 'admin_from_me' ||
          pausedBy === 'admin_command' ||
          session.metadata?.explicit_owner === true;

        // Jika bukan pause eksplisit oleh owner (misal auto-trigger, cs mobile takeover, atau dangling null state):
        // Lakukan AUTO-RECONCILE langsung agar sesi tidak stuck selamanya di SESSION_PAUSED
        if (!isExplicitOwnerPause) {
          console.info(
            `[BotControlService] Auto-reconciling non-owner pause with null paused_until for session ${session.session_id} (paused_by: '${pausedBy || 'none'}')`
          );
          await autoResumeSession('AUTO_RECONCILE_NON_OWNER_PAUSE');
          return { shouldBypass: false, reason: 'AUTO_RESUMED_EXPIRED' };
        }

        // Jika merupakan pause eksplisit oleh owner tanpa batasan waktu: terapkan fallback expiry 30 menit
        const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 menit fallback
        const pauseStartTime = session.paused_at
          ? new Date(session.paused_at).getTime()
          : session.updated_at
          ? new Date(session.updated_at).getTime()
          : 0;

        const hasTimeoutExpired = pauseStartTime === 0 || nowTime - pauseStartTime >= DEFAULT_TIMEOUT_MS;

        if (hasTimeoutExpired) {
          console.info(
            `[BotControlService] Default 30m timeout expired for explicit owner pause: session ${session.session_id}`
          );
          await autoResumeSession('AUTO_RESUMED_EXPIRED_DEFAULT_30M');
          return { shouldBypass: false, reason: 'AUTO_RESUMED_EXPIRED' };
        }

        // Masih dalam jendela timeout 30 menit: set paused_until konkret di database agar tidak undefined
        const fallbackPausedUntil = new Date(pauseStartTime + DEFAULT_TIMEOUT_MS).toISOString();
        if (supabase && session.session_id) {
          try {
            await supabase
              .from('conversation_sessions')
              .update({
                paused_until: fallbackPausedUntil,
                updated_at: new Date().toISOString(),
              })
              .eq('session_id', session.session_id);
          } catch (_) {}
        }

        return { shouldBypass: true, reason: 'SESSION_PAUSED' };
      }

      // KONDISI 2: paused_until bernilai valid/string
      const parsedUntil = new Date(session.paused_until);
      const isInvalidDate = isNaN(parsedUntil.getTime());

      // RULE 3: AUTO-RESUME IF PAUSED_UNTIL HAS EXPIRED ATAU INVALID
      if (isInvalidDate || parsedUntil.getTime() <= nowTime) {
        console.info(`[BotControlService] Auto-resuming expired session (paused_until: ${session.paused_until})`);
        await autoResumeSession('AUTO_RESUMED_EXPIRED');
        return { shouldBypass: false, reason: 'AUTO_RESUMED_EXPIRED' };
      }

      // Still actively paused
      return { shouldBypass: true, reason: 'SESSION_PAUSED' };
    }
  }

  return { shouldBypass: false };
}
