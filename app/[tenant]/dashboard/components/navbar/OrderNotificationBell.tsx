'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Bell } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

interface OrderNotificationBellProps {
  tenantSlug: string;
  onNewOrder?: () => void;
}

export default function OrderNotificationBell({ tenantSlug, onNewOrder }: OrderNotificationBellProps) {
  const [unseenCount, setUnseenCount] = useState(0);
  const [isRinging, setIsRinging] = useState(false);

  // Simpan callback ke ref agar tidak memicu re-render atau re-subscribe pada useEffect
  const onNewOrderRef = useRef(onNewOrder);
  useEffect(() => {
    onNewOrderRef.current = onNewOrder;
  }, [onNewOrder]);

  // Audio synthesizer Web Audio API tanpa butuh file .mp3 eksternal
  const playCashRegisterChime = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      const playTone = (freq: number, delay: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + duration);
      };

      // Rangkaian nada koin masuk / chime (E6 -> G#6 -> B6)
      playTone(1318.51, 0, 0.15);
      playTone(1661.22, 0.08, 0.15);
      playTone(1975.53, 0.16, 0.35);
    } catch {
      // Browser memblokir audio jika user belum berinteraksi
    }
  };

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !tenantSlug) return;

    // Gunakan instance-unique channel id untuk mencegah collision
    // antar multiple components (mobile navbar & desktop header) atau HMR
    const channelId = `realtime-orders:${tenantSlug}:${Math.random().toString(36).slice(2, 9)}`;

    // Pola subscription bersih: inisialisasi, .on(), dan .subscribe() dalam 1 rantai tunggal
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `tenant_slug=eq.${tenantSlug}`,
        },
        (payload: any) => {
          // Hanya tangani event INSERT pesanan baru
          if (payload.eventType && payload.eventType !== 'INSERT') {
            return;
          }

          setUnseenCount((prev) => prev + 1);
          setIsRinging(true);
          playCashRegisterChime();

          // Dispatch Web Notification jika diizinkan
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              const orderTitle = payload?.new?.product_title || 'Pesanan Baru';
              const orderAmount = payload?.new?.gross_amount
                ? ` (Rp ${Number(payload.new.gross_amount).toLocaleString('id-ID')})`
                : '';

              if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then((reg) => {
                  reg.showNotification(`🔔 Pesanan Baru Masuk: ${orderTitle}`, {
                    body: `Pelanggan baru memesan produk ${orderTitle}${orderAmount}. Buka dashboard untuk rincian.`,
                    icon: '/logo.png',
                    badge: '/logo.png',
                    vibrate: [200, 100, 200],
                    data: { url: `/${tenantSlug}/dashboard` },
                  } as any);
                });
              } else {
                new Notification(`🔔 Pesanan Baru Masuk: ${orderTitle}`, {
                  body: `Pelanggan baru memesan produk ${orderTitle}${orderAmount}.`,
                  icon: '/logo.png',
                });
              }
            } catch (notifErr) {
              console.warn('[Notification Error]:', notifErr);
            }
          }

          if (onNewOrderRef.current) {
            onNewOrderRef.current();
          }
          setTimeout(() => setIsRinging(false), 1500);
        }
      )
      .subscribe();

    // Cleanup channel yang tepat saat unmount atau dependency berubah
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (err) {
        console.debug('[OrderNotificationBell] Cleanup channel note:', err);
      }
    };
  }, [tenantSlug]);

  const handleClear = () => {
    setUnseenCount(0);
  };

  return (
    <button
      type="button"
      onClick={handleClear}
      className="relative p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
      title={unseenCount > 0 ? `${unseenCount} Pesanan Baru Masuk!` : 'Notifikasi Pesanan'}
    >
      <Bell className={`w-4 h-4 ${isRinging ? 'animate-bounce text-emerald-600' : ''}`} />

      {unseenCount > 0 && (
        <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-rose-600 text-white text-[9px] font-black rounded-full animate-pulse shadow-xs">
          {unseenCount > 99 ? '99+' : unseenCount}
        </span>
      )}
    </button>
  );
}