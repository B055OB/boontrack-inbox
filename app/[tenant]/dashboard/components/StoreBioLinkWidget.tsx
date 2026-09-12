'use client';

import React, { useState } from 'react';
import { Share2, Copy, Check, ExternalLink, Globe } from 'lucide-react';

interface StoreBioLinkWidgetProps {
  tenantSlug: string;
}

export default function StoreBioLinkWidget({ tenantSlug }: StoreBioLinkWidgetProps) {
  const [copied, setCopied] = useState(false);

  if (!tenantSlug) return null;

  const bioShortlink = `https://boontrack.com/${tenantSlug}`;
  const storefrontUrl = `https://shop.boontrack.com/${tenantSlug}`;

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(bioShortlink);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = bioShortlink;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy bio shortlink:', err);
    }
  };

  return (
    <div className="w-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl border border-slate-700/80 shadow-md p-4 sm:p-5 text-white animate-in fade-in duration-200">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left Section: Icon & Labels */}
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-xs">
            <Share2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs sm:text-sm font-bold text-slate-100 tracking-tight">
                Tautan Bio Toko (TikTok, IG, WA)
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/90 text-emerald-400 border border-emerald-700/60 shrink-0">
                Official Shortlink
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
              Salin tautan resmi ini untuk dipasang di bio media sosial agar calon pembeli langsung menuju toko Anda.
            </p>
          </div>
        </div>

        {/* Right Section: Mono Container & Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 lg:shrink-0">
          {/* High Contrast Mono Display URL */}
          <div className="bg-slate-950/90 border border-slate-700/70 rounded-xl px-3.5 py-2 flex items-center gap-2 font-mono text-xs sm:text-[13px] text-emerald-400 shadow-inner select-all min-w-0 overflow-hidden">
            <Globe className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="truncate select-all">{bioShortlink}</span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* 1-Click Copy Button */}
            <button
              type="button"
              onClick={handleCopy}
              className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shadow-sm ${
                copied
                  ? 'bg-emerald-500 text-white shadow-emerald-500/25'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Tautan</span>
                </>
              )}
            </button>

            {/* Visit Store Button */}
            <a
              href={storefrontUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 active:scale-95 cursor-pointer shrink-0"
            >
              <span>Kunjungi Toko</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
