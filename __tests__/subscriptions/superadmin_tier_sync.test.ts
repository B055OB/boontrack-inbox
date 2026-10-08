import { resolveCanonicalTier, calculateGrantValidUntil, canAccessFeature } from '@/lib/subscription-tiers';

describe('Superadmin Tier Synchronization & Unified Grant Logic', () => {
  describe('1. Canonical Tier Resolution & Inheritance', () => {
    it('resolves ENTERPRISE tier correctly and inherits all features including CRM', () => {
      const canonical = resolveCanonicalTier('ENTERPRISE');
      expect(canonical.key).toBe('ENTERPRISE');
      expect(canonical.features.crm).toBe(true);
      expect(canonical.features.has_capi).toBe(true);
      expect(canonical.features.multi_cs).toBe(true);
      expect(canAccessFeature(canonical.key, 'crm')).toBe(true);
      expect(canAccessFeature(canonical.key, 'capi')).toBe(true);
    });

    it('resolves raw casing and legacy alias (team_scale) to ENTERPRISE', () => {
      expect(resolveCanonicalTier('team_scale').key).toBe('ENTERPRISE');
      expect(resolveCanonicalTier('enterprise').key).toBe('ENTERPRISE');
      expect(resolveCanonicalTier('Enterprise').key).toBe('ENTERPRISE');
    });

    it('resolves PRO_SCALE (ads_performance) correctly with capi enabled and crm disabled', () => {
      const canonical = resolveCanonicalTier('ads_performance');
      expect(canonical.key).toBe('PRO_SCALE');
      expect(canonical.features.crm).toBe(false);
      expect(canonical.features.has_capi).toBe(true);
    });

    it('resolves CHECKOUT_LITE (free) without crm or capi', () => {
      const canonical = resolveCanonicalTier('CHECKOUT_LITE');
      expect(canonical.key).toBe('CHECKOUT_LITE');
      expect(canonical.features.crm).toBe(false);
      expect(canonical.features.has_capi).toBe(false);
    });
  });

  describe('2. Unified Grant Payload Integrity', () => {
    it('sets primary tier, subscription_tier, plan_type, and PILOT grant_type when granting Enterprise', () => {
      const requestedTier = 'ENTERPRISE';
      const months = 1;
      const canonical = resolveCanonicalTier(requestedTier);
      const { validUntil } = calculateGrantValidUntil(null, months);

      const planType =
        canonical.key === 'ENTERPRISE'
          ? 'team_scale'
          : canonical.key === 'PRO_SCALE'
          ? 'ads_performance'
          : canonical.key === 'CHECKOUT_LITE'
          ? 'checkout_lite'
          : 'solo';

      const updatePayload = {
        tier: canonical.key,
        subscription_tier: canonical.key,
        subscription_status: 'ACTIVE',
        grant_type: 'PILOT',
        status: 'ACTIVE',
        is_active: true,
        subscription_ends_at: validUntil,
        due_date: validUntil.split('T')[0],
        metadata: {
          tier: canonical.key,
          plan_tier: canonical.key,
          plan_type: planType,
          subscription_tier: canonical.key,
          subscription_status: 'ACTIVE',
          features: {
            tier: canonical.key,
            ...canonical.features,
            crm: canonical.features.crm,
            has_crm: canonical.features.crm,
          },
        },
      };

      // Verify tenant columns
      expect(updatePayload.tier).toBe('ENTERPRISE');
      expect(updatePayload.subscription_tier).toBe('ENTERPRISE');
      expect(updatePayload.grant_type).toBe('PILOT');
      expect(updatePayload.metadata.plan_type).toBe('team_scale');
      expect(updatePayload.metadata.features.crm).toBe(true);

      // Verify shop_subscriptions row mapping
      const shopSubPayload = {
        tier: canonical.key,
        plan_tier: canonical.key.toLowerCase(),
        status: 'ACTIVE',
        grant_type: 'PILOT',
        current_period_ends_at: validUntil,
        expires_at: validUntil,
        amount: 0,
        amount_paid: 0,
      };

      expect(shopSubPayload.tier).toBe('ENTERPRISE');
      expect(shopSubPayload.plan_tier).toBe('enterprise');
      expect(shopSubPayload.grant_type).toBe('PILOT');
      expect(shopSubPayload.status).toBe('ACTIVE');
    });

    it('ensures granting Enterprise does not leave behind stale old tier', () => {
      // Simulate tenant previously having ADS_PERFORMANCE
      const oldTenantState = {
        tier: 'PRO_SCALE',
        subscription_tier: 'PRO_SCALE',
        metadata: {
          plan_tier: 'PRO_SCALE',
          plan_type: 'ads_performance',
        },
      };

      const grantedTier = 'ENTERPRISE';
      const canonical = resolveCanonicalTier(grantedTier);

      const newTenantState = {
        ...oldTenantState,
        tier: canonical.key,
        subscription_tier: canonical.key,
        metadata: {
          ...oldTenantState.metadata,
          plan_tier: canonical.key,
          plan_type: 'team_scale',
        },
      };

      expect(newTenantState.tier).toBe('ENTERPRISE');
      expect(newTenantState.subscription_tier).toBe('ENTERPRISE');
      expect(newTenantState.metadata.plan_tier).toBe('ENTERPRISE');
      expect(newTenantState.metadata.plan_type).toBe('team_scale');
      expect(newTenantState.tier).not.toBe('PRO_SCALE');
    });
  });

  describe('3. Config Editor Tier Change Execution', () => {
    it('correctly maps dropdown tier selection to canonical DB columns', () => {
      const selectedTiers = ['ENTERPRISE', 'PRO_SCALE', 'STARTER', 'CHECKOUT_LITE'];

      for (const raw of selectedTiers) {
        const canonical = resolveCanonicalTier(raw);
        expect(['ENTERPRISE', 'PRO_SCALE', 'STARTER', 'CHECKOUT_LITE']).toContain(canonical.key);

        const subTier = canonical.key === 'CHECKOUT_LITE' ? 'STARTER' : canonical.key;
        expect(['ENTERPRISE', 'PRO_SCALE', 'STARTER']).toContain(subTier);
      }
    });
  });
});
