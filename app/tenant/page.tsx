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

  const [messages, setMessages] = useState<Message[]>([]);
  const [tenantName, setTenantName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantSlug) return;
    const supabase = getSupabase();

    async function loadData() {
      try {
        setLoading(true);
        let resolvedTenantId: string | null = null;

        // 1. Resolve slug ke tenant_id UUID & Nama Tenant
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('id, name')
          .eq('slug', tenantSlug)
          .maybeSingle();

        if (tenantData) {
          resolvedTenantId = tenantData.id;
          setTenantName(tenantData.name);
        } else {
          setTenantName(tenantSlug);
        }

        // 2. Fetch Messages
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

        // 3. Realtime Subscription
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
  }, [tenantSlug]);

  // Kelompokkan per kontak
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

  return (
    <main className="h-screen bg-gray-100 flex flex-col p-4 md:p-6 overflow-hidden">
      <div className="max-w-6xl w-full mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <header className="px-6 py-4 border-b flex justify-between items-center bg-white">
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              {tenantName ? `Inbox: ${tenantName}` : 'BoonTrack Live Inbox'}
            </h1>
            <p className="text-xs text-gray-500">Live Multi-User WhatsApp Stream</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-semibold text-emerald-600">Connected</span>
          </div>
        </header>

        {/* 2 Kolom WhatsApp Web */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Kontak */}
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

          {/* Kolom Chat */}
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