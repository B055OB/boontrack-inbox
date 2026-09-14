import React from 'react';
import Link from 'next/link';

export const metadata = {
    title: 'BoonTrack Apps — Conversational Systems & Outcome-as-a-Service',
    description: 'Kami tidak sekadar membangun software. Kami merekayasa sistem alur kerja terintegrasi chat dengan jaminan output bisnis yang terukur.',
};

export default function AppPortalPage() {
    return (
        <div className="min-h-screen bg-[#FAFAFA] text-slate-900 selection:bg-indigo-600 selection:text-white font-sans antialiased">
            {/* Top Value Banner */}
            <div className="bg-slate-900 text-slate-300 py-2.5 px-4 text-center text-xs font-medium border-b border-slate-800">
                <span className="inline-block px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold mr-2">
                    Outcome-as-a-Service (OaaS)
                </span>
                Beralih dari bayar langganan software pasif ke ekosistem yang bertanggung jawab atas hasil operasional.
            </div>

            {/* Clean Modern Navigation */}
            <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl font-black tracking-tight text-slate-950">
                            BoonTrack <span className="text-indigo-600 font-semibold text-sm px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100">Apps</span>
                        </span>
                    </div>

                    <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
                        <a href="#outcomes" className="hover:text-indigo-600 transition">Target Hasil</a>
                        <a href="#framework" className="hover:text-indigo-600 transition">Model OaaS</a>
                        <a href="#engines" className="hover:text-indigo-600 transition">Spesialisasi Sistem</a>
                    </nav>

                    <div className="flex items-center gap-3">
                        <Link
                            href="/onboarding"
                            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs sm:text-sm hover:bg-indigo-700 shadow-sm transition"
                        >
                            Klaim Audit Alur Bisnis
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="relative pt-20 pb-16 md:pt-28 md:pb-24 border-b border-slate-200/70 bg-gradient-to-b from-white to-[#FAFAFA]">
                <div className="max-w-7xl mx-auto px-6 text-center">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold mb-8">
                        <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
                        Beyond Conventional SaaS: We Deliver End Results
                    </div>

                    <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-950 leading-[1.1] max-w-5xl mx-auto">
                        Jangan beli aplikasi. <br className="hidden sm:inline" />
                        <span className="text-indigo-600">Beli hasil tuntas operasional Anda.</span>
                    </h1>

                    <p className="mt-8 text-base sm:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed font-normal">
                        Mayoritas software berakhir terbengkalai karena tim internal gagal adopsi. Melalui model <strong>Outcome-as-a-Service</strong>, kami membangun sistem aplikasi kustom, menyatukannya ke WhatsApp alur percakapan harian, dan memastikan metrik bisnis Anda benar-benar tercapai.
                    </p>

                    <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link
                            href="/onboarding"
                            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-slate-950 text-white font-bold text-sm hover:bg-slate-800 shadow-lg transition"
                        >
                            Konsultasi Target Bisnis Anda &rarr;
                        </Link>
                        <a
                            href="#outcomes"
                            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white border border-slate-300 text-slate-800 font-semibold text-sm hover:bg-slate-50 transition"
                        >
                            Lihat Metrik yang Kami Tuntaskan
                        </a>
                    </div>

                    {/* OaaS Metrics Row */}
                    <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto text-left">
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <div className="text-2xl font-black text-indigo-600">&lt; 3 Detik</div>
                            <div className="text-xs text-slate-600 font-medium mt-1">Lead Dispatch & Respon Pertama</div>
                        </div>
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <div className="text-2xl font-black text-slate-900">0%</div>
                            <div className="text-xs text-slate-600 font-medium mt-1">Order Tercecer Tanpa Follow-up</div>
                        </div>
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <div className="text-2xl font-black text-slate-900">100%</div>
                            <div className="text-xs text-slate-600 font-medium mt-1">Alur Transaksi Terekam Database</div>
                        </div>
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <div className="text-2xl font-black text-indigo-600">24 / 7</div>
                            <div className="text-xs text-slate-600 font-medium mt-1">Otomasi Tanpa Hambatan Jam Kerja</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Target Outcomes Grid */}
            <section id="outcomes" className="py-24 max-w-7xl mx-auto px-6">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">Solusi Berbasis Target</span>
                    <h2 className="text-3xl sm:text-4xl font-black text-slate-950 mt-2">Bukan Fitur Rumit, Tapi Output Konkret</h2>
                    <p className="mt-4 text-slate-600 text-sm sm:text-base">
                        Tentukan hambatan operasional Anda, kami rancang arsitektur aplikasi dan sistem chat yang memastikan hasil berikut tercapai:
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Outcome 1 */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-8 hover:border-indigo-400 hover:shadow-lg transition">
                        <div className="text-xs font-bold text-indigo-600 tracking-wider uppercase mb-3">Outcome: Revenue Velocity</div>
                        <h3 className="text-xl font-bold text-slate-950 mb-3">Closing Otomatis & Pembayaran Kilat</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Memangkas friksi transaksi dari media sosial langsung ke WhatsApp. Sistem otomatis memvalidasi order, menerbitkan tagihan QRIS dinamis, dan memperbarui status stok secara seketika.
                        </p>
                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500">
                            <span>Metrik Utama</span>
                            <span className="text-indigo-600">Shorter Sales Cycle</span>
                        </div>
                    </div>

                    {/* Outcome 2 */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-8 hover:border-indigo-400 hover:shadow-lg transition">
                        <div className="text-xs font-bold text-indigo-600 tracking-wider uppercase mb-3">Outcome: Operational Efficiency</div>
                        <h3 className="text-xl font-bold text-slate-950 mb-3">Eliminasi Input Manual & Human Error</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Semua koordinasi lapangan, reservasi jadwal, atau pelaporan internal cukup dilakukan lewat chat terstruktur. Data langsung tersimpan di PostgreSQL tanpa perlu staf mengetik ulang di spreadsheet.
                        </p>
                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500">
                            <span>Metrik Utama</span>
                            <span className="text-indigo-600">Zero Redundant Entry</span>
                        </div>
                    </div>

                    {/* Outcome 3 */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-8 hover:border-indigo-400 hover:shadow-lg transition">
                        <div className="text-xs font-bold text-indigo-600 tracking-wider uppercase mb-3">Outcome: Retention & Rekening</div>
                        <h3 className="text-xl font-bold text-slate-950 mb-3">Pengingat & Retensi Otomatis</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Mulai dari pengingat jatuh tempo iuran keanggotaan hingga follow-up berkala prospek lama. Sistem bergerak otomatis berbasis waktu tanpa bergantung pada ingatan manual staf.
                        </p>
                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500">
                            <span>Metrik Utama</span>
                            <span className="text-indigo-600">Higher Lifetime Value</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* The OaaS Framework Section */}
            <section id="framework" className="py-20 bg-slate-100/60 border-y border-slate-200">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="max-w-3xl mb-12">
                        <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">The Delivery Model</span>
                        <h2 className="text-3xl font-extrabold text-slate-950 mt-2">Bagaimana Kerja Sama Outcome Berjalan?</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="bg-white p-7 rounded-2xl border border-slate-200">
                            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm mb-4">
                                01
                            </div>
                            <h4 className="text-base font-bold text-slate-950 mb-2">Audit Hambatan & Metrik Sukses</h4>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                Kami membedah alur operasional berjalan, mencari celah kebocoran prospek atau inefisiensi tim, dan menyepakati metrik yang wajib tercapai.
                            </p>
                        </div>

                        <div className="bg-white p-7 rounded-2xl border border-slate-200">
                            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm mb-4">
                                02
                            </div>
                            <h4 className="text-base font-bold text-slate-950 mb-2">Rekayasa Engine Terintegrasi Chat</h4>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                Aplikasi internal, backend database, dan integrasi WhatsApp Cloud API dibangun khusus agar cocok dengan kebiasaan tim serta audiens Anda.
                            </p>
                        </div>

                        <div className="bg-white p-7 rounded-2xl border border-slate-200">
                            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm mb-4">
                                03
                            </div>
                            <h4 className="text-base font-bold text-slate-950 mb-2">Monitoring Hasil & Eskalasi</h4>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                Kami tidak meninggalkan sistem begitu saja. Tim teknis memantau stabilitas transmisi pesan, latensi server, dan tingkat keberhasilan konversi.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Conversion / Call-to-Action Section */}
            <section className="py-24 bg-white text-center">
                <div className="max-w-4xl mx-auto px-6">
                    <h2 className="text-3xl sm:text-5xl font-black text-slate-950 tracking-tight">
                        Punya Alur Kerja yang Ingin Diotomatiskan?
                    </h2>
                    <p className="mt-6 text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
                        Sampaikan target hasil yang ingin Anda capai dalam bisnis. Kami analisis alur kerjanya dan siapkan arsitektur sistem percakapan yang tepat.
                    </p>
                    <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link
                            href="/onboarding"
                            className="px-8 py-4 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 shadow-md transition"
                        >
                            Mulai Diskusi Kebutuhan Sistem &rarr;
                        </Link>
                    </div>
                </div>
            </section>

            {/* Clean Minimalist Footer */}
            <footer className="border-t border-slate-200 py-10 bg-[#FAFAFA] text-center text-xs text-slate-500">
                <p>&copy; 2026 BoonTrack Apps. Dioperasikan oleh PT Envirotech Multi Core. Seluruh hak cipta dilindungi.</p>
            </footer>
        </div>
    );
}