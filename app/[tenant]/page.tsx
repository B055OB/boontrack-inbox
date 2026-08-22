'use client';

import { useEffect, useState } from 'react';
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
  const [loading, setLoading] = useState(true);

  // Ambil data detail tenant dan validasi status
  const fetchTenantData = async () => {
    if (!tenantSlug) return;
    try {
      setLoading(true);
      const supabase = getSupabase();

      // Fix: Menggunakan camelCase maybeSingle()
      const { data: tenant, error: tenantErr } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', tenantSlug)
        .maybeSingle();

      if (tenantErr) throw tenantErr;
      if (tenant) {
        setTenantInfo(tenant);
      } else {
        // Fallback jika tenant slug belum terdaftar di tabel tenants
        setTenantInfo({
          id: tenantSlug,
          name: tenantSlug.replace(/-/g, ' ').toUpperCase(),
          slug: tenantSlug,
          status: 'active',
        });
      }

      // Ambil pesan sesuai tenant slug / id
      const { data: messagesData, error: msgErr } = await supabase
        .from('messages')
        .select('*')
        .or(`tenant_id.eq.${tenantSlug},tenant_id.eq.${tenant?.id || tenantSlug}`)
        .order('created_at', { ascending: true });

      if (msgErr) throw msgErr;

      setMessages(messagesData || []);

      // Auto-select user pertama jika ada
      if (messagesData && messagesData.length > 0 && !selectedUserId) {
        setSelectedUserId(messagesData[messagesData.length - 1].user_id);
      }
    } catch (err) {
      console.error('Error fetching inbox:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenantData();

    // Supabase Realtime Subscription untuk pesan baru
    const supabase = getSupabase();
    const channel = supabase
      .channel(`inbox-${tenantSlug}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.tenant_id === tenantSlug || (tenantInfo && newMsg.tenant_id === tenantInfo.id)) {
            setMessages((prev) => [...prev, newMsg]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantSlug]);

  // Kelompokkan chat per unique user_id
  const userConversations = Array.from(
    new Set(
      messages
        .filter((m) => selectedChannel === 'all' || m.channel === selectedChannel)
        .map((m) => m.user_id)
    )
  ).map((uid) => {
    const userMsgs = messages.filter((m) => m.user_id === uid);
    const lastMsg = userMsgs[userMsgs.length - 1];
    return {
      userId: uid,
      channel: lastMsg?.channel || 'unknown',
      lastMessage: lastMsg?.message_text || '',
      lastTime: lastMsg?.created_at || '',
      messageCount: userMsgs.length,
    };
  });

  const activeMessages = messages.filter((m) => m.user_id === selectedUserId);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Topbar Info */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a
            href="https://boss.boontrack.com/admin"
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition"
          >
            &larr; Super Admin
          </a>
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              {tenantInfo?.name || tenantSlug}
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                {tenantSlug}
              </span>
            </h1>
          </div>
        </div>

        {/* Filter Channel */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 border border-slate-800 rounded-xl text-xs">
          <button
            onClick={() => setSelectedChannel('all')}
            className={`px-3 py-1 rounded-lg transition ${
              selectedChannel === 'all' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Semua Channel
          </button>
          <button
            onClick={() => setSelectedChannel('webchat')}
            className={`px-3 py-1 rounded-lg transition ${
              selectedChannel === 'webchat' ? 'bg-blue-600/30 text-blue-300 font-semibold border border-blue-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Webchat
          </button>
          <button
            onClick={() => setSelectedChannel('whatsapp')}
            className={`px-3 py-1 rounded-lg transition ${
              selectedChannel === 'whatsapp' ? 'bg-emerald-600/30 text-emerald-300 font-semibold border border-emerald-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            WhatsApp
          </button>
          <button
            onClick={() => setSelectedChannel('telegram')}
            className={`px-3 py-1 rounded-lg transition ${
              selectedChannel === 'telegram' ? 'bg-sky-600/30 text-sky-300 font-semibold border border-sky-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Telegram
          </button>
        </div>
      </header>

      {/* Workspace Split: Sidebar User + Chat Feed */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Daftar Sesi Chat */}
        <aside className="w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col">
          <div className="p-3 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Percakapan Aktif ({userConversations.length})
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {loading ? (
              <div className="p-4 text-center text-xs text-slate-500">Memuat percakapan...</div>
            ) : userConversations.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">Belum ada chat masuk.</div>
            ) : (
              userConversations.map((conv) => {
                const isSelected = conv.userId === selectedUserId;
                return (
                  <button
                    key={conv.userId}
                    onClick={() => setSelectedUserId(conv.userId)}
                    className={`w-full text-left p-3.5 transition flex flex-col gap-1 ${
                      isSelected ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/40 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-slate-200 truncate max-w-[160px]">
                        {conv.userId}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-400 uppercase">
                        {conv.channel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate">{conv.lastMessage}</p>
                    <span className="text-[10px] text-slate-500 self-end">
                      {conv.lastTime ? new Date(conv.lastTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Chat Feed Window */}
        <section className="flex-1 bg-slate-950 flex flex-col justify-between">
          {selectedUserId ? (
            <>
              {/* Header Feed */}
              <div className="px-6 py-3 border-b border-slate-800/80 bg-slate-900/30 flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-bold text-white font-mono">{selectedUserId}</h2>
                  <p className="text-[10px] text-slate-400">Log sinkronisasi realtime database Supabase</p>
                </div>
              </div>

              {/* Message List */}
              <div className="flex-1 p-6 overflow-y-auto space-y-4">
                {activeMessages.map((msg, idx) => {
                  const isBot = msg.sender.toLowerCase().includes('bot') || msg.sender.toLowerCase().includes('ai');
                  return (
                    <div
                      key={idx}
                      className={`flex flex-col ${isBot ? 'items-start' : 'items-end'}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] text-slate-400 font-medium">{msg.sender}</span>
                        <span className="text-[9px] text-slate-600">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div
                        className={`max-w-xl p-3.5 rounded-2xl text-xs leading-relaxed ${
                          isBot
                            ? 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-sm'
                            : 'bg-emerald-600 text-white rounded-tr-sm font-medium shadow-md shadow-emerald-900/20'
                        }`}
                      >
                        {msg.message_text}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-600">
              Pilih sesi chat di sebelah kiri untuk memantau dialog percakapan.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}