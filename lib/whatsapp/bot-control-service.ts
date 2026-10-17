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
export type BotControlScope = 'tenant' | 'conversation' | 'CONTACT' | 'TENANT';

export type BotControlCommand = {
  action: 'PAUSE' | 'RESUME';
  scope: 'CONTACT' | 'TENANT';
  durationMinutes?: number;
};
export type TenantBotStatus = 'BOT_ENABLED' | 'BOT_DISABLED' | 'BOT_ACTIVE';
export type ConversationBotStatus = 'AI_ACTIVE' | 'HUMAN_HANDOVER' | 'HUMAN_PAUSED';

export interface RuntimeSessionState {
  tenantId: string;
  userIdentifier?: string; // customerPhone or undefined for tenant global
  isPaused: boolean;
  botStatus: string;
  pausedUntil: string | null;
  pausedBy: string | null;
  updatedAt: number; // timestamp in ms
  version: number;   // monotonic sequence for optimistic concurrency
}

// In-Memory Runtime Session State Cache (Map of key -> RuntimeSessionState)
const runtimeSessionCache = new Map<string, RuntimeSessionState>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL

export function buildSessionCacheKey(tenantId: string, phone?: string): string {
  const cleanTenant = String(tenantId || '').trim().toLowerCase();
  const cleanP = phone ? cleanCustomerPhone(phone) : 'global';
  return `${cleanTenant}:${cleanP || 'global'}`;
}

export function getRuntimeSessionCache(tenantId: string, phone?: string): RuntimeSessionState | null {
  const key = buildSessionCacheKey(tenantId, phone);
  const entry = runtimeSessionCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > CACHE_TTL_MS) {
    runtimeSessionCache.delete(key);
    return null;
  }
  return entry;
}

export function setRuntimeSessionCache(state: {
  tenantId: string;
  userIdentifier?: string;
  isPaused: boolean;
  botStatus?: string;
  pausedUntil?: string | null;
  pausedBy?: string | null;
  updatedAt?: number;
}): RuntimeSessionState {
  const key = buildSessionCacheKey(state.tenantId, state.userIdentifier);
  const existing = runtimeSessionCache.get(key);
  const currentVersion = existing ? existing.version + 1 : 1;
  const newState: RuntimeSessionState = {
    tenantId: state.tenantId,
    userIdentifier: state.userIdentifier,
    isPaused: state.isPaused,
    botStatus: state.botStatus || (state.isPaused ? 'HUMAN_HANDOVER' : 'BOT_ENABLED'),
    pausedUntil: state.pausedUntil || null,
    pausedBy: state.pausedBy || null,
    updatedAt: state.updatedAt || Date.now(),
    version: currentVersion,
  };
  runtimeSessionCache.set(key, newState);
  return newState;
}

export function clearRuntimeSessionCache(tenantId?: string, phone?: string): void {
  if (tenantId) {
    if (phone) {
      const key = buildSessionCacheKey(tenantId, phone);
      runtimeSessionCache.delete(key);
    } else {
      const cleanTenant = String(tenantId).trim().toLowerCase();
      const prefix = `${cleanTenant}:`;
      for (const key of runtimeSessionCache.keys()) {
        if (key.startsWith(prefix)) {
          runtimeSessionCache.delete(key);
        }
      }
    }
  } else {
    runtimeSessionCache.clear();
  }
}

/**
 * Attempt to invoke atomic Supabase RPC (fn_toggle_bot_session_state).
 * Manages edge cases of concurrency between incoming messages and manual owner control.
 */
export async function callAtomicBotControlRpc(params: {
  action: BotControlAction;
  scope: BotControlScope;
  tenantId: string;
  tenantSlug?: string;
  customerPhone?: string;
  senderPhone?: string;
  source: string;
  pausedUntilIso?: string | null;
  supabase: any;
}): Promise<{ rpcExecuted: boolean; data?: any; error?: any }> {
  const { action, scope, tenantId, tenantSlug, customerPhone, source, pausedUntilIso, supabase } = params;
  if (!supabase || typeof supabase.rpc !== 'function') {
    return { rpcExecuted: false };
  }

  const isPause = action === 'PAUSE';
  const targetPhone = customerPhone ? cleanCustomerPhone(customerPhone) : null;

  try {
    const rpcPayload = {
      p_tenant_id: tenantSlug || tenantId,
      p_scope: scope,
      p_action: action,
      p_is_paused: isPause,
      p_customer_phone: targetPhone,
      p_source: source,
      p_paused_until: pausedUntilIso || null,
    };

    const { data, error } = await supabase.rpc('fn_toggle_bot_session_state', rpcPayload);
    if (!error && data?.success !== false) {
      return { rpcExecuted: true, data };
    }

    const errCode = (error as any)?.code || '';
    const errMsg = String((error as any)?.message || '');
    if (errCode === 'PGRST202' || errCode === '42883' || errMsg.includes('does not exist') || errMsg.includes('not found')) {
      return { rpcExecuted: false };
    }

    console.warn('[BotControlService] Atomic RPC call warning (falling back to direct transaction):', error || data);
    return { rpcExecuted: false, error: error || data };
  } catch (rpcErr) {
    return { rpcExecuted: false, error: rpcErr };
  }
}

/**
 * Normalizes and parses bot control commands from WhatsApp text.
 *
 * Deterministic Scope Separation:
 * 1. TENANT Scope (#on, #off): Globally toggles bot for all conversations.
 *    - PAUSE / OFF: '#off', '!off', '/off', 'off' -> BOT_DISABLED
 *    - RESUME / ON: '#on', '!on', '/on', 'on' -> BOT_ENABLED
 * 2. CONTACT Scope (#pause, #resume): Handover or resume for specific contact conversation.
 *    - PAUSE: '#pause', '!pause', '/pause', 'pause' -> HUMAN_HANDOVER (with timer)
 *    - RESUME: '#resume', '!resume', '/resume', 'resume' -> AI_ACTIVE
 */
export function parseBotControlCommand(text?: string | null): BotControlCommand | null {
  if (!text || typeof text !== 'string') return null;

  const clean = text.trim().toLowerCase();

  // Support #pause with duration (e.g., "#pause 30", "!pause 15", "/pause 60", "pause 45")
  const pauseDurationMatch = clean.match(/^[#/!]?pause\s+(\d+)(?:\s*(?:m|mnt|menit|min|minutes?))?[!.\s]*$/i);
  if (pauseDurationMatch) {
    const mins = parseInt(pauseDurationMatch[1], 10);
    if (!isNaN(mins) && mins > 0) {
      return { action: 'PAUSE', scope: 'CONTACT', durationMinutes: mins };
    }
  }

  // Tenant Scope Commands (#off, #on with prefixes #, !, / or plain)
  const tenantPause = new Set(['#off', '!off', '/off', 'off']);
  const tenantResume = new Set(['#on', '!on', '/on', 'on']);

  // Contact Scope Commands (#pause, #resume with prefixes #, !, / or plain)
  const contactPause = new Set(['#pause', '!pause', '/pause', 'pause']);
  const contactResume = new Set(['#resume', '!resume', '/resume', 'resume']);

  if (tenantPause.has(clean)) return { action: 'PAUSE', scope: 'TENANT' };
  if (tenantResume.has(clean)) return { action: 'RESUME', scope: 'TENANT' };
  if (contactPause.has(clean)) return { action: 'PAUSE', scope: 'CONTACT' };
  if (contactResume.has(clean)) return { action: 'RESUME', scope: 'CONTACT' };

  // Support prefix characters with trailing punctuation or spacing (e.g. "#off!", "/pause.")
  const stripped = clean.replace(/^[#/!]/, '').replace(/[!.\s]+$/, '');
  if (stripped === 'off') return { action: 'PAUSE', scope: 'TENANT' };
  if (stripped === 'on') return { action: 'RESUME', scope: 'TENANT' };
  if (stripped === 'pause') return { action: 'PAUSE', scope: 'CONTACT' };
  if (stripped === 'resume') return { action: 'RESUME', scope: 'CONTACT' };

  return null;
}

export interface BotControllerAuthResult {
  authorized: boolean;
  role: 'owner' | 'admin' | 'cs' | 'agent' | 'manager' | 'superuser' | 'none';
  canControlTenant: boolean;     // Allowed for #on, #off (owner, admin, superuser)
  canControlContact: boolean;    // Allowed for #pause, #resume, human reply (owner, admin, cs, agent, manager, superuser)
  source?: string;
}

/**
 * RBAC Scope Resolver: Resolves controller identity and permissions deterministically.
 * Tolerates all phone formats: 628..., 08..., +628...
 * Checks:
 * 1. tenants record (Owner / Primary Admin -> canControlTenant = true, canControlContact = true)
 * 2. tenant_users record (role 'owner'/'admin'/'superuser' -> canControlTenant = true, canControlContact = true;
 *                         role 'cs'/'agent'/'manager' -> canControlTenant = false, canControlContact = true)
 */
export async function resolveBotControllerRole(params: {
  senderPhone: string;
  tenantId: string;
  tenantSlug?: string;
  supabase?: any;
}): Promise<BotControllerAuthResult> {
  const { senderPhone, tenantId, tenantSlug } = params;
  const supabase = params.supabase || getSupabaseAdmin() || getSupabase();
  if (!supabase || !senderPhone) {
    return { authorized: false, role: 'none', canControlTenant: false, canControlContact: false };
  }

  const normalizedSender = cleanCustomerPhone(senderPhone);
  if (!normalizedSender) {
    return { authorized: false, role: 'none', canControlTenant: false, canControlContact: false };
  }

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
    // 1. Check tenants record (Owner / Primary Admin)
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

      if (
        matchesPhone(tenantRow.phone) ||
        matchesPhone(tenantRow.whatsapp_number) ||
        matchesPhone((tenantRow as any).admin_phone)
      ) {
        return { authorized: true, role: 'owner', canControlTenant: true, canControlContact: true, source: 'tenant_record' };
      }

      const meta = tenantRow.metadata || {};
      if (
        matchesPhone(meta.owner_phone) ||
        matchesPhone(meta.phone) ||
        matchesPhone(meta.whatsapp_number)
      ) {
        return { authorized: true, role: 'owner', canControlTenant: true, canControlContact: true, source: 'tenant_metadata_owner' };
      }

      if (matchesPhone(meta.admin_phone)) {
        return { authorized: true, role: 'admin', canControlTenant: true, canControlContact: true, source: 'tenant_metadata_admin' };
      }

      if (
        checkAllowlist(meta.admin_phones) ||
        checkAllowlist(meta.bot_control_allowlist) ||
        checkAllowlist(meta.allowlist) ||
        checkAllowlist(meta.authorized_phones) ||
        checkAllowlist(meta.allowed_phones)
      ) {
        return { authorized: true, role: 'admin', canControlTenant: true, canControlContact: true, source: 'tenant_metadata_allowlist' };
      }
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
          const rawRole = String(u.role || '').toLowerCase().trim();
          if (['owner', 'admin', 'superuser', 'internal_admin'].includes(rawRole)) {
            const role = rawRole === 'owner' ? 'owner' : rawRole === 'admin' ? 'admin' : 'superuser';
            return { authorized: true, role, canControlTenant: true, canControlContact: true, source: 'tenant_users' };
          }
          if (['cs', 'agent', 'manager'].includes(rawRole)) {
            const role = rawRole === 'cs' ? 'cs' : rawRole === 'agent' ? 'agent' : 'manager';
            return { authorized: true, role, canControlTenant: false, canControlContact: true, source: 'tenant_users' };
          }
        }
      }
    }
  } catch (err) {
    console.warn('[BotControlService] RBAC check warning:', err);
  }

  return { authorized: false, role: 'none', canControlTenant: false, canControlContact: false };
}

/**
 * RBAC Verification: Verifies whether the sender is an authorized Bot Controller.
 * Kept for backwards compatibility.
 */
export async function isAuthorizedBotController(params: {
  senderPhone: string;
  tenantId: string;
  tenantSlug?: string;
  supabase?: any;
}): Promise<boolean> {
  const auth = await resolveBotControllerRole(params);
  return auth.authorized;
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
  durationMinutes?: number;
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
  is_bot_active?: boolean;
  paused_until?: string | null;
  last_state_updated_by?: string;
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
  const rawScope =
    params.scope ||
    (params.conversationId || params.customerPhone ? 'conversation' : 'tenant');
  const isTenantScope = rawScope === 'TENANT' || rawScope === 'tenant';
  const scope: 'tenant' | 'conversation' = isTenantScope ? 'tenant' : 'conversation';

  // 2. Strict Fail-Closed RBAC Enforcement
  let role = (params.userRole || '').toLowerCase().trim();
  if (!role && params.senderPhone) {
    const authRes = await resolveBotControllerRole({
      senderPhone: params.senderPhone,
      tenantId,
      tenantSlug,
      supabase,
    });
    if (authRes.authorized) {
      role = authRes.role;
    }
  }

  // STRICT FAIL-CLOSED: Jika userRole tidak disediakan DAN senderPhone tidak dapat diresolusi menjadi role yang sah,
  // JANGAN lanjutkan eksekusi ke database. Segera tolak dengan status 'UNAUTHORIZED'.
  if (!role || role === 'none') {
    return {
      success: false,
      bot_paused: false,
      scope,
      status: scope === 'tenant' ? 'BOT_DISABLED' : 'HUMAN_HANDOVER',
      message: 'Akses ditolak: Identitas pengguna / role tidak terverifikasi (UNAUTHORIZED).',
      error: 'UNAUTHORIZED',
    };
  }

  // Audit label arbitrer: merchant_cookie HANYA sah jika berasal dari sesi dashboard resmi terverifikasi
  if (role === 'merchant_cookie') {
    const allowedMerchantSources = [
      'dashboard_toggle',
      'dashboard_master_toggle',
      'chat_detail_toggle',
      'cs_dashboard_toggle',
      'cs_chat_toggle',
    ];
    if (!allowedMerchantSources.includes(source)) {
      return {
        success: false,
        bot_paused: false,
        scope,
        status: scope === 'tenant' ? 'BOT_DISABLED' : 'HUMAN_HANDOVER',
        message: 'Akses ditolak: Label arbitrer merchant_cookie tidak valid di luar sesi dashboard resmi.',
        error: 'FORBIDDEN_INVALID_SESSION',
      };
    }
  }

  // Validasi RBAC berdasarkan scope yang diminta
  if (scope === 'tenant') {
    const allowedTenantRoles = ['owner', 'admin', 'superuser', 'internal_admin', 'merchant_cookie'];
    if (!allowedTenantRoles.includes(role)) {
      return {
        success: false,
        bot_paused: false,
        scope: 'tenant',
        status: 'BOT_DISABLED',
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
        status: 'HUMAN_HANDOVER',
        message: 'Akses ditolak: Role Anda tidak memiliki izin untuk mengontrol sesi percakapan.',
        error: 'FORBIDDEN_CONVERSATION_ROLE',
      };
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
  // ATOMIC RPC & OPTIMISTIC CONCURRENCY WIRING
  // =========================================================================
  const isPause =
    params.action === 'PAUSE' ||
    params.status === 'BOT_DISABLED' ||
    params.status === 'HUMAN_PAUSED' ||
    params.status === 'HUMAN_HANDOVER';

  let targetPhone = cleanCustomerPhone(params.customerPhone || params.senderPhone || '');
  if (!targetPhone && params.conversationId && supabase) {
    try {
      const { data: convRow } = await supabase
        .from('conversations')
        .select('customer_phone')
        .eq('id', params.conversationId)
        .maybeSingle();
      if (convRow?.customer_phone) {
        targetPhone = cleanCustomerPhone(convRow.customer_phone);
      }
    } catch (_) {}
  }
  const targetPhoneForCache = scope === 'conversation' ? targetPhone : undefined;
  const durationMins = params.durationMinutes !== undefined && params.durationMinutes !== null ? Number(params.durationMinutes) : undefined;
  const pausedUntilIso = isPause
    ? (durationMins !== undefined
        ? new Date(now.getTime() + durationMins * 60 * 1000).toISOString()
        : new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString())
    : (scope === 'tenant' ? new Date(now.getTime() - 60 * 1000).toISOString() : null);

  // Database is Single Source of Truth: Runtime cache is NOT updated optimistically here!
  // It is updated ONLY AFTER the DB mutation is successfully confirmed.

  // 2. Pemanggilan Fungsi RPC Atomik di Database Supabase
  const rpcResult = await callAtomicBotControlRpc({
    action: isPause ? 'PAUSE' : 'RESUME',
    scope,
    tenantId: resolvedTenantUuid,
    tenantSlug: resolvedTenantSlug,
    customerPhone: targetPhoneForCache,
    senderPhone: params.senderPhone,
    source,
    pausedUntilIso,
    supabase,
  });

  if (rpcResult.rpcExecuted) {
    const tenantStatus: TenantBotStatus = isPause ? 'BOT_DISABLED' : 'BOT_ENABLED';
    const convStatus: ConversationBotStatus = isPause ? 'HUMAN_HANDOVER' : 'AI_ACTIVE';

    // Update runtime cache ONLY after confirmed RPC execution
    const cachePayload = {
      tenantId: resolvedTenantUuid,
      userIdentifier: targetPhoneForCache,
      isPaused: isPause,
      botStatus: scope === 'tenant' ? tenantStatus : convStatus,
      pausedUntil: pausedUntilIso,
      pausedBy: source,
      updatedAt: now.getTime(),
    };
    setRuntimeSessionCache(cachePayload);
    if (resolvedTenantSlug && resolvedTenantSlug !== resolvedTenantUuid) {
      setRuntimeSessionCache({ ...cachePayload, tenantId: resolvedTenantSlug });
    }


    const pauseDurationLabel = durationMins !== undefined ? `${durationMins} menit` : '24 jam';
    const replyMsg = scope === 'tenant'
      ? (isPause
          ? '⏸️ *[SISTEM]* Bot AI dinonaktifkan GLOBAL (BOT_DISABLED). Semua percakapan dialihkan ke mode manual CS.'
          : '🤖 *[SISTEM]* Bot AI aktif kembali untuk SEMUA percakapan (BOT_ENABLED).')
      : (isPause
          ? `⏸️ Percakapan dialihkan ke CS (HUMAN_HANDOVER). Bot AI dijeda selama ${pauseDurationLabel}.`
          : '🤖 Percakapan diaktifkan kembali untuk Bot AI (AI_ACTIVE).');

    return {
      success: true,
      scope,
      status: scope === 'tenant' ? tenantStatus : convStatus,
      bot_paused: isPause,
      is_bot_active: !isPause,
      paused_until: pausedUntilIso,
      last_state_updated_by: source,
      message: replyMsg,
    };
  }

  // =========================================================================
  // SCOPE A: TENANT-LEVEL MUTATION (BOT_ENABLED / BOT_DISABLED)
  // =========================================================================
  if (scope === 'tenant') {
    const tenantStatus: TenantBotStatus = isPause ? 'BOT_DISABLED' : 'BOT_ENABLED';

    const meta = (tenantRow?.metadata && typeof tenantRow.metadata === 'object') ? { ...tenantRow.metadata } : {};
    meta.bot_status = tenantStatus;
    meta.bot_paused = isPause;
    meta.is_bot_paused = isPause;
    meta.is_bot_active = !isPause;
    const currentMetaVer = Number(meta.control_version ?? meta.version ?? 0);
    meta.control_version = currentMetaVer + 1;
    meta.version = currentMetaVer + 1;

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
        clearRuntimeSessionCache(resolvedTenantUuid, targetPhoneForCache);
        return {
          success: false,
          bot_paused: isPause,
          scope: 'tenant',
          status: tenantStatus,
          message: `Gagal memperbarui status bot toko: ${tErr.message}`,
          error: tErr.message,
        };
      }

      // 2. Synchronize conversation_sessions & conversations ONLY WHEN PAUSING TENANT (#off)
      // ARCHITECTURAL INVARIANT (2-Dimensional Hierarchy Decoupling):
      // When resuming at tenant level (#on / RESUME), NEVER reset is_paused or paused_until
      // at conversation level! Individual conversations that were paused by CS operators (#pause or handover)
      // must retain their own pause state so CS handovers are never disrupted.
      if (isPause) {
        const sessionUpdatePayload: Record<string, any> = {
          is_paused: true,
          current_state: 'HUMAN_PAUSED',
          bot_status: 'BOT_DISABLED',
          paused_until: pausedUntilIso,
          paused_at: nowIso,
          paused_by: source,
          updated_at: nowIso,
        };

        let sUpdateChain: any = supabase.from('conversation_sessions').update(sessionUpdatePayload);
        if (typeof sUpdateChain.or === 'function') {
          sUpdateChain = sUpdateChain.or(`tenant_id.eq.${resolvedTenantUuid},tenant_id.eq.${resolvedTenantSlug}`);
        } else if (typeof sUpdateChain.eq === 'function') {
          sUpdateChain = sUpdateChain.eq('tenant_id', resolvedTenantUuid);
        }

        const { error: sErr } = await sUpdateChain;

        if (sErr) {
          console.error('[BotControlService] Failed to update conversation_sessions for tenant:', sErr);
          clearRuntimeSessionCache(resolvedTenantUuid, targetPhoneForCache);
          return {
            success: false,
            bot_paused: isPause,
            scope: 'tenant',
            status: tenantStatus,
            message: `Gagal memperbarui sesi percakapan toko: ${sErr.message}`,
            error: sErr.message,
          };
        }

        // 3. Synchronize conversations table (atomik bot_paused dan is_paused)
        let cUpdateChain: any = supabase.from('conversations').update({
          bot_paused: true,
          is_paused: true,
          is_bot_paused: true,
          is_bot_active: false,
          paused_until: pausedUntilIso,
          last_state_updated_by: source,
          bot_mode: 'HUMAN_ACTIVE',
          status: 'HUMAN_PAUSED',
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
          clearRuntimeSessionCache(resolvedTenantUuid, targetPhoneForCache);
          return {
            success: false,
            bot_paused: isPause,
            scope: 'tenant',
            status: tenantStatus,
            message: `Gagal memperbarui percakapan toko: ${cErr.message}`,
            error: cErr.message,
          };
        }
      }

      // Update runtime cache ONLY after confirmed DB updates
      const cachePayload = {
        tenantId: resolvedTenantUuid,
        userIdentifier: undefined,
        isPaused: isPause,
        botStatus: tenantStatus,
        pausedUntil: pausedUntilIso,
        pausedBy: source,
        updatedAt: now.getTime(),
      };
      setRuntimeSessionCache(cachePayload);
      if (resolvedTenantSlug && resolvedTenantSlug !== resolvedTenantUuid) {
        setRuntimeSessionCache({ ...cachePayload, tenantId: resolvedTenantSlug });
      }

      const replyMsg = isPause
        ? '⏸️ *[SISTEM]* Bot AI dinonaktifkan GLOBAL (BOT_DISABLED). Semua percakapan dialihkan ke mode manual CS.'
        : '🤖 *[SISTEM]* Bot AI aktif kembali untuk SEMUA percakapan (BOT_ENABLED).';

      return {
        success: true,
        scope: 'tenant',
        status: tenantStatus,
        bot_paused: isPause,
        is_bot_active: !isPause,
        paused_until: pausedUntilIso,
        last_state_updated_by: source,
        message: replyMsg,
      };
    } catch (err: any) {
      console.error('[BotControlService] Error executing tenant bot control:', err);
      clearRuntimeSessionCache(resolvedTenantUuid, targetPhoneForCache);
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
  const isHandover = isPause;
  const convStatus: ConversationBotStatus = isHandover ? 'HUMAN_HANDOVER' : 'AI_ACTIVE';

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
          control_version: (getRuntimeSessionCache(resolvedTenantUuid, targetPhone)?.version || 1),
          version: (getRuntimeSessionCache(resolvedTenantUuid, targetPhone)?.version || 1),
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
          clearRuntimeSessionCache(resolvedTenantUuid, targetPhoneForCache);
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

    // 2. Update conversations table for the specific conversation (atomik bot_paused, is_paused, paused_until, last_state_updated_by)
    const convTable = supabase.from('conversations');
    if (typeof convTable?.update === 'function') {
      let updateChain = convTable.update({
        bot_paused: isHandover,
        is_paused: isHandover,
        is_bot_paused: isHandover,
        is_bot_active: !isHandover,
        paused_until: isHandover ? pausedUntilIso : null,
        last_state_updated_by: source,
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
        const phoneVariants = Array.from(new Set([targetPhone, cleanCustomerPhone(params.customerPhone || ''), cleanCustomerPhone(params.senderPhone || ''), params.customerPhone, params.senderPhone].filter(Boolean))) as string[];
        if (typeof updateChain?.in === 'function') {
          updateChain = updateChain.in('customer_phone', phoneVariants);
        } else if (typeof updateChain?.eq === 'function') {
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
        clearRuntimeSessionCache(resolvedTenantUuid, targetPhoneForCache);
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

    // Update runtime cache ONLY after confirmed DB updates
    const cachePayload = {
      tenantId: resolvedTenantUuid,
      userIdentifier: targetPhone,
      isPaused: isHandover,
      botStatus: convStatus,
      pausedUntil: pausedUntilIso,
      pausedBy: source,
      updatedAt: now.getTime(),
    };
    setRuntimeSessionCache(cachePayload);
    if (resolvedTenantSlug && resolvedTenantSlug !== resolvedTenantUuid) {
      setRuntimeSessionCache({ ...cachePayload, tenantId: resolvedTenantSlug });
    }

    const pauseDurationLabel = durationMins !== undefined ? `${durationMins} menit` : '24 jam';
    return {
      success: true,
      scope: 'conversation',
      status: convStatus,
      bot_paused: isHandover,
      is_bot_active: !isHandover,
      paused_until: isHandover ? pausedUntilIso : null,
      last_state_updated_by: source,
      message: isHandover
        ? `⏸️ Percakapan dialihkan ke CS (HUMAN_HANDOVER). Bot AI dijeda selama ${pauseDurationLabel}.`
        : '🤖 Percakapan diaktifkan kembali untuk Bot AI (AI_ACTIVE).',
    };
  } catch (err: any) {
    console.error('[BotControlService] Error executing conversation bot control:', err);
    clearRuntimeSessionCache(resolvedTenantUuid, targetPhoneForCache);
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
 * Unified Central Bot State Service Function (CTO Directive TASK-103)
 * Single Source of Truth for both WhatsApp commands (#pause, #resume, #on, #off)
 * and UI Dashboard toggles.
 *
 * Supports both positional arguments:
 *   updateBotState(conversationId, tenantId, action, durationMinutes, options)
 * and object argument:
 *   updateBotState({ conversationId, tenantId, action, durationMinutes, ... })
 */
export async function updateBotState(
  conversationIdOrParams: string | {
    conversationId?: string;
    tenantId: string;
    tenantSlug?: string;
    action?: BotControlAction | string;
    status?: TenantBotStatus | ConversationBotStatus | string;
    durationMinutes?: number;
    customerPhone?: string;
    senderPhone?: string;
    userRole?: string;
    source?: string;
    scope?: BotControlScope;
    supabase?: any;
  },
  tenantId?: string,
  action?: BotControlAction | string,
  durationMinutes?: number,
  options?: {
    tenantSlug?: string;
    customerPhone?: string;
    senderPhone?: string;
    userRole?: string;
    source?: string;
    scope?: BotControlScope;
    status?: string;
    supabase?: any;
  }
): Promise<{
  success: boolean;
  bot_paused: boolean;
  is_bot_active?: boolean;
  paused_until?: string | null;
  last_state_updated_by?: string;
  message: string;
  scope?: BotControlScope;
  status?: string;
  error?: string;
}> {
  let resolvedParams: any;

  if (typeof conversationIdOrParams === 'object' && conversationIdOrParams !== null) {
    resolvedParams = { ...conversationIdOrParams };
  } else {
    resolvedParams = {
      conversationId: conversationIdOrParams,
      tenantId: tenantId!,
      action,
      durationMinutes,
      ...(options || {}),
    };
  }

  // Normalize action
  let act: BotControlAction = 'PAUSE';
  if (resolvedParams.action) {
    act = String(resolvedParams.action).toUpperCase() === 'RESUME' ? 'RESUME' : 'PAUSE';
  } else if (resolvedParams.status) {
    const s = String(resolvedParams.status).toUpperCase();
    act = (s === 'BOT_DISABLED' || s === 'HUMAN_HANDOVER' || s === 'HUMAN_PAUSED') ? 'PAUSE' : 'RESUME';
  }

  // Default scope
  const scope: BotControlScope = resolvedParams.scope || (resolvedParams.conversationId || resolvedParams.customerPhone ? 'conversation' : 'tenant');

  // Default source and role if not supplied
  const source = resolvedParams.source || 'update_bot_state';
  const userRole = resolvedParams.userRole || 'admin';

  return executeBotControl({
    action: act,
    scope,
    durationMinutes: resolvedParams.durationMinutes,
    status: resolvedParams.status,
    tenantId: resolvedParams.tenantId,
    tenantSlug: resolvedParams.tenantSlug,
    conversationId: resolvedParams.conversationId,
    customerPhone: resolvedParams.customerPhone,
    senderPhone: resolvedParams.senderPhone,
    userRole,
    source,
    supabase: resolvedParams.supabase,
  });
}

/**
 * Auto-resume bot state for a conversation (CTO Directive TASK-104)
 */
export async function resumeBotState(
  conversationId: string,
  tenantId: string,
  reason: string = 'timeout_expired',
  supabase?: any
): Promise<{ success: boolean; is_bot_active: boolean; message: string }> {
  const result = await executeBotControl({
    conversationId,
    tenantId,
    action: 'RESUME',
    scope: 'conversation',
    userRole: 'internal_admin',
    source: reason,
    supabase,
  });

  return {
    success: result.success,
    is_bot_active: !result.bot_paused,
    message: result.message,
  };
}

/**
 * Evaluates bot state and timeout for conversation before bot / AI processing (CTO Directive TASK-104)
 */
export async function evaluateBotStateTimeout(
  conversation: {
    id: string;
    is_bot_paused?: boolean;
    bot_paused?: boolean;
    is_paused?: boolean;
    paused_until?: string | null;
  },
  tenantId: string,
  supabase?: any
): Promise<{ handled: boolean; reason?: string; shouldBypass: boolean }> {
  const isPaused = Boolean(
    conversation.is_bot_paused || conversation.bot_paused || conversation.is_paused
  );

  if (isPaused) {
    if (conversation.paused_until && new Date() > new Date(conversation.paused_until)) {
      // Timeout expired: auto resume
      await resumeBotState(conversation.id, tenantId, 'timeout_expired', supabase);
      return { handled: true, shouldBypass: false, reason: 'timeout_expired_resumed' };
    } else {
      // Masih dalam masa pause: bypass bot processing
      return { handled: false, reason: 'bot_paused_manually', shouldBypass: true };
    }
  }

  return { handled: true, shouldBypass: false };
}


/**
 * Runtime Decision Gate: Prevents zombie pause and enforces the 2-Dimensional Hierarchy:
 *
 * DIMENSI 1: TENANT LEVEL GATE (BOT_ENABLED vs BOT_DISABLED)
 * Single Source of Truth: Status Tenant adalah otoritas tertinggi!
 * Aturan Kunci: Jika status tenant BOT_DISABLED, bot WAJIB bypass total.
 * Kedaluwarsanya timer paused_until pada level kontak TIDAK BOLEH mengaktifkan bot!
 *
 * DIMENSI 2: CONTACT LEVEL GATE (AI_ACTIVE vs HUMAN_HANDOVER)
 * Dievaluasi HANYA JIKA Dimensi Tenant berstatus BOT_ENABLED:
 * - Jika timer paused_until masih aktif -> bypass total (SESSION_PAUSED).
 * - Jika timer paused_until sudah kedaluwarsa -> auto-resume sesi ke AI_ACTIVE.
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

  // =========================================================================
  // DIMENSI 1: TENANT LEVEL GATE (BOT_ENABLED vs BOT_DISABLED)
  // Single Source of Truth: Status Tenant adalah otoritas tertinggi!
  // Aturan Kunci: Jika tenant BOT_DISABLED, bot WAJIB bypass total.
  // Kedaluwarsanya timer paused_until pada kontak TIDAK BOLEH mengaktifkan bot!
  // =========================================================================
  const tenantLookupId = tenant?.id || tenant?.slug || session?.tenant_id;

  const isTenantPausedInDb =
    tenant?.bot_paused === true ||
    tenant?.is_bot_active === false ||
    tenant?.metadata?.bot_status === 'BOT_DISABLED' ||
    tenant?.metadata?.bot_paused === true ||
    tenant?.metadata?.is_bot_paused === true ||
    tenant?.metadata?.is_bot_active === false;

  let isTenantActiveInRecentCache = false;
  let isTenantPausedInCache = false;
  if (tenantLookupId) {
    const cachedGlobal = getRuntimeSessionCache(tenantLookupId);
    if (cachedGlobal && Date.now() - cachedGlobal.updatedAt < 60000) {
      if (cachedGlobal.isPaused || cachedGlobal.botStatus === 'BOT_DISABLED') {
        const dbUpdatedAt = tenant?.updated_at ? new Date(tenant.updated_at).getTime() : 0;
        const dbResumedAt = (tenant?.resumed_at || tenant?.metadata?.resumed_at)
          ? new Date(tenant.resumed_at || tenant.metadata.resumed_at).getTime()
          : 0;
        const dbLatestTime = Math.max(dbUpdatedAt, dbResumedAt);

        // Multi-instance check: If DB says tenant is active (!isTenantPausedInDb),
        // check whether DB was updated at or after cache, OR if cache entry is older than in-flight race window (> 5s).
        if (!isTenantPausedInDb) {
          const isStaleCache =
            (dbLatestTime > 0 && dbLatestTime >= cachedGlobal.updatedAt) ||
            (Date.now() - cachedGlobal.updatedAt > 5000);

          if (isStaleCache) {
            // Reconcile stale cache: DB is the SSOT (resumed on another instance / UI)
            setRuntimeSessionCache({
              tenantId: tenantLookupId,
              isPaused: false,
              botStatus: tenant?.metadata?.bot_status || 'BOT_ENABLED',
              updatedAt: dbLatestTime > 0 ? dbLatestTime : Date.now(),
            });
            if (tenant?.slug && tenant.slug !== tenantLookupId) {
              setRuntimeSessionCache({
                tenantId: tenant.slug,
                isPaused: false,
                botStatus: tenant?.metadata?.bot_status || 'BOT_ENABLED',
                updatedAt: dbLatestTime > 0 ? dbLatestTime : Date.now(),
              });
            }
            isTenantPausedInCache = false;
          } else {
            // Recent in-flight pause command on this instance (< 5s and no newer DB update)
            isTenantPausedInCache = true;
          }
        } else {
          isTenantPausedInCache = true;
        }
      } else if (!cachedGlobal.isPaused) {
        // Owner issued #resume in cache on this instance, unblock immediately without waiting for slow DB query
        isTenantActiveInRecentCache = true;
      }
    }
  }

  if (isTenantPausedInCache && !isTenantPausedInDb) {
    return { shouldBypass: true, reason: 'TENANT_GLOBAL_PAUSED_CACHE' };
  }
  if (!isTenantActiveInRecentCache && (isTenantPausedInDb || isTenantPausedInCache)) {
    return { shouldBypass: true, reason: 'TENANT_GLOBAL_PAUSED' };
  }

  // =========================================================================
  // DIMENSI 2: CONTACT LEVEL GATE (AI_ACTIVE vs HUMAN_HANDOVER)
  // Hanya dievaluasi jika Dimensi Tenant berada dalam kondisi BOT_ENABLED.
  // =========================================================================

  // Fast check: Contact-level cache
  if (tenantLookupId && params.senderPhone) {
    const cachedSession = getRuntimeSessionCache(tenantLookupId, params.senderPhone);
    if (cachedSession && Date.now() - cachedSession.updatedAt < 60000) {
      const isTimerExpired =
        cachedSession.pausedUntil &&
        new Date(cachedSession.pausedUntil).getTime() <= Date.now();

      // Check if DB session is already active (multi-instance resume)
      const isDbSessionActive = session && (
        session.is_paused === false &&
        session.current_state !== 'HUMAN_PAUSED' &&
        session.current_state !== 'HANDOVER_TO_HUMAN' &&
        session.current_state !== 'PAUSED' &&
        session.bot_status !== 'HUMAN_PAUSED' &&
        session.bot_status !== 'HUMAN_HANDOVER' &&
        !Boolean(session.metadata?.is_bot_paused)
      );

      const sessionDbUpdatedAt = session?.updated_at ? new Date(session.updated_at).getTime() : 0;
      const isStaleContactCache = isDbSessionActive && (
        (sessionDbUpdatedAt > 0 && sessionDbUpdatedAt >= cachedSession.updatedAt) ||
        (Date.now() - cachedSession.updatedAt > 5000)
      );

      if (isStaleContactCache) {
        // Reconcile stale contact cache with DB SSOT
        setRuntimeSessionCache({
          tenantId: tenantLookupId,
          userIdentifier: params.senderPhone,
          isPaused: false,
          botStatus: session?.bot_status || 'BOT_ACTIVE',
          pausedUntil: null,
          pausedBy: null,
          updatedAt: sessionDbUpdatedAt > 0 ? sessionDbUpdatedAt : Date.now(),
        });
        return { shouldBypass: false, reason: 'AUTO_RESUMED_EXPIRED' };
      }

      if (cachedSession.isPaused && !isTimerExpired) {
        return { shouldBypass: true, reason: 'SESSION_PAUSED' };
      }
      if (!cachedSession.isPaused) {
        return { shouldBypass: false, reason: 'AUTO_RESUMED_EXPIRED' };
      }
    }
  }

  // Evaluate Contact Session from DB
  if (session) {
    const isSessionStatePaused =
      session.is_paused === true ||
      session.current_state === 'HUMAN_PAUSED' ||
      session.current_state === 'HANDOVER_TO_HUMAN' ||
      session.current_state === 'PAUSED' ||
      session.bot_status === 'HUMAN_PAUSED' ||
      session.bot_status === 'HUMAN_HANDOVER' ||
      Boolean(session.metadata?.is_bot_paused);

    if (isSessionStatePaused) {
      const nowTime = Date.now();
      const supabase = params.supabase || getSupabaseAdmin() || getSupabase();

      // Helper: Auto-resume session di database conversation_sessions, conversations, dan cache
      const autoResumeSession = async (resumeReason: string) => {
        console.info(`[BotControlService] Auto-resuming session ${session.session_id || 'unknown'} (${resumeReason})`);
        const nowIso = new Date().toISOString();
        const targetTenantId = session.tenant_id || tenant?.id || tenantLookupId;
        const targetTenantSlug = tenant?.slug;

        if (supabase && session.session_id) {
          try {
            let sUpdate = supabase
              .from('conversation_sessions')
              .update({
                is_paused: false,
                current_state: 'ACTIVE',
                bot_status: 'BOT_ACTIVE',
                paused_until: null,
                metadata: {
                  is_bot_paused: false,
                  bot_paused: false,
                  is_bot_active: true,
                  bot_status: 'BOT_ACTIVE',
                  resumed_at: nowIso,
                  resumed_by: 'system_auto_resume',
                },
                updated_at: nowIso,
              })
              .eq('session_id', session.session_id);

            if (targetTenantId && typeof sUpdate?.eq === 'function') {
              const chained = sUpdate.eq('tenant_id', targetTenantId);
              if (chained && typeof chained.then === 'function') {
                await chained;
              } else {
                await sUpdate;
              }
            } else {
              await sUpdate;
            }
          } catch (updateErr) {
            console.warn('[BotControlService] Failed to auto-resume session record:', updateErr);
          }
        }

        // Sync conversations table (strictly locked to targetTenantId to prevent cross-tenant leak!)
        if (supabase && (session.user_identifier || params.senderPhone)) {
          const phone = cleanCustomerPhone(session.user_identifier || params.senderPhone);

          // MULTI-TENANT ISOLATION: NEVER update conversations without tenant_id filter!
          if (targetTenantId) {
            try {
              let cUpdateChain: any = supabase
                .from('conversations')
                .update({
                  bot_paused: false,
                  is_paused: false,
                  is_bot_paused: false,
                  is_bot_active: true,
                  bot_mode: 'AI_ACTIVE',
                  status: 'active',
                  updated_at: nowIso,
                });

              // Support chaining or single filter depending on mock/client capabilities
              if (typeof cUpdateChain?.eq === 'function') {
                const phoneFiltered = cUpdateChain.eq('customer_phone', phone);
                if (phoneFiltered && typeof phoneFiltered.eq === 'function') {
                  if (targetTenantSlug && targetTenantSlug !== targetTenantId && typeof phoneFiltered.or === 'function') {
                    cUpdateChain = phoneFiltered.or(`tenant_id.eq.${targetTenantId},tenant_slug.eq.${targetTenantSlug}`);
                  } else {
                    cUpdateChain = phoneFiltered.eq('tenant_id', targetTenantId);
                  }
                } else {
                  cUpdateChain = phoneFiltered;
                }
              }

              await cUpdateChain;
            } catch (convErr) {
              console.warn('[BotControlService] Failed to auto-resume conversation record:', convErr);
            }
          } else {
            console.error('[BotControlService] Refusing to auto-resume conversation: missing targetTenantId (fail-closed multi-tenant guardrail)');
          }
        }

        // Sync runtime session cache AFTER DB update for all tenant aliases
        if (session.user_identifier || params.senderPhone) {
          const userPhone = session.user_identifier || params.senderPhone;
          const tenantKeysToSync = [targetTenantId, targetTenantSlug, tenantLookupId].filter(Boolean) as string[];
          const uniqueTenantKeys = Array.from(new Set(tenantKeysToSync));

          for (const tKey of uniqueTenantKeys) {
            setRuntimeSessionCache({
              tenantId: tKey,
              userIdentifier: userPhone,
              isPaused: false,
              botStatus: 'BOT_ACTIVE',
              pausedUntil: null,
              pausedBy: null,
              updatedAt: Date.now(),
            });
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

        if (tenantLookupId && (session.user_identifier || params.senderPhone)) {
          setRuntimeSessionCache({
            tenantId: tenantLookupId,
            userIdentifier: session.user_identifier || params.senderPhone,
            isPaused: true,
            botStatus: 'HUMAN_HANDOVER',
            pausedUntil: fallbackPausedUntil,
            pausedBy: pausedBy || 'owner',
          });
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

      // Update runtime session cache for active pause
      if (tenantLookupId && (session.user_identifier || params.senderPhone)) {
        setRuntimeSessionCache({
          tenantId: tenantLookupId,
          userIdentifier: session.user_identifier || params.senderPhone,
          isPaused: true,
          botStatus: session.bot_status || 'HUMAN_HANDOVER',
          pausedUntil: session.paused_until,
          pausedBy: session.paused_by || null,
        });
      }

      // Still actively paused
      return { shouldBypass: true, reason: 'SESSION_PAUSED' };
    }
  }

  return { shouldBypass: false };
}
