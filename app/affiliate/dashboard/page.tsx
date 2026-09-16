'use client';

import React, { useEffect, useState, Suspense } from 'react';
import AffiliatePortalPage from '../page';
import { getSupabase } from '@/lib/supabaseClient';

export default function AffiliateDashboardPage() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function initSession() {
      if (typeof window === 'undefined') return;

      // 1. Tangani hash parameter (#access_token=...) saat halaman dimuat dari flow magic link email
      if (window.location.hash) {
        try {
          const hashStr = window.location.hash.startsWith('#')
            ? window.location.hash.substring(1)
            : window.location.hash;
          const hashParams = new URLSearchParams(hashStr);
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (accessToken) {
            localStorage.setItem('affiliate_token', accessToken);
            document.cookie = `affiliate_token=${encodeURIComponent(accessToken)}; path=/; max-age=604800; SameSite=Lax; Secure`;
            if (refreshToken) {
              localStorage.setItem('affiliate_refresh_token', refreshToken);
            }
            // Bersihkan hash dari URL address bar tanpa reload halaman
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        } catch (e) {
          console.warn('[AffiliateDashboard] Error parsing hash:', e);
        }
      }

      // 2. Cek session dari Supabase Auth Client
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          if (data?.session?.access_token) {
            localStorage.setItem('affiliate_token', data.session.access_token);
            document.cookie = `affiliate_token=${encodeURIComponent(data.session.access_token)}; path=/; max-age=604800; SameSite=Lax; Secure`;
          }
        }
      } catch (e) {
        console.warn('[AffiliateDashboard] Error checking supabase session:', e);
      }

      setIsReady(true);
    }

    initSession();
  }, []);

  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-slate-950 text-white flex items-center justify-center text-xs">Memuat Dashboard Affiliate...</div>}>
      <AffiliatePortalPage />
    </Suspense>
  );
}
