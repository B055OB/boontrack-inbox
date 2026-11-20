/**
 * TEST SUITE 4: SIX CATEGORY FULFILLMENT REGRESSION (ADR-P0-07)
 *
 * Verifies that the single canonical product writer and SQL-first readers properly handle
 * all 6 Shop fulfillment categories:
 * 1. PHYSICAL: requires_shipping=true, physical delivery.
 * 2. DIGITAL: requires_shipping=false, digital file / license access.
 * 3. FOOD: requires_shipping=true, F&B instant delivery / takeaway.
 * 4. FIELD_SERVICE: requires_shipping=false, onsite service booking.
 * 5. PROFESSIONAL_SERVICE: requires_shipping=false, consultation / session.
 * 6. AGENCY: requires_shipping=false, creative / recurring agency scope.
 */

import {
  upsertCanonicalProduct,
  CanonicalTenantContext,
  CanonicalWriterActor,
} from '@/lib/products/canonical-product-writer';
import { resolveFulfillmentRequirements } from '@/lib/product-catalog';

describe('ADR-P0-07: SIX-CATEGORY FULFILLMENT REGRESSION', () => {
  const tenant: CanonicalTenantContext = {
    id: '00000000-0000-4000-8000-000000000002',
    slug: 'omnichannel-hub',
    tier: 'PRO_SCALE',
    metadata: {},
  };

  const actor: CanonicalWriterActor = {
    actorId: 'merchant-root',
    actorRole: 'OWNER',
    isInternalMachine: false,
  };

  const mockAdminWithRow = (rowModifier: (input: any) => any) => ({
    from: jest.fn((table: string) => {
      if (table === 'products') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          upsert: jest.fn((payload: any) => ({
            select: jest.fn().mockResolvedValue({
              data: [rowModifier(payload)],
              error: null,
            }),
          })),
        };
      }
      if (table === 'tenants') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: tenant.id, metadata: {} },
            error: null,
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: [{ id: tenant.id }], error: null }),
          }),
        };
      }
      return {};
    }),
  });

  // ── 1. PHYSICAL ──
  it('Category 1 (PHYSICAL): Correctly tags requires_shipping=true and stores weight_grams', async () => {
    const mockAdmin = mockAdminWithRow(p => p);
    const result = await upsertCanonicalProduct({
      tenant,
      rawInput: {
        name: 'Kaos Oversize Hitam',
        price: 150000,
        category: 'physical',
        product_type: 'PHYSICAL',
        requires_shipping: true,
        weight_grams: 300,
      },
      actor,
      customSupabaseAdmin: mockAdmin,
    });

    expect(result.success).toBe(true);
    expect(result.product.requires_shipping).toBe(true);
    expect(result.product.product_type).toBe('PHYSICAL');
    expect(result.product.fulfillment_metadata?.weight_grams).toBe(300);

    const reqs = resolveFulfillmentRequirements('PHYSICAL');
    expect(reqs.requiresShipping).toBe(true);
    expect(reqs.strategy).toBe('PHYSICAL');
  });

  // ── 2. DIGITAL ──
  it('Category 2 (DIGITAL): Correctly sets requires_shipping=false and stores access_url', async () => {
    const mockAdmin = mockAdminWithRow(p => p);
    const result = await upsertCanonicalProduct({
      tenant,
      rawInput: {
        name: 'Template Notion Solopreneur',
        price: 99000,
        category: 'digital',
        product_type: 'DIGITAL_FILE',
        requires_shipping: false,
        fulfillment_metadata: {
          access_url: 'https://notion.so/template-solo',
        },
      },
      actor,
      customSupabaseAdmin: mockAdmin,
    });

    expect(result.success).toBe(true);
    expect(result.product.requires_shipping).toBe(false);
    expect(result.product.product_type).toBe('DIGITAL_FILE');
    expect(result.product.fulfillment_metadata?.access_url).toBe('https://notion.so/template-solo');

    const reqs = resolveFulfillmentRequirements('DIGITAL_FILE');
    expect(reqs.requiresShipping).toBe(false);
    expect(reqs.strategy).toBe('DIGITAL');
  });

  // ── 3. FOOD ──
  it('Category 3 (FOOD): Correctly enforces food logistics and instant delivery requirements', async () => {
    const mockAdmin = mockAdminWithRow(p => p);
    const result = await upsertCanonicalProduct({
      tenant,
      rawInput: {
        name: 'Paket Shabu Set 2 Orang',
        price: 250000,
        category: 'food',
        product_type: 'FOOD',
        requires_shipping: true,
        weight_grams: 1200,
      },
      actor,
      customSupabaseAdmin: mockAdmin,
    });

    expect(result.success).toBe(true);
    expect(result.product.requires_shipping).toBe(true);
    expect(result.product.product_type).toBe('FOOD');
    expect(result.product.fulfillment_metadata?.weight_grams).toBe(1200);

    const reqs = resolveFulfillmentRequirements('FOOD');
    expect(reqs.requiresShipping).toBe(true);
  });

  // ── 4. FIELD_SERVICE ──
  it('Category 4 (FIELD_SERVICE): Correctly sets service fulfillment without shipping', async () => {
    const mockAdmin = mockAdminWithRow(p => p);
    const result = await upsertCanonicalProduct({
      tenant,
      rawInput: {
        name: 'Jasa Cuci AC 1 PK',
        price: 75000,
        category: 'service',
        product_type: 'SERVICE',
        requires_shipping: false,
      },
      actor,
      customSupabaseAdmin: mockAdmin,
    });

    expect(result.success).toBe(true);
    expect(result.product.requires_shipping).toBe(false);
    expect(result.product.product_type).toBe('SERVICE');

    const reqs = resolveFulfillmentRequirements('SERVICE');
    expect(reqs.requiresShipping).toBe(false);
    expect(reqs.strategy).toBe('SERVICE');
  });

  // ── 5. PROFESSIONAL_SERVICE ──
  it('Category 5 (PROFESSIONAL_SERVICE): Handles 1-on-1 consultation booking metadata', async () => {
    const mockAdmin = mockAdminWithRow(p => p);
    const result = await upsertCanonicalProduct({
      tenant,
      rawInput: {
        name: 'Konsultasi Pajak Bisnis 60 Menit',
        price: 750000,
        category: 'service',
        product_type: 'SERVICE',
        requires_shipping: false,
        fulfillment_metadata: {
          calendar_booking_url: 'https://cal.com/tax-consultant',
        },
      },
      actor,
      customSupabaseAdmin: mockAdmin,
    });

    expect(result.success).toBe(true);
    expect(result.product.requires_shipping).toBe(false);
    expect(result.product.fulfillment_metadata?.calendar_booking_url).toBe('https://cal.com/tax-consultant');
  });

  // ── 6. AGENCY ──
  it('Category 6 (AGENCY): Handles retainer & milestone scope metadata', async () => {
    const mockAdmin = mockAdminWithRow(p => p);
    const result = await upsertCanonicalProduct({
      tenant,
      rawInput: {
        name: 'Paket Kelola Iklan Meta Bulanan',
        price: 3500000,
        category: 'service',
        product_type: 'SERVICE',
        requires_shipping: false,
        facilities: ['Riset Audience', 'Copywriting', 'Weekly Reporting'],
      },
      actor,
      customSupabaseAdmin: mockAdmin,
    });

    expect(result.success).toBe(true);
    expect(result.product.requires_shipping).toBe(false);
    expect(result.product.fulfillment_metadata?.facilities).toEqual(['Riset Audience', 'Copywriting', 'Weekly Reporting']);
  });
});
