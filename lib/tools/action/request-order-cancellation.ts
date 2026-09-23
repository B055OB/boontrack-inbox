/**
 * lib/tools/action/request-order-cancellation.ts
 * Action Tool: request_order_cancellation
 *
 * Mengimplementasikan Core Guardrail (Zero-Liability) untuk pembatalan pesanan:
 * 1. UNPAID / PENDING -> APPROVED (Void order)
 * 2. PAID (belum pickup) -> APPROVED & tandai butuh refund manual merchant
 * 3. PICKUP_REQUESTED / IN_TRANSIT / DELIVERED -> REJECTED otomatis dengan pesan guardrail
 * 4. Isolasi ketat tenant context (dilarang mutasi order toko lain)
 */

import { z } from 'zod';
import type { AgentTool, ToolContext, ToolResult } from '../types';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export const RequestOrderCancellationSchema = z.object({
  order_id: z
    .string()
    .min(1, 'Order ID wajib diisi')
    .describe('ID pesanan yang ingin dibatalkan (misal: ORD-12345)'),
  reason: z
    .string()
    .min(3, 'Alasan pembatalan minimal 3 karakter')
    .describe('Alasan pembatalan dari pembeli atau instruksi merchant'),
});

export type RequestOrderCancellationParams = z.infer<typeof RequestOrderCancellationSchema>;

export interface CancellationResultData {
  order_id: string;
  previous_status: string;
  new_status: string;
  cancellation_action: 'VOID_ORDER' | 'MANUAL_REFUND_REQUIRED' | 'NONE';
  refund_status?: string | null;
  cancellation_reason: string;
  cancelled_at?: string;
}

export const requestOrderCancellationTool: AgentTool<
  RequestOrderCancellationParams,
  CancellationResultData | null
> = {
  name: 'request_order_cancellation',
  description:
    'Memproses permohonan pembatalan pesanan pembeli dengan validasi Core Guardrail (Zero-Liability: menolak pesanan yang sudah dalam proses kurir).',
  permission: 'ACTION',
  schema: RequestOrderCancellationSchema,

  handler: async (
    context: ToolContext,
    params: RequestOrderCancellationParams
  ): Promise<ToolResult<CancellationResultData | null>> => {
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return {
        success: false,
        guardrailStatus: 'FAILED',
        error: '[request_order_cancellation] Database client unavailable',
      };
    }

    const cleanOrderId = params.order_id.trim();
    const cleanReason = params.reason.trim();

    // 1. Strict Tenant Isolation: Cari order yang valid HANYA milik tenant ini
    const { data: orders, error: fetchErr } = await supabase
      .from('orders')
      .select('id, order_id, tenant_slug, tenant_id, status, payment_status, shipping_status, gross_amount, customer_phone')
      .or(`tenant_slug.eq.${context.tenant_id},tenant_id.eq.${context.tenant_id}`)
      .or(`id.eq.${cleanOrderId},order_id.eq.${cleanOrderId}`)
      .limit(1);

    if (fetchErr) {
      return {
        success: false,
        guardrailStatus: 'FAILED',
        error: `[request_order_cancellation] Query order error: ${fetchErr.message}`,
      };
    }

    if (!orders || orders.length === 0) {
      return {
        success: false,
        guardrailStatus: 'FAILED',
        error: `Pesanan '${cleanOrderId}' tidak ditemukan atau berada di luar akses toko ini.`,
      };
    }

    const order = orders[0];
    const currentPaymentStatus = String(order.status || order.payment_status || 'PENDING').toUpperCase();
    const currentShippingStatus = String(order.shipping_status || 'NONE').toUpperCase();

    // 2. Idempotency: Jika pesanan sudah dibatalkan sebelumnya
    if (currentPaymentStatus === 'CANCELLED') {
      return {
        success: true,
        guardrailStatus: 'APPROVED',
        actionTaken: false,
        data: {
          order_id: String(order.id),
          previous_status: currentPaymentStatus,
          new_status: 'CANCELLED',
          cancellation_action: 'NONE',
          cancellation_reason: cleanReason,
        },
        message: `Pesanan #${order.id} sudah berstatus DIBATALKAN sebelumnya.`,
      };
    }

    // 3. CORE GUARDRAIL RULE: Kurir Dispatch Boundary
    // Jika pesanan sudah dalam proses penjemputan atau pengiriman kurir -> REJECTED OTOMATIS
    const DISPATCHED_STATUSES = [
      'PICKUP_REQUESTED',
      'PICKED_UP',
      'ON_DELIVERY',
      'IN_TRANSIT',
      'DELIVERED',
      'SHIPPED',
      'COMPLETE',
    ];

    if (DISPATCHED_STATUSES.includes(currentShippingStatus)) {
      return {
        success: false,
        guardrailStatus: 'REJECTED',
        actionTaken: false,
        data: null,
        message: 'Pesanan sudah diproses kurir dan tidak dapat dibatalkan secara otomatis.',
      };
    }

    const nowIso = new Date().toISOString();

    // 4. ATURAN BISNIS: Status UNPAID / PENDING -> Void Order
    const UNPAID_STATUSES = ['UNPAID', 'PENDING', 'WAITING_PAYMENT'];
    if (UNPAID_STATUSES.includes(currentPaymentStatus)) {
      const { error: updateErr } = await supabase
        .from('orders')
        .update({
          status: 'CANCELLED',
          payment_status: 'CANCELLED',
          order_status: 'CANCELLED',
          cancellation_reason: cleanReason,
          cancelled_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', order.id);

      if (updateErr) {
        return {
          success: false,
          guardrailStatus: 'FAILED',
          error: `Gagal memperbarui status pembatalan order: ${updateErr.message}`,
        };
      }

      return {
        success: true,
        guardrailStatus: 'APPROVED',
        actionTaken: true,
        data: {
          order_id: String(order.id),
          previous_status: currentPaymentStatus,
          new_status: 'CANCELLED',
          cancellation_action: 'VOID_ORDER',
          cancellation_reason: cleanReason,
          cancelled_at: nowIso,
        },
        message: `Pesanan #${order.id} belum dibayar berhasil dibatalkan (Void order).`,
      };
    }

    // 5. ATURAN BISNIS: Status PAID (Belum request pickup) -> Approved & tandai manual refund
    if (currentPaymentStatus === 'PAID' || currentPaymentStatus === 'SETTLED' || currentPaymentStatus === 'COMPLETED') {
      const { error: updateErr } = await supabase
        .from('orders')
        .update({
          status: 'CANCELLED',
          order_status: 'CANCELLED',
          cancellation_reason: cleanReason,
          refund_status: 'PENDING_MANUAL_REFUND',
          cancelled_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', order.id);

      if (updateErr) {
        return {
          success: false,
          guardrailStatus: 'FAILED',
          error: `Gagal memperbarui pembatalan order lunas: ${updateErr.message}`,
        };
      }

      return {
        success: true,
        guardrailStatus: 'APPROVED',
        actionTaken: true,
        data: {
          order_id: String(order.id),
          previous_status: currentPaymentStatus,
          new_status: 'CANCELLED',
          cancellation_action: 'MANUAL_REFUND_REQUIRED',
          refund_status: 'PENDING_MANUAL_REFUND',
          cancellation_reason: cleanReason,
          cancelled_at: nowIso,
        },
        message: `Pesanan lunas #${order.id} berhasil dibatalkan. Sistem telah menandai pesanan untuk proses refund manual oleh tim merchant.`,
      };
    }

    // 6. Fallback untuk status tak terduga
    return {
      success: false,
      guardrailStatus: 'REJECTED',
      actionTaken: false,
      message: `Status pesanan (${currentPaymentStatus}) tidak memenuhi syarat untuk pembatalan otomatis.`,
    };
  },
};
