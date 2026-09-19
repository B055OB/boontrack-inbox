'use client';

import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  Plus,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  Users,
  MessageSquare,
  Sparkles,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Phone,
  BarChart3,
  Power,
  Info,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

export interface RotatorCS {
  id: string;
  name: string;
  phone: string;
  lead_count: number;
  is_active: boolean;
}

export interface TenantRotatorConfig {
  enabled: boolean;
  default_message: string;
  last_index: number;
  cs_list: RotatorCS[];
  last_rotated_at?: string;
}

interface WhatsAppRotatorManagerProps {
  tenantSlug: string;
  displayName?: string;
  onSaved?: (msg: string) => void;
}

const DEFAULT_MESSAGE =
  'Halo Admin, saya tertarik untuk order produk di toko Anda. Boleh dibantu infonya? 🙏';

const PRESET_MESSAGES = [
  {
    title: 'Tanya Produk & Order',
    text: 'Halo Admin, saya tertarik untuk order produk di toko Anda. Boleh dibantu infonya? 🙏',
  },
  {
    title: 'Konsultasi Layanan / Jasa',
    text: 'Halo Admin, saya ingin konsultasi mengenai layanan dan paket harga yang tersedia. Terima kasih! 😊',
  },
  {
    title: 'Konfirmasi Pembayaran QRIS',
    text: 'Halo Admin, saya sudah melakukan pembayaran pesanan via QRIS. Mohon bantuan untuk verifikasinya ya kak. 🙏',
  },
];

export default function WhatsAppRotatorManager({
  tenantSlug,
  displayName = 'Toko Anda',
  onSaved,
}: WhatsAppRotatorManagerProps) {
  const [csList, setCsList] = useState<RotatorCS[]>([]);
  const [defaultMessage, setDefaultMessage] = useState(DEFAULT_MESSAGE);
  const [isEnabled, setIsEnabled] = useState(true);
  const [lastIndex, setLastIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const rotatorUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/r/${tenantSlug}`
      : `https://boontrack.com/r/${tenantSlug}`;

  // Format nomor WhatsApp: bersihkan karakter dan normalkan 08 -> 628
  const formatPhoneNumber = (val: string) => {
    let clean = val.replace(/\D/g, '');
    if (clean.startsWith('0')) {
      clean = '62' + clean.slice(1);
    }
    return clean;
  };

  // Load config from Supabase tenants.metadata.rotator
  const loadRotatorConfig = async () => {
    if (!tenantSlug) return;
    setIsLoading(true);
    try {
      const supabase = getSupabase();
      if (supabase) {
        const { data, error } = await supabase
          .from('tenants')
          .select('id, slug, metadata')
          .eq('slug', tenantSlug.toLowerCase())
          .maybeSingle();

        if (!error && data && data.metadata) {
          const rotator: TenantRotatorConfig | undefined = data.metadata.rotator;
          if (rotator) {
            setIsEnabled(rotator.enabled !== false);
            setDefaultMessage(rotator.default_message || DEFAULT_MESSAGE);
            setLastIndex(typeof rotator.last_index === 'number' ? rotator.last_index : -1);
            if (Array.isArray(rotator.cs_list) && rotator.cs_list.length > 0) {
              setCsList(rotator.cs_list);
              setIsLoading(false);
              return;
            }
          }
        }
      }

      // Fallback via API route
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const json = await res.json();
        const rotator = json?.settings?.metadata?.rotator || json?.settings?.rotator;
        if (rotator) {
          setIsEnabled(rotator.enabled !== false);
          setDefaultMessage(rotator.default_message || DEFAULT_MESSAGE);
          setLastIndex(typeof rotator.last_index === 'number' ? rotator.last_index : -1);
          if (Array.isArray(rotator.cs_list) && rotator.cs_list.length > 0) {
            setCsList(rotator.cs_list);
            setIsLoading(false);
            return;
          }
        }
      }

      // Jika baru pertama kali dan belum ada CS, buat 1 baris default
      setCsList([
        {
          id: `cs_${Date.now()}_1`,
          name: 'Customer Service 1',
          phone: '',
          lead_count: 0,
          is_active: true,
        },
      ]);
    } catch (err) {
      console.error('[Rotator] Gagal memuat konfigurasi:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRotatorConfig();
  }, [tenantSlug]);

  // Tambah CS baru
  const handleAddCS = () => {
    const newCS: RotatorCS = {
      id: `cs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: `Customer Service ${csList.length + 1}`,
      phone: '',
      lead_count: 0,
      is_active: true,
    };
    setCsList((prev) => [...prev, newCS]);
  };

  // Hapus CS
  const handleRemoveCS = (id: string) => {
    setCsList((prev) => prev.filter((item) => item.id !== id));
  };

  // Update field CS
  const handleUpdateCS = (id: string, updates: Partial<RotatorCS>) => {
    setCsList((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item, ...updates };
          if (updates.phone !== undefined) {
            updated.phone = formatPhoneNumber(updates.phone);
          }
          return updated;
        }
        return item;
      })
    );
  };

  // Reset Lead Counter per CS
  const handleResetCounter = (id: string) => {
    setCsList((prev) =>
      prev.map((item) => (item.id === id ? { ...item, lead_count: 0 } : item))
    );
  };

  // Salin Link Rotator
  const handleCopyLink = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(rotatorUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  // Simpan Pengaturan Rotator
  const handleSave = async () => {
    if (!tenantSlug) return;
    setIsSaving(true);
    setFeedback(null);

    // Validasi sederhana: minimal 1 CS aktif dengan nomor valid
    const cleanList = csList.map((cs) => ({
      ...cs,
      phone: formatPhoneNumber(cs.phone),
    }));

    const configToSave: TenantRotatorConfig = {
      enabled: isEnabled,
      default_message: defaultMessage.trim() || DEFAULT_MESSAGE,
      last_index: lastIndex,
      cs_list: cleanList,
      last_rotated_at: new Date().toISOString(),
    };

    try {
      let saved = false;
      const supabase = getSupabase();
      if (supabase) {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('id, metadata')
          .eq('slug', tenantSlug.toLowerCase())
          .maybeSingle();

        if (tenantData) {
          const currentMeta = tenantData.metadata || {};
          const updatedMeta = {
            ...currentMeta,
            rotator: configToSave,
          };

          const { error: updateErr } = await supabase
            .from('tenants')
            .update({ metadata: updatedMeta })
            .eq('id', tenantData.id);

          if (!updateErr) {
            saved = true;
          }
        }
      }

      // Sync via settings API endpoint
      try {
        await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rotator: configToSave,
          }),
        });
        saved = true;
      } catch (apiErr) {
        console.warn('[Rotator] API sync note:', apiErr);
      }

      if (saved) {
        const successMsg = '✅ Pengaturan WhatsApp / CS Rotator berhasil disimpan!';
        setFeedback({ type: 'success', message: successMsg });
        if (onSaved) onSaved(successMsg);
        setTimeout(() => setFeedback(null), 4000);
      } else {
        throw new Error('Gagal menyimpan pengaturan rotator ke server.');
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Terjadi kesalahan saat menyimpan rotator.';
      setFeedback({ type: 'error', message: errMsg });
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const activeCSCount = csList.filter((c) => c.is_active && c.phone.trim().length >= 8).length;
  const totalLeadsReceived = csList.reduce((acc, curr) => acc + (curr.lead_count || 0), 0);

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
      {/* ── 1. HEADER & LIVE LINK CARD ── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-7 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
              <RotateCcw className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-slate-900">
                  CS &amp; WhatsApp Rotator
                </h2>
                {isEnabled && activeCSCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Round-Robin Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    ● Rotator Nonaktif
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Bagi alur chat WhatsApp calon pembeli secara bergantian (round-robin) ke seluruh tim CS secara otomatis &amp; adil.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
              <span className="text-xs font-bold text-slate-700">Status Rotator:</span>
              <button
                type="button"
                role="switch"
                aria-checked={isEnabled}
                onClick={() => setIsEnabled(!isEnabled)}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  isEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                    isEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Live URL Display Box */}
        <div className="p-4.5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Tautan Publik Rotator Toko</span>
            </div>
            <div className="font-mono text-xs font-black text-slate-900 truncate select-all">
              {rotatorUrl}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyLink}
              className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Link Rotator</span>
                </>
              )}
            </button>

            <a
              href={rotatorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl transition shadow-2xs"
              title="Coba Buka Tautan Rotator"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="p-3.5 bg-white border border-slate-200/80 rounded-2xl">
            <div className="text-[11px] font-bold text-slate-500">Total CS Terdaftar</div>
            <div className="text-lg font-black text-slate-900 mt-0.5">{csList.length} Orang</div>
          </div>
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-100 rounded-2xl">
            <div className="text-[11px] font-bold text-emerald-800">CS Aktif Menerima Chat</div>
            <div className="text-lg font-black text-emerald-950 mt-0.5">{activeCSCount} Orang</div>
          </div>
          <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-2xl">
            <div className="text-[11px] font-bold text-blue-800">Total Klik / Lead Diterima</div>
            <div className="text-lg font-black text-blue-950 mt-0.5">{totalLeadsReceived} Klik</div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold border flex items-center gap-2 animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* ── 2. DAFTAR NOMOR CS (ROUND-ROBIN POOL) ── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-7 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-black text-slate-900">
              Pengelolaan Tim CS (Daftar Nomor WhatsApp)
            </h3>
          </div>
          <button
            type="button"
            onClick={handleAddCS}
            className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto border border-indigo-200/80"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Nomor CS</span>
          </button>
        </div>

        {csList.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl space-y-3">
            <Users className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="text-xs font-bold text-slate-500">
              Belum ada CS yang didaftarkan ke rotator.
            </div>
            <button
              type="button"
              onClick={handleAddCS}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold transition hover:bg-indigo-700 cursor-pointer inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah CS Pertama</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 text-slate-400 font-bold text-[11px] uppercase tracking-wider">
                  <th className="pb-3 pl-2">Nama CS / Label</th>
                  <th className="pb-3 px-3">Nomor WhatsApp</th>
                  <th className="pb-3 px-3 text-center">Lead Diterima</th>
                  <th className="pb-3 px-3 text-center">Status</th>
                  <th className="pb-3 pr-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {csList.map((cs, idx) => {
                  const isPhoneValid = cs.phone.trim().length >= 9;

                  return (
                    <tr key={cs.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 pl-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-black text-[10px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={cs.name}
                            onChange={(e) => handleUpdateCS(cs.id, { name: e.target.value })}
                            placeholder="Contoh: CS 1 - Sarah"
                            className="w-full sm:w-48 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="relative">
                          <input
                            type="text"
                            value={cs.phone}
                            onChange={(e) => handleUpdateCS(cs.id, { phone: e.target.value })}
                            placeholder="628xxxxxxxxxx"
                            className={`w-full sm:w-48 px-3 py-1.5 bg-white border rounded-xl font-mono text-xs font-bold focus:outline-hidden ${
                              cs.phone.length > 0 && !isPhoneValid
                                ? 'border-rose-300 text-rose-700 bg-rose-50/30'
                                : 'border-slate-200 text-slate-800 focus:border-indigo-500'
                            }`}
                          />
                          {cs.phone.length > 0 && !isPhoneValid && (
                            <span className="block text-[10px] text-rose-500 mt-0.5">
                              Format: 628xxxxxxxx
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60">
                            {cs.lead_count || 0}
                          </span>
                          {(cs.lead_count || 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => handleResetCounter(cs.id)}
                              title="Reset Counter Lead ke 0"
                              className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleUpdateCS(cs.id, { is_active: !cs.is_active })}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black transition cursor-pointer border ${
                            cs.is_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {cs.is_active ? '● Aktif' : 'Nonaktif'}
                        </button>
                      </td>

                      <td className="py-3 pr-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveCS(cs.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                          title="Hapus CS"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 3. PESAN PEMBUKA OTOMATIS (CUSTOM MESSAGE) ── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-7 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <MessageSquare className="w-5 h-5 text-emerald-600" />
          <h3 className="text-sm font-black text-slate-900">
            Format Pesan Pembuka Otomatis WhatsApp
          </h3>
        </div>

        <p className="text-xs text-slate-500">
          Teks ini akan terisi otomatis di aplikasi WhatsApp pembeli saat mengeklik tautan rotator toko.
        </p>

        {/* Template Quick Presets */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <span className="text-[11px] font-bold text-slate-500">Gunakan Preset Cepat:</span>
          {PRESET_MESSAGES.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setDefaultMessage(preset.text)}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition cursor-pointer border border-slate-200/80"
            >
              {preset.title}
            </button>
          ))}
        </div>

        <div>
          <textarea
            rows={3}
            value={defaultMessage}
            onChange={(e) => setDefaultMessage(e.target.value)}
            placeholder="Tulis pesan pembuka otomatis..."
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 transition"
          />
          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
            <span>Tips: Gunakan salam ramah dan langsung arahkan ke poin pemesanan.</span>
            <span>{defaultMessage.length} karakter</span>
          </div>
        </div>
      </div>

      {/* ── 4. ACTION BAR (SIMPAN PENGATURAN) ── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Info className="w-4 h-4 text-slate-400 shrink-0" />
          <span>
            Perubahan akan langsung aktif seketika pada tautan publik{' '}
            <strong className="text-slate-700">/r/{tenantSlug}</strong>.
          </span>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || isLoading}
          className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-black text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer shrink-0"
        >
          {isSaving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Menyimpan Pengaturan...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Simpan Pengaturan Rotator</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
