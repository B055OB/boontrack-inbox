'use client';

import React, { useState, useId, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Store,
  Phone,
  Tag,
  Gift,
  Package,
  Sparkles,
  Bot,
  Building2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Send,
  ExternalLink,
  ShieldCheck,
  Zap,
  ShoppingBag,
  CreditCard,
  Copy,
  Check,
  MessageSquare,
  BadgeCheck,
} from 'lucide-react';

interface FormData {
  // Step 1: Toko & Kontak
  storeName: string;
  slug: string;
  waNumber: string;
  category: string;
  referralCode: string;

  // Step 2: Produk & AI
  productName: string;
  productPrice: string;
  promoBundle: string;
  variants: string;
  aiTone: string;

  // Step 3: Rekening & WhatsApp
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  agreeAiAutoReply: boolean;
  agreeQrisSettlement: boolean;
}

const CATEGORIES = [
  { id: 'fashion', label: 'Fashion & Hijab Modest Wear', icon: ShoppingBag },
  { id: 'fnb', label: 'F&B, Cafe, Resto & Kuliner', icon: Store },
  { id: 'fitness', label: 'Fitness, Studio & Gym Hub', icon: Zap },
  { id: 'beauty', label: 'Klinik & Salon Kecantikan', icon: Sparkles },
  { id: 'retail', label: 'Retail, Minimarket & Sembako', icon: Package },
  { id: 'services', label: 'Jasa Profesional & Konsultan', icon: Building2 },
];

const AI_TONES = [
  {
    id: 'casual_modest',
    name: 'Ramah & Santun (Casual Modest)',
    desc: 'Cocok untuk butik hijab, cafe santai, & toko retail.',
    sample: 'Halo Kak! Ada koleksi hijab atau promo favorit yang ingin dicek hari ini? ✨',
  },
  {
    id: 'energetic',
    name: 'Energetic & Sporty',
    desc: 'Cocok untuk gym, apparel olahraga, & produk aktif.',
    sample: 'Halo Sobat! Siap bakar kalori atau kepoin membership baru? Let\'s go! 💪',
  },
  {
    id: 'formal',
    name: 'Formal & Profesional',
    desc: 'Cocok untuk instansi, jasa konsultan, & klinik.',
    sample: 'Selamat datang. Kami siap membantu konsultasi dan penjadwalan sesi Anda.',
  },
  {
    id: 'genz',
    name: 'Gaul & Seru (Gen-Z Vibe)',
    desc: 'Cocok untuk distro, street food, & brand kekinian.',
    sample: 'Hai bestie! Mau kepoin produk best-seller kita yang lagi viral hari ini? 🔥',
  },
];

const BANKS = [
  'BCA (Bank Central Asia)',
  'Mandiri',
  'BRI (Bank Rakyat Indonesia)',
  'BNI (Bank Negara Indonesia)',
  'BSI (Bank Syariah Indonesia)',
  'Bank Jago',
  'CIMB Niaga',
  'Permata Bank',
  'SeaBank',
];

function sanitizeWaNumber(val: string): string {
  const digits = val.replace(/[^0-9]/g, '');
  if (digits.startsWith('0')) {
    return '62' + digits.slice(1);
  }
  if (digits.startsWith('8')) {
    return '62' + digits;
  }
  return digits;
}

function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function PilotOnboardingWizard() {
  const searchParams = useSearchParams();
  const rawRef = searchParams.get('ref') || '';

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const [formData, setFormData] = useState<FormData>(() => ({
    storeName: '',
    slug: '',
    waNumber: '628',
    category: 'fashion',
    referralCode: rawRef || '',
    productName: '',
    productPrice: '',
    promoBundle: '',
    variants: '',
    aiTone: 'casual_modest',
    bankName: 'BCA (Bank Central Asia)',
    bankAccountNumber: '',
    bankAccountHolder: '',
    agreeAiAutoReply: true,
    agreeQrisSettlement: true,
  }));

  const [onboardedResult, setOnboardedResult] = useState<{
    slug: string;
    storeName: string;
    waNumber: string;
    botNumber: string;
    redirectWaUrl: string;
  } | null>(null);

  // Handle store name input and auto-generate slug if slug wasn't manually edited
  const handleStoreNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setFormData((prev) => ({
      ...prev,
      storeName: name,
      slug: prev.slug === '' || prev.slug === generateSlugFromName(prev.storeName)
        ? generateSlugFromName(name)
        : prev.slug,
    }));
  };

  const handleWaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const sanitized = sanitizeWaNumber(raw);
    setFormData((prev) => ({ ...prev, waNumber: sanitized }));
  };

  // Form field validations per step
  const validateStep1 = () => {
    if (!formData.storeName.trim()) {
      setErrorMsg('Nama toko tidak boleh kosong.');
      return false;
    }
    if (!formData.waNumber.startsWith('628') || formData.waNumber.length < 10) {
      setErrorMsg('Nomor WhatsApp harus berformat 628... minimal 10 digit.');
      return false;
    }
    setErrorMsg(null);
    return true;
  };

  const validateStep2 = () => {
    if (!formData.productName.trim()) {
      setErrorMsg('Nama produk sampel wajib diisi.');
      return false;
    }
    if (!formData.productPrice.trim() || isNaN(Number(formData.productPrice.replace(/\D/g, '')))) {
      setErrorMsg('Harga produk wajib diisi angka valid.');
      return false;
    }
    setErrorMsg(null);
    return true;
  };

  const validateStep3 = () => {
    if (!formData.bankAccountNumber.trim()) {
      setErrorMsg('Nomor rekening bank penarikan wajib diisi.');
      return false;
    }
    if (!formData.bankAccountHolder.trim()) {
      setErrorMsg('Nama pemilik rekening wajib diisi.');
      return false;
    }
    if (!formData.agreeAiAutoReply || !formData.agreeQrisSettlement) {
      setErrorMsg('Anda perlu mencentang persetujuan aktivasi AI dan QRIS.');
      return false;
    }
    setErrorMsg(null);
    return true;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2);
    if (step === 2 && validateStep2()) setStep(3);
  };

  const handleBack = () => {
    setErrorMsg(null);
    if (step === 2) setStep(1);
    if (step === 3) setStep(2);
  };

  const handleSubmitOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep3()) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const cleanPrice = Number(formData.productPrice.replace(/\D/g, ''));
      const payload = {
        storeName: formData.storeName.trim(),
        slug: formData.slug.trim() || generateSlugFromName(formData.storeName),
        waNumber: formData.waNumber.trim(),
        category: formData.category,
        referralCode: formData.referralCode.trim(),
        productName: formData.productName.trim(),
        productPrice: cleanPrice,
        promoBundle: formData.promoBundle.trim(),
        variants: formData.variants.trim(),
        aiTone: formData.aiTone,
        bankName: formData.bankName,
        bankAccountNumber: formData.bankAccountNumber.trim(),
        bankAccountHolder: formData.bankAccountHolder.trim(),
      };

      const res = await fetch('/api/v1/tenants/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal menyimpan data onboarding.');
      }

      setOnboardedResult({
        slug: data.tenant.slug,
        storeName: data.tenant.storeName,
        waNumber: data.tenant.waNumber,
        botNumber: data.tenant.botNumber || '6281298877665',
        redirectWaUrl: data.redirectWaUrl,
      });

      setStep(4);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyStoreLink = () => {
    if (typeof window !== 'undefined' && onboardedResult) {
      const url = `${window.location.origin}/${onboardedResult.slug}`;
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const storeNameId = useId();
  const slugId = useId();
  const waNumberId = useId();
  const categoryId = useId();
  const referralId = useId();
  const productNameId = useId();
  const productPriceId = useId();
  const promoBundleId = useId();
  const variantsId = useId();
  const bankNameId = useId();
  const bankAccountNumId = useId();
  const bankAccountHolderId = useId();
  const agreeAiId = useId();
  const agreeQrisId = useId();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-blue-600 selection:text-white">
      {/* Top Brand Header */}
      <header className="bg-slate-900/90 border-b border-slate-800 px-6 py-4 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20 font-black text-white text-lg">
              B
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base text-white tracking-tight">
                  BoonTrack <span className="text-blue-400">Pilot Onboarding</span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Self-Service
                </span>
              </div>
              <p className="text-xs text-slate-400">Daftarkan Toko, Produk & Aktifkan AI WhatsApp dalam 3 Menit</p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Pilot Partner Program</span>
          </div>
        </div>
      </header>

      {/* Progress Stepper (Hidden on Step 4 / Success) */}
      {step < 4 && (
        <div className="max-w-4xl mx-auto w-full px-6 pt-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="grid grid-cols-3 gap-2">
              {/* Step 1 Indicator */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition ${
                    step >= 1
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  1
                </div>
                <div className="min-w-0 hidden sm:block">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Langkah 1</p>
                  <p className={`text-xs font-bold truncate ${step === 1 ? 'text-white' : 'text-slate-400'}`}>
                    Identitas Toko
                  </p>
                </div>
              </div>

              {/* Step 2 Indicator */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition ${
                    step >= 2
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  2
                </div>
                <div className="min-w-0 hidden sm:block">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Langkah 2</p>
                  <p className={`text-xs font-bold truncate ${step === 2 ? 'text-white' : 'text-slate-400'}`}>
                    Produk & AI
                  </p>
                </div>
              </div>

              {/* Step 3 Indicator */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition ${
                    step >= 3
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  3
                </div>
                <div className="min-w-0 hidden sm:block">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Langkah 3</p>
                  <p className={`text-xs font-bold truncate ${step === 3 ? 'text-white' : 'text-slate-400'}`}>
                    Rekening & WA
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Wizard Form Container */}
      <main className="max-w-4xl mx-auto w-full p-6 flex-1 flex flex-col justify-center">
        {/* Error Alert Box */}
        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-3 animate-in fade-in">
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping shrink-0" />
            <p className="flex-1">{errorMsg}</p>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 1: Identitas Toko, WhatsApp 628, Kategori & Referral                 */}
        {/* ========================================================================= */}
        {step === 1 && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                <Store className="w-6 h-6 text-blue-400" />
                <span>Identitas Toko & Kontak WhatsApp</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Lengkapi informasi dasar bisnis Anda untuk pembuatan URL publik dan koneksi nomor CS toko.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Nama Toko */}
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor={storeNameId} className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Nama Toko / Brand <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Store className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    id={storeNameId}
                    type="text"
                    required
                    value={formData.storeName}
                    onChange={handleStoreNameChange}
                    placeholder="Contoh: Butik Nyka Hijab / Kopi Janji Kita"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>

              {/* Slug / Domain URL Preview */}
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor={slugId} className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  URL Toko / Domain Slug
                </label>
                <div className="flex rounded-xl bg-slate-950/80 border border-slate-800 overflow-hidden focus-within:border-blue-500 transition">
                  <span className="bg-slate-900 px-3 py-2.5 text-xs text-slate-500 font-mono flex items-center border-r border-slate-800 shrink-0">
                    boontrack.com/
                  </span>
                  <input
                    id={slugId}
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    placeholder="nama-toko"
                    className="w-full bg-transparent px-3 py-2.5 text-sm text-white font-mono placeholder-slate-600 focus:outline-none"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Domain toko Anda otomatis aktif di <span className="text-blue-400 font-mono">boontrack.com/{formData.slug || 'nama-toko'}</span>
                </p>
              </div>

              {/* WhatsApp 628... */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={waNumberId} className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Nomor WhatsApp Toko <span className="text-rose-400">*</span>
                  </label>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    Wajib 628...
                  </span>
                </div>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    id={waNumberId}
                    type="tel"
                    required
                    value={formData.waNumber}
                    onChange={handleWaChange}
                    placeholder="6281234567890"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Masukkan nomor WhatsApp CS/Owner yang akan menerima notifikasi order dan pesan dari pelanggan.
                </p>
              </div>

              {/* Referral Code (Auto captured from ?ref=...) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={referralId} className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Kode Referral / Partner
                  </label>
                  {formData.referralCode && (
                    <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                      <Gift className="w-3 h-3" />
                      <span>Terpasang</span>
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Tag className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    id={referralId}
                    type="text"
                    value={formData.referralCode}
                    onChange={(e) => setFormData({ ...formData, referralCode: e.target.value })}
                    placeholder="Contoh: REF-PILOT-2026"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition font-mono uppercase"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  {rawRef ? 'Otomatis terisi dari link referral Anda.' : 'Kosongkan jika tidak memiliki kode referral.'}
                </p>
              </div>

              {/* Kategori Industri */}
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor={categoryId} className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Kategori Industri Bisnis <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = formData.category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, category: cat.id })}
                        className={`p-3 rounded-xl border text-left transition flex flex-col gap-2 ${
                          isSelected
                            ? 'bg-blue-600/15 border-blue-500 text-blue-300 ring-1 ring-blue-500/50'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`} />
                        <span className="text-xs font-semibold leading-tight">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Step 1 Actions */}
            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition flex items-center gap-2"
              >
                <span>Lanjut ke Langkah 2: Produk & AI</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: Input 1 Produk Sampel & Tone of Voice AI                         */}
        {/* ========================================================================= */}
        {step === 2 && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                <Package className="w-6 h-6 text-indigo-400" />
                <span>Produk Sampel & Kepribadian AI</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Masukkan 1 produk unggulan Anda. AI Assistant akan mempelajari deskripsi produk ini untuk menjawab pelanggan Anda.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Nama Produk */}
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor={productNameId} className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Nama Produk Sampel <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Package className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    id={productNameId}
                    type="text"
                    required
                    value={formData.productName}
                    onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                    placeholder="Contoh: Pashmina Silk Plisket / Kopi Susu Creamy 500ml"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Harga Produk */}
              <div className="space-y-1.5">
                <label htmlFor={productPriceId} className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Harga Satuan (IDR) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <span className="text-xs font-mono font-bold text-slate-500 absolute left-3.5 top-3">Rp</span>
                  <input
                    id={productPriceId}
                    type="text"
                    required
                    value={formData.productPrice}
                    onChange={(e) => {
                      const num = e.target.value.replace(/\D/g, '');
                      setFormData({ ...formData, productPrice: num ? Number(num).toLocaleString('id-ID') : '' });
                    }}
                    placeholder="75.000"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-11 pr-4 py-2.5 text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Bundling Promo */}
              <div className="space-y-1.5">
                <label htmlFor={promoBundleId} className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Bundling Promo (Opsional)
                </label>
                <input
                  id={promoBundleId}
                  type="text"
                  value={formData.promoBundle}
                  onChange={(e) => setFormData({ ...formData, promoBundle: e.target.value })}
                  placeholder="Contoh: Beli 2 Diskon 10% / Free Ongkir"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              {/* Varian Produk */}
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor={variantsId} className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Pilihan Varian (Warna / Ukuran / Rasa)
                </label>
                <input
                  id={variantsId}
                  type="text"
                  value={formData.variants}
                  onChange={(e) => setFormData({ ...formData, variants: e.target.value })}
                  placeholder="Contoh: Hitam, Sage Green, Mocca, Broken White (Ukuran All Size)"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              {/* Tone of Voice AI */}
              <div className="space-y-2 sm:col-span-2 pt-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-indigo-400" />
                  <span>Gaya Komunikasi (Tone of Voice) AI Bot</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {AI_TONES.map((tone) => {
                    const isSelected = formData.aiTone === tone.id;
                    return (
                      <button
                        key={tone.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, aiTone: tone.id })}
                        className={`p-4 rounded-xl border text-left transition space-y-1 ${
                          isSelected
                            ? 'bg-indigo-600/15 border-indigo-500 text-white ring-1 ring-indigo-500/50 shadow-md shadow-indigo-950'
                            : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <p className="text-xs font-bold text-indigo-300">{tone.name}</p>
                        <p className="text-[11px] text-slate-400">{tone.desc}</p>
                        <div className="mt-2 pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 italic">
                          &ldquo;{tone.sample}&rdquo;
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Step 2 Actions */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Kembali</span>
              </button>

              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition flex items-center gap-2"
              >
                <span>Lanjut ke Rekening & Aktivasi</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: Rekening Penarikan & Connect WhatsApp                             */}
        {/* ========================================================================= */}
        {step === 3 && (
          <form onSubmit={handleSubmitOnboarding} className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                <CreditCard className="w-6 h-6 text-emerald-400" />
                <span>Rekening Penarikan & Koneksi WhatsApp Gateway</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Rekening tujuan settlement pencairan QRIS harian serta persetujuan aktivasi bot WhatsApp toko Anda.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Nama Bank */}
              <div className="space-y-1.5">
                <label htmlFor={bankNameId} className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Nama Bank <span className="text-rose-400">*</span>
                </label>
                <select
                  id={bankNameId}
                  value={formData.bankName}
                  onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                >
                  {BANKS.map((b) => (
                    <option key={b} value={b} className="bg-slate-900 text-white">
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nomor Rekening */}
              <div className="space-y-1.5">
                <label htmlFor={bankAccountNumId} className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Nomor Rekening Bank <span className="text-rose-400">*</span>
                </label>
                <input
                  id={bankAccountNumId}
                  type="text"
                  required
                  value={formData.bankAccountNumber}
                  onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value.replace(/\D/g, '') })}
                  placeholder="Contoh: 8820129384"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              {/* Atas Nama Rekening */}
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor={bankAccountHolderId} className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Nama Pemilik Rekening (Sesuai Buku Tabungan) <span className="text-rose-400">*</span>
                </label>
                <input
                  id={bankAccountHolderId}
                  type="text"
                  required
                  value={formData.bankAccountHolder}
                  onChange={(e) => setFormData({ ...formData, bankAccountHolder: e.target.value.toUpperCase() })}
                  placeholder="Contoh: SITI RAHMAWATI"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition uppercase"
                />
              </div>
            </div>

            {/* WhatsApp Integration Preview & Benefits */}
            <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/25 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                <BadgeCheck className="w-4 h-4" />
                <span>Paket Fitur Pilot Otomatis Aktif</span>
              </div>
              <ul className="text-xs text-slate-300 space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>AI Customer Service 24/7</strong>: Menjawab stok, bahan, dan cara order secara instan.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>QRIS Otomatis Terbit</strong>: Invoice & QRIS siap discan langsung di chat WhatsApp.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Dashboard CS Real-Time</strong>: Pantau seluruh chat pelanggan di dashboard omnichannel.</span>
                </li>
              </ul>
            </div>

            {/* Consent Checkboxes */}
            <div className="space-y-3 pt-2">
              <label htmlFor={agreeAiId} className="flex items-start gap-3 cursor-pointer">
                <input
                  id={agreeAiId}
                  type="checkbox"
                  checked={formData.agreeAiAutoReply}
                  onChange={(e) => setFormData({ ...formData, agreeAiAutoReply: e.target.checked })}
                  className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs text-slate-300 leading-relaxed">
                  Saya menyetujui aktivasi auto-reply AI Bot pada nomor WhatsApp toko dengan data produk yang telah saya isi.
                </span>
              </label>

              <label htmlFor={agreeQrisId} className="flex items-start gap-3 cursor-pointer">
                <input
                  id={agreeQrisId}
                  type="checkbox"
                  checked={formData.agreeQrisSettlement}
                  onChange={(e) => setFormData({ ...formData, agreeQrisSettlement: e.target.checked })}
                  className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs text-slate-300 leading-relaxed">
                  Saya menyatakan rekening bank di atas adalah valid untuk penyaluran dana transaksi settlement QRIS toko saya.
                </span>
              </label>
            </div>

            {/* Step 3 Actions */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleBack}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Kembali</span>
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-extrabold shadow-xl shadow-emerald-900/40 transition flex items-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Mendaftarkan Toko...</span>
                  </>
                ) : (
                  <>
                    <span>Kirim & Hubungkan WhatsApp Toko</span>
                    <Send className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ========================================================================= */}
        {/* STEP 4: Submission Success Screen                                         */}
        {/* ========================================================================= */}
        {step === 4 && onboardedResult && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-12 shadow-2xl space-y-8 text-center animate-in zoom-in-95">
            {/* Success Icon */}
            <div className="w-20 h-20 rounded-3xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mx-auto flex items-center justify-center shadow-2xl shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                Pendaftaran Sukses &bull; Siap Aktivasi
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Selamat! Toko Anda Berhasil Didaftarkan 🎉
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto">
                Langkah terakhir: Hubungkan nomor WhatsApp toko Anda dengan BoonTrack AI Gateway untuk mulai melayani pelanggan secara otomatis.
              </p>
            </div>

            {/* Summary Card */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 text-left max-w-md mx-auto space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Nama Toko:</span>
                <span className="font-bold text-white">{onboardedResult.storeName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Domain URL Toko:</span>
                <span className="font-mono text-blue-400">boontrack.com/{onboardedResult.slug}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">WhatsApp Terdaftar:</span>
                <span className="font-mono text-emerald-400">+{onboardedResult.waNumber}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">BoonTrack Bot Gateway:</span>
                <span className="font-mono text-slate-300">+{onboardedResult.botNumber}</span>
              </div>
            </div>

            {/* Primary Action Button -> Redirects to https://wa.me/{bot_number}?text=... */}
            <div className="space-y-3 max-w-md mx-auto">
              <a
                href={onboardedResult.redirectWaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 hover:from-emerald-500 hover:to-cyan-400 text-white font-extrabold text-sm shadow-2xl shadow-emerald-500/30 flex items-center justify-center gap-3 transition transform hover:scale-[1.02]"
              >
                <MessageSquare className="w-5 h-5 fill-white" />
                <span>Buka WhatsApp & Aktivasi Bot AI Sekarang</span>
                <ExternalLink className="w-4 h-4" />
              </a>

              <p className="text-[11px] text-slate-400">
                Tombol di atas akan membuka aplikasi WhatsApp Anda dengan template pesan aktivasi otomatis.
              </p>
            </div>

            {/* Secondary Actions */}
            <div className="pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleCopyStoreLink}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Link Toko Disalin!' : 'Salin Link Toko'}</span>
              </button>

              <Link
                href={`/${onboardedResult.slug}`}
                className="px-4 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold transition flex items-center gap-1.5"
              >
                <span>Lihat Webchat Demo Toko</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-4 px-6 text-center text-xs text-slate-500 bg-slate-950">
        &copy; {new Date().getFullYear()} BoonTrack Omnichannel &bull; Pilot Merchant Self-Onboarding
      </footer>
    </div>
  );
}

export default function PilotOnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span>Memuat Wizard Onboarding Toko...</span>
          </div>
        </div>
      }
    >
      <PilotOnboardingWizard />
    </Suspense>
  );
}
