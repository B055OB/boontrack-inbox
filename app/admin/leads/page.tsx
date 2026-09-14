'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Store,
  Search,
  ExternalLink,
  RefreshCw,
  ShoppingBag,
  Bell,
  Activity,
  UserCheck,
  Building2,
  Phone,
  MessageCircle,
  Cpu,
  Printer,
  KeyRound,
  CreditCard,
  Layers,
  ChevronRight,
  Filter,
  CheckCircle2,
  Clock,
  Sparkles,
  SlidersHorizontal,
  X,
  Send,
  Radio,
  FileText,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

const MASTER_PIN = '998877';

interface ChannelsConfig {
  whatsapp?: boolean;
  telegram?: boolean;
  discord?: boolean;
  other?: string | null;
}

interface HardwareConfig {
  none?: boolean;
  printer?: boolean;
  doorlock?: boolean;
  nfc?: boolean;
  other?: string | null;
}

interface FeatureFlags {
  'channel.waba_official'?: boolean;
  'channel.telegram_ops'?: boolean;
  'channel.discord_crm'?: boolean;
  'channel.other'?: string | null;
  'peripheral.escpos_printer'?: boolean;
  'peripheral.smart_doorlock'?: boolean;
  'peripheral.nfc_access'?: boolean;
  'peripheral.other'?: string | null;
  [key: string]: any;
}

interface TenantProspect {
  id: string;
  brand_name: string;
  industry: string;
  pic_name: string;
  whatsapp: string;
  pain_points: string;
  desired_outcome: string;
  channels_config: ChannelsConfig;
  hardware_config: HardwareConfig;
  feature_flags: FeatureFlags;
  status: string;
  created_at: string;
}

export default function AdminLeadsPage() {
  const CORE_API_URL =
    process.env.NEXT_PUBLIC_CORE_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'https://boontrack-core-production.up.railway.app';

  const [isAdminAuth, setIsAdminAuth] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('super_admin_auth') === 'true';
    }
    return false;
  });
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');

  const [leads, setLeads] = useState<TenantProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedLead, setSelectedLead] = useState<TenantProspect | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

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

  const loadLeads = useCallback(async () => {
    if (!isAdminAuth) return;
    setLoading(true);
    try {
      // Coba panggil endpoint superadmin leads dari backend
      const res = await fetch(`${CORE_API_URL}/api/v1/superadmin/leads`, {
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.data)) {
          setLeads(json.data);
          return;
        }
      }
      // Fallback jika direct host beda port (misal local development)
      const localRes = await fetch('/api/v1/superadmin/leads', { cache: 'no-store' });
      if (localRes.ok) {
        const json = await localRes.json();
        if (json && Array.isArray(json.data)) {
          setLeads(json.data);
        }
      }
    } catch (err) {
      console.warn('[Admin Leads] Error fetching leads:', err);
    } finally {
      setLoading(false);
    }
  }, [CORE_API_URL, isAdminAuth]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads, refreshKey]);

  // Status Updater
  const handleUpdateStatus = async (leadId: string, newStatus: string) => {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`${CORE_API_URL}/api/v1/superadmin/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
        );
        if (selectedLead && selectedLead.id === leadId) {
          setSelectedLead((prev) => (prev ? { ...prev, status: newStatus } : null));
        }
      }
    } catch (err) {
      console.error('Gagal memperbarui status lead:', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // WhatsApp Sanitizer & Link Generator
  const generateWhatsAppLink = (lead: TenantProspect) => {
    const rawDigits = (lead.whatsapp || '').replace(/\D/g, '');
    let sanitized = rawDigits;
    if (sanitized.startsWith('08')) {
      sanitized = '62' + sanitized.slice(1);
    } else if (sanitized.startsWith('8')) {
      sanitized = '62' + sanitized;
    }

    const message = `Halo Kak ${lead.pic_name} dari *${lead.brand_name}* 👋\n\nSalam kenal dari tim BoonTrack! Kami telah menerima permohonan pilot onboarding Anda untuk kategori industri *${lead.industry}*.\n\nKami melihat sasaran utama Anda:\n> "${lead.desired_outcome}"\n\nDengan tantangan operasional:\n> "${lead.pain_points}"\n\nApakah besok atau lusa ada waktu sekitar 15 menit untuk sesi online demo aktivasi sandbox pilot sistem BoonTrack untuk *${lead.brand_name}*?\n\nTerima kasih! 🙏`;

    return `https://wa.me/${sanitized}?text=${encodeURIComponent(message)}`;
  };

  // Extract list of unique industries for filter
  const industries = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => {
      if (l.industry) set.add(l.industry);
    });
    return Array.from(set);
  }, [leads]);

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    return leads.filter((item) => {
      const matchQuery = searchQuery
        ? item.brand_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.pic_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.whatsapp.includes(searchQuery) ||
          item.pain_points.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.desired_outcome.toLowerCase().includes(searchQuery.toLowerCase())
        : true;

      const matchIndustry =
        selectedIndustry === 'ALL' || item.industry === selectedIndustry;

      const matchStatus =
        selectedStatus === 'ALL' || item.status === selectedStatus;

      return matchQuery && matchIndustry && matchStatus;
    });
  }, [leads, searchQuery, selectedIndustry, selectedStatus]);

  // Summary Metrics
  const totalLeads = leads.length;
  const wabaRequests = leads.filter(
    (l) => l.channels_config?.whatsapp || l.feature_flags?.['channel.waba_official']
  ).length;
  const hardwareRequests = leads.filter(
    (l) =>
      !l.hardware_config?.none &&
      (l.hardware_config?.printer ||
        l.hardware_config?.doorlock ||
        l.hardware_config?.nfc ||
        l.feature_flags?.['peripheral.escpos_printer'])
  ).length;
  const freshRequests = leads.filter(
    (l) => l.status === 'PROSPECT_PILOT_REQUESTED'
  ).length;

  if (!isAdminAuth) {
    return (
      <main className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3 font-bold text-xl shadow-lg shadow-emerald-500/10">
            💼
          </div>
          <h1 className="text-lg font-bold text-white mb-1">BoonTrack Leads Cockpit</h1>
          <p className="text-xs text-slate-400 mb-5">
            Akses data intake onboarding & pilot request. Masukkan PIN Master Super Admin.
          </p>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              placeholder="PIN Super Admin (default: 998877)"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              className="w-full text-center tracking-widest px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-base md:text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              required
            />
            {pinError && <p className="text-[11px] text-rose-400">{pinError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-emerald-600/30 cursor-pointer"
            >
              Buka Data Leads &amp; Pilots
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100 p-4 md:p-8 antialiased selection:bg-emerald-600 selection:text-white">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-6 rounded-2xl backdrop-blur-md shadow-2xl">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30">
                LEADS &amp; PILOT REQUESTS
              </span>
              <span className="text-[11px] text-slate-400">&bull; Control Plane Intake Engine</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-white mt-1">Onboarding Pilot Intake Dashboard</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Daftar prospek tenant baru dari formulir onboarding, konfigurasi channel, integrasi IoT, dan aksi follow-up WhatsApp langsung.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 transition cursor-pointer flex items-center gap-2"
              title="Refresh Live Leads"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="hidden sm:inline text-xs">Sinkronisasi</span>
            </button>
            <button
              onClick={() => {
                sessionStorage.removeItem('super_admin_auth');
                setIsAdminAuth(false);
              }}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-xl border border-slate-700 transition cursor-pointer"
            >
              Kunci
            </button>
          </div>
        </div>

        {/* Superadmin Control Plane Module Navigation */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <Link
            href="/admin"
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white font-semibold text-xs border border-slate-800 transition shrink-0 flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span>Workspaces &amp; Incidents</span>
          </Link>
          <Link
            href="/admin/shops"
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white font-semibold text-xs border border-slate-800 transition shrink-0 flex items-center gap-1.5"
          >
            <Store className="w-3.5 h-3.5 text-amber-400" />
            <span>Directory Shop</span>
          </Link>
          <span className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-md shadow-emerald-600/20 shrink-0 flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-white" />
            <span>Leads &amp; Pilot Intake</span>
          </span>
          <Link
            href="/admin/push-notification"
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white font-semibold text-xs border border-slate-800 transition shrink-0 flex items-center gap-1.5"
          >
            <Bell className="w-3.5 h-3.5 text-purple-400" />
            <span>Web Push Broadcaster</span>
          </Link>
          <Link
            href="/admin/telemetry"
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white font-semibold text-xs border border-slate-800 transition shrink-0 flex items-center gap-1.5"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Telemetry Engine</span>
          </Link>
        </div>

        {/* Quick KPI Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
          <div className="bg-slate-900/70 border border-slate-800/80 p-4 rounded-xl relative overflow-hidden">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Intake Leads</div>
            <div className="text-2xl font-extrabold text-white mt-1">{totalLeads}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Calon merchant terdaftar</div>
            <div className="absolute -right-2 -bottom-2 opacity-10 text-white font-bold text-5xl">#</div>
          </div>
          <div className="bg-slate-900/70 border border-slate-800/80 p-4 rounded-xl relative overflow-hidden">
            <div className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">Permohonan Baru</div>
            <div className="text-2xl font-extrabold text-emerald-400 mt-1">{freshRequests}</div>
            <div className="text-[11px] text-emerald-500/70 mt-0.5">Status PILOT_REQUESTED</div>
            <div className="absolute -right-2 -bottom-2 opacity-10 text-emerald-400 font-bold text-5xl">!</div>
          </div>
          <div className="bg-slate-900/70 border border-slate-800/80 p-4 rounded-xl relative overflow-hidden">
            <div className="text-[11px] font-medium text-emerald-300 uppercase tracking-wider">WhatsApp WABA</div>
            <div className="text-2xl font-extrabold text-white mt-1">{wabaRequests}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Butuh WhatsApp Gateway</div>
            <div className="absolute -right-2 -bottom-2 opacity-10 text-emerald-400 font-bold text-5xl">WA</div>
          </div>
          <div className="bg-slate-900/70 border border-slate-800/80 p-4 rounded-xl relative overflow-hidden">
            <div className="text-[11px] font-medium text-orange-400 uppercase tracking-wider">Hardware / Peripherals</div>
            <div className="text-2xl font-extrabold text-orange-400 mt-1">{hardwareRequests}</div>
            <div className="text-[11px] text-orange-500/70 mt-0.5">Printer / Doorlock / NFC</div>
            <div className="absolute -right-2 -bottom-2 opacity-10 text-orange-400 font-bold text-5xl">IoT</div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari brand, nama PIC, no WhatsApp, pain points, atau outcome..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            <select
              value={selectedIndustry}
              onChange={(e) => setSelectedIndustry(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">Semua Industri</option>
              {industries.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">Semua Status</option>
              <option value="PROSPECT_PILOT_REQUESTED">PROSPECT_PILOT_REQUESTED</option>
              <option value="FOLLOWED_UP">FOLLOWED_UP</option>
              <option value="PILOT_ACTIVE">PILOT_ACTIVE</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                <tr>
                  <th className="p-4">Brand &amp; PIC</th>
                  <th className="p-4">Industri</th>
                  <th className="p-4">Pain Points &amp; Desired Outcome</th>
                  <th className="p-4">Channels &amp; Peripherals</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Aksi Follow-Up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-400 mb-2" />
                      <p>Memuat data onboarding leads...</p>
                    </td>
                  </tr>
                ) : filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-500">
                      <AlertCircle className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                      <p className="font-medium text-slate-400">Belum ada data leads yang sesuai filter.</p>
                      <p className="text-[11px] text-slate-600 mt-1">
                        Calon merchant yang mengisi formulir onboarding akan otomatis muncul di sini.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => {
                    const waUrl = generateWhatsAppLink(lead);
                    const isPilotRequested = lead.status === 'PROSPECT_PILOT_REQUESTED';
                    const isFollowedUp = lead.status === 'FOLLOWED_UP';

                    return (
                      <tr
                        key={lead.id}
                        className="hover:bg-slate-850/50 transition duration-150 group cursor-pointer"
                        onClick={() => setSelectedLead(lead)}
                      >
                        {/* Brand & PIC Name */}
                        <td className="p-4 align-top">
                          <div className="font-bold text-white text-sm group-hover:text-emerald-400 transition">
                            {lead.brand_name}
                          </div>
                          <div className="text-slate-400 text-xs mt-0.5 flex items-center gap-1">
                            <span className="font-medium text-slate-300">PIC:</span> {lead.pic_name}
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono">
                            <Phone className="w-3 h-3 text-emerald-400" />
                            <span>{lead.whatsapp}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {lead.created_at
                              ? new Date(lead.created_at).toLocaleString('id-ID', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Baru saja'}
                          </div>
                        </td>

                        {/* Industry Badge */}
                        <td className="p-4 align-top">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 shadow-sm">
                            <Building2 className="w-3 h-3 mr-1 text-slate-400" />
                            {lead.industry}
                          </span>
                        </td>

                        {/* Pain Points & Desired Outcome */}
                        <td className="p-4 align-top max-w-xs md:max-w-md">
                          <div className="space-y-1.5">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-rose-400/90 tracking-wider">
                                Kendala:
                              </span>
                              <p className="text-slate-300 text-xs line-clamp-2 mt-0.5 leading-relaxed">
                                {lead.pain_points}
                              </p>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-emerald-400/90 tracking-wider">
                                Target Outcome:
                              </span>
                              <p className="text-slate-300 text-xs line-clamp-2 mt-0.5 leading-relaxed font-medium">
                                {lead.desired_outcome}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Channels & Hardware Badges */}
                        <td className="p-4 align-top">
                          <div className="space-y-2">
                            {/* Channels */}
                            <div className="flex flex-wrap gap-1">
                              {(lead.channels_config?.whatsapp ||
                                lead.feature_flags?.['channel.waba_official']) && (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold inline-flex items-center gap-1">
                                  <MessageCircle className="w-2.5 h-2.5" /> WA WABA
                                </span>
                              )}
                              {(lead.channels_config?.telegram ||
                                lead.feature_flags?.['channel.telegram_ops']) && (
                                <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/30 text-[10px] font-semibold inline-flex items-center gap-1">
                                  Telegram
                                </span>
                              )}
                              {(lead.channels_config?.discord ||
                                lead.feature_flags?.['channel.discord_crm']) && (
                                <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 text-[10px] font-semibold inline-flex items-center gap-1">
                                  Discord
                                </span>
                              )}
                              {lead.channels_config?.other && (
                                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[10px]">
                                  +{lead.channels_config.other}
                                </span>
                              )}
                            </div>

                            {/* Peripherals */}
                            <div className="flex flex-wrap gap-1">
                              {lead.hardware_config?.none ? (
                                <span className="text-[10px] text-slate-500 italic">
                                  Software Only (No IoT)
                                </span>
                              ) : (
                                <>
                                  {(lead.hardware_config?.printer ||
                                    lead.feature_flags?.['peripheral.escpos_printer']) && (
                                    <span className="px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/30 text-[10px] font-semibold inline-flex items-center gap-1">
                                      <Printer className="w-2.5 h-2.5" /> ESC/POS
                                    </span>
                                  )}
                                  {(lead.hardware_config?.doorlock ||
                                    lead.feature_flags?.['peripheral.smart_doorlock']) && (
                                    <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/30 text-[10px] font-semibold inline-flex items-center gap-1">
                                      <KeyRound className="w-2.5 h-2.5" /> Doorlock
                                    </span>
                                  )}
                                  {(lead.hardware_config?.nfc ||
                                    lead.feature_flags?.['peripheral.nfc_access']) && (
                                    <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-semibold inline-flex items-center gap-1">
                                      <CreditCard className="w-2.5 h-2.5" /> NFC
                                    </span>
                                  )}
                                  {lead.hardware_config?.other && (
                                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[10px]">
                                      +{lead.hardware_config.other}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="p-4 align-top">
                          {isPilotRequested ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                              PILOT REQUESTED
                            </span>
                          ) : isFollowedUp ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              FOLLOWED UP
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                              {lead.status}
                            </span>
                          )}
                        </td>

                        {/* Action Follow-Up */}
                        <td
                          className="p-4 align-top text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                              if (lead.status === 'PROSPECT_PILOT_REQUESTED') {
                                handleUpdateStatus(lead.id, 'FOLLOWED_UP');
                              }
                            }}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-lg shadow-emerald-600/30 active:scale-95 cursor-pointer"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>Follow Up WhatsApp</span>
                          </a>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Lead Detail & Feature Flags Modal */}
        {selectedLead && (
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedLead(null)}
          >
            <div
              className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    PROSPECT DETAIL &amp; FEATURE FLAGS
                  </div>
                  <h2 className="text-lg font-bold text-white mt-0.5">
                    {selectedLead.brand_name}
                  </h2>
                  <p className="text-xs text-slate-400">
                    PIC: {selectedLead.pic_name} &bull; {selectedLead.whatsapp} &bull; Industri: {selectedLead.industry}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedLead(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status Selector */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-white">Status Prospek Saat Ini</div>
                  <div className="text-[11px] text-slate-400">Ubah status setelah melakukan follow-up atau aktivasi pilot.</div>
                </div>
                <div className="flex items-center gap-2">
                  {['PROSPECT_PILOT_REQUESTED', 'FOLLOWED_UP', 'PILOT_ACTIVE', 'CLOSED'].map((st) => (
                    <button
                      key={st}
                      disabled={updatingStatus}
                      onClick={() => handleUpdateStatus(selectedLead.id, st)}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                        selectedLead.status === st
                          ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {st === 'PROSPECT_PILOT_REQUESTED' ? 'REQUESTED' : st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Details Sections */}
              <div className="space-y-4 text-xs">
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                  <div className="font-semibold text-rose-400 flex items-center gap-1.5 mb-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Kendala Operasional / Pain Points:</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {selectedLead.pain_points}
                  </p>
                </div>

                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                  <div className="font-semibold text-emerald-400 flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Target Outcome yang Diinginkan:</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {selectedLead.desired_outcome}
                  </p>
                </div>

                {/* Feature Flags JSON Preview */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 font-mono text-[11px]">
                  <div className="text-slate-400 font-semibold mb-2 flex items-center justify-between">
                    <span>MAPPED FEATURE FLAGS:</span>
                    <span className="text-[10px] text-slate-500 font-normal">control_plane.tenant_prospects.feature_flags</span>
                  </div>
                  <pre className="text-emerald-400 overflow-x-auto p-2 bg-slate-900 rounded-lg">
                    {JSON.stringify(selectedLead.feature_flags, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <div className="text-[11px] text-slate-500">
                  Lead ID: <span className="font-mono">{selectedLead.id}</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedLead(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
                  >
                    Tutup
                  </button>
                  <a
                    href={generateWhatsAppLink(selectedLead)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      if (selectedLead.status === 'PROSPECT_PILOT_REQUESTED') {
                        handleUpdateStatus(selectedLead.id, 'FOLLOWED_UP');
                      }
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-emerald-600/30 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Kirim Template WhatsApp</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
