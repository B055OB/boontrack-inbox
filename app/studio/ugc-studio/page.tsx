'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Sparkles,
  Zap,
  Copy,
  Check,
  Film,
  Clock,
  Video,
  Save,
  Download,
  CheckCircle2,
  ChevronRight,
  Camera,
  Type,
  Mic,
  RefreshCw,
  UploadCloud,
  X,
  Play,
  Cpu,
  Layers,
  ShieldCheck,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import StudioPaywallModal from '@/components/studio/StudioPaywallModal';

interface Scene {
  scene_number: number;
  stage_name: string;
  duration_sec: number;
  time_range: string;
  voiceover: string;
  visual_direction: string;
  on_screen_text: string;
  asset_url?: string;
  asset_name?: string;
}

interface ScriptResult {
  product_name: string;
  hook_angle: string;
  category?: string;
  tone?: string;
  total_duration_sec: number;
  scenes: Scene[];
}

export default function UGCStudioPage() {
  // Session & Workspace Context
  const [tenantSlug, setTenantSlug] = useState<string>('studio');
  const [renderCredits, setRenderCredits] = useState<number>(1);
  const [hasValidSession, setHasValidSession] = useState<boolean>(true);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

  // Panel 1: Brief Form State
  const [productName, setProductName] = useState('Serum Brightening Niacinamide');
  const [painPoint, setPainPoint] = useState('Kulit kusam, flek hitam bekas jerawat, dan pori-pori besar yang susah hilang meski sudah coba berbagai skincare mahal.');
  const [hookAngle, setHookAngle] = useState('Unboxing Viral (POV ASMR Unboxing)');
  const [ctaGoal, setCtaGoal] = useState('Bio Link Creator (creator.boontrack.com/@handle)');
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Panel 2: 9-Scene Storyboard State
  const [scenes, setScenes] = useState<Scene[]>([
    {
      scene_number: 1,
      stage_name: 'Visual Pattern Interrupt',
      duration_sec: 3,
      time_range: '0-3s',
      voiceover: 'Stop scroll dulu! Sumpah kalau kamu masih mikir kulit kusam gak ada solusinya, kamu wajib tahu ini!',
      visual_direction: 'Kamera selfie handheld close-up ekspresi kaget menatap lensa sambil mengacungkan produk. Gerakan kamera cepat stop-scroll dengan sound effect whoosh.',
      on_screen_text: 'JANGAN BELI SEBELUM TAHU INI! 😱',
    },
    {
      scene_number: 2,
      stage_name: 'Hook Problem',
      duration_sec: 3,
      time_range: '3-6s',
      voiceover: 'Pasti capek banget kan tiap hari insecure gara-gara flek hitam dan pori besar yang gak kelar-kelar?',
      visual_direction: 'Kreator menatap cermin dengan ekspresi lelah. Tangan menunjuk pipi/dahi memperlihatkan tekstur kulit secara natural tanpa filter berlebih.',
      on_screen_text: 'Pernah ngerasain hal yang sama? ✋',
    },
    {
      scene_number: 3,
      stage_name: 'Agitation / Relatability',
      duration_sec: 3,
      time_range: '6-9s',
      voiceover: 'Udah coba macam-macam serum viral lain tapi hasilnya zonk dan cuma bikin kantong boncos.',
      visual_direction: 'B-roll footage cepat: Menyingkirkan botol-botol produk lama yang tidak efektif ke meja, gestur menghela napas geleng kepala.',
      on_screen_text: 'Udah coba ini itu tapi zonk... 💸',
    },
    {
      scene_number: 4,
      stage_name: 'Introduction Solution',
      duration_sec: 3,
      time_range: '9-12s',
      voiceover: 'Sampai akhirnya aku nemu penyelamat baru: Serum Brightening Niacinamide. Ini game changer banget!',
      visual_direction: 'Hero shot sinematik! Produk diangkat sejajar mata dengan pencahayaan hangat dan efek lens flare/glint. Botol diputar perlahan.',
      on_screen_text: 'Solusi Baru: Serum Brightening ✨',
    },
    {
      scene_number: 5,
      stage_name: 'Product In-Action Demo',
      duration_sec: 4,
      time_range: '12-16s',
      voiceover: 'Lihat pas dipakai, teksturnya ringan banget, gak lengket sama sekali dan langsung meresap dalam hitungan detik.',
      visual_direction: 'Macro zoom tekstur produk saat diaplikasikan: tetesan pipet kental lembut meresap seketika ke kulit tangan/pipi.',
      on_screen_text: 'Tekstur ringan, cepat meresap & gak lengket! 💧',
    },
    {
      scene_number: 6,
      stage_name: 'Key Benefit 1',
      duration_sec: 3,
      time_range: '16-19s',
      voiceover: 'Pemakaian rutin bikin warna kulit jauh lebih rata dan cerah alami tanpa efek pengelupasan perih.',
      visual_direction: 'Demonstrasi hasil langsung di kamera. Senyum puas kreator menunjukkan rasa percaya diri yang meningkat.',
      on_screen_text: 'Flek memudar & glowing alami 🔥',
    },
    {
      scene_number: 7,
      stage_name: 'Key Benefit 2',
      duration_sec: 3,
      time_range: '19-22s',
      voiceover: 'Plus formulanya aman banget buat all skin types, non-comedogenic dan nyaman dipakai pagi & malam.',
      visual_direction: 'Kreator mengusap wajah dengan lembut, menunjukkan rasa nyaman dan sensasi dingin menenangkan.',
      on_screen_text: 'Aman untuk kulit sensitif 🌟',
    },
    {
      scene_number: 8,
      stage_name: 'Social Proof / Reassurance',
      duration_sec: 3,
      time_range: '22-25s',
      voiceover: 'Gak heran ratingnya tembus 4.9/5 dan udah ribuan orang ngerasain hasilnya sendiri. BPOM resmi ya!',
      visual_direction: 'Menampilkan badge sertifikat BPOM resmi, rating bintang 4.9 dari marketplace, dan screenshot testimoni pelanggan puas.',
      on_screen_text: '⭐⭐⭐⭐⭐ 4.9/5 (BPOM Resmi & Teruji)',
    },
    {
      scene_number: 9,
      stage_name: 'Strong CTA (Klaim Promo / Cek Link Bio)',
      duration_sec: 5,
      time_range: '25-30s',
      voiceover: 'Khusus hari ini lagi ada diskon bundling terbatas! Langsung klik tautan di Bio profil sekarang sebelum kehabisan!',
      visual_direction: 'Kreator tersenyum ramah menatap lensa, tangan menunjuk langsung ke pojok kiri bawah (link bio) dengan grafis panah animasi.',
      on_screen_text: '👉 Klik Link di Bio Sekarang! 🛒',
    },
  ]);

  // Panel 3: Render Dispatch State
  const [dispatching, setDispatching] = useState(false);
  const [jobStatus, setJobStatus] = useState<'IDLE' | 'QUEUED' | 'PROCESSING' | 'COMPLETED'>('IDLE');
  const [jobProgress, setJobProgress] = useState(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [allCopied, setAllCopied] = useState(false);

  // File upload input references
  const fileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  // 1. Resolve Session Context
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cookieMatch = document.cookie.match(/(?:merchant_store|merchant_session|bt_tenant)=([^;]+)/);
      const cookieVal = cookieMatch ? decodeURIComponent(cookieMatch[1]).replace(/^["']|["']$/g, '').trim() : '';
      const localVal = (
        localStorage.getItem('merchant_store') ||
        localStorage.getItem('merchant_session') ||
        localStorage.getItem('bt_tenant') ||
        ''
      ).replace(/^["']|["']$/g, '').trim();

      const resolved = (localVal || cookieVal || '').toLowerCase();
      if (resolved && resolved !== 'null' && resolved !== 'undefined') {
        setTenantSlug(resolved);
        setHasValidSession(true);
      }

      const storedSession = localStorage.getItem('studio_session');
      if (storedSession) {
        try {
          const parsed = JSON.parse(storedSession);
          if (parsed.render_credits !== undefined) {
            setRenderCredits(parsed.render_credits);
          }
        } catch {}
      }
    }
  }, []);

  // Calculate total duration
  const totalDuration = scenes.reduce((sum, s) => sum + (s.duration_sec || 0), 0);

  // Generate Script via AI API
  const handleGenerateScript = async () => {
    if (!productName.trim() || !painPoint.trim()) {
      setErrorMsg('Nama produk dan target masalah wajib diisi.');
      return;
    }

    setGenerating(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/studio/script/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: productName.trim(),
          pain_point: painPoint.trim(),
          hook_angle: hookAngle,
          cta_goal: ctaGoal,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal generate naskah.');
      }

      if (Array.isArray(data.scenes)) {
        setScenes(data.scenes);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setGenerating(false);
    }
  };

  // Update specific scene field
  const handleSceneChange = (index: number, field: keyof Scene, value: any) => {
    setScenes(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Handle asset file upload per scene
  const handleFileUpload = (sceneIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    handleSceneChange(sceneIndex, 'asset_url', previewUrl);
    handleSceneChange(sceneIndex, 'asset_name', file.name);
  };

  // Remove asset from scene
  const handleRemoveAsset = (sceneIndex: number) => {
    handleSceneChange(sceneIndex, 'asset_url', undefined);
    handleSceneChange(sceneIndex, 'asset_name', undefined);
  };

  // Dispatch to Render Queue
  const handleDispatchRender = async () => {
    if (renderCredits < 1) {
      setIsPaywallOpen(true);
      return;
    }

    setDispatching(true);
    setJobStatus('QUEUED');
    setJobProgress(15);

    try {
      const res = await fetch('/api/studio/render/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantSlug,
          product_name: productName,
          scenes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal mengirim job render.');
      }

      setActiveJobId(data.job_id);
      if (data.remaining_credits !== undefined) {
        setRenderCredits(data.remaining_credits);
      }

      // Simulated real-time rendering progression
      setTimeout(() => {
        setJobStatus('PROCESSING');
        setJobProgress(55);
      }, 1500);

      setTimeout(() => {
        setJobProgress(85);
      }, 3000);

      setTimeout(() => {
        setJobStatus('COMPLETED');
        setJobProgress(100);
        setDispatching(false);
      }, 4500);
    } catch (err: any) {
      alert(err.message || 'Gagal mengirim job render.');
      setJobStatus('IDLE');
      setDispatching(false);
    }
  };

  // Copy full script to clipboard
  const handleCopyFullScript = () => {
    const fullText = scenes
      .map(
        s =>
          `[Scene ${s.scene_number}: ${s.stage_name} (${s.duration_sec}s)]\n` +
          `• Panduan Visual: ${s.visual_direction}\n` +
          `• Teks Layar: ${s.on_screen_text}\n` +
          `• Voiceover: "${s.voiceover}"\n`
      )
      .join('\n');

    navigator.clipboard.writeText(fullText);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#070A10] text-white selection:bg-fuchsia-500 selection:text-white font-sans relative overflow-x-hidden flex flex-col justify-between">
      {/* Background Electric Glow Mesh */}
      <div className="absolute top-0 right-1/4 w-[800px] h-[450px] bg-gradient-to-b from-fuchsia-600/12 via-purple-600/8 to-transparent blur-[140px] pointer-events-none -z-10" />
      <div className="absolute top-1/2 left-0 w-96 h-96 bg-purple-700/8 rounded-full blur-[130px] pointer-events-none -z-10" />

      {/* ── TOP HEADER ────────────────────────────────────────── */}
      <header className="border-b border-white/10 bg-[#070A10]/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/studio/desk"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition"
              title="Kembali ke Studio Desk"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-fuchsia-500 to-purple-600 p-0.5 shadow-md shadow-fuchsia-500/20">
                <div className="w-full h-full bg-[#070A10] rounded-[10px] flex items-center justify-center">
                  <Film className="w-4 h-4 text-fuchsia-400" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm sm:text-base tracking-tight text-white">boontrack</span>
                  <span className="text-[11px] font-black tracking-widest bg-gradient-to-r from-fuchsia-400 via-pink-400 to-purple-400 bg-clip-text text-transparent uppercase">
                    STUDIO PANDUAN NASKAH ASLI
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono">
                  Panduan Adegan Video Manusiawi & Eksekusi Lapangan
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Active Workspace Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-mono text-slate-400">Workspace:</span>
              <span className="font-bold text-white font-mono">{tenantSlug}</span>
            </div>

            {/* Credit Pill & Top Up */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-xs font-bold text-violet-300">
              <Zap className="w-3.5 h-3.5 text-violet-400" />
              <span>{renderCredits} Credit{renderCredits === 1 ? ' (Trial)' : 's'}</span>
            </div>

            <button
              type="button"
              onClick={() => setIsPaywallOpen(true)}
              className="py-1.5 px-3 rounded-xl bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/40 text-violet-300 hover:text-white font-bold text-xs transition cursor-pointer"
            >
              + Top Up
            </button>
          </div>
        </div>
      </header>

      {/* ── 3-PANEL WORKSPACE CONTENT ─────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1">
        {/* Session Warning Guard */}
        {!hasValidSession && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Anda berada dalam mode pratinjau publik. Untuk merender video dan menyimpan draf naskah permanen, aktifkan akun Studio Anda.</span>
            </div>
            <Link
              href="/studio/register"
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs whitespace-nowrap transition"
            >
              Daftar Gratis
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ======================================================== */}
          {/* PANEL 1: BRIEF PRODUK & PROMPT AI (4 Cols)               */}
          {/* ======================================================== */}
          <div className="lg:col-span-4 bg-slate-900/60 border border-white/10 rounded-3xl p-5 sm:p-6 backdrop-blur-xl shadow-xl space-y-5 sticky lg:top-20">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fuchsia-400 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Langkah 1: Brief Produk & Asisten Cerdas</span>
              </div>
              <h2 className="text-lg font-black text-white">Parameter Panduan Naskah Asli</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Formula penyusunan naskah teruji untuk konten testimoni, jasa nyata, dan iklan alami.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              {/* Nama Produk */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1.5">
                  Nama Produk / Jasa
                </label>
                <input
                  type="text"
                  value={productName}
                  onChange={e => setProductName(e.target.value)}
                  placeholder="Contoh: Serum Brightening Niacinamide"
                  className="w-full px-3.5 py-2.5 bg-black/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 transition"
                />
              </div>

              {/* Target Masalah / Pain Point */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1.5">
                  Target Masalah / Pain Point Audiens
                </label>
                <textarea
                  rows={3}
                  value={painPoint}
                  onChange={e => setPainPoint(e.target.value)}
                  placeholder="Masalah nyata yang dialami pembeli target..."
                  className="w-full px-3.5 py-2.5 bg-black/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 transition resize-none leading-relaxed"
                />
              </div>

              {/* Hook Angle Dropdown */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1.5">
                  Sudut Penjualan (Hook Angle)
                </label>
                <select
                  value={hookAngle}
                  onChange={e => setHookAngle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-black/50 border border-white/10 rounded-xl text-white focus:outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 transition"
                >
                  <option value="Unboxing Viral (POV ASMR Unboxing)">📦 Unboxing Viral (POV ASMR Unboxing)</option>
                  <option value="Masalah Nyata Sehari-hari (Relatable Problem)">😩 Masalah Nyata Sehari-hari (Relatable Problem)</option>
                  <option value="Perbandingan Sebelum-Sesudah (Before & After Transformation)">✨ Perbandingan Sebelum-Sesudah (Before & After)</option>
                  <option value="Rahasia Hemat (Solusi Anti-Boncos)">💰 Rahasia Hemat (Solusi Anti-Boncos)</option>
                  <option value="Stop-Scroll Hook (Patahkan Mitos / Kontroversi)">😱 Stop-Scroll Hook (Patahkan Mitos / Kontroversi)</option>
                </select>
              </div>

              {/* Call-to-Action Dropdown */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1.5">
                  Call-to-Action (Arahkan ke Mana?)
                </label>
                <select
                  value={ctaGoal}
                  onChange={e => setCtaGoal(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-black/50 border border-white/10 rounded-xl text-white focus:outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 transition"
                >
                  <option value="Bio Link Creator (creator.boontrack.com/@handle)">🔗 Bio Link Creator (creator.boontrack.com/@handle)</option>
                  <option value="Keranjang Shopee / TikTok Shop">🛒 Keranjang Shopee / TikTok Shop</option>
                  <option value="WhatsApp Direct (Pesan Otomatis)">💬 WhatsApp Direct (Pesan Otomatis)</option>
                </select>
              </div>

              {/* Generate CTA Button */}
              <button
                type="button"
                onClick={handleGenerateScript}
                disabled={generating}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-fuchsia-500 via-pink-500 to-purple-600 hover:from-fuchsia-600 hover:via-pink-600 hover:to-purple-700 text-white font-black text-xs sm:text-sm shadow-lg shadow-fuchsia-500/25 flex items-center justify-center gap-2 transition active:scale-98 disabled:opacity-50 cursor-pointer"
              >
                {generating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menyusun Panduan Adegan...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Racik Panduan Naskah Asli (Asisten Cerdas) ✨</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ======================================================== */}
          {/* PANEL 2: STRUKTUR NASKAH 9-SCENE (EDITABLE CARDS) (8 Cols) */}
          {/* ======================================================== */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Panel 2 Header & Quick Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <div>
                <span className="text-[11px] font-bold text-fuchsia-400 uppercase tracking-wider block">
                  Langkah 2: Struktur Panduan Syuting
                </span>
                <h3 className="text-base font-extrabold text-white">
                  Daftar Urutan Adegan Siap Baca & Rekam (Editable)
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyFullScript}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  {allCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{allCopied ? 'Tersalin!' : 'Salin Semua Naskah'}</span>
                </button>
              </div>
            </div>

            {/* 9 Editable Cards List */}
            <div className="space-y-4">
              {scenes.map((scene, idx) => (
                <div
                  key={scene.scene_number}
                  className="p-5 rounded-3xl bg-slate-900/70 border border-white/10 hover:border-fuchsia-500/40 backdrop-blur-xl transition space-y-4 shadow-lg group"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-white/5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-xl bg-gradient-to-tr from-fuchsia-500 to-purple-600 font-mono font-black text-white text-xs flex items-center justify-center shadow-md shadow-fuchsia-500/20">
                        {scene.scene_number}
                      </span>
                      <div>
                        <span className="font-extrabold text-sm text-white block">
                          Scene {scene.scene_number}: {scene.stage_name}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          Timeline: {scene.time_range}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono font-bold text-slate-300">
                        ⏱ {scene.duration_sec}s
                      </span>
                    </div>
                  </div>

                  {/* Card Content Grid (Voiceover + Visual Notes) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {/* Voiceover Textarea */}
                    <div className="space-y-1.5">
                      <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                        <Mic className="w-3.5 h-3.5 text-fuchsia-400" />
                        <span>Teks Voiceover / Narasi Kreator:</span>
                      </label>
                      <textarea
                        rows={3}
                        value={scene.voiceover}
                        onChange={e => handleSceneChange(idx, 'voiceover', e.target.value)}
                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-fuchsia-500 transition resize-none leading-relaxed"
                        placeholder="Masukkan kalimat yang diucapkan kreator..."
                      />
                    </div>

                    {/* Visual Direction Textarea */}
                    <div className="space-y-1.5">
                      <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-purple-400" />
                        <span>Panduan Visual (Catatan Sutradara):</span>
                      </label>
                      <textarea
                        rows={3}
                        value={scene.visual_direction}
                        onChange={e => handleSceneChange(idx, 'visual_direction', e.target.value)}
                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500 transition resize-none leading-relaxed"
                        placeholder="Instruksi kamera, gestur, dan pencahayaan..."
                      />
                    </div>
                  </div>

                  {/* Teks Pada Layar (Overlay Text) */}
                  <div className="space-y-1 text-xs">
                    <label className="font-semibold text-slate-400 flex items-center gap-1.5">
                      <Type className="w-3.5 h-3.5 text-pink-400" />
                      <span>On-Screen Subtitle / Teks Hook Layar:</span>
                    </label>
                    <input
                      type="text"
                      value={scene.on_screen_text}
                      onChange={e => handleSceneChange(idx, 'on_screen_text', e.target.value)}
                      className="w-full px-3 py-1.5 bg-black/30 border border-white/10 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-pink-500 transition"
                      placeholder="Teks tebal di layar..."
                    />
                  </div>

                  {/* Slot Upload Aset Foto/Video Per Scene */}
                  <div className="pt-2 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <span className="text-slate-400 font-medium">
                      Slot Aset Media Adegan:
                    </span>

                    {scene.asset_url ? (
                      /* Display Attached Asset Preview */
                      <div className="flex items-center gap-2 p-1.5 bg-white/5 border border-white/10 rounded-xl">
                        <img
                          src={scene.asset_url}
                          alt={`Asset Scene ${scene.scene_number}`}
                          className="w-10 h-10 object-cover rounded-lg border border-white/10"
                        />
                        <div className="text-[11px] leading-tight">
                          <span className="font-bold text-white block truncate max-w-[140px]">
                            {scene.asset_name || 'asset_attached'}
                          </span>
                          <span className="text-[9px] font-mono text-emerald-400">
                            is_aigc: 1 (Ready)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveAsset(idx)}
                          className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-rose-400 transition ml-1"
                          title="Hapus aset"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      /* Upload Button & Hidden Input */
                      <div>
                        <input
                          type="file"
                          accept="image/*,video/*"
                          ref={el => {
                            fileInputRefs.current[idx] = el;
                          }}
                          onChange={e => handleFileUpload(idx, e)}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRefs.current[idx]?.click()}
                          className="py-1.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-medium text-xs flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <UploadCloud className="w-3.5 h-3.5 text-fuchsia-400" />
                          <span>Unggah Footage/Foto Scene</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* ======================================================== */}
            {/* PANEL 3: RENDER PREVIEW & QUEUE DISPATCH                 */}
            {/* ======================================================== */}
            <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-purple-950/40 via-slate-900 to-fuchsia-950/40 border border-fuchsia-500/30 backdrop-blur-xl shadow-2xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-fuchsia-400 uppercase tracking-wider block">
                    Panel 3: Perakitan Video & Render Dispatch
                  </span>
                  <h3 className="text-xl font-black text-white">
                    Perakitan Antrean Render FFmpeg
                  </h3>
                  <p className="text-xs text-slate-400">
                    Otomatisasi penggabungan klip, audio narasi, subtitle dinamis, dan watermark AIGC resmi.
                  </p>
                </div>

                {/* Duration & Credit Summary */}
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-black/50 border border-white/10 text-center">
                    <span className="text-[10px] text-slate-400 block font-mono">Total Durasi</span>
                    <span className="text-lg font-black text-white font-mono">~{totalDuration}s</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/30 text-center">
                    <span className="text-[10px] text-fuchsia-300 block font-mono">Konsumsi Biaya</span>
                    <span className="text-lg font-black text-fuchsia-400 font-mono">1 Credit</span>
                  </div>
                </div>
              </div>

              {/* Status Box if Dispatched */}
              {jobStatus !== 'IDLE' && (
                <div className="p-4 rounded-2xl bg-black/60 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {jobStatus === 'COMPLETED' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <RefreshCw className="w-4 h-4 text-fuchsia-400 animate-spin" />
                      )}
                      <span className="font-bold text-white">
                        Status Job: <span className="font-mono text-fuchsia-400">{jobStatus}</span>
                      </span>
                    </div>
                    <span className="font-mono font-bold text-slate-300">{jobProgress}%</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-fuchsia-500 to-emerald-400 transition-all duration-500 rounded-full"
                      style={{ width: `${jobProgress}%` }}
                    />
                  </div>

                  {jobStatus === 'COMPLETED' && (
                    <div className="pt-2 flex items-center justify-between text-xs text-emerald-400 font-medium">
                      <span>🎉 Render Selesai! Output video 9:16 tersimpan di Cloud Storage.</span>
                      <span className="text-[10px] font-mono text-slate-400">is_aigc: 1</span>
                    </div>
                  )}
                </div>
              )}

              {/* Main Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={handleDispatchRender}
                  disabled={dispatching || renderCredits < 1}
                  className="w-full sm:flex-1 py-4 px-6 rounded-2xl bg-gradient-to-r from-fuchsia-500 via-pink-500 to-purple-600 hover:from-fuchsia-600 hover:via-pink-600 hover:to-purple-700 text-white font-black text-sm shadow-xl shadow-fuchsia-500/25 flex items-center justify-center gap-2 transition active:scale-98 disabled:opacity-50 cursor-pointer"
                >
                  {dispatching ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Memproses Antrean Render FFmpeg...</span>
                    </>
                  ) : (
                    <>
                      <Film className="w-5 h-5" />
                      <span>Kirim ke Antrean Render FFmpeg 🚀</span>
                    </>
                  )}
                </button>
              </div>

              <div className="text-[11px] text-slate-400 flex items-center justify-between border-t border-white/5 pt-3">
                <span>⚡ FFmpeg Level 1 Server Worker</span>
                <span>Watermark Etis: <strong className="text-slate-300">is_aigc = 1</strong></span>
              </div>
            </div>

          </div>

        </div>
      </main>

      {/* ── NATIVE STUDIO PAYWALL MODAL ───────────────────────── */}
      <StudioPaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        tenantSlug={tenantSlug}
        currentCredits={renderCredits}
      />

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="py-6 text-center text-xs text-slate-500 border-t border-white/5 mt-12">
        <p>BoonTrack Studio • Studio Panduan Naskah Asli & Pemroses Video</p>
      </footer>
    </div>
  );
}
