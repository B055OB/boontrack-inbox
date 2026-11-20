/**
 * TEST SUITE 3: DETERMINISTIC DRY-RUN RECONCILIATION ENGINE (ADR-P0-07)
 *
 * Verifies all 10 conflict classes:
 * 1. CLASS_1_CANONICAL_SYNC: Identical SQL and metadata state.
 * 2. CLASS_2_METADATA_ONLY_LEGACY: Record in metadata only -> LEGACY_REVIEW_REQUIRED.
 * 3. CLASS_3_SQL_ONLY_MODERN: Record in SQL only -> project to metadata.
 * 4. CLASS_4_SLUG_COLLISION: SQL & metadata share slug with different IDs -> fail closed.
 * 5. CLASS_5_COMMERCIAL_DIVERGENCE: Price mismatch -> SQL strictly wins.
 * 6. CLASS_6_INVENTORY_FULFILLMENT_DIVERGENCE: Product type / shipping mismatch -> SQL wins.
 * 7. CLASS_7_CROSS_TENANT_VIOLATION: Metadata carries foreign tenant_id -> reject leak.
 * 8. CLASS_8_CORRUPTED_IDENTIFIER: Non-UUID ID without SQL match -> flag invalid.
 * 9. CLASS_9_CUSTOM_HTML_METADATA_BLOAT: Custom HTML in metadata -> strip from projection.
 * 10. CLASS_10_STATUS_INCONSISTENCY: Active / inactive mismatch -> SQL strictly wins.
 */

import { executeDryRunReconciliation } from '@/lib/products/reconciliation-dry-run';

describe('ADR-P0-07: DETERMINISTIC DRY-RUN RECONCILIATION (ALL 10 CONFLICT CLASSES)', () => {
  const tenantId = '00000000-0000-4000-8000-000000000001';
  const tenantSlug = 'shop-dry-run';

  it('Class 1: Detects perfect canonical sync when SQL and metadata are identical', () => {
    const sqlProduct = {
      id: '11111111-1111-4111-8111-111111111111',
      tenant_id: tenantId,
      title: 'Ebook React',
      slug: 'ebook-react',
      price: 150000,
      is_active: true,
      category: 'digital',
      product_type: 'DIGITAL_FILE',
      requires_shipping: false,
    };

    const metaProduct = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Ebook React',
      slug: 'ebook-react',
      price: 150000,
      is_active: true,
      category: 'digital',
      product_type: 'DIGITAL_FILE',
      requires_shipping: false,
    };

    const manifest = executeDryRunReconciliation({
      tenantId,
      tenantSlug,
      sqlProducts: [sqlProduct],
      metadataProducts: [metaProduct],
    });

    expect(manifest.summary.inSync).toBe(1);
    expect(manifest.summary.totalActionableIssues).toBe(0);
    const syncFinding = manifest.findings.find(f => f.conflictClass === 'CLASS_1_CANONICAL_SYNC');
    expect(syncFinding).toBeDefined();
    expect(syncFinding?.failClosedRequired).toBe(false);
  });

  it('Class 2: Tags metadata-only records as LEGACY_REVIEW_REQUIRED (O-01 Option B)', () => {
    const metaProduct = {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Produk Lama Banget',
      slug: 'produk-lama-banget',
      price: 50000,
      is_active: true,
    };

    const manifest = executeDryRunReconciliation({
      tenantId,
      tenantSlug,
      sqlProducts: [], // Empty SQL table!
      metadataProducts: [metaProduct],
    });

    expect(manifest.summary.legacyReviewRequired).toBe(1);
    const finding = manifest.findings.find(f => f.conflictClass === 'CLASS_2_METADATA_ONLY_LEGACY');
    expect(finding).toBeDefined();
    expect(finding?.failClosedRequired).toBe(true);
    expect(finding?.proposedAction).toContain('TAG_LEGACY_REVIEW_REQUIRED');
  });

  it('Class 3: Identifies SQL-only modern records requiring metadata projection', () => {
    const sqlProduct = {
      id: '33333333-3333-4333-8333-333333333333',
      tenant_id: tenantId,
      title: 'Produk Baru SQL',
      slug: 'produk-baru-sql',
      price: 200000,
      is_active: true,
    };

    const manifest = executeDryRunReconciliation({
      tenantId,
      tenantSlug,
      sqlProducts: [sqlProduct],
      metadataProducts: [], // Empty metadata!
    });

    expect(manifest.summary.projectionMissing).toBe(1);
    const finding = manifest.findings.find(f => f.conflictClass === 'CLASS_3_SQL_ONLY_MODERN');
    expect(finding).toBeDefined();
    expect(finding?.proposedAction).toContain('PROJECT_TO_METADATA');
  });

  it('Class 4: Flags slug collisions between SQL and legacy metadata fail-closed (O-02 Option B)', () => {
    const sqlProduct = {
      id: '44444444-4444-4444-8444-444444444444',
      tenant_id: tenantId,
      title: 'Produk SQL Resmi',
      slug: 'promo-heboh',
      price: 300000,
      is_active: true,
    };

    const collidingMeta = {
      id: '55555555-5555-4555-8555-555555555555', // Distinct ID!
      name: 'Produk Legacy Berbeda',
      slug: 'promo-heboh', // Identical colliding slug!
      price: 150000,
      is_active: true,
    };

    const manifest = executeDryRunReconciliation({
      tenantId,
      tenantSlug,
      sqlProducts: [sqlProduct],
      metadataProducts: [collidingMeta],
    });

    expect(manifest.summary.slugCollisions).toBe(1);
    const finding = manifest.findings.find(f => f.conflictClass === 'CLASS_4_SLUG_COLLISION');
    expect(finding).toBeDefined();
    expect(finding?.failClosedRequired).toBe(true);
    expect(finding?.proposedAction).toContain('FAIL_CLOSED_MERCHANT_REVIEW');
  });

  it('Class 5: Resolves commercial price divergence with SQL strictly winning', () => {
    const sqlProduct = {
      id: '66666666-6666-4666-8666-666666666666',
      tenant_id: tenantId,
      title: 'Paket Usaha',
      slug: 'paket-usaha',
      price: 1000000, // Authoritative SQL price
      promo_price: 800000,
      is_active: true,
    };

    const divergentMeta = {
      id: '66666666-6666-4666-8666-666666666666',
      name: 'Paket Usaha',
      slug: 'paket-usaha',
      price: 500000, // Divergent lower price
      promo_price: 400000,
      is_active: true,
    };

    const manifest = executeDryRunReconciliation({
      tenantId,
      tenantSlug,
      sqlProducts: [sqlProduct],
      metadataProducts: [divergentMeta],
    });

    expect(manifest.summary.commercialDivergences).toBe(1);
    const finding = manifest.findings.find(f => f.conflictClass === 'CLASS_5_COMMERCIAL_DIVERGENCE');
    expect(finding).toBeDefined();
    expect(finding?.proposedAction).toContain('APPLY_SQL_PRICE_AUTHORITY');
  });

  it('Class 6: Flags inventory and fulfillment attribute divergence', () => {
    const sqlProduct = {
      id: '77777777-7777-4777-8777-777777777777',
      tenant_id: tenantId,
      title: 'Kaos Merchandise',
      slug: 'kaos-merchandise',
      price: 120000,
      product_type: 'PHYSICAL',
      requires_shipping: true,
      is_active: true,
    };

    const divergentMeta = {
      id: '77777777-7777-4777-8777-777777777777',
      name: 'Kaos Merchandise',
      slug: 'kaos-merchandise',
      price: 120000,
      product_type: 'DIGITAL', // Incorrect fulfillment type in metadata
      requires_shipping: false,
      is_active: true,
    };

    const manifest = executeDryRunReconciliation({
      tenantId,
      tenantSlug,
      sqlProducts: [sqlProduct],
      metadataProducts: [divergentMeta],
    });

    expect(manifest.summary.fulfillmentDivergences).toBe(1);
    const finding = manifest.findings.find(f => f.conflictClass === 'CLASS_6_INVENTORY_FULFILLMENT_DIVERGENCE');
    expect(finding).toBeDefined();
    expect(finding?.proposedAction).toContain('APPLY_SQL_FULFILLMENT_AUTHORITY');
  });

  it('Class 7: Catches cross-tenant ownership violation and fails closed', () => {
    const foreignMetaProduct = {
      id: '88888888-8888-4888-8888-888888888888',
      tenant_id: '99999999-9999-4999-8999-999999999999', // Foreign tenant ID!
      name: 'Bocoran Tenant Lain',
      slug: 'bocoran-tenant-lain',
      price: 100000,
    };

    const manifest = executeDryRunReconciliation({
      tenantId,
      tenantSlug,
      sqlProducts: [],
      metadataProducts: [foreignMetaProduct],
    });

    expect(manifest.summary.crossTenantViolations).toBe(1);
    const finding = manifest.findings.find(f => f.conflictClass === 'CLASS_7_CROSS_TENANT_VIOLATION');
    expect(finding).toBeDefined();
    expect(finding?.failClosedRequired).toBe(true);
    expect(finding?.severity).toBe('CRITICAL');
  });

  it('Class 8: Identifies corrupted non-UUID identifier without SQL counterpart', () => {
    const corruptedMeta = {
      id: 'prod-123-not-uuid',
      name: 'Produk ID Rusak',
      slug: 'produk-id-rusak',
      price: 50000,
    };

    const manifest = executeDryRunReconciliation({
      tenantId,
      tenantSlug,
      sqlProducts: [],
      metadataProducts: [corruptedMeta],
    });

    expect(manifest.summary.corruptedIdentifiers).toBe(1);
    const finding = manifest.findings.find(f => f.conflictClass === 'CLASS_8_CORRUPTED_IDENTIFIER');
    expect(finding).toBeDefined();
    expect(finding?.failClosedRequired).toBe(true);
  });

  it('Class 9: Identifies bulky custom_html bloat in metadata to be stripped', () => {
    const sqlProduct = {
      id: '99999999-9999-4999-8999-999999999999',
      tenant_id: tenantId,
      title: 'Landing Page Keren',
      slug: 'landing-page-keren',
      price: 250000,
      is_active: true,
      fulfillment_metadata: {
        single_page_config: { custom_html: '<div>Authoritative HTML in SQL</div>' },
      },
    };

    const bloatedMeta = {
      id: '99999999-9999-4999-8999-999999999999',
      name: 'Landing Page Keren',
      slug: 'landing-page-keren',
      price: 250000,
      is_active: true,
      custom_html: '<div>Bulky Bloat 64KB</div>',
    };

    const manifest = executeDryRunReconciliation({
      tenantId,
      tenantSlug,
      sqlProducts: [sqlProduct],
      metadataProducts: [bloatedMeta],
    });

    expect(manifest.summary.customHtmlBloat).toBe(1);
    const finding = manifest.findings.find(f => f.conflictClass === 'CLASS_9_CUSTOM_HTML_METADATA_BLOAT');
    expect(finding).toBeDefined();
    expect(finding?.proposedAction).toContain('STRIP_METADATA_HTML');
  });

  it('Class 10: Flags status divergence where SQL is inactive and metadata is active', () => {
    const sqlProduct = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      tenant_id: tenantId,
      title: 'Produk Nonaktif',
      slug: 'produk-nonaktif',
      price: 100000,
      is_active: false, // Inactive in SQL
      status: 'ARCHIVED',
    };

    const metaProduct = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Produk Nonaktif',
      slug: 'produk-nonaktif',
      price: 100000,
      is_active: true, // Still marked active in metadata
      status: 'ACTIVE',
    };

    const manifest = executeDryRunReconciliation({
      tenantId,
      tenantSlug,
      sqlProducts: [sqlProduct],
      metadataProducts: [metaProduct],
    });

    expect(manifest.summary.statusInconsistencies).toBe(1);
    const finding = manifest.findings.find(f => f.conflictClass === 'CLASS_10_STATUS_INCONSISTENCY');
    expect(finding).toBeDefined();
    expect(finding?.proposedAction).toContain('ALIGN_TO_SQL_STATUS');
  });
});
