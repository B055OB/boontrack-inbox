'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  Search,
  Plus,
  ArrowLeft,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  MessageCircle,
  TrendingUp,
  MapPin,
  Building2,
  CheckCircle2,
  AlertCircle,
  X,
  Store,
} from 'lucide-react';

interface SubAffiliateBrief {
  id: string;
  name: string;
  referral_code: string;
  region: string;
  status: string;
}

interface AffiliateManager {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  referral_code: string;
  region: string;
  role: string;
  status: string;
  commission_rate: number;
  sub_affiliates_count: number;
  sub_affiliates: SubAffiliateBrief[];
  total_tenants_brought: number;
  total_pipeline_omzet: number;
  created_at: string;
}

const REGION_PRESETS = [
  'ID-NATIONAL',
  'Jawa Barat (Jabar)',
  'Jawa Tengah & DIY',
  'Jawa Timur (Jatim)',
  'Jabodetabek',
  'Sumatera',
  'Kalimantan',
  'Sulawesi & Indonesia Timur',
  'Luar Negeri (International)',
];

export default function AdminAffiliateManagersPage() {
  const [managers, setManagers] = useState<AffiliateManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState('');

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRefCode, setFormRefCode] = useState('');
  const [formRegion, setFormRegion] = useState('ID-NATIONAL');

  const fetchAMs = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/v1/admin/affiliates/am', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.detail || 'Gagal mengambil data Affiliate Manager.');
      }
      setManagers(json.data || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAMs();
  }, [fetchAMs]);

  const handleOpenModal = () => {
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormRefCode('');
    setFormRegion('ID-NATIONAL');
    setModalError('');
    setModalSuccess('');
    setIsModalOpen(true);
  };

  const handleSubmitNewAM = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setModalSuccess('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/v1/admin/affiliates/am', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          email: formEmail,
          phone: formPhone,
          referral_code: formRefCode,
          region: formRegion,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.detail || 'Gagal membuat Affiliate Manager.');
      }

      setModalSuccess(json.message || 'Affiliate Manager berhasil ditambahkan!');
      await fetchAMs();
      setTimeout(() => {
        setIsModalOpen(false);
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengirim formulir.';
      setModalError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredManagers = managers.filter((m) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.referral_code.toLowerCase().includes(q) ||
      (m.email && m.email.toLowerCase().includes(q)) ||
      m.phone.includes(q) ||
      m.region.toLowerCase().includes(q)
    );
  });

  const totalDownlineMitra = managers.reduce((acc, m) => acc + m.sub_affiliates_count, 0);
  const totalPipelineAll = managers.reduce((acc, m) => acc + m.total_pipeline_omzet, 0);
  const totalTenantsAll = managers.reduce((acc, m) => acc + m.total_tenants_brought, 0);

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100 p-4 sm:p-6 md:p-10 font-sans antialiased selection:bg-indigo-600 selection:text-white">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── HEADER NAVIGATION ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="space-y-1">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-400 font-semibold mb-2 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Control Plane</span>
            </Link>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span>Multi-Tier AM Control Plane</span>
              </span>
              <span className="text-xs text-slate-500">&bull; Single Source of Truth: Supabase</span>
            </div>

            <h1 className="text-2xl font-black text-white tracking-tight">
              Manajemen Affiliate Manager (AM) &amp; Downline Network
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Direktori pengawasan master Affiliate Manager regional dan total jaringan sub-affiliate di bawah naungannya.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => fetchAMs()}
              className="p-2.5 bg-slate-900 hover:bg-slate-850 text-slate-300 rounded-xl border border-slate-800 transition cursor-pointer"
              title="Segarkan Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>

            <button
              onClick={handleOpenModal}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Affiliate Manager (AM) Baru</span>
            </button>
          </div>
        </div>

        {/* ── METRICS STATS BAR ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
            <span className="text-xs text-slate-400 flex items-center justify-between">
              <span>Total Affiliate Manager (AM)</span>
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
            </span>
            <span className="text-2xl font-black text-white block">{managers.length} AM</span>
            <span className="text-[11px] text-slate-500">Master pengawas teritori</span>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
            <span className="text-xs text-slate-400 flex items-center justify-between">
              <span>Total Sub-Affiliate Mitra</span>
              <Users className="w-4 h-4 text-blue-400" />
            </span>
            <span className="text-2xl font-black text-blue-400 block">{totalDownlineMitra} Mitra</span>
            <span className="text-[11px] text-slate-500">Downline aktif terdistribusi</span>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
            <span className="text-xs text-slate-400 flex items-center justify-between">
              <span>Total Toko Binaan Jaringan</span>
              <Store className="w-4 h-4 text-emerald-400" />
            </span>
            <span className="text-2xl font-black text-emerald-400 block">{totalTenantsAll} Toko</span>
            <span className="text-[11px] text-slate-500">Trial &amp; Berlangganan</span>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-indigo-500/30 space-y-1">
            <span className="text-xs text-indigo-300 flex items-center justify-between font-semibold">
              <span>Pipeline Omzet Jaringan</span>
              <TrendingUp className="w-4 h-4 text-indigo-400" />
            </span>
            <span className="text-xl sm:text-2xl font-black text-indigo-300 block">
              Rp {totalPipelineAll.toLocaleString('id-ID')}
            </span>
            <span className="text-[11px] text-slate-500">Omzet bulanan teragregasi</span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ── SEARCH BAR ── */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Cari nama AM, kode referral, email, WhatsApp, atau wilayah regional..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* ── AM DIRECTORY TABLE ── */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <span>Daftar Affiliate Manager &amp; Struktur Downline ({filteredManagers.length})</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Setiap AM membawahi jaringan sub-affiliate di regionalnya dan menerima agregasi omzet otomatis.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800/80">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                  <th className="p-3.5 font-bold uppercase text-[10px]">Affiliate Manager (AM)</th>
                  <th className="p-3.5 font-bold uppercase text-[10px]">Kode Referral AM</th>
                  <th className="p-3.5 font-bold uppercase text-[10px]">Cakupan Regional</th>
                  <th className="p-3.5 font-bold uppercase text-[10px]">Jaringan Sub-Affiliate</th>
                  <th className="p-3.5 font-bold uppercase text-[10px]">Toko &amp; Pipeline</th>
                  <th className="p-3.5 font-bold uppercase text-[10px] text-right">Kontak WA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredManagers.length > 0 ? (
                  filteredManagers.map((am) => {
                    const cleanPhone = (am.phone || '').replace(/\D/g, '').replace(/^0/, '62');
                    const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Halo ${am.name}! Salam dari Superadmin BoonTrack.`)}`;

                    return (
                      <tr key={am.id} className="hover:bg-slate-800/40 transition">
                        {/* AM Profile */}
                        <td className="p-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-500 text-white font-black text-xs flex items-center justify-center uppercase shrink-0 shadow-sm">
                              {am.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-white flex items-center gap-1.5">
                                <span>{am.name}</span>
                                {am.referral_code === 'buzzerukm' && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    MASTER AM
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5">{am.email || 'Email belum diatur'}</div>
                            </div>
                          </div>
                        </td>

                        {/* Referral Code */}
                        <td className="p-3.5">
                          <span className="px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-mono font-bold text-xs">
                            {am.referral_code}
                          </span>
                        </td>

                        {/* Regional */}
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[10px] border border-slate-700 flex items-center gap-1 w-fit">
                            <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                            <span>{am.region}</span>
                          </span>
                        </td>

                        {/* Sub-affiliate Network List */}
                        <td className="p-3.5">
                          <div>
                            <span className="font-bold text-white text-xs">
                              {am.sub_affiliates_count} Sub-Mitra
                            </span>
                            {am.sub_affiliates.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5 max-w-xs">
                                {am.sub_affiliates.map((s) => (
                                  <span
                                    key={s.id}
                                    className="px-2 py-0.5 rounded-md bg-slate-950 text-slate-300 font-mono text-[10px] border border-slate-800"
                                    title={`Mitra: ${s.name} (${s.referral_code})`}
                                  >
                                    {s.name} ({s.referral_code})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Tenants & Pipeline */}
                        <td className="p-3.5 whitespace-nowrap">
                          <div className="text-white font-bold text-xs">{am.total_tenants_brought} Toko Binaan</div>
                          <div className="text-indigo-400 font-mono font-bold text-[11px] mt-0.5">
                            Rp {am.total_pipeline_omzet.toLocaleString('id-ID')}
                          </div>
                        </td>

                        {/* Action CTA */}
                        <td className="p-3.5 text-right whitespace-nowrap">
                          {am.phone && am.phone !== '-' ? (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs inline-flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>WhatsApp</span>
                            </a>
                          ) : (
                            <span className="text-[10px] text-slate-500 italic">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500 space-y-2">
                      <ShieldCheck className="w-8 h-8 text-slate-600 mx-auto" />
                      <div className="font-bold text-slate-300 text-xs">Belum Ada Affiliate Manager Terdaftar</div>
                      <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                        Gunakan tombol di atas untuk menambahkan Affiliate Manager regional baru.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── MODAL TAMBAH AFFILIATE MANAGER (AM) BARU ── */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 relative">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-500/15 rounded-xl text-indigo-400 border border-indigo-500/30">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Tambah Affiliate Manager (AM) Baru</h3>
                    <p className="text-[11px] text-slate-400">Pendaftaran master AM regional BoonTrack</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {modalError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {modalSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{modalSuccess}</span>
                </div>
              )}

              <form onSubmit={handleSubmitNewAM} className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Nama Lengkap AM *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Budi Santoso"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Email AM *</label>
                  <input
                    type="email"
                    required
                    placeholder="Contoh: budi.am@boontrack.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Nomor WhatsApp *</label>
                  <input
                    type="tel"
                    required
                    placeholder="Contoh: 081234567890"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Kode Referral Unik AM *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: budiam atau jabarboost"
                    value={formRefCode}
                    onChange={(e) => setFormRefCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-indigo-300 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Hanya huruf kecil, angka, dan strip/garis bawah.</span>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Regional / Cakupan Wilayah *</label>
                  <select
                    value={formRegion}
                    onChange={(e) => setFormRegion(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {REGION_PRESETS.map((reg) => (
                      <option key={reg} value={reg}>
                        {reg}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Batal
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl transition shadow-lg shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>Simpan Affiliate Manager</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
