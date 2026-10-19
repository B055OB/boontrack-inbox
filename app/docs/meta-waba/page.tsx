'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Radio,
  Target,
  ShieldCheck,
  Check,
  Copy,
  ArrowRight,
  ArrowLeft,
  Terminal,
  ExternalLink,
  Sparkles,
  HelpCircle,
  AlertCircle,
  Zap,
} from 'lucide-react';
import Footer from '../../components/Footer';

export default function MetaWabaDocsPage() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (_) {}
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* ── TOP NAVBAR ── */}
      <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/docs"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900 text-xs font-semibold transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Semua Dokumen</span>
            </Link>
            <div className="h-4 w-px bg-slate-800" />
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/logo-master.png"
                alt="BoonTrack"
                width={26}
                height={26}
                className="w-6 h-6 object-contain"
              />
              <span className="font-black text-white text-sm tracking-tight">BoonTrack Docs</span>
            </Link>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <Link
              href="/status"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Gateway Online</span>
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition"
            >
              <span>Buka Dasbor</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── BREADCRUMB & HERO ── */}
      <section className="border-b border-slate-800/80 bg-gradient-to-b from-slate-900/80 to-slate-950 py-12 px-4 sm:px-8">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Link href="/docs" className="hover:text-white transition">Dokumentasi</Link>
            <span>/</span>
            <span className="text-indigo-400 font-bold">Meta WABA &amp; CAPI</span>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs font-bold">
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span>Official WhatsApp Business Cloud API &amp; Meta Conversions API</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight">
            Panduan Integrasi Meta Official WABA &amp; Conversions API (CAPI)
          </h1>

          <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
            Petunjuk operasional resmi aktivasi WhatsApp Cloud API tanpa koding via Meta Embedded Signup, pengajuan template pesan broadcast, dan sinkronisasi pelacakan konversi server-side.
          </p>
        </div>
      </section>

      {/* ── MAIN CONTENT ── */}
      <main className="max-w-4xl mx-auto px-4 sm:px-8 py-12 flex-1 w-full space-y-12 text-sm leading-relaxed text-slate-300">
        {/* Section 1: Perbedaan WABA vs Direct Connect */}
        <section className="space-y-4">
          <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-800 flex items-center justify-center text-xs font-black">1</span>
            <span>Memahami Dua Metode Koneksi WhatsApp di BoonTrack</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
                Official WABA (Team Scale)
              </span>
              <h4 className="font-bold text-white text-sm">Meta Cloud API (Resmi)</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Terhubung langsung ke server Meta. Bebas risiko pemblokiran nomor (banned), mendukung green badge (centang hijau), template pesan interaktif tombol CTA, dan kuota broadcast hingga 10.000+ pesan/hari.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 bg-indigo-950/60 border border-indigo-800/60 px-2 py-0.5 rounded">
                Direct Connect (Semua Paket)
              </span>
              <h4 className="font-bold text-white text-sm">Koneksi Cepat Scan QR</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Scan QR WhatsApp Web dalam hitungan detik. Menggunakan nomor nomor pribadi/WA Business biasa tanpa syarat verifikasi dokumen PT/CV.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Panduan Meta Embedded Signup */}
        <section className="space-y-4">
          <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-800 flex items-center justify-center text-xs font-black">2</span>
            <span>Panduan Onboarding Meta Embedded Signup (5 Menit)</span>
          </h2>
          <ol className="space-y-3 list-decimal list-inside pl-2 text-slate-300 text-xs sm:text-sm">
            <li>Buka menu <strong>WhatsApp Connect</strong> di Dasbor BoonTrack Anda, lalu pilih tab <strong>Meta Cloud API (WABA)</strong>.</li>
            <li>Klik tombol hijau <strong>"Hubungkan WhatsApp via Meta (Embedded Signup)"</strong>. Jendela pop-up resmi Facebook Business Login akan muncul secara otomatis.</li>
            <li>Login ke akun Facebook Anda yang memiliki akses Admin di <strong>Meta Business Manager</strong>.</li>
            <li>Pilih atau buat Akun Bisnis Meta (WABA Account), lalu masukkan nama tampilan profil WhatsApp resmi toko Anda.</li>
            <li>Masukkan nomor telepon yang belum terdaftar di aplikasi WhatsApp pribadi (atau hapus akun WhatsApp lama pada nomor tersebut terlebih dahulu).</li>
            <li>Masukkan kode OTP verifikasi 6 digit yang dikirimkan Meta via SMS atau panggilan suara.</li>
            <li>Selesai! BoonTrack akan otomatis menyimpan <code>WABA Account ID</code>, <code>Phone Number ID</code>, dan token otorisasi ke database secara aman.</li>
          </ol>
        </section>

        {/* Section 3: Template Pesan Interaktif */}
        <section className="space-y-4">
          <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-800 flex items-center justify-center text-xs font-black">3</span>
            <span>Kategori Template Pesan WhatsApp Meta</span>
          </h2>
          <div className="space-y-3">
            <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-1">
              <h4 className="font-bold text-white text-xs sm:text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Utility &amp; Notifikasi Transaksi (Auto-Approved)</span>
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Kirim invoice pembayaran QRIS, konfirmasi pembayaran lunas, dan nomor resi pengiriman otomatis. Disetujui seketika oleh AI Meta.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-1">
              <h4 className="font-bold text-white text-xs sm:text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span>Marketing &amp; Penawaran Promo (Broadcast)</span>
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pesan penyiaran produk baru, voucher diskon, atau pengingat keranjang belanja (Abandoned Cart) dengan tombol Quick Reply interaktif.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4: Meta Conversions API (CAPI) */}
        <section id="capi" className="space-y-4 pt-4 border-t border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-800 flex items-center justify-center text-xs font-black">4</span>
            <h2 className="text-lg sm:text-xl font-black text-white">
              Konfigurasi Meta Conversions API (CAPI) Server-Side
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            BoonTrack otomatis mengirimkan event server-to-server ke Meta Graph API setiap kali calon pembeli melakukan aksi di storefront atau chat:
          </p>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-mono font-bold text-slate-300">Format Payload Event CAPI Otomatis</span>
              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    `{\n  "data": [\n    {\n      "event_name": "Purchase",\n      "event_time": 1729340000,\n      "event_id": "ORD-BT-2026-9041",\n      "user_data": {\n        "ph": ["hash_sha256_nomor_wa"]\n      },\n      "custom_data": {\n        "currency": "IDR",\n        "value": 149000\n      }\n    }\n  ]\n}`,
                    'capi-payload'
                  )
                }
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                {copiedKey === 'capi-payload' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Salin JSON</span>
              </button>
            </div>
            <pre className="text-xs font-mono text-emerald-400 overflow-x-auto leading-relaxed">
              <code>{`{
  "data": [
    {
      "event_name": "Purchase",
      "event_time": 1729340000,
      "event_id": "ORD-BT-2026-9041",
      "event_source_url": "https://shop.boontrack.com/nama-toko",
      "user_data": {
        "ph": ["b041a9...hash_sha256_telepon"]
      },
      "custom_data": {
        "currency": "IDR",
        "value": 149000
      }
    }
  ]
}`}</code>
            </pre>
          </div>
        </section>

        {/* Section 5: Troubleshooting & Support */}
        <section className="p-6 rounded-2xl bg-indigo-950/30 border border-indigo-800/40 space-y-3">
          <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-indigo-400" />
            <span>Ada Kendala Verifikasi Bisnis Meta atau Token Kadaluarsa?</span>
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Jika token Meta Anda kadaluarsa atau Anda perlu bantuan verifikasi bisnis Meta Manager, Anda dapat melakukan re-auth kapan saja di menu Dasbor &gt; WhatsApp Connect &gt; Tab Meta WABA tanpa menghapus riwayat pesan.
          </p>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <Footer />
    </div>
  );
}
