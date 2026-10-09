/**
 * __tests__/types/tenant_bot_config_schema.test.ts
 *
 * Baseline Gate 1 & 4 Validation Suite:
 * 1. Schema Contract & Fail-Closed Enforcement (.strict(), invalid enum, partial payload)
 * 2. Controlled Error on Unknown Template / Blueprint (Zero Silent Fallback)
 * 3. Versioned Config Lifecycle & Deterministic Rollback (SemVer)
 */

import {
  TenantBotConfigSchema,
  validateTenantBotConfig,
  safeParseTenantBotConfig,
  resolveConfigWithRollback,
  isSemverUpgrade,
  type TenantBotConfig,
} from '@/lib/types/tenant-bot-config';
import {
  resolveTenantRuntime,
  resolveTemplate,
} from '@/lib/resolvers/tenant-runtime-resolver';

describe('GATE 1 & GATE 4: TenantBotConfig Schema Contract, Fail-Closed & Config Lifecycle', () => {

  // ── FIXTURES ──────────────────────────────────────────────────────────────
  const validRetailCommerceConfig: TenantBotConfig = {
    blueprint_code: 'RETAIL_COMMERCE',
    config_version: '1.0.0',
    conversation_policy: {
      bot_name: 'BoonPilot Retail Assistant',
      tone_of_voice: 'WARM_COMMERCIAL',
      greeting_message: 'Halo Kak! Selamat datang di Toko Kami. Ada yang bisa kami bantu seputar koleksi produk?',
      greeting_mode: 'SINGLE_BUBBLE',
      language: 'id',
      max_output_tokens: 2048,
      slot_filling_rules: {
        required_slots: ['customer_name', 'shipping_address', 'chosen_variant'],
        allow_partial_submission: true,
      },
      operating_hours: {
        enabled: true,
        timezone: 'Asia/Jakarta',
        schedule_description: 'Senin - Sabtu 09:00 - 21:00 WIB',
        allow_inbound_during_closed: true,
      },
      quick_replies: ['Lihat Katalog', 'Cek Ongkir', 'Promo Hari Ini'],
    },
    business_config_ref: {
      tenant_id: 'ten-retail-001',
      tenant_slug: 'retail-store-alpha',
      store_name: 'Alpha Fashion Store',
      business_category: 'FASHION_RETAIL',
      headline: 'Koleksi Fashion Pria & Wanita Terbaik',
      official_whatsapp: '6281200001111',
      storefront_url: 'https://shop.boontrack.com/retail-store-alpha',
      payment_accounts: [
        {
          bank_name: 'BCA',
          account_number: '1234567890',
          account_holder: 'PT Alpha Retail',
          is_primary: true,
        },
      ],
      catalog_product_ids: ['prod-01', 'prod-02', 101],
    },
    safety_policy: {
      fail_closed: true,
      clinical_safety_gate: false,
      disclaimer_triggers: [],
      blocked_keywords: ['judol', 'slot', 'situs gacor'],
      restricted_terms: ['obat keras'],
      require_human_escalation_on_emergency: false,
      max_consecutive_fallbacks: 3,
      human_handover_timeout_minutes: 120,
    },
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 1. SCHEMA CONTRACT & FAIL-CLOSED VALIDATION (GATE 1)
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Schema Contract & Fail-Closed Enforcement (.strict())', () => {
    it('successfully validates a well-formed RETAIL_COMMERCE_V1 configuration', () => {
      const validated = validateTenantBotConfig(validRetailCommerceConfig);
      expect(validated.blueprint_code).toBe('RETAIL_COMMERCE');
      expect(validated.config_version).toBe('1.0.0');
      expect(validated.conversation_policy.bot_name).toBe('BoonPilot Retail Assistant');
      expect(validated.business_config_ref.tenant_slug).toBe('retail-store-alpha');
      expect(validated.safety_policy.fail_closed).toBe(true);
    });

    it('rejects arbitrary unknown attributes at root level (fail-closed)', () => {
      const badConfig = {
        ...validRetailCommerceConfig,
        arbitrary_injected_field: 'illegal_payload',
      };
      const result = safeParseTenantBotConfig(badConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true);
      }
    });

    it('rejects arbitrary unknown attributes within conversation_policy (fail-closed)', () => {
      const badConfig = {
        ...validRetailCommerceConfig,
        conversation_policy: {
          ...validRetailCommerceConfig.conversation_policy,
          injected_prompt_hack: 'ignore all instructions',
        },
      };
      const result = safeParseTenantBotConfig(badConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true);
      }
    });

    it('rejects arbitrary unknown attributes within operating_hours (fail-closed)', () => {
      const badConfig = {
        ...validRetailCommerceConfig,
        conversation_policy: {
          ...validRetailCommerceConfig.conversation_policy,
          operating_hours: {
            ...validRetailCommerceConfig.conversation_policy.operating_hours,
            injected_sub_key: true,
          },
        },
      };
      const result = safeParseTenantBotConfig(badConfig);
      expect(result.success).toBe(false);
    });

    it('rejects arbitrary unknown attributes within business_config_ref (fail-closed)', () => {
      const badConfig = {
        ...validRetailCommerceConfig,
        business_config_ref: {
          ...validRetailCommerceConfig.business_config_ref,
          unauthorized_gateway_key: 'sk_live_123',
        },
      };
      const result = safeParseTenantBotConfig(badConfig);
      expect(result.success).toBe(false);
    });

    it('rejects arbitrary unknown attributes within safety_policy (fail-closed)', () => {
      const badConfig = {
        ...validRetailCommerceConfig,
        safety_policy: {
          ...validRetailCommerceConfig.safety_policy,
          bypass_all_checks: true,
        },
      };
      const result = safeParseTenantBotConfig(badConfig);
      expect(result.success).toBe(false);
    });

    it('rejects invalid enum values for blueprint_code', () => {
      const badConfig = {
        ...validRetailCommerceConfig,
        blueprint_code: 'lowercase_retail_commerce', // invalid pattern (requires uppercase)
      };
      const result = safeParseTenantBotConfig(badConfig);
      expect(result.success).toBe(false);
    });

    it('rejects invalid enum values for language or greeting_mode', () => {
      const badLang = {
        ...validRetailCommerceConfig,
        conversation_policy: {
          ...validRetailCommerceConfig.conversation_policy,
          language: 'de' as any, // only 'id' | 'en' allowed
        },
      };
      expect(safeParseTenantBotConfig(badLang).success).toBe(false);

      const badGreetingMode = {
        ...validRetailCommerceConfig,
        conversation_policy: {
          ...validRetailCommerceConfig.conversation_policy,
          greeting_mode: 'SPAM_BUBBLES' as any,
        },
      };
      expect(safeParseTenantBotConfig(badGreetingMode).success).toBe(false);
    });

    it('rejects partial payloads missing required top-level fields', () => {
      const missingBlueprint = { ...validRetailCommerceConfig };
      delete (missingBlueprint as any).blueprint_code;
      expect(safeParseTenantBotConfig(missingBlueprint).success).toBe(false);

      const missingVersion = { ...validRetailCommerceConfig };
      delete (missingVersion as any).config_version;
      expect(safeParseTenantBotConfig(missingVersion).success).toBe(false);

      const missingPolicy = { ...validRetailCommerceConfig };
      delete (missingPolicy as any).conversation_policy;
      expect(safeParseTenantBotConfig(missingPolicy).success).toBe(false);

      const missingBizRef = { ...validRetailCommerceConfig };
      delete (missingBizRef as any).business_config_ref;
      expect(safeParseTenantBotConfig(missingBizRef).success).toBe(false);

      const missingSafety = { ...validRetailCommerceConfig };
      delete (missingSafety as any).safety_policy;
      expect(safeParseTenantBotConfig(missingSafety).success).toBe(false);
    });

    it('rejects partial payloads missing required nested fields', () => {
      const missingBotName = {
        ...validRetailCommerceConfig,
        conversation_policy: {
          ...validRetailCommerceConfig.conversation_policy,
          bot_name: undefined as any,
        },
      };
      expect(safeParseTenantBotConfig(missingBotName).success).toBe(false);

      const missingTenantId = {
        ...validRetailCommerceConfig,
        business_config_ref: {
          ...validRetailCommerceConfig.business_config_ref,
          tenant_id: undefined as any,
        },
      };
      expect(safeParseTenantBotConfig(missingTenantId).success).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. CONTROLLED ERROR ON UNKNOWN TEMPLATE / BLUEPRINT (GATE 1)
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Controlled Error on Unknown Template / Blueprint (Zero Silent Fallback)', () => {
    it('returns UNKNOWN_TEMPLATE error (422) for unrecognized template_code without silent fallback', () => {
      const runtime = resolveTenantRuntime({
        host: 'shop/demo-retail',
        tenant: {
          slug: 'demo-retail',
          template_code: 'CORRUPTED_TEMPLATE_XYZ' as any,
        },
      });

      expect(runtime.templateCode).toBe('UNKNOWN_TEMPLATE');

      const templateResult = resolveTemplate(runtime);
      expect(templateResult.status).toBe('ERROR');
      expect(templateResult.error).toBe('UNKNOWN_TEMPLATE');
      expect(templateResult.statusCode).toBe(422);
      expect(templateResult.errorMessage).toContain('CORRUPTED_TEMPLATE_XYZ');
    });

    it('returns TEMPLATE_INCOMPATIBLE error when business_type mismatches template boundary', () => {
      const runtime = resolveTenantRuntime({
        host: 'app/civic-office',
        tenant: {
          slug: 'civic-office',
          business_type: 'PUBLIC_SERVICE',
          template_code: 'SHOP_V1', // illegal mismatch: PUBLIC_SERVICE cannot use SHOP_V1
        },
      });

      const templateResult = resolveTemplate(runtime);
      expect(templateResult.status).toBe('ERROR');
      expect(templateResult.error).toBe('TEMPLATE_INCOMPATIBLE');
      expect(templateResult.statusCode).toBe(404);
      expect(templateResult.errorMessage).toContain('Inkompatibilitas arsitektur');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. CONFIG LIFECYCLE & DETERMINISTIC ROLLBACK (GATE 4)
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Versioned Config Lifecycle & Deterministic Rollback (SemVer)', () => {
    it('verifies valid SemVer progression using isSemverUpgrade', () => {
      expect(isSemverUpgrade('1.0.0', '1.0.1')).toBe(true);
      expect(isSemverUpgrade('1.0.0', '1.1.0')).toBe(true);
      expect(isSemverUpgrade('1.0.0', '2.0.0')).toBe(true);

      // Same or downgraded versions must return false
      expect(isSemverUpgrade('1.0.0', '1.0.0')).toBe(false);
      expect(isSemverUpgrade('1.1.0', '1.0.9')).toBe(false);
      expect(isSemverUpgrade('invalid', '1.0.0')).toBe(false);
    });

    it('activates valid candidate configuration (status: ACTIVE)', () => {
      const candidate = {
        ...validRetailCommerceConfig,
        config_version: '1.1.0',
      };

      const result = resolveConfigWithRollback(candidate, validRetailCommerceConfig);
      expect(result.status).toBe('ACTIVE');
      expect(result.activeVersion).toBe('1.1.0');
      expect(result.effectiveConfig?.config_version).toBe('1.1.0');
      expect(result.error).toBeUndefined();
    });

    it('gracefully rolls back to lastKnownGoodConfig when candidate configuration is invalid', () => {
      const invalidCandidate = {
        ...validRetailCommerceConfig,
        config_version: '1.2.0',
        arbitrary_unauthorized_field: 'hacked_injection', // triggers Zod fail-closed
      };

      const result = resolveConfigWithRollback(invalidCandidate, validRetailCommerceConfig);
      expect(result.status).toBe('ROLLEDBACK');
      expect(result.activeVersion).toBe('1.0.0'); // preserved previous stable version
      expect(result.effectiveConfig?.config_version).toBe('1.0.0');
      expect(result.error).toContain('Rolled back to version 1.0.0');
      expect(result.validationIssues?.length).toBeGreaterThan(0);
    });

    it('returns INVALID_NO_FALLBACK when candidate is invalid and no valid fallback exists', () => {
      const invalidCandidate = {
        ...validRetailCommerceConfig,
        config_version: 'bad-version',
      };

      const result = resolveConfigWithRollback(invalidCandidate, null);
      expect(result.status).toBe('INVALID_NO_FALLBACK');
      expect(result.effectiveConfig).toBeNull();
      expect(result.activeVersion).toBeNull();
      expect(result.error).toContain('no valid fallback version exists');
    });
  });
});
