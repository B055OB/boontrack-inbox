'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Store,
  ExternalLink,
  Save,
  RefreshCw,
} from 'lucide-react';
import ImageUpload from '@/components/ImageUpload';
import {
  ProductItem,
  SinglePageConfig,
  slugify,
  resolveFulfillmentRequirements,
} from '@/lib/product-catalog';

export type BuilderTab =
  | 'hook'
  | 'problem_solution'
  | 'comparison'
  | 'social_proof'
  | 'offer_bonus'
  | 'payment_voucher';

export interface SinglePageBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProduct: ProductItem | null;
  singlePageForm: SinglePageConfig;
  setSinglePageForm: React.Dispatch<React.SetStateAction<SinglePageConfig>>;
  onSave: (e: React.FormEvent) => void;
  tenantSlug: string;
  isSaving?: boolean;
}

export default function SinglePageBuilderModal({
  isOpen,
  onClose,
  activeProduct,
  singlePageForm,
  setSinglePageForm,
  onSave,
  tenantSlug,
  isSaving = false,
}: SinglePageBuilderModalProps) {
  const [activeBuilderTab, setActiveBuilderTab] = useState<BuilderTab>('hook');

  // Tabs scroll state
  const builderTabsRef = useRef<HTMLDivElement | null>(null);
  const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false);
  const [canScrollTabsRight, setCanScrollTabsRight] = useState(false);

  const checkBuilderTabsScroll = () => {
    const el = builderTabsRef.current;
    if (!el) return;
    setCanScrollTabsLeft(el.scrollLeft > 2);
    setCanScrollTabsRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };

  const handleScrollBuilderTabs = (direction: 'left' | 'right') => {
    const el = builderTabsRef.current;
    if (!el) return;
    const offset = direction === 'left' ? -200 : 200;
    el.scrollBy({ left: offset, behavior: 'smooth' });
    setTimeout(checkBuilderTabsScroll, 350);
  };

  useEffect(() => {
    if (isOpen) {
      setActiveBuilderTab('hook');
      const timer = setTimeout(() => {
        checkBuilderTabsScroll();
      }, 150);
      window.addEventListener('resize', checkBuilderTabsScroll);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', checkBuilderTabsScroll);
      };
    }
  }, [isOpen]);

  if (!isOpen || !activeProduct) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] my-auto">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-blue-100 text-blue-600">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm font-black text-slate-900 leading-tight">
                Builder Single Page Checkout
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Konfigurasi halaman penawaran untuk: <strong className="text-slate-800">{activeProduct.name}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200/60 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSave} className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700 block">Tautan Halaman Publik (Public Slug URL) *</label>
              <button
                type="button"
                onClick={() => {
                  const targetTitle = singlePageForm.headline?.trim() || activeProduct.name;
                  setSinglePageForm((p) => ({ ...p, slug: slugify(targetTitle) }));
                }}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-100/60 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                title="Sinkronkan slug dengan judul/headline produk"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Sinkronkan URL dengan Judul Baru</span>
              </button>
            </div>
            <div className="flex items-center gap-1 font-mono text-xs">
              <span className="text-slate-400 shrink-0">/{tenantSlug}/p/</span>
              <input
                type="text"
                required
                value={singlePageForm.slug || ''}
                onChange={(e) => setSinglePageForm((p) => ({ ...p, slug: slugify(e.target.value) }))}
                placeholder="nama-slug-produk"
                className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 font-bold focus:outline-none focus:border-blue-600"
              />
            </div>
            <span className="text-[10px] text-slate-400 block">
              Akses langsung via browser: <code className="text-blue-600 font-bold">https://shop.boontrack.com/{tenantSlug}/p/{singlePageForm.slug || slugify(activeProduct.name)}</code>
            </span>
          </div>

          <div className="relative flex items-center border-b border-slate-200 pb-1.5 isolate group">
            {canScrollTabsLeft && (
              <button
                type="button"
                onClick={() => handleScrollBuilderTabs('left')}
                aria-label="Scroll tab ke kiri"
                className="absolute left-0 z-30 h-7 w-7 -ml-2 flex items-center justify-center rounded-full bg-white/95 border border-slate-300 text-slate-700 shadow-md hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}

            <div
              ref={builderTabsRef}
              onScroll={checkBuilderTabsScroll}
              className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x overscroll-x-contain relative z-10 px-0.5"
            >
              {[
                { id: 'hook', label: '1. Hook & Hero', icon: '🎯' },
                { id: 'problem_solution', label: '2. Problem & Solusi', icon: '⚡' },
                { id: 'comparison', label: '3. Us vs Them', icon: '⚖️' },
                { id: 'social_proof', label: '4. Testimoni', icon: '💬' },
                { id: 'offer_bonus', label: '5. Offer & Bonus', icon: '🎁' },
                { id: 'payment_voucher', label: '6. Bayar & Voucher', icon: '🎟️' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeBuilderTab === tab.id}
                  onPointerDown={(e) => { e.preventDefault(); setActiveBuilderTab(tab.id as any); }}
                  onClick={() => setActiveBuilderTab(tab.id as any)}
                  style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation', WebkitTransform: 'translateZ(0)', transform: 'translateZ(0)' }}
                  className={`select-none pointer-events-auto shrink-0 relative z-10 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer touch-manipulation ${
                    activeBuilderTab === tab.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {canScrollTabsRight && (
              <button
                type="button"
                onClick={() => handleScrollBuilderTabs('right')}
                aria-label="Scroll tab ke kanan"
                className="absolute right-0 z-30 h-7 w-7 -mr-2 flex items-center justify-center rounded-full bg-white/95 border border-slate-300 text-slate-700 shadow-md hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-all cursor-pointer"
              >
                <ChevronRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
          </div>

          {/* TAB 1: HOOK & HERO */}
          {activeBuilderTab === 'hook' && (
            <div className="space-y-3.5 animate-fadeIn">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Headline Penawaran Utama *
                </label>
                <input
                  type="text"
                  required
                  value={singlePageForm.headline}
                  onChange={(e) => setSinglePageForm((p) => ({ ...p, headline: e.target.value }))}
                  placeholder="Contoh: Kuasai Pola Iklan Anti Boncos & Rahasia Scaling Meta Ads 2026"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Subheadline Persuasif & Ringkasan Nilai
                </label>
                <textarea
                  rows={2}
                  value={singlePageForm.subheadline}
                  onChange={(e) => setSinglePageForm((p) => ({ ...p, subheadline: e.target.value }))}
                  placeholder="Contoh: Studi kasus riil mengelola anggaran iklan miliaran rupiah tanpa trik abu-abu..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Badge Label Promosi
                  </label>
                  <input
                    type="text"
                    value={singlePageForm.badge_text || ''}
                    onChange={(e) => setSinglePageForm((p) => ({ ...p, badge_text: e.target.value }))}
                    placeholder="Contoh: Direct Access Class / Flash Sale 80%"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    URL Media Banner Hero Utama
                  </label>
                  <input
                    type="url"
                    value={singlePageForm.banner_url}
                    onChange={(e) => setSinglePageForm((p) => ({ ...p, banner_url: e.target.value }))}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
              </div>

              {singlePageForm.banner_url && (
                <div className="p-2 bg-slate-100 rounded-xl border border-slate-200 inline-block">
                  <span className="text-[10px] text-slate-500 block mb-1 font-semibold">Preview Banner Hero:</span>
                  <img
                    src={singlePageForm.banner_url}
                    alt="Preview Banner"
                    className="h-28 w-auto rounded-lg object-cover"
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PROBLEM & SOLUTION */}
          {activeBuilderTab === 'problem_solution' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-rose-50/50 border border-rose-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-rose-900 text-xs flex items-center gap-1.5">
                    <span>⚠️</span> Poin Masalah Audiens (Pain Points)
                  </span>
                  <button
                    type="button"
                    onClick={() => setSinglePageForm(p => ({
                      ...p,
                      pain_points: [...(p.pain_points || []), '']
                    }))}
                    className="text-[11px] bg-white border border-rose-200 text-rose-700 hover:bg-rose-100 font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition"
                  >
                    <Plus className="w-3 h-3" /> Tambah Poin
                  </button>
                </div>

                <div>
                  <label className="text-[11px] text-slate-600 font-semibold block mb-1">Judul Masalah</label>
                  <input
                    type="text"
                    value={singlePageForm.problem_title || ''}
                    onChange={(e) => setSinglePageForm(p => ({ ...p, problem_title: e.target.value }))}
                    placeholder="Contoh: Apakah Anda Sering Menghadapi Masalah Ini?"
                    className="w-full px-3 py-2 bg-white border border-rose-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-rose-500 font-bold"
                  />
                </div>

                <div className="space-y-2">
                  {(singlePageForm.pain_points || []).map((point, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-rose-500 font-bold text-xs shrink-0">❌ #{idx + 1}</span>
                      <input
                        type="text"
                        value={point}
                        onChange={(e) => {
                          const newPoints = [...(singlePageForm.pain_points || [])];
                          newPoints[idx] = e.target.value;
                          setSinglePageForm(p => ({ ...p, pain_points: newPoints }));
                        }}
                        placeholder="Deskripsi masalah yang dihadapi target pembeli..."
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-rose-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newPoints = (singlePageForm.pain_points || []).filter((_, i) => i !== idx);
                          setSinglePageForm(p => ({ ...p, pain_points: newPoints }));
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-100 rounded-lg transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div>
                  <ImageUpload
                    label="Gambar Ilustrasi Masalah (Opsional)"
                    value={singlePageForm.problem_image_url || ''}
                    onChange={(url) => setSinglePageForm(p => ({ ...p, problem_image_url: url }))}
                    placeholder="Upload gambar ilustrasi masalah (Auto-convert WebP)"
                    tenantSlug={tenantSlug}
                  />
                </div>
              </div>

              <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-900 text-xs flex items-center gap-1.5">
                    <span>✅</span> Poin Solusi & Fitur Unggulan
                  </span>
                  <button
                    type="button"
                    onClick={() => setSinglePageForm(p => ({
                      ...p,
                      solution_points: [...(p.solution_points || []), '']
                    }))}
                    className="text-[11px] bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition"
                  >
                    <Plus className="w-3 h-3" /> Tambah Solusi
                  </button>
                </div>

                <div>
                  <label className="text-[11px] text-slate-600 font-semibold block mb-1">Judul Solusi</label>
                  <input
                    type="text"
                    value={singlePageForm.solution_title || ''}
                    onChange={(e) => setSinglePageForm(p => ({ ...p, solution_title: e.target.value }))}
                    placeholder="Contoh: Kini Hadir Solusi Teruji untuk Anda"
                    className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500 font-bold"
                  />
                </div>

                <div className="space-y-2">
                  {(singlePageForm.solution_points || []).map((point, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-emerald-600 font-bold text-xs shrink-0">✨ #{idx + 1}</span>
                      <input
                        type="text"
                        value={point}
                        onChange={(e) => {
                          const newPoints = [...(singlePageForm.solution_points || [])];
                          newPoints[idx] = e.target.value;
                          setSinglePageForm(p => ({ ...p, solution_points: newPoints }));
                        }}
                        placeholder="Poin solusi / manfaat yang langsung dirasakan pembeli..."
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newPoints = (singlePageForm.solution_points || []).filter((_, i) => i !== idx);
                          setSinglePageForm(p => ({ ...p, solution_points: newPoints }));
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-100 rounded-lg transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: COMPARISON */}
          {activeBuilderTab === 'comparison' && (
            <div className="space-y-3.5 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">Tabel Perbandingan (Us vs Them)</h4>
                  <p className="text-[10px] text-slate-500">Buktikan keunggulan produk Anda dibandingkan cara lama atau kompetitor.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSinglePageForm(p => ({
                    ...p,
                    comparison_rows: [
                      ...(p.comparison_rows || []),
                      { id: String(Date.now()), feature: '', others: '', us: '' }
                    ]
                  }))}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Baris
                </button>
              </div>

              <div className="space-y-3">
                {(singlePageForm.comparison_rows || []).map((row, idx) => (
                  <div key={row.id || idx} className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700 text-[11px]">Kriteria #{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const rows = (singlePageForm.comparison_rows || []).filter((_, i) => i !== idx);
                          setSinglePageForm(p => ({ ...p, comparison_rows: rows }));
                        }}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div>
                      <input
                        type="text"
                        value={row.feature}
                        onChange={(e) => {
                          const rows = [...(singlePageForm.comparison_rows || [])];
                          rows[idx] = { ...rows[idx], feature: e.target.value };
                          setSinglePageForm(p => ({ ...p, comparison_rows: rows }));
                        }}
                        placeholder="Aspek / Kriteria (mis: Efisiensi Biaya / Kecepatan Hasil)"
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-rose-600 flex items-center gap-1">
                          <span>❌</span> Cara Lain / Lama (Them)
                        </span>
                        <textarea
                          rows={2}
                          value={row.others}
                          onChange={(e) => {
                            const rows = [...(singlePageForm.comparison_rows || [])];
                            rows[idx] = { ...rows[idx], others: e.target.value };
                            setSinglePageForm(p => ({ ...p, comparison_rows: rows }));
                          }}
                          placeholder="Kelemahan cara lain..."
                          className="w-full px-2.5 py-1.5 bg-white border border-rose-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-rose-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                          <span>✅</span> Solusi Produk Ini (Us)
                        </span>
                        <textarea
                          rows={2}
                          value={row.us}
                          onChange={(e) => {
                            const rows = [...(singlePageForm.comparison_rows || [])];
                            rows[idx] = { ...rows[idx], us: e.target.value };
                            setSinglePageForm(p => ({ ...p, comparison_rows: rows }));
                          }}
                          placeholder="Kelebihan nyata produk Anda..."
                          className="w-full px-2.5 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: SOCIAL PROOF */}
          {activeBuilderTab === 'social_proof' && (
            <div className="space-y-3.5 animate-fadeIn">
              <div>
                <h4 className="font-bold text-slate-900 text-xs">Galeri Testimoni Visual (Hingga 3 Screenshot)</h4>
                <p className="text-[10px] text-slate-500">Masukkan tautan gambar tangkapan layar chat WhatsApp, hasil omset, atau review pelanggan.</p>
              </div>

              <div className="space-y-3">
                {[0, 1, 2].map((idx) => {
                  const currentVal = (singlePageForm.testimonial_images || [])[idx] || '';
                  return (
                    <div key={idx} className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                      <ImageUpload
                        label={`Screenshot Testimoni #${idx + 1}`}
                        value={currentVal}
                        onChange={(url) => {
                          const imgs = [...(singlePageForm.testimonial_images || ['', '', ''])];
                          imgs[idx] = url;
                          setSinglePageForm(p => ({ ...p, testimonial_images: imgs.filter(Boolean) }));
                        }}
                        placeholder={`Upload bukti review / testimoni #${idx + 1}`}
                        tenantSlug={tenantSlug}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 5: OFFER & BONUS */}
          {activeBuilderTab === 'offer_bonus' && (
            <div className="space-y-3.5 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">Bonus Spesial Pembelian Hari Ini</h4>
                  <p className="text-[10px] text-slate-500">Tingkatkan value produk Anda dengan bonus gratis yang memiliki estimasi nilai tinggi.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSinglePageForm(p => ({
                    ...p,
                    bonus_items: [
                      ...(p.bonus_items || []),
                      { id: String(Date.now()), title: '', value: 199000, description: '' }
                    ]
                  }))}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Bonus
                </button>
              </div>

              <div className="space-y-3">
                {(singlePageForm.bonus_items || []).map((bonus, idx) => (
                  <div key={bonus.id || idx} className="bg-indigo-50/40 border border-indigo-100 p-3.5 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-900 text-[11px]">Bonus Gratis #{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const items = (singlePageForm.bonus_items || []).filter((_, i) => i !== idx);
                          setSinglePageForm(p => ({ ...p, bonus_items: items }));
                        }}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-2">
                        <label className="text-[10px] text-slate-600 font-bold block mb-1">Nama / Judul Bonus</label>
                        <input
                          type="text"
                          value={bonus.title}
                          onChange={(e) => {
                            const items = [...(singlePageForm.bonus_items || [])];
                            items[idx] = { ...items[idx], title: e.target.value };
                            setSinglePageForm(p => ({ ...p, bonus_items: items }));
                          }}
                          placeholder="Contoh: 50+ Template Ad Copywriting Siap Pakai"
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 font-bold block mb-1">Taksiran Nilai (Rp)</label>
                        <input
                          type="number"
                          step={5000}
                          value={bonus.value}
                          onChange={(e) => {
                            const items = [...(singlePageForm.bonus_items || [])];
                            items[idx] = { ...items[idx], value: Number(e.target.value) };
                            setSinglePageForm(p => ({ ...p, bonus_items: items }));
                          }}
                          placeholder="199000"
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    </div>

                    <div>
                      <input
                        type="text"
                        value={bonus.description || ''}
                        onChange={(e) => {
                          const items = [...(singlePageForm.bonus_items || [])];
                          items[idx] = { ...items[idx], description: e.target.value };
                          setSinglePageForm(p => ({ ...p, bonus_items: items }));
                        }}
                        placeholder="Deskripsi singkat manfaat bonus ini..."
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-indigo-600"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center justify-between text-xs">
                <span className="font-bold text-amber-900">Total Nilai Bonus Tambahan:</span>
                <span className="font-black text-amber-700">
                  Rp {(singlePageForm.bonus_items || []).reduce((acc, b) => acc + (b.value || 0), 0).toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          )}

          {/* TAB 6: BAYAR & VOUCHER */}
          {activeBuilderTab === 'payment_voucher' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <span className="font-bold text-slate-800 block text-xs">
                  Opsi Metode Pembayaran di Checkout
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-emerald-400 transition">
                    <input
                      type="checkbox"
                      checked={singlePageForm.enable_qris}
                      onChange={(e) => setSinglePageForm((p) => ({ ...p, enable_qris: e.target.checked }))}
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">QRIS Instan Otomatis</span>
                      <span className="text-[10px] text-slate-500">Bebas biaya admin (Fee Rp0) & aktivasi tercepat.</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-blue-400 transition">
                    <input
                      type="checkbox"
                      checked={singlePageForm.enable_manual_transfer}
                      onChange={(e) => setSinglePageForm((p) => ({ ...p, enable_manual_transfer: e.target.checked }))}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">Transfer Bank Manual</span>
                      <span className="text-[10px] text-slate-500">BCA / Mandiri (Bebas Biaya Admin) & kode unik acak.</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="bg-gradient-to-br from-indigo-50/70 to-blue-50/50 border border-indigo-100 rounded-2xl p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-indigo-600 text-white rounded-lg text-xs">🎟️</span>
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">Pengaturan Voucher & Promo Produk</h4>
                      <p className="text-[10px] text-slate-500">Konfigurasi potongan harga produk dan/atau subsidi ongkir khusus landing page ini.</p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full uppercase">
                    {singlePageForm.voucher?.code || 'NO-CODE'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block text-xs mb-1">Kode Voucher</label>
                    <input
                      type="text"
                      value={singlePageForm.voucher?.code || ''}
                      onChange={(e) => {
                        const code = e.target.value.toUpperCase().replace(/\s+/g, '');
                        setSinglePageForm(p => ({
                          ...p,
                          discount_coupon: code,
                          voucher: {
                            ...(p.voucher || {
                              code,
                              discount_type: 'nominal',
                              discount_value: 20000,
                              shipping_discount_type: 'none',
                              shipping_discount_value: 0,
                              min_spend: 0
                            }),
                            code
                          }
                        }));
                      }}
                      placeholder="Contoh: HEMAT50, DISKON20K, FREESHIP"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-mono font-bold uppercase focus:outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block text-xs mb-1">Minimal Belanja (Opsional, Rp)</label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={singlePageForm.voucher?.min_spend || 0}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setSinglePageForm(p => ({
                          ...p,
                          voucher: {
                            ...(p.voucher || {
                              code: p.discount_coupon || 'HEMAT50',
                              discount_type: 'nominal',
                              discount_value: 20000,
                              shipping_discount_type: 'none',
                              shipping_discount_value: 0,
                              min_spend: val
                            }),
                            min_spend: val
                          }
                        }));
                      }}
                      placeholder="0 (Tanpa minimum)"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-indigo-100 space-y-2.5">
                  <label className="font-bold text-slate-800 block text-xs">Pilihan Tipe Diskon Produk</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSinglePageForm(p => ({
                        ...p,
                        voucher: {
                          ...(p.voucher || {
                            code: p.discount_coupon || 'HEMAT50',
                            discount_type: 'nominal',
                            discount_value: 20000,
                            shipping_discount_type: 'none',
                            shipping_discount_value: 0
                          }),
                          discount_type: 'nominal',
                          discount_value: (p.voucher?.discount_value && p.voucher.discount_type === 'percentage') ? 20000 : (p.voucher?.discount_value || 20000)
                        }
                      }))}
                      className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        singlePageForm.voucher?.discount_type === 'nominal'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <span>Diskon Nominal (Rp)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSinglePageForm(p => ({
                        ...p,
                        voucher: {
                          ...(p.voucher || {
                            code: p.discount_coupon || 'HEMAT50',
                            discount_type: 'percentage',
                            discount_value: 10,
                            shipping_discount_type: 'none',
                            shipping_discount_value: 0
                          }),
                          discount_type: 'percentage',
                          discount_value: (p.voucher?.discount_value && p.voucher.discount_type === 'nominal') ? 10 : (p.voucher?.discount_value || 10)
                        }
                      }))}
                      className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        singlePageForm.voucher?.discount_type === 'percentage'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <span>Diskon Persentase (%)</span>
                    </button>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-500 font-semibold block mb-1">
                      {singlePageForm.voucher?.discount_type === 'percentage' ? 'Besaran Diskon Persen (%)' : 'Besaran Diskon Flat (Rp)'}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={singlePageForm.voucher?.discount_type === 'percentage' ? 100 : activeProduct.price}
                        value={singlePageForm.voucher?.discount_value || 0}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSinglePageForm(p => ({
                            ...p,
                            voucher: {
                              ...(p.voucher || {
                                code: p.discount_coupon || 'HEMAT50',
                                discount_type: 'nominal',
                                discount_value: val,
                                shipping_discount_type: 'none',
                                shipping_discount_value: 0
                              }),
                              discount_value: val
                            }
                          }));
                        }}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600 pr-12 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">
                        {singlePageForm.voucher?.discount_type === 'percentage' ? '%' : 'Rp'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-indigo-100 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-800 block text-xs">Pilihan Diskon Ongkir (Khusus Produk Fisik)</label>
                    {activeProduct.category === 'fisik' && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                        📦 Produk Fisik
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {[
                      { id: 'none', label: 'Tanpa Subsidi' },
                      { id: 'flat', label: 'Subsidi Flat (Rp)' },
                      { id: 'free', label: 'Gratis Ongkir (100%)' }
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSinglePageForm(p => ({
                          ...p,
                          voucher: {
                            ...(p.voucher || {
                              code: p.discount_coupon || 'HEMAT50',
                              discount_type: 'nominal',
                              discount_value: 0,
                              shipping_discount_type: 'none',
                              shipping_discount_value: 0
                            }),
                            shipping_discount_type: item.id as any
                          }
                        }))}
                        className={`py-2 px-2 rounded-lg text-center font-bold text-[11px] transition cursor-pointer ${
                          (singlePageForm.voucher?.shipping_discount_type || 'none') === item.id
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  {singlePageForm.voucher?.shipping_discount_type === 'flat' && (
                    <div>
                      <label className="text-[11px] text-slate-500 font-semibold block mb-1">Nominal Subsidi Ongkir (Rp)</label>
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={singlePageForm.voucher?.shipping_discount_value || 0}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setSinglePageForm(p => ({
                              ...p,
                              voucher: {
                                ...(p.voucher || {
                                  code: p.discount_coupon || 'HEMAT50',
                                  discount_type: 'nominal',
                                  discount_value: 0,
                                  shipping_discount_type: 'flat',
                                  shipping_discount_value: val
                                }),
                                shipping_discount_value: val
                              }
                            }));
                          }}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600 pr-12 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">Rp</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Store className="w-3.5 h-3.5 text-blue-600" />
                  <span>Model Penjualan Toko Langsung (Direct Store)</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Sistem berjalan murni direct store ke rekening merchant tanpa potongan komisi affiliate produk ritel. Seluruh omset 100% dialokasikan ke toko Anda.
                </p>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            <Link
              href={`/${tenantSlug}/p/${singlePageForm.slug || slugify(activeProduct.name)}`}
              target="_blank"
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              <span>Preview Halaman</span>
            </Link>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-md shadow-blue-500/20 active:scale-95 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Menyimpan...' : 'Simpan & Terapkan'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
