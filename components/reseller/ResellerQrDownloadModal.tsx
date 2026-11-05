'use client';

import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Download,
  Copy,
  Check,
  Send,
  X,
  AlertCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import {
  generateResellerQrDataUrl,
  downloadQrAsPng,
  buildResellerWhatsAppShareUrl,
} from '@/lib/qr/qrExporter';

export interface ResellerQrDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  resellerName: string;
  referralCode: string;
  referralUrl: string;
  tenantSlug: string;
  resellerPhone?: string;
  storeName?: string;
}

export function ResellerQrDownloadModal({
  isOpen,
  onClose,
  resellerName,
  referralCode,
  referralUrl,
  tenantSlug,
  resellerPhone,
  storeName,
}: ResellerQrDownloadModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Generate QR code asynchronously on open or when URL changes
  useEffect(() => {
    if (!isOpen) {
      setQrDataUrl(null);
      setError(null);
      setIsCopied(false);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    async function generate() {
      try {
        if (!referralUrl || !referralUrl.trim()) {
          throw new Error('URL referral tidak valid atau kosong.');
        }

        const dataUrl = await generateResellerQrDataUrl(referralUrl, {
          width: 512,
          margin: 2,
          errorCorrectionLevel: 'H',
        });

        if (!isCancelled) {
          setQrDataUrl(dataUrl);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setError(err?.message || 'Gagal membuat QR Code.');
          setIsLoading(false);
        }
      }
    }

    generate();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, referralUrl]);

  if (!isOpen) return null;

  // Action: Salin Link ke Clipboard
  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(referralUrl);
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch (err) {
      console.warn('[ResellerQrDownloadModal] Copy failed:', err);
    }
  };

  // Action: Download Gambar QR PNG
  const handleDownload = () => {
    if (!qrDataUrl) return;
    downloadQrAsPng({
      dataUrl: qrDataUrl,
      tenantSlug,
      resellerCodeOrSlug: referralCode || 'reseller',
    });
  };

  // Action: Kirim ke WhatsApp Reseller
  const handleSendToWhatsApp = () => {
    const { waUrl } = buildResellerWhatsAppShareUrl({
      phone: resellerPhone,
      resellerName,
      referralCode,
      referralUrl,
      storeName,
    });

    if (typeof window !== 'undefined') {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      data-testid="reseller-qr-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col relative text-slate-800 dark:text-slate-100">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                Barcode / QR Promosi Reseller
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Mitra: <strong>{resellerName}</strong> ({referralCode})
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="btn-close-modal"
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* QR Canvas Frame */}
          <div className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800/80 p-5 flex flex-col items-center justify-center shadow-inner text-center">
            {isLoading ? (
              <div
                data-testid="qr-loading-indicator"
                className="w-56 h-56 flex flex-col items-center justify-center gap-2 text-xs text-slate-400"
              >
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                <span>Membuat barcode resolusi tinggi...</span>
              </div>
            ) : error ? (
              <div
                data-testid="qr-error-banner"
                className="w-56 h-56 flex flex-col items-center justify-center gap-2 text-xs text-rose-600 p-4 text-center"
              >
                <AlertCircle className="w-8 h-8 text-rose-500" />
                <span className="font-bold">Gagal Membuat Barcode</span>
                <p className="text-[11px] text-slate-500">{error}</p>
              </div>
            ) : qrDataUrl ? (
              <div className="space-y-3 flex flex-col items-center">
                <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    data-testid="reseller-qr-image"
                    src={qrDataUrl}
                    alt={`QR Code ${resellerName}`}
                    width={220}
                    height={220}
                    className="w-52 h-52 object-contain"
                  />
                </div>

                {/* Sub-label under QR Code */}
                <div className="space-y-1 text-center max-w-[240px]">
                  <div className="inline-block px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 font-mono text-[11px] font-black">
                    Kode: {referralCode}
                  </div>
                  <p
                    data-testid="reseller-qr-url-text"
                    className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate"
                    title={referralUrl}
                  >
                    Link: {referralUrl}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Action Bar */}
          <div className="space-y-2.5">
            {/* Primary Action: Download PNG */}
            <button
              type="button"
              data-testid="btn-download-qr"
              disabled={isLoading || !qrDataUrl}
              onClick={handleDownload}
              className={`w-full py-3 px-4 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm ${
                isLoading || !qrDataUrl
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer active:scale-98 shadow-indigo-600/20'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>Download Gambar QR (PNG 512px)</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              {/* Secondary Action 1: Salin Link */}
              <button
                type="button"
                data-testid="btn-copy-link"
                onClick={handleCopy}
                className={`py-2.5 px-3 rounded-2xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 ${
                  isCopied
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                    : 'bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                }`}
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>Salin Link</span>
                  </>
                )}
              </button>

              {/* Secondary Action 2: Kirim ke WA Reseller */}
              <button
                type="button"
                data-testid="btn-send-whatsapp"
                onClick={handleSendToWhatsApp}
                className="py-2.5 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-98 shadow-emerald-900/10"
                title="Kirim link & barcode referral langsung ke nomor WhatsApp reseller"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Kirim WA</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResellerQrDownloadModal;

