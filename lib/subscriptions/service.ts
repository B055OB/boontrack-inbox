/**
 * @file lib/subscriptions/service.ts
 * @description Core service layer for multi-duration subscription activation, period renewal,
 * idempotency enforcement, and tenant state synchronization adhering to ARCHITECTURE.md §5.2.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import {
  SubscriptionTier,
  SubscriptionDurationMonths,
  ShopSubscription,
  ActivateSubscriptionParams,
  ActivationResult,
} from './types';
import {
  calculateSubscriptionDates,
  getTierAiSessionQuota,
  formatWIBIsoString,
  isSubscriptionActive,
} from './entitlement';

/**
 * Activates or upgrades a shop subscription for a tenant:
 * 1. Idempotency Check: Verifies if invoice_id has already been processed in 'shop_subscriptions'.
 * 2. Resolves tenant dynamically from Supabase (fails closed if not found).
 * 3. Deterministically calculates billing dates (30-day reset period & N-month expiry in Asia/Jakarta WIB).
 * 4. Supersedes older ACTIVE subscriptions to preserve the single-active invariant.
 * 5. Inserts new record into 'shop_subscriptions' with status 'ACTIVE'.
 * 6. Synchronizes tenant columns: subscription_tier, subscription_status, tier, status, subscription_ends_at, and AI quota metadata.
 */
export async function activateShopSubscription(
  params: ActivateSubscriptionParams,
  client?: SupabaseClient
): Promise<ActivationResult> {
  const supabase = client || getSupabaseAdmin();

  const {
    tenantId,
    tenantSlug,
    tier,
    durationMonths,
    invoiceId,
    amountPaid = 0,
    metadata = {},
    startDate,
  } = params;

  // 1. Idempotency Check: if invoice_id exists and already recorded, return existing subscription
  if (invoiceId) {
    try {
      const { data: existingSub, error: findErr } = await supabase
        .from('shop_subscriptions')
        .select('*')
        .eq('invoice_id', invoiceId)
        .maybeSingle();

      if (findErr) {
        return {
          success: false,
          error: `Error checking invoice idempotency: ${findErr.message}`,
        };
      }

      if (existingSub) {
        return {
          success: true,
          subscription: existingSub as ShopSubscription,
          tenantId: existingSub.tenant_id,
          tenantSlug: existingSub.tenant_slug,
          isExisting: true,
        };
      }
    } catch (checkErr: any) {
      return {
        success: false,
        error: `Exception during idempotency check: ${checkErr?.message || checkErr}`,
      };
    }
  }

  if (!tenantId && !tenantSlug) {
    return {
      success: false,
      error: 'Either tenantId or tenantSlug must be provided for subscription activation.',
    };
  }

  // 2. Resolve Tenant from Supabase
  let query = supabase.from('tenants').select('id, slug, name, tier, status, metadata');
  if (tenantId) {
    query = query.eq('id', tenantId);
  } else if (tenantSlug) {
    query = query.eq('slug', tenantSlug);
  }

  const { data: tenant, error: tenantErr } = await query.maybeSingle();

  if (tenantErr || !tenant) {
    return {
      success: false,
      error: tenantErr?.message || `Tenant not found for identifier (${tenantId || tenantSlug})`,
    };
  }

  // 3. Calculate Deterministic Dates & Quotas in Asia/Jakarta (WIB)
  let dates;
  try {
    dates = calculateSubscriptionDates(durationMonths, startDate);
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to calculate subscription dates.',
    };
  }

  const quota = getTierAiSessionQuota(tier);

  // 4. Mark Existing Active Subscriptions as Superseded/Expired
  try {
    await supabase
      .from('shop_subscriptions')
      .update({
        status: 'EXPIRED',
        updated_at: formatWIBIsoString(new Date()),
      })
      .eq('tenant_id', tenant.id)
      .eq('status', 'ACTIVE');
  } catch (supersedeErr) {
    console.warn('[Subscription Service] Superseding previous subscriptions note:', supersedeErr);
  }

  // 5. Insert new subscription into 'shop_subscriptions'
  const subscriptionPayload = {
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    tier,
    plan_tier: tier.toLowerCase(),
    duration_months: durationMonths,
    starts_at: dates.starts_at,
    current_period_starts_at: dates.current_period_starts_at,
    current_period_ends_at: dates.current_period_ends_at,
    expires_at: dates.expires_at,
    status: 'ACTIVE' as const,
    invoice_id: invoiceId || null,
    amount: amountPaid,
    amount_paid: amountPaid,
    metadata: {
      ...metadata,
      ai_session_quota: {
        base_quota: quota.baseQuota,
        session_ttl_hours: quota.sessionTtlHours,
        reset_cycle_days: quota.resetCycleDays,
      },
      activated_at: formatWIBIsoString(new Date()),
    },
    created_at: dates.starts_at,
    updated_at: dates.starts_at,
  };

  const { data: insertedSub, error: insertErr } = await supabase
    .from('shop_subscriptions')
    .insert(subscriptionPayload)
    .select('*')
    .single();

  if (insertErr || !insertedSub) {
    return {
      success: false,
      error: insertErr?.message || 'Failed to insert subscription record.',
    };
  }

  // 6. Synchronize Tenants Table (tier, subscription_tier, status, subscription_status, metadata)
  const existingMeta = (tenant.metadata && typeof tenant.metadata === 'object') ? tenant.metadata : {};
  const updatedMetadata = {
    ...existingMeta,
    subscription: {
      id: insertedSub.id,
      tier,
      duration_months: durationMonths,
      status: 'ACTIVE',
      current_period_ends_at: dates.current_period_ends_at,
      expires_at: dates.expires_at,
      invoice_id: invoiceId || null,
      ai_quota: {
        base_quota: quota.baseQuota,
        session_ttl_hours: quota.sessionTtlHours,
        reset_cycle_days: quota.resetCycleDays,
      },
    },
    ai_session_quota: quota.baseQuota,
  };

  const { error: updateTenantErr } = await supabase
    .from('tenants')
    .update({
      tier,
      subscription_tier: tier,
      status: 'ACTIVE',
      subscription_status: 'ACTIVE',
      subscription_ends_at: dates.expires_at,
      due_date: dates.expires_at.split('T')[0],
      metadata: updatedMetadata,
    })
    .eq('id', tenant.id);

  if (updateTenantErr) {
    console.error('[Subscription Service] Failed to synchronize tenant table:', updateTenantErr);
    return {
      success: false,
      subscription: insertedSub as ShopSubscription,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      error: `Subscription recorded but tenant sync failed: ${updateTenantErr.message}`,
    };
  }

  return {
    success: true,
    subscription: insertedSub as ShopSubscription,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
  };
}

/**
 * Backward-compatible alias for activateShopSubscription.
 */
export const activateSubscription = activateShopSubscription;

/**
 * Retrieves the currently active subscription for a tenant.
 */
export async function getActiveSubscription(
  tenantIdOrSlug: string,
  client?: SupabaseClient
): Promise<ShopSubscription | null> {
  const supabase = client || getSupabaseAdmin();

  // Try direct lookup by tenant_id first
  let { data, error } = await supabase
    .from('shop_subscriptions')
    .select('*')
    .eq('tenant_id', tenantIdOrSlug)
    .eq('status', 'ACTIVE')
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // If not found, try lookup via tenant_slug
  if (!data) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenantIdOrSlug)
      .maybeSingle();

    if (tenant) {
      const res = await supabase
        .from('shop_subscriptions')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('status', 'ACTIVE')
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      data = res.data;
      error = res.error;
    }
  }

  if (error || !data) return null;

  // Validate active window
  if (!isSubscriptionActive(data.status, data.expires_at)) {
    return null;
  }

  return data as ShopSubscription;
}

/**
 * Advances the 30-day AI session quota reset window for a subscription.
 */
export async function renewPeriodQuota(
  subscriptionId: string,
  client?: SupabaseClient
): Promise<{ success: boolean; newPeriodEndsAt?: string; error?: string }> {
  const supabase = client || getSupabaseAdmin();

  const { data: sub, error: fetchErr } = await supabase
    .from('shop_subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .maybeSingle();

  if (fetchErr || !sub) {
    return { success: false, error: fetchErr?.message || 'Subscription not found' };
  }

  if (sub.status !== 'ACTIVE') {
    return { success: false, error: `Cannot renew period for non-active subscription (${sub.status})` };
  }

  const now = new Date();
  const nextPeriodStart = new Date(sub.current_period_ends_at || now);
  const nextPeriodEnd = new Date(nextPeriodStart.getTime() + 30 * 24 * 60 * 60 * 1000);

  const newPeriodStartsAt = formatWIBIsoString(nextPeriodStart);
  const newPeriodEndsAt = formatWIBIsoString(nextPeriodEnd);

  const { error: updateErr } = await supabase
    .from('shop_subscriptions')
    .update({
      current_period_starts_at: newPeriodStartsAt,
      current_period_ends_at: newPeriodEndsAt,
      updated_at: formatWIBIsoString(now),
    })
    .eq('id', subscriptionId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  // Sync tenant metadata
  const { data: tenant } = await supabase
    .from('tenants')
    .select('metadata')
    .eq('id', sub.tenant_id)
    .maybeSingle();

  if (tenant?.metadata?.subscription) {
    const updatedMeta = {
      ...tenant.metadata,
      subscription: {
        ...tenant.metadata.subscription,
        current_period_ends_at: newPeriodEndsAt,
      },
    };
    await supabase.from('tenants').update({ metadata: updatedMeta }).eq('id', sub.tenant_id);
  }

  return { success: true, newPeriodEndsAt };
}
