'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function WorkforceLoginPage() {
  const [slug, setSlug] = useState('apex');
  const [nik, setNik] = useState('OP-4821');
  const [pin, setPin] = useState('123456');
  const [activePreset, setActivePreset] = useState<'sarah' | 'marcus' | 'apex'>('sarah');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleQuickFill(preset: 'sarah' | 'marcus' | 'apex') {
    setActivePreset(preset);
    setError(null);
    setSlug('apex');

    if (preset === 'sarah') {
      setNik('OP-4821');
      setPin('123456');
    } else if (preset === 'marcus') {
      setNik('SUP-1092');
      setPin('901105');
    } else if (preset === 'apex') {
      setNik('partner@apexsecurity.com');
      setPin('998877');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!slug.trim()) {
      setError('Agency / Organization Slug is required.');
      return;
    }
    if (!nik.trim() || nik.trim().length < 4) {
      setError('Officer ID / Email must be valid (at least 4 characters).');
      return;
    }
    if (!pin.trim() || pin.trim().length < 4) {
      setError('PIN must be at least 4 digits.');
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
        setError(data.message || 'Authentication failed. Please verify your credentials.');
        setLoading(false);
        return;
      }

      const roleName =
        data.session?.role === 'master_reseller'
          ? 'Master Reseller'
          : data.session?.role === 'supervisor'
          ? 'Supervisor'
          : 'Field Personnel';

      setSuccess(`Authenticated successfully as ${roleName}! Redirecting to dashboard...`);
      setTimeout(() => {
        window.location.href = '/';
      }, 600);
    } catch {
      setError('Failed to reach BWM authentication server.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto space-y-6">
        <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 shadow-xl space-y-6">
          <div className="text-center">
            <div className="h-14 w-14 mx-auto rounded-2xl bg-blue-600 text-white flex items-center justify-center font-extrabold text-2xl mb-3 shadow-sm">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Workforce Operations Portal</h2>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Field Personnel &amp; Agency Management Access
            </p>
          </div>

          {/* Quick Fill Helper Presets */}
          <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                Quick Fill Demo Accounts:
              </span>
              <span className="text-[10px] text-blue-600 font-medium">1-Click Auto-Fill</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {/* Preset 1: Field Officer */}
              <button
                type="button"
                onClick={() => handleQuickFill('sarah')}
                className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                  activePreset === 'sarah'
                    ? 'bg-blue-50/80 border-blue-500 text-blue-950 font-semibold shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Officer Sarah Jenkins
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Badge: OP-4821 &bull; Metro Financial Tower Hub
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold">
                  Field Ops
                </span>
              </button>

              {/* Preset 2: Branch Supervisor */}
              <button
                type="button"
                onClick={() => handleQuickFill('marcus')}
                className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                  activePreset === 'marcus'
                    ? 'bg-blue-50/80 border-blue-500 text-blue-950 font-semibold shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    Metro Financial Tower Hub
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Supervisor: Marcus Sterling &bull; Badge: SUP-1092
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-bold">
                  Branch Desk
                </span>
              </button>

              {/* Preset 3: Master Reseller */}
              <button
                type="button"
                onClick={() => handleQuickFill('apex')}
                className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                  activePreset === 'apex'
                    ? 'bg-blue-50/80 border-blue-500 text-blue-950 font-semibold shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                    Apex Security Services Ltd
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Partner Account: partner@apexsecurity.com
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-bold">
                  Master Reseller
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
                Agency / Organization Code
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g. apex"
                disabled={loading}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition disabled:opacity-50 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Officer ID / Email Address
              </label>
              <input
                type="text"
                value={nik}
                onChange={(e) => setNik(e.target.value)}
                placeholder="e.g. OP-4821 or partner@apexsecurity.com"
                disabled={loading}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition disabled:opacity-50 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Security PIN / Access Key
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter PIN"
                disabled={loading}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition disabled:opacity-50 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                  <span>Authenticating Officer...</span>
                </>
              ) : (
                'Access Operations Portal'
              )}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100 text-center space-y-2">
            <Link href="/" className="text-xs text-slate-500 hover:text-slate-800 transition font-medium">
              &larr; Back to Platform Overview
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
