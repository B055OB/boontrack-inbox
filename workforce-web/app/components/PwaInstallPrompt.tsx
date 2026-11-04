'use client';

import React, { useState, useEffect } from 'react';
import {
  Download,
  Smartphone,
  Share2,
  PlusSquare,
  CheckCircle2,
  Bell,
  BellRing,
  X,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [notificationSent, setNotificationSent] = useState(false);

  useEffect(() => {
    // 1. Check if running in standalone mode (already installed PWA)
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsStandalone(isStandaloneMode);
    };
    checkStandalone();

    // 2. Detect iOS environment
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos =
      /iphone|ipad|ipod/.test(ua) ||
      (window.navigator.userAgent.includes('Mac') && window.navigator.maxTouchPoints > 1);
    setIsIosDevice(isIos);

    // 3. Register Service Worker: /sw-workforce.js
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw-workforce.js', { scope: '/' })
        .then((reg) => {
          setSwRegistration(reg);
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    }

    // 4. Check initial notification permission
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    // 5. Android BeforeInstallPrompt event listener
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Trigger native install prompt on Android/Chromium
  async function handleInstallClick() {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsStandalone(true);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.error('[PWA] Prompt error:', err);
      }
    } else {
      alert(
        'Untuk memasang aplikasi SATYA:\n\n' +
        '1. Pada browser Chromium / Edge: Klik tombol "Install" di address bar atau menu ⋮ > "Install SATYA".\n' +
        '2. Pada perangkat Android: Buka menu browser ⋮ lalu pilih "Tambahkan ke Layar Utama" (Add to Home screen).'
      );
    }
  }

  // Request Notification Permission
  async function handleRequestNotification() {
    if (!('Notification' in window)) {
      alert('Browser ini tidak mendukung fitur Web Push Notifications.');
      return;
    }

    // iOS Safari 16.4+ Requirement: Must be installed on Home Screen
    if (isIosDevice && !isStandalone) {
      setShowIosModal(true);
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === 'granted') {
        // Send a test operational alert via service worker or Notification API
        if (swRegistration && swRegistration.showNotification) {
          await swRegistration.showNotification('SATYA Patrol Alert', {
            body: 'Izin notifikasi aktif! Notifikasi penugasan pos & patroli siap diterima.',
            icon: '/icons/workforce-192.png',
            badge: '/icons/workforce-192.png',
            tag: 'satya-welcome-alert',
          });
        } else {
          new Notification('SATYA Patrol Alert', {
            body: 'Izin notifikasi aktif! Notifikasi penugasan pos & patroli siap diterima.',
            icon: '/icons/workforce-192.png',
          });
        }
        setNotificationSent(true);
        setTimeout(() => setNotificationSent(false), 4000);
      }
    } catch (err) {
      console.error('[PWA] Notification permission error:', err);
    }
  }

  // Don't render banner if dismissed
  if (dismissed) {
    return null;
  }

  return (
    <>
      {/* ========================================================================= */}
      {/* PWA INSTALL & NOTIFICATION ACTION BANNER (MOBILE FIRST)                  */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-red-950 via-slate-900 to-slate-950 text-white px-3.5 py-2.5 border-b border-red-900/50 text-xs shadow-md">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-2">
            {/* Left Info: Icon & Text */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-red-600 flex items-center justify-center shrink-0 shadow-xs">
                <Smartphone className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-white truncate">Aplikasi Lapangan SATYA</span>
                  {isStandalone ? (
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[9px] font-bold border border-emerald-500/30 shrink-0">
                      PWA AKTIF
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-mono text-[9px] font-bold border border-amber-500/30 shrink-0">
                      WEB MODE
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-300 truncate">
                  {isStandalone
                    ? 'Siap patroli mandiri & terima notifikasi push'
                    : 'Pasang ke layar utama untuk performa & push alert'}
                </p>
              </div>
            </div>

            {/* Right Action Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Install Button (Android / Chromium) */}
              {!isStandalone && !isIosDevice && (
                <button
                  onClick={handleInstallClick}
                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] shadow-sm flex items-center gap-1 transition cursor-pointer active:scale-95"
                >
                  <Download className="w-3 h-3" />
                  <span>📲 Pasang Aplikasi SATYA</span>
                </button>
              )}

              {/* iOS Safari Guide Button */}
              {isIosDevice && !isStandalone && (
                <button
                  onClick={() => setShowIosModal(true)}
                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] shadow-sm flex items-center gap-1 transition cursor-pointer active:scale-95"
                >
                  <Share2 className="w-3 h-3" />
                  <span>Panduan Pasang di iPhone</span>
                </button>
              )}

              {/* Notification Permission Toggle */}
              {notificationPermission !== 'granted' ? (
                <button
                  onClick={handleRequestNotification}
                  title={
                    isIosDevice && !isStandalone
                      ? 'Wajib pasang ke Home Screen terlebih dahulu (Ketentuan iOS Safari)'
                      : 'Aktifkan Notifikasi Push'
                  }
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                    isIosDevice && !isStandalone
                      ? 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs active:scale-95'
                  }`}
                >
                  <BellRing className="w-3 h-3" />
                  <span className="hidden sm:inline">Aktifkan Notifikasi</span>
                  <span className="sm:hidden">Notif</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (swRegistration && swRegistration.showNotification) {
                      swRegistration.showNotification('SATYA Alert Uji Coba', {
                        body: 'Sistem push notifikasi lapangan siap bertugas.',
                        icon: '/icons/workforce-192.png',
                        badge: '/icons/workforce-192.png',
                        tag: 'test-ping',
                      });
                    }
                    setNotificationSent(true);
                    setTimeout(() => setNotificationSent(false), 3000);
                  }}
                  className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1 cursor-pointer hover:bg-emerald-500/30"
                  title="Izin aktif. Klik untuk uji coba push."
                >
                  <Bell className="w-3 h-3" />
                  <span>Notif Aktif</span>
                </button>
              )}

              {/* Dismiss Button */}
              <button
                onClick={() => setDismissed(true)}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                title="Tutup banner"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {notificationSent && (
            <div className="mt-2 py-1 px-2.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-lg text-[10px] font-semibold flex items-center gap-1.5 animate-fadeIn">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Notifikasi uji coba SATYA berhasil dikirimkan ke perangkat Anda!</span>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL PANDUAN INSTALASI IOS SAFARI (ADD TO HOME SCREEN)                   */}
      {/* ========================================================================= */}
      {showIosModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-slate-900 border border-slate-100">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-red-100 text-red-700 rounded-xl">
                  <Smartphone className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Panduan Pasang di iPhone / iPad
                  </h3>
                  <p className="text-[11px] text-slate-500">Apple Safari Add to Home Screen (A2HS)</p>
                </div>
              </div>
              <button
                onClick={() => setShowIosModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 3 Langkah Instalasi iOS */}
            <div className="space-y-3 text-xs">
              {/* Langkah 1 */}
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="h-6 w-6 rounded-full bg-red-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <div className="font-bold text-slate-800 flex items-center gap-1">
                    <span>Ketuk Tombol Bagikan</span>
                    <span className="p-1 bg-white rounded border border-slate-300 inline-flex">
                      <Share2 className="w-3.5 h-3.5 text-blue-600" />
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Ikon panah keluar di bilah menu bawah browser Safari Anda.
                  </p>
                </div>
              </div>

              {/* Langkah 2 */}
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="h-6 w-6 rounded-full bg-red-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <div className="font-bold text-slate-800 flex items-center gap-1">
                    <span>Pilih &quot;Tambahkan ke Layar Utama&quot;</span>
                    <span className="p-1 bg-white rounded border border-slate-300 inline-flex">
                      <PlusSquare className="w-3.5 h-3.5 text-slate-700" />
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Gulir sedikit ke bawah pada menu bagikan, lalu pilih <i>Add to Home Screen</i>.
                  </p>
                </div>
              </div>

              {/* Langkah 3 */}
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="h-6 w-6 rounded-full bg-red-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <div className="font-bold text-slate-800">Ketuk &quot;Tambah&quot; (Add) di Kanan Atas</div>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Aplikasi SATYA akan langsung terpasang di layar utama iPhone Anda tanpa melalui App Store.
                  </p>
                </div>
              </div>
            </div>

            {/* Note Khusus Web Push di iOS */}
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] space-y-1">
              <div className="font-bold flex items-center gap-1 text-amber-800">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Aturan Web Push Apple iOS 16.4+</span>
              </div>
              <p className="text-amber-700 leading-tight">
                Notifikasi darurat dan panggilan tugas petugas baru dapat diaktifkan setelah aplikasi dibuka melalui ikon di Layar Utama iPhone.
              </p>
            </div>

            <button
              onClick={() => setShowIosModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition cursor-pointer"
            >
              Saya Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
}
