/**
 * @file lib/email/mailer.ts
 * @description Centralized Universal Email Service & Transporter for BoonTrack.
 * 100% Dynamic, Tenant-Agnostic, Zero-Hardcoding.
 * Supports Resend API (default) and Postmark (optional) with automatic sender fallbacks.
 */

import { getResendApiKey } from '@/lib/boonpilot-email';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { extractTenantBankAccounts } from '@/lib/bank-accounts';
import {
  TenantBranding,
  OrderCreatedEmailPayload,
  PaymentConfirmedEmailPayload,
  FlaggedManualEmailPayload,
  EmailDispatchResult,
} from './types';
import {
  buildOrderCreatedBuyerHtml,
  buildOrderCreatedBuyerText,
} from './templates/order-created-buyer';
import {
  buildPaymentConfirmedBuyerHtml,
  buildPaymentConfirmedBuyerText,
} from './templates/payment-confirmed-buyer';
import {
  buildPaymentConfirmedSellerHtml,
  buildPaymentConfirmedSellerText,
} from './templates/payment-confirmed-seller';
import {
  buildFlaggedManualSellerHtml,
  buildFlaggedManualSellerText,
} from './templates/flagged-manual-seller';

export interface DispatchEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

/**
 * Dynamically resolves tenant branding from Supabase `tenants` table.
 * Zero hardcoded names or slugs. Returns dynamic fallback if record not found.
 */
export async function resolveTenantBranding(
  tenantSlugOrId: string,
  providedSupabase?: any
): Promise<{ branding: TenantBranding; tenantRow: any | null }> {
  const defaultBranding: TenantBranding = {
    store_name: tenantSlugOrId || 'Toko Online',
    logo_url: null,
    support_email: null,
    support_phone: null,
    website_url: `https://shop.boontrack.com/${tenantSlugOrId}`,
    theme_color: '#0f172a',
  };

  if (!tenantSlugOrId) {
    return { branding: defaultBranding, tenantRow: null };
  }

  try {
    const supabase = providedSupabase || getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return { branding: defaultBranding, tenantRow: null };
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantSlugOrId);

    let query = supabase.from('tenants').select('*');
    if (isUuid) {
      query = query.or(`id.eq.${tenantSlugOrId},slug.eq.${tenantSlugOrId}`);
    } else {
      query = query.eq('slug', tenantSlugOrId);
    }

    const { data: tenantRow } = await query.maybeSingle();

    if (!tenantRow) {
      return { branding: defaultBranding, tenantRow: null };
    }

    const meta = tenantRow.metadata || {};
    const profile = meta.business_profile || {};

    const resolvedBranding: TenantBranding = {
      store_name:
        profile.store_name ||
        meta.store_name ||
        tenantRow.name ||
        tenantRow.slug ||
        tenantSlugOrId,
      logo_url:
        profile.logo_url ||
        meta.logo_url ||
        tenantRow.logo_url ||
        meta.avatar_url ||
        null,
      support_email:
        profile.email ||
        meta.email ||
        meta.owner_email ||
        tenantRow.email ||
        null,
      support_phone:
        profile.phone ||
        meta.phone ||
        tenantRow.phone ||
        null,
      website_url:
        profile.website ||
        meta.website ||
        `https://shop.boontrack.com/${tenantRow.slug || tenantSlugOrId}`,
      theme_color: profile.theme_color || meta.theme_color || '#0f172a',
    };

    return { branding: resolvedBranding, tenantRow };
  } catch (err) {
    console.warn('[Mailer] Note resolving tenant branding:', err);
    return { branding: defaultBranding, tenantRow: null };
  }
}

/**
 * Universal Mail Dispatcher (Resend API default, Postmark optional fallback)
 */
export async function sendMail(options: DispatchEmailOptions): Promise<EmailDispatchResult> {
  const { to, subject, html, text } = options;

  if (!to || !to.includes('@')) {
    console.warn('[Mailer] Skipping invalid email recipient:', to);
    return {
      success: false,
      provider: 'mock',
      recipient: to || 'none',
      subject,
      error: 'Invalid recipient email address',
    };
  }

  // Guard for Jest / Test environments with dummy example.com domains
  if (
    process.env.NODE_ENV === 'test' &&
    !process.env.TEST_ALLOW_LIVE_EMAIL &&
    (to.includes('@example.com') || to.includes('@sample.com'))
  ) {
    return {
      success: true,
      provider: 'mock',
      messageId: `mock_${Date.now()}`,
      recipient: to,
      subject,
    };
  }

  // 1. Check for Postmark Server Token
  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN || process.env.POSTMARK_API_KEY;
  if (postmarkToken && postmarkToken.trim()) {
    try {
      const fromSender =
        options.from ||
        process.env.POSTMARK_FROM ||
        process.env.EMAIL_FROM ||
        'orders@boontrack.com';

      const postmarkRes = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': postmarkToken.trim(),
        },
        body: JSON.stringify({
          From: fromSender,
          To: to,
          Subject: subject,
          HtmlBody: html,
          TextBody: text,
          MessageStream: 'outbound',
        }),
      });

      const data = await postmarkRes.json().catch(() => ({}));
      if (postmarkRes.ok && (data.MessageID || data.MessageId || data.ErrorCode === 0)) {
        console.log(`[Mailer] [Postmark] Dispatched to ${to} (ID: ${data.MessageID || data.MessageId})`);
        return {
          success: true,
          provider: 'postmark',
          messageId: data.MessageID || data.MessageId,
          recipient: to,
          subject,
        };
      }
      console.warn(`[Mailer] Postmark error: ${data.Message || postmarkRes.status}. Fallback to Resend...`);
    } catch (postmarkErr) {
      console.warn('[Mailer] Postmark network warning:', postmarkErr);
    }
  }

  // 2. Primary / Default Transport: Resend API
  const apiKey = getResendApiKey();
  if (!apiKey) {
    console.warn('[Mailer] RESEND_API_KEY not configured.');
    return {
      success: false,
      provider: 'resend',
      recipient: to,
      subject,
      error: 'RESEND_API_KEY is not configured.',
    };
  }

  const senders = [
    options.from,
    process.env.RESEND_FROM || 'BoonTrack Official <orders@boontrack.com>',
    'BoonTrack Orders <billing@boontrack.com>',
    'BoonTrack <pilot@boontrack.com>',
    'BoonTrack Onboarding <onboarding@boontrack.com>',
    'onboarding@resend.dev',
  ].filter(Boolean) as string[];

  let lastError = '';

  for (const sender of senders) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'BoonTrack-Email-Worker/1.0',
        },
        body: JSON.stringify({
          from: sender,
          to: [to],
          subject,
          html,
          ...(text ? { text } : {}),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.id) {
        console.log(`[Mailer] [Resend] Dispatched to ${to} via '${sender}' (ID: ${data.id})`);
        return {
          success: true,
          provider: 'resend',
          messageId: data.id,
          recipient: to,
          subject,
        };
      }

      lastError = data?.message || data?.error || `HTTP ${res.status}`;
      console.warn(`[Mailer] Sender '${sender}' failed: ${lastError}. Trying next sender...`);
    } catch (networkErr: unknown) {
      lastError = networkErr instanceof Error ? networkErr.message : String(networkErr);
      console.warn(`[Mailer] Network issue for sender '${sender}': ${lastError}`);
    }
  }

  return {
    success: false,
    provider: 'resend',
    recipient: to,
    subject,
    error: lastError || 'All email senders exhausted.',
  };
}

/**
 * EVENT 1: ORDER_CREATED (to Buyer)
 * Sends invoice & exact transfer details with unique suffix and bank accounts.
 */
export async function sendOrderCreatedEmail(
  payload: OrderCreatedEmailPayload
): Promise<EmailDispatchResult> {
  const { branding, tenantRow } = await resolveTenantBranding(payload.tenant_slug);

  // If payload does not include bank accounts, dynamically extract from tenant
  let effectiveBankAccounts = payload.bank_accounts;
  if ((!effectiveBankAccounts || effectiveBankAccounts.length === 0) && tenantRow) {
    effectiveBankAccounts = extractTenantBankAccounts(tenantRow);
  }

  const enrichedPayload: OrderCreatedEmailPayload = {
    ...payload,
    bank_accounts: effectiveBankAccounts,
  };

  const html = buildOrderCreatedBuyerHtml(enrichedPayload, branding);
  const text = buildOrderCreatedBuyerText(enrichedPayload, branding);
  const subject = `[Tagihan] Pesanan #${payload.order_id} di ${branding.store_name} - Menunggu Pembayaran`;

  return sendMail({
    to: payload.customer_email,
    subject,
    html,
    text,
  });
}

/**
 * EVENT 2: PAYMENT_CONFIRMED / PAID (to Buyer & Seller)
 * Triggered ONLY after FSM verifies and settles the payment.
 */
export async function sendPaymentConfirmedEmails(
  payload: PaymentConfirmedEmailPayload
): Promise<{
  buyer_dispatch?: EmailDispatchResult | null;
  seller_dispatch?: EmailDispatchResult | null;
}> {
  const { branding, tenantRow } = await resolveTenantBranding(payload.tenant_slug);

  // Dynamic access link resolution from tenant products if not already supplied
  let effectiveAccessUrl = payload.access_url;
  let effectiveInstructions = payload.instructions;

  if (!effectiveAccessUrl && tenantRow && Array.isArray(tenantRow.metadata?.products)) {
    const mainItem = payload.items[0];
    const matched = tenantRow.metadata.products.find(
      (p: any) =>
        p.id === mainItem?.id ||
        (mainItem?.name && p.title && p.title.toLowerCase() === mainItem.name.toLowerCase())
    );
    if (matched) {
      effectiveAccessUrl =
        matched.link_digital ||
        matched.fulfillment_metadata?.access_url ||
        matched.download_url ||
        matched.asset_reference ||
        null;
      effectiveInstructions =
        matched.fulfillment_metadata?.instructions || effectiveInstructions;
    }
  }

  const enrichedPayload: PaymentConfirmedEmailPayload = {
    ...payload,
    access_url: effectiveAccessUrl,
    instructions: effectiveInstructions,
  };

  let buyerDispatch: EmailDispatchResult | null = null;
  let sellerDispatch: EmailDispatchResult | null = null;

  // 1. Dispatch to Buyer (if email available)
  const buyerEmail = payload.forceBuyerEmail || payload.customer_email;
  if (buyerEmail && buyerEmail.includes('@')) {
    const buyerHtml = buildPaymentConfirmedBuyerHtml(enrichedPayload, branding);
    const buyerText = buildPaymentConfirmedBuyerText(enrichedPayload, branding);
    const mainTitle = payload.items[0]?.name || payload.items[0]?.title || 'Pesanan';
    const buyerSubject = `[LUNAS] Bukti Pembayaran Resmi #${payload.order_id} - ${mainTitle}`;

    buyerDispatch = await sendMail({
      to: buyerEmail,
      subject: buyerSubject,
      html: buyerHtml,
      text: buyerText,
    });
  }

  // 2. Dispatch to Seller
  const sellerEmail = branding.support_email;
  if (sellerEmail && sellerEmail.includes('@')) {
    const sellerHtml = buildPaymentConfirmedSellerHtml(enrichedPayload, branding);
    const sellerText = buildPaymentConfirmedSellerText(enrichedPayload, branding);
    const sellerSubject = `[Pesanan Lunas] #${payload.order_id} - ${payload.customer_name} (Rp ${payload.total_amount.toLocaleString('id-ID')})`;

    sellerDispatch = await sendMail({
      to: sellerEmail,
      subject: sellerSubject,
      html: sellerHtml,
      text: sellerText,
    });
  }

  return { buyer_dispatch: buyerDispatch, seller_dispatch: sellerDispatch };
}

/**
 * EVENT 3: FLAGGED_MANUAL / SOFT_MATCH (to Seller)
 * Alerts merchant to check dashboard for 1-click verification of flagged transfer proof.
 */
export async function sendFlaggedManualEmail(
  payload: FlaggedManualEmailPayload
): Promise<EmailDispatchResult> {
  const { branding } = await resolveTenantBranding(payload.tenant_slug);
  const sellerEmail = branding.support_email;

  if (!sellerEmail || !sellerEmail.includes('@')) {
    console.warn(`[Mailer] Skipping seller manual review alert: no seller email found for ${payload.tenant_slug}`);
    return {
      success: false,
      provider: 'mock',
      recipient: 'none',
      subject: '',
      error: `No merchant email configured for tenant ${payload.tenant_slug}`,
    };
  }

  const html = buildFlaggedManualSellerHtml(payload, branding);
  const text = buildFlaggedManualSellerText(payload, branding);
  const subject = `[Perlu Verifikasi] Bukti Transfer #${payload.order_id} - ${payload.customer_name} (Rp ${payload.total_amount.toLocaleString('id-ID')})`;

  return sendMail({
    to: sellerEmail,
    subject,
    html,
    text,
  });
}
