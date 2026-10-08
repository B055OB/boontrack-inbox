/**
 * lib/store-reseller.ts
 * Multi-Tenant Store Reseller Architecture Engine
 * 
 * Invariants (CTO & CFO Architecture Contract):
 * 1. STRICT TENANT ISOLATION: Reseller codes and attributions are strictly scoped to tenant_id.
 * 2. NON-CUSTODIAL: Ledger-only calculations; no financial custody or automated payout transfers.
 * 3. NON-BLOCKING RESILIENCE: Reseller lookup failures NEVER block buyer checkout.
 * 4. CANONICAL FINANCIAL AUTHORITY: Commissions ONLY materialize on PAYMENT_CONFIRMED or COD_SETTLED.
 * 5. IMMUTABLE SNAPSHOTTING: Commission amount, rate, and base are snapshotted permanently.
 */

import { getSupabase, getSupabaseAdmin } from '@/lib/supabaseClient';

export type ResellerTier = 'FREE' | 'STARTER' | 'SCALE' | 'UNLIMITED';

export interface ResellerEntitlement {
  tier: ResellerTier;
  max_active_resellers: number;
  current_quota: number;
  message: string;
  upgrade_url: string;
}

/**
 * Resolves dynamic reseller entitlement based on tenant tier and reseller add-on subscription.
 * CTO & CFO Entitlement Invariants:
 * - FREE: 5 active resellers (Default zero-cost tier for verified merchants)
 * - STARTER: 25 active resellers (Starter Add-on, Rp 79.000/bln)
 * - SCALE: 100 active resellers (Scale Add-on, Rp 149.000/bln)
 * - UNLIMITED: 999999 active resellers (Enterprise / Team Scale or Unlimited Add-on)
 */
export function resolveResellerEntitlement(tenant: { tier?: string; metadata?: any }): ResellerEntitlement {
  const meta = tenant?.metadata || {};
  const metaTier = String(
    meta?.reseller_settings?.tier ||
    meta?.reseller_tier ||
    meta?.reseller_plan ||
    meta?.features?.reseller_tier ||
    meta?.addons?.reseller?.tier ||
    meta?.addons?.store_reseller?.tier ||
    (meta?.addons?.reseller_unlimited || meta?.features?.reseller_unlimited ? 'UNLIMITED' : '') ||
    (meta?.addons?.reseller_scale || meta?.features?.reseller_scale ? 'SCALE' : '') ||
    (meta?.addons?.reseller_starter || meta?.features?.reseller_starter ? 'STARTER' : '') ||
    ''
  ).toUpperCase();

  const baseTier = String(tenant?.tier || '').toUpperCase();

  if (metaTier === 'UNLIMITED' || baseTier === 'ENTERPRISE' || baseTier === 'TEAM_SCALE') {
    return {
      tier: 'UNLIMITED',
      max_active_resellers: 999999,
      current_quota: 999999,
      message: 'Batas kuota mitra reseller telah tercapai.',
      upgrade_url: '/dashboard/billing',
    };
  }

  if (metaTier === 'SCALE') {
    return {
      tier: 'SCALE',
      max_active_resellers: 100,
      current_quota: 100,
      message: 'Batas kuota mitra reseller aktif telah tercapai (100 mitra). Upgrade ke Unlimited Add-on untuk kapasitas reseller tanpa batas.',
      upgrade_url: '/dashboard/billing?feature=reseller_unlimited',
    };
  }

  if (metaTier === 'STARTER') {
    return {
      tier: 'STARTER',
      max_active_resellers: 25,
      current_quota: 25,
      message: 'Batas kuota mitra reseller aktif telah tercapai (25 mitra). Upgrade ke Scale Add-on untuk menambah hingga 100 reseller.',
      upgrade_url: '/dashboard/billing?feature=reseller_scale',
    };
  }

  // Default: FREE Tier (5 active resellers)
  return {
    tier: 'FREE',
    max_active_resellers: 5,
    current_quota: 5,
    message: 'Batas kuota mitra reseller aktif telah tercapai. Upgrade ke Starter Add-on untuk menambah hingga 25 reseller.',
    upgrade_url: '/dashboard/billing?feature=reseller_starter',
  };
}

/**
 * Guardrails Downgrade-Safe & Status FROZEN:
 * - NEVER perform hard delete on reseller profiles or commission history during downgrades.
 * - If tenant has more ACTIVE resellers than maxLimit, excess resellers transition to 'FROZEN' (read-only).
 * - If tenant upgrades, older 'FROZEN' resellers automatically restore to 'ACTIVE' (FIFO).
 */
export async function syncDowngradeSafeResellers(tenantId: string, maxLimit: number, supabaseClient?: any) {
  try {
    const supabase = supabaseClient || getSupabaseAdmin() || getSupabase();
    if (!supabase) return;

    const { data: activeResellers, error: aErr } = await supabase
      .from('store_resellers')
      .select('id, created_at, status, metadata')
      .eq('tenant_id', tenantId)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: true });

    if (aErr || !Array.isArray(activeResellers)) return;

    if (activeResellers.length > maxLimit) {
      // Transition excess active resellers to FROZEN (FIFO: keep oldest active)
      const toFreeze = activeResellers.slice(maxLimit);
      for (const r of toFreeze) {
        await supabase
          .from('store_resellers')
          .update({
            status: 'FROZEN',
            metadata: {
              ...(r.metadata || {}),
              frozen_reason: 'DOWNGRADE_QUOTA_EXCEEDED',
              frozen_at: new Date().toISOString(),
              previous_status: 'ACTIVE',
            },
          })
          .eq('id', r.id);
      }
    } else if (activeResellers.length < maxLimit) {
      // Room available: auto-thaw previously frozen resellers up to maxLimit
      const room = maxLimit - activeResellers.length;
      const { data: frozenResellers } = await supabase
        .from('store_resellers')
        .select('id, metadata')
        .eq('tenant_id', tenantId)
        .eq('status', 'FROZEN')
        .order('created_at', { ascending: true })
        .limit(room);

      if (Array.isArray(frozenResellers) && frozenResellers.length > 0) {
        for (const fr of frozenResellers) {
          await supabase
            .from('store_resellers')
            .update({
              status: 'ACTIVE',
              metadata: {
                ...(fr.metadata || {}),
                unfrozen_at: new Date().toISOString(),
              },
            })
            .eq('id', fr.id);
        }
      }
    }
  } catch (syncErr) {
    console.warn('[syncDowngradeSafeResellers] Note:', syncErr);
  }
}


export interface StoreReseller {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  phone: string;
  email?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'FROZEN';
  commission_type: 'PERCENTAGE' | 'FIXED';
  commission_value: number;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface ResellerLink {
  id: string;
  tenant_id: string;
  reseller_id: string;
  code: string;
  destination_type: 'STORE' | 'PRODUCT' | 'CATEGORY' | 'LANDING_PAGE';
  destination_id?: string | null;
  custom_slug?: string | null;
  is_active: boolean;
  click_count: number;
  created_at?: string;
}

export interface ResellerAttribution {
  id: string;
  tenant_id: string;
  reseller_id: string;
  link_id?: string | null;
  session_id: string;
  contact_id?: string | null;
  order_id?: string | null;
  status: 'ATTRIBUTED' | 'CONVERTED' | 'EXPIRED' | 'INVALIDATED';
  utm_params?: Record<string, any>;
  created_at?: string;
  expires_at?: string;
}

export interface ResellerCommission {
  id: string;
  tenant_id: string;
  reseller_id: string;
  order_id: string;
  commission_base: number;
  commission_rate: number;
  commission_type: 'PERCENTAGE' | 'FIXED';
  commission_amount: number;
  currency: string;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'REVERSED';
  earned_at: string;
  approved_at?: string | null;
  paid_at?: string | null;
  reversed_at?: string | null;
  payout_notes?: string | null;
  metadata?: Record<string, any>;
}

export interface ResellerContext {
  reseller_id: string;
  reseller_code: string;
  reseller_name: string;
  commission_type: 'PERCENTAGE' | 'FIXED';
  commission_value: number;
  is_valid: boolean;
}

/**
 * Extracts and sanitizes reseller referral code from URL query params.
 * Priority: ?r= -> ?reseller=
 */
export function extractResellerCodeFromQuery(
  source: URLSearchParams | Record<string, any> | string | null | undefined
): string | null {
  if (!source) return null;

  let raw: string | null = null;
  if (typeof source === 'string') {
    try {
      const url = new URL(source, 'http://localhost');
      raw = url.searchParams.get('r') || url.searchParams.get('reseller');
    } catch {
      raw = null;
    }
  } else if (source instanceof URLSearchParams) {
    raw = source.get('r') || source.get('reseller');
  } else if (typeof source === 'object') {
    raw = (source['r'] || source['reseller']) as string | null;
  }

  if (!raw || typeof raw !== 'string') return null;

  // Normalisasi: alphanumeric, underscore, hyphen only (anti-injection)
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Stores active reseller code in browser localStorage scoped by tenant.
 */
export function captureStoreReseller(tenantSlug: string, explicitCode?: string): string | null {
  if (typeof window === 'undefined' || !tenantSlug) return null;

  try {
    const code = explicitCode || extractResellerCodeFromQuery(new URLSearchParams(window.location.search));
    if (code) {
      const storageKey = `bt_reseller_${tenantSlug.toLowerCase()}`;
      localStorage.setItem(storageKey, code);
      sessionStorage.setItem(storageKey, code);
      return code;
    }
  } catch (err) {
    console.warn('[StoreReseller] Failed to write localStorage:', err);
  }

  return getActiveResellerCode(tenantSlug);
}

/**
 * Retrieves the currently active reseller code for a given tenant.
 */
export function getActiveResellerCode(tenantSlug: string): string | null {
  if (typeof window === 'undefined' || !tenantSlug) return null;

  try {
    const storageKey = `bt_reseller_${tenantSlug.toLowerCase()}`;
    return sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey) || null;
  } catch {
    return null;
  }
}

/**
 * Clears the active reseller code for a given tenant.
 */
export function clearActiveResellerCode(tenantSlug: string): void {
  if (typeof window === 'undefined' || !tenantSlug) return null as any;

  try {
    const storageKey = `bt_reseller_${tenantSlug.toLowerCase()}`;
    localStorage.removeItem(storageKey);
    sessionStorage.removeItem(storageKey);
  } catch {}
}

/**
 * Resolves reseller record against Supabase database non-blockingly.
 * Guarantees zero breakdown of checkout if the code is invalid or Supabase query fails.
 */
export async function resolveResellerContext(
  tenantIdOrSlug: string,
  code: string,
  supabaseClient?: any
): Promise<ResellerContext | null> {
  if (!tenantIdOrSlug || !code) return null;

  try {
    const supabase = supabaseClient || getSupabaseAdmin() || getSupabase();
    if (!supabase) return null;

    const cleanCode = code.trim().toUpperCase();

    // Query store_resellers with tenant_id or joined tenants.slug
    const { data, error } = await supabase
      .from('store_resellers')
      .select('id, tenant_id, code, name, status, commission_type, commission_value, tenants!inner(id, slug)')
      .ilike('code', cleanCode)
      .eq('status', 'ACTIVE')
      .or(`id.eq.${tenantIdOrSlug},slug.eq.${tenantIdOrSlug}`, { foreignTable: 'tenants' })
      .maybeSingle();

    if (error || !data) {
      // Graceful fallback: non-blocking
      return null;
    }

    return {
      reseller_id: data.id,
      reseller_code: data.code,
      reseller_name: data.name,
      commission_type: data.commission_type || 'PERCENTAGE',
      commission_value: Number(data.commission_value || 0),
      is_valid: true,
    };
  } catch (err) {
    console.warn('[StoreReseller] Non-blocking resolution error:', err);
    return null;
  }
}

/**
 * Pure calculation of reseller commission amount based on snapshot formula.
 */
export function calculateResellerCommissionAmount(
  baseAmount: number,
  commissionType: 'PERCENTAGE' | 'FIXED',
  commissionValue: number
): number {
  if (baseAmount <= 0 || commissionValue <= 0) return 0;

  if (commissionType === 'FIXED') {
    return Math.min(baseAmount, Math.round(commissionValue));
  }

  // PERCENTAGE: commissionValue e.g. 10 for 10% or 0.10
  const rateMultiplier = commissionValue > 1 ? commissionValue / 100 : commissionValue;
  return Math.round(baseAmount * rateMultiplier);
}

/**
 * Atomically generates an immutable commission snapshot record in reseller_commissions.
 * Invoked STRICTLY upon PAYMENT_CONFIRMED or COD_SETTLED.
 */
export async function recordResellerCommissionOnCanonicalEvent(params: {
  tenantId: string;
  orderId: string;
  resellerId: string;
  commissionBase: number;
  commissionType: 'PERCENTAGE' | 'FIXED';
  commissionValue: number;
  currency?: string;
  metadata?: Record<string, any>;
  supabaseClient?: any;
}): Promise<{ success: boolean; commissionId?: string; amount?: number; error?: string }> {
  try {
    const supabase = params.supabaseClient || getSupabaseAdmin() || getSupabase();
    if (!supabase) return { success: false, error: 'Supabase client unavailable' };

    const commissionAmount = calculateResellerCommissionAmount(
      params.commissionBase,
      params.commissionType,
      params.commissionValue
    );

    if (commissionAmount <= 0) {
      return { success: false, error: 'Calculated commission is zero' };
    }

    // Downgrade-Safe Guardrail: Reseller must be ACTIVE (FROZEN/INACTIVE resellers do NOT accrue new commissions)
    const { data: resellerCheck } = await supabase
      .from('store_resellers')
      .select('status')
      .eq('id', params.resellerId)
      .eq('tenant_id', params.tenantId)
      .maybeSingle();

    if (!resellerCheck || resellerCheck.status !== 'ACTIVE') {
      return {
        success: false,
        error: `Reseller is not active (status is ${resellerCheck?.status || 'NOT_FOUND'}). Commission withheld.`,
      };
    }

    const rate = params.commissionType === 'PERCENTAGE'
      ? (params.commissionValue > 1 ? params.commissionValue / 100 : params.commissionValue)
      : 0;

    const payload = {
      tenant_id: params.tenantId,
      reseller_id: params.resellerId,
      order_id: params.orderId,
      commission_base: params.commissionBase,
      commission_rate: rate,
      commission_type: params.commissionType,
      commission_amount: commissionAmount,
      currency: params.currency || 'IDR',
      status: 'PENDING',
      earned_at: new Date().toISOString(),
      metadata: {
        ...(params.metadata || {}),
        snapshot_time: new Date().toISOString(),
        calculation_formula: `${params.commissionType} (${params.commissionValue}) on base ${params.commissionBase}`,
      },
    };

    const { data, error } = await supabase
      .from('reseller_commissions')
      .upsert(payload, { onConflict: 'tenant_id, order_id, reseller_id' })
      .select('id')
      .single();

    if (error) {
      console.warn('[StoreReseller] Failed to upsert commission snapshot:', error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      commissionId: data?.id,
      amount: commissionAmount,
    };
  } catch (err: any) {
    console.error('[StoreReseller] Exception recording commission:', err);
    return { success: false, error: err?.message || String(err) };
  }
}
