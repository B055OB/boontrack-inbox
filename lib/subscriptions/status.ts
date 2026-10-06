/**
 * @file lib/subscriptions/status.ts
 * @description Single Source of Truth (SSOT) for calculating tenant subscription and trial status.
 * Eliminates split-brain discrepancies across Superadmin, Affiliate Portal, and Tenant Dashboard.
 * 
 * STRICT ARCHITECTURE PRINCIPLES (CTO MANDATE):
 * 1. Access != Payment != Commission (Domain terpisah secara tegas).
 * 2. Superadmin/Core = Source of Truth. Portal Affiliate = Read Model / Projection.
 * 3. Subscription Status di-lock menjadi 4 domain:
 *    - TRIAL
 *    - PAID
 *    - GRANTED (Subtype: PILOT, BRAND_AMBASSADOR, DESIGN_PARTNER, PARTNERSHIP, INTERNAL_DOGFOOD)
 *    - EXPIRED
 * 4. Akun berstatus TRIAL atau GRANTED TIDAK BOLEH menghasilkan transaksi komisi (Commission Eligible = FALSE).
 *    Komisi hanya sah jika ada qualifying invoice 'PAID'.
 */

export type CanonicalSubscriptionDomain = 'TRIAL' | 'PAID' | 'GRANTED' | 'EXPIRED';

export type GrantSubtype =
  | 'PILOT'
  | 'BRAND_AMBASSADOR'
  | 'DESIGN_PARTNER'
  | 'PARTNERSHIP'
  | 'INTERNAL_DOGFOOD';

export interface TenantSubscriptionStatusResult {
  /**
   * 4 Canonical CTO domains: 'TRIAL' | 'PAID' | 'GRANTED' | 'EXPIRED'
   */
  domainStatus: CanonicalSubscriptionDomain;

  /**
   * Canonical normalized status
   * 'trial': In active trial period (<= 7 days from registration/reverse trial)
   * 'paid': Active paid subscriber with qualifying invoice
   * 'granted': Special grant (PILOT, BRAND_AMBASSADOR, etc.)
   * 'active': Alias for active paid / valid access
   * 'grace_period': Overdue but within grace period
   * 'expired': Past expiration date / past trial date without active subscription
   * 'suspended': Manually suspended by admin
   */
  status: 'trial' | 'paid' | 'granted' | 'active' | 'grace_period' | 'expired' | 'suspended' | 'pending_payment';

  /**
   * Subtype for GRANTED domain:
   * 'PILOT' | 'BRAND_AMBASSADOR' | 'DESIGN_PARTNER' | 'PARTNERSHIP' | 'INTERNAL_DOGFOOD'
   */
  grantType: GrantSubtype | string | null;

  /**
   * Standard label required by Affiliate Portal & Partner reporting:
   * 'Trial' | 'Berlangganan' | 'Granted' | 'Expired'
   */
  affiliateStatus: 'Trial' | 'Berlangganan' | 'Granted' | 'Expired';

  /**
   * Human readable badge label for UI
   * - TRIAL: 'TRIAL AKTIF'
   * - GRANTED: 'AKSES GRANTED - [GRANT_TYPE]'
   * - PAID: 'Berlangganan Aktif'
   * - EXPIRED: 'Expired'
   */
  label: string;

  /**
   * Whether this subscription qualifies for affiliate commission calculation.
   * STRICT CTO RULE: Commission is ONLY eligible if domainStatus === 'PAID' and qualifying payment exists.
   * TRIAL and GRANTED are strictly FALSE.
   */
  isCommissionEligible: boolean;

  /**
   * Whether the store is currently entitled to operate normally (system access).
   * Note: Access != Payment != Commission.
   */
  isValid: boolean;

  /**
   * Whether the store is in trial mode
   */
  isTrial: boolean;

  /**
   * Whether the store has a Special Grant
   */
  isSpecialGrant: boolean;

  /**
   * Remaining days until expiration
   */
  daysLeft: number | null;

  /**
   * Effective expiration timestamp (ISO string)
   */
  expiresAt: string | null;

  /**
   * Canonical resolved tier
   */
  tier: string;
}

/**
 * Calculates the definitive subscription status for any tenant object.
 * Reads dynamically from tenant record and metadata without hardcoded slugs.
 */
export function getTenantSubscriptionStatus(tenant: any, referenceTimeMs: number = Date.now()): TenantSubscriptionStatusResult {
  if (!tenant || typeof tenant !== 'object') {
    return {
      domainStatus: 'EXPIRED',
      status: 'expired',
      grantType: null,
      affiliateStatus: 'Expired',
      label: 'Expired',
      isCommissionEligible: false,
      isValid: false,
      isTrial: false,
      isSpecialGrant: false,
      daysLeft: 0,
      expiresAt: null,
      tier: 'STARTER',
    };
  }

  const meta = (tenant.metadata && typeof tenant.metadata === 'object') ? tenant.metadata : {};
  const rawStatus = String(tenant.status || '').toLowerCase().trim();
  const rawSubStatus = String(tenant.subscription_status || meta.subscription_status || '').toLowerCase().trim();
  const rawTier = String(tenant.subscription_tier || tenant.tier || meta.tier || meta.plan_tier || 'STARTER').toUpperCase().trim();
  const tier = rawTier.includes('ENTERPRISE') || rawTier.includes('TEAM')
    ? 'ENTERPRISE'
    : rawTier.includes('PRO') || rawTier.includes('ADS')
    ? 'PRO_SCALE'
    : 'STARTER';

  // 1. Manual Suspension Check (Highest Priority)
  const isSuspended =
    rawStatus === 'suspended' ||
    rawSubStatus === 'suspended' ||
    tenant.is_suspended === true ||
    meta.is_suspended === true;

  if (isSuspended) {
    return {
      domainStatus: 'EXPIRED',
      status: 'suspended',
      grantType: null,
      affiliateStatus: 'Expired',
      label: 'Suspended',
      isCommissionEligible: false,
      isValid: false,
      isTrial: false,
      isSpecialGrant: false,
      daysLeft: 0,
      expiresAt: null,
      tier,
    };
  }

  // 2. Special Grant Check (Exempt from normal checkout billing; Access != Payment != Commission)
  const subObj = meta.subscription;
  const rawGrantType =
    tenant.grant_type ||
    meta.grant_type ||
    subObj?.grant_type ||
    subObj?.subtype ||
    meta.subscription_grant_type ||
    null;

  const isSpecialGrant = Boolean(
    rawGrantType ||
    rawSubStatus === 'granted' ||
    rawStatus === 'granted' ||
    subObj?.type === 'granted' ||
    subObj?.subscription_type === 'granted' ||
    subObj?.billing_cycle === 'grant' ||
    meta.subscription_type === 'granted' ||
    subObj?.is_grant === true
  );

  const grantType: GrantSubtype | string = rawGrantType
    ? String(rawGrantType).toUpperCase().trim()
    : 'PILOT';

  const grantValidUntil = subObj?.valid_until || tenant.subscription_ends_at || meta.subscription_ends_at || null;
  if (isSpecialGrant) {
    const grantEndMs = grantValidUntil ? new Date(grantValidUntil).getTime() : null;
    const isGrantValid = grantEndMs === null || grantEndMs > referenceTimeMs;
    const days = grantEndMs ? Math.max(0, Math.ceil((grantEndMs - referenceTimeMs) / 86400000)) : null;

    if (isGrantValid) {
      return {
        domainStatus: 'GRANTED',
        status: 'granted',
        grantType,
        affiliateStatus: 'Granted',
        label: `AKSES GRANTED - ${grantType}`,
        isCommissionEligible: false, // STRICT CTO: Commission Eligible = FALSE
        isValid: true,
        isTrial: false,
        isSpecialGrant: true,
        daysLeft: days,
        expiresAt: grantValidUntil,
        tier,
      };
    } else {
      return {
        domainStatus: 'EXPIRED',
        status: 'expired',
        grantType,
        affiliateStatus: 'Expired',
        label: 'Grant Expired',
        isCommissionEligible: false,
        isValid: false,
        isTrial: false,
        isSpecialGrant: true,
        daysLeft: 0,
        expiresAt: grantValidUntil,
        tier,
      };
    }
  }

  // 3. Resolve Timestamps
  const rawSubEnds = tenant.subscription_ends_at || meta.subscription_ends_at || tenant.due_date || null;
  const rawTrialEnds = tenant.trial_ends_at || meta.trial_ends_at || null;

  const subEndsMs = rawSubEnds ? new Date(rawSubEnds).getTime() : null;
  const trialEndsMs = rawTrialEnds ? new Date(rawTrialEnds).getTime() : null;

  const isSubActiveByDate = subEndsMs !== null && subEndsMs > referenceTimeMs;
  const isTrialActiveByDate = trialEndsMs !== null && trialEndsMs > referenceTimeMs;

  // 3b. PENDING_PAYMENT Check — Non-PRO_SCALE toko yang belum membayar invoice pertama.
  // Must come BEFORE trial classification to prevent misclassification.
  const isPendingPayment = Boolean(
    rawSubStatus === 'pending_payment' ||
    rawStatus === 'pending_payment' ||
    meta.subscription_status === 'pending_payment' ||
    meta.is_pending_payment === true
  );

  if (isPendingPayment) {
    return {
      domainStatus: 'EXPIRED',
      status: 'pending_payment',
      grantType: null,
      affiliateStatus: 'Expired',
      label: 'MENUNGGU PEMBAYARAN',
      isCommissionEligible: false,
      isValid: false, // Store is NOT operational until payment is confirmed
      isTrial: false,
      isSpecialGrant: false,
      daysLeft: 0,
      expiresAt: null,
      tier,
    };
  }

  // 4. Trial Classification (Flag or Reverse Trial Mode)
  // STRICT: Only PRO_SCALE tier is eligible for trial. Other tiers must go through PENDING_PAYMENT.
  const isProScaleTier = tier === 'PRO_SCALE';
  const isTrialStore = Boolean(
    isProScaleTier && (
      rawSubStatus === 'trial' ||
      rawStatus === 'trial' ||
      meta.is_trial === true ||
      rawTier.includes('TRIAL') ||
      meta.created_via === 'register_ads_trial' ||
      meta.created_via === 'register_solo_trial' ||
      meta.created_via === 'wa_user_initiated_register' ||
      (trialEndsMs !== null && !isSubActiveByDate)
    )
  );

  // 5. Active Paid Subscription Evaluation
  // Rule: Jika memiliki status 'active'/'paid' dan tanggal kadaluwarsa > NOW(), HARUS membaca 'Berlangganan Aktif'
  if ((rawSubStatus === 'active' || rawSubStatus === 'paid' || rawSubStatus === 'subscribed' || (rawStatus === 'active' && !isTrialStore)) && isSubActiveByDate) {
    const days = subEndsMs ? Math.max(0, Math.ceil((subEndsMs - referenceTimeMs) / 86400000)) : null;
    return {
      domainStatus: 'PAID',
      status: 'paid',
      grantType: null,
      affiliateStatus: 'Berlangganan',
      label: 'Berlangganan Aktif',
      isCommissionEligible: true, // Only PAID with valid active subscription qualifies
      isValid: true,
      isTrial: false,
      isSpecialGrant: false,
      daysLeft: days,
      expiresAt: rawSubEnds,
      tier,
    };
  }

  // 6. Active Trial Evaluation
  if (isTrialStore && isTrialActiveByDate) {
    const days = trialEndsMs ? Math.max(0, Math.ceil((trialEndsMs - referenceTimeMs) / 86400000)) : 7;
    return {
      domainStatus: 'TRIAL',
      status: 'trial',
      grantType: null,
      affiliateStatus: 'Trial',
      label: 'TRIAL AKTIF',
      isCommissionEligible: false, // STRICT CTO: TRIAL Commission Eligible = FALSE
      isValid: true,
      isTrial: true,
      isSpecialGrant: false,
      daysLeft: days,
      expiresAt: rawTrialEnds,
      tier,
    };
  }

  // 7. Expired State Evaluation
  if (
    rawStatus === 'expired' ||
    rawSubStatus === 'expired' ||
    (trialEndsMs !== null && trialEndsMs <= referenceTimeMs && !isSubActiveByDate) ||
    (subEndsMs !== null && subEndsMs <= referenceTimeMs && !isTrialActiveByDate)
  ) {
    return {
      domainStatus: 'EXPIRED',
      status: 'expired',
      grantType: null,
      affiliateStatus: 'Expired',
      label: 'Expired',
      isCommissionEligible: false,
      isValid: false,
      isTrial: isTrialStore,
      isSpecialGrant: false,
      daysLeft: 0,
      expiresAt: rawSubEnds || rawTrialEnds || null,
      tier,
    };
  }

  // 8. Newly Created Pending Stores (Waiting for WhatsApp verification / Onboarding)
  // Only PRO_SCALE 'unverified'/'pending' status is treated as trial.
  // Non-PRO_SCALE with pending status should be caught by PENDING_PAYMENT check above.
  if (rawStatus === 'pending' || rawStatus === 'unverified') {
    if (isProScaleTier) {
      const days = trialEndsMs ? Math.max(0, Math.ceil((trialEndsMs - referenceTimeMs) / 86400000)) : 7;
      return {
        domainStatus: 'TRIAL',
        status: 'trial',
        grantType: null,
        affiliateStatus: 'Trial',
        label: 'TRIAL AKTIF (Menunggu Aktivasi)',
        isCommissionEligible: false,
        isValid: true,
        isTrial: true,
        isSpecialGrant: false,
        daysLeft: days,
        expiresAt: rawTrialEnds,
        tier,
      };
    } else {
      // Non-PRO_SCALE with pending status = awaiting first payment
      return {
        domainStatus: 'EXPIRED',
        status: 'pending_payment',
        grantType: null,
        affiliateStatus: 'Expired',
        label: 'MENUNGGU PEMBAYARAN',
        isCommissionEligible: false,
        isValid: false,
        isTrial: false,
        isSpecialGrant: false,
        daysLeft: 0,
        expiresAt: null,
        tier,
      };
    }
  }

  // 9. Fallback if is_active is true with no explicit expiration date
  if (tenant.is_active !== false && (rawStatus === 'active' || rawSubStatus === 'active')) {
    return {
      domainStatus: 'PAID',
      status: 'paid',
      grantType: null,
      affiliateStatus: 'Berlangganan',
      label: 'Berlangganan Aktif',
      isCommissionEligible: true,
      isValid: true,
      isTrial: false,
      isSpecialGrant: false,
      daysLeft: null,
      expiresAt: rawSubEnds,
      tier,
    };
  }

  // Default Expired
  return {
    domainStatus: 'EXPIRED',
    status: 'expired',
    grantType: null,
    affiliateStatus: 'Expired',
    label: 'Expired',
    isCommissionEligible: false,
    isValid: false,
    isTrial: isTrialStore,
    isSpecialGrant: false,
    daysLeft: 0,
    expiresAt: null,
    tier,
  };
}
