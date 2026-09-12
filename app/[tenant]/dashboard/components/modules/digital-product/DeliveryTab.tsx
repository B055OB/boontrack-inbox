'use client';

import React, { useState } from 'react';
import { Download, Key, CheckCircle2, RefreshCw, ExternalLink, ShieldCheck, Mail } from 'lucide-react';

export interface DigitalDeliveryItem {
  id: string;
  orderId: string;
  customerName: string;
  email: string;
  phone: string;
  productName: string;
  deliveredAt: string;
  downloadCount: number;
  deliveryStatus: 'DELIVERED' | 'FAILED' | 'PENDING';
  downloadUrl: string;
}

const INITIAL_DELIVERIES: DigitalDeliveryItem[] = [
  {
    id: 'DEL-901',
    orderId: 'ORD-1789222',
    customerName: 'Rian Pratama',
    email: 'rian.pratama@gmail.com',
    phone: '081298812345',
    productName: 'E-course Meta Ads Blueprint 2026',
    deliveredAt: '12 Sep 2026, 14:15 WIB',
    downloadCount: 3,
    deliveryStatus: 'DELIVERED',
    downloadUrl: 'https://assets.boontrack.com/downloads/meta-blueprint.zip',
  },
  {
    id: 'DEL-902',
    orderId: 'ORD-1789230',
    customerName: 'Siti Sarah',
    email: 'sitisarah99@yahoo.com',
    phone: '085712998877',
    productName: 'Template Copywriting AI Prompts Bundle',
    deliveredAt: '12 Sep 2026, 11:05 WIB',
    downloadCount: 1,
    deliveryStatus: 'DELIVERED',
    downloadUrl: 'https://assets.boontrack.com/downloads/copywriting-prompts.pdf',
  },
  {
    id: 'DEL-903',
    orderId: 'ORD-1789244',
    customerName: 'Budi Santoso',
    email: 'budi.santoso@live.com',
    phone: '081399887766',
    productName: 'Notion Life OS Workspace Template',
    deliveredAt: '11 Sep 2026, 18:30 WIB',
    downloadCount: 5,
    deliveryStatus: 'DELIVERED',
    downloadUrl: 'https://notion.so/...',
  },
];

export default function DigitalDeliveryTab({ tenantSlug }: { tenantSlug: string }) {
  const [deliveries, setDeliveries] = useState<DigitalDeliveryItem[]>(INITIAL_DELIVERIES);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <Download className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900">
              Log Distribusi Produk Digital & Lisensi
            </h2>
            <p className="text-xs text-slate-500">
              Riwayat pengiriman otomatis tautan akses file, kode lisensi, dan log download pasca transaksi lunas.
            </p>
          </div>
        </div>

        <span className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 self-start sm:self-auto flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Sistem Distribusi Otomatis 24/7 Aktif</span>
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Order & Pembeli</th>
                <th className="py-3 px-4">Produk Digital</th>
                <th className="py-3 px-4">Waktu Pengiriman</th>
                <th className="py-3 px-4 text-center">Unduhan</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deliveries.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900">{item.customerName}</div>
                    <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                      <span>{item.orderId}</span>
                      <span>•</span>
                      <span>{item.phone}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-800">{item.productName}</div>
                    <div className="text-[10px] text-indigo-600 font-mono truncate max-w-[200px]">
                      {item.downloadUrl}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 font-medium">
                    {item.deliveredAt}
                  </td>
                  <td className="py-3.5 px-4 text-center font-bold text-slate-700">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[11px]">
                      {item.downloadCount}x klik
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      TERKIRIM
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <a
                      href={`https://wa.me/${item.phone.replace(/^0/, '62')}?text=${encodeURIComponent(
                        `Halo ${item.customerName}, berikut link akses digital pesanan ${item.productName} Anda: ${item.downloadUrl}. Terima kasih telah membeli di ${tenantSlug}!`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition cursor-pointer"
                    >
                      <span>Kirim Ulang WA</span>
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
