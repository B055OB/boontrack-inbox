/**
 * DETERMINISTIC DRY-RUN RECONCILIATION ENGINE (ADR-P0-07)
 *
 * Implements a read-only, synthetic reconciliation tool covering all 10 conflict classes
 * without mutating any real database.
 *
 * Strict Compliance:
 * - O-01 Option B: Metadata-only legacy records are tagged LEGACY_REVIEW_REQUIRED; zero auto-backfill.
 * - O-02 Option B: Slug collisions between SQL and legacy fail closed with merchant review required.
 * - O-03 Option A: Canonical SQL rows drive derived projection to metadata; bulky custom_html stripped.
 */

import { UUID_RE, projectSqlRowToMetadataItem } from './canonical-product-writer';

export type ConflictClassType =
  | 'CLASS_1_CANONICAL_SYNC'
  | 'CLASS_2_METADATA_ONLY_LEGACY'
  | 'CLASS_3_SQL_ONLY_MODERN'
  | 'CLASS_4_SLUG_COLLISION'
  | 'CLASS_5_COMMERCIAL_DIVERGENCE'
  | 'CLASS_6_INVENTORY_FULFILLMENT_DIVERGENCE'
  | 'CLASS_7_CROSS_TENANT_VIOLATION'
  | 'CLASS_8_CORRUPTED_IDENTIFIER'
  | 'CLASS_9_CUSTOM_HTML_METADATA_BLOAT'
  | 'CLASS_10_STATUS_INCONSISTENCY';

export interface ReconciliationFinding {
  conflictClass: ConflictClassType;
  productId: string;
  slug: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  description: string;
  sqlSnapshot?: Record<string, any> | null;
  metadataSnapshot?: Record<string, any> | null;
  proposedAction: string;
  failClosedRequired: boolean;
}

export interface ReconciliationManifest {
  tenantId: string;
  tenantSlug: string;
  generatedAt: string;
  totalSqlProducts: number;
  totalMetadataProducts: number;
  findings: ReconciliationFinding[];
  summary: {
    inSync: number;
    legacyReviewRequired: number;
    projectionMissing: number;
    slugCollisions: number;
    commercialDivergences: number;
    fulfillmentDivergences: number;
    crossTenantViolations: number;
    corruptedIdentifiers: number;
    customHtmlBloat: number;
    statusInconsistencies: number;
    totalActionableIssues: number;
  };
  syntheticProjectedMetadata: any[];
}

export interface DryRunReconciliationInput {
  tenantId: string;
  tenantSlug: string;
  sqlProducts: any[];
  metadataProducts: any[];
}

/**
 * Deterministically analyzes SQL rows and Metadata arrays for a tenant,
 * classifying every record into one of the 10 conflict classes without DB mutations.
 */
export function executeDryRunReconciliation(
  input: DryRunReconciliationInput
): ReconciliationManifest {
  const { tenantId, tenantSlug, sqlProducts, metadataProducts } = input;
  const findings: ReconciliationFinding[] = [];

  const sqlById = new Map<string, any>();
  const sqlBySlug = new Map<string, any>();
  const sqlBySku = new Map<string, any>();

  for (const sp of sqlProducts) {
    if (!sp) continue;
    const sId = String(sp.id || '');
    const sSlug = String(sp.slug || '').toLowerCase();
    const sSku = sp.sku ? String(sp.sku).toLowerCase() : '';

    if (sId) sqlById.set(sId, sp);
    if (sSlug) sqlBySlug.set(sSlug, sp);
    if (sSku) sqlBySku.set(sSku, sp);
  }

  const processedMetaIndices = new Set<number>();
  const matchedSqlIds = new Set<string>();

  // ── PASS 1: INSPECT METADATA PRODUCTS & CROSS-REFERENCE SQL ──
  metadataProducts.forEach((mp: any, idx: number) => {
    if (!mp || typeof mp !== 'object') return;
    processedMetaIndices.add(idx);

    const mId = String(mp.id || '');
    const mSlug = String(mp.slug || '').toLowerCase();
    const hasValidUuid = UUID_RE.test(mId);

    // Class 7: Cross-Tenant Ownership Violation
    if (mp.tenant_id && mp.tenant_id !== tenantId) {
      findings.push({
        conflictClass: 'CLASS_7_CROSS_TENANT_VIOLATION',
        productId: mId,
        slug: mSlug,
        severity: 'CRITICAL',
        description: `Metadata product carries tenant_id "${mp.tenant_id}" diverging from tenant context "${tenantId}".`,
        metadataSnapshot: mp,
        proposedAction: 'REJECT_CROSS_TENANT_LEAK: Discard from tenant catalog immediately.',
        failClosedRequired: true,
      });
      return;
    }

    // Class 8: Corrupted / Non-UUID Identifier
    if (!mId || !hasValidUuid) {
      // Check if it matches a SQL product by slug
      const sqlMatchBySlug = mSlug ? sqlBySlug.get(mSlug) : null;
      if (!sqlMatchBySlug) {
        findings.push({
          conflictClass: 'CLASS_8_CORRUPTED_IDENTIFIER',
          productId: mId || `index-${idx}`,
          slug: mSlug,
          severity: 'ERROR',
          description: `Metadata product has non-UUID identifier "${mId}". No matching relational row exists.`,
          metadataSnapshot: mp,
          proposedAction: 'FLAG_INVALID_IDENTIFIER: Requires merchant dashboard review; cannot auto-mint UUID in read path.',
          failClosedRequired: true,
        });
        return;
      }
    }

    // Try finding corresponding SQL row
    const sqlMatchById = mId ? sqlById.get(mId) : null;
    const sqlMatchBySlug = mSlug ? sqlBySlug.get(mSlug) : null;

    // Class 4: Slug Collision Between Relational and Legacy (O-02 Option B)
    if (sqlMatchBySlug && String(sqlMatchBySlug.id) !== mId) {
      findings.push({
        conflictClass: 'CLASS_4_SLUG_COLLISION',
        productId: mId,
        slug: mSlug,
        severity: 'ERROR',
        description: `Slug "${mSlug}" collides between SQL product ID "${sqlMatchBySlug.id}" and metadata product ID "${mId}".`,
        sqlSnapshot: sqlMatchBySlug,
        metadataSnapshot: mp,
        proposedAction: 'FAIL_CLOSED_MERCHANT_REVIEW: Relational SQL retains slug; legacy metadata product flagged for review.',
        failClosedRequired: true,
      });
      matchedSqlIds.add(String(sqlMatchBySlug.id));
      if (sqlMatchById) matchedSqlIds.add(String(sqlMatchById.id));
      return;
    }

    const matchedSql = sqlMatchById || sqlMatchBySlug;

    // Class 2: Metadata-Only Legacy Record (O-01 Option B)
    if (!matchedSql) {
      findings.push({
        conflictClass: 'CLASS_2_METADATA_ONLY_LEGACY',
        productId: mId,
        slug: mSlug,
        severity: 'WARNING',
        description: `Product exists only in metadata. No corresponding row in public.products.`,
        metadataSnapshot: mp,
        proposedAction: 'TAG_LEGACY_REVIEW_REQUIRED: Unpurchasable in checkout; require merchant explicit save in dashboard.',
        failClosedRequired: true,
      });
      return;
    }

    matchedSqlIds.add(String(matchedSql.id));

    // Class 9: Custom HTML Bloat in Metadata
    const hasBulkyHtmlInMeta = Boolean(
      mp.custom_html ||
      mp.single_page_config?.custom_html ||
      mp.fulfillment_metadata?.single_page_config?.custom_html
    );
    if (hasBulkyHtmlInMeta) {
      findings.push({
        conflictClass: 'CLASS_9_CUSTOM_HTML_METADATA_BLOAT',
        productId: mId,
        slug: mSlug,
        severity: 'WARNING',
        description: `Metadata product contains bulky custom_html. Single source of truth is relational fulfillment_metadata.`,
        sqlSnapshot: matchedSql,
        metadataSnapshot: mp,
        proposedAction: 'STRIP_METADATA_HTML: Remove custom_html from metadata projection; keep in SQL table.',
        failClosedRequired: false,
      });
    }

    // Class 10: Status / Active Inconsistency
    const sqlIsActive = matchedSql.is_active !== false && !['draft', 'hidden', 'archived', 'inactive', 'sembunyi'].includes(String(matchedSql.status || '').toLowerCase());
    const metaIsActive = mp.is_active !== false && !['draft', 'hidden', 'archived', 'inactive', 'sembunyi'].includes(String(mp.status || '').toLowerCase());
    if (sqlIsActive !== metaIsActive) {
      findings.push({
        conflictClass: 'CLASS_10_STATUS_INCONSISTENCY',
        productId: matchedSql.id,
        slug: matchedSql.slug,
        severity: 'WARNING',
        description: `Status mismatch: SQL is_active=${sqlIsActive}, metadata is_active=${metaIsActive}. SQL strictly wins.`,
        sqlSnapshot: matchedSql,
        metadataSnapshot: mp,
        proposedAction: 'ALIGN_TO_SQL_STATUS: Override metadata active state with SQL authoritative state.',
        failClosedRequired: false,
      });
    }

    // Class 5: Commercial Attribute Divergence (Price, Promo Price)
    const sqlPrice = Number(matchedSql.price) || 0;
    const metaPrice = Number(mp.price) || 0;
    const sqlPromoPrice = matchedSql.promo_price ? Number(matchedSql.promo_price) : 0;
    const metaPromoPrice = mp.promo_price ? Number(mp.promo_price) : 0;

    if (sqlPrice !== metaPrice || sqlPromoPrice !== metaPromoPrice) {
      findings.push({
        conflictClass: 'CLASS_5_COMMERCIAL_DIVERGENCE',
        productId: matchedSql.id,
        slug: matchedSql.slug,
        severity: 'ERROR',
        description: `Price divergence: SQL price=${sqlPrice} (promo=${sqlPromoPrice}) vs Metadata price=${metaPrice} (promo=${metaPromoPrice}). SQL strictly wins.`,
        sqlSnapshot: matchedSql,
        metadataSnapshot: mp,
        proposedAction: 'APPLY_SQL_PRICE_AUTHORITY: Overwrite metadata price with relational SQL snapshot.',
        failClosedRequired: false,
      });
    }

    // Class 6: Inventory & Fulfillment Divergence
    const sqlProductType = String(matchedSql.product_type || '').toUpperCase();
    const metaProductType = String(mp.product_type || mp.type || '').toUpperCase();
    const sqlRequiresShipping = Boolean(matchedSql.requires_shipping);
    const metaRequiresShipping = Boolean(mp.requires_shipping);

    if ((sqlProductType && metaProductType && sqlProductType !== metaProductType) || sqlRequiresShipping !== metaRequiresShipping) {
      findings.push({
        conflictClass: 'CLASS_6_INVENTORY_FULFILLMENT_DIVERGENCE',
        productId: matchedSql.id,
        slug: matchedSql.slug,
        severity: 'WARNING',
        description: `Fulfillment divergence: SQL (type=${sqlProductType}, ship=${sqlRequiresShipping}) vs Metadata (type=${metaProductType}, ship=${metaRequiresShipping}).`,
        sqlSnapshot: matchedSql,
        metadataSnapshot: mp,
        proposedAction: 'APPLY_SQL_FULFILLMENT_AUTHORITY: Overwrite metadata fulfillment settings with relational values.',
        failClosedRequired: false,
      });
    }

    // Class 1: Canonical Sync (If no errors or divergences were found)
    const hasDivergence = findings.some(f => f.productId === String(matchedSql.id) || f.slug === matchedSql.slug);
    if (!hasDivergence) {
      findings.push({
        conflictClass: 'CLASS_1_CANONICAL_SYNC',
        productId: matchedSql.id,
        slug: matchedSql.slug,
        severity: 'INFO',
        description: `SQL row and Metadata item are in complete canonical alignment.`,
        sqlSnapshot: matchedSql,
        metadataSnapshot: mp,
        proposedAction: 'NO_ACTION_REQUIRED: Fully synchronized.',
        failClosedRequired: false,
      });
    }
  });

  // ── PASS 2: INSPECT SQL-ONLY PRODUCTS (CLASS 3) ──
  for (const sp of sqlProducts) {
    if (!sp) continue;
    const sId = String(sp.id || '');
    if (!matchedSqlIds.has(sId)) {
      findings.push({
        conflictClass: 'CLASS_3_SQL_ONLY_MODERN',
        productId: sId,
        slug: sp.slug,
        severity: 'INFO',
        description: `Product exists in public.products but is missing from metadata projection.`,
        sqlSnapshot: sp,
        proposedAction: 'PROJECT_TO_METADATA: Generate clean derived projection in tenants.metadata.products.',
        failClosedRequired: false,
      });
    }
  }

  // ── BUILD SYNTHETIC PROJECTED METADATA (PURE FUNCTION — ZERO DB MUTATIONS) ──
  const syntheticProjectedMetadata = sqlProducts.map(sp => projectSqlRowToMetadataItem(sp)).filter(Boolean);

  // Summary counts
  const summary = {
    inSync: findings.filter(f => f.conflictClass === 'CLASS_1_CANONICAL_SYNC').length,
    legacyReviewRequired: findings.filter(f => f.conflictClass === 'CLASS_2_METADATA_ONLY_LEGACY').length,
    projectionMissing: findings.filter(f => f.conflictClass === 'CLASS_3_SQL_ONLY_MODERN').length,
    slugCollisions: findings.filter(f => f.conflictClass === 'CLASS_4_SLUG_COLLISION').length,
    commercialDivergences: findings.filter(f => f.conflictClass === 'CLASS_5_COMMERCIAL_DIVERGENCE').length,
    fulfillmentDivergences: findings.filter(f => f.conflictClass === 'CLASS_6_INVENTORY_FULFILLMENT_DIVERGENCE').length,
    crossTenantViolations: findings.filter(f => f.conflictClass === 'CLASS_7_CROSS_TENANT_VIOLATION').length,
    corruptedIdentifiers: findings.filter(f => f.conflictClass === 'CLASS_8_CORRUPTED_IDENTIFIER').length,
    customHtmlBloat: findings.filter(f => f.conflictClass === 'CLASS_9_CUSTOM_HTML_METADATA_BLOAT').length,
    statusInconsistencies: findings.filter(f => f.conflictClass === 'CLASS_10_STATUS_INCONSISTENCY').length,
    totalActionableIssues: findings.filter(f => f.conflictClass !== 'CLASS_1_CANONICAL_SYNC').length,
  };

  return {
    tenantId,
    tenantSlug,
    generatedAt: new Date().toISOString(),
    totalSqlProducts: sqlProducts.length,
    totalMetadataProducts: metadataProducts.length,
    findings,
    summary,
    syntheticProjectedMetadata,
  };
}
