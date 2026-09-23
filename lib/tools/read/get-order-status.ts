/**
 * lib/tools/read/get-order-status.ts
 * Read Tool: get_order_status
 *
 * Mengambil ringkasan pesanan terakhir pembeli (status bayar, detail item, kurir)
 * dengan isolasi ketat terhadap tenant_id di ToolContext.
 */

import { z } from 'zod';
import type { AgentTool, ToolContext, ToolResult } from '../types';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';
import { isValidUuid } from '@/lib/uuid-guard';

export const GetOrderStatusSchema = z.object({
  order_id_or_phone: z
    .string()
    .min(1, 'Order ID atau nomor telepon pemesan wajib diisi')
    .describe('ID pesanan (misal ORD-xxx) atau nomor WhatsApp pelanggan (misal 0812xxx atau 62812xxx)'),
});

export type GetOrderStatusParams = z.infer<typeof GetOrderStatusSchema>;

export interface OrderStatusSummary {
  order_id: string;
  invoice_no?: string;
  customer_name: string;
  customer_phone: string;
  items_summary: string;
  total_amount: number;
  payment_status: string;
  shipping_status: string;
  shipping_courier: string;
  tracking_number: string | null;
  created_at: string;
}

export const getOrderStatusTool: AgentTool<GetOrderStatusParams, OrderStatusSummary | null> = {
  name: 'get_order_status',
  description:
    'Mengambil ringkasan pesanan terakhir pembeli (status bayar, produk, status pengiriman, kurir, dan nomor resi) berdasarkan Order ID atau nomor HP pembeli.',
  permission: 'READ',
  schema: GetOrderStatusSchema,

  handler: async (context: ToolContext, params: GetOrderStatusParams): Promise<ToolResult<OrderStatusSummary | null>> => {
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return {
        success: false,
        error: '[get_order_status] Database client unavailable',
      };
    }

    const rawInput = params.order_id_or_phone.trim();
    const cleanDigits = rawInput.replace(/\D/g, '');
    const isPhoneNumber = cleanDigits.length >= 8 && (rawInput.startsWith('0') || rawInput.startsWith('62') || rawInput.startsWith('+62') || rawInput.startsWith('8'));

    // Tenant Context Isolation: Strictly filter by tenant_slug or tenant_id
    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (isValidUuid(context.tenant_id)) {
      query = query.or(`tenant_slug.eq.${context.tenant_id},tenant_id.eq.${context.tenant_id}`);
    } else {
      query = query.or(`tenant_slug.eq.${context.tenant_id}`);
    }

    if (isPhoneNumber) {
      const normalizedPhone = cleanDigits.startsWith('0')
        ? '62' + cleanDigits.slice(1)
        : cleanDigits.startsWith('8')
        ? '62' + cleanDigits
        : cleanDigits;

      query = query.or(`customer_phone.ilike.%${normalizedPhone}%,customer_phone.ilike.%${cleanDigits}%`);
    } else {
      query = query.or(`id.eq.${rawInput},id.ilike.%${rawInput}%,correlation_id.eq.${rawInput}`);
    }

    const { data: orders, error } = await query;

    if (error) {
      return {
        success: false,
        data: null,
        error: `[get_order_status] Failed to query orders: ${error.message}`,
      };
    }

    if (!orders || orders.length === 0) {
      return {
        success: false,
        data: null,
        message: `Tidak ditemukan pesanan dengan referensi '${rawInput}' pada toko ini.`,
      };
    }

    const order = orders[0];
    const summary: OrderStatusSummary = {
      order_id: String(order.id || order.order_id || ''),
      invoice_no: order.invoice_no || order.id || undefined,
      customer_name: order.customer_name || 'Pelanggan',
      customer_phone: order.customer_phone || '',
      items_summary: order.items_summary || order.product_title || order.product_name || 'Pesanan Produk',
      total_amount: Number(order.gross_amount ?? order.total_amount ?? 0),
      payment_status: String(order.status || order.payment_status || 'PENDING').toUpperCase(),
      shipping_status: String(order.shipping_status || 'PENDING').toUpperCase(),
      shipping_courier: order.shipping_courier || 'Kurir Standar',
      tracking_number: order.tracking_number || order.resi || order.waybill || null,
      created_at: order.created_at || new Date().toISOString(),
    };

    return {
      success: true,
      data: summary,
      message: `Pesanan #${summary.order_id} ditemukan: Status pembayaran ${summary.payment_status}, Status pengiriman ${summary.shipping_status}.`,
    };
  },
};
