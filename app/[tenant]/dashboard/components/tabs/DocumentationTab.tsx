'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Search,
  Radio,
  Target,
  Truck,
  Code2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Sparkles,
  Zap,
  Globe,
  ShieldCheck,
  MessageSquare,
  Bot,
  Terminal,
  Activity,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  FileCode,
  Network,
  Users,
} from 'lucide-react';

interface DocumentationTabProps {
  tenant?: any;
  tenantSlug: string;
  displayName: string;
  onNavigateTab?: (tab: string) => void;
}

type CategoryFilter = 'all' | 'quickstart' | 'meta-waba-capi' | 'omnichannel' | 'api-webhook';

interface DocItem {
  id: string;
  category: CategoryFilter;
  categoryLabel: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeVariant?: 'emerald' | 'indigo' | 'purple' | 'amber' | 'blue';
  icon: React.ElementType;
  summary: string;
  checklist?: string[];
  codeBlock?: {
    language: string;
    filename?: string;
    code: string;
  };
  details: string[];
  ctaTab?: string;
  ctaTabLabel?: string;
  externalLink?: {
    href: string;
    label: string;
  };
}

const buildDocItems = (tenantSlug: string): DocItem[] => [
  {
    id: 'quickstart-setup',
    category: 'quickstart',
    categoryLabel: 'Quickstart Toko',
    title: 'Quickstart: Setup Profil Toko & Live Commerce',
    subtitle: 'Langkah awal menghidupkan etalase online, custom domain, dan integrasi WhatsApp.',
    badge: 'Mulai di Sini',
    badgeVariant: 'emerald',
    icon: Sparkles,
    summary: 'Siapkan identitas bisnis, katalog produk perdana, serta metode pembayaran QRIS langsung toko dalam waktu kurang dari 5 menit.',
    checklist: [
      'Buka menu Pengaturan Toko untuk mengisi Nama Brand, Bio Toko, dan nomor WhatsApp admin.',
      'Unggah Logo resmi dan gambar QRIS dinamis toko agar pembeli dapat langsung scan & bayar.',
      'Gunakan domain gratis `shop.boontrack.com/[slug]` atau hubungkan Domain Kustom (CNAME).',
      'Upload produk pertama (Fisik, Digital, Kuliner FnB, atau Jasa Konsultasi) via menu Katalog.',
    ],
    details: [
      'BoonTrack didesain dengan zero-code architecture: setiap perubahan nama toko, logo, dan deskripsi produk langsung tersinkronisasi secara real-time ke storefront publik.',
      'Pembeli yang mengunjungi storefront dapat memilih varian produk, menghitung ongkir otomatis, dan melakukan checkout instan yang langsung terhubung ke WhatsApp CS atau QRIS otomatis.',
      'Dukungan multi-vertikal otomatis mendeteksi kebutuhan bisnis Anda: kalkulasi kurir instan untuk FnB, kalender booking untuk jasa, atau unduhan instan untuk produk digital.',
    ],
    ctaTab: 'catalog',
    ctaTabLabel: 'Buka Menu Katalog',
    externalLink: {
      href: '/docs',
      label: 'Buka Dokumentasi Publik',
    },
  },
  {
    id: 'meta-waba-official',
    category: 'meta-waba-capi',
    categoryLabel: 'Meta WABA & CAPI',
    title: 'Meta Official Cloud API (WABA) & Embedded Signup',
    subtitle: 'Koneksi jalur resmi Meta Cloud API tanpa risiko blokir nomor dan tanpa server perantara.',
    badge: 'Official Meta',
    badgeVariant: 'indigo',
    icon: Radio,
    summary: 'Integrasi WhatsApp Business Platform resmi (WABA) langsung dari Meta. Dilengkapi centang hijau OBA, broadcast promosi resmi, dan throughput tinggi.',
    checklist: [
      'Masuk ke menu WhatsApp Connect pada dasbor BoonTrack.',
      'Pilih tab "Meta Cloud API (Official WABA)" dan klik tombol "Mulai Meta Embedded Signup".',
      'Login akun Facebook Bisnis, pilih atau buat Meta Business Account, dan verifikasi nomor telepon.',
      'Nomor langsung aktif dan terhubung ke engine BoonTrack tanpa perlu scan QR code.',
    ],
    codeBlock: {
      language: 'json',
      filename: 'payload-template-message.json',
      code: `{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "6281234567890",
  "type": "template",
  "template": {
    "name": "order_confirmed_v1",
    "language": { "code": "id" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Budi Santoso" },
          { "type": "text", "text": "ORD-2026-9041" }
        ]
      }
    ]
  }
}`,
    },
    details: [
      'Berbeda dengan gateway bot unofficial yang rentan banned sewaktu-waktu, Official WABA memberikan jaminan SLA uptime 99.9% langsung dari Meta data center.',
      'Tier pesan broadcast WABA otomatis naik bertahap: Tier 1 (1.000 kontak/hari), Tier 2 (10.000 kontak/hari), hingga Unlimited kontak per hari sesuai reputasi kualitas pesan.',
      'Semua template pesan marketing, utility, dan authentication dikelola dan diajukan langsung dari dashboard BoonTrack ke sistem peninjauan Meta.',
    ],
    ctaTab: 'whatsapp',
    ctaTabLabel: 'Buka WhatsApp Connect',
    externalLink: {
      href: '/docs/meta-waba',
      label: 'Panduan Lengkap Meta WABA',
    },
  },
  {
    id: 'meta-capi-server-side',
    category: 'meta-waba-capi',
    categoryLabel: 'Meta WABA & CAPI',
    title: 'Server-Side Meta Conversions API (CAPI) & Deduplikasi',
    subtitle: 'Pelacakan konversi iklan anti-adblocker dengan Event Quality Score maksimal.',
    badge: 'ROAS Booster',
    badgeVariant: 'purple',
    icon: Target,
    summary: 'Kirimkan sinyal konversi langsung dari server BoonTrack ke Meta Ads Graph API untuk mengatasi pemblokiran cookie iOS dan browser AdBlocker.',
    checklist: [
      'Buka menu Ads Tracking di dasbor dan masukkan Meta Pixel ID serta CAPI Access Token.',
      'Sistem otomatis memasang browser pixel dan server-side CAPI event dispatcher secara paralel.',
      'Setiap event membawa `event_id` unik untuk deduplikasi otomatis (tidak dobel hitung).',
      'Parameter UTM (`utm_source`, `utm_campaign`, `fbc`, `fbp`) otomatis tersimpan dan dikirim ke Meta.',
    ],
    codeBlock: {
      language: 'json',
      filename: 'meta-capi-event-payload.json',
      code: `{
  "data": [
    {
      "event_name": "Purchase",
      "event_time": 1776595200,
      "event_id": "ORD-2026-9041_PURCHASE",
      "event_source_url": "https://shop.boontrack.com/toko/checkout",
      "action_source": "website",
      "user_data": {
        "ph": ["e8d9...hash-sha256-phone"],
        "em": ["4a7b...hash-sha256-email"],
        "client_user_agent": "Mozilla/5.0 ...",
        "fbc": "fb.1.1776595000.IwAR2...",
        "fbp": "fb.1.1776595000.9876543210"
      },
      "custom_data": {
        "currency": "IDR",
        "value": 299000,
        "content_type": "product",
        "order_id": "ORD-2026-9041"
      }
    }
  ]
}`,
    },
    details: [
      'Event Quality Match Score tinggi (8.0 - 9.5) berkat normalisasi SHA256 nomor telepon berformat E.164 (`628...`) dan email sebelum dikirim ke Meta.',
      'Dukungan event lengkap: `PageView`, `ViewContent`, `InitiateCheckout`, `AddPaymentInfo`, `Contact`, `Lead`, dan `Purchase`.',
      'Integrasi CAPI otomatis menaikkan efisiensi algoritma Meta dalam mencari calon pembeli yang paling bernilai tinggi (high-value buyers).',
    ],
    ctaTab: 'ads_tracking',
    ctaTabLabel: 'Buka Ads Tracking',
  },
  {
    id: 'omnichannel-rotator',
    category: 'omnichannel',
    categoryLabel: 'Omnichannel & Multi-CS',
    title: 'Smart Chatbox Multi-CS & WhatsApp Rotator Cabang',
    subtitle: 'Distribusikan percakapan masuk secara adil ke banyak admin CS dan kelola dalam 1 inbox terpadu.',
    badge: 'Multi-CS CRM',
    badgeVariant: 'blue',
    icon: MessageSquare,
    summary: 'Satu nomor WhatsApp bisnis dapat diakses serentak oleh banyak admin CS. Dilengkapi pembagian antrean adil (Round-Robin) dan integrasi CRM pembeli.',
    checklist: [
      'Masuk ke Smart Chatbox untuk memantau semua sesi pesan masuk dari satu kanvas kerja.',
      'Buka tab CS / WhatsApp Rotator untuk mendaftarkan nama admin CS dan nomor tujuan rotasi.',
      'Pilih metode rotasi: Round-Robin (bergantian adil) atau Berbasis Beban Sesi (Load Balancing).',
      'Gunakan fitur Catatan Internal (Internal Team Notes) untuk berkoordinasi antar CS tanpa terbaca pelanggan.',
    ],
    details: [
      'Pelanggan yang mengklik tombol WhatsApp di etalase toko akan otomatis diarahkan ke admin CS yang sedang bertugas sesuai jadwal dan bobot rotasi.',
      'Integrasi langsung dengan database CRM: CS dapat melihat riwayat belanja pelanggan, tag loyalitas (VIP, Reseller, Cold Lead), dan preferensi tanpa tanya ulang.',
      'Pemisahan tab percakapan yang jelas: Pesan Saya (`my_chat`), Antrean Baru (`unassigned`), dan Riwayat Selesai.',
    ],
    ctaTab: 'inbox',
    ctaTabLabel: 'Buka Smart Chatbox',
  },
  {
    id: 'shipping-biteship',
    category: 'omnichannel',
    categoryLabel: 'Logistik & Pengiriman',
    title: 'Integrasi Multi-Kurir & Ekspedisi Otomatis (Biteship)',
    subtitle: 'Kalkulasi ongkir real-time, cetak resi thermal otomatis, dan kurir instan dapur.',
    badge: 'Logistik',
    badgeVariant: 'amber',
    icon: Truck,
    summary: 'Dukungan penuh kurir reguler (JNE, SiCepat, J&T, Lion Parcel) serta kurir instan & sameday (GoSend, GrabExpress) untuk pesanan langsung sampai.',
    checklist: [
      'Atur alamat gudang penjemputan (Origin Address) dan titik koordinat pinpoint di menu Pengiriman.',
      'Aktifkan kurir pilihan sesuai kebutuhan bisnis (Reguler, Kargo, Instan, atau Sameday).',
      'Sistem otomatis menghitung ongkos kirim berdasarkan berat produk dan kecamatan tujuan pembeli.',
      'Generate nomor resi (AWB) dan request pickup kurir langsung dari tabel Pesanan.',
    ],
    details: [
      'Untuk bisnis kuliner & resto (FnB), sistem menyediakan modul kurir instan khusus dengan radius jangkauan kilometer dapur dan pelacakan kurir real-time.',
      'Webhook status pengiriman otomatis mengupdate status pesanan di dasbor saat kurir menjemput barang, dalam perjalanan, hingga paket tiba di tangan pembeli.',
      'Dukungan resi thermal standar ukuran 100x150 mm untuk efisiensi packing gudang.',
    ],
    ctaTab: 'shipping',
    ctaTabLabel: 'Buka Menu Pengiriman',
  },
  {
    id: 'api-products-inventory',
    category: 'api-webhook',
    categoryLabel: 'REST API & Webhook',
    title: 'REST API v1: Manajemen Katalog & Stok Produk',
    subtitle: 'Endpoint terprogram untuk sinkronisasi inventori dari sistem ERP/POS eksternal.',
    badge: 'REST API',
    badgeVariant: 'indigo',
    icon: Code2,
    summary: 'Hubungkan software kasir (POS), warehouse management system (WMS), atau ERP Anda dengan etalase BoonTrack menggunakan API Gateway v1.',
    checklist: [
      'Endpoint publik menggunakan format URL RESTful standar JSON.',
      'Mendukung query parameter untuk pencarian produk, kategori, dan ketersediaan stok.',
      'Dapat diakses langsung oleh frontend custom atau bot automasi eksternal.',
    ],
    codeBlock: {
      language: 'javascript',
      filename: 'fetch-storefront-products.js',
      code: `// Fetch Katalog Produk Toko Aktif
const response = await fetch('https://shop.boontrack.com/api/v1/tenants/${tenantSlug}/theme', {
  method: 'GET',
  headers: {
    'Accept': 'application/json',
  },
});

const data = await response.json();
console.log('Total Produk Aktif:', data.products?.length);
console.log('Produk Pertama:', data.products?.[0]?.name);`,
    },
    details: [
      'Respon API mencakup metadata lengkap: nama produk, harga normal, harga promo coret, varian warna/ukuran, URL gambar WebP optimal, dan kuota stok.',
      'Response time ultra-cepat di bawah 80ms berkat caching edge terdistribusi Cloudflare / Supabase Read Replica.',
    ],
  },
  {
    id: 'webhook-payment-settlement',
    category: 'api-webhook',
    categoryLabel: 'REST API & Webhook',
    title: 'Webhook: Notifikasi Pembayaran & Settlement Realtime',
    subtitle: 'Terima sinyal pelunasan transaksi otomatis dari payment gateway atau verifikasi kasir.',
    badge: 'Webhook',
    badgeVariant: 'emerald',
    icon: Terminal,
    summary: 'Saat pembeli menyelesaikan pembayaran QRIS atau transfer, sistem mengeksekusi webhook event untuk memicu pengiriman notifikasi WhatsApp otomatis.',
    checklist: [
      'Format payload standar JSON dengan enkripsi signature verifikasi HMAC-SHA256.',
      'Otomatis memperbarui status pesanan menjadi PAID di dasbor dan tabel transaksi.',
      'Memicu notifikasi WhatsApp konfirmasi instan ke pembeli dan peringatan order baru ke Telegram admin.',
    ],
    codeBlock: {
      language: 'json',
      filename: 'webhook-payment-success.json',
      code: `{
  "event": "payment.settlement",
  "tenant_slug": "${tenantSlug}",
  "order_id": "ORD-2026-9041",
  "gross_amount": 149000,
  "currency": "IDR",
  "payment_method": "QRIS_DYNAMIC",
  "payment_status": "PAID",
  "customer": {
    "name": "Budi Santoso",
    "phone": "6281234567890",
    "email": "budi.santoso@example.com"
  },
  "items": [
    {
      "sku": "PROD-001",
      "name": "Paket Starter AI Sales Rep",
      "qty": 1,
      "price": 149000
    }
  ],
  "settlement_time": "2026-10-19T12:00:00Z"
}`,
    },
    details: [
      'Idempotensi terjamin: sistem BoonTrack menerapkan deduplikasi payload webhook agar transaksi tidak pernah diproses ganda jika terjadi retry jaringan.',
      'Dapat dihubungkan ke Zapier, Make.com, atau endpoint webhook custom milik server internal merchant.',
    ],
    ctaTab: 'orders',
    ctaTabLabel: 'Buka Riwayat Pesanan',
  },
  {
    id: 'ai-bot-knowledge',
    category: 'quickstart',
    categoryLabel: 'AI Knowledge Base',
    title: 'AI Sales Rep & Latih Knowledge Base Bot',
    subtitle: 'Asisten cerdas 24/7 yang mampu menjawab FAQ, merekomendasikan produk, dan melayani closing otomatis.',
    badge: 'AI Engine',
    badgeVariant: 'purple',
    icon: Bot,
    summary: 'Ajari AI gaya bahasa bisnis Anda, aturan garansi, jam operasional, dan detail teknis produk agar bot dapat melayani calon pembeli secara luwes.',
    checklist: [
      'Buka menu "AI Knowledge & Bot Setup" di sidebar dasbor.',
      'Tuliskan salam pembuka (Greeting Message) yang ramah dan mencerminkan persona brand.',
      'Tambahkan FAQ interaktif: cara pesan, nomor rekening, ketentuan retur, dan garansi.',
      'Pilih strategi bot: Mode Edukatif (jawab santai), Mode Hard Closing (fokus dorong transfer), atau Mode Hybrid.',
    ],
    details: [
      'Didukung oleh Google Gemini multimodal context window yang memahami teks, gambar bukti transfer, dan pertanyaan kompleks dalam Bahasa Indonesia yang alami.',
      'AI dilengkapi guardrail ketat: tidak akan memberikan diskon di luar wewenang dan dapat mengalihkan chat ke CS manusia (Human Handoff) saat menemui kendala.',
    ],
    ctaTab: 'ai_knowledge',
    ctaTabLabel: 'Buka AI Knowledge Setup',
  },
];

export default function DocumentationTab({
  tenant,
  tenantSlug,
  displayName,
  onNavigateTab,
}: DocumentationTabProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({
    'quickstart-setup': true,
    'meta-waba-official': true,
  });
  const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const docItems = useMemo(() => buildDocItems(tenantSlug || 'store'), [tenantSlug]);

  const handleCopyCode = (code: string, id: string) => {
    try {
      navigator.clipboard.writeText(code);
      setCopiedSnippetId(id);
      setTimeout(() => setCopiedSnippetId(null), 2000);
    } catch (_) {}
  };

  const filteredDocs = useMemo(() => {
    return docItems.filter((item) => {
      // Category filter
      if (activeCategory !== 'all' && item.category !== activeCategory) {
        return false;
      }
      // Search filter
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.categoryLabel.toLowerCase().includes(q) ||
        item.details.some((d) => d.toLowerCase().includes(q)) ||
        (item.checklist && item.checklist.some((c) => c.toLowerCase().includes(q)))
      );
    });
  }, [activeCategory, searchQuery]);

  const CATEGORY_TABS: { id: CategoryFilter; label: string; icon: React.ElementType }[] = [
    { id: 'all', label: 'Semua Panduan', icon: Layers },
    { id: 'quickstart', label: 'Quickstart', icon: Sparkles },
    { id: 'meta-waba-capi', label: 'Meta WABA & CAPI', icon: Radio },
    { id: 'omnichannel', label: 'Omnichannel & Logistik', icon: Network },
    { id: 'api-webhook', label: 'API & Webhook', icon: Code2 },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full font-sans text-slate-800 dark:text-slate-200">
      {/* ── HEADER KANVAS TAB ── */}
      <div className="relative rounded-3xl bg-gradient-to-r from-indigo-50/80 via-slate-50 to-indigo-50/40 border border-slate-200/80 text-slate-800 dark:from-slate-800 dark:via-slate-900/80 dark:to-slate-900/60 dark:border-slate-700 dark:text-slate-100 p-6 sm:p-8 shadow-xs overflow-hidden">
        {/* Glow Ambient Decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20 opacity-60 dark:opacity-100" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none opacity-60 dark:opacity-100" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wide uppercase bg-indigo-50 border border-indigo-200/80 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 dark:border-indigo-800/80 shadow-xs font-mono">
                <BookOpen className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Pusat Dokumentasi Merchant
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono hidden sm:inline">
                Toko: <span className="text-slate-900 dark:text-white font-bold">{displayName || tenantSlug}</span>
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Dokumentasi &amp; Panduan Integrasi
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Panduan teknis lengkap setup toko online, aktivasi Meta Official WABA, pelacakan server-side Meta CAPI, multi-kurir Biteship, dan webhook integrasi REST API.
            </p>
          </div>

          {/* Quick External Actions */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              href="/status"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 hover:text-slate-900 dark:bg-slate-900/80 dark:hover:bg-slate-800 dark:border-slate-800 dark:text-slate-300 dark:hover:text-white transition inline-flex items-center gap-2 shadow-2xs"
              title="Periksa Ketersediaan Server & Gateway"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Status Server</span>
              <ExternalLink className="w-3 h-3 text-slate-400 dark:text-slate-500" />
            </Link>

            <Link
              href="/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-bold transition inline-flex items-center gap-2 shadow-sm"
              title="Buka Portal Dokumentasi di Tab Baru"
            >
              <span>Portal Docs Eksternal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* ── SEARCH BAR ── */}
        <div className="relative mt-6 max-w-2xl">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari topik panduan (contoh: WABA, CAPI, Ongkir, Webhook, QRIS)..."
            className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 transition shadow-xs text-xs sm:text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-white dark:bg-slate-700 rounded-md px-1.5 py-0.5 cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── FILTER KATEGORI / TAB CEPAT ── */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORY_TABS.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 shadow-xs border border-indigo-600'
                  : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
              <span>{cat.label}</span>
              {cat.id !== 'all' && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isActive ? 'bg-indigo-700/80 text-indigo-100' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-400'
                }`}>
                  {docItems.filter((item) => item.category === cat.id).length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── QUICK JUMP SHORTCUTS KE MENU DASBOR TERKAIT ── */}
      {onNavigateTab && (
        <div className="rounded-2xl bg-slate-50 border border-slate-200 dark:bg-slate-900/40 dark:border-slate-800/60 p-3.5 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5 mr-1 text-[11px] uppercase tracking-wider font-mono">
            <Zap className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            Navigasi Cepat:
          </span>
          <button
            type="button"
            onClick={() => onNavigateTab('whatsapp')}
            className="px-2.5 py-1 rounded-lg bg-indigo-50/50 hover:bg-indigo-100/70 border border-indigo-100 text-indigo-700 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white dark:border-slate-700/60 transition font-medium cursor-pointer flex items-center gap-1.5"
          >
            <Radio className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
            <span>Koneksi WhatsApp</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('ads_tracking')}
            className="px-2.5 py-1 rounded-lg bg-indigo-50/50 hover:bg-indigo-100/70 border border-indigo-100 text-indigo-700 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white dark:border-slate-700/60 transition font-medium cursor-pointer flex items-center gap-1.5"
          >
            <Target className="w-3 h-3 text-purple-600 dark:text-purple-400" />
            <span>Ads Tracking &amp; CAPI</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('shipping')}
            className="px-2.5 py-1 rounded-lg bg-indigo-50/50 hover:bg-indigo-100/70 border border-indigo-100 text-indigo-700 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white dark:border-slate-700/60 transition font-medium cursor-pointer flex items-center gap-1.5"
          >
            <Truck className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <span>Ekspedisi Biteship</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('inbox')}
            className="px-2.5 py-1 rounded-lg bg-indigo-50/50 hover:bg-indigo-100/70 border border-indigo-100 text-indigo-700 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white dark:border-slate-700/60 transition font-medium cursor-pointer flex items-center gap-1.5"
          >
            <MessageSquare className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            <span>Smart Chatbox</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('ai_knowledge')}
            className="px-2.5 py-1 rounded-lg bg-indigo-50/50 hover:bg-indigo-100/70 border border-indigo-100 text-indigo-700 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white dark:border-slate-700/60 transition font-medium cursor-pointer flex items-center gap-1.5"
          >
            <Bot className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>AI Knowledge Setup</span>
          </button>
        </div>
      )}

      {/* ── GRID MODUL DOKUMENTASI INTERAKTIF (ACCORDION / DETAIL VIEW) ── */}
      <div className="space-y-4">
        {filteredDocs.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40 p-12 text-center space-y-3 shadow-xs">
            <HelpCircle className="w-10 h-10 text-slate-400 dark:text-slate-500 mx-auto" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Tidak ada panduan yang cocok</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
              Coba gunakan kata kunci lain atau pilih filter kategori &quot;Semua Panduan&quot;.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('all');
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
            >
              Reset Filter Pencarian
            </button>
          </div>
        ) : (
          filteredDocs.map((item) => {
            const isExpanded = !!expandedItems[item.id];
            const Icon = item.icon;

            const badgeColor = (() => {
              switch (item.badgeVariant) {
                case 'emerald':
                  return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-800/80';
                case 'purple':
                  return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/80 dark:text-purple-300 dark:border-purple-800/80';
                case 'amber':
                  return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/80 dark:text-amber-400 dark:border-amber-800/80';
                case 'blue':
                  return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-800/80';
                case 'indigo':
                default:
                  return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/80 dark:text-indigo-300 dark:border-indigo-800/80';
              }
            })();

            return (
              <div
                key={item.id}
                className="rounded-2xl bg-white border border-slate-200 shadow-xs dark:bg-slate-800 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition overflow-hidden"
              >
                {/* Accordion Header */}
                <div
                  onClick={() => toggleExpand(item.id)}
                  className="p-5 sm:p-6 bg-slate-50/70 hover:bg-slate-100/80 text-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900 dark:text-slate-100 flex items-start justify-between gap-4 cursor-pointer select-none group transition-colors"
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-indigo-600 dark:bg-slate-800 dark:border-slate-700/60 dark:text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition shadow-2xs">
                      <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border font-mono ${badgeColor}`}>
                          {item.badge}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {item.categoryLabel}
                        </span>
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-300 transition leading-snug">
                        {item.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 pt-1">
                    <span className="text-xs font-semibold text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-white hidden sm:inline">
                      {isExpanded ? 'Tutup Detail' : 'Buka Panduan'}
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-500 group-hover:text-slate-900 dark:bg-slate-800/60 dark:border-transparent dark:text-slate-400 dark:group-hover:text-white flex items-center justify-center transition shadow-2xs">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Accordion Body Content */}
                {isExpanded && (
                  <div className="px-5 sm:px-6 pb-6 pt-4 border-t border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 space-y-5 animate-in fade-in duration-150">
                    {/* Ringkasan & Checklist Setup */}
                    <div className="space-y-3">
                      <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                        {item.summary}
                      </p>

                      {item.checklist && item.checklist.length > 0 && (
                        <div className="rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-950/60 dark:border-slate-800/80 p-4 space-y-2">
                          <h4 className="text-xs font-black uppercase text-indigo-700 dark:text-indigo-300 tracking-wider font-mono flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            Langkah-Langkah Eksekusi:
                          </h4>
                          <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                            {item.checklist.map((step, sIdx) => (
                              <li key={sIdx} className="flex items-start gap-2.5">
                                <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                  {sIdx + 1}
                                </span>
                                <span className="leading-relaxed">{step}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Code Snippet Box (Jika ada) */}
                    {item.codeBlock && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
                          <span className="flex items-center gap-1.5">
                            <FileCode className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            {item.codeBlock.filename || 'Example Code Snippet'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyCode(item.codeBlock!.code, item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white dark:border-transparent transition font-mono text-[11px] cursor-pointer"
                          >
                            {copiedSnippetId === item.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">Tersalin!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Salin JSON / Kode</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 font-mono text-xs overflow-x-auto leading-relaxed shadow-inner">
                          <code>{item.codeBlock.code}</code>
                        </pre>
                      </div>
                    )}

                    {/* Poin Penjelasan Teknis Tambahan */}
                    {item.details && item.details.length > 0 && (
                      <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                        {item.details.map((point, pIdx) => (
                          <p key={pIdx} className="leading-relaxed flex items-start gap-2">
                            <span className="text-indigo-600 dark:text-indigo-400 font-bold">&bull;</span>
                            <span>{point}</span>
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Action Bar (Buka Tab Terkait atau Link Eksternal) */}
                    <div className="pt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700/60">
                      <div className="flex items-center gap-2">
                        {item.ctaTab && onNavigateTab && (
                          <button
                            type="button"
                            onClick={() => onNavigateTab(item.ctaTab!)}
                            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                          >
                            <span>{item.ctaTabLabel || 'Buka Menu Terkait'}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {item.externalLink && (
                          <Link
                            href={item.externalLink.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white dark:border-transparent text-xs font-semibold transition flex items-center gap-1.5"
                          >
                            <span>{item.externalLink.label}</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                      </div>

                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                        ID: #{item.id}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── FOOTER CALLOUT BANTUAN TEKNIS ── */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40 p-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="font-bold text-slate-900 dark:text-white text-sm">Butuh Bantuan Integrasi Khusus?</p>
            <p className="text-slate-600 dark:text-slate-400 mt-0.5">
              Tim Technical Support BoonTrack siap membantu setup Meta WABA, migrasi database, dan integrasi webhook ERP.
            </p>
          </div>
        </div>

        <a
          href="https://wa.me/6281977655099?text=Halo%20Tim%20BoonTrack,%20saya%20butuh%20bantuan%20teknis%20integrasi"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 hover:text-slate-900 border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:hover:text-white dark:border-slate-700/60 font-bold transition flex items-center gap-2 shrink-0 shadow-2xs"
        >
          <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Chat WhatsApp Tech Support</span>
        </a>
      </div>
    </div>
  );
}
