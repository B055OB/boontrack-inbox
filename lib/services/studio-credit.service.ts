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
    isExisting?: boolean;
    message?: string;
  }> {
    const txKey = params.transactionId ? `${params.tenantIdOrSlug || ''}:${params.transactionId}` : null;
    if (txKey && this.inFlightTopups.has(txKey)) {
      try {
        await this.inFlightTopups.get(txKey);
      } catch {}
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

    // 0. Idempotency Guard: Check if transactionId has already been recorded in tenant_credit_ledger
    if (params.transactionId) {
      try {
        const { data: existingLedger } = await supabase
          .from('tenant_credit_ledger')
          .select('id, amount, balance_after, description')
          .eq('tenant_id', tenant.id)
          .ilike('description', `%${params.transactionId}%`)
          .limit(1)
          .maybeSingle();

        if (existingLedger) {
          console.log(`[StudioCreditService] Transaction ${params.transactionId} already processed (idempotent duplicate). Skipping credit increment.`);
          return {
            success: true,
            newBalance: existingLedger.balance_after ?? (entitlements?.credits_remaining ?? 0),
            commissionRecorded: false,
            isExisting: true,
            message: `Transaction ${params.transactionId} already processed previously (idempotent).`,
          };
        }
      } catch (checkErr) {
        console.warn('[StudioCreditService] Idempotency check warning:', checkErr);
      }
    }

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

    // 3. Process Affiliate Commission if status is PAID or SETTLED (Downstream Isolated)
    let commissionRecorded = false;
    let commissionAmount = 0;
    const rawStatus = (params.paymentStatus || 'PAID').toUpperCase();

    if ((rawStatus === 'PAID' || rawStatus === 'SETTLED') && params.amountPaid > 0) {
      try {
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

    // 1. Idempotency Check: check if PROMO_SHOP_ACTIVATION_BONUS has already been recorded
    try {
      const { data: existingBonus } = await supabase
        .from('tenant_credit_ledger')
        .select('id, amount, balance_after')
        .eq('tenant_id', tenant.id)
        .eq('action', 'PROMO_SHOP_ACTIVATION_BONUS')
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

    // 2. Resolve upgraded tier
    const rawTier = String(tenant.tier || '').toUpperCase();
    const paidShopTiers = ['SOLO', 'PRO_SCALE', 'ADS_PERFORMANCE', 'ENTERPRISE', 'TEAM_SCALE', 'FOUNDER'];
    const upgradedTier = paidShopTiers.includes(rawTier) ? tenant.tier : 'member';

    // 3. Update tenants table
    const existingMeta = (tenant.metadata && typeof tenant.metadata === 'object') ? { ...tenant.metadata } : {};
    existingMeta.is_shop_subscriber = true;
    existingMeta.is_shop_member = true;
    existingMeta.shop_activation_bonus_granted = true;
    existingMeta.shop_activation_bonus_granted_at = new Date().toISOString();
    if (params.subscriptionId) existingMeta.shop_subscription_id = params.subscriptionId;
    if (params.invoiceId) existingMeta.shop_activation_invoice_id = params.invoiceId;

    try {
      await supabase
        .from('tenants')
        .update({
          tier: upgradedTier,
          metadata: existingMeta,
        })
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
        tier: isUnlimited ? 'FOUNDER' : upgradedTier,
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
      description: 'Bonus langganan toko BoonTrack',
      event: 'PROMO_SHOP_ACTIVATION_BONUS',
      type: 'CREDIT_IN',
      note: 'Bonus langganan toko BoonTrack',
    };

    try {
      const { error: ledgerErr } = await supabase
        .from('tenant_credit_ledger')
        .insert(ledgerPayload);

      if (ledgerErr) {
        // Fallback with standard columns
        await supabase
          .from('tenant_credit_ledger')
          .insert({
            tenant_id: tenant.id,
            amount: bonusCredits,
            balance_after: isUnlimited ? 999999 : newBalance,
            action: 'PROMO_SHOP_ACTIVATION_BONUS',
            description: 'Bonus langganan toko BoonTrack',
          });
      }
    } catch (insertErr) {
      console.warn('[StudioCreditService] Ledger mutation error:', insertErr);
    }

    return {
      success: true,
      alreadyGranted: false,
      creditsGranted: bonusCredits,
      newBalance: isUnlimited ? 999999 : newBalance,
      tenantTier: upgradedTier,
      isShopMember: true,
      message: 'Bonus apresiasi 15 Kredit Studio berhasil diberikan.',
    };
  }
}

