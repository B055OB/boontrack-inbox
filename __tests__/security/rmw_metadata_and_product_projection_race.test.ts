/**
 * ==============================================================================
 * Test Suite: __tests__/security/rmw_metadata_and_product_projection_race.test.ts
 * Description: Two-way concurrency race regression tests and ADR-P0-07 Single-Writer
 *              projection clobber guard verification.
 * Authority: CTO Directive WS-02 (21 November 2026)
 * ==============================================================================
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { updateTenantWithOccCas, TenantOccRecord } from '@/lib/tenants/atomic-tenant-metadata-writer';

describe('RMW METADATA & PRODUCT PROJECTION TWO-WAY CONCURRENCY & CLOBBER GUARD', () => {
  let mockDbState: {
    tenants: Record<string, TenantOccRecord>;
  };

  const TENANT_ID = '00000000-0000-4000-a000-000000000001';
  const T0 = '2026-11-20T10:00:00.000Z';
  const T1 = '2026-11-20T10:00:01.000Z';
  const T2 = '2026-11-20T10:00:02.000Z';

  const P1 = { id: 'prod-uuid-1', name: 'Shabu Special Beef', price: 125000, slug: 'shabu-beef' };
  const P2 = { id: 'prod-uuid-2', name: 'Wagyu A5 Slice', price: 250000, slug: 'wagyu-a5' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDbState = {
      tenants: {
        [TENANT_ID]: {
          id: TENANT_ID,
          slug: 'shabu-ajhi',
          name: 'Shabu Ajhi Express',
          tier: 'PRO_SCALE',
          status: 'ACTIVE',
          is_active: true,
          metadata: {
            visual_theme: 'clean_minimal',
            products: [P1],
          },
          updated_at: T0,
        },
      },
    };
  });

  /**
   * Builds a mock Supabase admin client backed by in-memory `mockDbState`
   * that faithfully simulates real Postgres CAS matching on `.eq('id').eq('updated_at')`.
   */
  function createMockSupabaseAdmin(interceptor?: {
    onBeforeCasUpdate?: (attempt: number, currentState: TenantOccRecord) => Promise<void> | void;
  }) {
    let callAttempt = 0;

    return {
      from: (table: string) => {
        if (table !== 'tenants') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select: (cols: string) => ({
            eq: (col: string, val: string) => ({
              maybeSingle: async () => {
                const tenant = mockDbState.tenants[val] || Object.values(mockDbState.tenants).find((t) => t.slug === val);
                if (!tenant) return { data: null, error: null };
                // Return a deep clone to simulate isolated database snapshot
                return {
                  data: JSON.parse(JSON.stringify(tenant)),
                  error: null,
                };
              },
            }),
          }),
          update: (payload: any) => {
            let filterId: string | null = null;
            let filterUpdatedAt: string | null = null;

            const chain: any = {
              eq: (col: string, val: string) => {
                if (col === 'id') filterId = val;
                if (col === 'updated_at') filterUpdatedAt = val;
                return chain;
              },
              select: () => chain,
              then: async (resolve: (val: any) => void) => {
                callAttempt++;

                // Hook to simulate race conditions before CAS executes
                if (interceptor?.onBeforeCasUpdate && filterId && mockDbState.tenants[filterId]) {
                  await interceptor.onBeforeCasUpdate(callAttempt, mockDbState.tenants[filterId]);
                }

                const currentRecord = filterId ? mockDbState.tenants[filterId] : null;

                // If no record exists or updated_at does not match, CAS fails with 0 affected rows
                if (!currentRecord || (filterUpdatedAt && currentRecord.updated_at !== filterUpdatedAt)) {
                  return resolve({
                    data: [], // 0 rows updated (CAS conflict)
                    error: null,
                  });
                }

                // CAS succeeds: mutate database state
                const updatedRecord: TenantOccRecord = {
                  ...currentRecord,
                  ...payload,
                  metadata: {
                    ...(currentRecord.metadata || {}),
                    ...(payload.metadata || {}),
                  },
                  updated_at: payload.updated_at || new Date().toISOString(),
                };
                mockDbState.tenants[filterId!] = updatedRecord;

                return resolve({
                  data: [JSON.parse(JSON.stringify(updatedRecord))],
                  error: null,
                });
              },
            };

            return chain;
          },
        };
      },
    };
  }

  describe('Scenario 1: Canonical Product Projection commits while Metadata Writer is mid-flight', () => {
    it('detects CAS conflict on attempt 1, retries, and preserves projected products [P1, P2]', async () => {
      let projectionCommitted = false;

      // Interceptor: Before the metadata writer's CAS attempt 1 executes,
      // simulate canonical product projection committing at T1 with [P1, P2]
      const supabaseAdmin = createMockSupabaseAdmin({
        onBeforeCasUpdate: async (attempt, currentDbRecord) => {
          if (attempt === 1 && !projectionCommitted) {
            // Concurrently commit canonical product projection to database
            mockDbState.tenants[TENANT_ID] = {
              ...currentDbRecord,
              metadata: {
                ...currentDbRecord.metadata,
                products: [P1, P2], // New product P2 projected!
              },
              updated_at: T1,
            };
            projectionCommitted = true;
          }
        },
      });

      // Metadata writer updates visual theme to 'warm_culinary'
      const result = await updateTenantWithOccCas(
        supabaseAdmin,
        TENANT_ID,
        (freshTenant) => ({
          metadata: {
            ...freshTenant.metadata,
            visual_theme: 'warm_culinary',
          },
        }),
        { initialBackoffMs: 5 }
      );

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2); // Attempt 1 conflicted, Attempt 2 succeeded

      // Verify the final database state in mockDbState
      const finalTenant = mockDbState.tenants[TENANT_ID];
      expect(finalTenant.updated_at).not.toBe(T0);
      expect(finalTenant.updated_at).not.toBe(T1);

      // Verify BOTH mutations are preserved:
      // 1. Metadata writer's theme setting
      expect(finalTenant.metadata?.visual_theme).toBe('warm_culinary');
      // 2. Canonical product projection's products [P1, P2]
      expect(finalTenant.metadata?.products).toHaveLength(2);
      expect(finalTenant.metadata?.products[0].slug).toBe('shabu-beef');
      expect(finalTenant.metadata?.products[1].slug).toBe('wagyu-a5');
    });
  });

  describe('Scenario 2: Metadata Writer commits while Canonical Product Projection is mid-flight', () => {
    it('projection detects CAS conflict on attempt 1, retries, and preserves updated metadata', async () => {
      let metadataWriterCommitted = false;

      const supabaseAdmin = createMockSupabaseAdmin({
        onBeforeCasUpdate: async (attempt, currentDbRecord) => {
          if (attempt === 1 && !metadataWriterCommitted) {
            // Concurrently commit metadata writer changes to database
            mockDbState.tenants[TENANT_ID] = {
              ...currentDbRecord,
              metadata: {
                ...currentDbRecord.metadata,
                visual_theme: 'dark_luxe',
                contact_whatsapp: '081299998888',
              },
              updated_at: T1,
            };
            metadataWriterCommitted = true;
          }
        },
      });

      // Product projection CAS writer (allowProductsProjection: true)
      const projectionResult = await updateTenantWithOccCas(
        supabaseAdmin,
        TENANT_ID,
        (freshTenant) => {
          const currentProducts = freshTenant.metadata?.products || [];
          return {
            metadata: {
              ...freshTenant.metadata,
              products: [...currentProducts, P2],
            },
          };
        },
        { allowProductsProjection: true, initialBackoffMs: 5 }
      );

      expect(projectionResult.success).toBe(true);
      expect(projectionResult.attempts).toBe(2);

      const finalTenant = mockDbState.tenants[TENANT_ID];
      // Verify BOTH mutations survived without clobber:
      expect(finalTenant.metadata?.visual_theme).toBe('dark_luxe');
      expect(finalTenant.metadata?.contact_whatsapp).toBe('081299998888');
      expect(finalTenant.metadata?.products).toHaveLength(2);
      expect(finalTenant.metadata?.products[1].slug).toBe('wagyu-a5');
    });
  });

  describe('Scenario 3: ADR-P0-07 Single-Writer Clobber Guard Invariant', () => {
    it('strictly preserves freshTenant.metadata.products when non-canonical writer passes rogue products', async () => {
      const supabaseAdmin = createMockSupabaseAdmin();

      // Rogue / non-canonical writer tries to overwrite products with empty array
      const rogueResult = await updateTenantWithOccCas(
        supabaseAdmin,
        TENANT_ID,
        (freshTenant) => ({
          metadata: {
            ...freshTenant.metadata,
            settings_saved: true,
            products: [], // Rogue attempt to wipe products!
          },
        }),
        { allowProductsProjection: false } // Default / non-canonical
      );

      expect(rogueResult.success).toBe(true);

      const finalTenant = mockDbState.tenants[TENANT_ID];
      expect(finalTenant.metadata?.settings_saved).toBe(true);
      // Products must remain untouched!
      expect(finalTenant.metadata?.products).toEqual([P1]);
      expect(finalTenant.metadata?.products).toHaveLength(1);
    });

    it('allows product mutations only when allowProductsProjection === true (canonical product writer / seed service)', async () => {
      const supabaseAdmin = createMockSupabaseAdmin();

      const seedResult = await updateTenantWithOccCas(
        supabaseAdmin,
        TENANT_ID,
        (freshTenant) => ({
          metadata: {
            ...freshTenant.metadata,
            products: [P1, P2],
          },
        }),
        { allowProductsProjection: true }
      );

      expect(seedResult.success).toBe(true);

      const finalTenant = mockDbState.tenants[TENANT_ID];
      expect(finalTenant.metadata?.products).toEqual([P1, P2]);
      expect(finalTenant.metadata?.products).toHaveLength(2);
    });
  });
});
