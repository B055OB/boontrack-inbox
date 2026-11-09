'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Smartphone,
  Play,
  Pause,
  RotateCcw,
  Download,
  Copy,
  CheckCheck,
  ShieldCheck,
  Sparkles,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  Music,
  Check,
  RefreshCw,
  Film,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { UgcSceneData, downloadUgcMp4Video } from '@/lib/studio-asset-exporter';

interface UgcVideoPhoneMockupProps {
  scenes: UgcSceneData[];
  productName: string;
  productImages: Array<{ name: string; previewUrl: string }>;
  tenantSlug: string;
  onCopyAllVoiceover: () => void;
  isAllVoiceoverCopied: boolean;
}

export default function UgcVideoPhoneMockup({
  scenes,
  productName,
  productImages,
  tenantSlug,
  onCopyAllVoiceover,
  isAllVoiceoverCopied,
}: UgcVideoPhoneMockupProps) {
  const [activeSceneIndex, setActiveSceneIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [showSafeZone, setShowSafeZone] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Rendering Engine State
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderProgress, setRenderProgress] = useState<number>(0);
  const [renderPhaseMessage, setRenderPhaseMessage] = useState<string>('');
  const [isRendered, setIsRendered] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  const currentScene = scenes[activeSceneIndex] || scenes[0];
  const activeProductImage =
    productImages.length > 0
      ? productImages[activeSceneIndex % productImages.length]?.previewUrl
      : null;

  // Auto-play through 9 scenes when playing
  useEffect(() => {
    if (!isPlaying) {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
      return;
    }

    const durationMs = (currentScene?.duration_sec || 3) * 1000;
    playbackTimerRef.current = setTimeout(() => {
      setActiveSceneIndex((prev) => (prev + 1) % scenes.length);
    }, durationMs);

    return () => {
      if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
    };
  }, [isPlaying, activeSceneIndex, scenes.length, currentScene?.duration_sec]);

  // Execute 0-100% Progressive Rendering
  const handleStartRender = async () => {
    if (isRendering) return;
    setIsRendering(true);
    setRenderProgress(0);
    setIsRendered(false);
    setIsPlaying(false);

    const phases = [
      { progress: 25, msg: '1/4: Menyiapkan kanvas 1080x1920 & Safe Zone TikTok/Reels...' },
      { progress: 50, msg: '2/4: Mensintesis voiceover naskah 9-scene & sinkronisasi audio...' },
      { progress: 75, msg: '3/4: Memproses motion typography, badge penawaran, & transisi...' },
      { progress: 100, msg: '4/4: Finalisasi encoding container MP4 1080p (60fps)...' },
    ];

    for (const phase of phases) {
      setRenderPhaseMessage(phase.msg);
      // Step progress smoothly
      const start = renderProgress;
      const target = phase.progress;
      for (let p = start + 5; p <= target; p += 5) {
        setRenderProgress(p);
        await new Promise((r) => setTimeout(r, 65));
      }
    }

    await new Promise((r) => setTimeout(r, 300));
    setIsRendering(false);
    setIsRendered(true);
    setIsPlaying(true); // Auto-play rendered preview
  };

  // Download Rendered MP4 Asset (Real 1080p Vertical File)
  const handleDownloadMp4 = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadUgcMp4Video(productName, scenes);
    } catch (err) {
      console.error('Download video failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  // Calculate current elapsed seconds for scrubber
  const currentElapsedSec = scenes
    .slice(0, activeSceneIndex)
    .reduce((acc, s) => acc + s.duration_sec, 0);

  return (
    <div className="space-y-6">
      {/* ── TOP CONTROLS & RENDER ACTION BAR ────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.03] border border-fuchsia-500/20 p-3.5 rounded-2xl">
        <div className="flex items-center gap-3">
          {/* Safe Zone Toggle Switch */}
          <button
            type="button"
            onClick={() => setShowSafeZone(!showSafeZone)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              showSafeZone
                ? 'bg-fuchsia-600/30 text-fuchsia-300 border border-fuchsia-500/50'
                : 'bg-white/5 text-zinc-400 hover:text-white border border-white/10'
            }`}
            title="Tampilkan panduan area aman agar teks dan hook tidak tertutup tombol TikTok & Reels"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-fuchsia-400" />
            <span>Panduan Safe Zone (TikTok & Reels)</span>
            <span
              className={`w-2 h-2 rounded-full ${showSafeZone ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`}
            />
          </button>

          {/* Gate G5 Architecture Classification Badge */}
          <div
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-[11px] text-zinc-400"
            title="Dynamic composition (Level 2/3) didefinisikan sebagai backlog pasca-merge"
          >
            <span className="font-mono text-fuchsia-400 font-bold">Level 1:</span>
            <span>Static Demo Video Packaging</span>
          </div>
        </div>

        {/* Primary & Secondary Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Primary Action Button: Render or Download */}
          {!isRendered ? (
            <button
              type="button"
              disabled={isRendering}
              onClick={handleStartRender}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white font-black text-xs shadow-lg shadow-fuchsia-600/25 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isRendering ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Merender Video ({renderProgress}%)...</span>
                </>
              ) : (
                <>
                  <Film className="w-3.5 h-3.5" />
                  <span>⚡ Render Video MP4 (1080p)</span>
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isDownloading}
                onClick={handleDownloadMp4}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg shadow-emerald-600/30 transition flex items-center gap-2 cursor-pointer animate-in fade-in disabled:opacity-50"
              >
                {isDownloading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengunduh MP4...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Video MP4 (1080p)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleStartRender}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white transition cursor-pointer"
                title="Render Ulang Video"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Secondary Action: Salin Naskah Suara */}
          <button
            type="button"
            onClick={onCopyAllVoiceover}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-200 hover:text-white font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            {isAllVoiceoverCopied ? (
              <>
                <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Tersalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Naskah Suara</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── RENDERING PROGRESS BAR NOTIFICATION ─────────────────── */}
      {isRendering && (
        <div className="p-4 rounded-2xl bg-fuchsia-950/40 border border-fuchsia-500/40 space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-fuchsia-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-fuchsia-400 animate-spin" />
              <span>{renderPhaseMessage}</span>
            </span>
            <span className="font-mono font-bold text-white">{renderProgress}%</span>
          </div>

          <div className="w-full h-2 rounded-full bg-black/60 overflow-hidden p-[1px] border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 rounded-full transition-all duration-150"
              style={{ width: `${renderProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* ── SMARTPHONE 9:16 VERTICAL MOCKUP FRAME ──────────────── */}
      <div className="flex flex-col items-center">
        {/* Transparent Staging Mode Indicator Badge (Gate G1 / G5 Compliance) */}
        <div className="mb-3 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 backdrop-blur-md flex items-center gap-2 shadow-lg select-none">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-bold text-amber-300 tracking-wide">
            Preview Sample Vertikal (Mode Demo Staging)
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/60 text-zinc-300 border border-white/10">
            Level 1 Packaging
          </span>
        </div>

        {/* Smartphone Chassis */}
        <div className="relative w-[300px] sm:w-[330px] rounded-[48px] p-3 bg-gradient-to-b from-zinc-700 via-zinc-800 to-zinc-900 border-4 border-zinc-600/80 shadow-2xl shadow-fuchsia-950/30">
          {/* Dynamic Island / Notch */}
          <div className="absolute top-5 left-1/2 -translate-x-1/2 w-24 h-5 bg-black rounded-full z-40 flex items-center justify-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-zinc-900 border border-zinc-800" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-950" />
          </div>

          {/* Inner Screen (9:16 Aspect Ratio) */}
          <div
            className="relative w-full aspect-[9/16] rounded-[38px] overflow-hidden bg-black select-none flex flex-col justify-between"
            style={{
              backgroundImage: activeProductImage
                ? `linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.85) 100%), url(${activeProductImage})`
                : 'linear-gradient(180deg, #180F2A 0%, #0F091A 50%, #000000 100%)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {/* Live Video Player Background (Active when Rendered) */}
            {isRendered && (
              <video
                src="/assets/sample-ugc-1080p.mp4"
                autoPlay
                loop
                playsInline
                muted={isMuted}
                className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none opacity-85"
              />
            )}

            {/* In-Video Transparent Watermark for Demo Staging (Gate G1) */}
            <div className="absolute top-12 left-1/2 -translate-x-1/2 z-25 pointer-events-none px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-amber-400/40 text-[9px] font-bold text-amber-300 tracking-wider uppercase whitespace-nowrap shadow-md">
              ⚡ Preview Sample Vertikal (Mode Demo Staging)
            </div>
            {/* Top Status Bar & FYP Tabs */}
            <div className="pt-7 px-4 flex items-center justify-between text-white text-[11px] font-bold z-20">
              <span className="font-mono text-[10px]">09:41</span>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-zinc-400">Mengikuti</span>
                <span className="text-white border-b-2 border-white pb-0.5">Untuk Anda</span>
              </div>
              <div className="w-4" />
            </div>

            {/* ── SAFE ZONE OVERLAY (TIKTOK & REELS COMPLIANCE) ──── */}
            {showSafeZone && (
              <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between p-3">
                {/* Top Unsafe Header Strip */}
                <div className="h-14 border-b border-dashed border-red-500/40 bg-red-500/10 rounded-t-3xl flex items-center justify-center">
                  <span className="text-[9px] font-mono text-red-300 font-bold bg-black/60 px-2 py-0.5 rounded">
                    Area Header (Tertutup Tab/Search)
                  </span>
                </div>

                {/* Central Verified Safe Zone Box */}
                <div className="flex-1 my-2 mx-1 border-2 border-dashed border-emerald-400/70 bg-emerald-500/[0.04] rounded-2xl flex flex-col items-center justify-center p-2 text-center">
                  <div className="px-2.5 py-1 rounded-full bg-emerald-500/30 backdrop-blur-md border border-emerald-400/50 text-[10px] font-black text-emerald-200 tracking-wider uppercase mb-1">
                    ✓ SAFE ZONE TIKTOK & REELS
                  </div>
                  <span className="text-[9px] text-emerald-300/90 leading-tight max-w-[200px]">
                    Teks hook & wajah talent bebas dari tombol interaksi samping
                  </span>
                </div>

                {/* Bottom Unsafe Strip */}
                <div className="h-28 border-t border-dashed border-red-500/40 bg-red-500/10 rounded-b-3xl flex items-center justify-center">
                  <span className="text-[9px] font-mono text-red-300 font-bold bg-black/60 px-2 py-0.5 rounded">
                    Area Bawah (Tertutup Caption & Audio)
                  </span>
                </div>
              </div>
            )}

            {/* ── CENTER VISUAL CONTENT & HOOK ON-SCREEN TEXT ──── */}
            <div className="px-4 py-2 z-20 flex flex-col items-center justify-center space-y-3 my-auto">
              {/* Scene Badge */}
              <div className="px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-fuchsia-500/40 text-[10px] font-mono font-bold text-fuchsia-300">
                SCENE {currentScene.scene_number}/9 • {currentScene.time_range}
              </div>

              {/* High-Impact Hook / On Screen Text Badge */}
              <div className="p-3 rounded-2xl bg-black/80 backdrop-blur-md border-2 border-yellow-400/80 shadow-2xl text-center max-w-[240px]">
                <p className="text-xs sm:text-sm font-black text-yellow-300 uppercase tracking-tight leading-tight">
                  {currentScene.on_screen_text}
                </p>
              </div>

              {/* Voiceover Subtitle Box */}
              <div className="p-2.5 rounded-xl bg-black/75 backdrop-blur-md border border-white/20 text-center max-w-[250px]">
                <span className="text-[9px] font-bold text-fuchsia-400 uppercase tracking-wider block mb-0.5">
                  Voiceover (Talent):
                </span>
                <p className="text-[11px] text-white italic leading-snug font-sans">
                  "{currentScene.voiceover}"
                </p>
              </div>
            </div>

            {/* ── RIGHT SOCIAL SIDEBAR (TIKTOK/REELS BUTTONS) ───── */}
            <div className="absolute right-2.5 bottom-16 z-20 flex flex-col items-center space-y-3.5">
              {/* Profile Avatar */}
              <div className="relative w-9 h-9 rounded-full bg-gradient-to-tr from-fuchsia-500 to-indigo-600 p-[1px]">
                <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center text-[10px] font-black text-white">
                  BT
                </div>
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[9px] font-bold">
                  +
                </div>
              </div>

              {/* Like */}
              <div className="flex flex-col items-center">
                <Heart className="w-6 h-6 text-white drop-shadow" fill="currentColor" />
                <span className="text-[9px] font-bold text-white mt-0.5">24.5K</span>
              </div>

              {/* Comment */}
              <div className="flex flex-col items-center">
                <MessageCircle className="w-6 h-6 text-white drop-shadow" fill="currentColor" />
                <span className="text-[9px] font-bold text-white mt-0.5">418</span>
              </div>

              {/* Bookmark */}
              <div className="flex flex-col items-center">
                <Bookmark className="w-6 h-6 text-white drop-shadow" fill="currentColor" />
                <span className="text-[9px] font-bold text-white mt-0.5">1.9K</span>
              </div>

              {/* Share */}
              <div className="flex flex-col items-center">
                <Share2 className="w-6 h-6 text-white drop-shadow" />
                <span className="text-[9px] font-bold text-white mt-0.5">852</span>
              </div>

              {/* Rotating Audio Disc */}
              <div className="w-8 h-8 rounded-full bg-zinc-900 border-2 border-white/20 flex items-center justify-center animate-spin duration-3000">
                <Music className="w-3.5 h-3.5 text-fuchsia-400" />
              </div>
            </div>

            {/* ── BOTTOM CAPTION & AUDIO BAR ───────────────────── */}
            <div className="p-4 z-20 space-y-1.5 max-w-[220px]">
              <span className="text-xs font-black text-white drop-shadow">
                @{tenantSlug || 'boontrack.studio'}
              </span>
              <p className="text-[10px] text-zinc-200 line-clamp-2 leading-tight drop-shadow">
                {productName} — Solusi terbukti tanpa ribet! Cek link sekarang 👇 #fyp #edukasi #bisnis #{productName.toLowerCase().replace(/\s+/g, '')}
              </p>
              <div className="flex items-center gap-1.5 text-[9px] text-zinc-300 font-mono">
                <Music className="w-3 h-3 text-fuchsia-400 shrink-0" />
                <span className="truncate">Suara Asli - {productName} Official</span>
              </div>
            </div>

            {/* Video Player Timeline Scrubber Bar */}
            <div className="w-full h-1 bg-white/20 z-20">
              <div
                className="h-full bg-fuchsia-500 transition-all duration-300"
                style={{
                  width: `${((currentElapsedSec + currentScene.duration_sec) / 30) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Playback & Scene Navigation Bar */}
        <div className="w-full max-w-[340px] flex items-center justify-between gap-2 mt-4">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className="px-3.5 py-1.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-fuchsia-600/30"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Play Preview</span>
              </>
            )}
          </button>

          <span className="text-xs font-mono text-zinc-400">
            {currentScene.time_range} (30s)
          </span>

          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition cursor-pointer"
            title={isMuted ? 'Nyalakan Audio' : 'Matikan Audio'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ── 9-SCENE STORYBOARD INTERACTIVE SELECTOR ─────────────── */}
      <div className="space-y-2 pt-2 border-t border-white/5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-zinc-400 flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5 text-fuchsia-400" />
            <span>Pilih Scene untuk Pratinjau Detil (9 Adegan):</span>
          </label>
          <span className="text-[11px] font-mono text-zinc-500">
            Total Durasi: 30 Detik
          </span>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5">
          {scenes.map((sc, idx) => {
            const isActive = activeSceneIndex === idx;
            return (
              <button
                key={sc.scene_number}
                type="button"
                onClick={() => {
                  setActiveSceneIndex(idx);
                  setIsPlaying(false);
                }}
                className={`py-2 px-1 rounded-xl text-center border transition cursor-pointer flex flex-col items-center justify-center ${
                  isActive
                    ? 'bg-fuchsia-600 text-white border-fuchsia-500 shadow-md shadow-fuchsia-600/30 font-bold'
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/[0.08]'
                }`}
              >
                <span className="text-[10px] font-black">S{sc.scene_number}</span>
                <span className="text-[8px] font-mono opacity-80">{sc.duration_sec}s</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

