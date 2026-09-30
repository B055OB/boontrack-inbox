'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, Clock, ShieldCheck, Save, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

export default function FnbInstantCourier({ tenantSlug }: { tenantSlug: string }) {
  const [kitchenAddress, setKitchenAddress] = useState<string>('');
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [maxRadiusKm, setMaxRadiusKm] = useState<number>(30);
  const [kitchenHours, setKitchenHours] = useState<string>('08:00 - 20:00 WIB');
  const [instantProvider, setInstantProvider] = useState<string>('GOSEND_GRAB');

  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load real data from Supabase on mount
  useEffect(() => {
    async function loadFnbSettings() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const supabase = getSupabase();
        if (!supabase) throw new Error('Supabase client not initialized');

        // Load from tenant_settings.biteship_config.fnb_settings
        const { data: settings } = await supabase
          .from('tenant_settings')
          .select('biteship_config')
          .eq('tenant_slug', tenantSlug)
          .maybeSingle();

        if (settings?.biteship_config?.fnb_settings) {
          const fnb = settings.biteship_config.fnb_settings;
          setKitchenAddress(fnb.kitchen_address || '');
          setLatitude(fnb.latitude != null ? String(fnb.latitude) : '');
          setLongitude(fnb.longitude != null ? String(fnb.longitude) : '');
          setMaxRadiusKm(fnb.max_radius_km || 30);
          setKitchenHours(fnb.kitchen_hours || '08:00 - 20:00 WIB');
          setInstantProvider(fnb.instant_provider || 'GOSEND_GRAB');
        } else {
          // Fallback: try tenants.metadata.shipping_config.fnb_settings
          const { data: tenant } = await supabase
            .from('tenants')
            .select('metadata')
            .eq('slug', tenantSlug)
            .maybeSingle();

          const fnb = tenant?.metadata?.shipping_config?.fnb_settings;
          if (fnb) {
            setKitchenAddress(fnb.kitchen_address || '');
            setLatitude(fnb.latitude != null ? String(fnb.latitude) : '');
            setLongitude(fnb.longitude != null ? String(fnb.longitude) : '');
            setMaxRadiusKm(fnb.max_radius_km || 30);
            setKitchenHours(fnb.kitchen_hours || '08:00 - 20:00 WIB');
            setInstantProvider(fnb.instant_provider || 'GOSEND_GRAB');
          }

          // Also check origin address from biteship_config.origin
          if (settings?.biteship_config?.origin?.address && !kitchenAddress) {
            setKitchenAddress(settings.biteship_config.origin.address);
          }
        }
      } catch (err) {
        console.warn('[FnbInstantCourier] Load failed:', err);
        setLoadError('Gagal memuat konfigurasi. Menggunakan nilai default.');
      } finally {
        setIsLoading(false);
      }
    }

    if (tenantSlug) loadFnbSettings();
  }, [tenantSlug]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSavedFeedback(null);

    const fnbSettings = {
      is_fnb_store: true,
      kitchen_address: kitchenAddress,
      latitude: parseFloat(latitude) || null,
      longitude: parseFloat(longitude) || null,
      max_radius_km: maxRadiusKm,
      kitchen_hours: kitchenHours,
      instant_provider: instantProvider,
      updated_at: new Date().toISOString(),
    };

    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase client not initialized');

      // Load current biteship_config to deep-merge
      const { data: current } = await supabase
        .from('tenant_settings')
        .select('biteship_config')
        .eq('tenant_slug', tenantSlug)
        .maybeSingle();

      const existingConfig = current?.biteship_config || {};

      const updatedConfig = {
        ...existingConfig,
        fnb_settings: fnbSettings,
        routing_rules: {
          instant: 'biteship',
          regular: 'lincah',
        },
        updated_at: new Date().toISOString(),
      };

      // Also update origin lat/lon so shipping rates API can use them
      if (existingConfig.origin && fnbSettings.latitude && fnbSettings.longitude) {
        updatedConfig.origin = {
          ...existingConfig.origin,
          latitude: fnbSettings.latitude,
          longitude: fnbSettings.longitude,
        };
      }

      const { error: settingsErr } = await supabase
        .from('tenant_settings')
        .upsert(
          { tenant_slug: tenantSlug, biteship_config: updatedConfig, updated_at: new Date().toISOString() },
          { onConflict: 'tenant_slug' }
        );

      if (settingsErr) throw settingsErr;

      // Also update tenants.metadata.shipping_config.fnb_settings
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('metadata')
        .eq('slug', tenantSlug)
        .maybeSingle();

      if (tenantRow) {
        const existingMeta = tenantRow.metadata || {};
        const updatedMeta = {
          ...existingMeta,
          shipping_config: {
            ...(existingMeta.shipping_config || {}),
            fnb_settings: fnbSettings,
            routing_rules: { instant: 'biteship', regular: 'lincah' },
          },
        };
        await supabase
          .from('tenants')
          .update({ metadata: updatedMeta })
          .eq('slug', tenantSlug);
      }

      setSavedFeedback('✅ Konfigurasi Kurir Instan F&B berhasil disimpan!');
    } catch (err) {
      console.error('[FnbInstantCourier] Save failed:', err);
      setSavedFeedback('❌ Gagal menyimpan. Cek koneksi dan coba lagi.');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSavedFeedback(null), 4000);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center gap-2 text-slate-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Memuat konfigurasi dapur & kurir instan...</span>
      </div>
    );
  }

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
              Koordinat dapur, batas jangkauan km pengiriman makanan, dan jam operasional.
            </p>
          </div>
        </div>
        <span className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 self-start sm:self-auto flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>GoSend & GrabExpress Aktif</span>
        </span>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

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
            placeholder="Jl. Nama Jalan, No. Rumah, Kecamatan, Kota"
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-orange-600"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-blue-600" />
              <span>Latitude Koordinat Dapur</span>
            </label>
            <input
              type="number"
              step="0.0001"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="Contoh: -7.1171"
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold font-mono focus:bg-white focus:outline-none focus:border-orange-600"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-blue-600" />
              <span>Longitude Koordinat Dapur</span>
            </label>
            <input
              type="number"
              step="0.0001"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="Contoh: 112.5936"
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold font-mono focus:bg-white focus:outline-none focus:border-orange-600"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-indigo-600" />
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
              Pelanggan di luar radius {maxRadiusKm} km otomatis diarahkan ke kurir Reguler via Lincah.
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
              placeholder="Contoh: 08:00 - 20:00 WIB"
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Provider Kurir Instan</span>
          </label>
          <select
            value={instantProvider}
            onChange={(e) => setInstantProvider(e.target.value)}
            className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-emerald-600"
          >
            <option value="GOSEND_GRAB">GoSend (Gojek) + GrabExpress</option>
            <option value="GOSEND">GoSend (Gojek) Only</option>
            <option value="GRAB">GrabExpress Only</option>
          </select>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-3">
          {savedFeedback ? (
            <span className={`text-xs font-bold flex items-center gap-1 ${savedFeedback.startsWith('✅') ? 'text-emerald-600' : 'text-rose-600'}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              {savedFeedback}
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">
              💡 Koordinat digunakan untuk kalkulasi jarak real-time GoSend & GrabExpress.
            </span>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="ml-auto px-5 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? 'Menyimpan...' : 'Simpan Koordinat Dapur'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
