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
  FileText,
  Lock,
} from 'lucide-react';
import { searchPlatformKnowledge } from '@/lib/boonpilotKnowledge';
import type { BusinessConfigurationProposal } from '@/types/boonpilot';
import GuidedSetupInterview from './boonpilot/GuidedSetupInterview';
import ProposalPreviewCard from './boonpilot/ProposalPreviewCard';

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
  configuration_proposal?: BusinessConfigurationProposal | null;
  quick_actions?: Array<string | QuickActionItem> | null;
}

interface BoonPilotWidgetProps {
  tenantSlug?: string | string[];
  storeCategory?: string;
  businessType?: string;
  storeName?: string;
  isProductsEmpty?: boolean;
  onOpenBulkImport?: () => void;
  onOpenNewProduct?: () => void;
  productsCount?: number;
  botConnected?: boolean;
  isQrisUploaded?: boolean;
  subscriptionPlan?: string;
  isAiBotAllowed?: boolean;
  isCheckoutLite?: boolean;
  onUpgrade?: (tier?: string) => void;
}

const STARTER_CHIPS = [
  {
    label: '🎯 SOP 3 Langkah Aktivasi Toko & WhatsApp Commerce',
    icon: Sparkles,
  },
  {
    label: '🎯 Mulai Guided Setup Toko (AI Interview)',
    icon: Sparkles,
  },
  {
    label: '5 Checklist Wajib Siap Jual',
    icon: TrendingUp,
  },
  {
    label: '⚡ Cara Kerja Dynamic QRIS EMVCo & Kode Unik',
    icon: Zap,
  },
  {
    label: '🤝 Aturan Handoff CS Manual & Bot Paused',
    icon: MessageSquare,
  },
  {
    label: 'Kenapa toko online tidak butuh FAQ panjang?',
    icon: MessageSquare,
  },
  {
    label: 'Apa fungsi download QR meja toko?',
    icon: Zap,
  },
  {
    label: 'Bikin promo bundling biar orderan banjir!',
    icon: Package,
  },
];

const EMPTY_PRODUCTS_STARTER_CHIPS = [
  {
    label: '🎯 SOP 3 Langkah Aktivasi Toko & WhatsApp Commerce',
    icon: Sparkles,
  },
  {
    label: '🎯 Mulai Guided Setup Toko (AI Interview)',
    icon: Sparkles,
  },
  {
    label: '5 Checklist Wajib Siap Jual',
    icon: TrendingUp,
  },
  {
    label: '⚡ Cara Kerja Dynamic QRIS EMVCo & Kode Unik',
    icon: Zap,
  },
  {
    label: 'Bagaimana cara import file Tokopedia/Shopee?',
    icon: FileSpreadsheet,
  },
  {
    label: 'Panduan format spreadsheet katalog',
    icon: FileText,
  },
  {
    label: 'Bantu saya upload produk pertama',
    icon: Package,
  },
];

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
  storeCategory = 'retail',
  businessType,
  storeName = 'Toko Anda',
  isProductsEmpty = false,
  onOpenBulkImport,
  onOpenNewProduct,
  productsCount = 0,
  botConnected = false,
  isQrisUploaded = false,
  subscriptionPlan = 'SOLO_TRIAL',
  isAiBotAllowed = true,
  isCheckoutLite = false,
  onUpgrade,
}: BoonPilotWidgetProps) {
  const normalizedSlug = Array.isArray(tenantSlug)
    ? tenantSlug[0]
    : tenantSlug || '';

  const currentTier = String(subscriptionPlan || '').toUpperCase();
  const isStarterOrAbove = ['STARTER', 'SOLO', 'ADS_PERFORMANCE', 'PRO_SCALE', 'ENTERPRISE'].includes(currentTier);

  const isLocked = !isStarterOrAbove && Boolean(
    isCheckoutLite ||
    isAiBotAllowed === false ||
    currentTier === 'CHECKOUT_LITE' ||
    currentTier === 'LITE'
  );

  const [isOpen, setIsOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<'chat' | 'guided_setup'>('chat');
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);

  const storageKey = `boonpilot_history_v2_${normalizedSlug}`;
  const sessionKey = `boonpilot_session_id_${normalizedSlug}`;

  const buildWelcomeText = (): string => {
    return `Halo! Saya **BoonPilot**, asisten operasional toko Anda. 🚀\n\nMau saya bantu bikin teks penawaran produk, cek data order, atau siapkan promo hari ini?`;
  };

  const buildWelcomeQuickActions = (): string[] => {
    return [
      '✨ Bikin Penawaran Produk Baru',
      '📦 Cek Data Order & Ringkasan Toko',
      '🎯 Susun Strategi Diskon & Promo',
      '💬 Evaluasi Closing Chat WhatsApp',
      '⚡ 5 Checklist Wajib Siap Jual',
    ];
  };

  const initialWelcome: ChatMessage = {
    id: 'welcome-1',
    sender: 'assistant',
    text: buildWelcomeText(),
    timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    quick_actions: buildWelcomeQuickActions(),
  };

  const [sessionId, setSessionId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const existing = sessionStorage.getItem(sessionKey);
        if (existing) return existing;
        const newId = `bp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        sessionStorage.setItem(sessionKey, newId);
        return newId;
      } catch {}
    }
    return `bp_${Date.now()}`;
  });

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
      } catch {}
    }
    return [initialWelcome];
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {}
  }, [messages, storageKey]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (isOpen && activeMode === 'chat') {
      scrollToBottom();
    }
  }, [messages, isOpen, activeMode, scrollToBottom]);

  const handleSendMessage = useCallback(async (textToSend?: string) => {
    const userText = (textToSend || inputText).trim();
    if (!userText || loading) return;

    // Hard Entitlement Guard: CHECKOUT_LITE tidak boleh memicu query AI
    if (isLocked) {
      setInputText('');
      return;
    }

    if (
      userText.includes('Guided Setup') ||
      userText.toLowerCase().includes('guided setup') ||
      userText.toLowerCase().includes('setup terpandu')
    ) {
      setActiveMode('guided_setup');
      setInputText('');
      return;
    }

    const userMessage: ChatMessage = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };

    // ── CENTRALIZED PLATFORM KNOWLEDGE CHECK ──
    const matchedKnowledge = searchPlatformKnowledge(userText);
    if (matchedKnowledge) {
      const localAssistantMsg: ChatMessage = {
        id: `ast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        sender: 'assistant',
        text: matchedKnowledge.text,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        quick_actions: matchedKnowledge.quick_actions,
      };
      setMessages((prev) => [...prev, userMessage, localAssistantMsg]);
      setInputText('');
      setLoading(false);
      return;
    }

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

    const conversation_history = historySnapshot.map((m) => ({
      role: m.sender,
      content: m.text,
      timestamp: m.timestamp,
      action_proposal: m.action_proposal || undefined,
      quick_actions: m.quick_actions || undefined,
    }));

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
        `1. Katalog Produk: Upload produk dan etalase dengan foto menarik, harga, dan bundling yang jelas.`,
        `2. AI Knowledge Toko: WAJIB diisi! Agar bot pintar jawab komplain, spek produk, FAQ toko, dan TIDAK HALU saat melayani pembeli.`,
        `3. WhatsApp Bot Gateway: Scan QR BoonTrack Direct Connect agar CS otomatis ambil alih chat 24/7.`,
        `4. Logistik Multi-Ekspedisi: Edukasi seller bahwa order lewat sistem mendapat diskon ongkir & cashback otomatis.`,
        `5. Otomasi QRIS Dinamis & BoonTrack Reader: Upload QRIS statis & pasang Reader APK agar verifikasi pembayaran 100% otomatis tanpa cek mutasi manual.`,
        `\n[POSITIONING NO-FAQ & IMPULSE BUYING]:`,
        `Tegaskan pada seller bahwa landing page / etalase toko online modern BUKAN tempat menaruh FAQ panjang bertele-tele yang bikin pembeli kabur karena malas membaca. Cukup pasang deskripsi & benefit memicu impulse buying. Biarkan AI Knowledge Toko & WhatsApp Bot BoonTrack yang menjawab pertanyaan detail dan closing order secara interaktif.`,
        `\n[PETA NAVIGASI UI DASHBOARD (UI HIERARCHY TREE)]`,
        `Gunakan panduan menu berikut saat memandu merchant awam:`,
        `- Tab 'Ringkasan' (Overview): Memantau omset, grafik penjualan, jumlah pesanan, dan konversi.`,
        `- Tab 'Katalog Produk': Menambah produk (+ Tambah Produk Baru), import spreadsheet (.xlsx/.csv), ubah stok fisik (+/-), dan atur Single Page Checkout per produk.`,
        `- Tab 'Pesanan' (Orders): Daftar order masuk, cek pembayaran QRIS, tombol konfirmasi lunas (Quick Paid/God Button).`,
        `- Tab 'WhatsApp':`,
        `  * Hubungkan WhatsApp via BoonTrack Direct Connect (scan QR) atau Official WABA.`,
        `  * Ubah Pesan Sapaan Otomatis (Greeting Message): Gulir ke kartu 'Pesan Sapaan Otomatis', ketik kalimat sapaan toko, lalu klik 'Simpan Pesan Sapaan'.`,
        `- Tab 'Inbox Console' (Team Chat): Membaca chat pelanggan masuk real-time, balas manual CS, dan toggle jeda bot (bot_paused).`,
        `- Tab 'Pelacakan Iklan' (Ads Tracking): Memasang Meta Pixel, TikTok Pixel, dan token Meta Server-Side CAPI.`,
        `- Tab 'Pengaturan' (Settings):`,
        `  * Sub-menu Profil: Logo toko, nama toko, bio toko, unduh QR meja cetak (.png).`,
        `  * Sub-menu WhatsApp: Nomor CS & Pesan Sapaan Otomatis Toko.`,
        `  * Sub-menu Pembayaran: Upload barcode QRIS toko (BoonTrack Reader 0% MDR).`,
        `  * Sub-menu Pengiriman: Kota asal toko & ekspedisi kurir aktif.`,
        `\n[ATURAN NAVIGASI WAJIB]:`,
        `Saat merchant bertanya cara mengubah pengaturan toko, ganti teks sapaan WhatsApp, atau cari fitur, JANGAN menjelaskan arsitektur teknis atau persona AI. WAJIB pandu mereka dengan langkah klik menu visual sesuai Peta Navigasi UI di atas!`,
        `\n[STRATEGI UPSELL]:`,
        productsCount === 0
          ? `Prioritas: Dorong upload produk pertama via 'Import Massal (.xlsx / .csv)' atau '+ Tambah Produk Baru'.`
          : !isQrisUploaded
            ? `Prioritas: Arahkan seller upload QRIS statis dan unduh APK BoonTrack Reader di tab Pengaturan.`
            : isTrial
              ? `Seller di paket Solo/Trial: Saat seller bertanya tentang scale-up, traffic iklan berbayar (Meta/TikTok Ads), atau Server-Side CAPI, rekomendasikan upgrade ke paket Ads Performance (Rp 299k/bulan).`
              : `Bantu evaluasi performa penjualan toko, penawaran bundling, dan retensi pelanggan.`,
        `\nGaya: Profesional, solutif, memandu navigasi menu secara jelas, gunakan markdown rapi, dan selalu sertakan CTA yang jelas.`,
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
            : ['5 Checklist Wajib Siap Jual', '⚡ Cara aktifkan konfirmasi QRIS otomatis?'],
        };

        setMessages((prev) => {
          const next = [...prev, assistantMessage];
          try {
            sessionStorage.setItem(storageKey, JSON.stringify(next));
          } catch {}
          return next;
        });
      } else {
        const errMessage: ChatMessage = {
          id: `ast_${Date.now()}`,
          sender: 'assistant',
          text: `Halo! Saya **BoonPilot Copilot** siap membantu toko Anda. 🚀\n\nPastikan Anda telah menyelesaikan **5 Checklist Wajib Siap Jual**. Ada yang ingin didiskusikan?`,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          quick_actions: ['5 Checklist Wajib Siap Jual', '⚡ Cara aktifkan konfirmasi QRIS otomatis?'],
        };
        setMessages((prev) => [...prev, errMessage]);
      }
    } catch {
      const errMessage: ChatMessage = {
        id: `ast_${Date.now()}`,
        sender: 'assistant',
        text: `Halo! Saya **BoonPilot Copilot** siap membantu toko Anda. 🚀\n\nKoneksi terputus saat memproses pesan. Silakan coba tanyakan kembali atau pilih panduan cepat di bawah.`,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        quick_actions: ['5 Checklist Wajib Siap Jual', '⚡ Cara aktifkan konfirmasi QRIS otomatis?'],
      };
      setMessages((prev) => [...prev, errMessage]);
    } finally {
      setLoading(false);
    }
  }, [inputText, loading, normalizedSlug, sessionId, storageKey, productsCount, botConnected, isQrisUploaded, subscriptionPlan]);

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

  const handleActionDecision = async (
    messageId: string,
    proposal: ActionProposal,
    approved: boolean
  ) => {
    setExecutingActionId(proposal.id);

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

  const handleResetChat = () => {
    const newSessionId = `bp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    setSessionId(newSessionId);
    setMessages([initialWelcome]);
    try {
      sessionStorage.setItem(sessionKey, newSessionId);
      sessionStorage.setItem(storageKey, JSON.stringify([initialWelcome]));
    } catch {}
  };

  const hasUserMessages = messages.some((m) => m.sender === 'user');

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      
      {isOpen && (
        <div className="mb-3.5 w-[calc(100vw-32px)] sm:w-[420px] h-[580px] max-h-[85vh] bg-white rounded-3xl shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200 isolate">
          
          <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/40 shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                  <Sparkles className="w-4 h-4" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-slate-900" />
                </span>
              </div>
              <div>
                <h3 className="font-black text-sm text-white tracking-tight flex items-center gap-1.5">
                  <span>BoonPilot — Asisten Toko</span>
                  {isLocked ? (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" />
                      LOCKED
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-blue-500/20 text-blue-300 border border-blue-400/30">
                      AI PRO
                    </span>
                  )}
                </h3>
                {!isLocked && (
                  <div className="flex items-center gap-1 mt-1">
                    <button
                      type="button"
                      onClick={() => setActiveMode('chat')}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer flex items-center gap-1 ${
                        activeMode === 'chat'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-400 hover:text-white bg-slate-800/60'
                      }`}
                    >
                      <MessageSquare className="w-2.5 h-2.5" />
                      <span>Chat</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMode('guided_setup')}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer flex items-center gap-1 ${
                        activeMode === 'guided_setup'
                          ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-2xs'
                          : 'text-slate-400 hover:text-white bg-slate-800/60'
                      }`}
                    >
                      <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                      <span>Setup Terpandu</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {!isLocked && (
                <button
                  type="button"
                  onClick={handleResetChat}
                  title="Mulai Sesi Baru"
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Tutup BoonPilot Copilot"
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {isLocked ? (
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-4 bg-slate-50 dark:bg-slate-900">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-inner">
                <Lock className="w-7 h-7" />
              </div>
              <div className="space-y-1.5 max-w-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800 inline-block">
                  Paket Checkout Lite
                </span>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  BoonPilot AI Copilot Terkunci
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Paket <strong>Checkout Lite</strong> difokuskan untuk Single Page Checkout &amp; Dynamic QRIS 0% MDR. Fitur konsultasi AI, rekomendasi katalog, dan WhatsApp Commerce AI tersedia pada paket <strong>Starter</strong> dan <strong>Pro Scale</strong>.
                </p>
              </div>

              <div className="w-full max-w-xs pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onUpgrade?.('starter');
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold transition shadow-md shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Upgrade ke Starter (Rp 199k/bln)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="w-full py-1.5 px-3 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 transition cursor-pointer"
                >
                  Kembali ke Dashboard
                </button>
              </div>
            </div>
          ) : activeMode === 'guided_setup' ? (
            <div className="flex-1 overflow-hidden flex flex-col">
              <GuidedSetupInterview
                tenantSlug={normalizedSlug}
                context={{
                  tenantSlug: normalizedSlug,
                  storeCategory,
                  businessType,
                  storeName,
                  productsCount,
                }}
                onFinish={(publishedProposal) => {
                  const successMsg: ChatMessage = {
                    id: `ast_${Date.now()}`,
                    sender: 'assistant',
                    text: `🎉 **Konfigurasi Bisnis Toko Berhasil Diaktifkan (PUBLISHED)!**\n\n` +
                      `• **Template Bisnis:** \`${publishedProposal.template_code}\`\n` +
                      `• **Profil Bisnis:** ${publishedProposal.business_profile.store_name}\n` +
                      `• **Aturan Pembayaran:** Waktu & metode pelunasan telah tersimpan.\n` +
                      `• **Syarat Booking:** Form reservasi pelanggan telah disinkronkan.\n` +
                      `• **Knowledge Base:** Kebijakan garansi & penanganan harga mahal siap dipakai Bot WhatsApp.\n\n` +
                      `Bot WhatsApp dan sistem checkout Anda kini beroperasi dengan konfigurasi baru!`,
                    timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                    configuration_proposal: publishedProposal,
                  };
                  setMessages((prev) => [...prev, successMsg]);
                  setActiveMode('chat');
                }}
                onCancel={() => setActiveMode('chat')}
              />
            </div>
          ) : (
            <>
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

                    {m.configuration_proposal && (
                      <div className="mt-2.5 ml-8 max-w-[92%] w-full">
                        <ProposalPreviewCard
                          proposal={m.configuration_proposal}
                          tenantSlug={normalizedSlug}
                          onEdit={() => setActiveMode('guided_setup')}
                        />
                      </div>
                    )}

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

                    {m.sender === 'assistant' && m.quick_actions && m.quick_actions.length > 0 && (
                      <div className="mt-2.5 ml-8 flex flex-wrap gap-1.5 animate-in fade-in slide-in-from-top-1">
                        {m.quick_actions.map((item, aIdx) => {
                          const label = typeof item === 'string' ? item : item.label;
                          return (
                            <button
                              key={aIdx}
                              type="button"
                              disabled={loading}
                              onClick={() => {
                                if (label.includes('Guided Setup') || label.toLowerCase().includes('guided setup')) {
                                  setActiveMode('guided_setup');
                                } else if (label.includes('Penawaran Produk') && onOpenNewProduct) {
                                  setIsOpen(false);
                                  onOpenNewProduct();
                                } else {
                                  handleSendMessage(label);
                                }
                              }}
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
                          onClick={() => {
                            if (chip.label.includes('Guided Setup') || chip.label.toLowerCase().includes('guided setup')) {
                              setActiveMode('guided_setup');
                            } else {
                              handleSendMessage(chip.label);
                            }
                          }}
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
                  placeholder="Tanya strategi toko, bikin copywriting, cek data order..."
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
            </>
          )}

        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`group relative flex items-center gap-2.5 p-3 sm:px-4 sm:py-3.5 rounded-full text-white shadow-xl transition-all duration-200 cursor-pointer isolate ${
          isLocked
            ? 'bg-gradient-to-r from-slate-700 via-slate-800 to-slate-900 shadow-slate-900/30 border border-slate-600/50 hover:scale-105 active:scale-95'
            : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 shadow-indigo-500/30 hover:scale-105 active:scale-95'
        }`}
        aria-label="Tanya BoonPilot (Asisten Toko)"
        title="Tanya BoonPilot (Asisten Toko)"
      >
        <span className="absolute -top-1 -right-1 flex h-4 w-4">
          {isLocked ? (
            <span className="relative inline-flex items-center justify-center rounded-full h-4 w-4 bg-amber-500 border-2 border-white text-[8px] font-black text-white shadow-xs">
              <Lock className="w-2 h-2" />
            </span>
          ) : (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white" />
            </>
          )}
        </span>

        {isOpen ? (
          <X className="w-5 h-5 text-white" />
        ) : isLocked ? (
          <Lock className="w-5 h-5 text-amber-300" />
        ) : (
          <Sparkles className="w-5 h-5 text-white animate-pulse" />
        )}

        <div className="hidden sm:flex flex-col text-left pr-1">
          <span className="text-xs font-black tracking-tight leading-none text-white">
            Tanya BoonPilot
          </span>
          <span className="text-[10px] text-blue-100 font-semibold leading-none mt-0.5">
            {isLocked ? '🔒 Upgrade' : 'Asisten Toko'}
          </span>
        </div>
      </button>

    </div>
  );
}