import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { sendOrderFulfillmentNotification, normalizeWhatsAppNumber } from '@/lib/whatsapp';
import { generateTelegramInviteLink } from '@/lib/telegram/telegram-invite-service';
import { dispatchMetaCAPI, dispatchMetaCAPIPurchaseForOrder } from '@/lib/capi.service';
import { enqueueCAPIOutboxEvent } from '@/lib/capi-outbox';
import { readerAdapter } from '@/lib/payment/adapters/reader-adapter';
import { paymentEventService } from '@/lib/payment/payment-event-service';
import { checkTrialQuota } from '@/lib/entitlements/trial-guard';
import { sendOrderCommissionAlert } from '@/lib/affiliate-notification-service';
import { sendOrderFulfillmentEmails } from '@/lib/email-service';
import { parseDanaNotification, validateOrderPaymentMatch } from '@/lib/payment/dana-reader';
import { activateShopSubscription } from '@/lib/subscriptions/service';
import { SubscriptionTier, SubscriptionDurationMonths } from '@/lib/subscriptions/types';
import { resolveHardeningPolicy } from '@/lib/resolvers/tenant-runtime-resolver';

// In-memory diagnostic logs ring buffer (stores up to 50 latest webhook calls)
export interface WebhookLogEntry {
  id: string;
  timestamp: string;
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  rawBody: any;
  parsedAmount?: number | null;
  detectedApp?: string | null;
  tenantSlug?: string | null;
  matchedOrderId?: string | null;
  matchStrategy?: string | null;
  resultStatus: number;
  resultBody: any;
}

const recentWebhookLogs: WebhookLogEntry[] = [];
const MAX_LOG_ENTRIES = 50;

const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'x-callback-token',
  'x-api-key',
  'cookie',
  'set-cookie',
  'apikey',
  'token',
  'x-internal-secret',
  'x-admin-key',
  'authentication_api_key',
]);

const PII_KEY_REGEX = /^(?:.*_)?(?:phone|telepon|hp|wa|whatsapp|msisdn|mobile|email|token|secret|password|card|rekening|account_number|nik|ktp|address|alamat|customer_name|buyer_name)(?:_.*)?$/i;
const PHONE_PATTERN = /(?:\+?62|08)[0-9]{8,13}\b/g;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Sanitasi PII rekursif untuk menyensor nomor telepon, email, token, dan data pribadi menjadi [REDACTED_PII].
 */
export function sanitizePII(data: any): any {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    let text = data;
    if (EMAIL_PATTERN.test(text)) {
      text = text.replace(EMAIL_PATTERN, '[REDACTED_PII]');
    }
    if (PHONE_PATTERN.test(text)) {
      text = text.replace(PHONE_PATTERN, '[REDACTED_PII]');
    }
    return text;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizePII(item));
  }

  if (typeof data === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (PII_KEY_REGEX.test(key)) {
        if (value === null || value === undefined) {
          sanitized[key] = value;
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          sanitized[key] = sanitizePII(value);
        } else {
          sanitized[key] = '[REDACTED_PII]';
        }
      } else {
        sanitized[key] = sanitizePII(value);
      }
    }
    return sanitized;
  }

  return data;
}

/**
 * Verifikasi hak akses pembacaan diagnostic logs (?logs=true).
 * HANYA izinkan ADMIN_INTERNAL_SECRET / INTERNAL_API_SECRET atau Supabase Service Role Key.
 * XENDIT_CALLBACK_TOKEN atau EVOLUTION_API_KEY dicabut dan ditolak tegas.
 */
export function isAuthorizedWebhookLogViewer(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')?.trim();
  const internalSecret = req.headers.get('x-internal-secret')?.trim();

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const envAdminSecret = (process.env.ADMIN_INTERNAL_SECRET || process.env.INTERNAL_API_SECRET)?.trim();

  // Internal Secret Header Check
  if (envAdminSecret && (internalSecret === envAdminSecret || authHeader === `Bearer ${envAdminSecret}`)) {
    return true;
  }

  // Supabase Service Role Key Check
  if (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`) {
    return true;
  }

  return false;
}

export function addWebhookLog(entry: WebhookLogEntry) {
  // Sanitasi PII dan kredensial sensitif sebelum disimpan ke log diagnostik publik
  const sanitizedHeaders: Record<string, string> = {};
  if (entry.headers && typeof entry.headers === 'object') {
    for (const [k, v] of Object.entries(entry.headers)) {
      if (SENSITIVE_HEADER_KEYS.has(k.toLowerCase())) {
        sanitizedHeaders[k] = '[REDACTED]';
      } else {
        sanitizedHeaders[k] = v;
      }
    }
  }

  // Nonaktifkan logging raw body dan sanitasi resultBody untuk mencegah kebocoran PII
  const sanitizedEntry: WebhookLogEntry = {
    ...entry,
    headers: sanitizedHeaders,
    rawBody: '[REDACTED_PII]',
    resultBody: sanitizePII(entry.resultBody),
  };

  recentWebhookLogs.unshift(sanitizedEntry);
  if (recentWebhookLogs.length > MAX_LOG_ENTRIES) {
    recentWebhookLogs.pop();
  }
}

export function getRecentWebhookLogs(): WebhookLogEntry[] {
  return recentWebhookLogs;
}

/**
 * Parser teks notifikasi mutasi DANA Bisnis, BCA, GoPay, Mandiri, BRI, dll.
 * Mendukung variasi format:
 * - "DANA Bisnis: Pembayaran diterima sebesar Rp 1.771"
 * - "QRIS: Berhasil menerima Rp 1.771"
 * - "DANA Bisnis: Pembayaran diterima sebesar Rp1.771"
 * - "DANA: Pembayaran sebesar Rp 1.771 berhasil diterima"
 * - "DANA Bisnis: Transaksi QRIS sebesar Rp1.771,00 sukses"
 * - "m-Transfer: 19/09 1771.00 ..."
 * - "GoPay Usaha: Pembayaran sebesar Rp 1.771 berhasil diterima"
 * - "Berhasil menerima Rp 1.771 dari PEMBELI"
 */
export function parsePaymentNotification(rawText: string): {
  amount: number | null;
  detectedApp: string | null;
  rawMatch?: string;
} {
  if (!rawText || typeof rawText !== 'string') {
    return { amount: null, detectedApp: null };
  }

  const text = rawText.trim();
  const lower = text.toLowerCase();

  let detectedApp: string | null = null;
  if (lower.includes('dana')) {
    detectedApp = 'DANA';
    const danaCheck = parseDanaNotification(text);
    if (danaCheck.isRejected || !danaCheck.isValidCredit) {
      return { amount: null, detectedApp: 'DANA' };
    }
    return {
      amount: danaCheck.amount,
      detectedApp: 'DANA',
      rawMatch: danaCheck.matchedPattern || undefined,
    };
  } else if (lower.includes('bca') || lower.includes('klikbca') || lower.includes('mybca')) detectedApp = 'BCA';
  else if (lower.includes('gopay') || lower.includes('gojek')) detectedApp = 'GOPAY';
  else if (lower.includes('mandiri') || lower.includes('livin')) detectedApp = 'MANDIRI';
  else if (lower.includes('bri') || lower.includes('brimo')) detectedApp = 'BRI';
  else if (lower.includes('shopee') || lower.includes('spay')) detectedApp = 'SHOPEEPAY';

  // Pattern 1: Rp / IDR diikuti angka dengan pemisah ribuan titik/koma
  const rpRegex = /(?:rp\.?|idr)\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+)/i;

  // Pattern 2: Kata kunci penerimaan uang diikuti nominal
  const keywordRegex = /(?:sebesar|menerima|pembayaran|nominal|berhasil menerima|masuk sebesar|uang masuk|terima)\s*(?:rp\.?|idr)?\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+)/i;

  let match = text.match(rpRegex);
  if (!match) {
    match = text.match(keywordRegex);
  }

  // Fallback: cari angka nominal ribuan yang berdiri sendiri (e.g. 1.771)
  if (!match) {
    const genericMatch = text.match(/\b([1-9][0-9]{0,2}(?:\.[0-9]{3})+|\b[1-9][0-9]{3,8}\b)/);
    if (genericMatch) {
      match = genericMatch;
    }
  }

  if (!match) {
    return { amount: null, detectedApp };
  }

  let numStr = match[1].trim();

  // Bersihkan format desimal/sen trailing seperti ,- atau .-
  if (numStr.endsWith(',-') || numStr.endsWith('.-')) {
    numStr = numStr.slice(0, -2);
  }
  // Bersihkan format sen seperti ,00 atau .00
  if (numStr.endsWith(',00') || numStr.endsWith('.00')) {
    numStr = numStr.slice(0, -3);
  }

  // Ambil hanya digit angka
  const cleanDigits = numStr.replace(/[^0-9]/g, '');
  const amount = parseInt(cleanDigits, 10);

  return {
    amount: isNaN(amount) || amount <= 0 ? null : amount,
    detectedApp,
    rawMatch: match[0],
  };
}

/**
 * Handle incoming webhook POST from BoonTrack Reader APK or Payment Gateway
 */
export async function handlePaymentWebhook(req: NextRequest, endpointSource = 'reader_webhook') {
  const logId = `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const headersObj: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headersObj[k] = v;
  });

  let rawBody: any = {};
  try {
    const textBody = await req.text();
    if (textBody) {
      try {
        rawBody = JSON.parse(textBody);
      } catch {
        rawBody = { text: textBody };
      }
    }
  } catch (readErr) {
    console.warn('[Webhook Reader] Error reading request body:', readErr);
  }

  const { searchParams } = new URL(req.url);

  // 1. Resolusi Tenant Slug dari berbagai variasi payload / query param / headers
  const tenantSlug =
    searchParams.get('tenant') ||
    searchParams.get('tenant_slug') ||
    searchParams.get('slug') ||
    rawBody.tenant_slug ||
    rawBody.tenant ||
    rawBody.slug ||
    rawBody.merchant_slug ||
    rawBody.store_slug ||
    rawBody.metadata?.tenant_slug ||
    rawBody.data?.metadata?.tenant_slug ||
    headersObj['x-tenant-slug'] ||
    headersObj['x-tenant-id'] ||
    headersObj['tenant-slug'] ||
    headersObj['tenant'] ||
    null;

  // 2. Cek apakah ada Direct Order ID (dari Gateway / Payment Provider resmi Xendit / Reader)
  const directOrderId =
    rawBody.data?.reference_id ||
    rawBody.reference_id ||
    rawBody.external_id ||
    rawBody.data?.external_id ||
    rawBody.order_id ||
    rawBody.data?.order_id ||
    rawBody.invoice_id ||
    rawBody.bill_no ||
    rawBody.id ||
    rawBody.data?.id ||
    searchParams.get('order_id');

  const rawStatus = String(
    rawBody.status ||
    rawBody.payment_status ||
    rawBody.transaction_status ||
    rawBody.event ||
    rawBody.data?.status ||
    ''
  ).toUpperCase();

  const isDirectPaid =
    rawStatus === 'PAID' ||
    rawStatus === 'SETTLED' ||
    rawStatus === 'SETTLEMENT' ||
    rawStatus === 'SUCCESS' ||
    rawStatus === 'COMPLETED' ||
    rawStatus === 'MUTATION_MATCHED' ||
    rawBody.event === 'qr.payment' ||
    rawBody.data?.status === 'COMPLETED' ||
    (rawStatus === 'CAPTURE' && (!rawBody.fraud_status || String(rawBody.fraud_status).toLowerCase() === 'accept'));

  // 3. Ekstraksi Notifikasi Teks (dari BoonTrack Reader APK Android)
  // FIX(2026-09-19): Ternary operator precedence bug - rawBody.title ? ... mengevaluasi
  //   seluruh chain OR sebelumnya sebagai condition, bukan hanya rawBody.title.
  //   Akibatnya jika title null tapi body/text ada -> notificationText = null -> parsedAmount = null.
  const _titlePart = String(rawBody.title || rawBody.notification_title || '').trim();
  const _bodyPart = String(
    rawBody.body ||
    rawBody.text ||
    rawBody.message ||
    rawBody.content ||
    rawBody.notification ||
    rawBody.snippet ||
    rawBody.raw_text ||
    ''
  ).trim();
  const notificationText: string | null = (_titlePart && _bodyPart)
    ? `${_titlePart} ${_bodyPart}`
    : (_bodyPart || _titlePart || null);

  // Nominal eksplisit jika Android Reader atau Xendit sudah mem-parsing sebelumnya
  const explicitAmount = Number(
    rawBody.amount ||
    rawBody.nominal ||
    rawBody.gross_amount ||
    rawBody.total ||
    rawBody.paid_amount ||
    rawBody.data?.amount ||
    0
  );

  let parsedAmount = explicitAmount > 0 ? explicitAmount : null;
  let detectedApp: string | null = null;

  if (notificationText) {
    const parseResult = parsePaymentNotification(notificationText);
    if (!parsedAmount && parseResult.amount) {
      parsedAmount = parseResult.amount;
    }
    detectedApp = parseResult.detectedApp;
  }

  console.log(`[Webhook Reader ${logId}] Incoming Payload:`, {
    endpoint: endpointSource,
    tenantSlug,
    directOrderId,
    parsedAmount,
    detectedApp,
    notificationText: notificationText?.slice(0, 100),
  });

  const supabase = getSupabaseAdmin() || getSupabase();
  if (!supabase) {
    const errorRes = { success: false, error: 'Database unreachable', logId };
    addWebhookLog({
      id: logId,
      timestamp: new Date().toISOString(),
      endpoint: endpointSource,
      method: 'POST',
      headers: headersObj,
      rawBody,
      parsedAmount,
      detectedApp,
      tenantSlug,
      resultStatus: 500,
      resultBody: errorRes,
    });
    return NextResponse.json(errorRes, { status: 500 });
  }

  // ── SPECIAL HANDLER: SUBSCRIPTION INVOICE ACTIVATION (order_id starting with SUB-) ──
  const potentialSubOrderId = String(
    rawBody.order_id ||
    rawBody.external_id ||
    rawBody.id ||
    rawBody.invoice_id ||
    rawBody.reference_id ||
    rawBody.bill_no ||
    directOrderId ||
    searchParams.get('order_id') ||
    ''
  ).trim();

  const isSubOrder =
    potentialSubOrderId.toUpperCase().startsWith('SUB-') ||
    potentialSubOrderId.toLowerCase().startsWith('sub_') ||
    potentialSubOrderId.toLowerCase().startsWith('sub-');

  if (isSubOrder && isDirectPaid) {
    console.log(`[Webhook Reader ${logId}] Subscription payment detected for order #${potentialSubOrderId}. Activating subscription...`);

    const subInvoiceId = String(
      rawBody.invoice_id ||
      rawBody.id ||
      rawBody.external_id ||
      potentialSubOrderId
    );

    const subAmountPaid = explicitAmount > 0
      ? explicitAmount
      : (parsedAmount || Number(rawBody.amount || rawBody.gross_amount || rawBody.total || 0));

    // Resolve tenant identifier
    let subTenantId = rawBody.tenant_id || rawBody.tenantId || rawBody.metadata?.tenant_id || rawBody.metadata?.tenantId || null;
    let subTenantSlug = tenantSlug || rawBody.tenant_slug || rawBody.metadata?.tenant_slug || null;

    // Check if there is a pending subscription record in shop_subscriptions
    let pendingSub: any = null;
    try {
      const { data } = await supabase
        .from('shop_subscriptions')
        .select('*')
        .or(`invoice_id.eq.${subInvoiceId},invoice_id.eq.${potentialSubOrderId}`)
        .limit(1)
        .maybeSingle();
      pendingSub = data;
    } catch {}

    if (pendingSub) {
      if (!subTenantId) subTenantId = pendingSub.tenant_id;
      if (!subTenantSlug) subTenantSlug = pendingSub.tenant_slug;
    }

    if (!subTenantId && !subTenantSlug && potentialSubOrderId.includes('-')) {
      const parts = potentialSubOrderId.split('-');
      if (parts[1]) {
        subTenantSlug = parts[1];
      }
    }

    // Determine tier
    let subTier: SubscriptionTier = 'PRO_SCALE';
    const tierCandidate = String(
      rawBody.tier ||
      rawBody.plan_tier ||
      rawBody.subscription_tier ||
      rawBody.metadata?.tier ||
      rawBody.metadata?.plan_tier ||
      pendingSub?.tier ||
      pendingSub?.plan_tier ||
      potentialSubOrderId
    ).toUpperCase();

    if (tierCandidate.includes('ENTERPRISE') || tierCandidate.includes('TEAM')) {
      subTier = 'ENTERPRISE';
    } else if (tierCandidate.includes('STARTER') || tierCandidate.includes('SOLO')) {
      subTier = 'STARTER';
    } else if (tierCandidate.includes('PRO') || tierCandidate.includes('ADS') || tierCandidate.includes('PERFORMANCE') || tierCandidate.includes('SCALE')) {
      subTier = 'PRO_SCALE';
    }

    // Determine duration
    let subDuration: SubscriptionDurationMonths = 1;
    const durationCandidate = Number(
      rawBody.duration_months ||
      rawBody.durationMonths ||
      rawBody.metadata?.duration_months ||
      rawBody.metadata?.durationMonths ||
      pendingSub?.duration_months ||
      0
    );

    if (durationCandidate === 6 || durationCandidate === 12) {
      subDuration = durationCandidate as SubscriptionDurationMonths;
    } else if (potentialSubOrderId.includes('-6-') || potentialSubOrderId.endsWith('-6')) {
      subDuration = 6;
    } else if (potentialSubOrderId.includes('-12-') || potentialSubOrderId.endsWith('-12')) {
      subDuration = 12;
    } else if (subAmountPaid >= 4000000 || subAmountPaid === 2870400 || subAmountPaid === 1910400) {
      subDuration = 12;
    } else if (subAmountPaid >= 1000000 || subAmountPaid === 1614600 || subAmountPaid === 1074600) {
      subDuration = 6;
    }

    // Execute activation via activateShopSubscription
    const activationResult = await activateShopSubscription(
      {
        tenantId: subTenantId || undefined,
        tenantSlug: subTenantSlug || undefined,
        tier: subTier,
        durationMonths: subDuration,
        invoiceId: subInvoiceId,
        amountPaid: subAmountPaid,
        metadata: {
          ...(rawBody.metadata || {}),
          provider: detectedApp || 'gateway',
          order_id: potentialSubOrderId,
          activated_via: 'webhook',
        },
      },
      supabase
    );

    // Also update any matching record in orders table if present
    try {
      await supabase
        .from('orders')
        .update({
          status: 'PAID',
          payment_status: 'PAID',
          paid_at: new Date().toISOString(),
        })
        .eq('id', potentialSubOrderId);
    } catch {}

    const subResponse = {
      success: activationResult.success,
      message: activationResult.success
        ? `Subscription for order #${potentialSubOrderId} successfully activated.`
        : `Subscription activation error: ${activationResult.error}`,
      subscription: activationResult.subscription,
      already_paid: activationResult.isExisting,
      order_id: potentialSubOrderId,
      log_id: logId,
    };

    addWebhookLog({
      id: logId,
      timestamp: new Date().toISOString(),
      endpoint: endpointSource,
      method: 'POST',
      headers: headersObj,
      rawBody,
      parsedAmount: subAmountPaid,
      detectedApp,
      tenantSlug: activationResult.tenantSlug || subTenantSlug,
      matchedOrderId: potentialSubOrderId,
      matchStrategy: 'subscription_activation',
      resultStatus: activationResult.success ? 200 : 400,
      resultBody: subResponse,
    });

    return NextResponse.json(subResponse, {
      status: activationResult.success ? 200 : 400,
    });
  } else if (isSubOrder) {
    // Subscription webhook received but payment status is not settled / paid (e.g. PENDING, EXPIRED, FAILED)
    console.log(`[Webhook Reader ${logId}] Subscription order #${potentialSubOrderId} received with status '${rawStatus || 'PENDING'}'. Activation skipped.`);
    const skippedRes = {
      success: true,
      message: `Subscription order #${potentialSubOrderId} status is '${rawStatus || 'PENDING'}'. Activation skipped.`,
      order_id: potentialSubOrderId,
      status: rawStatus || 'PENDING',
      log_id: logId,
    };

    addWebhookLog({
      id: logId,
      timestamp: new Date().toISOString(),
      endpoint: endpointSource,
      method: 'POST',
      headers: headersObj,
      rawBody,
      parsedAmount,
      detectedApp,
      tenantSlug,
      matchedOrderId: potentialSubOrderId,
      matchStrategy: 'subscription_skipped_unpaid',
      resultStatus: 200,
      resultBody: skippedRes,
    });

    return NextResponse.json(skippedRes, { status: 200 });
  }

  // ── SPECIAL HANDLER: STUDIO TOKEN TOP-UP (order_id / external_id starting with TOPUP-STUDIO-) ──
  const potentialTokenOrderId = String(
    rawBody.order_id ||
    rawBody.external_id ||
    rawBody.id ||
    rawBody.invoice_id ||
    rawBody.reference_id ||
    rawBody.bill_no ||
    directOrderId ||
    searchParams.get('order_id') ||
    ''
  ).trim();

  const isStudioTokenOrder =
    potentialTokenOrderId.toUpperCase().startsWith('TOPUP-STUDIO-') ||
    potentialTokenOrderId.toUpperCase().startsWith('TOPUP_STUDIO_');

  if (isStudioTokenOrder && isDirectPaid) {
    console.log(`[Webhook Reader ${logId}] Studio token payment detected for order #${potentialTokenOrderId}. Processing credit top-up...`);

    const rawInvoiceId = String(rawBody.id || rawBody.invoice_id || '').trim();
    const rawExternalId = String(rawBody.external_id || potentialTokenOrderId || '').trim();
    const tokenTxId = rawExternalId || rawInvoiceId || potentialTokenOrderId;

    const tokenAmountPaid = explicitAmount > 0
      ? explicitAmount
      : (parsedAmount || Number(rawBody.amount || rawBody.gross_amount || rawBody.paid_amount || rawBody.total || 0));

    // Resolve tenant slug & parse candidate metadata
    let studioTenantSlug = tenantSlug || rawBody.tenant_slug || rawBody.tenantSlug || rawBody.metadata?.tenant_slug || null;
    let parsedCreditsCandidate: number | null = null;
    let parsedPackageCandidate: string | null = null;

    // Regex parsing dari external_id:
    // Format standar: TOPUP-STUDIO-{tenantSlug}-{credits}-{timestamp}
    // Format alternatif: TOPUP-STUDIO-{tenantSlug}-{packageId}-{credits}-{timestamp}
    const matchWithPkg = tokenTxId.match(/^TOPUP[-_]STUDIO[-_](.+?)[-_](ketengan|starter|creator|pro_monthly)[-_](d+)[-_](d+)$/i);
    const matchSimple = tokenTxId.match(/^TOPUP[-_]STUDIO[-_](.+?)[-_](d+)[-_](d+)$/i);

    if (matchWithPkg) {
      if (!studioTenantSlug) studioTenantSlug = matchWithPkg[1];
      parsedPackageCandidate = matchWithPkg[2].toLowerCase();
      parsedCreditsCandidate = Number(matchWithPkg[3]);
    } else if (matchSimple) {
      if (!studioTenantSlug) studioTenantSlug = matchSimple[1];
      parsedCreditsCandidate = Number(matchSimple[2]);
    }

    const { StudioCreditService } = await import('@/lib/services/studio-credit.service');
    const { getStudioTokenPackage, isTenantShopMember } = await import('@/lib/config/studio-pricing');

    // Resolve tenant SSOT dari database
    const resolvedTenant = await StudioCreditService.resolveTenant(studioTenantSlug || 'studio');
    const effectiveTenantId = resolvedTenant ? resolvedTenant.id : null;
    const effectiveTenantSlug = resolvedTenant ? resolvedTenant.slug : (studioTenantSlug || 'studio');

    // ── 1. PRE-FLIGHT IDEMPOTENCY CHECK (Anti-Double Credit) ──
    // Sebelum melakukan mutasi apa pun, periksa apakah invoice_id / external_id ini sudah pernah diproses.
    // Pengecekan multi-layer ke tenant_credit_ledger dan orders:
    const idempotencyLookupKeys = [
      effectiveTenantId && rawExternalId ? `TOPUP_${effectiveTenantId}_${rawExternalId}` : null,
      effectiveTenantId && rawInvoiceId ? `TOPUP_${effectiveTenantId}_${rawInvoiceId}` : null,
      rawExternalId ? `TOPUP_${rawExternalId}` : null,
      rawInvoiceId ? `TOPUP_${rawInvoiceId}` : null,
      rawExternalId,
      rawInvoiceId,
      tokenTxId,
    ].filter((k): k is string => Boolean(k && k.trim()));

    try {
      let isAlreadyProcessed = false;
      let existingBalanceAfter = 0;

      // A. Cek tenant_credit_ledger via idempotency_key
      if (effectiveTenantId && idempotencyLookupKeys.length > 0) {
        const { data: ledgerMatch } = await supabase
          .from('tenant_credit_ledger')
          .select('id, amount, balance_after, description')
          .eq('tenant_id', effectiveTenantId)
          .in('idempotency_key', idempotencyLookupKeys)
          .limit(1)
          .maybeSingle();

        if (ledgerMatch) {
          isAlreadyProcessed = true;
          existingBalanceAfter = ledgerMatch.balance_after;
        }
      }

      // B. Fallback cek tenant_credit_ledger via substring description & metadata
      if (!isAlreadyProcessed && effectiveTenantId && (rawExternalId || rawInvoiceId)) {
        let descQuery = supabase
          .from('tenant_credit_ledger')
          .select('id, amount, balance_after, description')
          .eq('tenant_id', effectiveTenantId);

        if (rawExternalId && rawInvoiceId) {
          descQuery = descQuery.or(`description.ilike.%${rawExternalId}%,description.ilike.%${rawInvoiceId}%`);
        } else if (rawExternalId) {
          descQuery = descQuery.ilike('description', `%${rawExternalId}%`);
        } else if (rawInvoiceId) {
          descQuery = descQuery.ilike('description', `%${rawInvoiceId}%`);
        }

        const { data: descMatch } = await descQuery.limit(1).maybeSingle();
        if (descMatch) {
          isAlreadyProcessed = true;
          existingBalanceAfter = descMatch.balance_after;
        }
      }

      // C. Cek tabel orders jika ada order terkait
      if (!isAlreadyProcessed && (rawExternalId || rawInvoiceId || tokenTxId)) {
        const orderFilters: string[] = [];
        if (tokenTxId) orderFilters.push(`id.eq.${tokenTxId}`);
        if (rawExternalId) orderFilters.push(`external_id.eq.${rawExternalId}`);
        if (rawInvoiceId) orderFilters.push(`payment_id.eq.${rawInvoiceId}`);

        if (orderFilters.length > 0) {
          const { data: matchedOrderRow } = await supabase
            .from('orders')
            .select('id, status, payment_status')
            .or(orderFilters.join(','))
            .limit(1)
            .maybeSingle();

          if (matchedOrderRow && (matchedOrderRow.status === 'PAID' || matchedOrderRow.payment_status === 'PAID')) {
            isAlreadyProcessed = true;
          }
        }
      }

      // Jika SUDAH pernah diproses, kembalikan HTTP 200 OK Safe-Acknowledgment tanpa menambah kredit lagi
      if (isAlreadyProcessed) {
        const ent = effectiveTenantId ? await StudioCreditService.getEntitlements(effectiveTenantId) : null;
        const currentBal = ent?.credits_remaining ?? existingBalanceAfter;
        console.log(`[Webhook Reader ${logId}] Studio token order #${tokenTxId} already processed previously (idempotent pre-check). Safe HTTP 200 acknowledged.`);

        const idempotentAckResponse = {
          success: true,
          message: `Studio token order #${tokenTxId} was already processed previously (idempotent duplicate).`,
          order_id: tokenTxId,
          tenant_slug: effectiveTenantSlug,
          credits_added: 0,
          new_balance: currentBal,
          already_processed: true,
          commission_recorded: false,
          log_id: logId,
        };

        addWebhookLog({
          id: logId,
          timestamp: new Date().toISOString(),
          endpoint: endpointSource,
          method: 'POST',
          headers: headersObj,
          rawBody,
          parsedAmount: tokenAmountPaid,
          detectedApp,
          tenantSlug: effectiveTenantSlug,
          matchedOrderId: tokenTxId,
          matchStrategy: 'studio_token_topup_idempotent_precheck',
          resultStatus: 200,
          resultBody: idempotentAckResponse,
        });

        return NextResponse.json(idempotentAckResponse, { status: 200 });
      }
    } catch (preCheckErr) {
      console.warn(`[Webhook Reader ${logId}] Studio token precheck exception (non-fatal, proceeding to service guard):`, preCheckErr);
    }

    // ── 2. VALIDASI NOMINAL & PAKET SERVER-SIDE (SSOT studio-pricing.ts) ──
    // ANTI-TAMPERING: Jangan membaca angka mentah rawBody.credits tanpa validasi ke SSOT server!
    const isShopMember = isTenantShopMember(resolvedTenant);

    // Resolusi package_id candidate dari:
    // a. metadata.package_id / package_id
    // b. parsedPackageCandidate dari regex external_id
    // c. parsedCreditsCandidate -> 5 = ketengan, 25 = starter, 50 = creator
    // d. nominal tokenAmountPaid matching official prices
    let resolvedPackageKey = String(
      rawBody.metadata?.package_id ||
      rawBody.package_id ||
      rawBody.packageId ||
      parsedPackageCandidate ||
      ''
    ).trim().toLowerCase();

    if (!resolvedPackageKey && parsedCreditsCandidate) {
      if (parsedCreditsCandidate === 5) resolvedPackageKey = 'ketengan';
      else if (parsedCreditsCandidate === 25) resolvedPackageKey = 'starter';
      else if (parsedCreditsCandidate === 50) resolvedPackageKey = 'creator';
    }

    if (!resolvedPackageKey && tokenAmountPaid > 0) {
      if (tokenAmountPaid === 15000 || tokenAmountPaid === 20000) resolvedPackageKey = 'ketengan';
      else if (tokenAmountPaid === 49000 || tokenAmountPaid === 75000) resolvedPackageKey = 'starter';
      else if (tokenAmountPaid === 89000 || tokenAmountPaid === 135000) resolvedPackageKey = 'creator';
    }

    // Ambil paket resmi dari SSOT studio-pricing.ts
    const validatedPkg = getStudioTokenPackage(resolvedPackageKey, isShopMember);

    if (!validatedPkg || !validatedPkg.isActive) {
      console.error(`[Webhook Reader ${logId}] Studio token validation failed: Paket '${resolvedPackageKey}' tidak valid atau tidak aktif menurut SSOT studio-pricing.ts.`);
      return NextResponse.json(
        {
          success: false,
          error: `Paket token Studio '${resolvedPackageKey}' tidak valid menurut SSOT server studio-pricing.ts. Pilihan resmi: ketengan, starter, creator.`,
        },
        { status: 400 }
      );
    }

    // KUNCI KRUSIAL: Jumlah kredit yang ditambahkan WAJIB bersumber dari validatedPkg.credits server SSOT!
    const officialCredits = validatedPkg.credits;
    const officialPrice = validatedPkg.price;

    // Verifikasi batas minimal nominal pembayaran (mencegah underpayment tampering)
    if (tokenAmountPaid > 0 && tokenAmountPaid < officialPrice) {
      console.warn(`[Webhook Reader ${logId}] Underpayment Warning: Nominal dibayar Rp ${tokenAmountPaid} kurang dari harga resmi paket ${validatedPkg.id} (Rp ${officialPrice})`);
    }

    const studioAffiliateCode =
      rawBody.affiliate_code ||
      rawBody.affiliateCode ||
      rawBody.metadata?.affiliate_code ||
      rawBody.metadata?.ref ||
      null;

    // ── 3. EKSEKUSI MUTASI KREDIT VIA STUDIO CREDIT SERVICE ──
    const topupResult = await StudioCreditService.topUpCredits({
      tenantIdOrSlug: effectiveTenantId || studioTenantSlug || 'studio',
      credits: officialCredits,
      amountPaid: tokenAmountPaid > 0 ? tokenAmountPaid : officialPrice,
      transactionId: rawExternalId || tokenTxId,
      invoiceId: rawInvoiceId || undefined,
      packageId: validatedPkg.id,
      paymentStatus: 'PAID',
      affiliateCode: studioAffiliateCode,
      paymentChannel: detectedApp || rawBody.payment_channel || rawBody.payment_method || 'XENDIT',
    });

    const isIdempotentDuplicate = Boolean(topupResult.isExisting);

    // ── 4. SINKRONISASI AUDIT REVENUE KE credit_transactions ──
    if (!isIdempotentDuplicate && topupResult.success) {
      try {
        const { recordCreditTransaction } = await import('@/lib/creditLedger');
        await recordCreditTransaction({
          tenantSlug: effectiveTenantSlug,
          type: 'TOPUP_CREDIT',
          amountIdr: tokenAmountPaid > 0 ? tokenAmountPaid : officialPrice,
          invoiceId: rawInvoiceId || tokenTxId,
          referenceNo: rawExternalId || tokenTxId,
          paymentChannel: detectedApp || rawBody.payment_channel || rawBody.payment_method || 'XENDIT',
          status: 'COMPLETED',
          notes: `Top-Up +${officialCredits} Token Render Studio - ${validatedPkg.name} (SSOT Validated)`,
          metadata: {
            package_id: validatedPkg.id,
            credits: officialCredits,
            external_id: rawExternalId,
            invoice_id: rawInvoiceId,
            order_id: tokenTxId,
          },
        });
      } catch (revErr) {
        console.warn(`[Webhook Reader ${logId}] Non-fatal: credit_transactions record error:`, revErr);
      }
    }

    const tokenResponse = {
      success: topupResult.success,
      message: topupResult.success
        ? (isIdempotentDuplicate
            ? `Studio token order #${tokenTxId} was already processed previously (idempotent duplicate).`
            : `Studio token top-up for order #${tokenTxId} successfully processed (+${officialCredits} credits).`)
        : `Studio token top-up error: ${topupResult.message}`,
      order_id: tokenTxId,
      tenant_slug: effectiveTenantSlug,
      package_id: validatedPkg.id,
      credits_added: isIdempotentDuplicate ? 0 : officialCredits,
      new_balance: topupResult.newBalance,
      already_processed: isIdempotentDuplicate,
      commission_recorded: topupResult.commissionRecorded,
      commission_amount: topupResult.commissionAmount,
      log_id: logId,
    };

    addWebhookLog({
      id: logId,
      timestamp: new Date().toISOString(),
      endpoint: endpointSource,
      method: 'POST',
      headers: headersObj,
      rawBody,
      parsedAmount: tokenAmountPaid > 0 ? tokenAmountPaid : officialPrice,
      detectedApp,
      tenantSlug: effectiveTenantSlug,
      matchedOrderId: tokenTxId,
      matchStrategy: isIdempotentDuplicate ? 'studio_token_topup_idempotent' : 'studio_token_topup',
      resultStatus: topupResult.success ? 200 : 400,
      resultBody: tokenResponse,
    });

    return NextResponse.json(tokenResponse, {
      status: topupResult.success ? 200 : 400,
    });
  } else if (isStudioTokenOrder) {
    console.log(`[Webhook Reader ${logId}] Studio token order #${potentialTokenOrderId} received with status '${rawStatus || 'PENDING'}'. Top-up skipped.`);
    const skippedRes = {
      success: true,
      message: `Studio token order #${potentialTokenOrderId} status is '${rawStatus || 'PENDING'}'. Top-up skipped.`,
      order_id: potentialTokenOrderId,
      status: rawStatus || 'PENDING',
      log_id: logId,
    };

    addWebhookLog({
      id: logId,
      timestamp: new Date().toISOString(),
      endpoint: endpointSource,
      method: 'POST',
      headers: headersObj,
      rawBody,
      parsedAmount,
      detectedApp,
      tenantSlug,
      matchedOrderId: potentialTokenOrderId,
      matchStrategy: 'studio_token_skipped_unpaid',
      resultStatus: 200,
      resultBody: skippedRes,
    });

    return NextResponse.json(skippedRes, { status: 200 });
  }

  let matchedOrder: any = null;
  let matchStrategy = 'none';

  // JALUR 1: Pencocokan berbasis Direct Order ID (Gateway / QRIS Direct)
  if (directOrderId && isDirectPaid) {
    let { data: orderById } = await supabase
      .from('orders')
      .select('*')
      .eq('id', directOrderId)
      .maybeSingle();

    if (!orderById) {
      try {
        const { data: orderByAlt } = await supabase
          .from('orders')
          .select('*')
          .or(`correlation_id.eq.${directOrderId},metadata->>xendit_id.eq.${directOrderId},metadata->>qr_id.eq.${directOrderId},metadata->>xendit_external_id.eq.${directOrderId}`)
          .maybeSingle();
        if (orderByAlt) {
          orderById = orderByAlt;
        }
      } catch (altErr) {
        console.debug('[Webhook Reader] Alt query error:', altErr);
      }
    }

    if (orderById) {
      matchedOrder = orderById;
      matchStrategy = 'direct_order_id';
    }
  }

  // JALUR 2: Pencocokan berbasis Nominal Notifikasi Reader (BoonTrack Reader APK)
  // Dilengkapi toleransi timing (3x retry jika frontend checkout terlambat insert)
  if (!matchedOrder && !directOrderId && parsedAmount && parsedAmount > 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = process.env.NODE_ENV === 'test' ? 10 : 1500;

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
      console.log(`[Webhook Reader ${logId}] Mencari order dengan nominal ${parsedAmount} (Tenant: ${tenantSlug || 'ALL'}, Percobaan ${attempt}/${MAX_RETRIES + 1})...`);

      // Ambil order yang statusnya belum lunas
      let ordersQuery = supabase
        .from('orders')
        .select('*')
        .or('status.eq.WAITING_PAYMENT,status.eq.PENDING_PAYMENT,status.eq.PENDING,status.eq.UNPAID')
        .order('created_at', { ascending: false })
        .limit(50);

      if (tenantSlug) {
        ordersQuery = ordersQuery.eq('tenant_slug', tenantSlug);
      }

      const { data: pendingOrders, error: fetchErr } = await ordersQuery;

      if (fetchErr) {
        console.error(`[Webhook Reader ${logId}] Error querying pending orders:`, fetchErr);
      }

      if (pendingOrders && pendingOrders.length > 0) {
        // 2.A: Cocokkan EXACT AMOUNT (gross_amount === parsedAmount)
        const exactMatch = pendingOrders.find((o) => Number(o.gross_amount) === parsedAmount);

        if (exactMatch) {
          matchedOrder = exactMatch;
          matchStrategy = 'exact_gross_amount';
        }
      }

      // 2.C: Fallback global HANYA JIKA TIDAK ADA tenantSlug spesifik (Fail-closed multi-tenant isolation)
      if (!matchedOrder && !tenantSlug) {
        console.log(`[Webhook Reader ${logId}] Global fallback: Mencari order pending gross_amount = ${parsedAmount}...`);
        const { data: globalOrders } = await supabase
          .from('orders')
          .select('*')
          .or('status.eq.WAITING_PAYMENT,status.eq.PENDING_PAYMENT,status.eq.PENDING,status.eq.UNPAID')
          .eq('gross_amount', parsedAmount)
          .order('created_at', { ascending: false })
          .limit(5);

        if (globalOrders && globalOrders.length > 0) {
          matchedOrder = globalOrders[0];
          matchStrategy = 'global_exact_gross_amount';
        }
      }

      if (matchedOrder) {
        if (attempt > 1) {
          console.log(`[Webhook Reader ${logId}] Match ditemukan pada retry ke-${attempt - 1} (${matchStrategy})`);
        }
        break;
      }

      if (attempt <= MAX_RETRIES) {
        console.log(`[Webhook Reader ${logId}] Belum ada order pending Rp ${parsedAmount}. Menunggu toleransi ${RETRY_DELAY_MS}ms...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  // Jika tidak ada order yang cocok
  if (!matchedOrder) {
    const notFoundRes = {
      success: false,
      message: parsedAmount
        ? `Tidak ditemukan pesanan dengan nominal Rp ${parsedAmount.toLocaleString('id-ID')} untuk tenant '${tenantSlug || 'any'}'.`
        : 'Tidak ada order_id valid atau nominal yang dapat diekstraksi dari notifikasi.',
      parsed_amount: parsedAmount,
      detected_app: detectedApp,
      tenant_slug: tenantSlug,
      log_id: logId,
    };

    addWebhookLog({
      id: logId,
      timestamp: new Date().toISOString(),
      endpoint: endpointSource,
      method: 'POST',
      headers: headersObj,
      rawBody,
      parsedAmount,
      detectedApp,
      tenantSlug,
      resultStatus: 404,
      resultBody: notFoundRes,
    });

    return NextResponse.json(notFoundRes, { status: 404 });
  }

  const orderId = matchedOrder.id || matchedOrder.order_id;
  const currentStatus = String(matchedOrder.status || matchedOrder.payment_status || '').toUpperCase();

  // IDEMPOTENCY: Guard pengecekan status sebelum memicu pengiriman email notifikasi berulang
  if (currentStatus === 'PAID' || currentStatus === 'SETTLED' || currentStatus === 'COMPLETED') {
    const isAlreadyNotified = Boolean(matchedOrder.notified_at || matchedOrder.metadata?.notified_at);
    const idempotentRes = {
      success: true,
      message: isAlreadyNotified
        ? 'Order already processed and notified.'
        : `Pesanan #${orderId} sudah berstatus LUNAS (PAID) sebelumnya. Idempotent skip.`,
      order_id: orderId,
      already_paid: true,
      paid_at: matchedOrder.paid_at || matchedOrder.updated_at,
      notified_at: matchedOrder.notified_at || matchedOrder.metadata?.notified_at || matchedOrder.paid_at,
      match_strategy: matchStrategy,
      log_id: logId,
    };

    addWebhookLog({
      id: logId,
      timestamp: new Date().toISOString(),
      endpoint: endpointSource,
      method: 'POST',
      headers: headersObj,
      rawBody,
      parsedAmount,
      detectedApp,
      tenantSlug,
      matchedOrderId: orderId,
      matchStrategy,
      resultStatus: 200,
      resultBody: idempotentRes,
    });

    return NextResponse.json(idempotentRes, { status: 200 });
  }

  const paidAt = new Date().toISOString();

  // VALIDASI KEAMANAN P0.1: Rekonsiliasi Tenant Identity
  if (tenantSlug) {
    const orderTenantSlug = String(matchedOrder.tenant_slug || '').trim().toLowerCase();
    const orderTenantId = String(matchedOrder.tenant_id || '').trim().toLowerCase();
    const cleanTenant = String(tenantSlug).trim().toLowerCase();

    if (orderTenantSlug && orderTenantSlug !== cleanTenant && orderTenantId !== cleanTenant) {
      const tenantMismatchRes = {
        success: false,
        error: 'TENANT_MISMATCH',
        message: `Identitas tenant webhook ('${tenantSlug}') tidak cocok dengan order #${orderId} ('${matchedOrder.tenant_slug}').`,
        order_id: orderId,
        log_id: logId,
      };
      addWebhookLog({
        id: logId,
        timestamp: new Date().toISOString(),
        endpoint: endpointSource,
        method: 'POST',
        headers: headersObj,
        rawBody,
        parsedAmount: explicitAmount > 0 ? explicitAmount : parsedAmount,
        detectedApp,
        tenantSlug,
        matchedOrderId: orderId,
        matchStrategy,
        resultStatus: 403,
        resultBody: tenantMismatchRes,
      });
      console.warn(`[Webhook Reader ${logId}] TENANT_MISMATCH: Order ${orderId} (${matchedOrder.tenant_slug}) != Webhook ${tenantSlug}`);
      return NextResponse.json(tenantMismatchRes, { status: 403 });
    }
  }

  // VALIDASI KEAMANAN P0.1: Rekonsiliasi Mata Uang (Wajib IDR)
  const orderCurrency = String(matchedOrder.currency || matchedOrder.metadata?.currency || 'IDR').toUpperCase();
  const webhookCurrency = String(rawBody.currency || rawBody.currency_code || 'IDR').toUpperCase();
  if (orderCurrency !== 'IDR' || webhookCurrency !== 'IDR') {
    const currencyMismatchRes = {
      success: false,
      error: 'CURRENCY_MISMATCH',
      message: `Mata uang transaksi tidak valid ('${webhookCurrency}'). Sistem hanya menerima mata uang IDR.`,
      order_id: orderId,
      log_id: logId,
    };
    addWebhookLog({
      id: logId,
      timestamp: new Date().toISOString(),
      endpoint: endpointSource,
      method: 'POST',
      headers: headersObj,
      rawBody,
      parsedAmount: explicitAmount > 0 ? explicitAmount : parsedAmount,
      detectedApp,
      tenantSlug,
      matchedOrderId: orderId,
      matchStrategy,
      resultStatus: 400,
      resultBody: currencyMismatchRes,
    });
    console.warn(`[Webhook Reader ${logId}] CURRENCY_MISMATCH: Order #${orderId} currency ${orderCurrency} vs webhook ${webhookCurrency}`);
    return NextResponse.json(currencyMismatchRes, { status: 400 });
  }

  // VALIDASI KEAMANAN P0: Transaksi HANYA boleh dimutasi ke status 'PAID' jika nominal numerik match 100% dengan total tagihan order.
  const orderGrossAmount = Number(matchedOrder.gross_amount ?? matchedOrder.total_amount ?? 0);
  const incomingAmount = explicitAmount > 0 ? explicitAmount : parsedAmount;
  if (incomingAmount && !validateOrderPaymentMatch(orderGrossAmount, incomingAmount)) {
    const mismatchRes = {
      success: false,
      error: 'AMOUNT_MISMATCH',
      message: `Nominal pembayaran Rp ${incomingAmount} tidak cocok 100% dengan total tagihan order #${orderId} (Rp ${orderGrossAmount}).`,
      order_id: orderId,
      gross_amount: orderGrossAmount,
      parsed_amount: incomingAmount,
      log_id: logId,
    };
    addWebhookLog({
      id: logId,
      timestamp: new Date().toISOString(),
      endpoint: endpointSource,
      method: 'POST',
      headers: headersObj,
      rawBody,
      parsedAmount: incomingAmount,
      detectedApp,
      tenantSlug,
      matchedOrderId: orderId,
      matchStrategy,
      resultStatus: 400,
      resultBody: mismatchRes,
    });
    console.warn(`[Webhook Reader ${logId}] AMOUNT_MISMATCH: Order ${orderId} Rp ${orderGrossAmount} != Incoming Rp ${incomingAmount}`);
    return NextResponse.json(mismatchRes, { status: 400 });
  }

  // TRIAL QUOTA GUARD — Webhook Processor (BATCH 1 / Ticket 1.2)
  // Check before confirming PAID: if trial tenant has hit order limit, reject the
  // confirmation and return 402. This prevents charging infrastructure costs beyond
  // the CFO-approved Rp 7.000 per trial tenant hard cap.
  // NOTE: Merchant dashboard login remains accessible (only transactional mutation blocked).
  const webhookTenantId = matchedOrder.tenant_id || null;
  if (webhookTenantId) {
    const quotaCheck = await checkTrialQuota(webhookTenantId, 'order');
    if (!quotaCheck.allowed) {
      const quotaExceededRes = {
        success: false,
        error: quotaCheck.errorCode,
        message: quotaCheck.message,
        order_id: orderId,
        current_usage: quotaCheck.currentUsage,
        limit: quotaCheck.limit,
        log_id: logId,
      };
      addWebhookLog({
        id: logId,
        timestamp: new Date().toISOString(),
        endpoint: endpointSource,
        method: 'POST',
        headers: headersObj,
        rawBody,
        parsedAmount,
        detectedApp,
        tenantSlug,
        matchedOrderId: orderId,
        matchStrategy,
        resultStatus: 402,
        resultBody: quotaExceededRes,
      });
      console.warn(`[Webhook Reader ${logId}] TRIAL_LIMIT_EXCEEDED: Order ${orderId} blocked for tenant ${webhookTenantId}`);
      return NextResponse.json(quotaExceededRes, { status: 402 });
    }
  }

  // DYNAMIC RESOLUTION OF ACCESS URL & INSTRUCTIONS FROM DATABASE
  let resolvedAccessUrl =
    matchedOrder.fulfillment_metadata?.access_url ||
    matchedOrder.metadata?.access_url ||
    matchedOrder.link_digital ||
    matchedOrder.download_url ||
    matchedOrder.payload_url ||
    matchedOrder.delivery_url ||
    '';

  let resolvedInstructions =
    matchedOrder.fulfillment_metadata?.instructions ||
    matchedOrder.metadata?.instructions ||
    '';

  // 1. Query tabel 'products' jika URL belum ditemukan
  if (!resolvedAccessUrl && matchedOrder.product_id && supabase) {
    try {
      const { data: dbProd } = await supabase
        .from('products')
        .select('link_digital, asset_reference, fulfillment_metadata')
        .eq('id', matchedOrder.product_id)
        .maybeSingle();
      if (dbProd) {
        resolvedAccessUrl =
          dbProd.fulfillment_metadata?.access_url ||
          dbProd.link_digital ||
          dbProd.asset_reference ||
          '';
        if (!resolvedInstructions) {
          resolvedInstructions = dbProd.fulfillment_metadata?.instructions || '';
        }
      }
    } catch (prodResolveErr) {
      console.warn(`[Webhook Reader ${logId}] Products table query error:`, prodResolveErr);
    }
  }

  // 2. Query snapshot 'order_items' jika masih kosong
  if (!resolvedAccessUrl && orderId && supabase) {
    try {
      const { data: items } = await supabase
        .from('order_items')
        .select('product_id, metadata')
        .eq('order_id', orderId)
        .limit(1);
      if (items && items[0]) {
        const itemMeta = items[0].metadata || {};
        resolvedAccessUrl =
          itemMeta.access_url ||
          itemMeta.download_url ||
          itemMeta.link_digital ||
          itemMeta.payload_url ||
          '';
        if (!resolvedAccessUrl && items[0].product_id) {
          const { data: itemProd } = await supabase
            .from('products')
            .select('link_digital, fulfillment_metadata')
            .eq('id', items[0].product_id)
            .maybeSingle();
          if (itemProd) {
            resolvedAccessUrl =
              itemProd.fulfillment_metadata?.access_url ||
              itemProd.link_digital ||
              '';
          }
        }
      }
    } catch (itemsResolveErr) {
      console.warn(`[Webhook Reader ${logId}] Order items query error:`, itemsResolveErr);
    }
  }

  // 3. Fallback scoped metadata products di tabel tenants
  const targetTenantSlug = matchedOrder.tenant_slug || matchedOrder.tenant_id || tenantSlug;
  if (!resolvedAccessUrl && (matchedOrder.tenant_id || targetTenantSlug) && supabase) {
    try {
      let tQ = supabase.from('tenants').select('metadata');
      if (matchedOrder.tenant_id) {
        tQ = tQ.eq('id', matchedOrder.tenant_id);
      } else {
        tQ = tQ.eq('slug', targetTenantSlug);
      }
      const { data: tRow } = await tQ.maybeSingle();
      const metaProds = Array.isArray(tRow?.metadata?.products) ? tRow.metadata.products : [];
      const targetPId = String(matchedOrder.product_id || '').trim();
      const targetTitle = String(matchedOrder.product_title || matchedOrder.product_name || '').trim().toLowerCase();
      const found = metaProds.find((p: any) =>
        (targetPId && (String(p.id) === targetPId || String(p.slug) === targetPId || String(p.sku) === targetPId)) ||
        (targetTitle && String(p.name || p.title || '').toLowerCase() === targetTitle)
      );
      if (found) {
        resolvedAccessUrl =
          found.fulfillment_metadata?.access_url ||
          found.download_url ||
          found.link_digital ||
          found.payload_url ||
          '';
        if (!resolvedInstructions) {
          resolvedInstructions = found.fulfillment_metadata?.instructions || '';
        }
      }
    } catch (metaResolveErr) {
      console.warn(`[Webhook Reader ${logId}] Tenant metadata query error:`, metaResolveErr);
    }
  }

  // 4. Dynamic Telegram Invite Link Generation untuk OnlineBoost Batch 1 (member_limit: 1, expire_date: +86400s)
  const isOnlineBoostBatch1 =
    targetTenantSlug === 'onlineboost' ||
    matchedOrder.tenant_id === 'e12acd29-6c18-487b-ade7-5422878c1c36' ||
    Boolean(matchedOrder.product_title?.toLowerCase().includes('inkubasi')) ||
    Boolean(matchedOrder.product_title?.toLowerCase().includes('batch 1'));

  if (isOnlineBoostBatch1) {
    try {
      const dynamicTgLink = await generateTelegramInviteLink({
        tenantSlug: targetTenantSlug || 'onlineboost',
        tenantId: matchedOrder.tenant_id,
        orderId: String(orderId),
        productTitle: matchedOrder.product_title,
        defaultFallbackUrl: resolvedAccessUrl || 'https://t.me/+WZ6alwTIjjExODc1',
        supabaseClient: supabase,
      });
      if (dynamicTgLink) {
        resolvedAccessUrl = dynamicTgLink;
        if (!resolvedInstructions) {
          resolvedInstructions =
            'Silakan klik link undangan Telegram di atas untuk masuk ke grup mentoring & inkubasi Batch 1 (Link berlaku 24 jam untuk 1 orang).';
        }
      }
    } catch (tgGenErr) {
      console.warn(`[Webhook Reader ${logId}] Error generating dynamic Telegram invite:`, tgGenErr);
      if (!resolvedAccessUrl) {
        resolvedAccessUrl = 'https://t.me/+WZ6alwTIjjExODc1';
      }
    }
  }

  // 4b. Scoped Fallback untuk tenant 'onlineboost' ke grup Telegram resmi
  if (!resolvedAccessUrl && targetTenantSlug === 'onlineboost') {
    resolvedAccessUrl = 'https://t.me/+WZ6alwTIjjExODc1';
    if (!resolvedInstructions) {
      resolvedInstructions = 'Silakan langsung bergabung ke grup Telegram resmi untuk akses materi dan mentoring.';
    }
  }

  // UPDATE STATUS ORDER KE 'PAID' & ATOMISASI FULFILLMENT (Single Source of Truth: orders)
  const updatedOrderMetadata = {
    ...(matchedOrder.metadata || {}),
    notified_at: paidAt,
    ...(isOnlineBoostBatch1 ? { customer_tag: 'customer_batch1_paid' } : {}),
  };

  const updatedFulfillmentMetadata = {
    ...(matchedOrder.fulfillment_metadata || {}),
    ...(resolvedAccessUrl ? { access_url: resolvedAccessUrl } : {}),
    ...(resolvedInstructions ? { instructions: resolvedInstructions } : {}),
  };

  await supabase
    .from('orders')
    .update({
      status: 'PAID',
      payment_status: 'PAID',
      order_status: 'COMPLETED',
      paid_at: paidAt,
      notified_at: paidAt,
      download_url: resolvedAccessUrl || matchedOrder.download_url || null,
      fulfillment_metadata: updatedFulfillmentMetadata,
      metadata: updatedOrderMetadata,
      updated_at: paidAt,
    })
    .eq('id', orderId);

  // 5. MUTASI TAGGING CRM: 'customer_batch1_paid' (serta hapus 'awaiting_payment')
  if (isOnlineBoostBatch1) {
    try {
      const rawPhone =
        matchedOrder.customer_phone ||
        matchedOrder.phone ||
        matchedOrder.whatsapp_number;
      const cleanPhone = normalizeWhatsAppNumber(rawPhone);
      const targetTenantId = matchedOrder.tenant_id || 'e12acd29-6c18-487b-ade7-5422878c1c36';

      if (cleanPhone) {
        const { ContactService } = await import('@/lib/crm/contact.service');
        const contact = await ContactService.getOrCreateContactByPhone(
          targetTenantId,
          cleanPhone,
          matchedOrder.customer_name || matchedOrder.buyer_name || cleanPhone
        );

        // Add tag 'customer_batch1_paid'
        const paidTag = await ContactService.createTag(targetTenantId, 'customer_batch1_paid', '#10B981');
        await ContactService.addTagToContact(contact.id, paidTag.id);

        // Remove tag 'awaiting_payment' if present
        try {
          const { data: awaitingTagRow } = await supabase
            .from('tags')
            .select('id')
            .eq('tenant_id', targetTenantId)
            .eq('name', 'awaiting_payment')
            .maybeSingle();
          if (awaitingTagRow?.id) {
            await ContactService.removeTagFromContact(contact.id, awaitingTagRow.id);
          }
        } catch {}

        // Update contact record & lifecycle stage
        const existingTags = Array.isArray(contact.metadata?.tags) ? contact.metadata.tags : [];
        const updatedTags = Array.from(new Set([
          ...existingTags.filter((t: string) => t !== 'awaiting_payment'),
          'customer_batch1_paid',
        ]));

        await supabase
          .from('contacts')
          .update({
            lifecycle_stage: 'CUSTOMER',
            last_order_at: paidAt,
            total_spent: Number((contact as any)?.total_spent || 0) + Number(matchedOrder.gross_amount || 249000),
            metadata: {
              ...(contact.metadata || {}),
              tags: updatedTags,
              customer_tag: 'customer_batch1_paid',
              funnel: 'onlineboost_batch1',
              funnel_stage: 'customer_batch1_paid',
              paid_at: paidAt,
              last_order_id: String(orderId),
            },
            updated_at: paidAt,
          })
          .eq('id', contact.id);

        // Link contact to order
        await supabase
          .from('orders')
          .update({ contact_id: contact.id })
          .eq('id', orderId);

        console.log(`[Webhook Reader ${logId}] Mutated customer tag to 'customer_batch1_paid' for contact ${contact.id}`);
      }
    } catch (tagErr) {
      console.warn(`[Webhook Reader ${logId}] Non-fatal customer tagging mutation error:`, tagErr);
    }
  }

  // PAYMENT EVENT RECORDING (fire-and-forget)
  // Delegate payload parsing to ReaderAdapter and record event to payment_events.
  // Non-blocking: errors here do not affect the main webhook response.
  try {
    const tenantForEvent = matchedOrder.tenant_id || matchedOrder.tenant_slug || tenantSlug || 'unknown';
    const enrichedPayload = { ...rawBody, _provider: 'reader' };
    const confirmationResult = await readerAdapter.parseWebhookPayload(enrichedPayload, {
      headers: headersObj,
      queryParams: Object.fromEntries(new URL(req.url).searchParams.entries()),
    });
    paymentEventService.recordEvent(
      { ...confirmationResult, rawPayload: enrichedPayload },
      tenantForEvent,
      String(orderId)
    ).catch((evtErr: unknown) => {
      console.warn(`[Webhook Reader ${logId}] Non-fatal: payment event record failed:`, evtErr);
    });
  } catch (adapterErr) {
    console.warn(`[Webhook Reader ${logId}] Non-fatal: ReaderAdapter parse failed:`, adapterErr);
  }

  console.log(`[Webhook Reader ${logId}] SUCCESS: Order #${orderId} diupdate menjadi PAID (Strategy: ${matchStrategy}).`);

  // SHOP SUBSCRIPTION / BUNDLE CROSS-BENEFIT (e.g. ACADEMY_CTWA_BATCH1_B Scale Bundle)
  const isScaleBundleOrMemberProduct =
    matchedOrder.sku === 'ACADEMY_CTWA_BATCH1_B' ||
    matchedOrder.metadata?.sku === 'ACADEMY_CTWA_BATCH1_B' ||
    matchedOrder.product_id === 'b2c00572-c74a-4b01-8902-000000000002' ||
    Boolean(matchedOrder.product_title?.toLowerCase().includes('scale bundle')) ||
    Boolean(matchedOrder.description?.toLowerCase().includes('status member toko')) ||
    Boolean(matchedOrder.metadata?.grant_shop_bonus) ||
    Boolean(matchedOrder.metadata?.is_membership);

  if (isScaleBundleOrMemberProduct) {
    try {
      const { StudioCreditService } = await import('@/lib/services/studio-credit.service');
      await StudioCreditService.grantShopActivationBonus({
        tenantIdOrSlug: targetTenantSlug || matchedOrder.tenant_id || 'onlineboost',
        invoiceId: String(orderId),
      });
      console.log(`[Webhook Reader ${logId}] Granted +15 Studio Credits & member tier for bundle order #${orderId}`);
    } catch (bonusErr) {
      console.warn(`[Webhook Reader ${logId}] Non-fatal: Studio activation bonus error:`, bonusErr);
    }
  }

  // KIRIM WHATSAPP AUTO-FULFILLMENT
  const customerPhone =
    matchedOrder.customer_phone ||
    matchedOrder.phone ||
    matchedOrder.whatsapp_number;

  const customerName =
    matchedOrder.customer_name ||
    matchedOrder.buyer_name ||
    'Pelanggan Setia';

  const itemsSummary =
    matchedOrder.product_title ||
    matchedOrder.product_name ||
    'Pesanan Produk';

  const totalAmount = Number(
    matchedOrder.total_amount ||
    matchedOrder.gross_amount ||
    parsedAmount ||
    matchedOrder.amount ||
    0
  );

  const resolvedProductType =
    matchedOrder.product_type ||
    (matchedOrder.shipping_address ? 'PHYSICAL' : 'DIGITAL');

  const hardeningPolicy = resolveHardeningPolicy(matchedOrder?.tenant || { slug: targetTenantSlug, metadata: matchedOrder?.metadata });

  if (customerPhone) {
    console.log(`[Webhook Reader ${logId}] Mengirim WhatsApp auto-fulfillment (${resolvedProductType}) ke ${customerPhone} (Outbox Queue)`, {
      hardening_policy_version: hardeningPolicy,
      order_id: String(orderId),
      tenant_slug: targetTenantSlug,
      access_url: resolvedAccessUrl,
    });
    // Async worker / outbox dispatch ensures PENDING -> PAID DB status mutation and HTTP 200 response are never blocked
    try {
      await sendOrderFulfillmentNotification({
        phone: customerPhone,
        customerName,
        orderId: String(orderId),
        itemsSummary,
        totalAmount,
        productType: resolvedProductType,
        accessUrl: resolvedAccessUrl,
        instructions: resolvedInstructions,
        tenantId: targetTenantSlug || 'platform',
      });
    } catch (waErr) {
      console.warn(`[Webhook Reader ${logId}] Error dispatching WhatsApp fulfillment (non-fatal):`, waErr);
    }
  }

  // DUAL EMAIL FULFILLMENT DISPATCH (Buyer Invoice + Merchant Alert)
  sendOrderFulfillmentEmails({
    orderId: String(orderId),
    tenantSlug: String(targetTenantSlug || ''),
    tenantId: matchedOrder.tenant_id,
    customerName,
    customerEmail: matchedOrder.customer_email || null,
    customerPhone: customerPhone || null,
    productTitle: itemsSummary,
    grossAmount: totalAmount,
    paymentMethod: matchedOrder.payment_method || 'QRIS Dinamis (Otomatis)',
    paidAt,
    accessUrl: resolvedAccessUrl || undefined,
    instructions: resolvedInstructions || undefined,
    productType: resolvedProductType,
  }).catch((emailErr) => {
    console.warn(`[Webhook Reader ${logId}] Non-fatal email fulfillment dispatch error:`, emailErr);
  });

  // META CAPI TRANSACTIONAL OUTBOX & DIRECT DISPATCH (EMQ Score 8.0+ & Deduplication Authority)
  if (orderId) {
    const hashSha256 = (val?: string | null) => {
      if (!val) return undefined;
      const clean = String(val).trim().toLowerCase();
      return crypto.createHash('sha256').update(clean).digest('hex');
    };

    try {
      await enqueueCAPIOutboxEvent({
        orderId: String(orderId),
        tenantId: matchedOrder.tenant_id || targetTenantSlug || 'onlineboost',
        tenantSlug: targetTenantSlug,
        eventName: 'Purchase',
        grossAmount: totalAmount,
        currency: 'IDR',
        customPayload: {
          value: totalAmount,
          currency: 'IDR',
          customer_name: customerName,
          customer_phone_hash: hashSha256(customerPhone),
          customer_email_hash: hashSha256(matchedOrder.customer_email),
          product_title: itemsSummary,
          deduplication_key: `PURCHASE_${orderId}`,
        },
      }, supabase);
    } catch (outboxErr) {
      console.warn(`[Webhook Reader ${logId}] Non-fatal: CAPI outbox enqueue error:`, outboxErr);
    }

    dispatchMetaCAPIPurchaseForOrder(String(orderId), supabase)
      .then((capiRes) => {
        if (capiRes.success) {
          console.log(`[Webhook Reader ${logId}] Meta CAPI Purchase successfully dispatched for order #${orderId}`);
        } else if (capiRes.skipped) {
          console.log(`[Webhook Reader ${logId}] Meta CAPI Purchase skipped: ${capiRes.reason}`);
        }
      })
      .catch((capiErr) => {
        console.warn(`[Webhook Reader ${logId}] Error dispatching Meta CAPI Purchase:`, capiErr?.message || capiErr);
      });
  }

  // DISPATCH AFFILIATE & AM COMMISSION NOTIFICATION
  const resolvedAffiliateCode =
    matchedOrder.affiliate_code ||
    matchedOrder.metadata?.affiliate_code ||
    matchedOrder.metadata?.ref ||
    matchedOrder.ref ||
    null;

  try {
    await sendOrderCommissionAlert({
      orderId: String(orderId),
      tenantSlug: targetTenantSlug,
      tenantId: matchedOrder.tenant_id,
      productTitle: itemsSummary,
      grossAmount: totalAmount,
      customerName,
      customerPhone: customerPhone || undefined,
      customerEmail: matchedOrder.customer_email || undefined,
      affiliateCode: resolvedAffiliateCode,
      directCommission: Number(matchedOrder.affiliate_commission || matchedOrder.metadata?.affiliate_commission) || undefined,
    });
  } catch (notifErr) {
    console.warn(`[Webhook Reader ${logId}] Non-fatal: affiliate commission alert error:`, notifErr);
  }

  // RECORD RESELLER COMMISSION LEDGER (DIRECTIVE RE-01 / SPRINT P0)
  try {
    const { recordResellerCommissionLedger } = await import('@/lib/attribution/reseller-attribution-service');
    await recordResellerCommissionLedger({
      orderId: String(orderId),
      tenantId: matchedOrder.tenant_id,
      supabaseClient: supabase,
    });
  } catch (resellerLedgerErr) {
    console.warn(`[Webhook Reader ${logId}] Non-fatal: reseller commission ledger error:`, resellerLedgerErr);
  }

  const successRes = {
    success: true,
    message: `Pesanan #${orderId} berhasil diverifikasi LUNAS (PAID) via BoonTrack Reader (nominal Rp ${totalAmount.toLocaleString('id-ID')}).`,
    order_id: orderId,
    gross_amount: totalAmount,
    already_paid: false,
    match_strategy: matchStrategy,
    detected_app: detectedApp,
    tenant_slug: targetTenantSlug,
    paid_at: paidAt,
    log_id: logId,
  };

  addWebhookLog({
    id: logId,
    timestamp: new Date().toISOString(),
    endpoint: endpointSource,
    method: 'POST',
    headers: headersObj,
    rawBody,
    parsedAmount,
    detectedApp,
    tenantSlug: targetTenantSlug,
    matchedOrderId: orderId,
    matchStrategy,
    resultStatus: 200,
    resultBody: successRes,
  });

  return NextResponse.json(successRes, { status: 200 });
}
