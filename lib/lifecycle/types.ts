/**
 * @file lib/lifecycle/types.ts
 * @description Type definitions for the Customer Lifecycle Engine (Modular Primitives).
 * Follows the 4 Primitives Contract: Event -> Scheduler -> Message Template -> Outcome.
 */

export type LifecycleTriggerType =
  | 'PAYMENT_CONFIRMED'
  | 'CONSULTATION_BOOKED'
  | 'POST_CONSULTATION'
  | 'ORDER_CREATED'
  | (string & {});

export type LifecycleEventStatus =
  | 'PENDING'
  | 'SCHEDULED'
  | 'PROCESSED'
  | 'FAILED'
  | 'CANCELLED';

export interface LifecycleTemplate {
  id: string;
  tenant_id: string;
  vertical: string;
  event_trigger: LifecycleTriggerType;
  template_body: string;
  delay_minutes: number;
  is_active: boolean;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface LifecycleEventPayload {
  customer_name?: string;
  customer_phone?: string;
  order_id?: string;
  order_number?: string;
  product_title?: string;
  product_id?: string;
  amount?: number;
  doctor_name?: string;
  consultation_time?: string;
  consultation_channel?: string;
  kidmap_url?: string;
  session_link?: string;
  upsell_url?: string;
  promo_code?: string;
  [key: string]: any;
}

export interface LifecycleEvent {
  id: string;
  tenant_id: string;
  customer_phone: string;
  event_type: LifecycleTriggerType;
  payload: LifecycleEventPayload;
  status: LifecycleEventStatus;
  scheduled_at: string;
  processed_at?: string | null;
  error_message?: string | null;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface IngestLifecycleEventInput {
  tenant_id: string;
  tenant_slug?: string;
  event_type: LifecycleTriggerType;
  customer_phone: string;
  payload: LifecycleEventPayload;
  custom_scheduled_at?: Date | string;
}

export interface LifecycleOutcome {
  success: boolean;
  event_id?: string;
  dispatched_text?: string;
  channel?: 'WHATSAPP' | 'INBOX_MESSAGE' | 'INTERNAL_AUDIT';
  recipient_phone?: string;
  error?: string;
}
