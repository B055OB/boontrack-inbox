/**
 * lib/types/tenant-bot-config.ts
 *
 * Strict Runtime Validation Schema for Tenant Bot Configuration
 * Follows CTO Architectural Guardrails:
 * - Fail-Closed: Rejects unknown / arbitrary attributes (.strict())
 * - Clean Separation: blueprint_code, config_version, conversation_policy, business_config_ref, safety_policy
 * - Single Source of Truth: Designed to validate raw Supabase tenant metadata
 */

import { z } from 'zod';

// ============================================================================
// 1. BLUEPRINT CODE & CONFIG VERSION SCHEMAS
// ============================================================================

export const KnownBlueprintCodeSchema = z.enum([
  'CLINIC_CONSULTATION',
  'CONSULTATION_V1',
  'RETAIL_COMMERCE',
  'RETAIL_COMMERCE_V1',
  'FIELD_SERVICE',
  'PLATFORM_ASSISTANT',
  'CREATIVE_AGENCY',
  'PUBLIC_SERVICE',
  'STORE_RESELLER',
  'CUSTOM_BLUEPRINT',
]);

export const BlueprintCodeSchema = z.union([
  KnownBlueprintCodeSchema,
  z.string().regex(/^[A-Z0-9_]{3,64}$/, 'Blueprint code must be uppercase alphanumeric with underscores (3-64 chars)'),
]);

export type BlueprintCode = z.infer<typeof BlueprintCodeSchema>;

export const ConfigVersionSchema = z.string().regex(
  /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/,
  'Config version must follow SemVer format (e.g. 1.0.0 or 1.0.0-rc.1)'
);

// ============================================================================
// 2. CONVERSATION POLICY SCHEMAS
// ============================================================================

export const InteractiveMenuOptionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  responseText: z.string().optional(),
}).strict();

export const InteractiveMenuSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  trigger: z.string().min(1),
  header_text: z.string().optional(),
  description: z.string().min(1),
  footer_text: z.string().optional(),
  button_label: z.string().optional(),
  options: z.array(InteractiveMenuOptionSchema),
}).strict();

export const CampaignRouteRuleSchema = z.object({
  id: z.string().min(1),
  campaign_id: z.string().optional(),
  keyword_triggers: z.array(z.string().min(1)),
  target_node: z.string().min(1),
  response_title: z.string().optional(),
  response_text: z.string().min(1),
  quick_replies: z.array(z.string()).optional(),
}).strict();

export const OperatingHoursPolicySchema = z.object({
  enabled: z.boolean().default(true),
  timezone: z.string().default('Asia/Jakarta'),
  schedule_description: z.string().optional(),
  schedules: z.record(z.string(), z.string()).optional(),
  outside_hours_auto_reply: z.string().optional(),
  allow_inbound_during_closed: z.boolean().default(true),
}).strict();

export const SlotFillingRulesSchema = z.object({
  required_slots: z.array(z.string().min(1)),
  slot_prompts: z.record(z.string(), z.string()).optional(),
  allow_partial_submission: z.boolean().default(true),
  prohibited_slot_values: z.array(z.string().min(1)).optional(),
}).strict();

export const ConversationPolicySchema = z.object({
  bot_name: z.string().min(1),
  tone_of_voice: z.string().min(1),
  greeting_message: z.string().optional(),
  custom_greeting_message: z.string().optional(),
  greeting_mode: z.enum(['SINGLE_BUBBLE', 'MULTI_BUBBLE']).default('SINGLE_BUBBLE'),
  language: z.enum(['id', 'en']).default('id'),
  max_output_tokens: z.number().int().min(64).max(8192).default(2048),
  primary_call_to_action: z.string().optional(),
  fallback_message: z.string().optional(),
  operating_hours: OperatingHoursPolicySchema.optional(),
  slot_filling_rules: SlotFillingRulesSchema.optional(),
  interactive_menus: z.array(InteractiveMenuSchema).optional(),
  campaign_routes: z.array(CampaignRouteRuleSchema).optional(),
  quick_replies: z.array(z.string().min(1)).optional(),
}).strict();

export type ConversationPolicy = z.infer<typeof ConversationPolicySchema>;

// ============================================================================
// 3. BUSINESS CONFIG REF SCHEMAS
// ============================================================================

export const ClinicDoctorConfigSchema = z.object({
  doctor_id: z.string().optional(),
  doctor_name: z.string().min(1),
  specialty: z.string().optional(),
  schedule: z.string().optional(),
  is_active: z.boolean().default(true),
  photo_url: z.string().optional(),
}).strict();

export type ClinicDoctorConfig = z.infer<typeof ClinicDoctorConfigSchema>;

export const PaymentAccountConfigSchema = z.object({
  bank_name: z.string().min(1),
  account_number: z.string().min(1),
  account_holder: z.string().min(1),
  is_primary: z.boolean().default(false),
}).strict();

export type PaymentAccountConfig = z.infer<typeof PaymentAccountConfigSchema>;

export const BusinessConfigRefSchema = z.object({
  tenant_id: z.string().min(1),
  tenant_slug: z.string().min(1),
  store_name: z.string().min(1),
  business_category: z.string().min(1),
  headline: z.string().optional(),
  subheadline: z.string().optional(),
  official_whatsapp: z.string().optional(),
  custom_domain: z.string().optional(),
  storefront_url: z.string().url().optional(),
  doctors: z.array(ClinicDoctorConfigSchema).optional(),
  payment_accounts: z.array(PaymentAccountConfigSchema).optional(),
  qris_payload: z.string().optional(),
  screening_url: z.string().url().optional(),
  assessment_url: z.string().url().optional(),
  catalog_product_ids: z.array(z.union([z.string(), z.number()])).optional(),
}).strict();

export type BusinessConfigRef = z.infer<typeof BusinessConfigRefSchema>;

// ============================================================================
// 4. SAFETY POLICY SCHEMAS
// ============================================================================

export const SafetyPolicySchema = z.object({
  fail_closed: z.boolean().default(true),
  clinical_safety_gate: z.boolean().default(false),
  emergency_disclaimer: z.string().optional(),
  disclaimer_triggers: z.array(z.string().min(1)).default([]),
  blocked_keywords: z.array(z.string().min(1)).default([]),
  restricted_terms: z.array(z.string().min(1)).default([]),
  require_human_escalation_on_emergency: z.boolean().default(true),
  max_consecutive_fallbacks: z.number().int().min(1).default(3),
  human_handover_timeout_minutes: z.number().int().min(1).default(120),
}).strict();

export type SafetyPolicy = z.infer<typeof SafetyPolicySchema>;

// ============================================================================
// 5. ROOT TENANT BOT CONFIG SCHEMA (FAIL-CLOSED)
// ============================================================================

/**
 * Root TenantBotConfigSchema.
 * Enforces strict validation across all sub-fields.
 * Any arbitrary unrecognized key will throw a ZodError (Fail-Closed).
 */
export const TenantBotConfigSchema = z.object({
  blueprint_code: BlueprintCodeSchema,
  config_version: ConfigVersionSchema,
  conversation_policy: ConversationPolicySchema,
  business_config_ref: BusinessConfigRefSchema,
  safety_policy: SafetyPolicySchema,
}).strict();

export type TenantBotConfig = z.infer<typeof TenantBotConfigSchema>;

// ============================================================================
// 6. RUNTIME VALIDATION UTILITIES
// ============================================================================

/**
 * Validates a configuration payload against TenantBotConfigSchema.
 * Throws a detailed ZodError if invalid or containing arbitrary keys.
 */
export function validateTenantBotConfig(data: unknown): TenantBotConfig {
  return TenantBotConfigSchema.parse(data);
}

/**
 * Safely parses a configuration payload without throwing.
 */
export function safeParseTenantBotConfig(data: unknown) {
  return TenantBotConfigSchema.safeParse(data);
}

// ============================================================================
// 7. CONFIG LIFECYCLE & ROLLBACK ENGINE (CTO Mandate)
// ============================================================================

export interface ConfigLifecycleResolutionResult {
  status: 'ACTIVE' | 'ROLLEDBACK' | 'INVALID_NO_FALLBACK';
  effectiveConfig: TenantBotConfig | null;
  activeVersion: string | null;
  error?: string;
  validationIssues?: z.ZodIssue[];
}

/**
 * Resolves candidate configuration with automatic rollback to lastKnownGoodConfig
 * if the candidate is invalid or fails schema contract (Fail-Closed Lifecycle).
 */
export function resolveConfigWithRollback(
  candidateConfig: unknown,
  lastKnownGoodConfig?: TenantBotConfig | unknown
): ConfigLifecycleResolutionResult {
  const parsedCandidate = TenantBotConfigSchema.safeParse(candidateConfig);

  if (parsedCandidate.success) {
    return {
      status: 'ACTIVE',
      effectiveConfig: parsedCandidate.data,
      activeVersion: parsedCandidate.data.config_version,
    };
  }

  // Candidate failed validation. Attempt rollback to last known good config if available.
  if (lastKnownGoodConfig !== undefined && lastKnownGoodConfig !== null) {
    const parsedFallback = TenantBotConfigSchema.safeParse(lastKnownGoodConfig);
    if (parsedFallback.success) {
      const candidateVer = (candidateConfig as any)?.config_version || 'unknown';
      return {
        status: 'ROLLEDBACK',
        effectiveConfig: parsedFallback.data,
        activeVersion: parsedFallback.data.config_version,
        error: `Candidate configuration (version ${candidateVer}) is invalid: ${parsedCandidate.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join(', ')}. Rolled back to version ${parsedFallback.data.config_version}.`,
        validationIssues: parsedCandidate.error.issues,
      };
    }
  }

  return {
    status: 'INVALID_NO_FALLBACK',
    effectiveConfig: null,
    activeVersion: null,
    error: `Candidate configuration is invalid and no valid fallback version exists: ${parsedCandidate.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join(', ')}`,
    validationIssues: parsedCandidate.error.issues,
  };
}

/**
 * Evaluates whether newVersion is a strict SemVer progression (upgrade) over currentVersion.
 */
export function isSemverUpgrade(currentVersion: string, newVersion: string): boolean {
  const semverRegex = /^(\d+)\.(\d+)\.(\d+)/;
  const matchCurrent = currentVersion.match(semverRegex);
  const matchNew = newVersion.match(semverRegex);
  if (!matchCurrent || !matchNew) return false;

  const [majC, minC, patC] = [parseInt(matchCurrent[1], 10), parseInt(matchCurrent[2], 10), parseInt(matchCurrent[3], 10)];
  const [majN, minN, patN] = [parseInt(matchNew[1], 10), parseInt(matchNew[2], 10), parseInt(matchNew[3], 10)];

  if (majN > majC) return true;
  if (majN === majC && minN > minC) return true;
  if (majN === majC && minN === minC && patN > patC) return true;
  return false;
}

