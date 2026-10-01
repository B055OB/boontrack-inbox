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
  Building2,
  CreditCard,
  MapPin,
  Navigation,
  Copy,
  FileText,
  Headphones,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { getSupabase } from '@/lib/supabaseClient';
import { useTenantInbox } from '../../hooks/useTenantInbox';
import { extractTenantBankAccounts, TenantBankAccount } from '@/lib/bank-accounts';
import { getStorefrontInvoiceUrl } from '@/lib/storefront-urls';
import { generateDynamicQRIS } from '@/lib/qris-dynamic';
import DirectCsLoginModal from '../DirectCsLoginModal';

export interface ConversationMessage {
  id: number | string;
  external_id?: string;
  created_at?: string;
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
  isBankTransfer?: boolean;
  bankData?: {
    orderId: string;
    amount: number;
    baseAmount: number;
    uniqueCode: number;
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    description: string;
    status: 'WAITING_PAYMENT' | 'WAITING_CONFIRMATION' | 'PAID';
  };
  isLocation?: boolean;
  locationData?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
    distanceKm?: number;
    rates?: Array<{
      id?: string;
      courier_name: string;
      service: string;
      price: number;
      etd: string;
    }>;
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
  tenantId?: string;
  conversations?: any[];
  activeConversation?: any | null;
  activeConversationId?: string | null;
  setActiveConversationId?: (id: string) => void;
  replyText?: string;
  setReplyText?: (val: string) => void;
  handleSendMessage?: (e?: any) => void;
  isProScale: boolean;
  isGrowthPlus: boolean;
  isGrowth: boolean;
  isTeamScale: boolean;
  isAdsPerformance: boolean;
  handleUpgradeTier: (tier: any) => void;
  isSoloOrTrial?: boolean;
  trialDaysLeft?: number | null;
  trialEndsAt?: string | null;
  isTenantBotPaused?: boolean;
  handleToggleTenantBot?: () => void;
  isCheckoutLite?: boolean;
  tenantTier?: string;
}

export const CS_SEAT_QUOTA_MAP: Record<string, number> = {
  CHECKOUT_LITE: 0,
  SOLO: 1,
  STARTER: 1,
  ADS_PERFORMANCE: 2,
  PRO_SCALE: 2,
  GROWTH_PLUS: 2,
  TRIAL: 2,
  TEAM_SCALE: 5,
  ENTERPRISE: 5,
};

export default function TeamChatTab({
  tenantSlug,
  tenantId,
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
  isSoloOrTrial = false,
  trialDaysLeft = null,
  trialEndsAt = null,
  isTenantBotPaused = false,
  handleToggleTenantBot,
  isCheckoutLite = false,
  tenantTier,
}: TeamChatTabProps) {
  // Kalkulasi dinamis real-time sisa hari dari trialEndsAt
  const effectiveDaysLeft = useMemo(() => {
    if (trialEndsAt) {
      const diffMs = new Date(trialEndsAt).getTime() - Date.now();
      return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }
    return trialDaysLeft !== null ? Math.max(0, trialDaysLeft) : null;
  }, [trialEndsAt, trialDaysLeft]);

  const isTrialExpired = effectiveDaysLeft !== null && effectiveDaysLeft <= 0;

  const resolvedTenant = tenantSlug || (typeof window !== 'undefined' ? window.location.pathname.split('/')[1] : '');

  // 100% Global & Tenant-Agnostic Supabase Realtime Inbox Hook (Single Source of Truth)
  const inbox = useTenantInbox(tenantId, resolvedTenant);

  // Active Conversations List (Single Source of Truth: Supabase via useTenantInbox)
  const conversationsList = useMemo(() => {
    if (inbox.conversations.length > 0) return inbox.conversations;
    if (Array.isArray(externalConversations) && externalConversations.length > 0) return externalConversations;
    return [];
  }, [inbox.conversations, externalConversations]);

  const selectedConvId = inbox.activeConversationId || externalActiveConversationId || conversationsList[0]?.id || '';

  const currentConversation = useMemo(() => {
    return (
      conversationsList.find((c) => c.id === selectedConvId) ||
      inbox.activeConversation ||
      conversationsList[0] ||
      null
    );
  }, [conversationsList, selectedConvId, inbox.activeConversation]);

  const messagesList = useMemo(() => {
    if (inbox.messages.length > 0) return inbox.messages;
    if (currentConversation?.messages && currentConversation.messages.length > 0) return currentConversation.messages;
    return [];
  }, [inbox.messages, currentConversation?.messages]);

  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [localReplyText, setLocalReplyText] = useState('');
  const [displayLimit, setDisplayLimit] = useState(60);

  useEffect(() => {
    setDisplayLimit(60);
  }, [searchKeyword, filterTab]);

  // Dynamic Tier & CS Seat Entitlement Quota
  const effectiveTier = useMemo(() => {
    if (isCheckoutLite) return 'CHECKOUT_LITE';
    if (tenantTier) return tenantTier.toUpperCase();
    if (isTeamScale) return 'TEAM_SCALE';
    if (isAdsPerformance || isProScale || isGrowthPlus) return 'ADS_PERFORMANCE';
    if (isSoloOrTrial) return 'TRIAL';
    return 'SOLO';
  }, [isCheckoutLite, tenantTier, isTeamScale, isAdsPerformance, isProScale, isGrowthPlus, isSoloOrTrial]);

  const maxCsQuota = CS_SEAT_QUOTA_MAP[effectiveTier] ?? 1;

  // Live CS Team Members from Database (Zero Mock)
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);

  // CS Seat Management & Upgrade Paywall Modal States
  const [isInviteCsModalOpen, setIsInviteCsModalOpen] = useState(false);
  const [isPaywallModalOpen, setIsPaywallModalOpen] = useState(false);

  // Invite CS Form States
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteAccessLevel, setInviteAccessLevel] = useState<'LIVE_CHAT_ONLY' | 'FULL_DASHBOARD'>('LIVE_CHAT_ONLY');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Quick POS Dynamic Deal Modal / Form state (Custom Deal Closing)
  const [qrisItemName, setQrisItemName] = useState('Jasa Video Promosi');
  const [qrisAmount, setQrisAmount] = useState('150000');
  const [isGeneratingQris, setIsGeneratingQris] = useState(false);
  const [isSendingBankInfo, setIsSendingBankInfo] = useState(false);
  const [markingPaidOrderId, setMarkingPaidOrderId] = useState<string | null>(null);
  const [qrisFeedback, setQrisFeedback] = useState<string | null>(null);
  const [copiedLocationId, setCopiedLocationId] = useState<string | number | null>(null);

  // Direct CS Access state (Bypass Magic Link)
  const [isDirectCsLoginOpen, setIsDirectCsLoginOpen] = useState(false);
  const [activeCsUser, setActiveCsUser] = useState<{ name: string; phone: string } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedCsName = localStorage.getItem('cs_user_name');
      const savedCsPhone = localStorage.getItem('cs_user_phone');
      if (savedCsName && savedCsPhone) {
        setActiveCsUser({ name: savedCsName, phone: savedCsPhone });
      }
    }
  }, []);

  // Dynamic Tenant Payment Config & Multi-Tenant Bank Accounts (Zero Hardcoding)
  const [tenantPaymentData, setTenantPaymentData] = useState<any>(null);
  const [selectedBillingTab, setSelectedBillingTab] = useState<'qris' | 'bank'>('qris');
  const [selectedBankIdx, setSelectedBankIdx] = useState<number>(0);

  // Load tenant payment configuration dynamically from Supabase
  useEffect(() => {
    let isMounted = true;
    const fetchPaymentConfig = async () => {
      const targetSlug = resolvedTenant || tenantId;
      if (!targetSlug) return;
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data } = await supabase
            .from('tenants')
            .select('id, slug, name, tier, metadata')
            .or(`slug.eq.${targetSlug},id.eq.${targetSlug}`)
            .maybeSingle();
          if (data && isMounted) {
            setTenantPaymentData(data);
          }
        }
      } catch (err) {
        console.warn('[TeamChatTab] Error fetching tenant payment config:', err);
      }
    };
    fetchPaymentConfig();
    return () => {
      isMounted = false;
    };
  }, [resolvedTenant, tenantId]);

  const bankAccounts = useMemo(() => {
    return extractTenantBankAccounts(tenantPaymentData);
  }, [tenantPaymentData]);

  const hasNorek = bankAccounts.length > 0;

  const hasQris = useMemo(() => {
    if (!tenantPaymentData) return false;
    return Boolean(
      (tenantPaymentData as any)?.qris_image_url ||
      (tenantPaymentData as any)?.qris_url ||
      (tenantPaymentData as any)?.qris_image ||
      (tenantPaymentData as any)?.qris_content ||
      tenantPaymentData?.metadata?.qris_image_url ||
      tenantPaymentData?.metadata?.qris_url ||
      tenantPaymentData?.metadata?.qris_image ||
      tenantPaymentData?.metadata?.qris?.static_qr ||
      tenantPaymentData?.metadata?.qris_content ||
      tenantPaymentData?.metadata?.raw_qris_string ||
      tenantPaymentData?.metadata?.payment_config?.raw_qris_string ||
      tenantPaymentData?.metadata?.payment_config?.qris_image_url ||
      tenantPaymentData?.metadata?.payment_settings?.qris ||
      tenantPaymentData?.metadata?.payment_config?.enable_qris === true ||
      (tenantPaymentData?.is_qris_active && ((tenantPaymentData as any)?.qris_image_url || tenantPaymentData?.metadata?.qris_image_url)) ||
      (tenantPaymentData?.metadata?.is_qris_active && ((tenantPaymentData as any)?.qris_image_url || tenantPaymentData?.metadata?.qris_image_url))
    );
  }, [tenantPaymentData]);

  // Otomatis tentukan mode penagihan aktif sesuai konfigurasi toko
  useEffect(() => {
    if (hasNorek && !hasQris) {
      setSelectedBillingTab('bank');
    } else if (hasQris) {
      setSelectedBillingTab('qris');
    }
  }, [hasNorek, hasQris]);

  // Transfer CS state (Zero Mock: populated from live tenant_users)
  const [targetAgent, setTargetAgent] = useState('');
  const [transferFeedback, setTransferFeedback] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesList]);

  // Real CRM aggregation from orders table (Zero Mock)
  const [crmMetrics, setCrmMetrics] = useState<{ totalOrders: number; lifetimeValue: number; isLoading: boolean }>({
    totalOrders: 0,
    lifetimeValue: 0,
    isLoading: false,
  });

  useEffect(() => {
    if (!currentConversation?.customerPhone) {
      setCrmMetrics({ totalOrders: 0, lifetimeValue: 0, isLoading: false });
      return;
    }

    let isMounted = true;
    const fetchCustomerOrders = async () => {
      setCrmMetrics((prev) => ({ ...prev, isLoading: true }));
      try {
        const supabase = getSupabase();
        if (!supabase) return;

        const rawPhone = currentConversation.customerPhone;
        let cleanPhone = rawPhone.replace(/\D/g, '');
        let altPhone = cleanPhone;
        if (cleanPhone.startsWith('62')) {
          altPhone = '0' + cleanPhone.slice(2);
        } else if (cleanPhone.startsWith('0')) {
          altPhone = '62' + cleanPhone.slice(1);
        }

        const cleanSlug = resolvedTenant;

        let query = supabase
          .from('orders')
          .select('total_amount, gross_amount, status')
          .or(`customer_phone.eq.${cleanPhone},customer_phone.eq.${altPhone},customer_phone.eq.${rawPhone}`)
          .in('status', ['PAID', 'SETTLED', 'COMPLETED']);

        if (cleanSlug) {
          query = query.or(`tenant_slug.eq.${cleanSlug},tenant_id.eq.${cleanSlug}`);
        }

        const { data: matchedOrders, error } = await query;
        if (!error && Array.isArray(matchedOrders)) {
          const count = matchedOrders.length;
          const total = matchedOrders.reduce((acc: number, o: any) => {
            const amt = Number(o.total_amount || o.gross_amount || 0);
            return acc + (isNaN(amt) ? 0 : amt);
          }, 0);

          if (isMounted) {
            setCrmMetrics({ totalOrders: count, lifetimeValue: total, isLoading: false });
          }
        } else {
          if (isMounted) {
            setCrmMetrics({ totalOrders: 0, lifetimeValue: 0, isLoading: false });
          }
        }
      } catch {
        if (isMounted) {
          setCrmMetrics({ totalOrders: 0, lifetimeValue: 0, isLoading: false });
        }
      }
    };

    fetchCustomerOrders();
    return () => {
      isMounted = false;
    };
  }, [currentConversation?.customerPhone, resolvedTenant]);

  // Filtered conversation list
  const filteredConversations = useMemo(() => {
    return conversationsList.filter((c) => {
      // Filter by tab
      if (filterTab === 'mine') {
        if (c.assignedTo !== 'my_chat') return false;
      } else if (filterTab === 'unassigned') {
        if (c.assignedTo && c.assignedTo !== 'unassigned') return false;
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

  const visibleConversations = useMemo(() => {
    return filteredConversations.slice(0, displayLimit);
  }, [filteredConversations, displayLimit]);

  // Counts for filter pills
  const counts = useMemo(() => {
    const all = conversationsList.length;
    const mine = conversationsList.filter((c) => c.assignedTo === 'my_chat').length;
    const unassigned = conversationsList.filter((c) => !c.assignedTo || c.assignedTo === 'unassigned').length;
    return { all, mine, unassigned };
  }, [conversationsList]);

  // Select conversation handler
  const handleSelectConversation = (id: string) => {
    inbox.setActiveConversationId(id);
    if (externalSetActiveConversationId) {
      externalSetActiveConversationId(id);
    }
  };

  // Toggle Bot Pause / CS Takeover
  const handleToggleBot = async () => {
    if (!currentConversation) return;
    const newBotState = !currentConversation.isBotActive;
    const isPaused = !newBotState;
    const nowIso = new Date().toISOString();
    const pausedUntilIso = isPaused ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
    const cleanPhone = (currentConversation.customerPhone || '').replace(/\D/g, '');
    const cleanSlug = resolvedTenant || 'boon';

    try {
      const supabase = getSupabase();
      if (supabase) {
        if (currentConversation.id) {
          await supabase
            .from('conversations')
            .update({
              bot_paused: isPaused,
              bot_mode: newBotState ? 'AI_ACTIVE' : 'HUMAN_ACTIVE',
              updated_at: nowIso,
            })
            .eq('id', currentConversation.id);
        }

        if (cleanPhone) {
          await supabase
            .from('conversation_sessions')
            .upsert({
              tenant_id: cleanSlug,
              session_id: `wa_${cleanSlug}_${cleanPhone}`,
              channel: 'WHATSAPP',
              user_identifier: cleanPhone,
              current_state: isPaused ? 'HANDOVER_TO_HUMAN' : 'ACTIVE',
              is_paused: isPaused,
              paused_at: isPaused ? nowIso : null,
              paused_by: 'admin_command',
              paused_until: pausedUntilIso,
              metadata: {
                manual_toggle: isPaused ? 'PAUSE' : 'RESUME',
                paused_by: 'admin_command',
                paused_at: isPaused ? nowIso : null,
              },
              updated_at: nowIso,
            }, { onConflict: 'tenant_id,user_identifier' });
        }
      }
      await inbox.refreshConversations();
    } catch (e) {
      console.debug('[TeamChat] Sync bot_paused error:', e);
    }
  };

  // Send Manual Reply
  const handleSendLocalMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const textToSend = inbox.replyText.trim() || localReplyText.trim() || (externalReplyText || '').trim();
    if (!textToSend || !currentConversation) return;

    await inbox.handleSendMessage(textToSend);
    setLocalReplyText('');
    if (externalSetReplyText) externalSetReplyText('');
  };

  // Quick POS: Generate QRIS Tagihan Dinamis & Trigger Meta CAPI InitiateCheckout
  const handleGenerateQris = async () => {
    if (!currentConversation) return;
    const num = parseInt(qrisAmount.replace(/[^0-9]/g, ''), 10) || 100000;
    const itemName = qrisItemName.trim() || 'Jasa Video Promosi';
    setIsGeneratingQris(true);
    setQrisFeedback(null);

    try {
      const realOrderId = `ORD-POS-${Date.now().toString().slice(-6)}`;
      const nowIso = new Date().toISOString();

      // 1. Ekstraksi string static QRIS tenant & konversi ke Dynamic QRIS terkunci angka pas
      const rawStaticQris =
        tenantPaymentData?.metadata?.payment_config?.raw_qris_string ||
        tenantPaymentData?.metadata?.emvco_qris?.raw_string ||
        tenantPaymentData?.metadata?.raw_qris_string ||
        tenantPaymentData?.metadata?.qris_static_string ||
        tenantPaymentData?.metadata?.qris_payload ||
        '';

      if (!rawStaticQris) {
        throw new Error('Static QRIS belum dikonfigurasi di data toko. Silakan atur QRIS di Pengaturan Pembayaran terlebih dahulu.');
      }

      const dynamicQrString = generateDynamicQRIS(rawStaticQris, num);

      // 2. Simpan order ke Supabase orders table
      const supabase = getSupabase();
      if (supabase) {
        await supabase.from('orders').insert({
          id: realOrderId,
          tenant_slug: resolvedTenant,
          tenant_id: tenantId || resolvedTenant,
          customer_phone: currentConversation.customerPhone,
          customer_name: currentConversation.customerName || 'Pelanggan',
          product_title: itemName,
          gross_amount: num,
          status: 'PENDING',
          payment_status: 'PENDING',
          order_status: 'PENDING',
          created_at: nowIso,
          updated_at: nowIso,
        });

        // 3. Simpan pesan chat di tabel messages
        const invoiceLink = getStorefrontInvoiceUrl(resolvedTenant, realOrderId);
        const qrisChatText = `🧾 *TAGIHAN QRIS DINAMIS KESEPAKATAN*\n\n` +
          `Halo Kak! Berikut rincian tagihan kesepakatan:\n` +
          `📦 *Layanan / Proyek:* ${itemName}\n` +
          `💰 *Total Nominal:* *Rp ${num.toLocaleString('id-ID')}*\n` +
          `🔖 *No. Pesanan:* ${realOrderId}\n\n` +
          `Barcode QRIS telah dikunci pas otomatis senilai Rp ${num.toLocaleString('id-ID')}.\n` +
          `Buka & cetak invoice resmi Anda:\n` +
          `👉 ${invoiceLink}\n\n` +
          `Silakan scan barcode QRIS atau lakukan pembayaran, lalu kirimkan konfirmasi di sini. Terima kasih! 🙏`;

        await supabase.from('messages').insert({
          conversation_id: currentConversation.id,
          tenant_id: tenantId || resolvedTenant,
          tenant_slug: resolvedTenant,
          sender_type: 'agent',
          sender: 'agent',
          message_body: qrisChatText,
          text: qrisChatText,
          channel: 'whatsapp',
          user_name: activeCsUser?.name ? `${activeCsUser.name} (CS)` : 'Anda (Quick POS)',
          user_phone: currentConversation.customerPhone,
          payload: {
            is_qris: true,
            qris_data: {
              orderId: realOrderId,
              amount: num,
              description: itemName,
              qrValue: dynamicQrString,
              status: 'WAITING_PAYMENT',
            },
          },
          created_at: nowIso,
        });

        await supabase.from('conversations').update({
          last_message: `Tagihan QRIS Rp ${num.toLocaleString('id-ID')} (${realOrderId})`,
          last_message_at: nowIso,
        }).eq('id', currentConversation.id);

        // 4. Outbound dispatch ke WhatsApp pembeli via Evolution API
        try {
          const { data: conn } = await supabase
            .from('whatsapp_connections')
            .select('instance_name, credential_ref')
            .or(`tenant_id.eq.${tenantId || resolvedTenant},tenant_slug.eq.${resolvedTenant}`)
            .eq('status', 'open')
            .maybeSingle();

          if (conn?.instance_name) {
            const { sendEvolutionTextMessage } = await import('@/lib/whatsapp/evolution-webhook-handler');
            await sendEvolutionTextMessage(conn.instance_name, currentConversation.customerPhone, qrisChatText, conn.credential_ref);
          }
        } catch (waErr) {
          console.warn('[Quick POS] Outbound WA QRIS note:', waErr);
        }
      }

      // 5. Trigger Meta CAPI event 'InitiateCheckout' dengan nominal kesepakatan
      try {
        fetch('/api/v1/tracking/capi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantSlug: resolvedTenant,
            eventName: 'InitiateCheckout',
            orderId: realOrderId,
            amount: num,
            customerPhone: currentConversation.customerPhone,
            customerName: currentConversation.customerName,
            contentName: itemName,
          }),
        }).catch((capiErr) => console.warn('[Quick POS] CAPI InitiateCheckout note:', capiErr));
      } catch (triggerErr) {
        console.warn('[Quick POS] CAPI trigger note:', triggerErr);
      }

      await inbox.refreshConversations();
      setQrisFeedback(`✅ Tagihan QRIS Dinamis (${realOrderId}) & CAPI InitiateCheckout terkirim!`);
      setTimeout(() => setQrisFeedback(null), 4000);
    } catch (err: any) {
      setQrisFeedback(`❌ Gagal: ${err.message || 'Error membuat tagihan'}`);
    } finally {
      setIsGeneratingQris(false);
    }
  };

  // Quick POS: Kirim Tagihan Rekening Bank Manual ke Chat & Trigger CAPI InitiateCheckout
  const handleSendBankTransferInfo = async () => {
    if (!currentConversation || bankAccounts.length === 0) return;
    const baseAmt = parseInt(qrisAmount.replace(/[^0-9]/g, ''), 10) || 100000;
    const uniqueCode = Math.floor(1 + Math.random() * 999);
    const totalWithCode = baseAmt + uniqueCode;
    const selectedBank = bankAccounts[selectedBankIdx] || bankAccounts[0];
    const itemName = qrisItemName.trim() || 'Jasa Video Promosi';
    const realOrderId = `ORD-POS-${Date.now().toString().slice(-6)}`;

    setIsSendingBankInfo(true);
    setQrisFeedback(null);

    try {
      const invoiceLink = getStorefrontInvoiceUrl(resolvedTenant, realOrderId);
      const bankText =
        `💳 *TAGIHAN TRANSFER BANK MANUAL*\n\n` +
        `Halo Kak! Berikut rincian tagihan kesepakatan:\n` +
        `📦 *Layanan / Proyek:* ${itemName}\n` +
        `🏦 *Bank:* ${selectedBank.bank_name}\n` +
        `🔢 *No. Rekening:* ${selectedBank.account_number}\n` +
        `👤 *Atas Nama:* ${selectedBank.account_holder}\n\n` +
        `💰 *Total Nominal:* *Rp ${totalWithCode.toLocaleString('id-ID')}*\n` +
        `*(Termasuk 3 digit kode unik transfer: +${uniqueCode})*\n\n` +
        `🔖 *No. Pesanan:* ${realOrderId}\n` +
        `📄 *Invoice Digital:* ${invoiceLink}\n\n` +
        `⚠️ *Penting:* Harap transfer tepat hingga digit terakhir agar verifikasi otomatis berjalan lancar. Kirimkan bukti transfer setelah pembayaran selesai. Terima kasih! 🙏`;

      // Simpan pesanan di tabel orders Supabase
      const supabase = getSupabase();
      if (supabase) {
        const nowIso = new Date().toISOString();
        await supabase.from('orders').insert({
          id: realOrderId,
          order_id: realOrderId,
          invoice_no: realOrderId,
          tenant_slug: resolvedTenant,
          tenant_id: tenantId || resolvedTenant,
          customer_phone: currentConversation.customerPhone,
          customer_name: currentConversation.customerName || 'Pelanggan',
          product_title: itemName,
          gross_amount: totalWithCode,
          total_amount: totalWithCode,
          amount: baseAmt,
          unique_code: uniqueCode,
          payment_method: 'MANUAL_BANK',
          status: 'PENDING',
          payment_status: 'PENDING',
          order_status: 'PENDING',
          created_at: nowIso,
          updated_at: nowIso,
        });

        // Insert pesan chat dengan data bank terstruktur
        await supabase.from('messages').insert({
          conversation_id: currentConversation.id,
          tenant_id: tenantId || resolvedTenant,
          tenant_slug: resolvedTenant,
          sender_type: 'agent',
          sender: 'agent',
          message_body: bankText,
          text: bankText,
          channel: 'whatsapp',
          user_name: activeCsUser?.name ? `${activeCsUser.name} (CS)` : 'Anda (Quick POS)',
          user_phone: currentConversation.customerPhone,
          payload: {
            is_bank_transfer: true,
            bank_data: {
              orderId: realOrderId,
              amount: totalWithCode,
              baseAmount: baseAmt,
              uniqueCode,
              bankName: selectedBank.bank_name,
              accountNumber: selectedBank.account_number,
              accountHolder: selectedBank.account_holder,
              description: itemName,
              status: 'WAITING_PAYMENT',
            },
          },
          created_at: nowIso,
        });

        await supabase.from('conversations').update({
          last_message: `Tagihan Transfer Rp ${totalWithCode.toLocaleString('id-ID')} (${realOrderId})`,
          last_message_at: nowIso,
        }).eq('id', currentConversation.id);

        // Outbound dispatch ke WhatsApp pembeli via Evolution API
        try {
          const { data: conn } = await supabase
            .from('whatsapp_connections')
            .select('instance_name, credential_ref')
            .or(`tenant_id.eq.${tenantId || resolvedTenant},tenant_slug.eq.${resolvedTenant}`)
            .eq('status', 'open')
            .maybeSingle();

          if (conn?.instance_name) {
            const { sendEvolutionTextMessage } = await import('@/lib/whatsapp/evolution-webhook-handler');
            await sendEvolutionTextMessage(conn.instance_name, currentConversation.customerPhone, bankText, conn.credential_ref);
          }
        } catch (waErr) {
          console.warn('[Quick POS] Outbound WA Bank note:', waErr);
        }
      }

      // Trigger Meta CAPI event 'InitiateCheckout'
      try {
        fetch('/api/v1/tracking/capi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantSlug: resolvedTenant,
            eventName: 'InitiateCheckout',
            orderId: realOrderId,
            amount: totalWithCode,
            customerPhone: currentConversation.customerPhone,
            customerName: currentConversation.customerName,
            contentName: itemName,
          }),
        }).catch((capiErr) => console.warn('[Quick POS] CAPI InitiateCheckout bank note:', capiErr));
      } catch (triggerErr) {
        console.warn('[Quick POS] CAPI trigger note:', triggerErr);
      }

      await inbox.refreshConversations();
      setQrisFeedback(`✅ Rekening Bank & Tagihan (${realOrderId}) terkirim ke chat & WA!`);
      setTimeout(() => setQrisFeedback(null), 4000);
    } catch (err: any) {
      setQrisFeedback(`❌ Gagal: ${err.message || 'Error mengirim info rekening'}`);
    } finally {
      setIsSendingBankInfo(false);
    }
  };

  // Manual Transaction: Tandai Lunas & Dispatch Meta CAPI Purchase + WhatsApp Confirmation
  const handleMarkPaid = async (orderId: string) => {
    if (!orderId) return;
    setMarkingPaidOrderId(orderId);
    try {
      const nowIso = new Date().toISOString();
      const supabase = getSupabase();

      // 1. Fetch current order info
      let orderGrossAmount = 0;
      let orderTitle = 'Layanan / Proyek';
      let custPhone = currentConversation?.customerPhone || '';

      if (supabase) {
        const { data: ordRow } = await supabase
          .from('orders')
          .select('gross_amount, product_title, customer_phone, customer_name')
          .eq('id', orderId)
          .maybeSingle();

        if (ordRow) {
          orderGrossAmount = Number(ordRow.gross_amount) || 0;
          orderTitle = ordRow.product_title || orderTitle;
          if (ordRow.customer_phone) custPhone = ordRow.customer_phone;
        }
      }

      // 2. Dispatch to Next.js Quick-Paid route (Updates DB, dispatches Meta CAPI Purchase with EMQ hashing, & sends email)
      try {
        await fetch(
          `/api/v1/tenants/${encodeURIComponent(resolvedTenant)}/orders/${encodeURIComponent(orderId)}/quick-paid`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }
        );
      } catch (qpErr) {
        console.warn('[Mark Paid] Quick-paid dispatch note:', qpErr);
      }

      // 3. Fallback direct dispatch to Meta CAPI Purchase route
      try {
        fetch('/api/v1/tracking/capi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantSlug: resolvedTenant,
            eventName: 'Purchase',
            orderId,
            amount: orderGrossAmount || undefined,
            customerPhone: custPhone,
            customerName: currentConversation?.customerName,
            contentName: orderTitle,
          }),
        }).catch((cErr) => console.warn('[Mark Paid] CAPI Purchase fallback note:', cErr));
      } catch (cErr) {
        console.warn('[Mark Paid] CAPI Purchase trigger note:', cErr);
      }

      // 4. Update Supabase orders table & send WhatsApp confirmation
      if (supabase) {
        await supabase
          .from('orders')
          .update({
            status: 'PAID',
            payment_status: 'PAID',
            order_status: 'COMPLETED',
            paid_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', orderId);

        const invoiceUrl = getStorefrontInvoiceUrl(resolvedTenant, orderId);
        const confirmationText =
          `🎉 *PEMBAYARAN DIVERIFIKASI LUNAS!*\n\n` +
          `Halo Kak! Pembayaran untuk pesanan *#${orderId}* senilai *Rp ${orderGrossAmount.toLocaleString('id-ID')}* telah diverifikasi LUNAS oleh tim CS.\n\n` +
          `📦 *Layanan:* ${orderTitle}\n` +
          `✅ *Status:* LUNAS (PAID)\n` +
          `📄 *Invoice Lunas Resmi:* ${invoiceUrl}\n\n` +
          `Terima kasih banyak atas kerjasamanya! 🙏`;

        await supabase.from('messages').insert({
          conversation_id: currentConversation?.id,
          tenant_id: tenantId || resolvedTenant,
          tenant_slug: resolvedTenant,
          sender_type: 'system',
          sender: 'system',
          message_body: confirmationText,
          text: confirmationText,
          channel: 'whatsapp',
          user_name: 'Sistem BoonTrack',
          created_at: nowIso,
        });

        await supabase.from('conversations').update({
          last_message: `LUNAS: Tagihan ${orderId}`,
          last_message_at: nowIso,
        }).eq('id', currentConversation?.id);

        // Outbound WhatsApp confirmation message via Evolution API
        try {
          const { data: conn } = await supabase
            .from('whatsapp_connections')
            .select('instance_name, credential_ref')
            .or(`tenant_id.eq.${tenantId || resolvedTenant},tenant_slug.eq.${resolvedTenant}`)
            .eq('status', 'open')
            .maybeSingle();

          if (conn?.instance_name && custPhone) {
            const { sendEvolutionTextMessage } = await import('@/lib/whatsapp/evolution-webhook-handler');
            await sendEvolutionTextMessage(conn.instance_name, custPhone, confirmationText, conn.credential_ref);
          }
        } catch (waErr) {
          console.warn('[handleMarkPaid] Outbound WA confirmation note:', waErr);
        }
      }

      await inbox.refreshConversations();
      setQrisFeedback(`✅ Tagihan ${orderId} LUNAS, CAPI Purchase & WA Konfirmasi terkirim!`);
      setTimeout(() => setQrisFeedback(null), 4000);
    } catch (err: any) {
      alert(`Gagal menandai lunas: ${err.message || 'Terjadi kesalahan sistem'}`);
    } finally {
      setMarkingPaidOrderId(null);
    }
  };

  // Fetch live team members from database (Zero Mock)
  const fetchTeamMembers = React.useCallback(async () => {
    const target = resolvedTenant || tenantId;
    if (!target) return;
    try {
      setIsLoadingTeam(true);
      const res = await fetch(`/api/inbox/team-members?tenant=${encodeURIComponent(target)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.teamMembers)) {
          setTeamMembers(data.teamMembers);
          if (data.teamMembers.length > 0 && !targetAgent) {
            setTargetAgent(data.teamMembers[0].name);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load team members:', err);
    } finally {
      setIsLoadingTeam(false);
    }
  }, [resolvedTenant, tenantId, targetAgent]);

  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);

  // Handler for "+ Tambah CS Seat" button per Architecture.md Entitlement Rules
  const handleAddCsSeatClick = () => {
    if (isCheckoutLite || effectiveTier === 'CHECKOUT_LITE' || maxCsQuota === 0) {
      setIsPaywallModalOpen(true);
      return;
    }
    if (teamMembers.length < maxCsQuota) {
      setIsInviteCsModalOpen(true);
    } else {
      setIsPaywallModalOpen(true);
    }
  };

  // Handler for submitting "Undang CS / Tambah Admin" Form
  const handleInviteCsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim()) {
      setInviteError('Nama lengkap CS wajib diisi.');
      return;
    }
    setInviteSubmitting(true);
    setInviteError(null);
    try {
      const res = await fetch('/api/inbox/team-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenantId || resolvedTenant,
          tenantSlug: resolvedTenant,
          name: inviteName.trim(),
          phone: invitePhone.trim() || undefined,
          email: inviteEmail.trim() || undefined,
          accessLevel: inviteAccessLevel,
          role: 'CS',
          planTier: effectiveTier,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.errorCode === 'QUOTA_EXCEEDED') {
          setIsInviteCsModalOpen(false);
          setIsPaywallModalOpen(true);
          return;
        }
        setInviteError(data.message || data.error || 'Gagal menambahkan CS');
        return;
      }

      setInviteSuccess(data.message || '✅ Berhasil menambahkan CS!');
      setInviteName('');
      setInvitePhone('');
      setInviteEmail('');
      await fetchTeamMembers();
      setTimeout(() => {
        setIsInviteCsModalOpen(false);
        setInviteSuccess(null);
      }, 1200);
    } catch (err: any) {
      setInviteError(err.message || 'Terjadi kesalahan sistem saat mendaftarkan CS');
    } finally {
      setInviteSubmitting(false);
    }
  };

  // Transfer Chat to Colleague (Live tenant_users)
  const handleTransferChat = async () => {
    if (!currentConversation) return;
    if (!targetAgent) {
      setTransferFeedback('Pilih CS tujuan terlebih dahulu.');
      return;
    }
    try {
      const supabase = getSupabase();
      if (supabase) {
        const sysMsgText = `Percakapan berhasil dialihkan ke ${targetAgent}.`;
        await supabase.from('messages').insert({
          conversation_id: currentConversation.id,
          tenant_id: tenantId || resolvedTenant,
          tenant_slug: resolvedTenant,
          sender_type: 'system',
          sender: 'system',
          message_body: sysMsgText,
          text: sysMsgText,
          created_at: new Date().toISOString(),
        });
        await supabase.from('conversations').update({
          assigned_agent_name: targetAgent,
          last_message: sysMsgText,
          last_message_at: new Date().toISOString(),
        }).eq('id', currentConversation.id);
      }
    } catch (e) {
      console.warn('[Transfer] Error:', e);
    }
    await inbox.refreshConversations();
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
            {isCheckoutLite ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5 text-amber-500" /> CHECKOUT LITE • 0 SEAT
              </span>
            ) : isTeamScale ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                TEAM SCALE • {teamMembers.length}/{maxCsQuota} CS SEATS
              </span>
            ) : isAdsPerformance ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                ADS PERFORMANCE • {teamMembers.length}/{maxCsQuota} CS SEATS
              </span>
            ) : isSoloOrTrial ? (
              isTrialExpired ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                  <AlertCircle className="w-2.5 h-2.5 text-rose-600" /> TRIAL EXPIRED • 0 HARI
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5 text-amber-600 animate-pulse" /> REVERSE TRIAL ({teamMembers.length}/{maxCsQuota} CS SEATS) • {effectiveDaysLeft !== null ? `${effectiveDaysLeft} HARI TERSISA` : '7 HARI'}
                </span>
              )
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5 text-amber-500" /> TIER SOLO • {teamMembers.length}/{maxCsQuota} SEAT
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Omnichannel WhatsApp CS: antrean chat, thread riwayat, toggle jeda bot, quick POS invoice QRIS, dan transfer agen.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setIsDirectCsLoginOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs active:scale-95"
            title="Login CS Langsung via WhatsApp + PIN (Bypass Magic Link Email)"
          >
            <Headphones className="w-3.5 h-3.5 text-indigo-600" />
            <span>{activeCsUser?.name ? `CS: ${activeCsUser.name}` : 'Login CS Direct'}</span>
          </button>
          <span className="px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Gateway Online</span>
          </span>
          <button
            type="button"
            onClick={handleAddCsSeatClick}
            className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>
              {isCheckoutLite
                ? 'Tambah CS Seat (0/0)'
                : `Tambah CS Seat (${teamMembers.length}/${maxCsQuota})`}
            </span>
          </button>
        </div>
      </div>

      {/* ── CHECKOUT LITE LOCKED BANNER ───────────────────────────────────── */}
      {isCheckoutLite && (
        <div className="w-full p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-amber-950">Fitur Live CS Inbox Terkunci (Paket Checkout Lite)</h3>
              <p className="text-xs text-amber-800 mt-0.5">
                Fitur Live CS Inbox hanya tersedia mulai paket Solo atau Ads Performance. Paket Checkout Lite hanya mendukung link checkout otomatis tanpa omnichannel inbox.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsPaywallModalOpen(true)}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer shrink-0"
          >
            Upgrade Paket Sekarang
          </button>
        </div>
      )}

      {/* ── TRIAL 7 HARI NOTIFICATION BANNER (INBOX WORKSPACE) ─────────────── */}
      {isSoloOrTrial && (
        <div
          className={`w-full px-4 py-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs border ${
            isTrialExpired
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`p-1.5 rounded-lg shrink-0 ${
                isTrialExpired ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {isTrialExpired ? (
                <AlertCircle className="w-4 h-4" />
              ) : (
                <Clock className="w-4 h-4 animate-pulse" />
              )}
            </div>
            <p className="truncate">
              {isTrialExpired ? (
                <span>
                  <strong className="text-rose-700 font-extrabold uppercase">Masa Trial Habis:</strong> Akses live chat CS dan otomasi toko telah berakhir. Upgrade ke Ads Performance untuk membuka kembali gateway CS multi-agent.
                </span>
              ) : (
                <span>
                  <strong>Masa Coba Gratis (Reverse Trial 7 Hari):</strong>{' '}
                  <span className="font-extrabold text-amber-950 font-mono">
                    {effectiveDaysLeft !== null ? `${effectiveDaysLeft} hari tersisa` : '7 hari tersisa'}
                  </span>
                  . Simulasi Live CS, otomasi bot AI, dan quick POS QRIS dapat Anda coba langsung di sini.
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleUpgradeTier?.('ads_performance')}
            className={`px-3 py-1 text-white rounded-xl text-[11px] font-bold shadow-xs transition shrink-0 cursor-pointer flex items-center gap-1 ${
              isTrialExpired ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            <Sparkles className="w-3 h-3 text-yellow-300" />
            <span>{isTrialExpired ? 'Aktivasi Paket Sekarang' : 'Upgrade Ads Performance'}</span>
          </button>
        </div>
      )}

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

            {/* Mode Bot Toko Toggle Banner */}
            {handleToggleTenantBot && (
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-1.5">
                  {isTenantBotPaused ? (
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  )}
                  <span className="text-[10px] font-bold text-slate-700">
                    {isTenantBotPaused ? 'CS Manual (Bot Jeda)' : 'Bot AI Otomatis Aktif'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleTenantBot}
                  className={`px-2 py-0.5 rounded-lg text-[9px] font-bold border transition cursor-pointer ${
                    isTenantBotPaused
                      ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                  }`}
                >
                  {isTenantBotPaused ? 'Aktifkan AI' : 'Jeda Bot (CS)'}
                </button>
              </div>
            )}

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
          <div
            onScroll={(e) => {
              const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
              if (scrollHeight - scrollTop - clientHeight < 300) {
                if (displayLimit < filteredConversations.length) {
                  setDisplayLimit((prev) => Math.min(prev + 60, filteredConversations.length));
                }
              }
            }}
            className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y-0"
          >
            {inbox.isLoadingConversations && conversationsList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-3 my-auto">
                <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
                <p className="text-xs text-slate-500">Menghubungkan ke Inbox Supabase...</p>
              </div>
            ) : conversationsList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-3 my-auto">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-xs">
                  <p className="font-bold text-slate-700 text-xs">Belum ada pesan masuk</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Chat pelanggan WhatsApp toko Anda akan muncul di sini secara otomatis.
                  </p>
                </div>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <MessageSquare className="w-6 h-6 text-slate-300" />
                <p className="font-semibold">Tidak ada chat ditemukan</p>
                <p className="text-[11px] text-slate-400">Ubah filter atau kata kunci pencarian.</p>
              </div>
            ) : (
              <>
                {visibleConversations.map((c) => {
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
              })}
              {filteredConversations.length > visibleConversations.length && (
                <div className="py-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => setDisplayLimit((prev) => Math.min(prev + 100, filteredConversations.length))}
                    className="text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition cursor-pointer"
                  >
                    Muat lebih banyak ({visibleConversations.length} dari {filteredConversations.length.toLocaleString('id-ID')})
                  </button>
                </div>
              )}
            </>
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
                {inbox.isLoadingMessages && messagesList.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2 my-auto">
                    <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
                    <p className="text-[11px] text-slate-400">Memuat riwayat pesan WhatsApp...</p>
                  </div>
                ) : messagesList.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2 my-auto">
                    <MessageSquare className="w-8 h-8 text-slate-300" />
                    <p className="font-semibold text-slate-600">Belum ada riwayat pesan</p>
                    <p className="text-[11px] text-slate-400">Pesan dari pelanggan WhatsApp akan ditampilkan di sini.</p>
                  </div>
                ) : (
                  messagesList.map((msg: ConversationMessage) => {
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
                                      <span>Tandai Pembayaran Lunas / Verify Paid</span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <div className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center gap-1 text-[10px] font-black text-emerald-700">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Terverifikasi Lunas (Synced to Meta CAPI)</span>
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  if (typeof window !== 'undefined' && msg.qrisData?.orderId) {
                                    const invUrl = getStorefrontInvoiceUrl(resolvedTenant, msg.qrisData.orderId);
                                    window.open(invUrl, '_blank', 'noopener,noreferrer');
                                  }
                                }}
                                className="w-full mt-1.5 py-1 px-2.5 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 font-bold text-[10px] rounded-lg transition flex items-center justify-center gap-1 border border-slate-200 hover:border-indigo-200 cursor-pointer"
                                title="Buka Lembar Invoice Resmi (shop.boontrack.com)"
                              >
                                <FileText className="w-3 h-3 text-slate-400" />
                                <span>Lihat &amp; Cetak Invoice Resmi ↗</span>
                              </button>
                            </div>
                          )}

                          {/* Interactive Manual Bank Card Preview inside Chat */}
                          {msg.isBankTransfer && msg.bankData && (
                            <div className="mt-3 p-3 bg-white rounded-xl border border-slate-200 text-slate-900 space-y-2.5 shadow-xs">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                <span className="text-[10px] font-black text-slate-800 flex items-center gap-1">
                                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                                  <span>TAGIHAN REKENING BANK</span>
                                </span>
                                <span
                                  className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                                    msg.bankData.status === 'PAID'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : msg.bankData.status === 'WAITING_CONFIRMATION'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-blue-50 text-blue-700 border-blue-200'
                                  }`}
                                >
                                  {msg.bankData.status === 'PAID'
                                    ? 'LUNAS (PAID)'
                                    : msg.bankData.status === 'WAITING_CONFIRMATION'
                                    ? 'VERIFIKASI BUKTI'
                                    : 'MENUNGGU TRANSFER'}
                                </span>
                              </div>

                              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1 text-xs">
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 text-[10px]">Bank:</span>
                                  <span className="font-bold text-slate-800">{msg.bankData.bankName}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 text-[10px]">No Rekening:</span>
                                  <span className="font-mono font-bold text-indigo-700 text-sm select-all">{msg.bankData.accountNumber}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500 text-[10px]">Atas Nama:</span>
                                  <span className="font-semibold text-slate-700">{msg.bankData.accountHolder}</span>
                                </div>
                                <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                                  <span className="text-slate-500 text-[10px]">Total (+Kode Unik):</span>
                                  <span className="font-extrabold text-emerald-700 text-sm">Rp {msg.bankData.amount.toLocaleString('id-ID')}</span>
                                </div>
                                <div className="text-[9px] text-slate-400 font-mono">Ref: {msg.bankData.orderId}</div>
                              </div>

                              {/* Tombol Aksi Tandai Lunas jika belum dibayar */}
                              {msg.bankData.status !== 'PAID' ? (
                                <button
                                  type="button"
                                  onClick={() => handleMarkPaid(msg.bankData!.orderId)}
                                  disabled={markingPaidOrderId === msg.bankData.orderId}
                                  className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95 disabled:opacity-60"
                                >
                                  {markingPaidOrderId === msg.bankData.orderId ? (
                                    <>
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                      <span>Memverifikasi...</span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Tandai Pembayaran Lunas / Verify Paid</span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <div className="p-1 rounded-lg bg-emerald-100/60 border border-emerald-300 flex items-center justify-center gap-1 text-[10px] font-black text-emerald-800">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Telah Lunas & Terverifikasi</span>
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  if (typeof window !== 'undefined' && msg.bankData?.orderId) {
                                    const invUrl = getStorefrontInvoiceUrl(resolvedTenant, msg.bankData.orderId);
                                    window.open(invUrl, '_blank', 'noopener,noreferrer');
                                  }
                                }}
                                className="w-full mt-1.5 py-1 px-2.5 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-700 font-bold text-[10px] rounded-lg transition flex items-center justify-center gap-1 border border-slate-200 hover:border-blue-200 cursor-pointer"
                                title="Buka Lembar Invoice Resmi (shop.boontrack.com)"
                              >
                                <FileText className="w-3 h-3 text-slate-400" />
                                <span>Lihat &amp; Cetak Invoice Resmi ↗</span>
                              </button>
                            </div>
                          )}

                          {/* Interactive Pin Location Bubble inside Chat */}
                          {msg.isLocation && msg.locationData && (
                            <div className="mt-3 p-3.5 bg-white rounded-xl border border-emerald-200/90 text-slate-900 space-y-3 shadow-xs">
                              {/* Header */}
                              <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-5 h-5 rounded-md bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                                    <MapPin className="w-3.5 h-3.5" />
                                  </div>
                                  <span className="text-[11px] font-black tracking-tight text-slate-900">
                                    PINPOINT LOKASI PEMBELI
                                  </span>
                                </div>
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                  <Navigation className="w-2.5 h-2.5 text-emerald-600 animate-pulse" />
                                  <span>GPS Presisi</span>
                                </span>
                              </div>

                              {/* Stylized Visual Map Card */}
                              <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-emerald-950 via-slate-900 to-teal-950 p-3 text-white border border-emerald-500/20">
                                <div
                                  className="absolute inset-0 opacity-15 pointer-events-none"
                                  style={{
                                    backgroundImage: 'radial-gradient(circle, #34d399 1px, transparent 1px)',
                                    backgroundSize: '12px 12px',
                                  }}
                                />
                                <div className="relative z-10 flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold text-emerald-300 truncate">
                                      {msg.locationData.name || 'Titik Koordinat Pembeli'}
                                    </p>
                                    <p className="text-[10px] text-slate-300 line-clamp-2 mt-0.5 leading-snug">
                                      {msg.locationData.address || `${msg.locationData.latitude}, ${msg.locationData.longitude}`}
                                    </p>
                                    <div className="mt-2 flex items-center flex-wrap gap-1.5">
                                      <span className="text-[9px] font-mono bg-black/50 px-2 py-0.5 rounded border border-white/10 text-emerald-400">
                                        {msg.locationData.latitude.toFixed(5)}, {msg.locationData.longitude.toFixed(5)}
                                      </span>
                                      {msg.locationData.distanceKm !== undefined && (
                                        <span className="text-[9px] font-bold bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-400/30 text-emerald-300">
                                          📏 Jarak: {msg.locationData.distanceKm} km dari Dapur
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="w-8 h-8 rounded-full bg-emerald-500/30 border border-emerald-400/50 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/20">
                                    <MapPin className="w-4 h-4 text-emerald-300 animate-bounce" />
                                  </div>
                                </div>
                              </div>

                              {/* Instant Courier Rates Badge Preview (if available) */}
                              {msg.locationData.rates && msg.locationData.rates.length > 0 && (
                                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                                  <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-wide">
                                    Estimasi Tarif Kurir Instan:
                                  </span>
                                  <div className="grid grid-cols-2 gap-2">
                                    {msg.locationData.rates.map((rate, rIdx) => (
                                      <div key={rIdx} className="p-2 bg-white rounded-lg border border-slate-200 shadow-2xs">
                                        <p className="text-[10px] font-bold text-slate-700 truncate">{rate.courier_name}</p>
                                        <p className="text-xs font-black text-emerald-600 mt-0.5">Rp {rate.price.toLocaleString('id-ID')}</p>
                                        <p className="text-[9px] text-slate-400">{rate.etd}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Action Buttons: Open Maps & Copy */}
                              <div className="flex items-center gap-2 pt-0.5">
                                <a
                                  href={`https://www.google.com/maps?q=${msg.locationData.latitude},${msg.locationData.longitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  <span>Buka di Google Maps</span>
                                </a>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(`${msg.locationData!.latitude},${msg.locationData!.longitude}`);
                                    setCopiedLocationId(msg.id);
                                    setTimeout(() => setCopiedLocationId(null), 2500);
                                  }}
                                  className="py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] rounded-lg transition flex items-center gap-1 cursor-pointer border border-slate-200 active:scale-95"
                                  title="Salin Koordinat Lintang/Bujur"
                                >
                                  {copiedLocationId === msg.id ? (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                      <span className="text-emerald-700 font-bold">Disalin</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                                      <span>Salin GPS</span>
                                    </>
                                  )}
                                </button>
                              </div>
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
                  })
                )}
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
                    onClick={() => {
                      inbox.setReplyText(tpl);
                      setLocalReplyText(tpl);
                      if (externalSetReplyText) externalSetReplyText(tpl);
                    }}
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
                  value={inbox.replyText || localReplyText}
                  onChange={(e) => {
                    inbox.setReplyText(e.target.value);
                    setLocalReplyText(e.target.value);
                    if (externalSetReplyText) externalSetReplyText(e.target.value);
                  }}
                  placeholder="Ketik balasan CS langsung ke pembeli (otomatis menjeda bot)..."
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-indigo-600 transition"
                />
                <button
                  type="submit"
                  disabled={(!inbox.replyText.trim() && !localReplyText.trim()) || inbox.isSending}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{inbox.isSending ? 'Mengirim...' : 'Kirim'}</span>
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

                {/* Metrik CRM Ringkas (Database-Driven, Zero Mock) */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                  <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 block uppercase">Total Order</span>
                    <span className="text-xs font-black text-slate-800">
                      {crmMetrics.isLoading ? '...' : `${crmMetrics.totalOrders} Pesanan`}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 block uppercase">Nilai Belanja</span>
                    <span className="text-xs font-black text-indigo-700">
                      {crmMetrics.isLoading ? '...' : `Rp ${crmMetrics.lifetimeValue.toLocaleString('id-ID')}`}
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

              {/* 2. QUICK POS: TAGIHAN PEMBAYARAN DINAMIS */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    {hasQris && hasNorek ? (
                      <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                    ) : hasQris ? (
                      <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                    ) : hasNorek ? (
                      <Building2 className="w-3.5 h-3.5 text-blue-600" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    <span>Quick POS Billing</span>
                  </span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                    hasQris && hasNorek
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                      : hasQris
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                      : hasNorek
                      ? 'text-blue-700 bg-blue-50 border-blue-200'
                      : 'text-amber-700 bg-amber-50 border-amber-200'
                  }`}>
                    {hasQris && hasNorek
                      ? 'QRIS & Rekening'
                      : hasQris
                      ? 'QRIS Dinamis'
                      : hasNorek
                      ? 'Transfer Bank'
                      : 'Belum Diatur'}
                  </span>
                </div>

                {/* Kondisi 1: BELUM ADA METODE PEMBAYARAN */}
                {!hasQris && !hasNorek ? (
                  <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl space-y-2 text-left">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-amber-900">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Metode Pembayaran Belum Diatur</span>
                    </div>
                    <p className="text-[10px] text-amber-800 leading-relaxed">
                      Toko belum mengonfigurasi QRIS atau rekening bank aktif. Atur metode pembayaran toko di Pengaturan agar CS dapat mengirim tagihan instan ke pelanggan.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== 'undefined') {
                          window.location.href = `/${resolvedTenant}/dashboard?tab=settings`;
                        }
                      }}
                      className="w-full mt-1 py-1.5 px-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] rounded-lg transition text-center shadow-xs cursor-pointer active:scale-95"
                    >
                      Atur metode pembayaran toko di Pengaturan &rarr;
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-[10px] text-slate-500">
                      {hasQris && hasNorek
                        ? 'Pilih metode pembayaran lalu kirim rincian tagihan resmi langsung ke chat pelanggan.'
                        : hasQris
                        ? 'Kirim invoice QRIS dinamis langsung ke chat pelanggan agar bisa langsung di-scan.'
                        : 'Kirim rincian rekening bank dan nominal unik langsung ke chat pelanggan.'}
                    </p>

                    {/* Kondisi 2: KEDUANYA AKTIF -> Tab Switcher */}
                    {hasQris && hasNorek && (
                      <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl gap-1 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => setSelectedBillingTab('qris')}
                          className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition ${
                            selectedBillingTab === 'qris'
                              ? 'bg-white text-indigo-700 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>QRIS Dinamis</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedBillingTab('bank')}
                          className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition ${
                            selectedBillingTab === 'bank'
                              ? 'bg-white text-blue-700 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <Building2 className="w-3.5 h-3.5" />
                          <span>Transfer Bank</span>
                        </button>
                      </div>
                    )}

                    <div className="space-y-2 pt-0.5">
                      {/* Pilihan Rekening Tujuan (Jika mode Transfer Bank aktif) */}
                      {((selectedBillingTab === 'bank' && hasNorek) || (!hasQris && hasNorek)) && (
                        <div>
                          <label className="text-[10px] font-bold text-slate-700 block mb-1">
                            Pilih Rekening Tujuan
                          </label>
                          {bankAccounts.length > 1 ? (
                            <select
                              value={selectedBankIdx}
                              onChange={(e) => setSelectedBankIdx(Number(e.target.value))}
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-blue-600"
                            >
                              {bankAccounts.map((b, idx) => (
                                <option key={idx} value={idx}>
                                  {b.bank_name} - {b.account_number} (a/n {b.account_holder})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="p-2 bg-slate-50 rounded-xl border border-slate-200 text-[10px] text-slate-700">
                              <span className="font-bold block text-blue-700">{bankAccounts[0]?.bank_name}</span>
                              <span className="font-mono font-bold text-slate-900">{bankAccounts[0]?.account_number}</span> &bull; a/n {bankAccounts[0]?.account_holder}
                            </div>
                          )}
                        </div>
                      )}

                      <div>
                        <label className="text-[10px] font-bold text-slate-700 block mb-1">
                          Nama Layanan / Proyek
                        </label>
                        <input
                          type="text"
                          value={qrisItemName}
                          onChange={(e) => setQrisItemName(e.target.value)}
                          placeholder="Jasa Video Promosi"
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-indigo-600"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-700 block mb-1">
                          Nominal Kesepakatan (Rp)
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

                      {/* Tombol Aksi Sesuai Metode Terpilih */}
                      {(selectedBillingTab === 'qris' && hasQris) ? (
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
                      ) : (
                        <button
                          type="button"
                          onClick={handleSendBankTransferInfo}
                          disabled={isSendingBankInfo || !qrisAmount}
                          className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                        >
                          {isSendingBankInfo ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Mengirim Info Rekening...</span>
                            </>
                          ) : (
                            <>
                              <Building2 className="w-3.5 h-3.5" />
                              <span>Kirim Rekening Bank ke Chat</span>
                            </>
                          )}
                        </button>
                      )}

                      {/* Ringkasan & Aksi Cepat Tandai Lunas Tagihan Terakhir (QRIS atau Bank) */}
                      {(() => {
                        const latestBilling = (messagesList || [])
                          .slice()
                          .reverse()
                          .find((m: any) => (m.isQris && m.qrisData) || (m.isBankTransfer && m.bankData));

                        if (!latestBilling) return null;

                        const isQris = Boolean(latestBilling.isQris && latestBilling.qrisData);
                        const bData = isQris ? latestBilling.qrisData : latestBilling.bankData;
                        if (!bData) return null;

                        const isPaid = bData.status === 'PAID';
                        return (
                          <div className="mt-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5 text-left">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-bold text-slate-600 flex items-center gap-1">
                                {isQris ? <QrCode className="w-3 h-3 text-indigo-600" /> : <Building2 className="w-3 h-3 text-blue-600" />}
                                <span>Tagihan Terakhir:</span>
                              </span>
                              <span className={`font-black px-1.5 py-0.2 rounded border text-[9px] ${
                                isPaid
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                {isPaid ? 'LUNAS (PAID)' : 'MENUNGGU BAYAR'}
                              </span>
                            </div>
                            <div className="text-[11px] font-bold text-slate-800 flex justify-between gap-1">
                              <span className="truncate">{bData.description}</span>
                              <span className="text-indigo-700 font-black shrink-0">
                                Rp {bData.amount.toLocaleString('id-ID')}
                              </span>
                            </div>
                            <p className="text-[9px] text-slate-400 font-mono">Ref: {bData.orderId}</p>
                            {!isPaid ? (
                              <button
                                type="button"
                                onClick={() => handleMarkPaid(bData.orderId)}
                                disabled={markingPaidOrderId === bData.orderId}
                                className="w-full mt-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95 disabled:opacity-60"
                              >
                                {markingPaidOrderId === bData.orderId ? (
                                  <>
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    <span>Sinkron CAPI...</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Tandai Pembayaran Lunas / Verify Paid</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <div className="mt-1 p-1 rounded-lg bg-emerald-100/60 border border-emerald-300 flex items-center justify-center gap-1 text-[10px] font-black text-emerald-800">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Telah Lunas & Sinkron CAPI</span>
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                if (typeof window !== 'undefined' && bData.orderId) {
                                  const invUrl = getStorefrontInvoiceUrl(resolvedTenant, bData.orderId);
                                  window.open(invUrl, '_blank', 'noopener,noreferrer');
                                }
                              }}
                              className="w-full mt-1 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                              title="Buka Lembar Invoice Resmi (shop.boontrack.com)"
                            >
                              <FileText className="w-3.5 h-3.5 text-slate-500" />
                              <span>Lihat &amp; Cetak Invoice</span>
                              <ExternalLink className="w-3 h-3 text-slate-400" />
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  </>
                )}
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
                    disabled={teamMembers.length === 0}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-blue-600 cursor-pointer disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    {teamMembers.length === 0 ? (
                      <option value="" disabled>
                        Belum ada rekan CS lain terdaftar
                      </option>
                    ) : (
                      teamMembers.map((member) => (
                        <option key={member.id} value={member.name}>
                          {member.name} ({member.role || 'CS'} - {member.access_level === 'LIVE_CHAT_ONLY' ? 'Live Chat' : 'Admin'})
                        </option>
                      ))
                    )}
                  </select>

                  {transferFeedback && (
                    <div className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold animate-fadeIn">
                      {transferFeedback}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleTransferChat}
                    disabled={teamMembers.length === 0 || !targetAgent}
                    className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
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

      {/* ── MODAL: UNDANG CS / TAMBAH ADMIN ───────────────────────────────── */}
      {isInviteCsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200 text-left">
            <button
              type="button"
              onClick={() => {
                setIsInviteCsModalOpen(false);
                setInviteError(null);
                setInviteSuccess(null);
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
            >
              ✕
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Undang CS / Tambah Admin</h3>
                <p className="text-[11px] text-slate-500">
                  Kursi CS Aktif: <strong>{teamMembers.length}</strong> dari <strong>{maxCsQuota}</strong> kursi ({effectiveTier})
                </p>
              </div>
            </div>

            {inviteError && (
              <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{inviteError}</span>
              </div>
            )}

            {inviteSuccess && (
              <div className="mb-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{inviteSuccess}</span>
              </div>
            )}

            <form onSubmit={handleInviteCsSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Nama Lengkap CS / Rekan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Contoh: Siti Rahmawati"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Nomor WhatsApp CS
                </label>
                <input
                  type="tel"
                  value={invitePhone}
                  onChange={(e) => setInvitePhone(e.target.value)}
                  placeholder="Contoh: 081234567890"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Email Akun CS (Opsional)
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Contoh: cs1@tokomu.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Hak Akses Sistem
                </label>
                <select
                  value={inviteAccessLevel}
                  onChange={(e) => setInviteAccessLevel(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 bg-white focus:outline-none focus:border-indigo-600"
                >
                  <option value="LIVE_CHAT_ONLY">Live Chat CS Only (Khusus melayani obrolan)</option>
                  <option value="FULL_DASHBOARD">Full Dashboard (Chat + Produk + Order)</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsInviteCsModalOpen(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={inviteSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  {inviteSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Daftarkan CS</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: PAYWALL UPGRADE CS SEAT / CHECKOUT LITE ────────────────── */}
      {isPaywallModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200 text-left">
            <button
              type="button"
              onClick={() => setIsPaywallModalOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
            >
              ✕
            </button>

            {/* Case A: CHECKOUT LITE (0 CS SEAT) */}
            {isCheckoutLite || effectiveTier === 'CHECKOUT_LITE' ? (
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
                  <Lock className="w-6 h-6" />
                </div>
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 uppercase tracking-wider">
                    FITUR LIVE CS TERKUNCI
                  </span>
                  <h3 className="text-lg font-black text-slate-900 mt-1">
                    Live CS Inbox Memerlukan Paket Solo / Ads
                  </h3>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    Fitur Live CS Inbox hanya tersedia mulai paket Solo atau Ads Performance. Paket Checkout Lite hanya mendukung checkout form langsung tanpa inbox terpusat.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span><strong>Paket Solo:</strong> 1 CS Seat untuk melayani chat pelanggan.</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span><strong>Paket Ads Performance:</strong> 2 CS Seats Gratis + Otomatis CAPI Meta Ads.</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      handleUpgradeTier('solo');
                      setIsPaywallModalOpen(false);
                    }}
                    className="py-2.5 px-3 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer text-center"
                  >
                    Upgrade Solo (1 CS)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleUpgradeTier('ads_performance');
                      setIsPaywallModalOpen(false);
                    }}
                    className="py-2.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer text-center"
                  >
                    Upgrade Ads (2 CS)
                  </button>
                </div>
              </div>
            ) : effectiveTier === 'TEAM_SCALE' || maxCsQuota >= 5 ? (
              /* Case B: TEAM SCALE (5 CS MAX REACHED) */
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 uppercase tracking-wider">
                    KUOTA MAKSIMAL TERCAPAI
                  </span>
                  <h3 className="text-lg font-black text-slate-900 mt-1">
                    Batas Maksimal 5 CS Seats Tercapai
                  </h3>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    Anda telah memanfaatkan alokasi 5 CS Seats penuh pada paket Team Scale. Butuh tambahan kursi tak terbatas atau arsitektur cluster custom?
                  </p>
                </div>
                <div className="pt-2">
                  <a
                    href="https://wa.me/6285113636165?text=Halo%20Enterprise%20BoonTrack,%20saya%20ingin%20tambah%20kuota%20CS%20Seat%20lebih%20dari%205"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full block py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs text-center transition"
                  >
                    Hubungi Enterprise Support
                  </a>
                </div>
              </div>
            ) : (
              /* Case C: SOLO -> ADS PERFORMANCE, or ADS PERFORMANCE -> TEAM SCALE */
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800 uppercase tracking-wider">
                    KUOTA KURSI CS PENUH
                  </span>
                  <h3 className="text-lg font-black text-slate-900 mt-1">
                    Batas {maxCsQuota} CS Seat Tercapai
                  </h3>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    {maxCsQuota === 1
                      ? 'Paket Solo memiliki kuota 1 CS Seat. Upgrade ke Ads Performance untuk mendapatkan 2 CS Seats Gratis serta sinkronisasi Meta Ads otomatis.'
                      : 'Paket Ads Performance Anda sudah menggunakan 2 CS Seats penuh. Upgrade ke Team Scale untuk membuka hingga 5 CS Seats multi-agen.'}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-700 font-medium">
                    <span>Paket Saat Ini:</span>
                    <span className="font-bold text-slate-900">{effectiveTier} ({teamMembers.length}/{maxCsQuota} Kursi)</span>
                  </div>
                  <div className="flex items-center justify-between text-indigo-700 font-medium">
                    <span>Target Upgrade:</span>
                    <span className="font-bold text-indigo-900">
                      {maxCsQuota === 1 ? 'Ads Performance (2 Kursi)' : 'Team Scale (5 Kursi)'}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleUpgradeTier(maxCsQuota === 1 ? 'ads_performance' : 'team_scale');
                      setIsPaywallModalOpen(false);
                    }}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs text-center transition cursor-pointer active:scale-95"
                  >
                    {maxCsQuota === 1 ? 'Upgrade ke Ads Performance (2 Seats Gratis)' : 'Upgrade ke Team Scale (Hingga 5 Seats)'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Direct CS Login Modal (Bypass Magic Link) */}
      <DirectCsLoginModal
        isOpen={isDirectCsLoginOpen}
        onClose={() => setIsDirectCsLoginOpen(false)}
        tenantSlug={resolvedTenant}
        onSuccess={(csUser) => {
          setActiveCsUser(csUser);
        }}
      />
    </div>
  );
}
