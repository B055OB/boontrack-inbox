'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Wand2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Copy,
  Check,
  Loader2,
  Lock,
} from 'lucide-react';
import type { ProductItem } from '@/lib/product-catalog';

// ── Types ────────────────────────────────────────────────────────────────────

type CanonicalVertical =
  | 'PHYSICAL'
  | 'DIGITAL'
  | 'FIELD_SERVICE'
  | 'PROFESSIONAL_SERVICE'
  | 'FOOD'
  | 'CREATOR_AGENCY';

type PitchTone = 'trust_builder' | 'balanced' | 'hard_sell';

interface PitchOutput {
  tagline: string;
  description: string;
  facilities: string[];
  promo_label?: string;
  cta_label?: string;
  seo_slug_suggestion: string;
  vertical_notes?: string;
}

export interface BoonPilotPitchModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when merchant clicks "Apply to Form" — patches the ProductFormModal state */
  onApply: (patch: Partial<ProductItem>) => void;
  tenantSlug: string;
  /** Pre-fill vertical selector based on current store category */
  defaultVertical?: CanonicalVertical;
  /** Pre-fill product name from the form */
  defaultProductName?: string;
  isCheckoutLite?: boolean;
}

// ── Vertical options ──────────────────────────────────────────────────────────

const VERTICAL_OPTIONS: { key: CanonicalVertical; label: string; icon: string; hint: string }[] = [
  { key: 'PHYSICAL',             label: 'Retail & Fisik',       icon: '📦', hint: 'Produk yang dikirim via ekspedisi' },
  { key: 'DIGITAL',              label: 'Digital & Kursus',     icon: '💻', hint: 'E-course, template, software, akses online' },
  { key: 'FOOD',                 label: 'Kuliner & F&B',        icon: '🍜', hint: 'Makanan, minuman, katering, UMKM kuliner' },
  { key: 'FIELD_SERVICE',        label: 'Jasa Lapangan',        icon: '🔧', hint: 'Teknisi, laundry, salon, servis AC' },
  { key: 'PROFESSIONAL_SERVICE', label: 'Jasa Profesional',     icon: '💼', hint: 'Konsultan, legal, coaching, umroh' },
  { key: 'CREATOR_AGENCY',       label: 'Agency & Kreator',     icon: '🎨', hint: 'Marketing agency, konten kreator, dev shop' },
];

const TONE_OPTIONS: { key: PitchTone; label: string; desc: string }[] = [
  { key: 'trust_builder', label: '🛡️ Bangun Kepercayaan', desc: 'Hangat, edukatif, cocok untuk toko baru' },
  { key: 'balanced',      label: '⚖️ Seimbang',           desc: 'Profesional & informatif, most popular' },
  { key: 'hard_sell',     label: '⚡ Hard Selling',       desc: 'Urgensi tinggi, CTA agresif' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BoonPilotPitchModal({
  isOpen,
  onClose,
  onApply,
  tenantSlug,
  defaultVertical = 'PHYSICAL',
  defaultProductName = '',
  isCheckoutLite = false,
}: BoonPilotPitchModalProps) {
  // Form state
  const [productName, setProductName] = useState(defaultProductName);
  const [vertical, setVertical] = useState<CanonicalVertical>(defaultVertical);
  const [tone, setTone] = useState<PitchTone>('balanced');
  const [price, setPrice] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [keyBenefits, setKeyBenefits] = useState('');

  // Generation state
  const [isLoading, setIsLoading] = useState(false);
  const [pitch, setPitch] = useState<PitchOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!isOpen) return null;

  // ── Entitlement block for CHECKOUT_LITE ──────────────────────────────────
  if (isCheckoutLite) {
    return (
      <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7 text-amber-600" />
            </div>
            <h3 className="font-black text-slate-900 text-base">Fitur Premium</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>BoonPilot Product Pitch Architect</strong> hanya tersedia untuk paket{' '}
              <strong className="text-blue-700">Starter, Pro Scale,</strong> dan di atasnya.
            </p>
            <p className="text-xs text-slate-500">
              Upgrade sekarang untuk generate deskripsi produk, tagline, dan fasilitas secara otomatis menggunakan AI.
            </p>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Generate handler ─────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!productName.trim()) {
      setError('Nama produk wajib diisi sebelum generate pitch.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setPitch(null);

    try {
      const res = await fetch('/api/v1/boonpilot/generate-product-pitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          product_name: productName.trim(),
          vertical,
          tone,
          price: price ? Number(price) : undefined,
          target_audience: targetAudience.trim() || undefined,
          key_benefits: keyBenefits.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403 && data.error === 'FEATURE_NOT_ENTITLED') {
          setError('⚠️ Fitur ini memerlukan upgrade paket. Hubungi tim BoonTrack untuk upgrade.');
        } else {
          setError(data.message || 'Terjadi kesalahan. Silakan coba lagi.');
        }
        return;
      }

      setPitch(data.pitch);
    } catch {
      setError('Gagal menghubungi server. Periksa koneksi internet Anda.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Apply pitch to product form ───────────────────────────────────────────
  const handleApply = () => {
    if (!pitch) return;

    const facilitiesArr = pitch.facilities || [];
    const suggestedSlug = pitch.seo_slug_suggestion || slugify(productName);

    const patch: Partial<ProductItem> = {
      name: productName.trim() || undefined,
      description: pitch.description || undefined,
      slug: suggestedSlug,
      promo: pitch.promo_label || undefined,
      cta_label: pitch.cta_label || undefined,
      facilities: facilitiesArr,
      features: facilitiesArr,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      single_page_config: {
        slug: suggestedSlug,
        headline: pitch.tagline,
        subheadline: '',
        banner_url: '',
        discount_coupon: '',
        enable_qris: true,
        enable_manual_transfer: true,
        affiliate_commission_rate: 0,
        solution_title: 'Apa yang Kamu Dapatkan?',
        solution_points: facilitiesArr,
      },

      metadata: {
        tagline: pitch.tagline,
        facilities: facilitiesArr,
        features: facilitiesArr,
        solution_points: facilitiesArr,
        boonpilot_generated: true,
      },
    };

    onApply(patch);
    onClose();
  };

  // ── Copy helper ───────────────────────────────────────────────────────────
  const copyText = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">

        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-violet-600 to-indigo-600 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black">BoonPilot Product Pitch Architect</h3>
              <p className="text-[11px] text-violet-200">Generate deskripsi & copy produk otomatis dengan AI</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Step 1: Vertical selector */}
          <div>
            <label className="text-xs font-black text-slate-700 block mb-2">
              1. Pilih Tipe Produk / Vertikal Bisnis *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {VERTICAL_OPTIONS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setVertical(v.key)}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    vertical === v.key
                      ? 'bg-violet-50 border-violet-500 ring-2 ring-violet-500/20'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80'
                  }`}
                >
                  <div className="text-base mb-0.5">{v.icon}</div>
                  <div className={`text-[11px] font-bold ${vertical === v.key ? 'text-violet-900' : 'text-slate-800'}`}>
                    {v.label}
                  </div>
                  <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{v.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Product info */}
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-700 block">
              2. Informasi Produk
            </label>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Nama Produk *</label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Contoh: Ecourse Ads Masterclass, Kopi Arabika Gayo 250g..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-violet-500 focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Harga (Rp) — Opsional</label>
                <input
                  type="number"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Contoh: 250000"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-violet-500 focus:bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Target Pembeli — Opsional</label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="Contoh: Ibu rumah tangga, pebisnis UMKM..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-violet-500 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                Keunggulan & Benefit Utama — Opsional
              </label>
              <textarea
                rows={2}
                value={keyBenefits}
                onChange={(e) => setKeyBenefits(e.target.value)}
                placeholder="Contoh: bahan organik, garansi 30 hari, lifetime access, sertifikat, gratis ongkir..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-violet-500 focus:bg-white resize-none"
              />
            </div>
          </div>

          {/* Step 3: Tone */}
          <div>
            <label className="text-xs font-black text-slate-700 block mb-2">3. Gaya Penulisan (Tone)</label>
            <div className="grid grid-cols-3 gap-2">
              {TONE_OPTIONS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTone(t.key)}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    tone === t.key
                      ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500/20'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80'
                  }`}
                >
                  <div className={`text-[11px] font-bold ${tone === t.key ? 'text-indigo-900' : 'text-slate-800'}`}>
                    {t.label}
                  </div>
                  <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-2xl">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs text-red-800 font-medium">{error}</p>
            </div>
          )}

          {/* Generated pitch result */}
          {pitch && (
            <div className="space-y-3 p-4 bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200 rounded-2xl">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-violet-600" />
                <span className="text-xs font-black text-violet-900">Pitch Berhasil Digenerate!</span>
              </div>

              {/* Tagline */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tagline</span>
                  <button
                    type="button"
                    onClick={() => copyText(pitch.tagline, 'tagline')}
                    className="flex items-center gap-1 text-[10px] text-violet-600 hover:text-violet-800 font-bold cursor-pointer"
                  >
                    {copiedField === 'tagline' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedField === 'tagline' ? 'Disalin!' : 'Salin'}
                  </button>
                </div>
                <p className="text-sm font-black text-slate-900 bg-white rounded-xl px-3 py-2 border border-violet-200">
                  {pitch.tagline}
                </p>
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Deskripsi Produk</span>
                  <button
                    type="button"
                    onClick={() => copyText(pitch.description, 'desc')}
                    className="flex items-center gap-1 text-[10px] text-violet-600 hover:text-violet-800 font-bold cursor-pointer"
                  >
                    {copiedField === 'desc' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedField === 'desc' ? 'Disalin!' : 'Salin'}
                  </button>
                </div>
                <p className="text-xs text-slate-700 bg-white rounded-xl px-3 py-2.5 border border-violet-200 leading-relaxed">
                  {pitch.description}
                </p>
              </div>

              {/* Facilities */}
              {pitch.facilities?.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Fasilitas / Benefit ({pitch.facilities.length} poin)
                  </span>
                  <ul className="space-y-1">
                    {pitch.facilities.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-700 bg-white rounded-lg px-3 py-1.5 border border-violet-100">
                        <span className="text-violet-500 font-bold shrink-0">✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Inline meta */}
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                {pitch.promo_label && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                    <div className="text-amber-700 font-bold mb-0.5">Label Promo</div>
                    <div className="text-amber-900 font-black">{pitch.promo_label}</div>
                  </div>
                )}
                {pitch.cta_label && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                    <div className="text-emerald-700 font-bold mb-0.5">Teks CTA</div>
                    <div className="text-emerald-900 font-black">{pitch.cta_label}</div>
                  </div>
                )}
                {pitch.seo_slug_suggestion && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                    <div className="text-blue-700 font-bold mb-0.5">Slug URL</div>
                    <div className="text-blue-900 font-mono text-[9px] break-all">{pitch.seo_slug_suggestion}</div>
                  </div>
                )}
              </div>

              {pitch.vertical_notes && (
                <div className="flex items-start gap-2 p-2.5 bg-slate-100 rounded-xl text-[10px] text-slate-600">
                  <Sparkles className="w-3 h-3 text-violet-500 shrink-0 mt-0.5" />
                  <span>{pitch.vertical_notes}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-100 flex gap-3 shrink-0 bg-slate-50">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isLoading || !productName.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-black shadow-md shadow-violet-500/25 hover:from-violet-700 hover:to-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                <span>{pitch ? 'Generate Ulang' : 'Generate Pitch'}</span>
              </>
            )}
          </button>

          {pitch && (
            <button
              type="button"
              onClick={handleApply}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md shadow-emerald-500/20 transition active:scale-95 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
              <span>Terapkan ke Form</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
