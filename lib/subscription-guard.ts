import { NextResponse } from 'next/server';
import { getSupabase } from './supabaseClient';
import { normalizeTenantSlug } from './tenant-config';

export const SUBSCRIPTION_MUTATION_RESTRICTED_PAYLOAD = {
  error: 'SUBSCRIPTION_REQUIRED',
  message: 'Masa trial telah habis. Dashboard dalam mode baca-saja. Silakan lakukan upgrade paket untuk memperbarui toko.',
};

export interface MutationPermissionResult {
  allowed: boolean;
  response?: NextResponse;
  tenant?: any;
  reason?: string;
}

/**
 * Checks whether a tenant is permitted to perform mutation operations (POST/PUT/PATCH/DELETE).
 * If trial has expired or subscription is suspended, returns HTTP 403 Forbidden with exact required payload:
 * {"error": "SUBSCRIPTION_REQUIRED", "message": "Masa trial telah habis. Dashboard dalam mode baca-saja. Silakan lakukan upgrade paket untuk memperbarui toko."}
 * Zero hardcoding policy: Reads dynamically from Supabase database.
 */
export async function checkTenantMutationPermission(
  rawSlug: string
): Promise<MutationPermissionResult> {
  const slug = normalizeTenantSlug(rawSlug || '');
  if (!slug) {
    return {
      allowed: false,
      response: NextResponse.json(SUBSCRIPTION_MUTATION_RESTRICTED_PAYLOAD, { status: 403 }),
      reason: 'Tenant slug is empty',
    };
  }

  try {
    const supabase = getSupabase();
    if (!supabase) {
      return { allowed: true };
    }

    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('id, slug, tier, status, is_active, trial_ends_at, subscription_ends_at, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (error || !tenant) {
      // If tenant not found, let route handler handle 404
      return { allowed: true };
    }

    const tStatus = String(tenant.status || 'active').toLowerCase().trim();
    const isActive = tenant.is_active !== false;
    const meta = (tenant.metadata || {}) as Record<string, any>;
    const metaSubStatus = String(meta.subscription_status || '').toLowerCase().trim();

    // Check Special Grant (exempt from expiration)
    const subObj = meta.subscription;
    const isSpecialGrant = Boolean(
      subObj?.type === 'granted' ||
      subObj?.subscription_type === 'granted' ||
      subObj?.billing_cycle === 'grant' ||
      meta.subscription_type === 'granted' ||
      subObj?.is_grant === true
    );

    if (isSpecialGrant) {
      return { allowed: true, tenant };
    }

    let isExpired = false;

    // 1. Explicit status check
    if (
      tStatus === 'expired' ||
      tStatus === 'suspended' ||
      metaSubStatus === 'expired' ||
      metaSubStatus === 'suspended'
    ) {
      isExpired = true;
    } else if (!isActive) {
      isExpired = true;
    } else {
      const now = Date.now();
      const rawTrialEnds = tenant.trial_ends_at || meta.trial_ends_at;
      const rawSubEnds = tenant.subscription_ends_at || meta.subscription_ends_at;

      const isTrial = Boolean(
        tStatus === 'trial' ||
        metaSubStatus === 'trial' ||
        meta.is_trial ||
        rawTrialEnds
      );

      const trialEndsTime = rawTrialEnds ? new Date(rawTrialEnds).getTime() : null;
      const subEndsTime = rawSubEnds ? new Date(rawSubEnds).getTime() : null;

      if (isTrial && trialEndsTime) {
        if (now > trialEndsTime) {
          if (!subEndsTime || now > subEndsTime) {
            isExpired = true;
          }
        }
      }

      if (!isExpired && subEndsTime) {
        if (now > subEndsTime) {
          isExpired = true;
        }
      }
    }

    if (isExpired) {
      return {
        allowed: false,
        response: NextResponse.json(SUBSCRIPTION_MUTATION_RESTRICTED_PAYLOAD, { status: 403 }),
        tenant,
        reason: 'Subscription or trial expired',
      };
    }

    return { allowed: true, tenant };
  } catch (err) {
    console.warn('[MutationGuard] Permission check error:', err);
    return { allowed: true };
  }
}
