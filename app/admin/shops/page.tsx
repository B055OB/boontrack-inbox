'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Store, Search, ExternalLink, Sliders, RefreshCw, CheckCircle2, ShieldAlert } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

export default function SuperAdminShopDirectory() {
  const [shops, setShops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchShops() {
      setLoading(true);
      const supabase = getSupabase();
      const { data } = await supabase
        .from('shop_subscriptions')
        .select('*')
        .order('created_at', { ascending: false });

      setShops(data || []);
      setLoading(false);
    }
    fetchShops();
  }, []);

  const filteredShops = shops.filter((s) =>
    s.tenant_slug?.toLowerCase().includes(search.toLowerCase()) ||
    s.merchant_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">
              Super Admin Directory
            </span>
            <h1 className="text-2xl font-black text-white mt-2">BoonTrack SaaS Merchants</h1>
            <p className="text-xs text-slate-400 mt-1">Daftar seluruh toko merchant aktif, tier paket, dan billing Xendit.</p>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari toko / nama pemilik..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-64"
            />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">Toko Merchant</th>
                <th className="px-6 py-4">Pemilik & Kontak</th>
                <th className="px-6 py-4">Plan Tier</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-center">Aksi Langsung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">Mengambil database merchant...</td></tr>
              ) : filteredShops.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">Belum ada merchant yang mendaftar.</td></tr>
              ) : (
                filteredShops.map((shop) => (
                  <tr key={shop.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-6 py-4 font-bold text-white">
                      <div>{shop.tenant_slug}</div>
                      <span className="text-[10px] font-mono text-slate-500 font-normal">shop.boontrack.com/{shop.tenant_slug}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      <div>{shop.merchant_name || '-'}</div>
                      <div className="text-[11px] font-mono text-slate-500">{shop.merchant_phone || '-'}</div>
                    </td>
                    <td className="px-6 py-4 uppercase font-bold text-blue-400 text-[11px]">{shop.plan_tier || 'STARTER'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        shop.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {shop.status || 'ACTIVE'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center space-x-2">
                      <a
                        href={`/${shop.tenant_slug}`}
                        target="_blank"
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] inline-flex items-center gap-1 font-semibold"
                      >
                        <Store className="w-3 h-3" /> Etalase
                      </a>
                      <a
                        href={`/${shop.tenant_slug}/dashboard`}
                        target="_blank"
                        className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-[11px] inline-flex items-center gap-1 font-semibold"
                      >
                        <Sliders className="w-3 h-3" /> Panel Merchant
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}