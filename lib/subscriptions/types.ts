/**
 * @file lib/subscriptions/types.ts
 * @description TypeScript definitions for multi-duration subscriptions compliant with
 * ARCHITECTURE.md ("Subscription & Billing Lifecycle Domain") and PostgreSQL migration 20261003.
 */

export type SubscriptionTier = 'STARTER' | 'PRO_SCALE' | 'ENTERPRISE';

export type SubscriptionDurationMonths = 1 | 6 | 12;

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'GRACE_PERIOD' | 'EXPIRED';

export interface ShopSubscription {
  id: string;
  tenant_id: string;
  tier: SubscriptionTier;
  duration_months: SubscriptionDurationMonths;
  starts_at: string;
  current_period_starts_at: string;
  current_period_ends_at: string;
  expires_at: string;
  status: SubscriptionStatus;
  invoice_id: string | null;
  amount_paid: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionDatesResult {
  starts_at: string;
  current_period_starts_at: string;
  current_period_ends_at: string;
  expires_at: string;
  startDate: Date;
  currentPeriodStartDate: Date;
  currentPeriodEndDate: Date;
  expiresDate: Date;
}

export interface AiSessionQuota {
  baseQuota: number;
  sessionTtlHours: number;
  resetCycleDays: number;
  description: string;
}

export interface DurationPricing {
  durationMonths: SubscriptionDurationMonths;
  priceTotal: number;
  pricePerMonth: number;
  discountPercentage: number;
}

export interface TierPricingConfig {
  tier: SubscriptionTier;
  name: string;
  durations: Record<SubscriptionDurationMonths, DurationPricing>;
}

export interface ActivateSubscriptionParams {
  tenantId?: string;
  tenantSlug?: string;
  tier: SubscriptionTier;
  durationMonths: SubscriptionDurationMonths;
  invoiceId?: string | null;
  amountPaid?: number;
  metadata?: Record<string, any>;
  startDate?: Date | string | number | null;
}

export interface ActivationResult {
  success: boolean;
  subscription?: ShopSubscription;
  tenantId?: string;
  tenantSlug?: string;
  isExisting?: boolean;
  error?: string;
}

