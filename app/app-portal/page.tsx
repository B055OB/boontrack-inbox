import React from 'react';
import Link from 'next/link';

export const metadata = {
    title: 'BoonTrack App — Solusi Integrasi Proses Bisnis & WhatsApp Conversational',
    description: 'Hubungkan database, sistem pesanan, dan alur operasional bisnis Anda langsung ke WhatsApp API, Telegram, dan Webchat secara otomatis.',
};

export default function AppPage() {
    return (
        <div className="min-h-screen bg-[#070c14] text-slate-100 selection:bg-emerald-500 selection:text-slate-950 font-sans">
            {/* Top Banner */}
            <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900 to-emerald-950/60 border-b border-white/5 py-2 px-4 text-center text-xs text-emerald-400 font-medium">
                ⚡ Infrastruktur Resmi WhatsApp Cloud API & Otomasi Alur Kerja Bisnis
            </div>

            {/* Navigation */}
            <header className="sticky top-0 z-50 bg-[#070c14]/90 backdrop-blur-md border-b border-white/10">
                <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl font-black tracking-tight text-white">
                            Boon<span className="text-emerald-400">Track</span>
                        </span>
                        <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            App Portal
                        </span>
                    </div>

                    <nav className="flex items-center gap-4 sm:gap-6 text-sm">
                        <a href="https://shop.boontrack.com" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition">
                            Shop
                        </a>
                        <a href="https://career.boontrack.com" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition">
                            Career
                        </a>
                        <Link href="/login" className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs sm:text-sm hover:bg-emerald-400 transition">
                            Masuk Dashboard
                        </Link>
                    </nav>
                </div>
            </header>

            {/* Hero Section */}
            <main className="max-w-6xl mx-auto px-4 py-16 sm:py-24 text-center">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-6">
                    <span>⚙️ Custom App & Business Process Integration</span>
                </div>

                <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight max-w-4xl mx-auto">
                    Hubungkan Proses Bisnis Anda Langsung ke Ruang <span className="text-emerald-400">Percakapan.</span>
                </h1>

                <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
                    Otomatiskan alur kerja, invoice QRIS, integrasi database, hingga bot customer service 24 jam melalui WhatsApp Official, Telegram, dan WebChat tanpa hambatan teknis.
                </p>

                {/* CTA Buttons */}
                <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Link
                        href="/onboarding"
                        className="w-full sm:w-auto px-8 py-4 rounded-xl bg-emerald-500 text-slate-950 font-black text-sm hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition"
                    >
                        Mulai Integrasi Bisnis Anda &rarr;
                    </Link>
                    <a
                        href="https://wa.me/6281237460222?text=Halo%20BoonTrack,%20saya%20ingin%20konsultasi%20integrasi%20sistem%20aplikasi%20ke%20WhatsApp"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full sm:w-auto px-8 py-4 rounded-xl bg-slate-900 border border-white/10 text-white font-semibold text-sm hover:bg-slate-800 transition"
                    >
                        Konsultasi Kustomisasi (WA)
                    </a>
                </div>

                {/* 3 Pillars Grid */}
                <div className="mt-20 text-left grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Card 1: BoonTrack Shop */}
                    <div className="p-6 rounded-2xl bg-[#0e1624]/80 border border-white/10 flex flex-col justify-between hover:border-emerald-500/40 transition">
                        <div>
                            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md">
                                Conversational Commerce
                            </span>
                            <h3 className="mt-4 text-xl font-bold text-white">BoonTrack Shop</h3>
                            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                                Etalase katalog produk instan sub-detik dengan checkout otomatis ke WhatsApp, penerbitan QRIS dinamis, dan pelacakan Meta Pixel terintegrasi.
                            </p>
                        </div>
                        <a
                            href="https://shop.boontrack.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-6 inline-flex items-center text-xs font-bold text-emerald-400 hover:text-emerald-300"
                        >
                            Kunjungi Shop Engine &rarr;
                        </a>
                    </div>

                    {/* Card 2: Talent & Career */}
                    <div className="p-6 rounded-2xl bg-[#0e1624]/80 border border-white/10 flex flex-col justify-between hover:border-sky-500/40 transition">
                        <div>
                            <span className="text-xs font-bold text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-md">
                                Talent & Career
                            </span>
                            <h3 className="mt-4 text-xl font-bold text-white">Talent Scouting</h3>
                            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                                Pembuatan CV berstandar ATS, audit portofolio profesional berbasis AI, dan saluran rekrutmen kerja interaktif via notifikasi WhatsApp.
                            </p>
                        </div>
                        <a
                            href="https://career.boontrack.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-6 inline-flex items-center text-xs font-bold text-sky-400 hover:text-sky-300"
                        >
                            Kunjungi Career Portal &rarr;
                        </a>
                    </div>

                    {/* Card 3: App Customize */}
                    <div className="p-6 rounded-2xl bg-[#0e1624]/80 border border-white/10 flex flex-col justify-between hover:border-purple-500/40 transition">
                        <div>
                            <span className="text-xs font-bold text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-md">
                                B2B Custom Integration
                            </span>
                            <h3 className="mt-4 text-xl font-bold text-white">App Customize</h3>
                            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                                Pengembangan dashboard kustom, CRM, sistem antrean/reservasi, dan integrasi backend database langsung ke WhatsApp Cloud API resmi.
                            </p>
                        </div>
                        <Link
                            href="/onboarding"
                            className="mt-6 inline-flex items-center text-xs font-bold text-purple-400 hover:text-purple-300"
                        >
                            Daftar Kustomisasi &rarr;
                        </Link>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-white/10 py-8 text-center text-xs text-slate-500">
                <p>&copy; 2026 BoonTrack. Dioperasikan oleh PT Envirotech Multi Core. Seluruh hak cipta dilindungi.</p>
            </footer>
        </div>
    );
}