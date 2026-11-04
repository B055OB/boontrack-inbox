'use client';

import React, { useState } from 'react';

export default function WorkforceLoginPage() {
  const [slug, setSlug] = useState('satya');
  const [nik, setNik] = useState('248.0112.28');
  const [pin, setPin] = useState('123456');
  const [activePreset, setActivePreset] = useState<'cindy' | 'bambang' | 'hendra'>('cindy');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleQuickFill(preset: 'cindy' | 'bambang' | 'hendra') {
    setActivePreset(preset);
    setError(null);
    setSlug('satya');

    if (preset === 'cindy') {
      setNik('248.0112.28');
      setPin('123456');
    } else if (preset === 'bambang') {
      setNik('248.0101.05');
      setPin('901105');
    } else if (preset === 'hendra') {
      setNik('hendra.ops@satya.id');
      setPin('998877');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!slug.trim()) {
      setError('Agency / Org Slug wajib diisi.');
      return;
    }
    if (!nik.trim() || nik.trim().length < 4) {
      setError('NIP / NIK / Email harus valid (minimal 4 karakter).');
      return;
    }
    if (!pin.trim() || pin.trim().length < 4) {
      setError('PIN minimal 4 digit.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ slug, nik, pin }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal melakukan login. Periksa kembali kredensial Anda.');
        setLoading(false);
        return;
      }

      const roleName =
        data.session?.role === 'master_reseller'
          ? 'Master Reseller'
          : data.session?.role === 'supervisor'
          ? 'Supervisor'
          : 'Personel Lapangan';

      setSuccess(`Autentikasi berhasil sebagai ${roleName}! Mengalihkan ke dashboard...`);
      setTimeout(() => {
        window.location.href = '/';
      }, 600);
    } catch {
      setError('Gagal menghubungi server autentikasi BWM.');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md w-full mx-auto px-4 py-8 sm:px-6 sm:py-12 flex-1 flex flex-col justify-center">
      <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 shadow-xl space-y-6">
        <div className="text-center">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center font-extrabold text-emerald-600 text-2xl mb-3 shadow-xs">
            86
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Portal Tugas Petugas</h2>
          <p className="text-xs text-slate-500 mt-1">
            Satya Security Guard &bull; Akses Hadir & Patroli Lapangan
          </p>
        </div>

        {/* Quick Fill Helper Presets */}
        <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Quick Fill Demo Akun:
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Klik 1-tombol</span>
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <button
              type="button"
              onClick={() => handleQuickFill('cindy')}
              className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                activePreset === 'cindy'
                  ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950 font-semibold shadow-xs'
                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              <div>
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Demo Personel: Cindy
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  NIP: 248.0112.28 &bull; PIN: 123456
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold">
                Field Ops
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickFill('bambang')}
              className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                activePreset === 'bambang'
                  ? 'bg-blue-50/80 border-blue-400 text-blue-950 font-semibold shadow-xs'
                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              <div>
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Demo Supervisor: Bambang
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  NIP: 248.0101.05 &bull; PIN: 901105
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold">
                Branch Desk
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickFill('hendra')}
              className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                activePreset === 'hendra'
                  ? 'bg-purple-50/80 border-purple-400 text-purple-950 font-semibold shadow-xs'
                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              <div>
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  Demo Reseller: Hendra Ops
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Email: hendra.ops@satya.id &bull; PIN: 998877
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-bold">
                BUJP Partner
              </span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <span className="font-bold text-base">&times;</span>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
            <span className="font-bold text-base">&check;</span>
            <span>{success}</span>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Kode Badan Usaha / Agency
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. satya"
              disabled={loading}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white transition disabled:opacity-50 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              NIP / NIK / Email Akun
            </label>
            <input
              type="text"
              value={nik}
              onChange={(e) => setNik(e.target.value)}
              placeholder="e.g. 248.0112.28 atau hendra.ops@satya.id"
              disabled={loading}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white transition disabled:opacity-50 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Kode Akses / PIN Petugas
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN 6 digit"
              disabled={loading}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white transition disabled:opacity-50 font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-600/30 transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                <span>Memverifikasi Petugas...</span>
              </>
            ) : (
              'Masuk ke Panel Tugas'
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-100 text-center space-y-2">
          <a href="/" className="text-xs text-slate-500 hover:text-slate-800 transition font-medium">
            &larr; Kembali ke Beranda Aplikasi
          </a>
        </div>
      </div>
    </div>
  );
}
