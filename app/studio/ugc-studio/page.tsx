'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Sparkles,
  Zap,
  Copy,
  Check,
  Film,
  Layers,
  Store,
  Clock,
  Video,
  Save,
  Download,
  History,
  CheckCircle2,
  ChevronRight,
  Flame,
  Camera,
  Type,
  Mic,
  RefreshCw,
  FolderOpen
} from 'lucide-react';

interface Scene {
  scene_number: number;
  duration_sec: number;
  time_range: string;
  stage_name: string;
  visual_direction: string;
  on_screen_text: string;
  voiceover: string;
}

interface ScriptResult {
  product_name: string;
  hook_angle: string;
  category: string;
  tone: string;
  scenes: Scene[];
}

interface SavedScriptItem {
  id: string;
  product_name: string;
  brief: {
    category?: string;
    hook_angle?: string;
    tone?: string;
    pain_point?: string;
    cta_goal?: string;
  };
  scenes: Scene[];
  status: string;
  created_at: string;
}

export default function UGCStudioPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [allCopied, setAllCopied] = useState(false);
  const [tenantId, setTenantId] = useState<string>('');
  const [tenantDisplay, setTenantDisplay] = useState<string>('');
  
  // History tab / state
  const [savedScripts, setSavedScripts] = useState<SavedScriptItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    product_name: 'Serum Brightening Niacinamide',
    category: 'Skincare',
    pain_point: 'Kulit kusam, noda hitam bekas jerawat, dan pori-pori besar yang susah hilang meski sudah coba berbagai produk.',
    hook_angle: 'Stop-Scroll Hook (Patahkan Mitos / Kontroversi)',
    tone: 'Casual Gaul',
    cta_goal: 'Checkout Keranjang Kuning / Orange',
  });

  // Generated Result State
  const [result, setResult] = useState<ScriptResult | null>(null);

  // 1. Resolve dynamic tenant context (Zero Hardcoding)
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
        setTenantId(resolved);
        setTenantDisplay(resolved);
      }
    }
  }, []);

  // Fetch saved scripts history
  const fetchSavedScripts = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/studio/scripts?tenant_id=${encodeURIComponent(tenantId || 'creator')}&limit=10`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setSavedScripts(data.data);
      }
    } catch (err) {
      console.warn('[UGC Studio] History fetch note:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchSavedScripts();
  }, [tenantId]);

  // 2. High-converting 9-Scene Direct Response Storyboard Engine
  const generateNineScenesLocally = (data: typeof formData): ScriptResult => {
    const { product_name, category, pain_point, hook_angle, tone, cta_goal } = data;

    // Tailored hook patterns based on selected formula
    let hookVisual = `Close-up ekspresi kaget menatap kamera sambil memegang ${product_name}. Tangan menunjuk kamera atau menepuk jidat dengan gerakan cepat.`;
    let hookText = `JANGAN BELI INI SEBELUM TAHU INI! 😱`;
    let hookVO = `Stop scroll dulu! Sumpah kalau kamu masih mikir ${pain_point.slice(0, 45)} itu nggak ada solusinya, kamu wajib dengar ini.`;

    if (hook_angle.includes('Problem-Agitation-Solution')) {
      hookVisual = `Kamera selfie handheld pencahayaan natural. Wajah terlihat lelah atau frustrasi menatap pantulan cermin / layar smartphone.`;
      hookText = `Capek banget sama masalah ini... 😭`;
      hookVO = `Jujur aku udah capek banget ngadepin ${pain_point.slice(0, 50)} tiap hari.`;
    } else if (hook_angle.includes('Before-After')) {
      hookVisual = `Split screen visual transisi cepat: Kiri foto kusam/masalah awal, Kanan visual glowing mulus setelah pakai ${product_name}.`;
      hookText = `REAL 14 HARI BEDANYA JAUH BANGET! ✨`;
      hookVO = `Liat sendiri perbedaannya! Ini muka aku 2 minggu lalu dibanding sekarang setelah nemu ${product_name}.`;
    } else if (hook_angle.includes('Unboxing')) {
      hookVisual = `Kamera bird-eye view / POV membuka paket bubble wrap dengan suara renyah (ASMR unboxing). Menampakkan botol packaging ${product_name}.`;
      hookText = `UNBOXING RACUN BARU YANG LAGI VIRAL 🔥`;
      hookVO = `Akhirnya paket yang lagi rame di FYP nyampe juga! Kita review jujur ya, apakah ${product_name} ini beneran sebagus itu?`;
    }

    // Dynamic Tone Modulation
    const isCasual = tone.includes('Casual') || tone.includes('Humoris');
    const isExpert = tone.includes('Pakar') || tone.includes('Edukatif');

    const scenes: Scene[] = [
      {
        scene_number: 1,
        duration_sec: 3,
        time_range: '0-3s',
        stage_name: 'Visual & Hook Stop-Scroll',
        visual_direction: hookVisual,
        on_screen_text: hookText,
        voiceover: hookVO,
      },
      {
        scene_number: 2,
        duration_sec: 4,
        time_range: '3-7s',
        stage_name: 'Relatability & Identifikasi Masalah',
        visual_direction: `Kamera medium shot kreator mengangguk empati, menunjuk area masalah (${category === 'Skincare' ? 'pipi/dahi' : 'produk lama'}), footage zoom-in memperlihatkan bukti real.`,
        on_screen_text: `Pernah ngerasain hal yang sama? ✋`,
        voiceover: isCasual
          ? `Pasti banyak yang ngerasa relate kan? Tiap hari insecure gara-gara ${pain_point.slice(0, 60)} padahal udah rutin perawatan.`
          : `Kondisi ini wajar dialami karena formulasi sebelumnya belum tepat menangani akar penyebab ${pain_point.slice(0, 40)}.`,
      },
      {
        scene_number: 3,
        duration_sec: 4,
        time_range: '7-11s',
        stage_name: 'Agitasi Masalah (The Struggle)',
        visual_direction: `B-roll footage cepat: Membuang produk lama yang tidak ngefek ke meja, atau gestur menghela napas geleng-geleng kepala.`,
        on_screen_text: `Udah keluar ratusan ribu tapi zonk... 💸`,
        voiceover: isCasual
          ? `Dulu aku habis jutaan buat coba ini itu, tapi hasilnya malah bikin boncos dan masalahnya gak kelar-kelar.`
          : `Banyak yang terjebak beli produk murah tanpa sertifikasi aktif yang justru memperburuk kondisi dalam jangka panjang.`,
      },
      {
        scene_number: 4,
        duration_sec: 5,
        time_range: '11-16s',
        stage_name: 'Introduction / Penyelamat Datang',
        visual_direction: `Hero shot sinematik! ${product_name} diangkat sejajar mata dengan pencahayaan hangat dan efek lens flare/glint. Botol/kemasan diputar perlahan.`,
        on_screen_text: `Penyelamat Baru: ${product_name} 🌟`,
        voiceover: `Sampai akhirnya aku cobain ${product_name}. Ini game changer yang beneran ngubah rutinitas harian aku!`,
      },
      {
        scene_number: 5,
        duration_sec: 5,
        time_range: '16-21s',
        stage_name: 'Fitur Utama & Visual Proof Tekstur/Bahan',
        visual_direction: `Macro zoom tekstur produk saat diaplikasikan: tetesan cairan kental lembut / bahan kain berkualitas / build quality presisi. Efek penyerapan cepat.`,
        on_screen_text: `Tekstur ringan, cepat meresap & gak lengket! 💧`,
        voiceover: `Lihat teksturnya, ringan banget, gak lengket sama sekali dan langsung meresap dalam hitungan detik. Mengandung bahan konsentrat aktif pilihan.`,
      },
      {
        scene_number: 6,
        duration_sec: 5,
        time_range: '21-26s',
        stage_name: 'Manfaat Riil & Cara Pakai Praktis',
        visual_direction: `Kreator mendemonstrasikan cara pakai dengan senyum puas. Kamera mengikuti gerakan aplikator dengan transisi halus ke hasil seketika.`,
        on_screen_text: `Cukup 2-3 tetes pagi & malam hari ✨`,
        voiceover: `Cukup pakai secara rutin tiap hari, sensasinya adem banget dan perlahan bikin rasa percaya diri kamu balik 100%.`,
      },
      {
        scene_number: 7,
        duration_sec: 4,
        time_range: '26-30s',
        stage_name: 'Social Proof & Jaminan Kualitas',
        visual_direction: `Menampilkan logo BPOM / Sertifikat Halal resmi, screenshot rating bintang 4.9 di marketplace, dan tumpukan ribuan ulasan positif pembeli.`,
        on_screen_text: `⭐⭐⭐⭐⭐ 4.9/5 (BPOM Resmi & Teruji)`,
        voiceover: `Nggak heran ratingnya tembus 4.9 dan udah terjual puluhan ribu pieces. Udah BPOM resmi jadi aman dipakai jangka panjang.`,
      },
      {
        scene_number: 8,
        duration_sec: 4,
        time_range: '30-34s',
        stage_name: 'Urgensi Promo & Diskon Terbatas',
        visual_direction: `Menampilkan kotak harga promo coret warna merah/oranye. Tangan menunjuk ke pojok kiri bawah layar dengan teks flash sale menyala.`,
        on_screen_text: `FLASH SALE HARI INI DISKON S/D 40%! 🔥`,
        voiceover: `Khusus yang nonton video ini hari ini, lagi ada promo bundling diskon gede-gedean plus voucher gratis ongkir ekstra!`,
      },
      {
        scene_number: 9,
        duration_sec: 5,
        time_range: '34-39s',
        stage_name: 'Hard Call-to-Action (CTA)',
        visual_direction: `Kreator menatap langsung ke lensa, tersenyum ramah sambil menunjuk jari ke arah keranjang kuning / tombol checkout di layar.`,
        on_screen_text: `👉 Klik Keranjang Kuning Sebelum Kehabisan! 🛒`,
        voiceover: cta_goal.includes('Bio')
          ? `Jangan sampai nyesel kehabisan promo! Langsung klik tautan di bio profil aku sekarang juga ya!`
          : `Slot promo terbatas banget, langsung tap keranjang kuning di kiri bawah sebelum kehabisan stok!`,
      },
    ];

    return {
      product_name,
      hook_angle,
      category,
      tone,
      scenes,
    };
  };

  // 3. Handle Form Submit
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaveSuccess(false);

    try {
      // First try backend gateway if reachable
      let generatedData: ScriptResult | null = null;
      try {
        const res = await fetch('/api/v1/creator/ugc/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            tenant_id: tenantId || 'creator',
          }),
        });
        if (res.ok) {
          const apiJson = await res.json();
          if (apiJson.success && apiJson.data?.scenes) {
            generatedData = {
              product_name: formData.product_name,
              hook_angle: formData.hook_angle,
              category: formData.category,
              tone: formData.tone,
              scenes: apiJson.data.scenes.map((s: any, idx: number) => ({
                scene_number: s.scene_number || idx + 1,
                duration_sec: s.duration_sec || 4,
                time_range: `${idx * 4}-${(idx + 1) * 4}s`,
                stage_name: s.stage_name || `Scene #${idx + 1}`,
                visual_direction: s.visual_direction || '',
                on_screen_text: s.on_screen_text || '',
                voiceover: s.voiceover || '',
              })),
            };
          }
        }
      } catch (backendErr) {
        // Backend offline / local dev fallback
      }

      // If backend was not active or returned without full scenes, use direct generator
      if (!generatedData) {
        generatedData = generateNineScenesLocally(formData);
      }

      setResult(generatedData);
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan saat meracik naskah.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Save to Database (public.studio_scripts via POST /api/studio/scripts)
  const handleSaveToDatabase = async () => {
    if (!result) return;
    setSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/studio/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId || 'creator',
          product_name: result.product_name,
          brief: {
            category: result.category,
            hook_angle: result.hook_angle,
            tone: result.tone,
            pain_point: formData.pain_point,
            cta_goal: formData.cta_goal,
          },
          scenes: result.scenes,
          status: 'draft',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        fetchSavedScripts();
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert(data.message || 'Gagal menyimpan naskah ke database.');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan jaringan: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // 5. Copy Functions
  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const copyFullScript = () => {
    if (!result) return;
    const fullText = `=== 9-SCENE UGC DIRECT RESPONSE SCRIPT ===\n` +
      `Produk: ${result.product_name}\n` +
      `Formula Hook: ${result.hook_angle}\n` +
      `Kategori: ${result.category} | Gaya: ${result.tone}\n\n` +
      result.scenes
        .map(
          (s) =>
            `--------------------------------------------------\n` +
            `[SCENE ${s.scene_number}] (${s.time_range}) - ${s.stage_name}\n` +
            `📹 ARAHAN VISUAL:\n${s.visual_direction}\n\n` +
            `💬 TEKS LAYAR (HOOK/CAPTION):\n"${s.on_screen_text}"\n\n` +
            `🎙️ VOICEOVER SCRIPT:\n"${s.voiceover}"`
        )
        .join('\n\n');

    navigator.clipboard.writeText(fullText);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2500);
  };

  const downloadScriptTxt = () => {
    if (!result) return;
    const fullText = `=== 9-SCENE UGC DIRECT RESPONSE SCRIPT ===\n` +
      `Produk: ${result.product_name}\n` +
      `Formula Hook: ${result.hook_angle}\n` +
      `Dibuat di: BoonTrack Studio Workspace\n\n` +
      result.scenes
        .map(
          (s) =>
            `[SCENE ${s.scene_number}] (${s.time_range}) - ${s.stage_name}\n` +
            `ARAHAN KAMERA : ${s.visual_direction}\n` +
            `TEKS LAYAR     : "${s.on_screen_text}"\n` +
            `VOICEOVER      : "${s.voiceover}"\n`
        )
        .join('\n');

    const element = document.createElement('a');
    const file = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `UGC-Script-${result.product_name.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Load past script into current view
  const loadPastScript = (item: SavedScriptItem) => {
    setResult({
      product_name: item.product_name,
      hook_angle: item.brief?.hook_angle || 'Standard Direct Response',
      category: item.brief?.category || 'Umum',
      tone: item.brief?.tone || 'Casual',
      scenes: item.scenes || [],
    });
    setFormData((prev) => ({
      ...prev,
      product_name: item.product_name,
      category: item.brief?.category || prev.category,
      pain_point: item.brief?.pain_point || prev.pain_point,
      hook_angle: item.brief?.hook_angle || prev.hook_angle,
      tone: item.brief?.tone || prev.tone,
      cta_goal: item.brief?.cta_goal || prev.cta_goal,
    }));
    setShowHistoryModal(false);
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 selection:bg-fuchsia-500 selection:text-white font-sans relative overflow-x-hidden">
      {/* Background Electric Studio Glow Accents */}
      <div className="absolute top-0 right-1/4 w-[600px] h-[400px] bg-gradient-to-b from-fuchsia-600/15 via-purple-600/10 to-transparent blur-[140px] pointer-events-none -z-10" />
      <div className="absolute top-1/2 left-0 w-96 h-96 bg-violet-600/10 rounded-full blur-[120px] pointer-events-none -z-10" />

      {/* ── A. HEADER & WORKSPACE NAVIGATION ─────────────────────── */}
      <header className="border-b border-slate-800/80 bg-[#0B0F17]/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/studio"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-fuchsia-400" />
              <span>Kembali ke Studio</span>
            </Link>

            <div className="hidden sm:block text-slate-600">/</div>

            <nav className="text-xs font-mono flex items-center gap-1.5 text-slate-400">
              <span className="text-slate-500">Studio Workspace</span>
              <ChevronRight className="w-3 h-3 text-slate-600" />
              <span className="text-fuchsia-400 font-bold">UGC Script Studio</span>
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Direct Response Formula Pill */}
            <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-300 text-[11px] font-bold">
              <Zap className="w-3 h-3 text-fuchsia-400" />
              <span>9-Scene Direct Response Formula (TikTok & Shopee Video)</span>
            </span>

            {/* Riwayat Draf Button */}
            <button
              onClick={() => setShowHistoryModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-purple-400" />
              <span>Draf ({savedScripts.length})</span>
            </button>

            {/* Tenant Pill */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-xs font-mono text-zinc-300">
              <Store className="w-3 h-3 text-fuchsia-400" />
              <span>@{tenantDisplay || 'creator'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT WORKSPACE ───────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Workspace Title & Intro */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-bold">
              <Film className="w-3.5 h-3.5 text-purple-400" />
              <span>High-Converting Video Blueprint</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
              <span>UGC Script Studio</span>
              <span className="text-xs px-2.5 py-0.5 rounded-md bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-extrabold uppercase tracking-wider">
                9-SCENE
              </span>
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
              Rancang naskah video TikTok & Shopee Video 30-45 detik yang terbukti melipatgandakan retensi tontonan dan klik keranjang, lengkap dengan arahan kamera, teks layar, dan skrip voiceover.
            </p>
          </div>

          {result && (
            <div className="flex items-center gap-2.5">
              <button
                onClick={handleSaveToDatabase}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-white transition-all flex items-center gap-2 cursor-pointer shadow-sm hover:border-fuchsia-500/50"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-fuchsia-400" />
                    <span>Menyimpan...</span>
                  </>
                ) : saveSuccess ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Tersimpan di Studio!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5 text-fuchsia-400" />
                    <span>Simpan ke Database</span>
                  </>
                )}
              </button>

              <button
                onClick={copyFullScript}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-xs font-bold text-white transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-fuchsia-600/20 active:scale-95"
              >
                {allCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Semua Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin Naskah Utuh</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* ── TWO COLUMN WORKSPACE GRID ────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* ── B. INPUT BRIEF PANEL (COL-SPAN-5) ───────────────────── */}
          <div className="lg:col-span-5 bg-[#1E293B]/70 border border-slate-700/80 rounded-3xl p-6 md:p-7 space-y-6 backdrop-blur-md shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Layers className="w-4 h-4 text-fuchsia-400" />
                <span>Formulir Parameter Produk</span>
              </div>
              <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">
                PROMPT ENGINE
              </span>
            </div>

            <form onSubmit={handleGenerate} className="space-y-5 text-xs">
              {/* Nama Produk */}
              <div className="space-y-1.5">
                <label className="block text-slate-200 font-semibold">
                  Nama Produk <span className="text-fuchsia-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.product_name}
                  onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                  placeholder="e.g., Serum Brightening Niacinamide"
                  className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500/40 transition text-xs font-medium"
                />
              </div>

              {/* Kategori Produk */}
              <div className="space-y-1.5">
                <label className="block text-slate-200 font-semibold">Kategori Produk</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-fuchsia-500 transition text-xs font-medium"
                >
                  <option value="Skincare">Skincare & Kecantikan</option>
                  <option value="Fashion">Fashion & Aksesoris</option>
                  <option value="Gadget">Gadget & Setup Kerja</option>
                  <option value="Makanan">Makanan & Minuman Viral</option>
                  <option value="Jasa/Digital">Produk Digital & Kursus</option>
                  <option value="Home & Living">Perlengkapan Rumah Tangga</option>
                </select>
              </div>

              {/* Target Persona / Masalah Utama (Pain Point) */}
              <div className="space-y-1.5">
                <label className="block text-slate-200 font-semibold">
                  Target Persona & Masalah Utama (Pain Point) <span className="text-fuchsia-400">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={formData.pain_point}
                  onChange={(e) => setFormData({ ...formData, pain_point: e.target.value })}
                  placeholder="Jelaskan keresahan target pembeli (e.g., Kulit kusam dan noda hitam membandel yang bikin gak pede)..."
                  className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500/40 transition text-xs font-medium resize-none leading-relaxed"
                />
              </div>

              {/* Angle Hook Formula */}
              <div className="space-y-1.5">
                <label className="block text-slate-200 font-semibold">Angle Hook Formula</label>
                <select
                  value={formData.hook_angle}
                  onChange={(e) => setFormData({ ...formData, hook_angle: e.target.value })}
                  className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-fuchsia-500 transition text-xs font-medium"
                >
                  <option value="Stop-Scroll Hook (Patahkan Mitos / Kontroversi)">
                    Stop-Scroll Hook (Patahkan Mitos / Kontroversi)
                  </option>
                  <option value="Problem-Agitation-Solution (Curhat Masalah)">
                    Problem-Agitation-Solution (Curhat Masalah)
                  </option>
                  <option value="Before-After & Visual Proof (Demonstrasi Nyata)">
                    Before-After & Visual Proof (Demonstrasi Nyata)
                  </option>
                  <option value="Unboxing & First Impression Jujur">
                    Unboxing & First Impression Jujur
                  </option>
                </select>
              </div>

              {/* Tone of Voice & CTA Goal Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <label className="block text-slate-200 font-semibold">Tone of Voice</label>
                  <select
                    value={formData.tone}
                    onChange={(e) => setFormData({ ...formData, tone: e.target.value })}
                    className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 focus:outline-none focus:border-fuchsia-500 transition text-xs font-medium"
                  >
                    <option value="Casual Gaul">Casual Gaul</option>
                    <option value="Emosional / Curhat">Emosional / Curhat</option>
                    <option value="Review Jujur Pakar">Review Jujur Pakar</option>
                    <option value="Humoris & Energik">Humoris & Energik</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-slate-200 font-semibold">Goal Call-to-Action</label>
                  <select
                    value={formData.cta_goal}
                    onChange={(e) => setFormData({ ...formData, cta_goal: e.target.value })}
                    className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 focus:outline-none focus:border-fuchsia-500 transition text-xs font-medium"
                  >
                    <option value="Checkout Keranjang Kuning / Orange">
                      Keranjang Kuning / Orange
                    </option>
                    <option value="Klik Link di Bio">Klik Link di Bio</option>
                    <option value="Konsultasi / WA Admin">Konsultasi / WA Admin</option>
                  </select>
                </div>
              </div>

              {/* Tombol Utama Generator */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 py-3.5 rounded-2xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 text-white font-extrabold text-sm transition-all shadow-xl shadow-fuchsia-600/25 flex items-center justify-center gap-2.5 cursor-pointer disabled:cursor-not-allowed active:scale-98"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Meracik 9-Scene Storyboard...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Generate 9-Scene Storyboard</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* ── C. INTERACTIVE 9-SCENE STORYBOARD DISPLAY (COL-SPAN-7) ── */}
          <div className="lg:col-span-7 space-y-4">
            {result ? (
              <div className="space-y-4 animate-in fade-in duration-300">
                {/* Result Control Bar */}
                <div className="bg-[#1E293B]/70 border border-slate-700/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 backdrop-blur-md">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-400 block font-mono">
                      HASIL GENERASI RESMI
                    </span>
                    <h3 className="text-sm font-black text-white mt-0.5">
                      {result.product_name} <span className="text-slate-400 font-normal">({result.category})</span>
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={downloadScriptTxt}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-600 text-xs font-semibold text-slate-300 hover:text-white transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-400" />
                      <span>Unduh .TXT</span>
                    </button>
                    <button
                      onClick={copyFullScript}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition flex items-center gap-1.5 cursor-pointer border border-slate-600"
                    >
                      {allCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Tersalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Script</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* The 9 Scene Cards */}
                <div className="space-y-3.5">
                  {result.scenes.map((scene) => (
                    <div
                      key={scene.scene_number}
                      className="p-5 rounded-2xl bg-[#1E293B]/70 border border-slate-700/70 hover:border-fuchsia-500/50 transition-all duration-200 space-y-3 shadow-lg relative group"
                    >
                      {/* Scene Header */}
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/30 text-fuchsia-300 font-black text-xs flex items-center justify-center">
                            {scene.scene_number}
                          </span>
                          <span className="text-xs font-bold text-white">
                            Scene {scene.scene_number}: {scene.stage_name}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-mono text-purple-300">
                            {scene.time_range}
                          </span>
                        </div>

                        <button
                          onClick={() => copyToClipboard(scene.voiceover, scene.scene_number)}
                          className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 hover:border-slate-700 text-[11px] font-medium text-slate-400 hover:text-white transition flex items-center gap-1 cursor-pointer"
                        >
                          {copiedIndex === scene.scene_number ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">VO Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy VO</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Visual Direction */}
                      <div className="text-xs space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <Camera className="w-3 h-3 text-purple-400" />
                          <span>Arahan Visual & Kamera:</span>
                        </span>
                        <p className="text-slate-300 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60 leading-relaxed font-sans">
                          {scene.visual_direction}
                        </p>
                      </div>

                      {/* On-Screen Text */}
                      <div className="text-xs space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90 flex items-center gap-1">
                          <Type className="w-3 h-3 text-amber-400" />
                          <span>Teks Layar / Sticker Hook:</span>
                        </span>
                        <p className="text-amber-200 font-semibold bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20 leading-relaxed font-mono">
                          "{scene.on_screen_text}"
                        </p>
                      </div>

                      {/* Voiceover Script */}
                      <div className="text-xs space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-400 flex items-center gap-1">
                          <Mic className="w-3 h-3 text-fuchsia-400" />
                          <span>Voiceover Script (Naskah Pembicara):</span>
                        </span>
                        <p className="text-white bg-[#0B0F17] p-3 rounded-xl border border-slate-800 leading-relaxed font-medium">
                          "{scene.voiceover}"
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Empty Placeholder State */
              <div className="border-2 border-dashed border-slate-800 rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-4 bg-[#1E293B]/20">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-fuchsia-500/20 to-purple-600/20 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400 shadow-xl shadow-fuchsia-500/10">
                  <Film className="w-8 h-8" />
                </div>
                <div className="space-y-1.5 max-w-md">
                  <h3 className="text-base font-bold text-white">
                    Storyboard 9-Scene Belum Dibuat
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Masukkan detail produk dan pilih formula hook pada panel sebelah kiri. Sistem akan langsung meracik 9 kartu scene terstruktur siap rekam dalam hitungan detik.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-[11px] text-slate-500">
                  <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
                    ⏱️ 30-45 Detik
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
                    🎯 Direct Response Hook
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
                    💾 Simpan ke Database
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── DRAFTS HISTORY MODAL ─────────────────────────────────── */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#1E293B] border border-slate-700 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-bold text-white">Riwayat Draf Naskah Studio</h3>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1"
              >
                Tutup ✕
              </button>
            </div>

            {loadingHistory ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Memuat riwayat draf naskah...
              </div>
            ) : savedScripts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 space-y-2">
                <FolderOpen className="w-8 h-8 mx-auto text-slate-600" />
                <p>Belum ada naskah tersimpan di workspace ini.</p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1">
                {savedScripts.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => loadPastScript(item)}
                    className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-fuchsia-500/50 hover:bg-slate-800/80 transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-white group-hover:text-fuchsia-300 transition-colors">
                        {item.product_name}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {item.brief?.category || 'Umum'} • {item.brief?.hook_angle || 'Direct Response'}
                      </p>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(item.created_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-fuchsia-400 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                      <span>Muat Draf</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
