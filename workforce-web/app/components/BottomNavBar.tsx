'use client';

import React from 'react';
import {
  Clock,
  QrCode,
  Calendar,
  AlertTriangle,
  Radio,
  Users,
  MapPin,
  FileText,
  TrendingUp,
  Building2,
  CreditCard,
  LucideIcon,
} from 'lucide-react';

export type BwmRole = 'field_personnel' | 'supervisor' | 'master_reseller';

export interface NavTabItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: number | string;
  isPrimaryAction?: boolean;
}

export interface BottomNavBarProps {
  role: string;
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  items?: NavTabItem[];
}

export default function BottomNavBar({ role, activeTab, onSelectTab, items }: BottomNavBarProps) {
  // Derive navigation tabs strictly from authoritative role
  const tabs: NavTabItem[] = React.useMemo(() => {
    if (items && items.length > 0) return items;

    if (role === 'supervisor') {
      return [
        { id: 'radar', label: 'Live Radar', icon: Radio },
        { id: 'officers', label: 'Petugas', icon: Users },
        { id: 'checkpoints', label: 'Pos Patroli', icon: MapPin },
        { id: 'leaves', label: 'Izin Sakit', icon: FileText },
      ];
    }

    if (role === 'master_reseller') {
      return [
        { id: 'overview', label: 'Ringkasan', icon: TrendingUp },
        { id: 'roster', label: 'Personel', icon: Users },
        { id: 'facilities', label: 'Fasilitas', icon: Building2 },
        { id: 'billing', label: 'Lisensi', icon: CreditCard },
      ];
    }

    if (role === 'field_personnel') {
      return [
        { id: 'presence', label: 'Presensi', icon: Clock },
        { id: 'scan', label: 'Pindai QR', icon: QrCode, isPrimaryAction: true },
        { id: 'roster', label: 'Jadwal', icon: Calendar },
        { id: 'incidents', label: 'Lapor', icon: AlertTriangle },
      ];
    }

    // Fail-closed: no navigation tabs for unknown, admin, or missing roles
    return [];
  }, [role, items]);

  // Fail-closed: do not render navigation bar if no authorized tabs exist
  if (tabs.length === 0) {
    return null;
  }

  return (
    <nav
      role="navigation"
      aria-label="Mobile Navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg px-2 py-1 safe-area-bottom"
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          if (tab.isPrimaryAction) {
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                aria-label={tab.label}
                aria-pressed={isActive}
                className="relative -top-3 min-w-[52px] min-h-[52px] w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-lg flex flex-col items-center justify-center transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                style={{ backgroundColor: 'var(--brand-primary, #2563eb)' }}
              >
                <Icon className="w-6 h-6 stroke-[2.2]" aria-hidden="true" />
                <span className="text-[10px] font-bold mt-0.5 tracking-tight">{tab.label}</span>
              </button>
            );
          }

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              className={`min-w-[48px] min-h-[48px] flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition cursor-pointer select-none focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
                isActive
                  ? 'text-blue-600 font-bold bg-blue-50/70'
                  : 'text-slate-500 hover:text-slate-900 active:bg-slate-100'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.8]'}`} aria-hidden="true" />
                {tab.badge !== undefined && (
                  <span className="absolute -top-1 -right-2 px-1.5 py-0.2 text-[9px] font-bold bg-rose-500 text-white rounded-full">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-1 tracking-tight leading-none truncate max-w-[72px]">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
