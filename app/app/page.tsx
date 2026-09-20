'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Store, RefreshCw, ArrowRight, ShieldCheck, CheckCircle2, LogOut } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

interface TenantSummary {
  slug: string;
  name?: string;
  tier?: string;
}

const RESERVED_SLUGS = new Set([
  'app',
  'dashboard',
  'login',
  'admin',
  'register',
  'daftar',
  'affiliate',
  'manager',
  'terms',
  'privacy',
  'checkout',
  'null',
  'undefined',
  '',
]);

function sanitizeSlug(val: string | null | undefined): string | null {
  if (!val) return null;
  const clean = val
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^shop\.boontrack\.com\//, '')
    .replace(/^boontrack\.com\//, '')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
  return clean && !RESERVED_SLUGS.has(clean) ? clean : null;
}

export default function AppEntryRouter() {
  const router = useRouter();
  const [statusMessage, setStatusMessage] = useState('Memeriksa sesi toko Anda...');
  const [multipleStores, setMultipleStores] = useState<TenantSummary[]>([]);
  const [showStorePicker, setShowStorePicker] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function routeUser() {
      if (typeof window === 'undefined') return;

      // 1. Tangani hash parameter (misal callback OAuth Supabase atau token affiliate)
      if (window.location.hash && window.location.hash.includes('access_token')) {
        const hashStr = window.location.hash.startsWith('#')
          ? window.location.hash.substring(1)
          : window.location.hash;
        const hashParams = new URLSearchParams(hashStr);
        const token = hashParams.get('access_token');
        if (token) {
          localStorage.setItem('affiliate_token', token);
          document.cookie = `affiliate_token=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=Lax; Secure`;
          router.replace(`/affiliate/dashboard${window.location.hash}`);
          return;
        }
      }

      // 2. Baca sesi toko lokal & cookies aktif (Merchant Session)
      const localStore = sanitizeSlug(
        localStorage.getItem('merchant_store') ||
        localStorage.getItem('merchant_session') ||
        localStorage.getItem('bt_tenant')
      );

      const cookieStore = sanitizeSlug(
        (document.cookie.match(/(?:merchant_store|merchant_session|bt_tenant)=([^;]+)/)?.[1] ?? null)
      );

      const activeStoreCandidate = localStore || cookieStore;

      // 3. Periksa Sesi Supabase Auth
      let supabaseSessionUser: any = null;
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          if (data?.session?.user) {
            supabaseSessionUser = data.session.user;
          }
        }
      } catch (authErr) {
        console.warn('[PWA Router] Supabase session check error:', authErr);
      }

      // Jika ada toko aktif dari sesi lokal / cookie yang valid:
      if (activeStoreCandidate) {
        setStatusMessage(`Menghubungkan ke ${activeStoreCandidate}...`);
        persistSession(activeStoreCandidate);
        redirectToDashboard(activeStoreCandidate);
        return;
      }

      // 4. Jika tidak ada di local storage tapi ada sesi Supabase Auth aktif:
      if (supabaseSessionUser) {
        setStatusMessage('Membaca data toko Anda...');
        const userMeta = supabaseSessionUser.user_metadata || {};
        const metaSlug = sanitizeSlug(
          userMeta.tenant_slug || userMeta.store_slug || userMeta.slug || userMeta.tenant
        );

        if (metaSlug) {
          persistSession(metaSlug);
          redirectToDashboard(metaSlug);
          return;
        }

        // Cari toko milik pengguna dari database Supabase (ZERO HARDCODING POLICY)
        try {
          const supabase = getSupabase();
          if (supabase) {
            const userEmail = supabaseSessionUser.email;
            const userId = supabaseSessionUser.id;

            // Query tenants berdasarkan owner / user / email
            const query = supabase
              .from('tenants')
              .select('slug, name, tier')
              .limit(10);

            if (userEmail) {
              query.or(`access_username.eq.${userEmail},metadata->>email.eq.${userEmail}`);
            }

            const { data: stores, error } = await query;

            if (!error && stores && stores.length > 0) {
              const validStores = stores.filter((s) => sanitizeSlug(s.slug) !== null);

              if (validStores.length === 1) {
                const targetSlug = validStores[0].slug;
                persistSession(targetSlug);
                redirectToDashboard(targetSlug);
                return;
              } else if (validStores.length > 1) {
                // Ada lebih dari satu toko: tampilkan pemilih toko
                if (!isCancelled) {
                  setMultipleStores(validStores);
                  setShowStorePicker(true);
                }
                return;
              }
            }
          }
        } catch (dbErr) {
          console.warn('[PWA Router] Database query error:', dbErr);
        }
      }

      // 5. Jika TIDAK ADA sesi sama sekali: arahkan ke /login
      if (!isCancelled) {
        setStatusMessage('Belum ada sesi aktif. Mengalihkan ke halaman login...');
        setTimeout(() => {
          router.replace('/login?redirectTo=/app');
        }, 400);
      }
    }

    routeUser();

    return () => {
      isCancelled = true;
    };
  }, [router]);

  const persistSession = (slug: string) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('merchant_store', slug);
      localStorage.setItem('merchant_session', slug);
      localStorage.setItem('bt_tenant', slug);
      document.cookie = `merchant_store=${slug}; path=/; max-age=2592000; SameSite=Lax`;
      document.cookie = `merchant_session=${slug}; path=/; max-age=2592000; SameSite=Lax`;
      document.cookie = `bt_tenant=${slug}; path=/; max-age=2592000; SameSite=Lax`;
    } catch {}
  };

  const redirectToDashboard = (slug: string) => {
    const dest = `/${slug}/dashboard`;
    router.replace(dest);
    setTimeout(() => {
      if (typeof window !== 'undefined' && window.location.pathname !== dest) {
        window.location.href = dest;
      }
    }, 400);
  };

  const handleSelectStore = (slug: string) => {
    persistSession(slug);
    redirectToDashboard(slug);
  };

  // ── VIEW: PEMILIH TOKO JIKA MERCHANTS MEMILIKI BANYAK TOKO ──
  if (showStorePicker && multipleStores.length > 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 selection:bg-purple-600 selection:text-white">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-600 flex items-center justify-center font-black text-white shadow-md shadow-purple-900/30 shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">Pilih Toko Aktif</h2>
              <p className="text-[11px] text-slate-400">Buka Dashboard BoonTrack Toko</p>
            </div>
          </div>

          <div className="space-y-2">
            {multipleStores.map((st) => (
              <button
                key={st.slug}
                type="button"
                onClick={() => handleSelectStore(st.slug)}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-purple-500/60 text-left transition group active:scale-98 cursor-pointer"
              >
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-black text-white group-hover:text-purple-300 transition truncate">
                    {st.name || st.slug}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    boontrack.com/{st.slug}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {st.tier && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/50">
                      {st.tier}
                    </span>
                  )}
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-purple-400 group-hover:translate-x-0.5 transition" />
                </div>
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <Link
              href="/login"
              className="text-[11px] font-bold text-slate-400 hover:text-slate-200 transition flex items-center gap-1"
            >
              <LogOut className="w-3 h-3" />
              <span>Ganti Akun Lain</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── VIEW: DEFAULT LOADING SPLASH SCREEN ──
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center select-none">
      <div className="flex flex-col items-center gap-4 animate-in fade-in duration-300 max-w-xs">
        {/* App Logo Emblem */}
        <div className="relative">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-purple-700 via-indigo-600 to-blue-500 flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-purple-900/40 animate-pulse">
            B
          </div>
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-slate-950 flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
          </div>
        </div>

        {/* Title & Status */}
        <div className="space-y-1">
          <h1 className="text-base font-black text-white tracking-tight">
            BoonTrack Seller
          </h1>
          <p className="text-xs text-slate-400 font-medium tracking-wide flex items-center justify-center gap-1.5">
            <RefreshCw className="w-3 h-3 animate-spin text-purple-400" />
            <span>{statusMessage}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
