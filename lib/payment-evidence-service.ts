/**
 * lib/payment-evidence-service.ts
 * Core Dual-Rail Payment Evidence & Invariant State Machine Service
 *
 * Core Financial Invariants:
 * 1. "Payment Evidence ≠ Payment Confirmation."
 * 2. "Multimodal AI may accelerate verification; only the Financial State Machine may authorize payment."
 * 3. An asynchronous upload of receipt/slip is captured as unverified `PaymentEvidence`.
 * 4. Verification state transitions:
 *    ORDER_CREATED -> PAYMENT_PENDING -> (Upload Bukti) -> OCR Parsing -> MATCH_CANDIDATE:
 *      - If threshold passes: AUTO_VERIFICATION -> PENDING_PAYMENT_CONFIRMATION
 *      - If anomalies detected: MANUAL_REVIEW -> PENDING_MANUAL_REVIEW
 * 5. ONLY Financial State Machine (via bank mutation reader / payment gateway / explicit manual merchant approval)
 *    may transition order to PAID.
 */

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { toCanonicalUTCString } from '@/lib/timezone-canonical';

export type PaymentEvidenceRailType =
  | 'MANUAL_SLIP_OCR'
  | 'BANK_MUTATION_READER'
  | 'QRIS_DYNAMIC'
  | 'DIRECT_MANUAL';

export type PaymentEvidenceStatus =
  | 'MATCH_CANDIDATE'
  | 'NEEDS_MANUAL_REVIEW'
  | 'MATCHED'
  | 'DISPUTED';

export type OrderVerificationState =
  | 'PENDING_PAYMENT_CONFIRMATION'
  | 'PENDING_MANUAL_REVIEW'
  | 'WAITING_PAYMENT';

export type ExternalReferenceType =
  | 'BANK_REF'
  | 'QRIS_RRN'
  | 'MUTATION_ID'
  | 'SLIP_JOURNAL'
  | 'EWALLET_REF'
  | 'GENERIC_REFERENCE';

export interface VerificationSignals {
  nominal_matched: boolean;
  merchant_matched: boolean;
  reference_valid: boolean;
  temporal_signal: 'TIMELY' | 'TOLERATED' | 'SKEWED';
  confidence_score: number;
}

export interface PaymentEvidenceInput {
  orderId: string;
  tenantSlug: string;
  tenantId?: string | null;
  proofUrl: string;
  rawAmount: number;
  expectedAmount: number;
  detectedMerchant?: string;
  targetMerchantName?: string;
  externalReference?: string | null;
  referenceType?: ExternalReferenceType;
  receiptTransactionAt?: string | null;
  checkoutCreatedAt?: string | null;
  toleranceHours?: number; // default: 24 jam
  notes?: string;
  rawPayload?: Record<string, any>;
}

export interface PaymentEvidenceRecord {
  id: string;
  order_id: string;
  tenant_id: string;
  rail_type: PaymentEvidenceRailType;
  raw_amount: number;
  expected_amount: number;
  detected_merchant?: string;
  external_reference?: string | null;
  reference_type?: ExternalReferenceType;
  receipt_transaction_at?: string | null;
  checkout_created_at?: string | null;
  status: PaymentEvidenceStatus;
  verification_state: OrderVerificationState;
  signals: VerificationSignals;
  created_at: string;
}

export interface IngestEvidenceResult {
  success: boolean;
  evidence: PaymentEvidenceRecord;
  orderStatus: OrderVerificationState;
  signals: VerificationSignals;
  message: string;
  error?: string;
}

/**
 * Normalizes and extracts external reference and its adapter type
 * without hardcoding bank-specific fields like 'RRN'.
 */
export function resolveExternalReference(rawRef?: string | null): {
  externalReference: string | null;
  referenceType: ExternalReferenceType;
} {
  if (!rawRef || typeof rawRef !== 'string') {
    return { externalReference: null, referenceType: 'GENERIC_REFERENCE' };
  }

  const clean = rawRef.trim();
  if (!clean) {
    return { externalReference: null, referenceType: 'GENERIC_REFERENCE' };
  }

  const upper = clean.toUpperCase();
  if (upper.startsWith('RRN') || /^\d{12}$/.test(clean)) {
    return { externalReference: clean, referenceType: 'QRIS_RRN' };
  }
  if (upper.includes('BCA') || upper.includes('MANDIRI') || upper.includes('BRI') || upper.includes('BNI')) {
    return { externalReference: clean, referenceType: 'BANK_REF' };
  }
  if (upper.startsWith('JRN') || upper.startsWith('NO_JURNAL')) {
    return { externalReference: clean, referenceType: 'SLIP_JOURNAL' };
  }

  return { externalReference: clean, referenceType: 'GENERIC_REFERENCE' };
}

/**
 * Evaluates comparative temporal signal of receipt timestamp against order checkout timestamp.
 * Invariant: Margin toleransi configurable, NOT a hard rejection authority!
 */
export function evaluateTemporalSignal(
  receiptAtStr?: string | null,
  checkoutAtStr?: string | null,
  toleranceHours: number = 24
): 'TIMELY' | 'TOLERATED' | 'SKEWED' {
  if (!receiptAtStr || !checkoutAtStr) {
    return 'TOLERATED'; // Fallback gracefully if receipt lacks parsed timestamp
  }

  const receiptTime = new Date(receiptAtStr).getTime();
  const checkoutTime = new Date(checkoutAtStr).getTime();

  if (isNaN(receiptTime) || isNaN(checkoutTime)) {
    return 'TOLERATED';
  }

  const diffMs = receiptTime - checkoutTime;
  const toleranceMs = toleranceHours * 60 * 60 * 1000;

  // Receipt is within reasonable window (from 30 min before checkout due to clock drift up to toleranceHours after)
  if (diffMs >= -30 * 60 * 1000 && diffMs <= toleranceMs) {
    return 'TIMELY';
  }

  // Beyond standard window but within 48h active tolerance
  if (diffMs > toleranceMs && diffMs <= 48 * 60 * 60 * 1000) {
    return 'TOLERATED';
  }

  return 'SKEWED';
}

/**
 * Ingests incoming payment proof as unverified PaymentEvidence,
 * evaluates OCR matching signals against order contracts,
 * and determines next verification state (MATCH_CANDIDATE -> PENDING_PAYMENT_CONFIRMATION or PENDING_MANUAL_REVIEW).
 *
 * ABSOLUTE INVARIANT:
 * This function NEVER directly marks an order as PAID.
 */
export async function ingestPaymentEvidence(
  input: PaymentEvidenceInput
): Promise<IngestEvidenceResult> {
  const supabase = getSupabaseAdmin() || getSupabase();
  const nowIso = toCanonicalUTCString();

  const {
    orderId,
    tenantSlug,
    tenantId,
    proofUrl,
    rawAmount,
    expectedAmount,
    detectedMerchant = '',
    targetMerchantName = '',
    externalReference = null,
    referenceType = 'GENERIC_REFERENCE',
    receiptTransactionAt = null,
    checkoutCreatedAt = null,
    toleranceHours = 24,
    notes = '',
    rawPayload = {},
  } = input;

  // 1. Evaluate OCR Matching Signals
  const nominalMatched = rawAmount > 0 && expectedAmount > 0 && rawAmount === expectedAmount;

  // Merchant name matching (case-insensitive substring or fuzzy match)
  const cleanDetected = detectedMerchant.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanTarget = targetMerchantName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanSlug = tenantSlug.toLowerCase().replace(/[^a-z0-9]/g, '');

  const merchantMatched = Boolean(
    !targetMerchantName ||
    cleanDetected.includes(cleanTarget) ||
    cleanTarget.includes(cleanDetected) ||
    cleanDetected.includes(cleanSlug) ||
    cleanSlug.includes(cleanDetected)
  );

  const referenceValid = Boolean(externalReference && externalReference.length >= 4);
  const temporalSignal = evaluateTemporalSignal(receiptTransactionAt, checkoutCreatedAt, toleranceHours);

  // Confidence Score Calculation (0.0 to 1.0)
  let confidence = 0.5;
  if (nominalMatched) confidence += 0.35;
  if (merchantMatched) confidence += 0.1;
  if (referenceValid) confidence += 0.05;
  if (temporalSignal === 'TIMELY') confidence += 0.05;
  if (temporalSignal === 'SKEWED') confidence -= 0.15;
  confidence = Math.min(1.0, Math.max(0.0, Number(confidence.toFixed(2))));

  // 2. Determine State Machine Routing
  // If nominal matches exactly and merchant/temporal checks pass threshold:
  const isMatchCandidate = nominalMatched && merchantMatched && temporalSignal !== 'SKEWED';
  const evidenceStatus: PaymentEvidenceStatus = isMatchCandidate
    ? 'MATCH_CANDIDATE'
    : 'NEEDS_MANUAL_REVIEW';

  const orderVerificationState: OrderVerificationState = isMatchCandidate
    ? 'PENDING_PAYMENT_CONFIRMATION'
    : 'PENDING_MANUAL_REVIEW';

  const signals: VerificationSignals = {
    nominal_matched: nominalMatched,
    merchant_matched: merchantMatched,
    reference_valid: referenceValid,
    temporal_signal: temporalSignal,
    confidence_score: confidence,
  };

  const evidenceRecord: PaymentEvidenceRecord = {
    id: `ev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    order_id: orderId,
    tenant_id: tenantId || tenantSlug,
    rail_type: 'MANUAL_SLIP_OCR',
    raw_amount: rawAmount,
    expected_amount: expectedAmount,
    detected_merchant: detectedMerchant,
    external_reference: externalReference,
    reference_type: referenceType,
    receipt_transaction_at: receiptTransactionAt,
    checkout_created_at: checkoutCreatedAt,
    status: evidenceStatus,
    verification_state: orderVerificationState,
    signals,
    created_at: nowIso,
  };

  // 3. Persist to Database
  if (supabase) {
    try {
      // Attempt insert into payment_evidence table if it exists
      try {
        await supabase.from('payment_evidence').insert({
          id: evidenceRecord.id,
          tenant_id: tenantId || tenantSlug,
          order_id: orderId,
          rail_type: 'MANUAL_SLIP_OCR',
          raw_amount: rawAmount,
          reference_no: externalReference,
          status: evidenceStatus === 'MATCH_CANDIDATE' ? 'UNMATCHED' : 'DISPUTED',
          raw_payload: {
            proof_url: proofUrl,
            signals,
            notes,
            detected_merchant: detectedMerchant,
            reference_type: referenceType,
            receipt_transaction_at: receiptTransactionAt,
            ...rawPayload,
          },
          created_at: nowIso,
        });
      } catch (insertErr: any) {
        // Non-blocking if table is still pending migration
        console.debug('[PaymentEvidence] Note on table insert:', insertErr?.message);
      }

      // Update Order Metadata & Verification State (NEVER SET TO PAID HERE)
      const { data: currentOrder } = await supabase
        .from('orders')
        .select('metadata')
        .eq('id', orderId)
        .maybeSingle();

      const existingMeta = currentOrder?.metadata || {};
      const updatedMeta = {
        ...existingMeta,
        payment_evidence_id: evidenceRecord.id,
        evidence_status: evidenceStatus,
        verification_state: orderVerificationState,
        signals,
        ocr_verified: isMatchCandidate,
        ocr_match_confidence: confidence,
        ocr_detected_amount: rawAmount,
        ocr_detected_merchant: detectedMerchant,
        external_reference: externalReference,
        reference_type: referenceType,
        receipt_transaction_at: receiptTransactionAt,
        proof_uploaded_at: nowIso,
        verification_estimation_seconds: 180, // 3-minute UX estimation window
      };

      await supabase
        .from('orders')
        .update({
          status: 'WAITING_CONFIRMATION',
          payment_status: 'WAITING_CONFIRMATION',
          order_status: 'WAITING_CONFIRMATION',
          payment_proof_url: proofUrl,
          metadata: updatedMeta,
          updated_at: nowIso,
        })
        .eq('id', orderId);

    } catch (dbErr) {
      console.warn('[PaymentEvidence] Database update note:', dbErr);
    }
  }

  const message = isMatchCandidate
    ? 'Bukti transfer teridentifikasi sebagai MATCH_CANDIDATE (nominal dan tujuan terverifikasi). Menunggu rekonsiliasi konfirmasi finansial.'
    : 'Bukti transfer membutuhkan pemeriksaan manual oleh admin toko karena terdeteksi anomali pada nominal atau tujuan.';

  return {
    success: true,
    evidence: evidenceRecord,
    orderStatus: orderVerificationState,
    signals,
    message,
  };
}
