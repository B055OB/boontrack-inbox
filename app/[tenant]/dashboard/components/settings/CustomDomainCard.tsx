'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  CheckCircle2,
  Copy,
  Check,
  ArrowRight,
  ShieldCheck,
  Lock,
  RefreshCw,
  Trash2,
  AlertCircle,
  ExternalLink,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react';

interface CustomDomainCardProps {
  tenantSlug: string;
  isTeamScale: boolean;
  initialDomain?: string;
}

interface DomainStatusData {
  status: 'not_configured' | 'pending' | 'active' | string;
  tenant_slug?: string;
  custom_domain?: string | null;
  cloudflare_hostname_id?: string | null;
  custom_domain_status?: string | null;
  ssl_status?: string | null;
  is_active?: boolean;
  cname_target?: string;
  message?: string;
  detail?: string;
}

export default function CustomDomainCard({
  tenantSlug,
  isTeamScale,
  initialDomain = '',
}: CustomDomainCardProps) {
  const [domainInput, setDomainInput] = useState(initialDomain);
  const [activeDomain, setActiveDomain] = useState<string | null>(initialDomain || null);
  const [domainStatus, setDomainStatus] = useState<'IDLE' | 'PENDING' | 'ACTIVE'>('IDLE');
  const [cnameTarget, setCnameTarget] = useState('shop.boontrack.com');

  // Loading states
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Modals & Feedback states
  const [copiedTarget, setCopiedTarget] = useState(false);
  const [copiedHost, setCopiedHost] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<{ type: 'success' | 'info' | 'warning'; text: string } | null>(null);

  // Helper pembersih format input domain
  const cleanDomain = (input: string): string => {
    let val = input.trim().toLowerCase();
    // Hilangkan protokol http:// atau https://
    val = val.replace(/^https?:\/\//, '');
    // Hilangkan path trailing slash
    val = val.replace(/\/.*$/, '');
    return val;
  };

  // Validasi format domain standar (FQDN)
  const isValidDomain = (domain: string): boolean => {
    const pattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
    return pattern.test(domain);
  };

  // Kalkulasi Host / Name record DNS (@ atau subdomain)
  const getDnsHost = (domain: string): { host: string; isSubdomain: boolean } => {
    const parts = domain.split('.');
    if (parts.length > 2) {
      return { host: parts[0], isSubdomain: true };
    }
    return { host: '@', isSubdomain: false };
  };

  // 1. Fetch status custom domain dari API Gateway
  const fetchDomainStatus = useCallback(
    async (showFeedback = false) => {
      if (!tenantSlug) return;
      if (showFeedback) setIsCheckingStatus(true);
      setErrorMessage(null);

      try {
        const res = await fetch(
          `/api/v1/store/custom-domain/status?tenant_slug=${encodeURIComponent(tenantSlug)}`,
          { cache: 'no-store' }
        );

        if (!res.ok) {
          throw new Error(`Status HTTP ${res.status}`);
        }

        const data: DomainStatusData = await res.json();

        if (data.cname_target) {
          setCnameTarget(data.cname_target);
        }

        if (data.custom_domain) {
          setActiveDomain(data.custom_domain);
          setDomainInput(data.custom_domain);

          if (data.is_active || data.status === 'active') {
            setDomainStatus('ACTIVE');
            if (showFeedback) {
              setFeedbackNotice({
                type: 'success',
                text: 'Selamat! Custom domain telah aktif dan terlindungi sertifikat SSL.',
              });
            }
          } else {
            setDomainStatus('PENDING');
            if (showFeedback) {
              setFeedbackNotice({
                type: 'info',
                text: 'DNS masih dalam tahap propagasi oleh Cloudflare. Silakan periksa kembali dalam beberapa menit.',
              });
            }
          }
        } else {
          setActiveDomain(null);
          setDomainStatus('IDLE');
        }
      } catch (err: unknown) {
        console.error('[CustomDomainCard] Error fetching status:', err);
        if (showFeedback) {
          setErrorMessage('Gagal memeriksa status domain. Silakan coba beberapa saat lagi.');
        }
      } finally {
        setIsInitialLoading(false);
        if (showFeedback) setIsCheckingStatus(false);
      }
    },
    [tenantSlug]
  );

  useEffect(() => {
    fetchDomainStatus();
  }, [fetchDomainStatus]);

  // 2. Hubungkan domain baru (POST)
  const handleConnectDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setFeedbackNotice(null);

    const cleaned = cleanDomain(domainInput);
    if (!cleaned) {
      setErrorMessage('Silakan masukkan nama domain atau subdomain Anda.');
      return;
    }

    if (!isValidDomain(cleaned)) {
      setErrorMessage(
        'Format domain tidak valid. Pastikan tanpa http:// (contoh: toko.brandanda.com atau brandanda.com).'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/store/custom-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          domain: cleaned,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setErrorMessage(
          'Domain ini sudah digunakan oleh toko atau akun lain. Silakan gunakan domain atau subdomain yang berbeda.'
        );
        return;
      }

      if (!res.ok) {
        const errorText = data.detail || data.message || 'Gagal menghubungkan domain.';
        setErrorMessage(errorText);
        return;
      }

      // Registrasi berhasil
      setActiveDomain(cleaned);
      setDomainInput(cleaned);
      setDomainStatus('PENDING');
      setFeedbackNotice({
        type: 'success',
        text: 'Domain berhasil didaftarkan! Silakan buat DNS Record CNAME sesuai panduan di bawah.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi gangguan koneksi.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Putuskan Custom Domain (DELETE)
  const handleDisconnectDomain = async () => {
    setIsDisconnecting(true);
    setErrorMessage(null);
    setFeedbackNotice(null);

    try {
      const res = await fetch(
        `/api/v1/store/custom-domain?tenant_slug=${encodeURIComponent(tenantSlug)}`,
        {
          method: 'DELETE',
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorText = data.detail || data.message || 'Gagal memutuskan domain.';
        setErrorMessage(errorText);
        return;
      }

      // Berhasil dihapus
      setActiveDomain(null);
      setDomainInput('');
      setDomainStatus('IDLE');
      setShowConfirmModal(false);
      setFeedbackNotice({
        type: 'info',
        text: 'Domain berhasil diputuskan dari toko.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghubungi server.';
      setErrorMessage(msg);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const copyToClipboard = (txt: string, isHost = false) => {
    navigator.clipboard.writeText(txt);
    if (isHost) {
      setCopiedHost(true);
      setTimeout(() => setCopiedHost(false), 1500);
    } else {
      setCopiedTarget(true);
      setTimeout(() => setCopiedTarget(false), 1500);
    }
  };

  const hostRecordInfo = activeDomain ? getDnsHost(activeDomain) : { host: '@', isSubdomain: false };

  return (
    <div className="bg-white dark:bg-[#0D1117] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-xs relative text-slate-900 dark:text-slate-100">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200/70 dark:border-purple-800/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Custom Domain Sendiri</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                Team Scale
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Gunakan domain atau subdomain toko Anda sendiri (contoh: toko.brandanda.com)
            </p>
          </div>
        </div>

        {!isTeamScale && (
          <span className="px-2.5 py-1 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg text-xs font-semibold flex items-center gap-1 self-start shrink-0">
            <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> Terkunci (499k)
          </span>
        )}
      </div>

      {/* Jika Belum Team Scale */}
      {!isTeamScale ? (
        <div className="p-4 bg-slate-50/70 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-2">
          <p>
            Tingkatkan paket Anda ke <strong className="text-slate-900 dark:text-slate-100">Team Scale (499k)</strong> untuk menghubungkan domain mandiri
            lengkap dengan SSL otomatis (Cloudflare for SaaS) tanpa perlu setup server manual.
          </p>
        </div>
      ) : isInitialLoading ? (
        <div className="p-6 bg-slate-50/70 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
          <RefreshCw className="w-4 h-4 animate-spin text-purple-600 dark:text-purple-400" />
          <span>Memeriksa konfigurasi domain...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Banner Feedback / Error Notifications */}
          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {feedbackNotice && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 animate-fadeIn ${
                feedbackNotice.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                  : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60 text-blue-800 dark:text-blue-300'
              }`}
            >
              {feedbackNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 font-medium">{feedbackNotice.text}</div>
            </div>
          )}

          {/* STATE 1: IDLE (Belum ada domain terdaftar) */}
          {domainStatus === 'IDLE' && (
            <form onSubmit={handleConnectDomain} className="space-y-2.5">
              <label className="block text-xs font-semibold text-slate-900 dark:text-slate-100">
                Nama Domain atau Subdomain
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                    <Globe className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={domainInput}
                    onChange={(e) => {
                      setDomainInput(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="contoh: toko.brandanda.com"
                    disabled={isSubmitting}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-mono focus:border-purple-600 dark:focus:border-purple-500 outline-none transition"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting || !domainInput.trim()}
                  className="w-full sm:w-auto px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition cursor-pointer shadow-xs flex items-center justify-center gap-1.5 shrink-0"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menghubungkan...</span>
                    </>
                  ) : (
                    <>
                      <span>Hubungkan Domain</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Bisa menggunakan root domain (misal: <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono">tokoanda.com</code>) atau subdomain (misal: <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono">toko.tokoanda.com</code>).
              </p>
            </form>
          )}

          {/* STATE 2: PENDING (Domain terdaftar, menunggu propagasi DNS) */}
          {domainStatus === 'PENDING' && activeDomain && (
            <div className="p-4 bg-slate-50/70 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
              {/* Status Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Domain:</span>
                  <span className="font-mono font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800 truncate">
                    {activeDomain}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg font-semibold text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Menunggu Propagasi DNS
                </span>
              </div>

              {/* Panduan Konfigurasi DNS */}
              <div className="space-y-2">
                <div className="font-semibold text-slate-900 dark:text-slate-100 flex flex-wrap items-center justify-between gap-1">
                  <span>Panduan Pengaturan DNS (CNAME Record):</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">Cloudflare / Hostinger / Niagahoster</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Buka pengaturan DNS di penyedia domain Anda, lalu tambahkan DNS Record berikut:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-white dark:bg-[#0D1117] p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 font-mono text-[11px]">
                  {/* Tipe */}
                  <div className="border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-800 pb-2 sm:pb-0 sm:pr-2">
                    <span className="text-slate-500 dark:text-slate-400 block text-[9px] font-sans font-semibold">TIPE</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">CNAME</span>
                  </div>

                  {/* Name / Host */}
                  <div className="border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-800 pb-2 sm:pb-0 sm:pr-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-slate-500 dark:text-slate-400 block text-[9px] font-sans font-semibold">
                        NAME / HOST {hostRecordInfo.isSubdomain ? '(Subdomain)' : '(@ atau root)'}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate block">{hostRecordInfo.host}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(hostRecordInfo.host, true)}
                      title="Salin Host"
                      className="text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
                    >
                      {copiedHost ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Target */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-slate-500 dark:text-slate-400 block text-[9px] font-sans font-semibold">TARGET / VALUE</span>
                      <span className="font-bold text-purple-700 dark:text-purple-300 text-xs truncate block">{cnameTarget}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(cnameTarget, false)}
                      title="Salin Target"
                      className="text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
                    >
                      {copiedTarget ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Sertifikat SSL otomatis diterbitkan setelah record CNAME terverifikasi oleh Cloudflare.</span>
                </div>
              </div>

              {/* Action Buttons: Periksa Status & Putuskan Domain */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2.5 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isCheckingStatus}
                  onClick={() => fetchDomainStatus(true)}
                  className="w-full sm:w-auto px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                  <span>{isCheckingStatus ? 'Memeriksa...' : 'Periksa Status'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  className="w-full sm:w-auto px-3 py-2 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Batal / Putuskan Domain</span>
                </button>
              </div>
            </div>
          )}

          {/* STATE 3: ACTIVE (Domain aktif & SSL terpasang) */}
          {domainStatus === 'ACTIVE' && activeDomain && (
            <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/25 rounded-xl border border-emerald-200 dark:border-emerald-900/60 space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {activeDomain}
                    </span>
                    <a
                      href={`https://${activeDomain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 inline-flex items-center gap-0.5 font-semibold text-[11px] shrink-0"
                      title="Buka Website"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Toko Anda kini dapat diakses langsung oleh pelanggan melalui domain ini.
                  </p>
                </div>

                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg font-semibold text-xs shrink-0">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Aktif &amp; Terlindungi SSL</span>
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2.5 border-t border-emerald-200/70 dark:border-emerald-900/50">
                <button
                  type="button"
                  disabled={isCheckingStatus}
                  onClick={() => fetchDomainStatus(true)}
                  className="w-full sm:w-auto px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                  <span>{isCheckingStatus ? 'Memeriksa...' : 'Periksa Ulang'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  className="w-full sm:w-auto px-3 py-2 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Putuskan Domain</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal Putuskan Domain */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white dark:bg-[#0D1117] text-slate-900 dark:text-slate-100 rounded-2xl max-w-sm w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="w-11 h-11 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Putuskan Custom Domain?</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Apakah Anda yakin ingin memutuskan domain <strong className="font-mono text-slate-900 dark:text-slate-100">{activeDomain}</strong>?
                Toko tidak akan dapat diakses dari domain ini lagi sampai Anda menghubungkannya kembali.
              </p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDisconnecting}
                onClick={() => setShowConfirmModal(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDisconnecting}
                onClick={handleDisconnectDomain}
                className="w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isDisconnecting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Memutuskan...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ya, Putuskan Domain</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}