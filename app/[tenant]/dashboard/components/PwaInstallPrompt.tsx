'use client';

import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Bell, BellRing, CheckCircle2, X, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function PwaInstallPrompt({ tenantSlug }: { tenantSlug: string }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [isRequestingNotification, setIsRequestingNotification] = useState(false);

  useEffect(() => {
    // 1. Check if running in standalone mode (already installed PWA)
    if (typeof window !== 'undefined') {
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

      // 4. Capture beforeinstallprompt for Android & Desktop Chromium
      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as BeforeInstallPromptEvent);
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      };
    }
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else if (isIOS && !isStandalone) {
      setShowIOSGuide(true);
    }
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

  return (
    <>
      <div className="flex items-center gap-1.5">
        {/* Tombol Request Web Push Notification (jika belum granted) */}
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

        {/* Tombol Install PWA ke Layar Utama (hanya jika belum terinstall atau jika ada prompt/iOS) */}
        {!isStandalone && (deferredPrompt || isIOS) && (
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

      {/* Modal Petunjuk Install iOS (Safari) */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-200 shadow-2xl space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">Install ke Layar Utama HP</h4>
                  <p className="text-[11px] text-slate-500">Khusus Safari iPhone &amp; iPad</p>
                </div>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                <p>Ketuk tombol <strong>Bagikan (Share)</strong> <Share className="w-3.5 h-3.5 inline mx-0.5 text-blue-600" /> di bilah bawah Safari.</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                <p>Gulir ke bawah dan ketuk <strong>&quot;Tambah ke Layar Utama&quot; (Add to Home Screen)</strong>.</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                <p>Ketuk <strong>Tambah (Add)</strong> di pojok kanan atas. Dashboard kini siap dibuka tanpa browser!</p>
              </div>
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs rounded-xl transition cursor-pointer"
            >
              Saya Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
}
