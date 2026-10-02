/**
 * @file types/order.ts
 * @description Domain types for Order entity with Soft-Archive support.
 * Strict No-Hard-Delete Architecture.
 */

export interface Order {
  id: string;
  order_id?: string;
  correlation_id?: string;
  tenant_id?: string;
  tenant_slug?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  product_id?: string;
  product_title?: string;
  product_name?: string;
  product_type?: string;
  items_summary?: string;
  gross_amount: number;
  total_amount?: number;
  base_price?: number;
  shipping_cost?: number;
  unique_code?: number;
  status: string;
  payment_status: string;
  order_status?: string;
  payment_method?: string;
  paid_at?: string | null;
  payment_proof_url?: string | null;
  fulfillment_url?: string | null;
  download_url?: string | null;
  link_digital?: string | null;
  access_url?: string | null;
  google_meet_url?: string | null;
  fulfillment_metadata?: any;
  fulfillment_type?: 'PICKUP' | 'DELIVERY' | string;
  pickup_info?: any;
  metadata?: Record<string, any>;
  is_archived: boolean; // Soft-Archive status (default false)
  created_at: string;
  updated_at?: string;
}
