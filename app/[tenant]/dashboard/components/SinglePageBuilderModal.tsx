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
  MessageCircle,
} from 'lucide-react';
import ImageUpload from '@/components/ImageUpload';
import {
  ProductItem,
  SinglePageConfig,
  slugify,
  resolveFulfillmentRequirements,
} from '@/lib/product-catalog';
import { getProductPageUrl } from '@/lib/utils/storefrontUrl';

export type BuilderTab =
  | 'hook'
  | 'media_gallery'
  | 'client_logos'
  | 'problem_solution'
  | 'comparison'
  | 'social_proof'
  | 'offer_bonus'
  | 'faq'
  | 'payment_voucher';

export const BUILDER_TABS = [
  { id: 'hook', label: '1. Judul & Banner Utama', icon: '🎯', toggleKey: 'enable_hero', defaultEnabled: true },
  { id: 'media_gallery', label: '2. Galeri Foto Produk', icon: '📸', toggleKey: 'enable_media_gallery', defaultEnabled: true },
  { id: 'client_logos', label: '3. Logo Partner / Liputan', icon: '🏢', toggleKey: 'enable_client_logos', defaultEnabled: false },
  { id: 'problem_solution', label: '4. Masalah & Solusi', icon: '⚡', toggleKey: 'enable_problem_solution', defaultEnabled: true },
  { id: 'comparison', label: '5. Keunggulan Produk', icon: '⚖️', toggleKey: 'enable_us_vs_them', defaultEnabled: true },
  { id: 'social_proof', label: '6. Testimoni Pelanggan', icon: '💬', toggleKey: 'enable_testimonials', defaultEnabled: true },
  { id: 'offer_bonus', label: '7. Penawaran & Bonus', icon: '🎁', toggleKey: 'enable_offer', defaultEnabled: true },
  { id: 'faq', label: '8. Tanya Jawab (FAQ)', icon: '❓', toggleKey: 'enable_faq', defaultEnabled: false },
  { id: 'payment_voucher', label: '9. Checkout & Voucher', icon: '🎟️', toggleKey: 'enable_payment', defaultEnabled: true },
] as const;

function SectionToggleHeader({
  title,
  description,
  enabled,
  onChange,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div
      className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
        enabled
          ? 'bg-blue-50/70 border-blue-200/90 text-blue-950'
          : 'bg-slate-50 border-slate-200 text-slate-500'
      }`}
    >
      <div className="space-y-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
            }`}
          />
          <h4 className="text-xs font-black tracking-tight text-slate-900">
            Aktifkan Section Ini (Tampil di Halaman)
          </h4>
          <span
            className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
              enabled
                ? 'bg-blue-600 text-white'
                : 'bg-slate-200 text-slate-600'
            }`}
          >
            {enabled ? 'Aktif' : 'Nonaktif'}
          </span>
        </div>
        <p className="text-[11px] text-slate-500 leading-tight">
          {description}
        </p>
      </div>

      <label className="relative inline-flex items-center cursor-pointer shrink-0">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
      </label>
    </div>
  );
}

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
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-5xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col h-[92vh] max-h-[850px] my-auto">
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-600 text-white shadow-xs">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                🎨 Desain Halaman Produk (Landing Page)
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Konfigurasi penawaran, copywriting, galeri foto, &amp; checkout: <strong className="text-slate-800">{activeProduct.name}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200/60 transition cursor-pointer"
            aria-label="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSave} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* SLUG & URL BAR */}
          <div className="px-4 sm:px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
            <div className="flex items-center gap-1.5 flex-1 min-w-[280px]">
              <span className="font-bold text-slate-700 shrink-0">Tautan Halaman:</span>
              <span className="text-slate-400 font-mono text-[11px] shrink-0">/{tenantSlug}/p/</span>
              <input
                type="text"
                required
                value={singlePageForm.slug || ''}
                onChange={(e) => setSinglePageForm((p) => ({ ...p, slug: slugify(e.target.value) }))}
                placeholder="nama-slug-produk"
                className="flex-1 max-w-xs px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-900 font-bold font-mono text-xs focus:outline-none focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => {
                  const targetTitle = singlePageForm.headline?.trim() || activeProduct.name;
                  setSinglePageForm((p) => ({ ...p, slug: slugify(targetTitle) }));
                }}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-100/60 px-2 py-1 rounded-lg transition cursor-pointer"
                title="Sinkronkan slug dengan judul baru"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Sinkronkan</span>
              </button>
            </div>
            <div className="text-[11px] text-slate-500 font-medium hidden sm:block">
              <span>Status: </span>
              <span className="text-emerald-700 font-bold">● Siap Publikasi</span>
            </div>
          </div>

          {/* TWO-COLUMN LAYOUT: MINI-SIDEBAR & CONTENT EDITOR */}
          <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
            {/* MINI-SIDEBAR VERTIKAL KIRI */}
            <div className="w-full md:w-64 lg:w-72 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/70 p-2.5 md:p-3 overflow-x-auto md:overflow-y-auto space-x-1.5 md:space-x-0 md:space-y-1.5 flex md:flex-col shrink-0 no-scrollbar">
              <span className="hidden md:block text-[10px] font-black uppercase tracking-wider text-slate-400 px-2 pt-1 pb-1">
                URUTAN SECTION (ATAS KE BAWAH)
              </span>
              {BUILDER_TABS.map((tab) => {
                const isEnabled = (singlePageForm as any)[tab.toggleKey] ?? tab.defaultEnabled;
                const isActive = activeBuilderTab === tab.id;
                return (
                  <div
                    key={tab.id}
                    onClick={() => setActiveBuilderTab(tab.id as any)}
                    className={`flex items-center justify-between p-2 md:p-2.5 rounded-xl md:rounded-2xl border transition-all cursor-pointer shrink-0 md:shrink select-none ${
                      isActive
                        ? 'bg-blue-50/90 border-blue-400 text-blue-950 shadow-xs ring-1 ring-blue-500/20'
                        : 'bg-white hover:bg-slate-100/90 border-slate-200/80 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-sm shrink-0">{tab.icon}</span>
                      <span className={`truncate text-xs font-bold ${
                        isActive ? 'text-blue-900 font-black' : 'text-slate-800'
                      }`}>
                        {tab.label}
                      </span>
                    </div>

                    {/* Status Badge + Inline Toggle */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSinglePageForm((p) => ({
                          ...p,
                          [tab.toggleKey]: !isEnabled,
                        }));
                      }}
                      className={`ml-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                        isEnabled
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                          : 'bg-slate-200 text-slate-500 border-slate-300 hover:bg-slate-300'
                      }`}
                      title={`Klik untuk On/Off: ${isEnabled ? 'Aktif' : 'Nonaktif'}`}
                    >
                      {isEnabled ? 'Aktif' : 'Mati'}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* CONTENT EDITOR RIGHT PANE */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-white space-y-4 text-xs">

          {/* TAB 1: HOOK & HERO */}
          {activeBuilderTab === 'hook' && (
            <div className="space-y-3.5 animate-fadeIn">
              <SectionToggleHeader
                title="Section 1: Judul & Banner Utama"
                description="Menampilkan headline utama, subheadline persuasif, badge promosi, dan banner gambar hero."
                enabled={singlePageForm.enable_hero ?? true}
                onChange={(val) => setSinglePageForm((p) => ({ ...p, enable_hero: val }))}
              />

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
                    placeholder="https://..."
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

          {/* TAB 2: GALERI FOTO PRODUK (MULTI-IMAGE) */}
          {activeBuilderTab === 'media_gallery' && (
            <div className="space-y-4 animate-fadeIn">
              <SectionToggleHeader
                title="Section 2: Galeri Foto Produk (Multi-Image)"
                description="Tampilkan 5–8 foto untuk visualisasi detail makanan penggugah selera, sudut produk fisik, atau materi penawaran. Di storefront publik ditampilkan sebagai slider/carousel interaktif dengan swipe di HP."
                enabled={singlePageForm.enable_media_gallery ?? true}
                onChange={(val) => setSinglePageForm((p) => ({ ...p, enable_media_gallery: val }))}
              />

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">Koleksi Foto Produk &amp; Varian</h4>
                  <p className="text-[10px] text-slate-500">Mendukung upload langsung atau paste link gambar JPG/PNG/WebP. Maksimal 8 foto.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const current = singlePageForm.gallery_images || [];
                    if (current.length >= 8) {
                      alert('Maksimal 8 foto galeri per produk.');
                      return;
                    }
                    setSinglePageForm((p) => ({
                      ...p,
                      gallery_images: [
                        ...(p.gallery_images || []),
                        { url: '', title: `Foto ${current.length + 1}`, category: 'Varian' },
                      ],
                    }));
                  }}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Foto Galeri</span>
                </button>
              </div>

              {/* Grid / List of gallery images */}
              <div className="space-y-3">
                {(!singlePageForm.gallery_images || singlePageForm.gallery_images.length === 0) ? (
                  <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-2">
                    <span className="text-2xl block">📸</span>
                    <p className="text-xs text-slate-700 font-bold">Belum ada foto galeri tambahan</p>
                    <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                      Tambahkan 5–8 foto untuk varian rasa makanan, sudut foto produk fisik, atau detail modul materi agar pembeli semakin tertarik &amp; percaya.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSinglePageForm((p) => ({
                          ...p,
                          gallery_images: [
                            { url: '', title: 'Foto 1', category: 'Varian' }
                          ],
                        }));
                      }}
                      className="mt-2 px-3 py-1.5 bg-white border border-slate-300 hover:border-blue-500 hover:text-blue-600 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      + Tambah Foto Pertama
                    </button>
                  </div>
                ) : (
                  singlePageForm.gallery_images.map((img, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center gap-3.5"
                    >
                      {/* Thumbnail Preview */}
                      <div className="w-20 h-20 rounded-xl bg-white border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                        {img.url ? (
                          <img src={img.url} alt={img.title || `Foto ${idx + 1}`} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] text-slate-400 font-mono text-center px-1">Belum Ada URL</span>
                        )}
                      </div>

                      {/* Inputs */}
                      <div className="flex-1 min-w-0 space-y-2 w-full">
                        <div>
                          <label className="text-[10px] font-bold text-slate-600 block mb-0.5">URL Foto / Gambar *</label>
                          <input
                            type="url"
                            value={img.url}
                            onChange={(e) => {
                              const list = [...(singlePageForm.gallery_images || [])];
                              list[idx] = { ...list[idx], url: e.target.value };
                              setSinglePageForm((p) => ({ ...p, gallery_images: list }));
                            }}
                            placeholder="https://... (masukkan URL gambar langsung)"
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-600"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Keterangan / Judul Foto (Opsional)</label>
                            <input
                              type="text"
                              value={img.title || ''}
                              onChange={(e) => {
                                const list = [...(singlePageForm.gallery_images || [])];
                                list[idx] = { ...list[idx], title: e.target.value };
                                setSinglePageForm((p) => ({ ...p, gallery_images: list }));
                              }}
                              placeholder="Contoh: Tampak Atas / Varian Cokelat"
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Label Kategori (Opsional)</label>
                            <input
                              type="text"
                              value={img.category || ''}
                              onChange={(e) => {
                                const list = [...(singlePageForm.gallery_images || [])];
                                list[idx] = { ...list[idx], category: e.target.value };
                                setSinglePageForm((p) => ({ ...p, gallery_images: list }));
                              }}
                              placeholder="Contoh: Varian / Detail / Menu"
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => {
                          const list = (singlePageForm.gallery_images || []).filter((_, i) => i !== idx);
                          setSinglePageForm((p) => ({ ...p, gallery_images: list }));
                        }}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer self-end sm:self-center shrink-0"
                        title="Hapus Foto Ini"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CLIENT LOGOS */}
          {activeBuilderTab === 'client_logos' && (
            <div className="space-y-3.5 animate-fadeIn">
              <SectionToggleHeader
                title="Section 3: Logo Partner / Bukti Liputan"
                description="Tampilkan grid logo brand/klien, mitra, atau portofolio untuk membangun trust & kredibilitas instan."
                enabled={singlePageForm.enable_client_logos ?? false}
                onChange={(val) => setSinglePageForm((p) => ({ ...p, enable_client_logos: val }))}
              />

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">Daftar Logo Klien & Brand Partner</h4>
                  <p className="text-[10px] text-slate-500">Tambahkan logo brand/klien yang pernah bekerja sama atau menggunakan layanan Anda.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSinglePageForm(p => ({
                    ...p,
                    client_logos: [
                      ...(p.client_logos || []),
                      { name: '', logo_url: '', category: '', link_url: '' }
                    ]
                  }))}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Klien/Logo
                </button>
              </div>

              <div className="space-y-3">
                {(singlePageForm.client_logos || []).map((logo, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700 text-[11px]">Klien / Partner #{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const logos = (singlePageForm.client_logos || []).filter((_, i) => i !== idx);
                          setSinglePageForm(p => ({ ...p, client_logos: logos }));
                        }}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-slate-600 font-bold block mb-1">Nama Brand / Klien *</label>
                        <input
                          type="text"
                          value={logo.name}
                          onChange={(e) => {
                            const logos = [...(singlePageForm.client_logos || [])];
                            logos[idx] = { ...logos[idx], name: e.target.value };
                            setSinglePageForm(p => ({ ...p, client_logos: logos }));
                          }}
                          placeholder="Contoh: Skincare Beauty, Kopi Kenangan, PT Maju"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-600"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 font-bold block mb-1">Kategori (Opsional)</label>
                        <input
                          type="text"
                          value={logo.category || ''}
                          onChange={(e) => {
                            const logos = [...(singlePageForm.client_logos || [])];
                            logos[idx] = { ...logos[idx], category: e.target.value };
                            setSinglePageForm(p => ({ ...p, client_logos: logos }));
                          }}
                          placeholder="Contoh: Fashion, Clinic, F&B, Agency"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>

                    <div>
                      <ImageUpload
                        label="Upload Logo Brand / Klien (PNG / SVG Transparan disarankan)"
                        value={logo.logo_url}
                        onChange={(url) => {
                          const logos = [...(singlePageForm.client_logos || [])];
                          logos[idx] = { ...logos[idx], logo_url: url };
                          setSinglePageForm(p => ({ ...p, client_logos: logos }));
                        }}
                        placeholder="Upload logo brand klien (Auto-convert WebP)"
                        tenantSlug={tenantSlug}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-600 font-bold block mb-1">URL Website / Profil Klien (Opsional)</label>
                      <input
                        type="url"
                        value={logo.link_url || ''}
                        onChange={(e) => {
                          const logos = [...(singlePageForm.client_logos || [])];
                          logos[idx] = { ...logos[idx], link_url: e.target.value };
                          setSinglePageForm(p => ({ ...p, client_logos: logos }));
                        }}
                        placeholder="https://..."
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-700 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>
                ))}

                {(!singlePageForm.client_logos || singlePageForm.client_logos.length === 0) && (
                  <div className="text-center py-8 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                    <p className="text-xs text-slate-500 font-medium">Belum ada logo klien yang ditambahkan.</p>
                    <button
                      type="button"
                      onClick={() => setSinglePageForm(p => ({
                        ...p,
                        client_logos: [{ name: '', logo_url: '', category: '', link_url: '' }]
                      }))}
                      className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Logo Pertama
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: PROBLEM & SOLUTION */}
          {activeBuilderTab === 'problem_solution' && (
            <div className="space-y-4 animate-fadeIn">
              <SectionToggleHeader
                title="Section 4: Masalah & Solusi"
                description="Eksplorasi poin masalah audiens (pain points) dan sajikan solusi serta fitur unggulan."
                enabled={singlePageForm.enable_problem_solution ?? true}
                onChange={(val) => setSinglePageForm((p) => ({ ...p, enable_problem_solution: val }))}
              />

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

          {/* TAB 5: US VS THEM */}
          {activeBuilderTab === 'comparison' && (
            <div className="space-y-3.5 animate-fadeIn">
              <SectionToggleHeader
                title="Section 5: Keunggulan Produk"
                description="Tabel komparasi yang memperlihatkan keunggulan produk Anda vs cara lama atau kompetitor."
                enabled={singlePageForm.enable_us_vs_them ?? true}
                onChange={(val) => setSinglePageForm((p) => ({ ...p, enable_us_vs_them: val }))}
              />

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

          {/* TAB 6: TESTIMONIAL */}
          {activeBuilderTab === 'social_proof' && (
            <div className="space-y-3.5 animate-fadeIn">
              <SectionToggleHeader
                title="Section 6: Testimoni Pelanggan"
                description="Tampilkan bukti kepuasan pelanggan melalui screenshot testimoni nyata."
                enabled={singlePageForm.enable_testimonials ?? true}
                onChange={(val) => setSinglePageForm((p) => ({ ...p, enable_testimonials: val }))}
              />

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

          {/* TAB 7: OFFER & BONUS */}
          {activeBuilderTab === 'offer_bonus' && (
            <div className="space-y-3.5 animate-fadeIn">
              <SectionToggleHeader
                title="Section 7: Penawaran & Bonus"
                description="Daftar item bonus gratis bernilai tinggi yang didapatkan pembeli saat transaksi hari ini."
                enabled={singlePageForm.enable_offer ?? true}
                onChange={(val) => setSinglePageForm((p) => ({ ...p, enable_offer: val }))}
              />

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

          {/* TAB 8: FAQ */}
          {activeBuilderTab === 'faq' && (
            <div className="space-y-3.5 animate-fadeIn">
              <SectionToggleHeader
                title="Section 8: Tanya Jawab (FAQ)"
                description="Jawab pertanyaan umum dan hilangkan keraguan calon pembeli sebelum melakukan pembayaran."
                enabled={singlePageForm.enable_faq ?? false}
                onChange={(val) => setSinglePageForm((p) => ({ ...p, enable_faq: val }))}
              />

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">Daftar Tanya Jawab (FAQ)</h4>
                  <p className="text-[10px] text-slate-500">Tambahkan FAQ untuk mengantisipasi pertanyaan calon pembeli.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSinglePageForm(p => ({
                    ...p,
                    faqs: [
                      ...(p.faqs || []),
                      { question: '', answer: '' }
                    ]
                  }))}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah FAQ
                </button>
              </div>

              <div className="space-y-3">
                {(singlePageForm.faqs || []).map((faq, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700 text-[11px] flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 text-[10px] flex items-center justify-center font-bold">
                          Q
                        </span>
                        FAQ #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const faqs = (singlePageForm.faqs || []).filter((_, i) => i !== idx);
                          setSinglePageForm(p => ({ ...p, faqs }));
                        }}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-600 font-bold block mb-1">Pertanyaan (Question) *</label>
                      <input
                        type="text"
                        value={faq.question}
                        onChange={(e) => {
                          const faqs = [...(singlePageForm.faqs || [])];
                          faqs[idx] = { ...faqs[idx], question: e.target.value };
                          setSinglePageForm(p => ({ ...p, faqs }));
                        }}
                        placeholder="Contoh: Apakah materi ini cocok untuk pemula?"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-600 font-bold block mb-1">Jawaban (Answer) *</label>
                      <textarea
                        rows={2}
                        value={faq.answer}
                        onChange={(e) => {
                          const faqs = [...(singlePageForm.faqs || [])];
                          faqs[idx] = { ...faqs[idx], answer: e.target.value };
                          setSinglePageForm(p => ({ ...p, faqs }));
                        }}
                        placeholder="Jelaskan jawaban secara ringkas, jelas, dan meyakinkan..."
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>
                ))}

                {(!singlePageForm.faqs || singlePageForm.faqs.length === 0) && (
                  <div className="text-center py-8 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                    <p className="text-xs text-slate-500 font-medium">Belum ada pertanyaan FAQ yang ditambahkan.</p>
                    <button
                      type="button"
                      onClick={() => setSinglePageForm(p => ({
                        ...p,
                        faqs: [{ question: '', answer: '' }]
                      }))}
                      className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Pertanyaan Pertama
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 9: BAYAR & VOUCHER */}
          {activeBuilderTab === 'payment_voucher' && (
            <div className="space-y-4 animate-fadeIn">
              <SectionToggleHeader
                title="Section 9: Checkout & Voucher"
                description="Formulir checkout data pembeli, pilihan metode bayar mandiri, dan aktivasi kupon promo."
                enabled={singlePageForm.enable_payment ?? true}
                onChange={(val) => setSinglePageForm((p) => ({ ...p, enable_payment: val }))}
              />

              {/* SELEKTOR TIPE AKSI / CALL TO ACTION (CTA) CHECKOUT */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50/40 border border-slate-200 rounded-2xl p-4 space-y-3.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold leading-none">🎯</span>
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">Tipe Aksi Transaksi / Call to Action (CTA)</h4>
                      <p className="text-[10px] text-slate-500">Pilih alur transaksi utama yang dialami calon pembeli saat mengunjungi landing page produk ini.</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 uppercase tracking-wide">
                    {(singlePageForm.checkout_action_mode || 'DIRECT') === 'DIRECT' ? 'Direct Order' : (singlePageForm.checkout_action_mode === 'WHATSAPP' ? 'Direct WhatsApp' : 'Hybrid')}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Mode 1: DIRECT */}
                  <label
                    onClick={() => setSinglePageForm(p => ({ ...p, checkout_action_mode: 'DIRECT' }))}
                    className={`relative p-3.5 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between select-none ${
                      (singlePageForm.checkout_action_mode || 'DIRECT') === 'DIRECT'
                        ? 'border-blue-600 bg-white shadow-sm ring-2 ring-blue-500/20'
                        : 'border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-base">🛒</span>
                        <input
                          type="radio"
                          name="checkout_action_mode"
                          value="DIRECT"
                          checked={(singlePageForm.checkout_action_mode || 'DIRECT') === 'DIRECT'}
                          onChange={() => setSinglePageForm(p => ({ ...p, checkout_action_mode: 'DIRECT' }))}
                          className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500"
                        />
                      </div>
                      <h5 className="font-black text-xs text-slate-900 leading-snug">
                        Form Checkout Langsung
                      </h5>
                      <span className="inline-block text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                        Direct Order
                      </span>
                      <p className="text-[10px] text-slate-500 leading-relaxed pt-1">
                        Form checkout instan di halaman lengkap dengan rincian data pembeli &amp; pembayaran QRIS/Transfer.
                      </p>
                    </div>
                  </label>

                  {/* Mode 2: WHATSAPP */}
                  <label
                    onClick={() => setSinglePageForm(p => ({ ...p, checkout_action_mode: 'WHATSAPP' }))}
                    className={`relative p-3.5 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between select-none ${
                      singlePageForm.checkout_action_mode === 'WHATSAPP'
                        ? 'border-emerald-600 bg-emerald-50/40 shadow-sm ring-2 ring-emerald-500/20'
                        : 'border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-base">💬</span>
                        <input
                          type="radio"
                          name="checkout_action_mode"
                          value="WHATSAPP"
                          checked={singlePageForm.checkout_action_mode === 'WHATSAPP'}
                          onChange={() => setSinglePageForm(p => ({ ...p, checkout_action_mode: 'WHATSAPP' }))}
                          className="h-3.5 w-3.5 text-emerald-600 focus:ring-emerald-500"
                        />
                      </div>
                      <h5 className="font-black text-xs text-slate-900 leading-snug">
                        Konsultasi / Order via WhatsApp
                      </h5>
                      <span className="inline-block text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        Chat to Close
                      </span>
                      <p className="text-[10px] text-slate-500 leading-relaxed pt-1">
                        Tombol utama langsung mengarahkan buyer ke WhatsApp CS/seller dengan template pesan otomatis.
                      </p>
                    </div>
                  </label>

                  {/* Mode 3: HYBRID */}
                  <label
                    onClick={() => setSinglePageForm(p => ({ ...p, checkout_action_mode: 'HYBRID' }))}
                    className={`relative p-3.5 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between select-none ${
                      singlePageForm.checkout_action_mode === 'HYBRID'
                        ? 'border-indigo-600 bg-indigo-50/40 shadow-sm ring-2 ring-indigo-500/20'
                        : 'border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-base">⚡</span>
                        <input
                          type="radio"
                          name="checkout_action_mode"
                          value="HYBRID"
                          checked={singlePageForm.checkout_action_mode === 'HYBRID'}
                          onChange={() => setSinglePageForm(p => ({ ...p, checkout_action_mode: 'HYBRID' }))}
                          className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500"
                        />
                      </div>
                      <h5 className="font-black text-xs text-slate-900 leading-snug">
                        Keduanya (Form + WA Melayang)
                      </h5>
                      <span className="inline-block text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">
                        Rekomendasi
                      </span>
                      <p className="text-[10px] text-slate-500 leading-relaxed pt-1">
                        Form checkout aktif di halaman, ditambah tombol WhatsApp melayang agar buyer bisa bertanya jika ragu.
                      </p>
                    </div>
                  </label>
                </div>

                {/* SINKRONISASI KONFIGURASI WHATSAPP & PRE-FILLED DRAFT */}
                {(singlePageForm.checkout_action_mode === 'WHATSAPP' || singlePageForm.checkout_action_mode === 'HYBRID') && (
                  <div className="p-3.5 bg-white border border-emerald-200 rounded-xl space-y-3 animate-fadeIn">
                    <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                      <div className="flex items-center gap-1.5">
                        <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-bold text-slate-900 text-xs">Pengaturan WhatsApp CS &amp; Pesan Otomatis</span>
                      </div>
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                        WhatsApp Terhubung
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="font-bold text-slate-700 block text-[11px] mb-1">
                          Nomor WhatsApp CS / Seller (Opsional)
                        </label>
                        <input
                          type="tel"
                          value={singlePageForm.whatsapp_number || ''}
                          onChange={(e) => setSinglePageForm(p => ({ ...p, whatsapp_number: e.target.value }))}
                          placeholder="Contoh: 081234567890 (Gunakan nomor toko jika kosong)"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 font-medium focus:outline-none focus:border-emerald-600"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Jika dikosongkan, sistem otomatis memakai nomor WhatsApp resmi toko.
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-bold text-slate-700 block text-[11px]">
                            Teks Pesan WhatsApp Otomatis
                          </label>
                          <button
                            type="button"
                            onClick={() => setSinglePageForm(p => ({
                              ...p,
                              whatsapp_custom_message: 'Halo Admin, saya tertarik dengan produk {nama_produk}. Boleh minta info lebih detail?'
                            }))}
                            className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold underline cursor-pointer"
                          >
                            Gunakan Template
                          </button>
                        </div>
                        <input
                          type="text"
                          value={singlePageForm.whatsapp_custom_message ?? ''}
                          onChange={(e) => setSinglePageForm(p => ({ ...p, whatsapp_custom_message: e.target.value }))}
                          placeholder="Halo Admin, saya tertarik dengan produk {nama_produk}..."
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 font-medium focus:outline-none focus:border-emerald-600"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Gunakan variabel <code className="text-emerald-700 font-bold">{"{nama_produk}"}</code> untuk otomatis diisi nama produk saat buyer mengklik tombol.
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

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
                  <div className="flex items-center gap-2">
                    {singlePageForm.voucher?.is_enabled !== false && (
                      <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full uppercase">
                        {singlePageForm.voucher?.code || 'NO-CODE'}
                      </span>
                    )}
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={singlePageForm.voucher?.is_enabled !== false}
                        onChange={(e) => {
                          const isEnabled = e.target.checked;
                          setSinglePageForm(p => ({
                            ...p,
                            voucher: {
                              ...(p.voucher || {
                                code: p.discount_coupon || 'HEMAT50',
                                discount_type: 'nominal',
                                discount_value: 20000,
                                shipping_discount_type: 'none',
                                shipping_discount_value: 0,
                                min_spend: 0
                              }),
                              is_enabled: isEnabled
                            }
                          }));
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                </div>

                {singlePageForm.voucher?.is_enabled === false ? (
                  <p className="text-[11px] text-slate-500 italic bg-white p-3 rounded-xl border border-dashed border-indigo-200">
                    Voucher promo dinonaktifkan. Kotak input kupon tidak akan muncul di halaman checkout pembeli.
                  </p>
                ) : (
                  <>
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
                                code,
                                is_enabled: true
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
                                min_spend: val,
                                is_enabled: true
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
                              discount_value: (p.voucher?.discount_value && p.voucher.discount_type === 'percentage') ? 20000 : (p.voucher?.discount_value || 20000),
                              is_enabled: true
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
                              discount_value: (p.voucher?.discount_value && p.voucher.discount_type === 'nominal') ? 10 : (p.voucher?.discount_value || 10),
                              is_enabled: true
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
                                  discount_value: val,
                                  is_enabled: true
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
                                shipping_discount_type: item.id as any,
                                is_enabled: true
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
                                    shipping_discount_value: val,
                                    is_enabled: true
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
                  </>
                )}
              </div>

              {/* C. Dynamic CTA Button Text Input */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 block text-xs">
                    Teks Tombol Aksi / CTA Label
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    Default: <strong className="text-blue-600 font-bold">
                      {singlePageForm.checkout_action_mode === 'WHATSAPP'
                        ? '"Order via WhatsApp Langsung"'
                        : `"${activeProduct.category === 'fisik' ? 'Beli Sekarang' : 'Daftar Kelas Sekarang'}"`}
                    </strong>
                  </span>
                </div>
                <input
                  type="text"
                  value={singlePageForm.cta_label || ''}
                  onChange={(e) => setSinglePageForm(p => ({ ...p, cta_label: e.target.value }))}
                  placeholder={`Contoh: ${activeProduct.category === 'fisik' ? 'Beli Sekarang' : 'Daftar Kelas Sekarang'} / Pesan Sekarang`}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-indigo-600"
                />
                <p className="text-[10px] text-slate-400">
                  Label tombol aksi pembeli di landing page &amp; formulir checkout.
                </p>
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

            </div>{/* Akhir Content Editor Right Pane */}
          </div>{/* Akhir Two-Column Layout */}

          {/* MODAL FOOTER ACTION BAR */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 shrink-0 flex items-center justify-between gap-3">
            <a
              href={getProductPageUrl(tenantSlug, singlePageForm.slug || slugify(activeProduct.name))}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 transition flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              <span>Preview Halaman</span>
            </a>

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
