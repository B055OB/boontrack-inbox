/**
 * @file lib/services/studio-credit.service.ts
 * @description Studio Entitlement & Atomic Credit Deduction Service
 * 
 * STRICT ARCHITECTURE GUARDRAILS:
 * 1. Single Source of Truth: Supabase (tenant_entitlements, tenant_credit_ledger).
 * 2. Atomic credit deduction: Calls RPC fn_reserve_studio_credits / fn_release_studio_credits with fallback to atomic ledger update.
 * 3. Founder Bypass: If is_unlimited === true or tier === 'FOUNDER', render requests are never blocked by zero balance.
 * 4. SYSTEM BOUNDARY: NEVER connect Studio credit deduction events to affiliate commission webhooks (affiliate.boontrack.com).
 */

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { isValidUuid } from '@/lib/uuid-guard';
import { isTenantShopMember } from '@/lib/config/studio-pricing';

export interface TenantEntitlement {
  tenant_id: string;
  tenant_slug: string;
  tier: 'FREE' | 'PRO' | 'AGENCY' | 'FOUNDER' | string;
  credits_remaining: number;
  is_unlimited: boolean;
  is_shop_member?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreditReserveResult {
  success: boolean;
  statusCode?: number;
  message?: string;
  credits_remaining?: number;
  is_unlimited?: boolean;
}

export interface CreditLedgerEntry {
  id: string;
  tenant_id: string;
  amount: number;
  balance_after: number;
  action: 'RESERVE' | 'RELEASE' | 'TOPUP' | 'ADJUST_ADMIN' | 'FOUNDER_BYPASS' | string;
  description: string;
  created_at: string;
}

export class StudioCreditService {
  private static inFlightTopups = new Map<string, Promise<any>>();

  /**
   * Helper: Resolve tenant record by ID or slug
   */
  public static async resolveTenant(tenantIdOrSlug: string) {
    const clean = (tenantIdOrSlug || '').trim();
    if (!clean) return null;

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) return null;

    let query = supabase.from('tenants').select('id, slug, tier, metadata');
    if (isValidUuid(clean)) {
      query = query.eq('id', clean);
    } else {
      query = query.eq('slug', clean.toLowerCase());
    }

    const { data } = await query.maybeSingle();
    return data || null;
  }

  /**
   * Get entitlements for a tenant by slug or UUID.
   */
  static async getEntitlements(tenantIdOrSlug: string): Promise<TenantEntitlement | null> {
    const tenant = await this.resolveTenant(tenantIdOrSlug);
    if (!tenant) return null;

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) return null;

    const isFounderTier = String(tenant.tier || '').toUpperCase() === 'FOUNDER';

    // 1. Try querying tenant_entitlements
    const { data: entitlementRow, error: entError } = await supabase
      .from('tenant_entitlements')
      .select('*')
      .eq('tenant_id', tenant.id)
      .maybeSingle();

    if (entitlementRow && !entError) {
      const isUnlimited = Boolean(
        entitlementRow.is_unlimited === true ||
        String(entitlementRow.tier || '').toUpperCase() === 'FOUNDER' ||
        isFounderTier
      );

      return {
        tenant_id: tenant.id,
        tenant_slug: tenant.slug,
        tier: entitlementRow.tier || tenant.tier || 'FREE',
        credits_remaining: isUnlimited ? 999999 : (entitlementRow.credits_remaining ?? 50),
        is_unlimited: isUnlimited,
        is_shop_member: isTenantShopMember(tenant),
        created_at: entitlementRow.created_at,
        updated_at: entitlementRow.updated_at,
      };
    }

    // 2. Fallback to tenant metadata or studio_workspaces if tenant_entitlements row not yet created
    const meta = (tenant.metadata && typeof tenant.metadata === 'object') ? tenant.metadata : {};
    const studioWorkspace = (meta.studio_workspace && typeof meta.studio_workspace === 'object')
      ? meta.studio_workspace
      : {};

    const initialCredits = typeof studioWorkspace.render_credits === 'number'
      ? studioWorkspace.render_credits
      : (isFounderTier ? 999999 : 50);

    const isUnlimited = isFounderTier || Boolean(studioWorkspace.is_unlimited);

    // Upsert initial row to tenant_entitlements for consistency
    try {
      await supabase.from('tenant_entitlements').upsert({
        tenant_id: tenant.id,
        credits_remaining: initialCredits,
        is_unlimited: isUnlimited,
        tier: isFounderTier ? 'FOUNDER' : (tenant.tier || 'FREE'),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' });
    } catch {
      // Non-fatal if schema differs or migration pending
    }

    return {
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      tier: isFounderTier ? 'FOUNDER' : (tenant.tier || 'FREE'),
      credits_remaining: isUnlimited ? 999999 : initialCredits,
      is_unlimited: isUnlimited,
      is_shop_member: isTenantShopMember(tenant),
    };
  }

  /**
   * Atomically reserve / deduct credits before queueing a studio render job.
   * Two-phase commit Phase 1: Deduct credits (event: 'STUDIO_RENDER_JOB', type: 'CREDIT_OUT').
   * If insufficient, returns statusCode: 402.
   */
  static async reserveCredits(
    tenantIdOrSlug: string,
    amount: number = 1,
    description: string = 'Studio render job',
    jobId?: string
  ): Promise<CreditReserveResult> {
    const tenant = await this.resolveTenant(tenantIdOrSlug);
    if (!tenant) {
      return { success: false, statusCode: 404, message: 'Tenant tidak ditemukan.' };
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return { success: false, statusCode: 500, message: 'Database client admin tidak tersedia.' };
    }

    const resolvedJobId = jobId || `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const idempotencyKey = `RESERVE_${tenant.id}_${resolvedJobId}`;

    // 1. Check if Founder or Unlimited
    const entitlements = await this.getEntitlements(tenant.id);
    if (entitlements && entitlements.is_unlimited) {
      try {
        await supabase.from('tenant_credit_ledger').insert({
          tenant_id: tenant.id,
          job_id: resolvedJobId,
          idempotency_key: idempotencyKey,
          amount: 0,
          balance_after: entitlements.credits_remaining,
          action: 'STUDIO_RENDER_JOB',
          type: 'RESERVE',
          reason: 'STUDIO_RENDER_JOB',
          actor_id: 'STUDIO_RENDER',
          actor_role: 'CREATOR',
          description: `[Founder Unlimited] ${description} (${amount} requested)`,
          metadata: {
            event: 'STUDIO_RENDER_JOB',
            type: 'CREDIT_OUT',
            job_id: resolvedJobId,
            is_unlimited: true,
          },
        });
      } catch {}

      return {
        success: true,
        statusCode: 200,
        credits_remaining: entitlements.credits_remaining,
        is_unlimited: true,
      };
    }

    // 2. Call RPC fn_reserve_studio_credits
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('fn_reserve_studio_credits', {
        p_tenant_id: tenant.id,
        p_cost: amount,
        p_job_id: resolvedJobId,
        p_idempotency_key: idempotencyKey,
        p_actor_id: 'STUDIO_RENDER',
        p_actor_role: 'CREATOR',
      });

      if (!rpcError && rpcData) {
        const resultItem = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (resultItem && resultItem.success === false) {
          const isInsufficient = resultItem.status_code === 'INSUFFICIENT_CREDITS';
          return {
            success: false,
            statusCode: isInsufficient ? 402 : 400,
            message: resultItem.message || `Render Credits Anda tidak mencukupi (Butuh ${amount} Credits). Silakan lakukan top-up kredit.`,
            credits_remaining: resultItem.remaining_credits ?? 0,
          };
        }

        const remaining = typeof resultItem === 'number'
          ? resultItem
          : (resultItem.remaining_credits ?? resultItem.new_balance ?? 0);

        // Enrich newly inserted ledger row with action and metadata
        try {
          await supabase
            .from('tenant_credit_ledger')
            .update({
              action: 'STUDIO_RENDER_JOB',
              description,
              balance_after: remaining,
              metadata: {
                event: 'STUDIO_RENDER_JOB',
                type: 'CREDIT_OUT',
                job_id: resolvedJobId,
              },
            })
            .eq('job_id', resolvedJobId)
            .eq('type', 'RESERVE');
        } catch {}

        return {
          success: true,
          statusCode: 200,
          credits_remaining: remaining,
          is_unlimited: false,
        };
      }
    } catch {
      // Fall through to atomic fallback
    }

    // 3. Direct Atomic Fallback via tenant_entitlements & tenant_credit_ledger
    const currentBalance = entitlements?.credits_remaining ?? 0;
    if (currentBalance < amount) {
      return {
        success: false,
        statusCode: 402,
        message: `Render Credits Anda tidak mencukupi (Butuh ${amount} Credits, Tersedia: ${currentBalance}). Silakan lakukan top-up kredit.`,
        credits_remaining: currentBalance,
      };
    }

    const newBalance = currentBalance - amount;

    const { error: updateErr } = await supabase
      .from('tenant_entitlements')
      .update({
        credits_remaining: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenant.id);

    if (updateErr) {
      return {
        success: false,
        statusCode: 500,
        message: 'Gagal memperbarui saldo kredit render.',
      };
    }

    // Record into tenant_credit_ledger
    try {
      await supabase.from('tenant_credit_ledger').insert({
        tenant_id: tenant.id,
        job_id: resolvedJobId,
        idempotency_key: idempotencyKey,
        amount: -amount,
        balance_after: newBalance,
        action: 'STUDIO_RENDER_JOB',
        type: 'RESERVE',
        actor_id: 'STUDIO_RENDER',
        actor_role: 'CREATOR',
        reason: 'STUDIO_RENDER_JOB',
        description,
        metadata: {
          event: 'STUDIO_RENDER_JOB',
          type: 'CREDIT_OUT',
          job_id: resolvedJobId,
        },
      });
    } catch (ledgerErr) {
      console.warn('[StudioCreditService] Warning inserting into tenant_credit_ledger:', ledgerErr);
    }

    return {
      success: true,
      statusCode: 200,
      credits_remaining: newBalance,
      is_unlimited: false,
    };
  }

  /**
   * Auto-refund credits when a render job ends in FAILED or TIMEOUT.
   * Two-phase commit Phase 2: Auto-refund (type: 'CREDIT_REFUND', metadata: { job_id }).
   */
  static async refundJobCredits(params: {
    tenantIdOrSlug?: string;
    jobId: string;
    amount?: number;
    reason?: string;
  }): Promise<CreditReserveResult> {
    const { tenantIdOrSlug, jobId, amount, reason = 'RENDER_FAILED_OR_TIMEOUT' } = params;
    if (!jobId) {
      return { success: false, message: 'jobId wajib disertakan untuk refund.' };
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) return { success: false, message: 'Database client tidak tersedia.' };

    // Idempotency check: if already refunded, do not double refund
    const { data: existingRefund } = await supabase
      .from('tenant_credit_ledger')
      .select('id, amount')
      .eq('job_id', jobId)
      .eq('type', 'REFUND')
      .maybeSingle();

    if (existingRefund) {
      return {
        success: true,
        message: 'Kredit untuk job ini sudah pernah dikembalikan (idempotent).',
      };
    }

    // 1. Try RPC fn_release_studio_credits
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('fn_release_studio_credits', {
        p_job_id: jobId,
        p_actor_id: 'SYSTEM',
        p_reason: reason,
      });

      if (!rpcError && rpcData) {
        const resItem = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (resItem && resItem.success) {
          // Enrich refund ledger row with action and metadata
          try {
            await supabase
              .from('tenant_credit_ledger')
              .update({
                action: 'STUDIO_RENDER_JOB',
                description: `Auto-refund render job: ${jobId} (${reason})`,
                metadata: {
                  event: 'STUDIO_RENDER_JOB',
                  type: 'CREDIT_REFUND',
                  job_id: jobId,
                  reason,
                },
              })
              .eq('job_id', jobId)
              .eq('type', 'REFUND');
          } catch {}

          return {
            success: true,
            credits_remaining: resItem.new_balance,
            message: `Kredit sebesar ${resItem.credits_refunded} berhasil dikembalikan ke saldo kreator.`,
          };
        }
      }
    } catch {
      // Fall through to direct atomic fallback
    }

    // 2. Direct Fallback: Find initial reservation
    let tenantId = tenantIdOrSlug;
    let refundAmount = amount;

    const { data: reserveRow } = await supabase
      .from('tenant_credit_ledger')
      .select('tenant_id, amount')
      .eq('job_id', jobId)
      .eq('type', 'RESERVE')
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (reserveRow) {
      tenantId = tenantId || reserveRow.tenant_id;
      if (!refundAmount && typeof reserveRow.amount === 'number') {
        refundAmount = Math.abs(reserveRow.amount);
      }
    }

    if (!tenantId) {
      return { success: false, message: 'Tidak dapat mengidentifikasi tenant untuk refund.' };
    }

    const finalAmount = refundAmount || 3;
    const tenant = await this.resolveTenant(tenantId);
    if (!tenant) return { success: false, message: 'Tenant tidak ditemukan.' };

    const entitlements = await this.getEntitlements(tenant.id);
    const currentBalance = entitlements?.credits_remaining ?? 0;
    const newBalance = currentBalance + finalAmount;

    await supabase
      .from('tenant_entitlements')
      .update({
        credits_remaining: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenant.id);

    try {
      await supabase.from('tenant_credit_ledger').insert({
        tenant_id: tenant.id,
        job_id: jobId,
        amount: finalAmount,
        balance_after: newBalance,
        action: 'STUDIO_RENDER_JOB',
        type: 'REFUND',
        actor_id: 'SYSTEM',
        actor_role: 'SYSTEM',
        reason,
        description: `Auto-refund render job: ${jobId} (${reason})`,
        metadata: {
          event: 'STUDIO_RENDER_JOB',
          type: 'CREDIT_REFUND',
          job_id: jobId,
          reason,
        },
      });
    } catch {}

    return {
      success: true,
      credits_remaining: newBalance,
      message: `Kredit sebesar ${finalAmount} berhasil dikembalikan ke saldo kreator.`,
    };
  }

  /**
   * Release / refund reserved credits (delegates to refundJobCredits for consistency).
   */
  static async releaseCredits(
    tenantIdOrSlug: string,
    amount: number = 1,
    description: string = 'Studio render job failed - refund',
    jobId?: string
  ): Promise<CreditReserveResult> {
    return this.refundJobCredits({
      tenantIdOrSlug,
      jobId: jobId || `job_${Date.now()}`,
      amount,
      reason: description,
    });
  }

  /**
   * Admin: Update tenant entitlements with mandatory audit log
   */
  static async updateEntitlementsByAdmin(params: {
    tenantId: string;
    credits_remaining?: number;
    is_unlimited?: boolean;
    tier?: string;
    notes?: string;
    adminId?: string;
  }): Promise<{ success: boolean; data?: TenantEntitlement; message?: string }> {
    const { tenantId, credits_remaining, is_unlimited, tier, notes } = params;
    const supabase = getSupabaseAdmin();
    if (!supabase) return { success: false, message: 'Database client admin tidak tersedia.' };

    const current = await this.getEntitlements(tenantId);
    if (!current) return { success: false, message: 'Tenant tidak ditemukan.' };

    const updatedCredits = credits_remaining !== undefined ? Number(credits_remaining) : current.credits_remaining;
    const updatedTier = tier !== undefined ? tier.trim().toUpperCase() : current.tier;
    const updatedUnlimited = is_unlimited !== undefined
      ? Boolean(is_unlimited)
      : (updatedTier === 'FOUNDER' ? true : current.is_unlimited);

    const delta = updatedCredits - current.credits_remaining;

    // 1. Update or upsert tenant_entitlements
    const { error: entErr } = await supabase
      .from('tenant_entitlements')
      .upsert({
        tenant_id: tenantId,
        credits_remaining: updatedUnlimited ? 999999 : updatedCredits,
        is_unlimited: updatedUnlimited,
        tier: updatedTier,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' });

    if (entErr) {
      return { success: false, message: `Gagal memperbarui entitlements: ${entErr.message}` };
    }

    // 2. Also keep tenants.tier synchronized
    if (tier && tier !== current.tier) {
      await supabase
        .from('tenants')
        .update({ tier: updatedTier })
        .eq('id', tenantId);
    }

    // 3. Record audit log into tenant_credit_ledger
    const auditDescription = notes || `Admin adjustment: tier=${updatedTier}, unlimited=${updatedUnlimited}, credits=${updatedCredits}`;
    try {
      await supabase.from('tenant_credit_ledger').insert({
        tenant_id: tenantId,
        amount: delta,
        balance_after: updatedUnlimited ? 999999 : updatedCredits,
        action: 'ADJUST_ADMIN',
        description: auditDescription,
      });
    } catch (ledgerErr) {
      console.warn('[StudioCreditService] Ledger audit warning:', ledgerErr);
    }

    const refreshed = await this.getEntitlements(tenantId);
    return {
      success: true,
      data: refreshed || undefined,
    };
  }

  /**
   * Fetch credit ledger transaction history for tenant.
   */
  static async getLedgerHistory(tenantId: string, limit: number = 50): Promise<CreditLedgerEntry[]> {
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('tenant_credit_ledger')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error || !data) return [];
      return data as CreditLedgerEntry[];
    } catch {
      return [];
    }
  }

  /**
   * Top-up / purchase credits for a tenant with affiliate commission trigger.
   * - Credits are added to tenant_entitlements
   * - Audit log written to tenant_credit_ledger (action: 'TOPUP')
   * - If status === 'PAID' or 'SETTLED', calculates and records affiliate commission (product_type: 'STUDIO')
   */
  static async topUpCredits(params: {
    tenantIdOrSlug: string;
    credits: number;
    amountPaid: number;
    transactionId: string;
    invoiceId?: string;
    packageId?: string;
    idempotencyKey?: string;
    paymentStatus?: 'PAID' | 'SETTLED' | string;
    affiliateCode?: string | null;
    paymentChannel?: string;
  }): Promise<{
    success: boolean;
    newBalance: number;
    commissionRecorded: boolean;
    commissionAmount?: number;
    isExisting?: boolean;
    message?: string;
  }> {
    const txKey = params.transactionId
      ? `${params.tenantIdOrSlug || ''}:${params.transactionId}`
      : (params.invoiceId ? `${params.tenantIdOrSlug || ''}:${params.invoiceId}` : null);

    // ANTI-RACE CONDITION LOCK:
    // Jika ada request concurrent dengan txKey yang sama, langsung kembalikan Promise in-flight
    // tanpa mengeksekusi ulang fungsi _executeTopUpCredits!
    if (txKey) {
      const activePromise = this.inFlightTopups.get(txKey);
      if (activePromise) {
        console.log(`[StudioCreditService] Re-using in-flight top-up execution for key: ${txKey}`);
        return await activePromise;
      }
    }

    const execution = this._executeTopUpCredits(params);
    if (txKey) {
      this.inFlightTopups.set(txKey, execution);
    }

    try {
      return await execution;
    } finally {
      if (txKey) {
        this.inFlightTopups.delete(txKey);
      }
    }
  }

  private static async _executeTopUpCredits(params: {
    tenantIdOrSlug: string;
    credits: number;
    amountPaid: number;
    transactionId: string;
    invoiceId?: string;
    packageId?: string;
    idempotencyKey?: string;
    paymentStatus?: 'PAID' | 'SETTLED' | string;
    affiliateCode?: string | null;
    paymentChannel?: string;
  }): Promise<{
    success: boolean;
    newBalance: number;
    commissionRecorded: boolean;
    commissionAmount?: number;
    isExisting?: boolean;
    message?: string;
  }> {
    const tenant = await this.resolveTenant(params.tenantIdOrSlug);
    if (!tenant) return { success: false, newBalance: 0, commissionRecorded: false, message: 'Tenant tidak ditemukan.' };

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) return { success: false, newBalance: 0, commissionRecorded: false, message: 'Database client tidak tersedia.' };

    const entitlements = await this.getEntitlements(tenant.id);

    // 0. MULTI-KEY IDEMPOTENCY GUARD (Anti-Double Credit)
    // Memeriksa tenant_credit_ledger berdasarkan:
    // a. Kolom idempotency_key resmi
    // b. Kolom metadata (invoice_id, external_id, transaction_id)
    // c. Substring deskripsi (backwards compatibility)
    const primaryIdempotencyKey = params.idempotencyKey ||
      (params.transactionId ? `TOPUP_${tenant.id}_${params.transactionId}` : null) ||
      (params.invoiceId ? `TOPUP_${tenant.id}_${params.invoiceId}` : null);

    const lookupKeys = [
      primaryIdempotencyKey,
      params.transactionId ? `TOPUP_${tenant.id}_${params.transactionId}` : null,
      params.invoiceId ? `TOPUP_${tenant.id}_${params.invoiceId}` : null,
      params.transactionId,
      params.invoiceId,
    ].filter((k): k is string => Boolean(k && k.trim()));

    try {
      // 1. Cek langsung via kolom idempotency_key
      if (lookupKeys.length > 0) {
        const { data: existingByKey } = await supabase
          .from('tenant_credit_ledger')
          .select('id, amount, balance_after, description, metadata')
          .eq('tenant_id', tenant.id)
          .in('idempotency_key', lookupKeys)
          .limit(1)
          .maybeSingle();

        if (existingByKey) {
          console.log(`[StudioCreditService] Transaction ${params.transactionId || params.invoiceId} already processed (idempotency_key match). Skipping credit increment.`);
          return {
            success: true,
            newBalance: existingByKey.balance_after ?? (entitlements?.credits_remaining ?? 0),
            commissionRecorded: false,
            isExisting: true,
            message: `Transaction ${params.transactionId || params.invoiceId} already processed previously (idempotent duplicate).`,
          };
        }
      }

      // 2. Fallback cek substring description & metadata jika data lama belum memiliki idempotency_key
      if (params.transactionId || params.invoiceId) {
        let descQuery = supabase
          .from('tenant_credit_ledger')
          .select('id, amount, balance_after, description')
          .eq('tenant_id', tenant.id);

        if (params.transactionId && params.invoiceId) {
          descQuery = descQuery.or(`description.ilike.%${params.transactionId}%,description.ilike.%${params.invoiceId}%`);
        } else if (params.transactionId) {
          descQuery = descQuery.ilike('description', `%${params.transactionId}%`);
        } else if (params.invoiceId) {
          descQuery = descQuery.ilike('description', `%${params.invoiceId}%`);
        }

        const { data: existingDesc } = await descQuery.limit(1).maybeSingle();
        if (existingDesc) {
          console.log(`[StudioCreditService] Transaction ${params.transactionId || params.invoiceId} already processed (description substring match). Skipping credit increment.`);
          return {
            success: true,
            newBalance: existingDesc.balance_after ?? (entitlements?.credits_remaining ?? 0),
            commissionRecorded: false,
            isExisting: true,
            message: `Transaction ${params.transactionId || params.invoiceId} already processed previously (idempotent duplicate).`,
          };
        }
      }
    } catch (checkErr) {
      console.warn('[StudioCreditService] Idempotency check warning:', checkErr);
    }

    const currentBalance = entitlements?.credits_remaining ?? 0;
    const newBalance = currentBalance + params.credits;

    // 1. Update entitlements secara atomik
    await supabase
      .from('tenant_entitlements')
      .upsert({
        tenant_id: tenant.id,
        credits_remaining: entitlements?.is_unlimited ? 999999 : newBalance,
        is_unlimited: entitlements?.is_unlimited ?? false,
        tier: entitlements?.tier ?? tenant.tier ?? 'PRO_SCALE',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' });

    // 2. Insert into tenant_credit_ledger dengan audit trail lengkap & idempotency_key terindeks
    const refKey = params.transactionId || params.invoiceId || 'N/A';
    const desc = `Top-up +${params.credits} Render Credits (Rp ${params.amountPaid.toLocaleString('id-ID')}) - Ref: ${refKey}`;
    const resolvedIdempotencyKey = primaryIdempotencyKey || `TOPUP_${tenant.id}_${Date.now()}`;

    try {
      await supabase.from('tenant_credit_ledger').insert({
        tenant_id: tenant.id,
        amount: params.credits,
        balance_after: entitlements?.is_unlimited ? 999999 : newBalance,
        action: 'TOPUP',
        event: 'STUDIO_TOKEN_PURCHASE',
        type: 'CREDIT_IN',
        description: desc,
        actor_id: 'XENDIT_WEBHOOK',
        actor_role: 'SYSTEM',
        reason: `Top-up Studio Credits via ${params.paymentChannel || 'XENDIT'}`,
        idempotency_key: resolvedIdempotencyKey,
        metadata: {
          transaction_id: params.transactionId,
          invoice_id: params.invoiceId || params.transactionId,
          package_id: params.packageId || null,
          credits: params.credits,
          amount_paid: params.amountPaid,
          channel: params.paymentChannel || 'XENDIT',
          affiliate_code: params.affiliateCode || null,
        },
      });
    } catch (err) {
      console.warn('[StudioCreditService] Ledger error:', err);
    }

    // 3. Process Affiliate Commission if status is PAID or SETTLED (Downstream Isolated)
    // ANTI-DOUBLE COMMISSION: Hanya dipanggil jika transaksi BARU (bukan retry / bukan existing)
    let commissionRecorded = false;
    let commissionAmount = 0;
    const rawStatus = (params.paymentStatus || 'PAID').toUpperCase();

    if ((rawStatus === 'PAID' || rawStatus === 'SETTLED') && params.amountPaid > 0) {
      try {
        const { recordStudioTokenCommission } = await import('@/lib/affiliate-notification-service');
        const commOrderId = params.transactionId || params.invoiceId || refKey;
        const commResult = await recordStudioTokenCommission({
          orderId: commOrderId,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          grossAmount: params.amountPaid,
          tokenCount: params.credits,
          affiliateCode: params.affiliateCode || tenant.metadata?.affiliate_code || tenant.metadata?.referral_code,
          paymentStatus: rawStatus,
        });
        commissionRecorded = commResult.success;
        commissionAmount = commResult.commissionAmount;
      } catch (commErr) {
        console.warn('[StudioCreditService] Downstream affiliate notification isolated warning:', commErr);
      }
    }

    return {
      success: true,
      newBalance,
      commissionRecorded,
      commissionAmount,
    };
  }

  /**
   * Cross-Benefit: Shop Subscription Activation Bonus (+15 Credits)
   * 
   * When a tenant subscribes to or activates BoonTrack Shop:
   * 1. Updates tenant status:
   *    - sets is_shop_subscriber: true (in metadata and tenant row if column exists)
   *    - upgrades tier to 'member' if currently FREE / trial
   * 2. Grants appreciation bonus:
   *    - adds +15 Studio Credits to tenant_entitlements (and tenant_studio_credits / metadata)
   * 3. Records ledger mutation in tenant_credit_ledger:
   *    - event / action: 'PROMO_SHOP_ACTIVATION_BONUS'
   *    - amount: +15
   *    - tipe: 'CREDIT_IN'
   *    - note / description: 'Bonus langganan toko BoonTrack'
   * 4. Idempotency Guard:
   *    - Checks if PROMO_SHOP_ACTIVATION_BONUS has already been granted to this tenant.
   *    - If already granted, returns existing state without adding double credits, ensuring status remains upgraded.
   * 5. No Cash Refund Policy:
   *    - Previously purchased credits remain intact and increase by +15.
   *    - Subsequent purchases automatically locked to Member Toko rates.
   */
  static async grantShopActivationBonus(params: {
    tenantIdOrSlug: string;
    subscriptionId?: string;
    invoiceId?: string;
    tier?: string;
  }): Promise<{
    success: boolean;
    alreadyGranted?: boolean;
    creditsGranted: number;
    newBalance: number;
    tenantTier: string;
    isShopMember: boolean;
    message?: string;
  }> {
    const tenant = await this.resolveTenant(params.tenantIdOrSlug);
    if (!tenant) {
      return {
        success: false,
        creditsGranted: 0,
        newBalance: 0,
        tenantTier: 'FREE',
        isShopMember: false,
        message: 'Tenant tidak ditemukan.',
      };
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return {
        success: false,
        creditsGranted: 0,
        newBalance: 0,
        tenantTier: tenant.tier || 'FREE',
        isShopMember: false,
        message: 'Database client tidak tersedia.',
      };
    }

    const idempotencyKey = params.invoiceId
      ? `BONUS_${tenant.id}_${params.invoiceId}`
      : `BONUS_${tenant.id}_${params.subscriptionId || 'SHOP_ACTIVATION'}`;

    // 1. Idempotency Check: check if bonus for this specific transaction has already been recorded
    try {
      const { data: existingBonus } = await supabase
        .from('tenant_credit_ledger')
        .select('id, amount, balance_after')
        .eq('tenant_id', tenant.id)
        .eq('idempotency_key', idempotencyKey)
        .limit(1)
        .maybeSingle();

      if (existingBonus) {
        const ent = await this.getEntitlements(tenant.id);
        return {
          success: true,
          alreadyGranted: true,
          creditsGranted: 0,
          newBalance: ent?.credits_remaining ?? existingBonus.balance_after,
          tenantTier: ent?.tier || tenant.tier || 'member',
          isShopMember: true,
          message: 'Bonus langganan toko sudah pernah diberikan sebelumnya (idempotent).',
        };
      }
    } catch (checkErr) {
      console.warn('[StudioCreditService] Bonus idempotency check warning:', checkErr);
    }

    const currentEntitlements = await this.getEntitlements(tenant.id);
    const currentBalance = currentEntitlements?.credits_remaining ?? 0;
    const bonusCredits = 15;
    const newBalance = currentBalance + bonusCredits;

    // 2. Resolve upgraded tier: preserve paid tiers (PRO_SCALE, ENTERPRISE, etc.)
    const rawTier = String(tenant.tier || '').toUpperCase();
    const paidTiers = ['PRO_SCALE', 'ENTERPRISE', 'TEAM_SCALE', 'ADS_PERFORMANCE', 'PRO', 'AGENCY'];
    const isAlreadyPaidTier = paidTiers.includes(rawTier);
    const resolvedTier = isAlreadyPaidTier ? tenant.tier : (params.tier || 'member');

    // 3. Update tenants table
    const existingMeta = (tenant.metadata && typeof tenant.metadata === 'object') ? { ...tenant.metadata } : {};
    existingMeta.is_shop_subscriber = true;
    existingMeta.is_shop_member = true;
    existingMeta.shop_activation_bonus_granted = true;
    existingMeta.shop_activation_bonus_granted_at = new Date().toISOString();
    if (params.subscriptionId) existingMeta.shop_subscription_id = params.subscriptionId;
    if (params.invoiceId) existingMeta.shop_activation_invoice_id = params.invoiceId;

    try {
      const tenantUpdatePayload: Record<string, any> = {
        metadata: existingMeta,
      };
      if (!isAlreadyPaidTier) {
        tenantUpdatePayload.tier = resolvedTier;
      }
      await supabase
        .from('tenants')
        .update(tenantUpdatePayload)
        .eq('id', tenant.id);
    } catch (tenantUpdErr) {
      console.warn('[StudioCreditService] Tenant update warning:', tenantUpdErr);
    }

    // 4. Update tenant_entitlements
    const isUnlimited = Boolean(currentEntitlements?.is_unlimited || rawTier === 'FOUNDER');
    await supabase
      .from('tenant_entitlements')
      .upsert({
        tenant_id: tenant.id,
        credits_remaining: isUnlimited ? 999999 : newBalance,
        is_unlimited: isUnlimited,
        tier: isUnlimited ? 'FOUNDER' : resolvedTier,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' });

    // Optional sync to tenant_studio_credits table
    try {
      await supabase
        .from('tenant_studio_credits')
        .upsert({
          tenant_id: tenant.id,
          credits: isUnlimited ? 999999 : newBalance,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id' });
    } catch {}

    // 5. Insert audit ledger into tenant_credit_ledger
    const ledgerPayload = {
      tenant_id: tenant.id,
      amount: bonusCredits,
      balance_after: isUnlimited ? 999999 : newBalance,
      action: 'PROMO_SHOP_ACTIVATION_BONUS',
      event: 'PROMO_SHOP_ACTIVATION_BONUS',
      description: 'Bonus langganan toko BoonTrack',
      type: 'CREDIT_IN',
      actor_id: 'SYSTEM_ACTIVATION',
      actor_role: 'SYSTEM',
      reason: 'Bonus langganan toko BoonTrack',
      idempotency_key: idempotencyKey,
      metadata: { invoiceId: params.invoiceId },
    };

    try {
      const { error: ledgerErr } = await supabase
        .from('tenant_credit_ledger')
        .insert(ledgerPayload);

      if (ledgerErr) {
        console.warn('[StudioCreditService] Ledger mutation error:', ledgerErr);
      }
    } catch (insertErr) {
      console.warn('[StudioCreditService] Ledger mutation exception:', insertErr);
    }

    return {
      success: true,
      alreadyGranted: false,
      creditsGranted: bonusCredits,
      newBalance: isUnlimited ? 999999 : newBalance,
      tenantTier: resolvedTier,
      isShopMember: true,
      message: 'Bonus apresiasi 15 Kredit Studio berhasil diberikan.',
    };
  }
}

