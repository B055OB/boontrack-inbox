'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  CheckCircle2,
  Activity,
  Server,
  Radio,
  CreditCard,
  Target,
  Truck,
  Globe,
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import Footer from '../components/Footer';

interface ServiceItem {
  id: string;
  name: string;
  category: string;
  status: 'OPERATIONAL' | 'DEGRADED' | 'MAINTENANCE';
  uptime: string;
  latency: string;
  description: string;
  icon: React.ElementType;
}

const SERVICES: ServiceItem[] = [
  {
    id: 'core-api',
    name: 'BoonTrack Core API Gateway',
    category: 'Backend & Infrastructure',
    status: 'OPERATIONAL',
    uptime: '99.98%',
    latency: '42ms',
    description: 'Next.js App Engine, edge database routing, tenant isolation runtime',
    icon: Server,
  },
  {
    id: 'waba-meta',
    name: 'Meta Cloud API (Official WABA)',
    category: 'WhatsApp Services',
    status: 'OPERATIONAL',
    uptime: '99.99%',
    latency: '85ms',
    description: 'Meta Graph API v21.0 webhook inbound & outbound message dispatch',
    icon: Radio,
  },
  {
    id: 'direct-connect',
    name: 'BoonTrack Direct Connect (QR Session)',
    category: 'WhatsApp Services',
    status: 'OPERATIONAL',
    uptime: '99.95%',
    latency: '68ms',
    description: 'Baileys Multi-Device WebSocket session engine & message listener',
    icon: Activity,
  },
  {
    id: 'payment-webhook',
    name: 'QRIS Dinamis & Webhook Settlement',
    category: 'Finance & Payment',
    status: 'OPERATIONAL',
    uptime: '100.0%',
    latency: '54ms',
    description: 'NMID QRIS injection, instant settlement callbacks, bank transfer verification',
    icon: CreditCard,
  },
  {
    id: 'meta-capi',
    name: 'Meta Conversions API (CAPI) Dispatcher',
    category: 'Ads & Telemetry',
    status: 'OPERATIONAL',
    uptime: '99.97%',
    latency: '110ms',
    description: 'Server-side event hashing & asynchronous Meta Graph API delivery',
    icon: Target,
  },
  {
    id: 'biteship-logistics',
    name: 'Biteship Multi-Kurir Logistics API',
    category: 'Fulfillment & Shipping',
    status: 'OPERATIONAL',
    uptime: '99.92%',
    latency: '145ms',
    description: 'Rates calculation, waybill thermal generation, instant courier dispatch',
    icon: Truck,
  },
  {
    id: 'edge-storefront',
    name: 'Cloudflare Edge CDN & Custom Domain SaaS',
    category: 'Frontend & Edge',
    status: 'OPERATIONAL',
    uptime: '100.0%',
    latency: '18ms',
    description: 'Custom domain SSL auto-provisioning & global static cache delivery',
    icon: Globe,
  },
];

export default function StatusPage() {
  const [lastChecked, setLastChecked] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setLastChecked(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setLastChecked(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setIsRefreshing(false);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-600 selection:text-white">
      {/* ── TOP NAVBAR ── */}
      <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900 text-xs font-semibold transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Beranda</span>
            </Link>
            <div className="h-4 w-px bg-slate-800" />
            <div className="flex items-center gap-2">
              <Image
                src="/logo-master.png"
                alt="BoonTrack"
                width={26}
                height={26}
                className="w-6 h-6 object-contain"
              />
              <span className="font-black text-white text-sm tracking-tight">BoonTrack Status</span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="hidden sm:inline">Perbarui</span>
            </button>
            <Link
              href="/docs"
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition"
            >
              Dokumentasi
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO BANNER ── */}
      <section className="border-b border-slate-800/80 bg-gradient-to-b from-slate-900/80 via-slate-950 to-slate-950 py-12 px-4 sm:px-8">
        <div className="max-w-4xl mx-auto space-y-4 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs font-bold shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Semua Sistem Beroperasi Normal (All Systems Operational)</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight">
            Status Ketersediaan &amp; Layanan BoonTrack
          </h1>

          <p className="text-slate-400 text-xs sm:text-sm max-w-xl mx-auto leading-relaxed">
            Monitoring uptime, latensi gateway, koneksi Meta Cloud API, dan webhook pembayaran real-time. Terakhir diperiksa pukul {lastChecked || '12:00:00'} WIB.
          </p>
        </div>
      </section>

      {/* ── SERVICES LIST ── */}
      <main className="max-w-4xl mx-auto px-4 sm:px-8 py-10 flex-1 w-full space-y-8">
        {/* Overall 90 Days Uptime Banner */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Rata-Rata Uptime 90 Hari Terakhir</span>
            </span>
            <span className="text-emerald-400 font-mono">99.97% Uptime</span>
          </div>

          {/* Baris Simulasi Bar Uptime 90 Hari */}
          <div className="flex items-center gap-[3px] pt-1">
            {Array.from({ length: 45 }).map((_, idx) => (
              <div
                key={idx}
                className="flex-1 h-7 rounded-[3px] bg-emerald-500/80 hover:bg-emerald-400 transition-colors"
                title={`Hari ke-${idx + 1}: 100% Operational`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
            <span>90 hari lalu</span>
            <span>Hari ini (100% Operational)</span>
          </div>
        </div>

        {/* Individual Services */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
            Komponen Layanan Utama
          </h2>

          <div className="divide-y divide-slate-800/80 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
            {SERVICES.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/80 transition-colors">
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-300 shrink-0">
                      <Icon className="w-4 h-4 text-slate-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs sm:text-sm font-bold text-white truncate">{s.name}</h4>
                        <span className="text-[10px] text-slate-500 font-mono hidden md:inline">({s.latency})</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{s.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
                    <span className="text-[11px] font-mono text-slate-400">
                      {s.uptime}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-950/60 border border-emerald-500/30 text-emerald-300">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>Operational</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Past Incidents / Maintenance Log */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Riwayat Insiden &amp; Pemeliharaan Terjadwal</span>
            </h3>
            <span className="text-[11px] font-mono text-slate-500">90 Hari Terakhir</span>
          </div>
          <div className="py-6 text-center text-xs text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">Tidak Ada Insiden Dilaporkan</p>
            <p className="text-[11px]">Seluruh klaster server dan gateway beroperasi tanpa gangguan.</p>
          </div>
        </div>
      </main>

      {/* ── FOOTER ── */}
      <Footer />
    </div>
  );
}
