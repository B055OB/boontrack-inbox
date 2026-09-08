'use client';

import React, { useState } from 'react';
import { Globe, CheckCircle, Copy, ArrowRight, ShieldCheck, Lock } from 'lucide-react';

interface CustomDomainCardProps {
  tenantSlug: string;
  isTeamScale: boolean;
  initialDomain?: string;
}

export default function CustomDomainCard({ tenantSlug, isTeamScale, initialDomain = '' }: CustomDomainCardProps) {
  const [domain, setDomain] = useState(initialDomain);
  const [savedDomain, setSavedDomain] = useState(initialDomain);
  const [status, setStatus] = useState<string>(initialDomain ? 'ACTIVE' : 'IDLE');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSaveDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim() || loading) return;

    setLoading(true);
    try {
      const res = await fetch('/api/v1/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantSlug, customDomain: domain }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSavedDomain(data.domain);
        setStatus('PENDING_DNS');
      } else {
        alert(data.message || 'Gagal menyimpan domain');
      }
    } catch {
      alert('Terjadi kesalahan koneksi.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (txt: string) => {
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-5 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-slate-900">Custom Domain Sendiri</h3>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                Team Scale
              </span>
            </div>
            <p className="text-xs text-slate-500">Gunakan domain toko Anda sendiri (contoh: order.tokoanda.com)</p>
          </div>
        </div>

        {!isTeamScale && (
          <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-amber-600" /> Terkunci (499k)
          </span>
        )}
      </div>

      {!isTeamScale ? (
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600">
          Tingkatkan langganan Anda ke <strong>Team Scale (499k)</strong> untuk menghubungkan domain mandiri lengkap dengan Auto-SSL Let&apos;s Encrypt gratis.
        </div>
      ) : (
        <form onSubmit={handleSaveDomain} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="order.brandanda.com"
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono focus:bg-white focus:border-purple-600 outline-none"
            />
            <button
              type="submit"
              disabled={loading || !domain.trim()}
              className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
            >
              <span>{loading ? 'Menyimpan...' : 'Hubungkan Domain'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {savedDomain && (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-800">
                <span>Konfigurasi DNS Hostinger / Cloudflare:</span>
                <span className="text-amber-600 text-[11px] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  Menunggu Propagasi DNS
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-white p-3 rounded-xl border border-slate-200 font-mono text-[11px]">
                <div>
                  <span className="text-slate-400 block text-[9px]">TIPE</span>
                  <span className="font-bold text-slate-800">CNAME</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[9px]">NAMA RECORD</span>
                  <span className="font-bold text-slate-800">{savedDomain.split('.')[0] || 'order'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-slate-400 block text-[9px]">TARGET</span>
                    <span className="font-bold text-purple-700">cname.boontrack.com</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard('cname.boontrack.com')}
                    className="text-slate-400 hover:text-purple-600 p-1"
                  >
                    {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Auto-SSL (HTTPS) Let&apos;s Encrypt akan aktif otomatis dalam 10-30 menit setelah CNAME terarah.</span>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
}