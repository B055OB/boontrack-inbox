/**
 * @file lib/entitlements/studio-guard.ts
 * @description Studio Intelligence Entitlement Guard & Capability Verification (CTO Mandate)
 * Enforces strict feature boundaries:
 * - VIRAL_TRENDS_RADAR: Pro Scale / Enterprise or explicitly enabled tenants.
 * - PAID_ADS_INTELLIGENCE: HOLD status per CTO Mandate (Contract-only, disabled by default).
 * - Domain Error: 403 FEATURE_NOT_ENTITLED.
 */

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { StudioCapability, StudioCapabilityType } from '@/lib/types/tenant-runtime';
import { isValidUuid } from '@/lib/uuid-guard';

export class StudioEntitlementError extends Error {
  readonly statusCode: number = 403;
  readonly code: string = 'FEATURE_NOT_ENTITLED';
  readonly capability: StudioCapabilityType;
  readonly tenantId: string;

  constructor(message: string, capability: StudioCapabilityType, tenantId: string) {
    super(message);
    this.name = 'StudioEntitlementError';
    this.capability = capability;
    this.tenantId = tenantId;
  }
}

export interface EntitlementCheckResult {
  entitled: boolean;
  tenant?: any;
  reason?: string;
}

/**
 * Checks whether a tenant is entitled to a specific Studio Intelligence capability.
 * Does NOT throw; returns structured result.
 */
export async function checkStudioIntelligenceEntitled(
  tenantIdOrSlug: string,
  capability: StudioCapabilityType
): Promise<EntitlementCheckResult> {
  if (!tenantIdOrSlug || typeof tenantIdOrSlug !== 'string' || !tenantIdOrSlug.trim()) {
    return {
      entitled: false,
      reason: 'Tenant identifier is required.',
    };
  }

  const cleanId = tenantIdOrSlug.trim();
  const supabase = getSupabaseAdmin() || getSupabase();

  if (!supabase) {
    return {
      entitled: false,
      reason: 'Database client unavailable.',
    };
  }

  try {
    let query = supabase
      .from('tenants')
      .select('id, slug, tier, status, is_active, metadata, tenant_kind');

    if (isValidUuid(cleanId)) {
      query = query.eq('id', cleanId);
    } else {
      query = query.eq('slug', cleanId.toLowerCase());
    }

    const { data: tenant, error } = await query.maybeSingle();

    if (error || !tenant) {
      return {
        entitled: false,
        reason: 'Tenant not found.',
      };
    }

    // Status suspension guard
    const status = String(tenant.status || 'active').toLowerCase();
    if (status === 'suspended' || status === 'expired' || tenant.is_active === false) {
      return {
        entitled: false,
        tenant,
        reason: 'Tenant is not active or suspended.',
      };
    }

    const meta = (tenant.metadata && typeof tenant.metadata === 'object') ? tenant.metadata : {};
    const features = (meta.features && typeof meta.features === 'object') ? meta.features : {};
    const studioWorkspace = (meta.studio_workspace && typeof meta.studio_workspace === 'object') ? meta.studio_workspace : {};
    const studioFeatures = (studioWorkspace.features && typeof studioWorkspace.features === 'object') ? studioWorkspace.features : {};

    // Check specific capability rules
    if (capability === StudioCapability.PAID_ADS_INTELLIGENCE) {
      // Strict HOLD: Only allow if explicitly granted in features
      const explicitGrant = Boolean(features.PAID_ADS_INTELLIGENCE || features.paid_ads_intelligence || studioFeatures.PAID_ADS_INTELLIGENCE);
      if (!explicitGrant) {
        return {
          entitled: false,
          tenant,
          reason: 'Paid Ads Intelligence is currently on HOLD per architecture specification §54.',
        };
      }
      return { entitled: true, tenant };
    }

    if (capability === StudioCapability.VIRAL_TRENDS_RADAR) {
      // 1. Explicit feature flag in tenant metadata
      if (
        features.VIRAL_TRENDS_RADAR === true ||
        features.viral_trends_radar === true ||
        studioFeatures.VIRAL_TRENDS_RADAR === true ||
        studioFeatures.viral_trends_radar === true
      ) {
        return { entitled: true, tenant };
      }

      // 2. High Tier entitlement (PRO_SCALE, ENTERPRISE, TEAM_SCALE, ADS_PERFORMANCE)
      const tier = String(tenant.tier || meta.tier || meta.plan_tier || '').toUpperCase();
      const entitledTiers = ['PRO_SCALE', 'ENTERPRISE', 'TEAM_SCALE', 'ADS_PERFORMANCE'];
      if (entitledTiers.includes(tier)) {
        return { entitled: true, tenant };
      }

      // 3. Active studio tenant workspace
      if ((tenant as any).tenant_kind === 'studio' && (status === 'active' || meta.verification_status === 'SUCCESS')) {
        return { entitled: true, tenant };
      }

      return {
        entitled: false,
        tenant,
        reason: `Tier "${tier || 'FREE'}" is not entitled to Viral Trends Radar. Upgrade to Pro Scale or Enterprise required.`,
      };
    }

    return {
      entitled: false,
      tenant,
      reason: `Unknown or unsupported capability: ${capability}`,
    };
  } catch (err: any) {
    return {
      entitled: false,
      reason: err?.message || 'Error evaluating studio entitlement.',
    };
  }
}

/**
 * Asserts that a tenant is entitled to a specific Studio Intelligence capability.
 * Throws 403 FEATURE_NOT_ENTITLED StudioEntitlementError if unauthorized.
 */
export async function assertStudioIntelligenceEntitled(
  tenantIdOrSlug: string,
  capability: StudioCapabilityType
): Promise<any> {
  const result = await checkStudioIntelligenceEntitled(tenantIdOrSlug, capability);

  if (!result.entitled) {
    const message = result.reason || `Akses fitur ${capability} ditolak untuk tenant ini. (403 FEATURE_NOT_ENTITLED)`;
    throw new StudioEntitlementError(message, capability, tenantIdOrSlug);
  }

  return result.tenant;
}
