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
  RotateCcw
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
    }, 400);
  };

  // Initial matrix generation on first load
  useEffect(() => {
    buildMatrix();
  }, []);

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
      }, 3200);
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan sistem saat batch render.');
      setBatchJobStatus('IDLE');
      setIsDispatching(false);
    }
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
                  Batch Engine
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                Flexible Creative Delivery: 3 Hook x 1 Body x 2 CTA Combinator
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
                  <span className="text-[11px] font-semibold text-slate-400">CTA 2: Checkout Langsung / Diskon Terbatas</span>
                  <input
                    type="text"
                    value={cta2}
                    onChange={e => setCta2(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Generate Matrix Button */}
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
          {/* PANEL 2: VARIATION MATRIX PREVIEW (8 Cols)               */}
          {/* ======================================================== */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Header Preview & Actions */}
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
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold transition"
                >
                  Pilih Semua
                </button>
                <button
                  type="button"
                  onClick={() => toggleSelectAll(false)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs transition"
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
                        className="p-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition"
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

                  {/* Metadata Tag */}
                  <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-white/5 pt-2">
                    <span>Aspect: 9:16 (1080x1920)</span>
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
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Seluruh {selectedVariations.length} video variasi selesai dirender & siap diunduh!</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => alert(`Mengunduh ${selectedVariations.length} variasi MP4...`)}
                        className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition"
                      >
                        Download Batch .ZIP
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
