'use client';

import React, { useState } from 'react';
import { MapPin, Navigation, Clock, ShieldCheck, Save, CheckCircle2 } from 'lucide-react';

export default function FnbInstantCourier({ tenantSlug }: { tenantSlug: string }) {
  const [kitchenAddress, setKitchenAddress] = useState<string>('Dapur Pusat Boon Culinary, Jl. Riau No. 120, Bandung');
  const [maxRadiusKm, setMaxRadiusKm] = useState<number>(25);
  const [kitchenHours, setKitchenHours] = useState<string>('10:00 - 21:00 WIB (Last Order 20:30 WIB)');
  const [instantProvider, setInstantProvider] = useState<string>('GOSEND_GRAB');
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedFeedback('✅ Konfigurasi Kurir Instan F&B berhasil disimpan!');
    setTimeout(() => setSavedFeedback(null), 3500);
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
            <Navigation className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900">
              Pengaturan Kurir Instan & Titik Resto (F&B)
            </h2>
            <p className="text-xs text-slate-500">
              Penentuan pinpoint koordinat dapur, batas jangkauan km pengiriman makanan panas/beku, dan jam operasional.
            </p>
          </div>
        </div>

        <span className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 self-start sm:self-auto flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>GoSend & GrabExpress Aktif</span>
        </span>
      </div>

      <form onSubmit={handleSave} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-orange-600" />
            <span>Alamat Titik Jemput Dapur / Resto (Pick-up Point)</span>
          </label>
          <input
            type="text"
            value={kitchenAddress}
            onChange={(e) => setKitchenAddress(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-orange-600"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-blue-600" />
              <span>Batas Radius Maksimal Kurir Instan (KM)</span>
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={maxRadiusKm}
              onChange={(e) => setMaxRadiusKm(Number(e.target.value))}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold font-mono focus:bg-white focus:outline-none focus:border-orange-600"
            />
            <span className="text-[11px] text-slate-400">
              Pelanggan di luar radius {maxRadiusKm} km otomatis diarahkan ke kurir Paxel / Kargo Frozen.
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-600" />
              <span>Jam Buka Dapur / Pengiriman Makanan</span>
            </label>
            <input
              type="text"
              value={kitchenHours}
              onChange={(e) => setKitchenHours(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          {savedFeedback && (
            <span className="text-xs font-bold text-emerald-600">{savedFeedback}</span>
          )}
          <button
            type="submit"
            className="ml-auto px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Koordinat Dapur</span>
          </button>
        </div>
      </form>
    </div>
  );
}
