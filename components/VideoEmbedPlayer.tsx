'use client';

import React from 'react';

export function getEmbedVideoUrl(url?: string): { type: 'youtube' | 'mp4' | 'iframe'; embedUrl: string } | null {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();

  // 1. Direct MP4 / WebM
  if (trimmed.match(/\.(mp4|webm|ogg)(\?.*)?$/i)) {
    return { type: 'mp4', embedUrl: trimmed };
  }

  // 2. YouTube Shorts: https://(www.)youtube.com/shorts/VIDEO_ID
  const shortsMatch = trimmed.match(/(?:youtube\.com|youtu\.be)\/shorts\/([a-zA-Z0-9_-]+)/i);
  if (shortsMatch && shortsMatch[1]) {
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${shortsMatch[1]}?autoplay=0&rel=0`,
    };
  }

  // 3. YouTube Watch or Embed or youtu.be
  const ytMatch = trimmed.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (ytMatch && ytMatch[1]) {
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&rel=0`,
    };
  }

  // 4. Any other embed link (Vimeo, Loom, etc.)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return {
      type: 'iframe',
      embedUrl: trimmed,
    };
  }

  return null;
}

export default function VideoEmbedPlayer({
  url,
  title = 'Video Produk',
  className = '',
}: {
  url: string;
  title?: string;
  className?: string;
}) {
  const embed = getEmbedVideoUrl(url);
  if (!embed) return null;

  if (embed.type === 'youtube') {
    return (
      <div className={`relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-md border border-slate-200 ${className}`}>
        <iframe
          src={embed.embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      </div>
    );
  }

  if (embed.type === 'mp4') {
    return (
      <div className={`relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-md border border-slate-200 ${className}`}>
        <video
          src={embed.embedUrl}
          controls
          playsInline
          className="w-full h-full object-contain"
        >
          Browser Anda tidak mendukung pemutar video HTML5.
        </video>
      </div>
    );
  }

  return (
    <div className={`relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-md border border-slate-200 ${className}`}>
      <iframe
        src={embed.embedUrl}
        title={title}
        allowFullScreen
        className="absolute inset-0 w-full h-full border-0"
      />
    </div>
  );
}
