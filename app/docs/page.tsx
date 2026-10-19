'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  BookOpen,
  Search,
  Code2,
  Radio,
  Target,
  Truck,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Check,
  Copy,
  ChevronRight,
  ArrowRight,
  Layers,
  Zap,
  Globe,
  Terminal,
  Activity,
} from 'lucide-react';
import Footer from '../components/Footer';

interface DocSection {
  id: string;
  category: string;
  title: string;
  description: string;
  badge?: string;
  endpoint?: string;
  codeSnippet?: string;
  items?: string[];
  linkHref?: string;
}

const DOCS_DATA: DocSection[] = [
  {
    id: 'quickstart',
    category: 'Panduan Merchant',
    title: 'Quickstart: Memulai Toko Online & Chat Commerce',
    description: 'Panduan langkah awal menyiapkan profil toko, mengunggah produk pertama, mengatur nomor WhatsApp, dan menerima transaksi online.',
    badge: 'Mulai di Sini',
    items: [
      'Konfigurasi Nama Toko & Custom URL Subdomain / Domain Sendiri',
      'Upload Katalog Produk Fisik, Digital, atau Jasa Konsultasi',
      'Integrasi Rekening Bank / QRIS Dinamis Toko',
      'Aktifkan Live Chat WhatsApp & Floating Webchat Storefront',
    ],
  },
  {
    id: 'meta-waba',
    category: 'WhatsApp Commerce',
    title: 'Panduan Meta Official WABA & Cloud API',
    description: 'Hubungkan nomor WhatsApp resmi bisnis Anda dengan Meta Cloud API melalui fitur Embedded Signup tanpa koding.',
    badge: 'Official Meta',
    linkHref: '/docs/meta-waba',
    items: [
      'Proses Onboarding Meta Embedded Signup 5 Menit',
      'Pengajuan & Manajemen Template Pesan Interaktif',
      'Aturan Broadcast Massal Bebas Blokir (Tier Meta)',
      'Multi-CS Live Chat Inbox & Automated Auto-Reply',
    ],
  },
  {
    id: 'meta-capi',
    category: 'Ads & Tracking',
    title: 'Meta Conversions API (CAPI) & Pixel Tracking',
    description: 'Pelacakan konversi iklan server-side untuk mengatasi batasan browser iOS/AdBlocker dan menaikkan Event Quality Score.',
    badge: 'ROAS Booster',
    linkHref: '/docs/meta-waba#capi',
    items: [
      'Integrasi Server-Side Meta Conversions API',
      'Deduplikasi Event Otomatis via event_id Unik',
      'Tracking Otomatis: ViewContent, InitiateCheckout, Lead, Purchase',
      'Sinkronisasi Parameter UTM (utm_source, utm_campaign) ke Database',
    ],
  },
  {
    id: 'shipping',
    category: 'Logistik',
    title: 'Integrasi Multi-Kurir & Pengiriman Instan',
    description: 'Koneksi API ekspedisi reguler, kargo, COD, dan kurir instan dapur (GoSend/GrabExpress) melalui Biteship.',
    badge: 'Logistik Otomatis',
    items: [
      'Cek Ongkir Otomatis Berdasarkan Titik Koordinat / Kecamatan',
      'Dukungan Kurir Reguler (JNE, SiCepat, J&T) & Kargo',
      'Layanan Instan & Sameday untuk Bisnis F&B / Dapur',
      'Cetak Label Resi Thermal & Webhook Pelacakan Posisi Paket',
    ],
  },
  {
    id: 'api-products',
    category: 'API Reference',
    title: 'REST API: Manajemen Produk & Stok',
    description: 'Endpoint sinkronisasi data produk, harga promo, variasi, dan ketersediaan stok inventori secara terprogram.',
    badge: 'REST v1',
    endpoint: 'GET /api/v1/tenants/{slug}/theme',
    codeSnippet: `// Contoh Request Fetch Tema & Katalog Toko
const res = await fetch('https://shop.boontrack.com/api/v1/tenants/demo-store/theme', {
  headers: {
    'Accept': 'application/json',
  },
});
const { theme, products } = await res.json();
console.log('Katalog Aktif:', products);`,
  },
  {
    id: 'api-orders',
    category: 'API Reference',
    title: 'REST API: Status Pesanan & Webhook Pembayaran',
    description: 'Terima notifikasi pembayaran realtime dari Payment Gateway atau konfirmasi manual kasir.',
    badge: 'Webhook',
    endpoint: 'POST /api/v1/webhooks/payment',
    codeSnippet: `// Contoh Payload Webhook Transaksi Lunas
{
  "event": "payment.success",
  "order_id": "ORD-2026-9041",
  "gross_amount": 149000,
  "payment_method": "QRIS_DYNAMIC",
  "payment_status": "PAID",
  "customer": {
    "name": "Budi Santoso",
    "phone": "6281234567890"
  },
  "paid_at": "2026-10-19T12:00:00Z"
}`,
  },
];

export default function DocsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const filteredDocs = DOCS_DATA.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.endpoint && item.endpoint.toLowerCase().includes(q))
    );
  });

  const handleCopy = (text: string, id: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedSnippet(id);
      setTimeout(() => setCopiedSnippet(null), 2000);
    } catch (_) {}
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* ── TOP NAVBAR ── */}
      <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 group">
              <Image
                src="/logo-master.png"
                alt="BoonTrack"
                width={28}
                height={28}
                className="w-7 h-7 object-contain drop-shadow-xs"
              />
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-black text-white text-base tracking-tight">BoonTrack</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-950/80 text-indigo-400 border border-indigo-800/80 font-mono">
                  DOCS
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-xs">
            <Link
              href="/status"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition"
              title="Periksa Ketersediaan Server & Gateway"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Status Layanan</span>
            </Link>

            <Link
              href="/docs/meta-waba"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 hover:text-white hover:bg-indigo-900/60 transition font-medium"
            >
              <Radio className="w-3.5 h-3.5 text-indigo-400" />
              <span>Panduan WABA</span>
            </Link>

            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition shadow-xs"
            >
              <span>Portal Dasbor</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO BANNER ── */}
      <section className="relative border-b border-slate-800/80 bg-gradient-to-b from-slate-900/80 via-slate-950 to-slate-950 py-16 px-4 sm:px-8">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 text-xs font-bold">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Pusat Dokumentasi &amp; Panduan Integrasi</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight">
            Dokumentasi Teknis &amp; Panduan Integrasi BoonTrack
          </h1>

          <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Panduan lengkap setup Meta Cloud API (Official WABA), tracking konversi iklan CAPI, integrasi ekspedisi kurir, dan referensi REST API v1.
          </p>

          {/* Search Box */}
          <div className="pt-4 max-w-xl mx-auto relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari topik dokumentasi, endpoint API, WABA, CAPI..."
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-11 pr-4 py-3 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-lg transition"
            />
          </div>
        </div>
      </section>

      {/* ── CONTENT GRID ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-12 flex-1 w-full space-y-12">
        {/* Quick Highlights Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400 shrink-0">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black text-white">Official Meta WABA</h4>
              <p className="text-[11px] text-slate-400">Embedded signup resmi Meta Cloud API 24/7</p>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-950/60 border border-blue-800/60 flex items-center justify-center text-blue-400 shrink-0">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black text-white">Meta CAPI Server-Side</h4>
              <p className="text-[11px] text-slate-400">Event deduplication Purchase &amp; Lead</p>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-800/60 flex items-center justify-center text-purple-400 shrink-0">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black text-white">Open REST API Gateway</h4>
              <p className="text-[11px] text-slate-400">Sinkronisasi stok &amp; webhook transaksi</p>
            </div>
          </div>
        </div>

        {/* Section Cards */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Daftar Panduan &amp; Modul Dokumentasi ({filteredDocs.length})</span>
            </h2>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-indigo-400 hover:underline cursor-pointer"
              >
                Reset pencarian
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredDocs.map((doc) => (
              <div
                key={doc.id}
                className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 flex flex-col justify-between space-y-4 hover:border-slate-700 transition shadow-xs"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800">
                      {doc.category}
                    </span>
                    {doc.badge && (
                      <span className="text-[10px] font-bold text-indigo-300 bg-indigo-950/60 border border-indigo-800/60 px-2.5 py-0.5 rounded-full">
                        {doc.badge}
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-white leading-snug">{doc.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{doc.description}</p>

                  {doc.endpoint && (
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 text-emerald-400 font-mono text-xs flex items-center justify-between gap-2">
                      <span className="truncate">{doc.endpoint}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(doc.endpoint || '', `${doc.id}-ep`)}
                        className="text-slate-400 hover:text-white p-1 rounded transition shrink-0"
                        title="Salin Endpoint"
                      >
                        {copiedSnippet === `${doc.id}-ep` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}

                  {doc.codeSnippet && (
                    <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 p-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 mb-2">
                        <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1.5">
                          <Terminal className="w-3 h-3 text-slate-400" /> code-example
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(doc.codeSnippet || '', `${doc.id}-code`)}
                          className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 transition"
                        >
                          {copiedSnippet === `${doc.id}-code` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>Salin</span>
                        </button>
                      </div>
                      <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
                        <code>{doc.codeSnippet}</code>
                      </pre>
                    </div>
                  )}

                  {doc.items && (
                    <ul className="space-y-1.5 pt-1 text-xs text-slate-300">
                      {doc.items.map((it, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-emerald-400 font-bold shrink-0 mt-0.5">&bull;</span>
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                  {doc.linkHref ? (
                    <Link
                      href={doc.linkHref}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition"
                    >
                      <span>Buka Panduan Lengkap</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  ) : (
                    <span className="text-[11px] text-slate-500">Terdokumentasi dalam modul dasbor</span>
                  )}
                  <span className="text-[10px] font-mono text-slate-500">v1.2-stable</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Support Banner */}
        <div className="rounded-3xl border border-indigo-900/60 bg-gradient-to-r from-indigo-950/40 via-slate-900 to-slate-950 p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <h3 className="text-base sm:text-lg font-black text-white">
              Butuh Bantuan Integrasi Teknis atau Onboarding Khusus?
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Tim Developer &amp; Technical Support BoonTrack siap membantu menghubungkan API katalog, konfigurasi Meta CAPI, dan aktivasi Official WABA.
            </p>
          </div>
          <a
            href="https://wa.me/6281977655099?text=Halo%20Tim%20BoonTrack,%20saya%20ingin%20konsultasi%20mengenai%20integrasi%20API%20dan%20WABA"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-2 shadow-sm"
          >
            <span>Hubungi Technical Support</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </main>

      {/* ── FOOTER ── */}
      <Footer />
    </div>
  );
}
