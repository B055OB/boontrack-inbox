'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  category?: 'internal' | 'external' | string;
  status: string;
  start_date: string | null;
  due_date: string | null;
  access_username?: string;
  access_password?: string;
  monthly_fee?: number;
  message_count?: number;
}

// Default slug internal BoonTrack
const INTERNAL_SLUGS = [
  'boontrack-holding',
  'boontrack-career',
  'boontrack-kurir',
  'boontrack-bola',
  'boontrack-loker',
  'boontrack-digicorn',
];

// PIN Admin Master (Default: 998877)
const MASTER_PIN = '998877';

export default function SuperAdminDashboard() {
  const [isAdminAuth, setIsAdminAuth] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('super_admin_auth') === 'true';
    }
    return false;
  });
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'internal' | 'external'>('all');
  const [refreshKey, setRefreshKey] = useState(0);

  // Form Tambah Tenant
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newCategory, setNewCategory] = useState<'internal' | 'external'>('external');
  const [newUser, setNewUser] = useState('admin');
  const [newPass, setNewPass] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newFee, setNewFee] = useState(0);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPin === MASTER_PIN) {
      setIsAdminAuth(true);
      sessionStorage.setItem('super_admin_auth', 'true');
      setPinError('');
    } else {
      setPinError('PIN Super Admin salah!');
    }
  };

  useEffect(() => {
    let ignore = false;

    async function loadTenants() {
      if (!isAdminAuth) return;
      try {
        const supabase = getSupabase();

        const { data: tenantsData, error } = await supabase
          .from('tenants')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (ignore) return;

        // Hitung pemakaian pesan per tenant
        const { data: messagesData } = await supabase
          .from('messages')
          .select('tenant_id');

        if (ignore) return;

        const countMap: Record<string, number> = {};
        messagesData?.forEach((m: { tenant_id?: string | null }) => {
          if (m.tenant_id) {
            countMap[m.tenant_id] = (countMap[m.tenant_id] || 0) + 1;
          }
        });

        const rawTenants = (tenantsData || []) as Tenant[];
        const mapped = rawTenants.map((t) => {
          // Fallback otomatis kategori internal/external jika kolom category di db belum terisi
          const isInternal = t.category === 'internal' || INTERNAL_SLUGS.includes(t.slug) || t.slug.startsWith('boontrack-');
          return {
            ...t,
            category: isInternal ? 'internal' : 'external',
            message_count: countMap[t.id] || countMap[t.slug] || 0,
          };
        });

        setTenants(mapped);
      } catch (err: unknown) {
        console.error('Error fetching tenants:', err);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadTenants();

    return () => {
      ignore = true;
    };
  }, [isAdminAuth, refreshKey]);

  // Toggle ON / OFF Status Layanan
  const toggleTenantStatus = async (tenant: Tenant) => {
    const nextStatus = tenant.status === 'active' ? 'suspended' : 'active';
    const supabase = getSupabase();

    const { error } = await supabase
      .from('tenants')
      .update({ status: nextStatus })
      .eq('id', tenant.id);

    if (!error) {
      setTenants((prev) =>
        prev.map((t) => (t.id === tenant.id ? { ...t, status: nextStatus } : t))
      );
    }
  };

  // Tambah Tenant Baru
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from('tenants').insert({
        name: newName,
        slug: newSlug.toLowerCase().trim().replace(/\s+/g, '-'),
        category: newCategory,
        access_username: newUser,
        access_password: newPass,
        due_date: newDueDate || null,
        monthly_fee: newFee,
        status: 'active',
      });

      if (error) throw error;

      setShowAddModal(false);
      setNewName('');
      setNewSlug('');
      setNewPass('');
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert('Gagal menambah tenant: ' + errorMsg);
    }
  };

  // Filter List sesuai Tab
  const filteredTenants = tenants.filter((t) => {
    if (activeTab === 'internal') return t.category === 'internal';
    if (activeTab === 'external') return t.category === 'external';
    return true;
  });

  const countInternal = tenants.filter(t => t.category === 'internal').length;
  const countExternal = tenants.filter(t => t.category === 'external').length;

  if (!isAdminAuth) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-3 font-bold text-xl">
            ⚡
          </div>
          <h1 className="text-lg font-bold text-white mb-1">BoonTrack Super Admin</h1>
          <p className="text-xs text-slate-400 mb-5">Masukkan PIN Master untuk mengontrol workspace internal dan klien B2B.</p>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              placeholder="PIN Super Admin (default: 998877)"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              className="w-full text-center tracking-widest px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-rose-500"
              required
            />
            {pinError && <p className="text-[11px] text-rose-400">{pinError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition"
            >
              Buka Master Control
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header Super Admin */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-800/60 border border-slate-700/60 p-6 rounded-2xl backdrop-blur-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded">
                Master Control
              </span>
              <h1 className="text-xl font-bold text-white">BoonTrack Enterprise Workspace Manager</h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Monitoring alur chat multi-channel, kontrol billing langganan, dan pemisahan lini internal vs eksternal.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-xs font-semibold rounded-xl transition shadow-lg shadow-blue-600/30"
            >
              + Tambah Workspace Baru
            </button>
            <button
              onClick={() => {
                sessionStorage.removeItem('super_admin_auth');
                setIsAdminAuth(false);
              }}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-xs text-slate-300 rounded-xl transition"
            >
              Kunci
            </button>
          </div>
        </div>

        {/* Tab Switcher: Internal vs External */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'all'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            Semua Workspace ({tenants.length})
          </button>
          <button
            onClick={() => setActiveTab('internal')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1.5 ${
              activeTab === 'internal'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            Internal Ecosystem ({countInternal})
          </button>
          <button
            onClick={() => setActiveTab('external')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition inline-flex items-center gap-1.5 ${
              activeTab === 'external'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            External B2B Clients ({countExternal})
          </button>
        </div>

        {/* Tabel Tenant */}
        <div className="bg-slate-800/80 border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                <tr>
                  <th className="px-6 py-4">Workspace & Kategori</th>
                  <th className="px-6 py-4">Kredensial Login</th>
                  <th className="px-6 py-4">Periode Langganan</th>
                  <th className="px-6 py-4">Tagihan (Bln)</th>
                  <th className="px-6 py-4">Volume Chat</th>
                  <th className="px-6 py-4 text-center">Status / Switch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                      Memuat daftar workspace...
                    </td>
                  </tr>
                ) : filteredTenants.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                      Tidak ada workspace pada kategori ini.
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map((t) => {
                    const isActive = t.status === 'active';
                    const isOverdue = t.due_date && new Date(t.due_date) < new Date();
                    const isInternal = t.category === 'internal';

                    return (
                      <tr key={t.id} className="hover:bg-slate-700/20 transition">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                isInternal
                                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {isInternal ? 'Internal' : 'Client B2B'}
                            </span>
                            <p className="font-semibold text-white text-sm">{t.name}</p>
                          </div>
                          <a
                            href={`https://chat.boontrack.com/${t.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline text-[11px] inline-flex items-center gap-1"
                          >
                            Buka Monitoring Chat (/{t.slug}) ↗
                          </a>
                        </td>

                        <td className="px-6 py-4 text-slate-300 font-mono text-[11px]">
                          <div>User: <span className="text-white">{t.access_username || 'admin'}</span></div>
                          <div>Pass: <span className="text-white">{t.access_password || '-'}</span></div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="text-slate-300">
                            Mulai: {t.start_date || '-'}
                          </div>
                          <div className={`mt-0.5 font-medium ${isOverdue ? 'text-rose-400' : 'text-slate-400'}`}>
                            Tempo: {t.due_date || '-'} {isOverdue && '(Lewat Tempo)'}
                          </div>
                        </td>

                        <td className="px-6 py-4 font-semibold text-slate-200">
                          {isInternal
                            ? 'Internal (N/A)'
                            : t.monthly_fee
                            ? `Rp ${Number(t.monthly_fee).toLocaleString('id-ID')}`
                            : 'Trial / Gratis'}
                        </td>

                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-md font-mono text-slate-300">
                            {t.message_count || 0} pesan
                          </span>
                        </td>

                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => toggleTenantStatus(t)}
                            className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition inline-flex items-center gap-1.5 ${
                              isActive
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-emerald-500/20 hover:text-emerald-400 hover:border-emerald-500/30'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                            {isActive ? 'AKTIF (Klik utk OFF)' : 'MATI (Klik utk ON)'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Tambah Workspace */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
              <h2 className="text-base font-bold text-white mb-1">Daftarkan Workspace Baru</h2>
              <p className="text-xs text-slate-400 mb-4">Pilih entitas internal BoonTrack atau klien B2B eksternal.</p>

              <form onSubmit={handleCreateTenant} className="space-y-3">
                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">Kategori Entitas</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewCategory('internal')}
                      className={`py-2 rounded-lg text-xs font-semibold border transition ${
                        newCategory === 'internal'
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                          : 'bg-slate-950 border-slate-700 text-slate-400'
                      }`}
                    >
                      Internal Ecosystem
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewCategory('external')}
                      className={`py-2 rounded-lg text-xs font-semibold border transition ${
                        newCategory === 'external'
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-slate-950 border-slate-700 text-slate-400'
                      }`}
                    >
                      External Client B2B
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">Nama Workspace / Bisnis</label>
                  <input
                    type="text"
                    placeholder="Contoh: BoonTrack Holding / Kelurahan Indra"
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      if (!newSlug) setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">URL Slug Workspace</label>
                  <input
                    type="text"
                    placeholder="boontrack-holding atau kelurahan-indra"
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white font-mono"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">Username Login</label>
                    <input
                      type="text"
                      value={newUser}
                      onChange={(e) => setNewUser(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">Password Login</label>
                    <input
                      type="text"
                      placeholder="pass123"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white"
                      required
                    />
                  </div>
                </div>

                {newCategory === 'external' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-300 block mb-1">Jatuh Tempo Tagihan</label>
                      <input
                        type="date"
                        value={newDueDate}
                        onChange={(e) => setNewDueDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300 block mb-1">Biaya / Bulan (Rp)</label>
                      <input
                        type="number"
                        placeholder="500000"
                        value={newFee}
                        onChange={(e) => setNewFee(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white"
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-2 bg-slate-700 text-xs text-slate-300 rounded-lg hover:bg-slate-600 transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-blue-600 text-xs font-semibold text-white rounded-lg hover:bg-blue-500 transition shadow-lg shadow-blue-600/30"
                  >
                    Simpan Workspace
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