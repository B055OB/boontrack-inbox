'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AppPortalPage() {
    const [logIndex, setLogIndex] = useState(0);
    const liveLogs = [
        { time: '12:04:12', step: 'POS Transaction Detected', text: 'POS_ORDER_COMPLETED: Rp185.000 (QRIS Instant)', color: 'text-orange-600' },
        { time: '12:04:12', step: 'Zero-Friction Dispatch', text: 'WHATSAPP_DISPATCH: Sent Dynamic Invoice to 0812-****-8821', color: 'text-emerald-600' },
        { time: '12:04:13', step: 'Peripheral Trigger', text: 'ESC_POS_PRINTER: Kitchen Ticket Printed Successfully', color: 'text-amber-600' },
        { time: '12:04:13', step: 'IoT Gate Action', text: 'SMART_GATEWAY: Doorlock Unlocked (Access Granted)', color: 'text-sky-600' },
        { time: '12:04:14', step: 'Database Sync', text: 'POSTGRESQL: Tenant session updated & CAPI event dispatched', color: 'text-purple-600' },
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setLogIndex((prev: number) => (prev + 1) % liveLogs.length);
        }, 2500);
        return () => clearInterval(interval);
    }, [liveLogs.length]);

    return (
        <div className="min-h-screen bg-white text-slate-900 selection:bg-orange-500 selection:text-white font-sans antialiased relative overflow-hidden">
            {/* Background Ornamen Bulat / Blob Abu ala Odoo */}
            <div className="absolute -top-32 -left-32 w-96 h-96 bg-slate-100 rounded-full blur-3xl pointer-events-none -z-10"></div>
            <div className="absolute top-1/3 -right-32 w-[500px] h-[500px] bg-orange-50/60 rounded-full blur-3xl pointer-events-none -z-10"></div>
            <div className="absolute bottom-10 left-1/4 w-80 h-80 bg-slate-100 rounded-full blur-2xl pointer-events-none -z-10"></div>

            {/* Top Banner */}
            <div className="bg-slate-900 text-slate-200 py-2.5 px-4 text-center text-xs font-medium border-b border-slate-800 flex items-center justify-center gap-2">
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                </span>
                <span className="text-orange-400 font-bold">HARDWARE & API OS:</span>
                Tanpa install app untuk pelanggan. Seluruh interaksi CRM & Transaksi berjalan via Chat & Hardware API.
            </div>

            {/* Header */}
            <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl font-black tracking-tight text-slate-950 flex items-center gap-2">
                            BoonTrack
                            <span className="text-orange-600 font-semibold text-xs px-2.5 py-1 rounded-lg bg-orange-50 border border-orange-200 shadow-sm">
                                Apps [B2B Engine]
                            </span>
                        </span>
                    </div>

                    <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
                        <a href="#channels" className="hover:text-orange-600 transition">Zero-App Channels</a>
                        <a href="#hardware" className="hover:text-orange-600 transition">POS & Peripheral API</a>
                        <a href="https://shop.boontrack.com" target="_blank" rel="noopener noreferrer" className="hover:text-slate-950 transition flex items-center gap-1">
                            Shop Engine <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">↗</span>
                        </a>
                    </nav>

                    <div className="flex items-center gap-3">
                        <Link
                            href="/onboarding"
                            className="px-5 py-2.5 rounded-xl bg-slate-950 text-white font-extrabold text-xs sm:text-sm hover:bg-slate-800 shadow-md transition transform active:scale-95"
                        >
                            Uji Coba Integrasi &rarr;
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="relative pt-16 pb-20 md:pt-24 md:pb-24 border-b border-slate-200/80 overflow-hidden">
                <div className="max-w-6xl mx-auto px-6 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-bold mb-8 shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
                        <span>Outcome As A Service — No App Installation Needed</span>
                    </div>

                    <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-slate-950 leading-[1.12] max-w-5xl mx-auto">
                        Bisnis canggih, <br className="hidden sm:inline" />
                        <span className="relative inline-block px-3 py-1 my-2">
                            <span className="absolute inset-0 bg-orange-500 rotate-[-1deg] rounded-xl shadow-sm -z-10"></span>
                            <span className="text-white font-black tracking-wide">tanpa repot install aplikasi.</span>
                        </span>
                    </h1>

                    <p className="mt-8 text-base sm:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
                        Hilangkan friksi interaksi. Pelanggan Anda tidak butuh download software baru untuk pesan, bayar, dan akses fasilitas. Semuanya diotomatisasi lewat <strong>WhatsApp, Telegram, Discord, LINE</strong> yang terhubung ke <strong>POS, NFC, dan Smart Doorlock</strong>.
                    </p>

                    <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link
                            href="/onboarding"
                            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-orange-600 text-white font-black text-sm hover:bg-orange-700 shadow-xl shadow-orange-600/20 transition transform hover:-translate-y-0.5 active:translate-y-0"
                        >
                            Mulai Bangun Tanpa Friksi
                        </Link>
                        <a
                            href="#hardware"
                            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white border border-slate-300 text-slate-800 font-bold text-sm hover:bg-slate-50 shadow-sm transition"
                        >
                            Lihat Integrasi Perangkat &rarr;
                        </a>
                    </div>

                    {/* Odoo Style Grid */}
                    <div className="mt-16 pt-12 border-t border-slate-200">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-8">
                            Ekosistem Lengkap Terintegrasi Dalam 1 Backend
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 max-w-5xl mx-auto">
                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:border-orange-400 hover:shadow-md transition group flex flex-col items-center">
                                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl mb-2 group-hover:scale-110 transition">💬</div>
                                <span className="text-xs font-bold text-slate-800">WhatsApp WABA</span>
                                <span className="text-[10px] text-slate-400">Official Cloud API</span>
                            </div>

                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:border-orange-400 hover:shadow-md transition group flex flex-col items-center">
                                <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center text-2xl mb-2 group-hover:scale-110 transition">✈️</div>
                                <span className="text-xs font-bold text-slate-800">Telegram Bot</span>
                                <span className="text-[10px] text-slate-400">Instant Alert & Ops</span>
                            </div>

                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:border-orange-400 hover:shadow-md transition group flex flex-col items-center">
                                <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-2xl mb-2 group-hover:scale-110 transition">👾</div>
                                <span className="text-xs font-bold text-slate-800">Discord Hook</span>
                                <span className="text-[10px] text-slate-400">Community CRM</span>
                            </div>

                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:border-orange-400 hover:shadow-md transition group flex flex-col items-center">
                                <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center text-2xl mb-2 group-hover:scale-110 transition">🧾</div>
                                <span className="text-xs font-bold text-slate-800">POS Cashier</span>
                                <span className="text-[10px] text-slate-400">Auto Dynamic QRIS</span>
                            </div>

                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:border-orange-400 hover:shadow-md transition group flex flex-col items-center">
                                <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-2xl mb-2 group-hover:scale-110 transition">💳</div>
                                <span className="text-xs font-bold text-slate-800">NFC Tap Access</span>
                                <span className="text-[10px] text-slate-400">Instant Verification</span>
                            </div>

                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:border-orange-400 hover:shadow-md transition group flex flex-col items-center">
                                <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center text-2xl mb-2 group-hover:scale-110 transition">🔐</div>
                                <span className="text-xs font-bold text-slate-800">Smart Doorlock</span>
                                <span className="text-[10px] text-slate-400">IoT Gate API</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Omnichannel Section with Dynamic Terminal Simulator */}
            <section id="channels" className="py-20 max-w-7xl mx-auto px-6 border-b border-slate-200">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    <div>
                        <span className="text-xs font-bold uppercase tracking-widest text-orange-600">Omnichannel Zero-Friction</span>
                        <h2 className="text-3xl sm:text-4xl font-black text-slate-950 mt-2 leading-tight">
                            Customer Anda berada di WhatsApp & Chat. Tanpa repot download aplikasi.
                        </h2>
                        <p className="mt-4 text-slate-600 text-base leading-relaxed">
                            Database pelanggan, status pesanan, faktur, hingga notifikasi pengingat terkirim otomatis ke kanal pesan instan yang sudah terpasang di smartphone mereka.
                        </p>
                        <div className="mt-6 space-y-3">
                            <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
                                <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">✓</span>
                                <span>Kirim invoice & QRIS dinamis langsung ke ruang chat</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
                                <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">✓</span>
                                <span>Terhubung otomatis dengan POS kasir tanpa delay</span>
                            </div>
                        </div>
                    </div>

                    {/* Live Animated Terminal Box */}
                    <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-2xl border border-slate-800 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl pointer-events-none"></div>
                        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                                <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                                <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                                <span className="text-xs text-slate-400 font-mono ml-2">boontrack-engine.log</span>
                            </div>
                            <span className="text-[10px] bg-orange-500/20 text-orange-400 px-2.5 py-1 rounded-full font-mono flex items-center gap-1 border border-orange-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-ping"></span> LIVE DISPATCH
                            </span>
                        </div>

                        <div className="font-mono text-xs space-y-3 min-h-[160px] flex flex-col justify-center">
                            <div className="text-slate-400 text-[11px]">// Real-time sub-second hardware & chat event listener</div>
                            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 transition-all duration-300">
                                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                                    <span className="text-orange-400 font-bold">[{liveLogs[logIndex].step}]</span>
                                    <span>{liveLogs[logIndex].time}</span>
                                </div>
                                <p className={`${liveLogs[logIndex].color} font-medium tracking-tight`}>
                                    &gt; {liveLogs[logIndex].text}
                                </p>
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2 animate-pulse">
                                <span className="inline-block w-1.5 h-3 bg-orange-500"></span>
                                <span>Awaiting next transactional event payload...</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Hardware Section */}
            <section id="hardware" className="py-20 max-w-7xl mx-auto px-6 bg-slate-50/70 border-b border-slate-200">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <span className="text-xs font-bold uppercase tracking-widest text-orange-600">Hardware & Peripheral API</span>
                    <h2 className="text-3xl sm:text-4xl font-black text-slate-950 mt-2">
                        POS yang Berbicara Langsung dengan Perangkat Fisik
                    </h2>
                    <p className="mt-4 text-slate-600 text-sm sm:text-base">
                        BoonTrack Apps menjembatani kasir Anda dengan perangkat keras di lapangan yang memiliki API atau koneksi jaringan.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-orange-300 transition group">
                        <div className="text-3xl mb-4 group-hover:scale-110 transition transform origin-left">💳</div>
                        <h3 className="text-lg font-bold text-slate-950 mb-2">NFC Tap & Card Reader</h3>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            Scan kartu fisik member fitness, karyawan, atau kartu saldo secara seketika dan tersinkron ke database.
                        </p>
                    </div>

                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-orange-300 transition group">
                        <div className="text-3xl mb-4 group-hover:scale-110 transition transform origin-left">🚪</div>
                        <h3 className="text-lg font-bold text-slate-950 mb-2">Doorlock & Turnstile Gate</h3>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            Integrasi pintu otomatis untuk gym atau coworking space begitu pembayaran terkonfirmasi via QRIS.
                        </p>
                    </div>

                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-orange-300 transition group">
                        <div className="text-3xl mb-4 group-hover:scale-110 transition transform origin-left">🔌</div>
                        <h3 className="text-lg font-bold text-slate-950 mb-2">Custom Peripheral API</h3>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            Thermal printer kasir/dapur, timbangan digital, barcode scanner, hingga display nomor antrean.
                        </p>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 max-w-5xl mx-auto px-6 text-center">
                <div className="bg-gradient-to-r from-orange-600 to-slate-950 text-white p-10 sm:p-14 rounded-3xl shadow-2xl relative overflow-hidden">
                    <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>

                    <span className="text-xs font-bold uppercase tracking-wider text-orange-200 bg-white/20 px-3 py-1 rounded-full border border-white/20">
                        Outcome As A Service
                    </span>
                    <h2 className="text-3xl sm:text-4xl font-black mt-4">
                        Anda Tentukan Target Hasil, Kami Rekayasa Ekosistemnya.
                    </h2>
                    <p className="mt-4 text-orange-100 text-sm leading-relaxed max-w-2xl mx-auto">
                        Kami mengonfigurasi alur chat, menghubungkan hardware, dan memastikan metrik operasional tercapai tanpa friksi.
                    </p>
                    <div className="mt-8 flex justify-center">
                        <Link
                            href="/onboarding"
                            className="px-8 py-4 rounded-xl bg-white text-orange-600 font-black text-sm hover:bg-orange-50 shadow-lg transition transform active:scale-95"
                        >
                            Mulai Integrasi Bisnis &rarr;
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-slate-200 py-10 bg-white text-center text-xs text-slate-500">
                <p>&copy; 2026 BoonTrack Apps. Dioperasikan oleh PT Envirotech Multi Core. Seluruh hak cipta dilindungi.</p>
            </footer>
        </div>
    );
}