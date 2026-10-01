/**
 * @file lib/email/types.ts
 * @description Type definitions for the Omni-Channel Email Notification Suite & Order Event Bus.
 * 100% Tenant-Agnostic, Zero Hardcoding.
 */

export interface TenantBranding {
  store_name: string;
  logo_url?: string | null;
  support_email?: string | null;
  support_phone?: string | null;
  website_url?: string | null;
  theme_color?: string | null;
}

export interface EmailOrderItem {
  id?: string;
  name: string;
  title?: string;
  quantity?: number;
  price?: number;
  total?: number;
}

export interface BankAccountInfo {
  bank_name: string;
  account_number: string;
  account_holder: string;
}

/**
 * Event 1: ORDER_CREATED Payload
 * Sent to Buyer when an order with status PENDING is initialized.
 */
export interface OrderCreatedEmailPayload {
  order_id: string;
  tenant_slug: string;
  tenant_id?: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  items: EmailOrderItem[];
  subtotal?: number;
  unique_code?: number; // 3-digit suffix (e.g. 100-999)
  total_amount: number;
  payment_method: string;
  bank_accounts?: BankAccountInfo[];
  qris_url?: string | null;
  expires_at?: string | null; // ISO 8601 or formatted date
  action_url?: string | null; // Invoice / tracking page URL
}

/**
 * Event 2: PAYMENT_CONFIRMED / PAID Payload
 * Sent to Buyer (Official Receipt + Digital Access/Calendar) and Seller (Revenue Alert).
 * Triggered ONLY after FSM verifies and confirms PAID status.
 */
export interface PaymentConfirmedEmailPayload {
  order_id: string;
  tenant_slug: string;
  tenant_id?: string | null;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  customerPhone?: string | null;
  items: EmailOrderItem[];
  total_amount: number;
  payment_method: string;
  paid_at: string;
  access_url?: string | null; // Instant digital download link or community URL
  instructions?: string | null;
  booking_url?: string | null; // Google Calendar / Cal.com link
  dashboard_url?: string;
  forceBuyerEmail?: string | null;
}

/**
 * Event 3: FLAGGED_MANUAL / SOFT_MATCH Payload
 * Sent to Seller when transfer evidence needs manual review or soft-match confirmation
 * (e.g. order > Rp 50.000 awaiting bank mutation or visual similarity check).
 */
export interface FlaggedManualEmailPayload {
  order_id: string;
  tenant_slug: string;
  tenant_id?: string | null;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  items: EmailOrderItem[];
  total_amount: number;
  detected_amount?: number | null;
  status: 'SOFT_MATCH_AWAITING_MUTATION' | 'ORDER_PENDING_VERIFICATION' | 'FLAGGED_MANUAL' | string;
  reason: string;
  reference_no?: string | null; // Bank RRN / Transaction Ref
  evidence_url?: string | null;
  approval_url?: string; // 1-click dashboard approval link
  created_at?: string;
}

/**
 * Dispatch Result Contract
 */
export interface EmailDispatchResult {
  success: boolean;
  provider: 'resend' | 'postmark' | 'mock';
  messageId?: string;
  error?: string;
  recipient: string;
  subject: string;
}

export interface OrderEventBusResult {
  event: 'ORDER_CREATED' | 'PAYMENT_CONFIRMED' | 'FLAGGED_MANUAL';
  order_id: string;
  buyer_dispatch?: EmailDispatchResult | null;
  seller_dispatch?: EmailDispatchResult | null;
  timestamp: string;
}

/**
 * Feature Highlight for Broadcast & Release Announcement Suite
 */
export interface BroadcastFeatureHighlight {
  icon?: string; // Emoji, SVG, or icon keyword (e.g. '⚡', '📍', '💳', '📦', '🤖', '🚀')
  title: string;
  description: string;
  badge?: string; // Optional tag, e.g. 'Baru', 'P0', 'Enterprise', 'Hemat 40%'
}

/**
 * Payload for Enterprise Modern Broadcast Email Template (BoonTrack Brand Suite)
 */
export interface BroadcastEmailPayload {
  recipientName?: string;
  recipientEmail?: string;
  tenantSlug?: string;
  storeName?: string;
  versionBadge?: string; // e.g. 'v3.2.0 • Major Update'
  platformStatus?: 'STABLE' | 'MAJOR_RELEASE' | 'FEATURE_UPDATE' | 'MAINTENANCE' | string;
  eyebrow?: string; // e.g. 'PEMBERITAHUAN RESMI EKOSISTEM'
  headline: string; // e.g. 'WhatsApp Native Pinpoint & Instant Courier Sudah Aktif'
  subheadline?: string;
  summaryText?: string;
  features?: BroadcastFeatureHighlight[];
  primaryCtaText?: string;
  primaryCtaUrl?: string;
  secondaryCtaText?: string;
  secondaryCtaUrl?: string;
  unsubscribeUrl?: string;
  preferencesUrl?: string;
  helpDocsUrl?: string;
  termsUrl?: string;
  companyAddress?: string;
  customMessageHtml?: string;
}

/**
 * Resend Batch Email Item Contract
 */
export interface BroadcastBatchItem {
  to: string;
  name?: string;
  subject: string;
  html?: string;
  text?: string;
  payload?: BroadcastEmailPayload;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
}

export interface BroadcastBatchOptions {
  from?: string;
  replyTo?: string;
  chunkSize?: number; // default 100 (Resend Batch API limit)
  delayBetweenChunksMs?: number; // default 300ms to respect rate limit
  recordAuditLog?: boolean; // default true
  auditSource?: string; // e.g. 'ADMIN_BROADCAST', 'RELEASE_ANNOUNCEMENT'
  dryRun?: boolean; // simulation mode without calling external provider
}

export interface BroadcastBatchChunkResult {
  chunkIndex: number;
  totalInChunk: number;
  successCount: number;
  failedCount: number;
  messageIds?: string[];
  error?: string;
}

export interface BroadcastBatchResult {
  success: boolean;
  totalEmails: number;
  totalSent: number;
  totalFailed: number;
  batchCount: number;
  chunks: BroadcastBatchChunkResult[];
  errors: string[];
  executionTimeMs: number;
}

