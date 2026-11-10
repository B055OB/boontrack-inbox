'use client';

import React, { useState } from 'react';
import {
  Download,
  Copy,
  CheckCheck,
  ArrowLeft,
  ArrowRight,
  Layers,
  Sparkles,
  Image as ImageIcon,
  Check,
  RefreshCw,
  Archive,
} from 'lucide-react';
import {
  SlideData,
  exportCarouselZipBundle,
  exportSingleSlidePng,
} from '@/lib/studio-asset-exporter';

interface CarouselVisualCanvasProps {
  slides: SlideData[];
  productName: string;
  productImages: Array<{ name: string; previewUrl: string }>;
  onCopyAllText: () => void;
  isAllTextCopied: boolean;
}

export default function CarouselVisualCanvas({
  slides,
  productName,
  productImages,
  onCopyAllText,
  isAllTextCopied,
}: CarouselVisualCanvasProps) {
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '4:5'>('1:1');
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);
  const [isExportingSingle, setIsExportingSingle] = useState<boolean>(false);
  const [copiedSlideKey, setCopiedSlideKey] = useState<string | null>(null);

  const currentSlide = slides[activeSlideIndex] || slides[0];
  const activeImage =
    productImages.length > 0
      ? productImages[activeSlideIndex % productImages.length]?.previewUrl
      : null;

  // Handle ZIP Export (5 Slides in 1 ZIP)
  const handleExportZip = async () => {
    if (isExportingZip) return;
    setIsExportingZip(true);
    try {
      await exportCarouselZipBundle(slides, {
        ratio: aspectRatio,
        productName,
        productImages,
      });
    } catch (err) {
      console.error('Export zip failed:', err);
      alert('Gagal mengekspor bundle ZIP Carousel. Silakan coba lagi.');
    } finally {
      setIsExportingZip(false);
    }
  };

  // Handle Single Slide PNG Download
  const handleExportSingleSlide = async () => {
    if (isExportingSingle || !currentSlide) return;
    setIsExportingSingle(true);
    try {
      await exportSingleSlidePng(currentSlide, {
        ratio: aspectRatio,
        productName,
        productImageUrl: activeImage || undefined,
        totalSlides: slides.length,
      });
    } catch (err) {
      console.error('Export single slide failed:', err);
      alert('Gagal mengunduh gambar slide.');
    } finally {
      setIsExportingSingle(false);
    }
  };

  // Copy Single Slide Text
  const handleCopySingleSlide = () => {
    if (!currentSlide) return;
    const text = `${currentSlide.title}\n\n${currentSlide.body}\n\n[Arahan Visual: ${currentSlide.visual_notes}]`;
    navigator.clipboard.writeText(text);
    setCopiedSlideKey(`slide-${activeSlideIndex}`);
    setTimeout(() => setCopiedSlideKey(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* ── TOP CONTROLS: RATIO TOGGLE & QUICK ACTIONS ───────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.03] border border-emerald-500/20 p-3.5 rounded-2xl">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-zinc-400">Rasio Kanvas:</span>
          <div className="inline-flex p-1 rounded-xl bg-black/40 border border-white/10 text-xs">
            <button
              type="button"
              onClick={() => setAspectRatio('1:1')}
              className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                aspectRatio === '1:1'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              1:1 (Persegi)
            </button>
            <button
              type="button"
              onClick={() => setAspectRatio('4:5')}
              className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                aspectRatio === '4:5'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              4:5 (Portrait IG)
            </button>
          </div>
        </div>

        {/* Action Buttons Header */}
        <div className="flex items-center gap-2">
          {/* Primary Action Button */}
          <button
            type="button"
            disabled={isExportingZip}
            onClick={handleExportZip}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-lg shadow-emerald-600/25 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isExportingZip ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Membuat Bundle ZIP...</span>
              </>
            ) : (
              <>
                <Archive className="w-3.5 h-3.5" />
                <span>⚡ Ekspor Gambar Carousel (ZIP / 5 PNG)</span>
              </>
            )}
          </button>

          {/* Secondary Action: Salin Teks Carousel */}
          <button
            type="button"
            onClick={onCopyAllText}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-200 hover:text-white font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            {isAllTextCopied ? (
              <>
                <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Tersalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Teks Carousel</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── VISUAL CANVAS MOCKUP (1:1 / 4:5 RATIO) ────────────────── */}
      <div className="flex flex-col items-center">
        <div
          className={`w-full max-w-[440px] sm:max-w-[480px] rounded-3xl overflow-hidden border-2 border-emerald-500/40 shadow-2xl relative transition-all duration-300 flex flex-col justify-between ${
            aspectRatio === '1:1' ? 'aspect-square' : 'aspect-[4/5]'
          } bg-[#0B0F17]`}
          style={{
            backgroundImage: activeImage
              ? `linear-gradient(to bottom, rgba(11, 15, 23, 0.78), rgba(11, 15, 23, 0.94)), url(${activeImage})`
              : 'linear-gradient(135deg, #0B0F17 0%, #111827 50%, #0F172A 100%)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* Subtle Accent Glow */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* 1. Header Canvas Bar */}
          <div className="p-5 sm:p-6 flex items-center justify-between z-10">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[11px] font-black text-white uppercase tracking-wider">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>BOONTRACK STUDIO</span>
            </div>

            <div className="px-2.5 py-1 rounded-full bg-emerald-500/20 backdrop-blur-md border border-emerald-500/40 text-[10px] font-black text-emerald-300 uppercase tracking-widest font-mono">
              SLIDE {currentSlide.slide_number} / {slides.length}
            </div>
          </div>

          {/* 2. Main Visual & Text Overlay */}
          <div className="px-5 sm:px-6 flex-1 flex flex-col justify-center space-y-3 sm:space-y-4 z-10">
            {/* Stage Tag */}
            <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-emerald-400 font-mono">
              {currentSlide.stage_name}
            </span>

            {/* Headline Title */}
            <h3 className="text-lg sm:text-2xl font-black text-white leading-tight drop-shadow-md">
              {currentSlide.title}
            </h3>

            {/* Optional Small Product Thumbnail Card inside canvas */}
            {activeImage && (
              <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-black/50 backdrop-blur-md border border-white/15 my-1">
                <img
                  src={activeImage}
                  alt={productName}
                  className="w-12 h-12 rounded-xl object-cover shrink-0 border border-white/20"
                />
                <div className="overflow-hidden">
                  <span className="text-[10px] text-emerald-400 font-bold block uppercase tracking-wider">
                    Produk Pilihan
                  </span>
                  <p className="text-xs text-white font-extrabold truncate">{productName}</p>
                </div>
              </div>
            )}

            {/* Body / Bullets */}
            <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-zinc-200 leading-relaxed drop-shadow">
              {currentSlide.body.split('\n').map((line, idx) => {
                if (!line.trim()) return null;
                const isBullet =
                  line.startsWith('•') || line.startsWith('✅') || line.startsWith('👉');
                return (
                  <p
                    key={idx}
                    className={
                      isBullet
                        ? 'font-bold text-white flex items-start gap-1.5'
                        : 'text-zinc-300'
                    }
                  >
                    {line}
                  </p>
                );
              })}
            </div>
          </div>

          {/* 3. Footer Canvas Bar: Swipe prompt & Page Dots */}
          <div className="p-5 sm:p-6 z-10">
            <div className="p-2.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-between">
              <span className="text-[11px] font-bold text-zinc-300">
                {currentSlide.slide_number < slides.length
                  ? '👉 Geser ke slide berikutnya'
                  : '🛒 Pesan via link di bio sekarang'}
              </span>

              {/* Dots */}
              <div className="flex items-center gap-1.5">
                {slides.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i === activeSlideIndex
                        ? 'w-5 bg-emerald-400'
                        : 'w-1.5 bg-white/30'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Prev / Next & Download Single Slide Controls */}
        <div className="w-full max-w-[480px] flex items-center justify-between gap-2 mt-4">
          <button
            type="button"
            disabled={activeSlideIndex === 0}
            onClick={() => setActiveSlideIndex((prev) => Math.max(0, prev - 1))}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>

          {/* Single Slide Download Action */}
          <button
            type="button"
            disabled={isExportingSingle}
            onClick={handleExportSingleSlide}
            className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Download slide yang sedang aktif sebagai file PNG resolusi tinggi"
          >
            {isExportingSingle ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Download className="w-3 h-3" />
            )}
            <span>Unduh Slide Ini (PNG)</span>
          </button>

          <button
            type="button"
            onClick={handleCopySingleSlide}
            className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-zinc-300 hover:text-white transition flex items-center gap-1 cursor-pointer"
          >
            {copiedSlideKey === `slide-${activeSlideIndex}` ? (
              <CheckCheck className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            <span>Salin</span>
          </button>

          <button
            type="button"
            disabled={activeSlideIndex === slides.length - 1}
            onClick={() => setActiveSlideIndex((prev) => Math.min(slides.length - 1, prev + 1))}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 cursor-pointer"
          >
            <span>Next</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── INTERACTIVE THUMBNAIL NAVIGATION (SLIDES 1-5) ────────── */}
      <div className="space-y-2 pt-2 border-t border-white/5">
        <label className="text-xs font-bold text-zinc-400 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-emerald-400" />
          <span>Navigasi Slide Carousel (Klik untuk Pindah):</span>
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {slides.map((s, idx) => {
            const isActive = activeSlideIndex === idx;
            const thumbImg =
              productImages.length > 0
                ? productImages[idx % productImages.length]?.previewUrl
                : null;

            return (
              <div
                key={idx}
                onClick={() => setActiveSlideIndex(idx)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[90px] ${
                  isActive
                    ? 'bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-500/20 ring-1 ring-emerald-500'
                    : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/[0.08]'
                }`}
              >
                {/* Background miniature photo */}
                {thumbImg && (
                  <div
                    className="absolute inset-0 opacity-15 bg-cover bg-center pointer-events-none"
                    style={{ backgroundImage: `url(${thumbImg})` }}
                  />
                )}

                <div className="flex items-center justify-between z-10">
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black ${
                      isActive
                        ? 'bg-emerald-500 text-white'
                        : 'bg-white/10 text-zinc-400'
                    }`}
                  >
                    {s.slide_number}
                  </span>
                  <span className="text-[9px] font-mono text-zinc-500 font-bold">
                    Slide {s.slide_number}
                  </span>
                </div>

                <div className="z-10 mt-1">
                  <p
                    className={`text-[11px] font-bold line-clamp-1 ${
                      isActive ? 'text-emerald-300' : 'text-zinc-300'
                    }`}
                  >
                    {s.stage_name}
                  </p>
                  <p className="text-[9px] text-zinc-500 truncate mt-0.5">{s.title}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

