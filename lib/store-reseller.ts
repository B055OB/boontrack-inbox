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

export interface StoreReseller {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  phone: string;
  email?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
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
