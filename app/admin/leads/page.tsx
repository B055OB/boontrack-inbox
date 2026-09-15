'use client';

/**
 * Superadmin Leads Dashboard
 * Apply to: boontrack-inbox/app/admin/leads/page.tsx
 *
 * Features:
 *   - Fetches GET /api/v1/superadmin/leads (auto-refresh every 30s)
 *   - Full table: Brand, Industry, PIC, WA (quick CTA), Feature Flags, Status, Date
 *   - Feature flag badges: WABA · Telegram · ESC/POS · Doorlock · NFC
 *   - PATCH status modal: CONTACTED · FOLLOWED_UP · DEMO_SCHEDULED · PILOT_APPROVED · ARCHIVED
 *   - Dark slate-950, orange accent
 */

import React, { useEffect, useState, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FeatureFlags {
    'channel.waba_official'?: boolean;
    'channel.telegram_ops'?: boolean;
    'channel.discord_crm'?: boolean;
    'peripheral.escpos_printer'?: boolean;
    'peripheral.smart_doorlock'?: boolean;
    'peripheral.nfc_access'?: boolean;
    [key: string]: boolean | string | undefined;
}

interface Lead {
    id: string;
    brand_name: string;
    industry: string;
    pic_name: string;
    whatsapp: string;
    pain_points: string;
    desired_outcome: string;
    channels_config: Record<string, unknown>;
    hardware_config: Record<string, unknown>;
    feature_flags: FeatureFlags;
    status: string;
    created_at: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.boontrack.com';

const STATUS_OPTIONS = [
    'PROSPECT_PILOT_REQUESTED',
    'CONTACTED',
    'FOLLOWED_UP',
    'DEMO_SCHEDULED',
    'PROSPECT_PILOT_ACCEPTED',
    'PILOT_APPROVED',
    'ARCHIVED',
];

const STATUS_STYLES: Record<string, string> = {
    PROSPECT_PILOT_REQUESTED: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    CONTACTED:                'bg-blue-500/20 text-blue-300 border-blue-500/30',
    FOLLOWED_UP:              'bg-violet-500/20 text-violet-300 border-violet-500/30',
    DEMO_SCHEDULED:           'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    PROSPECT_PILOT_ACCEPTED:  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    PILOT_APPROVED:           'bg-green-500/20 text-green-300 border-green-500/30',
    ARCHIVED:                 'bg-neutral-600/30 text-neutral-400 border-neutral-600/30',
};

const FLAG_DEFS = [
    { key: 'channel.waba_official',    label: 'WABA',     color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    { key: 'channel.telegram_ops',     label: 'TG',       color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    { key: 'channel.discord_crm',      label: 'Discord',  color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
    { key: 'peripheral.escpos_printer',label: 'ESC/POS',  color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
    { key: 'peripheral.smart_doorlock',label: 'Doorlock', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
    { key: 'peripheral.nfc_access',    label: 'NFC',      color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
];

function formatWA(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('08')) return '62' + digits.slice(1);
    if (digits.startsWith('8'))  return '62' + digits;
    return digits;
}

function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const cls = STATUS_STYLES[status] ?? 'bg-neutral-700/40 text-neutral-400 border-neutral-600';
    return (
        <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap ${cls}`}>
            {status.replace(/_/g, ' ')}
        </span>
    );
}

function FlagBadges({ flags }: { flags: FeatureFlags }) {
    const active = FLAG_DEFS.filter(f => flags[f.key] === true);
    if (active.length === 0) return <span className="text-neutral-700 text-xs">—</span>;
    return (
        <div className="flex flex-wrap gap-1">
            {active.map(f => (
                <span key={f.key} className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${f.color}`}>
                    {f.label}
                </span>
            ))}
        </div>
    );
}

// ─── PATCH Status Modal ──────────────────────────────────────────────────────

function StatusModal({
    lead,
    onClose,
    onUpdated,
}: {
    lead: Lead;
    onClose: () => void;
    onUpdated: (id: string, newStatus: string) => void;
}) {
    const [selected, setSelected] = useState(lead.status);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async () => {
        if (selected === lead.status) { onClose(); return; }
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE}/api/v1/superadmin/leads/${lead.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: selected }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            onUpdated(lead.id, selected);
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Gagal update status');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(2,6,23,0.85)', backdropFilter: 'blur(8px)' }}
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <div className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-5 border-b border-white/[0.07] flex items-center justify-between">
                    <div>
                        <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Update Status</p>
                        <h3 className="text-sm font-bold text-white mt-0.5">{lead.brand_name}</h3>
                    </div>
                    <button onClick={onClose} className="text-neutral-500 hover:text-white transition text-xl">✕</button>
                </div>

                <div className="p-5 space-y-2">
                    {STATUS_OPTIONS.map(s => (
                        <label
                            key={s}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer border transition ${
                                selected === s
                                    ? 'border-orange-500/50 bg-orange-500/10'
                                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                            }`}
                        >
                            <input
                                type="radio"
                                name="status"
                                value={s}
                                checked={selected === s}
                                onChange={() => setSelected(s)}
                                className="accent-orange-500"
                            />
                            <StatusBadge status={s} />
                        </label>
                    ))}

                    {error && (
                        <p className="text-xs text-rose-400 bg-rose-950/30 border border-rose-900/40 rounded-lg px-3 py-2">{error}</p>
                    )}

                    <button
                        onClick={handleSave}
                        disabled={loading}
                        id="status-modal-save-btn"
                        className="w-full mt-3 py-3 rounded-xl font-bold text-sm text-white transition flex items-center justify-center gap-2 disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}
                    >
                        {loading ? (
                            <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Menyimpan…</>
                        ) : 'Simpan Status'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Detail Drawer ───────────────────────────────────────────────────────────

function DetailDrawer({ lead, onClose }: { lead: Lead; onClose: () => void }) {
    return (
        <div
            className="fixed inset-0 z-40 flex justify-end"
            style={{ background: 'rgba(2,6,23,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <div className="w-full max-w-sm h-full bg-slate-900 border-l border-white/10 overflow-y-auto p-6 space-y-5">
                <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-white">{lead.brand_name}</h3>
                    <button onClick={onClose} className="text-neutral-500 hover:text-white text-xl transition">✕</button>
                </div>

                <div className="space-y-3 text-sm">
                    {[
                        { label: 'ID', value: lead.id },
                        { label: 'Industry', value: lead.industry },
                        { label: 'PIC', value: lead.pic_name },
                        { label: 'WhatsApp', value: lead.whatsapp },
                    ].map(({ label, value }) => (
                        <div key={label}>
                            <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">{label}</p>
                            <p className="text-neutral-200 mt-0.5 font-mono text-xs break-all">{value}</p>
                        </div>
                    ))}

                    <div>
                        <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">Pain Points</p>
                        <p className="text-neutral-300 mt-0.5 text-xs leading-relaxed">{lead.pain_points}</p>
                    </div>

                    <div>
                        <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">Desired Outcome</p>
                        <p className="text-neutral-300 mt-0.5 text-xs leading-relaxed">{lead.desired_outcome}</p>
                    </div>

                    <div>
                        <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold mb-1.5">Feature Flags</p>
                        <FlagBadges flags={lead.feature_flags} />
                    </div>

                    <div>
                        <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">Status</p>
                        <div className="mt-1"><StatusBadge status={lead.status} /></div>
                    </div>

                    <div>
                        <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">Created At</p>
                        <p className="text-neutral-400 text-xs mt-0.5">{formatDate(lead.created_at)}</p>
                    </div>
                </div>

                <a
                    href={`https://wa.me/${formatWA(lead.whatsapp)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white"
                    style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}
                >
                    💬 Follow-up via WhatsApp
                </a>
            </div>
        </div>
    );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SuperadminLeadsPage() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [patchTarget, setPatchTarget] = useState<Lead | null>(null);
    const [detailTarget, setDetailTarget] = useState<Lead | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    const fetchLeads = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/v1/superadmin/leads?limit=200`, {
                cache: 'no-store',
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setLeads(data.data ?? []);
            setLastRefresh(new Date());
            setError('');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Gagal memuat leads');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLeads();
        const interval = setInterval(fetchLeads, 30_000);
        return () => clearInterval(interval);
    }, [fetchLeads]);

    const handleStatusUpdated = (id: string, newStatus: string) => {
        setLeads(prev => prev.map(l => l.id === id ? { ...l, status: newStatus } : l));
    };

    const filtered = leads.filter(l => {
        const matchSearch = !search || [l.brand_name, l.industry, l.pic_name, l.whatsapp]
            .some(v => v.toLowerCase().includes(search.toLowerCase()));
        const matchStatus = statusFilter === 'ALL' || l.status === statusFilter;
        return matchSearch && matchStatus;
    });

    const statusCounts = leads.reduce<Record<string, number>>((acc, l) => {
        acc[l.status] = (acc[l.status] ?? 0) + 1;
        return acc;
    }, {});

    return (
        <>
            <title>Superadmin Leads · BoonTrack</title>

            <main className="min-h-screen bg-slate-950 text-white">
                {/* Header */}
                <div className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                            <span className="text-[10px] text-orange-400 font-bold uppercase tracking-widest">Control Plane</span>
                        </div>
                        <h1 className="text-lg font-extrabold mt-0.5">Superadmin Leads</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        {lastRefresh && (
                            <p className="text-xs text-neutral-600 hidden sm:block">
                                Refresh: {lastRefresh.toLocaleTimeString('id-ID')}
                            </p>
                        )}
                        <button
                            id="leads-refresh-btn"
                            onClick={() => { setLoading(true); fetchLeads(); }}
                            className="px-3 py-1.5 rounded-lg border border-white/10 text-xs font-semibold text-neutral-300 hover:text-white hover:border-white/20 transition flex items-center gap-1.5"
                        >
                            ↻ Refresh
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-5">
                    {/* KPI Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: 'Total Leads', value: leads.length, color: 'text-orange-400' },
                            { label: 'Requested',   value: statusCounts['PROSPECT_PILOT_REQUESTED'] ?? 0, color: 'text-orange-300' },
                            { label: 'Contacted',   value: (statusCounts['CONTACTED'] ?? 0) + (statusCounts['FOLLOWED_UP'] ?? 0), color: 'text-blue-300' },
                            { label: 'Approved',    value: (statusCounts['PROSPECT_PILOT_ACCEPTED'] ?? 0) + (statusCounts['PILOT_APPROVED'] ?? 0), color: 'text-emerald-300' },
                        ].map(({ label, value, color }) => (
                            <div key={label} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                                <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">{label}</p>
                                <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-3">
                        <input
                            id="leads-search-input"
                            type="text"
                            placeholder="Cari brand, PIC, WA..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="flex-1 min-w-48 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-orange-500/50 transition"
                        />
                        <select
                            id="leads-status-filter"
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm text-neutral-300 focus:outline-none focus:border-orange-500/50 transition"
                        >
                            <option value="ALL">Semua Status</option>
                            {STATUS_OPTIONS.map(s => (
                                <option key={s} value={s}>{s.replace(/_/g, ' ')} ({statusCounts[s] ?? 0})</option>
                            ))}
                        </select>
                    </div>

                    {/* Table */}
                    {loading ? (
                        <div className="flex items-center justify-center py-24">
                            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : error ? (
                        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
                            <p className="text-rose-400 text-sm">{error}</p>
                            <button onClick={fetchLeads} className="mt-3 text-xs text-neutral-500 hover:text-neutral-300 underline underline-offset-2 transition">
                                Coba lagi
                            </button>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-neutral-600 text-sm">
                            {search || statusFilter !== 'ALL' ? 'Tidak ada leads yang cocok dengan filter.' : 'Belum ada leads masuk.'}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-white/[0.07] bg-white/[0.02]">
                                            {['Brand Name', 'Industry', 'PIC', 'WhatsApp', 'Feature Flags', 'Status', 'Created At', 'Aksi'].map(h => (
                                                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-neutral-500 whitespace-nowrap">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((lead, idx) => (
                                            <tr
                                                key={lead.id}
                                                className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition cursor-pointer ${
                                                    idx % 2 === 0 ? '' : 'bg-white/[0.01]'
                                                }`}
                                                onClick={() => setDetailTarget(lead)}
                                            >
                                                {/* Brand */}
                                                <td className="px-4 py-3">
                                                    <p className="font-semibold text-neutral-100 whitespace-nowrap">{lead.brand_name}</p>
                                                </td>

                                                {/* Industry */}
                                                <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">{lead.industry}</td>

                                                {/* PIC */}
                                                <td className="px-4 py-3 text-neutral-300 whitespace-nowrap">{lead.pic_name}</td>

                                                {/* WhatsApp — CTA link */}
                                                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                                    <a
                                                        id={`wa-cta-${lead.id}`}
                                                        href={`https://wa.me/${formatWA(lead.whatsapp)}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition whitespace-nowrap"
                                                    >
                                                        💬 {lead.whatsapp}
                                                    </a>
                                                </td>

                                                {/* Feature Flags */}
                                                <td className="px-4 py-3">
                                                    <FlagBadges flags={lead.feature_flags} />
                                                </td>

                                                {/* Status */}
                                                <td className="px-4 py-3">
                                                    <StatusBadge status={lead.status} />
                                                </td>

                                                {/* Created At */}
                                                <td className="px-4 py-3 text-neutral-500 text-xs whitespace-nowrap">
                                                    {formatDate(lead.created_at)}
                                                </td>

                                                {/* Actions */}
                                                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                                    <button
                                                        id={`patch-status-${lead.id}`}
                                                        onClick={() => setPatchTarget(lead)}
                                                        className="px-2.5 py-1 rounded-lg border border-orange-500/30 text-orange-400 text-[11px] font-semibold hover:bg-orange-500/10 transition whitespace-nowrap"
                                                    >
                                                        Update Status
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="px-4 py-3 border-t border-white/[0.05] bg-white/[0.01]">
                                <p className="text-xs text-neutral-600">
                                    Menampilkan <strong className="text-neutral-400">{filtered.length}</strong> dari{' '}
                                    <strong className="text-neutral-400">{leads.length}</strong> leads · Auto-refresh setiap 30 detik
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Status Patch Modal */}
            {patchTarget && (
                <StatusModal
                    lead={patchTarget}
                    onClose={() => setPatchTarget(null)}
                    onUpdated={handleStatusUpdated}
                />
            )}

            {/* Detail Drawer */}
            {detailTarget && (
                <DetailDrawer
                    lead={detailTarget}
                    onClose={() => setDetailTarget(null)}
                />
            )}
        </>
    );
}
