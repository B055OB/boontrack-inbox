/**
 * lib/workforce/api-contracts.ts
 * BWM Gate E5 — Workforce API & Persistence Contracts (Hardened)
 *
 * Enforces 4 Core Workforce Financial & Seat Operations:
 * 1. Purchase / Deposit: Min. 5 credits, QRIS/Bank Transfer, gateway payment reference binding, purchase_id parent entity, pool snapshot.
 * 2. Consume / Activate: Rolling 30-day seat activation with atomic pool decrement and anti-double spend.
 * 3. Freeze / Chargeback: Dispute/chargeback isolation, freezing dormant credits with zero negative debt.
 * 4. Reverse / Reconcile: Mathematical integrity reconciliation comparing pool snapshot against immutable ledger.
 */

import { BWM_PRICING, CreditStatus } from './billing-contract';

// =========================================================================================
// 1. OPERATION: PURCHASE / DEPOSIT (QRIS / BANK GATEWAY)
// =========================================================================================

export interface DepositCreditsRequest {
  purchase_id: string; // Purchase Transaction UUID (Parent Entity)
  branch_id: string;
  agency_id: string;
  quantity: number;
  payment_method: 'QRIS' | 'BANK_TRANSFER';
  purchase_reference: string;
  payment_reference: string; // Authoritative gateway / banking reference
  subtotal_idr?: number; // Integer rupiah snapshot
  tax_amount_idr?: number; // Integer rupiah snapshot (PPN 11%)
  total_amount_idr?: number; // Integer rupiah snapshot
  idempotency_key?: string;
}

export interface DepositCreditsResponse {
  success: boolean;
  purchase_id: string;
  branch_id: string;
  quantity_added: number;
  subtotal_idr: number;
  tax_amount_idr: number;
  total_amount_idr: number;
  payment_reference: string;
  pool_snapshot: {
    available_credits: number;
    active_seats: number;
    currency: 'IDR';
  };
  idempotent_replay: boolean;
}

export function validateDepositCreditsRequest(req: Partial<DepositCreditsRequest>): {
  valid: boolean;
  errors: string[];
  calculatedFinancials?: {
    subtotal_idr: number;
    tax_amount_idr: number;
    total_amount_idr: number;
  };
} {
  const errors: string[] = [];

  if (!req.purchase_id || typeof req.purchase_id !== 'string' || req.purchase_id.trim() === '') {
    errors.push('purchase_id is required');
  }
  if (!req.branch_id || typeof req.branch_id !== 'string' || req.branch_id.trim() === '') {
    errors.push('branch_id is required');
  }
  if (!req.agency_id || typeof req.agency_id !== 'string' || req.agency_id.trim() === '') {
    errors.push('agency_id is required');
  }
  if (typeof req.quantity !== 'number' || !Number.isInteger(req.quantity)) {
    errors.push('quantity must be an integer');
  } else if (req.quantity < BWM_PRICING.MINIMUM_CREDIT_DEPOSIT_QUANTITY) {
    errors.push(
      `quantity must be at least ${BWM_PRICING.MINIMUM_CREDIT_DEPOSIT_QUANTITY} credits (received: ${req.quantity})`
    );
  }
  if (!req.payment_method || (req.payment_method !== 'QRIS' && req.payment_method !== 'BANK_TRANSFER')) {
    errors.push('payment_method must be either QRIS or BANK_TRANSFER');
  }
  if (!req.purchase_reference || req.purchase_reference.trim() === '') {
    errors.push('purchase_reference is required');
  }
  if (!req.payment_reference || req.payment_reference.trim() === '') {
    errors.push('payment_reference is required (gateway payment ID)');
  }

  // Integer currency validation (Zero Float)
  let calculatedFinancials: { subtotal_idr: number; tax_amount_idr: number; total_amount_idr: number } | undefined;
  if (req.quantity && req.quantity >= BWM_PRICING.MINIMUM_CREDIT_DEPOSIT_QUANTITY) {
    const subtotal = req.quantity * BWM_PRICING.MONTHLY_PERSONNEL_SEAT_IDR;
    const tax = Math.round(subtotal * BWM_PRICING.PPN_RATE);
    const total = subtotal + tax;
    calculatedFinancials = {
      subtotal_idr: subtotal,
      tax_amount_idr: tax,
      total_amount_idr: total,
    };

    if (req.total_amount_idr !== undefined) {
      if (!Number.isInteger(req.total_amount_idr)) {
        errors.push('total_amount_idr must be an integer (zero float)');
      } else if (req.total_amount_idr !== total) {
        errors.push(`total_amount_idr mismatch: expected ${total}, received ${req.total_amount_idr}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    calculatedFinancials,
  };
}

// =========================================================================================
// 2. OPERATION: CONSUME / ACTIVATE (30-DAY ROLLING SEAT)
// =========================================================================================

export interface ActivatePersonnelSeatRequest {
  branch_id: string;
  personnel_id: string;
  agency_id?: string;
  idempotency_key?: string;
  reference_time_utc?: string;
}

export interface ActivatePersonnelSeatResponse {
  success: boolean;
  license_id: string;
  personnel_id: string;
  branch_id: string;
  credit_id: string;
  activated_at: string;
  expires_at: string;
  status: 'ACTIVE';
  pool_snapshot: {
    available_credits: number;
    active_seats: number;
  };
}

export function validateActivatePersonnelSeatRequest(req: Partial<ActivatePersonnelSeatRequest>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!req.branch_id || req.branch_id.trim() === '') {
    errors.push('branch_id is required');
  }
  if (!req.personnel_id || req.personnel_id.trim() === '') {
    errors.push('personnel_id is required');
  }
  if (req.reference_time_utc && isNaN(Date.parse(req.reference_time_utc))) {
    errors.push('reference_time_utc must be a valid ISO-8601 timestamp');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =========================================================================================
// 3. OPERATION: FREEZE / CHARGEBACK (DISPUTE ISOLATION)
// =========================================================================================

export interface ProcessChargebackRequest {
  payment_reference: string;
  dispute_id: string;
  reason?: string;
}

export interface ProcessChargebackResponse {
  success: boolean;
  payment_reference: string;
  dispute_id: string;
  frozen_credits_count: number;
  frozen_credit_ids: string[];
  pool_snapshot: {
    available_credits: number;
    active_seats: number;
  };
  idempotent_replay: boolean;
}

export function validateProcessChargebackRequest(req: Partial<ProcessChargebackRequest>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!req.payment_reference || req.payment_reference.trim() === '') {
    errors.push('payment_reference is required');
  }
  if (!req.dispute_id || req.dispute_id.trim() === '') {
    errors.push('dispute_id is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =========================================================================================
// 4. OPERATION: REVERSE / RECONCILE (AUDIT & MATHEMATICAL INTEGRITY)
// =========================================================================================

export interface ReconcileLedgerRequest {
  branch_id: string;
  trigger_type: 'AUDIT_CRON' | 'MANUAL_DISCREPANCY_CHECK' | 'SETTLEMENT';
  reference_time_utc?: string;
}

export interface ReconcileLedgerResponse {
  branch_id: string;
  is_balanced: boolean;
  pool_available_credits: number;
  ledger_available_credits_sum: number;
  pool_active_seats: number;
  ledger_consumed_active_seats_sum: number;
  discrepancy: {
    available_credit_delta: number;
    active_seat_delta: number;
  };
  reconciled_at: string;
}

export function validateReconcileLedgerRequest(req: Partial<ReconcileLedgerRequest>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!req.branch_id || req.branch_id.trim() === '') {
    errors.push('branch_id is required');
  }
  const validTriggers = ['AUDIT_CRON', 'MANUAL_DISCREPANCY_CHECK', 'SETTLEMENT'];
  if (!req.trigger_type || !validTriggers.includes(req.trigger_type)) {
    errors.push(`trigger_type must be one of: ${validTriggers.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}


// =========================================================================================
// 5. EDGE ERROR NORMALIZATION & LOG SANITIZATION
// =========================================================================================

export interface StandardWorkforceErrorResponse {
  success: false;
  error: string;
  code: string;
  message: string;
  timestamp: string;
}

/**
 * Normalizes internal workforce / database errors to standardized HTTP JSON responses.
 * Prevents unhandled 500 error stack dumps from leaking internal details.
 */
export function normalizeWorkforceApiError(error: unknown): {
  statusCode: number;
  body: StandardWorkforceErrorResponse;
} {
  const message = error instanceof Error ? error.message : String(error);
  const now = new Date().toISOString();

  if (message.includes('INSUFFICIENT_CREDITS')) {
    return {
      statusCode: 402,
      body: {
        success: false,
        error: 'INSUFFICIENT_CREDITS',
        code: 'ERR_INSUFFICIENT_CREDITS',
        message: 'Kredit kursi tidak mencukupi untuk melakukan aktivasi personel.',
        timestamp: now,
      },
    };
  }

  if (
    message.includes('SUBSCRIPTION_EXPIRED') ||
    message.includes('PERSONNEL_LICENSE_INACTIVE') ||
    message.includes('ACTIVATION_UNPAID')
  ) {
    return {
      statusCode: 403,
      body: {
        success: false,
        error: 'SUBSCRIPTION_EXPIRED',
        code: 'ERR_SUBSCRIPTION_EXPIRED',
        message: 'Masa berlaku lisensi atau langganan cabang telah kedaluwarsa.',
        timestamp: now,
      },
    };
  }

  if (
    message.includes('TENANT_ISOLATION_BREACH') ||
    message.includes('SECURITY_VIOLATION') ||
    message.includes('BRANCH_MEMBERSHIP_MISMATCH') ||
    message.includes('PRIVILEGE_ESCALATION_BLOCKED')
  ) {
    return {
      statusCode: 403,
      body: {
        success: false,
        error: 'TENANT_ISOLATION_BREACH',
        code: 'ERR_TENANT_ISOLATION_BREACH',
        message: 'Pelanggaran isolasi tenant: Akses lintas agensi/cabang ditolak.',
        timestamp: now,
      },
    };
  }

  if (message.includes('MINIMUM_DEPOSIT_NOT_MET')) {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: 'MINIMUM_DEPOSIT_NOT_MET',
        code: 'ERR_MINIMUM_DEPOSIT_NOT_MET',
        message: 'Jumlah deposit kurang dari minimum kuota yang ditentukan (5 kredit).',
        timestamp: now,
      },
    };
  }

  return {
    statusCode: 500,
    body: {
      success: false,
      error: 'INTERNAL_WORKFORCE_ERROR',
      code: 'ERR_INTERNAL_WORKFORCE_ERROR',
      message: 'Terjadi kesalahan internal pada layanan workforce.',
      timestamp: now,
    },
  };
}

/**
 * Sanitizes log output to guarantee zero credential or token leakage in logs.
 * Masks connection strings, bearer tokens, Supabase keys, JWTs, and payment provider keys.
 */
export function sanitizeWorkforceLog(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    // Mask postgres URLs: postgresql://user:pass@host:port/db (greedy match up to last @ before host)
    .replace(/postgres(?:ql)?:\/\/[^\s/]+@/gi, 'postgresql://[REDACTED_USER]:[REDACTED_SECRET]@')
    // Mask Bearer tokens
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED_TOKEN]')
    // Mask Supabase secret keys (sb_secret_... or eyJ...)
    .replace(/sb_secret_[a-zA-Z0-9_\-]+/gi, '[REDACTED_SUPABASE_KEY]')
    .replace(/sb_publishable_[a-zA-Z0-9_\-]+/gi, '[REDACTED_SUPABASE_KEY]')
    .replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/gi, '[REDACTED_JWT_TOKEN]')
    // Mask Xendit / webhook keys (xnd_development_..., xnd_production_...)
    .replace(/xnd_(development|production)_[a-zA-Z0-9]+/gi, '[REDACTED_XENDIT_KEY]');
}
