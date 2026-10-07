'use client';

import React, { useState } from 'react';
import {
  Phone,
  Lock,
  Headphones,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export interface DirectCsLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  onSuccess?: (csUser: { name: string; phone: string; role: string }) => void;
}

export default function DirectCsLoginModal({
  isOpen,
  onClose,
  tenantSlug,
  onSuccess,
}: DirectCsLoginModalProps) {
  const [csPhone, setCsPhone] = useState('');
  const [tenantPin, setTenantPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!csPhone.trim()) {
      setErrorMsg('Nomor WhatsApp CS wajib diisi.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/v1/auth/cs-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug,
          phone: csPhone.trim(),
          pin: tenantPin.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Gagal login sebagai CS. Periksa nomor WA dan PIN.');
        setIsLoading(false);
        return;
      }

      // Persist session to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('cs_user_name', data.cs.name);
        localStorage.setItem('cs_user_phone', data.cs.phone);
        localStorage.setItem('cs_role', data.cs.role);
        localStorage.setItem('merchant_store', tenantSlug);
        localStorage.setItem('cs_login_at', new Date().toISOString());
      }

      setSuccessMsg(`✅ Login berhasil! Selamat bertugas, ${data.cs.name}.`);

      if (onSuccess) {
        onSuccess(data.cs);
      }

      setTimeout(() => {
        onClose();
        // Optional soft reload or state update
      }, 1200);
    } catch {
      setErrorMsg('Terjadi kendala koneksi ke server. Silakan coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200 text-left">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <Headphones className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-base font-black text-slate-900">Login Direct CS</h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black tracking-wide flex items-center gap-1">
                <Zap className="w-2.5 h-2.5 fill-emerald-600" />
                Bypass Magic Link
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Masuk langsung ke Smart Chatbox Console toko <strong>{tenantSlug}</strong> tanpa verifikasi email.
            </p>
          </div>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && (
          <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Nomor WhatsApp CS <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                required
                value={csPhone}
                onChange={(e) => setCsPhone(e.target.value)}
                placeholder="Contoh: 085715414744 atau 081234567890"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 bg-slate-50 focus:bg-white"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Pastikan nomor WA telah didaftarkan pada daftar tim CS oleh pemilik toko.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              PIN Tenant / Toko
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={tenantPin}
                onChange={(e) => setTenantPin(e.target.value)}
                placeholder="Masukkan PIN toko jika dilindungi"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 bg-slate-50 focus:bg-white"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Kosongkan jika toko belum mengatur proteksi PIN.
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-indigo-50/50 border border-indigo-100 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-indigo-900 leading-tight">
              <strong>Akses Langsung:</strong> Sesi CS akan aktif secara otomatis pada browser ini tanpa perlu menunggu konfirmasi email magic link.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Memverifikasi...</span>
                </>
              ) : (
                <>
                  <Headphones className="w-3.5 h-3.5" />
                  <span>Masuk sebagai CS</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
