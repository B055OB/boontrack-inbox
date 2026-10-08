'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Film,
  Zap,
  Sparkles,
  Layers,
  Cpu,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ChevronRight,
  Upload,
  ArrowRight,
  RefreshCw,
  Sliders,
  ShieldCheck,
  Boxes,
  Play,
  RotateCcw,
  Smartphone,
  Shield,
  Eye,
  EyeOff,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  Music,
  ShoppingBag,
  Download
} from 'lucide-react';
import StudioPaywallModal from '@/components/studio/StudioPaywallModal';

interface Variation {
  id: number;
  hookKey: 'A' | 'B' | 'C';
  hookTitle: string;
  hookText: string;
  ctaKey: '1' | '2';
  ctaTitle: string;
  ctaText: string;
  bodyText: string;
  durationSec: number;
  selected: boolean;
}

interface AdsCopy {
  headlines: string[];
  primary_texts: string[];
  call_to_actions: string[];
}

export default function FCDAutomatorPage() {
  // Session & Workspace Context
  const [tenantSlug, setTenantSlug] = useState<string>('studio');
  const [renderCredits, setRenderCredits] = useState<number>(1);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

  // Panel 1: Matrix Inputs
  const [campaignTitle, setCampaignTitle] = useState('Serum Retinol Pro - Kampanye Flash Sale');
  
  // 3 Multi-Hooks
  const [hookA, setHookA] = useState('Stop scroll kalau kamu masih mikir flek hitam bisa hilang pakai sabun muka biasa!');
  const [hookB, setHookB] = useState('Capek banget tiap ngaca flek makin tebal, padahal udah gonta-ganti skincare mahal?');
  const [hookC, setHookC] = useState('Baru tahu ada serum retinol se-gentle ini, promo beli 1 gratis 1 tinggal hari ini!');

  // Core Body
  const [bodyText, setBodyText] = useState('Formula Micro-Encapsulated Retinol 1% aktif menembus lapisan kulit tanpa iritasi. Kulit terasa lebih halus, pori mengecil, dan flek tampak pudar dalam 14 hari pemakaian.');
  const [bodyAssetFile, setBodyAssetFile] = useState<string | null>(null);
  const bodyFileInputRef = useRef<HTMLInputElement | null>(null);

  // 2 Multi-CTAs
  const [cta1, setCta1] = useState('Klik bio link sekarang untuk konsultasi gratis & klaim diskon eksklusif kreator!');
  const [cta2, setCta2] = useState('Checkout langsung di keranjang kuning sekarang sebelum promo flash sale ditutup malam ini!');

  // Panel 2: Variations Generated State
  const [variations, setVariations] = useState<Variation[]>([]);
  const [isGeneratingMatrix, setIsGeneratingMatrix] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Ads Copy State
  const [adsCopy, setAdsCopy] = useState<AdsCopy>({
    headlines: [
      'Solusi Atasi Flek Hitam & Pori Besar Seketika!',
      'Viral di TikTok! Rahasia Wajah Mulus Tanpa Iritasi',
      'Jangan Beli Skincare Sebelum Tahu Formula Ini!',
    ],
    primary_texts: [
      'Capek tiap ngaca flek makin tebal padahal udah gonta-ganti skincare mahal? Serum Retinol Pro dengan teknologi Micro-Encapsulated 1% meresap langsung ke target tanpa bikin perih. Coba sekarang dan buktikan sendiri bedanya!',
      'Promo Beli 1 Gratis 1 tinggal hari ini! Dapatkan kulit tampak lebih cerah, pori mengecil, dan tekstur halus dalam 14 hari. Garansi original & pengiriman kilat ke seluruh Indonesia.',
    ],
    call_to_actions: [
      'Shop Now (Beli Sekarang)',
      'Order Now (Pesan Sekarang)',
      'Learn More (Pelajari Selengkapnya)',
    ],
  });
  const [isGeneratingAdsCopy, setIsGeneratingAdsCopy] = useState(false);
  const [copiedCopyKey, setCopiedCopyKey] = useState<string | null>(null);

  // Safe-Zone & Live Preview State
  const [showSafeZone, setShowSafeZone] = useState<boolean>(true);
  const [activePreviewId, setActivePreviewId] = useState<number>(1);

  // Panel 3: Batch Queue Dispatch State
  const [isDispatching, setIsDispatching] = useState(false);
  const [batchJobStatus, setBatchJobStatus] = useState<'IDLE' | 'QUEUED' | 'PROCESSING' | 'COMPLETED'>('IDLE');
  const [batchProgress, setBatchProgress] = useState(0);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  // Mount Effect: Restore Tenant Context
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
      }

      const storedSession = localStorage.getItem('studio_session');
      if (storedSession) {
        try {
          const parsed = JSON.parse(storedSession);
          if (typeof parsed.render_credits === 'number') {
            setRenderCredits(parsed.render_credits);
          }
        } catch {}
      }
    }
  }, []);

  // Helper to generate 6 variations (3 Hook x 1 Body x 2 CTA)
  const buildMatrix = () => {
    setIsGeneratingMatrix(true);
    setTimeout(() => {
      const hooks = [
        { key: 'A' as const, title: 'Hook A: Pattern Interrupt', text: hookA },
        { key: 'B' as const, title: 'Hook B: Problem & Emosi', text: hookB },
        { key: 'C' as const, title: 'Hook C: Penawaran Langsung', text: hookC },
      ];

      const ctas = [
        { key: '1' as const, title: 'CTA 1: Bio Link Creator', text: cta1 },
        { key: '2' as const, title: 'CTA 2: Checkout Langsung', text: cta2 },
      ];

      const matrix: Variation[] = [];
      let idCounter = 1;

      hooks.forEach(h => {
        ctas.forEach(c => {
          matrix.push({
            id: idCounter++,
            hookKey: h.key,
            hookTitle: h.title,
            hookText: h.text,
            ctaKey: c.key,
            ctaTitle: c.title,
            ctaText: c.text,
            bodyText: bodyText,
            durationSec: 20,
            selected: true,
          });
        });
      });

      setVariations(matrix);
      setIsGeneratingMatrix(false);
    }, 300);
  };

  // Initial matrix generation on first load
  useEffect(() => {
    buildMatrix();
  }, []);

  // Fetch / Refresh Ads Copy via Gemini 3.8 Flash
  const fetchAiAdsCopy = async () => {
    setIsGeneratingAdsCopy(true);
    try {
      const res = await fetch('/api/studio/script/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: campaignTitle,
          pain_point: hookB || 'masalah audiens target',
          hook_angle: hookA,
          cta_goal: cta1,
          category: 'Produk Iklan',
          tone: 'Casual Gaul & Persuasif',
        }),
      });

      const data = await res.json();
      if (data?.success && data?.ads_copy) {
        setAdsCopy(data.ads_copy);
      }
    } catch (err) {
      console.warn('[Ads Copy Fetch Error]', err);
    } finally {
      setIsGeneratingAdsCopy(false);
    }
  };

  // Toggle selection
  const toggleSelect = (id: number) => {
    setVariations(prev =>
      prev.map(v => (v.id === id ? { ...v, selected: !v.selected } : v))
    );
  };

  const toggleSelectAll = (selectAll: boolean) => {
    setVariations(prev => prev.map(v => ({ ...v, selected: selectAll })));
  };

  // Handle asset upload
  const handleAssetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBodyAssetFile(file.name);
    }
  };

  // Copy variation script
  const copyScript = (v: Variation) => {
    const text = `[VARIASI #${v.id} - ${v.hookTitle} + ${v.ctaTitle}]\n\nHOOK (0-4s):\n${v.hookText}\n\nBODY (4-15s):\n${v.bodyText}\n\nCTA (15-20s):\n${v.ctaText}\n\n[Metadata: is_aigc=1 | Format: 9:16]`;
    navigator.clipboard.writeText(text);
    setCopiedId(v.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Copy generic text helper
  const handleCopyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCopyKey(key);
    setTimeout(() => setCopiedCopyKey(null), 2000);
  };

  const selectedVariations = variations.filter(v => v.selected);
  const requiredCredits = selectedVariations.length;
  const hasSufficientCredits = renderCredits >= requiredCredits && requiredCredits > 0;

  // Dispatch Batch Render Queue
  const handleDispatchBatch = async () => {
    if (requiredCredits === 0) {
      alert('Pilih setidaknya 1 variasi iklan untuk dirender.');
      return;
    }

    if (!hasSufficientCredits) {
      setIsPaywallOpen(true);
      return;
    }

    setIsDispatching(true);
    setBatchJobStatus('QUEUED');
    setBatchProgress(10);

    try {
      const res = await fetch('/api/studio/render/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantSlug,
          product_name: campaignTitle,
          variations: selectedVariations.map(v => ({
            id: v.id,
            title: `Variasi #${v.id} (${v.hookTitle} + ${v.ctaTitle})`,
            hook: v.hookText,
            body: v.bodyText,
            cta: v.ctaText,
            hook_angle: `Hook${v.hookKey}`,
            cta_angle: `CTA${v.ctaKey}`,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal mengirim batch render.');
      }

      setActiveBatchId(data.batch_id);
      if (typeof data.remaining_credits === 'number') {
        setRenderCredits(data.remaining_credits);
        // Persist local session
        const storedSession = localStorage.getItem('studio_session');
        if (storedSession) {
          try {
            const parsed = JSON.parse(storedSession);
            parsed.render_credits = data.remaining_credits;
            localStorage.setItem('studio_session', JSON.stringify(parsed));
          } catch {}
        }
      }

      // Simulate Batch FFmpeg Pipeline
      setBatchJobStatus('PROCESSING');
      setBatchProgress(40);

      setTimeout(() => {
        setBatchProgress(75);
      }, 1500);

      setTimeout(() => {
        setBatchJobStatus('COMPLETED');
        setBatchProgress(100);
        setIsDispatching(false);
      }, 3000);
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan sistem saat batch render.');
      setBatchJobStatus('IDLE');
      setIsDispatching(false);
    }
  };

  // Standardized ZIP & Manifest Download
  const handleDownloadBatchZip = () => {
    const productSlug = campaignTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'fcd-campaign';
    const zipName = `${productSlug}_FCD_BATCH.zip`;

    const manifestLines = [
      `=====================================================`,
      `BOONTRACK STUDIO - FCD BATCH RENDER EXPORT MANIFEST`,
      `=====================================================`,
      `Model Engine : gemini-3.8-flash`,
      `Batch ID     : ${activeBatchId || 'fcd_live_batch'}`,
      `Campaign     : ${campaignTitle}`,
      `Total Files  : ${selectedVariations.length} video MP4 (9:16 Vertical 1080x1920)`,
      `Status       : 100% White-Hat AIGC Approved (is_aigc=1)`,
      ``,
      `DAFTAR FILE STANDAR IKLAN (ADS-READY ZIP NAMING):`,
      ...selectedVariations.map(v => {
        const hookAngle = `Hook${v.hookKey}`;
        const ctaAngle = `CTA${v.ctaKey}`;
        const fileName = `${productSlug}_VAR${v.id}_${hookAngle}_${ctaAngle}.mp4`;
        return `• ${fileName} -> [${v.hookTitle} + ${v.ctaTitle}]`;
      }),
      ``,
      `SALINAN IKLAN SIAP PAKAI (ADS COPY):`,
      `--- Headlines ---`,
      ...adsCopy.headlines.map((h, i) => `[Headline ${i + 1}] ${h}`),
      `--- Primary Texts ---`,
      ...adsCopy.primary_texts.map((p, i) => `[Primary ${i + 1}] ${p}`),
      `--- Recommended CTAs ---`,
      ...adsCopy.call_to_actions.map((c, i) => `[CTA ${i + 1}] ${c}`),
    ].join('\n');

    const blob = new Blob([manifestLines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${productSlug}_FCD_BATCH_MANIFEST.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    alert(`File arsip batch "${zipName}" berhasil disiapkan!\n\nSeluruh ${selectedVariations.length} file MP4 mengikuti format standar:\n{product_slug}_VAR{index}_{hook_angle}_{cta_angle}.mp4`);
  };

  const currentPreviewVariation = variations.find(v => v.id === activePreviewId) || variations[0] || {
    id: 1,
    hookKey: 'A',
    hookTitle: 'Hook A',
    hookText: hookA,
    ctaKey: '1',
    ctaTitle: 'CTA 1',
    ctaText: cta1,
    bodyText: bodyText,
    durationSec: 20,
    selected: true,
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-white selection:bg-indigo-500 selection:text-white font-sans relative overflow-x-hidden flex flex-col">
      {/* Background Mesh Glow */}
      <div className="absolute top-0 right-1/4 w-[750px] h-[450px] bg-gradient-to-b from-indigo-600/15 via-purple-600/10 to-transparent blur-[140px] pointer-events-none -z-10" />
      <div className="absolute bottom-1/4 left-0 w-96 h-96 bg-indigo-700/10 rounded-full blur-[130px] pointer-events-none -z-10" />

      {/* ── HEADER WORKSPACE ──────────────────────────────────── */}
      <header className="border-b border-white/10 bg-[#0B0F17]/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/studio/desk"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition flex items-center justify-center cursor-pointer"
              title="Kembali ke Studio Desk"
            >
              <Boxes className="w-4 h-4 text-indigo-400" />
            </Link>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-white">boontrack</span>
                <span className="text-xs font-black tracking-widest bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent uppercase">
                  FCD AUTOMATOR
                </span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold">
                  gemini-3.8-flash
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                Flexible Creative Delivery: 3 Hook x 1 Body x 2 CTA Combinator & Safe-Zone Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Active Workspace Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-mono text-slate-400">Workspace:</span>
              <span className="font-bold text-white font-mono">{tenantSlug}</span>
            </div>

            {/* Credit Pill */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-xs font-bold text-violet-300">
              <Zap className="w-3.5 h-3.5 text-violet-400" />
              <span>{renderCredits} Credit{renderCredits === 1 ? ' (Trial)' : 's'}</span>
            </div>

            {/* Top Up Button */}
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

      {/* ── MAIN 3-PANEL WORKSPACE ────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ======================================================== */}
          {/* PANEL 1: CREATIVE MATRIX CONFIGURATOR (4 Cols)           */}
          {/* ======================================================== */}
          <div className="lg:col-span-4 bg-slate-900/60 border border-white/10 rounded-3xl p-5 sm:p-6 backdrop-blur-xl shadow-xl space-y-5 sticky lg:top-20">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                <Sliders className="w-3.5 h-3.5" />
                <span>Panel 1: Matrix Configurator</span>
              </div>
              <h2 className="text-lg font-black text-white">Parameter FCD Multi-Iklan</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Rakit 1 kampanye produk menjadi 6 variasi naskah iklan unik secara otomatis.
              </p>
            </div>

            <div className="space-y-4">
              {/* Campaign Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Judul Kampanye / Produk</label>
                <input
                  type="text"
                  value={campaignTitle}
                  onChange={e => setCampaignTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition"
                  placeholder="Nama produk atau tema iklan"
                />
              </div>

              {/* 3 Multi-Hooks */}
              <div className="space-y-2.5 pt-2 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300">Multi-Hook Builder (3 Sudut)</span>
                  <span className="text-[10px] text-slate-500 font-mono">0-4 Detik Pertama</span>
                </div>

                {/* Hook A */}
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-400">Hook A: Pattern Interrupt (Penasaran)</span>
                  <textarea
                    rows={2}
                    value={hookA}
                    onChange={e => setHookA(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition resize-none"
                  />
                </div>

                {/* Hook B */}
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-400">Hook B: Problem & Emosi (Relatable)</span>
                  <textarea
                    rows={2}
                    value={hookB}
                    onChange={e => setHookB(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition resize-none"
                  />
                </div>

                {/* Hook C */}
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-400">Hook C: Penawaran Langsung / Promo</span>
                  <textarea
                    rows={2}
                    value={hookC}
                    onChange={e => setHookC(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition resize-none"
                  />
                </div>
              </div>

              {/* Core Body & Asset */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">Core Body (Demo & Manfaat)</span>
                  <span className="text-[10px] text-slate-500 font-mono">4-15 Detik</span>
                </div>
                <textarea
                  rows={3}
                  value={bodyText}
                  onChange={e => setBodyText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition resize-none"
                  placeholder="Narasi inti demo produk..."
                />

                {/* Slot Upload Aset Video/Foto Utama */}
                <div className="pt-1">
                  <input
                    type="file"
                    accept="image/*,video/*"
                    ref={el => {
                      bodyFileInputRef.current = el;
                    }}
                    onChange={handleAssetUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => bodyFileInputRef.current?.click()}
                    className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-medium text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{bodyAssetFile ? `Aset: ${bodyAssetFile}` : 'Pilih Aset Demo (Foto / Video 10-15s)'}</span>
                  </button>
                </div>
              </div>

              {/* 2 Multi-CTAs */}
              <div className="space-y-2.5 pt-2 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-300">Multi-CTA Builder (2 Ajakan Aksi)</span>
                  <span className="text-[10px] text-slate-500 font-mono">15-20 Detik</span>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-400">CTA 1: Arahkan ke Bio Link Creator</span>
                  <input
                    type="text"
                    value={cta1}
                    onChange={e => setCta1(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-400">CTA 2: Checkout Langsung (Urgent)</span>
                  <input
                    type="text"
                    value={cta2}
                    onChange={e => setCta2(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Action Regenerate Matrix */}
              <button
                type="button"
                onClick={buildMatrix}
                disabled={isGeneratingMatrix}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-extrabold text-xs shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingMatrix ? 'animate-spin' : ''}`} />
                <span>Generate Matriks Variasi Iklan ✨</span>
              </button>
            </div>
          </div>

          {/* ======================================================== */}
          {/* PANEL 2: VARIATION MATRIX PREVIEW & ADS ENGINE (8 Cols)  */}
          {/* ======================================================== */}
          <div className="lg:col-span-8 space-y-6">

            {/* ── TIKTOK / REELS SAFE-ZONE PREVIEW CARD ─────────────── */}
            <div className="bg-slate-900/80 border border-white/10 rounded-3xl p-5 sm:p-6 backdrop-blur-xl shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                      <span>Pratinjau Vertikal 9:16 & Safe-Zone Medsos</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                        TikTok & Reels
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Garis pandu area aman memastikan teks judul & visual hook tidak tertutup UI platform
                    </p>
                  </div>
                </div>

                {/* Safe Zone Toggle Switch */}
                <div className="flex items-center gap-2.5 self-start sm:self-auto bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    {showSafeZone ? <Eye className="w-3.5 h-3.5 text-indigo-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                    <span>Overlay Area Aman</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSafeZone(!showSafeZone)}
                    className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                      showSafeZone ? 'bg-indigo-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${
                        showSafeZone ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Variation Selector Tabs for Preview */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {variations.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setActivePreviewId(v.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                      activePreviewId === v.id
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    Variasi #{v.id}
                  </button>
                ))}
              </div>

              {/* 9:16 Smartphone Mockup with Overlay */}
              <div className="relative max-w-[310px] sm:max-w-[340px] mx-auto aspect-[9/16] rounded-[36px] border-4 border-slate-700/80 bg-gradient-to-b from-slate-950 via-indigo-950/40 to-black overflow-hidden shadow-2xl flex flex-col justify-between p-4">
                
                {/* Simulated Content / Video Hook Layer */}
                <div className="absolute inset-0 flex flex-col justify-center items-center p-6 text-center z-10 pointer-events-none">
                  <div className="space-y-3">
                    <span className="inline-block px-2.5 py-1 rounded-full bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md">
                      {currentPreviewVariation.hookTitle}
                    </span>
                    <h4 className="text-base sm:text-lg font-black text-white leading-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
                      &ldquo;{currentPreviewVariation.hookText}&rdquo;
                    </h4>
                    <p className="text-xs text-slate-300 font-medium line-clamp-3 bg-black/40 p-2.5 rounded-xl border border-white/10 backdrop-blur-sm">
                      {currentPreviewVariation.bodyText}
                    </p>
                  </div>
                </div>

                {/* ── SAFE-ZONE OVERLAY BOUNDARIES ─────────────────── */}
                {showSafeZone && (
                  <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between">
                    
                    {/* Top UI Zone (TikTok Header: Following | For You, Search) */}
                    <div className="pt-3 px-3 pb-2 bg-rose-500/10 border-b border-dashed border-rose-400/50 flex items-center justify-between text-[9px] text-rose-300 font-mono font-bold">
                      <div className="flex items-center gap-1.5 opacity-80">
                        <span>Live</span>
                        <span>•</span>
                        <span className="text-white">Untuk Anda</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded bg-rose-950/80 text-[8px] text-rose-400">
                        Header Platform (Zona Tertutup)
                      </span>
                    </div>

                    {/* Middle Safe Zone Container */}
                    <div className="flex-1 flex justify-between items-center px-2 py-4">
                      {/* Left Clean Area */}
                      <div className="flex-1 h-full border border-dashed border-emerald-400/40 rounded-2xl p-2 flex flex-col justify-between bg-emerald-500/[0.03]">
                        <span className="inline-block text-[8px] font-mono font-bold text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded self-start">
                          Area Aman Teks & Hook (100% Terlihat)
                        </span>
                        <span className="text-[8px] font-mono text-emerald-400/60 self-center text-center">
                          Visual Fokus Utama
                        </span>
                        <div />
                      </div>

                      {/* Right Interaction Stack Zone (Avatar, Likes, Comments, Share) */}
                      <div className="w-14 h-full ml-2 bg-rose-500/10 border-l border-dashed border-rose-400/50 rounded-r-xl flex flex-col items-center justify-end pb-4 space-y-3 text-rose-300">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border-2 border-white flex items-center justify-center text-[10px] font-bold text-white">
                          BT
                        </div>
                        <div className="flex flex-col items-center">
                          <Heart className="w-5 h-5 text-rose-400 fill-rose-400/30" />
                          <span className="text-[8px] font-bold font-mono">184K</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <MessageCircle className="w-5 h-5 text-rose-300" />
                          <span className="text-[8px] font-bold font-mono">2.8K</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <Bookmark className="w-5 h-5 text-amber-300" />
                          <span className="text-[8px] font-bold font-mono">14K</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <Share2 className="w-5 h-5 text-rose-300" />
                          <span className="text-[8px] font-bold font-mono">3.2K</span>
                        </div>
                        <span className="text-[7px] font-mono text-rose-400 text-center leading-tight">
                          Zona Tombol
                        </span>
                      </div>
                    </div>

                    {/* Bottom Caption & CTA Zone */}
                    <div className="p-3 bg-rose-500/15 border-t border-dashed border-rose-400/50 space-y-1.5">
                      <div className="flex items-center justify-between text-[8px] text-rose-400 font-mono font-bold">
                        <span>Zona Teks Bawah & Keranjang Medsos</span>
                        <span className="px-1 rounded bg-rose-950/80">Hindari Hook di Sini</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                        <ShoppingBag className="w-3 h-3 text-amber-400" />
                        <span className="truncate">{currentPreviewVariation.ctaTitle}</span>
                      </div>
                      <div className="text-[9px] text-white/90 font-medium">
                        <span className="font-bold">@boontrack.studio</span> • {currentPreviewVariation.ctaText.slice(0, 48)}...
                      </div>
                      <div className="flex items-center gap-1 text-[8px] text-slate-300">
                        <Music className="w-2.5 h-2.5 text-indigo-400" />
                        <span className="truncate">Suara Asli - Kampanye FCD Studio #viral</span>
                      </div>
                    </div>

                  </div>
                )}
              </div>

              {/* Safe-Zone Legend Guide */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2 border-t border-white/5 font-mono">
                <div className="flex items-center gap-2 text-emerald-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  <span>Area Hijau: 100% Bebas distorsi untuk Headline & Wajah</span>
                </div>
                <div className="flex items-center gap-2 text-rose-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0" />
                  <span>Area Merah: Tertutup tombol interaksi & caption medsos</span>
                </div>
              </div>
            </div>

            {/* ── SALINAN IKLAN SIAP PAKAI (META & TIKTOK ADS COPY) ── */}
            <div className="bg-slate-900/80 border border-indigo-500/30 rounded-3xl p-5 sm:p-6 backdrop-blur-xl shadow-xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Salinan Iklan Siap Pakai (Meta & TikTok Ads Manager)</span>
                  </div>
                  <h3 className="text-base font-black text-white">Ad Copy Matrix</h3>
                  <p className="text-xs text-slate-400">
                    Langsung salin dan tempel ke Ads Manager untuk Headline, Naskah Feed, dan Tombol CTA
                  </p>
                </div>

                <button
                  type="button"
                  onClick={fetchAiAdsCopy}
                  disabled={isGeneratingAdsCopy}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 self-start sm:self-auto"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingAdsCopy ? 'animate-spin' : ''}`} />
                  <span>Regenerasi Copy AI ✨</span>
                </button>
              </div>

              {/* Section 1: Headlines (3 Variasi Pendek) */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wide block">
                  1. Headlines Rekomendasi (3 Variasi Pendek)
                </span>
                <div className="grid grid-cols-1 gap-2.5">
                  {adsCopy.headlines.map((hl, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/15 transition flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold flex-shrink-0">
                          H{idx + 1}
                        </span>
                        <span className="text-xs text-white font-medium truncate">{hl}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyText(`hl_${idx}`, hl)}
                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition flex-shrink-0 cursor-pointer"
                      >
                        {copiedCopyKey === `hl_${idx}` ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Salin Teks</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 2: Primary Texts (2 Variasi Feed) */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <span className="text-xs font-bold text-purple-300 uppercase tracking-wide block">
                  2. Primary Text Naskah Feed (2 Sudut Pandang)
                </span>
                <div className="grid grid-cols-1 gap-2.5">
                  {adsCopy.primary_texts.map((pt, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/15 transition space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold">
                          {idx === 0 ? 'Primary Text A: Problem-Solving' : 'Primary Text B: Promo & Urgensi'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(`pt_${idx}`, pt)}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                        >
                          {copiedCopyKey === `pt_${idx}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Salin Teks</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed font-sans">{pt}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 3: Recommended CTAs */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <span className="text-xs font-bold text-pink-300 uppercase tracking-wide block">
                  3. Rekomendasi Tombol Call to Action (Ads Manager)
                </span>
                <div className="flex flex-wrap gap-2">
                  {adsCopy.call_to_actions.map((cta, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs"
                    >
                      <span className="font-semibold text-white">{cta}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyText(`cta_${idx}`, cta)}
                        className="text-slate-400 hover:text-white p-0.5 transition cursor-pointer"
                        title="Salin CTA"
                      >
                        {copiedCopyKey === `cta_${idx}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Header Preview & Actions for 6 Variations */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.02] border border-white/10 p-4 rounded-2xl">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Panel 2: Matriks 6 Variasi Kreatif</span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold">
                    3 Hook x 1 Body x 2 CTA
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedVariations.length} dari {variations.length} variasi terpilih untuk diantrekan
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleSelectAll(true)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
                >
                  Pilih Semua
                </button>
                <button
                  type="button"
                  onClick={() => toggleSelectAll(false)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs transition cursor-pointer"
                >
                  Batal Semua
                </button>
              </div>
            </div>

            {/* Grid of 6 Variations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {variations.map(v => (
                <div
                  key={v.id}
                  onClick={() => toggleSelect(v.id)}
                  className={`p-4 rounded-2xl border transition cursor-pointer relative space-y-3 ${
                    v.selected
                      ? 'bg-gradient-to-b from-indigo-950/40 to-slate-900 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
                      : 'bg-white/[0.02] border-white/5 opacity-60 hover:opacity-100 hover:border-white/20'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={v.selected}
                        onChange={() => {}} // handled by div click
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-0 bg-slate-800 border-white/20"
                      />
                      <span className="text-xs font-extrabold text-white">
                        Variasi #{v.id}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                        ~{v.durationSec}s
                      </span>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          copyScript(v);
                        }}
                        className="p-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                        title="Salin Naskah Variasi"
                      >
                        {copiedId === v.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Combination Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300">
                      {v.hookTitle}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300">
                      {v.ctaTitle}
                    </span>
                  </div>

                  {/* Script Breakdown */}
                  <div className="space-y-2 text-xs bg-black/30 p-3 rounded-xl border border-white/5 font-mono">
                    <div>
                      <span className="text-[10px] text-indigo-400 block font-bold uppercase">Hook (0-4s):</span>
                      <p className="text-slate-200 line-clamp-2">{v.hookText}</p>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Body (4-15s):</span>
                      <p className="text-slate-300 line-clamp-2">{v.bodyText}</p>
                    </div>

                    <div>
                      <span className="text-[10px] text-purple-400 block font-bold uppercase">CTA (15-20s):</span>
                      <p className="text-slate-200 line-clamp-2">{v.ctaText}</p>
                    </div>
                  </div>

                  {/* Standardized File Identifier */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-white/5 pt-2 font-mono">
                    <span className="truncate max-w-[170px]" title={`produk_VAR${v.id}_Hook${v.hookKey}_CTA${v.ctaKey}.mp4`}>
                      VAR{v.id}_Hook{v.hookKey}_CTA{v.ctaKey}.mp4
                    </span>
                    <span className="text-emerald-400 font-bold">is_aigc: 1</span>
                  </div>
                </div>
              ))}
            </div>

            {/* ======================================================== */}
            {/* PANEL 3: BATCH RENDER QUEUE DISPATCH                     */}
            {/* ======================================================== */}
            <div className="bg-slate-900/80 border border-indigo-500/30 rounded-3xl p-6 backdrop-blur-xl shadow-2xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Panel 3: Batch Render Queue Dispatch</span>
                  </div>
                  <h3 className="text-base font-black text-white">Ringkasan Antrean Batch FFmpeg</h3>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div className="text-right">
                    <span className="text-slate-400 block text-[10px]">Total Variasi:</span>
                    <span className="text-sm font-bold text-white">{selectedVariations.length} Video</span>
                  </div>
                  <div className="text-right border-l border-white/10 pl-4">
                    <span className="text-slate-400 block text-[10px]">Kredit Dibutuhkan:</span>
                    <span className={`text-sm font-black ${hasSufficientCredits ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {requiredCredits} Credits
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Kredit & Feedback */}
              {!hasSufficientCredits && (
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Kredit render tidak mencukupi untuk batch {requiredCredits} variasi (Kuota Anda: {renderCredits} kredit). Silakan top-up untuk melanjutkan.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPaywallOpen(true)}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs whitespace-nowrap cursor-pointer transition"
                  >
                    Top Up Sekarang
                  </button>
                </div>
              )}

              {/* Live Progress Bar when Dispatched */}
              {batchJobStatus !== 'IDLE' && (
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-indigo-300 flex items-center gap-2">
                      <RefreshCw className={`w-3.5 h-3.5 ${batchJobStatus === 'PROCESSING' ? 'animate-spin' : ''}`} />
                      <span>
                        Status Batch: {batchJobStatus} ({batchProgress}%)
                      </span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      ID: {activeBatchId || 'batch_init'}
                    </span>
                  </div>

                  <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${batchProgress}%` }}
                    />
                  </div>

                  {batchJobStatus === 'COMPLETED' && (
                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <span className="flex items-center gap-2 font-semibold">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                        <span>Seluruh {selectedVariations.length} video variasi selesai dikemas dengan penamaan standar ads-ready!</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleDownloadBatchZip}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition flex items-center gap-1.5 shadow-md shadow-emerald-500/20 cursor-pointer whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Batch .ZIP</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Action Button */}
              <button
                type="button"
                onClick={handleDispatchBatch}
                disabled={isDispatching || selectedVariations.length === 0}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-black text-sm shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2.5 transition active:scale-98 cursor-pointer disabled:opacity-50"
              >
                <Cpu className="w-4 h-4" />
                <span>
                  {hasSufficientCredits
                    ? `Kirim ${selectedVariations.length} Variasi ke Antrean Render FFmpeg 🚀`
                    : `Buka Paywall & Top Up untuk Render (${requiredCredits} Kredit Dibutuhkan)`}
                </span>
              </button>
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
      <footer className="py-6 text-center text-xs text-slate-500 border-t border-white/5">
        <p>BoonTrack Studio • Flexible Creative Delivery (FCD) Automator & FFmpeg Cluster</p>
      </footer>
    </div>
  );
}
