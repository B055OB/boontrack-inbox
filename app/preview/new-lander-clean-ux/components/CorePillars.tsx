'use client';

import React, { useState } from 'react';
import { 
  Key, 
  Zap, 
  ShieldCheck, 
  CheckCircle2, 
  Activity, 
  Users2, 
  Cpu,
  Smartphone,
  Check
} from 'lucide-react';

export default function CorePillars() {
  // State for Pillar 1 toggle (Pairing Code vs WABA)
  const [activeEngine, setActiveEngine] = useState<'pairing' | 'waba'>('pairing');

  // State for Pillar 2 interactive mock test
  const [isCapiSimulated, setIsCapiSimulated] = useState(false);

  return (
    <section id="pilar" className="py-20 bg-white border-t border-slate-200 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24">
        
        {/* Section Heading */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-mono font-bold">
            <Cpu className="w-3.5 h-3.5" />
            <span>Arsitektur SaaS Berstandar Enterprise</span>
          </span>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-950 tracking-tight">
            3 Pilar Teknologi yang Menggerakkan Bisnis Anda
          </h2>
          <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
            Infrastruktur otomatisasi backend modern yang menggabungkan perpesanan real-time, pelacakan iklan server-side, dan verifikasi pembayaran otomatis.
          </p>
        </div>

        {/* ── PILLAR 1: Dual-Engine WhatsApp Gateway (Text Left, Visual Right) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-mono font-bold">
              <span>Pilar 1</span>
              <span>•</span>
              <span>Connectivity Freedom</span>
            </div>
            
            <h3 className="text-2xl sm:text-3xl font-black text-slate-950 leading-tight">
              Dual-Engine WhatsApp Gateway: Zero-Token Pairing vs WABA Resmi
            </h3>
            
            <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
              Pilihan arsitektur fleksibel sesuai skala operasional bisnis Anda. Mulai secara instan tanpa biaya token percakapan atau tingkatkan ke Cloud API resmi Meta untuk skala siaran massal.
            </p>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Engine A (Zero-Token Gateway):</strong> Hubungkan nomor WhatsApp toko hanya dengan memasukkan <strong>8-Digit Pairing Code</strong>. Bebas biaya token Meta, cocok untuk UMKM &amp; brand mandiri.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Engine B (Official Meta WABA Cloud API):</strong> Skala pengiriman ribuan pesan per menit dengan centang hijau (verified badge) dan template resmi.
                </span>
              </div>
            </div>
          </div>

          {/* Visual Kanan: Interactive Engine Switcher Mockup */}
          <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-md">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-900">WhatsApp Gateway Mode</span>
              </div>
              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveEngine('pairing')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    activeEngine === 'pairing'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  8-Digit Code
                </button>
                <button
                  type="button"
                  onClick={() => setActiveEngine('waba')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    activeEngine === 'waba'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Meta WABA
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {activeEngine === 'pairing' ? (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-600 font-bold">
                      Zero-Token Pairing Active
                    </span>
                    <div className="text-xs text-slate-600">
                      Masukkan kode ini di WhatsApp HP Anda: <strong>Perangkat Tertaut &gt; Tautkan dengan Nomor Telepon</strong>
                    </div>
                    <div className="py-3 px-4 bg-slate-100 rounded-xl font-mono text-center text-lg sm:text-xl font-black text-slate-900 tracking-widest border border-slate-200">
                      BT88 - 9201
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono px-1">
                    <span>Status: Menunggu Tautan HP</span>
                    <span className="text-emerald-600 font-bold">Auto-Reconnect Enabled</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-blue-600 font-bold">
                      Meta Cloud WABA Connected
                    </span>
                    <div className="text-xs text-slate-600">
                      Toko terverifikasi menggunakan infrastruktur resmi Meta Cloud API v19.0.
                    </div>
                    <div className="flex items-center justify-between p-3 bg-blue-50/50 rounded-xl border border-blue-200 text-xs">
                      <span className="text-blue-900 font-bold">Phone Number ID:</span>
                      <span className="font-mono text-blue-800">109283746582910</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono px-1">
                    <span>Quality Rating: High (Green)</span>
                    <span className="text-blue-600 font-bold">Unlimited Tier 3</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── PILLAR 2: Meta & TikTok Conversions API (CAPI) (Visual Left, Text Right) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Visual Kiri: Interactive CAPI Event Simulator */}
          <div className="lg:col-span-6 order-2 lg:order-1 bg-slate-50 border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-md">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-600" />
                <span className="text-xs font-bold text-slate-900">Meta CAPI Cloud Dispatcher</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-mono font-bold">
                EMQ 9.6/10
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3 font-mono text-xs">
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Server Payload:</span>
                  <span className="text-emerald-600 font-bold">SHA-256 Hashed (GDPR/PDP)</span>
                </div>
                <div className="bg-slate-900 text-emerald-400 p-3 rounded-xl text-[11px] overflow-x-auto">
                  {`{
  "event_name": "Purchase",
  "event_time": 1726589201,
  "action_source": "system_generated",
  "user_data": {
    "ph": "62812****8819_hash",
    "fbp": "fb.1.17192.9281",
    "fbc": "fb.1.17192.IwAR02..."
  },
  "custom_data": { "currency": "IDR", "value": 299000 }
}`}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCapiSimulated(true);
                    setTimeout(() => setIsCapiSimulated(false), 2500);
                  }}
                  disabled={isCapiSimulated}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {isCapiSimulated ? 'Mengirim ke Meta Cloud...' : 'Simulasikan Kirim Event CAPI'}
                </button>
                {isCapiSimulated && (
                  <span className="text-emerald-700 font-bold text-xs flex items-center gap-1 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4" /> 200 OK • Match 9.6!
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Text Kanan */}
          <div className="lg:col-span-6 order-1 lg:order-2 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 border border-purple-200 text-purple-800 text-xs font-mono font-bold">
              <span>Pilar 2</span>
              <span>•</span>
              <span>Data Sovereignty &amp; ROAS Scale</span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-black text-slate-950 leading-tight">
              Server-Side Meta &amp; TikTok CAPI: Tembus Proteksi iOS 17 &amp; AdBlocker
            </h3>

            <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
              Browser pixel standar kehilangan 30-40% data akibat cookie restriction dan adblocker. BoonTrack mengirimkan event langsung dari backend cloud ke server Meta &amp; TikTok.
            </p>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Deduplikasi Event Otomatis:</strong> Mencegah pelaporan order ganda antara pixel browser dan Conversions API.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Manual Override Button:</strong> Kirim sinyal &apos;Purchase&apos; ke Meta Ads Manager kapan saja hanya dengan 1 kali klik di inbox dashboard.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── PILLAR 3: BoonTrack Reader APK & Multi-CS Management ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 border border-blue-200 text-blue-800 text-xs font-mono font-bold">
              <span>Pilar 3</span>
              <span>•</span>
              <span>Automation &amp; Team Scalability</span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-black text-slate-950 leading-tight">
              BoonTrack Reader APK &amp; Multi-CS Inbox Kolaboratif
            </h3>

            <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
              Verifikasi mutasi rekening instan dalam 3 detik tanpa repot cek m-Banking manual, ditambah fitur bagi percakapan otomatis ke banyak Customer Service tanpa bentrok.
            </p>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Reader APK 3-Detik:</strong> Menangkap push notification bank dan QRIS secara lokal di smartphone merchant. Anti bukti transfer editan Photoshop.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Multi-Seat CS Management:</strong> Percakapan WhatsApp dibagi adil (round-robin) ke beberapa staf CS. Dilengkapi internal note &amp; tag pesanan.
                </span>
              </div>
            </div>
          </div>

          {/* Visual Kanan: Reader APK & Multi-CS Visualization */}
          <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-md space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-900">Reader APK: Mutasi Monitoring</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold font-mono">
                Listening Mode
              </span>
            </div>

            <div className="space-y-2.5">
              <div className="p-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                    ✓
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">QRIS Masuk: Rp 299.000</div>
                    <div className="text-[10px] text-slate-500">Auto-match ke Order #ORD-8819 • Lunas</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                  3 Detik
                </span>
              </div>

              <div className="p-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    <Users2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">CS Dispatch: CS Dini</div>
                    <div className="text-[10px] text-slate-500">Percakapan otomatis ditugaskan ke Agent #2</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded">
                  Round-Robin
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
