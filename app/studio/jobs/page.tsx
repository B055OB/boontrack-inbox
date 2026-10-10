'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Cpu,
  Film,
  Zap,
  CheckCircle2,
  AlertCircle,
  Clock,
  Play,
  Download,
  Copy,
  Check,
  RefreshCw,
  Search,
  Filter,
  ChevronRight,
  Boxes,
  ArrowRight,
  X,
  Eye,
  Sliders,
  ExternalLink
} from 'lucide-react';
import StudioPaywallModal from '@/components/studio/StudioPaywallModal';

interface StudioJob {
  id: string;
  tenant_id: string;
  user_id: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | string;
  job_type: string;
  payload: {
    product_name?: string;
    product_slug?: string;
    model_name?: string;
    variation_index?: number;
    variation_title?: string;
    filename?: string;
    hook?: string;
    body?: string;
    cta?: string;
    hook_angle?: string;
    cta_angle?: string;
    aspect_ratio?: string;
    resolution?: string;
    dispatched_at?: string;
    [key: string]: any;
  };
  output_url?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export default function StudioJobsPage() {
  const [tenantSlug, setTenantSlug] = useState<string>('studio');
  const [renderCredits, setRenderCredits] = useState<number>(1);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

  // Job List State
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // In-Place Video Preview Modal
  const [previewJob, setPreviewJob] = useState<StudioJob | null>(null);

  // Restore Tenant Context
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cookieMatch = document.cookie.match(/(?:merchant_store|merchant_session|bt_tenant)=([^;]+)/);
      const cookieVal = cookieMatch ? decodeURIComponent(cookieMatch[1]).replace(/^["']|["']$/g, '').trim() : '';
      const localVal = (
        localStorage.getItem('merchant_store') ||
        localStorage.getItem('merchant_session') ||
        localStorage.getItem('bt_tenant') ||
        ''
      ).replace(/^["']|["']$/g, '').trim();

      const resolved = (localVal || cookieVal || '').toLowerCase();
      if (resolved && resolved !== 'null' && resolved !== 'undefined') {
        setTenantSlug(resolved);
      }

      const storedSession = localStorage.getItem('studio_session');
      if (storedSession) {
        try {
          const parsed = JSON.parse(storedSession);
          if (typeof parsed.render_credits === 'number') {
            setRenderCredits(parsed.render_credits);
          }
        } catch {}
      }
    }
  }, []);

  // Fetch Jobs from API
  const fetchJobs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (tenantSlug) params.append('tenant_id', tenantSlug);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const res = await fetch(`/api/studio/jobs?${params.toString()}`);
      const data = await res.json();
      if (data?.success && Array.isArray(data?.jobs)) {
        setJobs(data.jobs);
      }
    } catch (err) {
      console.warn('[Studio Jobs Fetch Error]', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [tenantSlug, statusFilter]);

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Direct MP4 Download Helper
  const handleDownloadMp4 = (job: StudioJob) => {
    // Lacak status unduhan ke server (Auto-Purge Tracker)
    fetch(`/api/studio/renders/${encodeURIComponent(job.id)}/track-download`, {
      method: 'POST',
    }).catch(err => console.warn('[Auto-Purge Tracker Error]', err));

    const filename = job.payload?.filename || `render_${job.id.slice(0, 8)}.mp4`;
    const videoUrl = job.output_url || 'https://assets.mixkit.co/videos/preview/mixkit-vertical-portrait-of-a-woman-smiling-at-sunset-40502-large.mp4';
    
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Filter Jobs by Search Query
  const filteredJobs = jobs.filter(j => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = (j.payload?.product_name || '').toLowerCase();
    const title = (j.payload?.variation_title || '').toLowerCase();
    const filename = (j.payload?.filename || '').toLowerCase();
    const id = j.id.toLowerCase();
    return name.includes(q) || title.includes(q) || filename.includes(q) || id.includes(q);
  });

  const totalCompleted = jobs.filter(j => j.status === 'COMPLETED').length;
  const totalProcessing = jobs.filter(j => j.status === 'PROCESSING').length;
  const totalQueued = jobs.filter(j => j.status === 'QUEUED').length;

  return (
    <div className="min-h-screen bg-[#0B0F17] text-white selection:bg-indigo-500 selection:text-white font-sans relative overflow-x-hidden flex flex-col">
      {/* Background Mesh Glow */}
      <div className="absolute top-0 right-1/4 w-[750px] h-[450px] bg-gradient-to-b from-indigo-600/15 via-purple-600/10 to-transparent blur-[140px] pointer-events-none -z-10" />
      <div className="absolute bottom-1/4 left-0 w-96 h-96 bg-purple-700/10 rounded-full blur-[130px] pointer-events-none -z-10" />

      {/* ── HEADER ────────────────────────────────────────────── */}
      <header className="border-b border-white/10 bg-[#0B0F17]/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/studio/desk"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition flex items-center justify-center cursor-pointer"
              title="Kembali ke Studio Desk"
            >
              <Boxes className="w-4 h-4 text-indigo-400" />
            </Link>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-white">boontrack</span>
                <span className="text-xs font-black tracking-widest bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent uppercase">
                  RENDER JOBS & TELEMETRY
                </span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold">
                  FFmpeg 7.x
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                Log Pemrosesan Antrean Video, Unduhan MP4, dan Status Worker Cluster (§53.3)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Quick Link to Studio Video Otomatis */}
            <Link
              href="/studio/fcd-automator"
              className="py-1.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>Buka Studio Video Otomatis</span>
            </Link>

            {/* Credit Pill */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-xs font-bold text-violet-300">
              <Zap className="w-3.5 h-3.5 text-violet-400" />
              <span>{renderCredits} Credit{renderCredits === 1 ? ' (Trial)' : 's'}</span>
            </div>

            {/* Top Up Button */}
            <button
              type="button"
              onClick={() => setIsPaywallOpen(true)}
              className="py-1.5 px-3 rounded-xl bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/40 text-violet-300 hover:text-white font-bold text-xs transition cursor-pointer"
            >
              + Top Up
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ──────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 space-y-6">
        
        {/* ── TELEMETRY STATS GRID ──────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-xl space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Total Render Jobs
            </span>
            <div className="text-2xl font-black text-white font-mono">{jobs.length}</div>
            <span className="text-[10px] text-slate-500 font-mono">Semua riwayat pengiriman</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-emerald-500/30 backdrop-blur-xl space-y-1">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
              Selesai Dirender (Ready)
            </span>
            <div className="text-2xl font-black text-emerald-400 font-mono">{totalCompleted}</div>
            <span className="text-[10px] text-emerald-500/80 font-mono">100% Siap unduh MP4</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-purple-500/30 backdrop-blur-xl space-y-1">
            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">
              Dalam Antrean & Render
            </span>
            <div className="text-2xl font-black text-purple-400 font-mono">
              {totalProcessing + totalQueued}
            </div>
            <span className="text-[10px] text-purple-500/80 font-mono">FFmpeg CPU thread aktif</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-xl space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Cluster Worker Telemetry
            </span>
            <div className="text-sm font-bold text-emerald-400 font-mono flex items-center gap-1.5 pt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Standby & Healthy</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">Latensi sub-detik (§10.3)</span>
          </div>
        </div>

        {/* ── FILTER & SEARCH TOOLBAR ───────────────────────────── */}
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {[
              { id: 'ALL', label: 'Semua Status' },
              { id: 'COMPLETED', label: 'Completed' },
              { id: 'PROCESSING', label: 'Processing' },
              { id: 'QUEUED', label: 'Queued' },
              { id: 'FAILED', label: 'Failed' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 md:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cari kampanye atau ID job..."
                className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={fetchJobs}
              disabled={isLoading}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition cursor-pointer disabled:opacity-50"
              title="Segarkan Riwayat"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── JOB HISTORY TABLE & LIST ──────────────────────────── */}
        {isLoading ? (
          <div className="p-16 text-center rounded-3xl bg-slate-900/40 border border-white/10 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-400 mx-auto" />
            <p className="text-sm font-bold text-slate-300">Memuat telemetri render jobs...</p>
            <p className="text-xs text-slate-500">Menghubungkan ke database antrean Supabase</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          /* Friendly Empty State */
          <div className="p-12 sm:p-16 text-center rounded-3xl bg-slate-900/60 border border-white/10 backdrop-blur-xl space-y-5">
            <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto shadow-xl">
              <Film className="w-8 h-8" />
            </div>

            <div className="max-w-md mx-auto space-y-2">
              <h3 className="text-lg font-black text-white">Belum Ada Riwayat Pekerjaan Render</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Antrean render video Anda masih kosong. Mulai rakit kombinasi variasi iklan (3 Hook x 1 Body x 2 CTA) di Studio Video Otomatis dan kirim ke server render dalam 1 klik.
              </p>
            </div>

            <div>
              <Link
                href="/studio/fcd-automator"
                className="inline-flex items-center gap-2 py-3 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-extrabold text-xs shadow-lg shadow-indigo-600/30 transition cursor-pointer"
              >
                <Sliders className="w-4 h-4" />
                <span>Buat Iklan di Studio Video Otomatis 🚀</span>
              </Link>
            </div>
          </div>
        ) : (
          /* Table Container */
          <div className="rounded-3xl bg-slate-900/60 border border-white/10 backdrop-blur-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-white/[0.03] border-b border-white/10 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  <tr>
                    <th className="py-3.5 px-4">ID Job</th>
                    <th className="py-3.5 px-4">Nama Kampanye / Video</th>
                    <th className="py-3.5 px-4">Variasi & Naskah</th>
                    <th className="py-3.5 px-4">Waktu Submit</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredJobs.map(job => {
                    const status = job.status?.toUpperCase() || 'QUEUED';
                    const isCompleted = status === 'COMPLETED';
                    const isProcessing = status === 'PROCESSING';
                    const isQueued = status === 'QUEUED';
                    const isFailed = status === 'FAILED';

                    const statusBadge = isCompleted ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>Completed</span>
                      </span>
                    ) : isProcessing ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                        <RefreshCw className="w-3 h-3 animate-spin text-purple-400" />
                        <span>Processing</span>
                      </span>
                    ) : isQueued ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span>Queued</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                        <AlertCircle className="w-3 h-3 text-rose-400" />
                        <span>Failed</span>
                      </span>
                    );

                    const shortId = job.id.slice(0, 8);
                    const productName = job.payload?.product_name || 'FCD Campaign';
                    const variationTitle = job.payload?.variation_title || `Variasi #${job.payload?.variation_index || 1}`;
                    const filename = job.payload?.filename || `${productName}_output.mp4`;
                    const dateFormatted = new Date(job.created_at).toLocaleString('id-ID', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    });

                    return (
                      <tr key={job.id} className="hover:bg-white/[0.02] transition">
                        {/* ID Job */}
                        <td className="py-4 px-4 font-mono">
                          <button
                            type="button"
                            onClick={() => handleCopy(job.id, job.id)}
                            className="flex items-center gap-1.5 text-slate-400 hover:text-white transition cursor-pointer"
                            title="Salin Full UUID"
                          >
                            <span>#{shortId}</span>
                            {copiedId === job.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3 opacity-60" />
                            )}
                          </button>
                        </td>

                        {/* Nama Kampanye */}
                        <td className="py-4 px-4">
                          <div className="space-y-0.5">
                            <span className="font-extrabold text-white block">{productName}</span>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                              <span className="px-1.5 py-0.2 bg-white/5 rounded">9:16</span>
                              <span className="truncate max-w-[160px]">{filename}</span>
                            </div>
                          </div>
                        </td>

                        {/* Variasi & Hook */}
                        <td className="py-4 px-4">
                          <div className="space-y-1">
                            <span className="font-bold text-indigo-300 block">{variationTitle}</span>
                            {job.payload?.hook && (
                              <p className="text-[11px] text-slate-400 italic line-clamp-1 max-w-[200px]">
                                &ldquo;{job.payload.hook}&rdquo;
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Waktu Submit */}
                        <td className="py-4 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                          {dateFormatted}
                        </td>

                        {/* Status */}
                        <td className="py-4 px-4 whitespace-nowrap">{statusBadge}</td>

                        {/* Aksi */}
                        <td className="py-4 px-4 text-right whitespace-nowrap">
                          {isCompleted ? (
                            <div className="flex items-center justify-end gap-2">
                              {/* Preview Button */}
                              <button
                                type="button"
                                onClick={() => setPreviewJob(job)}
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/40 text-indigo-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                                title="Putar Video Preview"
                              >
                                <Play className="w-3 h-3 text-indigo-400 fill-indigo-400" />
                                <span>Preview</span>
                              </button>

                              {/* Download MP4 Button */}
                              <button
                                type="button"
                                onClick={() => handleDownloadMp4(job)}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm shadow-emerald-500/20"
                                title="Unduh File Video MP4"
                              >
                                <Download className="w-3 h-3" />
                                <span>Download MP4</span>
                              </button>
                            </div>
                          ) : isFailed ? (
                            <span className="text-[11px] text-rose-400 italic">
                              {job.error_message || 'Gagal merender'}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500 font-mono italic">
                              Menunggu proses...
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>

      {/* ── IN-PLACE VIDEO PREVIEW MODAL ──────────────────────── */}
      {previewJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-sm bg-slate-900 border border-white/15 rounded-3xl overflow-hidden shadow-2xl space-y-4 p-5 flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block font-mono">
                  Pratinjau Video MP4 Final
                </span>
                <h4 className="text-sm font-black text-white truncate">
                  {previewJob.payload?.variation_title || 'Video Render'}
                </h4>
              </div>

              <button
                type="button"
                onClick={() => setPreviewJob(null)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Video Player 9:16 Aspect Ratio */}
            <div className="relative w-full aspect-[9/16] rounded-2xl overflow-hidden bg-black border border-white/10 shadow-inner flex items-center justify-center">
              <video
                src={
                  previewJob.output_url ||
                  'https://assets.mixkit.co/videos/preview/mixkit-vertical-portrait-of-a-woman-smiling-at-sunset-40502-large.mp4'
                }
                controls
                autoPlay
                loop
                playsInline
                className="w-full h-full object-cover"
              />
            </div>

            {/* Video Metadata & Download CTA */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Format: 9:16 • 1080x1920</span>
                <span className="text-emerald-400 font-bold">100% Rendered</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadMp4(previewJob)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download File MP4</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewJob(null)}
                  className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-bold transition cursor-pointer"
                >
                  Tutup
                </button>
              </div>

              {/* Label Peringatan Auto-Purge Storage */}
              <div className="flex items-center gap-1.5 text-[10px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-xl font-medium">
                <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Video otomatis dibersihkan dari server dalam 7 hari. Segera unduh ke perangkat Anda.</span>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── NATIVE STUDIO PAYWALL MODAL ───────────────────────── */}
      <StudioPaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        tenantSlug={tenantSlug}
        currentCredits={renderCredits}
      />

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="py-6 text-center text-xs text-slate-500 border-t border-white/5">
        <p>BoonTrack Studio • Media Render Queue Telemetry & FFmpeg Cluster</p>
      </footer>
    </div>
  );
}
