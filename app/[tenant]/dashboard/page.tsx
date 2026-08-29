'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Dumbbell,
  Sliders,
  Send,
  RefreshCw,
  Search,
  ExternalLink,
  MessageSquare,
  Sparkles,
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* Top Navbar */}
      <header className="bg-slate-900/90 border-b border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition border border-slate-700/60"
          >
            &larr; Super Admin
          </Link>

          <Link
            href={`/${tenantSlug}`}
            className="text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 px-3 py-1.5 rounded-lg transition inline-flex items-center gap-1.5 font-semibold"
            title="Lihat Halaman Publik & Webchat Demo"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Webchat Demo Publik</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </Link>

          {tenantSlug === 'atmosfitnes' && (
            <Link
              href="/gym"
              className="text-xs bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 px-3 py-1.5 rounded-lg transition inline-flex items-center gap-1.5 font-semibold shadow-sm shadow-emerald-950"
            >
              <Dumbbell className="w-3.5 h-3.5 text-emerald-400" />
              <span>Gym Control Hub &rarr;</span>
            </Link>
          )}

          <Link
            href={`/admin/${tenantSlug}/config`}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg transition inline-flex items-center gap-1.5"
            title="Konfigurasi AI Persona, Jam Operasional & Secrets"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span>Config Editor</span>
          </Link>

          <div className="hidden sm:block border-l border-slate-800 pl-3">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white">{tenantInfo?.name || meta?.name || tenantSlug}</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Dashboard Inbox
              </span>
            </div>
          </div>
        </div>

        {/* Filter Channel */}
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
      </header>

      {/* Konten Utama */}
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

          <div className="p-2.5 border-b border-slate-800 flex justify-between text-[11px] text-slate-400 font-medium">
            <span>Sesi Masuk ({conversationList.length})</span>
            <span>Total: {messages.length} Pesan</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                <span>Menghubungkan ke Supabase...</span>
              </div>
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
        <section className="flex-1 bg-slate-950 flex flex-col justify-between overflow-hidden">
          {selectedUserId ? (
            <>
              <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-xs font-bold text-white font-mono flex items-center gap-2">
                    <span>{selectedUserId}</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  </h2>
                  <p className="text-[10px] text-slate-400">Live Multi-Channel Feed (Supabase Realtime Sync)</p>
                </div>
              </div>

              <div className="flex-1 p-6 overflow-y-auto space-y-4">
                {activeMessages.map((msg, idx) => {
                  const isBot =
                    msg.sender?.toLowerCase().includes('bot') ||
                    msg.sender?.toLowerCase().includes('ai') ||
                    msg.sender?.toLowerCase().includes('career') ||
                    msg.sender?.toLowerCase().includes('assistant');

                  const isCs = msg.sender?.toLowerCase().includes('cs') || msg.sender?.toLowerCase().includes('admin');
                  const isCustomer = !isBot && !isCs;
                  const interactiveButtons = isBot ? extractInteractiveButtons(msg, tenantSlug) : [];

                  return (
                    <div
                      key={idx}
                      className={`flex flex-col ${isCustomer ? 'items-end' : 'items-start'}`}
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
                          isCustomer
                            ? 'bg-blue-600 text-white rounded-tr-sm font-medium shadow-md shadow-blue-900/20'
                            : isCs
                            ? 'bg-emerald-700 text-white rounded-tl-sm font-medium shadow-sm'
                            : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-sm shadow-sm'
                        }`}
                      >
                        <div>{msg.message_text}</div>

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
    </main>
  );
}
