'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  Users,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  Send,
  ShieldCheck,
  Zap,
  Info,
  Radio,
} from 'lucide-react';

interface TelegramAlertManagerProps {
  tenantSlug: string;
  displayName?: string;
  onSaved?: (message: string) => void;
}

export default function TelegramAlertManager({
  tenantSlug,
  displayName = 'Toko Anda',
  onSaved,
}: TelegramAlertManagerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState<string | null>(null);
  const [groupChatIdInput, setGroupChatIdInput] = useState('');
  const [tenantId, setTenantId] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const botUsername = 'boonshop_bot';
  const deepLinkTarget = tenantId || tenantSlug;
  const connectTelegramUrl = `https://t.me/${botUsername}?start=link_${encodeURIComponent(deepLinkTarget)}`;

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/notifications/telegram-link?slug=${encodeURIComponent(tenantSlug)}`);
      const data = await res.json();
      if (data.success) {
        setTelegramChatId(data.telegram_chat_id || null);
        if (data.tenant_id) {
          setTenantId(data.tenant_id);
        }
        if (data.telegram_chat_id && String(data.telegram_chat_id).startsWith('-')) {
          setGroupChatIdInput(data.telegram_chat_id);
        }
      }
    } catch (err: any) {
      console.warn('[TelegramAlertManager] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    if (type === 'success' && onSaved) {
      onSaved(text);
    }
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleSaveGroupChatId = async () => {
    const trimmed = groupChatIdInput.trim();
    if (!trimmed) {
      showNotice('error', 'Masukkan Chat ID grup Telegram terlebih dahulu.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/v1/notifications/telegram-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: tenantSlug,
          tenant_id: tenantId || undefined,
          telegram_chat_id: trimmed,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTelegramChatId(trimmed);
        showNotice('success', 'Group Chat ID Telegram berhasil disimpan & dihubungkan!');
      } else {
        showNotice('error', data.error || 'Gagal menyimpan Group Chat ID');
      }
    } catch (err: any) {
      showNotice('error', err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Putuskan sambungan notifikasi Telegram dari toko ini?')) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_chat_id: '' }),
      });
      const data = await res.json();
      if (data.success) {
        setTelegramChatId(null);
        setGroupChatIdInput('');
        showNotice('success', 'Sambungan Telegram berhasil dilepas.');
      } else {
        showNotice('error', data.error || 'Gagal memutuskan sambungan.');
      }
    } catch (err: any) {
      showNotice('error', err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTestAlert = async () => {
    if (!telegramChatId) return;
    setIsSendingTest(true);
    try {
      const res = await fetch('/api/v1/notifications/telegram-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: tenantSlug,
          telegram_chat_id: telegramChatId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showNotice('success', 'Pesan uji coba berhasil dikirim ke Telegram!');
      } else {
        showNotice('error', data.error || 'Gagal mengirim pesan uji coba.');
      }
    } catch (err: any) {
      showNotice('error', err.message || 'Gagal mengirim pesan uji coba.');
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(connectTelegramUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const isConnected = Boolean(telegramChatId);
  const isGroup = isConnected && String(telegramChatId).startsWith('-');

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto w-full space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-sky-600 via-indigo-600 to-blue-700 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute -right-6 -bottom-10 opacity-10 pointer-events-none">
          <MessageCircle className="w-56 h-56 text-white" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-xs text-xs font-semibold text-sky-100 mb-2 border border-white/20">
              <Zap className="w-3.5 h-3.5 text-yellow-300" />
              <span>Multi-Tenant Real-Time Alert Engine</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Integrasi Notifikasi Telegram
            </h1>
            <p className="text-sm text-sky-100 mt-1 max-w-xl">
              Terima notifikasi pesanan masuk, bukti transfer lunas, dan mutasi saldo penjualan secara instan langsung ke akun Telegram pribadi atau grup tim toko Anda.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchStatus}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-medium backdrop-blur-xs border border-white/20 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Segarkan Status</span>
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-sm font-medium flex items-center justify-between shadow-xs transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        </div>
      )}

      {/* Connection Status Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-100 gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              isConnected ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-400'
            }`}>
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Status Saluran Telegram</h2>
              <p className="text-xs text-slate-500">
                Toko: <span className="font-semibold text-slate-700">{displayName}</span> ({tenantSlug})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Terhubung: {telegramChatId} {isGroup ? '(Grup)' : '(Personal)'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Belum Terhubung
              </span>
            )}
          </div>
        </div>

        {/* Action Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* Card 1: 1-Click Personal / Store Admin Link */}
          <div className="flex flex-col justify-between p-5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Radio className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Opsi 1: Sambung 1-Klik (Akun Personal)
                </h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Cukup klik tombol di bawah, aplikasi Telegram akan terbuka dan bot{' '}
                <strong className="text-slate-800">@{botUsername}</strong> akan otomatis menghubungkan akun Anda ke toko ini tanpa input manual token bot.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <a
                href={connectTelegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 active:scale-[0.99] text-white font-semibold text-xs shadow-xs transition cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Sambungkan Akun Telegram</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-700 transition cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-600">Tautan Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin Tautan Deep Link</span>
                    </>
                  )}
                </button>

                {isConnected && (
                  <button
                    type="button"
                    onClick={handleSendTestAlert}
                    disabled={isSendingTest}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-sky-700 transition cursor-pointer"
                    title="Kirim pesan test ke Telegram"
                  >
                    <Send className="w-3.5 h-3.5 text-sky-600" />
                    <span>{isSendingTest ? 'Mengirim...' : 'Tes Notif'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Group Notification (Tim / Karyawan) */}
          <div className="flex flex-col justify-between p-5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Opsi 2: Telegram Group Chat ID (Opsional)
                </h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed mb-3">
                Untuk toko yang ingin notifikasi pesanan masuk ke grup tim/karyawan, masukkan ID grup di bawah ini.
              </p>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Telegram Group Chat ID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={groupChatIdInput}
                    onChange={(e) => setGroupChatIdInput(e.target.value)}
                    placeholder="Contoh: -100123456789"
                    className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleSaveGroupChatId}
                    disabled={isSaving}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>
              </div>
            </div>

            {/* Panduan Singkat */}
            <div className="p-3 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-600 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <Info className="w-3.5 h-3.5 text-indigo-600" />
                <span>Panduan Menghubungkan Grup:</span>
              </div>
              <ol className="list-decimal list-inside space-y-0.5 text-slate-500 pl-0.5">
                <li>Undang <strong className="text-slate-700">@{botUsername}</strong> ke grup Anda.</li>
                <li>Jadikan bot sebagai admin grup.</li>
                <li>Ketik <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-semibold">/id</code> di grup untuk mendapatkan Chat ID grup.</li>
                <li>Salin nomor ID (biasanya diawali tanda <code className="font-semibold text-slate-700">-</code>) ke form di atas lalu Simpan.</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Disconnect Option if Connected */}
        {isConnected && (
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>
                Notifikasi pesanan aktif dikirimkan ke Chat ID <strong className="text-slate-700 font-mono">{telegramChatId}</strong>.
              </span>
            </div>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isSaving}
              className="text-xs text-rose-600 hover:text-rose-700 font-semibold transition cursor-pointer hover:underline"
            >
              Putuskan Sambungan Telegram
            </button>
          </div>
        )}
      </div>

      {/* Feature Explainer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 font-bold">
            ⚡
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 mb-0.5">Alert Real-Time 0.1 Detik</h4>
            <p className="text-[11px] text-slate-500 leading-normal">
              Notifikasi pesanan berformat flexing langsung dikirimkan ke Telegram saat checkout diselesaikan.
            </p>
          </div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 font-bold">
            🛡️
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 mb-0.5">Aman Tanpa Token Pribadi</h4>
            <p className="text-[11px] text-slate-500 leading-normal">
              Tenant tidak perlu membuat bot token sendiri. Cukup hubungkan via bot resmi BoonTrack.
            </p>
          </div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 font-bold">
            👥
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 mb-0.5">Dukungan Grup Tim</h4>
            <p className="text-[11px] text-slate-500 leading-normal">
              Bisa disambungkan ke grup chat staf gudang, admin packing, atau tim operasional toko.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
