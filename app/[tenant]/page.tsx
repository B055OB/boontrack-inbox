'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabaseClient';

interface Message {
  id: string;
  sender: 'user' | 'bot' | 'agent';
  text: string;
  created_at: string;
  channel?: string;
  user_phone?: string;
  user_name?: string;
  user_id?: string;
}

interface ConversationGroup {
  id: string;
  displayName: string;
  channel: 'whatsapp' | 'telegram' | 'webchat';
  lastMessage: string;
  lastTime: string;
}

export default function TenantInbox() {
  const params = useParams();
  const tenantSlug = (params?.tenant as string) || '';

  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputUser, setInputUser] = useState('');
  const [inputPass, setInputPass] = useState('');
  const [authError, setAuthError] = useState('');
  const [tenantName, setTenantName] = useState('');

  // Chat Data State
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'whatsapp' | 'telegram' | 'webchat'>('all');
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Verifikasi Sesi Klien
  useEffect(() => {
    const savedAuth = sessionStorage.getItem(`auth_${tenantSlug}`);
    if (savedAuth === 'true') {
      setIsAuthenticated(true);
    }
  }, [tenantSlug]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const supabase = getSupabase();
      const { data: tenant, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', tenantSlug)
        .maybe_single();

      if (error || !tenant) {
        setAuthError('Workspace tidak ditemukan.');
        return;
      }

      if (tenant.status !== 'active') {
        setAuthError('Layanan workspace ini sedang dinonaktifkan.');
        return;
      }

      const validUser = tenant.access_username || 'admin';
      const validPass = tenant.access_password || '123456';

      if (inputUser === validUser && inputPass === validPass) {
        setIsAuthenticated(true);
        sessionStorage.setItem(`auth_${tenantSlug}`, 'true');
        setTenantName(tenant.name || tenantSlug);
      } else {
        setAuthError('Username atau password salah.');
      }
    } catch (err: any) {
      setAuthError('Gagal memverifikasi login: ' + err.message);
    }
  };

  // 2. Fetch Messages & Realtime Subscription
  useEffect(() => {
    if (!isAuthenticated || !tenantSlug) return;

    const supabase = getSupabase();

    const fetchAllMessages = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`tenant_id.eq.${tenantSlug},tenant_slug.eq.${tenantSlug}`)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data as Message[]);
        if (data.length > 0 && !selectedUser) {
          const firstUid = data[0].user_phone || data[0].user_id || data[0].sender;
          setSelectedUser(firstUid);
        }
      }
      setLoading(false);
    };

    fetchAllMessages();

    const channel = supabase
      .channel(`tenant-messages-${tenantSlug}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => [...prev, newMsg]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, tenantSlug]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedUser]);

  // 3. Normalisasi & Grouping Percakapan User
  const conversationGroups: { [key: string]: ConversationGroup } = {};
  messages.forEach((m) => {
    const uid = m.user_phone || m.user_id || 'Pengunjung Web';
    const rawChannel = (m.channel || 'whatsapp').toLowerCase();
    const ch: 'whatsapp' | 'telegram' | 'webchat' = 
      rawChannel.includes('tele') ? 'telegram' : rawChannel.includes('web') ? 'webchat' : 'whatsapp';

    if (!conversationGroups[uid]) {
      conversationGroups[uid] = {
        id: uid,
        displayName: m.user_name || uid,
        channel: ch,
        lastMessage: m.text,
        lastTime: new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      };
    } else {
      conversationGroups[uid].lastMessage = m.text;
      conversationGroups[uid].lastTime = new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }
  });

  const allConversations = Object.values(conversationGroups);

  const countAll = allConversations.length;
  const countWa = allConversations.filter((c) => c.channel === 'whatsapp').length;
  const countTele = allConversations.filter((c) => c.channel === 'telegram').length;
  const countWeb = allConversations.filter((c) => c.channel === 'webchat').length;

  const filteredConversations = allConversations.filter((c) => {
    if (activeTab === 'all') return true;
    return c.channel === activeTab;
  });

  const activeConversationMessages = messages.filter((m) => {
    const uid = m.user_phone || m.user_id || 'Pengunjung Web';
    return uid === selectedUser;
  });

  // 4. Kirim Balasan Manual CS
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedUser) return;

    const supabase = getSupabase();
    const textToSend = replyText.trim();
    setReplyText('');

    const activeUserGroup = conversationGroups[selectedUser];
    const targetChannel = activeUserGroup?.channel || 'whatsapp';

    const newReply = {
      tenant_id: tenantSlug,
      tenant_slug: tenantSlug,
      sender: 'agent',
      user_phone: selectedUser,
      user_id: selectedUser,
      channel: targetChannel,
      text: textToSend,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('messages').insert([newReply]);
    if (error) {
      console.error('Gagal kirim pesan balasan:', error);
    }
  };

  const renderChannelBadge = (channel: string) => {
    switch (channel) {
      case 'whatsapp':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">WA</span>;
      case 'telegram':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">TELE</span>;
      case 'webchat':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">WEB</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-300">CHAT</span>;
    }
  };

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
          <div className="text-center mb-5">
            <div className="w-12 h-12 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center mx-auto mb-2 text-xl font-bold">
              💬
            </div>
            <h1 className="text-base font-bold text-white uppercase tracking-wider">{tenantSlug} Inbox</h1>
            <p className="text-xs text-slate-400">Masuk untuk mengelola inbox multi-channel.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Username</label>
              <input
                type="text"
                placeholder="admin"
                value={inputUser}
                onChange={(e) => setInputUser(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Password</label>
              <input
                type="password"
                placeholder="••••••"
                value={inputPass}
                onChange={(e) => setInputPass(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            {authError && <p className="text-[11px] text-rose-400 text-center">{authError}</p>}

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-blue-600/30 mt-2"
            >
              Buka Live Inbox
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      {/* Top Navbar */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/80 px-4 md:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">
            ⚡
          </div>
          <div>
            <h1 className="text-sm font-bold text-white capitalize">{tenantName || tenantSlug}</h1>
            <p className="text-[10px] text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Multi-Channel Active
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            sessionStorage.removeItem(`auth_${tenantSlug}`);
            setIsAuthenticated(false);
          }}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-300 rounded-lg transition"
        >
          Keluar
        </button>
      </header>

      {/* Main Inbox */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-80 md:w-96 border-r border-slate-800 bg-slate-900/40 flex flex-col">
          
          {/* TAB BAR HEADER */}
          <div className="p-3 border-b border-slate-800 bg-slate-950/80">
            <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 gap-1">
              <button
                onClick={() => setActiveTab('all')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold transition flex items-center justify-center gap-1.5 ${
                  activeTab === 'all'
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Semua</span>
                <span className="text-[9px] px-1.5 py-0.5 bg-slate-950 rounded-full font-mono text-slate-300">{countAll}</span>
              </button>

              <button
                onClick={() => setActiveTab('whatsapp')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold transition flex items-center justify-center gap-1.5 ${
                  activeTab === 'whatsapp'
                    ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                <span>WA</span>
                <span className="text-[9px] px-1.5 py-0.5 bg-slate-950 rounded-full font-mono text-emerald-400">{countWa}</span>
              </button>

              <button
                onClick={() => setActiveTab('telegram')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold transition flex items-center justify-center gap-1.5 ${
                  activeTab === 'telegram'
                    ? 'bg-sky-600/20 text-sky-400 border border-sky-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-sky-400'
                }`}
              >
                <span>Tele</span>
                <span className="text-[9px] px-1.5 py-0.5 bg-slate-950 rounded-full font-mono text-sky-400">{countTele}</span>
              </button>

              <button
                onClick={() => setActiveTab('webchat')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold transition flex items-center justify-center gap-1.5 ${
                  activeTab === 'webchat'
                    ? 'bg-purple-600/20 text-purple-400 border border-purple-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-purple-400'
                }`}
              >
                <span>Web</span>
                <span className="text-[9px] px-1.5 py-0.5 bg-slate-950 rounded-full font-mono text-purple-400">{countWeb}</span>
              </button>
            </div>
          </div>

          {/* Contact Lists */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
            {loading ? (
              <div className="p-4 text-center text-xs text-slate-500">Memuat obrolan...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Tidak ada obrolan di tab <strong className="uppercase text-slate-400">{activeTab}</strong>.
              </div>
            ) : (
              filteredConversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedUser(c.id)}
                  className={`p-3.5 cursor-pointer transition flex items-start gap-3 ${
                    selectedUser === c.id ? 'bg-blue-600/10 border-l-2 border-blue-500' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-slate-300 shrink-0">
                    {c.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-white truncate">{c.displayName}</p>
                      <span className="text-[10px] text-slate-500">{c.lastTime}</span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-[11px] text-slate-400 truncate">{c.lastMessage}</p>
                      {renderChannelBadge(c.channel)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Chat Panel */}
        <div className="flex-1 flex flex-col bg-slate-950">
          {selectedUser ? (
            <>
              {/* Header Obrolan Aktif */}
              <div className="h-12 border-b border-slate-800 bg-slate-900/40 px-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-white">{conversationGroups[selectedUser]?.displayName}</span>
                  {renderChannelBadge(conversationGroups[selectedUser]?.channel || 'whatsapp')}
                </div>
                <span className="text-[11px] text-slate-400 font-mono">{selectedUser}</span>
              </div>

              {/* Bubble Chat */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3">
                {activeConversationMessages.map((msg, idx) => {
                  const isIncoming = msg.sender === 'user';
                  const isAgent = msg.sender === 'agent';

                  return (
                    <div
                      key={msg.id || idx}
                      className={`flex flex-col ${isIncoming ? 'items-start' : 'items-end'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-xs ${
                          isIncoming
                            ? 'bg-slate-800 text-white rounded-tl-sm border border-slate-700/60'
                            : isAgent
                            ? 'bg-blue-600 text-white rounded-tr-sm shadow-md shadow-blue-600/20'
                            : 'bg-emerald-700 text-white rounded-tr-sm shadow-md shadow-emerald-700/20'
                        }`}
                      >
                        {!isIncoming && (
                          <div className="text-[9px] font-bold text-slate-200/80 mb-0.5 uppercase tracking-wider">
                            {isAgent ? '👤 CS Human' : '🤖 BoonTrack AI'}
                          </div>
                        )}
                        <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                        <div className="text-[9px] text-right mt-1 opacity-60">
                          {new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendReply} className="p-3 border-t border-slate-800 bg-slate-900/60 flex gap-2">
                <input
                  type="text"
                  placeholder={`Ketik pesan balasan manual CS...`}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-blue-600/30"
                >
                  Kirim
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
              Pilih salah satu kontak di sebelah kiri untuk membaca pesan.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}