'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Dumbbell,
  Send,
  RefreshCw,
  Search,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Package,
  Brain,
  CreditCard,
  CheckCircle2,
  Save,
  Plus,
  Trash2,
  Building,
  GraduationCap,
  ShieldCheck,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { KNOWN_TENANTS } from '../page';

interface Message {
  id: string | number;
  tenant_id?: string;
  tenant_slug?: string;
  conversation_id?: string;
  channel?: string;
  user_id?: string;
  sender: string;
  text?: string;
  message_text?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any | null;
  created_at: string;
}

interface DatabaseMessage {
  id: string | number;
  tenant_id?: string | null;
  tenant_slug?: string | null;
  conversation_id?: string | null;
  channel?: string | null;
  user_id?: string | null;
  user_phone?: string | null;
  user_name?: string | null;
  sender?: string | null;
  text?: string | null;
  message_text?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any | null;
  created_at: string;
}

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  status: string;
  category?: 'internal' | 'external' | string;
  description?: string;
}

function isMessageForTenant(
  m: DatabaseMessage | Message,
  slug: string,
  tenantDbId?: string
): boolean {
  if (!slug) return false;
  const lowerSlug = slug.toLowerCase();

  const msgTenantId = (m.tenant_id || '').toLowerCase();
  const msgTenantSlug = (m.tenant_slug || '').toLowerCase();

  if (msgTenantSlug === lowerSlug || msgTenantId === lowerSlug) return true;
  if (tenantDbId && (msgTenantId === tenantDbId.toLowerCase() || msgTenantSlug === tenantDbId.toLowerCase())) {
    return true;
  }

  const known = KNOWN_TENANTS[lowerSlug];
  if (known?.aliases) {
    if (known.aliases.some((alias) => alias.toLowerCase() === msgTenantSlug || alias.toLowerCase() === msgTenantId)) {
      return true;
    }
  }

  if (!m.tenant_id && !m.tenant_slug) {
    return true;
  }

  return false;
}

function extractMessageText(m: DatabaseMessage): string {
  if (m.text && typeof m.text === 'string' && m.text.trim().length > 0) {
    return m.text;
  }
  if (m.message_text && typeof m.message_text === 'string' && m.message_text.trim().length > 0) {
    return m.message_text;
  }

  if (m.payload) {
    let p = m.payload;
    if (typeof p === 'string') {
      try {
        p = JSON.parse(p);
      } catch {
        return p;
      }
    }

    if (typeof p === 'object' && p !== null) {
      if (typeof p.text === 'string' && p.text.trim()) return p.text;
      if (typeof p.message === 'string' && p.message.trim()) return p.message;
      if (typeof p.message_text === 'string' && p.message_text.trim()) return p.message_text;
      if (typeof p.body === 'string' && p.body.trim()) return p.body;
      if (typeof p.conversation === 'string' && p.conversation.trim()) return p.conversation;
      if (typeof p.caption === 'string' && p.caption.trim()) return p.caption;

      if (p.text?.body && typeof p.text.body === 'string') return p.text.body;
      if (p.extendedTextMessage?.text && typeof p.extendedTextMessage.text === 'string') return p.extendedTextMessage.text;
      if (p.conversationMessage?.conversation && typeof p.conversationMessage.conversation === 'string') return p.conversationMessage.conversation;
      if (p.messages?.[0]?.text?.body && typeof p.messages[0].text.body === 'string') return p.messages[0].text.body;
      if (p.messages?.[0]?.body && typeof p.messages[0].body === 'string') return p.messages[0].body;
      if (p.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body) {
        return p.entry[0].changes[0].value.messages[0].text.body;
      }
    }
  }

  return m.text || m.message_text || '';
}

function normalizeMessage(m: DatabaseMessage): Message {
  let resolvedUser = m.user_id || m.user_phone;

  if (!resolvedUser && m.payload) {
    let p = m.payload;
    if (typeof p === 'string') {
      try {
        p = JSON.parse(p);
      } catch {
        // ignore
      }
    }
    if (typeof p === 'object' && p !== null) {
      resolvedUser =
        p.from ||
        p.sender ||
        p.phone ||
        p.user_phone ||
        p.user_id ||
        p.messages?.[0]?.from ||
        p.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id ||
        p.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
    }
  }

  if (!resolvedUser) {
    if (m.sender && (m.sender.includes('+') || /\d{8,}/.test(m.sender))) {
      resolvedUser = m.sender;
    } else {
      resolvedUser = m.conversation_id || 'Pengunjung Web';
    }
  }

  let resolvedChannel = m.channel || 'whatsapp';
  if (
    m.sender?.toLowerCase().includes('bot') ||
    m.sender?.toLowerCase().includes('career') ||
    m.sender?.toLowerCase().includes('budi')
  ) {
    resolvedChannel = 'whatsapp';
  }

  const msgText = extractMessageText(m);

  return {
    ...m,
    user_id: resolvedUser,
    channel: resolvedChannel,
    sender: m.sender || 'Unknown',
    message_text: msgText,
    text: m.text ?? (msgText || undefined),
    payload: m.payload ?? null,
    tenant_id: m.tenant_id ?? undefined,
    tenant_slug: m.tenant_slug ?? undefined,
    conversation_id: m.conversation_id ?? undefined,
  };
}

function extractInteractiveButtons(msg: Message, tenantSlug?: string): string[] {
  const buttons: string[] = [];

  if (msg.payload) {
    let p = msg.payload;
    if (typeof p === 'string') {
      try {
        p = JSON.parse(p);
      } catch {
        // ignore
      }
    }

    if (typeof p === 'object' && p !== null) {
      const rawButtons =
        p.interactive?.action?.buttons ||
        p.action?.buttons ||
        p.buttons ||
        p.quick_replies;

      if (Array.isArray(rawButtons)) {
        for (const btn of rawButtons) {
          if (typeof btn === 'string' && btn.trim()) {
            buttons.push(btn.trim());
          } else if (btn?.reply?.title) {
            buttons.push(btn.reply.title);
          } else if (btn?.buttonText?.displayText) {
            buttons.push(btn.buttonText.displayText);
          } else if (btn?.title) {
            buttons.push(btn.title);
          } else if (btn?.text) {
            buttons.push(btn.text);
          } else if (btn?.label) {
            buttons.push(btn.label);
          }
        }
      }

      const sections =
        p.interactive?.action?.sections ||
        p.action?.sections ||
        p.listMessage?.sections ||
        p.sections;

      if (Array.isArray(sections)) {
        for (const sec of sections) {
          if (Array.isArray(sec?.rows)) {
            for (const row of sec.rows) {
              if (row?.title) {
                buttons.push(row.title);
              } else if (typeof row === 'string' && row.trim()) {
                buttons.push(row.trim());
              }
            }
          }
        }
      }
    }
  }

  const isBot =
    msg.sender?.toLowerCase().includes('bot') ||
    msg.sender?.toLowerCase().includes('ai') ||
    msg.sender?.toLowerCase().includes('career') ||
    msg.sender?.toLowerCase().includes('assistant');

  const isWhatsapp =
    msg.channel?.toLowerCase() === 'whatsapp' ||
    msg.sender?.toLowerCase().includes('whatsapp') ||
    (msg.user_id && /^\d+$/.test(msg.user_id));

  if (buttons.length === 0 && isBot && isWhatsapp) {
    const defaultBtns = tenantSlug && KNOWN_TENANTS[tenantSlug.toLowerCase()]?.defaultButtons;
    if (defaultBtns && defaultBtns.length > 0) {
      buttons.push(...defaultBtns);
    }
  }

  return Array.from(new Set(buttons));
}

let csMsgSeq = 0;
function createCsMsgId() {
  csMsgSeq += 1;
  return `local-cs-${csMsgSeq}`;
}

function getIsoTimestamp() {
  return new Date().toISOString();
}

export default function TenantDashboardInboxPage() {
  const params = useParams();
  const tenantSlug = Array.isArray(params?.tenant) ? params.tenant[0] : (params?.tenant as string);
  const meta = tenantSlug ? KNOWN_TENANTS[tenantSlug.toLowerCase()] : undefined;

  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  // Backpanel Tabs & CMS Settings State
  const [activeTab, setActiveTab] = useState<'inbox' | 'catalog' | 'ai_knowledge' | 'integration'>('inbox');
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const [productForm, setProductForm] = useState({
    name: 'Suhu Ads Masterclass 2026 - Full Lifetime Access',
    price: 99000,
    promo_price: 149000,
    variants: 'Format Digital • Video HD + Template Canva',
    promo: 'Diskon 35% Bulan Ini',
    description:
      'Pusat pelatihan Meta Ads praktis untuk media buyer & pebisnis online. Dapatkan strategi scale-up campaign, riset audience, dan optimasi konversi terbukti.',
    download_url: 'https://drive.google.com/drive/folders/suhu-ads-masterclass-2026',
    type: 'digital',
  });

  const [aiForm, setAiForm] = useState({
    ai_name: 'Suhu Ads AI Consultant',
    tone: 'casual',
    system_prompt:
      'Anda adalah asisten konsultan resmi Suhu Ads Masterclass. Berikan informasi silabus, materi video, akses Google Drive materi, dan proses pembayaran instan QRIS.',
    syllabus: [
      'Modul 1: Mindset & Riset Winning Product Meta Ads',
      'Modul 2: Struktur Campaign CBO/ABO & Budgeting Strategy',
      'Modul 3: Creative Angle & Copywriting High-Converting',
      'Modul 4: Scale-Up Campaign & Optimasi Biaya Iklan (ROAS > 4x)',
    ],
    faq: [
      {
        q: 'Apakah materi ini bisa diakses selamanya?',
        a: 'Ya, Anda mendapatkan akses seumur hidup (lifetime access) dan gratis update materi 2026.',
      },
      {
        q: 'Bagaimana cara mengakses file setelah bayar?',
        a: 'Setelah pembayaran QRIS berhasil diverifikasi, sistem otomatis memberikan tautan Google Drive resmi dan link grup diskusi.',
      },
      {
        q: 'Apakah pemula bisa mengikuti materi ini?',
        a: 'Sangat bisa! Materi disusun dari nol, langkah demi langkah dengan panduan praktis.',
      },
    ],
    promo_bundling: 'Beli 2 Kelas Digital Gratis 1 Toolkit Copywriting Siap Pakai.',
  });

  const [bankForm, setBankForm] = useState({
    name: 'BCA (Bank Central Asia)',
    account: '8820199201',
    holder: 'PT BOONTRACK MEDIA DIGITAL',
  });

  const [integrationInfo, setIntegrationInfo] = useState({
    whatsapp_status: 'CONNECTED',
    bot_number: '15556769563',
    webhook_verified: true,
  });

  useEffect(() => {
    if (!tenantSlug) return;
    let isCancelled = false;

    async function loadTenantSettings() {
      try {
        const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && data.success && data.settings) {
            const s = data.settings;
            if (s.product) setProductForm(s.product);
            if (s.ai_knowledge) setAiForm(s.ai_knowledge);
            if (s.bank) setBankForm(s.bank);
            if (s.integration) setIntegrationInfo(s.integration);
          }
        }
      } catch (err) {
        console.warn('Failed to load tenant settings:', err);
      }
    }

    loadTenantSettings();
    return () => {
      isCancelled = true;
    };
  }, [tenantSlug]);

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSaveFeedback(null);
    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productForm),
      });
      const data = await res.json();
      if (data.success) {
        setSaveFeedback('✅ Katalog produk berhasil disimpan!');
      } else {
        setSaveFeedback(`❌ Gagal: ${data.error || 'Terjadi kesalahan'}`);
      }
    } catch {
      setSaveFeedback('❌ Gagal menghubungi server.');
    } finally {
      setSavingSettings(false);
      setTimeout(() => setSaveFeedback(null), 3500);
    }
  };

  const handleSaveAiKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSaveFeedback(null);
    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_knowledge: aiForm,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveFeedback('✅ AI Knowledge & Silabus berhasil diperbarui!');
      } else {
        setSaveFeedback(`❌ Gagal: ${data.error || 'Terjadi kesalahan'}`);
      }
    } catch {
      setSaveFeedback('❌ Gagal menghubungi server.');
    } finally {
      setSavingSettings(false);
      setTimeout(() => setSaveFeedback(null), 3500);
    }
  };

  const handleSaveBankAndIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSaveFeedback(null);
    try {
      const res = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank: bankForm,
          integration: integrationInfo,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveFeedback('✅ Rekening & Integrasi berhasil disimpan!');
      } else {
        setSaveFeedback(`❌ Gagal: ${data.error || 'Terjadi kesalahan'}`);
      }
    } catch {
      setSaveFeedback('❌ Gagal menghubungi server.');
    } finally {
      setSavingSettings(false);
      setTimeout(() => setSaveFeedback(null), 3500);
    }
  };

  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedUserId]);

  useEffect(() => {
    let ignore = false;
    const currentMeta = tenantSlug ? KNOWN_TENANTS[tenantSlug.toLowerCase()] : undefined;
    let currentTenantId: string | undefined;

    async function fetchInitialMessages() {
      if (!tenantSlug) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const supabase = getSupabase();

        // 1. Ambil info tenant
        const { data: tenant, error: tErr } = await supabase
          .from('tenants')
          .select('*')
          .eq('slug', tenantSlug)
          .maybeSingle();

        if (tErr) console.warn('Supabase tenant query error:', tErr);

        if (!ignore) {
          if (tenant) {
            currentTenantId = tenant.id;
            setTenantInfo({
              ...tenant,
              category: tenant.category || currentMeta?.category || 'external',
              description: currentMeta?.description,
            } as TenantInfo);
          } else {
            const fallbackName =
              currentMeta?.name ||
              (tenantSlug === 'om-budi'
                ? 'Om Budi Channel'
                : tenantSlug.replace(/-/g, ' ').toUpperCase());
            setTenantInfo({
              id: tenantSlug,
              name: fallbackName,
              slug: tenantSlug,
              status: 'active',
              category: currentMeta?.category || 'external',
              description: currentMeta?.description,
            });
          }
        }

        // 2. Query data messages
        const query = supabase
          .from('messages')
          .select('*')
          .order('created_at', { ascending: true });

        const { data: messagesData, error: msgErr } = await query;
        if (msgErr) console.error('Supabase messages query error:', msgErr);

        if (!ignore) {
          const rawMessages = (messagesData || []) as DatabaseMessage[];
          const normalizedMsgs: Message[] = rawMessages.map(normalizeMessage);

          const filteredForTenant = normalizedMsgs.filter((m) =>
            isMessageForTenant(m, tenantSlug, tenant?.id)
          );

          setMessages(filteredForTenant);

          if (filteredForTenant.length > 0) {
            const users = Array.from(
              new Set(filteredForTenant.map((m) => m.user_id))
            ).filter(Boolean);
            if (users.length > 0) setSelectedUserId(users[users.length - 1] as string);
          }
        }
      } catch (err: unknown) {
        console.error('Error fetching inbox data:', err);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void fetchInitialMessages();

    const supabase = getSupabase();
    const channel = supabase
      .channel(`realtime-dashboard-${tenantSlug}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new as DatabaseMessage;
          const isMatch = isMessageForTenant(m, tenantSlug, currentTenantId);

          if (isMatch) {
            const newMsg = normalizeMessage(m);
            setMessages((prev) => {
              if (prev.some((p) => String(p.id) === String(newMsg.id))) {
                return prev;
              }
              return [...prev, newMsg];
            });
          }
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, [tenantSlug]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedUserId || !tenantSlug) return;

    setSending(true);
    const content = replyText.trim();
    setReplyText('');

    const newMsg: Message = {
      id: createCsMsgId(),
      tenant_slug: tenantSlug,
      conversation_id: selectedUserId,
      user_id: selectedUserId,
      sender: 'CS / Admin Agent',
      channel: 'webchat',
      text: content,
      message_text: content,
      created_at: getIsoTimestamp(),
    };

    setMessages((prev) => [...prev, newMsg]);

    try {
      const supabase = getSupabase();
      await supabase.from('messages').insert({
        tenant_slug: tenantSlug,
        conversation_id: selectedUserId,
        sender: 'CS / Admin Agent',
        channel: 'webchat',
        text: content,
        message_text: content,
      });
    } catch (err) {
      console.warn('Could not insert reply to DB:', err);
    } finally {
      setSending(false);
    }
  };

  // Filter List Percakapan
  const filteredMessages = messages.filter((m) => {
    const matchChannel =
      selectedChannel === 'all' ||
      m.channel?.toLowerCase() === selectedChannel.toLowerCase();
    const matchQuery = searchQuery
      ? m.user_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.message_text?.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    return matchChannel && matchQuery;
  });

  const uniqueUsers = Array.from(new Set(filteredMessages.map((m) => m.user_id))).filter(Boolean);

  const conversationList = uniqueUsers.map((uid) => {
    const userMsgs = filteredMessages.filter((m) => m.user_id === uid);
    const lastMsg = userMsgs[userMsgs.length - 1];
    return {
      userId: uid as string,
      channel: lastMsg?.channel || 'whatsapp',
      lastMessage: lastMsg?.message_text || '',
      lastTime: lastMsg?.created_at || '',
      total: userMsgs.length,
    };
  });

  const activeMessages = messages.filter((m) => m.user_id === selectedUserId);

  const isSubdomainMode =
    tenantSlug === 'atmosfitnes' ||
    (typeof window !== 'undefined' &&
      (window.location.host.toLowerCase().includes('gym.') ||
        (tenantSlug && window.location.host.toLowerCase().startsWith(`${tenantSlug.toLowerCase()}.`))));

  const publicDemoHref = isSubdomainMode ? '/' : `/${tenantSlug}`;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* Top Navbar */}
      <header className="bg-slate-900/90 border-b border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link
            href={publicDemoHref}
            className="text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 px-3.5 py-1.5 rounded-lg transition inline-flex items-center gap-1.5 font-semibold shadow-sm"
            title="Buka Halaman Publik & Webchat Demo"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Webchat Demo Publik</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </Link>

          {tenantSlug === 'atmosfitnes' && (
            <Link
              href="/gym"
              className="text-xs bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 px-3.5 py-1.5 rounded-lg transition inline-flex items-center gap-1.5 font-semibold shadow-sm shadow-emerald-950"
            >
              <Dumbbell className="w-3.5 h-3.5 text-emerald-400" />
              <span>Gym Control Hub &rarr;</span>
            </Link>
          )}

          <div className="border-l border-slate-800 pl-3">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white">{tenantInfo?.name || meta?.name || tenantSlug}</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Backpanel CMS
              </span>
            </div>
          </div>
        </div>

        {/* Right side of header: Channel filter if inbox, or status */}
        {activeTab === 'inbox' ? (
          <div className="flex items-center gap-1 bg-slate-950 p-1 border border-slate-800 rounded-xl text-xs">
            {['all', 'webchat', 'whatsapp', 'telegram'].map((ch) => {
              const isSelected = selectedChannel === ch;
              return (
                <button
                  key={ch}
                  onClick={() => setSelectedChannel(ch)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {ch === 'all' ? 'Semua Channel' : ch}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live CMS Mode</span>
            </span>
          </div>
        )}
      </header>

      {/* Backpanel Tabs Navigation */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-[57px] z-20 backdrop-blur-md">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('inbox')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'inbox'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>💬 Live Inbox</span>
            {conversationList.length > 0 && (
              <span className="px-1.5 py-0.2 bg-blue-900/80 text-blue-200 rounded text-[10px]">
                {conversationList.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('catalog')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'catalog'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>📦 Katalog Produk</span>
          </button>

          <button
            onClick={() => setActiveTab('ai_knowledge')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'ai_knowledge'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            <span>🧠 AI Knowledge & Persona</span>
          </button>

          <button
            onClick={() => setActiveTab('integration')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'integration'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>💳 Rekening & Integrasi</span>
          </button>
        </div>

        {saveFeedback && (
          <div className="text-xs font-semibold px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-emerald-300 animate-in fade-in">
            {saveFeedback}
          </div>
        )}
      </div>

      {/* TAB 1: Live Omnichannel CS Inbox */}
      {activeTab === 'inbox' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Sesi Chat */}
          <aside className="w-80 md:w-96 border-r border-slate-800 bg-slate-900/40 flex flex-col">
            <div className="p-3 border-b border-slate-800">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Cari user / nomor HP / teks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-700"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
              {loading ? (
                <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                  <span>Memuat daftar percakapan...</span>
                </div>
              ) : conversationList.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                  <MessageSquare className="w-6 h-6 text-slate-600" />
                  <span>Belum ada riwayat pesan untuk tenant ini.</span>
                </div>
              ) : (
                conversationList.map((c) => {
                  const isSelected = selectedUserId === c.userId;
                  const isWa = c.channel.toLowerCase() === 'whatsapp';
                  return (
                    <button
                      key={c.userId}
                      onClick={() => setSelectedUserId(c.userId)}
                      className={`w-full text-left p-3.5 transition flex flex-col gap-1.5 ${
                        isSelected
                          ? 'bg-blue-600/15 border-l-2 border-blue-500'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isWa ? 'bg-emerald-500' : 'bg-blue-500'
                            }`}
                          />
                          <span className="font-semibold text-xs text-white truncate max-w-[150px]">
                            {c.userId}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {c.lastTime
                            ? new Date(c.lastTime).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate line-clamp-1">{c.lastMessage}</p>
                      <div className="flex items-center justify-between pt-0.5">
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {c.channel}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {c.total} pesan
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Area Percakapan Aktif */}
          <section className="flex-1 flex flex-col bg-slate-950">
            {selectedUserId ? (
              <>
                {/* Header Percakapan */}
                <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-xs border border-blue-500/30">
                      {selectedUserId.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-xs font-bold text-white">{selectedUserId}</h2>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Sesi Percakapan Aktif</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stream Bubble Chat */}
                <div className="flex-1 p-5 overflow-y-auto space-y-3.5">
                  {activeMessages.map((m) => {
                    const isUser =
                      m.sender.toLowerCase().includes('user') ||
                      m.sender === selectedUserId ||
                      (!m.sender.toLowerCase().includes('bot') &&
                        !m.sender.toLowerCase().includes('admin') &&
                        !m.sender.toLowerCase().includes('cs') &&
                        !m.sender.toLowerCase().includes('ai'));
                    const isCsAgent =
                      m.sender.toLowerCase().includes('cs') ||
                      m.sender.toLowerCase().includes('admin');

                    const interactiveButtons = extractInteractiveButtons(m, tenantSlug);

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isUser ? 'items-start' : 'items-end'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-400 font-medium">
                          <span>{isCsAgent ? 'Anda (CS Agent)' : m.sender}</span>
                          <span>&bull;</span>
                          <span>
                            {m.created_at
                              ? new Date(m.created_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                          </span>
                        </div>

                        <div
                          className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                            isUser
                              ? 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-sm'
                              : isCsAgent
                              ? 'bg-emerald-600 text-white rounded-tr-sm font-medium shadow-md shadow-emerald-900/30'
                              : 'bg-blue-600 text-white rounded-tr-sm font-medium shadow-md shadow-blue-900/30'
                          }`}
                        >
                          <div>{m.message_text || m.text}</div>

                          {interactiveButtons.length > 0 && (
                            <div className="mt-2.5 pt-2 border-t border-white/20 flex flex-wrap gap-1">
                              {interactiveButtons.map((btnText, bIdx) => (
                                <span
                                  key={bIdx}
                                  className="text-[10px] font-semibold bg-white/20 px-2 py-0.5 rounded-md text-white"
                                >
                                  {btnText}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>

                {/* Balas Pesan Manual (CS Reply Form) */}
                <form
                  onSubmit={handleSendReply}
                  className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center gap-3 shrink-0"
                >
                  <input
                    type="text"
                    placeholder={`Ketik pesan balasan CS ke ${selectedUserId}...`}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={sending || !replyText.trim()}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition shadow-lg shadow-blue-600/20 inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Kirim</span>
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-500 gap-2">
                <MessageSquare className="w-8 h-8 text-slate-600" />
                <span>Pilih salah satu sesi percakapan di panel kiri untuk membalas atau memantau chat.</span>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: Katalog Produk CRUD */}
      {activeTab === 'catalog' && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-400" />
                <span>Katalog Produk & Akses Layanan</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Atur nama produk, harga normal, harga promo, deskripsi penawaran, dan link akses digital.
              </p>
            </div>
            <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
              CRUD Active
            </span>
          </div>

          <form onSubmit={handleSaveProduct} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Form: Basic Data */}
            <div className="space-y-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Nama Produk / Layanan *
                </label>
                <input
                  type="text"
                  required
                  value={productForm.name}
                  onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Contoh: Suhu Ads Masterclass 2026"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">
                    Harga Normal (Rp) *
                  </label>
                  <input
                    type="number"
                    required
                    value={productForm.price}
                    onChange={(e) => setProductForm((p) => ({ ...p, price: Number(e.target.value) }))}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">
                    Harga Promo / Bundling (Rp)
                  </label>
                  <input
                    type="number"
                    value={productForm.promo_price || ''}
                    onChange={(e) => setProductForm((p) => ({ ...p, promo_price: Number(e.target.value) }))}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Varian / Format Akses
                </label>
                <input
                  type="text"
                  value={productForm.variants}
                  onChange={(e) => setProductForm((p) => ({ ...p, variants: e.target.value }))}
                  placeholder="Contoh: Format Digital • Video HD + Template Canva"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Label Promo Singkat
                </label>
                <input
                  type="text"
                  value={productForm.promo}
                  onChange={(e) => setProductForm((p) => ({ ...p, promo: e.target.value }))}
                  placeholder="Contoh: Diskon 35% Bulan Ini"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Right Form: Delivery & Description */}
            <div className="space-y-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">
                    Download URL / Link Akses Drive (Digital Delivery) *
                  </label>
                  <input
                    type="url"
                    value={productForm.download_url}
                    onChange={(e) => setProductForm((p) => ({ ...p, download_url: e.target.value }))}
                    placeholder="https://drive.google.com/..."
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-emerald-400 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Link ini otomatis diberikan ke pembeli saat status pembayaran QRIS sukses diverifikasi.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">
                    Deskripsi Detail Produk & Layanan
                  </label>
                  <textarea
                    rows={5}
                    value={productForm.description}
                    onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Jelaskan kurikulum materi, benefit, dan keunggulan produk Anda..."
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 leading-relaxed"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingSettings ? 'Menyimpan...' : 'Simpan Perubahan Produk'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: AI Knowledge & Persona */}
      {activeTab === 'ai_knowledge' && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Brain className="w-5 h-5 text-indigo-400" />
                <span>AI Knowledge, Silabus & Persona</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Atur silabus modul materi, daftar FAQ otomatis, promo bundling, dan gaya bahasa asisten AI toko.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveAiKnowledge} className="space-y-6">
            {/* Persona & Tone */}
            <div className="p-5 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Gaya Bahasa & Identitas AI
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Nama Asisten AI
                  </label>
                  <input
                    type="text"
                    value={aiForm.ai_name}
                    onChange={(e) => setAiForm((a) => ({ ...a, ai_name: e.target.value }))}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Tone of Voice (Gaya Bahasa)
                  </label>
                  <select
                    value={aiForm.tone}
                    onChange={(e) => setAiForm((a) => ({ ...a, tone: e.target.value }))}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="casual">Santai & Friendly (Casual)</option>
                    <option value="formal">Profesional & Terstruktur (Formal)</option>
                    <option value="energetic">Antusias & Energik (Energetic)</option>
                    <option value="concise">To-the-point & Singkat (Concise)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Instruksi Khusus (System Prompt)
                </label>
                <textarea
                  rows={2}
                  value={aiForm.system_prompt}
                  onChange={(e) => setAiForm((a) => ({ ...a, system_prompt: e.target.value }))}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Silabus Materi */}
            <div className="p-5 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-emerald-400" />
                  <span>Silabus Materi Kursus / Modul Produk</span>
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    setAiForm((a) => ({
                      ...a,
                      syllabus: [...a.syllabus, `Modul ${a.syllabus.length + 1}: Materi Tambahan Baru`],
                    }))
                  }
                  className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Modul</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {aiForm.syllabus.map((mod, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={mod}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAiForm((a) => {
                          const updated = [...a.syllabus];
                          updated[idx] = val;
                          return { ...a, syllabus: updated };
                        });
                      }}
                      className="flex-1 px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setAiForm((a) => ({
                          ...a,
                          syllabus: a.syllabus.filter((_, i) => i !== idx),
                        }))
                      }
                      className="p-2 text-slate-500 hover:text-rose-400 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* FAQ Rules & Promo Bundling */}
            <div className="p-5 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  FAQ Rules (Tanya Jawab Cepat AI)
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    setAiForm((a) => ({
                      ...a,
                      faq: [...a.faq, { q: 'Pertanyaan baru?', a: 'Jawaban penjelasan AI.' }],
                    }))
                  }
                  className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah FAQ</span>
                </button>
              </div>

              <div className="space-y-3">
                {aiForm.faq.map((item, idx) => (
                  <div key={idx} className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        placeholder="Pertanyaan..."
                        value={item.q}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAiForm((a) => {
                            const updated = [...a.faq];
                            updated[idx] = { ...updated[idx], q: val };
                            return { ...a, faq: updated };
                          });
                        }}
                        className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-semibold focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setAiForm((a) => ({
                            ...a,
                            faq: a.faq.filter((_, i) => i !== idx),
                          }))
                        }
                        className="p-1 text-slate-500 hover:text-rose-400 rounded transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Jawaban resmi AI..."
                      value={item.a}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAiForm((a) => {
                          const updated = [...a.faq];
                          updated[idx] = { ...updated[idx], a: val };
                          return { ...a, faq: updated };
                        });
                      }}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-800">
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Aturan Promo Bundling
                </label>
                <input
                  type="text"
                  value={aiForm.promo_bundling}
                  onChange={(e) => setAiForm((a) => ({ ...a, promo_bundling: e.target.value }))}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingSettings}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{savingSettings ? 'Menyimpan...' : 'Simpan AI Knowledge & Silabus'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 4: Rekening & Integrasi */}
      {activeTab === 'integration' && (
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                <span>Rekening Penarikan & Integrasi Gateway</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Kelola rekening tujuan penarikan dana QRIS dan pantau status koneksi WhatsApp Gateway resmi Meta.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveBankAndIntegration} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bank Account */}
            <div className="p-5 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Building className="w-4 h-4 text-emerald-400" />
                <span>Rekening Penarikan Dana (QRIS Settlement)</span>
              </h3>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Nama Bank *
                </label>
                <select
                  value={bankForm.name}
                  onChange={(e) => setBankForm((b) => ({ ...b, name: e.target.value }))}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="BCA (Bank Central Asia)">BCA (Bank Central Asia)</option>
                  <option value="Bank Mandiri">Bank Mandiri</option>
                  <option value="BRI (Bank Rakyat Indonesia)">BRI (Bank Rakyat Indonesia)</option>
                  <option value="BNI (Bank Negara Indonesia)">BNI (Bank Negara Indonesia)</option>
                  <option value="Bank Jago">Bank Jago</option>
                  <option value="Bank Syariah Indonesia (BSI)">Bank Syariah Indonesia (BSI)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Nomor Rekening *
                </label>
                <input
                  type="text"
                  required
                  value={bankForm.account}
                  onChange={(e) => setBankForm((b) => ({ ...b, account: e.target.value }))}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Nama Pemilik Rekening *
                </label>
                <input
                  type="text"
                  required
                  value={bankForm.holder}
                  onChange={(e) => setBankForm((b) => ({ ...b, holder: e.target.value }))}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white uppercase focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* WhatsApp Gateway Integration Status */}
            <div className="p-5 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>WhatsApp Gateway & Meta Cloud API</span>
                </h3>

                <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Status Gateway:</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>CONNECTED</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Nomor Bot Target:</span>
                    <span className="font-mono text-slate-200 font-semibold">
                      +{integrationInfo.bot_number || '15556769563'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Webhook Status:</span>
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Verified 200 OK</span>
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Terintegrasi melalui WhatsApp Business Platform resmi, dengan konfigurasi bisnis mengikuti kebijakan dan persyaratan Meta.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingSettings ? 'Menyimpan...' : 'Simpan Rekening & Integrasi'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
