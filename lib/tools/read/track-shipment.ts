/**
 * lib/tools/read/track-shipment.ts
 * Read Tool: track_shipment
 *
 * Menarik status resi terkini dari logistik/agregator (Lincah / kurir partner)
 * dengan isolasi ketat terhadap tenant_id di ToolContext.
 */

import { z } from 'zod';
import type { AgentTool, ToolContext, ToolResult } from '../types';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export const TrackShipmentSchema = z.object({
  tracking_number: z
    .string()
    .min(1, 'Nomor resi pengiriman wajib diisi')
    .describe('Nomor resi atau waybill pengiriman kurir (misal: JNT123456789, LNC-998877)'),
});

export type TrackShipmentParams = z.infer<typeof TrackShipmentSchema>;

export interface ShippingLogEntry {
  event: string;
  update?: string | null;
  received_at: string;
}

export interface ShipmentTrackingSummary {
  order_id: string;
  tracking_number: string;
  courier: string;
  shipping_status: string;
  recipient_name: string;
  destination?: string;
  shipping_logs: ShippingLogEntry[];
  last_updated_at: string;
}

export const trackShipmentTool: AgentTool<TrackShipmentParams, ShipmentTrackingSummary | null> = {
  name: 'track_shipment',
  description:
    'Menarik status resi pengiriman kurir logistik terkini, detail kurir, dan riwayat pergerakan paket berdasarkan nomor resi.',
  permission: 'READ',
  schema: TrackShipmentSchema,

  handler: async (
    context: ToolContext,
    params: TrackShipmentParams
  ): Promise<ToolResult<ShipmentTrackingSummary | null>> => {
    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return {
        success: false,
        error: '[track_shipment] Database client unavailable',
      };
    }

    const cleanResi = params.tracking_number.trim();

    // Strict Tenant Isolation: Only search orders belonging to this tenant
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, order_id, customer_name, shipping_courier, shipping_status, shipping_address, tracking_number, resi, waybill, no_order, shipping_logs, updated_at')
      .or(`tenant_slug.eq.${context.tenant_id},tenant_id.eq.${context.tenant_id}`)
      .or(`tracking_number.eq.${cleanResi},resi.eq.${cleanResi},waybill.eq.${cleanResi},no_order.eq.${cleanResi}`)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      return {
        success: false,
        error: `[track_shipment] Failed to query shipment tracking: ${error.message}`,
      };
    }

    if (!orders || orders.length === 0) {
      return {
        success: false,
        data: null,
        message: `Nomor resi '${cleanResi}' tidak ditemukan dalam database pesanan toko ini.`,
      };
    }

    const order = orders[0];
    const rawLogs = Array.isArray(order.shipping_logs) ? order.shipping_logs : [];
    const shippingLogs: ShippingLogEntry[] = rawLogs.map((log: any) => ({
      event: String(log.event || 'STATUS_UPDATE'),
      update: log.update ? String(log.update) : null,
      received_at: log.received_at || log.timestamp || new Date().toISOString(),
    }));

    const statusMap: Record<string, string> = {
      PENDING: 'Sedang Disiapkan Penjual',
      PICKUP_REQUESTED: 'Menunggu Penjemputan Kurir',
      PICKED_UP: 'Paket Berhasil Di-pickup Kurir',
      ON_DELIVERY: 'Dalam Perjalanan Menuju Alamat Penerima',
      IN_TRANSIT: 'Dalam Perjalanan (Transit Hub)',
      DELIVERED: 'Telah Diterima Penerima',
      PROBLEM: 'Terdapat Kendala Pengiriman',
      RETURNED: 'Paket Dikembalikan ke Penjual',
    };

    const currentStatus = String(order.shipping_status || 'PENDING').toUpperCase();
    const readableStatus = statusMap[currentStatus] || currentStatus;

    const summary: ShipmentTrackingSummary = {
      order_id: String(order.id || order.order_id || ''),
      tracking_number: cleanResi,
      courier: order.shipping_courier || 'Ekspedisi Reguler',
      shipping_status: readableStatus,
      recipient_name: order.customer_name || 'Penerima',
      destination: order.shipping_address || undefined,
      shipping_logs: shippingLogs,
      last_updated_at: order.updated_at || new Date().toISOString(),
    };

    return {
      success: true,
      data: summary,
      message: `Resi ${cleanResi} (${summary.courier}): ${readableStatus}.`,
    };
  },
};
