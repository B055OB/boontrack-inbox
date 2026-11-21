/**
 * lib/products/internal-tenant-product-projector.ts
 * Dedicated Restricted Module for ADR-P0-07 Canonical Product Projection.
 *
 * STRICT PROJECTION CAPABILITY BOUNDARY:
 * Under ADR-P0-07 Single-Writer architecture, public.products is the sole authoritative
 * store for catalog products. Projection to tenants.metadata.products is a secondary derived cache.
 *
 * ALLOWLIST RESTRICTION:
 * This capability module is strictly restricted and may ONLY be imported by:
 * 1. lib/products/canonical-product-writer.ts (callerModule: 'canonical-product-writer')
 * 2. lib/services/onlineboost-seed.service.ts (callerModule: 'onlineboost-seed-service')
 *
 * Any attempt by general routes, merchant settings, storefront themes, shipping, or other services
 * to import or execute this projection helper is rejected at runtime (fail-closed) and blocked by the
 * AST CI scanner gate.
 */

import {
  _internalProjectProductsForProjector,
  type TenantOccRecord,
  type TenantOccPatch,
  type TenantOccResult,
  type TenantOccOptions,
} from '@/lib/tenants/atomic-tenant-metadata-writer';

export type ProjectionCallerModule =
  | 'canonical-product-writer'
  | 'onlineboost-seed-service';

export interface ProjectCanonicalProductsOptions extends TenantOccOptions {
  callerModule: ProjectionCallerModule;
}

const AUTHORIZED_CALLER_MODULES: ReadonlySet<string> = new Set([
  'canonical-product-writer',
  'onlineboost-seed-service',
]);

/**
 * Executes a Compare-And-Swap (CAS) update on public.tenants specifically for catalog product projection.
 * Requires callerModule to be explicitly passed and verified against the authorized set.
 */
export async function projectCanonicalProductsToTenantMetadata(
  supabaseAdmin: any,
  tenantIdOrSlug: string,
  buildPatchFn: (freshTenant: TenantOccRecord) => Promise<TenantOccPatch | null> | TenantOccPatch | null,
  options: ProjectCanonicalProductsOptions
): Promise<TenantOccResult> {
  const caller = options?.callerModule;
  if (!caller || !AUTHORIZED_CALLER_MODULES.has(caller)) {
    const errorMsg = `[SECURITY FATAL] Unauthorized callerModule '${caller}' attempted to invoke tenant product projection. Restricted to allowlist.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  return _internalProjectProductsForProjector(supabaseAdmin, tenantIdOrSlug, buildPatchFn, options);
}
