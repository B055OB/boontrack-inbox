'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function BwmModernLandingPage() {
  // Live Operations Monitor Interactive Mock State
  const [activeTab, setActiveTab] = useState<'feed' | 'radar' | 'incidents'>('feed');

  // Interactive Sandbox Demo Request Modal State
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [demoForm, setDemoForm] = useState({
    fullName: '',
    workEmail: '',
    companyName: '',
    officerCount: '25-100',
    notes: '',
  });
  const [demoSubmitted, setDemoSubmitted] = useState(false);

  function handleDemoSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!demoForm.fullName || !demoForm.workEmail) return;
    setDemoSubmitted(true);
  }

  // Live Mock Data for Command Center Widget
  const mockFeed = [
    {
      id: 1,
      officer: 'Officer Sarah Jenkins',
      badge: 'OP-4821',
      checkpoint: 'North Lobby Main Gate',
      time: '12:14:02 UTC+7',
      status: 'VERIFIED',
      distance: '4m geofence',
      verification: 'Dynamic QR + Liveness',
    },
    {
      id: 2,
      officer: 'Officer Marcus Sterling',
      badge: 'OP-3914',
      checkpoint: 'Substation Perimeter B',
      time: '12:11:45 UTC+7',
      status: 'VERIFIED',
      distance: '7m geofence',
      verification: 'Dynamic QR + Liveness',
    },
    {
      id: 3,
      officer: 'Officer Lucas Hayes',
      badge: 'OP-5108',
      checkpoint: 'Logistics Terminal 4 Loading Dock',
      time: '12:08:20 UTC+7',
      status: 'VERIFIED',
      distance: '2m geofence',
      verification: 'Dynamic QR + Liveness',
    },
    {
      id: 4,
      officer: 'Officer Elena Rostova',
      badge: 'OP-6219',
      checkpoint: 'South Perimeter Access Gate',
      time: '12:04:10 UTC+7',
      status: 'VERIFIED',
      distance: '11m geofence',
      verification: 'Dynamic QR + Liveness',
    },
  ];

  const mockIncidents = [
    {
      id: 104,
      title: 'Emergency Exit Door Propped Open',
      location: 'Logistics Terminal 4 Loading Dock',
      time: '11:42 UTC+7',
      reporter: 'Officer Lucas Hayes',
      priority: 'HIGH',
      status: 'DISPATCHED',
    },
    {
      id: 102,
      title: 'Perimeter Fence Sensor Alarm',
      location: 'South Perimeter Access Gate',
      time: '10:15 UTC+7',
      reporter: 'Officer Elena Rostova',
      priority: 'MEDIUM',
      status: 'INVESTIGATING',
    },
    {
      id: 99,
      title: 'Barrier Gate Maintenance Flagged',
      location: 'North Lobby Main Gate',
      time: '09:30 UTC+7',
      reporter: 'Officer Sarah Jenkins',
      priority: 'LOW',
      status: 'RESOLVED',
    },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-blue-600 selection:text-white">
      {/* ------------------------------------------------------------- */}
      {/* 1. HEADER & NAVBAR (Sticky Blur White)                        */}
      {/* ------------------------------------------------------------- */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/90 border-b border-slate-200 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 sm:h-20 flex items-center justify-between">
          {/* Brand Logo & Subtext */}
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center p-1.5 shadow-xs group-hover:border-blue-300 transition">
              <Image src="/logo.png" alt="BWM Logo" width={36} height={36} className="object-contain" priority />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight text-slate-900">BWM</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 tracking-wide">
                  ENTERPRISE PLATFORM
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium tracking-tight">Workforce Management OS</p>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center space-x-8 text-sm font-medium text-slate-600">
            <a href="#solutions" className="hover:text-blue-600 transition-colors">
              Solutions
            </a>
            <a href="#features" className="hover:text-blue-600 transition-colors">
              Core Features
            </a>
            <a href="#comparison" className="hover:text-blue-600 transition-colors">
              Comparison
            </a>
            <a href="#white-label" className="hover:text-blue-600 transition-colors">
              White-Label
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center space-x-3">
            <Link
              href="/login"
              className="text-xs sm:text-sm font-semibold text-slate-700 hover:text-blue-600 px-3 py-2 rounded-xl transition"
            >
              Sign In
            </Link>
            <button
              onClick={() => setIsDemoModalOpen(true)}
              className="hidden sm:inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs sm:text-sm shadow-sm transition cursor-pointer"
            >
              Request Demo
            </button>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      {/* 2. HERO SECTION — GLOBAL MAIN AGENT INFRASTRUCTURE            */}
      {/* ------------------------------------------------------------- */}
      <section className="relative pt-12 pb-20 sm:pt-16 sm:pb-28 overflow-hidden bg-gradient-to-b from-slate-50 via-white to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            {/* Secondary Headline / Kicker */}
            <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold tracking-wide shadow-xs">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
              <span>Become the Country Main Agent</span>
            </div>

            {/* Primary Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.12]">
              Build Your Country&apos;s Workforce Management{' '}
              <span className="text-blue-600">Network.</span>
            </h1>

            {/* Brand Statement & Subheadline */}
            <div className="space-y-2">
              <p className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight">
                Your market. Your brand. Your workforce network.
              </p>
              <p className="text-base text-slate-600 leading-relaxed font-normal max-w-2xl mx-auto">
                Operate sovereign workforce infrastructure across thousands of distributed client facilities. Deploy white-label patrol verification, automated dual-dispatch, and biometric attendance with zero dedicated hardware lock-in.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsDemoModalOpen(true)}
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition text-center cursor-pointer active:scale-95"
              >
                Become a Country Main Agent
              </button>
              <a
                href="#architecture"
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold text-sm transition text-center shadow-xs"
              >
                Explore the Platform
              </a>
            </div>

            {/* Three Value Pillars */}
            <div className="pt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left max-w-2xl mx-auto">
              <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-xs">
                <div className="text-xs font-bold text-blue-600">01 Own Your Brand</div>
                <div className="text-[11px] text-slate-600 mt-0.5">Dedicated subdomain, custom logo &amp; theme</div>
              </div>
              <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-xs">
                <div className="text-xs font-bold text-blue-600">02 Activate Branches</div>
                <div className="text-[11px] text-slate-600 mt-0.5">Instant facility deployment in minutes</div>
              </div>
              <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-xs">
                <div className="text-xs font-bold text-blue-600">03 Scale Your Network</div>
                <div className="text-[11px] text-slate-600 mt-0.5">Bulk credit pool with rolling 30-day FIFO</div>
              </div>
            </div>
          </div>

          {/* Interactive Mockup Widget: Live Operations Command Center */}
          <div className="mt-12 sm:mt-16 max-w-5xl mx-auto">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              {/* Header Bar */}
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="flex space-x-1.5">
                    <span className="w-3 h-3 rounded-full bg-slate-300"></span>
                    <span className="w-3 h-3 rounded-full bg-slate-300"></span>
                    <span className="w-3 h-3 rounded-full bg-slate-300"></span>
                  </div>
                  <div className="h-4 w-px bg-slate-200"></div>
                  <div>
                    <h2 className="text-xs sm:text-sm font-bold text-slate-800">
                      Live Operations Monitor &mdash; Metro Financial Tower Hub
                    </h2>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 tracking-wider uppercase">
                      DEMO DATA / SIMULATED
                    </span>
                    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>14 Officers Active</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Tabs Bar */}
              <div className="px-5 pt-3 bg-white border-b border-slate-200 flex space-x-6 text-xs font-semibold">
                <button
                  onClick={() => setActiveTab('feed')}
                  className={`pb-3 border-b-2 transition cursor-pointer ${
                    activeTab === 'feed'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Live Patrol Stream
                </button>
                <button
                  onClick={() => setActiveTab('radar')}
                  className={`pb-3 border-b-2 transition cursor-pointer ${
                    activeTab === 'radar'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Perimeter Radar
                </button>
                <button
                  onClick={() => setActiveTab('incidents')}
                  className={`pb-3 border-b-2 transition cursor-pointer ${
                    activeTab === 'incidents'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Active Incidents (3)
                </button>
              </div>

              {/* Tab Content 1: Live Patrol Stream */}
              {activeTab === 'feed' && (
                <div className="p-4 sm:p-6 divide-y divide-slate-100">
                  {mockFeed.map((item) => (
                    <div key={item.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                      <div className="flex items-center space-x-3.5">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100">
                          {item.officer.split(' ')[1]?.[0] || 'O'}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-bold text-slate-900">{item.officer}</span>
                            <span className="text-[11px] font-mono text-slate-500 font-medium">({item.badge})</span>
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5 flex items-center space-x-2">
                            <span>{item.checkpoint}</span>
                            <span>&bull;</span>
                            <span className="text-slate-500">{item.distance}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                          <span>&check;</span>
                          <span>{item.status}</span>
                        </span>
                        <div className="text-[11px] text-slate-600 mt-1 font-mono">{item.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab Content 2: Perimeter Radar */}
              {activeTab === 'radar' && (
                <div className="p-6 sm:p-8 bg-slate-50 text-center">
                  <div className="max-w-md mx-auto space-y-4">
                    <div className="w-20 h-20 mx-auto rounded-full bg-blue-100 border-2 border-blue-500/30 flex items-center justify-center relative">
                      <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                        ✦
                      </span>
                      <span className="absolute inset-0 rounded-full border border-blue-400 animate-ping opacity-30"></span>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Perimeter Geofence Active &bull; 15-Meter Radius</h3>
                      <p className="text-xs text-slate-600 mt-1">
                        High-precision geofencing validates GPS telemetry against facility boundaries before allowing checkpoint scans.
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2 text-left">
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                        <div className="text-[10px] text-slate-500 font-medium">Facility Radius</div>
                        <div className="text-xs font-bold text-slate-800 mt-0.5">15 Meters</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                        <div className="text-[10px] text-slate-500 font-medium">GPS Accuracy</div>
                        <div className="text-xs font-bold text-slate-800 mt-0.5">&plusmn; 2.1 Meters</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                        <div className="text-[10px] text-slate-500 font-medium">Spoof Rejections</div>
                        <div className="text-xs font-bold text-emerald-600 mt-0.5">100% Protected</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab Content 3: Active Incidents */}
              {activeTab === 'incidents' && (
                <div className="p-4 sm:p-6 divide-y divide-slate-100">
                  {mockIncidents.map((incident) => (
                    <div key={incident.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              incident.priority === 'HIGH'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : incident.priority === 'MEDIUM'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {incident.priority} PRIORITY
                          </span>
                          <span className="text-sm font-bold text-slate-900">{incident.title}</span>
                        </div>
                        <div className="text-xs text-slate-600 mt-1">
                          <span>{incident.location}</span> &bull; Reported by{' '}
                          <span className="font-medium text-slate-700">{incident.reporter}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                          {incident.status}
                        </span>
                        <div className="text-[11px] text-slate-600 mt-1 font-mono">{incident.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Widget Footer */}
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-600 gap-2 font-medium">
                <div className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>Encrypted stream &bull; Sub-second sync &bull; 99.9% uptime</span>
                </div>
                <div>Connected to Branch: Metro Financial Tower Hub</div>
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* ------------------------------------------------------------- */}
      {/* 2.5 MULTI-TENANT ARCHITECTURE DIAGRAM SECTION (#architecture)  */}
      {/* ------------------------------------------------------------- */}
      <section id="architecture" className="py-20 sm:py-28 bg-slate-50 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h2 className="text-xs font-bold text-blue-600 tracking-wider uppercase">Isolated Command Topology</h2>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Sovereign Multi-Tenant Architecture
            </h3>
            <p className="text-base text-slate-600 leading-relaxed font-normal">
              Every country network operates with strict data isolation, dedicated cryptographic keys, and independent domain routing.
            </p>
          </div>

          {/* Architecture Visual Diagram Flow */}
          <div className="mt-14 max-w-4xl mx-auto space-y-4">
            {/* Level 1: Country Main Agent */}
            <div className="p-6 bg-white border-2 border-blue-600 rounded-2xl shadow-md text-center space-y-2 relative">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-blue-600 text-white font-extrabold text-[10px] rounded-full uppercase tracking-widest">
                Tier 1 &bull; Sovereign Root
              </span>
              <div className="text-lg font-black text-slate-900">
                Country Main Agent (Platform Master Operator)
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-600">
                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold border border-blue-100">Own Sovereign Brand</span>
                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold border border-blue-100">Dedicated Custom Domain</span>
                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold border border-blue-100">Wholesale Pass Quota Pool</span>
                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold border border-blue-100">Retail Billing Autonomy</span>
              </div>
            </div>

            {/* Flow Connector Arrow */}
            <div className="flex justify-center">
              <div className="w-0.5 h-6 bg-slate-300"></div>
            </div>

            {/* Level 2: Agency Networks */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agency Client A</div>
                <div className="text-sm font-bold text-slate-900">Apex Commercial Guarding</div>
                <div className="text-xs text-slate-500">London City &bull; 8 Branches</div>
              </div>
              <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agency Client B</div>
                <div className="text-sm font-bold text-slate-900">Satya Garda Perkasa</div>
                <div className="text-xs text-slate-500">Jakarta Hub &bull; 14 Branches</div>
              </div>
              <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agency Client C</div>
                <div className="text-sm font-bold text-slate-900">Highland Facility Watch</div>
                <div className="text-xs text-slate-500">Singapore Fleet &bull; 6 Branches</div>
              </div>
            </div>

            {/* Flow Connector Arrow */}
            <div className="flex justify-center">
              <div className="w-0.5 h-6 bg-slate-300"></div>
            </div>

            {/* Level 3: Facilities / Branches */}
            <div className="p-4 bg-slate-100/80 border border-slate-200 rounded-xl text-center space-y-2">
              <div className="text-xs font-bold text-slate-800">
                Operational Facilities &amp; Branch Desks
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-600 font-medium">
                <span className="px-2 py-0.5 rounded bg-white border border-slate-200">Commercial Office Towers</span>
                <span className="px-2 py-0.5 rounded bg-white border border-slate-200">Logistics Cargo Terminals</span>
                <span className="px-2 py-0.5 rounded bg-white border border-slate-200">Industrial Manufacturing Campuses</span>
                <span className="px-2 py-0.5 rounded bg-white border border-slate-200">Residential Estates</span>
              </div>
            </div>

            {/* Flow Connector Arrow */}
            <div className="flex justify-center">
              <div className="w-0.5 h-6 bg-slate-300"></div>
            </div>

            {/* Level 4: Personnel & Field Operations */}
            <div className="p-5 bg-blue-900 text-white rounded-xl shadow-sm space-y-2 text-center">
              <div className="text-xs font-bold text-blue-200 uppercase tracking-wider">Edge Telemetry &amp; Field Verification</div>
              <div className="text-base font-extrabold">Personnel Mobile App (PWA) &bull; Zero Hardware Setup</div>
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-blue-100">
                <span>Dynamic Cryptographic QR</span> &bull;
                <span>Biometric Face Liveness</span> &bull;
                <span>GPS Polygon Geofencing</span> &bull;
                <span>Automated Dual-Dispatch</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 3. INDUSTRY CHALLENGES SECTION (OPERATIONAL PAIN POINTS)      */}
      {/* ------------------------------------------------------------- */}
      <section id="solutions" className="py-20 sm:py-28 bg-slate-50 border-t border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h2 className="text-xs font-bold text-blue-600 tracking-wider uppercase">Operational Obstacles</h2>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Why Traditional Guard Tour Methods Fall Short
            </h3>
            <p className="text-base text-slate-600 leading-relaxed font-normal">
              Facility managers and security contractors face operational blind spots when relying on disconnected tools.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card 1 */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 text-xl font-bold mb-5">
                ⏳
              </div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">Mechanical Punch Clocks</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Paper records offer zero real-time visibility, and physical keys are easily shared among personnel
                without audit trails.
              </p>
            </div>

            {/* Card 2 */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 text-xl font-bold mb-5">
                🔌
              </div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">Offline RFID Wands</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Require manual physical docking via USB cables; supervisors only discover missed rounds days or weeks
                later.
              </p>
            </div>

            {/* Card 3 */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 text-xl font-bold mb-5">
                🛑
              </div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">Fixed Wall Biometrics</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Verify station arrival but provide zero tracking for mobile perimeter rounds, blind spots, or scheduled
                routes.
              </p>
            </div>

            {/* Card 4 */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 text-xl font-bold mb-5">
                💬
              </div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">Unstructured Messaging</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Chat apps flood supervisors with unindexed photos lacking verified timestamps, GPS proof, or structured
                SLA records.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 4. CORE FEATURE CAPABILITIES                                  */}
      {/* ------------------------------------------------------------- */}
      <section id="features" className="py-20 sm:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h2 className="text-xs font-bold text-blue-600 tracking-wider uppercase">Engineered for Accuracy</h2>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Comprehensive Workforce &amp; Patrol Capabilities
            </h3>
            <p className="text-base text-slate-600 leading-relaxed font-normal">
              Everything your agency needs to monitor, verify, and enforce operational excellence in the field.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Feature 1 */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                  />
                </svg>
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3">Dynamic Anti-Counterfeit Checkpoints</h4>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Rotating cryptographic QR codes prevent screenshot sharing, photo duplication, and off-site scanning.
                Each checkpoint token changes dynamically to ensure the officer is physically present.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3">Facial Liveness &amp; Dual-Band GPS</h4>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Perimeter geofencing with real-time biometric liveness detection blocks mock locations, GPS emulators,
                and proxy attendance. Verifies true physical identity at every scan.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3">Instant Incident Escalation</h4>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Automated alerts for missed checkpoints, overdue patrols, and emergency incidents dispatch instantly to
                supervisors and management desks with full photo and GPS audit trails.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3">100% White-Label Agency Architecture</h4>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Deploy with your agency brand, custom domain, corporate colors, and tailored client portals with
                complete vendor independence. Keep your client relationships entirely yours.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 5. OPERATIONAL CAPABILITY COMPARISON                          */}
      {/* ------------------------------------------------------------- */}
      <section id="comparison" className="py-20 sm:py-28 bg-slate-50 border-t border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h2 className="text-xs font-bold text-blue-600 tracking-wider uppercase">Objective Evaluation</h2>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Operational Capability Comparison
            </h3>
            <p className="text-base text-slate-600 leading-relaxed font-normal">
              An objective evaluation of standard field monitoring methodologies.
            </p>
          </div>

          <div className="mt-14 overflow-x-auto">
            <div className="inline-block min-w-full align-middle">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 font-bold text-slate-700">
                    <tr>
                      <th scope="col" className="py-4 px-6">
                        CAPABILITY
                      </th>
                      <th scope="col" className="py-4 px-4 text-slate-500 font-semibold">
                        MECHANICAL CLOCKS
                      </th>
                      <th scope="col" className="py-4 px-4 text-slate-500 font-semibold">
                        OFFLINE WANDS
                      </th>
                      <th scope="col" className="py-4 px-4 text-slate-500 font-semibold">
                        WALL READERS
                      </th>
                      <th scope="col" className="py-4 px-6 bg-blue-50/70 text-blue-800 font-extrabold border-l border-blue-200">
                        BWM PLATFORM
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-4 px-6 font-semibold text-slate-900">Hardware Deployment</td>
                      <td className="py-4 px-4 text-slate-600">Specialized hardware</td>
                      <td className="py-4 px-4 text-slate-600">Docking wands</td>
                      <td className="py-4 px-4 text-slate-600">Fixed wall units</td>
                      <td className="py-4 px-6 bg-blue-50/30 text-blue-900 font-bold border-l border-blue-100">
                        Zero (Standard smartphones)
                      </td>
                    </tr>
                    <tr>
                      <td className="py-4 px-6 font-semibold text-slate-900">Live Telemetry</td>
                      <td className="py-4 px-4 text-slate-600">Manual paper log</td>
                      <td className="py-4 px-4 text-slate-600">Delayed offline sync</td>
                      <td className="py-4 px-4 text-slate-600">Clock-in only</td>
                      <td className="py-4 px-6 bg-blue-50/30 text-blue-900 font-bold border-l border-blue-100">
                        Real-time immediate sync
                      </td>
                    </tr>
                    <tr>
                      <td className="py-4 px-6 font-semibold text-slate-900">Anti-Spoofing &amp; GPS</td>
                      <td className="py-4 px-4 text-slate-600">Vulnerable to pass-along</td>
                      <td className="py-4 px-4 text-slate-600">Detachable RFID tags</td>
                      <td className="py-4 px-4 text-slate-600">Station-locked</td>
                      <td className="py-4 px-6 bg-blue-50/30 text-blue-900 font-bold border-l border-blue-100">
                        Biometric liveness &amp; dynamic QR
                      </td>
                    </tr>
                    <tr>
                      <td className="py-4 px-6 font-semibold text-slate-900">Audit &amp; Reporting</td>
                      <td className="py-4 px-4 text-slate-600">Multi-day manual recap</td>
                      <td className="py-4 px-4 text-slate-600">Manual docking &amp; export</td>
                      <td className="py-4 px-4 text-slate-600">Static report</td>
                      <td className="py-4 px-6 bg-blue-50/30 text-blue-900 font-bold border-l border-blue-100">
                        Instant 1-click digital audit
                      </td>
                    </tr>
                    <tr>
                      <td className="py-4 px-6 font-semibold text-slate-900">Incident Escalation</td>
                      <td className="py-4 px-4 text-slate-600">None</td>
                      <td className="py-4 px-4 text-slate-600">None</td>
                      <td className="py-4 px-4 text-slate-600">None</td>
                      <td className="py-4 px-6 bg-blue-50/30 text-blue-900 font-bold border-l border-blue-100">
                        Automated instant notification
                      </td>
                    </tr>
                    <tr>
                      <td className="py-4 px-6 font-semibold text-slate-900">Agency White-Label</td>
                      <td className="py-4 px-4 text-slate-600">Vendor brand</td>
                      <td className="py-4 px-4 text-slate-600">Vendor brand</td>
                      <td className="py-4 px-4 text-slate-600">Vendor brand</td>
                      <td className="py-4 px-6 bg-blue-50/30 text-blue-900 font-bold border-l border-blue-100">
                        Full brand &amp; domain customization
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 6. GLOBAL WHITE-LABEL & MAIN AGENT SECTION                    */}
      {/* ------------------------------------------------------------- */}
      <section id="white-label" className="py-20 sm:py-28 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h2 className="text-xs font-bold text-blue-600 tracking-wider uppercase">Built for Contractors</h2>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Built for Security Contractors &amp; Main Agents
            </h3>
            <p className="text-base text-slate-600 leading-relaxed font-normal">
              Deliver sovereign patrol monitoring directly under your own brand identity across thousands of locations.
            </p>
          </div>

          {/* Three Live White-Label Showcase Cards */}
          <div className="mt-12">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center mb-6">
              Live Sovereign Brands Powered by BWM Engine
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Showcase 1: Apex */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white font-extrabold flex items-center justify-center text-sm">
                      A
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">Apex Security Services Ltd</div>
                      <div className="text-[10px] text-emerald-600 font-mono">apex.workforce.boontrack.com</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    London &bull; UK
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Custom emerald theme, enterprise sovereign tenant, managing 24 commercial tower branches.
                </p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                  <span>Pool: 120 Passes</span>
                  <span className="text-emerald-600 font-bold">100% Isolated</span>
                </div>
              </div>

              {/* Showcase 2: Satya */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 text-amber-400 font-extrabold flex items-center justify-center text-sm border border-amber-400/40">
                      S
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">Satya Garda Perkasa</div>
                      <div className="text-[10px] text-blue-600 font-mono">satya.workforce.boontrack.com</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    Jakarta &bull; ID
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  National security agency deployment, gold &amp; navy palette, 14 corporate logistics facilities.
                </p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                  <span>Pool: 250 Passes</span>
                  <span className="text-blue-600 font-bold">100% Isolated</span>
                </div>
              </div>

              {/* Showcase 3: Highland */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-extrabold flex items-center justify-center text-sm">
                      H
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">Highland Facility Watch</div>
                      <div className="text-[10px] text-sky-600 font-mono">highland.workforce.boontrack.com</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                    Singapore &bull; SG
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Critical infrastructure and maritime facility patrol operations with high-frequency check cycles.
                </p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                  <span>Pool: 80 Passes</span>
                  <span className="text-sky-600 font-bold">100% Isolated</span>
                </div>
              </div>
            </div>
          </div>

          {/* Pass Commercial Model Visualization (4-Step Cycle) */}
          <div className="mt-16 bg-slate-50 border border-slate-200 rounded-3xl p-8 sm:p-12 space-y-8">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <span className="text-[10px] font-extrabold uppercase px-3 py-1 rounded-full bg-blue-100 text-blue-800 tracking-wider">
                COMMERCIAL PASS ECONOMICS
              </span>
              <h4 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                The 4-Step Wholesale Pass Model
              </h4>
              <p className="text-xs sm:text-sm text-slate-600">
                How Main Agents capture recurring margin with zero hardware capital expenditure.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                  1
                </div>
                <div className="text-sm font-bold text-slate-900">One-Time Setup</div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Fast tenant domain onboarding, logo customization, and sovereign database branch isolation.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                  2
                </div>
                <div className="text-sm font-bold text-slate-900">Prepaid BWM Pass</div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Main Agent acquires wholesale passes in bulk with marginal tiering ($4.50 &rarr; $3.80 &rarr; $3.20).
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                  3
                </div>
                <div className="text-sm font-bold text-slate-900">1 Pass = 30-Day Quota</div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  1 Pass activates 30-day operational license for 1 officer with strict FIFO batch consumption.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                  4
                </div>
                <div className="text-sm font-bold text-slate-900">Retail Autonomy</div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Main Agent freely packages downstream client billing, markup, and currency for maximum margins.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 7. CALL TO ACTION (CTA BANNER)                                */}
      {/* ------------------------------------------------------------- */}
      <section className="py-16 sm:py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-blue-50 border border-blue-200 rounded-3xl p-8 sm:p-14 text-center space-y-6 shadow-sm">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Ready to Upgrade Your Field Operations?
            </h2>
            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Equip your security and facility teams with enterprise-grade patrol verification today.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/login"
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm transition"
              >
                Schedule Sandbox Demo
              </Link>
              <button
                onClick={() => setIsDemoModalOpen(true)}
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-sm transition cursor-pointer"
              >
                Request Enterprise Quote
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* 8. FOOTER                                                     */}
      {/* ------------------------------------------------------------- */}
      <footer className="bg-white border-t border-slate-200 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <Image src="/logo.png" alt="BWM Logo" width={22} height={22} className="object-contain" />
            <span className="font-bold text-slate-700">BWM</span>
            <span>&bull;</span>
            <span>Workforce Management OS</span>
            <span>&bull;</span>
            <span>&copy; {new Date().getFullYear()} BoonTrack. All rights reserved.</span>
          </div>

          <div className="flex items-center space-x-6">
            <a href="#solutions" className="hover:text-slate-800 transition">
              Solutions
            </a>
            <a href="#features" className="hover:text-slate-800 transition">
              Capabilities
            </a>
            <a href="#comparison" className="hover:text-slate-800 transition">
              Comparison
            </a>
            <Link href="/login" className="hover:text-slate-800 transition">
              Operations Portal
            </Link>
          </div>
        </div>
      </footer>

      {/* ------------------------------------------------------------- */}
      {/* DEMO REQUEST MODAL                                            */}
      {/* ------------------------------------------------------------- */}
      {isDemoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 sm:p-8 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => {
                setIsDemoModalOpen(false);
                setDemoSubmitted(false);
              }}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 text-xl font-bold cursor-pointer"
            >
              &times;
            </button>

            {!demoSubmitted ? (
              <form onSubmit={handleDemoSubmit} className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Request Enterprise Sandbox Demo</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Connect with our solution engineering team for a customized walkthrough.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={demoForm.fullName}
                    onChange={(e) => setDemoForm({ ...demoForm, fullName: e.target.value })}
                    placeholder="e.g. Johnathan Vance"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Work Email</label>
                  <input
                    type="email"
                    required
                    value={demoForm.workEmail}
                    onChange={(e) => setDemoForm({ ...demoForm, workEmail: e.target.value })}
                    placeholder="vance@agency.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company / Agency Name</label>
                  <input
                    type="text"
                    value={demoForm.companyName}
                    onChange={(e) => setDemoForm({ ...demoForm, companyName: e.target.value })}
                    placeholder="e.g. Apex Security Services Ltd"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Estimated Field Personnel</label>
                  <select
                    value={demoForm.officerCount}
                    onChange={(e) => setDemoForm({ ...demoForm, officerCount: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white transition"
                  >
                    <option value="1-24">1 - 24 Officers</option>
                    <option value="25-100">25 - 100 Officers</option>
                    <option value="101-500">101 - 500 Officers</option>
                    <option value="500+">500+ Officers (Enterprise Multi-Branch)</option>
                  </select>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-sm transition cursor-pointer"
                  >
                    Submit Demo Request
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center py-6 space-y-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl font-bold">
                  &check;
                </div>
                <h3 className="text-lg font-bold text-slate-900">Demo Request Submitted</h3>
                <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                  Thank you, <span className="font-bold">{demoForm.fullName}</span>. An enterprise solution specialist
                  will reach out to <span className="font-bold">{demoForm.workEmail}</span> shortly with your sandbox
                  access.
                </p>
                <div className="pt-2">
                  <Link
                    href="/login"
                    className="inline-block px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition"
                  >
                    Proceed to Operations Portal &rarr;
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
