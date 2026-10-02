'use client';

import React from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Lock,
  X,
  ShieldCheck,
  FileText,
  Key,
  Video,
} from 'lucide-react';
import { formatWIBDateTime } from '@/lib/finance-engine';

export interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  tenantSlug?: string;
}

/**
 * ReceiptModal Component with ACT-02 Hard-Gate Security
 *
 * Invariant:
 * Jangan pernah me-render elemen <a> dengan URL fulfillment atau <iframe> ke dalam DOM
 * jika order belum berstatus PAID (mencegah eksfiltrasi aset via DevTools Elements DOM).
 */
export default function ReceiptModal({
  isOpen,
  onClose,
  order,
  tenantSlug,
}: ReceiptModalProps) {
  if (!isOpen || !order) return null;

  const rawStatus = String(order.status || '').toUpperCase().trim();
  const rawPaymentStatus = String(order.payment_status || '').toUpperCase().trim();
  const rawOrderStatus = String(order.order_status || '').toUpperCase().trim();

  const isPaid =
    ['PAID', 'SETTLED', 'SUCCESS', 'COMPLETED'].includes(rawStatus) ||
    ['PAID', 'SETTLED', 'SUCCESS', 'COMPLETED'].includes(rawPaymentStatus) ||
    ['PAID', 'SETTLED', 'SUCCESS', 'COMPLETED'].includes(rawOrderStatus);

  const isWaitingConfirmation =
    ['WAITING_CONFIRMATION', 'WAITING_VERIFICATION', 'IN_VERIFICATION'].includes(rawStatus) ||
    ['WAITING_CONFIRMATION', 'WAITING_VERIFICATION', 'IN_VERIFICATION'].includes(rawPaymentStatus);

  const grossAmount = Number(order.gross_amount ?? order.total_amount ?? order.amount ?? 0);
  const orderId = String(order.id || order.order_id || '').trim();
  const productTitle = order.product_title || order.product_name || 'Pesanan Produk';

  // Fulfillment Assets (Hanya diambil dan dibuka jika isPaid)
  const fulfillmentUrl = isPaid
    ? (order.fulfillment_url || order.download_url || order.link_digital || order.fulfillment_metadata?.access_url || null)
    : null;

  const meetingUrl = isPaid
    ? (order.google_meet_url || order.meeting_link || order.fulfillment_metadata?.meeting_url || order.fulfillment_metadata?.google_meet_url || null)
    : null;

  const licenseKey = isPaid
    ? (order.license_key || order.fulfillment_metadata?.license_key || null)
    : null;

  const instructions = isPaid
    ? (order.instructions || order.fulfillment_metadata?.instructions || null)
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
              Kwitansi &amp; Rincian Faktur #{orderId}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/70 text-slate-600 hover:bg-slate-200 flex items-center justify-center text-xs font-bold transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Status Badge */}
          {isPaid ? (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-950 font-medium">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <span className="font-black text-emerald-800 uppercase tracking-wide block">
                  Status: Pembayaran Lunas (PAID)
                </span>
                <p className="text-[11px] text-emerald-700">
                  Transaksi telah diverifikasi. Akses aset produk digital resmi telah terbuka.
                </p>
              </div>
            </div>
          ) : isWaitingConfirmation ? (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl flex items-center gap-2.5 text-xs text-amber-950 font-medium">
              <Clock className="w-5 h-5 text-amber-600 shrink-0 animate-pulse" />
              <div>
                <span className="font-black text-amber-800 uppercase tracking-wide block">
                  Status: Menunggu Verifikasi Penjual
                </span>
                <p className="text-[11px] text-amber-700">
                  Bukti transfer sedang diperiksa oleh sistem / admin toko.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-xs text-rose-950 font-medium">
              <Lock className="w-5 h-5 text-rose-600 shrink-0" />
              <div>
                <span className="font-black text-rose-800 uppercase tracking-wide block">
                  Status: Belum Lunas (UNPAID)
                </span>
                <p className="text-[11px] text-rose-700">
                  Akses fulfillment digital terkunci sampai transaksi lunas.
                </p>
              </div>
            </div>
          )}

          {/* Rincian Ringkas Pesanan */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
            <div className="flex justify-between text-slate-500">
              <span>Produk:</span>
              <span className="font-bold text-slate-800 text-right max-w-[200px] truncate">
                {productTitle}
              </span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Total Tagihan:</span>
              <span className="font-mono font-black text-slate-900">
                Rp {grossAmount.toLocaleString('id-ID')}
              </span>
            </div>
            {order.paid_at && (
              <div className="flex justify-between text-slate-500">
                <span>Waktu Pembayaran:</span>
                <span className="font-medium text-slate-700">
                  {formatWIBDateTime(order.paid_at)}
                </span>
              </div>
            )}
          </div>

          {/* HARD-GATED FULFILLMENT ACCESS (ACT-02) */}
          {isPaid ? (
            <div className="p-4 bg-emerald-500/10 border-2 border-emerald-500/50 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-black text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Pengiriman &amp; Akses Layanan Digital</span>
              </div>

              {fulfillmentUrl && (
                <a
                  href={fulfillmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition shadow-md shadow-emerald-600/20 no-underline"
                >
                  <Download className="w-4 h-4" />
                  <span>Buka Akses / Unduh Materi Digital</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}

              {meetingUrl && (
                <a
                  href={meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition no-underline"
                >
                  <Video className="w-4 h-4" />
                  <span>Masuk Sesi Google Meet / Zoom</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}

              {licenseKey && (
                <div className="p-2.5 bg-white border border-emerald-200 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Kunci Lisensi:
                  </span>
                  <span className="font-mono text-xs font-bold text-blue-700 select-all block">
                    {licenseKey}
                  </span>
                </div>
              )}

              {instructions && (
                <div className="p-2.5 bg-white border border-emerald-200 rounded-xl space-y-1 text-[11px] text-slate-700">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Petunjuk Akses:
                  </span>
                  <p className="whitespace-pre-line leading-relaxed">{instructions}</p>
                </div>
              )}
            </div>
          ) : (
            /* LOKASI HARD-GATE: Dilarang keras merender elemen <a> atau <iframe> saat belum PAID */
            <div className="p-4 bg-slate-100 border border-slate-200 rounded-2xl text-center space-y-2">
              <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-500 flex items-center justify-center mx-auto">
                <Lock className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-slate-800">
                Akses Fulfillment Terkunci
              </h4>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                Tautan unduh materi digital dan link pertemuan privat hanya dapat diakses setelah pembayaran berstatus LUNAS (PAID).
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition cursor-pointer"
          >
            Tutup Kwitansi
          </button>
        </div>
      </div>
    </div>
  );
}
