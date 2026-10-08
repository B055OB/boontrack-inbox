/**
 * lib/creditLedger.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized writer for credit_consumption_events and credit_transactions.
 *
 * Usage – record an AI invocation:
 *   import { recordAIConsumption } from '@/lib/creditLedger';
 *   await recordAIConsumption({
 *     tenantSlug: 'mystore',
 *     feature: 'WHATSAPP_BOT',
 *     inputTokens: 320,
 *     outputTokens: 180,
 *     latencyMs: 740,
 *   });
 *
 * Usage – record a revenue transaction:
 *   import { recordCreditTransaction } from '@/lib/creditLedger';
 *   await recordCreditTransaction({
 *     tenantSlug: 'mystore',
 *     type: 'SUBSCRIPTION_PAYMENT',
 *     amountIdr: 149000,
 *     invoiceId: 'inv_xxx',
 *     tier: 'PRO_SCALE',
 *   });
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getSupabaseAdmin } from '@/lib/supabaseClient';

// ── Cost constants ─────────────────────────────────────────────────────────────
const IDR_PER_USD = 16200;
/**
 * Gemini 2.5 Flash pricing (blended input+output):
 * - Input:  $0.075 / 1M tokens
 * - Output: $0.300 / 1M tokens
 * Typical chat mix (60% input / 40% output) → blended ~$0.165/1M
 */
const GEMINI_INPUT_COST_PER_M_USD = 0.075;
const GEMINI_OUTPUT_COST_PER_M_USD = 0.30;

function calcGeminiCostIdr(inputTokens: number, outputTokens: number): number {
  const inputCostUsd = (inputTokens / 1_000_000) * GEMINI_INPUT_COST_PER_M_USD;
  const outputCostUsd = (outputTokens / 1_000_000) * GEMINI_OUTPUT_COST_PER_M_USD;
  return Math.round((inputCostUsd + outputCostUsd) * IDR_PER_USD * 100) / 100;
}

// ── Supported feature keys ────────────────────────────────────────────────────
export type AIFeature =
  | 'WHATSAPP_BOT'
  | 'BOONPILOT_CHAT'
  | 'VISION_SCAN'
  | 'LANDING_PAGE_GEN'
  | 'BROADCAST_AI'
  | 'ADS_ANALYSIS'
  | 'OTHER';

export type CreditTransactionType =
  | 'SUBSCRIPTION_PAYMENT'
  | 'TOPUP_CREDIT'
  | 'REFUND'
  | 'BONUS_CREDIT'
  | 'ADJUSTMENT';

// ── Interfaces ────────────────────────────────────────────────────────────────
export interface RecordAIConsumptionParams {
  tenantSlug: string;
  feature: AIFeature;
  inputTokens: number;
  outputTokens: number;
  /** Response latency in milliseconds */
  latencyMs?: number;
  /** Session ID for tracing */
  sessionId?: string;
  /** Override model name (default: gemini-3.8-flash) */
  model?: string;
  /** Manually override IDR cost (skip auto-calc) */
  costIdrOverride?: number;
}

export interface RecordCreditTransactionParams {
  tenantSlug: string;
  type: CreditTransactionType;
  amountIdr: number;
  tier?: string;
  durationMonths?: number;
  invoiceId?: string;
  paymentChannel?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

// ── Tenant ID cache (avoid repeated DB roundtrips) ────────────────────────────
const tenantIdCache = new Map<string, string>();

async function resolveTenantId(slug: string): Promise<string | null> {
  if (tenantIdCache.has(slug)) return tenantIdCache.get(slug)!;

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .single();

    if (data?.id) {
      tenantIdCache.set(slug, data.id);
      return data.id;
    }
  } catch {
    // ignore
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Records a single AI model invocation to credit_consumption_events.
 * Fire-and-forget safe — errors are caught and logged, never rethrown.
 */
export async function recordAIConsumption(params: RecordAIConsumptionParams): Promise<void> {
  try {
    const tenantId = await resolveTenantId(params.tenantSlug);
    if (!tenantId) {
      console.warn(`[creditLedger] Tenant not found: ${params.tenantSlug}`);
      return;
    }

    const costIdr =
      params.costIdrOverride !== undefined
        ? params.costIdrOverride
        : calcGeminiCostIdr(params.inputTokens, params.outputTokens);

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('credit_consumption_events').insert({
      tenant_id: tenantId,
      tenant_slug: params.tenantSlug,
      feature: params.feature,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      cost_idr: costIdr,
      model: params.model ?? 'gemini-3.8-flash',
      latency_ms: params.latencyMs ?? null,
      session_id: params.sessionId ?? null,
    });

    if (error) {
      console.warn(`[creditLedger] Insert error (credit_consumption_events):`, error.message);
    }
  } catch (err) {
    // Never surface ledger write errors to the user
    console.warn(`[creditLedger] recordAIConsumption failed silently:`, err);
  }
}

/**
 * Records a revenue/billing event to credit_transactions.
 * Call this from subscription payment webhooks and credit top-up handlers.
 */
export async function recordCreditTransaction(
  params: RecordCreditTransactionParams,
): Promise<{ id: string } | null> {
  try {
    const tenantId = await resolveTenantId(params.tenantSlug);
    if (!tenantId) {
      console.warn(`[creditLedger] Tenant not found: ${params.tenantSlug}`);
      return null;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('credit_transactions')
      .insert({
        tenant_id: tenantId,
        tenant_slug: params.tenantSlug,
        type: params.type,
        amount_idr: params.amountIdr,
        tier: params.tier ?? null,
        duration_months: params.durationMonths ?? null,
        invoice_id: params.invoiceId ?? null,
        payment_channel: params.paymentChannel ?? 'XENDIT',
        status: 'COMPLETED',
        notes: params.notes ?? null,
        metadata: params.metadata ?? {},
      })
      .select('id')
      .single();

    if (error) {
      console.warn(`[creditLedger] Insert error (credit_transactions):`, error.message);
      return null;
    }

    return { id: data.id };
  } catch (err) {
    console.warn(`[creditLedger] recordCreditTransaction failed:`, err);
    return null;
  }
}

/**
 * Convenience: Get total cost IDR for a tenant in a given month.
 * Used for per-tenant billing reconciliation.
 */
export async function getTenantAICostMtd(
  tenantSlug: string,
  monthStart?: Date,
): Promise<number> {
  try {
    const supabase = getSupabaseAdmin();
    const fromDate = monthStart
      ? monthStart.toISOString()
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const { data } = await supabase
      .from('credit_consumption_events')
      .select('cost_idr')
      .eq('tenant_slug', tenantSlug)
      .gte('created_at', fromDate);

    return (data || []).reduce((sum, r) => sum + Number(r.cost_idr || 0), 0);
  } catch {
    return 0;
  }
}
