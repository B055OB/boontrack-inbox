'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  Sparkles,
  Maximize2
} from 'lucide-react';

export interface MediaItem {
  url: string;
  title?: string;
  category?: string;
}

interface ProductMediaShowcaseProps {
  images?: MediaItem[] | string[];
  productName?: string;
  title?: string;
  subtitle?: string;
  className?: string;
}

export default function ProductMediaShowcase({
  images = [],
  productName = 'Produk',
  title,
  subtitle,
  className = '',
}: ProductMediaShowcaseProps) {
  // Normalize items
  const normalizedItems: MediaItem[] = useMemo(() => {
    const list: MediaItem[] = [];
    (images || []).forEach((item) => {
      if (typeof item === 'string') {
        list.push({ url: item, title: '', category: 'Media' });
      } else if (item && typeof item === 'object' && item.url) {
        list.push({
          url: item.url,
          title: item.title || '',
          category: item.category || 'Materi & Bukti',
        });
      }
    });
    return list;
  }, [images]);

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    normalizedItems.forEach((it) => {
      if (it.category) set.add(it.category);
    });
    return ['Semua', ...Array.from(set)];
  }, [normalizedItems]);

  const [activeCategory, setActiveCategory] = useState<string>('Semua');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const filteredItems = useMemo(() => {
    if (activeCategory === 'Semua') return normalizedItems;
    return normalizedItems.filter((it) => it.category === activeCategory);
  }, [normalizedItems, activeCategory]);

  const openLightbox = (index: number) => {
    setSelectedIdx(index);
    setZoomLevel(1);
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    setSelectedIdx(null);
    setZoomLevel(1);
    document.body.style.overflow = '';
  };

  const nextImage = useCallback(() => {
    if (selectedIdx === null || filteredItems.length === 0) return;
    setSelectedIdx((prev) => ((prev ?? 0) + 1) % filteredItems.length);
    setZoomLevel(1);
  }, [selectedIdx, filteredItems.length]);

  const prevImage = useCallback(() => {
    if (selectedIdx === null || filteredItems.length === 0) return;
    setSelectedIdx((prev) => ((prev ?? 0) - 1 + filteredItems.length) % filteredItems.length);
    setZoomLevel(1);
  }, [selectedIdx, filteredItems.length]);

  const zoomIn = () => setZoomLevel((z) => Math.min(3, Number((z + 0.35).toFixed(2))));
  const zoomOut = () => setZoomLevel((z) => Math.max(1, Number((z - 0.35).toFixed(2))));
  const resetZoom = () => setZoomLevel(1);

  // Keyboard navigation
  useEffect(() => {
    if (selectedIdx === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') nextImage();
      if (e.key === 'ArrowLeft') prevImage();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIdx, nextImage, prevImage]);

  if (normalizedItems.length === 0) return null;

  const currentItem = selectedIdx !== null ? filteredItems[selectedIdx] : null;

  return (
    <section className={`bg-gradient-to-b from-slate-50 to-white border border-slate-200/90 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-blue-600 mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{title || 'Dokumentasi Materi & Preview Modul'}</span>
          </div>
          <h2 className="text-base sm:text-lg font-black text-slate-900 leading-snug">
            {subtitle || (productName ? `Galeri Silabus & Preview ${productName}` : 'Galeri Silabus & Preview Modul')}
          </h2>
        </div>
        <div className="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-full self-start sm:self-auto shadow-2xs">
          🔍 Ketuk gambar untuk zoom & baca teks detail
        </div>
      </div>

      {/* Category Filter Tabs */}
      {categories.length > 2 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`text-xs px-3.5 py-1.5 rounded-full font-bold whitespace-nowrap transition cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {/* Media Grid Showcase */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5 pt-1">
        {filteredItems.map((item, idx) => (
          <div
            key={idx}
            onClick={() => openLightbox(idx)}
            className="group relative rounded-2xl overflow-hidden border border-slate-200/90 bg-white shadow-xs hover:shadow-md transition-all duration-300 cursor-pointer flex flex-col"
          >
            {/* Image Thumbnail Container */}
            <div className="relative aspect-4/5 sm:aspect-square overflow-hidden bg-slate-100 flex items-center justify-center">
              <img
                src={item.url}
                alt={item.title || `Media ${idx + 1}`}
                loading="lazy"
                className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
              />
              {/* Category pill */}
              {item.category && (
                <span className="absolute top-2 left-2 text-[10px] font-black uppercase tracking-wider bg-black/65 backdrop-blur-xs text-white px-2 py-0.5 rounded-md">
                  {item.category}
                </span>
              )}
              {/* Hover overlay hint */}
              <div className="absolute inset-0 bg-blue-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5 backdrop-blur-[2px]">
                <Maximize2 className="w-4 h-4" />
                <span>Buka & Zoom</span>
              </div>
            </div>

            {/* Caption */}
            <div className="p-2 sm:p-2.5 bg-white text-[11px] leading-tight text-slate-700 font-semibold flex items-center justify-between border-t border-slate-100">
              <span className="truncate pr-1">
                {item.title || `Bukti/Materi ${idx + 1}`}
              </span>
              <span className="text-blue-600 shrink-0 font-bold text-[10px]">
                Lihat ↗
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* FULLSCREEN LIGHTBOX MODAL */}
      {selectedIdx !== null && currentItem && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-6 animate-fade-in"
          onClick={closeLightbox}
        >
          {/* Top Bar */}
          <div 
            className="flex items-center justify-between text-white w-full max-w-4xl mx-auto z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-black bg-white/20 backdrop-blur px-2.5 py-1 rounded-full">
                {selectedIdx + 1} / {filteredItems.length}
              </span>
              {currentItem.category && (
                <span className="text-xs font-bold text-amber-300 hidden sm:inline-block">
                  • {currentItem.category}
                </span>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={zoomOut}
                disabled={zoomLevel <= 1}
                aria-label="Zoom out"
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white disabled:opacity-40 transition cursor-pointer"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={resetZoom}
                disabled={zoomLevel === 1}
                aria-label="Reset zoom"
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white disabled:opacity-40 transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={zoomLevel >= 3}
                aria-label="Zoom in"
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white disabled:opacity-40 transition cursor-pointer"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={closeLightbox}
                aria-label="Close"
                className="p-2 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white ml-2 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Central Image Viewport with Pan/Zoom */}
          <div 
            className="relative flex-1 flex items-center justify-center overflow-auto my-3 w-full max-w-4xl mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Prev Button */}
            {filteredItems.length > 1 && (
              <button
                type="button"
                onClick={prevImage}
                aria-label="Previous image"
                className="absolute left-2 sm:left-4 z-20 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 transition cursor-pointer"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* Zoomable Image Container */}
            <div 
              className="transition-transform duration-200 ease-out max-h-full flex items-center justify-center"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              <img
                src={currentItem.url}
                alt={currentItem.title || productName}
                className="max-h-[75vh] max-w-[92vw] sm:max-w-3xl object-contain rounded-xl select-none shadow-2xl"
              />
            </div>

            {/* Next Button */}
            {filteredItems.length > 1 && (
              <button
                type="button"
                onClick={nextImage}
                aria-label="Next image"
                className="absolute right-2 sm:right-4 z-20 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 transition cursor-pointer"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Bottom Caption Bar */}
          <div 
            className="w-full max-w-4xl mx-auto bg-black/70 backdrop-blur border border-white/10 rounded-2xl p-3 text-center text-white space-y-1 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs sm:text-sm font-bold text-slate-100">
              {currentItem.title || productName}
            </p>
            <div className="flex items-center justify-center gap-3 text-[11px] text-slate-300">
              <span>Zoom aktif: {Math.round(zoomLevel * 100)}%</span>
              <span>•</span>
              <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                <CheckCircle2 className="w-3 h-3" /> Berkas Asli Beresolusi Tinggi
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
