'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  ExternalLink,
  MessageCircle,
  Video,
  MapPin,
  Phone,
  Link as LinkIcon,
  CheckCircle2,
  Save,
  Eye,
  Smartphone,
  ArrowUp,
  ArrowDown,
  Layers,
  LayoutTemplate,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

function InstagramIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
    </svg>
  );
}

export interface MicrositeButton {
  id: string;
  label: string;
  url: string;
  icon: 'whatsapp' | 'instagram' | 'tiktok' | 'maps' | 'link' | 'phone';
  is_active: boolean;
}

interface MicrositeTabProps {
  tenantSlug: string;
  displayName: string;
  onSaved?: (message: string) => void;
}

const ICON_OPTIONS: { id: MicrositeButton['icon']; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { id: 'instagram', label: 'Instagram', icon: InstagramIcon, color: 'text-pink-600 bg-pink-50 border-pink-200' },
  { id: 'tiktok', label: 'TikTok', icon: Video, color: 'text-slate-900 bg-slate-100 border-slate-300' },
  { id: 'maps', label: 'Google Maps', icon: MapPin, color: 'text-rose-600 bg-rose-50 border-rose-200' },
  { id: 'phone', label: 'Panggilan Telpon', icon: Phone, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { id: 'link', label: 'Tautan Kustom', icon: LinkIcon, color: 'text-slate-600 bg-slate-50 border-slate-200' },
];

export default function MicrositeTab({ tenantSlug, displayName, onSaved }: MicrositeTabProps) {
  const [buttons, setButtons] = useState<MicrositeButton[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<'default' | 'microsite' | 'personal'>('default');
  const [bioText, setBioText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load existing configuration from Supabase
  useEffect(() => {
    let isMounted = true;

    async function loadMicrositeConfig() {
      try {
        setIsLoading(true);
        const supabase = getSupabase();
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('name, metadata')
          .eq('slug', tenantSlug)
          .maybeSingle();

        if (tenantRow && isMounted) {
          const meta = tenantRow.metadata || {};
          const existingButtons = meta.microsite?.buttons;
          if (Array.isArray(existingButtons) && existingButtons.length > 0) {
            setButtons(existingButtons);
          } else {
            // Default starter buttons
            setButtons([
              {
                id: 'btn-wa',
                label: 'Hubungi CS WhatsApp Resmi',
                url: `https://wa.me/${meta.whatsapp_number || meta.whatsapp || '6281234567890'}`,
                icon: 'whatsapp',
                is_active: true,
              },
              {
                id: 'btn-maps',
                label: 'Petunjuk Arah & Lokasi Workshop',
                url: 'https://maps.google.com',
                icon: 'maps',
                is_active: true,
              },
            ]);
          }

          setBioText(meta.bio || meta.description || '');
          const t = meta.storefront_template || meta.template || meta.theme?.template;
          if (t === 'microsite' || t === 'personal') {
            setActiveTemplate(t);
          } else {
            setActiveTemplate('default');
          }
        }
      } catch (err) {
        console.warn('Gagal memuat konfigurasi microsite:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    if (tenantSlug) {
      loadMicrositeConfig();
    }

    return () => {
      isMounted = false;
    };
  }, [tenantSlug]);

  const handleAddButton = () => {
    const newBtn: MicrositeButton = {
      id: `btn-${Date.now()}`,
      label: 'Tombol Baru',
      url: 'https://',
      icon: 'link',
      is_active: true,
    };
    setButtons((prev) => [...prev, newBtn]);
  };

  const handleUpdateButton = (id: string, updates: Partial<MicrositeButton>) => {
    setButtons((prev) =>
      prev.map((btn) => (btn.id === id ? { ...btn, ...updates } : btn))
    );
  };

  const handleDeleteButton = (id: string) => {
    setButtons((prev) => prev.filter((btn) => btn.id !== id));
  };

  const handleMoveButton = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= buttons.length) return;

    setButtons((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setFeedback(null);

    try {
      const supabase = getSupabase();
      // Fetch latest metadata to prevent overwriting other fields
      const { data: currentTenant } = await supabase
        .from('tenants')
        .select('metadata')
        .eq('slug', tenantSlug)
        .maybeSingle();

      const currentMeta = currentTenant?.metadata || {};
      const updatedMeta = {
        ...currentMeta,
        storefront_template: activeTemplate,
        bio: bioText,
        microsite: {
          ...(currentMeta.microsite || {}),
          buttons,
        },
      };

      const { error: dbErr } = await supabase
        .from('tenants')
        .update({ metadata: updatedMeta })
        .eq('slug', tenantSlug);

      if (dbErr) throw dbErr;

      // Also sync via settings API route
      try {
        await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template: activeTemplate,
            bio: bioText,
            microsite: { buttons },
          }),
        });
      } catch {}

      setFeedback({ type: 'success', text: 'Konfigurasi microsite & tombol CTA berhasil disimpan!' });
      if (onSaved) onSaved('Konfigurasi microsite berhasil diperbarui.');
    } catch (err: any) {
      console.error('Save error:', err);
      setFeedback({ type: 'error', text: err?.message || 'Gagal menyimpan konfigurasi.' });
    } finally {
      setIsSaving(false);
    }
  };

  const getButtonIconComponent = (iconName: MicrositeButton['icon']) => {
    switch (iconName) {
      case 'whatsapp':
        return MessageCircle;
      case 'instagram':
        return InstagramIcon;
      case 'tiktok':
        return Video;
      case 'maps':
        return MapPin;
      case 'phone':
        return Phone;
      default:
        return ExternalLink;
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-200">
      {/* HEADER TAB */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <LayoutTemplate className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Tampilan &amp; Microsite Bio-Funnel
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl leading-relaxed">
            Atur tombol tautan mandiri (Link-in-Bio) untuk Instagram, TikTok, dan WhatsApp serta kelola template etalase publik toko Anda.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`/${tenantSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5 shrink-0"
          >
            <Eye className="w-4 h-4" />
            <span>Lihat Toko Publik</span>
          </a>
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/20 active:scale-95 transition flex items-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold border flex items-center gap-2 animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* 2-COLUMN BUILDER + PREVIEW */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: BUILDER SETTINGS (lg:col-span-7) */}
        <div className="lg:col-span-7 space-y-6">
          {/* TEMPLATE CHOOSER CARD */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>Template Etalase Toko</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tentukan tampilan default saat pengunjung membuka alamat <span className="font-mono font-bold text-slate-700">shop.boontrack.com/{tenantSlug}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setActiveTemplate('default')}
                className={`p-4 rounded-2xl border text-left transition relative cursor-pointer ${
                  activeTemplate === 'default'
                    ? 'border-blue-600 bg-blue-50/50 shadow-xs ring-2 ring-blue-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                {activeTemplate === 'default' && (
                  <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-blue-600"></span>
                )}
                <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-100/70 px-2 py-0.5 rounded inline-block mb-2">
                  Rekomendasi
                </span>
                <h4 className="text-xs font-bold text-slate-900">Katalog Toko (Default)</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Katalog grid produk lengkap dengan Asisten AI Chatbot &amp; Checkout instan.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setActiveTemplate('microsite')}
                className={`p-4 rounded-2xl border text-left transition relative cursor-pointer ${
                  activeTemplate === 'microsite'
                    ? 'border-blue-600 bg-blue-50/50 shadow-xs ring-2 ring-blue-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                {activeTemplate === 'microsite' && (
                  <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-blue-600"></span>
                )}
                <span className="text-[10px] font-black uppercase text-emerald-600 bg-emerald-100/70 px-2 py-0.5 rounded inline-block mb-2">
                  Bio-Funnel
                </span>
                <h4 className="text-xs font-bold text-slate-900">Microsite Bio-Link</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Format vertikal fokus tombol tautan cepat (Linktree style) &amp; menu unggulan.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setActiveTemplate('personal')}
                className={`p-4 rounded-2xl border text-left transition relative cursor-pointer ${
                  activeTemplate === 'personal'
                    ? 'border-blue-600 bg-blue-50/50 shadow-xs ring-2 ring-blue-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                {activeTemplate === 'personal' && (
                  <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-blue-600"></span>
                )}
                <span className="text-[10px] font-black uppercase text-purple-600 bg-purple-100/70 px-2 py-0.5 rounded inline-block mb-2">
                  Authority
                </span>
                <h4 className="text-xs font-bold text-slate-900">Personal Brand</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Cocok untuk profil mentor, konsultan, portofolio, dan bimbingan privat.
                </p>
              </button>
            </div>
          </div>

          {/* BUTTON BUILDER LIST CARD */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Daftar Tombol CTA Microsite ({buttons.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tombol ini akan otomatis tampil di Bio-Funnel toko dan halaman tautan resmi.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddButton}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Tombol</span>
              </button>
            </div>

            {buttons.length === 0 ? (
              <div className="p-8 border border-dashed border-slate-200 rounded-2xl text-center space-y-2 text-slate-400">
                <Sparkles className="w-6 h-6 mx-auto text-slate-300" />
                <p className="text-xs font-semibold">Belum ada tombol CTA khusus.</p>
                <button
                  type="button"
                  onClick={handleAddButton}
                  className="text-xs font-bold text-blue-600 hover:underline"
                >
                  + Tambah tombol pertama sekarang
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {buttons.map((btn, idx) => {
                  const CurrentIcon = getButtonIconComponent(btn.icon);

                  return (
                    <div
                      key={btn.id}
                      className={`p-4 rounded-2xl border transition-all space-y-3 ${
                        btn.is_active
                          ? 'bg-slate-50/70 border-slate-200'
                          : 'bg-slate-100/50 border-slate-200 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-xs font-black text-slate-500 shrink-0">
                            {idx + 1}
                          </span>
                          <span className="p-1.5 rounded-lg bg-white border border-slate-200 shrink-0">
                            <CurrentIcon className="w-4 h-4 text-slate-700" />
                          </span>
                          <span className="text-xs font-black text-slate-900 truncate">
                            {btn.label || 'Tanpa Judul'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleMoveButton(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-slate-700 disabled:opacity-30 transition cursor-pointer"
                            title="Pindah ke Atas"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveButton(idx, 'down')}
                            disabled={idx === buttons.length - 1}
                            className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-slate-700 disabled:opacity-30 transition cursor-pointer"
                            title="Pindah ke Bawah"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          {/* Toggle Active Switch */}
                          <label className="relative inline-flex items-center cursor-pointer ml-1">
                            <input
                              type="checkbox"
                              checked={btn.is_active}
                              onChange={(e) => handleUpdateButton(btn.id, { is_active: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-emerald-600"></div>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleDeleteButton(btn.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer ml-1"
                            title="Hapus Tombol"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Input fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1">
                        <div className="sm:col-span-6">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            Label Tombol
                          </label>
                          <input
                            type="text"
                            value={btn.label}
                            onChange={(e) => handleUpdateButton(btn.id, { label: e.target.value })}
                            placeholder="Contoh: Pesan via GoFood, Chat CS, dll."
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        <div className="sm:col-span-6">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            Tautan URL Tujuan
                          </label>
                          <input
                            type="text"
                            value={btn.url}
                            onChange={(e) => handleUpdateButton(btn.id, { url: e.target.value })}
                            placeholder="https://wa.me/... atau https://..."
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-mono text-[11px]"
                          />
                        </div>
                      </div>

                      {/* Icon Selector Chips */}
                      <div>
                        <span className="block text-[10px] font-bold text-slate-500 mb-1.5">
                          Pilih Ikon Tombol:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {ICON_OPTIONS.map((opt) => {
                            const IconComponent = opt.icon;
                            const isSelected = btn.icon === opt.id;

                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => handleUpdateButton(btn.id, { icon: opt.id })}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 transition cursor-pointer ${
                                  isSelected
                                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                <IconComponent className="w-3 h-3" />
                                <span>{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: REALTIME PHONE PREVIEW (lg:col-span-5) */}
        <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-slate-500" />
              <span>Simulasi Live Preview</span>
            </span>
            <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              Sinkronisasi Otomatis
            </span>
          </div>

          {/* Smartphone Frame */}
          <div className="mx-auto w-full max-w-[340px] bg-slate-900 p-3 rounded-[40px] shadow-2xl border-4 border-slate-800">
            {/* Phone Screen */}
            <div className="w-full bg-slate-50 rounded-[32px] overflow-hidden min-h-[520px] flex flex-col items-center p-4 text-slate-900 font-sans">
              {/* Notch */}
              <div className="w-24 h-4 bg-slate-900 rounded-full mb-4"></div>

              {/* Profile Avatar */}
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white font-black text-xl flex items-center justify-center shadow-md mb-2 capitalize">
                {displayName.charAt(0)}
              </div>

              <h4 className="text-sm font-black text-slate-900 capitalize tracking-tight">
                {displayName}
              </h4>
              <p className="text-[10px] text-slate-500 text-center line-clamp-2 max-w-[240px] mt-0.5">
                {bioText || 'Pemesanan online praktis & layanan resmi terverifikasi.'}
              </p>

              {/* Preview Buttons */}
              <div className="w-full space-y-2 mt-5">
                {buttons
                  .filter((b) => b.is_active)
                  .map((btn) => {
                    const PreviewIcon = getButtonIconComponent(btn.icon);

                    return (
                      <div
                        key={btn.id}
                        className="w-full bg-white hover:bg-slate-100 p-2.5 rounded-xl border border-slate-200/90 shadow-2xs flex items-center justify-between gap-2 transition"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="p-1 rounded-lg bg-slate-50 border border-slate-100 text-slate-700 shrink-0">
                            <PreviewIcon className="w-3.5 h-3.5" />
                          </span>
                          <span className="text-xs font-bold text-slate-800 truncate">
                            {btn.label || 'Tombol Tautan'}
                          </span>
                        </div>
                        <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                      </div>
                    );
                  })}

                {buttons.filter((b) => b.is_active).length === 0 && (
                  <div className="py-6 text-center text-slate-400 text-[11px] italic">
                    Semua tombol nonaktif
                  </div>
                )}
              </div>

              {/* Storefront Catalog Card Preview */}
              <div className="w-full mt-auto pt-4 border-t border-slate-200/60 text-center">
                <span className="text-[9px] font-bold text-slate-400">
                  Powered by BoonTrack Official Platform
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
