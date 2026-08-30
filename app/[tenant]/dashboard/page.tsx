'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Package,
  Brain,
  CreditCard,
  CheckCircle2,
  Save,
  Plus,
  Trash2,
  Building,
  GraduationCap,
  ShieldCheck,
  Store,
  ExternalLink,
  MessageSquare,
  Lock,
  Sparkles,
  Users,
  Zap,
  ArrowRight
} from 'lucide-react';
import { KNOWN_TENANTS } from '../page';

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  status: string;
  category?: 'internal' | 'external' | string;
  description?: string;
}

export default function TenantDashboardInboxPage() {
  const params = useParams();
  const tenantSlug = Array.isArray(params?.tenant) ? params.tenant[0] : (params?.tenant as string);
  const meta = tenantSlug ? KNOWN_TENANTS[tenantSlug.toLowerCase()] : undefined;

  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);

  // Backpanel Tabs & CMS Settings State
  const [activeTab, setActiveTab] = useState<'inbox' | 'catalog' | 'ai_knowledge' | 'integration'>('inbox');
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const [productForm, setProductForm] = useState({
    name: 'Suhu Ads Masterclass 2026 - Full Lifetime Access',
    price: 99000,
    promo_price: 149000,
    variants: 'Format Digital • Video HD + Template Canva',
    promo: 'Diskon 35% Bulan Ini',
    description:
      'Pusat pelatihan Meta Ads praktis untuk media buyer & pebisnis online. Dapatkan strategi scale-up campaign, riset audience, dan optimasi konversi terbukti.',
    download_url: 'https://drive.google.com/drive/folders/suhu-ads-masterclass-2026',
    type: 'digital',
  });

  const [aiForm, setAiForm] = useState({
    ai_name: 'Suhu Ads AI Consultant',
    tone: 'casual',
    system_prompt:
      'Anda adalah asisten konsultan resmi Suhu Ads Masterclass. Berikan informasi silabus, materi video, akses Google Drive materi, dan proses pembayaran instan QRIS.',
    syllabus: [
      'Modul 1: Mindset & Riset Winning Product Meta Ads',
      'Modul 2: Struktur Campaign CBO/ABO & Budgeting Strategy',
      'Modul 3: Creative Angle & Copywriting High-Converting',
      'Modul 4: Scale-Up Campaign & Optimasi Biaya Iklan (ROAS > 4x)',
    ],
    faq: [
      {
        q: 'Apakah materi ini bisa diakses selamanya?',
        a: 'Ya, Anda mendapatkan akses seumur hidup (lifetime access) dan gratis update materi 2026.',
      },
      {
        q: 'Bagaimana cara mengakses file setelah bayar?',
        a: 'Setelah pembayaran QRIS berhasil diverifikasi, sistem otomatis memberikan tautan Google Drive resmi dan link grup diskusi.',
      },
      {
        q: 'Apakah pemula bisa mengikuti materi ini?',
        a: 'Sangat bisa! Materi disusun dari nol, langkah demi langkah dengan panduan praktis.',
      },
    ],
    promo_bundling: 'Beli 2 Kelas Digital Gratis 1 Toolkit Copywriting Siap Pakai.',
  });

  const [bankForm, setBankForm] = useState({
    name: 'BCA (Bank Central Asia)',
    account: '8820199201',
    holder: 'PT BOONTRACK MEDIA DIGITAL',
  });

  const [integrationInfo, setIntegrationInfo] = useState({
    whatsapp_status: 'CONNECTED',
    bot_number: '15556769563',
    webhook_verified: true,
  });

  useEffect(() => {
    if (!tenantSlug) return;
    let isCancelled = false;

    async function loadTenantSettings() {
      try {
        const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && data.success && data.settings) {
            const s = data.settings;
            if (s.product) setProductForm(s.product);
            if (s.ai_knowledge) setAiForm(s.ai_knowledge);
            if (s.bank) setBankForm(s.bank);
            if (s.integration) setIntegrationInfo(s.integration);
          }
        }
      } catch (err) {
        console.warn('Failed to load tenant settings:', err);
      }
    }

    loadTenantSettings();
    return () => {
      isCancelled = true;
    };
  }, [tenantSlug]);

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSaveFeedback(null);
    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productForm),
      });
      const data = await res.json();
      if (data.success) {
        setSaveFeedback('✅ Katalog produk berhasil disimpan!');
      } else {
        setSaveFeedback(`❌ Gagal: ${data.error || 'Terjadi kesalahan'}`);
      }
    } catch {
      setSaveFeedback('❌ Gagal menghubungi server.');
    } finally {
      setSavingSettings(false);
      setTimeout(() => setSaveFeedback(null), 3500);
    }
  };

  const handleSaveAiKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSaveFeedback(null);
    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_knowledge: aiForm,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveFeedback('✅ AI Knowledge & Silabus berhasil diperbarui!');
      } else {
        setSaveFeedback(`❌ Gagal: ${data.error || 'Terjadi kesalahan'}`);
      }
    } catch {
      setSaveFeedback('❌ Gagal menghubungi server.');
    } finally {
      setSavingSettings(false);
      setTimeout(() => setSaveFeedback(null), 3500);
    }
  };

  const handleSaveBankAndIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSaveFeedback(null);
    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank: bankForm,
          integration: integrationInfo,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveFeedback('✅ Rekening & Integrasi berhasil disimpan!');
      } else {
        setSaveFeedback(`❌ Gagal: ${data.error || 'Terjadi kesalahan'}`);
      }
    } catch {
      setSaveFeedback('❌ Gagal menghubungi server.');
    } finally {
      setSavingSettings(false);
      setTimeout(() => setSaveFeedback(null), 3500);
    }
  };

  const isSubdomainMode =
    tenantSlug === 'atmosfitnes' ||
    (typeof window !== 'undefined' &&
      (window.location.host.toLowerCase().includes('gym.') ||
        (tenantSlug && window.location.host.toLowerCase().startsWith(`${tenantSlug.toLowerCase()}.`))));

  const publicDemoHref = isSubdomainMode ? '/' : `/${tenantSlug}`;

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 flex flex-col antialiased">
      
      {/* 1. TOP NAVBAR */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-4">
          <Link
            href={publicDemoHref}
            target="_blank"
            className="text-xs font-bold text-slate-700 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 px-3.5 py-2 rounded-xl border border-slate-200 transition inline-flex items-center gap-1.5 shadow-xs"
            title="Buka Halaman Publik & Webchat Demo"
          >
            <Store className="w-3.5 h-3.5 text-slate-500" />
            <span>Lihat Etalase Toko</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </Link>

          <div className="h-5 w-[1px] bg-slate-200 hidden sm:block"></div>

          <div className="flex items-center gap-2">
            <h1 className="text-sm font-black text-slate-900 uppercase tracking-tight">
              {tenantInfo?.name || meta?.name || tenantSlug}
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
              Merchant Panel
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Storefront Active</span>
          </span>
        </div>
      </header>

      {/* 2. SUB-NAVIGATION MENU TABS */}
      <div className="bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-3 sticky top-[57px] z-20 shadow-xs">
        <div className="flex items-center gap-4 overflow-x-auto text-xs font-bold">
          <button
            onClick={() => setActiveTab('inbox')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'inbox'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Live CS & Omnichannel Inbox</span>
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded text-[10px] font-extrabold flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" /> PRO
            </span>
          </button>

          <button
            onClick={() => setActiveTab('catalog')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'catalog'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Katalog Produk</span>
          </button>

          <button
            onClick={() => setActiveTab('ai_knowledge')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'ai_knowledge'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Brain className="w-4 h-4" />
            <span>AI Knowledge & Bot</span>
          </button>

          <button
            onClick={() => setActiveTab('integration')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'integration'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Rekening & QRIS</span>
          </button>
        </div>

        {saveFeedback && (
          <div className="text-xs font-semibold px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 animate-in fade-in">
            {saveFeedback}
          </div>
        )}
      </div>

      {/* TAB 1: Live CS & Chatwoot Upsell Paywall */}
      {activeTab === 'inbox' && (
        <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
          <div className="max-w-2xl w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 shadow-xl shadow-slate-200/50 text-center relative overflow-hidden">
            
            <div className="w-16 h-16 bg-blue-50 border border-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm">
              <Lock className="w-8 h-8 text-blue-600" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-full text-xs font-bold mb-4">
              <Sparkles className="w-3.5 h-3.5" /> Modul Tambahan CS Multi-Agent
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-3">
              Omnichannel Inbox & Live Chat CS
            </h2>

            <p className="text-slate-500 text-sm leading-relaxed max-w-lg mx-auto mb-8">
              Toko Anda saat ini menggunakan <strong>Engine Transaksi QRIS Otomatis</strong>. Untuk membalas pesan secara manual bersama tim customer service di satu nomor WhatsApp terpusat, silakan aktifkan lisensi add-on <strong>Chatwoot Enterprise Sync</strong>.
            </p>

            {/* Feature Comparison List */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 text-left">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <Users className="w-5 h-5 text-blue-600 mb-2" />
                <h4 className="text-xs font-bold text-slate-900 mb-1">Multi-Agent CS</h4>
                <p className="text-[11px] text-slate-500">Hingga 10 CS login bersamaan tanpa bentrok.</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <Zap className="w-5 h-5 text-emerald-600 mb-2" />
                <h4 className="text-xs font-bold text-slate-900 mb-1">WhatsApp & Webchat</h4>
                <p className="text-[11px] text-slate-500">Inbox gabungan dari chat web, IG, & WhatsApp resmi.</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <ShieldCheck className="w-5 h-5 text-indigo-600 mb-2" />
                <h4 className="text-xs font-bold text-slate-900 mb-1">Intervensi Bot Otomatis</h4>
                <p className="text-[11px] text-slate-500">CS bisa ambil alih obrolan bot kapan saja.</p>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="https://wa.me/6281234567890?text=Halo%20Admin%20BoonTrack,%20saya%20mau%20aktivasi%20fitur%20Omnichannel%20Live%20CS%20Chatwoot%20untuk%20toko%20saya"
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all active:scale-95"
              >
                <span>Aktivasi Fitur Live Chat CS</span>
                <ArrowRight className="w-4 h-4" />
              </a>
              <button
                onClick={() => setActiveTab('catalog')}
                className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-5 py-3.5 rounded-xl text-xs transition-all"
              >
                Kelola Katalog Dulu
              </button>
            </div>

          </div>
        </div>
      )}

      {/* TAB 2: Katalog Produk CRUD */}
      {activeTab === 'catalog' && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                <span>Katalog Produk & Akses Layanan</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Atur nama produk, harga normal, harga promo, deskripsi penawaran, dan link akses digital.
              </p>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200">
              CRUD Active
            </span>
          </div>

          <form onSubmit={handleSaveProduct} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Form */}
            <div className="space-y-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Nama Produk / Layanan *
                </label>
                <input
                  type="text"
                  required
                  value={productForm.name}
                  onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Contoh: Suhu Ads Masterclass 2026"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Harga Normal (Rp) *
                  </label>
                  <input
                    type="number"
                    required
                    value={productForm.price}
                    onChange={(e) => setProductForm((p) => ({ ...p, price: Number(e.target.value) }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Harga Promo (Rp)
                  </label>
                  <input
                    type="number"
                    value={productForm.promo_price || ''}
                    onChange={(e) => setProductForm((p) => ({ ...p, promo_price: Number(e.target.value) }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Varian / Format Akses
                </label>
                <input
                  type="text"
                  value={productForm.variants}
                  onChange={(e) => setProductForm((p) => ({ ...p, variants: e.target.value }))}
                  placeholder="Contoh: Format Digital • Video HD + Template Canva"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Label Promo Singkat
                </label>
                <input
                  type="text"
                  value={productForm.promo}
                  onChange={(e) => setProductForm((p) => ({ ...p, promo: e.target.value }))}
                  placeholder="Contoh: Diskon 35% Bulan Ini"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Right Form */}
            <div className="space-y-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Download URL / Link Akses Drive (Digital Delivery) *
                  </label>
                  <input
                    type="url"
                    value={productForm.download_url}
                    onChange={(e) => setProductForm((p) => ({ ...p, download_url: e.target.value }))}
                    placeholder="https://drive.google.com/..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-blue-600 font-mono focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Link ini otomatis diberikan ke pembeli saat pembayaran QRIS sukses diverifikasi.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Deskripsi Detail Produk
                  </label>
                  <textarea
                    rows={5}
                    value={productForm.description}
                    onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Jelaskan kurikulum materi, benefit, dan keunggulan produk Anda..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white leading-relaxed transition-all"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingSettings ? 'Menyimpan...' : 'Simpan Perubahan Produk'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: AI Knowledge & Persona */}
      {activeTab === 'ai_knowledge' && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Brain className="w-5 h-5 text-blue-600" />
                <span>AI Knowledge, Silabus & Persona</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Atur silabus modul materi, daftar FAQ otomatis, dan instruksi asisten AI toko.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveAiKnowledge} className="space-y-6">
            {/* Persona */}
            <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Gaya Bahasa & Identitas AI
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Nama Asisten AI
                  </label>
                  <input
                    type="text"
                    value={aiForm.ai_name}
                    onChange={(e) => setAiForm((a) => ({ ...a, ai_name: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Tone of Voice
                  </label>
                  <select
                    value={aiForm.tone}
                    onChange={(e) => setAiForm((a) => ({ ...a, tone: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                  >
                    <option value="casual">Santai & Ramah (Casual)</option>
                    <option value="formal">Profesional & Terstruktur (Formal)</option>
                    <option value="energetic">Antusias & Energik (Energetic)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Instruksi Khusus (System Prompt)
                </label>
                <textarea
                  rows={2}
                  value={aiForm.system_prompt}
                  onChange={(e) => setAiForm((a) => ({ ...a, system_prompt: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Silabus */}
            <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-emerald-600" />
                  <span>Silabus Materi Kursus / Modul Produk</span>
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    setAiForm((a) => ({
                      ...a,
                      syllabus: [...a.syllabus, `Modul ${a.syllabus.length + 1}: Materi Tambahan Baru`],
                    }))
                  }
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Modul</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {aiForm.syllabus.map((mod, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={mod}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAiForm((a) => {
                          const updated = [...a.syllabus];
                          updated[idx] = val;
                          return { ...a, syllabus: updated };
                        });
                      }}
                      className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setAiForm((a) => ({
                          ...a,
                          syllabus: a.syllabus.filter((_, i) => i !== idx),
                        }))
                      }
                      className="p-2 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* FAQ Rules */}
            <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  FAQ Rules (Tanya Jawab Otomatis)
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    setAiForm((a) => ({
                      ...a,
                      faq: [...a.faq, { q: 'Pertanyaan baru?', a: 'Jawaban penjelasan AI.' }],
                    }))
                  }
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah FAQ</span>
                </button>
              </div>

              <div className="space-y-3">
                {aiForm.faq.map((item, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        placeholder="Pertanyaan..."
                        value={item.q}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAiForm((a) => {
                            const updated = [...a.faq];
                            updated[idx] = { ...updated[idx], q: val };
                            return { ...a, faq: updated };
                          });
                        }}
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setAiForm((a) => ({
                            ...a,
                            faq: a.faq.filter((_, i) => i !== idx),
                          }))
                        }
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Jawaban resmi AI..."
                      value={item.a}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAiForm((a) => {
                          const updated = [...a.faq];
                          updated[idx] = { ...updated[idx], a: val };
                          return { ...a, faq: updated };
                        });
                      }}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-600"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingSettings}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{savingSettings ? 'Menyimpan...' : 'Simpan AI Knowledge'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 4: Rekening & Integrasi */}
      {activeTab === 'integration' && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                <span>Rekening Penarikan & Integrasi Gateway</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Kelola rekening tujuan penarikan dana QRIS dan pantau status koneksi WhatsApp Gateway resmi Meta.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveBankAndIntegration} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bank Account */}
            <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Building className="w-4 h-4 text-emerald-600" />
                <span>Rekening Penarikan Dana (QRIS Settlement)</span>
              </h3>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Nama Bank *
                </label>
                <select
                  value={bankForm.name}
                  onChange={(e) => setBankForm((b) => ({ ...b, name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-semibold focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                >
                  <option value="BCA (Bank Central Asia)">BCA (Bank Central Asia)</option>
                  <option value="Bank Mandiri">Bank Mandiri</option>
                  <option value="BRI (Bank Rakyat Indonesia)">BRI (Bank Rakyat Indonesia)</option>
                  <option value="BNI (Bank Negara Indonesia)">BNI (Bank Negara Indonesia)</option>
                  <option value="Bank Jago">Bank Jago</option>
                  <option value="Bank Syariah Indonesia (BSI)">Bank Syariah Indonesia (BSI)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Nomor Rekening *
                </label>
                <input
                  type="text"
                  required
                  value={bankForm.account}
                  onChange={(e) => setBankForm((b) => ({ ...b, account: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono font-bold focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Nama Pemilik Rekening *
                </label>
                <input
                  type="text"
                  required
                  value={bankForm.holder}
                  onChange={(e) => setBankForm((b) => ({ ...b, holder: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 uppercase font-bold focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* WhatsApp Gateway Integration Status */}
            <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>WhatsApp Gateway & Meta Cloud API</span>
                </h3>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Status Gateway:</span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>CONNECTED</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-semibold">Nomor Bot WhatsApp:</span>
                    <span className="font-mono text-slate-800 font-bold">
                      +{integrationInfo.bot_number || '15556769563'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-semibold">Webhook Status:</span>
                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Verified 200 OK</span>
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Terintegrasi langsung melalui WhatsApp Cloud API resmi Meta untuk dispatch gambar QRIS otomatis.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingSettings ? 'Menyimpan...' : 'Simpan Rekening & Integrasi'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}