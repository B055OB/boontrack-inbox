'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Shield,
  Clock,
  Radio,
  MapPin,
  Users,
  FileText,
  AlertTriangle,
  TrendingUp,
  Building2,
  CreditCard,
  LogOut,
  Wifi,
  WifiOff,
  User,
  QrCode,
} from 'lucide-react';
import BottomNavBar, { type BwmRole } from './BottomNavBar';
import { CardSkeleton } from './LoadingSkeleton';

export type { BwmRole } from './BottomNavBar';

export function isAllowedBwmRole(role: unknown): role is BwmRole {
  return role === 'field_personnel' || role === 'supervisor' || role === 'master_reseller';
}

export interface WorkforceSession {
  userId: string;
  tenant_id: string;
  tenant_slug: string;
  agency_slug?: string;
  agency_name?: string;
  nik: string;
  name: string;
  role: BwmRole | string;
  site?: string;
  branch?: string;
  expires_at?: string | number;
}

export interface WorkforceAppShellProps {
  children: React.ReactNode | ((session: WorkforceSession) => React.ReactNode);
  activeTab?: string;
  onSelectTab?: (tabId: string) => void;
  title?: string;
  subtitle?: string;
  overrideSession?: WorkforceSession | null; // For deterministic unit testing
  onSessionResolved?: (session: WorkforceSession | null) => void;
}

/**
 * Authoritative session resolver from /api/auth/me.
 * Fails closed on HTTP 401, network rejection, malformed payload, or unknown role.
 */
export async function fetchAuthoritativeSession(fetchImpl: typeof fetch = fetch): Promise<{
  authenticated: boolean;
  session: WorkforceSession | null;
  error: string | null;
}> {
  try {
    const res = await fetchImpl('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
    });

    if (res.status === 401 || !res.ok) {
      return { authenticated: false, session: null, error: 'UNAUTHORIZED_SESSION' };
    }

    const data = await res.json();
    if (!data || !data.authenticated || !data.session) {
      return { authenticated: false, session: null, error: 'SESSION_INVALID' };
    }

    const sess = data.session;
    if (!sess.role || !isAllowedBwmRole(sess.role)) {
      return { authenticated: false, session: sess, error: 'ACCESS_DENIED' };
    }

    return { authenticated: true, session: sess, error: null };
  } catch (err: unknown) {
    return {
      authenticated: false,
      session: null,
      error: err instanceof Error ? err.message : 'FAILED_TO_RESOLVE_SESSION',
    };
  }
}

export default function WorkforceAppShell({
  children,
  activeTab = 'overview',
  onSelectTab,
  title,
  subtitle,
  overrideSession,
  onSessionResolved,
}: WorkforceAppShellProps) {
  const initialError = React.useMemo(() => {
    if (overrideSession === null) return 'UNAUTHORIZED_SESSION';
    if (overrideSession !== undefined && (!overrideSession.role || !isAllowedBwmRole(overrideSession.role))) {
      return 'ACCESS_DENIED';
    }
    return null;
  }, [overrideSession]);

  const [session, setSession] = useState<WorkforceSession | null>(overrideSession || null);
  const [loading, setLoading] = useState<boolean>(overrideSession === undefined);
  const [error, setError] = useState<string | null>(initialError);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);

  // Monitor network status
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  // Fetch authoritative session strictly from /api/auth/me
  useEffect(() => {
    if (overrideSession !== undefined) {
      if (overrideSession === null) {
        setSession(null);
        setError('UNAUTHORIZED_SESSION');
        setLoading(false);
        onSessionResolved?.(null);
      } else if (!overrideSession.role || !isAllowedBwmRole(overrideSession.role)) {
        setSession(overrideSession);
        setError('ACCESS_DENIED');
        setLoading(false);
        onSessionResolved?.(null);
      } else {
        setSession(overrideSession);
        setError(null);
        setLoading(false);
        onSessionResolved?.(overrideSession);
      }
      return;
    }

    let isMounted = true;
    async function initSession() {
      setLoading(true);
      setError(null);
      const result = await fetchAuthoritativeSession();
      if (!isMounted) return;
      if (!result.authenticated || result.error) {
        setSession(result.session);
        setError(result.error || 'UNAUTHORIZED_SESSION');
        onSessionResolved?.(null);
      } else {
        setSession(result.session);
        setError(null);
        onSessionResolved?.(result.session);
      }
      setLoading(false);
    }

    initSession();
    return () => {
      isMounted = false;
    };
  }, [overrideSession, onSessionResolved]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      window.location.href = '/login';
    } catch {
      window.location.href = '/login';
    }
  }

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-md animate-pulse">
          <Shield className="w-6 h-6 animate-spin" />
        </div>
        <p className="text-sm font-semibold text-slate-600">Memuat Sesi Otoritatif BWM...</p>
        <div className="w-full max-w-sm">
          <CardSkeleton />
        </div>
      </div>
    );
  }

  // Fail-closed Access Denied for invalid/unknown role or admin
  if (error === 'ACCESS_DENIED' || (session && (!session.role || !isAllowedBwmRole(session.role)))) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6" role="alert">
        <div className="max-w-md w-full bg-white border border-rose-200 rounded-3xl p-8 shadow-xl text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Access Denied</h2>
            <p className="text-xs text-slate-500 mt-1">
              Peran akun ({String(session?.role || 'tidak ditentukan')}) tidak memiliki izin akses ke sistem operasional BWM.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow-md transition cursor-pointer"
          >
            Menuju Portal Masuk (Login)
          </Link>
        </div>
      </div>
    );
  }

  // Error / Unauthenticated State
  if (error || !session) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 shadow-xl text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Sesi Kerja Tidak Ditemukan</h2>
            <p className="text-xs text-slate-500 mt-1">
              Otorisasi sesi BWM diperlukan untuk mengakses antarmuka ini. Silakan masuk menggunakan NIK dan PIN yang valid.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-md transition cursor-pointer"
            style={{ backgroundColor: 'var(--brand-primary, #2563eb)' }}
          >
            Menuju Portal Masuk (Login)
          </Link>
        </div>
      </div>
    );
  }

  // Authoritative sidebar navigation items per role (strictly BwmRole)
  const role: BwmRole = session.role as BwmRole;
  const navItems = (() => {
    if (role === 'supervisor') {
      return [
        { id: 'radar', label: 'Live Operations Radar', icon: Radio },
        { id: 'officers', label: 'Daftar Petugas Lapangan', icon: Users },
        { id: 'checkpoints', label: 'Pos & Titik Patroli', icon: MapPin },
        { id: 'leaves', label: 'Verifikasi Izin & Sakit', icon: FileText },
      ];
    }
    if (role === 'master_reseller') {
      return [
        { id: 'overview', label: 'Command Center Overview', icon: TrendingUp },
        { id: 'roster', label: 'Manajemen Personel', icon: Users },
        { id: 'facilities', label: 'Fasilitas & Multi-Site', icon: Building2 },
        { id: 'billing', label: 'Komersial & Lisensi Kursi', icon: CreditCard },
      ];
    }
    // role === 'field_personnel'
    return [
      { id: 'presence', label: 'Presensi & Kehadiran', icon: Clock },
      { id: 'scan', label: 'Pemindaian Pos Patroli', icon: QrCode },
      { id: 'roster', label: 'Jadwal Kerja & Shift', icon: Users },
      { id: 'incidents', label: 'Laporan Insiden', icon: AlertTriangle },
    ];
  })();

  // Role Display Metadata
  const roleBadge = (() => {
    switch (role) {
      case 'master_reseller':
        return { label: 'Tenant Administrator', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
      case 'supervisor':
        return { label: 'Operations Supervisor', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'field_personnel':
        return { label: 'Petugas Lapangan', color: 'bg-blue-100 text-blue-800 border-blue-200' };
    }
  })();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Application Header */}
      <header
        role="banner"
        className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs px-4 lg:px-8 py-3"
      >
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Brand & Context */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs"
              style={{ backgroundColor: 'var(--brand-primary, #2563eb)' }}
            >
              <Shield className="w-5 h-5 stroke-[2.4]" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black tracking-tight text-slate-900">
                  {session.agency_name || 'BWM Operating System'}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${roleBadge.color}`}
                >
                  {roleBadge.label}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                <span>NIK: {session.nik}</span>
                {session.site && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="truncate max-w-[140px] sm:max-w-xs">{session.site}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Quick Controls & User Profile */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Connectivity Pill */}
            <div
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                isOnline
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Terhubung</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-rose-600" aria-hidden="true" />
                  <span>Offline</span>
                </>
              )}
            </div>

            {/* Logout Button */}
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              aria-label="Keluar Sesi"
              className="min-h-[48px] min-w-[48px] flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition cursor-pointer disabled:opacity-50"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span className="hidden md:inline">{loggingOut ? 'Keluar...' : 'Keluar'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container: Sidebar + Content */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Desktop Sidebar Navigation */}
        <aside
          role="navigation"
          aria-label="Desktop Sidebar Navigation"
          className="hidden lg:flex flex-col w-64 border-r border-slate-200 bg-white p-4 space-y-6"
        >
          {/* Navigation Section */}
          <div className="space-y-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Modul Operasional
            </p>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab && onSelectTab(item.id)}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`min-h-[48px] w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer text-left select-none ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${isActive ? 'text-blue-600 stroke-[2.4]' : 'text-slate-400'}`}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Context Card Footer */}
          <div className="mt-auto p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-slate-700">
              <User className="w-4 h-4 text-slate-400" aria-hidden="true" />
              <span className="text-xs font-bold truncate">{session.name}</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">
              Organisasi: <span className="font-semibold text-slate-700">{session.tenant_slug}</span>
            </p>
          </div>
        </aside>

        {/* Content Viewport */}
        <main
          role="main"
          className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 space-y-6 pb-24 lg:pb-8 overflow-x-hidden"
        >
          {(title || subtitle) && (
            <div className="space-y-1">
              {title && <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{title}</h1>}
              {subtitle && <p className="text-xs sm:text-sm text-slate-500">{subtitle}</p>}
            </div>
          )}
          {typeof children === 'function' ? children(session) : children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNavBar
        role={role}
        activeTab={activeTab}
        onSelectTab={(tabId) => onSelectTab && onSelectTab(tabId)}
      />
    </div>
  );
}
