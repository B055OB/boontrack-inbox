import React from 'react';
import Link from 'next/link';

export const metadata = {
    title: 'BoonTrack Apps — No-Friction Conversational Operating System & Hardware API',
    description: 'Ekosistem bisnis modular tanpa install aplikasi CRM untuk konsumen. Terhubung langsung ke WhatsApp, Telegram, Discord, POS, NFC, dan Doorlock IoT.',
};

export default function AppPortalPage() {
    return (
        <div className="min-h-screen bg-[#FDFDFD] text-slate-900 selection:bg-indigo-600 selection:text-white font-sans antialiased">
            {/* Top Banner */}
            <div className="bg-slate-900 text-slate-300 py-2.5 px-4 text-center text-xs font-medium border-b border-slate-800">
                <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold mr-2">
                    ZERO-FRICTION
                </span>
                Tanpa install app untuk pelanggan. Seluruh interaksi CRM & Transaksi berjalan via Chat & Hardware API.
            </div>

            {/* Header */}
            <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl font-black tracking-tight text-slate-950">
                            BoonTrack <span className="text-indigo-600 font-semibold text-sm px-2.5 py-0.5 rounded-lg bg-indigo-50 border border-indigo-100">Apps</span>
                        </span>
                    </div>

                    <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
                        <a href="#channels" className="hover:text-indigo-600 transition">Zero-App Channels</a>
                        <a href="#hardware" className="hover:text-indigo-600 transition">POS & Peripheral API</a>
                        <a href="https://shop.boontrack.com" target="_blank" rel="noopener noreferrer" className="hover:text-slate-950 transition">Shop Engine</a>
                    </nav>

                    <div className="flex items-center gap-3">
                        <Link
                            href="/onboarding"
                            className="px-5 py-2.5 rounded-xl bg-slate-950 text-white font-bold text-xs sm:text-sm hover:bg-slate-800 shadow-sm transition"
                        >
                            Uji Coba Integrasi &rarr;
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="relative pt-16 pb-16 md:pt-24 md:pb-20 bg-gradient-to-b from-white via-slate-50/50 to-[#FDFDFD] border-b border-slate-200/60">
                <div className="max-w-6xl mx-auto px-6 text-center">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold mb-8">
                        <span>⚡ Outcome As A Service — No App Installation Needed</span>
                    </div>

                    <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-slate-950 leading-[1.08] max-w-5xl mx-auto">
                        Bisnis canggih, <br className="hidden sm:inline" />
                        <span className="text-indigo-600 underline decoration-indigo-200 decoration-wavy decoration-2">tanpa repot install aplikasi.</span>
                    </h1>

                    <p className="mt-8 text-base sm:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
                        Hilangkan friksi interaksi. Pelanggan Anda tidak butuh download software baru untuk pesan, bayar, dan akses fasilitas. Semuanya diotomatisasi lewat <strong>WhatsApp, Telegram, Discord, LINE</strong> yang terhubung ke <strong>POS, NFC, dan Smart Doorlock</strong>.
                    </p>

                    <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link
                            href="/onboarding"
                            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-indigo-600 text-white font-extrabold text-sm hover:bg-indigo-700 shadow-xl shadow-indigo-600/20 transition"
                        >
                            Mulai Bangun Tanpa Friksi
                        </Link>
                        <a
                            href="#hardware"
                            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white border border-slate-300 text-slate-800 font-bold text-sm hover:bg-slate-50 transition"
                        >
                            Lihat Integrasi Perangkat &rarr;
                        </a>
                    </div>

                    {/* Odoo Style Grid */}
                    <div className="mt-16 pt-12 border-t border-slate-200/70">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-8">
                            Ekosistem Lengkap Terintegrasi Dalam 1 Backend
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 max-w-5xl mx-auto">
                            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col items-center">
                                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl mb-2">💬</div>
                                <span className="text-xs font-bold text-slate-800">WhatsApp WABA</span>
                                <span className="text-[10px] text-slate-400">Official Cloud API</span>
                            </div>

                            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col items-center">
                                <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center text-2xl mb-2">✈️</div>
                                <span className="text-xs font-bold text-slate-800">Telegram Bot</span>
                                <span className="text-[10px] text-slate-400">Instant Alert & Ops</span>
                            </div>

                            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col items-center">
                                <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-2xl mb-2">👾</div>
                                <span className="text-xs font-bold text-slate-800">Discord Hook</span>
                                <span className="text-[10px] text-slate-400">Community CRM</span>
                            </div>

                            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col items-center">
                                <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-2xl mb-2">🧾</div>
                                <span className="text-xs font-bold text-slate-800">POS Cashier</span>
                                <span className="text-[10px] text-slate-400">Auto Dynamic QRIS</span>
                            </div>

                            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col items-center">
                                <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-2xl mb-2">💳</div>
                                <span className="text-xs font-bold text-slate-800">NFC Tap Access</span>
                                <span className="text-[10px] text-slate-400">Instant Verification</span>
                            </div>

                            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col items-center">
                                <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center text-2xl mb-2">🔐</div>
                                <span className="text-xs font-bold text-slate-800">Smart Doorlock</span>
                                <span className="text-[10px] text-slate-400">IoT Gate API</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Omnichannel Section */}
            <section id="channels" className="py-20 max-w-7xl mx-auto px-6 border-b border-slate-200/70">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    <div>
                        <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">Omnichannel Zero-Friction</span>
                        <h2 className="text-3xl sm:text-4xl font-black text-slate-950 mt-2 leading-tight">
                            Customer Anda berada di WhatsApp & Chat. Tanpa repot download aplikasi.
                        </h2>
                        <p className="mt-4 text-slate-600 text-base leading-relaxed">
                            Database pelanggan, status pesanan, faktur, hingga notifikasi pengingat terkirim otomatis ke kanal pesan instan yang sudah terpasang di smartphone mereka.
                        </p>
                    </div>

                    <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-2xl border border-slate-800">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                                <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                                <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                                <span className="text-xs text-slate-400 font-mono ml-2">boontrack-engine.log</span>
                            </div>
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-mono">LIVE DISPATCH</span>
                        </div>
                        <div className="font-mono text-xs text-slate-300 space-y-2.5">
                            <p className="text-slate-500">// 1. POS Transaction Detected</p>
                            <p className="text-indigo-400">&gt; POS_ORDER_COMPLETED: Rp185.000</p>
                            <p className="text-slate-500">// 2. Triggering Zero-Friction Dispatch</p>
                            <p className="text-emerald-400">&gt; WHATSAPP_DISPATCH: Sent Invoice to Customer</p>
                            <p className="text-slate-500">// 3. Peripheral Trigger</p>
                            <p className="text-amber-400">&gt; ESC_POS_PRINTER: Kitchen Ticket Printed</p>
                            <p className="text-slate-500">// 4. IoT Gate Action</p>
                            <p className="text-sky-400">&gt; SMART_GATEWAY: Doorlock Unlocked</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Hardware Section */}
            <section id="hardware" className="py-20 max-w-7xl mx-auto px-6 bg-slate-50/70 border-b border-slate-200">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">Hardware & Peripheral API</span>
                    <h2 className="text-3xl sm:text-4xl font-black text-slate-950 mt-2">
                        POS yang Berbicara Langsung dengan Perangkat Fisik
                    </h2>
                    <p className="mt-4 text-slate-600 text-sm sm:text-base">
                        BoonTrack Apps menjembatani kasir Anda dengan perangkat keras di lapangan yang memiliki API atau koneksi jaringan.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="text-3xl mb-4">💳</div>
                        <h3 className="text-lg font-bold text-slate-950 mb-2">NFC Tap & Card Reader</h3>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            Scan kartu fisik member fitness, karyawan, atau kartu saldo secara seketika dan tersinkron ke database.
                        </p>
                    </div>

                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="text-3xl mb-4">🚪</div>
                        <h3 className="text-lg font-bold text-slate-950 mb-2">Doorlock & Turnstile Gate</h3>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            Integrasi pintu otomatis untuk gym atau coworking space begitu pembayaran terkonfirmasi via QRIS.
                        </p>
                    </div>

                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="text-3xl mb-4">🔌</div>
                        <h3 className="text-lg font-bold text-slate-950 mb-2">Custom Peripheral API</h3>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            Thermal printer kasir/dapur, timbangan digital, barcode scanner, hingga display nomor antrean.
                        </p>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 max-w-5xl mx-auto px-6 text-center">
                <div className="bg-gradient-to-r from-indigo-900 to-slate-950 text-white p-10 sm:p-14 rounded-3xl shadow-2xl">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/20 px-3 py-1 rounded-full">
                        Outcome As A Service
                    </span>
                    <h2 className="text-3xl sm:text-4xl font-black mt-4">
                        Anda Tentukan Target Hasil, Kami Rekayasa Ekosistemnya.
                    </h2>
                    <p className="mt-4 text-slate-300 text-sm leading-relaxed max-w-2xl mx-auto">
                        Kami mengonfigurasi alur chat, menghubungkan hardware, dan memastikan metrik operasional tercapai tanpa friksi.
                    </p>
                    <div className="mt-8 flex justify-center">
                        <Link
                            href="/onboarding"
                            className="px-8 py-4 rounded-xl bg-emerald-400 text-slate-950 font-black text-sm hover:bg-emerald-300 transition"
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