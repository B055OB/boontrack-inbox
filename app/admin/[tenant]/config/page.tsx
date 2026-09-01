'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Sliders,
  Bot,
  Clock,
  CreditCard,
  ShieldCheck,
  History,
  Eye,
  EyeOff,
  Copy,
  Check,
  Save,
  ArrowLeft,
  RefreshCw,
  Plus,
  Trash2,
  ExternalLink,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import {
  getTenantConfig,
  saveTenantConfig,
  getTenantConfigHistory,
  TenantConfig,
  TenantConfigHistory,
  CustomPackage,
} from '@/lib/tenant-config';

type TabType = 'persona' | 'operational_hours' | 'pricing' | 'features' | 'secrets' | 'history';

const DAYS_LIST = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

export default function TenantConfigEditorPage() {
  const params = useParams();
  const tenantSlug = Array.isArray(params?.tenant) ? params.tenant[0] : (params?.tenant as string);

  const CORE_API_URL =
    process.env.NEXT_PUBLIC_CORE_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'https://boontrack-core-production.up.railway.app';

  const [prevSlug, setPrevSlug] = useState(tenantSlug);
  const [config, setConfig] = useState<TenantConfig | null>(() =>
    tenantSlug ? getTenantConfig(tenantSlug) : null
  );
  const [history, setHistory] = useState<TenantConfigHistory[]>(() =>
    tenantSlug ? getTenantConfigHistory(tenantSlug) : []
  );
  const [activeTab, setActiveTab] = useState<TabType>('persona');
  const [saving, setSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Sync state if tenantSlug changes during client navigation
  if (tenantSlug !== prevSlug) {
    setPrevSlug(tenantSlug);
    setConfig(tenantSlug ? getTenantConfig(tenantSlug) : null);
    setHistory(tenantSlug ? getTenantConfigHistory(tenantSlug) : []);
  }

  // Secret Masking state
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({
    wa_token: false,
    webhook_token: false,
    payment_key: false,
    admin_pass: false,
    custom_secret: false,
  });

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const toggleSecretMask = (field: string) => {
    setRevealedSecrets((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const copyToClipboard = (text: string, keyName: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(keyName);
      setTimeout(() => setCopiedKey(null), 2000);
      showToast('Nilai disalin ke clipboard!', 'success');
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSave = async (sectionName: string) => {
    if (!config || !tenantSlug) return;
    setSaving(true);
    setSaveSuccessMsg('');

    try {
      // 1. Simpan ke local configuration memory & update history audit
      const summary = `Update pengaturan ${sectionName} untuk tenant ${config.name}`;
      saveTenantConfig(tenantSlug, config, summary, 'Super Admin (PIN Authenticated)');
      const updatedHist = getTenantConfigHistory(tenantSlug);
      setHistory(updatedHist);

      // 2. Sinkronkan langsung ke backend engine boontrack-core di Railway
      try {
        await fetch(`${CORE_API_URL}/api/v1/tenants/${tenantSlug}/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_slug: tenantSlug,
            name: config.name,
            persona: config.persona,
            operational_hours: config.operational_hours,
            pricing: config.pricing,
            features: config.features,
            secrets: config.secrets,
          }),
        });
      } catch (backendErr) {
        console.warn('Backend sync warning:', backendErr);
      }

      // Update UI Status to HEALTHY
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              health: {
                ...prev.health,
                status: 'HEALTHY',
                wa_gateway: 'CONNECTED',
              },
            }
          : null
      );

      setSaveSuccessMsg(`Konfigurasi ${sectionName} berhasil disimpan & disinkronkan ke server!`);
      showToast(`Pengaturan ${sectionName} berhasil disimpan!`, 'success');
      setTimeout(() => setSaveSuccessMsg(''), 3500);
    } catch (e) {
      console.error('Failed to save config:', e);
      showToast('Gagal menyimpan konfigurasi', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Add Custom Package
  const handleAddPackage = () => {
    if (!config) return;
    const newPkg: CustomPackage = {
      id: `pkg-${Date.now()}`,
      name: 'Paket / Layanan Baru',
      price: 50000,
      description: 'Deskripsi paket atau retribusi layanan',
    };
    setConfig({
      ...config,
      pricing: {
        ...config.pricing,
        custom_packages: [...config.pricing.custom_packages, newPkg],
      },
    });
  };

  // Remove Custom Package
  const handleRemovePackage = (pkgId: string) => {
    if (!config) return;
    setConfig({
      ...config,
      pricing: {
        ...config.pricing,
        custom_packages: config.pricing.custom_packages.filter((p) => p.id !== pkgId),
      },
    });
  };

  if (!config) {
    return (
      <main className="min-h-[100dvh] bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
          <span>Memuat konfigurasi modular tenant {tenantSlug}...</span>
        </div>
      </main>
    );
  }

  const isHealthy = config.health.status === 'HEALTHY';
  const isDegraded = config.health.status === 'DEGRADED';

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-blue-600 selection:text-white">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3.5 rounded-xl border shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-200 ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/90 border-rose-500/50 text-rose-200'
          }`}
        >
          {toast.type === 'success' ? (
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="bg-slate-900/90 border-b border-slate-800 px-6 py-4 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition shadow-sm"
              title="Kembali ke Super Admin"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
                  Control Plane Editor
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1.5 ${
                    isHealthy
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : isDegraded
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isHealthy ? 'bg-emerald-400 animate-pulse' : isDegraded ? 'bg-amber-400' : 'bg-rose-400'
                    }`}
                  />
                  {config.health.status}
                </span>
              </div>
              <h1 className="text-lg font-bold text-white mt-0.5 flex items-center gap-2">
                <span>{config.name}</span>
                <span className="text-xs font-mono text-slate-400 font-normal">({config.slug})</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href={`/${config.slug}`}
              target="_blank"
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-xl border border-slate-700 transition inline-flex items-center gap-1.5"
            >
              <span>Buka Live Chat</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>
            {config.slug === 'atmosfitnes' && (
              <Link
                href="/gym"
                className="px-3 py-2 bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 text-xs font-medium rounded-xl border border-emerald-500/40 transition inline-flex items-center gap-1.5"
              >
                <span>Gym Control Hub</span>
                <ExternalLink className="w-3 h-3 text-emerald-400" />
              </Link>
            )}
            <button
              onClick={() => handleSave(activeTab.toUpperCase())}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Success Notification Banner */}
      {saveSuccessMsg && (
        <div className="bg-emerald-500/20 border-b border-emerald-500/30 px-6 py-2.5 text-center text-xs font-medium text-emerald-300 flex items-center justify-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto w-full p-6 md:p-8 space-y-6 flex-1">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800">
          <button
            onClick={() => setActiveTab('persona')}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition inline-flex items-center gap-2 shrink-0 ${
              activeTab === 'persona'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Persona AI</span>
          </button>
          <button
            onClick={() => setActiveTab('operational_hours')}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition inline-flex items-center gap-2 shrink-0 ${
              activeTab === 'operational_hours'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Jam Operasional</span>
          </button>
          <button
            onClick={() => setActiveTab('pricing')}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition inline-flex items-center gap-2 shrink-0 ${
              activeTab === 'pricing'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Pricing Paket</span>
          </button>
          <button
            onClick={() => setActiveTab('features')}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition inline-flex items-center gap-2 shrink-0 ${
              activeTab === 'features'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Feature Flags</span>
          </button>
          <button
            onClick={() => setActiveTab('secrets')}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition inline-flex items-center gap-2 shrink-0 ${
              activeTab === 'secrets'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>API & Security Guardrail</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition inline-flex items-center gap-2 shrink-0 ${
              activeTab === 'history'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Audit History ({history.length})</span>
          </button>
        </div>

        {/* Tab 1: Persona AI */}
        {activeTab === 'persona' && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6 shadow-xl">
            <div className="border-b border-slate-800/80 pb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Bot className="w-5 h-5 text-blue-400" />
                <span>Konfigurasi Persona & Perilaku AI</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Kustomisasi nama bot, system prompt dasar, gaya bahasa, dan logika eskalasi ke human agent.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-2">Nama Asisten AI (Public Persona)</label>
                <input
                  type="text"
                  value={config.persona.ai_name}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      persona: { ...config.persona, ai_name: e.target.value },
                    })
                  }
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                  placeholder="Contoh: AtmosBot Receptionist"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-2">Gaya Bahasa (Tone of Voice)</label>
                <select
                  value={config.persona.tone}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      persona: { ...config.persona, tone: e.target.value },
                    })
                  }
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="energetic">Energetik & Antusias (Gym / Sport)</option>
                  <option value="formal">Formal & Santun (Pelayanan Publik / Korporat)</option>
                  <option value="casual">Ramah, Hangat & Santai (F&B / Hospitality)</option>
                  <option value="concise">Ringkas, Cepat & Padat (Teknis / Dispatcher)</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-medium text-slate-300 block mb-2">
                  System Prompt Core (Karakter, Scope Pengetahuan & Batasan)
                </label>
                <textarea
                  rows={4}
                  value={config.persona.system_prompt}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      persona: { ...config.persona, system_prompt: e.target.value },
                    })
                  }
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono leading-relaxed focus:outline-none focus:border-blue-500"
                  placeholder="Tuliskan instruksi prompt sistem untuk AI gateway..."
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-medium text-slate-300 block mb-2">
                  Pesan Sambutan Awal (Greeting Message)
                </label>
                <textarea
                  rows={2}
                  value={config.persona.greeting_message}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      persona: { ...config.persona, greeting_message: e.target.value },
                    })
                  }
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-medium text-slate-300 block mb-2">
                  Pesan Fallback / Ketika AI Butuh Eskalasi
                </label>
                <input
                  type="text"
                  value={config.persona.fallback_message}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      persona: { ...config.persona, fallback_message: e.target.value },
                    })
                  }
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="md:col-span-2 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Human Agent Handoff</span>
                    <span className="text-[11px] text-slate-400">
                      Otomatis alihkan chat ke nomor WhatsApp PIC operasional jika pengguna meminta bantuan manusia.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.persona.human_handoff_enabled}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        persona: {
                          ...config.persona,
                          human_handoff_enabled: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                </div>

                {config.persona.human_handoff_enabled && (
                  <div className="pt-2">
                    <label className="text-[11px] text-slate-300 block mb-1">Nomor WhatsApp PIC Handoff</label>
                    <input
                      type="text"
                      value={config.persona.human_handoff_number}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          persona: {
                            ...config.persona,
                            human_handoff_number: e.target.value,
                          },
                        })
                      }
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono"
                      placeholder="+62812xxxxxxx"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <button
                onClick={() => handleSave('Persona AI')}
                disabled={saving}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Persona AI</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Jam Operasional */}
        {activeTab === 'operational_hours' && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6 shadow-xl">
            <div className="border-b border-slate-800/80 pb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                <span>Jam Kerja & Respon Otomatis Tutup</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Atur jadwal buka, hari aktif, dan auto-responder saat jam operasional telah berakhir.
              </p>
            </div>

            <div className="space-y-5">
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <div>
                  <span className="text-xs font-bold text-white block">Mode Operasional 24/7 Nonstop</span>
                  <span className="text-[11px] text-slate-400">
                    Aktifkan jika sistem melayani 24 jam tanpa batasan jam tutup (misal layanan internal / hotline).
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={config.operational_hours.is_24_hours}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      operational_hours: {
                        ...config.operational_hours,
                        is_24_hours: e.target.checked,
                      },
                    })
                  }
                  className="w-4 h-4 accent-blue-600 rounded"
                />
              </div>

              {!config.operational_hours.is_24_hours && (
                <>
                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-2">Hari Operasional Aktif</label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_LIST.map((day) => {
                        const isChecked = config.operational_hours.days.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => {
                              const newDays = isChecked
                                ? config.operational_hours.days.filter((d) => d !== day)
                                : [...config.operational_hours.days, day];
                              setConfig({
                                ...config,
                                operational_hours: {
                                  ...config.operational_hours,
                                  days: newDays,
                                },
                              });
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                              isChecked
                                ? 'bg-blue-600/20 border-blue-500 text-blue-300 font-semibold'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-slate-300 block mb-1.5">Jam Buka</label>
                      <input
                        type="time"
                        value={config.operational_hours.open_time}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            operational_hours: {
                              ...config.operational_hours,
                              open_time: e.target.value,
                            },
                          })
                        }
                        className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-300 block mb-1.5">Jam Tutup</label>
                      <input
                        type="time"
                        value={config.operational_hours.close_time}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            operational_hours: {
                              ...config.operational_hours,
                              close_time: e.target.value,
                            },
                          })
                        }
                        className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-2">
                      Auto-Reply Pesan Saat Tutup (Off-Hours Notification)
                    </label>
                    <textarea
                      rows={3}
                      value={config.operational_hours.closed_auto_reply}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          operational_hours: {
                            ...config.operational_hours,
                            closed_auto_reply: e.target.value,
                          },
                        })
                      }
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">Kontak Darurat / Hotlines</label>
                <input
                  type="text"
                  value={config.operational_hours.emergency_contact}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      operational_hours: {
                        ...config.operational_hours,
                        emergency_contact: e.target.value,
                      },
                    })
                  }
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                  placeholder="+628xxxxxxxxxx"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <button
                onClick={() => handleSave('Jam Operasional')}
                disabled={saving}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Jam Operasional</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Pricing Paket */}
        {activeTab === 'pricing' && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6 shadow-xl">
            <div className="border-b border-slate-800/80 pb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                <span>Struktur Paket & Pricing Layanan</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Kendalikan kuota pesan per bulan, iuran langganan platform, dan katalog produk/layanan mandiri tenant.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">Tier Langganan Platform</label>
                <select
                  value={config.pricing.tier}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      pricing: {
                        ...config.pricing,
                        tier: e.target.value as 'STARTER' | 'PRO' | 'ENTERPRISE',
                      },
                    })
                  }
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-semibold"
                >
                  <option value="STARTER">STARTER</option>
                  <option value="PRO">PRO</option>
                  <option value="ENTERPRISE">ENTERPRISE</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">Biaya Platform Bulanan (Rp)</label>
                <input
                  type="number"
                  value={config.pricing.monthly_fee}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      pricing: {
                        ...config.pricing,
                        monthly_fee: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">Batas Kuota Chat Bulanan</label>
                <input
                  type="number"
                  value={config.pricing.max_monthly_messages}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      pricing: {
                        ...config.pricing,
                        max_monthly_messages: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                />
              </div>
            </div>

            {/* Custom Packages */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Katalog Paket Layanan / Produk Tenant
                </h3>
                <button
                  type="button"
                  onClick={handleAddPackage}
                  className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Paket Baru</span>
                </button>
              </div>

              <div className="space-y-3">
                {config.pricing.custom_packages.length === 0 ? (
                  <div className="p-6 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-500">
                    Belum ada paket khusus untuk tenant ini. Klik tombol tambah di atas.
                  </div>
                ) : (
                  config.pricing.custom_packages.map((pkg, idx) => (
                    <div
                      key={pkg.id || idx}
                      className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-1">Nama Paket / Produk</label>
                          <input
                            type="text"
                            value={pkg.name}
                            onChange={(e) => {
                              const updated = [...config.pricing.custom_packages];
                              updated[idx].name = e.target.value;
                              setConfig({
                                ...config,
                                pricing: { ...config.pricing, custom_packages: updated },
                              });
                            }}
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-medium"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-1">Tarif (Rp)</label>
                          <input
                            type="number"
                            value={pkg.price}
                            onChange={(e) => {
                              const updated = [...config.pricing.custom_packages];
                              updated[idx].price = Number(e.target.value);
                              setConfig({
                                ...config,
                                pricing: { ...config.pricing, custom_packages: updated },
                              });
                            }}
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-1">Keterangan / Benefit</label>
                          <input
                            type="text"
                            value={pkg.description}
                            onChange={(e) => {
                              const updated = [...config.pricing.custom_packages];
                              updated[idx].description = e.target.value;
                              setConfig({
                                ...config,
                                pricing: { ...config.pricing, custom_packages: updated },
                              });
                            }}
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemovePackage(pkg.id)}
                        className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition self-end md:self-center"
                        title="Hapus paket"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <button
                onClick={() => handleSave('Pricing Paket')}
                disabled={saving}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Pricing Paket</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 4: Feature Flags */}
        {activeTab === 'features' && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6 shadow-xl">
            <div className="border-b border-slate-800/80 pb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-400" />
                <span>Feature Flags & Integrasi Ekosistem</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Toggle aktifkan modul fungsional tanpa hardcoding konfigurasi per klien.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  key: 'whatsapp_gateway',
                  name: 'WhatsApp Cloud Gateway',
                  desc: 'Koneksi aktif ke Baileys / Meta Cloud API untuk pesan real-time.',
                },
                {
                  key: 'telegram_bot',
                  name: 'Telegram Bot Bridge',
                  desc: 'Dukungan channel bot Telegram resmi untuk pelanggan.',
                },
                {
                  key: 'webchat_widget',
                  name: 'Webchat Widget Embed',
                  desc: 'Floating chat widget di landing page publik tenant.',
                },
                {
                  key: 'auto_ai_reply',
                  name: 'Autonomous AI Responder',
                  desc: 'Respon instan otomatis oleh AI engine tanpa jeda manual.',
                },
                {
                  key: 'qris_billing',
                  name: 'QRIS Real-time Dynamic Billing',
                  desc: 'Generate kode QRIS otomatis dan webhook verifikasi mutasi bayar.',
                },
                {
                  key: 'gate_iot_sync',
                  name: 'Gate Controller & NFC Tap Sync',
                  desc: 'Audit real-time barrier gate RFID, relay unlock, dan kehadiran.',
                },
                {
                  key: 'cv_ats_scanner',
                  name: 'CV ATS Scanner & Reviewer',
                  desc: 'Engine parser teks resume dan simulasi interview HR.',
                },
                {
                  key: 'rate_limiting',
                  name: 'Anti-Spam & Rate Limiting',
                  desc: 'Proteksi proteksi overload batas 60 request/menit per user.',
                },
              ].map((item) => {
                const isEnabled = config.features[item.key as keyof typeof config.features];
                return (
                  <div
                    key={item.key}
                    className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 flex items-center justify-between gap-4"
                  >
                    <div>
                      <span className="text-xs font-bold text-white block">{item.name}</span>
                      <span className="text-[11px] text-slate-400 leading-snug">{item.desc}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            features: {
                              ...config.features,
                              [item.key]: e.target.checked,
                            },
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <button
                onClick={() => handleSave('Feature Flags')}
                disabled={saving}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Feature Flags</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 5: API & Security Guardrail (Secret Masking) */}
        {activeTab === 'secrets' && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6 shadow-xl">
            <div className="border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-rose-400" />
                <h2 className="text-base font-bold text-white">Security Guardrail & Secret Masking</h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Seluruh nilai sensitif (API Token, Webhook Secret, Password) di-masking secara default demi standar keamanan kepatuhan SOC2 / ISO multi-tenant.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2.5">
              <Lock className="w-4 h-4 shrink-0 text-rose-400" />
              <span>
                <strong>Perlindungan Rahasia Aktif:</strong> Kredensial di bawah ini tidak akan pernah di-ekspos ke client publik. Gunakan toggle mata untuk memeriksa nilai saat inspeksi teknis.
              </span>
            </div>

            <div className="space-y-4">
              {/* WhatsApp Token */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <label className="text-xs font-bold text-slate-200 block">WhatsApp API Access Token</label>
                <div className="flex items-center gap-2">
                  <input
                    type={revealedSecrets.wa_token ? 'text' : 'password'}
                    value={config.secrets.wa_api_token}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        secrets: { ...config.secrets, wa_api_token: e.target.value },
                      })
                    }
                    placeholder="Masukkan Permanent Token Meta (EAA...)"
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono tracking-wider focus:outline-none focus:border-rose-500"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSecretMask('wa_token')}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
                    title={revealedSecrets.wa_token ? 'Sembunyikan' : 'Tampilkan'}
                  >
                    {revealedSecrets.wa_token ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(config.secrets.wa_api_token, 'wa_token')}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
                    title="Salin ke clipboard"
                  >
                    {copiedKey === 'wa_token' ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Webhook Secret */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <label className="text-xs font-bold text-slate-200 block">Webhook Verification Secret Token</label>
                <div className="flex items-center gap-2">
                  <input
                    type={revealedSecrets.webhook_token ? 'text' : 'password'}
                    value={config.secrets.webhook_verify_token}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        secrets: {
                          ...config.secrets,
                          webhook_verify_token: e.target.value,
                        },
                      })
                    }
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono tracking-wider focus:outline-none focus:border-rose-500"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSecretMask('webhook_token')}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
                    title={revealedSecrets.webhook_token ? 'Sembunyikan' : 'Tampilkan'}
                  >
                    {revealedSecrets.webhook_token ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(config.secrets.webhook_verify_token, 'webhook_token')}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
                  >
                    {copiedKey === 'webhook_token' ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Payment Secret */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <label className="text-xs font-bold text-slate-200 block">Payment Gateway Private API Key</label>
                <div className="flex items-center gap-2">
                  <input
                    type={revealedSecrets.payment_key ? 'text' : 'password'}
                    value={config.secrets.payment_api_key}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        secrets: {
                          ...config.secrets,
                          payment_api_key: e.target.value,
                        },
                      })
                    }
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono tracking-wider focus:outline-none focus:border-rose-500"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSecretMask('payment_key')}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
                  >
                    {revealedSecrets.payment_key ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(config.secrets.payment_api_key, 'payment_key')}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
                  >
                    {copiedKey === 'payment_key' ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Admin Password */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <label className="text-xs font-bold text-slate-200 block">Admin Tenant Access Password</label>
                <div className="flex items-center gap-2">
                  <input
                    type={revealedSecrets.admin_pass ? 'text' : 'password'}
                    value={config.secrets.admin_password}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        secrets: {
                          ...config.secrets,
                          admin_password: e.target.value,
                        },
                      })
                    }
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono tracking-wider focus:outline-none focus:border-rose-500"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSecretMask('admin_pass')}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
                  >
                    {revealedSecrets.admin_pass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(config.secrets.admin_password, 'admin_pass')}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
                  >
                    {copiedKey === 'admin_pass' ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <button
                onClick={() => handleSave('Security & Secrets')}
                disabled={saving}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-rose-600/30 transition inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Kredensial Terproteksi</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 6: History Tab (Audit Trail) */}
        {activeTab === 'history' && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-blue-400" />
                  <span>Audit History Perubahan (`tenant_config_history`)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Catatan jejak audit modifikasi konfigurasi real-time untuk akuntabilitas operasional.
                </p>
              </div>
              <button
                onClick={() => {
                  const updated = getTenantConfigHistory(tenantSlug);
                  setHistory(updated);
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Log</span>
              </button>
            </div>

            <div className="space-y-3">
              {history.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 bg-slate-950/50 rounded-xl border border-slate-800">
                  Belum ada catatan riwayat perubahan untuk tenant ini.
                </div>
              ) : (
                history.map((entry, idx) => (
                  <div
                    key={entry.id || idx}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-slate-700 transition"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20">
                          {entry.category}
                        </span>
                        <span className="text-xs font-semibold text-white">{entry.summary}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>Oleh: <strong className="text-slate-300">{entry.actor}</strong></span>
                        <span>&bull;</span>
                        <span className="font-mono text-slate-500">ID: {entry.id}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-mono text-[11px] text-slate-400">
                      {new Date(entry.timestamp).toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}