import {
  getTierLevel,
  canAccessFeature,
  hasTierAccess,
  TIER_HIERARCHY_LEVELS,
  FEATURE_MIN_LEVELS,
  CANONICAL_TIERS,
} from '@/lib/subscription-tiers';

describe('Tier Hierarchy & Centralized Feature Gating', () => {
  describe('getTierLevel', () => {
    it('returns level 0 for FREE, TRIAL, and CHECKOUT_LITE', () => {
      expect(getTierLevel('FREE')).toBe(0);
      expect(getTierLevel('CHECKOUT_LITE')).toBe(0);
      expect(getTierLevel('LITE')).toBe(0);
    });

    it('returns level 1 for STARTER, SOLO, BASIC, GROWTH', () => {
      expect(getTierLevel('STARTER')).toBe(1);
      expect(getTierLevel('SOLO')).toBe(1);
      expect(getTierLevel('BASIC')).toBe(1);
      expect(getTierLevel('GROWTH')).toBe(1);
    });

    it('returns level 2 for PRO, PRO_SCALE, ADS_PERFORMANCE, GROWTH_PLUS', () => {
      expect(getTierLevel('PRO')).toBe(2);
      expect(getTierLevel('PRO_SCALE')).toBe(2);
      expect(getTierLevel('ADS_PERFORMANCE')).toBe(2);
      expect(getTierLevel('GROWTH_PLUS')).toBe(2);
    });

    it('returns level 3 for SCALE and TEAM_SCALE', () => {
      expect(getTierLevel('SCALE')).toBe(3);
      expect(getTierLevel('TEAM_SCALE')).toBe(3);
    });

    it('returns level 4 for ENTERPRISE and SPECIAL_GRANT', () => {
      expect(getTierLevel('ENTERPRISE')).toBe(4);
      expect(getTierLevel('SPECIAL_GRANT')).toBe(4);
    });
  });

  describe('canAccessFeature', () => {
    it('allows CRM access to PRO_SCALE and above (PRO, SCALE, ENTERPRISE)', () => {
      expect(canAccessFeature('PRO_SCALE', 'crm')).toBe(true);
      expect(canAccessFeature('ADS_PERFORMANCE', 'crm')).toBe(true);
      expect(canAccessFeature('TEAM_SCALE', 'crm')).toBe(true);
      expect(canAccessFeature('ENTERPRISE', 'crm')).toBe(true);
      expect(canAccessFeature('SPECIAL_GRANT', 'crm')).toBe(true);
    });

    it('blocks CRM access for STARTER and CHECKOUT_LITE without explicit override', () => {
      expect(canAccessFeature('STARTER', 'crm')).toBe(false);
      expect(canAccessFeature('CHECKOUT_LITE', 'crm')).toBe(false);
      expect(canAccessFeature('SOLO', 'crm')).toBe(false);
    });

    it('allows Multi CS and Broadcast ONLY to SCALE and ENTERPRISE', () => {
      expect(canAccessFeature('ENTERPRISE', 'multi_cs')).toBe(true);
      expect(canAccessFeature('TEAM_SCALE', 'multi_cs')).toBe(true);
      expect(canAccessFeature('PRO_SCALE', 'multi_cs')).toBe(false);
      expect(canAccessFeature('ADS_PERFORMANCE', 'multi_cs')).toBe(false);

      expect(canAccessFeature('ENTERPRISE', 'broadcast')).toBe(true);
      expect(canAccessFeature('TEAM_SCALE', 'broadcast')).toBe(true);
      expect(canAccessFeature('PRO_SCALE', 'broadcast')).toBe(false);
    });

    it('respects metadata feature flag override even on lower tier', () => {
      const metaWithOverride = { features: { crm: true } };
      expect(canAccessFeature('STARTER', 'crm', metaWithOverride)).toBe(true);
    });

    it('ENTERPRISE inherits ALL features without exception', () => {
      const allFeatures = Object.keys(FEATURE_MIN_LEVELS);
      for (const feat of allFeatures) {
        expect(canAccessFeature('ENTERPRISE', feat)).toBe(true);
      }
    });
  });

  describe('hasTierAccess', () => {
    it('returns true for Enterprise tenant accessing CRM', () => {
      const tenant = {
        slug: 'tumbuh-kembang-anak',
        tier: 'ENTERPRISE',
        subscription_tier: 'ENTERPRISE',
        metadata: {
          plan_type: 'team_scale',
          subscription: {
            type: 'granted',
            plan_tier: 'ENTERPRISE',
          },
        },
      };

      expect(hasTierAccess(tenant, 'crm')).toBe(true);
      expect(hasTierAccess(tenant, 'inbox')).toBe(true);
      expect(hasTierAccess(tenant, 'has_capi')).toBe(true);
      expect(hasTierAccess(tenant, 'multi_cs')).toBe(true);
      expect(hasTierAccess(tenant, 'broadcast')).toBe(true);
    });

    it('returns true when explicit metadata flag is set', () => {
      const tenant = {
        slug: 'custom-shop',
        tier: 'STARTER',
        metadata: {
          features: {
            crm: true,
          },
        },
      };

      expect(hasTierAccess(tenant, 'crm')).toBe(true);
    });

    it('returns false for Starter tenant accessing high-tier features', () => {
      const tenant = {
        slug: 'simple-shop',
        tier: 'STARTER',
        metadata: {},
      };

      expect(hasTierAccess(tenant, 'crm')).toBe(false);
      expect(hasTierAccess(tenant, 'multi_cs')).toBe(false);
      expect(hasTierAccess(tenant, 'broadcast')).toBe(false);
      expect(hasTierAccess(tenant, 'single_page_checkout')).toBe(true);
    });
  });

  describe('Canonical Tiers definition', () => {
    it('defines crm: true in PRO_SCALE and ENTERPRISE', () => {
      expect(CANONICAL_TIERS.PRO_SCALE.features.crm).toBe(true);
      expect(CANONICAL_TIERS.ENTERPRISE.features.crm).toBe(true);
      expect(CANONICAL_TIERS.STARTER.features.crm).toBe(false);
      expect(CANONICAL_TIERS.CHECKOUT_LITE.features.crm).toBe(false);
    });
  });
});
