'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Dumbbell } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

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

interface TenantMeta {
  name: string;
  category: 'internal' | 'external';
  description: string;
  defaultButtons: string[];
  aliases: string[];
  verticalHref?: string;
  verticalLabel?: string;
}

export const KNOWN_TENANTS: Record<string, TenantMeta> = {
  'atmosfitnes': {
    name: 'Atmosfitnes Gym Hub',
    category: 'external',
    description: 'Atmosfitnes Gym Member & Guest Support, Gate RFID & POS Cafe',
    defaultButtons: ['Info Membership', 'Jadwal Zumba', 'Cek Gate & NFC', 'POS Cafe'],
    aliases: ['atmosfitnes', 'gym', 'atmosfitnes-south', 'atmosfitnes-hub'],
    verticalHref: '/gym',
    verticalLabel: 'Buka Gym Control Hub',
  },
  'om-budi': {
    name: 'Om Budi Channel',
    category: 'internal',
    description: 'BoonTrack Ecosystem Internal AI Assistant & Multi-Channel Routing',
    defaultButtons: ['Tanya Om Budi', 'Info Layanan', 'Status Bot'],
    aliases: ['om-budi', 'om_budi'],
  },
  'pelayanan-publik': {
    name: 'Pelayanan Publik (Kelurahan Indra)',
    category: 'external',
    description: 'Layanan Aspirasi, Administrasi Surat & Pengaduan Warga Digital',
    defaultButtons: ['Layanan Surat', 'Pengaduan Warga', 'Info Kelurahan', 'Kontak Petugas'],
    aliases: ['pelayanan-publik', 'pelayanan-publik-dummy', 'indra-public', 'indra_public', 'kelurahan-indra', 'indra'],
  },
  'indra-public': {
    name: 'Pelayanan Publik (Kelurahan Indra)',
    category: 'external',
    description: 'Layanan Aspirasi, Administrasi Surat & Pengaduan Warga Digital',
    defaultButtons: ['Layanan Surat', 'Pengaduan Warga', 'Info Kelurahan', 'Kontak Petugas'],
    aliases: ['pelayanan-publik', 'pelayanan-publik-dummy', 'indra-public', 'indra_public', 'kelurahan-indra', 'indra'],
  },
  'bale-pananggeuhan': {
    name: 'Bale Pananggeuhan',
    category: 'external',
    description: 'Reservasi Tempat, Informasi Menu & Layanan Pelanggan Bale Pananggeuhan',
    defaultButtons: ['Reservasi Tempat', 'Katalog Menu', 'Jam Buka', 'Kontak CS'],
    aliases: ['bale-pananggeuhan', 'bale_pananggeuhan', 'bale'],
  },
  'career': {
    name: 'BoonTrack Career AI',
    category: 'internal',
    description: 'Portal Konsultasi Karir, Analisis ATS CV & Simulasi Wawancara HR',
    defaultButtons: ['Job Matcher AI', 'Simulasi HR', 'Negosiasi Gaji', 'Review CV ATS'],
    aliases: ['career', 'boontrack-career', 'career-ai', 'career_service'],
  },
};

function isMessageForTenant(
  m: DatabaseMessage | Message,
  slug: string,
  tenantDbId?: string
): boolean {
  if (!slug) return false;
  const lowerSlug = slug.toLowerCase();

  const msgTenantId = (m.tenant_id || '').toLowerCase();
  const msgTenantSlug = (m.tenant_slug || '').toLowerCase();

  // Direct match with active slug or tenant ID from DB
  if (msgTenantSlug === lowerSlug || msgTenantId === lowerSlug) return true;
  if (tenantDbId && (msgTenantId === tenantDbId.toLowerCase() || msgTenantSlug === tenantDbId.toLowerCase())) {
    return true;
  }

  // Check known aliases
  const known = KNOWN_TENANTS[lowerSlug];
  if (known?.aliases) {
    if (known.aliases.some((alias) => alias.toLowerCase() === msgTenantSlug || alias.toLowerCase() === msgTenantId)) {
      return true;
    }
  }

  // If message has no tenant assigned at all, fallback to display
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

      // WhatsApp Cloud API / Baileys payload formats
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
      resolvedUser = m.conversation_id || 'User Tamu';
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
      // 1. WhatsApp Cloud API / Generic interactive buttons
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

      // 2. WhatsApp Interactive List / Sections
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

      // 3. Direct rows array
      if (Array.isArray(p.rows)) {
        for (const row of p.rows) {
          if (row?.title) {
            buttons.push(row.title);
          } else if (typeof row === 'string' && row.trim()) {
            buttons.push(row.trim());
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

  // If no buttons extracted from payload and sender is WhatsApp Bot, provide tenant default choices
  if (buttons.length === 0 && isBot && isWhatsapp) {
    const defaultBtns = tenantSlug && KNOWN_TENANTS[tenantSlug.toLowerCase()]?.defaultButtons;
    if (defaultBtns && defaultBtns.length > 0) {
      buttons.push(...defaultBtns);
    } else {
      buttons.push('Job Matcher AI', 'Simulasi HR', 'Negosiasi Gaji');
    }
  }

  return Array.from(new Set(buttons));
}

export default function TenantInboxPage() {
  const params = useParams();
  const tenantSlug = Array.isArray(params?.tenant) ? params.tenant[0] : (params?.tenant as string);
  const meta = tenantSlug ? KNOWN_TENANTS[tenantSlug.toLowerCase()] : undefined;

  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(true);

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

          // Filter pesan khusus tenant sesuai slug / tenant_id
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
      .channel(`realtime-inbox-${tenantSlug}`)
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-slate-900/90 border-b border-slate-800 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition border border-slate-700/60"
          >
            &larr; Super Admin
          </Link>
          {meta?.verticalHref && (
            <Link
              href={meta.verticalHref}
              className="text-xs bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 px-3 py-1.5 rounded-lg transition inline-flex items-center gap-1.5 font-semibold shadow-sm shadow-emerald-950"
            >
              <Dumbbell className="w-3.5 h-3.5 text-emerald-400" />
              <span>{meta.verticalLabel || 'Buka Vertical Hub'} &rarr;</span>
            </Link>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white">{tenantInfo?.name || meta?.name || tenantSlug}</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {tenantSlug}
              </span>
              {(tenantInfo?.category || meta?.category) && (
                <span
                  className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                    (tenantInfo?.category || meta?.category) === 'internal'
                      ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                      : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {(tenantInfo?.category || meta?.category) === 'internal' ? 'Internal' : 'Client B2B'}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400">
              {tenantInfo?.description || meta?.description || 'Live Stream Supabase: Webchat, WhatsApp & Telegram'}
            </p>
          </div>
        </div>

        {/* Filter Channel */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 border border-slate-800 rounded-xl text-xs">
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
      </header>

      {/* Konten Utama */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Sesi Chat */}
        <aside className="w-80 md:w-96 border-r border-slate-800 bg-slate-900/40 flex flex-col">
          <div className="p-3 border-b border-slate-800">
            <input
              type="text"
              placeholder="Cari nomor HP / teks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-700"
            />
          </div>

          <div className="p-2.5 border-b border-slate-800 flex justify-between text-[11px] text-slate-400 font-medium">
            <span>Sesi Masuk ({conversationList.length})</span>
            <span>Total: {messages.length} Pesan</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-500">Menghubungkan ke Supabase...</div>
            ) : conversationList.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">Belum ada percakapan terdata.</div>
            ) : (
              conversationList.map((conv) => {
                const isSelected = conv.userId === selectedUserId;
                return (
                  <button
                    key={conv.userId}
                    onClick={() => setSelectedUserId(conv.userId)}
                    className={`w-full text-left p-3.5 transition flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-slate-800/90 text-white border-l-2 border-blue-500'
                        : 'hover:bg-slate-800/30 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-slate-200 truncate max-w-[170px]">
                        {conv.userId}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                          conv.channel === 'whatsapp'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : conv.channel === 'telegram'
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}
                      >
                        {conv.channel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate">{conv.lastMessage}</p>
                    <div className="flex justify-between items-center text-[10px] text-slate-500 mt-1">
                      <span>{conv.total} chat</span>
                      <span>
                        {conv.lastTime
                          ? new Date(conv.lastTime).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Area Dialog Chat */}
        <section className="flex-1 bg-slate-950 flex flex-col justify-between">
          {selectedUserId ? (
            <>
              <div className="px-6 py-3.5 border-b border-slate-800 bg-slate-900/30 flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-bold text-white font-mono flex items-center gap-2">
                    {selectedUserId}
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  </h2>
                  <p className="text-[10px] text-slate-400">Live Chat Stream Supabase</p>
                </div>
              </div>

              <div className="flex-1 p-6 overflow-y-auto space-y-4">
                {activeMessages.map((msg, idx) => {
                  const isBot =
                    msg.sender?.toLowerCase().includes('bot') ||
                    msg.sender?.toLowerCase().includes('ai') ||
                    msg.sender?.toLowerCase().includes('career') ||
                    msg.sender?.toLowerCase().includes('assistant');

                  const interactiveButtons = isBot ? extractInteractiveButtons(msg, tenantSlug) : [];

                  return (
                    <div
                      key={idx}
                      className={`flex flex-col ${isBot ? 'items-start' : 'items-end'}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        <span className="text-[10px] text-slate-400 font-medium">{msg.sender}</span>
                        <span className="text-[9px] text-slate-600">
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div
                        className={`max-w-xl p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                          isBot
                            ? 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-sm shadow-sm'
                            : 'bg-emerald-600 text-white rounded-tr-sm font-medium shadow-md shadow-emerald-900/20'
                        }`}
                      >
                        <div>{msg.message_text}</div>

                        {/* Interactive Buttons / WhatsApp List Options */}
                        {isBot && interactiveButtons.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-col gap-2">
                            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-1.5">
                              <span className="text-xs">⚡</span>
                              <span>Pilihan Interaktif WhatsApp:</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {interactiveButtons.map((btnText, bIdx) => (
                                <div
                                  key={bIdx}
                                  className="inline-flex items-center gap-1.5 bg-slate-950/80 hover:bg-blue-950/70 border border-slate-700/80 hover:border-blue-500/50 text-slate-200 hover:text-blue-300 text-[11px] font-medium px-3 py-1.5 rounded-xl transition shadow-sm select-none"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                  <span>{btnText}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-500 gap-2">
              <span className="text-2xl">💬</span>
              Pilih salah satu nomor / session ID di panel kiri untuk membaca log percakapan.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}