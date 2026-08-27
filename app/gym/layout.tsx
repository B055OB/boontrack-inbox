'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Receipt,
  ShoppingCart,
  ShieldCheck,
  Cpu,
  BarChart3,
  Settings,
  Menu,
  X,
  Dumbbell,
  ChevronDown,
  Building2,
  ExternalLink,
  Zap,
  Activity,
} from 'lucide-react';

const NAV_ITEMS = [
  {
    name: 'Overview',
    href: '/gym',
    icon: LayoutDashboard,
    badge: 'Live',
    exact: true,
  },
  {
    name: 'Members & NFC',
    href: '/gym/members',
    icon: Users,
  },
  {
    name: 'Zumba Studio Lt 2',
    href: '/gym/classes',
    icon: CalendarCheck,
    badge: 'Jadwal',
  },
  {
    name: 'Tagihan & Invoice',
    href: '/gym/invoices',
    icon: Receipt,
  },
  {
    name: 'POS Cway / Cafe',
    href: '/gym/pos',
    icon: ShoppingCart,
    badge: 'Kasir',
  },
  {
    name: 'Gate Audit Logs',
    href: '/gym/access-logs',
    icon: ShieldCheck,
  },
  {
    name: 'Gate Controllers',
    href: '/gym/controllers',
    icon: Cpu,
  },
  {
    name: 'Laporan & Omzet',
    href: '/gym/reports',
    icon: BarChart3,
  },
  {
    name: 'Pengaturan Gym',
    href: '/gym/settings',
    icon: Settings,
  },
];

const TENANTS = [
  { id: 'atmosfitnes', name: 'Atmosfitnes Hub (Main)', status: 'ACTIVE', branch: 'Pusat' },
  { id: 'atmosfitnes-south', name: 'Atmosfitnes Studio', status: 'ACTIVE', branch: 'Cabang Selatan' },
  { id: 'powerfit-demo', name: 'PowerFit Gym (Tenant Demo)', status: 'DEV', branch: 'Development' },
];

export default function GymLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(TENANTS[0]);
  const [tenantDropdownOpen, setTenantDropdownOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + ' WIB'
      );
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  const isActive = (itemHref: string, exact?: boolean) => {
    if (exact) {
      return pathname === itemHref || pathname === '/';
    }
    return pathname.startsWith(itemHref);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row antialiased selection:bg-emerald-500 selection:text-black">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900/90 backdrop-blur border-b border-slate-800 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Dumbbell className="w-5 h-5 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-white tracking-tight">Atmosfitnes</span>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Gym Admin
              </span>
            </div>
            <p className="text-[11px] text-slate-400">BoonTrack Vertical</p>
          </div>
        </div>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 transition"
          aria-label="Toggle Navigation"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-slate-900 border-r border-slate-800 flex flex-col justify-between transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:h-screen ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Brand Header */}
          <div className="p-5 border-b border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 flex items-center justify-center shadow-xl shadow-emerald-500/25 ring-2 ring-emerald-500/20">
                <Dumbbell className="w-5 h-5 text-slate-950 stroke-[2.5]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="font-extrabold text-base tracking-tight text-white truncate">
                    ATMOS<span className="text-emerald-400">FITNES</span>
                  </h1>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <p className="text-xs text-slate-400 font-medium truncate">Gate System Online</p>
                </div>
              </div>
            </div>

            {/* Tenant Selector Dropdown */}
            <div className="mt-4 relative">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                Active Gym Tenant
              </label>
              <button
                type="button"
                onClick={() => setTenantDropdownOpen(!tenantDropdownOpen)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition text-left text-xs text-slate-200 group"
              >
                <div className="flex items-center gap-2 truncate">
                  <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="font-medium text-white truncate">{selectedTenant.name}</span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${tenantDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {tenantDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1.5 p-1 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50 animate-in fade-in zoom-in-95">
                  {TENANTS.map((tenant) => (
                    <button
                      key={tenant.id}
                      onClick={() => {
                        setSelectedTenant(tenant);
                        setTenantDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-left text-xs transition ${
                        selectedTenant.id === tenant.id
                          ? 'bg-emerald-500/15 text-emerald-300 font-semibold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="truncate">
                        <p className="truncate">{tenant.name}</p>
                        <p className="text-[10px] text-slate-400">{tenant.branch}</p>
                      </div>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold ${
                          tenant.status === 'ACTIVE'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {tenant.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1 flex-1">
            <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Menu Vertikal Gym
            </div>

            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href, item.exact);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all group ${
                    active
                      ? 'bg-gradient-to-r from-emerald-600/90 to-teal-600/80 text-white shadow-lg shadow-emerald-900/30 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 transition-colors shrink-0 ${
                        active ? 'text-white' : 'text-slate-400 group-hover:text-emerald-400'
                      }`}
                    />
                    <span className="truncate">{item.name}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-800 text-slate-400 group-hover:text-emerald-300 group-hover:bg-emerald-500/10'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}

            <div className="pt-4 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Integrasi & Sistem
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  Tenant ID
                </span>
                <span className="font-mono text-emerald-400 font-semibold">atmosfitnes</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  NFC Sync
                </span>
                <span className="text-[11px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-medium">
                  Real-time
                </span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/60">
                <span className="text-slate-400">Jam Sistem</span>
                <span className="font-mono text-slate-300 text-[11px]">{currentTime || '...'}</span>
              </div>
            </div>
          </nav>

          {/* Footer & Admin Switch */}
          <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
            <Link
              href="/admin"
              className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white transition text-xs border border-slate-700/50 group"
            >
              <span className="flex items-center gap-2">
                <Dumbbell className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400 transition-colors" />
                BoonTrack Super Admin
              </span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto max-h-screen">
        {/* Top Header Bar */}
        <header className="hidden md:flex items-center justify-between px-8 py-4 bg-slate-900/60 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Atmosfitnes Gym Control Hub</h2>
                <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  GATE & POS LIVE
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Tenant: <span className="text-slate-200 font-medium">atmosfitnes</span> &bull; RFID Gate &bull; Zumba Lt 2 &bull; POS Cafe &bull; Billing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-lg bg-slate-800/70 border border-slate-700/60 flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-slate-300 font-medium">ESP32 Gate Controller Online</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-800/70 border border-slate-700/60 text-xs font-mono text-slate-300">
              {currentTime}
            </div>
          </div>
        </header>

        {/* Page View Body */}
        <div className="p-4 md:p-8 flex-1">{children}</div>
      </main>
    </div>
  );
}
