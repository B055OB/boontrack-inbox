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
  ShoppingBag,
  CreditCard,
  Copy,
  Check,
  MessageSquare,
  GraduationCap,
  Link2,
} from 'lucide-react';

interface FormData {
  // Step 1: Toko & Kontak
  storeName: string;
  slug: string;
  waNumber: string;
  category: string;
  referralCode: string;

  // Step 2: Produk & AI
  productType: 'digital' | 'physical';
  productName: string;
  productPrice: string;
  promoBundle: string;
  variants: string;
  downloadUrl: string;
  aiTone: string;

  // Step 3: Rekening & WhatsApp
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  agreeAiAutoReply: boolean;
  agreeQrisSettlement: boolean;
}

const CATEGORIES = [
  {
    id: 'digital',
    label: 'Produk Digital & Edukasi',
    sub: 'E-Book, Course, Template, Webinar',
    icon: GraduationCap,
  },
  {
    id: 'fashion',
    label: 'Fashion & Modest Wear',
    sub: 'Pakaian, Hijab, Apparel',
    icon: ShoppingBag,
  },
  {
    id: 'beauty',
    label: 'Kecantikan & Herbal',
    sub: 'Skincare, Kosmetik, Suplemen',
    icon: Sparkles,
  },
  {
    id: 'fnb',
    label: 'F&B & Kuliner',
    sub: 'Makanan, Minuman, Frozen Food',
    icon: Store,
  },
  {
    id: 'services',
    label: 'Jasa & Konsultasi',
    sub: 'Layanan, Booking, Jasa',
    icon: Building2,
  },
];

const AI_TONES = [
  {
    id: 'edukatif',
    name: 'Edukatif & Expert',
    desc: 'Menjelaskan materi silabus, manfaat e-book/course, dan panduan download secara jelas.',
    sample: 'Halo! Selamat datang di program pembelajaran kami 📚 Ada silabus materi atau preview e-book yang ingin Anda pelajari sebelum memulai?',
  },
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
    category: 'digital',
    referralCode: rawRef || '',
    productType: 'digital',
    productName: '',
    productPrice: '',
    promoBundle: '',
    variants: '',
    downloadUrl: '',
    aiTone: 'edukatif',
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

  const handleCategorySelect = (catId: string) => {
    setFormData((prev) => {
      const isDig = catId === 'digital';
      return {
        ...prev,
        category: catId,
        productType: isDig ? 'digital' : 'physical',
        aiTone: isDig ? 'edukatif' : prev.aiTone === 'edukatif' ? 'casual_modest' : prev.aiTone,
      };
    });
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
        template: 'COMMERCE_TEMPLATE',
        onboardingMode: 'SELF_SERVICE',
        storeName: formData.storeName.trim(),
        slug: formData.slug.trim() || generateSlugFromName(formData.storeName),
        waNumber: formData.waNumber.trim(),
        category: formData.category,
        referralCode: formData.referralCode.trim(),
        productType: formData.productType,
        productName: formData.productName.trim(),
        productPrice: cleanPrice,
        promoBundle: formData.promoBundle.trim(),
        variants: formData.variants.trim(),
        downloadUrl: formData.downloadUrl.trim(),
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

      const metaBotNumber = process.env.NEXT_PUBLIC_META_BOT_NUMBER || '15556769563';
      const fallbackRedirectUrl = `https://wa.me/${metaBotNumber}?text=Halo%20Admin%20BoonTrack%2C%20saya%20baru%20saja%20mendaftar%20toko%20${encodeURIComponent(data.tenant.slug)}`;

      setOnboardedResult({
        slug: data.tenant.slug,
        storeName: data.tenant.storeName,
        waNumber: data.tenant.waNumber,
        botNumber: metaBotNumber,
        redirectWaUrl: data.redirectWaUrl || fallbackRedirectUrl,
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

  const isDigital = formData.productType === 'digital' || formData.category === 'digital';

  const storeNameId = useId();
  const slugId = useId();
  const waNumberId = useId();
  const categoryId = useId();
  const referralId = useId();
  const productNameId = useId();
  const productPriceId = useId();
  const promoBundleId = useId();
  const variantsId = useId();
  const downloadUrlId = useId();
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
        {/* STEP 1: Identitas Toko, WhatsApp 628, 5 Kategori Fokus & Referral         */}
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
                    placeholder="Contoh: Akademi Creator Pro / Butik Nyka Hijab"
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
                  Nomor WhatsApp CS/Owner yang akan menerima notifikasi order dan pesan dari pelanggan.
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

              {/* 5 Kategori Industri Fokus */}
              <div className="space-y-2 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label htmlFor={categoryId} className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Kategori Industri Bisnis <span className="text-rose-400">*</span>
                  </label>
                  <span className="text-[10px] text-slate-500">5 Kategori Unggulan</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = formData.category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleCategorySelect(cat.id)}
                        className={`p-3.5 rounded-2xl border text-left transition flex items-start gap-3 ${
                          isSelected
                            ? 'bg-blue-600/15 border-blue-500 text-blue-300 ring-1 ring-blue-500/50 shadow-md shadow-blue-950'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-900 text-slate-500'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                            {cat.label}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">{cat.sub}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Enterprise Routing Note in Step 1 */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-slate-400 text-center sm:text-left">
                Butuh integrasi hardware, IoT, sistem pemerintahan, atau integrasi khusus?
              </span>
              <Link
                href="/enterprise"
                className="text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 transition shrink-0"
              >
                <span>Hubungi BoonTrack Enterprise</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
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
        {/* STEP 2: Input 1 Produk Sampel, Opsi Digital/Fisik & Tone of Voice AI      */}
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

            {/* Toggle Tipe Produk: Digital vs Fisik */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/30">
                  {isDigital ? <GraduationCap className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-xs font-bold text-white">
                    Tipe Produk: {isDigital ? 'Produk Digital & Edukasi' : 'Produk Fisik / Barang'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {isDigital
                      ? 'Format file download, akses web/member area, e-book, video materi, atau webinar.'
                      : 'Barang fisik yang dikirimkan melalui jasa kurir ekspedisi.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      productType: 'digital',
                      aiTone: formData.aiTone === 'casual_modest' ? 'edukatif' : formData.aiTone,
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    formData.productType === 'digital'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>Digital</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      productType: 'physical',
                      aiTone: formData.aiTone === 'edukatif' ? 'casual_modest' : formData.aiTone,
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    formData.productType === 'physical'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Fisik</span>
                </button>
              </div>
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
                    placeholder={
                      isDigital
                        ? 'Contoh: E-Book Panduan Promosi AI 2026 / Masterclass Reels Canva'
                        : 'Contoh: Pashmina Silk Plisket / Kopi Susu Creamy 500ml'
                    }
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
                    placeholder={isDigital ? '49.000' : '75.000'}
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
                  placeholder={isDigital ? 'Contoh: Bonus 50 Prompt ChatGPT / Akses Grup VIP' : 'Contoh: Beli 2 Diskon 10% / Free Ongkir'}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              {/* Varian Produk / Format Akses */}
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor={variantsId} className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  {isDigital ? 'Format File & Akses Materi' : 'Pilihan Varian (Warna / Ukuran / Rasa)'}
                </label>
                <input
                  id={variantsId}
                  type="text"
                  value={formData.variants}
                  onChange={(e) => setFormData({ ...formData, variants: e.target.value })}
                  placeholder={
                    isDigital
                      ? 'Contoh: PDF + Video HD / Canva Template Link / Akses Member Area Web'
                      : 'Contoh: Hitam, Sage Green, Mocca, Broken White (Ukuran All Size)'
                  }
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              {/* Akses Link / Download URL for Digital Products */}
              {isDigital && (
                <div className="space-y-1.5 sm:col-span-2 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <label htmlFor={downloadUrlId} className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Akses Link / Download URL (Opsional)</span>
                    </label>
                    <span className="text-[10px] text-cyan-400 font-medium">Kirim Otomatis Pasca Bayar</span>
                  </div>
                  <div className="relative">
                    <Link2 className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      id={downloadUrlId}
                      type="url"
                      value={formData.downloadUrl}
                      onChange={(e) => setFormData({ ...formData, downloadUrl: e.target.value })}
                      placeholder="https://drive.google.com/... atau https://member.tokosaya.com/..."
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Link materi atau file download ini akan otomatis dikirimkan oleh Bot WhatsApp kepada pembeli segera setelah pembayaran QRIS terverifikasi sukses.
                  </p>
                </div>
              )}

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
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-indigo-300">{tone.name}</p>
                          {tone.id === 'edukatif' && (
                            <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              Digital Ready
                            </span>
                          )}
                        </div>
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

            {/* WhatsApp Integration Preview & Meta Compliance Banner */}
            <div className="p-4 rounded-2xl bg-blue-950/20 border border-blue-500/30 space-y-3">
              <div className="flex items-center gap-2 text-blue-400 text-xs font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>WhatsApp Business Platform Resmi</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Terintegrasi melalui WhatsApp Business Platform resmi, dengan konfigurasi bisnis mengikuti kebijakan dan persyaratan Meta.
              </p>
              <ul className="text-xs text-slate-400 space-y-1.5 pt-1 border-t border-slate-800/80">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>AI Customer Service 24/7</strong>: Menjawab silabus, stok, dan panduan order secara instan.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>QRIS Otomatis Terbit</strong>: Invoice & QRIS siap discan langsung di chat WhatsApp.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Instant Link Delivery</strong>: Kirim otomatis link download file atau akses materi pasca pembayaran.</span>
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
                  Terintegrasi melalui WhatsApp Business Platform resmi, dengan konfigurasi bisnis mengikuti kebijakan dan persyaratan Meta.
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
                <span className="text-slate-400">Kategori / Tipe:</span>
                <span className="font-bold text-indigo-400 capitalize">
                  {formData.category} ({isDigital ? 'Digital' : 'Fisik'})
                </span>
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

      {/* Enterprise Routing Footnote */}
      <aside aria-label="Enterprise Solutions" className="max-w-4xl mx-auto w-full px-6 pb-6">
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-md">
          <div className="flex items-center gap-2.5 text-slate-300 text-center sm:text-left">
            <Building2 className="w-4 h-4 text-blue-400 shrink-0 hidden sm:block" />
            <span>
              Butuh integrasi hardware, IoT, sistem pemerintahan, atau integrasi khusus?
            </span>
          </div>
          <Link
            href="/enterprise"
            className="text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1.5 transition shrink-0 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-xl border border-blue-500/25"
          >
            <span>Hubungi BoonTrack Enterprise</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </aside>

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
