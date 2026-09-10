'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Check,
  RotateCcw,
  Zap,
  TrendingUp,
  Package,
  MapPin,
  Bot,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  FileSpreadsheet,
  FileText
} from 'lucide-react';

export interface ActionProposal {
  id: string;
  type: string;
  title: string;
  description: string;
  summary?: string;
  details?: Record<string, any>;
  status?: 'pending' | 'executing' | 'executed' | 'rejected' | 'failed';
  result_message?: string;
}

export interface QuickActionItem {
  label: string;
  action?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  action_proposal?: ActionProposal | null;
  quick_actions?: Array<string | QuickActionItem> | null;
}

interface BoonPilotWidgetProps {
  tenantSlug?: string | string[];
  isProductsEmpty?: boolean;
  onOpenBulkImport?: () => void;
  onOpenNewProduct?: () => void;
  // Dynamic tenant state for personalized BoonPilot context
  productsCount?: number;
  botConnected?: boolean;
  isQrisUploaded?: boolean;
  subscriptionPlan?: string;
}

const STARTER_CHIPS = [
  {
    label: 'Bagaimana performa penjualan toko saya minggu ini?',
    icon: TrendingUp,
  },
  {
    label: 'Cek stok produk yang hampir habis',
    icon: Package,
  },
  {
    label: 'Bantu atur titik penjemputan gudang kurir',
    icon: MapPin,
  },
  {
    label: 'Jelaskan strategi bot WhatsApp & fitur otomasi',
    icon: MessageSquare,
  },
];

const EMPTY_PRODUCTS_STARTER_CHIPS = [
  {
    label: 'Bagaimana cara import file Tokopedia/Shopee?',
    icon: FileSpreadsheet,
  },
  {
    label: 'Panduan format spreadsheet',
    icon: FileText,
  },
  {
    label: 'Bantu saya upload produk',
    icon: Package,
  },
];

// Helper to parse bold, italics, and inline code
function parseInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={match.index}
          className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-[11px] font-semibold border border-indigo-200/60"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={match.index} className="font-bold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={match.index} className="italic text-slate-700">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

// Markdown Renderer supporting code blocks, bold, italics, and bullet/numbered lists
function MarkdownContent({ content }: { content: string }) {
  const blockRegex = /```([\s\S]*?)```/g;
  const blocks: Array<{ type: 'code' | 'text'; content: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', content: content.substring(lastIndex, match.index) });
    }
    blocks.push({ type: 'code', content: match[1] });
    lastIndex = blockRegex.lastIndex;
  }
  if (lastIndex < content.length) {
    blocks.push({ type: 'text', content: content.substring(lastIndex) });
  }

  return (
    <div className="space-y-2 text-xs leading-relaxed text-slate-800">
      {blocks.map((block, bIdx) => {
        if (block.type === 'code') {
          return (
            <pre
              key={bIdx}
              className="bg-slate-900 text-slate-100 p-3 rounded-xl font-mono text-xs overflow-x-auto my-2 border border-slate-800"
            >
              <code>{block.content.trim()}</code>
            </pre>
          );
        }

        const lines = block.content.split('\n');
        return (
          <div key={bIdx} className="space-y-1">
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) {
                return <div key={lIdx} className="h-1" />;
              }
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lIdx} className="flex items-start gap-2 pl-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                    <span>{parseInlineMarkdown(trimmed.slice(2))}</span>
                  </div>
                );
              }
              const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
              if (numMatch) {
                return (
                  <div key={lIdx} className="flex items-start gap-2 pl-1">
                    <span className="text-[11px] font-bold text-blue-600 shrink-0 min-w-4">
                      {numMatch[1]}.
                    </span>
                    <span>{parseInlineMarkdown(numMatch[2])}</span>
                  </div>
                );
              }
              return <p key={lIdx}>{parseInlineMarkdown(trimmed)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function BoonPilotWidget({ 
  tenantSlug, 
  isProductsEmpty = false,
  onOpenBulkImport,
  onOpenNewProduct,
  productsCount = 0,
  botConnected = false,
  isQrisUploaded = false,
  subscriptionPlan = 'SOLO_TRIAL',
}: BoonPilotWidgetProps) {
  const normalizedSlug = Array.isArray(tenantSlug)
    ? tenantSlug[0]
    : tenantSlug || 'onlineboost';

  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);

  const storageKey = `boonpilot_history_${normalizedSlug}`;
  const sessionKey = `boonpilot_session_id_${normalizedSlug}`;

  // Build dynamic persona-aware welcome based on tenant state
  const buildWelcomeText = (): string => {
    const isTrial = subscriptionPlan === 'SOLO_TRIAL' || subscriptionPlan === 'solo_trial' || subscriptionPlan === 'SOLO';
    if (productsCount === 0) {
      return `Halo! Saya **BoonPilot Copilot**, konsultan penjualan AI & sales coach toko Anda. 🚀\n\n🎯 **5 Checklist Wajib Siap Jual Sebelum Promosi:**\n1. 📦 **Katalog Produk:** Upload produk & tata etalase (foto menarik & harga jelas).\n2. 🧠 **AI Knowledge Toko:** WAJIB diisi agar bot tidak halu saat balas chat pembeli!\n3. 💬 **WhatsApp Bot Gateway:** Scan QR BoonTrack Direct Connect agar CS aktif 24/7.\n4. 🚚 **Logistik Diskon:** Nikmati diskon ongkir & cashback s/d puluhan persen.\n5. ⚡ **Otomasi QRIS Dinamis:** Pasang QRIS & download BoonTrack Reader agar verifikasi instan tanpa cek mutasi manual.\n\n💡 *Positioning Penting:* Toko online modern **tidak butuh FAQ panjang** yang bikin calon pembeli kabur! Cukup cantumkan deskripsi & benefit pemikat *impulse buying*, lalu biarkan AI Knowledge & WhatsApp Bot yang menjawab pertanyaan spesifik pembeli.\n\nMari mulai langkah 1 dengan klik **'Import Massal'** atau **'+ Tambah Produk'**!`;
    }
    if (!isQrisUploaded) {
      return `Halo! Saya **BoonPilot Copilot**, konsultan penjualan AI toko Anda. 🚀\n\n✅ **Katalog produk Anda sudah aktif (${productsCount} produk)!**\n\n🎯 **Langkah Checklist Siap Jual Berikutnya:**\n- 🧠 **Isi AI Knowledge Toko** di tab *AI Knowledge & Bot* agar bot CS cerdas menjawab pertanyaan pembeli.\n- 💬 **Koneksikan WhatsApp** via scan QR di tab *WhatsApp*.\n- 🚚 **Cek Ekspedisi** untuk dapatkan diskon ongkir & cashback otomatis.\n- ⚡ **Upload QRIS & Download BoonTrack Reader** di tab *Pengaturan* untuk verifikasi transfer instan tanpa repot cek mutasi tengah malam!\n\n💡 *Ingat:* Jangan bebani etalase dengan FAQ bertele-tele. Biarkan Bot WhatsApp AI yang mengurus tanya-jawab dan closing!`;
    }
    if (isTrial && productsCount > 0) {
      return `Halo! Saya **BoonPilot Copilot**, konsultan penjualan AI toko Anda. 🚀\n\n🎯 Toko Anda aktif dengan **${productsCount} produk** (Paket Solo/Trial).\n\n💡 **Tips Penjualan Cepat & Impulse Buying:**\n- Etalase toko cukup berisi deskripsi singkat, benefit produk, dan tombol checkout instan tanpa FAQ panjang.\n- Serahkan edukasi dan penanganan keraguan pembeli ke AI Knowledge & Bot WhatsApp.\n- Siap scale-up iklan berbayar (Meta/TikTok Ads)? Tanyakan saya tentang upgrade ke **Ads Performance (Rp 299k/bln)** untuk Server-Side CAPI tracking akurat!`;
    }
    return `Halo! Saya **BoonPilot Copilot**, konsultan penjualan AI & asisten toko cerdas Anda. 🚀\n\nSaya siap membantu Anda meninjau 5 Checklist Wajib Siap Jual, strategi *impulse buying* tanpa FAQ panjang, analisa stok, hingga otomasi closing di WhatsApp.`;
  };

  const buildWelcomeQuickActions = (): string[] => {
    if (productsCount === 0) {
      return [
        '5 Checklist Wajib Siap Jual',
        'Kenapa toko online tidak butuh FAQ panjang?',
        'Import Massal (.xlsx / .csv)',
        '+ Tambah Produk Baru',
      ];
    }
    if (!isQrisUploaded) {
      return [
        '5 Checklist Wajib Siap Jual',
        'Kenapa toko online tidak butuh FAQ panjang?',
        'Cara upload QRIS & setup BoonTrack Reader',
        'Cara melatih AI Knowledge Toko',
      ];
    }
    const isTrial = subscriptionPlan === 'SOLO_TRIAL' || subscriptionPlan === 'solo_trial' || subscriptionPlan === 'SOLO';
    if (isTrial) {
      return [
        '5 Checklist Wajib Siap Jual',
        'Kenapa toko online tidak butuh FAQ panjang?',
        'Strategi impulse buying untuk iklan',
        'Keunggulan paket Ads Performance (Rp 299k)',
      ];
    }
    return [
      '5 Checklist Wajib Siap Jual',
      'Kenapa toko online tidak butuh FAQ panjang?',
      'Performa penjualan toko minggu ini',
      'Optimasi closing rate bot WhatsApp',
    ];
  };

  // Default welcome message for active store
  const defaultWelcome: ChatMessage = {
    id: 'welcome-1',
    sender: 'assistant',
    text: buildWelcomeText(),
    timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    quick_actions: buildWelcomeQuickActions(),
  };

  // Onboarding welcome message when products are empty
  const emptyProductsWelcome: ChatMessage = {
    id: 'welcome-empty-1',
    sender: 'assistant',
    text: `Halo! Saya **BoonPilot Copilot**, konsultan penjualan AI toko Anda. 🚀\n\n🎯 **5 Checklist Wajib Siap Jual Sebelum Mulai Promosi:**\n1. 📦 **Katalog Produk:** Upload produk & tata etalase (foto & harga jelas).\n2. 🧠 **AI Knowledge Toko:** WAJIB diisi agar bot tidak halu saat menjawab pembeli.\n3. 💬 **WhatsApp Bot Gateway:** Scan QR BoonTrack Direct Connect agar CS online 24/7.\n4. 🚚 **Logistik Diskon:** Dapatkan diskon ongkir & cashback s/d puluhan persen dibanding drop-off manual.\n5. ⚡ **Otomasi QRIS Dinamis:** Pasang QRIS & unduh BoonTrack Reader agar verifikasi otomatis tanpa cek mutasi manual.\n\n💡 *Positioning Penting:* Toko online modern **tidak butuh FAQ panjang** yang bikin calon pembeli kabur! Cukup cantumkan deskripsi & benefit pemikat *impulse buying*, lalu biarkan AI Knowledge & WhatsApp Bot yang menjawab pertanyaan calon pembeli.\n\nSilakan klik tombol **'Import Massal (.xlsx / .csv)'** atau **'+ Tambah Produk Baru'** untuk memulai etalase Anda!`,
    timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    quick_actions: [
      '5 Checklist Wajib Siap Jual',
      'Kenapa toko online tidak butuh FAQ panjang?',
      'Import Massal (.xlsx / .csv)',
      '+ Tambah Produk Baru',
    ]
  };

  // Persistent session ID
  const [sessionId, setSessionId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const existing = sessionStorage.getItem(sessionKey);
        if (existing) return existing;
        const newId = `bp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        sessionStorage.setItem(sessionKey, newId);
        return newId;
      } catch {
        // Ignore
      }
    }
    return `bp_${Date.now()}`;
  });

  // Lazy-initialize messages state directly from sessionStorage to prevent state overwrite on mount
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch {
        // Ignore parse error
      }
    }
    return [initialWelcome];
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Dynamically update welcome message if store state changes to empty and user has not started conversing
  useEffect(() => {
    if (isProductsEmpty) {
      setMessages((prev) => {
        if (prev.length <= 1 && (!prev[0] || prev[0].sender === 'assistant')) {
          return [emptyProductsWelcome];
        }
        return prev;
      });
    }
  }, [isProductsEmpty]);

  // Sync to sessionStorage whenever messages change
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // Ignore quota error
    }
  }, [messages, storageKey]);

  // Auto scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, scrollToBottom]);

  // Smart local responder function for instant & high quality guidance
  const getSmartLocalResponse = (q: string): { text: string; quick_actions: string[] } => {
    const query = q.toLowerCase();

    // 1. Checklist Wajib Siap Jual
    if (query.includes('checklist') || query.includes('siap jual') || query.includes('roadmap') || query.includes('langkah')) {
      return {
        text: `Berikut adalah **5 Checklist Wajib Siap Jual** sebelum Anda mulai beriklan atau membagikan link toko:\n\n1. 📦 **Katalog Produk & Etalase Rapi:** Pastikan foto produk beresolusi tinggi, harga pas, dan deskripsi singkat menonjolkan manfaat utama.\n2. 🧠 **Isi AI Knowledge Toko (WAJIB):** Latih bot dengan pengetahuan produk, FAQ spesifik, garansi, dan kebijakan toko agar bot **tidak halu** dan bisa merekomendasikan produk secara akurat.\n3. 💬 **Scan WhatsApp Gateway:** Hubungkan nomor via *BoonTrack Direct Connect* agar bot CS otomatis menjawab chat 24/7 tanpa membuat calon pembeli menunggu.\n4. 🚚 **Aktivasi Logistik & Multi-Ekspedisi:** Nikmati diskon ongkir & cashback hingga puluhan persen otomatis melalui dashboard dibanding Anda antar paket manual ke counter kurir.\n5. ⚡ **Otomasi QRIS Dinamis & BoonTrack Reader:** Upload QRIS statis dan unduh APK BoonTrack Reader agar pembayaran pembeli terverifikasi real-time tanpa perlu Anda cek mutasi manual tengah malam!`,
        quick_actions: [
          'Kenapa toko online tidak butuh FAQ panjang?',
          'Cara isi AI Knowledge Toko',
          'Cara setup BoonTrack Reader & QRIS',
          'Edukasi Diskon Ongkir Logistik',
        ],
      };
    }

    // 2. Positioning No-FAQ & Impulse Buying
    if (query.includes('faq') || query.includes('impulse') || query.includes('panjang') || query.includes('kenapa')) {
      return {
        text: `💡 **Filosofi Modern: Kenapa Toko Online Tidak Butuh FAQ Panjang di Halaman Produk?**\n\n1. **Pembeli Malas Membaca Teks Panjang:** Menaruh puluhan baris FAQ di etalase/landing page hanya membuat calon pembeli bosan, terdistraksi, dan akhirnya kabur (*high bounce rate*).\n2. **Kekuatan Impulse Buying:** Etalase yang efektif hanya butuh foto memikat, penawaran menarik, dan poin manfaat produk yang langsung menyentuh emosi pembeli untuk segera checkout.\n3. **Bot WhatsApp Sebagai CS Penutup:** Biarkan pertanyaan detail, keraguan pembeli (*objection handling*), komplain, dan konsultasi spesifik dijawab langsung oleh **AI Knowledge Toko & Bot WhatsApp BoonTrack** secara personal, cepat, dan interaktif!\n\nDengan formula ini, konversi penjualan Anda akan melonjak drastis! 🚀`,
        quick_actions: [
          '5 Checklist Wajib Siap Jual',
          'Strategi impulse buying untuk iklan',
          'Cara melatih AI Knowledge Toko',
          'Hubungkan WhatsApp Bot',
        ],
      };
    }

    // 3. Logistik Diskon
    if (query.includes('logistik') || query.includes('ekspedisi') || query.includes('ongkir') || query.includes('diskon')) {
      return {
        text: `🚚 **Keuntungan Logistik Multi-Ekspedisi di BoonTrack:**\n\n- **Diskon Ongkir & Cashback:** Dapatkan potongan ongkir s/d puluhan persen dibanding tarif reguler di counter ekspedisi.\n- **Pick-up Kurir Otomatis:** Kurir (J&T, SiCepat, JNE, dll) langsung datang menjemput paket ke alamat Anda tanpa perlu antre di agen.\n- **Resi Otomatis ke WhatsApp Pembeli:** Nomor resi langsung terkirim otomatis ke WhatsApp pelanggan begitu paket di-pick up!`,
        quick_actions: [
          '5 Checklist Wajib Siap Jual',
          'Cara upload QRIS & setup BoonTrack Reader',
          'Kenapa toko online tidak butuh FAQ panjang?',
        ],
      };
    }

    // 4. QRIS Dinamis & BoonTrack Reader
    if (query.includes('qris') || query.includes('reader') || query.includes('pembayaran') || query.includes('statis')) {
      return {
        text: `⚡ **Otomasi Pembayaran QRIS Dinamis (BoonTrack Reader):**\n\n1. **Upload QRIS Statis:** Masuk ke tab **Pengaturan** dan unggah gambar QRIS toko Anda (BCA, DANA, GoPay, OVO, dll).\n2. **Unduh BoonTrack Reader APK:** Pasang aplikasi Android BoonTrack Reader di ponsel yang menerima notifikasi mutasi rekening/e-wallet.\n3. **Otomasi Tanpa MDR:** Begitu pembeli scan kode QRIS unik di checkout, notifikasi mutasi dibaca oleh Reader dan status pesanan langsung berubah jadi **LUNAS** secara otomatis tanpa potongan fee payment gateway!`,
        quick_actions: [
          '5 Checklist Wajib Siap Jual',
          'Download APK BoonTrack Reader',
          'Kenapa toko online tidak butuh FAQ panjang?',
        ],
      };
    }

    // 5. Upsell Paket Ads Performance
    if (query.includes('ads') || query.includes('iklan') || query.includes('capi') || query.includes('scale') || query.includes('upgrade') || query.includes('paket')) {
      return {
        text: `🚀 **Scale-Up dengan Paket Ads Performance (Rp 299.000/bulan):**\n\n- **Server-Side Meta CAPI & TikTok Events:** Kirim data konversi purchase langsung dari server toko, kebal terhadap iOS 14+ / ad-blocker.\n- **ROAS & Attribution Analytics:** Lacak kampanye iklan mana yang menghasilkan profit nyata hingga ke level omset bersih.\n- **Fitur Tanpa Batas:** Kapasitas produk tak terbatas dan broadcast WhatsApp terintegrasi.\n\nKlik menu profil atau klik tombol **Upgrade Sekarang** di tab Ads Tracking Pro untuk mengaktifkan paket ini!`,
        quick_actions: [
          '5 Checklist Wajib Siap Jual',
          'Kenapa toko online tidak butuh FAQ panjang?',
          'Strategi impulse buying untuk iklan',
        ],
      };
    }

    // Default Fallback
    return {
      text: `Halo! Saya **BoonPilot Copilot** siap membantu toko Anda. 🚀\n\nUntuk memastikan toko siap menghasilkan penjualan optimal, pastikan Anda telah menyelesaikan **5 Checklist Wajib Siap Jual**:\n1. 📦 Katalog Produk Rapi\n2. 🧠 AI Knowledge Toko Terisi Lengkap\n3. 💬 WhatsApp Bot Gateway Terhubung\n4. 🚚 Logistik Multi-Ekspedisi Aktif\n5. ⚡ Otomasi QRIS Dinamis & BoonTrack Reader Siap\n\nAda langkah yang ingin Anda tanyakan lebih lanjut?`,
      quick_actions: [
        '5 Checklist Wajib Siap Jual',
        'Kenapa toko online tidak butuh FAQ panjang?',
        'Import Massal (.xlsx / .csv)',
        '+ Tambah Produk Baru',
      ],
    };
  };

  // Send message handler - guarantees previous messages are preserved
  const handleSendMessage = useCallback(async (textToSend?: string) => {
    const userText = (textToSend || inputText).trim();
    if (!userText || loading) return;

    const userMessage: ChatMessage = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };

    // Calculate updated messages list snapshot without resetting state
    let historySnapshot: ChatMessage[] = [];
    setMessages((prev) => {
      const next = [...prev, userMessage];
      historySnapshot = next;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch (err) {
        console.warn('[BoonPilot] sessionStorage write note:', err);
      }
      return next;
    });

    setInputText('');
    setLoading(true);

    // Format conversation_history including all previous messages + current user message
    const conversation_history = historySnapshot.map((m) => ({
      role: m.sender,
      content: m.text,
      timestamp: m.timestamp,
      action_proposal: m.action_proposal || undefined,
      quick_actions: m.quick_actions || undefined,
    }));

    // Build dynamic tenant context with 5 Checklist Wajib Siap Jual & No-FAQ Positioning
    const isTrial = subscriptionPlan === 'SOLO_TRIAL' || subscriptionPlan === 'solo_trial' || subscriptionPlan === 'SOLO';
    const tenant_context = {
      products_count: productsCount,
      bot_connected: botConnected,
      is_qris_uploaded: isQrisUploaded,
      subscription_plan: subscriptionPlan,
      persona_hint: productsCount === 0
        ? 'ONBOARDING_EMPTY_CATALOG'
        : !isQrisUploaded
        ? 'ONBOARDING_MISSING_QRIS'
        : isTrial
        ? 'UPSELL_TRIAL_ACTIVE'
        : 'ACTIVE_MERCHANT',
      system_instruction: [
        `Kamu adalah BoonPilot, AI Sales Consultant & asisten operasional toko cerdas untuk platform BoonTrack.`,
        `Kondisi Toko Merchant: ${productsCount} produk aktif, bot WhatsApp ${botConnected ? 'terhubung' : 'belum terhubung'}, QRIS ${isQrisUploaded ? 'sudah diupload' : 'belum diupload'}, paket: ${subscriptionPlan}.`,
        `\n[5 CHECKLIST WAJIB SIAP JUAL BOONTRACK]:`,
        `Edukasi seller untuk menuntaskan 5 Checklist Wajib sebelum promosi/iklan:`,
        `1. Katalog Produk: Upload produk dan etalase dengan foto menarik, harga, dan varian yang jelas.`,
        `2. AI Knowledge Toko: WAJIB diisi! Agar bot pintar jawab komplain, spek produk, FAQ toko, dan TIDAK HALU saat melayani pembeli.`,
        `3. WhatsApp Bot Gateway: Scan QR BoonTrack Direct Connect agar CS otomatis ambil alih chat 24/7.`,
        `4. Logistik Multi-Ekspedisi: Edukasi seller bahwa order lewat sistem mendapat diskon ongkir & cashback s/d puluhan persen dibanding drop off manual.`,
        `5. Otomasi QRIS Dinamis & BoonTrack Reader: Upload QRIS statis & pasang Reader APK agar verifikasi pembayaran 100% otomatis tanpa cek mutasi manual tengah malam.`,
        `\n[POSITIONING NO-FAQ & IMPULSE BUYING]:`,
        `Tegaskan pada seller bahwa landing page / etalase toko online modern BUKAN tempat menaruh FAQ panjang bertele-tele yang bikin pembeli kabur karena malas membaca. Cukup pasang deskripsi & benefit memicu impulse buying. Biarkan AI Knowledge Toko & WhatsApp Bot BoonTrack yang menjawab pertanyaan detail dan closing order secara interaktif.`,
        `\n[STRATEGI UPSELL]:`,
        productsCount === 0
          ? `Prioritas: Dorong upload produk pertama via 'Import Massal (.xlsx / .csv)' atau '+ Tambah Produk Baru'. Jangan alihkan fokus sebelum katalog terisi.`
          : !isQrisUploaded
          ? `Prioritas: Arahkan seller upload QRIS statis dan unduh APK BoonTrack Reader di tab Pengaturan.`
          : isTrial
          ? `Seller di paket Solo/Trial: Saat seller bertanya tentang scale-up, traffic iklan berbayar (Meta/TikTok Ads), atau Server-Side CAPI, rekomendasikan upgrade ke paket Ads Performance (Rp 299k/bulan) atau Team Scale.`
          : `Bantu evaluasi performa penjualan toko, cross-selling, dan retensi pelanggan.`,
        `\nGaya: Profesional, solutif, percaya diri, gunakan markdown rapi, dan selalu sertakan CTA / pertanyaan lanjutan yang jelas.`,
      ].join('\n'),
    };

    try {
      const tenantForRequest = normalizedSlug || 'growth';
      const res = await fetch('/api/v1/merchant/copilot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Slug': tenantForRequest,
          'X-Tenant-ID': tenantForRequest,
        },
        body: JSON.stringify({
          tenant_slug: tenantForRequest,
          session_id: sessionId,
          message: userText,
          conversation_history,
          tenant_context,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const replyText = data.reply || data.reply_text || data.text || 'Saya telah memproses permintaan Anda.';
        const assistantMessage: ChatMessage = {
          id: `ast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          sender: 'assistant',
          text: replyText,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          action_proposal: data.action_proposal
            ? {
                ...data.action_proposal,
                status: 'pending',
              }
            : null,
          quick_actions: Array.isArray(data.quick_actions) && data.quick_actions.length > 0
            ? data.quick_actions
            : ['5 Checklist Wajib Siap Jual', 'Kenapa toko online tidak butuh FAQ panjang?'],
        };

        setMessages((prev) => {
          const next = [...prev, assistantMessage];
          try {
            sessionStorage.setItem(storageKey, JSON.stringify(next));
          } catch {}
          return next;
        });
      } else {
        const fallback = getSmartLocalResponse(userText);
        const errMessage: ChatMessage = {
          id: `ast_${Date.now()}`,
          sender: 'assistant',
          text: fallback.text,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          quick_actions: fallback.quick_actions,
        };
        setMessages((prev) => [...prev, errMessage]);
      }
    } catch {
      const fallback = getSmartLocalResponse(userText);
      const errMessage: ChatMessage = {
        id: `ast_${Date.now()}`,
        sender: 'assistant',
        text: fallback.text,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        quick_actions: fallback.quick_actions,
      };
      setMessages((prev) => [...prev, errMessage]);
    } finally {
      setLoading(false);
    }
  }, [inputText, loading, normalizedSlug, sessionId, storageKey, productsCount, botConnected, isQrisUploaded, subscriptionPlan]);

  // Listen for open-boonpilot custom events from anywhere in the app
  useEffect(() => {
    const handleOpenEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ prompt?: string }>;
      setIsOpen(true);
      if (customEvent.detail?.prompt) {
        handleSendMessage(customEvent.detail.prompt);
      }
    };
    window.addEventListener('open-boonpilot', handleOpenEvent);
    return () => window.removeEventListener('open-boonpilot', handleOpenEvent);
  }, [handleSendMessage]);

  // Action Proposal Approval/Rejection
  const handleActionDecision = async (
    messageId: string,
    proposal: ActionProposal,
    approved: boolean
  ) => {
    setExecutingActionId(proposal.id);

    // Optimistically set executing status
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === messageId && m.action_proposal) {
          return {
            ...m,
            action_proposal: {
              ...m.action_proposal,
              status: approved ? 'executing' : 'rejected',
            },
          };
        }
        return m;
      })
    );

    try {
      const res = await fetch('/api/v1/boonpilot/execute-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: normalizedSlug,
          action_id: proposal.id,
          action_type: proposal.type,
          approved,
          details: proposal.details,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === messageId && m.action_proposal) {
              return {
                ...m,
                action_proposal: {
                  ...m.action_proposal,
                  status: approved ? 'executed' : 'rejected',
                  result_message: data.message,
                },
              };
            }
            return m;
          })
        );
      } else {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === messageId && m.action_proposal) {
              return {
                ...m,
                action_proposal: {
                  ...m.action_proposal,
                  status: 'failed',
                  result_message: 'Gagal mengeksekusi aksi. Silakan ulangi.',
                },
              };
            }
            return m;
          })
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === messageId && m.action_proposal) {
            return {
              ...m,
              action_proposal: {
                ...m.action_proposal,
                status: 'failed',
                result_message: 'Koneksi terputus saat mengeksekusi aksi.',
              },
            };
          }
          return m;
        })
      );
    } finally {
      setExecutingActionId(null);
    }
  };

  // Reset conversation - creates a fresh session
  const handleResetChat = () => {
    const newSessionId = `bp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    setSessionId(newSessionId);
    setMessages([initialWelcome]);
    try {
      sessionStorage.setItem(sessionKey, newSessionId);
      sessionStorage.setItem(storageKey, JSON.stringify([initialWelcome]));
    } catch {
      // Ignore
    }
  };

  const hasUserMessages = messages.some((m) => m.sender === 'user');

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      
      {/* ── CHAT WINDOW ── */}
      {isOpen && (
        <div className="mb-3.5 w-[calc(100vw-32px)] sm:w-[420px] h-[580px] max-h-[85vh] bg-white rounded-3xl shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200 isolate">
          
          {/* Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/40 shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                  <Sparkles className="w-5 h-5" />
                </div>
                {/* Green Online Indicator */}
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-slate-900" />
                </span>
              </div>
              <div>
                <h3 className="font-black text-sm text-white tracking-tight flex items-center gap-1.5">
                  <span>BoonPilot Copilot</span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-blue-500/20 text-blue-300 border border-blue-400/30">
                    AI PRO
                  </span>
                </h3>
                <p className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                  <span>Copilot &amp; Asisten Toko Anda • Online</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleResetChat}
                title="Mulai Sesi Baru"
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Tutup BoonPilot Copilot"
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/50">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${
                  m.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div className="flex items-end gap-2 max-w-[90%]">
                  {m.sender === 'assistant' && (
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 mb-1 shadow-xs text-[10px]">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                  )}

                  <div
                    className={`rounded-2xl px-4 py-3 shadow-xs ${
                      m.sender === 'user'
                        ? 'bg-blue-600 text-white rounded-br-xs'
                        : 'bg-white border border-slate-200/80 text-slate-800 rounded-bl-xs'
                    }`}
                  >
                    {m.sender === 'user' ? (
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{m.text}</p>
                    ) : (
                      <MarkdownContent content={m.text} />
                    )}
                  </div>
                </div>

                {/* Interactive Action Approval Card */}
                {m.action_proposal && (
                  <div className="mt-2.5 ml-8 max-w-[85%] w-full bg-white border border-indigo-200 rounded-2xl p-3.5 shadow-sm space-y-3 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded-lg bg-indigo-50 text-indigo-600">
                          <Zap className="w-4 h-4" />
                        </span>
                        <h4 className="font-black text-xs text-indigo-950">
                          {m.action_proposal.title}
                        </h4>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                        Proposal
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-slate-800 leading-snug">
                      {m.action_proposal.description}
                    </div>

                    {m.action_proposal.details && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1 text-[11px]">
                        {Object.entries(m.action_proposal.details).map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-2">
                            <span className="text-slate-500 font-medium">{k}:</span>
                            <span className="text-slate-900 font-bold truncate">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action Execution Buttons / Status State */}
                    {m.action_proposal.status === 'pending' && (
                      <div className="pt-1 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleActionDecision(m.id, m.action_proposal!, true)}
                          disabled={executingActionId === m.action_proposal.id}
                          className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                        >
                          {executingActionId === m.action_proposal.id ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Mengeksekusi...</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Eksekusi Sekarang</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleActionDecision(m.id, m.action_proposal!, false)}
                          disabled={executingActionId === m.action_proposal.id}
                          className="py-2 px-3 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 rounded-xl text-xs font-bold transition cursor-pointer"
                        >
                          ✕ Batalkan
                        </button>
                      </div>
                    )}

                    {m.action_proposal.status === 'executing' && (
                      <div className="p-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        <span>Menerapkan perubahan ke sistem toko...</span>
                      </div>
                    )}

                    {m.action_proposal.status === 'executed' && (
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span className="leading-snug">
                          {m.action_proposal.result_message || 'Aksi berhasil dieksekusi secara instan!'}
                        </span>
                      </div>
                    )}

                    {m.action_proposal.status === 'rejected' && (
                      <div className="p-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold flex items-center gap-2">
                        <X className="w-3.5 h-3.5 text-slate-400" />
                        <span>Aksi dibatalkan. Tidak ada perubahan data.</span>
                      </div>
                    )}

                    {m.action_proposal.status === 'failed' && (
                      <div className="p-2 rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                        <span>{m.action_proposal.result_message || 'Gagal mengeksekusi aksi.'}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Quick Action Chips from Assistant Response */}
                {m.sender === 'assistant' && m.quick_actions && m.quick_actions.length > 0 && (
                  <div className="mt-2.5 ml-8 flex flex-wrap gap-1.5 animate-in fade-in slide-in-from-top-1">
                    {m.quick_actions.map((item, aIdx) => {
                      const label = typeof item === 'string' ? item : item.label;
                      return (
                        <button
                          key={aIdx}
                          type="button"
                          disabled={loading}
                          onClick={() => handleSendMessage(label)}
                          className="px-2.5 py-1.5 rounded-xl bg-blue-50/90 hover:bg-blue-100 text-blue-700 border border-blue-200/90 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-left"
                        >
                          <Sparkles className="w-3 h-3 text-blue-600 shrink-0" />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <span className="text-[10px] text-slate-400 mt-1 px-1">
                  {m.timestamp}
                </span>
              </div>
            ))}

            {loading && (
              <div className="flex items-end gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 mb-1 text-[10px]">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-xs flex items-center gap-2 text-slate-500 text-xs font-medium">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  <span>BoonPilot sedang menganalisis...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Starter Chips (Shown at start of session before user sends messages) */}
          {!hasUserMessages && (
            <div className="p-3 bg-slate-100/70 border-t border-slate-200/80 space-y-1.5">
              <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block px-1">
                Saran Pertanyaan Cepat:
              </span>
              <div className="flex flex-col gap-1.5">
                {(isProductsEmpty ? EMPTY_PRODUCTS_STARTER_CHIPS : STARTER_CHIPS).map((chip, idx) => {
                  const Icon = chip.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={loading}
                      onClick={() => handleSendMessage(chip.label)}
                      className="w-full text-left p-2 rounded-xl bg-white hover:bg-blue-50/80 hover:text-blue-700 border border-slate-200/80 text-slate-700 text-xs font-semibold transition flex items-center gap-2 shadow-2xs group cursor-pointer disabled:opacity-50"
                    >
                      <span className="p-1 rounded-lg bg-slate-50 group-hover:bg-blue-100 text-slate-500 group-hover:text-blue-600 shrink-0">
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span className="truncate">{chip.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ketik instruksi atau pertanyaan ke BoonPilot Copilot..."
              disabled={loading}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-500 transition"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || loading}
              className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-xl transition cursor-pointer shadow-sm disabled:cursor-not-allowed"
              title="Kirim Pesan"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

        </div>
      )}

      {/* ── FLOATING TOGGLE BUBBLE ── */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="group relative flex items-center gap-2.5 p-3 sm:px-4 sm:py-3.5 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-500/30 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer isolate"
        aria-label="Toggle BoonPilot Copilot"
      >
        {/* Green Online Status Indicator */}
        <span className="absolute -top-1 -right-1 flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white" />
        </span>

        {isOpen ? (
          <X className="w-5 h-5 text-white" />
        ) : (
          <Sparkles className="w-5 h-5 text-white animate-pulse" />
        )}

        <div className="hidden sm:flex flex-col text-left pr-1">
          <span className="text-xs font-black tracking-tight leading-none text-white">
            BoonPilot Copilot
          </span>
          <span className="text-[10px] text-blue-100 font-semibold leading-none mt-0.5">
            Store Copilot
          </span>
        </div>
      </button>

    </div>
  );
}
