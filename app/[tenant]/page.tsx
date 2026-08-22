'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabaseClient';

interface Message {
  id: string | number;
  tenant_id: string;
  channel: string;
  user_id: string;
  sender: string;
  message_text: string;
  created_at: string;
}

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export default function TenantInboxPage() {
  const params = useParams();
  const tenantSlug = Array.isArray(params?.tenant) ? params.tenant[0] : (params?.tenant as string);

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

  const loadInboxData = async () => {
    if (!tenantSlug) return;
    try {
      setLoading(true);
      const supabase = getSupabase();

      // 1. Ambil info tenant
      const { data: tenant } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', tenantSlug)
        .maybeSingle();

      if (tenant) {
        setTenantInfo(tenant);
      } else {
        setTenantInfo({
          id: tenantSlug,
          name: tenantSlug.replace(/-/g, ' ').toUpperCase(),
          slug: tenantSlug,
          status: 'active',
        });
      }

      // 2. Ambil data pesan dari Supabase (mencakup slug ataupun ID tenant)
      const { data: messagesData, error: msgErr } = await supabase
        .from('messages')
        .select('*')
        .or(`tenant_id.eq.${tenantSlug},tenant_id.eq.${tenant?.id || tenantSlug}`)
        .order('created_at', { ascending: true });

      if (msgErr) console.error('Supabase query error:', msgErr);

      const loadedMsgs = messagesData || [];
      setMessages(loadedMsgs);

      if (loadedMsgs.length > 0) {
        setSelectedUserId(loadedMsgs[loadedMsgs.length - 1].user_id);
      }
    } catch (err) {
      console.error('Error fetching inbox data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInboxData();

    // Supabase Realtime Listener
    const supabase = getSupabase();
    const channel = supabase
      .channel(`realtime-inbox-${tenantSlug}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new as Message;
          if (
            newMsg.tenant_id === tenantSlug ||
            (tenantInfo && newMsg.tenant_id === tenantInfo.id)
          ) {
            setMessages((prev) => [...prev, newMsg]);
          }
        }
      )
      .subscribe();

    return () => {
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
      userId: uid,
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
          <a
            href="https://boss.boontrack.com/admin"
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition border border-slate-700/60"
          >
            &larr; Super Admin
          </a>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white">{tenantInfo?.name || tenantSlug}</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {tenantSlug}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Live Stream Supabase: Webchat, WhatsApp & Telegram</p>
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
              placeholder="Cari user ID / nomor HP..."
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
              <div className="p-6 text-center text-xs text-slate-500">Memuat log dari database...</div>
            ) : conversationList.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">Belum ada percakapan masuk di channel ini.</div>
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
                    msg.sender?.toLowerCase().includes('boontrack') ||
                    msg.sender?.toLowerCase().includes('assistant');

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
                        {msg.message_text}
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