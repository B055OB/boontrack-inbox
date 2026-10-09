'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Boxes,
  ExternalLink,
  Layers,
  Cpu,
  Wifi,
  Sparkles,
  Search,
  CheckCircle2,
  RefreshCw,
  Server,
  Smartphone,
  ShieldCheck,
  Building2,
  Dumbbell,
  Printer,
  Key,
} from 'lucide-react';

const MASTER_PIN = '998877';

interface AppRegistryItem {
  id: string;
  name: string;
  slug: string;
  category: 'POS_PERIPHERAL' | 'CIVIC_B2G' | 'ENTERPRISE_B2B' | 'GYM_GATE' | 'WHATSAPP_CLOUD' | 'CAPI_ENGINE';
  description: string;
  endpoint: string;
  liveUrl: string;
  status: 'ACTIVE' | 'DEVELOPMENT' | 'STANDBY';
  integrationType: 'Zero-Friction WhatsApp' | 'IoT Hardware API' | 'Meta Cloud Webhook' | 'FastAPI Microservice';
}

const APPS_DATA: AppRegistryItem[] = [
  {
    id: 'app-pos-printer',
    name: 'Zero-Friction POS & ESC/POS Kitchen Printer',
    slug: 'pos-receipt',
    category: 'POS_PERIPHERAL',
    description: 'Auto-trigger struk kasir & pesanan dapur via event bayar QRIS instan tanpa aplikasi tablet.',
    endpoint: '/api/v1/hardware/escpos',
    liveUrl: 'https://app.boontrack.com/pos',
    status: 'ACTIVE',
    integrationType: 'IoT Hardware API',
  },
  {
    id: 'app-smart-gateway',
    name: 'IoT Gate & Doorlock Automation',
    slug: 'smart-gate',
    category: 'POS_PERIPHERAL',
    description: 'Buka palang pintu / gate turnstile otomatis bagi pelanggan gym & coworking setelah verifikasi WhatsApp.',
    endpoint: '/api/v1/hardware/relay-doorlock',
    liveUrl: 'https://app.boontrack.com/gateway',
    status: 'ACTIVE',
    integrationType: 'IoT Hardware API',
  },
  {
    id: 'app-gym-membership',
    name: 'BoonTrack Gym & Fitness Turnstile Engine',
    slug: 'gym-gate',
    category: 'GYM_GATE',
    description: 'Manajemen member gym bulanan/harian, tiket QR pass WA, dan bypass NFC reader.',
    endpoint: '/api/gym/turnstile-ping',
    liveUrl: 'https://gym.boontrack.com',
    status: 'ACTIVE',
    integrationType: 'FastAPI Microservice',
  },
  {
    id: 'app-civic-b2g',
    name: 'Civic Tech B2G Pelayanan Publik',
    slug: 'civic-tech',
    category: 'CIVIC_B2G',
    description: 'Sistem pengaduan warga & surat kelurahan semi-otonom melalui WhatsApp Cloud API verified.',
    endpoint: '/api/v1/civic/dispatch',
    liveUrl: 'https://app.boontrack.com/civic',
    status: 'ACTIVE',
    integrationType: 'Zero-Friction WhatsApp',
  },
  {
    id: 'app-meta-cloud',
    name: 'Meta WhatsApp Business Cloud API Router',
    slug: 'wa-cloud-router',
    category: 'WHATSAPP_CLOUD',
    description: 'Webhook router pesan 24 jam interaktif, auto-reply naskah AI BoonPilot, dan delivery catalog.',
    endpoint: '/api/webhook/whatsapp',
    liveUrl: 'https://app.boontrack.com/connect',
    status: 'ACTIVE',
    integrationType: 'Meta Cloud Webhook',
  },
  {
    id: 'app-capi-engine',
    name: 'Meta CAPI & TikTok Events Gateway',
    slug: 'capi-telemetry',
    category: 'CAPI_ENGINE',
    description: 'Forwarder Purchase & AddToCart deduplication event server-side dengan 100% Match Quality.',
    endpoint: '/api/v1/capi/outbox',
    liveUrl: 'https://app.boontrack.com/telemetry',
    status: 'ACTIVE',
    integrationType: 'FastAPI Microservice',
  },
];

export default function DirectoryAppPage() {
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');

  const [apps, setApps] = useState<AppRegistryItem[]>(APPS_DATA);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isAuth = sessionStorage.getItem('super_admin_auth') === 'true';
      setIsAdminAuth(isAuth);
    }
  }, []);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPin === MASTER_PIN) {
      sessionStorage.setItem('super_admin_auth', 'true');
      setIsAdminAuth(true);
      setPinError('');
    } else {
      setPinError('PIN Super Admin salah!');
    }
  };

  const filteredApps = apps.filter((app) => {
    const matchesSearch =
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (filterCategory !== 'ALL' && app.category !== filterCategory) return false;
    return true;
  });

  if (!isAdminAuth) {
    return (
      <main className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center mx-auto mb-3 font-bold text-xl">
            📦
          </div>
          <h1 className="text-lg font-bold text-white mb-1">Directory App Superadmin</h1>
          <p className="text-xs text-slate-400 mb-5">
            Otorisasi diperlukan untuk mengakses app registry ekosistem app.boontrack.com.
          </p>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              placeholder="PIN Super Admin"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              className="w-full text-center tracking-widest px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500"
              required
            />
            {pinError && <p className="text-[11px] text-rose-400">{pinError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-orange-600/30 cursor-pointer"
            >
              Buka Directory App
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100 p-6 md:p-10 antialiased selection:bg-orange-600 selection:text-white">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-850 transition cursor-pointer"
              title="Kembali ke Executive Control Plane"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  App Registry &amp; Extensions
                </span>
                <span className="text-[11px] text-slate-400">&bull; app.boontrack.com</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Gateway Connected
                </span>
              </div>
              <h1 className="text-xl font-black text-white mt-1">Directory App Registry</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/app-portal"
              target="_blank"
              className="px-3 py-2 rounded-xl bg-orange-600/20 hover:bg-orange-600/30 text-orange-300 hover:text-white border border-orange-500/30 text-xs font-bold transition flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Buka Portal Publik</span>
            </Link>
          </div>
        </div>

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-400">Total Registered Apps</span>
              <span className="text-2xl font-black text-white mt-1 block">{apps.length} Modul</span>
              <span className="text-[10px] text-slate-500">Hardware &amp; Cloud Connectors</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 text-orange-400 flex items-center justify-center">
              <Boxes className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-emerald-300">Active Live Connectors</span>
              <span className="text-2xl font-black text-emerald-400 mt-1 block">
                {apps.filter((a) => a.status === 'ACTIVE').length} Active
              </span>
              <span className="text-[10px] text-emerald-400/70">100% Production uptime</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-indigo-300">Meta API &amp; IoT Hardware</span>
              <span className="text-2xl font-black text-indigo-400 mt-1 block">Hybrid Mesh</span>
              <span className="text-[10px] text-indigo-400/70">Cloud-to-Edge Relay</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Cpu className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari modul aplikasi atau endpoint..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setFilterCategory('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filterCategory === 'ALL' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              Semua ({apps.length})
            </button>
            <button
              onClick={() => setFilterCategory('POS_PERIPHERAL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filterCategory === 'POS_PERIPHERAL' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              Hardware POS
            </button>
            <button
              onClick={() => setFilterCategory('CIVIC_B2G')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filterCategory === 'CIVIC_B2G' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              Civic B2G
            </button>
            <button
              onClick={() => setFilterCategory('WHATSAPP_CLOUD')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filterCategory === 'WHATSAPP_CLOUD' ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              WA Cloud API
            </button>
          </div>
        </div>

        {/* App Registry Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredApps.map((app) => (
            <div
              key={app.id}
              className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between hover:border-slate-700 transition space-y-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-orange-500/15 text-orange-300 border border-orange-500/30">
                    {app.integrationType}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {app.status}
                  </span>
                </div>

                <h3 className="text-base font-black text-white leading-snug">{app.name}</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">{app.description}</p>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Endpoint API:</span>
                  <span className="font-mono text-slate-300">{app.endpoint}</span>
                </div>

                <div className="flex items-center justify-end">
                  <a
                    href={app.liveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <span>Buka Aplikasi</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
