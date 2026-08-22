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
  category?: string;
  access_username?: string;
  access_password?: string;
  monthly_fee?: number;
  due_date?: string | null;
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

  // Auth Client Login State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll ke bawah pesan terbaru
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedUserId]);

  // Cek sesi login klien di sessionStorage
  useEffect(() => {
    if (tenantSlug) {
      const sessionAuth = sessionStorage.getItem(`auth_${tenantSlug}`);
      const isMaster = sessionStorage.getItem('super_admin_auth') === 'true';
      if (sessionAuth === 'true' || isMaster) {
        setIsAuthenticated(true);
      }
    }
  }, [tenantSlug]);

  const fetchTenantData = async () => {
    if (!tenantSlug) return;
    try {
      setLoading(true);
      const supabase = getSupabase();

      // Gunakan camelCase maybeSingle()
      const { data: tenant, error: tenantErr } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', tenantSlug)
        .maybeSingle();

      if (tenantErr) throw tenantErr;

      if (tenant) {
        setTenantInfo(tenant);
      } else {
        // Fallback info jika tenant baru dibuat atau query by slug
        setTenantInfo({
          id: tenantSlug,
          name: tenantSlug.replace(/-/g, ' ').toUpperCase(),
          slug: tenantSlug,
          status: 'active',
          category: tenantSlug.startsWith('boontrack-') ? 'internal' : 'external',
        });
      }

      // Ambil seluruh pesan terkait tenant
      const { data: messagesData, error: msgErr } = await supabase
        .from('messages')
        .select('*')
        .or(`tenant_id.eq.${tenantSlug},tenant_id.eq.${tenant?.id || tenantSlug}`)
        .order('created_at', { ascending: true });

      if (msgErr) throw msgErr;

      setMessages(messagesData || []);

      if (messagesData && messagesData.length > 0 && !selectedUserId) {
        setSelectedUserId(messagesData[messagesData.length - 1].user_id);
      }
    } catch (err) {
      console.error('Error fetching tenant inbox:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchTenantData();

      // Realtime listener Supabase
      const supabase = getSupabase();
      const channel = supabase
        .channel(`inbox-realtime-${tenantSlug}`)
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
    }
  }, [tenantSlug, isAuthenticated]);

  // Handle Login Klien
  const handleClientLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantInfo) return;

    const validUser = tenantInfo.access_username || 'admin';
    const validPass = tenantInfo.access_password || '123456';

    if (usernameInput === validUser && passwordInput === validPass) {
      setIsAuthenticated(true);
      sessionStorage.setItem(`auth_${tenantSlug}`, 'true');
      setAuthError('');
    } else {
      setAuthError('Username atau password klien salah!');
    }
  };

  // Filter percakapan per user
  const uniqueUsers = Array.from(
    new Set(
      messages
        .filter((m) => selectedChannel === 'all' || m.channel === selectedChannel)
        .filter((m) =>
          searchQuery
            ? m.user_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
              m.message_text.toLowerCase().includes(searchQuery.toLowerCase())
            : true
        )
        .map((m) => m.user_id)
    )
  );

  const conversationList = uniqueUsers.map((uid) => {
    const userMsgs = messages.filter((m) => m.user_id === uid);
    const lastMsg = userMsgs[userMsgs.length - 1];
    return {
      userId: uid,
      channel: lastMsg?.channel || 'webchat',
      lastMessage: lastMsg?.message_text || '',
      lastTime: lastMsg?.created_at || '',
      total: userMsgs.length,
    };
  });

  const activeMessages = messages.filter((m) => m.user_id === selectedUserId);

  // Jika belum login & bukan super admin
  if (!isAuthenticated && tenantInfo && tenantInfo.access_password) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-3 font-bold text-lg">
            💬
          </div>
          <h1 className="text-lg font-bold text-white mb-1">{tenantInfo.name || tenantSlug}</h1>
          <p className="text-xs text-slate-400 mb-5">Login ke panel live chat & monitoring komunikasi.</p>

          <form onSubmit={handleClientLogin} className="space-y-3">
            <input
              type="text"
              placeholder="Username"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              required
            />
            {authError && <p className="text-[11px] text-rose-400">{authError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition"
            >
              Masuk ke Inbox
            </button>
          </form>
        </div>
      </main>
    );
  }

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
            <p className="text-[10px] text-slate-400">Multi-Channel Monitoring: Webchat, WhatsApp & Telegram</p>
          </div>
        </div>

        {/* Channel Filter Pills */}
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

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: Conversation Users List */}
        <aside className="w-80 md:w-96 border-r border-slate-800 bg-slate-900/40 flex flex-col">
          {/* Search bar */}
          <div className="p-3 border-b border-slate-800">
            <input
              type="text"
              placeholder="Cari user ID atau teks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-700"
            />
          </div>

          <div className="p-2.5 border-b border-slate-800 flex justify-between text-[11px] text-slate-400 font-medium">
            <span>Sesi Masuk ({conversationList.length})</span>
            <span>Total: {messages.length} Pesan</span>
          </div>

          {/* User List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-500">Memuat riwayat chat...</div>
            ) : conversationList.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">Belum ada percakapan.</div>
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

        {/* Chat Conversation Window */}
        <section className="flex-1 bg-slate-950 flex flex-col justify-between">
          {selectedUserId ? (
            <>
              {/* Active User Header */}
              <div className="px-6 py-3.5 border-b border-slate-800 bg-slate-900/30 flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-bold text-white font-mono flex items-center gap-2">
                    {selectedUserId}
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  </h2>
                  <p className="text-[10px] text-slate-400">Live Chat Stream Supabase</p>
                </div>
              </div>

              {/* Chat Feed */}
              <div className="flex-1 p-6 overflow-y-auto space-y-4">
                {activeMessages.map((msg, idx) => {
                  const isBot =
                    msg.sender.toLowerCase().includes('bot') ||
                    msg.sender.toLowerCase().includes('ai') ||
                    msg.sender.toLowerCase().includes('boontrack');

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
                            : 'bg-blue-600 text-white rounded-tr-sm font-medium shadow-md shadow-blue-900/20'
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