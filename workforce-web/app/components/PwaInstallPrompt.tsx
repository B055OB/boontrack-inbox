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
  ShieldAlert,
} from 'lucide-react';
import { useTenantBranding, TenantBrandingConfig } from '../config/tenant-branding';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

interface PwaInstallPromptProps {
  branding?: TenantBrandingConfig;
}

export default function PwaInstallPrompt({ branding: propBranding }: PwaInstallPromptProps) {
  const fallbackBranding = useTenantBranding();
  const branding = propBranding || fallbackBranding;

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
        `To install ${branding.pwaAppName}:\n\n` +
        '1. On Chromium / Edge: Click "Install" in the address bar or browser menu.\n' +
        '2. On Android: Open browser menu ⋮ and tap "Add to Home screen" (Tambahkan ke Layar Utama).'
      );
    }
  }

  // Request Notification Permission
  async function handleRequestNotification() {
    if (!('Notification' in window)) {
      alert('This browser does not support Web Push Notifications.');
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
        const title = `${branding.brandName} Field Telemetry Alert`;
        const body = 'Operational notifications active! Checkpoint and dispatch alerts ready.';

        if (swRegistration && swRegistration.showNotification) {
          await swRegistration.showNotification(title, {
            body,
            icon: branding.faviconUrl || '/icons/workforce-192.png',
            badge: branding.faviconUrl || '/icons/workforce-192.png',
            tag: 'workforce-welcome-alert',
          });
        } else {
          new Notification(title, {
            body,
            icon: branding.faviconUrl || '/icons/workforce-192.png',
          });
        }
        setNotificationSent(true);
        setTimeout(() => setNotificationSent(false), 4000);
      }
    } catch (err) {
      console.error('[PWA] Notification permission error:', err);
    }
  }

  // Don't render banner if dismissed or disabled by branding config
  if (dismissed || !branding.installBannerEnabled) {
    return null;
  }

  return (
    <>
      {/* ========================================================================= */}
      {/* PWA INSTALL & NOTIFICATION ACTION BANNER (MOBILE FIRST - CLEAN SLATE BWM) */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 text-white px-3.5 py-2.5 border-t border-slate-800 text-xs shadow-xl">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-2">
            {/* Left Info: Icon & Text */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 shadow-xs">
                <Smartphone className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-white truncate">
                    {branding.pwaAppName} (PWA Active)
                  </span>
                  {isStandalone ? (
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[9px] font-bold border border-emerald-500/30 shrink-0">
                      PWA ACTIVE
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 font-mono text-[9px] font-bold border border-blue-500/30 shrink-0">
                      WEB MODE
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 truncate">
                  {isStandalone
                    ? 'Offline-ready telemetry & real-time dispatch alerts active'
                    : 'Add to Home Screen for native telemetry, fast scanning, and push alerts'}
                </p>
              </div>
            </div>

            {/* Right Action Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Install Button (Android / Chromium) */}
              {!isStandalone && !isIosDevice && (
                <button
                  onClick={handleInstallClick}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] shadow-sm flex items-center gap-1 transition cursor-pointer active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{branding.installButtonLabel || 'Install Mobile App'}</span>
                </button>
              )}

              {/* iOS Safari Guide Button */}
              {isIosDevice && !isStandalone && (
                <button
                  onClick={() => setShowIosModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] shadow-sm flex items-center gap-1 transition cursor-pointer active:scale-95"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>iOS Installation Guide</span>
                </button>
              )}

              {/* Notification Permission Toggle */}
              {notificationPermission !== 'granted' ? (
                <button
                  onClick={handleRequestNotification}
                  title={
                    isIosDevice && !isStandalone
                      ? 'Must be added to Home Screen first (iOS Safari Policy)'
                      : 'Enable Push Alerts'
                  }
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                    isIosDevice && !isStandalone
                      ? 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs active:scale-95'
                  }`}
                >
                  <BellRing className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Enable Push Alerts</span>
                  <span className="sm:hidden">Alerts</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (swRegistration && swRegistration.showNotification) {
                      swRegistration.showNotification(`${branding.brandName} Test Ping`, {
                        body: 'Operational field telemetry push notifications verified.',
                        icon: branding.faviconUrl || '/icons/workforce-192.png',
                        badge: branding.faviconUrl || '/icons/workforce-192.png',
                        tag: 'test-ping',
                      });
                    }
                    setNotificationSent(true);
                    setTimeout(() => setNotificationSent(false), 3000);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1 cursor-pointer hover:bg-emerald-500/30"
                  title="Alerts enabled. Click to send test telemetry ping."
                >
                  <Bell className="w-3 h-3" />
                  <span>Alerts Active</span>
                </button>
              )}

              {/* Dismiss Button */}
              <button
                onClick={() => setDismissed(true)}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                title="Dismiss banner"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {notificationSent && (
            <div className="mt-2 py-1 px-2.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-lg text-[10px] font-semibold flex items-center gap-1.5 animate-fadeIn">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Test telemetry notification successfully delivered to your device!</span>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: IOS SAFARI INSTALLATION GUIDE (ADD TO HOME SCREEN)                */}
      {/* ========================================================================= */}
      {showIosModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-slate-900 border border-slate-100">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-100 text-blue-700 rounded-xl">
                  <Smartphone className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Install on iPhone / iPad (Panduan Pasang di iPhone)
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

            {/* 3 Step iOS Guidance */}
            <div className="space-y-3 text-xs">
              {/* Step 1 */}
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="h-6 w-6 rounded-full bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <div className="font-bold text-slate-800 flex items-center gap-1">
                    <span>Tap the Share Button</span>
                    <span className="p-1 bg-white rounded border border-slate-300 inline-flex">
                      <Share2 className="w-3.5 h-3.5 text-blue-600" />
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Tap the square share icon with an upward arrow in your Safari bottom navigation bar.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="h-6 w-6 rounded-full bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <div className="font-bold text-slate-800 flex items-center gap-1">
                    <span>Select &quot;Add to Home Screen&quot; (Tambahkan ke Layar Utama)</span>
                    <span className="p-1 bg-white rounded border border-slate-300 inline-flex">
                      <PlusSquare className="w-3.5 h-3.5 text-slate-700" />
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Scroll down in the action sheet and select <i>Add to Home Screen</i>.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="h-6 w-6 rounded-full bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <div className="font-bold text-slate-800">Tap &quot;Add&quot; in Top Right</div>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    {branding.pwaAppName} will appear directly on your home screen without requiring an app store download.
                  </p>
                </div>
              </div>
            </div>

            {/* Apple iOS 16.4+ Web Push Rule Notice */}
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] space-y-1">
              <div className="font-bold flex items-center gap-1 text-amber-800">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Apple iOS 16.4+ Requirement</span>
              </div>
              <p className="text-amber-700 leading-tight">
                Emergency push alerts and shift dispatch notifications can be received once launched from your Home Screen icon.
              </p>
            </div>

            <button
              onClick={() => setShowIosModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition cursor-pointer"
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </>
  );
}
