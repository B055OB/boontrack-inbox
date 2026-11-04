'use client';

import React, { useState } from 'react';

export default function WorkforceLoginPage() {
  const [slug, setSlug] = useState('satya');
  const [nik, setNik] = useState('3171012345678901');
  const [pin, setPin] = useState('987654');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!slug.trim()) {
      setError('Agency / Org Slug wajib diisi.');
      return;
    }
    if (!nik.trim() || nik.trim().length < 6) {
      setError('NIK harus valid (minimal 6 digit).');
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

      setSuccess('Autentikasi berhasil! Mengalihkan ke dashboard lapangan...');
      setTimeout(() => {
        window.location.href = '/';
      }, 600);
    } catch {
      setError('Gagal menghubungi server autentikasi BWM.');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md w-full mx-auto px-6 py-12 flex-1 flex flex-col justify-center">
      <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-xl space-y-6">
        <div className="text-center">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center font-extrabold text-emerald-600 text-2xl mb-3 shadow-xs">
            86
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Portal Tugas Petugas</h2>
          <p className="text-xs text-slate-500 mt-1">
            Satya Security Guard &bull; Akses Hadir & Patroli Lapangan
          </p>
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
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Kode Badan Usaha / Agency</label>
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
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nomor Induk Kependudukan (NIK)</label>
            <input
              type="text"
              value={nik}
              onChange={(e) => setNik(e.target.value)}
              placeholder="16 digit NIK personel"
              disabled={loading}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white transition disabled:opacity-50 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Kode Akses / PIN Petugas</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="6 digit PIN"
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
