'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Lock,
  Users,
  CheckCheck,
  Send,
  Plus,
  Search,
  Bot,
  User,
  Phone,
  ExternalLink,
  QrCode,
  ArrowRightLeft,
  Tag,
  ShoppingBag,
  ShieldCheck,
  CheckCircle2,
  Pause,
  Play,
  AlertCircle,
  Clock,
  Sparkles,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export interface ConversationMessage {
  id: number | string;
  sender: 'customer' | 'agent' | 'bot' | 'system';
  senderName?: string;
  text: string;
  time: string;
  isQris?: boolean;
  qrisData?: {
    orderId: string;
    amount: number;
    description: string;
    qrValue: string;
    status: 'WAITING_PAYMENT' | 'PAID';
  };
}

export interface ChatConversation {
  id: string;
  customerPhone: string;
  customerName?: string;
  avatarInitials?: string;
  lastMessage: string;
  time: string;
  status: 'online' | 'offline';
  assignedTo?: 'my_chat' | 'unassigned' | string; // 'my_chat', 'unassigned', or other agent name
  assignedAgentName?: string;
  isBotActive?: boolean;
  tag?: 'Hot Lead' | 'Repeat Buyer' | 'Konfirmasi Bayar' | 'Tanya Produk' | 'Keluhan' | string;
  unreadCount?: number;
  crm?: {
    totalOrders: number;
    lifetimeValue: number;
    city: string;
    notes?: string;
  };
  messages: ConversationMessage[];
}

export interface TeamChatTabProps {
  tenantSlug?: string;
  conversations: any[];
  activeConversation: any | null;
  activeConversationId: string | null;
  setActiveConversationId: (id: string) => void;
  replyText: string;
  setReplyText: (val: string) => void;
  handleSendMessage: (e: React.FormEvent) => void;
  isProScale: boolean;
  isGrowthPlus: boolean;
  isGrowth: boolean;
  isTeamScale: boolean;
  isAdsPerformance: boolean;
  handleUpgradeTier: (tier: any) => void;
}

// ── DEFAULT MOCK DATA UNTUK PURE PRESENTATION LAYER ──────────────────────────
const INITIAL_MOCK_CONVERSATIONS: ChatConversation[] = [
  {
    id: 'conv-101',
    customerPhone: '081298765432',
    customerName: 'Budi Pratama',
    avatarInitials: 'BP',
    lastMessage: 'Bisa minta tolong buatkan tagihan QRIS untuk paketnya?',
    time: '10:45 WIB',
    status: 'online',
    assignedTo: 'my_chat',
    assignedAgentName: 'Anda (CS Aktif)',
    isBotActive: false,
    tag: 'Hot Lead',
    unreadCount: 1,
    crm: {
      totalOrders: 3,
      lifetimeValue: 450000,
      city: 'Bandung, Jawa Barat',
      notes: 'Customer langganan, biasanya transfer cepat via QRIS.',
    },
    messages: [
      {
        id: 'msg-1',
        sender: 'customer',
        text: 'Halo admin, selamat pagi! Mau tanya paket bundling promo apakah masih ready stok?',
        time: '10:38',
      },
      {
        id: 'msg-2',
        sender: 'bot',
        senderName: 'BoonPilot AI',
        text: 'Halo Kak Budi Pratama! Selamat pagi. Ya, paket bundling promo masih tersedia dengan kuota terbatas. Ada diskon 15% jika order hari ini kak!',
        time: '10:39',
      },
      {
        id: 'msg-3',
        sender: 'customer',
        text: 'Oke mantap, saya mau ambil 1 paket. Bisa minta tolong buatkan tagihan QRIS untuk paketnya?',
        time: '10:44',
      },
      {
        id: 'msg-4',
        sender: 'system',
        text: 'Sesi percakapan diambil alih oleh Anda. Bot AI otomatis dijeda.',
        time: '10:45',
      },
      {
        id: 'msg-5',
        sender: 'agent',
        senderName: 'Anda (CS)',
        text: 'Halo Kak Budi, ini saya ambil alih langsung ya. Siap, segera saya kirimkan tagihan QRIS kilatnya.',
        time: '10:45',
      },
    ],
  },
  {
    id: 'conv-102',
    customerPhone: '085711223344',
    customerName: 'Siti Rahmawati',
    avatarInitials: 'SR',
    lastMessage: 'Apakah pengiriman bisa instant hari ini sampai?',
    time: '10:30 WIB',
    status: 'online',
    assignedTo: 'unassigned',
    assignedAgentName: 'Unassigned / AI Bot',
    isBotActive: true,
    tag: 'Tanya Produk',
    unreadCount: 2,
    crm: {
      totalOrders: 0,
      lifetimeValue: 0,
      city: 'Jakarta Selatan',
      notes: 'Prospek baru dari iklan Meta Ads.',
    },
    messages: [
      {
        id: 'msg-201',
        sender: 'customer',
        text: 'Halo kak, apakah produk ini bisa dikirim ke Jakarta Selatan hari ini juga?',
        time: '10:28',
      },
      {
        id: 'msg-202',
        sender: 'bot',
        senderName: 'BoonPilot AI',
        text: 'Halo Kak Siti! Pengiriman ke area Jakarta Selatan bisa menggunakan kurir Same-Day / Instant (GrabExpress & GoSend) jika konfirmasi sebelum pukul 14:00 WIB.',
        time: '10:29',
      },
      {
        id: 'msg-203',
        sender: 'customer',
        text: 'Apakah pengiriman bisa instant hari ini sampai?',
        time: '10:30',
      },
    ],
  },
  {
    id: 'conv-103',
    customerPhone: '081377889900',
    customerName: 'Hendro Wijaya',
    avatarInitials: 'HW',
    lastMessage: 'Sudah saya bayar ya mbak, tolong diproses.',
    time: '09:15 WIB',
    status: 'offline',
    assignedTo: 'Rina Pratiwi (CS 1)',
    assignedAgentName: 'Rina Pratiwi (CS 1)',
    isBotActive: false,
    tag: 'Konfirmasi Bayar',
    unreadCount: 0,
    crm: {
      totalOrders: 6,
      lifetimeValue: 1850000,
      city: 'Surabaya, Jawa Timur',
      notes: 'VIP Customer. Suka packing bubble wrap tebal.',
    },
    messages: [
      {
        id: 'msg-301',
        sender: 'customer',
        text: 'Mbak Rina, sudah saya bayar ya tagihan order yang tadi.',
        time: '09:12',
      },
      {
        id: 'msg-302',
        sender: 'agent',
        senderName: 'Rina Pratiwi',
        text: 'Baik Pak Hendro, pembayarannya sudah kami cek dan terverifikasi otomatis. Paket segera diserahkan ke kurir siang ini ya Pak!',
        time: '09:14',
      },
      {
        id: 'msg-303',
        sender: 'customer',
        text: 'Sudah saya bayar ya mbak, tolong diproses.',
        time: '09:15',
      },
    ],
  },
];

export default function TeamChatTab({
  tenantSlug,
  conversations: externalConversations,
  activeConversation: externalActiveConversation,
  activeConversationId: externalActiveConversationId,
  setActiveConversationId: externalSetActiveConversationId,
  replyText: externalReplyText,
  setReplyText: externalSetReplyText,
  handleSendMessage: externalHandleSendMessage,
  isProScale,
  isGrowthPlus,
  isGrowth,
  isTeamScale,
  isAdsPerformance,
  handleUpgradeTier,
}: TeamChatTabProps) {
  // Local state for presentation layer
  const [conversationsList, setConversationsList] = useState<ChatConversation[]>(() => {
    if (externalConversations && externalConversations.length > 0) {
      return externalConversations;
    }
    return INITIAL_MOCK_CONVERSATIONS;
  });

  const [selectedConvId, setSelectedConvId] = useState<string>(
    externalActiveConversationId || externalConversations?.[0]?.id || INITIAL_MOCK_CONVERSATIONS[0].id
  );

  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [localReplyText, setLocalReplyText] = useState('');

  // Quick POS QRIS Modal / Form state
  const [qrisItemName, setQrisItemName] = useState('Paket Bundle Hemat');
  const [qrisAmount, setQrisAmount] = useState('150000');
  const [isGeneratingQris, setIsGeneratingQris] = useState(false);
  const [markingPaidOrderId, setMarkingPaidOrderId] = useState<string | null>(null);
  const resolvedTenant = tenantSlug || (typeof window !== 'undefined' ? window.location.pathname.split('/')[1] : 'onlineboost');
  const [qrisFeedback, setQrisFeedback] = useState<string | null>(null);

  // Transfer CS state
  const [targetAgent, setTargetAgent] = useState('Rina Pratiwi (CS 1)');
  const [transferFeedback, setTransferFeedback] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Active conversation resolved
  const currentConversation = useMemo(() => {
    return (
      conversationsList.find((c) => c.id === selectedConvId) ||
      conversationsList[0] ||
      null
    );
  }, [conversationsList, selectedConvId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentConversation?.messages]);

  // Filtered conversation list
  const filteredConversations = useMemo(() => {
    return conversationsList.filter((c) => {
      // Filter by tab
      if (filterTab === 'mine') {
        if (c.assignedTo !== 'my_chat') return false;
      } else if (filterTab === 'unassigned') {
        if (c.assignedTo !== 'unassigned') return false;
      }

      // Filter by search keyword
      if (searchKeyword.trim()) {
        const query = searchKeyword.toLowerCase();
        const matchName = (c.customerName || '').toLowerCase().includes(query);
        const matchPhone = c.customerPhone.includes(query);
        const matchMsg = c.lastMessage.toLowerCase().includes(query);
        return matchName || matchPhone || matchMsg;
      }

      return true;
    });
  }, [conversationsList, filterTab, searchKeyword]);

  // Counts for filter pills
  const counts = useMemo(() => {
    const all = conversationsList.length;
    const mine = conversationsList.filter((c) => c.assignedTo === 'my_chat').length;
    const unassigned = conversationsList.filter((c) => c.assignedTo === 'unassigned').length;
    return { all, mine, unassigned };
  }, [conversationsList]);

  // Select conversation handler
  const handleSelectConversation = (id: string) => {
    setSelectedConvId(id);
    externalSetActiveConversationId(id);
    // Mark as read
    setConversationsList((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
    );
  };

  // Toggle Bot Pause / CS Takeover
  const handleToggleBot = () => {
    if (!currentConversation) return;
    const newBotState = !currentConversation.isBotActive;

    setConversationsList((prev) =>
      prev.map((c) => {
        if (c.id === currentConversation.id) {
          const sysMsg: ConversationMessage = {
            id: `sys-${Date.now()}`,
            sender: 'system',
            text: newBotState
              ? 'Bot AI diaktifkan kembali. Asisten otomatis siap merespons.'
              : 'Bot AI dijeda. Sesi diambil alih sepenuhnya oleh agen CS.',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          return {
            ...c,
            isBotActive: newBotState,
            assignedTo: newBotState ? 'unassigned' : 'my_chat',
            assignedAgentName: newBotState ? 'Unassigned / AI Bot' : 'Anda (CS Aktif)',
            messages: [...c.messages, sysMsg],
          };
        }
        return c;
      })
    );
  };

  // Send Manual Reply
  const handleSendLocalMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const textToSend = localReplyText.trim() || externalReplyText.trim();
    if (!textToSend || !currentConversation) return;

    const newMsg: ConversationMessage = {
      id: `msg-${Date.now()}`,
      sender: 'agent',
      senderName: 'Anda (CS)',
      text: textToSend,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setConversationsList((prev) =>
      prev.map((c) => {
        if (c.id === currentConversation.id) {
          return {
            ...c,
            lastMessage: textToSend,
            time: 'Baru saja',
            assignedTo: 'my_chat',
            assignedAgentName: 'Anda (CS Aktif)',
            isBotActive: false, // automatic takeover when human CS sends a reply
            messages: [...c.messages, newMsg],
          };
        }
        return c;
      })
    );

    setLocalReplyText('');
    externalSetReplyText('');
  };

  // Quick POS: Generate QRIS Tagihan & Record Order in Core Backend
  const handleGenerateQris = async () => {
    if (!currentConversation) return;
    const num = parseInt(qrisAmount.replace(/[^0-9]/g, ''), 10) || 100000;
    setIsGeneratingQris(true);
    setQrisFeedback(null);

    try {
      const coreApiBase = (
        process.env.NEXT_PUBLIC_CORE_API_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        'https://api.boontrack.com'
      ).replace(/\/+$/, '');

      let realOrderId = `ORD-POS-${Math.floor(100000 + Math.random() * 900000)}`;
      let dynamicQrString = "00020101021126570011ID.DANA.WWW011893600915303379682702090337968270303UMI51440014ID.CO.QRIS.WWW0215ID10265640751030303UMI5204737253033605802ID5909BoonTrack6012Kab. Bandung61054028663048DC1";

      try {
        const checkoutRes = await fetch(`${coreApiBase}/api/v1/orders/qris-checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchant_slug: resolvedTenant,
            merchant_name: resolvedTenant,
            product_name: qrisItemName || 'Tagihan Manual CS',
            customer_phone: currentConversation.customerPhone,
            total_amount: num,
          }),
        });

        if (checkoutRes.ok) {
          const checkData = await checkoutRes.json();
          if (checkData?.order_id) {
            realOrderId = checkData.order_id;
          }
          if (checkData?.qr_string) {
            dynamicQrString = checkData.qr_string;
          }
        }
      } catch (apiErr) {
        console.warn('[Quick POS] Core API checkout note:', apiErr);
      }

      const qrisPayload: ConversationMessage = {
        id: `qris-${Date.now()}`,
        sender: 'agent',
        senderName: 'Anda (Quick POS)',
        text: `Tagihan pembayaran QRIS kilat senilai Rp ${num.toLocaleString('id-ID')} untuk "${qrisItemName}".`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isQris: true,
        qrisData: {
          orderId: realOrderId,
          amount: num,
          description: qrisItemName,
          qrValue: dynamicQrString,
          status: 'WAITING_PAYMENT',
        },
      };

      setConversationsList((prev) =>
        prev.map((c) => {
          if (c.id === currentConversation.id) {
            return {
              ...c,
              lastMessage: `Tagihan QRIS Rp ${num.toLocaleString('id-ID')} (${realOrderId})`,
              time: 'Baru saja',
              tag: 'Konfirmasi Bayar',
              messages: [...c.messages, qrisPayload],
            };
          }
          return c;
        })
      );

      setQrisFeedback(`✅ Tagihan QRIS (${realOrderId}) terkirim ke chat!`);
      setTimeout(() => setQrisFeedback(null), 4000);
    } catch (err: any) {
      setQrisFeedback(`❌ Gagal: ${err.message || 'Error membuat tagihan'}`);
    } finally {
      setIsGeneratingQris(false);
    }
  };

  // Manual Transaction: Tandai Lunas & Dispatch Meta CAPI Event
  const handleMarkPaid = async (orderId: string) => {
    if (!orderId) return;
    setMarkingPaidOrderId(orderId);
    try {
      const coreApiBase = (
        process.env.NEXT_PUBLIC_CORE_API_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        'https://api.boontrack.com'
      ).replace(/\/+$/, '');

      const res = await fetch(`${coreApiBase}/api/v1/orders/${orderId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: resolvedTenant,
          agent_id: currentConversation?.assignedTo || 'agent_cs',
          notes: 'Manual CS Mark Paid via BoonTrack Inbox',
        }),
      });

      const data = await res.json();
      if (!res.ok && res.status !== 200) {
        throw new Error(data?.detail || 'Gagal menandai lunas pesanan.');
      }

      setConversationsList((prev) =>
        prev.map((c) => {
          if (c.id === currentConversation?.id) {
            const updatedMessages = c.messages.map((m) => {
              if (m.isQris && m.qrisData && m.qrisData.orderId === orderId) {
                return {
                  ...m,
                  qrisData: {
                    ...m.qrisData,
                    status: 'PAID' as const,
                  },
                };
              }
              return m;
            });

            const confirmationMsg: ConversationMessage = {
              id: `paid-conf-${Date.now()}`,
              sender: 'system',
              senderName: 'Sistem BoonTrack',
              text: `✅ Pembayaran untuk tagihan ${orderId} senilai Rp ${data?.gross_amount ? data.gross_amount.toLocaleString('id-ID') : ''} telah DIVERIFIKASI LUNAS oleh CS. Event konversi Purchase Meta CAPI telah terkirim.`,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };

            return {
              ...c,
              lastMessage: `LUNAS: Tagihan ${orderId}`,
              tag: 'Repeat Buyer',
              messages: [...updatedMessages, confirmationMsg],
            };
          }
          return c;
        })
      );

      setQrisFeedback(`✅ Tagihan ${orderId} LUNAS & Event Meta CAPI tersinkron!`);
      setTimeout(() => setQrisFeedback(null), 4000);
    } catch (err: any) {
      alert(`Gagal menandai lunas: ${err.message || 'Terjadi kesalahan sistem'}`);
    } finally {
      setMarkingPaidOrderId(null);
    }
  };

  // Transfer Chat to Colleague
  const handleTransferChat = () => {
    if (!currentConversation) return;
    setConversationsList((prev) =>
      prev.map((c) => {
        if (c.id === currentConversation.id) {
          const sysMsg: ConversationMessage = {
            id: `sys-${Date.now()}`,
            sender: 'system',
            text: `Percakapan berhasil dialihkan ke ${targetAgent}.`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          return {
            ...c,
            assignedTo: targetAgent,
            assignedAgentName: targetAgent,
            messages: [...c.messages, sysMsg],
          };
        }
        return c;
      })
    );

    setTransferFeedback(`✅ Chat dialihkan ke ${targetAgent}`);
    setTimeout(() => setTransferFeedback(null), 3000);
  };

  return (
    <div className="w-full flex-1 flex flex-col p-4 sm:p-6 min-w-0 space-y-4">
      {/* ── TOP HEADER CONSOLE ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <MessageSquare className="w-4 h-4" />
            </div>
            <h1 className="text-base sm:text-lg font-black text-slate-900">
              BoonTrack Inbox Console (3-Panel Live CS Workspace)
            </h1>
            {isTeamScale ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                TEAM SCALE • MULTI-AGENT
              </span>
            ) : isAdsPerformance ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                ADS PERFORMANCE • 2 CS SEATS
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5 text-amber-500" /> TIER SOLO • 1 SEAT
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Omnichannel WhatsApp CS: antrean chat, thread riwayat, toggle jeda bot, quick POS invoice QRIS, dan transfer agen.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Gateway Online</span>
          </span>
          {!isTeamScale && (
            <button
              type="button"
              onClick={() => handleUpgradeTier('ads_performance')}
              className="px-3 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs transition cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah CS Seat</span>
            </button>
          )}
        </div>
      </div>

      {/* ── 3-PANEL WORKSPACE CONTAINER (100% W-FULL CANVAS) ───────────────── */}
      <div className="w-full bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[680px] lg:h-[calc(100vh-210px)]">
        {/* =================================================================== */}
        {/* PANEL KIRI (3 COLS): DAFTAR ANTREAN PERCAKAPAN & FILTER              */}
        {/* =================================================================== */}
        <div className="lg:col-span-3 border-r border-slate-200 flex flex-col bg-slate-50/50 h-full overflow-hidden">
          {/* Header Panel Kiri & Search */}
          <div className="p-3.5 border-b border-slate-200 bg-white space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                <span>Antrean Percakapan</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {counts.all} Total
              </span>
            </div>

            {/* Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Cari nama atau nomor WhatsApp..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            {/* Filter Tabs Pills (Semua, Chat Saya, Belum Ditugaskan) */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`flex-1 py-1 px-1.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                  filterTab === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Semua</span>
                <span className="text-[9px] px-1 rounded-full bg-slate-200/70 text-slate-600">
                  {counts.all}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilterTab('mine')}
                className={`flex-1 py-1 px-1.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                  filterTab === 'mine'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Chat Saya</span>
                <span className="text-[9px] px-1 rounded-full bg-emerald-100 text-emerald-700">
                  {counts.mine}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilterTab('unassigned')}
                className={`flex-1 py-1 px-1.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                  filterTab === 'unassigned'
                    ? 'bg-white text-amber-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Unassigned</span>
                <span className="text-[9px] px-1 rounded-full bg-amber-100 text-amber-700">
                  {counts.unassigned}
                </span>
              </button>
            </div>
          </div>

          {/* Conversation List Scrollable */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y-0">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <MessageSquare className="w-6 h-6 text-slate-300" />
                <p className="font-semibold">Tidak ada chat ditemukan</p>
                <p className="text-[11px] text-slate-400">Ubah filter atau kata kunci pencarian.</p>
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isSelected = currentConversation?.id === c.id;
                const isMine = c.assignedTo === 'my_chat';
                const isUnassigned = c.assignedTo === 'unassigned';

                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectConversation(c.id)}
                    className={`p-3 rounded-2xl border transition cursor-pointer relative ${
                      isSelected
                        ? 'bg-white border-blue-500 shadow-sm ring-1 ring-blue-500/20'
                        : 'bg-white/80 hover:bg-white border-slate-200/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white font-black text-xs flex items-center justify-center shadow-xs uppercase">
                          {c.avatarInitials || c.customerName?.slice(0, 2) || 'WA'}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                            c.status === 'online' ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        />
                      </div>

                      {/* Detail Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {c.customerName || c.customerPhone}
                          </span>
                          <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                            {c.time.split(' ')[0]}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-500 truncate mt-0.5 leading-snug">
                          {c.lastMessage}
                        </p>

                        {/* Status Badges Row */}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {/* Agen Assignment Badge */}
                          {isMine ? (
                            <span className="px-1.5 py-0.2 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold flex items-center gap-1">
                              <UserCheck className="w-2.5 h-2.5" />
                              <span>CS Anda</span>
                            </span>
                          ) : isUnassigned ? (
                            <span className="px-1.5 py-0.2 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold flex items-center gap-1">
                              <Bot className="w-2.5 h-2.5" />
                              <span>Bot AI</span>
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-bold truncate max-w-[90px]">
                              {c.assignedAgentName || c.assignedTo}
                            </span>
                          )}

                          {/* Tag CRM */}
                          {c.tag && (
                            <span className="px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-600 text-[9px] font-semibold">
                              {c.tag}
                            </span>
                          )}

                          {/* Unread Pill */}
                          {(c.unreadCount || 0) > 0 && (
                            <span className="ml-auto w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-black flex items-center justify-center shrink-0">
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* =================================================================== */}
        {/* PANEL TENGAH (6 COLS): THREAD RIWAYAT OBROLAN & INPUT BALASAN       */}
        {/* =================================================================== */}
        <div className="lg:col-span-6 flex flex-col bg-white h-full border-b lg:border-b-0 lg:border-r border-slate-200 overflow-hidden">
          {!currentConversation ? (
            <div className="flex-1 p-8 flex flex-col items-center justify-center text-center text-slate-400">
              <MessageSquare className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-700">Pilih Percakapan</p>
              <p className="text-xs text-slate-400">Pilih salah satu chat dari antrean sebelah kiri untuk mulai merespons.</p>
            </div>
          ) : (
            <>
              {/* Header Thread */}
              <div className="p-3.5 border-b border-slate-200 flex items-center justify-between gap-3 bg-white">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs uppercase">
                    {currentConversation.avatarInitials || currentConversation.customerName?.slice(0, 2) || 'WA'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xs sm:text-sm font-black text-slate-900 truncate">
                        {currentConversation.customerName || `Customer (${currentConversation.customerPhone})`}
                      </h2>
                      <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                        • {currentConversation.customerPhone}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>Sesi Aktif</span>
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-[10px] text-slate-500 font-semibold">
                        {currentConversation.assignedAgentName || currentConversation.assignedTo}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tombol Toggle Jeda Bot / Ambil Alih CS */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleToggleBot}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 ${
                      currentConversation.isBotActive
                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                    }`}
                    title={currentConversation.isBotActive ? 'Klik untuk menjeda bot dan ambil alih live CS' : 'Klik untuk mengaktifkan kembali bot AI'}
                  >
                    {currentConversation.isBotActive ? (
                      <>
                        <Bot className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="hidden sm:inline">Bot AI Aktif</span>
                        <span className="sm:hidden">Bot On</span>
                        <Pause className="w-3 h-3 text-emerald-700 ml-1" />
                      </>
                    ) : (
                      <>
                        <User className="w-3.5 h-3.5 text-amber-600" />
                        <span className="hidden sm:inline">CS Ambil Alih (Bot Jeda)</span>
                        <span className="sm:hidden">CS Live</span>
                        <Play className="w-3 h-3 text-amber-700 ml-1" />
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Area Pesan Chat (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/40">
                {currentConversation.messages.map((msg) => {
                  if (msg.sender === 'system') {
                    return (
                      <div key={msg.id} className="flex justify-center my-2">
                        <span className="px-3 py-1 rounded-full bg-slate-200/80 text-slate-600 text-[10px] font-semibold flex items-center gap-1.5 shadow-2xs">
                          <AlertCircle className="w-3 h-3 text-slate-500" />
                          <span>{msg.text}</span>
                          <span className="text-[9px] text-slate-400">• {msg.time}</span>
                        </span>
                      </div>
                    );
                  }

                  const isCustomer = msg.sender === 'customer';
                  const isBot = msg.sender === 'bot';
                  const isAgent = msg.sender === 'agent';

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}
                    >
                      {/* Sender label badge */}
                      <span className="text-[9px] font-bold text-slate-400 mb-1 px-1 flex items-center gap-1">
                        {isBot ? (
                          <>
                            <Sparkles className="w-2.5 h-2.5 text-violet-500" />
                            <span className="text-violet-600">BoonPilot AI Bot</span>
                          </>
                        ) : isAgent ? (
                          <>
                            <User className="w-2.5 h-2.5 text-blue-500" />
                            <span className="text-blue-600">{msg.senderName || 'Live CS Agent'}</span>
                          </>
                        ) : (
                          <span>{currentConversation.customerName || 'Customer'}</span>
                        )}
                      </span>

                      {/* Bubble Text */}
                      <div
                        className={`p-3.5 rounded-2xl max-w-[85%] sm:max-w-md shadow-2xs ${
                          isCustomer
                            ? 'bg-white border border-slate-200 text-slate-900 rounded-tl-xs'
                            : isBot
                            ? 'bg-violet-50/90 border border-violet-200 text-slate-900 rounded-tr-xs'
                            : 'bg-indigo-600 text-white rounded-tr-xs'
                        }`}
                      >
                        <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                        {/* Interactive QRIS Card Preview inside Chat */}
                        {msg.isQris && msg.qrisData && (
                          <div className="mt-3 p-3 bg-white rounded-xl border border-slate-200 text-slate-900 space-y-2.5 shadow-xs">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                              <span className="text-[10px] font-black text-slate-800 flex items-center gap-1">
                                <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                                <span>TAGIHAN QRIS DINAMIS</span>
                              </span>
                              <span
                                className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                                  msg.qrisData.status === 'PAID'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}
                              >
                                {msg.qrisData.status === 'PAID' ? 'LUNAS (PAID)' : 'MENUNGGU BAYAR'}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 pt-1">
                              <div className="p-1 bg-slate-50 border border-slate-200 rounded-lg shrink-0">
                                <QRCodeSVG value={msg.qrisData.qrValue} size={64} level="M" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-bold text-slate-800 truncate">
                                  {msg.qrisData.description}
                                </p>
                                <p className="text-xs font-black text-indigo-700 mt-0.5">
                                  Rp {msg.qrisData.amount.toLocaleString('id-ID')}
                                </p>
                                <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                                  Ref: {msg.qrisData.orderId}
                                </p>
                              </div>
                            </div>

                            {/* Tombol Aksi Tandai Lunas jika belum dibayar */}
                            {msg.qrisData.status === 'WAITING_PAYMENT' ? (
                              <button
                                type="button"
                                onClick={() => handleMarkPaid(msg.qrisData!.orderId)}
                                disabled={markingPaidOrderId === msg.qrisData.orderId}
                                className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95 disabled:opacity-60"
                              >
                                {markingPaidOrderId === msg.qrisData.orderId ? (
                                  <>
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    <span>Memverifikasi & Kirim CAPI...</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Tandai Lunas & Sinkron CAPI</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <div className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center gap-1 text-[10px] font-black text-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Terverifikasi Lunas (Synced to Meta CAPI)</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Timestamp & checkmarks */}
                        <div
                          className={`text-[9px] mt-1.5 flex items-center gap-1 ${
                            isCustomer
                              ? 'text-slate-400'
                              : isBot
                              ? 'text-violet-500 justify-end'
                              : 'text-indigo-200 justify-end'
                          }`}
                        >
                          <span>{msg.time}</span>
                          {!isCustomer && <CheckCheck className="w-3 h-3" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Canned Responses Bar */}
              <div className="px-3.5 py-2 border-t border-slate-100 bg-slate-50/70 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <span className="text-[10px] font-bold text-slate-400 shrink-0">Template:</span>
                {[
                  'Halo kak, pesanan sedang kami siapkan ya!',
                  'Silakan scan QRIS di atas untuk proses kilat kak.',
                  'Ada yang bisa kami bantu lagi kak?',
                ].map((tpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setLocalReplyText(tpl)}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-[10px] font-medium text-slate-600 hover:text-indigo-600 truncate shrink-0 transition cursor-pointer"
                  >
                    {tpl}
                  </button>
                ))}
              </div>

              {/* Form Input Balasan Manual */}
              <form
                onSubmit={handleSendLocalMessage}
                className="p-3 border-t border-slate-200 bg-white flex items-center gap-2"
              >
                <input
                  type="text"
                  value={localReplyText}
                  onChange={(e) => setLocalReplyText(e.target.value)}
                  placeholder="Ketik balasan CS langsung ke pembeli (otomatis menjeda bot)..."
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-indigo-600 transition"
                />
                <button
                  type="submit"
                  disabled={!localReplyText.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Kirim</span>
                </button>
              </form>
            </>
          )}
        </div>

        {/* =================================================================== */}
        {/* PANEL KANAN (3 COLS): QUICK POS & CRM RINGKASAN KONTAK             */}
        {/* =================================================================== */}
        <div className="lg:col-span-3 flex flex-col bg-slate-50/60 h-full overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <span className="text-xs font-black text-slate-900 tracking-tight flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5 text-indigo-600" />
              <span>Quick POS &amp; Mini CRM</span>
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
              Live Console
            </span>
          </div>

          {!currentConversation ? (
            <div className="p-6 text-center text-slate-400 text-xs">
              Pilih kontak pelanggan untuk melihat data profil CRM dan membuat tagihan QRIS.
            </div>
          ) : (
            <>
              {/* 1. KARTU PROFIL CRM PELANGGAN */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white font-black text-sm flex items-center justify-center shrink-0 uppercase shadow-xs">
                    {currentConversation.avatarInitials || currentConversation.customerName?.slice(0, 2) || 'WA'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-slate-900 truncate">
                      {currentConversation.customerName || 'Pelanggan'}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {currentConversation.customerPhone}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className="px-1.5 py-0.2 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold flex items-center gap-1">
                        <Tag className="w-2.5 h-2.5" />
                        <span>{currentConversation.tag || 'Prospek'}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* WhatsApp Action Link */}
                <a
                  href={`https://wa.me/${currentConversation.customerPhone.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <Phone className="w-3 h-3 text-emerald-600" />
                  <span>Buka di WhatsApp Web</span>
                  <ExternalLink className="w-2.5 h-2.5 ml-auto text-emerald-600" />
                </a>

                {/* Metrik CRM Ringkas */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                  <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 block uppercase">Total Order</span>
                    <span className="text-xs font-black text-slate-800">
                      {currentConversation.crm?.totalOrders ?? 1} Pesanan
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 block uppercase">Nilai Belanja</span>
                    <span className="text-xs font-black text-indigo-700">
                      Rp {(currentConversation.crm?.lifetimeValue ?? 150000).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                {currentConversation.crm?.city && (
                  <p className="text-[10px] text-slate-500 font-medium">
                    📍 Area: <span className="text-slate-700 font-semibold">{currentConversation.crm.city}</span>
                  </p>
                )}

                {currentConversation.crm?.notes && (
                  <div className="p-2 bg-slate-50 rounded-xl text-[10px] text-slate-600 border border-slate-100">
                    <span className="font-bold text-slate-700 block mb-0.5">Catatan CS:</span>
                    {currentConversation.crm.notes}
                  </div>
                )}
              </div>

              {/* 2. QUICK POS: BUAT TAGIHAN QRIS KILAT */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Tagihan QRIS Kilat</span>
                  </span>
                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                    Dinamis
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Kirim invoice QRIS langsung ke ruang chat pelanggan agar bisa langsung di-scan.
                </p>

                <div className="space-y-2 pt-1">
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 block mb-1">
                      Deskripsi Produk / Paket
                    </label>
                    <input
                      type="text"
                      value={qrisItemName}
                      onChange={(e) => setQrisItemName(e.target.value)}
                      placeholder="Contoh: Paket 2 Pcs Kemeja + Ongkir"
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-700 block mb-1">
                      Nominal Total (Rp)
                    </label>
                    <input
                      type="text"
                      value={qrisAmount}
                      onChange={(e) => setQrisAmount(e.target.value)}
                      placeholder="150000"
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-indigo-600"
                    />
                  </div>

                  {qrisFeedback && (
                    <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold animate-fadeIn">
                      {qrisFeedback}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleGenerateQris}
                    disabled={isGeneratingQris || !qrisAmount}
                    className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                  >
                    {isGeneratingQris ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Membuat QRIS...</span>
                      </>
                    ) : (
                      <>
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Kirim Tagihan QRIS ke Chat</span>
                      </>
                    )}
                  </button>

                  {/* Ringkasan & Aksi Cepat Tandai Lunas Tagihan Terakhir */}
                  {(() => {
                    const latestQris = currentConversation?.messages.slice().reverse().find((m) => m.isQris && m.qrisData);
                    if (!latestQris || !latestQris.qrisData) return null;
                    const isPaid = latestQris.qrisData.status === 'PAID';
                    return (
                      <div className="mt-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5 text-left">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-bold text-slate-600">Tagihan Aktif:</span>
                          <span className={`font-black px-1.5 py-0.2 rounded border text-[9px] ${
                            isPaid
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {isPaid ? 'LUNAS (PAID)' : 'MENUNGGU BAYAR'}
                          </span>
                        </div>
                        <div className="text-[11px] font-bold text-slate-800 flex justify-between gap-1">
                          <span className="truncate">{latestQris.qrisData.description}</span>
                          <span className="text-indigo-700 font-black shrink-0">
                            Rp {latestQris.qrisData.amount.toLocaleString('id-ID')}
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-400 font-mono">Ref: {latestQris.qrisData.orderId}</p>
                        {!isPaid ? (
                          <button
                            type="button"
                            onClick={() => handleMarkPaid(latestQris.qrisData!.orderId)}
                            disabled={markingPaidOrderId === latestQris.qrisData.orderId}
                            className="w-full mt-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95 disabled:opacity-60"
                          >
                            {markingPaidOrderId === latestQris.qrisData.orderId ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>Sinkron CAPI...</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Tandai Lunas (Kirim CAPI)</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <div className="mt-1 p-1 rounded-lg bg-emerald-100/60 border border-emerald-300 flex items-center justify-center gap-1 text-[10px] font-black text-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Telah Lunas & Sinkron CAPI</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* 3. DROPDOWN TRANSFER CHAT KE REKAN CS */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <ArrowRightLeft className="w-3.5 h-3.5 text-blue-600" />
                    <span>Transfer Chat ke Rekan CS</span>
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Alihkan antrean chat ini ke rekan agen CS lain yang sedang bertugas.
                </p>

                <div className="space-y-2 pt-1">
                  <select
                    value={targetAgent}
                    onChange={(e) => setTargetAgent(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-blue-600 cursor-pointer"
                  >
                    <option value="Rina Pratiwi (CS 1)">Rina Pratiwi (CS 1 - Support Online)</option>
                    <option value="Dimas Arya (CS 2)">Dimas Arya (CS 2 - Closing Online)</option>
                    <option value="Sarah Amelia (CS 3)">Sarah Amelia (CS 3 - Escalation)</option>
                  </select>

                  {transferFeedback && (
                    <div className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold animate-fadeIn">
                      {transferFeedback}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleTransferChat}
                    className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Transfer Percakapan Sekarang</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
