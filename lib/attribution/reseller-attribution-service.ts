/**
 * @file lib/attribution/reseller-attribution-service.ts
 * @description Core Reseller Foundation & Transaction Attribution Engine (Directive RE-01 / Sprint P0)
 *
 * Invariants (CTO & CFO Frozen Architecture):
 * 1. STRICT TENANT ISOLATION: All attribution locks and commission ledger entries are scoped by tenant_id.
 * 2. PRIORITY RESOLUTION:
 *    - Priority 1: Active attribution lock in `customer_attribution_locks` (locked_until > NOW()) -> 'ATTRIBUTION_LOCK'
 *    - Priority 2: Direct click from payload/cookie -> creates 90-day lock in `customer_attribution_locks` -> 'DIRECT_CLICK'
 *    - Otherwise: 'NONE'
 * 3. IMMUTABLE SNAPSHOTTING: Orders table freezes reseller_user_id, reseller_code_snapshot,
 *    reseller_commission_amount, and attribution_type upon invoice creation.
 * 4. ANTI SELF-REFERRAL: If buyer phone (E.164) or email matches reseller data, commission allocation is skipped.
 * 5. IDEMPOTENT MUTATION: Ledger entries use idempotency_key = 'EARN_' || order_id.
 * 6. CLEARANCE SCHEDULE: Status = 'PENDING_CLEARANCE', available_at = NOW() + INTERVAL '7 days'.
 */

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { normalizePhoneToE164 } from '@/lib/phone';

export type AttributionType = 'DIRECT_CLICK' | 'ATTRIBUTION_LOCK' | 'NONE';

export interface ResolvedReseller {
  resellerUserId: string;
  resellerCode: string;
  email?: string | null;
  phone?: string | null;
  commissionRate?: number | null;
  commissionType?: 'PERCENTAGE' | 'FIXED' | null;
  commissionValue?: number | null;
}

export interface OrderAttributionResult {
  resellerUserId: string | null;
  resellerCodeSnapshot: string | null;
  resellerCommissionAmount: number;
  attributionType: AttributionType;
  lockId?: string | null;
  isExistingLock?: boolean;
}

export interface CommissionLedgerResult {
  success: boolean;
  reason?: string;
  ledgerId?: string | null;
  entryType?: string;
  amount?: number;
  status?: string;
  availableAt?: string;
  idempotencyKey?: string;
  isDuplicate?: boolean;
}

/**
 * Resolves reseller code to auth.users.id and profile info.
 * Checks:
 * 1. public.affiliates (referral_code) -> auth.users by email
 * 2. public.store_resellers (code) -> auth.users by email
 * 3. auth.users metadata or UUID directly
 */
export async function resolveResellerUserIdByCode(
  tenantId: string | null | undefined,
  rawCode: string | null | undefined,
  supabaseClient?: any
): Promise<ResolvedReseller | null> {
  const code = (rawCode || '').trim();
  if (!code) return null;

  const supabase = supabaseClient || getSupabaseAdmin() || getSupabase();
  if (!supabase) return null;

  const cleanCode = code.toLowerCase();

  try {
    // 1. Lookup in affiliates
    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('id, referral_code, email, phone_number, commission_rate')
      .ilike('referral_code', cleanCode)
      .maybeSingle();

    if (affiliate && affiliate.email) {
      // Find auth.users by email
      const { data: userByEmail } = await supabase
        .from('auth.users' as any)
        .select('id, email, phone, raw_user_meta_data')
        .ilike('email', affiliate.email.trim())
        .maybeSingle()
        .catch(async () => {
          // Fallback via RPC or standard users query
          return supabase
            .rpc('get_user_by_email', { p_email: affiliate.email.trim() })
            .maybeSingle();
        });

      if (userByEmail?.id) {
        return {
          resellerUserId: userByEmail.id,
          resellerCode: affiliate.referral_code || code,
          email: affiliate.email,
          phone: affiliate.phone_number || userByEmail.phone,
          commissionRate: affiliate.commission_rate != null ? Number(affiliate.commission_rate) : 25,
          commissionType: 'PERCENTAGE',
        };
      }
    }

    // 2. Lookup in store_resellers
    let storeResQuery = supabase
      .from('store_resellers')
      .select('id, code, name, phone, email, commission_type, commission_value')
      .ilike('code', cleanCode);

    if (tenantId) {
      storeResQuery = storeResQuery.eq('tenant_id', tenantId);
    }

    const { data: storeReseller } = await storeResQuery.maybeSingle();
    if (storeReseller && storeReseller.email) {
      const { data: userByStoreEmail } = await supabase
        .from('auth.users' as any)
        .select('id, email, phone, raw_user_meta_data')
        .ilike('email', storeReseller.email.trim())
        .maybeSingle()
        .catch(async () => null);

      if (userByStoreEmail?.id) {
        return {
          resellerUserId: userByStoreEmail.id,
          resellerCode: storeReseller.code || code,
          email: storeReseller.email,
          phone: storeReseller.phone || userByStoreEmail.phone,
          commissionType: storeReseller.commission_type || 'PERCENTAGE',
          commissionValue: Number(storeReseller.commission_value || 0),
          commissionRate: storeReseller.commission_type === 'PERCENTAGE' ? Number(storeReseller.commission_value || 25) : undefined,
        };
      }
    }

    // 3. Check auth.users directly (if code is a valid UUID)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code);
    if (isUuid) {
      const { data: userById } = await supabase
        .from('auth.users' as any)
        .select('id, email, phone, raw_user_meta_data')
        .eq('id', code)
        .maybeSingle()
        .catch(async () => null);

      if (userById?.id) {
        return {
          resellerUserId: userById.id,
          resellerCode: userById.raw_user_meta_data?.referral_code || code,
          email: userById.email,
          phone: userById.phone || userById.raw_user_meta_data?.phone,
          commissionRate: 25,
          commissionType: 'PERCENTAGE',
        };
      }
    }

    return null;
  } catch (err) {
    console.warn('[ResellerAttributionService] Error resolving reseller by code:', err);
    return null;
  }
}

/**
 * Calculates reseller commission nominal for a given gross amount and reseller terms.
 */
export function calculateResellerCommission(
  grossAmount: number,
  resellerInfo?: Partial<ResolvedReseller> | null,
  customAmount?: number
): number {
  if (customAmount && customAmount > 0) {
    return Number(customAmount);
  }

  if (!grossAmount || grossAmount <= 0) return 0;

  if (resellerInfo?.commissionType === 'FIXED' && resellerInfo.commissionValue && resellerInfo.commissionValue > 0) {
    return Math.min(Number(resellerInfo.commissionValue), grossAmount);
  }

  const rawRate = Number(resellerInfo?.commissionRate ?? resellerInfo?.commissionValue ?? 25);
  const ratePercent = rawRate <= 1 ? rawRate * 100 : rawRate;
  const commission = Math.round(grossAmount * (ratePercent / 100));

  return commission;
}

/**
 * Resolves attribution for an order:
 * Priority 1: Active lock in customer_attribution_locks (locked_until > NOW())
 * Priority 2: Direct click from payload/cookie -> creates 90-day lock
 * Fallback: NONE
 */
export async function resolveOrderAttribution(params: {
  tenantId: string;
  customerPhone: string;
  resellerCodeFromPayload?: string | null;
  grossAmount: number;
  customCommissionAmount?: number;
  supabaseClient?: any;
}): Promise<OrderAttributionResult> {
  const {
    tenantId,
    customerPhone,
    resellerCodeFromPayload,
    grossAmount,
    customCommissionAmount,
  } = params;

  const supabase = params.supabaseClient || getSupabaseAdmin() || getSupabase();
  if (!supabase || !tenantId) {
    return {
      resellerUserId: null,
      resellerCodeSnapshot: null,
      resellerCommissionAmount: 0,
      attributionType: 'NONE',
    };
  }

  const normalizedPhone = normalizePhoneToE164(customerPhone);
  const nowIso = new Date().toISOString();

  try {
    // ── PRIORITAS 1: Cek apakah nomor WA terdaftar di customer_attribution_locks yang aktif ──
    if (normalizedPhone) {
      const { data: existingLock, error: lockErr } = await supabase
        .from('customer_attribution_locks')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('customer_phone_e164', normalizedPhone)
        .gt('locked_until', nowIso)
        .order('locked_until', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lockErr && existingLock?.reseller_user_id) {
        // Active lock found!
        const resolvedProfile = await resolveResellerUserIdByCode(tenantId, existingLock.reseller_code, supabase);
        const commissionAmount = calculateResellerCommission(grossAmount, resolvedProfile, customCommissionAmount);

        return {
          resellerUserId: existingLock.reseller_user_id,
          resellerCodeSnapshot: existingLock.reseller_code,
          resellerCommissionAmount: commissionAmount,
          attributionType: 'ATTRIBUTION_LOCK',
          lockId: existingLock.id,
          isExistingLock: true,
        };
      }
    }

    // ── PRIORITAS 2: Jika tidak terkunci, gunakan nilai direct click (payload/cookie) ──
    const candidateCode = (resellerCodeFromPayload || '').trim();
    if (candidateCode) {
      const resolved = await resolveResellerUserIdByCode(tenantId, candidateCode, supabase);

      if (resolved?.resellerUserId) {
        const commissionAmount = calculateResellerCommission(grossAmount, resolved, customCommissionAmount);

        // Simpan lock baru ke customer_attribution_locks (masa aktif 90 hari)
        let lockId: string | null = null;
        if (normalizedPhone) {
          const lockedUntil = new Date(Date.now() + 90 * 86400 * 1000).toISOString();
          const { data: newLock, error: insertLockErr } = await supabase
            .from('customer_attribution_locks')
            .upsert(
              {
                tenant_id: tenantId,
                customer_phone_e164: normalizedPhone,
                reseller_user_id: resolved.resellerUserId,
                reseller_code: resolved.resellerCode,
                locked_until: lockedUntil,
                updated_at: nowIso,
              },
              { onConflict: 'tenant_id, customer_phone_e164' }
            )
            .select('id')
            .maybeSingle();

          if (!insertLockErr && newLock) {
            lockId = newLock.id;
          }
        }

        return {
          resellerUserId: resolved.resellerUserId,
          resellerCodeSnapshot: resolved.resellerCode,
          resellerCommissionAmount: commissionAmount,
          attributionType: 'DIRECT_CLICK',
          lockId,
          isExistingLock: false,
        };
      }
    }

    // ── FALLBACK: Tidak ada reseller valid ──
    return {
      resellerUserId: null,
      resellerCodeSnapshot: null,
      resellerCommissionAmount: 0,
      attributionType: 'NONE',
    };
  } catch (err) {
    console.error('[ResellerAttributionService] Error in resolveOrderAttribution:', err);
    return {
      resellerUserId: null,
      resellerCodeSnapshot: null,
      resellerCommissionAmount: 0,
      attributionType: 'NONE',
    };
  }
}

/**
 * Idempotently records an EARNED ledger mutation in reseller_commission_ledger when an order is PAID.
 * Prevents Self-Referral: skips allocation if buyer phone or email matches the reseller.
 */
export async function recordResellerCommissionLedger(params: {
  orderId: string;
  tenantId?: string;
  supabaseClient?: any;
}): Promise<CommissionLedgerResult> {
  const { orderId } = params;
  if (!orderId) {
    return { success: false, reason: 'MISSING_ORDER_ID' };
  }

  const supabase = params.supabaseClient || getSupabaseAdmin() || getSupabase();
  if (!supabase) {
    return { success: false, reason: 'SUPABASE_UNAVAILABLE' };
  }

  try {
    // 1. Ambil data order snapshot
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, tenant_id, tenant_slug, customer_name, customer_phone, customer_email, reseller_user_id, reseller_code_snapshot, reseller_commission_amount, attribution_type, status, payment_status, gross_amount, paid_at')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return { success: false, reason: 'ORDER_NOT_FOUND' };
    }

    // Pastikan reseller_user_id valid
    if (!order.reseller_user_id) {
      return { success: false, reason: 'NO_RESELLER_ATTRIBUTED' };
    }

    const commissionAmount = Number(order.reseller_commission_amount || 0);
    if (commissionAmount <= 0) {
      return { success: false, reason: 'ZERO_COMMISSION_AMOUNT' };
    }

    const tenantId = order.tenant_id || params.tenantId;
    if (!tenantId) {
      return { success: false, reason: 'MISSING_TENANT_ID' };
    }

    // 2. CEGAH SELF-REFERRAL: Ambil data reseller (email dan phone) untuk dicocokkan dengan buyer
    const buyerPhoneE164 = normalizePhoneToE164(order.customer_phone);
    const buyerEmail = (order.customer_email || '').trim().toLowerCase();

    // Query data reseller dari auth.users dan affiliates
    let resellerEmail = '';
    let resellerPhoneE164 = '';

    try {
      const { data: resellerUser } = await supabase
        .from('auth.users' as any)
        .select('id, email, phone, raw_user_meta_data')
        .eq('id', order.reseller_user_id)
        .maybeSingle()
        .catch(() => null);

      if (resellerUser) {
        resellerEmail = (resellerUser.email || '').trim().toLowerCase();
        resellerPhoneE164 = normalizePhoneToE164(resellerUser.phone || resellerUser.raw_user_meta_data?.phone || resellerUser.raw_user_meta_data?.whatsapp);
      }

      // Also check affiliates table
      const { data: affiliateRow } = await supabase
        .from('affiliates')
        .select('email, phone_number')
        .ilike('email', resellerEmail || '%')
        .limit(1)
        .maybeSingle()
        .catch(() => null);

      if (affiliateRow) {
        if (!resellerEmail) resellerEmail = (affiliateRow.email || '').trim().toLowerCase();
        if (!resellerPhoneE164 && affiliateRow.phone_number) {
          resellerPhoneE164 = normalizePhoneToE164(affiliateRow.phone_number);
        }
      }
    } catch (resellerFetchErr) {
      console.warn('[recordResellerCommissionLedger] Reseller fetch note:', resellerFetchErr);
    }

    // Evaluasi kecocokan Self-Referral
    const isPhoneMatch = Boolean(buyerPhoneE164 && resellerPhoneE164 && buyerPhoneE164 === resellerPhoneE164);
    const isEmailMatch = Boolean(buyerEmail && resellerEmail && buyerEmail === resellerEmail);

    if (isPhoneMatch || isEmailMatch) {
      console.warn(
        `[Reseller Commission] SELF_REFERRAL_PREVENTED for order ${orderId}: Buyer (${buyerPhoneE164 || buyerEmail}) matches Reseller (${resellerPhoneE164 || resellerEmail})`
      );
      return {
        success: false,
        reason: 'SELF_REFERRAL_PREVENTED',
      };
    }

    // 3. Persiapkan Ledger Entry (Immutable & Idempotent)
    const idempotencyKey = `EARN_${orderId}`;
    const settledAt = order.paid_at ? new Date(order.paid_at) : new Date();
    // available_at = settled_at + 7 days
    const availableAt = new Date(settledAt.getTime() + 7 * 86400 * 1000).toISOString();

    const ledgerPayload = {
      tenant_id: tenantId,
      reseller_user_id: order.reseller_user_id,
      order_id: String(orderId),
      entry_type: 'EARNED',
      amount: commissionAmount,
      status: 'PENDING_CLEARANCE',
      available_at: availableAt,
      idempotency_key: idempotencyKey,
      created_at: new Date().toISOString(),
    };

    // 4. Insert ke reseller_commission_ledger dengan idempotency check
    const { data: insertedLedger, error: insertErr } = await supabase
      .from('reseller_commission_ledger')
      .insert(ledgerPayload)
      .select('id, amount, status, available_at, idempotency_key')
      .maybeSingle();

    if (insertErr) {
      // Postgres error code 23505 = unique_violation
      if (insertErr.code === '23505' || String(insertErr.message).includes('duplicate key') || String(insertErr.message).includes('uq_reseller_commission_ledger_tenant_idempotency')) {
        console.log(`[Reseller Commission] Idempotent hit: Ledger entry for ${idempotencyKey} already exists.`);
        return {
          success: true,
          isDuplicate: true,
          reason: 'IDEMPOTENT_ALREADY_RECORDED',
          idempotencyKey,
          amount: commissionAmount,
          status: 'PENDING_CLEARANCE',
          availableAt,
        };
      }

      console.error('[Reseller Commission] Error inserting ledger entry:', insertErr);
      return {
        success: false,
        reason: insertErr.message || 'LEDGER_INSERT_FAILED',
      };
    }

    console.log(`[Reseller Commission] SUCCESS: Ledger entry created for order #${orderId} (Rp ${commissionAmount}, status PENDING_CLEARANCE, available at ${availableAt})`);

    return {
      success: true,
      ledgerId: insertedLedger?.id,
      entryType: 'EARNED',
      amount: commissionAmount,
      status: 'PENDING_CLEARANCE',
      availableAt,
      idempotencyKey,
      isDuplicate: false,
    };
  } catch (err: any) {
    console.error('[recordResellerCommissionLedger] Fatal error:', err);
    return {
      success: false,
      reason: err?.message || 'INTERNAL_ERROR',
    };
  }
}

export interface ResellerWalletMetrics {
  balanceReady: number;
  pendingClearance: number;
  totalEarned: number;
  totalPaid: number;
  productsSold: number;
}

/**
 * P1: Canonical Ledger Wallet Reader (Single Source of Truth)
 * Menghitung saldo siap tarik, komisi tertahan (pending clearance), total komisi diperoleh,
 * dan jumlah transaksi penjualan murni bersumber dari `reseller_commission_ledger`.
 */
export async function getResellerWalletMetricsFromLedger(params: {
  resellerUserIds: string[];
  tenantId?: string;
  supabaseClient?: any;
}): Promise<ResellerWalletMetrics> {
  const { resellerUserIds, tenantId } = params;
  const cleanIds = Array.from(new Set((resellerUserIds || []).filter(Boolean)));

  if (cleanIds.length === 0) {
    return {
      balanceReady: 0,
      pendingClearance: 0,
      totalEarned: 0,
      totalPaid: 0,
      productsSold: 0,
    };
  }

  const supabase = params.supabaseClient || getSupabaseAdmin() || getSupabase();
  if (!supabase) {
    return {
      balanceReady: 0,
      pendingClearance: 0,
      totalEarned: 0,
      totalPaid: 0,
      productsSold: 0,
    };
  }

  try {
    let query = supabase
      .from('reseller_commission_ledger')
      .select('id, tenant_id, entry_type, amount, status, available_at, created_at')
      .in('reseller_user_id', cleanIds);

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data: entries, error } = await query;

    if (error || !entries) {
      console.warn('[getResellerWalletMetricsFromLedger] Ledger query note:', error?.message);
      return {
        balanceReady: 0,
        pendingClearance: 0,
        totalEarned: 0,
        totalPaid: 0,
        productsSold: 0,
      };
    }

    let balanceReady = 0;
    let pendingClearance = 0;
    let totalEarned = 0;
    let totalPaid = 0;
    let productsSold = 0;

    const now = new Date();

    entries.forEach((entry: any) => {
      const amt = Number(entry.amount || 0);
      const entryType = String(entry.entry_type || 'EARNED').toUpperCase();
      const status = String(entry.status || '').toUpperCase();
      const availableAt = entry.available_at ? new Date(entry.available_at) : now;

      if (entryType === 'EARNED') {
        if (status !== 'CANCELLED') {
          totalEarned += amt;
          productsSold += 1;

          if (status === 'AVAILABLE' || (status === 'PENDING_CLEARANCE' && now >= availableAt)) {
            balanceReady += amt;
          } else if (status === 'PENDING_CLEARANCE' && now < availableAt) {
            pendingClearance += amt;
          } else if (status === 'PAID') {
            totalPaid += amt;
          }
        }
      } else if (entryType === 'REVERSAL') {
        if (status !== 'CANCELLED') {
          totalEarned -= amt;
          balanceReady -= amt;
        }
      } else if (entryType === 'PAYOUT') {
        if (status !== 'CANCELLED') {
          totalPaid += amt;
          balanceReady -= amt;
        }
      } else if (entryType === 'ADJUSTMENT') {
        if (status !== 'CANCELLED') {
          balanceReady += amt;
          totalEarned += amt;
        }
      }
    });

    return {
      balanceReady: Math.max(0, balanceReady),
      pendingClearance: Math.max(0, pendingClearance),
      totalEarned: Math.max(0, totalEarned),
      totalPaid: Math.max(0, totalPaid),
      productsSold,
    };
  } catch (err) {
    console.error('[getResellerWalletMetricsFromLedger] Fatal error:', err);
    return {
      balanceReady: 0,
      pendingClearance: 0,
      totalEarned: 0,
      totalPaid: 0,
      productsSold: 0,
    };
  }
}

