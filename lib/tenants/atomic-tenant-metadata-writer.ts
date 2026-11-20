/**
 * ==============================================================================
 * Module: lib/tenants/atomic-tenant-metadata-writer.ts
 * Description: Shared Optimistic Concurrency Control (OCC) Compare-And-Swap (CAS)
 *              metadata writer with ADR-P0-07 Single-Writer projection guard.
 * Authority: CTO Directive WS-02 (21 November 2026)
 * ==============================================================================
 */

export interface TenantOccRecord {
  id: string;
  slug?: string;
  name?: string;
  tier?: string;
  status?: string;
  is_active?: boolean;
  metadata: Record<string, any> | null;
  updated_at: string;
  [key: string]: any;
}

export interface TenantOccPatch {
  metadata?: Record<string, any>;
  [column: string]: any;
}

export interface TenantOccOptions {
  /**
   * Only lib/products/canonical-product-writer.ts may pass true.
   * If false/omitted, freshTenant.metadata.products is strictly preserved verbatim.
   */
  allowProductsProjection?: boolean;
  maxAttempts?: number;
  initialBackoffMs?: number;
  updatedAt?: string;
  selectColumns?: string;
}

export interface TenantOccResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  attempts?: number;
  updatedTenant?: any;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Executes a Compare-And-Swap (CAS) update on public.tenants with bounded exponential
 * backoff retry and Single-Writer projection protection (ADR-P0-07).
 */
export async function updateTenantWithOccCas(
  supabaseAdmin: any,
  tenantIdOrSlug: string,
  buildPatchFn: (freshTenant: TenantOccRecord) => Promise<TenantOccPatch | null> | TenantOccPatch | null,
  options: TenantOccOptions = {}
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

    // WS02-A Fail-Closed Guard: Require non-empty string updated_at version token
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

    // 3. ADR-P0-07 Single-Writer Projection Guard:
    // Strictly preserve freshTenant.metadata?.products unless options.allowProductsProjection === true
    const currentMeta =
      freshTenant.metadata && typeof freshTenant.metadata === 'object'
        ? { ...freshTenant.metadata }
        : {};

    const incomingMeta =
      patch.metadata && typeof patch.metadata === 'object'
        ? { ...patch.metadata }
        : { ...currentMeta };

    if (!options.allowProductsProjection) {
      if ('products' in currentMeta) {
        incomingMeta.products = currentMeta.products;
      } else {
        delete incomingMeta.products;
      }
    }

    const newUpdatedAt = options.updatedAt || new Date().toISOString();
    const updatePayload: Record<string, any> = {
      ...patch,
      metadata: incomingMeta,
      updated_at: newUpdatedAt,
    };

    // 4. Conditional CAS update (.eq('id', ...).eq('updated_at', ...).select(...))
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

    // 5. Evaluate CAS outcome (1 row updated = success; 0 rows = concurrent conflict; > 1 rows = invariant violation)
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
