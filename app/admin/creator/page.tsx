'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Users,
  Sparkles,
  Search,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Video,
  Film,
  Globe,
  Shield,
  Eye,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

const MASTER_PIN = '998877';

interface CreatorItem {
  id: string;
  tenant_id: string;
  handle: string;
  bio?: string;
  is_verified?: boolean;
  social_links?: any;
  created_at: string;
  tenant_name?: string;
}

export default function DirectoryCreatorPage() {
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');

  const [creators, setCreators] = useState<CreatorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVerified, setFilterVerified] = useState<'ALL' | 'VERIFIED' | 'UNVERIFIED'>('ALL');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isAuth = sessionStorage.getItem('super_admin_auth') === 'true';
      setIsAdminAuth(isAuth);
    }
  }, []);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPin === MASTER_PIN) {
      sessionStorage.setItem('super_admin_auth', 'true');
      setIsAdminAuth(true);
      setPinError('');
    } else {
      setPinError('PIN Super Admin salah!');
    }
  };

  const fetchCreators = async () => {
    setLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const { data, error } = await supabase
        .from('creator_profiles')
        .select('*, tenants(name, slug)')
        .order('created_at', { ascending: false });

      if (error) {
        // Fallback: If creator_profiles table is empty or error, check tenants with category 'CREATOR'
        const { data: tenantCreators } = await supabase
          .from('tenants')
          .select('id, name, slug, created_at, metadata')
          .ilike('category', '%CREATOR%');

        const fallbackList: CreatorItem[] = (tenantCreators || []).map((t: any) => ({
          id: t.id,
          tenant_id: t.id,
          handle: t.slug,
          bio: t.metadata?.bio || 'Kreator Konten & UGC Studio',
          is_verified: true,
          social_links: t.metadata?.social_links || {},
          created_at: t.created_at,
          tenant_name: t.name,
        }));

        setCreators(fallbackList);
        return;
      }

      const mapped: CreatorItem[] = (data || []).map((c: any) => ({
        id: c.id,
        tenant_id: c.tenant_id,
        handle: c.handle,
        bio: c.bio,
        is_verified: Boolean(c.is_verified),
        social_links: c.social_links || {},
        created_at: c.created_at,
        tenant_name: c.tenants?.name || c.handle,
      }));

      setCreators(mapped);
    } catch (err) {
      console.error('Failed to load creators:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdminAuth) {
      fetchCreators();
    }
  }, [isAdminAuth]);

  // Toggle verification badge
  const handleToggleVerified = async (creator: CreatorItem) => {
    const nextVerified = !creator.is_verified;
    setCreators((prev) =>
      prev.map((c) => (c.id === creator.id ? { ...c, is_verified: nextVerified } : c))
    );

    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase
          .from('creator_profiles')
          .update({ is_verified: nextVerified })
          .eq('id', creator.id);
      }
    } catch (e) {
      console.error('Failed to toggle verification:', e);
      fetchCreators();
    }
  };

  const filteredCreators = creators.filter((c) => {
    const matchesSearch =
      c.handle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.tenant_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.bio || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (filterVerified === 'VERIFIED') return c.is_verified;
    if (filterVerified === 'UNVERIFIED') return !c.is_verified;
    return true;
  });

  const countTotal = creators.length;
  const countVerified = creators.filter((c) => c.is_verified).length;

  if (!isAdminAuth) {
    return (
      <main className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center mx-auto mb-3 font-bold text-xl">
            ✨
          </div>
          <h1 className="text-lg font-bold text-white mb-1">Directory Creator Superadmin</h1>
          <p className="text-xs text-slate-400 mb-5">
            Otorisasi diperlukan untuk mengakses direktori creator profil &amp; portofolio UGC.
          </p>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              placeholder="PIN Super Admin"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              className="w-full text-center tracking-widest px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-pink-500"
              required
            />
            {pinError && <p className="text-[11px] text-rose-400">{pinError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-pink-600/30 cursor-pointer"
            >
              Buka Directory Creator
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100 p-6 md:p-10 antialiased selection:bg-pink-600 selection:text-white">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-850 transition cursor-pointer"
              title="Kembali ke Executive Control Plane"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-pink-500/20 text-pink-400 border border-pink-500/30">
                  Creator Economy Hub
                </span>
                <span className="text-[11px] text-slate-400">&bull; creator.boontrack.com</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  UGC Portfolio Sync
                </span>
              </div>
              <h1 className="text-xl font-black text-white mt-1">Directory Creator &amp; UGC Showcase</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchCreators}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
              title="Refresh Data Creator"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-pink-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Top Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-400">Total Akun Kreator Terdaftar</span>
              <span className="text-2xl font-black text-white mt-1 block">{countTotal}</span>
              <span className="text-[10px] text-slate-500">Kreator &amp; Talenta UGC</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-pink-500/15 text-pink-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-purple-300">Kreator Terverifikasi (Official Badge)</span>
              <span className="text-2xl font-black text-purple-400 mt-1 block">{countVerified}</span>
              <span className="text-[10px] text-purple-400/70">Verified partner badge aktif</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari handle @kreator atau nama..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-500"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilterVerified('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filterVerified === 'ALL' ? 'bg-pink-600 text-white' : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              Semua ({countTotal})
            </button>
            <button
              onClick={() => setFilterVerified('VERIFIED')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filterVerified === 'VERIFIED' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              Verified ({countVerified})
            </button>
          </div>
        </div>

        {/* Creators Table */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-850/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Handle &amp; Identitas</th>
                  <th className="py-3 px-4">Bio &amp; Niche</th>
                  <th className="py-3 px-4">Verifikasi Badge</th>
                  <th className="py-3 px-4 text-right">Aksi Portofolio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-500">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-pink-400" />
                        <span>Memuat direktori kreator...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredCreators.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-500">
                      Belum ada profil creator yang ditemukan.
                    </td>
                  </tr>
                ) : (
                  filteredCreators.map((creator) => (
                    <tr key={creator.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white text-sm flex items-center gap-1.5">
                          <span>@{creator.handle}</span>
                          {creator.is_verified && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-pink-400" />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">{creator.tenant_name}</div>
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate text-slate-300">
                        {creator.bio || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleToggleVerified(creator)}
                          className={`px-3 py-1 rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            creator.is_verified
                              ? 'bg-pink-500/20 border border-pink-500/40 text-pink-300 hover:bg-pink-500/30'
                              : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              creator.is_verified ? 'bg-pink-400' : 'bg-slate-600'
                            }`}
                          />
                          {creator.is_verified ? 'Verified (ON)' : 'Unverified (OFF)'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/creator/${encodeURIComponent(creator.handle)}`}
                            target="_blank"
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-[11px] transition flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Lihat Showcase</span>
                          </Link>
                          <Link
                            href="/creator/ugc-studio"
                            className="px-2.5 py-1.5 rounded-lg bg-pink-600/20 hover:bg-pink-600/30 border border-pink-500/30 text-pink-300 hover:text-white font-medium text-[11px] transition flex items-center gap-1"
                          >
                            <Film className="w-3 h-3" />
                            <span>UGC Studio</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
