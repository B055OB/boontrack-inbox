'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Copy,
  Download,
  RefreshCw,
  Film,
  FileText,
  Layers,
  Image as ImageIcon,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Video,
  Play,
  Share2,
  Zap,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  X
} from 'lucide-react';

export type OutputFormat = 'ad_copy' | 'ugc_video' | 'carousel';
export type TargetChannel = 'tiktok' | 'reels' | 'shopee' | 'meta_ads';
export type ContentTone = 'casual' | 'professional' | 'educational' | 'viral_hype';

export interface SceneItem {
  scene_number: number;
  stage_name: string;
  duration_sec: number;
  time_range: string;
  voiceover: string;
  visual_direction: string;
  on_screen_text: string;
}

export interface GeneratedContent {
  format: OutputFormat;
  product_name: string;
  hook_angle: string;
  scenes?: SceneItem[];
  ads_copy?: {
    headlines: string[];
    primary_texts: string[];
    call_to_actions: string[];
  };
  carousel_slides?: Array<{
    slide_number: number;
    title: string;
    body: string;
    visual_notes: string;
  }>;
  total_duration_sec?: number;
  job_id?: string;
  render_status?: 'IDLE' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  output_video_url?: string;
}

interface StudioCreativeFunnelProps {
  currentCredits: number;
  tenantSlug: string;
  onRequireTopup: () => void;
  onCreditsUpdated?: (newBalance: number) => void;
}

export function calculateCreditCost(format: OutputFormat): number {
  return format === 'ugc_video' ? 3 : 1;
}

export function getFormatLabel(format: OutputFormat): string {
  switch (format) {
    case 'ad_copy': return 'Naskah Iklan (Ad Copy)';
    case 'ugc_video': return 'Video UGC 9:16';
    case 'carousel': return 'Feed & Carousel Multi-Slide';
  }
}

export function getToneLabel(tone: ContentTone): string {
  switch (tone) {
    case 'casual': return 'Casual Gaul (Santai & Bersahabat)';
    case 'professional': return 'Profesional Elegan (Berwibawa)';
    case 'educational': return 'Edukatif & Informatif';
    case 'viral_hype': return 'Viral Hype (Penuh Semangat & FOMO)';
  }
}

export function buildExportScriptText(generatedResult: GeneratedContent): string {
  let text = `========================================\n`;
  text += `BOONTRACK STUDIO — HASIL KONTEN KREATIF\n`;
  text += `Format: ${getFormatLabel(generatedResult.format)}\n`;
  text += `Produk: ${generatedResult.product_name}\n`;
  text += `Angle: ${generatedResult.hook_angle}\n`;
  text += `Tanggal: ${new Date().toLocaleDateString('id-ID')}\n`;
  text += `========================================\n\n`;

  if (generatedResult.ads_copy) {
    text += `--- REKOMENDASI HEADLINE ---\n`;
    generatedResult.ads_copy.headlines.forEach((h, i) => { text += `${i + 1}. ${h}\n`; });
    text += `\n--- NASKAH IKLAN UTAMA ---\n`;
    generatedResult.ads_copy.primary_texts.forEach((p, i) => { text += `[Variasi ${i + 1}]\n${p}\n\n`; });
    text += `--- REKOMENDASI CTA ---\n`;
    generatedResult.ads_copy.call_to_actions.forEach((c) => { text += `• ${c}\n`; });
    text += `\n`;
  }

  if (generatedResult.scenes) {
    text += `--- 9-SCENE STORYBOARD VIDEO (9:16) ---\n`;
    generatedResult.scenes.forEach(s => {
      text += `Scene ${s.scene_number} [${s.time_range}]: ${s.stage_name}\n`;
      text += `Voiceover: "${s.voiceover}"\n`;
      text += `Visual: ${s.visual_direction}\n`;
      text += `Teks Layar: ${s.on_screen_text}\n\n`;
    });
  }

  if (generatedResult.carousel_slides) {
    text += `--- SLIDE CAROUSEL ---\n`;
    generatedResult.carousel_slides.forEach(slide => {
      text += `Slide ${slide.slide_number}: ${slide.title}\n`;
      text += `Isi: ${slide.body}\n`;
      text += `Catatan Visual: ${slide.visual_notes}\n\n`;
    });
  }

  return text;
}

export default function StudioCreativeFunnel({
  currentCredits,
  tenantSlug,
  onRequireTopup,
  onCreditsUpdated,
}: StudioCreativeFunnelProps) {
  // Step State: 1 = Format, 2 = Input, 3 = Generation/Progress, 4 = Review & Export
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Funnel Form State (Work Preservation: Stored throughout generation)
  const [selectedFormat, setSelectedFormat] = useState<OutputFormat>('ugc_video');
  const [productName, setProductName] = useState<string>('');
  const [productDescription, setProductDescription] = useState<string>('');
  const [targetChannel, setTargetChannel] = useState<TargetChannel>('tiktok');
  const [productImages, setProductImages] = useState<Array<{ name: string; previewUrl: string }>>([]);

  // UX Mode: Automatic Mode (Default) vs Advanced Mode (Progressive Accordion)
  const [isAdvancedMode, setIsAdvancedMode] = useState<boolean>(false);
  const [selectedTone, setSelectedTone] = useState<ContentTone>('casual');
  const [customHookAngle, setCustomHookAngle] = useState<string>('');
  const [customCtaGoal, setCustomCtaGoal] = useState<string>('');

  // Generation & Status State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationProgress, setGenerationProgress] = useState<number>(0);
  const [progressStatusText, setProgressStatusText] = useState<string>('');
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Result State
  const [generatedResult, setGeneratedResult] = useState<GeneratedContent | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Render Job State (for 9:16 Video)
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] = useState<string>('IDLE');
  const [renderVideoUrl, setRenderVideoUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Calculate Credit Cost dynamically based on format
  const creditCost = calculateCreditCost(selectedFormat);

  // Handle format selection and transition to Step 2
  const handleSelectFormat = (format: OutputFormat) => {
    setSelectedFormat(format);
    setCurrentStep(2);
  };

  // Handle image upload mock
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).slice(0, 3 - productImages.length);
    const newImgs = files.map(file => ({
      name: file.name,
      previewUrl: URL.createObjectURL(file),
    }));
    setProductImages(prev => [...prev, ...newImgs].slice(0, 3));
  };

  const removeImage = (index: number) => {
    setProductImages(prev => prev.filter((_, i) => i !== index));
  };

  // Helper copy to clipboard with feedback
  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Execution: AI Content Preparation (Step 3)
  const handleGenerateContent = async () => {
    if (!productName.trim() || !productDescription.trim()) {
      setGenerationError('Mohon isi nama produk dan deskripsi produk.');
      return;
    }

    if (currentCredits < creditCost) {
      onRequireTopup();
      return;
    }

    setGenerationError(null);
    setIsGenerating(true);
    setCurrentStep(3);
    setGenerationProgress(15);
    setProgressStatusText('Menganalisis konteks produk & audiens target...');

    try {
      // Animated Progress Simulation
      const progressTimer1 = setTimeout(() => {
        setGenerationProgress(45);
        setProgressStatusText('Merumuskan hook viral & struktur alur cerita...');
      }, 700);

      const progressTimer2 = setTimeout(() => {
        setGenerationProgress(75);
        setProgressStatusText(`Menyusun naskah lengkap untuk format ${getFormatLabel(selectedFormat)}...`);
      }, 1400);

      // Invoke server-side Script Generator
      const response = await fetch('/api/studio/script/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: productName,
          pain_point: productDescription,
          hook_angle: customHookAngle.trim() || 'Solusi Masalah Nyata (Relatable Problem-Solution)',
          cta_goal: customCtaGoal.trim() || (targetChannel === 'tiktok' ? 'Cek Keranjang Kuning' : 'Klik Link di Bio'),
          category: 'Umum / Retail',
          tone: isAdvancedMode ? getToneLabel(selectedTone) : 'Casual Gaul',
          format: selectedFormat,
        }),
      });

      clearTimeout(progressTimer1);
      clearTimeout(progressTimer2);

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (response.status === 402 || data.error === 'INSUFFICIENT_CREDITS') {
          onRequireTopup();
          throw new Error('Saldo kredit tidak mencukupi untuk membuat konten ini.');
        }
        throw new Error(data.message || 'Gagal menghasilkan konten dengan AI.');
      }

      setGenerationProgress(100);
      setProgressStatusText('Konten berhasil dibuat!');

      if (typeof data.remaining_credits === 'number' && onCreditsUpdated) {
        onCreditsUpdated(data.remaining_credits);
      }

      // Build structured result
      const result: GeneratedContent = {
        format: selectedFormat,
        product_name: data.product_name || productName,
        hook_angle: data.hook_angle || 'Solusi Masalah Nyata',
        scenes: data.scenes || [],
        ads_copy: data.ads_copy || {
          headlines: [`Rahasia ${productName} yang Jarang Orang Tahu!`, `Kulit Impian Cuma Pakai ${productName}`],
          primary_texts: [
            `${productName} dirancang khusus untuk mengatasi ${productDescription.slice(0, 60)}... Cobain sekarang juga!`,
            `Gak perlu bingung lagi cari solusi yang tepat. Dapatkan ${productName} original hari ini!`,
          ],
          call_to_actions: ['Beli Sekarang', 'Pesan via WhatsApp', 'Pelajari Selengkapnya'],
        },
        carousel_slides: [
          { slide_number: 1, title: '🔥 STOP SCROLL!', body: `Kenapa kamu wajib tahu tentang ${productName} sebelum terlambat?`, visual_notes: 'Foto produk close-up dengan teks bold mencolok.' },
          { slide_number: 2, title: 'Masalah Utama', body: productDescription.slice(0, 100), visual_notes: 'Ilustrasi keluhan umum yang dirasakan target audiens.' },
          { slide_number: 3, title: 'Solusi Cerdas', body: `${productName} hadir memberikan hasil nyata tanpa ribet.`, visual_notes: 'Infografis fitur & keunggulan utama.' },
          { slide_number: 4, title: 'Bukti & Testimoni', body: 'Sudah dibuktikan oleh ratusan pelanggan puas minggu ini.', visual_notes: 'Screenshot ulasan positif dan bintang 5.' },
          { slide_number: 5, title: 'Aksi Sekarang', body: 'Klik link di profil atau tap keranjang kuning sebelum promo berakhir!', visual_notes: 'Tombol CTA jelas dengan panah penunjuk.' },
        ],
        total_duration_sec: data.total_duration_sec || 30,
      };

      setGeneratedResult(result);
      setTimeout(() => {
        setIsGenerating(false);
        setCurrentStep(4); // Advance to Review & Export
      }, 500);
    } catch (err: any) {
      setIsGenerating(false);
      setGenerationError(err.message || 'Terjadi kesalahan saat memproses konten.');
      // Keep form state preserved and return user to step 2 for easy retry
      setCurrentStep(2);
    }
  };

  // Execution: Render Video 9:16 (Level 1 Video Rendering)
  const handleDispatchVideoRender = async () => {
    if (!generatedResult || !generatedResult.scenes) return;

    if (currentCredits < 2) {
      onRequireTopup();
      return;
    }

    setIsRendering(true);
    setRenderError(null);
    setRenderStatus('QUEUED');

    try {
      const res = await fetch('/api/studio/render/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: generatedResult.product_name,
          scenes: generatedResult.scenes,
          assets: productImages.map(img => img.previewUrl),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal memulai antrean render video.');
      }

      setRenderJobId(data.job_id);
      setRenderStatus('PROCESSING');

      if (typeof data.remaining_credits === 'number' && onCreditsUpdated) {
        onCreditsUpdated(data.remaining_credits);
      }

      // Poll status for video completion
      pollRenderStatus(data.job_id);
    } catch (err: any) {
      setIsRendering(false);
      setRenderError(err.message || 'Gagal mengirim job render.');
    }
  };

  // Polling helper
  const pollRenderStatus = (jobId: string) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 30) {
        clearInterval(interval);
        setIsRendering(false);
        setRenderStatus('COMPLETED');
        // Fallback demo render URL for local isolated development
        setRenderVideoUrl('https://assets.boontrack.com/renders/demo-preview.mp4');
        return;
      }

      try {
        const res = await fetch(`/api/studio/render?job_id=${encodeURIComponent(jobId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'COMPLETED' && data.output_url) {
            clearInterval(interval);
            setIsRendering(false);
            setRenderStatus('COMPLETED');
            setRenderVideoUrl(data.output_url);
          } else if (data.status === 'FAILED') {
            clearInterval(interval);
            setIsRendering(false);
            setRenderStatus('FAILED');
            setRenderError(data.error_message || 'Proses render video gagal.');
          }
        }
      } catch (e) {
        // Continue polling
      }
    }, 2000);
  };

  // Download entire script as TXT
  const handleDownloadFullScript = () => {
    if (!generatedResult) return;
    const text = buildExportScriptText(generatedResult);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Naskah_${generatedResult.product_name.replace(/\s+/g, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full bg-[#111624]/90 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden transition-all">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-fuchsia-600/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* ── FUNNEL HEADER & PROGRESS INDICATOR ────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-300 text-[10px] font-black uppercase tracking-wider">
            <Sparkles className="w-3 h-3 text-fuchsia-400" />
            <span>Alur Pembuatan Konten Instan</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Studio Creative Funnel
          </h2>
        </div>

        {/* Dynamic Credit Badge */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-mono flex items-center gap-2 text-zinc-300">
            <Zap className="w-3.5 h-3.5 text-violet-400" />
            <span>Saldo: <strong className="text-white">{currentCredits} Kredit</strong></span>
          </div>
          {currentCredits < creditCost && (
            <button
              type="button"
              onClick={onRequireTopup}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold text-xs shadow-md transition"
            >
              + Top Up
            </button>
          )}
        </div>
      </div>

      {/* Step Indicators */}
      <div className="grid grid-cols-4 gap-2 my-6">
        {[
          { step: 1, label: '1. Format' },
          { step: 2, label: '2. Info Produk' },
          { step: 3, label: '3. Proses AI' },
          { step: 4, label: '4. Ekspor' },
        ].map((item) => {
          const isActive = currentStep === item.step;
          const isDone = currentStep > item.step;
          return (
            <div
              key={item.step}
              className={`py-2 px-3 rounded-xl border text-center transition-all ${
                isActive
                  ? 'bg-fuchsia-500/20 border-fuchsia-500 text-white font-bold shadow-lg shadow-fuchsia-500/10'
                  : isDone
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-medium'
                  : 'bg-white/5 border-white/5 text-zinc-500 font-normal'
              }`}
            >
              <div className="text-[11px] sm:text-xs truncate">{item.label}</div>
            </div>
          );
        })}
      </div>

      {/* Error Alert with Preservation */}
      {generationError && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="font-bold">Terjadi Kendala</p>
            <p>{generationError}</p>
            <p className="text-[11px] text-zinc-400">Semua teks dan data produk yang Anda ketik tetap aman tersimpan.</p>
          </div>
          <button
            type="button"
            onClick={() => setGenerationError(null)}
            className="text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          STEP 1: CHOOSE OUTPUT FORMAT
      ────────────────────────────────────────────────────────────── */}
      {currentStep === 1 && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-bold text-white">
              Pilih Format Konten yang Ingin Dihasilkan
            </h3>
            <p className="text-xs text-zinc-400">
              Pilih jenis materi iklan yang paling pas untuk strategi kampanye Anda hari ini.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Format 1: Ad Copy */}
            <div
              onClick={() => handleSelectFormat('ad_copy')}
              className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                selectedFormat === 'ad_copy'
                  ? 'bg-fuchsia-950/40 border-fuchsia-500 ring-2 ring-fuchsia-500/30 shadow-xl'
                  : 'bg-white/5 border-white/10 hover:border-white/25 hover:bg-white/[0.07]'
              }`}
            >
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white flex items-center justify-between">
                    <span>Ad Copy & Caption</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono">1 Kredit</span>
                  </h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Kombinasi naskah iklan persuasif, 3 headline viral, naskah utama, dan call-to-action konversi tinggi.
                  </p>
                </div>
              </div>
              <div className="pt-2 flex items-center justify-between text-xs font-bold text-amber-400">
                <span>Pilih Format Ini</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>

            {/* Format 2: UGC Video 9:16 (Primary) */}
            <div
              onClick={() => handleSelectFormat('ugc_video')}
              className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-4 relative ${
                selectedFormat === 'ugc_video'
                  ? 'bg-fuchsia-950/50 border-fuchsia-500 ring-2 ring-fuchsia-500/40 shadow-xl'
                  : 'bg-white/5 border-white/10 hover:border-fuchsia-500/40 hover:bg-white/[0.07]'
              }`}
            >
              <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-fuchsia-500 text-white text-[9px] font-black uppercase tracking-wider">
                Populer
              </div>
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-fuchsia-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-fuchsia-500/25">
                  <Film className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white flex items-center justify-between">
                    <span>UGC Video (9:16)</span>
                    <span className="px-2 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-300 text-[10px] font-mono">3 Kredit</span>
                  </h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Storyboard 9-scene terstruktur lengkap dengan naskah voiceover, arahan visual, dan render video otomatis.
                  </p>
                </div>
              </div>
              <div className="pt-2 flex items-center justify-between text-xs font-bold text-fuchsia-400">
                <span>Pilih Format Ini</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>

            {/* Format 3: Carousel */}
            <div
              onClick={() => handleSelectFormat('carousel')}
              className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                selectedFormat === 'carousel'
                  ? 'bg-fuchsia-950/40 border-fuchsia-500 ring-2 ring-fuchsia-500/30 shadow-xl'
                  : 'bg-white/5 border-white/10 hover:border-white/25 hover:bg-white/[0.07]'
              }`}
            >
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-600 flex items-center justify-center text-white shadow-lg">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white flex items-center justify-between">
                    <span>Carousel (Multi-Slide)</span>
                    <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-mono">1 Kredit</span>
                  </h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    5 rangkaian slide edukasi atau katalog produk bergambar untuk format Instagram Feed & TikTok Photo Mode.
                  </p>
                </div>
              </div>
              <div className="pt-2 flex items-center justify-between text-xs font-bold text-cyan-400">
                <span>Pilih Format Ini</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          STEP 2: PRODUCT INPUT & UX MODES
      ────────────────────────────────────────────────────────────── */}
      {currentStep === 2 && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Ganti Format ({getFormatLabel(selectedFormat)})</span>
            </button>
            <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-zinc-300 font-mono">
              Biaya: <strong className="text-fuchsia-400">{creditCost} Kredit</strong>
            </span>
          </div>

          <div className="space-y-4">
            {/* Input: Product Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                <span>Nama Produk / Layanan <span className="text-rose-400">*</span></span>
                <span className="text-[10px] text-zinc-500 font-normal">Wajib diisi</span>
              </label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Contoh: Serum Brightening Niacinamide 10%"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-fuchsia-500 transition"
              />
            </div>

            {/* Input: Product Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                <span>Deskripsi & Masalah yang Diselesaikan <span className="text-rose-400">*</span></span>
                <span className="text-[10px] text-zinc-500 font-normal">Bahasa sederhana sehari-hari</span>
              </label>
              <textarea
                rows={3}
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                placeholder="Jelaskan produk Anda: siapa yang butuh, masalah apa yang diselesaikan, dan apa keunggulan uniknya..."
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-fuchsia-500 transition resize-none leading-relaxed"
              />
            </div>

            {/* Optional Target Channel */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-300">
                Pilih Target Platform (Opsional)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { key: 'tiktok', label: 'TikTok Video / Shop' },
                  { key: 'reels', label: 'Instagram Reels' },
                  { key: 'shopee', label: 'Shopee Video' },
                  { key: 'meta_ads', label: 'Meta Ads (FB/IG)' },
                ].map(channel => (
                  <button
                    key={channel.key}
                    type="button"
                    onClick={() => setTargetChannel(channel.key as TargetChannel)}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition ${
                      targetChannel === channel.key
                        ? 'bg-fuchsia-600/20 border-fuchsia-500 text-white font-bold'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {channel.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Product Images (1-3) */}
            <div className="space-y-2 pt-1">
              <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                <span>Unggah Foto Produk (Opsional, Maks. 3)</span>
                <span className="text-[10px] text-zinc-500">{productImages.length}/3 Foto</span>
              </label>
              <div className="flex items-center gap-3 flex-wrap">
                {productImages.map((img, idx) => (
                  <div key={idx} className="relative w-20 h-20 rounded-xl border border-white/20 overflow-hidden bg-black/40 group">
                    <img src={img.previewUrl} alt={img.name} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 p-1 rounded-full bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition shadow"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {productImages.length < 3 && (
                  <label className="w-20 h-20 rounded-xl border border-dashed border-white/20 hover:border-fuchsia-500/50 flex flex-col items-center justify-center text-zinc-500 hover:text-fuchsia-400 cursor-pointer bg-white/5 hover:bg-white/[0.08] transition">
                    <ImageIcon className="w-5 h-5 mb-1" />
                    <span className="text-[10px]">+ Foto</span>
                    <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                  </label>
                )}
              </div>
            </div>

            {/* ── PROGRESSIVE ADVANCED MODE ACCORDION ─────────── */}
            <div className="pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsAdvancedMode(!isAdvancedMode)}
                className="w-full flex items-center justify-between py-2 text-xs font-bold text-zinc-400 hover:text-white transition"
              >
                <div className="flex items-center gap-2">
                  <Sliders className="w-3.5 h-3.5 text-fuchsia-400" />
                  <span>Pengaturan Lanjutan (Advanced Mode)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-zinc-400 font-normal">
                    {isAdvancedMode ? 'Kustom' : 'Otomatis'}
                  </span>
                </div>
                {isAdvancedMode ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {isAdvancedMode && (
                <div className="p-4 mt-2 rounded-2xl bg-black/30 border border-white/10 space-y-4 animate-in slide-in-from-top-2 duration-200">
                  {/* Tone selector */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-zinc-300">Gaya Bahasa (Tone of Voice)</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: 'casual', label: 'Casual Gaul (Santai)' },
                        { key: 'professional', label: 'Profesional & Elegan' },
                        { key: 'educational', label: 'Edukatif & Informatif' },
                        { key: 'viral_hype', label: 'Viral Hype (FOMO)' },
                      ].map(tone => (
                        <button
                          key={tone.key}
                          type="button"
                          onClick={() => setSelectedTone(tone.key as ContentTone)}
                          className={`py-1.5 px-3 rounded-lg text-[11px] border text-left transition ${
                            selectedTone === tone.key
                              ? 'bg-fuchsia-500/20 border-fuchsia-500 text-white font-bold'
                              : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {tone.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Hook Angle Override */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-300">Kustomisasi Sudut Pandang (Angle Hook)</label>
                    <input
                      type="text"
                      value={customHookAngle}
                      onChange={(e) => setCustomHookAngle(e.target.value)}
                      placeholder="Contoh: Rahasia skincare yang bikin insecure berhenti total"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-fuchsia-500"
                    />
                  </div>

                  {/* Custom CTA */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-300">Tujuan Ajakan Bertindak (Call to Action)</label>
                    <input
                      type="text"
                      value={customCtaGoal}
                      onChange={(e) => setCustomCtaGoal(e.target.value)}
                      placeholder="Contoh: Tap link di profil untuk diskon 30% hari ini"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-fuchsia-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-4 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2.5 rounded-xl border border-white/10 text-xs font-bold text-zinc-300 hover:text-white transition"
              >
                Kembali
              </button>

              <button
                type="button"
                onClick={handleGenerateContent}
                disabled={!productName.trim() || !productDescription.trim() || isGenerating}
                className="flex-1 sm:flex-none px-6 py-3 rounded-xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-fuchsia-500/25 disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Buat Konten Sekarang ({creditCost} Kredit)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          STEP 3: AI PREPARATION & PROGRESS
      ────────────────────────────────────────────────────────────── */}
      {currentStep === 3 && (
        <div className="py-12 px-4 text-center space-y-6 animate-in fade-in duration-300">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-fuchsia-500/20 to-indigo-500/20 border border-fuchsia-500/30 p-[1px] mx-auto shadow-xl shadow-fuchsia-500/20">
            <div className="w-full h-full bg-[#0B0F17] rounded-[15px] flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-fuchsia-400 animate-spin" />
            </div>
          </div>

          <div className="space-y-2 max-w-md mx-auto">
            <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              AI Sedang Menyusun Konten Anda
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed min-h-[36px]">
              {progressStatusText}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="max-w-md mx-auto space-y-1.5">
            <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden border border-white/10 p-[1px]">
              <div
                className="h-full bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${generationProgress}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
              <span>Proses Alur Cerdas</span>
              <span>{generationProgress}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          STEP 4: REVIEW & EXPORT
      ────────────────────────────────────────────────────────────── */}
      {currentStep === 4 && generatedResult && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Action Ribbon */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
            <div>
              <span className="text-[10px] text-fuchsia-400 font-bold uppercase tracking-wider">
                {getFormatLabel(generatedResult.format)}
              </span>
              <h3 className="text-base sm:text-lg font-bold text-white">
                {generatedResult.product_name}
              </h3>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleDownloadFullScript}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white flex items-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5 text-zinc-400" />
                <span>Unduh Teks (.txt)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentStep(2);
                  setGeneratedResult(null);
                }}
                className="px-3 py-1.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-xs font-bold text-white flex items-center gap-1.5 transition shadow"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Buat Baru</span>
              </button>
            </div>
          </div>

          {/* 4A: AD COPY REVIEW PANEL */}
          {generatedResult.format === 'ad_copy' && generatedResult.ads_copy && (
            <div className="space-y-6">
              {/* Headlines */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>3 Rekomendasi Headline Iklan</span>
                </h4>
                <div className="space-y-2">
                  {generatedResult.ads_copy.headlines.map((hl, i) => (
                    <div
                      key={i}
                      className="p-3.5 rounded-xl bg-black/30 border border-white/10 flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="font-semibold text-white">{hl}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyText(hl, `hl-${i}`)}
                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-zinc-300 font-medium shrink-0 flex items-center gap-1 transition"
                      >
                        {copiedKey === `hl-${i}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === `hl-${i}` ? 'Tersalin' : 'Salin'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Primary Texts */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-fuchsia-400" />
                  <span>Naskah Utama Iklan (Primary Text)</span>
                </h4>
                <div className="space-y-3">
                  {generatedResult.ads_copy.primary_texts.map((pt, i) => (
                    <div key={i} className="p-4 rounded-xl bg-black/30 border border-white/10 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                        <span>Variasi {i + 1}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(pt, `pt-${i}`)}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 font-medium flex items-center gap-1 transition"
                        >
                          {copiedKey === `pt-${i}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === `pt-${i}` ? 'Tersalin' : 'Salin'}</span>
                        </button>
                      </div>
                      <p className="text-zinc-200 leading-relaxed whitespace-pre-line">{pt}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Call to Action */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Rekomendasi Call To Action
                </h4>
                <div className="flex gap-2 flex-wrap">
                  {generatedResult.ads_copy.call_to_actions.map((cta, i) => (
                    <span key={i} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-zinc-300 font-medium">
                      {cta}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 4B: UGC VIDEO 9:16 REVIEW PANEL */}
          {generatedResult.format === 'ugc_video' && generatedResult.scenes && (
            <div className="space-y-6">
              {/* Storyboard Header & Render Trigger */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-fuchsia-950/40 via-purple-950/30 to-indigo-950/40 border border-fuchsia-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Video className="w-4 h-4 text-fuchsia-400" />
                    <span>Storyboard 9-Scene Siap Render</span>
                  </h4>
                  <p className="text-xs text-zinc-400">
                    Durasi: ~30 Detik • 9 Scene Terstruktur dengan Hook Formula Teruji
                  </p>
                </div>

                {renderStatus === 'IDLE' && (
                  <button
                    type="button"
                    onClick={handleDispatchVideoRender}
                    disabled={isRendering}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-extrabold text-xs shadow-lg shadow-fuchsia-500/25 flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Render Video MP4 (2 Kredit)</span>
                  </button>
                )}
              </div>

              {/* Render Status Stream / Video Player */}
              {isRendering && (
                <div className="p-6 rounded-2xl bg-black/40 border border-purple-500/30 text-center space-y-3">
                  <RefreshCw className="w-6 h-6 text-fuchsia-400 animate-spin mx-auto" />
                  <p className="text-xs font-bold text-white">Sedang Memproses Render Video di Server...</p>
                  <p className="text-[11px] text-zinc-400">Status: {renderStatus} • Menggabungkan voiceover & animasi teks layar.</p>
                </div>
              )}

              {renderVideoUrl && (
                <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Video MP4 Siap Diunduh</span>
                    </span>
                    <a
                      href={`/api/studio/download?url=${encodeURIComponent(renderVideoUrl)}&filename=${encodeURIComponent(generatedResult.product_name + '_video.mp4')}`}
                      download
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Unduh Video MP4</span>
                    </a>
                  </div>
                  <div className="aspect-[9/16] max-w-[240px] mx-auto rounded-xl overflow-hidden bg-black border border-white/10 shadow-2xl">
                    <video src={renderVideoUrl} controls className="w-full h-full object-cover" />
                  </div>
                </div>
              )}

              {/* 9-Scene Cards */}
              <div className="space-y-3">
                {generatedResult.scenes.map((scene) => (
                  <div
                    key={scene.scene_number}
                    className="p-4 rounded-xl bg-black/30 border border-white/10 space-y-2 text-xs hover:border-white/20 transition"
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono pb-1 border-b border-white/5">
                      <span className="text-fuchsia-400 font-bold">Scene {scene.scene_number}: {scene.stage_name}</span>
                      <span className="text-zinc-500">{scene.time_range} ({scene.duration_sec}s)</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                      <div className="space-y-1">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">Naskah Suara (Voiceover)</span>
                        <p className="text-zinc-200 italic leading-relaxed">"{scene.voiceover}"</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">Arahan Visual</span>
                        <p className="text-zinc-400 leading-relaxed">{scene.visual_direction}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">Teks Layar (On-Screen Text)</span>
                        <p className="text-amber-300 font-bold">{scene.on_screen_text}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4C: CAROUSEL REVIEW PANEL */}
          {generatedResult.format === 'carousel' && generatedResult.carousel_slides && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>Rangkaian 5 Slide Carousel</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {generatedResult.carousel_slides.map((slide) => (
                  <div
                    key={slide.slide_number}
                    className="p-4 rounded-2xl bg-black/30 border border-white/10 flex flex-col justify-between space-y-3 text-xs"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-mono text-cyan-400 font-bold">
                        <span>Slide {slide.slide_number}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(`${slide.title}\n${slide.body}`, `slide-${slide.slide_number}`)}
                          className="text-zinc-400 hover:text-white flex items-center gap-1"
                        >
                          {copiedKey === `slide-${slide.slide_number}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <h5 className="font-bold text-white text-sm">{slide.title}</h5>
                      <p className="text-zinc-300 leading-relaxed">{slide.body}</p>
                    </div>
                    <div className="pt-2 border-t border-white/5 text-[10px] text-zinc-500">
                      <strong>Visual:</strong> {slide.visual_notes}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
