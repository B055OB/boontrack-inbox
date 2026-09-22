'use client';

import React, { useState } from 'react';
import { PackageCheck, Loader2, CheckCircle2, AlertTriangle, Zap } from 'lucide-react';

export interface OrderItem {
  id: string;
  invoice_no: string;
  customer_name?: string;
  customer_phone?: string;
  total_amount: number;
  payment_status: string;
}

interface GodPayButtonProps {
  order: OrderItem;
  tenantSlug: string;
  onSuccess: (updatedOrder: any) => void;
}

export default function GodPayButton({ order, tenantSlug, onSuccess }: GodPayButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [capiStatus, setCapiStatus] = useState<'idle' | 'dispatched' | 'failed'>('idle');

  const handleInstantPay = async () => {
    setIsLoading(true);
    setCapiStatus('idle');
    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/orders/${order.id}/quick-paid`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCapiStatus('dispatched');
        onSuccess(data.order);
        setTimeout(() => {
          setShowModal(false);
          setCapiStatus('idle');
        }, 1200);
      } else {
        setCapiStatus('failed');
      }
    } catch {
      setCapiStatus('failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (order.payment_status === 'PAID') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
        Delivered / Lunas
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-300 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
        title="Setujui pesanan dan kirim akses produk digital secara otomatis"
      >
        <PackageCheck className="w-3.5 h-3.5 text-emerald-600 group-hover:text-white" />
        <span>Approve & Deliver</span>
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <PackageCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Approve & Deliver Pesanan</h3>
                <p className="text-[11px] text-slate-500">Invoice: {order.invoice_no}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Setujui pesanan sebesar <strong>Rp {order.total_amount?.toLocaleString('id-ID')}</strong> ini sebagai <strong>LUNAS (PAID)</strong>?
              Sistem akan otomatis mengirimkan notifikasi pelunasan dan link akses materi digital ke pembeli, serta mengupgrade toko ke tier <strong>CHECKOUT_LITE</strong>.
            </p>

            {capiStatus === 'dispatched' && (
              <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold rounded-xl flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                🟢 Pesanan Disetujui & Akses Terkirim (Meta CAPI Aktif)
              </div>
            )}

            {capiStatus === 'failed' && (
              <div className="p-2 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold rounded-xl">
                ⚠️ Gagal memproses approve & delivery. Coba lagi.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setShowModal(false)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={handleInstantPay}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5" />}
                <span>Approve & Kirim Akses</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}