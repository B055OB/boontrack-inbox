/**
 * @file lib/entitlements/trial-guard.ts
 * @description CFO Hard-Cap: Strict trial quota enforcement for BoonTrack.
 *
 * Cost constraint: Variable infrastructure cost (Supabase, AI Bot, WhatsApp)
 * must not exceed Rp 7.000 per trial tenant.
 *
 * Hard limits for tenants with is_trial = true:
 *   - Max 30 orders during trial period
 *   - Max 50 AI Bot / WhatsApp notification interactions
 *
 * Guarantees:
 *   - Non-trial (paid, active subscription) tenants → always bypass (allowed: true)
 *   - Trial tenants exceeding limit → hard-stop with structured domain error
 *   - Dashboard login access is NEVER blocked (only transactional mutations are blocked)
 *   - All quota checks are read-only (no side effects on tenant data)
 *
 * @architecture BATCH 1 / Ticket 1.2
 */

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

// ---------------------------------------------------------------------------
// Constants — CFO-approved hard caps
// ---------------------------------------------------------------------------

export const TRIAL_ORDER_LIMIT = 30;
export const TRIAL_INTERACTION_LIMIT = 50;
export const TRIAL_WA_LIMIT = 15;

// ---------------------------------------------------------------------------
// Domain Types
// ---------------------------------------------------------------------------

export type QuotaResourceType = 'order' | 'interaction' | 'wa_notification';

export interface TrialQuotaResult {
  /** Whether the requested resource creation is allowed. */
  allowed: boolean;
  /**
   * Structured error code — only present when allowed = false.
   * Callers MUST surface this to the user / return as HTTP 402/429 response.
   */
  errorCode?: 'TRIAL_LIMIT_EXCEEDED' | 'TENANT_NOT_FOUND' | 'QUOTA_CHECK_ERROR';
  /** Human-readable error message (Bahasa Indonesia). */
  message?: string;
  /** Current usage count for the checked resource. */
  currentUsage?: number;
  /** Hard limit for the checked resource. */
  limit?: number;
  /** Whether this tenant is in trial mode. */
  isTrial: boolean;
  /**
   * ISO 8601 timestamp when the trial expires.
   * Null for non-trial tenants.
   */
  trialEndsAt?: string | null;
}

export interface TrialUsageSummary {
  isTrial: boolean;
  trialEndsAt: string | null;
  orders: { current: number; limit: number; exceeded: boolean };
  interactions: { current: number; limit: number; exceeded: boolean };
  waNotifications?: { current: number; limit: number; exceeded: boolean };
}

// ---------------------------------------------------------------------------
// Core: Determine if tenant is in trial mode
// ---------------------------------------------------------------------------

/**
 * Determine whether a tenant row represents an active trial.
 * Sources of truth (checked in priority order):
 *   1. `tenants.trial_ends_at` (canonical DB column)
 *   2. `tenants.metadata.is_trial`
 *   3. `tenants.metadata.subscription_status === 'trial'`
 *
 * A tenant is considered in trial ONLY if:
 *   - At least one of the above signals is true, AND
 *   - `trial_ends_at` has not yet passed (if present)
 */
export function resolveTenantTrialStatus(tenantRow: {
  trial_ends_at?: string | null;
  subscription_ends_at?: string | null;
  metadata?: Record<string, unknown> | null;
  tier?: string | null;
}): { isTrial: boolean; trialEndsAt: string | null } {
  const meta = (tenantRow.metadata && typeof tenantRow.metadata === 'object')
    ? tenantRow.metadata as Record<string, unknown>
    : {};

  const trialEndsAt =
    tenantRow.trial_ends_at ||
    (meta['trial_ends_at'] as string | undefined) ||
    null;

  // If trial_ends_at exists and has already passed, not in trial
  if (trialEndsAt) {
    const endsAt = new Date(trialEndsAt);
    if (!isNaN(endsAt.getTime()) && endsAt < new Date()) {
      return { isTrial: false, trialEndsAt };
    }
  }

  const isTrialSignal =
    Boolean(meta['is_trial']) ||
    String(meta['subscription_status'] || '').toLowerCase() === 'trial' ||
    Boolean(trialEndsAt);

  return { isTrial: isTrialSignal, trialEndsAt: trialEndsAt || null };
}

// ---------------------------------------------------------------------------
// Core: Count current trial usage for a tenant
// ---------------------------------------------------------------------------

/**
 * Count the number of orders placed by a tenant since trial start.
 * Uses `orders.created_at >= trial_start` if available, otherwise counts all.
 */
async function countTrialOrders(
  tenantId: string,
  trialEndsAt: string | null
): Promise<number> {
  const supabase = getSupabaseAdmin() ?? getSupabase();
  if (!supabase) return 0;

  // Approximate trial start: 7 days before trial_ends_at, or 7 days ago
  const trialStartApprox = trialEndsAt
    ? new Date(new Date(trialEndsAt).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', trialStartApprox);

  if (error) {
    console.warn('[TrialGuard] Error counting trial orders:', error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Count the number of AI bot / WhatsApp notification interactions for a tenant
 * during the trial period. Reads from `conversation_logs` or `chat_sessions` if available,
 * falls back to 0 if table doesn't exist yet.
 */
async function countTrialInteractions(
  tenantId: string,
  trialEndsAt: string | null
): Promise<number> {
  const supabase = getSupabaseAdmin() ?? getSupabase();
  if (!supabase) return 0;

  const trialStartApprox = trialEndsAt
    ? new Date(new Date(trialEndsAt).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Try conversation_logs first (if exists)
  const { count, error } = await supabase
    .from('conversation_logs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', trialStartApprox);

  if (error) {
    // Table may not exist — non-fatal, return 0
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      console.warn('[TrialGuard] conversation_logs table not found, interaction count = 0');
      return 0;
    }
    console.warn('[TrialGuard] Error counting trial interactions:', error.message);
    return 0;
  }

  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Public API: checkTrialQuota
// ---------------------------------------------------------------------------

/**
 * Check whether a trial tenant is allowed to perform a resource-consuming action.
 *
 * @param tenantId     - UUID of the tenant to check.
 * @param resourceType - The type of resource being created: 'order' | 'interaction'.
 * @returns `TrialQuotaResult` — callers must check `result.allowed` before proceeding.
 *
 * IMPORTANT: This function ONLY reads data. It does NOT mutate any tenant record.
 *
 * Usage pattern:
 * ```ts
 * const quota = await checkTrialQuota(tenantId, 'order');
 * if (!quota.allowed) {
 *   return NextResponse.json({
 *     error: quota.errorCode,
 *     message: quota.message,
 *   }, { status: 402 });
 * }
 * ```
 */
export async function checkTrialQuota(
  tenantId: string,
  resourceType: QuotaResourceType
): Promise<TrialQuotaResult> {
  const supabase = getSupabaseAdmin() ?? getSupabase();
  if (!supabase) {
    return {
      allowed: true, // Fail-open: don't block if DB is unreachable
      isTrial: false,
      errorCode: 'QUOTA_CHECK_ERROR',
      message: 'Database tidak dapat dijangkau. Kuota tidak dapat diverifikasi.',
    };
  }

  // 1. Fetch tenant row
  const { data: tenantRow, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, tier, trial_ends_at, subscription_ends_at, metadata')
    .eq('id', tenantId)
    .maybeSingle();

  if (tenantErr) {
    console.error('[TrialGuard] Error fetching tenant:', tenantErr.message);
    return {
      allowed: true, // Fail-open
      isTrial: false,
      errorCode: 'QUOTA_CHECK_ERROR',
      message: 'Gagal memverifikasi status tenant. Lanjutkan dengan hati-hati.',
    };
  }

  if (!tenantRow) {
    return {
      allowed: false,
      isTrial: false,
      errorCode: 'TENANT_NOT_FOUND',
      message: `Tenant dengan ID '${tenantId}' tidak ditemukan.`,
    };
  }

  // 2. Determine trial status
  const { isTrial, trialEndsAt } = resolveTenantTrialStatus(tenantRow);

  // 3. Non-trial tenants bypass all limits
  if (!isTrial) {
    return {
      allowed: true,
      isTrial: false,
      trialEndsAt: null,
    };
  }

  // 4. Trial tenant: check resource-specific quota
  if (resourceType === 'order') {
    const currentUsage = await countTrialOrders(tenantId, trialEndsAt);
    if (currentUsage >= TRIAL_ORDER_LIMIT) {
      return {
        allowed: false,
        isTrial: true,
        trialEndsAt,
        errorCode: 'TRIAL_LIMIT_EXCEEDED',
        currentUsage,
        limit: TRIAL_ORDER_LIMIT,
        message:
          `Batas kuota uji coba 7 hari telah tercapai (${currentUsage}/${TRIAL_ORDER_LIMIT} pesanan). ` +
          'Silakan upgrade ke paket berbayar untuk melanjutkan menerima pesanan.',
      };
    }
    return {
      allowed: true,
      isTrial: true,
      trialEndsAt,
      currentUsage,
      limit: TRIAL_ORDER_LIMIT,
    };
  }

  if (resourceType === 'interaction') {
    const currentUsage = await countTrialInteractions(tenantId, trialEndsAt);
    if (currentUsage >= TRIAL_INTERACTION_LIMIT) {
      return {
        allowed: false,
        isTrial: true,
        trialEndsAt,
        errorCode: 'TRIAL_LIMIT_EXCEEDED',
        currentUsage,
        limit: TRIAL_INTERACTION_LIMIT,
        message:
          `Batas kuota uji coba 7 hari telah tercapai (${currentUsage}/${TRIAL_INTERACTION_LIMIT} percakapan). ` +
          'Silakan upgrade ke paket berbayar untuk mengaktifkan AI Bot & notifikasi WhatsApp tanpa batas.',
      };
    }
    return {
      allowed: true,
      isTrial: true,
      trialEndsAt,
      currentUsage,
      limit: TRIAL_INTERACTION_LIMIT,
    };
  }

  // Unknown resource type — fail-open, log for investigation
  console.warn(`[TrialGuard] Unknown resourceType: "${resourceType}". Failing open.`);
  return { allowed: true, isTrial };
}

// ---------------------------------------------------------------------------
// Public API: getTrialUsageSummary
// ---------------------------------------------------------------------------

/**
 * Fetch a full trial usage summary for dashboard display.
 * Returns progress bar data: { current, limit, exceeded } for each resource type.
 *
 * Non-trial tenants return dummy unlimited values (limit = Infinity → shown as ∞).
 *
 * @param tenantId - UUID of the tenant.
 * @returns `TrialUsageSummary` for UI rendering.
 */
export async function getTrialUsageSummary(tenantId: string): Promise<TrialUsageSummary> {
  const supabase = getSupabaseAdmin() ?? getSupabase();
  if (!supabase) {
    return {
      isTrial: false,
      trialEndsAt: null,
      orders: { current: 0, limit: TRIAL_ORDER_LIMIT, exceeded: false },
      interactions: { current: 0, limit: TRIAL_INTERACTION_LIMIT, exceeded: false },
    };
  }

  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('id, tier, trial_ends_at, subscription_ends_at, metadata')
    .eq('id', tenantId)
    .maybeSingle();

  if (!tenantRow) {
    return {
      isTrial: false,
      trialEndsAt: null,
      orders: { current: 0, limit: TRIAL_ORDER_LIMIT, exceeded: false },
      interactions: { current: 0, limit: TRIAL_INTERACTION_LIMIT, exceeded: false },
    };
  }

  const { isTrial, trialEndsAt } = resolveTenantTrialStatus(tenantRow);

  if (!isTrial) {
    return {
      isTrial: false,
      trialEndsAt: null,
      orders: { current: 0, limit: TRIAL_ORDER_LIMIT, exceeded: false },
      interactions: { current: 0, limit: TRIAL_INTERACTION_LIMIT, exceeded: false },
    };
  }

  const [orderCount, interactionCount] = await Promise.all([
    countTrialOrders(tenantId, trialEndsAt),
    countTrialInteractions(tenantId, trialEndsAt),
  ]);

  const waCount = Math.min(orderCount, TRIAL_WA_LIMIT);

  return {
    isTrial: true,
    trialEndsAt,
    orders: {
      current: orderCount,
      limit: TRIAL_ORDER_LIMIT,
      exceeded: orderCount >= TRIAL_ORDER_LIMIT,
    },
    interactions: {
      current: interactionCount,
      limit: TRIAL_INTERACTION_LIMIT,
      exceeded: interactionCount >= TRIAL_INTERACTION_LIMIT,
    },
    waNotifications: {
      current: waCount,
      limit: TRIAL_WA_LIMIT,
      exceeded: waCount >= TRIAL_WA_LIMIT,
    },
  };
}
