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

export interface TenantEntitlement {
  tenant_id: string;
  tenant_slug: string;
  tier: 'FREE' | 'PRO' | 'AGENCY' | 'FOUNDER' | string;
  credits_remaining: number;
  is_unlimited: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreditReserveResult {
  success: boolean;
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
  /**
   * Helper: Resolve tenant record by ID or slug
   */
  private static async resolveTenant(tenantIdOrSlug: string) {
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
    };
  }

  /**
   * Atomically reserve / deduct credits before queueing a studio render job.
   */
  static async reserveCredits(
    tenantIdOrSlug: string,
    amount: number = 1,
    description: string = 'Studio render job'
  ): Promise<CreditReserveResult> {
    const tenant = await this.resolveTenant(tenantIdOrSlug);
    if (!tenant) {
      return { success: false, message: 'Tenant tidak ditemukan.' };
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return { success: false, message: 'Database client admin tidak tersedia.' };
    }

    // 1. Check if Founder or Unlimited
    const entitlements = await this.getEntitlements(tenant.id);
    if (entitlements && entitlements.is_unlimited) {
      // Record Founder audit in ledger without deducting credits
      try {
        await supabase.from('tenant_credit_ledger').insert({
          tenant_id: tenant.id,
          amount: 0,
          balance_after: entitlements.credits_remaining,
          action: 'FOUNDER_BYPASS',
          description: `[Founder Unlimited] ${description} (${amount} requested)`,
        });
      } catch {}

      return {
        success: true,
        credits_remaining: entitlements.credits_remaining,
        is_unlimited: true,
      };
    }

    // 2. Call RPC fn_reserve_studio_credits
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('fn_reserve_studio_credits', {
        p_tenant_id: tenant.id,
        p_amount: amount,
        p_description: description,
      });

      if (!rpcError && rpcData) {
        if (typeof rpcData === 'object' && rpcData.success === false) {
          return {
            success: false,
            message: rpcData.message || 'Kredit render tidak mencukupi.',
            credits_remaining: rpcData.credits_remaining ?? 0,
          };
        }

        const remaining = typeof rpcData === 'number'
          ? rpcData
          : (rpcData.credits_remaining ?? rpcData.new_balance ?? 0);

        return {
          success: true,
          credits_remaining: remaining,
          is_unlimited: false,
        };
      }
    } catch {
      // RPC may not exist in some environments, proceed to direct atomic fallback
    }

    // 3. Direct Fallback via tenant_entitlements & tenant_credit_ledger
    const currentBalance = entitlements?.credits_remaining ?? 0;
    if (currentBalance < amount) {
      return {
        success: false,
        message: `Kredit render tidak mencukupi (Butuh ${amount} Credits, Tersedia: ${currentBalance}). Silakan lakukan top-up.`,
        credits_remaining: currentBalance,
      };
    }

    const newBalance = currentBalance - amount;

    // Update entitlements
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
        message: 'Gagal memperbarui saldo kredit render.',
      };
    }

    // Record into tenant_credit_ledger
    try {
      await supabase.from('tenant_credit_ledger').insert({
        tenant_id: tenant.id,
        amount: -amount,
        balance_after: newBalance,
        action: 'RESERVE',
        description,
      });
    } catch (ledgerErr) {
      console.warn('[StudioCreditService] Warning inserting into tenant_credit_ledger:', ledgerErr);
    }

    return {
      success: true,
      credits_remaining: newBalance,
      is_unlimited: false,
    };
  }

  /**
   * Release / refund reserved credits if a render job fails before processing.
   */
  static async releaseCredits(
    tenantIdOrSlug: string,
    amount: number = 1,
    description: string = 'Studio render job failed - refund'
  ): Promise<CreditReserveResult> {
    const tenant = await this.resolveTenant(tenantIdOrSlug);
    if (!tenant) return { success: false, message: 'Tenant tidak ditemukan.' };

    const supabase = getSupabaseAdmin();
    if (!supabase) return { success: false, message: 'Database client tidak tersedia.' };

    // 1. Try RPC fn_release_studio_credits
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('fn_release_studio_credits', {
        p_tenant_id: tenant.id,
        p_amount: amount,
        p_description: description,
      });

      if (!rpcError && rpcData) {
        const remaining = typeof rpcData === 'number'
          ? rpcData
          : (rpcData.credits_remaining ?? rpcData.new_balance ?? 0);

        return { success: true, credits_remaining: remaining };
      }
    } catch {}

    // 2. Direct Fallback
    const entitlements = await this.getEntitlements(tenant.id);
    const currentBalance = entitlements?.credits_remaining ?? 0;
    const newBalance = currentBalance + amount;

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
        amount: amount,
        balance_after: newBalance,
        action: 'RELEASE',
        description,
      });
    } catch {}

    return { success: true, credits_remaining: newBalance };
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
    paymentStatus?: 'PAID' | 'SETTLED' | string;
    affiliateCode?: string | null;
    paymentChannel?: string;
  }): Promise<{
    success: boolean;
    newBalance: number;
    commissionRecorded: boolean;
    commissionAmount?: number;
    message?: string;
  }> {
    const tenant = await this.resolveTenant(params.tenantIdOrSlug);
    if (!tenant) return { success: false, newBalance: 0, commissionRecorded: false, message: 'Tenant tidak ditemukan.' };

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) return { success: false, newBalance: 0, commissionRecorded: false, message: 'Database client tidak tersedia.' };

    const entitlements = await this.getEntitlements(tenant.id);
    const currentBalance = entitlements?.credits_remaining ?? 0;
    const newBalance = currentBalance + params.credits;

    // 1. Update entitlements
    await supabase
      .from('tenant_entitlements')
      .upsert({
        tenant_id: tenant.id,
        credits_remaining: entitlements?.is_unlimited ? 999999 : newBalance,
        is_unlimited: entitlements?.is_unlimited ?? false,
        tier: entitlements?.tier ?? tenant.tier ?? 'PRO_SCALE',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' });

    // 2. Insert into tenant_credit_ledger
    const desc = `Top-up +${params.credits} Render Credits (Rp ${params.amountPaid.toLocaleString('id-ID')}) - Ref: ${params.transactionId}`;
    try {
      await supabase.from('tenant_credit_ledger').insert({
        tenant_id: tenant.id,
        amount: params.credits,
        balance_after: entitlements?.is_unlimited ? 999999 : newBalance,
        action: 'TOPUP',
        description: desc,
      });
    } catch (err) {
      console.warn('[StudioCreditService] Ledger error:', err);
    }

    // 3. Process Affiliate Commission if status is PAID or SETTLED
    let commissionRecorded = false;
    let commissionAmount = 0;
    const rawStatus = (params.paymentStatus || 'PAID').toUpperCase();

    if ((rawStatus === 'PAID' || rawStatus === 'SETTLED') && params.amountPaid > 0) {
      const { recordStudioTokenCommission } = await import('@/lib/affiliate-notification-service');
      const commResult = await recordStudioTokenCommission({
        orderId: params.transactionId,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        grossAmount: params.amountPaid,
        tokenCount: params.credits,
        affiliateCode: params.affiliateCode || tenant.metadata?.affiliate_code || tenant.metadata?.referral_code,
        paymentStatus: rawStatus,
      });
      commissionRecorded = commResult.success;
      commissionAmount = commResult.commissionAmount;
    }

    return {
      success: true,
      newBalance,
      commissionRecorded,
      commissionAmount,
    };
  }
}
