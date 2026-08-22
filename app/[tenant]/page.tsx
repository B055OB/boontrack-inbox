'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabaseClient';

interface Message {
  id?: string;
  created_at?: string;
  sender?: string;
  text?: string;
  phone_number?: string;
  message?: string;
  tenant_id?: string | null;
  [key: string]: any;
}

export default function TenantInboxPage() {
  const params = useParams();
  const tenantSlug = typeof params?.tenant === 'string' ? params.tenant : '';

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  const [messages, setMessages] = useState<Message[]>([]);
  const [tenantName, setTenantName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  // Cek apakah sudah pernah login di browser ini
  useEffect(() => {
    if (!tenantSlug) return;
    const sessionAuth = sessionStorage.getItem(`auth_${tenantSlug}`);
    if (sessionAuth === 'true') {
      setIsAuthenticated(true);
    }
  }, [tenantSlug]);

  // Handler Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setLoading(true);

    try {
      const supabase = getSupabase();
      const { data: tenantData, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', tenantSlug)
        .maybeSingle();

      if (error || !tenantData) {
        setAuthError('Tenant workspace tidak ditemukan.');
        return;
      }

      // Verifikasi Username & Password
      const validUser = tenantData.access_username || 'admin';
      const validPass = tenantData.access_password || '123456';

      if (usernameInput.trim() === validUser && passwordInput.trim() === validPass) {
        setIsAuthenticated(true);
        sessionStorage.setItem(`auth_${tenantSlug}`, 'true');
      } else {
        setAuthError('Username atau Password salah!');
      }
    } catch (err) {
      setAuthError('Gagal memverifikasi kredensial.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(`auth_${tenantSlug}`);
    setIsAuthenticated(false);
    setMessages([]);
  };

  // Muat Pesan Hanya Jika Sudah Terotentikasi
  useEffect(() => {
    if (!isAuthenticated || !tenantSlug) return;

    const supabase = getSupabase();

    async function loadData() {
      try {
        setLoading(true);
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('id, name')
          .eq('slug', tenantSlug)
          .maybeSingle();

        const resolvedTenantId = tenantData ? tenantData.id : null;
        setTenantName(tenantData ? tenantData.name : tenantSlug);

        // Fetch Messages
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (data) {
          const filtered = data.filter((m: Message) => {
            return (
              m.tenant_id === resolvedTenantId ||
              m.tenant_id === tenantSlug ||
              m.tenant_id === null ||
              m.tenant_id === '00000000-0000-0000-0000-000000000000'
            );
          });
          setMessages(filtered);
        }

        // Realtime Subscription
        const channel = supabase
          .channel(`messages-live-${tenantSlug}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
            },
            (payload) => {
              const newMsg = payload.new as Message;
              if (
                newMsg.tenant_id === resolvedTenantId ||
                newMsg.tenant_id === tenantSlug ||
                newMsg.tenant_id === null ||
                newMsg.tenant_id === '00000000-0000-0000-0000-000000000000'
              ) {
                setMessages((prev) => [...prev, newMsg]);
              }
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      } catch (err) {
        console.error('Error loading inbox:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [isAuthenticated, tenantSlug]);

  const conversations = useMemo(() => {
    const map = new Map<string, { lastMessage: Message; count: number; name: string }>();

    for (const msg of messages) {
      const sender = msg.sender || msg.phone_number || 'Unknown Customer';
      const isBot = sender.toLowerCase().includes('bot') || sender.toLowerCase().includes('assistant');
      const key = isBot ? 'Chat Activity' : sender;

      const existing = map.get(key);
      map.set(key, {
        name: key,
        lastMessage: msg,
        count: (existing?.count || 0) + 1,
      });
    }

    return Array.from(map.values());
  }, [messages]);

  useEffect(() => {
    if (!selectedUser && conversations.length > 0) {
      setSelectedUser(conversations[0].name);
    }
  }, [conversations, selectedUser]);

  const activeChatMessages = useMemo(() => {
    if (!selectedUser || selectedUser === '__ALL__') return messages;
    if (selectedUser === 'Chat Activity') return messages;
    return messages.filter((m) => {
      const sender = m.sender || m.phone_number || '';
      return sender === selectedUser || sender.toLowerCase().includes('bot');
    });
  }, [messages, selectedUser]);

  // JIKA BELUM LOGIN: TAMPILKAN FORM LOGIN
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600/20 text-blue-400 mb-3 font-bold text-lg">
            🔒
          </div>
          <h1 className="text-lg font-bold text-white mb-1">Akses Workspace</h1>
          <p className="text-xs text-slate-400 mb-5">
            Silakan masukkan kredensial untuk membuka inbox <b>{tenantSlug}</b>.
          </p>

          <form onSubmit={handleLogin} className="space-y-3 text-left">
            <div>
              <label className="text-[11px] font-medium text-slate-300 mb-1 block">Username</label>
              <input
                type="text"
                placeholder="Username"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-300 mb-1 block">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            {authError && (
              <p className="text-[11px] text-rose-400 text-center">{authError}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Memverifikasi...' : 'Masuk ke Workspace'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // JIKA SUDAH LOGIN: TAMPILKAN LIVE INBOX
  return (
    <main className="h-screen bg-gray-100 flex flex-col p-4 md:p-6 overflow-hidden">
      <div className="max-w-6xl w-full mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <header className="px-6 py-4 border-b flex justify-between items-center bg-white">
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              {tenantName ? `Inbox: ${tenantName}` : 'BoonTrack Live Inbox'}
            </h1>
            <p className="text-xs text-gray-500">Workspace: {tenantSlug}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-semibold text-emerald-600">Connected</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-300 px-2.5 py-1 rounded-lg transition"
            >
              Keluar
            </button>
          </div>
        </header>

        {/* 2 Kolom WhatsApp Web Layout */}
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-1/3 border-r bg-gray-50 flex flex-col overflow-y-auto">
            <div className="p-3 border-b bg-white">
              <button
                onClick={() => setSelectedUser('__ALL__')}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition ${
                  selectedUser === '__ALL__'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                📋 Tampilkan Semua Pesan ({messages.length})
              </button>
            </div>

            {loading ? (
              <div className="p-6 text-center text-xs text-gray-400">Memuat kontak...</div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-400">Belum ada kontak aktif.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {conversations.map((item) => {
                  const isSelected = selectedUser === item.name;
                  return (
                    <button
                      key={item.name}
                      onClick={() => setSelectedUser(item.name)}
                      className={`w-full text-left p-3.5 transition flex flex-col gap-1 border-l-4 ${
                        isSelected
                          ? 'bg-white border-blue-600 shadow-sm'
                          : 'border-transparent hover:bg-gray-100/80'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-xs text-gray-800 truncate max-w-[140px]">
                          {item.name}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {item.lastMessage.created_at
                            ? new Date(item.lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : ''}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">
                        {item.lastMessage.text || item.lastMessage.message || '(Pesan)'}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <section className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
            <div className="px-5 py-3 border-b bg-white flex justify-between items-center shadow-sm">
              <div>
                <h2 className="text-sm font-bold text-gray-800">
                  {selectedUser === '__ALL__' ? 'Semua Obrolan Masuk' : selectedUser || 'Pilih Kontak'}
                </h2>
                <span className="text-[11px] text-gray-400">
                  {activeChatMessages.length} total bubble interaksi
                </span>
              </div>
            </div>

            <div className="flex-1 p-5 overflow-y-auto space-y-3">
              {loading ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-400">
                  Memuat obrolan...
                </div>
              ) : activeChatMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-400">
                  Belum ada pesan pada obrolan ini.
                </div>
              ) : (
                activeChatMessages.map((msg, idx) => {
                  const sender = msg.sender || msg.phone_number || '';
                  const isBot = sender.toLowerCase().includes('bot') || sender.toLowerCase().includes('assistant');

                  return (
                    <div
                      key={msg.id || idx}
                      className={`flex flex-col ${isBot ? 'items-start' : 'items-end'}`}
                    >
                      <span className="text-[10px] text-gray-400 mb-1 px-1">
                        {sender} • {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-xs shadow-sm whitespace-pre-wrap leading-relaxed ${
                          isBot
                            ? 'bg-white text-gray-800 border border-gray-200 rounded-tl-none'
                            : 'bg-blue-600 text-white rounded-tr-none'
                        }`}
                      >
                        {msg.text || msg.message || '(Pesan kosong)'}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}