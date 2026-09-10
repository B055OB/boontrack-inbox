'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldCheck,
  TrendingUp,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Lock,
  Building2,
  CreditCard,
  User,
  Mail,
  Smartphone,
  Check,
  ExternalLink,
  ChevronRight,
  Layers,
  HelpCircle,
  Eye,
  EyeOff,
  Percent,
  Clock,
  Briefcase,
  Share2,
  Users,
  FileText,
  BadgeCheck,
  Send
} from 'lucide-react';
import { BANK_OPTIONS } from '@/lib/partner-service';

// Experience Options
const EXPERIENCE_OPTIONS = [
  {
    id: 'beginner',
    label: 'Beginner',
    desc: 'Pemula / Baru memulai affiliate marketing (< 6 bulan)',
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    desc: 'Sudah terbiasa closing & memiliki audiens aktif (6 bulan - 2 tahun)',
  },
  {
    id: 'advanced',
    label: 'Advanced / Top Earner',
    desc: 'Full-time affiliate, Media Buyer, atau Agency (> 2 tahun)',
  },
];

// Promotion Channel Options
const PROMO_CHANNELS = [
  { id: 'wa_telegram', label: 'Kolam WhatsApp / Telegram Channel' },
  { id: 'social_media', label: 'Social Media Creator (TikTok, IG Reels, YouTube)' },
  { id: 'paid_ads', label: 'Paid Advertising (Meta Ads, TikTok Ads, Google Ads)' },
  { id: 'offline_network', label: 'Komunitas & Jaringan Bisnis Offline' },
];

// Audience Size Options
const AUDIENCE_SIZES = [
  { id: 'under_1k', label: '< 1.000 Audiens' },
  { id: '1k_10k', label: '1.000 - 10.000 Audiens' },
  { id: '10k_50k', label: '10.000 - 50.000 Audiens' },
  { id: 'above_50k', label: '> 50.000 Audiens' },
];

function AffiliateRegisterContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Multi-step progress (1: Data Diri, 2: Rekening & AM, 3: Screening & Motivasi, 4: Selesai/Review)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form Fields - Step 1: Data Diri
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Default AM Account: Kang Sakti
  const DEFAULT_AM_CODE = process.env.NEXT_PUBLIC_DEFAULT_AM_CODE || 'KANGSAKTI';

  // Resolved AM code (default Kang Sakti, overridden by ?ref= or ?am= if present)
  const [resolvedAmCode, setResolvedAmCode] = useState<string>(DEFAULT_AM_CODE);
  const [bankName, setBankName] = useState(BANK_OPTIONS[0].id);
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');

  // Form Fields - Step 3: Screening & Kualifikasi
  const [experienceLevel, setExperienceLevel] = useState('intermediate');
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['social_media']);
  const [audienceSize, setAudienceSize] = useState('1k_10k');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [promotionPlan, setPromotionPlan] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(false);

  // Status & Feedback
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Resolve AM Code: use query param ?ref= or ?am= if provided, otherwise fallback to Kang Sakti
  useEffect(() => {
    const refCode = searchParams.get('ref') || searchParams.get('am') || '';
    if (refCode.trim()) {
      setResolvedAmCode(refCode.trim().toUpperCase());
    } else {
      setResolvedAmCode(DEFAULT_AM_CODE);
    }
  }, [searchParams, DEFAULT_AM_CODE]);

  // Clean phone number helper
  const cleanPhone = (val: string) => {
    let clean = val.replace(/\D/g, '');
    if (clean.startsWith('62')) clean = '0' + clean.slice(2);
    else if (clean.startsWith('8')) clean = '0' + clean;
    return clean;
  };

  // Toggle promotion channel selection
  const handleToggleChannel = (id: string) => {
    setSelectedChannels((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  // Validate Step 1
  const validateStep1 = () => {
    if (!fullName.trim() || fullName.trim().length < 3) {
      setErrorMessage('Silakan isi nama lengkap sesuai identitas resmi (minimal 3 karakter).');
      return false;
    }
    const cleaned = cleanPhone(phone);
    if (!cleaned || cleaned.length < 10) {
      setErrorMessage('Nomor WhatsApp tidak valid (minimal 10 digit).');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      setErrorMessage('Silakan masukkan alamat email yang valid.');
      return false;
    }
    if (!password || password.length < 6) {
      setErrorMessage('Kata sandi minimal 6 karakter.');
      return false;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Konfirmasi kata sandi tidak cocok.');
      return false;
    }
    setErrorMessage(null);
    return true;
  };

  // Validate Step 2
  const validateStep2 = () => {
    if (!bankName) {
      setErrorMessage('Pilih bank atau e-wallet pencairan komisi.');
      return false;
    }
    if (!bankAccountNumber.trim() || bankAccountNumber.trim().length < 5) {
      setErrorMessage('Nomor rekening / e-wallet tidak valid (minimal 5 digit).');
      return false;
    }
    if (!bankAccountHolder.trim() || bankAccountHolder.trim().length < 3) {
      setErrorMessage('Nama pemilik rekening wajib diisi sesuai buku tabungan / akun e-wallet.');
      return false;
    }
    setErrorMessage(null);
    return true;
  };

  // Validate Step 3
  const validateStep3 = () => {
    if (selectedChannels.length === 0) {
      setErrorMessage('Pilih minimal 1 kanal promosi utama Anda.');
      return false;
    }
    if (!promotionPlan.trim() || promotionPlan.trim().length < 20) {
      setErrorMessage('Jelaskan rencana atau motivasi promosi Anda secara singkat (minimal 20 karakter).');
      return false;
    }
    if (!agreedTerms) {
      setErrorMessage('Anda wajib menyetujui Syarat & Ketentuan Kemitraan Affiliate BoonTrack.');
      return false;
    }
    setErrorMessage(null);
    return true;
  };

  const handleNext = () => {
    if (currentStep === 1 && validateStep1()) {
      setCurrentStep(2);
    } else if (currentStep === 2 && validateStep2()) {
      setCurrentStep(3);
    }
  };

  const handlePrev = () => {
    setErrorMessage(null);
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep3()) return;

    setLoading(true);
    setErrorMessage(null);

    const formattedPhone = cleanPhone(phone);

    const payload = {
      name: fullName.trim(),
      full_name: fullName.trim(),
      phone: formattedPhone,
      phone_number: formattedPhone,
      email: email.trim().toLowerCase(),
      password: password,
      am_referral_code: resolvedAmCode,
      referral_code: resolvedAmCode,
      am_pembina: resolvedAmCode,
      bank_name: bankName,
      bank_account_number: bankAccountNumber.trim(),
      bank_account_holder: bankAccountHolder.trim().toUpperCase(),
      experience_level: experienceLevel,
      promotion_channels: selectedChannels,
      promotion_channel: selectedChannels.join(', '),
      audience_size: audienceSize,
      portfolio_url: portfolioUrl.trim() || null,
      promotion_plan: promotionPlan.trim(),
      agreed_to_terms: true,
    };

    try {
      const coreBase =
        process.env.NEXT_PUBLIC_CORE_API_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        'https://boontrack-core-production.up.railway.app';

      // Submit direct to backend core endpoint
      const res = await fetch(`${coreBase.replace(/\/$/, '')}/api/v1/auth/affiliate/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorDetail =
          data?.detail ||
          data?.message ||
          'Terjadi kendala saat memproses pendaftaran. Silakan cek data Anda kembali.';
        throw new Error(errorDetail);
      }

      // Success
      setIsSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghubungi server pendaftaran.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Background Ambience Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-emerald-600/10 rounded-full blur-[140px]" />
        <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[140px]" />
        <div className="absolute -bottom-20 left-1/3 w-[450px] h-[450px] bg-indigo-600/10 rounded-full blur-[140px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto min-h-screen flex flex-col lg:grid lg:grid-cols-12">
        
        {/* =========================================================================
            LEFT COLUMN: HERO & TERMS OF PARTNERSHIP (DESKTOP: COL 5)
        ========================================================================== */}
        <div className="lg:col-span-5 p-6 sm:p-10 lg:p-12 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800/80 bg-slate-900/40 backdrop-blur-md">
          <div className="space-y-8">
            
            {/* Header Brand */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-xs font-semibold text-emerald-300">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Program Kemitraan Resmi BoonTrack Shop</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                Raih Komisi <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">25% Flat</span> di Setiap Penjualan
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                Bergabunglah dengan jaringan affiliate resmi BoonTrack. Dapatkan sistem toko otomatis 24/7, integrasi checkout instan, dan pencairan komisi langsung ke rekening Anda.
              </p>
            </div>

            {/* Key Advantages Cards */}
            <div className="grid gap-3.5">
              <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <Percent className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Komisi 25% Flat & Transparan</h2>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    Setiap transaksi pelanggan via tautan referral Anda menghasilkan komisi bersih tanpa potongan tersembunyi.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-teal-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Sistem Toko Otomatis 24/7</h2>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    Toko online, katalog produk, kalkulasi ongkir, dan konfirmasi WhatsApp pelanggan ditangani otomatis oleh sistem.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Payout Langsung ke Rekening</h2>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    Dukungan transfer pencairan ke rekening seluruh bank nasional (BCA, Mandiri, BRI, BNI, Seabank, Jago) & E-Wallet.
                  </p>
                </div>
              </div>
            </div>

            {/* Terms of Partnership Summary */}
            <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Ringkasan Ketentuan Kemitraan (T&C)</span>
              </div>
              <ul className="text-xs text-slate-400 space-y-2 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-1.5" />
                  <span><strong>Kurasi & Review AM:</strong> Setiap pendaftaran akan dikurasi langsung oleh Account Manager (AM) maksimal 1x24 jam kerja untuk menjaga integritas ekosistem.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-1.5" />
                  <span><strong>Etika Anti-Spam & Zero Fraud:</strong> Dilarang melakukan spam chat, click-fraud, misleading claim, atau order fiktif. Pelanggaran berakibat pemblokiran permanen.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-1.5" />
                  <span><strong>Validitas Rekening:</strong> Nama pemilik rekening wajib identik dengan identitas akun untuk kelancaran rekonsiliasi transfer pencairan dana.</span>
                </li>
              </ul>
            </div>

          </div>

          {/* Left Footer: Login Link */}
          <div className="pt-6 border-t border-slate-800/80 mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <span>Sudah memiliki akun kemitraan aktif?</span>
            <Link
              href="/affiliate/login"
              className="font-bold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1.5 transition underline underline-offset-4"
            >
              <span>Masuk ke Portal Affiliate</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* =========================================================================
            RIGHT COLUMN: MULTI-STEP APPLICATION FORM (DESKTOP: COL 7)
        ========================================================================== */}
        <div className="lg:col-span-7 p-6 sm:p-10 lg:p-12 flex flex-col justify-center">
          <div className="w-full max-w-2xl mx-auto space-y-8">
            
            {/* SUCCESS STATE */}
            {isSuccess ? (
              <div className="bg-slate-900/90 border border-emerald-500/30 rounded-3xl p-8 sm:p-10 backdrop-blur-xl shadow-2xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/10 border-2 border-emerald-400 flex items-center justify-center text-emerald-400">
                  <BadgeCheck className="w-10 h-10" />
                </div>

                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold">
                    <Clock className="w-3.5 h-3.5 animate-pulse" />
                    <span>STATUS: PENDING_REVIEW</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                    Pendaftaran Kemitraan Berhasil Dikirim!
                  </h2>
                  <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
                    Terima kasih telah mendaftar sebagai mitra affiliate BoonTrack Shop. Data aplikasi Anda telah masuk ke antrean kurasi.
                  </p>
                </div>

                {/* Info Card Summary */}
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 text-left text-xs space-y-2.5">
                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Nama Mitra:</span>
                    <span className="font-bold text-white">{fullName}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">WhatsApp Terdaftar:</span>
                    <span className="font-mono font-semibold text-emerald-400">{cleanPhone(phone)}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Rekening Payout:</span>
                    <span className="font-semibold text-white">{bankName} - {bankAccountNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Account Manager Pembina (AM):</span>
                    <span className="font-bold text-teal-300 font-mono">
                      {resolvedAmCode === DEFAULT_AM_CODE ? 'Kang Sakti (AM Utama)' : resolvedAmCode}
                    </span>
                  </div>
                </div>

                {/* Next Steps Timeline */}
                <div className="space-y-3 text-left">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Tahapan Selanjutnya:
                  </h3>
                  <div className="space-y-2.5 text-xs text-slate-300">
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-[11px]">1</div>
                      <span>Review kurasi profil & rencana promosi oleh tim AM (Maksimal 1x24 jam kerja).</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-[11px]">2</div>
                      <span>Notifikasi persetujuan akun & link aktivasi akan dikirimkan langsung ke WhatsApp Anda.</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-[11px]">3</div>
                      <span>Setelah disetujui, login ke portal affiliate untuk mengambil tautan referral dan materi banner.</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-4 flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/affiliate/login"
                    className="flex-1 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <span>Masuk ke Halaman Login</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <a
                    href="https://wa.me/6281234567890?text=Halo%20Admin%20BoonTrack,%20saya%20sudah%20mendaftar%20affiliate%20dengan%20nama%20"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 transition"
                  >
                    <span>Hubungi Support AM</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ) : (
              /* FORM STEPS */
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 lg:p-10 shadow-2xl backdrop-blur-xl space-y-7">
                
                {/* Stepper Header */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                        Formulir Kemitraan Affiliate
                      </h2>
                      <p className="text-xs text-slate-400 mt-1">
                        Tahap {currentStep} dari 3: {
                          currentStep === 1
                            ? 'Informasi Data Diri'
                            : currentStep === 2
                            ? 'Rekening Pencairan Komisi'
                            : 'Kualifikasi & Rencana Promosi'
                        }
                      </p>
                    </div>

                    {/* Step Badges */}
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3].map((stepNum) => (
                        <div
                          key={stepNum}
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                            currentStep === stepNum
                              ? 'bg-emerald-500 text-slate-950 ring-4 ring-emerald-500/20'
                              : currentStep > stepNum
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                              : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          {currentStep > stepNum ? <Check className="w-3.5 h-3.5" /> : stepNum}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Progress Line */}
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-300"
                      style={{ width: `${(currentStep / 3) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Error Banner */}
                {errorMessage && (
                  <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold flex items-start gap-2.5 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="flex-1">{errorMessage}</div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  
                  {/* ─────────────────────────────────────────────────────────────
                      STEP 1: DATA DIRI
                  ───────────────────────────────────────────────────────────── */}
                  {currentStep === 1 && (
                    <div className="space-y-4 animate-in fade-in duration-200">
                      
                      {/* Full Name */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                          <span>Nama Lengkap (Sesuai KTP)</span>
                          <span className="text-[10px] text-emerald-400 font-normal">Wajib</span>
                        </label>
                        <div className="relative">
                          <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="Contoh: Budi Prasetyo"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                            required
                          />
                        </div>
                      </div>

                      {/* WhatsApp Phone */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                          <span>Nomor WhatsApp Aktif</span>
                          <span className="text-[10px] text-slate-400 font-normal">Untuk verifikasi & OTP</span>
                        </label>
                        <div className="relative">
                          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs font-bold text-slate-400 border-r border-slate-800 pr-2.5">
                            <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                            <span>+62</span>
                          </div>
                          <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="81234567890"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-20 pr-4 py-3 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                            required
                          />
                        </div>
                      </div>

                      {/* Email Address */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                          <span>Alamat Email</span>
                          <span className="text-[10px] text-slate-400 font-normal">Notifikasi status kurasi</span>
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="budi@example.com"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                            required
                          />
                        </div>
                      </div>

                      {/* Password & Confirm Password */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-300 block">
                            Kata Sandi
                          </label>
                          <div className="relative">
                            <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                              type={showPassword ? 'text' : 'password'}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="Minimal 6 karakter"
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-300 block">
                            Konfirmasi Sandi
                          </label>
                          <div className="relative">
                            <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                              type={showPassword ? 'text' : 'password'}
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="Ulangi kata sandi"
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                              required
                            />
                          </div>
                        </div>
                      </div>

                    </div>
                  )}

                  {/* ─────────────────────────────────────────────────────────────
                      STEP 2: REKENING PENCAIRAN KOMISI
                  ───────────────────────────────────────────────────────────── */}
                  {currentStep === 2 && (
                    <div className="space-y-5 animate-in fade-in duration-200">
                      
                      {/* Rekening Info Notice */}
                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-start gap-3">
                        <CreditCard className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                        <div className="space-y-1 text-xs">
                          <p className="font-bold text-slate-200">
                            Pencairan Komisi Penjualan Otomatis
                          </p>
                          <p className="text-slate-400 leading-relaxed text-[11px]">
                            Masukkan data rekening bank atau akun e-wallet yang aktif. Dana komisi affiliate 25% akan ditransfer ke rekening ini saat Anda melakukan penarikan.
                          </p>
                        </div>
                      </div>

                      {/* Bank Options Dropdown */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 block">
                          Bank / E-Wallet Pencairan Komisi
                        </label>
                        <div className="relative">
                          <Building2 className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <select
                            value={bankName}
                            onChange={(e) => setBankName(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-8 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition appearance-none cursor-pointer"
                          >
                            {BANK_OPTIONS.map((b) => (
                              <option key={b.id} value={b.id} className="bg-slate-900 text-white">
                                {b.label}
                              </option>
                            ))}
                          </select>
                          <ChevronRight className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" />
                        </div>
                      </div>

                      {/* Bank Account Number */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 block">
                          Nomor Rekening / No. HP E-Wallet
                        </label>
                        <div className="relative">
                          <CreditCard className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={bankAccountNumber}
                            onChange={(e) => setBankAccountNumber(e.target.value.replace(/\s+/g, ''))}
                            placeholder="Contoh: 1234567890"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                            required
                          />
                        </div>
                      </div>

                      {/* Bank Account Holder */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                          <span>Nama Pemilik Rekening</span>
                          <span className="text-[10px] text-amber-400 font-normal">Wajib Sesuai Tabungan</span>
                        </label>
                        <div className="relative">
                          <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={bankAccountHolder}
                            onChange={(e) => setBankAccountHolder(e.target.value.toUpperCase())}
                            placeholder="Contoh: BUDI PRASETYO"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white uppercase placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                            required
                          />
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Pastikan nama rekening sama dengan nama pendaftar guna mencegah penolakan transfer payout otomatis.
                        </p>
                      </div>

                    </div>
                  )}

                  {/* ─────────────────────────────────────────────────────────────
                      STEP 3: SCREENING & KUALIFIKASI PROMOSI
                  ───────────────────────────────────────────────────────────── */}
                  {currentStep === 3 && (
                    <div className="space-y-5 animate-in fade-in duration-200">
                      
                      {/* Experience Radio Cards */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-300 block">
                          Tingkat Pengalaman Affiliate Marketing
                        </label>
                        <div className="grid gap-2">
                          {EXPERIENCE_OPTIONS.map((exp) => (
                            <label
                              key={exp.id}
                              onClick={() => setExperienceLevel(exp.id)}
                              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                                experienceLevel === exp.id
                                  ? 'bg-emerald-950/40 border-emerald-500/50 text-white'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                              }`}
                            >
                              <input
                                type="radio"
                                name="experience"
                                value={exp.id}
                                checked={experienceLevel === exp.id}
                                onChange={() => setExperienceLevel(exp.id)}
                                className="mt-1 accent-emerald-500"
                              />
                              <div>
                                <div className="text-xs font-bold text-slate-200">{exp.label}</div>
                                <div className="text-[11px] text-slate-400">{exp.desc}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Promo Channels (Multi-select) */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                          <span>Kanal Promosi Utama (Bisa pilih lebih dari satu)</span>
                          <span className="text-[10px] text-emerald-400 font-normal">Pilih minimal 1</span>
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {PROMO_CHANNELS.map((ch) => {
                            const active = selectedChannels.includes(ch.id);
                            return (
                              <button
                                type="button"
                                key={ch.id}
                                onClick={() => handleToggleChannel(ch.id)}
                                className={`text-left p-3 rounded-xl border text-xs font-semibold flex items-center gap-2.5 transition ${
                                  active
                                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                                }`}
                              >
                                <div
                                  className={`w-4 h-4 rounded flex items-center justify-center text-[10px] ${
                                    active ? 'bg-emerald-500 text-slate-950' : 'border border-slate-700'
                                  }`}
                                >
                                  {active && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                                <span className="flex-1">{ch.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Audience Size */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 block">
                          Estimasi Database / Jangkauan Audiens
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {AUDIENCE_SIZES.map((aud) => (
                            <button
                              type="button"
                              key={aud.id}
                              onClick={() => setAudienceSize(aud.id)}
                              className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition ${
                                audienceSize === aud.id
                                  ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                              }`}
                            >
                              {aud.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Portfolio / Link Profil (Optional) */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                          <span>Link Portofolio / Profil Medsos (Opsional)</span>
                          <span className="text-[10px] text-slate-500 font-normal">TikTok, Instagram, Channel TG</span>
                        </label>
                        <input
                          type="url"
                          value={portfolioUrl}
                          onChange={(e) => setPortfolioUrl(e.target.value)}
                          placeholder="https://tiktok.com/@akunanda atau https://t.me/channelanda"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                        />
                      </div>

                      {/* Promotion Plan & Motivation Textarea */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                          <span>Rencana & Strategi Promosi Anda</span>
                          <span className="text-[10px] text-emerald-400 font-normal">Min. 20 karakter</span>
                        </label>
                        <textarea
                          rows={3}
                          value={promotionPlan}
                          onChange={(e) => setPromotionPlan(e.target.value)}
                          placeholder="Jelaskan secara singkat bagaimana rencana Anda mempromosikan produk BoonTrack (misal: sharing review di grup WA, live TikTok rutin, atau iklan FB Ads)..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition resize-none leading-relaxed"
                          required
                        />
                      </div>

                      {/* Agreement Checkbox */}
                      <div className="pt-2">
                        <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={agreedTerms}
                            onChange={(e) => setAgreedTerms(e.target.checked)}
                            className="mt-0.5 w-4 h-4 rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-emerald-500/40 accent-emerald-500 shrink-0"
                          />
                          <span className="text-xs text-slate-300 leading-relaxed select-none">
                            Saya menyetujui seluruh <strong>Terms of Partnership</strong> BoonTrack Shop, berkomitmen menjunjung etika promosi bebas spam/fraud, dan mengonfirmasi bahwa data rekening bank yang dicantumkan adalah sah milik saya.
                          </span>
                        </label>
                      </div>

                    </div>
                  )}

                  {/* ─────────────────────────────────────────────────────────────
                      FOOTER NAVIGATION CONTROLS
                  ───────────────────────────────────────────────────────────── */}
                  <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between gap-3">
                    {currentStep > 1 ? (
                      <button
                        type="button"
                        onClick={handlePrev}
                        disabled={loading}
                        className="py-3 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Sebelumnya</span>
                      </button>
                    ) : (
                      <div />
                    )}

                    {currentStep < 3 ? (
                      <button
                        type="button"
                        onClick={handleNext}
                        className="py-3 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-500/20 cursor-pointer"
                      >
                        <span>Lanjut ke Tahap {currentStep + 1}</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={loading || !agreedTerms}
                        className="py-3.5 px-7 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-extrabold text-xs flex items-center gap-2 transition shadow-xl shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {loading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                            <span>Memproses Pendaftaran...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            <span>Kirim Pendaftaran Kemitraan</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                </form>
              </div>
            )}

            {/* Security Guarantee Note */}
            <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
              <Lock className="w-3.5 h-3.5 text-emerald-500" />
              <span>Data dilindungi enkripsi SSL 256-bit • Bebas biaya registrasi / 100% Gratis</span>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}

export default function AffiliateRegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center p-6">
          <div className="flex items-center gap-3 text-sm">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span>Memuat formulir pendaftaran kemitraan...</span>
          </div>
        </div>
      }
    >
      <AffiliateRegisterContent />
    </Suspense>
  );
}
