'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  MapPin,
  Navigation,
  Clock,
  ShieldCheck,
  Save,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Users,
  UserPlus,
  Trash2,
  MessageSquare,
  Info,
} from 'lucide-react';

export interface TenantDriver {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  status: 'standby' | 'delivering';
  is_active: boolean;
  created_at: string;
}

export interface LoadedFnbShippingState {
  isCatering: boolean;
  kitchenAddress: string;
  latitude: string;
  longitude: string;
  maxRadiusKm: number;
  kitchenHours: string;
  instantProvider: string;
}

export async function fetchFnbShippingConfig(
  tenantSlug: string,
  fetchFn: typeof fetch = fetch
): Promise<LoadedFnbShippingState> {
  const res = await fetchFn(
    `/api/v1/shipping/config?tenant=${encodeURIComponent(tenantSlug)}`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(
      data?.message || data?.error || `HTTP ${res.status} saat memuat konfigurasi.`
    );
  }

  const storeCtx = data.store_context || {};
  const courierCfg = data.courier_config || {};
  const fnb = courierCfg.fnb_settings || storeCtx.fnb_settings || null;
  const origin = courierCfg.origin || {};

  const isCatering = Boolean(
    storeCtx.fnb_catering === true ||
    storeCtx.logistics?.primary === 'internal_fleet' ||
    String(storeCtx.business_category || '').toUpperCase().includes('FOOD') ||
    fnb?.fnb_catering === true ||
    fnb?.is_fnb_store === true
  );

  const defaultRadius = isCatering ? 40 : 30;
  const apiEffectiveRadius = Number(storeCtx.effective_max_radius_km);
  const fnbRadius = Number(fnb?.max_radius_km);
  const resolvedRadius =
    Number.isFinite(apiEffectiveRadius) && apiEffectiveRadius >= 1 && apiEffectiveRadius <= 60
      ? apiEffectiveRadius
      : Number.isFinite(fnbRadius) && fnbRadius >= 1 && fnbRadius <= 60
        ? fnbRadius
        : defaultRadius;

  const resolvedAddress =
    (typeof fnb?.kitchen_address === 'string' && fnb.kitchen_address.trim()) ||
    (typeof origin?.address === 'string' && origin.address.trim()) ||
    (typeof storeCtx.kitchen_address === 'string' && storeCtx.kitchen_address.trim()) ||
    '';

  const rawLat = fnb?.latitude ?? origin?.latitude;
  const rawLng = fnb?.longitude ?? origin?.longitude;

  return {
    isCatering,
    kitchenAddress: resolvedAddress,
    latitude: rawLat !== undefined && rawLat !== null && rawLat !== '' ? String(rawLat) : '',
    longitude: rawLng !== undefined && rawLng !== null && rawLng !== '' ? String(rawLng) : '',
    maxRadiusKm: resolvedRadius,
    kitchenHours: fnb?.kitchen_hours || '08:00 - 20:00 WIB',
    instantProvider: isCatering
      ? 'INTERNAL_LALAMOVE'
      : fnb?.instant_provider || 'INTERNAL_LALAMOVE',
  };
}

export async function saveFnbShippingConfig(
  params: {
    tenantSlug: string;
    isFnbCatering: boolean;
    kitchenAddress: string;
    latitude?: number;
    longitude?: number;
    maxRadiusKm: number;
    kitchenHours: string;
    instantProvider: string;
  },
  fetchFn: typeof fetch = fetch
): Promise<{
  kitchenAddress: string;
  latitude?: string;
  longitude?: string;
  maxRadiusKm?: number;
}> {
  const cleanAddress = params.kitchenAddress.trim();
  const fnbSettings: Record<string, any> = {
    is_fnb_store: true,
    fnb_catering: params.isFnbCatering,
    kitchen_address: cleanAddress,
    max_radius_km: params.maxRadiusKm,
    kitchen_hours: params.kitchenHours.trim() || '08:00 - 20:00 WIB',
    instant_provider: params.instantProvider,
    logistics_tier: {
      primary: 'internal_fleet',
      fallback: 'lalamove',
    },
    ...(params.latitude !== undefined && params.longitude !== undefined
      ? { latitude: params.latitude, longitude: params.longitude }
      : {}),
  };

  const res = await fetchFn('/api/v1/shipping/config', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_slug: params.tenantSlug,
      fnb_settings: fnbSettings,
      origin: {
        ...(cleanAddress ? { address: cleanAddress } : {}),
        ...(params.latitude !== undefined && params.longitude !== undefined
          ? { latitude: params.latitude, longitude: params.longitude }
          : {}),
      },
      routing_rules: {
        instant: 'biteship',
        fallback_courier: 'lalamove',
        regular: 'lincah',
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
  }

  const savedFnb = data?.courier_config?.fnb_settings;
  const savedOrigin = data?.courier_config?.origin;
  const effectiveRadius = Number(data?.store_context?.effective_max_radius_km);

  return {
    kitchenAddress: savedFnb?.kitchen_address || savedOrigin?.address || cleanAddress,
    latitude:
      savedFnb?.latitude !== undefined && savedFnb?.latitude !== null
        ? String(savedFnb.latitude)
        : savedOrigin?.latitude !== undefined && savedOrigin?.latitude !== null
          ? String(savedOrigin.latitude)
          : undefined,
    longitude:
      savedFnb?.longitude !== undefined && savedFnb?.longitude !== null
        ? String(savedFnb.longitude)
        : savedOrigin?.longitude !== undefined && savedOrigin?.longitude !== null
          ? String(savedOrigin.longitude)
          : undefined,
    maxRadiusKm:
      Number.isFinite(effectiveRadius) && effectiveRadius >= 1 && effectiveRadius <= 60
        ? effectiveRadius
        : undefined,
  };
}

export default function FnbInstantCourier({ tenantSlug }: { tenantSlug: string }) {
  // Kitchen coordinates states
  const [kitchenAddress, setKitchenAddress] = useState<string>('');
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [maxRadiusKm, setMaxRadiusKm] = useState<number>(40);
  const [kitchenHours, setKitchenHours] = useState<string>('08:00 - 20:00 WIB');
  const [instantProvider, setInstantProvider] = useState<string>('INTERNAL_LALAMOVE');
  const [isFnbCatering, setIsFnbCatering] = useState<boolean>(true);

  // Form & Loading states
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Driver Fleet Management states
  const [drivers, setDrivers] = useState<TenantDriver[]>([]);
  const [isLoadingDrivers, setIsLoadingDrivers] = useState<boolean>(false);
  const [newDriverName, setNewDriverName] = useState<string>('');
  const [newDriverPhone, setNewDriverPhone] = useState<string>('');
  const [isAddingDriver, setIsAddingDriver] = useState<boolean>(false);
  const [updatingDriverId, setUpdatingDriverId] = useState<string | null>(null);
  const [driverFeedback, setDriverFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 1. Fetch drivers for this tenant
  const fetchDrivers = useCallback(async () => {
    if (!tenantSlug) return;
    try {
      setIsLoadingDrivers(true);
      const res = await fetch(`/api/v1/tenants/${tenantSlug}/drivers`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && Array.isArray(data.drivers)) {
        setDrivers(data.drivers);
      }
    } catch (err) {
      console.warn('[FnbInstantCourier] Fetch drivers failed:', err);
    } finally {
      setIsLoadingDrivers(false);
    }
  }, [tenantSlug]);

  // 2. Load settings via authenticated server-side config gateway (zero browser anon DB access)
  useEffect(() => {
    let cancelled = false;

    async function loadFnbSettings() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const loaded = await fetchFnbShippingConfig(tenantSlug);
        if (cancelled) return;

        setIsFnbCatering(loaded.isCatering);
        setKitchenAddress(loaded.kitchenAddress);
        setLatitude(loaded.latitude);
        setLongitude(loaded.longitude);
        setMaxRadiusKm(loaded.maxRadiusKm);
        setKitchenHours(loaded.kitchenHours);
        setInstantProvider(loaded.instantProvider);
      } catch (err: any) {
        if (cancelled) return;
        console.warn('[FnbInstantCourier] Load failed:', err);
        setLoadError(
          `Gagal memuat konfigurasi: ${err?.message || 'Terjadi kesalahan jaringan'}.`
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    if (tenantSlug) {
      loadFnbSettings();
      fetchDrivers();
    }

    return () => {
      cancelled = true;
    };
  }, [tenantSlug, fetchDrivers]);

  // 3. Handle save kitchen coordinates via authenticated server-side config gateway
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedFeedback(null);

    const parsedRadius = Number(maxRadiusKm);
    if (!Number.isFinite(parsedRadius) || parsedRadius < 1 || parsedRadius > 60) {
      setSavedFeedback('❌ Gagal menyimpan: Batas radius maksimal harus 1–60 km.');
      return;
    }

    const latStr = latitude.trim();
    const lngStr = longitude.trim();
    const hasLat = latStr.length > 0;
    const hasLng = lngStr.length > 0;

    if (hasLat !== hasLng) {
      setSavedFeedback('❌ Gagal menyimpan: Koordinat latitude dan longitude harus diisi lengkap.');
      return;
    }

    let parsedLat: number | undefined;
    let parsedLng: number | undefined;
    if (hasLat && hasLng) {
      parsedLat = Number(latStr);
      parsedLng = Number(lngStr);
      if (
        !Number.isFinite(parsedLat) ||
        !Number.isFinite(parsedLng) ||
        parsedLat < -90 ||
        parsedLat > 90 ||
        parsedLng < -180 ||
        parsedLng > 180
      ) {
        setSavedFeedback('❌ Gagal menyimpan: Koordinat latitude (-90..90) atau longitude (-180..180) tidak valid.');
        return;
      }
    }

    setIsSaving(true);

    try {
      const saved = await saveFnbShippingConfig({
        tenantSlug,
        isFnbCatering,
        kitchenAddress,
        latitude: parsedLat,
        longitude: parsedLng,
        maxRadiusKm: parsedRadius,
        kitchenHours,
        instantProvider,
      });

      if (saved.kitchenAddress) setKitchenAddress(saved.kitchenAddress);
      if (saved.latitude !== undefined) setLatitude(saved.latitude);
      if (saved.longitude !== undefined) setLongitude(saved.longitude);
      if (saved.maxRadiusKm !== undefined) setMaxRadiusKm(saved.maxRadiusKm);

      setSavedFeedback('✅ Konfigurasi Pengantaran & Titik Dapur berhasil disimpan!');
    } catch (err: any) {
      console.error('[FnbInstantCourier] Save failed:', err);
      setSavedFeedback(
        `❌ Gagal menyimpan: ${err?.message || 'Cek koneksi atau izin akun dan coba lagi.'}`
      );
    } finally {
      setIsSaving(false);
    }
  };

  // 4. Handle Add New Driver
  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newDriverName.trim();
    const cleanPhone = newDriverPhone.trim();

    if (!cleanName || !cleanPhone) {
      setDriverFeedback({ type: 'error', text: 'Nama driver dan nomor WhatsApp wajib diisi.' });
      return;
    }

    setIsAddingDriver(true);
    setDriverFeedback(null);

    try {
      const res = await fetch(`/api/v1/tenants/${tenantSlug}/drivers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName, phone: cleanPhone }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal menambahkan driver.');
      }

      setNewDriverName('');
      setNewDriverPhone('');
      setDriverFeedback({ type: 'success', text: `✅ Driver ${cleanName} berhasil ditambahkan!` });
      await fetchDrivers();
    } catch (err: any) {
      setDriverFeedback({ type: 'error', text: err.message || 'Terjadi kesalahan saat menambahkan driver.' });
    } finally {
      setIsAddingDriver(false);
      setTimeout(() => setDriverFeedback(null), 4000);
    }
  };

  // 5. Handle Toggle Driver Status (Standby <-> Delivering)
  const handleToggleDriverStatus = async (driverId: string, currentStatus: 'standby' | 'delivering') => {
    const nextStatus = currentStatus === 'standby' ? 'delivering' : 'standby';
    setUpdatingDriverId(driverId);

    try {
      const res = await fetch(`/api/v1/tenants/${tenantSlug}/drivers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: driverId, status: nextStatus }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal memperbarui status driver.');
      }

      setDrivers((prev) =>
        prev.map((d) => (d.id === driverId ? { ...d, status: nextStatus } : d))
      );
    } catch (err: any) {
      console.error('[FnbInstantCourier] Toggle status error:', err);
    } finally {
      setUpdatingDriverId(null);
    }
  };

  // 6. Handle Delete Driver
  const handleDeleteDriver = async (driverId: string, driverName: string) => {
    if (!window.confirm(`Yakin ingin menghapus driver "${driverName}" dari armada toko?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/v1/tenants/${tenantSlug}/drivers?id=${driverId}`, {
        method: 'DELETE',
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal menghapus driver.');
      }

      setDrivers((prev) => prev.filter((d) => d.id !== driverId));
      setDriverFeedback({ type: 'success', text: `✅ Driver ${driverName} berhasil dihapus.` });
      setTimeout(() => setDriverFeedback(null), 3000);
    } catch (err: any) {
      setDriverFeedback({ type: 'error', text: err.message || 'Gagal menghapus driver.' });
    }
  };

  const standbyCount = drivers.filter((d) => d.status === 'standby').length;
  const deliveringCount = drivers.filter((d) => d.status === 'delivering').length;

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin text-orange-600" />
        <span>Memuat konfigurasi dapur &amp; armada pengiriman...</span>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* ── HEADER KARTU STATUS LOGISTIK ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold shrink-0 border border-orange-100 dark:border-orange-900/40">
            <Navigation className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
              Pengaturan Kurir Instan &amp; Titik Dapur (F&amp;B Katering)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Koordinat dapur, armada kurir internal toko, dan integrasi mobil Lalamove.
            </p>
          </div>
        </div>
        <span className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80 self-start sm:self-auto flex items-center gap-1.5 shadow-2xs">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>Armada Internal &amp; Lalamove (Mobil) Aktif</span>
        </span>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl text-amber-800 dark:text-amber-200 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* ── FORM KOORDINAT DAPUR & PROVIDER INSTAN ── */}
      <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-orange-600" />
            <span>Alamat Titik Jemput Dapur / Resto (Pick-up Point)</span>
          </label>
          <input
            type="text"
            value={kitchenAddress}
            onChange={(e) => setKitchenAddress(e.target.value)}
            placeholder="Jl. Nama Jalan, No. Rumah, Kecamatan, Kota"
            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-medium focus:bg-white dark:focus:bg-slate-850 focus:outline-none focus:border-orange-600 transition placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-blue-600" />
              <span>Latitude Koordinat Dapur</span>
            </label>
            <input
              type="number"
              step="any"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="Contoh: -7.1171"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-bold font-mono focus:bg-white dark:focus:bg-slate-850 focus:outline-none focus:border-orange-600 transition placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-blue-600" />
              <span>Longitude Koordinat Dapur</span>
            </label>
            <input
              type="number"
              step="any"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="Contoh: 112.5936"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-bold font-mono focus:bg-white dark:focus:bg-slate-850 focus:outline-none focus:border-orange-600 transition placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-indigo-600" />
              <span>Batas Radius Maksimal Pengantaran (KM)</span>
            </label>
            <input
              type="number"
              min={1}
              max={60}
              value={maxRadiusKm}
              onChange={(e) => setMaxRadiusKm(Number(e.target.value))}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-bold font-mono focus:bg-white dark:focus:bg-slate-850 focus:outline-none focus:border-orange-600 transition"
            />
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              Pengantaran di luar radius {maxRadiusKm} km otomatis diarahkan ke mobil Lalamove / Kargo.
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-600" />
              <span>Jam Buka Dapur / Pengantaran</span>
            </label>
            <input
              type="text"
              value={kitchenHours}
              onChange={(e) => setKitchenHours(e.target.value)}
              placeholder="Contoh: 08:00 - 20:00 WIB"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-medium focus:bg-white dark:focus:bg-slate-850 focus:outline-none focus:border-emerald-600 transition"
            />
          </div>
        </div>

        {/* DROPDOWN PROVIDER KURIR INSTAN (BEBAS RODA DUA) */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Alur Logistik &amp; Provider Pengantaran</span>
          </label>
          <select
            value={instantProvider}
            onChange={(e) => setInstantProvider(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-semibold focus:bg-white dark:focus:bg-slate-850 focus:outline-none focus:border-emerald-600 transition cursor-pointer"
          >
            <option value="INTERNAL_LALAMOVE">
              Armada Internal (Prioritas) + Lalamove Fallback (Mobil/Van via Biteship)
            </option>
          </select>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Sistem otomatis mengutamakan driver toko sendiri. Jika seluruh driver sedang bertugas, sistem mengalihkan pesanan ke mobil Lalamove.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 gap-3">
          {savedFeedback ? (
            <span
              role={savedFeedback.startsWith('✅') ? 'status' : 'alert'}
              className={`text-xs font-bold flex items-center gap-1 ${savedFeedback.startsWith('✅') ? 'text-emerald-600' : 'text-rose-600'}`}
            >
              {savedFeedback.startsWith('✅') ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              )}
              {savedFeedback}
            </span>
          ) : (
            <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              💡 Titik koordinat dapur digunakan untuk penjemputan armada internal toko dan penjemputan mobil Lalamove.
            </span>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="ml-auto px-5 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs active:scale-95 shrink-0"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? 'Menyimpan...' : 'Simpan Koordinat Dapur'}</span>
          </button>
        </div>
      </form>

      {/* ── SECTION BARU: MANAJEMEN DRIVER & ARMADA INTERNAL TOKO ── */}
      <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900/60">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                Manajemen Driver &amp; Armada Internal Toko
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kurir internal toko khusus pengantaran hidangan katering dan penjemputan alat makan kotor.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              Total: {drivers.length} Driver ({standbyCount} Standby)
            </span>
          </div>
        </div>

        {/* BANNER INDIKATOR STATUS OTOMATIS */}
        {drivers.length > 0 ? (
          standbyCount > 0 ? (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 flex items-center gap-2.5 text-xs text-emerald-900 dark:text-emerald-200 font-semibold shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                Armada internal siap bertugas — Pengiriman berikutnya ditangani kurir toko ({standbyCount} driver standby).
              </span>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 flex items-center gap-2.5 text-xs text-amber-900 dark:text-amber-200 font-semibold shadow-2xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                Seluruh driver toko sedang di jalan — Pengiriman berikutnya otomatis dialihkan ke Lalamove (Mobil).
              </span>
            </div>
          )
        ) : (
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300 font-medium">
            <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>
              Belum ada driver internal terdaftar. Tambahkan nama &amp; nomor WhatsApp kurir toko di bawah agar pengiriman diprioritaskan ke armada sendiri.
            </span>
          </div>
        )}

        {/* FEEDBACK NOTIFICATION */}
        {driverFeedback && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${driverFeedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
              }`}
          >
            {driverFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{driverFeedback.text}</span>
          </div>
        )}

        {/* FORM TAMBAH DRIVER */}
        <form onSubmit={handleAddDriver} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Tambah Driver Baru</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-5">
              <input
                type="text"
                placeholder="Contoh: Kang Asep"
                value={newDriverName}
                onChange={(e) => setNewDriverName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-600 transition"
              />
            </div>
            <div className="sm:col-span-4">
              <input
                type="text"
                placeholder="0812xxxxxx"
                value={newDriverPhone}
                onChange={(e) => setNewDriverPhone(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-mono placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-600 transition"
              />
            </div>
            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={isAddingDriver}
                className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
              >
                {isAddingDriver ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                <span>+ Tambah Driver</span>
              </button>
            </div>
          </div>
        </form>

        {/* TABEL / DAFTAR DRIVER TOKO */}
        {isLoadingDrivers ? (
          <div className="py-8 flex items-center justify-center gap-2 text-slate-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            <span>Memuat daftar armada driver...</span>
          </div>
        ) : drivers.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-6">
            Belum ada driver internal yang terdaftar. Gunakan formulir di atas untuk mendaftarkan kurir toko Anda.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3.5">Nama Driver</th>
                  <th className="py-2.5 px-3.5">Kontak WhatsApp</th>
                  <th className="py-2.5 px-3.5 text-center">Status Armada</th>
                  <th className="py-2.5 px-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {drivers.map((d) => {
                  const cleanPhoneNum = d.phone.replace(/\D/g, '');
                  const waFormatted = cleanPhoneNum.startsWith('0') ? '62' + cleanPhoneNum.slice(1) : cleanPhoneNum;
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3.5 font-bold text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-black text-[11px] shrink-0 border border-indigo-100 dark:border-indigo-800/60">
                            {d.name.charAt(0).toUpperCase()}
                          </div>
                          <span>{d.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3.5">
                        <a
                          href={`https://wa.me/${waFormatted}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-emerald-700 dark:text-emerald-400 hover:underline font-semibold"
                          title="Buka Chat WhatsApp"
                        >
                          <MessageSquare className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <span>{d.phone}</span>
                        </a>
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleDriverStatus(d.id, d.status)}
                          disabled={updatingDriverId === d.id}
                          className={`inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-lg border transition cursor-pointer active:scale-95 ${d.status === 'standby'
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                            }`}
                          title="Klik untuk mengubah status driver"
                        >
                          {updatingDriverId === d.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : d.status === 'standby' ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          )}
                          <span>{d.status === 'standby' ? 'Standby' : 'Sedang Antar'}</span>
                        </button>
                      </td>
                      <td className="py-3 px-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteDriver(d.id, d.name)}
                          className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 text-xs font-semibold p-1 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                          title="Hapus driver"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
