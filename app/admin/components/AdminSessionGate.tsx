'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck, Lock, LogIn } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { adminFetch } from '@/lib/auth/admin-client';

interface AdminSessionGateProps {
  title?: string;
  subtitle?: string;
  onAuthenticated: () => void;
}

export default function AdminSessionGate({
  title = 'Super Admin Control Plane',
  subtitle = 'Masuk menggunakan akun Super Admin resmi (Supabase Auth).',
  onAuthenticated,
}: AdminSessionGateProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      try {
        const res = await adminFetch('/api/v1/admin/session');
        if (active && res.ok) {
          onAuthenticated();
          return;
        }
      } catch {
        // Require interactive login
      } finally {
        if (active) setChecking(false);
      }
    };
    checkSession();
    return () => {
      active = false;
    };
  }, [onAuthenticated]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');

    try {
      const supabase = getSupabase();
      if (!supabase) {
        setErrorMsg('Layanan autentikasi tidak tersedia.');
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data?.session?.access_token) {
        setErrorMsg(error?.message || 'Kredensial Super Admin tidak valid.');
        return;
      }

      const verifyRes = await fetch('/api/v1/admin/session', {
        method: 'GET',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
      });

      if (!verifyRes.ok) {
        const errPayload = await verifyRes.json().catch(() => ({}));
        await supabase.auth.signOut();
        setErrorMsg(errPayload?.message || 'Akun ini tidak memiliki role SUPERADMIN.');
        return;
      }

      onAuthenticated();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Terjadi kesalahan saat memverifikasi sesi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-500/10">
          {checking ? <Lock className="w-6 h-6 animate-pulse" /> : <ShieldCheck className="w-6 h-6" />}
        </div>
        <h1 className="text-lg font-bold text-white mb-1">{title}</h1>
        <p className="text-xs text-slate-400 mb-5">
          {checking ? 'Memverifikasi sesi Super Admin...' : subtitle}
        </p>

        {!checking && (
          <form onSubmit={handleSignIn} className="space-y-3 text-left">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Email Super Admin
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@boontrack.com"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Kata Sandi
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
            {errorMsg && <p className="text-[11px] text-rose-400">{errorMsg}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              {submitting ? 'Memverifikasi...' : 'Masuk Super Admin'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

