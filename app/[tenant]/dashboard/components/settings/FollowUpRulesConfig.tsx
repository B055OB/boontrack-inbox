'use client';

import React, { useState, useEffect } from 'react';
import {
  CalendarClock,
  Sparkles,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Cake,
  MessageCircle,
  Clock,
  HeartHandshake,
  Bot,
  Info,
} from 'lucide-react';
import {
  FollowUpRules,
  DEFAULT_FOLLOW_UP_RULES,
  formatFollowUpTemplate,
} from '@/lib/crm';
import { getSupabase } from '@/lib/supabaseClient';

interface FollowUpRulesConfigProps {
  tenantSlug: string;
  tenantDisplayName?: string;
  onSaved?: (newRules: FollowUpRules) => void;
  isCompact?: boolean;
}

export default function FollowUpRulesConfig({
  tenantSlug,
  tenantDisplayName,
  onSaved,
  isCompact = false,
}: FollowUpRulesConfigProps) {
  const [rules, setRules] = useState<FollowUpRules>(DEFAULT_FOLLOW_UP_RULES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [previewTab, setPreviewTab] = useState<'h1' | 'h2' | 'birthday' | 'retention'>('h1');

  // Load rules directly from Supabase (SSOT)
  useEffect(() => {
    let isMounted = true;

    async function loadRules() {
      setIsLoading(true);
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data, error } = await supabase
            .from('tenants')
            .select('metadata')
            .eq('slug', tenantSlug)
            .maybeSingle();

          if (!error && data?.metadata?.followup_rules && isMounted) {
            setRules({
              ...DEFAULT_FOLLOW_UP_RULES,
              ...data.metadata.followup_rules,
            });
            setIsLoading(false);
            return;
          }
        }

        // Fallback to settings API
        const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`);
        if (res.ok) {
          const json = await res.json();
          if (json?.settings?.followup_rules && isMounted) {
            setRules({
              ...DEFAULT_FOLLOW_UP_RULES,
              ...json.settings.followup_rules,
            });
          }
        }
      } catch (err) {
        console.warn('[FollowUpRulesConfig] Error loading rules:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    if (tenantSlug) {
      loadRules();
    }

    return () => {
      isMounted = false;
    };
  }, [tenantSlug]);

  const handleSave = async () => {
    // Validate intervals
    const h1 = Math.max(1, Math.floor(Number(rules.h1Days) || 3));
    const h2 = Math.max(h1 + 1, Math.floor(Number(rules.h2Days) || 7));

    const sanitizedRules: FollowUpRules = {
      ...rules,
      h1Days: h1,
      h2Days: h2,
      h1Enabled: Boolean(rules.h1Enabled),
      h2Enabled: Boolean(rules.h2Enabled),
      birthdayEnabled: Boolean(rules.birthdayEnabled),
      retentionEnabled: Boolean(rules.retentionEnabled),
      h1Template: rules.h1Template.trim() || DEFAULT_FOLLOW_UP_RULES.h1Template,
      h2Template: rules.h2Template.trim() || DEFAULT_FOLLOW_UP_RULES.h2Template,
      birthdayTemplate: rules.birthdayTemplate.trim() || DEFAULT_FOLLOW_UP_RULES.birthdayTemplate,
      retentionTemplate:
        rules.retentionTemplate?.trim() || DEFAULT_FOLLOW_UP_RULES.retentionTemplate || '',
    };

    setIsSaving(true);
    setSaveStatus(null);

    try {
      // 1. Save via API
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          followup_rules: sanitizedRules,
        }),
      });

      if (!res.ok) {
        // Direct Supabase fallback
        const supabase = getSupabase();
        if (supabase) {
          const { data: current } = await supabase
            .from('tenants')
            .select('metadata')
            .eq('slug', tenantSlug)
            .maybeSingle();

          const newMetadata = {
            ...(current?.metadata || {}),
            followup_rules: sanitizedRules,
          };

          const { error: sbErr } = await supabase
            .from('tenants')
            .update({
              metadata: newMetadata,
              updated_at: new Date().toISOString(),
            })
            .eq('slug', tenantSlug);

          if (sbErr) throw sbErr;
        } else {
          throw new Error('Gagal menyimpan aturan ke server.');
        }
      }

      setRules(sanitizedRules);
      setSaveStatus({
        type: 'success',
        message: 'Jadwal & template pesan follow-up berhasil diperbarui!',
      });
      if (onSaved) onSaved(sanitizedRules);

      setTimeout(() => setSaveStatus(null), 4000);
    } catch (err: any) {
      console.error('[FollowUpRulesConfig] Save error:', err);
      setSaveStatus({
        type: 'error',
        message: err.message || 'Gagal menyimpan aturan. Silakan coba kembali.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefault = () => {
    if (confirm('Kembalikan jeda hari dan template pesan ke standar (H+3, H+7, & Ulang Tahun)?')) {
      setRules(DEFAULT_FOLLOW_UP_RULES);
    }
  };

  const insertVariable = (
    field: 'h1Template' | 'h2Template' | 'birthdayTemplate' | 'retentionTemplate',
    variableTag: string
  ) => {
    setRules((prev) => ({
      ...prev,
      [field]: (prev[field] || '') + ` ${variableTag}`,
    }));
  };

  const currentStore = tenantDisplayName || 'Toko Resmi';
  const sampleCustomer = 'Budi Santoso';

  const previewText = React.useMemo(() => {
    if (previewTab === 'birthday') {
      return formatFollowUpTemplate(rules.birthdayTemplate, {
        name: sampleCustomer,
        store: currentStore,
      });
    }
    if (previewTab === 'h1') {
      return formatFollowUpTemplate(rules.h1Template, {
        name: sampleCustomer,
        store: currentStore,
        days: rules.h1Days,
      });
    }
    if (previewTab === 'h2') {
      return formatFollowUpTemplate(rules.h2Template, {
        name: sampleCustomer,
        store: currentStore,
        days: rules.h2Days,
      });
    }
    return formatFollowUpTemplate(rules.retentionTemplate || '', {
      name: sampleCustomer,
      store: currentStore,
      days: 30,
    });
  }, [previewTab, rules, currentStore]);

  if (isLoading) {
    return (
      <div className="p-6 bg-white rounded-2xl border border-slate-200 text-center py-12">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs font-semibold text-slate-500">Memuat konfigurasi follow-up...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Header Banner */}
      <div className="p-5 bg-gradient-to-r from-emerald-50 via-teal-50/50 to-indigo-50/40 border-b border-emerald-100/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-xs shrink-0">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Aturan Otomasi Follow-Up &amp; Siklus Pelanggan
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Dinamis &amp; Multi-Tenant
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Atur jeda hari intervensi pasca-kunjungan dan kustomisasi template WhatsApp ucapan ulang tahun serta evaluasi berkala.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetDefault}
            disabled={isSaving}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            title="Kembalikan ke standar H+3 & H+7"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset Standar</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Menyimpan...' : 'Simpan Aturan'}</span>
          </button>
        </div>
      </div>

      {saveStatus && (
        <div
          className={`px-5 py-2.5 text-xs font-semibold flex items-center gap-2 border-b ${
            saveStatus.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {saveStatus.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{saveStatus.message}</span>
        </div>
      )}

      <div className="p-5 space-y-6">
        {/* Section 1: Jeda Hari Follow-Up Dinamis */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-emerald-600" />
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              1. Konfigurasi Jeda Hari Pasca Kunjungan / Transaksi
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Rule 1: First Follow-Up (H+X) */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 text-xs font-black flex items-center justify-center">
                    1
                  </span>
                  <div>
                    <span className="text-xs font-bold text-slate-800">
                      Follow-Up Pertama (Check-in Awal)
                    </span>
                    <p className="text-[11px] text-slate-500">Evaluasi respon/kondisi awal</p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rules.h1Enabled}
                    onChange={(e) =>
                      setRules((prev) => ({ ...prev, h1Enabled: e.target.checked }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                  Jeda Hari (H +):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={rules.h1Days}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setRules((prev) => ({
                        ...prev,
                        h1Days: isNaN(val) ? 1 : Math.max(1, val),
                      }));
                    }}
                    className="w-20 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-center text-slate-900 focus:outline-hidden focus:border-amber-500"
                  />
                  <span className="text-xs font-medium text-slate-500">
                    hari pasca kunjungan (Default: 3)
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-700">
                    Template Pesan WhatsApp H+{rules.h1Days}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => insertVariable('h1Template', '[nama]')}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-700 font-mono transition cursor-pointer"
                    >
                      +[nama]
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable('h1Template', '[toko]')}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-700 font-mono transition cursor-pointer"
                    >
                      +[toko]
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable('h1Template', '[hari]')}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-700 font-mono transition cursor-pointer"
                    >
                      +[hari]
                    </button>
                  </div>
                </div>
                <textarea
                  rows={3}
                  value={rules.h1Template}
                  onChange={(e) =>
                    setRules((prev) => ({ ...prev, h1Template: e.target.value }))
                  }
                  placeholder="Halo Ayah/Bunda [nama], bagaimana perkembangan si kecil setelah sesi..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-hidden focus:border-amber-500 font-sans leading-relaxed"
                />
              </div>
            </div>

            {/* Rule 2: Second Follow-Up (H+Y) */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-800 text-xs font-black flex items-center justify-center">
                    2
                  </span>
                  <div>
                    <span className="text-xs font-bold text-slate-800">
                      Follow-Up Kedua (Sesi Lanjutan)
                    </span>
                    <p className="text-[11px] text-slate-500">Evaluasi berkala / reservasi sesi</p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rules.h2Enabled}
                    onChange={(e) =>
                      setRules((prev) => ({ ...prev, h2Enabled: e.target.checked }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                  Jeda Hari (H +):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={rules.h1Days + 1}
                    max="180"
                    value={rules.h2Days}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setRules((prev) => ({
                        ...prev,
                        h2Days: isNaN(val) ? rules.h1Days + 1 : Math.max(rules.h1Days + 1, val),
                      }));
                    }}
                    className="w-20 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-center text-slate-900 focus:outline-hidden focus:border-blue-500"
                  />
                  <span className="text-xs font-medium text-slate-500">
                    hari pasca kunjungan (Default: 7)
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-700">
                    Template Pesan WhatsApp H+{rules.h2Days}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => insertVariable('h2Template', '[nama]')}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-700 font-mono transition cursor-pointer"
                    >
                      +[nama]
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable('h2Template', '[toko]')}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-700 font-mono transition cursor-pointer"
                    >
                      +[toko]
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable('h2Template', '[hari]')}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-700 font-mono transition cursor-pointer"
                    >
                      +[hari]
                    </button>
                  </div>
                </div>
                <textarea
                  rows={3}
                  value={rules.h2Template}
                  onChange={(e) =>
                    setRules((prev) => ({ ...prev, h2Template: e.target.value }))
                  }
                  placeholder="Halo Ayah/Bunda [nama], sudah 1 minggu sejak sesi kunjungan terakhir..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 font-sans leading-relaxed"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Birthday & Retention */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Cake className="w-4 h-4 text-rose-500" />
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              2. Ucapan Ulang Tahun Anak &amp; Re-Aktivasi Pasien Lama
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Birthday Reminder */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-rose-100 text-rose-700">
                    <Cake className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="text-xs font-bold text-slate-800">
                      Birthday Greeting &amp; Voucher
                    </span>
                    <p className="text-[11px] text-slate-500">Trigger otomatis saat tanggal lahir hari ini</p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rules.birthdayEnabled}
                    onChange={(e) =>
                      setRules((prev) => ({ ...prev, birthdayEnabled: e.target.checked }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500"></div>
                </label>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-700">
                    Template Ucapan Ulang Tahun
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => insertVariable('birthdayTemplate', '[nama]')}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-700 font-mono transition cursor-pointer"
                    >
                      +[nama]
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable('birthdayTemplate', '[toko]')}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-700 font-mono transition cursor-pointer"
                    >
                      +[toko]
                    </button>
                  </div>
                </div>
                <textarea
                  rows={3}
                  value={rules.birthdayTemplate}
                  onChange={(e) =>
                    setRules((prev) => ({ ...prev, birthdayTemplate: e.target.value }))
                  }
                  placeholder="Halo Ayah/Bunda [nama], Selamat Ulang Tahun untuk si kecil! 🎂🎉..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-hidden focus:border-rose-500 font-sans leading-relaxed"
                />
              </div>
            </div>

            {/* Retention / Re-activation */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
                    <HeartHandshake className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="text-xs font-bold text-slate-800">
                      Re-Aktivasi Pasien Lama (Retensi)
                    </span>
                    <p className="text-[11px] text-slate-500">Untuk kunjungan &gt; {rules.h2Days * 2} hari lalu</p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rules.retentionEnabled !== false}
                    onChange={(e) =>
                      setRules((prev) => ({ ...prev, retentionEnabled: e.target.checked }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-700">
                    Template Sapaan Re-Aktivasi
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => insertVariable('retentionTemplate', '[nama]')}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-700 font-mono transition cursor-pointer"
                    >
                      +[nama]
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable('retentionTemplate', '[toko]')}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-700 font-mono transition cursor-pointer"
                    >
                      +[toko]
                    </button>
                  </div>
                </div>
                <textarea
                  rows={3}
                  value={rules.retentionTemplate || ''}
                  onChange={(e) =>
                    setRules((prev) => ({ ...prev, retentionTemplate: e.target.value }))
                  }
                  placeholder="Halo Ayah/Bunda [nama], apa kabar si kecil? Sudah cukup lama sejak kunjungan terakhir..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-hidden focus:border-indigo-500 font-sans leading-relaxed"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: WhatsApp Chat Preview Box */}
        <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/40 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-emerald-700" />
              <span className="text-xs font-bold text-slate-800">
                Simulasi Tampilan Pesan WhatsApp (Live Preview)
              </span>
            </div>
            <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setPreviewTab('h1')}
                className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                  previewTab === 'h1'
                    ? 'bg-amber-100 text-amber-900'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                H+{rules.h1Days}
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('h2')}
                className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                  previewTab === 'h2'
                    ? 'bg-blue-100 text-blue-900'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                H+{rules.h2Days}
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('birthday')}
                className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                  previewTab === 'birthday'
                    ? 'bg-rose-100 text-rose-900'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                🎂 Ulang Tahun
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('retention')}
                className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                  previewTab === 'retention'
                    ? 'bg-indigo-100 text-indigo-900'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Retensi
              </button>
            </div>
          </div>

          {/* WhatsApp Chat Bubble */}
          <div className="p-3.5 bg-emerald-700/5 rounded-xl border border-emerald-600/10">
            <div className="max-w-md bg-white rounded-2xl rounded-tl-xs p-3.5 shadow-xs border border-emerald-100 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="font-bold text-emerald-800">{currentStore} (Official)</span>
                <span>09:00</span>
              </div>
              <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                {previewText}
              </p>
              <div className="flex justify-end items-center gap-1 text-[10px] text-slate-400">
                <span>09:00</span>
                <span className="text-emerald-600 font-bold">✓✓</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>
              Variabel <code>[nama]</code> akan otomatis diganti nama pelanggan, <code>[toko]</code> diganti nama klinik/toko Anda, dan <code>[hari]</code> diganti jumlah hari selisih.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
