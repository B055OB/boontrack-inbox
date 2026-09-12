'use client';

import React, { useState } from 'react';
import { Truck, PackageCheck, Search, CheckCircle2, ArrowRight, ExternalLink } from 'lucide-react';

export interface ShipmentItem {
  id: string;
  orderId: string;
  recipientName: string;
  phone: string;
  destination: string;
  courier: string;
  waybill: string;
  status: 'PENDING_PICKUP' | 'SHIPPED' | 'DELIVERED';
  shippedAt: string;
}

const INITIAL_SHIPMENTS: ShipmentItem[] = [
  {
    id: 'SHP-801',
    orderId: 'ORD-1789012',
    recipientName: 'Agus Setiawan',
    phone: '081288990011',
    destination: 'Bandung, Jawa Barat (40115)',
    courier: 'J&T Express (Reguler)',
    waybill: 'JT9812739120ID',
    status: 'SHIPPED',
    shippedAt: '12 Sep 2026, 10:00 WIB',
  },
  {
    id: 'SHP-802',
    orderId: 'ORD-1789025',
    recipientName: 'Dewi Lestari',
    phone: '085733445566',
    destination: 'Surabaya, Jawa Timur (60281)',
    courier: 'SiCepat BEST',
    waybill: '003498172635',
    status: 'SHIPPED',
    shippedAt: '11 Sep 2026, 16:30 WIB',
  },
];

export default function PhysicalRetailShippingTab({ tenantSlug }: { tenantSlug: string }) {
  const [shipments, setShipments] = useState<ShipmentItem[]>(INITIAL_SHIPMENTS);
  const [inputOrderId, setInputOrderId] = useState('');
  const [inputResi, setInputResi] = useState('');

  const handleUpdateResi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputOrderId || !inputResi) return;
    setShipments((prev) =>
      prev.map((s) => (s.orderId.toLowerCase() === inputOrderId.toLowerCase() ? { ...s, waybill: inputResi, status: 'SHIPPED' } : s))
    );
    setInputOrderId('');
    setInputResi('');
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900">
              Logistik Ekspedisi & Input Resi Pengiriman
            </h2>
            <p className="text-xs text-slate-500">
              Kelola nomor resi paket fisik kurir reguler/kargo dan pantau pelacakan pesanan pembeli.
            </p>
          </div>
        </div>

        <span className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 self-start sm:self-auto flex items-center gap-1.5">
          <PackageCheck className="w-3.5 h-3.5" />
          <span>Multi-Kurir Terintegrasi</span>
        </span>
      </div>

      {/* Form Input Resi Cepat */}
      <form onSubmit={handleUpdateResi} className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-2">
        <h4 className="text-xs font-black text-slate-900">Input / Update Nomor Resi Cepat</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          <input
            type="text"
            placeholder="No. Order (e.g. ORD-1789012)"
            value={inputOrderId}
            onChange={(e) => setInputOrderId(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-amber-600"
          />
          <input
            type="text"
            placeholder="Nomor Resi (Waybill)"
            value={inputResi}
            onChange={(e) => setInputResi(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-amber-600"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>Simpan Resi & Notif WA</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>

      {/* Shipment Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Order & Penerima</th>
                <th className="py-3 px-4">Tujuan Pengiriman</th>
                <th className="py-3 px-4">Kurir & No. Resi</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Lacak Resi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shipments.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900">{s.recipientName}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{s.orderId} • {s.phone}</div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-700 font-medium">
                    {s.destination}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-800">{s.courier}</div>
                    <div className="font-mono text-amber-700 font-bold text-[11px]">{s.waybill}</div>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      DALAM PENGIRIMAN
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <a
                      href={`https://cekresi.com/?noresi=${s.waybill}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 font-bold hover:underline"
                    >
                      <span>Cek Posisi</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
