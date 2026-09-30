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
