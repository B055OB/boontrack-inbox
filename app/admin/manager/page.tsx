'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Users, 
  Search, 
  Store, 
  ExternalLink, 
  MessageSquare, 
  RefreshCw, 
  ArrowLeft,
  Calendar,
  Sliders,
  CheckCircle2
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

interface ManagerMerchant {
  id: string | number;
  tenant_slug: string;
  merchant_name?: string;
  merchant_phone?: string;
  plan_tier?: string;
  status?: string;
  due_date?: string;
  assigned_manager?: string;
}

export default function MerchantManagerDashboard() {
  const [merchants, setMerchants] = useState<ManagerMerchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function fetchManagerData() {
      setLoading(true);
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('shop_subscriptions')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        let list: ManagerMerchant[] = data || [];
        if (!list.some(s => s.tenant_slug === 'yuhu')) {
          list.push({
            id: 'yuhu-1',
            tenant_slug: 'yuhu',
            merchant_name: 'Toko Yuhu Indonesia',
            merchant_phone: '6289876543210',
            plan_tier: 'GROWTH',
            status: 'ACTIVE',
            due_date: '2026-10-01',
            assigned_manager: 'Lead Manager'
          });
        }

        setMerchants(list);
      } catch (err) {
        console.error('Failed fetching manager data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchManagerData();
  }, [refreshKey]);

  const filtered = merchants.filter(m => 
    m.tenant_slug?.toLowerCase().includes(search.toLowerCase()) ||
    m.merchant_name?.toLowerCase().includes(search.toLowerCase()) ||
    m.merchant_phone?.includes(search)
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans antialiased selection:bg-blue-600 selection:text-white">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="space-y-1">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-400 font-semibold mb-2 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Control Plane</span>
            </Link>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                <Users className="w-3 h-3" />
                <span>Account & Merchant Manager Portal</span>
              </span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Directory Merchant Binaan ({merchants.length})
            </h1>
            <p className="text-xs text-slate-400">
              Monitoring toko merchant, follow-up retention langganan, dan direct assistance WhatsApp.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Cari toko / kontak merchant..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-64"
              />
            </div>

            <button
              onClick={() => setRefreshKey(k => k + 1)}
              className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* METRICS STATS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800">
            <span className="text-xs text-slate-400 block">Total Toko Binaan</span>
            <span className="text-2xl font-black text-white mt-1 block">{merchants.length} Toko</span>
          </div>
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800">
            <span className="text-xs text-emerald-400 block">Langganan Aktif</span>
            <span className="text-2xl font-black text-emerald-400 mt-1 block">
              {merchants.filter(m => m.status === 'ACTIVE' || !m.status).length} Toko
            </span>
          </div>
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800">
            <span className="text-xs text-amber-400 block">Jadwal Follow-up Bulan Ini</span>
            <span className="text-2xl font-black text-amber-400 mt-1 block">
              {merchants.length} Toko
            </span>
          </div>
        </div>

        {/* TABEL DATA MERCHANT MANAGER */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Toko & Subdomain</th>
                  <th className="px-6 py-4">Owner & Kontak</th>
                  <th className="px-6 py-4">Tier & Manager In-Charge</th>
                  <th className="px-6 py-4">Status & Jatuh Tempo</th>
                  <th className="px-6 py-4 text-center">Follow-up Langsung</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-500" />
                      <span>Memuat data merchant...</span>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      Tidak ada merchant yang sesuai pencarian.
                    </td>
                  </tr>
                ) : (
                  filtered.map((m) => {
                    const waLink = `https://wa.me/${m.merchant_phone?.replace(/\D/g, '') || ''}?text=${encodeURIComponent(
                      `Halo Kak ${m.merchant_name || ''}, saya Account Manager dari BoonTrack. Mau cek apakah ada kendala dalam pengelolaan toko dan katalog di ${m.tenant_slug}?`
                    )}`;

                    return (
                      <tr key={m.id} className="hover:bg-slate-800/40 transition">
                        <td className="px-6 py-4">
                          <div className="font-bold text-white text-sm capitalize">
                            {m.tenant_slug}
                          </div>
                          <a
                            href={`https://shop.boontrack.com/${m.tenant_slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-mono text-blue-400 hover:underline inline-flex items-center gap-1 mt-0.5"
                          >
                            <span>shop.boontrack.com/{m.tenant_slug}</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                          </a>
                        </td>

                        <td className="px-6 py-4 text-slate-300">
                          <div className="font-semibold text-white">{m.merchant_name || 'Owner Toko'}</div>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                            {m.merchant_phone || '-'}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 block w-fit mb-1">
                            {m.plan_tier || 'GROWTH'}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            PIC: <b className="text-slate-200">{m.assigned_manager || 'Lead Manager'}</b>
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span>{m.status || 'ACTIVE'}</span>
                          </span>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            <span>{m.due_date || '30 Hari Lagi'}</span>
                          </div>
                        </td>

                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition active:scale-95 cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Chat WA</span>
                            </a>
                            <a
                              href={`https://shop.boontrack.com/${m.tenant_slug}/dashboard`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold inline-flex items-center gap-1 border border-slate-700 transition cursor-pointer"
                              title="Panel Merchant"
                            >
                              <Sliders className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
  );
}