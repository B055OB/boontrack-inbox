import {
  TenantBotConfigSchema,
  validateTenantBotConfig,
  safeParseTenantBotConfig,
} from '@/lib/types/tenant-bot-config';

describe('TenantBotConfig Zod Schema (Fail-Closed & Section Separation)', () => {
  const validClinicConfig = {
    blueprint_code: 'CLINIC_CONSULTATION',
    config_version: '1.0.0',
    conversation_policy: {
      bot_name: 'BoonPilot Triage',
      tone_of_voice: 'EMPATHETIC_PROFESSIONAL',
      greeting_mode: 'SINGLE_BUBBLE' as const,
      language: 'id' as const,
      max_output_tokens: 2048,
      slot_filling_rules: {
        required_slots: ['parent_name', 'child_info', 'complaint'],
        allow_partial_submission: true,
        prohibited_slot_values: ['seret', 'susah', 'gtm', 'stunting'],
      },
    },
    business_config_ref: {
      tenant_id: '692080ea-81b7-496b-87ee-bd8b9565b28c',
      tenant_slug: 'tumbuh-kembang-anak',
      store_name: 'Tumbuh Kembang Anak',
      business_category: 'KLINIK_KONSULTASI',
      doctors: [
        {
          doctor_id: 'dr_harys',
          doctor_name: 'dr. Harys Maulana, Sp.A',
          specialty: 'Konsultan Tumbuh Kembang & Nutrisi Anak',
          is_active: true,
        },
      ],
      payment_accounts: [
        {
          bank_name: 'BCA',
          account_number: '3741672471',
          account_holder: 'Muhamad Harys Maulana',
          is_primary: true,
        },
      ],
      screening_url: 'https://screening.littlebitefeeding.com/',
    },
    safety_policy: {
      fail_closed: true,
      clinical_safety_gate: true,
      emergency_disclaimer: 'Bila anak sesak napas berat, kejang, atau dehidrasi berat, segera ke IGD terdekat.',
      disclaimer_triggers: ['kejang', 'sesak', 'biru', 'dehidrasi berat', 'tidak sadar'],
      blocked_keywords: ['resep keras', 'antibiotik'],
      restricted_terms: ['obat keras'],
      require_human_escalation_on_emergency: true,
      max_consecutive_fallbacks: 3,
      human_handover_timeout_minutes: 120,
    },
  };

  it('successfully validates a well-formed clinic configuration', () => {
    const validated = validateTenantBotConfig(validClinicConfig);
    expect(validated.blueprint_code).toBe('CLINIC_CONSULTATION');
    expect(validated.config_version).toBe('1.0.0');
    expect(validated.conversation_policy.bot_name).toBe('BoonPilot Triage');
    expect(validated.business_config_ref.tenant_slug).toBe('tumbuh-kembang-anak');
    expect(validated.safety_policy.fail_closed).toBe(true);
  });

  it('rejects arbitrary unknown attributes at root level (fail-closed)', () => {
    const badConfig = {
      ...validClinicConfig,
      arbitrary_field: 'illegal_injected_payload',
    };

    const result = safeParseTenantBotConfig(badConfig);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true);
    }
  });

  it('rejects arbitrary unknown attributes within conversation_policy (fail-closed)', () => {
    const badConfig = {
      ...validClinicConfig,
      conversation_policy: {
        ...validClinicConfig.conversation_policy,
        injected_policy_hack: 12345,
      },
    };

    const result = safeParseTenantBotConfig(badConfig);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true);
    }
  });

  it('rejects arbitrary unknown attributes within business_config_ref (fail-closed)', () => {
    const badConfig = {
      ...validClinicConfig,
      business_config_ref: {
        ...validClinicConfig.business_config_ref,
        unknown_db_col: true,
      },
    };

    const result = safeParseTenantBotConfig(badConfig);
    expect(result.success).toBe(false);
  });

  it('rejects arbitrary unknown attributes within safety_policy (fail-closed)', () => {
    const badConfig = {
      ...validClinicConfig,
      safety_policy: {
        ...validClinicConfig.safety_policy,
        bypass_guardrail: true,
      },
    };

    const result = safeParseTenantBotConfig(badConfig);
    expect(result.success).toBe(false);
  });

  it('rejects invalid SemVer config_version', () => {
    const badConfig = {
      ...validClinicConfig,
      config_version: 'v1-beta',
    };

    const result = safeParseTenantBotConfig(badConfig);
    expect(result.success).toBe(false);
  });
});
