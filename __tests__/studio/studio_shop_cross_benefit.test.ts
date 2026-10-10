/**
 * @file __tests__/studio/studio_shop_cross_benefit.test.ts
 * @description Unit tests for Tahap 2: Logika Transisi Akun & Bonus Upgrade Toko (Shop Subscription Cross-Benefit)
 * 
 * Verifikasi:
 * 1. Logika Entitlement Upgrade: status is_shop_subscriber: true, tier: 'member' / preserved paid tier.
 * 2. Bonus apresiasi: +15 Kredit Studio ditambahkan ke saldo wallet tenant_entitlements.
 * 3. Pencatatan ledger mutasi: event PROMO_SHOP_ACTIVATION_BONUS (amount: +15, tipe: CREDIT_IN, note: 'Bonus langganan toko BoonTrack').
 * 4. Idempotency guard: aktivasi ulang tidak menduplikasi penambahan koin.
 * 5. Kebijakan tanpa refund kas & harga pembelian terkunci otomatis di harga Member Toko.
 * 6. API Route POST /api/studio/billing/shop-upgrade-bonus.
 * 7. UI Component ShopUpgradeBanner rendering & suppression saat user sudah menjadi member.
 */

import React from 'react';
import { StudioCreditService } from '@/lib/services/studio-credit.service';
import { isTenantShopMember, getStudioTokenPackage } from '@/lib/config/studio-pricing';
import { POST as shopUpgradeBonusRoute } from '@/app/api/studio/billing/shop-upgrade-bonus/route';
import ShopUpgradeBanner from '@/components/studio/ShopUpgradeBanner';
import type { NextRequest } from 'next/server';

interface MockTenant {
  id: string;
  slug: string;
  name: string;
  tier: string;
  metadata: Record<string, any>;
}

interface MockEntitlement {
  tenant_id: string;
  credits_remaining: number;
  is_unlimited: boolean;
  tier: string;
}

interface MockLedgerEntry {
  id: string;
  tenant_id: string;
  amount: number;
  balance_after: number;
  action: string;
  description: string;
  event?: string;
  type?: string;
  note?: string;
  created_at: string;
}

let dbTenants: MockTenant[] = [];
let dbEntitlements: Record<string, MockEntitlement> = {};
let dbLedger: MockLedgerEntry[] = [];

// Setup mock Supabase
jest.mock('@/lib/supabaseClient', () => {
  return {
    getSupabase: jest.fn(() => createMockSupabase()),
    getSupabaseAdmin: jest.fn(() => createMockSupabase()),
  };
});

function createMockSupabase() {
  return {
    from: (table: string) => {
      let selectedFields = '*';
      let filters: { field: string; op: string; val: any }[] = [];
      let ilikeFilter: { field: string; pattern: string } | null = null;
      let limitCount: number | null = null;

      const builder: any = {
        select: (fields: string = '*') => {
          selectedFields = fields;
          return builder;
        },
        eq: (field: string, val: any) => {
          filters.push({ field, op: 'eq', val });
          return builder;
        },
        ilike: (field: string, pattern: string) => {
          ilikeFilter = { field, pattern };
          return builder;
        },
        limit: (cnt: number) => {
          limitCount = cnt;
          return builder;
        },
        order: () => builder,
        maybeSingle: async () => {
          if (table === 'tenants') {
            const slugFilter = filters.find(f => f.field === 'slug');
            const idFilter = filters.find(f => f.field === 'id');
            const t = dbTenants.find(item => 
              (slugFilter && item.slug.toLowerCase() === String(slugFilter.val).toLowerCase()) ||
              (idFilter && item.id === idFilter.val)
            );
            return { data: t || null, error: null };
          }
          if (table === 'tenant_entitlements') {
            const tenantFilter = filters.find(f => f.field === 'tenant_id');
            if (tenantFilter && dbEntitlements[tenantFilter.val]) {
              return { data: dbEntitlements[tenantFilter.val], error: null };
            }
            return { data: null, error: null };
          }
          if (table === 'tenant_credit_ledger') {
            const tenantFilter = filters.find(f => f.field === 'tenant_id');
            const actionFilter = filters.find(f => f.field === 'action');
            let entries = dbLedger.filter(l => {
              if (tenantFilter && l.tenant_id !== tenantFilter.val) return false;
              if (actionFilter && l.action !== actionFilter.val) return false;
              return true;
            });
            if (entries.length > 0) {
              return { data: entries[0], error: null };
            }
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
        insert: async (payload: any) => {
          const rows = Array.isArray(payload) ? payload : [payload];
          for (const row of rows) {
            if (table === 'tenant_credit_ledger') {
              const entry: MockLedgerEntry = {
                id: `ledger_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                tenant_id: row.tenant_id,
                amount: row.amount,
                balance_after: row.balance_after,
                action: row.action,
                description: row.description,
                event: row.event,
                type: row.type,
                note: row.note,
                created_at: new Date().toISOString(),
              };
              dbLedger.push(entry);
            }
          }
          return { data: rows, error: null };
        },
        update: (payload: any) => {
          return {
            eq: async (field: string, val: any) => {
              if (table === 'tenants') {
                const idx = dbTenants.findIndex(t => (t as any)[field] === val);
                if (idx !== -1) {
                  dbTenants[idx] = {
                    ...dbTenants[idx],
                    ...payload,
                    metadata: {
                      ...dbTenants[idx].metadata,
                      ...(payload.metadata || {}),
                    },
                  };
                }
              }
              return { data: null, error: null };
            },
          };
        },
        upsert: async (payload: any) => {
          if (table === 'tenant_entitlements') {
            dbEntitlements[payload.tenant_id] = {
              tenant_id: payload.tenant_id,
              credits_remaining: payload.credits_remaining,
              is_unlimited: payload.is_unlimited ?? false,
              tier: payload.tier || 'FREE',
            };
          }
          return { data: payload, error: null };
        },
      };
      return builder;
    },
  };
}

describe('Tahap 2: Logika Transisi Akun & Bonus Upgrade Toko (Shop Cross-Benefit)', () => {
  beforeEach(() => {
    dbTenants = [
      {
        id: '11111111-aaaa-bbbb-cccc-111111111111',
        slug: 'kreator-pemula',
        name: 'Kreator Pemula',
        tier: 'FREE',
        metadata: {
          is_shop_member: false,
          is_shop_subscriber: false,
        },
      },
      {
        id: '22222222-aaaa-bbbb-cccc-222222222222',
        slug: 'pro-merchant',
        name: 'Pro Merchant',
        tier: 'PRO_SCALE',
        metadata: {
          is_shop_member: true,
          is_shop_subscriber: true,
        },
      },
    ];

    dbEntitlements = {
      '11111111-aaaa-bbbb-cccc-111111111111': {
        tenant_id: '11111111-aaaa-bbbb-cccc-111111111111',
        credits_remaining: 5,
        is_unlimited: false,
        tier: 'FREE',
      },
      '22222222-aaaa-bbbb-cccc-222222222222': {
        tenant_id: '22222222-aaaa-bbbb-cccc-222222222222',
        credits_remaining: 50,
        is_unlimited: false,
        tier: 'PRO_SCALE',
      },
    };

    dbLedger = [];
  });

  describe('1. Logika Entitlement Upgrade & Bonus Apresiasi', () => {
    it('memberikan bonus +15 kredit, update tier member, dan catat ledger PROMO_SHOP_ACTIVATION_BONUS', async () => {
      // Tenant awal memiliki 5 kredit
      const tenantSlug = 'kreator-pemula';
      const initialEnt = await StudioCreditService.getEntitlements(tenantSlug);
      expect(initialEnt?.credits_remaining).toBe(5);
      expect(initialEnt?.is_shop_member).toBe(false);

      // Jalankan pemberian bonus aktivasi langganan toko
      const result = await StudioCreditService.grantShopActivationBonus({
        tenantIdOrSlug: tenantSlug,
        subscriptionId: 'sub_shop_uuid_001',
        invoiceId: 'INV-SHOP-001',
      });

      expect(result.success).toBe(true);
      expect(result.alreadyGranted).toBe(false);
      expect(result.creditsGranted).toBe(15);
      expect(result.newBalance).toBe(20); // 5 + 15
      expect(result.tenantTier).toBe('member');
      expect(result.isShopMember).toBe(true);

      // Verifikasi tabel tenants diperbarui
      const tenantInDb = dbTenants.find(t => t.slug === tenantSlug);
      expect(tenantInDb?.tier).toBe('member');
      expect(tenantInDb?.metadata.is_shop_subscriber).toBe(true);
      expect(tenantInDb?.metadata.is_shop_member).toBe(true);

      // Verifikasi tenant_entitlements diperbarui
      const updatedEnt = await StudioCreditService.getEntitlements(tenantSlug);
      expect(updatedEnt?.credits_remaining).toBe(20);
      expect(updatedEnt?.is_shop_member).toBe(true);

      // Verifikasi mutasi dicatat di tenant_credit_ledger
      expect(dbLedger.length).toBe(1);
      const ledger = dbLedger[0];
      expect(ledger.action).toBe('PROMO_SHOP_ACTIVATION_BONUS');
      expect(ledger.amount).toBe(15);
      expect(ledger.balance_after).toBe(20);
      expect(ledger.description).toBe('Bonus langganan toko BoonTrack');
      expect(ledger.type).toBe('CREDIT_IN');
      expect(ledger.event).toBe('PROMO_SHOP_ACTIVATION_BONUS');
    });

    it('mempertahankan tier yang lebih tinggi jika tenant sudah memiliki tier berbayar (e.g. PRO_SCALE)', async () => {
      const tenantSlug = 'pro-merchant';
      const result = await StudioCreditService.grantShopActivationBonus({
        tenantIdOrSlug: tenantSlug,
        subscriptionId: 'sub_pro_002',
      });

      expect(result.success).toBe(true);
      expect(result.tenantTier).toBe('PRO_SCALE'); // Tidak di-downgrade ke 'member'
      expect(result.newBalance).toBe(65); // 50 + 15
      expect(result.isShopMember).toBe(true);
    });
  });

  describe('2. Idempotency Guard (Pencegahan Double-Granting)', () => {
    it('tidak menambahkan kredit ganda jika PROMO_SHOP_ACTIVATION_BONUS sudah pernah diberikan', async () => {
      const tenantSlug = 'kreator-pemula';

      // Panggilan pertama: berhasil menambah +15 kredit (5 -> 20)
      const res1 = await StudioCreditService.grantShopActivationBonus({
        tenantIdOrSlug: tenantSlug,
        subscriptionId: 'sub_001',
      });
      expect(res1.success).toBe(true);
      expect(res1.creditsGranted).toBe(15);
      expect(res1.newBalance).toBe(20);

      // Panggilan kedua (replay / duplicate webhook): harus terdeteksi idempotent
      const res2 = await StudioCreditService.grantShopActivationBonus({
        tenantIdOrSlug: tenantSlug,
        subscriptionId: 'sub_001',
      });
      expect(res2.success).toBe(true);
      expect(res2.alreadyGranted).toBe(true);
      expect(res2.creditsGranted).toBe(0);
      expect(res2.newBalance).toBe(20); // Tetap 20, BUKAN 35
      expect(res2.isShopMember).toBe(true);

      // Jumlah ledger tetap 1 baris
      expect(dbLedger.length).toBe(1);
    });
  });

  describe('3. Kebijakan Tanpa Refund Kas & Kunci Harga Member Toko', () => {
    it('kredit yang dibeli di harga publik tetap aman dan seluruh pembelian berikutnya terkunci di harga member', async () => {
      const tenant = dbTenants[0];

      // Sebelum upgrade: Harga publik
      expect(isTenantShopMember(tenant)).toBe(false);
      const publicKetengan = getStudioTokenPackage('ketengan', false);
      const publicStarter = getStudioTokenPackage('starter', false);
      const publicCreator = getStudioTokenPackage('creator', false);

      expect(publicKetengan?.price).toBe(20000);
      expect(publicStarter?.price).toBe(75000);
      expect(publicCreator?.price).toBe(135000);

      // Eksekusi upgrade toko
      await StudioCreditService.grantShopActivationBonus({
        tenantIdOrSlug: tenant.slug,
      });

      // Tenant sekarang adalah Member Toko
      const updatedTenant = dbTenants.find(t => t.slug === tenant.slug);
      expect(isTenantShopMember(updatedTenant)).toBe(true);

      // Saldo lama aman dan bertambah 15 kredit (5 + 15 = 20)
      const ent = await StudioCreditService.getEntitlements(tenant.slug);
      expect(ent?.credits_remaining).toBe(20);

      // Seluruh pembelian berikutnya terkunci di harga Member Toko
      const memberKetengan = getStudioTokenPackage('ketengan', true);
      const memberStarter = getStudioTokenPackage('starter', true);
      const memberCreator = getStudioTokenPackage('creator', true);

      expect(memberKetengan?.price).toBe(15000); // Diskon 5rb
      expect(memberStarter?.price).toBe(49000);  // Diskon 26rb
      expect(memberCreator?.price).toBe(89000);  // Diskon 46rb
    });
  });

  describe('4. API Route: POST /api/studio/billing/shop-upgrade-bonus', () => {
    it('mengembalikan status 400 jika tenantSlug tidak disertakan', async () => {
      const req = {
        json: async () => ({}),
        cookies: { get: () => undefined },
      } as unknown as NextRequest;

      const res = await shopUpgradeBonusRoute(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/tenantId atau tenantSlug wajib disertakan/);
    });

    it('berhasil memproses bonus upgrade melalui HTTP endpoint', async () => {
      const req = {
        json: async () => ({
          tenantSlug: 'kreator-pemula',
          subscriptionId: 'sub_http_test_123',
        }),
        cookies: { get: () => undefined },
      } as unknown as NextRequest;

      const res = await shopUpgradeBonusRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.creditsGranted).toBe(15);
      expect(json.data.newBalance).toBe(20);
      expect(json.data.isShopMember).toBe(true);
    });
  });

  describe('5. UI Component: ShopUpgradeBanner', () => {
    it('menyembunyikan banner jika user sudah menjadi member toko (isShopMember === true)', () => {
      const rendered = ShopUpgradeBanner({
        isShopMember: true,
        tenantSlug: 'pro-merchant',
      });

      expect(rendered).toBeNull();
    });

    it('merender salinan teks penawaran yang tepat saat user non-member (isShopMember === false)', () => {
      const rendered = ShopUpgradeBanner({
        isShopMember: false,
        tenantSlug: 'kreator-pemula',
        variant: 'banner',
      });

      expect(rendered).not.toBeNull();
      function extractText(el: any): string {
        if (!el) return '';
        if (typeof el === 'string' || typeof el === 'number') return String(el);
        if (Array.isArray(el)) return el.map(extractText).join(' ');
        if (el.props && el.props.children) return extractText(el.props.children);
        return '';
      }

      const text = extractText(rendered);
      expect(text).toContain('Buka Toko Online di BoonTrack Shop');
      expect(text).toContain('bonus 15 Kredit Studio gratis');
      expect(text).toContain('Kunci harga member termurah');
      expect(text).toContain('Aktifkan Toko Sekarang →');
    });

    it('merender variant compact dengan teks penawaran yang lengkap', () => {
      const rendered = ShopUpgradeBanner({
        isShopMember: false,
        tenantSlug: 'kreator-pemula',
        variant: 'compact',
      });

      expect(rendered).not.toBeNull();
      function extractText(el: any): string {
        if (!el) return '';
        if (typeof el === 'string' || typeof el === 'number') return String(el);
        if (Array.isArray(el)) return el.map(extractText).join(' ');
        if (el.props && el.props.children) return extractText(el.props.children);
        return '';
      }

      const text = extractText(rendered);
      expect(text).toContain('Buka Toko Online di BoonTrack Shop');
      expect(text).toContain('Aktifkan Toko Sekarang →');
    });
  });
});
