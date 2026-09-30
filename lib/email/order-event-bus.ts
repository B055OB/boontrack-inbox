/**
 * @file lib/email/order-event-bus.ts
 * @description Asynchronous, Non-Blocking Order Event Bus for Omni-Channel Email Notifications.
 * Dispatches:
 * 1. ORDER_CREATED (to Buyer)
 * 2. PAYMENT_CONFIRMED (to Buyer & Seller)
 * 3. FLAGGED_MANUAL (to Seller)
 *
 * Guarantees zero blocking of critical API request-response lifecycles and maintains audit trails.
 */

import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import {
  OrderCreatedEmailPayload,
  PaymentConfirmedEmailPayload,
  FlaggedManualEmailPayload,
  OrderEventBusResult,
} from './types';
import {
  sendOrderCreatedEmail,
  sendPaymentConfirmedEmails,
  sendFlaggedManualEmail,
} from './mailer';

class OrderEventBus {
  /**
   * Dispatches ORDER_CREATED notification to buyer in the background without blocking caller.
   */
  public publishOrderCreated(
    payload: OrderCreatedEmailPayload
  ): Promise<OrderEventBusResult | null> {
    const task = async (): Promise<OrderEventBusResult> => {
      console.log(`[OrderEventBus] Event: ORDER_CREATED for #${payload.order_id} (Tenant: ${payload.tenant_slug})`);
      const result: OrderEventBusResult = {
        event: 'ORDER_CREATED',
        order_id: payload.order_id,
        timestamp: new Date().toISOString(),
      };

      try {
        if (payload.customer_email && payload.customer_email.includes('@')) {
          const dispatch = await sendOrderCreatedEmail(payload);
          result.buyer_dispatch = dispatch;

          if (dispatch.success) {
            await this.recordEmailAudit(payload.order_id, 'ORDER_CREATED', dispatch.messageId);
          }
        }
      } catch (err) {
        console.error(`[OrderEventBus] Error in ORDER_CREATED worker for #${payload.order_id}:`, err);
      }

      return result;
    };

    // Non-blocking trigger
    return new Promise((resolve) => {
      // Execute asynchronously on next tick so calling HTTP handler finishes immediately
      const timer = setTimeout(() => {
        task().then(resolve).catch((err) => {
          console.error('[OrderEventBus] Unhandled worker exception:', err);
          resolve(null);
        });
      }, 0);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    });
  }

  /**
   * Dispatches PAYMENT_CONFIRMED receipt (to buyer) and revenue alert (to seller)
   * Triggered ONLY after FSM transitions status to PAID.
   */
  public publishPaymentConfirmed(
    payload: PaymentConfirmedEmailPayload
  ): Promise<OrderEventBusResult | null> {
    const task = async (): Promise<OrderEventBusResult> => {
      console.log(`[OrderEventBus] Event: PAYMENT_CONFIRMED for #${payload.order_id} (Tenant: ${payload.tenant_slug})`);
      const result: OrderEventBusResult = {
        event: 'PAYMENT_CONFIRMED',
        order_id: payload.order_id,
        timestamp: new Date().toISOString(),
      };

      try {
        const dispatches = await sendPaymentConfirmedEmails(payload);
        result.buyer_dispatch = dispatches.buyer_dispatch || null;
        result.seller_dispatch = dispatches.seller_dispatch || null;

        if (dispatches.buyer_dispatch?.success || dispatches.seller_dispatch?.success) {
          await this.recordEmailAudit(
            payload.order_id,
            'PAYMENT_CONFIRMED',
            dispatches.buyer_dispatch?.messageId || dispatches.seller_dispatch?.messageId
          );
        }
      } catch (err) {
        console.error(`[OrderEventBus] Error in PAYMENT_CONFIRMED worker for #${payload.order_id}:`, err);
      }

      return result;
    };

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        task().then(resolve).catch((err) => {
          console.error('[OrderEventBus] Unhandled worker exception:', err);
          resolve(null);
        });
      }, 0);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    });
  }

  /**
   * Dispatches FLAGGED_MANUAL review alert to seller for soft-match / evidence review.
   */
  public publishFlaggedManual(
    payload: FlaggedManualEmailPayload
  ): Promise<OrderEventBusResult | null> {
    const task = async (): Promise<OrderEventBusResult> => {
      console.log(`[OrderEventBus] Event: FLAGGED_MANUAL for #${payload.order_id} (Reason: ${payload.reason})`);
      const result: OrderEventBusResult = {
        event: 'FLAGGED_MANUAL',
        order_id: payload.order_id,
        timestamp: new Date().toISOString(),
      };

      try {
        const dispatch = await sendFlaggedManualEmail(payload);
        result.seller_dispatch = dispatch;

        if (dispatch.success) {
          await this.recordEmailAudit(payload.order_id, 'FLAGGED_MANUAL', dispatch.messageId);
        }
      } catch (err) {
        console.error(`[OrderEventBus] Error in FLAGGED_MANUAL worker for #${payload.order_id}:`, err);
      }

      return result;
    };

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        task().then(resolve).catch((err) => {
          console.error('[OrderEventBus] Unhandled worker exception:', err);
          resolve(null);
        });
      }, 0);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    });
  }

  /**
   * Updates database audit fields on the order record
   */
  private async recordEmailAudit(
    orderId: string,
    eventType: string,
    messageId?: string
  ): Promise<void> {
    try {
      const supabase = getSupabaseAdmin() || getSupabase();
      if (!supabase) return;

      const now = new Date().toISOString();
      await supabase
        .from('orders')
        .update({
          email_sent: true,
          email_sent_at: now,
        })
        .eq('id', orderId);

      console.log(`[OrderEventBus] [Audit] Order #${orderId} marked email_sent (${eventType}, msgId: ${messageId || 'none'})`);
    } catch (auditErr) {
      console.warn(`[OrderEventBus] Audit note on order #${orderId}:`, auditErr);
    }
  }
}

export const orderEventBus = new OrderEventBus();
