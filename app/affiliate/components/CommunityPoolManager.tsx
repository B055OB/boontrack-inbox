'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Bot,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Globe,
  Radio,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import { validateDemoUrl } from '@/lib/channels';

interface ChannelBindingItem {
  id?: string;
  binding_id: string;
  affiliate_id: string;
  community_source_id: string;
  channel_type: 'telegram' | 'whatsapp';
  channel_name: string;
  demo_url?: string;
  is_active?: boolean;
  created_at?: string;
}

interface CommunityPoolManagerProps {
  affiliateId: string;
  affiliateName?: string;
}

export default function CommunityPoolManager({
  affiliateId,
  affiliateName,
}: CommunityPoolManagerProps) {
  const [channelType, setChannelType] = useState<'telegram' | 'whatsapp'>('telegram');
  const [channelName, setChannelName] = useState('');
  const [communitySourceId, setCommunitySourceId] = useState('');
  const [demoUrl, setDemoUrl] = useState('');
  const [demoUrlError, setDemoUrlError] = useState('');

  const [pools, setPools] = useState<ChannelBindingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedPoolId, setCopiedPoolId] = useState<string | null>(null);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => {
      setNotice(null);
    }, 6000);
  };

  const getAuthToken = useCallback(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('affiliate_token') || '';
  }, []);

  // Fetch active community pools
  const fetchPools = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/v1/affiliate/channels', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setPools(data.data);
      }
    } catch (err: any) {
      console.warn('[CommunityPoolManager] Fetch pools error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [getAuthToken]);

  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  // Live demo URL validation
  const handleDemoUrlChange = (val: string) => {
    setDemoUrl(val);
    if (!val.trim()) {
      setDemoUrlError('');
      return;
    }
    const valResult = validateDemoUrl(val);
    if (!valResult.valid) {
      setDemoUrlError(valResult.error || 'Tautan demo wajib menggunakan ekosistem boontrack.com');
    } else {
      setDemoUrlError('');
    }
  };

  // Submit new pool binding
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelName.trim()) {
      showNotice('error', 'Nama kolam komunitas wajib diisi.');
      return;
    }
    if (!communitySourceId.trim()) {
      showNotice('error', 'ID Grup Telegram atau WA Group JID wajib diisi.');
      return;
    }

    if (demoUrl.trim()) {
      const valResult = validateDemoUrl(demoUrl);
      if (!valResult.valid) {
        showNotice('error', valResult.error || 'Tautan demo wajib menggunakan ekosistem boontrack.com');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/v1/affiliate/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          channel_type: channelType,
          channel_name: channelName.trim(),
          community_source_id: communitySourceId.trim(),
          demo_url: demoUrl.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showNotice('success', data.message || 'Kolam komunitas berhasil diaktifkan!');
        setChannelName('');
        setCommunitySourceId('');
        setDemoUrl('');
        setDemoUrlError('');
        fetchPools();
      } else {
        showNotice('error', data.error || 'Gagal menyimpan kolam komunitas.');
      }
    } catch (err: any) {
      showNotice('error', err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete pool binding
  const handleDelete = async (pool: ChannelBindingItem) => {
    const confirmMsg = `Putuskan sambungan bot dari kolam "${pool.channel_name}"?`;
    if (!confirm(confirmMsg)) return;

    const targetId = pool.id || pool.community_source_id;
    setDeletingId(targetId);

    try {
      const token = getAuthToken();
      const paramKey = pool.id ? `id=${encodeURIComponent(pool.id)}` : `source_id=${encodeURIComponent(pool.community_source_id)}`;
      const res = await fetch(`/api/v1/affiliate/channels?${paramKey}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (data.success) {
        showNotice('success', 'Kolam komunitas berhasil diputuskan.');
        fetchPools();
      } else {
        showNotice('error', data.error || 'Gagal memutuskan kolam.');
      }
    } catch (err: any) {
      showNotice('error', err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setDeletingId(null);
    }
  };

  // Copy referral link with granular attribution
  const handleCopyLink = (sourceId: string, poolKey: string) => {
    const effectiveAffiliate = affiliateId || 'ob';
    const link = `https://dashboard.boontrack.com/register?ref=${encodeURIComponent(effectiveAffiliate)}&src=${encodeURIComponent(sourceId)}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(link);
      setCopiedPoolId(poolKey);
      setTimeout(() => setCopiedPoolId(null), 2500);
    }
  };

  const effectiveAffId = affiliateId || 'ob';

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-2xl text-indigo-400 shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white">
                Otomasi Kolam Komunitas (BoonPilot Bot)
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-[10px] font-bold text-indigo-300">
                §43 Context-Capability
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Daftarkan grup Telegram & WhatsApp Anda sebagai <strong className="text-slate-200">Kolam Edukasi</strong>. Saat anggota grup mem-mention <code className="text-emerald-400 font-mono font-bold bg-slate-950 px-1 py-0.5 rounded">@boon</code>, bot akan membalas otomatis menyajikan <strong className="text-slate-200">Tautan Demo Pilihan Anda</strong> dan link coba gratis yang terikat ke kode komisi Anda.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchPools}
          disabled={isLoading}
          className="self-start sm:self-auto p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer disabled:opacity-50"
          title="Segarkan daftar kolam"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Segarkan</span>
        </button>
      </div>

      {/* Notice Alert */}
      {notice && (
        <div
          className={`p-3.5 rounded-2xl flex items-center gap-2.5 text-xs font-semibold transition ${
            notice.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
          }`}
        >
          {notice.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Form Hubungkan Kolam Baru */}
      <form onSubmit={handleSubmit} className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Hubungkan Kolam Komunitas Baru
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 1. Pilih Saluran */}
          <div>
            <label className="text-[11px] font-bold text-slate-300 block mb-1.5">
              Pilih Saluran Kolam:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setChannelType('telegram')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                  channelType === 'telegram'
                    ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-md shadow-sky-500/10'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Send className="w-3.5 h-3.5 text-sky-400" />
                <span>Grup Telegram</span>
              </button>

              <button
                type="button"
                onClick={() => setChannelType('whatsapp')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                  channelType === 'whatsapp'
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 shadow-md shadow-emerald-500/10'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                <span>Grup WhatsApp</span>
              </button>
            </div>
          </div>

          {/* 2. Nama Kolam */}
          <div>
            <label className="text-[11px] font-bold text-slate-300 block mb-1.5">
              Nama / Label Kolam:
            </label>
            <input
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder='Contoh: "Komunitas Scaleup Ads BDG"'
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* 3. Group Identifier */}
          <div>
            <label className="text-[11px] font-bold text-slate-300 block mb-1.5">
              {channelType === 'telegram' ? 'Telegram Chat ID (Grup):' : 'WhatsApp Group JID / Nomor Bot:'}
            </label>
            <input
              type="text"
              value={communitySourceId}
              onChange={(e) => setCommunitySourceId(e.target.value)}
              placeholder={channelType === 'telegram' ? 'Contoh: -1002345678901' : 'Contoh: 1203630248292839@g.us'}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[10px] text-slate-400 mt-1 flex items-start gap-1">
              <HelpCircle className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
              <span>
                {channelType === 'telegram'
                  ? 'Undang @boonshop_bot ke grup Anda, jadikan admin, lalu ketik /id untuk melihat ID grup.'
                  : 'Undang nomor bot resmi WhatsApp 081215567168 ke grup WhatsApp Anda.'}
              </span>
            </p>
          </div>

          {/* 4. Tautan Demo Contoh (Strict Boontrack Domain Guard) */}
          <div>
            <label className="text-[11px] font-bold text-slate-300 block mb-1.5 flex items-center justify-between">
              <span>Tautan Demo Toko / Single-Page Checkout (Opsional):</span>
              <span className="text-[10px] text-emerald-400 font-normal">Wajib boontrack.com</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={demoUrl}
                onChange={(e) => handleDemoUrlChange(e.target.value)}
                placeholder="https://shop.boontrack.com/nama-toko atau .../p/produk"
                className={`w-full bg-slate-900 border rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition ${
                  demoUrlError ? 'border-rose-500 focus:border-rose-400' : 'border-slate-800 focus:border-indigo-500'
                }`}
              />
              <Globe className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-2.5 pointer-events-none" />
            </div>

            {demoUrlError ? (
              <p className="text-[10px] text-rose-400 font-semibold mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                <span>{demoUrlError}</span>
              </p>
            ) : (
              <p className="text-[10px] text-slate-400 mt-1">
                Default: <code className="text-slate-300 font-mono">https://shop.boontrack.com/toko-demo</code> jika dikosongkan.
              </p>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-2 border-t border-slate-800/80">
          <button
            type="submit"
            disabled={isSubmitting || Boolean(demoUrlError)}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-black rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                <span>Menyimpan Kolam...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-slate-950" />
                <span>Simpan &amp; Aktifkan Kolam</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Daftar Kolam Aktif */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <span>Daftar Kolam Komunitas Terdaftar</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-mono text-slate-300 font-bold">
              {pools.length}
            </span>
          </h3>
          <span className="text-[11px] text-slate-400">
            Mitra: <strong className="text-slate-200 font-mono">{effectiveAffId}</strong>
          </span>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-slate-500 bg-slate-950/40 rounded-2xl border border-slate-800/60">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
            <span>Memuat kolam komunitas...</span>
          </div>
        ) : pools.length === 0 ? (
          <div className="py-8 px-4 text-center bg-slate-950/40 rounded-2xl border border-slate-800/60 space-y-2">
            <Bot className="w-8 h-8 text-slate-600 mx-auto" />
            <div className="text-xs font-bold text-slate-300">Belum ada kolam komunitas yang terhubung</div>
            <p className="text-[11px] text-slate-400 max-w-md mx-auto">
              Hubungkan grup Telegram atau WhatsApp Anda di atas. Bot @boon akan otomatis aktif mempromosikan produk &amp; link referral Anda saat di-mention di grup tersebut.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {pools.map((pool, idx) => {
              const poolKey = pool.id || pool.community_source_id || String(idx);
              const referralLink = `https://dashboard.boontrack.com/register?ref=${encodeURIComponent(effectiveAffId)}&src=${encodeURIComponent(pool.community_source_id)}`;
              const effectiveDemo = pool.demo_url || 'https://shop.boontrack.com/toko-demo';
              const isDeleting = deletingId === (pool.id || pool.community_source_id);

              return (
                <div
                  key={poolKey}
                  className="bg-slate-950/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 transition space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {pool.channel_type === 'telegram' ? (
                        <div className="p-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 shrink-0">
                          <Send className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shrink-0">
                          <MessageSquare className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-white truncate">
                            {pool.channel_name}
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold font-mono uppercase ${
                              pool.channel_type === 'telegram'
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {pool.channel_type}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          ID: <span className="text-slate-300">{pool.community_source_id}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>Aktif Auto-Reply @boon</span>
                      </span>

                      <button
                        type="button"
                        onClick={() => handleDelete(pool)}
                        disabled={isDeleting}
                        className="p-1.5 bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-500/30 rounded-xl transition cursor-pointer disabled:opacity-50"
                        title="Putuskan sambungan kolam"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Demo URL & Referral Link Preview */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 border-t border-slate-900 text-xs">
                    {/* Demo URL */}
                    <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-800/60">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
                        <span>Contoh Demo Produk/Toko:</span>
                        <a
                          href={effectiveDemo}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                        >
                          <span>Buka</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <div className="text-[11px] font-mono text-slate-300 truncate">
                        {effectiveDemo}
                      </div>
                    </div>

                    {/* Copyable Referral Link with src Attribution */}
                    <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-800/60 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Tautan Afiliasi Kolam:
                        </div>
                        <div className="text-[11px] font-mono text-emerald-300 truncate">
                          {referralLink}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyLink(pool.community_source_id, poolKey)}
                        className="shrink-0 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                      >
                        {copiedPoolId === poolKey ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-emerald-400" />
                            <span>Salin Link</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
