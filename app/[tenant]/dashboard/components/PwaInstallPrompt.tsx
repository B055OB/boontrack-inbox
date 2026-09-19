'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, Smartphone, BellRing, X, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PwaInstallPromptProps {
  tenantSlug: string;
  variant?: 'button' | 'banner' | 'menu-item';
  onActionComplete?: () => void;
}

export default function PwaInstallPrompt({
  tenantSlug,
  variant = 'button',
  onActionComplete,
}: PwaInstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== 'undefined') {
      return (window as any).__bt_deferred_prompt || null;
    }
    return null;
  });
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [isRequestingNotification, setIsRequestingNotification] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined') {
      // 1. Check if running in standalone mode (already installed PWA)
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      setIsStandalone(isStandaloneMode);

      // 2. Check if iOS device
      const userAgent = window.navigator.userAgent.toLowerCase();
      const isApple = /iphone|ipad|ipod/.test(userAgent);
      setIsIOS(isApple);

      // 3. Check notification permission
      if ('Notification' in window) {
        setNotificationPermission(Notification.permission);
      }

      // 4. Check if mobile banner was dismissed in this session
      try {
        if (sessionStorage.getItem('bt_pwa_banner_dismissed') === 'true') {
          setIsBannerDismissed(true);
        }
      } catch {}

      // 5. Capture beforeinstallprompt for Android & Desktop Chromium
      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        (window as any).__bt_deferred_prompt = e;
        setDeferredPrompt(e as BeforeInstallPromptEvent);
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      };
    }
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = deferredPrompt || (typeof window !== 'undefined' ? (window as any).__bt_deferred_prompt : null);
    if (promptEvent && typeof promptEvent.prompt === 'function') {
      try {
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        if (outcome === 'accepted') {
          setDeferredPrompt(null);
          (window as any).__bt_deferred_prompt = null;
        }
      } catch (err) {
        console.warn('PWA prompt execution note:', err);
        setShowIOSGuide(true);
      }
    } else {
      // Tampilkan modal instruksi jika prompt native belum tersedia atau pada browser Safari/iOS
      setShowIOSGuide(true);
    }
  };

  const handleDismissBanner = () => {
    setIsBannerDismissed(true);
    try {
      sessionStorage.setItem('bt_pwa_banner_dismissed', 'true');
    } catch {}
  };

  const handleRequestNotification = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('Browser Anda tidak mendukung Web Notification.');
      return;
    }

    setIsRequestingNotification(true);
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);

      if (perm === 'granted') {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          const reg = await navigator.serviceWorker.ready;
          reg.showNotification('🎉 Notifikasi BoonTrack Aktif!', {
            body: `Notifikasi pesanan & transaksi untuk toko ${tenantSlug} berhasil diaktifkan.`,
            icon: '/logo.png',
            badge: '/logo.png',
          });
        } else {
          new Notification('🎉 Notifikasi BoonTrack Aktif!', {
            body: `Notifikasi pesanan & transaksi untuk toko ${tenantSlug} berhasil diaktifkan.`,
            icon: '/logo.png',
          });
        }
      }
    } catch (err) {
      console.warn('Error requesting notification permission:', err);
    } finally {
      setIsRequestingNotification(false);
    }
  };

  const canInstall = !isStandalone;

  const modalGuide = showIOSGuide && isMounted ? (
    <div className="fixed inset-0 z-[99999] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-200 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-900">Install App ke Layar Utama</h4>
              <p className="text-[11px] text-slate-500">Akses Cepat Toko {tenantSlug}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowIOSGuide(false);
              onActionComplete?.();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2.5 text-xs text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
            <p>Ketuk tombol <strong>Bagikan (Share)</strong> <Share className="w-3.5 h-3.5 inline mx-0.5 text-blue-600" /> di bilah browser (Safari) atau menu titik tiga (Chrome).</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
            <p>Pilih menu <strong>&quot;Tambah ke Layar Utama&quot; (Add to Home Screen / Install App)</strong>.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
            <p>Ketuk <strong>Tambah / Install</strong>. Dashboard toko Anda kini siap dibuka seketika layaknya aplikasi native!</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowIOSGuide(false);
            onActionComplete?.();
          }}
          className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs rounded-xl transition cursor-pointer active:scale-95 shadow-md shadow-purple-500/20"
        >
          Saya Mengerti
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      {/* ── VARIANT 1: SLIM MOBILE TOP BANNER ── */}
      {variant === 'banner' && canInstall && !isBannerDismissed && (
        <div className="lg:hidden bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white px-3.5 py-2 border-b border-indigo-800/40 shadow-sm flex items-center justify-between gap-2.5 z-25 sticky top-[45px]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-purple-500/20 border border-purple-400/30 text-purple-300 flex items-center justify-center shrink-0">
              <Smartphone className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-white tracking-tight leading-tight truncate">
                Install App BoonTrack
              </p>
              <p className="text-[9px] text-purple-200/80 font-medium leading-tight truncate">
                Buka dashboard lebih cepat di layar utama
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-extrabold rounded-lg transition active:scale-95 shadow-xs flex items-center gap-1 cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>Install</span>
            </button>
            <button
              type="button"
              onClick={handleDismissBanner}
              className="p-1 text-slate-400 hover:text-white rounded-md transition cursor-pointer"
              aria-label="Tutup Banner Install"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── VARIANT 2: MENU ITEM (Inside Burger Drawer / Profile Popover) ── */}
      {variant === 'menu-item' && (
        <button
          type="button"
          onClick={() => {
            handleInstallClick();
          }}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-purple-700 hover:bg-purple-50 transition text-left cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-3.5 h-3.5 text-purple-600" />
            <span>Install App</span>
          </div>
          <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-purple-100 text-purple-800">
            APP
          </span>
        </button>
      )}

      {/* ── VARIANT 3: DEFAULT BUTTON (Desktop Navbar) ── */}
      {variant === 'button' && (
        <div className="flex items-center gap-1.5">
          {notificationPermission !== 'granted' && (
            <button
              type="button"
              onClick={handleRequestNotification}
              disabled={isRequestingNotification}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Aktifkan Notifikasi Web Push untuk Pesanan & Kabar Platform"
            >
              <BellRing className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
              <span className="hidden md:inline">Izinkan Notifikasi Order</span>
            </button>
          )}

          {!isStandalone && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Install Dashboard BoonTrack ke Layar Utama HP / Laptop"
            >
              <Smartphone className="w-3.5 h-3.5 text-purple-600" />
              <span className="hidden md:inline">Install App</span>
            </button>
          )}
        </div>
      )}

      {/* ── PORTAL MODAL PETUNJUK INSTALL (Rendered at Body Level) ── */}
      {modalGuide && typeof document !== 'undefined' ? createPortal(modalGuide, document.body) : modalGuide}
    </>
  );
}

