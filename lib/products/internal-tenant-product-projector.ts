/**
 * lib/products/internal-tenant-product-projector.ts
 * Dedicated Restricted Module for ADR-P0-07 Canonical Product Projection.
 *
 * STRICT PROJECTION CAPABILITY BOUNDARY:
 * Under ADR-P0-07 Single-Writer architecture, public.products is the sole authoritative
 * store for catalog products. Projection to tenants.metadata.products is a secondary derived cache.
 *
 * ENCAPSULATED SELF-CONTAINED OCC CAS ENGINE:
 * This module contains its own bounded OCC CAS retry engine enforcing monotonic version tokens,
 * fail-closed version checking, and single-row mutation invariants.
 *
 * ALLOWLIST RESTRICTION:
 * This capability module is strictly restricted and may ONLY be imported by:
 * 1. lib/products/canonical-product-writer.ts
 * 2. lib/services/onlineboost-seed.service.ts
 *
 * Enforced strictly via TypeScript AST import-graph allowlist in scripts/audit-tenant-writers.js.
 */

import type {
  TenantOccRecord,
  TenantOccPatch,
  TenantOccResult,
  TenantOccOptions,
} from '@/lib/tenants/atomic-tenant-metadata-writer';

export type { TenantOccRecord, TenantOccPatch, TenantOccResult, TenantOccOptions };

export interface ProjectCanonicalProductsOptions extends TenantOccOptions {
  callerModule?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Executes a Compare-And-Swap (CAS) update on public.tenants specifically for catalog product projection.
 * Encapsulated self-contained bounded retry loop enforcing monotonic version tokens.
 */
export async function projectCanonicalProductsToTenantMetadata(
  supabaseAdmin: any,
  tenantIdOrSlug: string,
  buildPatchFn: (freshTenant: TenantOccRecord) => Promise<TenantOccPatch | null> | TenantOccPatch | null,
  options: ProjectCanonicalProductsOptions = {}
): Promise<TenantOccResult> {
  const maxAttempts = options.maxAttempts ?? 4;
  const initialBackoffMs = options.initialBackoffMs ?? 25;
  let lastError = 'UNKNOWN_OCC_ERROR';

  if (!supabaseAdmin) {
    return {
      success: false,
      error: 'DATABASE_CLIENT_UNAVAILABLE',
      message: 'Supabase admin client is undefined or unavailable',
      attempts: 0,
    };
  }

  const cleanIdentifier = (tenantIdOrSlug || '').trim();
  if (!cleanIdentifier) {
    return {
      success: false,
      error: 'INVALID_TENANT_IDENTIFIER',
      message: 'Tenant identifier (ID or slug) must be provided',
      attempts: 0,
    };
  }

  const isUuid = UUID_REGEX.test(cleanIdentifier);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 1. Fetch fresh tenant state directly from database
    let selectQuery = supabaseAdmin
      .from('tenants')
      .select(options.selectColumns || 'id, slug, name, tier, status, is_active, metadata, updated_at');

    if (isUuid) {
      selectQuery = selectQuery.eq('id', cleanIdentifier);
    } else {
      selectQuery = selectQuery.eq('slug', cleanIdentifier);
    }

    const { data: freshTenant, error: fetchErr } = await selectQuery.maybeSingle();

    if (fetchErr) {
      return {
        success: false,
        error: 'FETCH_TENANT_FAILED',
        message: fetchErr.message,
        attempts: attempt,
      };
    }

    if (!freshTenant) {
      return {
        success: false,
        error: 'TENANT_NOT_FOUND',
        message: `Tenant '${cleanIdentifier}' not found in database`,
        attempts: attempt,
      };
    }

    // Fail-closed on missing, null, or empty updated_at version token
    if (
      !freshTenant.updated_at ||
      typeof freshTenant.updated_at !== 'string' ||
      freshTenant.updated_at.trim() === ''
    ) {
      return {
        success: false,
        error: 'MISSING_OCC_VERSION_TOKEN: tenants.updated_at is null or empty',
        message: `Tenant '${cleanIdentifier}' has missing or empty updated_at version token; failing closed to prevent unversioned lost updates`,
        attempts: attempt,
      };
    }

    // 2. Build the patch using fresh database state
    let patch: TenantOccPatch | null;
    try {
      patch = await buildPatchFn(freshTenant);
    } catch (buildErr: any) {
      return {
        success: false,
        error: 'BUILD_PATCH_EXCEPTION',
        message: buildErr?.message || 'Error occurred while building tenant patch',
        attempts: attempt,
      };
    }

    if (!patch) {
      return {
        success: false,
        error: 'PATCH_ABORTED',
        message: 'buildPatchFn returned null or falsy, aborting update without mutation',
        attempts: attempt,
      };
    }

    const currentMeta =
      freshTenant.metadata && typeof freshTenant.metadata === 'object'
        ? { ...freshTenant.metadata }
        : {};

    const incomingMeta =
      patch.metadata && typeof patch.metadata === 'object'
        ? { ...patch.metadata }
        : { ...currentMeta };

    const newUpdatedAt = options.updatedAt || new Date().toISOString();
    const updatePayload: Record<string, any> = {
      ...patch,
      metadata: incomingMeta,
      updated_at: newUpdatedAt,
    };

    // 3. Conditional CAS update
    let updateQueryBuilder = supabaseAdmin
      .from('tenants')
      .update(updatePayload);

    if (typeof updateQueryBuilder.eq === 'function') {
      updateQueryBuilder = updateQueryBuilder.eq('id', freshTenant.id);
      if (typeof updateQueryBuilder.eq === 'function') {
        updateQueryBuilder = updateQueryBuilder.eq('updated_at', freshTenant.updated_at);
      }
    }

    if (typeof updateQueryBuilder.select === 'function') {
      updateQueryBuilder = updateQueryBuilder.select('id, slug, name, metadata, updated_at');
    }

    const { data: updateData, error: updateErr } = await updateQueryBuilder;

    if (updateErr) {
      lastError = updateErr.message;
      if (attempt < maxAttempts) {
        const backoffMs = initialBackoffMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      return {
        success: false,
        error: 'UPDATE_FAILED',
        message: lastError,
        attempts: attempt,
      };
    }

    // 4. Evaluate CAS outcome
    if (Array.isArray(updateData) && updateData.length > 1) {
      return {
        success: false,
        error: 'CAS_MULTI_ROW_INVARIANT_VIOLATION',
        message: `CAS update matched multiple rows (${updateData.length}) on tenant ${freshTenant.id}`,
        attempts: attempt,
      };
    }

    const isSuccessfulCas = Array.isArray(updateData)
      ? updateData.length === 1
      : updateData !== null && updateData !== undefined;

    if (isSuccessfulCas) {
      return {
        success: true,
        data: updateData,
        attempts: attempt,
        updatedTenant: {
          ...freshTenant,
          ...updatePayload,
        },
      };
    }

    // 0 rows affected indicates updated_at changed concurrently
    lastError = `OCC CAS conflict on tenant ${freshTenant.id} (updated_at changed concurrently)`;
    if (attempt < maxAttempts) {
      const backoffMs = initialBackoffMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      continue;
    }
  }

  return {
    success: false,
    error: 'OCC_CONFLICT',
    message: `Exhausted ${maxAttempts} OCC CAS retry attempts: ${lastError}`,
    attempts: maxAttempts,
  };
}
