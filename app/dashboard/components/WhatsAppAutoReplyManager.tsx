'use client';

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sliders,
  Sparkles,
  Zap,
  Power,
  Search,
  ExternalLink,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

export interface AutoReplyRule {
  id: string;
  trigger: string;
  match_type: 'contains' | 'exact';
  reply_text: string;
  is_active: boolean;
  created_at?: string;
}

interface WhatsAppAutoReplyManagerProps {
  tenantSlug: string;
  displayName?: string;
  onSaved?: (msg: string) => void;
}

const TEMPLATE_PRESETS = [
  {
    title: 'Layanan / Jasa',
    trigger: 'min info layanan kuras torennya dong',
    match_type: 'contains' as const,
    reply_text: 'Halo Kak! Terima kasih telah menghubungi kami. Layanan kuras toren kami meliputi pembersihan kerak lumpur, lumut, hingga sterilisasi tangki. Silakan balas dengan alamat atau ukuran toren untuk kami jadwalkan ya! 🙏',
  },
  {
    title: 'Order / Checkout',
    trigger: 'mau order sekarang kak',
    match_type: 'contains' as const,
    reply_text: 'Halo Kak! Untuk order cepat, silakan sebutkan produk atau paket yang dipilih serta alamat pengiriman, atau langsung klik katalog kami di https://shop.boontrack.com/',
  },
  {
    title: 'Area Layanan',
    trigger: 'area mana saja',
    match_type: 'contains' as const,
    reply_text: 'Halo Kak! Kami melayani seluruh area Jabodetabek dan sekitarnya tanpa biaya survei awal. Kapan rencana pengerjaannya Kak?',
  },
];

export default function WhatsAppAutoReplyManager({
  tenantSlug,
  displayName,
  onSaved,
}: WhatsAppAutoReplyManagerProps) {
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Load Rules from Supabase tenants.metadata.auto_replies
  const loadRules = async () => {
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

        if (data && data.metadata) {
          const loaded = data.metadata.auto_replies;
          if (Array.isArray(loaded)) {
            setRules(loaded);
            setIsLoading(false);
            return;
          }
        }
      }

      // Fallback via API route
      const res = await fetch(`/api/v1/admin/tenants/${encodeURIComponent(tenantSlug)}/config`);
      if (res.ok) {
        const json = await res.json();
        const loaded = json?.data?.auto_replies || json?.tenant?.metadata?.auto_replies;
        if (Array.isArray(loaded)) {
          setRules(loaded);
        }
      }
    } catch (err: any) {
      console.error('[AutoReply] Error loading rules:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, [tenantSlug]);

  // Save Rules to Supabase
  const handleSaveRules = async () => {
    if (!tenantSlug) return;
    setIsSaving(true);
    setFeedback(null);

    // Filter out completely empty rules
    const cleanRules = rules.filter((r) => r.trigger.trim() !== '' || r.reply_text.trim() !== '');

    try {
      let savedSuccessfully = false;
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
            auto_replies: cleanRules,
            auto_replies_updated_at: new Date().toISOString(),
          };

          const { error: updateErr } = await supabase
            .from('tenants')
            .update({ metadata: updatedMeta })
            .eq('id', tenantData.id);

          if (!updateErr) {
            savedSuccessfully = true;
          }
        }
      }

      // Also call config API endpoint to ensure cache invalidation & server sync
      try {
        await fetch(`/api/v1/admin/tenants/${encodeURIComponent(tenantSlug)}/config`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auto_replies: cleanRules }),
        });
      } catch {}

      setRules(cleanRules);
      setFeedback({
        type: 'success',
        message: 'Aturan auto-reply berhasil disimpan ke database Supabase!',
      });
      if (onSaved) onSaved('Aturan auto-reply berhasil disimpan!');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      console.error('[AutoReply] Save error:', err);
      setFeedback({
        type: 'error',
        message: err.message || 'Gagal menyimpan aturan auto-reply.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddRule = () => {
    const newRule: AutoReplyRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      trigger: '',
      match_type: 'contains',
      reply_text: '',
      is_active: true,
      created_at: new Date().toISOString(),
    };
    setRules((prev) => [newRule, ...prev]);
  };

  const handleApplyPreset = (preset: typeof TEMPLATE_PRESETS[0]) => {
    const newRule: AutoReplyRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      trigger: preset.trigger,
      match_type: preset.match_type,
      reply_text: preset.reply_text,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    setRules((prev) => [newRule, ...prev]);
  };

  const handleUpdateRule = (id: string, updates: Partial<AutoReplyRule>) => {
    setRules((prev) =>
      prev.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule))
    );
  };

  const handleDeleteRule = (id: string) => {
    setRules((prev) => prev.filter((rule) => rule.id !== id));
  };

  const filteredRules = rules.filter((r) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      r.trigger.toLowerCase().includes(q) ||
      r.reply_text.toLowerCase().includes(q)
    );
  });

  const activeCount = rules.filter((r) => r.is_active).length;

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto w-full space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Aturan Auto-Reply (Keyword Rules)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Kirim balasan instan otomatis saat pesan pelanggan mengandung kata kunci atau link wa.me Meta Ads.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 text-xs">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Total: {rules.length} Aturan
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Aktif: {activeCount}
            </span>
            {rules.length - activeCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                Nonaktif: {rules.length - activeCount}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleAddRule}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Tambah Aturan Baru
          </button>
          <button
            type="button"
            onClick={handleSaveRules}
            disabled={isSaving || isLoading}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Simpan Perubahan
          </button>
        </div>
      </div>

      {/* FEEDBACK ALERT */}
      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-xs font-medium border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* TEMPLATE QUICK PRESETS */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Template Cepat Siap Pakai:
          </span>
          <span className="text-[11px] text-slate-500">
            Klik template untuk langsung menambahkan aturan ke daftar
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_PRESETS.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleApplyPreset(preset)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-xs font-medium transition cursor-pointer"
            >
              <Plus className="w-3 h-3 text-blue-500" />
              {preset.title}
              <span className="text-[10px] text-slate-400">("{preset.trigger.slice(0, 18)}...")</span>
            </button>
          ))}
        </div>
      </div>

      {/* SEARCH / FILTER BAR */}
      {rules.length > 3 && (
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari kata kunci atau teks balasan..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      )}

      {/* RULES TABLE / CARD LIST */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
          <span className="text-xs font-medium">Memuat aturan auto-reply dari database...</span>
        </div>
      ) : filteredRules.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Belum Ada Aturan Auto-Reply</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              Buat pemicu kata kunci agar bot WhatsApp langsung membalas pelanggan tanpa menunggu proses AI.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddRule}
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Tambah Aturan Pertama
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRules.map((rule, index) => (
            <div
              key={rule.id}
              className={`bg-white rounded-2xl border transition shadow-xs overflow-hidden ${
                rule.is_active
                  ? 'border-slate-200 hover:border-slate-300'
                  : 'border-slate-200 bg-slate-50/60 opacity-80'
              }`}
            >
              {/* Card Header Bar */}
              <div className="px-4 sm:px-5 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-extrabold text-slate-400 w-6">
                    #{index + 1}
                  </span>
                  {/* Active Toggle Switch */}
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rule.is_active}
                      onChange={(e) => handleUpdateRule(rule.id, { is_active: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 relative"></div>
                    <span
                      className={`text-xs font-bold ${
                        rule.is_active ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {rule.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                    title="Hapus Aturan"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Card Body Inputs */}
              <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Trigger Keyword */}
                <div className="md:col-span-5 space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Kata Kunci / Frasa Pemicu:
                  </label>
                  <input
                    type="text"
                    value={rule.trigger}
                    onChange={(e) => handleUpdateRule(rule.id, { trigger: e.target.value })}
                    placeholder="Contoh: min info layanan kuras torennya dong"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                  />
                  <p className="text-[11px] text-slate-400">
                    Bisa berupa kalimat utuh atau kata kunci pemicu link wa.me iklan.
                  </p>
                </div>

                {/* Match Type Dropdown */}
                <div className="md:col-span-3 space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Tipe Pencocokan:
                  </label>
                  <select
                    value={rule.match_type}
                    onChange={(e) =>
                      handleUpdateRule(rule.id, {
                        match_type: e.target.value as 'contains' | 'exact',
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium cursor-pointer"
                  >
                    <option value="contains">Mengandung Kata (Contains)</option>
                    <option value="exact">Persis Sama (Exact Match)</option>
                  </select>
                  <p className="text-[11px] text-slate-400">
                    {rule.match_type === 'contains'
                      ? 'Merespons bila ada kata pemicu di dalam kalimat.'
                      : 'Hanya merespons jika seluruh kalimat sama persis.'}
                  </p>
                </div>

                {/* Reply Message Textarea */}
                <div className="md:col-span-4 space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 flex justify-between">
                    <span>Pesan Balasan Otomatis:</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      {rule.reply_text.length} karakter
                    </span>
                  </label>
                  <textarea
                    rows={3}
                    value={rule.reply_text}
                    onChange={(e) => handleUpdateRule(rule.id, { reply_text: e.target.value })}
                    placeholder="Tuliskan pesan balasan resmi yang langsung dikirimkan ke pelanggan..."
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 leading-relaxed font-normal"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FOOTER SAVE BAR */}
      {rules.length > 0 && (
        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-slate-500">
            Pastikan untuk mengeklik <strong>Simpan Perubahan</strong> agar aturan aktif tersinkronisasi ke engine WhatsApp bot.
          </div>
          <button
            type="button"
            onClick={handleSaveRules}
            disabled={isSaving || isLoading}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Simpan Perubahan
          </button>
        </div>
      )}
    </div>
  );
}
