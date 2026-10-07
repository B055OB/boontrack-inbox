'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  Sparkles,
  Maximize2,
  LayoutGrid,
  Images
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
        if (item.trim()) list.push({ url: item.trim(), title: '', category: 'Media' });
      } else if (item && typeof item === 'object' && item.url && item.url.trim()) {
        list.push({
          url: item.url.trim(),
          title: item.title || '',
          category: item.category || 'Galeri',
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
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'carousel' | 'grid'>('carousel');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Swipe handling
  const touchStartXRef = useRef<number | null>(null);
  const touchDeltaXRef = useRef<number>(0);

  const filteredItems = useMemo(() => {
    if (activeCategory === 'Semua') return normalizedItems;
    return normalizedItems.filter((it) => it.category === activeCategory);
  }, [normalizedItems, activeCategory]);

  // Reset slide index if filtered items change
  useEffect(() => {
    setCurrentSlide(0);
  }, [activeCategory]);

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

  const nextSlide = useCallback(() => {
    if (filteredItems.length === 0) return;
    setCurrentSlide((prev) => (prev + 1) % filteredItems.length);
  }, [filteredItems.length]);

  const prevSlide = useCallback(() => {
    if (filteredItems.length === 0) return;
    setCurrentSlide((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
  }, [filteredItems.length]);

  // Mobile Touch Gestures for Carousel
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchDeltaXRef.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartXRef.current !== null) {
      touchDeltaXRef.current = e.touches[0].clientX - touchStartXRef.current;
    }
  };

  const handleTouchEnd = () => {
    if (touchStartXRef.current !== null) {
      if (touchDeltaXRef.current < -40) {
        // Swiped left -> next
        nextSlide();
      } else if (touchDeltaXRef.current > 40) {
        // Swiped right -> prev
        prevSlide();
      }
      touchStartXRef.current = null;
      touchDeltaXRef.current = 0;
    }
  };

  // Lightbox navigation
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
  const activeSlideItem = filteredItems[currentSlide] || filteredItems[0];

  return (
    <section className={`bg-gradient-to-b from-slate-50 to-white border border-slate-200/90 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-blue-600 mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{title || '📸 Galeri Foto & Pilihan Varian'}</span>
          </div>
          <h2 className="text-base sm:text-lg font-black text-slate-900 leading-snug">
            {subtitle || (productName ? `Foto Detail & Varian ${productName}` : 'Galeri Foto Produk')}
          </h2>
        </div>

        {/* View Mode Toggle & Zoom hint */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {filteredItems.length > 1 && (
            <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => setViewMode('carousel')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  viewMode === 'carousel'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Tampilan Slideshow Carousel"
              >
                <Images className="w-3.5 h-3.5" />
                <span>Slider</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Tampilan Grid Galeri"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Grid</span>
              </button>
            </div>
          )}
          <div className="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-full hidden sm:block shadow-2xs">
            🔍 Ketuk gambar untuk zoom & perbesar
          </div>
        </div>
      </div>

      {/* Category Filter Tabs */}
      {categories.length > 2 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
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

      {/* VIEW MODE 1: CAROUSEL / SLIDESHOW (SWIPE-READY ON MOBILE) */}
      {viewMode === 'carousel' && (
        <div className="space-y-3">
          {/* Main Slide Card */}
          <div 
            className="relative aspect-4/3 sm:aspect-16/10 rounded-2xl overflow-hidden bg-slate-900/5 border border-slate-200/90 shadow-xs select-none group touch-pan-y"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {activeSlideItem && (
              <img
                src={activeSlideItem.url}
                alt={activeSlideItem.title || `${productName} - Slide ${currentSlide + 1}`}
                onClick={() => openLightbox(currentSlide)}
                className="w-full h-full object-contain cursor-zoom-in transition-all duration-300"
              />
            )}

            {/* Slide Index Badge */}
            <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
              <span className="bg-black/60 backdrop-blur-md text-white text-[11px] font-black px-2.5 py-1 rounded-full shadow-sm">
                {currentSlide + 1} / {filteredItems.length}
              </span>
              {activeSlideItem?.category && (
                <span className="bg-blue-600/90 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md shadow-sm">
                  {activeSlideItem.category}
                </span>
              )}
            </div>

            {/* Tap to Zoom Hint */}
            <button
              type="button"
              onClick={() => openLightbox(currentSlide)}
              className="absolute top-3 right-3 p-2 rounded-xl bg-black/50 hover:bg-black/70 text-white backdrop-blur-md transition cursor-pointer shadow-sm"
              title="Perbesar gambar"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            {/* Navigation Arrows */}
            {filteredItems.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prevSlide}
                  aria-label="Previous slide"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/90 hover:bg-white text-slate-800 shadow-md border border-slate-200/80 transition-all active:scale-95 cursor-pointer opacity-90 sm:opacity-0 group-hover:opacity-100"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={nextSlide}
                  aria-label="Next slide"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/90 hover:bg-white text-slate-800 shadow-md border border-slate-200/80 transition-all active:scale-95 cursor-pointer opacity-90 sm:opacity-0 group-hover:opacity-100"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            {/* Bottom Caption Overlay */}
            {activeSlideItem?.title && (
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-3 pt-6 text-white text-xs font-bold pointer-events-none truncate">
                {activeSlideItem.title}
              </div>
            )}
          </div>

          {/* Dot Indicators */}
          {filteredItems.length > 1 && (
            <div className="flex items-center justify-center gap-1.5 py-1">
              {filteredItems.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentSlide(idx)}
                  aria-label={`Ke slide ${idx + 1}`}
                  className={`transition-all rounded-full cursor-pointer ${
                    currentSlide === idx
                      ? 'w-6 h-2 bg-blue-600'
                      : 'w-2 h-2 bg-slate-300 hover:bg-slate-400'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Thumbnail Strip */}
          {filteredItems.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
              {filteredItems.map((item, idx) => {
                const isActive = currentSlide === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentSlide(idx)}
                    className={`relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-xl overflow-hidden border-2 transition-all cursor-pointer bg-slate-100 ${
                      isActive
                        ? 'border-blue-600 ring-2 ring-blue-500/30 scale-102 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={item.url}
                      alt={item.title || `Thumbnail ${idx + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: GRID SHOWCASE */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5 pt-1">
          {filteredItems.map((item, idx) => (
            <div
              key={idx}
              onClick={() => openLightbox(idx)}
              className="group relative rounded-2xl overflow-hidden border border-slate-200/90 bg-white shadow-xs hover:shadow-md transition-all duration-300 cursor-pointer flex flex-col"
            >
              <div className="relative aspect-4/5 sm:aspect-square overflow-hidden bg-slate-100 flex items-center justify-center">
                <img
                  src={item.url}
                  alt={item.title || `Media ${idx + 1}`}
                  loading="lazy"
                  className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                />
                {item.category && (
                  <span className="absolute top-2 left-2 text-[10px] font-black uppercase tracking-wider bg-black/65 backdrop-blur-xs text-white px-2 py-0.5 rounded-md">
                    {item.category}
                  </span>
                )}
                <div className="absolute inset-0 bg-blue-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5 backdrop-blur-[2px]">
                  <Maximize2 className="w-4 h-4" />
                  <span>Buka & Zoom</span>
                </div>
              </div>

              <div className="p-2 sm:p-2.5 bg-white text-[11px] leading-tight text-slate-700 font-semibold flex items-center justify-between border-t border-slate-100">
                <span className="truncate pr-1">
                  {item.title || `Foto #${idx + 1}`}
                </span>
                <span className="text-blue-600 shrink-0 font-bold text-[10px]">
                  Lihat ↗
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

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
