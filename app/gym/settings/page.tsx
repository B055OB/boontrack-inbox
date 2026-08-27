'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  Receipt,
  DoorOpen,
  CheckCircle2,
  Save,
  Clock,
  QrCode,
  Sparkles,
} from 'lucide-react';
import { GymSettings, getGymSettings, updateGymSettings } from '@/lib/gym-api';

export default function GymSettingsPage() {
  const [settings, setSettings] = useState<GymSettings>({
    gym_name: 'Atmosfitnes Hub Pusat',
    address: 'Jl. Ahmad Yani No. 88, Kota Baru',
    phone: '0812-3456-7890',
    email: 'admin@atmosfitnes.com',
    logo_url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200&h=200&fit=crop',
    qris_base_url: 'https://api.boontrack.com/qris/atmosfitnes',
    auto_billing_enabled: true,
    billing_cycle_day: 1,
    grace_period_days: 3,
    door_access_mode: '24_HOURS',
    operating_hours: {
      open: '06:00',
      close: '23:00',
    },
  });
  const [saving, setSaving] = useState(false);
  const [saveAlert, setSaveAlert] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchInitial = async () => {
      try {
        const data = await getGymSettings('atmosfitnes');
        if (isMounted) {
          setSettings(data);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchInitial();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveAlert(null);

    const res = await updateGymSettings(settings, 'atmosfitnes');
    setSaving(false);

    if (res.success) {
      setSaveAlert(res.message);
      setTimeout(() => setSaveAlert(null), 3000);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 max-w-4xl">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Pengaturan Sistem & Tenant Gym
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs font-bold border border-slate-700 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              Tenant Config
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Konfigurasi profil usaha, aturan auto-billing, toleransi masa tenggang, dan jam operasional turnstile gate.
          </p>
        </div>
      </div>

      {saveAlert && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-semibold">{saveAlert}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Informasi Gym */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Building2 className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-base text-white">Informasi & Profil Gym</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Nama Gym</label>
              <input
                type="text"
                value={settings.gym_name}
                onChange={(e) => setSettings({ ...settings, gym_name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">No. Telepon / Hotline</label>
              <input
                type="text"
                value={settings.phone}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-white focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Email Administrasi</label>
              <input
                type="email"
                value={settings.email}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">URL Endpoint QRIS</label>
              <div className="relative">
                <input
                  type="text"
                  value={settings.qris_base_url}
                  onChange={(e) => setSettings({ ...settings, qris_base_url: e.target.value })}
                  className="w-full pl-3 pr-8 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-white focus:outline-none font-mono"
                />
                <QrCode className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Alamat Lengkap</label>
            <input
              type="text"
              value={settings.address}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-white focus:outline-none"
            />
          </div>
        </div>

        {/* Section 2: Billing & Auto Invoicing Rules */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Receipt className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-base text-white">Aturan Billing & Penagihan Otomatis</h3>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
            <div>
              <p className="font-bold text-xs text-white">Auto Billing Generator</p>
              <p className="text-[11px] text-slate-400">
                Otomatis generate invoice perpanjangan 7 hari sebelum masa aktif member berakhir.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setSettings({ ...settings, auto_billing_enabled: !settings.auto_billing_enabled })
              }
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                settings.auto_billing_enabled ? 'bg-emerald-600' : 'bg-slate-800'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                  settings.auto_billing_enabled ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Tanggal Siklus Billing (Hari ke-)
              </label>
              <input
                type="number"
                min={1}
                max={28}
                value={settings.billing_cycle_day}
                onChange={(e) => setSettings({ ...settings, billing_cycle_day: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Masa Tenggang Akses (Grace Period - Hari)
              </label>
              <input
                type="number"
                min={0}
                max={14}
                value={settings.grace_period_days}
                onChange={(e) => setSettings({ ...settings, grace_period_days: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-white focus:outline-none"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Member tetap dapat tap gate hingga toleransi hari tenggang terlewati.
              </p>
            </div>
          </div>
        </div>

        {/* Section 3: Hardware Door Access Mode */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <DoorOpen className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-base text-white">Mode Otorisasi Gate & Jam Operasional</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSettings({ ...settings, door_access_mode: '24_HOURS' })}
              className={`p-4 rounded-xl border text-left transition cursor-pointer ${
                settings.door_access_mode === '24_HOURS'
                  ? 'bg-emerald-500/20 border-emerald-500 text-white'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              <p className="font-bold text-xs">Akses 24 Jam Non-Stop</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Member aktif dapat tap gate reader kapan saja sepanjang hari.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSettings({ ...settings, door_access_mode: 'SCHEDULED' })}
              className={`p-4 rounded-xl border text-left transition cursor-pointer ${
                settings.door_access_mode === 'SCHEDULED'
                  ? 'bg-emerald-500/20 border-emerald-500 text-white'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              <p className="font-bold text-xs">Akses Terjadwal (Operating Hours)</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Gate reader hanya mengizinkan tap pada rentang jam operasional gym.
              </p>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Jam Buka Gym</label>
              <div className="relative">
                <input
                  type="text"
                  value={settings.operating_hours.open}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      operating_hours: { ...settings.operating_hours, open: e.target.value },
                    })
                  }
                  className="w-full pl-3 pr-8 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-white focus:outline-none"
                />
                <Clock className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Jam Tutup Gym</label>
              <div className="relative">
                <input
                  type="text"
                  value={settings.operating_hours.close}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      operating_hours: { ...settings.operating_hours, close: e.target.value },
                    })
                  }
                  className="w-full pl-3 pr-8 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-white focus:outline-none"
                />
                <Clock className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          </div>
        </div>

        {/* Action Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-lg shadow-emerald-950 transition cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Perubahan Pengaturan'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
